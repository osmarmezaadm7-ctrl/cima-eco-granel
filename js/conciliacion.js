/* ===================================================================
   CONCILIACIÓN — parsers de archivos (SIN CAMBIOS respecto a la versión anterior)
   =================================================================== */
// Proceso actualmente abierto (Fuentes/Revisión/Hallazgos) — se fija al entrar a
// cualquiera de esas 3 pantallas, así "Ir a Hallazgos" y el footer de notificaciones
// siempre saben a qué proceso pertenecen sin tener que volver a preguntarlo.
let procesoActualGlobal = null;

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
  const avisos = document.getElementById('conc-avisos'); avisos.innerHTML='';
  if(r.avisoSinCerrar){
    avisos.insertAdjacentHTML('beforeend', '<div class="check-row check-warn" style="margin-bottom:8px;">⚠ Conciliación del '+r.avisoSinCerrar.desde+' al '+r.avisoSinCerrar.hasta+' lleva '+r.avisoSinCerrar.diasAtraso+' día(s) sin cerrarse.</div>');
  }
  if(r.avisoFaltaIniciar){
    avisos.insertAdjacentHTML('beforeend', '<div class="check-row" style="margin-bottom:8px;background:var(--forest-soft);color:var(--forest-dark);">Falta iniciar la conciliación de la semana del '+r.avisoFaltaIniciar.desde+' al '+r.avisoFaltaIniciar.hasta+'.</div>');
  }
  if(cacheModulo.conciliaciones) poblarFiltroAnios(cacheModulo.conciliaciones.conciliaciones||[]);
  const cont = document.getElementById('lista-conciliacion'); cont.innerHTML='';
  const lista = r.conciliaciones||[];
  if(!lista.length){ cont.innerHTML='<p style="font-size:12px;color:var(--ink-soft);">No hay conciliaciones para mostrar.</p>'; return; }
  lista.forEach(p=>{
    // Cerrada: gris, es historia. Completa: verde, ya se reparó al menos 1 hallazgo.
    // En proceso: ámbar, todavía se puede tocar de punta a punta.
    const pillClase = p.estado==='Cerrada' ? 'pill-menor' : (p.estado==='Completa' ? 'pill-ok' : 'pill-alerta');
    const div = document.createElement('div'); div.className='fuente-card';
    div.onclick = () => abrirProcesoEnEtapaPendiente(p); // CAMBIÓ — antes siempre abría en Fuentes
    div.innerHTML =
      '<div class="f-txt"><strong>'+p.desde+' al '+p.hasta+'</strong><span>'+p.progreso+' de '+p.totalFuentes+' fuentes cargadas</span></div>'+
      '<div class="f-right"><span class="pill '+pillClase+'">'+p.estado+'</span>'+
      (p.fechaCreacion?'<div class="fecha">Iniciado '+p.fechaCreacion+'</div>':'')+'</div>';
    cont.appendChild(div);
  });
}

// Llena el selector de Año con los años realmente presentes en los períodos, sin duplicar
// si el usuario ya tenía uno elegido.
function poblarFiltroAnios(lista){
  const sel = document.getElementById('conc-filtro-anio');
  const actual = sel.value;
  const anios = [...new Set(lista.map(p=>{ const d=parseFechaCLtexto(p.desde); return d?d.getFullYear():null; }).filter(Boolean))].sort((a,b)=>b-a);
  sel.innerHTML = '<option value="">Todos</option>' + anios.map(a=>'<option value="'+a+'">'+a+'</option>').join('');
  if(anios.includes(Number(actual))) sel.value = actual;
}

// Enrutamiento real de la tarjeta — reemplaza el "siempre abre en Fuentes" de antes.
// etapa es de uso interno (no se pinta como texto en ningún lado), solo decide la pantalla.
function abrirProcesoEnEtapaPendiente(p){
  if(p.etapa==='Resumen' || p.estado==='Cerrada'){
    abrirCierreDesde(p.procesoId, p.desde, p.hasta);
  } else if(p.etapa==='Hallazgos'){
    abrirHallazgosDesde(p.procesoId, p.desde, p.hasta);
  } else if(p.etapa==='Revision'){
    abrirRevisionDesde(p.procesoId, p.desde, p.hasta);
  } else {
    irAFuentesDesde(p.desde, p.hasta);
  }
}

