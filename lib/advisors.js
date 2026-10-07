import { db } from './store.js';
// Asesores de planta: cada uno tiene un link personal con un token secreto.
export async function advisorByToken(k) {
  if (!k || typeof k !== 'string' || k.length < 20) return null;
  const id = await db.get('advtk:' + k);
  if (!id) return null;
  const a = await db.get('adv:' + id);
  return a && a.active !== false ? a : null;
}
export function practiceSummary(r) {
  return { sid: r.sid, advisorId: r.advisorId, name: r.name, createdAt: r.createdAt, status: r.status, durationMs: r.durationMs, reason: r.reason,
    score: r.score, sales: r.metrics && r.metrics.sales, buyersSeen: r.metrics && r.metrics.buyersSeen, pauses: r.pauses || 0 };
}
