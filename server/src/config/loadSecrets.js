"use strict";
const fs = require("node:fs");
function load() {
  for (const name of [
    "DB_PASSWORD",
    "SESSION_SECRET",
    "RECOVERY_MASTER_KEY",
    "SMTP_PASSWORD",
    "TURNSTILE_SECRET",
    "TWILIO_AUTH_TOKEN",
  ]) {
    const file = process.env[name + "_FILE"];
    if (file) {
      const value = fs.readFileSync(file, "utf8").trimEnd();
      if (!value || value.length > 8192)
        throw Error("Invalid secret file: " + name);
      process.env[name] = value;
    }
  }
}
load();
module.exports = load;
