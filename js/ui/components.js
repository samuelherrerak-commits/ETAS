import { h, icon, initials, replace, nextFrame, append } from '../lib/dom.js';
import { nota, gradeClass, fecha } from '../lib/format.js';

// ─── Controles ─────────────────────────────────────────────────────────

export function button({ label, iconName, iconRight, variant, size, onClick, type = 'button', disabled, title, block, ariaLabel }) {
  const cls = ['btn'];
  if (variant) cls.push(`btn-${variant}`);
  if (size) cls.push(`btn-${size}`);
  if (block) cls.push('btn-block');
  if (!label && iconName) cls.push('btn-icon');
  const el = h(`button.${cls.join('.')}`, {
    type, disabled, title, 'aria-label': ariaLabel || (!label ? title : null), onclick: onClick,
  }, iconName ? icon(iconName) : null, label ? h('span', label) : null, iconRight ? icon(iconRight) : null);
  return el;
}

/** Estado de carga que conserva el ancho del botón (sin saltos de layout). */
export function setLoading(btn, loading) {
  if (loading) {
    btn.style.width = `${btn.offsetWidth}px`;
    btn.dataset.html = btn.innerHTML;
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    replace(btn, h('span.spinner'));
  } else if (btn.dataset.html !== undefined) {
    btn.innerHTML = btn.dataset.html;
    delete btn.dataset.html;
    btn.disabled = false;
    btn.removeAttribute('aria-busy');
    btn.style.width = '';
  }
}

export function badge(text, tone = '', { dot = false, iconName } = {}) {
  const cls = ['badge'];
  if (tone) cls.push(`badge-${tone}`);
  if (dot) cls.push('badge-dot');
  return h(`span.${cls.join('.')}`, iconName ? icon(iconName) : null, text);
}

export function pagoBadge(estado) {
  return estado === 'moroso' ? badge('Moroso', 'red', { dot: true }) : badge('Solvente', 'green', { dot: true });
}

export function gradePill(n, { lg = false, title } = {}) {
  return h(`span.grade.${gradeClass(n)}${lg ? '.grade-lg' : ''}`, { title }, nota(n));
}

export function avatar(name, { lg = false } = {}) {
  return h(`span.avatar${lg ? '.avatar-lg' : ''}`, { 'aria-hidden': 'true' }, initials(name));
}

export function field({ label, input, help, error, id }) {
  const fid = id || input.id || `f-${Math.random().toString(36).slice(2, 8)}`;
  input.id = fid;
  const errEl = h('div.field-error', { hidden: !error, id: `${fid}-err` }, icon('alertCircle'), h('span', error || ''));
  const wrap = h('div.field',
    label ? h('label', { for: fid }, label) : null,
    input,
    help ? h('div.field-help', help) : null,
    errEl);
  wrap.setError = (msg) => {
    errEl.hidden = !msg;
    errEl.lastChild.textContent = msg || '';
    input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    if (msg) input.setAttribute('aria-describedby', errEl.id);
  };
  return wrap;
}

export function input(props = {}) {
  return h('input.input', { type: 'text', ...props });
}

export function select(options, props = {}) {
  const el = h('select.select', props,
    options.map((o) => {
      const opt = typeof o === 'object' ? o : { value: o, label: o };
      return h('option', { value: opt.value, disabled: opt.disabled }, opt.label);
    }));
  if (props.value !== undefined) el.value = props.value;
  return el;
}

export function textarea(props = {}) {
  return h('textarea.textarea', props);
}

export function searchInput({ placeholder = 'Buscar…', onInput, value = '' }) {
  const inp = h('input.input', { type: 'search', placeholder, value, 'aria-label': placeholder, oninput: (e) => onInput(e.target.value) });
  return h('div.input-group', icon('search'), inp);
}

export function switchEl({ checked = false, onChange, label, disabled, size }) {
  const el = h(`button.switch${size === 'lg' ? '.switch-lg' : ''}`, {
    type: 'button', role: 'switch', 'aria-checked': String(!!checked), 'aria-label': label, disabled,
  });
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    const next = el.getAttribute('aria-checked') !== 'true';
    el.setAttribute('aria-checked', String(next));
    onChange?.(next);
  });
  el.set = (v) => el.setAttribute('aria-checked', String(!!v));
  return el;
}

