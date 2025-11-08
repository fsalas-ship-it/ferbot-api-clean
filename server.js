// server.js — FerBot API (trainer por etapa + guardrails + precios en cierre)
// -----------------------------------------------------------------------------------
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const fs = require("fs/promises");
const fssync = require("fs");
const path = require("path");

// ============== CONFIG BÁSICA ==============
const app = express();
app.use(cors({ origin: (_o, cb) => cb(null, true), credentials: false }));
app.use(express.json({ limit: "1mb" }));

// Rutas estáticas
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

// asegurar estructura
for (const p of [DATA_DIR, TRAINER_KNOW]) {
  if (!fssync.existsSync(p)) fssync.mkdirSync(p, { recursive: true });
}
if (!fssync.existsSync(MEMORY_PATH))   fssync.writeFileSync(MEMORY_PATH, JSON.stringify({ items: [] }, null, 2));
if (!fssync.existsSync(VARIANTS_PATH)) fssync.writeFileSync(VARIANTS_PATH, JSON.stringify({ byKey: {} }, null, 2));
if (!fssync.existsSync(STATS_PATH))    fssync.writeFileSync(STATS_PATH, JSON.stringify({ byKey: {} }, null, 2));
if (!fssync.existsSync(TRAINER_TXT))   fssync.writeFileSync(TRAINER_TXT, "");

// ============== PRECIOS & CATALOGO =========
// Link único de pago (no generamos dinámicos en panel)
const PAY_URL = "https://platzi.com/precios/";

// Expert y Duo únicamente (evitar confusión de grupos en la misma conversación)
const PRICES = {
  COP: { currency: "COP", Expert: 849999, ExpertDuo: 1299000 },
  MXN: { currency: "MXN", Expert: 4299,   ExpertDuo: 5599   },
  USD: { currency: "USD", Expert: 209,    ExpertDuo: 299    },
  EUR: { currency: "EUR", Expert: 249,    ExpertDuo: 339    },
  CLP: { currency: "CLP", Expert: 186999, ExpertDuo: 245999 },
  PEN: { currency: "PEN", Expert: 799,    ExpertDuo: 999    },
  // agrega las que uses
};

// Tópicos/claims seguros para mencionar explícitamente
const SAFE_PHRASES = [
  // áreas amplias
  "inteligencia artificial", "data", "datos", "analítica", "programación",
  "cloud", "nube", "seguridad", "ciberseguridad", "product management",
  "marketing digital", "diseño", "ux", "ui", "inglés", "emprendimiento",
  "automatización", "no-code", "low-code",
  // en inglés
  "ai", "data science", "cybersecurity", "cloud", "pm", "marketing", "design", "english"
];

