/* ===================================================================
   CONCILIACIÓN — parsers de archivos
   =================================================================== */
const MESES_ES = { enero:0, febrero:1, marzo:2, abril:3, mayo:4, junio:5, julio:6, agosto:7, septiembre:8, octubre:9, noviembre:10, diciembre:11 };
function fechaCLDesdeDate(d){ const dd=String(d.getDate()).padStart(2,'0'), mm=String(d.getMonth()+1).padStart(2,'0'); return dd+'/'+mm+'/'+d.getFullYear(); }
function claveOrdenCL(fechaTxt){ const [d,m,y]=fechaTxt.split('/'); return y+m.padStart(2,'0')+d.padStart(2,'0'); }
function parseFechaCLtexto(txt){ const [d,m,y]=String(txt).split('/').map(Number); if(!d||!m||!y) return null; return new Date(y,m-1,d); }
function parseNumeroCL(txt){ if(txt===null||txt===undefined||txt==='') return 0; return Number(String(txt).replace(/\./g,''))||0; }
function fechaCLDesdeValue(id){ const v=document.getElementById(id).value; if(!v) return ''; const [y,m,d]=v.split('-'); return d+'/'+m+'/'+y; }
function valueFromCL(fechaCL){ if(!fechaCL) return ''; const [d,m,y]=fechaCL.split('/'); return y+'-'+m+'-'+d; }

function leerArchivoComoFilas(file){
  return new Promise((resolve,reject)=>{
    const reader = new FileReader();
    reader.onload = e => {
      try{
        const wb = XLSX.read(new Uint8Array(e.target.result), {type:'array'});
        resolve(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {header:1, defval:'', raw:false}));
      }catch(err){ reject(err); }
    };
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.readAsArrayBuffer(file);
  });
}

// Mismo patrón de dropzone que ya usa "Importar reportes" (arrastrar o tocar para elegir).
// Se activa una sola vez por par dropzone/input — los elementos ya existen en el HTML
// desde el principio, solo se muestran/ocultan según la fuente elegida.
function activarDropzone(dzId, inputId){
  const dz = document.getElementById(dzId);
  const input = document.getElementById(inputId);
  if(!dz || !input) return;
  const txt = dz.querySelector('span');
  const original = txt.textContent;
  const actualizar = () => { txt.textContent = input.files.length ? '📄 '+input.files[0].name : original; };
  dz.addEventListener('dragover', e=>{ e.preventDefault(); dz.classList.add('dragover'); });
  dz.addEventListener('dragleave', ()=>dz.classList.remove('dragover'));
  dz.addEventListener('drop', e=>{
    e.preventDefault(); dz.classList.remove('dragover');
    if(e.dataTransfer.files.length){ input.files = e.dataTransfer.files; actualizar(); }
  });
  input.addEventListener('change', actualizar);
}
[['dz-cartola','nc-archivo-cartola'],['dz-debito','nc-archivo-debito'],['dz-credito','nc-archivo-credito'],
 ['dz-prepago','nc-archivo-prepago'],['dz-pedidosya','nc-archivo-pedidosya'],['dz-aronium','nc-archivo-aronium']]
 .forEach(([dz,inp])=>activarDropzone(dz,inp));

