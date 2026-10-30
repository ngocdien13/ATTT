"use strict";
const validator = require("validator");
const { parsePhoneNumberFromString } = require("libphonenumber-js/max");
const { fail, text } = require("../utils/api");
function email(value) {
  const result = text(value, "Email", 254).toLowerCase();
  if (
    !validator.isEmail(result, {
      allow_utf8_local_part: false,
      require_tld: true,
    })
  )
    fail(400, "Email không hợp lệ.");
  // Preserve Gmail dots and +aliases. Syntax validation does not verify ownership.
  return result;
}
function password(value) {
  if (typeof value !== "string" || value.length < 12 || value.length > 128)
    fail(400, "Mật khẩu cần 12–128 ký tự.");
  return value;
}
function handle(value) {
  const result = text(value, "Handle", 40).toLowerCase();
  if (!/^[a-z0-9_]{3,40}$/.test(result))
    fail(
      400,
      "Handle cần 3–40 chữ a-z, số hoặc dấu _. Tiền tố định danh cũ được dành riêng.",
    );
  return result;
}
function birthday(value, now = new Date()) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    fail(400, "Ngày sinh phải có dạng YYYY-MM-DD.");
  const date = new Date(value + "T00:00:00Z");
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value ||
    value.slice(0, 4) < "1900"
  )
    fail(400, "Ngày sinh không tồn tại.");
  const today = now.toISOString().slice(0, 10);
  const age =
    now.getUTCFullYear() -
    date.getUTCFullYear() -
    (today.slice(5) < value.slice(5) ? 1 : 0);
  if (age < Number(process.env.MIN_AGE || 13) || value > today)
    fail(400, `Tuổi tối thiểu là ${process.env.MIN_AGE || 13}.`);
  return value;
}
function phone(value) {
  if (value === "" || value === null || value === undefined) {
    if (process.env.PHONE_REQUIRED === "true")
      fail(400, "Cần nhập số điện thoại Việt Nam.");
    return null;
  }
  if (
    typeof value !== "string" ||
    value.length > 32 ||
    !/^[+\d(). -]+$/.test(value)
  )
    fail(400, "Số điện thoại không hợp lệ.");
  const number = parsePhoneNumberFromString(value, "VN");
  if (!number || number.country !== "VN" || !number.isValid())
    fail(400, "Số điện thoại Việt Nam không hợp lệ.");
  return number.number;
}
function profile(body) {
  return {
    handle: handle(body.handle),
    displayName: text(body.displayName ?? body.username, "Tên hiển thị", 100),
    dateOfBirth: birthday(body.dateOfBirth),
    phone: phone(body.phone),
    bio:
      body.bio === undefined || body.bio === ""
        ? ""
        : text(body.bio, "Giới thiệu", 300),
    showPhone: boolean(body.showPhone),
    showBirthday: boolean(body.showBirthday),
  };
}
function boolean(value) {
  if (value === undefined) return false;
  if (typeof value !== "boolean")
    fail(400, "Quyền riêng tư phải là true/false.");
  return value;
}
module.exports = { email, password, handle, birthday, phone, profile };
