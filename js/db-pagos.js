// ============================================================
//  Pagos ↔ Supabase (tabla "pagos")
//  El calendario de cobranza de cada proyecto.
// ============================================================

function dbToAppPago(row){
  return {
    id: row.id,
    projectId: row.proyecto_id || null,
    dueDate: row.due_date || '',
    amount: row.amount || 0,
    paid: row.paid === true,
    paidDate: row.paid_date || null
  };
}
function appToDbPago(x){
  return {
    id: x.id,
    proyecto_id: x.projectId || null,
    due_date: x.dueDate || null,
    amount: +x.amount || 0,
    paid: x.paid === true,
    paid_date: x.paidDate || null
  };
}

// --- LEER todos los pagos ---
async function dbLoadPagos(){
  const { data, error } = await sb.from('pagos').select('*').order('due_date', { ascending: true });
  if (error) throw error;
  return (data || []).map(dbToAppPago);
}

// --- GUARDAR (crear o actualizar) un pago ---
async function dbSavePayment(x){
  try{
    const { error } = await sb.from('pagos').upsert(appToDbPago(x));
    if (error){ console.error('Error guardando pago:', error.message); alert('Ojo: no se pudo guardar el pago.\n\n'+error.message); }
    else console.log('💾 Pago guardado en Supabase');
  }catch(e){ console.error('Red al guardar pago:', e); alert('Sin conexión para guardar el pago.'); }
}

// --- ELIMINAR un pago ---
async function dbDeletePayment(id){
  try{ const { error } = await sb.from('pagos').delete().eq('id', id); if (error) console.error('Error borrando pago:', error.message); }
  catch(e){ console.error('Red al borrar pago:', e); }
}

// --- REEMPLAZAR todo el calendario de un proyecto (borra los suyos y guarda los nuevos) ---
async function dbReplacePayments(projectId, payments){
  try{
    await sb.from('pagos').delete().eq('proyecto_id', projectId);
    if (payments && payments.length){
      const rows = payments.map(appToDbPago);
      const { error } = await sb.from('pagos').upsert(rows);
      if (error) console.error('Error guardando calendario de pagos:', error.message);
    }
    console.log('💾 Calendario de pagos actualizado en Supabase');
  }catch(e){ console.error('Red al reemplazar pagos:', e); }
}
