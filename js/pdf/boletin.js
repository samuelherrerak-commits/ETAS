/**
 * Boletín informativo en PDF (A4) con jsPDF, dibujado a mano para un
 * acabado institucional: membrete, datos del estudiante, notas por lapso,
 * definitiva, rasgos de personalidad y espacio para firmas y sello.
 * jsPDF se carga bajo demanda desde /vendor (sin CDN).
 */
import { cedula as fmtCed, fecha, redondear } from '../lib/format.js';

let loading = null;

function loadJsPdf() {
  if (window.jspdf?.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
  loading ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = new URL('../../vendor/jspdf.umd.min.js', import.meta.url).href;
    s.onload = () => resolve(window.jspdf.jsPDF);
    s.onerror = () => { loading = null; reject(new Error('No se pudo cargar el generador de PDF.')); };
    document.head.append(s);
  });
  return loading;
}

const NAVY = [15, 23, 42];
const SLATE = [100, 116, 139];
const LINE = [214, 219, 227];
const ZEBRA = [247, 248, 250];
const RED = [185, 28, 28];

function initialsOf(name) {
  return name.split(/\s+/).filter((w) => w.length > 2 && w[0] === w[0].toUpperCase()).slice(0, 3).map((w) => w[0]).join('') || 'UE';
}

