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
  if (forzar) { equipoCache.lista = null; equipoCache.recordatorios = null; }
  if (equipoCache.lista) { pintarListaEquipo(equipoCache.lista, equipoCache.recordatorios); return; }
  document.getElementById('equipo-lista').innerHTML = skeletonCards(4);
  const [r, rec] = await Promise.all([
    llamarAPISilencioso('obtenerEquipo', {}),
    llamarAPISilencioso('obtenerRecordatoriosPago', {})
  ]);
  equipoCache.lista = r;
  equipoCache.recordatorios = (rec && rec.recordatorios) || [];
  if (document.getElementById('screen-equipo').classList.contains('active')) pintarListaEquipo(r, equipoCache.recordatorios);
}

function pintarListaEquipo(r, recordatorios) {
  const cont = document.getElementById('equipo-lista');
  if (!r || !r.ok) { cont.innerHTML = '<p class="error-msg">' + (r && r.error || 'No se pudo cargar el equipo') + '</p>'; return; }
  equipoCache.todosColaboradores = (r.colaboradores || []).map(c => c.nombre);

  let html = '';
  if (recordatorios && recordatorios.length) {
    html += '<div style="font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:var(--ink-soft);margin:14px 0 8px;">Toca pagar</div>';
    recordatorios.forEach(rec => {
      const urgente = rec.diasParaVencer <= 0;
      const iniciales = rec.colaborador.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();
      const etiqueta = rec.diasParaVencer === 0 ? 'Vence hoy' : rec.diasParaVencer < 0 ? 'Atrasado ' + Math.abs(rec.diasParaVencer) + ' día(s)' : 'En ' + rec.diasParaVencer + ' día(s)';
      if (urgente) {
        html += '<div style="background:var(--terracotta-soft);border:1px solid var(--terracotta);border-radius:12px;padding:14px;margin-bottom:10px;">' +
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--terracotta)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 8v4l3 3"></path></svg>' +
            '<span style="font-size:11.5px;font-weight:700;color:var(--terracotta);text-transform:uppercase;letter-spacing:.3px;">' + etiqueta + '</span></div>' +
          '<div style="display:flex;align-items:center;gap:10px;">' +
            '<div class="avatar" style="width:36px;height:36px;font-size:12px;">' + iniciales + '</div>' +
            '<div style="flex:1;"><strong style="font-size:14.5px;">' + rec.colaborador + '</strong><p style="font-size:12px;color:var(--ink-soft);margin:1px 0 0;">' + rec.fechaVencimiento + '</p></div>' +
            '<strong style="font-size:17px;">' + fmt(rec.monto) + '</strong></div>' +
          '<button type="button" class="btn-primary" style="width:100%;margin-top:12px;padding:9px;" onclick="pagarAhoraDesdeRecordatorioEquipo_(\'' + rec.colaborador + '\')">Pagar ahora</button></div>';
      } else {
        html += '<div style="background:var(--paper);border-radius:12px;padding:12px 14px;margin-bottom:10px;">' +
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">' +
            '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 8v4l3 3"></path></svg>' +
            '<span style="font-size:11px;font-weight:600;color:var(--ink-soft);text-transform:uppercase;letter-spacing:.3px;">' + etiqueta + '</span></div>' +
          '<div style="display:flex;align-items:center;gap:10px;">' +
            '<div class="avatar" style="width:32px;height:32px;font-size:11px;">' + iniciales + '</div>' +
            '<div style="flex:1;"><strong style="font-size:13.5px;">' + rec.colaborador + '</strong><p style="font-size:11.5px;color:var(--ink-soft);margin:1px 0 0;">' + rec.fechaVencimiento + '</p></div>' +
            '<strong style="font-size:14px;">' + fmt(rec.monto) + '</strong></div></div>';
      }
    });
  }

  html += '<div style="font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:var(--ink-soft);margin:14px 0 8px;">Equipo completo</div><div class="card" style="padding:4px 10px;">';
  (r.colaboradores || []).forEach(c => {
    const iniciales = c.nombre.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();
    html += '<div style="display:flex;align-items:center;gap:10px;padding:11px 6px;border-bottom:1px solid var(--border);cursor:pointer;" onclick="abrirFichaEquipo(\'' + c.nombre + '\')">' +
      '<div class="avatar" style="width:38px;height:38px;font-size:13px;">' + iniciales + '</div>' +
      '<div style="flex:1;"><strong style="font-size:14px;">' + c.nombre + '</strong><p style="font-size:12px;color:var(--ink-soft);margin:2px 0 0;">' + c.negocio + ' · ' + c.periodicidad + '</p></div>' +
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"></path></svg></div>';
  });
  html += '</div>';
  if (!(r.colaboradores || []).length) html += '<p style="font-size:12px;color:var(--ink-soft);">Todavía no hay colaboradores cargados.</p>';
  cont.innerHTML = html;
}

async function pagarAhoraDesdeRecordatorioEquipo_(nombre) {
  const r = await llamarAPISilencioso('obtenerFichaColaborador', { nombre: nombre });
  if (!r.ok) return;
  equipoCache.fichaActual = r.colaborador;
  equipoCache.calculadoActual = r.calculado;
  abrirCierrePagoEquipo(nombre);
}

// ============ 2. FICHA — tabs Datos / Historial (solo lectura) ============
async function abrirFichaEquipo(nombre) {
  irA('screen-ficha-equipo');
  const cont = document.getElementById('ficha-equipo-cont');
  cont.innerHTML = skeletonCards(3);
  const r = await llamarAPISilencioso('obtenerFichaColaborador', { nombre: nombre });
  if (!r.ok) { cont.innerHTML = '<p class="error-msg">' + r.error + '</p>'; return; }
  equipoCache.fichaActual = r.colaborador;
  equipoCache.calculadoActual = r.calculado;
  equipoCache.fichaTabActual = 'datos';
  equipoCache.verTodoHistorial = false;
  pintarFichaEquipo_(r.colaborador, r.calculado);
}

