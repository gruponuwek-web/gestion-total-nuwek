// ============================================================
//  EVA+ Coach - tablas propias
//
//  Siguiendo el patron de Gestion Nuwek:
//    dbToApp...  fila de la base  -> objeto que usa el portal
//    appToDb...  objeto del portal -> fila para la base
//    dbLoad...   lee de Supabase
//
//  El portal trabaja en memoria y el motor de sincronizacion
//  (db-eva-sync.js) se encarga de mandar los cambios.
// ============================================================


// ------------------------------------------------------------
//  PROGRAMAS  (config de EVA+ sobre un proyecto vendido)
// ------------------------------------------------------------
function dbToAppPrograma(r){
  return {
    id: r.id,
    proyectoId: r.proyecto_id,
    clienteId: r.cliente_id,
    coachId: r.coach_id,
    color: r.color || '#2F6BFF',
    activo: r.activo !== false
  };
}
function appToDbPrograma(o){
  return {
    id: o.id,
    proyecto_id: o.proyectoId,
    cliente_id: o.clienteId,
    coach_id: o.coachId,
    color: o.color || '#2F6BFF',
    activo: o.activo !== false
  };
}


// ------------------------------------------------------------
//  VENDEDORES
// ------------------------------------------------------------
function dbToAppVendedor(r){
  return {
    id: r.id,
    clienteId: r.cliente_id,
    contactoId: r.contacto_id || null,
    nombre: r.nombre || '',
    apellidos: r.apellidos || '',
    rol: r.rol || '',
    sucursal: r.sucursal || '',
    nac: r.nacimiento || '',
    ingreso: r.ingreso || '',
    dias: Array.isArray(r.dias) ? r.dias : [1],
    horaSesion: (r.hora_sesion || '09:00').slice(0,5),
    activo: r.activo !== false
  };
}
function appToDbVendedor(o){
  return {
    id: o.id,
    cliente_id: o.clienteId,
    contacto_id: o.contactoId || null,
    nombre: o.nombre || '',
    apellidos: o.apellidos || '',
    rol: o.rol || '',
    sucursal: o.sucursal || '',
    nacimiento: o.nac || null,
    ingreso: o.ingreso || null,
    dias: (o.dias && o.dias.length) ? o.dias : [1],
    hora_sesion: o.horaSesion || '09:00',
    activo: o.activo !== false
  };
}


// ------------------------------------------------------------
//  METAS Y EVALUACIONES
// ------------------------------------------------------------
function dbToAppMeta(r){
  return {
    id: r.id,
    vendedorId: r.vendedor_id,
    periodoTipo: r.periodo_tipo || 'Mensual',
    periodo: r.periodo,
    tipo: r.tipo,
    meta: Number(r.meta) || 0,
    real: Number(r.real) || 0
  };
}
function appToDbMeta(o){
  return {
    id: o.id,
    vendedor_id: o.vendedorId,
    periodo_tipo: o.periodoTipo || 'Mensual',
    periodo: o.periodo,
    tipo: o.tipo,
    meta: o.meta || 0,
    real: o.real || 0
  };
}

function dbToAppEvaluacion(r){
  return { id:r.id, vendedorId:r.vendedor_id, tipo:r.tipo, fecha:r.fecha, puntaje:r.puntaje };
}
function appToDbEvaluacion(o){
  return { id:o.id, vendedor_id:o.vendedorId, tipo:o.tipo, fecha:o.fecha, puntaje:o.puntaje };
}


// ------------------------------------------------------------
//  TEMAS Y SUBTEMAS
//  En el portal los subtemas viven dentro del tema.
//  En la base son tabla aparte. Aqui se arma y se desarma.
// ------------------------------------------------------------
function dbToAppTema(r, subtemas){
  return {
    id: r.id,
    nombre: r.nombre || '',
    descripcion: r.descripcion || '',
    color: r.color || '#2F6BFF',
    cadencia: r.cadencia || 7,
    orden: r.orden || 0,
    subtemas: (subtemas || []).map(dbToAppSubtema)
  };
}
function appToDbTema(o){
  return {
    id: o.id,
    nombre: o.nombre || '',
    descripcion: o.descripcion || '',
    color: o.color || '#2F6BFF',
    cadencia: o.cadencia || 7,
    orden: o.orden || 0
  };
}
function dbToAppSubtema(r){
  return {
    id: r.id,
    temaId: r.tema_id,
    n: r.nombre || '',
    orden: r.orden || 0,
    durProg: r.dur_prog || null,
    formato: r.formato || '',
    tareaDesc: r.tarea_desc || '',
    artefacto: r.artefacto || '',
    nEntregas: r.n_entregas || null,
    diasLimite: r.dias_limite || 7
  };
}
function appToDbSubtema(o, temaId, orden){
  return {
    id: o.id,
    tema_id: temaId,
    nombre: o.n || '',
    orden: orden,
    dur_prog: o.durProg || null,
    formato: o.formato || null,
    tarea_desc: o.tareaDesc || '',
    artefacto: o.artefacto || null,
    n_entregas: o.nEntregas || null,
    dias_limite: o.diasLimite || 7
  };
}


