
const mysql = require("mysql2/promise");
const pool = mysql.createPool({
  host: process.env.DB_HOST45,
  user: process.env.DB_USER45,
  password: process.env.DB_PASSWORD45,
  database: process.env.DB_NAME45,
  port: process.env.DB_PORT45 || 5000,
   ssl: {
    minVersion: 'TLSv1.2',
    rejectUnauthorized: true
  },
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});
module.exports = pool;
