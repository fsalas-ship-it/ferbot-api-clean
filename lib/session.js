import { CONFIG } from './config.js';
import { db } from './store.js';

// Valida la sesión de una prueba en curso y el número de llamadas a la IA.
export async function checkSession(sid, tk, { countCall = false } = {}) {
  if (!sid || !tk || typeof sid !== 'string' || typeof tk !== 'string') return { error: 'bad_session' };
  const s = await db.get('sess:' + sid);
  if (!s || s.tk !== tk) return { error: 'bad_session' };
  if (s.status !== 'en_curso') return { error: 'session_closed' };
  const maxMin = s.maxMin || Math.max(CONFIG.sessionMaxMin, ((s.testSec || 600) / 60) + 15);
  if (Date.now() - s.startedAt > maxMin * 60000) return { error: 'session_expired' };
  if (countCall) {
    const n = await db.incr('sess:' + sid + ':calls');
    if (n === 1) await db.expire('sess:' + sid + ':calls', 60 * 60 * 24);
    if (n > CONFIG.maxAiCallsPerSession) return { error: 'too_many_calls' };
  }
  return { s };
}
export function cleanMsgs(msgs, max = 200) {
  if (!Array.isArray(msgs)) return [];
  return msgs.slice(-max).filter(m => m && ['c', 'v', 's', 'b'].includes(m.f)).map(m => {
    const o = { f: m.f, t: Math.max(0, Number(m.t) || 0), x: String(m.x || '').slice(0, 2000) };
    if (m.f === 'v') { o.k = Number(m.k) || 0; o.ty = Number(m.ty) || 0; o.p = !!m.p; o.pc = Number(m.pc) || 0; o.aw = m.aw == null ? null : Number(m.aw); if (m.push) o.push = true; }
    return o;
  });
}
