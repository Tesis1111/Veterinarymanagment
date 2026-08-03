import { VercelRequest, VercelResponse } from '@vercel/node';
import { Resend } from 'resend';

// Vercel environment variables
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || 'Veterinaria Leo <notificaciones@notificationvet.com>';
// Misma API key web pública del proyecto (VITE_FIREBASE_API_KEY ya definida en Vercel).
const FIREBASE_API_KEY = process.env.VITE_FIREBASE_API_KEY;

let resend: Resend;
if (RESEND_API_KEY) {
  resend = new Resend(RESEND_API_KEY);
}

// Escapa todo valor interpolado en las plantillas HTML (previene inyección
// de HTML/enlaces en correos con la identidad de la veterinaria).
const esc = (s: unknown): string =>
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
} as const;

// Renderiza una fila de la caja de información solo si el valor tiene contenido.
const infoRow = (label: string, value: unknown): string =>
  value !== undefined && value !== null && String(value).trim() !== ''
    ? `<p style="${S.infoP}"><span style="${S.infoLabel}">${esc(label)}</span> ${esc(value)}</p>`
    : '';

/** Caja de información naranja (todas las filas ya escapadas por infoRow). */
const infoBox = (rows: string): string => `<div style="${S.infoBox}">${rows}</div>`;

/** Párrafo del cuerpo. El contenido HTML ya debe venir escapado. */
const p = (html: string): string => `<p style="${S.p}">${html}</p>`;

/** Título de la sección. */
const h2 = (html: string): string => `<h2 style="${S.h2}">${html}</h2>`;

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
function htmlToText(html: string): string {
  return html
    // <head> (incluye <style> y <title>) no aporta texto legible
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_SUBJECT_LEN = 200;
const MAX_ATTACHMENT_LEN = 4 * 1024 * 1024; // ~3MB de PDF/imágenes en base64 (total)
const MAX_ATTACHMENTS_COUNT = 6;

// Cache de tokens verificados y rate limit por uid. Son Maps por instancia de
// la función serverless (best-effort): reducen llamadas a Google y ponen
// fricción al abuso, sin pretender ser un límite global exacto.
const tokenCache = new Map<string, { uid: string; expiresAt: number }>();
const TOKEN_CACHE_TTL_MS = 5 * 60 * 1000;
const rateBuckets = new Map<string, { count: number; windowStart: number }>();
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX_PER_WINDOW = 20;

// Rate limiting por IP (para solicitudes sin sesión)
const ipRateBuckets = new Map<string, { count: number; windowStart: number }>();
const IP_RATE_WINDOW_MS = 5 * 60 * 1000; // 5 minutos
const IP_RATE_MAX_PER_WINDOW = 5; // máximo 5 solicitudes por IP cada 5 minutos

function isRateLimitedByIp(ip: string): boolean {
  const now = Date.now();
  const bucket = ipRateBuckets.get(ip);
  if (!bucket || now - bucket.windowStart > IP_RATE_WINDOW_MS) {
    ipRateBuckets.set(ip, { count: 1, windowStart: now });
    return false;
  }
  bucket.count += 1;
  return bucket.count > IP_RATE_MAX_PER_WINDOW;
}


// ── Recuperación de contraseña: destinatario ───────────────────────────────

/**
 * Único administrador que recibe los avisos de recuperación de contraseña.
 *
 * Se resuelve en el SERVIDOR a propósito. Éste es el único endpoint que se
 * invoca sin sesión (quien olvidó su contraseña no está autenticado), así que
 * si el destinatario viniera en el cuerpo del pedido, cualquiera podría usarlo
 * para mandar correos con la identidad de la veterinaria a quien quisiera.
 *
 * Configurable con ADMIN_NOTIFICATION_EMAIL en Vercel por si cambia la persona
 * a cargo, sin tener que tocar el código.
 */
const ADMIN_NOTIFICATION_EMAIL =
  process.env.ADMIN_NOTIFICATION_EMAIL?.trim() || 'tesisdeies@gmail.com';

async function verifyIdToken(idToken: string): Promise<string | null> {
  const cached = tokenCache.get(idToken);
  if (cached && cached.expiresAt > Date.now()) return cached.uid;

  if (!FIREBASE_API_KEY) {
    console.error('Missing VITE_FIREBASE_API_KEY environment variable.');
    return null;
  }
  const resp = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    }
  );
  if (!resp.ok) return null;
  const body: any = await resp.json();
  const uid = body?.users?.[0]?.localId;
  if (!uid) return null;

  tokenCache.set(idToken, { uid, expiresAt: Date.now() + TOKEN_CACHE_TTL_MS });
  if (tokenCache.size > 500) {
    for (const [k, v] of tokenCache) if (v.expiresAt <= Date.now()) tokenCache.delete(k);
  }
  return uid;
}

