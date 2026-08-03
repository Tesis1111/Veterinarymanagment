// Backend Validation Functions - Appointments Module
// Estas funciones simulan validaciones del lado del servidor

import { Appointment, AppointmentStatus } from "../types";
import { isBefore, startOfDay } from "date-fns";

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Naturaleza del turno, independiente del tipo de servicio configurado.
 *
 * Los servicios dejaron de ser literales fijos ("clinic" | "grooming" |
 * "daycare") y ahora son documentos de /tiposServicio con id autogenerado, así
 * que comparar el tipo contra esas cadenas nunca coincide. Quien llama resuelve
 * el servicio a una de estas dos categorías y las validaciones trabajan sobre
 * ella.
 *
 *  • "stay"      — guardería: se reserva un rango de fechas, sin profesional.
 *  • "scheduled" — turno con profesional y horario concretos.
 */
export type AppointmentKind = "stay" | "scheduled";

// Estados terminales: el turno ya no admite cambios.
// (Los turnos se crean como "Confirmado" y pueden reprogramarse; el resto
// quedan cerrados.)
const LOCKED_STATUSES: AppointmentStatus[] = ["Completado", "No asistió", "Cancelado"];

/** Estados en los que un turno sigue "vivo" y espera resolución. */
export const OPEN_STATUSES: AppointmentStatus[] = ["Programado", "Confirmado"];

/**
 * Margen tras la hora del turno antes de considerarlo vencido. Evita que un
 * turno en curso aparezca como pendiente de cierre apenas pasa su horario.
 */
export const OVERDUE_GRACE_HOURS = 2;

/**
 * ¿El turno pasó de fecha y sigue sin resolverse?
 *
 * Los turnos se crean como "Confirmado" y nada los cierra automáticamente: sin
 * esta detección quedan abiertos para siempre y desaparecen de la vista porque
 * "Próximos turnos" solo mira fechas futuras.
 */
export function isAppointmentOverdue(
  appointment: Pick<Appointment, "date" | "startTime" | "status" | "dateTo">,
  now: Date = new Date()
): boolean {
  if (!OPEN_STATUSES.includes(appointment.status)) return false;

  // En una estadía el vencimiento lo marca el final del rango, no el inicio.
  const reference = appointment.dateTo ? new Date(appointment.dateTo) : new Date(appointment.date);
  if (isNaN(reference.getTime())) return false;

  if (appointment.startTime) {
    const [h, m] = appointment.startTime.split(":").map(Number);
    if (!isNaN(h) && !isNaN(m)) reference.setHours(h, m, 0, 0);
  } else {
    // Sin hora concreta, vence al terminar el día
    reference.setHours(23, 59, 59, 999);
  }

  return now.getTime() - reference.getTime() > OVERDUE_GRACE_HOURS * 60 * 60 * 1000;
}

/**
 * Valida que una fecha no sea anterior a la fecha actual
 * REGLA: No se pueden crear turnos en fechas pasadas
 */
export function validateAppointmentDate(date: Date): ValidationResult {
  const today = startOfDay(new Date());
  const appointmentDate = startOfDay(date);

  if (isBefore(appointmentDate, today)) {
    return {
      isValid: false,
      error: "No es posible asignar turnos en fechas pasadas."
    };
  }

  return { isValid: true };
}

/**
 * Valida que un rango de fechas sea válido (para guardería)
 */
export function validateDateRange(dateFrom: Date, dateTo: Date): ValidationResult {
  const today = startOfDay(new Date());
  const from = startOfDay(dateFrom);
  const to = startOfDay(dateTo);

  // Validar que la fecha desde no sea en el pasado
  if (isBefore(from, today)) {
    return {
      isValid: false,
      error: "La fecha de inicio no puede ser anterior a hoy."
    };
  }

  // Validar que la fecha hasta no sea anterior a la fecha desde
  if (isBefore(to, from)) {
    return {
      isValid: false,
      error: "La fecha 'hasta' debe ser posterior a la fecha 'desde'."
    };
  }

  return { isValid: true };
}

/**
 * Valida si un turno puede ser editado
 * REGLA: No se pueden editar turnos completados ni cancelados
 */
export function canEditAppointment(appointment: Appointment): ValidationResult {
  if (appointment.status === "Completado") {
    return {
      isValid: false,
      error: "No se puede editar un turno completado."
    };
  }

  if (appointment.status === "No asistió") {
    return {
      isValid: false,
      error: "No se puede editar un turno cerrado por inasistencia."
    };
  }

  if (appointment.status === "Cancelado") {
    return {
      isValid: false,
      error: "No se puede editar un turno cancelado."
    };
  }

  return { isValid: true };
}

/**
 * Valida si un turno puede ser eliminado/cancelado
 */
export function canDeleteAppointment(appointment: Appointment): ValidationResult {
  if (appointment.status === "Completado") {
    return {
      isValid: false,
      error: "No se puede eliminar un turno completado."
    };
  }

  if (appointment.status === "No asistió") {
    return {
      isValid: false,
      error: "El turno ya está cerrado por inasistencia."
    };
  }

  if (appointment.status === "Cancelado") {
    return {
      isValid: false,
      error: "El turno ya está cancelado."
    };
  }

  return { isValid: true };
}

/** Valida todos los campos requeridos de un turno. */
export function validateAppointmentFields(
  kind: AppointmentKind,
  serviceId: string,
  clientId: string,
  petId: string,
  doctorId?: string,
  startTime?: string,
  dateFrom?: Date,
  dateTo?: Date
): ValidationResult {
  if (!serviceId) {
    return {
      isValid: false,
      error: "Seleccione el tipo de servicio."
    };
  }

  if (!clientId || !petId) {
    return {
      isValid: false,
      error: "Complete los campos obligatorios: Cliente y Mascota."
    };
  }

  if (kind === "scheduled" && (!doctorId || !startTime)) {
    return {
      isValid: false,
      error: "Debe seleccionar profesional y horario."
    };
  }

  if (kind === "stay" && (!dateFrom || !dateTo)) {
    return {
      isValid: false,
      error: "Para guardería, debe seleccionar las fechas desde y hasta."
    };
  }

  return { isValid: true };
}

/**
 * Resuelve un tipo de servicio a su naturaleza.
 *
 * Acepta tanto los literales legados ("daycare") como los ids de
 * /tiposServicio, en cuyo caso se decide por el nombre configurado por el
 * admin (cualquier servicio cuyo nombre contenga "guarder" es una estadía).
 */
export function resolveAppointmentKind(
  serviceType: string | undefined,
  tiposServicio: { id: string; name: string }[]
): AppointmentKind {
  if (!serviceType) return "scheduled";
  const svc = tiposServicio.find(
    t => t.id === serviceType || t.name.toLowerCase() === serviceType.toLowerCase()
  );
  const name = (svc?.name ?? serviceType).toLowerCase();
  return name.includes("guarder") || name === "daycare" ? "stay" : "scheduled";
}

/**
 * Verifica si un turno está "cerrado" (no puede modificarse)
 */
export function isAppointmentLocked(appointment: Appointment): boolean {
  return LOCKED_STATUSES.includes(appointment.status);
}

/**
 * Obtiene el mensaje de estado de un turno cerrado
 */
export function getLockedAppointmentMessage(appointment: Appointment): string {
  if (appointment.status === "Completado") {
    return "Turno Completado - Solo Lectura";
  }
  if (appointment.status === "No asistió") {
    return "Turno cerrado por inasistencia - Solo Lectura";
  }
  if (appointment.status === "Cancelado") {
    return "Turno Cancelado - Solo Lectura";
  }
  return "";
}
