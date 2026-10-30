"use strict";
// Run on the deployment host. Existing files are never overwritten.
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const dir = path.join(__dirname, "secrets");
fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
fs.chmodSync(dir, 0o700);
for (const name of [
  "db_password",
  "db_root_password",
  "session_secret",
  "recovery_master_key",
]) {
  const file = path.join(dir, name);
  if (fs.existsSync(file)) {
    console.log("Preserved:", name);
    continue;
  }
  // Host directory is private; mounted individual files must be readable by container user 1000.
  fs.writeFileSync(file, crypto.randomBytes(32).toString("hex") + "\n", {
    mode: 0o444,
    flag: "wx",
  });
  console.log("Created:", name);
}
console.log(
  "Keep a separate offline copy of recovery_master_key. Do not commit deploy/secrets.",
);
