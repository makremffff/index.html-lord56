// /api/index.js
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function supabaseFetch(path, options = {}) {
  const url = `${SUPABASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  const raw = await res.text();
  if (!res.ok) throw new Error(raw || 'Supabase error');
  if (!raw) return {};
  return JSON.parse(raw);
}

// ====== HELPERS ======
function todayYMD() {
  const d = new Date();
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
}

function secondsUntilEndOfDay() {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return Math.floor((end - now) / 1000);
}

// ====== ACTIONS ======
async function registerUser({ userId, refBy }) {
  // منع التكرار
  const exist = await supabaseFetch(`/rest/v1/users_data?user_id=eq.${userId}&select=user_id`);
  if (exist.length) return;

  await supabaseFetch('/rest/v1/users_data', {
    method: 'POST',
    body: JSON.stringify({
      user_id: userId,
      points: 0,
      usdt: 0,
      ton: 0,
      ref_by: refBy || null,
      refs: 0,
      ads_watched_today: 0,
      ads_last_watch: null,
      ads_date: todayYMD()
    })
  });

  if (refBy) {
    // زيادة refs للداعي
    const rows = await supabaseFetch(`/rest/v1/users_data?user_id=eq.${refBy}&select=refs`);
    if (rows.length) {
      const newRefs = rows[0].refs + 1;
      await supabaseFetch(`/rest/v1/users_data?user_id=eq.${refBy}`, {
        method: 'PATCH',
        body: JSON.stringify({ refs: newRefs })
      });
    }
  }
}

async function getProfile({ userId }) {
  let [row] = await supabaseFetch(`/rest/v1/users_data?user_id=eq.${userId}&select=*`);
  if (!row) throw new Error('User not found');

  // reset logic
  if (row.ads_date !== todayYMD()) {
    row.ads_watched_today = 0;
    row.ads_date = todayYMD();
    await supabaseFetch(`/rest/v1/users_data?user_id=eq.${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        ads_watched_today: 0,
        ads_date: todayYMD()
      })
    });
  }

  const last = row.ads_last_watch ? new Date(row.ads_last_watch) : null;
  const now = new Date();
  const cooldown = last ? Math.floor((now - last) / 1000) : COOLDOWN_SEC + 1;
  const remaining = Math.max(0, COOLDOWN_SEC - cooldown);
  const can = row.ads_watched_today < DAILY_MAX_ADS && remaining === 0;

  return {
    points: row.points,
    usdt: parseFloat(row.usdt),
    ton: parseFloat(row.ton),
    refs: row.refs,
    ads_watched_today: row.ads_watched_today,
    ads_last_watch: row.ads_last_watch,
    remaining_cooldown_sec: remaining,
    can_watch: can
  };
}

async function swap({ userId, points }) {
  const rate = POINTS_TO_USDT_RATE;
  if (points < rate) throw new Error('Insufficient points');
  const usdt = points / rate;
  const [row] = await supabaseFetch(`/rest/v1/users_data?user_id=eq.${userId}&select=points`);
  if (!row || row.points < points) throw new Error('Insufficient points');
  await supabaseFetch(`/rest/v1/users_data?user_id=eq.${userId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      points: row.points - points,
      usdt: parseFloat(row.usdt) + usdt
    })
  });
  return { usdt: parseFloat(row.usdt) + usdt, points: row.points - points };
}

async function adWatch({ userId, type }) {
  const [row] = await supabaseFetch(`/rest/v1/users_data?user_id=eq.${userId}&select=*`);
  if (!row) throw new Error('User not found');
  if (row.ads_date !== todayYMD()) {
    row.ads_watched_today = 0;
    row.ads_date = todayYMD();
  }
  if (row.ads_watched_today >= DAILY_MAX_ADS) throw new Error('Daily limit');
  const last = row.ads_last_watch ? new Date(row.ads_last_watch) : null;
  const now = new Date();
  const cooldown = last ? Math.floor((now - new Date(last)) / 1000) : COOLDOWN_SEC + 1;
  if (cooldown < COOLDOWN_SEC) throw new Error('Cooldown');

  const newCount = row.ads_watched_today + 1;
  const newUsdt = parseFloat(row.usdt) + AD_REWARD;
  await supabaseFetch(`/rest/v1/users_data?user_id=eq.${userId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      ads_watched_today: newCount,
      ads_last_watch: now.toISOString(),
      usdt: newUsdt
    })
  });
  return { usdt: newUsdt, ads_watched_today: newCount };
}

async function withdraw({ userId, amount, binanceUID }) {
  const [row] = await supabaseFetch(`/rest/v1/users_data?user_id=eq.${userId}&select=usdt`);
  if (!row || parseFloat(row.usdt) < amount) throw new Error('Insufficient balance');
  // خصم فوري
  await supabaseFetch(`/rest/v1/users_data?user_id=eq.${userId}`, {
    method: 'PATCH',
    body: JSON.stringify({ usdt: parseFloat(row.usdt) - amount })
  });
  // يمكنك إضافة جدول withdrawals لاحقاً
  return { ok: true };
}

// ====== ROUTER ======
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { action, ...params } = req.body;
  try {
    let data;
    switch (action) {
      case 'registerUser': data = await registerUser(params); break;
      case 'getProfile': data = await getProfile(params); break;
      case 'swap': data = await swap(params); break;
      case 'adWatch': data = await adWatch(params); break;
      case 'withdraw': data = await withdraw(params); break;
      default: throw new Error('Unknown action');
    }
    res.json(data);
  } catch (e) {
    res.status(400).json({ error: e.message || 'Server error' });
  }
}
