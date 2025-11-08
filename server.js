// server.js — FerBot API (dinámico, variación, estilo Ferney, guardrails, sin 500)
// -----------------------------------------------------------------------------------
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const fs = require("fs/promises");
const fssync = require("fs");
const path = require("path");

// ============== CONFIG BÁSICA ==============
const app = express();
app.use(cors({ origin: (origin, cb) => cb(null, true), credentials: false }));
app.use(express.json({ limit: "1mb" }));

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
const CATALOG_MD    = path.join(TRAINER_KNOW, "catalog_topics.md");

// Asegurar estructura
for (const p of [DATA_DIR, TRAINER_KNOW]) {
  if (!fssync.existsSync(p)) fssync.mkdirSync(p, { recursive: true });
}
if (!fssync.existsSync(MEMORY_PATH))   fssync.writeFileSync(MEMORY_PATH, JSON.stringify({ items: [] }, null, 2));
if (!fssync.existsSync(VARIANTS_PATH)) fssync.writeFileSync(VARIANTS_PATH, JSON.stringify({ byKey: {} }, null, 2));
if (!fssync.existsSync(STATS_PATH))    fssync.writeFileSync(STATS_PATH, JSON.stringify({ byKey: {} }, null, 2));
if (!fssync.existsSync(TRAINER_TXT))   fssync.writeFileSync(TRAINER_TXT, "");
if (!fssync.existsSync(CATALOG_MD))    fssync.writeFileSync(CATALOG_MD, "# Catálogo de temas disponibles\n- Inglés general aplicado al trabajo\n- Terminología y vocabulario para áreas de salud (módulos)\n- Rutas de inglés por niveles (A1–B2) con enfoque profesional\n- Marketing + IA (rutas y proyectos guiados)\n- Data + Python (rutas y certificación verificable)\n");

// ============== HELPERS ====================
async function readJsonSafe(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); }
  catch { return fallback; }
}
async function writeJsonPretty(file, obj) {
  await fs.writeFile(file, JSON.stringify(obj, null, 2), "utf8");
}
function clampReplyToWhatsApp(text, maxChars=220) {
  let t = (text || "").trim();
  const parts = t.split(/(?<=[.!?])\s+/).filter(Boolean);
  t = parts.slice(0,2).join(" ");
  if (t.length > maxChars) t = t.slice(0, maxChars-1).trimEnd() + "…";
  return t;
}
function normKey(s=""){ return String(s||"").toLowerCase().replace(/\s+/g," ").trim(); }
function escapeHtml(s=""){return s.replace(/[&<>"']/g, m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]))}
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

// Guardrails post-generación
function violatesHardRules(text=""){
  const banned = /\b(te (env[ií]o|mando|paso|agendo|llamo)|llamada|link|material(es)?)\b/i;
  return banned.test(text);
}
function sanitizeReply(text=""){
  let t = clampReplyToWhatsApp(text, 220);
  t = t.replace(/\b(te (env[ií]o|mando|paso|agendo|llamo)|llamada|link|material(es)?)\b/gi, "").replace(/\s+/g," ").trim();
  return t;
}

// Emojis sobrios (0–1 por respuesta)
const EMO_POS = ["💚","✨","🚀","✅","🙌"];
const EMO_NEU = ["🙂","👌","🧭"];
const EMO_NEG = ["👍"]; // para validar objeción sin cargar
function addLightEmoji(reply, sentiment="neu") {
  const pool = sentiment==="pos"?EMO_POS : sentiment==="neg"?EMO_NEG : EMO_NEU;
  if (Math.random() < 0.55) return reply; // 45% chance de agregar
  const e = pool[Math.floor(Math.random()*pool.length)];
  // 50% al inicio, 50% al final
  return Math.random()<0.5 ? `${e} ${reply}` : `${reply} ${e}`;
}

// Variación (evitar respuestas repetidas)
function dedupeAndPick(candidates=[], seed=Date.now()){
  const seen = new Set();
  const uniq = [];
  for (const c of candidates) {
    const k = normKey(c);
    if (!k) continue;
    if (!seen.has(k)) { seen.add(k); uniq.push(c); }
  }
  if (!uniq.length) return "";
  const idx = Math.floor((seed % 9973) % uniq.length);
  return uniq[idx];
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

// Variants offline
let VAR_CACHE = { byKey: {} };
async function loadVariants() {
  const v = await readJsonSafe(VARIANTS_PATH, { byKey: {} });
  VAR_CACHE = v?.byKey ? v : { byKey: {} };
}
function pickVariant(intent, stage, name) {
  const key = `${intent}::${stage}`;
  const block = VAR_CACHE.byKey[key] || VAR_CACHE.byKey[`_default::${stage}`] || VAR_CACHE.byKey[`_default::rebatir`];
  const list = block?.variants || [];
  if (!list.length) return `Hola ${name}, ¿te muestro una ruta clara para empezar hoy?`;
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
  try { TRAINER_IDENTITY = (await fs.readFile(TRAINER_TXT, "utf8")).trim(); }
  catch { TRAINER_IDENTITY = ""; }
}

// Catálogo de temas permitidos (para no prometer “programas” inexistentes)
let SAFE_TOPICS = [];
async function loadSafeTopics() {
  try {
    const raw = await fs.readFile(CATALOG_MD, "utf8");
    SAFE_TOPICS = (raw.match(/^- (.+)$/gm) || []).map(l => l.replace(/^- /,'').trim().toLowerCase());
  } catch { SAFE_TOPICS = []; }
}
function softenIfUncataloged(reply="") {
  let out = reply;
  const m = out.match(/\bprograma (?:de|en) ([a-záéíóúñ0-9\s\-]+)\b/i);
  if (m) {
    const topic = m[1].trim().toLowerCase();
    const isSafe = SAFE_TOPICS.some(t => topic.includes(t) || t.includes(topic));
    if (!isSafe) {
      out = out.replace(/\bprograma (?:de|en) [a-záéíóúñ0-9\s\-]+\b/gi, "rutas aplicadas y módulos enfocados");
      out = out.replace(/\s+/g, " ").trim();
    }
  }
  return out;
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

// ============== HEALTH / ADMIN =============
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
  await loadSafeTopics();
  let identity_len = (TRAINER_IDENTITY || "").length;
  let total_knowledge_len = 0;
  try {
    const files = await fs.readdir(TRAINER_KNOW);
    for (const f of files) {
      if (!/\.md$|\.txt$/i.test(f)) continue;
      const t = (await fs.readFile(path.join(TRAINER_KNOW, f), "utf8"));
      total_knowledge_len += t.length;
    }
  } catch { total_knowledge_len = 0; }
  res.json({ ok: true, identity_len, knowledge_len: total_knowledge_len, topics_len: SAFE_TOPICS.length });
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
    res.json({ ok: true, text: "Tengo una ruta clara para ti; podemos empezar hoy. ¿Te guío?", result:{ reply:"Tengo una ruta clara para ti; podemos empezar hoy. ¿Te guío?", intent:"_default", stage:"rebatir", model:"fallback" } });
  }
});

// ============== OPENAI CORE ===============
const { OpenAI } = require("openai");
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });

