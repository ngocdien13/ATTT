"use strict";
exports.up = async (c) => {
  await c.query(
    "CREATE TABLE IF NOT EXISTS attachment_quota_lock (id TINYINT UNSIGNED PRIMARY KEY) ENGINE=InnoDB",
  );
  await c.query("INSERT IGNORE INTO attachment_quota_lock(id) VALUES (1)");
  await c.query(`CREATE TABLE IF NOT EXISTS encrypted_attachments (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  owner_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  group_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  conversation_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  member_version INT UNSIGNED NOT NULL,roster_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  expected_bytes INT UNSIGNED NOT NULL,ciphertext_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  storage_key CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
  state ENUM('pending','uploading','ready','attached') NOT NULL DEFAULT 'pending',
  message_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL UNIQUE,
  expires_at TIMESTAMP(6) NOT NULL,created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  KEY idx_attachment_owner(owner_id,state),KEY idx_attachment_expiry(state,expires_at),
  FOREIGN KEY(owner_id) REFERENCES users(id),FOREIGN KEY(group_id) REFERENCES chat_groups(id),
  FOREIGN KEY(conversation_id) REFERENCES conversations(id),FOREIGN KEY(message_id) REFERENCES v2_messages(id),
  CHECK ((group_id IS NULL) <> (conversation_id IS NULL))
 ) ENGINE=InnoDB`);
};
