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
  db.prepare('DELETE FROM product_accounts WHERE product_id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Admin: list credential stock for a product (available + already delivered).
router.get('/:id/accounts', requireAdmin, (req, res) => {
  const rows = db.prepare(
    'SELECT * FROM product_accounts WHERE product_id = ? ORDER BY id DESC'
  ).all(req.params.id);
  res.json({ accounts: rows });
});

// Admin: bulk add credentials, one per line as "username:password" or "username:password:extra info".
router.post('/:id/accounts', requireAdmin, (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Không tìm thấy sản phẩm.' });

  const raw = (req.body.lines || '').trim();
  if (!raw) return res.status(400).json({ error: 'Chưa nhập tài khoản nào.' });

  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  const insert = db.prepare(
    'INSERT INTO product_accounts (product_id, username, password, extra_info) VALUES (?, ?, ?, ?)'
  );
  let added = 0;
  const tx = db.transaction(() => {
    for (const line of lines) {
      const parts = line.split(':');
      if (parts.length < 2) continue; // bỏ qua dòng sai định dạng
      const username = parts[0].trim();
      const password = parts[1].trim();
      const extra = parts.slice(2).join(':').trim() || null;
      if (!username || !password) continue;
      insert.run(product.id, username, password, extra);
      added++;
    }
    // Cập nhật tồn kho = số tài khoản chưa giao cho đơn nào.
    const available = db.prepare(
      'SELECT COUNT(*) AS c FROM product_accounts WHERE product_id = ? AND order_id IS NULL'
    ).get(product.id).c;
    db.prepare('UPDATE products SET stock = ? WHERE id = ?').run(available, product.id);
  });
  tx();

  res.json({ added, skipped: lines.length - added });
});

// Admin: delete a single unused credential (only if not yet delivered to a customer).
router.delete('/:id/accounts/:accId', requireAdmin, (req, res) => {
  const acc = db.prepare('SELECT * FROM product_accounts WHERE id = ? AND product_id = ?')
    .get(req.params.accId, req.params.id);
  if (!acc) return res.status(404).json({ error: 'Không tìm thấy tài khoản.' });
  if (acc.order_id) return res.status(400).json({ error: 'Tài khoản này đã giao cho khách, không thể xoá.' });

  db.prepare('DELETE FROM product_accounts WHERE id = ?').run(acc.id);
  const available = db.prepare(
    'SELECT COUNT(*) AS c FROM product_accounts WHERE product_id = ? AND order_id IS NULL'
  ).get(req.params.id).c;
  db.prepare('UPDATE products SET stock = ? WHERE id = ?').run(available, req.params.id);

  res.json({ ok: true });
});

module.exports = router;
