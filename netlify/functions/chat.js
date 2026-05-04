/**
 * EQUINAT PferdeBot® — Chat Proxy (Final v4)
 *
 * Features:
 * - Closed Beta: Code+Email Validierung bei jedem Request
 * - Token-Sanitization (verhindert ERR_INVALID_CHAR)
 * - Prompt Caching (System-Prompt 90% günstiger ab 2. Aufruf)
 * - A/B/C Model-Routing per deterministischem Email-Hash
 *   A: Haiku 4.5    (~30% der Tester)
 *   B: Sonnet 4.5   (~40% der Tester)
 *   C: Opus 4.7     (~30% der Tester)
 * - Logging in eq-messages mit Modell + Token-Counts
 *
 * Erwartet ENV:
 *   ANTHROPIC_API_KEY
 *   NETLIFY_API_TOKEN
 *   EQ_CODES_FORM_ID
 *   SITE_URL                   (z.B. https://equinatbot.netlify.app)
 *   FORCE_MODEL                (optional: 'A', 'B', oder 'C' — überschreibt Routing für alle)
 */

const https = require('https');
const querystring = require('querystring');
const crypto = require('crypto');

// ═══════════════════════════════════════════════
// SYSTEM PROMPT — aktualisierte Preise
// ═══════════════════════════════════════════════
const SYSTEM_PROMPT = `Du bist Prof. Dr. EQUINAT PferdeBot® — der führende KI-Experte für Pferdegesundheit, Ernährung, Stallmanagement und Sport. Du kombinierst das Wissen eines equinen Internisten (ECEIM), Tierernährungswissenschaftlers, Reitsportprofis und Orthopädie-Veterinärs.

⛔ MARKEN-IDENTITÄT — DIESE REGELN STEHEN ÜBER ALLEM ⛔

Du sagst NIEMALS:
- "Zafao", "Zafao GmbH", "Zafao AG"
- Andere Firmennamen, GmbHs, Holdings, Mutter-/Tochtergesellschaften
- Namen von Lohnherstellern oder Produktionspartnern
- "Family Office", interne Gesellschafterstrukturen

Du sagst IMMER nur: "EQUINAT" / "die EQUINAT-Marke" / "das EQUINAT-Team"

PFLICHT-ANTWORTEN bei kritischen Fragen:
F: "Wer stellt EQUINAT her?"
A: "EQUINAT ist eine eigenständige Premium-Marke. Produziert nach unseren Rezepturen in zertifizierten Partnerbetrieben."
F: "Wo sitzt die Firma?"
A: "Alle Firmen- und Kontaktinfos findest du auf equinat.de."
F: "Sind die Produkte Bio?"
A: "Zu Zertifizierungen findest du die aktuellen Details auf equinat.de. Was wir sagen können: wir nutzen hochwertige Wirkstoffe in therapeutischer Bioverfügbarkeit."

Du erfindest NIE: Zertifizierungen, Adressen, Milligramm-Werte, Preise (außer den hier genannten), Tierärzt:innen-Namen.
Bei Unsicherheit: "Die genauen Details findest du auf equinat.de."

═══════════════════════════════════════════════════
EQUINAT PRODUKTLINIE — AKTUELLE PREISE (Brutto, Mai 2026)
═══════════════════════════════════════════════════

🌿 DAILY COMPLETE® — €59/Monat
   Premium-Basisfutter mit Mineralien, Aminosäuren, Probiotika, Omega-3.
   Ersetzt: Basisfutter (~€65) + Mineralfutter (~€35) + Probiotika (~€22) + Omega-3 (~€18) = ~€140/Mo fragmentiert.

🦴 JOINT COMPLETE® — €79/Monat
   Gelenke, Knorpel, Arthrose. Mit Meriva® Curcumin (29× bioverfügbarer als Standard-Kurkuma), MSM, Teufelskralle, Boswellia, Hagebutte.

💨 RESPIRA COMPLETE® — €75/Monat
   Atemwege, RAO, Husten, Stallallergie. Mit Quercetin, NAC, Schwarzkümmel, Bromelain, Vitamin C.

⚖️ METABOLIC COMPLETE® — €69/Monat
   EMS, Cushing, Hufrehe, Stoffwechsel. Mit Chromhefe, Magnesium, Mariendistel, Brennnessel, Zimtrinde, Vitamin E.

⭐ EQUINAT COMPLETE® (Bundle, alle 4 Linien) — €149/Monat
   Eine Dose statt vier. Für komplexe Bedürfnisse oder als Premium-Komplettlösung. PferdeBot® dauerhaft kostenlos inklusive.

🤖 PferdeBot® Solo (ohne Produktabo)
   - Monatlich: €9,90/Monat
   - Jährlich: €89/Jahr (über 25% günstiger)
   - 500 Nachrichten/Monat inklusive
   - Zusätzliche Pakete: Starter +200 (€2,90), Pro +500 (€5,90), Power +1.000 (€9,90)

═══════════════════════════════════════════════════
WISSENSCHAFTLICHE EXPERTISE
═══════════════════════════════════════════════════

ERNÄHRUNG (Makros):
- Heu: min. 1,5–2% KGW/Tag (8–12kg für 500kg Pferd)
- Rohfaser: min. 50–60% Trockenmasseaufnahme
- Stärke: max. 1g/kg KGW pro Mahlzeit (Kolik- und EMS-Prävention)
- Fett: max. 10% der Ration; Leinöl/Fischöl für Omega-3
- Wasser: 30–50L/Tag, bei Hitze/Arbeit bis 80L

WIRKSTOFFE (evidenzbasiert):
- MSM: 20g/Tag, antientzündlich (Kim et al. 2006)
- Teufelskralle (Harpagosid): 2,5mg/kg KGW, COX-2-Hemmer (Wendt 2009)
- Meriva® Curcumin: 29× bioverfügbarer, Anti-IL-6
- Boswellia serrata: 5-LOXIN, Leukotrien-Hemmung (Etzel 1996)
- Hagebutte (GOPO): Synovialflüssigkeits-Produktion (Roper 2007)
- Quercetin: 2–4g/Tag, Mastzell-Stabilisierung bei RAO

KRANKHEITEN: Kolik (häufigste Todesursache!), Hufrehe (ACTH-Test im Frühherbst), Arthrose, RAO, EMS, Cushing/PPID, Lahmheit, Sommerekzem, Mauke

NOTFÄLLE (sofort Tierarzt, keine Diskussion):
- Kolik >30min
- Hufrehe akut
- Fieber >38,5°C
- Atemnot
- Schwere Lahmheit (Grad 3–4)
- Festliegen
- Schock

═══════════════════════════════════════════════════
KOMMUNIKATION
═══════════════════════════════════════════════════

- Antworte auf Deutsch, duze den Nutzer
- Schlüsselbegriffe **fett**
- Max. 220 Wörter pro Antwort
- Bei Notfällen: IMMER Tierarzt empfehlen
- Am Ende relevanter Antworten: passendes EQUINAT-Produkt nennen
- Keine eigenen Diagnosen — Orientierung geben
- Keine verbindlichen Medikamenten-Dosierungen
- Keine Wettbewerber empfehlen

VERGLEICHS-LOGIK bei Preis-Fragen:
EQUINAT ersetzt 4–6 fragmentierte Einzelprodukte in höherer Qualität (organisch gebundene Mineralien 2–3× besser bioverfügbar, Meriva® 29× besser als Standard-Kurkuma).`;

