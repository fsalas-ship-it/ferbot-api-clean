// FerBot 2.0: lógica del asistente de ventas para asesores reales (ActiveCampaign).
import { PRICES, CUR_LABEL, COUNTRIES } from './data.js';

// Prefijo telefónico -> país y moneda (se busca el prefijo más largo primero)
const DIAL = [
  ['1809', 'República Dominicana'], ['1829', 'República Dominicana'], ['1849', 'República Dominicana'],
  ['598', 'Uruguay'], ['595', 'Paraguay'], ['593', 'Ecuador'], ['591', 'Bolivia'], ['507', 'Panamá'], ['506', 'Costa Rica'],
  ['503', 'El Salvador'], ['502', 'Guatemala'], ['57', 'Colombia'], ['56', 'Chile'], ['54', 'Argentina'], ['52', 'México'],
  ['51', 'Perú'], ['34', 'España'], ['1', 'Estados Unidos']
];
export function countryFromPhone(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  for (const [code, name] of DIAL) if (d.startsWith(code)) return COUNTRIES.find(c => c.name === name) || null;
  return null;
}

// Señales de intención de compra en lo que escribe el cliente.
// Tasa = % de conversaciones con venta cuando aparece la señal (Solen, jul–sep 2026, base 5,2%).
export const BASE_RATE = 5.2;
const SIGNALS = [
  { key: 'pide_link', label: 'Pide el link o dice que quiere pagar', rate: 36.5, re: /(m[aá]nd|env[ií]|p[aá]s)a?(me)?\s+(el\s+)?link|link\s+(de\s+)?pago|quiero\s+(pagar|comprar|inscribirme)|c[oó]mo\s+(pago|compro|me\s+inscribo)|d[oó]nde\s+pago|ya\s+(quiero|voy\s+a\s+pagar)/i },
  { key: 'medios_pago', label: 'Pregunta por medios de pago', rate: 31.6, re: /medios?\s+de\s+pago|tarjeta|pse|transferencia|efectivo|paypal|nequi|daviplata|oxxo|d[eé]bito|cr[eé]dito|consignaci[oó]n/i },
  { key: 'cuotas', label: 'Pregunta por cuotas', rate: 25.5, re: /cuotas?|financ|a\s+meses|meses\s+sin\s+intereses|pagar\s+por\s+partes|mensual(es|idad)?/i },
  { key: 'descuento', label: 'Pregunta por descuento o promoción', rate: 18.8, re: /descuento|promo|oferta|precio\s+especial|rebaja|cup[oó]n/i },
  { key: 'compartido', label: 'Pregunta por planes compartidos', rate: 15.6, re: /\bduo\b|d[uú]o|familia|pareja|herman[oa]|para\s+(dos|2)|grupo|equipo/i },
  { key: 'precio', label: 'Pregunta el precio', rate: 13.0, re: /precio|cu[aá]nto\s+(cuesta|vale|sale|es)|valor|costo/i },
  { key: 'certificado', label: 'Pregunta por el certificado (suele ser soporte o becas)', rate: 4.6, re: /certificad|diploma|t[ií]tulo/i }
];
export function detectSignals(msgs) {
  const client = msgs.filter(m => m.from === 'cliente').slice(-12).map(m => m.text).join('\n');
  const found = SIGNALS.filter(s => s.re.test(client)).map(s => ({ key: s.key, label: s.label, rate: s.rate }));
  const top = found.reduce((m, s) => Math.max(m, s.rate), 0);
  const nClient = msgs.filter(m => m.from === 'cliente').length;
  let score = found.length ? top : BASE_RATE;
  if (nClient >= 6) score = Math.max(score, 12); // conversación activa (en las ventas el cliente escribe ~9 mensajes)
  const level = score >= 25 ? 'caliente' : score >= 12 ? 'tibio' : 'frio';
  return { level, score: Math.round(score * 10) / 10, signals: found, clientMessages: nClient };
}

