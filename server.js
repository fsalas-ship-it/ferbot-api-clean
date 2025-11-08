// server.js — FerBot API (catálogo + precios + link de pago en intent: precio)
// -----------------------------------------------------------------------------------
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const fs = require("fs/promises");
const fssync = require("fs");
const path = require("path");

// ============== CONFIG BÁSICA ==============
const app = express();

// CORS amplio (Hilos, extensión, panel)
app.use(cors({
  origin: (origin, cb) => cb(null, true),
  credentials: false
}));
app.use(express.json({ limit: "1mb" }));

// Rutas de archivos públicos
const ROOT_DIR   = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
app.use(express.static(PUBLIC_DIR));

// ============== DATA PATHS =================
const DATA_DIR      = path.join(ROOT_DIR, "data");
const MEMORY_PATH   = path.join(DATA_DIR, "memory.json");
const VARIANTS_PATH = path.join(DATA_DIR, "variants.json");
const STATS_PATH    = path.join(DATA_DIR, "stats.json");
const TRAINER_TXT   = path.join(DATA_DIR, "trainer_identity.txt");
const TRAINER_KNOW  = path.join(DATA_DIR, "trainer_knowledge");
const CATALOG_PATH  = path.join(DATA_DIR, "catalog.json");
const PRICES_PATH   = path.join(DATA_DIR, "prices.json");

// Asegurar estructura
for (const p of [DATA_DIR, TRAINER_KNOW]) {
  if (!fssync.existsSync(p)) fssync.mkdirSync(p, { recursive: true });
}
if (!fssync.existsSync(MEMORY_PATH))   fssync.writeFileSync(MEMORY_PATH, JSON.stringify({ items: [] }, null, 2));
if (!fssync.existsSync(VARIANTS_PATH)) fssync.writeFileSync(VARIANTS_PATH, JSON.stringify({ byKey: {} }, null, 2));
if (!fssync.existsSync(STATS_PATH))    fssync.writeFileSync(STATS_PATH, JSON.stringify({ byKey: {} }, null, 2));
if (!fssync.existsSync(TRAINER_TXT))   fssync.writeFileSync(TRAINER_TXT, "");
if (!fssync.existsSync(CATALOG_PATH))  fssync.writeFileSync(CATALOG_PATH, JSON.stringify({ areas: [], platform: {} }, null, 2));
if (!fssync.existsSync(PRICES_PATH))   fssync.writeFileSync(PRICES_PATH, JSON.stringify({ currencies: {}, promo: {} }, null, 2));

