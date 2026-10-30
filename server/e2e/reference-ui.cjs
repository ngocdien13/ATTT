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
    await delay(100);
  }
  throw Error(label);
}
async function main() {
  const name = "seruchat_ui_" + crypto.randomBytes(6).toString("hex"),
    work = fs.mkdtempSync(path.join(os.tmpdir(), "seruchat-ui-"));
  const sql = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    multipleStatements: true,
  });
  let db, app, server, browser;
  const errors = [],
    names = [
      "Ngọc Diễn",
      "Khánh Linh",
      "Nhóm học mạng",
      "Thanh An",
      "Quỳnh Anh",
      "Minh Khang",
      "Hải Yến",
      "Bạn cùng lớp",
      "Tuấn Anh",
      "Hà My",
      "Mai Anh",
      "Nam Phong",
      "Thùy Linh",
      "Anh Dũng",
    ];
  const password = crypto.randomBytes(20).toString("hex"),
    users = [],
    conversations = [];
  try {
    await sql.query(
      fs
        .readFileSync(root + "/database/schema.sql", "utf8")
        .replace(/\bseruchat\b/g, name),
    );
    const hash = await require("../node_modules/argon2").hash(password),
      ctx = vm.createContext({
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
        ctx,
      );
    for (let i = 0; i < names.length; i++) {
      const id = crypto.randomUUID(),
        pair = await ctx.generateKeyPair(),
        backup = await ctx.encryptPrivateKey(pair.privateKey, password);
      users.push({ id, pair });
      await sql.query(
        "INSERT INTO users(id,username,email,password_hash) VALUES(?,?,?,?)",
        [id, names[i], "ui" + i + "@example.test", hash],
      );
      await sql.query(
        "INSERT INTO public_keys(user_id,public_key,algorithm,encrypted_private_key,encryption_salt,encryption_iv) VALUES(?,?,'X25519',?,?,?)",
        [
          id,
          await ctx.exportPublicKey(pair.publicKey),
          backup.encryptedPrivateKey,
          backup.salt,
          backup.iv,
        ],
      );
      if (i) {
        const cid = crypto.randomUUID();
        conversations.push(cid);
        await sql.query(
          "INSERT INTO friendships(id,user1_id,user2_id,requested_by,status) VALUES(?,?,?,?,'accepted')",
          [crypto.randomUUID(), ...[users[0].id, id].sort(), users[0].id],
        );
        await sql.query("INSERT INTO conversations(id) VALUES(?)", [cid]);
        for (const who of [users[0].id, id])
          await sql.query(
            "INSERT INTO conversation_members(conversation_id,user_id) VALUES(?,?)",
            [cid, who],
          );
        const texts = [
          "Hẹn gặp ở thư viện nhé!",
          "Tối nay mình cùng ôn bài nhé.",
          "Bạn đã nhận được tài liệu chưa?",
          "Cảm ơn bạn nhiều 😊",
          "Được rồi, hẹn bạn ngày mai.",
          "Chúc bạn một buổi tối vui vẻ!",
          "Mình đã gửi tài liệu cho nhóm.",
        ];
        const text = texts[(i - 1) % texts.length];
        const incoming = await ctx.encryptForRecipient(
            text,
            users[0].pair.publicKey,
          ),
          self = await ctx.encryptForSelf(text, pair.publicKey),
          b64 = (x) => Buffer.from(x).toString("base64");
        await sql.query(
          "INSERT INTO messages(id,conversation_id,sender_id,ciphertext,nonce,sender_public_key,self_ciphertext,self_nonce,self_public_key,created_at) VALUES(?,?,?,?,?,?,?,?,?,TIMESTAMPADD(MINUTE,?,NOW(6)))",
          [
            crypto.randomUUID(),
            cid,
            id,
            b64(incoming.ciphertext),
            b64(incoming.iv),
            b64(incoming.senderPublicKey),
            b64(self.ciphertext),
            b64(self.iv),
            b64(self.senderPublicKey),
            -i * 17,
          ],
        );
      }
    }
    Object.assign(process.env, {
      DB_NAME: name,
      SESSION_SECRET: crypto.randomBytes(32).toString("hex"),
      RECOVERY_MASTER_KEY: crypto.randomBytes(32).toString("hex"),
      REQUIRE_EMAIL_VERIFICATION: "false",
      ATTACHMENT_DIR: path.join(work, "ciphertext"),
    });
    db = require("../src/config/database");
    const c = await db.promise().getConnection();
    try {
      await require("../src/migrations/runner").up(c);
    } finally {
      c.release();
    }
    for (let i = 0; i < users.length; i++)
      await sql.query(
        "UPDATE user_profiles SET handle=?,date_of_birth=? WHERE user_id=?",
        ["ui_user_" + i, "2000-01-01", users[i].id],
      );
    await sql.query(
      "INSERT INTO thread_preferences(user_id,scope,thread_id,archived) VALUES(?,'direct',?,TRUE)",
      [users[0].id, conversations.at(-1)],
    );
    app = require("../src/server").createApp();
    await app.locals.sessionStore.onReady();
    server = await new Promise((r) => {
      const s = app.listen(0, "127.0.0.1", () => r(s));
    });
    const url = "http://127.0.0.1:" + server.address().port;
    const args = JSON.parse(process.env.E2E_BROWSER_ARGS || "[]");
    assert.ok(
      !args.some((x) =>
        /disable-web-security|allow-running-insecure-content/.test(x),
      ),
    );
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
    const context = await browser.newContext({
        viewport: { width: 2048, height: 1009 },
      }),
      a = await context.newPage();
    a.on("pageerror", (e) => errors.push(e.message));
    async function login(page, i) {
      await page.goto(url);
      await page.locator("#loginEmail").fill("ui" + i + "@example.test");
      await page.locator("#loginPassword").fill(password);
      await page.locator("#loginForm button[type=submit]").click();
      await require("./recovery-helper.cjs").finishRecovery(page);
    }
    await login(a, 0);
    await a.locator("#threadList [data-room]").first().waitFor();
    await a.evaluate(() => document.fonts.ready);
    assert.equal(
      await a.evaluate(() =>
        [...document.fonts].some(
          (f) => f.family === "Roboto" && f.status === "loaded",
        ),
      ),
      true,
    );
    assert.equal(await a.locator("#threadFilters").isVisible(), false);
    assert.equal(await a.locator("#archiveFolder").isVisible(), true);
    assert.equal(await a.locator("#savedThread").isVisible(), true);
    const metrics = await a.evaluate(() => ({
      width: document.querySelector(".sidebar").getBoundingClientRect().width,
      row: document.querySelector(".tg-room").getBoundingClientRect().height,
      font: getComputedStyle(document.body).fontFamily,
      wall: getComputedStyle(document.querySelector(".workspace"), "::before")
        .backgroundImage,
    }));
    assert.ok(metrics.width >= 510 && metrics.width <= 520);
    assert.equal(metrics.row, 58);
    assert.ok(metrics.font.includes("Roboto"));
    assert.ok(metrics.wall.includes("telegram-pattern.svg"));
    const shots = process.env.E2E_UI_SCREEN_DIR;
    if (shots) fs.mkdirSync(shots, { recursive: true });
    async function shot(label) {
      if (shots) await a.screenshot({ path: path.join(shots, label + ".png") });
    }
    console.log("PASS: authenticated reference layout and local assets");
    await shot("desktop");
    await a.locator("#mainMenuButton").click();
    assert.equal(await a.locator("#mainMenu [role=menuitem]").count(), 7);
    assert.equal(
      await a.locator("#menuAccount .tg-menu-label").innerText(),
      "Ngọc Diễn",
    );
    await shot("main-menu");
    await a
      .locator("#mainMenu")
      .getByRole("menuitem", { name: "Khác", exact: true })
      .click();
    await a.locator("#moreMenu").waitFor({ state: "visible" });
    await shot("more-menu");
    await a.keyboard.press("Escape");
    const first = a.locator('[data-room="direct:' + conversations[0] + '"]');
    await first.click({ button: "right" });
    assert.equal(await a.locator("#contextMenu [role=menuitem]").count(), 7);
    await shot("chat-context");
    await a
      .locator("#contextMenu")
      .getByRole("menuitem", { name: "Xem nhanh", exact: true })
      .click();
    await a.locator(".tg-preview-dialog").waitFor({ state: "visible" });
    assert.ok(
      (await a.locator(".tg-preview-content").innerText()).includes("Hẹn gặp"),
    );
    await shot("quick-preview");
    await a
      .locator(".tg-preview-dialog")
      .getByRole("button", { name: "Đóng", exact: true })
      .click();
    const b = await (await browser.newContext()).newPage();
    b.on("pageerror", (e) => errors.push(e.message));
    await login(b, 1);
    await first.click({ button: "right" });
    const popup = context.waitForEvent("page");
    await a
      .locator("#contextMenu")
      .getByRole("menuitem", { name: "Mở trong tab mới", exact: true })
      .click();
    const tab = await popup;
    tab.on("pageerror", (e) => errors.push(e.message));
    await tab.locator("#chatSection").waitFor({ state: "visible" });
    await wait(
      async () =>
        (await tab.locator("#messagesList").innerText()).includes("Hẹn gặp"),
      "New tab link failed",
    );
    await tab.close();
    await first.click();
    await a.locator("#messageInput").fill("Tin nhắn từ giao diện mới");
    await a.locator("#sendMessageButton").click();
    await wait(
      async () =>
        (await a.locator("#messagesList").innerText()).includes(
          "Tin nhắn từ giao diện mới",
        ),
      "Signed UI send failed",
    );
    await shot("chat-open");
    console.log(
      "PASS: context actions, quick preview, new-tab link and signed sending",
    );
    await a.locator("#mainMenuButton").click();
    await a
      .locator("#mainMenu")
      .getByRole("menuitem", { name: "Hồ sơ của tôi", exact: true })
      .click();
    await a.locator("#profileDialog").waitFor({ state: "visible" });
    assert.equal(await a.locator("#passwordForm").isVisible(), false);
    await shot("my-profile");
    await a.locator("#closeProfile").click();
    await a.locator("#mainMenuButton").click();
    await a
      .locator("#mainMenu")
      .getByRole("menuitem", { name: "Cài đặt", exact: true })
      .click();
    assert.equal(await a.locator("#passwordForm").isVisible(), true);
    await shot("settings");
    await a.locator("#closeProfile").click();
    await first.click({ button: "right" });
    await a
      .locator("#contextMenu")
      .getByRole("menuitem", { name: "Ghim lên đầu", exact: true })
      .click();
    await wait(
      async () => (await first.locator(".tg-pin").count()) === 1,
      "Pin failed",
    );
    await first.click({ button: "right" });
    await a
      .locator("#contextMenu")
      .getByRole("menuitem", { name: "Lưu trữ", exact: true })
      .click();
    await wait(async () => (await first.count()) === 0, "Archive failed");
    await a.locator("#archiveFolder").click();
    await first.waitFor();
    await first.click({ button: "right" });
    await a
      .locator("#contextMenu")
      .getByRole("menuitem", { name: "Đưa ra khỏi lưu trữ", exact: true })
      .click();
    await a.locator("#filterBack").click();
    await first.waitFor();
    await a.evaluate(() => SeruchatWorkspace.refresh(true));
    await delay(300);
    await a.evaluate(() => {
      window.listMutations = 0;
      window.stableRow = document.querySelector("#threadList [data-room]");
      window.listObserver = new MutationObserver(
        (rows) =>
          (window.listMutations += rows.filter(
            (r) => r.type === "childList",
          ).length),
      );
      listObserver.observe(document.getElementById("threadList"), {
        childList: true,
        subtree: true,
      });
    });
    await delay(8500);
    assert.equal(await a.evaluate(() => listMutations), 0);
    assert.equal(await a.evaluate(() => stableRow.isConnected), true);
    await a.evaluate(() => listObserver.disconnect());
    await a.setViewportSize({ width: 390, height: 844 });
    await a.locator("#backToList").click();
    await shot("mobile-list");
    assert.equal(
      await a.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await a.locator("#mainMenuButton").click();
    await shot("mobile-menu");
    await a.keyboard.press("Escape");
    await first.click();
    await wait(
      async () =>
        (await a.locator("#messagesList").innerText()).includes(
          "Tin nhắn từ giao diện mới",
        ),
      "Mobile history did not load",
    );
    await shot("mobile-chat");
    assert.equal(
      await a.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await a.setViewportSize({ width: 2048, height: 1009 });
    const oldTab = await context.newPage();
    oldTab.on("pageerror", (e) => errors.push(e.message));
    await oldTab.goto(url);
    await oldTab.locator("#userInfo").waitFor({ state: "visible" });
    await a.locator("#mainMenuButton").click();
    await a
      .locator("#mainMenu")
      .getByRole("menuitem", { name: "Thêm tài khoản", exact: true })
      .click();
    await a.locator("#switchEmail").fill("ui1@example.test");
    await a.locator("#switchPassword").fill("bad-password");
    await a.locator(".tg-add-account button[type=submit]").click();
    await wait(
      async () =>
        (await a.locator(".tg-add-account form p").textContent()).length > 0,
      "Missing switch error",
    );
    assert.equal(
      await a.evaluate(() => currentUserId.textContent),
      users[0].id,
    );
    await a.locator("#switchPassword").fill(password);
    await a.locator(".tg-add-account button[type=submit]").click();
    await require("./recovery-helper.cjs").finishRecovery(a);
    assert.equal(
      await a.evaluate(() => currentUserId.textContent),
      users[1].id,
    );
    assert.equal(await a.evaluate(() => ThreadActions.drafts.size), 0);
    await oldTab.locator("#loginSection").waitFor({ state: "visible" });
    assert.equal(await oldTab.evaluate(() => keyPair === null && !ready), true);
    await oldTab.close();
    assert.deepEqual(errors, []);
    console.log(
      "PASS: 2048/390px, profile/settings, pin/archive, stable chat-list DOM and authenticated account switching",
    );
  } catch (error) {
    if (browser)
      for (const [i, ctx] of browser.contexts().entries())
        for (const page of ctx.pages()) {
          await page
            .screenshot({
              path: path.join(root, "..", "ui-failure-" + i + ".png"),
            })
            .catch(() => {});
          console.error(
            "UI state",
            i,
            (await page.locator("body").innerText()).slice(-900),
          );
        }
    throw error;
  } finally {
    if (browser) await browser.close();
    if (server) await new Promise((r) => server.close(r));
    if (app) await app.locals.sessionStore.close();
    if (db) await db.promise().end();
    await sql.query("DROP DATABASE IF EXISTS `" + name + "`");
    await sql.end();
    fs.rmSync(work, { recursive: true, force: true });
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
