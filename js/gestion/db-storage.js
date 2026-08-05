// ============================================================
//  Imágenes ↔ Supabase Storage (bucket "imagenes")
//  Sube el archivo al bucket y devuelve su URL pública.
//  En las tablas se guarda solo esa URL (no la imagen).
// ============================================================

// Convierte un dataURL (base64) en un Blob subible.
function dataUrlToBlob(dataUrl){
  const parts = dataUrl.split(',');
  const head = parts[0] || '';
  const b64 = parts[1] || '';
  const mime = (head.match(/data:(.*?);/) || [])[1] || 'image/jpeg';
  const bin = atob(b64);
  const len = bin.length;
  const arr = new Uint8Array(len);
  for (let i = 0; i < len; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

// Sube una imagen (Blob) al bucket y devuelve la URL pública.
// folder: subcarpeta lógica dentro del bucket (ej. 'personal', 'login').
async function dbUploadImage(blob, folder){
  const path = (folder || 'misc') + '/' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '.jpg';
  const { error } = await sb.storage.from('imagenes').upload(path, blob, {
    upsert: true,
    contentType: 'image/jpeg'
  });
  if (error) throw error;
  const { data } = sb.storage.from('imagenes').getPublicUrl(path);
  return data.publicUrl;
}