// --- Transbank (montos) — Cartola de Movimientos ---
function parsearFechaMovimientoTransbank(texto){
  if(!texto) return null;
  const partes = String(texto).trim().split(/\s+/);
  if(partes.length<3) return null;
  const dia=parseInt(partes[0],10), mes=MESES_ES[partes[1].toLowerCase()], anio=parseInt(partes[2],10);
  if(isNaN(dia)||mes===undefined||isNaN(anio)) return null;
  return new Date(anio,mes,dia);
}
function parsearCartolaTransbank(filas, periodoDeclarado){
  let desdeArchivo='', hastaArchivo='';
  const filaPeriodo = filas.find(f => f[0] && String(f[0]).indexOf('Período de consulta')!==-1);
  if(filaPeriodo){
    const valor = filaPeriodo.find((v,i)=> i>0 && v);
    if(valor && String(valor).indexOf(' - ')!==-1){ const [a,b]=String(valor).split(' - '); desdeArchivo=a.trim(); hastaArchivo=b.trim(); }
  }
  let advertenciaPeriodo = '';
  if(desdeArchivo && hastaArchivo && (desdeArchivo!==periodoDeclarado.desde || hastaArchivo!==periodoDeclarado.hasta)){
    advertenciaPeriodo = 'El archivo declara el período '+desdeArchivo+' al '+hastaArchivo+', distinto al que ingresaste ('+periodoDeclarado.desde+' al '+periodoDeclarado.hasta+'). Revisa que sea el archivo correcto.';
  }
  const idxHeader = filas.findIndex(f => f[0]==='Tipo de movimiento');
  if(idxHeader===-1) throw new Error('No se encontró la tabla de transacciones en el archivo.');
  const header = filas[idxHeader];
  const col = nombre => header.indexOf(nombre);
  const iTipo=col('Tipo de movimiento'), iFecha=col('Fecha de movimiento'), iMedio=col('Medio de pago'), iMonto=col('Monto venta valido para abono');
  if([iTipo,iFecha,iMedio,iMonto].indexOf(-1)!==-1) throw new Error('El archivo no tiene las columnas esperadas. Revisa que sea la Cartola de Movimientos sin modificar.');
  const desdeD = parseFechaCLtexto(periodoDeclarado.desde), hastaD = parseFechaCLtexto(periodoDeclarado.hasta);
  const porDia = {}; const fueraDeRango = [];
  for(let i=idxHeader+1;i<filas.length;i++){
    const f = filas[i];
    if(!f || !f[iTipo]) continue;
    const fecha = parsearFechaMovimientoTransbank(f[iFecha]);
    if(!fecha) continue;
    if(fecha<desdeD || fecha>hastaD){ fueraDeRango.push(fechaCLDesdeDate(fecha)); continue; }
    const clave = fechaCLDesdeDate(fecha);
    if(!porDia[clave]) porDia[clave] = { fecha:clave, debito:0, credito:0 };
    const signo = (f[iTipo]==='Anulación') ? -1 : 1;
    const monto = signo * (Number(f[iMonto])||0);
    if(String(f[iMedio]||'')==='Crédito') porDia[clave].credito += monto; else porDia[clave].debito += monto;
  }
  if(fueraDeRango.length){
    const unicas = [...new Set(fueraDeRango)];
    advertenciaPeriodo += (advertenciaPeriodo?' ':'') + 'Se encontraron movimientos fuera del período declarado, se ignoraron: '+unicas.join(', ')+'.';
  }
  return { desde:periodoDeclarado.desde, hasta:periodoDeclarado.hasta, dias:Object.values(porDia).sort((a,b)=>a.fecha.localeCompare(b.fecha)), advertenciaPeriodo };
}

