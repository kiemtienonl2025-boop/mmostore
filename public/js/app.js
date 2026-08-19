async function api(path, opts = {}) {
  const res = await fetch('/api' + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Có lỗi xảy ra.');
  return data;
}

function fmtMoney(n) {
  return Number(n).toLocaleString('vi-VN') + '₫';
}

function showMsg(el, text, type) {
  el.textContent = text;
  el.className = 'msg ' + type;
  el.style.display = 'block';
}

// Fills the wallet pill in the topbar and returns the current user (or null).
async function mountTopbar() {
  const pill = document.getElementById('walletPill');
  try {
    const { user } = await api('/auth/me');
    if (pill) {
      pill.innerHTML = user
        ? `<span class="dot"></span> ${fmtMoney(user.balance)}`
        : `<span class="dot" style="background:#9a99a6"></span> Đăng nhập`;
      pill.onclick = () => { window.location.href = user ? '/account.html' : '/login.html'; };
    }
    return user;
  } catch {
    return null;
  }
}

function mountBottomNav(active) {
  const nav = document.getElementById('bottomNav');
  if (!nav) return;
  const items = [
    { id: 'home', icon: '🏠', label: 'Trang chủ', href: '/index.html' },
    { id: 'orders', icon: '📦', label: 'Đơn hàng', href: '/orders.html' },
    { id: 'account', icon: '👤', label: 'Tài khoản', href: '/account.html' },
  ];
  nav.innerHTML = items.map(i => `
    <div class="nav-item ${i.id === active ? 'active' : ''}" onclick="window.location.href='${i.href}'">
      <span class="nav-ic">${i.icon}</span>${i.label}
    </div>
  `).join('');
}
