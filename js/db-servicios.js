// ============================================================
//  Servicios ↔ Supabase (tabla "servicios")
//  frentes, tasks (tareas base) y sub_links se guardan como jsonb.
// ============================================================

// --- Fila de la base -> objeto del portal ---
function dbToAppService(row){
  return {
    id: row.id,
    name: row.name || '',
    listPrice: row.list_price || 0,
    opCost: row.op_cost || 0,
    frentes: Array.isArray(row.frentes) ? row.frentes : [],
    tasks: Array.isArray(row.tasks) ? row.tasks : [],
    subLinks: Array.isArray(row.sub_links) ? row.sub_links : []
  };
}

// --- Objeto del portal -> fila para la base ---
function appToDbService(s){
  return {
    id: s.id,
    name: s.name || '',
    list_price: +s.listPrice || 0,
    op_cost: +s.opCost || 0,
    frentes: s.frentes || [],
    tasks: s.tasks || [],
    sub_links: s.subLinks || []
  };
}

// --- LEER todos los servicios ---
async function dbLoadServicios(){
  const { data, error } = await sb
    .from('servicios')
    .select('*')
    .order('name', { ascending: true });
  if (error) throw error;
  return (data || []).map(dbToAppService);
}

// --- GUARDAR (crear o actualizar) un servicio ---
async function dbSaveService(s){
  try{
    const { error } = await sb.from('servicios').upsert(appToDbService(s));
    if (error) {
      console.error('No se pudo guardar el servicio en Supabase:', error.message);
      alert('Ojo: no se pudo guardar el servicio en la base de datos.\n\n' + error.message);
    } else {
      console.log('💾 Servicio guardado en Supabase:', s.name);
    }
  }catch(e){
    console.error('Error de red al guardar servicio:', e);
    alert('No hay conexión con la base de datos para guardar el servicio.');
  }
}

// --- ELIMINAR un servicio ---
async function dbDeleteService(id){
  try{
    const { error } = await sb.from('servicios').delete().eq('id', id);
    if (error) console.error('No se pudo eliminar el servicio en Supabase:', error.message);
    else console.log('🗑️ Servicio eliminado en Supabase:', id);
  }catch(e){
    console.error('Error de red al eliminar servicio:', e);
  }
}