function pintarFichaEquipo_(c, calc) {
  const cont = document.getElementById('ficha-equipo-cont');
  const iniciales = c.nombre.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();
  const rec = (equipoCache.recordatorios || []).find(r => r.colaborador === c.nombre);
  const proximoPagoTxt = rec ? fmt(rec.monto) : '—';
  const proximoPagoSub = rec ? rec.fechaVencimiento : c.diasDePago;
  const horasSemana = (c.jornada || []).reduce((s, b) => s + b.dias.length * num_(b.horas), 0);
  // 13/08/2026: el KPI pasó de "Modalidad" (que leía unidadDescuento, ya eliminado) a mostrar
  // el valor hora derivado, que ahora es la única tasa del sistema. valorHoraMostrar viene
  // redondeado del backend solo para pintar — nunca se usa para multiplicar.
  const modalidadVal = fmt(calc.valorHoraMostrar != null ? calc.valorHoraMostrar : calc.valorHora);
  const modalidadSub = c.basePeriodo === 'Fijo' ? 'Monto fijo' : 'Días trabajados';
  let html =
    '<div style="display:flex;align-items:center;gap:14px;margin-bottom:18px;">' +
      '<div class="avatar" style="width:52px;height:52px;font-size:17px;">' + iniciales + '</div>' +
      '<div><div style="font-weight:700;font-size:19px;">' + c.nombre + '</div><div style="font-size:13.5px;color:var(--ink-soft);">' + c.negocio + '</div></div>' +
    '</div>' +
    '<div class="kpi-row" style="grid-template-columns:repeat(3,1fr);">' +
      '<div class="kpi"><div class="lbl" style="min-height:30px;display:flex;align-items:flex-start;">Próximo pago</div><div class="val" style="font-size:19px;">' + proximoPagoTxt + '</div><div style="font-size:11.5px;color:var(--ink-soft);margin-top:2px;">' + proximoPagoSub + '</div></div>' +
      '<div class="kpi"><div class="lbl" style="min-height:30px;display:flex;align-items:flex-start;">Jornada</div><div class="val" style="font-size:19px;">' + horasSemana + 'h</div><div style="font-size:11.5px;color:var(--ink-soft);margin-top:2px;">por semana</div></div>' +
      '<div class="kpi"><div class="lbl" style="min-height:30px;display:flex;align-items:flex-start;">Modalidad</div><div class="val" style="font-size:19px;">' + modalidadVal + '</div><div style="font-size:11.5px;color:var(--ink-soft);margin-top:2px;">' + modalidadSub + '</div></div>' +
    '</div>' +
    '<div class="pillbar" style="margin-top:16px;">' +
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
  return '<div class="rowline"><span>' + label + '</span><span class="mono">' + valor + '</span></div>';
}

const ICONO_EQUIPO_RELOJ = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--forest)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><circle cx="12" cy="12" r="10"></circle><path d="M12 6v6l4 2"></path></svg>';
const ICONO_EQUIPO_MONTO = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--forest)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><rect x="2" y="6" width="20" height="13" rx="2"></rect><path d="M2 10h20"></path></svg>';

// Tarjeta con ícono + número protagonista, para datos que tienen un valor destacable
// (horas netas, monto). Contacto/Responsabilidades no la usan — son datos simples sin un
// número que resaltar, así que quedan como .rowline / texto plano, más liviano.
function tarjetaIconoEquipo_(icono, tituloGrande, sub, numeroGrande, numeroSub) {
  return '<div style="display:flex;align-items:center;gap:12px;background:var(--paper);border-radius:10px;padding:12px 14px;margin-bottom:8px;">' + icono +
    '<div style="flex:1;min-width:0;"><strong class="mono" style="font-size:17px;">' + tituloGrande + '</strong><div style="font-size:12.5px;color:var(--ink-soft);margin-top:1px;">' + sub + '</div></div>' +
    '<div style="text-align:right;flex-shrink:0;">' + (numeroGrande != null ? '<div class="mono" style="font-size:17px;font-weight:700;">' + numeroGrande + '</div><div style="font-size:10.5px;color:var(--ink-soft);">' + numeroSub + '</div>' : '') + '</div></div>';
}

function pintarTabDatosEquipo_(c, calc) {
  equipoCache.calculadoActual = calc;
  const tab = document.getElementById('ficha-tab-cont');
  let html = '<div style="font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:var(--ink-soft);margin:12px 0 4px;">Contacto</div>';
  html += '<div class="rowline"><span>Teléfono</span><span class="mono">' + (c.telefono || '—') + '</span></div>';

  html += '<div style="font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:var(--ink-soft);margin:14px 0 4px;">Responsabilidades</div>';
  html += '<p style="font-size:14px;line-height:1.5;margin:0 0 4px;">' + (c.responsabilidades || '—') + '</p>';

  html += '<div style="font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:var(--ink-soft);margin:16px 0 6px;">Jornada</div>';
  (c.jornada || []).forEach(b => {
    const chips = b.dias.map(d => '<span class="chip-sub activo" style="padding:3px 9px;font-size:12.5px;">' + d + '</span>').join('');
    const horario = (b.horaInicio != null && b.horaFin != null) ? b.horaInicio + ':00–' + b.horaFin + ':00' : 'sin horario fijo';
    const colacion = num_(b.colacionMin) > 0 ? b.colacionMin + ' min colación' : 'sin colación';
    html += '<div style="display:flex;align-items:flex-start;gap:12px;background:var(--paper);border-radius:10px;padding:12px 14px;margin-bottom:8px;">' +
      '<div style="margin-top:2px;flex-shrink:0;">' + ICONO_EQUIPO_RELOJ + '</div>' +
      '<div style="flex:1;min-width:0;">' +
        '<div style="display:flex;flex-wrap:wrap;gap:5px;">' + chips + '</div>' +
        '<div style="font-size:12.5px;color:var(--ink-soft);margin-top:6px;">' + horario + ' · ' + colacion + '</div>' +
      '</div>' +
      '<div style="text-align:right;flex-shrink:0;"><div class="mono" style="font-size:17px;font-weight:700;">' + b.horas + 'h</div><div style="font-size:10.5px;color:var(--ink-soft);">netas</div></div>' +
    '</div>';
  });

  // Pago: ya no repite el monto (eso vive en el KPI "Próximo pago" de arriba). Acá solo
  // lo que el KPI no tiene: la cadencia y el corte. Para Quincenal se agrega el total
  // mensual como dato secundario, porque no aparece en ninguna otra parte de la ficha.
  html += '<div style="font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:var(--ink-soft);margin:16px 0 6px;">Pago</div>';
  html += '<div class="rowline"><span>Periodicidad</span><span>' + c.periodicidad + '</span></div>';
  html += '<div class="rowline"><span>Base del período</span><span>' + (c.basePeriodo === 'Fijo' ? 'Monto fijo por ciclo' : 'Días trabajados') + '</span></div>';
  html += '<div class="rowline"><span>Corte</span><span>vence ' + (c.diasDePago || '—') + '</span></div>';
  if (c.periodicidad === 'Quincenal') {
    html += '<div class="rowline"><span>Total mensual</span><span class="mono">' + fmt(c.monto) + '</span></div>';
  }

  html += '<button type="button" class="btn-secondary" style="margin-top:14px;" onclick="abrirFormularioFichaEquipo_(\'' + c.nombre + '\')">Editar</button>';
  tab.innerHTML = html;
}

