const db = require("../config/database");
const crypto = require("crypto");

async function sendFriendRequest(req, res) {
    try {
        if (!req.session.userId) {
            return res.status(401).json({
                message: "Not authenticated"
            });
        }
        const userId = req.session.userId;
        const { targetUserId } = req.body;
        if (!targetUserId) {
            return res.status(400).json({
                message: "Target user ID is required"
            });
        }
        if (userId === targetUserId) {
            return res.status(400).json({
                message: "You cannot add yourself"
            });
        }
        const [targetUsers] = await db.promise().query(
            "SELECT id FROM users WHERE id = ?",
            [targetUserId]
        );
        if (targetUsers.length === 0) {
            return res.status(404).json({
                message: "User not found"
            });
        }
        const [existingFriendships] = await db.promise().query(
            `SELECT id, status
             FROM friendships
             WHERE (user1_id = ? AND user2_id = ?)
                OR (user1_id = ? AND user2_id = ?)`,
            [userId, targetUserId, targetUserId, userId]
        );
        if (existingFriendships.length > 0) {
            return res.status(409).json({
                message: "Friendship already exists"
            });
        }
        const user1Id = userId < targetUserId
            ? userId
            : targetUserId;
        const user2Id = userId < targetUserId
            ? targetUserId
            : userId;
        const friendshipId = crypto.randomUUID();
        await db.promise().query(
            `INSERT INTO friendships
                (id, user1_id, user2_id, requested_by, status)
             VALUES (?, ?, ?, ?, 'pending')`,
            [
                friendshipId,
                user1Id,
                user2Id,
                userId
            ]
        );
        res.status(201).json({
            message: "Friend request sent"
        });
    } catch (error) {
        console.error("Friend request error:", error);
        res.status(500).json({
            message: "Internal server error"
        });
    }
}

async function getIncomingFriendRequests(req, res) {
    try {
        if (!req.session.userId) {
            return res.status(401).json({
                message: "Not authenticated"
            });
        }
        const userId = req.session.userId;
        const [requests] = await db.promise().query(
            `SELECT
                f.id,
                f.requested_by,
                u.username,
                u.id AS user_id,
                f.created_at
             FROM friendships f
             JOIN users u
                ON u.id = f.requested_by
             WHERE
                (f.user1_id = ? OR f.user2_id = ?)
                AND f.requested_by <> ?
                AND f.status = 'pending'
             ORDER BY f.created_at DESC`,
            [userId, userId, userId]
        );
        res.json({
            requests
        });
    } catch (error) {
        console.error("Get friend requests error:", error);

        res.status(500).json({
            message: "Internal server error"
        });
    }
}
async function acceptFriendRequest(req, res) {
    try {
        if (!req.session.userId) {
            return res.status(401).json({
                message: "Not authenticated"
            });
        }

        const userId = req.session.userId;
        const { id } = req.params;

        const [friendships] = await db.promise().query(
            `SELECT id, requested_by, status
             FROM friendships
             WHERE id = ?`,
            [id]
        );

        if (friendships.length === 0) {
            return res.status(404).json({
                message: "Friend request not found"
            });
        }

        const friendship = friendships[0];

        if (friendship.status !== "pending") {
            return res.status(409).json({
                message: "Friend request is no longer pending"
            });
        }

        if (friendship.requested_by === userId) {
            return res.status(403).json({
                message: "You cannot accept your own friend request"
            });
        }

        const [result] = await db.promise().query(
            `UPDATE friendships
             SET status = 'accepted'
             WHERE id = ?
               AND status = 'pending'`,
            [id]
        );

        if (result.affectedRows === 0) {
            return res.status(409).json({
                message: "Friend request could not be accepted"
            });
        }

        res.json({
            message: "Friend request accepted"
        });

    } catch (error) {
        console.error("Accept friend request error:", error);

        res.status(500).json({
            message: "Internal server error"
        });
    }
}
async function rejectFriendRequest(req, res) {
    try {
        if (!req.session.userId) {
            return res.status(401).json({
                message: "Not authenticated"
            });
        }

        const userId = req.session.userId;
        const { id } = req.params;

        const [friendships] = await db.promise().query(
            `SELECT id, requested_by, user1_id, user2_id, status
             FROM friendships
             WHERE id = ?`,
            [id]
        );

        if (friendships.length === 0) {
            return res.status(404).json({
                message: "Friend request not found"
            });
        }

        const friendship = friendships[0];

        if (friendship.status !== "pending") {
            return res.status(409).json({
                message: "Friend request is no longer pending"
            });
        }

        if (friendship.requested_by === userId) {
            return res.status(403).json({
                message: "You cannot reject your own friend request"
            });
        }

        const [result] = await db.promise().query(
            `UPDATE friendships
             SET status = 'rejected'
             WHERE id = ?
               AND status = 'pending'`,
            [id]
        );

        if (result.affectedRows === 0) {
            return res.status(409).json({
                message: "Friend request could not be rejected"
            });
        }

        res.json({
            message: "Friend request rejected"
        });

    } catch (error) {
        console.error("Reject friend request error:", error);

        res.status(500).json({
            message: "Internal server error"
        });
    }
}
async function getFriends(req, res) {
    try {
        if (!req.session.userId) {
            return res.status(401).json({
                message: "Not authenticated"
            });
        }

        const userId = req.session.userId;

        const [friends] = await db.promise().query(
            `SELECT
                u.id,
                u.username,
                u.email
             FROM friendships f
             JOIN users u
                ON u.id = CASE
                    WHEN f.user1_id = ? THEN f.user2_id
                    ELSE f.user1_id
                END
             WHERE
                (f.user1_id = ? OR f.user2_id = ?)
                AND f.status = 'accepted'
             ORDER BY u.username`,
            [userId, userId, userId]
        );

        res.json({
            friends
        });

    } catch (error) {
        console.error("Get friends error:", error);

        res.status(500).json({
            message: "Internal server error"
        });
    }
}

module.exports = {
    sendFriendRequest,
    getIncomingFriendRequests,
    acceptFriendRequest,
    rejectFriendRequest,
    getFriends
};