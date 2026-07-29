/**
 * equipo.js — módulo Equipo, versión 2 (29/07/2026, con Osmar).
 *
 * Estructura: Equipo (lista) → Ficha [tab Datos / tab Historial] → Acciones → Anotar / Cerrar
 * pago. Resumen y Comunicados se abren directo desde la lista, no desde la ficha.
 * La ficha es solo lectura (con un link "Editar" que abre el formulario aparte) — no mezcla
 * botones de acción con los datos, a pedido explícito de Osmar tras varias rondas de mockup.
 */

const DIAS_CHIPS_EQUIPO = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
let equipoCache = { lista: null, fichaActual: null, jornadaEdit: [], todosColaboradores: [],
  comunicadoPara: [], tipoMovimientoActual: 'Ausencia' };

// ============ 1. LISTA ============
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

// ============ 2. FICHA — tabs Datos / Historial (solo lectura) ============
async function abrirFichaEquipo(nombre) {
  irA('screen-ficha-equipo');
  const cont = document.getElementById('ficha-equipo-cont');
  cont.innerHTML = skeletonCards(3);
  const r = await llamarAPISilencioso('obtenerFichaColaborador', { nombre: nombre });
  if (!r.ok) { cont.innerHTML = '<p class="error-msg">' + r.error + '</p>'; return; }
  equipoCache.fichaActual = r.colaborador;
  equipoCache.fichaTabActual = 'datos';
  pintarFichaEquipo_(r.colaborador, r.calculado);
}

function pintarFichaEquipo_(c, calc) {
  const cont = document.getElementById('ficha-equipo-cont');
  const iniciales = c.nombre.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();
  let html =
    '<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">' +
      '<div class="avatar">' + iniciales + '</div>' +
      '<div><strong style="font-size:16px;">' + c.nombre + '</strong><p style="font-size:12.5px;color:var(--ink-soft);margin:1px 0 0;">' + c.negocio + '</p></div>' +
    '</div>' +
    '<div class="pillbar">' +
      '<button class="' + (equipoCache.fichaTabActual === 'datos' ? 'sel' : '') + '" onclick="cambiarTabFichaEquipo_(\'datos\')">Datos</button>' +
      '<button class="' + (equipoCache.fichaTabActual === 'historial' ? 'sel' : '') + '" onclick="cambiarTabFichaEquipo_(\'historial\')">Historial</button>' +
    '</div>' +
    '<div id="ficha-tab-cont"></div>' +
    '<button class="btn-primary" style="margin-top:16px;" onclick="irA(\'screen-acciones-equipo\');pintarAccionesEquipo_()">Acciones →</button>';
  cont.innerHTML = html;
  if (equipoCache.fichaTabActual === 'datos') pintarTabDatosEquipo_(c, calc);
  else pintarTabHistorialEquipo_(c.nombre);
}

function cambiarTabFichaEquipo_(tab) {
  equipoCache.fichaTabActual = tab;
  pintarFichaEquipo_(equipoCache.fichaActual, equipoCache.calculadoActual);
}

function filaEquipo_(label, valor) {
  return '<div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);font-size:13.5px;">' +
    '<span style="color:var(--ink-soft);">' + label + '</span><span style="text-align:right;">' + valor + '</span></div>';
}

function pintarTabDatosEquipo_(c, calc) {
  equipoCache.calculadoActual = calc;
  const tab = document.getElementById('ficha-tab-cont');
  let html = filaEquipo_('Teléfono', c.telefono || '—');
  html += '<div style="padding:10px 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:var(--ink-soft);">Responsabilidades</div>';
  html += '<p style="font-size:13.5px;line-height:1.5;margin:0 0 8px;">' + (c.responsabilidades || '—') + '</p>';
  html += filaEquipo_('Monto', fmt(c.monto) + (c.periodicidad === 'Semanal' ? ' / semana' : ' / mes'));
  html += filaEquipo_('Periodicidad', c.periodicidad + (c.periodicidad === 'Quincenal' ? ' (' + fmt(c.monto / 2) + ' c/u)' : ''));
  html += filaEquipo_('Fecha de pago', c.diasDePago || '—');
  html += '<div style="padding:14px 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:var(--ink-soft);">Jornada</div>';
  (c.jornada || []).forEach(b => {
    const dias = b.dias.join(' · ');
    const horario = (b.horaInicio != null && b.horaFin != null) ? b.horaInicio + ':00–' + b.horaFin + ':00' : 'sin horario fijo';
    const colacion = num_(b.colacionMin) > 0 ? b.colacionMin + ' min colación' : 'sin colación';
    html += filaEquipo_(dias, horario + ' · ' + colacion + ' · <strong>' + b.horas + 'h</strong>');
  });
  html += '<div style="padding:14px 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:var(--ink-soft);">Modalidad de pago</div>';
  if (c.unidadDescuento === 'hora') html += filaEquipo_('Cálculo', 'Por hora · ' + fmt(calc.valorHora) + '/h');
  else html += filaEquipo_('Cálculo', 'Por día · ' + fmt(calc.valorDia) + '/día');
  html += '<button type="button" class="btn-secondary" style="margin-top:14px;" onclick="abrirFormularioFichaEquipo_(\'' + c.nombre + '\')">Editar</button>';
  tab.innerHTML = html;
}