// ------------------------------------------------------------
//  CAPACITACIONES, TAREAS Y ASISTENCIAS
// ------------------------------------------------------------
function dbToAppCapacitacion(r){
  return {
    id: r.id,
    programaId: r.programa_id,
    clienteId: r.cliente_id,
    temaId: r.tema_id,
    subtema: r.subtema || '',
    nSesion: r.n_sesion || 1,
    fecha: r.fecha,
    hora: (r.hora || '10:00').slice(0,5),
    durProg: r.dur_prog || 90,
    durReal: r.dur_real,
    formato: r.formato || 'En linea',
    capacitadorId: r.capacitador_id,
    alcances: r.alcances || '',
    estatus: r.estatus || 'programada'
  };
}
function appToDbCapacitacion(o){
  return {
    id: o.id,
    programa_id: o.programaId,
    cliente_id: o.clienteId,
    tema_id: o.temaId || null,
    subtema: o.subtema || '',
    n_sesion: o.nSesion || 1,
    fecha: o.fecha,
    hora: o.hora || '10:00',
    dur_prog: o.durProg || 90,
    dur_real: o.durReal,
    formato: o.formato || 'En linea',
    capacitador_id: o.capacitadorId || null,
    alcances: o.alcances || '',
    estatus: o.estatus || 'programada'
  };
}

function dbToAppTarea(r){
  return {
    id: r.id,
    capacitacionId: r.capacitacion_id,
    descripcion: r.descripcion || '',
    artefacto: r.artefacto || '',
    nEntregas: r.n_entregas || 3,
    diasLimite: r.dias_limite || 7,
    fechaLimite: r.fecha_limite
  };
}
function appToDbTarea(o){
  return {
    id: o.id,
    capacitacion_id: o.capacitacionId,
    descripcion: o.descripcion || '',
    artefacto: o.artefacto || null,
    n_entregas: o.nEntregas || 3,
    dias_limite: o.diasLimite || 7,
    fecha_limite: o.fechaLimite || null
  };
}

function dbToAppAsistencia(r){
  return {
    id: r.id,
    capacitacionId: r.capacitacion_id,
    vendedorId: r.vendedor_id,
    asistio: r.asistio === true,
    razon: r.razon || '',
    participacion: r.participacion || 0
  };
}
function appToDbAsistencia(o){
  return {
    id: o.id,
    capacitacion_id: o.capacitacionId,
    vendedor_id: o.vendedorId,
    asistio: o.asistio === true,
    razon: o.razon || '',
    participacion: o.participacion || 0
  };
}


