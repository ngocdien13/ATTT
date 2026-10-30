const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), crypto = require('node:crypto');
const HistoryCache = require('../../client/js/historyCache');
test('An edited cached ciphertext is decrypted again and rejected by real GCM; restored row works', async () => {
    const c = vm.createContext({crypto: crypto.webcrypto, TextEncoder, TextDecoder, Uint8Array, atob, btoa});
    for (const file of ['keyManager.js','encryption.js','decryption.js']) vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../../client/js/encryption',file),'utf8'),c);
    const key = await c.generateKeyPair(), packet = await c.encryptForRecipient('Tin cũ vẫn đọc được 👋', key.publicKey);
    const b64 = value => Buffer.from(value).toString('base64');
    const row = {id: crypto.randomUUID(), nonce: b64(packet.iv), ciphertext: b64(packet.ciphertext), sender_public_key: b64(packet.senderPublicKey)};
    const cache = new HistoryCache(); let calls = 0;
    const decrypt = row => { calls++; return c.decryptMessage(row, key.privateKey); };
    assert.equal(await cache.resolve(row,decrypt),'Tin cũ vẫn đọc được 👋');
    await cache.resolve(row,decrypt); assert.equal(calls,1);
    const corrupted = Buffer.from(packet.ciphertext); corrupted[0] ^= 1;
    await assert.rejects(cache.resolve({...row,ciphertext:b64(corrupted)},decrypt));
    assert.equal(cache.entries.has(row.id),false);
    assert.equal(await cache.resolve(row,decrypt),'Tin cũ vẫn đọc được 👋');
    assert.equal(calls,3);
});
test('Logout/conversation clear prevents in-flight reads repopulating the cache; cache is bounded', async () => {
    const cache = new HistoryCache(2); let resolve;
    const task = cache.resolve({id:'late'},()=>new Promise(done=>{ resolve=done; }));
    cache.clear(); resolve('private text'); await task;
    assert.equal(cache.entries.size,0);
    for (const id of ['a','b','c']) await cache.resolve({id},async()=>id);
    assert.equal(cache.entries.size,2); assert.equal(cache.entries.has('a'),false);
});
