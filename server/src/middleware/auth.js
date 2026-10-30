const db = require("../config/database");
const { hash } = require("../services/accountSecurity");
module.exports = async (req, res, next) => {
  try {
    if (!req.session?.userId)
      return res.status(401).json({ message: "Bạn chưa đăng nhập." });
    const [[row]] = await db.promise().query(
      `SELECT u.auth_version,u.suspended_at,s.revoked_at,s.expires_at
            FROM users u JOIN account_sessions s ON s.user_id=u.id WHERE u.id=? AND s.id=?`,
      [req.session.userId, hash(req.sessionID)],
    );
    if (
      !row ||
      row.suspended_at ||
      row.auth_version !== req.session.authVersion ||
      row.revoked_at ||
      new Date(row.expires_at) <= new Date()
    ) {
      return req.session.destroy(() =>
        res.status(401).json({
          message: "Phiên đã hết hạn hoặc bị thu hồi. Vui lòng đăng nhập lại.",
        }),
      );
    }
    await db
      .promise()
      .query(
        "UPDATE account_sessions SET last_seen_at=NOW(6) WHERE id=? AND last_seen_at < DATE_SUB(NOW(6),INTERVAL 5 MINUTE)",
        [hash(req.sessionID)],
      );
    next();
  } catch (error) {
    next(error);
  }
};
