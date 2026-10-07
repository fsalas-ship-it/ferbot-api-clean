import { CONFIG } from './config.js';
import { timing } from './settings.js';
import { PRICES, CUR_LABEL, COUNTRIES, NAMES, LAST, OCCUPATIONS, GOALS, OBJ, OBJ_LABEL, OBJ_WEIGHTS, TEMPS, UPSELL, ROUTING, TRANSFER_DEST, AV_COLORS, DIMS, STATUS_LABEL, PAY_ISSUES, PAY_ISSUE_LABEL, PLAN_LABEL, FORMA_LABEL } from './data.js';

const pick = a => a[Math.floor(Math.random() * a.length)];
const rand = (a, b) => a + Math.random() * (b - a);
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const avg = a => { const v = a.filter(x => typeof x === 'number' && isFinite(x)); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
const median = a => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const mmss = ms => { const t = Math.max(0, Math.floor(ms / 1000)); return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); };
const fmtMoney = (cur, n) => (cur === 'EUR' ? '€' : '$') + Number(n).toLocaleString('en-US') + ' ' + (cur === 'USA' ? 'USD' : cur);

/* ============ GENERACIÓN DE CLIENTES ============ */
function opener(c) {
  if (c.routing) return ROUTING[c.routing].opener;
  if (c.ghost) return pick(['Hola', 'hola buenas', 'info', '👋', 'Buenas']);
  const g = c.goalKey;
  if (c.temp === 'cortante' || c.temp === 'apurado') return pick(['info', 'precio?', 'cuánto vale platzi', 'info de ' + g + ' porfa']);
  return pick(['Hola! vi un anuncio de Platzi, tienen cursos de ' + g + '?', 'Buenas, me pasas info de Platzi? me interesa ' + g, 'hola, cuánto cuesta platzi? quiero aprender ' + g, 'Hola buenas tardes, quisiera información de los cursos de ' + g, 'holaa 👋 me interesa lo de ' + g + ', cómo funciona?']);
}

// Carga de clientes por intensidad. Evaluación: 7 clientes distintos (incluye 1 fantasma) y hasta 2 que vuelven.
// Entrenamiento: 5 clientes distintos (incluye 1 fantasma) y hasta 1 que vuelve.
export const INTENSITY = {
  evaluacion: { label: 'Evaluación', maxSim: 4, maxReact: 2 },
  entrenamiento: { label: 'Entrenamiento', maxSim: 3, maxReact: 1 }
};
// Conversación previa con el bot (modo traspaso de la práctica)
// Elige objeciones distintas según su frecuencia real
function pickObjs(n, exclude = []) {
  const out = [];
  while (out.length < n) {
    const pool = Object.keys(OBJ_WEIGHTS).filter(k => !out.includes(k) && !exclude.includes(k));
    const total = pool.reduce((t, k) => t + OBJ_WEIGHTS[k], 0);
    let r = Math.random() * total, pickK = pool[pool.length - 1];
    for (const k of pool) { r -= OBJ_WEIGHTS[k]; if (r <= 0) { pickK = k; break; } }
    out.push(pickK);
  }
  return out;
}
const OBJ_SAY = {
  precio: ['uy no, está muy caro', 'mmm es mucha plata para mí ahora', 'pero en youtube hay cursos gratis'],
  tiempo: ['es que trabajo todo el día, no sé si tenga tiempo', 'no sé si me dé el tiempo la verdad'],
  sin_pc: ['no tengo computador, solo el celular', 'pero yo solo tengo celular, sirve?'],
  disciplina: ['ya he intentado cursos online y siempre los dejo', 'me da miedo empezar y no terminar como siempre'],
  medios_pago: ['no tengo tarjeta, cómo pago?', 'yo no manejo tarjeta, hay otra forma?'],
  mas_barato: ['vi en la página que estaba más barato', 'pero en un anuncio lo vi con más descuento'],
  desconfianza: ['no sé, cómo sé que esto sí funciona?', 'y si no me gusta me devuelven la plata?'],
  cuotas: ['me queda pesado de un solo pago, se puede a cuotas?', 'y en cuántas cuotas lo puedo pagar?'],
  certificado: ['y el certificado es válido? sirve para mi trabajo?', 'los certificados son oficiales?'],
  lo_pienso: ['déjame lo pienso y te aviso', 'mejor lo veo más adelante']
};
function botTranscript(c, prices) {
  const first = c.name.split(' ')[0];
  const P = (prices || PRICES)[c.cur] || PRICES[c.cur];
  const tpl = { f: 'b', x: 'Hola, ' + first + ' 👋 Vimos que te interesa aprender ' + c.goalKey + ' en Platzi. ¿Qué te gustaría hacer?' };
  const transfer = [{ f: 'b', x: 'Entiendo 🙌 Te comunico con un asesor que te puede ayudar mejor. En un momento te escribe.' }, { f: 's', x: 'Conversación transferida a un asesor' }];
  if (c.routing) return [tpl, { f: 'c', x: 'Tengo preguntas' }, { f: 'b', x: '¡Con gusto! Cuéntame, ¿en qué te puedo ayudar?' }, { f: 'c', x: ROUTING[c.routing].opener }].concat(transfer);
  const why = (c.goal.includes(' para ') ? 'para ' + c.goal.split(' para ').slice(1).join(' para ') : 'para crecer profesionalmente').replace(/\bsu\b/g, 'mi');
  return [tpl, { f: 'c', x: pick(['Tengo preguntas', 'Quiero más información']) },
    { f: 'b', x: '¡Con gusto! Cuéntame, ¿para qué te gustaría aprender ' + c.goalKey + '?' },
    { f: 'c', x: why },
    { f: 'b', x: '¡Excelente meta! Te recomiendo el plan Expert anual, con acceso a todas las escuelas. Cuesta ' + fmtMoney(c.cur, P.list[0]) + ' y puedes pagarlo en 4 cuotas sin intereses con tarjeta. ¿Te envío el link para inscribirte?' },
    { f: 'c', x: pick(OBJ_SAY[c.obj[0]] || ['mmm no sé']) }].concat(transfer);
}
export function buildClients(profile, st, intensity, opts = {}) {
  const tm = timing(st);
  const ext = profile === 'externos';
  const train = intensity === 'entrenamiento';
  const special = { obj: pickObjs(1), temp: 'normal', upsell: pick(['duo', 'groups']) };
  const route = { obj: [], temp: 'normal', routing: pick(['soporte', 'renovacion', 'smb']) };
  const hard = pickObjs(2);
  const specs = train ? {
    1: [{ obj: pickObjs(1), temp: 'amable' }],
    2: [{ obj: pickObjs(1), temp: 'normal' }],
    3: [special, { obj: pickObjs(1), temp: 'normal', ghost: 1 }],
    4: [Math.random() < 0.5 ? route : { obj: hard, temp: pick(['indeciso', 'exigente']) }]
  } : {
    1: [{ obj: pickObjs(1), temp: 'amable' }],
    2: (() => { const a = pickObjs(1), b = pickObjs(1, a); return shuffle([{ obj: a, temp: 'normal' }, { obj: b, temp: 'normal' }]); })(),
    3: shuffle([{ obj: pickObjs(2), temp: 'exigente' }, special]).concat([{ obj: pickObjs(1), temp: 'normal', ghost: 2 }]),
    4: shuffle([{ obj: hard, temp: pick(['cortante', 'desconfiado', 'apurado']) }, route])
  };
  let countries = shuffle(COUNTRIES); const used = new Set(); const out = [];
  for (const lvl of [1, 2, 3, 4]) {
    const list = specs[lvl];
    const eligible = list.map((s, k) => (s.routing ? null : k)).filter(k => k != null);
    const q = eligible.length * tm.buyerRate;
    const nBuy = Math.floor(q) + (Math.random() < q - Math.floor(q) ? 1 : 0);
    const buyers = new Set(shuffle(eligible).slice(0, nBuy));
    let off = 1500; const g = st.arrivalGapSec.map(x => x * 1000); const gap = lvl === 4 ? [g[0] * 0.8, g[1] * 0.8] : g; let newIdx = 0;
    list.forEach((sp, k) => {
      if (!countries.length) countries = shuffle(COUNTRIES);
      const co = countries.pop(), g = Math.random() < 0.5 ? 'f' : 'm';
      let name; do { name = pick(NAMES[g]) + ' ' + pick(LAST); } while (used.has(name)); used.add(name);
      const goal = pick(GOALS);
      const offset = Math.round(sp.ghost ? off + rand(gap[0] * 1.2, gap[1] * 1.4) : off);
      if (!sp.ghost) off += rand(gap[0], gap[1]);
      const c = { id: 'c' + (out.length + 1), level: lvl, name, country: co.name, flag: co.flag, cur: co.cur, pay: co.pay,
        occupation: pick(OCCUPATIONS), goal: goal.d, goalKey: goal.k, temp: sp.temp, obj: sp.obj, upsell: sp.upsell || null, routing: sp.routing || null,
        buyer: buyers.has(k), ghost: !!sp.ghost, ghostNeed: sp.ghost || 0, offset, color: AV_COLORS[out.length % AV_COLORS.length],
        l4order: lvl === 4 && !sp.ghost ? newIdx++ : null };
      c.buyerEver = c.buyer; c.opener = opener(c);
      if (c.buyer && Math.random() < 0.4) c.payIssue = pick(Object.keys(PAY_ISSUES));
      if (opts.handoff) { c.handoff = true; c.preMsgs = botTranscript(c, opts.prices); }
      out.push(c);
    });
  }
  return out;
}
export function publicClient(c) {
  return { id: c.id, level: c.level, name: c.name, country: c.country, flag: c.flag, cur: c.cur, color: c.color, offset: c.offset, ghost: c.ghost, ghostNeed: c.ghostNeed, opener: c.opener, preMsgs: c.preMsgs || null };
}
export function publicConfig(st, prices, intensity) {
  const tm = timing(st), it = INTENSITY[intensity] || INTENSITY.evaluacion;
  return { maxSim: it.maxSim, maxReact: it.maxReact, testSec: tm.testSec, extraSec: tm.extraSec, extraCheckAtSec: tm.extraCheckAtSec, extraDecideAtSec: tm.extraDecideAtSec, levels: tm.levels, ghostPushGapSec: CONFIG.ghostPushGapSec,
    replyDelaySec: st.replyDelaySec, typingMsPerChar: st.typingMsPerChar, prices: prices || PRICES, curLabel: CUR_LABEL };
}

