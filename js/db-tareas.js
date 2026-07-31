// ============================================================
//  Tareas ↔ Supabase (tabla "tareas")
//  Las SUBTAREAS viven DENTRO de la tarea (columna jsonb "subtasks"),
//  igual que los contactos dentro del cliente. Así, cada cambio en una
//  subtarea guarda la tarea completa.
// ============================================================

// --- Fila de la base -> objeto del portal ---
function dbToAppTask(row){
  return {
    id: row.id,
    projectId: row.proyecto_id || null,
    frenteId: row.frente_id || null,
    name: row.name || '',
    subtitle: row.subtitle || '',
    description: row.description || '',
    tags: Array.isArray(row.tags) ? row.tags : [],
    workLink: row.work_link || '',
    deliverables: Array.isArray(row.deliverables) ? row.deliverables : [],
    responsibleId: row.responsible_id || null,
    status: row.status || 'to-do',
    dueDate: row.due_date || '',
    viaticos: row.viaticos || 0,
    subtasks: Array.isArray(row.subtasks) ? row.subtasks : [],
    links: Array.isArray(row.links) ? row.links : []
  };
}

// --- Objeto del portal -> fila para la base ---
function appToDbTask(t){
  return {
    id: t.id,
    proyecto_id: t.projectId || null,
    frente_id: t.frenteId || null,
    name: t.name || '',
    subtitle: t.subtitle || '',
    description: t.description || '',
    tags: t.tags || [],
    work_link: t.workLink || '',
    deliverables: t.deliverables || [],
    responsible_id: t.responsibleId || null,
    status: t.status || 'to-do',
    due_date: t.dueDate || null,
    viaticos: +t.viaticos || 0,
    subtasks: t.subtasks || [],
    links: t.links || []
  };
}

// --- LEER todas las tareas ---
async function dbLoadTareas(){
  const { data, error } = await sb
    .from('tareas')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map(dbToAppTask);
}

// --- GUARDAR (crear o actualizar) una tarea con sus subtareas ---
async function dbSaveTask(t){
  try{
    const { error } = await sb.from('tareas').upsert(appToDbTask(t));
    if (error){
      console.error('No se pudo guardar la tarea en Supabase:', error.message);
      alert('Ojo: no se pudo guardar la tarea en la base de datos.\n\n' + error.message);
    } else {
      console.log('💾 Tarea guardada en Supabase:', t.name);
    }
  }catch(e){ console.error('Red al guardar tarea:', e); alert('Sin conexión para guardar la tarea.'); }
}

// --- ELIMINAR una tarea ---
async function dbDeleteTask(id){
  try{
    const { error } = await sb.from('tareas').delete().eq('id', id);
    if (error) console.error('No se pudo eliminar la tarea en Supabase:', error.message);
    else console.log('🗑️ Tarea eliminada en Supabase:', id);
  }catch(e){ console.error('Red al eliminar tarea:', e); }
}
