import { db } from '../lib/store.js';
import { send, readBody, fail } from '../lib/http.js';
import { checkSession } from '../lib/session.js';

// Guarda periódicamente el estado de la prueba para poder retomarla si se cae el internet.
export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return send(res, 405, { error: 'method' });
    const b = readBody(req);
    const chk = await checkSession(b.sid, b.tk);
    if (chk.error) return send(res, 403, { error: chk.error });
    const snap = b.snapshot;
    if (!snap || typeof snap !== 'object') return send(res, 400, { error: 'snapshot' });
    const size = JSON.stringify(snap).length;
    if (size > 400000) return send(res, 413, { error: 'too_big' });
    await db.set('snap:' + b.sid, snap, 60 * 60 * 24);
    return send(res, 200, { ok: true });
  } catch (e) { return fail(res, e); }
}
