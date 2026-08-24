/**
 * Feature: syncing the offline sale queue
 * Subject: pages/OpenSalesOffline.jsx
 *
 * This page is the recovery path for sales taken while the connection was too bad to
 * open them normally, so "Create Open Sale" has to be safe to press. These pin the
 * three ways it wasn't:
 *
 *   - it removed a sale by an index captured before the request, so syncing a second
 *     sale mid-flight wrote back the array the first was still in;
 *   - nothing disabled the button, and a double-click sent the sale twice — now that
 *     a taken invoice number is reallocated rather than refused, that would be two
 *     real sales and the stock deducted twice;
 *   - a reallocated number left the cashier holding a receipt that no longer matches
 *     the sale, with nothing on screen saying so.
 *
 * Ticket 11 adds a shop to all of it, and with it P4 and P5 from that ticket's
 * design: a queued sale syncs to the shop it was TAKEN at, never the one selected
 * now, and the invoice counter resumes ahead of everything already in that shop's
 * queue.
 */
import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fc from "fast-check";
import OpenSalesOffline from "../pages/OpenSalesOffline";
import { clearQueryCache } from "../queryClient";
import { clearSession, setActiveShopId, setSession } from "../utils/session";
import { resetOfflineMigrationLatch } from "../utils/offlineMigration";
import {
  offlineSalesKey,
  offlineCatalogKey,
  offlineNextInvoiceKey,
  OFFLINE_MIGRATION_KEY,
  readJSON,
} from "../utils/storage";

const SHOP_A = 1;
const SHOP_B = 2;

const createOpenSale = vi.fn();
vi.mock("../hooks/useSales", () => ({
  useSaleMutations: () => ({
    createOpenSale: (...args) => createOpenSale(...args),
  }),
}));

const printInvoice = vi.fn();
vi.mock("../utils/printInvoice", () => ({
  printInvoice: (...args) => printInvoice(...args),
}));

const queuedSale = (invoice, shopId = SHOP_A) => ({
  invoice_number: invoice,
  items: [{ type: "item", item_name: "Ariel", price: 50, qty: 1 }],
  customer_name: null,
  date: "2026-01-01T00:00:00.000Z",
  shop_id: shopId,
});

/** A create that resolves only when the test says so. */
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

const ok = (invoice, extra = {}) => ({
  ok: true,
  message: null,
  data: {
    id: 1,
    invoice_number: invoice,
    created_at: "2026-01-02T00:00:00.000Z",
    items: [{ type: "item", item_name: "Ariel", price: 50, qty: 1 }],
    ...extra,
  },
});

const syncButtons = () => screen.getAllByRole("button", { name: /create open sale/i });

const queueInvoices = (shopId = SHOP_A) =>
  readJSON(offlineSalesKey(shopId), []).map((s) => s.invoice_number);

/**
 * A signed-in manager with two branches, and one of them selected.
 *
 * A manager rather than a super admin on purpose: useActiveShop fetches
 * /auth/me for a super admin, and this page is the one surface in the app that
 * must work with nothing reachable.
 */
const signedInAt = (shopId, shops = [{ id: SHOP_A }, { id: SHOP_B }]) => {
  setSession({
    accessToken: "a",
    refreshToken: "r",
    user: { id: 1, name: "Cashier", role: "manager" },
    shops,
  });
  setActiveShopId(shopId);
};

/** A synced catalog for a shop, so the page renders past the "defaults" warning. */
const catalogFor = (shopId, shop = null) =>
  localStorage.setItem(
    offlineCatalogKey(shopId),
    JSON.stringify({
      inventory: [{ id: 1, item_name: "Ariel", price: 50, stock: 10 }],
      services: [],
      shop,
      syncedAt: "2026-01-01T00:00:00.000Z",
    })
  );

