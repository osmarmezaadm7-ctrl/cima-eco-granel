/* ingresos-vc.js — Pestaña "Ingresos Vegan Corner" dentro de Conciliación.
 * Reconoce el ingreso real de VC por la venta al detalle en Cima (reporte Aronium "Ventas por
 * producto"). Flujo réplica del modo de conciliar de Cima: Lista -> Fuente -> Revisión -> Cerrar.
 * Genera un asiento espejo de RESULTADO (Ingreso VC / Costo Cima), que NO afecta caja.
 * Colores: verde = ingresos, terracota = costos/egresos. Backend: IngresosVC.gs.
 * Módulo independiente: no toca conciliacion.js.
 */

var ivcEstado = { productos: [], desde: '', hasta: '', archivo: '', calc: null };

/* ---------- Tabs dentro de la pantalla de Conciliación ---------- */
function ivcCambiarTab(tab){
  var esVC = (tab === 'vc');
  var pc = document.getElementById('pane-conc-cima');
  var pv = document.getElementById('pane-conc-vc');
  if(pc) pc.style.display = esVC ? 'none' : 'block';
  if(pv) pv.style.display = esVC ? 'block' : 'none';
  var tc = document.getElementById('tab-conc-cima');
  var tv = document.getElementById('tab-conc-vc');
  if(tc) tc.classList.toggle('activo', !esVC);
  if(tv) tv.classList.toggle('activo', esVC);
  if(esVC) ivcCargarLista();
}

/* ---------- Lista de períodos cerrados ---------- */
async function ivcCargarLista(){
  var cont = document.getElementById('lista-ingresos-vc');
  if(!cont) return;
  cont.innerHTML = '<p style="font-size:12.5px;color:var(--ink-soft);">Cargando…</p>';
  var r = await llamarAPI('listarIngresosVC', {});
  if(!r || !r.ok){ cont.innerHTML = '<p class="error-msg">No se pudo cargar la lista.</p>'; return; }
  if(!r.procesos.length){
    cont.innerHTML = '<p style="font-size:12.5px;color:var(--ink-soft);text-align:center;padding:16px 0;">Aún no hay períodos registrados. Toca "+ Nueva conciliación" para crear el primero.</p>';
    return;
  }
  var html = '';
  r.procesos.forEach(function(p){
    html += '<div class="ivc-proc" onclick="abrirIngresoVCCerrado(\'' + p.loteId + '\')">' +
      '<div><div class="ivc-proc-per">' + ivcRango_(p.desde, p.hasta) + '</div>' +
      '<div class="ivc-proc-est">Cerrada · <b style="color:var(--forest);">' + fmt(p.totalIngresoVC) + '</b></div></div>' +
      '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#3B6D11" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>' +
      '</div>';
  });
  cont.innerHTML = html;
}

/* ---------- Utilidades de fecha ---------- */
var IVC_MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
function ivcRango_(desde, hasta){
  return ivcFechaCorta_(desde) + ' – ' + ivcFechaCorta_(hasta);
}
function ivcFechaCorta_(iso){
  if(!iso) return '';
  var s = String(iso).slice(0,10).split('-');
  if(s.length!==3) return String(iso);
  return parseInt(s[2],10) + ' ' + (IVC_MESES[parseInt(s[1],10)-1]||'') + ' ' + s[0];
}
function ivcFechaISO_(txt){
  var m = String(txt).trim().match(/(\d{1,2})-(\d{1,2})-(\d{4})/);
  if(!m) return '';
  return m[3] + '-' + ('0'+m[2]).slice(-2) + '-' + ('0'+m[1]).slice(-2);
}

/* ---------- Nueva conciliación: etapa Fuente ---------- */
function irANuevaIngresoVC(){
  ivcEstado = { productos: [], desde: '', hasta: '', archivo: '', calc: null };
  var e;
  e = document.getElementById('ivc-desde'); if(e) e.value = '';
  e = document.getElementById('ivc-hasta'); if(e) e.value = '';
  e = document.getElementById('ivc-archivo-nombre'); if(e){ e.textContent = ''; e.className = 'ivc-file-msg'; }
  e = document.getElementById('ivc-error'); if(e) e.textContent = '';
  e = document.getElementById('ivc-btn-revision'); if(e) e.disabled = true;
  irA('screen-ivc-fuente');
}

// Lee el reporte con raw:true (con raw:false SheetJS devuelve strings con formato que rompen números).
function leerReporteIngresoVC(file){
  return new Promise(function(resolve, reject){
    var reader = new FileReader();
    reader.onload = function(ev){
      try{
        var wb = XLSX.read(new Uint8Array(ev.target.result), { type:'array' });
        resolve(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header:1, defval:'', raw:true }));
      }catch(err){ reject(err); }
    };
    reader.onerror = function(){ reject(new Error('No se pudo leer el archivo')); };
    reader.readAsArrayBuffer(file);
  });
}

