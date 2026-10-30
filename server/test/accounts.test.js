"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict");
const crypto = require("node:crypto"),
  fs = require("node:fs"),
  path = require("node:path");
const v = require("../src/services/validation");
test("Email, Gmail aliases, Vietnamese phones, real birthdays and password rules", () => {
  assert.equal(
    v.email(" First.Last+lab@GMAIL.com "),
    "first.last+lab@gmail.com",
  );
  assert.notEqual(v.email("a.b@gmail.com"), v.email("ab@gmail.com"));
  for (const value of ["bad", "a@", "a b@example.com", "a\n@example.com"])
    assert.throws(() => v.email(value));
  assert.equal(v.phone("0912 345 678"), "+84912345678");
  assert.equal(v.phone("+84912345678"), "+84912345678");
  for (const value of ["012345", "+12025550123", "0912345678 ext 10", {}])
    assert.throws(() => v.phone(value));
  for (const value of ["2001-02-29", "2020-13-01", "2099-01-01", "2026-01-01"])
    assert.throws(() => v.birthday(value, new Date("2026-10-29")));
  assert.equal(v.birthday("2000-02-29", new Date("2026-10-29")), "2000-02-29");
  assert.equal(v.handle("Ngoc_Dien"), "ngoc_dien");
  assert.equal(v.handle("u_" + "a".repeat(32)), "u_" + "a".repeat(32));
  assert.throws(() =>
    v.profile({
      handle: "abc",
      displayName: "A",
      dateOfBirth: "2000-01-01",
      showPhone: "false",
    }),
  );
  assert.throws(() => v.password("123456"));
  assert.equal(v.password("Một mật khẩu dài"), "Một mật khẩu dài");
});
test(
  "Account lifecycle over HTTP, real MySQL and local SMTP",
  { skip: process.env.RUN_MYSQL_TESTS !== "1" },
  async (t) => {
    const mysql = require("mysql2/promise"),
      { SMTPServer } = require("smtp-server");
    const name = "seruchat_accounts_" + crypto.randomBytes(6).toString("hex");
    const admin = await mysql.createConnection({
      host: process.env.DB_HOST || "localhost",
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER || "root",
      password: process.env.DB_PASSWORD || "",
      multipleStatements: true,
    });
    const mail = [];
    const smtp = new SMTPServer({
      authOptional: true,
      disabledCommands: ["STARTTLS"],
      onData(stream, session, callback) {
        let text = "";
        stream.on("data", (d) => (text += d));
        stream.on("end", () => {
          mail.push(text);
          callback();
        });
      },
    });
    let server, app, db;
    try {
      await new Promise((resolve) => smtp.listen(0, "127.0.0.1", resolve));
      Object.assign(process.env, {
        DB_NAME: name,
        SESSION_SECRET: crypto.randomBytes(32).toString("hex"),
        SMTP_HOST: "127.0.0.1",
        SMTP_PORT: String(smtp.server.address().port),
        SMTP_FROM: "test@seruchat.test",
        SMTP_ALLOW_INSECURE_TEST: "true",
        PUBLIC_ORIGIN: "http://localhost:3000",
        REQUIRE_EMAIL_VERIFICATION: "false",
      });
      await admin.query(
        fs
          .readFileSync(
            path.resolve(__dirname, "../../database/schema.sql"),
            "utf8",
          )
          .replace(/\bseruchat\b/g, name),
      );
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
      await new Promise((resolve) => server.once("listening", resolve));
      const origin = "http://127.0.0.1:" + server.address().port;
      function client() {
        let cookie = "";
        return async (route, body, method = "POST", extra = {}) => {
          let csrf = {};
          if (
            body !== undefined &&
            /^\/api\/(profiles|auth\/(phone|sessions|password\/change))/.test(
              route,
            )
          ) {
            const c = await fetch(origin + "/api/auth/csrf", {
              headers: { Cookie: cookie },
            });
            const d = await c.json();
            if (d.token) csrf = { "X-CSRF-Token": d.token };
          }
          const response = await fetch(origin + route, {
            method: body === undefined ? "GET" : method,
            headers: {
              ...(cookie ? { Cookie: cookie } : {}),
              ...(body === undefined
                ? {}
                : { "Content-Type": "application/json" }),
              ...csrf,
              ...extra,
            },
            body:
              body === undefined
                ? undefined
                : Buffer.isBuffer(body)
                  ? body
                  : JSON.stringify(body),
          });
          if (response.headers.get("set-cookie"))
            cookie = response.headers.get("set-cookie").split(";")[0];
          return {
            status: response.status,
            headers: response.headers,
            data: response.headers
              .get("content-type")
              ?.includes("application/json")
              ? await response.json()
              : Buffer.from(await response.arrayBuffer()),
          };
        };
      }
      const a = client(),
        otherDevice = client(),
        b = client(),
        anon = client();
      const password = "correct horse battery 123",
        newPassword = "new horse battery 456";
      const registration = {
        displayName: "Ngọc Diễn",
        handle: "ngocdien",
        email: "dien+lab@gmail.com",
        password,
        dateOfBirth: "2000-02-29",
        phone: "0912345678",
        acceptTerms: true,
      };
      let id, otherId;
      const link = () => {
        const raw = mail
          .at(-1)
          .replace(/=\r?\n/g, "")
          .replace(/=3D/g, "=");
        const url = raw.match(/http:\/\/localhost:3000\/#[^\s]+/)[0];
        return Object.fromEntries(
          new URLSearchParams(new URL(url).hash.slice(1)),
        );
      };
      await t.test(
        "Atomic registration, required consent, duplicates and profile privacy",
        async () => {
          assert.equal(
            (
              await a("/api/auth/register", {
                ...registration,
                acceptTerms: false,
              })
            ).status,
            400,
          );
          const r = await a("/api/auth/register", registration);
          assert.equal(r.status, 201);
          id = r.data.user.id;
          assert.equal(
            (
              await b("/api/auth/register", {
                ...registration,
                email: "other@example.test",
              })
            ).status,
            409,
          );
          assert.equal(
            (
              await b("/api/auth/register", {
                ...registration,
                handle: "otheruser",
                email: "other@example.test",
              })
            ).status,
            201,
          );
          const [rows] = await db
            .promise()
            .query("SELECT COUNT(*) n FROM users");
          assert.equal(Number(rows[0].n), 2);
          assert.equal(
            (
              await a("/api/auth/login", {
                email: registration.email,
                password,
              })
            ).status,
            200,
          );
          otherId = (
            await b("/api/auth/login", {
              email: "other@example.test",
              password,
            })
          ).data.user.id;
          const p = (await a("/api/profiles/me")).data.profile;
          assert.equal(p.phone, "+84912345678");
          assert.equal(p.emailVerified, false);
          const publicProfile = (await b("/api/profiles/" + id)).data.profile;
          assert.equal(publicProfile.phone, undefined);
          assert.equal(publicProfile.email, undefined);
          assert.equal(publicProfile.dateOfBirth, undefined);
          assert.equal(
            (await a("/api/profiles/search?q=ngoc")).data.users[0].id,
            id,
          );
          assert.equal((await anon("/api/profiles/" + id)).status, 401);
        },
      );
      await t.test(
        "Real SMTP email challenge, wrong token, single use and verification gate",
        async () => {
          process.env.REQUIRE_EMAIL_VERIFICATION = "true";
          assert.equal(
            (
              await otherDevice("/api/auth/login", {
                email: registration.email,
                password,
              })
            ).status,
            403,
          );
          assert.equal(
            (
              await anon("/api/auth/email/request", {
                email: registration.email,
              })
            ).status,
            200,
          );
          assert.equal(mail.length, 1);
          const token = link();
          assert.equal(
            (await anon("/api/auth/email/confirm", { ...token, token: "bad" }))
              .status,
            400,
          );
          assert.equal(
            (await anon("/api/auth/email/confirm", token)).status,
            200,
          );
          assert.equal(
            (await anon("/api/auth/email/confirm", token)).status,
            400,
          );
          assert.equal(
            (
              await otherDevice("/api/auth/login", {
                email: registration.email,
                password,
              })
            ).status,
            200,
          );
          process.env.REQUIRE_EMAIL_VERIFICATION = "false";
          const [[row]] = await db
            .promise()
            .query("SELECT token_hash FROM account_challenges WHERE id=?", [
              token.id,
            ]);
          assert.notEqual(row.token_hash, token.token);
        },
      );
      await t.test(
        "Profile changes clear phone verification, immutable identity, DOB validation and safe avatar",
        async () => {
          const body = {
            ...registration,
            displayName: "Diễn mới",
            phone: "0987654321",
            showPhone: true,
            showBirthday: true,
            bio: "<script>alert(1)</script>",
          };
          await db
            .promise()
            .query(
              "UPDATE user_profiles SET phone_verified_at=NOW(6) WHERE user_id=?",
              [id],
            );
          assert.equal(
            (await a("/api/profiles/me", body, "PATCH")).status,
            200,
          );
          const p = (await a("/api/profiles/me")).data.profile;
          assert.equal(p.id, id);
          assert.equal(p.phoneVerified, false);
          assert.equal(
            (await b("/api/profiles/" + id)).data.profile.phone,
            undefined,
          );
          assert.equal(
            (await b("/api/profiles/" + id)).data.profile.birthday,
            "02-29",
          );
          assert.equal(
            (
              await a(
                "/api/profiles/me",
                { ...body, dateOfBirth: "2001-02-29" },
                "PATCH",
              )
            ).status,
            400,
          );
          assert.equal(
            (
              await a(
                "/api/profiles/me/avatar",
                Buffer.from('<svg onload="alert(1)"/>'),
                "PUT",
                { "Content-Type": "image/png" },
              )
            ).status,
            400,
          );
          const png = await require("sharp")({
            create: {
              width: 400,
              height: 300,
              channels: 3,
              background: "#ff0",
            },
          })
            .png()
            .toBuffer();
          const upload = await a("/api/profiles/me/avatar", png, "PUT", {
            "Content-Type": "image/png",
          });
          assert.equal(upload.status, 200);
          const image = await b(upload.data.profile.avatarUrl);
          assert.equal(image.headers.get("content-type"), "image/webp");
          const meta = await require("sharp")(image.data).metadata();
          assert.equal(meta.width, 256);
          assert.equal(meta.exif, undefined);
          assert.equal(
            (await a("/api/profiles/me/avatar", {}, "DELETE")).status,
            200,
          );
          assert.equal(
            (await b("/api/profiles/" + id + "/avatar")).status,
            404,
          );
          assert.equal((await a("/api/auth/phone/request", {})).status, 503);
        },
      );
      await t.test(
        "SMS OTP expiry, attempts and phone ownership are checked in database",
        async () => {
          const { digestToken } = require("../src/services/accountSecurity");
          async function challenge(
            expires = "DATE_ADD(NOW(6),INTERVAL 10 MINUTE)",
          ) {
            const cid = crypto.randomUUID();
            await db
              .promise()
              .query(
                `INSERT INTO account_challenges(id,user_id,purpose,destination,token_hash,expires_at) VALUES (?,?,'phone','+84987654321',?,${expires})`,
                [cid, id, digestToken(cid, "123456")],
              );
            return cid;
          }
          const expired = await challenge("DATE_SUB(NOW(6),INTERVAL 1 SECOND)");
          assert.equal(
            (
              await a("/api/auth/phone/confirm", {
                id: expired,
                token: "123456",
              })
            ).status,
            400,
          );
          const cid = await challenge();
          assert.equal(
            (await b("/api/auth/phone/confirm", { id: cid, token: "123456" }))
              .status,
            400,
          );
          for (let i = 0; i < 5; i++)
            assert.equal(
              (await a("/api/auth/phone/confirm", { id: cid, token: "000000" }))
                .status,
              400,
            );
          assert.equal(
            (await a("/api/auth/phone/confirm", { id: cid, token: "123456" }))
              .status,
            400,
          );
          const valid = await challenge();
          assert.equal(
            (await a("/api/auth/phone/confirm", { id: valid, token: "123456" }))
              .status,
            200,
          );
          assert.equal(
            (await a("/api/profiles/me")).data.profile.phoneVerified,
            true,
          );
        },
      );
      await t.test(
        "Session listing and IDOR-safe revocation invalidates only the chosen device",
        async () => {
          const list = (await a("/api/auth/sessions")).data.sessions;
          assert.equal(list.length, 2);
          const target = list.find((s) => !s.current);
          assert.equal(
            (await b("/api/auth/sessions/" + target.id + "/revoke", {})).status,
            404,
          );
          assert.equal(
            (await a("/api/auth/sessions/" + target.id + "/revoke", {})).status,
            200,
          );
          assert.equal((await otherDevice("/api/auth/me")).status, 401);
          assert.equal((await a("/api/auth/me")).status, 200);
        },
      );
      let savedKey, backupBytes;
      await t.test(
        "Changing password rewraps the same X25519 identity and revokes sessions atomically",
        async () => {
          const vm = require("node:vm"),
            ctx = vm.createContext({
              crypto: crypto.webcrypto,
              TextEncoder,
              TextDecoder,
              Uint8Array,
              atob,
              btoa,
            });
          vm.runInContext(
            fs.readFileSync(
              path.resolve(
                __dirname,
                "../../client/js/encryption/keyManager.js",
              ),
              "utf8",
            ),
            ctx,
          );
          const pair = await ctx.generateKeyPair();
          savedKey = await ctx.exportPublicKey(pair.publicKey);
          const original = await ctx.encryptPrivateKey(
            pair.privateKey,
            password,
          );
          assert.equal(
            (await a("/api/keys/public", { publicKey: savedKey, ...original }))
              .status,
            200,
          );
          assert.equal(
            (
              await a("/api/auth/password/change", {
                currentPassword: password,
                password: newPassword,
              })
            ).status,
            400,
          );
          const backup = {
            publicKey: savedKey,
            ...(await ctx.encryptPrivateKey(pair.privateKey, newPassword)),
          };
          assert.equal(
            (
              await a("/api/auth/password/change", {
                currentPassword: password,
                password: newPassword,
                backup,
              })
            ).status,
            200,
          );
          assert.equal((await a("/api/auth/me")).status, 401);
          assert.equal(
            (
              await a("/api/auth/login", {
                email: registration.email,
                password,
              })
            ).status,
            401,
          );
          assert.equal(
            (
              await a("/api/auth/login", {
                email: registration.email,
                password: newPassword,
              })
            ).status,
            200,
          );
          backupBytes = (await a("/api/keys/private")).data;
          const restored = await ctx.decryptPrivateKey(
            backupBytes.encryptedPrivateKey,
            newPassword,
            Buffer.from(backupBytes.salt, "base64"),
            Buffer.from(backupBytes.iv, "base64"),
          );
          const own = await crypto.webcrypto.subtle.exportKey(
              "pkcs8",
              pair.privateKey,
            ),
            other = await crypto.webcrypto.subtle.exportKey("pkcs8", restored);
          assert.deepEqual(Buffer.from(own), Buffer.from(other));
        },
      );
      await t.test(
        "Reset SMTP token preserves the old encrypted backup, rejects replay and revokes login",
        async () => {
          assert.equal(
            (
              await anon("/api/auth/password/request", {
                email: registration.email,
              })
            ).status,
            200,
          );
          assert.equal(mail.length, 2);
          const token = link();
          assert.equal(
            (
              await anon("/api/auth/password/reset", {
                ...token,
                password: "reset-password-789",
              })
            ).status,
            200,
          );
          assert.equal((await a("/api/auth/me")).status, 401);
          assert.equal(
            (
              await anon("/api/auth/password/reset", {
                ...token,
                password: "reset-password-789",
              })
            ).status,
            400,
          );
          assert.equal(
            (
              await a("/api/auth/login", {
                email: registration.email,
                password: "reset-password-789",
              })
            ).status,
            200,
          );
          assert.deepEqual((await a("/api/keys/private")).data, backupBytes);
          assert.equal(
            (await a("/api/keys/public/" + id)).data.publicKey,
            savedKey,
          );
        },
      );
      await t.test(
        "Origin, simple form CSRF, durable throttle and generic reset response",
        async () => {
          assert.equal(
            (
              await a("/api/profiles/me", {}, "PATCH", {
                Origin: "https://evil.test",
              })
            ).status,
            403,
          );
          assert.equal(
            (await a("/api/profiles/me", {}, "PATCH", { "X-CSRF-Token": "" }))
              .status,
            403,
          );
          assert.equal(
            (
              await a("/api/auth/password/request", {}, "POST", {
                "Content-Type": "text/plain",
              })
            ).status,
            415,
          );
          const real = (
            await anon("/api/auth/password/request", {
              email: registration.email,
            })
          ).data;
          const missing = (
            await anon("/api/auth/password/request", {
              email: "missing@example.test",
            })
          ).data;
          assert.deepEqual(real, missing);
          assert.equal((await a("/api/profiles/me", {}, "PATCH", {"X-CSRF-Token":"é".repeat(43)})).status,403);
          const { consumeLimit } = require("../src/services/accountSecurity");
          await consumeLimit("test-persist", 1, 60);
          await assert.rejects(
            consumeLimit("test-persist", 1, 60),
            (e) => e.status === 429,
          );
        },
      );
    } finally {
      if (server) await new Promise((resolve) => server.close(resolve));
      if (app) await app.locals.sessionStore.close();
      if (db) await db.promise().end();
      await new Promise((resolve) => smtp.close(resolve));
      await admin.query("DROP DATABASE IF EXISTS `" + name + "`");
      await admin.end();
    }
  },
);

test("Twilio transport sends a real API-shaped request and fails closed on provider errors", async () => {
  const delivery = require("../src/services/delivery"),
    originalFetch = global.fetch;
  const names = ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM"],
    saved = Object.fromEntries(names.map((k) => [k, process.env[k]]));
  try {
    Object.assign(process.env, {
      TWILIO_ACCOUNT_SID: "AC" + "a".repeat(32),
      TWILIO_AUTH_TOKEN: "unit-test-only",
      TWILIO_FROM: "+12025550123",
    });
    let captured;
    global.fetch = async (url, options) => {
      captured = { url, options };
      return { ok: true };
    };
    await delivery.sendPhone("+84912345678", "123456");
    assert.ok(captured.url.endsWith("/Messages.json"));
    assert.equal(captured.options.body.get("To"), "+84912345678");
    assert.ok(captured.options.body.get("Body").includes("123456"));
    global.fetch = async () => ({ ok: false });
    await assert.rejects(
      delivery.sendPhone("+84912345678", "123456"),
      (e) => e.status === 503,
    );
  } finally {
    global.fetch = originalFetch;
    for (const k of names)
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
  }
});
