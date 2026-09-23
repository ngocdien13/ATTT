const express = require("express");
const session = require("express-session");
const db = require("./config/database.js");
const { register, login } = require("./controllers/authController");
const app = express();
app.use(express.static("../client"));
const PORT = 3000;
const { getUserById } = require("./controllers/userController");
const {
    sendFriendRequest,
    getIncomingFriendRequests,
    acceptFriendRequest,
    rejectFriendRequest,
    getFriends
} = require("./controllers/friendshipController");

app.use(express.json());
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: false,
        sameSite: "lax"
    }
}));
app.get("/", (req, res) => {
    res.send("Secure Chat Server is running!");
});
app.post("/api/auth/register", register);
app.post("/api/auth/login", login);
app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((error) => {
        if (error) {
            console.error("Logout error:", error);

            return res.status(500).json({
                message: "Logout failed"
            });
        }

        res.clearCookie("connect.sid");

        res.json({
            message: "Logout successful"
        });
    });
});

app.get("/api/auth/me", async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({
            message: "Not authenticated"
        });
    }
    try {
        const [users] = await db.promise().query(
            "SELECT id, username, email FROM users WHERE id = ?",
            [req.session.userId]
        );
        if (users.length === 0) {
            return res.status(401).json({
                message: "User not found"
            });
        }
        res.json({
            user: users[0]
        });
    } catch (error) {
        console.error("Get current user error:", error);
        res.status(500).json({
            message: "Internal server error"
        });
    }
});

app.get("/api/users/:id", getUserById);
app.post("/api/friendships/request", sendFriendRequest);
app.get(
    "/api/friendships/requests",
    getIncomingFriendRequests
);
app.post(
    "/api/friendships/:id/accept",
    acceptFriendRequest
);
app.post(
    "/api/friendships/:id/reject",
    rejectFriendRequest
);
app.get("/api/friendships", getFriends);

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
