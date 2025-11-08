// server.js — FerBot API (online-first: trainer/knowledge/catalog recargables, link pago en cierre, planes coherentes, latencia optimizada)
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

// Asegurar estructura
for (const p of [DATA_DIR, TRAINER_KNOW]) {
  if (!fssync.existsSync(p)) fssync.mkdirSync(p, { recursive: true });
}
if (!fssync.existsSync(MEMORY_PATH))   fssync.writeFileSync(MEMORY_PATH, JSON.stringify({ items: [] }, null, 2));
if (!fssync.existsSync(VARIANTS_PATH)) fssync.writeFileSync(VARIANTS_PATH, JSON.stringify({ byKey: {} }, null, 2));
if (!fssync.existsSync(STATS_PATH))    fssync.writeFileSync(STATS_PATH, JSON.stringify({ byKey: {} }, null, 2));
if (!fssync.existsSync(TRAINER_TXT))   fssync.writeFileSync(TRAINER_TXT, "");
if (!fssync.existsSync(CATALOG_PATH))  fssync.writeFileSync(CATALOG_PATH, JSON.stringify({ areas: [] }, null, 2));

// ============== HELPERS: FS/strings ====================
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
function escapeHtml(s=""){return s.replace(/[&<>"']/g, m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]))}
function stripMd(s=""){
  return String(s)
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/`{1,3}[\s\S]*?`{1,3}/g, "")
    .replace(/\*\*?|__|~~/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
function minifyForLLM(s="", max=4000){
  const t = normalizeSpaces(stripMd(s));
  return t.length > max ? t.slice(0, max) : t;
}
async function withTimeout(promise, ms){
  let t; const timeout = new Promise((_, rej) => t = setTimeout(()=>rej(new Error("llm_timeout")), ms));
  try { return await Promise.race([promise, timeout]); }
  finally { clearTimeout(t); }
}

// ============== INTENT ====================
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

// ============== HARD RULES =================
function violatesHardRules(text=""){
  const banned = /\b(te (env[ií]o|mando|paso|agendo|llamo)|llamada|material(es)?)\b/i;
  return banned.test(text);
}
function sanitizeReply(text=""){
  let t = clampReplyToWhatsApp(text, 220);
  t = t.replace(/\b(te (env[ií]o|mando|paso|agendo|llamo)|llamada|material(es)?)\b/gi, "")
       .replace(/\s+/g," ").trim();
  return t;
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
  if (rating === "good") {
    stats.byKey[key][t].good += 1; stats.byKey[key][t].wins += 1;
  } else if (rating === "regular") {
    stats.byKey[key][t].regular += 1; stats.byKey[key][t].wins += 0.5;
  } else if (rating === "bad") {
    stats.byKey[key][t].bad += 1;
  }
  await writeJsonPretty(STATS_PATH, stats);
}

// ============== VARIANTS OFFLINE ===========
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

// ============== TRAINER CACHE =============
let TRAINER_IDENTITY = "";
async function loadTrainerIdentity() {
  try {
    TRAINER_IDENTITY = (await fs.readFile(TRAINER_TXT, "utf8")).trim();
  } catch { TRAINER_IDENTITY = ""; }
}

// Knowledge por intent (reduce latencia y aumenta pertinencia)
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
    return minifyForLLM(buf.join("\n\n---\n\n"), 4000);
  } catch { return ""; }
}

// ============== CATÁLOGO (recargable) =====
let CATALOG = { areas: [] };

async function loadCatalog() {
  try {
    if (!fssync.existsSync(CATALOG_PATH)) {
      await fs.writeFile(CATALOG_PATH, JSON.stringify({ areas: [] }, null, 2), "utf8");
    }
    const raw = await fs.readFile(CATALOG_PATH, "utf8");
    const json = JSON.parse(raw);
    if (json && Array.isArray(json.areas)) {
      CATALOG = json;
    } else {
      CATALOG = { areas: [] };
    }
  } catch {
    CATALOG = { areas: [] };
  }
}
function catalogTitles() {
  const titles = [];
  for (const a of (CATALOG.areas || [])) {
    for (const r of (a.routes || [])) {
      titles.push(r.title);
      for (const c of (r.courses || [])) titles.push(c.title);
    }
  }
  return titles.filter(Boolean);
}
function catalogKeywords() {
  const kws = [];
  for (const a of (CATALOG.areas || [])) {
    for (const k of (a.keywords || [])) kws.push(k);
  }
  return kws.filter(Boolean);
}
function matchCatalogAreaByText(text="") {
  const s = (text || "").toLowerCase();
  let best = null, bestHits = 0;
  for (const a of (CATALOG.areas || [])) {
    const kws = (a.keywords || []).map(x => String(x).toLowerCase());
    const hits = kws.reduce((acc, kw) => acc + (s.includes(kw) ? 1 : 0), 0);
    if (hits > bestHits) { best = a; bestHits = hits; }
  }
  return best;
}
function sanitizeToCatalog(text="") {
  let t = String(text || "");
  if (!t.trim()) return t;

  const allowed = catalogTitles();
  if (!allowed.length) return t;

  const sentences = t.split(/(?<=[.!?])\s+/).filter(Boolean);
  let mentions = 0;
  const allowedLower = new Set(allowed.map(x => x.toLowerCase()));

  const cleaned = sentences.map(s => {
    let out = s;
    const candidates = (s.match(/([A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑ]+(?: [A-Z0-9ÁÉÍÓÚÑ][\wÁÉÍÓÚÑ]+){0,6})/g) || [])
      .map(x => x.trim()).filter(x => x.length > 3);

    for (const cand of candidates) {
      const ok = allowedLower.has(cand.toLowerCase());
      if (!ok) {
        out = out.replace(cand, "una ruta guiada");
      } else {
        mentions++;
        if (mentions > 2) {
          out = out.replace(cand, "una ruta guiada");
        }
      }
    }
    return out;
  });

  t = cleaned.join(" ");
  t = t.replace(/(,?\s*(curso|ruta)\s+[^\.,;]{3,40}){3,}/gi, " rutas guiadas");
  return normalizeSpaces(t);
}
function catalogPromptSummary(maxLen = 1500) {
  const chunks = [];
  for (const a of (CATALOG.areas || [])) {
    const line = `• ${a.name}${a.certification ? " (certificación)" : ""}: ` +
      (a.routes?.[0]?.title ? `${a.routes[0].title}` : "rutas disponibles");
    chunks.push(line);
    if (a.routes?.[0]?.courses?.length) {
      const cs = a.routes[0].courses.slice(0, 2).map(c => c.title).join(", ");
      if (cs) chunks.push(`   Ejemplos: ${cs}`);
    }
  }
  let txt = chunks.join("\n");
  if (txt.length > maxLen) txt = txt.slice(0, maxLen);
  return txt;
}

// ============== PLANES (expert/duo/groups) =============
function detectPlanHint(question="", context="") {
  const s = `${question} ${context}`.toLowerCase();
  if (/\b(grupo|grupal|equipo|empresa|mi equipo|mi área|mi squad|varios|más de 2|mas de 2|5 personas|10 personas)\b/.test(s)) {
    return "groups";
  }
  if (/\b(duo|pareja|amig[oa]|compañer[oa]|dos personas|2 personas|para dos)\b/.test(s)) {
    return "duo";
  }
  if (/\b(yo solo|individual|sol[oa]|para mí|para mi|una persona|1 persona)\b/.test(s)) {
    return "expert";
  }
  return "expert";
}
function sanitizePlans(text="", planHint="expert") {
  let t = String(text || "");
  if (planHint === "groups") {
    t = t.replace(/\b(expert duo|duo|expert individual|individual|expert)\b/gi, "").replace(/\s{2,}/g," ").trim();
  } else if (planHint === "duo") {
    t = t.replace(/\b(grupos|groups|plan grupos|para equipos)\b/gi, "");
    t = t.replace(/\b(expert individual|individual)\b/gi, "");
    t = t.replace(/\s{2,}/g," ").trim();
  } else {
    t = t.replace(/\b(grupos|groups|plan grupos|para equipos|duo|expert duo)\b/gi, "").replace(/\s{2,}/g," ").trim();
  }
  return t;
}

// ============== LINK DE PAGO ===========================
const PAYMENT_URL = "https://platzi.com/precios";
const PAYMENT_LINK_TOGGLE = (process.env.PAYMENT_LINK_TOGGLE || "on").toLowerCase() !== "off";
function hasPriceSignal(text = "") {
  const s = (text || "").toLowerCase();
  return (
    /\b(mxn|cop|clp|pen|uyu|gtq|bob|pyg|dop|crc|ars|usd|eur)\b/i.test(s) ||
    /(\$|€|₲|₡|s\/)/.test(text) ||
    /(precio|cuesta|vale|descuento|promo|oferta)/i.test(s) ||
    /\b\d[\d\.\, ]{1,12}\b/.test(text)
  );
}
function attachPaymentLinkIfNeeded(reply, { stage, intent }) {
  if (!PAYMENT_LINK_TOGGLE) return reply;
  if (String(stage) !== "cierre") return reply;
  if (!(String(intent) === "precio" || hasPriceSignal(reply))) return reply;
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
  res.json({ ok: true, identity_len, knowledge_len: total_knowledge_len });
});

app.get("/admin/reloadCatalog", async (_req, res) => {
  await loadCatalog();
  const titles = catalogTitles();
  res.json({ ok:true, areas: (CATALOG.areas||[]).length, titles: titles.length });
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
      temperature: 0.2,
      max_tokens: 120,
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
    const planHint = detectPlanHint(question, context);

    if (!process.env.OPENAI_API_KEY) {
      return res.status(400).json({ ok:false, error:"missing_openai_api_key" });
    }
    const model = process.env.OPENAI_MODEL || "gpt-5";

    // Reglas + identidad Ferney + emojis controlados (se pueden orientar desde trainer_identity)
    const rules = [
      "Eres FerBot (Platzi, Colombia). Voz: Ferney (humano, directo, cálido).",
      "WhatsApp: 1–2 frases, ≤220 caracteres. Nada de llamadas ni 'te envío' ni promesas fuera de política.",
      "Vendes plan ANUAL; conecta característica→beneficio→beneficio de vida.",
      "Usa emojis con criterio (máx 2 por mensaje, 1 por frase). No uses emojis de urgencia agresiva.",
      "Usa SOLO lo que el cliente dijo (objetivo, área, certificación, competencia). No introduzcas temas no mencionados.",
      "Integración: afirmar solución y abrir conversación (sin sondeo duro ni pre-cierre).",
      "Sondeo: 1 sola pregunta para orientar la ruta (sin cerrar).",
      "No mezcles planes: respeta el hint de plan (groups/duo/expert).",
      "Si el cliente pide programa/curso, usa SOLO el catálogo provisto; si no hay match, di 'ruta guiada' sin inventar títulos.",
      "Menciona máx 2 títulos reales; evita enumeraciones largas. En duda, di 'ruta guiada'.",
      "Si el cliente NO pidió precio, no des precios. En cierre con precio, el link lo agrega el servidor.",
      "Formato ESTRICTO (3 líneas):",
      "REPLY: <mensaje listo WhatsApp>",
      "WHY: <principio de venta/enseñanza breve>",
      "NEXT: <siguiente paso comercial amable>",
      "Varía redacción entre consultas; evita repetir frases previas."
    ].join("\n");

    const knowledge = await buildKnowledgeSnippet(intent);
    const catalogSummary = catalogPromptSummary(1400);

    const system = [
      minifyForLLM(TRAINER_IDENTITY, 2000),
      rules,
      catalogSummary ? `Catálogo (resumen confiable):\n${catalogSummary}` : "",
      knowledge ? `Conocimiento:\n${minifyForLLM(knowledge, 4000)}` : ""
    ].filter(Boolean).join("\n\n");

    const user = [
      `Nombre del cliente: ${safeName}`,
      `Stage: ${stage}`,
      `Intent: ${intent}`,
      `Plan preferido (hint): ${planHint}`,
      context ? `Contexto adicional: ${context}` : "",
      "Si nombras cursos o rutas, deben existir en el catálogo; en caso de duda, menciona 'ruta guiada' y evita inventar nombres.",
      "Extrae primero la necesidad EXACTA del mensaje del cliente (sin inventar):",
      `Mensaje del cliente: ${question}`,
      "Luego entrega REPLY/WHY/NEXT. Mantén las reglas duras."
    ].filter(Boolean).join("\n");

    // Llamada con timeout + límites para bajar latencia
    let r;
    try {
      r = await withTimeout(
        openai.chat.completions.create({
          model,
          temperature: 0.2,
          max_tokens: 140,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user }
          ]
        }),
        12000 // 12s
      );
    } catch (e) {
      if (String(e.message||"").includes("llm_timeout")){
        const fast = `Entiendo tu objetivo y puedes empezar hoy; tenemos una ruta anual con certificado verificable. ¿Confirmas para activarlo? 🙂`;
        const replyLite = sanitizeReply(clampReplyToWhatsApp(fast));
        const whyLite   = fallbackWhy(stage, intent);
        const nextLite  = fallbackNext(stage);
        await trackShown(intent, stage, replyLite);
        return res.json({
          ok: true,
          text: replyLite,
          whatsapp: replyLite,
          message: replyLite,
          answer: replyLite,
          result: {
            reply: replyLite, why: whyLite, next: nextLite,
            guide: `POR QUÉ: ${whyLite} · SIGUIENTE PASO: ${nextLite}`,
            sections: { [stage]: replyLite },
            model: (process.env.OPENAI_MODEL || "gpt-5") + " (fallback)",
            confidence: 0.6, intent, stage
          }
        });
      }
      throw e;
    }

    const content = r?.choices?.[0]?.message?.content || "";
    let { reply, why, next } = parseReplyWhyNext(content);

    if (!reply) {
      reply = clampReplyToWhatsApp(content || `Hola ${safeName}, ¿te muestro una ruta clara para empezar hoy con 10–15 min al día?`);
    }
    reply = sanitizeReply(reply);
    if (violatesHardRules(reply)) {
      reply = `¡Claro! Hay una ruta guiada para tu objetivo y puedes empezar hoy mismo. 🙂`;
    }

    // Sanitizados post-LLM (catálogo real + plan preferido)
    reply = sanitizeToCatalog(reply);
    reply = sanitizePlans(reply, planHint);

    if (!why)  why  = fallbackWhy(stage, intent);
    if (!next) next = fallbackNext(stage);

    // Link de pago en cierre con precio
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
  await loadCatalog();
  console.log("➡️  OpenAI habilitado:", !!process.env.OPENAI_API_KEY, "| Modelo:", process.env.OPENAI_MODEL || "gpt-5");
  const PORT = Number(process.env.PORT || 3000);
  app.listen(PORT, () => {
    console.log(`🔥 FerBot API escuchando en http://localhost:${PORT}`);
  });
})();
