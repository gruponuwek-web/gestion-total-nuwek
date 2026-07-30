// ============================================================
//  Personal ↔ Supabase (tabla "personal")
//  Traduce entre el objeto que usa el portal (camelCase) y
//  las columnas de la base (snake_case), y hace leer/guardar.
// ============================================================

// --- Convierte una FILA de la base -> objeto que entiende el portal ---
function dbToApp(row){
  return {
    id: row.id,
    type: 'nuwek',
    name: row.name || '',
    firstName: row.first_name || '',
    secondName: row.second_name || '',
    lastName: row.last_name || '',
    role: row.role_puesto || '',
    perm: row.perm || 'colab',
    team: row.team || '',
    tipo: row.tipo || 'Interno',
    rate: row.rate || 0,
    salaryMonthly: row.salary_monthly || 0,
    color: row.color || '#3f7d6e',
    photo: row.photo_url || '',
    joinDate: row.join_date || '',
    gmail: row.gmail || '',
    emailWork: row.email_work || '',
    phonePersonal: row.phone_personal || '',
    phoneWork: row.phone_work || '',
    birthday: row.birthday || '',
    city: row.city || '',
    password: row.password || '',
    rfc: row.rfc || '',
    curp: row.curp || '',
    nss: row.nss || '',
    skills: row.skills || '',
    health: row.health || {},
    computer: row.computer || {},
    active: row.active !== false
  };
}

// --- Convierte el objeto del portal -> FILA para la base ---
function appToDb(u){
  return {
    id: u.id,
    name: u.name || '',
    first_name: u.firstName || '',
    second_name: u.secondName || '',
    last_name: u.lastName || '',
    role_puesto: u.role || '',
    perm: u.perm || 'colab',
    team: u.team || '',
    tipo: u.tipo || 'Interno',
    rate: +u.rate || 0,
    salary_monthly: +u.salaryMonthly || 0,
    color: u.color || '#3f7d6e',
    photo_url: u.photo || '',
    join_date: u.joinDate || null,
    gmail: u.gmail || '',
    email_work: u.emailWork || '',
    phone_personal: u.phonePersonal || '',
    phone_work: u.phoneWork || '',
    birthday: u.birthday || '',
    city: u.city || '',
    password: u.password || '',
    rfc: u.rfc || '',
    curp: u.curp || '',
    nss: u.nss || '',
    skills: u.skills || '',
    health: u.health || {},
    computer: u.computer || {},
    active: u.active !== false
  };
}

// --- LEER todo el personal desde Supabase ---
async function dbLoadPersonal(){
  const { data, error } = await sb
    .from('personal')
    .select('*')
    .order('name', { ascending: true });
  if (error) throw error;
  return (data || []).map(dbToApp);
}

// --- GUARDAR (crear o actualizar) una persona en Supabase ---
async function dbSavePerson(u){
  try{
    const { error } = await sb.from('personal').upsert(appToDb(u));
    if (error) {
      console.error('No se pudo guardar la persona en Supabase:', error.message);
      alert('Ojo: no se pudo guardar en la base de datos.\n\n' + error.message);
    } else {
      console.log('💾 Persona guardada en Supabase:', u.name);
    }
  }catch(e){
    console.error('Error de red al guardar persona:', e);
    alert('No hay conexión con la base de datos para guardar.');
  }
}
