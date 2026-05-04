/**
 * EQUINAT PferdeBot — Chat Proxy (Closed Beta)
 *
 * Wird vom Frontend aufgerufen, prüft Zugangscode,
 * leitet bei Erfolg an Anthropic API weiter,
 * und loggt jede Q&A in Netlify Forms (eq-messages).
 *
 * Erwartet ENV:
 *   ANTHROPIC_API_KEY  → Anthropic API Key
 *   NETLIFY_API_TOKEN  → Personal Access Token (für Code-Validierung)
 *   EQ_CODES_FORM_ID   → Form-ID von "eq-codes"
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
    const { system, messages, user_id, user_name, email, msg_count, access_code } = body;

    // ── ACCESS CODE CHECK ──
    if (!access_code || !email) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Zugangscode erforderlich. Bitte Bot neu freischalten.' }),
      };
    }

    const codeValid = await verifyAccessCode(access_code, email);
    if (!codeValid) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Zugangscode ungültig oder widerrufen. Bitte Bot neu freischalten.' }),
      };
    }

    // ── ANTHROPIC API CALL ──
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'API-Key nicht konfiguriert' }),
      };
    }

    const payload = JSON.stringify({
      model: 'claude-sonnet-4-5',
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

    // ── LOG to Netlify Forms (best-effort, non-blocking) ──
    try {
      const parsed = JSON.parse(apiResult);
      const lastUserMsg = messages[messages.length - 1];
      const question = (lastUserMsg && lastUserMsg.content) ? String(lastUserMsg.content).slice(0, 2000) : '';
      const answer = (parsed.content && parsed.content[0] && parsed.content[0].text) ? parsed.content[0].text.slice(0, 2000) : '';
      const tokensIn = (parsed.usage && parsed.usage.input_tokens) || 0;
      const tokensOut = (parsed.usage && parsed.usage.output_tokens) || 0;
      const totalTokens = tokensIn + tokensOut;

      logToNetlify({
        'form-name': 'eq-messages',
        user_id: user_id || 'anon',
        email: email || '',
        user_name: user_name || 'Tester',
        question,
        answer,
        timestamp: new Date().toISOString(),
        msg_count: String(msg_count || 0),
        tokens: String(totalTokens),
        tokens_in: String(tokensIn),
        tokens_out: String(tokensOut),
      }).catch(() => {});
    } catch (e) { /* logging never breaks chat */ }

    return { statusCode: 200, headers, body: apiResult };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message }),
    };
  }
};

/**
 * Validate access code against eq-codes form (status='active' required).
 */
async function verifyAccessCode(code, email) {
  try {
    const token = (process.env.NETLIFY_API_TOKEN || '').trim();
    const formId = (process.env.EQ_CODES_FORM_ID || '').trim();
    if (!token || !formId) {
      console.error('Missing NETLIFY_API_TOKEN or EQ_CODES_FORM_ID');
      return false;
    }

    const codeNorm = String(code || '').trim().toUpperCase();
    const emailNorm = String(email || '').trim().toLowerCase();

    const submissions = await new Promise((resolve, reject) => {
      const opts = {
        hostname: 'api.netlify.com',
        port: 443,
        path: `/api/v1/forms/${formId}/submissions?per_page=200`,
        method: 'GET',
        headers: { 'Authorization': 'Bearer ' + token },
      };
      const req = https.request(opts, (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch (e) { resolve([]); }
        });
      });
      req.on('error', reject);
      req.end();
    });

    if (!Array.isArray(submissions)) return false;

    return submissions.some(s => {
      const d = s.data || {};
      const sCode = String(d.code || '').trim().toUpperCase();
      const sEmail = String(d.email || '').trim().toLowerCase();
      const sStatus = String(d.status || '').trim().toLowerCase();
      return sCode === codeNorm && sEmail === emailNorm && sStatus === 'active';
    });
  } catch (err) {
    console.error('verifyAccessCode error:', err);
    return false;
  }
}

/**
 * Submit data to Netlify's hidden form endpoint.
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
