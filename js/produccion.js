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

function pintarConteo() {
  const titulo = document.querySelector('#screen-conteo h2');
  const boton = document.querySelector('#screen-conteo .submit-bar button');

  if (esVeganCorner_()) {
    document.getElementById('conteo-chips').style.display = 'none';
    if (titulo) titulo.textContent = 'Stock congelado';
    if (boton) boton.textContent = 'Guardar stock';
    const productos = cacheConteoCatalogo.catalogo.filter(p => p.categoria === 'Empanadas Congeladas');
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

  if (esVeganCorner_()) {
    const productos = cacheConteoCatalogo.catalogo.filter(p => p.categoria === 'Empanadas Congeladas');
    if (!productos.length) { document.getElementById('conteo-error').textContent = 'No hay productos para guardar.'; return; }
    for (const p of productos) {
      const key = p.productoProduccion + '|' + p.categoria;
      const cantidad = conteoCantidades[key] !== undefined ? conteoCantidades[key] : 0;
      const r = await llamarAPI('actualizarStockCongeladoVC', { data: { producto: p.productoProduccion, stockActual: cantidad, responsable: sesion.nombre } });
      if (!r.ok) { document.getElementById('conteo-error').textContent = r.error || 'Error al guardar el stock'; return; }
    }
    conteoCantidades = {};
    document.getElementById('confirm-title').textContent = 'Stock actualizado';
    document.getElementById('confirm-msg').textContent = 'Se guardó tu stock congelado — Rocío lo va a ver en Revisión.';
    document.getElementById('confirm-detalle').innerHTML = '';
    ocultarBotonOtro();
    irA('screen-confirm');
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
  // Aviso corto a Rocío y Osmar, con botón directo a Revisión — el detalle completo se ve
  // al entrar, la notificación es solo un aviso de "hay algo nuevo que revisar".
  await llamarAPI('crearNotificacion', { para: ['Rocío Romo', 'Osmar Meza'], mensaje: JSON.stringify({ tipo: 'nuevoConteo', nombre: sesion.nombre }), accionNotif: 'abrirRevision' });
  irA('screen-confirm');
}

// ============ REVISIÓN Y ENVÍO ============
let cacheRevision = null;          // { ok, items:[...], conteoIds:[...] } — obtenerConteosPendientes()
let cacheCatalogoCompleto = null;  // catálogo completo (soloConteo:false), para "+ Agregar producto"
let revisionPedidos = {};          // productoProduccion -> cantidad a pedir
let revisionAgregados = [];        // [{productoProduccion, nombre, comentario}] agregados a mano, sin conteo previo
let revisionEliminados = new Set(); // productoProduccion quitados de la lista que vino del conteo (no se envían)
let revisionObservacion = '';      // observación general opcional para toda la orden

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
    revisionEliminados = new Set();
    revisionObservacion = '';
    const taObs = document.getElementById('revision-observacion');
    if (taObs) taObs.value = '';
  }
  pintarRevision();
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

function pintarRevision() {
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
        '<input type="number" min="0" placeholder="0" value="' + val + '" oninput="cambiarPedidoRevision(\'' + clave + '\',this.value)">' +
      '</div>' +
      '<p class="revision-detalle">' + badgesDetalleRevision_(it.detalle, it.stockCongeladoVC) + '</p>' +
    '</div>';
  });
  revisionAgregados.forEach((a, idx) => {
    const val = revisionPedidos[a.productoProduccion] !== undefined ? revisionPedidos[a.productoProduccion] : '';
    const clave = a.productoProduccion.replace(/'/g, "\\'");
    html += '<div class="revision-row">' +
      '<button class="revision-quitar" title="Quitar" onclick="quitarAgregadoRevision(' + idx + ')"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"></path><path d="M6 6l12 12"></path></svg></button>' +
      '<div class="revision-row-top">' +
        '<span>' + a.nombre + '</span>' +
        '<input type="number" min="0" placeholder="0" value="' + val + '" oninput="cambiarPedidoRevision(\'' + clave + '\',this.value)">' +
      '</div>' +
      '<p class="revision-detalle">Agregado manualmente</p>' +
      '<input type="text" placeholder="Comentario (ej: para cumpleaños del sábado)" value="' + (a.comentario || '').replace(/"/g, '&quot;') + '" oninput="cambiarComentarioAgregado(' + idx + ',this.value)" style="width:100%;font-size:12.5px;height:32px;margin-top:6px;">' +
    '</div>';
  });
  cont.innerHTML = html;
}

function quitarProductoRevision(clave) {
  revisionEliminados.add(clave);
  delete revisionPedidos[clave];
  pintarRevision();
}
function quitarAgregadoRevision(idx) {
  const clave = revisionAgregados[idx].productoProduccion;
  delete revisionPedidos[clave];
  revisionAgregados.splice(idx, 1);
  pintarRevision();
}
function cambiarComentarioAgregado(idx, val) {
  revisionAgregados[idx].comentario = val;
}
function cambiarObservacionRevision(val) {
  revisionObservacion = val;
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
    if (revisionEliminados.has(it.productoProduccion)) return;
    const cant = revisionPedidos[it.productoProduccion];
    if (cant > 0) items.push({ productoProduccion: it.productoProduccion, cantidadProgramada: cant, cantidadContada: it.contadoTotal });
  });
  revisionAgregados.forEach(a => {
    const cant = revisionPedidos[a.productoProduccion];
    if (cant > 0) items.push({ productoProduccion: a.productoProduccion, cantidadProgramada: cant, comentario: a.comentario || '' });
  });
  if (!items.length) {
    document.getElementById('revision-error').textContent = 'Escribe una cantidad a pedir en al menos un producto.';
    return;
  }

  const r = await llamarAPI('enviarProgramacionProduccion', {
    data: { responsable: sesion.nombre, conteoIds: cacheRevision.conteoIds, items }
  });
  if (!r.ok) { document.getElementById('revision-error').textContent = r.error || 'Error al enviar el pedido'; return; }

  // Notificación liviana a Rosa y Katherine — mensaje corto (el resumen completo lo ve el
  // que envió en la pantalla de confirmación); no es pantalla propia, es parte de enviar.
  const resumen = items.map(it => it.productoProduccion + ' x' + it.cantidadProgramada).join(', ');
  const mensajeNotif = JSON.stringify({ tipo: 'pedidoProduccion', nombre: sesion.nombre, observacion: revisionObservacion || '' });
  await llamarAPI('crearNotificacion', { para: ['Rosa Merino', 'Katherine Bustamante'], mensaje: mensajeNotif, accionNotif: 'abrirPauta' });

  cacheRevision = null; revisionPedidos = {}; revisionAgregados = []; revisionEliminados = new Set(); revisionObservacion = '';
  document.getElementById('confirm-title').textContent = 'Pedido enviado';
  document.getElementById('confirm-msg').textContent = 'Se avisó a Rosa y Katherine.';
  document.getElementById('confirm-detalle').innerHTML = items.map(it =>
    '<div class="check-row" style="background:var(--surface);border:1px solid var(--border);"><span>' + it.productoProduccion + '</span><strong>x' + it.cantidadProgramada + '</strong></div>'
  ).join('');
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
let cacheCatalogoPauta = null;      // catálogo completo, para "+ Agregar producto"