function isRateLimited(uid: string): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(uid);
  if (!bucket || now - bucket.windowStart > RATE_WINDOW_MS) {
    rateBuckets.set(uid, { count: 1, windowStart: now });
    return false;
  }
  bucket.count += 1;
  return bucket.count > RATE_MAX_PER_WINDOW;
}

// Plantilla base para todos los correos.
// Maquetada con <table> y estilos inline: es el único layout que renderiza
// igual en Gmail, Outlook (motor Word) y Apple Mail. Los <div> con flex/grid
// y las clases CSS del <head> no son fiables en correo.
const FONT = "font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;";

const baseTemplate = (title: string, content: string) => `<!DOCTYPE html>
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!RESEND_API_KEY) {
    console.error("Missing RESEND_API_KEY environment variable.");
    return res.status(500).json({ error: 'Configuración de servidor incompleta (API Key).' });
  }

  try {
    const { to, subject, type, data = {}, attachmentBase64, attachments: rawAttachments } = req.body;

    if (!subject || !type) {
      return res.status(400).json({ error: 'Faltan campos obligatorios: subject, type' });
    }
    if (typeof subject !== 'string' || subject.length > MAX_SUBJECT_LEN) {
      return res.status(400).json({ error: 'Asunto inválido' });
    }

    const isAdminRecovery = type === 'admin_password_recovery' || type === 'admin_password_recovery_error';

    // Destinatario final. En la recuperación lo define el servidor; en el
    // resto, el cliente autenticado.
    let recipients: string[] = [];

    if (isAdminRecovery) {
      const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
      const clientIp = Array.isArray(ip) ? ip[0] : String(ip).split(',')[0].trim();
      if (isRateLimitedByIp(clientIp)) {
        return res.status(429).json({ error: 'Demasiadas solicitudes de recuperación. Intente en unos minutos.' });
      }

      const recoveryEmail = String(data.recoveryEmail ?? '').trim().toLowerCase();
      if (!EMAIL_RE.test(recoveryEmail)) {
        return res.status(400).json({ error: 'Correo de recuperación inválido' });
      }

      // El campo `to` del cuerpo se ignora deliberadamente: el destinatario lo
      // fija el servidor, nunca el navegador.
      recipients = [ADMIN_NOTIFICATION_EMAIL];
      // La IP real la ve el servidor; la del cliente solo se usa como respaldo.
      data.ip = clientIp || data.ip;
    } else {
      if (!to || typeof to !== 'string' || !EMAIL_RE.test(to)) {
        return res.status(400).json({ error: 'Destinatario inválido' });
      }
      recipients = [to];

      // Autenticación: solo usuarios logueados en Firebase pueden enviar correos.
      const authHeader = req.headers.authorization || '';
      const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
      if (!idToken) {
        return res.status(401).json({ error: 'No autenticado' });
      }
      const uid = await verifyIdToken(idToken);
      if (!uid) {
        return res.status(401).json({ error: 'Token inválido o expirado' });
      }
      if (isRateLimited(uid)) {
        return res.status(429).json({ error: 'Demasiados correos, intente en un minuto' });
      }
    }
    let htmlContent = '';

    switch (type) {
      case 'appointment_created':
        htmlContent = baseTemplate(
          'Turno Confirmado',
          `${h2(`¡Hola ${esc(data.clientName)}!`)}
           ${p(`Te confirmamos que el turno para <strong>${esc(data.petName)}</strong> ha sido agendado exitosamente.`)}
           ${infoBox(`
             ${infoRow('📅 Fecha:', data.date)}
             ${infoRow('🕒 Hora:', data.time)}
             ${infoRow('👨‍⚕️ Veterinario:', data.doctorName)}
             ${infoRow('🏥 Motivo:', data.reason)}
           `)}
           ${p('Por favor, recuerda llegar 10 minutos antes. ¡Los esperamos!')}`
        );
        break;

      case 'appointment_cancelled':
        htmlContent = baseTemplate(
          'Turno Cancelado',
          `${h2(`Hola ${esc(data.clientName)},`)}
           ${p(`Te informamos que el turno de <strong>${esc(data.petName)}</strong> ha sido cancelado.`)}
           ${infoBox(`
             ${infoRow('📅 Fecha original:', data.date)}
             ${infoRow('🕒 Hora original:', data.time)}
           `)}
           ${p('Si deseas reprogramarlo, puedes contactarnos o gestionarlo a través de nuestro sistema.')}`
        );
        break;

      case 'appointment_rescheduled':
        htmlContent = baseTemplate(
          'Turno Reprogramado',
          `${h2(`Hola ${esc(data.clientName)},`)}
           ${p(`El turno de <strong>${esc(data.petName)}</strong> ha sido reprogramado con éxito.`)}
           ${infoBox(`
             ${infoRow('❌ Fecha anterior:', `${data.oldDate ?? ''} a las ${data.oldTime ?? ''}`)}
             ${infoRow('✅ Nueva Fecha:', data.newDate)}
             ${infoRow('✅ Nueva Hora:', data.newTime)}
           `)}
           ${p('¡Nos vemos pronto!')}`
        );
        break;

      case 'welcome':
        htmlContent = baseTemplate(
          '¡Bienvenido a Veterinaria Leo!',
          `${h2(`¡Hola ${esc(data.clientName)}!`)}
           ${p('Queremos darte la bienvenida a nuestra familia. En <strong>Veterinaria Leo</strong> estamos felices de poder cuidar la salud y bienestar de tus mascotas.')}
           ${p('Ya puedes comenzar a gestionar tus turnos y acceder al historial clínico a través de nuestro sistema.')}`
        );
        break;

      case 'pet_registered':
        htmlContent = baseTemplate(
          'Mascota Registrada',
          `${h2(`¡Hola ${esc(data.clientName)}!`)}
           ${p(`Te confirmamos que tu mascota <strong>${esc(data.petName)}</strong> ha sido registrada correctamente en nuestro sistema.`)}
           ${infoBox(`
             ${infoRow('🐾 Mascota:', data.petName)}
             ${infoRow('🧬 Especie:', data.species)}
             ${infoRow('🏷️ Raza:', data.breed)}
           `)}
           ${p('Ya podemos empezar a llevar su historial clínico al día. ¡Gracias por confiar en nosotros!')}`
        );
        break;

      case 'clinical_history':
        htmlContent = baseTemplate(
          'Historial Clínico',
          `${h2(`Hola ${esc(data.clientName)},`)}
           ${p(`Adjunto a este correo encontrarás el historial clínico actualizado de <strong>${esc(data.petName)}</strong>.`)}
           ${p('Si tienes alguna duda sobre las indicaciones o los registros, no dudes en consultarnos.')}`
        );
        break;

      case 'clinical_record':
        htmlContent = baseTemplate(
          'Registro de Historial Clínico',
          `${h2(`Hola ${esc(data.clientName)},`)}
           ${p(`Compartimos contigo el detalle del registro clínico de <strong>${esc(data.petName)}</strong>.`)}
           ${infoBox(`
             ${infoRow('🐾 Mascota:', data.petName)}
             ${infoRow('📅 Fecha:', data.date)}
             ${infoRow('🏥 Tipo de evento:', data.eventType)}
             ${infoRow('👨‍⚕️ Profesional:', data.doctorName)}
             ${infoRow('⚖️ Peso:', data.weight ? `${data.weight} kg` : '')}
             ${infoRow('🌡️ Temperatura:', data.temperature ? `${data.temperature} °C` : '')}
             ${infoRow('❤️ Frec. cardíaca:', data.heartRate)}
             ${infoRow('🫁 Frec. respiratoria:', data.respiratoryRate)}
             ${infoRow('🔬 Diagnóstico:', data.diagnosis)}
             ${infoRow('💉 Tratamiento:', data.treatment)}
             ${infoRow('💊 Medicación:', data.medication)}
             ${infoRow('📝 Descripción:', data.description)}
             ${infoRow('🗒️ Observaciones:', data.notes)}
             ${infoRow('🔔 Próximo control:', data.nextAppointmentDate)}
           `)}
           ${data.hasAttachments ? p('📎 Adjuntamos a este correo los archivos e imágenes asociados a este registro.') : ''}
           ${p('Si tienes alguna duda sobre las indicaciones o los registros, no dudes en consultarnos.')}`
        );
        break;

      case 'admin_password_recovery':
        htmlContent = baseTemplate(
          'Solicitud de recuperación de contraseña',
          `${h2('Nueva solicitud de recuperación de contraseña')}
           ${p('Se ha registrado una solicitud de restablecimiento de contraseña en el sistema.')}
           ${infoBox(`
             ${infoRow('📧 Correo solicitado:', data.recoveryEmail)}
             ${infoRow('📅 Fecha:', data.date)}
             ${infoRow('🕒 Hora:', data.time)}
             ${infoRow('🌐 IP:', data.ip)}
             ${infoRow('💻 Navegador:', data.browser)}
             ${infoRow('🖥️ Sistema:', data.os)}
             ${infoRow('📍 Origen:', data.origin)}
             ${infoRow('✅ Estado:', data.status)}
           `)}
           ${p('Este es un aviso automático de seguridad. Si no reconoces esta actividad, revisa el registro de auditoría del sistema.')}`
        );
        break;

      case 'admin_password_recovery_error':
        htmlContent = baseTemplate(
          'Error en recuperación de contraseña',
          `${h2('⚠️ Error al procesar una recuperación de contraseña')}
           ${p('Se produjo un error al intentar procesar una solicitud de restablecimiento de contraseña.')}
           ${infoBox(`
             ${infoRow('📧 Correo solicitado:', data.recoveryEmail)}
             ${infoRow('📅 Fecha:', data.date)}
             ${infoRow('🕒 Hora:', data.time)}
             ${infoRow('🌐 IP:', data.ip)}
             ${infoRow('💻 Navegador:', data.browser)}
             ${infoRow('🖥️ Sistema:', data.os)}
             ${infoRow('📍 Origen:', data.origin)}
             ${infoRow('❌ Estado:', data.status)}
             ${infoRow('🔎 Detalle:', data.errorDetails)}
           `)}
           ${p('Este es un aviso automático de seguridad. Revisa la configuración de autenticación si el error persiste.')}`
        );
        break;

      case 'reminder':
        htmlContent = baseTemplate(
          'Recordatorio Importante',
          `${h2(`Hola ${esc(data.clientName)},`)}
           ${p(`Queremos recordarte sobre una fecha importante para <strong>${esc(data.petName)}</strong>.`)}
           ${infoBox(`
             ${infoRow('🔔 Tipo:', data.reminderType)}
             ${infoRow('📅 Fecha aproximada:', data.date)}
             ${infoRow('📝 Detalle:', data.notes)}
           `)}
           ${p('Contactanos para agendar un turno lo antes posible para mantener su calendario al día.')}`
        );
        break;

      // 'password_recovery' se eliminó: la recuperación usa el flujo oficial de
      // Firebase Auth (sendPasswordResetEmail) y este endpoint exige sesión.

      default:
        return res.status(400).json({ error: 'Tipo de correo no soportado' });
    }

    // Configurar el objeto de envío.
    // `text` acompaña siempre a `html`: sin la parte text/plain, un lector que
    // no interprete HTML muestra el marcado crudo en lugar del mensaje.
    const emailPayload: any = {
      from: EMAIL_FROM,
      to: recipients,
      subject,
      html: htmlContent,
      text: htmlToText(htmlContent),
    };

    // Agregar adjuntos si existen. Se soportan dos formatos:
    //   • attachmentBase64: un PDF del historial completo (flujo "Enviar por Correo").
    //   • attachments: lista [{ filename, content }] con imágenes/PDF de un registro.
    // Resend infiere el content-type desde la extensión del filename.
    const normalizedAttachments: { filename: string; content: string }[] = [];
    let totalAttachmentLen = 0;

    if (attachmentBase64 !== undefined) {
      if (typeof attachmentBase64 !== 'string' || attachmentBase64.length > MAX_ATTACHMENT_LEN) {
        return res.status(400).json({ error: 'Adjunto inválido o demasiado grande' });
      }
      const safePetName = String(data.petName ?? 'mascota').replace(/[^\w\s.-]/g, '').trim() || 'mascota';
      normalizedAttachments.push({
        filename: `Historial_Clinico_${safePetName}.pdf`,
        content: attachmentBase64.split(',')[1] || attachmentBase64, // Remove data URI prefix if present
      });
      totalAttachmentLen += attachmentBase64.length;
    }

    if (rawAttachments !== undefined) {
      if (!Array.isArray(rawAttachments) || rawAttachments.length > MAX_ATTACHMENTS_COUNT) {
        return res.status(400).json({ error: 'Adjuntos inválidos o demasiados archivos' });
      }
      for (const att of rawAttachments) {
        if (!att || typeof att.filename !== 'string' || typeof att.content !== 'string') {
          return res.status(400).json({ error: 'Formato de adjunto inválido' });
        }
        const content = att.content.split(',')[1] || att.content; // Remove data URI prefix if present
        totalAttachmentLen += content.length;
        if (totalAttachmentLen > MAX_ATTACHMENT_LEN) {
          return res.status(400).json({ error: 'Adjuntos demasiado grandes' });
        }
        const safeName = att.filename.replace(/[^\w\s.\-()]/g, '').trim().slice(0, 120) || 'adjunto';
        normalizedAttachments.push({ filename: safeName, content });
      }
    }

    if (normalizedAttachments.length > 0) {
      emailPayload.attachments = normalizedAttachments;
    }

    const { data: resendData, error } = await resend.emails.send(emailPayload);

    if (error) {
      console.error('Resend API Error:', error);
      return res.status(400).json({ error: error.message });
    }

    return res.status(200).json({ success: true, id: resendData?.id });
  } catch (error: any) {
    console.error('Serverless Error:', error);
    return res.status(500).json({ error: error.message || 'Error interno del servidor al enviar correo' });
  }
}
