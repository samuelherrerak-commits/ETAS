import { h, icon, initials, append, replace } from '../lib/dom.js';
import { api } from '../api/client.js';
import { store } from '../lib/store.js';
import { ROL_LABEL, cedula as fmtCedula } from '../lib/format.js';
import { brandMark, button, field, input, setLoading, callout } from '../ui/components.js';
import { toast } from '../ui/toast.js';
import { IS_DEMO } from '../config.js';

export function loginPage({ onSuccess }) {
  const ced = input({ name: 'cedula', inputmode: 'numeric', autocomplete: 'username', placeholder: 'Ej. 12345678' });
  const pass = input({ name: 'password', type: 'password', autocomplete: 'current-password', placeholder: '••••••••' });
  const eye = h('button.btn.btn-ghost.btn-icon.btn-sm.input-action', {
    type: 'button', 'aria-label': 'Mostrar contraseña',
    onclick: () => {
      const show = pass.type === 'password';
      pass.type = show ? 'text' : 'password';
      replace(eye, icon(show ? 'eyeOff' : 'eye'));
      eye.setAttribute('aria-label', show ? 'Ocultar contraseña' : 'Mostrar contraseña');
    },
  }, icon('eye'));
  const fCed = field({ label: 'Cédula de identidad', input: ced });
  const passGroup = h('div.input-group', icon('lock'), pass, eye);
  const fPass = field({ label: 'Contraseña', input: pass });
  fPass.replaceChild(passGroup, pass);
  passGroup.insertBefore(pass, eye);

  const alertBox = h('div', { hidden: true });
  const submit = button({ label: 'Ingresar', variant: 'dark', size: 'lg', type: 'submit', block: true, iconRight: 'arrowRight' });

  async function doLogin(e) {
    e?.preventDefault();
    const c = ced.value.replace(/\D/g, '');
    fCed.setError(!c ? 'Ingrese su número de cédula.' : null);
    fPass.setError(!pass.value ? 'Ingrese su contraseña.' : null);
    if (!c || !pass.value) return;
    alertBox.hidden = true;
    setLoading(submit, true);
    try {
      const { token, session } = await api.send('login', { cedula: c, password: pass.value });
      store.setAuth(token, session);
      toast.success(`Bienvenido(a), ${session.user.nombre.split(' ')[0]}`, ROL_LABEL[session.user.rol]);
      onSuccess();
    } catch (err) {
      setLoading(submit, false);
      replace(alertBox, callout('danger', err.code === 'RED' ? 'wifiOff' : 'alertCircle', err.message));
      alertBox.hidden = false;
      pass.select();
    }
  }

  const demo = IS_DEMO ? h('div.demo-box') : null;
  if (demo) {
    api.demoAccounts().then(({ cuentas, password }) => {
      append(demo, 
        h('div.row-between', h('div.eyebrow', 'Cuentas de demostración'), h('span.cell-sub', 'Contraseña: ', h('span.mono', password))),
        h('div.demo-list', cuentas.map((c) => h('button.demo-item', {
          type: 'button',
          onclick: () => { ced.value = c.cedula; pass.value = password; doLogin(); },
        },
        h('span.avatar', initials(c.nombre)),
        h('div', h('div.who', c.nombre), h('div.ced', fmtCedula(c.cedula))),
        h('span.badge', ROL_LABEL[c.rol])))));
    });
  }

  const inst = store.institucion;
  setTimeout(() => ced.focus(), 50);

  return h('div.login',
    h('aside.login-aside',
      h('div.brand', { style: { padding: 0 } },
        brandMark(inst.logo),
        h('div', h('div.brand-name', inst.nombre || 'Unidad Educativa'), h('div.brand-sub', 'Sistema de Control de Estudios'))),
      h('div.login-quote.enter',
        h('h2', 'La vida académica del colegio, en un solo lugar.'),
        h('p', 'Planes de evaluación, calificaciones de 1 a 20, asistencia, boletines y solvencia administrativa para docentes, estudiantes y representantes.')),
      h('div.login-facts',
        h('div', h('strong', '1–20'), 'Escala oficial'),
        h('div', h('strong', '3'), 'Lapsos por año'),
        h('div', h('strong', '5'), 'Perfiles de acceso'))),
    h('main.login-main',
      h('div.login-card.enter',
        h('div.eyebrow', 'Acceso institucional'),
        h('h1', 'Iniciar sesión'),
        h('p', 'Ingrese con su cédula de identidad. El sistema le llevará a su panel según su perfil.'),
        h('form.login-form.stack', { onsubmit: doLogin, novalidate: true },
          alertBox,
          h('div.input-group-field', fCed),
          fPass,
          submit),
        demo,
        h('p.cell-sub', { style: { marginTop: '24px' } }, '¿Olvidó su contraseña? Solicite el restablecimiento a la administración del colegio.'))));
}
