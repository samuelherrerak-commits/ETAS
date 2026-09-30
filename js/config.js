/**
 * Configuración del frontend.
 *
 * API_URL: URL de la aplicación web de Apps Script (termina en /exec).
 * Déjela vacía para usar el modo demo: el mismo backend corre en el
 * navegador sobre localStorage con datos de prueba.
 */
export const CONFIG = {
  API_URL: '',
  // Latencia simulada en modo demo (ms) para ver los estados de carga.
  DEMO_LATENCY: [180, 420],
  REQUEST_TIMEOUT: 30000,
};

export const IS_DEMO = !CONFIG.API_URL;