async function pintarTabHistorialEquipo_(nombre) {
  const tab = document.getElementById('ficha-tab-cont');
  tab.innerHTML = skeletonCards(2);
  const r = await llamarAPISilencioso('obtenerHistorialPagos', { colaborador: nombre });
  if (!r.ok) { tab.innerHTML = '<p class="error-msg">' + r.error + '</p>'; return; }
  const verTodo = !!equipoCache.verTodoHistorial;
  const pagos = (r.pagos || []).filter(p => verTodo || esDelMesEnCursoEquipo_(p.hasta));
  const cambios = (r.cambiosFicha || []).filter(cm => verTodo || esDelMesEnCursoEquipo_(cm.fecha));
  let html = barraPeriodoEquipo_(verTodo, 'alternarHistorialEquipo_(\'' + nombre + '\')');
  html += '<div style="padding:4px 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:var(--ink-soft);">Pagos</div>';
  pagos.forEach(p => { html += filaEquipo_(p.desde + ' – ' + p.hasta, '<strong>' + fmt(p.total) + '</strong>'); });
  if (!pagos.length) html += '<p style="font-size:12.5px;color:var(--ink-soft);">' +
    (verTodo ? 'Sin pagos registrados todavía.' : 'Sin pagos en ' + nombreMesEnCursoEquipo_() + '.') + '</p>';
  html += '<div style="padding:14px 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:var(--ink-soft);">Cambios en la ficha</div>';
  cambios.forEach(cm => { html += '<div class="rowline"><span>' + cm.descripcion + '</span><span class="mono">' + cm.fecha + '</span></div>'; });
  if (!cambios.length) html += '<p style="font-size:12.5px;color:var(--ink-soft);">' +
    (verTodo ? 'Sin cambios registrados.' : 'Sin cambios en ' + nombreMesEnCursoEquipo_() + '.') + '</p>';
  tab.innerHTML = html;
}

function alternarHistorialEquipo_(nombre) {
  equipoCache.verTodoHistorial = !equipoCache.verTodoHistorial;
  pintarTabHistorialEquipo_(nombre);
}

function alternarComunicadosEquipo_() {
  equipoCache.verTodoComunicados = !equipoCache.verTodoComunicados;
  abrirComunicadosEquipo();
}

// ============ 2b. EDITAR / CREAR FICHA ============
function abrirFormularioFichaEquipo_(nombre) {
  irA('screen-editar-equipo');
  // semanaPagoEdit se limpia SIEMPRE al abrir un formulario: si se arrastra de la ficha
  // anterior, abrir Rosa (siguiente) y luego Katherine (misma) mostraría a Katherine con la
  // configuración de Rosa. Mismo patrón de contaminación entre pantallas ya visto antes.
  equipoCache.semanaPagoEdit = null;
  if (!nombre) { equipoCache.jornadaEdit = []; equipoCache.configPagoEdit = null; pintarFormularioFicha_(null, true); return; }
  const c = equipoCache.fichaActual && equipoCache.fichaActual.nombre === nombre ? equipoCache.fichaActual : null;
  if (!c) { irA('screen-equipo'); return; }
  equipoCache.jornadaEdit = (c.jornada || []).map(b => Object.assign({}, b));
  equipoCache.configPagoEdit = c.configPago ? JSON.parse(JSON.stringify(c.configPago)) : null;
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
    '<div style="flex:1;"><label>Periodicidad</label><select id="fe-periodicidad" onchange="pintarDesgloseMontoEquipo_();pintarConfigPagoEquipo_()">' +
      ['Semanal', 'Quincenal', 'Mensual'].map(p => '<option ' + (val('periodicidad', 'Semanal') === p ? 'selected' : '') + '>' + p + '</option>').join('') +
      '</select></div>' +
    '<div style="flex:1;"><label>Fecha de pago</label><div id="fe-config-pago"></div></div>' +
    '</div>';
  html += '<div id="fe-desglose-monto" style="font-size:12.5px;color:var(--forest);background:var(--forest-soft);border-radius:8px;padding:8px 12px;margin-bottom:12px;"></div>';
  // 13/08/2026: reemplaza al antiguo "Modalidad de pago" (día/hora), que se eliminó porque
  // esa elección ahora se hace al anotar cada movimiento, no en la ficha. Este campo define
  // otra cosa: de dónde sale la BASE del período.
  const baseActual = val('basePeriodo', val('periodicidad', 'Semanal') === 'Semanal' ? 'Jornada' : 'Fijo');
  html += '<label>Base del período</label><select id="fe-base" onchange="pintarDesgloseMontoEquipo_()">' +
    '<option value="Fijo" ' + (baseActual === 'Fijo' ? 'selected' : '') + '>Monto fijo por ciclo</option>' +
    '<option value="Jornada" ' + (baseActual === 'Jornada' ? 'selected' : '') + '>Días trabajados</option>' +
    '</select>';
  html += '<div id="fe-base-nota" style="font-size:11.5px;color:var(--ink-soft);margin:5px 0 0;line-height:1.4;"></div>';
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
  pintarConfigPagoEquipo_();
}

