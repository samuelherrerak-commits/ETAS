/**
 * Utilidades comunes de los PDF: carga diferida de jsPDF, colores
 * institucionales y membrete con logo.
 */
import { hexToRgb, contrastWithWhite } from '../lib/theme.js';

let loading = null;

export function loadJsPdf() {
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

export const SLATE = [100, 116, 139];
export const LINE = [214, 219, 227];
export const ZEBRA = [247, 248, 250];
export const RED = [185, 28, 28];

/** Color principal del plantel (si es demasiado claro para texto blanco, azul marino). */
export function primaryRgb(inst) {
  const hex = inst?.color_primario;
  return hex && contrastWithWhite(hex) >= 3 ? hexToRgb(hex) : [15, 23, 42];
}

function initialsOf(name = '') {
  return name.split(/\s+/).filter((w) => w.length > 2 && w[0] === w[0].toUpperCase()).slice(0, 3).map((w) => w[0]).join('') || 'UE';
}

function imageSize(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/**
 * Dibuja el membrete y devuelve la coordenada Y donde sigue el contenido.
 * opts: { titulo, subtitulo, M, W }
 */
export async function drawMembrete(doc, inst, { titulo, subtitulo, M = 16, W = 210 } = {}) {
  const PRI = primaryRgb(inst);
  const y = 16;
  const box = 16;
  let drewLogo = false;
  if (inst.logo) {
    const size = await imageSize(inst.logo);
    const fmt = (inst.logo.match(/^data:image\/(png|jpeg|webp)/) || [])[1];
    if (size && fmt) {
      const k = Math.min(box / size.w, box / size.h);
      const w = size.w * k, h = size.h * k;
      try {
        doc.addImage(inst.logo, fmt.toUpperCase(), M + (box - w) / 2, y - 1 + (box - h) / 2, w, h);
        drewLogo = true;
      } catch { /* formato no soportado: se usan las iniciales */ }
    }
  }
  if (!drewLogo) {
    doc.setFillColor(...PRI);
    doc.circle(M + 8, y + 7, 8, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(255, 255, 255);
    doc.text(initialsOf(inst.nombre), M + 8, y + 8.3, { align: 'center' });
  }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...PRI);
  doc.text(String(inst.nombre || ''), M + 20, y + 4, { maxWidth: 110 });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...SLATE);
  doc.text(`Código DEA ${inst.codigo_dea || '—'}  ·  RIF ${inst.rif || '—'}`, M + 20, y + 9);
  doc.text(`${inst.direccion || ''}  ·  ${inst.telefono || ''}`, M + 20, y + 13, { maxWidth: 110 });
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...PRI);
  doc.text(titulo, W - M, y + 4, { align: 'right' });
  if (subtitulo) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...SLATE);
    doc.text(subtitulo, W - M, y + 9, { align: 'right' });
  }
  doc.setDrawColor(...PRI);
  doc.setLineWidth(0.6);
  doc.line(M, y + 20, W - M, y + 20);
  return y + 26;
}
