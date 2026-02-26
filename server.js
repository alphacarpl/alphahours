const express = require('express');
const Database = require('better-sqlite3');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || './data/worklog.db';

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    client TEXT DEFAULT '',
    color TEXT DEFAULT '#00e5a0',
    archived INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS entries (
    id TEXT PRIMARY KEY,
    employee TEXT NOT NULL,
    date TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    break_min INTEGER DEFAULT 0,
    minutes INTEGER NOT NULL,
    note TEXT DEFAULT '',
    categories TEXT DEFAULT '["development"]',
    project_id TEXT DEFAULT NULL,
    timeline_content TEXT DEFAULT NULL,
    timeline_filename TEXT DEFAULT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_entries_date ON entries(date);
  CREATE INDEX IF NOT EXISTS idx_entries_employee ON entries(employee);
  CREATE INDEX IF NOT EXISTS idx_entries_project ON entries(project_id);
`);

// Add timeline columns if upgrading from older schema
try { db.exec('ALTER TABLE entries ADD COLUMN timeline_content TEXT DEFAULT NULL'); } catch {}
try { db.exec('ALTER TABLE entries ADD COLUMN timeline_filename TEXT DEFAULT NULL'); } catch {}

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── PROJECTS ──
app.get('/api/projects', (req, res) => {
  const rows = db.prepare('SELECT * FROM projects ORDER BY name').all();
  res.json(rows.map(r => ({ ...r, archived: !!r.archived })));
});

app.post('/api/projects', (req, res) => {
  const { id, name, client, color } = req.body;
  if (!name) return res.status(400).json({ error: 'Nazwa projektu jest wymagana' });
  const pid = id || Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  db.prepare('INSERT INTO projects (id, name, client, color) VALUES (?, ?, ?, ?)').run(pid, name, client || '', color || '#00e5a0');
  res.json({ id: pid, name, client: client || '', color: color || '#00e5a0', archived: false });
});

app.put('/api/projects/:id', (req, res) => {
  const { name, client, color, archived } = req.body;
  db.prepare('UPDATE projects SET name=?, client=?, color=?, archived=?, updated_at=datetime("now") WHERE id=?')
    .run(name, client || '', color || '#00e5a0', archived ? 1 : 0, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/projects/:id', (req, res) => {
  db.prepare('DELETE FROM projects WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ── ENTRIES ──
app.get('/api/entries', (req, res) => {
  const { employee, month, project_id } = req.query;
  let sql = `SELECT e.*, p.name as project_name, p.color as project_color, p.client as project_client
             FROM entries e LEFT JOIN projects p ON e.project_id = p.id WHERE 1=1`;
  const params = [];
  if (employee) { sql += ' AND e.employee LIKE ?'; params.push(`%${employee}%`); }
  if (month) { sql += ' AND e.date LIKE ?'; params.push(`${month}%`); }
  if (project_id) { sql += ' AND e.project_id = ?'; params.push(project_id); }
  sql += ' ORDER BY e.date DESC, e.start_time DESC';
  const rows = db.prepare(sql).all(...params);
  res.json(rows.map(r => ({ ...r, categories: JSON.parse(r.categories || '[]') })));
});

app.post('/api/entries', (req, res) => {
  const { employee, date, start_time, end_time, break_min, minutes, note, categories, project_id, timeline_content, timeline_filename } = req.body;
  if (!employee || !date || !start_time || !end_time) return res.status(400).json({ error: 'Brakuje wymaganych pól' });
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  db.prepare(`INSERT INTO entries (id, employee, date, start_time, end_time, break_min, minutes, note, categories, project_id, timeline_content, timeline_filename)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, employee, date, start_time, end_time, break_min || 0, minutes, note || '', JSON.stringify(categories || []), project_id || null, timeline_content || null, timeline_filename || null);
  res.json({ id });
});

app.put('/api/entries/:id', (req, res) => {
  const { employee, date, start_time, end_time, break_min, minutes, note, categories, project_id, timeline_content, timeline_filename } = req.body;
  db.prepare(`UPDATE entries SET employee=?, date=?, start_time=?, end_time=?, break_min=?, minutes=?, note=?, categories=?, project_id=?, timeline_content=?, timeline_filename=?, updated_at=datetime('now')
              WHERE id=?`)
    .run(employee, date, start_time, end_time, break_min || 0, minutes, note || '', JSON.stringify(categories || []), project_id || null, timeline_content || null, timeline_filename || null, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/entries/:id', (req, res) => {
  db.prepare('DELETE FROM entries WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ── STATS ──
app.get('/api/stats', (req, res) => {
  const { month, employee } = req.query;
  let where = '1=1'; const params = [];
  if (month) { where += ' AND date LIKE ?'; params.push(`${month}%`); }
  if (employee) { where += ' AND employee LIKE ?'; params.push(`%${employee}%`); }
  const total = db.prepare(`SELECT COALESCE(SUM(minutes),0) as total_min, COUNT(*) as total_entries, COUNT(DISTINCT date) as total_days, COUNT(DISTINCT employee) as total_employees FROM entries WHERE ${where}`).get(...params);
  const byEmployee = db.prepare(`SELECT employee, SUM(minutes) as mins, COUNT(*) as entries, COUNT(DISTINCT date) as days FROM entries WHERE ${where} GROUP BY employee ORDER BY mins DESC`).all(...params);
  const byDay = db.prepare(`SELECT date, SUM(minutes) as mins, COUNT(*) as entries FROM entries WHERE ${where} GROUP BY date ORDER BY date`).all(...params);
  res.json({ total, byEmployee, byDay });
});

// SPA fallback
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, '0.0.0.0', () => console.log(`✅ AlphaHours running on http://0.0.0.0:${PORT}`));
