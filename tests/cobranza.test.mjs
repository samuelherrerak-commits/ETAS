import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
globalThis.SCE = require('../backend/core.js');
const SEED = require('../backend/seed.js');

// Hora de Venezuela = UTC−4. ve(2026, 10, 3, 9) → 3 oct 2026, 9:00 a. m. en Caracas.
const ve = (y, m, d, h = 9) => Date.UTC(y, m - 1, d, h + 4);

function setup(start) {
  let clock = start;
  const tables = {};
  const cache = new Map();
  const a = {
    now: () => clock,
    uuid: () => randomUUID(),
    sha256: (s) => createHash('sha256').update(s, 'utf8').digest('hex'),
    hmac: (s) => createHmac('sha256', 'k').update(s, 'utf8').digest('hex'),
    cacheGet: (k) => cache.get(k) ?? null,
    cachePut: (k, v) => cache.set(k, v),
    readAll: (t) => (tables[t] || []).map((r) => ({ ...r })),
    append: (t, rows) => { (tables[t] ||= []).push(...rows.map((r) => ({ ...r }))); },
    update: (t, key, rows) => rows.forEach((r) => { const i = tables[t].findIndex((x) => String(x[key]) === String(r[key])); tables[t][i] = { ...r }; }),
    remove: (t, key, keys) => { tables[t] = (tables[t] || []).filter((r) => !keys.includes(r[key])); },
  };
  Object.assign(tables, SEED.build(a));
  const call = (action, params = {}, token) => SCE.handle(a, { action, params, token });
  const login = (cedula) => call('login', { cedula, password: SEED.DEMO_PASSWORD }).data.token;
  return { a, tables, call, login, setClock: (t) => { clock = t; } };
}

test('el mes en curso vence después del día límite (hora de Venezuela)', () => {
  const env = setup(ve(2026, 10, 3));
  // Estudiante que pagó septiembre pero no octubre
  const pagos = env.tables.Mensualidades;
  const est = env.tables.Usuarios.find((u) => u.rol === 'estudiante'
    && pagos.some((m) => m.estudiante_id === u.id && m.mes === '2026-09')
    && !pagos.some((m) => m.estudiante_id === u.id && m.mes === '2026-10'));
  // Se inicia sesión en cada consulta: el token expira a las 12 h y el reloj avanza días.
  const cuenta = () => env.call('getEstadoCuenta', { estudiante_id: est.id }, env.login('10000001')).data.cuenta;

  env.setClock(ve(2026, 10, 5, 23)); // 5 oct, 11 p. m. en Caracas (ya 6 oct en UTC)
  assert.equal(cuenta().estado, 'solvente');
  assert.equal(cuenta().meses.find((m) => m.mes === '2026-10').estado, 'por_vencer');

  env.setClock(ve(2026, 10, 6, 0, 30));
  assert.equal(cuenta().estado, 'moroso');
  assert.deepEqual(cuenta().vencidos, ['2026-10']);

  env.setClock(ve(2026, 12, 10));
  assert.deepEqual(cuenta().vencidos, ['2026-10', '2026-11', '2026-12'], 'la deuda se acumula');
  assert.equal(cuenta().deuda, 3 * 85);
});

test('año escolar de septiembre a agosto', () => {
  const meses = SCE.mesesDelPeriodo('2026-2027', SCE.CONFIG_DEFAULTS);
  assert.equal(meses.length, 12);
  assert.equal(meses[0], '2026-09');
  assert.equal(meses[11], '2027-08');
});

test('exonerado siempre solvente; morosidad bloquea notas', () => {
  const env = setup(ve(2026, 10, 10));
  const admin = env.login('10000001');
  assert.equal(env.call('getStudentReport', {}, env.login('30333444')).data.bloqueado, true);
  env.call('setCondicion', { estudiante_id: 'est-moroso', condicion: 'exonerado', observaciones: 'Beca' }, admin);
  assert.equal(env.call('getStudentReport', {}, env.login('30333444')).data.bloqueado, false);
});

