# Design: Enforce Auth & Shop Scope Across the Existing API

## Overview

Six files change: five controllers and `backend/utils/invoiceNumber.js`. Plus `server.js` for
mounting and the five route files for per-route role guards.

The work is **shallow but wide**: no new abstraction, no restructuring, no component churn —
just a shop predicate added to roughly 46 SQL statements, one at a time. The risk is entirely
in coverage, not in difficulty. A missed predicate does not throw; it silently returns or
mutates another shop's rows.

The design therefore optimises for *auditability*: a per-file, per-statement checklist that
can be walked with a diff open, and a grep-based completeness check that does not depend on
anyone's memory.

---

## Architecture

Nothing moves. The layered shape established by the `backend-code-cleanup` spec —
routes → controllers → utils → config — is preserved exactly.

```
server.js
  app.get("/api/health", …)                                   ← stays public (cron pings it)
  app.use("/api/auth", authRouter)                            ← from ticket 03, unchanged
  app.use("/api/services",        requireAuth, resolveShop, servicesRouter)
  app.use("/api/inventory",       requireAuth, resolveShop, inventoryRouter)
  app.use("/api",                 requireAuth, resolveShop, openSalesRouter)
  app.use("/api/closed-sales",    requireAuth, resolveShop, closedSalesRouter)
  app.use("/api/payment-methods", requireAuth, resolveShop, paymentMethodsRouter)
```

`requireAuth` and `resolveShop` mount at the router level because *every* route in each
router needs both. `requireRole` mounts per route inside the router files, because the roles
differ within a router:

```js
// routes/inventory.js
router.get("/",         getInventory);                              // all roles
router.post("/",        requireRole("manager","super_admin"), createOrRestockItem);
router.put("/:id",      requireRole("manager","super_admin"), updateItem);
router.delete("/:id",   requireRole("manager","super_admin"), deleteItem);
router.post("/reorder", requireRole("manager","super_admin"), reorderInventory);
```

This is the one structural point worth stating plainly: **the guard cannot live on the
router.** `GET /api/inventory` is the till's catalog and must be worker-accessible, while
every write beside it is manager-only. Mounting `requireRole("manager", …)` on the router
would lock workers out of the till.

---

## Components and Interfaces

### `utils/invoiceNumber.js` — the largest single change

Today both exported query helpers span the two sale tables and parse the number out of a
string. Both become shop-scoped, and allocation moves onto the `invoice_seq` column.

```js
/**
 * The shop's prefix and its next free sequence, in one round trip.
 *
 * GREATEST ignores NULL in Postgres, so a shop with sales in only one table — or with
 * hand-edited numbers that never parsed — still yields the right answer. COALESCE turns
 * "no sales at all" into 0, so a brand new shop starts at 1.
 */
export const allocateInvoice = async (sql, shopId) => {
  const rows = await sql`
    SELECT s.invoice_prefix,
           COALESCE(GREATEST(
             (SELECT MAX(invoice_seq) FROM open_sales   WHERE shop_id = s.id),
             (SELECT MAX(invoice_seq) FROM closed_sales WHERE shop_id = s.id)
           ), 0) + 1 AS next_seq
      FROM shops s
     WHERE s.id = ${shopId}
  `;
  const { invoice_prefix, next_seq } = rows[0];
  return { seq: next_seq, invoice: formatInvoiceNumber(next_seq, invoice_prefix),
           prefix: invoice_prefix };
};

/** Whether `invoice` is spoken for **within this shop**, in either sale table. */
export const isInvoiceTaken = async (sql, shopId, invoice) => { /* + shop_id predicate */ };

/** "INV-0087" -> 87 given prefix "INV-". Anything else -> null. */
export const parseInvoiceSeq = (invoice, prefix = INVOICE_PREFIX) => { /* … */ };
```

> **Amended during implementation — `allocateInvoice` also returns the prefix.**
> The original signature was `{ seq, invoice }`, which is not enough for Requirement 4.8.
> When a caller supplies an `invoice_number` that is free within the shop — the offline
> queue's path — we honour it *and* have to populate `invoice_seq`, which means parsing
> the supplied string against **that shop's** prefix. Returning it from the query that
> already selects it costs nothing and saves `createOpenSale` a second round trip.