async function pintarTabHistorialEquipo_(nombre) {
  const tab = document.getElementById('ficha-tab-cont');
  tab.innerHTML = skeletonCards(2);
  const r = await llamarAPISilencioso('obtenerHistorialPagos', { colaborador: nombre });
  if (!r.ok) { tab.innerHTML = '<p class="error-msg">' + r.error + '</p>'; return; }
  let html = '<div style="padding:10px 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:var(--ink-soft);">Pagos</div>';
  (r.pagos || []).forEach(p => { html += filaEquipo_(p.desde + ' – ' + p.hasta, '<strong>' + fmt(p.total) + '</strong>'); });
  if (!(r.pagos || []).length) html += '<p style="font-size:12.5px;color:var(--ink-soft);">Sin pagos registrados todavía.</p>';
  html += '<div style="padding:14px 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:var(--ink-soft);">Cambios en la ficha</div>';
  (r.cambiosFicha || []).forEach(cm => { html += '<p style="font-size:13px;color:var(--ink-soft);padding:6px 0;border-bottom:1px solid var(--border);">' + cm.descripcion + ' · ' + cm.fecha + '</p>'; });
  if (!(r.cambiosFicha || []).length) html += '<p style="font-size:12.5px;color:var(--ink-soft);">Sin cambios registrados.</p>';
  tab.innerHTML = html;
}

// ============ 2b. EDITAR / CREAR FICHA ============
function abrirFormularioFichaEquipo_(nombre) {
  irA('screen-editar-equipo');
  if (!nombre) { equipoCache.jornadaEdit = []; pintarFormularioFicha_(null, true); return; }
  const c = equipoCache.fichaActual && equipoCache.fichaActual.nombre === nombre ? equipoCache.fichaActual : null;
  if (!c) { irA('screen-equipo'); return; }
  equipoCache.jornadaEdit = (c.jornada || []).map(b => Object.assign({}, b));
  pintarFormularioFicha_(c, false);
}