export async function downloadBoletin(inf) {
  const JsPDF = await loadJsPdf();
  const doc = new JsPDF({ unit: 'mm', format: 'a4' });
  const inst = inf.institucion;
  const W = 210, M = 16, CW = W - M * 2;
  let y = 16;

  const text = (t, x, yy, opts = {}) => doc.text(String(t ?? ''), x, yy, opts);
  const font = (style = 'normal', size = 9, color = NAVY) => { doc.setFont('helvetica', style); doc.setFontSize(size); doc.setTextColor(...color); };

  // ── Membrete ───────────────────────────────────────────────────────
  doc.setFillColor(...NAVY);
  doc.circle(M + 8, y + 7, 8, 'F');
  font('bold', 10, [255, 255, 255]);
  text(initialsOf(inst.nombre), M + 8, y + 8.3, { align: 'center' });
  font('bold', 13);
  text(inst.nombre, M + 20, y + 4);
  font('normal', 8, SLATE);
  text(`Código DEA ${inst.codigo_dea}  ·  RIF ${inst.rif}`, M + 20, y + 9);
  text(`${inst.direccion}  ·  ${inst.telefono}`, M + 20, y + 13);
  font('bold', 10);
  text('BOLETÍN INFORMATIVO', W - M, y + 4, { align: 'right' });
  font('normal', 8.5, SLATE);
  text(`Año escolar ${inf.periodo.nombre}`, W - M, y + 9, { align: 'right' });
  y += 20;
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.6);
  doc.line(M, y, W - M, y);
  y += 6;

  // ── Datos ──────────────────────────────────────────────────────────
  const grado = inf.grado ? `${inf.grado.nombre}${inf.grado.seccion ? ` "${inf.grado.seccion}"` : ''}` : '—';
  const datos = [
    ['Estudiante', inf.estudiante.nombre], ['Cédula', fmtCed(inf.estudiante.cedula)],
    ['Grado / Sección', grado], ['Emitido', fecha(new Date().toISOString(), { long: true })],
    ['Representante', inf.representante?.nombre || '—'], ['C.I. Representante', inf.representante ? fmtCed(inf.representante.cedula) : '—'],
  ];
  doc.setFillColor(...ZEBRA);
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.2);
  doc.roundedRect(M, y, CW, 24, 2, 2, 'FD');
  datos.forEach(([k, v], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = M + 5 + col * (CW / 2);
    const yy = y + 6.5 + row * 7;
    font('normal', 7.5, SLATE); text(k.toUpperCase(), x, yy);
    font('bold', 9); text(v, x + 32, yy, { maxWidth: CW / 2 - 38 });
  });
  y += 32;

  // ── Tabla de calificaciones ────────────────────────────────────────
  const cols = [{ w: 74, label: 'MATERIA', align: 'left' }, { w: 19, label: '1er LAPSO' }, { w: 19, label: '2do LAPSO' }, { w: 19, label: '3er LAPSO' }, { w: 24, label: 'DEFINITIVA' }, { w: CW - 155, label: 'INASIST.' }];
  const rowH = 7.2;
  const drawRow = (cells, yy, { head = false, zebra = false, bold = false } = {}) => {
    if (head) { doc.setFillColor(...NAVY); doc.rect(M, yy, CW, rowH, 'F'); }
    else if (zebra) { doc.setFillColor(...ZEBRA); doc.rect(M, yy, CW, rowH, 'F'); }
    let x = M;
    cells.forEach((c, i) => {
      const col = cols[i];
      const val = typeof c === 'object' && c !== null ? c : { v: c };
      if (head) font('bold', 7.5, [255, 255, 255]);
      else font(bold || i === 4 ? 'bold' : 'normal', 9, val.red ? RED : NAVY);
      const tx = col.align === 'left' ? x + 3 : x + col.w / 2;
      text(val.v, tx, yy + rowH / 2 + 1.3, { align: col.align === 'left' ? 'left' : 'center', maxWidth: col.w - 4 });
      x += col.w;
    });
  };
  drawRow(cols.map((c) => c.label), y, { head: true });
  y += rowH;
  const cell = (n) => (n === null || n === undefined ? { v: '—' } : { v: String(redondear(n)), red: redondear(n) < 10 });
  inf.materias.forEach((m, i) => {
    drawRow([
      m.nombre,
      ...m.lapsos.map((l) => cell(l.nota)),
      m.definitiva === null ? { v: '—' } : { v: String(m.definitiva), red: m.definitiva < 10 },
      `${Math.round(m.inasistencia_pct)} %`,
    ], y, { zebra: i % 2 === 1 });
    y += rowH;
  });
  doc.setDrawColor(...LINE);
  doc.line(M, y, W - M, y);
  y += 2;
  const prom = inf.promedio_definitivo ?? inf.promedio_general;
  font('bold', 9);
  text(inf.promedio_definitivo !== null ? 'PROMEDIO GENERAL' : 'PROMEDIO GENERAL (PARCIAL)', M + 3, y + 5);
  text(prom === null ? '—' : prom.toFixed(2).replace('.', ','), M + 74 + 19 * 3 + 12, y + 5, { align: 'center' });
  y += 12;

  // ── Rasgos de personalidad ─────────────────────────────────────────
  font('bold', 9.5);
  text('RASGOS DE PERSONALIDAD', M, y);
  y += 3;
  const rw = [74, 19, 19, 19];
  const rh = 6.4;
  doc.setFillColor(...NAVY);
  doc.rect(M, y, rw.reduce((a, b) => a + b, 0), rh, 'F');
  font('bold', 7.5, [255, 255, 255]);
  ['RASGO', '1er', '2do', '3er'].forEach((t, i) => {
    const x = M + rw.slice(0, i).reduce((a, b) => a + b, 0);
    text(t, i ? x + rw[i] / 2 : x + 3, y + rh / 2 + 1.2, { align: i ? 'center' : 'left' });
  });
  y += rh;
  inf.rasgos.forEach((r, i) => {
    if (i % 2) { doc.setFillColor(...ZEBRA); doc.rect(M, y, rw.reduce((a, b) => a + b, 0), rh, 'F'); }
    font('normal', 8.5);
    text(r.rasgo, M + 3, y + rh / 2 + 1.2);
    [1, 2, 3].forEach((l, j) => {
      const x = M + rw.slice(0, j + 1).reduce((a, b) => a + b, 0);
      font('bold', 8.5);
      text(r.valores[l] || '—', x + rw[j + 1] / 2, y + rh / 2 + 1.2, { align: 'center' });
    });
    y += rh;
  });
  // Leyenda al costado de los rasgos
  const lx = M + 140;
  let ly = y - rh * inf.rasgos.length - rh + 2;
  font('bold', 7.5, SLATE);
  text('ESCALA', lx, ly + 2);
  font('normal', 8, NAVY);
  Object.entries(inf.escala_rasgos).forEach(([k, v]) => { ly += 5.5; text(`${k}  ${v}`, lx, ly + 2); });
  y += 8;

  // ── Observaciones ──────────────────────────────────────────────────
  font('bold', 9.5);
  text('OBSERVACIONES', M, y);
  doc.setDrawColor(...LINE);
  for (let i = 1; i <= 3; i++) doc.line(M, y + i * 7, W - M, y + i * 7);
  y += 30;

  // ── Firmas ─────────────────────────────────────────────────────────
  const sigY = Math.max(y + 14, 250);
  const sw = 56;
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.3);
  doc.line(M, sigY, M + sw, sigY);
  doc.line(W - M - sw, sigY, W - M, sigY);
  font('bold', 8.5);
  text(inst.director, M + sw / 2, sigY + 4.5, { align: 'center' });
  text('Docente guía', W - M - sw / 2, sigY + 4.5, { align: 'center' });
  font('normal', 7.5, SLATE);
  text('Director(a)', M + sw / 2, sigY + 8.5, { align: 'center' });
  text(inf.grado ? inf.grado.nombre : '', W - M - sw / 2, sigY + 8.5, { align: 'center' });
  doc.setLineDashPattern([1, 1], 0);
  doc.setDrawColor(...SLATE);
  doc.circle(W / 2, sigY - 4, 11, 'S');
  doc.setLineDashPattern([], 0);
  font('normal', 7, SLATE);
  text('Sello del plantel', W / 2, sigY - 3, { align: 'center' });

  font('normal', 7, SLATE);
  text(`Documento informativo generado por el Sistema de Control de Estudios · ${inst.nombre}. Escala de calificación 1 a 20, mínima aprobatoria 10.`, W / 2, 287, { align: 'center', maxWidth: CW });

  const safe = inf.estudiante.nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  doc.save(`boletin-${safe}-${inf.periodo.nombre}.pdf`);
}
