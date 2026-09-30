import { h, icon, replace } from '../../lib/dom.js';
import { api } from '../../api/client.js';
import { store } from '../../lib/store.js';
import { LAPSO_LABEL, fecha } from '../../lib/format.js';
import {
  pageHeader, loadSection, skeletonLines, button, setLoading, field, input, callout, segmented, switchEl, badge, table, emptyState,
} from '../../ui/components.js';
import { confirmDialog } from '../../ui/modal.js';
import { toast } from '../../ui/toast.js';

/** Gestión del año escolar. Admin: todo. Coordinación: abrir/cerrar carga. */
export function periodoPage() {
  const isAdmin = store.user.rol === 'admin';
  const main = h('div');

  function periodCard(p) {
    const cargaSwitch = switchEl({
      checked: p.carga_abierta, size: 'lg', label: 'Carga de notas abierta',
      onChange: async (v) => {
        try {
          const upd = await api.send('setCargaAbierta', { abierta: v });
          store.patchSession({ periodo: upd });
          toast.success(v ? 'Carga de notas abierta' : 'Carga de notas cerrada',
            v ? `Los docentes pueden editar el ${LAPSO_LABEL[upd.lapso_activo]}.` : 'Las planillas quedan en solo lectura.');
          render(upd);
        } catch (e) {
          cargaSwitch.set(!v);
          toast.error('No se pudo actualizar', e.message);
        }
      },
    });

    const lapsoCtl = segmented([1, 2, 3].map((l) => ({ value: l, label: LAPSO_LABEL[l] })), p.lapso_activo, async (l) => {
      const ok = await confirmDialog({
        title: `Activar el ${LAPSO_LABEL[l]}`,
        message: `Los docentes cargarán planes y notas en el ${LAPSO_LABEL[l]}. El ${LAPSO_LABEL[p.lapso_activo]} quedará en solo lectura.`,
        confirmLabel: 'Activar lapso',
        onConfirm: async () => {
          const upd = await api.send('setLapso', { lapso: l });
          store.patchSession({ periodo: upd });
          toast.success(`${LAPSO_LABEL[l]} activo`);
          render(upd);
        },
      });
      if (!ok) lapsoCtl.setValue(p.lapso_activo);
    }, { label: 'Lapso activo' });
    if (!isAdmin) lapsoCtl.querySelectorAll('button').forEach((b) => { b.disabled = true; });

    return h('section.card.enter',
      h('div.card-header',
        h('div', h('div.eyebrow', 'Año escolar activo'), h('h2', { style: { fontSize: 'var(--text-xl)', marginTop: '4px' } }, p.nombre)),
        p.promocion_ejecutada ? badge('Promoción ejecutada', 'navy') : badge('En curso', 'green', { dot: true })),
      h('div.card-body.stack', { style: { '--gap': '24px' } },
        h('div.row-between.wrap',
          h('div', h('div.label', 'Lapso activo'), h('div.field-help', 'Las notas y planes se cargan sobre este lapso.')),
          lapsoCtl),
        h('div.row-between',
          h('div', h('div.label', 'Carga de notas'),
            h('div.field-help', p.carga_abierta
              ? 'Abierta: los docentes pueden editar planes, notas y asistencia del lapso activo.'
              : 'Cerrada: las planillas de los docentes están en solo lectura.')),
          cargaSwitch)));
  }

  function institucionCard() {
    const inst = store.institucion;
    const keys = [
      ['nombre', 'Nombre del plantel'], ['codigo_dea', 'Código DEA'], ['rif', 'RIF'], ['director', 'Director(a)'],
      ['telefono', 'Teléfono'], ['email', 'Correo de administración'], ['direccion', 'Dirección'], ['ciudad', 'Ciudad'],
    ];
    const inputs = Object.fromEntries(keys.map(([k]) => [k, input({ value: inst[k] || '' })]));
    let save;
    return h('section.card.enter',
      h('div.card-header', h('div', h('h2', 'Datos institucionales'), h('p.cell-sub', 'Aparecen en el membrete del boletín y en los avisos de solvencia.'))),
      h('form.card-body', { onsubmit: (e) => { e.preventDefault(); save.click(); } },
        h('div.grid.grid-2', keys.map(([k, label]) => field({ label, input: inputs[k] })))),
      h('div.card-footer.row', { style: { justifyContent: 'flex-end' } },
        save = button({
          label: 'Guardar datos', variant: 'primary', iconName: 'save',
          onClick: async () => {
            setLoading(save, true);
            try {
              const cfg = await api.send('updateInstitucion', Object.fromEntries(keys.map(([k]) => [k, inputs[k].value])));
              store.patchSession({ institucion: cfg });
              toast.success('Datos institucionales actualizados');
            } catch (e) { toast.error('No se pudo guardar', e.message); }
            setLoading(save, false);
          },
        })));
  }

  function nuevoPeriodoCard(p, periodos) {
    const [a, b] = p.nombre.split('-').map(Number);
    const nombre = input({ value: `${a + 1}-${b + 1}`, class: 'mono', style: { maxWidth: '200px' } });
    let btn;
    return h('section.card.enter',
      h('div.card-header', h('div', h('h2', 'Nuevo año escolar'), h('p.cell-sub', 'Cierra el año actual y abre el siguiente en el 1er lapso.'))),
      h('div.card-body.stack',
        p.promocion_ejecutada
          ? callout('success', 'checkCircle', 'La promoción del año actual ya se ejecutó. Puede abrir el nuevo año escolar.')
          : callout('warn', 'alert', h('span', 'Antes de abrir un año nuevo debe ejecutar el ', h('a', { href: '#/admin/cierre', style: { textDecoration: 'underline' } }, 'cierre académico'), ' del año en curso.')),
        h('div.row.wrap', { style: { '--gap': '10px', alignItems: 'flex-end' } },
          field({ label: 'Año escolar', input: nombre }),
          btn = button({
            label: 'Abrir año escolar', variant: 'dark', iconName: 'calendar', disabled: !p.promocion_ejecutada,
            onClick: () => confirmDialog({
              title: `Abrir el año escolar ${nombre.value}`,
              message: `El año ${p.nombre} pasará a estado cerrado y quedará solo como histórico.`,
              confirmLabel: 'Abrir año', tone: 'danger',
              onConfirm: async () => {
                const nuevo = await api.send('openNewPeriod', { nombre: nombre.value.trim() });
                store.patchSession({ periodo: nuevo });
                toast.success(`Año escolar ${nuevo.nombre} abierto`);
                load.reload();
              },
            }),
          })),
        periodos.length > 1 ? table({
          columns: [
            { label: 'Año escolar', render: (x) => h('span.cell-title', x.nombre) },
            { label: 'Estado', render: (x) => (x.estado === 'activo' ? badge('Activo', 'green', { dot: true }) : badge('Cerrado')) },
            { label: 'Creado', render: (x) => h('span.cell-sub', fecha(x.creado)) },
          ],
          rows: periodos,
        }) : null));
  }

  let lastPeriodos = [];
  function build(p, periodos = lastPeriodos) {
    lastPeriodos = periodos.map((x) => (x.id === p.id ? p : x));
    return h('div.stack', { style: { '--gap': '20px' } },
      periodCard(p),
      isAdmin ? nuevoPeriodoCard(p, lastPeriodos) : null,
      isAdmin ? institucionCard() : null);
  }
  function render(p) { replace(main, build(p)); }

  const load = loadSection(main, {
    skeleton: () => h('div.card.card-body', skeletonLines(5)),
    fetch: async (o) => {
      if (!isAdmin) {
        const s = await api.get('session', {}, { fresh: true });
        store.setSession(s);
        return { p: s.periodo, periodos: [] };
      }
      const periodos = await api.get('getPeriodos', {}, o);
      return { p: periodos.find((x) => x.estado === 'activo'), periodos };
    },
    render: ({ p, periodos }) => (p ? build(p, periodos) : emptyState({ iconName: 'calendar', title: 'No hay año escolar activo' })),
  });

  return h('div.stack', { style: { '--gap': '24px' } },
    pageHeader({
      eyebrow: isAdmin ? 'Administración' : 'Coordinación',
      title: isAdmin ? 'Año escolar' : 'Carga de notas',
      subtitle: 'Lapsos académicos y apertura de la carga de calificaciones.',
    }),
    main);
}
