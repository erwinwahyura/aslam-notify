import { buildPushPayload } from '@block65/webcrypto-web-push';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function authorized(request, env) {
  const auth = request.headers.get('Authorization') || '';
  return auth === `Bearer ${env.APP_TOKEN}`;
}

function addMinutes(hhmm, mins) {
  const [h, m] = hhmm.split(':').map(Number);
  let total = h * 60 + m + mins;
  total = ((total % 1440) + 1440) % 1440;
  const nh = Math.floor(total / 60).toString().padStart(2, '0');
  const nm = (total % 60).toString().padStart(2, '0');
  return `${nh}:${nm}`;
}

// Mirrors the schedule built client-side in index.html so push times match what's shown in the app.
function buildSchedule(settings) {
  const items = [];
  if (settings.mealEnabled) {
    for (const t of settings.mealTimes || []) {
      items.push({ time: t, title: '🍽️ Waktu makan', body: 'Waktunya makan porsi kecil ya.' });
      if (settings.restEnabled) {
        items.push({ time: addMinutes(t, 120), title: '🚶 Jangan rebahan dulu', body: 'Sudah ±2 jam sejak makan terakhir.' });
      }
    }
  }
  if (settings.waterEnabled) {
    const [sh, sm] = settings.waterStart.split(':').map(Number);
    const [eh, em] = settings.waterEnd.split(':').map(Number);
    let cur = sh * 60 + sm;
    const end = eh * 60 + em;
    const step = settings.waterInterval * 60;
    while (cur <= end) {
      const h = Math.floor(cur / 60).toString().padStart(2, '0');
      const m = (cur % 60).toString().padStart(2, '0');
      items.push({ time: `${h}:${m}`, title: '💧 Minum air putih', body: 'Sedikit tapi sering ya.' });
      cur += step;
    }
  }
  if (settings.medsEnabled) {
    for (const t of settings.medsTimes || []) {
      items.push({ time: t, title: '💊 Minum obat lambung', body: 'Sesuai anjuran dokter/apoteker kamu.' });
    }
  }
  return items;
}

// Indonesia (WIB) is a fixed UTC+7 offset with no DST, so a plain offset is correct year-round.
function nowWIB() {
  const wib = new Date(Date.now() + 7 * 60 * 60 * 1000);
  const hh = String(wib.getUTCHours()).padStart(2, '0');
  const mm = String(wib.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

async function sendPush(env, subscription, title, body) {
  const vapid = {
    subject: env.VAPID_SUBJECT,
    publicKey: env.VAPID_SERVER_PUBLIC_KEY,
    privateKey: env.VAPID_SERVER_PRIVATE_KEY,
  };
  const payload = await buildPushPayload(
    { data: JSON.stringify({ title, body }), options: { ttl: 300, urgency: 'high' } },
    subscription,
    vapid,
  );
  return fetch(subscription.endpoint, payload);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    if (url.pathname === '/api/subscribe' && request.method === 'POST') {
      if (!authorized(request, env)) return json({ error: 'unauthorized' }, 401);
      const subscription = await request.json();
      if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
        return json({ error: 'invalid subscription' }, 400);
      }
      await env.STORE.put('subscription', JSON.stringify(subscription));
      return json({ ok: true });
    }

    if (url.pathname === '/api/settings' && request.method === 'POST') {
      if (!authorized(request, env)) return json({ error: 'unauthorized' }, 401);
      const settings = await request.json();
      await env.STORE.put('settings', JSON.stringify(settings));
      return json({ ok: true });
    }

    return json({ error: 'not found' }, 404);
  },

  async scheduled(_event, env) {
    const [settingsRaw, subscriptionRaw] = await Promise.all([
      env.STORE.get('settings'),
      env.STORE.get('subscription'),
    ]);
    if (!settingsRaw || !subscriptionRaw) return;

    const settings = JSON.parse(settingsRaw);
    const subscription = JSON.parse(subscriptionRaw);
    const hhmm = nowWIB();
    const due = buildSchedule(settings).filter((item) => item.time === hhmm);
    if (due.length === 0) return;

    for (const item of due) {
      const res = await sendPush(env, subscription, item.title, item.body);
      if (res.status === 404 || res.status === 410) {
        // Subscription expired or was revoked on the device — stop retrying every minute.
        await env.STORE.delete('subscription');
        break;
      }
    }
  },
};
