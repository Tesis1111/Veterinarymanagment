/**
 * POST /api/password-recovery — recuperación de contraseña, de punta a punta.
 *
 * El navegador solo manda un correo electrónico. Todo lo demás ocurre acá:
 * validar, limitar, resolver la cuenta, generar el enlace, enviar el correo con
 * la identidad de la veterinaria, auditar y avisar a los administradores.
 *
 * Por qué el flujo vive en el servidor y no en el cliente:
 *
 *   • AUDITORÍA. Es el único flujo sin sesión del sistema. Desde el navegador,
 *     `request.auth` es null y las reglas de Firestore rechazan toda escritura
 *     en /auditoria y /email_logs, así que ninguna solicitud quedaba registrada
 *     —justo en la operación más sensible—. El Admin SDK no pasa por las reglas
 *     y deja el rastro completo sin necesidad de aflojar ninguna.
 *
 *   • LIMITACIÓN REAL. El freno anterior vivía en localStorage (se saltea con
 *     una ventana de incógnito) y en un Map en memoria de la función serverless
 *     (se pierde en cada arranque en frío y no se comparte entre instancias).
 *     Ahora el contador está en Firestore: uno solo, para todas las instancias.
 *
 *   • ORDEN CORRECTO. Antes el correo de restablecimiento salía ANTES de
 *     consultar el límite, de modo que el 429 llegaba tarde: el correo ya se
 *     había enviado. Acá no se genera ningún enlace hasta que el cupo está
 *     confirmado.
 *
 *   • IDENTIDAD PROPIA. `generatePasswordResetLink()` devuelve el enlace sin
 *     enviar nada, así que el correo sale por Resend con la misma plantilla que
 *     el resto del sistema, en vez del genérico de Firebase.
 *
 * La respuesta es SIEMPRE la misma (200 con el mismo cuerpo) exista la cuenta,
 * esté dada de baja o se haya superado el cupo: es lo que impide usar esta
 * pantalla para averiguar qué correos están registrados en el sistema.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Resend } from 'resend';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb, ADMIN_CONFIGURED } from './_lib/firebase-admin';
import { consumeRateLimit } from './_lib/rate-limit';
import {
  baseTemplate, infoBox, infoRow, p, h2, small, cta, htmlToText, esc,
} from './_lib/email-template';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || 'Veterinaria Leo <notificaciones@notificationvet.com>';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── Cupos ──────────────────────────────────────────────────────────────────
// Por IP: frena el barrido masivo de direcciones desde un mismo origen.
// Por correo: frena el hostigamiento a un empleado concreto rotando IPs
// (con solo el límite por IP, una botnet llena su casilla igual).
const IP_MAX = 5;
const IP_WINDOW_MS = 15 * 60 * 1000;
const EMAIL_MAX = 3;
const EMAIL_WINDOW_MS = 60 * 60 * 1000;

/**
 * Piso de duración de la respuesta.
 *
 * Sin esto, el tiempo de respuesta delata el resultado: una cuenta inexistente
 * se resuelve en milisegundos, mientras que una real implica generar el enlace
 * y llamar a Resend. Esa diferencia es un canal lateral que permite enumerar
 * usuarios aunque el mensaje sea idéntico.
 */
const MIN_RESPONSE_MS = 900;

/** Respuesta única del endpoint. No varía jamás según el estado de la cuenta. */
const NEUTRAL_RESPONSE = {
  ok: true,
  message:
    'Si existe una cuenta asociada a este correo electrónico, recibirás un enlace para restablecer tu contraseña.',
};

// ── Agente de usuario ──────────────────────────────────────────────────────
// Se interpreta en el servidor a partir de la cabecera User-Agent. Antes lo
// hacía el navegador y lo mandaba en el cuerpo, algo que cualquiera podía
// falsificar y que además obligaba al cliente a cargar el parser.
function parseUA(ua: string): { browser: string; os: string } {
  let browser = 'Desconocido';
  let os = 'Desconocido';

  if (/Windows NT 10\.0/i.test(ua)) os = 'Windows 10/11';
  else if (/Windows NT 6\.3/i.test(ua)) os = 'Windows 8.1';
  else if (/Windows NT 6\.1/i.test(ua)) os = 'Windows 7';
  else if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
  else if (/Macintosh|Mac OS/i.test(ua)) os = 'macOS';
  else if (/Linux/i.test(ua)) os = 'Linux';

  if (/Edg/i.test(ua)) {
    browser = 'Microsoft Edge';
  } else if (/Chrome/i.test(ua) && !/Chromium/i.test(ua)) {
    const m = ua.match(/Chrome\/([0-9]+)/);
    browser = m ? `Google Chrome ${m[1]}` : 'Google Chrome';
  } else if (/Firefox/i.test(ua)) {
    const m = ua.match(/Firefox\/([0-9]+)/);
    browser = m ? `Firefox ${m[1]}` : 'Firefox';
  } else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) {
    browser = 'Safari';
  }

  return { browser, os };
}

