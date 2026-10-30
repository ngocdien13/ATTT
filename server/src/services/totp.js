"use strict";
const crypto = require("node:crypto");
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function encode(raw) {
  let bits = 0,
    value = 0,
    out = "";
  for (const b of raw) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits) out += alphabet[(value << (5 - bits)) & 31];
  return out;
}
function decode(str) {
  let bits = 0,
    value = 0,
    out = [];
  for (const ch of str) {
    const v = alphabet.indexOf(ch);
    if (v < 0) throw Error("Invalid secret");
    value = (value << 5) | v;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}
function code(secret, counter, digits = 6) {
  const b = Buffer.alloc(8);
  b.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac("sha1", decode(secret)).update(b).digest(),
    o = h.at(-1) & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 10 ** digits).padStart(
    digits,
    "0",
  );
}
function verify(secret, input, last = -1, now = Date.now()) {
  if (typeof input !== "string" || !/^\d{6}$/.test(input)) return null;
  const current = Math.floor(now / 30000);
  for (const n of [current, current - 1, current + 1])
    if (
      n > Number(last) &&
      crypto.timingSafeEqual(Buffer.from(code(secret, n)), Buffer.from(input))
    )
      return n;
  return null;
}
module.exports = { encode, code, verify };
