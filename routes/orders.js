const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Customer: buy a product using wallet balance
router.post('/', requireAuth, (req, res) => {
  const { product_id } = req.body;
  const product = db.prepare('SELECT * FROM products WHERE id = ? AND active = 1').get(product_id);
  if (!product) return res.status(404).json({ error: 'Sản phẩm không tồn tại.' });
  if (product.stock < 1) return res.status(400).json({ error: 'Sản phẩm đã hết hàng.' });

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.user.id);
  if (user.balance < product.price) {
    return res.status(400).json({ error: 'Số dư ví không đủ. Vui lòng nạp thêm tiền.' });
  }

  const tx = db.transaction(() => {
    db.prepare('UPDATE users SET balance = balance - ? WHERE id = ?').run(product.price, user.id);
    db.prepare('UPDATE products SET stock = stock - 1 WHERE id = ?').run(product.id);
    return db.prepare(
      'INSERT INTO orders (user_id, product_id, product_name, price, status) VALUES (?, ?, ?, ?, ?)'
    ).run(user.id, product.id, product.name, product.price, 'completed');
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
