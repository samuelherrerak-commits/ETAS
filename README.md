# Sistema de Control de Estudios

Portal escolar para un colegio venezolano: planes de evaluación, notas de 1 a 20 por lapso, asistencia, boletines en PDF, solvencia administrativa y promoción de año.

- **Frontend:** sitio 100 % estático en **JavaScript vanilla** (módulos ES, sin frameworks ni paso de compilación).
- **Backend:** Google Apps Script como API + Google Sheets como base de datos (`Code.gs`).
- **Modo demo:** si no configura una URL de API, el mismo backend corre en el navegador sobre `localStorage` con datos de prueba. Todo el portal funciona sin conexión a Google.

## Probarlo en local

```bash
python3 -m http.server 5173     # o: npm run dev
# abra http://localhost:5173
```

> Se necesita un servidor HTTP (los módulos ES no cargan desde `file://`).

Cuentas de demostración (contraseña `demo1234`):

| Perfil | Cédula | Qué ver |
|---|---|---|
| Administración | 10000001 | Todo: año escolar, grados y materias, usuarios, finanzas, cierre académico |
| Coordinación | 10000002 | Supervisión de planes y notas, rendimiento, rasgos, cartelera |
| Docente (Samuel Herrera) | 12345678 | Matemáticas 1er Año y Física 4to/5to/6to Año |
| Estudiante solvente | 30111222 | Notas, detalle por evaluación, asistencia, boletín PDF |
| Estudiante moroso | 30333444 | Pantalla de bloqueo por solvencia |
| Representante | 15555666 | Dos representados (uno moroso), reporte de pagos |

Desde el menú del usuario, **Restablecer datos demo** vuelve al estado inicial.

## Reglas de negocio

- **Escala 1–20**, mínima aprobatoria 10. Hasta 2 decimales por evaluación.
- **Plan de evaluación por lapso:** los pesos deben sumar exactamente 100 %. Nota del lapso = Σ (nota × peso ÷ 100). Mientras no se evalúe el 100 % se muestra el promedio parcial.
- **Definitiva** = promedio de las tres notas de lapso redondeadas (9,5 → 10).
- **Lapsos:** solo se editan planes y notas del lapso activo, y solo mientras la carga esté abierta (la controla administración o coordinación).
- **Profesor ↔ alumnos:** cada materia pertenece a un grado y a un docente; la lista de clase son los estudiantes activos de ese grado. Un docente solo accede a sus materias.
- **Solvencia por mensualidad:** se cobran los meses configurados (septiembre a agosto por defecto). El mes en curso se paga del día 1 al día límite (5 por defecto). Desde el día siguiente, cada mes exigible sin pago deja al estudiante **insolvente**, y la deuda se acumula. La fecha se calcula en hora de Venezuela (UTC−4).
- **Morosidad:** un estudiante insolvente (o su representante) no recibe calificaciones ni boletín. Se aplica **en el servidor**, no solo en la interfaz. Administración puede **exonerar** a un estudiante (beca o convenio).
- **Pagos:**
  1. El representante reporta la transferencia e indica los meses que cubre.
  2. Administración la verifica y esos meses quedan pagados con su fecha de verificación. También puede registrar pagos recibidos en caja.
  3. Con todo al día, el representante descarga la **constancia de solvencia en PDF**, que lleva un código verificable.
- **Asistencia:** más de 25 % de inasistencias en una materia la aplaza.
- **Promoción (cierre académico):** 0 aplazadas → promovido (o egresado en el último año); 1–2 → materia pendiente; 3 o más → repitiente. Se ejecuta una sola vez por año, en el 3er lapso con la carga cerrada, y con confirmación escrita.

## Configuración del plantel

En el portal: **Administración → Configuración**. También directamente en la pestaña **`Config`** del Sheets, donde cada clave tiene su descripción:

