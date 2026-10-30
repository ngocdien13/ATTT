"use strict";
const crypto = require("node:crypto"),
  argon2 = require("argon2"),
  db = require("../config/database");
const { fail, uuid } = require("../utils/api"),
  { transaction } = require("../utils/transactions"),
  { consumeLimit, hash } = require("../services/accountSecurity"),
  secrets = require("../services/secrets"),
  totp = require("../services/totp"),
  audit = require("../services/audit");
async function role(req) {
  const [[u]] = await db
    .promise()
    .query(
      "SELECT id,email,app_role,password_hash,suspended_at FROM users WHERE id=?",
      [req.session.userId],
    );
  if (!u || u.suspended_at || !["admin", "super_admin"].includes(u.app_role))
    fail(403, "Bạn không có quyền quản trị.");
  return u;
}
async function guard(req, res, next) {
  try {
    await role(req);
    const [[m]] = await db
      .promise()
      .query("SELECT enabled FROM admin_mfa WHERE user_id=?", [
        req.session.userId,
      ]);
    if (
      !m?.enabled ||
      !req.session.adminUntil ||
      req.session.adminUntil < Date.now()
    )
      fail(403, "Cần xác thực quản trị bằng ứng dụng OTP.");
    next();
  } catch (e) {
    next(e);
  }
}
async function state(req, res) {
  const u = await role(req),
    [[m]] = await db
      .promise()
      .query("SELECT enabled FROM admin_mfa WHERE user_id=?", [u.id]);
  res.json({
    role: u.app_role,
    enrolled: !!m?.enabled,
    verified: !!m?.enabled && req.session.adminUntil > Date.now(),
  });
}
async function setup(req, res) {
  const u = await role(req);
  await consumeLimit("mfa-setup:" + u.id, 5, 600, res);
  if (
    typeof req.body.password !== "string" ||
    req.body.password.length > 1024 ||
    !(await argon2.verify(u.password_hash, req.body.password))
  )
    fail(403, "Mật khẩu không đúng.");
  const secret = totp.encode(crypto.randomBytes(20));
  await transaction(async (c) => {
    await c.query("SELECT id FROM users WHERE id=? FOR UPDATE", [u.id]);
    const [[m]] = await c.query(
      "SELECT enabled FROM admin_mfa WHERE user_id=?",
      [u.id],
    );
    if (m?.enabled) fail(409, "OTP đã được thiết lập.");
    await c.query(
      "INSERT INTO admin_mfa(user_id,secret_ciphertext) VALUES (?,?) ON DUPLICATE KEY UPDATE secret_ciphertext=VALUES(secret_ciphertext),last_counter=-1",
      [u.id, secrets.seal(secret, "admin-totp", u.id)],
    );
    await audit.append(c, u.id, "mfa.prepare");
  });
  res.json({
    secret,
    uri:
      "otpauth://totp/" +
      encodeURIComponent("Seruchat:" + u.email) +
      "?secret=" +
      secret +
      "&issuer=Seruchat&algorithm=SHA1&digits=6&period=30",
  });
}
async function verify(req, res) {
  const u = await role(req);
  await consumeLimit("mfa-verify:" + u.id, 5, 300, res);
  let ok = false;
  await transaction(async (c) => {
    const [[m]] = await c.query(
      "SELECT * FROM admin_mfa WHERE user_id=? FOR UPDATE",
      [u.id],
    );
    if (!m) return;
    const counter = totp.verify(
      secrets.open(m.secret_ciphertext, "admin-totp", u.id),
      req.body.code,
      m.last_counter,
    );
    if (counter === null) return;
    await c.query(
      "UPDATE admin_mfa SET enabled=TRUE,last_counter=? WHERE user_id=?",
      [counter, u.id],
    );
    await audit.append(c, u.id, "mfa.verified");
    ok = true;
  });
  if (!ok) fail(403, "Mã OTP sai, đã dùng hoặc đã hết hạn.");
  req.session.adminUntil = Date.now() + 600000;
  res.json({ ok: true });
}
async function stats(req, res) {
  const [[row]] = await db
    .promise()
    .query(
      `SELECT (SELECT COUNT(*) FROM users) AS users,(SELECT COUNT(*) FROM users WHERE email_verified_at IS NOT NULL) AS verified,(SELECT COUNT(DISTINCT user_id) FROM account_sessions WHERE last_seen_at>DATE_SUB(NOW(6),INTERVAL 1 DAY)) AS activeDay,(SELECT COUNT(*) FROM chat_groups) AS \`groups\`,(SELECT COUNT(*) FROM conversations) AS conversations,(SELECT COUNT(*) FROM messages)+(SELECT COUNT(*) FROM v2_messages) AS messages,(SELECT COALESCE(SUM(expected_bytes),0) FROM encrypted_attachments) AS fileBytes,(SELECT COUNT(*) FROM abuse_reports WHERE status='open') AS reports`,
    );
  res.json(row);
}
async function users(req, res) {
  const page = Math.max(
    0,
    Math.min(10000, Math.trunc(Number(req.query.page)) || 0),
  );
  const q =
    typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
  const [rows] = await db
    .promise()
    .query(
      "SELECT id,username,email,app_role,suspended_at,email_verified_at,created_at FROM users WHERE username LIKE ? OR email LIKE ? ORDER BY created_at DESC LIMIT 50 OFFSET ?",
      ["%" + q + "%", "%" + q + "%", page * 50],
    );
  res.json({ users: rows, page });
}
async function suspend(req, res) {
  const actor = await role(req),
    target = uuid(req.params.id);
  if (target === actor.id || typeof req.body.suspended !== "boolean")
    fail(400, "Không thể thực hiện thao tác.");
  await consumeLimit("admin-action:" + actor.id, 30, 600, res);
  if (
    typeof req.body.password !== "string" ||
    req.body.password.length > 1024 ||
    !(await argon2.verify(actor.password_hash, req.body.password))
  )
    fail(403, "Cần mật khẩu hiện tại.");
  await transaction(async (c) => {
    const [[u]] = await c.query(
      "SELECT app_role FROM users WHERE id=? FOR UPDATE",
      [target],
    );
    if (!u) fail(404, "Không tìm thấy tài khoản.");
    if (u.app_role !== "user")
      fail(403, "Quản trị tài khoản có quyền cần thực hiện qua CLI.");
    await c.query(
      "UPDATE users SET suspended_at=?,auth_version=auth_version+1 WHERE id=?",
      [req.body.suspended ? new Date() : null, target],
    );
    await c.query(
      "UPDATE account_sessions SET revoked_at=NOW(6) WHERE user_id=?",
      [target],
    );
    await audit.append(
      c,
      actor.id,
      req.body.suspended ? "user.suspend" : "user.unsuspend",
      target,
    );
  });
  res.json({ ok: true });
}
async function reports(req, res) {
  const [rows] = await db
    .promise()
    .query(
      "SELECT id,reporter_id,target_id,reason,status,created_at FROM abuse_reports ORDER BY created_at DESC LIMIT 100",
    );
  res.json({ reports: rows });
}
async function review(req, res) {
  if (!["reviewed", "dismissed"].includes(req.body.status))
    fail(400, "Trạng thái không hợp lệ.");
  await transaction(async (c) => {
    const [r] = await c.query("UPDATE abuse_reports SET status=? WHERE id=?", [
      req.body.status,
      uuid(req.params.id),
    ]);
    if (!r.affectedRows) fail(404, "Không tìm thấy báo cáo.");
    await audit.append(
      c,
      req.session.userId,
      "report." + req.body.status,
      req.params.id,
    );
  });
  res.json({ ok: true });
}
async function logs(req, res) {
  const [rows] = await db
    .promise()
    .query("SELECT * FROM security_audit ORDER BY id ASC LIMIT 5001");
  res.json({
    entries: rows.slice(-100),
    verified: rows.length <= 5000 ? audit.valid(rows) : null,
    limited: rows.length > 5000,
  });
}
module.exports = {
  guard,
  state,
  setup,
  verify,
  stats,
  users,
  suspend,
  reports,
  review,
  logs,
};
