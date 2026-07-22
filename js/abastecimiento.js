/**
 * js/abastecimiento.js — módulo Abastecimiento (20/07/2026).
 * Reemplaza el pedido de mercadería/insumos/MP/aseo por WhatsApp o pizarra, y las
 * pantallas viejas "Inventario MP"/"Lista de compra MP" (quedan sin usar en index.html,
 * no se borraron).
 *
 * DOS pantallas:
 * - Lista de compra (screen-abastecimiento): UNA sola pantalla que se adapta según
 *   GestionarCompras — mismo criterio que la Pauta activa en modo solo-lectura vs
 *   interactivo.
 * - Solicitar (screen-abastecimiento-solicitar): chips de 2 niveles (Categoría →
 *   Subcategoría) sobre el catálogo combinado. Sin cambios en esta entrega.
 *
 * REDISEÑO 22/07/2026 (con Osmar). La pantalla anterior agrupaba solo por proveedor.
 * Eso funcionaba mirando Vegan Corner (9 ítems, todos con proveedor) y colapsaba en
 * Cima (43 ítems, 41 sin proveedor): dejaba de ser una agrupación y era un bloque
 * corrido de 41 nombres. Cambios:
 *
 * 1. Filtro por negocio. Dejó de ser opcional cuando Rocío entró a GestionarCompras:
 *    sin él abre y ve los dos negocios mezclados.
 * 2. Agrupación conmutable, categoría o proveedor. No es preferencia estética, son dos
 *    trabajos distintos: por categoría se revisa criterio ("estas 6 vitaminas no van"),
 *    por proveedor se sale a comprar ("esto llevo de La Vega").
 * 3. Grupos plegables con contador, y el checkbox del encabezado marca el grupo entero.
 * 4. Asignar proveedor desde la fila. actualizarProveedorItemCompra existía en el
 *    backend, estaba en el router y NADIE la llamaba: el balde de "sin proveedor" no
 *    podía achicarse nunca. Cada asignación se guarda en el catálogo de origen, así que
 *    se pregunta una sola vez por producto.
 * 5. Descartar, separado de comprar. Antes la única salida era marcarItemsComprados, que
 *    escribe en HistorialCompras como compra hecha: sacar algo que no se iba a comprar
 *    obligaba a registrar una compra falsa.
 * 6. Deslizar la fila: a la izquierda descarta, a la derecha marca comprado. El gesto
 *    ABRE el panel, no ejecuta — hay que tocar el botón. Con 43 ítems y scroll vertical,
 *    un gesto que borra al instante borra cosas sin querer, y no hay "deshacer" en el
 *    sistema.
 * 7. El staff dejó de tener una lista plana de solo lectura: ve las mismas categorías y
 *    puede quitar lo que él mismo pidió (mismo criterio que la Pauta con Rosa/Katherine).
 *
 * OJO — la selección vive en abastSeleccion (Set), NO en los checkboxes del DOM. Con
 * grupos plegables el DOM se redibuja y un ítem marcado dentro de un grupo cerrado
 * dejaría de existir como nodo: leer `.abast-check:checked` perdería la selección en
 * silencio, que es justo el tipo de fallo que no se ve hasta que borra datos.
 */

let cacheAbastCatalogo = null;      // { ok, catalogo:[{nombre, categoria, subcategoria, unidad}] }
let cachePendientesNegocio = null;  // Set de nombres ya pendientes en el negocio de la sesión
let abastCategoriaActiva = null;
let abastSubcategoriaActiva = null;
let abastSeleccionados = new Set(); // nombres marcados para enviar en este pedido (Solicitar)
let abastNegocioElegido = null;     // solo se usa cuando sesion.negocio === 'Ambos' (Osmar)

// ---- estado de la Lista de compra ----
let abastItems = [];                     // ítems crudos del servidor (admin o staff)
let abastSeleccion = new Set();          // ids seleccionados (admin)
let abastFiltroNegocio = 'Todos';        // 'Todos' | 'Cima' | 'Vegan Corner'
let abastAgruparPor = 'categoria';       // 'categoria' | 'proveedor'
let abastGruposCerrados = new Set();     // claves de grupo plegadas
let abastProveedores = null;             // cache de listarProveedores
const ABAST_ANCHO_ACCION = 92;           // ancho del panel que revela el deslizar, en px

function esAdminCompras_() { return tienePermisoLocal('GestionarCompras'); }

// BUGFIX 21/07/2026 (con Osmar): el valor real de sesion.negocio NO es 'Cima' — es
// 'Cima Eco-Granel' (Rocío, Lucas, Cecilia) o 'Ambos' (Osmar, admin de los dos negocios).
// El backend de Abastecimiento espera literalmente 'Cima' o 'Vegan Corner' (mismo
// criterio simple que ya usa CatalogoCima), así que acá se traduce. Para 'Ambos', no hay
// negocio único posible — se le pide elegir con abastNegocioElegido (ver pintarSolicitar).
function negocioActualAbast_() {
  if (sesion.negocio === 'Cima Eco-Granel') return 'Cima';
  if (sesion.negocio === 'Vegan Corner') return 'Vegan Corner';
  return abastNegocioElegido; // 'Ambos' — null hasta que elija
}

