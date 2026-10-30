"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  crypto = require("node:crypto");
test(
  "One-command bootstrap: empty database, generated secrets, repeat start and preserved data",
  { skip: process.env.RUN_MYSQL_TESTS !== "1" },
  async () => {
    const mysql = require("mysql2/promise"),
      name = "seruchat_bootstrap_" + crypto.randomBytes(6).toString("hex"),
      work = fs.mkdtempSync(path.join(os.tmpdir(), "sc-bootstrap-"));
    const admin = await mysql.createConnection({
      host: process.env.DB_HOST || "localhost",
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER || "root",
      password: process.env.DB_PASSWORD || "",
    });
    const envFile = path.join(work, ".env");
    fs.writeFileSync(envFile, "DB_NAME=" + name + "\n");
    Object.assign(process.env, {
      DB_NAME: name,
      NODE_ENV: "development",
      SESSION_SECRET: crypto.randomBytes(32).toString("hex"),
    });
    delete process.env.RECOVERY_MASTER_KEY;
    let child;
    try {
      const { bootstrap } = require("../tools/start");
      await bootstrap({ envFile });
      const secret = process.env.RECOVERY_MASTER_KEY;
      assert.match(secret, /^[a-f0-9]{64}$/);
      await admin.query("USE `" + name + "`");
      const id = crypto.randomUUID();
      await admin.query(
        "INSERT INTO users(id,username,email,password_hash) VALUES (?,?,?,?)",
        [id, "Preserved", "keep@example.test", "test"],
      );
      await bootstrap({ envFile });
      assert.equal(process.env.RECOVERY_MASTER_KEY, secret);
      const [[row]] = await admin.query(
        "SELECT username FROM users WHERE id=?",
        [id],
      );
      assert.equal(row.username, "Preserved");
      const [dbs] = await admin.query(
        "SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE ?",
        [name + "%"],
      );
      assert.equal(dbs.length, 1);
      assert.ok(
        (await require("../src/migrations/runner").status(admin)).every(
          (r) => r.state === "applied",
        ),
      );
      const net = require("node:net"),
        probe = net.createServer();
      await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
      const port = probe.address().port;
      await new Promise((resolve) => probe.close(resolve));
      let output = "";
      child = require("node:child_process").spawn(
        process.execPath,
        [path.resolve(__dirname, "../tools/start.js")],
        {
          cwd: path.resolve(__dirname, ".."),
          env: {
            ...process.env,
            PORT: String(port),
            PUBLIC_ORIGIN: "http://127.0.0.1:" + port,
          },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      child.stdout.on("data", (b) => (output += b));
      child.stderr.on("data", (b) => (output += b));
      let started = false;
      for (let i = 0; i < 100; i++) {
        try {
          const response = await fetch(
            "http://127.0.0.1:" + port + "/health/ready",
          );
          if (response.status === 200) {
            started = true;
            break;
          }
        } catch {}
        await new Promise((r) => setTimeout(r, 100));
      }
      assert.ok(started, output);
      assert.equal(
        (await admin.query("SELECT username FROM users WHERE id=?", [id]))[0][0]
          .username,
        "Preserved",
      );
      const exited = new Promise((resolve) => child.once("exit", resolve));
      child.kill("SIGTERM");
      await exited;
      child = null;
    } finally {
      if (child) {
        const exited = new Promise((resolve) => child.once("exit", resolve));
        child.kill("SIGTERM");
        await exited;
      }
      await admin.query("DROP DATABASE IF EXISTS `" + name + "`");
      await admin.end();
      fs.rmSync(work, { recursive: true, force: true });
    }
  },
);
