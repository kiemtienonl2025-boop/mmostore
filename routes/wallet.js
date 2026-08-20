const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// ---- Config: fill these in via environment variables before going live ----
const BANK_ACCOUNT_NUMBER = process.env.SEPAY_ACCOUNT_NUMBER || '0000000000';
const BANK_ACCOUNT_NAME = process.env.SEPAY_ACCOUNT_NAME || 'TEN CHU TAI KHOAN';
const BANK_CODE = process.env.SEPAY_BANK_CODE || 'MBBank'; // dùng mã ngân hàng VietQR, vd: MBBank, Vietcombank, ACB...
const SEPAY_API_KEY = process.env.SEPAY_API_KEY || ''; // lấy từ SePay khi tạo webhook kiểu "API Key"
const REF_PREFIX = process.env.TOPUP_REF_PREFIX || 'NAP';
// -----------------------------------------------------------------------

function generateRefCode() {
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase(); // 6 ky tu
  return `${REF_PREFIX}${rand}`;
}

/**
 * Bước 1 — Khách bấm "Nạp tiền": tạo một yêu cầu nạp với mã tham chiếu duy nhất,
 * trả về thông tin chuyển khoản + link ảnh QR (VietQR) để khách quét.
 * QUAN TRỌNG: khách phải giữ nguyên mã tham chiếu trong nội dung chuyển khoản,
 * vì hệ thống dùng đúng mã này để biết khoản tiền vào là của ai.
 */
router.post('/create-topup-request', requireAuth, (req, res) => {
  const amount = parseInt(req.body.amount, 10);
  if (!amount || amount < 1000) {
    return res.status(400).json({ error: 'Số tiền tối thiểu là 1.000₫.' });
  }

  let refCode;
  // Đảm bảo mã không trùng với yêu cầu đang chờ xử lý khác.
  do {
    refCode = generateRefCode();
  } while (db.prepare('SELECT id FROM topup_requests WHERE ref_code = ?').get(refCode));

  db.prepare(
    'INSERT INTO topup_requests (user_id, ref_code, amount, status) VALUES (?, ?, ?, ?)'
  ).run(req.session.user.id, refCode, amount, 'pending');

  const qrUrl = `https://img.vietqr.io/image/${encodeURIComponent(BANK_CODE)}-${encodeURIComponent(BANK_ACCOUNT_NUMBER)}-compact2.png` +
    `?amount=${amount}&addInfo=${encodeURIComponent(refCode)}&accountName=${encodeURIComponent(BANK_ACCOUNT_NAME)}`;

  res.json({
    refCode,
    amount,
    bankAccountNumber: BANK_ACCOUNT_NUMBER,
    bankAccountName: BANK_ACCOUNT_NAME,
    bankCode: BANK_CODE,
    qrUrl,
    note: `Chuyển khoản đúng số tiền và giữ nguyên nội dung "${refCode}". Ví sẽ tự cộng tiền sau khi ngân hàng báo có (thường vài giây đến vài phút).`,
  });
});

// Khách kiểm tra trạng thái yêu cầu nạp (để hiện "đang chờ" / "đã cộng tiền" trên giao diện).
router.get('/topup-status/:refCode', requireAuth, (req, res) => {
  const row = db.prepare(
    'SELECT * FROM topup_requests WHERE ref_code = ? AND user_id = ?'
  ).get(req.params.refCode, req.session.user.id);
  if (!row) return res.status(404).json({ error: 'Không tìm thấy yêu cầu nạp tiền.' });
  res.json({ status: row.status, amount: row.amount });
});

/**
 * Bước 2 — SePay gọi endpoint này mỗi khi tài khoản ngân hàng của bạn phát sinh giao dịch.
 * Cấu hình URL này trong SePay dưới dạng Webhook, kiểu xác thực "API Key".
 * SePay sẽ gửi header: Authorization: Apikey <SEPAY_API_KEY>
 */
router.post('/sepay-webhook', (req, res) => {
  // 1. Xác thực request thực sự đến từ SePay bằng API key.
  const authHeader = req.headers['authorization'] || '';
  const expected = `Apikey ${SEPAY_API_KEY}`;
  if (!SEPAY_API_KEY || authHeader !== expected) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  const payload = req.body;
  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({ success: false, message: 'No data' });
  }

  const {
    id: sepayId,
    transferType,
    transferAmount,
    content,
    description,
  } = payload;

  // 2. Chỉ xử lý tiền vào (transferType === 'in').
  if (transferType !== 'in') {
    return res.json({ success: true, message: 'Ignored (not an incoming transfer)' });
  }

  // 3. Chống xử lý trùng lặp nếu SePay gửi lại webhook (retry).
  const already = db.prepare('SELECT sepay_id FROM processed_webhook_ids WHERE sepay_id = ?').get(String(sepayId));
  if (already) {
    return res.json({ success: true, message: 'Already processed' });
  }

  // 4. Tìm mã tham chiếu (refCode) nằm trong nội dung chuyển khoản.
  const fullText = `${content || ''} ${description || ''}`.toUpperCase();
  const pending = db.prepare("SELECT * FROM topup_requests WHERE status = 'pending'").all();
  const match = pending.find(p => fullText.includes(p.ref_code.toUpperCase()));

  if (!match) {
    // Không khớp yêu cầu nào — vẫn trả 200 để SePay không retry, nhưng ghi log để bạn tự đối soát thủ công.
    console.warn('SePay webhook: khong tim thay ref code khop trong noi dung:', content);
    return res.json({ success: true, message: 'No matching topup request' });
  }

  // 5. Kiểm tra số tiền chuyển khớp với số tiền yêu cầu (chống chuyển thiếu).
  if (Number(transferAmount) < match.amount) {
    console.warn(`SePay webhook: so tien chuyen (${transferAmount}) it hon yeu cau (${match.amount}) cho ma ${match.ref_code}`);
    return res.json({ success: true, message: 'Amount mismatch, not credited' });
  }

  // 6. Mọi thứ khớp — cộng tiền vào ví và đánh dấu hoàn tất, trong một transaction.
  const tx = db.transaction(() => {
    db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(match.amount, match.user_id);
    db.prepare(
      "UPDATE topup_requests SET status = 'completed', matched_sepay_id = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).run(String(sepayId), match.id);
    db.prepare('INSERT INTO processed_webhook_ids (sepay_id) VALUES (?)').run(String(sepayId));
  });
  tx();

  res.json({ success: true, message: 'Credited' });
});

// Admin: xem tất cả yêu cầu nạp tiền (để đối soát thủ công nếu cần).
router.get('/topup-requests', requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT topup_requests.*, users.email AS user_email
    FROM topup_requests JOIN users ON users.id = topup_requests.user_id
    ORDER BY topup_requests.id DESC
    LIMIT 200
  `).all();
  res.json({ topups: rows });
});

module.exports = router;
