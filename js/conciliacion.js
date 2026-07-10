/* ===================================================================
   CONCILIACIÓN — parsers de archivos (SIN CAMBIOS respecto a la versión anterior)
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

function parsearFechaMovimientoTransbank(texto){
  if(!texto) return null;
  const partes = String(texto).trim().split(/\s+/);
  if(partes.length<3) return null;
  const dia=parseInt(partes[0],10), mes=MESES_ES[partes[1].toLowerCase()], anio=parseInt(partes[2],10);
  if(isNaN(dia)||mes===undefined||isNaN(anio)) return null;
  return new Date(anio,mes,dia);
}
// Parsea texto tipo "dd MMMM yyyy" (español, sin acentos en el archivo real de Transbank,
// ej. "01 julio 2026") — formato distinto al de "Fecha de movimiento" (que trae hora).
function parsearFechaAbonoTransbank(texto){
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
  const iTipo=col('Tipo de movimiento'), iFecha=col('Fecha de movimiento'), iMedio=col('Medio de pago'), iMonto=col('Monto venta valido para abono'), iAbono=col('Fecha de abono');
  if([iTipo,iFecha,iMedio,iMonto].indexOf(-1)!==-1) throw new Error('El archivo no tiene las columnas esperadas. Revisa que sea la Cartola de Movimientos sin modificar.');
  const desdeD = parseFechaCLtexto(periodoDeclarado.desde), hastaD = parseFechaCLtexto(periodoDeclarado.hasta);
  const porDia = {}; const fueraDeRango = [];
  // Período de abonos sugerido: el mínimo y máximo de "Fecha de abono" entre TODAS las filas
  // de venta del archivo (no solo las dentro del período) — Transbank paga el abono corrido,
  // así que el rango real de abono siempre se estira más allá del período de venta (verificado
  // con un archivo real: Cartola 22/06–28/06 dio un período de abono de 23/06 al 02/07).
  let abonoMin = null, abonoMax = null;
  for(let i=idxHeader+1;i<filas.length;i++){
    const f = filas[i];
    if(!f || !f[iTipo]) continue;
    const fecha = parsearFechaMovimientoTransbank(f[iFecha]);
    if(!fecha) continue;
    if(iAbono!==-1 && f[iAbono]){
      const fechaAbono = parsearFechaAbonoTransbank(f[iAbono]);
      if(fechaAbono){
        if(!abonoMin || fechaAbono<abonoMin) abonoMin = fechaAbono;
        if(!abonoMax || fechaAbono>abonoMax) abonoMax = fechaAbono;
      }
    }
    if(fecha<desdeD || fecha>hastaD){ fueraDeRango.push(fechaCLDesdeDate(fecha)); continue; }
    const clave = fechaCLDesdeDate(fecha);
    if(!porDia[clave]) porDia[clave] = { fecha:clave, debito:0, credito:0 };
    const signo = (f[iTipo]==='Anulación') ? -1 : 1;
    const monto = signo * numCL(f[iMonto]);
    if(String(f[iMedio]||'')==='Crédito') porDia[clave].credito += monto; else porDia[clave].debito += monto;
  }
  if(fueraDeRango.length){
    const unicas = [...new Set(fueraDeRango)];
    advertenciaPeriodo += (advertenciaPeriodo?' ':'') + 'Se encontraron movimientos fuera del período declarado, se ignoraron: '+unicas.join(', ')+'.';
  }
  const sugerenciaAbono = (abonoMin && abonoMax) ? { desde: fechaCLDesdeDate(abonoMin), hasta: fechaCLDesdeDate(abonoMax) } : null;
  return { desde:periodoDeclarado.desde, hasta:periodoDeclarado.hasta, dias:Object.values(porDia).sort((a,b)=>a.fecha.localeCompare(b.fecha)), advertenciaPeriodo, sugerenciaAbono };
}

function parsearExtraccionTransbankComision(texto, sugerenciaAbono){
  const lineas = texto.split(/\r?\n/);
  const lineaPeriodo = lineas.find(l => l.indexOf('Periodo de consulta')===0);
  let advertenciaPeriodo = '';
  if(!sugerenciaAbono){
    advertenciaPeriodo = 'Aún no se calculó el período de abonos sugerido — te recomendamos cargar primero la Cartola de Movimientos.';
  } else if(lineaPeriodo){
    const valor = lineaPeriodo.split(';')[1]||'';
    if(valor.indexOf(' - ')!==-1){
      const [a,b]=valor.split(' - ');
      if(a.trim()!==sugerenciaAbono.desde || b.trim()!==sugerenciaAbono.hasta){
        advertenciaPeriodo = 'El período de abonos declarado en el archivo ('+a.trim()+' al '+b.trim()+') no coincide con el sugerido ('+sugerenciaAbono.desde+' al '+sugerenciaAbono.hasta+'). Revisa el período.';
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
    porDia[fecha] = (porDia[fecha]||0) + numCL(f[iTotalUsuario]);
    comisionTotal += numCL(f[iComision]);
    reintegroTotal += numCL(f[iReintegro]);
  }
  const fechas = Object.keys(porDia).sort((a,b)=>claveOrdenCL(a).localeCompare(claveOrdenCL(b)));
  if(!fechas.length) throw new Error('No se encontraron pedidos dentro del período declarado.');
  let advertenciaPeriodo = '';
  if(fueraDeRango.length){ const unicas=[...new Set(fueraDeRango)]; advertenciaPeriodo = 'Hay pedidos fuera del período declarado, se ignoraron: '+unicas.join(', ')+'. Revisa si es el archivo correcto.'; }
  return { desde:periodoDeclarado.desde, hasta:periodoDeclarado.hasta, dias:fechas.map(f=>({fecha:f, totalUsuario:Math.round(porDia[f])})), comisionTotal:Math.round(comisionTotal), reintegroTotal:Math.round(reintegroTotal), advertenciaPeriodo };
}

function parseAroniumMediosConciliacion(filas){
  let headerIdx = -1;
  for(let i=0;i<filas.length;i++){ const t=(filas[i]||[]).join(' ').toUpperCase(); if(t.indexOf('FECHA')!==-1 && t.indexOf('CR')!==-1){ headerIdx=i; break; } }
  const dias = [];
  let desde='', hasta='';
  const filaPeriodo = filas.find(f => (f||[]).join(' ').toUpperCase().indexOf('PERIODO')!==-1);
  if(filaPeriodo){
    const full = (filaPeriodo||[]).join(' ');
    const m = full.match(/(\d{2}[\/\-]\d{2}[\/\-]\d{4})\s*-\s*(\d{2}[\/\-]\d{2}[\/\-]\d{4})/);
    if(m){ desde=m[1]; hasta=m[2]; }
  }
  if(headerIdx>=0){
    const header = filas[headerIdx];
    const encontrar = textos => { for(let i=0;i<header.length;i++){ const h=String(header[i]).toUpperCase(); if(textos.some(t=>h.indexOf(t)!==-1)) return i; } return -1; };
    const idxFecha = encontrar(['FECHA']);
    const idxCred = encontrar(['CRÉDITO','CREDITO']);
    const idxDeb = encontrar(['DÉBITO','DEBITO']);
    const idxEf = encontrar(['EFECTIVO']);
    const idxPya = encontrar(['PEDIDOS YA','PEDIDOSYA']);
    const idxTrans = encontrar(['TRANSFERENCIA']);
    for(let i=headerIdx+1;i<filas.length;i++){
      const r = filas[i];
      if(!r || !r[idxFecha]) break;
      if(!/\d{2}-\d{2}-\d{4}/.test(String(r[idxFecha]))) break;
      dias.push({ fecha:r[idxFecha], credito:numCL(r[idxCred]), debito:numCL(r[idxDeb]), efectivo:numCL(r[idxEf]), pedidosYa:numCL(r[idxPya]), transferencia:numCL(r[idxTrans]) });
    }
  }
  return { desde, hasta, dias };
}

/* ===================================================================
   CONCILIACIÓN — detección automática del tipo de archivo, una sola fuente de verdad
   para el dropzone único ("Fuentes")
   =================================================================== */
