const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = path.join(__dirname, '..', 'data', 'gfd.db');

let db;

function getDb() {
  if (!db) {
    const fs = require('fs');
    const dataDir = path.join(__dirname, '..', 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initializeDb();
  }
  return db;
}

function initializeDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'scanner',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      date TEXT,
      location TEXT,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tables (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      table_number INTEGER NOT NULL,
      table_name TEXT,
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
      UNIQUE(event_id, table_number)
    );

    CREATE TABLE IF NOT EXISTS seats (
      id TEXT PRIMARY KEY,
      table_id TEXT NOT NULL,
      seat_number INTEGER NOT NULL,
      seat_type TEXT NOT NULL CHECK(seat_type IN ('student', 'executive')),
      participant_id TEXT,
      FOREIGN KEY (table_id) REFERENCES tables(id) ON DELETE CASCADE,
      FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE SET NULL,
      UNIQUE(table_id, seat_number)
    );

    CREATE TABLE IF NOT EXISTS participants (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      ticket_code TEXT UNIQUE NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      email TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'student' CHECK(role IN ('student', 'executive')),
      table_id TEXT,
      seat_id TEXT,
      checked_in INTEGER DEFAULT 0,
      checked_in_at DATETIME,
      checked_in_by TEXT,
      ticket_sent INTEGER DEFAULT 0,
      ticket_sent_at DATETIME,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
      FOREIGN KEY (table_id) REFERENCES tables(id) ON DELETE SET NULL,
      FOREIGN KEY (checked_in_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS check_in_log (
      id TEXT PRIMARY KEY,
      participant_id TEXT NOT NULL,
      action TEXT NOT NULL CHECK(action IN ('check_in', 'check_out')),
      scanned_by TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE CASCADE,
      FOREIGN KEY (scanned_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS email_config (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      smtp_host TEXT,
      smtp_port INTEGER DEFAULT 587,
      smtp_secure INTEGER DEFAULT 0,
      smtp_user TEXT,
      smtp_pass TEXT,
      from_name TEXT DEFAULT 'German Finance Dinner',
      from_email TEXT DEFAULT 'noreply@finance-network.co',
      reply_to TEXT DEFAULT 'participants@finance-network.co'
    );
  `);

  // Create default admin if not exists
  const adminExists = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
  if (!adminExists) {
    const hash = bcrypt.hashSync('admin', 10);
    db.prepare('INSERT INTO users (id, username, password_hash, display_name, role) VALUES (?, ?, ?, ?, ?)').run(
      uuidv4(), 'admin', hash, 'Administrator', 'admin'
    );
  }

  // Create default event if not exists
  const eventExists = db.prepare('SELECT id FROM events LIMIT 1').get();
  if (!eventExists) {
    const eventId = uuidv4();
    db.prepare('INSERT INTO events (id, name, date, location) VALUES (?, ?, ?, ?)').run(
      eventId, 'German Finance Dinner 2026', '2026-06-15', 'TBD'
    );

    // Create 12 tables with seating pattern: S S E S S E S S E
    const seatPattern = ['student', 'student', 'executive', 'student', 'student', 'executive', 'student', 'student', 'executive'];

    for (let t = 1; t <= 12; t++) {
      const tableId = uuidv4();
      db.prepare('INSERT INTO tables (id, event_id, table_number, table_name) VALUES (?, ?, ?, ?)').run(
        tableId, eventId, t, `Tisch ${t}`
      );

      for (let s = 1; s <= 9; s++) {
        db.prepare('INSERT INTO seats (id, table_id, seat_number, seat_type) VALUES (?, ?, ?, ?)').run(
          uuidv4(), tableId, s, seatPattern[s - 1]
        );
      }
    }
  }

  // Ensure email config row exists
  const emailConf = db.prepare('SELECT id FROM email_config WHERE id = 1').get();
  if (!emailConf) {
    db.prepare('INSERT INTO email_config (id) VALUES (1)').run();
  }
}

module.exports = { getDb };
