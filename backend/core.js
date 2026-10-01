/**
 * Sistema de Control de Estudios — núcleo de negocio.
 *
 * Este archivo es la ÚNICA fuente de verdad de las reglas del sistema:
 * permisos por rol, escala 1–20, ponderación por lapsos, morosidad,
 * asistencia y promoción de año.
 *
 * Corre sin cambios en dos entornos:
 *   - Google Apps Script (concatenado dentro de Code.gs, adaptador Sheets).
 *   - El navegador en modo demo (adaptador localStorage).
 *
 * Sin módulos ni dependencias: define el global `SCE`.
 */
var SCE = (function () {
  'use strict';

  var VERSION = '1.0.0';
  var TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
  var HASH_ROUNDS = 64;

  var NOTA_MIN = 1;
  var NOTA_MAX = 20;
  var NOTA_APROBATORIA = 10;
  var MAX_INASISTENCIA_PCT = 25;
  var MAX_MATERIAS_PENDIENTES = 2;
  var LAPSOS = [1, 2, 3];

  var ROLES = ['admin', 'coordinador', 'profesor', 'estudiante', 'representante'];
  var RASGOS = ['Responsabilidad', 'Puntualidad', 'Respeto', 'Participación', 'Trabajo en equipo'];
  var ESCALA_RASGOS = { A: 'Excelente', B: 'Bueno', C: 'Regular', D: 'Por mejorar' };
  var TIPOS_EVALUACION = ['Examen', 'Prueba corta', 'Taller', 'Proyecto', 'Exposición', 'Informe', 'Tarea', 'Otro'];
  var BANCOS = ['Banco de Venezuela', 'Banesco', 'Mercantil', 'Provincial', 'Bancaribe', 'Banco Nacional de Crédito', 'Banco Exterior', 'Bancamiga', 'Banco del Tesoro', 'Pago Móvil', 'Zelle', 'Efectivo'];

  /**
   * Esquema de la base de datos (una pestaña de Google Sheets por tabla).
   * `key` es la columna de identidad; `num` y `bool` guían la normalización
   * porque Sheets (en formato texto plano) devuelve todo como string.
   */
  var SCHEMA = {
    Config: { key: 'clave', cols: ['clave', 'valor', 'descripcion'] },
    Periodos: {
      cols: ['id', 'nombre', 'lapso_activo', 'carga_abierta', 'estado', 'promocion_ejecutada', 'creado'],
      num: ['lapso_activo'], bool: ['carga_abierta', 'promocion_ejecutada']
    },
    Grados: { cols: ['id', 'nombre', 'orden', 'seccion'], num: ['orden'] },
    Usuarios: { cols: ['id', 'cedula', 'password_hash', 'nombre', 'rol', 'grado_id', 'estado', 'email', 'telefono', 'creado'] },
    Relacion_Familiar: { cols: ['id', 'representante_id', 'estudiante_id', 'parentesco'] },
    Materias_Asignadas: { cols: ['id', 'nombre', 'grado_id', 'profesor_id'] },
    PlanesEvaluacion: {
      cols: ['id', 'materia_id', 'periodo_id', 'lapso', 'titulo', 'tipo', 'porcentaje', 'fecha'],
      num: ['lapso', 'porcentaje']
    },
    Notas: { cols: ['id', 'estudiante_id', 'evaluacion_id', 'calificacion', 'actualizado'], num: ['calificacion'] },
    // Asistencia dispersa: solo se guardan ausencias y justificadas; las clases
    // dictadas viven en Clases. Reduce ~20× las filas frente a guardar presentes.
    Clases: { cols: ['id', 'materia_id', 'periodo_id', 'lapso', 'fecha'], num: ['lapso'] },
    Asistencia: { cols: ['id', 'materia_id', 'periodo_id', 'lapso', 'fecha', 'estudiante_id', 'estado'], num: ['lapso'] },
    // Excepciones de cobro por estudiante. La solvencia NO se guarda: se calcula.
    Pagos: { key: 'estudiante_id', cols: ['estudiante_id', 'condicion', 'ultima_actualizacion', 'observaciones'] },
    Mensualidades: {
      cols: ['id', 'estudiante_id', 'periodo_id', 'mes', 'monto', 'metodo', 'reporte_id', 'referencia', 'verificado_por', 'fecha_verificacion'],
      num: ['monto']
    },
    Reportes_Pago: {
      cols: ['id', 'estudiante_id', 'representante_id', 'referencia', 'banco', 'monto', 'fecha_pago', 'estado', 'creado', 'revisado_por', 'observacion', 'meses', 'fecha_revision'],
      num: ['monto']
    },
    Avisos: { cols: ['id', 'titulo', 'contenido', 'fecha', 'roles_destino', 'prioridad', 'autor_id'] },
    Rasgos: { cols: ['id', 'estudiante_id', 'periodo_id', 'lapso', 'rasgo', 'valor'], num: ['lapso'] },
    Materias_Pendientes: {
      cols: ['id', 'estudiante_id', 'periodo_id', 'grado_id', 'materia', 'definitiva', 'estado'],
      num: ['definitiva']
    },
    Promociones: { cols: ['id', 'periodo_id', 'estudiante_id', 'grado_origen', 'grado_destino', 'resultado', 'detalle', 'fecha'] }
  };

  var CONFIG_DEFAULTS = {
    nombre: 'Unidad Educativa ETAS',
    codigo_dea: 'PD00000000',
    rif: 'J-00000000-0',
    direccion: 'Caracas, Venezuela',
    telefono: '(0212) 000-0000',
    email: 'administracion@colegio.edu.ve',
    director: 'Director(a)',
    ciudad: 'Caracas',
    logo: '',
    color_primario: '#0f172a',
    color_acento: '#2563eb',
    mensualidad_monto: '85',
    moneda: 'USD',
    dia_limite_pago: '5',
    mes_inicio_cobro: '9',
    mes_fin_cobro: '8'
  };

  /** Ayuda que se escribe en la columna "descripcion" de la pestaña Config. */
  var CONFIG_INFO = {
    nombre: 'Nombre del plantel (membrete, login y PDF).',
    codigo_dea: 'Código DEA asignado por el Ministerio.',
    rif: 'RIF de la institución.',
    direccion: 'Dirección completa.',
    telefono: 'Teléfono de administración.',
    email: 'Correo de administración.',
    director: 'Nombre del director(a) que firma boletines.',
    ciudad: 'Ciudad.',
    logo: 'Logo como imagen data:image/... (súbalo desde Configuración en el portal).',
    color_primario: 'Color institucional principal en hexadecimal (#RRGGBB). Barra lateral y encabezados.',
    color_acento: 'Color de acento en hexadecimal (#RRGGBB). Botones y enlaces.',
    mensualidad_monto: 'Monto de la mensualidad.',
    moneda: 'Moneda de la mensualidad (USD, Bs., EUR).',
    dia_limite_pago: 'Último día del mes para pagar el mes en curso sin quedar insolvente (1 a 28).',
    mes_inicio_cobro: 'Primer mes que se cobra en el año escolar (1 = enero … 12 = diciembre).',
    mes_fin_cobro: 'Último mes que se cobra en el año escolar (1 a 12).'
  };

  var MESES_NOMBRE = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var LOGIN_MAX_INTENTOS = 5;
  var LOGIN_BLOQUEO_SEG = 15 * 60;

  // ───────────────────────────── utilidades ─────────────────────────────

  function SceError(code, message) {
    this.sceError = true;
    this.code = code;
    this.message = message;
  }

  function fail(code, message) { throw new SceError(code, message); }

  function assert(cond, message, code) { if (!cond) fail(code || 'VALIDACION', message); }

  function str(v) { return v === null || v === undefined ? '' : String(v).trim(); }

  function isDateObj(v) { return Object.prototype.toString.call(v) === '[object Date]'; }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function isoDate(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }

  function isIsoDate(s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    var p = s.split('-').map(Number);
    var d = new Date(p[0], p[1] - 1, p[2]);
    return d.getFullYear() === p[0] && d.getMonth() === p[1] - 1 && d.getDate() === p[2];
  }

  function round2(n) { return Math.round(n * 100) / 100; }

  /** Redondeo institucional: 9,5 → 10 (mitad hacia arriba). */
  function redondear(n) { return n === null || n === undefined ? null : Math.floor(n + 0.5 + 1e-9); }

  function avg(list) {
    if (!list.length) return null;
    var s = 0;
    for (var i = 0; i < list.length; i++) s += list[i];
    return s / list.length;
  }

  function indexBy(rows, key) {
    var m = {};
    for (var i = 0; i < rows.length; i++) m[rows[i][key]] = rows[i];
    return m;
  }

  function groupBy(rows, key) {
    var m = {};
    for (var i = 0; i < rows.length; i++) {
      var k = rows[i][key];
      (m[k] = m[k] || []).push(rows[i]);
    }
    return m;
  }

  function byNombre(a, b) { return a.nombre.localeCompare(b.nombre, 'es'); }

  function normCedula(v) { return str(v).replace(/[^0-9]/g, ''); }

  function pick(obj, keys) {
    var o = {};
    keys.forEach(function (k) { o[k] = obj[k]; });
    return o;
  }

  // ───────────────────────────── base de datos ─────────────────────────────

  function normalizeRow(table, raw) {
    var def = SCHEMA[table];
    var row = {};
    def.cols.forEach(function (c) {
      var v = raw[c];
      if (isDateObj(v)) v = isoDate(v);
      if (def.num && def.num.indexOf(c) >= 0) {
        row[c] = v === '' || v === null || v === undefined ? null : Number(v);
        if (row[c] !== null && isNaN(row[c])) row[c] = null;
      } else if (def.bool && def.bool.indexOf(c) >= 0) {
        var s = str(v).toLowerCase();
        row[c] = v === true || s === 'si' || s === 'sí' || s === 'true' || s === '1';
      } else {
        row[c] = str(v);
      }
    });
    return row;
  }

  function serializeRow(table, row) {
    var def = SCHEMA[table];
    var out = {};
    def.cols.forEach(function (c) {
      var v = row[c];
      if (def.bool && def.bool.indexOf(c) >= 0) out[c] = v ? 'si' : 'no';
      else out[c] = v === null || v === undefined ? '' : v;
    });
    return out;
  }

  /**
   * Capa de datos sobre un adaptador de bajo nivel:
   *   adapter.readAll(table)                      → objetos crudos
   *   adapter.append(table, rows)
   *   adapter.update(table, keyCol, rows)         → filas completas
   *   adapter.remove(table, keyCol, keys)
   */
  function Db(adapter) {
    this.adapter = adapter;
    this.cache = {};
  }

  Db.prototype.keyOf = function (table) { return SCHEMA[table].key || 'id'; };

  Db.prototype.all = function (table) {
    if (!this.cache[table]) {
      var raw = this.adapter.readAll(table) || [];
      var key = this.keyOf(table);
      this.cache[table] = raw
        .map(function (r) { return normalizeRow(table, r); })
        .filter(function (r) { return r[key] !== ''; });
    }
    return this.cache[table];
  };

  Db.prototype.where = function (table, pred) { return this.all(table).filter(pred); };

  /** Índice memoizado (agrupación por clave) que se invalida al escribir la tabla. */
  Db.prototype.index = function (table, col) {
    this.idx = this.idx || {};
    var k = table + '.' + col;
    if (!this.idx[k]) this.idx[k] = groupBy(this.all(table), col);
    return this.idx[k];
  };

  Db.prototype.touch = function (table) {
    if (!this.idx) return;
    for (var k in this.idx) if (k.indexOf(table + '.') === 0) delete this.idx[k];
  };

  Db.prototype.get = function (table, key) {
    var k = this.keyOf(table);
    var rows = this.all(table);
    for (var i = 0; i < rows.length; i++) if (rows[i][k] === key) return rows[i];
    return null;
  };

  Db.prototype.insert = function (table, rows) {
    var self = this;
    var key = this.keyOf(table);
    rows = Array.isArray(rows) ? rows : [rows];
    if (!rows.length) return [];
    var list = this.all(table);
    var norm = rows.map(function (r) {
      var copy = {};
      for (var p in r) copy[p] = r[p];
      if (!copy[key]) copy[key] = self.adapter.uuid();
      return normalizeRow(table, copy);
    });
    this.adapter.append(table, norm.map(function (r) { return serializeRow(table, r); }));
    Array.prototype.push.apply(list, norm);
    this.touch(table);
    return norm;
  };

  /** changes: [{ key, patch }] — se escribe en un solo lote. */
  Db.prototype.updateMany = function (table, changes) {
    if (!changes.length) return [];
    var key = this.keyOf(table);
    var list = this.all(table);
    var idx = {};
    list.forEach(function (r, i) { idx[r[key]] = i; });
    var touched = [];
    changes.forEach(function (ch) {
      var i = idx[ch.key];
      if (i === undefined) fail('NO_ENCONTRADO', 'Registro no encontrado en ' + table + '.');
      var merged = {};
      for (var p in list[i]) merged[p] = list[i][p];
      for (var q in ch.patch) merged[q] = ch.patch[q];
      list[i] = normalizeRow(table, merged);
      touched.push(list[i]);
    });
    this.adapter.update(table, key, touched.map(function (r) { return serializeRow(table, r); }));
    this.touch(table);
    return touched;
  };

  Db.prototype.update = function (table, keyValue, patch) {
    return this.updateMany(table, [{ key: keyValue, patch: patch }])[0];
  };

  Db.prototype.remove = function (table, keys) {
    if (!keys.length) return;
    var key = this.keyOf(table);
    var set = {};
    keys.forEach(function (k) { set[k] = true; });
    this.cache[table] = this.all(table).filter(function (r) { return !set[r[key]]; });
    this.adapter.remove(table, key, keys);
    this.touch(table);
  };

  // ───────────────────────────── seguridad ─────────────────────────────

  function hashPassword(adapter, password, salt) {
    salt = salt || adapter.uuid().replace(/-/g, '').slice(0, 16);
    var h = salt + ':' + password;
    for (var i = 0; i < HASH_ROUNDS; i++) h = adapter.sha256(salt + h);
    return salt + '$' + h;
  }

  function verifyPassword(adapter, password, stored) {
    stored = str(stored);
    var salt = stored.split('$')[0];
    if (!salt || stored.indexOf('$') < 0) return false;
    return hashPassword(adapter, password, salt) === stored;
  }

  function issueToken(adapter, user) {
    var body = user.id + '.' + (adapter.now() + TOKEN_TTL_MS);
    return body + '.' + adapter.hmac(body);
  }

  function readToken(adapter, token) {
    var parts = str(token).split('.');
    if (parts.length !== 3) return null;
    var body = parts[0] + '.' + parts[1];
    if (adapter.hmac(body) !== parts[2]) return null;
    if (Number(parts[1]) < adapter.now()) return null;
    return parts[0];
  }

  function tempPassword(adapter) {
    return 'sce-' + adapter.uuid().replace(/-/g, '').slice(0, 6);
  }

  function publicUser(u) {
    return {
      id: u.id, cedula: u.cedula, nombre: u.nombre, rol: u.rol,
      grado_id: u.grado_id, estado: u.estado, email: u.email, telefono: u.telefono
    };
  }

  // ─────────────────────────── cálculo académico ───────────────────────────

  /**
   * Nota de un lapso por promedio ponderado:
   *   nota = Σ (calificación_i × porcentaje_i / 100)
   * Mientras el plan no esté completamente evaluado se informa el
   * acumulado (sobre 20) y el promedio parcial de lo evaluado.
   */
  function calcLapso(evaluaciones, notasPorEval) {
    var total = 0, evaluado = 0, suma = 0;
    evaluaciones.forEach(function (e) {
      total += e.porcentaje;
      var n = notasPorEval[e.id];
      if (n !== null && n !== undefined) {
        evaluado += e.porcentaje;
        suma += n * e.porcentaje;
      }
    });
    var completo = Math.abs(total - 100) < 0.001 && Math.abs(evaluado - 100) < 0.001;
    return {
      plan_pct: round2(total),
      evaluado_pct: round2(evaluado),
      acumulado: round2(suma / 100),
      parcial: evaluado > 0 ? round2(suma / evaluado) : null,
      nota: completo ? round2(suma / 100) : null
    };
  }

  /** Definitiva = promedio de las tres notas de lapso redondeadas. */
  function calcDefinitiva(notasLapso) {
    var validas = notasLapso.filter(function (n) { return n !== null && n !== undefined; }).map(redondear);
    var completa = validas.length === LAPSOS.length;
    var prom = avg(validas);
    return {
      definitiva: completa ? redondear(prom) : null,
      parcial: prom === null ? null : round2(prom),
      completa: completa
    };
  }

  // ─────────────────────────── cobranza mensual ───────────────────────────

  /** Fecha civil en Venezuela (UTC−4 fijo, sin horario de verano). */
  function fechaVE(nowMs) {
    var d = new Date(nowMs - 4 * 3600 * 1000);
    var y = d.getUTCFullYear(), m = d.getUTCMonth() + 1, day = d.getUTCDate();
    return { y: y, m: m, d: day, mes: y + '-' + pad2(m), iso: y + '-' + pad2(m) + '-' + pad2(day) };
  }

  function nombreMes(mes) {
    var p = mes.split('-');
    var n = MESES_NOMBRE[Number(p[1]) - 1] || mes;
    return n.charAt(0).toUpperCase() + n.slice(1) + ' ' + p[0];
  }

  /** Meses que se cobran en un año escolar "AAAA-AAAA" según la configuración. */
  function mesesDelPeriodo(nombre, cfg) {
    var y = Number(String(nombre).split('-')[0]);
    var ini = Number(cfg.mes_inicio_cobro) || 9;
    var fin = Number(cfg.mes_fin_cobro) || 8;
    if (!y) return [];
    var out = [];
    var m = ini;
    for (var i = 0; i < 12; i++) {
      out.push(y + '-' + pad2(m));
      if (m === fin) break;
      m++;
      if (m > 12) { m = 1; y++; }
    }
    return out;
  }

  /**
   * Regla de solvencia: el mes en curso se paga del día 1 al día límite
   * (5 por defecto). Desde el día siguiente, cada mes exigible sin pago deja
   * al estudiante insolvente. Los meses anteriores adeudados se acumulan.
   */
  function estadoCuenta(ctx, estId, periodo) {
    var cfg = ctx.config();
    var pago = ctx.db.get('Pagos', estId);
    var exonerado = !!pago && pago.condicion === 'exonerado';
    var limite = Math.min(28, Math.max(1, Number(cfg.dia_limite_pago) || 5));
    var monto = Number(cfg.mensualidad_monto) || 0;
    var hoy = fechaVE(ctx.adapter.now());
    var base = {
      condicion: exonerado ? 'exonerado' : 'regular',
      observaciones: pago ? pago.observaciones : '',
      monto_mensual: monto, moneda: cfg.moneda, dia_limite: limite, hoy: hoy.iso
    };
    if (!periodo) {
      base.estado = 'solvente'; base.meses = []; base.vencidos = []; base.deuda = 0;
      return base;
    }
    var pagados = {};
    (ctx.db.index('Mensualidades', 'estudiante_id')[estId] || []).forEach(function (r) {
      if (r.periodo_id === periodo.id) pagados[r.mes] = r;
    });
    var enRevision = {};
    (ctx.db.index('Reportes_Pago', 'estudiante_id')[estId] || []).forEach(function (r) {
      if (r.estado === 'pendiente') str(r.meses).split(',').forEach(function (m) { if (m) enRevision[m] = r.id; });
    });
    var meses = mesesDelPeriodo(periodo.nombre, cfg).map(function (mes) {
      var p = pagados[mes];
      var estado;
      if (p) estado = 'pagado';
      else if (mes < hoy.mes) estado = 'vencido';
      else if (mes === hoy.mes) estado = hoy.d > limite ? 'vencido' : 'por_vencer';
      else estado = 'futuro';
      return {
        mes: mes, nombre: nombreMes(mes), estado: estado, en_revision: !!enRevision[mes],
        fecha_verificacion: p ? p.fecha_verificacion : '', referencia: p ? p.referencia : '',
        metodo: p ? p.metodo : '', monto: p ? p.monto : null
      };
    });
    var vencidos = meses.filter(function (m) { return m.estado === 'vencido'; }).map(function (m) { return m.mes; });
    base.estado = exonerado || !vencidos.length ? 'solvente' : 'moroso';
    base.meses = meses;
    base.vencidos = vencidos;
    base.deuda = exonerado ? 0 : round2(vencidos.length * monto);
    return base;
  }

  /** Código de verificación de una constancia: cédula-fecha-firma. */
  function codigoConstancia(adapter, cedula, fecha) {
    var f = fecha.replace(/-/g, '');
    return cedula + '-' + f + '-' + adapter.hmac('constancia|' + cedula + '|' + f).slice(0, 8).toUpperCase();
  }

  // ───────────────────────────── contexto ─────────────────────────────

  function Ctx(adapter, db, user) {
    this.adapter = adapter;
    this.db = db;
    this.user = user;
  }

  Ctx.prototype.today = function () { return isoDate(new Date(this.adapter.now())); };
  Ctx.prototype.stamp = function () { return new Date(this.adapter.now()).toISOString(); };
  Ctx.prototype.is = function () {
    for (var i = 0; i < arguments.length; i++) if (this.user.rol === arguments[i]) return true;
    return false;
  };

  Ctx.prototype.config = function () {
    var cfg = {};
    for (var k in CONFIG_DEFAULTS) cfg[k] = CONFIG_DEFAULTS[k];
    this.db.all('Config').forEach(function (r) { if (r.valor !== '') cfg[r.clave] = r.valor; });
    return cfg;
  };

  Ctx.prototype.periodo = function () {
    var activos = this.db.where('Periodos', function (p) { return p.estado === 'activo'; });
    if (!activos.length) fail('SIN_PERIODO', 'No hay un año escolar activo. La administración debe abrir uno.');
    return activos[0];
  };

  Ctx.prototype.cargaEditable = function (periodo, lapso) {
    return periodo.estado === 'activo' && periodo.carga_abierta && Number(lapso) === periodo.lapso_activo;
  };

  Ctx.prototype.grado = function (id) {
    var g = this.db.get('Grados', id);
    if (!g) fail('NO_ENCONTRADO', 'El grado no existe.');
    return g;
  };

  Ctx.prototype.materia = function (id) {
    var m = this.db.get('Materias_Asignadas', id);
    if (!m) fail('NO_ENCONTRADO', 'La materia no existe.');
    return m;
  };

  Ctx.prototype.usuario = function (id, rol) {
    var u = this.db.get('Usuarios', id);
    if (!u || (rol && u.rol !== rol)) fail('NO_ENCONTRADO', 'El usuario no existe.');
    return u;
  };

  Ctx.prototype.estudiantesDeGrado = function (gradoId) {
    return this.db.where('Usuarios', function (u) {
      return u.rol === 'estudiante' && u.estado === 'activo' && u.grado_id === gradoId;
    }).sort(byNombre);
  };

  Ctx.prototype.estadoPago = function (estudianteId) {
    return this.cuenta(estudianteId).estado;
  };

  Ctx.prototype.periodoActivo = function () {
    return this.db.where('Periodos', function (p) { return p.estado === 'activo'; })[0] || null;
  };

  /** Estado de cuenta memoizado por petición (se recalcula tras escribir pagos). */
  Ctx.prototype.cuenta = function (estudianteId, periodo) {
    periodo = periodo || this.periodoActivo();
    var k = estudianteId + '|' + (periodo ? periodo.id : '');
    this._cuentas = this._cuentas || {};
    if (!this._cuentas[k]) this._cuentas[k] = estadoCuenta(this, estudianteId, periodo);
    return this._cuentas[k];
  };

  Ctx.prototype.invalidarCuentas = function () { this._cuentas = null; };

  Ctx.prototype.hijosDe = function (repId) {
    var ids = {};
    this.db.where('Relacion_Familiar', function (r) { return r.representante_id === repId; })
      .forEach(function (r) { ids[r.estudiante_id] = true; });
    return this.db.where('Usuarios', function (u) { return ids[u.id] && u.rol === 'estudiante'; }).sort(byNombre);
  };

  Ctx.prototype.representantesDe = function (estId) {
    var ids = {};
    this.db.where('Relacion_Familiar', function (r) { return r.estudiante_id === estId; })
      .forEach(function (r) { ids[r.representante_id] = true; });
    return this.db.where('Usuarios', function (u) { return ids[u.id]; });
  };

  /** Materia editable por el usuario actual (profesor titular o admin). */
  Ctx.prototype.materiaPropia = function (materiaId) {
    var m = this.materia(materiaId);
    if (this.is('profesor') && m.profesor_id !== this.user.id) {
      fail('PROHIBIDO', 'Esta materia no está asignada a usted.');
    }
    if (!this.is('profesor', 'admin', 'coordinador')) fail('PROHIBIDO', 'Acceso no autorizado.');
    return m;
  };

  /** Regla de acceso a los datos académicos de un estudiante. */
  Ctx.prototype.estudianteVisible = function (estudianteId) {
    var est = this.usuario(estudianteId, 'estudiante');
    if (this.is('admin', 'coordinador')) return est;
    if (this.is('estudiante') && est.id === this.user.id) return est;
    if (this.is('representante')) {
      var ok = this.hijosDe(this.user.id).some(function (h) { return h.id === est.id; });
      if (ok) return est;
    }
    fail('PROHIBIDO', 'No tiene acceso a este estudiante.');
  };

  /** Grado que cursaba un estudiante en un período (sobrevive a la promoción). */
  Ctx.prototype.gradoEnPeriodo = function (est, periodoId) {
    var promo = this.db.where('Promociones', function (p) {
      return p.periodo_id === periodoId && p.estudiante_id === est.id;
    })[0];
    return promo ? promo.grado_origen : est.grado_id;
  };

  Ctx.prototype.evaluaciones = function (materiaId, periodoId, lapso) {
    return (this.db.index('PlanesEvaluacion', 'materia_id')[materiaId] || []).filter(function (e) {
      return e.periodo_id === periodoId && (lapso === undefined || e.lapso === Number(lapso));
    }).slice().sort(function (a, b) { return (a.fecha || '9999').localeCompare(b.fecha || '9999') || a.titulo.localeCompare(b.titulo); });
  };

  /** Mapa estudiante_id → evaluacion_id → calificación. */
  Ctx.prototype.notasDe = function (evaluacionIds) {
    var set = {};
    evaluacionIds.forEach(function (id) { set[id] = true; });
    var out = {};
    var porEval = this.db.index('Notas', 'evaluacion_id');
    evaluacionIds.forEach(function (id) {
      (porEval[id] || []).forEach(function (n) {
        if (n.calificacion === null) return;
        (out[n.estudiante_id] = out[n.estudiante_id] || {})[n.evaluacion_id] = n.calificacion;
      });
    });
    return out;
  };

  /** Asistencia de una materia: clases dictadas y ausencias por estudiante. */
  Ctx.prototype.resumenAsistencia = function (materiaId, periodoId, lapso) {
    var fechas = {}, porEst = {};
    var enRango = function (x) { return x.periodo_id === periodoId && (lapso === undefined || x.lapso === Number(lapso)); };
    (this.db.index('Clases', 'materia_id')[materiaId] || []).forEach(function (c) { if (enRango(c)) fechas[c.fecha] = true; });
    (this.db.index('Asistencia', 'materia_id')[materiaId] || []).forEach(function (a) {
      if (!enRango(a)) return;
      fechas[a.fecha] = true;
      if (a.estado === 'presente') return; // compatibilidad con registros antiguos
      var r = porEst[a.estudiante_id] = porEst[a.estudiante_id] || { ausencias: 0, justificadas: 0 };
      if (a.estado === 'ausente') r.ausencias++;
      if (a.estado === 'justificado') r.justificadas++;
    });
    return { clases: Object.keys(fechas).length, porEstudiante: porEst };
  };

  function pctInasistencia(clases, ausencias) {
    return clases ? round2((ausencias / clases) * 100) : 0;
  }

  // ─────────────────────────── informes académicos ───────────────────────────

  /**
   * Informe completo de un estudiante en un período: materias, lapsos,
   * evaluaciones, definitivas, asistencia y rasgos. Base de la vista del
   * estudiante, del representante y del boletín PDF.
   */
  function buildInforme(ctx, est, periodo) {
    var db = ctx.db;
    var gradoId = ctx.gradoEnPeriodo(est, periodo.id);
    var grado = db.get('Grados', gradoId);
    var materias = db.where('Materias_Asignadas', function (m) { return m.grado_id === gradoId; }).sort(byNombre);
    var profes = indexBy(db.where('Usuarios', function (u) { return u.rol === 'profesor'; }), 'id');

    var notasEst = {};
    (db.index('Notas', 'estudiante_id')[est.id] || []).forEach(function (n) {
      if (n.calificacion !== null) notasEst[n.evaluacion_id] = n.calificacion;
    });

    var totalClases = 0, totalAus = 0;
    var definitivas = [];

    var lista = materias.map(function (m) {
      var evals = ctx.evaluaciones(m.id, periodo.id);
      var porLapso = groupBy(evals, 'lapso');
      var lapsos = LAPSOS.map(function (l) {
        var ev = porLapso[l] || [];
        var calc = calcLapso(ev, notasEst);
        var asis = ctx.resumenAsistencia(m.id, periodo.id, l);
        var mia = asis.porEstudiante[est.id] || { ausencias: 0, justificadas: 0 };
        return {
          lapso: l,
          nota: calc.nota,
          parcial: calc.parcial,
          acumulado: calc.acumulado,
          plan_pct: calc.plan_pct,
          evaluado_pct: calc.evaluado_pct,
          clases: asis.clases,
          ausencias: mia.ausencias,
          justificadas: mia.justificadas,
          evaluaciones: ev.map(function (e) {
            return {
              id: e.id, titulo: e.titulo, tipo: e.tipo, porcentaje: e.porcentaje, fecha: e.fecha,
              calificacion: notasEst[e.id] === undefined ? null : notasEst[e.id]
            };
          })
        };
      });
      var def = calcDefinitiva(lapsos.map(function (l) { return l.nota; }));
      var clases = 0, aus = 0;
      lapsos.forEach(function (l) { clases += l.clases; aus += l.ausencias; });
      totalClases += clases;
      totalAus += aus;
      if (def.definitiva !== null) definitivas.push(def.definitiva);
      var prof = profes[m.profesor_id];
      return {
        id: m.id,
        nombre: m.nombre,
        profesor: prof ? prof.nombre : 'Sin asignar',
        lapsos: lapsos,
        definitiva: def.definitiva,
        promedio_parcial: def.parcial,
        inasistencia_pct: pctInasistencia(clases, aus)
      };
    });

    var rasgosRows = db.where('Rasgos', function (r) { return r.estudiante_id === est.id && r.periodo_id === periodo.id; });
    var rasgos = RASGOS.map(function (nombre) {
      var v = {};
      rasgosRows.forEach(function (r) { if (r.rasgo === nombre) v[r.lapso] = r.valor; });
      return { rasgo: nombre, valores: v };
    });

    var reps = ctx.representantesDe(est.id);
    var parciales = lista.map(function (m) { return m.promedio_parcial; }).filter(function (n) { return n !== null; });

    return {
      estudiante: { id: est.id, nombre: est.nombre, cedula: est.cedula },
      grado: grado ? { id: grado.id, nombre: grado.nombre, seccion: grado.seccion } : null,
      periodo: pick(periodo, ['id', 'nombre', 'lapso_activo', 'estado']),
      representante: reps.length ? { nombre: reps[0].nombre, cedula: reps[0].cedula, telefono: reps[0].telefono } : null,
      materias: lista,
      promedio_general: parciales.length ? round2(avg(parciales)) : null,
      promedio_definitivo: definitivas.length === lista.length && lista.length ? round2(avg(definitivas)) : null,
      asistencia: { clases: totalClases, ausencias: totalAus, pct: pctInasistencia(totalClases, totalAus) },
      rasgos: rasgos,
      escala_rasgos: ESCALA_RASGOS,
      institucion: ctx.config()
    };
  }

  function resumenAsistenciaEstudiante(ctx, est, periodo) {
    var gradoId = ctx.gradoEnPeriodo(est, periodo.id);
    var materias = ctx.db.where('Materias_Asignadas', function (m) { return m.grado_id === gradoId; }).sort(byNombre);
    var clases = 0, aus = 0, just = 0;
    var detalle = materias.map(function (m) {
      var r = ctx.resumenAsistencia(m.id, periodo.id);
      var mia = r.porEstudiante[est.id] || { ausencias: 0, justificadas: 0 };
      clases += r.clases; aus += mia.ausencias; just += mia.justificadas;
      return {
        materia_id: m.id, materia: m.nombre, clases: r.clases, ausencias: mia.ausencias,
        justificadas: mia.justificadas, pct: pctInasistencia(r.clases, mia.ausencias)
      };
    });
    return { clases: clases, ausencias: aus, justificadas: just, pct: pctInasistencia(clases, aus), materias: detalle };
  }

  // ─────────────────────────────── promoción ───────────────────────────────

  /**
   * Evalúa el cierre del año para todos los estudiantes activos:
   *   - Materia aplazada: definitiva < 10 o inasistencia > 25 %.
   *   - 0 aplazadas → Promovido (o Egresado si cursa el último año).
   *   - 1–2 aplazadas → Promovido con materia pendiente (en el último
   *     año no egresa hasta aprobarlas).
   *   - 3 o más → Repitiente.
   */
  function evaluarPromocion(ctx) {
    var db = ctx.db;
    var periodo = ctx.periodo();
    var grados = db.all('Grados').slice().sort(function (a, b) { return a.orden - b.orden || a.seccion.localeCompare(b.seccion); });
    var maxOrden = grados.reduce(function (m, g) { return Math.max(m, g.orden); }, 0);

    function siguienteGrado(g) {
      var mismos = grados.filter(function (x) { return x.orden === g.orden + 1; });
      return mismos.filter(function (x) { return x.seccion === g.seccion; })[0] || mismos[0] || null;
    }

    var filas = [];
    grados.forEach(function (g) {
      ctx.estudiantesDeGrado(g.id).forEach(function (est) {
        var inf = buildInforme(ctx, est, periodo);
        var aplazadas = [], incompletas = 0;
        inf.materias.forEach(function (m) {
          var nota = m.definitiva !== null ? m.definitiva : (m.promedio_parcial === null ? null : redondear(m.promedio_parcial));
          if (m.definitiva === null) incompletas++;
          var porInasistencia = m.inasistencia_pct > MAX_INASISTENCIA_PCT;
          if (nota === null || nota < NOTA_APROBATORIA || porInasistencia) {
            aplazadas.push({ materia: m.nombre, definitiva: nota, motivo: porInasistencia ? 'inasistencia' : (nota === null ? 'sin notas' : 'nota') });
          }
        });
        var destino = siguienteGrado(g);
        var ultimo = g.orden === maxOrden;
        var resultado;
        if (!aplazadas.length) resultado = ultimo ? 'egresado' : 'promovido';
        else if (aplazadas.length <= MAX_MATERIAS_PENDIENTES) resultado = ultimo ? 'pendiente_egreso' : 'materia_pendiente';
        else resultado = 'repitiente';
        if (!ultimo && !destino && (resultado === 'promovido' || resultado === 'materia_pendiente')) resultado = 'sin_grado_destino';

        var mueve = resultado === 'promovido' || resultado === 'materia_pendiente';
        filas.push({
          estudiante_id: est.id,
          nombre: est.nombre,
          cedula: est.cedula,
          grado_origen: { id: g.id, nombre: g.nombre },
          grado_destino: mueve ? { id: destino.id, nombre: destino.nombre } : (resultado === 'egresado' ? null : { id: g.id, nombre: g.nombre }),
          promedio: inf.promedio_definitivo !== null ? inf.promedio_definitivo : inf.promedio_general,
          aplazadas: aplazadas,
          incompletas: incompletas,
          resultado: resultado
        });
      });
    });

    var resumen = { total: filas.length, promovido: 0, materia_pendiente: 0, repitiente: 0, egresado: 0, pendiente_egreso: 0, sin_grado_destino: 0, incompletos: 0 };
    filas.forEach(function (f) { resumen[f.resultado]++; if (f.incompletas) resumen.incompletos++; });
    return { periodo: periodo, filas: filas, resumen: resumen };
  }

  // ─────────────────────────────── validación ───────────────────────────────

  function validarCalificacion(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = Number(v);
    assert(!isNaN(n) && isFinite(n), 'La calificación debe ser numérica.');
    assert(n >= NOTA_MIN && n <= NOTA_MAX, 'Las calificaciones van de ' + NOTA_MIN + ' a ' + NOTA_MAX + '.');
    assert(Math.abs(round2(n) - n) < 1e-9, 'Use como máximo dos decimales.');
    return n;
  }

  function validarLapso(l) {
    l = Number(l);
    assert(LAPSOS.indexOf(l) >= 0, 'Lapso inválido.');
    return l;
  }

  // ──────────────────────────────── acciones ────────────────────────────────

  var A = {};

  function action(name, roles, fn) { A[name] = { roles: roles, fn: fn }; }

  /** Acciones que escriben: solo estas toman el candado en Apps Script. */
  var ESCRITURAS = ['changePassword', 'saveAviso', 'deleteAviso', 'setLapso', 'setCargaAbierta', 'openNewPeriod',
    'updateInstitucion', 'saveGrado', 'deleteGrado', 'saveMateria', 'deleteMateria', 'saveUser', 'resetPassword',
    'setCondicion', 'registerPayment', 'reviewPaymentReport', 'reportPayment', 'saveEvaluationPlan', 'saveGrades',
    'markAttendance', 'saveTraits', 'executePromotion'];

  var STAFF = ['admin', 'coordinador'];
  var TODOS = ROLES;

  // — Sesión —

  action('ping', null, function () { return { service: 'SCE', version: VERSION }; });

  /** Datos públicos para la pantalla de acceso (nombre del colegio). */
  action('publicInfo', null, function (ctx) {
    var cfg = ctx.config();
    return {
      nombre: cfg.nombre, ciudad: cfg.ciudad, telefono: cfg.telefono, email: cfg.email,
      logo: cfg.logo, color_primario: cfg.color_primario, color_acento: cfg.color_acento
    };
  });

  action('login', null, function (ctx, p) {
    var ced = normCedula(p.cedula);
    var pass = str(p.password);
    assert(ced && pass, 'Ingrese su cédula y contraseña.');
    var a = ctx.adapter;
    var clave = 'login:' + ced;
    var intentos = Number((a.cacheGet && a.cacheGet(clave)) || 0);
    if (intentos >= LOGIN_MAX_INTENTOS) fail('BLOQUEADO', 'Demasiados intentos fallidos. Espere 15 minutos e intente de nuevo.');
    var u = ctx.db.where('Usuarios', function (x) { return x.cedula === ced; })[0];
    if (!u || !verifyPassword(a, pass, u.password_hash)) {
      if (a.cachePut) a.cachePut(clave, String(intentos + 1), LOGIN_BLOQUEO_SEG);
      fail('CREDENCIALES', 'Cédula o contraseña incorrecta.');
    }
    if (u.estado !== 'activo') fail('INACTIVO', 'Su cuenta no está activa. Contacte a la administración.');
    if (intentos && a.cachePut) a.cachePut(clave, '0', 1);
    ctx.user = u;
    return { token: issueToken(a, u), session: A.session.fn(ctx, {}) };
  });

  action('session', TODOS, function (ctx) {
    var periodo = null;
    try { periodo = ctx.periodo(); } catch (e) { if (!e.sceError) throw e; }
    var out = {
      user: publicUser(ctx.user),
      periodo: periodo,
      institucion: ctx.config(),
      catalogos: { rasgos: RASGOS, escala_rasgos: ESCALA_RASGOS, tipos_evaluacion: TIPOS_EVALUACION, bancos: BANCOS },
      reglas: { nota_min: NOTA_MIN, nota_max: NOTA_MAX, aprobatoria: NOTA_APROBATORIA, max_inasistencia: MAX_INASISTENCIA_PCT, max_pendientes: MAX_MATERIAS_PENDIENTES }
    };
    if (ctx.is('estudiante')) {
      var g = ctx.db.get('Grados', ctx.user.grado_id);
      out.grado = g ? pick(g, ['id', 'nombre', 'seccion']) : null;
      out.estado_pago = ctx.estadoPago(ctx.user.id);
    }
    return out;
  });

  action('changePassword', TODOS, function (ctx, p) {
    assert(verifyPassword(ctx.adapter, str(p.actual), ctx.user.password_hash), 'La contraseña actual no es correcta.');
    var nueva = str(p.nueva);
    assert(nueva.length >= 8, 'La nueva contraseña debe tener al menos 8 caracteres.');
    ctx.db.update('Usuarios', ctx.user.id, { password_hash: hashPassword(ctx.adapter, nueva) });
    return { ok: true };
  });

  // — Avisos —

  action('getAvisos', TODOS, function (ctx) {
    var rol = ctx.user.rol;
    var staff = ctx.is('admin', 'coordinador');
    var autores = indexBy(ctx.db.all('Usuarios'), 'id');
    return ctx.db.where('Avisos', function (a) {
      return staff || a.roles_destino.split(',').map(str).indexOf(rol) >= 0;
    }).sort(function (a, b) { return b.fecha.localeCompare(a.fecha); }).map(function (a) {
      return {
        id: a.id, titulo: a.titulo, contenido: a.contenido, fecha: a.fecha, prioridad: a.prioridad || 'normal',
        roles_destino: a.roles_destino.split(',').map(str).filter(Boolean),
        autor: autores[a.autor_id] ? autores[a.autor_id].nombre : 'Coordinación'
      };
    });
  });

  action('saveAviso', STAFF, function (ctx, p) {
    var titulo = str(p.titulo), contenido = str(p.contenido);
    assert(titulo.length >= 3 && titulo.length <= 120, 'El título debe tener entre 3 y 120 caracteres.');
    assert(contenido.length >= 3 && contenido.length <= 2000, 'El contenido debe tener entre 3 y 2000 caracteres.');
    var roles = (p.roles_destino || []).filter(function (r) { return ROLES.indexOf(r) >= 0 && r !== 'admin'; });
    assert(roles.length, 'Seleccione al menos un destinatario.');
    var row = {
      titulo: titulo, contenido: contenido, roles_destino: roles.join(','),
      prioridad: p.prioridad === 'importante' ? 'importante' : 'normal'
    };
    if (p.id) {
      assert(ctx.db.get('Avisos', p.id), 'El aviso no existe.');
      ctx.db.update('Avisos', p.id, row);
    } else {
      row.fecha = ctx.stamp();
      row.autor_id = ctx.user.id;
      ctx.db.insert('Avisos', row);
    }
    return A.getAvisos.fn(ctx, {});
  });

  action('deleteAviso', STAFF, function (ctx, p) {
    ctx.db.remove('Avisos', [str(p.id)]);
    return A.getAvisos.fn(ctx, {});
  });

  // — Administración: resumen —

  action('adminOverview', STAFF, function (ctx) {
    var db = ctx.db;
    var usuarios = db.where('Usuarios', function (u) { return u.estado === 'activo'; });
    var est = usuarios.filter(function (u) { return u.rol === 'estudiante'; });
    var morosos = est.filter(function (e) { return ctx.estadoPago(e.id) === 'moroso'; }).length;
    var grados = db.all('Grados').slice().sort(function (a, b) { return a.orden - b.orden; });
    var porGrado = groupBy(est, 'grado_id');
    return {
      estudiantes: est.length,
      profesores: usuarios.filter(function (u) { return u.rol === 'profesor'; }).length,
      representantes: usuarios.filter(function (u) { return u.rol === 'representante'; }).length,
      materias: db.all('Materias_Asignadas').length,
      morosos: morosos,
      solvencia_pct: est.length ? round2(((est.length - morosos) / est.length) * 100) : 100,
      reportes_pendientes: db.where('Reportes_Pago', function (r) { return r.estado === 'pendiente'; }).length,
      grados: grados.map(function (g) {
        var lista = porGrado[g.id] || [];
        return {
          id: g.id, nombre: g.nombre, seccion: g.seccion, estudiantes: lista.length,
          morosos: lista.filter(function (e) { return ctx.estadoPago(e.id) === 'moroso'; }).length
        };
      })
    };
  });

  // — Año escolar —

  action('getPeriodos', STAFF, function (ctx) {
    return ctx.db.all('Periodos').slice().sort(function (a, b) { return b.nombre.localeCompare(a.nombre); });
  });

  action('setLapso', ['admin'], function (ctx, p) {
    var periodo = ctx.periodo();
    var l = validarLapso(p.lapso);
    return ctx.db.update('Periodos', periodo.id, { lapso_activo: l, carga_abierta: true });
  });

  action('setCargaAbierta', ['admin', 'coordinador'], function (ctx, p) {
    var periodo = ctx.periodo();
    return ctx.db.update('Periodos', periodo.id, { carga_abierta: !!p.abierta });
  });

  action('openNewPeriod', ['admin'], function (ctx, p) {
    var nombre = str(p.nombre);
    assert(/^\d{4}-\d{4}$/.test(nombre), 'Use el formato AAAA-AAAA (ej. 2027-2028).');
    var y = nombre.split('-').map(Number);
    assert(y[1] === y[0] + 1, 'El año escolar debe abarcar dos años consecutivos.');
    assert(!ctx.db.where('Periodos', function (x) { return x.nombre === nombre; }).length, 'Ese año escolar ya existe.');
    var actual = ctx.db.where('Periodos', function (x) { return x.estado === 'activo'; })[0];
    if (actual) {
      assert(actual.promocion_ejecutada, 'Ejecute el cierre académico (promoción) del año ' + actual.nombre + ' antes de abrir uno nuevo.');
      ctx.db.update('Periodos', actual.id, { estado: 'cerrado', carga_abierta: false });
    }
    return ctx.db.insert('Periodos', {
      nombre: nombre, lapso_activo: 1, carga_abierta: true, estado: 'activo', promocion_ejecutada: false, creado: ctx.stamp()
    })[0];
  });

  var VALIDAR_CONFIG = {
    color_primario: function (v) { assert(/^#[0-9a-fA-F]{6}$/.test(v), 'El color principal debe tener el formato #RRGGBB.'); return v.toLowerCase(); },
    color_acento: function (v) { assert(/^#[0-9a-fA-F]{6}$/.test(v), 'El color de acento debe tener el formato #RRGGBB.'); return v.toLowerCase(); },
    logo: function (v) {
      assert(!v || /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+\/=]+$/.test(v), 'El logo debe ser una imagen PNG, JPG o WebP.');
      assert(v.length <= 45000, 'El logo es demasiado grande. Use una imagen más pequeña.');
      return v;
    },
    mensualidad_monto: function (v) { var n = Number(v); assert(isFinite(n) && n > 0, 'El monto de la mensualidad debe ser mayor que 0.'); return String(round2(n)); },
    dia_limite_pago: function (v) { var n = Number(v); assert(n >= 1 && n <= 28 && Math.floor(n) === n, 'El día límite debe ser un entero entre 1 y 28.'); return String(n); },
    mes_inicio_cobro: function (v) { var n = Number(v); assert(n >= 1 && n <= 12 && Math.floor(n) === n, 'Mes de inicio inválido.'); return String(n); },
    mes_fin_cobro: function (v) { var n = Number(v); assert(n >= 1 && n <= 12 && Math.floor(n) === n, 'Mes final inválido.'); return String(n); },
    nombre: function (v) { assert(v.length >= 3, 'Indique el nombre del plantel.'); return v; }
  };

  action('updateInstitucion', ['admin'], function (ctx, p) {
    var db = ctx.db;
    var existentes = indexBy(db.all('Config'), 'clave');
    var nuevos = [], cambios = [];
    Object.keys(CONFIG_DEFAULTS).forEach(function (k) {
      if (p[k] === undefined) return;
      var v = str(p[k]);
      v = VALIDAR_CONFIG[k] ? VALIDAR_CONFIG[k](v) : v.slice(0, 200);
      if (existentes[k]) cambios.push({ key: k, patch: { valor: v, descripcion: CONFIG_INFO[k] || '' } });
      else nuevos.push({ clave: k, valor: v, descripcion: CONFIG_INFO[k] || '' });
    });
    db.updateMany('Config', cambios);
    db.insert('Config', nuevos);
    ctx.invalidarCuentas();
    return ctx.config();
  });

  // — Grados y materias —

  action('getEstructura', STAFF, function (ctx) {
    var db = ctx.db;
    var profes = db.where('Usuarios', function (u) { return u.rol === 'profesor' && u.estado === 'activo'; }).sort(byNombre);
    var est = groupBy(db.where('Usuarios', function (u) { return u.rol === 'estudiante' && u.estado === 'activo'; }), 'grado_id');
    var mats = groupBy(db.all('Materias_Asignadas'), 'grado_id');
    var grados = db.all('Grados').slice().sort(function (a, b) { return a.orden - b.orden || a.seccion.localeCompare(b.seccion); });
    return {
      profesores: profes.map(function (u) { return { id: u.id, nombre: u.nombre }; }),
      grados: grados.map(function (g) {
        return {
          id: g.id, nombre: g.nombre, orden: g.orden, seccion: g.seccion,
          estudiantes: (est[g.id] || []).length,
          materias: (mats[g.id] || []).slice().sort(byNombre).map(function (m) {
            return { id: m.id, nombre: m.nombre, profesor_id: m.profesor_id };
          })
        };
      })
    };
  });

  action('saveGrado', ['admin'], function (ctx, p) {
    var nombre = str(p.nombre), seccion = str(p.seccion).toUpperCase(), orden = Number(p.orden);
    assert(nombre.length >= 3, 'Indique el nombre del grado.');
    assert(orden >= 1 && orden <= 12 && Math.floor(orden) === orden, 'El orden debe ser un entero entre 1 y 12.');
    assert(/^[A-Z]{0,2}$/.test(seccion), 'La sección debe ser una o dos letras.');
    var dup = ctx.db.where('Grados', function (g) { return g.orden === orden && g.seccion === seccion && g.id !== p.id; });
    assert(!dup.length, 'Ya existe un grado con ese orden y sección.');
    var row = { nombre: nombre, orden: orden, seccion: seccion };
    if (p.id) { ctx.grado(p.id); ctx.db.update('Grados', p.id, row); } else ctx.db.insert('Grados', row);
    return A.getEstructura.fn(ctx, {});
  });

  action('deleteGrado', ['admin'], function (ctx, p) {
    var g = ctx.grado(p.id);
    assert(!ctx.db.where('Usuarios', function (u) { return u.grado_id === g.id && u.rol === 'estudiante' && u.estado === 'activo'; }).length,
      'El grado tiene estudiantes inscritos.');
    assert(!ctx.db.where('Materias_Asignadas', function (m) { return m.grado_id === g.id; }).length, 'Elimine primero las materias del grado.');
    ctx.db.remove('Grados', [g.id]);
    return A.getEstructura.fn(ctx, {});
  });

  action('saveMateria', ['admin'], function (ctx, p) {
    var nombre = str(p.nombre);
    assert(nombre.length >= 3 && nombre.length <= 80, 'El nombre de la materia debe tener entre 3 y 80 caracteres.');
    var g = ctx.grado(str(p.grado_id));
    var profesorId = str(p.profesor_id);
    if (profesorId) {
      var prof = ctx.usuario(profesorId);
      assert(prof.rol === 'profesor' && prof.estado === 'activo', 'El docente seleccionado no es válido.');
    }
    var dup = ctx.db.where('Materias_Asignadas', function (m) {
      return m.grado_id === g.id && m.nombre.toLowerCase() === nombre.toLowerCase() && m.id !== p.id;
    });
    assert(!dup.length, 'Esa materia ya existe en ' + g.nombre + '.');
    var row = { nombre: nombre, grado_id: g.id, profesor_id: profesorId };
    if (p.id) { ctx.materia(p.id); ctx.db.update('Materias_Asignadas', p.id, row); } else ctx.db.insert('Materias_Asignadas', row);
    return A.getEstructura.fn(ctx, {});
  });

  action('deleteMateria', ['admin'], function (ctx, p) {
    var m = ctx.materia(p.id);
    assert(!ctx.db.where('PlanesEvaluacion', function (e) { return e.materia_id === m.id; }).length,
      'La materia tiene evaluaciones registradas; no puede eliminarse.');
    ctx.db.remove('Materias_Asignadas', [m.id]);
    return A.getEstructura.fn(ctx, {});
  });

  // — Usuarios —

  action('listUsers', STAFF, function (ctx) {
    var db = ctx.db;
    var grados = indexBy(db.all('Grados'), 'id');
    var rel = db.all('Relacion_Familiar');
    var usuarios = indexBy(db.all('Usuarios'), 'id');
    return db.all('Usuarios').slice().sort(byNombre).map(function (u) {
      var o = publicUser(u);
      if (u.rol === 'estudiante') {
        o.grado = grados[u.grado_id] ? grados[u.grado_id].nombre : '';
        o.estado_pago = ctx.estadoPago(u.id);
        o.representantes = rel.filter(function (r) { return r.estudiante_id === u.id; })
          .map(function (r) { return usuarios[r.representante_id]; }).filter(Boolean).map(function (x) { return { id: x.id, nombre: x.nombre }; });
      }
      if (u.rol === 'representante') {
        o.hijos = rel.filter(function (r) { return r.representante_id === u.id; })
          .map(function (r) { return usuarios[r.estudiante_id]; }).filter(Boolean).map(function (x) { return { id: x.id, nombre: x.nombre }; });
      }
      return o;
    });
  });

  action('saveUser', ['admin'], function (ctx, p) {
    var db = ctx.db;
    var cedula = normCedula(p.cedula);
    var nombre = str(p.nombre);
    var rol = str(p.rol);
    assert(cedula.length >= 5 && cedula.length <= 10, 'La cédula debe tener entre 5 y 10 dígitos.');
    assert(nombre.length >= 3 && nombre.length <= 100, 'Indique el nombre completo.');
    assert(ROLES.indexOf(rol) >= 0, 'Rol inválido.');
    var email = str(p.email);
    assert(!email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 'El correo no es válido.');
    var dup = db.where('Usuarios', function (u) { return u.cedula === cedula && u.id !== p.id; });
    assert(!dup.length, 'Ya existe un usuario con esa cédula.');

    var gradoId = '';
    if (rol === 'estudiante') gradoId = ctx.grado(str(p.grado_id)).id;

    var row = { cedula: cedula, nombre: nombre, rol: rol, grado_id: gradoId, email: email, telefono: str(p.telefono) };
    var passTemporal = null;
    var user;
    if (p.id) {
      var prev = ctx.usuario(p.id);
      assert(!(prev.id === ctx.user.id && rol !== 'admin'), 'No puede quitarse a sí mismo el rol de administrador.');
      if (p.estado) {
        assert(['activo', 'inactivo', 'egresado'].indexOf(p.estado) >= 0, 'Estado inválido.');
        assert(!(prev.id === ctx.user.id && p.estado !== 'activo'), 'No puede desactivar su propia cuenta.');
        row.estado = p.estado;
      }
      user = db.update('Usuarios', p.id, row);
    } else {
      var pass = str(p.password);
      if (!pass) { pass = tempPassword(ctx.adapter); passTemporal = pass; }
      assert(pass.length >= 8, 'La contraseña inicial debe tener al menos 8 caracteres.');
      row.password_hash = hashPassword(ctx.adapter, pass);
      row.estado = 'activo';
      row.creado = ctx.stamp();
      user = db.insert('Usuarios', row)[0];
    }

    if (rol === 'estudiante' && !db.get('Pagos', user.id)) {
      db.insert('Pagos', { estudiante_id: user.id, condicion: 'regular', ultima_actualizacion: ctx.stamp(), observaciones: '' });
    }

    if (rol === 'representante' && Array.isArray(p.hijos)) {
      var hijos = p.hijos.map(str).filter(Boolean);
      hijos.forEach(function (id) { ctx.usuario(id, 'estudiante'); });
      var actuales = db.where('Relacion_Familiar', function (r) { return r.representante_id === user.id; });
      db.remove('Relacion_Familiar', actuales.filter(function (r) { return hijos.indexOf(r.estudiante_id) < 0; }).map(function (r) { return r.id; }));
      var ya = actuales.map(function (r) { return r.estudiante_id; });
      db.insert('Relacion_Familiar', hijos.filter(function (id) { return ya.indexOf(id) < 0; }).map(function (id) {
        return { representante_id: user.id, estudiante_id: id, parentesco: 'Representante' };
      }));
    }
    return { user: publicUser(user), password_temporal: passTemporal };
  });

  action('resetPassword', ['admin'], function (ctx, p) {
    var u = ctx.usuario(str(p.id));
    var pass = tempPassword(ctx.adapter);
    ctx.db.update('Usuarios', u.id, { password_hash: hashPassword(ctx.adapter, pass) });
    return { password_temporal: pass };
  });

  // — Finanzas —

  action('listPayments', ['admin'], function (ctx) {
    var db = ctx.db;
    var grados = indexBy(db.all('Grados'), 'id');
    var pend = groupBy(db.where('Reportes_Pago', function (r) { return r.estado === 'pendiente'; }), 'estudiante_id');
    return db.where('Usuarios', function (u) { return u.rol === 'estudiante' && u.estado === 'activo'; }).sort(byNombre).map(function (u) {
      var c = ctx.cuenta(u.id);
      return {
        id: u.id, nombre: u.nombre, cedula: u.cedula,
        grado: grados[u.grado_id] ? grados[u.grado_id].nombre : '',
        grado_id: u.grado_id,
        estado_pago: c.estado, condicion: c.condicion, vencidos: c.vencidos, deuda: c.deuda,
        pagados: c.meses.filter(function (m) { return m.estado === 'pagado'; }).length,
        representantes: ctx.representantesDe(u.id).map(function (r) { return r.nombre; }),
        reportes_pendientes: (pend[u.id] || []).length
      };
    });
  });

  /** Exonerar (beca, convenio, hijo de personal) o volver a régimen regular. */
  action('setCondicion', ['admin'], function (ctx, p) {
    var est = ctx.usuario(str(p.estudiante_id), 'estudiante');
    assert(p.condicion === 'regular' || p.condicion === 'exonerado', 'Condición inválida.');
    var row = { condicion: p.condicion, ultima_actualizacion: ctx.stamp(), observaciones: str(p.observaciones).slice(0, 300) };
    if (ctx.db.get('Pagos', est.id)) ctx.db.update('Pagos', est.id, row);
    else { row.estudiante_id = est.id; ctx.db.insert('Pagos', row); }
    ctx.invalidarCuentas();
    return A.getEstadoCuenta.fn(ctx, { estudiante_id: est.id });
  });

  function validarMeses(ctx, est, meses, permitirReporteId) {
    var periodo = ctx.periodo();
    var c = ctx.cuenta(est.id, periodo);
    var porMes = indexBy(c.meses, 'mes');
    var lista = (Array.isArray(meses) ? meses : []).map(str).filter(Boolean);
    assert(lista.length, 'Seleccione al menos un mes.');
    var vistos = {};
    lista.forEach(function (m) {
      assert(porMes[m], 'El mes ' + m + ' no pertenece al año escolar ' + periodo.nombre + '.');
      assert(!vistos[m], 'Hay meses repetidos.');
      vistos[m] = true;
      assert(porMes[m].estado !== 'pagado', porMes[m].nombre + ' ya está pagado.');
    });
    if (permitirReporteId !== true) {
      (ctx.db.index('Reportes_Pago', 'estudiante_id')[est.id] || []).forEach(function (r) {
        if (r.estado !== 'pendiente' || r.id === permitirReporteId) return;
        str(r.meses).split(',').forEach(function (m) {
          assert(!vistos[m], nombreMes(m) + ' ya está en un reporte pendiente de validación.');
        });
      });
    }
    return lista.sort();
  }

  function registrarMensualidades(ctx, est, meses, datos) {
    var periodo = ctx.periodo();
    var monto = Number(ctx.config().mensualidad_monto) || 0;
    var ya = {};
    (ctx.db.index('Mensualidades', 'estudiante_id')[est.id] || []).forEach(function (r) { if (r.periodo_id === periodo.id) ya[r.mes] = true; });
    ctx.db.insert('Mensualidades', meses.filter(function (m) { return !ya[m]; }).map(function (m) {
      return {
        estudiante_id: est.id, periodo_id: periodo.id, mes: m, monto: datos.monto !== undefined ? datos.monto : monto,
        metodo: datos.metodo, reporte_id: datos.reporte_id || '', referencia: datos.referencia || '',
        verificado_por: ctx.user.id, fecha_verificacion: ctx.stamp()
      };
    }));
    ctx.invalidarCuentas();
  }

  /** Pago recibido en caja (efectivo, punto de venta) registrado por administración. */
  action('registerPayment', ['admin'], function (ctx, p) {
    var est = ctx.usuario(str(p.estudiante_id), 'estudiante');
    var meses = validarMeses(ctx, est, p.meses, true);
    var referencia = str(p.referencia).slice(0, 40);
    var montoTotal = p.monto === undefined || p.monto === '' ? null : Number(p.monto);
    assert(montoTotal === null || (isFinite(montoTotal) && montoTotal > 0), 'Monto inválido.');
    registrarMensualidades(ctx, est, meses, {
      metodo: 'caja', referencia: referencia || 'Caja',
      monto: montoTotal === null ? undefined : round2(montoTotal / meses.length)
    });
    return A.getEstadoCuenta.fn(ctx, { estudiante_id: est.id });
  });

  function reporteDTO(ctx, r) {
    var est = ctx.db.get('Usuarios', r.estudiante_id);
    var rep = ctx.db.get('Usuarios', r.representante_id);
    var grado = est ? ctx.db.get('Grados', est.grado_id) : null;
    var meses = str(r.meses).split(',').filter(Boolean);
    return {
      id: r.id, referencia: r.referencia, banco: r.banco, monto: r.monto, fecha_pago: r.fecha_pago,
      estado: r.estado, creado: r.creado, observacion: r.observacion, fecha_revision: r.fecha_revision,
      meses: meses, meses_nombre: meses.map(nombreMes),
      estudiante: est ? { id: est.id, nombre: est.nombre, grado: grado ? grado.nombre : '' } : null,
      representante: rep ? { id: rep.id, nombre: rep.nombre, telefono: rep.telefono } : null
    };
  }

  action('listPaymentReports', ['admin'], function (ctx, p) {
    var estado = str(p.estado);
    return ctx.db.where('Reportes_Pago', function (r) { return !estado || r.estado === estado; })
      .sort(function (a, b) { return b.creado.localeCompare(a.creado); })
      .map(function (r) { return reporteDTO(ctx, r); });
  });

  action('reviewPaymentReport', ['admin'], function (ctx, p) {
    var r = ctx.db.get('Reportes_Pago', str(p.id));
    assert(r, 'El reporte no existe.');
    assert(r.estado === 'pendiente', 'Este reporte ya fue procesado.');
    assert(p.decision === 'aprobado' || p.decision === 'rechazado', 'Decisión inválida.');
    var obs = str(p.observacion).slice(0, 300);
    if (p.decision === 'rechazado') assert(obs.length >= 3, 'Indique el motivo del rechazo.');
    ctx.db.update('Reportes_Pago', r.id, { estado: p.decision, revisado_por: ctx.user.id, observacion: obs, fecha_revision: ctx.stamp() });
    if (p.decision === 'aprobado') {
      var est = ctx.usuario(r.estudiante_id, 'estudiante');
      var meses = str(r.meses).split(',').filter(Boolean);
      registrarMensualidades(ctx, est, meses, {
        metodo: 'transferencia', reporte_id: r.id, referencia: r.banco + ' ' + r.referencia,
        monto: meses.length ? round2(r.monto / meses.length) : undefined
      });
    }
    ctx.invalidarCuentas();
    return reporteDTO(ctx, ctx.db.get('Reportes_Pago', r.id));
  });

  /** Estado de cuenta: cuadrícula de meses e historial de pagos reportados. */
  action('getEstadoCuenta', ['admin', 'representante', 'estudiante'], function (ctx, p) {
    var est = ctx.estudianteVisible(ctx.is('estudiante') ? ctx.user.id : str(p.estudiante_id));
    var periodo = ctx.periodo();
    var grado = ctx.db.get('Grados', est.grado_id);
    var c = ctx.cuenta(est.id, periodo);
    return {
      estudiante: { id: est.id, nombre: est.nombre, cedula: est.cedula, grado: grado ? grado.nombre : '' },
      periodo: pick(periodo, ['id', 'nombre']),
      cuenta: c,
      reportes: (ctx.db.index('Reportes_Pago', 'estudiante_id')[est.id] || []).slice()
        .sort(function (a, b) { return b.creado.localeCompare(a.creado); })
        .map(function (r) { return reporteDTO(ctx, r); })
    };
  });

  /** Datos de la constancia de solvencia (solo si el estudiante está solvente). */
  action('getConstanciaSolvencia', ['admin', 'representante', 'estudiante'], function (ctx, p) {
    var est = ctx.estudianteVisible(ctx.is('estudiante') ? ctx.user.id : str(p.estudiante_id));
    var periodo = ctx.periodo();
    var c = ctx.cuenta(est.id, periodo);
    assert(c.estado === 'solvente', 'El estudiante no está solvente. La constancia se emite cuando todos los meses exigibles están pagados.', 'MOROSO');
    var grado = ctx.db.get('Grados', est.grado_id);
    var reps = ctx.representantesDe(est.id);
    var hoy = fechaVE(ctx.adapter.now());
    return {
      institucion: ctx.config(),
      estudiante: { id: est.id, nombre: est.nombre, cedula: est.cedula },
      grado: grado ? pick(grado, ['nombre', 'seccion']) : null,
      representante: reps.length ? { nombre: reps[0].nombre, cedula: reps[0].cedula } : null,
      periodo: pick(periodo, ['id', 'nombre']),
      cuenta: c,
      fecha_emision: hoy.iso,
      codigo: codigoConstancia(ctx.adapter, est.cedula, hoy.iso)
    };
  });

  /** Verificación pública de una constancia (p. ej. desde otro colegio). */
  action('verificarConstancia', null, function (ctx, p) {
    var codigo = str(p.codigo).toUpperCase();
    var m = codigo.match(/^(\d{5,10})-(\d{8})-([0-9A-F]{8})$/);
    if (!m) return { valido: false };
    var fecha = m[2].slice(0, 4) + '-' + m[2].slice(4, 6) + '-' + m[2].slice(6, 8);
    if (codigoConstancia(ctx.adapter, m[1], fecha) !== codigo) return { valido: false };
    var est = ctx.db.where('Usuarios', function (u) { return u.cedula === m[1] && u.rol === 'estudiante'; })[0];
    return { valido: !!est, estudiante: est ? est.nombre : null, fecha_emision: fecha, solvente_hoy: est ? ctx.estadoPago(est.id) === 'solvente' : false };
  });

  // — Representante —

  action('reportPayment', ['representante'], function (ctx, p) {
    var est = ctx.estudianteVisible(str(p.estudiante_id));
    var referencia = str(p.referencia).replace(/\s/g, '');
    var banco = str(p.banco);
    var monto = Number(p.monto);
    var fecha = str(p.fecha_pago);
    var meses = validarMeses(ctx, est, p.meses);
    assert(/^[0-9A-Za-z-]{4,30}$/.test(referencia), 'La referencia debe tener entre 4 y 30 caracteres alfanuméricos.');
    assert(BANCOS.indexOf(banco) >= 0, 'Seleccione el banco o método de pago.');
    assert(isFinite(monto) && monto > 0 && monto < 1e9, 'Indique un monto válido.');
    assert(isIsoDate(fecha), 'Indique la fecha del pago.');
    assert(fecha <= fechaVE(ctx.adapter.now()).iso, 'La fecha del pago no puede ser futura.');
    var dup = ctx.db.where('Reportes_Pago', function (r) { return r.referencia === referencia && r.banco === banco && r.estado !== 'rechazado'; });
    assert(!dup.length, 'Ya existe un reporte con esa referencia.');
    var row = ctx.db.insert('Reportes_Pago', {
      estudiante_id: est.id, representante_id: ctx.user.id, referencia: referencia, banco: banco,
      monto: round2(monto), fecha_pago: fecha, estado: 'pendiente', creado: ctx.stamp(), revisado_por: '', observacion: '',
      meses: meses.join(','), fecha_revision: ''
    })[0];
    ctx.invalidarCuentas();
    return reporteDTO(ctx, row);
  });

  action('listMyPaymentReports', ['representante'], function (ctx) {
    return ctx.db.where('Reportes_Pago', function (r) { return r.representante_id === ctx.user.id; })
      .sort(function (a, b) { return b.creado.localeCompare(a.creado); })
      .map(function (r) { return reporteDTO(ctx, r); });
  });

  action('getRepresentativeHome', ['representante'], function (ctx) {
    var periodo = ctx.periodo();
    var grados = indexBy(ctx.db.all('Grados'), 'id');
    var pend = groupBy(ctx.db.where('Reportes_Pago', function (r) { return r.estado === 'pendiente' && r.representante_id === ctx.user.id; }), 'estudiante_id');
    return ctx.hijosDe(ctx.user.id).map(function (h) {
      var c = ctx.cuenta(h.id, periodo);
      var asis = resumenAsistenciaEstudiante(ctx, h, periodo);
      var out = {
        id: h.id, nombre: h.nombre, cedula: h.cedula,
        grado: grados[h.grado_id] ? grados[h.grado_id].nombre : '',
        estado_pago: c.estado, vencidos: c.vencidos, deuda: c.deuda, moneda: c.moneda,
        inasistencia_pct: asis.pct,
        reportes_pendientes: (pend[h.id] || []).length,
        promedio: null
      };
      if (c.estado !== 'moroso') out.promedio = buildInforme(ctx, h, periodo).promedio_general;
      return out;
    });
  });

  // — Estudiante / representante: informe académico —

  /**
   * Regla de morosidad aplicada en el servidor: un estudiante moroso (o su
   * representante) no recibe calificaciones, aunque llame la API a mano.
   */
  action('getStudentReport', ['admin', 'coordinador', 'estudiante', 'representante'], function (ctx, p) {
    var est = ctx.estudianteVisible(ctx.is('estudiante') ? ctx.user.id : str(p.estudiante_id));
    var periodo = p.periodo_id ? ctx.db.get('Periodos', str(p.periodo_id)) : ctx.periodo();
    assert(periodo, 'El año escolar no existe.');
    var estado = ctx.estadoPago(est.id);
    var grado = ctx.db.get('Grados', ctx.gradoEnPeriodo(est, periodo.id));
    if (estado === 'moroso' && ctx.is('estudiante', 'representante')) {
      var cfg = ctx.config();
      return {
        bloqueado: true,
        motivo: 'moroso',
        estudiante: { id: est.id, nombre: est.nombre, cedula: est.cedula },
        grado: grado ? { id: grado.id, nombre: grado.nombre } : null,
        periodo: pick(periodo, ['id', 'nombre', 'lapso_activo', 'estado']),
        asistencia: resumenAsistenciaEstudiante(ctx, est, periodo),
        cuenta: { vencidos: ctx.cuenta(est.id).vencidos.map(nombreMes), deuda: ctx.cuenta(est.id).deuda, moneda: cfg.moneda },
        contacto: { telefono: cfg.telefono, email: cfg.email, nombre: cfg.nombre }
      };
    }
    var inf = buildInforme(ctx, est, periodo);
    inf.bloqueado = false;
    inf.estado_pago = estado;
    inf.asistencia_detalle = resumenAsistenciaEstudiante(ctx, est, periodo);
    inf.periodos = ctx.db.where('Periodos', function (x) {
      return x.estado === 'activo' || ctx.db.where('Promociones', function (pr) { return pr.periodo_id === x.id && pr.estudiante_id === est.id; }).length;
    }).map(function (x) { return pick(x, ['id', 'nombre', 'estado']); });
    return inf;
  });

  // — Profesor —

  action('getTeacherSubjects', ['profesor', 'admin', 'coordinador'], function (ctx, p) {
    var profId = ctx.is('profesor') ? ctx.user.id : str(p.profesor_id);
    var periodo = ctx.periodo();
    var grados = indexBy(ctx.db.all('Grados'), 'id');
    return ctx.db.where('Materias_Asignadas', function (m) { return m.profesor_id === profId; })
      .sort(function (a, b) {
        var ga = grados[a.grado_id], gb = grados[b.grado_id];
        return ((ga ? ga.orden : 0) - (gb ? gb.orden : 0)) || a.nombre.localeCompare(b.nombre);
      })
      .map(function (m) {
        var g = grados[m.grado_id];
        var alumnos = ctx.estudiantesDeGrado(m.grado_id);
        var evals = ctx.evaluaciones(m.id, periodo.id, periodo.lapso_activo);
        var notas = ctx.notasDe(evals.map(function (e) { return e.id; }));
        var celdas = alumnos.length * evals.length, cargadas = 0, suma = 0, cuenta = 0;
        alumnos.forEach(function (a) {
          var calc = calcLapso(evals, notas[a.id] || {});
          evals.forEach(function (e) { if (notas[a.id] && notas[a.id][e.id] !== undefined) cargadas++; });
          if (calc.parcial !== null) { suma += calc.parcial; cuenta++; }
        });
        return {
          id: m.id, nombre: m.nombre,
          grado: g ? { id: g.id, nombre: g.nombre, seccion: g.seccion, orden: g.orden } : null,
          estudiantes: alumnos.length,
          plan_pct: round2(evals.reduce(function (s, e) { return s + e.porcentaje; }, 0)),
          evaluaciones: evals.length,
          notas_pct: celdas ? round2((cargadas / celdas) * 100) : 0,
          promedio: cuenta ? round2(suma / cuenta) : null
        };
      });
  });

  action('getClassList', ['profesor', 'admin', 'coordinador'], function (ctx, p) {
    var m = ctx.materiaPropia(str(p.materia_id));
    return ctx.estudiantesDeGrado(m.grado_id).map(function (u) { return { id: u.id, nombre: u.nombre, cedula: u.cedula }; });
  });

  /** Todo lo que necesita la vista de una materia: plan, matriz de notas y asistencia. */
  action('getSubjectWorkspace', ['profesor', 'admin', 'coordinador'], function (ctx, p) {
    var m = ctx.materiaPropia(str(p.materia_id));
    var periodo = ctx.periodo();
    var lapso = p.lapso ? validarLapso(p.lapso) : periodo.lapso_activo;
    var grado = ctx.db.get('Grados', m.grado_id);
    var prof = ctx.db.get('Usuarios', m.profesor_id);
    var alumnos = ctx.estudiantesDeGrado(m.grado_id);
    var evals = ctx.evaluaciones(m.id, periodo.id, lapso);
    var notas = ctx.notasDe(evals.map(function (e) { return e.id; }));
    var asis = ctx.resumenAsistencia(m.id, periodo.id, lapso);
    var puedeEditar = ctx.is('profesor') || ctx.is('admin');
    return {
      materia: { id: m.id, nombre: m.nombre },
      grado: grado ? { id: grado.id, nombre: grado.nombre, seccion: grado.seccion } : null,
      profesor: prof ? prof.nombre : 'Sin asignar',
      periodo: periodo,
      lapso: lapso,
      editable: puedeEditar && ctx.cargaEditable(periodo, lapso),
      asistencia_editable: puedeEditar && periodo.estado === 'activo' && lapso === periodo.lapso_activo,
      evaluaciones: evals,
      estudiantes: alumnos.map(function (a) {
        var aa = asis.porEstudiante[a.id] || { ausencias: 0, justificadas: 0 };
        return {
          id: a.id, nombre: a.nombre, cedula: a.cedula,
          notas: notas[a.id] || {},
          ausencias: aa.ausencias, justificadas: aa.justificadas,
          inasistencia_pct: pctInasistencia(asis.clases, aa.ausencias)
        };
      }),
      clases: asis.clases
    };
  });

  function exigirCarga(ctx, lapso) {
    var periodo = ctx.periodo();
    if (!ctx.is('profesor', 'admin')) fail('PROHIBIDO', 'Su rol solo tiene acceso de lectura.');
    if (!ctx.cargaEditable(periodo, lapso)) {
      fail('LAPSO_CERRADO', 'La carga del lapso ' + lapso + ' está cerrada. Solo se puede editar el lapso activo mientras la coordinación lo mantenga abierto.');
    }
    return periodo;
  }

  action('saveEvaluationPlan', ['profesor', 'admin'], function (ctx, p) {
    var m = ctx.materiaPropia(str(p.materia_id));
    var lapso = validarLapso(p.lapso);
    var periodo = exigirCarga(ctx, lapso);
    var items = Array.isArray(p.evaluaciones) ? p.evaluaciones : [];
    assert(items.length >= 1 && items.length <= 20, 'El plan debe tener entre 1 y 20 evaluaciones.');

    var actuales = ctx.evaluaciones(m.id, periodo.id, lapso);
    var porId = indexBy(actuales, 'id');
    var total = 0;
    var limpios = items.map(function (it) {
      var titulo = str(it.titulo);
      var pct = Number(it.porcentaje);
      var fecha = str(it.fecha);
      var tipo = str(it.tipo) || 'Otro';
      assert(titulo.length >= 2 && titulo.length <= 80, 'Cada evaluación necesita un título (2 a 80 caracteres).');
      assert(isFinite(pct) && pct > 0 && pct <= 100, 'Cada porcentaje debe estar entre 1 y 100.');
      assert(Math.abs(round2(pct) - pct) < 1e-9, 'Use como máximo dos decimales en los porcentajes.');
      assert(!fecha || isIsoDate(fecha), 'Fecha inválida en "' + titulo + '".');
      assert(TIPOS_EVALUACION.indexOf(tipo) >= 0, 'Tipo de evaluación inválido.');
      if (it.id) assert(porId[it.id], 'Una evaluación del plan no pertenece a esta materia y lapso.');
      total += pct;
      return { id: str(it.id), titulo: titulo, porcentaje: round2(pct), fecha: fecha, tipo: tipo };
    });
    assert(Math.abs(total - 100) < 0.001, 'El plan de evaluación debe sumar exactamente 100 %. Suma actual: ' + round2(total) + ' %.');

    var conservar = {};
    limpios.forEach(function (it) { if (it.id) conservar[it.id] = true; });
    var eliminar = actuales.filter(function (e) { return !conservar[e.id]; }).map(function (e) { return e.id; });
    if (eliminar.length) {
      var set = {};
      eliminar.forEach(function (id) { set[id] = true; });
      ctx.db.remove('Notas', ctx.db.where('Notas', function (n) { return set[n.evaluacion_id]; }).map(function (n) { return n.id; }));
      ctx.db.remove('PlanesEvaluacion', eliminar);
    }
    ctx.db.updateMany('PlanesEvaluacion', limpios.filter(function (it) { return it.id; }).map(function (it) {
      return { key: it.id, patch: { titulo: it.titulo, porcentaje: it.porcentaje, fecha: it.fecha, tipo: it.tipo } };
    }));
    ctx.db.insert('PlanesEvaluacion', limpios.filter(function (it) { return !it.id; }).map(function (it) {
      return { materia_id: m.id, periodo_id: periodo.id, lapso: lapso, titulo: it.titulo, tipo: it.tipo, porcentaje: it.porcentaje, fecha: it.fecha };
    }));
    return A.getSubjectWorkspace.fn(ctx, { materia_id: m.id, lapso: lapso });
  });

  action('saveGrades', ['profesor', 'admin'], function (ctx, p) {
    var m = ctx.materiaPropia(str(p.materia_id));
    var lapso = validarLapso(p.lapso);
    var periodo = exigirCarga(ctx, lapso);
    var cambios = Array.isArray(p.notas) ? p.notas : [];
    assert(cambios.length <= 2000, 'Demasiados cambios en una sola operación.');

    var evals = indexBy(ctx.evaluaciones(m.id, periodo.id, lapso), 'id');
    var alumnos = indexBy(ctx.estudiantesDeGrado(m.grado_id), 'id');
    var existentes = {};
    ctx.db.all('Notas').forEach(function (n) { if (evals[n.evaluacion_id]) existentes[n.estudiante_id + '|' + n.evaluacion_id] = n; });

    var nuevas = [], updates = [], borrar = [];
    var stamp = ctx.stamp();
    cambios.forEach(function (c) {
      var estId = str(c.estudiante_id), evId = str(c.evaluacion_id);
      assert(alumnos[estId], 'Un estudiante no pertenece a esta materia.');
      assert(evals[evId], 'Una evaluación no pertenece a este plan.');
      var val;
      try { val = validarCalificacion(c.calificacion); } catch (e) {
        fail('VALIDACION', alumnos[estId].nombre + ' — ' + evals[evId].titulo + ': ' + e.message);
      }
      var prev = existentes[estId + '|' + evId];
      if (val === null) { if (prev) borrar.push(prev.id); return; }
      if (prev) updates.push({ key: prev.id, patch: { calificacion: val, actualizado: stamp } });
      else nuevas.push({ estudiante_id: estId, evaluacion_id: evId, calificacion: val, actualizado: stamp });
    });
    ctx.db.remove('Notas', borrar);
    ctx.db.updateMany('Notas', updates);
    ctx.db.insert('Notas', nuevas);
    var ws = A.getSubjectWorkspace.fn(ctx, { materia_id: m.id, lapso: lapso });
    ws.guardadas = nuevas.length + updates.length + borrar.length;
    return ws;
  });

  action('getAttendance', ['profesor', 'admin', 'coordinador'], function (ctx, p) {
    var m = ctx.materiaPropia(str(p.materia_id));
    var periodo = ctx.periodo();
    var fecha = str(p.fecha);
    assert(isIsoDate(fecha), 'Fecha inválida.');
    var registros = {};
    (ctx.db.index('Asistencia', 'materia_id')[m.id] || []).forEach(function (a) {
      if (a.periodo_id === periodo.id && a.fecha === fecha && a.estado !== 'presente') registros[a.estudiante_id] = a.estado;
    });
    var fechas = {};
    (ctx.db.index('Clases', 'materia_id')[m.id] || []).forEach(function (c) {
      if (c.periodo_id === periodo.id && c.lapso === periodo.lapso_activo) fechas[c.fecha] = true;
    });
    return {
      fecha: fecha,
      registrada: !!fechas[fecha] || Object.keys(registros).length > 0,
      estudiantes: ctx.estudiantesDeGrado(m.grado_id).map(function (u) {
        return { id: u.id, nombre: u.nombre, cedula: u.cedula, estado: registros[u.id] || 'presente' };
      }),
      fechas_registradas: Object.keys(fechas).sort().reverse()
    };
  });

  action('markAttendance', ['profesor', 'admin'], function (ctx, p) {
    var m = ctx.materiaPropia(str(p.materia_id));
    var periodo = ctx.periodo();
    assert(periodo.estado === 'activo', 'El año escolar está cerrado.');
    var fecha = str(p.fecha);
    assert(isIsoDate(fecha), 'Fecha inválida.');
    var manana = isoDate(new Date(ctx.adapter.now() + 86400000));
    assert(fecha <= manana, 'No puede registrar asistencia de fechas futuras.');
    var alumnos = indexBy(ctx.estudiantesDeGrado(m.grado_id), 'id');
    var registros = Array.isArray(p.registros) ? p.registros : [];
    assert(registros.length, 'No hay registros de asistencia.');
    var clase = (ctx.db.index('Clases', 'materia_id')[m.id] || []).filter(function (c) { return c.periodo_id === periodo.id && c.fecha === fecha; })[0];
    if (!clase) ctx.db.insert('Clases', { materia_id: m.id, periodo_id: periodo.id, lapso: periodo.lapso_activo, fecha: fecha });
    var lapso = clase ? clase.lapso : periodo.lapso_activo;
    var existentes = indexBy((ctx.db.index('Asistencia', 'materia_id')[m.id] || []).filter(function (a) {
      return a.periodo_id === periodo.id && a.fecha === fecha;
    }), 'estudiante_id');
    var nuevos = [], cambios = [], borrar = [];
    registros.forEach(function (r) {
      var id = str(r.estudiante_id);
      assert(alumnos[id], 'Un estudiante no pertenece a esta materia.');
      assert(['presente', 'ausente', 'justificado'].indexOf(r.estado) >= 0, 'Estado de asistencia inválido.');
      var prev = existentes[id];
      if (r.estado === 'presente') { if (prev) borrar.push(prev.id); return; }
      if (prev) { if (prev.estado !== r.estado) cambios.push({ key: prev.id, patch: { estado: r.estado } }); }
      else nuevos.push({ materia_id: m.id, periodo_id: periodo.id, lapso: lapso, fecha: fecha, estudiante_id: id, estado: r.estado });
    });
    ctx.db.remove('Asistencia', borrar);
    ctx.db.updateMany('Asistencia', cambios);
    ctx.db.insert('Asistencia', nuevos);
    return A.getAttendance.fn(ctx, { materia_id: m.id, fecha: fecha });
  });

  // — Coordinación —

  action('getAcademicOverview', STAFF, function (ctx, p) {
    var db = ctx.db;
    var periodo = ctx.periodo();
    var lapso = p.lapso ? validarLapso(p.lapso) : periodo.lapso_activo;
    var profes = indexBy(db.where('Usuarios', function (u) { return u.rol === 'profesor'; }), 'id');
    var grados = db.all('Grados').slice().sort(function (a, b) { return a.orden - b.orden || a.seccion.localeCompare(b.seccion); });
    var matsPorGrado = groupBy(db.all('Materias_Asignadas'), 'grado_id');
    var totales = { materias: 0, planes_completos: 0, notas_celdas: 0, notas_cargadas: 0 };

    var detalle = grados.map(function (g) {
      var alumnos = ctx.estudiantesDeGrado(g.id);
      var sumaGrado = 0, cuentaGrado = 0, aprobados = 0, evaluados = 0;
      var materias = (matsPorGrado[g.id] || []).slice().sort(byNombre).map(function (m) {
        var evals = ctx.evaluaciones(m.id, periodo.id, lapso);
        var notas = ctx.notasDe(evals.map(function (e) { return e.id; }));
        var plan = evals.reduce(function (s, e) { return s + e.porcentaje; }, 0);
        var celdas = alumnos.length * evals.length, cargadas = 0, suma = 0, cuenta = 0, aprob = 0;
        alumnos.forEach(function (a) {
          var n = notas[a.id] || {};
          evals.forEach(function (e) { if (n[e.id] !== undefined) cargadas++; });
          var c = calcLapso(evals, n);
          if (c.parcial !== null) {
            suma += c.parcial; cuenta++;
            if (redondear(c.parcial) >= NOTA_APROBATORIA) aprob++;
          }
        });
        totales.materias++;
        if (Math.abs(plan - 100) < 0.001) totales.planes_completos++;
        totales.notas_celdas += celdas;
        totales.notas_cargadas += cargadas;
        sumaGrado += suma; cuentaGrado += cuenta; aprobados += aprob; evaluados += cuenta;
        var prof = profes[m.profesor_id];
        return {
          id: m.id, nombre: m.nombre, profesor: prof ? prof.nombre : null,
          plan_pct: round2(plan), evaluaciones: evals.length,
          notas_pct: celdas ? round2((cargadas / celdas) * 100) : 0,
          promedio: cuenta ? round2(suma / cuenta) : null,
          aprobados_pct: cuenta ? round2((aprob / cuenta) * 100) : null
        };
      });
      return {
        id: g.id, nombre: g.nombre, seccion: g.seccion, estudiantes: alumnos.length,
        promedio: cuentaGrado ? round2(sumaGrado / cuentaGrado) : null,
        aprobados_pct: evaluados ? round2((aprobados / evaluados) * 100) : null,
        materias: materias
      };
    });

    return {
      periodo: periodo, lapso: lapso, grados: detalle,
      totales: {
        materias: totales.materias,
        planes_completos: totales.planes_completos,
        notas_pct: totales.notas_celdas ? round2((totales.notas_cargadas / totales.notas_celdas) * 100) : 0
      }
    };
  });

  /** Sábana de notas: estudiantes × materias para un lapso o las definitivas. */
  action('getGradeReport', STAFF, function (ctx, p) {
    var g = ctx.grado(str(p.grado_id));
    var periodo = ctx.periodo();
    var modo = p.lapso === 'final' ? 'final' : validarLapso(p.lapso || periodo.lapso_activo);
    var materias = ctx.db.where('Materias_Asignadas', function (m) { return m.grado_id === g.id; }).sort(byNombre);
    var filas = ctx.estudiantesDeGrado(g.id).map(function (est) {
      var inf = buildInforme(ctx, est, periodo);
      var celdas = {};
      inf.materias.forEach(function (m) {
        if (modo === 'final') celdas[m.id] = { nota: m.definitiva, parcial: m.promedio_parcial };
        else {
          var l = m.lapsos[modo - 1];
          celdas[m.id] = { nota: l.nota, parcial: l.parcial, evaluado_pct: l.evaluado_pct };
        }
      });
      var vals = Object.keys(celdas).map(function (k) { return celdas[k].nota !== null ? celdas[k].nota : celdas[k].parcial; })
        .filter(function (n) { return n !== null; });
      return {
        id: est.id, nombre: est.nombre, cedula: est.cedula, estado_pago: ctx.estadoPago(est.id),
        celdas: celdas, promedio: vals.length ? round2(avg(vals)) : null,
        inasistencia_pct: inf.asistencia.pct
      };
    });
    return {
      grado: pick(g, ['id', 'nombre', 'seccion']), periodo: periodo, lapso: modo,
      materias: materias.map(function (m) { return { id: m.id, nombre: m.nombre }; }),
      filas: filas
    };
  });

  action('getTraits', STAFF, function (ctx, p) {
    var g = ctx.grado(str(p.grado_id));
    var periodo = ctx.periodo();
    var lapso = validarLapso(p.lapso || periodo.lapso_activo);
    var rows = ctx.db.where('Rasgos', function (r) { return r.periodo_id === periodo.id && r.lapso === lapso; });
    var map = {};
    rows.forEach(function (r) { (map[r.estudiante_id] = map[r.estudiante_id] || {})[r.rasgo] = r.valor; });
    return {
      grado: pick(g, ['id', 'nombre', 'seccion']), lapso: lapso, periodo: periodo,
      editable: periodo.estado === 'activo',
      rasgos: RASGOS, escala: ESCALA_RASGOS,
      estudiantes: ctx.estudiantesDeGrado(g.id).map(function (e) { return { id: e.id, nombre: e.nombre, valores: map[e.id] || {} }; })
    };
  });

  action('saveTraits', STAFF, function (ctx, p) {
    var g = ctx.grado(str(p.grado_id));
    var periodo = ctx.periodo();
    var lapso = validarLapso(p.lapso);
    var alumnos = indexBy(ctx.estudiantesDeGrado(g.id), 'id');
    var existentes = {};
    ctx.db.where('Rasgos', function (r) { return r.periodo_id === periodo.id && r.lapso === lapso; })
      .forEach(function (r) { existentes[r.estudiante_id + '|' + r.rasgo] = r; });
    var nuevos = [], cambios = [], borrar = [];
    (p.valores || []).forEach(function (v) {
      var id = str(v.estudiante_id);
      assert(alumnos[id], 'Un estudiante no pertenece al grado.');
      assert(RASGOS.indexOf(v.rasgo) >= 0, 'Rasgo inválido.');
      var val = str(v.valor).toUpperCase();
      assert(!val || ESCALA_RASGOS[val], 'Valor de rasgo inválido.');
      var prev = existentes[id + '|' + v.rasgo];
      if (!val) { if (prev) borrar.push(prev.id); return; }
      if (prev) cambios.push({ key: prev.id, patch: { valor: val } });
      else nuevos.push({ estudiante_id: id, periodo_id: periodo.id, lapso: lapso, rasgo: v.rasgo, valor: val });
    });
    ctx.db.remove('Rasgos', borrar);
    ctx.db.updateMany('Rasgos', cambios);
    ctx.db.insert('Rasgos', nuevos);
    return A.getTraits.fn(ctx, { grado_id: g.id, lapso: lapso });
  });

  // — Cierre académico —

  action('previewPromotion', ['admin'], function (ctx) {
    var r = evaluarPromocion(ctx);
    r.ejecutada = r.periodo.promocion_ejecutada;
    return r;
  });

  action('executePromotion', ['admin'], function (ctx, p) {
    assert(str(p.confirmacion) === 'PROMOVER', 'Escriba PROMOVER para confirmar.');
    var periodo = ctx.periodo();
    assert(!periodo.promocion_ejecutada, 'La promoción de este año escolar ya fue ejecutada.');
    assert(periodo.lapso_activo === 3, 'La promoción solo puede ejecutarse durante el 3er lapso.');
    assert(!periodo.carga_abierta, 'Cierre la carga de notas del 3er lapso antes de ejecutar la promoción.');
    var ev = evaluarPromocion(ctx);
    var stamp = ctx.stamp();
    var cambiosUsuarios = [], promos = [], pendientes = [];
    ev.filas.forEach(function (f) {
      promos.push({
        periodo_id: periodo.id, estudiante_id: f.estudiante_id, grado_origen: f.grado_origen.id,
        grado_destino: f.grado_destino ? f.grado_destino.id : '', resultado: f.resultado,
        detalle: f.aplazadas.map(function (a) { return a.materia; }).join(', '), fecha: stamp
      });
      if (f.resultado === 'egresado') cambiosUsuarios.push({ key: f.estudiante_id, patch: { estado: 'egresado' } });
      else if (f.grado_destino && f.grado_destino.id !== f.grado_origen.id) cambiosUsuarios.push({ key: f.estudiante_id, patch: { grado_id: f.grado_destino.id } });
      if (f.resultado === 'materia_pendiente' || f.resultado === 'pendiente_egreso') {
        f.aplazadas.forEach(function (a) {
          pendientes.push({ estudiante_id: f.estudiante_id, periodo_id: periodo.id, grado_id: f.grado_origen.id, materia: a.materia, definitiva: a.definitiva, estado: 'pendiente' });
        });
      }
    });
    ctx.db.insert('Promociones', promos);
    ctx.db.insert('Materias_Pendientes', pendientes);
    ctx.db.updateMany('Usuarios', cambiosUsuarios);
    ctx.db.update('Periodos', periodo.id, { promocion_ejecutada: true, carga_abierta: false });
    return { resumen: ev.resumen, procesados: ev.filas.length };
  });

  // ─────────────────────────────── despacho ───────────────────────────────

  /**
   * Punto de entrada único. request = { action, token, params }.
   * Respuesta: { ok: true, data } | { ok: false, error: { code, message } }.
   */
  function handle(adapter, request) {
    try {
      request = request || {};
      var def = A[request.action];
      if (!def) fail('ACCION_DESCONOCIDA', 'Acción desconocida: ' + request.action);
      var db = new Db(adapter);
      var ctx = new Ctx(adapter, db, null);
      if (def.roles) {
        var uid = readToken(adapter, request.token);
        if (!uid) fail('SESION', 'Su sesión expiró. Inicie sesión nuevamente.');
        var user = db.get('Usuarios', uid);
        if (!user || user.estado !== 'activo') fail('SESION', 'Su cuenta no está activa.');
        if (def.roles.indexOf(user.rol) < 0) fail('PROHIBIDO', 'Su rol no tiene acceso a esta función.');
        ctx.user = user;
      }
      return { ok: true, data: def.fn(ctx, request.params || {}) };
    } catch (e) {
      if (e && e.sceError) return { ok: false, error: { code: e.code, message: e.message } };
      return { ok: false, error: { code: 'INTERNO', message: 'Error interno del servidor.', detail: String(e && e.message || e) } };
    }
  }

  return {
    VERSION: VERSION,
    SCHEMA: SCHEMA,
    CONFIG_DEFAULTS: CONFIG_DEFAULTS,
    RASGOS: RASGOS,
    TIPOS_EVALUACION: TIPOS_EVALUACION,
    BANCOS: BANCOS,
    handle: handle,
    hashPassword: hashPassword,
    calcLapso: calcLapso,
    isWrite: function (name) { return ESCRITURAS.indexOf(name) >= 0; },
    CONFIG_INFO: CONFIG_INFO,
    mesesDelPeriodo: mesesDelPeriodo,
    fechaVE: fechaVE,
    calcDefinitiva: calcDefinitiva,
    redondear: redondear,
    isoDate: isoDate,
    actions: Object.keys(A)
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SCE;
