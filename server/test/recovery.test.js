"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  crypto = require("node:crypto"),
  fs = require("node:fs"),
  path = require("node:path");
const r = require("../../client/js/recovery-crypto");
const subtle = crypto.webcrypto.subtle;
const pair = () => subtle.generateKey({ name: "X25519" }, true, ["deriveBits"]);
const pub = async (p) =>
  Buffer.from(await subtle.exportKey("spki", p.publicKey)).toString("base64");
test("Recovery: separate encryption/auth material, PIN+gate, recovery code, AAD and tamper protection", async () => {
  const p = await pair(),
    key = await pub(p),
    id = crypto.randomUUID(),
    version = crypto.randomUUID(),
    salt = crypto.randomBytes(32).toString("base64"),
    gate = crypto.randomBytes(32).toString("base64");
  r.validatePin("72649315");
  assert.throws(() => r.validatePin("11111111"));
  assert.throws(() => r.validatePin("12345678"));
  const m = await r.pinMaterial("72649315", salt),
    wrong = await r.pinMaterial("72649316", salt);
  assert.notEqual(Buffer.from(m.secret).toString("base64"), m.proof);
  const w = await r.seal(p, m, gate, id, key, version, "pin");
  const restored = await r.open(w, m, gate, id, key, version, "pin");
  assert.deepEqual(
    Buffer.from(await subtle.exportKey("pkcs8", restored.privateKey)),
    Buffer.from(await subtle.exportKey("pkcs8", p.privateKey)),
  );
  await assert.rejects(r.open(w, wrong, gate, id, key, version, "pin"));
  await assert.rejects(
    r.open(
      w,
      m,
      crypto.randomBytes(32).toString("base64"),
      id,
      key,
      version,
      "pin",
    ),
  );
  await assert.rejects(
    r.open(w, m, gate, crypto.randomUUID(), key, version, "pin"),
  );
  await assert.rejects(
    r.open(
      { ...w, ciphertext: Buffer.alloc(64).toString("base64") },
      m,
      gate,
      id,
      key,
      version,
      "pin",
    ),
  );
  const code = r.newCode(),
    cm = await r.codeMaterial(code),
    cw = await r.seal(p, cm, null, id, key, version, "code");
  assert.equal(
    await pub(await r.open(cw, cm, null, id, key, version, "code")),
    key,
  );
  const waits = require("../src/services/recoveryPolicy").waitSeconds;
  assert.deepEqual(
    Array.from({ length: 11 }, (_, i) => waits(i)),
    [0, 0, 0, 0, 0, 30, 60, 300, 900, 3600, 21600],
  );
});
test(
  "Recovery over HTTP/MySQL: ownership, migration, account lockout, recovery alternative, rotation and persistence",
  { skip: process.env.RUN_MYSQL_TESTS !== "1" },
  async (t) => {
    const mysql = require("mysql2/promise"),
      name = "seruchat_recovery_" + crypto.randomBytes(6).toString("hex");
    const admin = await mysql.createConnection({
      host: process.env.DB_HOST || "localhost",
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER || "root",
      password: process.env.DB_PASSWORD || "",
      multipleStatements: true,
    });
    let app, db, server;
    try {
      await admin.query(
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
      let origin = "http://127.0.0.1:" + server.address().port;
      function client() {
        let cookie = "";
        return async (route, body, csrf = true) => {
          let token;
          if (body !== undefined && cookie && csrf) {
            const rr = await fetch(origin + "/api/auth/csrf", {
              headers: { Cookie: cookie },
            });
            token = (await rr.json()).token;
          }
          const response = await fetch(origin + route, {
            method: body === undefined ? "GET" : "POST",
            headers: {
              Cookie: cookie,
              ...(body !== undefined
                ? { "Content-Type": "application/json" }
                : {}),
              ...(token ? { "X-CSRF-Token": token } : {}),
            },
            body: body === undefined ? undefined : JSON.stringify(body),
          });
          if (response.headers.get("set-cookie"))
            cookie = response.headers.get("set-cookie").split(";")[0];
          return {
            status: response.status,
            data: await response.json(),
            headers: response.headers,
          };
        };
      }
      const a = client(),
        fresh = client(),
        password = "An-example-password-2026!",
        p = await pair(),
        publicKey = await pub(p);
      const reg = await a("/api/auth/register", {
        email: "recover@example.test",
        password,
        displayName: "Recovery Test",
        handle: "recovery_test",
        dateOfBirth: "2000-01-01",
        acceptTerms: true,
      });
      assert.equal(reg.status, 201);
      const id = reg.data.user.id;
      assert.equal(
        (
          await a("/api/auth/login", {
            email: "recover@example.test",
            password,
          })
        ).status,
        200,
      );
      assert.equal((await a("/api/recovery/status")).data.configured, false);
      assert.equal(
        (await a("/api/recovery/prepare", { password, publicKey }, false))
          .status,
        403,
      );
      async function setup(pin, who = a, privatePair = p) {
        const prep = await who("/api/recovery/prepare", {
          password,
          publicKey,
        });
        assert.equal(prep.status, 200);
        const [persisted] = await admin.query("SELECT data FROM sessions");
        const pending = persisted
          .map((x) => JSON.parse(x.data))
          .filter((x) => x.recoveryPrepare);
        assert.ok(pending.length > 0);
        for (const state of pending) {
          assert.equal(typeof state.recoveryPrepare, "string");
          assert.ok(!JSON.stringify(state).includes(prep.data.gate));
          assert.ok(!JSON.stringify(state).includes(prep.data.challengePublic));
        }

        const pm = await r.pinMaterial(pin, prep.data.salt),
          code = r.newCode(),
          cm = await r.codeMaterial(code);
        const data = {
          id: prep.data.id,
          publicKey,
          pinProof: pm.proof,
          codeProof: cm.proof,
          pinWrap: await r.seal(
            p,
            pm,
            prep.data.gate,
            id,
            publicKey,
            prep.data.id,
            "pin",
          ),
          codeWrap: await r.seal(
            p,
            cm,
            null,
            id,
            publicKey,
            prep.data.id,
            "code",
          ),
        };
        const ownership = await r.ownership(
          privatePair,
          prep.data.challengePublic,
          data,
        );
        return {
          result: await who("/api/recovery/configure", { ...data, ownership }),
          prep: prep.data,
          pm,
          code,
          cm,
        };
      }
      await t.test(
        "setup requires the actual private key, not only account password",
        async () => {
          assert.equal(
            (await setup("72649315", a, await pair())).result.status,
            403,
          );
        },
      );
      let initial = await setup("72649315");
      assert.equal(initial.result.status, 200);
      await t.test(
        "password-only backup cannot be restored or reintroduced after enrollment",
        async () => {
          assert.equal((await a("/api/keys/private")).status, 403);
          assert.equal(
            (
              await a("/api/keys/public", {
                publicKey,
                encryptedPrivateKey: crypto.randomBytes(64).toString("base64"),
                salt: crypto.randomBytes(16).toString("base64"),
                iv: crypto.randomBytes(12).toString("base64"),
              })
            ).status,
            409,
          );
          const [[row]] = await admin.query(
            "SELECT * FROM recovery_vaults WHERE user_id=?",
            [id],
          );
          assert.notEqual(row.gate_ciphertext, initial.prep.gate);
          assert.ok(!JSON.stringify(row).includes(initial.pm.proof));
        },
      );
      await t.test(
        "startup refuses to regenerate a missing master key when vaults already exist",
        async () => {
          const dir = fs.mkdtempSync(
              path.join(require("node:os").tmpdir(), "sc-missing-key-"),
            ),
            envFile = path.join(dir, ".env"),
            saved = process.env.RECOVERY_MASTER_KEY;
          fs.writeFileSync(envFile, "DB_NAME=" + name + "\n");
          delete process.env.RECOVERY_MASTER_KEY;
          try {
            await assert.rejects(
              require("../tools/start").bootstrap({ envFile }),
              /Thiếu RECOVERY_MASTER_KEY/,
            );
            assert.ok(
              !fs.readFileSync(envFile, "utf8").includes("RECOVERY_MASTER_KEY"),
            );
          } finally {
            process.env.RECOVERY_MASTER_KEY = saved;
            fs.rmSync(dir, { recursive: true, force: true });
          }
        },
      );
      assert.equal(
        (
          await fresh("/api/auth/login", {
            email: "recover@example.test",
            password,
          })
        ).status,
        200,
      );
      const state = (await fresh("/api/recovery/status")).data;
      assert.equal(state.configured, true);
      assert.equal(state.wrap, undefined);
      assert.equal(state.gate, undefined);
      const unlock = (who, proof, method = "pin", version = state.version) =>
        who("/api/recovery/unlock", { method, version, proof });
      await t.test(
        "five concurrent wrong attempts count atomically; new sessions cannot bypass waiting",
        async () => {
          const bad = crypto.randomBytes(32).toString("base64"),
            results = await Promise.all(
              Array.from({ length: 5 }, () => unlock(a, bad)),
            );
          assert.equal(results.filter((x) => x.status === 403).length, 4);
          assert.equal(results.filter((x) => x.status === 429).length, 1);
          const denied = await unlock(fresh, initial.pm.proof);
          assert.equal(denied.status, 429);
          assert.ok(denied.data.retryAfter > 0 && denied.data.retryAfter <= 30);
          assert.ok((await fresh("/api/recovery/status")).data.retryAfter > 0);
        },
      );
      await t.test(
        "recovery code still works during PIN lockout; PIN wait remains enforced",
        async () => {
          const got = await unlock(fresh, initial.cm.proof, "code");
          assert.equal(got.status, 200);
          assert.equal(
            await pub(
              await r.open(
                got.data.wrap,
                initial.cm,
                null,
                id,
                publicKey,
                state.version,
                "code",
              ),
            ),
            publicKey,
          );
          assert.equal((await unlock(fresh, initial.pm.proof)).status, 429);
        },
      );
      await t.test(
        "escalation 1min/5min/15min/1h/6h and recovery across server restart",
        async () => {
          for (const seconds of [60, 300, 900, 3600, 21600]) {
            await admin.query(
              "UPDATE recovery_vaults SET pin_locked_until=DATE_SUB(NOW(6),INTERVAL 1 SECOND) WHERE user_id=?",
              [id],
            );
            const got = await unlock(
              fresh,
              crypto.randomBytes(32).toString("base64"),
            );
            assert.equal(got.status, 429);
            assert.equal(got.data.retryAfter, seconds);
          }
          await new Promise((r) => server.close(r));
          server = app.listen(0, "127.0.0.1");
          await new Promise((r) => server.once("listening", r));
          origin = "http://127.0.0.1:" + server.address().port;
          assert.equal((await unlock(fresh, initial.pm.proof)).status, 429);
          await admin.query(
            "UPDATE recovery_vaults SET pin_locked_until=DATE_SUB(NOW(6),INTERVAL 1 SECOND) WHERE user_id=?",
            [id],
          );
          const got = await unlock(fresh, initial.pm.proof);
          assert.equal(got.status, 200);
          const restored = await r.open(
            got.data.wrap,
            initial.pm,
            got.data.gate,
            id,
            publicKey,
            state.version,
            "pin",
          );
          assert.equal(await pub(restored), publicKey);
          assert.equal(
            (await fresh("/api/recovery/status")).data.retryAfter,
            0,
          );
        },
      );
      await t.test(
        "rotation preserves identity, rejects old version and invalidates old code",
        async () => {
          const next = await setup("83619472", fresh);
          assert.equal(next.result.status, 200);
          assert.equal((await unlock(a, initial.pm.proof)).status, 409);
          assert.equal(
            (await unlock(a, initial.cm.proof, "code", next.prep.id)).status,
            403,
          );
          assert.equal(
            (await a("/api/keys/public/" + id)).data.publicKey,
            publicKey,
          );
        },
      );
      await t.test(
        "password changes do not create a password-only recovery copy",
        async () => {
          const changed = await fresh("/api/auth/password/change", {
            currentPassword: password,
            password: "Another-long-password-2026!",
          });
          assert.equal(changed.status, 200);
          assert.equal((await a("/api/recovery/status")).status, 401);
          const [[key]] = await admin.query(
            "SELECT * FROM public_keys WHERE user_id=?",
            [id],
          );
          assert.equal(key.encrypted_private_key, null);
        },
      );
    } finally {
      if (server) await new Promise((r) => server.close(r));
      if (app) await app.locals.sessionStore.close();
      if (db) await db.promise().end();
      await admin.query("DROP DATABASE IF EXISTS `" + name + "`");
      await admin.end();
    }
  },
);
