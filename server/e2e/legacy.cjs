process.env.ALLOW_LEGACY_SEND = "true";
("use strict");
// Real browser/HTTP/MySQL and Java compatibility test. Uses only a new random test database.
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  crypto = require("node:crypto"),
  vm = require("node:vm");
const { spawn, execFile } = require("node:child_process"),
  run = require("node:util").promisify(execFile);
const { chromium } = require("playwright"),
  mysql = require("../node_modules/mysql2/promise");
const root = path.resolve(__dirname, "../..");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function wait(check, label) {
  for (let i = 0; i < 160; i++) {
    if (await check()) return;
    await delay(125);
  }
  throw new Error(label);
}
async function main() {
  const name = "seruchat_e2e_" + crypto.randomBytes(6).toString("hex");
  const admin = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    multipleStatements: true,
  });
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "seruchat-e2e-"));
  let app, db, server, browser, receiver;
  const errors = [];
  try {
    await admin.query(
      fs
        .readFileSync(root + "/database/schema.sql", "utf8")
        .replace(/\bseruchat\b/g, name),
    );
    const ids = { a: crypto.randomUUID(), b: crypto.randomUUID() },
      conversation = crypto.randomUUID(),
      password = crypto.randomBytes(20).toString("hex");
    const c = vm.createContext({
      crypto: crypto.webcrypto,
      TextEncoder,
      TextDecoder,
      Uint8Array,
      atob,
      btoa,
    });
    for (const file of ["keyManager.js", "encryption.js"])
      vm.runInContext(
        fs.readFileSync(root + "/client/js/encryption/" + file, "utf8"),
        c,
      );
    const pairs = {},
      b64 = (data) => Buffer.from(data).toString("base64"),
      argon = require("../node_modules/argon2");
    for (const who of ["a", "b"]) {
      await admin.query(
        "INSERT INTO users(id,username,email,password_hash) VALUES (?,?,?,?)",
        [
          ids[who],
          "Người dùng " + who,
          who + "@e2e.test",
          await argon.hash(password),
        ],
      );
      const pair = (pairs[who] = await c.generateKeyPair()),
        backup = await c.encryptPrivateKey(pair.privateKey, password);
      await admin.query(
        "INSERT INTO public_keys(user_id,public_key,algorithm,encrypted_private_key,encryption_salt,encryption_iv) VALUES (?,?,'X25519',?,?,?)",
        [
          ids[who],
          await c.exportPublicKey(pair.publicKey),
          backup.encryptedPrivateKey,
          backup.salt,
          backup.iv,
        ],
      );
    }
    await admin.query(
      "INSERT INTO friendships(id,user1_id,user2_id,requested_by,status) VALUES (?,?,?,?,'accepted')",
      [crypto.randomUUID(), ...[ids.a, ids.b].sort(), ids.a],
    );
    await admin.query("INSERT INTO conversations(id) VALUES (?)", [
      conversation,
    ]);
    for (const id of Object.values(ids))
      await admin.query(
        "INSERT INTO conversation_members(conversation_id,user_id) VALUES (?,?)",
        [conversation, id],
      );
    const old = await c.encryptForRecipient(
        "Lịch sử gốc tiếng Việt 👋",
        pairs.b.publicKey,
      ),
      self = await c.encryptForSelf(
        "Lịch sử gốc tiếng Việt 👋",
        pairs.a.publicKey,
      );
    const oldId = crypto.randomUUID();
    await admin.query(
      "INSERT INTO messages(id,conversation_id,sender_id,ciphertext,nonce,sender_public_key,self_ciphertext,self_nonce,self_public_key) VALUES (?,?,?,?,?,?,?,?,?)",
      [
        oldId,
        conversation,
        ids.a,
        b64(old.ciphertext),
        b64(old.iv),
        b64(old.senderPublicKey),
        b64(self.ciphertext),
        b64(self.iv),
        b64(self.senderPublicKey),
      ],
    );
    const [[before]] = await admin.query("SELECT * FROM messages WHERE id=?", [
      oldId,
    ]);
    await require("../src/migrations/runner").up(admin);
    assert.deepEqual(
      (await admin.query("SELECT * FROM messages WHERE id=?", [oldId]))[0][0],
      before,
    );
    process.env.RECOVERY_MASTER_KEY = crypto.randomBytes(32).toString("hex");
    process.env.DB_NAME = name;
    process.env.SESSION_SECRET = crypto.randomBytes(32).toString("hex");
    db = require("../src/config/database");
    app = require("../src/server").createApp();
    await app.locals.sessionStore.onReady();
    server = await new Promise((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    const url = "http://127.0.0.1:" + server.address().port;
    assert.equal((await fetch(url + "/health/ready")).status, 200);
    const browserArgs = JSON.parse(process.env.E2E_BROWSER_ARGS || "[]");
    if (
      !Array.isArray(browserArgs) ||
      browserArgs.some(
        (arg) =>
          typeof arg !== "string" ||
          /disable-web-security|allow-running-insecure-content/.test(arg),
      )
    )
      throw new Error("Unsafe browser arguments are not permitted");
    browser = await chromium.launch({
      headless: true,
      ...(process.env.E2E_BROWSER_PATH
        ? { executablePath: process.env.E2E_BROWSER_PATH }
        : {}),
      args: [
        "--disable-dev-shm-usage",
        ...(process.env.E2E_NO_SANDBOX === "1" ? ["--no-sandbox"] : []),
        ...browserArgs,
      ],
    });
    async function page() {
      const p = await (await browser.newContext()).newPage();
      p.on("pageerror", (e) => errors.push(e.message));
      return p;
    }
    const a = await page(),
      b = await page();
    async function confirm(p, yes = true) {
      await p.locator("#confirmDialog").waitFor({ state: "visible" });
      await p.locator(yes ? "#confirmYes" : "#confirmNo").click();
    }
    async function login(p, who, pass = password) {
      await p.goto(url);
      await p.locator("#loginEmail").fill(who + "@e2e.test");
      await p.locator("#loginPassword").fill(pass);
      await p.locator("#loginForm button[type=submit]").click();
      await require("./recovery-helper.cjs").finishRecovery(p);
    }
    async function open(p) {
      await p.locator('[data-room="direct:' + conversation + '"]').click();
      await wait(
        async () =>
          (await p.locator("#messagesList").textContent()).includes(
            "Lịch sử gốc tiếng Việt",
          ),
        "Legacy history missing",
      );
    }
    await login(a, "a");
    await login(b, "b");
    await open(a);
    await open(b);
    async function send(p, text, yes = true) {
      await p.locator("#messageInput").fill(text);
      if (yes) await p.locator("#sendMessageButton").click();
    }
    await send(a, "Tin mới sau nâng cấp 🌻", false);
    assert.equal(
      await a.locator("#messageInput").inputValue(),
      "Tin mới sau nâng cấp 🌻",
    );
    assert.equal(
      (await admin.query("SELECT COUNT(*) n FROM messages"))[0][0].n,
      1,
    );
    await send(a, "Tin mới sau nâng cấp 🌻");
    await wait(
      async () =>
        (await b.locator("#messagesList").textContent()).includes(
          "Tin mới sau nâng cấp 🌻",
        ),
      "New message missing",
    );
    const [[row]] = await admin.query(
      "SELECT * FROM v2_messages ORDER BY created_at DESC LIMIT 1",
    );
    const envelope =
      typeof row.envelope === "string"
        ? JSON.parse(row.envelope)
        : row.envelope;
    assert.ok(envelope.signature);
    const changed = structuredClone(envelope);
    const edited = Buffer.from(changed.ciphertext, "base64");
    edited[0] ^= 1;
    changed.ciphertext = edited.toString("base64");
    await admin.query("UPDATE v2_messages SET envelope=? WHERE id=?", [
      JSON.stringify(changed),
      row.id,
    ]);
    await wait(
      async () =>
        (await b.locator("#messagesList").textContent()).includes(
          "Không thể xác minh/giải mã",
        ),
      "Cached signed tampering was not rejected",
    );
    await admin.query("UPDATE v2_messages SET envelope=? WHERE id=?", [
      JSON.stringify(envelope),
      row.id,
    ]);
    await wait(
      async () =>
        (await b.locator("#messagesList").textContent()).includes(
          "Tin mới sau nâng cấp 🌻",
        ),
      "Signed original row did not recover",
    );
    const restored = await page();
    await login(restored, "a");
    await open(restored);
    async function action(p, id, label) {
      await p
        .locator('[data-message-id="' + id + '"]')
        .click({ button: "right" });
      await p
        .locator("#contextMenu")
        .getByRole("menuitem", { name: label, exact: true })
        .click();
    }
    await action(b, row.id, "👍");
    await wait(
      async () =>
        (
          await a
            .locator('[data-message-id="' + row.id + '"] .message-extra')
            .textContent()
        ).includes("👍 1"),
      "Reaction not synchronized",
    );
    await action(a, row.id, "Sửa tin nhắn");
    await send(a, "Tin đã sửa tự động ký");
    await wait(
      async () =>
        (await b
          .locator('[data-message-id="' + row.id + '"] .message-text')
          .textContent()) === "Tin đã sửa tự động ký",
      "Signed edit not applied",
    );
    await action(b, row.id, "Trả lời");
    await send(b, "Đây là câu trả lời");
    await wait(
      async () =>
        (await a.locator("#messagesList").textContent()).includes(
          "↩ Tin đã sửa tự động ký",
        ),
      "Reply reference missing",
    );
    await action(a, row.id, "Ghim tin nhắn");
    await wait(
      async () =>
        (await b.locator(".tg-pinned-message:visible").textContent()).includes(
          "Tin đã sửa",
        ),
      "Pinned message missing",
    );
    await action(b, row.id, "Lưu tin nhắn");
    await b.locator("#mainMenuButton").click();
    await b
      .locator("#mainMenu")
      .getByRole("menuitem", { name: "Tin nhắn đã lưu", exact: true })
      .click();
    await wait(
      async () =>
        (await b.locator("#savedList").textContent()).includes(
          "Tin đã sửa tự động ký",
        ),
      "Saved message failed",
    );
    const [[saved]] = await admin.query(
      "SELECT * FROM saved_notes WHERE user_id=?",
      [ids.b],
    );
    assert.ok(!saved.ciphertext.includes("Tin đã sửa"));
    await b.locator(".tg-notes button").first().click();
    await action(a, row.id, "Thu hồi tin nhắn");
    await confirm(a);
    await wait(
      async () =>
        (
          await b
            .locator('[data-message-id="' + row.id + '"] .message-text')
            .textContent()
        ).includes("đã được thu hồi"),
      "Recall not applied",
    );
    assert.equal(await b.locator(".tg-pinned-message:visible").count(), 0);
    // Chat preferences belong only to this user and survive page reload.
    async function roomAction(p, label) {
      await p
        .locator('[data-room="direct:' + conversation + '"] .tg-row-menu')
        .click();
      await p
        .locator("#contextMenu")
        .getByRole("menuitem", { name: label, exact: true })
        .click();
    }
    await roomAction(a, "Ghim lên đầu");
    await wait(
      async () =>
        (await a
          .locator('[data-room="direct:' + conversation + '"] .tg-pin')
          .count()) === 1,
      "Room pin missing",
    );
    await roomAction(a, "Tắt thông báo");
    await a
      .locator("#contextMenu")
      .getByRole("menuitem", { name: "Tắt thông báo 1 giờ", exact: true })
      .click();
    await wait(
      async () =>
        (await a
          .locator('[data-room="direct:' + conversation + '"] .tg-mute')
          .count()) === 1,
      "Mute missing",
    );
    await roomAction(a, "Lưu trữ");
    await a.locator("#archiveFolder").click();
    await a.locator('[data-room="direct:' + conversation + '"]').waitFor();
    await roomAction(a, "Đưa ra khỏi lưu trữ");
    await a.locator("#filterBack").click();
    await roomAction(a, "Đánh dấu chưa đọc");
    await wait(
      async () =>
        (await a
          .locator('[data-room="direct:' + conversation + '"] .tg-badge')
          .count()) === 1,
      "Marked unread missing",
    );
    await a.reload();
    await a.locator('[data-room="direct:' + conversation + '"]').waitFor();
    assert.equal(
      await a
        .locator('[data-room="direct:' + conversation + '"] .tg-pin')
        .count(),
      1,
    );
    assert.equal(
      await a
        .locator('[data-room="direct:' + conversation + '"] .tg-mute')
        .count(),
      1,
    );
    await open(a);
    await send(a, "Xem liên kết https://example.com/seruchat");
    await wait(
      async () =>
        (await a.locator("#messagesList").textContent()).includes(
          "https://example.com/seruchat",
        ),
      "Link text missing",
    );
    await a.locator("#chatUser").click();
    await a.locator(".tg-info").waitFor({ state: "visible" });
    await a
      .locator(".tg-info")
      .getByRole("button", { name: "Liên kết", exact: true })
      .click();
    assert.equal(
      await a.locator(".tg-info a").getAttribute("href"),
      "https://example.com/seruchat",
    );
    await a.locator(".tg-info .dialog-top button").click();
    await a.locator('[data-message-id="' + row.id + '"]').click();
    await a.locator("#contextMenu").waitFor({ state: "visible" });
    await a.keyboard.press("Escape");
    // Admin UI: no default administrator, TOTP required before dashboard.
    await admin.query("UPDATE users SET app_role='admin' WHERE id=?", [ids.a]);
    const adminPage = await a.context().newPage();
    adminPage.on("pageerror", (e) => errors.push(e.message));
    await adminPage.goto(url + "/admin");
    await adminPage.locator("#setupPassword").fill(password);
    await adminPage.locator("#mfaSetup button").click();
    await adminPage.waitForFunction(() =>
      /^[A-Z2-7]{32}$/.test(document.getElementById("mfaSecret").textContent),
    );
    const secret = await adminPage.locator("#mfaSecret").textContent();
    await adminPage
      .locator("#otpCode")
      .fill(
        require("../src/services/totp").code(
          secret,
          Math.floor(Date.now() / 30000),
        ),
      );
    await adminPage.locator("#mfaVerify button").click();
    await adminPage.locator("#adminDashboard").waitFor({ state: "visible" });
    await wait(
      async () =>
        (await adminPage.locator("#adminStats .stat-card").count()) === 8,
      "Admin stats failed",
    );
    await adminPage.close();
    console.log(
      "PASS: signed direct/reaction/edit/reply/pin/recall; saved encrypted notes; per-user pin/archive/mute/unread persistence; TOTP-gated admin browser UI",
    );
    const classes = path.join(work, "classes");
    fs.mkdirSync(classes);
    await run(process.env.JAVAC_BIN || "javac", [
      "-encoding",
      "UTF-8",
      "-d",
      classes,
      ...["ApiClient.java", "Sender.java", "Receiver.java"].map(
        (file) => root + "/encryption/" + file,
      ),
    ]);
    const keys = path.join(work, "keys", ids.a);
    fs.mkdirSync(keys, { recursive: true });
    fs.writeFileSync(
      path.join(keys, "public.spki"),
      Buffer.from(
        await crypto.webcrypto.subtle.exportKey("spki", pairs.a.publicKey),
      ),
    );
    fs.writeFileSync(
      path.join(keys, "private.pkcs8"),
      Buffer.from(
        await crypto.webcrypto.subtle.exportKey("pkcs8", pairs.a.privateKey),
      ),
    );
    const java = process.env.JAVA_BIN || "java",
      env = {
        ...process.env,
        SERUCHAT_EMAIL: "a@e2e.test",
        SERUCHAT_PASSWORD: password,
      };
    await run(
      java,
      ["-cp", classes, "Sender", ids.b, "Java gửi web tiếng Việt", url],
      { cwd: work, env },
    );
    await wait(
      async () =>
        (await b.locator("#messagesList").textContent()).includes(
          "Java gửi web tiếng Việt",
        ),
      "Java to web failed",
    );
    receiver = spawn(java, ["-cp", classes, "Receiver", url], {
      cwd: work,
      env,
    });
    let output = "";
    receiver.stdout.on("data", (d) => (output += d));
    receiver.stderr.on("data", (d) => (output += d));
    await wait(
      async () => output.includes("Waiting for encrypted messages"),
      "Java Receiver did not start",
    );
    // Explicit legacy adapter only in this compatibility fixture; normal composer sends signed v2.
    await b.evaluate(
      async ({ conversation, peer }) =>
        sendEncryptedMessage(conversation, peer, "Web gửi Java tiếng Việt"),
      { conversation, peer: ids.a },
    );
    await wait(
      async () => output.includes("DECRYPTED: Web gửi Java tiếng Việt"),
      "Web to Java failed",
    );
    // Real account UI on top of the legacy identity and chat.
    await a.locator("#mainMenuButton").click();
    await a
      .locator("#mainMenu")
      .getByRole("menuitem", { name: "Cài đặt", exact: true })
      .click();
    await wait(
      async () => (await a.locator("#profileHandle").inputValue()) !== "",
      "Profile did not load",
    );
    await a.locator("#profileName").fill("Diễn thử nghiệm");
    await a.locator("#profileBirth").fill("2000-02-29");
    await a.locator("#profileBio").fill("<img src=x onerror=alert(1)>");
    await a.locator("#profileForm button[type=submit]").click();
    await wait(
      async () =>
        (await a.locator("#profileStatus").textContent()).includes("Đã lưu"),
      "Profile UI failed",
    );
    const png = await require("../node_modules/sharp")({
      create: { width: 400, height: 300, channels: 3, background: "#e8e352" },
    })
      .png()
      .toBuffer();
    await a.locator("#avatarFile").setInputFiles({
      name: "avatar.png",
      mimeType: "image/png",
      buffer: png,
    });
    await a.locator("#avatarForm button[type=submit]").click();
    await wait(
      async () =>
        (await a.locator("#profileStatus").textContent()).includes(
          "Đã cập nhật",
        ),
      "Avatar UI failed",
    );
    await a.locator("#oldPassword").fill(password);
    await a.locator("#newPassword").fill(password + "new");
    await a.locator("#newPasswordConfirm").fill(password + "new");
    await a.locator("#passwordForm button[type=submit]").click();
    await confirm(a);
    await a.locator("#loginSection").waitFor({ state: "visible" });
    const newDevice = await page();
    await login(newDevice, "a", password + "new");
    await open(newDevice);
    await newDevice.locator("#messageSearch").fill("Lịch sử gốc");
    assert.equal(
      await newDevice.locator(".chat-message:not([hidden])").count(),
      1,
    );
    await newDevice.locator("#messageSearch").fill("");
    await newDevice.locator("#emojiToggle").click();
    await newDevice.locator("#emojiPicker button").first().click();
    assert.ok(
      (await newDevice.locator("#messageInput").inputValue()).includes("😀"),
    );
    await newDevice.locator("#mainMenuButton").click();
    await newDevice
      .locator("#mainMenu")
      .getByRole("menuitem", { name: "Khác", exact: true })
      .click();
    await newDevice
      .locator("#moreMenu")
      .getByRole("menuitem", { name: "Giao diện sáng / tối", exact: true })
      .click();
    assert.ok(
      ["dark", "light"].includes(
        await newDevice.locator("html").getAttribute("data-theme"),
      ),
    );
    await newDevice.screenshot({
      path:
        process.env.E2E_DESKTOP_SCREENSHOT || path.join(work, "desktop.png"),
      fullPage: true,
    });
    await newDevice.setViewportSize({ width: 390, height: 844 });
    assert.ok(await newDevice.locator("#chatSection").isVisible());
    if (process.env.E2E_MOBILE_CHAT_SCREENSHOT)
      await newDevice.screenshot({
        path: process.env.E2E_MOBILE_CHAT_SCREENSHOT,
        fullPage: true,
      });
    assert.ok(
      await newDevice.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await newDevice.locator("#backToList").click();
    assert.ok(await newDevice.locator(".sidebar").isVisible());
    await newDevice.screenshot({
      path: process.env.E2E_MOBILE_SCREENSHOT || path.join(work, "mobile.png"),
      fullPage: true,
    });
    const fresh = await page();
    await fresh.goto(url);
    await fresh.locator("#showRegister").click();
    await fresh.locator("#registerUsername").fill("Bạn mới");
    await fresh.locator("#registerHandle").fill("banmoi");
    await fresh.locator("#registerEmail").fill("new@e2e.test");
    await fresh.locator("#registerBirth").fill("2000-01-01");
    await fresh.locator("#registerPassword").fill(password);
    await fresh.locator("#confirmPassword").fill(password);
    await fresh.locator("#registerTerms").check();
    await fresh.locator("#registerForm button[type=submit]").click();
    await fresh.locator("#loginSection").waitFor({ state: "visible" });
    await login(fresh, "new");
    await fresh.locator("#mainMenuButton").click();
    await fresh
      .locator("#mainMenu")
      .getByRole("menuitem", { name: "Khác", exact: true })
      .click();
    await fresh
      .locator("#moreMenu")
      .getByRole("menuitem", { name: "Tìm bạn", exact: true })
      .click();
    await fresh.locator("#handleQuery").fill("banmoi");
    await fresh.locator("#handleSearchForm button").click();
    await wait(
      async () =>
        (await fresh.locator("#handleResults").textContent()).includes(
          "Bạn mới",
        ),
      "Handle search failed",
    );
    // Delay a real note decryption, then logout: stale async work must not restore cleared UI.
    await b.evaluate(() => {
      const decrypt = crypto.subtle.decrypt.bind(crypto.subtle);
      window.noteHold = new Promise(
        (resolve) => (window.noteRelease = resolve),
      );
      window.noteDecryptHeld = false;
      crypto.subtle.decrypt = async function (algorithm, key, data) {
        const plain = await decrypt(algorithm, key, data);
        if (
          algorithm.additionalData &&
          new TextDecoder()
            .decode(algorithm.additionalData)
            .startsWith(currentUserId.textContent + ":")
        ) {
          window.noteDecryptHeld = true;
          await window.noteHold;
        }
        return plain;
      };
    });
    await b.locator("#mainMenuButton").click();
    await b
      .locator("#mainMenu")
      .getByRole("menuitem", { name: "Tin nhắn đã lưu", exact: true })
      .click();
    await b.waitForFunction(() => window.noteDecryptHeld);
    await b.evaluate(() => el("logout").click());
    await b.locator("#loginSection").waitFor({ state: "visible" });
    await b.evaluate(() => noteRelease());
    await delay(250);
    assert.equal(await b.locator("#savedList").textContent(), "");
    assert.equal(await b.locator(".tg-notes").isVisible(), false);
    assert.equal(await b.evaluate(() => ThreadActions.drafts.size), 0);
    console.log(
      "PASS: logout prevents pending decrypted notes repopulating UI and clears drafts",
    );
    assert.deepEqual(errors, []);
    if (process.env.E2E_SCREENSHOT)
      await newDevice.screenshot({
        path: process.env.E2E_SCREENSHOT,
        fullPage: true,
      });
    console.log(
      "PASS: legacy rows unchanged; browser recipient/self; Unsent draft is preserved; cached signed tampering rejected; fresh profile restore; Java compilation; Java v1 adapter ↔ web; profile + avatar UI; password change + independent PIN fresh-device history restore; registration + handle search UI; dark mode; 390px mobile; emoji + client search; no page errors.",
    );
  } finally {
    if (receiver && receiver.exitCode === null) {
      receiver.kill("SIGTERM");
      await new Promise((resolve) => receiver.once("exit", resolve));
    }
    if (browser) await browser.close();
    if (server) await new Promise((resolve) => server.close(resolve));
    if (app) await app.locals.sessionStore.close();
    if (db) await db.promise().end();
    await admin.query("DROP DATABASE IF EXISTS `" + name + "`");
    await admin.end();
    fs.rmSync(work, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
