const path = require('path');
require('dotenv').config({path: path.resolve(__dirname, '../../.env'), quiet: true});
const mysql = require('mysql2');
module.exports = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'seruchat',
    charset: 'utf8mb4',
    waitForConnections: true,
    connectionLimit: 10,
    supportBigNumbers: true,
    bigNumberStrings: true,
    timezone: 'Z'
});