// Fecha de pago estructurada (Opción A, acordada con Osmar 29/07/2026): campos distintos
// según periodicidad, en vez del texto libre que no se podía calcular como fecha real.
function pintarConfigPagoEquipo_() {
  const cont = document.getElementById('fe-config-pago');
  if (!cont) return;
  if (equipoCache.semanaPagoEdit == null) {
    const c0 = equipoCache.configPagoEdit;
    equipoCache.semanaPagoEdit = (c0 && c0.semana === 'misma') ? 'misma' : 'siguiente';
  }
  const periodicidad = document.getElementById('fe-periodicidad').value;
  const cfg = equipoCache.configPagoEdit;
  if (periodicidad === 'Semanal') {
    const diaActual = (cfg && cfg.tipo === 'semanal') ? cfg.dia : 'Lun';
    // 13/08/2026: el día de pago por sí solo no basta — hay que saber si cae en la misma
    // semana del período o en la siguiente. Katherine cobra el viernes de su propia semana;
    // Lucas y Rosa, el lunes y el miércoles de la semana siguiente.
    const semanaActual = (cfg && cfg.tipo === 'semanal' && cfg.semana === 'misma') ? 'misma' : 'siguiente';
    cont.innerHTML = '<select id="fe-pago-dia" onchange="actualizarConfigPagoEquipo_()">' +
      DIAS_CHIPS_EQUIPO.map(d => '<option ' + (d === diaActual ? 'selected' : '') + '>' + d + '</option>').join('') + '</select>' +
      '<div style="font-size:12px;font-weight:600;margin:10px 0 5px;">¿De qué semana?</div>' +
      '<div style="display:flex;gap:6px;">' +
        ['misma', 'siguiente'].map(v => '<span class="chip-sub' + (semanaActual === v ? ' activo' : '') + '" style="cursor:pointer;" ' +
          'onclick="elegirSemanaPagoEquipo_(\'' + v + '\')">La ' + v + '</span>').join('') +
      '</div>' +
      '<div id="fe-semana-nota" style="font-size:12px;color:var(--forest);background:var(--forest-soft);border-radius:8px;padding:8px 12px;margin-top:10px;line-height:1.45;"></div>';
  } else if (periodicidad === 'Quincenal') {
    const dias = (cfg && cfg.tipo === 'quincenal' && cfg.dias) ? cfg.dias : [15, 30];
    cont.innerHTML = '<div style="display:flex;gap:6px;align-items:center;">' +
      '<input type="number" id="fe-pago-dia1" value="' + dias[0] + '" style="width:60px;" onchange="actualizarConfigPagoEquipo_()"> y ' +
      '<input type="number" id="fe-pago-dia2" value="' + dias[1] + '" style="width:60px;" onchange="actualizarConfigPagoEquipo_()"></div>';
  } else {
    const esUltimo = cfg && cfg.tipo === 'mensual' && cfg.dia === 'ultimo';
    const diaActual = (cfg && cfg.tipo === 'mensual' && !esUltimo) ? cfg.dia : 1;
    cont.innerHTML = '<div style="display:flex;gap:6px;align-items:center;">' +
      '<input type="number" id="fe-pago-diames" value="' + diaActual + '" style="width:60px;" ' + (esUltimo ? 'disabled' : '') + ' onchange="actualizarConfigPagoEquipo_()">' +
      '<label style="display:flex;align-items:center;gap:4px;font-size:12px;font-weight:400;"><input type="checkbox" id="fe-pago-ultimo" ' + (esUltimo ? 'checked' : '') + ' onchange="toggleUltimoDiaEquipo_()" style="width:auto;"> Último día</label></div>';
  }
  actualizarConfigPagoEquipo_();
}

function toggleUltimoDiaEquipo_() {
  document.getElementById('fe-pago-diames').disabled = document.getElementById('fe-pago-ultimo').checked;
  actualizarConfigPagoEquipo_();
}

function actualizarConfigPagoEquipo_() {
  const periodicidad = document.getElementById('fe-periodicidad').value;
  if (periodicidad === 'Semanal') {
    equipoCache.configPagoEdit = { tipo: 'semanal', dia: document.getElementById('fe-pago-dia').value,
      semana: equipoCache.semanaPagoEdit || 'siguiente' };
    pintarNotaSemanaPagoEquipo_();
  } else if (periodicidad === 'Quincenal') {
    equipoCache.configPagoEdit = { tipo: 'quincenal', dias: [num_(document.getElementById('fe-pago-dia1').value), num_(document.getElementById('fe-pago-dia2').value)] };
  } else {
    const ultimo = document.getElementById('fe-pago-ultimo').checked;
    equipoCache.configPagoEdit = { tipo: 'mensual', dia: ultimo ? 'ultimo' : num_(document.getElementById('fe-pago-diames').value) };
  }
}

function elegirSemanaPagoEquipo_(valor) {
  equipoCache.semanaPagoEdit = valor;
  pintarConfigPagoEquipo_();
}

// Nota en lenguaje natural con las fechas reales de la semana en curso — confirmar la
// configuración leyendo "se le paga el viernes 14/08 la semana del 10 al 16" es mucho más
// seguro que deducirlo de dos campos sueltos.
function pintarNotaSemanaPagoEquipo_() {
  const el = document.getElementById('fe-semana-nota');
  if (!el) return;
  const cfg = equipoCache.configPagoEdit;
  if (!cfg || cfg.tipo !== 'semanal') { el.textContent = ''; return; }
  const hoy = new Date();
  const cierre = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  if (cierre.getDay() !== 0) cierre.setDate(cierre.getDate() + (7 - cierre.getDay()));
  const inicioPeriodo = new Date(cierre.getFullYear(), cierre.getMonth(), cierre.getDate() - 6);
  const objetivo = DIAS_CHIPS_EQUIPO.indexOf(cfg.dia) + 1;
  const idxObjetivo = objetivo === 7 ? 0 : objetivo;
  const cursor = new Date(cierre.getFullYear(), cierre.getMonth(), cierre.getDate());
  if (cfg.semana === 'misma') cursor.setDate(cursor.getDate() - 6);
  else cursor.setDate(cursor.getDate() + 1);
  for (let i = 0; i < 7 && cursor.getDay() !== idxObjetivo; i++) cursor.setDate(cursor.getDate() + 1);
  const dm = d => String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
  el.innerHTML = 'El período va de lunes a domingo. Se le paga el <b>' + cfg.dia.toLowerCase() + ' ' + dm(cursor) +
    '</b> la semana del <b>' + dm(inicioPeriodo) + ' al ' + dm(cierre) + '</b>.';
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
  const periodicidad = document.getElementById('fe-periodicidad') ? document.getElementById('fe-periodicidad').value : 'Semanal';
  const monto = num_(document.getElementById('fe-monto') ? document.getElementById('fe-monto').value : 0);
  const semanas = semanasParaTasaEquipo_(periodicidad);
  const horasSemana = equipoCache.jornadaEdit.reduce((s, b) => s + b.dias.length * num_(b.horas), 0);
  // Misma fórmula que valoresCalculadosColaborador_ en Equipo.gs — si una cambia, la otra
  // también. Acá la tasa se mantiene exacta y solo se redondea cada valor mostrado, igual
  // que en el backend: redondear la tasa antes de multiplicar era el bug de los pesos sueltos.
  const valorHora = (horasSemana * semanas) > 0 ? monto / (horasSemana * semanas) : 0;
  let html = horasSemana + ' h netas por semana · valor hora ' + fmt(Math.round(valorHora));
  equipoCache.jornadaEdit.forEach(b => {
    if (!b.dias.length) return;
    html += '<div style="display:flex;justify-content:space-between;padding:4px 0 0;">' +
      '<span>' + b.dias.join(', ') + ' · ' + num_(b.horas) + ' h</span>' +
      '<span class="mono">' + fmt(Math.round(valorHora * num_(b.horas))) + '</span></div>';
  });
  resumen.innerHTML = html;
}

