"use strict";
const db = require("../config/database");
const { fail, uuid } = require("../utils/api");
const { transaction } = require("../utils/transactions");
const { consumeLimit } = require("../services/accountSecurity");
const s = require("../services/v2");
const { checked } = require("./groupsController");
async function direct(req, res) {
  res.json({
    context: await s.context(
      db.promise(),
      "direct",
      uuid(req.params.id),
      req.session.userId,
    ),
  });
}
async function send(req, res) {
  await consumeLimit("v2-send:" + req.session.userId, 30, 10, res);
  const e = req.body.envelope,
    v = await s.load();
  if (!e?.header) fail(400, "Thiếu envelope.");
  const h = e.header;
  if (h.senderId !== req.session.userId)
    fail(403, "Sender không khớp session.");
  uuid(h.scopeId);
  await transaction(async (c) => {
    const context = await s.context(c, h.scope, h.scopeId, req.session.userId, {
      lock: true,
      sending: true,
    });
    if (
      h.membershipVersion !== context.version ||
      h.rosterHash !== context.hash
    )
      fail(
        409,
        "Nhóm/khóa đã thay đổi. Giữ bản nháp và mã hóa lại với phiên bản mới.",
      );
    await checked(() => v.verifyEnvelope(e, context));
    let attachment;
    if (h.type === "file") {
      const [[a]] = await c.query(
        "SELECT * FROM encrypted_attachments WHERE id=? FOR UPDATE",
        [h.attachmentId],
      );
      if (
        !a ||
        a.owner_id !== req.session.userId ||
        a.state !== "ready" ||
        new Date(a.expires_at) <= new Date() ||
        a.member_version !== context.version ||
        a.roster_hash !== context.hash ||
        a.group_id !== (h.scope === "group" ? h.scopeId : null) ||
        a.conversation_id !== (h.scope === "direct" ? h.scopeId : null) ||
        Number(a.expected_bytes) !== e.file.bytes ||
        a.ciphertext_hash !== e.file.hash
      )
        fail(
          409,
          "File chưa tải xong, hết hạn hoặc không thuộc phiên bản nhóm này.",
        );
      attachment = a;
    }
    await c.query(
      "INSERT INTO v2_messages(id,group_id,conversation_id,sender_id,member_version,envelope) VALUES (?,?,?,?,?,?)",
      [
        h.id,
        h.scope === "group" ? h.scopeId : null,
        h.scope === "direct" ? h.scopeId : null,
        h.senderId,
        h.membershipVersion,
        JSON.stringify(e),
      ],
    );
    for (const m of context.members)
      await c.query(
        "INSERT INTO v2_message_recipients(message_id,user_id) VALUES (?,?)",
        [h.id, m.id],
      );
    if (attachment)
      await c.query(
        "UPDATE encrypted_attachments SET state='attached',message_id=? WHERE id=?",
        [h.id, attachment.id],
      );
  });
  res.status(201).json({ messageId: h.id });
}
async function history(req, res) {
  const scope = req.params.scope,
    id = uuid(req.params.id);
  if (!["group", "direct"].includes(scope)) fail(400, "Scope không hợp lệ.");
  if (scope === "group")
    await s.groupAccess(db.promise(), id, req.session.userId);
  else
    await require("../utils/transactions").conversationPair(
      db.promise(),
      id,
      req.session.userId,
    );
  let before = null;
  if (req.query.before !== undefined) {
    try {
      if (typeof req.query.before !== "string" || req.query.before.length > 256)
        throw Error();
      before = JSON.parse(Buffer.from(req.query.before, "base64url"));
      uuid(before.id);
      if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{6}$/.test(before.time))
        throw Error();
    } catch {
      fail(400, "Cursor không hợp lệ.");
    }
  }
  const col = scope === "group" ? "group_id" : "conversation_id";
  const [rows] = await db.promise().query(
    `SELECT m.id,m.envelope,DATE_FORMAT(m.created_at,'%Y-%m-%d %H:%i:%s.%f') AS time FROM v2_messages m JOIN v2_message_recipients r ON r.message_id=m.id AND r.user_id=?
  WHERE m.${col}=? ${before ? "AND (m.created_at < ? OR (m.created_at = ? AND m.id < ?))" : ""} ORDER BY m.created_at DESC,m.id DESC LIMIT 51`,
    [
      req.session.userId,
      id,
      ...(before ? [before.time, before.time, before.id] : []),
    ],
  );
  const selected = rows.slice(0, 50),
    last = selected.at(-1),
    next =
      rows.length > 50 && last
        ? Buffer.from(
            JSON.stringify({ time: last.time, id: last.id }),
          ).toString("base64url")
        : null;
  res.json({
    messages: selected
      .reverse()
      .map((r) => ({
        id: r.id,
        envelope: s.json(r.envelope),
        created_at: r.time.replace(" ", "T") + "Z",
      })),
    next,
  });
}
module.exports = { direct, send, history };
