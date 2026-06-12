exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'API key not configured' })
    };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { cardName, url, prompt } = body;
  if (!cardName && !url) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing cardName or url' }) };
  }

  let pageContent = '';

  // If a URL was provided, fetch and extract text from the page
  if (url) {
    try {
      const pageRes = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
        signal: AbortSignal.timeout(10000) // 10 second timeout
      });

      if (!pageRes.ok) throw new Error(`Page returned ${pageRes.status}`);

      const html = await pageRes.text();

      // Strip HTML tags and extract readable text
      pageContent = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ')
        .replace(/&#[0-9]+;/g, ' ')
        .replace(/\s{3,}/g, '  ')
        .trim()
        .slice(0, 12000); // cap at ~12k chars to stay within token limits

    } catch (err) {
      return {
        statusCode: 422,
        body: JSON.stringify({ error: `Could not fetch page: ${err.message}` })
      };
    }
  }

  // Build final prompt — inject page content if URL was fetched
  const finalPrompt = pageContent
    ? `${prompt}\n\n--- PAGE CONTENT START ---\n${pageContent}\n--- PAGE CONTENT END ---`
    : prompt;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        messages: [{ role: 'user', content: finalPrompt }]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: data.error?.message || 'Anthropic API error' })
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