beforeEach(() => {
  localStorage.clear();
  clearSession();
  resetOfflineMigrationLatch();
  createOpenSale.mockReset();
  printInvoice.mockReset();
  // Nothing here is testing the migration — offlineMigration.test.js owns that —
  // so mark it done and let these tests speak in namespaced keys throughout.
  localStorage.setItem(OFFLINE_MIGRATION_KEY, "1");
  // What's in the catalog doesn't matter here: these tests act on the queue, not
  // the item grid.
  catalogFor(SHOP_A);
  catalogFor(SHOP_B);
  signedInAt(SHOP_A);
});

afterEach(() => {
  vi.restoreAllMocks();
  clearSession();
  localStorage.clear();
});

describe("syncing the queue", () => {
  it("does not resurrect a sale deleted while another was still syncing", async () => {
    localStorage.setItem(
      offlineSalesKey(SHOP_A),
      JSON.stringify([queuedSale("INV-0001"), queuedSale("INV-0002")])
    );

    const pending = deferred();
    createOpenSale.mockReturnValue(pending.promise);

    render(<OpenSalesOffline />);
    expect(syncButtons()).toHaveLength(2);

    // INV-0001 goes up. While that request is in the air the cashier deletes
    // INV-0002 — so the queue changes under a handler that already captured it.
    fireEvent.click(syncButtons()[0]);

    fireEvent.click(screen.getAllByRole("button", { name: /^delete$/i })[1]);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /yes, delete/i }));
    });
    expect(queueInvoices()).toEqual(["INV-0001"]);

    // Removing INV-0001 has to be measured against the queue as it stands now. It
    // used to be measured against the snapshot, which still held INV-0002 — so
    // finishing the sync wrote the deleted sale back.
    await act(async () => {
      pending.resolve(ok("INV-0001"));
    });

    await waitFor(() => expect(queueInvoices()).toEqual([]));
    expect(screen.queryByText(/INV-0002/)).toBeNull();
  });

  it("sends the sale once when the button is double-clicked", async () => {
    localStorage.setItem(
      offlineSalesKey(SHOP_A),
      JSON.stringify([queuedSale("INV-0001")])
    );

    const pending = deferred();
    createOpenSale.mockReturnValue(pending.promise);

    render(<OpenSalesOffline />);
    const button = syncButtons()[0];

    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);

    expect(createOpenSale).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent(/creating/i);

    await act(async () => {
      pending.resolve(ok("INV-0001"));
    });
    await waitFor(() => expect(queueInvoices()).toEqual([]));
  });

  it("sends the queued number as a request, and drops the sale on success", async () => {
    localStorage.setItem(
      offlineSalesKey(SHOP_A),
      JSON.stringify([queuedSale("INV-0007")])
    );
    createOpenSale.mockResolvedValue(ok("INV-0007"));

    render(<OpenSalesOffline />);
    await act(async () => {
      fireEvent.click(syncButtons()[0]);
    });

    // The whitelist, unchanged — and the shop, which is new. invoice_seq and
    // shop_id are not in the body: the server derives its own sequence, and the
    // shop travels as a header.
    expect(createOpenSale).toHaveBeenCalledWith(
      {
        invoice_number: "INV-0007",
        items: [{ type: "item", item_name: "Ariel", price: 50, qty: 1 }],
        customer_name: null,
      },
      SHOP_A
    );
    await waitFor(() => expect(queueInvoices()).toEqual([]));
    expect(screen.getByRole("status")).toHaveTextContent(/INV-0007.*created/i);
  });

  it("keeps the sale queued when the server rejects it", async () => {
    localStorage.setItem(
      offlineSalesKey(SHOP_A),
      JSON.stringify([queuedSale("INV-0001")])
    );
    createOpenSale.mockResolvedValue({
      ok: false,
      message: "Not enough stock for Ariel",
      data: null,
    });

    render(<OpenSalesOffline />);
    await act(async () => {
      fireEvent.click(syncButtons()[0]);
    });

    expect(queueInvoices()).toEqual(["INV-0001"]);
    expect(screen.getByRole("status")).toHaveTextContent(/still saved offline/i);
  });
});