/**
 * IP real del cliente, tomada de la cabecera que inyecta el proxy de Vercel.
 *
 * Antes el navegador la pedía a api.ipify.org, lo cual: (a) la propia
 * Content-Security-Policy del sitio lo bloqueaba, porque ese dominio no está en
 * `connect-src`, de modo que siempre terminaba en "127.0.0.1"; (b) era una
 * llamada a un tercero esperada con await en el camino crítico; y (c) sobraba,
 * porque este valor pisaba al del cliente de todos modos.
 */
function getClientIp(req: VercelRequest): string {
  const fwd = req.headers['x-forwarded-for'];
  const raw = Array.isArray(fwd) ? fwd[0] : fwd;
  if (raw) return String(raw).split(',')[0].trim();
  return req.socket?.remoteAddress || 'desconocida';
}

/** URL pública de la app, para el enlace de regreso tras el restablecimiento. */
function getAppUrl(req: VercelRequest): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, '');
  const proto = (req.headers['x-forwarded-proto'] as string) || 'https';
  const host = req.headers.host;
  return host ? `${proto}://${host}` : '';
}

/** Espera lo que falte para alcanzar el piso de duración de la respuesta. */
async function padDuration(startedAt: number): Promise<void> {
  const elapsed = Date.now() - startedAt;
  if (elapsed < MIN_RESPONSE_MS) {
    await new Promise((r) => setTimeout(r, MIN_RESPONSE_MS - elapsed));
  }
}

// ── Contexto de la solicitud, para auditoría y avisos ──────────────────────
interface RequestContext {
  email: string;
  ip: string;
  userAgent: string;
  browser: string;
  os: string;
  date: string;
  time: string;
}

/**
 * Resultado de la solicitud. Se registra en la auditoría y se le informa al
 * administrador, pero NUNCA se le devuelve al cliente.
 */
type Outcome =
  | 'enlace_enviado'      // cuenta activa: se envió el enlace
  | 'cuenta_inactiva'     // existe pero está dada de baja: no se envía nada
  | 'cuenta_inexistente'  // no hay cuenta con ese correo
  | 'limite_superado'     // superó el cupo de solicitudes
  | 'error_interno';      // falló la generación o el envío

const OUTCOME_LABEL: Record<Outcome, string> = {
  enlace_enviado: 'Enlace de restablecimiento enviado',
  cuenta_inactiva: 'Cuenta dada de baja — no se envió enlace',
  cuenta_inexistente: 'No existe una cuenta con ese correo — no se envió enlace',
  limite_superado: 'Bloqueada por exceso de solicitudes',
  error_interno: 'Error interno al procesar la solicitud',
};

// ── Registro en /auditoria ─────────────────────────────────────────────────

/**
 * Deja constancia de la solicitud. Es la pieza que faltaba: hasta ahora la
 * recuperación de contraseña era la única operación del sistema sin rastro.
 *
 * Nunca lanza: un fallo de auditoría no puede dejar sin recuperar la contraseña
 * a un usuario legítimo.
 */
async function registrarAuditoria(
  ctx: RequestContext,
  outcome: Outcome,
  perfil: { uid: string; fullName: string; roleName: string } | null
): Promise<void> {
  try {
    const payload: Record<string, unknown> = {
      // Si la cuenta no existe no hay uid al que atribuir el intento; se
      // etiqueta como anónimo para que el registro siga siendo consultable.
      userId: perfil?.uid ?? 'anonimo',
      userName: perfil?.fullName || 'Solicitante no identificado',
      userRole: perfil?.roleName || 'desconocido',
      action: outcome === 'limite_superado' ? 'PASSWORD_RESET_BLOCKED' : 'PASSWORD_RESET_REQUEST',
      module: 'security',
      entityType: 'usuario',
      details: `Solicitud de restablecimiento para ${ctx.email} — ${OUTCOME_LABEL[outcome]}`,
      // El detalle de si la cuenta existe queda acá, visible solo para el
      // administrador que lee la auditoría, nunca en la respuesta HTTP.
      newValues: {
        correoSolicitado: ctx.email,
        resultado: outcome,
        cuentaExiste: perfil !== null,
        navegador: ctx.browser,
        sistema: ctx.os,
      },
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
      timestamp: FieldValue.serverTimestamp(),
    };
    if (perfil?.uid) payload.entityId = perfil.uid;

    await adminDb().collection('auditoria').add(payload);
  } catch (err) {
    console.error('[password-recovery] No se pudo registrar la auditoría:', err);
  }
}