function filaTextoConciliacion(r){ return (r||[]).join(' ').toUpperCase(); }

// Devuelve el medio de pago que el propio archivo declara ('Debito'/'Credito'/'Prepago'),
// para poder mostrarle al usuario cuál de los 3 .dat detectó cada vez.
function extraerMedioComision(texto){
  const lineas = texto.split(/\r?\n/);
  const linea = lineas.find(l => l.indexOf('Medio de pago')===0);
  return linea ? (linea.split(';')[1]||'').trim() : 'Desconocido';
}
function detectarFuenteDesdeNombreYContenido(nombreArchivo, filasOTexto){
  const ext = nombreArchivo.split('.').pop().toLowerCase();
  if(ext==='dat' || ext==='txt'){
    const muestra = String(filasOTexto).slice(0,2000);
    if(muestra.indexOf('Tipo de movimiento')!==-1 && muestra.indexOf(';')!==-1) return 'Transbank Comisión';
    return null;
  }
  const muestra = filasOTexto.map(filaTextoConciliacion).join(' ');
  if(muestra.indexOf('FECHA DE MOVIMIENTO')!==-1 && muestra.indexOf('TIPO DE MOVIMIENTO')!==-1) return 'Transbank';
  if(muestra.indexOf('NÚMERO DEL PEDIDO')!==-1 || muestra.indexOf('NUMERO DEL PEDIDO')!==-1) return 'PedidosYa';
  if(muestra.indexOf('VENTAS SEG')!==-1 && muestra.indexOf('MEDIOS')!==-1) return 'Aronium Medios de Pago';
  if(muestra.indexOf('FECHA')!==-1 && muestra.indexOf('CR')!==-1) return 'Aronium Medios de Pago';
  return null;
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
  if(r.atraso){
    cont.insertAdjacentHTML('beforeend', '<div class="check-row check-warn" style="margin-bottom:12px;">⚠ Van '+r.atraso.diasAtraso+' día(s) de atraso desde el último período conciliado.</div>');
  }
  if(!lista.length){ cont.innerHTML+='<p style="font-size:12px;color:var(--ink-soft);">Todavía no se ha iniciado ninguna conciliación.</p>'; return; }
  lista.forEach(p=>{
    const pillClase = p.estado==='Completo' ? 'pill-ok' : 'pill-alerta';
    const div = document.createElement('div'); div.className='fuente-card';
    div.onclick = () => irAFuentesDesde(p.desde, p.hasta);
    div.innerHTML =
      '<div class="f-txt"><strong>'+p.desde+' al '+p.hasta+'</strong><span>'+p.progreso+' de '+p.totalFuentes+' fuentes cargadas</span></div>'+
      '<div class="f-right"><span class="pill '+pillClase+'">'+p.estado+'</span>'+
      (p.fechaCreacion?'<div class="fecha">Iniciado '+p.fechaCreacion+'</div>':'')+'</div>';
    cont.appendChild(div);
  });
}

