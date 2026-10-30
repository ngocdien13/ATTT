"use strict";
const crypto = require("crypto");
const { pipeline } = require("stream/promises");
const db = require("../config/database"),
  { fail, uuid } = require("../utils/api"),
  { transaction } = require("../utils/transactions");
const { consumeLimit } = require("../services/accountSecurity"),
  s = require("../services/v2"),
  { storage } = require("../services/ciphertextStorage");
function limits() {
  const number = (name, def, max) => {
    const n = Number(process.env[name] || def);
    if (!Number.isSafeInteger(n) || n < 1 || n > max)
      throw Error("Invalid " + name);
    return n;
  };
  return {
    maxFileBytes: number("MAX_FILE_BYTES", 10 * 1024 * 1024, 50 * 1024 * 1024),
    userQuotaBytes: number(
      "FILE_USER_QUOTA_BYTES",
      100 * 1024 * 1024,
      1024 ** 4,
    ),
    globalQuotaBytes: number("FILE_GLOBAL_QUOTA_BYTES", 1024 ** 3, 1024 ** 5),
    allowedExtensions: (
      process.env.FILE_ALLOWED_EXTENSIONS || "jpg,jpeg,png,webp,pdf,txt,docx"
    )
      .split(",")
      .map((x) => x.trim().toLowerCase())
      .filter((x) => /^[a-z0-9]{1,10}$/.test(x)),
  };
}
async function config(req, res) {
  res.json(limits());
}
async function reserve(req, res) {
  await consumeLimit("file-reserve:" + req.session.userId, 30, 3600, res);
  const { id, scope, scopeId, membershipVersion, rosterHash, bytes, hash } =
    req.body;
  uuid(id);
  uuid(scopeId);
  const policy = limits();
  if (
    !Number.isSafeInteger(bytes) ||
    bytes < 16 ||
    bytes > policy.maxFileBytes + 16 ||
    !/^[a-f0-9]{64}$/.test(hash)
  )
    fail(400, "Kích thước/hash file không hợp lệ.");
  await transaction(async (c) => {
    // One InnoDB row serializes reservations until commit, across all owners.
    await c.query("SELECT id FROM attachment_quota_lock WHERE id=1 FOR UPDATE");
    const ctx = await s.context(c, scope, scopeId, req.session.userId, {
      lock: true,
      sending: true,
    });
    if (ctx.version !== membershipVersion || ctx.hash !== rosterHash)
      fail(409, "Thành viên đã thay đổi.");
    const [[q]] = await c.query(
      "SELECT COALESCE(SUM(expected_bytes),0) total,COALESCE(SUM(IF(owner_id=?,expected_bytes,0)),0) own FROM encrypted_attachments",
      [req.session.userId],
    );
    if (
      Number(q.own) + bytes > policy.userQuotaBytes ||
      Number(q.total) + bytes > policy.globalQuotaBytes
    )
      fail(413, "Đã vượt quota lưu trữ file.");
    await c.query(
      "INSERT INTO encrypted_attachments(id,owner_id,group_id,conversation_id,member_version,roster_hash,expected_bytes,ciphertext_hash,storage_key,expires_at) VALUES (?,?,?,?,?,?,?,?,?,DATE_ADD(NOW(6),INTERVAL 1 DAY))",
      [
        id,
        req.session.userId,
        scope === "group" ? scopeId : null,
        scope === "direct" ? scopeId : null,
        membershipVersion,
        rosterHash,
        bytes,
        hash,
        crypto.randomUUID(),
      ],
    );
  });
  res
    .status(201)
    .json({ id, message: "Đã giữ quota. Upload ciphertext trong 24 giờ." });
}
async function upload(req, res) {
  req.setTimeout(120000, () => req.destroy());
  await consumeLimit("file-upload:" + req.session.userId, 60, 3600, res);
  const id = uuid(req.params.id);
  if (!req.is("application/octet-stream"))
    fail(415, "Chỉ nhận binary application/octet-stream.");
  let record;
  await transaction(async (c) => {
    const [[r]] = await c.query(
      "SELECT * FROM encrypted_attachments WHERE id=? FOR UPDATE",
      [id],
    );
    if (!r || r.owner_id !== req.session.userId)
      fail(404, "Không tìm thấy upload.");
    if (r.state !== "pending" || new Date(r.expires_at) <= new Date())
      fail(409, "Upload không ở trạng thái chờ.");
    if (
      req.get("Content-Length") &&
      Number(req.get("Content-Length")) !== Number(r.expected_bytes)
    )
      fail(400, "Content-Length không khớp.");
    record = r;
    await c.query(
      "UPDATE encrypted_attachments SET state='uploading' WHERE id=?",
      [id],
    );
  });
  try {
    await storage().put(
      record.storage_key,
      req,
      Number(record.expected_bytes),
      record.ciphertext_hash,
    );
    await db
      .promise()
      .query(
        "UPDATE encrypted_attachments SET state='ready' WHERE id=? AND state='uploading'",
        [id],
      );
  } catch (error) {
    await storage().remove(record.storage_key);
    await db
      .promise()
      .query(
        "UPDATE encrypted_attachments SET state='pending' WHERE id=? AND state='uploading'",
        [id],
      );
    if (error.status)
      fail(error.status, "File bị thiếu, sai hash hoặc vượt kích thước.");
    throw error;
  }
  res.json({ id, message: "Đã tải ciphertext. Chưa công bố tin nhắn." });
}
async function download(req, res) {
  const id = uuid(req.params.id);
  const [[a]] = await db
    .promise()
    .query("SELECT * FROM encrypted_attachments WHERE id=?", [id]);
  if (!a) fail(404, "Không tìm thấy file.");
  if (a.state === "attached") {
    const [[r]] = await db
      .promise()
      .query(
        "SELECT user_id FROM v2_message_recipients WHERE message_id=? AND user_id=?",
        [a.message_id, req.session.userId],
      );
    if (!r) fail(403, "Bạn không có khóa/quyền tải file này.");
  } else if (
    a.owner_id !== req.session.userId ||
    a.state !== "ready" ||
    new Date(a.expires_at) <= new Date()
  )
    fail(403, "File chưa công bố hoặc hết hạn.");
  res.set({
    "Content-Type": "application/octet-stream",
    "Content-Length": String(a.expected_bytes),
    "Content-Disposition": 'attachment; filename="encrypted-' + id + '.bin"',
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
  });
  try {
    await pipeline(storage().read(a.storage_key), res);
  } catch (error) {
    if (!res.headersSent) fail(404, "Ciphertext không có trong kho.");
    res.destroy();
  }
}
async function cancel(req, res) {
  const id = uuid(req.params.id);
  await transaction(async (c) => {
    const [[a]] = await c.query(
      "SELECT * FROM encrypted_attachments WHERE id=? FOR UPDATE",
      [id],
    );
    if (!a || a.owner_id !== req.session.userId)
      fail(404, "Không tìm thấy upload.");
    if (a.state === "attached" || a.state === "uploading")
      fail(409, "Không thể hủy file đã công bố/đang tải.");
    await storage().remove(a.storage_key);
    await c.query("DELETE FROM encrypted_attachments WHERE id=?", [id]);
  });
  res.json({ message: "Đã hủy upload chưa công bố." });
}
module.exports = { limits, config, reserve, upload, download, cancel };
