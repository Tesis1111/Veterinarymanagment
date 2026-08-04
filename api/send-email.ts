/**
 * POST /api/send-email — correos transaccionales del sistema.
 *
 * Exige SIEMPRE una sesión de Firebase (Authorization: Bearer <idToken>).
 * La recuperación de contraseña, que es el único flujo sin sesión, ya no pasa
 * por acá: vive en /api/password-recovery, que además audita la solicitud.
 */
import { VercelRequest, VercelResponse } from '@vercel/node';
import { Resend } from 'resend';
import { baseTemplate, infoBox, infoRow, p, h2, htmlToText, esc } from './_lib/email-template';

// Vercel environment variables
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || 'Veterinaria Leo <notificaciones@notificationvet.com>';
// Misma API key web pública del proyecto (VITE_FIREBASE_API_KEY ya definida en Vercel).
const FIREBASE_API_KEY = process.env.VITE_FIREBASE_API_KEY;

let resend: Resend;
if (RESEND_API_KEY) {
  resend = new Resend(RESEND_API_KEY);
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

    if (!to || typeof to !== 'string' || !EMAIL_RE.test(to)) {
      return res.status(400).json({ error: 'Destinatario inválido' });
    }
    const recipients: string[] = [to];

    // Autenticación: solo usuarios logueados en Firebase pueden enviar correos.
    // Sin excepciones — el flujo sin sesión (recuperación de contraseña) tiene
    // su propio endpoint, /api/password-recovery.
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

      // Los tipos 'admin_password_recovery*' se movieron a
      // /api/password-recovery, que sí puede auditar la solicitud (usa el
      // Admin SDK) y resuelve los destinatarios consultando /usuarios.

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