function pintarDesgloseMontoEquipo_() {
  const el = document.getElementById('fe-desglose-monto');
  if (!el) return;
  const monto = num_(document.getElementById('fe-monto') ? document.getElementById('fe-monto').value : 0);
  const periodicidad = document.getElementById('fe-periodicidad') ? document.getElementById('fe-periodicidad').value : 'Semanal';
  if (periodicidad === 'Quincenal') el.textContent = fmt(monto) + ' al mes → ' + fmt(monto / 2) + ' cada quincena';
  else if (periodicidad === 'Mensual') el.textContent = fmt(monto) + ' al mes, en un solo pago';
  else el.textContent = fmt(monto) + ' a la semana';
  const nota = document.getElementById('fe-base-nota');
  const selBase = document.getElementById('fe-base');
  if (nota && selBase) {
    nota.textContent = selBase.value === 'Fijo'
      ? 'Cobra el monto completo del ciclo. Ausencias y extras lo ajustan.'
      : 'Cobra según los días de jornada que caigan dentro del período.';
  }
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
    diasDePago: '', configPago: equipoCache.configPagoEdit,
    basePeriodo: document.getElementById('fe-base').value,
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
  equipoCache.modoAusencia = 'completo';
  equipoCache.modoExtra = 'completo';
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

  const esRango = tipo === 'Licencia' || tipo === 'Vacaciones' || (tipo === 'Ausencia' && equipoCache.modoAusencia !== 'horas');
  html += '<label style="margin-top:14px;">Día' + (esRango ? ' (desde)' : '') + '</label>' +
    '<input type="date" id="me-fecha" value="' + fechaLocalISO() + '" onchange="refrescarPreviewMovimientoEquipo_()">';
  // Nota de jornada bajo la fecha (13/08/2026): antes se elegía una fecha a ciegas y recién
  // al guardar se descubría si el sistema la consideraba día laboral.
  html += '<div id="me-nota-dia" style="font-size:11.5px;color:var(--ink-soft);margin-top:5px;line-height:1.4;"></div>';

  // 13/08/2026: Ausencia y Extra comparten el mismo selector día/horas. Antes Extra no
  // preguntaba nada: obligaba a escribir horas o pagaba día completo según unidadDescuento
  // de la ficha, que ya no existe.
  if (tipo === 'Ausencia' || tipo === 'Extra') {
    const esAus = tipo === 'Ausencia';
    const modo = (esAus ? equipoCache.modoAusencia : equipoCache.modoExtra) || 'completo';
    const fn = esAus ? 'cambiarModoAusenciaEquipo_' : 'cambiarModoExtraEquipo_';
    html += '<label>' + (esAus ? '¿Cuánto faltó?' : '¿Cuánto trabajó de más?') + '</label><div class="toggle-group">' +
      '<button type="button" id="me-modo-completo" class="' + (modo === 'completo' ? 'selected' : '') + '" onclick="' + fn + '(\'completo\',\'' + nombre + '\')">' + (esAus ? 'Día(s) completo(s)' : 'Día completo') + '</button>' +
      '<button type="button" class="' + (modo === 'horas' ? 'selected' : '') + '" onclick="' + fn + '(\'horas\',\'' + nombre + '\')">' + (esAus ? 'Algunas horas' : 'Horas específicas') + '</button>' +
    '</div>';
    if (modo === 'completo') {
      if (esAus) html += '<label>Hasta</label><input type="date" id="me-fecha-hasta" value="' + fechaLocalISO() + '" onchange="refrescarPreviewMovimientoEquipo_()">';
    } else {
      html += '<label>Horas</label><input type="number" id="me-horas" step="0.5" placeholder="ej. 2" oninput="refrescarPreviewMovimientoEquipo_()">';
    }
  }
  if (tipo === 'Licencia' || tipo === 'Vacaciones') {
    html += '<label>Hasta</label><input type="date" id="me-fecha-hasta" value="' + fechaLocalISO() + '">';
  }
  if (tipo === 'Anticipo') {
    html += '<label>Monto del anticipo</label><input type="number" id="me-monto-anticipo">';
  }
  html += '<label>Observación (opcional)</label><input type="text" id="me-observacion">';
  // Monto en vivo con su fórmula al lado — el número aparecía recién después de confirmar,
  // y ver "7 h × $3.411,37" es lo que permite cachar al instante si algo no cuadra.
  html += '<div id="me-preview" style="display:none;"></div>';
  html += '<div id="me-exito" style="display:none;background:var(--forest-soft);color:var(--forest);border-radius:8px;padding:9px 12px;margin-bottom:8px;font-size:13px;font-weight:600;"></div>';
  html += '<div class="error-msg" id="me-error"></div>';
  html += '<button class="btn-primary" style="margin-top:8px;" onclick="guardarMovimientoEquipo_(\'' + nombre + '\')">Guardar</button>';
  html += '<div style="font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:var(--ink-soft);margin:16px 0 6px;">Registrado este período</div>';
  html += '<div id="me-lista-periodo"></div>';
  cont.innerHTML = html;
  refrescarPreviewMovimientoEquipo_();
  pintarMovimientosDelPeriodoEquipo_(nombre);
}

function cambiarTipoMovimientoEquipo_(tipo, nombre) {
  equipoCache.tipoMovimientoActual = tipo;
  if (tipo === 'Ausencia') equipoCache.modoAusencia = 'completo';
  if (tipo === 'Extra') equipoCache.modoExtra = 'completo';
  pintarFormularioMovimientoEquipo_(nombre);
}

function cambiarModoAusenciaEquipo_(modo, nombre) {
  equipoCache.modoAusencia = modo;
  pintarFormularioMovimientoEquipo_(nombre);
}

function cambiarModoExtraEquipo_(modo, nombre) {
  equipoCache.modoExtra = modo;
  pintarFormularioMovimientoEquipo_(nombre);
}