test('reporte → aprobación → solvente → constancia verificable', () => {
  const env = setup(ve(2026, 10, 3));
  const rep = env.login('15555666');
  const admin = env.login('10000001');
  const deuda = env.call('getEstadoCuenta', { estudiante_id: 'est-moroso' }, rep).data.cuenta.vencidos;
  assert.ok(deuda.length >= 1);

  // Constancia negada mientras sea moroso
  assert.equal(env.call('getConstanciaSolvencia', { estudiante_id: 'est-moroso' }, rep).error.code, 'MOROSO');
  // No se puede reportar un mes que ya está en un reporte pendiente (rp-1)
  const dup = env.call('reportPayment', { estudiante_id: 'est-moroso', meses: deuda, banco: 'Banesco', referencia: '99999', monto: 85, fecha_pago: '2026-10-02' }, rep);
  assert.match(dup.error.message, /reporte pendiente/);

  const ok = env.call('reviewPaymentReport', { id: 'rp-1', decision: 'aprobado' }, admin);
  assert.equal(ok.ok, true, JSON.stringify(ok.error));
  const cuenta = env.call('getEstadoCuenta', { estudiante_id: 'est-moroso' }, rep).data;
  assert.equal(cuenta.cuenta.estado, 'solvente');
  assert.ok(cuenta.reportes.find((r) => r.id === 'rp-1').fecha_revision);

  // Mes ya pagado no se puede volver a reportar
  const pagado = env.call('reportPayment', { estudiante_id: 'est-moroso', meses: deuda, banco: 'Banesco', referencia: '888888', monto: 85, fecha_pago: '2026-10-02' }, rep);
  assert.match(pagado.error.message, /ya está pagado/);

  const c = env.call('getConstanciaSolvencia', { estudiante_id: 'est-moroso' }, rep);
  assert.equal(c.ok, true);
  const v = env.call('verificarConstancia', { codigo: c.data.codigo });
  assert.equal(v.data.valido, true);
  assert.equal(v.data.estudiante, 'Diego Salazar');
  assert.equal(env.call('verificarConstancia', { codigo: c.data.codigo.slice(0, -1) + 'X' }).data.valido, false);
});

test('pago en caja registrado por administración', () => {
  const env = setup(ve(2026, 10, 10));
  const admin = env.login('10000001');
  const antes = env.call('getEstadoCuenta', { estudiante_id: 'est-moroso' }, admin).data.cuenta;
  const r = env.call('registerPayment', { estudiante_id: 'est-moroso', meses: antes.vencidos }, admin);
  assert.equal(r.data.cuenta.estado, 'solvente');
  assert.ok(r.data.cuenta.meses.filter((m) => m.metodo === 'caja').length >= 1);
});

test('configuración institucional validada', () => {
  const env = setup(ve(2026, 10, 3));
  const admin = env.login('10000001');
  assert.equal(env.call('updateInstitucion', { color_primario: 'azul' }, admin).ok, false);
  assert.equal(env.call('updateInstitucion', { logo: 'data:text/html;base64,AAAA' }, admin).ok, false);
  assert.equal(env.call('updateInstitucion', { dia_limite_pago: 31 }, admin).ok, false);
  const ok = env.call('updateInstitucion', { color_primario: '#7A1F2B', nombre: 'Colegio San Ejemplo' }, admin);
  assert.equal(ok.ok, true);
  const pub = env.call('publicInfo').data;
  assert.equal(pub.color_primario, '#7a1f2b');
  assert.equal(pub.nombre, 'Colegio San Ejemplo');
});

test('asistencia dispersa: solo se guardan ausencias', () => {
  const env = setup(ve(2026, 10, 3));
  const prof = env.login('12345678');
  const ws = env.call('getSubjectWorkspace', { materia_id: 'mat-1' }, prof).data;
  const regs = ws.estudiantes.map((s) => ({ estudiante_id: s.id, estado: 'presente' }));
  const filas = () => env.tables.Asistencia.filter((x) => x.materia_id === 'mat-1' && x.fecha === '2026-10-02').length;
  const clases = env.tables.Clases.length;
  env.call('markAttendance', { materia_id: 'mat-1', fecha: '2026-10-02', registros: regs }, prof);
  assert.equal(env.tables.Clases.length, clases + 1);
  assert.equal(filas(), 0);
  regs[0].estado = 'ausente';
  const r = env.call('markAttendance', { materia_id: 'mat-1', fecha: '2026-10-02', registros: regs }, prof);
  assert.equal(filas(), 1);
  assert.equal(r.data.estudiantes[0].estado, 'ausente');
  regs[0].estado = 'presente';
  env.call('markAttendance', { materia_id: 'mat-1', fecha: '2026-10-02', registros: regs }, prof);
  assert.equal(filas(), 0);
  assert.equal(env.tables.Clases.length, clases + 1, 'no duplica la clase');
});

test('límite de intentos de inicio de sesión', () => {
  const env = setup(ve(2026, 10, 3));
  for (let i = 0; i < 5; i++) assert.equal(env.call('login', { cedula: '12345678', password: 'mala' }).error.code, 'CREDENCIALES');
  assert.equal(env.call('login', { cedula: '12345678', password: SEED.DEMO_PASSWORD }).error.code, 'BLOQUEADO');
});

test('solo las escrituras toman el candado', () => {
  assert.equal(SCE.isWrite('saveGrades'), true);
  assert.equal(SCE.isWrite('getStudentReport'), false);
});
