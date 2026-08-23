// Ticket 06 integration checks — every row of the design's table, plus the two
// checks ticket 05 deferred.
//
// Run against a backend booted on a THROWAWAY database. Two of these checks
// rename audit_log, which breaks audit writes for the length of the check —
// never point this at the live database.
//
//   cd backend
//   node scripts/verify-ticket-06.mjs
//
// It creates everything it needs, including its own super admin, and removes all
// of it afterwards. Env:
//
//   CHECK_API      base URL of the running backend (default http://localhost:5001)
//   DATABASE_URL   the same database the backend is pointed at (from .env)
//   CHECK_CLEANUP  "0" to leave the scratch rows behind for inspection

import "dotenv/config";
import { neon } from "@neondatabase/serverless";

import { hashPassword } from "../utils/passwords.js";

const BASE = process.env.CHECK_API ?? "http://localhost:5001";
const PASSWORD = "correct-horse-battery";
const sql = neon(process.env.DATABASE_URL);

const results = [];
const state = { shops: [], users: [] };

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

  // fetch refuses a body on GET and HEAD, and several checks sweep a mixed list
  // of routes with one body.
  const sendsBody = body !== undefined && method !== "GET" && method !== "HEAD";

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: sendsBody ? JSON.stringify(body) : undefined,
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

/**
 * Timestamps as text, formatted by Postgres.
 *
 * Never as a JS Date: the driver reads a bare TIMESTAMP into the *reader's* local
 * zone, and this script is not TZ-pinned the way the server is, so comparing
 * Dates here would fail by the offset and say nothing about what is stored.
 */
const saleDates = async (table, id) => {
  const [row] = table === "open"
    ? await sql`
        SELECT to_char(created_at, 'YYYY-MM-DD HH24:MI:SS') AS created,
               to_char(paid_at,    'YYYY-MM-DD HH24:MI:SS') AS paid,
               invoice_number, invoice_seq
          FROM open_sales WHERE id = ${id}
      `
    : await sql`
        SELECT to_char(created_at, 'YYYY-MM-DD HH24:MI:SS') AS created,
               to_char(paid_at,    'YYYY-MM-DD HH24:MI:SS') AS paid,
               invoice_number, invoice_seq
          FROM closed_sales WHERE id = ${id}
      `;
  return row;
};

const stamp = Date.now().toString(36);
let counter = 0;
const suffix = () => `${stamp}${(counter += 1)}`;