// Compatibilidad: pruebas guardadas antes pueden tener casos de enrutamiento que ya no existen
const routeOf = c => (c && c.routing ? (ROUTING[c.routing] || { dest: null, label: 'Caso de enrutamiento anterior', opener: '', prompt: '' }) : null);

/* ============ LINKS DE PAGO ============ */
// Formato: https://<sitio>/pago.html?p=<plan>-<moneda>-<monto>-<forma>, por ejemplo ?p=expert-cop-849999-4cuotas
// (también se acepta el formato anterior /pago/<plan>-...)
const LINK_RE = /\/pago(?:\.html\?p=|\/)(expert|duo|groups)-([a-z]{3})-(\d+(?:\.\d+)?)-(contado|4cuotas|12msi|transferencia|efectivo)/gi;
export function parseLinks(msgs) {
  const out = [];
  (msgs || []).forEach(m => { if (m.f !== 'v') return; let x; LINK_RE.lastIndex = 0;
    while ((x = LINK_RE.exec(String(m.x)))) out.push({ t: m.t, plan: x[1].toLowerCase(), cur: x[2].toUpperCase(), amount: Number(x[3]), forma: x[4].toLowerCase() }); });
  return out;
}
export function checkLink(link, c, prices, profile) {
  const P = (prices || PRICES)[link.cur], issues = [];
  const idx = { expert: 0, duo: 1, groups: 2 }[link.plan];
  if (link.cur !== c.cur) issues.push('Moneda incorrecta: envió ' + link.cur + ' y el cliente paga en ' + c.cur + '.');
  if (P) {
    const list = P.list[idx], disc = P.disc[idx];
    if (link.amount < disc - 0.5) issues.push('Precio por debajo del mínimo permitido (más del 15% de descuento).');
    else if (link.amount > list + 0.5) issues.push('Precio por encima del precio de lista.');
  }
  if (link.forma === '12msi' && c.cur !== 'MXN') issues.push('Ofreció 12 meses sin intereses, que solo aplica en México.');
  if ((link.forma === '4cuotas' || link.forma === '12msi' || link.forma === 'contado') && (c.obj || []).includes('medios_pago')) issues.push('Envió un link de pago con tarjeta a un cliente que no tiene tarjeta; correspondía transferencia, PSE o efectivo.');
  if (link.forma === 'efectivo' && ['EUR', 'USA'].includes(c.cur)) issues.push('El pago en efectivo no está disponible en ' + c.country + '.');
  if (routeOf(c) && routeOf(c).dest === 'smb') issues.push('Le envió un link de compra a una empresa de más de 5 personas, que debía transferirse a SMB.');
  if (routeOf(c) && routeOf(c).dest === 'soporte') issues.push('Le envió un link de compra a alguien que ya es cliente, que debía transferirse a Soporte.');
  return issues;
}
export function describeLink(l) {
  return 'plan ' + PLAN_LABEL[l.plan] + ', ' + Number(l.amount).toLocaleString('en-US') + ' ' + l.cur + ', ' + FORMA_LABEL[l.forma];
}

/* ============ PROMPTS ============ */
function priceBlock(cur, prices) {
  const P = (prices || PRICES)[cur] || PRICES[cur], f = n => fmtMoney(cur, n);
  return 'Precios de lista (pago anual): Expert ' + f(P.list[0]) + ', Duo ' + f(P.list[1]) + ', Groups desde 4 personas ' + f(P.list[2]) + '.\n' +
    'Precio mínimo permitido (precio especial máximo del 15%): Expert ' + f(P.disc[0]) + ', Duo ' + f(P.disc[1]) + ', Groups ' + f(P.disc[2]) + '.';
}
function transcript(msgs, maxChars) {
  let lines = msgs.map(m => (m.f === 's' ? '--- ' + (/transferida/i.test(m.x) ? 'Conversación transferida del bot a un asesor humano' : 'pasó un rato; el cliente vuelve a escribir') + ' ---' : (m.f === 'c' ? 'CLIENTE (tú): ' : m.f === 'b' ? 'BOT DE PLATZI: ' : 'VENDEDOR: ') + String(m.x).slice(0, 700)));
  let txt = lines.join('\n');
  while (txt.length > maxChars && lines.length > 4) { lines = lines.slice(2); txt = '[…mensajes anteriores omitidos…]\n' + lines.join('\n'); }
  return txt;
}

