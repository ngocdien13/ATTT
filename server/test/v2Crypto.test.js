"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  crypto = require("node:crypto");
const vTask = import("../src/crypto/secure-v2.mjs");
async function person(v) {
  const id = crypto.randomUUID(),
    x = await crypto.webcrypto.subtle.generateKey("X25519", true, [
      "deriveBits",
    ]),
    { record, pair } = await v.identityProof(id, x);
  return {
    id,
    x,
    record,
    pair,
    member: v.memberIdentity(id, record.encryptionKey, record.signingKey),
  };
}
const clone = (o) => JSON.parse(JSON.stringify(o));
async function groupContext(v, people) {
  const owner = people[0],
    id = crypto.randomUUID();
  let first = await v.signedEvent(
    v.rosterDocument({
      id,
      actorId: owner.id,
      name: "Nhóm kiểm thử",
      members: [{ ...owner.member, role: "owner" }],
    }),
    owner.pair.privateKey,
  );
  let history = await v.verifyChain([first]);
  for (const person of people.slice(1)) {
    const last = history.at(-1),
      d = {
        v: 2,
        id: crypto.randomUUID(),
        groupId: id,
        inviterId: owner.id,
        inviteeId: person.id,
        issuedHash: last.hash,
        expiresAt: Date.now() + 60000,
      },
      invitation = {
        document: d,
        signature: await v.sign(
          "seruchat/invitation/v2",
          d,
          owner.pair.privateKey,
        ),
      };
    const event = await v.signedEvent(
      v.rosterDocument({
        ...last.event.document,
        version: history.length + 1,
        prevHash: last.hash,
        actorId: person.id,
        action: "join",
        members: [...last.event.document.members, person.member],
        invitation,
      }),
      person.pair.privateKey,
    );
    history.push(await v.validateEvent(event, history));
  }
  return v.groupContext(history);
}
for (const count of [3, 10, 20])
  test(`Key Wrap ${count} recipients: one ciphertext, every recipient including sender, wrong key rejected`, async () => {
    const v = await vTask,
      people = await Promise.all(
        Array.from({ length: count }, () => person(v)),
      ),
      members = people.map((p) => p.member),
      ctx = await groupContext(v, people);
    const text = "Tiếng Việt 👨‍👩‍👧‍👦 🇻🇳 💛",
      e = await v.sealText(ctx, people[0].id, people[0].pair.privateKey, text);
    assert.equal(e.wraps.length, count);
    assert.equal(typeof e.ciphertext, "string");
    for (const p of people)
      assert.equal(
        (await v.openEnvelope(e, ctx, p.id, p.x.privateKey)).payload.text,
        text,
      );
    await assert.rejects(
      v.openEnvelope(e, ctx, people[0].id, people[1].x.privateKey),
    );
    const other = await v.sealText(
      ctx,
      people[0].id,
      people[0].pair.privateKey,
      text,
    );
    assert.notEqual(e.iv, other.iv);
    assert.notEqual(e.ciphertext, other.ciphertext);
    assert.notEqual(e.wraps[0].enc, other.wraps[0].enc);
  });
