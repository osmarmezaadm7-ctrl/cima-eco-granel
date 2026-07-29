/**
 * Equipo.gs — módulo de gestión de colaboradores: ficha (perfil, jornada, monto,
 * periodicidad), registro de ausencias/jornadas extra/anticipos, cierre y confirmación
 * de pago (que además genera el gasto correspondiente en Respuestas, categoría "Sueldos" —
 * ya existe en Categorias, mapeada a tipoCuenta "Gasto de personal", así que
 * estadoResultados() la refleja sola, sin tocar Finanzas.gs), y comunicados.
 *
 * NUEVO 28/07/2026 (con Osmar).
 *
 * Cálculo del valor de un día (ver valorDiaColaborador_):
 * - unidadDescuento 'dia': el colaborador no tiene horario (Rosa, Katherine) o su pago es
 *   fijo por día trabajado (Lucas). valorDia = monto del período ÷ cantidad de días
 *   laborales configurados en su jornada. Para Lucas, monto YA es el total de sus 3 días
 *   ($75.000), así que valorDia = $75.000 / 3 = $25.000 — coincide con lo acordado.
 * - unidadDescuento 'hora': el colaborador tiene bloques de jornada con horas distintas
 *   por día (Cecilia). valorHora = monto del período ÷ horas totales de la jornada.
 *   valorDia(fecha) = horas del bloque de ese día de semana × valorHora.
 *
 * Los períodos de pago (fechas desde/hasta) NO se infieren en automático más allá de una
 * sugerencia — Osmar los confirma/ajusta en pantalla antes de cerrar el pago. Con 4
 * periodicidades distintas y un caso (Rosa) donde el pago cae días después del cierre de
 * semana, forzar una fecha exacta por código es más riesgoso que dejarla como sugerencia
 * editable — es dinero real.
 */

const H_COLABORADORES = 'Colaboradores';
const H_MOVIMIENTOS_EQUIPO = 'MovimientosEquipo';
const H_PAGOS_EQUIPO = 'PagosEquipo';

const DIAS_SEMANA_ = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function requierePermisoEquipo_(solicitante) {
  if (!solicitante || !tienePermiso(solicitante, 'GestionarEquipo')) {
    return { ok: false, error: 'No tienes permiso para gestionar el equipo' };
  }
  return null;
}

// ============ FICHAS ============

function hojaColaboradores_() {
  const sh = getSheet(H_COLABORADORES);
  if (sh.getLastRow() === 0) {
    sh.appendRow(['Nombre', 'Telefono', 'Responsabilidades', 'Negocio', 'Monto', 'Periodicidad',
      'DiasDePago', 'UnidadDescuento', 'Jornada', 'UltimaFechaPagada', 'Estado']);
  }
  return sh;
}

function filaAObjetoColaborador_(f) {
  return {
    nombre: f[0], telefono: f[1] || '', responsabilidades: f[2] || '', negocio: f[3],
    monto: num(f[4]), periodicidad: f[5], diasDePago: f[6] || '',
    unidadDescuento: f[7] || 'dia', jornada: parsearJsonArreglo_(f[8]),
    ultimaFechaPagada: f[9] || '', estado: f[10] || 'Activo'
  };
}

// 'monto' en la ficha es SIEMPRE la cifra semanal (periodicidad Semanal) o la cifra MENSUAL
// (Quincenal/Mensual) — Quincenal se paga en 2 cuotas, pero el monto configurado es el total
// del mes completo (así lo definimos con Osmar para Cecilia: $350.000/mes, 2 pagos de
// $175.000). Por eso hay DOS conversiones distintas que no deben mezclarse:
//  - semanasParaTasa_: cuántas semanas representa 'monto', para sacar el valor hora/día.
//  - baseCicloPago_: cuánto corresponde pagar en UN ciclo (una quincena, una semana, un mes).
function semanasParaTasa_(periodicidad) {
  return periodicidad === 'Semanal' ? 1 : 52 / 12; // Quincenal y Mensual: monto es mensual
}
function baseCicloPago_(monto, periodicidad) {
  return periodicidad === 'Quincenal' ? monto / 2 : monto;
}

