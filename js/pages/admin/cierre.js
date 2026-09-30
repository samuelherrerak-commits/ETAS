import { h, icon, replace } from '../../lib/dom.js';
import { api } from '../../api/client.js';
import { store } from '../../lib/store.js';
import { LAPSO_LABEL, nota, cedula as fmtCed, plural } from '../../lib/format.js';
import {
  pageHeader, loadSection, skeletonTable, button, emptyState, badge, callout, segmented, table, gradePill, statCard,
} from '../../ui/components.js';
import { confirmDialog } from '../../ui/modal.js';
import { toast } from '../../ui/toast.js';

const RESULTADO = {
  promovido: { label: 'Promovido', tone: 'green' },
  materia_pendiente: { label: 'Materia pendiente', tone: 'amber' },
  repitiente: { label: 'Repitiente', tone: 'red' },
  egresado: { label: 'Egresado', tone: 'navy' },
  pendiente_egreso: { label: 'Egreso pendiente', tone: 'amber' },
  sin_grado_destino: { label: 'Sin grado destino', tone: 'red' },
};

export function cierrePage() {
  const content = h('div');
  let filtro = 'todos';

  function checklist(p) {
    const items = [
      [p.lapso_activo === 3, `El año escolar está en el 3er lapso (actual: ${LAPSO_LABEL[p.lapso_activo]}).`],
      [!p.carga_abierta, 'La carga de notas del 3er lapso está cerrada.'],
      [!p.promocion_ejecutada, 'La promoción de este año aún no se ha ejecutado.'],
    ];
    return h('section.card',
      h('div.card-header', h('h2', 'Requisitos para ejecutar')),
      h('ul.card-body.stack', { style: { '--gap': '10px', listStyle: 'none', margin: 0 } },
        items.map(([ok, text]) => h('li.row', { style: { '--gap': '10px', color: ok ? 'var(--text)' : 'var(--text-muted)' } },
          h('span', { style: { color: ok ? 'var(--green-600)' : 'var(--amber-600)', display: 'inline-flex' } }, icon(ok ? 'checkCircle' : 'clock')),
          text))),
      h('div.card-footer.cell-sub', 'Ajuste el lapso y la carga desde ', h('a', { href: '#/admin/periodo', style: { textDecoration: 'underline' } }, 'Año escolar'), '.'));
  }

  function render(d) {
    const p = d.periodo;
    const ready = p.lapso_activo === 3 && !p.carga_abierta && !p.promocion_ejecutada;
    const r = d.resumen;
    const tbl = h('div');

    const drawTable = () => {
      const rows = d.filas.filter((f) => filtro === 'todos' || f.resultado === filtro || (filtro === 'revision' && f.aplazadas.length));
      replace(tbl, h('div.card', table({
        columns: [
          { label: 'Estudiante', render: (f) => h('div', h('div.cell-title', f.nombre), h('div.cell-sub', fmtCed(f.cedula))) },
          { label: 'Movimiento', render: (f) => h('div.row', { style: { '--gap': '6px', whiteSpace: 'nowrap' } },
            h('span', f.grado_origen.nombre), icon('arrowRight', 'subtle'),
            h('span.cell-title', f.resultado === 'egresado' ? 'Egresa' : f.grado_destino?.nombre)) },
          { label: 'Promedio', className: 'col-center', render: (f) => gradePill(f.promedio) },
          { label: 'Aplazadas', render: (f) => (f.aplazadas.length
            ? h('div.cell-sub', f.aplazadas.map((a) => `${a.materia} (${a.motivo === 'inasistencia' ? 'inasistencia' : nota(a.definitiva)})`).join(', '))
            : h('span.subtle', 'Ninguna')) },
          { label: 'Resultado', render: (f) => h('div.row', { style: { '--gap': '6px' } },
            badge(RESULTADO[f.resultado].label, RESULTADO[f.resultado].tone, { dot: true }),
            f.incompletas ? h('span', { title: `${f.incompletas} materia(s) sin los tres lapsos completos` }, badge('Datos incompletos', '', { iconName: 'alert' })) : null) },
        ],
        rows,
        empty: emptyState({ iconName: 'search', title: 'Sin estudiantes en esta categoría' }),
      })));
    };
    drawTable();

    return h('div.stack', { style: { '--gap': '20px' } },
      p.promocion_ejecutada
        ? callout('success', 'checkCircle', h('span', h('strong', 'La promoción ya fue ejecutada. '), 'Los estudiantes fueron movidos a su nuevo grado. Abra el siguiente año escolar desde ', h('a', { href: '#/admin/periodo', style: { textDecoration: 'underline' } }, 'Año escolar'), '.'))
        : checklist(p),
      h('div.grid.grid-4.enter-stagger',
        statCard({ label: 'Promovidos', value: r.promovido, iconName: 'trendingUp' }),
        statCard({ label: 'Con materia pendiente', value: r.materia_pendiente + r.pendiente_egreso, iconName: 'clock' }),
        statCard({ label: 'Repitientes', value: r.repitiente, iconName: 'undo', tone: r.repitiente ? 'red-600' : null }),
        statCard({ label: 'Egresados', value: r.egresado, iconName: 'cap' })),
      r.incompletos ? callout('warn', 'alert', h('span', h('strong', `${plural(r.incompletos, 'estudiante tiene', 'estudiantes tienen')} datos incompletos. `),
        'Las definitivas se calcularon con los lapsos disponibles. Verifique que los docentes hayan cargado todas las notas antes de ejecutar.')) : null,
      h('div.row-between.wrap',
        segmented([
          { value: 'todos', label: `Todos (${r.total})` },
          { value: 'revision', label: 'Casos de revisión' },
          { value: 'promovido', label: 'Promovidos' },
          { value: 'repitiente', label: 'Repitientes' },
        ], filtro, (v) => { filtro = v; drawTable(); }, { label: 'Filtrar resultados' }),
        p.promocion_ejecutada ? null : button({
          label: 'Ejecutar promoción', variant: 'danger', iconName: 'flag', disabled: !ready,
          title: ready ? null : 'Complete los requisitos primero',
          onClick: () => confirmDialog({
            title: 'Ejecutar promoción de año',
            message: `Se actualizará el grado de ${r.promovido + r.materia_pendiente} estudiantes, ${r.egresado} egresarán y ${r.repitiente} permanecerán en su grado. Esta acción no se puede deshacer.`,
            tone: 'danger', iconName: 'alert', confirmLabel: 'Ejecutar promoción', typed: 'PROMOVER',
            onConfirm: async (conf) => {
              const res = await api.send('executePromotion', { confirmacion: conf });
              const s = await api.get('session', {}, { fresh: true });
              store.setSession(s);
              toast.success('Promoción ejecutada', `${res.procesados} estudiantes procesados.`);
              load.reload();
            },
          }),
        })),
      tbl);
  }

  const load = loadSection(content, {
    skeleton: () => skeletonTable(8),
    fetch: () => api.get('previewPromotion', {}, { fresh: true }),
    render,
  });

  return h('div.stack', { style: { '--gap': '24px' } },
    pageHeader({
      eyebrow: 'Administración',
      title: 'Cierre académico',
      subtitle: 'Promoción de año: definitiva ≥ 10 en todas las materias → promovido; 1 o 2 aplazadas → materia pendiente; 3 o más → repitiente. Más de 25 % de inasistencias aplaza la materia.',
    }),
    content);
}