// ============== HELPERS ====================
async function readJsonSafe(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); }
  catch { return fallback; }
}
async function writeJsonPretty(file, obj) {
  await fs.writeFile(file, JSON.stringify(obj, null, 2), "utf8");
}
function clampReplyToWhatsApp(text, maxChars=220) {
  let t = String(text || "").trim();
  const parts = t.split(/(?<=[.!?])\s+/).filter(Boolean);
  t = parts.slice(0,2).join(" ");
  if (t.length > maxChars) t = t.slice(0, maxChars-1).trimEnd() + "…";
  return t;
}
function sanitizeReply(text=""){
  // Prohibimos llamadas, envíos, links no controlados
  let t = clampReplyToWhatsApp(text, 260); // le damos un poco más de aire (tu límite real lo impone el clamp final a 220 antes de enviar)
  t = t.replace(/\b(te (env[ií]o|mando|paso|agendo|llamo)|llamada|material(es)?)\b/gi, "")
       .replace(/\s+/g," ").trim();
  return clampReplyToWhatsApp(t, 220);
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
function escapeHtml(s=""){return String(s).replace(/[&<>"']/g, m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]))}

// Sanitiza claims “curso/programa/ruta/especialidad de/en <topic>” no permitidos
function sanitizeTopicClaims(reply="") {
  let out = reply;
  const re = /\b(curso|programa|ruta|especialidad|especializado)\s+(?:de|en)\s+([a-záéíóúñ0-9\s\-\+]+)\b/ig;
  out = out.replace(re, (full, _kind, rawTopic) => {
    const topic = String(rawTopic || "").trim().toLowerCase();
    const isSafe = SAFE_PHRASES.some(t => topic.includes(t) || t.includes(topic));
    if (isSafe) return full; // permitido
    const saysEnglish = /\bingl[eé]s\b/i.test(full) || /\bingl[eé]s\b/i.test(out);
    if (saysEnglish) return "inglés profesional aplicable a tu área";
    return "rutas aplicadas y módulos enfocados";
  });
  return out.replace(/\s+/g," ").trim();
}

// Post-filtro por ETAPA: lo que está prohibido/permitido según stage
function postFilterByStage(text, stage){
  let out = String(text || "");
  if (stage === "integracion" || stage === "sondeo") {
    // Nada de precio, links, ni promesas sectoriales; apertura/pregunta breve
    out = out.replace(PAY_URL, "").replace(/https?:\/\/\S+/g, "");
    out = out.replace(/\b(\$|USD|EUR|COP|MXN|CLP|PEN|ARS|CRC|DOP|UYU|GTQ|BOB|PYG)\b[^\s]*/gi, "");
  }
  return out.trim();
}

function formatMoney(n, cur){
  try{
    if (cur==="COP"||cur==="CLP"||cur==="ARS"||cur==="PYG") return new Intl.NumberFormat("es-CO").format(n);
    if (cur==="MXN") return new Intl.NumberFormat("es-MX").format(n);
    if (cur==="USD") return new Intl.NumberFormat("en-US").format(n);
    if (cur==="EUR") return new Intl.NumberFormat("de-DE").format(n);
    if (cur==="PEN") return new Intl.NumberFormat("es-PE").format(n);
  }catch{}
  return String(n);
}

// Según país/currency elegido por el asesor en su mente; si no, intenta detectar por texto (muy simple)
function pickCurrencyFromQuestion(q=""){
  const s = (q||"").toLowerCase();
  if (/colom|cop|\$ ?1\.?\d{2}\.?0{3}/.test(s)) return "COP";
  if (/méxic|mxn/.test(s)) return "MXN";
  if (/dólar|usd/.test(s)) return "USD";
  if (/euro|eur/.test(s)) return "EUR";
  if (/chile|clp/.test(s)) return "CLP";
  if (/per[uú]|pen/.test(s)) return "PEN";
  return "COP"; // fallback Colombia
}

function priceOfferSnippet(intent, stage, question){
  if (stage !== "cierre") return "";                 // solo en cierre
  if (intent !== "precio") return "";                // y solo si la intención es precio/decisión
  const cur = pickCurrencyFromQuestion(question);
  const row = PRICES[cur];
  if (!row) return "";
  const e   = `${row.currency} ${formatMoney(row.Expert, row.currency)}`;
  const d   = `${row.currency} ${formatMoney(row.ExpertDuo, row.currency)}`;
  // Frase A/B clara, corta
  return `Plan Expert: ${e} · Expert Duo (2): ${d}. Activas aquí: ${PAY_URL}`;
}

// ============== STATS ======================
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
  if (rating === "good") { stats.byKey[key][t].good += 1; stats.byKey[key][t].wins += 1; }
  else if (rating === "regular") { stats.byKey[key][t].regular += 1; stats.byKey[key][t].wins += 0.5; }
  else if (rating === "bad") { stats.byKey[key][t].bad += 1; }
  await writeJsonPretty(STATS_PATH, stats);
}

// Variants offline (por si OpenAI falla)
let VAR_CACHE = { byKey: {} };
async function loadVariants() {
  const v = await readJsonSafe(VARIANTS_PATH, { byKey: {} });
  VAR_CACHE = v?.byKey ? v : { byKey: {} };
}
function pickVariant(intent, stage, name) {
  const key = `${intent}::${stage}`;
  const block = VAR_CACHE.byKey[key] || VAR_CACHE.byKey[`_default::${stage}`] || VAR_CACHE.byKey[`_default::rebatir`];
  const list = block?.variants || [];
  if (!list.length) return `Hola ${name}, ¿te muestro una ruta clara para empezar hoy con 10–15 min al día?`;
  let total = list.reduce((acc, v) => acc + (Number(v.weight || 1)), 0);
  let r = Math.random() * total;
  for (const v of list) { r -= Number(v.weight || 1); if (r <= 0) return (v.text || "").replace(/{name}/g, name); }
  return (list[0].text || "").replace(/{name}/g, name);
}

// Trainer cache
let TRAINER_IDENTITY = "";
async function loadTrainerIdentity() {
  try { TRAINER_IDENTITY = (await fs.readFile(TRAINER_TXT, "utf8")).trim(); }
  catch { TRAINER_IDENTITY = ""; }
}

// Knowledge por intent (para bajar latencia y subir pertinencia)
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

// ============== HEALTH & ADMIN =============
app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "ferbot-api",
    time: new Date().toISOString(),
    openai: !!process.env.OPENAI_API_KEY,
    model_env: process.env.OPENAI_MODEL || "gpt-5"
  });
});

