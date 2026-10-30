// Application protocol v2. RFC9180 is implemented by @hpke/core, not reimplemented here.
import {
  CipherSuite,
  DhkemX25519HkdfSha256,
  HkdfSha256,
  Aes256Gcm,
} from "@hpke/core";
import { canonicalize } from "json-canonicalize";
export const SUITE = "SC2-X25519-HKDFSHA256-AES256GCM-ED25519";
export const MAX_MEMBERS = 50;
const te = new TextEncoder(),
  td = new TextDecoder("utf-8", { fatal: true });
const hpke = new CipherSuite({
  kem: new DhkemX25519HkdfSha256(),
  kdf: new HkdfSha256(),
  aead: new Aes256Gcm(),
});
export const canonical = canonicalize;
export const encode = (v) => te.encode(canonical(v));
export const b64 = (v) => {
  let s = "";
  for (const c of new Uint8Array(v)) s += String.fromCharCode(c);
  return btoa(s);
};
export function un64(s, length, max = 65536) {
  if (
    typeof s !== "string" ||
    s.length > Math.ceil(max / 3) * 4 ||
    !s.length ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(s)
  )
    throw Error("Base64 không hợp lệ.");
  const out = Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  if ((length && out.length !== length) || out.length > max || b64(out) !== s)
    throw Error("Độ dài Base64 không hợp lệ.");
  return out;
}
export function uuid(v) {
  if (
    typeof v !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v)
  )
    throw Error("UUID không hợp lệ.");
  return v;
}
export function exact(value, keys) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(",") !== [...keys].sort().join(",")
  )
    throw Error("Envelope không đúng cấu trúc.");
}
export async function digest(bytes) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((c) => c.toString(16).padStart(2, "0"))
    .join("");
}
export const eventHash = (event) => digest(encode(event));
export const public64 = async (key) =>
  b64(await crypto.subtle.exportKey("spki", key));
export const importPublic = (value, algorithm) =>
  crypto.subtle.importKey(
    "spki",
    un64(value, null, 128),
    algorithm,
    true,
    algorithm === "Ed25519" ? ["verify"] : [],
  );
