// db.js - supports PostgreSQL when DATABASE_URL is set, otherwise falls back to SQLite for local dev
const DATABASE_URL = process.env.DATABASE_URL;

function convertQuestionToDollar(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

if (DATABASE_URL) {
  // Postgres mode (async)
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: DATABASE_URL });

  async function query(sql, params = []) {
    const q = convertQuestionToDollar(sql);
    const res = await pool.query(q, params);
    return res;
  }

  async function init() {
    await query(`CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE,
      password TEXT
    )`);
    await query(`CREATE TABLE IF NOT EXISTS friends (
      id SERIAL PRIMARY KEY,
      requester INTEGER,
      addressee INTEGER,
      status TEXT
    )`);
    await query(`CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      from_id INTEGER,
      to_id INTEGER,
      content TEXT,
      created_at BIGINT
    )`);
    await query(`CREATE TABLE IF NOT EXISTS servers (
      id SERIAL PRIMARY KEY,
      name TEXT,
      owner_id INTEGER,
      created_at BIGINT
    )`);
    await query(`CREATE TABLE IF NOT EXISTS server_members (
      id SERIAL PRIMARY KEY,
      server_id INTEGER,
      user_id INTEGER,
      joined_at BIGINT
    )`);
    await query(`CREATE TABLE IF NOT EXISTS channels (
      id SERIAL PRIMARY KEY,
      server_id INTEGER,
      name TEXT,
      type TEXT DEFAULT 'text',
      created_at BIGINT
    )`);
    await query(`CREATE TABLE IF NOT EXISTS server_invites (
      id SERIAL PRIMARY KEY,
      server_id INTEGER,
      invite_code TEXT UNIQUE,
      created_by INTEGER,
      created_at BIGINT,
      expires_at BIGINT
    )`);
    await query(`CREATE TABLE IF NOT EXISTS channel_messages (
      id SERIAL PRIMARY KEY,
      channel_id INTEGER,
      user_id INTEGER,
      content TEXT,
      created_at BIGINT
    )`);
  }

  init().catch(console.error);

  module.exports = {
    async get(sql, params = []) {
      const res = await query(sql, params);
      return res.rows[0] || null;
    },
    async all(sql, params = []) {
      const res = await query(sql, params);
      return res.rows || [];
    },
    async run(sql, params = []) {
      const trimmed = sql.trim().toUpperCase();
      // For INSERTs, try to return inserted id
      if (trimmed.startsWith('INSERT') && !/RETURNING\s+/i.test(sql)) {
        const q = convertQuestionToDollar(sql + ' RETURNING id');
        const res = await pool.query(q, params);
        return { lastInsertRowid: res.rows[0] && res.rows[0].id };
      }
      const res = await query(sql, params);
      return { rowCount: res.rowCount };
    },
    // expose raw pool for migrations/tools if needed
    _pool: pool
  };

} else {
  // SQLite mode (synchronous API wrapped as async)
  const Database = require('better-sqlite3');
  const db = new Database('./data.sqlite');

  function init() {
    db.prepare(
      `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT
      )`
    ).run();

    db.prepare(
      `CREATE TABLE IF NOT EXISTS friends (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        requester INTEGER,
        addressee INTEGER,
        status TEXT
      )`
    ).run();

    db.prepare(
      `CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_id INTEGER,
        to_id INTEGER,
        content TEXT,
        created_at INTEGER
      )`
    ).run();

    db.prepare(
      `CREATE TABLE IF NOT EXISTS servers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        owner_id INTEGER,
        created_at INTEGER
      )`
    ).run();

    db.prepare(
      `CREATE TABLE IF NOT EXISTS server_members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        server_id INTEGER,
        user_id INTEGER,
        joined_at INTEGER
      )`
    ).run();

    db.prepare(
      `CREATE TABLE IF NOT EXISTS channels (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        server_id INTEGER,
        name TEXT,
        type TEXT DEFAULT 'text',
        created_at INTEGER
      )`
    ).run();

    db.prepare(
      `CREATE TABLE IF NOT EXISTS server_invites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        server_id INTEGER,
        invite_code TEXT UNIQUE,
        created_by INTEGER,
        created_at INTEGER,
        expires_at INTEGER
      )`
    ).run();

    db.prepare(
      `CREATE TABLE IF NOT EXISTS channel_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        channel_id INTEGER,
        user_id INTEGER,
        content TEXT,
        created_at INTEGER
      )`
    ).run();
  }

  init();

  module.exports = {
    async get(sql, params = []) { return db.prepare(sql).get(...params); },
    async all(sql, params = []) { return db.prepare(sql).all(...params); },
    async run(sql, params = []) { const info = db.prepare(sql).run(...params); return { lastInsertRowid: info.lastInsertRowid, changes: info.changes }; }
  };
}
