const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const {uuid, base64, publicKey, ApiError} = require('../src/utils/api');
const clientPath = path.resolve(__dirname, '../../client/js/encryption');
test('The original browser encryption files have not changed', () => {
    const expected = {
        'keyManager.js': '1e181815105f349ea18ad5117361c43ed75f67dda980ba26fb5878aeb72d2ea3',
        'encryption.js': 'd98efd1d4e8b1dcae5f83a088afc888becb80113a220b6684333059852876c3a',
        'decryption.js': 'f7209d6e56e7a59bdc20c6ce4c1b2973dcb50ce57882dc5e2976013e18cc4f16'
    };
    for (const [file, hash] of Object.entries(expected)) assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(clientPath, file))).digest('hex'), hash, file);
});
test('Reject malformed IDs, Base64, wrong IV length and non-X25519 keys', () => {
    for (const input of [null, {}, 'missing', 'a/b']) assert.throws(() => uuid(input), ApiError);
    assert.throws(() => base64('!!!!', 'IV'), ApiError);
    assert.throws(() => base64(Buffer.alloc(11).toString('base64'), 'IV', {bytes: 12}), ApiError);
    const rsa = crypto.generateKeyPairSync('rsa', {modulusLength: 1024}).publicKey.export({type: 'spki', format: 'der'}).toString('base64');
    assert.throws(() => publicKey(rsa), ApiError);
});
test('Original browser encryption decrypts Vietnamese and rejects tampering', async () => {
    const context = vm.createContext({crypto: crypto.webcrypto, TextEncoder, TextDecoder, Uint8Array, atob, btoa});
    for (const file of ['keyManager.js', 'encryption.js', 'decryption.js']) vm.runInContext(fs.readFileSync(path.join(clientPath, file), 'utf8'), context);
    const alice = await context.generateKeyPair(), bob = await context.generateKeyPair();
    const text = 'Xin chào Quân, đây là tin nhắn bí mật! 👋';
    const recipient = await context.encryptForRecipient(text, bob.publicKey), self = await context.encryptForSelf(text, alice.publicKey);
    const b64 = value => Buffer.from(value).toString('base64');
    const payload = {ciphertext: b64(recipient.ciphertext), nonce: b64(recipient.iv), sender_public_key: b64(recipient.senderPublicKey),
        self_ciphertext: b64(self.ciphertext), self_nonce: b64(self.iv), self_public_key: b64(self.senderPublicKey)};
    assert.equal(await context.decryptMessage(payload, bob.privateKey), text);
    assert.equal(await context.decryptOwnMessage(payload, alice.privateKey), text);
    const corrupted = Buffer.from(payload.ciphertext, 'base64'); corrupted[0] ^= 1;
    await assert.rejects(context.decryptMessage({...payload, ciphertext: corrupted.toString('base64')}, bob.privateKey));
    await assert.rejects(context.decryptMessage(payload, alice.privateKey));
});
test('Key adapter preserves keys across reload/restore and never creates keys on missing password or server failure', async () => {
    let stored = null, serverKey = null, backup = null, publishes = 0, unavailable = false;
    const context = vm.createContext({crypto: crypto.webcrypto, TextEncoder, TextDecoder, Uint8Array, atob, btoa,
        fetch: async (url, options) => {
            if (unavailable) return {status: 503, ok: false, json: async () => ({message: 'Database unavailable'})};
            if (options?.method === 'POST') {
                const data = JSON.parse(options.body); serverKey = data.publicKey; backup = data; publishes++;
                return {status: 200, ok: true, json: async () => ({message: 'saved'})};
            }
            if (url === '/api/keys/private') return {status: backup ? 200 : 404, ok: !!backup, json: async () => backup || {message: 'No backup'}};
            return {status: serverKey ? 200 : 404, ok: !!serverKey, json: async () => serverKey ? {publicKey: serverKey} : {message: 'No key'}};
        }
    });
    vm.runInContext(fs.readFileSync(path.join(clientPath, 'keyManager.js'), 'utf8'), context);
    context.getKeyPair = async () => stored;
    context.saveKeyPair = async (id, pair) => { stored = pair; };
    vm.runInContext(fs.readFileSync(path.resolve(clientPath, '../keyIntegration.js'), 'utf8'), context);
    await assert.rejects(context.getOrCreateKeyPair('user'), /log in again/);
    assert.equal(stored, null);
    unavailable = true;
    await assert.rejects(context.getOrCreateKeyPair('user', 'password'), /Database unavailable/);
    assert.equal(stored, null); assert.equal(publishes, 0);
    unavailable = false;
    const initial = await context.getOrCreateKeyPair('user', 'password');
    const originalKey = await context.exportPublicKey(initial.publicKey);
    assert.equal(publishes, 1);
    assert.equal(await context.getOrCreateKeyPair('user'), initial);
    stored = null;
    await assert.rejects(context.getOrCreateKeyPair('user'), /log out and log in again/);
    assert.equal(stored, null);
    const restored = await context.getOrCreateKeyPair('user', 'password');
    assert.equal(await context.exportPublicKey(restored.publicKey), originalKey);
    assert.equal(publishes, 1);
    stored = null;
    await assert.rejects(context.getOrCreateKeyPair('user', 'wrong-password'), /Cannot unlock/);
    assert.equal(stored, null); assert.equal(publishes, 1);
});
