"use strict";
exports.up = async (c) => {
  // Each statement is safe to repeat after an operator-approved resume.
  for (const [name, definition] of [
    ["email_verified_at", "TIMESTAMP(6) NULL DEFAULT NULL"],
    ["auth_version", "INT UNSIGNED NOT NULL DEFAULT 0"],
    ["terms_accepted_at", "TIMESTAMP(6) NULL DEFAULT NULL"],
  ]) {
    const [columns] = await c.query("SHOW COLUMNS FROM users LIKE ?", [name]);
    if (!columns.length)
      await c.query(`ALTER TABLE users ADD COLUMN ${name} ${definition}`);
  }
  await c.query(`CREATE TABLE IF NOT EXISTS account_sessions (
        id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
        user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
        label VARCHAR(160) NOT NULL,
        created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        last_seen_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        expires_at TIMESTAMP(6) NOT NULL,
        revoked_at TIMESTAMP(6) NULL DEFAULT NULL,
        KEY idx_account_sessions_user(user_id,expires_at),
        FOREIGN KEY(user_id) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await c.query(`CREATE TABLE IF NOT EXISTS account_challenges (
        id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
        user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
        purpose ENUM('email','phone','reset') NOT NULL,
        destination VARCHAR(254) NOT NULL,
        token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
        attempts INT UNSIGNED NOT NULL DEFAULT 0,
        expires_at TIMESTAMP(6) NOT NULL,
        consumed_at TIMESTAMP(6) NULL DEFAULT NULL,
        created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        KEY idx_challenge_user(user_id,purpose,created_at),
        FOREIGN KEY(user_id) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await c.query(`CREATE TABLE IF NOT EXISTS account_rate_limits (
        bucket CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
        hits INT UNSIGNED NOT NULL,
        expires_at TIMESTAMP(6) NOT NULL,
        KEY idx_rate_expiry(expires_at)
    ) ENGINE=InnoDB`);
  await c.query(`CREATE TABLE IF NOT EXISTS profile_avatars (
        user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
        image MEDIUMBLOB NOT NULL,
        updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        FOREIGN KEY(user_id) REFERENCES users(id)
    ) ENGINE=InnoDB`);
};
