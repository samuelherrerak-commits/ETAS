import { h, icon } from '../../lib/dom.js';
import { api } from '../../api/client.js';
import { store } from '../../lib/store.js';
import { LAPSO_LABEL } from '../../lib/format.js';
import { pageHeader, loadSection, skeletonCards, skeletonStats, skeletonTable } from '../../ui/components.js';
import { reportLock, reportStats, reportCards, materiaDetalle, asistenciaView, boletinView } from '../shared/report.js';
import { avisosWidget } from '../shared/avisos.js';

const fetchReport = (o) => api.get('getStudentReport', {}, o);

function eyebrow() {
  const s = store.session;
  const p = store.periodo;
  return [s?.grado?.nombre, p ? `${p.nombre} · ${LAPSO_LABEL[p.lapso_activo]}` : null].filter(Boolean).join(' · ');
}

export function estudianteHomePage() {
  const content = h('div');
  loadSection(content, {
    skeleton: () => h('div.stack', { style: { '--gap': '24px' } }, skeletonStats(), skeletonCards(6, 190)),
    fetch: fetchReport,
    render: (inf) => (inf.bloqueado
      ? reportLock(inf)
      : h('div.stack', { style: { '--gap': '24px' } },
        reportStats(inf),
        h('div.stack', { style: { '--gap': '12px' } },
          h('h2.section-title', 'Mis materias'),
          reportCards(inf, (m) => `#/estudiante/materia/${m.id}`)))),
  });
  return h('div.stack', { style: { '--gap': '24px' } },
    pageHeader({
      eyebrow: eyebrow(),
      title: `Hola, ${store.user.nombre.split(' ')[0]}`,
      subtitle: 'Tus calificaciones por materia y lapso, en escala del 1 al 20.',
    }),
    content,
    avisosWidget(3));
}

export function estudianteMateriaPage({ params }) {
  const content = h('div');
  const title = h('h1', 'Materia');
  const sub = h('p');
  loadSection(content, {
    skeleton: () => h('div.stack', skeletonStats(), skeletonTable(5)),
    fetch: fetchReport,
    render: (inf) => {
      if (inf.bloqueado) return reportLock(inf);
      const m = inf.materias.find((x) => x.id === params.id);
      if (m) { title.textContent = m.nombre; sub.textContent = `Docente: ${m.profesor}`; }
      return materiaDetalle(inf, params.id);
    },
  });
  return h('div.stack', { style: { '--gap': '24px' } },
    h('header.page-head.enter', h('div',
      h('a.crumb', { href: '#/estudiante' }, icon('chevronLeft'), 'Mis notas'),
      title, sub)),
    content);
}

export function estudianteAsistenciaPage() {
  const content = h('div');
  loadSection(content, {
    skeleton: () => h('div.stack', skeletonStats(3), skeletonTable(6)),
    fetch: fetchReport,
    render: (inf) => asistenciaView(inf.bloqueado ? inf.asistencia : inf.asistencia_detalle),
  });
  return h('div.stack', { style: { '--gap': '24px' } },
    pageHeader({ eyebrow: eyebrow(), title: 'Asistencia', subtitle: 'Inasistencias por materia en el año escolar.' }),
    content);
}

export function estudianteBoletinPage() {
  const content = h('div');
  loadSection(content, {
    skeleton: () => skeletonTable(8),
    fetch: fetchReport,
    render: (inf) => (inf.bloqueado ? reportLock(inf) : boletinView(inf)),
  });
  return h('div.stack', { style: { '--gap': '24px' } },
    pageHeader({ eyebrow: eyebrow(), title: 'Boletín', subtitle: 'Consulta y descarga tu boletín informativo.' }),
    content);
}
