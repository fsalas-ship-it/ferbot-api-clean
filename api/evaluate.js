import { CONFIG } from '../lib/config.js';
import { db } from '../lib/store.js';
import { askJSON } from '../lib/ai.js';
import { send, readBody, isAdmin, fail } from '../lib/http.js';
import { advisorByToken } from '../lib/advisors.js';
import { convEvalPrompt, summaryPrompt, convQuality, computeScore } from '../lib/sim.js';

// Evalúa una prueba por partes (una conversación por llamada y luego el resumen)
// para que cada llamada termine rápido dentro del límite de tiempo de Vercel.
export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return send(res, 405, { error: 'method' });
    const b = readBody(req);
    const key = 'res:' + String(b.sid || '');
    const d = await db.get(key);
    if (!d) return send(res, 404, { error: 'not_found' });
    // El administrador evalúa todo; un asesor solo puede evaluar sus propias prácticas
    if (!isAdmin(req)) {
      const adv = await advisorByToken(String(b.k || ''));
      if (!adv || d.kind !== 'practica' || d.advisorId !== adv.id) return send(res, 401, { error: 'unauthorized' });
    }
    d.evaluation = d.evaluation || { convs: {}, summary: null };
    if (b.part === 'conv') {
      const c = d.conversations.find(x => x.id === b.cid);
      if (!c || !c.msgs.some(m => m.f === 'v')) return send(res, 400, { error: 'no_conv' });
      const e = await askJSON(convEvalPrompt(d, c), { model: CONFIG.models.evaluation, maxTokens: 3000 });
      e.calidad = convQuality(e);
      const fresh = await db.get(key) || d;
      fresh.evaluation = fresh.evaluation || { convs: {}, summary: null };
      fresh.evaluation.convs[c.id] = e;
      fresh.score = computeScore(fresh);
      await db.set(key, fresh);
      return send(res, 200, { ok: true, calidad: e.calidad });
    }
    if (b.part === 'summary') {
      const s = await askJSON(summaryPrompt(d), { model: CONFIG.models.evaluation, maxTokens: 5000 });
      d.evaluation.summary = s;
      d.score = computeScore(d);
      d.status = 'evaluada';
      await db.set(key, d);
      return send(res, 200, { ok: true, score: d.score });
    }
    return send(res, 400, { error: 'part' });
  } catch (e) { return fail(res, e); }
}