// ============== HELPERS ====================
async function readJsonSafe(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); }
  catch { return fallback; }
}
async function writeJsonPretty(file, obj) {
  await fs.writeFile(file, JSON.stringify(obj, null, 2), "utf8");
}
function normalizeSpaces(s = "") {
  return String(s).replace(/\s+/g, " ").replace(/ ,/g, ",").replace(/ \./g, ".").trim();
}
function normKey(s=""){ return String(s||"").toLowerCase().replace(/\s+/g," ").trim(); }
function clampReplyToWhatsApp(text, maxChars=220) {
  let t = (text || "").trim();
  const parts = t.split(/(?<=[.!?])\s+/).filter(Boolean);
  t = parts.slice(0,2).join(" ");
  if (t.length > maxChars) t = t.slice(0, maxChars-1).trimEnd() + "…";
  return t;
}
function inferIntent(q = "") {
  const s = (q || "").toLowerCase();
  if (/(precio|caro|costo|vale|promoci|oferta|descuento)/.test(s)) return "precio";
  if (/(tiempo|agenda|no tengo tiempo|horario|no alcanzo|ocupad)/.test(s)) return "tiempo";
  if (/(cert|certificado|certificacion|certificación)/.test(s)) return "cert";
  if (/(coursera|udemy|alura|competenc|otra plataforma)/.test(s)) return "competencia";
  if (/(pitch|qué es platzi|que es platzi|platzi)/.test(s)) return "pitch";
  if (/(empleo|trabajo|vacante|contratar|contratación)/.test(s)) return "empleo";
  return "_default";
}
function escapeHtml(s=""){return s.replace(/[&<>"']/g, m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]))}

// Guardas duras post-generación
function violatesHardRules(text=""){
  const banned = /\b(te (env[ií]o|mando|paso|agendo|llamo)|llamada|material(es)?)\b/i;
  return banned.test(text);
}
function sanitizeReply(text=""){
  let t = clampReplyToWhatsApp(text, 220);
  t = t.replace(/\b(te (env[ií]o|mando|paso|agendo|llamo)|llamada|material(es)?)\b/gi, "").replace(/\s+/g," ").trim();
  return t;
}

// ===== CATALOGO =====
async function readCatalogSafe() {
  try {
    const raw = await fs.readFile(CATALOG_PATH, "utf8");
    const json = JSON.parse(raw);
    if (!json || !Array.isArray(json.areas)) return { areas: [], platform: {} };
    return json;
  } catch {
    return { areas: [], platform: {} };
  }
}
function bestAreaMatch(catalog, text="") {
  const s = (text||"").toLowerCase();
  let best = null, score = 0;
  for (const area of catalog.areas || []) {
    let sc = 0;
    for (const kw of area.keywords || []) {
      if (s.includes(String(kw).toLowerCase())) sc += 1;
    }
    if (sc > score) { score = sc; best = area; }
  }
  return { area: best, score };
}

// ===== PRECIOS =====
async function readPricesSafe() {
  try {
    const raw = await fs.readFile(PRICES_PATH, "utf8");
    const json = JSON.parse(raw);
    return json || { currencies: {}, promo: {} };
  } catch {
    return { currencies: {}, promo: {} };
  }
}
// Detección básica de moneda por texto (palabras clave); fallback COP
function detectCurrencyByText(text="") {
  const s = (text||"").toLowerCase();
  if (/\b(m[eé]xico|mxn|cdmx|mex)\b/.test(s)) return "MXN";
  if (/\b(colombia|cop|bog[oó]ta|medell[ií]n)\b/.test(s)) return "COP";
  if (/\b(chile|clp|santiago)\b/.test(s)) return "CLP";
  if (/\b(per[uú]|pen|lima)\b/.test(s)) return "PEN";
  if (/\b(uruguay|uyu|montevideo)\b/.test(s)) return "UYU";
  if (/\b(guatemala|gtq)\b/.test(s)) return "GTQ";
  if (/\b(bolivia|bob|la paz|santa cruz)\b/.test(s)) return "BOB";
  if (/\b(paraguay|pyg|asunci[oó]n)\b/.test(s)) return "PYG";
  if (/\b(rep[úu]blica dominicana|rd|dop|santo domingo)\b/.test(s)) return "DOP";
  if (/\b(costa rica|crc|san jos[eé])\b/.test(s)) return "CRC";
  if (/\b(argentina|ars|buenos aires)\b/.test(s)) return "ARS";
  if (/\b(usa|eeuu|estados unidos|usd|miami|ny|new york)\b/.test(s)) return "USD";
  if (/\b(europa|eur|euros|espa[ñn]a|madrid|barcelona)\b/.test(s)) return "EUR";
  return "COP"; // default
}
// Formateo rápido con símbolo
function money(fmtCurrency, n) {
  const symbols = { MXN:"$","COP":"$","CLP":"$","PEN":"S/","UYU":"$","GTQ":"Q","BOB":"Bs","PYG":"₲","DOP":"RD$","CRC":"₡","ARS":"$","USD":"$","EUR":"€" };
  const sym = symbols[fmtCurrency] || "";
  return `${sym}${n.toLocaleString("es-CO")}`;
}
// Construir líneas de precio (solo Expert y Expert Duo) según lista o promo
function buildPriceLines(prices, currency, usePromo=true) {
  const cur = prices.currencies[currency];
  if (!cur) return [];
  const src = usePromo ? prices.promo[currency] : cur;
  if (!src) return [];
  // Solo Expert y Duo (no Grupos)
  const out = [];
  if (src.Expert != null) out.push({ plan: "Expert", value: src.Expert });
  if (src.Duo    != null) out.push({ plan: "Expert Duo", value: src.Duo });
  return out.map(x => `${x.plan}: ${money(currency, x.value)}`);
}

// Stats helpers
function ensureStatEntry(stats, intent, stage, text) {
  const key = `${intent}::${stage}`;
  if (!stats.byKey[key]) stats.byKey[key] = {};
  const t = (text || "").trim();
  if (!stats.byKey[key][t]) stats.byKey[key][t] = { shown: 0, wins: 0, good: 0, regular: 0, bad: 0 };
  return { key, t };
}
async function trackShown(intent, stage, replyText) {
  const stats = await readJsonSafe(STATS_PATH, { byKey: {} });
  const { key, t } = ensureStatEntry(stats, intent, stage, replyText);
  stats.byKey[key][t].shown += 1;
  await writeJsonPretty(STATS_PATH, stats);
}
async function trackRating(intent, stage, replyText, rating) {
  const stats = await readJsonSafe(STATS_PATH, { byKey: {} });
  const { key, t } = ensureStatEntry(stats, intent, stage, replyText);
  stats.byKey[key][t].shown = Math.max(stats.byKey[key][t].shown, 1);
  if (rating === "good") {
    stats.byKey[key][t].good += 1; stats.byKey[key][t].wins += 1;
  } else if (rating === "regular") {
    stats.byKey[key][t].regular += 1; stats.byKey[key][t].wins += 0.5;
  } else if (rating === "bad") {
    stats.byKey[key][t].bad += 1;
  }
  await writeJsonPretty(STATS_PATH, stats);
}

// Variants offline (simple)
let VAR_CACHE = { byKey: {} };
async function loadVariants() {
  const v = await readJsonSafe(VARIANTS_PATH, { byKey: {} });
  VAR_CACHE = v?.byKey ? v : { byKey: {} };
}
function pickVariant(intent, stage, name) {
  const key = `${intent}::${stage}`;
  const block = VAR_CACHE.byKey[key] || VAR_CACHE.byKey[`_default::${stage}`] || VAR_CACHE.byKey[`_default::rebatir`];
  const list = block?.variants || [];
  if (!list.length) {
    return `Hola ${name}, ¿te muestro una ruta clara para empezar hoy con 10–15 min al día?`;
  }
  let total = list.reduce((acc, v) => acc + (Number(v.weight || 1)), 0);
  let r = Math.random() * total;
  for (const v of list) {
    r -= Number(v.weight || 1);
    if (r <= 0) return (v.text || "").replace(/{name}/g, name);
  }
  return (list[0].text || "").replace(/{name}/g, name);
}

// Trainer cache
let TRAINER_IDENTITY = "";
async function loadTrainerIdentity() {
  try {
    TRAINER_IDENTITY = (await fs.readFile(TRAINER_TXT, "utf8")).trim();
  } catch { TRAINER_IDENTITY = ""; }
}

// Knowledge por intent
function pickKnowledgeByIntent(intent) {
  const map = {
    "precio": ["precio.md", "competencia.md", "default.md"],
    "tiempo": ["tiempo.md", "default.md"],
    "cert":   ["cert.md", "default.md"],
    "competencia": ["competencia.md", "default.md"],
    "pitch":  ["pitch.md", "default.md"],
    "empleo": ["empleo.md", "default.md"],
    "_default": ["default.md"]
  };
  return map[intent] || map["_default"];
}
async function buildKnowledgeSnippet(intent){
  try {
    const files = await fs.readdir(TRAINER_KNOW);
    const wanted = new Set(pickKnowledgeByIntent(intent));
    const buf = [];
    for (const f of files) {
      if (!/\.md$|\.txt$/i.test(f)) continue;
      if (!wanted.has(f)) continue;
      const t = (await fs.readFile(path.join(TRAINER_KNOW, f), "utf8")).trim();
      if (t) buf.push(`# ${f}\n${t}`);
    }
    return buf.join("\n\n---\n\n").slice(0, 8000);
  } catch { return ""; }
}

// ============== HEALTH =====================
app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "ferbot-api",
    time: new Date().toISOString(),
    openai: !!process.env.OPENAI_API_KEY,
    model_env: process.env.OPENAI_MODEL || "gpt-5"
  });
});

