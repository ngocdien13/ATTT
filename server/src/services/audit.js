"use strict";
const crypto = require("node:crypto"),
  { key } = require("./secrets");
async function append(c, actor, action, target = null) {
  await c.query("SELECT id FROM audit_mutex WHERE id=1 FOR UPDATE");
  const [[last]] = await c.query(
    "SELECT entry_hash FROM security_audit ORDER BY id DESC LIMIT 1",
  );
  const previous = last?.entry_hash || "0".repeat(64),
    payload = JSON.stringify({
      actor,
      action,
      target,
      time: new Date().toISOString(),
    }),
    hash = crypto
      .createHmac("sha256", key("audit"))
      .update(previous + "\n" + payload)
      .digest("hex");
  await c.query(
    "INSERT INTO security_audit(actor_id,action,target_id,previous_hash,entry_hash,payload) VALUES (?,?,?,?,?,?)",
    [actor, action, target, previous, hash, payload],
  );
}
function valid(rows) {
  let prior = "0".repeat(64);
  for (const r of rows) {
    const payload =
      typeof r.payload === "string" ? r.payload : JSON.stringify(r.payload);
    let data;
    try {
      data = JSON.parse(payload);
    } catch {
      return false;
    }
    if (
      data.actor !== r.actor_id ||
      data.action !== r.action ||
      data.target !== r.target_id
    )
      return false;
    const hash = crypto
      .createHmac("sha256", key("audit"))
      .update(prior + "\n" + payload)
      .digest("hex");
    if (r.previous_hash !== prior || r.entry_hash !== hash) return false;
    prior = r.entry_hash;
  }
  return true;
}
module.exports = { append, valid };
