import { db } from '../lib/store.js';
import { send, readBody, randomToken, fail } from '../lib/http.js';
import { buildClients, publicClient, publicConfig } from '../lib/sim.js';
import { getSettings, getPrices, timing, sanitizeSettings, DEFAULT_SETTINGS } from '../lib/settings.js';

const TTL = 60 * 60 * 24 * 30;
export function inviteState(inv) {
  if (!inv) return 'no_existe';
  if (inv.status === 'pendiente' && Date.now() > inv.expiresAt) return 'vencida';
  return inv.status;
}
// Una prueba interrumpida se puede retomar mientras no se haya acabado su tiempo (más 5 minutos de gracia).
function resumable(s) {
  if (!s || s.status !== 'en_curso') return false;
  const st = sanitizeSettings(s.settings || DEFAULT_SETTINGS), tm = timing(st);
  return Date.now() - s.startedAt < (tm.testSec + tm.extraSec + 300) * 1000;
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const code = String((req.query && req.query.c) || new URL(req.url, 'http://x').searchParams.get('c') || '').toUpperCase().trim();
      const inv = code ? await db.get('inv:' + code) : null;
      const state = inviteState(inv);
      let canResume = false;
      if (state === 'en_curso' && inv.sessionId) canResume = resumable(await db.get('sess:' + inv.sessionId));
      const st = await getSettings();
      return send(res, 200, { status: state, name: inv ? inv.name : null, canResume, testMin: st.testMin, extraMin: st.extraMin });
    }
    if (req.method !== 'POST') return send(res, 405, { error: 'method' });
    const b = readBody(req);
    const code = String(b.c || '').toUpperCase().trim();
    const inv = code ? await db.get('inv:' + code) : null;

    // Retomar una prueba interrumpida (mismo navegador, que guarda la sesión)
    if (b.resume) {
      if (!inv || inv.status !== 'en_curso' || inv.sessionId !== b.sid) return send(res, 403, { error: 'no_resume' });
      const s = await db.get('sess:' + b.sid);
      if (!s || s.tk !== b.tk || !resumable(s)) return send(res, 403, { error: 'no_resume' });
      const clients = [];
      for (let i = 1; i <= 20; i++) { const c = await db.get('sc:' + s.sid + ':c' + i); if (!c) break; clients.push(publicClient(c)); }
      const snapshot = await db.get('snap:' + s.sid);
      return send(res, 200, { sid: s.sid, tk: s.tk, name: s.name, l4: s.l4, startedAt: s.startedAt, clients, config: publicConfig(sanitizeSettings(s.settings || DEFAULT_SETTINGS), s.prices, s.intensity), snapshot });
    }

    const state = inviteState(inv);
    if (state !== 'pendiente') return send(res, 403, { error: 'invite_' + state });
    if (!b.consent) return send(res, 400, { error: 'consent' });

    const st = await getSettings();
    const prices = await getPrices();
    const intensity = inv.intensity === 'entrenamiento' ? 'entrenamiento' : 'evaluacion';
    const clients = buildClients(inv.profile, st, intensity);
    const sid = 's' + Date.now().toString(36) + randomToken().slice(0, 6);
    const tk = randomToken();
    const now = Date.now();
    await db.set('sess:' + sid, { sid, code, tk, profile: inv.profile, intensity, l4: inv.l4, name: inv.name, email: inv.email || '', phone: inv.phone || '', contact: inv.contact || '',
      startedAt: now, status: 'en_curso', settings: st, prices, testSec: timing(st).testSec }, TTL);
    for (const c of clients) await db.set('sc:' + sid + ':' + c.id, c, TTL);
    await db.set('inv:' + code, Object.assign({}, inv, { status: 'en_curso', sessionId: sid, startedAt: now }));
    return send(res, 200, { sid, tk, name: inv.name, l4: inv.l4, startedAt: now, clients: clients.map(publicClient), config: publicConfig(st, prices, intensity) });
  } catch (e) { return fail(res, e); }
}