// ===== GET /catalog =====
app.get("/catalog", async (_req, res) => {
  const catalog = await readCatalogSafe();
  res.json({ ok:true, ...catalog });
});

// ===== GET /prices =====
app.get("/prices", async (_req, res) => {
  const prices = await readPricesSafe();
  res.json({ ok:true, ...prices });
});

// ============== ADMIN ======================
app.get("/admin/reloadTrainer", async (_req, res) => {
  await loadTrainerIdentity();

  // medir tamaño total de knowledge
  let total_knowledge_len = 0;
  try {
    const files = await fs.readdir(TRAINER_KNOW);
    for (const f of files) {
      if (!/\.md$|\.txt$/i.test(f)) continue;
      const t = (await fs.readFile(path.join(TRAINER_KNOW, f), "utf8"));
      total_knowledge_len += t.length;
    }
  } catch { total_knowledge_len = 0; }

  // medir catálogo
  const catalog = await readCatalogSafe();
  const catalog_len = (catalog.areas || []).length;

  // medir precios
  const prices = await readPricesSafe();
  const currencies_len = Object.keys(prices.currencies || {}).length;

  res.json({
    ok: true,
    identity_len: (TRAINER_IDENTITY || "").length,
    knowledge_len: total_knowledge_len,
    catalog_len,
    currencies_len
  });
});