> **Amended during implementation — `parseInvoiceSeq` does not build a regex.**
> The prefix is a shop-editable column from ticket 06 onwards, so interpolating it into a
> `RegExp` would let `INV.` match `INVx` and would break outright on an unbalanced
> bracket. The implementation uses `startsWith` plus a digit test on the remainder:
> identical behaviour for `INV-`, and no escaping question to get wrong. A parse that
> silently stops matching is exactly how R6 in the overview — a shop restarting its
> numbering at 1 and colliding with its own history — comes true.

`formatInvoiceNumber` gains a prefix parameter defaulting to `INVOICE_PREFIX`, so the
frontend's copy of the helper and the backend's stay compatible during the transition.

`highestInvoiceSeq` is **replaced** by `allocateInvoice`, not merely scoped. The reason is
Requirement 4.4 read together with ticket 02's `invoice_seq` backfill: allocation must key
off the integer column, not off re-parsing a display string whose prefix a shop can now
change. Keeping the old function would leave a second, subtly wrong allocation path.

> **Why one query instead of two.** Fetching the prefix and the max separately is two round
> trips on the hottest write in the app. The single query also guarantees prefix and sequence
> come from the same snapshot of the shop row.

### `controllers/openSalesController.js`

The two module-level helpers both take the scope explicitly rather than reading it from a
request they do not have:

```js
const applyStockAndSale = async (shopId, deltas, saleQueries) => {
  const stockQueries = [...deltas].map(([name, delta]) => sql`
    UPDATE inventory
       SET stock = stock + ${delta}
     WHERE shop_id = ${shopId} AND item_name = ${name}
  `);
  return sql.transaction([...stockQueries, ...saleQueries]);
};

const loadStockFor = async (shopId, deltas) => { /* + shop_id predicate */ };
```

The `WHERE shop_id = … AND item_name = …` in `applyStockAndSale` is the single most important
predicate in this ticket. Sale lines reference inventory **by name string with no foreign
key**, so without it a sale at Shop B silently decrements Shop A's stock for every item whose
name the two shops share — which, for a chain of laundromats, is all of them.

`getOpenSales` is the one statement whose shape changes rather than just gaining a clause. It
currently interpolates an optional SQL fragment:

```js
// before
sql`SELECT * FROM open_sales WHERE 1=1 ${dateFilter} ORDER BY created_at DESC`
// after
sql`SELECT * FROM open_sales WHERE shop_id = ${req.shopId} ${dateFilter} ORDER BY created_at DESC`
```

The `WHERE 1=1` placeholder existed only so the optional fragment could always start with
`AND`. The shop predicate now fills that role, and the fragment is unchanged.

### `controllers/inventoryController.js`, `servicesController.js`, `paymentMethodsController.js`

Mechanical. Two patterns recur and are easy to miss:

```sql
-- sort_order allocation: scope the subquery, or a new shop's first item inherits
-- another shop's ordering
(SELECT COALESCE(MAX(sort_order), 0) + 1 FROM inventory WHERE shop_id = ${req.shopId})

-- usage_count: BOTH sides need the predicate
SELECT pm.*,
       (SELECT COUNT(*) FROM closed_sales cs
         WHERE cs.shop_id = pm.shop_id AND cs.paid_using = pm.code)::int AS usage_count
  FROM payment_methods pm
 WHERE pm.shop_id = ${req.shopId}
```

The `usage_count` correlation is written as `cs.shop_id = pm.shop_id` rather than against
`req.shopId` directly — it is the same value, but correlating against the outer row makes the
statement correct by construction rather than by coincidence.

### Reorder handlers

`reorderInventory`, `reorderServices` and `reorderPaymentMethods` each build N `UPDATE`
statements from a client-supplied array of ids. Every one of those updates needs the shop
predicate, otherwise a caller can reorder — and thereby confirm the existence of — rows in
another shop. `utils/reorder.js` itself is pure and needs no change; only the SQL each
controller generates from its output does.

