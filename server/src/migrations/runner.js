'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const directory = path.resolve(__dirname, '../../../database/migrations');
const ledger = 'seruchat_schema_migrations';

function migrations(dir = directory) {
    const entries = fs.readdirSync(dir).filter(name => !name.startsWith('.'));
    if (entries.some(name => !/^\d{3}_[a-z0-9_]+\.js$/.test(name))) throw new Error('Unexpected file in migration directory');
    const ids = new Set();
    return entries.sort().map(name => {
        const id = name.slice(0, -3), file = path.join(dir, name), number = name.slice(0, 3);
        if (ids.has(number)) throw new Error('Duplicate migration number: ' + number);
        ids.add(number);
        return {id, file, checksum: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')};
    });
}
async function rows(connection) {
    const [tables] = await connection.query('SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?', [ledger]);
    if (!tables.length) return [];
    const [history] = await connection.query('SELECT version, checksum, state, started_at, applied_at, error_code FROM ' + ledger + ' ORDER BY version');
    return history;
}
function validate(history, files) {
    for (const entry of history) {
        const file = files.find(item => item.id === entry.version);
        if (!file) throw new Error('Applied/started migration file is missing: ' + entry.version);
        if (file.checksum !== entry.checksum) throw new Error('Migration checksum mismatch: ' + entry.version);
    }
    let pending = false;
    for (const file of files) {
        const entry = history.find(item => item.version === file.id);
        if (!entry || entry.state !== 'applied') pending = true;
        else if (pending) throw new Error('Migration history is out of order: ' + file.id);
    }
}
async function status(connection, dir = directory) {
    const files = migrations(dir), history = await rows(connection);
    validate(history, files);
    return files.map(file => ({version: file.id, checksum: file.checksum,
        state: history.find(entry => entry.version === file.id)?.state || 'pending'}));
}
async function assertCurrent(connection, dir = directory) {
    const result = await status(connection, dir);
    if (!result.length || result.some(item => item.state !== 'applied')) throw new Error('Database migration required. Run npm run migrate -- up before starting production.');
    return result;
}
async function assertLegacySchema(connection) {
    const required = {
        users: ['id','username','email','password_hash'],
        public_keys: ['user_id','public_key','encrypted_private_key','encryption_salt','encryption_iv'],
        friendships: ['id','user1_id','user2_id','requested_by','status','blocked_by'],
        conversations: ['id'], conversation_members: ['conversation_id','user_id'],
        messages: ['id','conversation_id','sender_id','ciphertext','nonce','sender_public_key','self_ciphertext','self_nonce','self_public_key'],
        sessions: ['session_id','expires','data']
    };
    const [columns] = await connection.query('SELECT table_name AS tbl, column_name AS col FROM information_schema.columns WHERE table_schema = DATABASE()');
    for (const [table, names] of Object.entries(required)) for (const name of names) {
        if (!columns.some(column => column.tbl === table && column.col === name)) throw new Error('Unsupported legacy schema; missing ' + table + '.' + name);
    }
}
async function up(connection, {dir = directory, resume, checksum, lockTimeout = 10} = {}) {
    const files = migrations(dir);
    const [[database]] = await connection.query('SELECT DATABASE() AS db');
    if (!database.db) throw new Error('Select a database first');
    const lock = 'seruchat-migrate-' + crypto.createHash('sha256').update(database.db).digest('hex').slice(0, 40);
    const [[acquired]] = await connection.query('SELECT GET_LOCK(?, ?) AS acquired', [lock, lockTimeout]);
    if (Number(acquired.acquired) !== 1) throw new Error('Another migration process holds the database lock');
    try {
        await assertLegacySchema(connection);
        await connection.query(`CREATE TABLE IF NOT EXISTS ${ledger} (
            version VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
            checksum CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
            state ENUM('running','applied','failed') NOT NULL,
            started_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
            applied_at TIMESTAMP(6) NULL DEFAULT NULL,
            error_code VARCHAR(64) CHARACTER SET ascii DEFAULT NULL
        ) ENGINE=InnoDB`);
        const history = await rows(connection);
        validate(history, files);
        const dirty = history.filter(entry => entry.state !== 'applied');
        if (dirty.length && (dirty.length !== 1 || dirty[0].version !== resume || dirty[0].checksum !== checksum)) {
            throw new Error('Incomplete migration: ' + dirty.map(item => item.version).join(', ') + '. Inspect the schema and use the documented explicit resume procedure.');
        }
        if (resume && (!dirty.length || !files.some(file => file.id === resume && file.checksum === checksum))) throw new Error('Resume requires the exact incomplete version and checksum');
        const applied = [];
        for (const file of files) {
            const entry = history.find(item => item.version === file.id);
            if (entry?.state === 'applied') continue;
            if (entry) await connection.query(`UPDATE ${ledger} SET state='running', error_code=NULL WHERE version=?`, [file.id]);
            else await connection.query(`INSERT INTO ${ledger} (version,checksum,state) VALUES (?,?,'running')`, [file.id, file.checksum]);
            try {
                delete require.cache[require.resolve(file.file)];
                const migration = require(file.file);
                if (typeof migration.up !== 'function') throw new Error('Migration must export up(connection)');
                await migration.up(connection);
                await connection.query(`UPDATE ${ledger} SET state='applied', applied_at=CURRENT_TIMESTAMP(6), error_code=NULL WHERE version=?`, [file.id]);
                applied.push(file.id);
            } catch (error) {
                await connection.rollback();
                await connection.query(`UPDATE ${ledger} SET state='failed', error_code=? WHERE version=?`, [/^[A-Z0-9_]{1,64}$/.test(error.code || '') ? error.code : 'MIGRATION_FAILED', file.id]);
                throw new Error('Migration failed: ' + file.id + '. DDL may already be committed; inspect before resuming.', {cause: error});
            }
        }
        return applied;
    } finally {
        await connection.query('SELECT RELEASE_LOCK(?)', [lock]);
    }
}
module.exports = {migrations, status, up, assertCurrent, assertLegacySchema};