// ============== OFFLINE ASSIST =============
app.post("/assist", async (req, res) => {
  try {
    const { question = "", customerName = "Cliente", stage = "rebatir" } = req.body || {};
    const name = customerName || "Cliente";
    const intent = inferIntent(question);
    const reply = clampReplyToWhatsApp(pickVariant(intent, stage, name));
    await trackShown(intent, stage, reply);
    res.json({
      ok: true,
      text: reply,
      result: { reply, intent, stage, model: "offline-variants" }
    });
  } catch (err) {
    res.status(500).json({ ok:false, error:"assist_failed", detail: String(err && err.message || err) });
  }
});

// ============== OPENAI SIMPLE ==============
const { OpenAI } = require("openai");
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || ""
});

app.post("/assist_openai", async (req, res) => {
  try {
    const { question = "", customerName = "Cliente", stage = "rebatir" } = req.body || {};
    const name = customerName || "Cliente";
    const intent = inferIntent(question);
    if (!process.env.OPENAI_API_KEY) {
      return res.status(400).json({ ok:false, error:"missing_openai_api_key" });
    }
    const model = process.env.OPENAI_MODEL || "gpt-5";
    const rules = [
      "Eres un asesor comercial de Platzi (Colombia).",
      "Respondes corto (≤220c, 1–2 frases), sin ofrecer llamadas ni enviar material.",
      "Vendes suscripción ANUAL; conecta características→beneficio→beneficio de vida."
    ].join("\n");
    const user = `Cliente:${name}\nStage:${stage}\nIntent:${intent}\nMensaje:${question}\nEntrega solo el mensaje final.`;

    const r = await openai.chat.completions.create({
      model,
      messages: [
        { role:"system", content: rules },
        { role:"user", content: user }
      ]
    });

    const raw = r?.choices?.[0]?.message?.content?.trim() || `Hola ${name}, ¿te muestro una ruta clara para empezar hoy con 10–15 min al día?`;
    let reply = sanitizeReply(raw);
    await trackShown(intent, stage, reply);
    res.json({
      ok: true,
      text: reply,
      result: { reply, intent, stage, model }
    });
  } catch (err) {
    res.status(500).json({ ok:false, error:"openai_failed", detail: stringifyErr(err) });
  }
});

