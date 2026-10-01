import { h, icon, replace } from '../../lib/dom.js';
import { api } from '../../api/client.js';
import { store } from '../../lib/store.js';
import { router } from '../../lib/router.js';
import { applyTheme, contrastWithWhite } from '../../lib/theme.js';
import { monto as fmtMonto } from '../../lib/format.js';
import {
  pageHeader, button, setLoading, field, input, select, callout, brandMark, loadSection, skeletonLines,
} from '../../ui/components.js';
import { refreshBrand } from '../../ui/shell.js';
import { toast } from '../../ui/toast.js';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const LOGO_MAX = 45000; // caracteres: cabe en una celda de Google Sheets

/** Redimensiona la imagen en el navegador hasta que su data URL quepa en una celda. */
async function procesarLogo(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('El archivo no es una imagen válida.'));
      i.src = url;
    });
    for (const size of [256, 200, 160, 128, 96]) {
      const scale = Math.min(1, size / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const g = canvas.getContext('2d');
      g.drawImage(img, 0, 0, canvas.width, canvas.height);
      for (const [type, q] of [['image/png'], ['image/webp', 0.9], ['image/webp', 0.75]]) {
        const data = canvas.toDataURL(type, q);
        if (data.startsWith(`data:${type}`) && data.length <= LOGO_MAX) return data;
      }
    }
    throw new Error('La imagen es demasiado compleja. Pruebe con un logo más simple o con fondo transparente.');
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function configuracionPage() {
  const content = h('div');

  function render(cfg) {
    const state = { ...cfg };
    const dirty = () => Object.keys(state).some((k) => String(state[k] ?? '') !== String(cfg[k] ?? ''));
    const root = h('div.stack', { style: { '--gap': '20px' } });
    let saveBtn;

    const sync = () => {
      const d = dirty();
      root.dataset.dirty = String(d);
      saveBtn.disabled = !d;
      if (d) router.setGuard(() => 'La configuración tiene cambios sin guardar.');
      else router.clearGuard();
    };

    const bind = (key, el, transform = (v) => v) => {
      el.addEventListener('input', () => { state[key] = transform(el.value); onChange(key); sync(); });
      el.addEventListener('change', () => { state[key] = transform(el.value); onChange(key); sync(); });
      return el;
    };

    // ─── Identidad ────────────────────────────────────────────────────
    const campos = [
      ['nombre', 'Nombre del plantel'], ['rif', 'RIF'], ['codigo_dea', 'Código DEA'], ['director', 'Director(a)'],
      ['telefono', 'Teléfono'], ['email', 'Correo de administración'], ['direccion', 'Dirección'], ['ciudad', 'Ciudad'],
    ];
    const identidad = h('section.card',
      h('div.card-header', h('div', h('h2', 'Identidad institucional'), h('p.cell-sub', 'Aparece en el acceso, el menú, los boletines y las constancias.'))),
      h('div.card-body.grid.grid-2', campos.map(([k, label]) => field({ label, input: bind(k, input({ value: cfg[k] || '' })) }))));

    // ─── Logo ─────────────────────────────────────────────────────────
    const logoPreview = h('div');
    const fileIn = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/svg+xml', hidden: true });
    const paintLogo = () => replace(logoPreview, h('div.row', { style: { '--gap': '16px' } },
      h('div.logo-preview', brandMark(state.logo, { size: 72 })),
      h('div.stack', { style: { '--gap': '4px' } },
        h('div.cell-title', state.logo ? 'Logo cargado' : 'Sin logo'),
        h('div.cell-sub', state.logo ? `${Math.round(state.logo.length / 1024)} KB · se ajusta automáticamente` : 'Se usa el ícono del sistema.'))));
    fileIn.addEventListener('change', async () => {
      const f = fileIn.files[0];
      fileIn.value = '';
      if (!f) return;
      try {
        state.logo = await procesarLogo(f);
        paintLogo(); onChange('logo'); sync();
      } catch (e) { toast.error('No se pudo usar la imagen', e.message); }
    });
    paintLogo();
    const logo = h('section.card',
      h('div.card-header', h('div', h('h2', 'Logo'), h('p.cell-sub', 'PNG con fondo transparente recomendado. Se redimensiona para guardarse en la hoja.'))),
      h('div.card-body.row-between.wrap', { style: { gap: '16px' } }, logoPreview,
        h('div.row',
          button({ label: 'Quitar', size: 'sm', variant: 'ghost', onClick: () => { state.logo = ''; paintLogo(); onChange('logo'); sync(); } }),
          button({ label: 'Subir imagen', size: 'sm', iconName: 'plus', onClick: () => fileIn.click() }),
          fileIn)));

    // ─── Colores ──────────────────────────────────────────────────────
    const colorField = (key, label) => {
      const picker = h('input.color-swatch', { type: 'color', value: state[key], 'aria-label': label });
      const hex = input({ value: state[key], class: 'mono', maxlength: 7, style: { maxWidth: '120px' }, 'aria-label': `${label} (hexadecimal)` });
      picker.addEventListener('input', () => { hex.value = picker.value; state[key] = picker.value; onChange(key); sync(); });
      hex.addEventListener('input', () => {
        if (/^#[0-9a-f]{6}$/i.test(hex.value)) { picker.value = hex.value; state[key] = hex.value.toLowerCase(); onChange(key); sync(); }
      });
      return h('div.field', h('div.label', label), h('div.row', { style: { '--gap': '10px' } }, picker, hex));
    };
    const preview = h('div.theme-preview',
      h('div.tp-side', brandMark(null, { size: 28 }), h('span.tp-line'), h('span.tp-line.short'), h('span.tp-item', 'Mis materias')),
      h('div.tp-main', h('div.tp-title', 'Vista previa'), h('div.row', { style: { '--gap': '8px' } },
        h('button.btn.btn-primary.btn-sm', { type: 'button', tabindex: '-1' }, 'Botón principal'),
        h('span.badge.badge-blue', 'Etiqueta'))));
    const contrastNote = h('div');
    const paintColors = () => {
      applyTheme(state, preview);
      const cp = contrastWithWhite(state.color_primario);
      const ca = contrastWithWhite(state.color_acento);
      replace(contrastNote, cp < 4.5 || ca < 3
        ? callout('warn', 'alert', h('span', h('strong', 'Contraste bajo. '),
          cp < 4.5 ? 'El texto blanco sobre el color principal será difícil de leer. Elija un tono más oscuro. ' : '',
          ca < 3 ? 'El color de acento es muy claro para botones con texto blanco.' : ''))
        : null);
    };
    const colores = h('section.card',
      h('div.card-header', h('div', h('h2', 'Colores institucionales'), h('p.cell-sub', 'El principal se usa en el menú y los encabezados; el acento, en botones y enlaces.'))),
      h('div.card-body.grid.config-colors',
        h('div.stack', colorField('color_primario', 'Color principal'), colorField('color_acento', 'Color de acento'), contrastNote,
          h('div', button({ label: 'Restablecer colores', size: 'sm', variant: 'ghost', iconName: 'refresh',
            onClick: () => {
              state.color_primario = '#0f172a'; state.color_acento = '#2563eb';
              content.querySelectorAll('.color-swatch').forEach((el, i) => { el.value = i ? '#2563eb' : '#0f172a'; el.dispatchEvent(new Event('input')); });
            } }))),
        preview));

    // ─── Cobranza ─────────────────────────────────────────────────────
    const resumen = h('div');
    const mesOpts = MESES.map((m, i) => ({ value: String(i + 1), label: m }));
    const paintCobro = () => {
      const ini = Number(state.mes_inicio_cobro), fin = Number(state.mes_fin_cobro);
      const n = ((fin - ini + 12) % 12) + 1;
      replace(resumen, callout('info', 'info', h('span',
        `Se cobran ${n} mensualidades (${MESES[ini - 1].toLowerCase()} a ${MESES[fin - 1].toLowerCase()}) de ${fmtMonto(Number(state.mensualidad_monto) || 0)} ${state.moneda}. `,
        `El mes en curso se paga del día 1 al ${state.dia_limite_pago}; desde el día ${Number(state.dia_limite_pago) + 1} el estudiante queda insolvente y no puede ver notas ni boletín.`)));
    };
    const cobranza = h('section.card',
      h('div.card-header', h('div', h('h2', 'Cobranza'), h('p.cell-sub', 'Define la solvencia automática de cada estudiante.'))),
      h('div.card-body.stack',
        h('div.grid.grid-4',
          field({ label: 'Mensualidad', input: bind('mensualidad_monto', input({ value: state.mensualidad_monto, inputmode: 'decimal' }), (v) => v.replace(',', '.')) }),
          field({ label: 'Moneda', input: bind('moneda', select(['USD', 'Bs.', 'EUR'], { value: state.moneda })) }),
          field({ label: 'Día límite de pago', input: bind('dia_limite_pago', input({ type: 'number', min: 1, max: 28, value: state.dia_limite_pago })) }),
          h('div')),
        h('div.grid.grid-2',
          field({ label: 'Primer mes que se cobra', input: bind('mes_inicio_cobro', select(mesOpts, { value: String(state.mes_inicio_cobro) })) }),
          field({ label: 'Último mes que se cobra', input: bind('mes_fin_cobro', select(mesOpts, { value: String(state.mes_fin_cobro) })) })),
        resumen));

    function onChange(key) {
      if (key === 'color_primario' || key === 'color_acento') paintColors();
      if (['mensualidad_monto', 'moneda', 'dia_limite_pago', 'mes_inicio_cobro', 'mes_fin_cobro'].includes(key)) paintCobro();
    }

    async function save() {
      setLoading(saveBtn, true);
      try {
        const next = await api.send('updateInstitucion', state);
        store.patchSession({ institucion: next });
        applyTheme(next);
        refreshBrand();
        router.clearGuard();
        toast.success('Configuración guardada', 'Los cambios ya se ven en todo el portal.');
        replace(content, render(next));
      } catch (e) {
        toast.error('No se pudo guardar', e.message);
        setLoading(saveBtn, false);
      }
    }

    saveBtn = button({ label: 'Guardar configuración', variant: 'primary', iconName: 'save', disabled: true, onClick: save });
    paintColors();
    paintCobro();
    root.append(identidad, logo, colores, cobranza,
      h('div.row', { style: { justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' } },
        h('p.cell-sub', 'También puede editar estos valores en la pestaña ', h('strong', 'Config'), ' de la hoja de cálculo.'),
        saveBtn));
    return root;
  }

  loadSection(content, {
    skeleton: () => h('div.card.card-body', skeletonLines(6)),
    fetch: async () => (await api.get('session', {}, { fresh: true })).institucion,
    render,
  });

  return h('div.stack', { style: { '--gap': '24px' } },
    pageHeader({
      eyebrow: 'Administración',
      title: 'Configuración del plantel',
      subtitle: 'Identidad, logo, colores institucionales y reglas de cobranza.',
    }),
    content);
}