export function clientPrompt(c, msgs, profile, st, prices) {
  const tm = timing(st);
  const clean = msgs.filter(m => m && ['c', 'v', 's', 'b'].includes(m.f)).map(m => ({ f: m.f, t: Number(m.t) || 0, x: String(m.x || '') }));
  const vCount = clean.filter(m => m.f === 'v').length;
  const lastMsg = clean[clean.length - 1];
  const markerIdx = clean.findLastIndex ? clean.findLastIndex(m => m.f === 's' && !/transferida/i.test(m.x)) : -1;
  const startT = (markerIdx >= 0 ? clean[markerIdx] : clean[0] || { t: 0 }).t;
  const convSec = Math.max(0, Math.round(((lastMsg ? lastMsg.t : 0) - startT) / 1000));
  const minBuy = c.reactivated ? tm.reactMinBuySec : tm.minBuySec;
  let lastRt = null;
  for (let i = clean.length - 1; i > 0; i--) { if (clean[i].f === 'v') { let j = i - 1; while (j >= 0 && clean[j].f === 'v') j--; if (j >= 0 && clean[j].f === 'c') { let k = j; while (k > 0 && clean[k - 1].f === 'c') k--; lastRt = Math.round((clean[j + 1].t - clean[k].t) / 1000); } break; } }

  const disp = c.routing ? 'Tu caso no es una venta nueva normal; sigue las instrucciones de tu situación.' : c.buyer
    ? 'Estás abierto a comprar HOY, pero solo si el vendedor entiende tu necesidad, rebate tus objeciones con argumentos concretos que de verdad resuelvan tu preocupación y te propone un cierre claro (plan, precio en tu moneda y una forma de pago que puedas usar). Mientras no te convenza, NO cierres la conversación: sigue preguntando y planteando dudas. Si todavía no te convence puedes decir que lo vas a pensar (estado "lo_pensare"), pero si luego el vendedor insiste con buenos argumentos y resuelve tus dudas, puedes comprar. Si es genérico, repetitivo, lento o no resuelve tus objeciones, no compres.'
    : 'Hoy NO vas a comprar, pase lo que pase. Pero NO cierres la conversación mientras el vendedor siga argumentando con sentido: responde como alguien ligeramente interesado, haz preguntas y plantea tus dudas de forma natural. Solo cuando el vendedor haya hecho un esfuerzo real (al menos 6 mensajes) o cuando él proponga retomarlo después, di que lo vas a pensar (estado "lo_pensare"). Si después de eso el vendedor insiste con argumentos nuevos y respetuosos, sigue conversando con interés leve y acepta un seguimiento, pero no compres. Si insiste de forma pesada o repitiendo lo mismo, responde cortante.';
  const ctx = [];
  if (c.routing) ctx.push(routeOf(c).prompt);
  if (c.handoff) ctx.push('Antes de esta conversación hablaste con el bot de Platzi (mensajes BOT DE PLATZI) y le contaste tu meta y tu objeción. El asesor humano que te atiende ahora puede ver esa conversación. Si el asesor usa o resume lo que hablaste con el bot (por ejemplo, menciona tu meta, el plan que te ofrecieron o tu objeción), eso te parece BIEN: significa que te leyó; respóndele con naturalidad y sigue la conversación desde ahí. Que el asesor retome lo que te dijo el bot NO es repetir. Solo si el asesor te vuelve a PREGUNTAR algo que ya respondiste al bot, como si no lo hubiera leído, se lo recuerdas con amabilidad y un poco de impaciencia.');
  if (c.ghost && c.ghostEngaged) ctx.push('Al principio saludaste y no respondiste más. El vendedor te volvió a escribir para retomar. Responde ahora con una excusa breve y natural (por ejemplo, que estabas ocupado) y sigue como un cliente normal.');
  if (c.reactivated) ctx.push('Hace un rato hablaste con este vendedor y dijiste que lo ibas a pensar. Ahora vuelves a escribir porque sigues interesado. Si el vendedor recuerda lo que hablaron y te hace una propuesta clara, eso te gusta mucho. Si te trata como un cliente nuevo o te vuelve a preguntar todo, te molesta.');
  if (c.annoyed) ctx.push('El vendedor te dejó esperando demasiado sin responder y te molestaste. Responde con fastidio al principio. Si se disculpa y te atiende bien, puedes suavizarte un poco, pero sigues con poca confianza y muy pocas ganas de comprar.');
  if (c.postSale) ctx.push('Ya pagaste tu plan y estás contento con la compra. Responde breve y amable a lo que te diga el asesor (activación de tu cuenta, primer curso, dudas). No te molestes por demoras. Si el asesor ya no tiene nada más que decirte, despídete agradeciendo.');
  if (c.thinking) ctx.push('Ya le dijiste al vendedor que lo ibas a pensar. Reacciona a lo que te diga ahora según tu disposición.');
  let buyingRules = null;
  if (c.buying && !c.postSale) {
    const links = parseLinks(clean);
    const last = links[links.length - 1];
    if (!last) buyingRules = 'TU COMPRA: Ya decidiste comprar. Ahora necesitas el link de pago. Si el vendedor no te lo ha enviado, pídelo con naturalidad. No digas que ya pagaste hasta que recibas un link.';
    else {
      const problems = checkLink(last, c, prices, profile);
      const lines = ['TU COMPRA: Ya decidiste comprar y el vendedor te envió un link de pago para: ' + describeLink(last) + '.'];
      if (problems.length) lines.push('Ese link tiene un problema: ' + problems.join(' ') + ' Díselo al vendedor con tus palabras y espera un link corregido. No pagues todavía.');
      else if (c.payIssue && !c.payIssueResolved) lines.push(c.payIssueRaised
        ? 'Ya le contaste este inconveniente al vendedor: ' + PAY_ISSUES[c.payIssue] + ' Si ya te dio una solución válida, paga ahora y avísale que ya pagaste (estado "pago"). Si no, sigue esperando la solución.'
        : 'Al intentar pagar te pasa esto: ' + PAY_ISSUES[c.payIssue] + ' Todavía no pagas.');
      else lines.push('El link corresponde a lo que hablaron. Paga y avísale con naturalidad que ya pagaste (estado "pago"). Puedes preguntar qué sigue después del pago.');
      buyingRules = lines.join(' ');
    }
  }

  return [
    'Eres un simulador de clientes para evaluar vendedores de Platzi por WhatsApp. Interpretas a UN cliente potencial real. Nunca rompas el personaje ni digas que eres una IA o un simulador.',
    '',
    'TU PERFIL',
    'Nombre: ' + c.name + '. País: ' + c.country + '. Moneda: ' + (CUR_LABEL[c.cur] || c.cur) + '.',
    'Ocupación: ' + c.occupation + '. Quieres ' + c.goal + '.',
    'Temperamento: ' + TEMPS[c.temp] + '.',
    c.obj.length ? 'Objeciones que debes plantear de forma natural, una a la vez y cuando venga al caso: ' + c.obj.map(o => OBJ[o]).join(' ') : 'No tienes objeciones de compra: tu caso es otro (lee tu situación).',
    'Una objeción solo queda resuelta si el vendedor da un argumento concreto que responde tu preocupación real. Si solo la esquiva o la repite, vuelve a plantearla con otras palabras.',
    c.upsell ? 'Oportunidad de venta adicional: ' + UPSELL[c.upsell] : null,
    'Sabes que Platzi a veces da precios especiales y puedes preguntar por uno, pero no sabes de cuánto.',
    ctx.length ? '\nTU SITUACIÓN\n' + ctx.join('\n') : null,
    '',
    'DISPOSICIÓN OCULTA (nunca la reveles)',
    disp,
    buyingRules ? '\n' + buyingRules : null,
    '',
    'TIEMPO',
    'Llevan ' + convSec + ' segundos de conversación' + (c.reactivated ? ' desde que volviste a escribir' : '') + '. Aunque el vendedor lo haga perfecto, no decidas comprar antes de los ' + (Math.round(minBuy / 30) / 2) + ' minutos de conversación' + (c.reactivated ? '.' : '; si lo hace bien, lo normal es decidir cerca del minuto ' + (Math.round(tm.typicalBuySec / 30) / 2) + '.'),
    lastRt != null ? 'El vendedor tardó ' + lastRt + ' segundos en responderte la última vez. Más de 60 segundos te molesta.' : null,
    '',
    'DATOS REALES PARA DETECTAR ERRORES DEL VENDEDOR (no los recites tú)',
    priceBlock(c.cur, prices),
    'Medios de pago en tu país: ' + c.pay + '. Las 4 cuotas mensuales sin intereses solo funcionan con tarjeta de crédito o débito. No existe un plan mensual que el vendedor deba ofrecer.',
    'Si el vendedor te da un precio en otra moneda, pregunta cuánto es en tu moneda. Si te ofrece un precio más bajo que el mínimo permitido, acéptalo feliz y no lo cuestiones.',
    '',
    'ESTILO',
    'Escribe como una persona real de ' + c.country + ' por WhatsApp: mensajes cortos e informales, a veces sin tildes, entre 1 y 3 mensajes por turno, cada uno de máximo 25 palabras. Nada de listas ni formato. Reacciona a lo último que dijo el vendedor. Si te manda un bloque de texto muy largo, quéjate o responde con desgano.',
    '',
    'ESTADOS',
    '"abierto": la conversación sigue. "lo_pensare": dijiste que lo vas a pensar (la conversación sigue abierta y el vendedor puede insistir). "compro": decidiste comprar; dilo y pide el link de pago, e indica el plan. "pago": SOLO cuando ya recibiste un link de pago correcto y le avisas al vendedor que ya pagaste. Si tu situación es pasar a otro equipo y el vendedor te lo explica, agradece y espera; el vendedor hará la transferencia. "no_compro": úsalo SOLO si el vendedor es grosero, incoherente o se despide definitivamente sin dejar un siguiente paso.',
    'El vendedor lleva ' + vCount + ' mensajes. Si pasa de 20, toma una decisión final.',
    '',
    'CONVERSACIÓN HASTA AHORA',
    transcript(clean, 12000),
    '',
    'Responde SOLO con un objeto JSON así: {"mensajes":["texto 1","texto 2"],"estado":"abierto","plan":null}',
    'estado es "abierto", "lo_pensare", "compro", "pago" o "no_compro". plan es "expert", "duo", "groups" o null.'
  ].filter(x => x !== null).join('\n');
}

