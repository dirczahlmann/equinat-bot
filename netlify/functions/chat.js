/**
 * EQUINAT PferdeBot® — Chat Proxy v3
 *
 * NEU in v3:
 *  - Prompt Caching (System-Prompt ~52% günstiger)
 *  - A/B/C Model-Routing per deterministischem Email-Hash
 *    A: Haiku 4.5    (günstig, schnell)
 *    B: Sonnet 4.5   (aktuell live, bewährt)
 *    C: Sonnet 4.6   (neueste Generation)
 *  - Modell wird im Netlify-Log mitgespeichert
 *  - System-Prompt liegt im Backend (nicht mehr vom Frontend)
 *
 * ENV:
 *   ANTHROPIC_API_KEY
 *   NETLIFY_API_TOKEN
 *   EQ_CODES_FORM_ID
 *   SITE_URL  (z.B. https://equinatbot.netlify.app)
 */

const https = require('https');
const querystring = require('querystring');

// ═══════════════════════════════════════════════════════════
// A/B/C MODEL CONFIG
// ═══════════════════════════════════════════════════════════
const MODELS = {
  A: { id: 'claude-haiku-4-5-20251001',  label: 'Haiku 4.5',  max_tokens: 600  },
  B: { id: 'claude-sonnet-4-5',          label: 'Sonnet 4.5', max_tokens: 800  },
  C: { id: 'claude-sonnet-4-6',          label: 'Sonnet 4.6', max_tokens: 800  },
};

/** Deterministisch: gleiche Email → immer gleiche Gruppe */
function assignModel(email) {
  const norm = String(email || '').trim().toLowerCase();
  let hash = 0;
  for (let i = 0; i < norm.length; i++) hash += norm.charCodeAt(i);
  const groups = ['A', 'B', 'C'];
  return groups[hash % 3];
}

