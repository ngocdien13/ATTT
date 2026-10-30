"use strict";
exports.up = async (c) => {
  const [cols] = await c.query("SHOW COLUMNS FROM users LIKE 'app_role'");
  if (!cols.length)
    await c.query(
      "ALTER TABLE users ADD COLUMN app_role ENUM('user','admin','super_admin') NOT NULL DEFAULT 'user', ADD COLUMN suspended_at TIMESTAMP(6) NULL DEFAULT NULL",
    );
  await c.query(`CREATE TABLE IF NOT EXISTS thread_preferences (
 user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,scope ENUM('direct','group') NOT NULL,thread_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 pinned BOOLEAN NOT NULL DEFAULT FALSE,archived BOOLEAN NOT NULL DEFAULT FALSE,muted_until TIMESTAMP(6) NULL,marked_unread BOOLEAN NOT NULL DEFAULT FALSE,
 read_at TIMESTAMP(6) NULL,hidden_at TIMESTAMP(6) NULL,
 PRIMARY KEY(user_id,scope,thread_id),FOREIGN KEY(user_id) REFERENCES users(id)) ENGINE=InnoDB`);
  await c.query(
    `CREATE TABLE IF NOT EXISTS saved_notes (id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,iv VARCHAR(24) CHARACTER SET ascii NOT NULL,ciphertext TEXT CHARACTER SET ascii NOT NULL,created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),KEY idx_saved_user(user_id,created_at),FOREIGN KEY(user_id) REFERENCES users(id)) ENGINE=InnoDB`,
  );
  await c.query(
    `CREATE TABLE IF NOT EXISTS admin_mfa(user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,secret_ciphertext TEXT CHARACTER SET ascii NOT NULL,enabled BOOLEAN NOT NULL DEFAULT FALSE,last_counter BIGINT NOT NULL DEFAULT -1,FOREIGN KEY(user_id) REFERENCES users(id)) ENGINE=InnoDB`,
  );
  await c.query(
    `CREATE TABLE IF NOT EXISTS security_audit (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,actor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,action VARCHAR(64) CHARACTER SET ascii NOT NULL,target_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),previous_hash CHAR(64) CHARACTER SET ascii NOT NULL,entry_hash CHAR(64) CHARACTER SET ascii NOT NULL,payload TEXT NOT NULL,KEY idx_audit_time(created_at)) ENGINE=InnoDB`,
  );
  await c.query(
    "CREATE TABLE IF NOT EXISTS audit_mutex(id TINYINT UNSIGNED PRIMARY KEY) ENGINE=InnoDB",
  );
  await c.query("INSERT IGNORE INTO audit_mutex VALUES (1)");
  await c.query(
    `CREATE TABLE IF NOT EXISTS abuse_reports(id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,reporter_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,target_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,reason ENUM('spam','abuse','other') NOT NULL,status ENUM('open','reviewed','dismissed') NOT NULL DEFAULT 'open',created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),FOREIGN KEY(reporter_id) REFERENCES users(id),FOREIGN KEY(target_id) REFERENCES users(id)) ENGINE=InnoDB`,
  );
  await c.query(
    `CREATE TABLE IF NOT EXISTS captcha_tokens(token_hash CHAR(64) CHARACTER SET ascii PRIMARY KEY,expires_at TIMESTAMP(6) NOT NULL,KEY idx_captcha_expiry(expires_at)) ENGINE=InnoDB`,
  );
  const [[cfg]] = await c.query("SELECT @@SESSION.sql_safe_updates AS n");
  await c.query("SET SESSION sql_safe_updates=0");
  try {
    await c.query(
      "UPDATE sessions SET data=JSON_REMOVE(data,'$.recoveryPrepare') WHERE JSON_VALID(data) AND JSON_CONTAINS_PATH(data,'one','$.recoveryPrepare')",
    );
  } finally {
    await c.query("SET SESSION sql_safe_updates=?", [Number(cfg.n)]);
  }
};