export function extraPrompt(convs) {
  const body = convs.map(c => '### ' + c.id + (c.annoyed ? ' (el cliente se molestó por demora)' : '') + '\n' +
    c.msgs.filter(m => m.f !== 's').map(m => '[' + mmss(m.t) + '] ' + (m.f === 'c' ? 'CLIENTE' : m.f === 'b' ? 'BOT' : 'VENDEDOR') + ': ' + String(m.x).slice(0, 400)).join('\n')).join('\n\n');
  return [
    '[REVISION_TIEMPO_EXTRA]',
    'Eres un supervisor de ventas de Platzi por WhatsApp. Faltan segundos para que termine una prueba corta. Decide qué conversaciones abiertas van BIEN ENCAMINADAS y merecen tiempo extra para cerrar.',
    'Una conversación va bien encaminada solo si se cumplen TODAS: el vendedor ya descubrió la necesidad o meta del cliente; rebatió con argumentos concretos las objeciones que el cliente planteó; no cometió errores graves (inventar descuentos, precios o monedas incorrectos, promesas falsas); el cliente no está molesto; y el cierre está en curso (ya propuso plan, precio o forma de pago, o está a punto).',
    'Juzga solo lo que hizo el vendedor. Sé exigente: ante la duda, no la incluyas.',
    '',
    body,
    '',
    'Responde SOLO con JSON: {"elegibles":[{"id":"c1","motivo":"frase breve"}]}. Lista vacía si ninguna cumple.'
  ].join('\n');
}

