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
// NUEVO 24/07/2026 (con Osmar — precarga del Conteo): valor de ARRANQUE de cada producto,
// o sea lo que se contó/guardó la última vez. Sirve para dos cosas: sembrar los inputs al
// abrir (en vez de 0) y saber, en cada fila, si la cantidad actual se ajustó o quedó igual
// (lo que pinta el indicador azul y el "deshacer"). Es un espejo de solo lectura de la
// precarga — conteoCantidades sí cambia con cada toque, esto no.
let conteoValorArranque = {};             // clave "productoProduccion|categoria" -> cantidad de referencia

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

// NUEVO 24/07/2026 (con Osmar — precarga del Conteo): el conteo deja de arrancar en 0.
// Cada producto parte con lo que se contó/guardó la última vez, y contar pasa a ser
// "confirmar lo que sigue igual y ajustar lo que se movió".
//
// La fuente del valor de arranque depende del negocio:
//   · Cima          -> ultimoConteo.cantidad (última fila de ConteoStockCima)
//   · Vegan Corner  -> stockCongeladoVC (stock actual en la hoja StockCongeladoVC)
// Ambos vienen ya en el catálogo (ver obtenerCatalogoProduccion en Produccion.gs).
//
// Siembra TANTO conteoValorArranque (referencia fija, para el indicador de ajuste) COMO
// conteoCantidades (lo editable, que arranca igual a la referencia). El borrador NO pasa
// por acá: si hay uno, ofrecerBorradorConteo_ lo restaura y pisa esto — y así debe ser,
// porque un conteo a medias es más nuevo que el último cerrado (ver nota del borrador).
function valorArranqueProducto_(p) {
  if (esVeganCorner_()) return Number(p.stockCongeladoVC) || 0;
  return p.ultimoConteo ? (Number(p.ultimoConteo.cantidad) || 0) : 0;
}

function precargarConteo_() {
  conteoValorArranque = {};
  conteoCantidades = {};
  if (!cacheConteoCatalogo) return;
  cacheConteoCatalogo.catalogo.forEach(p => {
    const key = p.productoProduccion + '|' + p.categoria;
    const arranque = valorArranqueProducto_(p);
    conteoValorArranque[key] = arranque;
    conteoCantidades[key] = arranque;
  });
}

// Una fila está "ajustada" cuando su cantidad actual difiere del valor de arranque. Si no
// hay arranque registrado (producto nuevo, sin conteo previo) el arranque es 0 y cualquier
// número > 0 cuenta como ajuste — que es lo correcto: se está declarando algo por primera vez.
function conteoAjustado_(key) {
  const arr = conteoValorArranque[key];
  if (arr === undefined) return (conteoCantidades[key] || 0) !== 0;
  return (conteoCantidades[key] || 0) !== arr;
}

async function abrirConteo(forzar) {
  // REDISEÑO 24/07/2026 (con Osmar): el flujo de apertura cambia de "todo mezclado en la
  // pantalla de conteo" a una SECUENCIA con prioridad:
  //   1. ¿Hay una entrega de Vegan Corner pendiente de recepción? → pantalla propia primero.
  //   2. Recién después (o si se pospone) → el conteo, o el modal de borrador si hay uno.
  // Y la velocidad, bien puesta: mientras la persona lee/decide la recepción, el catálogo del
  // conteo se carga EN PARALELO de fondo (precargaConteoPromesa_), así al salir de recepción
  // el conteo ya está listo, sin la espera secuencial que había antes.
  //
  // Vegan Corner no recepciona (no reciben entregas de sí mismos): para ellos, directo al
  // conteo, igual que antes.
  //
  // NUEVO 28/07/2026 (con Osmar): candado anti doble-toque. El chequeo de recepción es una
  // llamada al servidor; hasta que volvía, no cambiaba nada en pantalla y la gente tocaba
  // "Contar stock" una y otra vez, apilando llamadas. El candado ignora los toques repetidos
  // mientras la apertura está en curso.
  if (abrirConteoEnCurso_) return;
  abrirConteoEnCurso_ = true;
  try {
    if (forzar && Object.keys(conteoCantidades).length) await guardarBorradorConteo_();
    const necesitaCatalogo = !cacheConteoCatalogo || forzar;

    // Dispara la carga del catálogo YA, sin await — corre de fondo mientras se decide la
    // recepción. Si no hace falta recargarlo, la promesa resuelve al toque.
    precargaConteoPromesa_ = necesitaCatalogo ? cargarCatalogoConteo_() : Promise.resolve(true);

    // La recepción solo aplica a Cima. Se consulta antes de decidir a qué pantalla ir.
    if (!esVeganCorner_()) {
      // NUEVO 28/07/2026 (con Osmar): con overlay. Antes era silencioso y el toque se sentía
      // muerto durante toda la ida y vuelta al servidor. Feedback inmediato = no vuelven a tocar.
      let rec = null;
      const ov = document.getElementById('loading-overlay');
      if (ov) ov.classList.add('active');
      try { rec = await llamarAPISilencioso('obtenerEntregasPendientesRecepcion'); }
      catch (e) { rec = null; }
      finally { if (ov) ov.classList.remove('active'); }
      if (rec && rec.ok && rec.items && rec.items.length) {
        mostrarPantallaRecepcion_(rec);
        return; // el conteo se abre desde las salidas de la pantalla de recepción
      }
    }
    await entrarAlConteo_();
  } finally {
    abrirConteoEnCurso_ = false;
  }
}
let abrirConteoEnCurso_ = false;   // candado de abrirConteo (anti doble-toque)

// Carga el catálogo del conteo y siembra la precarga. Separada de abrirConteo para poder
// dispararla en paralelo. Devuelve true si quedó lista, false si falló.
async function cargarCatalogoConteo_() {
  const r = await llamarAPISilencioso('obtenerCatalogoProduccion', { soloConteo: true });
  if (!r || !r.ok) return false;
  cacheConteoCatalogo = r;
  conteoCategoriasActivas = esVeganCorner_() ? new Set(['Empanadas Congeladas']) : new Set();
  precargarConteo_();
  return true;
}

// Abre la pantalla de conteo propiamente tal: espera a que el catálogo (que venía cargando
// de fondo) esté listo, pinta, y ofrece el borrador si hay uno. Es el destino común de las
// dos salidas de la recepción y del caso sin recepción.
async function entrarAlConteo_() {
  irA('screen-conteo');
  document.getElementById('btn-retiro-vc').style.display = tienePermisoLocal('RegistrarConteo') ? '' : 'none';
  document.getElementById('conteo-chips').innerHTML = skeletonCards(1);
  document.getElementById('conteo-lista').innerHTML = skeletonCards(4);
  const ok = await (precargaConteoPromesa_ || Promise.resolve(false));
  if (!ok && !cacheConteoCatalogo) {
    document.getElementById('conteo-lista').innerHTML = '<p class="error-msg">Error al cargar el catálogo. Toca el botón de recargar.</p>';
    return;
  }
  if (document.getElementById('screen-conteo').classList.contains('active')) pintarConteo();
  await ofrecerBorradorConteo_();
}

let precargaConteoPromesa_ = null;   // promesa de carga del catálogo, corriendo de fondo

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
    '<button class="btn-secondary" onclick="descartarBorradorConteo()">Comenzar de nuevo</button>'
  );
}