describe("P4 — a queued sale syncs to its own shop", () => {
  it("sends the shop the sale was taken at, not the one selected now", async () => {
    // The whole reason `shop_id` is stamped at queue time. A cashier can take
    // sales at one branch, drive to the other, and sync there.
    localStorage.setItem(
      offlineSalesKey(SHOP_B),
      JSON.stringify([queuedSale("INV-0004", SHOP_A)])
    );
    signedInAt(SHOP_B);
    createOpenSale.mockResolvedValue(ok("INV-0004"));

    render(<OpenSalesOffline />);
    await act(async () => {
      fireEvent.click(syncButtons()[0]);
    });

    expect(createOpenSale.mock.calls[0][1]).toBe(SHOP_A);
  });

  it("stamps the active shop onto a sale as it is queued", async () => {
    render(<OpenSalesOffline />);

    // CatalogGrid opens on Services; the fixture catalog only has items.
    await act(async () => {
      fireEvent.click(screen.getByRole("tab", { name: /^items$/i }));
    });
    await act(async () => {
      fireEvent.click(screen.getByText("Ariel"));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /view cart/i }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /save offline/i }));
    });

    const [queued] = readJSON(offlineSalesKey(SHOP_A), []);
    expect(queued.shop_id).toBe(SHOP_A);
    expect(queued.invoice_seq).toBe(1);
  });

  it("blocks a sale whose shop is no longer accessible instead of retargeting it", async () => {
    // The one behaviour that would put a customer's money in another branch's
    // books. Shop 9 is not in this session's list at all.
    localStorage.setItem(
      offlineSalesKey(SHOP_A),
      JSON.stringify([queuedSale("INV-0005", 9)])
    );

    render(<OpenSalesOffline />);

    expect(screen.getByRole("note")).toHaveTextContent(/no longer access/i);
    expect(syncButtons()[0]).toBeDisabled();

    fireEvent.click(syncButtons()[0]);
    expect(createOpenSale).not.toHaveBeenCalled();
    expect(queueInvoices()).toEqual(["INV-0005"]);
  });

  it("treats a pre-ticket-11 entry with no shop as belonging to where it is read", async () => {
    const legacyShaped = queuedSale("INV-0006");
    delete legacyShaped.shop_id;
    localStorage.setItem(offlineSalesKey(SHOP_A), JSON.stringify([legacyShaped]));
    createOpenSale.mockResolvedValue(ok("INV-0006"));

    render(<OpenSalesOffline />);
    expect(screen.queryByRole("note")).toBeNull();

    await act(async () => {
      fireEvent.click(syncButtons()[0]);
    });
    expect(createOpenSale.mock.calls[0][1]).toBe(SHOP_A);
  });
});

