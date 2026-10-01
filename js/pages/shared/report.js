import { h, icon } from '../../lib/dom.js';
import { store } from '../../lib/store.js';
import { LAPSO_LABEL, nota, fecha, pct, plural, cedula as fmtCed, redondear } from '../../lib/format.js';
import { brandMark,
  gradePill, badge, emptyState, table, progress, lockState, button, setLoading, callout, statCard,
} from '../../ui/components.js';
import { toast } from '../../ui/toast.js';

/** Valor visible de un lapso: la nota si está completa; si no, el parcial. */
function lapsoValor(l) {
  return l.nota !== null ? l.nota : l.parcial;
}

export function reportLock(inf, { forName } = {}) {
  const c = inf.cuenta;
  return lockState({
    contacto: inf.contacto, nombre: forName ? inf.estudiante.nombre : null,
    detalle: c?.vencidos?.length ? `Meses vencidos: ${c.vencidos.join(', ')} · ${c.deuda.toLocaleString('es-VE', { minimumFractionDigits: 2 })} ${c.moneda}` : null,
  });
}

export function reportStats(inf) {
  const aplazadas = inf.materias.filter((m) => {
    const v = m.definitiva ?? m.promedio_parcial;
    return v !== null && redondear(v) < store.reglas.aprobatoria;
  }).length;
  return h('div.grid.grid-4.enter-stagger',
    statCard({ label: 'Promedio general', value: nota(inf.promedio_general), iconName: 'trendingUp', hint: `${inf.periodo.nombre}` }),
    statCard({ label: 'Materias', value: inf.materias.length, iconName: 'book', hint: inf.grado ? inf.grado.nombre : '' }),
    statCard({ label: 'Por debajo de 10', value: aplazadas, iconName: 'alert', tone: aplazadas ? 'red-600' : null, hint: aplazadas ? 'Requieren atención' : 'Todas aprobadas' }),
    statCard({ label: 'Inasistencia', value: pct(inf.asistencia.pct), iconName: 'userCheck', hint: `${plural(inf.asistencia.ausencias, 'ausencia', 'ausencias')} en ${plural(inf.asistencia.clases, 'clase', 'clases')}` }));
}

/** Tarjetas por materia con las notas de los tres lapsos. */
export function reportCards(inf, hrefFor) {
  if (!inf.materias.length) return emptyState({ iconName: 'book', title: 'Sin materias registradas', text: 'Aún no hay materias asignadas a este grado.' });
  const activo = inf.periodo.lapso_activo;
  return h('div.grid.grid-auto.enter-stagger', inf.materias.map((m) => {
    const final = m.definitiva ?? m.promedio_parcial;
    return h('a.card.card-link.subject-card', { href: hrefFor(m) },
      h('div.top',
        h('div', { style: { minWidth: 0 } }, h('h3', m.nombre), h('div.cell-sub', { style: { marginTop: '2px' } }, m.profesor)),
        gradePill(final, { lg: true, title: m.definitiva !== null ? 'Nota definitiva' : 'Promedio parcial' })),
      h('div.lapso-row', m.lapsos.map((l) => h(`div.lapso-cell${l.lapso === activo && inf.periodo.estado === 'activo' ? '.is-active' : ''}`,
        h('div.eyebrow', `${l.lapso}° lapso`),
        h('div.val', { style: { color: lapsoValor(l) !== null && redondear(lapsoValor(l)) < 10 ? 'var(--red-600)' : null } },
          lapsoValor(l) === null ? h('span.subtle', '—') : nota(lapsoValor(l))),
        l.nota === null && l.parcial !== null ? h('div.cell-sub', `${pct(l.evaluado_pct)} eval.`) : null))),
      h('div.foot',
        m.definitiva !== null ? badge('Definitiva', 'navy') : badge('En curso', 'blue', { dot: true }),
        h('span.row', { style: { '--gap': '4px' } }, 'Ver detalle', icon('chevronRight'))));
  }));
}