// Manual de estrategias (fase 1b de Solen)
export const PLAYBOOK = `MANUAL DE ESTRATEGIAS (datos reales de Platzi, julio a septiembre de 2026; son correlaciones, úsalas como dirección):
- Precio, en plena conversación: lo que más vende es PREGUNTAR QUÉ QUIERE LOGRAR el cliente (12,9%), luego urgencia real (12,6%) o el link (10,9%). Lo que menos vende: listar beneficios (4,6%) o solo empatizar (3,4%). Explicar cuotas ante el precio vende poco (7,3%).
- Precio como primera pregunta del cliente: ninguna estrategia supera la base. Da el precio en su moneda y sondea su meta en el mismo mensaje.
- Cuotas: ENVIAR EL LINK DIRECTO vende 35% contra 13,2% de explicar cómo funcionan. Quien pregunta por cuotas ya está decidido: facilítale la compra.
- Medios de pago: OFRECER OTRO MEDIO DE PAGO (34,9%) o RESOLVER EL PROBLEMA TÉCNICO (32%). No expliques cuotas (9,8%) ni hables de garantía o renovación (2,3%).
- Desconfianza, certificado o garantía: convierten poco y suelen ser casos de Soporte (reembolsos, envíos, becas). Si ya es cliente, transfiere a Soporte.
- Después de enviar el link: hacer seguimiento EN MENOS DE 1 HORA (14,9% de venta contra 5,9% sin seguimiento). Lo que más funciona es concreto: resolver el problema del pago (52,6%) o REENVIAR EL LINK CON UNA INSTRUCCIÓN CLARA (33,8%). Un "¿pudiste?" genérico casi no vende (7,8%).
- La urgencia o el link solos, sin resolver la duda, no venden: ante el precio, "precio más bajo por unas horas + 12 MSI" (17 conversaciones) y "link con 15%" (22) no generaron ninguna venta.
- El cliente que escribe mucho está más cerca de comprar: en las ventas el cliente escribe ~9 mensajes contra 2.`;

export const RULES = `REGLAS DE PLATZI
- Planes anuales: Expert (1 persona), Duo (2) y Groups (hasta 5 personas en ventas). Quien ya es cliente de Platzi (cuenta, renovación, certificados) se transfiere a Soporte; empresas o grupos de más de 5 personas, a SMB. Antes de transferir, se le explica al cliente qué sigue.
- Precio especial máximo: 15%. Se dice "precio especial", nunca "descuento". Urgencia solo si es real.
- Formas de pago: contado con tarjeta, 4 cuotas sin intereses (solo con tarjeta de crédito o débito), en México 12 meses sin intereses; transferencia o PSE (Colombia), efectivo, PayPal, Google Pay y Apple Pay.
- Producto: más de 1.900 cursos en 18 escuelas, English Academy, certificados digitales verificables (no son títulos universitarios oficiales), app Android e iOS con descarga de clases en planes anuales, las primeras 3 clases de cualquier curso son gratis.
- Nunca: prometer empleo, salario o resultados; inventar descuentos, becas o extensiones; dar un precio o moneda incorrectos; sugerir compartir una cuenta individual.
- Estilo WhatsApp de Platzi: tono cercano tuteando, mensajes cortos (idealmente de 1 a 3 líneas, partidos en varios mensajes), una pregunta por mensaje, emojis con moderación, buena ortografía, sin abreviaturas.
- Matriz de calidad de Aura (0 a 2 cada una): Contexto (usar lo que el cliente ya dijo, también al bot), Canal, Descubrimiento (meta, motivo, punto de partida, quién estudia), Recomendación (una ruta y un plan atados a la meta), Objeción (validar, aislar, responder con un hecho, confirmar), Verdad, Cierre (pedir la decisión y confirmar plan, cuenta, precio, moneda, forma de pago, renovación y activación), Seguimiento (con un motivo concreto, máximo 3).`;

