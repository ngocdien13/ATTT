/* Recovery v1. Uses Web Crypto in the browser and the same code in Node tests. */
"use strict";
(function (root) {
  const c =
      globalThis.crypto ||
      (typeof require === "function" ? require("node:crypto").webcrypto : null),
    s = c.subtle,
    te = new TextEncoder();
  const bytes = (v) => Uint8Array.from(atob(v), (x) => x.charCodeAt(0));
  const b64 = (v) => btoa(String.fromCharCode(...new Uint8Array(v)));
  async function pinMaterial(pin, salt) {
    if (!/^\d{8}$/.test(pin)) throw Error("PIN cần đúng 8 chữ số.");
    const key = await s.importKey("raw", te.encode(pin), "PBKDF2", false, [
      "deriveBits",
    ]);
    const raw = new Uint8Array(
      await s.deriveBits(
        {
          name: "PBKDF2",
          hash: "SHA-256",
          salt: bytes(salt),
          iterations: 600000,
        },
        key,
        512,
      ),
    );
    const result = { secret: raw.slice(0, 32), proof: b64(raw.slice(32)) };
    raw.fill(0);
    return result;
  }
  function validatePin(pin) {
    if (
      !/^\d{8}$/.test(pin) ||
      /^(\d)\1{7}$/.test(pin) ||
      "01234567890123456789".includes(pin) ||
      "98765432109876543210".includes(pin)
    )
      throw Error("Dùng PIN 8 chữ số, tránh số lặp hoặc dãy liên tiếp.");
  }
  function newCode() {
    return Array.from(c.getRandomValues(new Uint8Array(32)), (b) =>
      b.toString(16).padStart(2, "0"),
    )
      .join("")
      .match(/.{8}/g)
      .join("-");
  }
  async function codeMaterial(code) {
    const normalized = code.replace(/[\s-]/g, "").toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(normalized))
      throw Error("Mã khôi phục chưa đúng định dạng.");
    const secret = Uint8Array.from(normalized.match(/../g), (b) =>
      parseInt(b, 16),
    );
    const proof = b64(
      await s.digest(
        "SHA-256",
        te.encode("seruchat/recovery/code-auth/v1\0" + normalized),
      ),
    );
    return { secret, proof };
  }
  async function wrapKey(secret, gate, kind) {
    const key = await s.importKey("raw", secret, "HKDF", false, ["deriveKey"]);
    return s.deriveKey(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: gate ? bytes(gate) : new Uint8Array(32),
        info: te.encode("seruchat/recovery/" + kind + "/v1"),
      },
      key,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  }
  const aad = (userId, publicKey, version, kind) =>
    te.encode(
      JSON.stringify({
        domain: "seruchat/recovery/v1",
        userId,
        publicKey,
        version,
        kind,
      }),
    );
  async function seal(pair, material, gate, userId, publicKey, version, kind) {
    const iv = c.getRandomValues(new Uint8Array(12)),
      raw = new Uint8Array(await s.exportKey("pkcs8", pair.privateKey));
    try {
      return {
        iv: b64(iv),
        ciphertext: b64(
          await s.encrypt(
            {
              name: "AES-GCM",
              iv,
              additionalData: aad(userId, publicKey, version, kind),
            },
            await wrapKey(material.secret, gate, kind),
            raw,
          ),
        ),
      };
    } finally {
      raw.fill(0);
    }
  }
  async function open(wrap, material, gate, userId, publicKey, version, kind) {
    let raw;
    try {
      raw = new Uint8Array(
        await s.decrypt(
          {
            name: "AES-GCM",
            iv: bytes(wrap.iv),
            additionalData: aad(userId, publicKey, version, kind),
          },
          await wrapKey(material.secret, gate, kind),
          bytes(wrap.ciphertext),
        ),
      );
      return {
        privateKey: await s.importKey("pkcs8", raw, { name: "X25519" }, true, [
          "deriveBits",
        ]),
        publicKey: await s.importKey(
          "spki",
          bytes(publicKey),
          { name: "X25519" },
          true,
          [],
        ),
      };
    } finally {
      raw?.fill(0);
    }
  }
  async function ownership(pair, challengePublic, data) {
    const pub = await s.importKey(
      "spki",
      bytes(challengePublic),
      { name: "X25519" },
      false,
      [],
    );
    const shared = new Uint8Array(
      await s.deriveBits({ name: "X25519", public: pub }, pair.privateKey, 256),
    );
    try {
      const k = await s.importKey(
        "raw",
        shared,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
      return b64(await s.sign("HMAC", k, te.encode(JSON.stringify(data))));
    } finally {
      shared.fill(0);
    }
  }
  const api = {
    pinMaterial,
    validatePin,
    newCode,
    codeMaterial,
    seal,
    open,
    ownership,
  };
  if (typeof module !== "undefined") module.exports = api;
  else root.RecoveryCrypto = api;
})(globalThis);
