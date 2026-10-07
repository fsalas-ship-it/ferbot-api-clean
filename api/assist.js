import { CONFIG } from '../lib/config.js';
import { db } from '../lib/store.js';
import { askJSON } from '../lib/ai.js';
import { send, readBody, fail } from '../lib/http.js';
import { advisorByToken } from '../lib/advisors.js';
import { getPrices } from '../lib/settings.js';
import { countryFromPhone, detectSignals, analyzePrompt, ruleCheck, spellPrompt } from '../lib/assist.js';

// FerBot 2.0. Por privacidad no se guarda el texto de las conversaciones: solo contadores de uso.
const FROMS = new Set(['cliente', 'asesor', 'bot']);
function cleanConv(c) {
  const msgs = (Array.isArray(c && c.msgs) ? c.msgs : []).slice(-60)
    .filter(m => m && FROMS.has(m.from) && String(m.text || '').trim())
    .map(m => ({ from: m.from, text: String(m.text).slice(0, 1500), time: String(m.time || '').slice(0, 20) }));
  return { id: String((c && c.id) || '').slice(0, 64), phone: String((c && c.phone) || '').slice(0, 30), msgs, windowOpen: !(c && c.windowOpen === false) };
}
async function bump(advId, fields) {
  const key = 'fb:stats:' + advId;
  const st = (await db.get(key)) || { analisis: 0, revisiones: 0, usadas: 0, utiles: 0, noUtiles: 0, desde: Date.now() };
  Object.keys(fields).forEach(k => { st[k] = (st[k] || 0) + fields[k]; });
  st.ultimo = Date.now();
  await db.set(key, st);
}
async function underLimit(advId) {
  const day = new Date().toISOString().slice(0, 10);
  const n = await db.incr('fb:day:' + advId + ':' + day);
  if (n === 1) await db.expire('fb:day:' + advId + ':' + day, 60 * 60 * 26);
  return n <= CONFIG.ferbotDailyLimit;
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return send(res, 405, { error: 'method' });
    const b = readBody(req);
    const adv = await advisorByToken(String(b.k || ''));
    if (!adv) return send(res, 401, { error: 'bad_link' });

    if (b.action === 'me') return send(res, 200, { name: adv.name, profile: adv.profile });

    if (b.action === 'analyze') {
      if (!(await underLimit(adv.id))) return send(res, 429, { error: 'daily_limit' });
      const conv = cleanConv(b.conversation);
      if (!conv.msgs.some(m => m.from === 'cliente')) return send(res, 400, { error: 'no_client_messages' });
      const country = countryFromPhone(conv.phone);
      const prices = await getPrices();
      const sig = detectSignals(conv.msgs);
      const out = await askJSON(analyzePrompt({ msgs: conv.msgs, country, prices, sig, windowOpen: conv.windowOpen, advisorName: adv.name.split(' ')[0] }), { model: CONFIG.models.assistant, maxTokens: 1500 });
      await bump(adv.id, { analisis: 1 });
      const respuesta = (Array.isArray(out.respuesta) ? out.respuesta : [out.respuesta]).map(x => String(x || '').trim()).filter(Boolean).slice(0, 4);
      return send(res, 200, {
        conversationId: conv.id,
        pais: country ? { nombre: country.name, moneda: country.cur === 'USA' ? 'USD' : country.cur, flag: country.flag } : null,
        intencion: sig,
        etapa: out.etapa || null, objecion: out.objecion || null, transferir: ['soporte', 'smb'].includes(out.transferir) ? out.transferir : null,
        estrategia: out.estrategia || null, respuesta, siguiente: out.siguiente_paso || '',
        checklist: out.checklist || {}, linkEnviado: !!out.link_enviado, resumen: out.resumen_cliente || '',
        ventana: conv.windowOpen
      });
    }

    if (b.action === 'review') {
      if (!(await underLimit(adv.id))) return send(res, 429, { error: 'daily_limit' });
      const draft = String(b.draft || '').slice(0, 2000);
      if (!draft.trim()) return send(res, 400, { error: 'empty' });
      const country = countryFromPhone(b.phone);
      const issues = ruleCheck(draft, country, await getPrices());
      let corregido = draft, cambios = [];
      try { const s = await askJSON(spellPrompt(draft), { model: CONFIG.models.spelling, maxTokens: 800 }); if (s && s.corregido) { corregido = String(s.corregido); cambios = Array.isArray(s.cambios) ? s.cambios.slice(0, 15) : []; } } catch (e) {}
      await bump(adv.id, { revisiones: 1 });
      return send(res, 200, { issues, corregido, cambios });
    }

    if (b.action === 'feedback') {
      const f = {};
      if (b.used) f.usadas = 1;
      if (b.useful === true) f.utiles = 1;
      if (b.useful === false) f.noUtiles = 1;
      await bump(adv.id, f);
      return send(res, 200, { ok: true });
    }
    return send(res, 400, { error: 'action' });
  } catch (e) { return fail(res, e); }
}
