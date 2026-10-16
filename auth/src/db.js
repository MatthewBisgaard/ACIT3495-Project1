const mysql = require('mysql2/promise');

// Thin repository over a connection pool. The app only depends on these three
// functions, which lets tests inject a fake without a real MySQL.
function createUserRepo(dbConfig) {
  const pool = mysql.createPool({
    ...dbConfig,
    waitForConnections: true,
    queueLimit: 0,
    connectTimeout: 5000,
  });

  return {
    async findByUsername(username) {
      // Parameterised query: no string concatenation, no SQL injection.
      const [rows] = await pool.execute(
        'SELECT id, username, password_hash, role FROM users WHERE username = ?',
        [username],
      );
      return rows[0] || null;
    },
    async create({ username, passwordHash, role }) {
      const [res] = await pool.execute(
        'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)',
        [username, passwordHash, role],
      );
      return res.insertId;
    },
    async ping() {
      await pool.query('SELECT 1');
    },
    async close() {
      await pool.end();
    },
  };
}

module.exports = { createUserRepo };
