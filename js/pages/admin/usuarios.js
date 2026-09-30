import { h, icon, fold, debounce, replace } from '../../lib/dom.js';
import { api } from '../../api/client.js';
import { ROL_LABEL, cedula as fmtCed, plural } from '../../lib/format.js';
import {
  pageHeader, loadSection, skeletonTable, button, setLoading, field, input, select, emptyState, badge, avatar,
  searchInput, segmented, table, pagoBadge, callout,
} from '../../ui/components.js';
import { openModal, confirmDialog } from '../../ui/modal.js';
import { toast } from '../../ui/toast.js';

const FILTROS = [
  { value: 'todos', label: 'Todos' },
  { value: 'estudiante', label: 'Estudiantes' },
  { value: 'profesor', label: 'Docentes' },
  { value: 'representante', label: 'Representantes' },
  { value: 'staff', label: 'Directivos' },
];

function passwordReveal(nombre, pass) {
  openModal({
    title: 'Contraseña temporal', iconName: 'key', width: 420,
    description: `Entréguela a ${nombre}. Por seguridad no se volverá a mostrar.`,
    body: h('div.stack',
      h('div.card.card-pad.row-between', { style: { background: 'var(--surface-sunken)' } },
        h('span.mono', { style: { fontSize: 'var(--text-lg)' } }, pass),
        button({
          label: 'Copiar', size: 'sm', iconName: 'clipboard',
          onClick: () => navigator.clipboard?.writeText(pass).then(() => toast.success('Copiada al portapapeles')),
        })),
      callout('info', 'info', 'El usuario puede cambiarla desde su menú → “Cambiar contraseña”.')),
    footer: ({ close }) => [button({ label: 'Listo', variant: 'primary', onClick: () => close() })],
  });
}

