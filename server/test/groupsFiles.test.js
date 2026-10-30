process.env.ALLOW_LEGACY_SEND = "true";
("use strict");
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  crypto = require("node:crypto");
test(
  "Groups and binary E2EE files over real HTTP/MySQL/storage",
  { skip: process.env.RUN_MYSQL_TESTS !== "1" },
  async (t) => {
    const mysql = require("mysql2/promise"),
      name = "seruchat_groups_" + crypto.randomBytes(6).toString("hex"),
      directory = fs.mkdtempSync(
        path.join(os.tmpdir(), "seruchat-ciphertext-"),
      );
    const admin = await mysql.createConnection({
      host: process.env.DB_HOST || "localhost",
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER || "root",
      password: process.env.DB_PASSWORD || "",
      multipleStatements: true,
    });
    let app, server, db;
    const password = crypto.randomBytes(20).toString("hex");
    try {
      Object.assign(process.env, {
        DB_NAME: name,
        SESSION_SECRET: crypto.randomBytes(32).toString("hex"),
        ATTACHMENT_DIR: directory,
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
      await new Promise((r) => server.once("listening", r));
      const origin = "http://127.0.0.1:" + server.address().port,
        v = await import("../src/crypto/secure-v2.mjs");
      function client() {
        let cookie = "";
        return async (route, body, method = "POST", headers = {}) => {
          let csrf = {};
          if (body !== undefined && !route.startsWith("/api/auth/login")) {
            const r = await fetch(origin + "/api/auth/csrf", {
                headers: { Cookie: cookie },
              }),
              d = await r.json();
            if (d.token) csrf = { "X-CSRF-Token": d.token };
          }
          const r = await fetch(origin + route, {
            method: body === undefined ? "GET" : method,
            headers: {
              ...(cookie ? { Cookie: cookie } : {}),
              ...(body === undefined
                ? {}
                : {
                    "Content-Type":
                      Buffer.isBuffer(body) || body instanceof Uint8Array
                        ? "application/octet-stream"
                        : "application/json",
                  }),
              ...csrf,
              ...headers,
            },
            body:
              body === undefined
                ? undefined
                : Buffer.isBuffer(body) || body instanceof Uint8Array
                  ? body
                  : JSON.stringify(body),
          });
          if (r.headers.get("set-cookie"))
            cookie = r.headers.get("set-cookie").split(";")[0];
          return {
            status: r.status,
            headers: r.headers,
            data: r.headers.get("content-type")?.includes("application/json")
              ? await r.json()
              : Buffer.from(await r.arrayBuffer()),
          };
        };
      }
      const hash = await require("argon2").hash(password),
        people = [];
      async function person() {
        const id = crypto.randomUUID(),
          email = id + "@test.example",
          x = await crypto.webcrypto.subtle.generateKey("X25519", true, [
            "deriveBits",
          ]);
        const { record, pair } = await v.identityProof(id, x),
          api = client();
        await db
          .promise()
          .query(
            "INSERT INTO users(id,username,email,password_hash) VALUES (?,?,?,?)",
            [id, "Thành viên " + people.length, email, hash],
          );
        await db
          .promise()
          .query(
            "INSERT INTO public_keys(user_id,public_key,algorithm) VALUES (?,?,'X25519')",
            [id, record.encryptionKey],
          );
        assert.equal(
          (await api("/api/auth/login", { email, password })).status,
          200,
        );
        assert.equal((await api("/api/v2/identities", { record })).status, 200);
        const p = {
          id,
          email,
          x,
          record,
          pair,
          api,
          member: v.memberIdentity(id, record.encryptionKey, record.signingKey),
        };
        people.push(p);
        return p;
      }
      const a = await person(),
        b = await person(),
        d = await person(),
        outsider = await person(),
        anon = client();
      let gid, history, oldMessage, firstFile;
      async function friends(a, b) {
        const [x, y] = [a.id, b.id].sort();
        await db
          .promise()
          .query(
            "INSERT IGNORE INTO friendships(id,user1_id,user2_id,requested_by,status) VALUES (?,?,?,?,'accepted')",
            [crypto.randomUUID(), x, y, a.id],
          );
      }
      for (const p of [b, d]) await friends(a, p);
      async function getHistory() {
        return v.verifyChain((await a.api("/api/groups/" + gid)).data.events);
      }
      async function invitation(owner, invitee) {
        const hist = await getHistory(),
          doc = {
            v: 2,
            id: crypto.randomUUID(),
            groupId: gid,
            inviterId: owner.id,
            inviteeId: invitee.id,
            issuedHash: hist.at(-1).hash,
            expiresAt: Date.now() + 600000,
          };
        return {
          document: doc,
          signature: await v.sign(
            "seruchat/invitation/v2",
            doc,
            owner.pair.privateKey,
          ),
        };
      }
      async function join(p, invitation) {
        const hist = await getHistory(),
          last = hist.at(-1),
          doc = v.rosterDocument({
            ...last.event.document,
            version: hist.length + 1,
            prevHash: last.hash,
            actorId: p.id,
            action: "join",
            members: [...last.event.document.members, p.member],
            invitation,
          });
        return p.api("/api/groups/" + gid + "/events", {
          event: await v.signedEvent(doc, p.pair.privateKey),
        });
      }
      async function change(p, action, modify) {
        const hist = await getHistory(),
          last = hist.at(-1),
          doc = v.rosterDocument({
            ...last.event.document,
            version: hist.length + 1,
            prevHash: last.hash,
            actorId: p.id,
            action,
            invitation: null,
            ...modify(last.event.document),
          });
        return p.api("/api/groups/" + gid + "/events", {
          event: await v.signedEvent(doc, p.pair.privateKey),
        });
      }
      async function postText(p, text, ctx) {
        ctx = ctx || v.groupContext(await getHistory());
        const e = await v.sealText(ctx, p.id, p.pair.privateKey, text);
        return { e, r: await p.api("/api/v2/messages", { envelope: e }) };
      }
      async function file(
        p,
        ctx,
        bytes = Buffer.from("Nội dung bí mật 🌻"),
        name = "tài-liệu.txt",
      ) {
        const prepared = await v.sealFile(ctx, p.id, p.pair.privateKey, bytes, {
          name,
          mime: "text/plain",
        });
        const e = prepared.envelope;
        const reserved = await p.api("/api/attachments", {
          id: e.header.attachmentId,
          scope: ctx.scope,
          scopeId: ctx.id,
          membershipVersion: ctx.version,
          rosterHash: ctx.hash,
          bytes: prepared.binary.length,
          hash: e.file.hash,
        });
        return { ...prepared, bytes, reserved };
      }
      await t.test(
        "Identity immutability, ownership, authenticated CSRF and signed group genesis",
        async () => {
          assert.equal((await anon("/api/groups")).status, 401);
          assert.equal(
            (await b.api("/api/v2/identities", { record: a.record })).status,
            403,
          );
          const fake = await v.identityProof(a.id, a.x);
          assert.equal(
            (await a.api("/api/v2/identities", { record: fake.record })).status,
            409,
          );
          const id = crypto.randomUUID(),
            doc = v.rosterDocument({
              id,
              actorId: a.id,
              name: "Nhóm tiếng Việt 💛",
              members: [{ ...a.member, role: "owner" }],
            });
          const event = await v.signedEvent(doc, a.pair.privateKey);
          assert.equal(
            (
              await a.api("/api/groups", { event }, "POST", {
                "X-CSRF-Token": "",
              })
            ).status,
            403,
          );
          assert.equal((await a.api("/api/groups", { event })).status, 201);
          gid = id;
          history = await getHistory();
          assert.equal(history.length, 1);
          assert.equal((await outsider.api("/api/groups/" + gid)).status, 403);
          oldMessage = await postText(a, "Chỉ chủ nhóm đọc tin đầu");
          assert.equal(oldMessage.r.status, 201);
        },
      );
      await t.test(
        "Signed invitations, accept/reject/ownership, no implicit old-history access",
        async () => {
          const ib = await invitation(a, b);
          assert.equal(
            (
              await a.api("/api/groups/" + gid + "/invitations", {
                invitation: ib,
              })
            ).status,
            201,
          );
          const duplicate = await invitation(a, b);
          assert.equal(
            (
              await a.api("/api/groups/" + gid + "/invitations", {
                invitation: duplicate,
              })
            ).status,
            409,
          );
          assert.equal(
            (await b.api("/api/groups/invitations")).data.invitations.length,
            1,
          );
          const id = await invitation(a, d);
          assert.equal(
            (
              await a.api("/api/groups/" + gid + "/invitations", {
                invitation: id,
              })
            ).status,
            201,
          );
          assert.equal(
            (
              await outsider.api(
                "/api/groups/invitations/" + id.document.id + "/reject",
                {},
              )
            ).status,
            404,
          );
          assert.equal(
            (await b.api("/api/groups/invitations")).data.invitations.length,
            1,
          );
          assert.equal((await join(b, ib)).status, 200);
          assert.equal((await join(d, id)).status, 200);
          assert.equal(
            (await b.api("/api/v2/history/group/" + gid)).data.messages.length,
            0,
          );
          const shared = await postText(a, "Ba thành viên cùng đọc");
          assert.equal(shared.r.status, 201);
          for (const p of [a, b, d])
            assert.equal(
              (
                await v.openEnvelope(
                  shared.e,
                  v.groupContext(await getHistory()),
                  p.id,
                  p.x.privateKey,
                )
              ).payload.text,
              "Ba thành viên cùng đọc",
            );
          assert.equal(
            (await b.api("/api/v2/history/group/" + gid)).data.messages.length,
            1,
          );
          assert.equal(
            (await b.api("/api/v2/messages", { envelope: shared.e })).status,
            403,
          );
          assert.equal(
            (await a.api("/api/v2/messages", { envelope: shared.e })).status,
            409,
          );
          const forged = JSON.parse(JSON.stringify(shared.e));
          forged.ciphertext = v.b64(new Uint8Array(30));
          forged.header.id = crypto.randomUUID();
          assert.equal(
            (await a.api("/api/v2/messages", { envelope: forged })).status,
            400,
          );
        },
      );
      await t.test(
        "Roles, signed metadata/avatar, transfer rules and former members cannot send new messages",
        async () => {
          assert.equal(
            (
              await change(b, "roles", (d) => ({
                members: d.members.map((m) =>
                  m.id === b.id ? { ...m, role: "admin" } : m,
                ),
              }))
            ).status,
            400,
          );
          assert.equal(
            (
              await change(a, "roles", (d) => ({
                members: d.members.map((m) =>
                  m.id === b.id ? { ...m, role: "admin" } : m,
                ),
              }))
            ).status,
            200,
          );
          assert.equal(
            (
              await change(b, "remove", (x) => ({
                members: x.members.filter((m) => m.id !== a.id),
              }))
            ).status,
            400,
          );
          assert.equal(
            (await change(b, "update", () => ({ name: "Tên nhóm mới" })))
              .status,
            200,
          );
          const png = await require("sharp")({
            create: {
              width: 300,
              height: 200,
              channels: 3,
              background: "#ffe150",
            },
          })
            .png()
            .toBuffer();
          const upload = await b.api(
            "/api/groups/" + gid + "/avatar",
            png,
            "PUT",
            { "Content-Type": "image/png" },
          );
          assert.equal(upload.status, 201);
          assert.equal(
            (
              await change(b, "update", () => ({
                avatarId: upload.data.avatarId,
                avatarHash: upload.data.hash,
              }))
            ).status,
            200,
          );
          const image = await a.api(
            "/api/groups/" + gid + "/avatar/" + upload.data.avatarId,
          );
          assert.equal(await v.digest(image.data), upload.data.hash);
          assert.equal(
            (
              await outsider.api(
                "/api/groups/" + gid + "/avatar/" + upload.data.avatarId,
              )
            ).status,
            403,
          );
        },
      );
      await t.test(
        "Binary upload stays private until publish, validates hashes and wraps, then every recipient decrypts",
        async () => {
          const ctx = v.groupContext(await getHistory()),
            f = await file(a, ctx);
          assert.equal(f.reserved.status, 201);
          firstFile = f;
          assert.equal(
            (await a.api("/api/v2/messages", { envelope: f.envelope })).status,
            409,
          );
          assert.equal(
            (
              await b.api(
                "/api/attachments/" +
                  f.envelope.header.attachmentId +
                  "/content",
              )
            ).status,
            403,
          );
          const bad = new Uint8Array(f.binary);
          bad[0] ^= 1;
          assert.equal(
            (
              await a.api(
                "/api/attachments/" +
                  f.envelope.header.attachmentId +
                  "/content",
                bad,
                "PUT",
              )
            ).status,
            400,
          );
          assert.equal(
            (
              await a.api(
                "/api/attachments/" +
                  f.envelope.header.attachmentId +
                  "/content",
                f.binary,
                "PUT",
              )
            ).status,
            200,
          );
          assert.equal(
            (await a.api("/api/v2/messages", { envelope: f.envelope })).status,
            201,
          );
          assert.equal(
            (
              await a.api(
                "/api/attachments/" + f.envelope.header.attachmentId,
                {},
                "DELETE",
              )
            ).status,
            409,
          );
          for (const p of [a, b, d]) {
            const response = await p.api(
              "/api/attachments/" + f.envelope.header.attachmentId + "/content",
            );
            assert.equal(response.status, 200);
            assert.equal(
              response.headers.get("content-type"),
              "application/octet-stream",
            );
            const opened = await v.openEnvelope(
              f.envelope,
              ctx,
              p.id,
              p.x.privateKey,
            );
            assert.deepEqual(
              Buffer.from(await v.openFile(f.envelope, opened, response.data)),
              f.bytes,
            );
          }
          assert.equal(
            (
              await outsider.api(
                "/api/attachments/" +
                  f.envelope.header.attachmentId +
                  "/content",
              )
            ).status,
            403,
          );
          const [[stored]] = await db
            .promise()
            .query("SELECT * FROM encrypted_attachments WHERE id=?", [
              f.envelope.header.attachmentId,
            ]);
          assert.equal(stored.state, "attached");
          assert.ok(!JSON.stringify(stored).includes("tài-liệu.txt"));
        },
      );
      await t.test(
        "A newly accepted member cannot fetch any earlier message or file",
        async () => {
          await friends(a, outsider);
          const rejected = await invitation(a, outsider);
          assert.equal(
            (
              await a.api("/api/groups/" + gid + "/invitations", {
                invitation: rejected,
              })
            ).status,
            201,
          );
          assert.equal(
            (
              await outsider.api(
                "/api/groups/invitations/" + rejected.document.id + "/reject",
                {},
              )
            ).status,
            200,
          );
          assert.equal((await join(outsider, rejected)).status, 409);
          const fresh = await invitation(a, outsider);
          assert.equal(
            (
              await a.api("/api/groups/" + gid + "/invitations", {
                invitation: fresh,
              })
            ).status,
            201,
          );
          assert.equal((await join(outsider, fresh)).status, 200);
          assert.equal(
            (await outsider.api("/api/v2/history/group/" + gid)).data.messages
              .length,
            0,
          );
          assert.equal(
            (
              await outsider.api(
                "/api/attachments/" +
                  firstFile.envelope.header.attachmentId +
                  "/content",
              )
            ).status,
            403,
          );
        },
      );
      await t.test(
        "Removing a member invalidates stale envelopes/reservations; old wrapped history remains readable",
        async () => {
          const ctx = v.groupContext(await getHistory()),
            stale = await v.sealText(
              ctx,
              a.id,
              a.pair.privateKey,
              "Tin dùng roster cũ",
            ),
            pending = await file(a, ctx);
          assert.equal(
            (
              await a.api(
                "/api/attachments/" +
                  pending.envelope.header.attachmentId +
                  "/content",
                pending.binary,
                "PUT",
              )
            ).status,
            200,
          );
          assert.equal(
            (
              await change(a, "remove", (doc) => ({
                members: doc.members.filter((m) => m.id !== d.id),
              }))
            ).status,
            200,
          );
          assert.equal(
            (await a.api("/api/v2/messages", { envelope: stale })).status,
            409,
          );
          assert.equal(
            (await a.api("/api/v2/messages", { envelope: pending.envelope }))
              .status,
            409,
          );
          assert.equal(
            (await postText(d, "Người đã rời gửi", ctx)).r.status,
            403,
          );
          const fresh = await file(a, v.groupContext(await getHistory()));
          assert.equal(fresh.reserved.status, 201);
          await a.api(
            "/api/attachments/" +
              fresh.envelope.header.attachmentId +
              "/content",
            fresh.binary,
            "PUT",
          );
          assert.equal(
            (await a.api("/api/v2/messages", { envelope: fresh.envelope }))
              .status,
            201,
          );
          assert.equal(
            (
              await d.api(
                "/api/attachments/" +
                  fresh.envelope.header.attachmentId +
                  "/content",
              )
            ).status,
            403,
          );
          assert.equal(
            (
              await d.api(
                "/api/attachments/" +
                  firstFile.envelope.header.attachmentId +
                  "/content",
              )
            ).status,
            200,
          );
          const old = (await d.api("/api/v2/history/group/" + gid)).data
            .messages;
          assert.ok(
            old.every(
              (m) => m.envelope.header.membershipVersion <= ctx.version,
            ),
          );
          assert.equal(
            (
              await a.api(
                "/api/attachments/" + pending.envelope.header.attachmentId,
                {},
                "DELETE",
              )
            ).status,
            200,
          );
        },
      );
      await t.test(
        "Direct chat file E2EE preserves legacy tables and rejects outsider reads",
        async () => {
          const convo = (await a.api("/api/conversations", { friendId: b.id }))
            .data.conversationId;
          const ctx = (await a.api("/api/v2/direct/" + convo + "/context")).data
            .context;
          const f = await file(a, ctx, Buffer.from("File 1–1"), "riêng.txt");
          assert.equal(f.reserved.status, 201);
          assert.equal(
            (
              await a.api(
                "/api/attachments/" +
                  f.envelope.header.attachmentId +
                  "/content",
                f.binary,
                "PUT",
              )
            ).status,
            200,
          );
          assert.equal(
            (await a.api("/api/v2/messages", { envelope: f.envelope })).status,
            201,
          );
          const list = (await b.api("/api/v2/history/direct/" + convo)).data
            .messages;
          assert.equal(list.length, 1);
          const opened = await v.openEnvelope(
            list[0].envelope,
            ctx,
            b.id,
            b.x.privateKey,
          );
          const response = await b.api(
            "/api/attachments/" + f.envelope.header.attachmentId + "/content",
          );
          assert.deepEqual(
            Buffer.from(
              await v.openFile(list[0].envelope, opened, response.data),
            ),
            f.bytes,
          );
          assert.equal(
            (await outsider.api("/api/v2/history/direct/" + convo)).status,
            403,
          );
          assert.deepEqual((await a.api("/api/messages/" + convo)).data, []);
        },
      );
      await t.test(
        "10 MB boundary, quota reservation races, owner-only cancellation and traversal rejection",
        async () => {
          const ctx = v.groupContext(await getHistory());
          const oversize = {
            id: crypto.randomUUID(),
            scope: ctx.scope,
            scopeId: ctx.id,
            membershipVersion: ctx.version,
            rosterHash: ctx.hash,
            bytes: 10 * 1024 * 1024 + 17,
            hash: "0".repeat(64),
          };
          assert.equal((await a.api("/api/attachments", oversize)).status, 400);
          process.env.FILE_USER_QUOTA_BYTES = "70";
          const raced = await Promise.all([
            file(b, ctx, Buffer.alloc(40)),
            file(b, ctx, Buffer.alloc(40)),
          ]);
          assert.deepEqual(
            raced.map((r) => r.reserved.status).sort(),
            [201, 413],
          );
          const kept = raced.find((r) => r.reserved.status === 201);
          assert.equal(
            (
              await b.api(
                "/api/attachments/" + kept.envelope.header.attachmentId,
                {},
                "DELETE",
              )
            ).status,
            200,
          );
          process.env.FILE_USER_QUOTA_BYTES = "100";
          assert.equal(
            (await file(a, ctx, Buffer.alloc(101))).reserved.status,
            413,
          );
          delete process.env.FILE_USER_QUOTA_BYTES;
          const f = await file(a, ctx);
          assert.equal(
            (
              await b.api(
                "/api/attachments/" + f.envelope.header.attachmentId,
                {},
                "DELETE",
              )
            ).status,
            404,
          );
          assert.equal(
            (
              await a.api(
                "/api/attachments/" + f.envelope.header.attachmentId,
                {},
                "DELETE",
              )
            ).status,
            200,
          );
          const store = require("../src/services/ciphertextStorage").storage();
          assert.throws(() => store.file("../../etc/passwd"));
          const big = await file(
            a,
            ctx,
            Buffer.alloc(10 * 1024 * 1024, 7),
            "10mb.txt",
          );
          assert.equal(big.reserved.status, 201);
          assert.equal(
            (
              await a.api(
                "/api/attachments/" +
                  big.envelope.header.attachmentId +
                  "/content",
                big.binary,
                "PUT",
              )
            ).status,
            200,
          );
          assert.equal(
            (await a.api("/api/v2/messages", { envelope: big.envelope }))
              .status,
            201,
          );
        },
      );
      await t.test(
        "Maintenance releases only expired orphans, deletes stale temp files and preserves attached ciphertext",
        async () => {
          const orphan = await file(a, v.groupContext(await getHistory()));
          assert.equal(orphan.reserved.status, 201);
          await a.api(
            "/api/attachments/" +
              orphan.envelope.header.attachmentId +
              "/content",
            orphan.binary,
            "PUT",
          );
          await db
            .promise()
            .query(
              "UPDATE encrypted_attachments SET expires_at=DATE_SUB(NOW(6),INTERVAL 2 HOUR) WHERE id=?",
              [orphan.envelope.header.attachmentId],
            );
          const tmp = path.join(directory, crypto.randomUUID() + ".bin.tmp");
          fs.writeFileSync(tmp, "partial ciphertext");
          const old = new Date(Date.now() - 26 * 3600000);
          fs.utimesSync(tmp, old, old);
          const result =
            await require("../src/services/attachmentMaintenance").cleanupAttachments();
          assert.ok(result.orphanCiphertexts >= 1);
          assert.equal(result.temporaryCiphertexts, 1);
          assert.ok(!fs.existsSync(tmp));
          assert.equal(
            (
              await a.api(
                "/api/attachments/" +
                  orphan.envelope.header.attachmentId +
                  "/content",
              )
            ).status,
            404,
          );
          assert.equal(
            (
              await b.api(
                "/api/attachments/" +
                  firstFile.envelope.header.attachmentId +
                  "/content",
              )
            ).status,
            200,
          );
        },
      );
      await t.test(
        "Membership changes serialize with sending; owner transfers then leaves; invalid cursors reject",
        async () => {
          const oldCtx = v.groupContext(await getHistory()),
            e = await v.sealText(
              oldCtx,
              a.id,
              a.pair.privateKey,
              "Gửi khi đổi thành viên",
            );
          const [sent, changed] = await Promise.all([
            a.api("/api/v2/messages", { envelope: e }),
            change(a, "transfer", (doc) => ({
              members: doc.members.map((m) => ({
                ...m,
                role:
                  m.id === b.id ? "owner" : m.id === a.id ? "admin" : m.role,
              })),
            })),
          ]);
          assert.ok([201, 409].includes(sent.status));
          assert.equal(changed.status, 200);
          assert.equal(
            (
              await change(a, "leave", (doc) => ({
                members: doc.members.filter((m) => m.id !== a.id),
              }))
            ).status,
            200,
          );
          assert.equal(
            (await a.api("/api/v2/history/group/" + gid + "?before=bad"))
              .status,
            400,
          );
        },
      );
    } finally {
      if (server) await new Promise((r) => server.close(r));
      if (app) await app.locals.sessionStore.close();
      if (db) await db.promise().end();
      await admin.query("DROP DATABASE IF EXISTS `" + name + "`");
      await admin.end();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  },
);