// Filtro por período — 100% en el cliente, sobre la lista que ya está en caché (0
// llamadas nuevas a GAS). "Traslapa con el rango elegido", no "coincide exacto".
// Filtro por Mes/Año — 100% en el cliente, sobre la lista que ya está en caché (0
// llamadas nuevas a GAS). Un período "pertenece" al mes/año de su fecha "desde".
function filtrarConciliaciones(){
  const base = cacheModulo.conciliaciones;
  if(!base) return;
  const mesVal = document.getElementById('conc-filtro-mes').value;
  const anioVal = document.getElementById('conc-filtro-anio').value;
  if(mesVal===''&&anioVal===''){ pintarConciliacion(base); return; }
  const filtradas = (base.conciliaciones||[]).filter(p=>{
    const pd = parseFechaCLtexto(p.desde);
    if(!pd) return false;
    if(mesVal!=='' && pd.getMonth()!==Number(mesVal)) return false;
    if(anioVal!=='' && pd.getFullYear()!==Number(anioVal)) return false;
    return true;
  });
  pintarConciliacion(Object.assign({}, base, {conciliaciones: filtradas, avisoFaltaIniciar:null, avisoSinCerrar:null}));
}
function limpiarFiltroConciliaciones(){
  document.getElementById('conc-filtro-mes').value='';
  document.getElementById('conc-filtro-anio').value='';
  if(cacheModulo.conciliaciones) pintarConciliacion(cacheModulo.conciliaciones);
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
  if(!desde || !hasta){ sugerenciaAbonoActual=null; procesoActualGlobal=null; pintarEstadoFuentes({ 'Transbank':'Pendiente','Transbank Comisión':'Pendiente','PedidosYa':'Pendiente','Aronium Medios de Pago':'Pendiente' }); return; }
  const r = await llamarAPISilencioso('obtenerEstadoProceso', {desde, hasta});
  sugerenciaAbonoActual = r.sugerenciaAbono || null;
  procesoActualGlobal = r.procesoId || null; // NUEVO — lo necesita irARevisionDesdeFuentes
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
  abrirRevisionDesde(procesoActualGlobal, desde, hasta);
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

// Período de la Revisión actualmente abierta — ya no se lee de inputs de fecha en el DOM,
// viene siempre del proceso que se abrió (tarjeta del listado, o volviendo desde Hallazgos).
let revPeriodoDesde = '';
let revPeriodoHasta = '';

function abrirRevisionDesde(procesoId, desde, hasta){
  procesoActualGlobal = procesoId;
  revPeriodoDesde = desde;
  revPeriodoHasta = hasta;
  irA('screen-conciliacion-revision');
  cargarRevision();
}

// Volver desde Hallazgos — misma etapa 2, mismo período con el que se abrió el proceso
// (nunca vacío, nunca pide elegir fecha de nuevo).
function volverARevisionDesdeHallazgos(){
  abrirRevisionDesde(procesoActualGlobal, revPeriodoDesde, revPeriodoHasta);
}

// Volver desde Revisión — retrocede un paso del flujo guiado, a Fuentes del mismo período
// (nunca al listado general).
function volverAFuentesDesdeRevision(){
  irAFuentesDesde(revPeriodoDesde, revPeriodoHasta);
}

async function cargarRevision(){
  const desde = revPeriodoDesde;
  const hasta = revPeriodoHasta;
  const cont = document.getElementById('rev-contenido');
  if(!desde || !hasta){ cont.innerHTML = '<p style="font-size:12px;color:var(--danger);">No se pudo determinar el período de este proceso.</p>'; return; }
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
    '<button class="btn-primary" style="margin-top:16px;" onclick="irAHallazgosDesdeRevision()">Ir a Hallazgos</button>';
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

function irAHallazgosDesdeRevision(){
  abrirHallazgosDesde(procesoActualGlobal, revPeriodoDesde, revPeriodoHasta);
}

/* ===================================================================
   HALLAZGOS — etapa 3 del flujo de Conciliación (11/07/2026)
   Se calculan en vivo en el backend (obtenerHallazgosProceso) — acá solo se pintan y se
   guarda su resolución. cacheHallazgosActual guarda el objeto hallazgo completo por id,
   así los botones no tienen que reserializar un objeto dentro de un onclick="".
   =================================================================== */
let cacheHallazgosActual = {};
let ultimoHallazgosResp = null;
let filtroHallazgos = 'Pendiente';

const CATEGORIA_CORTA_HALLAZGO = {
  'Conciliación: Débito Transbank vs digitado':'Débito Transbank vs digitado',
  'Conciliación: Crédito Transbank vs digitado':'Crédito Transbank vs digitado',
  'Conciliación: Pedidos Ya vs digitado':'Pedidos Ya vs digitado',
  'Conciliación: Swap medio de pago Aronium':'Swap medio de pago Aronium',
  'Conciliación: Descuadre de caja':'Descuadre de caja',
  'Conciliación: Sin cierre de caja':'Sin cierre de caja'
};
const ACCION_TEXTO_HALLAZGO = {
  'Conciliación: Débito Transbank vs digitado':'Confirmar y corregir',
  'Conciliación: Crédito Transbank vs digitado':'Confirmar y corregir',
  'Conciliación: Pedidos Ya vs digitado':'Confirmar y corregir',
  'Conciliación: Swap medio de pago Aronium':'Marcar revisado',
  'Conciliación: Descuadre de caja':'Marcar revisado',
  'Conciliación: Sin cierre de caja':'Confirmar'
};

function abrirHallazgosDesde(procesoId, desde, hasta){
  procesoActualGlobal = procesoId;
  revPeriodoDesde = desde;
  revPeriodoHasta = hasta;
  irA('screen-conciliacion-hallazgos');
  document.getElementById('hall-titulo').textContent = 'Hallazgos · '+(desde||'')+' al '+(hasta||'');
  cargarHallazgos(procesoId);
}

async function cargarHallazgos(procesoId){
  filtroHallazgos = 'Pendiente';
  const cont = document.getElementById('hall-contenido');
  if(!procesoId){ cont.innerHTML = '<p style="font-size:12px;color:var(--danger);">Este período todavía no tiene un proceso de conciliación creado.</p>'; document.getElementById('hall-footer').innerHTML=''; return; }
  cont.innerHTML = skeletonCards(3);
  document.getElementById('hall-footer').innerHTML = '';
  const r = await llamarAPISilencioso('obtenerHallazgosProceso', {procesoId});
  if(!r.ok){ cont.innerHTML = '<p style="font-size:12px;color:var(--danger);">'+(r.error||'Error al cargar')+'</p>'; return; }
  document.getElementById('hall-titulo').textContent = 'Hallazgos · '+r.desde+' al '+r.hasta;
  // Deja registrado que se entró a Hallazgos — no bloquea el pintado si falla o tarda.
  llamarAPISilencioso('avanzarEtapa', {procesoId, etapa:'Hallazgos'}).catch(()=>{});
  pintarHallazgos(r);
}

function valorHallazgo_(v){ return (v===null || v===undefined) ? 0 : Number(v); }

function pintarHallazgos(r){
  ultimoHallazgosResp = r;
  cacheHallazgosActual = {};
  r.hallazgos.forEach(h => cacheHallazgosActual[h.id] = h);

  const pendientes = r.hallazgos.filter(h=>h.estado==='Pendiente');
  const resueltas = r.hallazgos.filter(h=>h.estado!=='Pendiente');
  const criticas = pendientes.filter(h=>h.severidad==='Critica');

  const kpiHtml =
    '<div class="rev-kpi-row">'+
      '<div class="rev-kpi"><div class="lbl">Pendientes</div><div class="val">'+pendientes.length+'</div></div>'+
      '<div class="rev-kpi rojo"><div class="lbl">Críticas</div><div class="val">'+criticas.length+'</div></div>'+
      '<div class="rev-kpi"><div class="lbl">Resueltas</div><div class="val">'+resueltas.length+'</div></div>'+
    '</div>'+
    '<div class="pillbar">'+
      '<button class="'+(filtroHallazgos==='Pendiente'?'sel':'')+'" onclick="filtroHallazgos=\'Pendiente\';pintarHallazgos(ultimoHallazgosResp)">Pendientes</button>'+
      '<button class="'+(filtroHallazgos==='Resuelta'?'sel':'')+'" onclick="filtroHallazgos=\'Resuelta\';pintarHallazgos(ultimoHallazgosResp)">Resueltas</button>'+
    '</div>';

  const lista = filtroHallazgos==='Pendiente' ? pendientes : resueltas;
  let listaHtml = '';
  if(!r.hallazgos.length){
    listaHtml = '<p style="font-size:13px;color:var(--ink-soft);">Sin hallazgos en este período — todo cuadra.</p>';
  } else if(!lista.length){
    listaHtml = '<p style="font-size:12.5px;color:var(--ink-soft);">'+(filtroHallazgos==='Pendiente' ? 'Sin hallazgos pendientes.' : 'Todavía no se resolvió ningún hallazgo.')+'</p>';
  } else {
    let fechaAnterior = '';
    lista.forEach(h=>{
      if(h.fechaInicioReal !== fechaAnterior){
        listaHtml += '<p style="font-size:11.5px;color:var(--ink-soft);font-weight:700;text-transform:uppercase;margin:14px 0 8px;">'+h.fechaInicioReal+'</p>';
        fechaAnterior = h.fechaInicioReal;
      }
      listaHtml += tarjetaHallazgo(h);
    });
  }

  const botonCierreHtml = r.estadoProceso==='Completa'
    ? '<button class="btn-primary" style="margin-top:16px;" onclick="irACierreDesdeHallazgos()">Ir a Cierre</button>'
    : '';

  document.getElementById('hall-contenido').innerHTML = kpiHtml + listaHtml + botonCierreHtml;
  pintarFooterNotificarHallazgos(r);
}

function fmtSigno(n){ n = Math.round(n||0); return (n>=0?'+':'-')+fmt(Math.abs(n)); }

function toggleHallazgo(idDom){
  const el = document.getElementById('hbody-'+idDom);
  if(!el) return;
  el.style.display = el.style.display==='none' ? 'block' : 'none';
}

// Resumen de una línea, visible con la tarjeta colapsada — tiene que decir algo útil
// sin necesidad de expandir.
function resumenHallazgo_(h){
  const d = h.detalle || {};
  if(h.categoria === 'Conciliación: Sin cierre de caja') return 'Se detectó '+fmt(h.real)+' en Débito/Crédito/Pedidos Ya ese día';
  if(h.categoria === 'Conciliación: Swap medio de pago Aronium') return 'Caja '+fmtSigno(d.deltaCaja)+' · Tarjetas '+fmtSigno(d.deltaTarjetas);
  if(h.categoria === 'Conciliación: Descuadre de caja') return 'Diferencia '+fmt(Math.abs(d.deltaCaja||0))+' sin explicar';
  return 'Diferencia '+fmt(Math.abs(valorHallazgo_(h.real) - valorHallazgo_(h.esperado)));
}

function filaTablaHallazgo_(nombre, aronium, comprobado){
  const delta = valorHallazgo_(aronium) - valorHallazgo_(comprobado);
  return '<tr><td style="padding:6px 0;font-size:12.5px;color:var(--ink);">'+nombre+'</td>'+
    '<td style="text-align:right;font-size:12.5px;color:var(--ink);">'+fmt(aronium)+'</td>'+
    '<td style="text-align:right;font-size:12.5px;color:var(--ink);">'+fmt(comprobado)+'</td>'+
    '<td style="text-align:right;font-size:12.5px;font-weight:600;color:var(--warn);">'+fmtSigno(delta)+'</td></tr>';
}
function th_(txt, alinDer){
  return '<th style="text-align:'+(alinDer?'right':'left')+';font-size:10.5px;font-weight:400;color:var(--ink-soft);padding:4px 0;border-bottom:0.5px solid var(--border);">'+txt+'</th>';
}

// Tabla real Aronium/Comprobado por medio de pago — reemplaza el par abstracto
// esperado/real. Cada categoría muestra los medios que le corresponden.
function tablaHallazgo_(h){
  const d = h.detalle || {};
  if(h.categoria === 'Conciliación: Sin cierre de caja') return '';
  if(h.categoria === 'Conciliación: Swap medio de pago Aronium'){
    return '<table style="width:100%;border-collapse:collapse;margin:10px 0;"><thead><tr>'+th_('Medio')+th_('Aronium',1)+th_('Comprobado',1)+th_('Delta',1)+'</tr></thead><tbody>'+
      filaTablaHallazgo_('Caja (Efect.+Transf.)', d.cajaAronium, d.cajaComprobado)+
      filaTablaHallazgo_('Tarjetas (Déb.+Créd.)', d.tarjetasAronium, d.tarjetasComprobado)+
      '</tbody></table>';
  }
  if(h.categoria === 'Conciliación: Descuadre de caja'){
    return '<table style="width:100%;border-collapse:collapse;margin:10px 0;"><thead><tr>'+th_('Medio')+th_('Aronium',1)+th_('Comprobado',1)+th_('Delta',1)+'</tr></thead><tbody>'+
      filaTablaHallazgo_('Efectivo', d.efectivoAronium, d.efectivoComprobado)+
      filaTablaHallazgo_('Transferencia', d.transferenciaAronium, d.transferenciaComprobado)+
      '</tbody></table>';
  }
  // Digitación (Débito/Crédito/Pedidos Ya vs digitado) — Aronium es solo referencia, no
  // forma parte de la comparación oficial de esta categoría (esa es Digitado vs Comprobado).
  const medioNombre = h.categoria.indexOf('Débito')!==-1 ? 'Débito' : (h.categoria.indexOf('Crédito')!==-1 ? 'Crédito' : 'Pedidos Ya');
  return '<table style="width:100%;border-collapse:collapse;margin:10px 0;"><thead><tr>'+th_('Medio')+th_('Aronium',1)+th_('Digitado',1)+th_('Comprobado',1)+'</tr></thead><tbody>'+
    '<tr><td style="padding:6px 0;font-size:12.5px;color:var(--ink);">'+medioNombre+'</td>'+
    '<td style="text-align:right;font-size:12.5px;color:var(--ink);">'+fmt(d.aronium)+'</td>'+
    '<td style="text-align:right;font-size:12.5px;color:var(--ink);">'+fmt(h.esperado)+'</td>'+
    '<td style="text-align:right;font-size:12.5px;font-weight:600;color:var(--warn);">'+fmt(h.real)+'</td></tr>'+
    '</tbody></table>';
}

// Traduce el número a lo que significa — nunca implica que "Confirmar" corrige algo,
// salvo en digitación (que sí corrige, y no necesita esta frase porque ya es autoexplicativa).
function explicacionHallazgo_(h){
  const d = h.detalle || {};
  if(h.categoria === 'Conciliación: Swap medio de pago Aronium'){
    return '<p style="font-size:11.5px;color:var(--ink-soft);margin:0 0 8px;">Se cancela casi exacto — no falta plata, quedó mal categorizada en Aronium. No corrige ningún dato, solo deja constancia.</p>';
  }
  if(h.categoria === 'Conciliación: Descuadre de caja'){
    const falta = (d.deltaCaja||0) > 0; // Aronium > Comprobado: el POS registró más ventas en caja que las que se contaron
    const texto = falta
      ? 'Aronium registra más venta en efectivo/transferencia que lo contado en caja — posible plata que no llegó a completar el arqueo.'
      : 'Se contó más plata en caja que lo que las ventas explican — origen no comprobado, no se registra como ingreso automáticamente.';
    return '<p style="font-size:11.5px;color:var(--danger);margin:0 0 8px;">'+texto+' No corrige ningún dato, solo deja constancia.</p>';
  }
  return '';
}

function tarjetaHallazgo(h){
  const resuelta = h.estado !== 'Pendiente';
  const critica = h.severidad==='Critica';
  const claseCritica = critica ? ' critica' : '';
  const pillClase = critica ? 'pill-critica' : 'pill-alerta';
  const idDom = h.id.replace(/[^a-zA-Z0-9]/g,'_');
  const idJs = h.id.replace(/'/g,"\\'");

  if(resuelta){
    const notaHtml = h.nota ? ' — "'+h.nota+'"' : '';
    const notifHtml = h.responsable ? (' · '+h.responsable+(h.notificado?' · notificado':' · sin notificar todavía')) : '';
    return '<div class="hallazgo'+claseCritica+'">'+
      '<div class="h-top"><strong style="font-size:14.5px;">'+CATEGORIA_CORTA_HALLAZGO[h.categoria]+'</strong><span class="pill '+pillClase+'">'+(critica?'Crítica':'Alerta')+'</span></div>'+
      '<p style="font-size:12px;color:var(--ink-soft);margin:0 0 6px;">✓ Resuelto'+notaHtml+notifHtml+'</p>'+
      '<a href="#" style="font-size:11.5px;color:var(--ink-soft);text-decoration:underline;" onclick="event.preventDefault();confirmarRevertirHallazgo(\''+idJs+'\')">Revertir</a>'+
      '</div>';
  }

  const notifLineaHtml = h.responsable ?
    '<label style="display:flex;align-items:center;gap:6px;font-size:11.5px;color:var(--ink-soft);margin:0 0 8px;cursor:pointer;"><input type="checkbox" id="notif-chk-'+idDom+'" checked style="width:auto;margin:0;"> Notificar a '+h.responsable+'</label>' :
    '<p style="font-size:11.5px;color:var(--ink-soft);margin:0 0 8px;">Sin responsable de jornada — no se notifica</p>';

  const sinRechazo = h.categoria === 'Conciliación: Sin cierre de caja' || h.categoria === 'Conciliación: Descuadre de caja';

  // Colapsada por defecto — el resumen de una línea ya dice qué pasó, sin abrir la tarjeta.
  return '<div class="hallazgo'+claseCritica+'">'+
    '<div class="h-top h-top-click" onclick="toggleHallazgo(\''+idDom+'\')">'+
      '<div><strong style="font-size:14.5px;">'+CATEGORIA_CORTA_HALLAZGO[h.categoria]+'</strong>'+
      '<div style="font-size:11.5px;color:var(--ink-soft);margin-top:2px;">'+resumenHallazgo_(h)+'</div></div>'+
      '<span class="pill '+pillClase+'">'+(critica?'Crítica':'Alerta')+'</span>'+
    '</div>'+
    '<div id="hbody-'+idDom+'" style="display:none;">'+
      tablaHallazgo_(h)+
      explicacionHallazgo_(h)+
      notifLineaHtml+
      '<textarea id="nota-'+idDom+'" placeholder="Nota ('+(critica?'obligatoria':'opcional')+')" style="min-height:34px;margin-bottom:'+(critica?'5':'9')+'px;'+(critica?'border-color:var(--danger);':'')+'"></textarea>'+
      (critica ? '<p style="font-size:11px;color:var(--danger);margin:0 0 9px;">La nota es obligatoria para confirmar un hallazgo crítico.</p>' : '')+
      (sinRechazo ? '' : '<button class="btn-secondary" style="margin-bottom:6px;" onclick="responderHallazgo(\''+idJs+'\',\'rechazar\')">Rechazar</button>')+
      '<button class="btn-primary" style="'+(critica?'background:var(--danger);':'')+'" onclick="responderHallazgo(\''+idJs+'\',\'confirmar\')">'+ACCION_TEXTO_HALLAZGO[h.categoria]+'</button>'+
    '</div>'+
  '</div>';
}

function confirmarRevertirHallazgo(id){
  const h = cacheHallazgosActual[id];
  if(!h) return;
  const idJs = id.replace(/'/g,"\\'");
  const texto = h.aplicado
    ? 'Esto va a restaurar el valor digitado original ('+fmt(h.esperado)+') en el cierre de caja de ese día, y el hallazgo vuelve a Pendiente.'
    : 'El hallazgo vuelve a Pendiente. No había ningún dato corregido que restaurar.';
  abrirModal(
    '<h3 style="font-size:16px;margin:0 0 8px;">¿Revertir este hallazgo?</h3>'+
    '<p style="font-size:12.5px;color:var(--ink-soft);margin:0 0 14px;">'+texto+'</p>'+
    '<div style="display:flex;gap:8px;"><button class="btn-secondary" onclick="cerrarModal()">Cancelar</button><button class="btn-primary" style="background:var(--danger);" onclick="revertirHallazgo(\''+idJs+'\')">Revertir</button></div>'
  );
}

async function revertirHallazgo(id){
  cerrarModal();
  const r = await llamarAPI('revertirHallazgoConciliacion', {procesoId: procesoActualGlobal, hallazgoId: id});
  if(!r.ok){ alert(r.error||'No se pudo revertir'); return; }
  cargarHallazgos(procesoActualGlobal);
}

async function responderHallazgo(id, accion){
  const h = cacheHallazgosActual[id];
  if(!h) return;
  const idDom = id.replace(/[^a-zA-Z0-9]/g,'_');
  const notaEl = document.getElementById('nota-'+idDom);
  const nota = notaEl ? notaEl.value.trim() : '';
  if(h.severidad==='Critica' && !nota){ alert('Este hallazgo es crítico — escribe una nota antes de confirmarlo.'); return; }
  const chkNotif = document.getElementById('notif-chk-'+idDom);
  const notificar = chkNotif ? chkNotif.checked : true; // sin checkbox (sin responsable) -> no aplica, el backend lo ignora
  const r = await llamarAPI('confirmarHallazgoConciliacion', {procesoId: procesoActualGlobal, hallazgo: h, accionHallazgo: accion, nota, notificar});
  if(!r.ok){ alert(r.error||'No se pudo guardar'); return; }
  cargarHallazgos(procesoActualGlobal);
}

// Footer fijo "Enviar notificaciones" — solo aparece si hay algo Resuelto sin notificar
// todavía. Nunca se envía solo al confirmar; es una acción aparte, agrupada por persona.
function pintarFooterNotificarHallazgos(r){
  const pendientesNotif = r.hallazgos.filter(h => h.estado!=='Pendiente' && h.responsable && !h.notificado);
  const footer = document.getElementById('hall-footer');
  if(!pendientesNotif.length){ footer.innerHTML=''; return; }
  const personas = [...new Set(pendientesNotif.map(h=>h.responsable))];
  footer.innerHTML =
    '<div class="hall-footer-notif">'+
      '<div><strong style="font-size:13.5px;">'+pendientesNotif.length+' hallazgo(s) listos para notificar</strong>'+
      '<p style="font-size:11.5px;color:var(--ink-soft);margin:2px 0 0;">Se avisará a '+personas.join(', ')+'</p></div>'+
      '<button class="btn-primary" style="width:auto;padding:11px 16px;" onclick="enviarNotificacionesProceso()">Enviar notificaciones</button>'+
    '</div>';
}

async function enviarNotificacionesProceso(){
  const r = await llamarAPI('enviarNotificacionesConciliacion', {procesoId: procesoActualGlobal});
  if(!r.ok){ alert(r.error||'No se pudo enviar'); return; }
  cargarHallazgos(procesoActualGlobal);
}

/* ===================================================================
   NOTIFICACIONES — aviso consolidado al responsable, sin expiración por tiempo (11/07/2026)
   Cada notificación ya viene consolidada desde el backend (1 por persona, agrupando todos
   sus hallazgos reparados de un proceso) — acá solo se pinta y se marca como vista.
   =================================================================== */
// Intenta leer el mensaje como JSON estructurado ({periodo, dias:[{fecha,critica,items}]}).
// Si falla (notificaciones viejas, guardadas como oración plana antes del 12/07/2026),
// cae a mostrar el texto tal cual — no hace falta migrar lo ya archivado.
// El título prioriza lo más grave (12/07/2026, con Osmar — "se hizo una conciliación" no
// dice nada; el título tiene que decir qué se encontró): 1) algo crítico sin explicar,
// 2) algo corregido, 3) todo revisado sin cambios. El período baja a subtítulo.
function formatFechaNotif_(fecha) {
  if (!fecha) return '';
  const d = new Date(fecha);
  if (isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0'), mm = String(d.getMinutes()).padStart(2, '0');
  const hoy = new Date();
  if (d.toDateString() === hoy.toDateString()) return 'Hoy, ' + hh + ':' + mm;
  return d.getDate() + ' de ' + NOMBRES_MES[d.getMonth()] + ', ' + hh + ':' + mm;
}

// CAMBIO 13/07/2026 (con Osmar — Producción): ahora recibe fechaCreacion además del
// mensaje, para poder destacarla en grande — antes ninguna notificación mostraba fecha.
// Los mensajes de Producción (nuevoConteo, pedidoProduccion, produccionConfirmada) son
// JSON con un campo `tipo`, mismo patrón que ya usaba Conciliación con `payload.dias` —
// título real ("Nuevo pedido de producción") en vez del genérico "Notificación".
function construirCuerpoNotificacion_(mensaje, fechaCreacion) {
  let payload = null;
  try { payload = JSON.parse(mensaje); } catch (e) {}

  if (payload && payload.tipo) {
    const fechaDestacada = formatFechaNotif_(fechaCreacion);
    if (payload.tipo === 'nuevoConteo') {
      return { titulo: 'Nuevo conteo', fechaDestacada: fechaDestacada, esAlerta: false,
        cuerpo: '<p style="font-size:12.5px;color:var(--ink-soft);margin:0;">Contado por ' + payload.nombre + '</p>' };
    }
    if (payload.tipo === 'pedidoProduccion') {
      return { titulo: 'Nuevo pedido de producción', fechaDestacada: fechaDestacada, esAlerta: false,
        cuerpo: '<p style="font-size:12.5px;color:var(--ink-soft);margin:0;">Enviado por ' + payload.nombre + (payload.observacion ? ' — ' + payload.observacion : '') + '</p>' };
    }
    if (payload.tipo === 'produccionConfirmada') {
      return { titulo: 'Producción confirmada', fechaDestacada: fechaDestacada, esAlerta: false,
        cuerpo: '<p style="font-size:12.5px;color:var(--ink-soft);margin:0;">' + (payload.resumen || '') + ' — ' + payload.nombre + '</p>' };
    }
  }

  if (!payload || !payload.dias) {
    return { titulo: 'Notificación', subtitulo: '', esAlerta: false, cuerpo: '<p style="font-size:12.5px;color:var(--ink-soft);margin:0;">' + mensaje + '</p>' };
  }

  const todos = [];
  payload.dias.forEach(d => d.items.forEach(it => todos.push(it)));
  const corregidos = todos.filter(it=>it.corregido);
  const diasCriticos = payload.dias.filter(d=>d.critica);
  const esAlerta = diasCriticos.length > 0;

  let titulo;
  if(esAlerta){
    if(diasCriticos.length === 1){
      const criticosDeEseDia = diasCriticos[0].items.filter(it=>it.critica);
      titulo = criticosDeEseDia.length === 1
        ? (criticosDeEseDia[0].categoria + ' sin explicar — ' + diasCriticos[0].fecha)
        : (criticosDeEseDia.length + ' hallazgos críticos — ' + diasCriticos[0].fecha);
    } else {
      titulo = diasCriticos.length + ' días con hallazgos críticos';
    }
  } else if(corregidos.length){
    titulo = 'Se corrigieron ' + corregidos.length + ' hallazgo' + (corregidos.length===1?'':'s') + ' de digitación';
  } else {
    titulo = todos.length + ' hallazgo' + (todos.length===1?'':'s') + ' revisado' + (todos.length===1?'':'s') + ', sin cambios';
  }
  const subtitulo = 'Conciliación ' + payload.periodo + ' · ' + todos.length + ' hallazgo' + (todos.length===1?'':'s') + ' revisado' + (todos.length===1?'':'s');

  let cuerpo = '';
  payload.dias.forEach(d=>{
    cuerpo += '<div class="notif-linea'+(d.critica?' critica':'')+'"><span class="fecha-linea">'+d.fecha+'</span>';
    d.items.forEach(it=>{
      const montoHtml = (it.corregido && it.valorAnterior!=null && it.valorCorregido!=null)
        ? ' <span class="mono" style="font-weight:600;font-size:11.5px;color:var(--forest);">'+fmt(it.valorAnterior)+' → '+fmt(it.valorCorregido)+'</span>'
        : '';
      // CAMBIO 12/07/2026 (con Osmar) — Descuadre/Swap no tienen valorAnterior/valorCorregido
      // (nunca se "corrigen"), así que antes solo mostraban la nota manual. Si el backend ya
      // mandó el monto calculado, se pinta como línea destacada antes de la nota. Notificaciones
      // viejas (sin estos campos) caen directo al comportamiento anterior, sin romper nada.
      let montoDestacadoHtml = '';
      if(it.montoDescuadre!=null && it.direccionDescuadre){
        const color = it.direccionDescuadre==='falta' ? 'var(--danger)' : 'var(--success)';
        const texto = it.direccionDescuadre==='falta' ? 'Faltan ' : 'Sobran ';
        montoDestacadoHtml = '<div style="font-size:13px;font-weight:700;color:'+color+';margin-top:2px;">'+texto+fmt(it.montoDescuadre)+'</div>'+
          '<div class="item-sub">Contado '+fmt(it.contado)+' → Sistema '+fmt(it.sistema)+'</div>';
      } else if(it.montoSwap!=null){
        montoDestacadoHtml = '<div style="font-size:13px;font-weight:700;color:var(--warn);margin-top:2px;">'+fmt(it.montoSwap)+' mal clasificado</div>'+
          '<div class="item-sub">Caja '+fmt(it.cajaContado)+' → '+fmt(it.cajaSistema)+'</div>'+
          '<div class="item-sub">Tarjetas '+fmt(it.tarjetasContado)+' → '+fmt(it.tarjetasSistema)+'</div>';
      }
      const subHtml = it.corregido ? ('Corregido'+(it.nota?' — '+it.nota:'')) : (it.nota || 'Revisado');
      cuerpo += '<div class="item-row"><div class="item-cat">'+it.categoria+montoHtml+'</div>'+montoDestacadoHtml+'<div class="item-sub" style="font-style:italic;">'+(montoDestacadoHtml?'Nota: ':'')+subHtml+'</div></div>';
    });
    cuerpo += '</div>';
  });
  return { titulo: titulo, subtitulo: subtitulo, esAlerta: esAlerta, cuerpo: cuerpo };
}

async function cargarNotificaciones(){
  const cont = document.getElementById('notif-home');
  if(!cont) return;
  const r = await llamarAPISilencioso('obtenerNotificacionesActivas', {});
  cont.innerHTML='';
  (r.notificaciones||[]).forEach(n=>{
    const c = construirCuerpoNotificacion_(n.mensaje, n.fechaCreacion);
    const iconoHtml = c.esAlerta
      ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:1px;"><path d="M12 9v4"></path><path d="M12 17h.01"></path><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path></svg>'
      : '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:1px;color:var(--ink-soft);"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>';
    // NUEVO 13/07/2026 (con Osmar — Producción): si la notificación trae accionNotif (ej.
    // "abrirRevision"), se agrega un botón de acción además de "Marcar como vista" — el
    // botón de acción marca vista Y navega en un solo clic. Notificaciones sin accionNotif
    // (como las de Conciliación) se ven exactamente igual que antes.
    const accionBtn = n.accionNotif==='abrirRevision'
      ? '<button class="btn-primary" onclick="accionNotificacion(this,\''+n.id+'\',\'abrirRevision\')">Ver revisión</button>'
      : n.accionNotif==='abrirPauta'
      ? '<button class="btn-primary" onclick="accionNotificacion(this,\''+n.id+'\',\'abrirPauta\')">Ver pauta</button>'
      : '';
    const marcarBtn = '<button class="'+(n.accionNotif?'btn-secondary':'btn-primary')+'" style="'+(n.accionNotif?'':'width:100%;')+'" onclick="marcarNotificacionComoVista(this,\''+n.id+'\')">Marcar como vista</button>';
    const div = document.createElement('div');
    div.className = 'notif-card';
    div.innerHTML =
      '<div class="n-top">'+iconoHtml+
      '<div><p style="font-size:14px;margin:0;font-weight:700;color:'+(c.esAlerta?'var(--danger)':'var(--ink)')+';">'+c.titulo+'</p>'+
      (c.fechaDestacada ? '<p style="font-size:17px;font-weight:800;color:var(--forest);margin:2px 0 0;">'+c.fechaDestacada+'</p>' : (c.subtitulo ? '<p style="font-size:11px;color:var(--ink-soft);margin:2px 0 0;">'+c.subtitulo+'</p>' : ''))+
      '</div></div>'+
      c.cuerpo+
      '<div class="n-acciones" style="margin-top:12px;">'+accionBtn+marcarBtn+'</div>';
    cont.appendChild(div);
  });
}

async function marcarNotificacionComoVista(btn, id){
  btn.disabled = true; btn.textContent='...';
  const r = await llamarAPISilencioso('marcarNotificacionVista', {id});
  if(r.ok){ btn.closest('.notif-card').remove(); }
  else { btn.disabled=false; btn.textContent='Marcar como vista'; alert(r.error||'No se pudo marcar'); }
}

// NUEVO 13/07/2026 (con Osmar — Producción): botón de acción de una notificación — marca
// vista y navega a la vez (confirmado con Osmar: un solo clic, no dos pasos separados).
async function accionNotificacion(btn, id, accion){
  btn.disabled = true;
  await llamarAPISilencioso('marcarNotificacionVista', {id});
  const card = btn.closest('.notif-card'); if(card) card.remove();
  if(accion==='abrirRevision' && typeof abrirRevision==='function') abrirRevision();
  if(accion==='abrirPauta' && typeof abrirPauta==='function') abrirPauta();
}

/* ===================================================================
   CIERRE — etapa 4 del flujo de Conciliación (12/07/2026)
   Reusa la misma llamada que Hallazgos (obtenerHallazgosProceso, ya extendida con
   dias/resumen/comisiones) — cero lecturas nuevas a Sheets. El día por día usa el mismo
   patrón visual de Revisión (tabla + semáforo + expandible), pero la columna final
   muestra el desenlace de cada día en vez del detalle por medio de pago, y se agrega
   una fila de Total período.
   =================================================================== */
let ultimoCierreResp = null;

// Cerrada es punto final de solo lectura — no puede encadenar "Volver" hacia Hallazgos ->
// Revisión -> Fuentes (dejaría navegar/editar etapas de un proceso ya cerrado). Cierre es
// la ÚNICA pantalla a la que entra un proceso Cerrada (ver abrirProcesoEnEtapaPendiente),
// así que cortando acá alcanza — no hace falta tocar nada de Hallazgos/Revisión/Fuentes.
function volverAHallazgosDesdeCierre(){
  if(ultimoCierreResp && ultimoCierreResp.estadoProceso === 'Cerrada'){
    abrirConciliacion(true); // forzar=true: refresca el listado para que se vea 'Cerrada'
    return;
  }
  abrirHallazgosDesde(procesoActualGlobal, revPeriodoDesde, revPeriodoHasta);
}

function irACierreDesdeHallazgos(){
  abrirCierreDesde(procesoActualGlobal, revPeriodoDesde, revPeriodoHasta);
}

function abrirCierreDesde(procesoId, desde, hasta){
  procesoActualGlobal = procesoId;
  revPeriodoDesde = desde;
  revPeriodoHasta = hasta;
  irA('screen-conciliacion-cierre');
  document.getElementById('cierre-titulo').textContent = 'Cierre · '+(desde||'')+' al '+(hasta||'');
  cargarCierre(procesoId);
}

async function cargarCierre(procesoId){
  const cont = document.getElementById('cierre-contenido');
  if(!procesoId){ cont.innerHTML = '<p style="font-size:12px;color:var(--danger);">Este período todavía no tiene un proceso de conciliación creado.</p>'; return; }
  cont.innerHTML = skeletonCards(3);
  const r = await llamarAPISilencioso('obtenerHallazgosProceso', {procesoId});
  if(!r.ok){ cont.innerHTML = '<p style="font-size:12px;color:var(--danger);">'+(r.error||'Error al cargar')+'</p>'; return; }
  document.getElementById('cierre-titulo').textContent = 'Cierre · '+r.desde+' al '+r.hasta;
  llamarAPISilencioso('avanzarEtapa', {procesoId, etapa:'Resumen'}).catch(()=>{});
  ultimoCierreResp = r;
  pintarCierre(r);
}

function pintarCierre(r){
  const cerrada = r.estadoProceso === 'Cerrada';
  const badgeHtml = '<div style="margin-bottom:12px;"><span class="pill pill-ok">'+(cerrada?'Cerrada':'Completa')+'</span></div>';

  const volverTexto = document.getElementById('cierre-volver-texto');
  if(volverTexto) volverTexto.textContent = cerrada ? 'Salir' : 'Volver';

  const kpiHtml =
    '<div class="rev-kpi-row">'+
      '<div class="rev-kpi verde"><div class="lbl">Cuadre</div><div class="val">'+r.resumen.cuadre+' días</div></div>'+
      '<div class="rev-kpi amarillo"><div class="lbl">Inconsistencias</div><div class="val">'+r.resumen.inconsistencias+' días</div></div>'+
      '<div class="rev-kpi rojo"><div class="lbl">Descuadre</div><div class="val">'+r.resumen.descuadre+' días</div></div>'+
    '</div>';

  const esAncho = window.matchMedia('(min-width: 900px)').matches;
  const tablaOCards = esAncho ? tablaCierreDesktop(r.dias, r.hallazgos) : tarjetasCierreMobile(r.dias, r.hallazgos);

  const comisionesHtml =
    '<div style="font-size:12.5px;font-weight:700;margin:18px 0 8px;">Comisiones del período</div>'+
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">'+
      tarjetaComisionCierre_('Transbank', 'Transbank Comisión', r.comisiones.transbank)+
      tarjetaComisionCierre_('Pedidos Ya', 'PedidosYa', r.comisiones.pedidosYa)+
    '</div>';

  const footerHtml = cerrada
    ? '<p style="font-size:12px;color:var(--ink-soft);margin-top:18px;">Este proceso está cerrado — de solo lectura.</p>'
    : '<button class="btn-primary" style="margin-top:18px;" onclick="abrirModalCerrarConciliacion()">Cerrar conciliación</button>';

  document.getElementById('cierre-contenido').innerHTML = badgeHtml + kpiHtml + tablaOCards + comisionesHtml + footerHtml;
}

function resumenDiaCierre_(d, propios){
  if(d.sinCierre) return 'Sin cierre, sumado a otro día del cierre';
  if(!propios.length) return 'Cuadra';
  const aplicados = propios.filter(h=>h.aplicado);
  if(aplicados.length){
    const total = aplicados.reduce((s,h)=> s + (valorHallazgo_(h.real)-valorHallazgo_(h.esperado)), 0);
    return 'Corregido '+fmtSigno(total)+(propios.length>aplicados.length ? ', otros revisados' : '');
  }
  return propios.length+' hallazgo'+(propios.length===1?'':'s')+' revisado'+(propios.length===1?'':'s')+', sin cambios';
}

function detalleHallazgoCierre_(h){
  const nombre = CATEGORIA_CORTA_HALLAZGO[h.categoria] || h.categoria;
  const cambioHtml = h.aplicado ? '<div class="mono" style="font-size:12.5px;margin:2px 0;">'+fmt(h.esperado)+' → '+fmt(h.real)+'</div>' : '';
  const notaHtml = h.nota ? '<div style="font-size:11.5px;color:var(--ink-soft);">'+h.nota+'</div>' : '';
  const quienHtml = h.responsable ? ' · '+h.responsable : '';
  return '<div style="padding:4px 2px;"><div style="display:flex;justify-content:space-between;font-size:12.5px;font-weight:600;">'+
    '<span>'+nombre+'</span><span style="color:var(--ink-soft);font-weight:400;">'+(h.aplicado?'Corregido':'Revisado')+quienHtml+'</span></div>'+
    cambioHtml+notaHtml+'</div>';
}

function tablaCierreDesktop(dias, hallazgos){
  const porDia = {};
  hallazgos.forEach(h=>{ (porDia[h.fechaInicioReal] = porDia[h.fechaInicioReal] || []).push(h); });

  let filas = '', tA=0, tR=0, tC=0;
  dias.forEach(d=>{
    tA += d.totalAronium||0; tR += d.totalRegistro||0; tC += d.totalComprobado||0;
    const propios = porDia[d.fechaInicioReal] || [];
    const numsHtml = d.sinCierre
      ? '<td colspan="3" style="text-align:left;font-style:italic;color:var(--danger);">Sin cierre de caja ('+fmt(d.totalComprobado)+')</td>'
      : '<td>'+fmt(d.totalAronium)+'</td><td>'+fmt(d.totalRegistro)+'</td><td>'+fmt(d.totalComprobado)+'</td>';
    filas += '<tr class="fila-dia" onclick="toggleFilaRevision(this)"><td>'+d.fecha+' ▾</td>'+numsHtml+
      '<td style="text-align:left;font-size:11.5px;color:var(--ink-soft);">'+resumenDiaCierre_(d, propios)+'</td></tr>';
    if(!propios.length){
      filas += '<tr class="fila-medio" style="display:none;"><td colspan="5" style="font-size:12px;color:var(--ink-soft);">Sin hallazgos este día.</td></tr>';
    } else {
      propios.forEach(h=>{
        filas += '<tr class="fila-medio" style="display:none;"><td colspan="5">'+detalleHallazgoCierre_(h)+'</td></tr>';
      });
    }
  });
  const filaTotal = '<tr style="background:var(--forest-soft);font-weight:700;"><td>Total período</td><td>'+fmt(tA)+'</td><td>'+fmt(tR)+'</td><td>'+fmt(tC)+'</td><td></td></tr>';

  return '<table class="tabla-rev"><colgroup><col class="c-dia"><col class="c-num"><col class="c-num"><col class="c-num"><col></colgroup>'+
    '<thead><tr><th>Día</th><th>Aronium</th><th>Registro</th><th>Comprobado</th><th>Quedó así</th></tr></thead>'+
    '<tbody>'+filas+filaTotal+'</tbody></table>';
}

// Vista mobile — mismo patrón que tarjetasRevisionMobile (tarjeta por día, click para
// expandir), pero el detalle es la resolución de cada hallazgo, no el desglose por medio
// de pago. La fila de Total período va aparte, al final, como una tarjeta propia.
function tarjetasCierreMobile(dias, hallazgos){
  const porDia = {};
  hallazgos.forEach(h=>{ (porDia[h.fechaInicioReal] = porDia[h.fechaInicioReal] || []).push(h); });

  let html = '', tA=0, tR=0, tC=0;
  dias.forEach((d,i)=>{
    tA += d.totalAronium||0; tR += d.totalRegistro||0; tC += d.totalComprobado||0;
    const propios = porDia[d.fechaInicioReal] || [];
    const claseCard = d.sinCierre ? 'rojo' : (d.rojo ? 'rojo' : (d.amarillo ? '' : 'verde'));
    const luces = d.sinCierre ? '<span class="punto rojo"></span>'
      : ((d.amarillo?'<span class="punto amarillo"></span> ':'') + (d.rojo?'<span class="punto rojo"></span>':'') + ((!d.amarillo && !d.rojo)?'<span class="punto verde"></span>':''));
    const idDet = 'cierre-mob-det-'+i;
    const numsHtml = d.sinCierre
      ? '<p style="font-size:12px;color:var(--danger);font-style:italic;margin:4px 0 0;">Sin cierre de caja ('+fmt(d.totalComprobado)+')</p>'
      : '<div class="rowline"><span>Aronium</span><b>'+fmt(d.totalAronium)+'</b></div>'+
        '<div class="rowline"><span>Registro</span><b>'+fmt(d.totalRegistro)+'</b></div>'+
        '<div class="rowline"><span>Comprobado</span><b>'+fmt(d.totalComprobado)+'</b></div>';
    let detalleHtml = '';
    if(!propios.length){
      detalleHtml = '<p style="font-size:11.5px;color:var(--ink-soft);margin:8px 0 0;">Sin hallazgos este día.</p>';
    } else {
      detalleHtml = '<div style="margin-top:8px;border-top:1px solid var(--border);padding-top:8px;">'+
        propios.map(h=>detalleHallazgoCierre_(h)).join('')+'</div>';
    }
    html += '<div class="card-dia '+claseCard+'" onclick="var e=document.getElementById(\''+idDet+'\');e.style.display=(e.style.display===\'block\'?\'none\':\'block\');">'+
      '<div class="c-top"><strong>'+d.fecha+'</strong>'+luces+'</div>'+
      numsHtml+
      '<p style="font-size:11.5px;color:var(--ink-soft);margin:6px 0 0;">'+resumenDiaCierre_(d, propios)+'</p>'+
      '<div id="'+idDet+'" style="display:none;">'+detalleHtml+'</div>'+
      '</div>';
  });

  html += '<div class="card-dia" style="background:var(--forest-soft);">'+
    '<div class="rowline"><span>Total período · Aronium</span><b>'+fmt(tA)+'</b></div>'+
    '<div class="rowline"><span>Registro</span><b>'+fmt(tR)+'</b></div>'+
    '<div class="rowline"><span>Comprobado</span><b>'+fmt(tC)+'</b></div></div>';

  return html;
}

function tarjetaComisionCierre_(nombre, fuente, c){
  if(!c.monto){
    return '<div style="background:var(--surface);border:1.5px solid var(--border);border-radius:14px;padding:13px;">'+
      '<div style="font-size:11px;color:var(--ink-soft);">'+nombre+'</div>'+
      '<div style="font-size:12px;color:var(--ink-soft);margin-top:8px;">Sin comisión calculada.</div></div>';
  }
  const accionHtml = c.confirmado
    ? '<div style="display:flex;align-items:center;gap:6px;background:var(--forest-soft);color:var(--forest);font-size:11.5px;font-weight:700;padding:7px;border-radius:9px;justify-content:center;">✓ Registrado</div>'
    : '<button class="btn-line" style="margin-top:0;padding:9px;font-size:12px;" onclick="abrirModalRegistrarGasto(\''+fuente+'\')">Registrar gasto</button>';
  return '<div style="background:var(--surface);border:1.5px solid var(--border);border-radius:14px;padding:13px;">'+
    '<div style="font-size:11px;color:var(--ink-soft);">'+nombre+' <span style="opacity:.75;">(IVA incluido)</span></div>'+
    '<div class="mono" style="font-weight:700;font-size:18px;margin:3px 0 9px;">'+fmt(c.monto)+'</div>'+
    accionHtml+
  '</div>';
}

function abrirModalRegistrarGasto(fuente){
  const c = fuente === 'Transbank Comisión' ? ultimoCierreResp.comisiones.transbank : ultimoCierreResp.comisiones.pedidosYa;
  const nombre = fuente === 'Transbank Comisión' ? 'Transbank' : 'Pedidos Ya';
  const naturaleza = fuente === 'Transbank Comisión' ? 'Gasto Transbank' : 'Comisión PedidosYa';
  abrirModal(
    '<h3 style="font-size:15px;">Confirmar registro de gasto</h3>'+
    '<p style="font-size:11.5px;color:var(--ink-soft);margin:2px 0 10px;">Comisión '+nombre+' · período hasta '+revPeriodoHasta+'</p>'+
    '<div class="rowline"><span>Negocio</span><b>Cima Eco-Granel</b></div>'+
    '<div class="rowline"><span>Naturaleza</span><b>'+naturaleza+'</b></div>'+
    '<div class="rowline"><span>Medio de pago</span><b>Descuento en liquidación</b></div>'+
    '<div class="rowline" style="font-size:14px;font-weight:700;"><span>Monto (IVA incluido)</span><b>'+fmt(c.monto)+'</b></div>'+
    '<p style="font-size:11px;color:var(--ink-soft);margin:10px 0 0;">Esto crea un Egreso en Finanzas. No hay forma de deshacerlo desde aquí — si es un error, se corrige manualmente en Finanzas.</p>'+
    '<div class="error-msg" id="cierre-modal-error"></div>'+
    '<div style="display:flex;gap:8px;margin-top:14px;"><button class="btn-secondary" onclick="cerrarModal()">Cancelar</button><button class="btn-primary" onclick="ejecutarRegistrarGasto(\''+fuente+'\')">Confirmar y registrar</button></div>'
  );
}

async function ejecutarRegistrarGasto(fuente){
  const r = await llamarAPI('confirmarGastoComision', {procesoId: procesoActualGlobal, fuente});
  if(!r.ok){ const e=document.getElementById('cierre-modal-error'); if(e) e.textContent = r.error||'No se pudo registrar'; return; }
  cerrarModal();
  cargarCierre(procesoActualGlobal);
}

function abrirModalCerrarConciliacion(){
  abrirModal(
    '<h3 style="font-size:16px;margin:0 0 8px;">¿Cerrar esta conciliación?</h3>'+
    '<p style="font-size:12.5px;color:var(--ink-soft);margin:0 0 14px;">El proceso queda de solo lectura. No se van a poder volver a subir fuentes ni cambiar hallazgos de este período.</p>'+
    '<div class="error-msg" id="cierre-modal-error"></div>'+
    '<div style="display:flex;gap:8px;"><button class="btn-secondary" onclick="cerrarModal()">Cancelar</button><button class="btn-primary" onclick="ejecutarCerrarConciliacion()">Cerrar conciliación</button></div>'
  );
}

async function ejecutarCerrarConciliacion(){
  const r = await llamarAPI('cerrarConciliacion', {procesoId: procesoActualGlobal});
  if(!r.ok){ const e=document.getElementById('cierre-modal-error'); if(e) e.textContent = r.error||'No se pudo cerrar'; return; }
  cerrarModal();
  cargarCierre(procesoActualGlobal);
}
