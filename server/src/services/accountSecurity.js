"use strict";
const crypto = require("crypto");
const db = require("../config/database");
const { fail } = require("../utils/api");
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const digestToken = (id, token) =>
  crypto
    .createHmac("sha256", process.env.SESSION_SECRET)
    .update(id + "\0" + token)
    .digest("hex");
async function consumeLimit(key, limit, seconds, res) {
  const bucket = hash(key + ":" + Math.floor(Date.now() / (seconds * 1000)));
  const c = await db.promise().getConnection();
  try {
    await c.beginTransaction();
    await c.query(
      "INSERT INTO account_rate_limits(bucket,hits,expires_at) VALUES (?,1,DATE_ADD(NOW(6),INTERVAL ? SECOND)) ON DUPLICATE KEY UPDATE hits=hits+1",
      [bucket, seconds],
    );
    const [[row]] = await c.query(
      "SELECT hits FROM account_rate_limits WHERE bucket=?",
      [bucket],
    );
    await c.commit();
    if (row.hits > limit) {
      res?.set("Retry-After", String(seconds));
      fail(429, "Thao tác quá nhiều. Vui lòng thử lại sau.");
    }
  } catch (error) {
    await c.rollback();
    throw error;
  } finally {
    c.release();
  }
}
async function loginSession(req, user) {
  await new Promise((resolve, reject) =>
    req.session.regenerate((e) => (e ? reject(e) : resolve())),
  );
  req.session.userId = user.id;
  req.session.authVersion = user.auth_version;
  const id = hash(req.sessionID);
  await db
    .promise()
    .query(
      "INSERT INTO account_sessions(id,user_id,label,expires_at) VALUES (?,?,?,DATE_ADD(NOW(6),INTERVAL 1 DAY))",
      [
        id,
        user.id,
        (req.get("User-Agent") || "Thiết bị không xác định").slice(0, 160),
      ],
    );
  await new Promise((resolve, reject) =>
    req.session.save((e) => (e ? reject(e) : resolve())),
  );
}
module.exports = { hash, digestToken, consumeLimit, loginSession };
