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
let borradorConteoPendiente = null;       // borrador traído del servidor, mientras el modal está abierto

// Rosa/Katherine (Vegan Corner) solo reportan SU propio stock congelado — no cuentan lo
// de Cima (Horneada/Pasteles/Congelados no son suyos). Esta pantalla se adapta sola:
// una sola categoría, sin chips, y el guardado va a StockCongeladoVC, no a ConteoStockCima.
function esVeganCorner_() { return !!(sesion && sesion.negocio === 'Vegan Corner'); }

// NUEVO 21/07/2026 (con Osmar — borrador de Conteo): negocio con el que se guarda y se
// busca el borrador. Usa el nombre LARGO ('Cima Eco-Granel'), que es la convención del
// resto del sistema (Usuarios, Respuestas, CatalogoProductos) — NO 'Cima' a secas, que
// solo usa PedidosAbastecimiento. Único lugar donde se normaliza el caso de Osmar
// (sesion.negocio === 'Ambos'): la pantalla de Conteo lo manda por el camino de Cima,
// así que su borrador cae en la fila de Cima Eco-Granel.
function negocioConteo_() { return esVeganCorner_() ? 'Vegan Corner' : 'Cima Eco-Granel'; }

async function abrirConteo(forzar) {
  irA('screen-conteo');
  // El botón de refrescar (forzar) borra conteoCantidades — guardamos antes para que un
  // toque accidental a mitad de conteo no pierda lo contado.
  if (forzar && Object.keys(conteoCantidades).length) await guardarBorradorConteo_();
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
  // CORRECCIÓN 22/07/2026: antes esta llamada iba DESPUÉS de ofrecerBorradorConteo_, así
  // que cualquier excepción allá dejaba el bloque de recepción sin dibujar y sin rastro.
  // Ahora va primero y con su propio try/catch: los dos caminos son independientes.
  try { await cargarRecepcionPendiente_(); } catch (e) { console.error('[recepcion] falló la carga:', e); }
  await ofrecerBorradorConteo_();
}

// ============ BORRADOR AUTOMÁTICO DE CONTEO (NUEVO 21/07/2026 — con Osmar) ============
// Antes, todo lo contado vivía SOLO en conteoCantidades (memoria del navegador): si el
// celular mataba la app o se recargaba la página, se perdía todo, porque nada tocaba
// disco hasta confirmar el conteo. Ahora se deja un borrador silencioso en la hoja
// BorradorConteo, sin botón y sin que el usuario haga nada.
//
// DOS PUNTOS DE GUARDADO (ninguno mientras se cuenta — cero tráfico al escribir):
//   1. Al salir de la pantalla de Conteo  -> guarda en irA() (index.html)
//   2. Al pasar la app a segundo plano    -> guarda en visibilitychange (index.html)
// El (2) es best-effort: en móvil el navegador a veces mata el proceso antes de que la
// llamada complete. Cubre el caso real de terreno, no el 100%.
//
// CUÁNDO APARECE EL MODAL (la regla central, cerrada con Osmar):
//   conteoCantidades VACÍO  Y  el servidor tiene un borrador con contenido.
// La memoria vacía ES el síntoma de que se perdió el estado (recarga / app matada /
// re-login). Si la memoria TIENE datos, el usuario solo fue a mirar otro menú y volvió:
// preguntarle ahí lo haría RETROCEDER, porque el borrador del servidor es más viejo que
// lo que tiene en pantalla.

// Guardado silencioso. Usa llamarAPISilencioso a propósito: llamarAPI muestra el overlay
// de "cargando", que parpadearía cada vez que se sale de Conteo. Los errores se ignoran
// —es una red de seguridad, no una operación que el usuario pidió; si falla, el flujo
// normal de confirmar el conteo sigue funcionando igual.
async function guardarBorradorConteo_() {
  if (!sesion || !sesion.nombre || !cacheConteoCatalogo) return;
  try {
    await llamarAPISilencioso('guardarBorradorConteo', {
      data: {
        negocio: negocioConteo_(),
        responsable: sesion.nombre,
        categorias: [...conteoCategoriasActivas],
        productos: conteoCantidades
      }
    });
  } catch (e) { /* silencioso a propósito */ }
}

async function ofrecerBorradorConteo_() {
  if (Object.keys(conteoCantidades).length) return;   // ya hay algo en pantalla: no preguntar
  if (!cacheConteoCatalogo) return;
  const r = await llamarAPISilencioso('obtenerBorradorConteo', { negocio: negocioConteo_() });
  if (!r || !r.ok || !r.borrador) return;
  if (Object.keys(conteoCantidades).length) return;   // por si se contó algo mientras respondía
  const b = r.borrador;
  borradorConteoPendiente = b;
  // Total = productos del catálogo en las categorías que estaban activas. Si alguna
  // categoría del borrador ya no existe en el catálogo, simplemente no suma — no rompe.
  const total = cacheConteoCatalogo.catalogo.filter(p => b.categorias.indexOf(p.categoria) !== -1).length;
  abrirModal(
    '<div style="display:flex;align-items:center;gap:9px;margin-bottom:12px;">' +
      '<span style="width:30px;height:30px;border-radius:50%;background:var(--amber-soft);display:flex;align-items:center;justify-content:center;flex-shrink:0;">' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7A5A22" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path></svg>' +
      '</span>' +
      '<span class="serif" style="font-size:18px;">Conteo sin terminar</span>' +
    '</div>' +
    '<p style="font-size:14px;line-height:1.55;margin:0 0 4px;">Hay un conteo sin terminar en ' + b.negocio + '.</p>' +
    '<p style="font-size:12.5px;color:var(--ink-soft);margin:0 0 14px;">' + (b.responsable || 'Sin responsable') + ' · ' + b.fecha + '</p>' +
    '<div style="background:var(--paper);border:1px solid var(--border);border-radius:12px;padding:11px 13px;margin-bottom:16px;">' +
      '<div style="display:flex;justify-content:space-between;align-items:baseline;padding:3px 0;">' +
        '<span style="font-size:13px;color:var(--ink-soft);">Categorías</span>' +
        '<span style="font-size:13px;">' + (b.categorias.join(', ') || '—') + '</span>' +
      '</div>' +
      '<div style="display:flex;justify-content:space-between;align-items:baseline;padding:3px 0;">' +
        '<span style="font-size:13px;color:var(--ink-soft);">Contados</span>' +
        '<span class="mono" style="font-size:13px;">' + b.contados + ' de ' + total + '</span>' +
      '</div>' +
    '</div>' +
    '<button class="btn-primary" style="margin-bottom:9px;" onclick="retomarBorradorConteo()">Retomar el conteo</button>' +
    '<button class="btn-secondary" onclick="descartarBorradorConteo()">Empezar de cero</button>'
  );
}

function retomarBorradorConteo() {
  const b = borradorConteoPendiente;
  if (!b) { cerrarModal(); return; }
  conteoCantidades = b.productos || {};
  // Vegan Corner tiene una sola categoría fija: no se restaura desde el borrador.
  if (!esVeganCorner_()) conteoCategoriasActivas = new Set(b.categorias || []);
  borradorConteoPendiente = null;
  cerrarModal();
  pintarConteo();
}