function pintarFormularioFicha_(c, esNuevo) {
  const cont = document.getElementById('editar-equipo-cont');
  const val = (campo, def) => c ? (c[campo] != null ? c[campo] : def) : def;
  let html = '<h2 style="font-size:17px;">' + (esNuevo ? 'Nuevo colaborador' : 'Editar · ' + c.nombre) + '</h2>';
  html += '<label>Nombre</label><input type="text" id="fe-nombre" value="' + val('nombre', '') + '" ' + (esNuevo ? '' : 'readonly') + '>';
  html += '<label>Teléfono</label><input type="tel" id="fe-telefono" value="' + val('telefono', '') + '" placeholder="+56 9 ....">';
  html += '<label>Responsabilidades</label><textarea id="fe-responsabilidades" rows="2">' + val('responsabilidades', '') + '</textarea>';
  html += '<div style="display:flex;gap:10px;">' +
    '<div style="flex:1;"><label>Negocio</label><select id="fe-negocio">' +
      '<option ' + (val('negocio', '') === 'Cima Eco-Granel' ? 'selected' : '') + '>Cima Eco-Granel</option>' +
      '<option ' + (val('negocio', '') === 'Vegan Corner' ? 'selected' : '') + '>Vegan Corner</option></select></div>' +
    '<div style="flex:1;"><label>Monto (semanal si Semanal; mensual si Quincenal/Mensual)</label><input type="number" id="fe-monto" value="' + val('monto', '') + '" oninput="pintarDesgloseMontoEquipo_()"></div>' +
    '</div>';
  html += '<div style="display:flex;gap:10px;">' +
    '<div style="flex:1;"><label>Periodicidad</label><select id="fe-periodicidad" onchange="pintarDesgloseMontoEquipo_()">' +
      ['Semanal', 'Quincenal', 'Mensual'].map(p => '<option ' + (val('periodicidad', 'Semanal') === p ? 'selected' : '') + '>' + p + '</option>').join('') +
      '</select></div>' +
    '<div style="flex:1;"><label>Fecha de pago</label><input type="text" id="fe-diaspago" value="' + val('diasDePago', '') + '" placeholder="Ej: lunes, o 15 y 30"></div>' +
    '</div>';
  html += '<div id="fe-desglose-monto" style="font-size:12.5px;color:var(--forest);background:var(--forest-soft);border-radius:8px;padding:8px 12px;margin-bottom:12px;"></div>';
  html += '<label>Modalidad de pago</label><select id="fe-unidad" onchange="pintarJornadaEquipo_()">' +
    '<option value="dia" ' + (val('unidadDescuento', 'dia') === 'dia' ? 'selected' : '') + '>Por día</option>' +
    '<option value="hora" ' + (val('unidadDescuento', 'dia') === 'hora' ? 'selected' : '') + '>Por hora</option>' +
    '</select>';
  html += '<div style="font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:var(--ink-soft);margin:12px 0 6px;">Jornada</div>';
  html += '<div id="fe-jornada-bloques"></div>';
  html += '<button type="button" class="btn-secondary" onclick="agregarBloqueJornadaEquipo_()">+ Agregar bloque de jornada</button>';
  html += '<div id="fe-jornada-resumen" style="font-size:12px;background:var(--paper);border-radius:8px;padding:8px 12px;margin:10px 0 14px;"></div>';
  if (esNuevo) {
    html += '<div style="font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:var(--ink-soft);margin:4px 0 6px;">Acceso al sistema</div>';
    html += '<label>PIN inicial (4 dígitos)</label><input type="tel" id="fe-pin" maxlength="4" inputmode="numeric" placeholder="Ej: 4521">';
  }
  html += '<div class="error-msg" id="fe-error"></div>';
  html += '<button class="btn-primary" style="margin-top:10px;" onclick="guardarFichaEquipo_(' + (esNuevo ? 'true' : "false, '" + c.nombre + "'") + ')">' + (esNuevo ? 'Crear ficha y acceso' : 'Guardar cambios') + '</button>';
  cont.innerHTML = html;
  pintarJornadaEquipo_();
  pintarDesgloseMontoEquipo_();
}

function num_(v) { const n = Number(v); return isNaN(n) ? 0 : n; }

function pintarJornadaEquipo_() {
  const cont = document.getElementById('fe-jornada-bloques');
  if (!cont) return;
  cont.innerHTML = '';
  equipoCache.jornadaEdit.forEach((b, idx) => {
    const div = document.createElement('div');
    div.style.cssText = 'background:var(--paper);border-radius:8px;padding:8px 10px;margin-bottom:8px;';
    div.innerHTML =
      '<div class="conteo-chips" style="margin-bottom:6px;">' +
      DIAS_CHIPS_EQUIPO.map(d => '<span class="chip-sub' + (b.dias.indexOf(d) > -1 ? ' activo' : '') + '" onclick="toggleDiaBloqueEquipo_(' + idx + ',\'' + d + '\')">' + d + '</span>').join('') +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;">' +
        '<span style="font-size:11.5px;color:var(--ink-soft);">Desde</span><input type="number" style="width:50px;" value="' + (b.horaInicio != null ? b.horaInicio : '') + '" onchange="actualizarBloqueEquipo_(' + idx + ')">' +
        '<span style="font-size:11.5px;color:var(--ink-soft);">Hasta</span><input type="number" style="width:50px;" value="' + (b.horaFin != null ? b.horaFin : '') + '" onchange="actualizarBloqueEquipo_(' + idx + ')">' +
        '<span style="font-size:11.5px;color:var(--ink-soft);">Colación (min)</span><input type="number" style="width:56px;" value="' + (b.colacionMin || 0) + '" onchange="actualizarBloqueEquipo_(' + idx + ')">' +
        '<span style="font-size:11.5px;color:var(--ink-soft);margin-left:auto;">' + (b.horas || 0) + 'h neto</span>' +
        '<button type="button" class="icon-btn" onclick="quitarBloqueJornadaEquipo_(' + idx + ')">✕</button>' +
      '</div>';
    cont.appendChild(div);
  });
  recalcularResumenJornadaEquipo_();
}

