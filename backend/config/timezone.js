// config/timezone.js
// Pins the process to UTC. Must be imported before anything that touches a Date.
//
// Both sale tables use bare `TIMESTAMP` columns, which carry no zone, and every
// row in them is UTC: `created_at` comes from CURRENT_TIMESTAMP with the Neon
// session on GMT, and `paid_at` is written by this process.
//
// The Neon driver reads a bare TIMESTAMP back as *the server process's* local
// time, and serialises a Date the same way. That is harmless while the process
// happens to run in UTC, which is how the deployed host produced all 6,000-odd
// existing rows — but on a developer's machine in Asia/Manila the same code
// reads every timestamp 8 hours early and writes new ones 8 hours late, mixing
// two zones into one column.
//
// Setting TZ makes the process's idea of local time match what the column
// actually holds, so reads and writes agree no matter where the code runs. It
// is a no-op in production and a fix everywhere else.
//
// Display is unaffected: the API hands the browser a real instant, and the
// browser renders it in the shop's own zone.
process.env.TZ = "UTC";