const FUENTES_CONCILIACION_UI = [
  { clave:'Transbank', label:'Cartola de Movimientos Transbank' },
  { clave:'Transbank Comisión', label:'Abonos Transbank' },
  { clave:'PedidosYa', label:'PedidosYa — Lista de pedidos' },
  { clave:'Aronium Medios de Pago', label:'Aronium Medios de Pago' }
];

function irANuevaConciliacion(){
  document.getElementById('nc-error').textContent='';
  document.getElementById('avisos-fuentes').innerHTML='';
  document.getElementById('nc-desde').value='';
  document.getElementById('nc-hasta').value='';
  archivosComisionAcumulados = [];
  irA('screen-conciliacion-nueva');
  cargarSugerenciaPeriodo();
  pintarArchivosComision();
}
function irAFuentesDesde(desde, hasta){
  document.getElementById('nc-error').textContent='';
  document.getElementById('avisos-fuentes').innerHTML='';
  document.getElementById('nc-desde').value = valueFromCL(desde);
  document.getElementById('nc-hasta').value = valueFromCL(hasta);
  archivosComisionAcumulados = [];
  irA('screen-conciliacion-nueva');
  cargarEstadoFuentes();
  pintarArchivosComision();
}
async function cargarSugerenciaPeriodo(){
  document.getElementById('nc-sugerencia').textContent = 'Calculando sugerencia...';
  sugerenciaAbonoActual = null;
  const r = await llamarAPISilencioso('sugerirProximoPeriodo', {});
  if(r.ok && r.desde && r.hasta){
    document.getElementById('nc-desde').value = valueFromCL(r.desde);
    document.getElementById('nc-hasta').value = valueFromCL(r.hasta);
    document.getElementById('nc-sugerencia').textContent = 'Sugerido en base al último período conciliado — puedes ajustarlo.';
  } else {
    document.getElementById('nc-sugerencia').textContent = 'Primera vez que se concilia — elige el período manualmente.';
  }
  pintarEstadoFuentes({ 'Transbank':'Pendiente','Transbank Comisión':'Pendiente','PedidosYa':'Pendiente','Aronium Medios de Pago':'Pendiente' });
}
async function onPeriodoConciliacionChange(){
  archivosComisionAcumulados = [];
  pintarArchivosComision();
  document.getElementById('avisos-fuentes').innerHTML='';
  await cargarEstadoFuentes();
}
async function cargarEstadoFuentes(){
  const desde = fechaCLDesdeValue('nc-desde'), hasta = fechaCLDesdeValue('nc-hasta');
  if(!desde || !hasta){ sugerenciaAbonoActual=null; pintarEstadoFuentes({ 'Transbank':'Pendiente','Transbank Comisión':'Pendiente','PedidosYa':'Pendiente','Aronium Medios de Pago':'Pendiente' }); return; }
  const r = await llamarAPISilencioso('obtenerEstadoProceso', {desde, hasta});
  sugerenciaAbonoActual = r.sugerenciaAbono || null;
  pintarEstadoFuentes(r.fuentes||{});
}
function pintarEstadoFuentes(fuentes){
  const cargadas = Object.values(fuentes).filter(v=>v==='Cargado').length;
  const total = FUENTES_CONCILIACION_UI.length;
  const pct = Math.round(cargadas/total*100);
  document.getElementById('progreso-texto').textContent = cargadas+' de '+total+' fuentes cargadas';
  document.getElementById('progreso-pct').textContent = pct+'%';
  document.getElementById('progreso-fill').style.width = pct+'%';

  const cont = document.getElementById('lista-fuentes-estado'); cont.innerHTML='';
  FUENTES_CONCILIACION_UI.forEach(fu=>{
    const cargado = fuentes[fu.clave]==='Cargado';
    const div = document.createElement('div');
    div.className = 'fuente-status-card'+(cargado?' cargado':'');
    div.innerHTML =
      '<div class="fuente-status-ico">'+(cargado?'✓':'')+'</div>'+
      '<div class="fuente-status-txt"><p class="titulo">'+fu.label+'</p><p class="sub">'+(cargado?'Cargado':'Pendiente')+'</p></div>';
    cont.appendChild(div);
    // Tarjeta destacada de período de abonos, justo después de la Cartola — no es un
    // error, es información necesaria para saber qué fechas pedirle a Transbank.
    if(fu.clave==='Transbank' && sugerenciaAbonoActual){
      const info = document.createElement('div');
      info.className = 'aviso-abono';
      info.innerHTML =
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"></rect><path d="M16 2v4M8 2v4M3 10h18"></path><path d="M9 16l2 2 4-4"></path></svg>'+
        '<div><p class="titulo">Período de abonos: '+sugerenciaAbonoActual.desde+' al '+sugerenciaAbonoActual.hasta+'</p>'+
        '<p class="sub">Usa estas fechas al descargar la extracción masiva en el sitio de Transbank.</p></div>';
      cont.appendChild(info);
    }
  });

  const btn = document.getElementById('btn-ir-revision');
  if(cargadas===total){ btn.disabled=false; btn.textContent='Ir a Revisión'; }
  else{ btn.disabled=true; btn.textContent='Ir a Revisión — faltan '+(total-cargadas)+' fuente'+((total-cargadas)===1?'':'s'); }
}

