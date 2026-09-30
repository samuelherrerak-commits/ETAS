import { h, icon, replace } from '../../lib/dom.js';
import { api } from '../../api/client.js';
import { router } from '../../lib/router.js';
import { store } from '../../lib/store.js';
import { nota, pct, fecha, monto, relativo, cedula as fmtCed, hoyISO, plural } from '../../lib/format.js';
import {
  pageHeader, loadSection, skeletonCards, skeletonStats, skeletonTable, emptyState, avatar, badge, pagoBadge, gradePill,
  tabs, button, setLoading, field, input, select, callout, table, lockState,
} from '../../ui/components.js';
import { toast } from '../../ui/toast.js';
import { reportLock, reportStats, reportCards, materiaDetalle, asistenciaView, boletinView } from '../shared/report.js';
import { avisosWidget } from '../shared/avisos.js';

export function representanteHomePage() {
  const content = h('div');
  loadSection(content, {
    skeleton: () => skeletonCards(2, 200),
    fetch: () => api.get('getRepresentativeHome'),
    render: (hijos) => (hijos.length
      ? h('div.grid.grid-auto.enter-stagger', hijos.map((c) => h('a.card.card-link.subject-card', { href: `#/representante/hijo/${c.id}` },
        h('div.top',
          h('div.row', { style: { '--gap': '12px' } }, avatar(c.nombre, { lg: true }),
            h('div', h('h3', c.nombre), h('div.cell-sub', `${c.grado} · ${fmtCed(c.cedula)}`))),
          pagoBadge(c.estado_pago)),
        h('div.lapso-row', { style: { gridTemplateColumns: 'repeat(2, 1fr)' } },
          h('div.lapso-cell', h('div.eyebrow', 'Promedio'),
            h('div.val', c.estado_pago === 'moroso' ? h('span.row', { style: { '--gap': '6px', color: 'var(--text-muted)' } }, icon('lock'), 'Bloqueado') : nota(c.promedio))),
          h('div.lapso-cell', h('div.eyebrow', 'Inasistencia'),
            h('div.val', { style: { color: c.inasistencia_pct > store.reglas.max_inasistencia ? 'var(--red-600)' : null } }, pct(c.inasistencia_pct)))),
        c.reportes_pendientes ? callout('info', 'clock', `${plural(c.reportes_pendientes, 'pago reportado', 'pagos reportados')} en validación.`) : null,
        h('div.foot', c.estado_pago === 'moroso' ? h('span', { style: { color: 'var(--red-700)' } }, 'Regularice la solvencia para ver notas') : h('span', 'Rendimiento, asistencia y boletín'),
          h('span.row', { style: { '--gap': '4px' } }, 'Abrir', icon('chevronRight'))))))
      : emptyState({ iconName: 'users', title: 'No tiene representados asociados', text: 'Solicite a la administración que vincule a sus representados con su cuenta.' })),
  });
  return h('div.stack', { style: { '--gap': '24px' } },
    pageHeader({
      eyebrow: 'Representante',
      title: `Hola, ${store.user.nombre.split(' ')[0]}`,
      subtitle: 'Seguimiento académico y administrativo de sus representados.',
      actions: [button({ label: 'Reportar pago', iconName: 'receipt', variant: 'primary', onClick: () => router.navigate('/representante/pagos') })],
    }),
    content,
    avisosWidget(3));
}

/** Ficha de un estudiante (representante o staff en modo consulta). */
export function representanteHijoPage({ params, query }, { staff = false } = {}) {
  let tab = ['rendimiento', 'asistencia', 'boletin', 'materia'].includes(query.tab) ? query.tab : 'rendimiento';
  const base = staff ? `#/academico/estudiante/${params.id}` : `#/representante/hijo/${params.id}`;
  const content = h('div');
  const head = h('div');

  function draw(inf) {
    replace(head, h('header.page-head.enter',
      h('div.row', { style: { '--gap': '14px' } }, avatar(inf.estudiante.nombre, { lg: true }),
        h('div',
          h('a.crumb', { href: staff ? '#/academico/rendimiento' : '#/representante' }, icon('chevronLeft'), staff ? 'Rendimiento' : 'Mis representados'),
          h('h1', inf.estudiante.nombre),
          h('p', `${inf.grado?.nombre || ''} · ${fmtCed(inf.estudiante.cedula)} · Año escolar ${inf.periodo.nombre}`))),
      inf.bloqueado ? pagoBadge('moroso') : (inf.estado_pago ? pagoBadge(inf.estado_pago) : null)));

    const body = h('div', { style: { marginTop: '20px' } });
    const show = () => {
      if (tab === 'materia' && query.materia) {
        replace(body, h('div.stack',
          h('a.crumb', { href: `${base}?tab=rendimiento`, onclick: (e) => { e.preventDefault(); tab = 'rendimiento'; router.replaceSilently(`${base}?tab=rendimiento`); show(); } }, icon('chevronLeft'), 'Todas las materias'),
          materiaDetalle(inf, query.materia)));
        return;
      }
      if (tab === 'asistencia') replace(body, asistenciaView(inf.bloqueado ? inf.asistencia : inf.asistencia_detalle));
      else if (inf.bloqueado) {
        replace(body, lockState({
          contacto: inf.contacto, nombre: inf.estudiante.nombre,
          action: staff ? null : button({ label: 'Reportar pago', variant: 'primary', iconName: 'receipt', onClick: () => router.navigate(`/representante/pagos?estudiante=${inf.estudiante.id}`) }),
        }));
      } else if (tab === 'boletin') replace(body, boletinView(inf));
      else {
        replace(body, h('div.stack', { style: { '--gap': '24px' } },
          reportStats(inf),
          reportCards(inf, (m) => `${base}?tab=materia&materia=${m.id}`)));
      }
    };
    const t = tabs([
      { id: 'rendimiento', label: 'Rendimiento', iconName: 'chart' },
      { id: 'asistencia', label: 'Asistencia', iconName: 'userCheck' },
      { id: 'boletin', label: 'Boletín', iconName: 'file' },
    ], tab === 'materia' ? 'rendimiento' : tab, (id) => { tab = id; query.materia = null; router.replaceSilently(`${base}?tab=${id}`); show(); });
    show();
    return h('div', t, body);
  }

  loadSection(content, {
    skeleton: () => h('div.stack', skeletonStats(), skeletonCards(3, 190)),
    fetch: (o) => api.get('getStudentReport', { estudiante_id: params.id }, o),
    render: draw,
  });
  return h('div', head, content);
}

