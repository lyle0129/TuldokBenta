/**
 * Feature: migrating the pre-upgrade offline keys into a shop's namespace
 * Subject: utils/offlineMigration.js
 *
 * Properties P1 and P2 from docs/specs/multipos/11-offline-multi-shop/design.md.
 *
 * P1 is the one property in this program whose failure costs the shop money
 * rather than convenience: a device may right now hold an unsynced sale under
 * localStorage["offline_sales"], and that sale is the only record of money the
 * shop has already taken. So P1 is checked exhaustively over the cross product
 * of every legacy state and every target state, not just over a happy path.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fc from "fast-check";
import {
  migrateLegacyOfflineKeys,
  ensureLegacyOfflineMigration,
  resetOfflineMigrationLatch,
} from "../utils/offlineMigration";
import {
  LEGACY_OFFLINE_CATALOG_KEY,
  LEGACY_OFFLINE_NEXT_INVOICE_KEY,
  LEGACY_OFFLINE_SALES_KEY,
  OFFLINE_MIGRATION_KEY,
  SESSION_KEY,
  offlineCatalogKey,
  offlineNextInvoiceKey,
  offlineSalesKey,
} from "../utils/storage";

const SHOP_ONE = 1;

/** The three pairs under test, so every property runs over all of them. */
const PAIRS = [
  [LEGACY_OFFLINE_SALES_KEY, offlineSalesKey],
  [LEGACY_OFFLINE_CATALOG_KEY, offlineCatalogKey],
  [LEGACY_OFFLINE_NEXT_INVOICE_KEY, offlineNextInvoiceKey],
];

/** A queued sale, shaped as the previous build wrote it — no shop_id on it. */
const queuedSale = (invoice) => ({
  invoice_number: invoice,
  items: [{ type: "item", item_name: "Ariel", price: 50, qty: 1 }],
  customer_name: null,
  date: "2026-01-01T00:00:00.000Z",
});

/** Generated queue contents: what a real device's `offline_sales` holds. */
const queue = () =>
  fc
    .array(fc.integer({ min: 1, max: 9999 }), { maxLength: 6 })
    .map((seqs) =>
      seqs.map((n) => queuedSale(`INV-${String(n).padStart(4, "0")}`))
    );

/** Everything this module can touch, as a plain object, for comparing states. */
const snapshot = () => {
  const state = {};
  for (const [legacyKey, namespaced] of PAIRS) {
    state[legacyKey] = localStorage.getItem(legacyKey);
    state[namespaced(SHOP_ONE)] = localStorage.getItem(namespaced(SHOP_ONE));
  }
  state[OFFLINE_MIGRATION_KEY] = localStorage.getItem(OFFLINE_MIGRATION_KEY);
  return state;
};

const session = (shops) =>
  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({
      accessToken: "a",
      refreshToken: "r",
      user: { id: 1, role: "manager" },
      shops,
    })
  );

