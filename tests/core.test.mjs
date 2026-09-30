import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
globalThis.SCE = require('../backend/core.js');
const SEED = require('../backend/seed.js');

function memoryAdapter() {
  const tables = {};
  const a = {
    now: () => Date.now(),
    uuid: () => randomUUID(),
    sha256: (s) => createHash('sha256').update(s, 'utf8').digest('hex'),
    hmac: (s) => createHmac('sha256', 'test-secret').update(s, 'utf8').digest('hex'),
    readAll: (t) => (tables[t] || []).map((r) => ({ ...r })),
    append: (t, rows) => { (tables[t] ||= []).push(...rows.map((r) => ({ ...r }))); },
    update: (t, key, rows) => rows.forEach((r) => {
      const i = tables[t].findIndex((x) => String(x[key]) === String(r[key]));
      tables[t][i] = { ...r };
    }),
    remove: (t, key, keys) => { tables[t] = (tables[t] || []).filter((r) => !keys.includes(r[key])); },
    tables,
  };
  Object.assign(tables, SEED.build(a));
  return a;
}

const adapter = memoryAdapter();
const call = (action, params = {}, token) => SCE.handle(adapter, { action, params, token });
const login = (cedula) => {
  const r = call('login', { cedula, password: SEED.DEMO_PASSWORD });
  assert.equal(r.ok, true, JSON.stringify(r.error));
  return r.data.token;
};

test('login y rechazo de credenciales', () => {
  assert.equal(call('login', { cedula: '12345678', password: 'mala' }).error.code, 'CREDENCIALES');
  assert.equal(call('login', { cedula: 'V-12.345.678', password: SEED.DEMO_PASSWORD }).ok, true);
  assert.equal(call('session', {}, 'x.y.z').error.code, 'SESION');
});

test('el profesor solo ve sus materias y la lista de su grado', () => {
  const t = login('12345678');
  const subs = call('getTeacherSubjects', {}, t).data;
  assert.deepEqual(subs.map((s) => `${s.nombre} - ${s.grado.nombre}`),
    ['Matemáticas - 1er Año', 'Física - 4to Año', 'Física - 5to Año', 'Física - 6to Año']);
  const lista = call('getClassList', { materia_id: subs[0].id }, t).data;
  assert.ok(lista.some((e) => e.nombre === 'Valentina Herrera'));
  const ajena = call('getClassList', { materia_id: 'mat-2' }, t);
  assert.equal(ajena.error.code, 'PROHIBIDO');
});

test('estudiante moroso no recibe notas; el solvente sí', () => {
  const moroso = call('getStudentReport', {}, login('30333444')).data;
  assert.equal(moroso.bloqueado, true);
  assert.equal(moroso.materias, undefined);
  const ok = call('getStudentReport', {}, login('30111222')).data;
  assert.equal(ok.bloqueado, false);
  assert.ok(ok.materias.length > 0);
  assert.ok(ok.materias[0].lapsos[0].nota !== null, 'el 1er lapso está completo');
});

test('el representante solo accede a sus hijos', () => {
  const t = login('15555666');
  const hijos = call('getRepresentativeHome', {}, t).data;
  assert.deepEqual(hijos.map((h) => h.nombre).sort(), ['Diego Salazar', 'Sofía Salazar']);
  assert.equal(hijos.find((h) => h.nombre === 'Diego Salazar').promedio, null);
  assert.equal(call('getStudentReport', { estudiante_id: 'est-demo' }, t).error.code, 'PROHIBIDO');
});

test('plan de evaluación exige 100 % y notas entre 1 y 20', () => {
  const t = login('12345678');
  const base = { materia_id: 'mat-1', lapso: 2 };
  let r = call('saveEvaluationPlan', { ...base, evaluaciones: [{ titulo: 'Examen', tipo: 'Examen', porcentaje: 60 }] }, t);
  assert.match(r.error.message, /100/);
  const ws = call('getSubjectWorkspace', base, t).data;
  const ev = ws.evaluaciones[0];
  const est = ws.estudiantes[0];
  r = call('saveGrades', { ...base, notas: [{ estudiante_id: est.id, evaluacion_id: ev.id, calificacion: 21 }] }, t);
  assert.equal(r.ok, false);
  r = call('saveGrades', { ...base, notas: [{ estudiante_id: est.id, evaluacion_id: ev.id, calificacion: 18.5 }] }, t);
  assert.equal(r.ok, true);
  assert.equal(r.data.estudiantes[0].notas[ev.id], 18.5);
});

test('lapsos cerrados son de solo lectura', () => {
  const t = login('12345678');
  const r = call('saveGrades', { materia_id: 'mat-1', lapso: 1, notas: [] }, t);
  assert.equal(r.error.code, 'LAPSO_CERRADO');
  assert.equal(call('getSubjectWorkspace', { materia_id: 'mat-1', lapso: 1 }, t).data.editable, false);
});

test('cálculo ponderado y definitiva', () => {
  const evs = [{ id: 'a', porcentaje: 40 }, { id: 'b', porcentaje: 60 }];
  assert.equal(SCE.calcLapso(evs, { a: 10, b: 20 }).nota, 16);
  assert.equal(SCE.calcLapso(evs, { a: 10 }).nota, null);
  assert.equal(SCE.calcLapso(evs, { a: 10 }).parcial, 10);
  assert.equal(SCE.calcDefinitiva([9.5, 10, 10]).definitiva, 10);
  assert.equal(SCE.redondear(9.49), 9);
});

test('promoción: requiere 3er lapso con carga cerrada y mueve de grado', () => {
  const t = login('10000001');
  assert.equal(call('executePromotion', { confirmacion: 'PROMOVER' }, t).ok, false);
  call('setLapso', { lapso: 3 }, t);
  call('setCargaAbierta', { abierta: false }, t);
  const prev = call('previewPromotion', {}, t).data;
  assert.ok(prev.filas.length > 0);
  const r = call('executePromotion', { confirmacion: 'PROMOVER' }, t);
  assert.equal(r.ok, true, JSON.stringify(r.error));
  const fila = prev.filas.find((f) => f.resultado === 'promovido');
  if (fila) {
    const u = adapter.tables.Usuarios.find((x) => x.id === fila.estudiante_id);
    assert.equal(u.grado_id, fila.grado_destino.id);
  }
  assert.equal(call('executePromotion', { confirmacion: 'PROMOVER' }, t).ok, false);
  assert.equal(call('openNewPeriod', { nombre: '2099-2100' }, t).ok, true);
});
