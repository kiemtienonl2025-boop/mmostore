const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Customer: buy a product using wallet balance
router.post('/', requireAuth, (req, res) => {
  const { product_id } = req.body;
  const product = db.prepare('SELECT * FROM products WHERE id = ? AND active = 1').get(product_id);
  if (!product) return res.status(404).json({ error: 'Sản phẩm không tồn tại.' });

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.user.id);
  if (user.balance < product.price) {
    return res.status(400).json({ error: 'Số dư ví không đủ. Vui lòng nạp thêm tiền.' });
  }

  // Tìm một tài khoản còn trống (chưa gán cho đơn nào) trong kho của sản phẩm này.
  const account = db.prepare(
    'SELECT * FROM product_accounts WHERE product_id = ? AND order_id IS NULL ORDER BY id ASC LIMIT 1'
  ).get(product.id);
  if (!account) {
    return res.status(400).json({ error: 'Sản phẩm đã hết hàng (admin chưa nạp thêm tài khoản).' });
  }

  const tx = db.transaction(() => {
    db.prepare('UPDATE users SET balance = balance - ? WHERE id = ?').run(product.price, user.id);

    const info = db.prepare(
      `INSERT INTO orders (user_id, product_id, product_name, price, status, account_username, account_password, account_extra_info)
       VALUES (?, ?, ?, ?, 'completed', ?, ?, ?)`
    ).run(user.id, product.id, product.name, product.price, account.username, account.password, account.extra_info);

    db.prepare('UPDATE product_accounts SET order_id = ? WHERE id = ?').run(info.lastInsertRowid, account.id);

    const remaining = db.prepare(
      'SELECT COUNT(*) AS c FROM product_accounts WHERE product_id = ? AND order_id IS NULL'
    ).get(product.id).c;
    db.prepare('UPDATE products SET stock = ? WHERE id = ?').run(remaining, product.id);

    return info;
  });
  const info = tx();
  res.json({ order: db.prepare('SELECT * FROM orders WHERE id = ?').get(info.lastInsertRowid) });
});

// Customer: my orders
router.get('/mine', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC').all(req.session.user.id);
  res.json({ orders: rows });
});

// Admin: all orders
router.get('/', requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT orders.*, users.email AS user_email
    FROM orders JOIN users ON users.id = orders.user_id
    ORDER BY orders.id DESC
  `).all();
  res.json({ orders: rows });
});

module.exports = router;