function valoresCalculadosColaborador_(c) {
  const semanas = semanasParaTasa_(c.periodicidad);
  const horasSemanales = (c.jornada || []).reduce((s, b) => s + (b.dias || []).length * num(b.horas), 0);
  const diasSemanales = (c.jornada || []).reduce((s, b) => s + (b.dias || []).length, 0);
  if (c.unidadDescuento === 'hora') {
    const horasParaTasa = horasSemanales * semanas;
    const valorHora = horasParaTasa > 0 ? c.monto / horasParaTasa : 0;
    return { valorHora: Math.round(valorHora), horasTotales: horasSemanales,
      porBloque: (c.jornada || []).map(b => ({ dias: b.dias, horas: b.horas, valorDia: Math.round(valorHora * num(b.horas)) })) };
  }
  const diasParaTasa = diasSemanales * semanas;
  const valorDia = diasParaTasa > 0 ? c.monto / diasParaTasa : 0;
  return { valorDia: Math.round(valorDia), diasTotales: diasSemanales };
}

function obtenerEquipo(solicitante) {
  const err = requierePermisoEquipo_(solicitante); if (err) return err;
  const datos = hojaColaboradores_().getDataRange().getValues();
  const lista = [];
  for (let i = 1; i < datos.length; i++) {
    const f = datos[i];
    if (!f[0] || f[10] === 'Inactivo') continue;
    const c = filaAObjetoColaborador_(f);
    const periodo = calcularPeriodoPendiente_(c);
    lista.push({ nombre: c.nombre, negocio: c.negocio, periodicidad: c.periodicidad,
      diasDePago: c.diasDePago, totalPendiente: periodo.total, desde: periodo.desde, hasta: periodo.hasta });
  }
  return { ok: true, colaboradores: lista };
}

function obtenerFichaColaborador(nombre, solicitante) {
  const err = requierePermisoEquipo_(solicitante); if (err) return err;
  const datos = hojaColaboradores_().getDataRange().getValues();
  for (let i = 1; i < datos.length; i++) {
    if (datos[i][0] !== nombre) continue;
    const c = filaAObjetoColaborador_(datos[i]);
    return { ok: true, colaborador: c, calculado: valoresCalculadosColaborador_(c) };
  }
  return { ok: false, error: 'Colaborador no encontrado' };
}

// d: {esNuevo, nombreOriginal, nombre, telefono, responsabilidades, negocio, monto,
//     periodicidad, diasDePago, unidadDescuento, jornada:[{dias:[...],horas}], pin}
// Si esNuevo, además crea la fila en Usuarios y en Permisos (acceso al sistema) —
// acordado con Osmar: un solo botón "Crear ficha y acceso".
function guardarFichaColaborador(d, solicitante) {
  const err = requierePermisoEquipo_(solicitante); if (err) return err;
  if (!d.nombre) return { ok: false, error: 'Falta el nombre' };
  if (!/^\d{4}$/.test(String(d.pin || '')) && d.esNuevo) {
    return { ok: false, error: 'El PIN debe tener 4 dígitos' };
  }

  const sh = hojaColaboradores_();
  const datos = sh.getDataRange().getValues();
  const buscarNombre = d.esNuevo ? d.nombre : (d.nombreOriginal || d.nombre);
  let filaExistente = -1;
  for (let i = 1; i < datos.length; i++) {
    if (datos[i][0] === buscarNombre) { filaExistente = i + 1; break; }
  }
  if (d.esNuevo && filaExistente > -1) return { ok: false, error: 'Ya existe un colaborador con ese nombre' };
  if (!d.esNuevo && filaExistente === -1) return { ok: false, error: 'Colaborador no encontrado' };

  const fila = [d.nombre, d.telefono || '', d.responsabilidades || '', d.negocio, num(d.monto),
    d.periodicidad, d.diasDePago || '', d.unidadDescuento || 'dia', JSON.stringify(d.jornada || []),
    d.esNuevo ? '' : undefined, 'Activo'];

  if (d.esNuevo) {
    sh.appendRow([d.nombre, d.telefono || '', d.responsabilidades || '', d.negocio, num(d.monto),
      d.periodicidad, d.diasDePago || '', d.unidadDescuento || 'dia', JSON.stringify(d.jornada || []),
      '', 'Activo']);
    getSheet(H_USUARIOS).appendRow([d.nombre, String(d.pin), 'Staff', d.negocio, 'Activo']);
    getSheet(H_PERMISOS).appendRow([d.nombre, JSON.stringify({})]);
  } else {
    const rango = sh.getRange(filaExistente, 1, 1, 9);
    rango.setValues([[d.nombre, d.telefono || '', d.responsabilidades || '', d.negocio, num(d.monto),
      d.periodicidad, d.diasDePago || '', d.unidadDescuento || 'dia', JSON.stringify(d.jornada || [])]]);
    // Si cambió el nombre, se actualiza también en Usuarios/Permisos para no perder el acceso.
    if (d.nombreOriginal && d.nombreOriginal !== d.nombre) {
      actualizarNombreEnHoja_(H_USUARIOS, d.nombreOriginal, d.nombre);
      actualizarNombreEnHoja_(H_PERMISOS, d.nombreOriginal, d.nombre);
    }
  }
  return { ok: true, mensaje: d.esNuevo ? 'Colaborador y acceso creados' : 'Ficha actualizada' };
}

