// ============================================================
//  Conexión a Supabase — Portal Nuwek
//  Compartida por todos los módulos: Gestión, EVA+, Finanzas…
//  (La "publishable key" es pública por diseño: puede vivir aquí.)
// ============================================================
const SUPABASE_URL = "https://wxxuxaodpikkelrjkacs.supabase.co";
const SUPABASE_KEY = "sb_publishable_jkSQwyt_z7o9bAdOD8XgOw_ruAPWS8t";

// Cliente de Supabase (el "teléfono" para hablar con la base)
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* [ARRANQUE INSTANTÁNEO 2026-11-05] mientras el portal muestra la copia de este navegador (los primeros 1-2 s al abrir,
   window.__bootStale), no se escribe nada en la base: cualquier escritura se omite y responde «sin error».
   Así un ajuste automático hecho sobre datos viejos nunca pisa lo que otra persona cambió. */
(function(){
  const from = sb.from.bind(sb);
  const skip = new Proxy(function(){}, { get:(_, k) => k === 'then' ? (ok, ko) => Promise.resolve({ data: null, error: null }).then(ok, ko) : () => skip, apply:() => skip });
  sb.from = function(table){
    const q = from(table);
    if (!window.__bootStale) return q;
    ['insert', 'upsert', 'update', 'delete'].forEach(m => { if (typeof q[m] === 'function') q[m] = function(){ console.info('Arranque: se omitió una escritura en «' + table + '» (aún llegan los datos al día).'); return skip; }; });
    return q;
  };
})();

// Pequeña señal en consola para confirmar que cargó bien
console.log("✅ Supabase conectado:", SUPABASE_URL);