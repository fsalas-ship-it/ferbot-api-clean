import { db } from '../lib/store.js';
import { send, readBody, fail } from '../lib/http.js';
import { checkSession, cleanMsgs } from '../lib/session.js';
import { computeMetrics, computeScore } from '../lib/sim.js';

const STATUSES = new Set(['pendiente', 'compro', 'no_compro', 'transferido', 'enrutado', 'sin_cerrar', 'lo_pensare', 'sin_respuesta', 'cerrada_tiempo', 'intencion', 'link_enviado']);
const num = v => (v == null || v === '' ? null : Number(v));

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return send(res, 405, { error: 'method' });
    const b = readBody(req);
    const chk = await checkSession(b.sid, b.tk);
    if (chk.error) return send(res, 403, { error: chk.error });
    const s = chk.s, data = b.data || {};
    const sent = new Map((Array.isArray(data.conversations) ? data.conversations : []).slice(0, 20).map(c => [String(c.id), c]));
    const conversations = [];
    for (let i = 1; i <= 20; i++) {
      const hidden = await db.get('sc:' + s.sid + ':c' + i);
      if (!hidden) break;
      const c = sent.get(hidden.id) || {};
      conversations.push(Object.assign({}, hidden, {
        status: STATUSES.has(c.status) ? c.status : 'pendiente', plan: c.plan || null,
        arrivedAt: num(c.arrivedAt), endedAt: num(c.endedAt), msgs: cleanMsgs(c.msgs, 200),
        ghostState: c.ghostState || hidden.ghostState || null, ghostPushes: Number(c.ghostPushes) || 0,
        thinkAt: num(c.thinkAt), reactivated: !!(c.reactivated || hidden.reactivated), annoyed: !!(c.annoyed || hidden.annoyed), annoyedAt: num(c.annoyedAt), extra: !!c.extra, transfer: ['soporte', 'smb'].includes(c.transfer) ? c.transfer : null,
        stage: c.status === 'compro' ? 'venta' : (c.status === 'intencion' || c.status === 'link_enviado') ? c.status : null
      }));
    }
    const now = Date.now();
    const d = {
      sid: s.sid, kind: s.kind || 'prueba', advisorId: s.advisorId || null, code: s.code || null, name: s.name, contact: s.contact || '', email: s.email || '', phone: s.phone || '', profile: s.profile, intensity: s.intensity || 'evaluacion', l4: s.l4, testSec: s.testSec || 600, settings: s.settings || null, prices: s.prices || null,
      createdAt: s.startedAt, endedAt: now, durationMs: now - s.startedAt, reason: String(data.reason || '').slice(0, 20),
      levelReached: Math.min(4, Math.max(1, Number(data.levelReached) || 1)), extraGranted: !!data.extraGranted,
      pauses: Number(data.pauses) || 0, pausedMs: Number(data.pausedMs) || 0,
      conversations, away: (Array.isArray(data.away) ? data.away : []).slice(0, 200).map(a => ({ from: Number(a.from) || 0, to: Number(a.to) || 0 })),
      errors: (Array.isArray(data.errors) ? data.errors : []).slice(0, 50), status: 'finalizada', evaluation: { convs: {}, summary: null }, decision: null, notes: ''
    };
    d.metrics = computeMetrics(d);
    d.score = computeScore(d);
    await db.set('res:' + s.sid, d);
    await db.del('snap:' + s.sid);
    if (s.kind === 'practica') { await db.lpush('prac:list', s.sid); await db.lpush('prac:' + s.advisorId, s.sid); }
    else await db.lpush('res:list', s.sid);
    await db.set('sess:' + s.sid, Object.assign({}, s, { status: 'terminada', endedAt: now }), 60 * 60 * 24 * 30);
    const inv = s.code ? await db.get('inv:' + s.code) : null;
    if (inv) await db.set('inv:' + s.code, Object.assign({}, inv, { status: 'terminada', endedAt: now }));
    return send(res, 200, { ok: true });
  } catch (e) { return fail(res, e); }
}
