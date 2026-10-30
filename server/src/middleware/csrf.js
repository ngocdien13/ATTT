"use strict";
const crypto = require("crypto");
function token(req) {
  return crypto
    .createHmac("sha256", process.env.SESSION_SECRET)
    .update("seruchat-csrf:" + req.sessionID)
    .digest("base64url");
}
function protect(req, res, next) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return next();
  const actual = req.get("X-CSRF-Token"),
    expected = token(req);
  if (
    typeof actual !== "string" ||
    ! /^[A-Za-z0-9_-]{43}$/.test(actual) ||
    !crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
  )
    return res
      .status(403)
      .json({ message: "CSRF token không hợp lệ. Tải lại trang và thử lại." });
  next();
}
module.exports = { token, protect };