// ============== TRAINER (REPLY/WHY/NEXT) ===
function fallbackWhy(stage, intent) {
  const map = {
    sondeo:     "Generar claridad sin fricción para orientar la ruta.",
    rebatir:    "Convertir objeción en valor: plan anual + hábito real.",
    pre_cierre: "Quitar fricción y facilitar decisión hoy.",
    cierre:     "Confirmar activación del plan anual de forma amable.",
    integracion:"Afirmar solución y abrir conversación con sintonía."
  };
  return map[stage] || `Guío por valor y CTA (${intent}/${stage}).`;
}
function fallbackNext(stage) {
  const map = {
    sondeo:     "Hacer una sola pregunta para orientar la ruta.",
    rebatir:    "Reencuadrar y pedir confirmación simple.",
    pre_cierre: "Ofrecer decisión A/B y confirmar.",
    cierre:     "Confirmar activación hoy.",
    integracion:"Invitar a que la persona comparta y mantener ritmo."
  };
  return map[stage] || "Cerrar con CTA simple al plan anual.";
}

function parseReplyWhyNext(content){
  const mReply = content.match(/REPLY:\s*([\s\S]*?)(?:\n+WHY:|\n+NEXT:|$)/i);
  const mWhy   = content.match(/WHY:\s*(.*?)(?:\n+NEXT:|$)/i);
  const mNext  = content.match(/NEXT:\s*(.*)$/i);
  let reply = (mReply && mReply[1] || "").trim();
  let why   = (mWhy && mWhy[1]   || "").trim();
  let next  = (mNext && mNext[1] || "").trim();
  return { reply, why, next };
}

app.post("/assist_trainer", async (req, res) => {
  try {
    const { question = "", customerName = "", stage = "rebatir", intent:intentIn, context = "" } = req.body || {};
    const safeName = (customerName || "Cliente").trim();
    const intent = intentIn || inferIntent(question);

    if (!process.env.OPENAI_API_KEY) {
      return res.status(400).json({ ok:false, error:"missing_openai_api_key" });
    }
    const model = process.env.OPENAI_MODEL || "gpt-5";

    // Reglas duras y estilo Ferney
    const rules = [
      "Eres FerBot (Platzi, Colombia). Voz: Ferney (humano, directo, cálido).",
      "WhatsApp: 1–2 frases, ≤220 caracteres. Nada de llamadas, envíos ni promesas sin base.",
      "Vendes plan ANUAL; conecta característica→beneficio→beneficio de vida.",
      "Usa SOLO lo que el cliente dijo (objetivo, área, certificación, competencia).",
      "NO introduzcas temas no mencionados (ej: tiempo o precio) a menos que el cliente los traiga.",
      "Integración: afirmar solución y abrir conversación (sin sondeo duro ni pre-cierre).",
      "Formato ESTRICTO (3 líneas):",
      "REPLY: <mensaje listo WhatsApp>",
      "WHY: <principio de venta/enseñanza breve>",
      "NEXT: <siguiente paso comercial amable>",
      "Varía redacción entre consultas; evita repetir frases previas.",
      "Nunca menciones 'Grupos' en precios; prioriza Expert y Expert Duo."
    ];

    const knowledge = await buildKnowledgeSnippet(intent);

    // Catálogo
    const catalog = await readCatalogSafe();
    const { area: matchedArea, score: matchScore } = bestAreaMatch(catalog, question);

    let catalogContext = "";
    if (matchedArea && matchScore > 0) {
      const route = (matchedArea.routes && matchedArea.routes[0]) || null;
      const cursos = (route?.courses || []).map(c => `- ${c.title}`).slice(0, 3).join("\n");
      catalogContext = [
        `Área sugerida (catálogo seguro): ${matchedArea.name}`,
        matchedArea.micro_goal ? `Micro-meta: ${matchedArea.micro_goal}` : "",
        route ? `Ruta: ${route.title}` : "",
        cursos ? `Cursos (ejemplos):\n${cursos}` : "",
        matchedArea.certification ? "Incluye certificación." : "Sin certificación formal.",
        matchedArea.cta ? `CTA sugerida: ${matchedArea.cta}` : ""
      ].filter(Boolean).join("\n");
    }

    // Precios (para intent precio en cualquier etapa)
    const prices = await readPricesSafe();
    let priceContext = "";
    if (intent === "precio") {
      const curr = detectCurrencyByText(`${question} ${context}`);
      const lines = buildPriceLines(prices, curr, true); // promo por defecto
      if (lines.length) {
        priceContext = [
          `Moneda detectada: ${curr}`,
          `Planes (solo personales):`,
          ...lines.map(l => `- ${l}`),
          `Link de pago: https://platzi.com/precios/`
        ].join("\n");
      } else {
        priceContext = `No se hallaron precios para la moneda detectada; referencia única: https://platzi.com/precios/`;
      }
    }

    const system = [
      TRAINER_IDENTITY || "",
      rules.join("\n"),
      knowledge ? `Conocimiento relevante:\n${knowledge}` : "",
      catalogContext ? `Catálogo (guía segura, NO inventes):\n${catalogContext}` : "",
      priceContext ? `Precios (mostrar si el cliente pidió precio):\n${priceContext}` : ""
    ].filter(Boolean).join("\n\n");

    const user = [
      `Nombre del cliente: ${safeName}`,
      `Stage: ${stage}`,
      `Intent: ${intent}`,
      context ? `Contexto adicional: ${context}` : "",
      "Extrae primero la necesidad EXACTA del mensaje del cliente (sin inventar):",
      `Mensaje del cliente: ${question}`,
      "Luego entrega REPLY/WHY/NEXT. Mantén las reglas duras."
    ].filter(Boolean).join("\n");

    const r = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ]
    });

    const content = r?.choices?.[0]?.message?.content || "";
    let { reply, why, next } = parseReplyWhyNext(content);

    if (!reply) {
      reply = clampReplyToWhatsApp(content || `Hola ${safeName}, ¿te muestro una ruta clara para empezar hoy con 10–15 min al día?`);
    }
    reply = sanitizeReply(reply);
    // No permitir "Grupos" en precios
    reply = reply.replace(/\bgrupos?\b/gi, "").replace(/\s{2,}/g, " ").trim();

    if (violatesHardRules(reply)) {
      reply = `Entendido, ${safeName}; hay una ruta clara para tu objetivo y puedes empezar hoy mismo.`;
    }
    if (!why)  why  = fallbackWhy(stage, intent);
    if (!next) next = fallbackNext(stage);

    // Si el cliente preguntó por precio y no apareció el link, lo anexamos de forma corta
    if (intent === "precio" && !/platzi\.com\/precios/i.test(reply)) {
      const suffix = " Más opciones aquí: platzi.com/precios";
      const joined = `${reply} ${suffix}`.trim();
      reply = clampReplyToWhatsApp(joined, 220);
    }

    await trackShown(intent, stage, reply);

    res.json({
      ok: true,
      text: reply,
      whatsapp: reply,
      message: reply,
      answer: reply,
      result: {
        reply, why, next,
        guide: `POR QUÉ: ${why} · SIGUIENTE PASO: ${next}`,
        sections: { [stage]: reply },
        model, confidence: 0.9, intent, stage
      }
    });
  } catch (err) {
    res.status(500).json({ ok:false, error:"assist_trainer_failed", detail: stringifyErr(err) });
  }
});

