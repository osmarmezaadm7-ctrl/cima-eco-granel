/**
 * js/abastecimiento.js — módulo Abastecimiento (20/07/2026).
 * Reemplaza el pedido de mercadería/insumos/MP/aseo por WhatsApp o pizarra, y las
 * pantallas viejas "Inventario MP"/"Lista de compra MP" (quedan sin usar en index.html,
 * no se borraron).
 *
 * DOS pantallas:
 * - Lista de compra (screen-abastecimiento): UNA sola pantalla que se adapta según
 *   GestionarCompras — mismo criterio que la Pauta activa en modo solo-lectura vs
 *   interactivo. Sin el permiso: lista simple de pendientes del propio negocio, sin
 *   cantidad ni proveedor (solo para no duplicar pedidos). Con el permiso (Osmar): vista
 *   consolidada de AMBOS negocios agrupada por proveedor, con cantidad editable y
 *   checkbox de comprado.
 * - Solicitar (screen-abastecimiento-solicitar): chips de 2 niveles (Categoría →
 *   Subcategoría) sobre el catálogo combinado (mercadería de Cima + insumos/MP/aseo).
 *   Sin cantidad — el staff solo marca qué necesita, la cantidad la define Osmar en
 *   Comprar. Los productos ya pendientes se muestran atenuados ("Ya en la lista").
 */

let cacheAbastCatalogo = null;      // { ok, catalogo:[{nombre, categoria, subcategoria, unidad}] }
let cachePendientesNegocio = null;  // Set de nombres ya pendientes en el negocio de la sesión
let abastCategoriaActiva = null;
let abastSubcategoriaActiva = null;
let abastSeleccionados = new Set(); // nombres marcados para enviar en este pedido
let abastNegocioElegido = null;     // solo se usa cuando sesion.negocio === 'Ambos' (Osmar)

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

// ============ LISTA DE COMPRA (adaptiva) ============

async function abrirAbastecimiento(forzar) {
  irA('screen-abastecimiento');
  const btnSolicitar = document.getElementById('btn-abast-solicitar');
  if (btnSolicitar) btnSolicitar.style.display = tienePermisoLocal('RegistrarAbastecimiento') ? '' : 'none';
  document.getElementById('abast-lista').innerHTML = skeletonCards(3);
  document.getElementById('abast-submit-bar').style.display = esAdminCompras_() ? '' : 'none';

  if (esAdminCompras_()) {
    document.getElementById('abast-subtitulo').textContent = 'Todo lo pendiente, agrupado por proveedor.';
    const r = await llamarAPI('obtenerListaCompraAdmin', {});
    if (!document.getElementById('screen-abastecimiento').classList.contains('active')) return;
    pintarAbastecimientoAdmin(r);
  } else {
    const negocio = negocioActualAbast_();
    document.getElementById('abast-subtitulo').textContent = 'Pendiente en ' + (negocio || '') + '.';
    const r = await llamarAPI('obtenerListaCompraStaff', { negocio: negocio });
    if (!document.getElementById('screen-abastecimiento').classList.contains('active')) return;
    pintarAbastecimientoStaff(r);
  }
}

function pintarAbastecimientoStaff(r) {
  const pendientes = (r && r.pendientes) || [];
  if (!pendientes.length) {
    document.getElementById('abast-lista').innerHTML = '<p style="font-size:13.5px;color:var(--ink-soft);padding:24px 0;text-align:center;">No hay nada pendiente por ahora.</p>';
    return;
  }
  let html = '';
  pendientes.forEach(p => {
    html += '<div class="conteo-row"><span>' + p.nombre + '</span>' +
      '<span style="font-size:11px;color:var(--ink-soft);">' + (p.responsables || []).join(', ') + ' · ' + p.fecha + '</span></div>';
  });
  document.getElementById('abast-lista').innerHTML = html;
}

function pintarAbastecimientoAdmin(r) {
  const items = (r && r.items) || [];
  const leyenda = document.getElementById('abast-leyenda');
  if (!items.length) {
    leyenda.style.display = 'none';
    document.getElementById('abast-lista').innerHTML = '<p style="font-size:13.5px;color:var(--ink-soft);padding:24px 0;text-align:center;">No hay nada pendiente por ahora.</p>';
    return;
  }
  leyenda.style.display = 'flex';
  leyenda.innerHTML =
    '<span style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--ink-soft);">' + puntoNegocio_('Vegan Corner') + 'Vegan Corner</span>' +
    '<span style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--ink-soft);">' + puntoNegocio_('Cima') + 'Cima</span>';

  const grupos = {};
  const orden = [];
  items.forEach(it => {
    const clave = it.proveedor || 'Sin proveedor asignado';
    if (!grupos[clave]) { grupos[clave] = []; orden.push(clave); }
    grupos[clave].push(it);
  });
  // "Sin proveedor asignado" siempre al final, como en el mockup.
  orden.sort((a, b) => (a === 'Sin proveedor asignado') - (b === 'Sin proveedor asignado'));

  let html = '';
  orden.forEach(proveedor => {
    html += '<p class="conteo-seccion-titulo">' + proveedor + '</p>';
    grupos[proveedor].forEach(it => {
      html += '<div class="abast-item-row" style="display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid var(--border);">' +
        '<div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0;">' +
          '<input type="checkbox" class="abast-check" data-id="' + it.id + '" style="flex-shrink:0;">' +
          '<span style="width:7px;height:7px;border-radius:50%;background:' + (it.negocio === 'Vegan Corner' ? 'var(--terracotta)' : 'var(--forest)') + ';flex-shrink:0;display:inline-block;" aria-hidden="true"></span>' +
          '<span style="font-size:14px;">' + it.producto + '</span>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">' +
          '<input type="number" min="0" value="' + (it.cantidad === null ? '' : it.cantidad) + '" style="width:52px;text-align:right;" onchange="cambiarCantidadItemCompra(\'' + it.id + '\',this.value)">' +
          '<span style="font-size:12px;color:var(--ink-soft);">' + it.unidad + '</span>' +
        '</div>' +
      '</div>';
    });
  });
  document.getElementById('abast-lista').innerHTML = html;
}

// Punto de color por negocio — reemplaza el pill de texto ("se ve desordenado", feedback
// de Osmar 21/07/2026). Vegan Corner = terracota, Cima = verde, mismos colores de marca
// que ya usa el resto del sistema (var(--terracotta)/var(--forest)).
function puntoNegocio_(negocio) {
  const color = negocio === 'Vegan Corner' ? 'var(--terracotta)' : 'var(--forest)';
  return '<span style="width:7px;height:7px;border-radius:50%;background:' + color + ';flex-shrink:0;display:inline-block;" aria-hidden="true"></span>';
}

async function cambiarCantidadItemCompra(id, val) {
  await llamarAPI('actualizarCantidadItemCompra', { data: { id: id, cantidad: val } });
}

async function confirmarItemsComprados() {
  document.getElementById('abast-error').textContent = '';
  const ids = [...document.querySelectorAll('.abast-check:checked')].map(el => el.dataset.id);
  if (!ids.length) { document.getElementById('abast-error').textContent = 'Selecciona al menos un ítem.'; return; }
  const r = await llamarAPI('marcarItemsComprados', { data: { ids: ids } });
  if (!r.ok) { document.getElementById('abast-error').textContent = r.error || 'Error al marcar comprados'; return; }
  abrirAbastecimiento(true);
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
    llamarAPI('obtenerListaCompraStaff', { negocio: negocio })
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
