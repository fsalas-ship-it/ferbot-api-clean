// server.js — FerBot API (completo: offline, openai, trainer, dashboard, CORS, panel)
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

// Asegurar estructura
for (const p of [DATA_DIR, TRAINER_KNOW]) {
  if (!fssync.existsSync(p)) fssync.mkdirSync(p, { recursive: true });
}
if (!fssync.existsSync(MEMORY_PATH))   fssync.writeFileSync(MEMORY_PATH, JSON.stringify({ items: [] }, null, 2));
if (!fssync.existsSync(VARIANTS_PATH)) fssync.writeFileSync(VARIANTS_PATH, JSON.stringify({ byKey: {} }, null, 2));
if (!fssync.existsSync(STATS_PATH))    fssync.writeFileSync(STATS_PATH, JSON.stringify({ byKey: {} }, null, 2));
if (!fssync.existsSync(TRAINER_TXT))   fssync.writeFileSync(TRAINER_TXT, "");

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
  return "_default";
}
function escapeHtml(s=""){return s.replace(/[&<>"']/g, m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]))}

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
let TRAINER_SNIPPETS = "";
async function loadTrainerIdentity() {
  try {
    TRAINER_IDENTITY = (await fs.readFile(TRAINER_TXT, "utf8")).trim();
  } catch { TRAINER_IDENTITY = ""; }

  try {
    const files = await fs.readdir(TRAINER_KNOW);
    const texts = [];
    for (const f of files) {
      if (!/\.md$|\.txt$/i.test(f)) continue;
      const p = path.join(TRAINER_KNOW, f);
      const t = (await fs.readFile(p, "utf8")).trim();
      if (t) texts.push(`# ${f}\n${t}`);
    }
    TRAINER_SNIPPETS = texts.join("\n\n---\n\n").slice(0, 12000);
  } catch { TRAINER_SNIPPETS = ""; }
}

// ===== Pago: adjuntar link solo en cierre con precio =====
const PAYMENT_URL = "https://platzi.com/precios";
// Toggle vía env: PAYMENT_LINK_TOGGLE=off para apagar (por defecto 'on')
const PAYMENT_LINK_TOGGLE = (process.env.PAYMENT_LINK_TOGGLE || "on").toLowerCase() !== "off";

function hasPriceSignal(text = "") {
  const s = (text || "").toLowerCase();
  // Señales de precio/moneda/números (MXN, COP, $, promo, etc.)
  return (
    /\b(mxn|cop|clp|pen|uyu|gtq|bob|pyg|dop|crc|ars|usd|eur)\b/i.test(s) ||
    /(\$|€|₲|₡|s\/)/.test(text) ||
    /(precio|cuesta|vale|descuento|promo|oferta)/i.test(s) ||
    /\b\d[\d\.\, ]{1,12}\b/.test(text) // número con separadores
  );
}
function attachPaymentLinkIfNeeded(reply, { stage, intent }) {
  if (!PAYMENT_LINK_TOGGLE) return reply;
  if (String(stage) !== "cierre") return reply;

  // Solo si la intención es precio o el texto trae señales de precio
  if (!(String(intent) === "precio" || hasPriceSignal(reply))) return reply;

  // Evitar duplicar si ya hay un link
  if (/https?:\/\/\S+/i.test(reply) || /platzi\.com\/precios/i.test(reply)) return reply;

  const withLink = `${reply} Actívalo aquí: ${PAYMENT_URL}`;
  return clampReplyToWhatsApp(withLink, 220);
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

// ============== ADMIN ======================
app.get("/admin/reloadTrainer", async (_req, res) => {
  await loadTrainerIdentity();
  res.json({ ok: true, identity_len: TRAINER_IDENTITY.length, knowledge_len: TRAINER_SNIPPETS.length });
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
    const system = [
      "Eres un asesor comercial de Platzi (Colombia).",
      "Respondes corto (≤220c, 1–2 frases), sin ofrecer llamadas ni enviar material.",
      "Vendes suscripción ANUAL; conecta características→beneficio→beneficio de vida."
    ].join("\n");
    const user = `Cliente:${name}\nStage:${stage}\nIntent:${intent}\nMensaje:${question}\nEntrega solo el mensaje final.`;

    // IMPORTANTE: sin temperatura ni max_tokens (algunos modelos no lo soportan)
    const r = await openai.chat.completions.create({
      model,
      messages: [
        { role:"system", content: system },
        { role:"user", content: user }
      ]
    });

    const raw = r?.choices?.[0]?.message?.content?.trim() || `Hola ${name}, ¿te muestro una ruta clara para empezar hoy con 10–15 min al día?`;
    const reply = clampReplyToWhatsApp(raw);
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
    sondeo:     "Valido su meta y pido foco para proponer ruta anual.",
    rebatir:    "Convierto objeción en valor: flexibilidad + hábito anual.",
    pre_cierre: "Reafirmo valor y quito fricción para decidir hoy.",
    cierre:     "Propongo acción concreta y amable al plan anual.",
    integracion:"Refuerzo decisión y hábitos diarios breves."
  };
  return map[stage] || `Guío por valor y CTA (${intent}/${stage}).`;
}
function fallbackNext(stage) {
  const map = {
    sondeo:     "Pedir objetivo anual y proponer primera ruta.",
    rebatir:    "Ofrecer plan anual y fijar bloque diario 10–15 min.",
    pre_cierre: "Resolver última duda y confirmar activación anual.",
    cierre:     "Enviar link y confirmar activación del plan anual.",
    integracion:"Definir horario diario y seguimiento inicial."
  };
  return map[stage] || "Cerrar con CTA simple al plan anual.";
}

function parseReplyWhyNext(content){
  // Tolerante a formatos variados
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

    const rules = [
      "Eres FerBot (Platzi, Colombia). Tono amable, dinámico, con energía.",
      "WhatsApp: ≤220c, 1–2 frases. Sin llamadas ni 'te envío material'.",
      "Vendes suscripción ANUAL; conecta características→beneficio→beneficio de vida.",
      "Si el cliente NO pregunta por precio o no menciona moneda, NO des precios.",
      "FORMATO ESTRICTO (3 líneas):",
      "REPLY: <mensaje listo WhatsApp>",
      "WHY: <por qué breve y útil para el asesor>",
      "NEXT: <próximo paso de venta anual para el asesor>"
    ].join("\n");

    const system = [
      TRAINER_IDENTITY || "",
      rules,
      TRAINER_SNIPPETS ? `Conocimiento adicional:\n${TRAINER_SNIPPETS}` : ""
    ].filter(Boolean).join("\n\n");

    const user = [
      `Nombre del cliente: ${safeName}`,
      `Stage: ${stage}`,
      `Intent: ${intent}`,
      context ? `Contexto: ${context}` : "",
      `Mensaje del cliente: ${question}`,
      "Recuerda el formato REPLY/WHY/NEXT estrictamente."
    ].filter(Boolean).join("\n");

    const r = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user",  content: user }
      ]
      // Sin temperature ni max_tokens forzados
    });

    const content = r?.choices?.[0]?.message?.content || "";
    let { reply, why, next } = parseReplyWhyNext(content);

    if (!reply) {
      // Sin formato → toma todo, clampa y genera WHY/NEXT de fallback
      reply = clampReplyToWhatsApp(content || `Hola ${safeName}, ¿te muestro una ruta clara para empezar hoy con 10–15 min al día?`);
    }
    reply = clampReplyToWhatsApp(reply);
    if (!why)  why  = fallbackWhy(stage, intent);
    if (!next) next = fallbackNext(stage);

    // >>> NUEVO: adjuntar link de pago solo en cierre con precio <<<
    reply = attachPaymentLinkIfNeeded(reply, { stage, intent });

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
    // Devolver detalle para depurar sin abrir logs
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

// ============== STATS / DASHBOARD ==========
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
    // SDK OpenAI a veces trae .error con .message
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