function actualizarNombreEnHoja_(nombreHoja, nombreViejo, nombreNuevo) {
  const sh = getSheet(nombreHoja);
  const datos = sh.getDataRange().getValues();
  for (let i = 1; i < datos.length; i++) {
    if (datos[i][0] === nombreViejo) { sh.getRange(i + 1, 1).setValue(nombreNuevo); return; }
  }
}

// ============ MOVIMIENTOS (Ausencia / Extra / Anticipo) ============

function hojaMovimientosEquipo_() {
  const sh = getSheet(H_MOVIMIENTOS_EQUIPO);
  if (sh.getLastRow() === 0) sh.appendRow(['Id', 'Fecha', 'Colaborador', 'Tipo', 'Monto', 'Observacion', 'FechaRegistro']);
  return sh;
}

// Busca en la jornada el bloque que incluye ese día de semana ('Lun','Mar',...).
function bloqueDelDia_(jornada, diaAbrev) {
  return (jornada || []).find(b => (b.dias || []).indexOf(diaAbrev) > -1) || null;
}

// Calcula cuánto vale un día concreto para un colaborador — usado tanto para Ausencia
// (día que sí está en su jornada regular) como base de referencia para Extra.
function valorDiaColaborador_(c, fecha) {
  const diaAbrev = DIAS_SEMANA_[fecha.getDay()];
  const bloque = bloqueDelDia_(c.jornada, diaAbrev);
  const calc = valoresCalculadosColaborador_(c);
  if (c.unidadDescuento === 'hora') {
    const horas = bloque ? num(bloque.horas) : 0;
    return { horas: horas, valor: Math.round(horas * (calc.valorHora || 0)), esDiaLaboral: !!bloque };
  }
  return { horas: null, valor: calc.valorDia || 0, esDiaLaboral: !!bloque };
}

// d: {colaborador, fecha ('yyyy-mm-dd'), tipo:'Ausencia'|'Extra'|'Anticipo', monto (solo
//     Anticipo, o Extra si unidadDescuento='hora' y el día no es de su jornada regular),
//     horas (opcional, solo Extra + unidadDescuento='hora' en un día fuera de jornada),
//     observacion}
function registrarMovimientoEquipo(d, solicitante) {
  const err = requierePermisoEquipo_(solicitante); if (err) return err;
  const ficha = obtenerFichaColaborador(d.colaborador, solicitante);
  if (!ficha.ok) return ficha;
  const c = ficha.colaborador;
  const fecha = parseFechaCL(d.fecha);
  if (!fecha) return { ok: false, error: 'Fecha inválida' };

  let monto;
  if (d.tipo === 'Anticipo') {
    monto = num(d.monto);
    if (monto <= 0) return { ok: false, error: 'El anticipo debe ser mayor a 0' };
  } else if (d.tipo === 'Ausencia') {
    const v = valorDiaColaborador_(c, fecha);
    if (!v.esDiaLaboral) return { ok: false, error: 'Ese día no está en la jornada de ' + c.nombre };
    monto = v.valor;
  } else if (d.tipo === 'Extra') {
    const v = valorDiaColaborador_(c, fecha);
    if (v.esDiaLaboral) {
      monto = v.valor; // día ya configurado en su jornada — mismo valor que un día normal
    } else if (c.unidadDescuento === 'hora') {
      const calc = valoresCalculadosColaborador_(c);
      monto = Math.round(num(d.horas) * (calc.valorHora || 0));
      if (monto <= 0) return { ok: false, error: 'Indica las horas trabajadas ese día' };
    } else {
      monto = num(d.monto) || (valoresCalculadosColaborador_(c).valorDia || 0);
    }
  } else {
    return { ok: false, error: 'Tipo de movimiento no reconocido' };
  }

  const id = nuevoId('MOVEQ');
  hojaMovimientosEquipo_().appendRow([id, d.fecha, d.colaborador, d.tipo, monto, d.observacion || '', new Date()]);
  return { ok: true, id: id, monto: monto };
}

