/**
 * js/produccion.js — módulo Producción, pantalla Conteo (13/07/2026).
 * Reemplaza el conteo diario por WhatsApp. Estado en variables de módulo, no en el DOM,
 * para que sobreviva si el usuario cambia de pantalla y vuelve (mismo patrón que
 * carritoVegan en index.html).
 *
 * Revisión, Notificación y Pauta se agregan en pasos siguientes — este archivo solo
 * cubre Conteo por ahora.
 */

let cacheConteoCatalogo = null;           // { ok, catalogo:[{nombre, productoProduccion, categoria, stockMinimo}] }
let conteoCategoriasActivas = new Set();  // categorías con el chip activo
let conteoCantidades = {};                // clave "productoProduccion|categoria" -> cantidad contada

async function abrirConteo(forzar) {
  irA('screen-conteo');
  if (!cacheConteoCatalogo || forzar) {
    document.getElementById('conteo-chips').innerHTML = skeletonCards(1);
    document.getElementById('conteo-lista').innerHTML = skeletonCards(4);
    const r = await llamarAPI('obtenerCatalogoProduccion', { soloConteo: true });
    if (!r.ok) {
      document.getElementById('conteo-lista').innerHTML = '<p class="error-msg">' + (r.error || 'Error al cargar el catálogo') + '</p>';
      return;
    }
    cacheConteoCatalogo = r;
    // Por defecto NINGUNA categoría activa — que Rocío/el staff elija qué va a contar
    // en vez de arrancar con todo desplegado (confuso, mucho para escanear de una).
    conteoCategoriasActivas = new Set();
    conteoCantidades = {};
  }
  if (document.getElementById('screen-conteo').classList.contains('active')) pintarConteo();
}