beforeEach(() => {
  localStorage.clear();
  resetOfflineMigrationLatch();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("P1 — the migration never loses data", () => {
  it("moves a legacy queue into the shop's namespace and drops the old key", () => {
    fc.assert(
      fc.property(queue(), (sales) => {
        localStorage.clear();
        localStorage.setItem(LEGACY_OFFLINE_SALES_KEY, JSON.stringify(sales));

        migrateLegacyOfflineKeys(SHOP_ONE);

        expect(JSON.parse(localStorage.getItem(offlineSalesKey(SHOP_ONE)))).toEqual(
          sales
        );
        expect(localStorage.getItem(LEGACY_OFFLINE_SALES_KEY)).toBeNull();
      })
    );
  });

  it("keeps every sale readable from one key or the other, whatever the starting state", () => {
    // The exhaustive one. Three legacy states by two target states by three
    // keys — every combination a real device can be in, including the two that
    // the naive read-rename-delete gets wrong.
    const legacyStates = ["absent", "parseable", "unparseable"];
    const targetStates = ["empty", "populated"];

    for (const [legacyKey, namespaced] of PAIRS) {
      for (const legacyState of legacyStates) {
        for (const targetState of targetStates) {
          localStorage.clear();
          vi.spyOn(console, "error").mockImplementation(() => {});

          const target = namespaced(SHOP_ONE);
          const legacyValue =
            legacyState === "absent"
              ? null
              : legacyState === "parseable"
                ? JSON.stringify([queuedSale("INV-0001")])
                : "{not json";
          const targetValue =
            targetState === "populated"
              ? JSON.stringify([queuedSale("INV-0500")])
              : null;

          if (legacyValue !== null) localStorage.setItem(legacyKey, legacyValue);
          if (targetValue !== null) localStorage.setItem(target, targetValue);

          migrateLegacyOfflineKeys(SHOP_ONE);

          const where = `${legacyKey} ${legacyState}/${targetState}`;
          const readable = [
            localStorage.getItem(legacyKey),
            localStorage.getItem(target),
          ];

          // Nothing that existed before has stopped existing.
          if (legacyValue !== null) expect(readable, where).toContain(legacyValue);
          if (targetValue !== null) expect(readable, where).toContain(targetValue);

          // And the specific shapes, so a "both copies kept" pass cannot hide a
          // migration that never actually moved anything.
          if (legacyState === "parseable" && targetState === "empty") {
            expect(localStorage.getItem(target), where).toBe(legacyValue);
            expect(localStorage.getItem(legacyKey), where).toBeNull();
          }
          if (targetState === "populated") {
            // Never overwrite. A device already running the new build has real
            // data here, and a stale legacy key must not clobber it.
            expect(localStorage.getItem(target), where).toBe(targetValue);
            expect(localStorage.getItem(legacyKey), where).toBe(legacyValue);
          }
          if (legacyState === "unparseable") {
            // Unparseable is not worthless: it can be read out of devtools and
            // the sale re-entered by hand. Deleting it makes that impossible.
            expect(localStorage.getItem(legacyKey), where).toBe(legacyValue);
            // Logged only where the move was actually attempted. A populated
            // target is turned away by the overwrite guard before anything is
            // parsed, and reporting a parse failure there would describe a step
            // that never ran.
            if (targetState === "empty") {
              expect(console.error, where).toHaveBeenCalled();
            }
          }

          vi.restoreAllMocks();
        }
      }
    }
  });

  it("migrates all three keys in one pass", () => {
    localStorage.setItem(
      LEGACY_OFFLINE_SALES_KEY,
      JSON.stringify([queuedSale("INV-0001")])
    );
    localStorage.setItem(
      LEGACY_OFFLINE_CATALOG_KEY,
      JSON.stringify({ inventory: [], services: [], syncedAt: null })
    );
    localStorage.setItem(LEGACY_OFFLINE_NEXT_INVOICE_KEY, "42");

    migrateLegacyOfflineKeys(SHOP_ONE);

    for (const [legacyKey, namespaced] of PAIRS) {
      expect(localStorage.getItem(legacyKey), legacyKey).toBeNull();
      expect(localStorage.getItem(namespaced(SHOP_ONE)), legacyKey).not.toBeNull();
    }
  });

  it("leaves an unparseable queue in place without blocking the other keys", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    localStorage.setItem(LEGACY_OFFLINE_SALES_KEY, "{ truncated");
    localStorage.setItem(LEGACY_OFFLINE_NEXT_INVOICE_KEY, "42");

    migrateLegacyOfflineKeys(SHOP_ONE);

    expect(localStorage.getItem(LEGACY_OFFLINE_SALES_KEY)).toBe("{ truncated");
    expect(localStorage.getItem(offlineSalesKey(SHOP_ONE))).toBeNull();
    // The bad key does not strand the good ones.
    expect(localStorage.getItem(offlineNextInvoiceKey(SHOP_ONE))).toBe("42");
  });

  it("migrates into the resolved shop, not a hardcoded 1", () => {
    localStorage.setItem(
      LEGACY_OFFLINE_SALES_KEY,
      JSON.stringify([queuedSale("INV-0001")])
    );

    migrateLegacyOfflineKeys(7);

    expect(localStorage.getItem(offlineSalesKey(7))).not.toBeNull();
    expect(localStorage.getItem(offlineSalesKey(1))).toBeNull();
  });
});

describe("P2 — the migration is idempotent", () => {
  it("leaves storage identical however many times it runs", () => {
    fc.assert(
      fc.property(queue(), fc.integer({ min: 2, max: 5 }), (sales, runs) => {
        localStorage.clear();
        localStorage.setItem(LEGACY_OFFLINE_SALES_KEY, JSON.stringify(sales));

        migrateLegacyOfflineKeys(SHOP_ONE);
        const afterOne = snapshot();

        for (let i = 1; i < runs; i++) migrateLegacyOfflineKeys(SHOP_ONE);
        expect(snapshot()).toEqual(afterOne);
      })
    );
  });

  it("does not re-migrate a legacy key that reappears after the marker is set", () => {
    // The marker is what makes this safe. Without it, a legacy key written by an
    // old tab still open in another window would be moved on top of a namespace
    // that has since accumulated real sales.
    migrateLegacyOfflineKeys(SHOP_ONE);
    localStorage.setItem(
      LEGACY_OFFLINE_SALES_KEY,
      JSON.stringify([queuedSale("INV-0009")])
    );

    migrateLegacyOfflineKeys(SHOP_ONE);

    expect(localStorage.getItem(offlineSalesKey(SHOP_ONE))).toBeNull();
    expect(localStorage.getItem(LEGACY_OFFLINE_SALES_KEY)).not.toBeNull();
  });

  it("records that it has run", () => {
    migrateLegacyOfflineKeys(SHOP_ONE);
    expect(localStorage.getItem(OFFLINE_MIGRATION_KEY)).not.toBeNull();
  });
});

describe("resolving the shop to migrate into", () => {
  it("does nothing and writes no marker when there is no session", () => {
    localStorage.setItem(
      LEGACY_OFFLINE_SALES_KEY,
      JSON.stringify([queuedSale("INV-0001")])
    );

    expect(ensureLegacyOfflineMigration()).toBe(false);

    // Critically: no marker. Signing in does not reload the page, so the call at
    // the offline page's first read is what has to be able to still do this.
    expect(localStorage.getItem(OFFLINE_MIGRATION_KEY)).toBeNull();
    expect(localStorage.getItem(LEGACY_OFFLINE_SALES_KEY)).not.toBeNull();
  });

  it("migrates once a session exists, without a reload in between", () => {
    localStorage.setItem(
      LEGACY_OFFLINE_SALES_KEY,
      JSON.stringify([queuedSale("INV-0001")])
    );
    ensureLegacyOfflineMigration();

    session([{ id: 3, name: "Spincredible" }]);

    expect(ensureLegacyOfflineMigration()).toBe(true);
    expect(localStorage.getItem(offlineSalesKey(3))).not.toBeNull();
    expect(localStorage.getItem(LEGACY_OFFLINE_SALES_KEY)).toBeNull();
  });

  it("takes the lowest shop id, which is the only shop that existed before", () => {
    localStorage.setItem(
      LEGACY_OFFLINE_SALES_KEY,
      JSON.stringify([queuedSale("INV-0001")])
    );
    session([{ id: 9, name: "Branch B" }, { id: 2, name: "Spincredible" }]);

    ensureLegacyOfflineMigration();

    expect(localStorage.getItem(offlineSalesKey(2))).not.toBeNull();
    expect(localStorage.getItem(offlineSalesKey(9))).toBeNull();
  });

  it("does nothing when the session carries no shops", () => {
    session([]);
    expect(ensureLegacyOfflineMigration()).toBe(false);
    expect(localStorage.getItem(OFFLINE_MIGRATION_KEY)).toBeNull();
  });
});