// --- Transbank Comisión — extracción masiva Débito/Crédito/Prepago (.dat) ---
function parsearExtraccionTransbankComision(texto, periodoDeclarado){
  const lineas = texto.split(/\r?\n/);
  const lineaPeriodo = lineas.find(l => l.indexOf('Periodo de consulta')===0);
  let advertenciaPeriodo = '';
  if(lineaPeriodo){
    const valor = lineaPeriodo.split(';')[1]||'';
    if(valor.indexOf(' - ')!==-1){
      const [a,b]=valor.split(' - ');
      if(a.trim()!==periodoDeclarado.desde || b.trim()!==periodoDeclarado.hasta){
        advertenciaPeriodo = 'El archivo declara el período de abono '+a.trim()+' al '+b.trim()+', distinto al que ingresaste ('+periodoDeclarado.desde+' al '+periodoDeclarado.hasta+').';
      }
    }
  }
  const lineaComision = lineas.find(l => l.indexOf('Comision Transbank (-)')===0);
  const lineaIva = lineas.find(l => l.indexOf('IVA comision Transbank (-)')===0);
  const totalDeclaradoArchivo = (lineaComision?parseNumeroCL(lineaComision.split(';')[1]):0) + (lineaIva?parseNumeroCL(lineaIva.split(';')[1]):0);
  const idxHeader = lineas.findIndex(l => l.split(';')[0]==='Tipo de movimiento');
  if(idxHeader===-1) throw new Error('No se encontró la tabla de transacciones en el archivo.');
  const header = lineas[idxHeader].split(';');
  const col = nombre => header.indexOf(nombre);
  const iTipo=col('Tipo de movimiento'), iFecha=col('Fecha de movimiento'), iComision=col('Comision Transbank (-)'), iIva=col('IVA comision Transbank (-)');
  if([iTipo,iFecha,iComision,iIva].indexOf(-1)!==-1) throw new Error('El archivo no tiene las columnas esperadas de la extracción masiva de Transbank.');
  const porDia = {}; let sumaFilas = 0;
  for(let i=idxHeader+1;i<lineas.length;i++){
    const f = lineas[i].split(';');
    if(!f[iTipo]) continue;
    const fechaTxt = String(f[iFecha]||'').split(' ')[0];
    if(!fechaTxt || fechaTxt.indexOf('/')===-1) continue;
    const gasto = parseNumeroCL(f[iComision]) + parseNumeroCL(f[iIva]);
    const signo = (f[iTipo]==='Anulación') ? -1 : 1;
    porDia[fechaTxt] = (porDia[fechaTxt]||0) + signo*gasto;
    sumaFilas += signo*gasto;
  }
  const diferenciaAutocheque = Math.round(sumaFilas - totalDeclaradoArchivo);
  return {
    dias: Object.entries(porDia).map(([fecha,comision])=>({fecha, comision:Math.round(comision)})),
    totalDeclaradoArchivo, sumaFilas:Math.round(sumaFilas), advertenciaPeriodo,
    advertenciaAutocheque: Math.abs(diferenciaAutocheque)>1 ? ('La suma de las transacciones ($'+sumaFilas.toLocaleString('es-CL')+') no calza con el total declarado en el resumen del archivo ($'+totalDeclaradoArchivo.toLocaleString('es-CL')+').') : ''
  };
}
function combinarExtraccionesTransbank(resultados, periodoDeclarado){
  const porDia = {}; const advertencias = [];
  resultados.forEach(r=>{
    if(!r) return;
    r.dias.forEach(d=>{ porDia[d.fecha]=(porDia[d.fecha]||0)+d.comision; });
    if(r.advertenciaPeriodo) advertencias.push(r.advertenciaPeriodo);
    if(r.advertenciaAutocheque) advertencias.push(r.advertenciaAutocheque);
  });
  const fechas = Object.keys(porDia).sort((a,b)=>claveOrdenCL(a).localeCompare(claveOrdenCL(b)));
  return { desde:periodoDeclarado.desde, hasta:periodoDeclarado.hasta, dias:fechas.map(f=>({fecha:f, comision:Math.round(porDia[f])})), advertencias };
}

