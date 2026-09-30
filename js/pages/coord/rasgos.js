import { h, append, replace } from '../../lib/dom.js';
import { api } from '../../api/client.js';
import { router } from '../../lib/router.js';
import { store } from '../../lib/store.js';
import { LAPSO_LABEL, plural } from '../../lib/format.js';
import {
  pageHeader, loadSection, skeletonTable, segmented, select, emptyState, button, setLoading, callout,
} from '../../ui/components.js';
import { toast } from '../../ui/toast.js';

/** Evaluación cualitativa (A–D) de los rasgos de personalidad para el boletín. */
export function rasgosPage({ query }) {
  let gradoId = query.grado || null;
  let lapso = Number(query.lapso) || store.periodo?.lapso_activo || 1;
  const content = h('div');
  const controls = h('div.toolbar');

  function render(d) {
    const cambios = new Map();
    let saveBtn;
    const escala = Object.entries(d.escala);
    const opts = [{ value: '', label: '—' }, ...escala.map(([k, v]) => ({ value: k, label: `${k} · ${v}` }))];

    const refresh = () => {
      saveBtn.disabled = !cambios.size;
      content.dataset.dirty = String(cambios.size > 0);
      if (cambios.size) router.setGuard(() => 'Hay rasgos de personalidad sin guardar.');
      else router.clearGuard();
    };

    const rows = d.estudiantes.map((e) => h('tr',
      h('td', h('span.cell-title', e.nombre)),
      d.rasgos.map((r) => {
        const s = select(opts, { value: e.valores[r] || '', class: 'select-sm', 'aria-label': `${r} de ${e.nombre}`, disabled: !d.editable, style: { minWidth: '118px' } });
        s.addEventListener('change', () => {
          const k = `${e.id}|${r}`;
          if ((e.valores[r] || '') === s.value) cambios.delete(k); else cambios.set(k, { estudiante_id: e.id, rasgo: r, valor: s.value });
          refresh();
        });
        return h('td', s);
      })));

    const node = h('section.card.enter',
      h('div.card-header',
        h('div', h('h2', `${d.grado.nombre} · ${LAPSO_LABEL[d.lapso]}`), h('p.cell-sub', `Escala: ${escala.map(([k, v]) => `${k} = ${v}`).join(' · ')}`)),
        saveBtn = button({
          label: 'Guardar rasgos', variant: 'primary', iconName: 'save', size: 'sm', disabled: true,
          onClick: async () => {
            setLoading(saveBtn, true);
            try {
              const next = await api.send('saveTraits', { grado_id: d.grado.id, lapso: d.lapso, valores: [...cambios.values()] });
              toast.success('Rasgos guardados', `${plural(cambios.size, 'valoración', 'valoraciones')} actualizadas.`);
              router.clearGuard();
              replace(content, render(next));
            } catch (e) { toast.error('No se pudo guardar', e.message); setLoading(saveBtn, false); }
          },
        })),
      d.estudiantes.length
        ? h('div.table-wrap', h('table.table.matrix',
          h('thead', h('tr', h('th', 'Estudiante'), d.rasgos.map((r) => h('th', r)))),
          h('tbody', rows)))
        : emptyState({ iconName: 'users', title: 'Sin estudiantes en este grado' }));
    return node;
  }

  function load() {
    router.clearGuard();
    router.replaceSilently(`#/academico/rasgos?grado=${gradoId}&lapso=${lapso}`);
    loadSection(content, {
      skeleton: () => skeletonTable(8),
      fetch: () => api.get('getTraits', { grado_id: gradoId, lapso }, { fresh: true }),
      render,
    });
  }

  api.get('getEstructura').then((e) => {
    if (!e.grados.length) { replace(content, emptyState({ iconName: 'layers', title: 'Sin grados configurados' })); return; }
    if (!e.grados.find((g) => g.id === gradoId)) gradoId = e.grados[0].id;
    const gSel = select(e.grados.map((g) => ({ value: g.id, label: `${g.nombre}${g.seccion ? ` “${g.seccion}”` : ''}` })), { value: gradoId, 'aria-label': 'Grado', style: { width: '200px' } });
    gSel.addEventListener('change', () => { gradoId = gSel.value; load(); });
    replace(controls, gSel, segmented([1, 2, 3].map((l) => ({ value: l, label: LAPSO_LABEL[l] })), lapso, (v) => { lapso = v; load(); }, { label: 'Lapso' }));
    load();
  });

  append(content, skeletonTable(8));
  return h('div.stack', { style: { '--gap': '24px' } },
    pageHeader({ eyebrow: 'Académico', title: 'Rasgos de personalidad', subtitle: 'Valoración cualitativa que se imprime en el boletín de cada lapso.' }),
    callout('info', 'info', 'Los cambios de grado o lapso descartan las valoraciones no guardadas.'),
    controls,
    content);
}