// Espejo en pantalla del cálculo del backend. NO reemplaza la validación del servidor —
// registrarMovimientoEquipo revalida todo; esto solo evita que Osmar descubra un problema
// recién después de guardar. Misma fórmula que valorDiaColaborador_ en Equipo.gs.
const DIAS_JS_A_ABREV_ = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function bloqueDelDiaEquipo_(jornada, fechaISO) {
  if (!fechaISO) return null;
  const p = fechaISO.split('-');
  const f = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  const abrev = DIAS_JS_A_ABREV_[f.getDay()];
  return (jornada || []).find(b => (b.dias || []).indexOf(abrev) > -1) || null;
}

function nombreDiaEquipo_(fechaISO) {
  const nombres = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const p = fechaISO.split('-');
  return nombres[new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])).getDay()];
}

function refrescarPreviewMovimientoEquipo_() {
  const nota = document.getElementById('me-nota-dia');
  const prev = document.getElementById('me-preview');
  const fechaEl = document.getElementById('me-fecha');
  if (!nota || !fechaEl) return;
  const c = equipoCache.fichaActual, calc = equipoCache.calculadoActual;
  const tipo = equipoCache.tipoMovimientoActual;
  const fechaISO = fechaEl.value;
  const bloque = c ? bloqueDelDiaEquipo_(c.jornada, fechaISO) : null;

  if (!fechaISO || !c) { nota.textContent = ''; }
  else if (bloque) {
    nota.textContent = 'Es ' + nombreDiaEquipo_(fechaISO) + ' · jornada de ' + num_(bloque.horas) + ' h';
  } else {
    nota.textContent = 'Es ' + nombreDiaEquipo_(fechaISO) + ' · no está en su jornada';
  }

  const btnCompleto = document.getElementById('me-modo-completo');
  if (btnCompleto && tipo === 'Extra') {
    // Día completo no aplica si ese día no está en su jornada: no hay bloque de horas del
    // que sacar cuánto es "un día", e inventar un día tipo sería adivinar.
    btnCompleto.disabled = !bloque;
    btnCompleto.style.opacity = bloque ? '' : '.4';
    btnCompleto.style.textDecoration = bloque ? '' : 'line-through';
    if (!bloque && (equipoCache.modoExtra || 'completo') === 'completo') {
      nota.textContent += ' — indica cuántas horas trabajó';
    }
  }

  if (!prev) return;
  if (!calc || !calc.valorHora || (tipo !== 'Ausencia' && tipo !== 'Extra')) { prev.style.display = 'none'; return; }
  const modo = (tipo === 'Ausencia' ? equipoCache.modoAusencia : equipoCache.modoExtra) || 'completo';
  const horasEl = document.getElementById('me-horas');
  let horas = 0;
  if (modo === 'horas') horas = num_(horasEl ? horasEl.value : 0);
  else if (bloque) horas = num_(bloque.horas);
  if (!(horas > 0)) { prev.style.display = 'none'; return; }
  const monto = Math.round(horas * calc.valorHora);
  const esAus = tipo === 'Ausencia';
  prev.style.display = 'block';
  prev.innerHTML = '<div style="background:var(--forest);color:#fff;border-radius:14px;padding:14px 16px;margin-top:16px;">' +
    '<div style="color:#CFE0D3;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.2px;">' + (esAus ? 'Se descuenta' : 'Se suma') + '</div>' +
    '<div class="mono" style="font-size:27px;font-weight:700;margin-top:3px;">' + (esAus ? '−' : '+') + fmt(monto) + '</div>' +
    '<div style="font-size:12px;color:#CFE0D3;margin-top:4px;">' + horas + ' h × ' + fmt(Math.round(calc.valorHora)) + '</div></div>';
}

