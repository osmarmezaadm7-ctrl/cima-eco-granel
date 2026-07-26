/* ingresos-vc.js — Sección "Ingresos Vegan Corner" dentro de Conciliación.
 * Reconoce el ingreso real de VC por la venta al detalle en Cima, a partir del reporte de
 * Aronium "Ventas por producto". Genera un asiento espejo de RESULTADO (Ingreso VC / Costo Cima),
 * que NO afecta caja. Backend: IngresosVC.gs (calcularIngresoVC / generarAsientoIngresoVC).
 *
 * Módulo independiente: no toca conciliacion.js. Se accede desde la pantalla de Conciliación.
 */

var ivcEstado = { productos: [], desde: '', hasta: '', archivo: '', calc: null };

function irAIngresosVC(){
  ivcEstado = { productos: [], desde: '', hasta: '', archivo: '', calc: null };
  var e;
  e = document.getElementById('ivc-desde'); if(e) e.value = '';
  e = document.getElementById('ivc-hasta'); if(e) e.value = '';
  e = document.getElementById('ivc-archivo-nombre'); if(e) e.textContent = '';
  e = document.getElementById('ivc-resultado'); if(e) e.innerHTML = '';
  e = document.getElementById('ivc-error'); if(e) e.textContent = '';
  irA('screen-ingresos-vc');
}

// Lee el reporte Aronium (SpreadsheetML/.xls) con raw:true — con raw:false SheetJS devuelve
// strings con formato de miles que rompen el parseo de números (aprendizaje del proyecto).
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

// dd-mm-yyyy -> yyyy-mm-dd (para los input type=date y para el backend)
function ivcFechaISO_(txt){
  var m = String(txt).trim().match(/(\d{1,2})-(\d{1,2})-(\d{4})/);
  if(!m) return '';
  return m[3] + '-' + ('0'+m[2]).slice(-2) + '-' + ('0'+m[1]).slice(-2);
}

// Extrae productos (código, nombre, cantidad, total) y el período del encabezado del reporte.
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
    // El reporte usa ss:Index: código col A (f[0]), producto col B (f[1]),
    // cantidad col E (f[4]), total col J (f[9]). SheetJS respeta esos índices.
    var cod = f[0];
    if(cod !== '' && cod !== null && cod !== undefined && /^\d+$/.test(String(cod).trim())){
      productos.push({
        codigo: String(cod).trim(),
        nombre: String(f[1] || '').trim(),
        cantidad: Number(f[4]) || 0,
        total: Number(f[9]) || 0
      });
    }
  }
  return { productos: productos, desde: desde, hasta: hasta };
}

async function ivcArchivoSeleccionado(file){
  var err = document.getElementById('ivc-error'); err.textContent = '';
  if(!file) return;
  try{
    var filas = await leerReporteIngresoVC(file);
    var parsed = parseReporteIngresoVC_(filas);
    if(parsed.productos.length === 0){
      err.textContent = 'No se encontraron productos en el archivo. ¿Es el reporte "Ventas por producto" de Aronium?';
      return;
    }
    ivcEstado.productos = parsed.productos;
    ivcEstado.archivo = file.name;
    document.getElementById('ivc-archivo-nombre').textContent = file.name + ' — ' + parsed.productos.length + ' productos';
    if(parsed.desde){ document.getElementById('ivc-desde').value = parsed.desde; ivcEstado.desde = parsed.desde; }
    if(parsed.hasta){ document.getElementById('ivc-hasta').value = parsed.hasta; ivcEstado.hasta = parsed.hasta; }
    ivcCalcular();
  }catch(e){
    err.textContent = 'No se pudo leer el archivo: ' + e.message;
  }
}

async function ivcCalcular(){
  var err = document.getElementById('ivc-error'); err.textContent = '';
  ivcEstado.desde = document.getElementById('ivc-desde').value;
  ivcEstado.hasta = document.getElementById('ivc-hasta').value;
  if(ivcEstado.productos.length === 0) return;
  if(!ivcEstado.desde || !ivcEstado.hasta){ err.textContent = 'Indica el período (desde y hasta).'; return; }
  var r = await llamarAPI('calcularIngresoVC', { data: { productos: ivcEstado.productos, desde: ivcEstado.desde, hasta: ivcEstado.hasta } });
  if(!r || !r.ok){ err.textContent = (r && r.error) || 'No se pudo calcular.'; return; }
  ivcEstado.calc = r;
  ivcRenderResultado(r);
}