// --- PedidosYa ---
function parsearListaPedidosYa(filas, periodoDeclarado){
  const idxHeader = filas.findIndex(f => f[0]==='Número del pedido');
  if(idxHeader===-1) throw new Error('No se encontró la tabla de pedidos. ¿Es el archivo "Lista de pedidos" correcto?');
  const header = filas[idxHeader];
  const col = nombre => header.indexOf(nombre);
  const iFecha=col('Fecha del pedido'), iTotalUsuario=col('Total pagado por el usuario'), iComision=col('Comisión por pedido'), iReintegro=col('Descuento por retiro en el local pagado por PedidosYa');
  if([iFecha,iTotalUsuario,iComision,iReintegro].indexOf(-1)!==-1) throw new Error('El archivo no tiene las columnas esperadas de PedidosYa.');
  const desdeD = parseFechaCLtexto(periodoDeclarado.desde), hastaD = parseFechaCLtexto(periodoDeclarado.hasta);
  const porDia = {}; const fueraDeRango = []; let comisionTotal=0, reintegroTotal=0;
  for(let i=idxHeader+1;i<filas.length;i++){
    const f = filas[i];
    if(!f || !f[iFecha]) continue;
    const fecha = String(f[iFecha]).trim();
    const fechaObj = parseFechaCLtexto(fecha);
    if(fechaObj && (fechaObj<desdeD || fechaObj>hastaD)){ fueraDeRango.push(fecha); continue; }
    porDia[fecha] = (porDia[fecha]||0) + (Number(f[iTotalUsuario])||0);
    comisionTotal += Number(f[iComision])||0;
    reintegroTotal += Number(f[iReintegro])||0;
  }
  const fechas = Object.keys(porDia).sort((a,b)=>claveOrdenCL(a).localeCompare(claveOrdenCL(b)));
  if(!fechas.length) throw new Error('No se encontraron pedidos dentro del período declarado.');
  let advertenciaPeriodo = '';
  if(fueraDeRango.length){ const unicas=[...new Set(fueraDeRango)]; advertenciaPeriodo = 'Hay pedidos fuera del período declarado, se ignoraron: '+unicas.join(', ')+'. Revisa si es el archivo correcto.'; }
  return { desde:periodoDeclarado.desde, hasta:periodoDeclarado.hasta, dias:fechas.map(f=>({fecha:f, totalUsuario:Math.round(porDia[f])})), comisionTotal:Math.round(comisionTotal), reintegroTotal:Math.round(reintegroTotal), advertenciaPeriodo };
}
function armarDatosPedidosYa(resultadoExcel, cuotaCredito, totalLiquidadoDeclarado){
  const totalUsuarioSuma = resultadoExcel.dias.reduce((s,d)=>s+d.totalUsuario,0);
  const iva = Math.round((resultadoExcel.comisionTotal - resultadoExcel.reintegroTotal) * 0.19);
  const subtotal = totalUsuarioSuma - resultadoExcel.comisionTotal + resultadoExcel.reintegroTotal - iva;
  const totalCalculado = subtotal - Number(cuotaCredito||0);
  const diferencia = Math.round(totalCalculado - Number(totalLiquidadoDeclarado||0));
  return {
    desde:resultadoExcel.desde, hasta:resultadoExcel.hasta, dias:resultadoExcel.dias,
    comision:resultadoExcel.comisionTotal, reintegro:resultadoExcel.reintegroTotal, iva,
    cuotaCredito:Number(cuotaCredito||0), totalLiquidadoDeclarado:Number(totalLiquidadoDeclarado||0), totalCalculado,
    advertenciaPeriodo: resultadoExcel.advertenciaPeriodo||'',
    advertenciaAutocheque: Math.abs(diferencia)>1 ? ('El total calculado ($'+Math.round(totalCalculado).toLocaleString('es-CL')+') no coincide con el total liquidado que escribiste ($'+Math.round(totalLiquidadoDeclarado).toLocaleString('es-CL')+'). Revisa los números del PDF.') : ''
  };
}

/* ===================================================================
   CONCILIACIÓN — pantallas
   =================================================================== */
async function abrirConciliacion(forzar){
  irA('screen-conciliacion');
  if(forzar) cacheModulo.conciliaciones = null;
  if(cacheModulo.conciliaciones){ pintarConciliacion(cacheModulo.conciliaciones); return; }
  document.getElementById('lista-conciliacion').innerHTML = skeletonCards(3);
  const r = await llamarAPISilencioso('listarConciliaciones', {});
  cacheModulo.conciliaciones = r;
  if(document.getElementById('screen-conciliacion').classList.contains('active')) pintarConciliacion(r);
}
function pintarConciliacion(r){
  const cont = document.getElementById('lista-conciliacion'); cont.innerHTML='';
  const lista = r.conciliaciones||[];
  if(!lista.length){ cont.innerHTML='<p style="font-size:12px;color:var(--ink-soft);">Todavía no se ha conciliado ninguna fuente.</p>'; return; }
  lista.forEach(c=>{
    const pillClase = c.estado==='Confirmada'?'pill-ok':(c.estado==='Atrasada'?'pill-critica':'pill-alerta');
    const div = document.createElement('div'); div.className='fuente-card';
    div.onclick = () => abrirHallazgos(c.desde, c.hasta, c.fuente, c.loteId);
    div.innerHTML =
      '<div class="f-txt"><strong>'+c.fuente+'</strong><span>'+c.desde+' al '+c.hasta+'</span></div>'+
      '<div class="f-right"><span class="pill '+pillClase+'">'+c.estado+(c.diasAtraso?(' · '+c.diasAtraso+'d'):'')+'</span>'+
      (c.fechaImportacion?'<div class="fecha">Importado '+c.fechaImportacion+'</div>':'')+'</div>';
    cont.appendChild(div);
  });
}

