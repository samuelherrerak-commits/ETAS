import { h, icon, fold, debounce, append, replace, clear } from '../../lib/dom.js';
import { api } from '../../api/client.js';
import { router } from '../../lib/router.js';
import { cedula as fmtCed, fecha, relativo, monto, plural, pct } from '../../lib/format.js';
import {
  pageHeader, loadSection, skeletonTable, button, setLoading, field, emptyState, badge, avatar,
  searchInput, segmented, tabs, statCard, textarea, table,
} from '../../ui/components.js';
import { openModal } from '../../ui/modal.js';
import { toast } from '../../ui/toast.js';

export function finanzasPage({ query }) {
  let tab = query.tab === 'reportes' ? 'reportes' : 'cuentas';
  const content = h('div');
  const statsEl = h('div');
  let tabsEl = h('div');

  function renderTabs(pendientes) {
    const t = tabs([
      { id: 'cuentas', label: 'Estado de cuenta', iconName: 'wallet' },
      { id: 'reportes', label: 'Reportes de pago', iconName: 'receipt', count: pendientes || null },
    ], tab, (id) => {
      tab = id;
      router.replaceSilently(`#/admin/finanzas${id === 'reportes' ? '?tab=reportes' : ''}`);
      show();
    });
    tabsEl.replaceWith(t);
    tabsEl = t;
  }

  // ─── Estado de cuenta ───────────────────────────────────────────────
  function cuentas() {
    let filtro = 'todos';
    let term = '';
    let rows = [];
    const list = h('div');
    const wrap = h('div');

    function stats() {
      const morosos = rows.filter((r) => r.estado_pago === 'moroso').length;
      replace(statsEl, h('div.grid.grid-3.enter-stagger',
        statCard({ label: 'Estudiantes', value: rows.length, iconName: 'users' }),
        statCard({ label: 'Solventes', value: rows.length - morosos, iconName: 'shield', hint: pct(rows.length ? Math.round(((rows.length - morosos) / rows.length) * 100) : 100) }),
        statCard({ label: 'Morosos', value: morosos, iconName: 'lock', tone: morosos ? 'red-600' : null, hint: 'Sin acceso a notas ni boletín' })));
    }

    function toggle(r, sw, labelEl) {
      const next = r.estado_pago === 'moroso' ? 'solvente' : 'moroso';
      const prev = r.estado_pago;
      r.estado_pago = next; // actualización optimista
      paint(sw, labelEl, next);
      stats();
      api.send('updatePaymentStatus', { estudiante_id: r.id, estado_pago: next })
        .then(() => toast.success(next === 'solvente' ? 'Marcado como solvente' : 'Marcado como moroso',
          next === 'solvente' ? `${r.nombre} recupera el acceso a sus notas.` : `${r.nombre} no podrá ver notas ni boletín.`))
        .catch((e) => {
          r.estado_pago = prev;
          paint(sw, labelEl, prev);
          stats();
          toast.error('No se pudo actualizar', e.message);
        });
    }

    function paint(sw, labelEl, estado) {
      sw.setAttribute('aria-checked', String(estado === 'solvente'));
      replace(labelEl, estado === 'solvente' ? badge('Solvente', 'green', { dot: true }) : badge('Moroso', 'red', { dot: true }));
    }

    function renderList() {
      const t = fold(term);
      const visible = rows.filter((r) => (filtro === 'todos' || r.estado_pago === filtro)
        && (!t || fold(`${r.nombre} ${r.cedula} ${r.representantes.join(' ')}`).includes(t)));
      replace(list, h('div.card',
        table({
          columns: [
            { label: 'Estudiante', render: (r) => h('div.row', { style: { '--gap': '12px' } }, avatar(r.nombre),
              h('div', h('div.cell-title', r.nombre), h('div.cell-sub', `${fmtCed(r.cedula)} · ${r.grado}`))) },
            { label: 'Representante', render: (r) => h('span.cell-sub', r.representantes.join(', ') || '—') },
            { label: 'Actualizado', render: (r) => h('span.cell-sub', { title: r.observaciones }, relativo(r.ultima_actualizacion) || '—') },
            { label: 'Estado', render: (r) => {
              const labelEl = h('span', { style: { minWidth: '84px', display: 'inline-block' } });
              const sw = h('button.switch', { type: 'button', role: 'switch', 'aria-label': `Solvencia de ${r.nombre}` });
              sw.addEventListener('click', () => toggle(r, sw, labelEl));
              paint(sw, labelEl, r.estado_pago);
              return h('div.row', { style: { '--gap': '12px' } }, sw, labelEl,
                r.reportes_pendientes ? h('a.badge.badge-amber', { href: '#/admin/finanzas?tab=reportes', title: 'Reporte de pago por validar' }, icon('clock'), String(r.reportes_pendientes)) : null);
            } },
          ],
          rows: visible,
          empty: emptyState({ iconName: 'search', title: 'Sin resultados', text: 'No hay estudiantes que coincidan con la búsqueda.' }),
        })));
    }

    loadSection(wrap, {
      skeleton: () => skeletonTable(8),
      fetch: () => api.get('listPayments', {}, { fresh: true }),
      render: (data) => {
        rows = data;
        stats();
        renderList();
        return h('div.stack',
          h('div.toolbar',
            searchInput({ placeholder: 'Buscar por nombre, cédula o representante', onInput: debounce((v) => { term = v; renderList(); }, 120) }),
            segmented([{ value: 'todos', label: 'Todos' }, { value: 'solvente', label: 'Solventes' }, { value: 'moroso', label: 'Morosos' }],
              filtro, (v) => { filtro = v; renderList(); }, { label: 'Filtrar por estado' })),
          list);
      },
    });
    return wrap;
  }

  // ─── Reportes de pago ───────────────────────────────────────────────
  function reportes() {
    let estado = 'pendiente';
    const wrap = h('div');
    const list = h('div');
    clear(statsEl);

    function rechazar(r, onDone) {
      const motivo = textarea({ placeholder: 'Ej. La referencia no aparece en el estado de cuenta bancario.', rows: 3 });
      const f = field({ label: 'Motivo del rechazo', input: motivo, help: 'El representante verá este mensaje.' });
      let btn;
      openModal({
        title: 'Rechazar reporte de pago', iconName: 'alert', tone: 'danger', width: 460,
        description: `Ref. ${r.referencia} · ${r.banco} · ${monto(r.monto)}`,
        body: f,
        footer: ({ close }) => [
          button({ label: 'Cancelar', onClick: () => close() }),
          btn = button({
            label: 'Rechazar', variant: 'danger',
            onClick: async () => {
              if (motivo.value.trim().length < 3) { f.setError('Indique el motivo.'); return; }
              setLoading(btn, true);
              try {
                await api.send('reviewPaymentReport', { id: r.id, decision: 'rechazado', observacion: motivo.value });
                toast.info('Reporte rechazado', r.estudiante?.nombre);
                close();
                onDone();
              } catch (e) { toast.error('No se pudo rechazar', e.message); setLoading(btn, false); }
            },
          }),
        ],
      });
    }

    function card(r) {
      let aprobar;
      const estadoBadge = { pendiente: badge('Por validar', 'amber', { dot: true }), aprobado: badge('Aprobado', 'green', { dot: true }), rechazado: badge('Rechazado', 'red', { dot: true }) }[r.estado];
      return h('article.card.enter',
        h('div.card-body.stack', { style: { '--gap': '14px' } },
          h('div.row-between',
            h('div', h('div.cell-title', r.estudiante?.nombre || '—'), h('div.cell-sub', r.estudiante?.grado)),
            estadoBadge),
          h('dl.kv',
            h('dt', 'Monto'), h('dd.num', monto(r.monto)),
            h('dt', 'Banco'), h('dd', r.banco),
            h('dt', 'Referencia'), h('dd.mono', r.referencia),
            h('dt', 'Fecha de pago'), h('dd', fecha(r.fecha_pago)),
            h('dt', 'Reportado por'), h('dd', r.representante?.nombre || '—', r.representante?.telefono ? h('span.cell-sub', ` · ${r.representante.telefono}`) : null)),
          r.observacion ? h('p.cell-sub', r.observacion) : null),
        r.estado === 'pendiente' ? h('div.card-footer.row', { style: { justifyContent: 'flex-end' } },
          button({ label: 'Rechazar', size: 'sm', onClick: () => rechazar(r, refresh) }),
          aprobar = button({
            label: 'Aprobar y marcar solvente', size: 'sm', variant: 'success', iconName: 'check',
            onClick: async () => {
              setLoading(aprobar, true);
              try {
                await api.send('reviewPaymentReport', { id: r.id, decision: 'aprobado' });
                toast.success('Pago validado', `${r.estudiante?.nombre} ahora está solvente.`);
                refresh();
              } catch (e) { toast.error('No se pudo aprobar', e.message); setLoading(aprobar, false); }
            },
          })) : h('div.card-footer.cell-sub', `Reportado ${relativo(r.creado)}`));
    }

    let load;
    function refresh() { load.reload(); }
    load = loadSection(list, {
      skeleton: () => h('div.grid.grid-auto', Array.from({ length: 3 }, () => h('div.card.card-pad', { style: { height: '220px' } }, h('div.skeleton.sk-title')))),
      fetch: () => api.get('listPaymentReports', { estado }, { fresh: true }),
      render: (items) => {
        if (estado === 'pendiente') renderTabs(items.length);
        return items.length
          ? h('div.grid.grid-auto.enter-stagger', items.map(card))
          : emptyState({
            iconName: 'receipt',
            title: estado === 'pendiente' ? 'No hay reportes por validar' : 'Sin reportes en esta categoría',
            text: estado === 'pendiente' ? 'Cuando un representante registre una transferencia aparecerá aquí.' : null,
          });
      },
    });

    append(wrap, h('div.stack',
      h('div.toolbar', segmented([
        { value: 'pendiente', label: 'Por validar' }, { value: 'aprobado', label: 'Aprobados' }, { value: 'rechazado', label: 'Rechazados' },
      ], estado, (v) => { estado = v; load.reload({ silent: false }); }, { label: 'Estado del reporte' })),
      list));
    return wrap;
  }

  function show() {
    replace(content, tab === 'cuentas' ? cuentas() : reportes());
  }

  api.get('listPaymentReports', { estado: 'pendiente' }).then((r) => renderTabs(r.length)).catch(() => renderTabs(0));
  show();

  return h('div.stack', { style: { '--gap': '20px' } },
    pageHeader({
      eyebrow: 'Administración',
      title: 'Finanzas',
      subtitle: 'Solvencia de los estudiantes y validación de pagos reportados. Un estudiante moroso no puede consultar notas ni boletín.',
    }),
    statsEl,
    tabsEl,
    content);
}