// Acumula archivos .dat de Transbank Comisión entre gotas sucesivas (se puede soltar
// Débito, Crédito y Prepago en cualquier orden, de a uno, o varios juntos — ahora se
// procesan en secuencia, no en paralelo). Cada entrada: {nombreArchivo, medio, texto}.
let archivosComisionAcumulados = [];
// Período de abonos sugerido, calculado al cargar la Cartola — se usa para avisar si el
// archivo de Comisión declara un período distinto (ver parsearExtraccionTransbankComision).
let sugerenciaAbonoActual = null;

async function procesarArchivoConciliacion(file){
  const errEl = document.getElementById('nc-error'); errEl.textContent='';
  const desde = fechaCLDesdeValue('nc-desde'), hasta = fechaCLDesdeValue('nc-hasta');
  if(!desde || !hasta){ errEl.textContent='Elige el período (Desde y Hasta) antes de subir un archivo'; return; }
  const periodoDeclarado = {desde, hasta};

  try{
    const ext = file.name.split('.').pop().toLowerCase();
    let fuente, filasOTexto;
    if(ext==='dat' || ext==='txt'){
      filasOTexto = await file.text();
      fuente = detectarFuenteDesdeNombreYContenido(file.name, filasOTexto);
    } else {
      filasOTexto = await leerArchivoComoFilas(file);
      fuente = detectarFuenteDesdeNombreYContenido(file.name, filasOTexto);
    }
    if(!fuente){ errEl.textContent='No se pudo identificar el tipo de archivo ("'+file.name+'"). Verifica que sea Cartola Transbank, Comisión, PedidosYa o Aronium.'; return; }

    let resultado;
    if(fuente==='Transbank'){
      const datos = parsearCartolaTransbank(filasOTexto, periodoDeclarado);
      resultado = await llamarAPI('importarTransbankMontos', {data:datos});
      if(resultado.ok){
        sugerenciaAbonoActual = datos.sugerenciaAbono || null;
        mostrarResultadoImport(fuente, [datos.advertenciaPeriodo]);
      }

    } else if(fuente==='Transbank Comisión'){
      const medio = extraerMedioComision(filasOTexto);
      const yaEstaba = archivosComisionAcumulados.find(a => a.nombreArchivo===file.name && a.medio===medio);
      if(yaEstaba){ errEl.textContent = 'Este archivo ("'+file.name+'", medio '+medio+') ya estaba agregado — no se sumó dos veces.'; return; }
      archivosComisionAcumulados.push({ nombreArchivo:file.name, medio, texto:filasOTexto });
      resultado = await guardarYPintarComision();

    } else if(fuente==='PedidosYa'){
      const datos = parsearListaPedidosYa(filasOTexto, periodoDeclarado);
      resultado = await llamarAPI('importarPedidosYaMontos', {data:datos});
      if(resultado.ok) mostrarResultadoImport(fuente, [datos.advertenciaPeriodo]);

    } else if(fuente==='Aronium Medios de Pago'){
      const archivo = parseAroniumMediosConciliacion(filasOTexto);
      if(!archivo.dias.length){ errEl.textContent='No se encontraron días en el archivo de Aronium.'; return; }
      resultado = await llamarAPI('importarAroniumMediosConciliacion', {data:{periodoDeclarado, archivo}});
      if(resultado.ok) mostrarResultadoImport(fuente, resultado.advertencias||[]);
    }
    if(resultado && !resultado.ok) errEl.textContent = resultado.error || 'Error al importar';
  }catch(err){
    errEl.textContent = 'Error leyendo "'+file.name+'": ' + err.message;
  }
}

