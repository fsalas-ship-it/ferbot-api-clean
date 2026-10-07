// Configuración del simulador. Puedes cambiar estos valores editando este archivo en GitHub;
// Vercel vuelve a publicar el sitio automáticamente con cada cambio.
export const CONFIG = {
  // Tiempos de la prueba (en segundos)
  testSec: 600,                 // 10 minutos
  extraSec: 180,                // 3 minutos de tiempo extra por buena gestión
  extraCheckAtSec: 570,         // 9:30 se revisan las conversaciones abiertas
  extraDecideAtSec: 590,        // 9:50 se concede o no el tiempo extra
  levels: [                     // fin de cada nivel y paciencia antes de que el cliente se moleste
    { n: 1, endSec: 120, patienceSec: 90 },
    { n: 2, endSec: 270, patienceSec: 75 },
    { n: 3, endSec: 420, patienceSec: 60 },
    { n: 4, endSec: 600, patienceSec: 45 }
  ],
  ghostPushGapSec: 25,          // separación mínima entre seguimientos al cliente fantasma

  // Comportamiento de los clientes
  buyerRate: 0.30,              // 30% de clientes dispuestos a comprar en cada nivel
  annoyedBuyProb: 0.05,         // probabilidad de compra después de molestarse
  reactBuyProb: 0.60,           // probabilidad de compra de un cliente que vuelve a escribir
  minBuySec: 240,               // un cliente no compra antes de 4 minutos de conversación
  typicalBuySec: 360,           // con buena gestión, compra hacia el minuto 6
  reactMinBuySec: 120,          // un cliente que vuelve puede cerrar desde los 2 minutos

  // Puntaje final (los pesos suman 100)
  weights: { calidad: 50, cierre: 20, carga: 15, velocidad: 10, ortografia: 5 },
  thresholds: { aprobado: 86, revisar: 71 },   // mismos niveles de la matriz de Aura

  // Modelos de IA (Anthropic)
  models: {
    client: 'claude-haiku-4-5-20251001',
    extra: 'claude-haiku-4-5-20251001',
    evaluation: 'claude-sonnet-5'
  },

  // Protección del saldo de la API
  maxAiCallsPerSession: 220,
  sessionMaxMin: 20,
  inviteValidDays: 7
};
