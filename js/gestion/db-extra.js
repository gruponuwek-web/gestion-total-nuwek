// ============================================================
//  Módulos "extra" ↔ Supabase (3 tablas pequeñas en un archivo):
//    - comentarios (con arrobados y "ya lo vi")
//    - log         (historial de cambios / auditoría)
//    - etiquetas   (catálogo de tags)
//  Sus tablas ya existían con las columnas correctas (sin ALTER).
// ============================================================

/* ---------------- COMENTARIOS ---------------- */
function dbToAppComment(row){
  return {
    id: row.id, taskId: row.tarea_id, userId: row.user_id, text: row.text || '',
    ts: row.ts, attachments: Array.isArray(row.attachments) ? row.attachments : [],
    mentions: Array.isArray(row.mentions) ? row.mentions : [],
    readBy: Array.isArray(row.read_by) ? row.read_by : []
  };
}
function appToDbComment(c){
  return {
    id: c.id, tarea_id: c.taskId, user_id: c.userId, text: c.text || '',
    ts: c.ts, attachments: c.attachments || [], mentions: c.mentions || [], read_by: c.readBy || []
  };
}
async function dbLoadComentarios(){
  const { data, error } = await sb.from('comentarios').select('*').order('ts', { ascending: true });
  if (error) throw error;
  return (data || []).map(dbToAppComment);
}
async function dbSaveComment(c){
  try{
    const { error } = await sb.from('comentarios').upsert(appToDbComment(c));
    if (error){ console.error('Error guardando comentario:', error.message); alert('Ojo: no se pudo guardar el comentario.\n\n'+error.message); }
    else console.log('💾 Comentario guardado en Supabase');
  }catch(e){ console.error('Red al guardar comentario:', e); alert('Sin conexión para guardar el comentario.'); }
}

/* ---------------- LOG (auditoría) ---------------- */
function dbToAppLog(row){ return { id: row.id, ts: row.ts, userId: row.user_id, taskId: row.tarea_id, action: row.action || '' }; }
function appToDbLog(e){ return { id: e.id, ts: e.ts, user_id: e.userId, tarea_id: e.taskId, action: e.action || '' }; }
async function dbLoadLog(){
  const { data, error } = await sb.from('log').select('*').order('ts', { ascending: true });
  if (error) throw error;
  return (data || []).map(dbToAppLog);
}
async function dbSaveLog(e){
  try{
    const { error } = await sb.from('log').upsert(appToDbLog(e));
    if (error) console.error('Error guardando log:', error.message);
  }catch(err){ console.error('Red al guardar log:', err); }
}

/* ---------------- ETIQUETAS (tags) ---------------- */
function dbToAppTag(row){ return { name: row.name, color: row.color || '#8a9a93' }; }
async function dbLoadTags(){
  const { data, error } = await sb.from('etiquetas').select('*').order('name', { ascending: true });
  if (error) throw error;
  return (data || []).map(dbToAppTag);
}
async function dbSaveTag(t){
  try{
    const { error } = await sb.from('etiquetas').upsert({ name: t.name, color: t.color || '#8a9a93' });
    if (error) console.error('Error guardando etiqueta:', error.message);
    else console.log('💾 Etiqueta guardada:', t.name);
  }catch(e){ console.error('Red al guardar etiqueta:', e); }
}
async function dbDeleteTag(name){
  try{ const { error } = await sb.from('etiquetas').delete().eq('name', name); if (error) console.error('Error borrando etiqueta:', error.message); }
  catch(e){ console.error('Red al borrar etiqueta:', e); }
}
// Renombrar = la "name" es la llave, así que se borra la vieja y se inserta la nueva.
async function dbRenameTag(oldName, newName, color){
  try{
    await sb.from('etiquetas').delete().eq('name', oldName);
    await sb.from('etiquetas').upsert({ name: newName, color: color || '#8a9a93' });
    console.log('💾 Etiqueta renombrada:', oldName, '→', newName);
  }catch(e){ console.error('Red al renombrar etiqueta:', e); }
}
