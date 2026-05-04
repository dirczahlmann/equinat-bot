/**
 * EQUINAT — Verify Access Code
 *
 * Wird vom Lock-Screen aufgerufen.
 * Prüft, ob ein Code + Email Kombination in Netlify Form "eq-codes"
 * mit Status "active" gespeichert ist.
 *
 * Erwartet ENV:
 *   NETLIFY_API_TOKEN  → Personal Access Token
 *   EQ_CODES_FORM_ID   → Form-ID von "eq-codes"
 */

const https = require('https');

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
    const { code, email } = JSON.parse(event.body);
    const codeNorm = String(code || '').trim().toUpperCase();
    const emailNorm = String(email || '').trim().toLowerCase();

    if (!codeNorm || !emailNorm) {
      return { statusCode: 200, headers, body: JSON.stringify({ valid: false, message: 'Code und Email erforderlich.' }) };
    }

    const token = (process.env.NETLIFY_API_TOKEN || '').trim();
    const formId = (process.env.EQ_CODES_FORM_ID || '').trim();

    if (!token || !formId) {
      console.error('Missing NETLIFY_API_TOKEN or EQ_CODES_FORM_ID env vars');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ valid: false, message: 'Server-Konfiguration unvollständig.' }),
      };
    }

    // ── Fetch all submissions from eq-codes form ──
    const submissions = await fetchSubmissions(token, formId);

    // ── Search for matching code+email ──
    const match = submissions.find(s => {
      const d = s.data || {};
      const sCode = String(d.code || '').trim().toUpperCase();
      const sEmail = String(d.email || '').trim().toLowerCase();
      const sStatus = String(d.status || '').trim().toLowerCase();
      return sCode === codeNorm && sEmail === emailNorm && sStatus === 'active';
    });

    if (match) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ valid: true, code: codeNorm, email: emailNorm }),
      };
    }

    // ── Determine reason for rejection ──
    const codeOnlyMatch = submissions.find(s => {
      const sCode = String((s.data || {}).code || '').trim().toUpperCase();
      return sCode === codeNorm;
    });

    let message = 'Code oder Email ungültig.';
    if (codeOnlyMatch) {
      const d = codeOnlyMatch.data || {};
      const dStatus = String(d.status || '').toLowerCase();
      if (dStatus === 'revoked') message = 'Dieser Code wurde widerrufen.';
      else if (dStatus === 'expired') message = 'Dieser Code ist abgelaufen.';
      else if (String(d.email || '').toLowerCase() !== emailNorm) message = 'Email passt nicht zum Code.';
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ valid: false, message }),
    };
  } catch (err) {
    console.error('verify-code error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ valid: false, message: 'Server-Fehler. Bitte erneut versuchen.' }),
    };
  }
};

function fetchSubmissions(token, formId) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'api.netlify.com',
      port: 443,
      path: `/api/v1/forms/${formId}/submissions?per_page=200`,
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(Array.isArray(parsed) ? parsed : []);
        } catch (e) {
          resolve([]);
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}
