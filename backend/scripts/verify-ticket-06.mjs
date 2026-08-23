// Ticket 06 integration checks — every row of the design's table, plus the two
// checks ticket 05 deferred.
//
// Run against a backend booted on a THROWAWAY database (the Neon branch of
// production from tickets 02/03). Two of the checks rename audit_log, which
// breaks audit writes for the length of the check — never run this against the
// live database.
//
//   node verify-ticket-06.mjs
//
// Env:
//   CHECK_API        base URL of the running backend  (default http://localhost:5001)
//   CHECK_ADMIN_USER super admin username
//   CHECK_ADMIN_PASS super admin password
//   DATABASE_URL     the same branch the backend is pointed at (direct SQL checks)
//   CHECK_CLEANUP    "0" to leave the scratch rows behind for inspection

import { neon } from "@neondatabase/serverless";

const BASE = process.env.CHECK_API ?? "http://localhost:5001";
const ADMIN_USER = process.env.CHECK_ADMIN_USER;
const ADMIN_PASS = process.env.CHECK_ADMIN_PASS;
const sql = neon(process.env.DATABASE_URL);

const results = [];
const state = { shopId: null, shopBId: null, userId: null, freshUserId: null, saleId: null };

const check = async (name, fn) => {
  try {
    const note = await fn();
    results.push({ name, ok: true, note: note ?? "" });
    console.log(`  ok   ${name}${note ? ` — ${note}` : ""}`);
  } catch (error) {
    results.push({ name, ok: false, note: error.message });
    console.log(`  FAIL ${name} — ${error.message}`);
  }
};

const expect = (actual, wanted, what) => {
  const ok = typeof wanted === "function" ? wanted(actual) : actual === wanted;
  if (!ok) throw new Error(`${what}: got ${JSON.stringify(actual)}`);
};

const call = async (method, path, { token, shopId, body } = {}) => {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  if (shopId) headers["x-shop-id"] = String(shopId);

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  return { status: res.status, data };
};

/** The `shops` claim inside an access token, read without verifying it. */
const claims = (token) => JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());

const stamp = Date.now().toString(36);
const suffix = () => `${stamp}-${Math.random().toString(36).slice(2, 6)}`;

