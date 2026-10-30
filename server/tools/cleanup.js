"use strict";
// Explicit maintenance command. Does not touch identities, keys, profiles or messages.
const db = require("../src/config/database");
(async () => {
  try {
    const c = db.promise();
    const attachments = await require("../src/services/attachmentMaintenance").cleanupAttachments();
    const [rates] = await c.query(
      "DELETE FROM account_rate_limits WHERE expires_at<DATE_SUB(NOW(6),INTERVAL 1 DAY) LIMIT 10000",
    );
    const [challenges] = await c.query(
      "DELETE FROM account_challenges WHERE expires_at<DATE_SUB(NOW(6),INTERVAL 30 DAY) LIMIT 10000",
    );
    const [sessions] = await c.query(
      "DELETE FROM account_sessions WHERE expires_at<DATE_SUB(NOW(6),INTERVAL 30 DAY) LIMIT 10000",
    );
    console.log(
      JSON.stringify({
        ...attachments,
        rateBuckets: rates.affectedRows,
        challenges: challenges.affectedRows,
        sessionMetadata: sessions.affectedRows,
      }),
    );
  } finally {
    await db.promise().end();
  }
})().catch((e) => {
  console.error("Cleanup failed:", e.code || e.name);
  process.exitCode = 1;
});
