require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const Database = require('better-sqlite3');

const TOKEN = process.env.TELEGRAM_TOKEN;

if (!TOKEN) {
  console.log('❌ توکن تلگرام تنظیم نشده');
  console.log('لطفا فایل .env رو بساز و TELEGRAM_TOKEN رو تنظیم کن');
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });
const db = new Database('checks.db');

console.log('🤖 بات تلگرام فعال شد');


// ============ کیبورد اصلی ============
const mainKeyboard = {
  reply_markup: {
    keyboard: [
      ['📋 لیست کامل چک‌ها', '📥 چک‌های دریافتی'],
      ['📤 چک‌های پرداختی', '📅 چک‌های امروز'],
      ['📆 چک‌های آینده', '➕ افزودن چک'],
      ['📊 آمار کلی']
    ]
  }
};

// ============ دستورات ============
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const name = msg.from.first_name || 'دوست';
  
  bot.sendMessage(chatId, 
    `🎉 سلام ${name}! به سیستم مدیریت چک خوش اومدی!

می‌تونی از دکمه‌های پایین استفاده کنی یا دستور بزنی:

/لیست - همه چک‌ها
/دریافتی - چک‌های دریافتی
/پرداختی - چک‌های پرداختی
/امروز - سررسید امروز
/آینده - چک‌های آینده
/آمار - آمار کلی
/افزودن - ثبت چک جدید`, 
    mainKeyboard
  );
});

// لیست کامل
bot.onText(/📋 لیست کامل چک‌ها/, (msg) => listChecks(msg.chat.id, 'all'));
bot.onText(/\/لیست/, (msg) => listChecks(msg.chat.id, 'all'));

// چک‌های دریافتی
bot.onText(/📥 چک‌های دریافتی/, (msg) => listChecks(msg.chat.id, 'دریافتی'));
bot.onText(/\/دریافتی/, (msg) => listChecks(msg.chat.id, 'دریافتی'));

// چک‌های پرداختی
bot.onText(/📤 چک‌های پرداختی/, (msg) => listChecks(msg.chat.id, 'پرداختی'));
bot.onText(/\/پرداختی/, (msg) => listChecks(msg.chat.id, 'پرداختی'));

// چک‌های امروز
bot.onText(/📅 چک‌های امروز/, (msg) => listChecks(msg.chat.id, 'today'));
bot.onText(/\/امروز/, (msg) => listChecks(msg.chat.id, 'today'));

// چک‌های آینده
bot.onText(/📆 چک‌های آینده/, (msg) => listChecks(msg.chat.id, 'upcoming'));
bot.onText(/\/آینده/, (msg) => listChecks(msg.chat.id, 'upcoming'));

// آمار
bot.onText(/📊 آمار کلی/, (msg) => showStats(msg.chat.id));
bot.onText(/\/آمار/, (msg) => showStats(msg.chat.id));

