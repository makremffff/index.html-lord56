// ====== CONSTANTS (مطابقة للباكند) ======
const AD_REWARD = 0.00005; // USDT
const DAILY_MAX_ADS = 300;
const COOLDOWN_SEC = 30;
const POINTS_TO_USDT_RATE = 100000; // 100k pts = 0.01 USDT
const MIN_WITHDRAW = 0.03;

// ====== HELPERS ======
function getTelegramUserID() {
  if (window.Telegram?.WebApp?.initDataUnsafe?.user?.id) {
    return window.Telegram.WebApp.initDataUnsafe.user.id;
  }
  // خارج التليجرام: fallback
  const params = new URLSearchParams(location.search);
  return params.get('startapp')?.replace('ref_', '') || 'demo_' + Math.random().toString(36).slice(2);
}

function getRefParam() {
  const p = new URLSearchParams(location.search);
  return p.get('startapp')?.replace('ref_', '') || null;
}

// ====== API CALLER ======
async function api(action, params = {}) {
  const res = await fetch('/api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...params })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'API error');
  return data;
}

// ====== CORE LOGIC ======
async function registerUser() {
  const userId = getTelegramUserID();
  const refBy = getRefParam();
  await api('registerUser', { userId, refBy });
}

async function getProfile() {
  const userId = getTelegramUserID();
  return await api('getProfile', { userId });
}

function updateUI(data) {
  const el = id => document.getElementById(id);
  if (el('points')) el('points').textContent = data.points;
  if (el('usdt')) el('usdt').textContent = data.usdt.toFixed(2);
  if (el('ton')) el('ton').textContent = data.ton?.toFixed(2) || '0.00';
  if (el('refCount')) el('refCount').textContent = data.refs;
  if (el('refLinkDisplay')) {
    const bot = (window.Telegram?.WebApp?.initDataUnsafe?.query_id) ? 'Game_win_usdtBot' : 'Game_win_usdtBot';
    el('refLinkDisplay').textContent = `https://t.me/${bot}/earn?startapp=ref_${getTelegramUserID()}`;
  }
  updateAdButton(data);
}

function updateAdButton(data) {
  const btn = document.getElementById('taskAdsBtn');
  const count = document.getElementById('taskAdsCount');
  const timer = document.getElementById('taskAdsTimer');
  if (!btn || !count || !timer) return;

  count.textContent = `${data.ads_watched_today}/${DAILY_MAX_ADS}`;
  if (data.remaining_cooldown_sec > 0) {
    btn.disabled = true;
    btn.textContent = 'Wait...';
    let s = data.remaining_cooldown_sec;
    timer.style.display = 'inline';
    const iv = setInterval(() => {
      timer.textContent = `(${s}s)`;
      if (--s < 0) {
        clearInterval(iv);
        timer.style.display = 'none';
        btn.disabled = false;
        btn.textContent = 'Watch Ad';
      }
    }, 1000);
  } else {
    btn.disabled = false;
    btn.textContent = 'Watch Ad';
    timer.style.display = 'none';
  }
}

// ====== BUTTONS SETUP ======
function setupButtons() {
  // تبديل الصفحات
  document.querySelectorAll('[data-page-target]').forEach(el => {
    el.onclick = () => {
      const target = el.dataset.pageTarget;
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      document.getElementById(target)?.classList.add('active');
    };
  });

  // أزرار مخصصة
  const UI = {
    adsBtn: document.getElementById('adsBtn'),
    taskAdsBtn: document.getElementById('taskAdsBtn'),
    convertBtn: document.getElementById('convertBtn'),
    withdrawButton: document.getElementById('withdrawButton'),
    copyBtn: document.getElementById('copyBtn'),
    addTonTaskBtn: document.getElementById('addTonTaskBtn'),
    connectWallet: document.getElementById('connectWallet'),
    depositBtn: document.getElementById('deposit-btn')
  };

  if (UI.adsBtn) UI.adsBtn.onclick = handleAds;
  if (UI.taskAdsBtn) UI.taskAdsBtn.onclick = handleDailyAd;
  if (UI.convertBtn) UI.convertBtn.onclick = handleSwap;
  if (UI.withdrawButton) UI.withdrawButton.onclick = handleWithdraw;
  if (UI.copyBtn) UI.copyBtn.onclick = handleCopy;
  if (UI.addTonTaskBtn) UI.addTonTaskBtn.onclick = handleAddTask;
  if (UI.connectWallet) UI.connectWallet.onclick = handleConnectWallet;
  if (UI.depositBtn) UI.depositBtn.onclick = handleDepositTON;
}

// ====== HANDLERS ======
async function handleAds() {
  // إعلانات Gigapub
  if (window.showGigaAd) {
    window.showGigaAd({ onReward: async () => {
      const userId = getTelegramUserID();
      const data = await api('adWatch', { userId, type: 'giga' });
      updateUI(data);
      showNotif('✅ تمت المكافأة!');
    }});
  }
}

async function handleDailyAd() {
  const userId = getTelegramUserID();
  const data = await api('adWatch', { userId, type: 'daily' });
  updateUI(data);
  showNotif('✅ +0.00005 USDT');
}

async function handleSwap() {
  const pts = parseInt(document.getElementById('pointsInput').value) || 0;
  if (pts < POINTS_TO_USDT_RATE) return showSwapMsg('Minimum 100,000 pts', 'error');
  const userId = getTelegramUserID();
  const data = await api('swap', { userId, points: pts });
  updateUI(data);
  showSwapMsg('✅ Success', 'success');
}

async function handleWithdraw() {
  const amount = parseFloat(document.getElementById('withdrawAmount').value) || 0;
  const binanceUID = document.getElementById('binanceUID').value.trim();
  if (amount < MIN_WITHDRAW) return showWithdrawMsg('Minimum 0.03 USDT', 'error');
  if (!/^\d{8,10}$/.test(binanceUID)) return showWithdrawMsg('Invalid UID (8-10 digits)', 'error');
  const userId = getTelegramUserID();
  await api('withdraw', { userId, amount, binanceUID });
  const data = await getProfile();
  updateUI(data);
  showWithdrawMsg('✅ Withdrawal requested', 'success');
}

function handleCopy() {
  const link = document.getElementById('refLinkDisplay').textContent;
  navigator.clipboard.writeText(link);
  const msg = document.getElementById('copyMsg');
  msg.style.opacity = 1;
  setTimeout(() => msg.style.opacity = 0, 2000);
}

async function handleAddTask() {
  const link = document.getElementById('taskLink').value.trim();
  const users = parseInt(document.getElementById('targetUsers').value) || 100;
  if (!link.includes('t.me/')) return showAddTaskMsg('Invalid link', 'error');
  const userId = getTelegramUserID();
  await api('addTask', { userId, link, users });
  showAddTaskMsg('✅ Task added', 'success');
}

async function handleConnectWallet() {
  if (!window.tonconnect) return alert('TON Connect not found');
  const wallet = await window.tonconnect.connect();
  document.getElementById('walletStatus').textContent = 'Connected';
  document.getElementById('walletAddress').textContent = wallet.account.address;
  document.getElementById('walletAddress').style.display = 'block';
}

async function handleDepositTON() {
  const wallet = window.tonconnect?.account?.address;
  if (!wallet) return alert('Connect wallet first');
  const amount = prompt('Amount TON to deposit:');
  if (!amount || isNaN(amount) || +amount <= 0) return;
  const userId = getTelegramUserID();
  await api('depositTON', { userId, amount });
  const data = await getProfile();
  updateUI(data);
  showTonDepositMsg('✅ Deposited', 'success');
}

// ====== UI HELPERS ======
function showNotif(txt) {
  const bar = document.getElementById('notifBar');
  bar.textContent = txt;
  bar.style.display = 'block';
  setTimeout(() => bar.style.display = 'none', 3000);
}
function showSwapMsg(txt, type) { showMsg('swapMsg', txt, type); }
function showWithdrawMsg(txt, type) { showMsg('withdrawMsg', txt, type); }
function showAddTaskMsg(txt, type) { showMsg('addTaskMsg', txt, type); }
function showTonDepositMsg(txt, type) { showMsg('tonDepositMsg', txt, type); }
function showMsg(id, txt, type) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = txt;
  el.className = type === 'error' ? 'error' : 'success';
  el.style.opacity = 1;
  setTimeout(() => el.style.opacity = 0, 3000);
}

// ====== INIT ======
async function init() {
  try {
    await registerUser();
    const data = await getProfile();
    updateUI(data);
    setupButtons();
    document.getElementById('loaderOverlay').style.display = 'none';
  } catch (e) {
    console.error(e);
    document.getElementById('loaderOverlay').innerHTML = '<div class="loader-text">Load failed</div>';
  }
}

init();
