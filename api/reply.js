import { CONFIG } from '../lib/config.js';
import { db } from '../lib/store.js';
import { askJSON } from '../lib/ai.js';
import { send, readBody, fail } from '../lib/http.js';
import { checkSession, cleanMsgs } from '../lib/session.js';
import { clientPrompt, parseLinks, checkLink } from '../lib/sim.js';
import { DEFAULT_SETTINGS, sanitizeSettings } from '../lib/settings.js';

const ESTADOS = new Set(['abierto', 'lo_pensare', 'compro', 'pago', 'no_compro']);
const PLANS = new Set(['expert', 'duo', 'groups']);

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return send(res, 405, { error: 'method' });
    const b = readBody(req);
    const chk = await checkSession(b.sid, b.tk, { countCall: true });
    if (chk.error) return send(res, 403, { error: chk.error });
    const key = 'sc:' + b.sid + ':' + String(b.cid || '');
    const c = await db.get(key);
    if (!c) return send(res, 404, { error: 'no_client' });

    // Cambios de estado que reporta el navegador (molestia, regreso, fantasma recuperado)
    const st = b.st || {};
    let changed = false;
    if (st.annoyed && !c.annoyed) { c.annoyed = true; c.buyer = Math.random() < CONFIG.annoyedBuyProb; changed = true; }
    if (st.reactivated && !c.reactivated) { c.reactivated = true; if (!c.buyer && !c.annoyed && !c.routing) c.buyer = Math.random() < CONFIG.reactBuyProb; if (c.buyer) c.buyerEver = true; changed = true; }
    if (st.ghostEngaged && !c.ghostEngaged) { c.ghostEngaged = true; changed = true; }
    c.thinking = !!st.thinking;
    if (st.buying && !c.buying) { c.buying = true; changed = true; }
    c.postSale = !!st.postSale;
    const msgs = cleanMsgs(b.msgs, 80);
    // Inconveniente de pago: se presenta una sola vez, la primera vez que llega un link correcto
    const links = parseLinks(msgs), last = links[links.length - 1];
    const prices = chk.s.prices;
    const linkOk = last && !checkLink(last, c, prices, chk.s.profile).length;
    let raisingNow = false;
    if (c.buying && c.payIssue && linkOk && !c.payIssueRaised) raisingNow = true;
    if (changed) await db.set(key, c, 60 * 60 * 24 * 30);
    const out = await askJSON(clientPrompt(c, msgs, chk.s.profile, sanitizeSettings(chk.s.settings || DEFAULT_SETTINGS), prices), { model: CONFIG.models.client, maxTokens: 600 });
    if (raisingNow) { c.payIssueRaised = true; await db.set(key, c, 60 * 60 * 24 * 30); }
    let mensajes = Array.isArray(out && out.mensajes) ? out.mensajes.map(x => String(x).slice(0, 400)).filter(x => x.trim()).slice(0, 3) : [];
    if (!mensajes.length) mensajes = ['ok'];
    let estado = ESTADOS.has(out && out.estado) ? out.estado : 'abierto';
    if (c.routing && (estado === 'compro' || estado === 'pago')) estado = 'abierto';
    // El pago solo vale con un link correcto y, si hubo inconveniente, después de presentarlo
    // La venta cuenta en cuanto el cliente confirma el pago con un link correcto
    if (estado === 'pago' && !linkOk) estado = 'abierto';
    if (c.postSale) estado = 'abierto';
    if (estado === 'compro' && c.buying) estado = 'abierto';
    const plan = estado === 'pago' && last ? last.plan : (PLANS.has(out && out.plan) ? out.plan : null);
    return send(res, 200, { mensajes, estado, plan });
  } catch (e) { return fail(res, e); }
}
