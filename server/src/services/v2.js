"use strict";
const db = require("../config/database");
const { fail } = require("../utils/api");
const {
  conversationPair,
  lockPair,
  accepted,
} = require("../utils/transactions");
const load = () => import("../crypto/secure-v2.mjs");
const json = (value) => (typeof value === "string" ? JSON.parse(value) : value);
async function identity(c, id) {
  const [[r]] = await c.query(
    "SELECT record FROM v2_identities WHERE user_id=?",
    [id],
  );
  if (!r)
    fail(409, "Thành viên cần đăng nhập bản mới để thiết lập khóa nhóm/file.");
  return json(r.record);
}
async function events(c, id) {
  const [r] = await c.query(
    "SELECT event FROM group_events WHERE group_id=? ORDER BY version",
    [id],
  );
  return r.map((r) => json(r.event));
}
async function groupAccess(c, id, userId, { pending = false } = {}) {
  const [[row]] = await c.query(
    "SELECT active,role FROM group_participants WHERE group_id=? AND user_id=?",
    [id, userId],
  );
  if (row) return row;
  if (pending) {
    const [[invite]] = await c.query(
      "SELECT id FROM group_invitations WHERE group_id=? AND invitee_id=? AND status='pending' AND expires_at>NOW(6)",
      [id, userId],
    );
    if (invite) return { active: false, invited: true };
  }
  fail(403, "Bạn không có quyền truy cập nhóm này.");
}
async function context(
  c,
  scope,
  id,
  userId,
  { lock = false, sending = false } = {},
) {
  const v = await load();
  if (scope === "group") {
    const [[g]] = await c.query(
      "SELECT * FROM chat_groups WHERE id=?" + (lock ? " FOR UPDATE" : ""),
      [id],
    );
    if (!g) fail(404, "Không tìm thấy nhóm.");
    const access = await groupAccess(c, id, userId);
    if (sending && !access.active)
      fail(403, "Bạn không còn là thành viên nhóm.");
    const [[row]] = await c.query(
      "SELECT event FROM group_events WHERE group_id=? AND version=?",
      [id, g.head_version],
    );
    const d = json(row.event).document;
    return {
      scope,
      id,
      version: d.version,
      hash: g.head_hash,
      members: d.members,
    };
  }
  if (scope !== "direct") fail(400, "Scope không hợp lệ.");
  const peer = await conversationPair(c, id, userId);
  if (sending) accepted(await lockPair(c, userId, peer));
  const members = [];
  for (const uid of [userId, peer].sort()) {
    const i = await identity(c, uid);
    members.push(v.memberIdentity(uid, i.encryptionKey, i.signingKey));
  }
  return v.directContext(id, members);
}
async function compareIdentities(c, members) {
  for (const member of members) {
    const i = await identity(c, member.id);
    if (
      i.encryptionKey !== member.encryptionKey ||
      i.signingKey !== member.signingKey
    )
      fail(409, "Khóa thành viên không khớp identity đã đăng ký.");
  }
}
module.exports = {
  load,
  json,
  identity,
  events,
  groupAccess,
  context,
  compareIdentities,
};
