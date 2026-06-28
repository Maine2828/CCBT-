// Saves a user's push subscription to a Jsonbin bin
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const apiKey = process.env.JSONBIN_API_KEY;
  if (!apiKey) return { statusCode: 500, body: JSON.stringify({ error: 'JSONBIN_API_KEY not set' }) };

  let body;
  try { body = JSON.parse(event.body); } 
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { subscription, binId } = body;
  if (!subscription) return { statusCode: 400, body: JSON.stringify({ error: 'Missing subscription' }) };

  try {
    let url, method;
    if (binId) {
      url = `https://api.jsonbin.io/v3/b/${binId}`;
      method = 'PUT';
    } else {
      url = 'https://api.jsonbin.io/v3/b';
      method = 'POST';
    }

    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Key': apiKey,
        'X-Bin-Name': 'CCBT-Push-Subscriptions',
        'X-Bin-Private': 'true'
      },
      body: JSON.stringify({ subscriptions: body.subscriptions || [subscription] })
    });

    const data = await res.json();
    if (!res.ok) return { statusCode: res.status, body: JSON.stringify({ error: data.message }) };

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, binId: binId || data.metadata?.id })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