// ------------------------------------------------------------
//  SESIONES DE COACHEO  (la tabla central)
// ------------------------------------------------------------
function dbToAppSesion(r){
  return {
    id: r.id,
    programaId: r.programa_id,
    clienteId: r.cliente_id,
    vendedorId: r.vendedor_id,
    coachId: r.coach_id,
    capacitacionId: r.capacitacion_id,
    nSesion: r.n_sesion || 1,
    anclada: r.anclada !== false,
    motivoCambio: r.motivo_cambio || '',
    fechaProg: r.fecha_prog,
    horaProg: (r.hora_prog || '09:00').slice(0,5),
    durProg: r.dur_prog || 30,
    estatus: r.estatus || 'programada',
    motivoNoRealizada: r.motivo_no_realizada || '',
    horaIni: r.hora_ini ? r.hora_ini.slice(0,5) : '',
    horaFin: r.hora_fin ? r.hora_fin.slice(0,5) : '',
    mjs: r.mjs,
    llamadas: r.llamadas,
    crmEstatus: r.crm_estatus || '',
    crmShot: r.crm_shot_path || '',
    crmNota: r.crm_nota || '',
    descubrimientos: r.descubrimientos || '',
    retro: r.retro || '',
    obstaculos: r.obstaculos || '',
    minutaUrl: r.minuta_url || '',
    notas: r.notas || '',
    capturadaEl: r.capturada_en || ''
  };
}
function appToDbSesion(o){
  return {
    id: o.id,
    programa_id: o.programaId,
    cliente_id: o.clienteId,
    vendedor_id: o.vendedorId,
    coach_id: o.coachId,
    capacitacion_id: o.capacitacionId || null,
    n_sesion: o.nSesion || 1,
    anclada: o.anclada !== false,
    motivo_cambio: o.motivoCambio || '',
    fecha_prog: o.fechaProg,
    hora_prog: o.horaProg || '09:00',
    dur_prog: o.durProg || 30,
    estatus: o.estatus || 'programada',
    motivo_no_realizada: o.motivoNoRealizada || '',
    hora_ini: o.horaIni || null,
    hora_fin: o.horaFin || null,
    mjs: (o.mjs === '' || o.mjs === undefined) ? null : o.mjs,
    llamadas: (o.llamadas === '' || o.llamadas === undefined) ? null : o.llamadas,
    crm_estatus: o.crmEstatus || null,
    crm_shot_path: o.crmShot || null,
    crm_nota: o.crmNota || '',
    descubrimientos: o.descubrimientos || '',
    retro: o.retro || '',
    obstaculos: o.obstaculos || '',
    minuta_url: o.minutaUrl || '',
    notas: o.notas || '',
    capturada_en: o.capturadaEl || null
  };
}

function dbToAppEntrega(r){
  return {
    id: r.id,
    tareaId: r.tarea_id,
    vendedorId: r.vendedor_id,
    n: r.n,
    fecha: r.fecha,
    link: r.link || '',
    validada: r.validada !== false
  };
}
function appToDbEntrega(o){
  return {
    id: o.id,
    tarea_id: o.tareaId,
    vendedor_id: o.vendedorId,
    n: o.n,
    fecha: o.fecha,
    link: o.link || '',
    validada: o.validada !== false
  };
}


// ------------------------------------------------------------
//  COMPROMISOS
// ------------------------------------------------------------
function dbToAppCompromiso(r){
  return {
    id: r.id,
    sesionId: r.sesion_id,
    vendedorId: r.vendedor_id,
    clienteId: r.cliente_id,
    tipo: r.tipo || 'llamada',
    descripcion: r.descripcion || '',
    fecha: r.fecha,
    meta: r.meta,
    avance: r.avance || 0,
    pctManual: r.pct_manual,
    estatus: r.estatus || 'pendiente',
    coachSeguimiento: r.coach_seguimiento,
    fechaSeguimiento: r.fecha_seguimiento || '',
    fechaCumplido: r.fecha_cumplido || '',
    motivoDesv: r.motivo_desv || '',
    animo: r.animo,
    notaCierre: r.nota_cierre || '',
    sesionCierreId: r.sesion_cierre_id
  };
}
function appToDbCompromiso(o){
  return {
    id: o.id,
    sesion_id: o.sesionId,
    vendedor_id: o.vendedorId,
    cliente_id: o.clienteId,
    tipo: o.tipo || 'llamada',
    descripcion: o.descripcion || '',
    fecha: o.fecha,
    meta: (o.meta === '' || o.meta === undefined) ? null : o.meta,
    avance: o.avance || 0,
    pct_manual: (o.pctManual === '' || o.pctManual === undefined) ? null : o.pctManual,
    estatus: o.estatus || 'pendiente',
    coach_seguimiento: (o.coachSeguimiento === undefined) ? null : o.coachSeguimiento,
    fecha_seguimiento: o.fechaSeguimiento || null,
    fecha_cumplido: o.fechaCumplido || null,
    motivo_desv: o.motivoDesv || '',
    animo: (o.animo === '' || o.animo === undefined) ? null : o.animo,
    nota_cierre: o.notaCierre || '',
    sesion_cierre_id: o.sesionCierreId || null
  };
}


