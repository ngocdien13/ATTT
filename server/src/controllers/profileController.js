"use strict";
const sharp = require("sharp");
const db = require("../config/database");
const { fail, uuid } = require("../utils/api");
const { transaction } = require("../utils/transactions");
const v = require("../services/validation");
const { consumeLimit } = require("../services/accountSecurity");
async function readProfile(id, owner = false) {
  const [[p]] = await db
    .promise()
    .query(
      `SELECT p.*,u.email,u.email_verified_at FROM user_profiles p JOIN users u ON u.id=p.user_id WHERE p.user_id=?`,
      [id],
    );
  if (!p) fail(404, "Không tìm thấy hồ sơ.");
  const result = {
    id: p.user_id,
    handle: p.handle,
    displayName: p.display_name,
    bio: p.bio,
    avatarUrl: p.avatar_key
      ? "/api/profiles/" + id + "/avatar?v=" + encodeURIComponent(p.avatar_key)
      : null,
  };
  const date = p.date_of_birth
    ? new Date(p.date_of_birth).toISOString().slice(0, 10)
    : null;
  if (owner)
    Object.assign(result, {
      email: p.email,
      emailVerified: !!p.email_verified_at,
      dateOfBirth: date,
      phone: p.phone_e164,
      phoneVerified: !!p.phone_verified_at,
      showPhone: !!p.show_phone,
      showBirthday: !!p.show_birthday,
    });
  else {
    if (p.show_phone && p.phone_verified_at) result.phone = p.phone_e164;
    if (p.show_birthday && date) result.birthday = date.slice(5);
  }
  return result;
}
async function me(req, res) {
  res.json({ profile: await readProfile(req.session.userId, true) });
}
async function update(req, res) {
  const p = v.profile(req.body),
    id = req.session.userId;
  await consumeLimit("profile:" + id, 30, 600, res);
  await transaction(async (c) => {
    await c.query("SELECT id FROM users WHERE id=? FOR UPDATE", [id]);
    const [[old]] = await c.query(
      "SELECT handle FROM user_profiles WHERE user_id=?",
      [id],
    );
    if (/^u_[a-f0-9]{32}$/.test(p.handle) && p.handle !== old?.handle)
      fail(400, "Handle này được dành riêng cho tài khoản cũ.");
    await c.query(
      `UPDATE user_profiles SET handle=?,display_name=?,date_of_birth=?,
            phone_verified_at=IF(phone_e164 <=> ?,phone_verified_at,NULL),phone_e164=?,bio=?,show_phone=?,show_birthday=? WHERE user_id=?`,
      [
        p.handle,
        p.displayName,
        p.dateOfBirth,
        p.phone,
        p.phone,
        p.bio,
        p.showPhone,
        p.showBirthday,
        id,
      ],
    );
    // Compatibility label for existing Java/friendship/conversation APIs.
    await c.query("UPDATE users SET username=? WHERE id=?", [
      p.displayName,
      id,
    ]);
  });
  res.json({ profile: await readProfile(id, true) });
}
async function get(req, res) {
  res.json({
    profile: await readProfile(
      uuid(req.params.id),
      req.params.id === req.session.userId,
    ),
  });
}
async function search(req, res) {
  await consumeLimit("search:" + req.session.userId, 40, 60, res);
  const q =
    typeof req.query.q === "string"
      ? req.query.q.trim().toLowerCase().replace(/^@/, "")
      : "";
  if (!/^[a-z0-9_]{3,40}$/.test(q)) fail(400, "Nhập ít nhất 3 ký tự handle.");
  const [rows] = await db.promise().query(
    `SELECT p.user_id AS id,p.handle,p.display_name AS displayName FROM user_profiles p
        WHERE p.handle LIKE ? ESCAPE '=' ORDER BY p.handle LIMIT 20`,
    [q.replaceAll("_", "=_") + "%"],
  );
  res.json({ users: rows });
}
async function avatar(req, res) {
  const id = uuid(req.params.id),
    [[row]] = await db
      .promise()
      .query("SELECT image FROM profile_avatars WHERE user_id=?", [id]);
  if (!row) fail(404, "Chưa có ảnh đại diện.");
  res.set({
    "Content-Type": "image/webp",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, max-age=300",
    "Content-Security-Policy": "default-src 'none'; sandbox",
  });
  res.send(row.image);
}
async function uploadAvatar(req, res) {
  await consumeLimit("avatar:" + req.session.userId, 10, 600, res);
  if (!Buffer.isBuffer(req.body) || !req.body.length)
    fail(400, "Cần gửi dữ liệu ảnh PNG/JPEG/WebP.");
  let image;
  try {
    const pipeline = sharp(req.body, {
      limitInputPixels: 16000000,
      animated: false,
      failOn: "warning",
    });
    const metadata = await pipeline.metadata();
    if (
      !["png", "jpeg", "webp"].includes(metadata.format) ||
      metadata.pages > 1
    )
      fail(400, "Chỉ nhận PNG/JPEG/WebP tĩnh.");
    image = await pipeline
      .rotate()
      .resize(256, 256, { fit: "cover" })
      .webp({ quality: 80 })
      .toBuffer();
  } catch {
    fail(400, "Ảnh không hợp lệ, quá lớn hoặc không được hỗ trợ.");
  }
  await transaction(async (c) => {
    await c.query(
      "INSERT INTO profile_avatars(user_id,image) VALUES (?,?) ON DUPLICATE KEY UPDATE image=VALUES(image)",
      [req.session.userId, image],
    );
    await c.query("UPDATE user_profiles SET avatar_key=? WHERE user_id=?", [
      require("crypto").randomUUID(),
      req.session.userId,
    ]);
  });
  res.json({ profile: await readProfile(req.session.userId, true) });
}
async function deleteAvatar(req, res) {
  await transaction(async (c) => {
    await c.query("DELETE FROM profile_avatars WHERE user_id=?", [
      req.session.userId,
    ]);
    await c.query("UPDATE user_profiles SET avatar_key=NULL WHERE user_id=?", [
      req.session.userId,
    ]);
  });
  res.json({ profile: await readProfile(req.session.userId, true) });
}
module.exports = {
  me,
  update,
  get,
  search,
  avatar,
  uploadAvatar,
  deleteAvatar,
};
