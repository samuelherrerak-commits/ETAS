import { h, icon } from '../../lib/dom.js';
import { api } from '../../api/client.js';
import { store } from '../../lib/store.js';
import { LAPSO_LABEL, pct, plural } from '../../lib/format.js';
import { pageHeader, loadSection, skeletonCards, emptyState, progress, gradePill, badge, callout } from '../../ui/components.js';
import { avisosWidget } from '../shared/avisos.js';

function saludo() {
  const hr = new Date().getHours();
  return hr < 12 ? 'Buenos días' : hr < 19 ? 'Buenas tardes' : 'Buenas noches';
}

export function subjectCard(m, href) {
  const planOk = Math.abs(m.plan_pct - 100) < 0.001;
  return h('a.card.card-link.subject-card', { href },
    h('div.top',
      h('div', h('div.eyebrow', m.grado ? `${m.grado.nombre}${m.grado.seccion ? ` “${m.grado.seccion}”` : ''}` : 'Sin grado'), h('h3', { style: { marginTop: '4px' } }, m.nombre)),
      gradePill(m.promedio, { title: 'Promedio parcial del lapso activo' })),
    h('div.meta',
      h('span', icon('users'), plural(m.estudiantes, 'estudiante', 'estudiantes')),
      h('span', icon('clipboard'), plural(m.evaluaciones, 'evaluación', 'evaluaciones'))),
    h('div.stack', { style: { '--gap': '6px' } },
      h('div.foot', h('span', 'Notas cargadas'), h('span.num', pct(m.notas_pct))),
      progress(m.notas_pct, { tone: m.notas_pct >= 100 ? 'ok' : null })),
    h('div.foot',
      planOk ? badge('Plan completo', 'green', { dot: true }) : badge(`Plan al ${pct(m.plan_pct)}`, 'amber', { dot: true }),
      h('span.row', { style: { '--gap': '4px' } }, 'Abrir', icon('chevronRight'))));
}

export function materiasProfesorPage() {
  const p = store.periodo;
  const grid = h('div');

  loadSection(grid, {
    skeleton: () => skeletonCards(4, 220),
    fetch: () => api.get('getTeacherSubjects'),
    render: (list) => {
      if (!list.length) {
        return emptyState({ iconName: 'book', title: 'No tiene materias asignadas', text: 'La administración debe asignarle materias para que aparezcan aquí.' });
      }
      const pendientes = list.filter((m) => Math.abs(m.plan_pct - 100) > 0.001);
      return h('div.stack', { style: { '--gap': '16px' } },
        pendientes.length && p?.carga_abierta
          ? callout('warn', 'alert', h('span', h('strong', `${plural(pendientes.length, 'materia', 'materias')} sin plan de evaluación completo. `), 'El plan del lapso debe sumar 100 % antes de cargar notas.'))
          : null,
        h('div.grid.grid-auto.enter-stagger', list.map((m) => subjectCard(m, `#/profesor/materia/${m.id}`))));
    },
  });

  return h('div.stack', { style: { '--gap': '24px' } },
    pageHeader({
      eyebrow: p ? `${p.nombre} · ${LAPSO_LABEL[p.lapso_activo]}${p.carga_abierta ? '' : ' · carga cerrada'}` : null,
      title: `${saludo()}, ${store.user.nombre.split(' ')[0]}`,
      subtitle: 'Sus materias asignadas. Cada lista de clase se forma con los estudiantes inscritos en el grado.',
    }),
    grid,
    avisosWidget(2));
}