function actualizarBloqueEquipo_(idx) {
  const inputs = document.querySelectorAll('#fe-jornada-bloques > div')[idx].querySelectorAll('input[type=number]');
  const b = equipoCache.jornadaEdit[idx];
  b.horaInicio = num_(inputs[0].value); b.horaFin = num_(inputs[1].value); b.colacionMin = num_(inputs[2].value);
  const bruto = Math.max(0, b.horaFin - b.horaInicio);
  b.horas = Math.max(0, bruto - b.colacionMin / 60);
  pintarJornadaEquipo_();
}

function toggleDiaBloqueEquipo_(idx, dia) {
  const b = equipoCache.jornadaEdit[idx];
  const pos = b.dias.indexOf(dia);
  if (pos > -1) b.dias.splice(pos, 1); else b.dias.push(dia);
  pintarJornadaEquipo_();
}

function agregarBloqueJornadaEquipo_() {
  equipoCache.jornadaEdit.push({ dias: [], horaInicio: null, horaFin: null, colacionMin: 0, horas: 0 });
  pintarJornadaEquipo_();
}

function quitarBloqueJornadaEquipo_(idx) {
  equipoCache.jornadaEdit.splice(idx, 1);
  pintarJornadaEquipo_();
}

function semanasParaTasaEquipo_(periodicidad) { return periodicidad === 'Semanal' ? 1 : 52 / 12; }

function recalcularResumenJornadaEquipo_() {
  const resumen = document.getElementById('fe-jornada-resumen');
  if (!resumen) return;
  const unidad = document.getElementById('fe-unidad') ? document.getElementById('fe-unidad').value : 'dia';
  const periodicidad = document.getElementById('fe-periodicidad') ? document.getElementById('fe-periodicidad').value : 'Semanal';
  const monto = num_(document.getElementById('fe-monto') ? document.getElementById('fe-monto').value : 0);
  const semanas = semanasParaTasaEquipo_(periodicidad);
  const diasSemana = equipoCache.jornadaEdit.reduce((s, b) => s + b.dias.length, 0);
  const horasSemana = equipoCache.jornadaEdit.reduce((s, b) => s + b.dias.length * num_(b.horas), 0);
  if (unidad === 'hora') {
    const valorHora = (horasSemana * semanas) > 0 ? Math.round(monto / (horasSemana * semanas)) : 0;
    resumen.textContent = horasSemana + ' h netas por semana · valor hora ' + fmt(valorHora);
  } else {
    const valorDia = (diasSemana * semanas) > 0 ? Math.round(monto / (diasSemana * semanas)) : 0;
    resumen.textContent = diasSemana + ' día(s) por semana · valor día ' + fmt(valorDia);
  }
}

function pintarDesgloseMontoEquipo_() {
  const el = document.getElementById('fe-desglose-monto');
  if (!el) return;
  const monto = num_(document.getElementById('fe-monto') ? document.getElementById('fe-monto').value : 0);
  const periodicidad = document.getElementById('fe-periodicidad') ? document.getElementById('fe-periodicidad').value : 'Semanal';
  if (periodicidad === 'Quincenal') el.textContent = fmt(monto) + ' al mes → ' + fmt(monto / 2) + ' cada quincena';
  else if (periodicidad === 'Mensual') el.textContent = fmt(monto) + ' al mes, en un solo pago';
  else el.textContent = fmt(monto) + ' a la semana';
  recalcularResumenJornadaEquipo_();
}

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

// ============ 3. ACCIONES ============
function pintarAccionesEquipo_() {
  const c = equipoCache.fichaActual;
  document.getElementById('acciones-equipo-cont').innerHTML =
    '<button class="back-link" onclick="abrirFichaEquipo(\'' + c.nombre + '\')"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"></path></svg> ' + c.nombre + '</button>' +
    '<div style="display:flex;flex-direction:column;gap:8px;margin-top:12px;">' +
      '<button type="button" class="btn-secondary" style="text-align:left;height:auto;padding:14px 16px;" onclick="abrirRegistrarMovimientoEquipo(\'' + c.nombre + '\')">' +
        '<div style="font-weight:700;">Anotar</div><div style="font-size:12px;font-weight:400;color:var(--ink-soft);">Ausencia, extra, licencia, vacaciones, anticipo</div></button>' +
      '<button type="button" class="btn-primary" style="text-align:left;height:auto;padding:14px 16px;" onclick="abrirCierrePagoEquipo(\'' + c.nombre + '\')">' +
        '<div>Pagar ahora</div><div style="font-size:12px;font-weight:400;opacity:.85;">Calcula el período y confirma el pago</div></button>' +
    '</div>';
}