/** Registra el envío en /email_logs, con el mismo shape que resendService. */
async function registrarEmailLog(
  destinatario: string,
  asunto: string,
  tipo: string,
  estado: 'enviado' | 'error',
  idResend: string | null,
  mensajeError: string | null
): Promise<void> {
  try {
    await adminDb().collection('email_logs').add({
      destinatario,
      asunto,
      fecha: FieldValue.serverTimestamp(),
      tipo_correo: tipo,
      estado,
      id_resend: idResend,
      mensaje_error: mensajeError,
      // El envío lo hace el sistema, no una persona: queda explícito en lugar
      // del 'No autenticado' anterior, que además hacía que la regla de
      // Firestore rechazara siempre la escritura desde el navegador.
      userId: 'sistema',
    });
  } catch (err) {
    console.error('[password-recovery] No se pudo registrar el log de correo:', err);
  }
}

// ── Destinatarios del aviso ────────────────────────────────────────────────

/**
 * Administradores activos que reciben el aviso de seguridad.
 *
 * Se consultan de verdad en /usuarios, que es lo que la documentación del
 * sistema decía desde el principio. Antes había una única constante con un
 * Gmail de pruebas como valor por defecto: si la variable de entorno faltaba en
 * el despliegue, todos los avisos —con el correo del solicitante, su IP y su
 * dispositivo— se iban en silencio a esa casilla.
 *
 * ADMIN_NOTIFICATION_EMAIL sigue existiendo, pero ahora solo AÑADE un
 * destinatario fijo; no reemplaza a los administradores reales.
 */
async function getAdminRecipients(): Promise<string[]> {
  const recipients = new Set<string>();

  try {
    const snap = await adminDb()
      .collection('usuarios')
      .where('roleName', '==', 'admin')
      .where('active', '==', true)
      .get();

    for (const doc of snap.docs) {
      const email = String(doc.data().email ?? '').trim().toLowerCase();
      if (EMAIL_RE.test(email)) recipients.add(email);
    }
  } catch (err) {
    console.error('[password-recovery] No se pudo resolver la lista de administradores:', err);
  }

  const extra = process.env.ADMIN_NOTIFICATION_EMAIL?.trim().toLowerCase();
  if (extra && EMAIL_RE.test(extra)) recipients.add(extra);

  if (recipients.size === 0) {
    // Sin destinatario, el aviso se pierde. Se registra como error de
    // configuración en lugar de recurrir a una casilla por defecto.
    console.error(
      '[password-recovery] No hay administradores activos con correo válido en /usuarios ' +
      'ni ADMIN_NOTIFICATION_EMAIL definido: el aviso de seguridad no se enviará.'
    );
  }

  return Array.from(recipients);
}

// ── Plantillas ─────────────────────────────────────────────────────────────

function buildResetEmail(link: string, nombre: string, appUrl: string): string {
  return baseTemplate(
    'Restablecer contraseña',
    `${h2(`Hola ${esc(nombre)},`)}
     ${p('Recibimos una solicitud para restablecer la contraseña de tu cuenta en el sistema de <strong>Veterinaria Leo</strong>.')}
     ${p('Para elegir una contraseña nueva, hacé clic en el botón:')}
     ${cta(link, 'Restablecer mi contraseña')}
     ${p('El enlace vence en <strong>1 hora</strong> y solo puede usarse una vez.')}
     ${small(
       'Si no pediste este cambio, podés ignorar este correo: tu contraseña actual seguirá funcionando. ' +
       'Por seguridad, esta solicitud quedó registrada en la auditoría del sistema y se notificó a los administradores.'
     )}
     ${small(`Si el botón no funciona, copiá esta dirección en tu navegador:<br>${esc(link)}`)}
     ${appUrl ? small(`Volver al sistema: ${esc(appUrl)}`) : ''}`
  );
}

