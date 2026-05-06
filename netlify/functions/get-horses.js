/**
 * EQUINAT — Get Horses (Server-Side Persistence)
 *
 * Wird beim Login und beim "Manuellen Sync" aufgerufen.
 * Liefert die neueste Pferd-Liste eines Users zurück, basierend auf
 * dem letzten Sync-Eintrag in der Netlify Form "eq-horses".
 *
 * Sicherheit:
 *   - Email + accessCode werden gegen eq-codes-Form validiert (gleiche Logik wie verify-code)
 *   - Nur eigene Pferde werden zurückgegeben (Email-Match)
 *   - Latest-write-wins basierend auf updated_at Timestamp
 *
 * Erwartet ENV:
 *   NETLIFY_API_TOKEN   → Personal Access Token
 *   EQ_CODES_FORM_ID    → Form-ID von "eq-codes"
 *   EQ_HORSES_FORM_ID   → Form-ID von "eq-horses"
 *
 * Request-Body (JSON):
 *   { email: string, code: string }
 *
 * Response:
 *   { ok: true, horses: [...], activeHorseId: string|null, updated_at: string|null }
 *   { ok: false, message: string }
 */

const https = require('https');

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(event) };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const headers = { ...corsHeaders(event), 'Content-Type': 'application/json' };

  try {
    const { code, email } = JSON.parse(event.body || '{}');
    const codeNorm = String(code || '').trim().toUpperCase();
    const emailNorm = String(email || '').trim().toLowerCase();

    if (!codeNorm || !emailNorm) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ok: false, message: 'Email und Code erforderlich.' }),
      };
    }

    const token = sanitizeHeaderValue(process.env.NETLIFY_API_TOKEN);
    const codesFormId = sanitizeHeaderValue(process.env.EQ_CODES_FORM_ID);
    const horsesFormId = sanitizeHeaderValue(process.env.EQ_HORSES_FORM_ID);

    if (!token || !codesFormId || !horsesFormId) {
      console.error('Missing env vars (NETLIFY_API_TOKEN / EQ_CODES_FORM_ID / EQ_HORSES_FORM_ID)');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ ok: false, message: 'Server-Konfiguration unvollständig.' }),
      };
    }

    // ── 1. Verify code+email is valid (latest entry wins — same logic as verify-code) ──
    const codeSubmissions = await fetchSubmissions(token, codesFormId);
    const matchingCodes = codeSubmissions
      .filter(s => {
        const d = s.data || {};
        return String(d.code || '').trim().toUpperCase() === codeNorm
          && String(d.email || '').trim().toLowerCase() === emailNorm;
      })
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

    const codeMatch = matchingCodes.length > 0
      && String((matchingCodes[0].data || {}).status || '').trim().toLowerCase() === 'active';

    if (!codeMatch) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ok: false, message: 'Code oder Email ungültig.' }),
      };
    }

    // ── 2. Fetch all horse submissions for this email, find the latest ──
    const horseSubmissions = await fetchSubmissions(token, horsesFormId);
    const userHorseEntries = horseSubmissions
      .filter(s => {
        const d = s.data || {};
        return String(d.email || '').trim().toLowerCase() === emailNorm;
      })
      .map(s => ({
        ...s,
        sortKey: parseTimestamp(s.data?.updated_at) || parseTimestamp(s.created_at) || 0,
      }))
      .sort((a, b) => b.sortKey - a.sortKey); // newest first

    if (userHorseEntries.length === 0) {
      // No horses synced yet — empty array is valid response
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ok: true, horses: [], activeHorseId: null, updated_at: null }),
      };
    }

    const latest = userHorseEntries[0];
    const d = latest.data || {};

    // Parse horses_json safely
    let horses = [];
    try {
      const parsed = JSON.parse(d.horses_json || '[]');
      if (Array.isArray(parsed)) horses = parsed;
    } catch (e) {
      console.error('Failed to parse horses_json:', e.message);
      horses = [];
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        horses,
        activeHorseId: d.active_horse_id || null,
        updated_at: d.updated_at || latest.created_at || null,
      }),
    };

  } catch (err) {
    console.error('get-horses error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ ok: false, message: 'Server-Fehler. Bitte erneut versuchen.' }),
    };
  }
};


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

function parseTimestamp(s) {
  if (!s) return 0;
  const t = new Date(s).getTime();
  return isNaN(t) ? 0 : t;
}

function sanitizeHeaderValue(s) {
  if (!s) return '';
  return String(s).replace(/[^\x21-\x7E]/g, '');
}