---

## The statement inventory

This is the checklist. It is organised by file and counts statements, because a file-level
review misses statements and a "did you scope it?" review misses files.

| File | Statements | Notes |
|---|---|---|
| `controllers/inventoryController.js` | 8 | incl. the `MAX(sort_order)` subquery and N reorder updates |
| `controllers/openSalesController.js` | 11 | incl. both helpers, the `WHERE 1=1` rewrite, and both table-move transactions |
| `controllers/closedSalesController.js` | 5 | incl. the four-bound date filter |
| `controllers/servicesController.js` | 5 | incl. the `MAX(sort_order)` subquery and N reorder updates |
| `controllers/paymentMethodsController.js` | 7 | incl. `usage_count` on both sides |
| `utils/invoiceNumber.js` | 2 | both replaced rather than edited |

Totals by table, for cross-checking against the same figures in the overview: `inventory` 13,
`open_sales` 11, `closed_sales` 10, `payment_methods` 7, `services` 5.

Note the two counts are cut differently — by file above, by table in the overview — and a
single statement can appear in both (a `paySale` transaction touches `open_sales` and
`closed_sales`). Reconciling them is not the point; having two independent counts that must
both come out right is.

> **Amended during implementation — what these numbers actually count.**
> Four of the six match the number of `sql` tagged templates in the finished file exactly.
> Two do not, and both are counting conventions rather than missed work:
>
> - `openSalesController.js` has **15** tagged templates, not 11. The design's figure treats
>   each `sql.transaction([...])` batch as one statement and files the payment-method check
>   under Requirement 6. (`rg` reports 18 in the file: the 15, plus one mention inside a
>   comment and the two `dateFilter` fragments, which are fragments and not statements.)
> - `paymentMethodsController.js` has **5** templates against a count of 7, because the
>   `usage_count` correlation and the `MAX(sort_order)` allocation are each counted as
>   their own scoped statement — which is the right way round, since each needs its own
>   predicate.
>
> Tick off the 15-line enumeration per file rather than the totals. The totals are the
> cross-check, not the checklist.

### Completeness check

After the edits, this must return nothing:

```powershell
# Every FROM/UPDATE/INTO/DELETE against a scoped table, minus the lines that mention shop_id
rg -n "(FROM|UPDATE|INTO|DELETE FROM)\s+(inventory|services|payment_methods|open_sales|closed_sales)" backend/controllers backend/utils |
  rg -v "shop_id"
```

It is a heuristic, not a proof — a multi-line statement puts the table and the predicate on
different lines. Use it to find what the manual pass missed, not to conclude the manual pass
was unnecessary.

---

## Data Models

No schema changes. Ticket 02 added every column this ticket reads.

---

## Error Handling

Existing behaviour is preserved. Three additions and one clarification:

| Condition | Status | Body |
|---|---|---|
| No or invalid token (flag off) | 401 | `{ message: "Sign in to continue" }` |
| Role not permitted | 403 | `{ message: "You do not have access to this action" }` |
| Missing or invalid `X-Shop-Id` | 400 / 403 | From `resolveShop`, per ticket 03 |
| Row exists but belongs to another shop | **404** | The existing "not found" message |

The last row is a decision, not an accident. Adding `shop_id` to a `WHERE id = …` clause makes
the row simply not match, so the existing 404 path fires with no extra code. Returning 403
instead would require detecting the row first — and would confirm to a caller that a given id
exists somewhere in the system. 404 is both cheaper and tighter.

---

## Correctness Properties

The pure functions in this ticket are the invoice helpers; everything else is I/O against a
database and is verified by the integration matrix below.

### P1 — Format and parse round-trip under any prefix

For any positive integer `n` and any prefix string of 1–10 characters,
`parseInvoiceSeq(formatInvoiceNumber(n, prefix), prefix) === n`.

*Validates: 4.2, 4.8*

### P2 — Parsing is prefix-sensitive

For any `n` and any two distinct prefixes `a` and `b` **that end in a non-digit**,
`parseInvoiceSeq(formatInvoiceNumber(n, a), b)` is `null`.