function buildAdminNotice(ctx: RequestContext, outcome: Outcome, detalleError?: string): string {
  const esIncidencia = outcome === 'limite_superado' || outcome === 'error_interno';

  return baseTemplate(
    esIncidencia ? 'Incidencia en recuperación de contraseña' : 'Solicitud de recuperación de contraseña',
    `${h2(esIncidencia
        ? '⚠️ Incidencia al procesar una recuperación de contraseña'
        : 'Nueva solicitud de recuperación de contraseña')}
     ${p('Se registró una solicitud de restablecimiento de contraseña en el sistema.')}
     ${infoBox(`
       ${infoRow('📧 Correo solicitado:', ctx.email)}
       ${infoRow('📅 Fecha:', ctx.date)}
       ${infoRow('🕒 Hora:', ctx.time)}
       ${infoRow('🌐 IP:', ctx.ip)}
       ${infoRow('💻 Navegador:', ctx.browser)}
       ${infoRow('🖥️ Sistema:', ctx.os)}
       ${infoRow('📍 Origen:', 'Pantalla de inicio de sesión')}
       ${infoRow(esIncidencia ? '❌ Resultado:' : '✅ Resultado:', OUTCOME_LABEL[outcome])}
       ${infoRow('🔎 Detalle:', detalleError)}
     `)}
     ${outcome === 'cuenta_inactiva'
        ? p('<strong>Atención:</strong> la cuenta existe pero está dada de baja. No se envió ningún enlace. Si esta persona ya no forma parte del personal, conviene revisar por qué se sigue intentando acceder.')
        : ''}
     ${outcome === 'limite_superado'
        ? p('<strong>Atención:</strong> este origen superó el número de solicitudes permitidas. Puede tratarse de un usuario con dificultades o de un intento de abuso del formulario.')
        : ''}
     ${p('Este es un aviso automático de seguridad. El detalle completo está en el módulo de Auditoría, filtrando por el módulo «security».')}`
  );
}

