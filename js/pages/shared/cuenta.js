import { h, icon } from '../../lib/dom.js';
import { api } from '../../api/client.js';
import { fecha, monto as fmtMonto, plural, relativo } from '../../lib/format.js';
import { badge, button, setLoading, callout, table, emptyState } from '../../ui/components.js';
import { toast } from '../../ui/toast.js';

const ESTADO_MES = {
  pagado: { label: 'Pagado', iconName: 'check' },
  vencido: { label: 'Vencido', iconName: 'alert' },
  por_vencer: { label: 'Por pagar', iconName: 'clock' },
  futuro: { label: 'Próximo', iconName: null },
};

const ESTADO_REPORTE = { pendiente: ['Por validar', 'amber'], aprobado: ['Verificado', 'green'], rechazado: ['Rechazado', 'red'] };

const mesCorto = (nombre) => nombre.replace(/^(\w{3})\w*/, '$1');

/** Cuadrícula de los meses del año escolar con su estado de pago. */
export function mesesGrid(cuenta, { selectable = false, selected, onToggle } = {}) {
  return h('div.month-grid', { role: selectable ? 'group' : 'list', 'aria-label': 'Mensualidades del año escolar' },
    cuenta.meses.map((m) => {
      const st = ESTADO_MES[m.estado];
      const canPick = selectable && m.estado !== 'pagado' && !m.en_revision;
      const isSel = selected?.has(m.mes);
      const attrs = {
        class: `month month-${m.estado}${m.en_revision ? ' is-review' : ''}${isSel ? ' is-selected' : ''}`,
        title: m.estado === 'pagado' ? `Verificado ${fecha(m.fecha_verificacion)} · ${m.referencia}` : (m.en_revision ? 'Pago reportado, en validación' : st.label),
      };
      const inner = [
        h('span.month-name', mesCorto(m.nombre)),
        h('span.month-state', m.en_revision && m.estado !== 'pagado' ? 'En revisión' : st.label),
        st.iconName ? h('span.month-icon', icon(m.en_revision && m.estado !== 'pagado' ? 'clock' : st.iconName)) : null,
      ];
      if (canPick) {
        return h('button', { ...attrs, type: 'button', 'aria-pressed': String(!!isSel), onclick: () => onToggle(m.mes) }, inner);
      }
      return h('div', { ...attrs, role: selectable ? null : 'listitem' }, inner);
    }));
}

export function cuentaResumen(cuenta) {
  if (cuenta.condicion === 'exonerado') {
    return callout('success', 'shield', h('span', h('strong', 'Exonerado. '), 'No tiene mensualidades exigibles y se considera solvente.'));
  }
  if (cuenta.estado === 'moroso') {
    return callout('danger', 'alert', h('span', h('strong', `Insolvente: ${plural(cuenta.vencidos.length, 'mes vencido', 'meses vencidos')}. `),
      `Deuda: ${fmtMonto(cuenta.deuda)} ${cuenta.moneda}. Mientras haya meses vencidos no se pueden consultar notas ni boletín.`));
  }
  const actual = cuenta.meses.find((m) => m.estado === 'por_vencer');
  return callout('success', 'checkCircle', h('span', h('strong', 'Solvente. '),
    actual ? `${actual.nombre} se paga hasta el día ${cuenta.dia_limite}.` : 'Todas las mensualidades exigibles están pagadas.'));
}

export function constanciaButton(estudianteId, { size } = {}) {
  let btn;
  btn = button({
    label: 'Constancia de solvencia (PDF)', iconName: 'download', variant: 'primary', size,
    onClick: async () => {
      setLoading(btn, true);
      try {
        const data = await api.get('getConstanciaSolvencia', { estudiante_id: estudianteId }, { fresh: true });
        const { downloadConstancia } = await import('../../pdf/solvencia.js');
        await downloadConstancia(data);
        toast.success('Constancia descargada', `Código ${data.codigo}`);
      } catch (e) {
        toast.error('No se pudo emitir la constancia', e.message);
      }
      setLoading(btn, false);
    },
  });
  return btn;
}

export function historialPagos(reportes, { showEstudiante = false } = {}) {
  return table({
    columns: [
      { label: 'Reportado', render: (r) => h('div', h('div', fecha(r.creado)), h('div.cell-sub', relativo(r.creado))) },
      showEstudiante ? { label: 'Estudiante', render: (r) => h('span.cell-title', r.estudiante?.nombre) } : null,
      { label: 'Meses', render: (r) => h('div.cell-sub', { style: { color: 'var(--text)' } }, r.meses_nombre.join(', ') || '—') },
      { label: 'Pago', render: (r) => h('div', h('div.num', `${fmtMonto(r.monto)}`), h('div.cell-sub', `${r.banco} · `, h('span.mono', r.referencia))) },
      { label: 'Estado', render: (r) => h('div',
        badge(ESTADO_REPORTE[r.estado][0], ESTADO_REPORTE[r.estado][1], { dot: true }),
        r.estado === 'rechazado' && r.observacion ? h('div.cell-sub', { style: { marginTop: '4px', maxWidth: '32ch' } }, r.observacion) : null) },
      { label: 'Verificación', render: (r) => (r.fecha_revision ? h('span', fecha(r.fecha_revision)) : h('span.subtle', 'Pendiente')) },
    ].filter(Boolean),
    rows: reportes,
    empty: emptyState({ iconName: 'receipt', title: 'Sin pagos reportados', text: 'Los pagos que reporte aparecerán aquí con su fecha de verificación.' }),
  });
}

/** Bloque completo de estado de cuenta (representante, estudiante y admin). */
export function estadoCuentaView(data, { actions } = {}) {
  const c = data.cuenta;
  return h('div.stack', { style: { '--gap': '16px' } },
    h('section.card',
      h('div.card-header.wrap',
        h('div', h('h2', `Mensualidades ${data.periodo.nombre}`),
          h('p.cell-sub', `${fmtMonto(c.monto_mensual)} ${c.moneda} por mes · se paga del 1 al ${c.dia_limite} de cada mes`)),
        h('div.row.wrap', c.estado === 'solvente' ? constanciaButton(data.estudiante.id, { size: 'sm' }) : null, actions || null)),
      h('div.card-body.stack', cuentaResumen(c), mesesGrid(c),
        h('div.row.wrap.cell-sub', { style: { '--gap': '14px' } },
          h('span.legend.legend-pagado', 'Pagado'), h('span.legend.legend-vencido', 'Vencido'),
          h('span.legend.legend-por_vencer', 'Por pagar (mes en curso)'), h('span.legend.legend-futuro', 'Próximo')))),
    data.reportes ? h('section.card',
      h('div.card-header', h('div', h('h2', 'Historial de pagos'), h('p.cell-sub', 'Pagos reportados y su verificación por administración.'))),
      historialPagos(data.reportes)) : null);
}