describe("switching shops", () => {
  it("swaps the queue, and does not carry the previous shop's sales across", async () => {
    localStorage.setItem(
      offlineSalesKey(SHOP_A),
      JSON.stringify([queuedSale("INV-0001", SHOP_A)])
    );

    const { rerender } = render(<OpenSalesOffline />);
    expect(screen.getByText(/INV-0001/)).toBeInTheDocument();

    await act(async () => {
      setActiveShopId(SHOP_B);
    });
    rerender(<OpenSalesOffline />);

    expect(screen.queryByText(/INV-0001/)).toBeNull();
    expect(screen.getByText(/no offline sales yet/i)).toBeInTheDocument();

    // And the shop A queue is untouched on disk — a switch is not a discard.
    expect(queueInvoices(SHOP_A)).toEqual(["INV-0001"]);
  });

  it("brings the queue back on switching back", async () => {
    localStorage.setItem(
      offlineSalesKey(SHOP_A),
      JSON.stringify([queuedSale("INV-0001", SHOP_A)])
    );

    const { rerender } = render(<OpenSalesOffline />);
    await act(async () => {
      setActiveShopId(SHOP_B);
    });
    rerender(<OpenSalesOffline />);
    await act(async () => {
      setActiveShopId(SHOP_A);
    });
    rerender(<OpenSalesOffline />);

    expect(screen.getByText(/INV-0001/)).toBeInTheDocument();
  });

  it("still drops a synced sale from its own shop's queue after a switch mid-flight", async () => {
    // The sync is allowed to finish against the shop the sale was taken at. But
    // the switch re-reads the queue, so the array the handler holds a member of
    // is gone and identity finds nothing. Left unhandled, the sale would sit in
    // shop A's queue having already been created on the server — one press from
    // being sold, and the stock deducted, twice.
    localStorage.setItem(
      offlineSalesKey(SHOP_A),
      JSON.stringify([queuedSale("INV-0001", SHOP_A)])
    );

    const pending = deferred();
    createOpenSale.mockReturnValue(pending.promise);

    const { rerender } = render(<OpenSalesOffline />);
    fireEvent.click(syncButtons()[0]);

    await act(async () => {
      setActiveShopId(SHOP_B);
    });
    rerender(<OpenSalesOffline />);

    await act(async () => {
      pending.resolve(ok("INV-0001"));
    });

    await waitFor(() => expect(queueInvoices(SHOP_A)).toEqual([]));
    expect(createOpenSale.mock.calls[0][1]).toBe(SHOP_A);
  });

  it("does not write the previous shop's queue under the new shop's key", async () => {
    // The salesRef mirror is what makes this a real risk: it outlives the render
    // that filled it, and a delete after a switch writes whatever it holds.
    localStorage.setItem(
      offlineSalesKey(SHOP_A),
      JSON.stringify([queuedSale("INV-0001", SHOP_A)])
    );

    const { rerender } = render(<OpenSalesOffline />);
    await act(async () => {
      setActiveShopId(SHOP_B);
    });
    rerender(<OpenSalesOffline />);

    // Nothing was written under B at all — not an empty array, not A's queue.
    expect(queueInvoices(SHOP_B)).toEqual([]);
    expect(queueInvoices(SHOP_A)).toEqual(["INV-0001"]);
  });
});

describe("the queue is not a cache", () => {
  it("survives clearQueryCache and a sign-out", () => {
    localStorage.setItem(
      offlineSalesKey(SHOP_A),
      JSON.stringify([queuedSale("INV-0001")])
    );

    clearQueryCache();
    expect(queueInvoices()).toEqual(["INV-0001"]);

    // A sale that has not reached the server is the only record of money the
    // shop has taken. Signing out must not be able to destroy it.
    clearSession();
    expect(queueInvoices()).toEqual(["INV-0001"]);
  });
});

