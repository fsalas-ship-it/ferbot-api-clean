// Configuración editable desde el panel del reclutador (pestaña Configuración).
// Se guarda en la base de datos; si no existe, se usan estos valores por defecto.
import { db } from './store.js';

export const DEFAULT_SETTINGS = {
  testMin: 17,                // duración de la prueba en minutos
  extraMin: 3,                // tiempo extra por buena gestión (0 lo desactiva)
  patienceSec: [120, 120, 120, 120], // paciencia de los clientes en cada nivel antes de molestarse
  arrivalGapSec: [40, 70],    // segundos entre la llegada de un cliente nuevo y el siguiente
  replyDelaySec: [5, 10],     // pausa del cliente antes de empezar a escribir su respuesta
  typingMsPerChar: 70,        // velocidad de escritura del cliente (milisegundos por letra)
  minBuyMin: 5,               // un cliente no compra antes de estos minutos de conversación
  typicalBuyMin: 7.5,         // con buena gestión, compra cerca de este minuto
  buyerRatePct: 30            // % de clientes dispuestos a comprar en cada nivel
};
const LEVEL_CUTS = [0.2, 0.45, 0.7, 1];

const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function sanitizeSettings(x = {}) {
  const D = DEFAULT_SETTINGS;
  const s = {};
  s.testMin = clamp(Math.round(num(x.testMin, D.testMin)), 5, 30);
  s.extraMin = clamp(Math.round(num(x.extraMin, D.extraMin)), 0, 10);
  const pat = Array.isArray(x.patienceSec) ? x.patienceSec : D.patienceSec;
  s.patienceSec = [0, 1, 2, 3].map(i => clamp(Math.round(num(pat[i], D.patienceSec[i])), 15, 900));
  const gap = Array.isArray(x.arrivalGapSec) ? x.arrivalGapSec : D.arrivalGapSec;
  const g0 = clamp(num(gap[0], D.arrivalGapSec[0]), 3, 180);
  s.arrivalGapSec = [g0, clamp(num(gap[1], D.arrivalGapSec[1]), g0, 240)];
  const rd = Array.isArray(x.replyDelaySec) ? x.replyDelaySec : D.replyDelaySec;
  const r0 = clamp(num(rd[0], D.replyDelaySec[0]), 0.5, 60);
  s.replyDelaySec = [r0, clamp(num(rd[1], D.replyDelaySec[1]), r0, 90)];
  s.typingMsPerChar = clamp(Math.round(num(x.typingMsPerChar, D.typingMsPerChar)), 0, 200);
  s.minBuyMin = clamp(num(x.minBuyMin, D.minBuyMin), 0.5, s.testMin);
  s.typicalBuyMin = clamp(num(x.typicalBuyMin, D.typicalBuyMin), s.minBuyMin, s.testMin + s.extraMin);
  s.buyerRatePct = clamp(Math.round(num(x.buyerRatePct, D.buyerRatePct)), 0, 100);
  return s;
}

export async function getSettings() {
  let saved = null;
  try { saved = await db.get('settings'); } catch (e) { saved = null; }
  return sanitizeSettings(Object.assign({}, DEFAULT_SETTINGS, saved || {}));
}

// Valores derivados que usa la prueba
export function timing(s) {
  const testSec = s.testMin * 60;
  return {
    testSec,
    extraSec: s.extraMin * 60,
    extraCheckAtSec: Math.max(30, testSec - 30),
    extraDecideAtSec: Math.max(40, testSec - 10),
    levels: LEVEL_CUTS.map((p, i) => ({ n: i + 1, endSec: Math.round(testSec * p), patienceSec: s.patienceSec[i] })),
    minBuySec: Math.round(s.minBuyMin * 60),
    reactMinBuySec: Math.round(s.minBuyMin * 30),
    typicalBuySec: Math.round(s.typicalBuyMin * 60),
    buyerRate: s.buyerRatePct / 100
  };
}

// Precios editables desde el panel. Si no se han editado, se usan los de lib/data.js.
import { PRICES } from './data.js';
export function sanitizePrices(x) {
  const out = {};
  for (const cur of Object.keys(PRICES)) {
    const src = x && x[cur] ? x[cur] : PRICES[cur];
    const fix = (arr, def) => [0, 1, 2].map(i => { const v = Number(arr && arr[i]); return Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : def[i]; });
    out[cur] = { list: fix(src.list, PRICES[cur].list), disc: fix(src.disc, PRICES[cur].disc) };
  }
  return out;
}
export async function getPrices() {
  let saved = null;
  try { saved = await db.get('prices'); } catch (e) { saved = null; }
  return sanitizePrices(saved || PRICES);
}
