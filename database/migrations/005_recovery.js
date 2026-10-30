"use strict";
exports.up = async (c) => {
  await c.query(`CREATE TABLE IF NOT EXISTS recovery_vaults (
    user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    version CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    pin_salt VARCHAR(48) CHARACTER SET ascii NOT NULL,
    pin_verifier VARCHAR(255) CHARACTER SET ascii NOT NULL,
    code_verifier CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    gate_ciphertext VARCHAR(128) CHARACTER SET ascii NOT NULL,
    pin_wrap JSON NOT NULL, code_wrap JSON NOT NULL,
    pin_failures INT UNSIGNED NOT NULL DEFAULT 0,
    pin_locked_until TIMESTAMP(6) NULL DEFAULT NULL,
    code_failures INT UNSIGNED NOT NULL DEFAULT 0,
    code_locked_until TIMESTAMP(6) NULL DEFAULT NULL,
    updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    FOREIGN KEY(user_id) REFERENCES users(id)
  ) ENGINE=InnoDB`);
  const [[setting]] = await c.query(
    "SELECT @@SESSION.sql_safe_updates AS enabled",
  );
  await c.query("SET SESSION sql_safe_updates=0");
  try {
    // Old duplicate pending invitations become rejected; keep one active invitation per group/person.
    await c.query(`UPDATE group_invitations a JOIN group_invitations b
    ON a.group_id=b.group_id AND a.invitee_id=b.invitee_id
    AND (a.created_at<b.created_at OR (a.created_at=b.created_at AND a.id<b.id))
    SET a.status='rejected' WHERE a.status='pending' AND b.status='pending'`);
  } finally {
    await c.query("SET SESSION sql_safe_updates=?", [Number(setting.enabled)]);
  }
};
