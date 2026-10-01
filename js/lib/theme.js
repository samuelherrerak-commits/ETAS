// Colores institucionales: a partir de dos colores base se derivan los tonos
// que usa la hoja de estilos (variables CSS en :root).

const DEFAULTS = { color_primario: '#0f172a', color_acento: '#2563eb' };

export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toHex = (rgb) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
const mix = (rgb, target, t) => rgb.map((v, i) => v + (target[i] - v) * t);
const BLACK = [0, 0, 0];
const WHITE = [255, 255, 255];

/** Luminancia relativa WCAG. */
export function luminance(rgb) {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contraste del color contra texto blanco (WCAG; ≥ 4.5 es legible). */
export function contrastWithWhite(hex) {
  const rgb = hexToRgb(hex);
  return rgb ? 1.05 / (luminance(rgb) + 0.05) : 21;
}

export function themeVars(cfg = {}) {
  const p = hexToRgb(cfg.color_primario) || hexToRgb(DEFAULTS.color_primario);
  const a = hexToRgb(cfg.color_acento) || hexToRgb(DEFAULTS.color_acento);
  return {
    '--navy-950': toHex(mix(p, BLACK, 0.3)),
    '--navy-900': toHex(p),
    '--navy-800': toHex(mix(p, WHITE, 0.1)),
    '--navy-700': toHex(mix(p, WHITE, 0.2)),
    '--blue-700': toHex(mix(a, BLACK, 0.15)),
    '--blue-600': toHex(a),
    '--blue-500': toHex(mix(a, WHITE, 0.15)),
    '--blue-100': toHex(mix(a, WHITE, 0.84)),
    '--blue-50': toHex(mix(a, WHITE, 0.93)),
    '--accent': toHex(a),
    '--focus': `0 0 0 3px rgb(${a.map(Math.round).join(' ')} / 0.28)`,
  };
}

export function applyTheme(cfg = {}, el = document.documentElement) {
  const vars = themeVars(cfg);
  for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v);
  if (el === document.documentElement) {
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', vars['--navy-900']);
  }
}
