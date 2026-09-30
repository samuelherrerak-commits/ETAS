// Genera Code.gs (archivo único para Apps Script) a partir de backend/.
// Uso: node tools/build-gas.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const part = (f) => readFileSync(join(root, 'backend', f), 'utf8')
  .replace(/\nif \(typeof module !== 'undefined'[^\n]*\n?/, '\n');

const header = `/**
 * Code.gs — Sistema de Control de Estudios (backend Google Apps Script)
 * ARCHIVO GENERADO por tools/build-gas.mjs a partir de backend/core.js,
 * backend/seed.js y backend/gas.js. No lo edite a mano.
 *
 * 1. Cree una hoja de cálculo nueva → Extensiones → Apps Script.
 * 2. Pegue este archivo completo en Code.gs y guarde.
 * 3. Ejecute setupDatabase() (o seedDemoData() para datos de prueba).
 * 4. Implementar → Nueva implementación → Aplicación web
 *    (Ejecutar como: Yo · Quién tiene acceso: Cualquier usuario).
 * 5. Copie la URL /exec en js/config.js → API_URL.
 */
`;

writeFileSync(join(root, 'Code.gs'), header + '\n' + part('core.js') + '\n' + part('seed.js') + '\n' + part('gas.js'));
console.log('Code.gs generado.');
