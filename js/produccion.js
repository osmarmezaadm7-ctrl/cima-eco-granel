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

// Rosa/Katherine (Vegan Corner) solo reportan SU propio stock congelado — no cuentan lo
// de Cima (Horneada/Pasteles/Congelados no son suyos). Esta pantalla se adapta sola:
// una sola categoría, sin chips, y el guardado va a StockCongeladoVC, no a ConteoStockCima.
function esVeganCorner_() { return !!(sesion && sesion.negocio === 'Vegan Corner'); }

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
    // Para Vegan Corner no aplica: solo existe una categoría posible para ellos.
    conteoCategoriasActivas = esVeganCorner_() ? new Set(['Empanadas Congeladas']) : new Set();
    conteoCantidades = {};
  }
  if (document.getElementById('screen-conteo').classList.contains('active')) pintarConteo();
}

function filaConteoDesktop_(p, key, val, keyEsc) {
  return '<tr><td style="padding:9px 6px;font-weight:600;color:var(--ink);">' + p.nombre + '</td>' +
    '<td style="padding:9px 6px;">' + p.categoria + '</td>' +
    '<td style="padding:6px;text-align:right;"><div class="conteo-stepper" style="display:inline-flex;">' +
      '<button type="button" onclick="cambiarCantidadConteo(\'' + keyEsc + '\',-1)">\u2212</button>' +
      '<input type="number" min="0" value="' + val + '" oninput="escribirCantidadConteo(\'' + keyEsc + '\',this.value)">' +
      '<button type="button" onclick="cambiarCantidadConteo(\'' + keyEsc + '\',1)">+</button>' +
    '</div></td></tr>';
}
function pintarConteoDesktop_(productos) {
  const titulo = document.querySelector('#screen-conteo h2');
  const boton = document.querySelector('#screen-conteo .submit-bar button');
  let html = '<table><thead><tr><th>Producto</th><th>Categoría</th><th style="text-align:right;">Cantidad</th></tr></thead><tbody>';
  productos.forEach(p => {
    const key = p.productoProduccion + '|' + p.categoria;
    const val = conteoCantidades[key] !== undefined ? conteoCantidades[key] : 0;
    html += filaConteoDesktop_(p, key, val, key.replace(/'/g, "\\'"));
  });
  html += '</tbody></table>';
  if (!productos.length) html = '<p style="font-size:13.5px;color:var(--ink-soft);padding:24px 0;text-align:center;">' +
    (esVeganCorner_() ? 'No hay empanadas configuradas para contar.' : 'Elige qué categoría(s) vas a contar.') + '</p>';
  document.getElementById('conteo-lista').innerHTML = html;
}
function pintarConteo() {
  const titulo = document.querySelector('#screen-conteo h2');
  const boton = document.querySelector('#screen-conteo .submit-bar button');
  const esAncho = window.matchMedia('(min-width: 900px)').matches;

  if (esVeganCorner_()) {
    document.getElementById('conteo-chips').style.display = 'none';
    if (titulo) titulo.textContent = 'Stock congelado';
    if (boton) boton.textContent = 'Guardar stock';
    const productos = cacheConteoCatalogo.catalogo.filter(p => p.categoria === 'Empanadas Congeladas');
    if (esAncho) { pintarConteoDesktop_(productos); return; }
    let html = '';
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
    document.getElementById('conteo-lista').innerHTML = html || '<p style="font-size:13.5px;color:var(--ink-soft);padding:24px 0;text-align:center;">No hay empanadas configuradas para contar.</p>';
    return;
  }

  document.getElementById('conteo-chips').style.display = '';
  if (titulo) titulo.textContent = 'Contar stock';
  if (boton) boton.textContent = 'Guardar conteo';
  const categorias = [...new Set(cacheConteoCatalogo.catalogo.map(p => p.categoria))];

  document.getElementById('conteo-chips').innerHTML = categorias.map(c => {
    const activo = conteoCategoriasActivas.has(c);
    return '<span class="chip-cat' + (activo ? ' activo' : '') + '" onclick="toggleCategoriaConteo(\'' + c.replace(/'/g, "\\'") + '\')">' + c + '</span>';
  }).join('');

  const productosActivos = cacheConteoCatalogo.catalogo.filter(p => conteoCategoriasActivas.has(p.categoria));
  if (esAncho) { pintarConteoDesktop_(productosActivos); return; }

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

let resumenConteoProductos = [];
let resumenConteoOrigenVC = false;

function revisarConteo() {
  document.getElementById('conteo-error').textContent = '';

  if (esVeganCorner_()) {
    const productos = cacheConteoCatalogo.catalogo.filter(p => p.categoria === 'Empanadas Congeladas');
    if (!productos.length) { document.getElementById('conteo-error').textContent = 'No hay productos para guardar.'; return; }
    const items = productos.map(p => {
      const key = p.productoProduccion + '|' + p.categoria;
      return { nombre: p.nombre, productoProduccion: p.productoProduccion, categoria: p.categoria, cantidadContada: conteoCantidades[key] !== undefined ? conteoCantidades[key] : 0 };
    });
    resumenConteoProductos = items;
    resumenConteoOrigenVC = true;
    pintarResumenConteo(items);
    irA('screen-resumen-conteo');
    return;
  }

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
  resumenConteoProductos = productos;
  resumenConteoOrigenVC = false;
  pintarResumenConteo(productos);
  irA('screen-resumen-conteo');
}

function pintarResumenConteo(productos) {
  const categorias = [...new Set(productos.map(p => p.categoria))];
  const esAncho = window.matchMedia('(min-width: 900px)').matches;
  let html = '';
  let totalUnidades = 0;
  categorias.forEach(cat => {
    const items = productos.filter(p => p.categoria === cat);
    if (esAncho) {
      html += '<p class="resumen-seccion-titulo">' + cat + '</p><table><tbody>' +
        items.map(p => { totalUnidades += p.cantidadContada; return '<tr><td style="padding:9px 6px;font-weight:700;">' + p.nombre + '</td><td style="padding:9px 6px;text-align:right;font-family:\'JetBrains Mono\',monospace;font-weight:700;">' + p.cantidadContada + '</td></tr>'; }).join('') +
        '</tbody></table>';
    } else {
      html += '<p class="resumen-seccion-titulo">' + cat + '</p>' +
        items.map(p => { totalUnidades += p.cantidadContada; return '<div class="resumen-fila"><span>' + p.nombre + '</span><strong>' + p.cantidadContada + '</strong></div>'; }).join('');
    }
  });
  document.getElementById('resumen-conteo-lista').innerHTML = html;
  document.getElementById('resumen-conteo-total').textContent =
    productos.length + ' producto' + (productos.length === 1 ? '' : 's') + ' · ' + totalUnidades + ' unidad' + (totalUnidades === 1 ? '' : 'es') + ' en total';
}

async function confirmarGuardarConteo() {
  document.getElementById('resumen-conteo-error').textContent = '';

  if (resumenConteoOrigenVC) {
    for (const p of resumenConteoProductos) {
      const r = await llamarAPI('actualizarStockCongeladoVC', { data: { producto: p.productoProduccion, stockActual: p.cantidadContada, responsable: sesion.nombre } });
      if (!r.ok) { document.getElementById('resumen-conteo-error').textContent = r.error || 'Error al guardar el stock'; return; }
    }
    conteoCantidades = {};
    document.getElementById('confirm-title').textContent = 'Stock actualizado';
    document.getElementById('confirm-msg').textContent = 'Se guardó tu stock congelado — Rocío lo va a ver en Revisión.';
    document.getElementById('confirm-detalle').innerHTML = '';
    ocultarBotonOtro();
    irA('screen-confirm');
    return;
  }

  const r = await llamarAPI('guardarConteoStock', {
    data: { responsable: sesion.nombre, categorias: [...conteoCategoriasActivas], productos: resumenConteoProductos }
  });
  if (!r.ok) {
    document.getElementById('resumen-conteo-error').textContent = r.error || 'Error al guardar el conteo';
    return;
  }
  conteoCantidades = {};
  document.getElementById('confirm-title').textContent = 'Conteo guardado';
  document.getElementById('confirm-msg').textContent = 'Se registraron ' + resumenConteoProductos.length + ' productos. Rocío u Osmar lo revisan antes de pedir a producción.';
  document.getElementById('confirm-detalle').innerHTML = '';
  ocultarBotonOtro();
  // Aviso corto a Rocío y Osmar, con botón directo a Revisión — el detalle completo se ve
  // al entrar, la notificación es solo un aviso de "hay algo nuevo que revisar".
  await llamarAPI('crearNotificacion', { para: ['Rocío Romo', 'Osmar Meza'], mensaje: JSON.stringify({ tipo: 'nuevoConteo', nombre: sesion.nombre }), accionNotif: 'abrirRevision' });
  irA('screen-confirm');
}

// ============ PEDIDOS (ex "Revisión y envío") — modo Desde conteo / Desde cero (16/07/2026) ============
let cacheRevision = null;          // { ok, items:[...], conteoIds:[...] } — obtenerConteosPendientes()
let cacheCatalogoCompleto = null;  // catálogo completo (soloConteo:false) — compartido entre "+ Agregar
                                    // producto", el modo Desde cero, y las etiquetas de factor de conversión
let revisionPedidos = {};          // productoProduccion -> cantidad a pedir (modo Desde conteo)
let revisionAgregados = [];        // [{productoProduccion, nombre}] agregados a mano, sin conteo previo
let revisionEliminados = new Set(); // productoProduccion quitados de la lista que vino del conteo (no se envían)
let revisionObservacion = '';      // observación general opcional (modo Desde conteo)
let revisionComentarios = {};      // productoProduccion -> comentario opcional por producto (Desde conteo)
let pedidoModo = 'conteo';         // 'conteo' | 'cero' — modo activo de la pantalla Pedidos

// Desde cero (NUEVO 16/07/2026, con Osmar): pedir por categoría sin partir de un conteo,
// mismo patrón visual que Conteo. Por defecto solo se ven los productos marcados
// ReportarEnConteo=true de cada categoría; "Ver más" despliega el resto.
let ceroCategoriasActivas = new Set();
let ceroCantidades = {};           // "productoProduccion|categoria" -> cantidad
let ceroComentarios = {};          // productoProduccion -> comentario opcional
let ceroVerMas = new Set();        // categorías con "Ver más" ya desplegado
let ceroObservacion = '';

async function cargarCatalogoCompletoProduccion_() {
  if (cacheCatalogoCompleto) return cacheCatalogoCompleto;
  const r = await llamarAPI('obtenerCatalogoProduccion', { soloConteo: false });
  if (r.ok) cacheCatalogoCompleto = r;
  return cacheCatalogoCompleto;
}
function factorDe_(productoProduccion) {
  if (!cacheCatalogoCompleto || !cacheCatalogoCompleto.catalogo) return 1;
  const p = cacheCatalogoCompleto.catalogo.find(x => x.productoProduccion === productoProduccion);
  return p ? (p.factorConversion || 1) : 1;
}
// NUEVO 16/07/2026 (con Osmar): salto del +/- al pedir (ej. Rollitos de canela de a 16).
// Solo aplica a los steppers de Pedidos — Conteo sigue contando de a 1 siempre.
function pasoDe_(productoProduccion) {
  if (!cacheCatalogoCompleto || !cacheCatalogoCompleto.catalogo) return 1;
  const p = cacheCatalogoCompleto.catalogo.find(x => x.productoProduccion === productoProduccion);
  return p ? (p.pasoPedido || 1) : 1;
}
// Ítems con factor > 1 (ej. tartas/kuchenes/queques, 1 unidad = 8 trozos) se piden por
// unidad entera — esta etiqueta lo deja explícito en vez de depender de que se recuerde.
function etiquetaFactorHtml_(productoProduccion) {
  const f = factorDe_(productoProduccion);
  if (f <= 1) return '';
  return '<p class="revision-detalle-factor">Se pide por unidad entera · 1 unidad = ' + f + ' trozos</p>';
}
function filaComentarioRevision_(clave) {
  const claveEsc = clave.replace(/'/g, "\\'");
  const val = revisionComentarios[clave];
  if (val !== undefined) {
    return '<input type="text" placeholder="Comentario (opcional)" value="' + (val || '').replace(/"/g, '&quot;') + '" oninput="cambiarComentarioProducto(\'' + claveEsc + '\',this.value)" style="width:100%;font-size:12.5px;height:32px;margin-top:6px;">';
  }
  return '<button type="button" class="btn-comentario-toggle" onclick="abrirComentarioProducto(\'' + claveEsc + '\')">+ Agregar comentario</button>';
}
function abrirComentarioProducto(clave) { revisionComentarios[clave] = revisionComentarios[clave] || ''; pintarRevision(); }
function cambiarComentarioProducto(clave, val) { revisionComentarios[clave] = val; }

async function abrirRevision(forzar, forzarModoConteo) {
  irA('screen-revision');
  document.getElementById('revision-error').textContent = '';
  if (!cacheCatalogoCompleto) await cargarCatalogoCompletoProduccion_();
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
    revisionEliminados = new Set();
    revisionObservacion = '';
    revisionComentarios = {};
    const taObs = document.getElementById('revision-observacion');
    if (taObs) taObs.value = '';
  }
  // CAMBIO 16/07/2026 (con Osmar): si hay conteo pendiente, abre en "Desde conteo" como
  // siempre. Si no hay, abre en "Desde cero" — salvo que venga forzado (botón de acción de
  // la notificación "nuevo conteo"), en cuyo caso siempre entra a "Desde conteo", aunque
  // ese conteo ya no esté pendiente (se ve el mensaje de "no hay conteo", a propósito: no
  // se debe traer un conteo viejo/ya procesado, para no influenciar pedidos ya entregados).
  const hayPendiente = !!(cacheRevision.items && cacheRevision.items.length);
  cambiarModoPedido(forzarModoConteo ? 'conteo' : (hayPendiente ? 'conteo' : 'cero'));
}

function cambiarModoPedido(modo) {
  pedidoModo = modo;
  document.getElementById('pedido-tab-btn-conteo').classList.toggle('activo', modo === 'conteo');
  document.getElementById('pedido-tab-btn-cero').classList.toggle('activo', modo === 'cero');
  document.getElementById('pedido-modo-conteo').style.display = modo === 'conteo' ? '' : 'none';
  document.getElementById('pedido-modo-cero').style.display = modo === 'cero' ? '' : 'none';

  if (modo === 'conteo') {
    const hayPendiente = !!(cacheRevision && cacheRevision.items && cacheRevision.items.length);
    document.getElementById('pedido-conteo-vacio').style.display = hayPendiente ? 'none' : '';
    document.getElementById('pedido-conteo-contenido').style.display = hayPendiente ? '' : 'none';
    if (hayPendiente) pintarRevision();
  } else {
    if (!cacheCatalogoCompleto) {
      document.getElementById('cero-lista').innerHTML = skeletonCards(3);
      cargarCatalogoCompletoProduccion_().then(pintarCero);
    } else {
      pintarCero();
    }
  }
}

// "Empanadas" / "Empanadas Congeladas" son nombres de categoría técnicos — se muestran
// como "Horneada"/"Congelada". Cualquier otra categoría (Pasteles, Congelados) se muestra
// como "Stock", genérico — repetir el nombre de la categoría ahí era redundante. Todos los
// badges llevan el mismo peso visual (mismo gris), incluido VC — ninguno se destaca más
// que otro, todos son solo datos de referencia para decidir el Pedir.
function badgesDetalleRevision_(detalle, stockVC) {
  const etiqueta = (cat) => cat === 'Empanadas Congeladas' ? 'Congelada' : cat === 'Empanadas' ? 'Horneada' : 'Stock';
  let html = Object.keys(detalle || {}).map(cat =>
    '<span class="revision-badge">' + etiqueta(cat) + ' ' + detalle[cat] + '</span>'
  ).join('');
  if (stockVC) html += '<span class="revision-badge">VC ' + stockVC + '</span>';
  return html;
}

function filaRevisionDesktop_(nombre, productoProduccion, val, clave, detalleHtml, factorHtml, comentarioHtml, quitarOnclick, alerta) {
  return '<tr' + (alerta ? ' style="background:var(--terracotta-soft);"' : '') + '>' +
    '<td style="padding:9px 4px;text-align:center;width:26px;"><button class="revision-quitar" title="Quitar" onclick="' + quitarOnclick + '"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"></path><path d="M6 6l12 12"></path></svg></button></td>' +
    '<td style="padding:9px 6px;"><div style="font-weight:700;">' + nombre + '</div>' + factorHtml + '</td>' +
    '<td style="padding:9px 6px;">' + detalleHtml + '</td>' +
    '<td style="padding:6px;text-align:center;"><div class="conteo-stepper" style="display:inline-flex;">' +
      '<button type="button" onclick="cambiarPedidoRevisionPaso(\'' + clave + '\',-1)">\u2212</button>' +
      '<input type="number" min="0" placeholder="0" value="' + val + '" oninput="cambiarPedidoRevision(\'' + clave + '\',this.value)">' +
      '<button type="button" onclick="cambiarPedidoRevisionPaso(\'' + clave + '\',1)">+</button>' +
    '</div></td>' +
    '<td style="padding:9px 6px;">' + comentarioHtml + '</td>' +
  '</tr>';
}
function comentarioInputDesktop_(clave, claveEsc) {
  const val = revisionComentarios[clave] || '';
  return '<input type="text" placeholder="Comentario (opcional)" value="' + val.replace(/"/g, '&quot;') + '" oninput="cambiarComentarioProducto(\'' + claveEsc + '\',this.value)" style="width:100%;font-size:12.5px;height:32px;">';
}
function pintarRevisionDesktop_() {
  const cont = document.getElementById('revision-lista');
  const itemsVisibles = cacheRevision.items.filter(it => !revisionEliminados.has(it.productoProduccion));
  if (!itemsVisibles.length && !revisionAgregados.length) {
    cont.innerHTML = '<p style="font-size:13.5px;color:var(--ink-soft);padding:24px 0;text-align:center;">No hay conteos pendientes de revisión.</p>';
    document.getElementById('revision-observacion-wrap').style.display = 'none';
    return;
  }
  document.getElementById('revision-observacion-wrap').style.display = '';
  let filas = '';
  itemsVisibles.forEach(it => {
    const val = revisionPedidos[it.productoProduccion] !== undefined ? revisionPedidos[it.productoProduccion] : '';
    const clave = it.productoProduccion.replace(/'/g, "\\'");
    filas += filaRevisionDesktop_(it.productoProduccion, it.productoProduccion, val, clave,
      badgesDetalleRevision_(it.detalle, it.stockCongeladoVC), etiquetaFactorHtml_(it.productoProduccion),
      comentarioInputDesktop_(it.productoProduccion, clave), 'quitarProductoRevision(\'' + clave + '\')', it.bajoMinimo);
  });
  revisionAgregados.forEach((a, idx) => {
    const val = revisionPedidos[a.productoProduccion] !== undefined ? revisionPedidos[a.productoProduccion] : '';
    const clave = a.productoProduccion.replace(/'/g, "\\'");
    filas += filaRevisionDesktop_(a.nombre, a.productoProduccion, val, clave,
      '<span class="revision-badge">Agregado manualmente</span>', etiquetaFactorHtml_(a.productoProduccion),
      comentarioInputDesktop_(a.productoProduccion, clave), 'quitarAgregadoRevision(' + idx + ')', false);
  });
  cont.innerHTML = '<table><thead><tr><th></th><th>Producto</th><th>Stock</th><th style="text-align:center;">Pedir</th><th>Comentario</th></tr></thead><tbody>' + filas + '</tbody></table>';
}
function pintarRevision() {
  if (window.matchMedia('(min-width: 900px)').matches) { pintarRevisionDesktop_(); return; }
  const cont = document.getElementById('revision-lista');
  const itemsVisibles = cacheRevision.items.filter(it => !revisionEliminados.has(it.productoProduccion));
  if (!itemsVisibles.length && !revisionAgregados.length) {
    cont.innerHTML = '<p style="font-size:13.5px;color:var(--ink-soft);padding:24px 0;text-align:center;">No hay conteos pendientes de revisión.</p>';
    document.getElementById('revision-observacion-wrap').style.display = 'none';
    return;
  }
  document.getElementById('revision-observacion-wrap').style.display = '';
  let html = '';
  itemsVisibles.forEach(it => {
    const val = revisionPedidos[it.productoProduccion] !== undefined ? revisionPedidos[it.productoProduccion] : '';
    const clave = it.productoProduccion.replace(/'/g, "\\'");
    html += '<div class="revision-row' + (it.bajoMinimo ? ' alerta' : '') + '">' +
      '<button class="revision-quitar" title="Quitar" onclick="quitarProductoRevision(\'' + clave + '\')"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"></path><path d="M6 6l12 12"></path></svg></button>' +
      '<div class="revision-row-top">' +
        '<span>' + it.productoProduccion + '</span>' +
        '<div class="conteo-stepper">' +
          '<button type="button" onclick="cambiarPedidoRevisionPaso(\'' + clave + '\',-1)">\u2212</button>' +
          '<input type="number" min="0" placeholder="0" value="' + val + '" oninput="cambiarPedidoRevision(\'' + clave + '\',this.value)">' +
          '<button type="button" onclick="cambiarPedidoRevisionPaso(\'' + clave + '\',1)">+</button>' +
        '</div>' +
      '</div>' +
      '<p class="revision-detalle">' + badgesDetalleRevision_(it.detalle, it.stockCongeladoVC) + '</p>' +
      etiquetaFactorHtml_(it.productoProduccion) +
      filaComentarioRevision_(it.productoProduccion) +
    '</div>';
  });
  revisionAgregados.forEach((a, idx) => {
    const val = revisionPedidos[a.productoProduccion] !== undefined ? revisionPedidos[a.productoProduccion] : '';
    const clave = a.productoProduccion.replace(/'/g, "\\'");
    html += '<div class="revision-row">' +
      '<button class="revision-quitar" title="Quitar" onclick="quitarAgregadoRevision(' + idx + ')"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"></path><path d="M6 6l12 12"></path></svg></button>' +
      '<div class="revision-row-top">' +
        '<span>' + a.nombre + '</span>' +
        '<div class="conteo-stepper">' +
          '<button type="button" onclick="cambiarPedidoRevisionPaso(\'' + clave + '\',-1)">\u2212</button>' +
          '<input type="number" min="0" placeholder="0" value="' + val + '" oninput="cambiarPedidoRevision(\'' + clave + '\',this.value)">' +
          '<button type="button" onclick="cambiarPedidoRevisionPaso(\'' + clave + '\',1)">+</button>' +
        '</div>' +
      '</div>' +
      '<p class="revision-detalle">Agregado manualmente</p>' +
      etiquetaFactorHtml_(a.productoProduccion) +
      filaComentarioRevision_(a.productoProduccion) +
    '</div>';
  });
  cont.innerHTML = html;
}

function quitarProductoRevision(clave) {
  revisionEliminados.add(clave);
  delete revisionPedidos[clave];
  delete revisionComentarios[clave];
  pintarRevision();
}
function quitarAgregadoRevision(idx) {
  const clave = revisionAgregados[idx].productoProduccion;
  delete revisionPedidos[clave];
  delete revisionComentarios[clave];
  revisionAgregados.splice(idx, 1);
  pintarRevision();
}
function cambiarObservacionRevision(val) {
  revisionObservacion = val;
}

function cambiarPedidoRevision(clave, val) {
  const n = Number(val);
  if (val === '' || isNaN(n)) delete revisionPedidos[clave];
  else revisionPedidos[clave] = Math.max(0, n);
}
function cambiarPedidoRevisionPaso(clave, signo) {
  const paso = pasoDe_(clave);
  const actual = revisionPedidos[clave] !== undefined ? revisionPedidos[clave] : 0;
  revisionPedidos[clave] = Math.max(0, actual + signo * paso);
  pintarRevision();
}

async function mostrarBuscadorRevision() {
  document.getElementById('revision-error').textContent = '';
  await cargarCatalogoCompletoProduccion_();
  if (!cacheCatalogoCompleto) { document.getElementById('revision-error').textContent = 'Error al cargar el catálogo'; return; }
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
  revisionPedidos[valor] = 1; // NUEVO 16/07/2026 (con Osmar): cantidad por defecto 1 al agregar manual
  document.getElementById('ss-rev-producto-wrap').style.display = 'none';
  document.querySelector('#ss-rev-producto input[type=text]').value = '';
  pintarRevision();
}

function revisarPedidoDesdeConteo() {
  document.getElementById('revision-error').textContent = '';
  const items = [];
  cacheRevision.items.forEach(it => {
    if (revisionEliminados.has(it.productoProduccion)) return;
    const cant = revisionPedidos[it.productoProduccion];
    if (cant > 0) items.push({ productoProduccion: it.productoProduccion, cantidadProgramada: cant, cantidadContada: it.contadoTotal, comentario: revisionComentarios[it.productoProduccion] || '' });
  });
  revisionAgregados.forEach(a => {
    const cant = revisionPedidos[a.productoProduccion];
    if (cant > 0) items.push({ productoProduccion: a.productoProduccion, cantidadProgramada: cant, comentario: revisionComentarios[a.productoProduccion] || '' });
  });
  if (!items.length) {
    document.getElementById('revision-error').textContent = 'Escribe una cantidad a pedir en al menos un producto.';
    return;
  }
  resumenPedidoItems = items;
  resumenPedidoOrigen = 'conteo';
  pintarResumenPedido(items, revisionObservacion);
  irA('screen-resumen-pedido');
}

// NUEVO 15/07/2026 (con Osmar): "Registrar stock" — cierra el/los conteo(s) pendientes
// sin generar pedido a producción (conteo pedido solo para tener el stock al día). No usa
// revisionPedidos/revisionAgregados para nada — solo importa qué conteos había pendientes.
async function registrarStockSinPedido() {
  document.getElementById('revision-error').textContent = '';
  if (!cacheRevision || !cacheRevision.conteoIds || !cacheRevision.conteoIds.length) {
    document.getElementById('revision-error').textContent = 'No hay conteos para registrar.';
    return;
  }
  const r = await llamarAPI('registrarConteoSinPedido', { data: { conteoIds: cacheRevision.conteoIds } });
  if (!r.ok) { document.getElementById('revision-error').textContent = r.error || 'Error al registrar el stock'; return; }

  cacheRevision = null; revisionPedidos = {}; revisionAgregados = []; revisionEliminados = new Set(); revisionObservacion = ''; revisionComentarios = {};
  document.getElementById('confirm-title').textContent = 'Stock registrado';
  document.getElementById('confirm-msg').textContent = 'El conteo quedó guardado, sin generar pedido a producción.';
  document.getElementById('confirm-detalle').innerHTML = '';
  ocultarBotonOtro();
  irA('screen-confirm');
}

// ============ PEDIDOS — DESDE CERO (NUEVO 16/07/2026, con Osmar) ============
// Mismo patrón visual que Conteo: chips de categoría, se despliegan los productos de la(s)
// categoría(s) activa(s). Por defecto solo los marcados ReportarEnConteo=true (los mismos
// que aparecen en Conteo) — "Ver más" despliega el resto de esa categoría. Al enviar, solo
// van los que quedaron en más de 0. No pasa por ningún conteo (conteoIds va vacío).
function toggleCategoriaCero(cat) {
  if (ceroCategoriasActivas.has(cat)) ceroCategoriasActivas.delete(cat); else ceroCategoriasActivas.add(cat);
  pintarCero();
}
function cambiarCantidadCero(key, signo) {
  const productoProduccion = key.split('|')[0];
  const paso = pasoDe_(productoProduccion);
  const actual = ceroCantidades[key] !== undefined ? ceroCantidades[key] : 0;
  ceroCantidades[key] = Math.max(0, actual + signo * paso);
  pintarCero();
}
function escribirCantidadCero(key, val) {
  ceroCantidades[key] = Math.max(0, Number(val) || 0);
}
function toggleVerMasCero(cat) {
  if (ceroVerMas.has(cat)) ceroVerMas.delete(cat); else ceroVerMas.add(cat);
  pintarCero();
}
function abrirComentarioCero(clave) { ceroComentarios[clave] = ceroComentarios[clave] || ''; pintarCero(); }
function cambiarComentarioCero(clave, val) { ceroComentarios[clave] = val; }
function cambiarObservacionCero(val) { ceroObservacion = val; }

function filaComentarioCero_(clave) {
  const claveEsc = clave.replace(/'/g, "\\'");
  const val = ceroComentarios[clave];
  if (val !== undefined) {
    return '<input type="text" placeholder="Comentario (opcional)" value="' + (val || '').replace(/"/g, '&quot;') + '" oninput="cambiarComentarioCero(\'' + claveEsc + '\',this.value)" style="width:100%;font-size:12.5px;height:32px;margin-top:6px;">';
  }
  return '<button type="button" class="btn-comentario-toggle" onclick="abrirComentarioCero(\'' + claveEsc + '\')">+ Agregar comentario</button>';
}
function filaProductoCero_(p, esExtra) {
  const key = p.productoProduccion + '|' + p.categoria;
  const val = ceroCantidades[key] !== undefined ? ceroCantidades[key] : 0;
  const keyEsc = key.replace(/'/g, "\\'");
  return '<div class="revision-row' + (esExtra ? ' revision-row-extra' : '') + '">' +
    '<div class="revision-row-top">' +
      '<span>' + p.nombre + '</span>' +
      '<div class="conteo-stepper">' +
        '<button type="button" onclick="cambiarCantidadCero(\'' + keyEsc + '\',-1)">\u2212</button>' +
        '<input type="number" min="0" value="' + val + '" oninput="escribirCantidadCero(\'' + keyEsc + '\',this.value)">' +
        '<button type="button" onclick="cambiarCantidadCero(\'' + keyEsc + '\',1)">+</button>' +
      '</div>' +
    '</div>' +
    etiquetaFactorHtml_(p.productoProduccion) +
    filaComentarioCero_(p.productoProduccion) +
  '</div>';
}

function comentarioInputCeroDesktop_(clave, claveEsc) {
  const val = ceroComentarios[clave] || '';
  return '<input type="text" placeholder="Comentario (opcional)" value="' + val.replace(/"/g, '&quot;') + '" oninput="cambiarComentarioCero(\'' + claveEsc + '\',this.value)" style="width:100%;font-size:12.5px;height:32px;">';
}
function filaProductoCeroDesktop_(p) {
  const key = p.productoProduccion + '|' + p.categoria;
  const val = ceroCantidades[key] !== undefined ? ceroCantidades[key] : 0;
  const keyEsc = key.replace(/'/g, "\\'");
  const claveComentario = p.productoProduccion.replace(/'/g, "\\'");
  return '<tr><td style="padding:9px 6px;"><div style="font-weight:700;">' + p.nombre + '</div>' + etiquetaFactorHtml_(p.productoProduccion) + '</td>' +
    '<td style="padding:6px;text-align:center;"><div class="conteo-stepper" style="display:inline-flex;">' +
      '<button type="button" onclick="cambiarCantidadCero(\'' + keyEsc + '\',-1)">\u2212</button>' +
      '<input type="number" min="0" value="' + val + '" oninput="escribirCantidadCero(\'' + keyEsc + '\',this.value)">' +
      '<button type="button" onclick="cambiarCantidadCero(\'' + keyEsc + '\',1)">+</button>' +
    '</div></td>' +
    '<td style="padding:9px 6px;">' + comentarioInputCeroDesktop_(p.productoProduccion, claveComentario) + '</td></tr>';
}
function pintarCeroDesktop_() {
  const categorias = [...new Set(cacheCatalogoCompleto.catalogo.map(p => p.categoria))];
  document.getElementById('cero-chips').innerHTML = categorias.map(c => {
    const activo = ceroCategoriasActivas.has(c);
    return '<span class="chip-cat' + (activo ? ' activo' : '') + '" onclick="toggleCategoriaCero(\'' + c.replace(/'/g, "\\'") + '\')">' + c + '</span>';
  }).join('');
  let html = '';
  categorias.filter(c => ceroCategoriasActivas.has(c)).forEach(cat => {
    const productosCat = cacheCatalogoCompleto.catalogo.filter(p => p.categoria === cat);
    if (!productosCat.length) return;
    const marcados = productosCat.filter(p => p.marcado);
    const noMarcados = productosCat.filter(p => !p.marcado);
    html += '<p class="conteo-seccion-titulo">' + cat + '</p><table><tbody>';
    html += marcados.map(filaProductoCeroDesktop_).join('');
    html += '</tbody></table>';
    if (noMarcados.length) {
      if (ceroVerMas.has(cat)) {
        html += '<table><tbody>' + noMarcados.map(filaProductoCeroDesktop_).join('') + '</tbody></table>';
      } else {
        html += '<button type="button" class="btn-vermas-cat" onclick="toggleVerMasCero(\'' + cat.replace(/'/g, "\\'") + '\')">Ver más de ' + cat + '</button>';
      }
    }
  });
  if (!html) html = '<p style="font-size:13.5px;color:var(--ink-soft);padding:24px 0;text-align:center;">Elige qué categoría(s) vas a pedir.</p>';
  document.getElementById('cero-lista').innerHTML = html;
}
function pintarCero() {
  if (window.matchMedia('(min-width: 900px)').matches) { pintarCeroDesktop_(); return; }
  const categorias = [...new Set(cacheCatalogoCompleto.catalogo.map(p => p.categoria))];
  document.getElementById('cero-chips').innerHTML = categorias.map(c => {
    const activo = ceroCategoriasActivas.has(c);
    return '<span class="chip-cat' + (activo ? ' activo' : '') + '" onclick="toggleCategoriaCero(\'' + c.replace(/'/g, "\\'") + '\')">' + c + '</span>';
  }).join('');

  let html = '';
  categorias.filter(c => ceroCategoriasActivas.has(c)).forEach(cat => {
    const productosCat = cacheCatalogoCompleto.catalogo.filter(p => p.categoria === cat);
    if (!productosCat.length) return;
    const marcados = productosCat.filter(p => p.marcado);
    const noMarcados = productosCat.filter(p => !p.marcado);
    html += '<p class="conteo-seccion-titulo">' + cat + '</p>';
    html += marcados.map(p => filaProductoCero_(p)).join('');
    if (noMarcados.length) {
      if (ceroVerMas.has(cat)) {
        html += noMarcados.map(p => filaProductoCero_(p, true)).join('');
      } else {
        html += '<button type="button" class="btn-vermas-cat" onclick="toggleVerMasCero(\'' + cat.replace(/'/g, "\\'") + '\')">Ver más de ' + cat + '</button>';
      }
    }
  });
  if (!html) html = '<p style="font-size:13.5px;color:var(--ink-soft);padding:24px 0;text-align:center;">Elige qué categoría(s) vas a pedir.</p>';
  document.getElementById('cero-lista').innerHTML = html;
}

let resumenPedidoItems = [];
let resumenPedidoOrigen = 'conteo'; // 'conteo' | 'cero'

function revisarPedidoDesdeCero() {
  document.getElementById('cero-error').textContent = '';
  const items = [];
  cacheCatalogoCompleto.catalogo.forEach(p => {
    const key = p.productoProduccion + '|' + p.categoria;
    const cant = ceroCantidades[key];
    if (cant > 0) items.push({ productoProduccion: p.productoProduccion, cantidadProgramada: cant, comentario: ceroComentarios[p.productoProduccion] || '' });
  });
  if (!items.length) {
    document.getElementById('cero-error').textContent = 'Escribe una cantidad a pedir en al menos un producto.';
    return;
  }
  resumenPedidoItems = items;
  resumenPedidoOrigen = 'cero';
  pintarResumenPedido(items, ceroObservacion);
  irA('screen-resumen-pedido');
}

// Compartido entre los dos modos de Pedidos — arma la pantalla de resumen antes de enviar.
function pintarResumenPedido(items, observacion) {
  const esAncho = window.matchMedia('(min-width: 900px)').matches;
  const html = esAncho
    ? '<table><tbody>' + items.map(it =>
        '<tr><td style="padding:9px 6px;"><div style="font-weight:700;">' + it.productoProduccion + '</div>' + (it.comentario ? '<div style="font-size:10.5px;color:var(--ink-soft);font-style:italic;margin-top:2px;">"' + it.comentario + '"</div>' : '') + '</td>' +
        '<td style="padding:9px 6px;text-align:right;font-family:\'JetBrains Mono\',monospace;font-weight:700;">' + it.cantidadProgramada + '</td></tr>'
      ).join('') + '</tbody></table>'
    : items.map(it =>
        '<div class="resumen-fila"><span>' + it.productoProduccion + '</span><strong>' + it.cantidadProgramada + '</strong></div>' +
        (it.comentario ? '<p class="resumen-fila-nota">"' + it.comentario + '"</p>' : '')
      ).join('');
  document.getElementById('resumen-pedido-lista').innerHTML = html;
  const wrapObs = document.getElementById('resumen-pedido-observacion-wrap');
  if (observacion) {
    document.getElementById('resumen-pedido-observacion-texto').textContent = observacion;
    wrapObs.style.display = '';
  } else {
    wrapObs.style.display = 'none';
  }
  document.getElementById('resumen-pedido-total').textContent = items.length + ' producto' + (items.length === 1 ? '' : 's') + ' · se avisa a Rosa y Katherine';
}

function volverAEditarPedido() {
  irA('screen-revision');
  cambiarModoPedido(resumenPedidoOrigen);
}

async function confirmarEnvioPedido() {
  document.getElementById('resumen-pedido-error').textContent = '';
  const conteoIds = resumenPedidoOrigen === 'conteo' ? cacheRevision.conteoIds : [];

  const r = await llamarAPI('enviarProgramacionProduccion', {
    data: { responsable: sesion.nombre, conteoIds: conteoIds, items: resumenPedidoItems }
  });
  if (!r.ok) { document.getElementById('resumen-pedido-error').textContent = r.error || 'Error al enviar el pedido'; return; }

  const observacion = resumenPedidoOrigen === 'conteo' ? revisionObservacion : ceroObservacion;
  const mensajeNotif = JSON.stringify({ tipo: 'pedidoProduccion', nombre: sesion.nombre, observacion: observacion || '' });
  await llamarAPI('crearNotificacion', { para: ['Rosa Merino', 'Katherine Bustamante'], mensaje: mensajeNotif, accionNotif: 'abrirPauta' });

  const totalItems = resumenPedidoItems.length;
  if (resumenPedidoOrigen === 'conteo') {
    cacheRevision = null; revisionPedidos = {}; revisionAgregados = []; revisionEliminados = new Set(); revisionObservacion = ''; revisionComentarios = {};
    const taObs = document.getElementById('revision-observacion'); if (taObs) taObs.value = '';
  } else {
    ceroCategoriasActivas = new Set(); ceroCantidades = {}; ceroComentarios = {}; ceroVerMas = new Set(); ceroObservacion = '';
    const taObs2 = document.getElementById('cero-observacion'); if (taObs2) taObs2.value = '';
  }
  resumenPedidoItems = [];

  document.getElementById('confirm-title').textContent = 'Pedido enviado';
  document.getElementById('confirm-msg').textContent = totalItems + ' producto' + (totalItems === 1 ? '' : 's') + '. Se avisó a Rosa y Katherine.';
  document.getElementById('confirm-detalle').innerHTML = '';
  ocultarBotonOtro();
  irA('screen-confirm');
}

// ============ PAUTA DE PRODUCCIÓN — MODELO DE SESIÓN DE TRABAJO ============
// Marcar "Hecho" y editar cantidad se guardan de inmediato como borrador (actualizarBorradorPauta)
// — no se pierde nada si se cae el navegador, y dos personas ven el mismo progreso en vivo.
// "Quitar" de la vista es puramente local (pautaOcultos) — no tiene consecuencia real, así que
// no hace falta guardarlo: si se refresca, el ítem simplemente reaparece.
// "+ Agregar producto" se escribe de inmediato (agregarItemPautaDirecto) — agregar sí es un
// hecho consumado. Solo "Confirmar producción" resuelve todo de una vez.
let cachePauta = null;              // { ok, pauta:[...] } — obtenerPautaActiva()
let pautaOcultos = new Set();       // ids ocultados de la vista en esta sesión (sin guardar)
let pautaAgregadosSesion = [];      // ids agregados durante esta sesión (para el registro al confirmar)
let pautaObservacionBorrador = '';  // observación única de la pauta activa — en memoria hasta confirmar, igual que el resto de Producción
let cacheCatalogoPauta = null;      // catálogo completo, para "+ Agregar producto"

// Historial de Pauta (NUEVO 15/07/2026 — con Osmar): tab de solo lectura sobre
// RegistroProduccion, paginado de 5 en 5 con "Ver más" (sin scroll infinito ni filtro por
// fecha — el volumen esperado es ~1 confirmación por día, no hace falta más que esto).
let cacheHistorialPauta = [];       // acumulado de tarjetas ya traídas
let historialPautaOffset = 0;       // cuántas filas ya se pidieron al servidor
let historialPautaHayMas = false;

let pautaSoloLectura = false; // true para Osmar/Rocío: ven Pendientes, pero no gestionan

async function abrirPauta(forzar) {
  irA('screen-pauta');
  if (forzar) { cacheHistorialPauta = []; historialPautaOffset = 0; }

  // CAMBIO 16/07/2026 (con Osmar): antes, quien tiene VerPrograma pero no GestionarPauta
  // (Osmar, Rocío) no veía nada de "Pauta activa" — solo Historial. Ahora sí ven esa
  // pestaña (renombrada "Pendientes" para ellos), pero en modo reducido: sin checklist, sin
  // +Agregar ni Confirmar producción (eso sigue siendo de quien tiene GestionarPauta) — solo
  // pueden ver el detalle y Eliminar un ítem atascado (eliminarItemPauta, con motivo).
  const soloHistorial = !tienePermisoLocal('GestionarPauta') && tienePermisoLocal('VerPrograma');
  pautaSoloLectura = soloHistorial;
  document.getElementById('pauta-tabs').style.display = '';
  document.getElementById('pauta-tab-btn-activa').textContent = soloHistorial ? 'Pendientes' : 'Pauta activa';
  document.getElementById('pauta-agregar-wrap').style.display = soloHistorial ? 'none' : '';
  document.getElementById('pauta-confirmar-wrap').style.display = soloHistorial ? 'none' : '';
  document.getElementById('pauta-observacion-wrap').style.display = soloHistorial ? 'none' : '';
  document.getElementById('pauta-observacion').value = pautaObservacionBorrador;

  cambiarTabPauta('activa');
  if (!cachePauta || forzar) {
    document.getElementById('pauta-lista').innerHTML = skeletonCards(3);
    const r = await llamarAPI('obtenerPautaActiva', {});
    if (!r.ok) {
      document.getElementById('pauta-lista').innerHTML = '<p class="error-msg">' + (r.error || 'Error al cargar la pauta') + '</p>';
      return;
    }
    cachePauta = r;
    pautaOcultos = new Set();
    pautaAgregadosSesion = [];
  }
  pintarPauta();
}

function claveGrupoPauta_(it) {
  return it.conteoId || (it.fecha + '|' + it.responsable + '|' + it.id);
}

function filaPautaDesktop_(it) {
  if (pautaSoloLectura) {
    const cant = it.cantidadBorrador !== null && it.cantidadBorrador !== undefined ? it.cantidadBorrador : it.cantidadProgramada;
    const nombreEsc = it.producto.replace(/'/g, "\\'");
    return '<tr><td style="padding:9px 6px;font-weight:700;">' + it.producto + (it.comentario ? '<div style="font-size:10.5px;color:var(--ink-soft);font-weight:400;margin-top:2px;">' + it.comentario + '</div>' : '') + '</td>' +
      '<td style="padding:9px 6px;color:var(--ink-soft);">' + it.fecha + ' · ' + it.responsable + ' · cantidad ' + cant + '</td>' +
      '<td style="padding:9px 6px;text-align:right;"><button class="btn-eliminar-pauta" onclick="abrirEliminarPauta(\'' + it.id + '\',\'' + nombreEsc + '\')">Eliminar</button></td></tr>';
  }
    const hecho = it.estadoBorrador === 'Hecho';
    const cant = it.cantidadBorrador !== null && it.cantidadBorrador !== undefined ? it.cantidadBorrador : it.cantidadProgramada;
    return '<tr id="pauta-row-' + it.id + '">' +
    '<td style="padding:9px 4px;width:30px;"><button class="pauta-check' + (hecho ? ' marcado' : '') + '" onclick="toggleHechoPauta(\'' + it.id + '\')" aria-label="Marcar hecho">' +
      (hecho ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg>' : '') +
    '</button></td>' +
    '<td style="padding:9px 6px;font-weight:700;">' + it.producto + (it.comentario ? '<div style="font-size:10.5px;color:var(--ink-soft);font-weight:400;margin-top:2px;">' + it.comentario + '</div>' : '') + '</td>' +
    '<td style="padding:6px;width:90px;"><input type="text" inputmode="numeric" value="' + cant + '" id="pauta-cant-' + it.id + '" onchange="cambiarCantidadBorradorPauta(\'' + it.id + '\',this.value)" style="width:70px;text-align:center;font-family:\'JetBrains Mono\',monospace;font-weight:700;border:1px solid var(--border);border-radius:7px;padding:6px 8px;"></td>' +
    '<td style="padding:9px 6px;width:30px;text-align:right;"><button class="pauta-quitar" title="Quitar" onclick="ocultarItemPauta(\'' + it.id + '\')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"></path><path d="M6 6l12 12"></path></svg></button></td></tr>';
}
function pintarPautaDesktop_() {
  const cont = document.getElementById('pauta-lista');
  const visibles = cachePauta.pauta.filter(it => !pautaOcultos.has(it.id));
  const planificados = visibles.filter(it => pautaAgregadosSesion.indexOf(it.id) === -1);
  const agregados = visibles.filter(it => pautaAgregadosSesion.indexOf(it.id) !== -1);
  if (!visibles.length) {
    cont.innerHTML = '<p style="font-size:13.5px;color:var(--ink-soft);padding:24px 0;text-align:center;">' +
      (pautaSoloLectura ? 'No hay ítems pendientes.' : 'No hay pedidos pendientes en la pauta.') + '</p>';
    return;
  }
  const grupos = {}; const ordenGrupos = [];
  planificados.forEach(it => {
    const clave = claveGrupoPauta_(it);
    if (!grupos[clave]) { grupos[clave] = { responsable: it.responsable, items: [] }; ordenGrupos.push(clave); }
    grupos[clave].items.push(it);
  });
  let html = '';
  ordenGrupos.forEach(clave => {
    const g = grupos[clave];
    html += '<p class="pauta-grupo-titulo">Pedido por: ' + g.responsable + '</p><table><tbody>' + g.items.map(filaPautaDesktop_).join('') + '</tbody></table>';
  });
  if (agregados.length) {
    html += '<p class="pauta-grupo-titulo">Agregado en esta sesión</p><table><tbody>' + agregados.map(filaPautaDesktop_).join('') + '</tbody></table>';
  }
  cont.innerHTML = html;
}
function pintarPauta() {
  const hayPendientes = cachePauta.pauta.filter(it => !pautaOcultos.has(it.id)).length > 0;
  document.getElementById('pauta-observacion-wrap').style.display = (pautaSoloLectura || !hayPendientes) ? 'none' : '';

  if (window.matchMedia('(min-width: 900px)').matches) { pintarPautaDesktop_(); return; }
  const cont = document.getElementById('pauta-lista');
  const visibles = cachePauta.pauta.filter(it => !pautaOcultos.has(it.id));
  const planificados = visibles.filter(it => pautaAgregadosSesion.indexOf(it.id) === -1);
  const agregados = visibles.filter(it => pautaAgregadosSesion.indexOf(it.id) !== -1);

  if (!visibles.length) {
    cont.innerHTML = '<p style="font-size:13.5px;color:var(--ink-soft);padding:24px 0;text-align:center;">' +
      (pautaSoloLectura ? 'No hay ítems pendientes.' : 'No hay pedidos pendientes en la pauta.') + '</p>';
    return;
  }

  const filaHtml = (it) => {
    if (pautaSoloLectura) {
      const cant = it.cantidadBorrador !== null && it.cantidadBorrador !== undefined ? it.cantidadBorrador : it.cantidadProgramada;
      const nombreEsc = it.producto.replace(/'/g, "\\'");
      return '<div class="pauta-row pauta-row-lectura">' +
        '<div class="pauta-row-top">' +
          '<div>' +
            '<span class="pauta-nombre">' + it.producto + '</span>' +
            '<p class="pauta-meta">' + it.fecha + ' · ' + it.responsable + ' · cantidad ' + cant + '</p>' +
          '</div>' +
          '<button class="btn-eliminar-pauta" onclick="abrirEliminarPauta(\'' + it.id + '\',\'' + nombreEsc + '\')">Eliminar</button>' +
        '</div>' +
        (it.comentario ? '<p class="pauta-obs">' + it.comentario + '</p>' : '') +
      '</div>';
    }
    const hecho = it.estadoBorrador === 'Hecho';
    const cant = it.cantidadBorrador !== null && it.cantidadBorrador !== undefined ? it.cantidadBorrador : it.cantidadProgramada;
    return '<div class="pauta-row' + (hecho ? ' hecho' : '') + '" id="pauta-row-' + it.id + '">' +
      '<button class="pauta-quitar" title="Quitar" onclick="ocultarItemPauta(\'' + it.id + '\')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"></path><path d="M6 6l12 12"></path></svg></button>' +
      '<div class="pauta-row-top">' +
        '<button class="pauta-check' + (hecho ? ' marcado' : '') + '" onclick="toggleHechoPauta(\'' + it.id + '\')" aria-label="Marcar hecho">' +
          (hecho ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg>' : '') +
        '</button>' +
        '<span class="pauta-nombre">' + it.producto + '</span>' +
        '<input type="text" inputmode="numeric" value="' + cant + '" id="pauta-cant-' + it.id + '" onchange="cambiarCantidadBorradorPauta(\'' + it.id + '\',this.value)">' +
      '</div>' +
      (it.comentario ? '<p class="pauta-obs">' + it.comentario + '</p>' : '') +
    '</div>';
  };

  // Planificados agrupados por pedido (mismo ConteoId+Responsable) — "Pedido por" una
  // sola vez por grupo, no repetido en cada producto.
  const grupos = {}; const ordenGrupos = [];
  planificados.forEach(it => {
    const clave = claveGrupoPauta_(it);
    if (!grupos[clave]) { grupos[clave] = { responsable: it.responsable, items: [] }; ordenGrupos.push(clave); }
    grupos[clave].items.push(it);
  });

  let html = '';
  ordenGrupos.forEach(clave => {
    const g = grupos[clave];
    html += '<p class="pauta-grupo-titulo">Pedido por: ' + g.responsable + '</p>' + g.items.map(filaHtml).join('');
  });
  if (agregados.length) {
    html += '<p class="pauta-grupo-titulo">Agregado en esta sesión</p>' + agregados.map(filaHtml).join('');
  }
  cont.innerHTML = html;
}

// NUEVO 16/07/2026 (con Osmar): eliminar un ítem atascado — solo disponible en modo
// pautaSoloLectura (Osmar/Rocío). No se borra la fila, queda marcada "Eliminado" con
// motivo (ver eliminarItemPauta en Produccion.gs).
function abrirEliminarPauta(id, nombre) {
  abrirModal(
    '<h3 style="font-size:15px;">Eliminar "' + nombre + '" de la Pauta</h3>' +
    '<label style="font-size:11.5px;color:var(--ink-soft);display:block;margin:10px 0 5px;">Motivo</label>' +
    '<input type="text" id="elim-pauta-motivo" placeholder="Ej: duplicado, ya no se necesita" style="width:100%;">' +
    '<div class="error-msg" id="elim-pauta-error"></div>' +
    '<div style="display:flex;gap:8px;margin-top:14px;">' +
      '<button class="btn-secondary" style="flex:1;" onclick="cerrarModal()">Cancelar</button>' +
      '<button class="btn-primary" style="flex:1;background:var(--terracotta);" onclick="confirmarEliminarPauta(\'' + id + '\')">Eliminar</button>' +
    '</div>'
  );
}
async function confirmarEliminarPauta(id) {
  const motivo = document.getElementById('elim-pauta-motivo').value;
  const r = await llamarAPI('eliminarItemPauta', { data: { id: id, motivo: motivo, responsable: sesion.nombre } });
  if (!r.ok) { document.getElementById('elim-pauta-error').textContent = r.error || 'Error al eliminar'; return; }
  cerrarModal();
  cachePauta.pauta = cachePauta.pauta.filter(x => x.id !== id);
  pintarPauta();
}

// CAMBIO 15/07/2026 (con Osmar): estos dos usaban llamarAPI, que muestra el overlay de
// carga de pantalla completa en cada llamada — como el checklist ya se actualiza al
// instante (optimista, ver arriba), ese overlay solo interrumpía el chequeo rápido de
// varios ítems seguidos. El guardado del borrador pasa a llamarAPISilencioso, igual que
// ya se usa para notificaciones — es un guardado de fondo, no necesita bloquear pantalla.
async function toggleHechoPauta(id) {
  const it = cachePauta.pauta.find(x => x.id === id);
  if (!it) return;
  it.estadoBorrador = it.estadoBorrador === 'Hecho' ? '' : 'Hecho';
  pintarPauta();
  await llamarAPISilencioso('actualizarBorradorPauta', { data: { id: id, estadoBorrador: it.estadoBorrador, cantidadBorrador: it.cantidadBorrador } });
}

async function cambiarCantidadBorradorPauta(id, val) {
  const it = cachePauta.pauta.find(x => x.id === id);
  if (!it) return;
  it.cantidadBorrador = Math.max(0, Number(val) || 0);
  await llamarAPISilencioso('actualizarBorradorPauta', { data: { id: id, estadoBorrador: it.estadoBorrador, cantidadBorrador: it.cantidadBorrador } });
}

function ocultarItemPauta(id) {
  pautaOcultos.add(id);
  pintarPauta();
}

async function mostrarBuscadorPauta() {
  document.getElementById('pauta-error').textContent = '';
  if (!cacheCatalogoPauta) {
    const r = await llamarAPI('obtenerCatalogoProduccion', { soloConteo: false });
    if (!r.ok) { document.getElementById('pauta-error').textContent = r.error || 'Error al cargar el catálogo'; return; }
    cacheCatalogoPauta = r;
  }
  const vistos = new Set();
  const opciones = [];
  cacheCatalogoPauta.catalogo.forEach(p => {
    if (vistos.has(p.productoProduccion)) return;
    vistos.add(p.productoProduccion);
    opciones.push({ label: p.nombre, value: p.productoProduccion });
  });
  initSearchSelect('ss-pauta-producto', opciones, { onSelect: (valor) => agregarProductoPauta(valor, opciones) });
  const wrap = document.getElementById('ss-pauta-producto-wrap');
  wrap.style.display = 'block';
  document.querySelector('#ss-pauta-producto input[type=text]').focus();
}

async function agregarProductoPauta(valor, opciones) {
  const opt = opciones.find(o => o.value === valor);
  const r = await llamarAPI('agregarItemPautaDirecto', { data: { producto: valor, cantidad: 1, responsable: sesion.nombre } });
  if (!r.ok) { document.getElementById('pauta-error').textContent = r.error || 'No se pudo agregar el producto'; return; }
  cachePauta.pauta.push({
    id: r.id, fecha: fechaLocalISO(), producto: opt ? opt.label : valor, cantidadProgramada: 1,
    estado: 'Programado', responsable: sesion.nombre, conteoId: '', cantidadContada: null,
    comentario: '', estadoBorrador: '', cantidadBorrador: null
  });
  pautaAgregadosSesion.push(r.id);
  document.getElementById('ss-pauta-producto-wrap').style.display = 'none';
  document.querySelector('#ss-pauta-producto input[type=text]').value = '';
  pintarPauta();
}

// NUEVO 16/07/2026 (con Osmar): resumen antes de confirmar — se calcula 100% en el cliente,
// con los mismos datos que ya se editan en pantalla (estadoBorrador/cantidadBorrador), sin
// llamar al backend todavía. Separa Completados / Agregado en esta sesión (aclarando que no
// venía en el pedido) / Quedan pendientes — mismo criterio que ya usa pintarPauta.
function escribirObservacionPautaBorrador(val) { pautaObservacionBorrador = val; }
function volverAEditarPauta() {
  document.getElementById('pauta-observacion').value = pautaObservacionBorrador;
  irA('screen-pauta');
}

function revisarPauta() {
  document.getElementById('pauta-error').textContent = '';
  const visibles = cachePauta.pauta.filter(it => !pautaOcultos.has(it.id));
  const completados = visibles.filter(it => it.estadoBorrador === 'Hecho');
  const faltantes = visibles.filter(it => it.estadoBorrador !== 'Hecho');
  if (!completados.length && !faltantes.length) {
    document.getElementById('pauta-error').textContent = 'No hay nada que confirmar.';
    return;
  }
  pintarResumenPauta(completados, faltantes);
  document.getElementById('resumen-pauta-observacion').value = pautaObservacionBorrador;
  irA('screen-resumen-pauta');
}

function filaResumenPauta_(it, atenuado) {
  const cant = it.cantidadBorrador !== null && it.cantidadBorrador !== undefined ? it.cantidadBorrador : it.cantidadProgramada;
  if (window.matchMedia('(min-width: 900px)').matches) {
    return '<tr' + (atenuado ? ' style="opacity:.6;"' : '') + '><td style="padding:9px 6px;"><div style="font-weight:700;">' + it.producto + '</div>' + (it.comentario ? '<div style="font-size:10.5px;color:var(--ink-soft);margin-top:2px;">' + it.comentario + '</div>' : '') + '</td>' +
      '<td style="padding:9px 6px;text-align:right;font-family:\'JetBrains Mono\',monospace;font-weight:700;">' + cant + '</td></tr>';
  }
  return '<div class="resumen-fila' + (atenuado ? ' atenuado' : '') + '"><span>' + it.producto + '</span><strong>' + cant + '</strong></div>' +
    (it.comentario ? '<p class="resumen-fila-nota">' + it.comentario + '</p>' : '');
}

function pintarResumenPauta(completados, faltantes) {
  const esAncho = window.matchMedia('(min-width: 900px)').matches;
  const abrirTabla = () => esAncho ? '<table><tbody>' : '';
  const cerrarTabla = () => esAncho ? '</tbody></table>' : '';
  const compPlanificados = completados.filter(it => pautaAgregadosSesion.indexOf(it.id) === -1);
  const compAgregados = completados.filter(it => pautaAgregadosSesion.indexOf(it.id) !== -1);

  let html = '';
  if (compPlanificados.length) {
    html += '<p class="resumen-seccion-titulo verde">Completados</p>' + abrirTabla() + compPlanificados.map(it => filaResumenPauta_(it)).join('') + cerrarTabla();
  }
  if (compAgregados.length) {
    html += '<p class="resumen-seccion-titulo caramelo">Agregado en esta sesión <span class="resumen-seccion-nota">· no venía en el pedido</span></p>' +
      abrirTabla() + compAgregados.map(it => filaResumenPauta_(it)).join('') + cerrarTabla();
  }
  if (faltantes.length) {
    html += '<p class="resumen-seccion-titulo terracota">Quedan pendientes</p>' + abrirTabla() + faltantes.map(it => filaResumenPauta_(it, true)).join('') + cerrarTabla();
  }
  document.getElementById('resumen-pauta-lista').innerHTML = html;

  const totalCompletados = completados.length;
  let texto = totalCompletados + ' completado' + (totalCompletados === 1 ? '' : 's');
  if (compAgregados.length) texto += ' (' + compAgregados.length + ' adicional' + (compAgregados.length === 1 ? '' : 'es') + ' al pedido)';
  texto += faltantes.length ? ', ' + faltantes.length + ' pendiente' + (faltantes.length === 1 ? '' : 's') + ' para la próxima.' : '.';
  document.getElementById('resumen-pauta-total').textContent = texto;
}

async function confirmarProduccion() {
  document.getElementById('resumen-pauta-error').textContent = '';
  const r = await llamarAPI('confirmarPauta', { data: { responsable: sesion.nombre, agregadosIds: pautaAgregadosSesion, observacion: pautaObservacionBorrador } });
  if (!r.ok) { document.getElementById('resumen-pauta-error').textContent = r.error || 'Error al confirmar producción'; return; }

  cachePauta = null; pautaOcultos = new Set(); pautaAgregadosSesion = []; pautaObservacionBorrador = '';
  document.getElementById('confirm-title').textContent = 'Producción confirmada';
  document.getElementById('confirm-msg').textContent = r.completados.length + ' producto' + (r.completados.length === 1 ? '' : 's') + ' completado' + (r.completados.length === 1 ? '' : 's') +
    (r.faltantes.length ? ', ' + r.faltantes.length + ' quedaron pendientes para la próxima.' : '.');
  document.getElementById('confirm-detalle').innerHTML = '';
  ocultarBotonOtro();
  irA('screen-confirm');
}

function cambiarTabPauta(tab) {
  document.getElementById('pauta-tab-btn-activa').classList.toggle('activo', tab === 'activa');
  document.getElementById('pauta-tab-btn-historial').classList.toggle('activo', tab === 'historial');
  document.getElementById('pauta-tab-activa').style.display = tab === 'activa' ? '' : 'none';
  document.getElementById('pauta-tab-historial').style.display = tab === 'historial' ? '' : 'none';
  if (tab === 'historial' && !cacheHistorialPauta.length) cargarHistorialPauta(true);
}

async function cargarHistorialPauta(reset) {
  if (reset) {
    cacheHistorialPauta = []; historialPautaOffset = 0;
    document.getElementById('historial-lista').innerHTML = skeletonCards(3);
    document.getElementById('historial-vermas').style.display = 'none';
  }
  const r = await llamarAPI('obtenerHistorialProduccion', { offset: historialPautaOffset });
  if (!r.ok) { document.getElementById('historial-lista').innerHTML = '<p class="error-msg">' + (r.error || 'Error al cargar el historial') + '</p>'; return; }
  cacheHistorialPauta = cacheHistorialPauta.concat(r.historial || []);
  historialPautaOffset += (r.historial || []).length;
  historialPautaHayMas = !!r.hayMas;
  pintarHistorialPauta();
}

function pintarHistorialPauta() {
  const cont = document.getElementById('historial-lista');
  const btnMas = document.getElementById('historial-vermas');
  if (!cacheHistorialPauta.length) {
    cont.innerHTML = '<p style="font-size:13.5px;color:var(--ink-soft);padding:24px 0;text-align:center;">Todavía no hay producción confirmada.</p>';
    btnMas.style.display = 'none';
    return;
  }
  const filaItem = (it) => '<div class="rowline"><span>' + it.producto + (it.agregado ? '<span class="tag-agregado">+ agregado</span>' : '') + '</span><b>x' + it.cantidad + '</b></div>';
  cont.innerHTML = cacheHistorialPauta.map((h, i) => {
    const idDet = 'hist-det-' + i;
    const total = h.completados.length + h.faltantes.length;
    const agregados = h.completados.filter(it => it.agregado).length + h.faltantes.filter(it => it.agregado).length;
    const detalle = (h.completados.length ? '<div class="hist-grupo-titulo ok">Completados</div>' + h.completados.map(filaItem).join('') : '') +
      (h.faltantes.length ? '<div class="hist-grupo-titulo pend">Pendiente</div>' + h.faltantes.map(filaItem).join('') : '');
    return '<div class="card-dia verde" onclick="var e=document.getElementById(\'' + idDet + '\');e.style.display=(e.style.display===\'block\'?\'none\':\'block\');">' +
      '<div class="c-top"><strong>' + h.fecha + (h.hora ? ', ' + h.hora : '') + '</strong><span class="badge-completado">' + h.completados.length + ' de ' + total + '</span></div>' +
      '<p class="hist-confirmado" style="color:var(--ink-soft);margin:2px 0 0;">Confirmado por ' + h.responsable + '</p>' +
      (h.observacion ? '<div class="hist-observacion"><p>Observación</p><p>' + h.observacion + '</p></div>' : '') +
      '<div class="hist-metricas">' +
        '<span class="m-ok">' + h.completados.length + ' completado' + (h.completados.length === 1 ? '' : 's') + '</span>' +
        (h.faltantes.length ? '<span class="m-pend">' + h.faltantes.length + ' pendiente' + (h.faltantes.length === 1 ? '' : 's') + '</span>' : '') +
        (agregados ? '<span class="m-agr">' + agregados + ' agregado' + (agregados === 1 ? '' : 's') + '</span>' : '') +
      '</div>' +
      '<div id="' + idDet + '" style="display:none;">' + detalle + '</div>' +
    '</div>';
  }).join('');
  btnMas.style.display = historialPautaHayMas ? '' : 'none';
}

let anchoDesktopAnterior_ = window.matchMedia('(min-width: 900px)').matches;
window.addEventListener('resize', () => {
  const esAnchoAhora = window.matchMedia('(min-width: 900px)').matches;
  if (esAnchoAhora === anchoDesktopAnterior_) return; // evita redibujar por el teclado móvil (solo cambia el alto, no cruza el breakpoint)
  anchoDesktopAnterior_ = esAnchoAhora;
  const activa = (id) => document.getElementById(id) && document.getElementById(id).classList.contains('active');
  if (activa('screen-conteo') && cacheConteoCatalogo) pintarConteo();
  if (activa('screen-revision')) {
    if (pedidoModo === 'conteo' && cacheRevision && cacheRevision.items && cacheRevision.items.length) pintarRevision();
    if (pedidoModo === 'cero' && cacheCatalogoCompleto) pintarCero();
  }
  if (activa('screen-pauta') && cachePauta) pintarPauta();
});
