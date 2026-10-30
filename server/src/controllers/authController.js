"use strict";
const argon2 = require("argon2"),
  crypto = require("crypto");
const db = require("../config/database");
const { fail, uuid, base64 } = require("../utils/api");
const { transaction } = require("../utils/transactions");
const v = require("../services/validation");
const {
  hash,
  digestToken,
  consumeLimit,
  loginSession,
} = require("../services/accountSecurity");
const delivery = require("../services/delivery");
const generic =
  "Nếu tài khoản phù hợp tồn tại, hướng dẫn sẽ được gửi tới email.";
const publicUser = (u) => ({
  id: u.id,
  username: u.username,
  email: u.email,
  emailVerified: !!u.email_verified_at,
});
async function register(req, res) {
  await require("../services/captcha").check(req, "register");
  await consumeLimit("register:" + req.ip, 8, 3600, res);
  const email = v.email(req.body.email),
    password = v.password(req.body.password),
    p = v.profile(req.body);
  if (/^u_[a-f0-9]{32}$/.test(p.handle))
    fail(400, "Handle này được dành riêng cho tài khoản cũ.");
  if (req.body.acceptTerms !== true)
    fail(400, "Cần đồng ý điều khoản và chính sách quyền riêng tư.");
  const id = crypto.randomUUID(),
    passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  await transaction(async (c) => {
    await c.query(
      "INSERT INTO users(id,username,email,password_hash,terms_accepted_at) VALUES (?,?,?,?,NOW(6))",
      [id, p.displayName, email, passwordHash],
    );
    await c.query(
      `INSERT INTO user_profiles(user_id,handle,display_name,date_of_birth,phone_e164,bio,show_phone,show_birthday) VALUES (?,?,?,?,?,?,?,?)`,
      [
        id,
        p.handle,
        p.displayName,
        p.dateOfBirth,
        p.phone,
        p.bio,
        p.showPhone,
        p.showBirthday,
      ],
    );
  });
  res.status(201).json({
    message:
      "Tạo tài khoản thành công. Hãy xác minh email tại màn hình đăng nhập.",
    user: publicUser({ id, username: p.displayName, email }),
  });
}
async function login(req, res) {
  await require("../services/captcha").check(req, "login");
  const email = v.email(req.body.email);
  if (
    typeof req.body.password !== "string" ||
    !req.body.password ||
    req.body.password.length > 1024
  )
    fail(400, "Mật khẩu không hợp lệ.");
  await consumeLimit("login-ip:" + req.ip, 40, 600, res);
  await consumeLimit("login-account:" + email, 15, 600, res);
  const [[user]] = await db
    .promise()
    .query("SELECT * FROM users WHERE email=?", [email]);
  // Equal expensive path for an unknown email; no user-specific error.
  const dummy =
    "$argon2id$v=19$m=65536,t=3,p=4$bm9uZXhpc3RlbnQtdXNlcg$Q6EFU40r1k7Hvyht72b0Y7fmF25vqOEmqBqZkwAx5JY";
  const valid = await argon2
    .verify(user?.password_hash || dummy, req.body.password)
    .catch(() => false);
  if (!user || !valid || user.suspended_at)
    fail(401, "Email hoặc mật khẩu không đúng.");
  if (
    process.env.REQUIRE_EMAIL_VERIFICATION === "true" &&
    !user.email_verified_at
  )
    fail(403, "Cần xác minh email trước khi đăng nhập.");
  await loginSession(req, user);
  res.json({ message: "Đăng nhập thành công.", user: publicUser(user) });
}
async function me(req, res) {
  const [[user]] = await db
    .promise()
    .query("SELECT id,username,email,email_verified_at FROM users WHERE id=?", [
      req.session.userId,
    ]);
  if (!user) fail(401, "Tài khoản không còn tồn tại.");
  res.json({ user: publicUser(user) });
}
async function issue(user, purpose, destination, res) {
  if (purpose === "phone")
    await consumeLimit("sms-destination:" + destination, 5, 3600, res);
  await consumeLimit("issue-minute:" + user.id + ":" + purpose, 1, 60, res);
  await consumeLimit("issue-hour:" + user.id + ":" + purpose, 5, 3600, res);
  const id = crypto.randomUUID(),
    token =
      purpose === "phone"
        ? String(crypto.randomInt(0, 1000000)).padStart(6, "0")
        : crypto.randomBytes(32).toString("base64url");
  await transaction(async (c) => {
    await c.query("SELECT id FROM users WHERE id=? FOR UPDATE", [user.id]);
    const [[recent]] = await c.query(
      "SELECT id FROM account_challenges WHERE user_id=? AND purpose=? AND created_at>DATE_SUB(NOW(6),INTERVAL 60 SECOND) LIMIT 1",
      [user.id, purpose],
    );
    if (recent) fail(429, "Vui lòng đợi ít nhất 60 giây trước khi gửi lại.");
    await c.query(
      "UPDATE account_challenges SET consumed_at=NOW(6) WHERE user_id=? AND purpose=? AND consumed_at IS NULL",
      [user.id, purpose],
    );
    await c.query(
      "INSERT INTO account_challenges(id,user_id,purpose,destination,token_hash,expires_at) VALUES (?,?,?,?,?,DATE_ADD(NOW(6),INTERVAL 10 MINUTE))",
      [id, user.id, purpose, destination, digestToken(id, token)],
    );
  });
  try {
    if (purpose === "phone") await delivery.sendPhone(destination, token);
    else {
      const origin = new URL(process.env.PUBLIC_ORIGIN);
      if (
        origin.protocol !== "https:" &&
        !(
          process.env.NODE_ENV !== "production" &&
          ["localhost", "127.0.0.1"].includes(origin.hostname)
        )
      )
        fail(503, "PUBLIC_ORIGIN cần HTTPS.");
      const link =
        origin.origin + "/#" + new URLSearchParams({ purpose, id, token });
      await delivery.sendEmail(
        destination,
        purpose === "reset"
          ? "Seruchat — đặt lại mật khẩu"
          : "Seruchat — xác minh email",
        `Mở liên kết trong 10 phút:\n${link}\n\nKhông chia sẻ liên kết này. Nếu bạn không yêu cầu, hãy bỏ qua.`,
      );
    }
  } catch (error) {
    await db
      .promise()
      .query("UPDATE account_challenges SET consumed_at=NOW(6) WHERE id=?", [
        id,
      ]);
    throw error;
  }
  return id;
}
async function requestEmail(req, res) {
  await require("../services/captcha").check(req, "email");
  if (!delivery.emailReady()) fail(503, "Chưa cấu hình dịch vụ email.");
  const email = v.email(req.body.email);
  await consumeLimit("email-request-ip:" + req.ip, 10, 3600, res);
  const [[user]] = await db
    .promise()
    .query("SELECT id,email,email_verified_at FROM users WHERE email=?", [
      email,
    ]);
  // Always generic, including delivery errors/cooldown: never reveal whether email exists.
  if (user && !user.email_verified_at) {
    try {
      await issue(user, "email", user.email);
    } catch {}
  }
  res.json({ message: generic });
}
async function requestReset(req, res) {
  await require("../services/captcha").check(req, "reset");
  if (!delivery.emailReady()) fail(503, "Chưa cấu hình dịch vụ email.");
  const email = v.email(req.body.email);
  await consumeLimit("reset-ip:" + req.ip, 10, 3600, res);
  const [[user]] = await db
    .promise()
    .query("SELECT id,email FROM users WHERE email=?", [email]);
  if (user) {
    try {
      await issue(user, "reset", user.email);
    } catch {}
  }
  res.json({ message: generic });
}
async function consumeChallenge(req, purpose, work) {
  const id = uuid(req.body.id, "Challenge ID"),
    token = req.body.token;
  if (typeof token !== "string" || token.length > 128)
    fail(400, "Mã xác minh không hợp lệ.");
  let accepted = false;
  await transaction(async (c) => {
    const [[ch]] = await c.query(
      "SELECT * FROM account_challenges WHERE id=? FOR UPDATE",
      [id],
    );
    if (
      !ch ||
      ch.purpose !== purpose ||
      ch.consumed_at ||
      ch.attempts >= 5 ||
      new Date(ch.expires_at) <= new Date() ||
      (purpose === "phone" && ch.user_id !== req.session.userId)
    )
      return;
    await c.query(
      "UPDATE account_challenges SET attempts=attempts+1 WHERE id=?",
      [id],
    );
    const actual = Buffer.from(digestToken(id, token), "hex"),
      expected = Buffer.from(ch.token_hash, "hex");
    if (!crypto.timingSafeEqual(actual, expected)) return;
    accepted = await work(c, ch);
    await c.query(
      "UPDATE account_challenges SET consumed_at=NOW(6) WHERE id=?",
      [id],
    );
  });
  if (!accepted) fail(400, "Mã sai, đã dùng, vượt số lần thử hoặc đã hết hạn.");
}
async function confirmEmail(req, res) {
  await consumeLimit("confirm-email:" + req.ip, 30, 600, res);
  await consumeChallenge(req, "email", async (c, ch) => {
    const [r] = await c.query(
      "UPDATE users SET email_verified_at=NOW(6) WHERE id=? AND email=?",
      [ch.user_id, ch.destination],
    );
    return r.affectedRows === 1;
  });
  res.json({ message: "Đã xác minh email. Bạn có thể đăng nhập." });
}
async function requestPhone(req, res) {
  if (!delivery.phoneReady()) fail(503, "Chưa cấu hình dịch vụ SMS.");
  await consumeLimit("sms-ip:" + req.ip, 10, 3600, res);
  const [[p]] = await db
    .promise()
    .query("SELECT phone_e164 FROM user_profiles WHERE user_id=?", [
      req.session.userId,
    ]);
  if (!p?.phone_e164) fail(400, "Cần lưu số điện thoại trước.");
  const id = await issue(
    { id: req.session.userId },
    "phone",
    p.phone_e164,
    res,
  );
  res.json({ id, message: "Đã gửi yêu cầu SMS. Mã có hiệu lực 10 phút." });
}
async function confirmPhone(req, res) {
  await consumeLimit("confirm-phone:" + req.session.userId, 20, 600, res);
  await consumeChallenge(req, "phone", async (c, ch) => {
    const [r] = await c.query(
      "UPDATE user_profiles SET phone_verified_at=NOW(6) WHERE user_id=? AND phone_e164=?",
      [ch.user_id, ch.destination],
    );
    return r.affectedRows === 1;
  });
  res.json({ message: "Đã xác minh số điện thoại." });
}
async function resetPassword(req, res) {
  const password = v.password(req.body.password);
  await consumeLimit("confirm-reset:" + req.ip, 15, 600, res);
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  await consumeChallenge(req, "reset", async (c, ch) => {
    const [changed] = await c.query(
      "UPDATE users SET password_hash=?,auth_version=auth_version+1,email_verified_at=NOW(6) WHERE id=? AND email=?",
      [passwordHash, ch.user_id, ch.destination],
    );
    if (!changed.affectedRows) return false;
    await c.query(
      "UPDATE account_sessions SET revoked_at=NOW(6) WHERE user_id=? AND revoked_at IS NULL",
      [ch.user_id],
    );
    return true;
  });
  res.json({
    message:
      "Đã đặt lại mật khẩu và đăng xuất các thiết bị. Đăng nhập lại rồi dùng phương thức khôi phục lịch sử đã thiết lập.",
  });
}
async function changePassword(req, res) {
  const password = v.password(req.body.password);
  if (
    typeof req.body.currentPassword !== "string" ||
    req.body.currentPassword.length > 1024
  )
    fail(400, "Cần mật khẩu hiện tại.");
  await consumeLimit("change-password:" + req.session.userId, 5, 600, res);
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  await transaction(async (c) => {
    const [[user]] = await c.query(
      "SELECT password_hash,auth_version FROM users WHERE id=? FOR UPDATE",
      [req.session.userId],
    );
    if (user.auth_version !== req.session.authVersion)
      fail(401, "Phiên đã hết hạn.");
    if (!(await argon2.verify(user.password_hash, req.body.currentPassword)))
      fail(403, "Mật khẩu hiện tại không đúng.");
    const [[key]] = await c.query("SELECT * FROM public_keys WHERE user_id=?", [
      req.session.userId,
    ]);
    if (key?.encrypted_private_key) {
      const b = req.body.backup;
      if (!b || b.publicKey !== key.public_key)
        fail(
          400,
          "Cần mã hóa lại backup của đúng khóa cũ trước khi đổi mật khẩu.",
        );
      const encrypted = base64(b.encryptedPrivateKey, "Backup", {
          min: 32,
          max: 4096,
        }),
        salt = base64(b.salt, "Salt", { bytes: 16 }),
        iv = base64(b.iv, "IV", { bytes: 12 });
      await c.query(
        "UPDATE public_keys SET encrypted_private_key=?,encryption_salt=?,encryption_iv=? WHERE user_id=?",
        [encrypted, salt, iv, req.session.userId],
      );
    }
    await c.query(
      "UPDATE users SET password_hash=?,auth_version=auth_version+1 WHERE id=?",
      [passwordHash, req.session.userId],
    );
    await c.query(
      "UPDATE account_sessions SET revoked_at=NOW(6) WHERE user_id=? AND revoked_at IS NULL",
      [req.session.userId],
    );
  });
  await new Promise((resolve) => req.session.destroy(resolve));
  res.clearCookie("connect.sid");
  res.json({
    message: "Đã đổi mật khẩu. Vui lòng đăng nhập lại trên các thiết bị.",
  });
}
async function sessions(req, res) {
  const [rows] = await db
    .promise()
    .query(
      "SELECT id,label,created_at,last_seen_at,expires_at FROM account_sessions WHERE user_id=? AND revoked_at IS NULL AND expires_at>NOW(6) ORDER BY created_at DESC LIMIT 50",
      [req.session.userId],
    );
  res.json({
    sessions: rows.map((s) => ({
      ...s,
      current: s.id === hash(req.sessionID),
    })),
  });
}
async function revoke(req, res) {
  const id = req.params.sessionId;
  if (!/^[a-f0-9]{64}$/.test(id)) fail(400, "Session ID không hợp lệ.");
  const [r] = await db
    .promise()
    .query(
      "UPDATE account_sessions SET revoked_at=NOW(6) WHERE id=? AND user_id=? AND revoked_at IS NULL",
      [id, req.session.userId],
    );
  if (!r.affectedRows) fail(404, "Không tìm thấy phiên.");
  if (id === hash(req.sessionID))
    await new Promise((resolve) => req.session.destroy(resolve));
  res.json({ message: "Đã thu hồi phiên đăng nhập." });
}
module.exports = {
  register,
  login,
  me,
  requestEmail,
  confirmEmail,
  requestReset,
  resetPassword,
  requestPhone,
  confirmPhone,
  changePassword,
  sessions,
  revoke,
};