const BUSINESS = [
  'CONTEXTO DEL NEGOCIO',
  'Planes anuales: Expert (1 persona), Duo (2 personas), Groups (desde 4). No se ofrece plan mensual: si el cliente pide algo mensual o barato, lo correcto es ofrecer el plan anual en 4 cuotas sin intereses (solo con tarjeta). En México también hay 12 meses sin intereses.',
  'Precio especial máximo: 15% (el precio mínimo es el de la columna con precio especial). Se debe decir "precio especial", nunca "descuento", y usarlo como palanca, no regalarlo de entrada.',
  'Medios de pago: tarjeta, PayPal, PSE en Colombia, efectivo, Google Pay y Apple Pay. Se cotiza en la moneda del país del cliente.',
  'Producto: más de 1.900 cursos y 18 escuelas, English Academy, certificados digitales verificables (no son títulos universitarios oficiales) y físicos por ruta, app Android e iOS con descarga de clases en planes anuales, las primeras 3 clases de cualquier curso son gratis, estudio 24/7 a tu ritmo.'
].join('\n');
const MATRIX = [
  'MATRIZ DE CALIDAD DEL SELLER (de Aura). Cada dimensión de 0 a 2, o null si no aplica (la situación no ocurrió):',
  '- contexto: 0 ignora lo que dijo el cliente y repite preguntas; 1 lo menciona sin usarlo; 2 usa lo que el cliente dijo y no repite nada.',
  '- canal: 0 muros de texto, tono de folleto o de bot, varias preguntas en un mensaje, abreviaturas tipo "q", "xq", "tmb" o "k", o muchas faltas de ortografía; 1 correcto pero impersonal o de plantilla, o con algunas faltas; 2 tono cercano y profesional en primera persona, tutea al cliente, mensajes cortos, refleja sus palabras, emojis con moderación, buena ortografía y dice "precio especial", nunca "descuento". Fragmentar en 3 a 5 mensajes cortos es buena práctica. Pegar precios, links de pago o datos del producto es normal y no se penaliza.',
  '- descubrimiento: 0 pregunta solo por plan y precio; 1 descubre la meta sin reflejarla; 2 descubre meta, motivo, punto de partida y quién estudia, y lo refleja antes de recomendar.',
  '- recomendacion: 0 recita el catálogo; 1 recomienda sin conectar con la meta; 2 una ruta, un primer proyecto y un plan atados a la meta, con la razón.',
  '- objecion: 0 discute, presiona o repite la oferta; 1 responde sin aislar la objeción real; 2 valida, aísla, responde con un hecho y confirma que quedó resuelta.',
  '- verdad: 0 precio o condición incorrecta, o plan que no cubre la meta; 1 correcta pero ambigua; 2 precio correcto de la tabla, límites claros, urgencia solo si es real.',
  '- cierre: 0 no pide la venta, no envía el link de pago, envía un link incorrecto o manda el link y desaparece; 1 envía el link correcto pero confirma solo parte (plan, precio, moneda, forma de pago, renovación) o no resuelve bien el inconveniente de pago; 2 pide la decisión, envía el link correcto, resuelve cualquier inconveniente hasta que el cliente paga y deja el siguiente paso o primer curso. En la simulación la venta cuenta cuando el cliente dice que ya pagó.',
  '- seguimiento: 0 no hace seguimiento o insiste sin motivo ("¿ya lo pensaste?"); 1 hace seguimiento sin motivo claro o fuera de tiempo; 2 retoma con un motivo concreto, máximo 3 veces. En esta prueba corta el tiempo va comprimido: un seguimiento tras 30 a 60 segundos de silencio es oportuno. null si el cliente compró o respondió sin necesitarlo.',
  'ERRORES CRÍTICOS (dejan la calidad de la conversación en 0%): garantizar empleo, salario o resultados; inventar descuentos, becas, extensiones o urgencia falsa; dar un precio o moneda incorrectos frente a la tabla; sugerir compartir una cuenta individual.',
  'Si aplican menos de 4 dimensiones, la conversación es demasiado corta y se marcan las que aplican igual.'
].join('\n');

