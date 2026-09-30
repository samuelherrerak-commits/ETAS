import { h, icon, append, replace } from '../../lib/dom.js';
import { api } from '../../api/client.js';
import { router } from '../../lib/router.js';
import { store } from '../../lib/store.js';
import { fecha, pct, plural, hoyISO, cedula as fmtCed } from '../../lib/format.js';
import {
  button, setLoading, emptyState, callout, switchEl, avatar, badge, input, loadSection, skeletonTable, table,
} from '../../ui/components.js';
import { toast } from '../../ui/toast.js';
import { confirmDialog } from '../../ui/modal.js';

const lastDay = new Map(); // conserva la fecha elegida al recargar la vista

const ESTADO_TXT = { presente: 'Presente', ausente: 'Ausente', justificado: 'Inasistencia justificada' };

/**
 * Pasar lista pensado para el teléfono en el aula: todos inician
 * "presente", un toque en la fila marca ausente, y un segundo botón
 * permite justificar. El resumen del lapso marca quién supera el 25 %.
 */
export function asistenciaTab({ ws, reload }) {
  const editable = ws.asistencia_editable;
  let dia = lastDay.get(ws.materia.id) || hoyISO();
  const root = h('div.stack', { style: { '--gap': '16px' } });
  const listWrap = h('div');
  const dateIn = input({ type: 'date', value: dia, max: hoyISO(), style: { maxWidth: '180px' }, 'aria-label': 'Fecha de la clase' });
  dateIn.addEventListener('change', async () => {
    const next = dateIn.value || hoyISO();
    dateIn.value = dia;
    if (root.dataset.dirty === 'true') {
      const ok = await confirmDialog({ title: 'Hay cambios sin guardar', message: 'La lista actual no se ha guardado. ¿Cambiar de fecha de todas formas?', confirmLabel: 'Cambiar fecha', tone: 'danger' });
      if (!ok) return;
    }
    dia = next;
    dateIn.value = next;
    lastDay.set(ws.materia.id, dia);
    loadDay();
  });

  function loadDay() {
    router.clearGuard();
    root.dataset.dirty = 'false';
    loadSection(listWrap, {
      skeleton: () => skeletonTable(6),
      fetch: () => api.get('getAttendance', { materia_id: ws.materia.id, fecha: dia }, { fresh: true }),
      render: renderDay,
    });
  }

  function renderDay(data) {
    const estados = new Map(data.estudiantes.map((s) => [s.id, s.estado]));
    const original = new Map(estados);
    const setters = [];
    const counters = h('div.att-summary');
    let saveBtn;

    function paintCounters() {
      const vals = [...estados.values()];
      const n = (x) => vals.filter((v) => v === x).length;
      replace(counters, 
        badge(`${n('presente')} presentes`, 'green', { dot: true }),
        badge(`${n('ausente')} ausentes`, n('ausente') ? 'red' : '', { dot: true }),
        n('justificado') ? badge(`${n('justificado')} justificadas`, 'amber', { dot: true }) : null);
      const changed = [...estados].some(([k, v]) => original.get(k) !== v);
      root.dataset.dirty = String(changed);
      if (changed) router.setGuard(() => 'La lista de asistencia tiene cambios sin guardar.');
      else router.clearGuard();
      // Un día sin registrar se puede guardar tal cual (todos presentes).
      if (saveBtn) saveBtn.disabled = data.registrada && !changed;
    }

    function item(s) {
      const status = h('div.status');
      const sw = switchEl({ checked: estados.get(s.id) === 'presente', size: 'lg', label: `Asistencia de ${s.nombre}`, disabled: !editable, onChange: (v) => set(v ? 'presente' : 'ausente') });
      const just = h('button.btn.btn-sm.just', { type: 'button', hidden: true, onclick: (e) => { e.stopPropagation(); set(estados.get(s.id) === 'justificado' ? 'ausente' : 'justificado'); } });
      const el = h('div.att-item', { onclick: () => { if (editable) sw.click(); } },
        avatar(s.nombre),
        h('div.who', h('div.name.truncate', s.nombre), status),
        editable ? just : null,
        sw);
      function set(v) {
        estados.set(s.id, v);
        paint();
        paintCounters();
      }
      function paint() {
        const v = estados.get(s.id);
        el.classList.toggle('is-absent', v === 'ausente');
        el.classList.toggle('is-justified', v === 'justificado');
        status.textContent = ESTADO_TXT[v];
        sw.set(v === 'presente');
        just.hidden = v === 'presente';
        just.textContent = v === 'justificado' ? 'Quitar justificación' : 'Justificar';
      }
      paint();
      setters.push(set);
      return el;
    }

    async function save() {
      setLoading(saveBtn, true);
      try {
        await api.send('markAttendance', {
          materia_id: ws.materia.id, fecha: dia,
          registros: [...estados].map(([estudiante_id, estado]) => ({ estudiante_id, estado })),
        });
        router.clearGuard();
        root.dataset.dirty = 'false';
        const aus = [...estados.values()].filter((v) => v !== 'presente').length;
        toast.success('Asistencia registrada', `${fecha(dia)} · ${aus ? plural(aus, 'inasistencia', 'inasistencias') : 'asistencia completa'}`);
        lastDay.set(ws.materia.id, dia);
        reload();
      } catch (e) {
        toast.error('No se pudo registrar la asistencia', e.message);
        setLoading(saveBtn, false);
      }
    }

    if (!data.estudiantes.length) return h('div.card', emptyState({ iconName: 'users', title: 'No hay estudiantes inscritos en el grado' }));

    const node = h('section.card',
      h('div.card-header.wrap',
        h('div.stack', { style: { '--gap': '6px' } },
          h('div.row', { style: { '--gap': '8px' } }, h('h2', fecha(dia, { long: true })),
            data.registrada ? badge('Registrada', 'blue', { iconName: 'check' }) : badge('Sin registrar', 'amber')),
          counters),
        editable ? button({ label: 'Todos presentes', size: 'sm', iconName: 'userCheck', onClick: () => setters.forEach((set) => set('presente')) }) : null),
      h('div.att-list', data.estudiantes.map(item)),
      editable ? h('div.card-footer.row-between',
        h('span.cell-sub', 'Toque la fila para alternar presente / ausente.'),
        saveBtn = button({ label: data.registrada ? 'Actualizar lista' : 'Guardar asistencia', variant: 'primary', iconName: 'save', onClick: save })) : null);
    paintCounters();
    return node;
  }

  const resumen = h('section.card',
    h('div.card-header', h('div', h('h2', 'Resumen del lapso'), h('p.cell-sub', `${plural(ws.clases, 'clase registrada', 'clases registradas')}. Más de ${store.reglas.max_inasistencia} % de inasistencias aplaza la materia.`))),
    table({
      columns: [
        { label: 'Estudiante', render: (s) => h('div', h('div.cell-title', s.nombre), h('div.cell-sub', fmtCed(s.cedula))) },
        { label: 'Ausencias', className: 'col-num', render: (s) => s.ausencias },
        { label: 'Justificadas', className: 'col-num', render: (s) => s.justificadas },
        { label: 'Inasistencia', className: 'col-num', render: (s) => (s.inasistencia_pct > store.reglas.max_inasistencia
          ? badge(pct(s.inasistencia_pct), 'red', { iconName: 'alert' })
          : h('span.num', pct(s.inasistencia_pct))) },
      ],
      rows: ws.estudiantes,
    }));

  append(root, 
    editable ? null : callout('info', 'lock', h('span', h('strong', 'Solo lectura. '), 'La asistencia se registra únicamente en el lapso activo.')),
    editable ? h('div.row.wrap', { style: { '--gap': '10px' } }, h('span.label', 'Fecha de la clase'), dateIn) : null,
    editable ? listWrap : null,
    resumen);
  if (editable) loadDay();
  return root;
}
