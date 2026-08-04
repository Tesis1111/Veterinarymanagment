import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase/config';

interface EmailAttachment {
  filename: string;
  content: string; // base64 (con o sin prefijo data URI)
}

interface EmailLogData {
  to: string;
  subject: string;
  type: string;
  data: any;
  attachmentBase64?: string;
  attachments?: EmailAttachment[];
}

/**
 * Función interna para llamar a la API y registrar en Firestore
 */
async function sendEmailAndLog(payload: EmailLogData) {
  // En `npm run dev` (Vite) el endpoint /api no existe: no intentar enviar
  // ni ensuciar email_logs con errores de red.
  if (import.meta.env.DEV) {
    console.info('[resend] Envío de email omitido en desarrollo:', payload.type, '→', payload.to);
    return { success: true, id: null, skipped: 'dev' };
  }

  // Todos los correos de este servicio exigen sesión: el endpoint valida el
  // idToken. El único flujo sin sesión (recuperación de contraseña) tiene su
  // propio endpoint, /api/password-recovery, que audita del lado del servidor.
  const currentUser = auth?.currentUser;
  if (!currentUser) {
    throw new Error('Se requiere una sesión activa para enviar correos.');
  }
  const idToken = await currentUser.getIdToken();
  const userId = currentUser.uid;

  // El log en Firestore es "best effort": si falla, NO debe hacer fallar un
  // correo que sí se envió. Las reglas exigen userId == uid del autenticado.
  const log = async (estado: string, idResend: string | null, mensajeError: string | null) => {
    try {
      if (!db) return;
      await addDoc(collection(db, 'email_logs'), {
        destinatario: payload.to,
        asunto: payload.subject,
        fecha: serverTimestamp(),
        tipo_correo: payload.type,
        estado,
        id_resend: idResend,
        mensaje_error: mensajeError,
        userId: userId,
      });
    } catch (e) {
      console.error('No se pudo registrar el log de email en Firebase', e);
    }
  };

  try {
    // 1. Llamar a nuestra Serverless Function
    const response = await fetch('/api/send-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify(payload),
    });

    let result: any = null;
    try {
      result = await response.json();
    } catch {
      throw new Error(
        `El endpoint /api/send-email no respondió JSON (status ${response.status}).`
      );
    }

    // 2. Guardar log en Firestore (no bloqueante)
    await log(response.ok ? 'enviado' : 'error', result?.id || null,
      response.ok ? null : result?.error || 'Error desconocido');

    if (!response.ok) {
      throw new Error(result?.error || 'Error al enviar el correo');
    }

    return result;
  } catch (error) {
    console.error('Error in sendEmailAndLog:', error);
    await log('error', null, error instanceof Error ? error.message : 'Excepción de red');
    throw error;
  }
}

// ==========================================
// FUNCIONES EXPORTADAS PARA EL FRONTEND
// ==========================================

export const sendAppointmentEmail = async (
  to: string, 
  data: { clientName: string; petName: string; date: string; time: string; doctorName: string; reason: string }
) => {
  return sendEmailAndLog({
    to,
    subject: '¡Tu turno está confirmado! 🐾',
    type: 'appointment_created',
    data,
  });
};

export const sendAppointmentCancellation = async (
  to: string, 
  data: { clientName: string; petName: string; date: string; time: string }
) => {
  return sendEmailAndLog({
    to,
    subject: 'Turno cancelado - Veterinaria Leo',
    type: 'appointment_cancelled',
    data,
  });
};

export const sendAppointmentReschedule = async (
  to: string, 
  data: { clientName: string; petName: string; oldDate: string; oldTime: string; newDate: string; newTime: string }
) => {
  return sendEmailAndLog({
    to,
    subject: 'Turno reprogramado exitosamente 🔄',
    type: 'appointment_rescheduled',
    data,
  });
};

export const sendWelcomeEmail = async (
  to: string, 
  data: { clientName: string }
) => {
  return sendEmailAndLog({
    to,
    subject: '¡Bienvenido a Veterinaria Leo! 🐶🐱',
    type: 'welcome',
    data,
  });
};

export const sendPetRegistered = async (
  to: string, 
  data: { clientName: string; petName: string; species: string; breed: string }
) => {
  return sendEmailAndLog({
    to,
    subject: `¡${data.petName} ya es parte de la familia! 🐾`,
    type: 'pet_registered',
    data,
  });
};

export const sendClinicalHistory = async (
  to: string, 
  data: { clientName: string; petName: string },
  pdfBase64: string
) => {
  return sendEmailAndLog({
    to,
    subject: `Historial Clínico - ${data.petName} 📋`,
    type: 'clinical_history',
    data,
    attachmentBase64: pdfBase64,
  });
};

export const sendClinicalRecordEmail = async (
  to: string,
  data: {
    clientName: string;
    petName: string;
    date: string;
    eventType: string;
    doctorName: string;
    weight?: string;
    temperature?: string;
    heartRate?: string;
    respiratoryRate?: string;
    diagnosis?: string;
    treatment?: string;
    medication?: string;
    description?: string;
    notes?: string;
    nextAppointmentDate?: string;
  },
  attachments: EmailAttachment[] = []
) => {
  return sendEmailAndLog({
    to,
    subject: `Registro clínico de ${data.petName} 📋`,
    type: 'clinical_record',
    data: { ...data, hasAttachments: attachments.length > 0 },
    attachments,
  });
};

export const sendReminder = async (
  to: string, 
  data: { clientName: string; petName: string; reminderType: string; date: string; notes: string }
) => {
  return sendEmailAndLog({
    to,
    subject: `Recordatorio: ${data.reminderType} para ${data.petName} 🔔`,
    type: 'reminder',
    data,
  });
};

// El aviso de recuperación de contraseña a los administradores ya no se dispara
// desde el navegador. Lo emite /api/password-recovery, que resuelve los
// destinatarios consultando de verdad los administradores activos en /usuarios
// y deja registro en /auditoria — algo imposible desde acá, porque sin sesión
// las reglas de Firestore rechazan cualquier escritura.
