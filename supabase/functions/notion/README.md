# Conexión del portal con Notion (citas)

Las citas del portal se copian solas a una tabla de Notion. El navegador nunca ve la llave de Notion: la guarda esta
función de Supabase (`index.ts`) como **secreto**.

```
Portal (navegador)  →  función «notion» en Supabase (guarda la llave)  →  API de Notion
```

## 0. Requisitos
- **Publicar primero la función `google-auth`** (ver `supabase/functions/google-auth/README.md`). Al entrar al portal con
  usuario y código, esa función da a cada navegador un «pase» firmado; la función de Notion solo acepta llamadas con ese
  pase, así nadie de fuera puede escribir en tu tabla.
- Cada persona: **Salir y volver a entrar** al portal una vez, para recibir su pase.
- Tu tabla debe tener una columna de tipo **Texto** llamada **«ID portal»** (obligatoria, ver abajo).

## 1. Notion (ya hecho)
- Integración creada en notion.so/my-integrations (de ahí sale la llave, `ntn_…` o `secret_…`).
- Tabla de citas conectada a la integración: en la tabla, **⋯ → Conexiones → tu integración**.
- Database ID: los 32 caracteres de la URL de la tabla, antes del `?`.

## 2. Supabase (desde el navegador, sin instalar nada)
1. Entra a **supabase.com → tu proyecto → Edge Functions → Deploy a new function → Via Editor**.
2. Nombre de la función: **`notion`** (exactamente así).
3. Borra el ejemplo, pega **todo** el contenido de `supabase/functions/notion/index.ts` y presiona **Deploy**.
4. Ve a **Edge Functions → Secrets** y agrega dos secretos:
   - `NOTION_TOKEN` = la llave de la integración de Notion
   - `NOTION_DB_CITAS` = el Database ID de la tabla
5. Deja activada la opción **«Verify JWT»** de la función (viene así por defecto; el portal ya manda la llave pública de Supabase).

> **Nunca** pegues la llave de Notion en archivos del proyecto ni en GitHub. Si ya se subió o se pegó en un chat,
> genera una nueva en notion.so/my-integrations.

## 3. Probar
1. Abre el portal, inicia sesión y presiona **F12 → Consola**.
2. Escribe `notionProbar()` y Enter. Debe salir la lista de columnas de tu tabla y cuáles usa el portal.
   - «La llave de Notion no es válida» → revisa `NOTION_TOKEN`.
   - «Notion no encuentra la tabla» → revisa `NOTION_DB_CITAS` y que la tabla esté en **Conexiones**.
3. A los pocos segundos tus citas empiezan a aparecer en Notion. En **Citas** aparece la etiqueta **«Notion ✓»**.

## Columnas que se llenan
Se reconocen por nombre (sin importar acentos ni mayúsculas). Las que tu tabla no tenga simplemente se omiten.

| Dato del portal | Nombres de columna que reconoce | Tipos aceptados |
|---|---|---|
| Nombre de la cita | la columna de título (la principal) | título |
| Fecha y hora (con fin) | Fecha, Fecha y hora, Cuándo, Horario | fecha |
| Cliente | Cliente, Empresa, Nombre del cliente | texto, selección |
| Proyecto | Proyecto, Servicio | texto, selección |
| Responsable | Responsable, Asesor, Consultor, Encargado | texto, selección |
| Enlace de Meet | Enlace de Google Meet, Meet, Link Meet, Videollamada | URL, texto |
| Estado | Estado, Estatus, Status | selección, status, texto |
| Lugar | Lugar, Modalidad, Ubicación, Dirección | texto, selección |
| Objetivo | Objetivo, Notas, Descripción, Tema, Motivo | texto |
| Teléfono / correo del cliente | Teléfono, Celular, WhatsApp / Correo, Email | teléfono / email, texto |
| Link para abrir en el portal | Link al portal, Portal | URL |
| Id de la cita | **ID portal** | texto |

**Obligatorio:** una columna de tipo **Texto** llamada **«ID portal»**. Con ella cada cita tiene una sola página,
aunque la manden dos pestañas o dos computadoras. Sin ella la función no crea páginas (para no duplicar) y en el panel
de Citas aparece «Notion: error».

**Estado:** el portal usa Pendiente, Confirmada, Reprogramar, Cancelada y Realizada. Si tu columna ya tiene opciones
parecidas (por ejemplo «Confirmado»), se usan esas. En una columna de tipo *status* de Notion solo se escriben opciones que ya existan.

## Cómo funciona
- Cada cita la manda el navegador de su **responsable** (o del responsable de la tarea), al abrir el portal, cada 2 minutos
  y a los 5 segundos de cualquier cambio. Entre pestañas del mismo navegador solo una envía a la vez.
- Se mandan las citas de **7 días atrás en adelante**, hasta 25 por vuelta.
- La función busca la página por «ID portal»: si existe la **actualiza**, si no la crea. El portal no escribe nada en las tareas.
- Si Notion rechaza una cita (por ejemplo un dato inválido), se anota en la consola (F12) y se sigue con las demás; esa
  cita se vuelve a intentar cuando cambie.
- El portal **nunca borra** nada en Notion. Una cita cancelada queda con estado «Cancelada».
- Si la función no está publicada o Notion falla, el portal sigue funcionando normal y lo reintenta solo.

---
> **[2026-10-29] Ya no se usa.** El puente con Notion se movió a Google Apps Script: ver `apps-script/notion-puente/README.md`.
> Esta función se conserva solo como referencia.