// ============ 4. ANOTAR — 5 tipos ============
const TIPOS_MOVIMIENTO_EQUIPO = [
  { tipo: 'Ausencia', label: 'Ausencia' }, { tipo: 'Extra', label: 'Extra' },
  { tipo: 'Licencia', label: 'Licencia médica' }, { tipo: 'Vacaciones', label: 'Vacaciones' },
  { tipo: 'Anticipo', label: 'Anticipo' }
];

function abrirRegistrarMovimientoEquipo(nombre) {
  irA('screen-movimiento-equipo');
  equipoCache.tipoMovimientoActual = 'Ausencia';
  pintarFormularioMovimientoEquipo_(nombre);
}

function pintarFormularioMovimientoEquipo_(nombre) {
  const cont = document.getElementById('movimiento-equipo-cont');
  const tipo = equipoCache.tipoMovimientoActual;
  let html = '<h2 style="font-size:17px;">Anotar</h2><p style="font-size:12.5px;color:var(--ink-soft);margin-top:-6px;">' + nombre + '</p>';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0;">';
  TIPOS_MOVIMIENTO_EQUIPO.slice(0, 4).forEach(t => {
    html += '<button type="button" class="btn-secondary' + (tipo === t.tipo ? ' selected' : '') + '" style="' + (tipo === t.tipo ? 'background:var(--forest);color:#fff;border-color:var(--forest);' : '') + '" onclick="cambiarTipoMovimientoEquipo_(\'' + t.tipo + '\',\'' + nombre + '\')">' + t.label + '</button>';
  });
  html += '</div>';
  html += '<button type="button" class="btn-secondary' + (tipo === 'Anticipo' ? ' selected' : '') + '" style="' + (tipo === 'Anticipo' ? 'background:var(--forest);color:#fff;border-color:var(--forest);' : '') + '" onclick="cambiarTipoMovimientoEquipo_(\'Anticipo\',\'' + nombre + '\')">Anticipo</button>';

  html += '<label style="margin-top:14px;">Día' + (tipo === 'Licencia' || tipo === 'Vacaciones' ? ' (desde)' : '') + '</label><input type="date" id="me-fecha" value="' + fechaLocalISO() + '">';
  if (tipo === 'Licencia' || tipo === 'Vacaciones') {
    html += '<label>Hasta</label><input type="date" id="me-fecha-hasta" value="' + fechaLocalISO() + '">';
  }
  if (tipo === 'Anticipo') {
    html += '<label>Monto del anticipo</label><input type="number" id="me-monto-anticipo">';
  }
  const c = equipoCache.fichaActual;
  if (tipo === 'Extra' && c && c.unidadDescuento === 'hora') {
    html += '<label>Horas extra trabajadas ese día</label><input type="number" id="me-horas-extra">';
  }
  html += '<label>Observación (opcional)</label><input type="text" id="me-observacion">';
  html += '<div id="me-exito" style="display:none;background:var(--forest-soft);color:var(--forest);border-radius:8px;padding:9px 12px;margin-bottom:8px;font-size:13px;font-weight:600;"></div>';
  html += '<div class="error-msg" id="me-error"></div>';
  html += '<button class="btn-primary" style="margin-top:8px;" onclick="guardarMovimientoEquipo_(\'' + nombre + '\')">Guardar</button>';
  html += '<div style="font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:var(--ink-soft);margin:16px 0 6px;">Registrado este período</div>';
  html += '<div id="me-lista-periodo"></div>';
  cont.innerHTML = html;
  pintarMovimientosDelPeriodoEquipo_(nombre);
}

function cambiarTipoMovimientoEquipo_(tipo, nombre) {
  equipoCache.tipoMovimientoActual = tipo;
  pintarFormularioMovimientoEquipo_(nombre);
}

