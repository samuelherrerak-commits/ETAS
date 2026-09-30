// Formato regional (es-VE) y reglas de presentación de notas.

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export const ROL_LABEL = {
  admin: 'Administración',
  coordinador: 'Coordinación',
  profesor: 'Docente',
  estudiante: 'Estudiante',
  representante: 'Representante',
};

export const LAPSO_LABEL = { 1: '1er Lapso', 2: '2do Lapso', 3: '3er Lapso' };

function parse(value) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const d = new Date(value);
  return isNaN(d) ? null : d;
}

export function fecha(value, { long = false } = {}) {
  const d = parse(value);
  if (!d) return '—';
  if (long) return d.toLocaleDateString('es-VE', { day: 'numeric', month: 'long', year: 'numeric' });
  return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
}

export function fechaCorta(value) {
  const d = parse(value);
  return d ? { d: d.getDate(), m: MESES[d.getMonth()] } : { d: '—', m: '' };
}

export function relativo(value) {
  const d = parse(value);
  if (!d) return '';
  const diff = Math.round((Date.now() - d.getTime()) / 86400000);
  if (diff <= 0) return 'hoy';
  if (diff === 1) return 'ayer';
  if (diff < 7) return `hace ${diff} días`;
  return fecha(value);
}

export function hoyISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function nota(n, decimals = 2) {
  if (n === null || n === undefined || n === '') return '—';
  const v = Number(n);
  return Number.isInteger(v) ? String(v) : v.toFixed(decimals).replace(/0+$/, '').replace(/\.$/, '').replace('.', ',');
}

export function pct(n) {
  if (n === null || n === undefined) return '—';
  const v = Number(n);
  return `${Number.isInteger(v) ? v : v.toFixed(1).replace('.', ',')} %`;
}

export function monto(n) {
  return Number(n).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function cedula(c) {
  const s = String(c || '');
  return s ? `V-${s.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}` : '—';
}

/** Redondeo institucional (9,5 → 10). */
export function redondear(n) {
  return n === null || n === undefined ? null : Math.floor(n + 0.5 + 1e-9);
}

export function gradeClass(n) {
  if (n === null || n === undefined) return 'grade-empty';
  const r = redondear(n);
  if (r < 10) return 'grade-low';
  if (r >= 16) return 'grade-high';
  return 'grade-mid';
}

export function plural(n, uno, varios) {
  return `${n} ${n === 1 ? uno : varios}`;
}