async function callOpenAIWithFallback(body) {
  const models = [process.env.OPENAI_MODEL || "gpt-5", "gpt-4o-mini"];
  let lastErr = null;
  for (const model of models) {
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 20000); // 20s
      const r = await openai.chat.completions.create({ model, ...body }, { signal: controller.signal });
      clearTimeout(t);
      const content = r?.choices?.[0]?.message?.content?.trim();
      if (content) return { content, modelUsed: model };
      lastErr = new Error("Respuesta vacía");
    } catch (e) { lastErr = e; continue; }
  }
  throw lastErr || new Error("OpenAI falló");
}

// ============== TRAINER (dinámico) =========
function fallbackWhy(stage, intent) {
  const map = {
    sondeo:     "Claridad sin fricción para orientar la ruta.",
    rebatir:    "Reencuadra objeción en valor anual + hábito.",
    pre_cierre: "Quita fricción y acerca la decisión.",
    cierre:     "Confirma activación de forma amable.",
    integracion:"Sintoniza y abre conversación con foco."
  };
  return map[stage] || `Guío por valor y CTA (${intent}/${stage}).`;
}
function fallbackNext(stage) {
  const map = {
    sondeo:     "Haz una pregunta única y útil para orientar.",
    rebatir:    "Pide confirmación simple para avanzar.",
    pre_cierre: "Ofrece opción A/B y confirma.",
    cierre:     "Confirma activación hoy.",
    integracion:"Invita a compartir y mantener el ritmo."
  };
  return map[stage] || "Cerrar con CTA simple al plan anual.";
}