> **Amended during implementation — the non-digit constraint is load-bearing.**
> Without it the property is simply false, and the test found it: `formatInvoiceNumber(1, "A")`
> is `"A0001"`, and parsing that with prefix `"A0"` yields `1`, because `padStart` supplied
> the zero the second prefix then eats. Constrained to prefixes ending in a non-digit — which
> the schema default `'INV-'` is — the remainder under any other prefix must contain that
> non-digit and so cannot be all digits, and the ambiguity disappears. The fast-check
> arbitrary carries the constraint, and a comment in the test carries the reason.
>
> The arbitrary also requires the prefix to survive `trim()`, since `parseInvoiceSeq` trims
> its input before matching — a prefix with edge whitespace could never match the string it
> had just produced.

*Validates: 4.8*

### P3 — Unparseable input never produces NaN

For any string, `parseInvoiceSeq` returns either a positive integer or `null`, never `NaN`.

*Validates: 4.8*

P3 restates a property the existing code already holds — `invoiceNumber.js:20-23` documents
the `parseInt` bug that made it necessary. It is repeated here because the function's
signature changes and the guarantee must survive the change.

### Structural property SP1 — no controller reads scope from the request

```powershell
rg -n "req\.(body|query|params)\.(shop_id|shopId)" backend/ | rg -v "controllers/admin"
```
returns nothing.

Narrowed in ticket 06, not weakened. The `/api/admin` controllers are the one documented
exception to this rule: they take the shop as an explicit parameter and mount no
`resolveShop`, because a super admin acting across shops is the entire point of that surface,
and the router-level `requireRole("super_admin")` means the parameter only ever selects among
shops the caller already reaches. See
[06-superadmin-api/design.md](../06-superadmin-api/design.md) — "The deliberate
exception to the scoping rule". The rule itself is unchanged everywhere else, which is why the
check is narrowed rather than deleted.

*Validates: 3.4*

### Structural property SP2 — no controller knows about the legacy flag

```powershell
rg -n "legacyUnauth|LEGACY_UNAUTH" backend/controllers/
```
returns nothing.

*Validates: 7.4*

---

## Testing Strategy

### Unit and property tests

Extend `backend/utils/invoiceNumber.test.js` with P1, P2 and P3 using `fast-check` (added to
the backend in ticket 03).

### Integration matrix — two shops, three roles

This is the real test, and it needs a scratch database with **two** shops. Create the second
shop by direct SQL insert; ticket 06 is what adds the API for it.

Seed Shop A and Shop B each with an item named `Bleach` and a service named `Wash`, plus a
manager assigned only to Shop A and a worker assigned only to Shop A.

| # | Scenario | Expected |
|---|---|---|
| 1 | Shop A manager lists inventory | Only Shop A's rows |
| 2 | Shop A manager sends `X-Shop-Id: B` | 403, no query executed |
| 3 | Super admin sends `X-Shop-Id: B` | Only Shop B's rows |
| 4 | Worker `GET /api/inventory` | 200 |
| 5 | Worker `POST /api/inventory` | 403 |
| 6 | Worker creates, pays, reverts and deletes a sale | All succeed |
| 7 | Worker `GET /api/closed-sales?paidlow=…&createdhigh=…` (the reporting window) | 200 — see the note below |
| 8 | Sell `Bleach` at Shop A | **Shop B's `Bleach` stock is unchanged** |
| 9 | Shop A and Shop B each create their first sale | Both get their own series; A continues from its existing max, B starts at 1 |
| 10 | Shop B supplies an `invoice_number` Shop A already uses | Accepted — it is free within Shop B |
| 11 | Shop B supplies an `invoice_number` Shop B already uses | Reassigned, `invoice_reassigned: true` |
| 12 | Shop A manager `PUT /api/inventory/:id` with a Shop B item id | 404 |
| 13 | Shop A manager pays a Shop B sale by id | 404 |
| 14 | Shop B adds its first item | `sort_order` is 1, not `MAX(Shop A) + 1` |
| 15 | `GET /api/payment-methods` at Shop B | `usage_count` counts only Shop B's closed sales |
| 16 | Deactivate GCash at Shop A, pay with GCash at Shop B | Succeeds |