// Opción 3 (decidida con Osmar): si el borrador es TUYO, borra directo — es tu trabajo y
// no hay por qué agregar fricción. Si lo dejó OTRA persona, pide confirmación antes,
// porque estarías descartando trabajo ajeno sin vuelta atrás.
async function descartarBorradorConteo(confirmado) {
  const b = borradorConteoPendiente;
  if (!b) { cerrarModal(); return; }
  const esAjeno = b.responsable && sesion && b.responsable !== sesion.nombre;
  if (esAjeno && !confirmado) {
    abrirModal(
      '<div style="display:flex;align-items:center;gap:9px;margin-bottom:12px;">' +
        '<span style="width:30px;height:30px;border-radius:50%;background:var(--terracotta-soft);display:flex;align-items:center;justify-content:center;flex-shrink:0;">' +
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--terracotta)" stroke-width="2" stroke-linecap="round"><path d="M12 9v4"></path><path d="M12 17h.01"></path><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"></path></svg>' +
        '</span>' +
        '<span class="serif" style="font-size:18px;">¿Descartar?</span>' +
      '</div>' +
      '<p style="font-size:14px;line-height:1.55;margin:0 0 16px;">Se va a perder lo que contó ' + b.responsable + ' (' + b.contados + ' producto' + (b.contados === 1 ? '' : 's') + '). No se puede deshacer.</p>' +
      '<button class="btn-primary" style="margin-bottom:9px;" onclick="retomarBorradorConteo()">Mejor retomarlo</button>' +
      '<button class="btn-secondary" onclick="descartarBorradorConteo(true)">Sí, empezar de cero</button>'
    );
    return;
  }
  await llamarAPISilencioso('limpiarBorradorConteo', { negocio: negocioConteo_() });
  borradorConteoPendiente = null;
  conteoCantidades = {};
  cerrarModal();
  pintarConteo();
}

