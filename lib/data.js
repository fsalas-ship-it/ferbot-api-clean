// Datos de negocio: precios, países, perfiles de clientes y objeciones.
// [Expert, Duo, Groups] precio de lista y precio final con el descuento máximo del 15%.
export const PRICES = {
  MXN: { list: [4990, 6593, 10004], disc: [4299, 5680, 8619] },
  COP: { list: [999000, 1499000, 2002795], disc: [849999, 1274150, 1704078] },
  CLP: { list: [219900, 290532, 440856], disc: [186999, 247063, 374896] },
  PEN: { list: [890, 1176, 1784], disc: [799, 1056, 1602] },
  UYU: { list: [11990, 15841, 24038], disc: [10099, 13999, 20246] },
  GTQ: { list: [1690, 2233, 3388], disc: [1499, 1980, 3005] },
  BOB: { list: [1790, 2365, 3589], disc: [1499, 1980, 3005] },
  PYG: { list: [1990000, 2629188, 3989552], disc: [1699000, 2244719, 3406155] },
  DOP: { list: [14990, 19805, 30052], disc: [12999, 17174, 26060] },
  CRC: { list: [159900, 211260, 320568], disc: [135999, 179682, 272651] },
  ARS: { list: [359900, 475500, 721528], disc: [299999, 396359, 601438] },
  USD: { list: [249, 329, 499], disc: [209, 276, 419] },
  EUR: { list: [299, 395, 599], disc: [249, 349, 499] },
  USA: { list: [349, 461, 700], disc: [309, 408, 619] }
};
export const CUR_LABEL = { USA: 'USD (Estados Unidos)' };
const STD = 'tarjeta, PayPal, efectivo, Google Pay, Apple Pay';
export const COUNTRIES = [
  { name: 'México', cur: 'MXN', flag: '🇲🇽', pay: 'tarjeta, PayPal, efectivo en OXXO, Google Pay, Apple Pay; 12 meses sin intereses con tarjeta de crédito mexicana o PayPal' },
  { name: 'Colombia', cur: 'COP', flag: '🇨🇴', pay: 'tarjeta, PSE, PayPal, efectivo, Google Pay, Apple Pay' },
  { name: 'Chile', cur: 'CLP', flag: '🇨🇱', pay: STD },
  { name: 'Perú', cur: 'PEN', flag: '🇵🇪', pay: STD },
  { name: 'Uruguay', cur: 'UYU', flag: '🇺🇾', pay: STD },
  { name: 'Guatemala', cur: 'GTQ', flag: '🇬🇹', pay: STD },
  { name: 'Bolivia', cur: 'BOB', flag: '🇧🇴', pay: STD },
  { name: 'Paraguay', cur: 'PYG', flag: '🇵🇾', pay: STD },
  { name: 'República Dominicana', cur: 'DOP', flag: '🇩🇴', pay: STD },
  { name: 'Costa Rica', cur: 'CRC', flag: '🇨🇷', pay: STD },
  { name: 'Argentina', cur: 'ARS', flag: '🇦🇷', pay: STD },
  { name: 'Ecuador', cur: 'USD', flag: '🇪🇨', pay: STD },
  { name: 'Panamá', cur: 'USD', flag: '🇵🇦', pay: STD },
  { name: 'El Salvador', cur: 'USD', flag: '🇸🇻', pay: STD },
  { name: 'España', cur: 'EUR', flag: '🇪🇸', pay: 'tarjeta, PayPal, Google Pay, Apple Pay' },
  { name: 'Estados Unidos', cur: 'USA', flag: '🇺🇸', pay: 'tarjeta, PayPal, Google Pay, Apple Pay' }
];
export const NAMES = {
  f: ['Valentina', 'Camila', 'Daniela', 'Mariana', 'Laura', 'Sofía', 'Andrea', 'Paola', 'Lucía', 'Carolina', 'Natalia', 'Gabriela', 'Juliana', 'Fernanda', 'Ximena', 'Diana'],
  m: ['Santiago', 'Andrés', 'Juan David', 'Carlos', 'Mateo', 'Sebastián', 'Felipe', 'Diego', 'Luis', 'Jorge', 'Alejandro', 'Kevin', 'Miguel', 'Ricardo', 'Esteban', 'Óscar']
};
export const LAST = ['Gómez', 'Rodríguez', 'Martínez', 'López', 'Hernández', 'Pérez', 'Ramírez', 'Torres', 'Castro', 'Rojas', 'Vargas', 'Morales', 'Ortiz', 'Suárez', 'Mendoza', 'Ríos'];
export const OCCUPATIONS = ['estudiante universitario', 'empleado de oficina', 'trabajador independiente', 'emprendedor con un negocio pequeño', 'recién graduado buscando empleo', 'asesor en un call center', 'vendedor en una tienda', 'madre o padre de familia que trabaja'];
export const GOALS = [
  { k: 'inglés', d: 'aprender inglés para conseguir un mejor trabajo' },
  { k: 'programación', d: 'aprender programación para cambiar de carrera' },
  { k: 'marketing digital', d: 'aprender marketing digital para vender más en su negocio' },
  { k: 'Excel y análisis de datos', d: 'aprender Excel y análisis de datos para lograr un ascenso' },
  { k: 'inteligencia artificial', d: 'aprender a usar inteligencia artificial en su trabajo' },
  { k: 'diseño gráfico', d: 'aprender diseño gráfico para trabajar como freelance' },
  { k: 'finanzas personales', d: 'aprender finanzas personales para organizar su dinero' }
];
export const OBJ = {
  precio: 'Siente que es caro para su presupuesto y lo compara con cursos gratis de YouTube.',
  tiempo: 'Trabaja o estudia mucho y cree que no tendrá tiempo para estudiar.',
  sin_pc: 'No tiene computador, solo un celular Android sencillo.',
  disciplina: 'Ya intentó cursos en línea y los abandonó; duda de su propia constancia.',
  medios_pago: 'No tiene tarjeta de crédito ni de débito; solo puede pagar en efectivo o con transferencia (PSE en Colombia).',
  mas_barato: 'Pregunta si hay descuento o promoción, o dice que lo vio más barato en un anuncio y pide ese precio.',
  cuotas: 'Le queda pesado pagar todo de una vez; pregunta en cuántas cuotas se puede, cuánto queda por mes y si hay más plazo.',
  certificado: 'Duda de la validez del certificado: pregunta si es oficial y si le sirve para su trabajo o sus estudios.',
  lo_pienso: 'Dice que lo va a pensar o que mejor después, sin dar una razón clara al principio.',
  desconfianza: 'Desconfía: pregunta si los certificados sirven de algo y si Platzi es confiable.'
};
export const OBJ_LABEL = { precio: 'Precio', tiempo: 'Tiempo', sin_pc: 'Sin computador', disciplina: 'Disciplina', medios_pago: 'Medios de pago', mas_barato: 'Descuento o promo', desconfianza: 'Desconfianza', cuotas: 'Cuotas o financiación', certificado: 'Certificado o validez', lo_pienso: 'Lo voy a pensar' };
// Frecuencia real de cada objeción en las conversaciones con asesor (julio a septiembre de 2026, análisis de Solen)
export const OBJ_WEIGHTS = { precio: 30, cuotas: 17, medios_pago: 15, certificado: 12, desconfianza: 8, lo_pienso: 7, mas_barato: 6, disciplina: 2, tiempo: 2, sin_pc: 1 };
export const TEMPS = {
  amable: 'amable y conversador, con buena disposición',
  normal: 'normal, ni muy frío ni muy efusivo',
  exigente: 'exigente: hace preguntas específicas y quiere respuestas concretas',
  cortante: 'cortante: responde con muy pocas palabras y no le gusta leer mensajes largos',
  indeciso: 'indeciso: duda, cambia de tema y pide tiempo para pensar',
  desconfiado: 'desconfiado: sospecha y quiere pruebas antes de creer',
  apurado: 'apurado: tiene poco tiempo y quiere la información ya'
};
export const UPSELL = {
  duo: 'Tu hermana también quiere estudiar. Menciónalo solo si el vendedor pregunta para quién es o si habla de planes para más personas. Si te ofrecen el plan Duo, te interesa más que el individual.',
  groups: 'Tienes un negocio pequeño con 3 empleados que también podrían estudiar. Menciónalo solo si el vendedor pregunta o si viene al caso. Si te ofrecen el plan Groups, te interesa.'
};
// Casos que el asesor NO vende y debe transferir con el botón Transferir.
// Regla: Expert, Duo y Groups de hasta 5 personas los venden internos y externos.
// Se transfiere: a Soporte, quien ya es cliente; a SMB, empresas o grupos de más de 5 personas.
export const ROUTING = {
  soporte: { dest: 'soporte', label: 'Ya es cliente con un problema de cuenta (debe pasar a Soporte)',
    opener: 'hola, ya soy estudiante de platzi y no puedo entrar a mi cuenta, me ayudas?',
    prompt: 'Ya eres estudiante de Platzi con una suscripción activa y no puedes entrar a tu cuenta. No buscas comprar nada. Si el vendedor te explica que te va a pasar con el equipo de Soporte y te deja claro qué sigue, acepta y agradece. Si intenta venderte un plan, te molesta y le recuerdas que ya eres cliente.' },
  renovacion: { dest: 'soporte', label: 'Cliente actual que quiere renovar (debe pasar a Soporte)',
    opener: 'hola, ya soy estudiante de platzi y se me vence la suscripción, cómo la renuevo?',
    prompt: 'Ya eres estudiante de Platzi y quieres renovar tu suscripción, que vence pronto. No buscas un plan nuevo. Si el vendedor te explica que las renovaciones las atiende el equipo de Soporte y te deja claro el siguiente paso, acepta y agradece. Si intenta venderte un plan nuevo, dudas y preguntas por qué.' },
  smb: { dest: 'smb', label: 'Empresa con más de 5 personas (debe pasar a SMB)',
    opener: 'hola, quiero platzi para mi empresa, somos como 20 personas, cómo funciona?',
    prompt: 'Tienes una empresa y quieres Platzi para unas 20 personas de tu equipo. Si el vendedor te explica que esto lo atiende el equipo de empresas (SMB) y te deja claro el siguiente paso, acepta y agradece. Si intenta venderte planes individuales o un plan Groups para todos, dudas y preguntas si no hay algo para empresas.' }
};
export const TRANSFER_DEST = { soporte: 'Soporte', smb: 'SMB (empresas)' };
export const AV_COLORS = ['#3F7CAC', '#8E5BA8', '#C0663A', '#2F8F6B', '#B0476B', '#5C6BC0', '#A07A1F', '#3A8FA3', '#7A5C3E', '#4F7F2A', '#2E7D8F', '#9C4F96'];
export const PROFILES = { externos: 'Externos', internos: 'Internos' };
export const DIMS = [
  ['contexto', 'Contexto'], ['canal', 'Canal'], ['descubrimiento', 'Descubrimiento'], ['recomendacion', 'Recomendación'],
  ['objecion', 'Objeción'], ['verdad', 'Verdad'], ['cierre', 'Cierre'], ['seguimiento', 'Seguimiento']
];
export const STATUS_LABEL = { pendiente: 'No llegó', abierta: 'Abierta', pensando: 'Lo va a pensar', compro: 'Compró', no_compro: 'No compró', enrutado: 'Enrutado', sin_cerrar: 'Sin cerrar', lo_pensare: 'Lo va a pensar', sin_respuesta: 'Fantasma sin recuperar', cerrada_tiempo: 'Cerrada al acabar el tiempo', transferido: 'Transferido', comprando: 'Comprando', intencion: 'Dijo que compraba (sin link)', link_enviado: 'Link enviado sin pago' };

