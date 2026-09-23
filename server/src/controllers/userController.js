const db = require("../config/database");
async function getUserById(req, res) {
    try {
        const { id } = req.params;
        const [users] = await db.promise().query(
            `SELECT id, username, created_at
             FROM users
             WHERE id = ?`,
            [id]
        );
        if (users.length === 0) {
            return res.status(404).json({
                message: "User not found"
            });
        }
        res.json({
            user: users[0]
        });
    } catch (error) {
        console.error("Get user error:", error);
        res.status(500).json({
            message: "Internal server error"
        });
    }
}

module.exports = {
    getUserById
};