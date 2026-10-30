"use strict";
const crypto = require("node:crypto");
function root() {
  if (!/^[a-f0-9]{64}$/i.test(process.env.RECOVERY_MASTER_KEY || ""))
    throw Error("Recovery master key unavailable");
  return Buffer.from(process.env.RECOVERY_MASTER_KEY, "hex");
}
function key(domain) {
  return Buffer.from(
    crypto.hkdfSync(
      "sha256",
      root(),
      Buffer.alloc(32),
      Buffer.from("seruchat/server/" + domain + "/v1"),
      32,
    ),
  );
}
function seal(value, domain, binding) {
  const iv = crypto.randomBytes(12),
    c = crypto.createCipheriv("aes-256-gcm", key(domain), iv);
  c.setAAD(Buffer.from(binding));
  return Buffer.concat([
    iv,
    c.update(JSON.stringify(value)),
    c.final(),
    c.getAuthTag(),
  ]).toString("base64");
}
function open(value, domain, binding) {
  if (typeof value !== "string" || value.length > 8192)
    throw Error("Invalid sealed state");
  const b = Buffer.from(value, "base64"),
    c = crypto.createDecipheriv("aes-256-gcm", key(domain), b.subarray(0, 12));
  c.setAAD(Buffer.from(binding));
  c.setAuthTag(b.subarray(-16));
  return JSON.parse(Buffer.concat([c.update(b.subarray(12, -16)), c.final()]));
}
module.exports = { key, seal, open };