app.get("/admin/reloadTrainer", async (_req, res) => {
  await loadTrainerIdentity();
  let total_knowledge_len = 0;
  let topics_len = SAFE_PHRASES.length;
  try {
    const files = await fs.readdir(TRAINER_KNOW);
    for (const f of files) {
      if (!/\.md$|\.txt$/i.test(f)) continue;
      const t = (await fs.readFile(path.join(TRAINER_KNOW, f), "utf8"));
      total_knowledge_len += t.length;
    }
  } catch { total_knowledge_len = 0; }
  res.json({ ok: true, identity_len: (TRAINER_IDENTITY||"").length, knowledge_len: total_knowledge_len, topics_len });
});

// ============== OFFLINE ASSIST =============
app.post("/assist", async (req, res) => {
  try {
    const { question = "", customerName = "Cliente", stage = "rebatir" } = req.body || {};
    const name = customerName || "Cliente";
    const intent = inferIntent(question);
    const reply = clampReplyToWhatsApp(pickVariant(intent, stage, name));
    await trackShown(intent, stage, reply);
    res.json({ ok: true, text: reply, result: { reply, intent, stage, model: "offline-variants" } });
  } catch (err) {
    res.status(500).json({ ok:false, error:"assist_failed", detail: String(err && err.message || err) });
  }
});

// ============== OPENAI SDK =================
const { OpenAI } = require("openai");
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });

// parser REPLY/WHY/NEXT
function parseReplyWhyNext(content){
  const mReply = content.match(/REPLY:\s*([\s\S]*?)(?:\n+WHY:|\n+NEXT:|$)/i);
  const mWhy   = content.match(/WHY:\s*(.*?)(?:\n+NEXT:|$)/i);
  const mNext  = content.match(/NEXT:\s*(.*)$/i);
  let reply = (mReply && mReply[1] || "").trim();
  let why   = (mWhy && mWhy[1]   || "").trim();
  let next  = (mNext && mNext[1] || "").trim();
  return { reply, why, next };
}

