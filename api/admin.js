import { CONFIG } from '../lib/config.js';
import { db, storeReady } from '../lib/store.js';
import { send, readBody, isAdmin, randomCode, fail } from '../lib/http.js';
import { inviteState } from './start.js';
import { getSettings, sanitizeSettings, DEFAULT_SETTINGS, getPrices, sanitizePrices } from '../lib/settings.js';
import { PRICES } from '../lib/data.js';
import { practiceSummary } from '../lib/advisors.js';
import { randomToken } from '../lib/http.js';

function summary(r) {
  return { sid: r.sid, name: r.name, contact: r.contact, email: r.email || '', phone: r.phone || '', notes: r.notes || '', profile: r.profile, intensity: r.intensity || 'evaluacion', createdAt: r.createdAt, status: r.status,
    levelReached: r.levelReached, extraGranted: r.extraGranted, score: r.score, decision: r.decision,
    sales: r.metrics && r.metrics.sales, buyersSeen: r.metrics && r.metrics.buyersSeen };
}

export default async function handler(req, res) {
  try {
    const q = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams);
    if (req.method === 'GET' && q.action === 'ping') {
      return send(res, 200, { db: storeReady(), ai: !!process.env.ANTHROPIC_API_KEY || process.env.MOCK_AI === '1', pass: (process.env.ADMIN_PASSWORD || '').length >= 8, auth: isAdmin(req) });
    }
    if (!isAdmin(req)) return send(res, 401, { error: 'unauthorized' });

    if (req.method === 'GET') {
      if (q.action === 'list') {
        const codes = await db.lrange('inv:list', 0, 299);
        const invs = (await db.mget(codes.map(c => 'inv:' + c))).filter(Boolean).map(i => Object.assign(i, { state: inviteState(i) }));
        const sids = await db.lrange('res:list', 0, 299);
        const results = (await db.mget(sids.map(s => 'res:' + s))).filter(Boolean).map(summary);
        const aids = await db.lrange('adv:list', 0, 299);
        const advisors = (await db.mget(aids.map(a => 'adv:' + a))).filter(Boolean);
        const fbStats = await db.mget(advisors.map(a => 'fb:stats:' + a.id));
        advisors.forEach((a, i) => { a.ferbot = fbStats[i] || null; });
        const psids = await db.lrange('prac:list', 0, 999);
        const practices = (await db.mget(psids.map(s => 'res:' + s))).filter(Boolean).map(practiceSummary);
        return send(res, 200, { invites: invs, results, advisors, practices });
      }
      if (q.action === 'settings') return send(res, 200, { settings: await getSettings(), defaults: DEFAULT_SETTINGS, prices: await getPrices(), defaultPrices: PRICES });
      if (q.action === 'result') {
        const r = await db.get('res:' + String(q.sid || ''));
        return r ? send(res, 200, r) : send(res, 404, { error: 'not_found' });
      }
      return send(res, 400, { error: 'action' });
    }

    if (req.method !== 'POST') return send(res, 405, { error: 'method' });
    const b = readBody(req);
    if (b.action === 'invite') {
      const name = String(b.name || '').trim().slice(0, 120);
      if (name.length < 3) return send(res, 400, { error: 'name' });
      const profile = b.profile === 'internos' ? 'internos' : 'externos';
      const l4 = 7;
      const intensity = b.intensity === 'entrenamiento' ? 'entrenamiento' : 'evaluacion';
      let code; do { code = randomCode(8); } while (await db.get('inv:' + code));
      const email = String(b.email || '').trim().slice(0, 160), phone = String(b.phone || '').trim().slice(0, 40);
      const inv = { code, name, email, phone, contact: [email, phone].filter(Boolean).join(' · '), profile, intensity, l4, status: 'pendiente', createdAt: Date.now(), expiresAt: Date.now() + CONFIG.inviteValidDays * 86400000, sessionId: null };
      await db.set('inv:' + code, inv);
      await db.lpush('inv:list', code);
      return send(res, 200, inv);
    }
    if (b.action === 'saveSettings') {
      const st = sanitizeSettings(b.settings || {});
      await db.set('settings', st);
      return send(res, 200, { settings: st });
    }
    if (b.action === 'advisor') {
      const name = String(b.name || '').trim().slice(0, 120);
      if (name.length < 3) return send(res, 400, { error: 'name' });
      const id = 'a' + Date.now().toString(36) + randomToken().slice(0, 4), token = randomToken();
      const adv = { id, token, name, email: String(b.email || '').trim().slice(0, 160), phone: String(b.phone || '').trim().slice(0, 40), profile: b.profile === 'internos' ? 'internos' : 'externos', active: true, createdAt: Date.now() };
      await db.set('adv:' + id, adv); await db.set('advtk:' + token, id); await db.lpush('adv:list', id);
      return send(res, 200, adv);
    }
    if (b.action === 'advisorToggle') {
      const adv = await db.get('adv:' + String(b.id || ''));
      if (!adv) return send(res, 404, { error: 'not_found' });
      adv.active = !adv.active; await db.set('adv:' + adv.id, adv);
      return send(res, 200, adv);
    }
    if (b.action === 'advisorNewLink') {
      const adv = await db.get('adv:' + String(b.id || ''));
      if (!adv) return send(res, 404, { error: 'not_found' });
      await db.del('advtk:' + adv.token); adv.token = randomToken(); await db.set('advtk:' + adv.token, adv.id); await db.set('adv:' + adv.id, adv);
      return send(res, 200, adv);
    }
    if (b.action === 'savePrices') {
      const pr = sanitizePrices(b.prices || PRICES);
      await db.set('prices', pr);
      return send(res, 200, { prices: pr });
    }
    if (b.action === 'resetInvite') {
      const inv = await db.get('inv:' + String(b.code || ''));
      if (!inv) return send(res, 404, { error: 'not_found' });
      Object.assign(inv, { status: 'pendiente', sessionId: null, expiresAt: Date.now() + CONFIG.inviteValidDays * 86400000 });
      await db.set('inv:' + inv.code, inv);
      return send(res, 200, inv);
    }
    if (b.action === 'deleteInvite') {
      await db.del('inv:' + String(b.code || '')); await db.lrem('inv:list', String(b.code || ''));
      return send(res, 200, { ok: true });
    }
    if (b.action === 'decision') {
      const r = await db.get('res:' + String(b.sid || ''));
      if (!r) return send(res, 404, { error: 'not_found' });
      r.decision = ['aprobado', 'no_aprobado', 'pendiente'].includes(b.decision) ? b.decision : null;
      r.notes = String(b.notes || '').slice(0, 4000);
      if (b.emailDraft && typeof b.emailDraft === 'object') r.emailDraft = { asunto: String(b.emailDraft.asunto || '').slice(0, 300), cuerpo: String(b.emailDraft.cuerpo || '').slice(0, 8000), tipo: r.decision };
      r.decidedAt = Date.now();
      await db.set('res:' + r.sid, r);
      return send(res, 200, { ok: true });
    }
    if (b.action === 'deleteResult') {
      const r0 = await db.get('res:' + String(b.sid || ''));
      await db.del('res:' + String(b.sid || '')); await db.lrem('res:list', String(b.sid || ''));
      if (r0 && r0.kind === 'practica') { await db.lrem('prac:list', r0.sid); await db.lrem('prac:' + r0.advisorId, r0.sid); }
      return send(res, 200, { ok: true });
    }
    return send(res, 400, { error: 'action' });
  } catch (e) { return fail(res, e); }
}
