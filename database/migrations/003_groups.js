"use strict";
exports.up = async (c) => {
  await c.query(`CREATE TABLE IF NOT EXISTS v2_identities (
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  record JSON NOT NULL,created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  FOREIGN KEY(user_id) REFERENCES users(id)
 ) ENGINE=InnoDB`);
  await c.query(`CREATE TABLE IF NOT EXISTS chat_groups (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  head_version INT UNSIGNED NOT NULL,head_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  name VARCHAR(100) NOT NULL,created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await c.query(`CREATE TABLE IF NOT EXISTS group_events (
  group_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  version INT UNSIGNED NOT NULL,event JSON NOT NULL,event_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  actor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),PRIMARY KEY(group_id,version),
  FOREIGN KEY(group_id) REFERENCES chat_groups(id),FOREIGN KEY(actor_id) REFERENCES users(id)
 ) ENGINE=InnoDB`);
  await c.query(`CREATE TABLE IF NOT EXISTS group_participants (
  group_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  active BOOLEAN NOT NULL,role ENUM('owner','admin','member') NOT NULL,
  joined_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),PRIMARY KEY(group_id,user_id),KEY idx_participant_user(user_id,active),
  FOREIGN KEY(group_id) REFERENCES chat_groups(id),FOREIGN KEY(user_id) REFERENCES users(id)
 ) ENGINE=InnoDB`);
  await c.query(`CREATE TABLE IF NOT EXISTS group_invitations (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  group_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  invitee_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  invitation JSON NOT NULL,status ENUM('pending','accepted','rejected') NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMP(6) NOT NULL,created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  KEY idx_invitee(invitee_id,status,expires_at),FOREIGN KEY(group_id) REFERENCES chat_groups(id),FOREIGN KEY(invitee_id) REFERENCES users(id)
 ) ENGINE=InnoDB`);
  await c.query(`CREATE TABLE IF NOT EXISTS group_avatars (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  group_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,image MEDIUMBLOB NOT NULL,
  digest CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  FOREIGN KEY(group_id) REFERENCES chat_groups(id)
 ) ENGINE=InnoDB`);
  await c.query(`CREATE TABLE IF NOT EXISTS v2_messages (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  group_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  conversation_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  sender_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  member_version INT UNSIGNED NOT NULL,envelope JSON NOT NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  KEY idx_v2_group_time(group_id,created_at,id),KEY idx_v2_direct_time(conversation_id,created_at,id),
  FOREIGN KEY(group_id) REFERENCES chat_groups(id),FOREIGN KEY(conversation_id) REFERENCES conversations(id),FOREIGN KEY(sender_id) REFERENCES users(id),
  CHECK ((group_id IS NULL) <> (conversation_id IS NULL))
 ) ENGINE=InnoDB`);
  await c.query(`CREATE TABLE IF NOT EXISTS v2_message_recipients (
  message_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,PRIMARY KEY(message_id,user_id),KEY idx_recipient(user_id,message_id),
  FOREIGN KEY(message_id) REFERENCES v2_messages(id),FOREIGN KEY(user_id) REFERENCES users(id)
 ) ENGINE=InnoDB`);
};