// افزودن چک
bot.onText(/➕ افزودن چک/, (msg) => {
  bot.sendMessage(msg.chat.id, '➕ برای ثبت چک جدید، اطلاعات رو به این فرمت بفرست:

نوع|مبلغ|نام شخص|تاریخ سررسید|توضیحات

مثال:
دریافتی|5000000|علی محمدی|1404/02/15|بابت فروش کالا', {
    reply_markup: {
      keyboard: [['📋 لیست کامل چک‌ها'], ['🔙 منوی اصلی']]
    }
  });
});
bot.onText(/\/افزودن/, (msg) => {
  bot.sendMessage(msg.chat.id, '➕ برای ثبت چک جدید، اطلاعات رو به این فرمت بفرست:

نوع|مبلغ|نام شخص|تاریخ سررسید|توضیحات

مثال:
دریافتی|5000000|علی محمدی|1404/02/15|بابت فروش کالا');
});

// منوی اصلی
bot.onText(/🔙 منوی اصلی/, (msg) => {
  bot.sendMessage(msg.chat.id, 'منوی اصلی:', mainKeyboard);
});

// ============ توابع کمکی ============

function listChecks(chatId, type) {
  let checks, title;
  const today = new Date().toISOString().split('T')[0];
  
  switch(type) {
    case 'دریافتی':
      checks = db.prepare('SELECT * FROM checks WHERE type = "دریافتی" ORDER BY due_date ASC').all();
      title = '📥 چک‌های دریافتی:';
      break;
    case 'پرداختی':
      checks = db.prepare('SELECT * FROM checks WHERE type = "پرداختی" ORDER BY due_date ASC').all();
      title = '📤 چک‌های پرداختی:';
      break;
    case 'today':
      checks = db.prepare('SELECT * FROM checks WHERE due_date = ? AND status = "در انتظار" ORDER BY amount DESC').all(today);
      title = `📅 چک‌های سررسید امروز (${today}):`;
      break;
    case 'upcoming':
      checks = db.prepare('SELECT * FROM checks WHERE due_date > ? AND status = "در انتظار" ORDER BY due_date ASC').all(today);
      title = '📆 چک‌های آینده:';
      break;
    default:
      checks = db.prepare('SELECT * FROM checks ORDER BY due_date ASC').all();
      title = '📋 لیست کامل چک‌ها:';
  }
  
  if (checks.length === 0) {
    return bot.sendMessage(chatId, '❌ چکی یافت نشد');
  }
  
  let text = title + '\n\n';
  checks.forEach(c => {
    const icon = c.type === 'دریافتی' ? '📥' : '📤';
    const status = c.status === 'پرداخت شده' ? '✅' : '⏳';
    text += `${icon} ${c.amount.toLocaleString()} تومان - ${c.person}\n`;
    text += `   📅 ${c.due_date} ${status}\n`;
    if (c.description) text += `   📝 ${c.description}\n`;
    text += `   /پرداخت_${c.id}\n\n`;
  });
  
  const total = checks.reduce((sum, c) => sum + c.amount, 0);
  text += `💰 جمع: ${total.toLocaleString()} تومان`;
  
  bot.sendMessage(chatId, text, {
    reply_markup: {
      keyboard: [['📋 لیست کامل چک‌ها'], ['🔙 منوی اصلی']]
    }
  });
}

function showStats(chatId) {
  const total = db.prepare('SELECT SUM(amount) as total FROM checks WHERE status = "در انتظار"').get();
  const received = db.prepare('SELECT SUM(amount) as total FROM checks WHERE type = "دریافتی" AND status = "در انتظار"').get();
  const paid = db.prepare('SELECT SUM(amount) as total FROM checks WHERE type = "پرداختی" AND status = "در انتظار"').get();
  const today = new Date().toISOString().split('T')[0];
  const todayChecks = db.prepare('SELECT COUNT(*) as count, SUM(amount) as total FROM checks WHERE due_date = ? AND status = "در انتظار"').get(today);
  const allChecks = db.prepare('SELECT COUNT(*) as count FROM checks').get();
  const paidChecks = db.prepare('SELECT COUNT(*) as count FROM checks WHERE status = "پرداخت شده"').get();
  
  const text = `📊 آمار کلی:

💵 کل در انتظار: ${(total.total || 0).toLocaleString()} تومان
📥 دریافتی: ${(received.total || 0).toLocaleString()} تومان
📤 پرداختی: ${(paid.total || 0).toLocaleString()} تومان

📅 سررسید امروز: ${todayChecks.count || 0} چک (${(todayChecks.total || 0).toLocaleString()} تومان)

📋 کل چک‌ها: ${allChecks.count}
✅ پرداخت شده: ${paidChecks.count}`;
  
  bot.sendMessage(chatId, text, mainKeyboard);
}

// ============ پاسخ به پیام‌های معمولی (برای ثبت چک) ============
bot.on('message', (msg) => {
  if (msg.text && msg.text.includes('|')) {
    const parts = msg.text.split('|').map(p => p.trim());
    
    if (parts.length >= 4) {
      const type = parts[0] === 'دریافتی' || parts[0] === 'پرداختی' ? parts[0] : null;
      const amount = parseInt(parts[1].replace(/,/g, ''));
      const person = parts[2];
      const due_date = parts[3];
      const description = parts[4] || '';
      
      if (type && amount && person && due_date) {
        try {
          db.prepare(`
            INSERT INTO checks (type, amount, description, due_date, person)
            VALUES (?, ?, ?, ?, ?)
          `).run(type, amount, description, due_date, person);
          
          bot.sendMessage(msg.chat.id, 
            `✅ چک ثبت شد!

${type === 'دریافتی' ? '📥' : '📤'} ${amount.toLocaleString()} تومان
👤 ${person}
📅 ${due_date}`,
            mainKeyboard
          );
        } catch (err) {
          bot.sendMessage(msg.chat.id, '❌ خطا در ثبت چک: ' + err.message);
        }
        return;
      }
    }
  }
  
  // پاسخ به دستور پرداخت
  if (msg.text && msg.text.startsWith('/پرداخت_')) {
    const id = msg.text.replace('/پرداخت_', '');
    try {
      db.prepare('UPDATE checks SET status = "پرداخت شده" WHERE id = ?').run(id);
      bot.sendMessage(msg.chat.id, '✅ چک به عنوان پرداخت شده علامت زده شد');
    } catch (err) {
      bot.sendMessage(msg.chat.id, '❌ خطا: ' + err.message);
    }
  }
});

console.log('✅ بات آماده دریافت پیام');