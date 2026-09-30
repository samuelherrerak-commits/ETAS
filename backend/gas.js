/**
 * Adaptador Google Sheets + Web App (doGet / doPost).
 *
 * Despliegue: Extensiones → Apps Script en la hoja de cálculo, pegue Code.gs,
 * ejecute `setupDatabase` una vez y publique como aplicación web
 * (Ejecutar como: Yo · Acceso: Cualquier usuario).
 *
 * CORS: Apps Script no permite fijar cabeceras, pero responde con
 * Access-Control-Allow-Origin: * tras su redirección. El frontend envía
 * POST con Content-Type text/plain para evitar la petición preflight.
 */

function sheetsAdapter_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var props = PropertiesService.getScriptProperties();
  var secret = props.getProperty('TOKEN_SECRET');
  if (!secret) {
    secret = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty('TOKEN_SECRET', secret);
  }
  var cache = {};

  function toHex(bytes) {
    return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
  }

  function sheet(table) {
    var sh = ss.getSheetByName(table);
    if (!sh) throw new Error('Falta la pestaña "' + table + '". Ejecute setupDatabase().');
    return sh;
  }

  /** Lee la pestaña completa y guarda el índice clave → fila. */
  function load(table) {
    if (cache[table]) return cache[table];
    var sh = sheet(table);
    var values = sh.getDataRange().getValues();
    var headers = (values.shift() || []).map(String);
    var keyCol = SCE.SCHEMA[table].key || 'id';
    var rows = values.map(function (v) {
      var o = {};
      headers.forEach(function (h, i) { o[h] = v[i]; });
      return o;
    });
    var index = {};
    rows.forEach(function (r, i) { index[String(r[keyCol])] = i; });
    cache[table] = { sheet: sh, headers: headers, rows: rows, index: index };
    return cache[table];
  }

  function toValues(t, row) {
    return t.headers.map(function (h) { return row[h] === undefined ? '' : row[h]; });
  }

  return {
    now: function () { return Date.now(); },
    uuid: function () { return Utilities.getUuid(); },
    sha256: function (s) {
      return toHex(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8));
    },
    hmac: function (s) {
      return toHex(Utilities.computeHmacSha256Signature(s, secret, Utilities.Charset.UTF_8));
    },
    readAll: function (table) { return load(table).rows.slice(); },
    append: function (table, rows) {
      var t = load(table);
      var keyCol = SCE.SCHEMA[table].key || 'id';
      var start = t.rows.length + 2;
      t.sheet.getRange(start, 1, rows.length, t.headers.length).setValues(rows.map(function (r) { return toValues(t, r); }));
      rows.forEach(function (r) { t.index[String(r[keyCol])] = t.rows.length; t.rows.push(r); });
    },
    update: function (table, keyCol, rows) {
      var t = load(table);
      var min = Infinity, max = -1;
      rows.forEach(function (r) {
        var i = t.index[String(r[keyCol])];
        if (i === undefined) throw new Error('Fila no encontrada en ' + table);
        t.rows[i] = r;
        min = Math.min(min, i);
        max = Math.max(max, i);
      });
      if (max < 0) return;
      var block = t.rows.slice(min, max + 1).map(function (r) { return toValues(t, r); });
      t.sheet.getRange(min + 2, 1, block.length, t.headers.length).setValues(block);
    },
    remove: function (table, keyCol, keys) {
      var t = load(table);
      var set = {};
      keys.forEach(function (k) { set[String(k)] = true; });
      var kept = t.rows.filter(function (r) { return !set[String(r[keyCol])]; });
      if (kept.length === t.rows.length) return;
      var oldLen = t.rows.length;
      if (kept.length) t.sheet.getRange(2, 1, kept.length, t.headers.length).setValues(kept.map(function (r) { return toValues(t, r); }));
      t.sheet.getRange(kept.length + 2, 1, oldLen - kept.length, t.headers.length).clearContent();
      delete cache[table];
    }
  };
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function dispatch_(request) {
  var lock = LockService.getScriptLock();
  var locked = lock.tryLock(25000);
  if (!locked) return { ok: false, error: { code: 'OCUPADO', message: 'El servidor está ocupado. Intente de nuevo en unos segundos.' } };
  try {
    return SCE.handle(sheetsAdapter_(), request);
  } finally {
    lock.releaseLock();
  }
}

