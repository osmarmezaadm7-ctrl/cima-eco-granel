/**
 * equipo.js — módulo Equipo: ficha de cada colaborador (perfil, jornada, monto,
 * periodicidad), registro de ausencias/jornadas extra/anticipos, cierre y confirmación
 * de pago, comunicados y la vista propia del colaborador ("Mi pago").
 *
 * NUEVO 28/07/2026 (con Osmar). Archivo propio, funciones namespaced con sufijo "Equipo"
 * para no chocar con nombres ya usados en produccion.js / abastecimiento.js / conciliacion.js.
 */

const DIAS_CHIPS_EQUIPO = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
let equipoCache = { lista: null, fichaActual: null, jornadaEdit: [], todosColaboradores: [], comunicadoPara: [] };

// ============ LISTA ============
async function abrirEquipo(forzar) {
  irA('screen-equipo');
  if (forzar) equipoCache.lista = null;
  if (equipoCache.lista) { pintarListaEquipo(equipoCache.lista); return; }
  document.getElementById('equipo-lista').innerHTML = skeletonCards(4);
  const r = await llamarAPISilencioso('obtenerEquipo', {});
  equipoCache.lista = r;
  if (document.getElementById('screen-equipo').classList.contains('active')) pintarListaEquipo(r);
}

function pintarListaEquipo(r) {
  const cont = document.getElementById('equipo-lista');
  if (!r || !r.ok) { cont.innerHTML = '<p class="error-msg">' + (r && r.error || 'No se pudo cargar el equipo') + '</p>'; return; }
  equipoCache.todosColaboradores = (r.colaboradores || []).map(c => c.nombre);
  cont.innerHTML = '';
  (r.colaboradores || []).forEach(c => {
    const iniciales = c.nombre.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();
    const div = document.createElement('div');
    div.className = 'card'; div.style.cssText = 'display:flex;align-items:center;gap:10px;cursor:pointer;margin-bottom:8px;';
    div.onclick = () => abrirFichaEquipo(c.nombre);
    div.innerHTML =
      '<div class="avatar" style="width:38px;height:38px;font-size:13px;">' + iniciales + '</div>' +
      '<div style="flex:1;"><strong style="font-size:14px;">' + c.nombre + '</strong>' +
      '<p style="font-size:12px;color:var(--ink-soft);margin:2px 0 0;">' + c.negocio + ' · ' + c.periodicidad + '</p></div>' +
      '<strong style="font-size:14px;">' + fmt(c.totalPendiente) + '</strong>';
    cont.appendChild(div);
  });
  if (!(r.colaboradores || []).length) cont.innerHTML = '<p style="font-size:12px;color:var(--ink-soft);">Todavía no hay colaboradores cargados.</p>';
}

// ============ FICHA (ver / crear / editar) ============
async function abrirFichaEquipo(nombre) {
  irA('screen-ficha-equipo');
  const cont = document.getElementById('ficha-equipo-cont');
  if (!nombre) { equipoCache.fichaActual = null; equipoCache.jornadaEdit = []; pintarFormularioFicha_(null, null, true); return; }
  cont.innerHTML = skeletonCards(3);
  const r = await llamarAPISilencioso('obtenerFichaColaborador', { nombre: nombre });
  if (!r.ok) { cont.innerHTML = '<p class="error-msg">' + r.error + '</p>'; return; }
  equipoCache.fichaActual = r.colaborador;
  equipoCache.jornadaEdit = (r.colaborador.jornada || []).map(b => Object.assign({}, b));
  pintarFormularioFicha_(r.colaborador, r.calculado, false);
}