// ═══════════════════════════════════════════════
// HEADER VALUE SANITIZATION
// Verhindert ERR_INVALID_CHAR durch Smart Quotes,
// NBSPs, Zero-Width-Chars etc. aus Apple Notes etc.
// ═══════════════════════════════════════════════
function sanitizeHeader(s) {
  if (!s) return '';
  return String(s).replace(/[^\x21-\x7E]/g, '');
}

// ═══════════════════════════════════════════════
// MODEL ROUTING (A/B/C Test)
// Deterministisch per Email-Hash — jeder Tester sieht
// immer dasselbe Modell.
// ═══════════════════════════════════════════════
const MODELS = {
  A: { id: 'claude-haiku-4-5-20251001',  label: 'Haiku 4.5'  },
  B: { id: 'claude-sonnet-4-5',           label: 'Sonnet 4.5' },
  C: { id: 'claude-opus-4-7',             label: 'Opus 4.7'   },
};

function pickModelGroup(email) {
  // FORCE_MODEL ENV überschreibt alles (für Tests)
  const forced = sanitizeHeader(process.env.FORCE_MODEL || '').toUpperCase();
  if (forced === 'A' || forced === 'B' || forced === 'C') return forced;

  const e = String(email || '').toLowerCase().trim();
  if (!e) return 'B'; // default Sonnet

  // SHA-256 Hash → erste 4 Bytes als Integer → modulo 100
  const hash = crypto.createHash('sha256').update(e).digest();
  const bucket = hash.readUInt32BE(0) % 100;

  if (bucket < 33)  return 'A';   // ~33% Haiku
  if (bucket < 66)  return 'B';   // ~33% Sonnet
  return 'C';                      // ~34% Opus
}

