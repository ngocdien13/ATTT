// HTTP/storage orchestration only. All cryptographic functions in the three
// original encryption files remain unchanged. This adapter replaces only
// getOrCreateKeyPair's transport flow, preventing key creation on HTTP errors
// and encrypted backups derived from a missing password after page reload.
const keySetupTasks = new Map();
async function keyApi(url, options) {
    const response = await fetch(url, options);
    const body = await response.json();
    if (!response.ok && response.status !== 404) throw new Error(body.message || 'Key server request failed');
    return {response, body};
}
async function publishChatKey(pair, password) {
    const backup = await encryptPrivateKey(pair.privateKey, password);
    const result = await keyApi('/api/keys/public', {method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({publicKey: await exportPublicKey(pair.publicKey), algorithm: 'X25519', ...backup})});
    if (!result.response.ok) throw new Error(result.body.message);
}
async function setupChatKey(userId, password) {
    if (!crypto.subtle) throw new Error('Open the app at http://localhost:3000 or through HTTPS to use encryption.');
    const local = await getKeyPair(userId);
    const {response, body} = await keyApi(`/api/keys/public/${encodeURIComponent(userId)}`);
    if (response.status === 404) {
        if (!password) throw new Error('Please log in again to finish key setup.');
        const pair = local || await generateKeyPair();
        // Store locally before publishing, so retry cannot generate a new key.
        await saveKeyPair(userId, pair);
        await publishChatKey(pair, password);
        return pair;
    }
    if (local && await exportPublicKey(local.publicKey) === body.publicKey) {
        if (password) {
            const backup = await keyApi('/api/keys/private');
            if (backup.response.status === 404) await publishChatKey(local, password);
        }
        return local;
    }
    if (!password) throw new Error('Please log out and log in again to unlock the existing private key.');
    const backup = await keyApi('/api/keys/private');
    if (backup.response.status === 404) throw new Error('This account has a key on another device but no encrypted backup. Use that device; no replacement key was created.');
    const bytes = value => Uint8Array.from(atob(value), char => char.charCodeAt(0));
    let privateKey;
    try { privateKey = await decryptPrivateKey(backup.body.encryptedPrivateKey, password, bytes(backup.body.salt), bytes(backup.body.iv)); }
    catch (error) { throw new Error('Cannot unlock the saved private key. Check the password and use the original device.'); }
    const publicKey = await crypto.subtle.importKey('spki', bytes(body.publicKey), {name: 'X25519'}, true, []);
    const pair = {publicKey, privateKey};
    await saveKeyPair(userId, pair);
    return pair;
}
getOrCreateKeyPair = function(userId, password) {
    if (!keySetupTasks.has(userId)) {
        const task = setupChatKey(userId, password).finally(() => keySetupTasks.delete(userId));
        keySetupTasks.set(userId, task);
    }
    return keySetupTasks.get(userId);
};