// ------------------------------------------------------------
//  BLOQUEOS DE AGENDA
// ------------------------------------------------------------
function dbToAppBloqueo(r){
  return {
    id: r.id,
    personaId: r.persona_id,
    desde: r.desde,
    hasta: r.hasta,
    todoElDia: r.todo_el_dia !== false,
    horaIni: r.hora_ini ? r.hora_ini.slice(0,5) : '',
    horaFin: r.hora_fin ? r.hora_fin.slice(0,5) : '',
    tipo: r.tipo || 'personal',
    titulo: r.titulo || '',
    notas: r.notas || ''
  };
}
function appToDbBloqueo(o){
  return {
    id: o.id,
    persona_id: o.personaId,
    desde: o.desde,
    hasta: o.hasta || o.desde,
    todo_el_dia: o.todoElDia !== false,
    hora_ini: o.todoElDia ? null : (o.horaIni || null),
    hora_fin: o.todoElDia ? null : (o.horaFin || null),
    tipo: o.tipo || 'personal',
    titulo: o.titulo || '',
    notas: o.notas || ''
  };
}


// ============================================================
//  CARGA COMPLETA
//  Trae todo de un jalon al abrir el portal.
// ============================================================
async function dbLoadTodoEva(){
  const t0 = Date.now();

  // Se piden todas al mismo tiempo para que no se hagan bola
  const [
    programas, vendedores, metas, evaluaciones,
    temas, subtemas, artefactos,
    capacitaciones, tareas, asistencias,
    sesiones, entregas, compromisos, bloqueos,
    clientesDisp, personal
  ] = await Promise.all([
    sb.from('eva_programas').select('*'),
    sb.from('eva_vendedores').select('*').order('nombre'),
    sb.from('eva_metas').select('*'),
    sb.from('eva_evaluaciones').select('*').order('fecha'),
    sb.from('eva_temas').select('*').order('orden'),
    sb.from('eva_subtemas').select('*').order('orden'),
    sb.from('eva_artefactos').select('*').order('nombre'),
    sb.from('eva_capacitaciones').select('*').order('fecha'),
    sb.from('eva_tareas').select('*'),
    sb.from('eva_asistencias').select('*'),
    sb.from('eva_sesiones').select('*').order('fecha_prog'),
    sb.from('eva_entregas').select('*'),
    sb.from('eva_compromisos').select('*').order('fecha'),
    sb.from('eva_bloqueos').select('*').order('desde'),
    dbLoadClientesDisponibles(),
    dbLoadPersonalNuwek()
  ]);

  // Si alguna fallo, avisamos con nombre y todo
  const fallas = [];
  [['programas',programas],['vendedores',vendedores],['metas',metas],
   ['evaluaciones',evaluaciones],['temas',temas],['subtemas',subtemas],
   ['artefactos',artefactos],['capacitaciones',capacitaciones],['tareas',tareas],
   ['asistencias',asistencias],['sesiones',sesiones],['entregas',entregas],
   ['compromisos',compromisos],['bloqueos',bloqueos]
  ].forEach(function(par){
    if (par[1] && par[1].error) fallas.push(par[0] + ': ' + par[1].error.message);
  });
  if (fallas.length) throw new Error('No se pudo leer:\n' + fallas.join('\n'));

  // Los subtemas se acomodan dentro de su tema
  const porTema = {};
  (subtemas.data || []).forEach(function(s){
    (porTema[s.tema_id] = porTema[s.tema_id] || []).push(s);
  });

  const datos = {
    programas:      (programas.data || []).map(dbToAppPrograma),
    vendedores:     (vendedores.data || []).map(dbToAppVendedor),
    metas:          (metas.data || []).map(dbToAppMeta),
    evaluaciones:   (evaluaciones.data || []).map(dbToAppEvaluacion),
    temas:          (temas.data || []).map(function(t){ return dbToAppTema(t, porTema[t.id]); }),
    artefactos:     (artefactos.data || []).map(function(a){ return a.nombre; }),
    capacitaciones: (capacitaciones.data || []).map(dbToAppCapacitacion),
    tareas:         (tareas.data || []).map(dbToAppTarea),
    asistencias:    (asistencias.data || []).map(dbToAppAsistencia),
    sesiones:       (sesiones.data || []).map(dbToAppSesion),
    entregas:       (entregas.data || []).map(dbToAppEntrega),
    compromisos:    (compromisos.data || []).map(dbToAppCompromiso),
    bloqueos:       (bloqueos.data || []).map(dbToAppBloqueo),
    // lo que viene del core (solo lectura)
    clientesDisponibles: clientesDisp,
    personal: personal
  };

  console.log('Datos de EVA+ cargados en ' + (Date.now()-t0) + ' ms', {
    programas: datos.programas.length,
    vendedores: datos.vendedores.length,
    temas: datos.temas.length,
    sesiones: datos.sesiones.length,
    compromisos: datos.compromisos.length
  });

  return datos;
}