function eliminarMovimientoEquipo(id, solicitante) {
  const err = requierePermisoEquipo_(solicitante); if (err) return err;
  const sh = hojaMovimientosEquipo_();
  const datos = sh.getDataRange().getValues();
  for (let i = 1; i < datos.length; i++) {
    if (datos[i][0] !== id) continue;
    sh.deleteRow(i + 1);
    return { ok: true };
  }
  return { ok: false, error: 'Movimiento no encontrado' };
}

function movimientosDelPeriodo_(colaborador, desde, hasta) {
  const datos = hojaMovimientosEquipo_().getDataRange().getValues();
  const lista = [];
  for (let i = 1; i < datos.length; i++) {
    const f = datos[i];
    if (f[2] !== colaborador) continue;
    const fecha = parseFechaCL(f[1]);
    if (!fecha || fecha < desde || fecha > hasta) continue;
    lista.push({ id: f[0], fecha: f[1], tipo: f[3], monto: num(f[4]), observacion: f[5] || '' });
  }
  return lista;
}

// ============ CIERRE Y CONFIRMACIÓN DE PAGO ============

// Sugerencia de período pendiente — editable por Osmar antes de confirmar. No intenta
// adivinar reglas de desfase caso a caso (ver nota de diseño arriba); si no hay
// UltimaFechaPagada, sugiere el ciclo que termina hoy.
function calcularPeriodoPendiente_(c) {
  const hoy = new Date();
  let desde;
  if (c.ultimaFechaPagada) {
    desde = new Date(parseFechaCL(c.ultimaFechaPagada).getTime() + 86400000);
  } else {
    const dias = c.periodicidad === 'Semanal' ? 6 : c.periodicidad === 'Quincenal' ? 14 : 29;
    desde = new Date(hoy.getTime() - dias * 86400000);
  }
  const hasta = hoy;
  return calcularCierrePeriodo_(c, desde, hasta);
}

function calcularCierrePeriodo_(c, desde, hasta) {
  const baseCicloCompleto = baseCicloPago_(c.monto, c.periodicidad);
  const movs = movimientosDelPeriodo_(c.nombre, desde, hasta);
  const ausencias = movs.filter(m => m.tipo === 'Ausencia').reduce((s, m) => s + m.monto, 0);
  const extras = movs.filter(m => m.tipo === 'Extra').reduce((s, m) => s + m.monto, 0);
  const anticipos = movs.filter(m => m.tipo === 'Anticipo').reduce((s, m) => s + m.monto, 0);
  const total = Math.round(baseCicloCompleto - ausencias + extras - anticipos);
  return { desde: formatFechaCL_(desde), hasta: formatFechaCL_(hasta), base: Math.round(baseCicloCompleto),
    ausencias: ausencias, extras: extras, anticipos: anticipos, total: total, movimientos: movs };
}

function formatFechaCL_(fecha) {
  return Utilities.formatDate(fecha, tzHoja(), 'dd/MM/yyyy');
}

function obtenerCierrePago(colaborador, desde, hasta, solicitante) {
  const err = requierePermisoEquipo_(solicitante); if (err) return err;
  const ficha = obtenerFichaColaborador(colaborador, solicitante);
  if (!ficha.ok) return ficha;
  const d = parseFechaCL(desde), h = parseFechaCL(hasta);
  if (!d || !h) return { ok: false, error: 'Fechas inválidas' };
  return { ok: true, cierre: calcularCierrePeriodo_(ficha.colaborador, d, h) };
}