function pintarFormularioFicha_(c, calc, esNuevo) {
  const cont = document.getElementById('ficha-equipo-cont');
  const val = (campo, def) => c ? (c[campo] != null ? c[campo] : def) : def;
  let html = '<h2 style="font-size:17px;">' + (esNuevo ? 'Nuevo colaborador' : c.nombre) + '</h2>';

  if (!esNuevo) {
    html += '<div class="pillbar" style="margin-bottom:12px;">' +
      '<button type="button" onclick="abrirRegistrarMovimientoEquipo(\'' + c.nombre + '\')">+ Anotar</button>' +
      '<button type="button" onclick="abrirCierrePagoEquipo(\'' + c.nombre + '\')">Cerrar pago</button>' +
      '</div>';
  }

  html += '<label>Nombre</label><input type="text" id="fe-nombre" value="' + val('nombre', '') + '" ' + (esNuevo ? '' : 'readonly') + '>';
  html += '<label>Teléfono</label><input type="tel" id="fe-telefono" value="' + val('telefono', '') + '" placeholder="+56 9 ....">';
  html += '<label>Responsabilidades</label><textarea id="fe-responsabilidades" rows="2">' + val('responsabilidades', '') + '</textarea>';

  html += '<div style="display:flex;gap:10px;">' +
    '<div style="flex:1;"><label>Negocio</label><select id="fe-negocio">' +
      '<option ' + (val('negocio', '') === 'Cima Eco-Granel' ? 'selected' : '') + '>Cima Eco-Granel</option>' +
      '<option ' + (val('negocio', '') === 'Vegan Corner' ? 'selected' : '') + '>Vegan Corner</option></select></div>' +
    '<div style="flex:1;"><label>Monto (semanal si es Semanal; mensual si es Quincenal/Mensual)</label><input type="number" id="fe-monto" value="' + val('monto', '') + '"></div>' +
    '</div>';

  html += '<div style="display:flex;gap:10px;">' +
    '<div style="flex:1;"><label>Periodicidad</label><select id="fe-periodicidad">' +
      ['Semanal', 'Quincenal', 'Mensual'].map(p => '<option ' + (val('periodicidad', 'Semanal') === p ? 'selected' : '') + '>' + p + '</option>').join('') +
      '</select></div>' +
    '<div style="flex:1;"><label>Días de pago</label><input type="text" id="fe-diaspago" value="' + val('diasDePago', '') + '" placeholder="Ej: lunes, o 15 y 30"></div>' +
    '</div>';

  html += '<label>Unidad de descuento por ausencia</label><select id="fe-unidad" onchange="pintarJornadaEquipo_()">' +
    '<option value="dia" ' + (val('unidadDescuento', 'dia') === 'dia' ? 'selected' : '') + '>Por día (sin horario, o monto fijo por día)</option>' +
    '<option value="hora" ' + (val('unidadDescuento', 'dia') === 'hora' ? 'selected' : '') + '>Por hora (jornada con horario)</option>' +
    '</select>';

  html += '<div style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--ink-soft);margin:12px 0 6px;">Jornada</div>';
  html += '<div id="fe-jornada-bloques"></div>';
  html += '<button type="button" class="btn-secondary" style="width:100%;margin:6px 0 10px;" onclick="agregarBloqueJornadaEquipo_()">+ Agregar bloque de jornada</button>';
  html += '<div id="fe-jornada-resumen" style="font-size:12px;background:var(--forest-soft);color:var(--forest);border-radius:8px;padding:8px 12px;margin-bottom:14px;"></div>';

  if (esNuevo) {
    html += '<div style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--ink-soft);margin:4px 0 6px;">Acceso al sistema</div>';
    html += '<label>PIN inicial (4 dígitos)</label><input type="tel" id="fe-pin" maxlength="4" inputmode="numeric" placeholder="Ej: 4521">';
    html += '<p style="font-size:12px;color:var(--ink-soft);">Con esto queda creado su acceso — solo va a ver el detalle de su propio pago y los comunicados.</p>';
  }

  html += '<div class="error-msg" id="fe-error"></div>';
  html += '<button class="btn-primary" style="width:100%;margin-top:10px;" onclick="guardarFichaEquipo_(' + (esNuevo ? 'true' : "false, '" + c.nombre + "'") + ')">' + (esNuevo ? 'Crear ficha y acceso' : 'Guardar cambios') + '</button>';

  cont.innerHTML = html;
  pintarJornadaEquipo_();
}

