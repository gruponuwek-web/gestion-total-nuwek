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
    ts: row.ts, attachments: Array.isArray(row.attachments) ? row.attachments : undefined,   // undefined = aún no cargados (se piden al abrir la tarea)
    mentions: Array.isArray(row.mentions) ? row.mentions : [],
    readBy: Array.isArray(row.read_by) ? row.read_by : []
  };
}
function appToDbComment(c){
  const row = {
    id: c.id, tarea_id: c.taskId, user_id: c.userId, text: c.text || '',
    ts: c.ts, mentions: c.mentions || [], read_by: c.readBy || []
  };
  if (c.attachments !== undefined) row.attachments = c.attachments;   // si no se han cargado, NO se toca la columna
  return row;
}
async function dbDeleteComment(id){
  try{ const { error } = await sb.from('comentarios').delete().eq('id', id); if (error){ console.error('Error borrando comentario:', error.message); alert('No se pudo borrar el comentario en la base de datos.\n\n'+error.message); } }
  catch(e){ console.error('Red al borrar comentario:', e); }
}
// Carga LIGERA: sin los adjuntos (las imágenes en base64 pesaban varios MB y se bajaban cada 3 s).
async function dbLoadComentarios(){
  const { data, error } = await sb.from('comentarios').select('id,tarea_id,user_id,text,ts,mentions,read_by').order('ts', { ascending: true });
  if (error) throw error;
  return (data || []).map(dbToAppComment);
}
// Adjuntos de los comentarios de UNA tarea (se piden al abrirla).
async function dbLoadCommentAttachments(tid){
  const { data, error } = await sb.from('comentarios').select('id,attachments').eq('tarea_id', tid);
  if (error) throw error;
  return data || [];
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

/* ---------------- PAPELERA (tabla "papelera"; ver SQL en la conversación) ---------------- */
function dbToAppTrash(r){ return { id:r.id, userId:r.user_id, tipo:r.tipo, titulo:r.titulo||'', projectId:r.project_id||'', taskId:r.tarea_id||'', subId:r.sub_id||'', ts:r.ts, data:r.data||{} }; }
function appToDbTrash(x){ return { id:x.id, user_id:x.userId, tipo:x.tipo, titulo:x.titulo||'', project_id:x.projectId||null, tarea_id:x.taskId||null, sub_id:x.subId||null, ts:x.ts, data:x.data||{} }; }
async function dbLoadTrash(){
  const { data, error } = await sb.from('papelera').select('*').order('ts', { ascending: false });
  if (error) throw error;
  return (data || []).map(dbToAppTrash);
}
async function dbSaveTrash(x){
  try{ const { error } = await sb.from('papelera').upsert(appToDbTrash(x)); if (error){ console.error('Error guardando en la papelera:', error.message); return false; } return true; }
  catch(e){ console.error('Red al guardar en la papelera:', e); return false; }
}
async function dbDeleteTrash(id){
  try{ const { error } = await sb.from('papelera').delete().eq('id', id); if (error) console.error('Error borrando de la papelera:', error.message); }
  catch(e){ console.error('Red al borrar de la papelera:', e); }
}
