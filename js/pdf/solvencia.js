/**
 * Constancia de solvencia administrativa (A4). Se emite solo cuando el
 * backend confirma que no hay mensualidades vencidas; incluye un código que
 * cualquiera puede validar con la acción pública `verificarConstancia`.
 */
import { cedula as fmtCed, fecha, monto as fmtMonto } from '../lib/format.js';
import { loadJsPdf, drawMembrete, primaryRgb, SLATE, LINE, ZEBRA } from './membrete.js';

const METODO = { transferencia: 'Transferencia', caja: 'Caja' };

export async function downloadConstancia(c) {
  const JsPDF = await loadJsPdf();
  const doc = new JsPDF({ unit: 'mm', format: 'a4' });
  const inst = c.institucion;
  const PRI = primaryRgb(inst);
  const W = 210, M = 18, CW = W - M * 2;
  const font = (style = 'normal', size = 10, color = PRI) => { doc.setFont('helvetica', style); doc.setFontSize(size); doc.setTextColor(...color); };

  let y = await drawMembrete(doc, inst, { titulo: 'CONSTANCIA DE SOLVENCIA', subtitulo: `Año escolar ${c.periodo.nombre}`, M, W });
  y += 8;

  font('bold', 16);
  doc.text('Constancia de solvencia administrativa', W / 2, y, { align: 'center' });
  y += 12;

  const grado = c.grado ? `${c.grado.nombre}${c.grado.seccion ? ` "${c.grado.seccion}"` : ''}` : '';
  const exonerado = c.cuenta.condicion === 'exonerado';
  const cuerpo = `Quien suscribe, en representación de la administración de ${inst.nombre}, hace constar que el(la) estudiante `
    + `${c.estudiante.nombre}, titular de la cédula ${fmtCed(c.estudiante.cedula)}, cursante de ${grado} en el año escolar ${c.periodo.nombre}, `
    + (exonerado
      ? 'se encuentra exonerado(a) del pago de mensualidades y, en consecuencia, SOLVENTE con esta institución.'
      : 'se encuentra SOLVENTE con esta institución, al tener pagadas todas las mensualidades exigibles a la fecha de emisión.')
    + ` Constancia que se expide a petición de la parte interesada en ${inst.ciudad || 'Venezuela'}, a los ${fecha(c.fecha_emision, { long: true })}.`;
  font('normal', 10.5, [30, 41, 59]);
  const lines = doc.splitTextToSize(cuerpo, CW);
  doc.text(lines, M, y, { lineHeightFactor: 1.6 });
  y += lines.length * 10.5 * 0.3528 * 1.6 + 8;

  // Tabla de mensualidades pagadas
  const pagadas = c.cuenta.meses.filter((m) => m.estado === 'pagado');
  if (pagadas.length) {
    const cols = [{ w: 44, t: 'MES' }, { w: 30, t: 'MÉTODO' }, { w: 58, t: 'REFERENCIA' }, { w: CW - 132, t: 'VERIFICADO' }];
    const rh = 7;
    doc.setFillColor(...PRI);
    doc.rect(M, y, CW, rh, 'F');
    let x = M;
    font('bold', 7.5, [255, 255, 255]);
    cols.forEach((col) => { doc.text(col.t, x + 3, y + 4.7); x += col.w; });
    y += rh;
    pagadas.forEach((m, i) => {
      if (i % 2) { doc.setFillColor(...ZEBRA); doc.rect(M, y, CW, rh, 'F'); }
      x = M;
      font('normal', 9, [30, 41, 59]);
      [m.nombre, METODO[m.metodo] || m.metodo, m.referencia || '—', m.fecha_verificacion ? fecha(m.fecha_verificacion) : '—']
        .forEach((v, j) => { doc.text(String(v), x + 3, y + 4.8, { maxWidth: cols[j].w - 5 }); x += cols[j].w; });
      y += rh;
    });
    doc.setDrawColor(...LINE);
    doc.line(M, y, W - M, y);
    y += 6;
    font('normal', 8.5, SLATE);
    doc.text(`Mensualidad: ${fmtMonto(c.cuenta.monto_mensual)} ${c.cuenta.moneda}. El mes en curso vence el día ${c.cuenta.dia_limite} de cada mes.`, M, y);
    y += 6;
  }

  // Código de verificación
  y = Math.max(y + 6, 205);
  doc.setDrawColor(...PRI);
  doc.setLineWidth(0.3);
  doc.roundedRect(M, y, CW, 20, 2, 2, 'S');
  font('normal', 8, SLATE);
  doc.text('CÓDIGO DE VERIFICACIÓN', M + 5, y + 7);
  font('bold', 13);
  doc.text(c.codigo, M + 5, y + 14.5);
  font('normal', 8, SLATE);
  doc.text(doc.splitTextToSize('Válida mientras el estudiante mantenga sus mensualidades al día. La administración puede confirmar su autenticidad con este código.', 82), W - M - 5, y + 7, { align: 'right' });

  // Firma
  const sy = 262;
  doc.setDrawColor(...PRI);
  doc.line(W / 2 - 32, sy, W / 2 + 32, sy);
  font('bold', 9);
  doc.text('Administración', W / 2, sy + 5, { align: 'center' });
  font('normal', 8, SLATE);
  doc.text(inst.nombre, W / 2, sy + 9.5, { align: 'center' });
  doc.text(`${inst.email || ''}  ·  ${inst.telefono || ''}`, W / 2, 287, { align: 'center' });

  const safe = c.estudiante.nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  doc.save(`constancia-solvencia-${safe}-${c.fecha_emision}.pdf`);
}
