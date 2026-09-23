const argon2 = require("argon2");
const crypto = require("crypto");
const db = require("../config/database");
async function register(req, res) {
    try {
        const { username, email, password } = req.body;
        if (!username || !email || !password) {
            return res.status(400).json({
                message: "Username, email and password are required"
            });
        }
        const [existingUsers] = await db.promise().query(
            "SELECT id FROM users WHERE email = ?",
            [email]
        );
        if (existingUsers.length > 0) {
            return res.status(409).json({
                message: "Email already exists"
            });
        }
        const passwordHash = await argon2.hash(password);
        const userId = crypto.randomUUID();
        await db.promise().query(
            `INSERT INTO users
                (id, username, email, password_hash)
             VALUES (?, ?, ?, ?)`,
            [userId, username, email, passwordHash]
        );
        res.status(201).json({
            message: "Account created successfully",
            user: {
                id: userId,
                username,
                email
            }
        });
    } catch (error) {
        console.error("Register error:", error);
        res.status(500).json({
            message: "Internal server error"
        });
    }
}
async function login(req, res) {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({
                message: "Email and password are required"
            });
        }
        const [users] = await db.promise().query(
            "SELECT * FROM users WHERE email = ?",
            [email]
        );
        if (users.length === 0) {
            return res.status(401).json({
                message: "Invalid email or password"
            });
        }
        const user = users[0];
        const passwordValid = await argon2.verify(
            user.password_hash,
            password
        );
        if (!passwordValid) {
            return res.status(401).json({
                message: "Invalid email or password"
            });
        }
        req.session.userId = user.id;
        res.json({
            message: "Login successful",
            user: {
                id: user.id,
                username: user.username,
                email: user.email
            }
        });
    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({
            message: "Internal server error"
        });
    }
}
module.exports = {
    register,
    login
};