/** Control segmentado con indicador deslizante. */
export function segmented(options, value, onChange, { label } = {}) {
  const thumb = h('span.seg-thumb', { 'aria-hidden': 'true' });
  const wrap = h('div.segmented', { role: 'group', 'aria-label': label }, thumb);
  const buttons = options.map((o) => {
    const b = h('button', { type: 'button', 'aria-pressed': String(o.value === value), disabled: o.disabled, title: o.title }, o.label);
    b.addEventListener('click', () => {
      if (o.value === value) return;
      value = o.value;
      sync();
      onChange(o.value);
    });
    append(wrap, b);
    return b;
  });
  function sync() {
    buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(options[i].value === value)));
    const active = buttons[options.findIndex((o) => o.value === value)];
    if (!active || !active.offsetWidth) return;
    thumb.style.width = `${active.offsetWidth}px`;
    thumb.style.transform = `translateX(${active.offsetLeft}px)`;
  }
  nextFrame().then(() => {
    thumb.style.transition = 'none';
    sync();
    requestAnimationFrame(() => { thumb.style.transition = ''; });
  });
  new ResizeObserver(sync).observe(wrap);
  wrap.setValue = (v) => { value = v; sync(); };
  return wrap;
}

/** Pestañas con indicador animado. items: [{ id, label, iconName, count }] */
export function tabs(items, active, onChange) {
  const indicator = h('span.tab-indicator', { 'aria-hidden': 'true' });
  const wrap = h('div.tabs', { role: 'tablist' });
  const els = items.map((it) => {
    const b = h('button.tab', { type: 'button', role: 'tab', 'aria-selected': String(it.id === active) },
      it.iconName ? icon(it.iconName) : null, it.label,
      it.count ? h('span.count', String(it.count)) : null);
    b.addEventListener('click', () => {
      if (it.id === active) return;
      active = it.id;
      sync();
      onChange(it.id);
    });
    return b;
  });
  append(wrap, ...els, indicator);
  function sync() {
    els.forEach((b, i) => b.setAttribute('aria-selected', String(items[i].id === active)));
    const el = els[items.findIndex((i) => i.id === active)];
    if (!el || !el.offsetWidth) return;
    indicator.style.width = `${el.offsetWidth}px`;
    indicator.style.transform = `translateX(${el.offsetLeft}px)`;
  }
  nextFrame().then(() => {
    indicator.style.transition = 'none';
    sync();
    requestAnimationFrame(() => { indicator.style.transition = ''; });
  });
  new ResizeObserver(sync).observe(wrap);
  return wrap;
}

export function progress(value, { tone } = {}) {
  let v = Math.max(0, Math.min(100, value || 0));
  const bar = h('span', { style: { width: '0%' } });
  const el = h(`div.progress${tone ? `.is-${tone}` : ''}`, { role: 'progressbar', 'aria-valuenow': String(Math.round(v)), 'aria-valuemin': '0', 'aria-valuemax': '100' }, bar);
  // Crece desde 0 al montarse; `set` posteriores ganan sobre el valor inicial.
  nextFrame().then(() => { bar.style.width = `${v}%`; });
  el.set = (nv, ntone) => {
    v = Math.max(0, Math.min(100, nv));
    bar.style.width = `${v}%`;
    el.setAttribute('aria-valuenow', String(Math.round(v)));
    el.className = `progress${ntone ? ` is-${ntone}` : ''}`;
  };
  return el;
}

export function callout(tone, iconName, ...children) {
  return h(`div.callout.callout-${tone}`, icon(iconName), h('div.grow', children));
}

// ─── Estructura ────────────────────────────────────────────────────────

export function pageHeader({ eyebrow, title, subtitle, actions, back }) {
  return h('header.page-head.enter',
    h('div.grow',
      back ? h('a.crumb', { href: back.href }, icon('chevronLeft'), back.label) : null,
      eyebrow ? h('div.eyebrow', eyebrow) : null,
      h('h1', title),
      subtitle ? h('p', subtitle) : null),
    actions ? h('div.row.wrap', actions) : null);
}

export function statCard({ label, value, hint, iconName, tone }) {
  return h('div.card.stat',
    h('div.stat-label', iconName ? icon(iconName) : null, label),
    h('div.stat-value', { style: tone ? { color: `var(--${tone})` } : null }, value),
    hint ? h('div.stat-hint', hint) : null);
}

/**
 * Tabla declarativa.
 * columns: [{ label, render(row) | key, className, headClass }]
 */
export function table({ columns, rows, empty, rowAttrs, caption }) {
  if (!rows.length && empty) return empty;
  return h('div.table-wrap',
    h('table.table',
      caption ? h('caption.sr-only', caption) : null,
      h('thead', h('tr', columns.map((c) => h('th', { class: c.headClass || c.className, scope: 'col' }, c.label)))),
      h('tbody', rows.map((r, i) => h('tr', rowAttrs ? rowAttrs(r, i) : {},
        columns.map((c) => h('td', { class: c.className }, c.render ? c.render(r, i) : r[c.key])))))));
}

// ─── Estados ───────────────────────────────────────────────────────────

