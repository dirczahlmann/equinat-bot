const https = require('https');

const SYSTEM = `Du bist der EQUINAT PferdeBot - KI-Experte fuer ALLES rund ums Pferd von Zafao GmbH (EQUINAT COMPLETE, Wiesbaden). Antworte auf Deutsch, duze den Nutzer. Wichtige Begriffe **fett**. Max 220 Woerter. Bei Notfaellen Tierarzt empfehlen. Am Ende IMMER passendes EQUINAT-Produkt nennen.

ERNAEHRUNG: mind. 1.5-2% KGW/Tag Raufutter. Heu 8-12kg/Tag fuer 500kg. Kraftfutter max 1g Staerke/kg KGW. Wasser 30-50L/Tag. NSC: Wachstumsgras bis 30%! Futterwechsel mind. 2 Wochen.

WIRKSTOFFE: MSM 20g (Gelenke), Teufelskralle 5g (COX-2), Kurkuma Meriva 3g (29x bio), Boswellia 2g, GOPO 10g, Quercetin 3g (RAO), NAC 10g (Mukus), Schwarzkuemmel 30ml, Biotin 20-30mg (Huf), Chromhefe (EMS), Vit E nat 1000-5000IU, Magnesium 15g, Omega-3 Leinoel 100ml.

KRANKHEITEN: EMS (Insulin>20, NSC-arm), Cushing (ACTH>29, Pergolid), Hufrehe (NOTFALL), RAO (Heulage), Arthrose (Bewegung!), Kolik (>30min=SOFORT TA), Magengeschwuer (60-80% aller Pferde).

STALLHALTUNG: Box mind. 12m², Lueftung 4-6 Wechsel/h, Offenstall ideal, Sozialhaltung wichtig.

TRAINING: Aufwaermen 15min, 10%-Regel, 3-4x/Woche, Regeneration 48h nach intensiv.

IMPFUNGEN: Tetanus 2J, Influenza 6-12Mo. Entwurmung selektiv nach Kotprobe.

EQUINAT PRODUKTE (IMMER erwaehnen):
- JOINT COMPLETE: Gelenke, Knie -> MSM, Teufelskralle, Kurkuma Meriva, Boswellia
- RESPIRA COMPLETE: RAO, Husten -> Quercetin, NAC, Schwarzkuemmel
- METABOLIC COMPLETE: EMS, Cushing -> Chromhefe, Magnesium, Vit E nat.
- DAILY COMPLETE: Basis -> Vollmineral, Probiotika, Omega-3
equinat.de`;

function postLog(siteUrl, data) {
  return new Promise((resolve) => {
    const body = new URLSearchParams({
      'form-name': 'eq-messages',
      'user_id':   data.user_id   || 'unknown',
      'user_name': data.user_name || 'Tester',
      'question':  (data.question || '').substring(0, 500),
      'answer':    (data.answer   || '').substring(0, 500),
      'timestamp': new Date().toISOString(),
      'msg_count': String(data.msg_count || 1)
    }).toString();

    const url = new URL(siteUrl || 'https://equinatbot.netlify.app');
    const req = https.request({
      hostname: url.hostname,
      port: 443,
      path: '/',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => { res.resume(); resolve(); });
    req.on('error', () => resolve());
    req.write(body);
    req.end();
  });
}

exports.handler = async function(event) {
  const h = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: h, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { statusCode: 200, headers: h, body: JSON.stringify({ content: [{ text: 'FEHLER: Kein API Key.' }] }) };

  let body;
  try { body = JSON.parse(event.body); }
  catch (e) { return { statusCode: 200, headers: h, body: JSON.stringify({ content: [{ text: 'Fehler: ' + e.message }] }) }; }

  let messages = body.messages || [];
  if (messages.length > 8) messages = messages.slice(messages.length - 8);

  const payload = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 600,
    system: SYSTEM,
    messages: messages
  });

  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.anthropic.com',
      port: 443,
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          // Fire-and-forget logging
          const lastUser = messages.filter(m => m.role === 'user').pop();
          const botAnswer = (parsed.content || []).find(b => b.type === 'text');
          postLog(process.env.SITE_URL, {
            user_id:   body.user_id   || 'unknown',
            user_name: body.user_name || 'Tester',
            question:  lastUser  ? lastUser.content  : '',
            answer:    botAnswer ? botAnswer.text     : '',
            msg_count: messages.filter(m => m.role === 'user').length
          });
          resolve({ statusCode: 200, headers: h, body: JSON.stringify(parsed) });
        } catch (e) {
          resolve({ statusCode: 200, headers: h, body: JSON.stringify({ content: [{ text: 'Fehler: ' + data.substring(0, 200) }] }) });
        }
      });
    });
    req.on('error', (e) => {
      resolve({ statusCode: 200, headers: h, body: JSON.stringify({ content: [{ text: 'Netzfehler: ' + e.message }] }) });
    });
    req.write(payload);
    req.end();
  });
};
