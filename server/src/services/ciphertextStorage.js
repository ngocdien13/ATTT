"use strict";
// Storage port: put(key,stream,bytes,hash), read(key), remove(key). A future S3 adapter can implement this contract.
const fs = require("fs"),
  path = require("path"),
  crypto = require("crypto");
const { Transform } = require("stream"),
  { pipeline } = require("stream/promises");
class LocalCiphertextStorage {
  constructor(
    root = process.env.ATTACHMENT_DIR ||
      path.resolve(__dirname, "../../../.data/encrypted-files"),
  ) {
    this.root = path.resolve(root);
  }
  file(key) {
    if (
      !/^[0-9a-f-]{36}$/.test(key) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
        key,
      )
    )
      throw Error("Invalid storage key");
    return path.join(this.root, key + ".bin");
  }
  async put(key, source, bytes, hash) {
    await fs.promises.mkdir(this.root, { recursive: true, mode: 0o700 });
    const target = this.file(key),
      temporary = this.file(crypto.randomUUID()) + ".tmp";
    let seen = 0;
    const digest = crypto.createHash("sha256");
    const check = new Transform({
      transform(chunk, enc, done) {
        seen += chunk.length;
        if (seen > bytes)
          return done(
            Object.assign(Error("Ciphertext too large"), { status: 413 }),
          );
        digest.update(chunk);
        done(null, chunk);
      },
    });
    try {
      await pipeline(
        source,
        check,
        fs.createWriteStream(temporary, { flags: "wx", mode: 0o600 }),
      );
      if (seen !== bytes || digest.digest("hex") !== hash)
        throw Object.assign(Error("Ciphertext length/hash mismatch"), {
          status: 400,
        });
      // Keys are server generated; no overwrite allowed even on retry.
      await fs.promises.link(temporary, target);
      await fs.promises.unlink(temporary);
    } catch (e) {
      await fs.promises.unlink(temporary).catch(() => {});
      throw e;
    }
  }
  read(key) {
    return fs.createReadStream(this.file(key), {
      flags: fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0),
    });
  }
  async remove(key) {
    await fs.promises.unlink(this.file(key)).catch((e) => {
      if (e.code !== "ENOENT") throw e;
    });
  }
}
module.exports = {
  LocalCiphertextStorage,
  storage: () => new LocalCiphertextStorage(),
};