const main = async () => {
  const url = new URL(process.env.DATABASE_URL);
  console.log(`\nDatabase: ${url.hostname}`);

  // Shop 1's row counts, recorded before anything runs and compared at the end.
  // Nothing here writes to shop 1, and that has to be shown rather than asserted.
  const [baseline] = await sql`
    SELECT (SELECT COUNT(*) FROM closed_sales WHERE shop_id = 1)::int AS closed,
           (SELECT COUNT(*) FROM open_sales   WHERE shop_id = 1)::int AS open,
           (SELECT COUNT(*) FROM inventory    WHERE shop_id = 1)::int AS inventory
  `;
  console.log(`Shop 1 baseline: ${JSON.stringify(baseline)}`);

  // ── Its own super admin, so the run needs no credentials handed to it ──
  const adminName = `t06_admin_${suffix()}`;
  const [{ id: adminId }] = await sql`
    INSERT INTO users (username, password_hash, full_name, role)
    VALUES (${adminName}, ${await hashPassword(PASSWORD)}, 'Ticket 06 Check', 'super_admin')
    RETURNING id
  `;
  state.users.push(adminId);

  const signIn = await call("POST", "/api/auth/login", {
    body: { username: adminName, password: PASSWORD },
  });
  if (signIn.status !== 200) {
    console.error("Could not sign in:", signIn.status, signIn.data);
    await cleanup();
    process.exit(1);
  }
  const admin = signIn.data.accessToken;

  console.log("\nShops\n─────");

  const slug = `t06-shop-${suffix()}`;

  await check("create a shop → 201", async () => {
    const res = await call("POST", "/api/admin/shops", {
      token: admin,
      body: { name: "Ticket 06 Laundry", slug, invoice_prefix: "SCR-", contact_number: "0900" },
    });
    expect(res.status, 201, "status");
    state.shopA = res.data.id;
    state.shops.push(res.data.id);
    return `shop ${state.shopA}, prefix ${res.data.invoice_prefix}`;
  });

  await check("the new shop has exactly cash and gcash, scoped to it", async () => {
    const rows = await sql`
      SELECT code, shop_id FROM payment_methods WHERE shop_id = ${state.shopA} ORDER BY code
    `;
    expect(rows.map((r) => r.code).join(","), "cash,gcash", "codes");
    expect(rows.every((r) => Number(r.shop_id) === state.shopA), true, "scoped to the new shop");
    return "2 methods";
  });

  await check("it has no inventory or services copied from anywhere", async () => {
    const [row] = await sql`
      SELECT (SELECT COUNT(*) FROM inventory WHERE shop_id = ${state.shopA})::int AS items,
             (SELECT COUNT(*) FROM services  WHERE shop_id = ${state.shopA})::int AS services
    `;
    expect(row.items + row.services, 0, "empty catalog");
    return "0 items, 0 services";
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
      shopId: state.shopA,
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
      shopId: state.shopA,
      body: { paid_using: "cash" },
    });
    expect(res.status, 200, "status");
    const [row] = await sql`SELECT id FROM closed_sales WHERE shop_id = ${state.shopA}`;
    state.saleId = row.id;
    return `closed sale ${state.saleId}`;
  });

  await check("changing invoice_prefix where sales exist → 200 with a warning", async () => {
    const res = await call("PUT", `/api/admin/shops/${state.shopA}`, {
      token: admin,
      body: { invoice_prefix: "SCX-" },
    });
    expect(res.status, 200, "status");
    expect(typeof res.data.warning, "string", "warning field");
    return `${res.data.warning.slice(0, 44)}…`;
  });

  await check("changing other fields on a shop with sales carries no warning", async () => {
    const res = await call("PUT", `/api/admin/shops/${state.shopA}`, {
      token: admin,
      body: { name: "Ticket 06 Laundry (renamed)" },
    });
    expect(res.status, 200, "status");
    expect(res.data.warning, undefined, "no warning");
    return "renamed, no warning";
  });

  await check("the slug is immutable → 400", async () => {
    const res = await call("PUT", `/api/admin/shops/${state.shopA}`, {
      token: admin,
      body: { slug: "something-else" },
    });
    expect(res.status, 400, "status");
    return res.data.message;
  });

  await check("a second shop, for the assignment checks", async () => {
    const res = await call("POST", "/api/admin/shops", {
      token: admin,
      body: { name: "Ticket 06 Two", slug: `t06-shop-${suffix()}` },
    });
    expect(res.status, 201, "status");
    state.shopB = res.data.id;
    state.shops.push(res.data.id);
    return `shop ${state.shopB}`;
  });

  await check("deactivate → still listed → reactivate", async () => {
    const off = await call("POST", `/api/admin/shops/${state.shopB}/deactivate`, { token: admin });
    expect(off.status, 200, "deactivate status");

    const list = await call("GET", "/api/admin/shops", { token: admin });
    const found = list.data.find((s) => s.id === state.shopB);
    expect(found?.is_active, false, "listed while inactive");

    const on = await call("POST", `/api/admin/shops/${state.shopB}/reactivate`, { token: admin });
    expect(on.data.is_active, true, "reactivated");
    return "inactive shops appear in the list";
  });

  console.log("\nUsers\n─────");

  const workerName = `t06_wrk_${suffix()}`;
  let workerRefresh = null;

  await check("create a user with two assignments → 201, no password_hash", async () => {
    const res = await call("POST", "/api/admin/users", {
      token: admin,
      body: {
        username: workerName,
        full_name: "Ticket 06 Worker",
        role: "worker",
        password: PASSWORD,
        shop_ids: [state.shopA, state.shopB],
      },
    });
    expect(res.status, 201, "status");
    expect(res.data.must_change_password, true, "must_change_password");
    expect("password_hash" in res.data, false, "password_hash absent");
    expect("token_version" in res.data, false, "token_version absent");
    state.workerId = res.data.id;
    state.users.push(res.data.id);
    return `user ${state.workerId}`;
  });

  await check("a short password → 400", async () => {
    const res = await call("POST", "/api/admin/users", {
      token: admin,
      body: { username: `t06_x_${suffix()}`, full_name: "X", role: "worker", password: "short" },
    });
    expect(res.status, 400, "status");
    return res.data.message;
  });

  await check("a duplicate username → 409", async () => {
    const res = await call("POST", "/api/admin/users", {
      token: admin,
      body: {
        username: workerName.toUpperCase(),
        full_name: "Clash",
        role: "worker",
        password: PASSWORD,
      },
    });
    expect(res.status, 409, "status");
    return `${res.data.message} (normalised, so the capitalised name collides)`;
  });

  await check("that user signs in and sees exactly those two shops", async () => {
    const res = await call("POST", "/api/auth/login", {
      body: { username: workerName, password: PASSWORD },
    });
    expect(res.status, 200, "status");
    const ids = res.data.shops.map((s) => s.id).sort();
    expect(ids.join(","), [state.shopA, state.shopB].sort().join(","), "shop list");
    workerRefresh = res.data.refreshToken;
    return `${ids.length} shops`;
  });

  await check("reassigning to one shop, then refreshing, carries one shop", async () => {
    const put = await call("PUT", `/api/admin/users/${state.workerId}/shops`, {
      token: admin,
      body: { shop_ids: [state.shopA] },
    });
    expect(put.status, 200, "assignment status");

    const res = await call("POST", "/api/auth/refresh", { body: { refreshToken: workerRefresh } });
    expect(res.status, 200, "refresh status");
    expect(claims(res.data.accessToken).shops.join(","), String(state.shopA), "token shops");
    return "1 shop in the new token";
  });

  await check("resetting a password forces a change and strands the refresh token", async () => {
    const res = await call("POST", `/api/admin/users/${state.workerId}/reset-password`, {
      token: admin,
      body: { password: "another-good-password" },
    });
    expect(res.status, 200, "status");

    const stranded = await call("POST", "/api/auth/refresh", {
      body: { refreshToken: workerRefresh },
    });
    expect(stranded.status, 401, "old refresh token");

    const again = await call("POST", "/api/auth/login", {
      body: { username: workerName, password: "another-good-password" },
    });
    expect(again.data.user.must_change_password, true, "must_change_password");
    workerRefresh = again.data.refreshToken;
    return "old refresh 401, new sign-in must change";
  });

  await check("a manager gets 403 on an admin route", async () => {
    const managerName = `t06_mgr_${suffix()}`;
    const created = await call("POST", "/api/admin/users", {
      token: admin,
      body: {
        username: managerName,
        full_name: "Ticket 06 Manager",
        role: "manager",
        password: PASSWORD,
        shop_ids: [state.shopA],
      },
    });
    state.managerId = created.data.id;
    state.users.push(created.data.id);

    const login = await call("POST", "/api/auth/login", {
      body: { username: managerName, password: PASSWORD },
    });
    const manager = login.data.accessToken;

    const routes = [
      ["GET", "/api/admin/users"],
      ["GET", "/api/admin/shops"],
      ["POST", "/api/admin/shops"],
      ["PATCH", `/api/admin/sales/closed/${state.saleId}/dates`],
      ["GET", "/api/admin/audit?from=2026-01-01&to=2026-12-31"],
    ];
    for (const [method, path] of routes) {
      const res = await call(method, path, { token: manager, body: {} });
      expect(res.status, 403, `${method} ${path}`);
    }
    return `403 on all ${routes.length} routes`;
  });

  await check("an unauthenticated caller gets 401 even with LEGACY_UNAUTH=true", async () => {
    const res = await call("GET", "/api/admin/shops");
    expect(res.status, 401, "admin route status");

    // And the bypass really is on, or the line above proves nothing.
    const legacy = await call("GET", "/api/inventory");
    expect(legacy.status, 200, "legacy bypass on /api/inventory");
    return "admin 401 while the legacy till is served 200";
  });

  await check("deactivating the worker stops their refresh immediately", async () => {
    const res = await call("POST", `/api/admin/users/${state.workerId}/deactivate`, {
      token: admin,
    });
    expect(res.status, 200, "status");
    const refreshed = await call("POST", "/api/auth/refresh", {
      body: { refreshToken: workerRefresh },
    });
    expect(refreshed.status, 401, "refresh status");
    return "refresh 401";
  });

  await check("hard-deleting a user who has activity → 409 naming deactivation", async () => {
    const res = await call("DELETE", `/api/admin/users/${state.workerId}`, { token: admin });
    expect(res.status, 409, "status");
    expect(/deactivate/i.test(res.data.message), true, "message names deactivation");
    return res.data.message;
  });

  await check("hard-deleting a user who never acted → 204", async () => {
    const created = await call("POST", "/api/admin/users", {
      token: admin,
      body: {
        username: `t06_ghost_${suffix()}`,
        full_name: "Never Acted",
        role: "worker",
        password: PASSWORD,
      },
    });
    const ghostId = created.data.id;

    const res = await call("DELETE", `/api/admin/users/${ghostId}`, { token: admin });
    expect(res.status, 204, "status");
    const rows = await sql`SELECT 1 FROM users WHERE id = ${ghostId}`;
    expect(rows.length, 0, "row gone");
    return "row removed";
  });

  await check("a super admin cannot deactivate their own account → 409", async () => {
    const res = await call("POST", `/api/admin/users/${adminId}/deactivate`, { token: admin });
    expect(res.status, 409, "status");
    expect(/your own/i.test(res.data.message), true, "message");
    return res.data.message;
  });

  await check("the last active super admin cannot be deactivated, demoted or deleted", async () => {
    // Reaching this guard needs an actor who is not the target, and the only
    // caller who can be one is a super admin whose own account has just been
    // deactivated — their access token stays valid until it expires, which is
    // R5's deactivation lag. So: B deactivates A, then A (token still good)
    // tries to take B down, and B is now the last one standing.
    const secondName = `t06_sa_${suffix()}`;
    const created = await call("POST", "/api/admin/users", {
      token: admin,
      body: {
        username: secondName,
        full_name: "Ticket 06 Second Super",
        role: "super_admin",
        password: PASSWORD,
      },
    });
    state.secondSuperId = created.data.id;
    state.users.push(created.data.id);

    const login = await call("POST", "/api/auth/login", {
      body: { username: secondName, password: PASSWORD },
    });
    const second = login.data.accessToken;

    // Every other super admin on this database is deactivated for the length of
    // the check, so that "last active" is true rather than merely arranged.
    const others = await sql`
      SELECT id FROM users
       WHERE role = 'super_admin' AND is_active
         AND id NOT IN (${adminId}, ${state.secondSuperId})
    `;
    for (const row of others) {
      await sql`UPDATE users SET is_active = FALSE WHERE id = ${row.id}`;
    }

    try {
      const deactivateA = await call("POST", `/api/admin/users/${adminId}/deactivate`, {
        token: second,
      });
      expect(deactivateA.status, 200, "B deactivates A");

      const [{ count }] = await sql`
        SELECT COUNT(*)::int AS count FROM users WHERE role = 'super_admin' AND is_active
      `;
      expect(count, 1, "exactly one active super admin remains");

      const deactivate = await call("POST", `/api/admin/users/${state.secondSuperId}/deactivate`, {
        token: admin,
      });
      const demote = await call("PUT", `/api/admin/users/${state.secondSuperId}`, {
        token: admin,
        body: { role: "worker" },
      });

      expect(deactivate.status, 409, "deactivate status");
      expect(/at least one active super admin/i.test(deactivate.data.message), true, "message");
      expect(demote.status, 409, "demote status");

      const [still] = await sql`
        SELECT is_active, role FROM users WHERE id = ${state.secondSuperId}
      `;
      expect(still.is_active, true, "still active");
      expect(still.role, "super_admin", "still super admin");
      return `${deactivate.data.message} — and the demotion is refused the same way`;
    } finally {
      // A back on, then everyone else, whatever happened above.
      await sql`UPDATE users SET is_active = TRUE WHERE id = ${adminId}`;
      for (const row of others) {
        await sql`UPDATE users SET is_active = TRUE WHERE id = ${row.id}`;
      }
    }
  });

  await check("no listing leaks password_hash or token_version", async () => {
    const list = await call("GET", "/api/admin/users", { token: admin });
    const text = JSON.stringify(list.data);
    expect(text.includes("password_hash"), false, "password_hash");
    expect(text.includes("token_version"), false, "token_version");
    expect(Array.isArray(list.data[0]?.shop_ids), true, "shop_ids present");
    return `${list.data.length} users, each with shop_ids`;
  });

  await check("no audit payload anywhere contains a password", async () => {
    // Ticket 05 ran the loose `~* '(password|token|hash)'` sweep and got zero.
    // That sweep is no longer the right question: ticket 06 legitimately records
    // `must_change_password` on a user.create, and the *key name* contains
    // "password" while the value is a boolean. So match a secret-bearing name
    // used as a JSON key instead — which is the only shape a leaked value could
    // arrive in, since utils/audit.js strips exactly these names.
    const [row] = await sql`
      SELECT COUNT(*)::int AS count FROM audit_log
       WHERE changes::text ~* '"(password|password_hash|passwordhash|currentpassword|newpassword|token|accesstoken|refreshtoken)"[[:space:]]*:'
    `;
    expect(row.count, 0, "audit rows carrying a secret key");

    // And show that the loose sweep's hits are only ever that one boolean, so
    // the narrowing above is a correction rather than a way to pass.
    const loose = await sql`
      SELECT changes::text AS changes FROM audit_log
       WHERE changes::text ~* '(password|token|hash)'
    `;
    const others = loose.filter((r) => !/must_change_password/.test(r.changes));
    expect(others.length, 0, "loose matches that are not must_change_password");
    return `0 secret keys; ${loose.length} rows mention must_change_password, all boolean`;
  });

  console.log("\nDate correction\n───────────────");

  const before = await saleDates("closed", state.saleId);

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
    const now = await saleDates("closed", state.saleId);
    expect(now.paid, before.paid, "paid_at unchanged");
    expect(now.created, before.created, "created_at unchanged");
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

  await check("correcting created_at backwards → 200, with a full audit record", async () => {
    const target = "2026-03-02 08:30:00";
    const res = await call("PATCH", `/api/admin/sales/closed/${state.saleId}/dates`, {
      token: admin,
      body: { created_at: target },
    });
    expect(res.status, 200, "status");

    const now = await saleDates("closed", state.saleId);
    expect(now.created, target, "created_at moved");
    expect(now.paid, before.paid, "paid_at untouched");
    expect(now.invoice_number, before.invoice_number, "invoice_number untouched");
    expect(Number(now.invoice_seq), Number(before.invoice_seq), "invoice_seq untouched");

    const [event] = await sql`
      SELECT * FROM audit_log
       WHERE action = 'sale.date_corrected' AND entity_id = ${state.saleId}
       ORDER BY id DESC LIMIT 1
    `;
    if (!event) throw new Error("no sale.date_corrected row");
    expect(Number(event.shop_id), state.shopA, "audit shop_id");
    expect(event.entity_type, "closed_sale", "entity_type");
    expect(event.entity_label, before.invoice_number, "entity_label");
    expect(Boolean(event.changes?.before?.created_at), true, "before.created_at present");
    expect(Boolean(event.changes?.before?.paid_at), true, "before.paid_at present");
    expect(event.changes?.after?.created_at?.startsWith(target), true, "after.created_at");
    return `${event.changes.before.created_at} → ${event.changes.after.created_at}`;
  });

  await check("a correction moves the sale across a month boundary in the data", async () => {
    // The reporting page buckets in the browser off exactly this column, so this
    // is what "the sale moves between months" is, at the API level.
    const march = await sql`
      SELECT COUNT(*)::int AS count FROM closed_sales
       WHERE shop_id = ${state.shopA}
         AND created_at >= '2026-03-01' AND created_at < '2026-04-01'
    `;
    expect(march[0].count, 1, "sales in March");

    const august = await sql`
      SELECT COUNT(*)::int AS count FROM closed_sales
       WHERE shop_id = ${state.shopA}
         AND created_at >= '2026-08-01' AND created_at < '2026-09-01'
    `;
    expect(august[0].count, 0, "sales left in August");
    return "August 0, March 1 — R4 working as intended";
  });

  await check("an open sale accepts created_at and refuses paid_at", async () => {
    const created = await call("POST", "/api/open-sales", {
      token: admin,
      shopId: state.shopA,
      body: { items: [{ type: "service", service_name: "Fold", price: "20", qty: 1 }] },
    });
    const id = created.data.id;

    const refused = await call("PATCH", `/api/admin/sales/open/${id}/dates`, {
      token: admin,
      body: { paid_at: "2026-03-02 09:00:00" },
    });
    expect(refused.status, 400, "paid_at status");

    const ok = await call("PATCH", `/api/admin/sales/open/${id}/dates`, {
      token: admin,
      body: { created_at: "2026-03-02 09:00:00" },
    });
    expect(ok.status, 200, "created_at status");
    expect((await saleDates("open", id)).created, "2026-03-02 09:00:00", "stored");
    return refused.data.message;
  });

  await check("a missing sale → 404", async () => {
    const res = await call("PATCH", "/api/admin/sales/closed/99999999/dates", {
      token: admin,
      body: { created_at: "2026-03-02 08:30:00" },
    });
    expect(res.status, 404, "status");
    return res.data.message;
  });

  console.log("\nThe two write modes — ticket 05's deferred checks\n────────────────────────────────────────────────");

  await check("audit broken: a date correction fails 500 AND the date is unchanged", async () => {
    const start = await saleDates("closed", state.saleId);
    await sql`ALTER TABLE audit_log RENAME TO audit_log_broken`;
    try {
      const res = await call("PATCH", `/api/admin/sales/closed/${state.saleId}/dates`, {
        token: admin,
        body: { created_at: "2025-01-01 00:00:00" },
      });
      const after = await saleDates("closed", state.saleId);
      expect(res.status, 500, "status");
      expect(after.created, start.created, "date unchanged");
      return "500, and the date did not move — the transactional path";
    } finally {
      await sql`ALTER TABLE audit_log_broken RENAME TO audit_log`;
    }
  });

  await check("audit broken: a sale still succeeds", async () => {
    await sql`ALTER TABLE audit_log RENAME TO audit_log_broken`;
    try {
      const res = await call("POST", "/api/open-sales", {
        token: admin,
        shopId: state.shopA,
        body: { items: [{ type: "service", service_name: "Wash", price: "50", qty: 1 }] },
      });
      expect(res.status, 201, "status");
      return `${res.data.invoice_number} taken with the log down — the best-effort path`;
    } finally {
      await sql`ALTER TABLE audit_log_broken RENAME TO audit_log`;
    }
  });

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

  await cleanup();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log("Failures:");
    for (const f of failed) console.log(`  - ${f.name}: ${f.note}`);
    process.exit(1);
  }
};

