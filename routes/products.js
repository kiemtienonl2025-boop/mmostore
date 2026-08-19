const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Public: list active products (or all, for admin panel, via ?all=1)
router.get('/', (req, res) => {
  const showAll = req.query.all === '1' && req.session.user && req.session.user.role === 'admin';
  const rows = showAll
    ? db.prepare('SELECT * FROM products ORDER BY id DESC').all()
    : db.prepare('SELECT * FROM products WHERE active = 1 ORDER BY id DESC').all();
  res.json({ products: rows });
});

// Admin: create product
router.post('/', requireAdmin, (req, res) => {
  const { name, category, description, price, old_price, stock } = req.body;
  if (!name || !category || !price) {
    return res.status(400).json({ error: 'Thiếu tên, danh mục hoặc giá.' });
  }
  const info = db.prepare(
    'INSERT INTO products (name, category, description, price, old_price, stock, active) VALUES (?, ?, ?, ?, ?, ?, 1)'
  ).run(name, category, description || '', price, old_price || null, stock || 0);
  res.json({ product: db.prepare('SELECT * FROM products WHERE id = ?').get(info.lastInsertRowid) });
});

// Admin: update product
router.put('/:id', requireAdmin, (req, res) => {
  const { name, category, description, price, old_price, stock, active } = req.body;
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Không tìm thấy sản phẩm.' });

  db.prepare(
    `UPDATE products SET name=?, category=?, description=?, price=?, old_price=?, stock=?, active=? WHERE id=?`
  ).run(
    name ?? existing.name,
    category ?? existing.category,
    description ?? existing.description,
    price ?? existing.price,
    old_price ?? existing.old_price,
    stock ?? existing.stock,
    active === undefined ? existing.active : (active ? 1 : 0),
    req.params.id
  );
  res.json({ product: db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id) });
});

// Admin: delete product
router.delete('/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
