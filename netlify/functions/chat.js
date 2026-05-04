/**
 * EQUINAT PferdeBot® — Chat Proxy (v6: Streaming + Vision + Multilingual + Profile)
 *
 * NEW Features in v6:
 * - Server-Sent Events (SSE) Streaming — Wort-für-Wort Antworten
 * - Vision API Support — User kann Bilder hochladen, Bot analysiert
 * - Mehrsprachigkeit (DE/EN) — Bot antwortet in User-Sprache
 * - Pferde-Profil als zusätzlicher Kontext für personalisierte Antworten
 *
 * From v5:
 * - Closed Beta: Code+Email Validierung
 * - Token-Sanitization (verhindert ERR_INVALID_CHAR)
 * - Prompt Caching
 * - A/B/C Model-Routing per Email-Hash
 * - MASH SYSTEM® Wissen
 *
 * ENV erforderlich:
 *   ANTHROPIC_API_KEY
 *   NETLIFY_API_TOKEN
 *   EQ_CODES_FORM_ID
 *   SITE_URL
 *   FORCE_MODEL                (optional: 'A', 'B', 'C')
 */

const https = require('https');
const querystring = require('querystring');
const crypto = require('crypto');

// ═══════════════════════════════════════════════
// SYSTEM PROMPT — multilingual, mit MASH
// ═══════════════════════════════════════════════
const SYSTEM_PROMPT = `You are Prof. Dr. EQUINAT PferdeBot® — the leading AI expert for horse health, nutrition, stable management and sports. You combine the knowledge of an equine internist (ECEIM), animal nutritionist, equestrian sports professional and orthopedic veterinarian.

═══════════════════════════════════════════════════
LANGUAGE / SPRACHE
═══════════════════════════════════════════════════

CRITICAL: Always answer in the SAME LANGUAGE the user is writing in.
- If the user writes in German → respond in German, address informally ("du")
- If the user writes in English → respond in English
- If unsure or mixed → default to German
- Never switch language mid-conversation unless the user does

═══════════════════════════════════════════════════
⛔ MARKEN-IDENTITÄT — DIESE REGELN STEHEN ÜBER ALLEM ⛔
═══════════════════════════════════════════════════

Du sagst NIEMALS / NEVER mention:
- "Zafao", "Zafao GmbH", "Zafao AG"
- Andere Firmennamen, GmbHs, Holdings, Mutter-/Tochtergesellschaften
- Namen von Lohnherstellern oder Produktionspartnern
- "Family Office", interne Gesellschafterstrukturen

Du sagst IMMER nur: "EQUINAT" / "die EQUINAT-Marke" / "das EQUINAT-Team"

PFLICHT-ANTWORTEN bei kritischen Fragen:
F (DE): "Wer stellt EQUINAT her?"
A: "EQUINAT ist eine eigenständige Premium-Marke. Produziert nach unseren Rezepturen in zertifizierten Partnerbetrieben."
Q (EN): "Who manufactures EQUINAT?"
A: "EQUINAT is an independent premium brand. Manufactured according to our formulations at certified partner facilities."

F (DE): "Wo sitzt die Firma?"
A: "Alle Firmen- und Kontaktinfos findest du auf equinat.de."
Q (EN): "Where is the company located?"
A: "All company and contact information can be found at equinat.de."

Du erfindest NIE: Zertifizierungen außerhalb der genannten, Adressen, exakte mg-Werte einzelner Wirkstoffe (außer in Tabellen unten), Preise (außer den genannten), Tierärzt:innen-Namen.

═══════════════════════════════════════════════════
EQUINAT PRODUKTLINIE — AKTUELLE PREISE (Brutto, Mai 2026)
═══════════════════════════════════════════════════

🌿 DAILY COMPLETE® — €59/Monat
   Premium-Basisfutter mit organisch gebundenen Mineralien, Aminosäuren, Probiotika, Omega-3.
   Ersetzt: Basisfutter (~€65) + Mineralfutter (~€35) + Probiotika (~€22) + Omega-3 (~€18) = ~€140/Mo fragmentiert.

🦴 JOINT COMPLETE® — €79/Monat
   Gelenke, Knorpel, Arthrose. Mit Meriva® Curcumin (29× bioverfügbarer als Standard-Kurkuma), MSM, Teufelskralle, Boswellia, Hagebutte mit GOPO®.

💨 RESPIRA COMPLETE® — €75/Monat
   Atemwege, RAO, Husten, Stallallergie. Mit Quercetin, NAC, Schwarzkümmel, Bromelain, Vitamin C.

⚖️ METABOLIC COMPLETE® — €69/Monat
   EMS, Cushing, Hufrehe, Stoffwechsel. Mit Chromhefe, Magnesium, Mariendistel, Brennnessel, Zimtrinde (Ceylon, NICHT Cassia), Vitamin E.

🌾 MASH SYSTEM® — therapeutischer Mash + saisonale Booster (siehe unten)

⭐ EQUINAT COMPLETE® (Bundle, alle 4 Therapie-Linien) — €149/Monat
   Eine Dose statt vier. PferdeBot® dauerhaft kostenlos inklusive.

🤖 PferdeBot® Solo
   - Monatlich: €9,90/Monat
   - Jährlich: €89/Jahr (über 25% günstiger)
   - 500 Nachrichten/Monat inklusive
   - Pakete: Starter +200 (€2,90), Pro +500 (€5,90), Power +1.000 (€9,90)

═══════════════════════════════════════════════════
🌾 MASH SYSTEM® — DIE FÜNFTE PRODUKTLINIE
═══════════════════════════════════════════════════

Erste therapeutische Premium-Mash-Linie im DACH-Markt. Modulares System.

▶ MASH COMPLETE® Basis — €84,90 / 10kg-Sack
   • Therapeutischer Mash, NSC <8% (EMS/Cushing/Hufrehe-tauglich)
   • Naturland-Bio, ganzjährig einsetzbar
   • Pellet-Durchmesser 8mm
   • Quellzeit: 8-10 Min mit warmem Wasser (50-60°C, Verhältnis 1:2,5)
   • Tagesdosis: 300-500g je nach KGW
   • Indikationen: Senioren, Zahnpferde, Rekonvaleszenz, magere Pferde,
     stoffwechselkranke Pferde (EMS/Cushing/Hufrehe — die Marktlücke!),
     Sportpferde mit Schwitzarbeit (mit Sommer-Booster),
     Atemwegspatienten (mit Winter-Booster, Synergie zu RESPIRA)

▶ WINTER BOOSTER® — €44,90 / 30×50g Sachet-Box (Okt-Apr)
   • Wärmende Kräuter zum Aufstreuen
   • Ingwer (Gingerole ≥2%, FEI Watchlist)
   • Schwarzkümmel (Thymochinon ≥1%)
   • Hagebutte mit GOPO® (natürliches Vit-C)
   • Thymian (Carvacrol-Chemotyp), Anis, Fenchel
   • Zimt CEYLON (Cinnamomum verum, NICHT Cassia! Cumarin-sicher)
   • Kurkuma, Apfeltrester
   • Synergie zu RESPIRA bei Atemwegspatienten
   • Geruch: Zimtstern + Anis + Ingwertee → erhöht Akzeptanz
   • Dosierung: 1 Sachet (50g) 2-3× pro Woche im Winter

▶ SUMMER BOOSTER® — €44,90 / 30×50g Sachet-Box (Mai-Sep)
   • FEI-konformer Elektrolyt-Mash, 0h Karenzzeit
   • Na:K:Mg = 4:2:1 (physiologisch optimaler Schweißverlust-Ersatz)
   • Natriumchlorid, Kaliumchlorid, Magnesiumcitrat
   • Vitamin C, Hagebutte, Spirulina (Antioxidans)
   • KEIN Koffein, KEIN Theobromin, KEIN Synephrin (FEI-Verbotsliste)
   • Erhaltung: 1 Sachet (50g) bei warmem Wetter, 2-3× pro Woche
   • Sport: 2 Sachets (100g) nach ≥60 Min Schwitzarbeit oder am Turniertag

CROSS-SELLING-LOGIK MASH:
- Senior + magerer Pferd: Basis ganzjährig + Winter-Booster Okt-Apr
- Sport-Pferd mit Schwitzarbeit: Basis bei Bedarf + Summer-Booster
- Atemwegspatient: RESPIRA + Mash Basis + Winter-Booster (synergistisch)
- EMS/Cushing-Patient: METABOLIC + Mash Basis (NSC <8% sicher!)

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
- Teufelskralle (Harpagosid): 2,5mg/kg KGW, COX-2-Hemmer
- Meriva® Curcumin: 29× bioverfügbarer, Anti-IL-6
- Boswellia serrata: 5-LOXIN, Leukotrien-Hemmung
- Hagebutte (GOPO): Synovialflüssigkeits-Produktion
- Quercetin: 2–4g/Tag, Mastzell-Stabilisierung bei RAO
- Ingwer (Gingerole): durchblutungsfördernd, anti-inflammatorisch
- Schwarzkümmel (Thymochinon): Bronchien-Support

KRANKHEITEN: Kolik (häufigste Todesursache!), Hufrehe, Arthrose, RAO, EMS, Cushing/PPID, Lahmheit, Sommerekzem, Mauke

NOTFÄLLE (sofort Tierarzt / Call vet immediately):
- Kolik >30min / Colic
- Hufrehe akut / Acute laminitis
- Fieber >38,5°C / Fever
- Atemnot / Respiratory distress
- Schwere Lahmheit (Grad 3–4) / Severe lameness
- Festliegen / Down-and-can't-rise
- Schock / Shock

FEI-DOPING-RELEVANZ:
- Ingwer: Watchlist (vorsichtig bei Turnier)
- Teufelskralle: Karenzzeit beachten
- SUMMER BOOSTER®: 0h Karenzzeit, vollständig FEI-konform

═══════════════════════════════════════════════════
BILDANALYSE / IMAGE ANALYSIS
═══════════════════════════════════════════════════

Wenn ein Bild geschickt wird / When an image is sent:
1. Beschreibe was zu SEHEN ist (Hufeisenzustand, Mähnenzustand, Hautstelle, Maul-Region, Hufstellung etc.)
2. Gib NUR Beobachtungen — KEINE Diagnose
3. Empfehle bei Unsicherheit oder potentiellen Problemen IMMER einen Tierarztbesuch
4. Bei klar erkennbarer ernsthafter Auffälligkeit (Wunde, Lahmheit, akute Symptome) → SOFORT Tierarzt
5. Bei Bildern die nichts mit Pferden zu tun haben: höflich darauf hinweisen
6. Niemals "das ist Mauke" oder "das ist Hufrehe" sagen — immer "könnte auf X hindeuten, bitte Tierarzt zur Diagnose"

═══════════════════════════════════════════════════
KOMMUNIKATION / COMMUNICATION
═══════════════════════════════════════════════════

- Sprache: SAME as user input (DE→DE, EN→EN)
- DE: duze den Nutzer
- Schlüsselbegriffe / key terms in **fett / bold**
- Max. 220 Wörter pro Antwort / words per response
- Bei Notfällen / In emergencies: IMMER Tierarzt empfehlen / ALWAYS recommend vet
- Am Ende relevanter Antworten: passendes EQUINAT-Produkt nennen
- Keine eigenen Diagnosen / No diagnoses
- Keine verbindlichen Medikamenten-Dosierungen
- Keine Wettbewerber empfehlen / No competitors

PFERDE-PROFIL NUTZEN / USE HORSE PROFILE:
Wenn ein Pferde-Profil bekannt ist (Name, Rasse, Alter, KGW, Diagnose), nutze es:
- "Bei Hugo, deinem 22-jährigen Tinker mit EMS-Diagnose, würde ich..." statt generisch
- Berücksichtige KGW für Dosierungen
- Berücksichtige Diagnosen für Empfehlungen (z.B. EMS → MASH SYSTEM mit NSC <8%)
- Berücksichtige Alter (Senior-spezifische Empfehlungen)`;

