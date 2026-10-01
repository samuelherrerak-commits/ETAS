# Arquitectura, escalabilidad y plan de migración

Este documento responde dos preguntas:

1. ¿Aguanta el sistema actual (Google Sheets + Apps Script) a **5 colegios con más de 700 alumnos cada uno**?
2. ¿Conviene pasar a **Supabase** y cómo hacerlo?

**Resumen:** un colegio de unos 700 alumnos funciona bien en Sheets con las optimizaciones ya incluidas. Para cinco colegios, o para cualquier escenario con mucha concurrencia (el día de entrega de boletines), la base correcta es **Supabase (PostgreSQL)**. La migración es acotada porque las reglas de negocio ya viven separadas del almacenamiento.

---

## 1. Cómo está construido hoy

```
Navegador (sitio estático, JS vanilla)
      │  POST { action, token, params }
      ▼
Apps Script (Code.gs)  ──►  SCE.handle(adapter, request)   ← backend/core.js: reglas, permisos, validación
      │                         │
      │                         ▼
      └──────────────────►  Adaptador Sheets: readAll / append / update / remove
                                │
                                ▼
                          Google Sheets (una pestaña por tabla)
```

- `backend/core.js` contiene **todas** las reglas: escala 1–20, ponderación, morosidad por mensualidad, permisos por rol y promoción. No sabe nada de Sheets.
- El almacenamiento es un **adaptador** de 4 funciones. El modo demo usa uno sobre `localStorage`, Apps Script usa uno sobre Sheets y el día de mañana puede usarse uno sobre PostgreSQL.

## 2. Volumen de datos por colegio (700 alumnos)

Supuestos: 6 grados con unas 4 secciones, unas 10 materias por sección, 15 evaluaciones por materia al año y unas 108 clases por materia al año.

| Tabla | Filas por año | Celdas por año |
|---|---:|---:|
| Notas | ~105.000 | ~525.000 |
| Asistencia (solo ausencias, ~6 %) | ~45.000 | ~315.000 |
| Clases dictadas | ~26.000 | ~130.000 |
| Mensualidades | ~8.400 | ~84.000 |
| Resto (usuarios, planes, reportes, rasgos…) | ~20.000 | ~150.000 |
| **Total** | | **≈ 1,2 millones** |

> Antes de esta versión la asistencia guardaba también los presentes: ~756.000 filas y 5,3 millones de celdas al año. Con el formato disperso (`Clases` + solo ausencias) bajó unas 17 veces.

**Límite de Google Sheets:** 10 millones de celdas por archivo.

- **1 colegio:** unos 8 años de datos antes del límite. Recomendado: archivar cada año escolar cerrado en una copia aparte.
- **5 colegios en una sola hoja:** 6 millones de celdas al año, así que se llega al límite en menos de 2 años. **No es viable.**

## 3. Límites de Apps Script que importan

| Límite | Valor | Impacto |
|---|---|---|
| Ejecuciones simultáneas por cuenta | ~30 | El día de boletines, cientos de representantes entran a la vez y los que pasan de 30 reciben error |
| Lectura de una pestaña grande | 1–3 s por cada 100.000 filas | Cada petición lee las tablas completas que necesita, así que la latencia típica es de 2 a 5 s |
| Tiempo máximo por ejecución | 6 min | Suficiente, salvo la promoción de un colegio muy grande |
| Escrituras | Serializadas con `LockService` | Dos docentes guardando a la vez esperan su turno |

Si los 5 colegios se implementan con **la misma cuenta de Google**, comparten el límite de concurrencia.

## 4. Lo que ya se hizo para robustecer la versión en Sheets

- **Las lecturas no hacen cola:** solo las acciones de escritura toman el candado (`SCE.isWrite`).
- **Asistencia dispersa:** tabla `Clases` y ausencias, en lugar de un registro por alumno y día.
- **Índices en memoria por petición:** notas, planes, asistencia y mensualidades se agrupan una sola vez. Calcular la solvencia de 700 alumnos o la promoción completa no recorre las tablas miles de veces.
- **Límite de intentos de inicio de sesión:** 5 fallos por cédula bloquean 15 minutos (`CacheService`).
- **Contraseñas** con sal y hash iterado; **sesiones** firmadas con HMAC cuyo secreto vive en las propiedades del script.
- **Reglas aplicadas en el servidor:** la morosidad, los permisos por rol y el cierre de lapsos no dependen de la interfaz.
- **Respaldo diario automático:** `instalarRespaldoDiario()` copia la hoja a Drive cada noche y conserva 30 copias.
- **Pruebas automáticas** del núcleo (`npm test`): solvencia por fecha, permisos, validaciones y promoción.

