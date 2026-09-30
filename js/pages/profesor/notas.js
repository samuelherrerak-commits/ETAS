import { h, icon, append, replace } from '../../lib/dom.js';
import { api } from '../../api/client.js';
import { router } from '../../lib/router.js';
import { store } from '../../lib/store.js';
import { calcLapso, parseNota } from '../../lib/grading.js';
import { nota, fecha, pct, plural, redondear, cedula as fmtCed } from '../../lib/format.js';
import { button, setLoading, emptyState, callout, gradePill } from '../../ui/components.js';
import { toast } from '../../ui/toast.js';

/**
 * Matriz de carga de notas tipo hoja de cálculo:
 * - Escala 1–20 validada en vivo; la nota del lapso se recalcula al teclear.
 * - Flechas / Enter para moverse, pegar bloques desde Excel o Sheets.
 * - Guardado masivo solo de las celdas modificadas.
 */
export function notasTab({ ws, setWs, goTab }) {
  const evals = ws.evaluaciones;
  const planOk = Math.abs(evals.reduce((s, e) => s + e.porcentaje, 0) - 100) < 0.001;

  if (!evals.length) {
    return h('div.card', emptyState({
      iconName: 'layers',
      title: 'Primero defina el plan de evaluación',
      text: 'Las columnas de la planilla se crean a partir de las evaluaciones del lapso, cuyos porcentajes deben sumar 100 %.',
      action: ws.editable ? button({ label: 'Crear plan de evaluación', variant: 'primary', iconName: 'plus', onClick: () => goTab('plan') }) : null,
    }));
  }
  if (!ws.estudiantes.length) {
    return h('div.card', emptyState({ iconName: 'users', title: 'No hay estudiantes inscritos', text: `Cuando la administración inscriba estudiantes en ${ws.grado?.nombre}, aparecerán aquí.` }));
  }

  const reglas = store.reglas;
  // Estado: valores originales, valores actuales (texto) y celdas inválidas.
  const original = new Map();
  const current = new Map();
  const invalid = new Set();
  const inputs = [];
  const finals = new Map();
  const key = (s, e) => `${s}|${e}`;

  ws.estudiantes.forEach((s) => evals.forEach((e) => {
    const v = s.notas[e.id];
    original.set(key(s.id, e.id), v === undefined ? '' : String(v));
    current.set(key(s.id, e.id), v === undefined ? '' : String(v));
  }));

  const dirtyKeys = () => [...current.keys()].filter((k) => normalized(current.get(k)) !== normalized(original.get(k)));
  const normalized = (t) => { const p = parseNota(t); return p.ok ? String(p.value ?? '') : `x${t}`; };

  const root = h('div');
  const saveCount = h('span');
  const saveHint = h('span.cell-sub', { style: { color: '#98a3b6' } });
  let saveBtn;
  const saveBar = h('div.save-bar', { role: 'region', 'aria-label': 'Cambios sin guardar' },
    h('div', h('div', { style: { fontWeight: 600, color: '#fff' } }, saveCount), saveHint),
    h('div.row',
      button({ label: 'Descartar', variant: 'ghost', size: 'sm', onClick: discard }),
      saveBtn = button({ label: 'Guardar notas', variant: 'primary', size: 'sm', iconName: 'save', onClick: save })));

  function rowValues(sid) {
    const out = {};
    evals.forEach((e) => {
      const p = parseNota(current.get(key(sid, e.id)), { min: reglas.nota_min, max: reglas.nota_max });
      if (p.ok && p.value !== null) out[e.id] = p.value;
    });
    return out;
  }

  function paintFinal(sid) {
    const c = calcLapso(evals, rowValues(sid));
    const cell = finals.get(sid);
    const shown = c.nota !== null ? c.nota : c.parcial;
    replace(cell, 
      gradePill(shown, { title: c.nota !== null ? 'Nota definitiva del lapso' : `Promedio parcial · ${pct(c.evaluado_pct)} evaluado` }),
      c.nota === null && c.parcial !== null ? h('div.cell-sub', { style: { marginTop: '2px' } }, `${pct(c.evaluado_pct)} eval.`) : null);
  }

  function paintSummary() {
    const vals = ws.estudiantes.map((s) => {
      const c = calcLapso(evals, rowValues(s.id));
      return c.nota !== null ? c.nota : c.parcial;
    }).filter((v) => v !== null);
    const aprob = vals.filter((v) => redondear(v) >= reglas.aprobatoria).length;
    const prom = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    replace(summary, 
      h('span', 'Promedio de la sección: ', h('strong.num', nota(prom === null ? null : Math.round(prom * 100) / 100))),
      h('span', 'Aprobados: ', h('strong.num', `${aprob}/${vals.length}`)),
      h('span', 'Aplazados: ', h('strong.num', { style: { color: vals.length - aprob ? 'var(--red-600)' : null } }, String(vals.length - aprob))));
  }

  function refreshState() {
    const dirty = dirtyKeys();
    root.dataset.dirty = String(dirty.length > 0);
    saveCount.textContent = invalid.size
      ? `${plural(invalid.size, 'celda inválida', 'celdas inválidas')}`
      : `${plural(dirty.length, 'cambio sin guardar', 'cambios sin guardar')}`;
    saveHint.textContent = invalid.size ? `Corrija los valores fuera de ${reglas.nota_min}–${reglas.nota_max}.` : 'Se guardan solo las celdas modificadas.';
    saveBtn.disabled = invalid.size > 0 || !dirty.length;
    saveBar.classList.toggle('is-visible', dirty.length > 0 || invalid.size > 0);
    if (dirty.length) router.setGuard(() => 'Tiene calificaciones sin guardar. Si sale ahora se perderán.');
    else router.clearGuard();
  }

  function onCellInput(inp) {
    const { sid, eid } = inp.dataset;
    const k = key(sid, eid);
    current.set(k, inp.value);
    const p = parseNota(inp.value, { min: reglas.nota_min, max: reglas.nota_max });
    inp.classList.toggle('is-invalid', !p.ok);
    inp.classList.toggle('is-low', p.ok && p.value !== null && redondear(p.value) < reglas.aprobatoria);
    inp.classList.toggle('is-dirty', normalized(inp.value) !== normalized(original.get(k)));
    inp.title = p.ok ? '' : p.error;
    inp.setAttribute('aria-invalid', String(!p.ok));
    if (p.ok) invalid.delete(k); else invalid.add(k);
    paintFinal(sid);
    paintSummary();
    refreshState();
  }

  function focusCell(r, c) {
    const inp = inputs[r]?.[c];
    if (inp) { inp.focus(); inp.select(); }
  }

  function onKey(e) {
    const inp = e.target;
    const r = Number(inp.dataset.r), c = Number(inp.dataset.c);
    const atStart = inp.selectionStart === 0 && inp.selectionEnd === 0;
    const atEnd = inp.selectionStart === inp.value.length;
    const all = inp.selectionStart === 0 && inp.selectionEnd === inp.value.length;
    if (e.key === 'ArrowDown' || (e.key === 'Enter' && !e.shiftKey)) { e.preventDefault(); focusCell(r + 1, c); }
    else if (e.key === 'ArrowUp' || (e.key === 'Enter' && e.shiftKey)) { e.preventDefault(); focusCell(r - 1, c); }
    else if (e.key === 'ArrowRight' && (atEnd || all)) { e.preventDefault(); focusCell(r, c + 1); }
    else if (e.key === 'ArrowLeft' && (atStart || all)) { e.preventDefault(); focusCell(r, c - 1); }
    else if (e.key === 'Escape') {
      inp.value = original.get(key(inp.dataset.sid, inp.dataset.eid));
      onCellInput(inp);
      inp.select();
    } else if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); if (!saveBtn.disabled) save(); }
  }

  /** Pegar un bloque copiado de Excel / Google Sheets a partir de la celda activa. */
  function onPaste(e) {
    const text = e.clipboardData?.getData('text') || '';
    if (!/[\t\n]/.test(text.trim())) return;
    e.preventDefault();
    const r0 = Number(e.target.dataset.r), c0 = Number(e.target.dataset.c);
    let count = 0;
    text.replace(/\r/g, '').split('\n').filter((l, i, a) => l !== '' || i < a.length - 1).forEach((line, dr) => {
      line.split('\t').forEach((val, dc) => {
        const inp = inputs[r0 + dr]?.[c0 + dc];
        if (!inp) return;
        inp.value = val.trim();
        onCellInput(inp);
        count++;
      });
    });
    toast.info('Datos pegados', plural(count, 'celda actualizada', 'celdas actualizadas'));
  }

  function discard() {
    inputs.flat().forEach((inp) => {
      inp.value = original.get(key(inp.dataset.sid, inp.dataset.eid));
      onCellInput(inp);
    });
  }

  async function save() {
    const cambios = dirtyKeys().map((k) => {
      const [sid, eid] = k.split('|');
      return { estudiante_id: sid, evaluacion_id: eid, calificacion: parseNota(current.get(k)).value };
    });
    if (!cambios.length || invalid.size) return;
    setLoading(saveBtn, true);
    try {
      const next = await api.send('saveGrades', { materia_id: ws.materia.id, lapso: ws.lapso, notas: cambios });
      setWs(next);
      cambios.forEach((c) => original.set(key(c.estudiante_id, c.evaluacion_id), c.calificacion === null ? '' : String(c.calificacion)));
      inputs.flat().forEach((inp) => inp.classList.remove('is-dirty'));
      toast.success('Notas guardadas', `${plural(cambios.length, 'calificación registrada', 'calificaciones registradas')} en ${ws.materia.nombre}.`);
    } catch (e) {
      toast.error('No se pudieron guardar las notas', e.message);
    }
    setLoading(saveBtn, false);
    refreshState();
  }

  // ─── Tabla ───────────────────────────────────────────────────────────
  const thead = h('thead', h('tr',
    h('th.col-student', h('span.t', 'Estudiante'), h('span.p', plural(ws.estudiantes.length, 'inscrito', 'inscritos'))),
    evals.map((e) => h('th', { title: `${e.titulo} · ${e.tipo} · ${fecha(e.fecha)}` },
      h('span.t', e.titulo),
      h('span.p', `${nota(e.porcentaje)} % · ${e.fecha ? fecha(e.fecha).replace(/ \d{4}$/, '') : e.tipo}`))),
    h('th.col-final', h('span.t', 'Lapso'), h('span.p', 'Definitiva'))));

  const tbody = h('tbody', ws.estudiantes.map((s, r) => {
    inputs[r] = [];
    const finalCell = h('td.col-final');
    finals.set(s.id, finalCell);
    return h('tr',
      h('td.col-student',
        h('div.row', { style: { '--gap': '8px' } },
          h('span.n-idx', String(r + 1)),
          h('div', { style: { minWidth: 0 } },
            h('div.cell-title.truncate', s.nombre),
            h('div.cell-sub', fmtCed(s.cedula), s.inasistencia_pct > reglas.max_inasistencia
              ? h('span', { style: { color: 'var(--red-600)' }, title: 'Inasistencia sobre el límite' }, ` · ${pct(s.inasistencia_pct)} inasist.`) : null)))),
      evals.map((e, c) => {
        const v = original.get(key(s.id, e.id));
        const inp = h('input.cell-input', {
          value: v, inputmode: 'decimal', autocomplete: 'off', placeholder: '–', maxlength: 5,
          disabled: !ws.editable,
          'aria-label': `${s.nombre}, ${e.titulo}`,
          dataset: { sid: s.id, eid: e.id, r: String(r), c: String(c) },
          oninput: (ev) => onCellInput(ev.target),
          onkeydown: onKey,
          onpaste: onPaste,
          onfocus: (ev) => ev.target.select(),
        });
        if (v !== '' && redondear(Number(v)) < reglas.aprobatoria) inp.classList.add('is-low');
        inputs[r][c] = inp;
        return h('td.cell', inp);
      }),
      finalCell);
  }));

  const summary = h('div.row.wrap.cell-sub', { style: { '--gap': '20px' } });
  ws.estudiantes.forEach((s) => paintFinal(s.id));
  paintSummary();

  const notices = [];
  if (!planOk) notices.push(callout('warn', 'alert', h('span', h('strong', 'El plan no suma 100 %. '), 'La nota del lapso se mostrará como promedio parcial hasta completar el plan.')));
  if (!ws.editable) {
    const p = ws.periodo;
    const why = store.user.rol === 'coordinador'
      ? 'Vista de supervisión: la coordinación consulta sin modificar.'
      : ws.lapso !== p.lapso_activo
        ? `Este lapso no está activo. Solo se editan notas del ${p.lapso_activo}° lapso.`
        : 'La coordinación cerró la carga de notas de este lapso.';
    notices.push(callout('info', 'lock', h('span', h('strong', 'Solo lectura. '), why)));
  } else {
    notices.push(h('div.cell-sub.row.wrap', { style: { '--gap': '16px' } },
      h('span.row', { style: { '--gap': '6px' } }, icon('info'), 'Enter o flechas para moverse · Esc deshace la celda · Ctrl+S guarda'),
      h('span', 'Puede pegar un bloque copiado de Excel o Google Sheets.')));
  }

  append(root, h('div.stack', { style: { '--gap': '14px' } },
    ...notices,
    h('section.card',
      h('div.card-header', summary),
      h('div.sheet-wrap', h('table.sheet', thead, tbody))),
    saveBar));
  refreshState();
  return root;
}