// Generador central con reglas por ETAPA + guardrails
async function genTrainerReplyDynamic({ question, customerName, stage, intent, context }){
  const safeName = (customerName || "Cliente").trim();
  const model = process.env.OPENAI_MODEL || "gpt-5";
  const knowledge = await buildKnowledgeSnippet(intent);

  const rules = [
    "Eres FerBot (Platzi, Colombia). Voz: Ferney — humano, directo, cálido, con emojis sobrios cuando ayuden 🙂🚀.",
    "WhatsApp: 1–2 frases, ≤220 caracteres. Sin llamadas, ‘te envío’, ni promesas que no existan.",
    "Vendes plan ANUAL; conecta característica→beneficio→beneficio de vida.",
    "Usa SOLO lo que el cliente dijo (objetivo, área, certificación, competencia). No inventes temas.",
    "NO afirmes cursos/planes sectoriales (ej. 'inglés en salud') salvo que sea EXACTO a los claims permitidos.",
    "Si el cliente trae un sector no permitido, usa wording seguro: 'inglés profesional aplicable a tu área' o 'rutas aplicadas y módulos enfocados'.",
    "Varía redacción: cambia verbos, orden y micro-CTA respecto a respuestas obvias.",
    "Formato ESTRICTO: 3 líneas — REPLY/WHY/NEXT."
  ];

  // reglas por ETAPA (durísimas)
  if (stage === "integracion") {
    rules.push(
      "ETAPA: INTEGRACIÓN — Sintoniza y abre conversación. No vendas ni des precio ni pegues links. No prometas cursos sectoriales. 1 pregunta suave al final."
    );
  } else if (stage === "sondeo") {
    rules.push(
      "ETAPA: SONDEO — Haz 1 sola pregunta para enfocar meta (empleo, ascenso o proyecto). No cierres, no precio, sin links."
    );
  } else if (stage === "rebatir") {
    rules.push(
      "ETAPA: REBATIR — Toma la objeción y reencuadra a valor anual + hábito. CTA amable. Sin precio ni links aquí."
    );
  } else if (stage === "pre_cierre") {
    rules.push(
      "ETAPA: PRE-CIERRE — Recuerda 1–2 beneficios y avanza con pregunta A/B. Sin link aún."
    );
  } else if (stage === "cierre") {
    rules.push(
      "ETAPA: CIERRE — Pide confirmación. Si la intención es PRECIO, puedes mencionar Expert/Expert Duo y luego el sistema agregará el link."
    );
  }

  const system = [
    TRAINER_IDENTITY || "",
    rules.join("\n"),
    knowledge ? `Conocimiento relevante:\n${knowledge}` : ""
  ].filter(Boolean).join("\n\n");

  const user = [
    `Nombre del cliente: ${safeName}`,
    `Stage: ${stage}`,
    `Intent: ${intent}`,
    context ? `Contexto adicional: ${context}` : "",
    "Extrae primero la necesidad EXACTA del mensaje del cliente (sin inventar).",
    `Mensaje del cliente: ${question}`,
    "Luego entrega REPLY/WHY/NEXT (3 líneas)."
  ].filter(Boolean).join("\n");

  const r = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user }
    ]
  });

  let content = r?.choices?.[0]?.message?.content || "";
  let { reply, why, next } = parseReplyWhyNext(content);
  if (!reply) reply = clampReplyToWhatsApp(content || `Hola ${safeName}, ¿te muestro una ruta clara para empezar hoy?`);
  reply = sanitizeReply(sanitizeTopicClaims(reply));
  reply = postFilterByStage(reply, stage);

  if (!why)  why  = "Sintonizar, guiar y mover a un siguiente paso con claridad.";
  if (!next) next = "Proponer el paso concreto: enfocar meta, ruta o confirmación amable.";

  // Agregar snippet de precios + link SOLO en cierre + intent precio
  const priceLine = priceOfferSnippet(intent, stage, question);
  if (priceLine) {
    // si el reply está al límite, priorizamos el CTA de precio
    let joined = `${reply} ${priceLine}`.trim();
    reply = clampReplyToWhatsApp(joined, 220);
  }

  return { reply, why, next, model };
}

// ============== TRAINER ENDPOINT ===========
app.post("/assist_trainer", async (req, res) => {
  try {
    const { question = "", customerName = "", stage = "rebatir", intent:intentIn, context = "" } = req.body || {};
    const intent = intentIn || inferIntent(question);
    if (!process.env.OPENAI_API_KEY) return res.status(400).json({ ok:false, error:"missing_openai_api_key" });

    const { reply, why, next, model } = await genTrainerReplyDynamic({
      question, customerName, stage, intent, context
    });

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
    res.status(500).json({ ok:false, error:"stats_failed", detail: String(err) });
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
  console.log("➡️ OpenAI habilitado:", !!process.env.OPENAI_API_KEY, "| Modelo:", process.env.OPENAI_MODEL || "gpt-5");
  const PORT = Number(process.env.PORT || 3000);
  app.listen(PORT, () => console.log(`🔥 FerBot API escuchando en http://localhost:${PORT}`));
})();
