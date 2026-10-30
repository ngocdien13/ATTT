"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  crypto = require("node:crypto"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const totp = require("../src/services/totp");
test("TOTP matches RFC 6238 SHA1 vectors, requires six digits and rejects replay", () => {
  const secret = totp.encode(Buffer.from("12345678901234567890"));
  for (const [t, want] of [
    [59, "94287082"],
    [1111111109, "07081804"],
    [1111111111, "14050471"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
    [20000000000, "65353130"],
  ])
    assert.equal(totp.code(secret, Math.floor(t / 30), 8), want);
  const now = Date.now(),
    counter = Math.floor(now / 30000),
    code = totp.code(secret, counter);
  assert.equal(totp.verify(secret, code, -1, now), counter);
  assert.equal(totp.verify(secret, code, counter, now), null);
  assert.equal(totp.verify(secret, "123", -1, now), null);
});
test("Sealed server state is bound to domain, account/session and master key", () => {
  process.env.RECOVERY_MASTER_KEY = crypto.randomBytes(32).toString("hex");
  const s = require("../src/services/secrets"),
    value = { gate: crypto.randomBytes(32).toString("hex") },
    sealed = s.seal(value, "recovery-prepare", "user:session");
  assert.ok(!sealed.includes(value.gate));
  assert.deepEqual(s.open(sealed, "recovery-prepare", "user:session"), value);
  assert.throws(() => s.open(sealed, "admin-totp", "user:session"));
  assert.throws(() => s.open(sealed, "recovery-prepare", "other:session"));
  const old = process.env.RECOVERY_MASTER_KEY;
  process.env.RECOVERY_MASTER_KEY = crypto.randomBytes(32).toString("hex");
  assert.throws(() => s.open(sealed, "recovery-prepare", "user:session"));
  process.env.RECOVERY_MASTER_KEY = old;
});
test("Encrypted backup round-trip, tamper/wrong-key fail without publishing plaintext", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sc-backup-"));
  const p = (n) => path.join(dir, n);
  const { crypt } = require("../../deploy/backup-crypt");
  try {
    fs.writeFileSync(p("key"), crypto.randomBytes(32).toString("hex"));
    const raw = crypto.randomBytes(1024 * 1024);
    fs.writeFileSync(p("input"), raw);
    await crypt("encrypt", p("input"), p("backup"), p("key"));
    assert.ok(!fs.readFileSync(p("backup")).includes(raw.subarray(0, 256)));
    await crypt("decrypt", p("backup"), p("output"), p("key"));
    assert.deepEqual(fs.readFileSync(p("output")), raw);
    await assert.rejects(
      crypt("decrypt", p("backup"), p("output"), p("key")),
      /exists/,
    );
    const bad = fs.readFileSync(p("backup"));
    bad[100] ^= 1;
    fs.writeFileSync(p("bad"), bad);
    await assert.rejects(crypt("decrypt", p("bad"), p("badout"), p("key")));
    assert.ok(!fs.existsSync(p("badout")));
    fs.writeFileSync(p("key2"), crypto.randomBytes(32).toString("hex"));
    await assert.rejects(
      crypt("decrypt", p("backup"), p("wrongout"), p("key2")),
    );
    assert.ok(!fs.existsSync(p("wrongout")));
    assert.equal(
      fs.readdirSync(dir).filter((x) => x.endsWith(".tmp")).length,
      0,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test(
  "Workspace/Admin/Turnstile over HTTP and real MySQL",
  { skip: process.env.RUN_MYSQL_TESTS !== "1" },
  async (t) => {
    const mysql = require("mysql2/promise"),
      name = "seruchat_release_" + crypto.randomBytes(6).toString("hex"),
      conn = await mysql.createConnection({
        host: process.env.DB_HOST || "localhost",
        port: Number(process.env.DB_PORT || 3306),
        user: process.env.DB_USER || "root",
        password: process.env.DB_PASSWORD || "",
        multipleStatements: true,
      });
    let db, app, server;
    const originalFetch = global.fetch;
    try {
      await conn.query(
        fs
          .readFileSync(
            path.resolve(__dirname, "../../database/schema.sql"),
            "utf8",
          )
          .replace(/\bseruchat\b/g, name),
      );
      Object.assign(process.env, {
        DB_NAME: name,
        SESSION_SECRET: crypto.randomBytes(32).toString("hex"),
        RECOVERY_MASTER_KEY: crypto.randomBytes(32).toString("hex"),
        REQUIRE_EMAIL_VERIFICATION: "false",
      });
      db = require("../src/config/database");
      const c = await db.promise().getConnection();
      try {
        await require("../src/migrations/runner").up(c);
      } finally {
        c.release();
      }
      app = require("../src/server").createApp();
      await app.locals.sessionStore.onReady();
      server = app.listen(0, "127.0.0.1");
      await new Promise((r) => server.once("listening", r));
      const origin = "http://127.0.0.1:" + server.address().port;
      function client() {
        let cookie = "";
        return async (
          route,
          body,
          method = body === undefined ? "GET" : "POST",
          csrf = true,
        ) => {
          let token;
          if (body !== undefined && cookie && csrf) {
            const rr = await originalFetch(origin + "/api/auth/csrf", {
              headers: { Cookie: cookie },
            });
            token = (await rr.json()).token;
          }
          const r = await originalFetch(origin + route, {
            method,
            headers: {
              Cookie: cookie,
              ...(body !== undefined
                ? { "Content-Type": "application/json" }
                : {}),
              ...(token ? { "X-CSRF-Token": token } : {}),
            },
            body: body === undefined ? undefined : JSON.stringify(body),
          });
          if (r.headers.get("set-cookie"))
            cookie = r.headers.get("set-cookie").split(";")[0];
          return { status: r.status, data: await r.json() };
        };
      }
      const clients = [client(), client(), client()],
        ids = [],
        password = "Some-long-secure-password-2026!";
      for (let i = 0; i < 3; i++) {
        const reg = await clients[i]("/api/auth/register", {
          email: "person" + i + "@example.test",
          password,
          displayName: "Person " + i,
          handle: "person_" + i,
          dateOfBirth: "2000-01-01",
          acceptTerms: true,
        });
        assert.equal(reg.status, 201);
        ids.push(reg.data.user.id);
        assert.equal(
          (
            await clients[i]("/api/auth/login", {
              email: "person" + i + "@example.test",
              password,
            })
          ).status,
          200,
        );
      }
      const [a, b, x] = clients;
      const cid = crypto.randomUUID();
      await conn.query(
        "INSERT INTO friendships(id,user1_id,user2_id,requested_by,status) VALUES(?,?,?,?,'accepted')",
        [crypto.randomUUID(), ...[ids[0], ids[1]].sort(), ids[0]],
      );
      await conn.query("INSERT INTO conversations(id) VALUES(?)", [cid]);
      for (const id of ids.slice(0, 2))
        await conn.query(
          "INSERT INTO conversation_members(conversation_id,user_id) VALUES(?,?)",
          [cid, id],
        );
      const mid = crypto.randomUUID(),
        keypair = crypto.generateKeyPairSync("x25519"),
        pub = keypair.publicKey
          .export({ type: "spki", format: "der" })
          .toString("base64");
      await conn.query(
        "INSERT INTO messages(id,conversation_id,sender_id,ciphertext,nonce,sender_public_key,self_ciphertext,self_nonce,self_public_key,created_at) VALUES(?,?,?,?,?,?,?,?,?,TIMESTAMPADD(MICROSECOND,123456,NOW()))",
        [
          mid,
          cid,
          ids[1],
          crypto.randomBytes(32).toString("base64"),
          crypto.randomBytes(12).toString("base64"),
          pub,
          crypto.randomBytes(32).toString("base64"),
          crypto.randomBytes(12).toString("base64"),
          pub,
        ],
      );
      await t.test(
        "Private room preferences, microsecond read markers, unread, CSRF and outsider rejection",
        async () => {
          const before = await a("/api/workspace");
          assert.equal(before.status, 200);
          assert.equal(before.data.threads.length, 1);
          assert.equal(before.data.threads[0].unread, 1);
          assert.equal((await x("/api/workspace")).data.threads.length, 0);
          assert.equal(
            (await x("/api/workspace/direct/" + cid, { pinned: true }, "PATCH"))
              .status,
            403,
          );
          assert.equal(
            (
              await a(
                "/api/workspace/direct/" + cid,
                { pinned: true },
                "PATCH",
                false,
              )
            ).status,
            403,
          );
          assert.equal(
            (
              await a(
                "/api/workspace/direct/" + cid,
                { pinned: true, archived: true, mutedSeconds: 3600 },
                "PATCH",
              )
            ).status,
            200,
          );
          let room = (await a("/api/workspace")).data.threads[0];
          assert.equal(room.pinned, true);
          assert.equal(room.archived, true);
          assert.ok(room.mutedUntil);
          assert.equal(
            (await b("/api/workspace")).data.threads[0].pinned,
            false,
          );
          assert.equal(
            (
              await a("/api/workspace/direct/" + cid + "/read", {
                messageId: mid,
                kind: "legacy",
              })
            ).status,
            200,
          );
          assert.equal((await a("/api/workspace")).data.threads[0].unread, 0);
          assert.equal(
            (
              await a(
                "/api/workspace/direct/" + cid,
                { markedUnread: true },
                "PATCH",
              )
            ).status,
            200,
          );
          assert.equal(
            (await a("/api/workspace")).data.threads[0].markedUnread,
            true,
          );
          assert.equal(
            (
              await a(
                "/api/workspace/direct/" + cid,
                { mutedSeconds: -1 },
                "PATCH",
              )
            ).status,
            400,
          );
          assert.equal(
            (await a("/api/messages", { conversationId: cid })).status,
            410,
          );
        },
      );
      await t.test(
        "Saved ciphertext belongs only to its owner; no plaintext, cross-user deletion is inert",
        async () => {
          const note = {
            id: crypto.randomUUID(),
            iv: crypto.randomBytes(12).toString("base64"),
            ciphertext: crypto.randomBytes(64).toString("base64"),
          };
          assert.equal((await a("/api/workspace/notes", note)).status, 201);
          assert.equal((await b("/api/workspace/notes")).data.notes.length, 0);
          assert.equal(
            (await x("/api/workspace/notes/" + note.id, {}, "DELETE")).status,
            200,
          );
          assert.equal(
            (await a("/api/workspace/notes")).data.notes[0].ciphertext,
            note.ciphertext,
          );
          assert.equal(
            (await a("/api/workspace/notes/" + note.id, {}, "DELETE")).status,
            200,
          );
          assert.equal((await a("/api/workspace/notes")).data.notes.length, 0);
        },
      );
      let secret;
      await t.test(
        "Admin role cannot be self assigned; mandatory password enrollment/TOTP, replay rejection",
        async () => {
          assert.equal((await a("/api/admin/stats")).status, 403);
          assert.equal(
            (await a("/api/admin/mfa/setup", { password })).status,
            403,
          );
          await conn.query("UPDATE users SET app_role='admin' WHERE id=?", [
            ids[0],
          ]);
          assert.equal((await a("/api/admin/stats")).status, 403);
          assert.equal(
            (await a("/api/admin/mfa/setup", { password: "bad" })).status,
            403,
          );
          const prep = await a("/api/admin/mfa/setup", { password });
          assert.equal(prep.status, 200);
          secret = prep.data.secret;
          const [[m]] = await conn.query(
            "SELECT * FROM admin_mfa WHERE user_id=?",
            [ids[0]],
          );
          assert.ok(!m.secret_ciphertext.includes(secret));
          assert.equal(
            (
              await a("/api/admin/mfa/verify", {
                code: totp.code(secret, Math.floor(Date.now() / 30000)),
              })
            ).status,
            200,
          );
          assert.equal(
            (
              await a("/api/admin/mfa/verify", {
                code: totp.code(secret, Math.floor(Date.now() / 30000)),
              })
            ).status,
            403,
          );
          assert.equal((await a("/api/admin/stats")).status, 200);
          assert.equal((await a("/api/admin/users?page=0.5")).status, 200);
          assert.equal(
            (await a("/api/admin/mfa/setup", { password })).status,
            409,
          );
        },
      );
      await t.test(
        "Startup preserves master key when only MFA/audit data exists",
        async () => {
          const key = process.env.RECOVERY_MASTER_KEY,
            dir = fs.mkdtempSync(path.join(os.tmpdir(), "sc-master-")),
            envFile = path.join(dir, ".env");
          delete process.env.RECOVERY_MASTER_KEY;
          try {
            await assert.rejects(
              require("../tools/start").bootstrap({ envFile }),
              /Thiếu RECOVERY_MASTER_KEY/,
            );
            assert.equal(fs.existsSync(envFile), false);
          } finally {
            process.env.RECOVERY_MASTER_KEY = key;
            fs.rmSync(dir, { recursive: true, force: true });
          }
        },
      );
      await t.test(
        "Reports, password reauthentication, suspension revokes sessions; audit detects edited columns",
        async () => {
          assert.equal(
            (
              await b("/api/workspace/reports", {
                targetId: ids[2],
                reason: "spam",
              })
            ).status,
            201,
          );
          const reports = (await a("/api/admin/reports")).data.reports;
          assert.equal(reports.length, 1);
          assert.equal(
            (
              await a("/api/admin/reports/" + reports[0].id, {
                status: "reviewed",
              })
            ).status,
            200,
          );
          assert.equal(
            (
              await a("/api/admin/users/" + ids[2] + "/suspend", {
                suspended: true,
                password: "bad",
              })
            ).status,
            403,
          );
          assert.equal(
            (
              await a("/api/admin/users/" + ids[2] + "/suspend", {
                suspended: true,
                password,
              })
            ).status,
            200,
          );
          assert.equal((await x("/api/auth/me")).status, 401);
          assert.equal(
            (
              await x("/api/auth/login", {
                email: "person2@example.test",
                password,
              })
            ).status,
            401,
          );
          assert.equal((await a("/api/admin/audit")).data.verified, true);
          await conn.query(
            "UPDATE security_audit SET action='tampered' ORDER BY id DESC LIMIT 1",
          );
          assert.equal((await a("/api/admin/audit")).data.verified, false);
        },
      );
      await t.test(
        "Turnstile validation fails closed on missing, wrong hostname/action, stale, replay and provider failure",
        async () => {
          process.env.TURNSTILE_SITE_KEY = "test-site";
          process.env.TURNSTILE_SECRET = "test-secret";
          process.env.PUBLIC_ORIGIN = origin;
          let response = {
            success: true,
            hostname: "127.0.0.1",
            action: "login",
            challenge_ts: new Date().toISOString(),
          };
          global.fetch = async (url, opts) =>
            String(url).startsWith("https://challenges.cloudflare.com/")
              ? new Response(JSON.stringify(response), { status: 200 })
              : originalFetch(url, opts);
          const body = { email: "person1@example.test", password };
          assert.equal((await b("/api/auth/login", body)).status, 403);
          response.hostname = "attacker.example";
          assert.equal(
            (await b("/api/auth/login", { ...body, captchaToken: "badhost" }))
              .status,
            403,
          );
          response.hostname = "127.0.0.1";
          response.action = "register";
          assert.equal(
            (await b("/api/auth/login", { ...body, captchaToken: "badaction" }))
              .status,
            403,
          );
          response.action = "login";
          response.challenge_ts = new Date(Date.now() - 301000).toISOString();
          assert.equal(
            (await b("/api/auth/login", { ...body, captchaToken: "stale" }))
              .status,
            403,
          );
          response.challenge_ts = new Date().toISOString();
          assert.equal(
            (await b("/api/auth/login", { ...body, captchaToken: "good" }))
              .status,
            200,
          );
          assert.equal(
            (await b("/api/auth/login", { ...body, captchaToken: "good" }))
              .status,
            403,
          );
          global.fetch = async () => {
            throw Error("offline");
          };
          assert.equal(
            (await b("/api/auth/login", { ...body, captchaToken: "down" }))
              .status,
            503,
          );
        },
      );
    } finally {
      global.fetch = originalFetch;
      delete process.env.TURNSTILE_SECRET;
      delete process.env.TURNSTILE_SITE_KEY;
      if (server) await new Promise((r) => server.close(r));
      if (app) await app.locals.sessionStore.close();
      if (db) await db.promise().end();
      await conn.query("DROP DATABASE IF EXISTS `" + name + "`");
      await conn.end();
    }
  },
);
