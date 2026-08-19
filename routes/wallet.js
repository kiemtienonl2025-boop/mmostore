const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

/**
 * DEMO ONLY.
 * This instantly credits the user's wallet with no real payment check.
 * Before going live, replace this with a real integration:
 *   1) Call MoMo/ZaloPay/bank API to create a payment request, return the pay URL/QR to the client.
 *   2) The provider redirects the user to pay.
 *   3) The provider calls YOUR webhook (IPN) to confirm payment succeeded.
 *   4) Only inside that webhook handler do you credit the wallet — never on the client's say-so.
 * Leaving this demo route live in production lets anyone credit their own wallet for free.
 */
router.post('/topup-demo', requireAuth, (req, res) => {
  const amount = parseInt(req.body.amount, 10);
  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'Số tiền không hợp lệ.' });
  }
  db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(amount, req.session.user.id);
  const user = db.prepare('SELECT id, email, role, balance FROM users WHERE id = ?').get(req.session.user.id);
  res.json({ user });
});

module.exports = router;
