// ============================================================
//  Proyectos ↔ Supabase (tablas "proyectos", "frentes", "etapas")
//  Un proyecto vive en 3 tablas conectadas:
//    proyectos = el proyecto en sí
//    frentes   = sus áreas de trabajo
//    etapas    = sus fases en el tiempo
// ============================================================

/* ---------- PROYECTO ---------- */
function dbToAppProject(row){
  return {
    id: row.id,
    clientId: row.cliente_id || null,
    serviceId: row.servicio_id || null,
    name: row.name || '',
    price: row.price || 0,
    months: row.months || 0,
    startDate: row.start_date || '',
    endDate: row.end_date || '',
    paymentDay: row.payment_day || null,
    monthlyPay: row.monthly_pay || 0,
    status: row.status || 'active',
    alcances: Array.isArray(row.alcances) ? row.alcances : [],
    links: Array.isArray(row.links) ? row.links : [],
    scorecards: Array.isArray(row.scorecards) ? row.scorecards : []
  };
}
function appToDbProject(p){
  return {
    id: p.id,
    cliente_id: p.clientId || null,
    servicio_id: p.serviceId || null,
    name: p.name || '',
    price: +p.price || 0,
    months: +p.months || 0,
    start_date: p.startDate || null,
    end_date: p.endDate || null,
    payment_day: p.paymentDay ? +p.paymentDay : null,
    monthly_pay: +p.monthlyPay || 0,
    status: p.status || 'active',
    alcances: p.alcances || [],
    links: p.links || [],
    scorecards: p.scorecards || []
  };
}

/* ---------- FRENTE ---------- */
function dbToAppFrente(row){
  return { id: row.id, projectId: row.proyecto_id, name: row.name || '', color: row.color || '#3f7d6e', order: row.ord || 0 };
}
function appToDbFrente(f){
  return { id: f.id, proyecto_id: f.projectId, name: f.name || '', color: f.color || '#3f7d6e', ord: f.order || 0 };
}

/* ---------- ETAPA ---------- */
function dbToAppEtapa(row){
  return { id: row.id, projectId: row.proyecto_id, name: row.name || '', start: row.start_date || '', end: row.end_date || '', order: row.ord || 0 };
}
function appToDbEtapa(e){
  return { id: e.id, proyecto_id: e.projectId, name: e.name || '', start_date: e.start || null, end_date: e.end || null, ord: e.order || 0 };
}

/* ---------- LEER TODO (proyectos + frentes + etapas) ---------- */
async function dbLoadProyectos(){
  const [pr, fr, et] = await Promise.all([
    sb.from('proyectos').select('*').order('created_at', { ascending: true }),
    sb.from('frentes').select('*'),
    sb.from('etapas').select('*')
  ]);
  if (pr.error) throw pr.error;
  if (fr.error) throw fr.error;
  if (et.error) throw et.error;
  return {
    projects: (pr.data || []).map(dbToAppProject),
    frentes:  (fr.data || []).map(dbToAppFrente),
    etapas:   (et.data || []).map(dbToAppEtapa)
  };
}

/* ---------- GUARDAR ---------- */
async function dbSaveProject(p){
  try{
    const { error } = await sb.from('proyectos').upsert(appToDbProject(p));
    if (error){ console.error('Error guardando proyecto:', error.message); alert('Ojo: no se pudo guardar el proyecto.\n\n'+error.message); }
    else console.log('💾 Proyecto guardado en Supabase:', p.name);
  }catch(e){ console.error('Red al guardar proyecto:', e); alert('Sin conexión para guardar el proyecto.'); }
}
async function dbSaveFrente(f){
  try{
    const { error } = await sb.from('frentes').upsert(appToDbFrente(f));
    if (error) console.error('Error guardando frente:', error.message);
    else console.log('💾 Frente guardado:', f.name);
  }catch(e){ console.error('Red al guardar frente:', e); }
}
async function dbSaveEtapa(e){
  try{
    const { error } = await sb.from('etapas').upsert(appToDbEtapa(e));
    if (error) console.error('Error guardando etapa:', error.message);
    else console.log('💾 Etapa guardada:', e.name);
  }catch(err){ console.error('Red al guardar etapa:', err); }
}

/* ---------- ELIMINAR ---------- */
async function dbDeleteFrente(id){
  try{ const { error } = await sb.from('frentes').delete().eq('id', id); if (error) console.error('Error borrando frente:', error.message); }
  catch(e){ console.error('Red al borrar frente:', e); }
}
async function dbDeleteEtapa(id){
  try{ const { error } = await sb.from('etapas').delete().eq('id', id); if (error) console.error('Error borrando etapa:', error.message); }
  catch(e){ console.error('Red al borrar etapa:', e); }
}
