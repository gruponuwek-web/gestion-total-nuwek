// ============================================================
//  Conexión a Supabase — Portal Nuwek
//  Compartida por todos los módulos: Gestión, EVA+, Finanzas…
//  (La "publishable key" es pública por diseño: puede vivir aquí.)
// ============================================================
const SUPABASE_URL = "https://wxxuxaodpikkelrjkacs.supabase.co";
const SUPABASE_KEY = "sb_publishable_jkSQwyt_z7o9bAdOD8XgOw_ruAPWS8t";

// Cliente de Supabase (el "teléfono" para hablar con la base)
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Pequeña señal en consola para confirmar que cargó bien
console.log("✅ Supabase conectado:", SUPABASE_URL);