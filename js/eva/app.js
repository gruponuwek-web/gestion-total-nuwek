/* ============================================================
   EVA+ COACH · Portal de seguimiento de coaching de ventas
   Grupo Nuwek · conectado a Supabase
   ============================================================ */
var DB = null;
var CARGANDO = true;
var ERROR_CARGA = '';
var UI = { vista:'hoy', cliente:'*', user:'p1', semana:0, mes:0, tab:{}, sesionAbierta:null, vendedorAbierto:null, compAbierto:null, verCerrados:false };

/* ---------- utilidades de fecha ---------- */
var DIAS = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
var DIAS3 = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
var MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
var MESES3 = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

function pad(n){ return (n<10?'0':'')+n; }
function hoyISO(){ var d=new Date(); return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()); }
function dISO(d){ return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()); }
function parseISO(s){ if(!s) return null; var p=String(s).split('-'); return new Date(+p[0], +p[1]-1, +p[2]); }
function masDias(n){ var d=new Date(); d.setDate(d.getDate()+n); return dISO(d); }
function fmtFecha(s){ var d=parseISO(s); if(!d) return '—'; return DIAS3[d.getDay()]+' '+d.getDate()+' '+MESES3[d.getMonth()]; }
function fmtLargo(s){ var d=parseISO(s); if(!d) return '—'; return DIAS[d.getDay()]+' '+d.getDate()+' de '+MESES[d.getMonth()]+' de '+d.getFullYear(); }
function difDias(a,b){ var x=parseISO(a), y=parseISO(b); if(!x||!y) return 0; return Math.round((x-y)/86400000); }
function min2hhmm(m){ if(m==null) return '—'; var h=Math.floor(m/60), r=m%60; return h>0?(h+'h '+pad(r)):(r+' min'); }
function hhmm2min(h){ if(!h) return null; var p=h.split(':'); return (+p[0])*60+(+p[1]); }
function lunesDe(off){
  var d=new Date(); var dow=d.getDay(); var delta=(dow===0?-6:1-dow);
  d.setDate(d.getDate()+delta+(off*7)); return d;
}
/* Los ids los genera el navegador con el mismo formato que usa
   Postgres. Nada de Date.now(): con eso se duplicaban registros
   cuando se creaban varios en el mismo instante. */
