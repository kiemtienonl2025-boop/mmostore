const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const db = new Database(path.join(__dirname, 'data.db'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer',
  balance INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  price INTEGER NOT NULL,
  old_price INTEGER,
  stock INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  product_name TEXT NOT NULL,
  price INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);
`);

// Seed an admin account on first run only.
const adminExists = db.prepare('SELECT id FROM users WHERE role = ?').get('admin');
if (!adminExists) {
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare('INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)')
    .run('admin@protube.store', hash, 'admin');
  console.log('>> Da tao tai khoan admin mac dinh: admin@protube.store / admin123');
  console.log('>> HAY DOI MAT KHAU NAY NGAY SAU KHI DANG NHAP LAN DAU.');
}

// Seed sample products on first run only.
const productCount = db.prepare('SELECT COUNT(*) AS c FROM products').get().c;
if (productCount === 0) {
  const insert = db.prepare(
    'INSERT INTO products (name, category, description, price, old_price, stock, active) VALUES (?, ?, ?, ?, ?, ?, 1)'
  );
  insert.run('YouTube Premium riêng - 1 tháng', 'rieng', 'Tài khoản độc lập, đổi được mật khẩu, full quyền.', 39000, 65000, 50);
  insert.run('Slot gói Family - 1 tháng', 'family', 'Mời qua email của bạn, giữ nguyên tài khoản Google.', 19000, 32000, 50);
  insert.run('Nâng cấp email có sẵn', 'nangcap', 'Gửi email của bạn, kích hoạt Premium trực tiếp lên đó.', 22000, 35000, 50);
  insert.run('YouTube Music - 1 tháng', 'music', 'Nghe nhạc không quảng cáo, tải offline.', 15000, 25000, 50);
}

module.exports = db;
