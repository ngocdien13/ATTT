"use strict";
require("../src/config/database");
const db = require("../src/config/database"),
  { transaction } = require("../src/utils/transactions"),
  audit = require("../src/services/audit");
async function main() {
  const [action, email, role = "admin"] = process.argv.slice(2);
  if (!["grant", "revoke", "reset-mfa", "verify-audit"].includes(action))
    throw Error(
      "Usage: node tools/admin.js grant EMAIL admin|super_admin OR revoke EMAIL OR reset-mfa EMAIL OR verify-audit",
    );
  if (action === "verify-audit") {
    const [rows] = await db
      .promise()
      .query("SELECT * FROM security_audit ORDER BY id");
    if (!audit.valid(rows)) throw Error("Audit chain validation failed");
    console.log(
      "Audit chain verified:",
      rows.length,
      "head:",
      rows.at(-1)?.entry_hash || "0".repeat(64),
    );
    return;
  }
  if (!email || !["admin", "super_admin"].includes(role))
    throw Error("Invalid email or role");
  await transaction(async (c) => {
    const [[u]] = await c.query(
      "SELECT id FROM users WHERE email=? FOR UPDATE",
      [email],
    );
    if (!u) throw Error("Register this account first.");
    if (action === "reset-mfa")
      await c.query("DELETE FROM admin_mfa WHERE user_id=?", [u.id]);
    else
      await c.query(
        "UPDATE users SET app_role=?,auth_version=auth_version+1 WHERE id=?",
        [action === "grant" ? role : "user", u.id],
      );
    await c.query(
      "UPDATE account_sessions SET revoked_at=NOW(6) WHERE user_id=?",
      [u.id],
    );
    await audit.append(c, null, "cli." + action, u.id);
  });
  console.log("Completed. Sign in again.");
}
main()
  .catch((e) => {
    console.error(e.code || e.message);
    process.exitCode = 1;
  })
  .finally(() => db.promise().end());
