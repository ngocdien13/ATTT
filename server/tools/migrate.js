'use strict';
const mysql = require('mysql2/promise');
const runner = require('../src/migrations/runner');
const path = require('node:path');
require('dotenv').config({path: path.resolve(__dirname, '../.env'), quiet: true});
async function main() {
    const [command = 'status', version, checksum] = process.argv.slice(2);
    if (!['status','check','up','resume'].includes(command) || (command === 'resume' && (!version || !/^[a-f0-9]{64}$/.test(checksum || '')))) {
        throw new Error('Usage: npm run migrate -- status|check|up OR resume VERSION CHECKSUM');
    }
    const connection = await mysql.createConnection({host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT || 3306),
        user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '', database: process.env.DB_NAME || 'seruchat'});
    try {
        if (command === 'up' || command === 'resume') console.log({applied: await runner.up(connection, command === 'resume' ? {resume: version, checksum} : {})});
        else console.table(await (command === 'check' ? runner.assertCurrent(connection) : runner.status(connection)));
    } finally { await connection.end(); }
}
main().catch(error => {
    console.error(error.code ? 'Database operation failed (' + error.code + ')' : error.message);
    process.exitCode = 1;
});
