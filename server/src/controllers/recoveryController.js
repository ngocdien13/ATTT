"use strict";
const crypto = require("node:crypto"),
  argon2 = require("argon2");
const db = require("../config/database");
const { fail, publicKey, base64, uuid } = require("../utils/api");
const { transaction } = require("../utils/transactions");
const { consumeLimit } = require("../services/accountSecurity");
function master(purpose = "gate") {
  if (!/^[a-f0-9]{64}$/i.test(process.env.RECOVERY_MASTER_KEY || ""))
    fail(503, "Tính năng khôi phục tạm thời chưa sẵn sàng.");
  return Buffer.from(
    crypto.hkdfSync(
      "sha256",
      Buffer.from(process.env.RECOVERY_MASTER_KEY, "hex"),
      Buffer.alloc(32),
      Buffer.from("seruchat/recovery/master/" + purpose + "/v1"),
      32,
    ),
  );
}
function proofHash(user, kind, proof) {
  return crypto
    .createHmac("sha256", master("proof"))
    .update(`seruchat/recovery/${kind}/v1\0${user}\0${proof}`)
    .digest("hex");
}
function gateSeal(user, gate) {
  const iv = crypto.randomBytes(12),
    c = crypto.createCipheriv("aes-256-gcm", master(), iv);
  c.setAAD(Buffer.from("seruchat/recovery/gate/v1\0" + user));
  return Buffer.concat([
    iv,
    c.update(Buffer.from(gate, "base64")),
    c.final(),
    c.getAuthTag(),
  ]).toString("base64");
}
function gateOpen(user, value) {
  const b = Buffer.from(value, "base64"),
    d = crypto.createDecipheriv("aes-256-gcm", master(), b.subarray(0, 12));
  d.setAAD(Buffer.from("seruchat/recovery/gate/v1\0" + user));
  d.setAuthTag(b.subarray(-16));
  return Buffer.concat([d.update(b.subarray(12, -16)), d.final()]).toString(
    "base64",
  );
}
const { waitSeconds } = require("../services/recoveryPolicy");
function remaining(date) {
  return Math.max(
    0,
    Math.ceil((new Date(date || 0).getTime() - Date.now()) / 1000),
  );
}
function wrap(value) {
  if (!value || Object.keys(value).sort().join(",") !== "ciphertext,iv")
    fail(400, "Bản khôi phục không hợp lệ.");
  return {
    iv: base64(value.iv, "IV", { bytes: 12 }),
    ciphertext: base64(value.ciphertext, "Backup", { min: 48, max: 4096 }),
  };
}
const json = (v) => (typeof v === "string" ? JSON.parse(v) : v);
async function status(req, res) {
  const [[r]] = await db
    .promise()
    .query(
      "SELECT version,pin_salt,pin_locked_until,code_locked_until FROM recovery_vaults WHERE user_id=?",
      [req.session.userId],
    );
  const [[k]] = await db
    .promise()
    .query(
      "SELECT public_key,encrypted_private_key IS NOT NULL AS legacy FROM public_keys WHERE user_id=?",
      [req.session.userId],
    );
  res.json({
    configured: !!r,
    hasKey: !!k,
    legacy: !r && !!k?.legacy,
    publicKey: k?.public_key || null,
    ...(r
      ? {
          version: r.version,
          salt: r.pin_salt,
          retryAfter: remaining(r.pin_locked_until),
          codeRetryAfter: remaining(r.code_locked_until),
        }
      : {}),
  });
}
async function prepare(req, res) {
  master();
  await consumeLimit("recovery-prepare:" + req.session.userId, 5, 600, res);
  const [[u]] = await db
    .promise()
    .query("SELECT password_hash FROM users WHERE id=?", [req.session.userId]);
  if (
    typeof req.body.password !== "string" ||
    req.body.password.length > 1024 ||
    !(await argon2.verify(u.password_hash, req.body.password))
  )
    fail(403, "Mật khẩu hiện tại không đúng.");
  const key = publicKey(req.body.publicKey);
  const [[old]] = await db
    .promise()
    .query("SELECT public_key FROM public_keys WHERE user_id=?", [
      req.session.userId,
    ]);
  if (old && old.public_key !== key)
    fail(409, "Cần khôi phục khóa của tài khoản trước.");
  const ep = crypto.generateKeyPairSync("x25519"),
    shared = crypto.diffieHellman({
      privateKey: ep.privateKey,
      publicKey: crypto.createPublicKey({
        key: Buffer.from(key, "base64"),
        format: "der",
        type: "spki",
      }),
    });
  if (shared.every((b) => b === 0)) fail(400, "Khóa không hợp lệ.");
  const [[vault]] = await db
    .promise()
    .query("SELECT version FROM recovery_vaults WHERE user_id=?", [
      req.session.userId,
    ]);
  const p = {
    previousVersion: vault?.version || null,
    id: crypto.randomUUID(),
    salt: crypto.randomBytes(32).toString("base64"),
    gate: crypto.randomBytes(32).toString("base64"),
    publicKey: key,
    challenge: shared.toString("base64"),
    expires: Date.now() + 600000,
  };
  shared.fill(0);
  req.session.recoveryPrepare = require("../services/secrets").seal(
    p,
    "recovery-prepare",
    req.session.userId + ":" + req.sessionID,
  );
  res.json({
    id: p.id,
    salt: p.salt,
    gate: p.gate,
    challengePublic: ep.publicKey
      .export({ format: "der", type: "spki" })
      .toString("base64"),
  });
}
async function configure(req, res) {
  master();
  let p;
  try {
    p = require("../services/secrets").open(
      req.session.recoveryPrepare,
      "recovery-prepare",
      req.session.userId + ":" + req.sessionID,
    );
  } catch {
    delete req.session.recoveryPrepare;
    fail(409, "Yêu cầu đã hết hạn. Vui lòng thiết lập lại.");
  }
  if (!p || p.expires < Date.now() || req.body.id !== p.id)
    fail(409, "Yêu cầu đã hết hạn. Vui lòng thử lại.");
  const data = {
    id: p.id,
    publicKey: p.publicKey,
    pinProof: base64(req.body.pinProof, "PIN proof", { bytes: 32 }),
    codeProof: base64(req.body.codeProof, "Recovery proof", { bytes: 32 }),
    pinWrap: wrap(req.body.pinWrap),
    codeWrap: wrap(req.body.codeWrap),
  };
  const actual = Buffer.from(
    base64(req.body.ownership, "Ownership proof", { bytes: 32 }),
    "base64",
  );
  const expected = crypto
    .createHmac("sha256", Buffer.from(p.challenge, "base64"))
    .update(JSON.stringify(data))
    .digest();
  if (!crypto.timingSafeEqual(actual, expected))
    fail(403, "Thiết bị chưa mở được lịch sử của tài khoản.");
  const verifier = await argon2.hash(
    proofHash(req.session.userId, "pin", data.pinProof),
    { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 },
  );
  await transaction(async (c) => {
    await c.query("SELECT id FROM users WHERE id=? FOR UPDATE", [
      req.session.userId,
    ]);
    const [[currentVault]] = await c.query(
      "SELECT version FROM recovery_vaults WHERE user_id=?",
      [req.session.userId],
    );
    if ((currentVault?.version || null) !== p.previousVersion)
      fail(409, "PIN đã được cập nhật trên thiết bị khác. Vui lòng thử lại.");
    const [[key]] = await c.query(
      "SELECT public_key FROM public_keys WHERE user_id=?",
      [req.session.userId],
    );
    if (key && key.public_key !== p.publicKey)
      fail(409, "Khóa tài khoản đã thay đổi.");
    if (!key)
      await c.query(
        "INSERT INTO public_keys(user_id,public_key,algorithm) VALUES (?,?,'X25519')",
        [req.session.userId, p.publicKey],
      );
    await c.query(
      `INSERT INTO recovery_vaults(user_id,version,pin_salt,pin_verifier,code_verifier,gate_ciphertext,pin_wrap,code_wrap)
      VALUES (?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE version=VALUES(version),pin_salt=VALUES(pin_salt),pin_verifier=VALUES(pin_verifier),
      code_verifier=VALUES(code_verifier),gate_ciphertext=VALUES(gate_ciphertext),pin_wrap=VALUES(pin_wrap),code_wrap=VALUES(code_wrap),
      pin_failures=0,pin_locked_until=NULL,code_failures=0,code_locked_until=NULL`,
      [
        req.session.userId,
        p.id,
        p.salt,
        verifier,
        proofHash(req.session.userId, "code", data.codeProof),
        gateSeal(req.session.userId, p.gate),
        JSON.stringify(data.pinWrap),
        JSON.stringify(data.codeWrap),
      ],
    );
    // Remove the password-only recovery route atomically, without rotating the X25519 identity.
    await c.query(
      "UPDATE public_keys SET encrypted_private_key=NULL,encryption_salt=NULL,encryption_iv=NULL WHERE user_id=?",
      [req.session.userId],
    );
  });
  delete req.session.recoveryPrepare;
  res.json({ message: "Đã bảo vệ lịch sử bằng PIN." });
}
async function unlock(req, res) {
  master();
  const method = req.body.method;
  if (!["pin", "code"].includes(method))
    fail(400, "Chọn PIN hoặc mã khôi phục.");
  const proof = base64(req.body.proof, "Recovery proof", { bytes: 32 }),
    version = uuid(req.body.version);
  await consumeLimit("recovery-ip:" + req.ip, 60, 600, res);
  let result;
  await transaction(async (c) => {
    const [[r]] = await c.query(
      "SELECT * FROM recovery_vaults WHERE user_id=? FOR UPDATE",
      [req.session.userId],
    );
    if (!r || r.version !== version)
      fail(409, "Thiết lập khôi phục đã thay đổi. Tải lại và thử lại.");
    const countField = method + "_failures",
      lockField = method + "_locked_until",
      wait = remaining(r[lockField]);
    if (wait) {
      result = { status: 429, retryAfter: wait };
      return;
    }
    const valid =
      method === "pin"
        ? await argon2.verify(
            r.pin_verifier,
            proofHash(req.session.userId, "pin", proof),
          )
        : crypto.timingSafeEqual(
            Buffer.from(r.code_verifier, "hex"),
            Buffer.from(proofHash(req.session.userId, "code", proof), "hex"),
          );
    if (!valid) {
      const count = Math.min(r[countField] + 1, 1000000),
        seconds = waitSeconds(count);
      await c.query(
        `UPDATE recovery_vaults SET ${countField}=?,${lockField}=? WHERE user_id=?`,
        [
          count,
          seconds ? new Date(Date.now() + seconds * 1000) : null,
          req.session.userId,
        ],
      );
      result = { status: seconds ? 429 : 403, retryAfter: seconds };
      return;
    }
    const gate = gateOpen(req.session.userId, r.gate_ciphertext);
    await c.query(
      `UPDATE recovery_vaults SET ${countField}=0,${lockField}=NULL WHERE user_id=?`,
      [req.session.userId],
    );
    result = {
      version: r.version,
      wrap: json(method === "pin" ? r.pin_wrap : r.code_wrap),
      gate: method === "pin" ? gate : null,
    };
  });
  if (result.status) {
    if (result.retryAfter) res.set("Retry-After", String(result.retryAfter));
    return res.status(result.status).json({
      message: result.retryAfter
        ? "Bạn đã nhập sai nhiều lần. Vui lòng chờ trước khi thử lại."
        : "Mã chưa đúng. Vui lòng thử lại.",
      retryAfter: result.retryAfter,
    });
  }
  res.json(result);
}
module.exports = { status, prepare, configure, unlock, waitSeconds };