// ── Handler ────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const startedAt = Date.now();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Errores de configuración: son los únicos que rompen el contrato de
  // "responder siempre lo mismo", porque no tiene sentido fingir que la
  // solicitud se procesó cuando el servidor no puede procesar ninguna.
  if (!RESEND_API_KEY) {
    console.error('[password-recovery] Falta RESEND_API_KEY.');
    return res.status(500).json({ error: 'Configuración de servidor incompleta.' });
  }
  if (!ADMIN_CONFIGURED) {
    console.error('[password-recovery] Falta FIREBASE_SERVICE_ACCOUNT_B64.');
    return res.status(500).json({ error: 'Configuración de servidor incompleta.' });
  }

  // Se inicializa el Admin SDK acá, y no dentro del try principal, para que una
  // credencial presente pero malformada devuelva 500 en lugar de caer en el
  // catch general: ese camino respondería 200 "solicitud procesada" mientras la
  // auditoría y el aviso fallan en silencio, que es justo lo que no queremos.
  let db: ReturnType<typeof adminDb>;
  try {
    db = adminDb();
  } catch (err) {
    console.error('[password-recovery] Admin SDK mal configurado:', err);
    return res.status(500).json({ error: 'Configuración de servidor incompleta.' });
  }

  const email = String(req.body?.email ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) {
    // Un formato inválido no puede corresponder a ninguna cuenta, así que
    // rechazarlo no filtra nada.
    return res.status(400).json({ error: 'El formato de correo no es válido.' });
  }

  const userAgent = String(req.headers['user-agent'] ?? '');
  const now = new Date();
  const ctx: RequestContext = {
    email,
    ip: getClientIp(req),
    userAgent,
    ...parseUA(userAgent),
    date: now.toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }),
    time: now.toLocaleTimeString('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
      hour: '2-digit',
      minute: '2-digit',
    }),
  };

  const resend = new Resend(RESEND_API_KEY);
  let outcome: Outcome = 'error_interno';
  let detalleError: string | undefined;
  let perfil: { uid: string; fullName: string; roleName: string } | null = null;

  try {
    // ── 1. Cupo ────────────────────────────────────────────────────────────
    // Se consulta ANTES de tocar Firebase Auth: ningún enlace se genera si la
    // solicitud no tiene cupo.
    const [porIp, porEmail] = await Promise.all([
      consumeRateLimit(db, 'recovery_ip', ctx.ip, IP_MAX, IP_WINDOW_MS),
      consumeRateLimit(db, 'recovery_email', email, EMAIL_MAX, EMAIL_WINDOW_MS),
    ]);

    if (!porIp.allowed || !porEmail.allowed) {
      outcome = 'limite_superado';
    } else {
      // ── 2. Resolver la cuenta ────────────────────────────────────────────
      let uid: string | null = null;
      try {
        const userRecord = await adminAuth().getUserByEmail(email);
        uid = userRecord.uid;
      } catch (err: any) {
        if (err?.code !== 'auth/user-not-found') throw err;
      }

      if (!uid) {
        outcome = 'cuenta_inexistente';
      } else {
        const perfilSnap = await db.collection('usuarios').doc(uid).get();
        const perfilData = perfilSnap.data();
        perfil = {
          uid,
          fullName: String(perfilData?.fullName ?? ''),
          roleName: String(perfilData?.roleName ?? perfilData?.roleId ?? ''),
        };

        // Una cuenta dada de baja no recibe enlace. Antes sí lo recibía: el
        // restablecimiento funcionaba y el bloqueo llegaba después, al iniciar
        // sesión. No era una brecha, pero el sistema mandaba correos a personas
        // que ya no son parte del personal.
        const activo = perfilSnap.exists && perfilData?.active !== false;

        if (!activo) {
          outcome = 'cuenta_inactiva';
        } else {
          // ── 3. Generar el enlace y enviarlo con la identidad del sistema ──
          // generatePasswordResetLink() NO envía nada: solo devuelve el enlace,
          // que es lo que permite mandarlo con la plantilla de la veterinaria
          // en lugar del correo genérico de Firebase.
          const appUrl = getAppUrl(req);
          const link = await adminAuth().generatePasswordResetLink(email, {
            url: appUrl ? `${appUrl}/` : 'https://veterinarialeo.vercel.app/',
            handleCodeInApp: false,
          });

          const nombre = perfil.fullName || email.split('@')[0];
          const html = buildResetEmail(link, nombre, appUrl);
          const asunto = 'Restablecé tu contraseña — Veterinaria Leo 🔑';

          const { data: sent, error } = await resend.emails.send({
            from: EMAIL_FROM,
            to: [email],
            subject: asunto,
            html,
            text: htmlToText(html),
          });

          if (error) {
            outcome = 'error_interno';
            detalleError = error.message;
            await registrarEmailLog(email, asunto, 'password_reset', 'error', null, error.message);
          } else {
            outcome = 'enlace_enviado';
            await registrarEmailLog(email, asunto, 'password_reset', 'enviado', sent?.id ?? null, null);
          }
        }
      }
    }
  } catch (err: any) {
    outcome = 'error_interno';
    detalleError = err?.message || 'Error desconocido';
    console.error('[password-recovery] Error al procesar la solicitud:', err);
  }

  // ── 4. Auditoría y aviso ─────────────────────────────────────────────────
  // Ocurren pase lo que pase, incluso cuando no se envió ningún enlace: un
  // intento sobre una cuenta inexistente es justamente lo que el administrador
  // necesita ver para detectar un barrido de correos.
  await registrarAuditoria(ctx, outcome, perfil);

  try {
    const admins = await getAdminRecipients();
    if (admins.length > 0) {
      const esIncidencia = outcome === 'limite_superado' || outcome === 'error_interno';
      const asunto = esIncidencia
        ? 'Incidencia en recuperación de contraseña ⚠️'
        : 'Solicitud de recuperación de contraseña 🔒';
      const html = buildAdminNotice(ctx, outcome, detalleError);

      const { data: sent, error } = await resend.emails.send({
        from: EMAIL_FROM,
        to: admins,
        subject: asunto,
        html,
        text: htmlToText(html),
      });

      await registrarEmailLog(
        admins.join(', '),
        asunto,
        'admin_password_recovery',
        error ? 'error' : 'enviado',
        sent?.id ?? null,
        error?.message ?? null
      );
    }
  } catch (err) {
    // El aviso al administrador es complementario: si falla, la solicitud del
    // usuario ya se procesó y ya quedó auditada.
    console.error('[password-recovery] No se pudo avisar a los administradores:', err);
  }

  // ── 5. Respuesta uniforme ────────────────────────────────────────────────
  await padDuration(startedAt);
  return res.status(200).json(NEUTRAL_RESPONSE);
}