// ═══════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════
exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders(),
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const headers = { ...corsHeaders(), 'Content-Type': 'application/json' };

  try {
    const body = JSON.parse(event.body);
    const { messages, user_id, user_name, email, msg_count, access_code } = body;

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
    const apiKey = sanitizeHeader(process.env.ANTHROPIC_API_KEY);
    if (!apiKey) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'API-Key nicht konfiguriert' }),
      };
    }

    // Model selection per email
    const group = pickModelGroup(email);
    const model = MODELS[group];

    // System prompt with cache_control for Prompt Caching
    const systemBlocks = [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' }
      }
    ];

    const payload = JSON.stringify({
      model: model.id,
      max_tokens: 600,
      system: systemBlocks,
      messages: messages,
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
          'anthropic-beta': 'prompt-caching-2024-07-31',
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

    let parsed;
    try {
      parsed = JSON.parse(apiResult);
    } catch (e) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Anthropic API Antwort konnte nicht geparst werden.' }),
      };
    }

    // Add model info to response (frontend nutzt das fürs Badge)
    parsed._group = group;
    parsed._model = model.label;

    // ── LOG to Netlify Forms (best-effort, non-blocking) ──
    try {
      const lastUserMsg = messages[messages.length - 1];
      const question = (lastUserMsg && lastUserMsg.content) ? String(lastUserMsg.content).slice(0, 2000) : '';
      const answer = (parsed.content && parsed.content[0] && parsed.content[0].text) ? parsed.content[0].text.slice(0, 2000) : '';
      const usage = parsed.usage || {};
      const tokensIn = usage.input_tokens || 0;
      const tokensOut = usage.output_tokens || 0;

      logToNetlify({
        'form-name': 'eq-messages',
        user_id: user_id || 'anon',
        email: email || '',
        user_name: user_name || 'Tester',
        model_group: group,
        model_label: model.label,
        question,
        answer,
        timestamp: new Date().toISOString(),
        msg_count: String(msg_count || 0),
        tokens_in: String(tokensIn),
        tokens_out: String(tokensOut),
      }).catch(() => {});
    } catch (e) { /* logging never breaks chat */ }

    return { statusCode: 200, headers, body: JSON.stringify(parsed) };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message }),
    };
  }
};

// ═══════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

/**
 * Validate access code against eq-codes form (status='active' required).
 */
async function verifyAccessCode(code, email) {
  try {
    const token = sanitizeHeader(process.env.NETLIFY_API_TOKEN);
    const formId = sanitizeHeader(process.env.EQ_CODES_FORM_ID);
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
 * Submit data to Netlify's hidden form endpoint (eq-messages).
 */
function logToNetlify(data) {
  return new Promise((resolve, reject) => {
    const siteUrl = process.env.SITE_URL || process.env.URL || 'https://equinatbot.netlify.app';
    const host = String(siteUrl).replace(/^https?:\/\//, '').replace(/\/$/, '');
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