**Si se queda en Sheets, en el corto plazo:**
- una hoja y una implementación por colegio, cada una con **su propia cuenta de Google**;
- archivar el año escolar cerrado;
- no anunciar la entrega de boletines a todos los representantes a la misma hora; escalonar por grado.

## 5. Recomendación: Supabase para 5 colegios

Supabase es PostgreSQL administrado, con autenticación, almacenamiento de archivos y seguridad por filas (RLS).

| Necesidad | Sheets + Apps Script | Supabase |
|---|---|---|
| 3.500 alumnos y ~7.000 representantes | Al límite | Holgado |
| Concurrencia el día de boletines | ~30 ejecuciones | Cientos de conexiones con pooler |
| Consultas | Lee tablas completas | Índices: milisegundos |
| Multi-colegio | Una hoja por colegio | Un solo proyecto con `colegio_id` y RLS |
| Autenticación | Propia (hash en una celda) | Supabase Auth, con recuperación de contraseña por correo |
| Logos y comprobantes de pago | Data URL en una celda | Storage (imágenes y PDF reales) |
| Respaldos | Copia diaria a Drive | Diarios automáticos y restauración a un punto en el tiempo (Pro) |
| Costo | 0 | **Plan Pro: 25 USD/mes por proyecto** |

El plan gratuito sirve para pruebas, pero pausa el proyecto tras 7 días sin actividad y no incluye respaldos: para colegios en producción, el Pro.

### 5.1 Esquema multi-colegio

- Tabla `colegios` (id, nombre, rif, logo_url, color_primario, color_acento, reglas de cobranza…). Reemplaza a la pestaña `Config`.
- **Todas** las tablas actuales llevan `colegio_id`. Los grados, materias, usuarios y notas de un colegio nunca se mezclan con los de otro.
- `perfiles` (user_id → colegio_id, rol, cédula, nombre), enlazada a `auth.users`.
- Índices: `notas(estudiante_id)`, `notas(evaluacion_id)`, `asistencia(materia_id, fecha)`, `mensualidades(estudiante_id, periodo_id)`, y `colegio_id` en todo.
- La **seguridad por filas** reproduce las reglas de `core.js`. Por ejemplo:
  - un profesor solo lee las notas de las materias donde `profesor_id = auth.uid()`;
  - un representante solo ve a sus hijos (`relacion_familiar`);
  - nadie lee filas de otro `colegio_id`.

### 5.2 Dónde viven las reglas

1. **Fase 1, migración rápida:** una *Edge Function* de Supabase (Deno) ejecuta `backend/core.js` con un adaptador PostgreSQL.
   - Antes hay que hacer un cambio: `Db.all(tabla)` debe pasar a consultas filtradas (`where` con `colegio_id` y las claves de la petición), para no traer tablas completas.
   - El frontend solo cambia la URL del API.
2. **Fase 2, rendimiento:** las lecturas más usadas (estado de cuenta, notas del estudiante, sábana de rendimiento) pasan a **vistas y funciones SQL** que el frontend consulta directo con `supabase-js`, protegidas por RLS.
   - Las escrituras con reglas complejas (plan al 100 %, promoción) quedan como funciones RPC transaccionales.
   - Las pruebas de `tests/` se convierten en la especificación que deben cumplir.

### 5.3 Pasos de migración

1. Crear el proyecto Supabase (Pro) y el esquema SQL con `colegio_id`, índices y RLS.
2. Script de importación: leer cada hoja de Google Sheets (una por colegio) e insertarla con su `colegio_id`. Las contraseñas se migran con un restablecimiento masivo por correo, o con un hash compatible.
3. Edge Function con `core.js` y el adaptador PostgreSQL (fase 1). Correr `npm test` contra el nuevo adaptador.
4. En el frontend:
   - `js/api/client.js` con el transporte a la Edge Function;
   - inicio de sesión con Supabase Auth;
   - logos subidos a Storage.
5. Piloto con un colegio durante un lapso; luego incorporar los otros cuatro.
6. Fase 2 (vistas SQL y RLS) según las métricas reales de uso.

El sitio sigue siendo estático (Netlify, Vercel o GitHub Pages) en ambos escenarios.
