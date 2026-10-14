// ============================================================
//  Clientes ↔ Supabase (tabla "clientes")
//  Los contactos del cliente (people[]) se guardan como
//  "contactos" (jsonb). Los demás campos son columnas propias.
// ============================================================

// --- Fila de la base -> objeto que usa el portal ---
function dbToAppClient(row){
  return {
    id: row.id,
    name: row.name || '',
    razon: row.razon_social || '',
    rfc: row.rfc || '',
    location: row.location || '',
    web: row.web || '',
    ig: row.ig || '',
    fb: row.fb || '',
    youtube: row.youtube || '',
    tiktok: row.tiktok || '',
    linkedin: row.linkedin || '',
    otro: row.otro || '',
    generalResponsibleId: row.general_responsible_id || null,
    people: Array.isArray(row.contactos) ? row.contactos : [],
    tipo: row.tipo === 'interno' ? 'interno' : 'externo',
    logo: row.logo || '',
    activo: row.activo !== false
  };
}

// --- Objeto del portal -> fila para la base ---
function appToDbClient(c){
  return {
    id: c.id,
    name: c.name || '',
    razon_social: c.razon || '',
    rfc: c.rfc || '',
    location: c.location || '',
    web: c.web || '',
    ig: c.ig || '',
    fb: c.fb || '',
    youtube: c.youtube || '',
    tiktok: c.tiktok || '',
    linkedin: c.linkedin || '',
    otro: c.otro || '',
    general_responsible_id: c.generalResponsibleId || null,
    contactos: c.people || [],
    tipo: c.tipo === 'interno' ? 'interno' : 'externo',
    logo: c.logo || '',
    activo: c.activo !== false
  };
}

// --- LEER todos los clientes ---
async function dbLoadClientes(){
  const { data, error } = await sb
    .from('clientes')
    .select('*')
    .order('name', { ascending: true });
  if (error) throw error;
  return (data || []).map(dbToAppClient);
}

// --- GUARDAR (crear o actualizar) un cliente ---
async function dbSaveClient(c){
  try{
    const row = appToDbClient(c);
    let { error } = await sb.from('clientes').upsert(row);
    // si alguna columna nueva ("tipo", "logo") aún no existe en la base, guardar sin ella
    for (let i = 0; i < 3 && error; i++){
      const m = (error.message||'').match(/\b(tipo|logo|activo)\b/i); const col = m && m[1].toLowerCase();
      if (!col || !(col in row)) break;
      delete row[col]; ({ error } = await sb.from('clientes').upsert(row));
    }
    if (error) {
      console.error('No se pudo guardar el cliente en Supabase:', error.message);
      alert('Ojo: no se pudo guardar el cliente en la base de datos.\n\n' + error.message);
    } else {
      console.log('💾 Cliente guardado en Supabase:', c.name);
    }
  }catch(e){
    console.error('Error de red al guardar cliente:', e);
    alert('No hay conexión con la base de datos para guardar el cliente.');
  }
}

// --- BORRAR un cliente (solo si ya no tiene proyectos) ---
async function dbDeleteClient(id){
  try{
    const { error } = await sb.from('clientes').delete().eq('id', id);
    if (error){ console.error('No se pudo eliminar el cliente:', error.message); alert('Ojo: no se pudo eliminar el cliente en la base de datos.\n\n' + error.message); }
  }catch(e){ console.error('Red al eliminar cliente:', e); }
}
