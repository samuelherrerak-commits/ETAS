import { h, icon, append, clear } from '../../lib/dom.js';
import { api } from '../../api/client.js';
import { router } from '../../lib/router.js';
import { store } from '../../lib/store.js';
import { nota, fecha, pct, plural } from '../../lib/format.js';
import { button, setLoading, emptyState, callout, progress, select, input, badge, table } from '../../ui/components.js';
import { confirmDialog } from '../../ui/modal.js';
import { toast } from '../../ui/toast.js';

/**
 * Creador del plan de evaluación del lapso. Exige que los porcentajes
 * sumen exactamente 100 %; el indicador responde mientras se escribe.
 */
export function planTab({ ws, setWs, goTab }) {
  const tipos = store.catalogos.tipos_evaluacion || ['Examen', 'Taller', 'Proyecto', 'Otro'];
  const notasPorEval = new Map(ws.evaluaciones.map((e) => [e.id, ws.estudiantes.filter((s) => s.notas[e.id] !== undefined).length]));

  if (!ws.editable) {
    const total = ws.evaluaciones.reduce((s, e) => s + e.porcentaje, 0);
    return h('div.stack', { style: { '--gap': '14px' } },
      callout('info', 'lock', h('span', h('strong', 'Solo lectura. '), store.user.rol === 'coordinador' ? 'Vista de supervisión del plan cargado por el docente.' : 'El plan solo puede modificarse en el lapso activo con la carga abierta.')),
      h('section.card',
        h('div.card-header', h('h2', 'Plan de evaluación'), Math.abs(total - 100) < 0.001 ? badge('Suma 100 %', 'green', { dot: true }) : badge(`Suma ${pct(total)}`, 'amber', { dot: true })),
        table({
          columns: [
            { label: 'Evaluación', render: (e) => h('span.cell-title', e.titulo) },
            { label: 'Tipo', key: 'tipo' },
            { label: 'Fecha', render: (e) => fecha(e.fecha) },
            { label: 'Peso', className: 'col-num', render: (e) => `${nota(e.porcentaje)} %` },
            { label: 'Notas cargadas', className: 'col-num', render: (e) => `${notasPorEval.get(e.id)}/${ws.estudiantes.length}` },
          ],
          rows: ws.evaluaciones,
          empty: emptyState({ iconName: 'layers', title: 'Sin plan de evaluación', text: 'El docente aún no ha cargado el plan de este lapso.' }),
        })));
  }

  let rows = ws.evaluaciones.map((e) => ({ ...e, _k: e.id }));
  let seq = 0;
  const snapshot = JSON.stringify(rows.map(({ titulo, tipo, fecha: f, porcentaje, id }) => ({ id, titulo, tipo, f, porcentaje })));
  const list = h('div.plan-list');
  const totalEl = h('div.big');
  const msgEl = h('div.cell-sub');
  const bar = progress(0);
  let saveBtn;
  const root = h('div');

  const serialize = () => JSON.stringify(rows.map(({ titulo, tipo, fecha: f, porcentaje, id }) => ({ id, titulo, tipo, f, porcentaje })));

  function total() { return Math.round(rows.reduce((s, r) => s + (Number(r.porcentaje) || 0), 0) * 100) / 100; }

  function validRow(r) {
    const p = Number(r.porcentaje);
    return r.titulo.trim().length >= 2 && p > 0 && p <= 100;
  }

  function update() {
    const t = total();
    const ok = Math.abs(t - 100) < 0.001;
    totalEl.textContent = `${nota(t)} %`;
    totalEl.className = `big ${ok ? 'is-ok' : t > 100 ? 'is-over' : ''}`;
    msgEl.textContent = ok ? 'Plan completo. Ya puede guardarlo.' : t > 100 ? `Excede por ${nota(Math.round((t - 100) * 100) / 100)} %. Ajuste los pesos.` : `Faltan ${nota(Math.round((100 - t) * 100) / 100)} % para completar el plan.`;
    bar.set(Math.min(t, 100), ok ? 'ok' : t > 100 ? 'over' : 'warn');
    const dirty = serialize() !== snapshot;
    root.dataset.dirty = String(dirty);
    saveBtn.disabled = !ok || !dirty || !rows.every(validRow);
    if (dirty) router.setGuard(() => 'El plan de evaluación tiene cambios sin guardar.');
    else router.clearGuard();
  }

  function rowEl(r) {
    const titulo = input({ value: r.titulo, placeholder: 'Ej. Examen parcial', maxlength: 80, 'aria-label': 'Título de la evaluación', oninput: (e) => { r.titulo = e.target.value; update(); } });
    const tipo = select(tipos, { value: r.tipo || tipos[0], 'aria-label': 'Tipo', onchange: (e) => { r.tipo = e.target.value; update(); } });
    const f = input({ type: 'date', value: r.fecha || '', 'aria-label': 'Fecha', onchange: (e) => { r.fecha = e.target.value; update(); } });
    const pctIn = input({
      value: r.porcentaje ?? '', inputmode: 'decimal', 'aria-label': 'Porcentaje', maxlength: 6,
      oninput: (e) => {
        const v = e.target.value.replace(',', '.');
        r.porcentaje = v === '' ? '' : Number(v);
        e.target.setAttribute('aria-invalid', String(v !== '' && !(Number(v) > 0 && Number(v) <= 100)));
        update();
      },
    });
    const el = h('div.plan-row',
      titulo, tipo, f, h('div.pct-input', pctIn),
      button({
        iconName: 'trash', variant: 'ghost', title: 'Quitar evaluación',
        onClick: async () => {
          const n = r.id ? notasPorEval.get(r.id) : 0;
          if (n) {
            const ok = await confirmDialog({
              title: `Quitar “${r.titulo}”`, tone: 'danger', confirmLabel: 'Quitar',
              message: `Esta evaluación tiene ${plural(n, 'nota cargada', 'notas cargadas')}. Al guardar el plan se eliminarán.`,
            });
            if (!ok) return;
          }
          rows = rows.filter((x) => x !== r);
          el.remove();
          if (!rows.length) append(list, emptyRow);
          update();
        },
      }));
    if (!r.titulo) setTimeout(() => titulo.focus(), 30);
    return el;
  }

  const emptyRow = h('div.cell-sub', { style: { padding: '12px 0' } }, 'Agregue la primera evaluación del lapso.');

  function addRow(preset = {}) {
    emptyRow.remove();
    const restante = Math.max(0, Math.round((100 - total()) * 100) / 100);
    const r = { _k: `n${++seq}`, id: '', titulo: '', tipo: tipos[0], fecha: '', porcentaje: restante || '', ...preset };
    rows.push(r);
    append(list, rowEl(r));
    update();
  }

  async function save() {
    setLoading(saveBtn, true);
    try {
      const next = await api.send('saveEvaluationPlan', {
        materia_id: ws.materia.id, lapso: ws.lapso,
        evaluaciones: rows.map((r) => ({ id: r.id || undefined, titulo: r.titulo, tipo: r.tipo, fecha: r.fecha, porcentaje: Number(r.porcentaje) })),
      });
      setWs(next);
      router.clearGuard();
      root.dataset.dirty = 'false';
      toast.success('Plan de evaluación guardado', `${plural(next.evaluaciones.length, 'evaluación', 'evaluaciones')} · 100 %`);
      goTab('notas');
    } catch (e) {
      toast.error('No se pudo guardar el plan', e.message);
      setLoading(saveBtn, false);
    }
  }

  if (rows.length) rows.forEach((r) => append(list, rowEl(r)));
  else append(list, emptyRow);

  const plantilla = rows.length ? null : button({
    label: 'Usar plantilla sugerida', size: 'sm', iconName: 'layers',
    onClick: () => {
      rows = [];
      clear(list);
      [['Prueba corta', 'Prueba corta', 15], ['Taller en clase', 'Taller', 20], ['Examen parcial', 'Examen', 25], ['Proyecto', 'Proyecto', 15], ['Examen final de lapso', 'Examen', 25]]
        .forEach(([titulo, tipo, porcentaje]) => addRow({ titulo, tipo, porcentaje }));
    },
  });

  append(root, h('div.grid', { style: { gridTemplateColumns: 'minmax(0, 1fr)', gap: '16px' } },
    h('section.card',
      h('div.card-header',
        h('div', h('h2', 'Evaluaciones del lapso'), h('p.cell-sub', 'Cada actividad se califica de 1 a 20; su peso define cuánto aporta a la nota del lapso.')),
        plantilla),
      h('div.card-body.stack', { style: { '--gap': '12px' } },
        h('div.plan-row.plan-head', h('span', 'Evaluación'), h('span', 'Tipo'), h('span', 'Fecha'), h('span', { style: { textAlign: 'right' } }, 'Peso'), h('span')),
        list,
        h('div', button({ label: 'Agregar evaluación', iconName: 'plus', size: 'sm', onClick: () => addRow() }))),
      h('div.card-footer.row-between.wrap',
        h('div.plan-total',
          totalEl,
          h('div.stack', { style: { '--gap': '6px', minWidth: '220px' } }, bar, msgEl)),
        saveBtn = button({ label: 'Guardar plan', variant: 'primary', iconName: 'save', onClick: save })))));
  update();
  return root;
}