| Clave | Uso |
|---|---|
| `nombre`, `rif`, `codigo_dea`, `direccion`, `telefono`, `email`, `director`, `ciudad` | Membrete del login, el menú, el boletín y la constancia |
| `logo` | Imagen del plantel. Súbala desde el portal: se ajusta sola para caber en la celda |
| `color_primario`, `color_acento` | Colores institucionales (#RRGGBB). Se aplican a todo el portal y a los PDF |
| `mensualidad_monto`, `moneda` | Monto de la mensualidad |
| `dia_limite_pago` | Último día para pagar el mes en curso (5) |
| `mes_inicio_cobro`, `mes_fin_cobro` | Meses que se cobran (9 a 8 = septiembre a agosto) |

## Escalabilidad

Un colegio de unos 700 alumnos funciona bien en Sheets. Para varios colegios, la recomendación es migrar a Supabase. El análisis con cifras y el plan de migración están en [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md).

## Estructura

```
index.html              Punto de entrada
css/                    Tokens, componentes y layout
js/
  config.js             API_URL (vacía = modo demo)
  main.js               Rutas por rol y arranque
  api/                  Cliente (caché + deduplicación) y backend demo
  lib/                  DOM, router por hash, estado, formato, cálculo de notas
  ui/                   Toasts, modales, shell, componentes
  pages/                admin · coord · profesor · estudiante · representante · shared
  pdf/                  Boletín y constancia de solvencia A4 con jsPDF (vendor/, sin CDN)
backend/
  core.js               Reglas de negocio, permisos y acciones (fuente única)
  seed.js               Datos de demostración
  gas.js                Adaptador Google Sheets + doGet/doPost
Code.gs                 Archivo generado para pegar en Apps Script
tests/                  Pruebas del núcleo (node --test)
```

`backend/core.js` se usa idéntico en el navegador (demo) y en Apps Script, así que las reglas no pueden divergir. Si lo modifica, regenere `Code.gs` con `npm run build:gas`.

## Desplegar el backend (Google Apps Script)

1. Cree una hoja de cálculo nueva en Google Sheets → **Extensiones → Apps Script**.
2. Pegue el contenido completo de `Code.gs` y guarde.
3. Ejecute la función **`setupDatabase`** (acepte los permisos). Crea las pestañas, el año escolar, los grados 1er–6to Año y un administrador (cédula `10000001`); la contraseña temporal aparece en el registro de ejecución. Para datos de prueba ejecute **`seedDemoData`** (reemplaza todo el contenido).
4. **Implementar → Nueva implementación → Aplicación web**: *Ejecutar como:* Yo · *Quién tiene acceso:* Cualquier usuario.
5. Copie la URL que termina en `/exec` en `js/config.js` → `API_URL`.

Notas:
- Las contraseñas se guardan con sal y hash SHA-256 iterado; las sesiones usan un token firmado con HMAC cuyo secreto vive en las propiedades del script.
- Apps Script no permite fijar cabeceras CORS, pero su respuesta final incluye `Access-Control-Allow-Origin: *`. El frontend envía `POST` con `Content-Type: text/plain` para evitar la petición preflight.
- Las escrituras usan `LockService` para que dos docentes guardando a la vez no se pisen.
- Cada nueva versión de `Code.gs` requiere **Implementar → Administrar implementaciones → Editar → Nueva versión**. Después ejecute `setupDatabase` otra vez: agrega las pestañas y claves nuevas sin borrar datos.
- **Respaldo diario:** ejecute una vez `instalarRespaldoDiario`. Copia la hoja cada noche a la carpeta "Respaldos SCE" de Drive y conserva 30 copias.

## Desplegar el frontend

Es un sitio estático: suba la carpeta tal cual.

- **Netlify / Vercel:** importe el repositorio sin comando de build; directorio de publicación `.`.
- **GitHub Pages:** active Pages sobre la rama principal (raíz).

## Pruebas

```bash
npm test
```

Cubren:
- login y límite de intentos;
- aislamiento entre profesor y materia;
- acceso del representante;
- validación del plan (100 %) y de las notas (1–20), y lapsos de solo lectura;
- cálculo ponderado y promoción;
- solvencia por fecha (día 5 contra día 6, en hora de Venezuela) y deuda acumulada;
- exoneración, flujo de reporte → verificación y constancia verificable;
- validación de la configuración y asistencia dispersa.

## Esquema de la base de datos

Una pestaña por tabla (encabezados en la fila 1, formato texto plano):
`Config`, `Periodos`, `Grados`, `Usuarios`, `Relacion_Familiar`, `Materias_Asignadas`, `PlanesEvaluacion`, `Notas`, `Clases`, `Asistencia` (solo ausencias y justificadas), `Pagos` (condición: regular o exonerado), `Mensualidades` (meses pagados), `Reportes_Pago`, `Avisos`, `Rasgos`, `Materias_Pendientes`, `Promociones`. Las columnas están definidas en `SCHEMA` dentro de `backend/core.js`.

Los representantes son usuarios con rol `representante` (se autentican igual que los demás) y se vinculan a sus representados en `Relacion_Familiar`.
