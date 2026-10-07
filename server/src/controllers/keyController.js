const db = require('../config/database');
const {fail, uuid, publicKey, base64} = require('../utils/api');
const {transaction} = require('../utils/transactions');
async function savePublicKey(req, res) {
    const id = req.session.userId;
    if (req.params.id && uuid(req.params.id) !== id) fail(403, 'You can only publish your own key');
    const key = publicKey(req.body.publicKey), algorithm = req.body.algorithm || 'X25519';
    if (algorithm !== 'X25519') fail(400, 'Algorithm must be X25519');
    const fields = ['encryptedPrivateKey', 'salt', 'iv'];
    const hasBackup = fields.some(field => req.body[field] !== undefined);
    let encrypted = null, salt = null, iv = null;
    if (hasBackup) {
        if (fields.some(field => req.body[field] === undefined)) fail(400, 'All private-key backup fields are required together');
        encrypted = base64(req.body.encryptedPrivateKey, 'Encrypted private key', {min: 16, max: 4096});
        salt = base64(req.body.salt, 'Key salt', {bytes: 16});
        iv = base64(req.body.iv, 'Key IV', {bytes: 12});
    }
    await transaction(async connection => {
        // Serializes the first publish too, including two devices on a fresh account.
        const [users] = await connection.query('SELECT id FROM users WHERE id = ? FOR UPDATE', [id]);
        if (!users.length) fail(401, 'User no longer exists');
        const [keys] = await connection.query('SELECT public_key FROM public_keys WHERE user_id = ?', [id]);
        if (keys.length && keys[0].public_key !== key) fail(409, 'This account already has a different key. Restore the existing private key instead of replacing it.');
        if (!keys.length) await connection.query(`INSERT INTO public_keys
            (user_id, public_key, algorithm, encrypted_private_key, encryption_salt, encryption_iv)
            VALUES (?, ?, ?, ?, ?, ?)`, [id, key, algorithm, encrypted, salt, iv]);
        else if (hasBackup) await connection.query(`UPDATE public_keys SET encrypted_private_key = ?, encryption_salt = ?, encryption_iv = ? WHERE user_id = ?`, [encrypted, salt, iv, id]);
    });
    res.json({message: hasBackup ? 'Public key and encrypted private key saved' : 'Public key saved'});
}
async function getPublicKey(req, res) {
    const id = uuid(req.params.userId || req.params.id);
    const [keys] = await db.promise().query('SELECT public_key, algorithm FROM public_keys WHERE user_id = ?', [id]);
    if (!keys.length) fail(404, 'Public key not found');
    res.json({publicKey: keys[0].public_key, algorithm: keys[0].algorithm});
}
async function getMyPrivateKey(req, res) {
    const [keys] = await db.promise().query('SELECT encrypted_private_key, encryption_salt, encryption_iv FROM public_keys WHERE user_id = ?', [req.session.userId]);
    if (!keys.length || !keys[0].encrypted_private_key) fail(404, 'Encrypted private key not available');
    res.json({encryptedPrivateKey: keys[0].encrypted_private_key, salt: keys[0].encryption_salt, iv: keys[0].encryption_iv});
}
module.exports = {savePublicKey, getPublicKey, getMyPrivateKey};
