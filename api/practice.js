import { db } from '../lib/store.js';
import { send, readBody, randomToken, fail } from '../lib/http.js';
import { buildClients, publicClient, publicConfig } from '../lib/sim.js';
import { getSettings, getPrices, timing, sanitizeSettings, DEFAULT_SETTINGS } from '../lib/settings.js';
import { advisorByToken, practiceSummary } from '../lib/advisors.js';

const TTL = 60 * 60 * 24 * 30;
// Panel y prácticas del asesor. Se accede con el link personal que le envía el administrador.
export default async function handler(req, res) {
  try {
    const q = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams);
    const b = req.method === 'POST' ? readBody(req) : {};
    const adv = await advisorByToken(String(q.k || b.k || ''));
    if (!adv) return send(res, 403, { error: 'bad_link' });

    if (req.method === 'GET') {
      const sids = await db.lrange('prac:' + adv.id, 0, 199);
      const list = (await db.mget(sids.map(s => 'res:' + s))).filter(Boolean).map(practiceSummary);
      const st = await getSettings();
      return send(res, 200, { advisor: { name: adv.name, profile: adv.profile }, practices: list, testMin: st.testMin, extraMin: st.extraMin });
    }
    if (req.method !== 'POST') return send(res, 405, { error: 'method' });

    if (b.action === 'start') {
      const st = await getSettings(), prices = await getPrices();
      const clients = buildClients(adv.profile, st, 'entrenamiento', { handoff: true, prices });
      const sid = 'p' + Date.now().toString(36) + randomToken().slice(0, 6), tk = randomToken(), now = Date.now();
      await db.set('sess:' + sid, { sid, kind: 'practica', advisorId: adv.id, tk, profile: adv.profile, intensity: 'entrenamiento', name: adv.name, email: adv.email || '', phone: adv.phone || '',
        startedAt: now, status: 'en_curso', settings: st, prices, testSec: timing(st).testSec, maxMin: 240 }, TTL);
      for (const c of clients) await db.set('sc:' + sid + ':' + c.id, c, TTL);
      return send(res, 200, { sid, tk, name: adv.name, startedAt: now, clients: clients.map(publicClient), config: publicConfig(st, prices, 'entrenamiento') });
    }
    if (b.action === 'resume') {
      const s = await db.get('sess:' + String(b.sid || ''));
      if (!s || s.kind !== 'practica' || s.advisorId !== adv.id || s.tk !== b.tk || s.status !== 'en_curso') return send(res, 403, { error: 'no_resume' });
      const clients = [];
      for (let i = 1; i <= 20; i++) { const c = await db.get('sc:' + s.sid + ':c' + i); if (!c) break; clients.push(publicClient(c)); }
      return send(res, 200, { sid: s.sid, tk: s.tk, name: s.name, startedAt: s.startedAt, clients, config: publicConfig(sanitizeSettings(s.settings || DEFAULT_SETTINGS), s.prices, 'entrenamiento'), snapshot: await db.get('snap:' + s.sid) });
    }
    if (b.action === 'result') {
      const r = await db.get('res:' + String(b.sid || ''));
      if (!r || r.kind !== 'practica' || r.advisorId !== adv.id) return send(res, 404, { error: 'not_found' });
      return send(res, 200, r);
    }
    return send(res, 400, { error: 'action' });
  } catch (e) { return fail(res, e); }
}