// El reporte usa ss:Index: código f[0], producto f[1], cantidad f[4], total f[9] (SheetJS respeta índices).
function parseReporteIngresoVC_(filas){
  var productos = [], desde = '', hasta = '';
  for(var i=0; i<filas.length; i++){
    var f = filas[i] || [];
    if(!desde){
      for(var c=0; c<f.length; c++){
        var mm = String(f[c]).match(/(\d{1,2}-\d{1,2}-\d{4})\s*-\s*(\d{1,2}-\d{1,2}-\d{4})/);
        if(mm){ desde = ivcFechaISO_(mm[1]); hasta = ivcFechaISO_(mm[2]); break; }
      }
    }
    var cod = f[0];
    if(cod !== '' && cod !== null && cod !== undefined && /^\d+$/.test(String(cod).trim())){
      productos.push({ codigo: String(cod).trim(), nombre: String(f[1]||'').trim(), cantidad: Number(f[4])||0, total: Number(f[9])||0 });
    }
  }
  return { productos: productos, desde: desde, hasta: hasta };
}

async function ivcArchivoSeleccionado(file){
  var err = document.getElementById('ivc-error'); err.textContent = '';
  var msg = document.getElementById('ivc-archivo-nombre');
  if(!file) return;
  try{
    var filas = await leerReporteIngresoVC(file);
    var parsed = parseReporteIngresoVC_(filas);
    if(parsed.productos.length === 0){
      err.textContent = 'No se encontraron productos. ¿Es el reporte "Ventas por producto" de Aronium?';
      return;
    }
    ivcEstado.productos = parsed.productos;
    ivcEstado.archivo = file.name;
    msg.className = 'ivc-file-msg ok';
    msg.textContent = file.name + ' — ' + parsed.productos.length + ' productos cargados';
    if(parsed.desde){ document.getElementById('ivc-desde').value = parsed.desde; ivcEstado.desde = parsed.desde; }
    if(parsed.hasta){ document.getElementById('ivc-hasta').value = parsed.hasta; ivcEstado.hasta = parsed.hasta; }
    document.getElementById('ivc-btn-revision').disabled = false;
  }catch(e){
    err.textContent = 'No se pudo leer el archivo: ' + e.message;
  }
}

async function irARevisionIngresoVC(){
  var err = document.getElementById('ivc-error'); err.textContent = '';
  ivcEstado.desde = document.getElementById('ivc-desde').value;
  ivcEstado.hasta = document.getElementById('ivc-hasta').value;
  if(ivcEstado.productos.length === 0){ err.textContent = 'Sube el reporte primero.'; return; }
  if(!ivcEstado.desde || !ivcEstado.hasta){ err.textContent = 'Indica el período (desde y hasta).'; return; }
  var r = await llamarAPI('calcularInformeVC', { data: { productos: ivcEstado.productos, desde: ivcEstado.desde, hasta: ivcEstado.hasta } });
  if(!r || !r.ok){ err.textContent = (r && r.error) || 'No se pudo calcular.'; return; }
  ivcEstado.calc = r;
  irA('screen-ivc-revision');
  ivcRenderRevision(r);
}

/* ---------- Etapa Revisión: informe completo ---------- */
function ivcRenderRevision(r){
  var cont = document.getElementById('ivc-revision-cont');
  var ing = r.ingreso;
  var bloqueado = ing.noCruzan && ing.noCruzan.length > 0;
  var html = '';

  html += '<p class="ivc-resumen" style="margin-bottom:16px;">Período ' + ivcRango_(ivcEstado.desde, ivcEstado.hasta) + ' · ' + ing.productosCruzados + ' productos · ' +
    (bloqueado ? ('<b style="color:var(--terracotta);">' + ing.noCruzan.length + ' sin catalogar</b>') : '0 sin catalogar') + '</p>';

  if(bloqueado){
    html += '<div class="ivc-alerta"><div class="ivc-alerta-top"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg><b>Productos sin catalogar — resuélvelos antes de cerrar</b></div><ul>';
    ing.noCruzan.forEach(function(p){ html += '<li>' + p.codigo + ' · ' + (p.nombre || '(sin nombre)') + ' — vendió ' + p.cantidad + '</li>'; });
    html += '</ul><span>Corrige el código en el catálogo o agrégalos, y vuelve a cargar el reporte.</span></div>';
  }

  // 1. Ingresos
  html += ivcSeccion_('Ingresos', '#2B4638',
    '<div class="ivc-metrics">' +
      '<div class="ivc-metric ivc-ingreso"><span>Ingreso Vegan Corner</span><b>' + fmt(ing.totalIngresoVC) + '</b></div>' +
      '<div class="ivc-metric ivc-neutro"><span>Markup Cima</span><b>' + fmt(ing.markup) + '</b></div>' +
    '</div>' +
    ivcHtmlDetalleIngreso_(ing.detalle));

  // 2. Movimiento  3. Merma
  html += ivcHtmlMovimientoMerma_(r);

  // 4. Asiento
  html += ivcSeccion_('Asiento que se generará', '#2B4638',
    ivcHtmlAsientoInterno_(ing.totalIngresoVC) +
    '<p class="ivc-nota" style="margin-top:8px;"><i>Registro de resultado — no afecta caja. La merma no genera asiento.</i></p>');

  var disabled = bloqueado ? ' disabled' : '';
  var etiqueta = bloqueado ? 'Resuelve los productos sin catalogar' : 'Cerrar conciliación';
  html += '<div class="submit-bar"><button class="btn-primary" id="ivc-btn-cerrar"' + disabled + ' onclick="ivcCerrar()">' + etiqueta + '</button></div>';

  cont.innerHTML = html;
}

