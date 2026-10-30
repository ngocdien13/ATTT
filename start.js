"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto"),
  cp = require("node:child_process");
const dir = path.join(__dirname, "server"),
  marker = path.join(dir, "node_modules/.seruchat-dependencies");
const hash = crypto
  .createHash("sha256")
  .update(fs.readFileSync(path.join(dir, "package-lock.json")))
  .digest("hex");
try {
  if (!fs.existsSync(marker) || fs.readFileSync(marker, "utf8") !== hash) {
    console.log("Đang chuẩn bị thư viện cho Seruchat…");
    cp.execFileSync(
      process.platform === "win32" ? "cmd.exe" : "npm",
      process.platform === "win32" ? ["/d", "/s", "/c", "npm.cmd ci"] : ["ci"],
      { cwd: dir, stdio: "inherit" },
    );
    fs.writeFileSync(marker, hash);
  }
  const child = cp.spawn(process.execPath, [path.join(dir, "tools/start.js")], {
    cwd: dir,
    stdio: "inherit",
  });
  child.on("exit", (code) => {
    process.exitCode = code || 0;
  });
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () => child.kill(signal));
} catch (e) {
  console.error("Khởi động chưa thành công:", e.code || e.message);
  process.exitCode = 1;
}