async function guardarYPintarComision(){
  const desde = fechaCLDesdeValue('nc-desde'), hasta = fechaCLDesdeValue('nc-hasta');
  const resultados = archivosComisionAcumulados.map(a => parsearExtraccionTransbankComision(a.texto, sugerenciaAbonoActual));
  const combinado = combinarExtraccionesTransbank(resultados, {desde, hasta});
  const resultado = await llamarAPI('importarTransbankComision', {data:combinado});
  if(resultado.ok) mostrarResultadoImport('Transbank Comisión', combinado.advertencias);
  pintarArchivosComision();
  return resultado;
}
function pintarArchivosComision(){
  const cont = document.getElementById('lista-archivos-comision');
  if(!cont) return;
  if(!archivosComisionAcumulados.length){ cont.innerHTML=''; return; }
  cont.innerHTML = '<p class="titulo" style="font-size:12px;color:var(--ink-soft);margin:10px 0 4px;">Archivos de Abonos Transbank cargados:</p>' +
    archivosComisionAcumulados.map((a,i)=>
      '<div class="archivo-comision-fila">'+
        '<span>✓ '+a.medio+' — '+a.nombreArchivo+'</span>'+
        '<button type="button" class="btn-quitar-archivo" onclick="quitarArchivoComision('+i+')" title="Quitar este archivo">✕</button>'+
      '</div>'
    ).join('');
}
async function quitarArchivoComision(i){
  archivosComisionAcumulados.splice(i,1);
  if(!archivosComisionAcumulados.length){
    pintarArchivosComision();
    document.getElementById('nc-error').textContent = 'Quitaste el último archivo de Abonos Transbank — el total guardado quedó desactualizado. Sube al menos 1 archivo para volver a calcularlo.';
    return;
  }
  await guardarYPintarComision();
}
function mostrarResultadoImport(fuente, advertencias){
  cacheModulo.conciliaciones = null;
  const cont = document.getElementById('avisos-fuentes');
  cont.innerHTML = '';
  const lista = [...new Set((advertencias||[]).filter(Boolean))];
  lista.forEach(a=>{
    const div = document.createElement('div'); div.className='check-row check-warn'; div.style.marginBottom='8px';
    div.textContent = '⚠ '+a;
    cont.appendChild(div);
  });
  cargarEstadoFuentes();
}