// Encabezado de sección con barra de color a la izquierda.
function ivcSeccion_(titulo, color, contenido){
  return '<div class="ivc-sec-tit"><span style="background:' + color + ';"></span>' + titulo + '</div>' +
    '<div class="ivc-sec-body">' + contenido + '</div>';
}

function ivcHtmlDetalleIngreso_(detalle){
  if(!detalle || !detalle.length) return '';
  var h = '<details class="ivc-detalle"><summary>Detalle por producto (' + detalle.length + ')</summary>' +
    '<table class="ivc-tabla"><thead><tr><th>Producto</th><th>Vend.</th><th>May.</th><th>Ingreso VC</th></tr></thead><tbody>';
  detalle.forEach(function(p){ h += '<tr><td>' + p.nombre + '</td><td>' + p.cantidad + '</td><td>' + fmt(p.precioMayorista) + '</td><td>' + fmt(p.ingreso) + '</td></tr>'; });
  return h + '</tbody></table></details>';
}

// Secciones Movimiento + Merma (compartidas entre Revisión y proceso cerrado).
function ivcHtmlMovimientoMerma_(r){
  var mov = r.movimiento || [];
  var html = '';

  // Movimiento
  var filasMov = '';
  mov.forEach(function(m){
    filasMov += '<tr><td>' + m.producto + '</td><td class="r">' + m.entro + '</td><td class="r">' + m.vendio + '</td><td class="r">' + (m.queda === null ? '—' : m.queda) + '</td></tr>';
  });
  html += ivcSeccion_('Movimiento <span class="ivc-sec-sub">entró · vendió · queda</span>', '#A9825B',
    '<details class="ivc-detalle" open><summary>' + mov.length + ' productos</summary>' +
    '<table class="ivc-tabla ivc-tabla-mov"><thead><tr><th>Producto</th><th class="r">Entró</th><th class="r">Vendió</th><th class="r">Queda</th></tr></thead><tbody>' +
    (filasMov || '<tr><td colspan="4" style="text-align:center;color:var(--ink-soft);">Sin movimiento en el período</td></tr>') +
    '</tbody></table></details>');

  // Merma
  var filasMerma = '';
  mov.forEach(function(m){
    if(m.estado === 'revisar'){
      filasMerma += '<tr class="ivc-fila-revisar"><td>' + m.producto + '</td><td class="r">' + (m.salidas === null ? '—' : m.salidas) + '</td><td class="r">' + m.vendio + '</td><td class="r"><b>revisar</b></td></tr>';
    } else if(m.merma && m.merma !== 0){
      filasMerma += '<tr><td>' + m.producto + '</td><td class="r">' + m.salidas + '</td><td class="r">' + m.vendio + '</td><td class="r ivc-merma-n">' + m.merma + '</td></tr>';
    }
  });
  var mermaBody =
    '<div class="ivc-merma-total"><span>Merma valorizada del período</span><b>' + fmt(r.mermaTotal || 0) + '</b></div>' +
    (filasMerma ?
      ('<table class="ivc-tabla ivc-tabla-mov"><thead><tr><th>Producto</th><th class="r">Salió</th><th class="r">Vendió</th><th class="r">Merma</th></tr></thead><tbody>' + filasMerma + '</tbody></table>')
      : '<p style="font-size:12.5px;color:var(--ink-soft);margin:8px 0 0;">Sin merma detectada en el período.</p>') +
    (r.hayRevisar ? '<p class="ivc-nota" style="margin-top:8px;"><i>"revisar" = el stock no calza; puede ser un conteo o una entrada sin registrar.</i></p>' : '');
  html += ivcSeccion_('Merma <span class="ivc-badge-ref">referencial · no bloquea</span>', '#BE5A2B', mermaBody);

  return html;
}