// NUEVO 20/07/2026 (con Osmar — "revisar el último conteo", Opción B): texto de
// referencia neutro, sin alertas ni resaltado (decisión explícita de Osmar).
function refUltimoConteoHtml_(p) {
  if (!p.ultimoConteo) return '<span style="font-size:11px;color:var(--ink-soft);">Sin conteo previo</span>';
  return '<span style="font-size:11px;color:var(--ink-soft);">Últ: ' + p.ultimoConteo.cantidad + ' · ' + p.ultimoConteo.fecha + '</span>';
}
function filaConteoDesktop_(p, key, val, keyEsc, incluirUltimo) {
  return '<tr><td style="padding:9px 6px;font-weight:600;color:var(--ink);">' + p.nombre + '</td>' +
    '<td style="padding:9px 6px;">' + p.categoria + '</td>' +
    (incluirUltimo ? '<td style="padding:9px 6px;">' + refUltimoConteoHtml_(p) + '</td>' : '') +
    '<td style="padding:6px;text-align:right;"><div class="conteo-stepper" style="display:inline-flex;">' +
      '<button type="button" onclick="cambiarCantidadConteo(\'' + keyEsc + '\',-1)">\u2212</button>' +
      '<input type="number" min="0" value="' + val + '" oninput="escribirCantidadConteo(\'' + keyEsc + '\',this.value)">' +
      '<button type="button" onclick="cambiarCantidadConteo(\'' + keyEsc + '\',1)">+</button>' +
    '</div></td></tr>';
}
function pintarConteoDesktop_(productos, incluirUltimo) {
  const titulo = document.querySelector('#screen-conteo h2');
  const boton = document.querySelector('#screen-conteo .submit-bar button');
  let html = '<table><thead><tr><th>Producto</th><th>Categoría</th>' +
    (incluirUltimo ? '<th>Último conteo</th>' : '') + '<th style="text-align:right;">Cantidad</th></tr></thead><tbody>';
  productos.forEach(p => {
    const key = p.productoProduccion + '|' + p.categoria;
    const val = conteoCantidades[key] !== undefined ? conteoCantidades[key] : 0;
    html += filaConteoDesktop_(p, key, val, key.replace(/'/g, "\\'"), incluirUltimo);
  });
  html += '</tbody></table>';
  if (!productos.length) html = '<p style="font-size:13.5px;color:var(--ink-soft);padding:24px 0;text-align:center;">' +
    (esVeganCorner_() ? 'No hay empanadas configuradas para contar.' : 'Elige qué categoría(s) vas a contar.') + '</p>';
  document.getElementById('conteo-lista').innerHTML = html;
}

// NUEVO 22/07/2026 (con Osmar): aviso suave cuando se van a contar Empanadas horneadas sin
// las congeladas. No bloquea ni obliga — la reserva no se descongela a diario y contar el
// congelador todos los días tiene un costo real para Cecilia. Pero sin ese número no se
// puede calcular la venta (ver mapaMovimiento_), y antes eso se traducía en un número
// inventado en Revisión. Mejor avisar acá, que es donde se puede hacer algo.
function pintarAvisoCongeladas_() {
  const wrap = document.getElementById('conteo-aviso-congeladas');
  if (!wrap) return;
  const hayHorneadas = conteoCategoriasActivas.has('Empanadas');
  const hayCongeladas = conteoCategoriasActivas.has('Empanadas Congeladas');
  const existeCategoria = cacheConteoCatalogo.catalogo.some(p => p.categoria === 'Empanadas Congeladas');
  if (!hayHorneadas || hayCongeladas || !existeCategoria) { wrap.style.display = 'none'; return; }
  wrap.style.display = '';
  wrap.innerHTML = 'Contando solo las horneadas no se puede calcular cuánto se vendió. ' +
    '<button type="button" class="aviso-accion" onclick="toggleCategoriaConteo(\'Empanadas Congeladas\')">Agregar congeladas</button>';
}

function pintarConteo() {
  const titulo = document.querySelector('#screen-conteo h2');
  const boton = document.querySelector('#screen-conteo .submit-bar button');
  const esAncho = window.matchMedia('(min-width: 900px)').matches;

  const btnUltimo = document.getElementById('btn-ultimo-conteo');

  if (esVeganCorner_()) {
    if (btnUltimo) btnUltimo.style.display = 'none'; // Rosa/Katherine cuentan StockCongeladoVC, no ConteoStockCima — no aplica
    document.getElementById('conteo-chips').style.display = 'none';
    if (titulo) titulo.textContent = 'Stock congelado';
    if (boton) boton.textContent = 'Guardar stock';
    const productos = cacheConteoCatalogo.catalogo.filter(p => p.categoria === 'Empanadas Congeladas');
    if (esAncho) { pintarConteoDesktop_(productos, false); return; }
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

  if (btnUltimo) btnUltimo.style.display = '';
  document.getElementById('conteo-chips').style.display = '';
  if (titulo) titulo.textContent = 'Contar stock';
  if (boton) boton.textContent = 'Guardar conteo';
  const categorias = [...new Set(cacheConteoCatalogo.catalogo.map(p => p.categoria))];

  document.getElementById('conteo-chips').innerHTML = categorias.map(c => {
    const activo = conteoCategoriasActivas.has(c);
    return '<span class="chip-cat' + (activo ? ' activo' : '') + '" onclick="toggleCategoriaConteo(\'' + c.replace(/'/g, "\\'") + '\')">' + c + '</span>';
  }).join('');

  pintarAvisoCongeladas_();

  const productosActivos = cacheConteoCatalogo.catalogo.filter(p => conteoCategoriasActivas.has(p.categoria));
  if (esAncho) { pintarConteoDesktop_(productosActivos, true); return; }

  let html = '';
  categorias.filter(c => conteoCategoriasActivas.has(c)).forEach(cat => {
    const productos = cacheConteoCatalogo.catalogo.filter(p => p.categoria === cat);
    if (!productos.length) return;
    html += '<p class="conteo-seccion-titulo">' + cat + '</p>';
    productos.forEach(p => {
      const key = p.productoProduccion + '|' + p.categoria;
      const val = conteoCantidades[key] !== undefined ? conteoCantidades[key] : 0;
      const keyEsc = key.replace(/'/g, "\\'");
      html += '<div class="conteo-row" style="flex-wrap:wrap;">' +
        '<span>' + p.nombre + '<br>' + refUltimoConteoHtml_(p) + '</span>' +
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

// NUEVO 20/07/2026 (con Osmar — "revisar el último conteo", Opción A): snapshot de
// solo lectura de la última fila de ConteoStockCima, cualquier estado. No toca
// conteoCantidades ni el flujo de Revisión — es solo consulta. Usa el modal genérico
// (abrirModal/cerrarModal) ya existente en index.html, mismo patrón que el resto del
// sistema (Cierre de caja, Cliente nuevo, etc.).
// ============ HISTORIAL DE CONTEOS (NUEVO 22/07/2026 — con Osmar) ============
// Reemplaza "Ver último conteo" (mostraba uno solo, sin poder ver los anteriores ni
// corregir uno mal hecho). Mismo botón, mismo lugar — ahora abre la lista completa,
// paginada de 5 en 5, más reciente primero. Cada conteo se expande para ver sus productos
// y, si ya fue procesado, tiene un botón para anularlo (ver anularConteo en Produccion.gs:
// no lo reescribe, lo descarta como referencia — el número que se contó mal no se toca).
let cacheHistorialConteos = [];
let historialConteosOffset = 0;
let historialConteosHayMas = false;
let historialConteosExpandido = null; // id del conteo abierto, o null

async function abrirHistorialConteos() {
  cacheHistorialConteos = []; historialConteosOffset = 0; historialConteosExpandido = null;
  abrirModal('<h3 style="margin:0 0 10px;">Historial de conteos</h3><div id="hist-conteos-lista"><p style="text-align:center;color:var(--ink-soft);padding:20px 0;">Cargando…</p></div><button class="btn-secondary" id="hist-conteos-vermas" style="width:100%;margin-top:10px;display:none;" onclick="cargarHistorialConteos(false)">Ver más</button><div class="error-msg" id="hist-conteos-error"></div><div style="margin-top:14px;"><button class="btn-secondary" style="width:100%;" onclick="cerrarModal()">Cerrar</button></div>');
  await cargarHistorialConteos(true);
}

async function cargarHistorialConteos(reset) {
  if (reset) { cacheHistorialConteos = []; historialConteosOffset = 0; }
  const r = await llamarAPI('obtenerHistorialConteos', { offset: historialConteosOffset });
  const cont = document.getElementById('hist-conteos-lista');
  if (!cont) return; // el modal se cerró mientras cargaba
  if (!r.ok) { cont.innerHTML = '<p class="error-msg">' + (r.error || 'Error al cargar el historial') + '</p>'; return; }
  cacheHistorialConteos = cacheHistorialConteos.concat(r.historial);
  historialConteosOffset += r.historial.length;
  historialConteosHayMas = r.hayMas;
  pintarHistorialConteos_();
  document.getElementById('hist-conteos-vermas').style.display = historialConteosHayMas ? '' : 'none';
}

function pintarHistorialConteos_() {
  const cont = document.getElementById('hist-conteos-lista');
  if (!cont) return;
  if (!cacheHistorialConteos.length) {
    cont.innerHTML = '<p style="font-size:13.5px;color:var(--ink-soft);padding:20px 0;text-align:center;">Todavía no hay ningún conteo registrado.</p>';
    return;
  }
  cont.innerHTML = cacheHistorialConteos.map(c => {
    const abierto = historialConteosExpandido === c.id;
    const estadoClase = c.estado === 'Anulado' ? 'anulado' : c.estado === 'Pendiente' ? 'pendiente' : '';
    let detalle = '';
    if (abierto) {
      const categorias = [...new Set((c.items || []).map(p => p.categoria))];
      const filas = categorias.map(cat => {
        const items = (c.items || []).filter(p => p.categoria === cat);
        return '<p class="resumen-seccion-titulo">' + cat + '</p>' +
          items.map(p => '<div class="resumen-fila"><span>' + p.nombre + '</span><strong>' + p.cantidadContada + '</strong></div>').join('');
      }).join('');
      const puedeAnular = (c.estado === 'Procesado' || c.estado === 'Revisado') && tienePermisoLocal('RegistrarConteo');
      detalle = '<div class="hist-conteo-detalle">' + (filas || '<p style="font-size:13px;color:var(--ink-soft);">Sin productos.</p>') +
        (puedeAnular ? '<button type="button" class="btn-anular-conteo" onclick="confirmarAnularConteo(\'' + c.id + '\')">Anular este conteo</button>' : '') +
        '</div>';
    }
    return '<div class="hist-conteo-fila ' + estadoClase + '">' +
      '<button type="button" class="hist-conteo-cab" onclick="toggleHistorialConteo_(\'' + c.id + '\')">' +
        '<div><span class="hist-conteo-fecha">' + c.fecha + '</span><span class="hist-conteo-resp">' + c.responsable + '</span></div>' +
        '<div class="hist-conteo-der"><span class="hist-conteo-n">' + c.cantidadProductos + ' productos</span>' +
        (c.estado !== 'Procesado' ? '<span class="hist-conteo-badge">' + c.estado + '</span>' : '') + '</div>' +
      '</button>' + detalle +
    '</div>';
  }).join('');
}

function toggleHistorialConteo_(id) {
  historialConteosExpandido = historialConteosExpandido === id ? null : id;
  pintarHistorialConteos_();
}

function confirmarAnularConteo(id) {
  abrirModal(
    '<h3 style="font-size:15px;margin:0 0 8px;">Anular este conteo</h3>' +
    '<p style="font-size:12.5px;color:var(--ink-soft);margin:0 0 12px;line-height:1.5;">Deja de servir como referencia para calcular el movimiento. No se borra ni se reescribe.</p>' +
    '<label style="font-size:11.5px;color:var(--ink-soft);display:block;margin-bottom:5px;">Motivo (opcional)</label>' +
    '<input type="text" id="anular-conteo-motivo" placeholder="Ej: se contó por error">' +
    '<div class="error-msg" id="anular-conteo-error"></div>' +
    '<div style="display:flex;gap:8px;margin-top:14px;">' +
      '<button class="btn-secondary" style="flex:1;" onclick="abrirHistorialConteos()">Cancelar</button>' +
      '<button class="btn-primary" style="flex:1;background:var(--terracotta);" onclick="ejecutarAnularConteo_(\'' + id + '\')">Anular</button>' +
    '</div>'
  );
}

async function ejecutarAnularConteo_(id) {
  const motivo = document.getElementById('anular-conteo-motivo').value;
  const r = await llamarAPI('anularConteo', { data: { conteoId: id, responsable: sesion.nombre, motivo: motivo } });
  if (!r.ok) { document.getElementById('anular-conteo-error').textContent = r.error || 'Error al anular'; return; }
  await abrirHistorialConteos();
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
    // El conteo quedó registrado: el borrador ya no tiene razón de existir. Si no se
    // limpiara, el próximo que entre a Conteo vería el aviso de un conteo YA confirmado.
    await llamarAPISilencioso('limpiarBorradorConteo', { negocio: negocioConteo_() });
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
  await llamarAPISilencioso('limpiarBorradorConteo', { negocio: negocioConteo_() });
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
function abrirComentarioProducto(clave) { revisionComentarios[clave] = revisionComentarios[clave] || ''; pintarRevisionPedido(); }
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
    if (hayPendiente) pintarRevisionPedido();
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
// ===== INDICADOR DE MOVIMIENTO — NUEVO 22/07/2026 (con Osmar) =====
// El stock pasa a ser el dato protagonista de la fila: antes el total no se veía en ninguna
// parte, estaba repartido entre los badges de categoría (Horneada 8 / Congelada 6) y había
// que sumarlo de cabeza para saber cuánto hay. Los badges se mantienen debajo — siguen
// siendo el desglose, solo dejan de ser lo primero que se lee.
// ===== BLOQUE DE STOCK Y MOVIMIENTO EN REVISIÓN =====
// REESCRITO 22/07/2026 (con Osmar). Dos correcciones:
//
// 1. El badge "Stock N" se repetía. bloqueStockRevision_ ya escribe "18 en stock" y
//    badgesDetalleRevision_ agregaba un badge con el MISMO número para cualquier categoría
//    que no fuera empanada. Ahora los badges solo salen cuando aportan algo: las dos
//    cubetas de un producto dual, o la reserva de Vegan Corner.
//
// 2. En empanadas el número grande es SOLO horneadas — es lo único vendible y lo que
//    dispara el pedido de horneado. Las congeladas bajan a badge de nivel, sin movimiento:
//    son reserva, y calcular "salidas" de una reserva que no se cuenta a diario no dice
//    nada útil. Ver mapaMovimiento_ en Produccion.gs para la aritmética.

function bloqueStockRevision_(contadoTotal, dual) {
  return '<div class="revision-stock"><b>' + contadoTotal + '</b><i>' + (dual ? 'horneadas en stock' : 'en stock') + '</i></div>';
}

// Estados (ver mapaMovimiento_):
//   normal          -> texto plano. Si todos llevaran fondo, el ojo no distinguiría lo que
//                      necesita atención de lo que está bien.
//   dudoso          -> ámbar. El número es válido pero hay entregas sin confirmar.
//   revisar         -> terracota, SIN mostrar el número negativo. CORREGIDO 23/07/2026:
//                      antes decía "falta confirmar entrega" siempre, pero un negativo
//                      también puede salir con la entrega YA confirmada — por ejemplo un
//                      conteo anterior mal hecho. El mensaje ya no diagnostica la causa,
//                      deja que la persona revise el historial de conteos.
//   faltaCongeladas -> texto gris. NO se inventa un número: sin contar la reserva no hay
//                      total, y sin total no hay venta calculable. Esto es exactamente lo
//                      que antes producía el "salieron 31" falso.
//   sinReferencia   -> no dibuja nada: sin conteo previo no hay intervalo que medir.
function lineaMovimientoHtml_(mov) {
  if (!mov || mov.estado === 'sinReferencia') return '';
  if (mov.estado === 'faltaCongeladas') return '<p class="revision-mov falta">Falta contar las congeladas para calcular la venta</p>';
  if (mov.estado === 'revisar') return '<p class="revision-mov revisar">El número no cierra \u2014 revisa el conteo anterior en el historial</p>';

  const sale = '<span class="sale">\u2193 ' + mov.vendidas + '</span> vendidas';
  if (mov.estado === 'dudoso') return '<p class="revision-mov dudoso">' + sale + ' \u00b7 hay ' + mov.transito + ' en tránsito</p>';
  let txt = sale;
  if (mov.entradas !== null && mov.entradas !== undefined && mov.entradas > 0) {
    txt += ' \u00b7 <span class="entra">\u2191 ' + mov.entradas + '</span> entró';
  }
  // El horneado interno solo se muestra cuando hubo: es un movimiento de congeladas a
  // horneadas dentro de Cima, no una entrada ni una venta.
  if (mov.horneadoCima) txt += ' \u00b7 ' + mov.horneadoCima + ' horneadas acá';
  // Los días solo si el intervalo es mayor a 1: "· 1 día" en un conteo diario es ruido.
  if (mov.dias > 1) txt += ' \u00b7 ' + mov.dias + ' días';
  return '<p class="revision-mov">' + txt + '</p>';
}

// Badges de NIVEL, no de movimiento. Solo se dibujan cuando agregan información que el
// número grande no tiene ya.
function badgesDetalleRevision_(it) {
  let html = '';
  if (it.dual) {
    if (it.stockCongeladas !== null && it.stockCongeladas !== undefined) {
      // La reserva puede venir de un conteo de días atrás; se rotula en vez de esconderla.
      const viejo = it.congeladasDesde > 0 ? ' \u00b7 hace ' + it.congeladasDesde + 'd' : '';
      html += '<span class="revision-badge">Congeladas Cima ' + it.stockCongeladas + viejo + '</span>';
    } else {
      html += '<span class="revision-badge sin">Congeladas Cima \u2014</span>';
    }
  }
  if (it.stockCongeladoVC) html += '<span class="revision-badge">VC ' + it.stockCongeladoVC + '</span>';
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
function pintarRevisionPedidoDesktop_() {
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
      bloqueStockRevision_(it.contadoTotal, it.dual) + lineaMovimientoHtml_(it.movimiento) + badgesDetalleRevision_(it),
      etiquetaFactorHtml_(it.productoProduccion),
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
function pintarRevisionPedido() {
  if (window.matchMedia('(min-width: 900px)').matches) { pintarRevisionPedidoDesktop_(); return; }
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
      bloqueStockRevision_(it.contadoTotal, it.dual) +
      lineaMovimientoHtml_(it.movimiento) +
      '<p class="revision-detalle">' + badgesDetalleRevision_(it) + '</p>' +
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
  pintarRevisionPedido();
}
function quitarAgregadoRevision(idx) {
  const clave = revisionAgregados[idx].productoProduccion;
  delete revisionPedidos[clave];
  delete revisionComentarios[clave];
  revisionAgregados.splice(idx, 1);
  pintarRevisionPedido();
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
  pintarRevisionPedido();
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
  pintarRevisionPedido();
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

  const observacion = resumenPedidoOrigen === 'conteo' ? revisionObservacion : ceroObservacion;

  // NUEVO 23/07/2026 (con Osmar): la observación ahora viaja con el pedido, no solo con
  // la notificación — antes desaparecía en cuanto alguien tocaba "Marcar como vista".
  const r = await llamarAPI('enviarProgramacionProduccion', {
    data: { responsable: sesion.nombre, conteoIds: conteoIds, items: resumenPedidoItems, observacion: observacion || '' }
  });
  if (!r.ok) { document.getElementById('resumen-pedido-error').textContent = r.error || 'Error al enviar el pedido'; return; }

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
// "+ Agregar producto" se escribe de inmediato (agregarItemPautaDirecto) — agregar sí es un
// hecho consumado. Solo "Confirmar producción" resuelve todo de una vez.
// CAMBIO 23/07/2026 (con Osmar — rediseño): se dio de baja el "quitar" local de un ítem de
// Cima (pautaOcultos) — era puramente en memoria, no persistía, y el ícono prometía algo que
// no cumplía. Lo no producido ya queda registrado de forma honesta como pendiente al
// confirmar, sin necesidad de un botón intermedio.
let cachePauta = null;              // { ok, pauta:[...] } — obtenerPautaActiva()
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

  cambiarTabPauta('activa');
  if (!cachePauta || forzar) {
    document.getElementById('pauta-lista').innerHTML = skeletonCards(3);
    const r = await llamarAPI('obtenerPautaActiva', {});
    if (!r.ok) {
      document.getElementById('pauta-lista').innerHTML = '<p class="error-msg">' + (r.error || 'Error al cargar la pauta') + '</p>';
      return;
    }
    cachePauta = r;
    pautaAgregadosSesion = [];
  }
  pintarPauta();
}

// REDISEÑO 23/07/2026 (con Osmar): la Pauta pasa de organizarse por procedencia a
// organizarse por avance. Dos cambios de fondo:
// 1) Dos baldes FIJOS en vez de un grupo por persona: "Pedido de Cima" (con sub-bloques
//    por cada envío — mismo ConteoId — para no mezclar la observación de un pedido con la
//    de otro) y "Agregado acá" (lista plana, sin observaciones que mostrar). Ya no importa
//    quién de Cima mandó el pedido, ni si lo agregó Katherine o Rosa.
// 2) Lo marcado "Hecho" se saca de los dos baldes y baja a una sección colapsada al final
//    — deja de competir por atención con lo que todavía falta.
let pautaHechosAbierto = false;
function togglePautaHechos() { pautaHechosAbierto = !pautaHechosAbierto; pintarPauta(); }

// El Id de un ítem de pauta trae el timestamp de creación embebido (nuevoId_ = 'PROG-' +
// Date.now() + '-' + random) — se aprovecha solo para mostrar la hora del envío junto a su
// observación, sin tocar el esquema del Sheet ni pedirle un dato nuevo al servidor.
function horaDeIdPauta_(id) {
  const ts = Number(String(id).split('-')[1]);
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

// Mapa conteoId -> observación, construido sobre TODOS los ítems (hechos y pendientes).
// Importante: si se arma solo con los pendientes, la observación puede "desaparecer" en
// cuanto se marca Hecho justo el ítem que la traía, aunque el resto del mismo pedido
// siga pendiente. Se busca el primer texto no vacío del grupo completo.
function mapaObservacionesPorEnvio_(todosLosItems) {
  const mapa = {};
  todosLosItems.forEach(it => {
    if (!it.conteoId) return;
    if (!mapa[it.conteoId] && it.observacionPedido) mapa[it.conteoId] = it.observacionPedido;
  });
  return mapa;
}

// Agrupa la pauta pendiente en los dos baldes fijos. "envios" preserva el orden de llegada
// (el Sheet ya entrega las filas en ese orden) — así dos pedidos del mismo día no se mezclan
// y cada uno conserva su propia observación.
function agruparPauta_(items, mapaObs) {
  const porEnvio = {}; const ordenEnvio = [];
  const agregados = [];
  items.forEach(it => {
    if (!it.conteoId) { agregados.push(it); return; }
    if (!porEnvio[it.conteoId]) {
      porEnvio[it.conteoId] = { conteoId: it.conteoId, hora: horaDeIdPauta_(it.id), observacion: (mapaObs && mapaObs[it.conteoId]) || '', items: [] };
      ordenEnvio.push(it.conteoId);
    }
    porEnvio[it.conteoId].items.push(it);
  });
  return { envios: ordenEnvio.map(c => porEnvio[c]), agregados: agregados };
}

function bloqueObservacionEnvio_(envio) {
  if (!envio.observacion) return '';
  const etiqueta = envio.hora ? 'Observación · ' + envio.hora : 'Observación';
  return bloqueHistObservacion_(etiqueta, envio.observacion);
}

// NUEVO 23/07/2026 (con Osmar): chip de ícono + borde caramel más grueso para que la
// observación se note de un vistazo — antes era puro texto chico, fácil de saltarse.
// Compartido entre la observación del pedido (Pauta) y la del Historial de pautas.
function bloqueHistObservacion_(etiqueta, texto) {
  return '<div class="hist-observacion"><div class="hist-observacion-fila">' +
    '<div class="hist-observacion-icono"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg></div>' +
    '<div><p>' + etiqueta + '</p><p>' + texto + '</p></div>' +
  '</div></div>';
}

function pintarBarraProgreso_(hechos, total) {
  const cont = document.getElementById('pauta-progreso-wrap');
  if (!cont) return;
  if (pautaSoloLectura || !total) { cont.innerHTML = ''; return; }
  const pct = Math.round((hechos / total) * 100);
  cont.innerHTML =
    '<div class="pauta-progreso">' +
      '<div class="pauta-progreso-top"><span class="pauta-progreso-num">' + hechos + ' de ' + total + ' hechos</span>' +
      '<span class="pauta-progreso-faltan">' + (total - hechos ? 'faltan ' + (total - hechos) : 'todo listo') + '</span></div>' +
      '<div class="pauta-progreso-barra"><div class="pauta-progreso-relleno" style="width:' + pct + '%;"></div></div>' +
    '</div>';
}

function pintarAvisoPendientes_(hechos, total) {
  const el = document.getElementById('pauta-aviso-pendientes');
  if (!el) return;
  const faltan = total - hechos;
  if (pautaSoloLectura || !faltan) { el.style.display = 'none'; return; }
  el.style.display = '';
  el.innerHTML = '<p>Quedan ' + faltan + ' sin marcar</p><p>Al confirmar se cierran como pendientes.</p>';
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
  // NUEVO 23/07/2026 (con Osmar): la X gris de "quitar" un ítem de Cima se dio de baja —
  // no persistía (se limpiaba solo con recargar la pantalla) y prometía algo que no
  // cumplía. Lo no producido ya queda registrado de forma honesta como pendiente al
  // confirmar. Solo lo que ellas agregaron directo puede eliminarse de verdad.
  const esPropio = !it.conteoId;
  const botonQuitar = esPropio
    ? '<button class="pauta-quitar pauta-quitar-elimina" title="Eliminar" onclick="eliminarItemPropioPauta(\'' + it.id + '\')"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path></svg></button>'
    : '';
  return '<tr id="pauta-row-' + it.id + '"' + (hecho ? ' style="opacity:.65;"' : '') + '>' +
    '<td style="padding:9px 4px;width:30px;"><button class="pauta-check' + (hecho ? ' marcado' : '') + '" onclick="toggleHechoPauta(\'' + it.id + '\')" aria-label="Marcar hecho">' +
      (hecho ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg>' : '') +
    '</button></td>' +
    '<td style="padding:9px 6px;font-weight:700;">' + it.producto + (it.comentario ? '<div style="font-size:10.5px;color:var(--ink-soft);font-weight:400;margin-top:2px;">' + it.comentario + '</div>' : '') + '</td>' +
    '<td style="padding:6px;width:90px;"><input type="text" inputmode="numeric" value="' + cant + '" id="pauta-cant-' + it.id + '" onchange="cambiarCantidadBorradorPauta(\'' + it.id + '\',this.value)" style="width:70px;text-align:center;font-family:\'JetBrains Mono\',monospace;font-weight:700;border:1px solid var(--border);border-radius:7px;padding:6px 8px;"></td>' +
    '<td style="padding:9px 6px;width:34px;text-align:right;">' + botonQuitar + '</td></tr>';
}

function pintarPautaDesktop_(hechos, pendientes, mapaObs) {
  const cont = document.getElementById('pauta-lista');

  if (pautaSoloLectura) {
    if (!pendientes.length) {
      cont.innerHTML = '<p style="font-size:13.5px;color:var(--ink-soft);padding:24px 0;text-align:center;">No hay ítems pendientes.</p>';
      return;
    }
    const g = agruparPauta_(pendientes, mapaObs);
    let htmlLect = '';
    g.envios.forEach(envio => {
      htmlLect += '<p class="pauta-grupo-titulo">Pedido de Cima</p><table><tbody>' + envio.items.map(filaPautaDesktop_).join('') + '</tbody></table>';
    });
    if (g.agregados.length) {
      htmlLect += '<p class="pauta-grupo-titulo">Agregado acá</p><table><tbody>' + g.agregados.map(filaPautaDesktop_).join('') + '</tbody></table>';
    }
    cont.innerHTML = htmlLect;
    return;
  }

  if (!pendientes.length && !hechos.length) {
    cont.innerHTML = '<p style="font-size:13.5px;color:var(--ink-soft);padding:24px 0;text-align:center;">No hay pedidos pendientes en la pauta.</p>';
    return;
  }

  const g = agruparPauta_(pendientes, mapaObs);
  let html = '';
  if (!pendientes.length) {
    html += '<p style="font-size:13.5px;color:var(--ink-soft);padding:16px 0;text-align:center;">Todo marcado — revisa Hechos o confirma la producción.</p>';
  }
  if (g.envios.length) {
    html += '<p class="pauta-grupo-titulo">Pedido de Cima</p>';
    g.envios.forEach(envio => {
      html += bloqueObservacionEnvio_(envio) + '<table><tbody>' + envio.items.map(filaPautaDesktop_).join('') + '</tbody></table>';
    });
  }
  if (g.agregados.length) {
    html += '<p class="pauta-grupo-titulo">Agregado acá</p><table><tbody>' + g.agregados.map(filaPautaDesktop_).join('') + '</tbody></table>';
  }

  if (hechos.length) {
    html += '<button class="pauta-hechos-toggle" onclick="togglePautaHechos()">' +
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="transform:rotate(' + (pautaHechosAbierto ? '90' : '0') + 'deg);transition:transform .15s;"><path d="M9 18l6-6-6-6"></path></svg>' +
      '<span>Hechos</span><span class="pauta-hechos-badge">' + hechos.length + '</span></button>';
    if (pautaHechosAbierto) {
      html += '<table><tbody>' + hechos.map(filaPautaDesktop_).join('') + '</tbody></table>';
    }
  }
  cont.innerHTML = html;
}

function pintarPauta() {
  if (window.matchMedia('(min-width: 900px)').matches) {
    const visiblesD = cachePauta.pauta;
    const hechosD = visiblesD.filter(it => it.estadoBorrador === 'Hecho');
    const pendientesD = visiblesD.filter(it => it.estadoBorrador !== 'Hecho');
    pintarBarraProgreso_(hechosD.length, visiblesD.length);
    pintarAvisoPendientes_(hechosD.length, visiblesD.length);
    pintarPautaDesktop_(hechosD, pendientesD, mapaObservacionesPorEnvio_(visiblesD));
    return;
  }
  const cont = document.getElementById('pauta-lista');
  const visibles = cachePauta.pauta;
  const hechos = visibles.filter(it => it.estadoBorrador === 'Hecho');
  const pendientes = visibles.filter(it => it.estadoBorrador !== 'Hecho');
  const mapaObs = mapaObservacionesPorEnvio_(visibles);
  pintarBarraProgreso_(hechos.length, visibles.length);
  pintarAvisoPendientes_(hechos.length, visibles.length);

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
    // NUEVO 23/07/2026 (con Osmar): igual que en desktop — la X gris de "quitar" un ítem
    // de Cima se dio de baja (no persistía). Solo lo agregado a mano puede eliminarse.
    const esPropio = !it.conteoId;
    const botonQuitar = esPropio
      ? '<button class="pauta-quitar pauta-quitar-elimina" title="Eliminar" onclick="eliminarItemPropioPauta(\'' + it.id + '\')"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path></svg></button>'
      : '';
    return '<div class="pauta-row' + (hecho ? ' hecho' : '') + '" id="pauta-row-' + it.id + '">' +
      '<div class="pauta-row-top">' +
        '<button class="pauta-check' + (hecho ? ' marcado' : '') + '" onclick="toggleHechoPauta(\'' + it.id + '\')" aria-label="Marcar hecho">' +
          (hecho ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg>' : '') +
        '</button>' +
        '<span class="pauta-nombre">' + it.producto + '</span>' +
        '<input type="text" inputmode="numeric" value="' + cant + '" id="pauta-cant-' + it.id + '" onchange="cambiarCantidadBorradorPauta(\'' + it.id + '\',this.value)">' +
        botonQuitar +
      '</div>' +
      (it.comentario ? '<p class="pauta-obs">' + it.comentario + '</p>' : '') +
    '</div>';
  };

  if (pautaSoloLectura) {
    const g = agruparPauta_(pendientes, mapaObs);
    let htmlLect = '';
    g.envios.forEach(envio => { htmlLect += '<p class="pauta-grupo-titulo">Pedido de Cima</p>' + envio.items.map(filaHtml).join(''); });
    if (g.agregados.length) htmlLect += '<p class="pauta-grupo-titulo">Agregado acá</p>' + g.agregados.map(filaHtml).join('');
    cont.innerHTML = htmlLect;
    return;
  }

  const g = agruparPauta_(pendientes, mapaObs);
  let html = '';
  if (!pendientes.length) {
    html += '<p style="font-size:13.5px;color:var(--ink-soft);padding:16px 0;text-align:center;">Todo marcado — revisa Hechos o confirma la producción.</p>';
  }
  if (g.envios.length) {
    html += '<p class="pauta-grupo-titulo">Pedido de Cima</p>';
    g.envios.forEach(envio => { html += bloqueObservacionEnvio_(envio) + envio.items.map(filaHtml).join(''); });
  }
  if (g.agregados.length) {
    html += '<p class="pauta-grupo-titulo">Agregado acá</p>' + g.agregados.map(filaHtml).join('');
  }

  if (hechos.length) {
    html += '<button class="pauta-hechos-toggle" onclick="togglePautaHechos()">' +
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="transform:rotate(' + (pautaHechosAbierto ? '90' : '0') + 'deg);transition:transform .15s;"><path d="M9 18l6-6-6-6"></path></svg>' +
      '<span>Hechos</span><span class="pauta-hechos-badge">' + hechos.length + '</span></button>';
    if (pautaHechosAbierto) html += hechos.map(filaHtml).join('');
  }
  cont.innerHTML = html;
}

// NUEVO 22/07/2026 (con Osmar): eliminar desde la X, sin modal de motivo. Es un ítem que
// ellas mismas agregaron; si se equivocan lo vuelven a poner en dos toques con "+ Agregar
// producto", así que pedir un motivo sería fricción sin valor. Igual queda auditable en el
// Sheet como 'Eliminado', lo mismo que cuando elimina Rocío.
// El servidor puede rechazar (ítem del pedido, permiso insuficiente): en ese caso la fila
// NO se saca de la lista y el error se muestra en #pauta-error.
async function eliminarItemPropioPauta(id) {
  const err = document.getElementById('pauta-error');
  if (err) err.textContent = '';
  const r = await llamarAPI('eliminarItemPauta', {
    data: { id: id, motivo: 'Eliminado desde la pauta', responsable: sesion.nombre }
  });
  if (!r.ok) {
    if (err) err.textContent = r.error || 'No se pudo eliminar el producto';
    return;
  }
  cachePauta.pauta = cachePauta.pauta.filter(x => x.id !== id);
  const idx = pautaAgregadosSesion.indexOf(id);
  if (idx !== -1) pautaAgregadosSesion.splice(idx, 1);
  pintarPauta();
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
  irA('screen-pauta');
}

async function revisarPauta() {
  document.getElementById('pauta-error').textContent = '';
  const visibles = cachePauta.pauta;
  const completados = visibles.filter(it => it.estadoBorrador === 'Hecho');
  const faltantes = visibles.filter(it => it.estadoBorrador !== 'Hecho');
  if (!completados.length && !faltantes.length) {
    document.getElementById('pauta-error').textContent = 'No hay nada que confirmar.';
    return;
  }
  pintarResumenPauta(completados, faltantes);
  // El stock congelado de Vegan Corner se pide solo si hay empanadas que confirmar; en una
  // pauta de puros pasteles no se toca la red al pedo.
  if (completados.some(it => it.dual)) await cargarStockVC_();
  pintarDesgloseEmpanadas_(completados);
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

// ===== DESGLOSE HORNEADAS/CONGELADAS + STOCK VC (NUEVO 22/07/2026 — con Osmar) =====
// Por qué existe: EntregaDetalle guardaba solo "Empanada Pino Soya, 42" y no había forma
// de saber a cuál cubeta entró. Con eso, el movimiento de empanadas era incalculable y el
// sistema mostraba números falsos (ver mapaMovimiento_ en Produccion.gs).
// Solo aparece para los productos que el catálogo tiene con las dos categorías; el resto
// de la pauta no cambia en nada.
let desgloseEmpanadas = {};   // { programaId: {horneadas, congeladas} }
let stockVCBorrador = {};     // { producto: cantidad } — reserva que queda en Vegan Corner

function pintarDesgloseEmpanadas_(completados) {
  const duales = completados.filter(it => it.dual);
  const wrap = document.getElementById('desglose-empanadas-wrap');
  const wrapVC = document.getElementById('stock-vc-wrap');
  if (!duales.length) {
    wrap.style.display = 'none'; wrapVC.style.display = 'none';
    desgloseEmpanadas = {}; stockVCBorrador = {};
    return;
  }
  wrap.style.display = '';
  desgloseEmpanadas = {};
  document.getElementById('desglose-empanadas-lista').innerHTML = duales.map(it => {
    const total = it.cantidadBorrador !== null && it.cantidadBorrador !== undefined ? it.cantidadBorrador : it.cantidadProgramada;
    desgloseEmpanadas[it.id] = { horneadas: 0, congeladas: 0 };
    return '<div class="desglose-fila">' +
      '<p class="desglose-nombre">' + it.producto + '</p>' +
      '<div class="desglose-campos">' +
        '<div class="desglose-campo"><label>Horneadas</label>' +
          '<input type="number" min="0" id="dg-h-' + it.id + '" value="0" oninput="cambiarDesglose_(\'' + it.id + '\',\'horneadas\',this.value,' + total + ')"></div>' +
        '<div class="desglose-campo"><label>Congeladas</label>' +
          '<input type="number" min="0" id="dg-c-' + it.id + '" value="0" oninput="cambiarDesglose_(\'' + it.id + '\',\'congeladas\',this.value,' + total + ')"></div>' +
      '</div>' +
      '<p class="desglose-suma" id="dg-s-' + it.id + '">Total 0 · faltan ' + total + ' de las ' + total + ' producidas</p>' +
    '</div>';
  }).join('');

  // Stock congelado que QUEDA en Vegan Corner. Es un dato distinto del desglose: el
  // desglose es lo que sale hacia Cima, esto es la reserva de acá. No se puede deducir de
  // las entregas (Vegan Corner también produce y vende directo), por eso se declara.
  // Aparece en este momento porque es cuando Katherine tiene el congelador a la vista.
  wrapVC.style.display = '';
  const productos = [...new Set(duales.map(it => it.producto))];
  stockVCBorrador = {};
  document.getElementById('stock-vc-lista').innerHTML = productos.map(prod => {
    const actual = (cacheStockVC && cacheStockVC[prod] !== undefined) ? cacheStockVC[prod] : 0;
    stockVCBorrador[prod] = actual;
    return '<div class="stockvc-fila">' +
      '<span class="stockvc-nombre">' + prod + '</span>' +
      '<input type="number" min="0" value="' + actual + '" oninput="cambiarStockVC_(\'' + prod.replace(/'/g, "\\'") + '\',this.value)">' +
    '</div>';
  }).join('');
}

function cambiarDesglose_(id, campo, valor, total) {
  if (!desgloseEmpanadas[id]) desgloseEmpanadas[id] = { horneadas: 0, congeladas: 0 };
  desgloseEmpanadas[id][campo] = Number(valor) || 0;
  const suma = desgloseEmpanadas[id].horneadas + desgloseEmpanadas[id].congeladas;
  const el = document.getElementById('dg-s-' + id);
  // No bloquea: puede haber merma legítima (se quemó una tanda). Solo avisa.
  if (suma === total) el.className = 'desglose-suma ok', el.textContent = 'Total ' + suma + ' · coincide con lo producido';
  else if (suma < total) el.className = 'desglose-suma alerta', el.textContent = 'Total ' + suma + ' · faltan ' + (total - suma) + ' de las ' + total + ' producidas';
  else el.className = 'desglose-suma alerta', el.textContent = 'Total ' + suma + ' · ' + (suma - total) + ' más que las ' + total + ' producidas';
}

function cambiarStockVC_(producto, valor) {
  stockVCBorrador[producto] = Number(valor) || 0;
}

let cacheStockVC = null; // { producto: stockActual } — para precargar los campos

async function cargarStockVC_() {
  const r = await llamarAPISilencioso('obtenerStockCongeladoVC', {});
  cacheStockVC = {};
  if (r && r.ok) (r.stock || []).forEach(s => { cacheStockVC[s.producto] = s.stockActual; });
}

async function confirmarProduccion() {
  document.getElementById('resumen-pauta-error').textContent = '';
  const r = await llamarAPI('confirmarPauta', { data: { responsable: sesion.nombre, agregadosIds: pautaAgregadosSesion, observacion: pautaObservacionBorrador, desglose: desgloseEmpanadas } });
  if (!r.ok) { document.getElementById('resumen-pauta-error').textContent = r.error || 'Error al confirmar producción'; return; }

  // El stock de Vegan Corner se guarda después de confirmar y en silencio: si falla, la
  // producción ya quedó registrada, que es lo que no se puede perder.
  Object.keys(stockVCBorrador).forEach(prod => {
    llamarAPISilencioso('actualizarStockCongeladoVC', { data: { producto: prod, stockActual: stockVCBorrador[prod], responsable: sesion.nombre } });
  });
  desgloseEmpanadas = {}; stockVCBorrador = {}; cacheStockVC = null;

  cachePauta = null; pautaAgregadosSesion = []; pautaObservacionBorrador = '';
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
      (h.observacion ? bloqueHistObservacion_('Observación', h.observacion) : '') +
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
    if (pedidoModo === 'conteo' && cacheRevision && cacheRevision.items && cacheRevision.items.length) pintarRevisionPedido();
    if (pedidoModo === 'cero' && cacheCatalogoCompleto) pintarCero();
  }
  if (activa('screen-pauta') && cachePauta) pintarPauta();
});


// ============ CONFIRMAR RECEPCIÓN — NUEVO 22/07/2026 (con Osmar) ============
// Bloque que aparece ARRIBA de las categorías en la pantalla de Conteo de Cima, y solo si
// hay entregas de Vegan Corner sin confirmar. Los días normales no existe: sin pendientes,
// el contenedor queda vacío y la pantalla se ve exactamente igual que antes.
//
// No aplica a Vegan Corner: Rosa/Katherine son quienes ENTREGAN, no quienes reciben.
//
// Al confirmar NO se navega a screen-confirm (como sí hace confirmarGuardarConteo): el
// conteo puede estar a medio hacer y sacar a la persona de la pantalla perdería lo contado
// en memoria. El resultado se muestra en el mismo bloque, que se reemplaza por una línea
// de confirmación.
let recepcionPendiente = null;    // { items:[{fila, programaId, producto, cantidadEntregada}], responsable, fecha }
let recepcionCantidades = {};     // fila de EntregaDetalle -> cantidad que se va a confirmar

// CORRECCIÓN 22/07/2026 (con Osmar): esta función fallaba en silencio. Cualquier problema
// — API caída, acción no desplegada, contenedor ausente, error al dibujar — terminaba en
// un `return` mudo que dejaba el contenedor vacío. Un fallo real y "no hay entregas
// pendientes" se veían exactamente igual, y eso costó una tarde de diagnóstico a ciegas.
// Ahora el único caso que borra el contenedor sin decir nada es el legítimo: no hay nada
// pendiente. Todo lo demás se muestra en pantalla y se registra en consola.
function avisoRecepcionHtml_(mensaje) {
  return '<div class="recep-bloque"><p class="error-msg" style="margin:0;">Recepción: ' + mensaje + '</p></div>';
}

async function cargarRecepcionPendiente_() {
  const cont = document.getElementById('conteo-recepcion');
  if (!cont) { console.error('[recepcion] no existe #conteo-recepcion en el DOM — index.html desactualizado'); return; }
  recepcionPendiente = null;
  recepcionCantidades = {};
  if (esVeganCorner_()) { cont.innerHTML = ''; return; }

  let r;
  try {
    r = await llamarAPISilencioso('obtenerEntregasPendientesRecepcion');
  } catch (e) {
    console.error('[recepcion] excepción al llamar la API:', e);
    cont.innerHTML = avisoRecepcionHtml_('no se pudo consultar al servidor (' + e.message + ')');
    return;
  }
  console.log('[recepcion] respuesta de la API:', r);

  if (!r) { cont.innerHTML = avisoRecepcionHtml_('el servidor no respondió.'); return; }
  if (!r.ok) { cont.innerHTML = avisoRecepcionHtml_(r.error || 'el servidor respondió con error.'); return; }
  if (!r.items || !r.items.length) { cont.innerHTML = ''; return; }   // único vaciado legítimo

  recepcionPendiente = r;
  // Prellenado con lo declarado por Vegan Corner. La persona en Cima ajusta solo si llegó
  // distinto — el caso normal es tocar nada y confirmar.
  r.items.forEach(it => { recepcionCantidades[it.fila] = it.cantidadEntregada; });
  try {
    pintarBloqueRecepcion_();
    console.log('[recepcion] bloque dibujado con ' + r.items.length + ' productos');
  } catch (e) {
    console.error('[recepcion] error al dibujar:', e);
    cont.innerHTML = avisoRecepcionHtml_('error al dibujar el bloque (' + e.message + ')');
  }
}

function pintarBloqueRecepcion_() {
  const cont = document.getElementById('conteo-recepcion');
  if (!cont || !recepcionPendiente) return;
  const r = recepcionPendiente;
  const sub = [r.responsable, r.fecha].filter(x => x).join(' · ');

  let filas = '';
  r.items.forEach(it => {
    const val = recepcionCantidades[it.fila] !== undefined ? recepcionCantidades[it.fila] : it.cantidadEntregada;
    filas += '<div class="recep-row">' +
      '<span>' + it.producto + '</span>' +
      '<div class="conteo-stepper">' +
        '<button type="button" onclick="cambiarCantidadRecepcion(' + it.fila + ',-1)">\u2212</button>' +
        '<input type="number" min="0" id="recep-in-' + it.fila + '" value="' + val + '" oninput="escribirCantidadRecepcion(' + it.fila + ',this.value)">' +
        '<button type="button" onclick="cambiarCantidadRecepcion(' + it.fila + ',1)">+</button>' +
      '</div>' +
    '</div>';
  });

  cont.innerHTML = '<div class="recep-bloque">' +
    '<div class="recep-cab">' +
      '<div class="recep-titulo serif">Confirmar recepción</div>' +
      (sub ? '<div class="recep-sub">' + sub + '</div>' : '') +
    '</div>' +
    filas +
    '<textarea id="recep-obs" class="recep-obs" rows="2" placeholder="Observación sobre este pedido (opcional) — se avisa a Vegan Corner"></textarea>' +
    '<p class="error-msg" id="recep-error" style="margin:0 0 8px;"></p>' +
    '<button class="btn-primary" onclick="confirmarRecepcion()">Confirmar recepción</button>' +
  '</div>';
}

// Se toca solo el input de esa fila, nunca se repinta el bloque entero: un repintado
// borraría lo que la persona ya escribió en el campo de observación.
function cambiarCantidadRecepcion(fila, delta) {
  const actual = Number(recepcionCantidades[fila]) || 0;
  const nueva = Math.max(0, actual + delta);
  recepcionCantidades[fila] = nueva;
  const input = document.getElementById('recep-in-' + fila);
  if (input) input.value = nueva;
}

function escribirCantidadRecepcion(fila, valor) {
  const n = Number(valor);
  recepcionCantidades[fila] = (valor === '' || isNaN(n) || n < 0) ? 0 : n;
}

async function confirmarRecepcion() {
  if (!recepcionPendiente) return;
  const err = document.getElementById('recep-error');
  if (err) err.textContent = '';
  const obsEl = document.getElementById('recep-obs');
  const items = recepcionPendiente.items.map(it => ({
    fila: it.fila,
    cantidadRecibida: Number(recepcionCantidades[it.fila]) || 0
  }));
  const r = await llamarAPI('confirmarRecepcionEntregas', {
    data: { responsable: sesion.nombre, items: items, observacion: obsEl ? obsEl.value : '' }
  });
  if (!r.ok) {
    if (err) err.textContent = r.error || 'Error al confirmar la recepción';
    return;
  }
  const n = r.confirmados || items.length;
  recepcionPendiente = null;
  recepcionCantidades = {};
  const cont = document.getElementById('conteo-recepcion');
  if (cont) cont.innerHTML = '<p class="recep-listo">Recepción confirmada \u00b7 ' + n + ' producto' + (n === 1 ? '' : 's') + '</p>';
}
