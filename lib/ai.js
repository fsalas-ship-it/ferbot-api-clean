// Llamadas a la API de Anthropic desde el servidor. La clave nunca llega al navegador.
// Se usa el modo de respuesta estructurada (herramienta obligatoria): la API entrega
// siempre un objeto JSON válido, así que no hay errores de formato por comillas o texto extra.
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function callOnce(prompt, model, maxTokens, key) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model, max_tokens: maxTokens,
      tools: [{ name: 'responder', description: 'Entrega la respuesta con exactamente la estructura JSON pedida en las instrucciones.', input_schema: { type: 'object', additionalProperties: true } }],
      tool_choice: { type: 'tool', name: 'responder' },
      messages: [{ role: 'user', content: prompt }]
    })
  });
  if (!r.ok) {
    const detail = (await r.text().catch(() => '')).slice(0, 400);
    const e = new Error('AI_ERROR ' + r.status + ' ' + detail);
    e.code = r.status === 429 ? 'rate_limited' : r.status === 529 || r.status >= 500 ? 'overloaded' : 'ai_error';
    throw e;
  }
  const j = await r.json();
  if (j.stop_reason === 'max_tokens') { const e = new Error('TRUNCATED'); e.code = 'truncated'; throw e; }
  const tool = (j.content || []).find(b => b.type === 'tool_use');
  if (tool && tool.input && typeof tool.input === 'object') return tool.input;
  const text = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  return parseJSON(text);
}

export async function askJSON(prompt, { model, maxTokens = 800, retries = 1 } = {}) {
  if (process.env.MOCK_AI === '1') return mockAI(prompt);
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) { const e = new Error('NO_API_KEY'); e.code = 'NO_API_KEY'; throw e; }
  let tokens = maxTokens, lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try { return await callOnce(prompt, model, tokens, key); }
    catch (e) {
      lastErr = e;
      if (e.code === 'truncated') tokens = Math.round(tokens * 1.6);       // reintenta con más espacio
      else if (e.code === 'rate_limited' || e.code === 'overloaded') await sleep(2500);
      else if (e.code !== 'bad_json') throw e;
    }
  }
  throw lastErr;
}

export function parseJSON(text) {
  const clean = String(text).replace(/```json|```/g, '').trim();
  try { return JSON.parse(clean); } catch (e) {}
  const a = clean.indexOf('{'), b = clean.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(clean.slice(a, b + 1)); } catch (e) {} }
  const err = new Error('BAD_JSON'); err.code = 'bad_json'; throw err;
}