async function guardarMovimientoEquipo_(nombre) {
  const err = document.getElementById('me-error'); err.textContent = '';
  const exito = document.getElementById('me-exito'); exito.style.display = 'none';
  const tipo = equipoCache.tipoMovimientoActual;
  const d = { colaborador: nombre, fecha: document.getElementById('me-fecha').value, tipo: tipo,
    observacion: document.getElementById('me-observacion').value.trim() };
  if (tipo === 'Licencia' || tipo === 'Vacaciones') d.fechaHasta = document.getElementById('me-fecha-hasta').value;
  if (tipo === 'Anticipo') d.monto = document.getElementById('me-monto-anticipo').value;
  const horasEl = document.getElementById('me-horas-extra');
  if (horasEl) d.horas = horasEl.value;

  const r = await llamarAPI('registrarMovimientoEquipo', { data: d });
  if (!r.ok) { err.textContent = r.error; return; }
  exito.style.display = 'block';
  exito.textContent = '✓ ' + tipo + ' guardada' + (r.monto ? ' — ' + fmt(r.monto) : '');
  document.getElementById('me-observacion').value = '';
  if (horasEl) horasEl.value = '';
  const montoAnticipoEl = document.getElementById('me-monto-anticipo');
  if (montoAnticipoEl) montoAnticipoEl.value = '';
  pintarMovimientosDelPeriodoEquipo_(nombre);
}

async function pintarMovimientosDelPeriodoEquipo_(nombre) {
  const cont = document.getElementById('me-lista-periodo');
  const c = equipoCache.fichaActual;
  if (!c) return;
  const desdeISO = c.ultimaFechaPagada ? fechaCLaISO_(c.ultimaFechaPagada) : fechaLocalISO();
  const r = await llamarAPISilencioso('obtenerCierrePago', { colaborador: nombre, desde: fechaISOaCL_(desdeISO), hasta: fechaISOaCL_(fechaLocalISO()) });
  if (!r.ok || !r.cierre) { cont.innerHTML = ''; return; }
  cont.innerHTML = (r.cierre.movimientos || []).map(m => {
    const signo = m.tipo === 'Extra' ? '+' : (m.tipo === 'Licencia' || m.tipo === 'Vacaciones') ? '' : '−';
    const color = m.tipo === 'Extra' ? 'var(--success)' : (m.tipo === 'Licencia' || m.tipo === 'Vacaciones') ? 'var(--ink-soft)' : 'var(--danger)';
    return '<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--border);font-size:13px;">' +
      '<span>' + m.tipo + ' · ' + m.fecha + (m.fechaHasta && m.fechaHasta !== m.fecha ? ' a ' + m.fechaHasta : '') + (m.observacion ? ' — ' + m.observacion : '') + '</span>' +
      '<span style="color:' + color + ';font-weight:600;">' + signo + (m.monto ? fmt(m.monto) : 'informativo') + '</span></div>';
  }).join('') || '<p style="font-size:12px;color:var(--ink-soft);">Nada registrado todavía en este período.</p>';
}

// ============ 5. CIERRE Y CONFIRMACIÓN DE PAGO ============
function fechaCLaISO_(cl) { const p = cl.split('/'); return p[2] + '-' + p[1] + '-' + p[0]; }
function fechaISOaCL_(iso) { const p = iso.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }

async function abrirCierrePagoEquipo(nombre) {
  irA('screen-cierre-equipo');
  const cont = document.getElementById('cierre-equipo-cont');
  cont.innerHTML = skeletonCards(2);
  const r = await llamarAPISilencioso('obtenerEquipo', {});
  const info = (r.colaboradores || []).find(c => c.nombre === nombre) || {};
  // obtenerEquipo entrega las fechas en formato CL (dd/MM/yyyy) — se convierten UNA vez a
  // ISO para los <input type=date>, y de vuelta a CL solo al mandarlas al servidor.
  const desdeISO = info.desde ? fechaCLaISO_(info.desde) : fechaLocalISO();
  const hastaISO = info.hasta ? fechaCLaISO_(info.hasta) : fechaLocalISO();
  await pintarCierrePagoEquipo_(nombre, desdeISO, hastaISO);
}

