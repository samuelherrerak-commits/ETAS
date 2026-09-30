import { h, icon, nextFrame, append } from '../lib/dom.js';
import { button, setLoading, field } from './components.js';
import { toast } from './toast.js';

/**
 * Modal accesible sobre <dialog>: foco atrapado por el navegador, Escape y
 * clic en el fondo cierran. Entrada con escala desde 0.96 (nunca desde 0).
 *
 * openModal({ title, description, iconName, tone, width, body, footer })
 *   body / footer: Node o (ctx) => Node, ctx = { close }
 */
export function openModal({ title, description, iconName, tone = 'info', width, body, footer, onClose }) {
  const dialog = h('dialog.modal', { 'aria-labelledby': 'modal-title' });
  let closed = false;

  const ctx = {
    close(result) {
      if (closed) return;
      closed = true;
      dialog.classList.remove('is-open');
      setTimeout(() => { dialog.close(); dialog.remove(); onClose?.(result); }, 200);
    },
    dialog,
  };

  const resolve = (x) => (typeof x === 'function' ? x(ctx) : x);
  const panel = h('div.modal-panel', { style: width ? { '--modal-w': `${width}px` } : null },
    h('div.modal-head',
      iconName ? h(`div.modal-icon.is-${tone}`, icon(iconName)) : null,
      h('div.grow',
        h('h2#modal-title', title),
        description ? h('p', description) : null),
      h('button.btn.btn-ghost.btn-icon.btn-sm', { 'aria-label': 'Cerrar', onclick: () => ctx.close() }, icon('x'))),
    body ? h('div.modal-body', resolve(body)) : null,
    footer ? h('div.modal-foot', resolve(footer)) : null);

  append(dialog, panel);
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); ctx.close(); });
  dialog.addEventListener('mousedown', (e) => { if (e.target === dialog) ctx.close(); });
  append(document.body, dialog);
  dialog.showModal();
  nextFrame().then(() => dialog.classList.add('is-open'));
  return ctx;
}

/**
 * Confirmación con acción asíncrona. Si `typed` está definido, el usuario
 * debe escribir ese texto para habilitar el botón (acciones irreversibles).
 */
export function confirmDialog({ title, message, confirmLabel = 'Confirmar', tone = 'info', iconName, typed, onConfirm, extra }) {
  return new Promise((done) => {
    let confirmBtn;
    let typedInput;
    let result = false;
    const modal = openModal({
      title,
      description: message,
      iconName: iconName || (tone === 'danger' ? 'alert' : 'info'),
      tone,
      width: 460,
      onClose: () => done(result),
      body: (typed || extra) ? () => h('div.stack',
        extra || null,
        typed ? field({
          label: `Escriba ${typed} para confirmar`,
          input: typedInput = h('input.input.mono', {
            autocomplete: 'off', spellcheck: 'false',
            oninput: () => { confirmBtn.disabled = typedInput.value.trim() !== typed; },
          }),
        }) : null) : null,
      footer: ({ close }) => [
        button({ label: 'Cancelar', onClick: () => close() }),
        confirmBtn = button({
          label: confirmLabel,
          variant: tone === 'danger' ? 'danger' : 'primary',
          disabled: !!typed,
          onClick: async () => {
            if (!onConfirm) { result = true; close(); return; }
            setLoading(confirmBtn, true);
            try {
              result = (await onConfirm(typedInput?.value.trim())) ?? true;
              close();
            } catch (e) {
              toast.error('No se pudo completar', e.message);
              setLoading(confirmBtn, false);
            }
          },
        }),
      ],
    });
    if (typedInput) setTimeout(() => typedInput.focus(), 60);
    return modal;
  });
}