function pintarJornadaEquipo_() {
  const cont = document.getElementById('fe-jornada-bloques');
  if (!cont) return;
  cont.innerHTML = '';
  equipoCache.jornadaEdit.forEach((b, idx) => {
    const div = document.createElement('div');
    div.style.cssText = 'background:var(--paper);border-radius:8px;padding:8px 10px;margin-bottom:8px;';
    const unidad = document.getElementById('fe-unidad') ? document.getElementById('fe-unidad').value : 'dia';
    div.innerHTML =
      '<div class="conteo-chips" style="margin-bottom:6px;">' +
      DIAS_CHIPS_EQUIPO.map(d => '<span class="chip-sub' + (b.dias.indexOf(d) > -1 ? ' activo' : '') + '" onclick="toggleDiaBloqueEquipo_(' + idx + ',\'' + d + '\')">' + d + '</span>').join('') +
      '</div>' +
      (unidad === 'hora'
        ? '<div style="display:flex;align-items:center;gap:6px;"><input type="number" style="width:64px;" value="' + (b.horaInicio || '') + '" onchange="equipoCache.jornadaEdit[' + idx + '].horaInicio=this.value" placeholder="Desde"><span>a</span><input type="number" style="width:64px;" value="' + (b.horaFin || '') + '" onchange="actualizarHorasBloqueEquipo_(' + idx + ')" placeholder="Hasta"><span style="font-size:12px;color:var(--ink-soft);">' + (num_(b.horas) || 0) + ' h</span><button type="button" class="icon-btn" style="margin-left:auto;" onclick="quitarBloqueJornadaEquipo_(' + idx + ')">✕</button></div>'
        : '<div style="display:flex;align-items:center;"><button type="button" class="icon-btn" style="margin-left:auto;" onclick="quitarBloqueJornadaEquipo_(' + idx + ')">✕</button></div>');
    cont.appendChild(div);
  });
  recalcularResumenJornadaEquipo_();
}

function num_(v) { const n = Number(v); return isNaN(n) ? 0 : n; }

function toggleDiaBloqueEquipo_(idx, dia) {
  const b = equipoCache.jornadaEdit[idx];
  const pos = b.dias.indexOf(dia);
  if (pos > -1) b.dias.splice(pos, 1); else b.dias.push(dia);
  pintarJornadaEquipo_();
}

function actualizarHorasBloqueEquipo_(idx) {
  const b = equipoCache.jornadaEdit[idx];
  const inputs = document.querySelectorAll('#fe-jornada-bloques > div')[idx].querySelectorAll('input[type=number]');
  b.horaInicio = inputs[0].value; b.horaFin = inputs[1].value;
  b.horas = Math.max(0, num_(b.horaFin) - num_(b.horaInicio));
  pintarJornadaEquipo_();
}

function agregarBloqueJornadaEquipo_() {
  equipoCache.jornadaEdit.push({ dias: [], horas: 0, horaInicio: '', horaFin: '' });
  pintarJornadaEquipo_();
}

function quitarBloqueJornadaEquipo_(idx) {
  equipoCache.jornadaEdit.splice(idx, 1);
  pintarJornadaEquipo_();
}

function semanasParaTasaEquipo_(periodicidad) {
  return periodicidad === 'Semanal' ? 1 : 52 / 12; // Quincenal y Mensual: 'monto' es la cifra mensual
}

function recalcularResumenJornadaEquipo_() {
  const resumen = document.getElementById('fe-jornada-resumen');
  const unidad = document.getElementById('fe-unidad') ? document.getElementById('fe-unidad').value : 'dia';
  const periodicidad = document.getElementById('fe-periodicidad') ? document.getElementById('fe-periodicidad').value : 'Semanal';
  const monto = num_(document.getElementById('fe-monto') ? document.getElementById('fe-monto').value : 0);
  const semanas = semanasParaTasaEquipo_(periodicidad);
  const diasSemana = equipoCache.jornadaEdit.reduce((s, b) => s + b.dias.length, 0);
  if (unidad === 'hora') {
    const horasSemana = equipoCache.jornadaEdit.reduce((s, b) => s + b.dias.length * num_(b.horas), 0);
    const valorHora = (horasSemana * semanas) > 0 ? Math.round(monto / (horasSemana * semanas)) : 0;
    resumen.textContent = 'Jornada semanal: ' + horasSemana + ' h · valor hora ' + fmt(valorHora);
  } else {
    const valorDia = (diasSemana * semanas) > 0 ? Math.round(monto / (diasSemana * semanas)) : 0;
    resumen.textContent = diasSemana + ' día(s) por semana · valor día ' + fmt(valorDia);
  }
}
document.addEventListener('input', e => { if (e.target && (e.target.id === 'fe-monto')) recalcularResumenJornadaEquipo_(); });
document.addEventListener('change', e => { if (e.target && (e.target.id === 'fe-periodicidad')) recalcularResumenJornadaEquipo_(); });

