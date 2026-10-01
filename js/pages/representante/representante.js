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
import { estadoCuentaView, mesesGrid, historialPagos, constanciaButton, cuentaResumen } from '../shared/cuenta.js';

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
        c.estado_pago === 'moroso' && c.vencidos.length ? callout('danger', 'alert', `Debe ${plural(c.vencidos.length, 'mes', 'meses')}: ${monto(c.deuda)} ${c.moneda}.`) : null,
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
  let tab = ['rendimiento', 'asistencia', 'boletin', 'materia', 'cuenta'].includes(query.tab) ? query.tab : 'rendimiento';
  const verCuenta = !staff || store.user.rol === 'admin';
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
      if (tab === 'cuenta') {
        const box = h('div');
        loadSection(box, {
          skeleton: () => skeletonCards(1, 220),
          fetch: () => api.get('getEstadoCuenta', { estudiante_id: params.id }, { fresh: true }),
          render: (d) => estadoCuentaView(d, {
            actions: staff ? null : button({ label: 'Reportar pago', size: 'sm', iconName: 'receipt', onClick: () => router.navigate(`/representante/pagos?estudiante=${params.id}`) }),
          }),
        });
        replace(body, box);
        return;
      }
      if (tab === 'asistencia') replace(body, asistenciaView(inf.bloqueado ? inf.asistencia : inf.asistencia_detalle));
      else if (inf.bloqueado) {
        replace(body, lockState({
          contacto: inf.contacto, nombre: inf.estudiante.nombre,
          detalle: inf.cuenta?.vencidos?.length ? `Meses vencidos: ${inf.cuenta.vencidos.join(', ')} · ${monto(inf.cuenta.deuda)} ${inf.cuenta.moneda}` : null,
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
      verCuenta ? { id: 'cuenta', label: 'Estado de cuenta', iconName: 'wallet' } : null,
    ].filter(Boolean), tab === 'materia' ? 'rendimiento' : tab, (id) => { tab = id; query.materia = null; router.replaceSilently(`${base}?tab=${id}`); show(); });
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
  let selectedId = query.estudiante || null;

  function formulario(cuentaData, reload) {
    const c = cuentaData.cuenta;
    const pendientes = c.meses.filter((m) => m.estado !== 'pagado' && !m.en_revision);
    const sel = new Set(pendientes.filter((m) => m.estado === 'vencido' || m.estado === 'por_vencer').map((m) => m.mes));
    const gridBox = h('div');
    const mto = input({ inputmode: 'decimal', placeholder: '0,00' });
    let montoTocado = false;
    mto.addEventListener('input', () => { montoTocado = true; });
    const resumenSel = h('div.cell-sub');
    const paint = () => {
      replace(gridBox, mesesGrid(c, { selectable: true, selected: sel, onToggle: (m) => { sel.has(m) ? sel.delete(m) : sel.add(m); paint(); } }));
      const total = sel.size * c.monto_mensual;
      if (!montoTocado) mto.value = total ? String(total).replace('.', ',') : '';
      resumenSel.textContent = sel.size ? `${plural(sel.size, 'mes seleccionado', 'meses seleccionados')} · ${monto(total)} ${c.moneda}` : 'Toque los meses que está pagando.';
    };
    paint();

    const banco = select([{ value: '', label: 'Seleccione…', disabled: true }, ...bancos.map((b) => ({ value: b, label: b }))], { value: '' });
    const ref = input({ placeholder: 'Ej. 00482917', maxlength: 30, class: 'mono' });
    const f = input({ type: 'date', value: hoyISO(), max: hoyISO() });
    const fields = {
      banco: field({ label: 'Banco o método', input: banco }),
      ref: field({ label: 'Número de referencia', input: ref }),
      mto: field({ label: `Monto (${c.moneda})`, input: mto }),
      f: field({ label: 'Fecha del pago', input: f }),
    };
    let btn;
    async function submit(e) {
      e.preventDefault();
      const montoNum = Number(mto.value.replace(/\./g, '').replace(',', '.'));
      const refOk = /^[0-9A-Za-z-]{4,30}$/.test(ref.value.trim());
      fields.banco.setError(!banco.value ? 'Seleccione el banco.' : null);
      fields.ref.setError(!refOk ? 'Entre 4 y 30 caracteres, sin espacios.' : null);
      fields.mto.setError(!(montoNum > 0) ? 'Indique un monto válido.' : null);
      fields.f.setError(!f.value ? 'Indique la fecha.' : null);
      if (!sel.size) { toast.error('Seleccione los meses que está pagando'); return; }
      if (!banco.value || !refOk || !(montoNum > 0) || !f.value) return;
      setLoading(btn, true);
      try {
        await api.send('reportPayment', { estudiante_id: cuentaData.estudiante.id, meses: [...sel], banco: banco.value, referencia: ref.value.trim(), monto: montoNum, fecha_pago: f.value });
        toast.success('Pago reportado', 'Administración lo verificará y la solvencia se actualizará automáticamente.');
        reload();
      } catch (err) {
        toast.error('No se pudo registrar el pago', err.message);
        setLoading(btn, false);
      }
    }

    if (!pendientes.length) {
      return h('section.card', h('div.card-header', h('h2', 'Reportar pago')),
        h('div.card-body', callout('success', 'checkCircle', 'No hay meses pendientes por reportar. Todo el año escolar está pagado o en validación.')));
    }
    return h('form.card', { onsubmit: submit, novalidate: true },
      h('div.card-header', h('div', h('h2', 'Reportar pago'), h('p.cell-sub', `Seleccione los meses de ${cuentaData.estudiante.nombre.split(' ')[0]} que cubre este pago.`))),
      h('div.card-body.stack',
        gridBox, resumenSel,
        h('div.grid.grid-2', fields.banco, fields.ref),
        h('div.grid.grid-2', fields.mto, fields.f)),
      h('div.card-footer.row', { style: { justifyContent: 'flex-end' } },
        btn = button({ label: 'Enviar reporte', variant: 'primary', iconName: 'send', type: 'submit' })));
  }

  function render({ hijos, cuenta, reportes }, { reload }) {
    if (!hijos.length) return emptyState({ iconName: 'users', title: 'No tiene representados asociados' });
    const selector = hijos.length > 1 ? h('div.row.wrap', { style: { '--gap': '8px' } }, hijos.map((c) => h('button.chip', {
      type: 'button', 'aria-pressed': String(c.id === selectedId),
      onclick: () => { selectedId = c.id; router.replaceSilently(`#/representante/pagos?estudiante=${c.id}`); load.reload({ silent: false }); },
    }, c.nombre, ' · ', c.estado_pago === 'moroso' ? h('span', { style: { color: c.id === selectedId ? '#fecaca' : 'var(--red-600)' } }, 'moroso') : 'solvente'))) : null;
    const c = cuenta.cuenta;
    return h('div.stack', { style: { '--gap': '20px' } },
      selector,
      h('section.card',
        h('div.card-header.wrap',
          h('div', h('h2', cuenta.estudiante.nombre), h('p.cell-sub', `${cuenta.estudiante.grado} · Año escolar ${cuenta.periodo.nombre}`)),
          c.estado === 'solvente' ? constanciaButton(cuenta.estudiante.id, { size: 'sm' }) : pagoBadge('moroso')),
        h('div.card-body', cuentaResumen(c))),
      formulario(cuenta, reload),
      h('section.card',
        h('div.card-header', h('div', h('h2', 'Historial de pagos'), h('p.cell-sub', 'Todos sus pagos reportados, con la fecha en que administración los verificó.'))),
        historialPagos(reportes, { showEstudiante: hijos.length > 1 })));
  }

  const load = loadSection(content, {
    skeleton: () => h('div.stack', skeletonCards(1, 120), skeletonTable(4)),
    fetch: async () => {
      const hijos = await api.get('getRepresentativeHome', {}, { fresh: true });
      if (!hijos.find((c) => c.id === selectedId)) selectedId = (hijos.find((c) => c.estado_pago === 'moroso') || hijos[0])?.id;
      if (!selectedId) return { hijos, cuenta: null, reportes: [] };
      const [cuenta, reportes] = await Promise.all([
        api.get('getEstadoCuenta', { estudiante_id: selectedId }, { fresh: true }),
        api.get('listMyPaymentReports', {}, { fresh: true }),
      ]);
      return { hijos, cuenta, reportes };
    },
    render,
  });

  return h('div.stack', { style: { '--gap': '24px' } },
    pageHeader({ eyebrow: 'Representante', title: 'Pagos', subtitle: 'Estado de cuenta, reporte de mensualidades e historial. La mensualidad del mes en curso se paga del 1 al día límite.' }),
    content);
}