export function priceBlock(cur, prices) {
  const P = (prices || PRICES)[cur]; if (!P) return 'Moneda desconocida: pide al asesor confirmar el país del cliente.';
  const f = n => (cur === 'EUR' ? '€' : '$') + Number(n).toLocaleString('es-CO') + ' ' + (cur === 'USA' ? 'USD' : cur);
  return `Precios en ${CUR_LABEL[cur] || cur} (lista / precio especial máximo): Expert ${f(P.list[0])} / ${f(P.disc[0])}; Duo ${f(P.list[1])} / ${f(P.disc[1])}; Groups ${f(P.list[2])} / ${f(P.disc[2])}. 4 cuotas del Expert con precio especial: ${f(Math.round(P.disc[0] / 4))}.`;
}

export function transcript(msgs) {
  return msgs.slice(-40).map(m => (m.from === 'cliente' ? 'CLIENTE' : m.from === 'bot' ? 'BOT' : 'ASESOR') + (m.time ? ' [' + m.time + ']' : '') + ': ' + String(m.text).slice(0, 600)).join('\n');
}

export function analyzePrompt({ msgs, country, prices, sig, windowOpen, advisorName }) {
  const cur = country ? country.cur : null;
  return [
    'Eres FerBot 2.0, el copiloto de ventas de los asesores de Platzi por WhatsApp. Analizas la conversación abierta y le sugieres al asesor qué responder. El asesor decide y envía. Responde SOLO con la estructura JSON pedida.',
    '', RULES, '', PLAYBOOK, '',
    'DATOS DEL CLIENTE',
    country ? `País: ${country.name}. Moneda: ${CUR_LABEL[cur] || cur}. Medios de pago disponibles: ${country.pay}.` : 'País desconocido: no des precios hasta confirmar el país.',
    cur ? priceBlock(cur, prices) : '',
    `Señales de intención detectadas: ${sig.signals.length ? sig.signals.map(s => s.label + ' (' + s.rate + '% de venta)').join('; ') : 'ninguna'}. Nivel: ${sig.level}.`,
    windowOpen === false ? 'ATENCIÓN: la ventana de 24 horas de WhatsApp está cerrada; el asesor solo puede escribir con una plantilla aprobada.' : '',
    advisorName ? `El asesor se llama ${advisorName}.` : '',
    '',
    'CONVERSACIÓN (CLIENTE = el estudiante; BOT = el bot de Platzi; ASESOR = el humano):',
    transcript(msgs),
    '',
    'DEVUELVE ESTE JSON:',
    '{"etapa":"apertura|negociacion|cierre|postventa","objecion":"precio|cuotas|medios_pago|certificado|desconfianza|lo_pienso|tiempo|disciplina|sin_pc|problema_pago|ninguna","transferir":null,"estrategia":{"nombre":"","por_que":""},"respuesta":["mensaje 1","mensaje 2"],"siguiente_paso":"","checklist":{"plan":false,"cuenta":false,"precio":false,"moneda":false,"forma_pago":false,"renovacion":false,"activacion":false},"link_enviado":false,"resumen_cliente":""}',
    'Reglas: "transferir" es null, "soporte" o "smb". "estrategia": la del manual que más vende para esta objeción y etapa, con una frase de por qué basada en los datos. "respuesta": 1 a 3 mensajes cortos listos para enviar, en el estilo de Platzi, retomando lo que el cliente ya dijo (incluido lo que habló con el bot) y sin repetir preguntas ya respondidas. Si hay que enviar un link de pago o de una ruta, escribe exactamente [LINK DE PAGO] o [LINK DE LA RUTA] en su lugar; nunca inventes URLs. Usa precios solo de la tabla y en la moneda del cliente. "siguiente_paso": qué debe hacer el asesor después, en una frase. "checklist": marca true solo lo que ya quedó confirmado con el cliente en la conversación. "link_enviado": true si el asesor ya envió un link de pago. "resumen_cliente": máximo 2 frases con meta, objeción y situación del cliente.'
  ].filter(Boolean).join('\n');
}