async function guardarFichaEquipo_(esNuevo, nombreOriginal) {
  const err = document.getElementById('fe-error'); err.textContent = '';
  const d = {
    esNuevo: esNuevo, nombreOriginal: nombreOriginal || '',
    nombre: document.getElementById('fe-nombre').value.trim(),
    telefono: document.getElementById('fe-telefono').value.trim(),
    responsabilidades: document.getElementById('fe-responsabilidades').value.trim(),
    negocio: document.getElementById('fe-negocio').value,
    monto: document.getElementById('fe-monto').value,
    periodicidad: document.getElementById('fe-periodicidad').value,
    diasDePago: document.getElementById('fe-diaspago').value.trim(),
    unidadDescuento: document.getElementById('fe-unidad').value,
    jornada: equipoCache.jornadaEdit
  };
  if (esNuevo) d.pin = document.getElementById('fe-pin').value.trim();
  if (!d.nombre) { err.textContent = 'Falta el nombre'; return; }

  const r = await llamarAPI('guardarFichaColaborador', { data: d });
  if (!r.ok) { err.textContent = r.error; return; }
  equipoCache.lista = null;
  document.getElementById('confirm-title').textContent = esNuevo ? 'Colaborador creado' : 'Ficha actualizada';
  document.getElementById('confirm-msg').textContent = r.mensaje;
  document.getElementById('confirm-detalle').innerHTML = '';
  document.getElementById('confirm-btn-otro').style.display = 'block';
  document.getElementById('confirm-btn-otro').textContent = 'Volver al equipo';
  confirmAccionOtro = () => abrirEquipo(true);
  irA('screen-confirm');
}

// ============ MOVIMIENTOS (Ausencia / Extra / Anticipo) ============
async function abrirRegistrarMovimientoEquipo(nombre) {
  irA('screen-movimiento-equipo');
  const cont = document.getElementById('movimiento-equipo-cont');
  cont.innerHTML =
    '<h2 style="font-size:17px;">Anotar</h2><p style="font-size:12.5px;color:var(--ink-soft);margin-top:-6px;">' + nombre + '</p>' +
    '<div class="toggle-group" id="me-tipo-group">' +
      '<button type="button" class="selected" onclick="setTipoMovimientoEquipo_(\'Ausencia\',this)">Ausencia</button>' +
      '<button type="button" onclick="setTipoMovimientoEquipo_(\'Extra\',this)">Extra</button>' +
      '<button type="button" onclick="setTipoMovimientoEquipo_(\'Anticipo\',this)">Anticipo</button>' +
    '</div>' +
    '<label>Día</label><input type="date" id="me-fecha" value="' + fechaLocalISO() + '" onchange="previsualizarMontoMovimientoEquipo_(\'' + nombre + '\')">' +
    '<div id="me-campos-extra"></div>' +
    '<div id="me-preview" style="background:var(--paper);border-radius:8px;padding:11px 12px;margin:8px 0 12px;font-size:14px;"></div>' +
    '<label>Observación (opcional)</label><input type="text" id="me-observacion" placeholder="Ej: motivo, o a cuenta de qué">' +
    '<div class="error-msg" id="me-error"></div>' +
    '<button class="btn-primary" style="width:100%;margin-top:8px;" onclick="guardarMovimientoEquipo_(\'' + nombre + '\')">Guardar</button>' +
    '<div style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--ink-soft);margin:16px 0 6px;">Registrado este período</div>' +
    '<div id="me-lista-periodo"></div>';
  equipoCache.tipoMovimientoActual = 'Ausencia';
  previsualizarMontoMovimientoEquipo_(nombre);
  pintarMovimientosDelPeriodoEquipo_(nombre);
}

function setTipoMovimientoEquipo_(tipo, btn) {
  document.querySelectorAll('#me-tipo-group button').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  equipoCache.tipoMovimientoActual = tipo;
  const extra = document.getElementById('me-campos-extra');
  const nombre = equipoCache.fichaActual ? equipoCache.fichaActual.nombre : '';
  if (tipo === 'Anticipo') {
    extra.innerHTML = '<label>Monto del anticipo</label><input type="number" id="me-monto-anticipo">';
  } else {
    extra.innerHTML = '';
  }
  previsualizarMontoMovimientoEquipo_(nombre);
}