function irARevisionDesdeFuentes(){
  const desde = fechaCLDesdeValue('nc-desde'), hasta = fechaCLDesdeValue('nc-hasta');
  abrirRevisionDesde(desde, hasta);
}

// Dropzone único — reemplaza a los 6 dropzones separados por fuente.
document.addEventListener('DOMContentLoaded', ()=>{
  const dz = document.getElementById('dz-conciliacion');
  const input = document.getElementById('nc-archivo-unico');
  if(!dz || !input) return;
  dz.addEventListener('click', ()=>input.click());
  dz.addEventListener('dragover', e=>{ e.preventDefault(); dz.classList.add('dragover'); });
  dz.addEventListener('dragleave', ()=>dz.classList.remove('dragover'));
  dz.addEventListener('drop', async e=>{
    e.preventDefault(); dz.classList.remove('dragover');
    for(const f of [...(e.dataTransfer.files||[])]) await procesarArchivoConciliacion(f);
  });
  input.addEventListener('change', async e=>{
    for(const f of [...(e.target.files||[])]) await procesarArchivoConciliacion(f);
    input.value = '';
  });
});

/* ===================================================================
   REVISIÓN — sin cambios respecto a la versión anterior
   =================================================================== */
const NOMBRES_MEDIO = {Debito:'Débito', Credito:'Crédito', Efectivo:'Efectivo', PedidosYa:'Pedidos Ya', Transferencia:'Transferencia'};