async function abrirPauta(forzar) {
  irA('screen-pauta');
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

function pintarPauta() {
  const cont = document.getElementById('pauta-lista');
  const visibles = cachePauta.pauta.filter(it => !pautaOcultos.has(it.id));
  const planificados = visibles.filter(it => pautaAgregadosSesion.indexOf(it.id) === -1);
  const agregados = visibles.filter(it => pautaAgregadosSesion.indexOf(it.id) !== -1);

  if (!visibles.length) {
    cont.innerHTML = '<p style="font-size:13.5px;color:var(--ink-soft);padding:24px 0;text-align:center;">No hay pedidos pendientes en la pauta.</p>';
    return;
  }

  const filaHtml = (it) => {
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

async function toggleHechoPauta(id) {
  const it = cachePauta.pauta.find(x => x.id === id);
  if (!it) return;
  it.estadoBorrador = it.estadoBorrador === 'Hecho' ? '' : 'Hecho';
  pintarPauta();
  await llamarAPI('actualizarBorradorPauta', { data: { id: id, estadoBorrador: it.estadoBorrador, cantidadBorrador: it.cantidadBorrador } });
}

async function cambiarCantidadBorradorPauta(id, val) {
  const it = cachePauta.pauta.find(x => x.id === id);
  if (!it) return;
  it.cantidadBorrador = Math.max(0, Number(val) || 0);
  await llamarAPI('actualizarBorradorPauta', { data: { id: id, estadoBorrador: it.estadoBorrador, cantidadBorrador: it.cantidadBorrador } });
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

async function confirmarProduccion() {
  document.getElementById('pauta-error').textContent = '';
  const r = await llamarAPI('confirmarPauta', { data: { responsable: sesion.nombre, agregadosIds: pautaAgregadosSesion } });
  if (!r.ok) { document.getElementById('pauta-error').textContent = r.error || 'Error al confirmar producción'; return; }

  cachePauta = null; pautaOcultos = new Set(); pautaAgregadosSesion = [];
  document.getElementById('confirm-title').textContent = 'Producción confirmada';
  document.getElementById('confirm-msg').textContent = r.completados.length + ' producto' + (r.completados.length === 1 ? '' : 's') + ' completado' + (r.completados.length === 1 ? '' : 's') +
    (r.faltantes.length ? ', ' + r.faltantes.length + ' quedaron pendientes para la próxima.' : '.');
  document.getElementById('confirm-detalle').innerHTML = r.completados.map(it =>
    '<div class="check-row" style="background:var(--surface);border:1px solid var(--border);"><span>' + it.producto + '</span><strong>x' + it.cantidad + '</strong></div>'
  ).join('');
  ocultarBotonOtro();
  irA('screen-confirm');
}