async function previsualizarMontoMovimientoEquipo_(nombre) {
  const preview = document.getElementById('me-preview');
  const tipo = equipoCache.tipoMovimientoActual || 'Ausencia';
  if (tipo === 'Anticipo') { preview.textContent = 'Ingresa el monto del anticipo arriba.'; return; }
  const fecha = document.getElementById('me-fecha').value;
  const dow = new Date(fecha + 'T12:00:00').getDay();
  const diaAbrev = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'][dow];
  const c = equipoCache.fichaActual;
  if (!c) return;
  const bloque = (c.jornada || []).find(b => (b.dias || []).indexOf(diaAbrev) > -1);
  if (bloque) {
    // El monto exacto lo calcula y valida el servidor recién al guardar (guardarMovimientoEquipo_) —
    // acá solo se confirma visualmente que el día cae dentro de la jornada, sin escribir nada todavía.
    preview.innerHTML = diaAbrev + (c.unidadDescuento === 'hora' ? ' · ' + bloque.horas + ' h' : '') +
      '<span style="float:right;font-weight:600;color:' + (tipo === 'Ausencia' ? 'var(--danger)' : 'var(--success)') + ';">' +
      (tipo === 'Ausencia' ? 'Se descuenta el día' : 'Se suma el día') + '</span>';
  } else if (tipo === 'Extra' && c.unidadDescuento === 'hora') {
    document.getElementById('me-campos-extra').innerHTML = '<label>Horas trabajadas ese día</label><input type="number" id="me-horas-extra">';
    preview.textContent = diaAbrev + ' no es parte de su jornada regular — indica las horas.';
  } else if (tipo === 'Extra') {
    preview.textContent = diaAbrev + ' fuera de su jornada — se sumará un día completo.';
  } else {
    preview.innerHTML = '<span style="color:var(--danger);">' + diaAbrev + ' no está en la jornada de ' + c.nombre + '.</span>';
  }
}

async function guardarMovimientoEquipo_(nombre) {
  const err = document.getElementById('me-error'); err.textContent = '';
  const tipo = equipoCache.tipoMovimientoActual || 'Ausencia';
  const d = { colaborador: nombre, fecha: document.getElementById('me-fecha').value, tipo: tipo,
    observacion: document.getElementById('me-observacion').value.trim() };
  if (tipo === 'Anticipo') d.monto = document.getElementById('me-monto-anticipo').value;
  const horasEl = document.getElementById('me-horas-extra');
  if (horasEl) d.horas = horasEl.value;

  const r = await llamarAPI('registrarMovimientoEquipo', { data: d });
  if (!r.ok) { err.textContent = r.error; return; }
  document.getElementById('me-observacion').value = '';
  pintarMovimientosDelPeriodoEquipo_(nombre);
}

async function pintarMovimientosDelPeriodoEquipo_(nombre) {
  const cont = document.getElementById('me-lista-periodo');
  const c = equipoCache.fichaActual;
  if (!c) return;
  const desde = c.ultimaFechaPagada ? c.ultimaFechaPagada : '';
  const r = await llamarAPISilencioso('obtenerCierrePago', { colaborador: nombre, desde: desde || fechaLocalISO(), hasta: fechaLocalISO() });
  if (!r.ok || !r.cierre) { cont.innerHTML = ''; return; }
  cont.innerHTML = (r.cierre.movimientos || []).map(m =>
    '<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--border);font-size:13px;">' +
    '<span>' + m.tipo + ' · ' + m.fecha + (m.observacion ? ' — ' + m.observacion : '') + '</span>' +
    '<span style="color:' + (m.tipo === 'Extra' ? 'var(--success)' : 'var(--danger)') + ';font-weight:600;">' + (m.tipo === 'Extra' ? '+' : '−') + fmt(m.monto) + '</span>' +
    '</div>').join('') || '<p style="font-size:12px;color:var(--ink-soft);">Nada registrado todavía en este período.</p>';
}

// ============ CIERRE Y CONFIRMACIÓN DE PAGO ============
async function abrirCierrePagoEquipo(nombre) {
  irA('screen-cierre-equipo');
  const cont = document.getElementById('cierre-equipo-cont');
  cont.innerHTML = skeletonCards(2);
  const r = await llamarAPISilencioso('obtenerEquipo', {});
  const info = (r.colaboradores || []).find(c => c.nombre === nombre) || {};
  const desde = info.desde || fechaLocalISO();
  const hasta = info.hasta || fechaLocalISO();
  pintarCierrePagoEquipo_(nombre, desde, hasta, null);
}