function ivcRenderResultado(r){
  var cont = document.getElementById('ivc-resultado');
  var bloqueado = r.noCruzan && r.noCruzan.length > 0;
  var html = '';

  html += '<div class="ivc-metrics">' +
    '<div class="ivc-metric ivc-metric-vc"><span>Ingreso Vegan Corner</span><b>' + fmt(r.totalIngresoVC) + '</b></div>' +
    '<div class="ivc-metric ivc-metric-cima"><span>Markup Cima</span><b>' + fmt(r.markup) + '</b></div>' +
    '</div>';

  html += '<p class="ivc-resumen">' + r.productosCruzados + ' productos cruzados · ' +
    (bloqueado ? ('<b style="color:var(--terracotta);">' + r.noCruzan.length + ' sin catalogar</b>') : '0 sin catalogar') + '</p>';

  if(bloqueado){
    html += '<div class="ivc-alerta"><b>Productos sin catalogar — resuélvelos antes de generar:</b><ul>';
    r.noCruzan.forEach(function(p){ html += '<li>' + p.codigo + ' · ' + (p.nombre || '(sin nombre)') + ' — vendió ' + p.cantidad + '</li>'; });
    html += '</ul><span>Corrige el código en el catálogo o agrégalos, y vuelve a cargar el reporte.</span></div>';
  }

  if(r.detalle && r.detalle.length){
    html += '<details class="ivc-detalle"><summary>Ver detalle por producto (' + r.detalle.length + ')</summary>' +
      '<table class="ivc-tabla"><thead><tr><th>Producto</th><th>Vend.</th><th>May.</th><th>Ingreso VC</th></tr></thead><tbody>';
    r.detalle.forEach(function(p){
      html += '<tr><td>' + p.nombre + '</td><td>' + p.cantidad + '</td><td>' + fmt(p.precioMayorista) + '</td><td>' + fmt(p.ingreso) + '</td></tr>';
    });
    html += '</tbody></table></details>';
  }

  html += '<p class="ivc-label">Asiento que se generará</p>' +
    '<div class="ivc-asiento">' +
      '<div class="ivc-pata ivc-pata-vc"><div><b>Vegan Corner</b><span>Ingreso · Venta a Cima</span></div><b>+' + fmt(r.totalIngresoVC) + '</b></div>' +
      '<div class="ivc-pata ivc-pata-cima"><div><b>Cima Eco-Granel</b><span>Costo · Compra a Vegan Corner</span></div><b>&minus;' + fmt(r.totalIngresoVC) + '</b></div>' +
    '</div>' +
    '<p class="ivc-nota">Registro de resultado — no afecta caja ni banco.</p>';

  if(r.duplicado){
    html += '<div class="ivc-alerta ivc-alerta-warn">Ya existe un registro para un período que se traslapa (lote ' + r.duplicado.loteAnteriorId + '). Si generas, se te pedirá confirmar el reemplazo.</div>';
  }

  var disabled = bloqueado ? ' disabled' : '';
  var etiqueta = bloqueado ? 'Resuelve los productos sin catalogar' : 'Generar asiento del período';
  html += '<div class="submit-bar"><button class="btn-primary" id="ivc-btn-generar"' + disabled + ' onclick="ivcGenerar()">' + etiqueta + '</button></div>';

  cont.innerHTML = html;
}

async function ivcGenerar(){
  var err = document.getElementById('ivc-error'); err.textContent = '';
  if(!ivcEstado.calc) return;
  var payload = { productos: ivcEstado.productos, desde: ivcEstado.desde, hasta: ivcEstado.hasta };
  var r = await llamarAPI('generarAsientoIngresoVC', { data: payload });

  if(r && r.duplicado){
    if(confirm('Ya existe un registro de Ingresos VC para un período que se traslapa (lote ' + r.loteAnteriorId + '). ¿Reemplazarlo por este?')){
      payload.reemplazar = true;
      r = await llamarAPI('generarAsientoIngresoVC', { data: payload });
    } else {
      return;
    }
  }
  if(r && r.bloqueado){
    err.textContent = r.error || 'Hay productos sin catalogar.';
    return;
  }
  if(!r || !r.ok){ err.textContent = (r && r.error) || 'No se pudo generar el asiento.'; return; }

  var cont = document.getElementById('ivc-resultado');
  cont.innerHTML = '<div class="ivc-ok">' +
    '<svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"></path></svg>' +
    '<h3>Asiento generado</h3>' +
    '<p>Ingreso Vegan Corner: <b>' + fmt(r.totalIngresoVC) + '</b></p>' +
    '<p>Markup Cima: <b>' + fmt(r.markup) + '</b></p>' +
    '<p class="ivc-nota">Lote ' + r.loteId + '</p>' +
    '<button class="btn-secondary" onclick="irAIngresosVC()" style="margin-top:14px;width:auto;padding:11px 16px;">Registrar otro período</button>' +
    '</div>';
}