export function emptyState({ iconName = 'inbox', title, text, action }) {
  return h('div.empty.enter',
    h('div.empty-icon', icon(iconName)),
    h('h3', title),
    text ? h('p', text) : null,
    action || null);
}

export function errorState(err, retry) {
  const offline = err?.code === 'RED';
  return h('div.empty.is-error.enter', { role: 'alert' },
    h('div.empty-icon', icon(offline ? 'wifiOff' : 'alertCircle')),
    h('h3', offline ? 'Sin conexión con el servidor' : 'No se pudo cargar la información'),
    h('p', err?.message || 'Ocurrió un error inesperado.'),
    retry ? button({ label: 'Reintentar', iconName: 'refresh', onClick: retry }) : null);
}

/** Pantalla institucional de bloqueo por morosidad. */
export function lockState({ contacto = {}, nombre, action } = {}) {
  return h('div.card.lock.enter', { role: 'status' },
    h('div.lock-seal', icon('lock')),
    h('div.eyebrow', 'Solvencia administrativa requerida'),
    h('h2', 'Consulta académica suspendida temporalmente'),
    h('p', nombre
      ? `Las calificaciones y el boletín de ${nombre} estarán disponibles en cuanto la administración registre la solvencia de su cuenta.`
      : 'Sus calificaciones y su boletín estarán disponibles en cuanto la administración registre la solvencia de su cuenta.'),
    h('div.lock-contact',
      contacto.nombre ? h('span', icon('landmark'), contacto.nombre) : null,
      contacto.telefono ? h('span', icon('phone'), contacto.telefono) : null,
      contacto.email ? h('span', icon('mail'), contacto.email) : null),
    action ? h('div', { style: { marginTop: '16px' } }, action) : null);
}

export function skeletonLines(n = 3) {
  return h('div.stack', { style: { '--gap': '10px' } },
    Array.from({ length: n }, (_, i) => h('div.skeleton.sk-line', { style: { width: `${[92, 76, 84, 60, 70][i % 5]}%` } })));
}

export function skeletonCards(n = 3, height = 150) {
  return h('div.grid.grid-auto', Array.from({ length: n }, () =>
    h('div.card.card-pad.stack', { style: { height: `${height}px`, '--gap': '14px' } },
      h('div.skeleton.sk-title'), skeletonLines(3))));
}

export function skeletonStats(n = 4) {
  return h('div.grid.grid-4', Array.from({ length: n }, () =>
    h('div.card.stat', h('div.skeleton.sk-line', { style: { width: '50%' } }), h('div.skeleton', { style: { height: '30px', width: '40%' } }))));
}

export function skeletonTable(rows = 6) {
  return h('div.card', h('div.card-body.stack', { style: { '--gap': '18px' } },
    Array.from({ length: rows }, (_, i) => h('div.row', { style: { '--gap': '16px' } },
      h('div.skeleton', { style: { width: '32px', height: '32px', borderRadius: '50%', flex: 'none' } }),
      h('div.skeleton.sk-line', { style: { width: `${30 + ((i * 17) % 30)}%` } }),
      h('div.skeleton.sk-line', { style: { width: '15%', marginLeft: 'auto' } })))));
}

export function skeletonPage() {
  return h('div.stack', { style: { '--gap': '24px' } },
    h('div.stack', { style: { '--gap': '10px' } },
      h('div.skeleton', { style: { height: '12px', width: '120px' } }),
      h('div.skeleton', { style: { height: '28px', width: '280px' } })),
    skeletonStats(), skeletonTable(4));
}

/**
 * Carga asíncrona con estados de carga / error / contenido.
 * Devuelve { reload } para refrescar la sección.
 */
export function loadSection(container, { skeleton, fetch, render }) {
  let seq = 0;
  async function run(opts = {}) {
    const my = ++seq;
    if (!opts.silent) replace(container, typeof skeleton === 'function' ? skeleton() : skeleton || skeletonLines(4));
    try {
      const data = await fetch(opts);
      if (my !== seq) return;
      replace(container, render(data, { reload: (o) => run({ silent: true, fresh: true, ...o }) }));
    } catch (e) {
      if (my !== seq) return;
      if (e?.code === 'SESION') return;
      replace(container, errorState(e, () => run({ fresh: true })));
    }
  }
  run();
  return { reload: (o) => run({ silent: true, fresh: true, ...o }) };
}

export function noticeItem(a) {
  const d = new Date(a.fecha);
  const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return h('article.notice',
    h('div.notice-date', { title: fecha(a.fecha, { long: true }) },
      h('div.d', String(d.getDate())), h('div.m', MES[d.getMonth()])),
    h('div.grow',
      h('h4', a.titulo, a.prioridad === 'importante' ? badge('Importante', 'amber') : null),
      h('p', a.contenido),
      h('div.by', a.autor)));
}