async function pintarCierrePagoEquipo_(nombre, desde, hasta, cierre) {
  const cont = document.getElementById('cierre-equipo-cont');
  if (!cierre) {
    const r = await llamarAPISilencioso('obtenerCierrePago', { colaborador: nombre, desde: fechaISOaCL_(desde), hasta: fechaISOaCL_(hasta) });
    if (!r.ok) { cont.innerHTML = '<p class="error-msg">' + r.error + '</p>'; return; }
    cierre = r.cierre;
  }
  cont.innerHTML =
    '<h2 style="font-size:17px;">Cierre de pago</h2><p style="font-size:12.5px;color:var(--ink-soft);margin-top:-6px;">' + nombre + '</p>' +
    '<div style="display:flex;gap:10px;">' +
      '<div style="flex:1;"><label>Desde</label><input type="date" id="ce-desde" value="' + desde + '" onchange="recalcularCierrePagoEquipo_(\'' + nombre + '\')"></div>' +
      '<div style="flex:1;"><label>Hasta</label><input type="date" id="ce-hasta" value="' + hasta + '" onchange="recalcularCierrePagoEquipo_(\'' + nombre + '\')"></div>' +
    '</div>' +
    '<div style="display:flex;justify-content:space-between;padding:9px 0;font-size:14px;"><span style="color:var(--ink-soft);">Base del período</span><span>' + fmt(cierre.base) + '</span></div>' +
    '<div style="display:flex;justify-content:space-between;padding:9px 0;font-size:14px;"><span style="color:var(--ink-soft);">Ausencias</span><span style="color:var(--danger);">−' + fmt(cierre.ausencias) + '</span></div>' +
    '<div style="display:flex;justify-content:space-between;padding:9px 0;font-size:14px;"><span style="color:var(--ink-soft);">Extras</span><span style="color:var(--success);">+' + fmt(cierre.extras) + '</span></div>' +
    '<div style="display:flex;justify-content:space-between;padding:9px 0;font-size:14px;border-bottom:1px solid var(--border);"><span style="color:var(--ink-soft);">Anticipos</span><span style="color:var(--danger);">−' + fmt(cierre.anticipos) + '</span></div>' +
    '<div style="display:flex;justify-content:space-between;padding:14px 0;font-size:17px;font-weight:700;"><span>A pagar</span><span>' + fmt(cierre.total) + '</span></div>' +
    '<div class="error-msg" id="ce-error"></div>' +
    '<button class="btn-primary" style="width:100%;" onclick="confirmarPagoEquipo_(\'' + nombre + '\')">Confirmar y registrar pago</button>' +
    '<p style="font-size:12px;color:var(--ink-soft);text-align:center;margin-top:8px;">Queda guardado y visible para ' + nombre.split(' ')[0] + '</p>';
  equipoCache.cierreActual = cierre;
}

function fechaISOaCL_(iso) { const p = iso.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }

async function recalcularCierrePagoEquipo_(nombre) {
  const desde = document.getElementById('ce-desde').value, hasta = document.getElementById('ce-hasta').value;
  await pintarCierrePagoEquipo_(nombre, desde, hasta, null);
}

async function confirmarPagoEquipo_(nombre) {
  const err = document.getElementById('ce-error'); err.textContent = '';
  const c = equipoCache.cierreActual;
  const d = { colaborador: nombre, desde: c.desde, hasta: c.hasta, base: c.base, ausencias: c.ausencias, extras: c.extras, anticipos: c.anticipos, total: c.total };
  const r = await llamarAPI('confirmarPago', { data: d });
  if (!r.ok) { err.textContent = r.error; return; }
  equipoCache.lista = null;
  document.getElementById('confirm-title').textContent = 'Pago confirmado';
  document.getElementById('confirm-msg').textContent = fmt(c.total) + ' registrado para ' + nombre + '. Ya quedó reflejado como gasto en Finanzas.';
  document.getElementById('confirm-detalle').innerHTML = '';
  document.getElementById('confirm-btn-otro').style.display = 'block';
  document.getElementById('confirm-btn-otro').textContent = 'Volver al equipo';
  confirmAccionOtro = () => abrirEquipo(true);
  irA('screen-confirm');
}

// ============ COMUNICADOS ============
function abrirComunicadoEquipo(paraPreseleccionado) {
  irA('screen-comunicado-equipo');
  equipoCache.comunicadoPara = paraPreseleccionado === 'Todos' ? 'Todos' : (paraPreseleccionado ? [paraPreseleccionado] : []);
  pintarComunicadoEquipo_();
}

