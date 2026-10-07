// Almacenamiento en Redis (Upstash) por su API REST, sin dependencias.
// En Vercel, la integración de Upstash crea las variables KV_REST_API_URL y KV_REST_API_TOKEN
// (o UPSTASH_REDIS_REST_URL y UPSTASH_REDIS_REST_TOKEN).
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
const USE_MEM = !URL_ && process.env.LOCAL_MEMORY_STORE === '1'; // solo para pruebas locales
const mem = globalThis.__simMem || (globalThis.__simMem = new Map());

export function storeReady() { return !!(URL_ && TOKEN) || USE_MEM; }

function memCmd(a) {
  const [c, k, ...rest] = a;
  switch (c) {
    case 'GET': return mem.has(k) ? mem.get(k) : null;
    case 'SET': mem.set(k, rest[0]); return 'OK';
    case 'DEL': return mem.delete(k) ? 1 : 0;
    case 'INCR': { const v = Number(mem.get(k) || 0) + 1; mem.set(k, String(v)); return v; }
    case 'EXPIRE': return 1;
    case 'LPUSH': { const l = mem.get(k) || []; l.unshift(...rest); mem.set(k, l); return l.length; }
    case 'LRANGE': { const l = mem.get(k) || []; const s = Number(rest[0]), e = Number(rest[1]); return l.slice(s, e === -1 ? undefined : e + 1); }
    case 'LREM': { const l = (mem.get(k) || []).filter(x => x !== rest[1]); mem.set(k, l); return 1; }
    case 'MGET': return [k, ...rest].map(x => mem.has(x) ? mem.get(x) : null);
    default: throw new Error('Comando no soportado en memoria: ' + c);
  }
}

async function cmd(args) {
  if (USE_MEM) return memCmd(args);
  if (!URL_ || !TOKEN) { const e = new Error('NO_DB'); e.code = 'NO_DB'; throw e; }
  const r = await fetch(URL_, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args)
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) { const e = new Error('DB_ERROR ' + (j.error || r.status)); e.code = 'DB_ERROR'; throw e; }
  return j.result;
}

const parse = v => (v == null ? null : JSON.parse(v));
export const db = {
  async get(k) { return parse(await cmd(['GET', k])); },
  async set(k, v, ttlSec) {
    const s = JSON.stringify(v);
    return cmd(ttlSec ? ['SET', k, s, 'EX', String(ttlSec)] : ['SET', k, s]);
  },
  del: k => cmd(['DEL', k]),
  incr: k => cmd(['INCR', k]),
  expire: (k, s) => cmd(['EXPIRE', k, String(s)]),
  lpush: (k, v) => cmd(['LPUSH', k, v]),
  lrange: (k, a, b) => cmd(['LRANGE', k, String(a), String(b)]),
  lrem: (k, v) => cmd(['LREM', k, '0', v]),
  async mget(keys) { if (!keys.length) return []; const vs = await cmd(['MGET', ...keys]); return vs.map(parse); }
};