// Respuestas simuladas para probar el sitio sin gastar saldo (MOCK_AI=1).
function mockAI(p) {
  if (p.startsWith('Eres FerBot 2.0')) {
    const hasLink = /ASESOR[^\n]*https?:\/\//.test(p);
    return { etapa: hasLink ? 'cierre' : 'negociacion', objecion: /cuotas/i.test(p) ? 'cuotas' : 'precio', transferir: null,
      estrategia: { nombre: hasLink ? 'Reenviar el link con una instrucción clara' : 'Enviar el link directo', por_que: 'Quien pregunta por cuotas ya está decidido: el link directo vende 35%.' },
      respuesta: ['¡Claro que sí! 🙌 Puedes pagarlo en 4 cuotas sin intereses con tu tarjeta.', 'Te dejo tu link para que lo hagas en un minuto: [LINK DE PAGO]'],
      siguiente_paso: 'Si no paga en 45 minutos, reenvía el link con una instrucción concreta.',
      checklist: { plan: true, cuenta: false, precio: true, moneda: true, forma_pago: false, renovacion: false, activacion: false }, link_enviado: hasLink, resumen_cliente: 'Quiere aprender inglés para su trabajo y pregunta por cuotas.' };
  }
  if (p.startsWith('Corrige la ortografía')) {
    const m = p.split('MENSAJE:\n')[1] || '';
    return { corregido: m.replace(/\bq\b/g, 'que').replace(/descuento/gi, 'precio especial').replace(/^hola/i, 'Hola'), cambios: ['q → que'] };
  }
  if (p.includes('[EVALUADOR_CONVERSACION]')) {
    const d = k => ({ p: 2, nota: 'Ejemplo de prueba' });
    return { dimensiones: { contexto: d(), canal: d(), descubrimiento: d(), recomendacion: { p: 1, nota: 'Ejemplo' }, objecion: d(), verdad: d(), cierre: d(), seguimiento: { p: null, nota: 'No aplica' } },
      errores_criticos: [], objeciones_detalle: [{ objecion: 'Precio', rebatida: 'si', nota: 'Ejemplo' }], moneda_correcta: true,
      descuento: 'no_uso', upsell: 'no_aplica', enrutamiento: 'no_aplica', lo_pienso: 'no_aplica', push: 'no_aplica', recordo_contexto: null, comentario: 'Evaluación de prueba.' };
  }
  if (p.includes('[EVALUADOR_RESUMEN]')) {
    return { recomendacion: 'pasa', por_que: 'Ejemplo de justificación.', fortalezas: ['Respondió rápido: "hola, que buscas?"'], a_mejorar: ['Ejemplo de aspecto a mejorar'], entrenar: ['Descubrimiento: preguntar la meta antes del precio'], resumen: 'Resumen de prueba.',
      ortografia: 85, ortografia_errores: [{ texto: 'que buscas', correccion: '¿qué buscas?', tipo: 'tilde' }], mensajes_con_errores_pct: 40, estilo_ia: 10, evidencia_ia: [], pegados_clasificados: [],
      correo_aprobado: { asunto: '¡Aprobaste la prueba de ventas de Platzi! 🎉', cuerpo: 'Hola, prueba:\n\nTexto de ejemplo.\n\nEquipo de Direct Sales de Platzi' },
      correo_no_aprobado: { asunto: 'Resultado de tu prueba de ventas en Platzi', cuerpo: 'Hola, prueba:\n\nTexto de ejemplo.\n\nEquipo de Direct Sales de Platzi' } };
  }
  if (p.includes('[REVISION_TIEMPO_EXTRA]')) {
    const ids = [...p.matchAll(/### (c\d+)/g)].map(m => m[1]);
    return { elegibles: ids.slice(0, 1).map(id => ({ id, motivo: 'Prueba' })) };
  }
  const n = (p.split('\nCONVERSACIÓN HASTA AHORA')[1] || '').split('VENDEDOR:').length - 1;
  if (p.includes('Ya pagaste tu plan y estás contento')) return { mensajes: ['genial, muchas gracias 🙌'], estado: 'abierto', plan: null };
  if (!p.includes('Hoy NO vas a comprar') && !p.includes('TU COMPRA') && /VENDEDOR:.*\/pago(\.html\?p=|\/)/.test(p)) return { mensajes: ['listo, ya pagué'], estado: 'pago', plan: 'expert' };
  if (p.includes('TU COMPRA: Ya decidiste comprar y el vendedor te envió un link')) {
    if (p.includes('Al intentar pagar te pasa esto')) return { mensajes: ['uy, me salió un error al pagar'], estado: 'abierto', plan: null };
    if (p.includes('Ese link tiene un problema')) return { mensajes: ['ese link no es en mi moneda'], estado: 'abierto', plan: null };
    return { mensajes: ['listo, ya pagué 🙌'], estado: 'pago', plan: null };
  }
  if (p.includes('TU COMPRA: Ya decidiste comprar.')) return { mensajes: ['me mandas el link?'], estado: 'abierto', plan: null };
  if (p.includes('TU SITUACIÓN') && /Soporte|SMB/.test(p) && n >= 1) return { mensajes: ['ah listo, gracias'], estado: 'abierto', plan: null };
  if (!p.includes('Hoy NO vas a comprar') && n >= 3) return { mensajes: ['listo, mándame el link'], estado: 'compro', plan: 'expert' };
  if (n >= 3) return { mensajes: ['mmm lo voy a pensar'], estado: 'lo_pensare', plan: null };
  return { mensajes: ['ok y cuánto vale?'], estado: 'abierto', plan: null };
}