function uid(){
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c){
    var r = Math.random()*16|0, v = (c==='x') ? r : ((r&0x3)|0x8);
    return v.toString(16);
  });
}
function esc(s){ if(s==null) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function pct(a,b){ if(!b) return 0; return Math.round(a/b*100); }
function ini(nm){ var p=String(nm||'').trim().split(/\s+/); return ((p[0]||'')[0]||'')+((p[1]||'')[0]||''); }
function num(n){ return String(n).replace(/\B(?=(\d{3})+(?!\d))/g,','); }

/* ============================================================
   PERSISTENCIA · Supabase
   El portal trabaja en memoria y el motor de sincronizacion
   (db-eva-sync.js) manda los cambios en segundo plano.
   ============================================================ */

/* Se llama en ~60 lugares del portal. Antes escribia en el
   navegador; ahora avisa al motor y este decide cuando mandar. */
function guardar(){
  if (typeof EvaSync !== 'undefined' && DB) EvaSync.marcarCambio(DB);
}

/* Trae todo de Supabase al abrir el portal. */
async function cargar(){
  CARGANDO = true; ERROR_CARGA = '';
  try{
    var d = await dbLoadTodoEva();

    DB = {
      /* tablas propias de EVA+ */
      programas:      d.programas,
      vendedores:     d.vendedores,
      metas:          d.metas,
      evaluaciones:   d.evaluaciones,
      temas:          d.temas,
      artefactos:     d.artefactos,
      capacitaciones: d.capacitaciones,
      tareas:         d.tareas,
      asistencias:    d.asistencias,
      sesiones:       d.sesiones,
      entregas:       d.entregas,
      compromisos:    d.compromisos,
      bloqueos:       d.bloqueos,

      /* de Gestion Nuwek: solo lectura, no se sincronizan */
      disponibles:    d.clientesDisponibles,
      personal:       d.personal
    };

    /* "clientes" en el portal = los programas ya configurados */
    DB.clientes = DB.programas;

    if (typeof EvaSync !== 'undefined') EvaSync.iniciar(DB);
    CARGANDO = false;
    return DB;

  }catch(e){
    CARGANDO = false;
    ERROR_CARGA = e.message || 'No se pudo conectar con la base de datos';
    console.error('Error al cargar EVA+:', e);
    throw e;
  }
}

/* Vuelve a traer todo (por si alguien mas movio algo) */
async function recargar(){
  await cargar();
  if (typeof render === 'function') render();
}


/* ============================================================
   EL CORE DE NUWEK
   Clientes con proyecto vendido, personal, contactos.
   EVA+ los lee, nunca los escribe.
   ============================================================ */

/* Cliente de Nuwek con proyecto de capacitacion activo */
function disp(clienteId){
  return (DB.disponibles || []).filter(function(x){ return x.clienteId===clienteId; })[0] || null;
}
/* Los que todavia no tienen programa configurado en EVA+ */
function dispPendientes(){
  var ids = (DB.programas||[]).map(function(p){ return p.clienteId; });
  return (DB.disponibles || []).filter(function(x){ return ids.indexOf(x.clienteId) < 0; });
}
/* Config de EVA+ para ese cliente */
function evaCfg(clienteId){
  return (DB.programas || []).filter(function(p){ return p.clienteId===clienteId; })[0] || null;
}

/* cli(clienteId): junta el nombre que viene de Nuwek con la
   configuracion de EVA+. Todo el portal usa esto. */
function cli(id){
  var cfg = evaCfg(id);
  var cr  = disp(id);
  if(!cfg && !cr) return {id:id, nombre:'—', color:'#8A99AB', plan:'', inicio:'', coachId:''};
  return {
    id:         id,
    programaId: cfg ? cfg.id : null,
    proyectoId: cr ? cr.proyectoId : (cfg ? cfg.proyectoId : null),
    nombre:     cr ? cr.cliente : '—',
    plan:       cr ? cr.servicio : '',
    proyecto:   cr ? cr.proyecto : '',
    inicio:     cr ? cr.inicio : '',
    fin:        cr ? cr.fin : '',
    precio:     cr ? cr.precio : 0,
    coachId:    cfg ? cfg.coachId : '',
    color:      cfg ? cfg.color : '#8A99AB'
  };
}
/* id del programa de ese cliente (obligatorio al crear registros) */
function progId(clienteId){
  var c = evaCfg(clienteId);
  return c ? c.id : null;
}

/* Empresas activas en EVA+, ya combinadas */
function clientesEva(){
  return (DB.programas || []).map(function(p){ return cli(p.clienteId); });
}

/* ---------- catálogos base ---------- */
var FORMATOS = ['Presencial','En línea','Híbrido'];
var PIPE_ESTATUS = [
  {v:'completo', l:'Completo', c:'v', pct:100},
  {v:'casi', l:'Casi completo', c:'a', pct:75},
  {v:'incompleto', l:'Incompleto', c:'r', pct:40},
  {v:'olvidado', l:'Olvidado', c:'r', pct:0}
];
var TIPOS_COMPROMISO = [
  {v:'llamada', l:'Llamada a prospecto', ic:'📞', unidad:'llamadas'},
  {v:'mensaje', l:'Mensajes con técnica', ic:'💬', unidad:'mensajes'},
  {v:'pipeline', l:'Actualizar pipeline', ic:'📊', unidad:'registros'},
  {v:'tecnica', l:'Aplicar técnica', ic:'🎯', unidad:'veces'},
  {v:'tarea', l:'Tarea extra', ic:'📝', unidad:'entregas'}
];

/* ánimo del vendedor: va aparte del avance, no se mezclan */
var ANIMOS = [
  {v:1, ic:'😞', l:'Muy abajo'},
  {v:2, ic:'😕', l:'Desanimado'},
  {v:3, ic:'😐', l:'Neutral'},
  {v:4, ic:'🙂', l:'Bien'},
  {v:5, ic:'😄', l:'Muy arriba'}
];
function animo(v){ return ANIMOS.filter(function(a){return a.v===v;})[0] || null; }

/* cuando la sesión de plano no ocurrió */
var MOTIVOS_NO_REALIZADA = [
  'No hubo hueco en el calendario',
  'El vendedor no se conectó',
  'El vendedor no entregó la tarea',
  'Se canceló la capacitación',
  'Incapacidad o enfermedad',
  'Vacaciones o puente',
  'El cliente pidió pausar',
  'Yo no pude',
  'Otro'
];

/* por qué se movió una sesión de su fecha automática */
var MOTIVOS_REAGENDA = [
  'El vendedor no pudo',
  'Yo no pude',
  'El vendedor estaba con un cliente',
  'Incapacidad o enfermedad',
  'Viaje o visita foránea',
  'Junta interna del cliente',
  'Le acomoda mejor este día',
  'Otro'
];

/* por qué se salió de fecha */
var MOTIVOS_DESV = [
  'El coach no alcanzó a revisarlo',
  'El vendedor estaba con un cliente',
  'Al vendedor se le olvidó',
  'Incapacidad o enfermedad',
  'Se reprogramó la sesión',
  'Cierre de mes / carga operativa',
  'Otro'
];
var TIPOS_META = [
  {v:'ventas', l:'Ventas', u:'$'},
  {v:'clientes', l:'Clientes nuevos', u:'#'},
  {v:'crecimiento', l:'Crecimiento', u:'#'},
  {v:'recuperacion', l:'Recuperación', u:'#'},
  {v:'rentabilidad', l:'Rentabilidad', u:'%'}
];
var PERIODOS_TIPO = ['Mensual','Bimestral','Trimestral','Semestral','Anual'];

/* ============================================================
   SEMILLA DE DEMO
   ============================================================ */
/* ============================================================
   HELPERS DE CATALOGO
   ============================================================ */
var PALETA_TEMA = ['#2F6BFF','#1FA971','#B98200','#7A4BD6','#0E8A9E','#D9469B','#E5484D','#3D5B7D'];

function nuevoSubtema(nombre){
  return { id:uid(), n:nombre, durProg:90, formato:'En línea', tareaDesc:'', artefacto:'', nEntregas:3, diasLimite:7 };
}
/* nombre del subtema */
function subN(s){ return (typeof s==='string') ? s : (s && s.n) || ''; }
/* ya tiene lo necesario para agendarse solo? */
function subDetallado(s){
  if(typeof s==='string') return false;
  return !!(s && s.tareaDesc && String(s.tareaDesc).trim() && s.artefacto && s.durProg && s.nEntregas);
}
function subsDe(tid){ return (tem(tid).subtemas||[]).map(subN); }

/* tipos de bloqueo de agenda */
var TIPOS_BLOQUEO = [
  {v:'personal', l:'Personal', ic:'🔒'},
  {v:'vacaciones', l:'Vacaciones', ic:'🌴'},
  {v:'viaje', l:'Viaje o foráneo', ic:'✈️'},
  {v:'interno', l:'Junta interna', ic:'👥'},
  {v:'otro', l:'Otro', ic:'⬛'}
];
function tipoBloqueo(v){ return TIPOS_BLOQUEO.filter(function(t){return t.v===v;})[0] || TIPOS_BLOQUEO[0]; }

/* ---------- accesores ---------- */
function ven(id){ return DB.vendedores.filter(function(v){return v.id===id;})[0] || {nombre:'—',apellidos:''}; }
function per(id){ return (DB.personal||[]).filter(function(p){return p.id===id;})[0] || {id:id, nombre:'—', rol:''}; }
function tem(id){ return DB.temas.filter(function(t){return t.id===id;})[0] || {nombre:'—',subtemas:[]}; }
function capa(id){ return DB.capacitaciones.filter(function(c){return c.id===id;})[0] || null; }
function nomV(id){ var v=ven(id); return v.nombre+' '+v.apellidos; }
function tareaDe(capId){ return DB.tareas.filter(function(t){return t.capacitacionId===capId;})[0] || null; }

/* filtro global por cliente */
function fc(arr){
  if(UI.cliente==='*') return arr;
  return arr.filter(function(x){ return x.clienteId===UI.cliente; });
}
function esSupervisor(){ return per(UI.user).rol==='Supervisor'; }
/* ============================================================
   REGLAS DE NEGOCIO
   ============================================================ */

/* --- Candado del 50%: se evalúa 2 horas antes de la sesión --- */
function evaluarCandado(s){
  var tarea = tareaDe(s.capacitacionId);
  var req = tarea ? tarea.nEntregas : 0;
  var ent = tarea ? DB.entregas.filter(function(e){ return e.tareaId===tarea.id && e.vendedorId===s.vendedorId; }).length : 0;
  var porc = req ? Math.round(ent/req*100) : 100;
  var evid = (s.mjs||0) + (s.llamadas||0);

  /* ¿ya estamos dentro de la ventana de 2 h? */
  var ahora = new Date();
  var fs = parseISO(s.fechaProg);
  var mm = hhmm2min(s.horaProg) || 0;
  if(fs) fs.setMinutes(mm);
  var minsFalta = fs ? Math.round((fs - ahora)/60000) : 0;
  var enVentana = minsFalta <= 120;

  var elegible = porc >= 50;
  return {
    tarea:tarea, req:req, entregadas:ent, porc:porc, evidencias:evid,
    elegible:elegible, enVentana:enVentana, minsFalta:minsFalta,
    corte: fs ? (pad(Math.floor((mm-120+1440)%1440/60))+':'+pad((mm-120+1440)%1440%60)) : '—'
  };
}

/* --- Semáforo de entregas --- */
function semEntregas(ent, req){
  if(!req) return 'n';
  var p = ent/req;
  if(p>=1) return 'v';
  if(p>=0.5) return 'a';
  return 'r';
}

/* --- Gap de tiempo de una sesión --- */
function gapSesion(s){
  var ini = hhmm2min(s.horaIni), fin = hhmm2min(s.horaFin);
  if(ini==null || fin==null) return null;
  var real = fin - ini; if(real<0) real += 1440;
  return { real:real, prog:s.durProg||0, gap: real - (s.durProg||0) };
}

/* --- Calificación de la sesión para el coach (0-100) ---
   Se compone de 4 criterios verificables por el portal. --- */
function calificaSesion(s){
  if(s.estatus!=='realizada') return null;
  var pts = 0, det = [];
  /* 1. Minuta en Notion (30) */
  var m = !!(s.minutaUrl||'').trim();
  pts += m?30:0; det.push({l:'Minuta en Notion', ok:m, p:30});
  /* 2. Anotó tema base + retro aterrizada (25) */
  var r = !!(s.retro||'').trim() && !!s.capacitacionId;
  pts += r?25:0; det.push({l:'Retro ligada a un tema ya capacitado', ok:r, p:25});
  /* 3. Descubrimientos capturados (20) */
  var d = ((s.descubrimientos||'').trim().length > 25);
  pts += d?20:0; det.push({l:'Descubrimientos del vendedor', ok:d, p:20});
  /* 4. Dejó al menos un compromiso con fecha (25) */
  var cs = DB.compromisos.filter(function(c){return c.sesionId===s.id;});
  var c1 = cs.length>0 && cs.every(function(c){return !!c.fecha;});
  pts += c1?25:0; det.push({l:'Compromisos con fecha', ok:c1, p:25});
  return { total:pts, det:det };
}

/* --- Compromisos: estatus visual --- */
var COMP_EST = {
  pendiente:{l:'Pendiente', c:'n'},
  cumplido:{l:'Cumplido', c:'v'},
  parcial:{l:'Parcial', c:'a'},
  no_cumplido:{l:'No cumplido', c:'r'}
};
function compVencido(c){
  return c.estatus==='pendiente' && difDias(c.fecha, hoyISO()) < 0;
}

/* --- % de avance ---
   Si el compromiso tiene meta contable, el número sale de ahí (objetivo).
   Si no, se captura a mano. Nunca de la percepción del coach cuando hay
   forma de contarlo. --- */
function compPct(c){
  if(c.meta && c.meta>0) return Math.min(100, Math.round((c.avance||0)/c.meta*100));
  if(c.pctManual!=null) return c.pctManual;
  if(c.estatus==='cumplido') return 100;
  if(c.estatus==='parcial') return 50;
  if(c.estatus==='no_cumplido') return 0;
  return 0;
}
function compAuto(c){ return !!(c.meta && c.meta>0); }
/* semáforo del avance */
function compSem(p){ return p>=90?'v':(p>=50?'a':'r'); }
/* estatus que se deduce del avance cuando es contable */
function estatusPorAvance(p){
  if(p>=100) return 'cumplido';
  if(p>0) return 'parcial';
  return 'no_cumplido';
}

/* --- Desviación: días entre la fecha compromiso y lo que realmente pasó --- */
function compDesviacion(c){
  var ref = c.fechaCumplido || c.fechaSeguimiento;
  if(!ref || !c.fecha) return null;
  return difDias(ref, c.fecha); /* + = tarde, - = antes, 0 = en fecha */
}
function textoDesviacion(d){
  if(d===null) return '';
  if(d===0) return 'En fecha';
  if(d>0) return d+' día'+(d>1?'s':'')+' tarde';
  return Math.abs(d)+' día'+(Math.abs(d)>1?'s':'')+' antes';
}
function claseDesviacion(d){
  if(d===null) return 'n';
  if(d<=0) return 'v';
  if(d<=2) return 'a';
  return 'r';
}
/* --- Compromisos que vencen pronto (el "recordatorio") --- */
function compPorVencer(dias){
  var lim = masDias(dias||3);
  return fc(DB.compromisos).filter(function(c){
    return c.estatus==='pendiente' && c.fecha>=hoyISO() && c.fecha<=lim;
  }).sort(function(a,b){ return a.fecha<b.fecha?-1:1; });
}

/* --- Métricas del coach --- */
function metricasCoach(desdeDias){
  var lim = masDias(-(desdeDias||30));
  var ses = fc(DB.sesiones).filter(function(s){ return s.fechaProg>=lim && s.fechaProg<=hoyISO(); });
  var real = ses.filter(function(s){return s.estatus==='realizada';});
  var canc = ses.filter(noRealizada);
  var motivosNR = {};
  fc(DB.sesiones).forEach(function(s){ if(noRealizada(s) && s.motivoNoRealizada) motivosNR[s.motivoNoRealizada]=(motivosNR[s.motivoNoRealizada]||0)+1; });
  var enConflicto = fc(DB.sesiones).filter(sesionEnConflicto).length;
  var minProg=0, minReal=0, conGap=0;
  real.forEach(function(s){ var g=gapSesion(s); if(g){ minProg+=g.prog; minReal+=g.real; conGap++; } });
  var conMin = real.filter(function(s){ return !!(s.minutaUrl||'').trim(); }).length;
  var reagendadas = ses.filter(function(s){ return !!s.motivoCambio; });
  var motivos = {};
  fc(DB.sesiones).forEach(function(s){ if(s.motivoCambio) motivos[s.motivoCambio]=(motivos[s.motivoCambio]||0)+1; });
  var califs = real.map(function(s){ var q=calificaSesion(s); return q?q.total:0; });
  var prom = califs.length ? Math.round(califs.reduce(function(a,b){return a+b;},0)/califs.length) : 0;
  var lag = real.filter(function(s){return s.capturadaEl;}).map(function(s){ return Math.max(0, difDias(s.capturadaEl, s.fechaProg)); });
  var lagProm = lag.length ? (lag.reduce(function(a,b){return a+b;},0)/lag.length).toFixed(1) : '0';

  var comps = fc(DB.compromisos).filter(function(c){ return c.fecha>=lim; });
  var cerrados = comps.filter(function(c){ return c.estatus!=='pendiente'; });
  var seguidos = comps.filter(function(c){ return c.coachSeguimiento===true; });
  var cumplidos = cerrados.filter(function(c){ return c.estatus==='cumplido'; });
  var avgAvance = cerrados.length ? Math.round(cerrados.reduce(function(a,c){return a+compPct(c);},0)/cerrados.length) : 0;
  var desvs = comps.map(compDesviacion).filter(function(d){ return d!==null; });
  var tarde = desvs.filter(function(d){ return d>0; });
  var desvProm = tarde.length ? (tarde.reduce(function(a,b){return a+b;},0)/tarde.length).toFixed(1) : '0';
  var conMotivo = comps.filter(function(c){ var d=compDesviacion(c); return d!==null && d>0 && !!c.motivoDesv; }).length;
  var animos = comps.filter(function(c){ return c.animo; });
  var animoProm = animos.length ? (animos.reduce(function(a,c){return a+c.animo;},0)/animos.length) : 0;

  var vendTot = fc(DB.vendedores).filter(function(v){return v.activo;}).length;
  var vendAtn = {}; real.forEach(function(s){ vendAtn[s.vendedorId]=1; });

  return {
    programadas:ses.length, realizadas:real.length, canceladas:canc.length,
    motivosNR:motivosNR, enConflicto:enConflicto,
    minProg:minProg, minReal:minReal, gap:minReal-minProg, conGap:conGap,
    gapProm: conGap ? Math.round((minReal-minProg)/conGap) : 0,
    minutas:conMin, pctMinutas: pct(conMin, real.length),
    reagendadas:reagendadas.length, pctReagenda:pct(reagendadas.length, ses.length), motivos:motivos,
    calidad:prom, lagProm:lagProm,
    compTot:comps.length, compCerrados:cerrados.length, pctCierre:pct(cerrados.length, comps.length),
    compSeguidos:seguidos.length, pctSeguimiento:pct(seguidos.length, comps.length),
    compCumplidos:cumplidos.length, pctCumplimiento:pct(cumplidos.length, cerrados.length),
    avgAvance:avgAvance, desvProm:desvProm, tarde:tarde.length, conMotivo:conMotivo,
    pctMotivo:pct(conMotivo, tarde.length), animoProm:animoProm,
    vendTot:vendTot, vendAtn:Object.keys(vendAtn).length, cobertura:pct(Object.keys(vendAtn).length, vendTot)
  };
}

/* --- Tiempo invertido por empresa --- */
function tiempoPorEmpresa(desdeDias){
  var lim = masDias(-(desdeDias||30));
  return clientesEva().map(function(c){
    var ses = DB.sesiones.filter(function(s){ return s.clienteId===c.id && s.estatus==='realizada' && s.fechaProg>=lim; });
    var prog=0, real=0;
    ses.forEach(function(s){ var g=gapSesion(s); if(g){ prog+=g.prog; real+=g.real; } });
    var caps = DB.capacitaciones.filter(function(k){ return k.clienteId===c.id && k.estatus==='realizada' && k.fecha>=lim; });
    var capProg=0, capReal=0;
    caps.forEach(function(k){ capProg+=(k.durProg||0); capReal+=(k.durReal||k.durProg||0); });
    return { cliente:c, sesiones:ses.length, prog:prog, real:real, gap:real-prog,
             gapProm: ses.length? Math.round((real-prog)/ses.length):0,
             caps:caps.length, capProg:capProg, capReal:capReal,
             totalReal: real+capReal };
  }).filter(function(r){ return UI.cliente==='*' || r.cliente.id===UI.cliente; });
}

/* ============================================================
   COACHEO ANCLADO A SU CAPACITACIÓN
   Regla: la sesión 1 a 1 debe caber ANTES de la siguiente capacitación.
   Si no, el vendedor llega a la sesión 2 sin haber revisado la tarea de la 1.
   ============================================================ */
var DIAS_LAB = [
  {v:1, l:'Lunes', c:'Lun'},
  {v:2, l:'Martes', c:'Mar'},
  {v:3, l:'Miércoles', c:'Mié'},
  {v:4, l:'Jueves', c:'Jue'},
  {v:5, l:'Viernes', c:'Vie'}
];
/* días disponibles del vendedor, tolerante a datos viejos */
function diasDe(v){
  if(!v) return [1];
  if(v.dias && v.dias.length) return v.dias.slice().sort(function(a,b){return a-b;});
  if(v.diaSesion!=null) return [v.diaSesion];
  return [1];
}
function nombraDias(v){
  var d = diasDe(v);
  return d.map(function(x){ var o=DIAS_LAB.filter(function(y){return y.v===x;})[0]; return o?o.c:'?'; }).join(', ');
}

/* la siguiente capacitación de la misma empresa, para cerrar la ventana */
function siguienteCap(capId){
  var c = capa(capId); if(!c) return null;
  return DB.capacitaciones
    .filter(function(k){ return k.clienteId===c.clienteId && k.fecha>c.fecha && k.estatus!=='cancelada'; })
    .sort(function(a,b){ return a.fecha<b.fecha?-1:1; })[0] || null;
}

/* Todas las fechas donde ese vendedor podría verse con el coach,
   entre su capacitación y la siguiente. La primera es el default. */
function opcionesCoacheo(capId, vendedorId){
  return ventanaCoacheo(capId, vendedorId).propias;
}

/* Ventana completa: los días que el vendedor prefiere y, aparte,
   los demás días hábiles que caben. Sirve para salir del atorón. */
function ventanaCoacheo(capId, vendedorId, coachId){
  var c = capa(capId);
  var vacio = { propias:[], otras:[], libres:[], bloqueadas:[], ini:'', fin:'', dias:0 };
  if(!c) return vacio;
  var v = ven(vendedorId);
  var sig = siguienteCap(capId);
  var dias = diasDe(v);
  var coach = coachId || cli(c.clienteId).coachId || UI.user;

  var ini = parseISO(c.fecha); ini.setDate(ini.getDate()+1);
  var fin;
  if(sig){ fin = parseISO(sig.fecha); fin.setDate(fin.getDate()-1); }
  else { fin = parseISO(c.fecha); fin.setDate(fin.getDate()+13); }
  if(fin < ini) return { propias:[], otras:[], libres:[], bloqueadas:[], ini:dISO(ini), fin:dISO(fin), dias:0 };

  var propias=[], otras=[], libres=[], bloqueadas=[], habiles=0, cur=new Date(ini), guard=0;
  while(cur<=fin && guard<60){
    var dow = cur.getDay();
    if(dow!==0 && dow!==6){
      habiles++;
      var f = dISO(cur);
      var bl = bloqueosDe(f, coach).length>0;
      if(bl) bloqueadas.push(f); else libres.push(f);
      if(dias.indexOf(dow)>=0) propias.push(f); else otras.push(f);
    }
    cur.setDate(cur.getDate()+1); guard++;
  }
  return { propias:propias, otras:otras, libres:libres, bloqueadas:bloqueadas,
           ini:dISO(ini), fin:dISO(fin), dias:habiles, coachId:coach };
}
/* ¿hay hueco para este vendedor? */
function sinHueco(capId, vendedorId){ return opcionesCoacheo(capId, vendedorId).length===0; }

/* fecha por defecto. Al calcular de cero, esquiva los días bloqueados del coach:
   no hay ningún acuerdo que romper todavía, así que no tiene sentido proponer
   un día en el que el coach no puede. */
function fechaCoacheo(capId, vendedorId, coachId){
  var w = ventanaCoacheo(capId, vendedorId, coachId);
  var libre = function(arr){ return arr.filter(function(f){ return w.bloqueadas.indexOf(f)<0; }); };
  var pl = libre(w.propias);
  if(pl.length) return pl[0];              /* su día, y el coach libre */
  var ol = libre(w.otras);
  if(ol.length) return ol[0];              /* otro día hábil, coach libre */
  if(w.propias.length) return w.propias[0]; /* todo bloqueado: se marca y avisa */
  if(w.otras.length) return w.otras[0];
  return '';
}

/* Recalcula las sesiones ancladas a una capacitación.
   Respeta las ya realizadas y las que el coach movió a mano. */
function reprogramarCoacheo(capId){
  var c = capa(capId); if(!c) return 0;
  var n = 0;
  DB.sesiones.forEach(function(s){
    if(s.capacitacionId!==capId) return;
    if(s.anclada===false) return;              /* la movieron a mano */
    if(s.estatus!=='programada') return;       /* ya pasó, no se toca */
    var nueva = fechaCoacheo(capId, s.vendedorId, s.coachId);
    if(nueva && nueva!==s.fechaProg){ s.fechaProg = nueva; n++; }
  });
  return n;
}

/* Cuántas sesiones se moverían (para avisar antes) */
function coacheoAnclado(capId){
  return DB.sesiones.filter(function(s){
    return s.capacitacionId===capId && s.anclada!==false && s.estatus==='programada';
  }).length;
}

/* ============================================================
   BLOQUEOS DE AGENDA
   Cada coach bloquea su tiempo. Los demás ven que está ocupado,
   no por qué: un bloqueo personal no se justifica.
   ============================================================ */
function bloqueosDe(fecha, personaId){
  return (DB.bloqueos||[]).filter(function(b){
    if(personaId && b.personaId!==personaId) return false;
    return fecha >= b.desde && fecha <= (b.hasta || b.desde);
  });
}
/* ¿puedo ver el detalle de este bloqueo? solo si es mío */
function bloqueoMio(b){ return b.personaId===UI.user; }
function tituloBloqueo(b){
  if(bloqueoMio(b)) return b.titulo || tipoBloqueo(b.tipo).l;
  return 'Bloqueado';
}
function horarioBloqueo(b){
  if(b.todoElDia) return 'Todo el día';
  return (b.horaIni||'')+' – '+(b.horaFin||'');
}
/* ¿esta sesión cae sobre un bloqueo del coach que la da? */
function sesionBloqueada(s){
  if(s.estatus!=='programada') return null;
  var bs = bloqueosDe(s.fechaProg, s.coachId);
  if(!bs.length) return null;
  var m = hhmm2min(s.horaProg);
  for(var i=0;i<bs.length;i++){
    var b = bs[i];
    if(b.todoElDia) return b;
    var bi = hhmm2min(b.horaIni), bf = hhmm2min(b.horaFin);
    if(bi==null || bf==null) return b;
    if(m!=null && m < bf && (m + (s.durProg||30)) > bi) return b;
  }
  return null;
}
/* ¿esta fecha choca con un bloqueo del coach? (para el selector de días) */
function fechaBloqueada(fecha, coachId){
  return bloqueosDe(fecha, coachId||UI.user).length > 0;
}

/* estados visuales de una sesión */
function sesionEnConflicto(s){ return fueraDeVentana(s); }
function noRealizada(s){ return s.estatus==='no_realizada' || s.estatus==='cancelada'; }

/* ¿esta sesión quedó fuera de su ventana? */
function fueraDeVentana(s){
  if(!s.capacitacionId || s.estatus!=='programada') return false;
  var c = capa(s.capacitacionId); if(!c) return false;
  if(s.fechaProg <= c.fecha) return true;
  var sig = siguienteCap(s.capacitacionId);
  return !!(sig && s.fechaProg >= sig.fecha);
}

/* --- Ficha resumen de un vendedor --- */
function fichaVendedor(vid){
  var v = ven(vid);
  var ases = DB.asistencias.filter(function(a){return a.vendedorId===vid;});
  var asis = ases.filter(function(a){return a.asistio;});
  var temasVistos = {};
  asis.forEach(function(a){ var c=capa(a.capacitacionId); if(c) temasVistos[c.temaId]=(temasVistos[c.temaId]||[]).concat([c.subtema]); });
  var ses = DB.sesiones.filter(function(s){return s.vendedorId===vid;});
  var sesR = ses.filter(function(s){return s.estatus==='realizada';});
  var comp = DB.compromisos.filter(function(c){return c.vendedorId===vid;});
  var cerr = comp.filter(function(c){return c.estatus!=='pendiente';});
  var cump = cerr.filter(function(c){return c.estatus==='cumplido';});
  var avgAvance = cerr.length ? Math.round(cerr.reduce(function(a,c){return a+compPct(c);},0)/cerr.length) : 0;
  var desvsV = comp.map(compDesviacion).filter(function(d){return d!==null && d>0;});
  var desvPromV = desvsV.length ? (desvsV.reduce(function(a,b){return a+b;},0)/desvsV.length).toFixed(1) : '0';
  var animosV = comp.filter(function(c){return c.animo;}).sort(function(a,b){return a.fecha<b.fecha?-1:1;});
  var animoAct = animosV.length ? animosV[animosV.length-1].animo : null;
  var animoPromV = animosV.length ? (animosV.reduce(function(a,c){return a+c.animo;},0)/animosV.length) : 0;
  var evs = DB.evaluaciones.filter(function(e){return e.vendedorId===vid;}).sort(function(a,b){return a.fecha<b.fecha?-1:1;});
  var mjs=0, lls=0;
  sesR.forEach(function(s){ mjs+=(s.mjs||0); lls+=(s.llamadas||0); });
  var partProm = ases.length ? Math.round(ases.reduce(function(a,b){return a+(b.participacion||0);},0)/ases.length) : 0;

  /* entregas globales */
  var entReq=0, entHec=0;
  ases.filter(function(a){return a.asistio;}).forEach(function(a){
    var t = tareaDe(a.capacitacionId); if(!t) return;
    entReq += t.nEntregas;
    entHec += DB.entregas.filter(function(e){return e.tareaId===t.id && e.vendedorId===vid;}).length;
  });

  return { v:v, asistencias:ases.length, asistio:asis.length, pctAsist:pct(asis.length, ases.length),
    temasVistos:temasVistos, sesiones:sesR.length, sesTot:ses.length,
    comp:comp.length, compCumplidos:cump.length, pctComp:pct(cump.length, cerr.length),
    avgAvance:avgAvance, desvProm:desvPromV, animoAct:animoAct, animoProm:animoPromV, animosHist:animosV,
    compPend: comp.filter(function(c){return c.estatus==='pendiente';}).length,
    vencidos: comp.filter(compVencido).length,
    evs:evs, avance: evs.length>1 ? (evs[evs.length-1].puntaje - evs[0].puntaje) : null,
    mjs:mjs, llamadas:lls, partProm:partProm,
    entReq:entReq, entHec:entHec, pctEnt:pct(entHec, entReq),
    ultimaSesion: sesR.length ? sesR.sort(function(a,b){return a.fechaProg<b.fechaProg?1:-1;})[0] : null,
    proxima: ses.filter(function(s){return s.estatus==='programada';}).sort(function(a,b){return a.fechaProg<b.fechaProg?-1:1;})[0] || null
  };
}
/* ============================================================
   SHELL + ROUTER
   ============================================================ */
var $ = function(id){ return document.getElementById(id); };
function setHtml(id,h){ var e=$(id); if(e) e.innerHTML=h; }
function setText(id,t){ var e=$(id); if(e) e.textContent=t; }

var VISTAS = [
  {id:'hoy', ic:'☀️', l:'Hoy', grp:'Operación'},
  {id:'agenda', ic:'🗓️', l:'Agenda', grp:'Operación'},
  {id:'coacheo', ic:'🎧', l:'Coacheo', grp:'Operación'},
  {id:'compromisos', ic:'🤝', l:'Compromisos', grp:'Operación'},
  {id:'capacitaciones', ic:'📚', l:'Capacitaciones', grp:'Programa'},
  {id:'vendedores', ic:'👥', l:'Vendedores', grp:'Programa'},
  {id:'tablero', ic:'📈', l:'Tablero', grp:'Control'},
  {id:'catalogos', ic:'⚙️', l:'Catálogos', grp:'Control'}
];

function toast(msg){
  var old=document.querySelector('.toast'); if(old) old.remove();
  var d=document.createElement('div'); d.className='toast'; d.textContent=msg;
  document.body.appendChild(d);
  setTimeout(function(){ if(d.parentNode) d.remove(); }, 2600);
}

function pendientesHoy(){
  var h=hoyISO();
  var s = fc(DB.sesiones).filter(function(x){return x.fechaProg===h && x.estatus==='programada';}).length;
  var c = fc(DB.compromisos).filter(function(x){return x.fecha===h && x.estatus==='pendiente';}).length;
  return s+c;
}

function renderNav(){
  var grupos=[], vistos={};
  VISTAS.forEach(function(v){ if(!vistos[v.grp]){ vistos[v.grp]=1; grupos.push(v.grp); } });
  var h='';
  grupos.forEach(function(g){
    h+='<div class="nav-lbl">'+g+'</div>';
    VISTAS.filter(function(v){return v.grp===g;}).forEach(function(v){
      var badge='';
      if(v.id==='hoy'){ var n=pendientesHoy(); if(n) badge='<span class="pill">'+n+'</span>'; }
      if(v.id==='compromisos'){ var k=fc(DB.compromisos).filter(compVencido).length; if(k) badge='<span class="pill" style="background:var(--rojo);color:#fff">'+k+'</span>'; }
      h+='<a href="#" class="'+(UI.vista===v.id?'on':'')+'" onclick="irA(\''+v.id+'\');return false;"><span class="ic">'+v.ic+'</span>'+v.l+badge+'</a>';
    });
  });
  setHtml('nav',h);

  var p=per(UI.user);
  setHtml('whoami','<div class="av">'+esc(ini(p.nombre))+'</div><div style="min-width:0"><div class="nm">'+esc(p.nombre)+'</div><div class="rl">'+esc(p.rol)+'</div></div>');
}

function renderTop(){
  var v = VISTAS.filter(function(x){return x.id===UI.vista;})[0]||VISTAS[0];
  setText('ttl', v.l);
  var sub='';
  if(UI.vista==='hoy') sub = fmtLargo(hoyISO());
  else if(UI.cliente!=='*') sub = cli(UI.cliente).nombre;
  else sub = (DB.programas||[]).length+' empresas · '+DB.vendedores.length+' vendedores';
  setText('sub', sub);

  var h='<option value="*">Todas las empresas</option>';
  clientesEva().forEach(function(c){ h+='<option value="'+c.id+'"'+(UI.cliente===c.id?' selected':'')+'>'+esc(c.nombre)+'</option>'; });
  setHtml('fCliente',h);

  var u='';
  var elegibles = DB.personal.filter(function(p){return (p.activo!==false||p.id===UI.user) && (p.rol==='Coach de ventas'||p.rol==='Supervisor');});
  if(!elegibles.length) elegibles = DB.personal.filter(function(p){return p.activo!==false;});
  if(!elegibles.length) elegibles = DB.personal.slice(0,1);
  if(elegibles.length && !elegibles.filter(function(p){return p.id===UI.user;}).length) UI.user = elegibles[0].id;
  elegibles.forEach(function(p){
    u+='<option value="'+p.id+'"'+(UI.user===p.id?' selected':'')+'>'+esc(p.nombre)+'</option>';
  });
  setHtml('fUser',u);
}

function irA(v){ UI.vista=v; UI.semana=0; UI.mes=0; render(); window.scrollTo(0,0); }

function render(){
  renderNav(); renderTop();
  var f = {
    hoy:vistaHoy, agenda:vistaAgenda, coacheo:vistaCoacheo, compromisos:vistaCompromisos,
    capacitaciones:vistaCapacitaciones, vendedores:vistaVendedores, tablero:vistaTablero, catalogos:vistaCatalogos
  }[UI.vista] || vistaHoy;
  setHtml('view', f());
}

/* ---------- componentes reutilizables ---------- */
function chipCliente(id){
  var c = cli(id);
  return '<span class="tag" style="background:'+c.color+'18;color:'+c.color+'"><span class="dot" style="background:'+c.color+'"></span>'+esc(c.nombre)+'</span>';
}
function avatarV(vid){
  var v=ven(vid), c=cli(v.clienteId);
  return '<div class="av-c" style="background:'+c.color+'">'+esc(ini(v.nombre+' '+v.apellidos))+'</div>';
}
function vacio(ic,ttl,txt){
  return '<div class="empty"><div class="big">'+ic+'</div><div class="ttl">'+ttl+'</div><div class="small">'+txt+'</div></div>';
}
function kpi(l,n,u,pie,barra,clase){
  var h='<div class="kpi"><div class="k-l">'+l+'</div><div class="k-n">'+n+(u?'<small> '+u+'</small>':'')+'</div>';
  if(pie) h+='<div class="k-f">'+pie+'</div>';
  if(barra!=null) h+='<div class="bar '+(clase||'')+'"><i style="width:'+Math.min(100,Math.max(0,barra))+'%"></i></div>';
  return h+'</div>';
}

/* ============================================================
   VISTA · HOY
   ============================================================ */
function vistaHoy(){
  var h = hoyISO();
  var ses = fc(DB.sesiones).filter(function(s){return s.fechaProg===h;})
              .sort(function(a,b){return (a.horaProg||'')<(b.horaProg||'')?-1:1;});
  var caps = fc(DB.capacitaciones).filter(function(c){return c.fecha===h;});
  var comps = fc(DB.compromisos).filter(function(c){return c.fecha===h && c.estatus==='pendiente';});
  var venc = fc(DB.compromisos).filter(compVencido);

  var out = '';

  /* franja de alerta */
  var bloqueadas = ses.filter(function(s){ if(s.estatus!=='programada') return false; return !evaluarCandado(s).elegible; });
  var fuera = fc(DB.sesiones).filter(fueraDeVentana);
  var chocan = fc(DB.sesiones).filter(function(s){ return !!sesionBloqueada(s); });
  if(fuera.length){
    out += '<div class="lock no"><div class="ico">\u26a0\ufe0f</div><div class="f">'+
      '<div class="ttl">'+fuera.length+' sesi\u00f3n'+(fuera.length>1?'es':'')+' con problema de calendario</div>'+
      '<div class="txt">Quedaron fuera del hueco entre su capacitaci\u00f3n y la siguiente. '+
      'Hay que reagendarlas a mano, o marcarlas como no realizadas con su motivo.</div>'+
      '<div class="row wrap mt-s" style="gap:6px">'+
      fuera.slice(0,4).map(function(s){
        return '<button class="btn dgr sm" onclick="abrirSesion(\''+s.id+'\')">'+esc(ven(s.vendedorId).nombre)+' \u00b7 '+esc(fmtFecha(s.fechaProg))+'</button>';
      }).join('')+
      (fuera.length>4? '<button class="btn gho sm" onclick="setTab(\'coa\',\'conf\');irA(\'coacheo\')">Ver las '+fuera.length+'</button>':'')+
      '</div></div></div>';
  }
  if(chocan.length){
    out += '<div class="lock wt"><div class="ico">🔒</div><div class="f">'+
      '<div class="ttl">'+chocan.length+' sesión'+(chocan.length>1?'es':'')+' cae'+(chocan.length>1?'n':'')+' en tiempo bloqueado</div>'+
      '<div class="txt">Están agendadas sobre un bloqueo de agenda. Hay que moverlas.</div>'+
      '<div class="row wrap mt-s" style="gap:6px">'+
      chocan.slice(0,4).map(function(s){
        return '<button class="btn gho sm" onclick="abrirSesion(\''+s.id+'\')">'+esc(ven(s.vendedorId).nombre)+' · '+esc(fmtFecha(s.fechaProg))+'</button>';
      }).join('')+'</div></div></div>';
  }
  if(bloqueadas.length || venc.length){
    out += '<div class="grid g2 mb">';
    if(bloqueadas.length){
      out += '<div class="lock no"><div class="ico">🔒</div><div class="f"><div class="ttl">'+bloqueadas.length+' sesión'+(bloqueadas.length>1?'es':'')+' sin el 50% de tarea</div>'+
             '<div class="txt">El candado ya corrió. Avisa al vendedor o cancela para no quemar el espacio.</div></div></div>';
    }
    if(venc.length){
      out += '<div class="lock wt"><div class="ico">⏰</div><div class="f"><div class="ttl">'+venc.length+' compromiso'+(venc.length>1?'s':'')+' vencido'+(venc.length>1?'s':'')+'</div>'+
             '<div class="txt">Se pasó la fecha y siguen sin calificar. <a href="#" onclick="irA(\'compromisos\');return false;" style="color:#9A6408;font-weight:700">Ir a calificarlos</a></div></div></div>';
    }
    out += '</div>';
  }

  out += '<div class="grid g2">';

  /* --- columna izquierda: sesiones de coaching --- */
  out += '<div class="card"><div class="card-h"><h3>Tus sesiones de hoy</h3><div class="r"><span class="tag t-n mono">'+ses.length+'</span></div></div>';
  if(!ses.length){
    out += vacio('🎧','Hoy no tienes coacheo','Aprovecha para cerrar compromisos vencidos o capturar minutas pendientes.');
  } else {
    ses.forEach(function(s){
      var v=ven(s.vendedorId), lock=evaluarCandado(s);
      var estado = s.estatus==='realizada'
        ? '<span class="tag t-v">✓ Capturada</span>'
        : noRealizada(s)
          ? '<span class="tag t-n">No se realizó</span>'
          : sesionEnConflicto(s)
            ? '<span class="tag t-r">⚠️ Fuera de ventana</span>'
            : (lock.elegible ? '<span class="tag t-e">Lista</span>' : '<span class="tag t-r">🔒 Sin tarea</span>');
      out += '<div class="item"><div class="hour">'+esc(s.horaProg)+'</div>'+avatarV(s.vendedorId)+
        '<div class="f"><div class="ttl">'+esc(v.nombre+' '+v.apellidos)+'</div>'+
        '<div class="mta">'+esc(cli(s.clienteId).nombre)+' · Sesión '+s.nSesion+' · '+s.durProg+' min · tarea '+lock.entregadas+'/'+lock.req+'</div></div>'+
        estado+'<button class="btn sm '+(s.estatus==='realizada'?'gho':'amb')+'" onclick="abrirSesion(\''+s.id+'\')">'+(s.estatus==='realizada'?'Ver':'Abrir')+'</button></div>';
    });
  }
  out += '</div>';

  /* --- columna derecha --- */
  var der = '';
  der += '<div class="card mb"><div class="card-h"><h3>Capacitaciones de hoy</h3></div>';
  if(!caps.length) der += vacio('📚','Sin capacitación hoy','La próxima aparecerá aquí el día que toque.');
  else caps.forEach(function(c){
    der += '<div class="item"><div class="hour">'+esc(c.hora)+'</div>'+
      '<div class="f"><div class="ttl">'+esc(tem(c.temaId).nombre)+'</div>'+
      '<div class="mta">'+esc(c.subtema)+' · '+esc(c.formato)+' · '+c.durProg+' min · '+esc(per(c.capacitadorId).nombre)+'</div></div>'+
      chipCliente(c.clienteId)+'<button class="btn sm gho" onclick="abrirCapacitacion(\''+c.id+'\')">Abrir</button></div>';
  });
  der += '</div>';

  der += '<div class="card"><div class="card-h"><h3>Compromisos que vencen hoy</h3><div class="r"><span class="tag t-n mono">'+comps.length+'</span></div></div>';
  if(!comps.length) der += vacio('🤝','Nada vence hoy','Los compromisos con fecha de hoy aparecen aquí para calificarlos.');
  else comps.forEach(function(c){
    var t = TIPOS_COMPROMISO.filter(function(x){return x.v===c.tipo;})[0]||{ic:'•',l:c.tipo};
    der += '<div class="item"><div style="font-size:18px">'+t.ic+'</div>'+
      '<div class="f"><div class="ttl">'+esc(c.descripcion)+'</div>'+
      '<div class="mta">'+esc(nomV(c.vendedorId))+' · '+esc(cli(c.clienteId).nombre)+'</div></div>'+
      '<button class="btn sm amb" onclick="abrirCompromiso(\''+c.id+'\')">Calificar</button></div>';
  });
  der += '</div>';

  /* bloqueos de hoy */
  var blHoy = bloqueosDe(h, esSupervisor()? null : UI.user);
  if(blHoy.length){
    der += '<div class="card mt"><div class="card-h"><h3>Tiempo bloqueado hoy</h3></div>';
    blHoy.forEach(function(b){
      der += '<div class="item"><div style="font-size:17px">'+tipoBloqueo(b.tipo).ic+'</div>'+
        '<div class="f"><div class="ttl">'+esc(tituloBloqueo(b))+'</div>'+
        '<div class="mta">'+esc(horarioBloqueo(b))+(esSupervisor()&&b.personaId!==UI.user?' · '+esc(per(b.personaId).nombre):'')+'</div></div>'+
        '<button class="btn gho sm" onclick="abrirBloqueo(\''+b.id+'\')">Abrir</button></div>';
    });
    der += '</div>';
  }

  /* recordatorio de lo que viene */
  var porVencer = compPorVencer(3).filter(function(c){ return c.fecha!==h; });
  if(porVencer.length){
    der += '<div class="card mt"><div class="card-h"><h3>Vencen en los próximos 3 días</h3><div class="r"><span class="tag t-a mono">'+porVencer.length+'</span></div></div>';
    porVencer.slice(0,5).forEach(function(c){
      var ti = TIPOS_COMPROMISO.filter(function(x){return x.v===c.tipo;})[0]||{ic:'•'};
      var dias = difDias(c.fecha, h);
      der += '<div class="item"><div style="font-size:17px">'+ti.ic+'</div>'+
        '<div class="f" style="min-width:0"><div class="ttl" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(c.descripcion)+'</div>'+
        '<div class="mta">'+esc(nomV(c.vendedorId))+' · '+esc(cli(c.clienteId).nombre)+'</div></div>'+
        '<span class="tag t-a mono">'+(dias===1?'mañana':'en '+dias+' días')+'</span>'+
        '<button class="btn gho sm" onclick="abrirCompromiso(\''+c.id+'\')">Abrir</button></div>';
    });
    if(porVencer.length>5) der += '<div class="item small muted">y '+(porVencer.length-5)+' más</div>';
    der += '</div>';
  }

  out += der + '</div>';

  /* --- resumen rápido de la semana --- */
  var m = metricasCoach(7);
  out += '<div class="eyebrow mt" style="margin-bottom:9px">Últimos 7 días</div><div class="grid g4">'+
    kpi('Sesiones', m.realizadas+'<small>/'+m.programadas+'</small>','', 'realizadas vs programadas', pct(m.realizadas,m.programadas), 'v')+
    kpi('Tiempo real', min2hhmm(m.minReal),'', 'programado '+min2hhmm(m.minProg), null)+
    kpi('Gap promedio', (m.gapProm>0?'+':'')+m.gapProm,'min','por sesión', null)+
    kpi('Minutas subidas', m.pctMinutas,'%', m.minutas+' de '+m.realizadas+' sesiones', m.pctMinutas, m.pctMinutas>=90?'v':(m.pctMinutas>=70?'a':'r'))+
    '</div>';

  return out;
}
/* ============================================================
   VISTA · AGENDA
   ============================================================ */
function tabAg(){ return UI.tab.agenda || 'todo'; }
function setTab(k,v){ UI.tab[k]=v; render(); }
function moverSemana(n){ UI.semana += n; render(); }

function rangoSemana(){
  var l = lunesDe(UI.semana), dias=[];
  for(var i=0;i<7;i++){ var d=new Date(l); d.setDate(l.getDate()+i); dias.push(dISO(d)); }
  return dias;
}

function eventosDe(fecha){
  var evs=[], t=tabAg();
  if(t==='todo'||t==='cap'){
    fc(DB.capacitaciones).filter(function(c){return c.fecha===fecha;}).forEach(function(c){
      evs.push({tipo:'cap', hora:c.hora, ttl:tem(c.temaId).nombre, sub:cli(c.clienteId).nombre+' · '+c.subtema, id:c.id, fn:'abrirCapacitacion'});
    });
  }
  if(t==='todo'||t==='coa'){
    fc(DB.sesiones).filter(function(s){return s.fechaProg===fecha;}).forEach(function(s){
      evs.push({tipo:'coa', hora:s.horaProg, ttl:ven(s.vendedorId).nombre+' '+ven(s.vendedorId).apellidos,
                sub:cli(s.clienteId).nombre+' · S'+s.nSesion, id:s.id, fn:'abrirSesion', est:s.estatus,
                conf:sesionEnConflicto(s), nr:noRealizada(s)});
    });
  }
  if(t==='todo'||t==='blo'){
    /* los del coach seleccionado; el supervisor ve todos */
    bloqueosDe(fecha, esSupervisor()? null : UI.user).forEach(function(b){
      evs.push({tipo:'blo', hora:(b.todoElDia?'':b.horaIni), ttl:tituloBloqueo(b),
                sub:(esSupervisor()&&b.personaId!==UI.user? per(b.personaId).nombre+' · ':'')+horarioBloqueo(b),
                id:b.id, fn:'abrirBloqueo', mio:bloqueoMio(b)});
    });
  }
  if(t==='todo'||t==='com'){
    fc(DB.compromisos).filter(function(c){return c.fecha===fecha;}).forEach(function(c){
      evs.push({tipo:'com', hora:'', ttl:c.descripcion, sub:nomV(c.vendedorId), id:c.id, fn:'abrirCompromiso'});
    });
  }
  return evs.sort(function(a,b){ return (a.hora||'zz')<(b.hora||'zz')?-1:1; });
}

/* ---------- modo de vista: semana o mes ---------- */
function modoAg(){ return UI.tab.modoAg || 'semana'; }
function setModo(m){ UI.tab.modoAg = m; render(); }
function moverMes(n){ UI.mes = (UI.mes||0) + n; render(); }
function irASemanaDe(fecha){
  var d = parseISO(fecha), l0 = lunesDe(0);
  var dow = d.getDay(); var delta = (dow===0?-6:1-dow);
  var lunEse = new Date(d); lunEse.setDate(d.getDate()+delta);
  UI.semana = Math.round((lunEse - l0)/604800000);
  UI.tab.modoAg = 'semana'; render(); window.scrollTo(0,0);
}

/* devuelve las semanas completas que cubren el mes en curso */
function rejillaMes(){
  var base = new Date();
  base.setDate(1);
  base.setMonth(base.getMonth() + (UI.mes||0));
  var mes = base.getMonth(), anio = base.getFullYear();
  var primero = new Date(anio, mes, 1);
  var dow = primero.getDay();
  var ini = new Date(primero); ini.setDate(1 - (dow===0?6:dow-1));
  var semanas = [], cur = new Date(ini);
  for(var w=0; w<6; w++){
    var fila = [];
    for(var i=0;i<7;i++){ fila.push(dISO(cur)); cur.setDate(cur.getDate()+1); }
    semanas.push(fila);
    if(cur.getMonth()!==mes && cur > new Date(anio, mes+1, 0)) break;
  }
  return { semanas:semanas, mes:mes, anio:anio };
}

function vistaAgenda(){
  var t = tabAg(), modo = modoAg(), h = hoyISO();
  var out = '';

  /* --- barra de control --- */
  var rot, hoyBtn;
  if(modo==='semana'){
    var dias = rangoSemana();
    var l = parseISO(dias[0]), f = parseISO(dias[6]);
    rot = l.getDate()+' '+MESES3[l.getMonth()]+' — '+f.getDate()+' '+MESES3[f.getMonth()]+' '+f.getFullYear();
    hoyBtn = (UI.semana!==0?'<button class="btn gho sm" onclick="UI.semana=0;render()">Hoy</button>':'');
  } else {
    var rm = rejillaMes();
    rot = MESES[rm.mes].charAt(0).toUpperCase()+MESES[rm.mes].slice(1)+' '+rm.anio;
    hoyBtn = ((UI.mes||0)!==0?'<button class="btn gho sm" onclick="UI.mes=0;render()">Este mes</button>':'');
  }

  out += '<div class="row spread wrap mb">'+
    '<div class="row wrap">'+
      '<div class="tabs" style="margin-right:8px">'+
        ['semana|Semana','mes|Mes'].map(function(x){
          var p=x.split('|'); return '<button class="'+(modo===p[0]?'on':'')+'" onclick="setModo(\''+p[0]+'\')">'+p[1]+'</button>';
        }).join('')+
      '</div>'+
      '<div class="tabs">'+
        ['todo|Todo','cap|Capacitaciones','coa|Coacheo','com|Compromisos','blo|Bloqueos'].map(function(x){
          var p=x.split('|'); return '<button class="'+(t===p[0]?'on':'')+'" onclick="setTab(\'agenda\',\''+p[0]+'\')">'+p[1]+'</button>';
        }).join('')+
      '</div>'+
    '</div>'+
    '<div class="row">'+
      '<button class="btn gho sm" onclick="'+(modo==='semana'?'moverSemana(-1)':'moverMes(-1)')+'">←</button>'+
      '<div class="mono small" style="min-width:190px;text-align:center;font-weight:700">'+rot+'</div>'+
      '<button class="btn gho sm" onclick="'+(modo==='semana'?'moverSemana(1)':'moverMes(1)')+'">→</button>'+
      hoyBtn+
      '<button class="btn amb sm" onclick="nuevaSesion()">+ Agendar coacheo</button>'+
      '<button class="btn sm" onclick="nuevaCapacitacion()">+ Capacitación</button>'+
      '<button class="btn gho sm" onclick="nuevoBloqueo()" title="Bloquear tiempo en tu agenda">🔒 Bloqueo</button>'+
    '</div></div>';

  /* --- leyenda de colores (misma que Google Calendar) --- */
  out += '<div class="row wrap mb" style="gap:14px;padding:9px 13px;background:var(--blanco);border:1px solid var(--linea);border-radius:11px">'+
    '<span class="eyebrow" style="margin-right:2px">Colores</span>'+
    '<span class="row" style="gap:6px"><span class="dot" style="background:var(--verde)"></span><span class="small">Capacitación</span></span>'+
    '<span class="row" style="gap:6px"><span class="dot" style="background:var(--ambar)"></span><span class="small">Coacheo</span></span>'+
    '<span class="row" style="gap:6px"><span class="dot" style="background:var(--morado)"></span><span class="small">Compromiso</span></span>'+
    '<span class="row" style="gap:6px"><span class="dot" style="background:var(--tinta-3)"></span><span class="small">Bloqueo</span></span>'+
    '<span class="small muted" style="margin-left:auto">Mismos colores que en Google Calendar</span>'+
    '</div>';

  var dominio = [];

  /* ============ MODO SEMANA ============ */
  if(modo==='semana'){
    dominio = rangoSemana();
    out += '<div class="week">';
    dominio.forEach(function(d){
      var dd = parseISO(d), evs = eventosDe(d);
      out += '<div class="wday'+(d===h?' hoy':'')+'">'+
        '<div class="wday-h"><div class="d">'+DIAS3[dd.getDay()]+'</div><div class="n">'+dd.getDate()+'</div></div>';
      if(!evs.length) out += '<div style="padding:12px 9px;color:var(--tinta-3);font-size:11px">—</div>';
      evs.forEach(function(e){
        var tach = (e.tipo==='coa' && e.est==='realizada') ? 'opacity:.6' : '';
        var extra = e.conf? ' conf' : (e.nr? ' nores' : '');
        out += '<div class="ev '+e.tipo+extra+' clik" style="'+tach+'" onclick="'+e.fn+'(\''+e.id+'\')">'+
          (e.hora?'<div class="h">'+esc(e.hora)+(e.conf?' \u26a0\ufe0f':'')+'</div>':'')+
          '<div class="t">'+esc(e.ttl)+'</div>'+
          '<div class="t" style="font-weight:400;opacity:.75">'+(e.nr?'No se realizó':esc(e.sub))+'</div></div>';
      });
      out += '</div>';
    });
    out += '</div>';
  }

  /* ============ MODO MES ============ */
  else {
    var rm = rejillaMes();
    out += '<div class="card" style="overflow:hidden"><div class="mgrid mhead">'+
      ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map(function(d){ return '<div>'+d+'</div>'; }).join('')+'</div>';
    rm.semanas.forEach(function(fila){
      out += '<div class="mgrid">';
      fila.forEach(function(d){
        dominio.push(d);
        var dd = parseISO(d), evs = eventosDe(d);
        var fuera = (dd.getMonth()!==rm.mes);
        out += '<div class="mday'+(d===h?' hoy':'')+(fuera?' fuera':'')+'">'+
          '<div class="mday-h"><span class="n">'+dd.getDate()+'</span>'+
          (evs.length? '<span class="cnt">'+evs.length+'</span>' : '')+'</div>';
        evs.slice(0,3).forEach(function(e){
          var tach = (e.tipo==='coa' && e.est==='realizada') ? 'opacity:.55' : '';
          var extra = e.conf? ' conf' : (e.nr? ' nores' : '');
          var tip = (e.hora?e.hora+' · ':'')+e.ttl+' — '+e.sub+(e.conf?' · ⚠️ fuera de ventana':'')+(e.nr?' · no se realizó':'');
          out += '<div class="mev '+e.tipo+extra+' clik" style="'+tach+'" title="'+esc(tip)+'" onclick="event.stopPropagation();'+e.fn+'(\''+e.id+'\')">'+
            (e.conf?'⚠️ ':'')+(e.hora?'<b>'+esc(e.hora.slice(0,5))+'</b> ':'')+esc(e.ttl)+'</div>';
        });
        if(evs.length>3) out += '<div class="mmas clik" onclick="irASemanaDe(\''+d+'\')">+'+(evs.length-3)+' más</div>';
        out += '</div>';
      });
      out += '</div>';
    });
    out += '</div><div class="small muted mt-s">Da clic en “+ más” para abrir esa semana completa.</div>';
  }

  /* --- totales del periodo --- */
  var totCap=0, totCoa=0, totCom=0, minCoa=0, minCap=0;
  dominio.forEach(function(d){
    var cc = fc(DB.capacitaciones).filter(function(c){return c.fecha===d;});
    totCap += cc.length; cc.forEach(function(c){ minCap += (c.durProg||0); });
    var ss = fc(DB.sesiones).filter(function(s){return s.fechaProg===d;});
    totCoa += ss.length; ss.forEach(function(s){ minCoa += (s.durProg||0); });
    totCom += fc(DB.compromisos).filter(function(c){return c.fecha===d;}).length;
  });
  var etq = modo==='semana' ? 'Carga de la semana' : 'Carga del mes';
  out += '<div class="eyebrow mt" style="margin-bottom:9px">'+etq+'</div><div class="grid g4">'+
    kpi('Capacitaciones', totCap, '', min2hhmm(minCap)+' de grupo', null)+
    kpi('Coacheo 1 a 1', totCoa, '', min2hhmm(minCoa)+' programados', null)+
    kpi('Compromisos', totCom, '', 'con fecha en el periodo', null)+
    kpi('Tiempo total', min2hhmm(minCap+minCoa), '', 'bloqueado en agenda', null)+
    '</div>';

  /* --- lista del periodo --- */
  var titLista = modo==='semana' ? 'Próximos 30 días' : 'Detalle del mes';
  var lista = modo==='semana' ? (function(){ var a=[]; for(var i=0;i<31;i++) a.push(masDias(i)); return a; })() : dominio;

  out += '<div class="card mt"><div class="card-h"><h3>'+titLista+'</h3><div class="r muted small">todo lo agendado, en orden</div></div><div class="tw"><table><thead><tr>'+
    '<th>Fecha</th><th>Hora</th><th>Tipo</th><th>Qué</th><th>Quién</th><th>Empresa</th><th></th></tr></thead><tbody>';
  var filas=[];
  lista.forEach(function(d){ eventosDe(d).forEach(function(e){ filas.push({d:d, e:e}); }); });
  if(!filas.length){
    out += '<tr><td colspan="7">'+vacio('🗓️','No hay nada agendado','Usa los botones de arriba para agendar una sesión o una capacitación.')+'</td></tr>';
  }
  filas.slice(0,60).forEach(function(f){
    var lbl = {cap:'Capacitación', coa:'Coacheo', com:'Compromiso', blo:'Bloqueo'}[f.e.tipo];
    var cls = {cap:'t-v', coa:'t-a', com:'t-m', blo:'t-n'}[f.e.tipo];
    out += '<tr class="clik" onclick="'+f.e.fn+'(\''+f.e.id+'\')">'+
      '<td class="mono small"><b>'+esc(fmtFecha(f.d))+'</b></td>'+
      '<td class="mono small">'+esc(f.e.hora||'—')+'</td>'+
      '<td><span class="tag '+cls+'">'+lbl+'</span></td>'+
      '<td style="max-width:320px">'+esc(f.e.ttl)+'</td>'+
      '<td class="small">'+esc(f.e.sub.split(' · ')[0])+'</td>'+
      '<td class="small">'+esc(f.e.sub.split(' · ').slice(-1)[0])+'</td>'+
      '<td style="text-align:right;color:var(--tinta-3)">›</td></tr>';
  });
  out += '</tbody></table></div></div>';
  return out;
}

/* ============================================================
   MODAL · bloqueo de agenda
   ============================================================ */
var BLOQUEO_ABIERTO = null;

function nuevoBloqueo(){
  var id = uid();
  DB.bloqueos.push({ id:id, personaId:UI.user, desde:hoyISO(), hasta:hoyISO(),
    todoElDia:true, horaIni:'09:00', horaFin:'14:00', tipo:'personal', titulo:'', notas:'' });
  guardar(); abrirBloqueo(id);
}
function abrirBloqueo(id){ BLOQUEO_ABIERTO=id; pintarBloqueo(); $('ovl').classList.add('on'); }
function B(){ return (DB.bloqueos||[]).filter(function(x){return x.id===BLOQUEO_ABIERTO;})[0]; }
function cerrarBloqueo(){ BLOQUEO_ABIERTO=null; cerrarModal(); }
function setB(campo,val){ var b=B(); if(!b) return; b[campo]=val; if(campo==='desde' && b.hasta<val) b.hasta=val; guardar(); }
function setBR(campo,val){ setB(campo,val); pintarBloqueo(); }

function pintarBloqueo(){
  var b=B(); if(!b) return;
  var mio = bloqueoMio(b);
  var t = tipoBloqueo(b.tipo);
  var dias = Math.max(1, difDias(b.hasta||b.desde, b.desde)+1);

  /* si no es mío, solo se ve que existe */
  if(!mio){
    var h0='<div class="mod slim"><div class="mod-h"><div class="av-c" style="background:var(--tinta-3)">🔒</div>'+
      '<div><h2>Bloqueado</h2><div class="sub">'+esc(per(b.personaId).nombre)+'</div></div>'+
      '<button class="x" onclick="cerrarBloqueo()">✕</button></div><div class="mod-b">'+
      '<div class="blk"><div class="row spread"><span class="muted small">Del</span><b class="mono">'+fmtFecha(b.desde)+'</b></div>'+
      (dias>1?'<div class="row spread mt-s"><span class="muted small">Al</span><b class="mono">'+fmtFecha(b.hasta)+'</b></div>':'')+
      '<div class="row spread mt-s"><span class="muted small">Horario</span><b>'+esc(horarioBloqueo(b))+'</b></div></div>'+
      '<div class="small muted">Este bloqueo es de '+esc(per(b.personaId).nombre)+'. No hace falta saber el motivo — el tiempo está apartado y ya.</div>'+
      '</div><div class="mod-f"><div class="f"></div><button class="btn amb" onclick="cerrarBloqueo()">Listo</button></div></div>';
    setHtml('modWrap',h0); return;
  }

  var h='<div class="mod"><div class="mod-h"><div class="av-c" style="background:var(--tinta-3)">'+t.ic+'</div>'+
    '<div><h2>Bloquear tiempo</h2><div class="sub">'+esc(per(b.personaId).nombre)+' · '+dias+' día'+(dias>1?'s':'')+'</div></div>'+
    '<button class="x" onclick="cerrarBloqueo()">✕</button></div><div class="mod-b">';

  h+='<div class="blk"><div class="bt"><span class="n">1</span>Cuándo</div>'+
    '<div class="grid g2">'+
      '<div class="fld"><label>Desde</label><input class="inp" type="date" value="'+esc(b.desde)+'" onchange="setBR(\'desde\',this.value)"></div>'+
      '<div class="fld"><label>Hasta</label><input class="inp" type="date" min="'+esc(b.desde)+'" value="'+esc(b.hasta||b.desde)+'" onchange="setBR(\'hasta\',this.value)"></div>'+
    '</div>'+
    '<label class="chk" style="margin-bottom:9px"><input type="checkbox" '+(b.todoElDia?'checked':'')+' onchange="setBR(\'todoElDia\',this.checked)">'+
    '<div class="f"><div style="font-weight:600;font-size:13px">Todo el día</div>'+
    '<div class="small muted">Desmárcalo si solo apartas unas horas</div></div></label>'+
    (!b.todoElDia? '<div class="grid g2">'+
      '<div class="fld" style="margin:0"><label>De</label><input class="inp" type="time" value="'+esc(b.horaIni||'')+'" onchange="setBR(\'horaIni\',this.value)"></div>'+
      '<div class="fld" style="margin:0"><label>A</label><input class="inp" type="time" value="'+esc(b.horaFin||'')+'" onchange="setBR(\'horaFin\',this.value)"></div></div>' : '')+
    '</div>';

  h+='<div class="blk"><div class="bt"><span class="n">2</span>Qué es</div>'+
    '<div class="small muted mb">Esto es solo para ti. Los demás únicamente ven que tienes el tiempo apartado.</div>'+
    '<div class="seg mb">'+TIPOS_BLOQUEO.map(function(x){
      return '<button class="'+(b.tipo===x.v?'on':'')+'" onclick="setBR(\'tipo\',\''+x.v+'\')">'+x.ic+' '+x.l+'</button>';
    }).join('')+'</div>'+
    '<div class="fld"><label>Título (opcional)</label>'+
    '<input class="inp" value="'+esc(b.titulo||'')+'" placeholder="'+esc(t.l)+'" onchange="setB(\'titulo\',this.value)"></div>'+
    '<div class="fld" style="margin:0"><label>Notas (opcional)</label>'+
    '<textarea class="ta" style="min-height:46px" onchange="setB(\'notas\',this.value)">'+esc(b.notas||'')+'</textarea></div></div>';

  /* choques con sesiones ya agendadas */
  var choques = DB.sesiones.filter(function(s){
    return s.estatus==='programada' && s.coachId===b.personaId && !!sesionBloqueada(s) && sesionBloqueada(s).id===b.id;
  });
  if(choques.length){
    h+='<div class="lock wt"><div class="ico">⚠️</div><div class="f">'+
      '<div class="ttl">'+choques.length+' sesión'+(choques.length>1?'es':'')+' cae'+(choques.length>1?'n':'')+' en este bloqueo</div>'+
      '<div class="txt">Hay que moverlas o marcarlas como no realizadas. El portal no las cambia solo.</div></div></div>';
    choques.slice(0,6).forEach(function(s){
      h+='<div class="row mb" style="gap:9px">'+avatarV(s.vendedorId)+
        '<div class="f"><div style="font-weight:600;font-size:13px">'+esc(nomV(s.vendedorId))+'</div>'+
        '<div class="small muted">'+esc(fmtFecha(s.fechaProg))+' '+esc(s.horaProg)+' · '+esc(cli(s.clienteId).nombre)+'</div></div>'+
        '<button class="btn gho sm" onclick="irASesionDesdeBloqueo(\''+s.id+'\')">Abrir</button></div>';
    });
  }

  h+='</div><div class="mod-f"><button class="btn dgr" onclick="borrarBloqueo()">Eliminar</button>'+
    '<div class="f"></div><button class="btn amb" onclick="cerrarBloqueo()">Listo</button></div></div>';
  setHtml('modWrap',h);
}
function borrarBloqueo(){
  var b=B(); if(!b) return;
  DB.bloqueos = DB.bloqueos.filter(function(x){return x.id!==b.id;});
  guardar(); cerrarBloqueo(); toast('Bloqueo eliminado');
}
function irASesionDesdeBloqueo(sid){ BLOQUEO_ABIERTO=null; abrirSesion(sid); }
/* ============================================================
   VISTA · COACHEO (lista)
   ============================================================ */
function vistaCoacheo(){
  var t = UI.tab.coa || 'prox';
  var ses = fc(DB.sesiones).slice();
  if(t==='prox') ses = ses.filter(function(s){return s.estatus==='programada';}).sort(function(a,b){return a.fechaProg<b.fechaProg?-1:1;});
  else if(t==='conf') ses = ses.filter(sesionEnConflicto).sort(function(a,b){return a.fechaProg<b.fechaProg?-1:1;});
  else if(t==='hechas') ses = ses.filter(function(s){return s.estatus==='realizada';}).sort(function(a,b){return a.fechaProg<b.fechaProg?1:-1;});
  else if(t==='nores') ses = ses.filter(noRealizada).sort(function(a,b){return a.fechaProg<b.fechaProg?1:-1;});
  else ses = ses.sort(function(a,b){return a.fechaProg<b.fechaProg?1:-1;});

  var out = '<div class="row spread wrap mb"><div class="tabs">'+
    (function(){
      var nc = fc(DB.sesiones).filter(sesionEnConflicto).length;
      return ['prox|Próximas', 'conf|⚠️ Con problema'+(nc?' ('+nc+')':''), 'hechas|Realizadas','nores|No realizadas','todas|Todas'];
    })().map(function(x){
      var p=x.split('|'); return '<button class="'+(t===p[0]?'on':'')+'" onclick="setTab(\'coa\',\''+p[0]+'\')">'+p[1]+'</button>';
    }).join('')+'</div>'+
    '<button class="btn amb" onclick="nuevaSesion()">+ Agendar sesión</button></div>';

  out += '<div class="card"><div class="tw"><table><thead><tr>'+
    '<th>Fecha</th><th>Vendedor</th><th>Empresa</th><th>S</th><th>Tarea</th><th>Mjs/Llam</th><th>Pipeline</th><th>Tiempo</th><th>Calidad</th><th></th></tr></thead><tbody>';

  if(!ses.length){
    out += '<tr><td colspan="10">'+vacio('🎧','No hay sesiones aquí','Agenda una sesión de coacheo con el botón de arriba.')+'</td></tr>';
  }
  ses.slice(0,80).forEach(function(s){
    var lock = evaluarCandado(s), g = gapSesion(s), q = calificaSesion(s);
    var pe = PIPE_ESTATUS.filter(function(p){return p.v===s.crmEstatus;})[0];
    var evid = (s.mjs||0)+(s.llamadas||0);
    var conf = sesionEnConflicto(s), nr = noRealizada(s);
    out += '<tr class="clik" onclick="abrirSesion(\''+s.id+'\')" style="'+(conf?'background:var(--rojo-sof)':(nr?'opacity:.6':''))+'">'+
      '<td class="mono small"><b'+(nr?' style="text-decoration:line-through"':'')+'>'+esc(fmtFecha(s.fechaProg))+'</b><br><span class="muted">'+esc(s.horaProg)+'</span>'+
        (conf?'<br><span class="tag t-r" style="font-size:10px">⚠️ fuera de ventana</span>':'')+
        (nr?'<br><span class="tag t-n" style="font-size:10px" title="'+esc(s.motivoNoRealizada||'')+'">no se realizó</span>':'')+
        (s.motivoCambio&&!nr?'<br><span class="tag t-n" style="font-size:10px" title="'+esc(s.motivoCambio)+'">reagendada</span>':'')+'</td>'+
      '<td><div class="row" style="gap:9px">'+avatarV(s.vendedorId)+'<div><b>'+esc(ven(s.vendedorId).nombre)+'</b><div class="mta small muted">'+esc(ven(s.vendedorId).apellidos)+'</div></div></div></td>'+
      '<td>'+chipCliente(s.clienteId)+'</td>'+
      '<td class="mono">'+s.nSesion+'</td>'+
      '<td><span class="tag t-'+semEntregas(lock.entregadas,lock.req)+'">'+lock.entregadas+'/'+lock.req+'</span></td>'+
      '<td class="mono small">'+(s.estatus==='realizada'
          ? (evid===0 ? '<span class="tag t-r">✗ 0 evidencias</span>' : (s.mjs||0)+' / '+(s.llamadas||0))
          : '<span class="muted">—</span>')+'</td>'+
      '<td>'+(pe?'<span class="tag t-'+pe.c+'">'+pe.l+'</span>':'<span class="muted small">—</span>')+'</td>'+
      '<td class="mono small">'+(g? g.real+'′ <span class="'+(g.gap>0?'':'muted')+'" style="color:'+(g.gap>0?'var(--ambar-osc)':(g.gap<0?'var(--verde)':'var(--tinta-3)'))+'">'+(g.gap>0?'+':'')+g.gap+'</span>' : '<span class="muted">'+s.durProg+'′ prog</span>')+'</td>'+
      '<td>'+(q? '<span class="tag t-'+(q.total>=85?'v':(q.total>=60?'a':'r'))+'">'+q.total+'</span>' : '<span class="muted small">—</span>')+'</td>'+
      '<td style="text-align:right;color:var(--tinta-3)">›</td></tr>';
  });
  out += '</tbody></table></div></div>';
  return out;
}

/* ============================================================
   MODAL · SESIÓN DE COACHEO
   ============================================================ */
function abrirSesion(id){
  UI.sesionAbierta = id;
  UI.tab.ses = 'antes';
  UI.compAbierto = null; UI.verCerrados = false;
  pintarSesion();
  $('ovl').classList.add('on');
}
function cerrarModal(){
  $('ovl').classList.remove('on');
  setHtml('modWrap','');
  UI.sesionAbierta=null; UI.vendedorAbierto=null;
  render();
}
var PASOS_SES = ['antes','sesion','pipeline','comp','cierre'];
function tabSes(t){ UI.tab.ses=t; pintarSesion(); scrollModalArriba(); }
function pasoSes(d){
  var i = PASOS_SES.indexOf(UI.tab.ses||'antes') + d;
  if(i<0 || i>=PASOS_SES.length) return;
  UI.tab.ses = PASOS_SES[i];
  pintarSesion();
  scrollModalArriba();
}
function scrollModalArriba(){
  var o=$('ovl'); if(o && o.scrollTo) o.scrollTo({top:0, behavior:'smooth'});
  else if(o) o.scrollTop = 0;
}

function S(){ return DB.sesiones.filter(function(x){return x.id===UI.sesionAbierta;})[0]; }

function setS(campo, val){
  var s=S(); if(!s) return;
  s[campo]=val; guardar();
}
function setSR(campo, val){ setS(campo,val); pintarSesion(); }

/* elegir uno de los días posibles de la ventana */
function moverACoacheo(fecha){
  var s=S(); if(!s) return;
  var auto = fechaCoacheo(s.capacitacionId, s.vendedorId, s.coachId);
  s.fechaProg = fecha;
  if(fecha===auto){
    /* volvió a la automática: se reancla y se limpia el motivo */
    s.anclada = true; s.motivoCambio='';
    guardar(); pintarSesion();
    toast('Fecha automática · '+fmtFecha(fecha));
  } else {
    s.anclada = false;
    guardar(); pintarSesion();
    toast('Reagendada al '+fmtFecha(fecha)+' · ponle el motivo');
  }
}
/* atajos para salir del atorón sin perder el hilo */
function irAFichaVendedor(vid){
  UI.sesionAbierta=null;
  abrirVendedor(vid); UI.tab.ven='datos'; pintarVendedor();
  toast('Marca los días en los que sí puede');
}
function irACapacitacion(capId){
  UI.sesionAbierta=null;
  abrirCapacitacion(capId); UI.tab.cap='datos'; pintarCapacitacion();
}
function reanclarSesion(){
  var s=S(); if(!s) return;
  s.anclada=true; s.motivoCambio='';
  if(s.capacitacionId){ s.fechaProg = fechaCoacheo(s.capacitacionId, s.vendedorId, s.coachId); }
  guardar(); pintarSesion();
  toast('Vuelve a la fecha automática · '+fmtFecha(s.fechaProg));
}

function pintarSesion(){
  var s = S(); if(!s) return;
  var v = ven(s.vendedorId), c = cli(s.clienteId), lock = evaluarCandado(s);
  var t = UI.tab.ses || 'antes';

  var h = '<div class="mod">';
  h += '<div class="mod-top">';
  h += '<div class="mod-h">'+avatarV(s.vendedorId)+
    '<div><h2>'+esc(v.nombre+' '+v.apellidos)+'</h2>'+
    '<div class="sub">'+esc(c.nombre)+' · Sesión '+s.nSesion+' · '+fmtFecha(s.fechaProg)+' '+esc(s.horaProg)+' · '+s.durProg+' min programados</div></div>'+
    '<button class="x" onclick="cerrarModal()" title="Cerrar">✕</button></div>';

  h += '<div class="mtabs">'+
    ['antes|1 · Antes de entrar','sesion|2 · Arranque','pipeline|3 · Pipeline y retro','comp|4 · Compromisos','cierre|5 · Cierre'].map(function(x){
      var p=x.split('|'); return '<button class="'+(t===p[0]?'on':'')+'" onclick="tabSes(\''+p[0]+'\')">'+p[1]+'</button>';
    }).join('')+'</div>';
  h += '</div>';

  h += '<div class="mod-b">'+ (
    t==='antes' ? tabAntes(s,lock) :
    t==='sesion' ? tabSesion(s) :
    t==='pipeline' ? tabPipeline(s) :
    t==='comp' ? tabCompromisos(s) : tabCierre(s)
  ) + '</div>';

  var q = calificaSesion(s);
  var idx = PASOS_SES.indexOf(t);
  var esUlt = idx===PASOS_SES.length-1;
  h += '<div class="mod-f">'+
    (s.estatus==='programada'
      ? '<button class="btn gho" onclick="marcarNoRealizada()">No se realizó</button>'
      : (noRealizada(s)
        ? '<span class="small" style="color:var(--rojo);font-weight:600">No se realizó'+(s.motivoNoRealizada? ' · '+esc(s.motivoNoRealizada):'')+'</span>'
        : '<span class="small muted">Capturada el '+esc(s.capturadaEl?fmtFecha(s.capturadaEl):'—')+'</span>'))+
    '<div class="f"></div>'+
    (esUlt && q ? '<span class="tag t-'+(q.total>=85?'v':(q.total>=60?'a':'r'))+'">Calidad '+q.total+'/100</span>' : '')+
    '<span class="small muted mono" style="margin-right:2px">'+(idx+1)+' de '+PASOS_SES.length+'</span>'+
    (idx>0 ? '<button class="btn gho" onclick="pasoSes(-1)">← Atrás</button>' : '')+
    (!esUlt
      ? '<button class="btn amb" onclick="pasoSes(1)">Siguiente →</button>'
      : (s.estatus==='programada'
          ? '<button class="btn amb" onclick="cerrarSesionCoach()">Marcar como realizada</button>'
          : '<button class="btn amb" onclick="cerrarModal()">Listo</button>'))+
    '</div></div>';

  setHtml('modWrap',h);
}

/* --- TAB 1: antes de entrar --- */
function tabAntes(s, lock){
  var h='';
  var cls = lock.elegible?'ok':'no';
  var ico = lock.elegible?'🔓':'🔒';
  var ttl = lock.elegible? 'Sesión habilitada' : 'Sesión bloqueada por el candado del 50%';
  var txt = lock.elegible
    ? 'Entregó '+lock.entregadas+' de '+lock.req+' ('+lock.porc+'%). Cumple el mínimo para sentarse contigo.'
    : 'Entregó '+lock.entregadas+' de '+lock.req+' ('+lock.porc+'%). El corte fue a las '+lock.corte+', dos horas antes. Sin el 50% no hay sesión: no es castigo, es que no habría qué revisar.';
  if(s.estatus!=='programada'){ cls = lock.elegible?'ok':'wt'; ttl = 'Al momento de la sesión: '+lock.porc+'% de tarea'; txt='Entregó '+lock.entregadas+' de '+lock.req+' evidencias de la tarea.'; }
  h += '<div class="lock '+cls+'"><div class="ico">'+ico+'</div><div class="f"><div class="ttl">'+ttl+'</div><div class="txt">'+txt+'</div>'+
       '<div class="gapbar" style="background:rgba(0,0,0,.08)"><i style="width:'+Math.min(100,lock.porc)+'%;background:'+(lock.elegible?'var(--verde)':'var(--rojo)')+'"></i></div></div></div>';

  /* choque con un bloqueo de agenda: avisa y ofrece las tres salidas */
  var blq = sesionBloqueada(s);
  if(blq){
    var wB = ventanaCoacheo(s.capacitacionId, s.vendedorId, s.coachId);
    var alt = (wB.propias||[]).filter(function(f){ return wB.bloqueadas.indexOf(f)<0 && f!==s.fechaProg; });
    var altOtras = (wB.otras||[]).filter(function(f){ return wB.bloqueadas.indexOf(f)<0 && f!==s.fechaProg; });

    h += '<div class="lock no"><div class="ico">🔒</div><div class="f">'+
      '<div class="ttl">Esta sesión cae en tiempo bloqueado</div>'+
      '<div class="txt">'+(bloqueoMio(blq)
        ? esc(tituloBloqueo(blq))+' · '+esc(horarioBloqueo(blq))+' del '+fmtFecha(blq.desde)+(blq.hasta!==blq.desde?' al '+fmtFecha(blq.hasta):'')+'.'
        : esc(per(blq.personaId).nombre)+' tiene ese tiempo apartado.')+
      ' Ya estaba agendada, as\u00ed que el portal no la mueve solo.</div></div></div>';

    h += '<div class="blk" style="border-color:#F4BDBE">'+
      '<div class="small" style="font-weight:700;color:var(--tinta-2);margin-bottom:9px">\u00bfQu\u00e9 hacemos con ella?</div>';

    /* salida 1: mover a otro día libre */
    if(alt.length || altOtras.length){
      h += '<div class="small muted mb"><b>1.</b> Moverla a otro d\u00eda de la ventana que s\u00ed tengas libre:</div>'+
        '<div class="row wrap mb" style="gap:6px">';
      alt.forEach(function(f){
        h += '<button class="btn amb sm" onclick="moverACoacheo(\''+f+'\')">'+esc(fmtFecha(f))+'</button>';
      });
      altOtras.forEach(function(f){
        h += '<button class="btn gho sm" onclick="moverACoacheo(\''+f+'\')" title="Fuera de los d\u00edas habituales de '+esc(ven(s.vendedorId).nombre)+'">'+
          esc(fmtFecha(f))+' <span style="opacity:.6">'+DIAS3[parseISO(f).getDay()]+'</span></button>';
      });
      h += '</div>';
    } else {
      h += '<div class="small muted mb"><b>1.</b> Moverla \u2014 no hay ning\u00fan otro d\u00eda libre en esta ventana.</div>';
    }

    /* salida 2: quitar el bloqueo */
    h += '<div class="small muted mb"><b>2.</b> '+(bloqueoMio(blq)
      ? 'Si al final s\u00ed puedes ese d\u00eda, quita o ajusta el bloqueo:'
      : 'Ver el bloqueo de '+esc(per(blq.personaId).nombre)+':')+'</div>'+
      '<div class="row wrap mb" style="gap:6px"><button class="btn gho sm" onclick="abrirBloqueo(\''+blq.id+'\')">'+
      (bloqueoMio(blq)?'Abrir mi bloqueo':'Ver el bloqueo')+'</button></div>';

    /* salida 3: no se realizó */
    h += '<div class="small muted mb"><b>3.</b> Si de plano no hubo forma, d\u00e9jala registrada:</div>'+
      '<div class="row wrap" style="gap:6px"><button class="btn dgr sm" onclick="marcarNoRealizada()">No se realiz\u00f3</button></div>'+
      '</div>';
  }

  /* vínculo con su capacitación y ajuste de fecha */
  if(s.capacitacionId && capa(s.capacitacionId)){
    var cp = capa(s.capacitacionId);
    h += '<div class="row wrap mb" style="gap:9px;padding:9px 12px;background:var(--blanco);border:1px solid var(--linea);border-radius:11px">'+
      '<span style="font-size:15px">\ud83d\udd17</span>'+
      '<div class="f small" style="min-width:0"><b>'+esc(tem(cp.temaId).nombre)+' \u2014 '+esc(cp.subtema)+'</b>'+
      '<div class="muted">Capacitaci\u00f3n del '+fmtFecha(cp.fecha)+'</div></div></div>';

    if(s.estatus==='programada'){
      var w = ventanaCoacheo(s.capacitacionId, s.vendedorId, s.coachId);
      var ops = w.propias;
      var auto = fechaCoacheo(s.capacitacionId, s.vendedorId, s.coachId);
      var sig = siguienteCap(s.capacitacionId);
      var vv = ven(s.vendedorId);
      var movida = !!auto && s.fechaProg!==auto;
      var esPropio = ops.indexOf(s.fechaProg)>=0;

      h += '<div class="blk"><div class="bt">\u00bfQu\u00e9 d\u00eda queda con '+esc(vv.nombre)+'?</div>'+
        '<div class="small muted mb">Tiene que ser <b>antes de la siguiente capacitaci\u00f3n</b>'+
        (sig? ' ('+esc(sig.subtema)+', '+fmtFecha(sig.fecha)+')' : ' (a\u00fan no hay otra agendada)')+
        '. Disponible: <b>'+nombraDias(vv)+'</b>.</div>';

      /* --- caso 1: hay días de los suyos --- */
      if(ops.length){
        h += '<div class="row wrap" style="gap:6px">';
        ops.forEach(function(f, i){
          var on = s.fechaProg===f;
          var bl = fechaBloqueada(f, s.coachId);
          h += '<button class="btn '+(on?'amb':'gho')+' sm" onclick="moverACoacheo(\''+f+'\')"'+
            (bl?' title="Tienes tiempo bloqueado ese día"':'')+'>'+
            (bl?'🔒 ':'')+esc(fmtFecha(f))+(f===auto?' <span style="opacity:.65">\u2693</span>':'')+'</button>';
        });
        h += '</div>';
        if(w.otras.length){
          h += '<details style="margin-top:8px"><summary class="small muted" style="cursor:pointer">Otros '+w.otras.length+' d\u00edas h\u00e1biles que caben (fuera de los suyos)</summary>'+
            '<div class="row wrap mt-s" style="gap:6px">'+
            w.otras.map(function(f){
              var bl = w.bloqueadas.indexOf(f)>=0;
              return '<button class="btn '+(s.fechaProg===f?'amb':'gho')+' sm" onclick="moverACoacheo(\''+f+'\')"'+(bl?' title="Tienes tiempo bloqueado ese día"':'')+'>'+
                (bl?'🔒 ':'')+esc(fmtFecha(f))+'</button>';
            }).join('')+'</div></details>';
        }
      }
      /* --- caso 2: no hay de los suyos, pero sí días hábiles --- */
      else if(w.otras.length){
        h += '<div class="lock wt"><div class="ico">\u26a0\ufe0f</div><div class="f">'+
          '<div class="ttl">Ninguno de sus d\u00edas cae en este hueco</div>'+
          '<div class="txt">El hueco va del '+fmtFecha(w.ini)+' al '+fmtFecha(w.fin)+', y ah\u00ed no cae '+esc(nombraDias(vv))+'. '+
          'Puedes agendar en otro d\u00eda h\u00e1bil (confirmando con '+esc(vv.nombre)+') o agregarle ese d\u00eda a su ficha.</div></div></div>'+
          '<div class="row wrap" style="gap:6px">';
        w.otras.forEach(function(f){
          var on = s.fechaProg===f;
          var bl = w.bloqueadas.indexOf(f)>=0;
          h += '<button class="btn '+(on?'amb':'gho')+' sm" onclick="moverACoacheo(\''+f+'\')"'+(bl?' title="Tienes tiempo bloqueado ese día"':'')+'>'+
            (bl?'🔒 ':'')+esc(fmtFecha(f))+' <span style="opacity:.6">'+DIAS3[parseISO(f).getDay()]+'</span></button>';
        });
        h += '</div>'+
          '<div class="row wrap mt" style="gap:7px">'+
          '<button class="btn gho sm" onclick="irAFichaVendedor(\''+s.vendedorId+'\')">Agregar d\u00edas a '+esc(vv.nombre)+'</button>'+
          '<button class="btn gho sm" onclick="irACapacitacion(\''+s.capacitacionId+'\')">Mover la capacitaci\u00f3n</button></div>';
      }
      /* --- caso 3: la ventana está vacía --- */
      else {
        var dist = sig ? difDias(sig.fecha, cp.fecha) : 0;
        h += '<div class="lock no"><div class="ico">\u26a0\ufe0f</div><div class="f">'+
          '<div class="ttl">No cabe ninguna sesi\u00f3n en este hueco</div>'+
          '<div class="txt">'+(dist<=1
            ? 'Las dos capacitaciones est\u00e1n pegadas ('+fmtFecha(cp.fecha)+' y '+fmtFecha(sig.fecha)+'), no queda ning\u00fan d\u00eda h\u00e1bil entre ellas.'
            : 'Entre el '+fmtFecha(w.ini)+' y el '+fmtFecha(w.fin)+' solo hay fin de semana.')+
          ' El coacheo se qued\u00f3 en el '+fmtFecha(s.fechaProg)+', fuera de la ventana.</div></div></div>'+
          '<div class="small" style="font-weight:700;color:var(--tinta-2);margin-bottom:7px">C\u00f3mo salir de esto:</div>'+
          '<div class="row wrap" style="gap:7px">'+
          '<button class="btn sm" onclick="irACapacitacion(\''+s.capacitacionId+'\')">Separar las capacitaciones</button>'+
          (sig? '<button class="btn gho sm" onclick="irACapacitacion(\''+sig.id+'\')">Mover la siguiente ('+esc(fmtFecha(sig.fecha))+')</button>':'')+
          '<button class="btn gho sm" onclick="irAFichaVendedor(\''+s.vendedorId+'\')">Ver ficha de '+esc(vv.nombre)+'</button>'+
          '</div>'+
          '<div class="small muted mt-s">Tambi\u00e9n puedes dejarla donde est\u00e1: el portal la marca como fuera de ventana para que no se te pierda.</div>';
      }

      /* aviso si la fecha actual no es de sus días */
      if(s.fechaProg && !esPropio && (ops.length || w.otras.length)){
        h += '<div class="small mt-s" style="color:var(--ambar-osc);font-weight:600">Ojo: el '+fmtFecha(s.fechaProg)+' cae en '+DIAS[parseISO(s.fechaProg).getDay()]+', que no est\u00e1 entre los d\u00edas de '+esc(vv.nombre)+'.</div>';
      }

      /* motivo del cambio */
      if(movida && (ops.length || w.otras.length)){
        h += '<div style="border-top:1px solid var(--linea);margin-top:11px;padding-top:11px">'+
          '<div class="row wrap mb" style="gap:8px;align-items:center">'+
            '<span class="tag t-a">Movida del '+fmtFecha(auto)+' al '+fmtFecha(s.fechaProg)+'</span>'+
            '<button class="btn gho sm" onclick="reanclarSesion()">Volver a la autom\u00e1tica</button></div>'+
          '<div class="fld" style="margin:0"><label>\u00bfPor qu\u00e9 se movi\u00f3?</label>'+
          '<select class="sel" onchange="setSR(\'motivoCambio\',this.value)">'+
            '<option value="">\u2014 Elige el motivo \u2014</option>'+
            MOTIVOS_REAGENDA.map(function(m){return '<option'+(s.motivoCambio===m?' selected':'')+'>'+esc(m)+'</option>';}).join('')+
          '</select>'+
          (!s.motivoCambio? '<div class="hint" style="color:var(--ambar-osc);font-weight:600">Sin motivo no se puede saber si es un caso aislado o algo que se repite.</div>':'')+
          '</div>'+
          '<div class="small muted mt-s">Esta sesi\u00f3n ya no se mueve sola con la capacitaci\u00f3n.</div>'+
          '</div>';
      } else if(!movida && ops.length){
        h += '<div class="small muted mt-s">\u2693 Es la fecha autom\u00e1tica: si mueves la capacitaci\u00f3n, esta sesi\u00f3n se recorre sola.</div>';
      }
      h += '</div>';
    } else if(s.motivoCambio){
      h += '<div class="small muted mb" style="padding-left:4px">Esta sesi\u00f3n se reagend\u00f3: '+esc(s.motivoCambio)+'</div>';
    }
  }

  /* tarea vigente */
  var tarea = lock.tarea;
  h += '<div class="blk"><div class="bt"><span class="n">1</span>Tarea que debía practicar</div>';
  if(!tarea) h += '<div class="muted small">Esta sesión no tiene una capacitación ligada. Elige una en la pestaña “La sesión” para poder revisar tarea.</div>';
  else {
    var cap = capa(tarea.capacitacionId);
    h += '<div class="small muted mb">De la capacitación: <b style="color:var(--tinta)">'+esc(tem(cap.temaId).nombre)+' — '+esc(cap.subtema)+'</b> · '+fmtFecha(cap.fecha)+'</div>';
    h += '<div style="font-weight:600;margin-bottom:4px">'+esc(tarea.descripcion)+'</div>';
    h += '<div class="small muted mb">Artefacto: '+esc(tarea.artefacto)+' · Se envía '+tarea.nEntregas+' veces · Fecha límite '+fmtFecha(tarea.fechaLimite)+'</div>';
    for(var i=1;i<=tarea.nEntregas;i++){
      var e = DB.entregas.filter(function(x){return x.tareaId===tarea.id && x.vendedorId===s.vendedorId && x.n===i;})[0];
      h += '<label class="chk'+(e?' done':'')+'"><input type="checkbox" '+(e?'checked':'')+' onchange="toggleEntrega(\''+tarea.id+'\','+i+')">'+
        '<div class="f"><div style="font-weight:600;font-size:12.5px">Entrega '+i+' de '+tarea.nEntregas+'</div>'+
        '<div class="small muted">'+(e? 'Recibida el '+fmtFecha(e.fecha)+' · <a href="'+esc(e.link)+'" target="_blank" rel="noopener" style="color:var(--electrico)">ver evidencia</a>' : 'Sin recibir')+'</div></div></label>';
    }
  }
  h += '</div>';

  /* evidencias reales */
  h += '<div class="blk"><div class="bt"><span class="n">2</span>Intentos de venta reales que mandó</div>'+
    '<div class="small muted mb">No hay número mínimo: unos días hay más movimiento que otros. Pero en cero, no hay nada que analizar.</div>'+
    '<div class="grid g2">'+
      '<div class="fld"><label>Mensajes compartidos</label><input class="inp" type="number" min="0" value="'+(s.mjs==null?'':s.mjs)+'" onchange="setSR(\'mjs\', this.value===\'\'?null:+this.value)"></div>'+
      '<div class="fld"><label>Llamadas grabadas</label><input class="inp" type="number" min="0" value="'+(s.llamadas==null?'':s.llamadas)+'" onchange="setSR(\'llamadas\', this.value===\'\'?null:+this.value)"></div>'+
    '</div>';
  if(s.mjs!=null && s.llamadas!=null){
    var tot=(s.mjs||0)+(s.llamadas||0);
    h += tot===0
      ? '<div class="lock no" style="margin-bottom:0"><div class="ico">✗</div><div class="f"><div class="ttl">Cero evidencias reales</div><div class="txt">Tache. Sin conversaciones no se puede coachear el hacer diario, solo la teoría. Déjalo anotado en el cierre.</div></div></div>'
      : '<div class="lock ok" style="margin-bottom:0"><div class="ico">✓</div><div class="f"><div class="ttl">'+tot+' evidencia'+(tot>1?'s':'')+' para analizar</div><div class="txt">'+(s.mjs||0)+' mensajes y '+(s.llamadas||0)+' llamadas. Súbelas a la IA antes de la sesión.</div></div></div>';
  }
  h += '</div>';
  return h;
}

/* --- TAB 2: la sesión --- */
function tabSesion(s){
  var v = ven(s.vendedorId);
  var h='';

  /* 1 · tema base */
  var capsV = capacitacionesVistasPor(s.vendedorId);
  h += '<div class="blk"><div class="bt"><span class="n">1</span>Sobre qué capacitación estás coacheando</div>'+
    '<div class="small muted mb">Solo aparecen los temas a los que '+esc(v.nombre)+' <b>sí asistió</b>. No se le puede pedir algo que todavía no ve.</div>';
  if(!capsV.length) h += '<div class="muted small">Todavía no registra asistencia a ninguna capacitación.</div>';
  else{
    h += '<select class="sel" onchange="setSR(\'capacitacionId\',this.value)"><option value="">— Elige el tema base —</option>';
    capsV.forEach(function(c){
      h += '<option value="'+c.id+'"'+(s.capacitacionId===c.id?' selected':'')+'>'+esc(tem(c.temaId).nombre)+' — '+esc(c.subtema)+' ('+fmtFecha(c.fecha)+')</option>';
    });
    h += '</select>';
  }
  h += '</div>';

  /* 2 · arranque del reloj */
  h += '<div class="blk"><div class="bt"><span class="n">2</span>Arranca el reloj</div>'+
    '<div class="small muted mb">Dale al botón en cuanto se conecte. El portal te lleva directo al pipeline.</div>'+
    '<div class="row wrap" style="align-items:flex-end">'+
      '<div class="fld" style="margin:0;width:190px"><label>Se conectó a las</label>'+
      '<input class="inp" type="time" value="'+esc(s.horaIni||'')+'" onchange="setSR(\'horaIni\',this.value)"></div>'+
      '<button class="btn '+(s.horaIni?'gho':'amb')+'" onclick="arrancarSesion()">⏱ '+(s.horaIni?'Corregir inicio':'Marcar inicio ahora')+'</button>'+
      (s.horaIni? '<div class="reloj v" style="margin-left:auto">Sesión iniciada <b>'+esc(s.horaIni)+'</b></div>':'')+
    '</div>';
  if(s.horaIni) h += '<div class="small muted mt-s">La hora de cierre se marca en el paso 5.</div>';
  h += '</div>';

  return h;
}

/* --- indicador compacto de tiempo --- */
function claseGap(gap){
  if(gap > 5) return 'r';
  if(gap < -5) return 'a';
  return 'v';
}
function textoGap(g){
  var t = '<b>'+g.real+' min</b> <span class="sep">·</span> programada '+g.prog;
  if(g.gap > 5) return t+' <span class="sep">·</span> se pasó '+g.gap+' min';
  if(g.gap < -5) return t+' <span class="sep">·</span> '+Math.abs(g.gap)+' min menos';
  return t+' <span class="sep">·</span> en tiempo';
}

function capacitacionesVistasPor(vid){
  var ids = DB.asistencias.filter(function(a){return a.vendedorId===vid && a.asistio;}).map(function(a){return a.capacitacionId;});
  return DB.capacitaciones.filter(function(c){ return ids.indexOf(c.id)>=0; })
    .sort(function(a,b){return a.fecha<b.fecha?1:-1;});
}
function marcarHora(campo){
  var d=new Date(); setS(campo, pad(d.getHours())+':'+pad(d.getMinutes())); pintarSesion();
  toast(campo==='horaIni'?'Inicio marcado':'Fin marcado');
}
/* arranca el reloj y salta al pipeline */
function arrancarSesion(){
  var d=new Date();
  setS('horaIni', pad(d.getHours())+':'+pad(d.getMinutes()));
  UI.tab.ses='pipeline';
  pintarSesion(); scrollModalArriba();
  toast('⏱ Reloj corriendo · vamos al pipeline');
}
function toggleEntrega(tareaId, n){
  var s=S();
  var ex = DB.entregas.filter(function(e){return e.tareaId===tareaId && e.vendedorId===s.vendedorId && e.n===n;})[0];
  if(ex) DB.entregas = DB.entregas.filter(function(e){return e!==ex;});
  else DB.entregas.push({id:uid(), tareaId:tareaId, vendedorId:s.vendedorId, n:n, fecha:hoyISO(), link:'', validada:true});
  guardar(); pintarSesion();
}

/* --- TAB 3: pipeline --- */
function tabPipeline(s){
  var h = '<div class="blk"><div class="bt"><span class="n">1</span>¿Cómo trae el pipeline?</div>'+
    '<div class="small muted mb">El vendedor te lo muestra en pantalla. Califica lo que ves, no lo que te cuenta.</div><div class="seg">';
  PIPE_ESTATUS.forEach(function(p){
    h += '<button class="'+(s.crmEstatus===p.v?'on '+p.c:'')+'" onclick="setSR(\'crmEstatus\',\''+p.v+'\')">'+p.l+'</button>';
  });
  h += '</div>';
  var pe = PIPE_ESTATUS.filter(function(p){return p.v===s.crmEstatus;})[0];
  if(pe) h += '<div class="bar '+pe.c+' mt"><i style="width:'+pe.pct+'%"></i></div><div class="small muted mt-s">Equivale a '+pe.pct+'% de higiene del pipeline para el tablero.</div>';
  h += '</div>';

  h += '<div class="blk"><div class="bt"><span class="n">2</span>Captura del pipeline</div>'+
    '<div class="small muted mb">Pega la imagen que te compartió. Se guarda comprimida para no reventar el navegador.</div>';
  if(s.crmShot){
    h += '<img class="shot mb" src="'+s.crmShot+'" alt="Captura del pipeline">'+
      '<button class="btn dgr sm" onclick="setSR(\'crmShot\',\'\')">Quitar captura</button>';
  } else {
    h += '<input type="file" accept="image/*" class="inp" onchange="subirShot(this)">'+
      '<div class="hint">JPG o PNG. Se reduce a 900 px de ancho.</div>';
  }
  h += '</div>';

  h += '<div class="blk"><div class="bt"><span class="n">3</span>Qué viste y qué falta</div>'+
    '<textarea class="ta" placeholder="Trae 12 oportunidades pero 5 sin fecha de cierre. Lo de mayo sigue en la misma etapa…" onchange="setS(\'crmNota\',this.value)">'+esc(s.crmNota||'')+'</textarea></div>';

  h += '<div class="blk"><div class="bt"><span class="n">4</span>¿Qué descubrió el vendedor?</div>'+
    '<div class="small muted mb">Primero habla él. Qué le funcionó, qué se le complicó, qué se dio cuenta al escucharse.</div>'+
    '<textarea class="ta" style="min-height:90px" placeholder="Se dio cuenta de que…" onchange="setS(\'descubrimientos\',this.value)">'+esc(s.descubrimientos||'')+'</textarea></div>';

  var cap = s.capacitacionId ? capa(s.capacitacionId) : null;
  h += '<div class="blk"><div class="bt"><span class="n">5</span>Tu retroalimentación de mensajes y llamadas</div>'+
    '<div class="small muted mb">Aterrízala en lo que ya se capacitó. Si la falla viene de un tema anterior, dilo y regrésalo ahí.'+
    (cap? ' Estás coacheando sobre <b>'+esc(tem(cap.temaId).nombre)+' — '+esc(cap.subtema)+'</b>.' : '')+'</div>'+
    '<textarea class="ta" style="min-height:90px" placeholder="En los '+((s.mjs||0))+' mensajes y '+((s.llamadas||0))+' llamadas observé…" onchange="setS(\'retro\',this.value)">'+esc(s.retro||'')+'</textarea></div>';

  h += '<div class="blk"><div class="bt"><span class="n">6</span>Obstáculos que identificaste</div>'+
    '<div class="small muted mb">Lo que le está estorbando y no depende solo de técnica.</div>'+
    '<textarea class="ta" placeholder="Carga operativa, falta de acceso a la cartera, creencias…" onchange="setS(\'obstaculos\',this.value)">'+esc(s.obstaculos||'')+'</textarea></div>';
  return h;
}

function subirShot(input){
  var f = input.files && input.files[0]; if(!f) return;
  var r = new FileReader();
  r.onload = function(ev){
    var img = new Image();
    img.onload = function(){
      var W = Math.min(900, img.width), H = Math.round(img.height * (W/img.width));
      var cv = document.createElement('canvas'); cv.width=W; cv.height=H;
      cv.getContext('2d').drawImage(img,0,0,W,H);
      try{
        setS('crmShot', cv.toDataURL('image/jpeg', 0.6));
        pintarSesion(); toast('Captura guardada');
      }catch(e){ toast('No se pudo guardar la imagen'); }
    };
    img.src = ev.target.result;
  };
  r.readAsDataURL(f);
}

/* --- TAB 4: compromisos --- */
function tabCompromisos(s){
  var h='';
  var previas = DB.sesiones.filter(function(x){ return x.vendedorId===s.vendedorId && x.estatus==='realizada' && x.fechaProg < s.fechaProg; })
    .sort(function(a,b){return a.fechaProg<b.fechaProg?1:-1;});
  var prev = previas[0];
  var pend = prev ? DB.compromisos.filter(function(c){ return c.sesionId===prev.id; }) : [];

  /* --- 1 · cerrar lo de la sesión pasada --- */
  h += '<div class="blk"><div class="row spread mb"><div class="bt" style="margin:0"><span class="n">1</span>Cerrar lo de la sesión pasada</div>';
  if(pend.length){
    var listos = pend.filter(function(c){return c.estatus!=='pendiente';}).length;
    h += '<span class="tag t-'+(listos===pend.length?'v':'a')+' mono">'+listos+' de '+pend.length+' calificados</span>';
  }
  h += '</div>';

  if(!pend.length){
    h += '<div class="muted small">No hay compromisos previos. Esta es la primera vuelta con '+esc(ven(s.vendedorId).nombre)+'.</div>';
  } else {
    var vencidos = pend.filter(function(c){ return c.estatus==='pendiente' && difDias(c.fecha,hoyISO())<0; })
                       .sort(function(a,b){ return a.fecha<b.fecha?-1:1; });
    var abiertos = pend.filter(function(c){ return c.estatus==='pendiente' && difDias(c.fecha,hoyISO())>=0; })
                       .sort(function(a,b){ return a.fecha<b.fecha?-1:1; });
    var cerrados = pend.filter(function(c){ return c.estatus!=='pendiente'; })
                       .sort(function(a,b){ return a.fecha<b.fecha?-1:1; });

    /* abre solo el primero por calificar si no hay nada abierto */
    if(UI.compAbierto===undefined || UI.compAbierto===null){
      var primero = vencidos[0] || abiertos[0] || null;
      UI.compAbierto = primero ? primero.id : '';
    }

    if(vencidos.length){
      h += grupoComp('Se pasó la fecha', vencidos.length, 'r');
      vencidos.forEach(function(c){ h += filaCompromiso(c, true); });
    }
    if(abiertos.length){
      h += grupoComp('Por calificar', abiertos.length, 'a');
      abiertos.forEach(function(c){ h += filaCompromiso(c, true); });
    }
    if(cerrados.length){
      var ver = !!UI.verCerrados;
      h += '<button class="grupo-comp" onclick="UI.verCerrados=!UI.verCerrados;pintarSesion()">'+
        '<span class="dot d-v"></span><span class="f">Ya calificados</span>'+
        '<span class="tag t-v mono">'+cerrados.length+'</span>'+
        '<span class="chev">'+(ver?'▾':'▸')+'</span></button>';
      if(ver) cerrados.forEach(function(c){ h += filaCompromiso(c, true); });
    }
  }
  h += '</div>';

  /* --- 2 · nuevos --- */
  var mios = DB.compromisos.filter(function(c){return c.sesionId===s.id;});
  h += '<div class="blk"><div class="bt"><span class="n">2</span>Compromisos de esta sesión</div>'+
    '<div class="small muted mb">Concretos y con fecha. "Le marco a fulano el jueves", no "voy a prospectar más".</div>';
  if(!mios.length) h += '<div class="muted small mb">Todavía no hay ninguno.</div>';
  mios.forEach(function(c){ h += filaCompromiso(c, false); });
  h += '<button class="btn amb sm mt" onclick="agregarCompromiso()">+ Agregar compromiso</button></div>';
  return h;
}

function grupoComp(titulo, n, clase){
  return '<div class="grupo-comp est"><span class="dot d-'+clase+'"></span>'+
    '<span class="f">'+titulo+'</span><span class="tag t-'+clase+' mono">'+n+'</span></div>';
}

function toggleComp(id){
  UI.compAbierto = (UI.compAbierto===id) ? '' : id;
  if(UI.sesionAbierta) pintarSesion(); else pintarCompromiso(id);
}
/* al cerrar uno, salta al siguiente por calificar */
function siguienteComp(actualId){
  var s = S(); if(!s) return;
  var previas = DB.sesiones.filter(function(x){ return x.vendedorId===s.vendedorId && x.estatus==='realizada' && x.fechaProg < s.fechaProg; })
    .sort(function(a,b){return a.fechaProg<b.fechaProg?1:-1;});
  var prev = previas[0]; if(!prev){ UI.compAbierto=''; return; }
  var sig = DB.compromisos.filter(function(c){ return c.sesionId===prev.id && c.estatus==='pendiente' && c.id!==actualId; })
    .sort(function(a,b){ return a.fecha<b.fecha?-1:1; })[0];
  UI.compAbierto = sig ? sig.id : '';
}

function filaCompromiso(c, conCierre){
  var t = TIPOS_COMPROMISO.filter(function(x){return x.v===c.tipo;})[0]||{ic:'\u2022',l:c.tipo,unidad:'veces'};
  var e = COMP_EST[c.estatus]||COMP_EST.pendiente;
  var venc = compVencido(c);
  var p = compPct(c), auto = compAuto(c), d = compDesviacion(c), an = animo(c.animo);
  var ab = conCierre ? (UI.compAbierto===c.id) : true;

  var cls = 'cpm' + (ab?' on':'') + (venc?' venc':'');
  var h = '<div class="'+cls+'">';

  /* ---- cabecera ---- */
  if(conCierre){
    h += '<button class="cpm-h" onclick="toggleComp(\''+c.id+'\')">'+
      '<span class="ic">'+t.ic+'</span>'+
      '<span class="f"><span class="ttl">'+esc(c.descripcion||'(sin describir)')+'</span>'+
      '<span class="mta">'+esc(fmtFecha(c.fecha))+
        (auto? ' \u00b7 '+(c.avance||0)+'/'+c.meta+' '+esc(t.unidad):'')+
        (venc? ' \u00b7 <b style="color:var(--rojo)">vencido</b>':'')+
        (d!==null&&d>0? ' \u00b7 '+textoDesviacion(d):'')+'</span></span>'+
      (an? '<span class="emo" title="'+esc(an.l)+'">'+an.ic+'</span>':'')+
      (c.estatus!=='pendiente'||c.avance||c.pctManual!=null
        ? '<span class="tag t-'+compSem(p)+' mono">'+p+'%</span>' : '')+
      '<span class="tag t-'+e.c+'">'+e.l+'</span>'+
      '<span class="chev">'+(ab?'\u25be':'\u25b8')+'</span></button>';
  }

  /* ---- cuerpo ---- */
  if(ab){
    h += '<div class="cpm-b">';
    if(!conCierre){
      h += '<div class="row" style="align-items:flex-start;gap:9px">'+
        '<div style="font-size:16px">'+t.ic+'</div>'+
        '<input class="inp" value="'+esc(c.descripcion)+'" placeholder="\u00bfQu\u00e9 va a hacer, exactamente?" onchange="editComp(\''+c.id+'\',\'descripcion\',this.value)">'+
        '<button class="btn gho sm" style="flex:0 0 auto" onclick="borrarComp(\''+c.id+'\')">\u2715</button></div>'+
        '<div class="grid g3 mt-s">'+
        '<div class="fld" style="margin:0"><label>Tipo</label><select class="sel" onchange="editComp(\''+c.id+'\',\'tipo\',this.value)">'+
          TIPOS_COMPROMISO.map(function(x){return '<option value="'+x.v+'"'+(c.tipo===x.v?' selected':'')+'>'+x.ic+' '+x.l+'</option>';}).join('')+'</select></div>'+
        '<div class="fld" style="margin:0"><label>Fecha compromiso</label><input class="inp" type="date" value="'+esc(c.fecha)+'" onchange="editComp(\''+c.id+'\',\'fecha\',this.value)"></div>'+
        '<div class="fld" style="margin:0"><label>\u00bfCu\u00e1ntas veces?</label><input class="inp mono" type="number" min="0" placeholder="\u2014" value="'+(c.meta||'')+'" onchange="editComp(\''+c.id+'\',\'meta\',this.value===\'\'?null:+this.value)">'+
        '<div class="hint">Con n\u00famero, el avance se calcula solo</div></div></div>';
    } else {
      /* avance */
      h += '<div class="row wrap" style="gap:9px;align-items:center">'+
        '<span class="small" style="font-weight:700;color:var(--tinta-2);width:62px">Avance</span>';
      if(auto){
        h += '<div class="row" style="gap:4px">';
        for(var k=0;k<=Math.min(c.meta,8);k++){
          h += '<button class="btn '+(c.avance===k?'':'gho')+' sm mono" style="padding:4px 9px" onclick="editComp(\''+c.id+'\',\'avance\','+k+')">'+k+'</button>';
        }
        h += '<span class="small muted" style="align-self:center;margin-left:4px">de '+c.meta+'</span></div>';
      } else {
        h += '<div class="seg">'+[0,25,50,75,100].map(function(x){
          return '<button class="'+(c.pctManual===x?'on '+compSem(x):'')+'" onclick="editComp(\''+c.id+'\',\'pctManual\','+x+')">'+x+'%</button>';
        }).join('')+'</div>';
      }
      h += '<div class="f" style="min-width:70px"><div class="bar '+compSem(p)+'" style="margin:0"><i style="width:'+Math.min(100,p)+'%"></i></div></div>'+
        '<span class="tag t-'+compSem(p)+' mono">'+p+'%</span></div>';

      /* fechas */
      h += '<div class="grid g2 mt-s">'+
        '<div class="fld" style="margin:0"><label>Lo hizo el</label><input class="inp" type="date" value="'+esc(c.fechaCumplido||'')+'" onchange="editComp(\''+c.id+'\',\'fechaCumplido\',this.value)"></div>'+
        '<div class="fld" style="margin:0"><label>Le di seguimiento el</label><input class="inp" type="date" value="'+esc(c.fechaSeguimiento||'')+'" onchange="editComp(\''+c.id+'\',\'fechaSeguimiento\',this.value)"></div></div>';
      if(d!==null){
        h += '<div class="row wrap mt-s" style="gap:8px"><span class="tag t-'+claseDesviacion(d)+'">'+textoDesviacion(d)+'</span>'+
          (d>0? '<select class="sel f" style="min-width:180px" onchange="editComp(\''+c.id+'\',\'motivoDesv\',this.value)">'+
            '<option value="">\u2014 \u00bfPor qu\u00e9? \u2014</option>'+
            MOTIVOS_DESV.map(function(m){return '<option'+(c.motivoDesv===m?' selected':'')+'>'+esc(m)+'</option>';}).join('')+'</select>':'')+
          '</div>';
      }

      /* ánimo */
      h += '<div class="row wrap mt-s" style="gap:6px;align-items:center">'+
        '<span class="small" style="font-weight:700;color:var(--tinta-2);width:62px">\u00c1nimo</span>';
      ANIMOS.forEach(function(a){
        var on = c.animo===a.v;
        h += '<button onclick="editComp(\''+c.id+'\',\'animo\','+a.v+')" title="'+a.l+'" style="font-size:19px;line-height:1;padding:4px 6px;border-radius:9px;border:1.5px solid '+(on?'var(--electrico)':'transparent')+';background:'+(on?'var(--electrico-sof)':'transparent')+';'+(on?'':'filter:grayscale(.65);opacity:.6')+'">'+a.ic+'</button>';
      });
      h += (an? '<span class="small muted">'+esc(an.l)+'</span>':'')+'</div>';

      /* seguimiento + cierre */
      h += '<div class="row wrap mt-s" style="gap:9px;align-items:center">'+
        '<span class="small" style="font-weight:700;color:var(--tinta-2)">Le di seguimiento</span><div class="seg">'+
          '<button class="'+(c.coachSeguimiento===true?'on v':'')+'" onclick="marcarSeguimiento(\''+c.id+'\')">S\u00ed</button>'+
          '<button class="'+(c.coachSeguimiento===false?'on r':'')+'" onclick="editComp(\''+c.id+'\',\'coachSeguimiento\',false)">No alcanc\u00e9</button></div>'+
        '<div class="f"></div>'+
        (c.estatus==='pendiente'
          ? '<button class="btn amb sm" onclick="cerrarCompromiso(\''+c.id+'\')">Cerrar y siguiente \u2192</button>'
          : '<button class="btn gho sm" onclick="editComp(\''+c.id+'\',\'estatus\',\'pendiente\')">Reabrir</button>')+
        '</div>';
      h += '<input class="inp mt-s" placeholder="Nota de cierre (opcional)" value="'+esc(c.notaCierre||'')+'" onchange="editComp(\''+c.id+'\',\'notaCierre\',this.value)">';
    }
    h += '</div>';
  }
  return h+'</div>';
}

function editComp(id, campo, val){
  var c = DB.compromisos.filter(function(x){return x.id===id;})[0]; if(!c) return;
  c[campo]=val;
  if(campo==='estatus' && UI.sesionAbierta) c.sesionCierreId = UI.sesionAbierta;
  /* si ya estaba cerrado y mueves el avance, el estatus se recalcula solo */
  if((campo==='avance'||campo==='pctManual'||campo==='meta') && c.estatus!=='pendiente'){
    c.estatus = estatusPorAvance(compPct(c));
  }
  guardar();
  if(UI.sesionAbierta) pintarSesion(); else { pintarCompromiso(id); render(); }
}
function agregarCompromiso(){
  var s=S(); if(!s) return;
  DB.compromisos.push({ id:uid(), sesionId:s.id, vendedorId:s.vendedorId, clienteId:s.clienteId,
    tipo:'llamada', descripcion:'', fecha: masDias(7), estatus:'pendiente',
    meta:null, avance:0, pctManual:null,
    coachSeguimiento:null, fechaSeguimiento:'', fechaCumplido:'', animo:null, motivoDesv:'',
    notaCierre:'', sesionCierreId:null });
  guardar(); pintarSesion();
}
function borrarComp(id){
  DB.compromisos = DB.compromisos.filter(function(c){return c.id!==id;});
  guardar(); if(UI.sesionAbierta) pintarSesion(); else render();
}

/* --- TAB 5: cierre --- */
function tabCierre(s){
  var q = calificaSesion(s);
  var g = gapSesion(s);
  var h = '';

  /* --- la sesión no ocurrió --- */
  if(noRealizada(s)){
    h += '<div class="blk" style="border-color:#F4BDBE;background:var(--rojo-sof)">'+
      '<div class="bt">Esta sesión no se realizó</div>'+
      '<div class="small muted mb">Dejarla registrada con su motivo vale más que borrarla: as\u00ed se ve si el problema se repite.</div>'+
      '<div class="fld" style="margin:0"><label>\u00bfPor qu\u00e9 no se dio?</label>'+
      '<select class="sel" onchange="setSR(\'motivoNoRealizada\',this.value)">'+
        '<option value="">\u2014 Elige el motivo \u2014</option>'+
        MOTIVOS_NO_REALIZADA.map(function(m){return '<option'+(s.motivoNoRealizada===m?' selected':'')+'>'+esc(m)+'</option>';}).join('')+
      '</select>'+
      (!s.motivoNoRealizada? '<div class="hint" style="color:var(--rojo);font-weight:600">Sin motivo no cuenta para nada en el tablero.</div>':'')+
      '</div>'+
      '<div class="fld mt"><label>Notas</label>'+
      '<textarea class="ta" style="min-height:46px" placeholder="Contexto de lo que pas\u00f3" onchange="setS(\'notas\',this.value)">'+esc(s.notas||'')+'</textarea></div>'+
      '<div class="row mt"><button class="btn gho sm" onclick="reactivarSesion()">Reactivar y reagendar</button>'+
      '<div class="f"></div>'+
      '<button class="btn gho sm" onclick="agendarSiguiente()">Agendar la siguiente</button></div>'+
      '<div class="grid g2 mt-s"><div class="fld" style="margin:0"><label>Fecha</label><input class="inp" type="date" id="nxF" value="'+masDias(7)+'"></div>'+
      '<div class="fld" style="margin:0"><label>Hora</label><input class="inp" type="time" id="nxH" value="'+esc(s.horaProg||'09:00')+'"></div></div>'+
      '</div>';
    return h;
  }

  h += '<div class="blk"><div class="bt"><span class="n">1</span>Hora de cierre</div>';
  if(!s.horaIni){
    h += '<div class="lock wt" style="margin-bottom:11px"><div class="ico">⏱️</div><div class="f"><div class="ttl">No marcaste la hora de inicio</div>'+
      '<div class="txt">Regresa al paso 2 para arrancar el reloj, o captura las dos horas a mano aquí abajo.</div></div></div>'+
      '<div class="fld"><label>Se conectó a las</label><input class="inp" type="time" style="width:190px" value="'+esc(s.horaIni||'')+'" onchange="setSR(\'horaIni\',this.value)"></div>';
  }
  h += '<div class="row wrap" style="align-items:flex-end">'+
      '<div class="fld" style="margin:0;width:190px"><label>Se desconectó a las</label>'+
      '<input class="inp" type="time" value="'+esc(s.horaFin||'')+'" onchange="setSR(\'horaFin\',this.value)"></div>'+
      '<button class="btn '+(s.horaFin?'gho':'amb')+'" onclick="marcarHora(\'horaFin\')">⏹ '+(s.horaFin?'Corregir cierre':'Marcar fin ahora')+'</button>'+
      (g? '<div class="reloj '+claseGap(g.gap)+'" style="margin-left:auto">'+textoGap(g)+'</div>'
        : '<div class="small muted" style="margin-left:auto">Programada: '+(s.durProg||0)+' min</div>')+
    '</div>';
  if(g && g.gap>5){
    h += '<div class="small muted mt-s">Si se repite con esta empresa, el bloque de '+g.prog+' min se está quedando corto. Vale la pena renegociarlo.</div>';
  } else if(g && g.gap<-5){
    h += '<div class="small muted mt-s">Sesiones cortas repetidas suelen significar que el vendedor llegó sin material. Cruza el dato con el candado del paso 1.</div>';
  }
  h += '</div>';

  h += '<div class="blk"><div class="bt"><span class="n">2</span>Minuta de la sesión</div>'+
    '<div class="small muted mb">La minuta vive en Notion. Aquí solo va la liga — sin ella la sesión no cuenta como completa.</div>'+
    '<input class="inp" placeholder="https://notion.so/…" value="'+esc(s.minutaUrl||'')+'" onchange="setSR(\'minutaUrl\',this.value)">'+
    (s.minutaUrl?'<div class="mt-s"><a href="'+esc(s.minutaUrl)+'" target="_blank" rel="noopener" class="btn gho sm">Abrir minuta ↗</a></div>':'')+
    '</div>';

  h += '<div class="blk"><div class="bt"><span class="n">3</span>Notas generales</div>'+
    '<div class="small muted mb">Contexto que no cabe en ningún campo: se conectó tarde, se le cayó el internet, traía prisa.</div>'+
    '<textarea class="ta" onchange="setS(\'notas\',this.value)">'+esc(s.notas||'')+'</textarea></div>';

  h += '<div class="blk"><div class="bt"><span class="n">4</span>Próxima sesión</div>'+
    '<div class="grid g2"><div class="fld" style="margin:0"><label>Fecha</label><input class="inp" type="date" id="nxF" value="'+masDias(7)+'"></div>'+
    '<div class="fld" style="margin:0"><label>Hora</label><input class="inp" type="time" id="nxH" value="'+esc(s.horaProg||'09:00')+'"></div></div>'+
    '<button class="btn sm mt" onclick="agendarSiguiente()">Agendar siguiente sesión</button></div>';

  if(q){
    h += '<div class="blk"><div class="bt"><span class="n">5</span>Calidad de esta captura</div>'+
      '<div class="small muted mb">Esto no califica la conversación — eso no lo puede ver el portal. Califica que quede registro de lo que sí es verificable.</div>';
    q.det.forEach(function(d){
      h += '<div class="row" style="padding:7px 0;border-bottom:1px solid var(--linea)">'+
        '<span class="dot d-'+(d.ok?'v':'r')+'"></span><div class="f small">'+d.l+'</div>'+
        '<span class="mono small" style="color:'+(d.ok?'var(--verde)':'var(--tinta-3)')+'">'+(d.ok?'+'+d.p:'0')+'</span></div>';
    });
    h += '<div class="row mt"><div class="f" style="font-weight:700">Total</div><div class="mono" style="font-size:20px;font-weight:700">'+q.total+'<span class="muted" style="font-size:13px">/100</span></div></div></div>';
  }
  return h;
}

function agendarSiguiente(){
  var s=S(); if(!s) return;
  var f=$('nxF').value, hh=$('nxH').value;
  if(!f){ toast('Ponle fecha a la siguiente sesión'); return; }
  DB.sesiones.push({ id:uid(), programaId:s.programaId||progId(s.clienteId), clienteId:s.clienteId, vendedorId:s.vendedorId, coachId:s.coachId,
    nSesion:(s.nSesion||1)+1, capacitacionId:s.capacitacionId, fechaProg:f, horaProg:hh||'09:00',
    durProg:s.durProg||30, estatus:'programada', horaIni:'', horaFin:'', mjs:null, llamadas:null,
    crmEstatus:'', crmShot:'', crmNota:'', descubrimientos:'', obstaculos:'', retro:'', minutaUrl:'', notas:'', capturadaEl:'' });
  guardar(); toast('Sesión '+((s.nSesion||1)+1)+' agendada para el '+fmtFecha(f));
}
function cerrarSesionCoach(){
  var s=S(); if(!s) return;
  if(!s.horaIni || !s.horaFin){ toast('Marca la hora de inicio y de fin en “La sesión”'); tabSes('sesion'); return; }
  s.estatus='realizada'; s.capturadaEl=hoyISO(); guardar(); pintarSesion();
  toast('Sesión marcada como realizada');
}
/* la sesión no ocurrió: hay que decir por qué */
function marcarNoRealizada(){
  var s=S(); if(!s) return;
  /* se evalúa antes de cambiar el estatus */
  var teniaConflicto = fueraDeVentana(s);
  var blq = sesionBloqueada(s);
  s.estatus='no_realizada';
  if(!s.motivoNoRealizada){
    if(blq) s.motivoNoRealizada = bloqueoMio(blq) ? 'Yo no pude' : 'Yo no pude';
    else if(teniaConflicto) s.motivoNoRealizada = 'No hubo hueco en el calendario';
  }
  guardar(); UI.tab.ses='cierre'; pintarSesion(); scrollModalArriba();
  toast(blq? 'No realizada por tiempo bloqueado'
      : (teniaConflicto? 'Marcada como no realizada por falta de hueco' : 'Marcada como no realizada · ponle el motivo'));
}
function reactivarSesion(){
  var s=S(); if(!s) return;
  s.estatus='programada'; s.motivoNoRealizada=''; guardar(); pintarSesion();
  toast('Sesión reactivada');
}
function cancelarSesion(){ marcarNoRealizada(); }
function nuevaSesion(){
  var vs = fc(DB.vendedores);
  if(!vs.length){ toast('Primero agrega vendedores'); return; }
  var v = vs[0];
  var id = uid();
  DB.sesiones.push({ id:id, programaId:progId(v.clienteId), clienteId:v.clienteId, vendedorId:v.id, coachId:UI.user, nSesion:1,
    capacitacionId:null, anclada:false, motivoCambio:'', fechaProg:hoyISO(), horaProg:'09:00', durProg:30, estatus:'programada',
    horaIni:'', horaFin:'', mjs:null, llamadas:null, crmEstatus:'', crmShot:'', crmNota:'',
    descubrimientos:'', obstaculos:'', retro:'', minutaUrl:'', notas:'', capturadaEl:'' });
  guardar(); abrirSesionNueva(id);
}
function abrirSesionNueva(id){
  UI.sesionAbierta=id; UI.tab.ses='datos'; pintarNuevaSesion(); $('ovl').classList.add('on');
}
function pintarNuevaSesion(){
  var s=S(); if(!s) return;
  var h='<div class="mod slim"><div class="mod-h"><div><h2>Agendar coacheo</h2><div class="sub">1 a 1 con un vendedor</div></div><button class="x" onclick="borrarSesionYCerrar()">✕</button></div><div class="mod-b">';
  h+='<div class="fld"><label>Vendedor</label><select class="sel" onchange="asignarVendedor(this.value)">';
  DB.vendedores.forEach(function(v){ h+='<option value="'+v.id+'"'+(s.vendedorId===v.id?' selected':'')+'>'+esc(v.nombre+' '+v.apellidos)+' — '+esc(cli(v.clienteId).nombre)+'</option>'; });
  h+='</select></div>';
  h+='<div class="grid g2"><div class="fld"><label>Fecha</label><input class="inp" type="date" value="'+esc(s.fechaProg)+'" onchange="setS(\'fechaProg\',this.value)"></div>'+
     '<div class="fld"><label>Hora</label><input class="inp" type="time" value="'+esc(s.horaProg)+'" onchange="setS(\'horaProg\',this.value)"></div></div>';
  h+='<div class="grid g2"><div class="fld"><label>Duración programada (min)</label><input class="inp" type="number" min="10" step="5" value="'+s.durProg+'" onchange="setS(\'durProg\',+this.value)"></div>'+
     '<div class="fld"><label>No. de sesión</label><input class="inp" type="number" min="1" value="'+s.nSesion+'" onchange="setS(\'nSesion\',+this.value)"></div></div>';
  h+='</div><div class="mod-f"><button class="btn gho" onclick="borrarSesionYCerrar()">Descartar</button><div class="f"></div><button class="btn amb" onclick="cerrarModal()">Agendar</button></div></div>';
  setHtml('modWrap',h);
}
function asignarVendedor(vid){
  var s=S(); if(!s) return;
  var v=ven(vid); s.vendedorId=vid; s.clienteId=v.clienteId; s.programaId=progId(v.clienteId);
  var prev = DB.sesiones.filter(function(x){return x.vendedorId===vid && x.id!==s.id;}).length;
  s.nSesion = prev+1; guardar(); pintarNuevaSesion();
}
function borrarSesionYCerrar(){
  var s=S();
  if(s && !s.horaIni && s.estatus==='programada' && !DB.compromisos.filter(function(c){return c.sesionId===s.id;}).length){
    DB.sesiones = DB.sesiones.filter(function(x){return x.id!==s.id;}); guardar();
  }
  cerrarModal();
}
/* ============================================================
   VISTA · COMPROMISOS
   ============================================================ */
function vistaCompromisos(){
  var t = UI.tab.com || 'abiertos';
  var cs = fc(DB.compromisos).slice();
  if(t==='abiertos') cs = cs.filter(function(c){return c.estatus==='pendiente';});
  else if(t==='vencidos') cs = cs.filter(compVencido);
  else if(t==='desviados') cs = cs.filter(function(c){ var d=compDesviacion(c); return d!==null && d>0; });
  else if(t==='cerrados') cs = cs.filter(function(c){return c.estatus!=='pendiente';});
  cs.sort(function(a,b){ return a.fecha<b.fecha?-1:1; });

  var todos = fc(DB.compromisos);
  var cerr = todos.filter(function(c){return c.estatus!=='pendiente';});
  var seg = todos.filter(function(c){return c.coachSeguimiento===true;});
  var avgPct = cerr.length ? Math.round(cerr.reduce(function(a,c){return a+compPct(c);},0)/cerr.length) : 0;
  var desvs = todos.map(compDesviacion).filter(function(d){return d!==null;});
  var tarde = desvs.filter(function(d){return d>0;});
  var desvProm = tarde.length ? (tarde.reduce(function(a,b){return a+b;},0)/tarde.length).toFixed(1) : '0';

  var out = '';

  /* recordatorio de lo que viene */
  var prox = compPorVencer(3);
  if(prox.length){
    out += '<div class="lock wt"><div class="ico">\u23f0</div><div class="f">'+
      '<div class="ttl">'+prox.length+' compromiso'+(prox.length>1?'s':'')+' vence'+(prox.length>1?'n':'')+' en los pr\u00f3ximos 3 d\u00edas</div>'+
      '<div class="txt">'+prox.slice(0,3).map(function(c){
        return esc(nomV(c.vendedorId).split(' ')[0])+' \u00b7 '+fmtFecha(c.fecha);
      }).join(' \u2014 ')+(prox.length>3?' y '+(prox.length-3)+' m\u00e1s':'')+'</div></div>'+
      '<button class="btn gho sm" onclick="setTab(\'com\',\'proximos\')">Ver</button></div>';
  }

  out += '<div class="grid g4 mb">'+
    kpi('Abiertos', todos.filter(function(c){return c.estatus==='pendiente';}).length, '', prox.length+' vencen esta semana', null)+
    kpi('Avance promedio', avgPct, '%', 'de los '+cerr.length+' cerrados', avgPct, compSem(avgPct))+
    kpi('Seguimiento del coach', pct(seg.length, todos.length), '%', seg.length+' de '+todos.length+' revisados', pct(seg.length,todos.length), pct(seg.length,todos.length)>=80?'v':'a')+
    kpi('Desviaci\u00f3n promedio', desvProm, 'd\u00edas', tarde.length+' se atendieron tarde', null)+
    '</div>';

  out += '<div class="tabs mb" style="display:inline-flex">'+
    ['abiertos|Abiertos','proximos|Por vencer','vencidos|Vencidos','desviados|Con desviaci\u00f3n','cerrados|Cerrados','todos|Todos'].map(function(x){
      var p=x.split('|'); return '<button class="'+(t===p[0]?'on':'')+'" onclick="setTab(\'com\',\''+p[0]+'\')">'+p[1]+'</button>';
    }).join('')+'</div>';

  if(t==='proximos') cs = compPorVencer(7);

  out += '<div class="card"><div class="tw"><table><thead><tr>'+
    '<th>Fecha</th><th>Tipo</th><th>Compromiso</th><th>Vendedor</th><th>Avance</th><th>Estatus</th><th>Seguimiento</th><th>Desviaci\u00f3n</th><th>\u00c1nimo</th><th></th></tr></thead><tbody>';
  if(!cs.length) out += '<tr><td colspan="10">'+vacio('\ud83e\udd1d','Nada por aqu\u00ed','Los compromisos se crean dentro de la sesi\u00f3n de coacheo.')+'</td></tr>';
  cs.slice(0,120).forEach(function(c){
    var ti = TIPOS_COMPROMISO.filter(function(x){return x.v===c.tipo;})[0]||{ic:'\u2022',l:c.tipo};
    var e = COMP_EST[c.estatus]||COMP_EST.pendiente;
    var venc = compVencido(c);
    var p = compPct(c), d = compDesviacion(c), an = animo(c.animo);
    out += '<tr class="clik" onclick="abrirCompromiso(\''+c.id+'\')"'+(venc?' style="background:var(--rojo-sof)"':'')+'>'+
      '<td class="mono small"><b>'+esc(fmtFecha(c.fecha))+'</b>'+(venc?'<br><span style="color:var(--rojo);font-weight:700">vencido</span>':'')+'</td>'+
      '<td><span class="tag t-n">'+ti.ic+' '+ti.l+'</span></td>'+
      '<td style="max-width:280px"><div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(c.descripcion||'(sin describir)')+'</div>'+
        (c.motivoDesv? '<div class="small muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">\u21b3 '+esc(c.motivoDesv)+'</div>':'')+'</td>'+
      '<td class="small">'+esc(nomV(c.vendedorId))+'</td>'+
      '<td style="min-width:110px">'+(c.estatus==='pendiente' && !c.avance
          ? '<span class="muted small">\u2014</span>'
          : '<div class="row" style="gap:7px"><div class="bar '+compSem(p)+'" style="margin:0;width:56px"><i style="width:'+Math.min(100,p)+'%"></i></div>'+
            '<span class="mono small" style="font-weight:700">'+p+'%</span></div>'+
            (compAuto(c)? '<div class="small muted mono">'+(c.avance||0)+'/'+c.meta+'</div>':''))+'</td>'+
      '<td><span class="tag t-'+e.c+'">'+e.l+'</span></td>'+
      '<td class="small">'+(c.fechaSeguimiento
          ? '<span class="tag t-v">'+esc(fmtFecha(c.fechaSeguimiento))+'</span>'
          : (c.coachSeguimiento===false?'<span class="tag t-r">No alcanz\u00f3</span>':'<span class="muted">\u2014</span>'))+'</td>'+
      '<td>'+(d!==null? '<span class="tag t-'+claseDesviacion(d)+'">'+textoDesviacion(d)+'</span>' : '<span class="muted small">\u2014</span>')+'</td>'+
      '<td style="text-align:center;font-size:17px" title="'+(an?esc(an.l):'')+'">'+(an? an.ic : '<span class="muted small">\u2014</span>')+'</td>'+
      '<td style="text-align:right;color:var(--tinta-3)">\u203a</td></tr>';
  });
  out += '</tbody></table></div></div>';
  return out;
}

function abrirCompromiso(id){
  UI.sesionAbierta=null;
  pintarCompromiso(id);
  $('ovl').classList.add('on');
}
function pintarCompromiso(id){
  var c = DB.compromisos.filter(function(x){return x.id===id;})[0]; if(!c) return;
  var ti = TIPOS_COMPROMISO.filter(function(x){return x.v===c.tipo;})[0]||{ic:'\u2022',l:c.tipo,unidad:'veces'};
  var s = DB.sesiones.filter(function(x){return x.id===c.sesionId;})[0];
  var p = compPct(c), auto = compAuto(c), d = compDesviacion(c);

  var h = '<div class="mod"><div class="mod-h"><div style="font-size:22px">'+ti.ic+'</div>'+
    '<div><h2>Calificar compromiso</h2><div class="sub">'+esc(nomV(c.vendedorId))+' \u00b7 '+esc(cli(c.clienteId).nombre)+'</div></div>'+
    '<button class="x" onclick="cerrarModal()">\u2715</button></div><div class="mod-b">';

  /* --- encabezado del compromiso --- */
  h += '<div class="blk"><div style="font-weight:600;font-size:14px;margin-bottom:6px">'+esc(c.descripcion||'(sin describir)')+'</div>'+
    '<div class="small muted">Acordado el '+(s?fmtFecha(s.fechaProg):'\u2014')+' \u00b7 Fecha compromiso <b class="mono" style="color:var(--tinta)">'+esc(fmtFecha(c.fecha))+'</b>'+
    (compVencido(c)?' \u00b7 <b style="color:var(--rojo)">vencido hace '+Math.abs(difDias(c.fecha,hoyISO()))+' d\u00edas</b>':'')+'</div></div>';

  /* --- 1. AVANCE --- */
  h += '<div class="blk"><div class="bt"><span class="n">1</span>\u00bfHasta d\u00f3nde lleg\u00f3?</div>';
  if(auto){
    h += '<div class="small muted mb">Se comprometi\u00f3 a <b>'+c.meta+' '+esc(ti.unidad)+'</b>. El porcentaje sale de aqu\u00ed, no de tu percepci\u00f3n.</div>'+
      '<div class="row wrap" style="gap:10px;align-items:center">'+
        '<div class="row" style="gap:7px"><span class="small" style="font-weight:700;color:var(--tinta-2)">Logr\u00f3</span>'+
        '<input class="inp mono" style="width:72px;padding:5px 8px" type="number" min="0" max="'+(c.meta*2)+'" value="'+(c.avance||0)+'" onchange="editComp(\''+c.id+'\',\'avance\',+this.value)">'+
        '<span class="small muted">de '+c.meta+'</span></div>'+
        '<div class="f" style="min-width:120px"><div class="bar '+compSem(p)+'" style="margin:0"><i style="width:'+Math.min(100,p)+'%"></i></div></div>'+
        '<span class="tag t-'+compSem(p)+' mono" style="font-size:13px">'+p+'%</span>'+
      '</div>'+
      '<div class="row wrap mt-s" style="gap:5px">';
    for(var k=0;k<=c.meta;k++){
      h += '<button class="btn '+(c.avance===k?'':'gho')+' sm mono" onclick="editComp(\''+c.id+'\',\'avance\','+k+')">'+k+'</button>';
    }
    h += '</div>';
  } else {
    h += '<div class="small muted mb">Este compromiso no tiene una meta contable, as\u00ed que el avance va a mano. Si quieres que salga solo, ponle un n\u00famero abajo.</div>'+
      '<div class="seg">'+[0,25,50,75,100].map(function(x){
        return '<button class="'+(c.pctManual===x?'on '+compSem(x):'')+'" onclick="editComp(\''+c.id+'\',\'pctManual\','+x+')">'+x+'%</button>';
      }).join('')+'</div>'+
      '<div class="bar '+compSem(p)+' mt"><i style="width:'+Math.min(100,p)+'%"></i></div>';
  }
  h += '<div class="row mt" style="gap:8px;align-items:center"><span class="small muted">Meta contable</span>'+
    '<input class="inp mono" style="width:78px;padding:4px 8px" type="number" min="0" placeholder="\u2014" value="'+(c.meta||'')+'" onchange="editComp(\''+c.id+'\',\'meta\',this.value===\'\'?null:+this.value)">'+
    '<span class="small muted">'+esc(ti.unidad)+' \u00b7 d\u00e9jalo vac\u00edo si no se puede contar</span></div>';
  h += '<div class="row mt-s"><span class="tag t-'+(COMP_EST[c.estatus]||COMP_EST.pendiente).c+'">'+(COMP_EST[c.estatus]||COMP_EST.pendiente).l+'</span>'+
    '<div class="f"></div>'+
    (c.estatus==='pendiente'
      ? '<button class="btn amb sm" onclick="cerrarCompromiso(\''+c.id+'\')">Cerrar con este avance</button>'
      : '<button class="btn gho sm" onclick="editComp(\''+c.id+'\',\'estatus\',\'pendiente\')">Reabrir</button>')+
    '</div></div>';

  /* --- 2. FECHAS REALES --- */
  h += '<div class="blk"><div class="bt"><span class="n">2</span>\u00bfCu\u00e1ndo pas\u00f3 realmente?</div>'+
    '<div class="small muted mb">No solo si se hizo: cu\u00e1ndo. De aqu\u00ed salen las desviaciones.</div>'+
    '<div class="grid g2">'+
      '<div class="fld" style="margin:0"><label>El vendedor lo hizo el</label>'+
      '<input class="inp" type="date" value="'+esc(c.fechaCumplido||'')+'" onchange="editComp(\''+c.id+'\',\'fechaCumplido\',this.value)">'+
      '<div class="hint"><button class="btn gho sm" style="padding:3px 9px;font-size:11px" onclick="editComp(\''+c.id+'\',\'fechaCumplido\',hoyISO())">Hoy</button></div></div>'+
      '<div class="fld" style="margin:0"><label>Yo le di seguimiento el</label>'+
      '<input class="inp" type="date" value="'+esc(c.fechaSeguimiento||'')+'" onchange="editComp(\''+c.id+'\',\'fechaSeguimiento\',this.value)">'+
      '<div class="hint"><button class="btn gho sm" style="padding:3px 9px;font-size:11px" onclick="marcarSeguimiento(\''+c.id+'\')">Hoy</button></div></div>'+
    '</div>';
  if(d!==null){
    h += '<div class="row mt" style="gap:9px;align-items:center">'+
      '<span class="tag t-'+claseDesviacion(d)+'">'+textoDesviacion(d)+'</span>'+
      (d>0? '<div class="f"><select class="sel" onchange="editComp(\''+c.id+'\',\'motivoDesv\',this.value)">'+
        '<option value="">\u2014 \u00bfPor qu\u00e9 se sali\u00f3 de fecha? \u2014</option>'+
        MOTIVOS_DESV.map(function(m){return '<option'+(c.motivoDesv===m?' selected':'')+'>'+esc(m)+'</option>';}).join('')+
        '</select></div>' : '')+
      '</div>';
    if(d>0 && !c.motivoDesv) h += '<div class="small muted mt-s">Sin motivo no se puede distinguir un descuido de una raz\u00f3n de peso.</div>';
  }
  h += '<div class="row mt-s"><span class="small" style="font-weight:700;color:var(--tinta-2);width:150px">\u00bfLe diste seguimiento?</span><div class="seg">'+
    '<button class="'+(c.coachSeguimiento===true?'on v':'')+'" onclick="editComp(\''+c.id+'\',\'coachSeguimiento\',true)">S\u00ed</button>'+
    '<button class="'+(c.coachSeguimiento===false?'on r':'')+'" onclick="editComp(\''+c.id+'\',\'coachSeguimiento\',false)">No alcanc\u00e9</button></div></div>';
  h += '</div>';

  /* --- 3. \u00c1NIMO --- */
  h += '<div class="blk"><div class="bt"><span class="n">3</span>\u00bfC\u00f3mo se siente con esto?</div>'+
    '<div class="small muted mb">Va aparte del avance: se puede cumplir al 100% y estar quemado, o ir a la mitad y traer buena actitud.</div>'+
    '<div class="row wrap" style="gap:7px">';
  ANIMOS.forEach(function(a){
    var on = c.animo===a.v;
    h += '<button onclick="editComp(\''+c.id+'\',\'animo\','+a.v+')" title="'+a.l+'" style="display:flex;flex-direction:column;align-items:center;gap:3px;padding:8px 12px;border-radius:11px;border:1.5px solid '+(on?'var(--electrico)':'var(--linea)')+';background:'+(on?'var(--electrico-sof)':'var(--blanco)')+'">'+
      '<span style="font-size:22px;line-height:1;'+(on?'':'filter:grayscale(.6);opacity:.7')+'">'+a.ic+'</span>'+
      '<span class="small" style="font-size:10.5px;font-weight:'+(on?'700':'400')+';color:'+(on?'var(--electrico)':'var(--tinta-3)')+'">'+a.l+'</span></button>';
  });
  h += (c.animo? '<button class="btn gho sm" style="margin-left:auto;align-self:center" onclick="editComp(\''+c.id+'\',\'animo\',null)">Quitar</button>':'')+'</div></div>';

  /* --- 4. NOTA --- */
  h += '<div class="blk"><div class="bt"><span class="n">4</span>Nota de cierre</div>'+
    '<textarea class="ta" style="min-height:52px" placeholder="Qu\u00e9 pas\u00f3 realmente" onchange="editComp(\''+c.id+'\',\'notaCierre\',this.value)">'+esc(c.notaCierre||'')+'</textarea>'+
    '<div class="fld mt" style="margin-bottom:0"><label>Mover fecha compromiso</label>'+
    '<input class="inp" type="date" style="width:190px" value="'+esc(c.fecha)+'" onchange="editComp(\''+c.id+'\',\'fecha\',this.value)"></div></div>';

  h += '</div><div class="mod-f"><button class="btn dgr" onclick="borrarComp(\''+c.id+'\');cerrarModal()">Eliminar</button><div class="f"></div>'+
    (s?'<button class="btn gho" onclick="abrirSesion(\''+s.id+'\')">Ver la sesi\u00f3n</button>':'')+
    '<button class="btn amb" onclick="cerrarModal()">Listo</button></div></div>';
  setHtml('modWrap',h);
}

/* cierra el compromiso deduciendo el estatus del avance */
function cerrarCompromiso(id){
  var c = DB.compromisos.filter(function(x){return x.id===id;})[0]; if(!c) return;
  c.estatus = estatusPorAvance(compPct(c));
  if(!c.fechaSeguimiento) c.fechaSeguimiento = hoyISO();
  if(!c.fechaCumplido && c.estatus!=='no_cumplido') c.fechaCumplido = hoyISO();
  if(UI.sesionAbierta) c.sesionCierreId = UI.sesionAbierta;
  guardar();
  if(UI.sesionAbierta){ siguienteComp(id); pintarSesion(); }
  else { pintarCompromiso(id); }
  toast('Compromiso '+(COMP_EST[c.estatus]||{l:''}).l.toLowerCase());
}
function marcarSeguimiento(id){
  var c = DB.compromisos.filter(function(x){return x.id===id;})[0]; if(!c) return;
  c.fechaSeguimiento = hoyISO(); c.coachSeguimiento = true; guardar();
  if(UI.sesionAbierta) pintarSesion(); else pintarCompromiso(id);
}

/* ============================================================
   VISTA · CAPACITACIONES
   ============================================================ */
function vistaCapacitaciones(){
  var caps = fc(DB.capacitaciones).sort(function(a,b){return a.fecha<b.fecha?1:-1;});
  var out = '<div class="row spread wrap mb"><div class="eyebrow">Sesiones de grupo por empresa</div>'+
    '<div class="row"><button class="btn gho" onclick="UI.tab.cat=\'temas\';irA(\'catalogos\')">📦 Aplicar un programa</button>'+
    '<button class="btn amb" onclick="nuevaCapacitacion()">+ Nueva capacitación</button></div></div>';

  out += '<div class="card"><div class="tw"><table><thead><tr>'+
    '<th>Fecha</th><th>Empresa</th><th>S</th><th>Tema</th><th>Subtema</th><th>Formato</th><th>Duración</th><th>Capacitador</th><th>Asistencia</th><th>Tarea</th><th></th></tr></thead><tbody>';
  if(!caps.length) out += '<tr><td colspan="11">'+vacio('📚','Sin capacitaciones','Aplica un programa desde Catálogos o agenda una suelta.')+'</td></tr>';
  caps.forEach(function(c){
    var as = DB.asistencias.filter(function(a){return a.capacitacionId===c.id;});
    var si = as.filter(function(a){return a.asistio;}).length;
    var t = tareaDe(c.id);
    var gap = (c.durReal!=null) ? (c.durReal - c.durProg) : null;
    out += '<tr class="clik" onclick="abrirCapacitacion(\''+c.id+'\')">'+
      '<td class="mono small"><b>'+esc(fmtFecha(c.fecha))+'</b><br><span class="muted">'+esc(c.hora)+'</span></td>'+
      '<td>'+chipCliente(c.clienteId)+'</td>'+
      '<td class="mono">'+c.nSesion+'</td>'+
      '<td><b>'+esc(tem(c.temaId).nombre)+'</b></td>'+
      '<td class="small">'+esc(c.subtema)+'</td>'+
      '<td class="small">'+esc(c.formato)+'</td>'+
      '<td class="mono small">'+c.durProg+'′'+(gap!=null?' <span style="color:'+(gap>0?'var(--ambar-osc)':'var(--verde)')+'">'+(gap>0?'+':'')+gap+'</span>':'')+'</td>'+
      '<td class="small">'+esc(per(c.capacitadorId).nombre)+'</td>'+
      '<td>'+(as.length? '<span class="tag t-'+(pct(si,as.length)>=80?'v':(pct(si,as.length)>=60?'a':'r'))+'">'+si+'/'+as.length+'</span>' : '<span class="muted small">—</span>')+'</td>'+
      '<td class="small">'+(t? esc(t.artefacto)+' ×'+t.nEntregas : '<span class="muted">—</span>')+'</td>'+
      '<td style="text-align:right;color:var(--tinta-3)">›</td></tr>';
  });
  out += '</tbody></table></div></div>';
  return out;
}

var CAP_ABIERTA = null;
function abrirCapacitacion(id){ CAP_ABIERTA=id; UI.tab.cap='datos'; pintarCapacitacion(); $('ovl').classList.add('on'); }
function C(){ return DB.capacitaciones.filter(function(x){return x.id===CAP_ABIERTA;})[0]; }
function setC(campo,val){ var c=C(); if(!c) return; c[campo]=val; guardar(); }
function setCR(campo,val){ setC(campo,val); pintarCapacitacion(); }
function tabCap(t){ UI.tab.cap=t; pintarCapacitacion(); }

function pintarCapacitacion(){
  var c=C(); if(!c) return;
  var t = UI.tab.cap||'datos';
  var h='<div class="mod"><div class="mod-top"><div class="mod-h"><div><h2>'+esc(tem(c.temaId).nombre)+'</h2>'+
    '<div class="sub">'+esc(cli(c.clienteId).nombre)+' · Sesión '+c.nSesion+' · '+fmtFecha(c.fecha)+' '+esc(c.hora)+'</div></div>'+
    '<button class="x" onclick="cerrarCap()">✕</button></div>';
  h+='<div class="mtabs">'+['datos|Sesión','tarea|Tarea','asis|Asistencia'].map(function(x){
      var p=x.split('|'); return '<button class="'+(t===p[0]?'on':'')+'" onclick="tabCap(\''+p[0]+'\')">'+p[1]+'</button>';
    }).join('')+'</div></div><div class="mod-b">';

  if(t==='datos'){
    h+='<div class="blk"><div class="bt"><span class="n">1</span>Datos de la sesión</div><div class="grid g2">'+
      '<div class="fld"><label>Empresa</label><select class="sel" onchange="setCR(\'clienteId\',this.value)">'+
        clientesEva().map(function(x){return '<option value="'+x.id+'"'+(c.clienteId===x.id?' selected':'')+'>'+esc(x.nombre)+'</option>';}).join('')+'</select></div>'+
      '<div class="fld"><label>No. de sesión</label><input class="inp" type="number" min="1" value="'+c.nSesion+'" onchange="setC(\'nSesion\',+this.value)"></div>'+
      '<div class="fld"><label>Fecha</label><input class="inp" type="date" value="'+esc(c.fecha)+'" onchange="moverCapacitacion(this.value)">'+
        (coacheoAnclado(c.id)? '<div class="hint">'+coacheoAnclado(c.id)+' sesiones de coacheo se recorren con esta fecha</div>':'')+
        (function(){
          var mal = DB.sesiones.filter(function(s){ return s.capacitacionId===c.id && s.estatus==='programada' && fueraDeVentana(s); }).length;
          return mal? '<div class="hint" style="color:var(--rojo);font-weight:600">'+mal+' coacheo'+(mal>1?'s':'')+' no cabe'+(mal>1?'n':'')+' antes de la siguiente capacitación</div>':'';
        })()+'</div>'+
      '<div class="fld"><label>Horario</label><input class="inp" type="time" value="'+esc(c.hora)+'" onchange="setC(\'hora\',this.value)"></div>'+
      '<div class="fld"><label>Duración programada (min)</label><input class="inp" type="number" step="15" value="'+c.durProg+'" onchange="setC(\'durProg\',+this.value)"></div>'+
      '<div class="fld"><label>Duración real (min)</label><input class="inp" type="number" step="5" value="'+(c.durReal==null?'':c.durReal)+'" onchange="setCR(\'durReal\',this.value===\'\'?null:+this.value)"></div>'+
      '<div class="fld"><label>Formato</label><select class="sel" onchange="setC(\'formato\',this.value)">'+
        FORMATOS.map(function(f){return '<option'+(c.formato===f?' selected':'')+'>'+f+'</option>';}).join('')+'</select></div>'+
      '<div class="fld"><label>Capacitador</label><select class="sel" onchange="setC(\'capacitadorId\',this.value)">'+
        personalActivo(c.capacitadorId).map(function(p){return '<option value="'+p.id+'"'+(c.capacitadorId===p.id?' selected':'')+'>'+esc(p.nombre)+(p.activo===false?' (inactivo)':'')+'</option>';}).join('')+'</select></div>'+
      '</div></div>';
    h+='<div class="blk"><div class="bt"><span class="n">2</span>Contenido</div><div class="grid g2">'+
      '<div class="fld"><label>Tema</label><select class="sel" onchange="setCR(\'temaId\',this.value)">'+
        DB.temas.map(function(x){return '<option value="'+x.id+'"'+(c.temaId===x.id?' selected':'')+'>'+esc(x.nombre)+'</option>';}).join('')+'</select></div>'+
      '<div class="fld"><label>Sub-tema</label><select class="sel" onchange="setC(\'subtema\',this.value)">'+
        subsDe(c.temaId).map(function(s){return '<option'+(c.subtema===s?' selected':'')+'>'+esc(s)+'</option>';}).join('')+(subsDe(c.temaId).indexOf(c.subtema)<0&&c.subtema?'<option selected>'+esc(c.subtema)+'</option>':'')+'</select></div></div>'+
      '<div class="fld" style="margin:0"><label>Alcances logrados</label><textarea class="ta" placeholder="Hasta dónde llegaron realmente en esta sesión" onchange="setC(\'alcances\',this.value)">'+esc(c.alcances||'')+'</textarea></div></div>';
    h+='<div class="fld"><label>Estatus</label><div class="seg">'+
      ['programada|Programada','realizada|Realizada','cancelada|Cancelada'].map(function(x){
        var p=x.split('|'); return '<button class="'+(c.estatus===p[0]?'on':'')+'" onclick="setCR(\'estatus\',\''+p[0]+'\')">'+p[1]+'</button>';
      }).join('')+'</div></div>';
  }

  if(t==='tarea'){
    var tr = tareaDe(c.id);
    if(!tr){
      h+='<div class="empty"><div class="big">📝</div><div class="ttl">Sin tarea asignada</div><div class="small mb">La tarea es lo que el coach revisa después. Sin tarea no hay qué coachear.</div>'+
         '<button class="btn amb mt" onclick="crearTarea()">Asignar tarea</button></div>';
    } else {
      h+='<div class="blk"><div class="bt"><span class="n">1</span>Qué tiene que practicar</div>'+
        '<div class="fld"><label>Descripción</label><textarea class="ta" onchange="setTarea(\''+tr.id+'\',\'descripcion\',this.value)">'+esc(tr.descripcion)+'</textarea></div>'+
        '<div class="grid g3">'+
        '<div class="fld"><label>Artefacto</label><select class="sel" onchange="setTarea(\''+tr.id+'\',\'artefacto\',this.value)">'+
          DB.artefactos.map(function(a){return '<option'+(tr.artefacto===a?' selected':'')+'>'+esc(a)+'</option>';}).join('')+'</select></div>'+
        '<div class="fld"><label>Veces que se envía</label><input class="inp" type="number" min="1" max="10" value="'+tr.nEntregas+'" onchange="setTarea(\''+tr.id+'\',\'nEntregas\',+this.value)"></div>'+
        '<div class="fld"><label>Días para entregar</label><input class="inp" type="number" min="1" value="'+(tr.diasLimite||7)+'" onchange="setDiasLimite(\''+tr.id+'\',+this.value)">'+
          '<div class="hint">Vence el '+fmtFecha(tr.fechaLimite)+'</div></div>'+
        '</div></div>';
      h+='<div class="blk"><div class="bt"><span class="n">2</span>Quién ya entregó</div><div class="tw"><table><thead><tr><th>Vendedor</th><th>Entregas</th><th>Avance</th></tr></thead><tbody>';
      DB.asistencias.filter(function(a){return a.capacitacionId===c.id && a.asistio;}).forEach(function(a){
        var n = DB.entregas.filter(function(e){return e.tareaId===tr.id && e.vendedorId===a.vendedorId;}).length;
        h+='<tr><td class="small"><b>'+esc(nomV(a.vendedorId))+'</b></td>'+
           '<td class="mono">'+n+'/'+tr.nEntregas+'</td>'+
           '<td><div class="bar '+semEntregas(n,tr.nEntregas)+'" style="margin:0;width:130px"><i style="width:'+Math.min(100,pct(n,tr.nEntregas))+'%"></i></div></td></tr>';
      });
      h+='</tbody></table></div></div>';
    }
  }

  if(t==='asis'){
    var vs = DB.vendedores.filter(function(v){return v.clienteId===c.clienteId;});
    h+='<div class="small muted mb">Marca quién sí tomó la sesión. Solo a ellos se les puede coachear este tema.</div>';
    vs.forEach(function(v){
      var a = DB.asistencias.filter(function(x){return x.capacitacionId===c.id && x.vendedorId===v.id;})[0];
      var asis = a? a.asistio : false;
      h+='<div class="blk" style="padding:12px"><div class="row"><label class="chk" style="margin:0;flex:1;border:none;padding:0;background:none">'+
        '<input type="checkbox" '+(asis?'checked':'')+' onchange="setAsistencia(\''+v.id+'\',this.checked)">'+
        '<div class="f"><div style="font-weight:600;font-size:13px">'+esc(v.nombre+' '+v.apellidos)+'</div><div class="small muted">'+esc(v.rol)+' · '+esc(v.sucursal)+'</div></div></label></div>';
      if(asis){
        h+='<div class="row mt-s wrap"><div class="small" style="min-width:120px;font-weight:600;color:var(--tinta-2)">Participación</div><div class="seg">'+
          [0,25,50,75,100].map(function(p){
            var cl = p>=75?'v':(p>=50?'a':'r');
            return '<button class="'+((a&&a.participacion===p)?'on '+cl:'')+'" onclick="setPart(\''+v.id+'\','+p+')">'+p+'%</button>';
          }).join('')+'</div></div>';
      } else if(a){
        h+='<div class="fld mt-s" style="margin:0"><label>Razón de inasistencia</label><input class="inp" value="'+esc(a.razon||'')+'" placeholder="Por qué no llegó" onchange="setRazon(\''+v.id+'\',this.value)"></div>';
      }
      h+='</div>';
    });
  }

  h+='</div><div class="mod-f"><button class="btn dgr" onclick="borrarCap()">Eliminar</button><div class="f"></div><button class="btn amb" onclick="cerrarCap()">Listo</button></div></div>';
  setHtml('modWrap',h);
}
function cerrarCap(){ CAP_ABIERTA=null; cerrarModal(); }
function setTarea(id,campo,val){ var t=DB.tareas.filter(function(x){return x.id===id;})[0]; if(t){ t[campo]=val; guardar(); pintarCapacitacion(); } }

/* mover la capacitación arrastra su tarea y sus coacheos anclados */
function moverCapacitacion(nueva){
  var c=C(); if(!c||!nueva) return;
  c.fecha = nueva;
  var t = tareaDe(c.id);
  if(t){ t.fechaLimite = dISO(new Date(parseISO(nueva).getTime() + (t.diasLimite||7)*86400000)); }
  var n = reprogramarCoacheo(c.id);
  /* las que no cupieron en la ventana nueva */
  var atoradas = DB.sesiones.filter(function(s){
    return s.capacitacionId===c.id && s.estatus==='programada' && fueraDeVentana(s);
  }).length;
  guardar(); pintarCapacitacion();
  if(atoradas) toast('⚠️ '+atoradas+' coacheo'+(atoradas>1?'s':'')+' no cabe'+(atoradas>1?'n':'')+' en el hueco nuevo');
  else toast(n? 'Se recorrieron '+n+' sesiones de coacheo' : 'Fecha actualizada');
}
function setDiasLimite(id, dias){
  var t=DB.tareas.filter(function(x){return x.id===id;})[0]; if(!t) return;
  t.diasLimite = dias;
  var c = capa(t.capacitacionId);
  if(c) t.fechaLimite = dISO(new Date(parseISO(c.fecha).getTime() + dias*86400000));
  var n = t.capacitacionId ? reprogramarCoacheo(t.capacitacionId) : 0;
  guardar(); pintarCapacitacion();
  if(n) toast('Se recorrieron '+n+' sesiones de coacheo');
}
function crearTarea(){
  var c=C(); if(!c) return;
  DB.tareas.push({id:uid(), capacitacionId:c.id, descripcion:'', artefacto:DB.artefactos[0], nEntregas:3, diasLimite:7, fechaLimite:dISO(new Date(parseISO(c.fecha).getTime()+7*86400000))});
  guardar(); pintarCapacitacion();
}
function setAsistencia(vid, ok){
  var c=C(); if(!c) return;
  var a = DB.asistencias.filter(function(x){return x.capacitacionId===c.id && x.vendedorId===vid;})[0];
  if(!a){ a={id:uid(), capacitacionId:c.id, vendedorId:vid, asistio:ok, razon:'', participacion:ok?75:0}; DB.asistencias.push(a); }
  else { a.asistio=ok; if(!ok) a.participacion=0; }
  guardar(); pintarCapacitacion();
}
function setPart(vid,p){
  var c=C(); var a=DB.asistencias.filter(function(x){return x.capacitacionId===c.id && x.vendedorId===vid;})[0];
  if(a){ a.participacion=p; guardar(); pintarCapacitacion(); }
}
function setRazon(vid,txt){
  var c=C(); var a=DB.asistencias.filter(function(x){return x.capacitacionId===c.id && x.vendedorId===vid;})[0];
  if(a){ a.razon=txt; guardar(); }
}
function borrarCap(){
  var c=C(); if(!c) return;
  var ligadas = DB.sesiones.filter(function(s){return s.capacitacionId===c.id;});
  var prog = ligadas.filter(function(s){return s.estatus==='programada';});
  if(prog.length && !confirm('Esta capacitación tiene '+prog.length+' sesiones de coacheo agendadas.\n\nSe van a eliminar junto con ella. Las ya realizadas se conservan sin el vínculo.\n\n¿Continuamos?')) return;
  DB.capacitaciones = DB.capacitaciones.filter(function(x){return x.id!==c.id;});
  DB.tareas = DB.tareas.filter(function(t){return t.capacitacionId!==c.id;});
  DB.asistencias = DB.asistencias.filter(function(a){return a.capacitacionId!==c.id;});
  /* las programadas se van, las realizadas se quedan sin vínculo */
  DB.sesiones = DB.sesiones.filter(function(s){ return !(s.capacitacionId===c.id && s.estatus==='programada'); });
  DB.sesiones.forEach(function(s){ if(s.capacitacionId===c.id){ s.capacitacionId=null; s.anclada=false; } });
  guardar(); cerrarCap();
  toast('Capacitación eliminada'+(prog.length? ' y '+prog.length+' coacheos':''));
}
function nuevaCapacitacion(){
  var cid = UI.cliente!=='*' ? UI.cliente : (DB.programas[0]||{}).clienteId;
  var id = uid();
  var n = DB.capacitaciones.filter(function(c){return c.clienteId===cid;}).length + 1;
  DB.capacitaciones.push({id:id, programaId:progId(cid), clienteId:cid, temaId:DB.temas[0].id, nSesion:n, fecha:hoyISO(), hora:'10:00',
    durProg:90, durReal:null, formato:'En línea', capacitadorId:'p3', subtema:(subsDe(DB.temas[0].id)[0]||''),
    alcances:'', estatus:'programada'});
  DB.tareas.push({id:uid(), capacitacionId:id, descripcion:'', artefacto:DB.artefactos[0], nEntregas:3, diasLimite:7, fechaLimite:masDias(7)});
  guardar(); abrirCapacitacion(id);
}
/* ============================================================
   ASISTENTE · aplicar un tema completo a una empresa
   ============================================================ */
var APLICAR = null;

function aplicarTema(temaId){
  var t = tem(temaId); if(!t || !t.subtemas.length) return;
  var cid = UI.cliente!=='*' ? UI.cliente : (DB.programas[0]||{}).clienteId;
  var capa = DB.personal.filter(function(p){return p.rol==='Capacitador' && p.activo!==false;})[0]
          || DB.personal.filter(function(p){return p.activo!==false;})[0] || DB.personal[0];
  APLICAR = {
    temaId: temaId,
    clienteId: cid,
    capacitadorId: capa.id,
    inicio: masDias(7),
    hora: '10:00',
    genCoacheo: true,
    cadencia: t.cadencia||7,
    saltarFinde: true,
    abierta: -1,
    filas: t.subtemas.map(function(s){
      return { subtema:subN(s), durProg:s.durProg||90, formato:s.formato||'En línea',
               tareaDesc:s.tareaDesc||'', artefacto:s.artefacto||DB.artefactos[0],
               nEntregas:s.nEntregas||3, diasLimite:s.diasLimite||7,
               incluir:true, fecha:'', hora:'' };
    })
  };
  autollenar();
  TEMA_ABIERTO=null; SUB_ABIERTO=-1;
  pintarAplicar();
  $('ovl').classList.add('on');
}

function autollenar(){
  if(!APLICAR) return;
  var d = parseISO(APLICAR.inicio);
  if(!d) return;
  var k = 0;
  APLICAR.filas.forEach(function(f){
    if(!f.incluir){ f.fecha=''; f.hora=''; return; }
    var fx = new Date(d);
    fx.setDate(d.getDate() + k*APLICAR.cadencia);
    if(APLICAR.saltarFinde){
      while(fx.getDay()===0 || fx.getDay()===6) fx.setDate(fx.getDate()+1);
    }
    f.fecha = dISO(fx);
    f.hora = APLICAR.hora;
    k++;
  });
}
function setAp(campo,val){
  if(!APLICAR) return;
  APLICAR[campo]=val;
  if(campo==='inicio'||campo==='cadencia'||campo==='hora'||campo==='saltarFinde') autollenar();
  pintarAplicar();
}
function setFila(i,campo,val){
  if(!APLICAR||!APLICAR.filas[i]) return;
  APLICAR.filas[i][campo]=val;
  if(campo==='incluir') autollenar();
  pintarAplicar();
}
function toggleFila(i){ APLICAR.abierta = (APLICAR.abierta===i? -1 : i); pintarAplicar(); }

function pintarAplicar(){
  var a = APLICAR; if(!a) return;
  var t = tem(a.temaId);
  var cl = cli(a.clienteId);
  var vs = DB.vendedores.filter(function(v){return v.clienteId===a.clienteId;});
  var incl = a.filas.filter(function(f){return f.incluir;});
  var listas = incl.filter(function(f){return !!f.fecha;}).length;
  var minutos = incl.reduce(function(x,f){return x+(f.durProg||0);},0);

  var h='<div class="mod"><div class="mod-h">'+
    '<div class="av-c" style="background:'+cl.color+'">'+esc(cl.nombre.slice(0,2))+'</div>'+
    '<div><h2>Aplicar “'+esc(t.nombre)+'”</h2><div class="sub">'+incl.length+' de '+a.filas.length+' sesiones · '+esc(cl.nombre)+' · '+vs.length+' vendedores</div></div>'+
    '<button class="x" onclick="cancelarAplicar()">✕</button></div><div class="mod-b">';

  /* paso 1 */
  h+='<div class="blk"><div class="bt"><span class="n">1</span>Dónde y cuándo arranca</div><div class="grid g2">'+
    '<div class="fld"><label>Empresa</label><select class="sel" onchange="setAp(\'clienteId\',this.value)">'+
      clientesEva().map(function(x){return '<option value="'+x.id+'"'+(a.clienteId===x.id?' selected':'')+'>'+esc(x.nombre)+'</option>';}).join('')+'</select></div>'+
    '<div class="fld"><label>Capacitador</label><select class="sel" onchange="setAp(\'capacitadorId\',this.value)">'+
      personalActivo(a.capacitadorId).map(function(p){return '<option value="'+p.id+'"'+(a.capacitadorId===p.id?' selected':'')+'>'+esc(p.nombre)+(p.activo===false?' (inactivo)':'')+'</option>';}).join('')+'</select></div>'+
    '<div class="fld"><label>Primera sesión</label><input class="inp" type="date" value="'+esc(a.inicio)+'" onchange="setAp(\'inicio\',this.value)"></div>'+
    '<div class="fld"><label>Hora</label><input class="inp" type="time" value="'+esc(a.hora)+'" onchange="setAp(\'hora\',this.value)"></div>'+
    '</div>'+
    '<div class="row wrap" style="gap:14px">'+
      '<div class="row" style="gap:8px"><span class="small" style="font-weight:700;color:var(--tinta-2)">Repetir cada</span>'+
      '<input class="inp mono" style="width:64px;padding:5px 8px" type="number" min="1" value="'+a.cadencia+'" onchange="setAp(\'cadencia\',+this.value)">'+
      '<span class="small muted">días</span></div>'+
      '<label class="row small" style="gap:7px;cursor:pointer;font-weight:600;color:var(--tinta-2)">'+
        '<input type="checkbox" style="width:15px;height:15px;accent-color:var(--electrico)" '+(a.saltarFinde?'checked':'')+' onchange="setAp(\'saltarFinde\',this.checked)">Saltar sábados y domingos</label>'+
      '<button class="btn gho sm" style="margin-left:auto" onclick="autollenar();pintarAplicar();toast(\'Fechas regeneradas\')">↻ Regenerar fechas</button>'+
    '</div></div>';

  /* paso 2 */
  h+='<div class="blk"><div class="row spread mb"><div class="bt" style="margin:0"><span class="n">2</span>Ajusta fecha y hora</div>'+
     '<span class="tag t-'+(listas===incl.length&&incl.length?'v':'a')+'">'+listas+' de '+incl.length+' con fecha</span></div>'+
     '<div class="small muted mb">Ya vienen calculadas. Desmarca las que no vayas a dar, y el <b>✎</b> abre los demás campos.</div>';

  a.filas.forEach(function(f,i){
    var abierta = a.abierta===i;
    var dd = f.fecha? parseISO(f.fecha) : null;
    var finde = dd && (dd.getDay()===0||dd.getDay()===6);
    var op = f.incluir? '' : 'opacity:.5;';
    h+='<div style="border:1.5px solid '+(abierta?'var(--electrico)':'var(--linea)')+';border-radius:11px;padding:11px;margin-bottom:8px;background:var(--blanco);'+op+'">'+
      '<div class="row wrap" style="gap:9px">'+
        '<input type="checkbox" style="width:16px;height:16px;accent-color:var(--electrico);flex:0 0 auto" '+(f.incluir?'checked':'')+' onchange="setFila('+i+',\'incluir\',this.checked)" title="Incluir esta sesión">'+
        '<div class="f" style="min-width:130px"><div style="font-weight:600;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(f.subtema)+'</div>'+
          '<div class="small muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+f.durProg+'′ · '+esc(f.formato)+(f.tareaDesc?'':' · <b style="color:var(--naranja)">sin tarea</b>')+'</div></div>'+
        (f.incluir? '<input class="inp" type="date" style="width:150px" value="'+esc(f.fecha)+'" onchange="setFila('+i+',\'fecha\',this.value)">'+
                    '<input class="inp" type="time" style="width:105px" value="'+esc(f.hora)+'" onchange="setFila('+i+',\'hora\',this.value)">'
                  : '<span class="tag t-n" style="margin-left:auto">No se agenda</span>')+
        '<button class="btn '+(abierta?'':'gho')+' sm" onclick="toggleFila('+i+')" title="Editar los demás campos" style="flex:0 0 auto">✎</button>'+
      '</div>';
    if(f.incluir && f.fecha) h+='<div class="small '+(finde?'':'muted')+'" style="margin-top:5px;padding-left:26px;'+(finde?'color:var(--ambar-osc);font-weight:700':'')+'">'+fmtLargo(f.fecha)+(finde?' · cae en fin de semana':'')+'</div>';

    if(abierta){
      h+='<div style="border-top:1px solid var(--linea);margin-top:11px;padding-top:11px">'+
        '<div class="grid g2">'+
          '<div class="fld"><label>Sub-tema</label><input class="inp" value="'+esc(f.subtema)+'" onchange="setFila('+i+',\'subtema\',this.value)"></div>'+
          '<div class="fld"><label>Duración (min)</label><input class="inp" type="number" step="15" value="'+f.durProg+'" onchange="setFila('+i+',\'durProg\',+this.value)"></div>'+
          '<div class="fld"><label>Formato</label><select class="sel" onchange="setFila('+i+',\'formato\',this.value)">'+
            FORMATOS.map(function(x){return '<option'+(f.formato===x?' selected':'')+'>'+x+'</option>';}).join('')+'</select></div>'+
          '<div class="fld"><label>Artefacto</label><select class="sel" onchange="setFila('+i+',\'artefacto\',this.value)">'+
            DB.artefactos.map(function(x){return '<option'+(f.artefacto===x?' selected':'')+'>'+esc(x)+'</option>';}).join('')+'</select></div>'+
        '</div>'+
        '<div class="fld"><label>Tarea</label><textarea class="ta" style="min-height:46px" placeholder="Qué va a practicar" onchange="setFila('+i+',\'tareaDesc\',this.value)">'+esc(f.tareaDesc||'')+'</textarea></div>'+
        '<div class="grid g2">'+
          '<div class="fld" style="margin:0"><label>Veces que se envía</label><input class="inp" type="number" min="1" value="'+f.nEntregas+'" onchange="setFila('+i+',\'nEntregas\',+this.value)"></div>'+
          '<div class="fld" style="margin:0"><label>Días para entregar</label><input class="inp" type="number" min="1" value="'+f.diasLimite+'" onchange="setFila('+i+',\'diasLimite\',+this.value)"></div>'+
        '</div>'+
        '<div class="small muted">Este cambio aplica solo a esta empresa. El tema del catálogo no se modifica.</div>'+
        '</div>';
    }
    h+='</div>';
  });
  h+='</div>';

  /* paso 3: coacheo 1 a 1 */
  var nCoach = incl.length * vs.length;
  h+='<div class="blk"><div class="bt"><span class="n">3</span>Sesiones de coacheo 1 a 1</div>'+
    '<label class="chk" style="margin:0"><input type="checkbox" '+(a.genCoacheo?'checked':'')+' onchange="setAp(\'genCoacheo\',this.checked)">'+
    '<div class="f"><div style="font-weight:600;font-size:13px">Agendar tambi\u00e9n el seguimiento de cada vendedor</div>'+
    '<div class="small muted">'+(vs.length
      ? nCoach+' sesiones ('+incl.length+' rondas \u00d7 '+vs.length+' vendedores). Cada una cae despu\u00e9s de que vence la tarea, en el d\u00eda y hora fijos del vendedor.'
      : 'Esta empresa no tiene vendedores todav\u00eda.')+'</div></div></label>';
  if(a.genCoacheo && vs.length && incl.length){
    var conF = incl.filter(function(f){return !!f.fecha;});
    if(conF.length>1){
      h+='<div class="small muted mt-s">Cada coacheo cae <b>en el hueco</b> entre su capacitaci\u00f3n y la siguiente, en un d\u00eda que el vendedor tenga disponible.</div>';
      /* aviso de vendedores sin d\u00edas marcados */
      var sinDias = vs.filter(function(v){ return !diasDe(v).length; });
      if(sinDias.length) h+='<div class="small mt-s" style="color:var(--ambar-osc);font-weight:600">'+sinDias.length+' vendedores no tienen d\u00edas marcados en su ficha.</div>';
    }
    h+='<div class="small muted mt-s">Si despu\u00e9s mueves una capacitaci\u00f3n, estas sesiones se recorren solas. Los d\u00edas que tengas bloqueados se esquivan solos.</div>';
  }
  h+='</div>';

  /* resumen */
  var conFecha = incl.filter(function(f){return !!f.fecha;});
  var ult = conFecha[conFecha.length-1];
  var sinTarea = incl.filter(function(f){return !String(f.tareaDesc||'').trim();}).length;
  var ok = incl.length>0 && listas===incl.length;
  h+='<div class="lock '+(ok?'ok':'wt')+'"><div class="ico">'+(ok?'✓':'⚠️')+'</div><div class="f">'+
    '<div class="ttl">'+(incl.length===0 ? 'No hay ninguna sesión seleccionada'
      : ok ? 'Se van a crear '+incl.length+' capacitaciones con su tarea'
           : 'Faltan '+(incl.length-listas)+' fechas por definir')+'</div>'+
    '<div class="txt">'+esc(cl.nombre)+(conFecha.length? ' · del '+fmtFecha(conFecha[0].fecha)+' al '+fmtFecha(ult.fecha):'')+
    ' · '+min2hhmm(minutos)+' de contenido'+
    (vs.length? ' · asistencia para '+vs.length+' vendedores' : ' · esta empresa aún no tiene vendedores')+
    (a.genCoacheo && vs.length? ' · <b>+'+(incl.length*vs.length)+' sesiones de coacheo</b>':'')+
    (sinTarea? ' · <b>'+sinTarea+' sin tarea definida</b>':'')+'</div></div></div>';

  h+='</div><div class="mod-f"><button class="btn gho" onclick="cancelarAplicar()">Cancelar</button><div class="f"></div>'+
    '<button class="btn amb" onclick="confirmarAplicar()"'+(!ok?' disabled':'')+'>Crear '+incl.length+' capacitaciones'+(a.genCoacheo&&vs.length? ' + '+(incl.length*vs.length)+' coacheos':'')+'</button></div></div>';
  setHtml('modWrap',h);
}

function cancelarAplicar(){ APLICAR=null; cerrarModal(); }

function confirmarAplicar(){
  var a=APLICAR; if(!a) return;
  var base = DB.capacitaciones.filter(function(k){return k.clienteId===a.clienteId;}).length;
  var vs = DB.vendedores.filter(function(v){return v.clienteId===a.clienteId && v.activo!==false;});
  var coach = (evaCfg(a.clienteId)||{}).coachId
           || ((DB.personal.filter(function(p){return p.rol==='Coach de ventas' && p.activo!==false;})[0]||{}).id)
           || UI.user;
  var creadas=0, coacheos=0, nuevas=[];
  /* cuántas sesiones lleva ya cada vendedor, para numerar bien */
  var ronda = {};
  vs.forEach(function(v){ ronda[v.id] = DB.sesiones.filter(function(s){return s.vendedorId===v.id;}).length; });

  a.filas.forEach(function(f){
    if(!f.incluir || !f.fecha) return;
    var id = uid();
    DB.capacitaciones.push({ id:id, programaId:progId(a.clienteId), clienteId:a.clienteId, temaId:a.temaId,
      nSesion: base+creadas+1, fecha:f.fecha, hora:f.hora||'10:00', durProg:f.durProg, durReal:null,
      formato:f.formato, capacitadorId:a.capacitadorId, subtema:f.subtema, alcances:'', estatus:'programada' });
    DB.tareas.push({ id:uid(), capacitacionId:id, descripcion:f.tareaDesc||'',
      artefacto:f.artefacto, nEntregas:f.nEntregas, diasLimite:f.diasLimite||7,
      fechaLimite: dISO(new Date(parseISO(f.fecha).getTime() + (f.diasLimite||7)*86400000)) });
    creadas++;

    if(a.genCoacheo){
      vs.forEach(function(v){
        ronda[v.id]++;
        DB.sesiones.push({ id:uid(), programaId:progId(a.clienteId), clienteId:a.clienteId, vendedorId:v.id, coachId:coach,
          nSesion: ronda[v.id], capacitacionId:id, anclada:true, motivoCambio:'',
          fechaProg: '', horaProg: v.horaSesion||'09:00',
          durProg:30, estatus:'programada', horaIni:'', horaFin:'', mjs:null, llamadas:null,
          crmEstatus:'', crmShot:'', crmNota:'', descubrimientos:'', obstaculos:'', retro:'',
          minutaUrl:'', notas:'', capturadaEl:'' });
        coacheos++;
        nuevas.push(DB.sesiones[DB.sesiones.length-1]);
      });
    }
  });
  /* las fechas se calculan al final, cuando ya existen todas las capacitaciones
     y por tanto se conocen las ventanas entre una y la siguiente */
  var sinFecha = 0, sobreBloqueo = 0;
  nuevas.forEach(function(s){
    s.fechaProg = fechaCoacheo(s.capacitacionId, s.vendedorId, s.coachId);
    if(sinHueco(s.capacitacionId, s.vendedorId)) sinFecha++;
    if(sesionBloqueada(s)) sobreBloqueo++;
  });
  guardar();
  var nom = cli(a.clienteId).nombre;
  APLICAR=null; cerrarModal();
  toast('\u2713 '+creadas+' capacitaciones'+(coacheos? ' y '+coacheos+' coacheos':'')+' para '+nom+
        (sinFecha? ' \u00b7 \u26a0\ufe0f '+sinFecha+' sin d\u00eda disponible':'')+
        (sobreBloqueo? ' \u00b7 \ud83d\udd12 '+sobreBloqueo+' sobre tiempo bloqueado':''));
}
/* ============================================================
   VISTA · VENDEDORES
   ============================================================ */
function vistaVendedores(){
  var vs = fc(DB.vendedores);
  var out = '<div class="row spread wrap mb"><div class="eyebrow">Tarjeta de cada vendedor en el programa</div>'+
    '<button class="btn amb" onclick="nuevoVendedor()">+ Alta de vendedor</button></div>';
  out += '<div class="card"><div class="tw"><table><thead><tr>'+
    '<th>Vendedor</th><th>Empresa</th><th>Rol</th><th>Asistencia</th><th>Tarea</th><th>Compromisos</th><th>Evaluación</th><th>Próxima sesión</th><th></th></tr></thead><tbody>';
  if(!vs.length) out += '<tr><td colspan="9">'+vacio('👥','Sin vendedores','Da de alta al primero.')+'</td></tr>';
  vs.forEach(function(v){
    var f = fichaVendedor(v.id);
    var ev0 = f.evs[0], ev1 = f.evs[f.evs.length-1];
    out += '<tr class="clik" onclick="abrirVendedor(\''+v.id+'\')">'+
      '<td><div class="row" style="gap:9px">'+avatarV(v.id)+'<div><b>'+esc(v.nombre+' '+v.apellidos)+'</b><div class="small muted">'+esc(v.sucursal)+'</div></div></div></td>'+
      '<td>'+chipCliente(v.clienteId)+'</td>'+
      '<td class="small">'+esc(v.rol)+'</td>'+
      '<td><span class="tag t-'+(f.pctAsist>=80?'v':(f.pctAsist>=60?'a':'r'))+'">'+f.pctAsist+'%</span></td>'+
      '<td><span class="tag t-'+semEntregas(f.entHec,f.entReq)+'">'+f.entHec+'/'+f.entReq+'</span></td>'+
      '<td class="small">'+(f.comp? '<span class="tag t-'+(f.pctComp>=70?'v':(f.pctComp>=40?'a':'r'))+'">'+f.pctComp+'%</span>'+(f.vencidos?' <span class="tag t-r">'+f.vencidos+' venc.</span>':'') : '<span class="muted">—</span>')+'</td>'+
      '<td class="mono small">'+(ev0? ev0.puntaje+(f.avance!=null?' → '+ev1.puntaje+' <span style="color:'+(f.avance>=0?'var(--verde)':'var(--rojo)')+'">'+(f.avance>0?'+':'')+f.avance+'</span>':'') : '<span class="muted">—</span>')+'</td>'+
      '<td class="small">'+(f.proxima? esc(fmtFecha(f.proxima.fechaProg))+' '+esc(f.proxima.horaProg) : '<span class="muted">sin agendar</span>')+'</td>'+
      '<td style="text-align:right;color:var(--tinta-3)">›</td></tr>';
  });
  out += '</tbody></table></div></div>';
  return out;
}

function abrirVendedor(vid){ UI.vendedorAbierto=vid; UI.tab.ven='resumen'; pintarVendedor(); $('ovl').classList.add('on'); }
function tabVen(t){ UI.tab.ven=t; pintarVendedor(); }
function V(){ return DB.vendedores.filter(function(x){return x.id===UI.vendedorAbierto;})[0]; }
function setV(campo,val){ var v=V(); if(v){ v[campo]=val; guardar(); } }

function pintarVendedor(){
  var v=V(); if(!v) return;
  var f = fichaVendedor(v.id);
  var t = UI.tab.ven||'resumen';
  var h='<div class="mod wide"><div class="mod-top"><div class="mod-h">'+avatarV(v.id)+
    '<div><h2>'+esc(v.nombre+' '+v.apellidos)+'</h2><div class="sub">'+esc(cli(v.clienteId).nombre)+' · '+esc(v.rol)+' · '+esc(v.sucursal)+'</div></div>'+
    '<button class="x" onclick="cerrarModal()">✕</button></div>';
  h+='<div class="mtabs">'+['resumen|Resumen','metas|Metas del año','historial|Historial','datos|Ficha'].map(function(x){
      var p=x.split('|'); return '<button class="'+(t===p[0]?'on':'')+'" onclick="tabVen(\''+p[0]+'\')">'+p[1]+'</button>';
    }).join('')+'</div></div><div class="mod-b">';

  if(t==='resumen'){
    h+='<div class="grid g4 mb">'+
      kpi('Asistencia', f.pctAsist,'%', f.asistio+' de '+f.asistencias+' capacitaciones', f.pctAsist, f.pctAsist>=80?'v':'a')+
      kpi('Tarea entregada', f.pctEnt,'%', f.entHec+' de '+f.entReq+' evidencias', f.pctEnt, f.pctEnt>=80?'v':(f.pctEnt>=50?'a':'r'))+
      kpi('Avance en compromisos', f.avgAvance,'%', f.compCumplidos+' al 100%'+(f.vencidos?' · '+f.vencidos+' vencidos':''), f.avgAvance, compSem(f.avgAvance))+
      kpi('Evidencias reales', f.mjs+f.llamadas,'', f.mjs+' mensajes · '+f.llamadas+' llamadas', null)+
      '</div>';

    /* ánimo a lo largo del tiempo */
    if(f.animosHist && f.animosHist.length){
      var act = animo(f.animoAct);
      h+='<div class="blk"><div class="row spread mb"><div class="bt" style="margin:0">Cómo se ha sentido</div>'+
        '<span class="tag t-n">promedio '+f.animoProm.toFixed(1)+'/5</span></div>'+
        '<div class="small muted mb">El ánimo va aparte del avance. Sirve para ver si el programa lo está desgastando o levantando.</div>'+
        '<div class="row wrap" style="gap:5px;align-items:flex-end">';
      f.animosHist.slice(-14).forEach(function(c){
        var a = animo(c.animo);
        h+='<div style="text-align:center" title="'+esc(fmtFecha(c.fecha))+' · '+esc(a.l)+'">'+
          '<div style="font-size:19px;line-height:1.1">'+a.ic+'</div>'+
          '<div class="small muted mono" style="font-size:9px">'+esc(fmtFecha(c.fecha).split(' ').slice(1).join(' '))+'</div></div>';
      });
      h+='</div>'+
        (act? '<div class="small mt">Lo más reciente: <b>'+act.ic+' '+esc(act.l)+'</b></div>':'')+
        (f.desvProm!=='0'? '<div class="small muted mt-s">Cuando se atrasa, lo hace '+f.desvProm+' días en promedio.</div>':'')+
        '</div>';
    }

    /* progreso de evaluación */
    h+='<div class="blk"><div class="bt">Evolución de la evaluación</div>';
    if(!f.evs.length) h+='<div class="muted small">Sin evaluaciones registradas.</div>';
    else{
      f.evs.forEach(function(e){
        h+='<div class="row mb" style="gap:12px"><div class="small" style="width:110px"><b>'+esc(e.tipo)+'</b><div class="muted">'+fmtFecha(e.fecha)+'</div></div>'+
          '<div class="f"><div class="bar '+(e.puntaje>=70?'v':(e.puntaje>=50?'a':'r'))+'" style="margin:0"><i style="width:'+e.puntaje+'%"></i></div></div>'+
          '<div class="mono" style="font-weight:700;width:38px;text-align:right">'+e.puntaje+'</div></div>';
      });
      if(f.avance!=null) h+='<div class="small mt" style="color:'+(f.avance>=0?'var(--verde)':'var(--rojo)')+';font-weight:700">'+(f.avance>0?'+':'')+f.avance+' puntos desde el diagnóstico</div>';
    }
    h+='</div>';

    /* temas vistos */
    h+='<div class="blk"><div class="bt">Temas que ya tomó</div><div class="small muted mb">El coach solo puede aterrizar la retro sobre esto.</div>';
    var ks = Object.keys(f.temasVistos);
    if(!ks.length) h+='<div class="muted small">Todavía no asiste a ninguna capacitación.</div>';
    ks.forEach(function(k){
      h+='<div class="row mb" style="align-items:flex-start"><div style="width:190px;font-weight:600;font-size:13px">'+esc(tem(k).nombre)+'</div>'+
        '<div class="f row wrap" style="gap:5px">'+f.temasVistos[k].map(function(s){return '<span class="tag t-e">'+esc(s)+'</span>';}).join('')+'</div></div>';
    });
    h+='</div>';
  }

  if(t==='metas'){
    h+='<div class="row spread mb"><div class="small muted">Las metas cambian por mes, bimestre o trimestre. Aquí se agenda todo el año.</div>'+
       '<button class="btn amb sm" onclick="nuevaMeta()">+ Agregar meta</button></div>';
    var ms = DB.metas.filter(function(m){return m.vendedorId===v.id;}).sort(function(a,b){return a.periodo<b.periodo?-1:1;});
    if(!ms.length) h+=vacio('🎯','Sin metas cargadas','Agrega la primera meta del periodo.');
    else{
      h+='<div class="tw"><table><thead><tr><th>Periodo</th><th>Tipo</th><th>Concepto</th><th>Meta</th><th>Real</th><th>Avance</th><th></th></tr></thead><tbody>';
      ms.forEach(function(m){
        var tm = TIPOS_META.filter(function(x){return x.v===m.tipo;})[0]||{l:m.tipo,u:''};
        var p = pct(m.real, m.meta);
        h+='<tr><td class="mono small"><b>'+esc(m.periodo)+'</b></td><td class="small">'+esc(m.periodoTipo)+'</td>'+
          '<td>'+esc(tm.l)+'</td>'+
          '<td class="mono small">'+(tm.u==='$'?'$'+num(m.meta):m.meta+(tm.u==='%'?'%':''))+'</td>'+
          '<td><input class="inp mono" style="width:110px;padding:4px 7px" type="number" value="'+m.real+'" onchange="setMeta(\''+m.id+'\',\'real\',+this.value)"></td>'+
          '<td style="min-width:130px"><div class="row" style="gap:8px"><div class="bar '+(p>=90?'v':(p>=60?'a':'r'))+'" style="margin:0;flex:1"><i style="width:'+Math.min(100,p)+'%"></i></div><span class="mono small" style="width:34px">'+p+'%</span></div></td>'+
          '<td><button class="btn gho sm" onclick="borrarMeta(\''+m.id+'\')">✕</button></td></tr>';
      });
      h+='</tbody></table></div>';
    }
  }

  if(t==='historial'){
    var ses = DB.sesiones.filter(function(s){return s.vendedorId===v.id && s.estatus==='realizada';})
      .sort(function(a,b){return a.fechaProg<b.fechaProg?1:-1;});
    if(!ses.length) h+=vacio('🎧','Sin sesiones aún','El historial se llena conforme el coach captura.');
    ses.forEach(function(s){
      var g=gapSesion(s), q=calificaSesion(s);
      h+='<div class="blk"><div class="row spread mb"><div><b>Sesión '+s.nSesion+'</b> <span class="muted small">· '+fmtFecha(s.fechaProg)+'</span></div>'+
        '<div class="row" style="gap:6px">'+(g?'<span class="tag t-n mono">'+g.real+'′ ('+(g.gap>0?'+':'')+g.gap+')</span>':'')+
        (q?'<span class="tag t-'+(q.total>=85?'v':'a')+'">'+q.total+'/100</span>':'')+
        '<button class="btn gho sm" onclick="abrirSesion(\''+s.id+'\')">Abrir</button></div></div>';
      if(s.descubrimientos) h+='<div class="small mb"><b>Descubrió:</b> '+esc(s.descubrimientos)+'</div>';
      if(s.retro) h+='<div class="small mb"><b>Retro:</b> '+esc(s.retro)+'</div>';
      if(s.obstaculos) h+='<div class="small mb"><b>Obstáculo:</b> '+esc(s.obstaculos)+'</div>';
      var cs = DB.compromisos.filter(function(c){return c.sesionId===s.id;});
      if(cs.length){
        h+='<div class="small muted" style="margin-top:6px">Compromisos:</div>';
        cs.forEach(function(c){
          var e=COMP_EST[c.estatus]||COMP_EST.pendiente;
          h+='<div class="row small" style="padding:4px 0"><span class="dot d-'+(e.c==='n'?'n':e.c)+'"></span><div class="f">'+esc(c.descripcion)+'</div><span class="muted mono">'+fmtFecha(c.fecha)+'</span></div>';
        });
      }
      h+='</div>';
    });
  }

  if(t==='datos'){
    h+='<div class="blk"><div class="bt">Ficha</div><div class="grid g2">'+
      '<div class="fld"><label>Nombre</label><input class="inp" value="'+esc(v.nombre)+'" onchange="setV(\'nombre\',this.value)"></div>'+
      '<div class="fld"><label>Apellidos</label><input class="inp" value="'+esc(v.apellidos)+'" onchange="setV(\'apellidos\',this.value)"></div>'+
      '<div class="fld"><label>Empresa</label><select class="sel" onchange="setV(\'clienteId\',this.value)">'+
        clientesEva().map(function(c){return '<option value="'+c.id+'"'+(v.clienteId===c.id?' selected':'')+'>'+esc(c.nombre)+'</option>';}).join('')+'</select></div>'+
      '<div class="fld"><label>Rol / cargo</label><input class="inp" value="'+esc(v.rol)+'" onchange="setV(\'rol\',this.value)"></div>'+
      '<div class="fld"><label>Sucursal</label><input class="inp" value="'+esc(v.sucursal)+'" onchange="setV(\'sucursal\',this.value)"></div>'+
      '<div class="fld"><label>Fecha de nacimiento</label><input class="inp" type="date" value="'+esc(v.nac)+'" onchange="setV(\'nac\',this.value)"></div>'+
      '<div class="fld"><label>Ingreso a la empresa</label><input class="inp" type="date" value="'+esc(v.ingreso)+'" onchange="setV(\'ingreso\',this.value)"><div class="hint">Antigüedad: '+(v.ingreso? (Math.abs(difDias(hoyISO(),v.ingreso))/365).toFixed(1)+' años':'—')+'</div></div>'+
      '<div class="fld"><label>Hora de sesión</label><input class="inp" type="time" value="'+esc(v.horaSesion||'')+'" onchange="setV(\'horaSesion\',this.value)"></div>'+
      '</div>'+
      '<div class="fld" style="margin-bottom:0"><label>Días que puede verse con el coach</label>'+
      '<div class="small muted mb">Puedes marcar varios. El coacheo se agenda en el primero que caiga antes de la siguiente capacitación.</div>'+
      '<div class="seg">'+DIAS_LAB.map(function(d){
        var on = diasDe(v).indexOf(d.v)>=0;
        return '<button class="'+(on?'on':'')+'" onclick="toggleDia('+d.v+')">'+d.l+'</button>';
      }).join('')+'</div>'+
      (diasDe(v).length? '<div class="small muted mt-s">Disponible: <b>'+nombraDias(v)+'</b> a las '+esc(v.horaSesion||'09:00')+'</div>'
                       : '<div class="small mt-s" style="color:var(--rojo);font-weight:600">Sin días marcados no se le puede agendar coacheo.</div>')+
      '</div></div>';
    h+='<div class="blk"><div class="bt">Evaluaciones</div>';
    f.evs.forEach(function(e){
      h+='<div class="row mb"><div class="small f"><b>'+esc(e.tipo)+'</b> · '+fmtFecha(e.fecha)+'</div>'+
        '<input class="inp mono" style="width:90px;padding:4px 7px" type="number" min="0" max="100" value="'+e.puntaje+'" onchange="setEval(\''+e.id+'\',+this.value)"></div>';
    });
    h+='<button class="btn gho sm mt" onclick="nuevaEval()">+ Registrar evaluación</button></div>';
  }

  h+='</div><div class="mod-f"><button class="btn dgr" onclick="borrarVendedor()">Eliminar</button><div class="f"></div>'+
     (f.proxima?'<button class="btn gho" onclick="abrirSesion(\''+f.proxima.id+'\')">Ir a su próxima sesión</button>':'')+
     '<button class="btn amb" onclick="cerrarModal()">Listo</button></div></div>';
  setHtml('modWrap',h);
}
function toggleDia(d){
  var v=V(); if(!v) return;
  var ds = diasDe(v).slice();
  var i = ds.indexOf(d);
  if(i>=0) ds.splice(i,1); else ds.push(d);
  ds.sort(function(a,b){return a-b;});
  v.dias = ds;
  v.diaSesion = ds.length? ds[0] : null;
  guardar(); pintarVendedor();
}
function setMeta(id,campo,val){ var m=DB.metas.filter(function(x){return x.id===id;})[0]; if(m){ m[campo]=val; guardar(); pintarVendedor(); } }
function borrarMeta(id){ DB.metas=DB.metas.filter(function(m){return m.id!==id;}); guardar(); pintarVendedor(); }
function nuevaMeta(){
  var v=V(); if(!v) return;
  var d=new Date();
  DB.metas.push({id:uid(), vendedorId:v.id, periodoTipo:'Mensual', periodo:d.getFullYear()+'-'+pad(d.getMonth()+1), tipo:'ventas', meta:500000, real:0});
  guardar(); pintarVendedor();
}
function setEval(id,val){ var e=DB.evaluaciones.filter(function(x){return x.id===id;})[0]; if(e){ e.puntaje=val; guardar(); pintarVendedor(); } }
function nuevaEval(){
  var v=V(); if(!v) return;
  DB.evaluaciones.push({id:uid(), vendedorId:v.id, tipo:'Seguimiento', fecha:hoyISO(), puntaje:50});
  guardar(); pintarVendedor();
}
function nuevoVendedor(){
  var cid = UI.cliente!=='*'?UI.cliente:(DB.programas[0]||{}).clienteId;
  var id = uid();
  DB.vendedores.push({id:id, clienteId:cid, nombre:'Nuevo', apellidos:'Vendedor', rol:'Vendedor', sucursal:'',
    nac:'', ingreso:hoyISO(), dias:[1,3], diaSesion:1, horaSesion:'09:00', activo:true});
  DB.evaluaciones.push({id:uid(), vendedorId:id, tipo:'Diagnóstica', fecha:hoyISO(), puntaje:50});
  guardar(); abrirVendedor(id);
}
function borrarVendedor(){
  var v=V(); if(!v) return;
  DB.vendedores = DB.vendedores.filter(function(x){return x.id!==v.id;});
  DB.sesiones = DB.sesiones.filter(function(s){return s.vendedorId!==v.id;});
  DB.compromisos = DB.compromisos.filter(function(c){return c.vendedorId!==v.id;});
  DB.asistencias = DB.asistencias.filter(function(a){return a.vendedorId!==v.id;});
  DB.metas = DB.metas.filter(function(m){return m.vendedorId!==v.id;});
  DB.evaluaciones = DB.evaluaciones.filter(function(e){return e.vendedorId!==v.id;});
  DB.entregas = DB.entregas.filter(function(e){return e.vendedorId!==v.id;});
  guardar(); cerrarModal(); toast('Vendedor eliminado');
}
/* ============================================================
   CATÁLOGO · empresas cliente
   ============================================================ */
var EMPRESA_ABIERTA = null;

var PLANES = ['EVA+ Mensual','EVA+ Trimestral','EVA+ Semestral','EVA+ Anual','Piloto','Personalizado'];
var PALETA = ['#2F6BFF','#1FA971','#B98200','#7A4BD6','#E5484D','#0E8A9E','#D9469B','#3D5B7D'];

function usoEmpresa(cid){
  return {
    vendedores: DB.vendedores.filter(function(v){return v.clienteId===cid;}).length,
    capacitaciones: DB.capacitaciones.filter(function(k){return k.clienteId===cid;}).length,
    sesiones: DB.sesiones.filter(function(s){return s.clienteId===cid;}).length,
    compromisos: DB.compromisos.filter(function(c){return c.clienteId===cid;}).length
  };
}
function totalUso(u){ return u.vendedores+u.capacitaciones+u.sesiones+u.compromisos; }

/* ---------- listado ---------- */
function seccionEmpresas(){
  var pend = dispPendientes();
  var out = '<div class="row spread wrap mb">'+
    '<div class="small muted" style="max-width:560px">El nombre y la ciudad vienen de la base de Nuwek. Aqu\u00ed solo configuras lo del programa EVA+: su coach, su plan y su color en la agenda.</div>'+
    '<button class="btn amb" onclick="abrirAltaEmpresa()">+ Dar de alta empresa</button></div>';

  if(pend.length){
    out += '<div class="lock wt"><div class="ico">\ud83c\udfe2</div><div class="f">'+
      '<div class="ttl">'+pend.length+' cliente'+(pend.length>1?'s':'')+' de Nuwek con EVA+ sin configurar</div>'+
      '<div class="txt">'+pend.map(function(c){return esc(c.cliente);}).join(', ')+'. Tienen proyecto de capacitaci\u00f3n vendido pero a\u00fan no est\u00e1n dados de alta aqu\u00ed.</div></div>'+
      '<button class="btn sm" onclick="abrirAltaEmpresa()">Darlos de alta</button></div>';
  }

  out += '<div class="grid g3">';
  (DB.programas||[]).forEach(function(cfg){
    var c = cli(cfg.clienteId);
    var u = usoEmpresa(c.id);
    var real = DB.sesiones.filter(function(s){return s.clienteId===c.id && s.estatus==='realizada';}).length;
    out += '<div class="card" style="border-top:3px solid '+c.color+'"><div class="card-b">'+
      '<div class="row mb"><div class="av-c" style="background:'+c.color+'">'+esc((c.nombre||'--').slice(0,2))+'</div>'+
      '<div class="f" style="min-width:0"><div style="font-family:var(--display);font-size:16px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(c.nombre)+'</div>'+
      '<div class="small muted">'+esc(c.proyecto||c.plan||'')+'</div></div>'+
      '<button class="btn gho sm" onclick="abrirEmpresa(\''+c.id+'\')">Editar</button></div>'+
      '<div class="row spread small"><span class="muted">Vendedores</span><b class="mono">'+u.vendedores+'</b></div>'+
      '<div class="row spread small"><span class="muted">Capacitaciones</span><b class="mono">'+u.capacitaciones+'</b></div>'+
      '<div class="row spread small"><span class="muted">Sesiones de coacheo</span><b class="mono">'+real+'</b></div>'+
      '<div class="row spread small"><span class="muted">Coach asignado</span><b>'+esc(per(c.coachId).nombre)+'</b></div>'+
      '<div class="row spread small"><span class="muted">Vigencia</span><b class="mono">'+(c.inicio?fmtFecha(c.inicio):'—')+' → '+(c.fin?fmtFecha(c.fin):'—')+'</b></div>'+
      '<div class="row mt" style="gap:7px">'+
        '<button class="btn gho sm f" onclick="UI.cliente=\''+c.id+'\';irA(\'vendedores\')">Ver su equipo</button>'+
        '<button class="btn gho sm" onclick="UI.cliente=\''+c.id+'\';UI.tab.cat=\'temas\';irA(\'catalogos\')" title="Aplicar un programa">\ud83d\udce6</button>'+
      '</div></div></div>';
  });
  out += '</div>';
  if(!(DB.programas||[]).length) out += vacio('\ud83c\udfe2','Sin empresas en EVA+','Da de alta un cliente de Nuwek que tenga el servicio contratado.');
  return out;
}

/* ---------- alta desde el core ---------- */
function abrirAltaEmpresa(){
  EMPRESA_ABIERTA = null;
  pintarAltaEmpresa();
  $('ovl').classList.add('on');
}
function pintarAltaEmpresa(){
  var pend = dispPendientes();
  var h='<div class="mod"><div class="mod-h"><div class="av-c" style="background:var(--noche)">\ud83c\udfe2</div>'+
    '<div><h2>Dar de alta empresa</h2><div class="sub">Clientes de Nuwek con el servicio EVA+</div></div>'+
    '<button class="x" onclick="cerrarModal()">\u2715</button></div><div class="mod-b">';

  h+='<div class="small muted mb">Estos clientes ya tienen un <b>proyecto de capacitaci\u00f3n vendido y activo</b> en Gesti\u00f3n Nuwek. '+
    'Al darlos de alta solo se crea su configuraci\u00f3n del programa: qui\u00e9n los coachea y su color en la agenda.</div>';

  if(!pend.length){
    h+=vacio('\u2713','Todos configurados','Cada cliente con proyecto de capacitaci\u00f3n activo ya est\u00e1 dado de alta aqu\u00ed.');
  } else {
    pend.forEach(function(c){
      var nom = c.cliente || '\u2014';
      h+='<div class="blk" style="padding:13px"><div class="row wrap" style="gap:11px">'+
        '<div class="av-c" style="background:var(--tinta-3)">'+esc(nom.slice(0,2))+'</div>'+
        '<div class="f" style="min-width:0"><div style="font-weight:600;font-size:14px">'+esc(nom)+'</div>'+
        '<div class="small muted">'+esc(c.proyecto||'')+' \u00b7 <span class="tag t-v" style="font-size:10.5px">'+esc(c.servicio||'')+'</span>'+
        (c.inicio? ' \u00b7 '+fmtFecha(c.inicio)+' \u2192 '+(c.fin? fmtFecha(c.fin):'\u2014') : '')+'</div></div>'+
        '<button class="btn amb sm" onclick="altaDesdeCore(\''+c.clienteId+'\')">Dar de alta</button></div></div>';
    });
  }

  h+='<div class="blk" style="background:#F7F9FC"><div class="small muted">'+
    '<b>\u00bfFalta alguno?</b> Para que un cliente aparezca aqu\u00ed necesita un proyecto de <b>EVA+</b> o <b>Capacitaci\u00f3n</b> '+
    'con estatus activo en Gesti\u00f3n Nuwek. No se puede coachear a quien no tiene el proyecto aceptado.</div></div>';

  h+='</div><div class="mod-f"><div class="f"></div><button class="btn amb" onclick="cerrarModal()">Listo</button></div></div>';
  setHtml('modWrap',h);
}
function altaDesdeCore(clienteId){
  var d = disp(clienteId);
  if(!d){ toast('Ese cliente ya no tiene proyecto activo'); return; }
  var usados = (DB.programas||[]).map(function(x){return (x.color||'').toLowerCase();});
  var color = PALETA.filter(function(p){return usados.indexOf(p.toLowerCase())<0;})[0] || PALETA[(DB.programas||[]).length%PALETA.length];
  var coach = (DB.personal||[]).filter(function(p){ return (p.rol||'').toLowerCase().indexOf('coach')>=0; })[0]
           || (DB.personal||[])[0] || {};
  var nuevo = {
    id: uid(),
    proyectoId: d.proyectoId,      /* la liga con el proyecto vendido */
    clienteId: clienteId,
    coachId: coach.id,
    color: color,
    activo: true
  };
  DB.programas.push(nuevo);
  DB.clientes = DB.programas;
  guardar();
  toast(d.cliente+' dado de alta en EVA+');
  abrirEmpresa(clienteId);
}

/* ---------- modal ---------- */
function abrirEmpresa(id){ EMPRESA_ABIERTA=id; pintarEmpresa(); $('ovl').classList.add('on'); }
function E(){ return evaCfg(EMPRESA_ABIERTA); }
function cerrarEmpresa(){ EMPRESA_ABIERTA=null; cerrarModal(); }
function setE(campo,val){ var c=E(); if(c){ c[campo]=val; guardar(); } }
function setER(campo,val){ setE(campo,val); pintarEmpresa(); }

function pintarEmpresa(){
  var cfg=E(); if(!cfg) return;
  var c = cli(cfg.clienteId);
  var u = usoEmpresa(c.id);
  var vs = DB.vendedores.filter(function(v){return v.clienteId===c.id;});

  var h='<div class="mod"><div class="mod-h">'+
    '<div class="av-c" style="background:'+c.color+'">'+esc((c.nombre||'--').slice(0,2))+'</div>'+
    '<div><h2>'+esc(c.nombre)+'</h2><div class="sub">'+u.vendedores+' vendedores \u00b7 '+u.capacitaciones+' capacitaciones \u00b7 '+u.sesiones+' sesiones</div></div>'+
    '<button class="x" onclick="cerrarEmpresa()">\u2715</button></div><div class="mod-b">';

  h+='<div class="blk" style="background:#F7F9FC"><div class="bt"><span class="n">1</span>Viene de Gesti\u00f3n Nuwek</div>'+
    '<div class="small muted mb">El proyecto est\u00e1 vendido y activo. Por eso este cliente se puede trabajar.</div>'+
    '<div class="row spread mb"><span class="muted small">Cliente</span><b>'+esc(c.nombre)+'</b></div>'+
    '<div class="row spread mb"><span class="muted small">Proyecto</span><b>'+esc(c.proyecto||'\u2014')+'</b></div>'+
    '<div class="row spread mb"><span class="muted small">Servicio</span><span class="tag t-v">'+esc(c.plan||'\u2014')+'</span></div>'+
    '<div class="row spread mb"><span class="muted small">Vigencia</span><b class="mono">'+
      (c.inicio? fmtFecha(c.inicio):'\u2014')+' \u2192 '+(c.fin? fmtFecha(c.fin):'\u2014')+'</b></div>'+
    '<div class="row spread"><span class="muted small">Precio del proyecto</span><b class="mono">'+
      (c.precio? '$'+num(c.precio) : '\u2014')+'</b></div>'+
    '<div class="small muted mt-s">Todo esto se edita en Gesti\u00f3n Nuwek, no aqu\u00ed.</div></div>';

  h+='<div class="blk"><div class="bt"><span class="n">2</span>Configuraci\u00f3n del programa</div>'+
    '<div class="small muted mb">Esto s\u00ed es de EVA+ y solo lo usa este portal.</div>'+
    '<div class="fld" style="margin:0"><label>Coach de ventas asignado</label><select class="sel" onchange="setER(\'coachId\',this.value)">'+
      personalActivo(cfg.coachId).map(function(p){return '<option value="'+p.id+'"'+(cfg.coachId===p.id?' selected':'')+'>'+esc(p.nombre)+' \u2014 '+esc(p.rol)+'</option>';}).join('')+'</select>'+
    '<div class="hint">Qui\u00e9n da el seguimiento 1 a 1 a los vendedores de esta empresa.</div></div></div>';

  h+='<div class="blk"><div class="bt"><span class="n">3</span>Color en la agenda</div>'+
    '<div class="small muted mb">Con este color aparece en los tableros y en las etiquetas de empresa.</div>'+
    '<div class="row wrap" style="gap:8px">';
  PALETA.forEach(function(p){
    var on = (cfg.color||'').toLowerCase()===p.toLowerCase();
    h+='<button onclick="setER(\'color\',\''+p+'\')" title="'+p+'" style="width:34px;height:34px;border-radius:10px;background:'+p+';'+
       (on?'box-shadow:0 0 0 3px var(--blanco),0 0 0 5px '+p+';':'')+'display:grid;place-items:center;color:#fff;font-weight:700">'+(on?'\u2713':'')+'</button>';
  });
  h+='</div></div>';

  h+='<div class="blk"><div class="bt"><span class="n">4</span>Equipo</div>';
  if(!vs.length){
    h+='<div class="muted small mb">Todav\u00eda no tiene vendedores dados de alta.</div>';
  } else {
    vs.forEach(function(v){
      h+='<div class="row mb" style="gap:9px">'+avatarV(v.id)+
        '<div class="f" style="min-width:0"><div style="font-weight:600;font-size:13px">'+esc(v.nombre+' '+v.apellidos)+'</div>'+
        '<div class="small muted">'+esc(v.rol)+(v.sucursal?' \u00b7 '+esc(v.sucursal):'')+'</div></div>'+
        '<button class="btn gho sm" onclick="abrirVendedor(\''+v.id+'\')">Abrir</button></div>';
    });
  }
  h+='<button class="btn gho sm mt" onclick="altaEnEmpresa()">+ Dar de alta vendedor</button></div>';

  if(totalUso(u)){
    h+='<div class="lock wt"><div class="ico">\ud83d\udd17</div><div class="f"><div class="ttl">Esta empresa tiene informaci\u00f3n ligada</div>'+
      '<div class="txt">'+u.vendedores+' vendedores, '+u.capacitaciones+' capacitaciones, '+u.sesiones+' sesiones y '+u.compromisos+' compromisos. '+
      'Para sacarla del programa habr\u00eda que borrar todo eso primero.</div></div></div>';
  }

  h+='</div><div class="mod-f">'+
    (totalUso(u)? '<button class="btn gho" disabled title="Tiene informaci\u00f3n ligada">Sacar de EVA+</button>'
                : '<button class="btn dgr" onclick="borrarEmpresa()">Sacar de EVA+</button>')+
    '<div class="f"></div>'+
    '<button class="btn gho" onclick="UI.cliente=\''+c.id+'\';UI.tab.cat=\'temas\';cerrarEmpresa();irA(\'catalogos\')">\ud83d\udce6 Aplicar un programa</button>'+
    '<button class="btn amb" onclick="cerrarEmpresa()">Listo</button></div></div>';
  setHtml('modWrap',h);
}

function altaEnEmpresa(){
  var cfg=E(); if(!cfg) return;
  var id=uid();
  DB.vendedores.push({id:id, clienteId:cfg.clienteId, nombre:'Nuevo', apellidos:'Vendedor', rol:'Vendedor', sucursal:'',
    nac:'', ingreso:hoyISO(), dias:[1,3], diaSesion:1, horaSesion:'09:00', activo:true});
  DB.evaluaciones.push({id:uid(), vendedorId:id, tipo:'Diagn\u00f3stica', fecha:hoyISO(), puntaje:50});
  guardar(); EMPRESA_ABIERTA=null; abrirVendedor(id);
}

function borrarEmpresa(){
  var cfg=E(); if(!cfg) return;
  if(totalUso(usoEmpresa(cfg.clienteId))){ toast('Tiene información ligada, no se puede sacar'); return; }
  
  var nom = cli(cfg.clienteId).nombre;
  DB.programas = DB.programas.filter(function(x){return x.id!==cfg.id;});
  DB.clientes = DB.programas;
  if(UI.cliente===cfg.clienteId) UI.cliente='*';
  guardar(); cerrarEmpresa();
  toast(nom+' salió de EVA+ · sigue en la base de Nuwek');
}
/* ============================================================
   CATÁLOGO · equipo Nuwek
   ============================================================ */
var PERSONA_ABIERTA = null;

var ROLES = ['Coach de ventas','Capacitador','Supervisor','Dirección','Consultor','Administración'];
var ROL_IC = {'Coach de ventas':'🎧','Capacitador':'📚','Supervisor':'📈','Dirección':'⭐','Consultor':'💼','Administración':'📋'};

/* personal disponible para asignar: activos + el que ya estaba asignado */
function personalActivo(incluirId){
  return (DB.personal||[]).filter(function(p){ return p.activo!==false || p.id===incluirId; });
}
function usoPersona(pid){
  return {
    capacitaciones: DB.capacitaciones.filter(function(c){return c.capacitadorId===pid;}).length,
    sesiones: DB.sesiones.filter(function(s){return s.coachId===pid;}).length,
    empresas: (DB.programas||[]).filter(function(c){return c.coachId===pid;}).length
  };
}
function totalUsoP(u){ return u.capacitaciones+u.sesiones+u.empresas; }

/* ---------- listado ---------- */
function seccionPersonal(){
  var out = '<div class="lock ok"><div class="ico">\ud83d\udc65</div><div class="f">'+
    '<div class="ttl">El equipo viene de Gesti\u00f3n Nuwek</div>'+
    '<div class="txt">Aqu\u00ed solo se consulta. Para dar de alta a alguien, cambiar su puesto o su color, '+
    'se hace en el portal de Gesti\u00f3n y aparece aqu\u00ed al recargar.</div></div>'+
    '<button class="btn gho sm" onclick="recargar()">\u21bb Recargar</button></div>';

  var activos = (DB.personal||[]);
  out += '<div class="grid g3">';
  activos.forEach(function(p){ out += tarjetaPersona(p); });
  out += '</div>';
  if(!activos.length) out += vacio('\ud83d\udc64','Sin personal','No se encontr\u00f3 gente activa en Gesti\u00f3n Nuwek.');
  return out;
}

function tarjetaPersona(p){
  var u = usoPersona(p.id);
  return '<div class="card"><div class="card-b">'+
    '<div class="row mb"><div class="av-c" style="background:'+(p.color||'#3f7d6e')+'">'+esc(ini(p.nombre))+'</div>'+
    '<div class="f" style="min-width:0"><div style="font-family:var(--display);font-size:15px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(p.nombre)+'</div>'+
    '<div class="small muted">'+esc(p.rol||'\u2014')+'</div></div>'+
    '<button class="btn gho sm" onclick="abrirPersona(\''+p.id+'\')">Ver</button></div>'+
    '<div class="row spread small"><span class="muted">Capacitaciones impartidas</span><b class="mono">'+u.capacitaciones+'</b></div>'+
    '<div class="row spread small"><span class="muted">Sesiones de coacheo</span><b class="mono">'+u.sesiones+'</b></div>'+
    '<div class="row spread small"><span class="muted">Empresas a su cargo</span><b class="mono">'+u.empresas+'</b></div>'+
    (p.correo? '<div class="small muted mt-s" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(p.correo)+'</div>':'')+
    '</div></div>';
}

/* ---------- consulta de una persona ---------- */
var PERSONA_ABIERTA = null;
function abrirPersona(id){ PERSONA_ABIERTA=id; pintarPersona(); $('ovl').classList.add('on'); }
function P(){ return (DB.personal||[]).filter(function(x){return x.id===PERSONA_ABIERTA;})[0]; }
function cerrarPersona(){ PERSONA_ABIERTA=null; cerrarModal(); }

function pintarPersona(){
  var p=P(); if(!p) return;
  var u = usoPersona(p.id);
  var h='<div class="mod slim"><div class="mod-h">'+
    '<div class="av-c" style="background:'+(p.color||'#3f7d6e')+'">'+esc(ini(p.nombre))+'</div>'+
    '<div><h2>'+esc(p.nombre)+'</h2><div class="sub">'+esc(p.rol||'')+'</div></div>'+
    '<button class="x" onclick="cerrarPersona()">\u2715</button></div><div class="mod-b">'+
    '<div class="blk">'+
    '<div class="row spread mb"><span class="muted small">Correo</span><b>'+esc(p.correo||'\u2014')+'</b></div>'+
    '<div class="row spread mb"><span class="muted small">Tel\u00e9fono</span><b>'+esc(p.telefono||'\u2014')+'</b></div>'+
    '<div class="row spread mb"><span class="muted small">Capacitaciones</span><b class="mono">'+u.capacitaciones+'</b></div>'+
    '<div class="row spread mb"><span class="muted small">Sesiones de coacheo</span><b class="mono">'+u.sesiones+'</b></div>'+
    '<div class="row spread"><span class="muted small">Empresas a su cargo</span><b class="mono">'+u.empresas+'</b></div></div>'+
    '<div class="small muted">Sus datos se editan en Gesti\u00f3n Nuwek.</div>'+
    '</div><div class="mod-f"><div class="f"></div><button class="btn amb" onclick="cerrarPersona()">Listo</button></div></div>';
  setHtml('modWrap',h);
}
/* ============================================================
   CATÁLOGO · temas, subtemas y artefactos
   Un tema con sus subtemas ES el programa que se aplica a una empresa.
   ============================================================ */
var TEMA_ABIERTO = null;
var SUB_ABIERTO = -1;

/* ---------- conteos de uso ---------- */
function usoTema(tid){
  return { caps: DB.capacitaciones.filter(function(c){return c.temaId===tid;}).length };
}
function usoSubtema(tid, nombre){
  return DB.capacitaciones.filter(function(c){return c.temaId===tid && c.subtema===nombre;}).length;
}
function usoArtefacto(a){
  var n = DB.tareas.filter(function(x){return x.artefacto===a;}).length;
  DB.temas.forEach(function(t){ t.subtemas.forEach(function(s){ if(s.artefacto===a) n++; }); });
  return n;
}
function minTema(t){ return t.subtemas.reduce(function(a,s){return a+(s.durProg||0);},0); }
function detalladosDe(t){ return t.subtemas.filter(subDetallado).length; }
function empresasConTema(tid){
  var n={}; DB.capacitaciones.forEach(function(c){ if(c.temaId===tid) n[c.clienteId]=1; });
  return Object.keys(n).length;
}

/* ---------- vista ---------- */
function seccionTemas(){
  var out = '<div class="row spread wrap mb">'+
    '<div class="small muted" style="max-width:560px">Cada tema es un programa: sus sub-temas son las sesiones. Créalos rápido aquí y aplícalos completos a cualquier empresa.</div>'+
    '<button class="btn amb" onclick="nuevoTema()">+ Nuevo tema</button></div>';

  out += '<div class="grid g2">';
  DB.temas.forEach(function(tm){
    var u = usoTema(tm.id), det = detalladosDe(tm), apl = empresasConTema(tm.id);
    var listo = det===tm.subtemas.length && tm.subtemas.length>0;
    out += '<div class="card" style="border-top:3px solid '+(tm.color||'#2F6BFF')+'"><div class="card-b">'+
      '<div class="row spread mb" style="align-items:flex-start">'+
        '<div style="min-width:0"><div style="font-family:var(--display);font-size:15.5px;font-weight:700;line-height:1.25">'+esc(tm.nombre)+'</div>'+
        (tm.descripcion? '<div class="small muted mt-s">'+esc(tm.descripcion)+'</div>':'')+'</div>'+
        '<button class="btn gho sm" style="flex:0 0 auto" onclick="abrirTema(\''+tm.id+'\')">Editar</button></div>'+
      '<div class="row wrap mb" style="gap:6px">'+
        '<span class="tag t-n mono">'+tm.subtemas.length+' sesiones</span>'+
        '<span class="tag t-n mono">'+min2hhmm(minTema(tm))+'</span>'+
        '<span class="tag t-'+(listo?'v':'a')+' mono">'+det+'/'+tm.subtemas.length+' a detalle</span>'+
        '<span class="tag t-n mono">cada '+(tm.cadencia||7)+' días</span>'+
      '</div>'+
      '<div style="border-top:1px solid var(--linea);margin:0 0 10px"></div>';
    tm.subtemas.forEach(function(s,i){
      out += '<div class="row small" style="gap:8px;padding:3px 0">'+
        '<span class="mono muted" style="width:14px;flex:0 0 auto">'+(i+1)+'</span>'+
        '<span class="dot d-'+(subDetallado(s)?'v':'n')+'" style="flex:0 0 auto"></span>'+
        '<span class="f" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(subN(s))+'</span>'+
        '<span class="mono muted" style="flex:0 0 auto">'+(s.durProg||0)+'′</span></div>';
    });
    if(!tm.subtemas.length) out += '<div class="small muted">Sin sub-temas todavía.</div>';
    out += '<div class="row mt" style="gap:7px">'+
        '<button class="btn amb sm f" onclick="aplicarTema(\''+tm.id+'\')"'+(!tm.subtemas.length?' disabled':'')+'>Aplicar a empresa</button>'+
      '</div>'+
      (apl? '<div class="small muted mt-s">Ya se usó en '+apl+' empresa'+(apl>1?'s':'')+' · '+u.caps+' capacitaciones</div>':'')+
      '</div></div>';
  });
  out += '</div>';
  if(!DB.temas.length) out += vacio('🏷️','Sin temas','Crea el primero para poder agendar capacitaciones.');

  /* artefactos */
  out += '<div class="card mt"><div class="card-h"><h3>Artefactos de tarea</h3>'+
    '<div class="r"><button class="btn gho sm" onclick="nuevoArtefacto()">+ Agregar</button></div></div><div class="card-b">'+
    '<div class="small muted mb">Con qué comprueba el vendedor que practicó: un audio, un video, una captura.</div>'+
    '<div class="row wrap" style="gap:7px">';
  DB.artefactos.forEach(function(a,i){
    var n = usoArtefacto(a);
    out += '<span class="tag t-n" style="padding-right:4px">'+esc(a)+
      (n? '<span class="mono muted" style="font-size:10px">·'+n+'</span>':'')+
      '<button onclick="renombrarArtefacto('+i+')" title="Renombrar" style="opacity:.5;padding:0 2px">✎</button>'+
      (n? '' : '<button onclick="borrarArtefacto('+i+')" title="Eliminar" style="opacity:.5;padding:0 2px">✕</button>')+
      '</span>';
  });
  out += '</div><div class="small muted mt-s">Los que ya están en uso no se pueden eliminar, solo renombrar.</div></div></div>';
  return out;
}

/* ---------- modal de tema ---------- */
function abrirTema(id){ TEMA_ABIERTO=id; SUB_ABIERTO=-1; pintarTema(); $('ovl').classList.add('on'); }
function T(){ return DB.temas.filter(function(x){return x.id===TEMA_ABIERTO;})[0]; }
function cerrarTema(){ TEMA_ABIERTO=null; SUB_ABIERTO=-1; cerrarModal(); }
function toggleSub(i){ SUB_ABIERTO = (SUB_ABIERTO===i? -1 : i); pintarTema(); }

function pintarTema(){
  var tm=T(); if(!tm) return;
  var u = usoTema(tm.id), det = detalladosDe(tm);

  var h='<div class="mod"><div class="mod-h">'+
    '<div class="av-c" style="background:'+(tm.color||'#2F6BFF')+'">🏷️</div>'+
    '<div><h2>'+esc(tm.nombre)+'</h2><div class="sub">'+tm.subtemas.length+' sesiones · '+min2hhmm(minTema(tm))+' · '+u.caps+' impartidas</div></div>'+
    '<button class="x" onclick="cerrarTema()">✕</button></div><div class="mod-b">';

  h+='<div class="blk"><div class="grid g2">'+
    '<div class="fld"><label>Nombre del tema</label><input class="inp" value="'+esc(tm.nombre)+'" onchange="setTema(\'nombre\',this.value)">'+
      '<div class="hint">Cambiarlo actualiza todo lo que lo usa.</div></div>'+
    '<div class="fld"><label>Cadencia entre sesiones (días)</label><input class="inp" type="number" min="1" value="'+(tm.cadencia||7)+'" onchange="setTema(\'cadencia\',+this.value)">'+
      '<div class="hint">Con esto se autollenan las fechas al aplicarlo.</div></div></div>'+
    '<div class="fld" style="margin:0"><label>Para qué sirve</label>'+
    '<textarea class="ta" style="min-height:46px" placeholder="Opcional" onchange="setTema(\'descripcion\',this.value)">'+esc(tm.descripcion||'')+'</textarea></div></div>';

  h+='<div class="blk"><div class="row spread mb"><div class="bt" style="margin:0">Sub-temas</div>'+
     '<span class="tag t-'+(det===tm.subtemas.length&&tm.subtemas.length?'v':'a')+' mono">'+det+' de '+tm.subtemas.length+' a detalle</span></div>'+
     '<div class="small muted mb">Cada sub-tema es una sesión. Escríbelos rápido y luego usa el <b>✎</b> para darles detalle: duración, formato y tarea. Se pone verde cuando ya puede agendarse solo.</div>';

  if(!tm.subtemas.length) h+='<div class="muted small mb">Todavía no hay ninguno.</div>';

  tm.subtemas.forEach(function(s,i){
    var us = usoSubtema(tm.id, subN(s));
    var listo = subDetallado(s);
    var ab = SUB_ABIERTO===i;
    h+='<div style="border:1.5px solid '+(ab?'var(--electrico)':'var(--linea)')+';border-radius:11px;padding:9px;margin-bottom:8px;background:var(--blanco)">'+
      '<div class="row" style="gap:7px">'+
      '<span class="mono muted small" style="width:14px;flex:0 0 auto">'+(i+1)+'</span>'+
      '<input class="inp" value="'+esc(subN(s))+'" onchange="renombrarSubtema('+i+',this.value)">'+
      (us? '<span class="tag t-n mono" style="flex:0 0 auto">'+us+' en uso</span>':'')+
      '<button class="btn sm '+(listo?'ok':(ab?'':'gho'))+'" onclick="toggleSub('+i+')" title="'+(listo?'Detalle completo':'Falta el detalle')+'" style="flex:0 0 auto">✎</button>'+
      (i>0?'<button class="btn gho sm" onclick="moverSubtema('+i+',-1)" title="Subir" style="flex:0 0 auto">↑</button>':'')+
      (i<tm.subtemas.length-1?'<button class="btn gho sm" onclick="moverSubtema('+i+',1)" title="Bajar" style="flex:0 0 auto">↓</button>':'')+
      (us? '<button class="btn gho sm" disabled title="En uso" style="flex:0 0 auto">✕</button>'
         : '<button class="btn dgr sm" onclick="quitarSubtema('+i+')" style="flex:0 0 auto">✕</button>')+
      '</div>';

    if(!ab && listo){
      h+='<div class="small muted" style="padding:6px 0 0 21px">'+s.durProg+'′ · '+esc(s.formato)+' · '+esc(s.artefacto)+' ×'+s.nEntregas+'</div>';
    }
    if(ab){
      h+='<div style="border-top:1px solid var(--linea);margin-top:9px;padding-top:11px">'+
        '<div class="grid g2">'+
          '<div class="fld"><label>Duración (min)</label><input class="inp" type="number" step="15" value="'+(s.durProg||'')+'" onchange="setSub('+i+',\'durProg\',+this.value)"></div>'+
          '<div class="fld"><label>Formato sugerido</label><select class="sel" onchange="setSub('+i+',\'formato\',this.value)">'+
            FORMATOS.map(function(f){return '<option'+(s.formato===f?' selected':'')+'>'+f+'</option>';}).join('')+'</select></div>'+
        '</div>'+
        '<div class="fld"><label>Tarea que se deja</label>'+
        '<textarea class="ta" style="min-height:46px" placeholder="Grabar tu guion con 3 prospectos distintos…" onchange="setSub('+i+',\'tareaDesc\',this.value)">'+esc(s.tareaDesc||'')+'</textarea></div>'+
        '<div class="grid g3">'+
          '<div class="fld" style="margin:0"><label>Artefacto</label><select class="sel" onchange="setSub('+i+',\'artefacto\',this.value)">'+
            '<option value=""'+(!s.artefacto?' selected':'')+'>— Elige —</option>'+
            DB.artefactos.map(function(a){return '<option'+(s.artefacto===a?' selected':'')+'>'+esc(a)+'</option>';}).join('')+'</select></div>'+
          '<div class="fld" style="margin:0"><label>Veces que se envía</label><input class="inp" type="number" min="1" max="10" value="'+(s.nEntregas||'')+'" onchange="setSub('+i+',\'nEntregas\',+this.value)"></div>'+
          '<div class="fld" style="margin:0"><label>Días para entregar</label><input class="inp" type="number" min="1" value="'+(s.diasLimite||'')+'" onchange="setSub('+i+',\'diasLimite\',+this.value)"></div>'+
        '</div>'+
        (listo? '<div class="small" style="color:var(--verde);font-weight:600">✓ Listo para agendarse solo</div>'
              : '<div class="small muted">Faltan datos para agendarse solo: duración, tarea, artefacto y número de entregas.</div>')+
        '</div>';
    }
    h+='</div>';
  });
  h+='<button class="btn gho sm" onclick="agregarSubtema()">+ Agregar sub-tema</button></div>';

  if(u.caps){
    h+='<div class="lock wt"><div class="ico">🔗</div><div class="f"><div class="ttl">Este tema está en uso</div>'+
      '<div class="txt">Aparece en '+u.caps+' capacitaciones ya agendadas. Renombrarlo o cambiar su detalle no las afecta; para eliminarlo habría que borrarlas antes.</div></div></div>';
  }

  h+='</div><div class="mod-f">'+
    (u.caps? '<button class="btn gho" disabled title="En uso">Eliminar tema</button>'
           : '<button class="btn dgr" onclick="borrarTema()">Eliminar tema</button>')+
    '<div class="f"></div>'+
    '<button class="btn gho" onclick="cerrarTema()">Listo</button>'+
    '<button class="btn amb" onclick="aplicarTema(\''+tm.id+'\')"'+(!tm.subtemas.length?' disabled':'')+'>📦 Aplicar a empresa</button>'+
    '</div></div>';
  setHtml('modWrap',h);
}

function setTema(campo,val){ var tm=T(); if(!tm) return; tm[campo]=val; guardar(); pintarTema(); }
function setSub(i,campo,val){
  var tm=T(); if(!tm||!tm.subtemas[i]) return;
  tm.subtemas[i][campo]=val; guardar(); pintarTema();
}
function renombrarSubtema(i, nuevo){
  var tm=T(); if(!tm) return;
  var viejo = subN(tm.subtemas[i]);
  nuevo = String(nuevo||'').trim();
  if(!nuevo){ pintarTema(); return; }
  if(nuevo===viejo) return;
  if(subsDe(tm.id).indexOf(nuevo)>=0){ toast('Ya existe un sub-tema con ese nombre'); pintarTema(); return; }
  tm.subtemas[i].n = nuevo;
  var n=0;
  DB.capacitaciones.forEach(function(c){ if(c.temaId===tm.id && c.subtema===viejo){ c.subtema=nuevo; n++; } });
  guardar(); pintarTema();
  if(n) toast('Actualizado en '+n+' capacitación'+(n>1?'es':''));
}
function moverSubtema(i,d){
  var tm=T(); if(!tm) return;
  var j=i+d; if(j<0||j>=tm.subtemas.length) return;
  var t=tm.subtemas[i]; tm.subtemas[i]=tm.subtemas[j]; tm.subtemas[j]=t;
  if(SUB_ABIERTO===i) SUB_ABIERTO=j; else if(SUB_ABIERTO===j) SUB_ABIERTO=i;
  guardar(); pintarTema();
}
function quitarSubtema(i){
  var tm=T(); if(!tm) return;
  if(usoSubtema(tm.id, subN(tm.subtemas[i]))){ toast('Está en uso, no se puede eliminar'); return; }
  tm.subtemas.splice(i,1);
  if(SUB_ABIERTO===i) SUB_ABIERTO=-1;
  guardar(); pintarTema();
}
function agregarSubtema(){
  var tm=T(); if(!tm) return;
  var base='Nuevo sub-tema', n=base, k=2;
  while(subsDe(tm.id).indexOf(n)>=0){ n=base+' '+k; k++; }
  tm.subtemas.push(nuevoSubtema(n));
  guardar(); pintarTema();
}
function nuevoTema(){
  var id=uid();
  var usados = DB.temas.map(function(x){return (x.color||'').toLowerCase();});
  var color = PALETA_TEMA.filter(function(p){return usados.indexOf(p.toLowerCase())<0;})[0] || PALETA_TEMA[DB.temas.length%PALETA_TEMA.length];
  DB.temas.push({id:id, nombre:'Tema nuevo', descripcion:'', color:color, cadencia:7, subtemas:[nuevoSubtema('Sesión 1')]});
  guardar(); abrirTema(id);
}
function borrarTema(){
  var tm=T(); if(!tm) return;
  if(usoTema(tm.id).caps){ toast('Está en uso, no se puede eliminar'); return; }
  if(DB.temas.length<=1){ toast('Debe quedar al menos un tema'); return; }
  DB.temas = DB.temas.filter(function(x){return x.id!==tm.id;});
  guardar(); cerrarTema(); toast('Tema eliminado');
}

/* ---------- artefactos ---------- */
function nuevoArtefacto(){
  var base='Nuevo artefacto', n=base, k=2;
  while(DB.artefactos.indexOf(n)>=0){ n=base+' '+k; k++; }
  DB.artefactos.push(n); guardar(); render();
  toast('Renómbralo con el lápiz');
}
function renombrarArtefacto(i){
  var viejo = DB.artefactos[i];
  var nuevo = prompt('Nombre del artefacto:', viejo);
  if(nuevo===null) return;
  nuevo = String(nuevo).trim();
  if(!nuevo) return;
  if(nuevo!==viejo && DB.artefactos.indexOf(nuevo)>=0){ toast('Ya existe uno con ese nombre'); return; }
  DB.artefactos[i]=nuevo;
  var n=0;
  DB.tareas.forEach(function(t){ if(t.artefacto===viejo){ t.artefacto=nuevo; n++; } });
  DB.temas.forEach(function(t){ t.subtemas.forEach(function(s){ if(s.artefacto===viejo){ s.artefacto=nuevo; n++; } }); });
  guardar(); render();
  toast(n? 'Actualizado en '+n+' lugar'+(n>1?'es':'') : 'Artefacto renombrado');
}
function borrarArtefacto(i){
  if(usoArtefacto(DB.artefactos[i])){ toast('Está en uso, no se puede eliminar'); return; }
  if(DB.artefactos.length<=1){ toast('Debe quedar al menos un artefacto'); return; }
  DB.artefactos.splice(i,1); guardar(); render();
}
/* ============================================================
   VISTA · TABLERO
   ============================================================ */
function vistaTablero(){
  var rango = UI.tab.rango || 30;
  var m = metricasCoach(rango);
  var out = '<div class="row spread wrap mb">'+
    '<div class="eyebrow">Cumplimiento de '+esc(per('p1').nombre)+' · últimos '+rango+' días</div>'+
    '<div class="tabs">'+[7,30,90].map(function(r){
      return '<button class="'+(rango===r?'on':'')+'" onclick="setTab(\'rango\','+r+')">'+r+' días</button>';
    }).join('')+'</div></div>';

  /* --- scoreboard de tiempo --- */
  var gapCls = m.gap>15?'gap-pos':(m.gap<-15?'gap-neg':'gap-ok');
  out += '<div class="score mb">'+
    '<div class="blk"><div class="lbl">Tiempo programado</div><div class="num">'+min2hhmm(m.minProg)+'</div></div>'+
    '<div class="vs">vs</div>'+
    '<div class="blk"><div class="lbl">Tiempo real en sesión</div><div class="num">'+min2hhmm(m.minReal)+'</div></div>'+
    '<div class="blk gap"><div class="lbl">Diferencia acumulada</div><div class="num '+gapCls+'">'+(m.gap>0?'+':'')+m.gap+'<small>min</small></div>'+
    '<div class="small" style="color:#7F98B4;margin-top:3px">'+(m.gapProm>0?'+':'')+m.gapProm+' min por sesión en promedio</div></div>'+
    '</div>';

  if(Math.abs(m.gapProm)>=8){
    out += '<div class="lock wt"><div class="ico">⏱️</div><div class="f">'+
      '<div class="ttl">'+(m.gapProm>0
        ? 'Las sesiones se están alargando '+m.gapProm+' min en promedio'
        : 'Las sesiones se están acortando '+Math.abs(m.gapProm)+' min en promedio')+'</div>'+
      '<div class="txt">'+(m.gapProm>0
        ? 'No es indisciplina: el bloque de 30 min probablemente se quedó corto. Vale la pena renegociar la duración con el cliente antes de que Yun lo absorba de su tiempo.'
        : 'Sesiones cortas repetidas suelen significar que el vendedor llega sin material. Cruza este dato con el candado del 50%.')+'</div></div></div>';
  }

  /* --- KPIs --- */
  out += '<div class="grid g4 mt">'+
    kpi('Sesiones realizadas', m.realizadas+'<small>/'+m.programadas+'</small>','', m.canceladas+' canceladas', pct(m.realizadas,m.programadas), pct(m.realizadas,m.programadas)>=90?'v':'a')+
    kpi('Cobertura de vendedores', m.cobertura,'%', m.vendAtn+' de '+m.vendTot+' atendidos', m.cobertura, m.cobertura>=90?'v':'a')+
    kpi('Minutas subidas', m.pctMinutas,'%', m.minutas+' de '+m.realizadas+' sesiones', m.pctMinutas, m.pctMinutas>=90?'v':'r')+
    kpi('Calidad de captura', m.calidad,'/100', 'promedio de las sesiones', m.calidad, m.calidad>=85?'v':'a')+
    '</div>';
  out += '<div class="grid g4 mt">'+
    kpi('Seguimiento a compromisos', m.pctSeguimiento,'%', m.compSeguidos+' de '+m.compTot+' revisados', m.pctSeguimiento, m.pctSeguimiento>=80?'v':'a')+
    kpi('Avance promedio', m.avgAvance,'%', 'de los '+m.compCerrados+' cerrados', m.avgAvance, compSem(m.avgAvance))+
    kpi('Cumplimiento del vendedor', m.pctCumplimiento,'%', m.compCumplidos+' al 100% de '+m.compCerrados, m.pctCumplimiento, m.pctCumplimiento>=70?'v':'a')+
    kpi('Rezago de captura', m.lagProm,'días', 'entre la sesión y su registro', null)+
    '</div>';

  /* desviaciones y ánimo */
  out += '<div class="grid g4 mt">'+
    kpi('Desviación promedio', m.desvProm,'días', m.tarde+' compromisos atendidos tarde', null)+
    kpi('Desviaciones con motivo', m.pctMotivo,'%', m.conMotivo+' de '+m.tarde+' explicadas', m.pctMotivo, m.pctMotivo>=80?'v':'a')+
    kpi('Compromisos cerrados', m.pctCierre,'%', m.compCerrados+' de '+m.compTot+' calificados', m.pctCierre, m.pctCierre>=80?'v':'a')+
    kpi('Ánimo del equipo', (m.animoProm? m.animoProm.toFixed(1):'—'),'/5', (m.animoProm? (animo(Math.round(m.animoProm))||{ic:''}).ic+' '+(animo(Math.round(m.animoProm))||{l:''}).l : 'sin registro'), m.animoProm? m.animoProm/5*100 : null, m.animoProm>=3.5?'v':'a')+
    '</div>';

  /* --- sesiones que no se dieron --- */
  var kNR = Object.keys(m.motivosNR||{}).sort(function(a,b){ return m.motivosNR[b]-m.motivosNR[a]; });
  if(kNR.length || m.enConflicto){
    out += '<div class="card mt"><div class="card-h"><h3>Sesiones que no se dieron</h3>'+
      (m.enConflicto? '<div class="r"><button class="btn dgr sm" onclick="setTab(\'coa\',\'conf\');irA(\'coacheo\')">⚠️ '+m.enConflicto+' con problema de calendario</button></div>':'')+
      '</div><div class="card-b">';
    if(kNR.length){
      var totNR = kNR.reduce(function(a,k){return a+m.motivosNR[k];},0);
      out += '<div class="small muted mb">'+totNR+' sesiones marcadas como no realizadas. El motivo importa: no es lo mismo un puente que un vendedor que nunca se conecta.</div>';
      kNR.forEach(function(k){
        var n = m.motivosNR[k], p = pct(n, totNR);
        out += '<div class="row mb" style="gap:10px"><div class="small" style="width:230px">'+esc(k)+'</div>'+
          '<div class="f"><div class="bar '+(p>=40?'r':'a')+'" style="margin:0"><i style="width:'+p+'%"></i></div></div>'+
          '<span class="mono small" style="width:52px;text-align:right;font-weight:700">'+n+' ('+p+'%)</span></div>';
      });
    } else {
      out += '<div class="small muted">Ninguna sesión marcada como no realizada. Pero hay '+m.enConflicto+' con la fecha fuera de su ventana: hay que reagendarlas o cerrarlas.</div>';
    }
    out += '</div></div>';
  }

  /* --- reagendas y sus motivos --- */
  var claves = Object.keys(m.motivos||{}).sort(function(a,b){ return m.motivos[b]-m.motivos[a]; });
  if(claves.length){
    var totM = claves.reduce(function(a,k){return a+m.motivos[k];},0);
    out += '<div class="card mt"><div class="card-h"><h3>Por qué se mueven las sesiones</h3>'+
      '<div class="r"><span class="tag t-n mono">'+totM+' reagendadas</span></div></div><div class="card-b">'+
      '<div class="small muted mb">Una reagenda aislada es normal. Un motivo que se repite es una señal.</div>';
    claves.forEach(function(k){
      var n = m.motivos[k], p = pct(n, totM);
      out += '<div class="row mb" style="gap:10px"><div class="small" style="width:220px">'+esc(k)+'</div>'+
        '<div class="f"><div class="bar '+(p>=40?'a':'')+'" style="margin:0"><i style="width:'+p+'%"></i></div></div>'+
        '<span class="mono small" style="width:52px;text-align:right;font-weight:700">'+n+' ('+p+'%)</span></div>';
    });
    out += '</div></div>';
  }

  /* --- tiempo por empresa --- */
  var te = tiempoPorEmpresa(rango);
  var maxT = Math.max.apply(null, te.map(function(r){return r.totalReal;}).concat([1]));
  out += '<div class="card mt"><div class="card-h"><h3>Tiempo invertido por empresa</h3><div class="r muted small">coacheo + capacitación, últimos '+rango+' días</div></div><div class="card-b">';
  te.forEach(function(r){
    out += '<div class="mb"><div class="row spread"><div style="font-weight:600">'+esc(r.cliente.nombre)+'</div>'+
      '<div class="mono small">'+min2hhmm(r.totalReal)+'</div></div>'+
      '<div style="display:flex;height:22px;border-radius:7px;overflow:hidden;margin-top:5px;background:var(--papel)">'+
        '<div style="width:'+pct(r.real,maxT)+'%;background:'+r.cliente.color+'" title="Coacheo"></div>'+
        '<div style="width:'+pct(r.capReal,maxT)+'%;background:'+r.cliente.color+'55" title="Capacitación"></div>'+
      '</div>'+
      '<div class="row small muted mt-s" style="gap:16px">'+
        '<span>'+r.sesiones+' sesiones de coacheo · '+min2hhmm(r.real)+'</span>'+
        '<span>'+r.caps+' capacitaciones · '+min2hhmm(r.capReal)+'</span>'+
        '<span style="color:'+(r.gap>0?'var(--ambar-osc)':(r.gap<0?'var(--verde)':'var(--tinta-3)'))+';font-weight:700">'+
          'Gap coacheo '+(r.gap>0?'+':'')+r.gap+' min ('+(r.gapProm>0?'+':'')+r.gapProm+' por sesión)</span>'+
      '</div></div>';
  });
  out += '<div class="small muted mt">Barra sólida = coacheo 1 a 1. Barra clara = capacitación de grupo.</div></div></div>';

  /* --- desglose por sesión --- */
  var lim = masDias(-rango);
  var ses = fc(DB.sesiones).filter(function(s){return s.estatus==='realizada' && s.fechaProg>=lim;})
    .sort(function(a,b){return a.fechaProg<b.fechaProg?1:-1;});
  out += '<div class="card mt"><div class="card-h"><h3>Sesión por sesión</h3></div><div class="tw"><table><thead><tr>'+
    '<th>Fecha</th><th>Vendedor</th><th>Empresa</th><th>Programado</th><th>Real</th><th>Gap</th><th>Minuta</th><th>Compromisos</th><th>Calidad</th></tr></thead><tbody>';
  if(!ses.length) out += '<tr><td colspan="9">'+vacio('📈','Sin sesiones en el rango','Cambia el rango de días arriba.')+'</td></tr>';
  ses.slice(0,50).forEach(function(s){
    var g=gapSesion(s), q=calificaSesion(s);
    var cs=DB.compromisos.filter(function(c){return c.sesionId===s.id;});
    out += '<tr class="clik" onclick="abrirSesion(\''+s.id+'\')">'+
      '<td class="mono small"><b>'+esc(fmtFecha(s.fechaProg))+'</b></td>'+
      '<td class="small">'+esc(ven(s.vendedorId).nombre+' '+ven(s.vendedorId).apellidos)+'</td>'+
      '<td>'+chipCliente(s.clienteId)+'</td>'+
      '<td class="mono small">'+(s.durProg||0)+'′</td>'+
      '<td class="mono small">'+(g?g.real+'′':'—')+'</td>'+
      '<td class="mono small" style="font-weight:700;color:'+(g&&g.gap>0?'var(--ambar-osc)':(g&&g.gap<0?'var(--verde)':'var(--tinta-3)'))+'">'+(g?((g.gap>0?'+':'')+g.gap):'—')+'</td>'+
      '<td>'+((s.minutaUrl||'').trim()?'<span class="tag t-v">Sí</span>':'<span class="tag t-r">Falta</span>')+'</td>'+
      '<td class="mono small">'+cs.length+'</td>'+
      '<td>'+(q?'<span class="tag t-'+(q.total>=85?'v':(q.total>=60?'a':'r'))+'">'+q.total+'</span>':'—')+'</td></tr>';
  });
  out += '</tbody></table></div></div>';
  return out;
}

/* ============================================================
   VISTA · CATÁLOGOS
   ============================================================ */
function vistaCatalogos(){
  var t = UI.tab.cat || 'clientes';
  var out = '<div class="tabs mb" style="display:inline-flex">'+
    ['clientes|Empresas','personal|Equipo EVA+','temas|Temas','sistema|Sistema'].map(function(x){
      var p=x.split('|'); return '<button class="'+(t===p[0]?'on':'')+'" onclick="setTab(\'cat\',\''+p[0]+'\')">'+p[1]+'</button>';
    }).join('')+'</div>';

  if(t==='clientes'){
    out += seccionEmpresas();
  }

  if(t==='personal'){
    out += seccionPersonal();
  }

  if(t==='temas'){
    out += seccionTemas();
  }

  if(t==='sistema'){
    var n = {
      programas: (DB.programas||[]).length,
      vendedores: (DB.vendedores||[]).length,
      temas: (DB.temas||[]).length,
      capacitaciones: (DB.capacitaciones||[]).length,
      sesiones: (DB.sesiones||[]).length,
      compromisos: (DB.compromisos||[]).length,
      bloqueos: (DB.bloqueos||[]).length
    };
    out += '<div class="card"><div class="card-h"><h3>Estado del portal</h3>'+
      '<div class="r"><span class="tag t-v">Conectado a Supabase</span></div></div><div class="card-b">'+
      '<div class="small muted mb">Los datos viven en la base de Nuwek. Se guardan solos conforme capturas.</div>'+
      '<div class="grid g4">'+
        kpi('Empresas en EVA+', n.programas, '', 'con programa configurado', null)+
        kpi('Vendedores', n.vendedores, '', 'inscritos al coacheo', null)+
        kpi('Capacitaciones', n.capacitaciones, '', 'agendadas o dadas', null)+
        kpi('Sesiones de coacheo', n.sesiones, '', 'en total', null)+
      '</div>'+
      '<div class="grid g4 mt">'+
        kpi('Temas', n.temas, '', 'programas plantilla', null)+
        kpi('Compromisos', n.compromisos, '', 'registrados', null)+
        kpi('Bloqueos', n.bloqueos, '', 'de agenda', null)+
        kpi('Disponibles', (DB.disponibles||[]).length, '', 'clientes con proyecto activo', null)+
      '</div>'+
      '<div class="row mt wrap">'+
        '<button class="btn gho sm" onclick="recargar()">↻ Recargar de la base</button>'+
        '<button class="btn gho sm" onclick="EvaSync.guardarYa()">💾 Guardar ahora</button>'+
        '<button class="btn gho sm" onclick="exportar()">Descargar respaldo JSON</button>'+
      '</div></div></div>';

    var pend = (typeof dispPendientes==='function') ? dispPendientes() : [];
    if(pend.length){
      out += '<div class="lock wt mt"><div class="ico">🏢</div><div class="f">'+
        '<div class="ttl">'+pend.length+' cliente'+(pend.length>1?'s':'')+' de Nuwek sin configurar en EVA+</div>'+
        '<div class="txt">'+pend.map(function(c){return esc(c.cliente);}).join(', ')+
        '. Tienen proyecto de capacitación vendido pero aún no se dan de alta aquí.</div></div>'+
        '<button class="btn sm" onclick="UI.tab.cat=\'clientes\';render()">Darlos de alta</button></div>';
    }

    out += '<div class="card mt"><div class="card-h"><h3>Reglas activas</h3></div><div class="card-b">'+
      [['🔒','Candado del 50%','Dos horas antes de la sesión se revisa la tarea. Con menos del 50% entregado, la sesión sale bloqueada.'],
       ['📞','Mensajes y llamadas','No hay mínimo fijo. Se registra cuántos mandó; en cero, la sesión se marca sin evidencia real.'],
       ['📚','Retro sobre lo capacitado','El selector de tema solo muestra las capacitaciones a las que ese vendedor sí asistió.'],
       ['🔗','Minuta obligatoria','Sin liga de Notion la sesión no llega a calidad completa.'],
       ['🤝','Doble calificación','Cada compromiso se califica dos veces: si el coach le dio seguimiento y si el vendedor lo cumplió.']
      ].map(function(r){
        return '<div class="row mb" style="align-items:flex-start"><div style="font-size:17px;width:26px">'+r[0]+'</div>'+
          '<div class="f"><div style="font-weight:600;font-size:13px">'+r[1]+'</div><div class="small muted">'+r[2]+'</div></div></div>';
      }).join('')+'</div></div>';
  }
  return out;
}

function exportar(){
  var b = new Blob([JSON.stringify(DB,null,2)], {type:'application/json'});
  var a = document.createElement('a');
  a.href = URL.createObjectURL(b);
  a.download = 'eva_coach_'+hoyISO()+'.json';
  a.click();
  toast('Respaldo descargado');
}

/* ============================================================
   ARRANQUE
   ============================================================ */
/* ============================================================
   ARRANQUE
   ============================================================ */
function pantallaCarga(msg){
  setHtml('view',
    '<div class="empty" style="padding:70px 20px">'+
    '<div class="big">⏳</div>'+
    '<div class="ttl">'+esc(msg||'Cargando…')+'</div>'+
    '<div class="small">Trayendo la información de la base de datos</div></div>');
}
function pantallaError(msg){
  setHtml('view',
    '<div class="lock no" style="max-width:620px;margin:50px auto">'+
    '<div class="ico">⚠️</div><div class="f">'+
    '<div class="ttl">No se pudo cargar la información</div>'+
    '<div class="txt">'+esc(msg)+'</div>'+
    '<button class="btn amb sm mt" onclick="arrancar()">Reintentar</button>'+
    '</div></div>');
}

/* Indicador de guardado, arriba a la derecha */
function pintarEstadoSync(estado, detalle){
  var e = $('syncEstado'); if(!e) return;
  var t = {
    'pendiente':   ['·', 'Cambios sin guardar', 'var(--tinta-3)'],
    'guardando':   ['⟳', 'Guardando…', 'var(--electrico)'],
    'guardado':    ['✓', 'Guardado', 'var(--verde)'],
    'sin-cambios': ['✓', 'Al día', 'var(--tinta-3)'],
    'error':       ['⚠️', 'No se pudo guardar', 'var(--rojo)']
  }[estado] || ['', '', 'var(--tinta-3)'];
  e.innerHTML = '<span style="color:'+t[2]+';font-weight:600;font-size:12px">'+t[0]+' '+t[1]+'</span>';
  e.title = (estado==='error' && detalle) ? detalle : '';
  if(estado==='guardado'){
    setTimeout(function(){
      if(typeof EvaSync!=='undefined' && !EvaSync.hayPendientes()) pintarEstadoSync('sin-cambios');
    }, 2500);
  }
}

async function arrancar(){
  pantallaCarga('Conectando…');
  try{
    await cargar();
    if (typeof EvaSync !== 'undefined') EvaSync.onEstado = pintarEstadoSync;
    /* el coach que abre el portal: por ahora el primero activo */
    var coach = (DB.personal||[]).filter(function(p){ return (p.rol||'').toLowerCase().indexOf('coach')>=0; })[0]
             || (DB.personal||[])[0];
    if (coach) UI.user = coach.id;
    render();
    pintarEstadoSync('sin-cambios');
  }catch(e){
    pantallaError(e.message || 'Revisa tu conexión a internet');
  }
}

document.addEventListener('DOMContentLoaded', function(){
  arrancar();
  $('fCliente').addEventListener('change', function(){ UI.cliente=this.value; render(); });
  $('fUser').addEventListener('change', function(){ UI.user=this.value; render(); });
  $('ovl').addEventListener('click', function(e){ if(e.target===this) cerrarModal(); });
  document.addEventListener('keydown', function(e){ if(e.key==='Escape' && $('ovl').classList.contains('on')) cerrarModal(); });
});