function profileRule(profile) {
  return 'REGLAS DE ATENCIÓN (iguales para sellers internos y externos): el vendedor vende Expert, Duo y Groups de hasta 5 personas. Usa el botón Transferir para dos casos: a Soporte, quien ya es cliente de Platzi (problemas de cuenta, renovaciones, certificados); a SMB, empresas o grupos de más de 5 personas. Antes de transferir debe explicarle al cliente a dónde lo pasa y qué sigue. Es un error transferir a alguien que sí podía comprar, transferir al equipo equivocado, o venderle a quien debía transferirse.';
}
function convFacts(c, d) {
  const f = [];
  if (c.routing) f.push('Caso para transferir: ' + routeOf(c).label + '.');
  if (c.transfer) f.push('El vendedor transfirió la conversación a ' + TRANSFER_DEST[c.transfer] + (c.routing ? (routeOf(c).dest === c.transfer ? ' (equipo correcto).' : ' (equipo equivocado).') : ' (no debía transferirse: era una venta posible).'));
  if (c.ghost) f.push('Cliente fantasma: saludó y no respondió; necesitaba ' + c.ghostNeed + ' seguimiento(s) espaciados. Seguimientos hechos: ' + (c.ghostPushes || 0) + '. ' + (c.ghostState === 'engaged' ? 'Se recuperó.' : 'No se recuperó.'));
  if (c.annoyed) f.push('El cliente se molestó en el minuto ' + mmss(c.annoyedAt || 0) + ' porque el vendedor tardó en responder.');
  if (c.thinkAt != null) f.push('El cliente dijo que lo iba a pensar en el minuto ' + mmss(c.thinkAt) + '.');
  if (c.reactivated) f.push('El cliente volvió a escribir en el nivel 4 después de decir que lo pensaría.');
  if (c.extra) f.push('Esta conversación recibió tiempo extra por buena gestión.');
  const links = parseLinks(c.msgs);
  if (links.length) f.push('Links de pago enviados: ' + links.map(l => { const iss = checkLink(l, c, d && d.prices, d && d.profile); return describeLink(l) + (iss.length ? ' (problemas: ' + iss.join(' ') + ')' : ' (correcto)'); }).join('; ') + '.');
  if (c.payIssue && c.buyerEver) f.push('Inconveniente de pago asignado: ' + PAY_ISSUE_LABEL[c.payIssue] + '.');
  if (c.stage) f.push('Etapa final de la compra: ' + ({ intencion: 'dijo que compraba pero nunca recibió el link', link_enviado: 'recibió el link pero no alcanzó a pagar', venta: 'pagó' }[c.stage] || c.stage) + '.');
  return f.join(' ');
}
export function convEvalPrompt(d, c) {
  const tr = c.msgs.map(x => (x.f === 's' ? '--- ' + (/transferida/i.test(x.x) ? 'el bot transfiere la conversación al asesor' : 'el cliente vuelve a escribir más tarde') + ' ---' : '[' + mmss(x.t) + '] ' + (x.f === 'c' ? 'CLIENTE' : x.f === 'b' ? 'BOT DE PLATZI' : 'VENDEDOR') + ': ' + String(x.x).slice(0, 700) + (x.p ? ' (PEGADO)' : '') + (x.push ? ' (SEGUIMIENTO)' : ''))).join('\n');
  return [
    '[EVALUADOR_CONVERSACION]',
    'Eres un evaluador experto y exigente de sellers de Platzi por WhatsApp. Evalúa UNA conversación de una prueba simulada corta y responde SOLO con JSON.',
    '', BUSINESS, '', profileRule(d.profile), '', MATRIX, '',
    c.handoff ? 'MODO TRASPASO: el cliente ya habló con el bot de Platzi antes de llegar al vendedor (mensajes BOT DE PLATZI). Evalúa Contexto con rigor: retomar o resumir lo que el cliente le dijo al bot (meta, objeción, plan o precio ya mencionado) es lo correcto y suma; solo volver a PREGUNTAR lo que el cliente ya respondió resta. Los mensajes del bot NO son del vendedor; no los evalúes como suyos.\n' : null,
    'CONVERSACIÓN ' + c.id + ' (nivel ' + c.level + '). Cliente: ' + c.name + ', ' + c.country + ', moneda ' + (CUR_LABEL[c.cur] || c.cur) + '. Perfil: ' + c.occupation + '; quiere ' + c.goal + '; temperamento ' + c.temp + '.',
    'Objeciones asignadas: ' + (c.obj.length ? c.obj.map(o => OBJ_LABEL[o]).join(', ') : 'ninguna (caso para transferir)') + '. Oportunidad de upsell: ' + (c.upsell || 'ninguna') + '. ¿Dispuesto a comprar?: ' + (c.routing ? 'no aplica' : c.buyer ? 'sí' : (c.buyerEver ? 'lo estaba, pero se molestó' : 'no')) + '. Resultado: ' + (STATUS_LABEL[c.status] || c.status) + (c.plan ? ' (' + c.plan + ')' : '') + '.',
    convFacts(c, d),
    priceBlock(c.cur, d.prices),
    'Transcripción:', tr, '',
    'DEVUELVE EXACTAMENTE ESTE JSON:',
    '{"dimensiones":{"contexto":{"p":2,"nota":""},"canal":{"p":2,"nota":""},"descubrimiento":{"p":2,"nota":""},"recomendacion":{"p":2,"nota":""},"objecion":{"p":2,"nota":""},"verdad":{"p":2,"nota":""},"cierre":{"p":2,"nota":""},"seguimiento":{"p":null,"nota":""}},"errores_criticos":[],"objeciones_detalle":[{"objecion":"Precio","rebatida":"si","nota":""}],"moneda_correcta":true,"descuento":"no_uso","upsell":"no_aplica","enrutamiento":"no_aplica","lo_pienso":"no_aplica","push":"no_aplica","recordo_contexto":null,"comentario":""}',
    'Reglas: "p" es 0, 1, 2 o null; "nota" una frase con la evidencia. "errores_criticos": lista de frases, vacía si no hubo. "objeciones_detalle": una entrada por objeción asignada con "rebatida" = "si", "parcial", "no" o "no_planteada". "moneda_correcta": true, false o null si no dio precios. "descuento": "no_uso", "palanca_bien", "regalado" o "excedio_15". "upsell": "detectado", "perdido" o "no_aplica". "enrutamiento": "correcto" si transfirió al equipo correcto explicándole al cliente qué sigue, "incorrecto" si transfirió sin necesidad, al equipo equivocado o vendió a quien debía transferirse, "no_aplica" si no hubo caso de transferencia. "lo_pienso": "no_aplica", "insistio_bien", "insistio_mal" o "se_rindio". "push": solo cliente fantasma: "recupero", "intento" o "no_intento"; si no, "no_aplica". "recordo_contexto": true o false solo si el cliente volvió a escribir; si no, null. "comentario": máximo 2 frases.'
  ].filter(Boolean).join('\n');
}
export function summaryPrompt(d) {
  if (d.kind === 'practica') return practiceSummaryPrompt(d);
  const m = d.metrics;
  const convs = d.conversations.filter(c => c.msgs.some(x => x.f === 'v'));
  const sellerMsgs = convs.map(c => '[' + c.id + '] ' + c.msgs.filter(x => x.f === 'v').map(x => String(x.x).slice(0, 300).replace(/\n/g, ' ')).join(' | ')).join('\n').slice(0, 30000);
  const comments = convs.map(c => { const e = (d.evaluation && d.evaluation.convs || {})[c.id]; return e ? '[' + c.id + '] calidad ' + (e.calidad == null ? 'n/d' : e.calidad + '%') + '. ' + (e.comentario || '') : null; }).filter(Boolean).join('\n');
  const pastes = m.pastes.map((p, i) => i + ': [' + p.c + '] "' + p.x.slice(0, 240).replace(/\n/g, ' ') + '"').join('\n') || '(ninguno)';
  const sc = computeScore(Object.assign({}, d, { evaluation: Object.assign({}, d.evaluation, { summary: null }) }));
  const first = String(d.name || '').trim().split(/\s+/)[0] || '';
  return [
    '[EVALUADOR_RESUMEN]',
    'Eres un evaluador experto de sellers de Platzi por WhatsApp. Con los mensajes del postulante y las evaluaciones por conversación, entrega el resumen global, el análisis de ortografía y dos borradores de correo. Responde SOLO con JSON.',
    profileRule(d.profile), '',
    'ESTILO ESPERADO: tono cercano y profesional, tuteando al cliente; emojis con moderación; buena ortografía y puntuación; sin abreviaturas tipo "q", "xq", "tmb" o "k". Pegar precios, links o datos del producto es normal y no se penaliza.', '',
    'MENSAJES DEL POSTULANTE POR CONVERSACIÓN:', sellerMsgs || '(no envió mensajes)', '',
    'EVALUACIÓN DE CADA CONVERSACIÓN:', comments || '(sin evaluaciones)', '',
    'DATOS: calidad promedio ' + (sc.parts.calidad == null ? 'n/d' : sc.parts.calidad + '%') + '; errores críticos ' + sc.critical + '; nivel alcanzado ' + m.levelReached + ' de 4; ventas ' + m.sales + '; clientes dispuestos que llegaron ' + m.buyersSeen + '; clientes molestos por demora ' + m.annoyed + '; respuesta mediana ' + (m.medianRt == null ? 'n/d' : Math.round(m.medianRt) + ' s') + (d.extraGranted ? '; recibió tiempo extra por buena gestión' : '') + '.', '',
    'TEXTOS PEGADOS (índice: texto):', pastes, '',
    'DEVUELVE EXACTAMENTE ESTE JSON:',
    '{"recomendacion":"pasa","por_que":"","fortalezas":[""],"a_mejorar":[""],"entrenar":[""],"resumen":"","ortografia":0,"ortografia_errores":[{"texto":"","correccion":"","tipo":"grave"}],"mensajes_con_errores_pct":0,"estilo_ia":0,"evidencia_ia":[""],"pegados_clasificados":[{"idx":0,"tipo":"venta"}],"correo_aprobado":{"asunto":"","cuerpo":""},"correo_no_aprobado":{"asunto":"","cuerpo":""}}',
    'Reglas:',
    '- "recomendacion": "pasa" o "no_pasa". Recomienda "pasa" solo si la calidad es de 86% o más, sin errores críticos y sin señales serias de copia o IA; "no_pasa" si la calidad es menor a 71% o hay errores críticos; entre 71% y 85%, decide con tu criterio de experto. "por_que": 2 o 3 frases que justifiquen la recomendación.',
    '- "fortalezas" y "a_mejorar": 2 a 4 frases cada una, concretas, citando entre comillas mensajes reales del postulante como evidencia. "entrenar": las 2 o 3 dimensiones de la matriz que más debe reforzar, cada una con una frase de cómo. "resumen": 3 o 4 frases.',
    '- "ortografia": 0 a 100. "ortografia_errores": hasta 15 errores reales encontrados en los mensajes del postulante, cada uno con el texto tal como lo escribió, la corrección y el tipo: "grave" (palabra mal escrita), "tilde", "abreviatura" o "puntuacion". No marques como error los precios, links ni nombres propios. "mensajes_con_errores_pct": porcentaje de sus mensajes que tienen al menos un error.',
    '- "estilo_ia": probabilidad de 0 a 100 de que los mensajes fueron generados por IA o copiados de respuestas armadas (redacción demasiado pulida, listas, estructura repetida, frases genéricas). "pegados_clasificados": cada texto pegado como "dato_fijo" (precios, links, medios de pago, datos del producto) o "venta" (argumentación copiada).',
    '- Correos para el postulante: tono cercano, tuteando, en español, firmados por "Equipo de Direct Sales de Platzi". Empiezan con "Hola, ' + (first || '[nombre]') + ':". No mencionen puntajes, porcentajes, la matriz, Aura ni que la evaluación la hizo una IA. Usen un lenguaje que no asuma género si el nombre no lo deja claro.',
    '  "correo_aprobado": felicita, agradece su tiempo y dedicación, menciona 2 fortalezas reales y 1 aspecto para seguir creciendo, y dice que en los próximos días le enviaremos su contrato a este correo. Cierra dándole la bienvenida al equipo. Puede tener un emoji en el asunto.',
    '  "correo_no_aprobado": agradece su tiempo y empeño, dice con respeto que en esta ocasión no continuaremos con su proceso, menciona 2 fortalezas reales y 2 aspectos concretos para mejorar, y lo invita a estar atento a nuestras próximas vacantes para postularse nuevamente más adelante.',
    '  Cada "cuerpo" en texto plano con saltos de línea, de 110 a 170 palabras.'
  ].join('\n');
}

