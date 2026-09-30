import { h, icon, append } from '../lib/dom.js';

const MAX = 4;
let root = null;

function ensureRoot() {
  if (!root) {
    root = h('div.toaster', { role: 'region', 'aria-label': 'Notificaciones', 'aria-live': 'polite' });
    append(document.body, root);
  }
  return root;
}

const ICON = { success: 'checkCircle', error: 'alertCircle', info: 'info' };

/**
 * toast.success('Notas guardadas', 'Se registraron 32 calificaciones')
 * Se pausa al pasar el cursor y se descarta con el botón o Escape.
 */
function show(type, title, description, { duration } = {}) {
  const container = ensureRoot();
  const ms = duration ?? (type === 'error' ? 6000 : 3800);
  const el = h(`div.toast.toast-${type}`, { role: type === 'error' ? 'alert' : 'status' },
    icon(ICON[type]),
    h('div.grow',
      h('div.toast-title', title),
      description ? h('div.toast-desc', description) : null),
    h('button.toast-close', { 'aria-label': 'Cerrar', onclick: () => dismiss() }, icon('x')));

  let timer = null;
  let remaining = ms;
  let started = 0;
  const start = () => { started = Date.now(); timer = setTimeout(dismiss, remaining); };
  const pause = () => { clearTimeout(timer); remaining -= Date.now() - started; };

  function dismiss() {
    clearTimeout(timer);
    el.classList.remove('is-in');
    el.classList.add('is-out');
    setTimeout(() => el.remove(), 220);
  }

  el.addEventListener('mouseenter', pause);
  el.addEventListener('mouseleave', start);
  append(container, el);
  while (container.children.length > MAX) container.firstChild.remove();
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-in')));
  start();
  return dismiss;
}

export const toast = {
  success: (t, d, o) => show('success', t, d, o),
  error: (t, d, o) => show('error', t, d, o),
  info: (t, d, o) => show('info', t, d, o),
};