// ============== TRACKING ===================
app.post("/trackRate", async (req, res) => {
  try {
    const { intent = "_default", stage = "rebatir", text = "", rating = "regular" } = req.body || {};
    if (!text) return res.status(400).json({ ok:false, error:"missing_text" });
    if (!["good","regular","bad"].includes(rating)) return res.status(400).json({ ok:false, error:"invalid_rating" });
    await trackRating(intent, stage, text, rating);
    res.json({ ok:true });
  } catch (err) {
    res.status(500).json({ ok:false, error:"track_rate_failed", detail: stringifyErr(err) });
  }
});

// ============== DASHBOARD SIMPLE ===========
app.get("/stats", async (_req, res) => {
  try {
    const stats = await readJsonSafe(STATS_PATH, { byKey: {} });
    const out = [];
    for (const key of Object.keys(stats.byKey || {})) {
      const [intent, stage] = key.split("::");
      const map = stats.byKey[key];
      for (const text of Object.keys(map)) {
        const row = map[text];
        const shown = Number(row.shown || 0);
        const wins = Number(row.wins || 0);
        const winrate = shown > 0 ? +(wins / shown).toFixed(3) : 0;
        out.push({
          intent, stage, text, shown, wins, winrate,
          good: Number(row.good || 0),
          regular: Number(row.regular || 0),
          bad: Number(row.bad || 0),
        });
      }
    }
    out.sort((a,b)=> (b.winrate - a.winrate) || (b.shown - a.shown));
    res.json({ ok: true, rows: out });
  } catch (err) {
    res.status(500).json({ ok:false, error:"stats_failed", detail: stringifyErr(err) });
  }
});