function pintarComunicadoEquipo_() {
  const cont = document.getElementById('comunicado-equipo-cont');
  const esTodos = equipoCache.comunicadoPara === 'Todos';
  const nombres = equipoCache.todosColaboradores || [];
  cont.innerHTML =
    '<h2 style="font-size:17px;">Enviar comunicado</h2>' +
    '<label>Para</label>' +
    '<div class="conteo-chips" style="margin:6px 0 14px;">' +
      '<span class="chip-sub' + (esTodos ? ' activo' : '') + '" onclick="setComunicadoTodosEquipo_()">Todos</span>' +
      nombres.map(n => '<span class="chip-sub' + (!esTodos && equipoCache.comunicadoPara.indexOf(n) > -1 ? ' activo' : '') + '" onclick="toggleComunicadoPersonaEquipo_(\'' + n + '\')">' + n.split(' ')[0] + '</span>').join('') +
    '</div>' +
    '<label>Mensaje</label><textarea id="ce-mensaje" rows="4"></textarea>' +
    '<div class="error-msg" id="ce-mensaje-error"></div>' +
    '<button class="btn-primary" style="width:100%;margin-top:8px;" onclick="enviarComunicadoEquipo_()">Enviar</button>' +
    '<p style="font-size:12px;color:var(--ink-soft);text-align:center;margin-top:8px;">Le aparece la próxima vez que abra el sistema</p>';
}

function setComunicadoTodosEquipo_() { equipoCache.comunicadoPara = 'Todos'; pintarComunicadoEquipo_(); }
function toggleComunicadoPersonaEquipo_(nombre) {
  if (equipoCache.comunicadoPara === 'Todos') equipoCache.comunicadoPara = [];
  const pos = equipoCache.comunicadoPara.indexOf(nombre);
  if (pos > -1) equipoCache.comunicadoPara.splice(pos, 1); else equipoCache.comunicadoPara.push(nombre);
  pintarComunicadoEquipo_();
}

async function enviarComunicadoEquipo_() {
  const err = document.getElementById('ce-mensaje-error'); err.textContent = '';
  const mensaje = document.getElementById('ce-mensaje').value.trim();
  if (!mensaje) { err.textContent = 'Escribe el mensaje'; return; }
  const para = equipoCache.comunicadoPara;
  if (Array.isArray(para) && !para.length) { err.textContent = 'Elige al menos un destinatario'; return; }
  const r = await llamarAPI('enviarComunicadoEquipo', { data: { para: para, mensaje: mensaje } });
  if (!r.ok) { err.textContent = r.error; return; }
  document.getElementById('confirm-title').textContent = 'Comunicado enviado';
  document.getElementById('confirm-msg').textContent = 'Le va a aparecer la próxima vez que abra el sistema.';
  document.getElementById('confirm-detalle').innerHTML = '';
  document.getElementById('confirm-btn-otro').style.display = 'none';
  irA('screen-confirm');
}

// ============ MI PAGO (vista del colaborador) ============
async function abrirMiPago() {
  irA('screen-mi-pago');
  document.getElementById('mipago-nombre').textContent = sesion.nombre;
  const cont = document.getElementById('mi-pago-cont');
  cont.innerHTML = skeletonCards(2);
  const r = await llamarAPISilencioso('obtenerMiPago', {});
  if (!r.ok) { cont.innerHTML = '<p style="font-size:13px;color:var(--ink-soft);">' + r.error + '</p>'; return; }
  const p = r.periodoActual;
  let html =
    '<div class="card" style="text-align:center;margin-bottom:14px;">' +
      '<p style="font-size:12px;color:var(--ink-soft);margin:0;">Período ' + p.desde + ' a ' + p.hasta + '</p>' +
      '<p style="font-size:28px;font-weight:700;margin:2px 0 0;">' + fmt(p.total) + '</p>' +
    '</div>' +
    '<div style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--ink-soft);margin-bottom:4px;">Detalle</div>';
  (p.movimientos || []).forEach(m => {
    html += '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:13px;">' +
      '<span>' + m.fecha + ' · ' + m.tipo + '</span>' +
      '<span style="color:' + (m.tipo === 'Extra' ? 'var(--success)' : 'var(--danger)') + ';">' + (m.tipo === 'Extra' ? '+' : '−') + fmt(m.monto) + '</span></div>';
  });
  if (!(p.movimientos || []).length) html += '<p style="font-size:12.5px;color:var(--ink-soft);">Sin ausencias, extras ni anticipos en este período.</p>';
  cont.innerHTML = html;
}