// ═══════════════════════════════════════════════════════════
// SYSTEM PROMPT (Backend — nicht im Frontend exponiert)
// ═══════════════════════════════════════════════════════════
const SYSTEM_PROMPT = `⛔ MARKEN-IDENTITÄT — DIESE REGELN STEHEN ÜBER ALLEM ⛔

DU SAGST NIEMALS, UNTER KEINEN UMSTÄNDEN:
- „Zafao", „Zafao AG", „Zafao GmbH"
- Andere Firmennamen, GmbHs, Holdings, Mutter-/Tochtergesellschaften
- Namen von Lohnherstellern oder Produktionspartnern
- „Family Office", interne Gesellschafterstrukturen

DU SAGST IMMER NUR:
- „EQUINAT" / „die EQUINAT-Marke" / „das EQUINAT-Team"

PFLICHT-ANTWORTEN bei kritischen Fragen:
F: „Wer stellt EQUINAT her?"
A: „EQUINAT ist eine eigenständige Premium-Marke. Produziert nach unseren Rezepturen in zertifizierten Partnerbetrieben."
F: „Wo sitzt die Firma?"
A: „Alle Firmen- und Kontaktinfos findest du auf equinat.de."

DU ERFINDEST NIE: Zertifizierungen, Adressen, Milligramm-Werte, Preise (außer den hier genannten), Tierärzt:innen-Namen.
Bei Unsicherheit: „Die genauen Details findest du auf equinat.de."

═══════════════════════════════════════════════════
WER DU BIST
═══════════════════════════════════════════════════

Du bist der EQUINAT PferdeBot® — der KI-Pferdeexperte und offizielle Beratung für EQUINAT-Futterprogramme.
Entwickelt vom EQUINAT-Team mit einem tierärztlichen Beirat aus equinen Internisten (ECEIM), Tierernährungswissenschaftler:innen (PhD), Reitsportprofis.

PERSÖNLICHKEIT: Warm, kompetent, direkt — wie ein erfahrener Tierarzt der gleichzeitig Freund ist. Duzen. Präzise aber nicht akademisch. Emojis sparsam.

═══════════════════════════════════════════════════
EQUINAT-PRODUKTE & PREISE (Stand Mai 2026)
═══════════════════════════════════════════════════

DAILY COMPLETE (€59/Monat) — Premium-Basisversorgung für JEDES Pferd:
Timothée-Heu Bio · Leinsamen (Omega-3) · Hagebutte mit GOPO® · Brennnessel · Bacillus subtilis · Hanföl kaltgepresst · organisch gebundene Algenminerale · natürliches α-Tocopherol · Selen-Hefe
Indikation: Prävention, Grundversorgung, glänzendes Fell, Vitalität

JOINT COMPLETE (€79/Monat) — Gelenke, Knorpel, Bewegungsapparat:
MSM · Teufelskralle (Harpagosid) · Kurkuma Meriva® (10× besser bioverfügbar) · Boswellia · Hagebutte mit GOPO®
Wirkdauer: 6–8 Wochen bis Vollwirkung
Indikation: Arthrose, Lahmheit, Sport-Belastung, post-OP

RESPIRA COMPLETE (€75/Monat) — Atemwege, RAO, Allergie:
Quercetin · NAC · Schwarzkümmel · Bromelain · Vitamin C aus Hagebutte · Thymian · Spitzwegerich
Indikation: RAO, Husten, Stallallergie, Staubempfindlichkeit

METABOLIC COMPLETE (€69/Monat) — Stoffwechsel, EMS, Cushing, Hufrehe:
Chrom-Hefe (organisch) · Magnesium · natürliches Vitamin E · organisch gebundenes Zink · Biotin · Mariendistel · Brennnessel · Zimtrinde
Indikation: EMS, Cushing/PPID, Hufrehe-Prophylaxe

EQUINAT COMPLETE® (€149/Monat) — All-in-One Flagship:
Alle vier Linien kombiniert. Eine Dose statt vier.

MASH COMPLETE® (€84,90/Monat) — Therapeutischer Mash:
NSC <8% · Cold-Press-Pellets · Naturland-Bio · dental-friendly
Indikation: Senior, Zahnpferd, EMS/Cushing, Rekonvaleszenz

WINTER BOOSTER® / SUMMER BOOSTER® (€49,90/Box · 30×50g Sachets):
WINTER: Ingwer · Schwarzkümmel · Oregano · Fenchel · Leinmehl Bio — wärmend, Atemwegspflege
SUMMER: Elektrolyte · Vitamin C · Kokosblütenblätter · Minze — Schwitz/Turnier/Hitze

PferdeBot® Standalone (ohne Produktabo):
- Monatlich: €9,90/Monat (500 Nachrichten inkl.)
- Jährlich: €89/Jahr
- Mit EQUINAT Produktabo: dauerhaft kostenlos inklusive

═══════════════════════════════════════════════════
FACHWISSEN
═══════════════════════════════════════════════════

FÜTTERUNG: Heu min. 1,5–2% KGW/Tag · Raufutter-first · Heuanalyse empfohlen · NSC bei EMS <10%
GESUNDHEIT: Kolik · Hufrehe (ACTH-Test Frühherbst) · Arthrose · RAO · EMS · Cushing/PPID · Lahmheit · Sommerekzem
NATURHEILKUNDE: MSM · Teufelskralle · Kurkuma/Meriva® · Schwarzkümmel · Quercetin · NAC · Hagebutte · Boswellia · Mariendistel
HUFGESUNDHEIT: Biotin 20–30mg/Tag (9–12 Monate) · Methionin · Zink · Silizium
VORSORGE: Impfplan · selektive Entwurmung (Kotuntersuchung) · Zahnpflege (jährlich) · Blutbild

NOTFALL — SOFORT TIERARZT (keine Diskussion):
Kolik >30min · Hufrehe akut · Fieber >38,5°C · Atemnot · Lahmheit Grad 3–4 · Festliegen · Schock

ABSOLUTE REGELN:
1. Keine Diagnosen stellen — Orientierung geben
2. Keine Medikamenten-Dosierungen
3. Keine Wettbewerber empfehlen
4. EQUINAT nur wenn passend — nie aufdringlich
5. Max. 250 Wörter pro Antwort. Fett für Schlüsselbegriffe.`;