export function representantePagosPage({ query }) {
  const content = h('div');
  const bancos = store.catalogos.bancos || [];

  function form(hijos, reload) {
    const est = select(hijos.map((c) => ({ value: c.id, label: `${c.nombre} · ${c.grado}` })), { value: query.estudiante || hijos.find((c) => c.estado_pago === 'moroso')?.id || hijos[0]?.id });
    const banco = select([{ value: '', label: 'Seleccione…', disabled: true }, ...bancos.map((b) => ({ value: b, label: b }))], { value: '' });
    const ref = input({ placeholder: 'Ej. 00482917', inputmode: 'numeric', maxlength: 30, class: 'mono' });
    const mto = input({ placeholder: '0,00', inputmode: 'decimal' });
    const f = input({ type: 'date', value: hoyISO(), max: hoyISO() });
    const fields = {
      banco: field({ label: 'Banco o método', input: banco }),
      ref: field({ label: 'Número de referencia', input: ref, help: 'Tal como aparece en el comprobante.' }),
      mto: field({ label: 'Monto', input: mto }),
      f: field({ label: 'Fecha del pago', input: f }),
    };
    let btn;
    async function submit(e) {
      e.preventDefault();
      const montoNum = Number(mto.value.replace(/\./g, '').replace(',', '.'));
      fields.banco.setError(!banco.value ? 'Seleccione el banco.' : null);
      fields.ref.setError(!/^[0-9A-Za-z-]{4,30}$/.test(ref.value.trim()) ? 'Entre 4 y 30 caracteres, sin espacios.' : null);
      fields.mto.setError(!(montoNum > 0) ? 'Indique un monto válido.' : null);
      fields.f.setError(!f.value ? 'Indique la fecha.' : null);
      if (!banco.value || !(montoNum > 0) || !f.value || !/^[0-9A-Za-z-]{4,30}$/.test(ref.value.trim())) return;
      setLoading(btn, true);
      try {
        await api.send('reportPayment', { estudiante_id: est.value, banco: banco.value, referencia: ref.value.trim(), monto: montoNum, fecha_pago: f.value });
        toast.success('Pago reportado', 'La administración lo validará y actualizará la solvencia.');
        reload();
      } catch (err) {
        toast.error('No se pudo registrar el pago', err.message);
        setLoading(btn, false);
      }
    }
    return h('form.card', { onsubmit: submit, novalidate: true },
      h('div.card-header', h('div', h('h2', 'Registrar transferencia'), h('p.cell-sub', 'Reporte su pago; la solvencia se actualiza cuando administración lo valida.'))),
      h('div.card-body.stack',
        field({ label: 'Estudiante', input: est }),
        h('div.grid.grid-2', fields.banco, fields.ref),
        h('div.grid.grid-2', fields.mto, fields.f)),
      h('div.card-footer.row', { style: { justifyContent: 'flex-end' } },
        btn = button({ label: 'Enviar reporte', variant: 'primary', iconName: 'send', type: 'submit' })));
  }

  function historial(list) {
    const tone = { pendiente: ['Por validar', 'amber'], aprobado: ['Aprobado', 'green'], rechazado: ['Rechazado', 'red'] };
    return h('section.card',
      h('div.card-header', h('h2', 'Pagos reportados')),
      table({
        columns: [
          { label: 'Estudiante', render: (r) => h('span.cell-title', r.estudiante?.nombre) },
          { label: 'Referencia', render: (r) => h('div', h('div.mono', r.referencia), h('div.cell-sub', r.banco)) },
          { label: 'Monto', className: 'col-num', render: (r) => monto(r.monto) },
          { label: 'Fecha', render: (r) => h('span.cell-sub', fecha(r.fecha_pago)) },
          { label: 'Estado', render: (r) => h('div', badge(tone[r.estado][0], tone[r.estado][1], { dot: true }), r.observacion && r.estado === 'rechazado' ? h('div.cell-sub', { style: { marginTop: '4px', maxWidth: '28ch' } }, r.observacion) : null) },
        ],
        rows: list,
        empty: emptyState({ iconName: 'receipt', title: 'Aún no ha reportado pagos' }),
      }));
  }

  loadSection(content, {
    skeleton: () => h('div.grid.grid-2', skeletonTable(4), skeletonTable(4)),
    fetch: async (o) => {
      const [hijos, reportes] = await Promise.all([api.get('getRepresentativeHome', {}, o), api.get('listMyPaymentReports', {}, o)]);
      return { hijos, reportes };
    },
    render: ({ hijos, reportes }, { reload }) => (hijos.length
      ? h('div.grid.overview-grid', form(hijos, reload), historial(reportes))
      : emptyState({ iconName: 'users', title: 'No tiene representados asociados' })),
  });

  return h('div.stack', { style: { '--gap': '24px' } },
    pageHeader({ eyebrow: 'Representante', title: 'Reportar pago', subtitle: 'Registre transferencias o pagos móviles de la mensualidad.' }),
    content);
}