function escAbast_(t) { return String(t === undefined || t === null ? '' : t).replace(/'/g, "\\'"); }

// ============ LISTA DE COMPRA (adaptiva) ============

async function abrirAbastecimiento(forzar) {
  irA('screen-abastecimiento');
  const btnSolicitar = document.getElementById('btn-abast-solicitar');
  if (btnSolicitar) btnSolicitar.style.display = tienePermisoLocal('RegistrarAbastecimiento') ? '' : 'none';
  document.getElementById('abast-lista').innerHTML = skeletonCards(3);
  document.getElementById('abast-error').textContent = '';

  if (esAdminCompras_()) {
    document.getElementById('abast-subtitulo').textContent = 'Todo lo pendiente en los dos negocios.';
    const r = await llamarAPI('obtenerListaCompraAdmin', {});
    if (!document.getElementById('screen-abastecimiento').classList.contains('active')) return;
    if (!r || !r.ok) {
      document.getElementById('abast-lista').innerHTML = '<p class="error-msg">' + ((r && r.error) || 'No se pudo cargar la lista de compra') + '</p>';
      return;
    }
    abastItems = r.items || [];
    abastSeleccion.forEach(id => { if (!abastItems.some(it => it.id === id)) abastSeleccion.delete(id); });
    pintarAbastecimientoAdmin();
  } else {
    const negocio = negocioActualAbast_();
    // Sin negocio no se puede consultar: buscarFilaNegocio_ crearía una fila basura
    // ("ABAST-NULL") en PedidosAbastecimiento. Pasa solo si alguien queda con negocio
    // 'Ambos' sin GestionarCompras, que hoy no ocurre, pero la fila quedaría para siempre.
    if (!negocio) {
      document.getElementById('abast-subtitulo').textContent = '';
      document.getElementById('abast-lista').innerHTML = '<p class="error-msg">Tu usuario no tiene un negocio asignado para esta pantalla. Avísale a Osmar.</p>';
      document.getElementById('abast-leyenda').style.display = 'none';
      document.getElementById('abast-submit-bar').style.display = 'none';
      return;
    }
    document.getElementById('abast-subtitulo').textContent = 'Pendiente en ' + negocio + '.';
    const r = await llamarAPI('obtenerListaCompraStaff', { negocio: negocio, solicitante: sesion.nombre });
    if (!document.getElementById('screen-abastecimiento').classList.contains('active')) return;
    if (!r || !r.ok) {
      document.getElementById('abast-lista').innerHTML = '<p class="error-msg">' + ((r && r.error) || 'No se pudo cargar la lista') + '</p>';
      return;
    }
    abastItems = r.pendientes || [];
    pintarAbastecimientoStaff();
  }
}

// ---- controles (solo admin): filtro de negocio + agrupación ----

function pintarControlesAbast_() {
  const cont = document.getElementById('abast-leyenda');
  const total = abastItems.length;
  const nCima = abastItems.filter(it => it.negocio === 'Cima').length;
  const nVC = abastItems.filter(it => it.negocio === 'Vegan Corner').length;

  const filtro = (valor, etiqueta, n) => {
    const activo = abastFiltroNegocio === valor;
    return '<button type="button" class="abast-filtro' + (activo ? ' activo' : '') + '" onclick="cambiarFiltroNegocioAbast(\'' + valor + '\')">' +
      etiqueta + ' <span class="abast-filtro-n">' + n + '</span></button>';
  };
  const agrupar = (valor, etiqueta) => {
    const activo = abastAgruparPor === valor;
    return '<button type="button" class="abast-agrupar' + (activo ? ' activo' : '') + '" onclick="cambiarAgruparAbast(\'' + valor + '\')">' + etiqueta + '</button>';
  };

  cont.style.display = 'block';
  cont.innerHTML =
    '<div class="abast-filtros">' + filtro('Todos', 'Todos', total) + filtro('Cima', 'Cima', nCima) + filtro('Vegan Corner', 'Vegan', nVC) + '</div>' +
    '<div class="abast-agrupar-fila">' +
      '<span class="abast-agrupar-label">Agrupar por</span>' + agrupar('categoria', 'Categoría') + agrupar('proveedor', 'Proveedor') +
    '</div>';
}

function cambiarFiltroNegocioAbast(valor) {
  abastFiltroNegocio = valor;
  abastGruposCerrados = new Set();
  pintarAbastecimientoAdmin();
}

function cambiarAgruparAbast(valor) {
  if (abastAgruparPor === valor) return;
  abastAgruparPor = valor;
  abastGruposCerrados = new Set();
  pintarAbastecimientoAdmin();
}

function toggleGrupoAbast(clave) {
  if (abastGruposCerrados.has(clave)) abastGruposCerrados.delete(clave); else abastGruposCerrados.add(clave);
  if (esAdminCompras_()) pintarAbastecimientoAdmin(); else pintarAbastecimientoStaff();
}

// Agrupa respetando el orden de aparición. "Sin proveedor asignado" siempre al final:
// es el balde de lo que todavía no está clasificado, no un proveedor más.
function agruparItemsAbast_(items, porCampo) {
  const grupos = {}; const orden = [];
  items.forEach(it => {
    let clave;
    if (porCampo === 'proveedor') clave = it.proveedor || 'Sin proveedor asignado';
    else clave = it.categoria || 'Otros';
    if (!grupos[clave]) { grupos[clave] = []; orden.push(clave); }
    grupos[clave].push(it);
  });
  orden.sort((a, b) => (a === 'Sin proveedor asignado') - (b === 'Sin proveedor asignado'));
  return { grupos: grupos, orden: orden };
}

// Título de grupo en formato frase: las categorías vienen del catálogo en mayúsculas
// ("VITAMINAS Y SUPLEMENTOS") y en pantalla gritan. Los proveedores se dejan tal cual,
// son nombres propios.
function tituloGrupoAbast_(clave) {
  if (abastAgruparPor === 'proveedor') return clave;
  const t = String(clave).trim();
  if (t !== t.toUpperCase()) return t;
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

function pintarAbastecimientoAdmin() {
  pintarControlesAbast_();
  const cont = document.getElementById('abast-lista');
  const visibles = abastFiltroNegocio === 'Todos' ? abastItems : abastItems.filter(it => it.negocio === abastFiltroNegocio);

  if (!visibles.length) {
    cont.innerHTML = '<p style="font-size:13.5px;color:var(--ink-soft);padding:24px 0;text-align:center;">No hay nada pendiente por ahora.</p>';
    pintarBarraAbast_();
    return;
  }

  const g = agruparItemsAbast_(visibles, abastAgruparPor);
  let html = '';
  g.orden.forEach(clave => {
    const items = g.grupos[clave];
    const cerrado = abastGruposCerrados.has(clave);
    const todos = items.every(it => abastSeleccion.has(it.id));
    const claveEsc = escAbast_(clave);

    html += '<div class="abast-grupo-cab">' +
      '<input type="checkbox" class="abast-check" ' + (todos ? 'checked' : '') + ' onclick="toggleGrupoCompletoAbast(\'' + claveEsc + '\',this.checked)" aria-label="Seleccionar grupo">' +
      '<button type="button" class="abast-grupo-btn" onclick="toggleGrupoAbast(\'' + claveEsc + '\')">' +
        '<span class="abast-grupo-titulo">' + tituloGrupoAbast_(clave) + '</span>' +
        '<span class="abast-grupo-n">' + items.length + '</span>' +
        '<span class="abast-grupo-flecha">' + (cerrado ? '›' : '⌄') + '</span>' +
      '</button>' +
    '</div>';

    if (cerrado) return;
    items.forEach(it => { html += filaAdminAbast_(it); });
  });

  cont.innerHTML = html;
  engancharDeslizarAbast_(cont);
  pintarBarraAbast_();
}

function filaAdminAbast_(it) {
  const idEsc = escAbast_(it.id);
  const marcado = abastSeleccion.has(it.id);
  const punto = it.negocio === 'Vegan Corner' ? 'var(--terracotta)' : 'var(--forest)';
  const cant = (it.cantidad === null || it.cantidad === undefined) ? '' : it.cantidad;
  const prov = it.proveedor
    ? '<span class="abast-chip-prov" onclick="abrirProveedorItemAbast(\'' + idEsc + '\')">' + it.proveedor + '</span>'
    : '<span class="abast-chip-prov vacio" onclick="abrirProveedorItemAbast(\'' + idEsc + '\')">asignar proveedor</span>';

  return '<div class="abast-swipe" data-id="' + it.id + '" data-izq="1" data-der="1">' +
    '<div class="abast-swipe-accion izq"><span>Comprado</span></div>' +
    '<div class="abast-swipe-accion der"><span>Descartar</span></div>' +
    '<div class="abast-swipe-cara">' +
      '<div class="abast-fila-top">' +
        '<input type="checkbox" class="abast-check" ' + (marcado ? 'checked' : '') + ' onclick="toggleItemAbast(\'' + idEsc + '\',this.checked)" aria-label="Seleccionar">' +
        '<span class="abast-punto" style="background:' + punto + ';" aria-hidden="true"></span>' +
        '<span class="abast-nombre">' + it.producto + '</span>' +
        '<input type="number" min="0" class="abast-cant" value="' + cant + '" onchange="cambiarCantidadItemCompra(\'' + idEsc + '\',this.value)" aria-label="Cantidad">' +
        '<span class="abast-unidad">' + (it.unidad || '') + '</span>' +
      '</div>' +
      '<div class="abast-fila-meta">' +
        '<span class="abast-quien">' + (String(it.responsable || '').split(' ')[0] || '—') + '</span>' + prov +
      '</div>' +
    '</div>' +
  '</div>';
}

function toggleItemAbast(id, marcado) {
  if (marcado) abastSeleccion.add(id); else abastSeleccion.delete(id);
  pintarBarraAbast_();
  sincronizarCabecerasAbast_();
}

function toggleGrupoCompletoAbast(clave, marcado) {
  const visibles = abastFiltroNegocio === 'Todos' ? abastItems : abastItems.filter(it => it.negocio === abastFiltroNegocio);
  const g = agruparItemsAbast_(visibles, abastAgruparPor);
  (g.grupos[clave] || []).forEach(it => { if (marcado) abastSeleccion.add(it.id); else abastSeleccion.delete(it.id); });
  pintarAbastecimientoAdmin();
}

// Cuando se marca un ítem suelto, el checkbox de su grupo tiene que reflejar si el grupo
// quedó completo. Se actualiza solo ese checkbox en vez de repintar toda la lista, para
// no cerrar los grupos abiertos ni perder el foco.
function sincronizarCabecerasAbast_() {
  const visibles = abastFiltroNegocio === 'Todos' ? abastItems : abastItems.filter(it => it.negocio === abastFiltroNegocio);
  const g = agruparItemsAbast_(visibles, abastAgruparPor);
  const cabs = document.querySelectorAll('#abast-lista .abast-grupo-cab');
  g.orden.forEach((clave, i) => {
    const cab = cabs[i];
    if (!cab) return;
    const chk = cab.querySelector('.abast-check');
    if (chk) chk.checked = g.grupos[clave].every(it => abastSeleccion.has(it.id));
  });
}

function pintarBarraAbast_() {
  const barra = document.getElementById('abast-submit-bar');
  if (!esAdminCompras_()) { barra.style.display = 'none'; return; }
  const n = abastSeleccion.size;
  barra.style.display = '';
  barra.innerHTML =
    '<div class="abast-barra">' +
      '<button type="button" class="btn-descartar-abast" ' + (n ? '' : 'disabled') + ' onclick="abrirDescartarAbast()">Descartar' + (n ? ' (' + n + ')' : '') + '</button>' +
      '<button type="button" class="btn-primary" ' + (n ? '' : 'disabled') + ' onclick="confirmarItemsComprados()">Comprado' + (n ? ' (' + n + ')' : '') + '</button>' +
    '</div>';
}

// ---- vista del staff ----

function pintarAbastecimientoStaff() {
  document.getElementById('abast-leyenda').style.display = 'none';
  document.getElementById('abast-submit-bar').style.display = 'none';
  const cont = document.getElementById('abast-lista');

  if (!abastItems.length) {
    cont.innerHTML = '<p style="font-size:13.5px;color:var(--ink-soft);padding:24px 0;text-align:center;">No hay nada pendiente por ahora.</p>';
    return;
  }

  const g = agruparItemsAbast_(abastItems, 'categoria');
  let html = '';
  g.orden.forEach(clave => {
    const items = g.grupos[clave];
    const cerrado = abastGruposCerrados.has(clave);
    const claveEsc = escAbast_(clave);
    html += '<div class="abast-grupo-cab">' +
      '<button type="button" class="abast-grupo-btn" onclick="toggleGrupoAbast(\'' + claveEsc + '\')">' +
        '<span class="abast-grupo-titulo">' + tituloGrupoAbast_(clave) + '</span>' +
        '<span class="abast-grupo-n">' + items.length + '</span>' +
        '<span class="abast-grupo-flecha">' + (cerrado ? '›' : '⌄') + '</span>' +
      '</button>' +
    '</div>';
    if (cerrado) return;
    items.forEach(it => { html += filaStaffAbast_(it); });
  });

  cont.innerHTML = html;
  engancharDeslizarAbast_(cont);
}

// Lo propio se puede quitar deslizando; lo de otras personas solo se ve, atenuado. El
// servidor valida igual contra el responsable guardado en el ítem — que no se dibuje el
// panel es ayuda, no la barrera.
function filaStaffAbast_(it) {
  const idEsc = escAbast_(it.id);
  const quien = it.propio ? 'lo pediste tú' : (String(it.responsable || '').split(' ')[0] || '—');
  const meta = '<p class="abast-staff-meta">' + quien + (it.fecha ? ' · ' + it.fecha : '') + '</p>';

  if (!it.propio) {
    return '<div class="abast-fila-staff ajena">' +
      '<div><span class="abast-nombre">' + it.nombre + '</span>' + meta + '</div>' +
    '</div>';
  }
  return '<div class="abast-swipe" data-id="' + it.id + '" data-der="1">' +
    '<div class="abast-swipe-accion der"><span>Quitar</span></div>' +
    '<div class="abast-swipe-cara">' +
      '<div class="abast-fila-staff">' +
        '<div><span class="abast-nombre">' + it.nombre + '</span>' + meta + '</div>' +
        '<span class="abast-pista" aria-hidden="true">‹</span>' +
      '</div>' +
    '</div>' +
  '</div>';
}

// ---- deslizar ----

function cerrarDeslizadosAbast_(excepto) {
  document.querySelectorAll('.abast-swipe.abierta-izq, .abast-swipe.abierta-der').forEach(el => {
    if (el !== excepto) el.classList.remove('abierta-izq', 'abierta-der');
  });
}

// El gesto ABRE el panel; ejecutar es tocar el botón revelado. Se decide el eje en el
// primer movimiento y no se cambia: si la persona empezó a scrollear vertical, la fila no
// se mueve más en toda la pasada. Sin esto, un scroll con el pulgar en diagonal abre
// filas al azar mientras se recorren 43 ítems.
function engancharDeslizarAbast_(cont) {
  cont.querySelectorAll('.abast-swipe').forEach(fila => {
    const cara = fila.querySelector('.abast-swipe-cara');
    const permiteIzq = fila.dataset.izq === '1';
    const permiteDer = fila.dataset.der === '1';
    let x0 = 0, y0 = 0, eje = null, dx = 0;

    fila.addEventListener('touchstart', e => {
      x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; eje = null; dx = 0;
      cara.style.transition = 'none';
    }, { passive: true });

    fila.addEventListener('touchmove', e => {
      const ax = e.touches[0].clientX - x0;
      const ay = e.touches[0].clientY - y0;
      if (eje === null) {
        if (Math.abs(ax) < 12 && Math.abs(ay) < 12) return;
        eje = Math.abs(ax) > Math.abs(ay) ? 'x' : 'y';
        if (eje === 'x') cerrarDeslizadosAbast_(fila);
      }
      if (eje !== 'x') return;
      dx = ax;
      if (dx > 0 && !permiteIzq) dx = 0;
      if (dx < 0 && !permiteDer) dx = 0;
      dx = Math.max(-ABAST_ANCHO_ACCION, Math.min(ABAST_ANCHO_ACCION, dx));
      cara.style.transform = 'translateX(' + dx + 'px)';
    }, { passive: true });

    fila.addEventListener('touchend', () => {
      cara.style.transition = '';
      cara.style.transform = '';
      if (eje !== 'x') return;
      fila.classList.remove('abierta-izq', 'abierta-der');
      if (dx <= -40 && permiteDer) fila.classList.add('abierta-der');
      else if (dx >= 40 && permiteIzq) fila.classList.add('abierta-izq');
    });

    const accIzq = fila.querySelector('.abast-swipe-accion.izq');
    const accDer = fila.querySelector('.abast-swipe-accion.der');
    if (accIzq) accIzq.addEventListener('click', () => ejecutarDeslizadoAbast_(fila, 'comprado'));
    if (accDer) accDer.addEventListener('click', () => ejecutarDeslizadoAbast_(fila, 'descartar'));
  });
}

async function ejecutarDeslizadoAbast_(fila, accion) {
  const id = fila.dataset.id;
  fila.classList.remove('abierta-izq', 'abierta-der');
  const err = document.getElementById('abast-error');
  err.textContent = '';

  let r;
  if (!esAdminCompras_()) {
    r = await llamarAPI('quitarItemPropioAbastecimiento', { data: { id: id, responsable: sesion.nombre } });
  } else if (accion === 'comprado') {
    r = await llamarAPI('marcarItemsComprados', { data: { ids: [id], responsable: sesion.nombre } });
  } else {
    r = await llamarAPI('descartarItemsAbastecimiento', { data: { ids: [id], responsable: sesion.nombre, motivo: '' } });
  }

  if (!r || !r.ok) { err.textContent = (r && r.error) || 'No se pudo completar la acción'; return; }
  abastSeleccion.delete(id);
  abrirAbastecimiento(true);
}

// ---- acciones en lote ----

async function cambiarCantidadItemCompra(id, val) {
  await llamarAPI('actualizarCantidadItemCompra', { data: { id: id, cantidad: val } });
  const it = abastItems.find(x => x.id === id);
  if (it) it.cantidad = val === '' ? null : Number(val);
}

async function confirmarItemsComprados() {
  const err = document.getElementById('abast-error');
  err.textContent = '';
  const ids = [...abastSeleccion];
  if (!ids.length) { err.textContent = 'Selecciona al menos un ítem.'; return; }
  const r = await llamarAPI('marcarItemsComprados', { data: { ids: ids, responsable: sesion.nombre } });
  if (!r || !r.ok) { err.textContent = (r && r.error) || 'Error al marcar comprados'; return; }
  abastSeleccion = new Set();
  abrirAbastecimiento(true);
}

// El motivo es opcional a propósito: obligarlo es fricción en la acción que más se va a
// repetir. Si se escribe, se le avisa a quien pidió cada producto; si no, el descarte
// igual queda en HistorialCompras como 'Descartado' con quién y cuándo.
function abrirDescartarAbast() {
  const n = abastSeleccion.size;
  if (!n) return;
  abrirModal(
    '<h3 style="font-size:15px;margin:0 0 8px;">Descartar ' + n + ' producto' + (n === 1 ? '' : 's') + '</h3>' +
    '<p style="font-size:12.5px;color:var(--ink-soft);margin:0 0 12px;line-height:1.5;">Salen de la lista sin registrarse como compra. Queda el registro de quién los sacó.</p>' +
    '<label style="font-size:11.5px;color:var(--ink-soft);display:block;margin-bottom:5px;">Motivo (opcional)</label>' +
    '<input type="text" id="abast-desc-motivo" placeholder="Ej: no corresponde al criterio de la tienda">' +
    '<p style="font-size:11px;color:var(--ink-soft);margin:6px 0 0;line-height:1.45;">Si escribes un motivo, se le avisa a quien pidió cada producto.</p>' +
    '<div class="error-msg" id="abast-desc-error"></div>' +
    '<div style="display:flex;gap:8px;margin-top:14px;">' +
      '<button class="btn-secondary" style="flex:1;" onclick="cerrarModal()">Cancelar</button>' +
      '<button class="btn-primary" style="flex:1;background:var(--terracotta);" onclick="confirmarDescartarAbast()">Descartar</button>' +
    '</div>'
  );
}

async function confirmarDescartarAbast() {
  const motivo = document.getElementById('abast-desc-motivo').value;
  const r = await llamarAPI('descartarItemsAbastecimiento', {
    data: { ids: [...abastSeleccion], responsable: sesion.nombre, motivo: motivo }
  });
  if (!r || !r.ok) { document.getElementById('abast-desc-error').textContent = (r && r.error) || 'Error al descartar'; return; }
  cerrarModal();
  abastSeleccion = new Set();
  abrirAbastecimiento(true);
}

// ---- asignar proveedor ----
// Conecta actualizarProveedorItemCompra, que ya existía y nadie llamaba. Guarda además
// el proveedor habitual en el catálogo de origen, así que este diálogo se abre una vez
// por producto y no vuelve a aparecer.

async function abrirProveedorItemAbast(id) {
  const it = abastItems.find(x => x.id === id);
  if (!it) return;
  if (!abastProveedores) {
    const r = await llamarAPI('listarProveedores', {});
    if (!r || !r.ok) { document.getElementById('abast-error').textContent = (r && r.error) || 'No se pudieron cargar los proveedores'; return; }
    abastProveedores = r.proveedores || [];
  }
  const opciones = ['<option value="">— sin proveedor —</option>'].concat(
    abastProveedores.map(p => '<option value="' + p.nombre + '"' + (p.nombre === it.proveedor ? ' selected' : '') + '>' + (p.alias || p.nombre) + '</option>')
  ).join('');

  abrirModal(
    '<h3 style="font-size:15px;margin:0 0 4px;">Proveedor</h3>' +
    '<p style="font-size:12.5px;color:var(--ink-soft);margin:0 0 12px;">' + it.producto + '</p>' +
    '<select id="abast-prov-sel">' + opciones + '</select>' +
    '<p style="font-size:11px;color:var(--ink-soft);margin:8px 0 0;line-height:1.45;">Queda guardado en el catálogo: la próxima vez que se pida este producto ya viene con su proveedor.</p>' +
    '<div class="error-msg" id="abast-prov-error"></div>' +
    '<div style="display:flex;gap:8px;margin-top:14px;">' +
      '<button class="btn-secondary" style="flex:1;" onclick="cerrarModal()">Cancelar</button>' +
      '<button class="btn-primary" style="flex:1;" onclick="guardarProveedorItemAbast(\'' + escAbast_(id) + '\')">Guardar</button>' +
    '</div>'
  );
}

async function guardarProveedorItemAbast(id) {
  const proveedor = document.getElementById('abast-prov-sel').value;
  const r = await llamarAPI('actualizarProveedorItemCompra', { data: { id: id, proveedor: proveedor } });
  if (!r || !r.ok) { document.getElementById('abast-prov-error').textContent = (r && r.error) || 'Error al guardar el proveedor'; return; }
  cerrarModal();
  const it = abastItems.find(x => x.id === id);
  if (it) it.proveedor = proveedor;
  pintarAbastecimientoAdmin();
}

// ============ SOLICITAR ============

async function abrirSolicitar() {
  document.getElementById('abast-solicitar-error').textContent = '';
  abastSeleccionados = new Set();

  // Osmar (sesion.negocio === 'Ambos') no tiene un negocio único — hay que preguntarle
  // para cuál de los dos está solicitando antes de poder cargar catálogo o guardar nada.
  if (sesion.negocio === 'Ambos' && !abastNegocioElegido) {
    document.getElementById('abast-chips-cat').innerHTML = '';
    document.getElementById('abast-chips-subcat').innerHTML = '';
    document.getElementById('abast-lista-solicitar').innerHTML =
      '<p style="font-size:13.5px;color:var(--ink-soft);padding:12px 0 8px;text-align:center;">¿Para cuál negocio es?</p>' +
      '<div style="display:flex;gap:10px;padding:8px 0 24px;">' +
        '<button class="btn-secondary" style="flex:1;" onclick="elegirNegocioAbast_(\'Cima\')">Cima</button>' +
        '<button class="btn-secondary" style="flex:1;" onclick="elegirNegocioAbast_(\'Vegan Corner\')">Vegan Corner</button>' +
      '</div>';
    return;
  }

  const negocio = negocioActualAbast_();
  document.getElementById('abast-chips-cat').innerHTML = skeletonCards(1);
  document.getElementById('abast-lista-solicitar').innerHTML = skeletonCards(3);

  const [rCat, rPend] = await Promise.all([
    llamarAPI('obtenerCatalogoAbastecimiento', { negocio: negocio }),
    llamarAPI('obtenerListaCompraStaff', { negocio: negocio, solicitante: sesion.nombre })
  ]);
  if (!rCat.ok) {
    document.getElementById('abast-lista-solicitar').innerHTML = '<p class="error-msg">' + (rCat.error || 'Error al cargar el catálogo') + '</p>';
    return;
  }
  cacheAbastCatalogo = rCat;
  cachePendientesNegocio = new Set((rPend.pendientes || []).map(p => p.nombre));
  abastCategoriaActiva = null;
  abastSubcategoriaActiva = null;
  pintarSolicitar();
}

function elegirNegocioAbast_(negocio) {
  abastNegocioElegido = negocio;
  abrirSolicitar();
}

function pintarSolicitar() {
  const categorias = [...new Set(cacheAbastCatalogo.catalogo.map(p => p.categoria))];
  document.getElementById('abast-chips-cat').innerHTML = categorias.map(c => {
    const activo = c === abastCategoriaActiva;
    return '<span class="chip-cat' + (activo ? ' activo' : '') + '" onclick="toggleCategoriaAbast(\'' + c.replace(/'/g, "\\'") + '\')">' + c + '</span>';
  }).join('');

  if (!abastCategoriaActiva) {
    document.getElementById('abast-chips-subcat').innerHTML = '';
    document.getElementById('abast-lista-solicitar').innerHTML = '<p style="font-size:13.5px;color:var(--ink-soft);padding:24px 0;text-align:center;">Elige una categoría.</p>';
    return;
  }

  const productosCategoria = cacheAbastCatalogo.catalogo.filter(p => p.categoria === abastCategoriaActiva);
  const subcategorias = [...new Set(productosCategoria.map(p => p.subcategoria).filter(s => s))];

  if (subcategorias.length) {
    document.getElementById('abast-chips-subcat').innerHTML = subcategorias.map(s => {
      const activo = s === abastSubcategoriaActiva;
      return '<span class="chip-cat' + (activo ? ' activo' : '') + '" style="font-size:11px;padding:3px 10px;" onclick="toggleSubcategoriaAbast(\'' + s.replace(/'/g, "\\'") + '\')">' + s + '</span>';
    }).join('');
  } else {
    document.getElementById('abast-chips-subcat').innerHTML = '';
  }

  let productos = productosCategoria;
  if (subcategorias.length) {
    productos = abastSubcategoriaActiva ? productosCategoria.filter(p => p.subcategoria === abastSubcategoriaActiva) : [];
  }

  if (!productos.length) {
    document.getElementById('abast-lista-solicitar').innerHTML = subcategorias.length
      ? '<p style="font-size:13.5px;color:var(--ink-soft);padding:24px 0;text-align:center;">Elige una subcategoría.</p>'
      : '<p style="font-size:13.5px;color:var(--ink-soft);padding:24px 0;text-align:center;">No hay productos en esta categoría.</p>';
    return;
  }

  let html = '';
  productos.forEach(p => {
    const yaPendiente = cachePendientesNegocio.has(p.nombre);
    const seleccionado = abastSeleccionados.has(p.nombre);
    const nombreEsc = p.nombre.replace(/'/g, "\\'");
    if (yaPendiente) {
      html += '<div class="conteo-row"><div><span style="color:var(--ink-soft);">' + p.nombre + '</span>' +
        '<p style="font-size:11px;color:var(--ink-soft);margin:2px 0 0;">Ya en la lista</p></div>' +
        '<span style="color:var(--ink-soft);">✓</span></div>';
    } else {
      html += '<div class="conteo-row"><span>' + p.nombre + '</span>' +
        '<button type="button" class="icon-btn" style="border-radius:50%;' + (seleccionado ? 'background:var(--forest);color:#fff;' : '') + '" onclick="toggleProductoAbast(\'' + nombreEsc + '\')">' + (seleccionado ? '✓' : '+') + '</button></div>';
    }
  });
  document.getElementById('abast-lista-solicitar').innerHTML = html;
}

function toggleCategoriaAbast(cat) {
  abastCategoriaActiva = abastCategoriaActiva === cat ? null : cat;
  abastSubcategoriaActiva = null;
  pintarSolicitar();
}
function toggleSubcategoriaAbast(sub) {
  abastSubcategoriaActiva = abastSubcategoriaActiva === sub ? null : sub;
  pintarSolicitar();
}
function toggleProductoAbast(nombre) {
  if (abastSeleccionados.has(nombre)) abastSeleccionados.delete(nombre); else abastSeleccionados.add(nombre);
  pintarSolicitar();
}

async function enviarPedidoAbastecimiento() {
  document.getElementById('abast-solicitar-error').textContent = '';
  if (!abastSeleccionados.size) {
    document.getElementById('abast-solicitar-error').textContent = 'Selecciona al menos un producto.';
    return;
  }
  const items = [...abastSeleccionados].map(nombre => {
    const p = cacheAbastCatalogo.catalogo.find(x => x.nombre === nombre);
    return { nombre: nombre, categoria: p ? p.categoria : '', subcategoria: p ? p.subcategoria : '', unidad: p ? p.unidad : 'Un' };
  });
  const negocio = negocioActualAbast_();
  const r = await llamarAPI('guardarPedidoAbastecimiento', { data: { negocio: negocio, responsable: sesion.nombre, items: items } });
  if (!r.ok) { document.getElementById('abast-solicitar-error').textContent = r.error || 'Error al enviar el pedido'; return; }
  abastSeleccionados = new Set();
  document.getElementById('confirm-title').textContent = 'Pedido enviado';
  document.getElementById('confirm-msg').textContent = 'Se agregó a la Lista de compra de ' + negocio + '.';
  document.getElementById('confirm-detalle').innerHTML = '';
  ocultarBotonOtro();
  irA('screen-confirm');
}

// ============ CREAR INSUMO NUEVO ============
// Reutiliza el modal genérico (abrirModal/cerrarModal), mismo patrón que Proveedor/Cliente.

function abrirModalCrearInsumo() {
  const negocio = negocioActualAbast_();
  const opciones = negocio === 'Vegan Corner'
    ? ['Insumo', 'Artículo de Aseo', 'Materia Prima']
    : ['Insumo', 'Artículo de Aseo']; // Cima nunca ve ni puede crear Materia Prima
  const opcionesHtml = opciones.map(c => '<option value="' + c + '">' + c + '</option>').join('');
  abrirModal(
    '<h3 style="margin:0 0 10px;">Crear insumo nuevo</h3>' +
    '<div style="display:flex;flex-direction:column;gap:10px;">' +
      '<input type="text" id="ins-nombre" placeholder="Nombre del insumo">' +
      '<select id="ins-categoria" onchange="actualizarExclusivoInsumo_()">' + opcionesHtml + '</select>' +
      '<select id="ins-unidad"><option value="Un">Un</option><option value="Kg">Kg</option></select>' +
      '<label id="ins-exclusivo-wrap" style="display:flex;align-items:center;gap:8px;font-size:13px;"><input type="checkbox" id="ins-exclusivo"> Exclusivo de mi negocio</label>' +
    '</div>' +
    '<p class="error-msg" id="ins-error" style="margin-top:8px;"></p>' +
    '<div style="display:flex;gap:8px;margin-top:14px;"><button class="btn-secondary" onclick="cerrarModal()">Cancelar</button><button class="btn-primary" onclick="confirmarCrearInsumo()">Crear y pedir</button></div>'
  );
  actualizarExclusivoInsumo_();
}

// El checkbox "Exclusivo de mi negocio" solo tiene sentido para Insumo — Aseo siempre es
// de ambos, Materia Prima ya es exclusiva de Vegan Corner por definición.
function actualizarExclusivoInsumo_() {
  const cat = document.getElementById('ins-categoria').value;
  const wrap = document.getElementById('ins-exclusivo-wrap');
  wrap.style.display = (cat === 'Insumo') ? 'flex' : 'none';
  if (cat !== 'Insumo') document.getElementById('ins-exclusivo').checked = false;
}

async function confirmarCrearInsumo() {
  const nombre = document.getElementById('ins-nombre').value.trim();
  const categoria = document.getElementById('ins-categoria').value;
  const unidad = document.getElementById('ins-unidad').value;
  const exclusivo = document.getElementById('ins-exclusivo').checked;
  if (!nombre) { document.getElementById('ins-error').textContent = 'Ingresa el nombre del insumo'; return; }
  const negocio = negocioActualAbast_();
  const r = await llamarAPI('crearInsumoNuevo', { data: { nombre: nombre, categoria: categoria, unidad: unidad, negocioSolicitante: negocio, exclusivo: exclusivo } });
  if (!r.ok) { document.getElementById('ins-error').textContent = r.error || 'Error al crear el insumo'; return; }
  cacheAbastCatalogo.catalogo.push({ nombre: nombre, categoria: categoria, subcategoria: '', unidad: unidad });
  abastSeleccionados.add(nombre);
  abastCategoriaActiva = categoria;
  abastSubcategoriaActiva = null;
  cerrarModal();
  pintarSolicitar();
}
