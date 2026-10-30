const path = require('path');
require('dotenv').config({path: path.resolve(__dirname, '../../.env'), quiet: true});
require('./loadSecrets')();
const mysql = require('mysql2');
const pool = mysql.createPool({
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

// Align server NOW()/TIMESTAMP reads with the driver UTC interpretation.
pool.on('connection', connection => { connection.query("SET SESSION time_zone = '+00:00'", error => {if(error) connection.destroy();}); });
module.exports=pool;