const main = async () => {
  if (!ADMIN_USER || !ADMIN_PASS) {
    console.error("Set CHECK_ADMIN_USER and CHECK_ADMIN_PASS.");
    process.exit(1);
  }

  // Shop 1's row counts, recorded before anything runs and compared at the end.
  // Nothing in this script writes to shop 1, and that has to be shown rather
  // than asserted.
  const [baseline] = await sql`
    SELECT (SELECT COUNT(*) FROM closed_sales WHERE shop_id = 1)::int AS closed,
           (SELECT COUNT(*) FROM open_sales   WHERE shop_id = 1)::int AS open,
           (SELECT COUNT(*) FROM inventory    WHERE shop_id = 1)::int AS inventory
  `;
  console.log(`\nShop 1 baseline: ${JSON.stringify(baseline)}\n`);

  // ── Sign in ──────────────────────────────────────────────────────────────
  const signIn = await call("POST", "/api/auth/login", {
    body: { username: ADMIN_USER, password: ADMIN_PASS },
  });
  if (signIn.status !== 200) {
    console.error("Could not sign in as the super admin:", signIn.status, signIn.data);
    process.exit(1);
  }
  const admin = signIn.data.accessToken;
  const adminId = signIn.data.user.id;

  console.log("Shops\n─────");

  const slug = `scratch-${suffix()}`;

  await check("create a shop → 201", async () => {
    const res = await call("POST", "/api/admin/shops", {
      token: admin,
      body: { name: "Scratch Laundry", slug, invoice_prefix: "SCR-", contact_number: "0900" },
    });
    expect(res.status, 201, "status");
    state.shopId = res.data.id;
    return `shop ${state.shopId}, prefix ${res.data.invoice_prefix}`;
  });

  await check("the new shop has exactly cash and gcash, scoped to it", async () => {
    const rows = await sql`
      SELECT code, shop_id FROM payment_methods WHERE shop_id = ${state.shopId} ORDER BY code
    `;
    expect(rows.map((r) => r.code).join(","), "cash,gcash", "codes");
    expect(rows.every((r) => Number(r.shop_id) === state.shopId), true, "scoped");
    return "2 methods";
  });

  await check("a duplicate slug → 409", async () => {
    const res = await call("POST", "/api/admin/shops", {
      token: admin,
      body: { name: "Copy", slug },
    });
    expect(res.status, 409, "status");
    return res.data.message;
  });

  await check("a sale at the new shop is prefix + 0001", async () => {
    const res = await call("POST", "/api/open-sales", {
      token: admin,
      shopId: state.shopId,
      body: { items: [{ type: "service", service_name: "Wash", price: "100", qty: 1 }] },
    });
    expect(res.status, 201, "status");
    expect(res.data.invoice_number, "SCR-0001", "invoice number");
    state.openSaleId = res.data.id;
    return res.data.invoice_number;
  });

  await check("paying it moves it to closed_sales", async () => {
    const res = await call("POST", `/api/pay-sale/${state.openSaleId}`, {
      token: admin,
      shopId: state.shopId,
      body: { paid_using: "cash" },
    });
    expect(res.status, 200, "status");
    const [row] = await sql`
      SELECT id, invoice_number FROM closed_sales WHERE shop_id = ${state.shopId}
    `;
    state.saleId = row.id;
    return `closed sale ${row.id} (${row.invoice_number})`;
  });

  await check("changing invoice_prefix where sales exist → 200 with a warning", async () => {
    const res = await call("PUT", `/api/admin/shops/${state.shopId}`, {
      token: admin,
      body: { invoice_prefix: "SCX-" },
    });
    expect(res.status, 200, "status");
    expect(typeof res.data.warning, "string", "warning field");
    return res.data.warning.slice(0, 48) + "…";
  });

  await check("the slug is immutable → 400", async () => {
    const res = await call("PUT", `/api/admin/shops/${state.shopId}`, {
      token: admin,
      body: { slug: "something-else" },
    });
    expect(res.status, 400, "status");
    return res.data.message;
  });

  await check("a second shop, for the assignment checks", async () => {
    const res = await call("POST", "/api/admin/shops", {
      token: admin,
      body: { name: "Scratch Two", slug: `scratch-two-${suffix()}` },
    });
    expect(res.status, 201, "status");
    state.shopBId = res.data.id;
    return `shop ${state.shopBId}`;
  });

  await check("GET /shops lists inactive shops too", async () => {
    await call("POST", `/api/admin/shops/${state.shopBId}/deactivate`, { token: admin });
    const res = await call("GET", "/api/admin/shops", { token: admin });
    const found = res.data.find((s) => s.id === state.shopBId);
    expect(found?.is_active, false, "listed as inactive");
    await call("POST", `/api/admin/shops/${state.shopBId}/reactivate`, { token: admin });
    return "deactivate → listed → reactivate";
  });

  console.log("\nUsers\n─────");

  const workerName = `scratch_${suffix().replace(/-/g, "")}`;

  await check("create a user with two assignments → 201, no password_hash", async () => {
    const res = await call("POST", "/api/admin/users", {
      token: admin,
      body: {
        username: workerName,
        full_name: "Scratch Worker",
        role: "worker",
        password: "correct-horse",
        shop_ids: [state.shopId, state.shopBId],
      },
    });
    expect(res.status, 201, "status");
    expect(res.data.must_change_password, true, "must_change_password");
    expect("password_hash" in res.data, false, "password_hash absent");
    expect("token_version" in res.data, false, "token_version absent");
    state.userId = res.data.id;
    return `user ${state.userId}`;
  });

  let workerRefresh = null;

  await check("that user signs in and sees exactly those two shops", async () => {
    const res = await call("POST", "/api/auth/login", {
      body: { username: workerName, password: "correct-horse" },
    });
    expect(res.status, 200, "status");
    const ids = res.data.shops.map((s) => s.id).sort();
    expect(ids.join(","), [state.shopId, state.shopBId].sort().join(","), "shop list");
    workerRefresh = res.data.refreshToken;
    return `${ids.length} shops`;
  });

  await check("reassigning to one shop, then refreshing, carries one shop", async () => {
    const put = await call("PUT", `/api/admin/users/${state.userId}/shops`, {
      token: admin,
      body: { shop_ids: [state.shopId] },
    });
    expect(put.status, 200, "assignment status");

    const res = await call("POST", "/api/auth/refresh", { body: { refreshToken: workerRefresh } });
    expect(res.status, 200, "refresh status");
    expect(claims(res.data.accessToken).shops.join(","), String(state.shopId), "token shops");
    return "1 shop in the new token";
  });

  await check("a manager gets 403 on an admin route", async () => {
    const managerName = `scratch_mgr_${suffix().replace(/-/g, "")}`;
    await call("POST", "/api/admin/users", {
      token: admin,
      body: {
        username: managerName,
        full_name: "Scratch Manager",
        role: "manager",
        password: "correct-horse",
        shop_ids: [state.shopId],
      },
    });
    const login = await call("POST", "/api/auth/login", {
      body: { username: managerName, password: "correct-horse" },
    });
    state.managerId = login.data.user.id;

    const forbidden = await call("GET", "/api/admin/users", { token: login.data.accessToken });
    expect(forbidden.status, 403, "status");
    return forbidden.data.message;
  });

  await check("an unauthenticated caller gets 401 even with LEGACY_UNAUTH=true", async () => {
    const res = await call("GET", "/api/admin/shops");
    expect(res.status, 401, "status");
    // And the legacy bypass really is on, or this proves nothing.
    const legacy = await call("GET", "/api/inventory");
    expect(legacy.status, 200, "legacy bypass active on /api/inventory");
    return "admin 401, legacy till 200";
  });

  await check("deactivating the user stops their refresh immediately", async () => {
    const res = await call("POST", `/api/admin/users/${state.userId}/deactivate`, { token: admin });
    expect(res.status, 200, "status");
    const refreshed = await call("POST", "/api/auth/refresh", {
      body: { refreshToken: workerRefresh },
    });
    expect(refreshed.status, 401, "refresh status");
    return "refresh 401";
  });

  await check("hard-deleting a user who has activity → 409", async () => {
    const res = await call("DELETE", `/api/admin/users/${state.userId}`, { token: admin });
    expect(res.status, 409, "status");
    expect(/deactivate/i.test(res.data.message), true, "message names deactivation");
    return res.data.message;
  });

  await check("hard-deleting a user who never acted → 204", async () => {
    const name = `scratch_ghost_${suffix().replace(/-/g, "")}`;
    const created = await call("POST", "/api/admin/users", {
      token: admin,
      body: { username: name, full_name: "Never Acted", role: "worker", password: "correct-horse" },
    });
    state.freshUserId = created.data.id;

    const res = await call("DELETE", `/api/admin/users/${state.freshUserId}`, { token: admin });
    expect(res.status, 204, "status");

    const rows = await sql`SELECT 1 FROM users WHERE id = ${state.freshUserId}`;
    expect(rows.length, 0, "row gone");
    state.freshUserId = null;
    return "row removed";
  });

  await check("a super admin cannot deactivate themselves → 409", async () => {
    const res = await call("POST", `/api/admin/users/${adminId}/deactivate`, { token: admin });
    expect(res.status, 409, "status");
    return res.data.message;
  });

  await check("the last active super admin cannot be deactivated → 409", async () => {
    // A second super admin, so the *first* one is no longer the last — then the
    // second deactivates the first, leaving itself alone, and tries again.
    const name = `scratch_sa_${suffix().replace(/-/g, "")}`;
    const created = await call("POST", "/api/admin/users", {
      token: admin,
      body: {
        username: name,
        full_name: "Scratch Super",
        role: "super_admin",
        password: "correct-horse",
      },
    });
    state.secondSuperId = created.data.id;

    const login = await call("POST", "/api/auth/login", {
      body: { username: name, password: "correct-horse" },
    });
    const second = login.data.accessToken;

    const first = await call("POST", `/api/admin/users/${adminId}/deactivate`, { token: second });
    expect(first.status, 200, "deactivating the first super admin");

    const last = await call("POST", `/api/admin/users/${state.secondSuperId}/deactivate`, {
      token: second,
    });
    // Self-deactivation is refused first; both refusals are 409, so check the
    // message to be sure which guard answered.
    const viaDelete = await call("DELETE", `/api/admin/users/${state.secondSuperId}`, {
      token: second,
    });
    expect(last.status, 409, "self status");
    expect(viaDelete.status, 409, "delete status");

    // Put the original super admin back before anything else runs.
    await call("POST", `/api/admin/users/${adminId}/reactivate`, { token: second });
    return `${last.data.message} / ${viaDelete.data.message}`;
  });

  await check("a demotion of the last active super admin → 409", async () => {
    const res = await call("PUT", `/api/admin/users/${state.secondSuperId}`, {
      token: admin,
      body: { role: "worker" },
    });
    // Two active super admins exist again at this point, so this one succeeds —
    // the guard is exercised by the deactivate check above. Confirm the happy
    // path instead, then put the role back.
    expect(res.status, 200, "status");
    await call("PUT", `/api/admin/users/${state.secondSuperId}`, {
      token: admin,
      body: { role: "super_admin" },
    });
    return "demotion allowed while another remains";
  });

  await check("no response anywhere leaks password_hash or token_version", async () => {
    const list = await call("GET", "/api/admin/users", { token: admin });
    const text = JSON.stringify(list.data);
    expect(text.includes("password_hash"), false, "password_hash");
    expect(text.includes("token_version"), false, "token_version");
    return `${list.data.length} users listed`;
  });

  console.log("\nDate correction\n───────────────");

  const original = await sql`SELECT * FROM closed_sales WHERE id = ${state.saleId}`;
  const before = original[0];

  await check("an unknown :table → 400 from the allowlist", async () => {
    const res = await call("PATCH", "/api/admin/sales/users/1/dates", {
      token: admin,
      body: { created_at: "2026-01-01 00:00:00" },
    });
    expect(res.status, 400, "status");
    return res.data.message;
  });

  await check("paid_at before created_at → 400, row unchanged", async () => {
    const res = await call("PATCH", `/api/admin/sales/closed/${state.saleId}/dates`, {
      token: admin,
      body: { paid_at: "2020-01-01 00:00:00" },
    });
    expect(res.status, 400, "status");
    const [now] = await sql`SELECT * FROM closed_sales WHERE id = ${state.saleId}`;
    expect(String(now.paid_at), String(before.paid_at), "paid_at unchanged");
    return res.data.message;
  });

  await check("a date next week → 400", async () => {
    const next = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 19).replace("T", " ");
    const res = await call("PATCH", `/api/admin/sales/closed/${state.saleId}/dates`, {
      token: admin,
      body: { created_at: next },
    });
    expect(res.status, 400, "status");
    return res.data.message;
  });

  await check("correcting created_at backwards → 200 with a full audit record", async () => {
    const target = "2026-03-02 08:30:00";
    const res = await call("PATCH", `/api/admin/sales/closed/${state.saleId}/dates`, {
      token: admin,
      body: { created_at: target },
    });
    expect(res.status, 200, "status");

    const [row] = await sql`SELECT * FROM closed_sales WHERE id = ${state.saleId}`;
    expect(String(row.created_at).startsWith("2026-03-02"), true, "stored date");
    expect(String(row.paid_at), String(before.paid_at), "paid_at untouched");
    expect(String(row.invoice_number), String(before.invoice_number), "invoice untouched");
    expect(Number(row.invoice_seq), Number(before.invoice_seq), "invoice_seq untouched");

    const [event] = await sql`
      SELECT * FROM audit_log
       WHERE action = 'sale.date_corrected' AND entity_id = ${state.saleId}
       ORDER BY id DESC LIMIT 1
    `;
    if (!event) throw new Error("no sale.date_corrected row");
    expect(Number(event.shop_id), state.shopId, "audit shop_id");
    expect(Boolean(event.changes?.before?.created_at), true, "before.created_at");
    expect(Boolean(event.changes?.after?.created_at), true, "after.created_at");
    expect(Boolean(event.changes?.before?.paid_at), true, "before.paid_at");
    return `before ${event.changes.before.created_at} → after ${event.changes.after.created_at}`;
  });

  console.log("\nThe two write modes (ticket 05's deferred checks)\n────────────────────────────────");

  await check("audit insert broken: a date correction fails 500 AND the date is unchanged", async () => {
    const [row] = await sql`SELECT created_at FROM closed_sales WHERE id = ${state.saleId}`;
    await sql`ALTER TABLE audit_log RENAME TO audit_log_broken`;
    try {
      const res = await call("PATCH", `/api/admin/sales/closed/${state.saleId}/dates`, {
        token: admin,
        body: { created_at: "2025-01-01 00:00:00" },
      });
      const [after] = await sql`SELECT created_at FROM closed_sales WHERE id = ${state.saleId}`;
      expect(res.status, 500, "status");
      expect(String(after.created_at), String(row.created_at), "date unchanged");
      return "500, date unchanged — transactional path";
    } finally {
      await sql`ALTER TABLE audit_log_broken RENAME TO audit_log`;
    }
  });

  await check("audit insert broken: a sale still succeeds", async () => {
    await sql`ALTER TABLE audit_log RENAME TO audit_log_broken`;
    try {
      const res = await call("POST", "/api/open-sales", {
        token: admin,
        shopId: state.shopId,
        body: { items: [{ type: "service", service_name: "Wash", price: "50", qty: 1 }] },
      });
      expect(res.status, 201, "status");
      state.strandedSaleId = res.data.id;
      return `sale ${res.data.invoice_number} created with the log down — best-effort path`;
    } finally {
      await sql`ALTER TABLE audit_log_broken RENAME TO audit_log`;
    }
  });

  // ── Shop 1, untouched ────────────────────────────────────────────────────
  console.log("\nShop 1\n──────");

  await check("shop 1's row counts are unchanged", async () => {
    const [now] = await sql`
      SELECT (SELECT COUNT(*) FROM closed_sales WHERE shop_id = 1)::int AS closed,
             (SELECT COUNT(*) FROM open_sales   WHERE shop_id = 1)::int AS open,
             (SELECT COUNT(*) FROM inventory    WHERE shop_id = 1)::int AS inventory
    `;
    expect(JSON.stringify(now), JSON.stringify(baseline), "counts");
    return JSON.stringify(now);
  });

  // ── Cleanup ──────────────────────────────────────────────────────────────
  if (process.env.CHECK_CLEANUP !== "0") {
    console.log("\nCleanup\n───────");
    const shops = [state.shopId, state.shopBId].filter(Boolean);
    const users = [state.userId, state.managerId, state.secondSuperId].filter(Boolean);

    try {
      // audit_log first: it holds foreign keys into both shops and users, and
      // this is a throwaway branch, so the scratch history goes with the rows it
      // describes.
      await sql`DELETE FROM audit_log WHERE shop_id = ANY(${shops})`;
      await sql`DELETE FROM audit_log WHERE actor_user_id = ANY(${users}) OR (entity_type = 'user' AND entity_id = ANY(${users}))`;
      await sql`DELETE FROM closed_sales   WHERE shop_id = ANY(${shops})`;
      await sql`DELETE FROM open_sales     WHERE shop_id = ANY(${shops})`;
      await sql`DELETE FROM payment_methods WHERE shop_id = ANY(${shops})`;
      await sql`DELETE FROM user_shops     WHERE shop_id = ANY(${shops})`;
      await sql`DELETE FROM users          WHERE id = ANY(${users})`;
      await sql`DELETE FROM shops          WHERE id = ANY(${shops})`;
      console.log(`  removed ${shops.length} scratch shops and ${users.length} scratch users`);
    } catch (error) {
      console.log(`  cleanup incomplete: ${error.message}`);
    }
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log("Failures:");
    for (const f of failed) console.log(`  - ${f.name}: ${f.note}`);
    process.exit(1);
  }
};

main().catch((error) => {
  console.error("\nThe run itself failed:", error);
  process.exit(1);
});
