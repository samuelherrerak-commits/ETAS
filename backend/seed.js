/**
 * Datos de demostración realistas. Los usa el modo demo del navegador y la
 * función `seedDemoData()` de Apps Script, así ambos entornos arrancan
 * idénticos. Las fechas se generan relativas a "hoy" para que el año
 * escolar de ejemplo siempre esté en curso (2do lapso activo).
 */
var SCE_SEED = (function () {
  'use strict';

  var DEMO_PASSWORD = 'demo1234';

  function prng(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function build(adapter) {
    var rnd = prng(20262027);
    var pickOne = function (arr) { return arr[Math.floor(rnd() * arr.length)]; };
    var now = new Date(adapter.now());
    var stamp = now.toISOString();
    var dayMs = 86400000;
    var iso = function (offsetDays) { return SCE.isoDate(new Date(now.getTime() + offsetDays * dayMs)); };
    var weekday = function (offsetDays) {
      var d = new Date(now.getTime() + offsetDays * dayMs);
      while (d.getDay() === 0 || d.getDay() === 6) d = new Date(d.getTime() - dayMs);
      return SCE.isoDate(d);
    };
    var id = function (prefix, n) { return prefix + '-' + n; };
    var hash = function () { return SCE.hashPassword(adapter, DEMO_PASSWORD); };

    var y = now.getFullYear();
    var periodoNombre = now.getMonth() >= 7 ? y + '-' + (y + 1) : (y - 1) + '-' + y;
    var P = 'per-1';

    var T = {
      Config: [], Periodos: [], Grados: [], Usuarios: [], Relacion_Familiar: [], Materias_Asignadas: [],
      PlanesEvaluacion: [], Notas: [], Clases: [], Asistencia: [], Pagos: [], Mensualidades: [], Reportes_Pago: [], Avisos: [],
      Rasgos: [], Materias_Pendientes: [], Promociones: []
    };

    Object.keys(SCE.CONFIG_DEFAULTS).forEach(function (k) {
      T.Config.push({ clave: k, valor: SCE.CONFIG_DEFAULTS[k], descripcion: SCE.CONFIG_INFO[k] || '' });
    });
    T.Config.forEach(function (c) { if (c.clave === 'director') c.valor = 'Lcda. Carmen Villalobos'; });

    T.Periodos.push({ id: P, nombre: periodoNombre, lapso_activo: 2, carga_abierta: 'si', estado: 'activo', promocion_ejecutada: 'no', creado: stamp });

    var nombresGrado = ['1er Año', '2do Año', '3er Año', '4to Año', '5to Año', '6to Año'];
    nombresGrado.forEach(function (n, i) { T.Grados.push({ id: id('gr', i + 1), nombre: n, orden: i + 1, seccion: 'A' }); });

    function user(uid, cedula, nombre, rol, extra) {
      var u = { id: uid, cedula: cedula, password_hash: hash(), nombre: nombre, rol: rol, grado_id: '', estado: 'activo', email: '', telefono: '', creado: stamp };
      for (var k in extra || {}) u[k] = extra[k];
      T.Usuarios.push(u);
      return u;
    }

    user('usr-admin', '10000001', 'Ana Rodríguez', 'admin', { email: 'direccion@colegio.edu.ve' });
    user('usr-coord', '10000002', 'Carlos Mendoza', 'coordinador', { email: 'coordinacion@colegio.edu.ve' });

    var profes = [
      ['prof-1', '12345678', 'Samuel Herrera'],
      ['prof-2', '12000002', 'María Fernanda López'],
      ['prof-3', '12000003', 'José Gregorio Pérez'],
      ['prof-4', '12000004', 'Andreína Castillo'],
      ['prof-5', '12000005', 'Luis Alberto Marcano'],
      ['prof-6', '12000006', 'Daniela Rivas'],
      ['prof-7', '12000007', 'Rafael Suárez'],
      ['prof-8', '12000008', 'Gabriela Márquez']
    ];
    profes.forEach(function (p) { user(p[0], p[1], p[2], 'profesor'); });

    // Plan de estudios por año → [materia, profesor]
    var plan = {
      1: [['Matemáticas', 'prof-1'], ['Castellano', 'prof-2'], ['Inglés', 'prof-4'], ['Ciencias Naturales', 'prof-5'], ['Geografía, Historia y Ciudadanía', 'prof-6'], ['Arte y Patrimonio', 'prof-8'], ['Educación Física', 'prof-7']],
      2: [['Matemáticas', 'prof-3'], ['Castellano', 'prof-2'], ['Inglés', 'prof-4'], ['Ciencias Naturales', 'prof-5'], ['Geografía, Historia y Ciudadanía', 'prof-6'], ['Arte y Patrimonio', 'prof-8'], ['Educación Física', 'prof-7']],
      3: [['Matemáticas', 'prof-3'], ['Castellano', 'prof-2'], ['Inglés', 'prof-4'], ['Física', 'prof-8'], ['Química', 'prof-8'], ['Biología', 'prof-5'], ['Educación Física', 'prof-7']],
      4: [['Matemáticas', 'prof-3'], ['Castellano', 'prof-6'], ['Inglés', 'prof-4'], ['Física', 'prof-1'], ['Química', 'prof-8'], ['Biología', 'prof-5'], ['Educación Física', 'prof-7']],
      5: [['Matemáticas', 'prof-3'], ['Castellano', 'prof-6'], ['Inglés', 'prof-4'], ['Física', 'prof-1'], ['Química', 'prof-8'], ['Ciencias de la Tierra', 'prof-5'], ['Formación para la Soberanía Nacional', 'prof-6']],
      6: [['Matemáticas', 'prof-3'], ['Castellano', 'prof-6'], ['Inglés Técnico', 'prof-4'], ['Física', 'prof-1'], ['Dibujo Técnico', 'prof-8'], ['Proyecto de Investigación', 'prof-5']]
    };
    var mCount = 0;
    Object.keys(plan).forEach(function (orden) {
      plan[orden].forEach(function (m) {
        T.Materias_Asignadas.push({ id: id('mat', ++mCount), nombre: m[0], grado_id: id('gr', orden), profesor_id: m[1] });
      });
    });

    // Estudiantes y representantes
    var nombres = ['Valentina', 'Santiago', 'Isabella', 'Sebastián', 'Camila', 'Diego', 'Mariana', 'Andrés', 'Sofía', 'Gabriel', 'Victoria', 'Daniel',
      'Paola', 'Alejandro', 'Lucía', 'Miguel Ángel', 'Fabiana', 'Jesús', 'Emilia', 'Samuel', 'Antonella', 'Carlos Eduardo', 'Oriana', 'Luis Miguel'];
    var apellidos = ['González', 'Rodríguez', 'Pérez', 'Hernández', 'García', 'Martínez', 'Ramírez', 'Torres', 'Díaz', 'Morales', 'Rojas', 'Salazar',
      'Contreras', 'Blanco', 'Guerrero', 'Medina', 'Castro', 'Vargas', 'Silva', 'Romero', 'Flores', 'Mendoza', 'Acosta', 'Ortega'];
    var nombresRep = ['Carolina', 'José Luis', 'Yelitza', 'Pedro', 'Maryori', 'Freddy', 'Yuleisy', 'Richard', 'Milagros', 'Wilmer', 'Rosa', 'Nelson'];

    var estudiantes = [];
    var cedEst = 30000100;
    var cedRep = 14000100;
    var repN = 0;

    function rep(nombre, cedula) {
      return user(id('rep', ++repN), cedula || String(cedRep++), nombre, 'representante', {
        telefono: '0414-' + String(1000000 + Math.floor(rnd() * 8999999)).slice(0, 3) + '-' + String(1000 + Math.floor(rnd() * 8999)),
        email: ''
      });
    }

    function estudiante(uid, nombre, gradoOrden, cedula, habilidad) {
      var u = user(uid, cedula || String(cedEst++), nombre, 'estudiante', { grado_id: id('gr', gradoOrden) });
      u._habilidad = habilidad;
      estudiantes.push(u);
      return u;
    }

    // Cuentas de demostración con historia conocida
    var repSalazar = rep('Mariela Salazar', '15555666');
    var valentina = estudiante('est-demo', 'Valentina Herrera', 1, '30111222', 16.5);
    var diego = estudiante('est-moroso', 'Diego Salazar', 1, '30333444', 12);
    var sofia = estudiante('est-sofia', 'Sofía Salazar', 3, '29555777', 17.5);
    var repHerrera = rep('Ricardo Herrera');
    T.Relacion_Familiar.push({ id: 'rel-d1', representante_id: repSalazar.id, estudiante_id: diego.id, parentesco: 'Madre' });
    T.Relacion_Familiar.push({ id: 'rel-d2', representante_id: repSalazar.id, estudiante_id: sofia.id, parentesco: 'Madre' });
    T.Relacion_Familiar.push({ id: 'rel-d3', representante_id: repHerrera.id, estudiante_id: valentina.id, parentesco: 'Padre' });

    var eN = 0;
    for (var g = 1; g <= 6; g++) {
      var cupo = g === 1 ? 6 : (g === 3 ? 7 : 8);
      for (var k = 0; k < cupo; k++) {
        var ap = apellidos[(g * 7 + k * 5) % apellidos.length];
        var nm = nombres[(g * 5 + k * 3) % nombres.length] + ' ' + ap;
        var hab = 9.5 + rnd() * 9;
        if (k === 2 && g % 2 === 0) hab = 8.5; // casos de revisión para el cierre
        var est = estudiante(id('est', ++eN), nm, g, null, hab);
        var r = rep(pickOne(nombresRep) + ' ' + ap);
        T.Relacion_Familiar.push({ id: id('rel', eN), representante_id: r.id, estudiante_id: est.id, parentesco: 'Representante' });
      }
    }

    // Solvencia: mensualidades pagadas hasta hoy (los morosos deben el último mes exigible)
    var morosos = { 'est-moroso': true };
    estudiantes.forEach(function (e, i) { if (e.id !== 'est-demo' && e.id !== 'est-sofia' && i % 7 === 4) morosos[e.id] = true; });
    var cfgSeed = {};
    T.Config.forEach(function (c) { cfgSeed[c.clave] = c.valor; });
    var hoyVE = SCE.fechaVE(now.getTime());
    var limiteSeed = Number(cfgSeed.dia_limite_pago) || 5;
    var mesesPer = SCE.mesesDelPeriodo(periodoNombre, cfgSeed);
    var exigibles = mesesPer.filter(function (m) { return m < hoyVE.mes || (m === hoyVE.mes && hoyVE.d > limiteSeed); });
    var mesActual = mesesPer.indexOf(hoyVE.mes) >= 0 ? hoyVE.mes : null;
    var adeudados = {};
    var mN = 0;
    estudiantes.forEach(function (e, i) {
      T.Pagos.push({ estudiante_id: e.id, condicion: 'regular', ultima_actualizacion: stamp, observaciones: '' });
      var pagar = exigibles.slice();
      if (morosos[e.id] && pagar.length) adeudados[e.id] = pagar.splice(pagar.length - (pagar.length > 1 && i % 2 ? 2 : 1));
      if (!morosos[e.id] && mesActual && exigibles.indexOf(mesActual) < 0 && i % 2 === 0) pagar.push(mesActual);
      pagar.forEach(function (mes) {
        var dia = new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)) - 1, 2 + (i % 3));
        var fv = new Date(Math.min(dia.getTime(), now.getTime() - dayMs));
        T.Mensualidades.push({
          id: id('me', ++mN), estudiante_id: e.id, periodo_id: P, mes: mes, monto: Number(cfgSeed.mensualidad_monto) || 85,
          metodo: i % 5 === 0 ? 'caja' : 'transferencia', reporte_id: '', referencia: i % 5 === 0 ? 'Caja' : 'Pago Móvil ' + String(100000 + ((i * 7919 + mN * 104729) % 899999)),
          verificado_por: 'usr-admin', fecha_verificacion: fv.toISOString()
        });
      });
    });
    var mesesDeudaDe = function (e) { return adeudados[e.id] || (mesActual ? [mesActual] : mesesPer.slice(0, 1)); };

    // Planes de evaluación, notas y asistencia
    var planL1 = [['Prueba diagnóstica', 'Prueba corta', 15, -112], ['Taller en clase', 'Taller', 20, -98], ['Examen parcial', 'Examen', 25, -84], ['Proyecto grupal', 'Proyecto', 15, -70], ['Examen final de lapso', 'Examen', 25, -58]];
    var planL2 = [['Exposición oral', 'Exposición', 20, -30], ['Examen parcial', 'Examen', 30, -14], ['Informe de investigación', 'Informe', 20, 9], ['Examen final de lapso', 'Examen', 30, 24]];
    var diasL1 = [-116, -109, -102, -95, -88, -81, -74, -67, -60, -54];
    var diasL2 = [-40, -33, -26, -19, -12, -5];
    var faltones = {};
    estudiantes.forEach(function (e, i) { if (i % 11 === 6) faltones[e.id] = true; });

    var evN = 0, nN = 0, aN = 0, cN = 0;
    var nota = function (hab) {
      var v = hab + (rnd() - 0.5) * 6;
      return Math.max(1, Math.min(20, Math.round(v)));
    };

    T.Materias_Asignadas.forEach(function (m) {
      var alumnos = estudiantes.filter(function (e) { return e.grado_id === m.grado_id; });
      [[1, planL1], [2, planL2]].forEach(function (pl) {
        pl[1].forEach(function (ev) {
          var evId = id('ev', ++evN);
          var fecha = weekday(ev[3]);
          T.PlanesEvaluacion.push({ id: evId, materia_id: m.id, periodo_id: P, lapso: pl[0], titulo: ev[0], tipo: ev[1], porcentaje: ev[2], fecha: fecha });
          if (ev[3] > -2) return; // aún no se ha evaluado
          alumnos.forEach(function (a) {
            T.Notas.push({ id: id('n', ++nN), estudiante_id: a.id, evaluacion_id: evId, calificacion: nota(a._habilidad), actualizado: stamp });
          });
        });
      });
      [[1, diasL1], [2, diasL2]].forEach(function (pl) {
        pl[1].forEach(function (d) {
          var fecha = weekday(d);
          T.Clases.push({ id: id('cl', ++cN), materia_id: m.id, periodo_id: P, lapso: pl[0], fecha: fecha });
          alumnos.forEach(function (a) {
            var p = faltones[a.id] ? 0.36 : 0.06;
            var r = rnd();
            if (r >= p) return; // presente: no se guarda
            T.Asistencia.push({ id: id('as', ++aN), materia_id: m.id, periodo_id: P, lapso: pl[0], fecha: fecha, estudiante_id: a.id, estado: r < p * 0.25 ? 'justificado' : 'ausente' });
          });
        });
      });
    });

    // Rasgos de personalidad del 1er lapso
    var rN = 0;
    estudiantes.forEach(function (e) {
      SCE.RASGOS.forEach(function (rasgo) {
        var base = e._habilidad > 15 ? 'AB' : (e._habilidad > 11 ? 'ABC' : 'BCD');
        T.Rasgos.push({ id: id('ra', ++rN), estudiante_id: e.id, periodo_id: P, lapso: 1, rasgo: rasgo, valor: pickOne(base.split('')) });
      });
    });

    // Reportes de pago
    var monto1 = Number(cfgSeed.mensualidad_monto) || 85;
    var mesesDiego = mesesDeudaDe(diego);
    T.Reportes_Pago.push({
      id: 'rp-1', estudiante_id: diego.id, representante_id: repSalazar.id, referencia: '00482917', banco: 'Banesco',
      monto: monto1 * mesesDiego.length, fecha_pago: iso(-1), estado: 'pendiente', creado: new Date(now.getTime() - dayMs).toISOString(),
      revisado_por: '', observacion: '', meses: mesesDiego.join(','), fecha_revision: ''
    });
    var sofiaMes = T.Mensualidades.filter(function (m) { return m.estudiante_id === sofia.id; })[0];
    if (sofiaMes) {
      sofiaMes.reporte_id = 'rp-2';
      sofiaMes.referencia = 'Pago Móvil 00391004';
      T.Reportes_Pago.push({
        id: 'rp-2', estudiante_id: sofia.id, representante_id: repSalazar.id, referencia: '00391004', banco: 'Pago Móvil',
        monto: monto1, fecha_pago: sofiaMes.fecha_verificacion.slice(0, 10), estado: 'aprobado', creado: sofiaMes.fecha_verificacion,
        revisado_por: 'usr-admin', observacion: '', meses: sofiaMes.mes, fecha_revision: sofiaMes.fecha_verificacion
      });
    }
    T.Reportes_Pago.push({
      id: 'rp-4', estudiante_id: sofia.id, representante_id: repSalazar.id, referencia: '00377120', banco: 'Banesco',
      monto: monto1, fecha_pago: iso(-40), estado: 'rechazado', creado: new Date(now.getTime() - 40 * dayMs).toISOString(),
      revisado_por: 'usr-admin', observacion: 'La referencia no aparece en el estado de cuenta bancario. Verifique el número y vuelva a reportar.',
      meses: mesesPer[0], fecha_revision: new Date(now.getTime() - 39 * dayMs).toISOString()
    });
    var otroMoroso = estudiantes.filter(function (e) { return morosos[e.id] && e.id !== diego.id; })[0];
    if (otroMoroso) {
      var relO = T.Relacion_Familiar.filter(function (r) { return r.estudiante_id === otroMoroso.id; })[0];
      var mesesO = mesesDeudaDe(otroMoroso);
      T.Reportes_Pago.push({
        id: 'rp-3', estudiante_id: otroMoroso.id, representante_id: relO.representante_id, referencia: '7719203', banco: 'Mercantil',
        monto: monto1 * mesesO.length, fecha_pago: iso(0), estado: 'pendiente', creado: now.toISOString(),
        revisado_por: '', observacion: '', meses: mesesO.join(','), fecha_revision: ''
      });
    }

    // Avisos
    T.Avisos.push({ id: 'av-1', titulo: 'Reunión de representantes', contenido: 'Se convoca a todos los representantes a la reunión informativa del 2do lapso este viernes a las 8:00 a. m. en el auditorio. La asistencia es obligatoria.', fecha: new Date(now.getTime() - 1 * dayMs).toISOString(), roles_destino: 'representante,estudiante', prioridad: 'importante', autor_id: 'usr-coord' });
    T.Avisos.push({ id: 'av-2', titulo: 'Carga de notas del 2do lapso', contenido: 'Recordamos a los docentes que la carga de calificaciones del 2do lapso cierra al finalizar el mes. Verifiquen que sus planes de evaluación sumen 100 %.', fecha: new Date(now.getTime() - 3 * dayMs).toISOString(), roles_destino: 'profesor', prioridad: 'normal', autor_id: 'usr-coord' });
    T.Avisos.push({ id: 'av-3', titulo: 'Semana cultural', contenido: 'Del lunes al jueves de la próxima semana se realizará la Semana Cultural. Las evaluaciones programadas para esos días se reprogramarán con cada docente.', fecha: new Date(now.getTime() - 6 * dayMs).toISOString(), roles_destino: 'profesor,estudiante,representante', prioridad: 'normal', autor_id: 'usr-coord' });

    estudiantes.forEach(function (e) { delete e._habilidad; });
    return T;
  }

  return {
    DEMO_PASSWORD: DEMO_PASSWORD,
    build: build,
    cuentas: [
      { rol: 'admin', cedula: '10000001', nombre: 'Ana Rodríguez' },
      { rol: 'coordinador', cedula: '10000002', nombre: 'Carlos Mendoza' },
      { rol: 'profesor', cedula: '12345678', nombre: 'Samuel Herrera' },
      { rol: 'estudiante', cedula: '30111222', nombre: 'Valentina Herrera' },
      { rol: 'estudiante', cedula: '30333444', nombre: 'Diego Salazar (moroso)' },
      { rol: 'representante', cedula: '15555666', nombre: 'Mariela Salazar' }
    ]
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SCE_SEED;