function parseMultiCandidates(text=""){
  // Esperamos un bloque con 5 variantes formateadas:
  // VARIANTS:
  // 1) REPLY: ...
  //    WHY: ...
  //    NEXT: ...
  // 2) REPLY: ...
  const blocks = [];
  const lines = text.split("\n");
  let cur = { reply:"", why:"", next:"" }, inBlock = false;
  for (let line of lines) {
    const mNum = line.match(/^\s*\d+\)\s*REPLY:\s*(.*)$/i);
    if (mNum) { if (inBlock) { blocks.push(cur); cur={reply:"",why:"",next:""}; } inBlock=true; cur.reply = (mNum[1]||"").trim(); continue; }
    const mR = line.match(/^\s*REPLY:\s*(.*)$/i);
    const mW = line.match(/^\s*WHY:\s*(.*)$/i);
    const mN = line.match(/^\s*NEXT:\s*(.*)$/i);
    if (mR) { cur.reply=(mR[1]||"").trim(); inBlock=true; continue; }
    if (mW) { cur.why=(mW[1]||"").trim(); continue; }
    if (mN) { cur.next=(mN[1]||"").trim(); continue; }
  }
  if (inBlock) blocks.push(cur);
  // Fallback: si no vino en formato de lista, intenta single
  if (!blocks.length) {
    const single = {
      reply: (text.match(/REPLY:\s*([\s\S]*?)(?:\n+WHY:|\n+NEXT:|$)/i)?.[1] || "").trim(),
      why:   (text.match(/WHY:\s*(.*?)(?:\n+NEXT:|$)/i)?.[1] || "").trim(),
      next:  (text.match(/NEXT:\s*(.*)$/i)?.[1] || "").trim()
    };
    if (single.reply) blocks.push(single);
  }
  return blocks.filter(b => (b.reply||"").trim());
}

function guessSentimentByText(q=""){
  const s = (q||"").toLowerCase();
  const neg = /(no puedo|caro|difícil|no sirve|no tengo tiempo|no se|no sé)/i.test(s);
  const pos = /(genial|perfecto|me interesa|gracias|bien|listo)/i.test(s);
  if (neg) return "neg";
  if (pos) return "pos";
  return "neu";
}

async function genTrainerReplyDynamic({ question, customerName, stage, intentIn, context }) {
  const safeName = (customerName || "Cliente").trim();
  const intent = intentIn || inferIntent(question);
  const knowledge = await buildKnowledgeSnippet(intent);
  const sentiment = guessSentimentByText(question);

  // Sistema + reglas (variedad + estilo + técnica)
  const rules = [
    "Eres FerBot (Platzi, Colombia). Voz: Ferney (humano, directo, cálido).",
    "WhatsApp: 1–2 frases, ≤220 caracteres. Nada de llamadas, envíos o links.",
    "Vendes plan ANUAL; conecta característica→beneficio→beneficio de vida.",
    "Usa SOLO lo que el cliente dijo (objetivo, área, certificación, competencia). No inventes temas.",
    "Integración: sintonía y apertura (no pre-cierre).",
    "Respuestas con técnica comercial moderna: reencuadre, prueba social sutil (sin inventar), CTA amable, opción A/B si aplica.",
    "Incluye variación de wording: cambia verbos, orden, y micro-CTAs para evitar respuestas idénticas.",
    "Formato ESTRICTO por variante: REPLY/WHY/NEXT."
  ].join("\n");

  const system = [
    TRAINER_IDENTITY || "",
    rules,
    knowledge ? `Conocimiento relevante:\n${knowledge}` : ""
  ].filter(Boolean).join("\n\n");

  // Pedimos 5 variantes para escoger aleatoriamente
  const user = [
    `Nombre del cliente: ${safeName}`,
    `Stage: ${stage}`,
    `Intent: ${intent}`,
    context ? `Contexto adicional: ${context}` : "",
    "Mensaje del cliente (usa SOLO esta necesidad):",
    question,
    "",
    "Genera 5 VARIANTES diferentes en este formato, numeradas:",
    "1) REPLY: <mensaje listo WhatsApp>",
    "   WHY: <principio breve>",
    "   NEXT: <siguiente paso>",
    "2) REPLY: ...",
    "   WHY: ...",
    "   NEXT: ...",
    "… hasta 5.",
    "Varía verbos, orden y micro-CTAs. Evita repetir redactados."
  ].filter(Boolean).join("\n");

  const { content, modelUsed } = await callOpenAIWithFallback({
    messages: [
      { role:"system", content: system },
      { role:"user",   content: user }
    ]
  });

  // Parsear las 5 y elegir 1 al azar (sin repetir)
  const variants = parseMultiCandidates(content);
  let reply = dedupeAndPick(variants.map(v=>v.reply), Date.now());
  let why   = dedupeAndPick(variants.map(v=>v.why),   Date.now()+7);
  let next  = dedupeAndPick(variants.map(v=>v.next),  Date.now()+13);

  if (!reply) reply = `Entendido, ${safeName}; hay una ruta clara para tu objetivo y puedes empezar hoy mismo.`;
  reply = sanitizeReply(softenIfUncataloged(reply));
  reply = addLightEmoji(reply, sentiment);
  if (!why)  why  = fallbackWhy(stage, intent);
  if (!next) next = fallbackNext(stage);

  return { reply, why, next, modelUsed, intent, stage };
}

