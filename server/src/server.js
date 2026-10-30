const path = require("path");
const express = require("express");
const session = require("express-session");
const MySQLStore = require("express-mysql-session")(session);
const db = require("./config/database");
const auth = require("./middleware/auth");
const rateLimit = require("./middleware/rateLimit");
const debugRequests = require("./middleware/debugRequests");
const { endpoint, errorHandler, fail, ApiError } = require("./utils/api");
const accounts = require("./controllers/authController");
const users = require("./controllers/userController");
const profiles = require("./controllers/profileController");
const friends = require("./controllers/friendshipController");
const keys = require("./controllers/keyController");
const messages = require("./controllers/messageController");
const conversations = require("./controllers/conversationController");
const migrations = require("./migrations/runner");
const groups = require("./controllers/groupsController");
const recovery = require("./controllers/recoveryController");
const workspace = require("./controllers/workspaceController"),
  admin = require("./controllers/adminController");
const v2messages = require("./controllers/v2MessagesController");
const attachments = require("./controllers/attachmentsController");
function makeSessionStore() {
  return new MySQLStore({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "seruchat",
    charset: "utf8mb4_bin",
    expiration: 24 * 60 * 60 * 1000,
  });
}
function createApp({ store } = {}) {
  if (
    !process.env.SESSION_SECRET ||
    process.env.SESSION_SECRET.length < 32 ||
    process.env.SESSION_SECRET.startsWith("REPLACE_")
  )
    throw new Error(
      "Set SESSION_SECRET to a random string of at least 32 characters in server/.env",
    );
  attachments.limits();
  if (
    process.env.NODE_ENV === "production" &&
    process.env.ALLOW_LEGACY_SEND === "true"
  )
    throw Error("Legacy unsigned send is forbidden in production");
  if (process.env.NODE_ENV === "production") {
    if (!/^[a-f0-9]{64}$/i.test(process.env.RECOVERY_MASTER_KEY || ""))
      throw Error("Set a valid RECOVERY_MASTER_KEY before production startup");
    let origin;
    try {
      origin = new URL(process.env.PUBLIC_ORIGIN);
    } catch {
      throw Error("PUBLIC_ORIGIN must be a valid HTTPS origin");
    }
    if (
      origin.protocol !== "https:" ||
      origin.username ||
      origin.password ||
      origin.pathname !== "/" ||
      origin.search ||
      origin.hash
    )
      throw Error("Production PUBLIC_ORIGIN must be an HTTPS origin");
  }
  if (!!process.env.TURNSTILE_SECRET !== !!process.env.TURNSTILE_SITE_KEY)
    throw Error("Configure both Turnstile keys or neither");
  const minAge = Number(process.env.MIN_AGE || 13);
  if (!Number.isInteger(minAge) || minAge < 1 || minAge > 120)
    throw new Error("MIN_AGE must be an integer from 1 to 120");
  const app = express();
  app.disable("x-powered-by");
  app.get("/health/live", (req, res) => res.json({ status: "alive" }));
  app.get("/health/ready", async (req, res) => {
    try {
      await migrations.assertCurrent(db.promise());
      res.json({ status: "ready" });
    } catch {
      res.status(503).json({ status: "not_ready" });
    }
  });
  app.use(debugRequests());
  if (process.env.TRUST_PROXY)
    app.set(
      "trust proxy",
      process.env.TRUST_PROXY.split(",").map((x) => x.trim()),
    );
  app.use((req, res, next) => {
    res.set({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "X-Frame-Options": "DENY",
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self' https://challenges.cloudflare.com; style-src 'self'; frame-src https://challenges.cloudflare.com; img-src 'self' blob:; connect-src 'self' https://challenges.cloudflare.com; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    });
    if (req.path.startsWith("/api/")) res.set("Cache-Control", "no-store");
    next();
  });
  app.use(express.json({ limit: "128kb" }));
  app.use((req, res, next) => {
    if (
      ["POST", "PUT", "PATCH", "DELETE"].includes(req.method) &&
      req.get("Origin")
    ) {
      try {
        const origin = new URL(req.get("Origin"));
        if (
          origin.host !== req.get("Host") ||
          origin.protocol !== `${req.protocol}:`
        )
          fail(403, "Cross-origin write request is not allowed");
      } catch (error) {
        return next(
          error instanceof ApiError
            ? error
            : new ApiError(400, "Invalid Origin header"),
        );
      }
    }
    if (
      ["POST", "PUT", "PATCH"].includes(req.method) &&
      req.body !== undefined &&
      (!req.body || typeof req.body !== "object" || Array.isArray(req.body))
    )
      return res.status(400).json({ message: "JSON body must be an object" });
    if (
      ["POST", "PUT", "PATCH", "DELETE"].includes(req.method) &&
      !req.path.endsWith("/avatar") &&
      !/^\/api\/attachments\/[0-9a-f-]+\/content$/.test(req.path) &&
      !req.is("application/json")
    )
      return res.status(415).json({ message: "Use application/json" });
    if (
      !req.path.endsWith("/avatar") &&
      !/^\/api\/attachments\/[0-9a-f-]+\/content$/.test(req.path)
    )
      req.body ??= {};
    next();
  });
  const sessionStore = store || makeSessionStore();
  app.locals.sessionStore = sessionStore;
  app.use(
    session({
      secret: process.env.SESSION_SECRET,
      store: sessionStore,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 86400000,
      },
    }),
  );
  const authLimit = rateLimit({
    limit: 60,
    windowMs: 60000,
    key: (req) => req.ip,
  });
  const friendsLimit = rateLimit({ limit: 20, windowMs: 60000 });
  const sendLimit = rateLimit({ limit: 30, windowMs: 10000 });
  const keyLimit = rateLimit({ limit: 10, windowMs: 60000 });
  const createLimit = rateLimit({ limit: 30, windowMs: 60000 });
  app.post("/api/auth/register", authLimit, endpoint(accounts.register));
  app.post("/api/auth/login", authLimit, endpoint(accounts.login));
  app.get("/api/config", (req, res) =>
    res.json({
      minAge: Number(process.env.MIN_AGE || 13),
      phoneRequired: process.env.PHONE_REQUIRED === "true",
      requireEmailVerification:
        process.env.REQUIRE_EMAIL_VERIFICATION === "true",
      emailConfigured: require("./services/delivery").emailReady(),
      smsConfigured: require("./services/delivery").phoneReady(),
      captcha: require("./services/captcha").settings(),
    }),
  );
  app.post(
    "/api/auth/email/request",
    authLimit,
    endpoint(accounts.requestEmail),
  );
  app.post(
    "/api/auth/email/confirm",
    authLimit,
    endpoint(accounts.confirmEmail),
  );
  app.post(
    "/api/auth/password/request",
    authLimit,
    endpoint(accounts.requestReset),
  );
  app.post(
    "/api/auth/password/reset",
    authLimit,
    endpoint(accounts.resetPassword),
  );
  app.use("/api", auth);
  app.get("/api/auth/csrf", (req, res) =>
    res.json({ token: require("./middleware/csrf").token(req) }),
  );
  app.use(
    [
      "/api/profiles",
      "/api/auth/password/change",
      "/api/auth/phone",
      "/api/auth/sessions",
      "/api/v2",
      "/api/groups",
      "/api/attachments",
      "/api/recovery",
      "/api/workspace",
      "/api/admin",
    ],
    require("./middleware/csrf").protect,
  );
  app.get("/api/workspace", endpoint(workspace.list));
  app.patch("/api/workspace/:scope/:id", endpoint(workspace.preference));
  app.post("/api/workspace/:scope/:id/read", endpoint(workspace.read));
  app.get("/api/workspace/notes", endpoint(workspace.notes));
  app.post("/api/workspace/notes", endpoint(workspace.save));
  app.delete("/api/workspace/notes/:id", endpoint(workspace.removeNote));
  app.post("/api/workspace/reports", endpoint(workspace.report));
  app.get("/api/admin/state", endpoint(admin.state));
  app.post("/api/admin/mfa/setup", endpoint(admin.setup));
  app.post("/api/admin/mfa/verify", endpoint(admin.verify));
  app.use("/api/admin", admin.guard);
  app.get("/api/admin/stats", endpoint(admin.stats));
  app.get("/api/admin/users", endpoint(admin.users));
  app.post("/api/admin/users/:id/suspend", endpoint(admin.suspend));
  app.get("/api/admin/reports", endpoint(admin.reports));
  app.post("/api/admin/reports/:id", endpoint(admin.review));
  app.get("/api/admin/audit", endpoint(admin.logs));
  app.get("/api/recovery/status", endpoint(recovery.status));
  app.post("/api/recovery/prepare", endpoint(recovery.prepare));
  app.post("/api/recovery/configure", endpoint(recovery.configure));
  app.post("/api/recovery/unlock", endpoint(recovery.unlock));
  app.post("/api/v2/identities", endpoint(groups.publishIdentity));
  app.get("/api/v2/identities/:id", endpoint(groups.getIdentity));
  app.get("/api/v2/direct/:id/context", endpoint(v2messages.direct));
  app.post("/api/v2/messages", endpoint(v2messages.send));
  app.get("/api/v2/history/:scope/:id", endpoint(v2messages.history));
  app.get("/api/v2/file-policy", endpoint(attachments.config));
  app.get("/api/groups/invitations", endpoint(groups.invitations));
  app.post("/api/groups/invitations/:inviteId/reject", endpoint(groups.reject));
  app.get("/api/groups", endpoint(groups.list));
  app.post("/api/groups", endpoint(groups.create));
  app.get("/api/groups/:id", endpoint(groups.get));
  app.post("/api/groups/:id/events", endpoint(groups.change));
  app.post("/api/groups/:id/invitations", endpoint(groups.invite));
  app.put(
    "/api/groups/:id/avatar",
    express.raw({
      type: ["image/png", "image/jpeg", "image/webp"],
      limit: "2mb",
    }),
    endpoint(groups.uploadAvatar),
  );
  app.get("/api/groups/:id/avatar/:avatarId", endpoint(groups.avatar));
  app.post("/api/attachments", endpoint(attachments.reserve));
  app.put("/api/attachments/:id/content", endpoint(attachments.upload));
  app.get("/api/attachments/:id/content", endpoint(attachments.download));
  app.delete("/api/attachments/:id", endpoint(attachments.cancel));
  app.get("/api/auth/me", endpoint(accounts.me));
  app.post("/api/auth/password/change", endpoint(accounts.changePassword));
  app.post("/api/auth/phone/request", endpoint(accounts.requestPhone));
  app.post("/api/auth/phone/confirm", endpoint(accounts.confirmPhone));
  app.get("/api/auth/sessions", endpoint(accounts.sessions));
  app.post("/api/auth/sessions/:sessionId/revoke", endpoint(accounts.revoke));
  app.get("/api/profiles/me", endpoint(profiles.me));
  app.patch("/api/profiles/me", endpoint(profiles.update));
  app.put(
    "/api/profiles/me/avatar",
    express.raw({
      type: ["image/png", "image/jpeg", "image/webp"],
      limit: "2mb",
    }),
    endpoint(profiles.uploadAvatar),
  );
  app.delete("/api/profiles/me/avatar", endpoint(profiles.deleteAvatar));
  app.get("/api/profiles/search", endpoint(profiles.search));
  app.get("/api/profiles/:id/avatar", endpoint(profiles.avatar));
  app.get("/api/profiles/:id", endpoint(profiles.get));
  app.post(
    "/api/auth/logout",
    endpoint(async (req, res) => {
      await db
        .promise()
        .query("UPDATE account_sessions SET revoked_at=NOW(6) WHERE id=?", [
          require("./services/accountSecurity").hash(req.sessionID),
        ]);
      await new Promise((resolve, reject) =>
        req.session.destroy((error) => (error ? reject(error) : resolve())),
      );
      res.clearCookie("connect.sid", {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      });
      res.json({ message: "Logout successful" });
    }),
  );
  app.get("/api/users/:id", endpoint(users.getUserById));
  app.post(
    "/api/friendships/request",
    friendsLimit,
    endpoint(friends.sendFriendRequest),
  );
  app.get(
    "/api/friendships/requests",
    endpoint(friends.getIncomingFriendRequests),
  );
  app.get(
    "/api/friendships/outgoing",
    endpoint(friends.getOutgoingFriendRequests),
  );
  app.post(
    "/api/friendships/:id/cancel",
    friendsLimit,
    endpoint(friends.cancelFriendRequest),
  );
  app.post(
    "/api/friendships/:id/accept",
    friendsLimit,
    endpoint(friends.acceptFriendRequest),
  );
  app.post(
    "/api/friendships/:id/reject",
    friendsLimit,
    endpoint(friends.rejectFriendRequest),
  );
  app.get("/api/friendships", endpoint(friends.getFriends));
  app.post("/api/friendships/block", friendsLimit, endpoint(friends.blockUser));
  app.post(
    "/api/friendships/unblock",
    friendsLimit,
    endpoint(friends.unblockUser),
  );
  app.post(
    "/api/friendships/remove",
    friendsLimit,
    endpoint(friends.removeFriend),
  );
  app.get("/api/friendships/blocked", endpoint(friends.getBlockedUsers));
  app.post("/api/keys/public", keyLimit, endpoint(keys.savePublicKey));
  app.get("/api/keys/public/:userId", endpoint(keys.getPublicKey));
  app.get("/api/keys/private", endpoint(keys.getMyPrivateKey));
  app.post(
    "/api/conversations",
    createLimit,
    endpoint(conversations.createConversation),
  );
  app.get("/api/conversations", endpoint(conversations.getConversations));
  app.post("/api/messages", sendLimit, endpoint(messages.sendMessage));
  app.get("/api/history/:conversationId", endpoint(messages.getHistoryPage));
  app.get("/api/messages/:conversationId", endpoint(messages.getMessages));
  // Java HTTP compatibility. IDs are UUIDs; all routes use the login session.
  app.get("/users/:id/public-key", auth, endpoint(keys.getPublicKey));
  app.post(
    "/users/:id/public-key",
    auth,
    keyLimit,
    endpoint(keys.savePublicKey),
  );
  app.post("/messages", auth, sendLimit, endpoint(messages.sendMessage));
  app.get("/messages/:id", auth, endpoint(messages.getJavaInbox));
  app.use("/api", (req, res) =>
    res.status(404).json({ message: "API route not found" }),
  );
  app.get("/admin", (req, res) =>
    res.sendFile(path.resolve(__dirname, "../../client/admin.html")),
  );
  app.use(express.static(path.resolve(__dirname, "../../client")));
  app.use((req, res) => res.status(404).json({ message: "Route not found" }));
  app.use(errorHandler);
  return app;
}
async function start() {
  let store;
  try {
    if (process.env.NODE_ENV === "production")
      await migrations.assertCurrent(db.promise());
    const app = createApp();
    store = app.locals.sessionStore;
    await db.promise().query("SELECT 1");
    await store.onReady();
    const port = Number(process.env.PORT || 3000);
    const server = app.listen(port, "0.0.0.0", () => {
      console.log(`Seruchat: http://localhost:${port}`);
      if (process.env.DEBUG_API === "1")
        console.log(
          "API tracing enabled: action, route, status and duration. Automatic polling also appears here.",
        );
    });
    server.on("error", (error) => {
      console.error("Server failed:", error.message);
      store.close();
      db.end();
      process.exitCode = 1;
    });
    for (const signal of ["SIGINT", "SIGTERM"])
      process.once(signal, () =>
        server.close(() => {
          store.close();
          db.end();
        }),
      );
  } catch (error) {
    console.error("Startup failed:", error.code || error.message);
    if (store) await store.close();
    await db.promise().end();
    process.exitCode = 1;
  }
}
if (require.main === module)
  start().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
module.exports = { createApp, start };
