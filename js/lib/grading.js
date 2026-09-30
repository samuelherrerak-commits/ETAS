// Espejo en el cliente del cálculo del backend (backend/core.js → calcLapso),
// para mostrar la nota del lapso en tiempo real mientras se escribe.

const round2 = (n) => Math.round(n * 100) / 100;

export function calcLapso(evaluaciones, notas) {
  let total = 0, evaluado = 0, suma = 0;
  for (const e of evaluaciones) {
    total += e.porcentaje;
    const n = notas[e.id];
    if (n !== null && n !== undefined && n !== '') {
      evaluado += e.porcentaje;
      suma += Number(n) * e.porcentaje;
    }
  }
  const completo = Math.abs(total - 100) < 0.001 && Math.abs(evaluado - 100) < 0.001;
  return {
    plan_pct: round2(total),
    evaluado_pct: round2(evaluado),
    acumulado: round2(suma / 100),
    parcial: evaluado > 0 ? round2(suma / evaluado) : null,
    nota: completo ? round2(suma / 100) : null,
  };
}

/** Valida el texto de una celda: '' | número 1–20 con hasta 2 decimales. */
export function parseNota(text, { min = 1, max = 20 } = {}) {
  const t = String(text).trim().replace(',', '.');
  if (t === '') return { ok: true, value: null };
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(t)) return { ok: false, error: 'Use números del 1 al 20 (hasta 2 decimales).' };
  const v = Number(t);
  if (v < min || v > max) return { ok: false, error: `La nota debe estar entre ${min} y ${max}.` };
  return { ok: true, value: v };
}
