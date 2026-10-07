import crypto from 'node:crypto';

export function send(res, code, obj) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}
export function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body) { try { return JSON.parse(req.body); } catch (e) { return {}; } }
  return {};
}
export function isAdmin(req) {
  const pass = process.env.ADMIN_PASSWORD || '';
  const given = String(req.headers['x-admin-password'] || '');
  if (pass.length < 8) return false;
  const a = crypto.createHash('sha256').update(pass).digest();
  const b = crypto.createHash('sha256').update(given).digest();
  return crypto.timingSafeEqual(a, b);
}
const ALPH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function randomCode(n = 8) {
  const bytes = crypto.randomBytes(n);
  let s = ''; for (let i = 0; i < n; i++) s += ALPH[bytes[i] % ALPH.length];
  return s;
}
export function randomToken() { return crypto.randomBytes(24).toString('hex'); }
export function fail(res, e) {
  const code = e && e.code;
  if (code === 'NO_DB') return send(res, 500, { error: 'no_db', message: 'Falta conectar la base de datos (Upstash Redis) en Vercel.' });
  if (code === 'NO_API_KEY') return send(res, 500, { error: 'no_api_key', message: 'Falta configurar ANTHROPIC_API_KEY en Vercel.' });
  if (code === 'rate_limited') return send(res, 429, { error: 'rate_limited' });
  console.error(e);
  return send(res, 500, { error: code || 'server_error' });
}