async function guardarMovimientoEquipo_(nombre) {
  const err = document.getElementById('me-error'); err.textContent = '';
  const exito = document.getElementById('me-exito'); exito.style.display = 'none';
  const tipo = equipoCache.tipoMovimientoActual;
  const d = { colaborador: nombre, fecha: document.getElementById('me-fecha').value, tipo: tipo,
    observacion: document.getElementById('me-observacion').value.trim() };
  if (tipo === 'Licencia' || tipo === 'Vacaciones') d.fechaHasta = document.getElementById('me-fecha-hasta').value;
  if (tipo === 'Ausencia' || tipo === 'Extra') {
    d.modo = (tipo === 'Ausencia' ? equipoCache.modoAusencia : equipoCache.modoExtra) || 'completo';
    d.modoAusencia = d.modo;
    if (d.modo === 'completo') {
      const hastaEl = document.getElementById('me-fecha-hasta');
      if (hastaEl) d.fechaHasta = hastaEl.value;
    } else {
      d.horas = document.getElementById('me-horas').value;
    }
  }
  if (tipo === 'Anticipo') d.monto = document.getElementById('me-monto-anticipo').value;
  const horasEl = document.getElementById('me-horas');

  const r = await llamarAPI('registrarMovimientoEquipo', { data: d });
  if (!r.ok) { err.textContent = r.error; return; }
  exito.style.display = 'block';
  exito.textContent = '✓ ' + tipo + ' guardada' + (r.monto ? ' — ' + fmt(r.monto) : '');
  document.getElementById('me-observacion').value = '';
  if (horasEl) horasEl.value = '';
  refrescarPreviewMovimientoEquipo_();
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
// Criterio acordado con Osmar (13/08/2026): en todo el módulo, por defecto se muestra el
// MES EN CURSO, con opción de ver el historial completo. Un pago pertenece al mes del
// PERÍODO TRABAJADO (su fecha "hasta"), no al mes en que se pagó — mismo criterio que usa
// obtenerResumenEquipo y que la fecha del gasto en Finanzas.
function esDelMesEnCursoEquipo_(fechaCL) {
  if (!fechaCL) return false;
  const p = String(fechaCL).split('/');
  if (p.length !== 3) return false;
  const hoy = new Date();
  return Number(p[1]) === hoy.getMonth() + 1 && Number(p[2]) === hoy.getFullYear();
}

function nombreMesEnCursoEquipo_() {
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
    'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return meses[new Date().getMonth()];
}

// Barra "Mostrando <mes> · Ver todo" reutilizada por historial y comunicados.
function barraPeriodoEquipo_(verTodo, fnToggle) {
  return '<div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;' +
    'color:var(--ink-soft);background:var(--paper);border-radius:8px;padding:7px 11px;margin-bottom:10px;">' +
    '<span>' + (verTodo ? 'Mostrando todo el historial' : 'Mostrando ' + nombreMesEnCursoEquipo_()) + '</span>' +
    '<span style="color:var(--forest);font-weight:600;cursor:pointer;" onclick="' + fnToggle + '">' +
      (verTodo ? 'Ver solo el mes' : 'Ver todo') + '</span></div>';
}

function fechaCLaISO_(cl) { const p = cl.split('/'); return p[2] + '-' + p[1] + '-' + p[0]; }
function fechaISOaCL_(iso) { const p = iso.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }

async function abrirCierrePagoEquipo(nombre) {
  irA('screen-cierre-equipo');
  const cont = document.getElementById('cierre-equipo-cont');
  cont.innerHTML = skeletonCards(2);
  const r = await llamarAPISilencioso('obtenerSugerenciaPeriodoPago', { colaborador: nombre });
  // El backend entrega las fechas en formato CL (dd/MM/yyyy) — se convierten UNA vez a ISO
  // para los <input type=date>, y de vuelta a CL solo al mandarlas al servidor.
  const desdeISO = r && r.ok && r.desde ? fechaCLaISO_(r.desde) : fechaLocalISO();
  const hastaISO = r && r.ok && r.hasta ? fechaCLaISO_(r.hasta) : fechaLocalISO();
  await pintarCierrePagoEquipo_(nombre, desdeISO, hastaISO);
}

async function pintarCierrePagoEquipo_(nombre, desdeISO, hastaISO) {
  const cont = document.getElementById('cierre-equipo-cont');
  const r = await llamarAPISilencioso('obtenerCierrePago', { colaborador: nombre, desde: fechaISOaCL_(desdeISO), hasta: fechaISOaCL_(hastaISO) });
  if (!r.ok) { cont.innerHTML = '<p class="error-msg">' + r.error + '</p>'; return; }
  const cierre = r.cierre;
  equipoCache.cierreActual = cierre;
  const movs = cierre.movimientos || [];
  const sol = cierre.solape;
  // Desglose de la base (13/08/2026): antes solo se veía un monto sin explicación, y esa
  // opacidad es justamente lo que hizo invisible el bug de la base fija. Ahora se ve de
  // dónde sale.
  const baseDet = cierre.baseUnidad === 'dias'
    ? cierre.baseUnidades + ' día(s) de jornada'
    : cierre.baseUnidades + ' fecha(s) de pago × ' + fmt(cierre.baseValorUnidad);
  // Con solape los montos se atenúan pero NO se esconden: así se entiende qué se habría
  // pagado y por qué está mal, en vez de quedar frente a una pantalla vacía.
  const dim = sol ? ' opacity:.45;' : '';
  const detalle = (tipo, color) => movs.filter(m => m.tipo === tipo).map(m =>
    '<div style="font-size:12px;color:var(--ink-soft);padding-left:10px;margin-top:3px;">· ' + m.fecha + (m.observacion ? ' — ' + m.observacion : '') + ' · <span style="color:' + color + ';">' + fmt(m.monto) + '</span></div>').join('');
  cont.innerHTML =
    '<h2 style="font-size:17px;">Cierre de pago</h2><p style="font-size:12.5px;color:var(--ink-soft);margin-top:-6px;">' + nombre + '</p>' +
    '<div style="display:flex;gap:10px;">' +
      '<div style="flex:1;"><label>Desde</label><input type="date" id="ce-desde" value="' + desdeISO + '" onchange="recalcularCierrePagoEquipo_(\'' + nombre + '\')"></div>' +
      '<div style="flex:1;"><label>Hasta</label><input type="date" id="ce-hasta" value="' + hastaISO + '" onchange="recalcularCierrePagoEquipo_(\'' + nombre + '\')"></div>' +
    '</div>' +
    (sol ? '<div style="background:var(--terracotta-soft);color:var(--danger);font-size:13px;line-height:1.45;border-radius:9px;padding:10px 12px;margin:14px 0 0;">' +
        '<b>Este período ya fue pagado.</b><br>El ' + sol.desde + ' al ' + sol.hasta + ' se pagó ' + fmt(sol.total) + ' el ' + sol.fechaPago + '. Ajusta la fecha "desde" o usa el botón de abajo.</div>' : '') +
    '<div style="padding:14px 0 9px;font-size:14px;' + dim + '"><span style="color:var(--ink-soft);">Base del período</span><span style="float:right;">' + fmt(cierre.base) + '</span>' +
      '<div style="font-size:12px;color:var(--ink-soft);padding-left:10px;margin-top:3px;">' + baseDet + '</div></div>' +
    '<div style="padding:9px 0;font-size:14px;border-top:1px solid var(--border);' + dim + '"><span style="color:var(--ink-soft);">Ausencias (' + movs.filter(m => m.tipo === 'Ausencia').length + ')</span><span style="float:right;color:var(--danger);">−' + fmt(cierre.ausencias) + '</span>' + detalle('Ausencia', 'var(--danger)') + '</div>' +
    '<div style="padding:9px 0;font-size:14px;border-top:1px solid var(--border);' + dim + '"><span style="color:var(--ink-soft);">Extras (' + movs.filter(m => m.tipo === 'Extra').length + ')</span><span style="float:right;color:var(--success);">+' + fmt(cierre.extras) + '</span>' + detalle('Extra', 'var(--success)') + '</div>' +
    '<div style="padding:9px 0;font-size:14px;border-top:1px solid var(--border);border-bottom:1px solid var(--border);' + dim + '"><span style="color:var(--ink-soft);">Anticipos (' + movs.filter(m => m.tipo === 'Anticipo').length + ')</span><span style="float:right;color:var(--danger);">−' + fmt(cierre.anticipos) + '</span>' + detalle('Anticipo', 'var(--danger)') + '</div>' +
    (movs.some(m => m.tipo === 'Licencia' || m.tipo === 'Vacaciones')
      ? '<div style="padding:9px 0;font-size:12.5px;color:var(--ink-soft);">Licencia médica / Vacaciones — informativo, no descuenta' + detalle('Licencia', 'var(--ink-soft)') + detalle('Vacaciones', 'var(--ink-soft)') + '</div>' : '') +
    '<div style="display:flex;justify-content:space-between;padding:14px 0;font-size:17px;font-weight:700;' + dim + '"><span>A pagar</span><span>' + fmt(cierre.total) + '</span></div>' +
    '<label style="' + dim + '">Medio de pago</label><select id="ce-medio" ' + (sol ? 'disabled style="opacity:.45;"' : '') + '><option>Transferencia</option><option>Efectivo</option></select>' +
    '<div class="error-msg" id="ce-error"></div>' +
    '<button class="btn-primary" ' + (sol ? 'disabled' : '') + ' onclick="confirmarPagoEquipo_(\'' + nombre + '\')">Confirmar y registrar pago</button>' +
    (sol ? '<button class="btn-secondary" style="margin-top:8px;" onclick="ajustarAPeriodoPendienteEquipo_(\'' + nombre + '\')">Ajustar al período pendiente</button>' : '') +
    '<p style="font-size:12px;color:var(--ink-soft);text-align:center;margin-top:8px;">Queda guardado y visible para ' + nombre.split(' ')[0] + '</p>';
}

// Corrige las fechas de un toque en vez de obligar a calcular a mano dónde termina lo ya
// pagado — usa la misma sugerencia del backend (arranca en UltimaFechaPagada + 1 día).
async function ajustarAPeriodoPendienteEquipo_(nombre) {
  const r = await llamarAPISilencioso('obtenerSugerenciaPeriodoPago', { colaborador: nombre });
  if (!r || !r.ok) return;
  await pintarCierrePagoEquipo_(nombre, fechaCLaISO_(r.desde), fechaCLaISO_(r.hasta));
}

async function recalcularCierrePagoEquipo_(nombre) {
  await pintarCierrePagoEquipo_(nombre, document.getElementById('ce-desde').value, document.getElementById('ce-hasta').value);
}

async function confirmarPagoEquipo_(nombre) {
  const err = document.getElementById('ce-error'); err.textContent = '';
  const c = equipoCache.cierreActual;
  const r = await llamarAPI('confirmarPago', { data: { colaborador: nombre, desde: c.desde, hasta: c.hasta, base: c.base, ausencias: c.ausencias, extras: c.extras, anticipos: c.anticipos, total: c.total, medioPago: document.getElementById('ce-medio').value } });
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
  await aplicarAtajoResumenEquipo_('mes');
}

// Atajos de período (13/08/2026, con Osmar). Los tres van a mes o año COMPLETO, no "hasta
// hoy": el filtro del backend compara contra el fin del período trabajado, y un período
// puede cerrar después de hoy y pertenecer igual al mes en curso — con el tope en hoy, el
// pago del viernes 14 por la semana que cierra el 16 no aparecería hasta el día 16.
function rangoAtajoResumenEquipo_(atajo) {
  const hoy = new Date();
  const y = hoy.getFullYear(), m = hoy.getMonth();
  if (atajo === 'anterior') return [new Date(y, m - 1, 1), new Date(y, m, 0)];
  if (atajo === 'anio') return [new Date(y, 0, 1), new Date(y, 11, 31)];
  return [new Date(y, m, 1), new Date(y, m + 1, 0)];
}

async function aplicarAtajoResumenEquipo_(atajo) {
  const r = rangoAtajoResumenEquipo_(atajo);
  await pintarResumenEquipo_(fechaLocalISO(r[0]), fechaLocalISO(r[1]), atajo);
}

const ATAJOS_RESUMEN_EQUIPO = [
  { id: 'mes', label: 'Este mes' },
  { id: 'anterior', label: 'Mes anterior' },
  { id: 'anio', label: 'Este año' }
];

// atajo: 'mes' | 'anterior' | 'anio' | null. Va en null cuando las fechas se editan a mano;
// en ese caso ningún botón queda marcado y se rotula "Período personalizado", para que un
// botón encendido nunca muestre un rango que ya no corresponde.
async function pintarResumenEquipo_(desdeISO, hastaISO, atajo) {
  const cont = document.getElementById('resumen-equipo-cont');
  cont.innerHTML = skeletonCards(2);
  const r = await llamarAPISilencioso('obtenerResumenEquipo', { desde: fechaISOaCL_(desdeISO), hasta: fechaISOaCL_(hastaISO) });
  if (!r.ok) { cont.innerHTML = '<p class="error-msg">' + r.error + '</p>'; return; }
  let html = '<div class="pillbar">' +
    ATAJOS_RESUMEN_EQUIPO.map(a => '<button class="' + (atajo === a.id ? 'sel' : '') + '" ' +
      'onclick="aplicarAtajoResumenEquipo_(\'' + a.id + '\')">' + a.label + '</button>').join('') +
    '</div>';
  html += '<div style="display:flex;gap:10px;margin-bottom:' + (atajo ? '14px' : '6px') + ';">' +
      '<div style="flex:1;"><label>Desde</label><input type="date" id="re-desde" value="' + desdeISO + '" onchange="pintarResumenEquipo_(this.value,document.getElementById(\'re-hasta\').value,null)"></div>' +
      '<div style="flex:1;"><label>Hasta</label><input type="date" id="re-hasta" value="' + hastaISO + '" onchange="pintarResumenEquipo_(document.getElementById(\'re-desde\').value,this.value,null)"></div>' +
    '</div>';
  if (!atajo) html += '<p style="font-size:11.5px;color:var(--ink-soft);margin:0 0 14px;">Período personalizado</p>';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">' +
    '<div class="card" style="text-align:center;"><p style="font-size:11.5px;color:var(--ink-soft);margin:0;">Total pagado</p><p class="mono" style="font-size:20px;font-weight:700;margin:2px 0 0;">' + fmt(r.total) + '</p></div>' +
    '<div class="card" style="text-align:center;"><p style="font-size:11.5px;color:var(--ink-soft);margin:0;">Pagos</p><p class="mono" style="font-size:20px;font-weight:700;margin:2px 0 0;">' + r.cantidadPagos + '</p></div>' +
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
  const verTodoCom = !!equipoCache.verTodoComunicados;
  const comunicados = (r.comunicados || []).filter(c => verTodoCom || esDelMesEnCursoEquipo_(c.fecha));
  let html = barraPeriodoEquipo_(verTodoCom, 'alternarComunicadosEquipo_()');
  comunicados.forEach(c => {
    html += '<div style="padding:10px 0;border-bottom:1px solid var(--border);">' +
      '<div style="display:flex;justify-content:space-between;font-size:12.5px;color:var(--ink-soft);"><span>A ' + c.para + '</span><span>' + c.fecha + '</span></div>' +
      '<p style="font-size:13.5px;margin:3px 0 0;">' + c.texto + '</p>' +
      '<p style="font-size:11.5px;color:var(--ink-soft);margin:4px 0 0;">' + c.leidos + ' de ' + c.totalDestinatarios + ' leído' + (c.totalDestinatarios === 1 ? '' : 's') + '</p>' +
    '</div>';
  });
  if (!comunicados.length) html += '<p style="font-size:12.5px;color:var(--ink-soft);">' +
    (verTodoCom ? 'Todavía no has enviado comunicados.' : 'Sin comunicados en ' + nombreMesEnCursoEquipo_() + '.') + '</p>';
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
