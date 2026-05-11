require('dotenv').config();
const express = require('express');
const Database = require('better-sqlite3');
const cron = require('node-cron');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// ============ دیتابیس ============
const db = new Database('checks.db');

// ساخت جداول
db.exec(`
  CREATE TABLE IF NOT EXISTS checks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK(type IN ('دریافتی', 'پرداختی')),
    amount INTEGER NOT NULL,
    description TEXT,
    due_date TEXT NOT NULL,
    person TEXT NOT NULL,
    phone TEXT,
    status TEXT DEFAULT 'در انتظار' CHECK(status IN ('پرداخت شده', 'در انتظار', 'لغو شده')),
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    notify_days INTEGER DEFAULT 3
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

// ============ API ها ============

// ثبت چک جدید
app.post('/api/checks', (req, res) => {
  const { type, amount, description, due_date, person, phone, notify_days } = req.body;
  
  if (!type || !amount || !due_date || !person) {
    return res.status(400).json({ error: 'فیلدهای اجباری تکمیل نشده' });
  }
  
  try {
    const stmt = db.prepare(`
      INSERT INTO checks (type, amount, description, due_date, person, phone, notify_days)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(type, amount, description, due_date, person, phone, notify_days || 3);
    
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// دریافت همه چک‌ها
app.get('/api/checks', (req, res) => {
  const { status, type, search } = req.query;
  let query = 'SELECT * FROM checks WHERE 1=1';
  const params = [];
  
  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }
  if (type) {
    query += ' AND type = ?';
    params.push(type);
  }
  if (search) {
    query += ' AND (person LIKE ? OR description LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }
  
  query += ' ORDER BY due_date ASC';
  
  const checks = db.prepare(query).all(...params);
  res.json(checks);
});

// دریافت یک چک
app.get('/api/checks/:id', (req, res) => {
  const { id } = req.params;
  const check = db.prepare('SELECT * FROM checks WHERE id = ?').get(id);
  
  if (!check) {
    return res.status(404).json({ error: 'چک یافت نشد' });
  }
  
  res.json(check);
});

// بروزرسانی چک
app.patch('/api/checks/:id', (req, res) => {
  const { id } = req.params;
  const { status, amount, description, due_date, person, phone, type } = req.body;
  
  try {
    const check = db.prepare('SELECT * FROM checks WHERE id = ?').get(id);
    if (!check) {
      return res.status(404).json({ error: 'چک یافت نشد' });
    }
    
    const stmt = db.prepare(`
      UPDATE checks SET 
        status = COALESCE(?, status),
        amount = COALESCE(?, amount),
        description = COALESCE(?, description),
        due_date = COALESCE(?, due_date),
        person = COALESCE(?, person),
        phone = COALESCE(?, phone),
        type = COALESCE(?, type)
      WHERE id = ?
    `);
    stmt.run(status, amount, description, due_date, person, phone, type, id);
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// حذف چک
app.delete('/api/checks/:id', (req, res) => {
  const { id } = req.params;
  
  try {
    db.prepare('DELETE FROM checks WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// آمار
app.get('/api/stats', (req, res) => {
  const total = db.prepare('SELECT SUM(amount) as total FROM checks WHERE status = "در انتظار"').get();
  const received = db.prepare('SELECT SUM(amount) as total FROM checks WHERE type = "دریافتی" AND status = "در انتظار"').get();
  const paid = db.prepare('SELECT SUM(amount) as total FROM checks WHERE type = "پرداختی" AND status = "در انتظار"').get();
  const today = new Date().toISOString().split('T')[0];
  const todayChecks = db.prepare('SELECT COUNT(*) as count FROM checks WHERE due_date = ? AND status = "در انتظار"').get(today);
  const allChecks = db.prepare('SELECT COUNT(*) as count FROM checks').get();
  const pendingChecks = db.prepare('SELECT COUNT(*) as count FROM checks WHERE status = "در انتظار"').get();
  
  res.json({
    totalPending: total.total || 0,
    totalReceived: received.total || 0,
    totalPaid: paid.total || 0,
    todayChecks: todayChecks.count,
    totalChecks: allChecks.count,
    pendingChecks: pendingChecks.count
  });
});

// چک‌های امروز
app.get('/api/checks/today/all', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const checks = db.prepare('SELECT * FROM checks WHERE due_date = ? AND status = "در انتظار" ORDER BY amount DESC').all(today);
  res.json(checks);
});

// چک‌های آینده
app.get('/api/checks/upcoming', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const checks = db.prepare('SELECT * FROM checks WHERE due_date > ? AND status = "در انتظار" ORDER BY due_date ASC').all(today);
  res.json(checks);
});

// ============ یادآور خودکار ============
cron.schedule('0 8 * * *', () => {
  // هر روز ساعت 8 صبح
  const today = new Date();
  const notifyDate = new Date(today);
  notifyDate.setDate(notifyDate.getDate() + 3);
  
  const checks = db.prepare(`
    SELECT * FROM checks 
    WHERE status = 'در انتظار' 
    AND due_date <= ?
  `).all(notifyDate.toISOString().split('T')[0]);
  
  if (checks.length > 0) {
    console.log(`🔔 ${checks.length} چک یادآور داری`);
  }
});

// شروع سرور
app.listen(PORT, () => {
  console.log(`✅ سرور روی پورت ${PORT} اجرا شد`);
  console.log(`🌐 وب: http://localhost:${PORT}`);
});

module.exports = app;