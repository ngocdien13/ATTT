"use strict";
const crypto = require("node:crypto"),
  db = require("../config/database"),
  { fail } = require("../utils/api");
function settings() {
  return {
    enabled: !!process.env.TURNSTILE_SECRET && !!process.env.TURNSTILE_SITE_KEY,
    siteKey: process.env.TURNSTILE_SITE_KEY || "",
  };
}
async function check(req, action) {
  if (!settings().enabled) return;
  const token = req.body.captchaToken;
  if (typeof token !== "string" || !token || token.length > 2048)
    fail(403, "Vui lòng hoàn thành kiểm tra bảo mật.");
  let data;
  try {
    const r = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret: process.env.TURNSTILE_SECRET,
          response: token,
          remoteip: req.ip,
        }),
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!r.ok) throw Error();
    data = await r.json();
  } catch {
    fail(503, "Kiểm tra bảo mật tạm thời chưa sẵn sàng.");
  }
  if (!data || typeof data !== "object" || Array.isArray(data))
    fail(503, "Kiểm tra bảo mật tạm thời chưa sẵn sàng.");
  const expected = new URL(process.env.PUBLIC_ORIGIN).hostname,
    age = Date.now() - Date.parse(data.challenge_ts);
  if (
    !data.success ||
    data.hostname !== expected ||
    data.action !== action ||
    !Number.isFinite(age) ||
    age < -30000 ||
    age > 300000
  )
    fail(403, "Kiểm tra bảo mật không hợp lệ hoặc đã hết hạn.");
  await db
    .promise()
    .query("DELETE FROM captcha_tokens WHERE expires_at<NOW(6) LIMIT 100");
  const digest = crypto.createHash("sha256").update(token).digest("hex");
  try {
    await db
      .promise()
      .query(
        "INSERT INTO captcha_tokens(token_hash,expires_at) VALUES (?,DATE_ADD(NOW(6),INTERVAL 10 MINUTE))",
        [digest],
      );
  } catch (e) {
    if (e.code === "ER_DUP_ENTRY") fail(403, "Mã kiểm tra đã được sử dụng.");
    throw e;
  }
}
module.exports = { settings, check };