test("Signed metadata, wraps, sender, cross-room substitution, unknown versions and identity backups fail closed", async () => {
  const v = await vTask,
    a = await person(v),
    b = await person(v),
    ctx = await v.directContext(crypto.randomUUID(), [a.member, b.member]);
  const e = await v.sealText(ctx, a.id, a.pair.privateKey, "Bí mật");
  for (const edit of [
    (o) => (o.header.senderId = b.id),
    (o) => (o.header.v = 1),
    (o) => (o.header.scopeId = crypto.randomUUID()),
    (o) => (o.iv = v.b64(new Uint8Array(12))),
    (o) => (o.ciphertext = v.b64(new Uint8Array(40))),
    (o) => (o.wraps[0].ciphertext = v.b64(new Uint8Array(48))),
    (o) => o.wraps.pop(),
    (o) => (o.extra = "field"),
  ]) {
    const bad = clone(e);
    edit(bad);
    await assert.rejects(v.openEnvelope(bad, ctx, b.id, b.x.privateKey));
  }
  const pair = await v.restoreIdentity(a.record, a.x);
  assert.equal(await v.public64(pair.publicKey), a.record.signingKey);
  await assert.rejects(v.restoreIdentity(a.record, b.x));
  const broken = clone(a.record);
  broken.backup.iv = v.b64(new Uint8Array(12));
  await assert.rejects(v.restoreIdentity(broken, a.x));
});
test("Roster chain validates invite acceptance, rejects unauthorized adds/escalation/forks and preserves removal boundaries", async () => {
  const v = await vTask,
    a = await person(v),
    b = await person(v),
    c = await person(v),
    id = crypto.randomUUID();
  const first = await v.signedEvent(
    v.rosterDocument({
      id,
      actorId: a.id,
      name: "Nhóm",
      members: [{ ...a.member, role: "owner" }],
    }),
    a.pair.privateKey,
  );
  const history = await v.verifyChain([first]);
  const invitationDoc = {
    v: 2,
    id: crypto.randomUUID(),
    groupId: id,
    inviterId: a.id,
    inviteeId: b.id,
    issuedHash: history[0].hash,
    expiresAt: Date.now() + 60000,
  };
  const invitation = {
    document: invitationDoc,
    signature: await v.sign(
      "seruchat/invitation/v2",
      invitationDoc,
      a.pair.privateKey,
    ),
  };
  const join = v.rosterDocument({
    ...first.document,
    actorId: b.id,
    action: "join",
    version: 2,
    prevHash: history[0].hash,
    members: [...first.document.members, b.member],
    invitation,
  });
  const second = await v.signedEvent(join, b.pair.privateKey);
  const hist = await v.verifyChain([first, second]);
  const old = v.groupContext(history),
    now = v.groupContext(hist);
  const oldMessage = await v.sealText(
    old,
    a.id,
    a.pair.privateKey,
    "Trước khi B tham gia",
  );
  await assert.rejects(v.openEnvelope(oldMessage, old, b.id, b.x.privateKey));
  const escalate = await v.signedEvent(
    v.rosterDocument({
      ...join,
      version: 3,
      prevHash: hist.at(-1).hash,
      action: "roles",
      invitation: null,
      members: [
        ...join.members.map((m) =>
          m.id === b.id ? { ...m, role: "admin" } : m,
        ),
      ],
    }),
    b.pair.privateKey,
  );
  await assert.rejects(v.verifyChain([first, second, escalate]));
  const removed = await v.signedEvent(
    v.rosterDocument({
      ...join,
      version: 3,
      prevHash: hist.at(-1).hash,
      actorId: a.id,
      action: "remove",
      invitation: null,
      members: first.document.members,
    }),
    a.pair.privateKey,
  );
  const after = await v.verifyChain([first, second, removed]);
  const fresh = await v.sealText(
    v.groupContext(after),
    a.id,
    a.pair.privateKey,
    "Sau khi B rời",
  );
  await assert.rejects(
    v.openEnvelope(fresh, v.groupContext(after), b.id, b.x.privateKey),
  );
  await assert.rejects(
    v.verifyChain([first, second], { version: 3, hash: after.at(-1).hash }),
  );
  const fork = clone(second);
  fork.document.name = "Bị đổi";
  await assert.rejects(v.verifyChain([first, fork]));
  const invalid = await v.signedEvent(
    v.rosterDocument({
      ...join,
      version: 3,
      prevHash: hist.at(-1).hash,
      actorId: a.id,
      action: "update",
      invitation: null,
      members: [...join.members, c.member],
    }),
    a.pair.privateKey,
  );
  await assert.rejects(v.verifyChain([first, second, invalid]));
  assert.equal(now.members.length, 2);
});
test("Binary file AEAD, encrypted metadata, ciphertext hash, wrong room and modified wrap", async () => {
  const v = await vTask,
    a = await person(v),
    b = await person(v),
    ctx = await v.directContext(crypto.randomUUID(), [a.member, b.member]);
  const original = crypto.randomBytes(10000),
    { envelope, binary } = await v.sealFile(
      ctx,
      a.id,
      a.pair.privateKey,
      original,
      { name: "bí-mật.txt", mime: "text/plain" },
    );
  assert.ok(!JSON.stringify(envelope).includes("bí-mật.txt"));
  assert.ok(!JSON.stringify(envelope).includes("text/plain"));
  assert.equal(binary.length, original.length + 16);
  const opened = await v.openEnvelope(envelope, ctx, b.id, b.x.privateKey);
  assert.equal(opened.payload.name, "bí-mật.txt");
  assert.deepEqual(
    Buffer.from(await v.openFile(envelope, opened, binary)),
    original,
  );
  const changed = new Uint8Array(binary);
  changed[0] ^= 1;
  await assert.rejects(v.openFile(envelope, opened, changed));
  const forged = clone(envelope);
  forged.file.hash = await v.digest(changed);
  await assert.rejects(v.openEnvelope(forged, ctx, b.id, b.x.privateKey));
});