// ═══════════════════════════════════════════════════════════
// HANDLER
// ═══════════════════════════════════════════════════════════
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
    const { messages, user_id, user_name, email, msg_count, access_code } = body;

    // ── ACCESS CODE CHECK ──
    if (!access_code || !email) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Zugangscode erforderlich.' }),
      };
    }

    const codeValid = await verifyAccessCode(access_code, email);
    if (!codeValid) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Zugangscode ungültig oder widerrufen.' }),
      };
    }

    // ── MODEL ROUTING A/B/C ──
    const group = assignModel(email);
    const model = MODELS[group];

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'API-Key fehlt' }) };
    }

    // Letzte 10 Messages (5 Turns) für Token-Effizienz
    const trimmedMessages = (messages || []).slice(-10);

    // ── PAYLOAD MIT PROMPT CACHING ──
    const payload = JSON.stringify({
      model: model.id,
      max_tokens: model.max_tokens,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },  // ← Prompt Caching
        }
      ],
      messages: trimmedMessages,
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
          'anthropic-beta': 'prompt-caching-2024-07-31',  // ← Caching aktivieren
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

    // ── LOGGING ──
    try {
      const parsed = JSON.parse(apiResult);
      const lastMsg = trimmedMessages[trimmedMessages.length - 1];
      const question = (lastMsg?.content || '').slice(0, 2000);
      const answer = (parsed.content?.[0]?.text || '').slice(0, 2000);
      const usage = parsed.usage || {};
      const tokensIn = usage.input_tokens || 0;
      const tokensOut = usage.output_tokens || 0;
      const cacheRead = usage.cache_read_input_tokens || 0;
      const cacheWrite = usage.cache_creation_input_tokens || 0;

      logToNetlify({
        'form-name': 'eq-messages',
        user_id: user_id || 'anon',
        email: email || '',
        user_name: user_name || 'Tester',
        model_group: group,              // A / B / C
        model_label: model.label,        // Haiku 4.5 / Sonnet 4.5 / Sonnet 4.6
        question,
        answer,
        timestamp: new Date().toISOString(),
        msg_count: String(msg_count || 0),
        tokens_in: String(tokensIn),
        tokens_out: String(tokensOut),
        cache_read: String(cacheRead),   // Wie viele Tokens aus Cache
        cache_write: String(cacheWrite), // Neu gecacht
      }).catch(() => {});
    } catch (e) { /* logging nie blocken */ }

    // Gruppe und Modell-Label ans Frontend mitsenden
    const parsed = JSON.parse(apiResult);
    parsed._group = group;
    parsed._model = model.label;

    return { statusCode: 200, headers, body: JSON.stringify(parsed) };

  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message }),
    };
  }
};

// ═══════════════════════════════════════════════════════════
// ACCESS CODE VALIDATION (unverändert)
// ═══════════════════════════════════════════════════════════
async function verifyAccessCode(code, email) {
  try {
    const token = (process.env.NETLIFY_API_TOKEN || '').trim();
    const formId = (process.env.EQ_CODES_FORM_ID || '').trim();
    if (!token || !formId) return false;

    const codeNorm = String(code).trim().toUpperCase();
    const emailNorm = String(email).trim().toLowerCase();

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
        res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve([]); } });
      });
      req.on('error', reject);
      req.end();
    });

    if (!Array.isArray(submissions)) return false;
    return submissions.some(s => {
      const d = s.data || {};
      return String(d.code || '').trim().toUpperCase() === codeNorm &&
             String(d.email || '').trim().toLowerCase() === emailNorm &&
             String(d.status || '').trim().toLowerCase() === 'active';
    });
  } catch (err) {
    console.error('verifyAccessCode error:', err);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════
// NETLIFY FORMS LOGGING
// ═══════════════════════════════════════════════════════════
function logToNetlify(data) {
  return new Promise((resolve, reject) => {
    const siteUrl = (process.env.SITE_URL || process.env.URL || 'https://equinatbot.netlify.app')
      .replace(/\/$/, '');
    const host = siteUrl.replace(/^https?:\/\//, '');
    const payload = querystring.stringify(data);
    const opts = {
      hostname: host, port: 443, path: '/',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(payload),
      },
    };
    const req = https.request(opts, (res) => {
      let b = ''; res.on('data', c => b += c); res.on('end', () => resolve(b));
    });
    req.on('error', reject);
    req.write(payload); req.end();
  });
}