describe("where the offline counter starts", () => {
  const shownInvoice = () => screen.getByLabelText(/invoice number/i).value;

  it("resumes from what the online page last saw, once the queue has drained", () => {
    // The bug this replaces: the counter was seeded from the queue alone, and the
    // seeding branch only ran when the queue was non-empty. Sync everything, reload,
    // and it silently restarted at INV-0001 — already taken on the server, so the
    // next sync collided by construction.
    localStorage.setItem(offlineNextInvoiceKey(SHOP_A), JSON.stringify(88));

    render(<OpenSalesOffline />);
    expect(shownInvoice()).toBe("INV-0088");
  });

  it("takes the queue's own maximum when it is further along than the cache", () => {
    localStorage.setItem(offlineNextInvoiceKey(SHOP_A), JSON.stringify(5));
    localStorage.setItem(
      offlineSalesKey(SHOP_A),
      JSON.stringify([queuedSale("INV-0010"), queuedSale("INV-0011")])
    );

    render(<OpenSalesOffline />);
    expect(shownInvoice()).toBe("INV-0012");
  });

  it("falls back to INV-0001 on a device that has never been online", () => {
    render(<OpenSalesOffline />);
    expect(shownInvoice()).toBe("INV-0001");
  });

  it("counts each shop's series separately", () => {
    localStorage.setItem(offlineNextInvoiceKey(SHOP_A), JSON.stringify(88));
    localStorage.setItem(offlineNextInvoiceKey(SHOP_B), JSON.stringify(3));
    signedInAt(SHOP_B);

    render(<OpenSalesOffline />);
    expect(shownInvoice()).toBe("INV-0003");
  });

  it("uses the shop's own prefix from the cached snapshot", () => {
    // Ticket 09 put the prefix in the database. A branch numbering SPN-0001 must
    // not print INV-0001 on a receipt the customer walks out with.
    catalogFor(SHOP_A, { name: "Spincredible", invoice_prefix: "SPN-" });
    localStorage.setItem(offlineNextInvoiceKey(SHOP_A), JSON.stringify(7));

    render(<OpenSalesOffline />);
    expect(shownInvoice()).toBe("SPN-0007");
  });

  it("keeps counting after a prefix change, using the stamped sequence", () => {
    // Without `invoice_seq` on the entry, the queued INV- numbers would stop
    // parsing under the new prefix, the maximum would read 0, and the shop would
    // restart at 1 — colliding with its own history.
    catalogFor(SHOP_A, { name: "Spincredible", invoice_prefix: "SPN-" });
    localStorage.setItem(
      offlineSalesKey(SHOP_A),
      JSON.stringify([{ ...queuedSale("INV-0010"), invoice_seq: 10 }])
    );

    render(<OpenSalesOffline />);
    expect(shownInvoice()).toBe("SPN-0011");
  });

  it("P5 — resumes ahead of everything already in that shop's queue", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 9000 }), { maxLength: 5 }),
        fc.integer({ min: 0, max: 9000 }),
        (seqs, cached) => {
          localStorage.setItem(
            offlineSalesKey(SHOP_A),
            JSON.stringify(
              seqs.map((n) => queuedSale(`INV-${String(n).padStart(4, "0")}`))
            )
          );
          localStorage.setItem(offlineNextInvoiceKey(SHOP_A), JSON.stringify(cached));

          const view = render(<OpenSalesOffline />);
          const shown = Number(shownInvoice().slice(4));
          view.unmount();

          // Strictly greater than every sequence already queued, so the next
          // offline sale cannot collide with one waiting beside it.
          for (const seq of seqs) expect(shown).toBeGreaterThan(seq);
          expect(shown).toBeGreaterThanOrEqual(1);
        }
      ),
      { numRuns: 25 }
    );
  });
});

describe("a reassigned invoice number", () => {
  const renderReassigned = async () => {
    localStorage.setItem(
      offlineSalesKey(SHOP_A),
      JSON.stringify([queuedSale("INV-0003")])
    );
    createOpenSale.mockResolvedValue(
      ok("INV-0087", {
        requested_invoice_number: "INV-0003",
        invoice_reassigned: true,
      })
    );

    render(<OpenSalesOffline />);
    await act(async () => {
      fireEvent.click(syncButtons()[0]);
    });
  };

  it("raises a dialog naming both numbers and asking for a reprint", async () => {
    await renderReassigned();

    // A dialog rather than the status banner: the customer is holding a receipt
    // for a number that now belongs to a different sale, so it has to interrupt.
    const dialog = screen.getByText(/invoice number changed/i).closest("div");
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText(/INV-0003 was already taken/i)).toBeInTheDocument();
    expect(screen.getByText(/opened as INV-0087 instead/i)).toBeInTheDocument();
    expect(screen.getByText(/please reprint the receipt/i)).toBeInTheDocument();
  });

  it("still removes the sale from the queue — it did land on the server", async () => {
    await renderReassigned();
    await waitFor(() => expect(queueInvoices()).toEqual([]));
  });

  it("reprints the server's row, not the queued one, so the new number is on it", async () => {
    await renderReassigned();

    fireEvent.click(screen.getByRole("button", { name: /reprint receipt/i }));

    expect(printInvoice).toHaveBeenCalledTimes(1);
    const printed = printInvoice.mock.calls[0][0];
    expect(printed.invoice_number).toBe("INV-0087");
    expect(printed.created_at).toBe("2026-01-02T00:00:00.000Z");
  });

  it("closes without printing when the cashier dismisses it", async () => {
    await renderReassigned();

    // By text, not by accessible name: the modal's own ✕ is also labelled "Close".
    fireEvent.click(screen.getByText("Close"));

    expect(printInvoice).not.toHaveBeenCalled();
    expect(screen.queryByText(/invoice number changed/i)).toBeNull();
  });
});