async function pintarCierrePagoEquipo_(nombre, desdeISO, hastaISO) {
  const cont = document.getElementById('cierre-equipo-cont');
  const r = await llamarAPISilencioso('obtenerCierrePago', { colaborador: nombre, desde: fechaISOaCL_(desdeISO), hasta: fechaISOaCL_(hastaISO) });
  if (!r.ok) { cont.innerHTML = '<p class="error-msg">' + r.error + '</p>'; return; }
  const cierre = r.cierre;
  equipoCache.cierreActual = cierre;
  cont.innerHTML =
    '<h2 style="font-size:17px;">Cierre de pago</h2><p style="font-size:12.5px;color:var(--ink-soft);margin-top:-6px;">' + nombre + '</p>' +
    '<div style="display:flex;gap:10px;">' +
      '<div style="flex:1;"><label>Desde</label><input type="date" id="ce-desde" value="' + desdeISO + '" onchange="recalcularCierrePagoEquipo_(\'' + nombre + '\')"></div>' +
      '<div style="flex:1;"><label>Hasta</label><input type="date" id="ce-hasta" value="' + hastaISO + '" onchange="recalcularCierrePagoEquipo_(\'' + nombre + '\')"></div>' +
    '</div>' +
    '<div style="display:flex;justify-content:space-between;padding:9px 0;font-size:14px;"><span style="color:var(--ink-soft);">Base del período</span><span>' + fmt(cierre.base) + '</span></div>' +
    '<div style="display:flex;justify-content:space-between;padding:9px 0;font-size:14px;"><span style="color:var(--ink-soft);">Ausencias</span><span style="color:var(--danger);">−' + fmt(cierre.ausencias) + '</span></div>' +
    '<div style="display:flex;justify-content:space-between;padding:9px 0;font-size:14px;"><span style="color:var(--ink-soft);">Extras</span><span style="color:var(--success);">+' + fmt(cierre.extras) + '</span></div>' +
    '<div style="display:flex;justify-content:space-between;padding:9px 0;font-size:14px;border-bottom:1px solid var(--border);"><span style="color:var(--ink-soft);">Anticipos</span><span style="color:var(--danger);">−' + fmt(cierre.anticipos) + '</span></div>' +
    '<div style="display:flex;justify-content:space-between;padding:14px 0;font-size:17px;font-weight:700;"><span>A pagar</span><span>' + fmt(cierre.total) + '</span></div>' +
    '<div class="error-msg" id="ce-error"></div>' +
    '<button class="btn-primary" onclick="confirmarPagoEquipo_(\'' + nombre + '\')">Confirmar y registrar pago</button>' +
    '<p style="font-size:12px;color:var(--ink-soft);text-align:center;margin-top:8px;">Queda guardado y visible para ' + nombre.split(' ')[0] + '</p>';
}

async function recalcularCierrePagoEquipo_(nombre) {
  await pintarCierrePagoEquipo_(nombre, document.getElementById('ce-desde').value, document.getElementById('ce-hasta').value);
}

