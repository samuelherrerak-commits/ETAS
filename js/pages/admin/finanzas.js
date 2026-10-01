import { h, icon, fold, debounce, append, replace, clear } from '../../lib/dom.js';
import { api } from '../../api/client.js';
import { router } from '../../lib/router.js';
import { cedula as fmtCed, fecha, relativo, monto, plural, pct } from '../../lib/format.js';
import {
  pageHeader, loadSection, skeletonTable, button, setLoading, field, emptyState, badge, avatar,
  searchInput, segmented, tabs, statCard, textarea, table, pagoBadge, switchEl,
} from '../../ui/components.js';
import { store } from '../../lib/store.js';
import { mesesGrid, cuentaResumen, historialPagos } from '../shared/cuenta.js';
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
      const morosos = rows.filter((r) => r.estado_pago === 'moroso');
      const deuda = morosos.reduce((s, r) => s + r.deuda, 0);
      replace(statsEl, h('div.grid.grid-4.enter-stagger',
        statCard({ label: 'Estudiantes', value: rows.length, iconName: 'users' }),
        statCard({ label: 'Solventes', value: rows.length - morosos.length, iconName: 'shield', hint: pct(rows.length ? Math.round(((rows.length - morosos.length) / rows.length) * 100) : 100) }),
        statCard({ label: 'Insolventes', value: morosos.length, iconName: 'lock', tone: morosos.length ? 'red-600' : null, hint: 'Sin acceso a notas ni boletín' }),
        statCard({ label: 'Por cobrar (vencido)', value: monto(deuda), iconName: 'wallet', hint: `${store.institucion.moneda || ''} · ${plural(morosos.reduce((s, r) => s + r.vencidos.length, 0), 'mes', 'meses')}` })));
    }

    function renderList() {
      const t = fold(term);
      const visible = rows.filter((r) => (filtro === 'todos' || r.estado_pago === filtro || (filtro === 'exonerado' && r.condicion === 'exonerado'))
        && (!t || fold(`${r.nombre} ${r.cedula} ${r.representantes.join(' ')}`).includes(t)));
      replace(list, h('div.card',
        table({
          columns: [
            { label: 'Estudiante', render: (r) => h('div.row', { style: { '--gap': '12px' } }, avatar(r.nombre),
              h('div', h('div.cell-title', r.nombre), h('div.cell-sub', `${fmtCed(r.cedula)} · ${r.grado}`))) },
            { label: 'Representante', render: (r) => h('span.cell-sub', r.representantes.join(', ') || '—') },
            { label: 'Meses pagados', className: 'col-num', render: (r) => r.pagados },
            { label: 'Deuda', className: 'col-num', render: (r) => (r.vencidos.length
              ? h('div', h('div.num', { style: { color: 'var(--red-700)', fontWeight: 600 } }, monto(r.deuda)), h('div.cell-sub', plural(r.vencidos.length, 'mes', 'meses')))
              : h('span.subtle', '—')) },
            { label: 'Estado', render: (r) => h('div.row', { style: { '--gap': '6px' } },
              r.condicion === 'exonerado' ? badge('Exonerado', 'blue', { dot: true }) : pagoBadge(r.estado_pago),
              r.reportes_pendientes ? h('a.badge.badge-amber', { href: '#/admin/finanzas?tab=reportes', title: 'Reporte de pago por validar' }, icon('clock'), String(r.reportes_pendientes)) : null) },
            { label: '', className: 'col-actions', render: (r) => button({ label: 'Estado de cuenta', size: 'sm', onClick: () => cuentaModal(r) }) },
          ],
          rows: visible,
          empty: emptyState({ iconName: 'search', title: 'Sin resultados', text: 'No hay estudiantes que coincidan con la búsqueda.' }),
        })));
    }

    /** Estado de cuenta de un estudiante: meses, pago en caja y exoneración. */
    function cuentaModal(row) {
      const body = h('div');
      let modal;
      const draw = (d) => {
        const c = d.cuenta;
        const sel = new Set();
        const gridBox = h('div');
        let registrar;
        const paint = () => {
          replace(gridBox, mesesGrid(c, { selectable: true, selected: sel, onToggle: (m) => { sel.has(m) ? sel.delete(m) : sel.add(m); paint(); } }));
          if (registrar) registrar.disabled = !sel.size;
        };
        const exon = switchEl({
          checked: c.condicion === 'exonerado', label: 'Exonerado',
          onChange: async (v) => {
            try {
              const next = await api.send('setCondicion', { estudiante_id: row.id, condicion: v ? 'exonerado' : 'regular', observaciones: v ? 'Exonerado por administración' : '' });
              toast.success(v ? 'Estudiante exonerado' : 'Régimen regular restablecido');
              changed = true;
              draw(next);
            } catch (e) { exon.set(!v); toast.error('No se pudo actualizar', e.message); }
          },
        });
        registrar = button({
          label: 'Registrar pago en caja', size: 'sm', variant: 'dark', iconName: 'check', disabled: true,
          onClick: async () => {
            setLoading(registrar, true);
            try {
              const next = await api.send('registerPayment', { estudiante_id: row.id, meses: [...sel] });
              toast.success('Pago registrado', `${plural(sel.size, 'mes', 'meses')} · ${row.nombre}`);
              changed = true;
              draw(next);
            } catch (e) { toast.error('No se pudo registrar', e.message); setLoading(registrar, false); }
          },
        });
        paint();
        replace(body, h('div.stack',
          cuentaResumen(c),
          h('div.row-between', h('div', h('div.label', 'Exonerado'), h('div.field-help', 'Beca, convenio o hijo de personal: siempre solvente.')), exon),
          h('div.label', 'Mensualidades'),
          gridBox,
          h('div.row-between.wrap', h('span.cell-sub', 'Seleccione meses pendientes para registrar un pago recibido en caja.'), registrar),
          d.reportes.length ? h('div.stack', { style: { '--gap': '8px' } }, h('div.label', 'Pagos reportados'), historialPagos(d.reportes)) : null));
      };
      let changed = false;
      modal = openModal({
        title: row.nombre, description: `${row.grado} · ${fmtCed(row.cedula)}`, iconName: 'wallet', width: 760,
        body,
        onClose: () => { if (changed) load.reload(); },
        footer: ({ close }) => [button({ label: 'Cerrar', onClick: () => close() })],
      });
      replace(body, skeletonTable(3));
      api.get('getEstadoCuenta', { estudiante_id: row.id }, { fresh: true }).then(draw)
        .catch((e) => { toast.error('No se pudo cargar', e.message); modal.close(); });
    }

    const load = loadSection(wrap, {
      skeleton: () => skeletonTable(8),
      fetch: () => api.get('listPayments', {}, { fresh: true }),
      render: (data) => {
        rows = data;
        stats();
        renderList();
        return h('div.stack',
          h('div.toolbar',
            searchInput({ placeholder: 'Buscar por nombre, cédula o representante', onInput: debounce((v) => { term = v; renderList(); }, 120) }),
            segmented([{ value: 'todos', label: 'Todos' }, { value: 'solvente', label: 'Solventes' }, { value: 'moroso', label: 'Insolventes' }, { value: 'exonerado', label: 'Exonerados' }],
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
          r.meses_nombre.length ? h('div.row.wrap', { style: { '--gap': '6px' } }, r.meses_nombre.map((m) => badge(m, 'blue'))) : null,
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
            label: 'Verificar pago', size: 'sm', variant: 'success', iconName: 'check',
            onClick: async () => {
              setLoading(aprobar, true);
              try {
                await api.send('reviewPaymentReport', { id: r.id, decision: 'aprobado' });
                toast.success('Pago verificado', `${r.meses_nombre.join(', ')} · ${r.estudiante?.nombre}`);
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
      subtitle: 'La solvencia se calcula sola por mensualidad: el mes en curso se paga hasta el día límite. Un estudiante insolvente no puede consultar notas ni boletín.',
    }),
    statsEl,
    tabsEl,
    content);
}
