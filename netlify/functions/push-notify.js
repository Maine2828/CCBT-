// Daily scheduled function — checks benefit deadlines and sends push notifications
// Netlify cron: runs every day at 9am UTC
// Add to netlify.toml: [functions."push-notify"] schedule = "0 9 * * *"

const webpush = require('web-push');

const VAPID_PUBLIC  = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const JSONBIN_KEY   = process.env.JSONBIN_API_KEY;
const SUB_BIN_ID    = process.env.PUSH_SUB_BIN_ID; // bin that stores subscriptions

const LEAD = { annual:30, semester:30, quarterly:15, monthly:5, 'per stay':7, '4-year':30 };

const MONTHS = {Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};

function periodEnd(label) {
  let m;
  // Monthly "Jan 26"
  m = label.match(/^(\w{3})\s+(\d{2})$/);
  if (m && MONTHS[m[1]] !== undefined) {
    const y = 2000 + parseInt(m[2]);
    return new Date(y, MONTHS[m[1]] + 1, 0, 23, 59, 59);
  }
  // Quarterly "Q1 2026"
  m = label.match(/^Q(\d)\s+(\d{4})$/);
  if (m) { const q=parseInt(m[1]),y=parseInt(m[2]); return new Date(y,[2,5,8,11][q-1]+1,0,23,59,59); }
  // Semester H1 "Jan–Jun 2026"
  m = label.match(/Jan.+Jun\s+(\d{4})/);
  if (m) return new Date(parseInt(m[1]), 6, 0, 23, 59, 59);
  // Semester H2 "Jul–Dec 2026"
  m = label.match(/Jul.+Dec\s+(\d{4})/);
  if (m) return new Date(parseInt(m[1]), 12, 0, 23, 59, 59);
  // Annual "2026"
  m = label.match(/^(\d{4})$/);
  if (m) return new Date(parseInt(m[1]), 11, 31, 23, 59, 59);
  return null;
}

exports.handler = async (event) => {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE || !JSONBIN_KEY || !SUB_BIN_ID) {
    console.log('Missing env vars:', { VAPID_PUBLIC: !!VAPID_PUBLIC, VAPID_PRIVATE: !!VAPID_PRIVATE, JSONBIN_KEY: !!JSONBIN_KEY, SUB_BIN_ID: !!SUB_BIN_ID });
    return { statusCode: 500, body: 'Missing environment variables' };
  }

  webpush.setVapidDetails('mailto:admin@ccbt.app', VAPID_PUBLIC, VAPID_PRIVATE);

  // Load subscriptions from Jsonbin
  let subscriptions = [];
  try {
    const res = await fetch(`https://api.jsonbin.io/v3/b/${SUB_BIN_ID}/latest`, {
      headers: { 'X-Master-Key': JSONBIN_KEY }
    });
    const data = await res.json();
    subscriptions = data.record?.subscriptions || [];
    console.log(`Loaded ${subscriptions.length} subscription(s)`);
  } catch (err) {
    console.error('Failed to load subscriptions:', err.message);
    return { statusCode: 500, body: 'Failed to load subscriptions' };
  }

  if (subscriptions.length === 0) {
    return { statusCode: 200, body: 'No subscriptions to notify' };
  }

  // Each subscription stores its own card/benefit data snapshot
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();

  let totalSent = 0;

  for (const sub of subscriptions) {
    if (!sub.endpoint) continue;

    const notifications = [];
    const cards = sub.cards || {};
    const used = sub.used || {};

    Object.entries(cards).forEach(([cardKey, card]) => {
      if (!card.benefits) return;
      card.benefits.forEach(b => {
        if (b.perUse || b.customizable || !b.periods?.length) return;
        const leadDays = LEAD[b.period] || 15;

        b.periods.forEach(period => {
          if (used[`${b.id}::${period}`]) return; // already claimed

          const end = periodEnd(period);
          if (!end) return;

          const endMs = end.getTime();
          const fireMs = endMs - (leadDays * 86400000);
          const daysLeft = Math.ceil((endMs - todayMs) / 86400000);

          if (todayMs >= fireMs && todayMs < endMs) {
            notifications.push({
              title: `${card.name} — ${b.name}`,
              body: `${period}: $${b.amount} expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}. Claim it before it expires!`,
              tag: `ccbt_${b.id}_${period.replace(/\s/g, '_')}`
            });
          }
        });
      });
    });

    // Send all due notifications to this subscription
    for (const notif of notifications) {
      try {
        await webpush.sendNotification(
          sub.endpoint,
          JSON.stringify(notif)
        );
        totalSent++;
        console.log(`Sent: ${notif.title}`);
      } catch (err) {
        console.error(`Failed to send to ${sub.endpoint.slice(0, 50)}:`, err.message);
      }
    }
  }

  return { statusCode: 200, body: `Sent ${totalSent} notification(s)` };
};