function doPost(e) {
  var request;
  try {
    request = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return jsonOut_({ ok: false, error: { code: 'JSON', message: 'Solicitud mal formada.' } });
  }
  return jsonOut_(dispatch_(request));
}

/** GET ?payload={"action":"...","token":"...","params":{...}} — mismas reglas que POST. */
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (!p.payload) return jsonOut_({ ok: true, data: { service: 'SCE', version: SCE.VERSION } });
  var request;
  try { request = JSON.parse(p.payload); } catch (err) {
    return jsonOut_({ ok: false, error: { code: 'JSON', message: 'Solicitud mal formada.' } });
  }
  return jsonOut_(dispatch_(request));
}

/**
 * Crea las pestañas con sus encabezados (formato texto plano para que Sheets
 * no convierta fechas ni cédulas), el año escolar inicial, los grados de
 * 1er a 6to año y la cuenta de administrador. Seguro de re-ejecutar.
 */
function setupDatabase() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(SCE.SCHEMA).forEach(function (name) {
    var cols = SCE.SCHEMA[name].cols;
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    sh.getRange(1, 1, sh.getMaxRows(), Math.max(cols.length, sh.getMaxColumns())).setNumberFormat('@');
    sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold').setBackground('#0F172A').setFontColor('#FFFFFF');
    sh.setFrozenRows(1);
  });
  var def = ss.getSheetByName('Hoja 1') || ss.getSheetByName('Sheet1');
  if (def && ss.getSheets().length > 1 && def.getLastRow() === 0) ss.deleteSheet(def);

  var adapter = sheetsAdapter_();
  var db = { periodos: adapter.readAll('Periodos'), grados: adapter.readAll('Grados'), usuarios: adapter.readAll('Usuarios') };
  var now = new Date();
  if (!db.periodos.length) {
    var y = now.getFullYear();
    var nombre = now.getMonth() >= 7 ? y + '-' + (y + 1) : (y - 1) + '-' + y;
    adapter.append('Periodos', [{ id: adapter.uuid(), nombre: nombre, lapso_activo: 1, carga_abierta: 'si', estado: 'activo', promocion_ejecutada: 'no', creado: now.toISOString() }]);
  }
  if (!db.grados.length) {
    adapter.append('Grados', ['1er Año', '2do Año', '3er Año', '4to Año', '5to Año', '6to Año'].map(function (n, i) {
      return { id: adapter.uuid(), nombre: n, orden: i + 1, seccion: 'A' };
    }));
  }
  if (!db.usuarios.some(function (u) { return u.rol === 'admin'; })) {
    var pass = 'Admin-' + Utilities.getUuid().slice(0, 8);
    adapter.append('Usuarios', [{
      id: adapter.uuid(), cedula: '10000001', password_hash: SCE.hashPassword(adapter, pass), nombre: 'Administrador',
      rol: 'admin', grado_id: '', estado: 'activo', email: '', telefono: '', creado: now.toISOString()
    }]);
    Logger.log('Administrador creado → cédula: 10000001 · contraseña temporal: ' + pass + ' (cámbiela al ingresar)');
  }
  Logger.log('Base de datos lista.');
}

/** Reemplaza TODO el contenido por los datos de demostración (contraseña demo1234). */
function seedDemoData() {
  setupDatabase();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var adapter = sheetsAdapter_();
  var data = SCE_SEED.build(adapter);
  Object.keys(data).forEach(function (name) {
    var sh = ss.getSheetByName(name);
    var cols = SCE.SCHEMA[name].cols;
    if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, cols.length).clearContent();
    var rows = data[name];
    if (!rows.length) return;
    sh.getRange(2, 1, rows.length, cols.length).setNumberFormat('@').setValues(rows.map(function (r) {
      return cols.map(function (c) { return r[c] === undefined || r[c] === null ? '' : String(r[c]); });
    }));
  });
  Logger.log('Datos de demostración cargados. Contraseña de todas las cuentas: ' + SCE_SEED.DEMO_PASSWORD);
}