// Revisión antes de enviar: reglas fijas + corrección de ortografía con IA
const ABBR = /\b(q|xq|pq|tmb|tb|k|xfa|dnd|bn|msj)\b/i;
const PROMISES = /(garantiz|asegur)(o|amos|ado)\s+(el\s+|un\s+)?(empleo|trabajo|salario|resultado)|consigues\s+trabajo|trabajo\s+seguro/i;
const FAKE_URGENCY = /solo\s+por\s+hoy|[uú]ltimas?\s+horas?|termina\s+hoy|solo\s+(por\s+)?(esta|una)\s+hora/i;
export function ruleCheck(draft, country, prices) {
  const t = String(draft || ''), issues = [];
  if (/descuento/i.test(t)) issues.push({ tipo: 'canal', texto: 'Dice "descuento". En Platzi se dice "precio especial".' });
  if (ABBR.test(t)) issues.push({ tipo: 'canal', texto: 'Tiene abreviaturas (como "q", "xq" o "tmb"). Escríbelas completas.' });
  if (t.length > 300) issues.push({ tipo: 'canal', texto: 'El mensaje es largo (' + t.length + ' caracteres). Pártelo en 2 o 3 mensajes cortos.' });
  if ((t.match(/\?/g) || []).length > 1) issues.push({ tipo: 'canal', texto: 'Tiene más de una pregunta. Deja una sola por mensaje.' });
  if (PROMISES.test(t)) issues.push({ tipo: 'critico', texto: 'Promete empleo, salario o resultados. Es un error crítico.' });
  if (FAKE_URGENCY.test(t)) issues.push({ tipo: 'verdad', texto: 'Usa urgencia. Úsala solo si el precio especial realmente termina.' });
  if (country) {
    const P = (prices || PRICES)[country.cur];
    if (P) {
      const allowed = [...P.list, ...P.disc, ...P.list.map(x => x / 4), ...P.disc.map(x => x / 4), ...(country.cur === 'MXN' ? [...P.list, ...P.disc].map(x => x / 12) : [])];
      const nums = [...t.matchAll(/(\d{1,3}(?:[.,]\d{3})+|\d{3,7})(?:[.,]\d{1,2})?/g)].map(m => Number(m[1].replace(/[.,]/g, ''))).filter(n => n >= Math.min(...allowed) * 0.5);
      nums.forEach(n => { if (!allowed.some(v => Math.abs(v - n) / v < 0.03)) issues.push({ tipo: 'verdad', texto: 'El valor ' + n.toLocaleString('es-CO') + ' no coincide con la tabla de ' + (country.cur === 'USA' ? 'USD' : country.cur) + ' (lista, precio especial o cuotas). Revísalo.' }); });
    }
    const map = { 'DÓLARES': 'USD', 'DOLARES': 'USD', 'SOLES': 'PEN', 'EUROS': 'EUR' };
    const curOk = country.cur === 'USA' ? 'USD' : country.cur;
    (t.match(/\b(USD|COP|MXN|PEN|CLP|ARS|EUR|UYU|GTQ|BOB|PYG|DOP|CRC|d[oó]lares|soles|euros)\b/gi) || []).forEach(m => { const c = map[m.toUpperCase()] || m.toUpperCase(); if (c !== curOk) issues.push({ tipo: 'verdad', texto: 'Menciona ' + m + ', pero el cliente es de ' + country.name + ' (' + curOk + ').' }); });
  }
  return issues;
}
export function spellPrompt(draft) {
  return [
    'Corrige la ortografía, tildes y puntuación de este mensaje de WhatsApp de un asesor de ventas. Mantén el mismo tono cercano, las mismas palabras y los emojis; no lo reescribas ni lo alargues. Escribe completas las abreviaturas (q → que, xq → porque, tmb → también). Cambia "descuento" por "precio especial". Responde SOLO con JSON: {"corregido":"","cambios":["palabra original → corregida"]}',
    '', 'MENSAJE:', String(draft).slice(0, 1500)
  ].join('\n');
}