// Asiento sin el título de sección (para envolverlo en ivcSeccion_).
function ivcHtmlAsientoInterno_(monto){
  return '<div class="ivc-asiento">' +
    '<div class="ivc-pata ivc-ingreso"><div><b>Vegan Corner</b><span>Ingreso · Venta a Cima</span></div><b>+' + fmt(monto) + '</b></div>' +
    '<div class="ivc-pata ivc-costo"><div><b>Cima Eco-Granel</b><span>Costo · Compra a Vegan Corner</span></div><b>&minus;' + fmt(monto) + '</b></div>' +
  '</div>';
}

/* ---------- Cerrar (genera el asiento) ---------- */
async function ivcCerrar(){
  var err = document.getElementById('ivc-error-rev'); err.textContent = '';
  if(!ivcEstado.calc) return;
  var payload = { productos: ivcEstado.productos, desde: ivcEstado.desde, hasta: ivcEstado.hasta };
  var r = await llamarAPI('generarAsientoIngresoVC', { data: payload });

  if(r && r.duplicado){
    if(confirm('Ya existe un período de Ingresos VC que se traslapa con este (lote ' + r.loteAnteriorId + '). ¿Reemplazarlo?')){
      payload.reemplazar = true;
      r = await llamarAPI('generarAsientoIngresoVC', { data: payload });
    } else { return; }
  }
  if(r && r.bloqueado){ err.textContent = r.error || 'Hay productos sin catalogar.'; return; }
  if(!r || !r.ok){ err.textContent = (r && r.error) || 'No se pudo cerrar la conciliación.'; return; }

  abrirIngresoVCCerrado(r.loteId);
}

/* ---------- Proceso cerrado (read-only) ---------- */
async function abrirIngresoVCCerrado(loteId){
  irA('screen-ivc-cerrado');
  var cont = document.getElementById('ivc-cerrado-cont');
  cont.innerHTML = '<p style="font-size:12.5px;color:var(--ink-soft);">Cargando…</p>';
  var r = await llamarAPI('obtenerIngresoVCProceso', { loteId: loteId });
  if(!r || !r.ok){ cont.innerHTML = '<p class="error-msg">' + ((r && r.error) || 'No se pudo abrir el proceso.') + '</p>'; return; }
  ivcRenderCerrado(r);
}

function ivcRenderCerrado(p){
  var cont = document.getElementById('ivc-cerrado-cont');
  var html = '';

  html += '<div class="ivc-cerrado-banner">' +
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#27500A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>' +
    '<div><b>Período cerrado</b><span>' + ivcRango_(p.desde, p.hasta) + ' · inmutable</span></div></div>';

  // 1. Ingresos
  html += ivcSeccion_('Ingresos', '#2B4638',
    '<div class="ivc-metrics">' +
      '<div class="ivc-metric ivc-ingreso"><span>Ingreso Vegan Corner</span><b>' + fmt(p.totalIngresoVC) + '</b></div>' +
      '<div class="ivc-metric ivc-neutro"><span>Markup Cima</span><b>' + fmt(p.markup) + '</b></div>' +
    '</div>' +
    ivcHtmlDetalleIngresoCerrado_(p.detalle));

  // 2. Movimiento  3. Merma (si el proceso guardó informe)
  if(p.informe && p.informe.movimiento){
    html += ivcHtmlMovimientoMerma_(p.informe);
  }

  // 4. Asiento
  html += ivcSeccion_('Asiento generado', '#2B4638',
    ivcHtmlAsientoInterno_(p.totalIngresoVC) +
    '<p class="ivc-nota" style="margin-top:8px;"><i>Registro de resultado — no afecta caja. La merma no genera asiento.</i></p>');

  html += '<p class="ivc-nota" style="text-align:center;">Lote ' + p.loteId + ' · generado el ' + ivcFechaCorta_(p.fecha) + ' · solo lectura</p>';

  cont.innerHTML = html;
}

// Detalle de ingreso en el cerrado (sin columna mayorista, más limpio).
function ivcHtmlDetalleIngresoCerrado_(detalle){
  if(!detalle || !detalle.length) return '';
  var h = '<details class="ivc-detalle"><summary>Detalle por producto (' + detalle.length + ')</summary>' +
    '<table class="ivc-tabla"><thead><tr><th>Producto</th><th>Vend.</th><th>Ingreso VC</th></tr></thead><tbody>';
  detalle.forEach(function(d){ h += '<tr><td>' + d.nombre + '</td><td>' + d.cantidad + '</td><td>' + fmt(d.ingreso) + '</td></tr>'; });
  return h + '</tbody></table></details>';
}