/** Desglose de una materia: evaluaciones, pesos y notas por lapso. */
export function materiaDetalle(inf, materiaId) {
  const m = inf.materias.find((x) => x.id === materiaId);
  if (!m) return emptyState({ iconName: 'search', title: 'Materia no encontrada' });
  return h('div.stack', { style: { '--gap': '16px' } },
    h('div.grid.grid-4.enter-stagger',
      m.lapsos.map((l) => statCard({
        label: LAPSO_LABEL[l.lapso],
        value: lapsoValor(l) === null ? '—' : nota(lapsoValor(l)),
        hint: l.nota !== null ? 'Nota definitiva del lapso' : (l.evaluaciones.length ? `Parcial · ${pct(l.evaluado_pct)} evaluado` : 'Sin evaluaciones'),
        tone: lapsoValor(l) !== null && redondear(lapsoValor(l)) < 10 ? 'red-600' : null,
      })),
      statCard({ label: 'Definitiva', value: m.definitiva === null ? '—' : String(m.definitiva), iconName: 'flag', hint: m.definitiva === null ? `Promedio parcial: ${nota(m.promedio_parcial)}` : 'Promedio de los tres lapsos' })),
    ...m.lapsos.filter((l) => l.evaluaciones.length).map((l) => h('section.card.enter',
      h('div.card-header',
        h('div', h('h2', LAPSO_LABEL[l.lapso]), h('p.cell-sub', `${plural(l.ausencias, 'inasistencia', 'inasistencias')} en ${plural(l.clases, 'clase', 'clases')}`)),
        h('div.row', { style: { '--gap': '12px' } },
          h('div', { style: { width: '120px' } }, progress(l.evaluado_pct, { tone: l.evaluado_pct >= 100 ? 'ok' : null })),
          h('span.cell-sub.num', `${pct(l.evaluado_pct)} evaluado`))),
      table({
        columns: [
          { label: 'Evaluación', render: (e) => h('div', h('div.cell-title', e.titulo), h('div.cell-sub', e.tipo)) },
          { label: 'Fecha', render: (e) => h('span.cell-sub', fecha(e.fecha)) },
          { label: 'Peso', className: 'col-num', render: (e) => `${nota(e.porcentaje)} %` },
          { label: 'Nota (1–20)', className: 'col-center', render: (e) => gradePill(e.calificacion) },
          { label: 'Aporte', className: 'col-num', render: (e) => (e.calificacion === null ? h('span.subtle', '—') : h('span.num', nota(Math.round(e.calificacion * e.porcentaje) / 100))) },
        ],
        rows: l.evaluaciones,
      }),
      h('div.card-footer.row-between',
        h('span.cell-sub', 'Nota del lapso = Σ (nota × peso ÷ 100)'),
        h('div.row', { style: { '--gap': '8px' } }, h('span.cell-sub', l.nota !== null ? 'Nota del lapso' : 'Acumulado'),
          gradePill(l.nota !== null ? l.nota : l.acumulado))))),
    m.lapsos.every((l) => !l.evaluaciones.length) ? emptyState({ iconName: 'clipboard', title: 'Sin evaluaciones', text: 'El docente aún no ha publicado el plan de evaluación.' }) : null);
}

export function asistenciaView(asis) {
  const max = store.reglas.max_inasistencia;
  return h('div.stack', { style: { '--gap': '16px' } },
    h('div.grid.grid-3.enter-stagger',
      statCard({ label: 'Clases registradas', value: asis.clases, iconName: 'calendar' }),
      statCard({ label: 'Inasistencias', value: asis.ausencias, iconName: 'alert', hint: `${plural(asis.justificadas, 'justificada', 'justificadas')} aparte` }),
      statCard({ label: 'Porcentaje', value: pct(asis.pct), iconName: 'userCheck', tone: asis.pct > max ? 'red-600' : null, hint: `Límite: ${max} % por materia` })),
    h('section.card',
      h('div.card-header', h('h2', 'Por materia')),
      table({
        columns: [
          { label: 'Materia', render: (m) => h('span.cell-title', m.materia) },
          { label: 'Clases', className: 'col-num', key: 'clases' },
          { label: 'Ausencias', className: 'col-num', key: 'ausencias' },
          { label: 'Justificadas', className: 'col-num', key: 'justificadas' },
          { label: 'Inasistencia', render: (m) => h('div.row', { style: { '--gap': '10px', minWidth: '180px' } },
            h('div.grow', progress(Math.min(100, (m.pct / max) * 100), { tone: m.pct > max ? 'over' : m.pct > max * 0.7 ? 'warn' : 'ok' })),
            m.pct > max ? badge(pct(m.pct), 'red') : h('span.num.cell-sub', pct(m.pct))) },
        ],
        rows: asis.materias,
        empty: emptyState({ iconName: 'calendar', title: 'Sin registros de asistencia' }),
      })));
}