// d: {colaborador, desde, hasta, base, ausencias, extras, anticipos, total} — los montos
// vienen del cierre que Osmar ya vio y confirmó en pantalla (no se recalculan a ciegas acá,
// para que lo que se registre sea exactamente lo que Osmar confirmó, incluida cualquier
// fecha que haya ajustado a mano).
function confirmarPago(d, solicitante) {
  const err = requierePermisoEquipo_(solicitante); if (err) return err;
  const ficha = obtenerFichaColaborador(d.colaborador, solicitante);
  if (!ficha.ok) return ficha;
  const c = ficha.colaborador;

  const id = nuevoId('PAGOEQ');
  getSheet(H_PAGOS_EQUIPO).appendRow([id, d.desde, d.hasta, d.colaborador, num(d.base),
    num(d.ausencias), num(d.extras), num(d.anticipos), num(d.total), new Date()]);

  // Genera el gasto en Respuestas — mismo layout de columnas que registrarCompra() en
  // Registro.gs (ver nota de columnas en ese archivo). Categoría "Sueldos" ya existe en
  // Categorias, mapeada a "Gasto de personal" — estadoResultados() la toma sola.
  const fila = [
    new Date(), 'Compra', d.hasta, '', '', '', '', '', '', '', '',
    '', '', '', '', '', '',
    c.negocio, 'Sueldos', d.colaborador, '', '', num(d.total),
    'Sueldo ' + d.colaborador + ' · ' + d.desde + ' a ' + d.hasta, 'Pagado',
    '', '', '', '', '', '', 'Equipo', id, '', ''
  ];
  getSheet(H_RESPUESTAS).appendRow(fila);

  actualizarUltimaFechaPagada_(d.colaborador, d.hasta);
  return { ok: true, mensaje: 'Pago confirmado y registrado' };
}

function actualizarUltimaFechaPagada_(colaborador, hasta) {
  const sh = hojaColaboradores_();
  const datos = sh.getDataRange().getValues();
  for (let i = 1; i < datos.length; i++) {
    if (datos[i][0] !== colaborador) continue;
    sh.getRange(i + 1, 10).setValue(hasta);
    return;
  }
}

function obtenerHistorialPagos(colaborador, solicitante) {
  const err = requierePermisoEquipo_(solicitante); if (err) return err;
  const datos = getSheet(H_PAGOS_EQUIPO).getDataRange().getValues();
  const lista = [];
  for (let i = 1; i < datos.length; i++) {
    const f = datos[i];
    if (f[3] !== colaborador) continue;
    lista.push({ id: f[0], desde: f[1], hasta: f[2], base: num(f[4]), ausencias: num(f[5]),
      extras: num(f[6]), anticipos: num(f[7]), total: num(f[8]) });
  }
  return { ok: true, pagos: lista.reverse() };
}

// ============ VISTA DEL COLABORADOR (su propio pago) ============

function obtenerMiPago(solicitante) {
  if (!solicitante) return { ok: false, error: 'Sesión inválida' };
  const ficha = obtenerFichaColaborador(solicitante, solicitante);
  if (!ficha.ok) return { ok: false, error: 'No tienes una ficha de colaborador asociada' };
  const c = ficha.colaborador;
  const periodo = calcularPeriodoPendiente_(c);
  const historial = obtenerHistorialPagosPropio_(solicitante);
  return { ok: true, colaborador: { nombre: c.nombre, negocio: c.negocio, periodicidad: c.periodicidad, diasDePago: c.diasDePago },
    periodoActual: periodo, historial: historial };
}

function obtenerHistorialPagosPropio_(colaborador) {
  const datos = getSheet(H_PAGOS_EQUIPO).getDataRange().getValues();
  const lista = [];
  for (let i = 1; i < datos.length; i++) {
    const f = datos[i];
    if (f[3] !== colaborador) continue;
    lista.push({ desde: f[1], hasta: f[2], total: num(f[8]) });
  }
  return lista.reverse().slice(0, 6);
}

// ============ COMUNICADOS ============
// Reutiliza el sistema de notificaciones existente (crearNotificacion /
// obtenerNotificacionesActivas / marcarNotificacionVista, en Notificaciones.gs) — el
// frontend ya sabe pintar notif-card genéricas; solo se agrega un caso 'comunicado' en
// construirCuerpoNotificacion_ (js/conciliacion.js). No se guarda historial aparte: al
// marcarla vista, se archiva igual que cualquier otra notificación del sistema.