export async function sign(domain, document, key) {
  return b64(
    await crypto.subtle.sign(
      "Ed25519",
      key,
      te.encode(domain + "\0" + canonical(document)),
    ),
  );
}
export async function verify(domain, document, signature, key) {
  try {
    return await crypto.subtle.verify(
      "Ed25519",
      await importPublic(key, "Ed25519"),
      un64(signature, 64),
      te.encode(domain + "\0" + canonical(document)),
    );
  } catch {
    return false;
  }
}
function requireTrue(value, message) {
  if (!value) throw Error(message);
}
function memberSchema(m) {
  exact(m, ["id", "role", "encryptionKey", "signingKey"]);
  uuid(m.id);
  requireTrue(
    ["owner", "admin", "member"].includes(m.role),
    "Vai trò không hợp lệ.",
  );
  un64(m.encryptionKey, null, 128);
  un64(m.signingKey, null, 128);
}
export function memberIdentity(id, encryptionKey, signingKey, role = "member") {
  return { id, role, encryptionKey, signingKey };
}
export function rosterDocument({
  id,
  version = 1,
  prevHash = null,
  actorId,
  action = "create",
  name,
  description = "",
  avatarId = null,
  avatarHash = null,
  members,
  invitation = null,
}) {
  return {
    v: 2,
    id,
    version,
    prevHash,
    actorId,
    action,
    name,
    description,
    avatarId,
    avatarHash,
    members: [...members].sort((a, b) => a.id.localeCompare(b.id)),
    invitation,
  };
}
export async function signedEvent(document, key) {
  return {
    document,
    signature: await sign("seruchat/roster/v2", document, key),
  };
}
export async function validateInvitation(invitation, history) {
  exact(invitation, ["document", "signature"]);
  const d = invitation.document;
  exact(d, [
    "v",
    "id",
    "groupId",
    "inviterId",
    "inviteeId",
    "issuedHash",
    "expiresAt",
  ]);
  [d.id, d.groupId, d.inviterId, d.inviteeId].forEach(uuid);
  requireTrue(
    d.v === 2 && Number.isSafeInteger(d.expiresAt),
    "Lời mời không hợp lệ.",
  );
  const issued = history.find((e) => e.hash === d.issuedHash);
  const inviter = issued?.event.document.members.find(
    (m) => m.id === d.inviterId,
  );
  requireTrue(
    issued?.event.document.id === d.groupId &&
      inviter &&
      ["owner", "admin"].includes(inviter.role),
    "Người mời không có quyền tại phiên bản đã ký.",
  );
  requireTrue(
    await verify(
      "seruchat/invitation/v2",
      d,
      invitation.signature,
      inviter.signingKey,
    ),
    "Chữ ký lời mời không hợp lệ.",
  );
  return d;
}
export async function validateEvent(
  event,
  history = [],
  usedInvites = new Set(),
) {
  exact(event, ["document", "signature"]);
  const d = event.document;
  exact(d, [
    "v",
    "id",
    "version",
    "prevHash",
    "actorId",
    "action",
    "name",
    "description",
    "avatarId",
    "avatarHash",
    "members",
    "invitation",
  ]);
  uuid(d.id);
  uuid(d.actorId);
  requireTrue(
    d.v === 2 &&
      Number.isSafeInteger(d.version) &&
      d.version > 0 &&
      d.version <= 1000,
    "Phiên bản nhóm không hợp lệ.",
  );
  requireTrue(
    typeof d.name === "string" &&
      d.name.trim().length > 0 &&
      [...d.name].length <= 100 &&
      typeof d.description === "string" &&
      [...d.description].length <= 300,
    "Tên/mô tả nhóm không hợp lệ.",
  );
  requireTrue(
    (d.avatarId === null && d.avatarHash === null) ||
      (uuid(d.avatarId) && /^[a-f0-9]{64}$/.test(d.avatarHash)),
    "Avatar không hợp lệ.",
  );
  requireTrue(
    Array.isArray(d.members) &&
      d.members.length > 0 &&
      d.members.length <= MAX_MEMBERS,
    "Số thành viên không hợp lệ.",
  );
  d.members.forEach(memberSchema);
  const ids = d.members.map((m) => m.id);
  requireTrue(
    new Set(ids).size === ids.length &&
      ids.join(",") === [...ids].sort().join(","),
    "Danh sách thành viên phải duy nhất và sắp xếp.",
  );
  requireTrue(
    d.members.filter((m) => m.role === "owner").length === 1,
    "Nhóm cần đúng một chủ sở hữu.",
  );
  const previous = history.at(-1),
    p = previous?.event.document,
    oldActor = p?.members.find((m) => m.id === d.actorId),
    newActor = d.members.find((m) => m.id === d.actorId);
  if (!p) {
    requireTrue(
      d.version === 1 &&
        d.prevHash === null &&
        d.action === "create" &&
        d.members.length === 1 &&
        newActor?.role === "owner" &&
        d.invitation === null,
      "Genesis nhóm không hợp lệ.",
    );
  } else {
    requireTrue(
      d.id === p.id &&
        d.version === p.version + 1 &&
        d.prevHash === previous.hash,
      "Chuỗi phiên bản nhóm bị thay đổi/rollback.",
    );
    const before = new Map(p.members.map((m) => [m.id, m])),
      after = new Map(d.members.map((m) => [m.id, m]));
    for (const m of d.members) {
      const old = before.get(m.id);
      if (old)
        requireTrue(
          old.encryptionKey === m.encryptionKey &&
            old.signingKey === m.signingKey,
          "Khóa thành viên bị thay đổi.",
        );
    }
    const added = d.members.filter((m) => !before.has(m.id)),
      removed = p.members.filter((m) => !after.has(m.id));
    const changed = d.members.filter(
      (m) => before.has(m.id) && before.get(m.id).role !== m.role,
    );
    const metadata =
      canonical([p.name, p.description, p.avatarId, p.avatarHash]) !==
      canonical([d.name, d.description, d.avatarId, d.avatarHash]);
    if (d.action === "join") {
      requireTrue(
        !oldActor &&
          added.length === 1 &&
          added[0].id === d.actorId &&
          added[0].role === "member" &&
          !removed.length &&
          !changed.length &&
          !metadata,
        "Thay đổi join không hợp lệ.",
      );
      const invitation = await validateInvitation(d.invitation, history),
        inviter = p.members.find((m) => m.id === invitation.inviterId);
      requireTrue(
        invitation.inviteeId === d.actorId &&
          invitation.groupId === d.id &&
          inviter &&
          ["owner", "admin"].includes(inviter.role) &&
          !usedInvites.has(invitation.id),
        "Lời mời không còn hợp lệ.",
      );
      usedInvites.add(invitation.id);
    } else {
      requireTrue(
        oldActor && d.invitation === null,
        "Người thay đổi không thuộc nhóm.",
      );
      if (d.action === "update")
        requireTrue(
          ["owner", "admin"].includes(oldActor.role) &&
            !added.length &&
            !removed.length &&
            !changed.length,
          "Không có quyền sửa nhóm.",
        );
      else if (d.action === "leave")
        requireTrue(
          oldActor.role !== "owner" &&
            removed.length === 1 &&
            removed[0].id === d.actorId &&
            !added.length &&
            !changed.length &&
            !metadata,
          "Không thể rời nhóm theo thay đổi này.",
        );
      else if (d.action === "remove")
        requireTrue(
          ["owner", "admin"].includes(oldActor.role) &&
            removed.length === 1 &&
            removed[0].id !== d.actorId &&
            removed[0].role !== "owner" &&
            (oldActor.role === "owner" || removed[0].role === "member") &&
            !added.length &&
            !changed.length &&
            !metadata,
          "Không có quyền xóa thành viên.",
        );
      else if (d.action === "roles")
        requireTrue(
          oldActor.role === "owner" &&
            !added.length &&
            !removed.length &&
            changed.length === 1 &&
            changed[0].id !== d.actorId &&
            changed[0].role !== "owner" &&
            !metadata,
          "Không có quyền đổi vai trò.",
        );
      else if (d.action === "transfer")
        requireTrue(
          oldActor.role === "owner" &&
            !added.length &&
            !removed.length &&
            changed.length === 2 &&
            newActor?.role === "admin" &&
            changed.some((m) => m.role === "owner" && m.id !== d.actorId) &&
            !metadata,
          "Chuyển chủ sở hữu không hợp lệ.",
        );
      else throw Error("Hành động nhóm không hỗ trợ.");
    }
  }
  const actor = oldActor || newActor;
  requireTrue(
    actor &&
      (await verify(
        "seruchat/roster/v2",
        d,
        event.signature,
        actor.signingKey,
      )),
    "Chữ ký danh sách thành viên không hợp lệ.",
  );
  return { event, hash: await eventHash(event) };
}
export async function verifyChain(events, pinned = null) {
  requireTrue(
    Array.isArray(events) && events.length > 0 && events.length <= 1000,
    "Chuỗi nhóm trống/quá giới hạn.",
  );
  const history = [],
    used = new Set();
  for (const event of events)
    history.push(await validateEvent(event, history, used));
  if (pinned)
    requireTrue(
      history.some(
        (e) =>
          e.event.document.version === pinned.version && e.hash === pinned.hash,
      ),
      "Server trả nhóm cũ hoặc chuỗi bị fork.",
    );
  return history;
}
export async function identityProof(userId, encryptionPair) {
  const pair = await crypto.subtle.generateKey("Ed25519", true, [
    "sign",
    "verify",
  ]);
  const encryptionKey = await public64(encryptionPair.publicKey),
    signingKey = await public64(pair.publicKey),
    iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await identityVaultKey(encryptionPair.privateKey),
    aad = encode({ v: 2, userId, encryptionKey, signingKey });
  const raw = new Uint8Array(
    await crypto.subtle.exportKey("pkcs8", pair.privateKey),
  );
  try {
    const backup = {
      iv: b64(iv),
      ciphertext: b64(
        await crypto.subtle.encrypt(
          { name: "AES-GCM", iv, additionalData: aad },
          key,
          raw,
        ),
      ),
    };
    const document = { v: 2, userId, encryptionKey, signingKey, backup };
    return {
      record: {
        ...document,
        signature: await sign(
          "seruchat/identity/v2",
          document,
          pair.privateKey,
        ),
      },
      pair,
    };
  } finally {
    raw.fill(0);
  }
}
async function identityVaultKey(privateKey) {
  const raw = new Uint8Array(
    await crypto.subtle.exportKey("pkcs8", privateKey),
  );
  try {
    const input = await crypto.subtle.importKey("raw", raw, "HKDF", false, [
      "deriveKey",
    ]);
    return await crypto.subtle.deriveKey(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: new Uint8Array(32),
        info: te.encode("seruchat/v2/signing-vault-key"),
      },
      input,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  } finally {
    raw.fill(0);
  }
}
export async function validateIdentity(record) {
  exact(record, [
    "v",
    "userId",
    "encryptionKey",
    "signingKey",
    "backup",
    "signature",
  ]);
  uuid(record.userId);
  exact(record.backup, ["iv", "ciphertext"]);
  un64(record.backup.iv, 12);
  un64(record.backup.ciphertext, null, 4096);
  const { signature, ...doc } = record;
  requireTrue(
    doc.v === 2 &&
      (await verify("seruchat/identity/v2", doc, signature, doc.signingKey)),
    "Identity proof không hợp lệ.",
  );
  await importPublic(doc.encryptionKey, "X25519");
  return record;
}
export async function restoreIdentity(record, encryptionPair) {
  await validateIdentity(record);
  requireTrue(
    (await public64(encryptionPair.publicKey)) === record.encryptionKey,
    "Identity không khớp khóa chat cũ.",
  );
  const key = await identityVaultKey(encryptionPair.privateKey),
    iv = un64(record.backup.iv, 12),
    aad = encode({
      v: 2,
      userId: record.userId,
      encryptionKey: record.encryptionKey,
      signingKey: record.signingKey,
    });
  const raw = new Uint8Array(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv, additionalData: aad },
      key,
      un64(record.backup.ciphertext),
    ),
  );
  try {
    const privateKey = await crypto.subtle.importKey(
      "pkcs8",
      raw,
      "Ed25519",
      false,
      ["sign"],
    );
    const pair = {
      privateKey,
      publicKey: await importPublic(record.signingKey, "Ed25519"),
    };
    requireTrue(
      await verify(
        "seruchat/key-check/v2",
        { id: record.userId },
        await sign("seruchat/key-check/v2", { id: record.userId }, privateKey),
        record.signingKey,
      ),
      "Khóa ký không khớp.",
    );
    return pair;
  } finally {
    raw.fill(0);
  }
}
export async function directContext(id, members) {
  const sorted = [...members].sort((a, b) => a.id.localeCompare(b.id));
  return {
    scope: "direct",
    id,
    version: 1,
    members: sorted,
    hash: await digest(encode({ v: 2, scope: "direct", id, members: sorted })),
  };
}
export function groupContext(history, version) {
  const item = version
    ? history.find((e) => e.event.document.version === version)
    : history.at(-1);
  requireTrue(item, "Không có phiên bản nhóm này.");
  const d = item.event.document;
  return {
    scope: "group",
    id: d.id,
    version: d.version,
    members: d.members,
    hash: item.hash,
  };
}
export function header(
  context,
  senderId,
  type = "text",
  id = crypto.randomUUID(),
  attachmentId = null,
) {
  return {
    id,
    v: 2,
    suite: SUITE,
    scope: context.scope,
    scopeId: context.id,
    senderId,
    type,
    membershipVersion: context.version,
    rosterHash: context.hash,
    attachmentId,
  };
}
export function validateHeader(h, context) {
  exact(h, [
    "id",
    "v",
    "suite",
    "scope",
    "scopeId",
    "senderId",
    "type",
    "membershipVersion",
    "rosterHash",
    "attachmentId",
  ]);
  [h.id, h.scopeId, h.senderId].forEach(uuid);
  requireTrue(
    h.v === 2 &&
      h.suite === SUITE &&
      ["text", "file"].includes(h.type) &&
      h.scope === context.scope &&
      h.scopeId === context.id &&
      h.membershipVersion === context.version &&
      h.rosterHash === context.hash &&
      context.members.some((m) => m.id === h.senderId),
    "Header/phiên bản thành viên không khớp.",
  );
  if (h.type === "file") uuid(h.attachmentId);
  else requireTrue(h.attachmentId === null, "Text không có attachment.");
}
const aad = (domain, h) => encode({ domain, header: h });
async function wrapCek(cek, h, members) {
  const wraps = [];
  for (const member of members) {
    const keyId = await digest(un64(member.encryptionKey)),
      info = encode({
        domain: "seruchat/cek-wrap/v2",
        header: h,
        recipientId: member.id,
        keyId,
      });
    const context = await hpke.createSenderContext({
      recipientPublicKey: await importPublic(member.encryptionKey, "X25519"),
      info,
    });
    wraps.push({
      recipientId: member.id,
      keyId,
      enc: b64(context.enc),
      ciphertext: b64(await context.seal(cek, info)),
    });
  }
  return wraps.sort((a, b) => a.recipientId.localeCompare(b.recipientId));
}
async function sealPayload(h, context, signingKey, payload, cek, file = null) {
  validateHeader(h, context);
  let iv = crypto.getRandomValues(new Uint8Array(12));
  while (file && b64(iv) === file.iv)
    iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, [
    "encrypt",
  ]);
  const body = {
    header: h,
    iv: b64(iv),
    ciphertext: b64(
      await crypto.subtle.encrypt(
        { name: "AES-GCM", iv, additionalData: aad("seruchat/payload/v2", h) },
        key,
        encode(payload),
      ),
    ),
    wraps: await wrapCek(cek, h, context.members),
    file,
  };
  return {
    ...body,
    signature: await sign("seruchat/message/v2", body, signingKey),
  };
}
export async function sealText(context, senderId, signingKey, text) {
  requireTrue(
    typeof text === "string" &&
      te.encode(text).length <= 8192 &&
      text.trim().length > 0,
    "Tin nhắn tối đa 8192 bytes.",
  );
  const cek = crypto.getRandomValues(new Uint8Array(32));
  try {
    return await sealPayload(
      header(context, senderId),
      context,
      signingKey,
      { text },
      cek,
    );
  } finally {
    cek.fill(0);
  }
}
export async function sealFile(
  context,
  senderId,
  signingKey,
  bytes,
  metadata,
  { messageId = crypto.randomUUID(), attachmentId = crypto.randomUUID() } = {},
) {
  const h = header(context, senderId, "file", messageId, attachmentId),
    cek = crypto.getRandomValues(new Uint8Array(32)),
    iv = crypto.getRandomValues(new Uint8Array(12));
  try {
    const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, [
      "encrypt",
    ]);
    const binary = new Uint8Array(
      await crypto.subtle.encrypt(
        { name: "AES-GCM", iv, additionalData: aad("seruchat/file/v2", h) },
        key,
        bytes,
      ),
    );
    const file = {
      id: attachmentId,
      iv: b64(iv),
      bytes: binary.length,
      hash: await digest(binary),
    };
    const envelope = await sealPayload(
      h,
      context,
      signingKey,
      { name: metadata.name, mime: metadata.mime, size: bytes.byteLength },
      cek,
      file,
    );
    return { envelope, binary };
  } finally {
    cek.fill(0);
  }
}
export async function verifyEnvelope(e, context) {
  exact(e, ["header", "iv", "ciphertext", "wraps", "file", "signature"]);
  validateHeader(e.header, context);
  un64(e.iv, 12);
  const ct = un64(e.ciphertext, null, 65536);
  requireTrue(ct.length >= 16, "Payload thiếu GCM tag.");
  requireTrue(
    Array.isArray(e.wraps) &&
      e.wraps.length === context.members.length &&
      e.wraps.map((w) => w.recipientId).join(",") ===
        context.members
          .map((m) => m.id)
          .sort()
          .join(","),
    "Wrapped keys không khớp đúng tập thành viên.",
  );
  for (const w of e.wraps) {
    exact(w, ["recipientId", "keyId", "enc", "ciphertext"]);
    uuid(w.recipientId);
    const m = context.members.find((m) => m.id === w.recipientId);
    requireTrue(
      w.keyId === (await digest(un64(m.encryptionKey))),
      "Khóa người nhận bị thay đổi.",
    );
    un64(w.enc, 32);
    un64(w.ciphertext, 48);
  }
  if (e.header.type === "file") {
    exact(e.file, ["id", "iv", "bytes", "hash"]);
    requireTrue(
      e.file.id === e.header.attachmentId &&
        Number.isSafeInteger(e.file.bytes) &&
        e.file.bytes >= 16 &&
        e.file.bytes <= 50 * 1024 * 1024 + 16 &&
        /^[a-f0-9]{64}$/.test(e.file.hash),
      "File descriptor sai.",
    );
    un64(e.file.iv, 12);
  } else requireTrue(e.file === null, "Text không chứa file descriptor.");
  const { signature, ...body } = e,
    sender = context.members.find((m) => m.id === e.header.senderId);
  requireTrue(
    await verify("seruchat/message/v2", body, signature, sender.signingKey),
    "Chữ ký tin nhắn không hợp lệ.",
  );
  return e;
}
export async function openEnvelope(e, context, recipientId, privateKey) {
  await verifyEnvelope(e, context);
  const w = e.wraps.find((w) => w.recipientId === recipientId);
  requireTrue(w, "Bạn không có khóa cho tin này.");
  const info = encode({
    domain: "seruchat/cek-wrap/v2",
    header: e.header,
    recipientId,
    keyId: w.keyId,
  });
  const receiver = await hpke.createRecipientContext({
    recipientKey: privateKey,
    enc: un64(w.enc, 32),
    info,
  });
  const raw = new Uint8Array(await receiver.open(un64(w.ciphertext, 48), info));
  try {
    requireTrue(raw.length === 32, "CEK sai độ dài.");
    const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
      "decrypt",
    ]);
    const payload = JSON.parse(
      td.decode(
        await crypto.subtle.decrypt(
          {
            name: "AES-GCM",
            iv: un64(e.iv, 12),
            additionalData: aad("seruchat/payload/v2", e.header),
          },
          key,
          un64(e.ciphertext),
        ),
      ),
    );
    if (e.header.type === "text") {
      exact(payload, ["text"]);
      requireTrue(
        typeof payload.text === "string" &&
          te.encode(payload.text).length <= 8192,
        "Payload text sai.",
      );
    } else {
      exact(payload, ["name", "mime", "size"]);
      requireTrue(
        typeof payload.name === "string" &&
          payload.name.length <= 255 &&
          typeof payload.mime === "string" &&
          payload.mime.length <= 128 &&
          Number.isSafeInteger(payload.size) &&
          payload.size >= 0 &&
          payload.size + 16 === e.file.bytes,
        "Metadata file sai.",
      );
    }
    return { payload, key };
  } finally {
    raw.fill(0);
  }
}
export async function openFile(e, opened, binary) {
  requireTrue(
    e.header.type === "file" &&
      binary.byteLength === e.file.bytes &&
      (await digest(binary)) === e.file.hash,
    "File bị sửa hoặc tải chưa đủ.",
  );
  return crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: un64(e.file.iv, 12),
      additionalData: aad("seruchat/file/v2", e.header),
    },
    opened.key,
    binary,
  );
}