function practiceSummaryPrompt(d) {
  const m = d.metrics;
  const convs = d.conversations.filter(c => c.msgs.some(x => x.f === 'v'));
  const sellerMsgs = convs.map(c => '[' + c.id + '] ' + c.msgs.filter(x => x.f === 'v').map(x => String(x.x).slice(0, 300).replace(/\n/g, ' ')).join(' | ')).join('\n').slice(0, 30000);
  const comments = convs.map(c => { const e = (d.evaluation && d.evaluation.convs || {})[c.id]; return e ? '[' + c.id + '] calidad ' + (e.calidad == null ? 'n/d' : e.calidad + '%') + '. ' + (e.comentario || '') : null; }).filter(Boolean).join('\n');
  const pastes = m.pastes.map((p, i) => i + ': [' + p.c + '] "' + p.x.slice(0, 240).replace(/\n/g, ' ') + '"').join('\n') || '(ninguno)';
  return [
    '[EVALUADOR_RESUMEN]',
    'Eres un coach experto de sellers de Platzi por WhatsApp. Un asesor del equipo acaba de hacer una práctica en el simulador, en modo traspaso: cada cliente ya había hablado con el bot y llegó con una objeción. Dale feedback para que mejore. Responde SOLO con JSON.',
    profileRule(d.profile), '',
    'ESTILO ESPERADO: tono cercano y profesional, tuteando al cliente; emojis con moderación; buena ortografía; sin abreviaturas tipo "q", "xq", "tmb" o "k". Debe leer lo que el cliente ya le dijo al bot y no repetir preguntas.', '',
    'MENSAJES DEL ASESOR POR CONVERSACIÓN:', sellerMsgs || '(no envió mensajes)', '',
    'EVALUACIÓN DE CADA CONVERSACIÓN:', comments || '(sin evaluaciones)', '',
    'DATOS: ventas ' + m.sales + '; clientes dispuestos que llegaron ' + m.buyersSeen + '; clientes molestos por demora ' + m.annoyed + '; respuesta mediana ' + (m.medianRt == null ? 'n/d' : Math.round(m.medianRt) + ' s') + '.', '',
    'TEXTOS PEGADOS (índice: texto):', pastes, '',
    'DEVUELVE EXACTAMENTE ESTE JSON:',
    '{"fortalezas":[""],"a_mejorar":[""],"entrenar":[""],"resumen":"","ortografia":0,"ortografia_errores":[{"texto":"","correccion":"","tipo":"grave"}],"mensajes_con_errores_pct":0,"estilo_ia":0,"evidencia_ia":[""],"pegados_clasificados":[{"idx":0,"tipo":"venta"}]}',
    'Reglas: escribe todo hablándole al asesor de tú, en tono cercano y motivador, pero honesto. "fortalezas" y "a_mejorar": 2 a 4 frases concretas citando entre comillas sus mensajes reales. "entrenar": las 2 o 3 dimensiones de la matriz que más debe reforzar, cada una con un consejo práctico de qué decir o hacer distinto. "resumen": 3 o 4 frases. "ortografia": 0 a 100; "ortografia_errores": hasta 15 errores reales con su corrección y tipo ("grave", "tilde", "abreviatura" o "puntuacion"), sin marcar precios, links ni nombres propios. "mensajes_con_errores_pct": porcentaje de sus mensajes con al menos un error. "estilo_ia" y "pegados_clasificados" como señales de integridad.'
  ].join('\n');
}

