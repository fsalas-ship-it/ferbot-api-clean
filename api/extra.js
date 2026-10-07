import { CONFIG } from '../lib/config.js';
import { askJSON } from '../lib/ai.js';
import { send, readBody, fail } from '../lib/http.js';
import { checkSession, cleanMsgs } from '../lib/session.js';
import { extraPrompt } from '../lib/sim.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return send(res, 405, { error: 'method' });
    const b = readBody(req);
    const chk = await checkSession(b.sid, b.tk, { countCall: true });
    if (chk.error) return send(res, 403, { error: chk.error });
    const convs = (Array.isArray(b.convs) ? b.convs : []).slice(0, 12)
      .map(c => ({ id: String(c.id || '').slice(0, 8), annoyed: !!c.annoyed, msgs: cleanMsgs(c.msgs, 60) }))
      .filter(c => /^c\d+$/.test(c.id) && c.msgs.some(m => m.f === 'v'));
    if (!convs.length) return send(res, 200, { elegibles: [] });
    const out = await askJSON(extraPrompt(convs), { model: CONFIG.models.extra, maxTokens: 400 });
    const ids = new Set(convs.map(c => c.id));
    const elegibles = (Array.isArray(out && out.elegibles) ? out.elegibles : []).map(x => String(x && x.id)).filter(id => ids.has(id));
    return send(res, 200, { elegibles: [...new Set(elegibles)] });
  } catch (e) { return fail(res, e); }
}