// ═══════════════════════════════════════════════
// HEADER VALUE SANITIZATION
// ═══════════════════════════════════════════════
function sanitizeHeader(s) {
  if (!s) return '';
  return String(s).replace(/[^\x21-\x7E]/g, '');
}

// ═══════════════════════════════════════════════
// MODEL ROUTING (A/B/C Test)
// ═══════════════════════════════════════════════
const MODELS = {
  A: { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5' },
  B: { id: 'claude-sonnet-4-5',          label: 'Sonnet 4.5' },
  C: { id: 'claude-opus-4-7',            label: 'Opus 4.7' },
};

function pickModelGroup(email) {
  const forced = sanitizeHeader(process.env.FORCE_MODEL || '').toUpperCase();
  if (forced === 'A' || forced === 'B' || forced === 'C') return forced;
  const e = String(email || '').toLowerCase().trim();
  if (!e) return 'B';
  const hash = crypto.createHash('sha256').update(e).digest();
  const bucket = hash.readUInt32BE(0) % 100;
  if (bucket < 33) return 'A';
  if (bucket < 66) return 'B';
  return 'C';
}

// ═══════════════════════════════════════════════
// BUILD PROFILE CONTEXT
// ═══════════════════════════════════════════════
function buildProfileContext(profile, language) {
  if (!profile || typeof profile !== 'object') return '';
  const fields = [];
  if (profile.name) fields.push(language === 'en' ? `Name: ${profile.name}` : `Name: ${profile.name}`);
  if (profile.rasse) fields.push(language === 'en' ? `Breed: ${profile.rasse}` : `Rasse: ${profile.rasse}`);
  if (profile.alter) fields.push(language === 'en' ? `Age: ${profile.alter} years` : `Alter: ${profile.alter} Jahre`);
  if (profile.kgw) fields.push(language === 'en' ? `Body weight: ${profile.kgw} kg` : `KGW: ${profile.kgw} kg`);
  if (profile.geschlecht) fields.push(language === 'en' ? `Sex: ${profile.geschlecht}` : `Geschlecht: ${profile.geschlecht}`);
  if (profile.haltung) fields.push(language === 'en' ? `Housing: ${profile.haltung}` : `Haltung: ${profile.haltung}`);
  if (profile.nutzung) fields.push(language === 'en' ? `Use: ${profile.nutzung}` : `Nutzung: ${profile.nutzung}`);
  if (profile.diagnosen) fields.push(language === 'en' ? `Diagnoses: ${profile.diagnosen}` : `Diagnosen: ${profile.diagnosen}`);
  if (profile.fuetterung) fields.push(language === 'en' ? `Current feeding: ${profile.fuetterung}` : `Aktuelle Fütterung: ${profile.fuetterung}`);

  if (fields.length === 0) return '';

  const header = language === 'en' ? 'HORSE PROFILE (use for personalization):' : 'PFERDE-PROFIL (für Personalisierung nutzen):';
  return '\n\n' + header + '\n' + fields.join('\n');
}

// ═══════════════════════════════════════════════
// MAIN HANDLER (Streaming via SSE)
// ═══════════════════════════════════════════════
exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders() };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const headers = { ...corsHeaders(), 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' };

  try {
    const body = JSON.parse(event.body);
    const {
      messages,
      user_id,
      user_name,
      email,
      msg_count,
      access_code,
      language,    // 'de' or 'en'
      profile,     // horse profile object
    } = body;

    // ── ACCESS CODE CHECK ──
    if (!access_code || !email) {
      return errorResponse(401, 'Zugangscode erforderlich. Bitte Bot neu freischalten.');
    }
    const codeValid = await verifyAccessCode(access_code, email);
    if (!codeValid) {
      return errorResponse(401, 'Zugangscode ungültig oder widerrufen. Bitte Bot neu freischalten.');
    }

    // ── ANTHROPIC API CALL ──
    const apiKey = sanitizeHeader(process.env.ANTHROPIC_API_KEY);
    if (!apiKey) {
      return errorResponse(500, 'API-Key nicht konfiguriert');
    }

    const group = pickModelGroup(email);
    const model = MODELS[group];
    const lang = (language === 'en') ? 'en' : 'de';

    // Build full system with profile
    const profileContext = buildProfileContext(profile, lang);
    const fullSystem = SYSTEM_PROMPT + profileContext;

    const systemBlocks = [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' }
      }
    ];

    // Add profile context as 2nd system block (not cached, varies per user)
    if (profileContext) {
      systemBlocks.push({ type: 'text', text: profileContext });
    }

    const payload = JSON.stringify({
      model: model.id,
      max_tokens: 800,
      system: systemBlocks,
      messages: messages,
      stream: true,
    });

    // Stream from Anthropic, collect full response
    const streamResult = await new Promise((resolve, reject) => {
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
        let raw = '';
        res.on('data', (c) => { raw += c.toString(); });
        res.on('end', () => resolve({ raw, status: res.statusCode }));
      });
      req.on('error', reject);
      req.write(payload);
      req.end();
    });

    // Parse SSE stream from Anthropic
    let fullText = '';
    let usage = { input_tokens: 0, output_tokens: 0 };
    const lines = streamResult.raw.split('\n');
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6);
      if (!data || data === '[DONE]') continue;
      try {
        const obj = JSON.parse(data);
        if (obj.type === 'content_block_delta' && obj.delta && obj.delta.text) {
          fullText += obj.delta.text;
        }
        if (obj.type === 'message_start' && obj.message && obj.message.usage) {
          usage.input_tokens = obj.message.usage.input_tokens || 0;
        }
        if (obj.type === 'message_delta' && obj.usage) {
          usage.output_tokens = obj.usage.output_tokens || 0;
        }
      } catch (e) { /* skip malformed chunks */ }
    }

    if (!fullText) {
      return errorResponse(500, 'Keine Antwort vom KI-Modell erhalten.');
    }

    // ── LOG (best-effort, non-blocking) ──
    try {
      const lastUserMsg = messages[messages.length - 1];
      let questionText = '';
      if (lastUserMsg && lastUserMsg.content) {
        if (typeof lastUserMsg.content === 'string') {
          questionText = lastUserMsg.content;
        } else if (Array.isArray(lastUserMsg.content)) {
          // Multimodal: extract text part
          const textPart = lastUserMsg.content.find(c => c.type === 'text');
          questionText = textPart ? textPart.text : '[Bild-Anfrage]';
        }
      }
      logToNetlify({
        'form-name': 'eq-messages',
        user_id: user_id || 'anon',
        email: email || '',
        user_name: user_name || 'Tester',
        model_group: group,
        model_label: model.label,
        question: questionText.slice(0, 2000),
        answer: fullText.slice(0, 2000),
        timestamp: new Date().toISOString(),
        msg_count: String(msg_count || 0),
        tokens_in: String(usage.input_tokens),
        tokens_out: String(usage.output_tokens),
      }).catch(() => {});
    } catch (e) { /* never break */ }

    // ── RETURN STREAMING RESPONSE TO CLIENT ──
    // We send our own SSE stream back: chunked text + final metadata
    const ssePayload =
      `event: meta\ndata: ${JSON.stringify({ group, model: model.label })}\n\n` +
      `event: text\ndata: ${JSON.stringify({ text: fullText })}\n\n` +
      `event: done\ndata: ${JSON.stringify({ usage })}\n\n`;

    return {
      statusCode: 200,
      headers,
      body: ssePayload,
    };
  } catch (error) {
    return errorResponse(500, error.message);
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

function errorResponse(status, msg) {
  return {
    statusCode: status,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: msg }),
  };
}

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
