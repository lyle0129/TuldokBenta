import cron from "cron";
import https from "https";

import { sql } from "./db.js";
import { env } from "./env.js";

const job = new cron.CronJob("*/14 * * * *", function () {
  https
    .get(process.env.API_URL, (res) => {
      if (res.statusCode === 200) console.log("GET request sent successfully");
      else console.log("GET request failed", res.statusCode);
    })
    .on("error", (e) => console.error("Error while sending request", e));
});

export default job;

/** How many rows one sweep may remove. See the comment on the job below. */
const RETENTION_BATCH = 5000;

/**
 * Deletes audit events past their retention age, in one bounded batch.
 *
 * `id IN (SELECT … LIMIT n)` rather than a bare `DELETE … WHERE occurred_at <
 * …`. An unbounded DELETE on a table with millions of rows takes a long lock
 * and, over a serverless HTTP connection, is an excellent way to hit a
 * statement timeout having deleted nothing at all. Capping the batch means
 * retention converges over a few days instead of in one risky statement —
 * entirely fine for a boundary measured in months.
 *
 * Exported for the sake of being callable by hand during verification; the
 * scheduled job below is the only caller in normal operation.
 */
export const sweepAuditLog = async (days) => {
  const deleted = await sql`
    DELETE FROM audit_log
     WHERE id IN (
       SELECT id FROM audit_log
        WHERE occurred_at < now() - (${String(days)} || ' days')::interval
        LIMIT ${RETENTION_BATCH}
     )
     RETURNING id
  `;
  return deleted.length;
};

/**
 * The retention sweep, or null when AUDIT_RETENTION_DAYS is unset.
 *
 * Null rather than a job that does nothing, so server.js starting it is an
 * explicit `if` and an operator reading the deploy log can tell the difference
 * between "off" and "on but finding nothing".
 *
 * 03:00 daily: at most once a day (there is no faster schedule that helps a
 * months-long boundary) and at the quietest hour for a laundry shop.
 */
export const auditRetentionJob = env.auditRetentionDays
  ? new cron.CronJob("0 3 * * *", async function () {
      try {
        const removed = await sweepAuditLog(env.auditRetentionDays);
        if (removed > 0) {
          console.log(
            `🧹 Audit retention: removed ${removed} event(s) older than ` +
              `${env.auditRetentionDays} days.`
          );
        }
      } catch (error) {
        // Logged, never thrown. A failed sweep means the table stays larger
        // than intended for a day; an unhandled rejection in a cron callback
        // would take the whole backend down with it.
        console.error("Audit retention sweep failed", error);
      }
    })
  : null;


// CRON JOB EXPLANATION:
// Cron jobs are scheduled tasks that run periodically at fixed intervals
// we want to send 1 GET request for every 14 minutes

// How to define a "Schedule"?
// You define a schedule using a cron expression, which consists of 5 fields representing:

//! MINUTE, HOUR, DAY OF THE MONTH, MONTH, DAY OF THE WEEK

//? EXAMPLES && EXPLANATION:
//* 14 * * * * - Every 14 minutes
//* 0 0 * * 0 - At midnight on every Sunday
//* 30 3 15 * * - At 3:30 AM, on the 15th of every month
//* 0 0 1 1 * - At midnight, on January 1st
//* 0 * * * * - Every hour