function abrirRevisionDesde(desde, hasta){
  irA('screen-conciliacion-revision');
  document.getElementById('rev-desde').value = valueFromCL(desde);
  document.getElementById('rev-hasta').value = valueFromCL(hasta);
  cargarRevision();
}

async function cargarRevision(){
  const desde = fechaCLDesdeValue('rev-desde');
  const hasta = fechaCLDesdeValue('rev-hasta');
  const cont = document.getElementById('rev-contenido');
  if(!desde || !hasta){ cont.innerHTML = '<p style="font-size:12px;color:var(--danger);">Elige ambas fechas.</p>'; return; }
  document.getElementById('rev-titulo').textContent = 'Revisión · '+desde+' al '+hasta;
  cont.innerHTML = skeletonCards(3);
  const r = await llamarAPISilencioso('obtenerRevisionPeriodo', {desde, hasta});
  if(!r.ok){ cont.innerHTML = '<p style="font-size:12px;color:var(--danger);">'+(r.error||'Error al cargar')+'</p>'; return; }
  pintarRevision(r);
}

function pintarRevision(r){
  const cont = document.getElementById('rev-contenido');
  const esAncho = window.matchMedia('(min-width: 900px)').matches;
  const kpiHtml =
    '<div class="rev-kpi-row">'+
      '<div class="rev-kpi verde"><div class="lbl">Cuadre</div><div class="val">'+r.resumen.cuadre+' días</div></div>'+
      '<div class="rev-kpi amarillo"><div class="lbl">Inconsistencias</div><div class="val">'+r.resumen.inconsistencias+' días</div></div>'+
      '<div class="rev-kpi rojo"><div class="lbl">Descuadre</div><div class="val">'+r.resumen.descuadre+' días</div></div>'+
    '</div>'+
    '<div class="rev-leyenda">'+
      '<span><span class="punto verde"></span> Todo cuadra</span>'+
      '<span><span class="punto amarillo"></span> Digitación no calza, o error de medio de pago en Aronium</span>'+
      '<span><span class="punto rojo"></span> Descuadre de caja (Efectivo/Transferencia) — posible plata real</span>'+
    '</div>';
  const tablaOCards = esAncho ? tablaRevisionDesktop(r.dias) : tarjetasRevisionMobile(r.dias);
  cont.innerHTML = kpiHtml + tablaOCards +
    '<button class="btn-primary" style="margin-top:16px;" onclick="alert(\'Hallazgos: pantalla en construcción\')">Ir a Hallazgos</button>';
}