function irANuevaConciliacion(){
  document.getElementById('nc-error').textContent='';
  document.getElementById('nc-fuente').value='Transbank';
  ['nc-archivo-cartola','nc-archivo-debito','nc-archivo-credito','nc-archivo-prepago','nc-archivo-pedidosya','nc-archivo-aronium','nc-cuota-credito','nc-total-liquidado'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  irA('screen-conciliacion-nueva');
  onFuenteConciliacionChange();
}
async function onFuenteConciliacionChange(){
  const fuente = document.getElementById('nc-fuente').value;
  const mapaDiv = {'Transbank':'nc-campos-transbank','Transbank Comisión':'nc-campos-transbank-comision','PedidosYa':'nc-campos-pedidosya','Aronium Medios de Pago':'nc-campos-aronium'};
  Object.values(mapaDiv).forEach(id=>document.getElementById(id).style.display='none');
  document.getElementById(mapaDiv[fuente]).style.display='block';
  document.getElementById('nc-sugerencia').textContent='Calculando sugerencia...';
  const r = await llamarAPISilencioso('sugerirProximoPeriodo', {fuente});
  if(r.ok && r.desde && r.hasta){
    document.getElementById('nc-desde').value = valueFromCL(r.desde);
    document.getElementById('nc-hasta').value = valueFromCL(r.hasta);
    document.getElementById('nc-sugerencia').textContent = 'Sugerido en base al último período conciliado de esta fuente — puedes ajustarlo.';
  } else {
    document.getElementById('nc-sugerencia').textContent = 'Primera vez que se concilia esta fuente — elige el período manualmente.';
  }
}
function mostrarResultadoImport(fuente, periodoDeclarado, advertencias){
  cacheModulo.conciliaciones = null;
  const lista = [...new Set((advertencias||[]).filter(Boolean))]; // sin duplicados
  const bloque = lista.length ? lista.map(a=>'<div class="check-row check-warn" style="margin-bottom:6px;">⚠ '+a+'</div>').join('') : '<p style="font-size:12.5px;color:var(--ink-soft);">Sin advertencias.</p>';
  abrirModal(
    '<h3 style="font-size:15px;">Importado correctamente</h3>'+
    '<p style="font-size:12px;color:var(--ink-soft);margin:2px 0 10px;">'+fuente+' · '+periodoDeclarado.desde+' al '+periodoDeclarado.hasta+'</p>'+
    bloque+
    '<button class="btn-primary" style="margin-top:14px;width:100%;" onclick="cerrarModal();irA(\'screen-conciliacion\');abrirConciliacion(true);">Aceptar</button>'
  );
}
async function procesarConciliacion(){
  const fuente = document.getElementById('nc-fuente').value;
  const desde = fechaCLDesdeValue('nc-desde'), hasta = fechaCLDesdeValue('nc-hasta');
  const errEl = document.getElementById('nc-error'); errEl.textContent='';
  if(!desde || !hasta){ errEl.textContent='Elige el período (Desde y Hasta)'; return; }
  const periodoDeclarado = {desde, hasta};
  try{
    let resultado;
    if(fuente==='Transbank'){
      const file = document.getElementById('nc-archivo-cartola').files[0];
      if(!file){ errEl.textContent='Elige el archivo de la Cartola de Movimientos'; return; }
      const filas = await leerArchivoComoFilas(file);
      const datos = parsearCartolaTransbank(filas, periodoDeclarado);
      resultado = await llamarAPI('importarTransbankMontos', {data:datos});
      if(resultado.ok) return mostrarResultadoImport(fuente, periodoDeclarado, [datos.advertenciaPeriodo]);

    } else if(fuente==='Transbank Comisión'){
      const archivos = [document.getElementById('nc-archivo-debito').files[0], document.getElementById('nc-archivo-credito').files[0], document.getElementById('nc-archivo-prepago').files[0]].filter(Boolean);
      if(!archivos.length){ errEl.textContent='Sube al menos un archivo (Débito, Crédito o Prepago)'; return; }
      const resultados = [];
      for(const f of archivos){ resultados.push(parsearExtraccionTransbankComision(await f.text(), periodoDeclarado)); }
      const combinado = combinarExtraccionesTransbank(resultados, periodoDeclarado);
      resultado = await llamarAPI('importarTransbankComision', {data:combinado});
      if(resultado.ok) return mostrarResultadoImport(fuente, periodoDeclarado, combinado.advertencias);

    } else if(fuente==='PedidosYa'){
      const file = document.getElementById('nc-archivo-pedidosya').files[0];
      if(!file){ errEl.textContent='Elige el Excel de "Lista de pedidos"'; return; }
      const cuota = Number(document.getElementById('nc-cuota-credito').value)||0;
      const totalLiquidado = Number(document.getElementById('nc-total-liquidado').value)||0;
      const filas = await leerArchivoComoFilas(file);
      const resExcel = parsearListaPedidosYa(filas, periodoDeclarado);
      const datos = armarDatosPedidosYa(resExcel, cuota, totalLiquidado);
      resultado = await llamarAPI('importarPedidosYaMontos', {data:datos});
      if(resultado.ok) return mostrarResultadoImport(fuente, periodoDeclarado, [datos.advertenciaPeriodo, datos.advertenciaAutocheque]);

    } else if(fuente==='Aronium Medios de Pago'){
      const file = document.getElementById('nc-archivo-aronium').files[0];
      if(!file){ errEl.textContent='Elige el Excel de Aronium'; return; }
      const filas = await leerArchivoComoFilas(file);
      const archivo = parseAroniumMedios(filas);
      if(!archivo.dias.length){ errEl.textContent='No se encontraron días en el archivo.'; return; }
      resultado = await llamarAPI('importarAroniumMediosConciliacion', {data:{periodoDeclarado, archivo}});
      if(resultado.ok) return mostrarResultadoImport(fuente, periodoDeclarado, resultado.advertencias);
    }
    if(resultado && !resultado.ok) errEl.textContent = resultado.error || 'Error al importar';
  }catch(err){
    errEl.textContent = 'Error: ' + err.message;
  }
}

/* ===== Hallazgos (Pantalla B) ===== */
function claveFechaOrden(f){ const [d,m,y]=f.split('/'); return y+m.padStart(2,'0')+d.padStart(2,'0'); }
async function abrirHallazgos(desde, hasta, fuente, loteId){
  window.chDesde = desde; window.chHasta = hasta; window.chLoteId = loteId;
  irA('screen-conciliacion-hallazgos');
  document.getElementById('ch-titulo').textContent = 'Hallazgos — '+(fuente||'')+' ('+desde+' al '+hasta+')';
  const btnGasto = document.getElementById('ch-btn-gasto');
  btnGasto.style.display = (loteId && (fuente==='Transbank Comisión' || fuente==='PedidosYa')) ? 'block' : 'none';
  document.getElementById('lista-hallazgos').innerHTML = skeletonCards(3);
  const r = await llamarAPISilencioso('listarAlertas', {});
  if(document.getElementById('screen-conciliacion-hallazgos').classList.contains('active')) pintarHallazgos(r, desde, hasta);
}
function pintarHallazgos(r, desde, hasta){
  const cont = document.getElementById('lista-hallazgos'); cont.innerHTML='';
  const cDesde = claveFechaOrden(desde), cHasta = claveFechaOrden(hasta);
  const todas = (r.alertas||[]).filter(a=>{
    if(a.estado!=='Pendiente') return false;
    if(a.categoria.indexOf('Conciliación:')!==0 && a.categoria.indexOf('Diagnóstico:')!==0) return false;
    const c = claveFechaOrden(a.fechaInicioReal);
    return c>=cDesde && c<=cHasta;
  });
  if(!todas.length){ cont.innerHTML='<p style="font-size:12.5px;color:var(--ink-soft);">Sin hallazgos pendientes en este período.</p>'; return; }
  todas.forEach(a=>{
    const div = document.createElement('div'); div.className='hallazgo'; div.dataset.id=a.id;
    const pillClase = a.severidad==='Critica'?'pill-critica':(a.severidad==='Alerta'?'pill-alerta':'pill-menor');
    div.innerHTML =
      '<div class="h-top"><div><div style="font-size:11px;color:var(--ink-soft);font-weight:700;text-transform:uppercase;">'+a.fecha+'</div>'+
      '<strong style="font-size:14px;">'+a.categoria.replace(/^(Conciliación|Diagnóstico): /,'')+'</strong></div>'+
      '<span class="pill '+pillClase+'">'+a.severidad+'</span></div>'+
      '<div class="rowline"><span>Digitado / esperado</span><b>'+fmt(a.esperado)+'</b></div>'+
      '<div class="rowline"><span>Oficial / real</span><b>'+fmt(a.real)+'</b></div>'+
      '<div class="rowline"><span>Diferencia</span><b>'+fmt(a.diferencia)+'</b></div>'+
      '<div style="display:flex;gap:8px;margin-top:10px;">'+
      '<button class="btn-secondary btn-small" onclick="confirmarHallazgoUI(\''+a.id+'\',\'rechazar\',\''+a.severidad+'\',\''+(a.responsable||'')+'\')">Rechazar</button>'+
      '<button class="btn-primary" style="flex:1;" onclick="confirmarHallazgoUI(\''+a.id+'\',\'confirmar\',\''+a.severidad+'\',\''+(a.responsable||'')+'\')">Confirmar</button>'+
      '</div>';
    cont.appendChild(div);
  });
}
async function confirmarHallazgoUI(id, decision, severidad, responsable){
  let nota = '';
  if(severidad==='Critica'){ nota = prompt('Esta alerta es crítica: describe qué pasó'); if(!nota) return; }
  let notificarA = '';
  if(responsable && confirm('¿Notificar a '+responsable+'?')) notificarA = responsable;
  const r = await llamarAPI('confirmarHallazgoConciliacion', {id, decision, nota, notificarA});
  if(r.ok){
    const card = document.querySelector('#lista-hallazgos .hallazgo[data-id="'+id+'"]');
    if(card) card.remove();
  } else {
    alert(r.error||'Error al procesar el hallazgo');
  }
}
async function ejecutarComparar(){
  if(!window.chDesde) return;
  const r = await llamarAPI('compararPeriodo', {desde:window.chDesde, hasta:window.chHasta});
  if(r.ok){
    const rAlertas = await llamarAPISilencioso('listarAlertas', {});
    pintarHallazgos(rAlertas, window.chDesde, window.chHasta);
  } else {
    alert(r.error||'Error al comparar');
  }
}
async function confirmarGastoUI(){
  if(!window.chLoteId) return;
  const r = await llamarAPI('confirmarGastoComision', {loteId:window.chLoteId});
  if(r.ok){
    abrirModal('<h3 style="font-size:15px;">Gasto creado</h3><p style="font-size:12.5px;">Se registró el gasto de comisión correctamente.</p><button class="btn-primary" style="margin-top:10px;width:100%;" onclick="cerrarModal()">Cerrar</button>');
  } else {
    alert(r.error||'Error al confirmar el gasto');
  }
}

/* ===================================================================
   NOTIFICACIONES — aviso opcional al confirmar un hallazgo
   =================================================================== */
async function cargarNotificaciones(){
  const cont = document.getElementById('notif-home');
  if(!cont) return;
  const r = await llamarAPISilencioso('obtenerNotificacionesActivas', {});
  cont.innerHTML='';
  (r.notificaciones||[]).forEach(n=>{
    const div = document.createElement('div');
    div.className = 'check-row check-warn';
    div.style.marginBottom = '8px';
    div.innerHTML = '<span>🔔 '+n.mensaje+'</span>';
    cont.appendChild(div);
  });
}
