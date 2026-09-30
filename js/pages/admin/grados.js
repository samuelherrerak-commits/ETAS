import { h, icon, replace } from '../../lib/dom.js';
import { api } from '../../api/client.js';
import { router } from '../../lib/router.js';
import { plural } from '../../lib/format.js';
import {
  pageHeader, loadSection, skeletonTable, button, setLoading, field, input, select, emptyState, badge, avatar,
} from '../../ui/components.js';
import { openModal, confirmDialog } from '../../ui/modal.js';
import { toast } from '../../ui/toast.js';

export function gradosPage({ query }) {
  let selected = query.grado || null;
  let data = null;
  const body = h('div');

  function gradoModal(g) {
    const nombre = input({ value: g?.nombre || '', placeholder: 'Ej. 1er Año' });
    const orden = input({ type: 'number', min: 1, max: 12, value: g?.orden || (data.grados.length + 1) });
    const seccion = input({ value: g?.seccion ?? 'A', maxlength: 2, style: { textTransform: 'uppercase' } });
    let save;
    openModal({
      title: g ? 'Editar grado' : 'Nuevo grado', iconName: 'layers', width: 440,
      body: h('form.stack', { onsubmit: (e) => { e.preventDefault(); save.click(); } },
        field({ label: 'Nombre', input: nombre }),
        h('div.grid.grid-2',
          field({ label: 'Orden', input: orden, help: 'Define la promoción: 1 → 2 → … → 6.' }),
          field({ label: 'Sección', input: seccion }))),
      footer: ({ close }) => [
        button({ label: 'Cancelar', onClick: () => close() }),
        save = button({
          label: 'Guardar', variant: 'primary',
          onClick: async () => {
            setLoading(save, true);
            try {
              data = await api.send('saveGrado', { id: g?.id, nombre: nombre.value, orden: Number(orden.value), seccion: seccion.value });
              if (!g) selected = data.grados.find((x) => x.nombre === nombre.value.trim())?.id || selected;
              toast.success(g ? 'Grado actualizado' : 'Grado creado');
              close();
              render();
            } catch (e) { toast.error('No se pudo guardar', e.message); setLoading(save, false); }
          },
        }),
      ],
    });
    setTimeout(() => nombre.focus(), 60);
  }

  function materiasCard(g) {
    const profOptions = [{ value: '', label: 'Sin docente asignado' }, ...data.profesores.map((p) => ({ value: p.id, label: p.nombre }))];
    const nueva = input({ placeholder: 'Nombre de la materia', 'aria-label': 'Nombre de la nueva materia' });
    const nuevaProf = select(profOptions, { 'aria-label': 'Docente de la nueva materia' });
    let addBtn;

    async function add() {
      if (nueva.value.trim().length < 3) { nueva.setAttribute('aria-invalid', 'true'); nueva.focus(); return; }
      setLoading(addBtn, true);
      try {
        data = await api.send('saveMateria', { nombre: nueva.value, grado_id: g.id, profesor_id: nuevaProf.value });
        toast.success('Materia agregada', `${nueva.value.trim()} · ${g.nombre}`);
        render();
      } catch (e) { toast.error('No se pudo agregar', e.message); setLoading(addBtn, false); }
    }

    const rows = g.materias.map((m) => {
      const sel = select(profOptions, { value: m.profesor_id, class: 'select-sm', 'aria-label': `Docente de ${m.nombre}` });
      sel.addEventListener('change', async () => {
        sel.disabled = true;
        try {
          data = await api.send('saveMateria', { id: m.id, nombre: m.nombre, grado_id: g.id, profesor_id: sel.value });
          m.profesor_id = sel.value;
          const prof = data.profesores.find((p) => p.id === sel.value);
          toast.success('Docente asignado', `${m.nombre} · ${g.nombre} → ${prof ? prof.nombre : 'sin docente'}`);
        } catch (e) { sel.value = m.profesor_id; toast.error('No se pudo asignar', e.message); }
        sel.disabled = false;
      });
      return h('tr',
        h('td', h('span.cell-title', m.nombre)),
        h('td', { style: { minWidth: '220px' } }, sel),
        h('td.col-actions', button({
          iconName: 'trash', variant: 'ghost', size: 'sm', title: `Eliminar ${m.nombre}`,
          onClick: () => confirmDialog({
            title: `Eliminar ${m.nombre}`, tone: 'danger', confirmLabel: 'Eliminar',
            message: 'Solo es posible si la materia aún no tiene evaluaciones registradas.',
            onConfirm: async () => { data = await api.send('deleteMateria', { id: m.id }); toast.success('Materia eliminada'); render(); },
          }),
        })));
    });

    return h('section.card.enter',
      h('div.card-header',
        h('div', h('h2', `${g.nombre}${g.seccion ? ` “${g.seccion}”` : ''}`),
          h('p.cell-sub', `${plural(g.materias.length, 'materia', 'materias')} · ${plural(g.estudiantes, 'estudiante', 'estudiantes')}`)),
        h('div.row',
          button({ iconName: 'pencil', size: 'sm', title: 'Editar grado', onClick: () => gradoModal(g) }),
          button({
            iconName: 'trash', size: 'sm', title: 'Eliminar grado',
            onClick: () => confirmDialog({
              title: `Eliminar ${g.nombre}`, tone: 'danger', confirmLabel: 'Eliminar',
              message: 'Solo es posible si no tiene estudiantes inscritos ni materias.',
              onConfirm: async () => { data = await api.send('deleteGrado', { id: g.id }); selected = null; toast.success('Grado eliminado'); render(); },
            }),
          }))),
      g.materias.length
        ? h('div.table-wrap', h('table.table',
          h('thead', h('tr', h('th', 'Materia'), h('th', 'Docente'), h('th.col-actions', h('span.sr-only', 'Acciones')))),
          h('tbody', rows)))
        : emptyState({ iconName: 'book', title: 'Sin materias', text: 'Agregue las materias del plan de estudios de este grado.' }),
      h('form.card-footer', { onsubmit: (e) => { e.preventDefault(); add(); } },
        h('div.row.wrap', { style: { '--gap': '10px' } },
          h('div.grow', { style: { minWidth: '200px' } }, nueva),
          h('div', { style: { minWidth: '220px' } }, nuevaProf),
          addBtn = button({ label: 'Agregar materia', iconName: 'plus', variant: 'dark', type: 'submit' }))));
  }

  function render() {
    if (!data.grados.find((g) => g.id === selected)) selected = data.grados[0]?.id || null;
    const g = data.grados.find((x) => x.id === selected);
    replace(body, h('div.split',
      h('aside.card',
        h('div.list-nav', data.grados.map((x) => h('button.list-nav-item', {
          'aria-current': String(x.id === selected),
          onclick: () => { selected = x.id; router.replaceSilently(`#/admin/grados?grado=${x.id}`); render(); },
        },
        h('div', h('div.cell-title', `${x.nombre}${x.seccion ? ` “${x.seccion}”` : ''}`), h('div.cell-sub', `${plural(x.estudiantes, 'estudiante', 'estudiantes')}`)),
        h('span.badge', String(x.materias.length))))),
        h('div.card-footer', button({ label: 'Nuevo grado', iconName: 'plus', block: true, onClick: () => gradoModal(null) }))),
      g ? materiasCard(g) : emptyState({ iconName: 'layers', title: 'Aún no hay grados', text: 'Cree el primer grado para asignar materias y docentes.' })));
    return body;
  }

  const wrap = h('div');
  loadSection(wrap, {
    skeleton: () => skeletonTable(6),
    fetch: () => api.get('getEstructura'),
    render: (d) => { data = d; return render(); },
  });

  return h('div.stack', { style: { '--gap': '24px' } },
    pageHeader({
      eyebrow: 'Administración',
      title: 'Grados y materias',
      subtitle: 'Cada materia pertenece a un grado y a un docente. Los estudiantes del grado forman su lista de clase.',
    }),
    wrap);
}
