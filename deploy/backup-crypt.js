"use strict";
// Independent 32-byte random backup key. Never print it or store it beside backups.
const fs = require("node:fs"),
  crypto = require("node:crypto"),
  { pipeline } = require("node:stream/promises");
const magic = Buffer.from("SCBACK01");
async function crypt(
  action,
  input,
  output,
  keyFile = process.env.BACKUP_KEY_FILE,
) {
  if (!["encrypt", "decrypt"].includes(action) || !input || !output || !keyFile)
    throw Error(
      "Usage: BACKUP_KEY_FILE=/private/key node deploy/backup-crypt.js encrypt|decrypt INPUT OUTPUT",
    );
  const hex = fs.readFileSync(keyFile, "utf8").trim();
  if (!/^[a-f0-9]{64}$/i.test(hex))
    throw Error("Backup key must be 32 random bytes as 64 hex characters");
  const key = Buffer.from(hex, "hex"),
    temp = output + "." + crypto.randomUUID() + ".tmp";
  let exists = false;
  if (fs.existsSync(output)) throw Error("Output already exists");
  try {
    if (action === "encrypt") {
      const header = Buffer.concat([magic, crypto.randomBytes(12)]),
        cipher = crypto.createCipheriv("aes-256-gcm", key, header.subarray(8));
      cipher.setAAD(header);
      fs.writeFileSync(temp, header, { mode: 0o600, flag: "wx" });
      exists = true;
      await pipeline(
        fs.createReadStream(input),
        cipher,
        fs.createWriteStream(temp, { flags: "a" }),
      );
      fs.appendFileSync(temp, cipher.getAuthTag());
    } else {
      const size = fs.statSync(input).size;
      if (size < 36) throw Error("Invalid backup");
      const fd = fs.openSync(input, "r"),
        header = Buffer.alloc(20),
        tag = Buffer.alloc(16);
      try {
        fs.readSync(fd, header, 0, 20, 0);
        fs.readSync(fd, tag, 0, 16, size - 16);
      } finally {
        fs.closeSync(fd);
      }
      if (!header.subarray(0, 8).equals(magic))
        throw Error("Unsupported backup");
      const decipher = crypto.createDecipheriv(
        "aes-256-gcm",
        key,
        header.subarray(8),
      );
      decipher.setAAD(header);
      decipher.setAuthTag(tag);
      fs.writeFileSync(temp, "", { mode: 0o600, flag: "wx" });
      exists = true;
      if (size === 36) decipher.final();
      else
        await pipeline(
          fs.createReadStream(input, { start: 20, end: size - 17 }),
          decipher,
          fs.createWriteStream(temp, { flags: "a" }),
        );
    }
    // Link prevents overwriting a concurrent creator. Publish only after authentication succeeds.
    fs.linkSync(temp, output);
  } finally {
    key.fill(0);
    if (exists) fs.rmSync(temp, { force: true });
  }
}
if (require.main === module)
  crypt(...process.argv.slice(2))
    .then(() => console.log("Completed."))
    .catch((e) => {
      console.error(e.message);
      process.exitCode = 1;
    });
module.exports = { crypt };
