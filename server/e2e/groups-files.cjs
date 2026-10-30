"use strict";
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  crypto = require("node:crypto"),
  vm = require("node:vm");
const { chromium } = require("playwright"),
  mysql = require("../node_modules/mysql2/promise");
const root = path.resolve(__dirname, "../.."),
  delay = (ms) => new Promise((r) => setTimeout(r, ms));
async function wait(fn, label) {
  for (let i = 0; i < 160; i++) {
    if (await fn()) return;
    await delay(125);
  }
  throw Error(label);
}
async function main() {
  const name = "seruchat_groups_e2e_" + crypto.randomBytes(6).toString("hex"),
    work = fs.mkdtempSync(path.join(os.tmpdir(), "seruchat-groups-e2e-"));
  let app, db, server, browser;
  const errors = [];
  const admin = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    multipleStatements: true,
  });
  try {
    await admin.query(
      fs
        .readFileSync(root + "/database/schema.sql", "utf8")
        .replace(/\bseruchat\b/g, name),
    );
    const password = crypto.randomBytes(20).toString("hex"),
      hash = await require("../node_modules/argon2").hash(password),
      users = {};
    const ctx = vm.createContext({
      crypto: crypto.webcrypto,
      TextEncoder,
      TextDecoder,
      Uint8Array,
      atob,
      btoa,
    });
    vm.runInContext(
      fs.readFileSync(root + "/client/js/encryption/keyManager.js", "utf8"),
      ctx,
    );
    for (const who of ["alpha", "beta", "gamma"]) {
      const id = crypto.randomUUID(),
        pair = await ctx.generateKeyPair(),
        backup = await ctx.encryptPrivateKey(pair.privateKey, password);
      users[who] = { id, pair };
      await admin.query(
        "INSERT INTO users(id,username,email,password_hash) VALUES (?,?,?,?)",
        [id, who, who + "@test.example", hash],
      );
      await admin.query(
        "INSERT INTO public_keys(user_id,public_key,algorithm,encrypted_private_key,encryption_salt,encryption_iv) VALUES (?,?,'X25519',?,?,?)",
        [
          id,
          await ctx.exportPublicKey(pair.publicKey),
          backup.encryptedPrivateKey,
          backup.salt,
          backup.iv,
        ],
      );
    }
    for (const who of ["beta", "gamma"])
      await admin.query(
        "INSERT INTO friendships(id,user1_id,user2_id,requested_by,status) VALUES (?,?,?,?,'accepted')",
        [
          crypto.randomUUID(),
          ...[users.alpha.id, users[who].id].sort(),
          users.alpha.id,
        ],
      );
    Object.assign(process.env, {
      DB_NAME: name,
      SESSION_SECRET: crypto.randomBytes(32).toString("hex"),
      ATTACHMENT_DIR: path.join(work, "ciphertext"),
      REQUIRE_EMAIL_VERIFICATION: "false",
      RECOVERY_MASTER_KEY: crypto.randomBytes(32).toString("hex"),
    });
    db = require("../src/config/database");
    const c = await db.promise().getConnection();
    try {
      await require("../src/migrations/runner").up(c);
    } finally {
      c.release();
    }
    for (const who of ["alpha", "beta", "gamma"])
      await admin.query("UPDATE user_profiles SET handle=? WHERE user_id=?", [
        who,
        users[who].id,
      ]);
    app = require("../src/server").createApp();
    await app.locals.sessionStore.onReady();
    server = await new Promise((r) => {
      const s = app.listen(0, "127.0.0.1", () => r(s));
    });
    const url = "http://127.0.0.1:" + server.address().port;
    const args = JSON.parse(process.env.E2E_BROWSER_ARGS || "[]");
    if (
      args.some((a) =>
        /disable-web-security|allow-running-insecure-content/.test(a),
      )
    )
      throw Error("Unsafe browser args");
    browser = await chromium.launch({
      headless: true,
      ...(process.env.E2E_BROWSER_PATH
        ? { executablePath: process.env.E2E_BROWSER_PATH }
        : {}),
      args: [
        "--disable-dev-shm-usage",
        ...(process.env.E2E_NO_SANDBOX === "1" ? ["--no-sandbox"] : []),
        ...args,
      ],
    });
    async function page() {
      const p = await (
        await browser.newContext({ acceptDownloads: true })
      ).newPage();
      p.on("pageerror", (e) => {
        errors.push(e.message);
        console.error("Browser error:", e.message);
      });
      return p;
    }
    async function confirm(p) {
      await p.locator("#confirmDialog").waitFor({ state: "visible" });
      await p.locator("#confirmYes").click();
    }
    async function groupPane(p) {
      await p.locator("#mainMenuButton").click();
      await p
        .locator("#mainMenu")
        .getByRole("menuitem", { name: "Khác", exact: true })
        .click();
      await p
        .locator("#moreMenu")
        .getByRole("menuitem", { name: "Nhóm & lời mời", exact: true })
        .click();
    }
    const recoveryCodes = {};
    async function login(p, who) {
      await p.goto(url);
      await p.locator("#loginEmail").fill(who + "@test.example");
      await p.locator("#loginPassword").fill(password);
      await p.locator("#loginForm button[type=submit]").click();
      const code = await require("./recovery-helper.cjs").finishRecovery(p);
      if (code) recoveryCodes[who] = code;
      await groupPane(p);
    }
    const a = await page(),
      b = await page(),
      g = await page();
    await login(a, "alpha");
    console.log("PASS: alpha PIN enrollment");
    await login(b, "beta");
    await login(g, "gamma");
    console.log("PASS: three independent accounts enrolled");
    await a.locator("#newGroup").click();
    await a.locator("#newGroupName").fill("Bạn bè cuối tuần 💛");
    await a.locator("#newGroupDescription").fill("Nhóm kiểm thử thật");
    await a.locator("#createGroupForm button").click();
    await a.locator("#groupChatSection").waitFor({ state: "visible" });
    const [[group]] = await admin.query("SELECT id FROM chat_groups");
    const gid = group.id;
    await a
      .locator("#groupMessageInput")
      .fill("Tin trước khi có thành viên mới");
    await a.locator("#groupMessageForm button[type=submit]").click();
    await wait(
      async () =>
        (await a.locator("#groupMessages").textContent()).includes(
          "Tin trước khi",
        ),
      "First group message missing",
    );
    async function invite(who, p) {
      await a.locator("#groupSettings").click();
      await a.locator("#groupInviteHandle").fill(who);
      await a.locator("#groupInviteForm button").click();
      await a.locator("#groupInviteResults [data-action=invite-group]").click();
      await wait(
        async () =>
          (await a.locator("#groupSettingsStatus").textContent()).includes(
            "Đã mời",
          ),
        "Invite failed",
      );
      await a.locator("#closeGroupSettings").click();
      await p.locator("#groupInvitations [data-action=join-group]").waitFor();
      await p.locator("#groupInvitations [data-action=join-group]").click();
      await p.locator("#groupChatSection").waitFor({ state: "visible" });
    }
    await invite("beta", b);
    await invite("gamma", g);
    assert.ok(
      !(await b.locator("#groupMessages").textContent()).includes(
        "Tin trước khi",
      ),
    );
    assert.ok(
      !(await g.locator("#groupMessages").textContent()).includes(
        "Tin trước khi",
      ),
    );
    await a.locator("#groupMessageInput").fill("Tin chung ba người 👨‍👩‍👧‍👦 🇻🇳");
    await a.locator("#groupMessageForm button[type=submit]").click();
    for (const p of [b, g])
      await wait(
        async () =>
          (await p.locator("#groupMessages").textContent()).includes(
            "Tin chung ba người",
          ),
        "Group decrypt failed",
      );
    const originalTarget = await a
      .locator("#groupMessages .chat-message")
      .filter({ hasText: "Tin chung ba người" })
      .getAttribute("data-message-id");
    await b.evaluate(
      async ({ gid, target }) => {
        await ThreadActions.event(
          "edit",
          { scope: "group", id: gid, messageId: target },
          { text: "Unauthorized edit" },
        );
        await ThreadActions.event("pin", {
          scope: "group",
          id: gid,
          messageId: target,
        });
      },
      { gid, target: originalTarget },
    );
    await wait(
      async () =>
        (await a.locator("#groupMessages .action-event").count()) >= 2,
      "Signed action delivery missing",
    );
    assert.ok(
      (
        await a
          .locator('[data-message-id="' + originalTarget + '"] .message-text')
          .textContent()
      ).includes("Tin chung ba người"),
    );
    assert.equal(await a.locator(".tg-pinned-message:visible").count(), 0);
    await b
      .locator('[data-message-id="' + originalTarget + '"]')
      .click({ button: "right" });
    assert.equal(
      await b
        .locator("#contextMenu")
        .getByRole("menuitem", { name: "Ghim tin nhắn", exact: true })
        .count(),
      0,
    );
    await b.keyboard.press("Escape");
    await a.evaluate(
      async ({ gid, target }) =>
        ThreadActions.event("pin", {
          scope: "group",
          id: gid,
          messageId: target,
        }),
      { gid, target: originalTarget },
    );
    await wait(
      async () => (await b.locator(".tg-pinned-message:visible").count()) === 1,
      "Owner pin missing",
    );
    await a.evaluate(
      async ({ gid, target }) =>
        ThreadActions.event("unpin", {
          scope: "group",
          id: gid,
          messageId: target,
        }),
      { gid, target: originalTarget },
    );
    await wait(
      async () => (await b.locator(".tg-pinned-message:visible").count()) === 0,
      "Owner unpin missing",
    );
    console.log(
      "PASS: signed unauthorized group edits/pins ignored; owner pin/unpin synchronized",
    );
    async function upload(p, id, name, mime, buffer) {
      await p.locator(id).setInputFiles({ name, mimeType: mime, buffer });
      await wait(
        async () =>
          (await p.locator("#groupMessageStatus").textContent()).includes(
            "Đã gửi tệp",
          ),
        "File upload/publish failed",
      );
    }
    const secret = Buffer.from("Tệp tiếng Việt bí mật 🌻");
    await upload(a, "#groupFile", "bí-mật.txt", "text/plain", secret);
    await wait(
      async () =>
        (await b.locator("#groupMessages").textContent()).includes(
          "bí-mật.txt",
        ),
      "Group file metadata did not decrypt",
    );
    let downloads = b.waitForEvent("download");
    await b
      .locator("#groupMessages [data-action=download-file]")
      .first()
      .click();
    let download = await downloads;
    assert.deepEqual(fs.readFileSync(await download.path()), secret);
    const [[fileRow]] = await admin.query(
      "SELECT * FROM v2_messages WHERE group_id=? AND JSON_UNQUOTE(JSON_EXTRACT(envelope,'$.header.type'))='file' LIMIT 1",
      [gid],
    );
    const fileEnvelope =
      typeof fileRow.envelope === "string"
        ? JSON.parse(fileRow.envelope)
        : fileRow.envelope;
    assert.ok(!JSON.stringify(fileEnvelope).includes("bí-mật.txt"));
    const downloadPath =
        "/api/attachments/" + fileEnvelope.header.attachmentId + "/content",
      card = b
        .locator("#groupMessages .chat-message")
        .filter({ hasText: "bí-mật.txt" });
    await b.route("**" + downloadPath, (r) =>
      r.fulfill({
        contentType: "application/octet-stream",
        body: Buffer.alloc(fileEnvelope.file.bytes + 1),
      }),
    );
    await card.locator("[data-action=download-file]").click();
    await wait(
      async () =>
        (await card.locator(".file-status").textContent()).includes(
          "Kích thước phản hồi",
        ),
      "Oversized download was not bounded",
    );
    await b.unroute("**" + downloadPath);
    await b.route("**" + downloadPath, (r) =>
      r.fulfill({
        contentType: "application/octet-stream",
        body: Buffer.alloc(fileEnvelope.file.bytes),
      }),
    );
    await card.locator("[data-action=download-file]").click();
    await wait(
      async () =>
        (await card.locator(".file-status").textContent()).includes(
          "File bị sửa",
        ),
      "Changed binary ciphertext was not rejected",
    );
    await b.unroute("**" + downloadPath);
    downloads = b.waitForEvent("download");
    await card.locator("[data-action=download-file]").click();
    download = await downloads;
    assert.deepEqual(fs.readFileSync(await download.path()), secret);
    const png = await require("../node_modules/sharp")({
      create: { width: 480, height: 320, channels: 3, background: "#f4df4c" },
    })
      .png()
      .toBuffer();
    await upload(a, "#groupFile", "ảnh.png", "image/png", png);
    await wait(
      async () =>
        (await b.locator("#groupMessages").textContent()).includes("ảnh.png"),
      "Image metadata missing",
    );
    await b.locator("#groupMessages [data-action=preview-file]").click();
    await b.locator(".decrypted-preview").waitFor();
    assert.ok(
      (await b.locator(".decrypted-preview").getAttribute("src")).startsWith(
        "blob:",
      ),
    );
    for (const [ext, mime, buffer] of [
      [
        "jpg",
        "image/jpeg",
        await require("../node_modules/sharp")(png).jpeg().toBuffer(),
      ],
      [
        "webp",
        "image/webp",
        await require("../node_modules/sharp")(png)
          .webp({ lossless: true })
          .toBuffer(),
      ],
    ]) {
      await upload(a, "#groupFile", "preview." + ext, mime, buffer);
      await wait(
        async () =>
          (await b.locator("#groupMessages").textContent()).includes(
            "preview." + ext,
          ),
        "Image metadata missing",
      );
      const card = b
        .locator("#groupMessages .chat-message")
        .filter({ hasText: "preview." + ext });
      await card.locator("[data-action=preview-file]").click();
      await card.locator(".decrypted-preview").waitFor();
    }
    await upload(
      a,
      "#groupFile",
      "fake.png",
      "image/png",
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>',
      ),
    );
    await wait(
      async () =>
        (await b.locator("#groupMessages").textContent()).includes("fake.png"),
      "Fake preview fixture missing",
    );
    const fakeCard = b
      .locator("#groupMessages .chat-message")
      .filter({ hasText: "fake.png" });
    await fakeCard.locator("[data-action=preview-file]").click();
    await wait(
      async () =>
        (await b.locator("#operationStatus").textContent()).includes(
          "Preview chỉ nhận",
        ),
      "Active-content preview was not rejected",
    );
    assert.equal(await fakeCard.locator("img").count(), 0);
    const [[message]] = await admin.query(
      "SELECT * FROM v2_messages WHERE id=?",
      [originalTarget],
    );
    const original =
        typeof message.envelope === "string"
          ? JSON.parse(message.envelope)
          : message.envelope,
      changed = structuredClone(original),
      bytes = Buffer.from(changed.ciphertext, "base64");
    bytes[0] ^= 1;
    changed.ciphertext = bytes.toString("base64");
    await admin.query("UPDATE v2_messages SET envelope=? WHERE id=?", [
      JSON.stringify(changed),
      message.id,
    ]);
    await wait(
      async () =>
        (await b.locator("#groupMessages").textContent()).includes(
          "Không thể xác minh",
        ),
      "Tampered cached group message accepted",
    );
    assert.ok(
      !(await b.locator("#groupMessages").textContent()).includes(
        "Tin chung ba người",
      ),
    );
    await admin.query("UPDATE v2_messages SET envelope=? WHERE id=?", [
      JSON.stringify(original),
      message.id,
    ]);
    await wait(
      async () =>
        (await b.locator("#groupMessages").textContent()).includes(
          "Tin chung ba người",
        ),
      "Original did not recover",
    );
    const noHeader = structuredClone(original);
    noHeader.header = null;
    await admin.query("UPDATE v2_messages SET envelope=? WHERE id=?", [
      JSON.stringify(noHeader),
      message.id,
    ]);
    await wait(
      async () =>
        (await b.locator("#groupMessages").textContent()).includes(
          "Không thể xác minh",
        ),
      "Malformed header retained cached plaintext",
    );
    assert.ok(
      !(await b.locator("#groupMessages").textContent()).includes(
        "Tin chung ba người",
      ),
    );
    await admin.query("UPDATE v2_messages SET envelope=? WHERE id=?", [
      JSON.stringify(original),
      message.id,
    ]);
    await wait(
      async () =>
        (await b.locator("#groupMessages").textContent()).includes(
          "Tin chung ba người",
        ),
      "Valid message did not restore",
    );
    // Valid self-signed directory substitution still must fail against the device's existing pin.
    const v = await import("../src/crypto/secure-v2.mjs"),
      fakeX = await crypto.webcrypto.subtle.generateKey("X25519", true, [
        "deriveBits",
      ]),
      fake = (await v.identityProof(users.alpha.id, fakeX)).record;
    await b.route("**/api/v2/identities/" + users.alpha.id, (r) =>
      r.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ identity: fake }),
      }),
    );
    await wait(
      async () =>
        (await b.locator("#v2Status").textContent()).includes(
          "Khóa của thành viên đã thay đổi",
        ),
      "TOFU substitution was not blocked",
    );
    await b.unroute("**/api/v2/identities/" + users.alpha.id);
    await a.locator("#groupSettings").click();
    await a.locator("#editGroupName").fill("Nhóm E2EE đã kiểm thử");
    await a.locator("#groupMetadataForm button").click();
    await wait(
      async () =>
        (await a.locator("#groupSettingsStatus").textContent()).includes(
          "Đã lưu",
        ),
      "Signed metadata failed",
    );
    await a.locator("#closeGroupSettings").click();
    await wait(
      async () =>
        (await b.locator("#groupTitle").textContent()).includes("đã kiểm thử"),
      "Rename did not propagate",
    );
    if (process.env.E2E_GROUP_SCREENSHOT)
      await b.screenshot({
        path: process.env.E2E_GROUP_SCREENSHOT,
        fullPage: true,
      });
    await g.setViewportSize({ width: 390, height: 844 });
    assert.ok(
      await g.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    if (process.env.E2E_GROUP_MOBILE_SCREENSHOT)
      await g.screenshot({
        path: process.env.E2E_GROUP_MOBILE_SCREENSHOT,
        fullPage: true,
      });
    await a.locator("#groupSettings").click();
    await a
      .locator(
        '[data-member-id="' + users.gamma.id + '"] [data-action=remove-member]',
      )
      .click();
    await confirm(a);
    await wait(
      async () =>
        (await a
          .locator('[data-member-id="' + users.gamma.id + '"]')
          .count()) === 0,
      "Removal did not finish",
    );
    await a.locator("#closeGroupSettings").click();
    await wait(
      async () => await g.locator("#groupMessageInput").isDisabled(),
      "Removed member can still send",
    );
    assert.equal(
      await g.locator("#groupMessageForm button[type=submit]").isDisabled(),
      true,
    );
    const newer = Buffer.from("Sau khi gamma rời");
    await upload(a, "#groupFile", "mới.txt", "text/plain", newer);
    await wait(
      async () =>
        (await b.locator("#groupMessages").textContent()).includes("mới.txt"),
      "New file missing",
    );
    assert.ok(
      !(await g.locator("#groupMessages").textContent()).includes("mới.txt"),
    );
    const [[newRow]] = await admin.query(
      "SELECT id FROM encrypted_attachments WHERE group_id=? ORDER BY created_at DESC LIMIT 1",
      [gid],
    );
    assert.equal(
      await g.evaluate(
        async (id) =>
          (await fetch("/api/attachments/" + id + "/content")).status,
        newRow.id,
      ),
      403,
    );
    assert.equal(
      await g.evaluate(
        async (id) =>
          (await fetch("/api/attachments/" + id + "/content")).status,
        fileEnvelope.header.attachmentId,
      ),
      200,
    );
    // Direct binary files share v2 primitives without changing legacy v1 messages.
    const convo = await a.evaluate(
      async (peer) =>
        (
          await (
            await fetch("/api/conversations", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ friendId: peer }),
            })
          ).json()
        ).conversationId,
      users.beta.id,
    );
    for (const p of [a, b]) {
      await p.evaluate(() => SeruchatWorkspace.refresh(true));
      await p.locator('[data-room="direct:' + convo + '"]').click();
      await p.locator("#chatSection").waitFor({ state: "visible" });
    }
    await a.locator("#directFile").setInputFiles({
      name: "trực-tiếp.txt",
      mimeType: "text/plain",
      buffer: secret,
    });
    await wait(
      async () =>
        (await b.locator("#messagesList").textContent()).includes(
          "trực-tiếp.txt",
        ),
      "Direct file did not decrypt",
    );
    downloads = b.waitForEvent("download");
    await b.locator("#messagesList [data-action=download-file]").click();
    download = await downloads;
    assert.deepEqual(fs.readFileSync(await download.path()), secret);
    // Fresh browser restores the same signing identity only after entering the independent PIN.
    const fresh = await page();
    await login(fresh, "beta");
    await fresh.locator("#groupsList [data-action=open-group]").click();
    await wait(
      async () =>
        (await fresh.locator("#groupMessages").textContent()).includes(
          "bí-mật.txt",
        ),
      "Fresh browser signing/key restore failed",
    );
    // Repeated sends, exact delivery and stable DOM through multiple polling cycles.
    await groupPane(a);
    await a.locator("#groupsList [data-action=open-group]").click();
    for (let i = 1; i <= 10; i++) {
      await a.locator("#groupMessageInput").fill("Liên tục số " + i);
      await a.locator("#groupMessageInput").press("Enter");
      await wait(
        async () =>
          (await a.locator("#groupMessageInput").inputValue()) === "" &&
          (await a
            .locator("#groupMessageForm button[type=submit]")
            .isEnabled()),
        "Send stuck after message " + i,
      );
    }
    await wait(
      async () =>
        (await fresh.locator("#groupMessages").innerText()).includes(
          "Liên tục số 10",
        ),
      "Receiver missing repeated sends",
    );
    const [[count]] = await admin.query(
      "SELECT COUNT(*) AS n FROM v2_messages WHERE group_id=? AND sender_id=? AND JSON_UNQUOTE(JSON_EXTRACT(envelope,'$.header.type'))='text'",
      [gid, users.alpha.id],
    );
    assert.ok(count.n >= 10);
    await a.locator("#groupMessageInput").fill("Bản nháp đang gõ");
    await a.evaluate(() => {
      window.idleMutations = 0;
      window.idleNode = document.querySelector("#groupMessages .chat-message");
      window.idleObserver = new MutationObserver(
        (records) =>
          (window.idleMutations += records.filter(
            (r) => r.type === "childList",
          ).length),
      );
      for (const id of ["groupMessages", "groupsList", "groupInvitations"])
        window.idleObserver.observe(document.getElementById(id), {
          childList: true,
          subtree: true,
        });
      document.getElementById("groupMessages").scrollTop = 0;
    });
    await delay(9000);
    assert.equal(
      await a.evaluate(() => idleMutations),
      0,
      "Unchanged lists/messages were rebuilt",
    );
    assert.equal(await a.evaluate(() => idleNode.isConnected), true);
    assert.equal(
      await a.locator("#groupMessageInput").inputValue(),
      "Bản nháp đang gõ",
    );
    assert.equal(
      await a.evaluate(
        () => document.getElementById("groupMessages").scrollTop,
      ),
      0,
    );
    await a.evaluate(() => idleObserver.disconnect());
    console.log(
      "PASS: ten consecutive Enter sends; receiver delivery; idle DOM stays stable; draft + scroll preserved",
    );
    await a.locator('[data-room="direct:' + convo + '"]').click();
    await a.locator("#messageInput").fill("Nháp riêng");
    await a.locator('[data-room="group:' + gid + '"]').click();
    await wait(
      async () =>
        (await a.locator("#groupMessageInput").inputValue()) ===
        "Bản nháp đang gõ",
      "Group draft lost on switching",
    );
    await a.locator('[data-room="direct:' + convo + '"]').click();
    await wait(
      async () =>
        (await a.locator("#messageInput").inputValue()) === "Nháp riêng",
      "Direct draft lost on switching",
    );
    await a.evaluate(
      ({ convo, gid }) => {
        document.querySelector('[data-room="direct:' + convo + '"]').click();
        document.querySelector('[data-room="group:' + gid + '"]').click();
      },
      { convo, gid },
    );
    await wait(
      async () =>
        await a.evaluate(
          () =>
            currentConversationId === null &&
            document.getElementById("groupMessageInput").value ===
              "Bản nháp đang gõ",
        ),
      "Rapid room switching lost selected chat/draft",
    );
    console.log(
      "PASS: group/direct drafts and rapid switching preserve the selected conversation",
    );
    // Fresh context: login does not reveal history, lockout survives reload and recovery code works.
    const locked = await page();
    await locked.goto(url);
    await locked.locator("#loginEmail").fill("alpha@test.example");
    await locked.locator("#loginPassword").fill(password);
    await locked.locator("#loginForm button[type=submit]").click();
    await locked.locator("#recoveryDialog").waitFor({ state: "visible" });
    assert.equal(await locked.locator("#userInfo").isVisible(), false);
    for (let i = 1; i <= 5; i++) {
      await locked.locator("#recoveryValue").fill("82649315");
      await locked.locator("#recoverySubmit").click();
      await wait(
        async () =>
          !(await locked.locator("#recoveryStatus").innerText()).includes(
            "Đang xử lý",
          ),
        "PIN response missing",
      );
    }
    await wait(
      async () => await locked.locator("#recoverySubmit").isDisabled(),
      "Missing lockout countdown",
    );
    await locked.reload();
    await locked.locator("#recoveryDialog").waitFor({ state: "visible" });
    await wait(
      async () => await locked.locator("#recoverySubmit").isDisabled(),
      "Reload bypassed cooldown",
    );
    await locked.locator("#recoveryAlternative").click();
    await wait(
      async () => await locked.locator("#recoverySubmit").isEnabled(),
      "Recovery code blocked by PIN cooldown",
    );
    await locked.locator("#recoveryValue").fill(recoveryCodes.alpha);
    await locked.locator("#recoverySubmit").click();
    await locked.locator("#recoveryDialog").waitFor({ state: "hidden" });
    await locked.locator("#userInfo").waitFor({ state: "visible" });
    await groupPane(locked);
    await locked.locator("#groupsList [data-action=open-group]").click();
    await wait(
      async () =>
        (await locked.locator("#groupMessages").innerText()).includes(
          "Liên tục số 10",
        ),
      "Code recovery did not open history",
    );
    await locked.reload();
    await locked.locator("#userInfo").waitFor({ state: "visible" });
    assert.equal(
      await locked.locator("#recoveryDialog").isVisible(),
      false,
      "Trusted local key lost on reload",
    );
    console.log(
      "PASS: fresh profile requires PIN; five failures + countdown + reload; independent code recovers history; trusted reload",
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS: real 3-browser signed group/invite/accept; new-member old-history exclusion; group/direct binary files + real downloads + oversized/tampered binary rejection; safe PNG/JPEG/WebP previews + disguised SVG rejection; cached tamper rejection; pinned-key substitution blocked; signed rename + removal; former member old/new file authorization; fresh-device identity restore; mobile390px; no page errors.",
    );
  } catch (error) {
    if (browser)
      for (const [i, context] of browser.contexts().entries())
        for (const p of context.pages()) {
          await p
            .screenshot({
              path: path.join(root, "../", "polish-failure-" + i + ".png"),
            })
            .catch(() => {});
          console.error(
            "Page state",
            i,
            (await p.locator("body").innerText()).slice(-2000),
          );
        }
    throw error;
  } finally {
    if (browser) await browser.close();
    if (server) await new Promise((r) => server.close(r));
    if (app) await app.locals.sessionStore.close();
    if (db) await db.promise().end();
    await admin.query("DROP DATABASE IF EXISTS `" + name + "`");
    await admin.end();
    fs.rmSync(work, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