Scenario 8 is the one to run first and re-run last. It is the failure this whole ticket
exists to prevent, and it is invisible unless specifically checked.

> **On scenario 7 — "Reporting: manager+" is a UI restriction, not an API one.**
>
> There is no reporting endpoint. `/reporting` is computed entirely in the browser from
> `GET /api/closed-sales` and `GET /api/open-sales` (see `useReportAnalytics.js` and
> `utils/reportMetrics.js` — the only SQL aggregate in the whole codebase is the
> `usage_count` subquery, and it is not a report). Workers keep full closed-sales access by
> decision, so a worker holding a valid token can fetch the same rows the reporting page
> derives its totals from, and compute those totals themselves.
>
> Hiding `/reporting` from the worker nav is therefore a convenience, not a control. Do not
> describe it as one in the UI or in any later ticket. Closing it properly would mean either
> restricting workers' closed-sales access — explicitly rejected in the permission matrix —
> or moving aggregation server-side behind a manager-only endpoint, which is a larger change
> than this program takes on. Flagged here so the gap is a known, accepted one rather than an
> assumed-closed one.

### Legacy window regression

With `LEGACY_UNAUTH=true` and the **unmodified** frontend pointed at the backend, walk all
seven routes. Every list, total and count must match what it showed before this ticket.
Then set `LEGACY_UNAUTH=false`, reload, and confirm the old frontend now fails with 401s —
proving the bypass is what was carrying it and that nothing else is silently open.

### Existing test suites

`npm test` in `backend/` must still pass. The pure utilities `saleItems.js`,
`paymentMethods.js` and `reorder.js` are not modified, so their tests should not need to
change — if one does, that is a signal that logic leaked into a module that was meant to stay
free of scope.

---

## Migration Approach

### Dropping the `shop_id` defaults takes the `payment_methods` seed with it

Found during implementation, and not covered by the task list as written.

Task 10 drops the temporary column defaults ticket 02 added. But the one-time
`payment_methods` bootstrap seed in `initDB.js` — the one that plants `cash` and `gcash`
plus anything already sitting in `closed_sales.paid_using` — INSERTs **without** a
`shop_id`, and it is guarded on `WHERE NOT EXISTS (SELECT 1 FROM payment_methods)`. That
guard is global, so the seed re-fires on any later boot that finds the table empty across
all shops. With the default gone, that INSERT violates `NOT NULL`; `initDB()` calls
`process.exit(1)` on any failure, so **the backend stops starting.** Low probability,
total impact, and silent until the day it happens.

Ticket 02 predicted exactly this in its own comment beside the `SET DEFAULT` block and
left it to this ticket; task 10 then did not mention it.

The fix, applied here: move the seed from beside its `CREATE TABLE` down to below the
tenancy block — after `shops` exists and after the `shop_id` column has been added — and
give it an explicit `shop_id` resolved as `(SELECT id FROM shops ORDER BY id LIMIT 1)`,
the same subquery form the rest of that block uses, never a literal `1`. An
`AND EXISTS (SELECT 1 FROM shops)` guard keeps it inert on a database with no shop yet.

The guard stays **global rather than per shop**. Seeding a newly created shop's payment
methods belongs with the API that creates one, which is ticket 06.

### Order

Deployable in one go, but if the session runs long, **split by controller, not by layer.**

Splitting by layer ("all the middleware mounting today, all the predicates tomorrow") leaves
the API in a state where routes are authenticated but queries are unscoped — every request
lands on Shop 1's data regardless of the header, which looks like it works. Splitting by
controller leaves each finished controller fully correct and each unfinished one exactly as
it is today.

Suggested split, in dependency order:

1. `utils/invoiceNumber.js` + `openSalesController.js` (they change together)
2. `closedSalesController.js`
3. `inventoryController.js` + `servicesController.js`
4. `paymentMethodsController.js`
5. Route guards and `server.js` mounting

Steps 1–4 can each ship with the middleware unmounted; step 5 is what turns enforcement on.
