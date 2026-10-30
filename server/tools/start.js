"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
async function bootstrap({
  envFile = path.resolve(__dirname, "../.env"),
} = {}) {
  const dotenv = require("dotenv");
  dotenv.config({ path: envFile, quiet: true });
  require("../src/config/loadSecrets")();
  if (!fs.existsSync(envFile) && !process.env.SESSION_SECRET) {
    if (!process.stdin.isTTY)
      throw Error(
        "Chưa có server/.env. Chạy node start.js trong terminal để thiết lập lần đầu.",
      );
    let muted = false;
    const output = new (require("node:stream").Writable)({
      write(chunk, encoding, done) {
        if (!muted) process.stdout.write(chunk);
        done();
      },
    });
    output.isTTY = process.stdout.isTTY;
    output.columns = process.stdout.columns;
    const rl = require("node:readline/promises").createInterface({
      input: process.stdin,
      output,
      terminal: true,
    });
    console.log("Thiết lập Seruchat lần đầu. Dữ liệu đang có được giữ nguyên.");
    try {
      const host =
        (await rl.question("Địa chỉ MySQL [localhost]: ")).trim() ||
        "localhost";
      const port = (await rl.question("Cổng MySQL [3306]: ")).trim() || "3306";
      const user =
        (await rl.question("Tài khoản MySQL [root]: ")).trim() || "root";
      const question = rl.question("Mật khẩu MySQL: ");
      muted = true;
      const password = await question;
      muted = false;
      process.stdout.write("\n");
      const values = {
        DB_HOST: host,
        DB_PORT: port,
        DB_USER: user,
        DB_PASSWORD: password,
        DB_NAME: "seruchat",
        PORT: "3000",
        NODE_ENV: "development",
        PUBLIC_ORIGIN: "http://localhost:3000",
        REQUIRE_EMAIL_VERIFICATION: "false",
      };
      fs.writeFileSync(
        envFile,
        Object.entries(values)
          .map(([k, v]) => k + "=" + JSON.stringify(v))
          .join("\n") + "\n",
        { mode: 0o600, flag: "wx" },
      );
      Object.assign(process.env, values);
    } finally {
      rl.close();
    }
  }
  const mysql = require("mysql2/promise"),
    name = process.env.DB_NAME || "seruchat";
  if (!/^[a-zA-Z0-9_]{1,64}$/.test(name))
    throw Error("Tên database không hợp lệ.");
  const c = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
  });
  try {
    const [[exists]] = await c.query(
      "SELECT COUNT(*) AS n FROM information_schema.schemata WHERE schema_name=?",
      [name],
    );
    if (!exists.n)
      await c.query(
        "CREATE DATABASE IF NOT EXISTS `" +
          name +
          "` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
      );
    await c.query("USE `" + name + "`");
    await c.query("SET SESSION time_zone='+00:00'");
    const lock =
      "seruchat-bootstrap-" +
      crypto.createHash("sha256").update(name).digest("hex").slice(0, 32);
    const [[r]] = await c.query("SELECT GET_LOCK(?,10) AS ok", [lock]);
    if (Number(r.ok) !== 1)
      throw Error("Một tiến trình khác đang thiết lập database.");
    try {
      let content = fs.existsSync(envFile)
        ? fs.readFileSync(envFile, "utf8")
        : "";
      const disk = dotenv.parse(content),
        updates = {};
      for (const key of ["SESSION_SECRET", "RECOVERY_MASTER_KEY"]) {
        // A concurrent startup may already have generated and persisted these keys.
        if (
          (!process.env[key] || process.env[key].startsWith("REPLACE_")) &&
          disk[key] &&
          !disk[key].startsWith("REPLACE_")
        )
          process.env[key] = disk[key];
        if (!process.env[key] || process.env[key].startsWith("REPLACE_")) {
          if (process.env.NODE_ENV === "production")
            throw Error(
              "Production cần cấu hình " + key + " riêng trước khi chạy.",
            );
          if (key === "RECOVERY_MASTER_KEY") {
            for (const protectedTable of [
              "recovery_vaults",
              "admin_mfa",
              "security_audit",
            ]) {
              const [[table]] = await c.query(
                "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema=? AND table_name=?",
                [name, protectedTable],
              );
              if (table.n) {
                const [[records]] = await c.query(
                  "SELECT COUNT(*) AS n FROM `" + protectedTable + "`",
                );
                if (records.n)
                  throw Error(
                    "Thiếu RECOVERY_MASTER_KEY của dữ liệu cũ. Khôi phục server/.env đã sao lưu; chương trình sẽ không thay khóa.",
                  );
              }
            }
          }
          updates[key] = crypto.randomBytes(32).toString("hex");
        }
      }
      if (Object.keys(updates).length) {
        for (const [k, v] of Object.entries(updates)) {
          const regex = new RegExp("^" + k + "=.*$", "m");
          content = regex.test(content)
            ? content.replace(regex, k + "=" + v)
            : content + "\n" + k + "=" + v + "\n";
        }
        const temp = envFile + "." + crypto.randomUUID() + ".tmp";
        try {
          fs.writeFileSync(temp, content, { mode: 0o600, flag: "wx" });
          fs.renameSync(temp, envFile);
        } finally {
          if (fs.existsSync(temp)) fs.unlinkSync(temp);
        }
        Object.assign(process.env, updates);
      }
      if (!/^[a-f0-9]{64}$/i.test(process.env.RECOVERY_MASTER_KEY || ""))
        throw Error(
          "RECOVERY_MASTER_KEY phải là 32 byte ngẫu nhiên dạng 64 ký tự hex.",
        );
      const [[tables]] = await c.query(
        "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema=?",
        [name],
      );
      if (!tables.n) {
        const sql = fs
          .readFileSync(
            path.resolve(__dirname, "../../database/schema.sql"),
            "utf8",
          )
          .replace(/^--.*$/gm, "")
          .split(";")
          .map((s) => s.trim())
          .filter((s) => s && !/^(CREATE DATABASE|USE )/i.test(s));
        for (const statement of sql) await c.query(statement);
      }
      await require("../src/migrations/runner").up(c);
      await require("../src/migrations/runner").assertCurrent(c);
    } finally {
      await c.query("SELECT RELEASE_LOCK(?)", [lock]);
    }
  } finally {
    await c.end();
  }
}
if (require.main === module)
  bootstrap()
    .then(() => require("../src/server").start())
    .catch((e) => {
      console.error("Không thể khởi động:", e.code || e.message);
      process.exitCode = 1;
    });
module.exports = { bootstrap };
