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
  const headers = corsHeaders(event);
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const jsonHeaders = { ...headers, 'Content-Type': 'application/json' };

  try {
    const { code, email } = JSON.parse(event.body);
    const codeNorm = String(code || '').trim().toUpperCase();
    const emailNorm = String(email || '').trim().toLowerCase();

    if (!codeNorm || !emailNorm) {
      return { statusCode: 200, headers: jsonHeaders, body: JSON.stringify({ valid: false, message: 'Code und Email erforderlich.' }) };
    }

    const token = sanitizeHeaderValue(process.env.NETLIFY_API_TOKEN);
    const formId = sanitizeHeaderValue(process.env.EQ_CODES_FORM_ID);

    if (!token || !formId) {
      console.error('Missing NETLIFY_API_TOKEN or EQ_CODES_FORM_ID env vars');
      return {
        statusCode: 500,
        headers: jsonHeaders,
        body: JSON.stringify({ valid: false, message: 'Server-Konfiguration unvollständig.' }),
      };
    }

    // ── Fetch all submissions from eq-codes form ──
    const submissions = await fetchSubmissions(token, formId);

    // ── Find ALL entries for this code+email, sort by created_at desc, check status of NEWEST ──
    // CRITICAL: Don't use .find()/.some() — that returns the first match, but Netlify Forms
    // can have multiple entries (active → revoked). The newest entry is the source of truth.
    const matchingEntries = submissions
      .filter(s => {
        const d = s.data || {};
        const sCode = String(d.code || '').trim().toUpperCase();
        const sEmail = String(d.email || '').trim().toLowerCase();
        return sCode === codeNorm && sEmail === emailNorm;
      })
      .sort((a, b) => {
        const tA = new Date(a.created_at || 0).getTime();
        const tB = new Date(b.created_at || 0).getTime();
        return tB - tA; // newest first
      });

    if (matchingEntries.length > 0) {
      const newest = matchingEntries[0];
      const newestStatus = String((newest.data || {}).status || '').trim().toLowerCase();
      if (newestStatus === 'active') {
        return {
          statusCode: 200,
          headers: jsonHeaders,
          body: JSON.stringify({ valid: true, code: codeNorm, email: emailNorm }),
        };
      }
      // Newest entry is NOT active — give specific reason
      let message = 'Code oder Email ungültig.';
      if (newestStatus === 'revoked') message = 'Dieser Code wurde widerrufen.';
      else if (newestStatus === 'expired') message = 'Dieser Code ist abgelaufen.';
      return {
        statusCode: 200,
        headers: jsonHeaders,
        body: JSON.stringify({ valid: false, message }),
      };
    }

    // ── No entry for this code+email combo — check if code exists with different email ──
    const codeOnlyMatch = submissions.find(s => {
      const sCode = String((s.data || {}).code || '').trim().toUpperCase();
      return sCode === codeNorm;
    });

    let message = 'Code oder Email ungültig.';
    if (codeOnlyMatch) {
      message = 'Email passt nicht zum Code.';
    }

    return {
      statusCode: 200,
      headers: jsonHeaders,
      body: JSON.stringify({ valid: false, message }),
    };
  } catch (err) {
    console.error('verify-code error:', err);
    return {
      statusCode: 500,
      headers: jsonHeaders,
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

/**
 * Strips all non-printable-ASCII characters that would crash HTTP headers.
 * Apple Notes, Word, Pages and similar apps insert smart quotes, NBSPs,
 * zero-width chars etc. that look invisible but are illegal in HTTP headers.
 */

function corsHeaders(event) {
  const ALLOWED_ORIGINS = [
    'https://equinatbot.netlify.app',
    'https://equinat.de',
    'https://www.equinat.de',
  ];
  const origin = (event && (event.headers?.origin || event.headers?.Origin)) || '';
  let allowOrigin = 'https://equinatbot.netlify.app';
  if (ALLOWED_ORIGINS.includes(origin)) {
    allowOrigin = origin;
  } else if (/^https:\/\/(deploy-preview-\d+--)?equinatbot\.netlify\.app$/.test(origin)) {
    allowOrigin = origin;
  }
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

function sanitizeHeaderValue(s) {
  if (!s) return '';
  // Keep only printable ASCII (codes 33-126) — strips spaces, tabs, NBSP,
  // smart quotes, zero-width chars, BOM, and all Unicode garbage.
  return String(s).replace(/[^\x21-\x7E]/g, '');
}
