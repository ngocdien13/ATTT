"use strict";
const crypto = require("node:crypto"),
  db = require("../config/database");
const { uuid, fail, base64 } = require("../utils/api");
const { transaction, conversationPair } = require("../utils/transactions");
const s = require("../services/v2");
async function access(c, scope, id, user) {
  if (scope === "group") return s.groupAccess(c, id, user);
  if (scope === "direct") return conversationPair(c, id, user);
  fail(400, "Cuộc trò chuyện không hợp lệ.");
}
async function list(req, res) {
  const user = req.session.userId;
  const [direct] = await db
    .promise()
    .query(
      `SELECT c.id,u.id AS peer_id,u.username AS name,p.avatar_key,p.handle,f.status AS friendship_status,f.blocked_by,c.created_at FROM conversations c JOIN conversation_members a ON a.conversation_id=c.id AND a.user_id=? JOIN conversation_members b ON b.conversation_id=c.id AND b.user_id<>? JOIN users u ON u.id=b.user_id LEFT JOIN user_profiles p ON p.user_id=u.id LEFT JOIN friendships f ON f.user1_id=LEAST(a.user_id,b.user_id) AND f.user2_id=GREATEST(a.user_id,b.user_id) ORDER BY c.created_at DESC LIMIT 200`,
      [user, user],
    );
  const [groups] = await db
    .promise()
    .query(
      "SELECT g.id,g.name,g.created_at,p.active,p.role FROM chat_groups g JOIN group_participants p ON p.group_id=g.id WHERE p.user_id=? ORDER BY g.created_at DESC LIMIT 200",
      [user],
    );
  const [prefs] = await db
    .promise()
    .query("SELECT * FROM thread_preferences WHERE user_id=?", [user]);
  const [messages] = await db.promise().query(
    `WITH available AS (
 SELECT m.id,'direct' AS scope,m.conversation_id AS thread_id,m.sender_id,m.created_at,'legacy' AS kind,NULL AS envelope,m.ciphertext,m.nonce,m.sender_public_key,m.self_ciphertext,m.self_nonce,m.self_public_key FROM messages m JOIN conversation_members p ON p.conversation_id=m.conversation_id AND p.user_id=?
 UNION ALL SELECT m.id,IF(m.group_id IS NULL,'direct','group'),COALESCE(m.group_id,m.conversation_id),m.sender_id,m.created_at,'v2',m.envelope,NULL,NULL,NULL,NULL,NULL,NULL FROM v2_messages m JOIN v2_message_recipients r ON r.message_id=m.id AND r.user_id=?), ranked AS (SELECT *,ROW_NUMBER() OVER(PARTITION BY scope,thread_id ORDER BY created_at DESC,id DESC) AS n FROM available) SELECT * FROM ranked WHERE n=1`,
    [user, user],
  );
  const [unread] = await db.promise().query(
    `SELECT z.scope,z.thread_id,COUNT(*) AS n FROM (
 SELECT 'direct' AS scope,m.conversation_id AS thread_id,m.created_at FROM messages m JOIN conversation_members p ON p.conversation_id=m.conversation_id AND p.user_id=? WHERE m.sender_id<>?
 UNION ALL SELECT IF(m.group_id IS NULL,'direct','group'),COALESCE(m.group_id,m.conversation_id),m.created_at FROM v2_messages m JOIN v2_message_recipients r ON r.message_id=m.id AND r.user_id=? WHERE m.sender_id<>?) z LEFT JOIN thread_preferences p ON p.user_id=? AND p.scope=z.scope AND p.thread_id=z.thread_id WHERE p.read_at IS NULL OR z.created_at>p.read_at GROUP BY z.scope,z.thread_id`,
    [user, user, user, user, user],
  );
  const result = [];
  for (const room of [
    ...direct.map((x) => ({ ...x, scope: "direct" })),
    ...groups.map((x) => ({ ...x, scope: "group" })),
  ]) {
    const pref =
        prefs.find((x) => x.scope === room.scope && x.thread_id === room.id) ||
        {},
      last = messages.find(
        (x) => x.scope === room.scope && x.thread_id === room.id,
      );
    if (
      pref.hidden_at &&
      (!last || new Date(last.created_at) <= new Date(pref.hidden_at))
    )
      continue;
    const entry = {
      ...room,
      pinned: !!pref.pinned,
      archived: !!pref.archived,
      mutedUntil: pref.muted_until,
      unread: Number(
        unread.find((x) => x.scope === room.scope && x.thread_id === room.id)
          ?.n || 0,
      ),
      markedUnread: !!pref.marked_unread,
      last: last
        ? { ...last, envelope: last.envelope ? s.json(last.envelope) : null }
        : null,
    };
    result.push(entry);
  }
  result.sort(
    (a, b) =>
      Number(b.pinned) - Number(a.pinned) ||
      new Date(b.last?.created_at || b.created_at) -
        new Date(a.last?.created_at || a.created_at) ||
      a.id.localeCompare(b.id),
  );
  res.json({ threads: result });
}
async function preference(req, res) {
  const scope = req.params.scope,
    id = uuid(req.params.id),
    user = req.session.userId,
    b = req.body;
  const allowed = [
    "pinned",
    "archived",
    "mutedSeconds",
    "markedUnread",
    "hide",
  ];
  if (Object.keys(b).some((k) => !allowed.includes(k)))
    fail(400, "Thao tác không hợp lệ.");
  for (const k of ["pinned", "archived", "markedUnread", "hide"])
    if (k in b && typeof b[k] !== "boolean") fail(400, "Giá trị không hợp lệ.");
  if (
    "mutedSeconds" in b &&
    ![0, 3600, 28800, 172800, 315360000].includes(b.mutedSeconds)
  )
    fail(400, "Thời hạn tắt thông báo không hợp lệ.");
  await transaction(async (c) => {
    await access(c, scope, id, user);
    await c.query(
      "INSERT IGNORE INTO thread_preferences(user_id,scope,thread_id) VALUES (?,?,?)",
      [user, scope, id],
    );
    const fields = [],
      values = [];
    for (const [k, col] of Object.entries({
      pinned: "pinned",
      archived: "archived",
      markedUnread: "marked_unread",
    }))
      if (k in b) {
        fields.push(col + "=?");
        values.push(b[k]);
      }
    if ("mutedSeconds" in b) {
      fields.push("muted_until=?");
      values.push(
        b.mutedSeconds ? new Date(Date.now() + b.mutedSeconds * 1000) : null,
      );
    }
    if ("hide" in b) {
      fields.push("hidden_at=?");
      values.push(b.hide ? new Date() : null);
    }
    if (fields.length)
      await c.query(
        "UPDATE thread_preferences SET " +
          fields.join(",") +
          " WHERE user_id=? AND scope=? AND thread_id=?",
        [...values, user, scope, id],
      );
  });
  res.json({ ok: true });
}
async function read(req, res) {
  const scope = req.params.scope,
    id = uuid(req.params.id),
    user = req.session.userId,
    mid = uuid(req.body.messageId);
  await transaction(async (c) => {
    await access(c, scope, id, user);
    let row;
    if (req.body.kind === "legacy" && scope === "direct")
      [[row]] = await c.query(
        "SELECT DATE_FORMAT(created_at,'%Y-%m-%d %H:%i:%s.%f') AS created_at FROM messages WHERE id=? AND conversation_id=?",
        [mid, id],
      );
    else
      [[row]] = await c.query(
        `SELECT DATE_FORMAT(m.created_at,'%Y-%m-%d %H:%i:%s.%f') AS created_at FROM v2_messages m JOIN v2_message_recipients r ON r.message_id=m.id AND r.user_id=? WHERE m.id=? AND m.${scope === "group" ? "group_id" : "conversation_id"}=?`,
        [user, mid, id],
      );
    if (!row) fail(404, "Không tìm thấy tin nhắn.");
    await c.query(
      "INSERT INTO thread_preferences(user_id,scope,thread_id,read_at) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE read_at=GREATEST(COALESCE(read_at,VALUES(read_at)),VALUES(read_at)),marked_unread=FALSE,hidden_at=NULL",
      [user, scope, id, row.created_at],
    );
  });
  res.json({ ok: true });
}
async function notes(req, res) {
  const [rows] = await db
    .promise()
    .query(
      "SELECT id,iv,ciphertext,created_at FROM saved_notes WHERE user_id=? ORDER BY created_at DESC LIMIT 200",
      [req.session.userId],
    );
  res.json({ notes: rows });
}
async function save(req, res) {
  const id = uuid(req.body.id),
    iv = base64(req.body.iv, "IV", { bytes: 12 }),
    ct = base64(req.body.ciphertext, "Nội dung", { min: 16, max: 16384 });
  await require("../services/accountSecurity").consumeLimit(
    "notes:" + req.session.userId,
    30,
    60,
    res,
  );
  await transaction(async (c) => {
    await c.query("SELECT id FROM users WHERE id=? FOR UPDATE", [
      req.session.userId,
    ]);
    const [[count]] = await c.query(
      "SELECT COUNT(*) AS n FROM saved_notes WHERE user_id=?",
      [req.session.userId],
    );
    if (count.n >= 200)
      fail(409, "Bạn đã lưu 200 ghi chú. Xóa bớt để lưu thêm.");
    await c.query(
      "INSERT INTO saved_notes(id,user_id,iv,ciphertext) VALUES (?,?,?,?)",
      [id, req.session.userId, iv, ct],
    );
  });
  res.status(201).json({ id });
}
async function removeNote(req, res) {
  await db
    .promise()
    .query("DELETE FROM saved_notes WHERE id=? AND user_id=?", [
      uuid(req.params.id),
      req.session.userId,
    ]);
  res.json({ ok: true });
}
async function report(req, res) {
  const target = uuid(req.body.targetId);
  if (
    !["spam", "abuse", "other"].includes(req.body.reason) ||
    target === req.session.userId
  )
    fail(400, "Báo cáo không hợp lệ.");
  await require("../services/accountSecurity").consumeLimit(
    "report:" + req.session.userId,
    10,
    3600,
    res,
  );
  await db
    .promise()
    .query(
      "INSERT INTO abuse_reports(id,reporter_id,target_id,reason) VALUES (?,?,?,?)",
      [crypto.randomUUID(), req.session.userId, target, req.body.reason],
    );
  res.status(201).json({ message: "Đã gửi báo cáo." });
}
module.exports = { list, preference, read, notes, save, removeNote, report };