app.get("/admin/dashboard", async (_req, res) => {
  try {
    const resp = await (await fetchLocalStats()).json();
    const rows = (resp.rows || []).map(r => `
      <tr>
        <td>${r.intent}</td>
        <td>${r.stage}</td>
        <td>${escapeHtml(r.text)}</td>
        <td style="text-align:right">${r.shown}</td>
        <td style="text-align:right">${r.wins}</td>
        <td style="text-align:right">${(r.winrate*100).toFixed(1)}%</td>
      </tr>
    `).join("");

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(`<!doctype html>
<html lang="es"><head>
<meta charset="utf-8"/>
<title>FerBot · Dashboard</title>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<style>
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Inter,Arial;background:#0b0f19;color:#e2e8f0;margin:0;padding:24px}
  h1{margin:0 0 12px;font-size:20px}
  table{width:100%;border-collapse:collapse;background:#0f1524;border:1px solid rgba(255,255,255,.08);border-radius:12px;overflow:hidden}
  th,td{padding:10px;border-bottom:1px solid rgba(255,255,255,.06);font-size:14px}
  th{background:rgba(255,255,255,.04);text-align:left}
  tr:hover{background:rgba(255,255,255,.03)}
  .sub{opacity:.7;font-size:12px;margin-bottom:16px}
</style>
</head>
<body>
  <h1>FerBot · Dashboard</h1>
  <div class="sub">Ranking por winrate y exposición</div>
  <div style="margin:12px 0">
    <form method="GET" action="/stats" target="_blank"><button>Ver JSON</button></form>
  </div>
  <table>
    <thead><tr><th>Intent</th><th>Stage</th><th>Texto</th><th>Shown</th><th>Wins</th><th>Winrate</th></tr></thead>
    <tbody>${rows || ""}</tbody>
  </table>
</body></html>`);
  } catch (err) {
    res.status(500).send("Error");
  }
});

async function fetchLocalStats(){
  const stats = await readJsonSafe(STATS_PATH, { byKey: {} });
  const out = [];
  for (const key of Object.keys(stats.byKey || {})) {
    const [intent, stage] = key.split("::");
    const map = stats.byKey[key];
    for (const text of Object.keys(map)) {
      const row = map[text];
      const shown = Number(row.shown || 0);
      const wins = Number(row.wins || 0);
      const winrate = shown > 0 ? +(wins / shown).toFixed(3) : 0;
      out.push({
        intent, stage, text, shown, wins, winrate,
        good: Number(row.good || 0),
        regular: Number(row.regular || 0),
        bad: Number(row.bad || 0),
      });
    }
  }
  out.sort((a,b)=> (b.winrate - a.winrate) || (b.shown - a.shown));
  return { json: async () => ({ ok:true, rows: out }) };
}

// ============== PANEL/PAGES ================
app.get("/agent", (_req,res)=> res.redirect("/agent.html"));
app.get("/panel", (_req,res)=> res.redirect("/panel.html"));

// ============== INICIO =====================
function stringifyErr(err){
  try {
    if (err && typeof err === "object") {
      if (err.error) return JSON.stringify(err, null, 2);
      if (err.response?.data) return JSON.stringify(err.response.data, null, 2);
      if (err.message) return err.message;
    }
    return String(err);
  } catch { return String(err); }
}

(async () => {
  await loadVariants();
  await loadTrainerIdentity();
  console.log("➡️  OpenAI habilitado:", !!process.env.OPENAI_API_KEY, "| Modelo:", process.env.OPENAI_MODEL || "gpt-5");
  const PORT = Number(process.env.PORT || 3000);
  app.listen(PORT, () => {
    console.log(`🔥 FerBot API escuchando en http://localhost:${PORT}`);
  });
})();