async function confirmarPagoEquipo_(nombre) {
  const err = document.getElementById('ce-error'); err.textContent = '';
  const c = equipoCache.cierreActual;
  const r = await llamarAPI('confirmarPago', { data: { colaborador: nombre, desde: c.desde, hasta: c.hasta, base: c.base, ausencias: c.ausencias, extras: c.extras, anticipos: c.anticipos, total: c.total } });
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

// ============ 6. RESUMEN CONSOLIDADO ============
async function abrirResumenEquipo() {
  irA('screen-resumen-equipo');
  const hoy = new Date();
  const desde = fechaLocalISO(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
  const hasta = fechaLocalISO();
  await pintarResumenEquipo_(desde, hasta);
}

async function pintarResumenEquipo_(desdeISO, hastaISO) {
  const cont = document.getElementById('resumen-equipo-cont');
  cont.innerHTML = skeletonCards(2);
  const r = await llamarAPISilencioso('obtenerResumenEquipo', { desde: fechaISOaCL_(desdeISO), hasta: fechaISOaCL_(hastaISO) });
  if (!r.ok) { cont.innerHTML = '<p class="error-msg">' + r.error + '</p>'; return; }
  let html = '<div style="display:flex;gap:10px;margin-bottom:14px;">' +
      '<div style="flex:1;"><label>Desde</label><input type="date" id="re-desde" value="' + desdeISO + '" onchange="pintarResumenEquipo_(this.value,document.getElementById(\'re-hasta\').value)"></div>' +
      '<div style="flex:1;"><label>Hasta</label><input type="date" id="re-hasta" value="' + hastaISO + '" onchange="pintarResumenEquipo_(document.getElementById(\'re-desde\').value,this.value)"></div>' +
    '</div>';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">' +
    '<div class="card" style="text-align:center;"><p style="font-size:11.5px;color:var(--ink-soft);margin:0;">Total pagado</p><p style="font-size:20px;font-weight:700;margin:2px 0 0;">' + fmt(r.total) + '</p></div>' +
    '<div class="card" style="text-align:center;"><p style="font-size:11.5px;color:var(--ink-soft);margin:0;">Pagos</p><p style="font-size:20px;font-weight:700;margin:2px 0 0;">' + r.cantidadPagos + '</p></div>' +
    '</div>';
  html += '<div style="font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:var(--ink-soft);margin-bottom:6px;">Por persona</div>';
  (r.porPersona || []).forEach(p => { html += filaEquipo_(p.nombre, '<strong>' + fmt(p.total) + '</strong>'); });
  if (!(r.porPersona || []).length) html += '<p style="font-size:12.5px;color:var(--ink-soft);">Sin pagos en este rango.</p>';
  cont.innerHTML = html;
}

// ============ 7. COMUNICADOS — hub con historial + composición ============
async function abrirComunicadosEquipo() {
  irA('screen-comunicados-equipo');
  const cont = document.getElementById('comunicados-equipo-cont');
  cont.innerHTML = skeletonCards(2);
  const r = await llamarAPISilencioso('obtenerHistorialComunicados', {});
  if (!r.ok) { cont.innerHTML = '<p class="error-msg">' + r.error + '</p>'; return; }
  let html = '';
  (r.comunicados || []).forEach(c => {
    html += '<div style="padding:10px 0;border-bottom:1px solid var(--border);">' +
      '<div style="display:flex;justify-content:space-between;font-size:12.5px;color:var(--ink-soft);"><span>A ' + c.para + '</span><span>' + c.fecha + '</span></div>' +
      '<p style="font-size:13.5px;margin:3px 0 0;">' + c.texto + '</p>' +
      '<p style="font-size:11.5px;color:var(--ink-soft);margin:4px 0 0;">' + c.leidos + ' de ' + c.totalDestinatarios + ' leído' + (c.totalDestinatarios === 1 ? '' : 's') + '</p>' +
    '</div>';
  });
  if (!(r.comunicados || []).length) html = '<p style="font-size:12.5px;color:var(--ink-soft);">Todavía no has enviado comunicados.</p>';
  html += '<button class="btn-primary" style="margin-top:14px;" onclick="abrirComunicadoEquipo(null)">Nuevo comunicado</button>';
  cont.innerHTML = html;
}

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
    '<button class="back-link" onclick="abrirComunicadosEquipo()"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"></path></svg> Comunicados</button>' +
    '<h2 style="font-size:17px;">Enviar comunicado</h2>' +
    '<label>Para</label>' +
    '<div class="conteo-chips" style="margin:6px 0 14px;">' +
      '<span class="chip-sub' + (esTodos ? ' activo' : '') + '" onclick="setComunicadoTodosEquipo_()">Todos</span>' +
      nombres.map(n => '<span class="chip-sub' + (!esTodos && equipoCache.comunicadoPara.indexOf(n) > -1 ? ' activo' : '') + '" onclick="toggleComunicadoPersonaEquipo_(\'' + n + '\')">' + n.split(' ')[0] + '</span>').join('') +
    '</div>' +
    '<label>Mensaje</label><textarea id="ce-mensaje" rows="4"></textarea>' +
    '<div class="error-msg" id="ce-mensaje-error"></div>' +
    '<button class="btn-primary" style="margin-top:8px;" onclick="enviarComunicadoEquipo_()">Enviar</button>';
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

// ============ 8. MI PAGO (vista del colaborador) ============
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
    '</div>';
  (p.movimientos || []).forEach(m => {
    html += '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:13px;">' +
      '<span>' + m.fecha + ' · ' + m.tipo + '</span>' +
      '<span style="color:' + (m.tipo === 'Extra' ? 'var(--success)' : 'var(--danger)') + ';">' + (m.tipo === 'Extra' ? '+' : '−') + fmt(m.monto) + '</span></div>';
  });
  if (!(p.movimientos || []).length) html += '<p style="font-size:12.5px;color:var(--ink-soft);">Sin ausencias, extras ni anticipos en este período.</p>';
  cont.innerHTML = html;
}
