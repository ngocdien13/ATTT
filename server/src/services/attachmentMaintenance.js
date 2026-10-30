"use strict";
const fs = require("fs"),
  path = require("path");
const db = require("../config/database"),
  { transaction } = require("../utils/transactions"),
  { storage } = require("./ciphertextStorage");
async function cleanupAttachments() {
  let files = 0;
  const disk = storage();
  for (let i = 0; i < 1000; i++) {
    const removed = await transaction(async (c) => {
      const [[a]] = await c.query(
        "SELECT id,storage_key FROM encrypted_attachments WHERE state<>'attached' AND expires_at<DATE_SUB(NOW(6),INTERVAL 1 HOUR) ORDER BY expires_at LIMIT 1 FOR UPDATE",
      );
      if (!a) return false;
      await disk.remove(a.storage_key);
      await c.query("DELETE FROM encrypted_attachments WHERE id=?", [a.id]);
      return true;
    });
    if (!removed) break;
    files++;
  }
  let temporary = 0;
  let names = [];
  try {
    names = await fs.promises.readdir(disk.root);
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  for (const name of names) {
    if (!/^[a-f0-9-]{36}\.bin\.tmp$/.test(name)) continue;
    const file = path.join(disk.root, name),
      stat = await fs.promises.lstat(file);
    if (stat.isFile() && stat.mtimeMs < Date.now() - 25 * 3600000) {
      await fs.promises.unlink(file);
      temporary++;
    }
  }
  const [avatars] = await db.promise()
    .query(`DELETE a FROM group_avatars a LEFT JOIN chat_groups g ON g.id=a.group_id
  LEFT JOIN group_events e ON e.group_id=g.id AND e.version=g.head_version AND JSON_UNQUOTE(JSON_EXTRACT(e.event,'$.document.avatarId'))=a.id
  WHERE a.created_at<DATE_SUB(NOW(6),INTERVAL 1 DAY) AND e.group_id IS NULL`);
  return {
    orphanCiphertexts: files,
    temporaryCiphertexts: temporary,
    unusedGroupAvatars: avatars.affectedRows,
  };
}
module.exports = { cleanupAttachments };