/* ============ MÉTRICAS Y PUNTAJE ============ */
export function computeMetrics(d) {
  const TEN = (d.testSec || CONFIG.testSec) * 1000;
  const convs = d.conversations, rts = [], v = [];
  convs.forEach(c => { let fu = null; c.msgs.forEach((m, i) => {
    if (m.f === 's' || m.f === 'b') return;
    if (m.f === 'c') { if (fu == null) fu = m.t; }
    else { v.push(Object.assign({ c: c.id, i }, m)); if (fu != null) { if (m.t <= TEN) rts.push((m.t - fu) / 1000); fu = null; } }
  }); });
  const arrived = convs.filter(c => c.arrivedAt != null);
  const attended = arrived.filter(c => c.msgs.some(m => m.f === 'v' && m.t <= TEN));
  const buyersSeen = arrived.filter(c => !c.routing && c.buyerEver);
  const buyersClosed = buyersSeen.filter(c => c.status === 'compro');
  const buyersPartial = buyersSeen.filter(c => c.status === 'intencion' || c.status === 'link_enviado');
  const linkIssues = [];
  convs.forEach(c => parseLinks(c.msgs).forEach(l => { const iss = checkLink(l, c, d.prices, d.profile); if (iss.length) linkIssues.push({ c: c.id, link: describeLink(l), issues: iss }); }));
  const routingSeen = arrived.filter(c => c.routing);
  const routedOk = routingSeen.filter(c => c.status === 'enrutado' || (c.transfer && c.transfer === routeOf(c).dest));
  const wrongTransfers = arrived.filter(c => c.transfer && (!c.routing || c.transfer !== routeOf(c).dest));
  const ghosts = arrived.filter(c => c.ghost), thinkers = convs.filter(c => c.thinkAt != null), reacts = convs.filter(c => c.reactivated);
  const lens = v.map(m => String(m.x).length);
  const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9ñ ]/g, ' ').replace(/\s+/g, ' ').trim();
  const longs = v.filter(m => String(m.x).length >= 60).map(m => ({ c: m.c, x: String(m.x), w: new Set(norm(m.x).split(' ')) }));
  const recycled = [];
  for (let i = 0; i < longs.length && recycled.length < 20; i++) for (let j = i + 1; j < longs.length && recycled.length < 20; j++) {
    if (longs[i].c === longs[j].c) continue;
    const a = longs[i].w, b = longs[j].w; let inter = 0; a.forEach(w => { if (b.has(w)) inter++; });
    if (inter / (a.size + b.size - inter) >= 0.8) recycled.push({ a: longs[i].c, b: longs[j].c, x: longs[i].x.slice(0, 200) });
  }
  return {
    medianRt: median(rts), vCount: v.length, avgLen: lens.length ? Math.round(avg(lens)) : null,
    over250: lens.filter(l => l > 250 && l <= 400).length, over400: lens.filter(l => l > 400).length,
    lenScore: lens.length ? avg(lens.map(l => (l <= 250 ? 1 : l <= 400 ? 0.5 : 0))) * 100 : null,
    levelReached: d.levelReached || 1, arrived: arrived.length, attended: attended.length,
    annoyed: convs.filter(c => c.annoyed).length, annoyedRecovered: convs.filter(c => c.annoyed && c.msgs.some(m => m.f === 'v' && m.t > (c.annoyedAt || 0))).length,
    buyersSeen: buyersSeen.length, buyersClosed: buyersClosed.length, buyersPartial: buyersPartial.length, sales: convs.filter(c => c.status === 'compro').length,
    intencion: convs.filter(c => c.status === 'intencion').length, linkSinPago: convs.filter(c => c.status === 'link_enviado').length,
    linksSent: convs.reduce((n, c) => n + parseLinks(c.msgs).length, 0), linkIssues,
    salesInExtra: convs.filter(c => c.status === 'compro' && (c.endedAt || 0) > TEN).length,
    routingSeen: routingSeen.length, routedOk: routedOk.length, transfers: arrived.filter(c => c.transfer).length, wrongTransfers: wrongTransfers.length,
    ghosts: ghosts.length, ghostsPushed: ghosts.filter(c => (c.ghostPushes || 0) > 0).length, ghostsRecovered: ghosts.filter(c => c.ghostState === 'engaged').length,
    thinkers: thinkers.length, thinkersPushed: thinkers.filter(c => c.msgs.some(m => m.f === 'v' && m.t > c.thinkAt)).length, thinkersConverted: thinkers.filter(c => c.status === 'compro').length,
    reactivated: reacts.length, reactConverted: reacts.filter(c => c.status === 'compro').length,
    pastes: v.filter(m => m.p).map(m => ({ c: m.c, len: String(m.x).length, x: String(m.x).slice(0, 300) })),
    fast: v.filter(m => { const x = String(m.x).replace(/https?:\/\/\S+/g, ''); return !m.p && x.length >= 60 && ((m.ty > 0 && x.length / (m.ty / 1000) > 15) || (m.k || 0) < x.length * 0.5); }).map(m => ({ c: m.c, len: String(m.x).length, s: Math.round((m.ty || 0) / 1000), x: String(m.x).slice(0, 200) })),
    returnSend: v.filter(m => m.aw != null && m.aw < 15000 && String(m.x).length >= 80).map(m => ({ c: m.c, s: Math.round(m.aw / 1000), x: String(m.x).slice(0, 200) })),
    recycled, awayCount: (d.away || []).length, awayMs: (d.away || []).reduce((s, a) => s + (a.to - a.from), 0)
  };
}
export function convQuality(e) {
  if (!e || !e.dimensiones) return null;
  const ps = DIMS.map(([k]) => e.dimensiones[k] && e.dimensiones[k].p).filter(p => p === 0 || p === 1 || p === 2);
  if (!ps.length) return null;
  if (Array.isArray(e.errores_criticos) && e.errores_criticos.filter(Boolean).length) return 0;
  return Math.round(ps.reduce((s, p) => s + p, 0) / (2 * ps.length) * 100);
}
function speedScore(s) {
  const pts = [[0, 100], [15, 100], [30, 85], [45, 60], [60, 40], [90, 10], [100000, 5]];
  for (let i = 1; i < pts.length; i++) { if (s <= pts[i][0]) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; return y0 + (y1 - y0) * (s - x0) / (x1 - x0); } }
  return 5;
}
export function computeAlert(m, summary) {
  const cl = summary && Array.isArray(summary.pegados_clasificados) ? summary.pegados_clasificados : null;
  const fixed = x => /https?:\/\/|www\.|\.com|\$\s?\d|\d[\d.,]{2,}\s?(cop|mxn|usd|clp|pen|ars|eur)?|pse|paypal|cuotas/i.test(x);
  const venta = m.pastes.filter((p, idx) => !fixed(p.x) && (cl ? ((cl.find(x => x && x.idx === idx) || {}).tipo !== 'dato_fijo') : p.len >= 40));
  let pts = venta.length * 2 + m.fast.length * 2 + m.returnSend.length + m.recycled.length;
  const ia = summary && typeof summary.estilo_ia === 'number' ? summary.estilo_ia : null;
  if (ia != null) { if (ia >= 70) pts += 3; else if (ia >= 40) pts += 1; }
  return { level: pts >= 7 ? 'alto' : pts >= 3 ? 'medio' : 'bajo', pts, ventaPastes: venta.length, fijoPastes: m.pastes.length - venta.length };
}
export function computeScore(d) {
  const m = d.metrics, ev = d.evaluation || {}, convEv = ev.convs || {}, summary = ev.summary || null;
  const attended = d.conversations.filter(c => c.msgs.some(x => x.f === 'v'));
  const quals = attended.map(c => convQuality(convEv[c.id])).filter(x => x != null);
  const critical = attended.reduce((s, c) => s + ((convEv[c.id] && Array.isArray(convEv[c.id].errores_criticos)) ? convEv[c.id].errores_criticos.filter(Boolean).length : 0), 0);
  const P = {};
  P.calidad = quals.length ? avg(quals) : null;
  const den = m.buyersSeen + m.routingSeen;
  P.cierre = den ? (m.buyersClosed + 0.5 * (m.buyersPartial || 0) + m.routedOk) / den * 100 : null;
  P.velocidad = m.medianRt == null ? 0 : speedScore(m.medianRt);
  P.carga = m.arrived ? ((m.levelReached / 4) * 0.5 + (m.attended / m.arrived) * 0.3 + (1 - Math.min(1, m.annoyed / m.arrived)) * 0.2) * 100 : 0;
  P.ortografia = summary && typeof summary.ortografia === 'number' ? (m.lenScore == null ? summary.ortografia : summary.ortografia * 0.5 + m.lenScore * 0.5) : m.lenScore;
  let tw = 0, ts = 0;
  Object.keys(CONFIG.weights).forEach(k => { if (typeof P[k] === 'number' && isFinite(P[k])) { P[k] = Math.round(Math.max(0, Math.min(100, P[k]))); tw += CONFIG.weights[k]; ts += CONFIG.weights[k] * P[k]; } else P[k] = null; });
  const total = tw ? Math.round(ts / tw) : 0;
  const alert = computeAlert(m, summary);
  // Recomendación del sistema; la decisión final siempre la toma el reclutador.
  const q = P.calidad == null ? total : P.calidad;
  let recomendacion = null;
  if (summary && d.kind !== 'practica') {
    if (critical > 0 || q < CONFIG.thresholds.revisar) recomendacion = 'no_pasa';
    else if (q >= CONFIG.thresholds.aprobado && alert.level !== 'alto') recomendacion = 'pasa';
    else recomendacion = summary.recomendacion === 'pasa' && alert.level !== 'alto' ? 'pasa' : 'no_pasa';
  }
  return { total, parts: P, partial: tw < 100 || !summary, critical, estado: 'revisar', recomendacion, alert };
}