// d: {para: 'Todos' | nombre | [nombres], mensaje}
function enviarComunicadoEquipo(d, solicitante) {
  const err = requierePermisoEquipo_(solicitante); if (err) return err;
  if (!d.mensaje) return { ok: false, error: 'Falta el mensaje' };

  let destinatarios;
  if (d.para === 'Todos') {
    const datos = hojaColaboradores_().getDataRange().getValues();
    destinatarios = [];
    for (let i = 1; i < datos.length; i++) {
      if (datos[i][0] && datos[i][10] !== 'Inactivo') destinatarios.push(datos[i][0]);
    }
  } else {
    destinatarios = Array.isArray(d.para) ? d.para : [d.para];
  }
  if (!destinatarios.length) return { ok: false, error: 'No hay destinatarios' };

  const payload = JSON.stringify({ tipo: 'comunicado', de: solicitante, texto: d.mensaje });
  return crearNotificacion(destinatarios, payload, '');
}

// ============ SIEMBRA INICIAL (ejecutar UNA VEZ a mano desde el editor de Apps Script) ============
// NUEVO 28/07/2026 (con Osmar): carga las 4 fichas cuyos datos ya quedaron acordados en la
// sesión de diseño (Rocío queda pendiente — no se definieron su monto ni su jornada). No
// crea Usuarios ni Permisos: las 4 personas ya tienen acceso al sistema desde antes, esto
// solo llena Colaboradores. Es idempotente — si una fila ya existe, la salta en vez de
// duplicarla, así que no hay problema si se ejecuta más de una vez por error.
// Para correrla: abrir este archivo en el editor de Apps Script, elegir "sembrarEquipoInicial"
// en el selector de función (arriba, junto al botón Ejecutar) y presionar Ejecutar.
function sembrarEquipoInicial() {
  const datosIniciales = [
    { nombre: 'Lucas Ramos', telefono: '', responsabilidades: 'Staff fin de semana · Cima',
      negocio: 'Cima Eco-Granel', monto: 75000, periodicidad: 'Semanal', diasDePago: 'lunes',
      unidadDescuento: 'dia', jornada: [{ dias: ['Vie', 'Sáb', 'Dom'], horas: 8 }] },
    { nombre: 'Cecilia Yevenes', telefono: '', responsabilidades: 'Atención y venta a granel · Cima',
      negocio: 'Cima Eco-Granel', monto: 350000, periodicidad: 'Quincenal', diasDePago: '15 y 30',
      unidadDescuento: 'hora', jornada: [{ dias: ['Lun', 'Mar'], horas: 8 }, { dias: ['Mié', 'Jue'], horas: 5 }] },
    { nombre: 'Rosa Merino', telefono: '', responsabilidades: 'Producción · Vegan Corner',
      negocio: 'Vegan Corner', monto: 130000, periodicidad: 'Semanal', diasDePago: 'martes',
      unidadDescuento: 'dia', jornada: [{ dias: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie'], horas: 0 }] },
    { nombre: 'Katherine Bustamante', telefono: '', responsabilidades: 'Producción · Vegan Corner',
      negocio: 'Vegan Corner', monto: 100000, periodicidad: 'Semanal', diasDePago: 'viernes',
      unidadDescuento: 'dia', jornada: [{ dias: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie'], horas: 0 }] }
  ];

  const sh = hojaColaboradores_();
  const existentes = sh.getDataRange().getValues().slice(1).map(f => f[0]);
  const creados = [], saltados = [];
  datosIniciales.forEach(c => {
    if (existentes.indexOf(c.nombre) > -1) { saltados.push(c.nombre); return; }
    sh.appendRow([c.nombre, c.telefono, c.responsabilidades, c.negocio, c.monto, c.periodicidad,
      c.diasDePago, c.unidadDescuento, JSON.stringify(c.jornada), '', 'Activo']);
    creados.push(c.nombre);
  });
  Logger.log('Creados: ' + creados.join(', ') + ' | Ya existían (saltados): ' + saltados.join(', '));
  return { creados: creados, saltados: saltados };
}
