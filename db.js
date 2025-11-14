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
}

init();

module.exports = db;
