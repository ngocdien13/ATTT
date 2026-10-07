const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
test('HTTP APIs with real MySQL, sessions, races and blocking', {skip: process.env.RUN_MYSQL_TESTS !== '1'}, async t => {
    require('dotenv').config({path: path.resolve(__dirname, '../.env'), quiet: true});
    const mysql = require('mysql2/promise');
    const name = 'seruchat_test_' + crypto.randomBytes(6).toString('hex');
    const admin = await mysql.createConnection({host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT || 3306),
        user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '', multipleStatements: true});
    process.env.DB_NAME = name; process.env.SESSION_SECRET = crypto.randomBytes(32).toString('hex');
    const schema = fs.readFileSync(path.resolve(__dirname, '../../database/schema.sql'), 'utf8').replace(/\bseruchat\b/g, name);
    let server, app, db;
    try {
        await admin.query(schema);
        db = require('../src/config/database');
        app = require('../src/server').createApp();
        await app.locals.sessionStore.onReady();
        server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
        const url = `http://127.0.0.1:${server.address().port}`;
        function client() {
            let cookie = '';
            return async (route, body, headers = {}) => {
                const response = await fetch(url + route, {method: body === undefined ? 'GET' : 'POST', headers: {...(cookie ? {Cookie: cookie} : {}), ...headers,
                    ...(body === undefined ? {} : {'Content-Type': 'application/json'})}, body: body === undefined ? undefined : JSON.stringify(body)});
                const set = response.headers.get('set-cookie'); if (set) cookie = set.split(';')[0];
                return {status: response.status, data: response.status === 204 ? null : await response.json()};
            };
        }
        const a = client(), b = client(), e = client(), anon = client();
        let alice, bob, eve, f, conversation;
        const password = 'demo-password';
        await t.test('Register, duplicate email, login sessions and validation', async () => {
            alice = (await a('/api/auth/register', {username: 'Alice', email: 'alice@example.test', password})).data.user;
            bob = (await b('/api/auth/register', {username: 'Bob', email: 'bob@example.test', password})).data.user;
            eve = (await e('/api/auth/register', {username: 'Eve', email: 'eve@example.test', password})).data.user;
            assert.ok(alice.id && bob.id && eve.id);
            assert.equal((await anon('/api/auth/register', {username: 'Duplicate', email: 'alice@example.test', password})).status, 409);
            assert.equal((await anon('/api/auth/register', {email: {}, password})).status, 400);
            assert.equal((await anon('/api/auth/me')).status, 401);
            for (const [c, email] of [[a, 'alice'], [b, 'bob'], [e, 'eve']]) assert.equal((await c('/api/auth/login', {email: email + '@example.test', password})).status, 200);
            assert.equal((await a('/api/auth/me')).data.user.id, alice.id);
            assert.equal((await a('/api/users/nope')).status, 400);
            assert.equal((await a('/api/users/' + crypto.randomUUID())).status, 404);
            assert.equal((await a('/api/friendships/request', {targetUserId: bob.id}, {Origin: 'https://evil.example'})).status, 403);
            assert.equal((await a('/api/friendships/request', {targetUserId: bob.id}, {Origin: 'bad-origin'})).status, 400);
            const [sessions] = await admin.query(`SELECT COUNT(*) n FROM \`${name}\`.sessions`); assert.equal(sessions[0].n, 3);
        });
        await t.test('Friend request races, self/nonexistent users and recipient authorization', async () => {
            assert.equal((await a('/api/friendships/request', {targetUserId: alice.id})).status, 400);
            assert.equal((await a('/api/friendships/request', {targetUserId: crypto.randomUUID()})).status, 404);
            const results = await Promise.all([a('/api/friendships/request', {targetUserId: bob.id}), b('/api/friendships/request', {targetUserId: alice.id})]);
            assert.deepEqual(results.map(r => r.status).sort(), [201, 409]);
            f = results.find(r => r.status === 201).data.friendshipId;
            const requester = results[0].status === 201 ? a : b, recipient = requester === a ? b : a;
            assert.equal((await requester(`/api/friendships/${f}/accept`, {})).status, 403);
            assert.equal((await e(`/api/friendships/${f}/accept`, {})).status, 403);
            assert.equal((await e(`/api/friendships/${f}/reject`, {})).status, 403);
            assert.equal((await recipient(`/api/friendships/${f}/accept`, {})).status, 200);
            assert.equal((await recipient(`/api/friendships/${f}/accept`, {})).status, 409);
            assert.equal((await a('/api/friendships/request', {targetUserId: bob.id})).status, 409);
        });
        await t.test('Conversation creation is atomic and unique under parallel requests', async () => {
            assert.equal((await e('/api/conversations', {friendId: alice.id})).status, 403);
            assert.equal((await a('/api/conversations', {friendId: crypto.randomUUID()})).status, 404);
            const results = await Promise.all(Array.from({length: 5}, () => a('/api/conversations', {friendId: bob.id})));
            assert.ok(results.every(r => [200, 201].includes(r.status)));
            assert.equal(new Set(results.map(r => r.data.conversationId)).size, 1);
            conversation = results[0].data.conversationId;
            const [members] = await admin.query(`SELECT COUNT(*) n FROM \`${name}\`.conversation_members WHERE conversation_id = ?`, [conversation]);
            assert.equal(members[0].n, 2);
        });
        const key = crypto.generateKeyPairSync('x25519').publicKey.export({type: 'spki', format: 'der'}).toString('base64');
        const message = {conversationId: '', ciphertext: Buffer.alloc(20).toString('base64'), nonce: Buffer.alloc(12).toString('base64'), senderPublicKey: key,
            selfCiphertext: Buffer.alloc(20).toString('base64'), selfNonce: Buffer.alloc(12).toString('base64'), selfPublicKey: key};
        await t.test('Key ownership, Java publication, backup and replacement refusal', async () => {
            assert.equal((await b('/users/' + bob.id + '/public-key', {publicKey: key})).status, 200);
            assert.equal((await b('/api/keys/private')).status, 404);
            const replacement = crypto.generateKeyPairSync('x25519').publicKey.export({type: 'spki', format: 'der'}).toString('base64');
            assert.equal((await b('/api/keys/public', {publicKey: replacement})).status, 409);
            assert.equal((await e('/users/' + bob.id + '/public-key', {publicKey: key})).status, 403);
            assert.equal((await a('/api/keys/public', {publicKey: key, encryptedPrivateKey: Buffer.alloc(64).toString('base64'), salt: Buffer.alloc(16).toString('base64'), iv: Buffer.alloc(12).toString('base64')})).status, 200);
            assert.equal((await a('/api/keys/private')).status, 200);
            assert.equal((await e('/messages/' + bob.id)).status, 403);
        });
        await t.test('Member-only send/read, both HTTP contracts and ordered history', async () => {
            message.conversationId = conversation;
            assert.equal((await e('/api/messages', message)).status, 403);
            assert.equal((await a('/api/messages', {...message, nonce: 'invalid'})).status, 400);
            assert.equal((await a('/api/messages', message)).status, 201);
            const {conversationId, nonce, ...java} = message;
            assert.equal((await a('/messages', {...java, to: bob.id, iv: nonce})).status, 201);
            assert.equal((await e('/api/messages/' + conversation)).status, 403);
            assert.equal((await b('/api/messages/' + conversation)).data.length, 2);
            assert.equal((await b('/messages/' + bob.id)).data.length, 2);
        });
        await t.test('Block stops messages, new chats and invitations in both directions', async () => {
            assert.equal((await b('/api/friendships/block', {targetUserId: alice.id})).status, 200);
            assert.equal((await a('/api/messages', message)).status, 403);
            assert.equal((await b('/api/messages', message)).status, 403);
            assert.equal((await a('/api/conversations', {friendId: bob.id})).status, 403);
            assert.equal((await a('/api/friendships/request', {targetUserId: bob.id})).status, 403);
            assert.equal((await a('/api/friendships')).data.friends.length, 0);
            assert.equal((await b('/api/friendships/blocked')).data.users[0].id, alice.id);
            assert.equal((await a('/api/messages/' + conversation)).data.length, 2);
        });
        await t.test('Only blocker can unblock; accepted friendship and history resume; remove preserves history', async () => {
            assert.equal((await a('/api/friendships/unblock', {targetUserId: bob.id})).status, 403);
            assert.equal((await e('/api/friendships/unblock', {targetUserId: alice.id})).status, 409);
            const restored = await b('/api/friendships/unblock', {targetUserId: alice.id});
            assert.equal(restored.status, 200); assert.equal(restored.data.friendshipRestored, true);
            assert.equal((await b('/api/friendships/blocked')).data.users.length, 0);
            assert.equal((await a('/api/messages', message)).status, 201);
            assert.equal((await a('/api/friendships/remove', {targetUserId: bob.id})).status, 200);
            assert.equal((await a('/api/friendships')).data.friends.length, 0);
            assert.equal((await b('/api/messages', message)).status, 403);
            assert.equal((await a('/api/messages/' + conversation)).data.length, 3);
            assert.equal((await b('/api/conversations')).data[0].friendship_status, null);
        });
        await t.test('Sent invitations can be cancelled; rejected invitations can be resent; chat is reused', async () => {
            let invite = await a('/api/friendships/request', {targetUserId: bob.id}); assert.equal(invite.status, 201);
            let sent = await a('/api/friendships/outgoing'); assert.equal(sent.data.requests[0].id, invite.data.friendshipId);
            assert.equal((await b(`/api/friendships/${invite.data.friendshipId}/cancel`, {})).status, 403);
            assert.equal((await e(`/api/friendships/${invite.data.friendshipId}/cancel`, {})).status, 403);
            assert.equal((await a(`/api/friendships/${invite.data.friendshipId}/cancel`, {})).status, 200);
            assert.equal((await a('/api/friendships/outgoing')).data.requests.length, 0);
            assert.equal((await b('/api/friendships/requests')).data.requests.length, 0);
            invite = await a('/api/friendships/request', {targetUserId: bob.id});
            assert.equal((await b(`/api/friendships/${invite.data.friendshipId}/reject`, {})).status, 200);
            const retry = await a('/api/friendships/request', {targetUserId: bob.id}); assert.equal(retry.status, 201);
            assert.equal((await b(`/api/friendships/${retry.data.friendshipId}/accept`, {})).status, 200);
            assert.equal((await a('/api/conversations', {friendId: bob.id})).data.conversationId, conversation);
            assert.equal((await a('/api/users/' + bob.id)).data.relationship.status, 'accepted');
        });
        await t.test('Unblock non-friend or pending request never grants accepted status', async () => {
            const d = client();
            const other = (await d('/api/auth/register', {username:'D', email:'d@example.test', password})).data.user;
            assert.equal((await d('/api/auth/login', {email:'d@example.test', password})).status, 200);
            assert.equal((await d('/api/friendships/block', {targetUserId:eve.id})).status, 200);
            assert.equal((await e('/api/friendships/unblock', {targetUserId:other.id})).status, 403);
            assert.equal((await d('/api/friendships/unblock', {targetUserId:eve.id})).data.friendshipRestored, false);
            assert.equal((await d('/api/conversations', {friendId:eve.id})).status, 403);
            assert.equal((await d('/api/friendships/request', {targetUserId:eve.id})).status, 201);
            assert.equal((await d('/api/friendships/block', {targetUserId:eve.id})).status, 200);
            assert.equal((await d('/api/friendships/unblock', {targetUserId:eve.id})).data.friendshipRestored, false);
            assert.equal((await e('/api/friendships/requests')).data.requests.length, 0);
            assert.equal((await d('/api/friendships/unblock', {targetUserId:crypto.randomUUID()})).status, 404);
            assert.equal((await d('/api/friendships/remove', {targetUserId:crypto.randomUUID()})).status, 404);
        });
        await t.test('Spam returns 429 and logout invalidates the session', async () => {
            let result;
            for (let i = 0; i < 25; i++) result = await e('/api/friendships/request', {targetUserId: eve.id});
            assert.equal(result.status, 429);
            assert.equal((await a('/api/auth/logout', {})).status, 200);
            assert.equal((await a('/api/auth/me')).status, 401);
        });
    } finally {
        if (server) await new Promise(resolve => server.close(resolve));
        if (app) await app.locals.sessionStore.close();
        if (db) await db.promise().end();
        await admin.query(`DROP DATABASE IF EXISTS \`${name}\``); await admin.end();
    }
});
