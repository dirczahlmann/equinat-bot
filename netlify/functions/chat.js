/**
 * EQUINAT PferdeBot — Chat Proxy
 *
 * Wird vom Frontend aufgerufen, leitet an Anthropic API weiter,
 * und loggt jede Q&A in Netlify Forms (eq-messages).
 */

const https = require('https');
const querystring = require('querystring');

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  try {
    const body = JSON.parse(event.body);
    const { system, messages, user_id, user_name, msg_count } = body;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'API-Key nicht konfiguriert' }),
      };
    }

    // ── Anthropic API call ────────────────────────────────
    const payload = JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system,
      messages,
    });

    const apiResult = await new Promise((resolve, reject) => {
      const opts = {
        hostname: 'api.anthropic.com',
        port: 443,
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Length': Buffer.byteLength(payload),
        },
      };
      const req = https.request(opts, (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => resolve(data));
      });
      req.on('error', reject);
      req.write(payload);
      req.end();
    });

    // ── Log to Netlify Forms (best-effort, non-blocking) ──
    try {
      const parsed = JSON.parse(apiResult);
      const lastUserMsg = messages[messages.length - 1];
      const question = (lastUserMsg && lastUserMsg.content) ? String(lastUserMsg.content).slice(0, 2000) : '';
      const answer = (parsed.content && parsed.content[0] && parsed.content[0].text) ? parsed.content[0].text.slice(0, 2000) : '';
      const tokensIn = (parsed.usage && parsed.usage.input_tokens) || 0;
      const tokensOut = (parsed.usage && parsed.usage.output_tokens) || 0;

      logToNetlify({
        'form-name': 'eq-messages',
        user_id: user_id || 'anon',
        user_name: user_name || 'Tester',
        question,
        answer,
        timestamp: new Date().toISOString(),
        msg_count: String(msg_count || 0),
        tokens_in: String(tokensIn),
        tokens_out: String(tokensOut),
      }).catch(() => {}); // fire-and-forget
    } catch (e) {
      // Logging failure must never break chat
    }

    return {
      statusCode: 200,
      headers,
      body: apiResult,
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message }),
    };
  }
};

/**
 * Submit data to Netlify's hidden form endpoint.
 * Form must be defined in index.html with `data-netlify="true"`.
 */
function logToNetlify(data) {
  return new Promise((resolve, reject) => {
    const siteUrl = process.env.SITE_URL || process.env.URL || 'https://equinatbot.netlify.app';
    const host = siteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const payload = querystring.stringify(data);

    const opts = {
      hostname: host,
      port: 443,
      path: '/',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = https.request(opts, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve(body));
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}