export function usuariosPage({ query }) {
  let users = [];
  let grados = [];
  let filtro = 'todos';
  let term = '';
  const list = h('div');

  function userModal(u) {
    const isNew = !u;
    const nombre = input({ value: u?.nombre || '', autocomplete: 'off' });
    const ced = input({ value: u?.cedula || '', inputmode: 'numeric', autocomplete: 'off' });
    const rol = select(Object.entries(ROL_LABEL).map(([value, label]) => ({ value, label })), { value: u?.rol || 'estudiante' });
    const grado = select(grados.map((g) => ({ value: g.id, label: `${g.nombre}${g.seccion ? ` “${g.seccion}”` : ''}` })), { value: u?.grado_id || grados[0]?.id });
    const email = input({ type: 'email', value: u?.email || '' });
    const tel = input({ value: u?.telefono || '', inputmode: 'tel' });
    const estado = select([{ value: 'activo', label: 'Activo' }, { value: 'inactivo', label: 'Inactivo' }, { value: 'egresado', label: 'Egresado' }], { value: u?.estado || 'activo' });
    const hijos = new Set((u?.hijos || []).map((x) => x.id));

    const fNombre = field({ label: 'Nombre completo', input: nombre });
    const fCed = field({ label: 'Cédula', input: ced, help: 'Solo números. Es el usuario de acceso.' });
    const gradoField = field({ label: 'Grado que cursa', input: grado });
    const estudiantes = users.filter((x) => x.rol === 'estudiante' && x.estado === 'activo');
    const chipBox = h('div.chip-select');
    let hijoTerm = '';
    const renderChips = () => replace(chipBox, ...estudiantes
      .filter((e) => hijos.has(e.id) || (hijoTerm && fold(`${e.nombre} ${e.cedula}`).includes(fold(hijoTerm))))
      .slice(0, 40)
      .map((e) => h('button.chip', {
        type: 'button', 'aria-pressed': String(hijos.has(e.id)),
        onclick: () => { hijos.has(e.id) ? hijos.delete(e.id) : hijos.add(e.id); renderChips(); },
      }, hijos.has(e.id) ? icon('check') : icon('plus'), `${e.nombre} · ${e.grado}`)));
    renderChips();
    const hijosField = h('div.field',
      h('div.label', 'Representados'),
      searchInput({ placeholder: 'Buscar estudiante por nombre o cédula', onInput: (v) => { hijoTerm = v; renderChips(); } }),
      chipBox,
      h('div.field-help', 'Seleccione los estudiantes a cargo de este representante.'));

    const syncRol = () => {
      gradoField.hidden = rol.value !== 'estudiante';
      hijosField.hidden = rol.value !== 'representante';
    };
    rol.addEventListener('change', syncRol);
    syncRol();

    let save;
    openModal({
      title: isNew ? 'Nuevo usuario' : 'Editar usuario',
      description: isNew ? 'Se generará una contraseña temporal para el primer acceso.' : fmtCed(u.cedula),
      iconName: isNew ? 'userPlus' : 'user', width: 560,
      body: h('form.stack', { onsubmit: (e) => { e.preventDefault(); save.click(); } },
        fNombre,
        h('div.grid.grid-2', fCed, field({ label: 'Perfil', input: rol })),
        gradoField,
        h('div.grid.grid-2', field({ label: 'Correo (opcional)', input: email }), field({ label: 'Teléfono (opcional)', input: tel })),
        hijosField,
        isNew ? null : field({ label: 'Estado de la cuenta', input: estado })),
      footer: ({ close }) => [
        button({ label: 'Cancelar', onClick: () => close() }),
        save = button({
          label: isNew ? 'Crear usuario' : 'Guardar cambios', variant: 'primary',
          onClick: async () => {
            fNombre.setError(nombre.value.trim().length < 3 ? 'Indique el nombre completo.' : null);
            const c = ced.value.replace(/\D/g, '');
            fCed.setError(c.length < 5 ? 'La cédula debe tener al menos 5 dígitos.' : null);
            if (nombre.value.trim().length < 3 || c.length < 5) return;
            setLoading(save, true);
            try {
              const res = await api.send('saveUser', {
                id: u?.id, nombre: nombre.value, cedula: c, rol: rol.value, grado_id: grado.value,
                email: email.value, telefono: tel.value, estado: isNew ? undefined : estado.value,
                hijos: rol.value === 'representante' ? [...hijos] : undefined,
              });
              close();
              toast.success(isNew ? 'Usuario creado' : 'Cambios guardados', res.user.nombre);
              if (res.password_temporal) passwordReveal(res.user.nombre, res.password_temporal);
              load.reload();
            } catch (e) { toast.error('No se pudo guardar', e.message); setLoading(save, false); }
          },
        }),
      ],
    });
    setTimeout(() => nombre.focus(), 60);
  }

  function detalle(u) {
    if (u.rol === 'estudiante') {
      return h('div.row.wrap', { style: { '--gap': '6px' } }, h('span', u.grado || '—'), pagoBadge(u.estado_pago));
    }
    if (u.rol === 'representante') {
      return u.hijos?.length ? h('span.cell-sub', u.hijos.map((x) => x.nombre).join(', ')) : h('span.subtle', 'Sin representados');
    }
    return h('span.subtle', '—');
  }

  function renderList() {
    const t = fold(term);
    const rows = users.filter((u) => {
      if (filtro === 'staff' && !['admin', 'coordinador'].includes(u.rol)) return false;
      if (filtro !== 'todos' && filtro !== 'staff' && u.rol !== filtro) return false;
      return !t || fold(`${u.nombre} ${u.cedula} ${u.email}`).includes(t);
    });
    replace(list, h('div.card',
      h('div.card-header', h('span.cell-sub', plural(rows.length, 'usuario', 'usuarios'))),
      table({
        columns: [
          { label: 'Usuario', render: (u) => h('div.row', { style: { '--gap': '12px' } }, avatar(u.nombre),
            h('div', h('div.cell-title', u.nombre), h('div.cell-sub', fmtCed(u.cedula)))) },
          { label: 'Perfil', render: (u) => badge(ROL_LABEL[u.rol], u.rol === 'admin' ? 'navy' : (u.rol === 'coordinador' ? 'blue' : '')) },
          { label: 'Detalle', render: detalle },
          { label: 'Estado', render: (u) => (u.estado === 'activo' ? badge('Activo', 'green', { dot: true }) : badge(u.estado[0].toUpperCase() + u.estado.slice(1), '', { dot: true })) },
          { label: '', className: 'col-actions', render: (u) => h('div.row', { style: { justifyContent: 'flex-end' } },
            button({ iconName: 'key', size: 'sm', variant: 'ghost', title: 'Restablecer contraseña',
              onClick: () => confirmDialog({
                title: 'Restablecer contraseña', message: `Se generará una nueva contraseña temporal para ${u.nombre}.`, confirmLabel: 'Restablecer',
                onConfirm: async () => { const r = await api.send('resetPassword', { id: u.id }); setTimeout(() => passwordReveal(u.nombre, r.password_temporal), 220); },
              }) }),
            button({ iconName: 'pencil', size: 'sm', variant: 'ghost', title: 'Editar', onClick: () => userModal(u) })) },
        ],
        rows,
        empty: emptyState({ iconName: 'search', title: 'Sin resultados', text: 'Pruebe con otro nombre, cédula o filtro.' }),
      })));
  }

  const content = h('div');
  const load = loadSection(content, {
    skeleton: () => skeletonTable(8),
    fetch: async (o) => {
      const [u, e] = await Promise.all([api.get('listUsers', {}, o), api.get('getEstructura', {}, o)]);
      return { u, e };
    },
    render: ({ u, e }) => {
      users = u;
      grados = e.grados;
      renderList();
      if (query.nuevo) { delete query.nuevo; setTimeout(() => userModal(null), 50); }
      return h('div.stack',
        h('div.toolbar',
          searchInput({ placeholder: 'Buscar por nombre, cédula o correo', value: term, onInput: debounce((v) => { term = v; renderList(); }, 120) }),
          segmented(FILTROS, filtro, (v) => { filtro = v; renderList(); }, { label: 'Filtrar por perfil' })),
        list);
    },
  });

  return h('div.stack', { style: { '--gap': '24px' } },
    pageHeader({
      eyebrow: 'Administración',
      title: 'Usuarios',
      subtitle: 'Estudiantes, docentes, representantes y directivos con acceso al sistema.',
      actions: [button({ label: 'Nuevo usuario', iconName: 'userPlus', variant: 'primary', onClick: () => userModal(null) })],
    }),
    content);
}
