/**
 * Plantilla y helpers de correo — compartidos por las funciones serverless.
 *
 * Vive en `api/_lib/` porque Vercel NO publica como ruta los archivos cuyo
 * nombre (o el de su carpeta) empieza con `_`: se empaquetan junto a la función
 * que los importa, pero no quedan expuestos como endpoint.
 */

// Escapa todo valor interpolado en las plantillas HTML (previene inyección
// de HTML/enlaces en correos con la identidad de la veterinaria).
export const esc = (s: unknown): string =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

// ── Estilos inline ────────────────────────────────────────────────────────
// Los clientes de correo (Gmail app, Outlook.com, Yahoo) descartan el <head> y
// con él la hoja de estilos: si el diseño depende de clases CSS, el correo
// llega sin formato. Por eso cada elemento lleva su `style=` inline y el
// bloque <style> queda solo como refuerzo para los clientes que sí lo soportan.
const S = {
  infoBox:
    'background-color:#fff7ed;border-left:4px solid #f97316;padding:15px;margin:20px 0;border-radius:0 6px 6px 0;',
  infoP: 'margin:5px 0;color:#374151;font-size:16px;line-height:1.6;',
  infoLabel: 'font-weight:bold;color:#9a3412;',
  p: 'margin:0 0 12px 0;color:#374151;font-size:16px;line-height:1.6;',
  h2: 'margin:0 0 16px 0;color:#1f2937;font-size:20px;font-weight:bold;line-height:1.3;',
  small: 'margin:0;color:#6b7280;font-size:13px;line-height:1.5;',
} as const;

// Renderiza una fila de la caja de información solo si el valor tiene contenido.
export const infoRow = (label: string, value: unknown): string =>
  value !== undefined && value !== null && String(value).trim() !== ''
    ? `<p style="${S.infoP}"><span style="${S.infoLabel}">${esc(label)}</span> ${esc(value)}</p>`
    : '';

/** Caja de información naranja (todas las filas ya escapadas por infoRow). */
export const infoBox = (rows: string): string => `<div style="${S.infoBox}">${rows}</div>`;

/** Párrafo del cuerpo. El contenido HTML ya debe venir escapado. */
export const p = (html: string): string => `<p style="${S.p}">${html}</p>`;

/** Título de la sección. */
export const h2 = (html: string): string => `<h2 style="${S.h2}">${html}</h2>`;

/** Nota al pie, en gris y cuerpo chico. */
export const small = (html: string): string => `<p style="${S.small}">${html}</p>`;

/**
 * Botón de llamada a la acción.
 *
 * Maquetado con <table> y no con un <a> estilado: Outlook (motor Word) ignora
 * padding y background en enlaces, y el botón llega como texto plano.
 */
export const cta = (href: string, label: string): string =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px auto;">
     <tr>
       <td align="center" style="background-color:#f97316;border-radius:8px;">
         <a href="${esc(href)}" target="_blank"
            style="display:inline-block;padding:14px 32px;${FONT}font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;">
           ${esc(label)}
         </a>
       </td>
     </tr>
   </table>`;

/**
 * Versión text/plain del correo, derivada del HTML final.
 *
 * Resend NO genera la parte text/plain automáticamente: si solo se envía
 * `html`, cualquier lector que no interprete HTML (cliente en modo texto,
 * pestaña "Plain Text" del panel de Resend, pasarelas corporativas, lectores
 * de pantalla) termina mostrando el marcado crudo. Enviar `text` junto a
 * `html` produce un multipart/alternative correcto y además mejora la
 * reputación anti-spam del remitente.
 */
export function htmlToText(html: string): string {
  return html
    // <head> (incluye <style> y <title>) no aporta texto legible
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    // El href de un enlace sí importa en texto plano: sin él, un correo cuyo
    // único contenido accionable es un botón queda sin enlace utilizable.
    .replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '$2: $1')
    // Saltos de línea a partir de la estructura del documento
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h1|h2|h3|tr|li)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    // Resto de etiquetas
    .replace(/<[^>]+>/g, '')
    // Entidades introducidas por esc()
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // Normaliza espacios y líneas en blanco sobrantes
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Plantilla base para todos los correos.
// Maquetada con <table> y estilos inline: es el único layout que renderiza
// igual en Gmail, Outlook (motor Word) y Apple Mail. Los <div> con flex/grid
// y las clases CSS del <head> no son fiables en correo.
export const FONT = "font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;";

export const baseTemplate = (title: string, content: string) => `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)}</title>
  <style>
    body { ${FONT} background-color: #f9fafb; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; }
    .header { background-color: #f97316; padding: 30px 20px; text-align: center; color: #ffffff; }
    .content { padding: 30px; color: #374151; line-height: 1.6; font-size: 16px; }
    .footer { background-color: #f3f4f6; padding: 20px; text-align: center; color: #6b7280; font-size: 14px; }
  </style>
</head>
<body style="${FONT}background-color:#f9fafb;margin:0;padding:0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f9fafb;padding:20px 10px;">
    <tr>
      <td align="center">
        <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;">
          <tr>
            <td class="header" style="background-color:#f97316;padding:30px 20px;text-align:center;">
              <h1 style="margin:0;${FONT}font-size:24px;font-weight:bold;color:#ffffff;">🐾 Veterinaria Leo</h1>
            </td>
          </tr>
          <tr>
            <td class="content" style="padding:30px;${FONT}color:#374151;line-height:1.6;font-size:16px;">
              ${content}
            </td>
          </tr>
          <tr>
            <td class="footer" style="background-color:#f3f4f6;padding:20px;text-align:center;${FONT}color:#6b7280;font-size:14px;">
              <p style="margin:0 0 6px 0;">Veterinaria Leo - Cuidando a tus mejores amigos</p>
              <p style="margin:0;">Si tienes alguna consulta, no dudes en contactarnos.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