/** Boletín en pantalla + descarga en PDF. */
export function boletinView(inf) {
  const inst = inf.institucion;
  let dl;
  const download = async () => {
    setLoading(dl, true);
    try {
      const { downloadBoletin } = await import('../../pdf/boletin.js');
      await downloadBoletin(inf);
      toast.success('Boletín descargado', `${inf.estudiante.nombre} · ${inf.periodo.nombre}`);
    } catch (e) {
      toast.error('No se pudo generar el PDF', e.message);
    }
    setLoading(dl, false);
  };
  dl = button({ label: 'Descargar boletín (PDF)', variant: 'primary', iconName: 'download', onClick: download });

  const rasgosTable = h('div.table-wrap', h('table.table',
    h('thead', h('tr', h('th', 'Rasgos de personalidad'), [1, 2, 3].map((l) => h('th.col-center', `${l}° lapso`)))),
    h('tbody', inf.rasgos.map((r) => h('tr', h('td', r.rasgo), [1, 2, 3].map((l) => h('td.col-center', r.valores[l] ? h('span.badge', { title: inf.escala_rasgos[r.valores[l]] }, r.valores[l]) : h('span.subtle', '—'))))))));

  return h('div.stack', { style: { '--gap': '16px' } },
    h('div.row-between.wrap',
      callout('info', 'info', 'Boletín informativo digital. Las notas de lapso se redondean al entero (9,5 → 10); la definitiva es el promedio de los tres lapsos.'),
      dl),
    h('article.card.boletin.enter',
      h('header.boletin-head',
        h('div.school',
          brandMark(inst.logo, { size: 44 }),
          h('div', h('h2', inst.nombre), h('div.cell-sub', `Código DEA ${inst.codigo_dea} · RIF ${inst.rif}`), h('div.cell-sub', inst.direccion))),
        h('div', { style: { textAlign: 'right' } },
          h('div.eyebrow', 'Boletín informativo'),
          h('div', { style: { fontWeight: 600, fontSize: 'var(--text-lg)' } }, `Año escolar ${inf.periodo.nombre}`))),
      h('div.boletin-meta',
        h('div', h('div.k', 'Estudiante'), h('div.v', inf.estudiante.nombre)),
        h('div', h('div.k', 'Cédula'), h('div.v', fmtCed(inf.estudiante.cedula))),
        h('div', h('div.k', 'Grado'), h('div.v', inf.grado ? `${inf.grado.nombre}${inf.grado.seccion ? ` “${inf.grado.seccion}”` : ''}` : '—')),
        h('div', h('div.k', 'Representante'), h('div.v', inf.representante?.nombre || '—'))),
      h('div.table-wrap', h('table.table',
        h('thead', h('tr', h('th', 'Materia'), [1, 2, 3].map((l) => h('th.col-center', `${l}° lapso`)), h('th.col-center', 'Definitiva'), h('th.col-center', 'Inasist.'))),
        h('tbody', inf.materias.map((m) => h('tr',
          h('td.cell-title', m.nombre),
          m.lapsos.map((l) => h('td.col-center', l.nota !== null ? gradePill(redondear(l.nota)) : h('span.subtle', '—'))),
          h('td.col-center', gradePill(m.definitiva)),
          h('td.col-center.num.cell-sub', pct(m.inasistencia_pct))))))),
      h('div.row-between', { style: { padding: '16px 0', borderTop: '1px solid var(--border)', marginTop: '8px' } },
        h('span.cell-sub', 'Promedio general'),
        gradePill(inf.promedio_definitivo ?? inf.promedio_general, { lg: true })),
      rasgosTable,
      h('p.cell-sub', { style: { marginTop: '12px' } }, `Escala: ${Object.entries(inf.escala_rasgos).map(([k, v]) => `${k} = ${v}`).join(' · ')}`)));
}
