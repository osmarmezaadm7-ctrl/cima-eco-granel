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