app.post("/assist_trainer", async (req, res) => {
  try {
    const payload = {
      question: (req.body?.question || "").slice(0, 1200),
      customerName: req.body?.customerName || "",
      stage: req.body?.stage || "rebatir",
      intentIn: req.body?.intent,
      context: (req.body?.context || "").slice(0, 600)
    };

    if (!process.env.OPENAI_API_KEY) {
      const name = payload.customerName || "Cliente";
      const intent = payload.intentIn || inferIntent(payload.question);
      let reply = clampReplyToWhatsApp(pickVariant(intent, payload.stage, name));
      reply = addLightEmoji(reply, guessSentimentByText(payload.question));
      await trackShown(intent, payload.stage, reply);
      return res.json({
        ok: true, text: reply,
        result: { reply, why: fallbackWhy(payload.stage,intent), next: fallbackNext(payload.stage), model: "offline-variants", intent, stage: payload.stage }
      });
    }

    try {
      const { reply, why, next, modelUsed, intent, stage } = await genTrainerReplyDynamic(payload);
      if (violatesHardRules(reply)) {
        // Nunca devolver cosas prohibidas
        const safeName = payload.customerName || "Cliente";
        const r2 = `Te entiendo, ${safeName}; hay una ruta clara y podemos empezar hoy mismo. ¿Te muestro cómo?`;
        await trackShown(intent, stage, r2);
        return res.json({
          ok: true, text: r2,
          result: { reply: r2, why: fallbackWhy(stage,intent), next: fallbackNext(stage), model: "guardrail", intent, stage }
        });
      }
      await trackShown(intent, stage, reply);
      return res.json({
        ok: true,
        text: reply,
        whatsapp: reply,
        message: reply,
        answer: reply,
        result: {
          reply, why, next,
          guide: `POR QUÉ: ${why} · SIGUIENTE PASO: ${next}`,
          sections: { [stage]: reply },
          model: modelUsed, confidence: 0.9, intent, stage
        }
      });
    } catch (e) {
      const name = payload.customerName || "Cliente";
      const intent = payload.intentIn || inferIntent(payload.question);
      const r2 = addLightEmoji(`Entendido, ${name}; tengo una ruta clara para tu objetivo y podemos empezar hoy. ¿Seguimos?`, guessSentimentByText(payload.question));
      await trackShown(intent, payload.stage, r2);
      return res.json({
        ok: true,
        text: r2,
        result: { reply: r2, why: fallbackWhy(payload.stage,intent), next: fallbackNext(payload.stage), model: "fallback", intent, stage: payload.stage },
        error_note: String(e && (e.message || e))
      });
    }
  } catch (err) {
    const reply = "Todo listo para ayudarte; puedo proponerte una ruta y avanzar hoy mismo. ¿Seguimos?";
    res.json({ ok:true, text: reply, result:{ reply, intent:"_default", stage:"rebatir", model:"failsafe" } });
  }
});

// ============== TRACKING / DASHBOARD =======
app.post("/trackRate", async (req, res) => {
  try {
    const { intent = "_default", stage = "rebatir", text = "", rating = "regular" } = req.body || {};
    if (!text) return res.status(400).json({ ok:false, error:"missing_text" });
    if (!["good","regular","bad"].includes(rating)) return res.status(400).json({ ok:false, error:"invalid_rating" });
    await trackRating(intent, stage, text, rating);
    res.json({ ok:true });
  } catch (err) {
    res.status(500).json({ ok:false, error:"track_rate_failed", detail: String(err && err.message || err) });
  }
});

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
    res.status(500).json({ ok:false, error:"stats_failed", detail: String(err && err.message || err) });
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

// ============== PAGES ======================
app.get("/agent", (_req,res)=> res.redirect("/agent.html"));
app.get("/panel", (_req,res)=> res.redirect("/panel.html"));

// ============== INICIO =====================
(async () => {
  await loadVariants();
  await loadTrainerIdentity();
  await loadSafeTopics();
  console.log("➡️  OpenAI habilitado:", !!process.env.OPENAI_API_KEY, "| Modelo preferido:", process.env.OPENAI_MODEL || "gpt-5");
  const PORT = Number(process.env.PORT || 3000);
  app.listen(PORT, () => console.log(`🔥 FerBot API escuchando en http://localhost:${PORT}`));
})();