const cleanup = async () => {
  if (process.env.CHECK_CLEANUP === "0") {
    console.log("\nCleanup skipped (CHECK_CLEANUP=0)");
    return;
  }
  console.log("\nCleanup\n───────");
  const shops = state.shops;
  const users = state.users;

  try {
    // audit_log first: it holds foreign keys into both shops and users, and the
    // scratch history goes with the rows it describes.
    if (shops.length) await sql`DELETE FROM audit_log WHERE shop_id = ANY(${shops})`;
    if (users.length) {
      await sql`
        DELETE FROM audit_log
         WHERE actor_user_id = ANY(${users})
            OR (entity_type = 'user' AND entity_id = ANY(${users}))
      `;
    }
    if (shops.length) {
      await sql`DELETE FROM closed_sales    WHERE shop_id = ANY(${shops})`;
      await sql`DELETE FROM open_sales      WHERE shop_id = ANY(${shops})`;
      await sql`DELETE FROM payment_methods WHERE shop_id = ANY(${shops})`;
      await sql`DELETE FROM user_shops      WHERE shop_id = ANY(${shops})`;
    }
    if (users.length) {
      await sql`DELETE FROM user_shops WHERE user_id = ANY(${users})`;
      await sql`DELETE FROM users      WHERE id = ANY(${users})`;
    }
    if (shops.length) await sql`DELETE FROM shops WHERE id = ANY(${shops})`;
    console.log(`  removed ${shops.length} scratch shops and ${users.length} scratch users`);
  } catch (error) {
    console.log(`  cleanup incomplete — remove these by hand: shops ${shops}, users ${users}`);
    console.log(`  ${error.message}`);
  }
};

main().catch(async (error) => {
  console.error("\nThe run itself failed:", error);
  await cleanup();
  process.exit(1);
});
