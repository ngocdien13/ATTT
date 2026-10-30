const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const runner = require('../src/migrations/runner');
test('Migration loader rejects ambiguous versions and unexpected files', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(),'seruchat-migrations-'));
    try {
        fs.writeFileSync(path.join(dir,'001_a.js'),'exports.up=async()=>{};');
        assert.equal(runner.migrations(dir).length,1);
        fs.writeFileSync(path.join(dir,'001_b.js'),'exports.up=async()=>{};');
        assert.throws(()=>runner.migrations(dir),/Duplicate/);
        fs.unlinkSync(path.join(dir,'001_b.js')); fs.writeFileSync(path.join(dir,'unsafe.sql'),'SELECT 1');
        assert.throws(()=>runner.migrations(dir),/Unexpected/);
    } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
test('Real MySQL migrations preserve legacy identity/messages, fail closed, and recover explicitly', {skip: process.env.RUN_MYSQL_TESTS !== '1'}, async t => {
    const mysql = require('mysql2/promise');
    const name = 'seruchat_migrations_' + crypto.randomBytes(6).toString('hex');
    const options = {host: process.env.DB_HOST || 'localhost',port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER||'root',password:process.env.DB_PASSWORD||'',multipleStatements:true};
    const admin = await mysql.createConnection(options), temporary = fs.mkdtempSync(path.join(os.tmpdir(),'seruchat-migrations-'));
    let c, other;
    try {
        const legacySchema=fs.readFileSync(path.resolve(__dirname,'../../database/schema.sql'),'utf8')
            .replace(/^    blocked_previous_status .*\n/m,'').replace(/\bseruchat\b/g,name);
        await admin.query(legacySchema);
        c = await mysql.createConnection({...options,database:name}); other = await mysql.createConnection({...options,database:name});
        const a = crypto.randomUUID(), b = crypto.randomUUID(), chat = crypto.randomUUID(), mid = crypto.randomUUID();
        for(const id of [a,b]) await c.query('INSERT INTO users(id,username,email,password_hash) VALUES (?,?,?,?)',[id,'Tên trùng',id+'@example.test','test-only-hash']);
        const publicKey=crypto.generateKeyPairSync('x25519').publicKey.export({type:'spki',format:'der'}).toString('base64');
        await c.query("INSERT INTO public_keys(user_id,public_key,algorithm) VALUES (?,?,'X25519')",[a,publicKey]);
        await c.query('INSERT INTO conversations(id) VALUES (?)',[chat]);
        for(const id of [a,b]) await c.query('INSERT INTO conversation_members(conversation_id,user_id) VALUES (?,?)',[chat,id]);
        await c.query("INSERT INTO friendships(id,user1_id,user2_id,requested_by,status,blocked_by,blocked_at) VALUES (?,?,?,?,'blocked',?,CURRENT_TIMESTAMP(6))",
            [crypto.randomUUID(),...[a,b].sort(),a,a]);
        await c.query('INSERT INTO messages(id,conversation_id,sender_id,ciphertext,nonce,sender_public_key,self_ciphertext,self_nonce,self_public_key) VALUES (?,?,?,?,?,?,?,?,?)',
            [mid,chat,a,Buffer.alloc(20).toString('base64'),Buffer.alloc(12).toString('base64'),publicKey,Buffer.alloc(20).toString('base64'),Buffer.alloc(12).toString('base64'),publicKey]);
        const [[before]] = await c.query('SELECT * FROM messages WHERE id=?',[mid]);
        await t.test('status is read-only; check rejects pending migrations',async()=>{
            assert.equal((await runner.status(c))[0].state,'pending');
            await assert.rejects(runner.assertCurrent(c),/migration required/);
            const [tables]=await c.query("SHOW TABLES LIKE 'seruchat_schema_migrations'");assert.equal(tables.length,0);
        });
        await t.test('concurrent runs serialize; repeat up is a no-op, legacy bytes stay unchanged',async()=>{
            await c.query('SET SESSION sql_safe_updates = 1');
            const results=await Promise.all([runner.up(c),runner.up(other)]);
            assert.equal(results.flat().length,runner.migrations().length); assert.deepEqual(await runner.up(c),[]);
            await runner.assertCurrent(c);
            const [profiles]=await c.query('SELECT * FROM user_profiles');assert.equal(profiles.length,2);
            assert.equal(new Set(profiles.map(p=>p.handle)).size,2);assert.ok(profiles.every(p=>p.date_of_birth===null&&p.phone_verified_at===null));
            assert.deepEqual((await c.query('SELECT * FROM messages WHERE id=?',[mid]))[0][0],before);
            assert.equal((await c.query('SELECT public_key FROM public_keys WHERE user_id=?',[a]))[0][0].public_key,publicKey);
            assert.equal((await c.query('SELECT blocked_previous_status FROM friendships'))[0][0].blocked_previous_status,'accepted');
            assert.equal((await c.query('SELECT @@SESSION.sql_safe_updates AS enabled'))[0][0].enabled,1);
        });
        for(const migration of runner.migrations()) fs.copyFileSync(migration.file,path.join(temporary,path.basename(migration.file)));
        await t.test('modified/missing migration files are rejected',async()=>{
            const file=path.join(temporary,'001_profile_foundation.js'), original=fs.readFileSync(file);
            fs.appendFileSync(file,'\n// drift');await assert.rejects(runner.status(c,temporary),/checksum mismatch/);
            fs.unlinkSync(file);await assert.rejects(runner.status(c,temporary),/file is missing/);
            fs.writeFileSync(file,original);
        });
        await t.test('partial DDL is marked failed; retry needs exact checksum and explicit resume',async()=>{
            const file=path.join(temporary,'999_failure.js');
            fs.writeFileSync(file,`exports.up=async c=>{await c.query('CREATE TABLE IF NOT EXISTS migration_probe (id INT PRIMARY KEY)');const [[r]]=await c.query('SELECT COUNT(*) n FROM migration_probe');if(!r.n)throw new Error('test failure');};`);
            await assert.rejects(runner.up(c,{dir:temporary}),/Migration failed/);
            assert.equal((await runner.status(c,temporary)).at(-1).state,'failed');
            await assert.rejects(runner.up(c,{dir:temporary}),/Incomplete migration/);
            await assert.rejects(runner.up(c,{dir:temporary,resume:'999_failure',checksum:'0'.repeat(64)}),/Incomplete migration/);
            await c.query('INSERT INTO migration_probe(id) VALUES (1)');
            const checksum=runner.migrations(temporary).at(-1).checksum;
            assert.deepEqual(await runner.up(c,{dir:temporary,resume:'999_failure',checksum}),['999_failure']);
        });
    } finally {
        if(c) await c.end();if(other) await other.end();await admin.query('DROP DATABASE IF EXISTS `'+name+'`');await admin.end();
        fs.rmSync(temporary,{recursive:true,force:true});
    }
});