function tablaRevisionDesktop(dias){
  let filas = '';
  dias.forEach(d=>{
    if(d.sinCierre){
      filas += '<tr class="fila-dia"><td>'+d.fecha+'</td><td colspan="3" style="text-align:left;font-style:italic;color:var(--danger);">Sin cierre de caja — venta real detectada ('+fmt(d.totalComprobado)+')</td><td style="text-align:center;"><span class="punto rojo"></span></td></tr>';
      return;
    }
    const luces = (d.amarillo?'<span class="punto amarillo"></span> ':'') + (d.rojo?'<span class="punto rojo"></span>':'') + ((!d.amarillo && !d.rojo)?'<span class="punto verde"></span>':'');
    filas += '<tr class="fila-dia" onclick="toggleFilaRevision(this)"><td>'+d.fecha+' ▾</td><td>'+fmt(d.totalAronium)+'</td><td>'+fmt(d.totalRegistro)+'</td><td>'+fmt(d.totalComprobado)+'</td><td style="text-align:center;">'+luces+'</td></tr>';
    d.detallePorMedio.forEach(m=>{
      const claseReg = Math.abs(m.registro-m.comprobado)>1 ? 'dif-rev' : '';
      const claseAr = Math.abs(m.aronium-m.comprobado)>1 ? 'dif-rev-menor' : '';
      filas += '<tr class="fila-medio" style="display:none;"><td>'+NOMBRES_MEDIO[m.medio]+'</td><td class="'+claseAr+'">'+fmt(m.aronium)+'</td><td class="'+claseReg+'">'+fmt(m.registro)+'</td><td>'+fmt(m.comprobado)+'</td><td></td></tr>';
    });
  });
  return '<table class="tabla-rev"><colgroup><col class="c-dia"><col class="c-num"><col class="c-num"><col class="c-num"><col class="c-luz"></colgroup>'+
    '<thead><tr><th>Día</th><th>Aronium</th><th>Registro</th><th>Comprobado</th><th style="text-align:center;">●</th></tr></thead><tbody>'+filas+'</tbody></table>';
}

function toggleFilaRevision(tr){
  tr.classList.toggle('abierta');
  let sib = tr.nextElementSibling;
  while(sib && sib.classList.contains('fila-medio')){
    sib.style.display = tr.classList.contains('abierta') ? 'table-row' : 'none';
    sib = sib.nextElementSibling;
  }
}

function tarjetasRevisionMobile(dias){
  let html = '';
  dias.forEach((d,i)=>{
    if(d.sinCierre){
      html += '<div class="card-dia rojo"><div class="c-top"><strong>'+d.fecha+'</strong><span class="punto rojo"></span></div>'+
        '<p style="font-size:12px;color:var(--danger);margin:4px 0 0;">Sin cierre de caja — venta real detectada ('+fmt(d.totalComprobado)+')</p></div>';
      return;
    }
    const claseCard = d.rojo ? 'rojo' : (d.amarillo ? '' : 'verde');
    const luces = (d.amarillo?'<span class="punto amarillo"></span> ':'') + (d.rojo?'<span class="punto rojo"></span>':'') + ((!d.amarillo && !d.rojo)?'<span class="punto verde"></span>':'');
    const idDet = 'rev-mob-det-'+i;
    let detalleHtml = '';
    d.detallePorMedio.forEach(m=>{
      detalleHtml += '<div class="medio-block"><div class="medio-nombre">'+NOMBRES_MEDIO[m.medio]+'</div>'+
        '<div class="rowline"><span>Aronium</span><b>'+fmt(m.aronium)+'</b></div>'+
        '<div class="rowline"><span>Registro</span><b'+(Math.abs(m.registro-m.comprobado)>1?' style="color:var(--danger);"':'')+'>'+fmt(m.registro)+'</b></div>'+
        '<div class="rowline"><span>Comprobado</span><b>'+fmt(m.comprobado)+'</b></div></div>';
    });
    html += '<div class="card-dia '+claseCard+'" onclick="var e=document.getElementById(\''+idDet+'\');e.style.display=(e.style.display===\'block\'?\'none\':\'block\');">'+
      '<div class="c-top"><strong>'+d.fecha+'</strong>'+luces+'</div>'+
      '<div class="rowline"><span>Aronium</span><b>'+fmt(d.totalAronium)+'</b></div>'+
      '<div class="rowline"><span>Registro</span><b>'+fmt(d.totalRegistro)+'</b></div>'+
      '<div class="rowline"><span>Comprobado</span><b>'+fmt(d.totalComprobado)+'</b></div>'+
      '<div id="'+idDet+'" style="display:none;">'+detalleHtml+'</div>'+
      '</div>';
  });
  return html;
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
