import { h, icon, replace } from '../../lib/dom.js';
import { api } from '../../api/client.js';
import { ROL_LABEL, fecha } from '../../lib/format.js';
import {
  pageHeader, loadSection, skeletonLines, button, setLoading, field, input, textarea, emptyState, badge, noticeItem,
} from '../../ui/components.js';
import { openModal, confirmDialog } from '../../ui/modal.js';
import { toast } from '../../ui/toast.js';

const DESTINOS = ['profesor', 'estudiante', 'representante', 'coordinador'];

export function avisosAdminPage() {
  const content = h('div');

  function avisoModal(a) {
    const titulo = input({ value: a?.titulo || '', maxlength: 120, placeholder: 'Ej. Reunión de representantes' });
    const contenido = textarea({ value: a?.contenido || '', rows: 5, maxlength: 2000 });
    const destinos = new Set(a?.roles_destino || ['profesor', 'estudiante', 'representante']);
    let importante = a?.prioridad === 'importante';
    const chips = h('div.chip-select');
    const drawChips = () => replace(chips, ...DESTINOS.map((r) => h('button.chip', {
      type: 'button', 'aria-pressed': String(destinos.has(r)),
      onclick: () => { destinos.has(r) ? destinos.delete(r) : destinos.add(r); drawChips(); },
    }, destinos.has(r) ? icon('check') : null, ROL_LABEL[r])));
    drawChips();
    const prio = h('label.check', h('input', { type: 'checkbox', checked: importante, onchange: (e) => { importante = e.target.checked; } }), 'Marcar como importante');
    const fT = field({ label: 'Título', input: titulo });
    const fC = field({ label: 'Mensaje', input: contenido });
    let save;
    openModal({
      title: a ? 'Editar aviso' : 'Nuevo aviso', iconName: 'megaphone', width: 560,
      body: h('div.stack', fT, fC, h('div.field', h('div.label', 'Destinatarios'), chips), prio),
      footer: ({ close }) => [
        button({ label: 'Cancelar', onClick: () => close() }),
        save = button({
          label: a ? 'Guardar' : 'Publicar', variant: 'primary', iconName: a ? 'save' : 'send',
          onClick: async () => {
            fT.setError(titulo.value.trim().length < 3 ? 'Escriba un título.' : null);
            fC.setError(contenido.value.trim().length < 3 ? 'Escriba el mensaje.' : null);
            if (titulo.value.trim().length < 3 || contenido.value.trim().length < 3) return;
            if (!destinos.size) { toast.error('Seleccione al menos un destinatario'); return; }
            setLoading(save, true);
            try {
              await api.send('saveAviso', { id: a?.id, titulo: titulo.value, contenido: contenido.value, roles_destino: [...destinos], prioridad: importante ? 'importante' : 'normal' });
              toast.success(a ? 'Aviso actualizado' : 'Aviso publicado');
              close();
              load.reload();
            } catch (e) { toast.error('No se pudo guardar', e.message); setLoading(save, false); }
          },
        }),
      ],
    });
    setTimeout(() => titulo.focus(), 60);
  }

  const load = loadSection(content, {
    skeleton: () => h('div.card.card-body', skeletonLines(6)),
    fetch: () => api.get('getAvisos'),
    render: (list) => (list.length
      ? h('div.card', list.map((a) => h('div.row', { style: { alignItems: 'flex-start', '--gap': '0' } },
        h('div.grow', noticeItem(a)),
        h('div.row', { style: { padding: '14px 16px 0 0', '--gap': '4px' } },
          h('div.row.wrap', { style: { '--gap': '4px', justifyContent: 'flex-end', maxWidth: '240px' } }, a.roles_destino.map((r) => badge(ROL_LABEL[r]))),
          button({ iconName: 'pencil', variant: 'ghost', size: 'sm', title: 'Editar', onClick: () => avisoModal(a) }),
          button({
            iconName: 'trash', variant: 'ghost', size: 'sm', title: 'Eliminar',
            onClick: () => confirmDialog({
              title: 'Eliminar aviso', message: `“${a.titulo}” dejará de mostrarse a todos los destinatarios.`, tone: 'danger', confirmLabel: 'Eliminar',
              onConfirm: async () => { await api.send('deleteAviso', { id: a.id }); toast.success('Aviso eliminado'); load.reload(); },
            }),
          })))))
      : emptyState({ iconName: 'megaphone', title: 'Sin avisos', text: 'Publique comunicados para docentes, estudiantes y representantes.', action: button({ label: 'Nuevo aviso', variant: 'primary', iconName: 'plus', onClick: () => avisoModal(null) }) })),
  });

  return h('div.stack', { style: { '--gap': '24px' } },
    pageHeader({
      eyebrow: 'Comunicación',
      title: 'Cartelera informativa',
      subtitle: 'Avisos generales segmentados por perfil.',
      actions: [button({ label: 'Nuevo aviso', variant: 'primary', iconName: 'plus', onClick: () => avisoModal(null) })],
    }),
    content);
}

export function avisosFeedPage() {
  const content = h('div');
  loadSection(content, {
    skeleton: () => h('div.card.card-body', skeletonLines(6)),
    fetch: () => api.get('getAvisos'),
    render: (list) => (list.length
      ? h('div.card', list.map(noticeItem))
      : emptyState({ iconName: 'megaphone', title: 'No hay avisos por ahora', text: 'Los comunicados de la coordinación aparecerán aquí.' })),
  });
  return h('div.stack', { style: { '--gap': '24px' } },
    pageHeader({ eyebrow: 'Comunicación', title: 'Avisos', subtitle: 'Comunicados de la coordinación y la dirección.' }),
    content);
}

/** Bloque compacto de avisos para los paneles de inicio. */
export function avisosWidget(limit = 3) {
  const body = h('div');
  loadSection(body, {
    skeleton: () => h('div.card-body', skeletonLines(3)),
    fetch: () => api.get('getAvisos'),
    render: (list) => (list.length ? h('div', list.slice(0, limit).map(noticeItem)) : h('div.card-body.cell-sub', 'Sin avisos recientes.')),
  });
  return h('section.card',
    h('div.card-header', h('h2', 'Avisos'), h('a.btn.btn-sm.btn-ghost', { href: '#/novedades' }, 'Ver todos')),
    body);
}
