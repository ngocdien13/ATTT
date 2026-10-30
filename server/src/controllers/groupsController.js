"use strict";
const crypto = require("crypto"),
  sharp = require("sharp");
const db = require("../config/database");
const { uuid, fail } = require("../utils/api");
const { transaction, lockPair, accepted } = require("../utils/transactions");
const { consumeLimit } = require("../services/accountSecurity");
const s = require("../services/v2");
async function checked(work) {
  try {
    return await work();
  } catch (e) {
    if (e.status) throw e;
    fail(400, "Chữ ký, chuỗi nhóm hoặc envelope không hợp lệ.");
  }
}
async function publishIdentity(req, res) {
  await consumeLimit("v2-identity:" + req.session.userId, 10, 600, res);
  const v = await s.load(),
    record = req.body.record;
  await checked(() => v.validateIdentity(record));
  if (record.userId !== req.session.userId)
    fail(403, "Chỉ đăng ký identity của chính mình.");
  await transaction(async (c) => {
    const [[user]] = await c.query(
      "SELECT id FROM users WHERE id=? FOR UPDATE",
      [record.userId],
    );
    if (!user) fail(401, "Tài khoản không tồn tại.");
    const [[key]] = await c.query(
      "SELECT public_key FROM public_keys WHERE user_id=?",
      [record.userId],
    );
    if (key?.public_key !== record.encryptionKey)
      fail(409, "Cần giữ đúng public key X25519 cũ.");
    const [[old]] = await c.query(
      "SELECT record FROM v2_identities WHERE user_id=?",
      [record.userId],
    );
    if (old) {
      if (v.canonical(s.json(old.record)) !== v.canonical(record))
        fail(409, "Identity đã tồn tại; hãy khôi phục khóa ký cũ.");
    } else
      await c.query("INSERT INTO v2_identities(user_id,record) VALUES (?,?)", [
        record.userId,
        JSON.stringify(record),
      ]);
  });
  res.json({ message: "Đã đăng ký identity v2." });
}
async function getIdentity(req, res) {
  const id = uuid(req.params.id || req.session.userId),
    record = await s.identity(db.promise(), id);
  res.json({ identity: record });
}
async function writeEvent(c, event, hash) {
  const d = event.document;
  await c.query(
    "INSERT INTO group_events(group_id,version,event,event_hash,actor_id) VALUES (?,?,?,?,?)",
    [d.id, d.version, JSON.stringify(event), hash, d.actorId],
  );
  await c.query(
    "UPDATE chat_groups SET head_version=?,head_hash=?,name=? WHERE id=?",
    [d.version, hash, d.name, d.id],
  );
  await c.query("UPDATE group_participants SET active=FALSE WHERE group_id=?", [
    d.id,
  ]);
  for (const m of d.members)
    await c.query(
      "INSERT INTO group_participants(group_id,user_id,active,role) VALUES (?,?,TRUE,?) ON DUPLICATE KEY UPDATE active=TRUE,role=VALUES(role)",
      [d.id, m.id, m.role],
    );
}
async function create(req, res) {
  await consumeLimit("group-create:" + req.session.userId, 10, 3600, res);
  const v = await s.load(),
    event = req.body.event;
  const valid = await checked(() => v.validateEvent(event));
  if (event.document.actorId !== req.session.userId)
    fail(403, "Actor không khớp phiên.");
  await transaction(async (c) => {
    await s.compareIdentities(c, event.document.members);
    const d = event.document;
    if (d.avatarId !== null) fail(400, "Tạo nhóm trước khi đặt avatar.");
    await c.query(
      "INSERT INTO chat_groups(id,head_version,head_hash,name) VALUES (?,?,?,?)",
      [d.id, d.version, valid.hash, d.name],
    );
    await writeEvent(c, event, valid.hash);
  });
  res.status(201).json({ groupId: event.document.id });
}
async function list(req, res) {
  const [rows] = await db
    .promise()
    .query(
      `SELECT g.id,g.name,g.head_version,p.active,p.role FROM chat_groups g JOIN group_participants p ON p.group_id=g.id WHERE p.user_id=? ORDER BY g.created_at DESC LIMIT 200`,
      [req.session.userId],
    );
  res.json({ groups: rows });
}
async function get(req, res) {
  const id = uuid(req.params.id);
  await s.groupAccess(db.promise(), id, req.session.userId, { pending: true });
  res.json({ events: await s.events(db.promise(), id) });
}
async function change(req, res) {
  await consumeLimit("group-change:" + req.session.userId, 60, 600, res);
  const id = uuid(req.params.id),
    event = req.body.event,
    v = await s.load();
  if (
    event?.document?.id !== id ||
    event.document.actorId !== req.session.userId
  )
    fail(403, "Actor/nhóm không khớp.");
  await transaction(async (c) => {
    const [[g]] = await c.query(
      "SELECT * FROM chat_groups WHERE id=? FOR UPDATE",
      [id],
    );
    if (!g) fail(404, "Nhóm không tồn tại.");
    if (
      event.document.prevHash !== g.head_hash ||
      event.document.version !== g.head_version + 1
    )
      fail(409, "Nhóm đã thay đổi. Tải lại và ký phiên bản mới.");
    const history = await checked(() =>
        s.events(c, id).then((e) => v.verifyChain(e)),
      ),
      valid = await checked(() =>
        v.validateEvent(
          event,
          history,
          new Set(
            history
              .filter((e) => e.event.document.invitation)
              .map((e) => e.event.document.invitation.document.id),
          ),
        ),
      );
    await s.compareIdentities(c, event.document.members);
    if (event.document.action === "join") {
      const invitation = event.document.invitation,
        d = invitation.document;
      const [[stored]] = await c.query(
        "SELECT * FROM group_invitations WHERE id=? AND group_id=? AND invitee_id=? AND status='pending' AND expires_at>NOW(6) FOR UPDATE",
        [d.id, id, req.session.userId],
      );
      if (
        !stored ||
        v.canonical(s.json(stored.invitation)) !== v.canonical(invitation)
      )
        fail(409, "Lời mời hết hạn/đã xử lý.");
      accepted(await lockPair(c, d.inviterId, d.inviteeId));
      await c.query(
        "UPDATE group_invitations SET status='accepted' WHERE id=?",
        [d.id],
      );
    } else await s.groupAccess(c, id, req.session.userId);
    if (event.document.avatarId) {
      const [[a]] = await c.query(
        "SELECT digest FROM group_avatars WHERE id=? AND group_id=?",
        [event.document.avatarId, id],
      );
      if (a?.digest !== event.document.avatarHash)
        fail(400, "Ảnh nhóm không khớp hash đã ký.");
    }
    await c.query("UPDATE group_invitations SET status='rejected' WHERE group_id=? AND invitee_id IN (SELECT user_id FROM group_participants WHERE group_id=? AND active=FALSE) AND status='pending'",[id,id]);
    await writeEvent(c, event, valid.hash);
    // Joining consumes all older duplicates as well.
    if (event.document.action==='join') await c.query("UPDATE group_invitations SET status='rejected' WHERE group_id=? AND invitee_id=? AND status='pending'",[id,req.session.userId]);
  });
  res.json({ message: "Đã cập nhật nhóm." });
}
async function invite(req, res) {
  await consumeLimit("group-invite:" + req.session.userId, 30, 3600, res);
  const id = uuid(req.params.id),
    invitation = req.body.invitation,
    v = await s.load();
  await transaction(async (c) => {
    const context = await s.context(c, "group", id, req.session.userId, {
      lock: true,
      sending: true,
    });
    const actor = context.members.find((m) => m.id === req.session.userId);
    if (!["owner", "admin"].includes(actor.role))
      fail(403, "Chỉ owner/admin được mời.");
    const history = await checked(() =>
        s.events(c, id).then((e) => v.verifyChain(e)),
      ),
      d = await checked(() => v.validateInvitation(invitation, history));
    if (d.inviterId !== req.session.userId || d.groupId !== id)
      fail(403, "Lời mời không thuộc actor/nhóm.");
    if (d.expiresAt <= Date.now() || d.expiresAt > Date.now() + 7 * 86400000)
      fail(400, "Lời mời tối đa 7 ngày.");
    if (context.members.some((m) => m.id === d.inviteeId))
      fail(409, "Người này đã thuộc nhóm.");
    await s.identity(c, d.inviteeId);
    accepted(await lockPair(c, req.session.userId, d.inviteeId));
    const [[pending]] = await c.query("SELECT id FROM group_invitations WHERE group_id=? AND invitee_id=? AND status='pending' AND expires_at>NOW(6) LIMIT 1",[id,d.inviteeId]);
    if (pending) fail(409,"Đã có lời mời đang chờ người này trả lời.");
    await c.query(
      "INSERT INTO group_invitations(id,group_id,invitee_id,invitation,expires_at) VALUES (?,?,?,?,?)",
      [
        d.id,
        id,
        d.inviteeId,
        JSON.stringify(invitation),
        new Date(d.expiresAt),
      ],
    );
  });
  res.status(201).json({ message: "Đã gửi lời mời nhóm." });
}
async function invitations(req, res) {
  const [rows] = await db
    .promise()
    .query(
      `SELECT i.id,i.group_id,g.name,i.invitation FROM group_invitations i JOIN chat_groups g ON g.id=i.group_id WHERE i.invitee_id=? AND i.status='pending' AND i.expires_at>NOW(6) ORDER BY i.created_at DESC LIMIT 100`,
      [req.session.userId],
    );
  res.json({
    invitations: rows.map((r) => ({ ...r, invitation: s.json(r.invitation) })),
  });
}
async function reject(req, res) {
  const [r] = await db
    .promise()
    .query(
      "UPDATE group_invitations SET status='rejected' WHERE id=? AND invitee_id=? AND status='pending'",
      [uuid(req.params.inviteId), req.session.userId],
    );
  if (!r.affectedRows) fail(404, "Không tìm thấy lời mời.");
  res.json({ message: "Đã từ chối lời mời." });
}
async function uploadAvatar(req, res) {
  await consumeLimit("group-avatar:" + req.session.userId, 10, 600, res);
  const id = uuid(req.params.id);
  const ctx = await s.context(db.promise(), "group", id, req.session.userId, {
    sending: true,
  });
  if (
    !["owner", "admin"].includes(
      ctx.members.find((m) => m.id === req.session.userId).role,
    )
  )
    fail(403, "Không có quyền đặt ảnh nhóm.");
  if (!Buffer.isBuffer(req.body) || !req.body.length)
    fail(400, "Cần ảnh binary.");
  let image;
  try {
    const p = sharp(req.body, {
        limitInputPixels: 16000000,
        animated: false,
        failOn: "warning",
      }),
      m = await p.metadata();
    if (!["png", "jpeg", "webp"].includes(m.format) || m.pages > 1)
      throw Error();
    image = await p
      .rotate()
      .resize(256, 256, { fit: "cover" })
      .webp({ quality: 80 })
      .toBuffer();
  } catch {
    fail(400, "Ảnh không hợp lệ.");
  }
  const avatarId = crypto.randomUUID(),
    hash = crypto.createHash("sha256").update(image).digest("hex");
  await db
    .promise()
    .query(
      "INSERT INTO group_avatars(id,group_id,image,digest) VALUES (?,?,?,?)",
      [avatarId, id, image, hash],
    );
  res.status(201).json({ avatarId, hash });
}
async function avatar(req, res) {
  const id = uuid(req.params.id);
  await s.groupAccess(db.promise(), id, req.session.userId, { pending: true });
  const [[a]] = await db
    .promise()
    .query("SELECT image FROM group_avatars WHERE id=? AND group_id=?", [
      uuid(req.params.avatarId),
      id,
    ]);
  if (!a) fail(404, "Ảnh không tồn tại.");
  res
    .type("image/webp")
    .set("Cache-Control", "private, max-age=300")
    .send(a.image);
}
module.exports = {
  checked,
  publishIdentity,
  getIdentity,
  create,
  list,
  get,
  change,
  invite,
  invitations,
  reject,
  uploadAvatar,
  avatar,
};