function pintarConteo() {
  const categorias = [...new Set(cacheConteoCatalogo.catalogo.map(p => p.categoria))];

  document.getElementById('conteo-chips').innerHTML = categorias.map(c => {
    const activo = conteoCategoriasActivas.has(c);
    return '<span class="chip-cat' + (activo ? ' activo' : '') + '" onclick="toggleCategoriaConteo(\'' + c.replace(/'/g, "\\'") + '\')">' + c + '</span>';
  }).join('');

  let html = '';
  categorias.filter(c => conteoCategoriasActivas.has(c)).forEach(cat => {
    const productos = cacheConteoCatalogo.catalogo.filter(p => p.categoria === cat);
    if (!productos.length) return;
    html += '<p class="conteo-seccion-titulo">' + cat + '</p>';
    productos.forEach(p => {
      const key = p.productoProduccion + '|' + p.categoria;
      const val = conteoCantidades[key] !== undefined ? conteoCantidades[key] : 0;
      const keyEsc = key.replace(/'/g, "\\'");
      html += '<div class="conteo-row">' +
        '<span>' + p.nombre + '</span>' +
        '<div class="conteo-stepper">' +
          '<button type="button" onclick="cambiarCantidadConteo(\'' + keyEsc + '\',-1)">\u2212</button>' +
          '<input type="number" min="0" value="' + val + '" oninput="escribirCantidadConteo(\'' + keyEsc + '\',this.value)">' +
          '<button type="button" onclick="cambiarCantidadConteo(\'' + keyEsc + '\',1)">+</button>' +
        '</div>' +
      '</div>';
    });
  });
  if (!html) html = '<p style="font-size:13.5px;color:var(--ink-soft);padding:24px 0;text-align:center;">Elige qué categoría(s) vas a contar.</p>';
  document.getElementById('conteo-lista').innerHTML = html;
}

function toggleCategoriaConteo(cat) {
  if (conteoCategoriasActivas.has(cat)) conteoCategoriasActivas.delete(cat); else conteoCategoriasActivas.add(cat);
  pintarConteo();
}
function cambiarCantidadConteo(key, delta) {
  const actual = conteoCantidades[key] !== undefined ? conteoCantidades[key] : 0;
  conteoCantidades[key] = Math.max(0, actual + delta);
  pintarConteo();
}
function escribirCantidadConteo(key, val) {
  conteoCantidades[key] = Math.max(0, Number(val) || 0);
}

async function guardarConteo() {
  document.getElementById('conteo-error').textContent = '';
  if (!conteoCategoriasActivas.size) {
    document.getElementById('conteo-error').textContent = 'Selecciona al menos una categoría.';
    return;
  }
  const productos = [];
  cacheConteoCatalogo.catalogo.forEach(p => {
    if (!conteoCategoriasActivas.has(p.categoria)) return;
    const key = p.productoProduccion + '|' + p.categoria;
    productos.push({
      nombre: p.nombre, productoProduccion: p.productoProduccion, categoria: p.categoria,
      cantidadContada: conteoCantidades[key] !== undefined ? conteoCantidades[key] : 0
    });
  });
  if (!productos.length) {
    document.getElementById('conteo-error').textContent = 'No hay productos para guardar.';
    return;
  }
  const r = await llamarAPI('guardarConteoStock', {
    data: { responsable: sesion.nombre, categorias: [...conteoCategoriasActivas], productos }
  });
  if (!r.ok) {
    document.getElementById('conteo-error').textContent = r.error || 'Error al guardar el conteo';
    return;
  }
  conteoCantidades = {};
  document.getElementById('confirm-title').textContent = 'Conteo guardado';
  document.getElementById('confirm-msg').textContent = 'Se registraron ' + productos.length + ' productos. Rocío u Osmar lo revisan antes de pedir a producción.';
  document.getElementById('confirm-detalle').innerHTML = '';
  ocultarBotonOtro();
  irA('screen-confirm');
}

// ============ REVISIÓN Y ENVÍO ============
let cacheRevision = null;          // { ok, items:[...], conteoIds:[...] } — obtenerConteosPendientes()
let cacheCatalogoCompleto = null;  // catálogo completo (soloConteo:false), para "+ Agregar producto"
let revisionPedidos = {};          // productoProduccion -> cantidad a pedir
let revisionAgregados = [];        // [{productoProduccion, nombre}] agregados a mano, sin conteo previo

async function abrirRevision(forzar) {
  irA('screen-revision');
  if (!cacheRevision || forzar) {
    document.getElementById('revision-lista').innerHTML = skeletonCards(3);
    const r = await llamarAPI('obtenerConteosPendientes', {});
    if (!r.ok) {
      document.getElementById('revision-lista').innerHTML = '<p class="error-msg">' + (r.error || 'Error al cargar los conteos pendientes') + '</p>';
      return;
    }
    cacheRevision = r;
    revisionPedidos = {};
    revisionAgregados = [];
  }
  pintarRevision();
}

// "Empanadas" / "Empanadas Congeladas" son nombres de categoría, técnicos para la fila
// de detalle — se muestran como "Horneada"/"Congelada", más claro para decidir el pedido.
function detalleLegibleRevision_(detalle) {
  return (detalle || '').replace('Empanadas Congeladas', 'Congelada').replace('Empanadas', 'Horneada');
}

function pintarRevision() {
  const cont = document.getElementById('revision-lista');
  if (!cacheRevision.items.length && !revisionAgregados.length) {
    cont.innerHTML = '<p style="font-size:13.5px;color:var(--ink-soft);padding:24px 0;text-align:center;">No hay conteos pendientes de revisión.</p>';
    return;
  }
  let html = '';
  cacheRevision.items.forEach(it => {
    const val = revisionPedidos[it.productoProduccion] !== undefined ? revisionPedidos[it.productoProduccion] : '';
    const clave = it.productoProduccion.replace(/'/g, "\\'");
    html += '<div class="revision-row' + (it.bajoMinimo ? ' alerta' : '') + '">' +
      '<div class="revision-row-top">' +
        '<span>' + it.productoProduccion + '</span>' +
        '<input type="number" min="0" placeholder="0" value="' + val + '" oninput="cambiarPedidoRevision(\'' + clave + '\',this.value)">' +
      '</div>' +
      '<p class="revision-detalle">' + detalleLegibleRevision_(it.detalleContado) +
        (it.stockCongeladoVC ? ' · VC ' + it.stockCongeladoVC : '') +
        (it.stockMinimo ? ' · mínimo ' + it.stockMinimo : '') +
      '</p>' +
    '</div>';
  });
  revisionAgregados.forEach(a => {
    const val = revisionPedidos[a.productoProduccion] !== undefined ? revisionPedidos[a.productoProduccion] : '';
    const clave = a.productoProduccion.replace(/'/g, "\\'");
    html += '<div class="revision-row">' +
      '<div class="revision-row-top">' +
        '<span>' + a.nombre + '</span>' +
        '<input type="number" min="0" placeholder="0" value="' + val + '" oninput="cambiarPedidoRevision(\'' + clave + '\',this.value)">' +
      '</div>' +
      '<p class="revision-detalle">Agregado manualmente — sin conteo previo</p>' +
    '</div>';
  });
  cont.innerHTML = html;
}

function cambiarPedidoRevision(clave, val) {
  const n = Number(val);
  if (val === '' || isNaN(n)) delete revisionPedidos[clave];
  else revisionPedidos[clave] = Math.max(0, n);
}

async function mostrarBuscadorRevision() {
  document.getElementById('revision-error').textContent = '';
  if (!cacheCatalogoCompleto) {
    const r = await llamarAPI('obtenerCatalogoProduccion', { soloConteo: false });
    if (!r.ok) { document.getElementById('revision-error').textContent = r.error || 'Error al cargar el catálogo'; return; }
    cacheCatalogoCompleto = r;
  }
  // Dedupe por productoProduccion — Revisión pide por sabor, no por estado (Horneada/Congelada)
  const vistos = new Set();
  const opciones = [];
  cacheCatalogoCompleto.catalogo.forEach(p => {
    if (vistos.has(p.productoProduccion)) return;
    vistos.add(p.productoProduccion);
    opciones.push({ label: p.nombre, value: p.productoProduccion });
  });
  initSearchSelect('ss-rev-producto', opciones, { onSelect: (valor) => agregarProductoRevision(valor, opciones) });
  const wrap = document.getElementById('ss-rev-producto-wrap');
  wrap.style.display = 'block';
  document.querySelector('#ss-rev-producto input[type=text]').focus();
}

function agregarProductoRevision(valor, opciones) {
  const ya = cacheRevision.items.some(it => it.productoProduccion === valor) || revisionAgregados.some(a => a.productoProduccion === valor);
  if (ya) { document.getElementById('revision-error').textContent = 'Ese producto ya está en la lista.'; return; }
  const opt = opciones.find(o => o.value === valor);
  revisionAgregados.push({ productoProduccion: valor, nombre: opt ? opt.label : valor });
  document.getElementById('ss-rev-producto-wrap').style.display = 'none';
  document.querySelector('#ss-rev-producto input[type=text]').value = '';
  pintarRevision();
}

async function enviarRevision() {
  document.getElementById('revision-error').textContent = '';
  const items = [];
  cacheRevision.items.forEach(it => {
    const cant = revisionPedidos[it.productoProduccion];
    if (cant > 0) items.push({ productoProduccion: it.productoProduccion, cantidadProgramada: cant, cantidadContada: it.contadoTotal });
  });
  revisionAgregados.forEach(a => {
    const cant = revisionPedidos[a.productoProduccion];
    if (cant > 0) items.push({ productoProduccion: a.productoProduccion, cantidadProgramada: cant });
  });
  if (!items.length) {
    document.getElementById('revision-error').textContent = 'Escribe una cantidad a pedir en al menos un producto.';
    return;
  }

  const r = await llamarAPI('enviarProgramacionProduccion', {
    data: { responsable: sesion.nombre, conteoIds: cacheRevision.conteoIds, items }
  });
  if (!r.ok) { document.getElementById('revision-error').textContent = r.error || 'Error al enviar el pedido'; return; }

  // Notificación liviana a Rosa y Katherine — no es pantalla propia, es parte de enviar.
  const resumen = items.map(it => it.productoProduccion + ' x' + it.cantidadProgramada).join(', ');
  await llamarAPI('crearNotificacion', { para: ['Rosa Merino', 'Katherine Bustamante'], mensaje: 'Pedido de producción (' + sesion.nombre + '): ' + resumen });

  cacheRevision = null; revisionPedidos = {}; revisionAgregados = [];
  document.getElementById('confirm-title').textContent = 'Pedido enviado';
  document.getElementById('confirm-msg').textContent = 'Se avisó a Rosa y Katherine: ' + resumen;
  document.getElementById('confirm-detalle').innerHTML = '';
  ocultarBotonOtro();
  irA('screen-confirm');
}
