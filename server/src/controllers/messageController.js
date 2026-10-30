const crypto = require('crypto');
const db = require('../config/database');
const {uuid, base64, publicKey, fail} = require('../utils/api');
const {transaction, conversationPair, lockPair, accepted} = require('../utils/transactions');
const {ensureConversation} = require('./conversationController');
function messageFields(body) {
    return {
        ciphertext: base64(body.ciphertext, 'Ciphertext', {min: 16}),
        nonce: base64(body.nonce ?? body.iv, 'Message IV', {bytes: 12}),
        senderPublicKey: publicKey(body.senderPublicKey, 'Sender public key'),
        selfCiphertext: base64(body.selfCiphertext, 'Self ciphertext', {min: 16}),
        selfNonce: base64(body.selfNonce, 'Self IV', {bytes: 12}),
        selfPublicKey: publicKey(body.selfPublicKey, 'Self public key')
    };
}
async function sendMessage(req, res) {
    if(process.env.ALLOW_LEGACY_SEND!=="true")fail(410,"Cần dùng ứng dụng mới để gửi tin có chữ ký.");
    const senderId = req.session.userId, data = messageFields(req.body);
    const requested = req.body.conversationId ? uuid(req.body.conversationId, 'Conversation ID') : null;
    const recipient = requested ? null : uuid(req.body.to, 'Recipient user ID');
    if (senderId === recipient) fail(400, 'You cannot send a direct message to yourself');
    const result = await transaction(async connection => {
        let conversationId = requested;
        if (!conversationId) {
            const [users] = await connection.query('SELECT id FROM users WHERE id = ?', [recipient]);
            if (!users.length) fail(404, 'User not found');
            conversationId = (await ensureConversation(connection, senderId, recipient)).id;
        } else {
            const peer = await conversationPair(connection, conversationId, senderId);
            accepted(await lockPair(connection, senderId, peer));
        }
        const id = crypto.randomUUID();
        await connection.query(`INSERT INTO messages (id, conversation_id, sender_id, ciphertext, nonce,
            sender_public_key, self_ciphertext, self_nonce, self_public_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, conversationId, senderId, data.ciphertext, data.nonce, data.senderPublicKey, data.selfCiphertext, data.selfNonce, data.selfPublicKey]);
        return {id, conversationId};
    });
    res.status(201).json({message: 'Message sent', messageId: result.id, conversationId: result.conversationId});
}
async function getMessages(req, res) {
    const id = uuid(req.params.conversationId, 'Conversation ID');
    await conversationPair(db.promise(), id, req.session.userId);
    // Keep existing array response and full history. Block stops new sends;
    // members can still read ciphertext already sent to their conversation.
    const [messages] = await db.promise().query(`SELECT id, conversation_id, sender_id, ciphertext, nonce,
        sender_public_key, self_ciphertext, self_nonce, self_public_key, created_at
        FROM messages WHERE conversation_id = ? ORDER BY created_at ASC, id ASC`, [id]);
    res.json(messages);
}
async function getJavaInbox(req, res) {
    const id = uuid(req.params.id);
    if (id !== req.session.userId) fail(403, 'You can only read your own inbox');
    // Read committed history; Java remembers individual IDs after decryption.
    // A MAX(auto_increment) cursor could skip an earlier, late commit.
    const [messages] = await db.promise().query(`SELECT m.id, m.nonce AS iv,
        m.ciphertext, m.sender_public_key AS senderPublicKey FROM messages m
        JOIN conversation_members mine ON mine.conversation_id = m.conversation_id AND mine.user_id = ?
        WHERE m.sender_id <> ? ORDER BY m.created_at ASC, m.id ASC`, [id, id]);
    if (!messages.length) return res.status(204).end();
    res.json(messages);
}
// Bounded cursor API for the modern web client. Legacy endpoints retain their array contracts.
async function getHistoryPage(req,res) {
    const id=uuid(req.params.conversationId,'Conversation ID');
    await conversationPair(db.promise(),id,req.session.userId);
    let before=null;
    if(req.query.before!==undefined){
        try {if(typeof req.query.before!=='string'||req.query.before.length>256)throw new Error();before=JSON.parse(Buffer.from(req.query.before,'base64url').toString('utf8'));
            uuid(before.id);if(typeof before.time!=='string'||!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{6}$/.test(before.time))throw new Error();}
        catch {fail(400,'History cursor is invalid');}
    }
    const [rows]=await db.promise().query(`SELECT *,DATE_FORMAT(created_at,'%Y-%m-%d %H:%i:%s.%f') AS cursor_time FROM messages
        WHERE conversation_id=? ${before?'AND (created_at < ? OR (created_at = ? AND id < ?))':''}
        ORDER BY created_at DESC,id DESC LIMIT 51`,[id,...(before?[before.time,before.time,before.id]:[])]);
    const hasMore=rows.length>50,selected=rows.slice(0,50),last=selected.at(-1);
    const next=hasMore&&last?Buffer.from(JSON.stringify({time:last.cursor_time,id:last.id})).toString('base64url'):null;
    res.json({messages:selected.reverse().map(({cursor_time,...row})=>({...row,created_at:cursor_time.replace(' ','T')+'Z'})),next});
}
module.exports = {getHistoryPage,sendMessage, getMessages, getJavaInbox, messageFields};