// Inconvenientes de pago que pueden aparecer cuando el cliente ya decidió comprar
export const PAY_ISSUES = {
  tarjeta_rechazada: 'Al intentar pagar, tu tarjeta fue rechazada. Cuéntaselo al vendedor y espera que te dé una alternativa (otra tarjeta, PSE, efectivo o PayPal).',
  link_no_abre: 'El link de pago no te abre o te sale un error. Cuéntaselo al vendedor y espera que te ayude (reenviarlo, otro navegador u otra forma de pago).',
  duda_renovacion: 'Antes de pagar te entra la duda: preguntas si el plan se renueva automáticamente y si lo puedes cancelar. Solo pagas cuando te lo aclare.',
  otro_medio: 'Al ver el link te das cuenta de que prefieres pagar con otro medio (por ejemplo, efectivo o transferencia). Pregúntale cómo hacerlo y espera que te lo resuelva.'
};
export const PAY_ISSUE_LABEL = { tarjeta_rechazada: 'Tarjeta rechazada', link_no_abre: 'El link no abre', duda_renovacion: 'Duda sobre la renovación', otro_medio: 'Quiere pagar con otro medio' };
export const PLAN_LABEL = { expert: 'Expert', duo: 'Duo', groups: 'Groups' };
export const FORMA_LABEL = { contado: 'de contado con tarjeta', '4cuotas': 'a 4 cuotas sin intereses', '12msi': 'a 12 meses sin intereses', transferencia: 'por transferencia o PSE', efectivo: 'en efectivo' };