function retomarBorradorConteo() {
  const b = borradorConteoPendiente;
  if (!b) { cerrarModal(); return; }
  // El borrador trae lo que se IBA contando: eso va a conteoCantidades (lo editable). Pero
  // el valor de arranque (la referencia para el indicador de ajuste) sigue siendo el último
  // conteo cerrado, no el borrador — así, al retomar, el azul marca lo que ya venía movido
  // respecto de la última vez. precargarConteo_ ya dejó conteoValorArranque sembrado con eso;
  // acá solo se pisa conteoCantidades con el borrador.
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
      '<button class="btn-secondary" onclick="descartarBorradorConteo(true)">Sí, comenzar de nuevo</button>'
    );
    return;
  }
  await llamarAPISilencioso('limpiarBorradorConteo', { negocio: negocioConteo_() });
  borradorConteoPendiente = null;
  // "Comenzar de nuevo" descarta el borrador y vuelve a la precarga del último conteo — NO
  // deja todo en 0. Con el nuevo modelo, arrancar de nuevo significa partir desde lo último
  // guardado, igual que una apertura limpia sin borrador.
  precargarConteo_();
  cerrarModal();
  pintarConteo();
}

// Bloque de referencia bajo el nombre del producto en la pantalla de Conteo. Muestra el
// valor de arranque (lo último contado/guardado) y, si la fila se ajustó, un "deshacer"
// que la devuelve a ese valor. Reemplaza al viejo refUltimoConteoHtml_ solo en el pintado
// nuevo — el desktop de VerPrograma sigue usando aquel para su columna aparte.
function refArranqueHtml_(p, key, keyEsc) {
  const arr = conteoValorArranque[key];
  let ref;
  if (esVeganCorner_()) {
    ref = arr ? 'Guardado: ' + arr : 'Sin stock previo';
  } else if (p.ultimoConteo) {
    ref = 'Últ: ' + p.ultimoConteo.cantidad + ' · ' + p.ultimoConteo.fecha;
  } else {
    ref = 'Sin conteo previo';
  }
  let html = '<span class="conteo-ref">' + ref;
  if (conteoAjustado_(key)) {
    html += ' <button type="button" class="conteo-deshacer" onclick="deshacerConteo_(\'' + keyEsc + '\')">deshacer</button>';
  }
  html += '</span>';
  return html;
}

// NUEVO 20/07/2026 (con Osmar — "revisar el último conteo", Opción B): texto de
// referencia neutro, sin alertas ni resaltado (decisión explícita de Osmar).
function refUltimoConteoHtml_(p) {
  if (!p.ultimoConteo) return '<span style="font-size:11px;color:var(--ink-soft);">Sin conteo previo</span>';
  return '<span style="font-size:11px;color:var(--ink-soft);">Últ: ' + p.ultimoConteo.cantidad + ' · ' + p.ultimoConteo.fecha + '</span>';
}
function filaConteoDesktop_(p, key, val, keyEsc, incluirUltimo) {
  const ajustado = conteoAjustado_(key);
  return '<tr class="' + (ajustado ? 'conteo-fila-ajustada' : '') + '"><td style="padding:9px 6px;font-weight:600;color:var(--ink);">' + p.nombre + '</td>' +
    '<td style="padding:9px 6px;">' + p.categoria + '</td>' +
    (incluirUltimo ? '<td style="padding:9px 6px;">' + refArranqueHtml_(p, key, keyEsc) + '</td>' : '') +
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
  html += barraResumenConteo_(productos);
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
      html += '<div class="conteo-row' + (conteoAjustado_(key) ? ' ajustado' : '') + '" style="flex-wrap:wrap;">' +
        '<span>' + p.nombre + '<br>' + refArranqueHtml_(p, key, keyEsc) + '</span>' +
        '<div class="conteo-stepper">' +
          '<button type="button" onclick="cambiarCantidadConteo(\'' + keyEsc + '\',-1)">\u2212</button>' +
          '<input type="number" min="0" value="' + val + '" oninput="escribirCantidadConteo(\'' + keyEsc + '\',this.value)">' +
          '<button type="button" onclick="cambiarCantidadConteo(\'' + keyEsc + '\',1)">+</button>' +
        '</div>' +
      '</div>';
    });
    document.getElementById('conteo-lista').innerHTML = (html + barraResumenConteo_(productos)) || '<p style="font-size:13.5px;color:var(--ink-soft);padding:24px 0;text-align:center;">No hay empanadas configuradas para contar.</p>';
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
  const productosVisibles = [];
  categorias.filter(c => conteoCategoriasActivas.has(c)).forEach(cat => {
    const productos = cacheConteoCatalogo.catalogo.filter(p => p.categoria === cat);
    if (!productos.length) return;
    html += '<p class="conteo-seccion-titulo">' + cat + '</p>';
    productos.forEach(p => {
      productosVisibles.push(p);
      const key = p.productoProduccion + '|' + p.categoria;
      const val = conteoCantidades[key] !== undefined ? conteoCantidades[key] : 0;
      const keyEsc = key.replace(/'/g, "\\'");
      html += '<div class="conteo-row' + (conteoAjustado_(key) ? ' ajustado' : '') + '" style="flex-wrap:wrap;">' +
        '<span>' + p.nombre + '<br>' + refArranqueHtml_(p, key, keyEsc) + '</span>' +
        '<div class="conteo-stepper">' +
          '<button type="button" onclick="cambiarCantidadConteo(\'' + keyEsc + '\',-1)">\u2212</button>' +
          '<input type="number" min="0" value="' + val + '" oninput="escribirCantidadConteo(\'' + keyEsc + '\',this.value)">' +
          '<button type="button" onclick="cambiarCantidadConteo(\'' + keyEsc + '\',1)">+</button>' +
        '</div>' +
      '</div>';
    });
  });
  if (!html) { document.getElementById('conteo-lista').innerHTML = '<p style="font-size:13.5px;color:var(--ink-soft);padding:24px 0;text-align:center;">Elige qué categoría(s) vas a contar.</p>'; return; }
  document.getElementById('conteo-lista').innerHTML = html + barraResumenConteo_(productosVisibles);
}

// Barra de cierre: cuántos productos se ajustaron y cuántos quedaron confirmados sin
// cambio. Da la sensación de "revisé todo" y no obliga a recordar qué se tocó. "Confirmado
// sin cambio" no es lo mismo que "no lo miré" — el modelo asume que dejar el valor de
// arranque ES confirmarlo, que es justo el punto del rediseño.
function barraResumenConteo_(productos) {
  if (!productos.length) return '';
  let ajustados = 0;
  productos.forEach(p => { if (conteoAjustado_(p.productoProduccion + '|' + p.categoria)) ajustados++; });
  const sinCambio = productos.length - ajustados;
  return '<div class="conteo-resumen-barra">' +
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--forest)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg>' +
    '<span><b>' + ajustados + '</b> ajustado' + (ajustados === 1 ? '' : 's') + ' · ' + sinCambio + ' confirmado' + (sinCambio === 1 ? '' : 's') + ' sin cambio</span>' +
  '</div>';
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
// Devuelve una fila a su valor de arranque (lo último contado/guardado). Aparece solo
// cuando la fila está ajustada — es la salida rápida si se tocó por error.
function deshacerConteo_(key) {
  conteoCantidades[key] = conteoValorArranque[key] !== undefined ? conteoValorArranque[key] : 0;
  pintarConteo();
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

// Banner verde de éxito tras guardar el stock congelado de VC. Reusa la clase real
// .ivc-cerrado-banner (verde de "guardado/cerrado" ya usada en el sistema). Trae el botón
// "Volver al inicio"; si no se toca nada, se auto-oculta a los 3s y deja al usuario en la
// pantalla de Contar stock ya actualizada. El timer se guarda para no encimar dos.
let bannerStockOkTimer_ = null;
function mostrarBannerStockOk_() {
  const cont = document.getElementById('conteo-banner-ok');
  if (!cont) return;
  cont.innerHTML =
    '<div class="ivc-cerrado-banner" style="justify-content:space-between;">' +
      '<div style="display:flex;align-items:center;gap:10px;">' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#27500A" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"></path></svg>' +
        '<div><b>Guardado con éxito</b><span>Tu stock quedó actualizado.</span></div>' +
      '</div>' +
      '<button class="aviso-accion" onclick="irA(\'screen-home\')">Volver al inicio</button>' +
    '</div>';
  cont.style.display = '';
  if (bannerStockOkTimer_) clearTimeout(bannerStockOkTimer_);
  bannerStockOkTimer_ = setTimeout(() => { cont.style.display = 'none'; cont.innerHTML = ''; }, 3000);
}

async function confirmarGuardarConteo() {
  document.getElementById('resumen-conteo-error').textContent = '';

  if (resumenConteoOrigenVC) {
    // GUARDADO EN LOTE (03/08/2026, con Osmar): antes esto era un bucle de N llamadas HTTP
    // en serie (una por empanada) + limpiarBorrador — el "carga largo". Ahora es UNA sola
    // llamada con todas las empanadas. El guardado en lote se mantiene: esto NO se toca acá.
    const items = resumenConteoProductos.map(p => ({ producto: p.productoProduccion, stockActual: p.cantidadContada }));
    const r = await llamarAPI('actualizarStockCongeladoVCLote', { data: { items: items, responsable: sesion.nombre } });
    if (!r.ok) { document.getElementById('resumen-conteo-error').textContent = r.error || 'Error al guardar el stock'; return; }
    conteoCantidades = {};
    await llamarAPISilencioso('limpiarBorradorConteo', { negocio: negocioConteo_() });
    // CORREGIDO 06/08/2026 (con Osmar): el fix del 03/08 saltaba directo de vuelta a
    // Contar stock con un banner de 3s — Osmar no pidió eso, solo pidió que el guardado
    // fuera más rápido. Se restaura el feedback de screen-confirm (mismo componente que usa
    // el conteo de Cima), sin botón "Otro" — solo "Volver al inicio", como Cima.
    // El catálogo se sigue invalidando para que la próxima vez que se entre a Contar stock
    // los valores estén al día, pero ya NO se recarga de inmediato (sin await) — así no se
    // pierde la velocidad ganada con el guardado en lote.
    cacheConteoCatalogo = null;
    document.getElementById('confirm-title').textContent = 'Stock guardado';
    document.getElementById('confirm-msg').textContent = 'Se actualizó el stock de ' + items.length + ' producto' + (items.length === 1 ? '' : 's') + '.';
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

// ============ RETIRO HACIA VEGAN CORNER (NUEVO 23/07/2026, con Osmar) ============
// Unidades que salen del stock físico de Cima para completar una venta al por mayor de
// Vegan Corner — modelo de consignación, Caso B (ver conversación con Osmar 23/07/2026).
// Mismo patrón visual que "Desde cero": categorías + productos marcados arriba + Ver más,
// SIN buscador escondido — acá no hay una lista previa que proteger, siempre se arma desde
// cero, así que ocultar el catálogo detrás de un botón solo agrega un toque de más.
// Solo lo ejecuta quien tiene el stock físico delante (permiso RegistrarConteo, mismo que
// Contar stock) — no depende de que Vegan Corner sepa nada de esto en el momento.
let retiroVCCategoriasActivas = new Set();
let retiroVCCantidades = {};    // "productoProduccion|categoria" -> cantidad
let retiroVCVerMas = new Set();
let retiroVCCliente = '';

async function abrirRetiroVC() {
  irA('screen-retiro-vc');
  retiroVCCategoriasActivas = new Set();
  retiroVCCantidades = {};
  retiroVCVerMas = new Set();
  retiroVCCliente = '';
  const selCliente = document.getElementById('retiro-vc-cliente');
  selCliente.innerHTML = '<option value="">— sin cliente —</option>';
  const fechaInput = document.getElementById('retiro-vc-fecha');
  const ahora = new Date();
  fechaInput.value = ahora.getFullYear() + '-' + String(ahora.getMonth() + 1).padStart(2, '0') + '-' + String(ahora.getDate()).padStart(2, '0') +
    'T' + String(ahora.getHours()).padStart(2, '0') + ':' + String(ahora.getMinutes()).padStart(2, '0');
  document.getElementById('retiro-vc-error').textContent = '';
  llamarAPISilencioso('listarClientes', {}).then(r => {
    if (r.ok) selCliente.innerHTML += (r.clientes || []).map(c => { const et = c.alias || c.nombre; return '<option value="' + et + '">' + et + '</option>'; }).join('');
  });
  if (!cacheCatalogoCompleto) {
    document.getElementById('retiro-vc-chips').innerHTML = skeletonCards(1);
    document.getElementById('retiro-vc-lista').innerHTML = skeletonCards(3);
    await cargarCatalogoCompletoProduccion_();
  }
  pintarRetiroVC();
}
function toggleCategoriaRetiroVC(cat) {
  if (retiroVCCategoriasActivas.has(cat)) retiroVCCategoriasActivas.delete(cat); else retiroVCCategoriasActivas.add(cat);
  pintarRetiroVC();
}
function cambiarCantidadRetiroVC(key, signo) {
  const productoProduccion = key.split('|')[0];
  const paso = pasoDe_(productoProduccion);
  const actual = retiroVCCantidades[key] !== undefined ? retiroVCCantidades[key] : 0;
  retiroVCCantidades[key] = Math.max(0, actual + signo * paso);
  pintarRetiroVC();
}
function escribirCantidadRetiroVC(key, val) {
  retiroVCCantidades[key] = Math.max(0, Number(val) || 0);
}
function toggleVerMasRetiroVC(cat) {
  if (retiroVCVerMas.has(cat)) retiroVCVerMas.delete(cat); else retiroVCVerMas.add(cat);
  pintarRetiroVC();
}
function cambiarClienteRetiroVC(val) { retiroVCCliente = val; }

function filaProductoRetiroVC_(p) {
  const key = p.productoProduccion + '|' + p.categoria;
  const val = retiroVCCantidades[key] !== undefined ? retiroVCCantidades[key] : 0;
  const keyEsc = key.replace(/'/g, "\\'");
  return '<div class="revision-row">' +
    '<div class="revision-row-top">' +
      '<span>' + p.nombre + '</span>' +
      '<div class="conteo-stepper">' +
        '<button type="button" onclick="cambiarCantidadRetiroVC(\'' + keyEsc + '\',-1)">\u2212</button>' +
        '<input type="number" min="0" value="' + val + '" oninput="escribirCantidadRetiroVC(\'' + keyEsc + '\',this.value)">' +
        '<button type="button" onclick="cambiarCantidadRetiroVC(\'' + keyEsc + '\',1)">+</button>' +
      '</div>' +
    '</div>' +
  '</div>';
}
function filaProductoRetiroVCDesktop_(p) {
  const key = p.productoProduccion + '|' + p.categoria;
  const val = retiroVCCantidades[key] !== undefined ? retiroVCCantidades[key] : 0;
  const keyEsc = key.replace(/'/g, "\\'");
  return '<tr><td style="padding:9px 6px;font-weight:700;">' + p.nombre + '</td>' +
    '<td style="padding:6px;text-align:center;"><div class="conteo-stepper" style="display:inline-flex;">' +
      '<button type="button" onclick="cambiarCantidadRetiroVC(\'' + keyEsc + '\',-1)">\u2212</button>' +
      '<input type="number" min="0" value="' + val + '" oninput="escribirCantidadRetiroVC(\'' + keyEsc + '\',this.value)">' +
      '<button type="button" onclick="cambiarCantidadRetiroVC(\'' + keyEsc + '\',1)">+</button>' +
    '</div></td></tr>';
}
function pintarRetiroVCDesktop_() {
  const categorias = [...new Set(cacheCatalogoCompleto.catalogo.map(p => p.categoria))];
  document.getElementById('retiro-vc-chips').innerHTML = categorias.map(c => {
    const activo = retiroVCCategoriasActivas.has(c);
    return '<span class="chip-cat' + (activo ? ' activo' : '') + '" onclick="toggleCategoriaRetiroVC(\'' + c.replace(/'/g, "\\'") + '\')">' + c + '</span>';
  }).join('');
  let html = '';
  categorias.filter(c => retiroVCCategoriasActivas.has(c)).forEach(cat => {
    const productosCat = cacheCatalogoCompleto.catalogo.filter(p => p.categoria === cat);
    if (!productosCat.length) return;
    const marcados = productosCat.filter(p => p.marcado);
    const noMarcados = productosCat.filter(p => !p.marcado);
    html += '<p class="conteo-seccion-titulo">' + cat + '</p><table><tbody>';
    html += marcados.map(filaProductoRetiroVCDesktop_).join('');
    html += '</tbody></table>';
    if (noMarcados.length) {
      if (retiroVCVerMas.has(cat)) {
        html += '<table><tbody>' + noMarcados.map(filaProductoRetiroVCDesktop_).join('') + '</tbody></table>';
      } else {
        html += '<button type="button" class="btn-vermas-cat" onclick="toggleVerMasRetiroVC(\'' + cat.replace(/'/g, "\\'") + '\')">Ver más de ' + cat + '</button>';
      }
    }
  });
  if (!html) html = '<p style="font-size:13.5px;color:var(--ink-soft);padding:24px 0;text-align:center;">Elige qué categoría(s) vas a retirar.</p>';
  document.getElementById('retiro-vc-lista').innerHTML = html;
}
function pintarRetiroVC() {
  if (window.matchMedia('(min-width: 900px)').matches) { pintarRetiroVCDesktop_(); return; }
  const categorias = [...new Set(cacheCatalogoCompleto.catalogo.map(p => p.categoria))];
  document.getElementById('retiro-vc-chips').innerHTML = categorias.map(c => {
    const activo = retiroVCCategoriasActivas.has(c);
    return '<span class="chip-cat' + (activo ? ' activo' : '') + '" onclick="toggleCategoriaRetiroVC(\'' + c.replace(/'/g, "\\'") + '\')">' + c + '</span>';
  }).join('');
  let html = '';
  categorias.filter(c => retiroVCCategoriasActivas.has(c)).forEach(cat => {
    const productosCat = cacheCatalogoCompleto.catalogo.filter(p => p.categoria === cat);
    if (!productosCat.length) return;
    const marcados = productosCat.filter(p => p.marcado);
    const noMarcados = productosCat.filter(p => !p.marcado);
    html += '<p class="conteo-seccion-titulo">' + cat + '</p>';
    html += marcados.map(filaProductoRetiroVC_).join('');
    if (noMarcados.length) {
      if (retiroVCVerMas.has(cat)) {
        html += noMarcados.map(filaProductoRetiroVC_).join('');
      } else {
        html += '<button type="button" class="btn-vermas-cat" onclick="toggleVerMasRetiroVC(\'' + cat.replace(/'/g, "\\'") + '\')">Ver más de ' + cat + '</button>';
      }
    }
  });
  if (!html) html = '<p style="font-size:13.5px;color:var(--ink-soft);padding:24px 0;text-align:center;">Elige qué categoría(s) vas a retirar.</p>';
  document.getElementById('retiro-vc-lista').innerHTML = html;
}

// Registro en dos pasos, como el resto de Producción (23/07/2026, con Osmar: "agrega
// resumen"). revisarRetiroVC() arma la lista y la deja ver antes de escribir nada; recién
// confirmarRetiroVC() —desde la pantalla de resumen— llama al servidor.
let resumenRetiroVCItems = [];

function revisarRetiroVC() {
  const err = document.getElementById('retiro-vc-error');
  err.textContent = '';
  const items = [];
  cacheCatalogoCompleto.catalogo.forEach(p => {
    const key = p.productoProduccion + '|' + p.categoria;
    const cant = retiroVCCantidades[key];
    if (cant && cant > 0) items.push({ productoProduccion: p.productoProduccion, nombre: p.nombre, cantidad: cant });
  });
  if (!items.length) { err.textContent = 'Marca al menos un producto con cantidad mayor a 0.'; return; }
  resumenRetiroVCItems = items;
  pintarResumenRetiroVC();
  irA('screen-resumen-retiro-vc');
}

function pintarResumenRetiroVC() {
  document.getElementById('resumen-retiro-lista').innerHTML = resumenRetiroVCItems.map(it =>
    '<div class="resumen-fila"><span>' + it.nombre + '</span><strong>' + it.cantidad + '</strong></div>'
  ).join('');
  const total = resumenRetiroVCItems.length;
  let texto = total + ' producto' + (total === 1 ? '' : 's') + '.';
  if (retiroVCCliente.trim()) texto += ' Cliente/motivo: ' + retiroVCCliente.trim() + '.';
  document.getElementById('resumen-retiro-total').textContent = texto;
  document.getElementById('resumen-retiro-error').textContent = '';
}

async function confirmarRetiroVC() {
  const err = document.getElementById('resumen-retiro-error');
  err.textContent = '';
  const boton = document.getElementById('resumen-retiro-btn-confirmar');
  boton.disabled = true;
  const r = await llamarAPI('guardarRetiroStockVC', {
    data: { responsable: sesion.nombre, clienteMotivo: retiroVCCliente, fecha: document.getElementById('retiro-vc-fecha').value,
      items: resumenRetiroVCItems.map(it => ({ productoProduccion: it.productoProduccion, cantidad: it.cantidad })) }
  });
  boton.disabled = false;
  if (!r.ok) { err.textContent = r.error || 'Error al registrar el retiro'; return; }
  const n = resumenRetiroVCItems.length;
  retiroVCCantidades = {}; retiroVCCliente = ''; resumenRetiroVCItems = [];
  document.getElementById('confirm-title').textContent = 'Retiro registrado';
  document.getElementById('confirm-msg').textContent = n + ' producto' + (n === 1 ? '' : 's') + ' registrado' + (n === 1 ? '' : 's') + ' hacia Vegan Corner.';
  document.getElementById('confirm-detalle').innerHTML = '';
  ocultarBotonOtro();
  irA('screen-confirm');
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
    '<td style="padding:9px 6px;width:34px;text-align:right;">' + botonQuitar + '</td></tr>' +
    filaDesgloseDesktop_(it);
}

// En escritorio la pauta es una tabla, así que el desglose no puede ir "dentro" de la fila:
// va como una segunda fila con colspan, alineada bajo el nombre del producto.
function filaDesgloseDesktop_(it) {
  const bloque = bloqueDesglosePauta_(it);
  if (!bloque) return '';
  return '<tr class="dg-fila-desktop"><td></td><td colspan="3" style="padding:0 6px 10px;">' + bloque + '</td></tr>';
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

  const enAcordeon = hechos.filter(it => !it.dual);
  const enLista = cachePauta.pauta.filter(it => it.estadoBorrador !== 'Hecho' || it.dual);
  const g = agruparPauta_(enLista, mapaObs);
  let html = '';
  if (!enLista.length) {
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

  if (enAcordeon.length) {
    html += '<button class="pauta-hechos-toggle" onclick="togglePautaHechos()">' +
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="transform:rotate(' + (pautaHechosAbierto ? '90' : '0') + 'deg);transition:transform .15s;"><path d="M9 18l6-6-6-6"></path></svg>' +
      '<span>Hechos</span><span class="pauta-hechos-badge">' + enAcordeon.length + '</span></button>';
    if (pautaHechosAbierto) {
      html += '<table><tbody>' + enAcordeon.map(filaPautaDesktop_).join('') + '</tbody></table>';
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
    pintarPautaDesktop_(hechosD, pendientesD, mapaObservacionesPorEnvio_(visiblesD));
    return;
  }
  const cont = document.getElementById('pauta-lista');
  const visibles = cachePauta.pauta;
  const hechos = visibles.filter(it => it.estadoBorrador === 'Hecho');
  const pendientes = visibles.filter(it => it.estadoBorrador !== 'Hecho');
  // NUEVO 24/07/2026 (con Osmar): una empanada marcada Hecho NO baja al acordeón — se queda
  // en su grupo mostrando cómo quedó repartida. Si se escondiera, el desglose quedaría
  // decidido por defecto sin que nadie lo viera nunca. El resto de los productos sigue
  // bajando a "Hechos" igual que antes: ahí no queda nada pendiente de declarar.
  const enAcordeon = hechos.filter(it => !it.dual);
  const enLista = visibles.filter(it => it.estadoBorrador !== 'Hecho' || it.dual);
  const mapaObs = mapaObservacionesPorEnvio_(visibles);
  pintarBarraProgreso_(hechos.length, visibles.length);

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
      bloqueDesglosePauta_(it) +
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

  const g = agruparPauta_(enLista, mapaObs);
  let html = '';
  if (!enLista.length) {
    html += '<p style="font-size:13.5px;color:var(--ink-soft);padding:16px 0;text-align:center;">Todo marcado — revisa Hechos o confirma la producción.</p>';
  }
  if (g.envios.length) {
    html += '<p class="pauta-grupo-titulo">Pedido de Cima</p>';
    g.envios.forEach(envio => { html += bloqueObservacionEnvio_(envio) + envio.items.map(filaHtml).join(''); });
  }
  if (g.agregados.length) {
    html += '<p class="pauta-grupo-titulo">Agregado acá</p>' + g.agregados.map(filaHtml).join('');
  }

  if (enAcordeon.length) {
    html += '<button class="pauta-hechos-toggle" onclick="togglePautaHechos()">' +
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="transform:rotate(' + (pautaHechosAbierto ? '90' : '0') + 'deg);transition:transform .15s;"><path d="M9 18l6-6-6-6"></path></svg>' +
      '<span>Hechos</span><span class="pauta-hechos-badge">' + enAcordeon.length + '</span></button>';
    if (pautaHechosAbierto) html += enAcordeon.map(filaHtml).join('');
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
  // NUEVO 24/07/2026 (con Osmar): marcar una empanada Hecho siembra su desglose con el
  // valor por defecto (todas horneadas) — sin modal, sin toque extra, sin interrumpir el
  // checklist. Desmarcarla lo borra: si el producto vuelve a pendiente, lo declarado sobre
  // cómo se repartió deja de tener sentido.
  if (it.dual) {
    if (it.estadoBorrador === 'Hecho') asegurarDesglose_(it);
    else { delete desgloseEmpanadas[id]; if (desgloseAbierto === id) desgloseAbierto = null; }
  }
  pintarPauta();
  await llamarAPISilencioso('actualizarBorradorPauta', { data: { id: id, estadoBorrador: it.estadoBorrador, cantidadBorrador: it.cantidadBorrador } });
}

async function cambiarCantidadBorradorPauta(id, val) {
  const it = cachePauta.pauta.find(x => x.id === id);
  if (!it) return;
  it.cantidadBorrador = Math.max(0, Number(val) || 0);
  // Si cambia el total de una empanada ya marcada, se conserva lo declarado como congeladas
  // y se recalcula el resto — cambiar la cantidad no es motivo para perder el dato.
  if (it.dual && desgloseEmpanadas[id]) {
    const d = desgloseEmpanadas[id];
    d.congeladas = Math.min(d.congeladas, it.cantidadBorrador);
    d.horneadas = Math.max(0, it.cantidadBorrador - d.congeladas);
    pintarPauta();
  }
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

// Un producto es "dual" (empanada con desglose horneada/congelada) cuando aparece en el
// catálogo con MÁS de una categoría — el mismo criterio que mapaProductosDuales_ en el
// servidor, pero calculado en el cliente sobre cacheCatalogoPauta que ya está cargado. Sirve
// para que el modo optimista (agregar sin esperar al servidor) sepa desde el primer momento
// si el ítem lleva desglose, sin depender del r.dual que devolvía la llamada.
function esProductoDualLocal_(productoProduccion) {
  if (!cacheCatalogoPauta) return false;
  const cats = new Set();
  cacheCatalogoPauta.catalogo.forEach(p => {
    if (p.productoProduccion === productoProduccion) cats.add(p.categoria);
  });
  return cats.size > 1;
}

// REDISEÑO 24/07/2026 (con Osmar — velocidad): modo optimista, el mismo patrón que ya usa
// marcar Hecho (toggleHechoPauta, 15/07). Antes cada "+ Agregar producto" llamaba a llamarAPI,
// que bloquea la pantalla con el overlay de carga: agregar tres productos = tres congelamientos
// seguidos. Ahora el producto aparece EN EL ACTO y el guardado va de fondo (llamarAPISilencioso),
// así se pueden agregar varios sin espera.
//
// El id se genera en el cliente con el mismo formato que nuevoId('PROG') del servidor
// (prefijo-timestamp-random), y se le pasa al servidor para que use ESE id — así el borrador
// (actualizarBorradorPauta, que referencia el id) queda consistente sin esperar respuesta.
//
// Si el servidor falla, se revierte: el producto se saca de la lista y se avisa. Es el precio
// del modo optimista, asumido a conciencia (mismo trade-off que marcar Hecho).
function nuevoIdPautaLocal_() {
  return 'PROG-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
}

async function agregarProductoPauta(valor, opciones) {
  const opt = opciones.find(o => o.value === valor);
  const id = nuevoIdPautaLocal_();
  const item = {
    id: id, fecha: fechaLocalISO(), producto: opt ? opt.label : valor, cantidadProgramada: 1,
    estado: 'Programado', responsable: sesion.nombre, conteoId: '', cantidadContada: null,
    comentario: '', estadoBorrador: '', cantidadBorrador: null,
    dual: esProductoDualLocal_(valor), observacionPedido: ''
  };
  // Optimista: aparece ya y el buscador queda listo para el siguiente.
  cachePauta.pauta.push(item);
  pautaAgregadosSesion.push(id);
  document.getElementById('ss-pauta-producto-wrap').style.display = 'none';
  const inp = document.querySelector('#ss-pauta-producto input[type=text]');
  if (inp) inp.value = '';
  pintarPauta();

  // Guardado de fondo con el id ya fijado. Si falla, se revierte lo agregado.
  const r = await llamarAPISilencioso('agregarItemPautaDirecto', { data: { id: id, producto: valor, cantidad: 1, responsable: sesion.nombre } });
  if (!r || !r.ok) {
    cachePauta.pauta = cachePauta.pauta.filter(x => x.id !== id);
    const i = pautaAgregadosSesion.indexOf(id);
    if (i !== -1) pautaAgregadosSesion.splice(i, 1);
    pintarPauta();
    document.getElementById('pauta-error').textContent = (r && r.error) || 'No se pudo agregar "' + (opt ? opt.label : valor) + '". Intenta de nuevo.';
    return;
  }
  // El servidor puede corregir el dato de dual (fuente de verdad). Si difiere, se ajusta —
  // sin quitar ni volver a pintar de más si coincide, que es el caso normal.
  if (typeof r.dual === 'boolean' && r.dual !== item.dual) {
    item.dual = r.dual;
    pintarPauta();
  }
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
  if (!visibles.length) {
    document.getElementById('pauta-error').textContent = 'No hay nada que confirmar.';
    return;
  }
  // NUEVO 28/07/2026 (con Osmar): ataja-errores antes de la revisión. El error recurrente
  // era editar la cantidad de un producto y olvidar marcarlo Hecho: quedaba con número puesto
  // pero fuera de la producción, y se les pasaba uno sin darse cuenta. Acá se detectan esos
  // ítems —cantidad EDITADA (cantidadBorrador seteado, no la programada por defecto) y sin
  // marcar— y se ofrece elegir cuáles incluir. NO se marca nada en bloque ni en silencio:
  // algunos productos deben quedar pendientes a propósito aunque tengan cantidad, así que la
  // decisión es por ítem. Si no hay ninguno, sigue directo a la revisión como siempre.
  const editadosSinMarcar = visibles.filter(it =>
    it.estadoBorrador !== 'Hecho' &&
    it.cantidadBorrador !== null && it.cantidadBorrador !== undefined &&
    Number(it.cantidadBorrador) > 0
  );
  if (editadosSinMarcar.length) {
    abrirAvisoPautaSinMarcar_(editadosSinMarcar);
    return;
  }
  irARevisionPauta_();
}

// Cuerpo de la revisión, extraído de revisarPauta para poder entrar desde dos lados (directo,
// o después de resolver el aviso de cantidad-sin-marcar) sin duplicar la lógica.
function irARevisionPauta_() {
  const visibles = cachePauta.pauta;
  const completados = visibles.filter(it => it.estadoBorrador === 'Hecho');
  const faltantes = visibles.filter(it => it.estadoBorrador !== 'Hecho');
  // Red de seguridad: toda empanada completada tiene que llegar acá con desglose sembrado.
  // toggleHechoPauta ya lo hace al marcarla; esto cubre cualquier ítem que haya quedado en
  // 'Hecho' por otra vía (borrador recuperado del servidor, o el aviso de abajo).
  completados.filter(it => it.dual).forEach(asegurarDesglose_);
  pintarResumenPauta(completados, faltantes);
  const obsTextarea = document.getElementById('resumen-pauta-observacion');
  obsTextarea.value = pautaObservacionBorrador;
  // NUEVO 23/07/2026 (con Osmar): con pauta completa el campo es solo "Observaciones",
  // opcional. Si quedan faltantes, el placeholder pide la razón y confirmarProduccion()
  // exige el comentario antes de dejar pasar — es la única forma de que quede dicho por
  // qué no se entregó completa, sin agregar una etiqueta ni un banner aparte.
  obsTextarea.placeholder = faltantes.length ? '¿Por qué quedó incompleta? (comentario obligatorio)' : 'Observaciones';
  irA('screen-resumen-pauta');
}

// ===== AVISO "cantidad sin marcar" antes de la revisión (NUEVO 28/07/2026 — con Osmar) =====
// Diseño cerrado con Osmar: sin párrafos (la gente no los lee), la lista con checks hace el
// trabajo. Checks PRE-MARCADOS —el caso normal es "lo hice y olvidé marcar"—, se destilda el
// que debe quedar pendiente. Confirmar marca Hecho solo los tildados y sigue a la revisión.
let pautaAvisoItems = [];        // refs a los ítems detectados (editados sin marcar)
let pautaAvisoSeleccion = {};    // { id: true|false } — true = incluir (marcar Hecho)

function abrirAvisoPautaSinMarcar_(items) {
  pautaAvisoItems = items;
  pautaAvisoSeleccion = {};
  items.forEach(it => { pautaAvisoSeleccion[it.id] = true; });
  mostrarAvisoPautaSinMarcar_();
}

function mostrarAvisoPautaSinMarcar_() {
  const n = pautaAvisoItems.length;
  const filas = pautaAvisoItems.map((it, i) => {
    const sel = pautaAvisoSeleccion[it.id];
    const cant = it.cantidadBorrador !== null && it.cantidadBorrador !== undefined ? it.cantidadBorrador : it.cantidadProgramada;
    const idEsc = it.id.replace(/'/g, "\\'");
    const borde = i < n - 1 ? 'border-bottom:1px solid #EBE4D8;' : '';
    const check = sel
      ? '<span style="width:24px;height:24px;border-radius:7px;background:#2B4638;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg></span>'
      : '<span style="width:24px;height:24px;border-radius:7px;background:#FFFFFF;border:1.5px solid #CFC6B6;flex-shrink:0;"></span>';
    const tint = sel ? '#2B2B2B' : '#9A9488';
    const tintNum = sel ? '#2B4638' : '#9A9488';
    return '<button type="button" onclick="togglePautaAviso_(\'' + idEsc + '\')" style="width:100%;display:flex;align-items:center;gap:11px;padding:12px 8px;min-height:44px;background:none;border:none;' + borde + 'text-align:left;cursor:pointer;">' +
        check +
        '<span style="flex:1;font-size:14.5px;color:' + tint + ';">' + it.producto + '</span>' +
        '<span style="font-family:\'JetBrains Mono\',monospace;font-size:13.5px;font-weight:600;color:' + tintNum + ';">' + cant + '</span>' +
      '</button>';
  }).join('');

  abrirModal(
    '<div style="display:flex;align-items:center;gap:9px;margin-bottom:6px;">' +
      '<span style="width:32px;height:32px;border-radius:50%;background:#F5E4DA;display:flex;align-items:center;justify-content:center;flex-shrink:0;">' +
        '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#BE5A2B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><path d="M12 9v4"></path><path d="M12 17h.01"></path></svg>' +
      '</span>' +
      '<span class="serif" style="font-size:19px;color:var(--forest);">Falta marcar</span>' +
    '</div>' +
    '<p style="font-size:13.5px;color:var(--ink-soft);margin:0 0 14px 41px;">Tienen cantidad pero sin marcar como hecho.</p>' +
    '<div style="background:var(--paper);border:1px solid #EBE4D8;border-radius:12px;padding:4px 6px;margin-bottom:18px;">' + filas + '</div>' +
    '<button class="btn-primary" style="margin-bottom:9px;" onclick="confirmarAvisoPauta_()">Confirmar</button>' +
    '<button class="btn-secondary" onclick="cerrarModal()">Volver a la pauta</button>'
  );
}

function togglePautaAviso_(id) {
  pautaAvisoSeleccion[id] = !pautaAvisoSeleccion[id];
  mostrarAvisoPautaSinMarcar_();
}

async function confirmarAvisoPauta_() {
  const elegidos = pautaAvisoItems.filter(it => pautaAvisoSeleccion[it.id]);
  // Los no elegidos no se tocan: quedan con su cantidad y sin marcar, pendientes a propósito.
  elegidos.forEach(it => {
    it.estadoBorrador = 'Hecho';
    if (it.dual) asegurarDesglose_(it);
  });
  cerrarModal();
  // El servidor lee el estado desde el borrador guardado (confirmarPauta no recibe el estado
  // de la pantalla), así que hay que persistir el "Hecho" ANTES de pasar a la revisión. Con
  // overlay porque son varias llamadas y sin feedback la pausa se vería como cuelgue.
  if (elegidos.length) {
    const ov = document.getElementById('loading-overlay');
    if (ov) ov.classList.add('active');
    try {
      await Promise.all(elegidos.map(it => llamarAPISilencioso('actualizarBorradorPauta', { data: { id: it.id, estadoBorrador: 'Hecho', cantidadBorrador: it.cantidadBorrador } })));
    } catch (e) { /* si alguna falla, igual seguimos; el estado local ya quedó marcado */ }
    if (ov) ov.classList.remove('active');
  }
  irARevisionPauta_();
}

// NUEVO 24/07/2026 (con Osmar): la Revisión ya no pregunta el desglose, lo muestra. Es una
// línea de lectura con salida a corregir — el dato ya viene declarado desde la Pauta.
function lineaDesgloseResumen_(it, esAncho) {
  if (!it.dual || !desgloseEmpanadas[it.id]) return '';
  const cuerpo = '<span class="dg-resumen-txt">' + fraseDesglose_(desgloseEmpanadas[it.id]) + '</span>' +
    '<span class="dg-linea-cta">Cambiar</span>';
  if (esAncho) {
    return '<tr><td colspan="2" style="padding:0 6px 8px;"><button class="dg-resumen" onclick="corregirDesglose_(\'' + it.id + '\')">' + cuerpo + '</button></td></tr>';
  }
  return '<button class="dg-resumen" onclick="corregirDesglose_(\'' + it.id + '\')">' + cuerpo + '</button>';
}

function filaResumenPauta_(it, atenuado) {
  const cant = it.cantidadBorrador !== null && it.cantidadBorrador !== undefined ? it.cantidadBorrador : it.cantidadProgramada;
  if (window.matchMedia('(min-width: 900px)').matches) {
    return '<tr' + (atenuado ? ' style="opacity:.6;"' : '') + '><td style="padding:9px 6px;"><div style="font-weight:700;">' + it.producto + '</div>' + (it.comentario ? '<div style="font-size:10.5px;color:var(--ink-soft);margin-top:2px;">' + it.comentario + '</div>' : '') + '</td>' +
      '<td style="padding:9px 6px;text-align:right;font-family:\'JetBrains Mono\',monospace;font-weight:700;">' + cant + '</td></tr>' +
      (atenuado ? '' : lineaDesgloseResumen_(it, true));
  }
  return '<div class="resumen-fila' + (atenuado ? ' atenuado' : '') + '"><span>' + it.producto + '</span><strong>' + cant + '</strong></div>' +
    (it.comentario ? '<p class="resumen-fila-nota">' + it.comentario + '</p>' : '') +
    (atenuado ? '' : lineaDesgloseResumen_(it, false));
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

// ===== DESGLOSE HORNEADAS/CONGELADAS (REDISEÑO 24/07/2026 — con Osmar) =====
// Por qué existe: EntregaDetalle guardaba solo "Empanada Pino Soya, 42" y no había forma
// de saber a cuál cubeta entró. Con eso, el movimiento de empanadas era incalculable y el
// sistema mostraba números falsos (ver mapaMovimiento_ en Produccion.gs).
//
// POR QUÉ SE MOVIÓ ACÁ (antes vivía en la pantalla de Revisión):
// 1) No persistía. pintarDesgloseEmpanadas_ hacía `desgloseEmpanadas = {}` en CADA entrada
//    al resumen: llenar las 5 empanadas, tocar "Volver a editar" y regresar borraba todo,
//    sin aviso. Era el único dato del flujo que no sobrevivía, mientras estadoBorrador y
//    cantidadBorrador sí se guardaban en el servidor en cada toque.
// 2) Arrancaba en 0/0, o sea que la pantalla abría con "faltan N de las N" en alerta para
//    cada empanada, siempre. En EntregaDetalle las congeladas fueron 0 en el 100% de las
//    entregas con desglose: el valor por defecto era justo el único que nunca es correcto.
// 3) Preguntaba al final del día por 5 productos a la vez, obligando a reconstruir 5 hechos
//    de memoria. Ahora se declara al marcar Hecho, que es cuando la respuesta está a mano.
// 4) Una pantalla de confirmación que pide datos nuevos no es una confirmación. La Revisión
//    vuelve a ser solo lectura: muestra cómo quedó cada empanada, no la pregunta.
//
// El bloque de "Stock congelado que queda acá" salió de la Revisión y no se reemplaza: ya
// tiene su pantalla dedicada (Conteo en modo stock congelado, ver linea ~466). Eran dos
// conteos físicos distintos metidos en la misma pantalla.
let desgloseEmpanadas = {};   // { programaId: {horneadas, congeladas} }
let desgloseAbierto = null;   // programaId con el editor abierto — uno a la vez

function totalItemPauta_(it) {
  return it.cantidadBorrador !== null && it.cantidadBorrador !== undefined ? it.cantidadBorrador : it.cantidadProgramada;
}

// Siembra el desglose con el valor por defecto: todas horneadas. Idempotente a propósito —
// si la usuaria ya declaró algo (o viene de corregir desde la Revisión) no se pisa.
function asegurarDesglose_(it) {
  if (!desgloseEmpanadas[it.id]) {
    const total = Number(totalItemPauta_(it)) || 0;
    desgloseEmpanadas[it.id] = { horneadas: total, congeladas: 0 };
  }
  return desgloseEmpanadas[it.id];
}

function fraseDesglose_(d) {
  if (!d.congeladas) return '<b>' + d.horneadas + '</b> horneadas · ninguna congelada';
  if (!d.horneadas) return 'ninguna horneada · <b>' + d.congeladas + '</b> congeladas';
  return '<b>' + d.horneadas + '</b> horneadas · <b>' + d.congeladas + '</b> congeladas';
}

function textoAvisoDesglose_(d, total) {
  const suma = d.horneadas + d.congeladas;
  if (suma === total) return '';
  return 'Total ' + suma + ' · ' + (suma < total ? 'faltan ' + (total - suma) : (suma - total) + ' de más') + ' respecto de las ' + total + ' que envías';
}

// Devuelve el bloque que va DENTRO de la fila del producto, debajo del nombre. Vacío para
// todo lo que no sea una empanada marcada Hecho: el resto de la pauta no cambia en nada.
function bloqueDesglosePauta_(it) {
  if (!it.dual || it.estadoBorrador !== 'Hecho' || pautaSoloLectura) return '';
  const d = asegurarDesglose_(it);
  const total = Number(totalItemPauta_(it)) || 0;

  if (desgloseAbierto !== it.id) {
    return '<button class="dg-linea" onclick="abrirDesglose_(\'' + it.id + '\')">' +
      '<span class="dg-linea-txt">' + fraseDesglose_(d) + '</span>' +
      '<span class="dg-linea-cta">Cambiar <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"></path></svg></span>' +
    '</button>';
  }

  const aviso = textoAvisoDesglose_(d, total);
  return '<div class="dg-abierto">' +
    '<p class="dg-pregunta">De las ' + total + ' que envías, ¿cuántas van congeladas?</p>' +
    '<div class="dg-campos">' +
      '<div class="dg-campo"><label for="dg-h-' + it.id + '">Horneadas</label>' +
        '<input type="number" min="0" id="dg-h-' + it.id + '" value="' + d.horneadas + '" oninput="cambiarDesglose_(\'' + it.id + '\',\'horneadas\',this.value)"></div>' +
      '<div class="dg-campo"><label for="dg-c-' + it.id + '">Congeladas</label>' +
        '<input type="number" min="0" id="dg-c-' + it.id + '" value="' + d.congeladas + '" oninput="cambiarDesglose_(\'' + it.id + '\',\'congeladas\',this.value)"></div>' +
    '</div>' +
    '<p class="dg-aviso" id="dg-aviso-' + it.id + '"' + (aviso ? '' : ' style="display:none;"') + '>' + aviso + '</p>' +
    '<button class="dg-listo" onclick="cerrarDesglose_()">Listo</button>' +
  '</div>';
}

function abrirDesglose_(id) {
  desgloseAbierto = id;
  pintarPauta();
  const inp = document.getElementById('dg-c-' + id);
  if (inp) { inp.focus(); inp.select(); }
}

function cerrarDesglose_() {
  desgloseAbierto = null;
  pintarPauta();
}

// No repinta la pauta en cada tecla a propósito: un pintarPauta() por keystroke le saca el
// foco al input y pierde el cursor. Se parchea sólo el campo hermano y el aviso.
function cambiarDesglose_(id, campo, valor) {
  const it = cachePauta.pauta.find(x => x.id === id);
  if (!it) return;
  const d = asegurarDesglose_(it);
  const total = Number(totalItemPauta_(it)) || 0;
  d[campo] = Math.max(0, Number(valor) || 0);
  // Escribir congeladas ajusta horneadas sola — lo normal es declarar cuántas van al
  // congelador y que el resto se entienda horneado. Editar horneadas a mano NO toca
  // congeladas: esa es la puerta para declarar merma (se quemó una tanda), y recién ahí
  // aparece el aviso de descuadre. Antes el aviso salía siempre, de entrada.
  if (campo === 'congeladas') {
    d.horneadas = Math.max(0, total - d.congeladas);
    const inpH = document.getElementById('dg-h-' + id);
    if (inpH) inpH.value = d.horneadas;
  }
  const el = document.getElementById('dg-aviso-' + id);
  if (!el) return;
  const aviso = textoAvisoDesglose_(d, total);
  el.textContent = aviso;
  el.style.display = aviso ? '' : 'none';
}

// Desde la Revisión: vuelve a la Pauta con el editor de ese producto abierto y la fila a
// la vista. Un solo lugar donde se edita el desglose.
function corregirDesglose_(id) {
  desgloseAbierto = id;
  irA('screen-pauta');
  pintarPauta();
  const fila = document.getElementById('pauta-row-' + id);
  if (fila && fila.scrollIntoView) fila.scrollIntoView({ block: 'center' });
  const inp = document.getElementById('dg-c-' + id);
  if (inp) { inp.focus(); inp.select(); }
}

async function confirmarProduccion() {
  document.getElementById('resumen-pauta-error').textContent = '';
  // NUEVO 23/07/2026 (con Osmar): si quedan faltantes, el comentario es obligatorio —
  // recalculado sobre cachePauta porque revisarPauta() ya lo tenía, pero no se guarda
  // aparte para no duplicar estado. cachePauta sigue completo acá: recién se limpia
  // más abajo, después de que el servidor confirme.
  const hayFaltantes = cachePauta.pauta.some(it => it.estadoBorrador !== 'Hecho');
  if (hayFaltantes && !pautaObservacionBorrador.trim()) {
    document.getElementById('resumen-pauta-error').textContent = 'La pauta quedó incompleta — cuéntanos por qué antes de confirmar.';
    return;
  }
  const r = await llamarAPI('confirmarPauta', { data: { responsable: sesion.nombre, agregadosIds: pautaAgregadosSesion, observacion: pautaObservacionBorrador, desglose: desgloseEmpanadas } });
  if (!r.ok) { document.getElementById('resumen-pauta-error').textContent = r.error || 'Error al confirmar producción'; return; }

  desgloseEmpanadas = {}; desgloseAbierto = null;
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

// NUEVO 24/07/2026 (con Osmar): la recepción pasó de bloque-en-el-conteo a PANTALLA PROPIA
// previa. La consulta al servidor la hace ahora abrirConteo (para poder decidir a qué
// pantalla ir antes de dibujar nada); estas funciones solo pintan y manejan las salidas.
//
// recibe el objeto de respuesta ya validado (ok + items con contenido) desde abrirConteo.
function mostrarPantallaRecepcion_(r) {
  recepcionPendiente = r;
  recepcionCantidades = {};
  // Prellenado con lo declarado por Vegan Corner. La persona en Cima ajusta solo si llegó
  // distinto — el caso normal es tocar nada y confirmar.
  r.items.forEach(it => { recepcionCantidades[it.fila] = it.cantidadEntregada; });
  irA('screen-recepcion');
  const err = document.getElementById('recep-error'); if (err) err.textContent = '';
  const obs = document.getElementById('recep-obs'); if (obs) obs.value = '';
  const sub = document.getElementById('recep-sub');
  if (sub) sub.textContent = [r.responsable, r.fecha].filter(x => x).join(' · ') + ' · ajusta solo si llegó distinto';
  pintarListaRecepcion_();
}

function pintarListaRecepcion_() {
  const cont = document.getElementById('recep-lista');
  if (!cont || !recepcionPendiente) return;
  let filas = '';
  recepcionPendiente.items.forEach(it => {
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
  cont.innerHTML = filas;
}

// "Recepcionar luego": salta al conteo sin registrar nada. La entrega queda pendiente y
// vuelve a aparecer la próxima vez que se abra Conteo.
async function recepcionarLuego() {
  recepcionPendiente = null;
  recepcionCantidades = {};
  await entrarAlConteo_();
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
  // Confirmada la recepción, se sigue al conteo (que venía cargando de fondo). La constancia
  // de lo recepcionado queda en el propio registro del servidor; acá basta con seguir.
  await entrarAlConteo_();
}
