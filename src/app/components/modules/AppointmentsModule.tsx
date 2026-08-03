import { useState, useEffect, useMemo } from "react";
import { useAuth } from "../../context/AuthContext";
import { useAudit } from "../../context/AuditContext";
import { Appointment, Client, Pet, AppointmentStatus, Doctor, DoctorSchedule, TipoEvento, DoctorPerfil, TipoServicioParametro } from "../../types";
import {
  registrarTurno,
  modificarTurno,
  cancelarTurno,
  calcEndTime,
  mostrarCalendarioTurno,
  toDateStr,
  SlotOcupadoError,
} from "../../services/turnoService";
import { traerClientes } from "../../services/clienteService";
import { traerMascotas } from "../../services/mascotaService";
import { traerTodosLosHorarios } from "../../services/horarioService";
import { suscribirTiposEvento, suscribirTiposServicio } from "../../services/parametrosService";
import { traerDoctores } from "../../services/doctorService";
import { db, FIREBASE_CONFIGURED } from "../../firebase/config";
import {
  collection, onSnapshot, Timestamp, query, where,
} from "firebase/firestore";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Calendar } from "../ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Badge } from "../ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../ui/alert-dialog";
import { Calendar as CalendarIcon, Clock, PawPrint, X, Save, AlertTriangle, CheckCircle2, FileSpreadsheet, FileText, XCircle, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { format, isSameDay, isBefore, differenceInHours, startOfDay, addDays } from "date-fns";
import { es } from "date-fns/locale";
import {
  validateAppointmentDate,
  validateDateRange,
  canEditAppointment,
  validateAppointmentFields,
  resolveAppointmentKind,
  isAppointmentOverdue,
} from "../../utils/appointmentValidations";
import { exportToExcel, exportToPDF } from "../../utils/exportUtils";
import { useSuccessPopup } from "../../context/SuccessPopupContext";
import { sendAppointmentEmail, sendAppointmentReschedule, sendAppointmentCancellation } from "../../services/resendService";

export default function AppointmentsModule() {
  const { user, hasPermission } = useAuth();
  const { addLog } = useAudit();
  const { showSuccess } = useSuccessPopup();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [pets, setPets] = useState<Pet[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [doctorSchedules, setDoctorSchedules] = useState<DoctorSchedule[]>([]);
  const [tiposEvento, setTiposEvento] = useState<TipoEvento[]>([]);
  const [tiposServicio, setTiposServicio] = useState<TipoServicioParametro[]>([]);
  const [doctoresPerfil, setDoctoresPerfil] = useState<DoctorPerfil[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [dateFromOpen, setDateFromOpen] = useState(false);
  const [dateToOpen, setDateToOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("calendar");

  useEffect(() => {
    const tab = localStorage.getItem("appointments_initial_tab");
    if (tab) {
      setActiveTab(tab);
      localStorage.removeItem("appointments_initial_tab");
    }
  }, []);

  const [formData, setFormData] = useState({
    // id del documento de /tiposServicio (o literal legado en turnos antiguos)
    type: "",
    clientId: "",
    petId: "",
    doctorId: "",
    eventoTipoId: "",
    date: new Date(),
    startTime: "",
    endTime: "",
    dateFrom: undefined as Date | undefined,
    dateTo: undefined as Date | undefined,
    reason: "",
    notes: ""
  });

  useEffect(() => {
    // ── Real-time subscription to turnos via onSnapshot ────────────────
    if (FIREBASE_CONFIGURED && db) {
      // Ventana [hoy-30d, hoy+90d): cubre el calendario visible sin descargar
      // el histórico completo. Fechas fuera de la ventana se cargan on-demand
      // (ver efecto con mostrarCalendarioTurno más abajo).
      const rangeStart = new Date(); rangeStart.setDate(rangeStart.getDate() - 30); rangeStart.setHours(0, 0, 0, 0);
      const rangeEnd = new Date(); rangeEnd.setDate(rangeEnd.getDate() + 90); rangeEnd.setHours(0, 0, 0, 0);
      const q = query(collection(db, "turnos"), where("date", ">=", rangeStart), where("date", "<", rangeEnd));
      const unsub = onSnapshot(q, (snap) => {
        const safeDate = (v: any): Date => {
          if (!v) return new Date();
          if (v instanceof Timestamp) return v.toDate();
          if (v instanceof Date) return v;
          const d = new Date(v);
          return isNaN(d.getTime()) ? new Date() : d;
        };
        const safeOptDate = (v: any): Date | undefined => {
          if (!v) return undefined;
          if (v instanceof Timestamp) return v.toDate();
          if (v instanceof Date) return v;
          const d = new Date(v);
          return isNaN(d.getTime()) ? undefined : d;
        };
        const appts = snap.docs.map(d => {
          const data = d.data();
          return {
            id: d.id,
            clientId: data.clientId ?? data.clienteId ?? "",
            petId: data.petId ?? data.mascotaId ?? "",
            serviceId: data.serviceId ?? data.type ?? "clinic",
            doctorId: data.doctorId ?? null,
            date: safeDate(data.date ?? data.fecha),
            startTime: data.startTime ?? data.hora ?? "",
            endTime: data.endTime ?? "",
            status: data.status ?? data.estado ?? "Confirmado",
            reason: data.reason ?? "",
            notes: data.notes ?? data.notas ?? "",
            tiposEvento: data.tiposEvento ?? [],
            type: data.type ?? "clinic",
            dateFrom: safeOptDate(data.dateFrom),
            dateTo: safeOptDate(data.dateTo),
            createdAt: safeDate(data.createdAt),
            createdBy: data.createdBy ?? "",
          } as any;
        });
        // Sort client-side by date desc
        appts.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setAppointments(appts);
      }, (err) => {
        console.error("[AppointmentsModule] onSnapshot error:", err);
        
      });
      // Real-time subscriptions for reference data so new clients/pets appear immediately
      const unsubClients = onSnapshot(
        collection(db, "clientes"),
        (snap) => setClients(snap.docs.filter(d => !d.data().deleted).map(d => ({ id: d.id, ...d.data() } as any))),
        () => traerClientes().then(setClients).catch(() => setClients([]))
      );
      const unsubPets = onSnapshot(
        collection(db, "mascotas"),
        (snap) => setPets(snap.docs.filter(d => !d.data().deleted && !d.data().deceased).map(d => ({ id: d.id, ...d.data() } as any))),
        () => traerMascotas().then(setPets).catch(() => setPets([]))
      );
      traerTodosLosHorarios().then(setDoctorSchedules).catch(() => setDoctorSchedules([]));
      const unsubTiposEvento = suscribirTiposEvento(setTiposEvento);

      // Real-time doctors subscription so new vets appear automatically
      const unsubDoctors = onSnapshot(
        query(collection(db, "doctores"), where("available", "==", true)),
        (snap) => {
          setDoctoresPerfil(snap.docs.map(d => ({
            id: d.id,
            fullName: d.data().fullName ?? d.data().name ?? "",
            profesion: d.data().profesion ?? "",
            specialty: d.data().specialty ?? "",
            licenseNumber: d.data().licenseNumber,
            userId: d.data().userId,
            available: d.data().available !== false,
            createdAt: d.data().createdAt instanceof Timestamp ? d.data().createdAt.toDate() : new Date(),
          })));
        },
        () => traerDoctores().then(setDoctoresPerfil)
      );
      
      const unsubTiposServicio = suscribirTiposServicio(setTiposServicio);
      
      return () => { unsub(); unsubClients(); unsubPets(); unsubDoctors(); unsubTiposServicio(); unsubTiposEvento(); };
    } else {
      // Firebase not configured — show empty state
      console.warn("[AppointmentsModule] Firebase no configurado. Los datos no se cargarán.");
    }
  }, []);

  // ── Helpers ──────────────────────────────────────
  const getClientName = (clientId: string) => clients.find(c => c.id === clientId)?.fullName || "";
  const getPetName = (petId: string) => pets.find(p => p.id === petId)?.name || "";
  const getDoctorName = (doctorId?: string) => {
    if (!doctorId) return "-";
    const fromPerfil = doctoresPerfil.find(d => d.id === doctorId);
    if (fromPerfil) return fromPerfil.fullName;
    return (doctors.find(d => d.id === doctorId) as any)?.name || "Desconocido";
  };
  const getPetsByClient = (clientId: string) =>
    pets.filter(p => (p.clientId === clientId) || ((p as any).ownerId === clientId));

  const getStatusColor = (status: AppointmentStatus): string => {
    switch (status) {
      case "Programado": return "bg-blue-100 text-blue-800";
      case "Confirmado": return "bg-green-100 text-green-800";
      case "Completado": return "bg-gray-100 text-gray-800";
      case "No asistió": return "bg-amber-100 text-amber-800";
      case "Cancelado": return "bg-red-100 text-red-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const getStatusLabel = (status: AppointmentStatus): string => status;

  const getTypeLabel = (type: string) => {
    const dynamicType = tiposServicio.find(t => t.id === type || t.name.toLowerCase() === type.toLowerCase());
    return dynamicType ? dynamicType.name : type;
  };

  const getTypeColor = (type: string) => {
    const dynamicType = tiposServicio.find(t => t.id === type || t.name.toLowerCase() === type.toLowerCase());
    return dynamicType?.color || "bg-gray-100 text-gray-800";
  };

  /** ¿El servicio de este turno es una estadía de guardería? */
  const isStay = (type?: string) => resolveAppointmentKind(type, tiposServicio) === "stay";

  // Naturaleza del servicio elegido en el formulario. Decide qué campos se
  // piden (rango de fechas vs. profesional + horario) y cómo se valida.
  const formKind = useMemo(
    () => resolveAppointmentKind(formData.type, tiposServicio),
    [formData.type, tiposServicio]
  );

  // ── Turnos fuera de la ventana suscrita (fetch puntual por fecha) ──
  const [outOfRangeAppointments, setOutOfRangeAppointments] = useState<Appointment[]>([]);
  useEffect(() => {
    const sel = new Date(selectedDate); sel.setHours(0, 0, 0, 0);
    const rangeStart = new Date(); rangeStart.setDate(rangeStart.getDate() - 30); rangeStart.setHours(0, 0, 0, 0);
    const rangeEnd = new Date(); rangeEnd.setDate(rangeEnd.getDate() + 90); rangeEnd.setHours(0, 0, 0, 0);
    if (sel >= rangeStart && sel < rangeEnd) {
      setOutOfRangeAppointments([]);
      return;
    }
    mostrarCalendarioTurno(toDateStr(sel))
      .then(setOutOfRangeAppointments)
      .catch(() => setOutOfRangeAppointments([]));
  }, [selectedDate]);

  // ── Modificadores del Calendario ────────────────────────────────
  const modifiers = useMemo(() => {
    const daysWithAppts = (appointments ?? [])
      .filter(apt => apt.status !== "Cancelado")
      .map(apt => {
        try { return new Date(apt.date); } catch { return null; }
      })
      .filter((d): d is Date => d instanceof Date && !isNaN(d.getTime()));
    return { hasAppointment: daysWithAppts };
  }, [appointments]);

  const modifiersClassNames = {
    hasAppointment: "font-bold text-orange-700 underline decoration-orange-500 decoration-2 underline-offset-4 bg-orange-50/50"
  };

  // ── Appointments filtrados ──────────────────────────────────────
  const appointmentsForDate = useMemo(() => {
    return [...(appointments ?? []), ...outOfRangeAppointments]
      .filter(apt => {
        if (!apt || !apt.date) return false;
        if (apt.status === "Cancelado") return false;

        if (!isStay(apt.type)) {
          return isSameDay(new Date(apt.date), selectedDate);
        }
        // Una estadía ocupa todos los días de su rango
        if (apt.dateFrom && apt.dateTo) {
          const from = new Date(apt.dateFrom); from.setHours(0, 0, 0, 0);
          const to = new Date(apt.dateTo); to.setHours(0, 0, 0, 0);
          const sel = new Date(selectedDate); sel.setHours(0, 0, 0, 0);
          return sel >= from && sel <= to;
        }
        // Estadía legada sin rango: se muestra en su fecha de alta
        return isSameDay(new Date(apt.date), selectedDate);
      })
      .sort((a, b) => (a.startTime || "").localeCompare(b.startTime || ""));
  }, [appointments, outOfRangeAppointments, selectedDate, tiposServicio]);

  const upcomingAppointments = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return (appointments ?? [])
      .filter(apt => {
        if (!apt || !apt.date) return false;
        try {
          const aptDate = new Date(apt.date); aptDate.setHours(0, 0, 0, 0);
          return aptDate >= today && !["Cancelado", "Completado", "No asistió"].includes(apt.status);
        } catch { return false; }
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 12);
  }, [appointments]);

  // ── Turnos vencidos pendientes de cierre ────────────────────────────
  // Los turnos nacen "Confirmado" y nada los cierra solo: sin esta bandeja
  // quedan abiertos para siempre y encima desaparecen de la vista, porque
  // "Próximos turnos" solo mira fechas futuras.
  const overdueAppointments = useMemo(() => {
    return (appointments ?? [])
      .filter(apt => apt && apt.date && isAppointmentOverdue(apt))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [appointments]);

  const [closingIds, setClosingIds] = useState<string[]>([]);

  /** Cierra un turno vencido. modificarTurno libera el slot del profesional. */
  const closeOverdue = async (apt: Appointment, status: AppointmentStatus) => {
    setClosingIds(prev => [...prev, apt.id]);
    try {
      if (status === "Cancelado") {
        await cancelarTurno(apt.id, "Cerrado desde pendientes de cierre", user?.id || "1");
      } else {
        await modificarTurno(apt.id, { status }, user?.id || "1");
      }
      addLog("Actualizar", "turnos", `Turno vencido de ${getPetName(apt.petId)} → ${status}`);
    } catch (err: any) {
      toast.error(
        err?.code === "permission-denied"
          ? "Sin permisos para cerrar el turno."
          : "Error al cerrar el turno."
      );
    } finally {
      setClosingIds(prev => prev.filter(id => id !== apt.id));
    }
  };

  /** Cierra en bloque todos los vencidos como inasistencia. */
  const closeAllOverdue = async () => {
    const pending = [...overdueAppointments];
    let ok = 0;
    for (const apt of pending) {
      try {
        await modificarTurno(apt.id, { status: "No asistió" }, user?.id || "1");
        ok++;
      } catch {
        // Se sigue con el resto: un fallo puntual no debe abortar el lote
      }
    }
    if (ok > 0) {
      showSuccess(`${ok} turno${ok !== 1 ? "s" : ""} cerrado${ok !== 1 ? "s" : ""} como "No asistió".`);
      addLog("Actualizar", "turnos", `Cierre masivo de ${ok} turnos vencidos como No asistió`);
    }
    if (ok < pending.length) {
      toast.error(`No se pudieron cerrar ${pending.length - ok} turnos.`);
    }
  };

  const isWithin24Hours = (apt: Appointment): boolean => {
    const now = new Date();
    const aptDate = new Date(apt.date);
    if (apt.startTime) {
      const [h, m] = apt.startTime.split(':').map(Number);
      aptDate.setHours(h, m, 0, 0);
    }
    const hoursUntil = differenceInHours(aptDate, now);
    return hoursUntil >= 0 && hoursUntil <= 24;
  };

  // ── Cambiar estado ──────────────────────────────────────
  const handleStatusChange = async (appointmentId: string, newStatus: AppointmentStatus) => {
    const appointment = appointments.find(apt => apt.id === appointmentId);
    if (!appointment) return;

    try {
      // cancelarTurno libera además el slot del profesional (batch atómico)
      if (newStatus === "Cancelado") {
        await cancelarTurno(appointmentId, "Cancelado por el usuario", user?.id || "1");
      } else {
        await modificarTurno(appointmentId, { status: newStatus }, user?.id || "1");
      }
      showSuccess(`El estado del turno ha cambiado a ${newStatus} ✓`);
      addLog("Actualizar", "turnos", `Turno de ${getPetName(appointment.petId)} → ${newStatus}`);

      // Enviar correo de cancelación si corresponde
      if (newStatus === "Cancelado") {
        const client = clients.find(c => c.id === appointment.clientId);
        if (client?.email) {
          sendAppointmentCancellation(client.email, {
            clientName: client.fullName,
            petName: getPetName(appointment.petId),
            date: format(new Date(appointment.date), "dd/MM/yyyy"),
            time: appointment.startTime || "Sin hora definida",
          }).catch(() => toast.warning("El turno se actualizó, pero no se pudo enviar el correo al cliente"));
        }
      }
    } catch (err: any) {
      console.error("[AppointmentsModule] Error actualizando estado:", err);
      toast.error(err?.code === "permission-denied" ? "Sin permisos para actualizar el turno." : "Error al actualizar el estado del turno.");
    }
  };

  // ── Slots de horario del doctor ──────────────────────────────────────
  const getAvailableTimeSlotsForDoctor = (doctorId: string, date: Date): string[] => {
    if (!doctorId) return [];
    const dayOfWeek = date.getDay();
    const schedulesForDay = doctorSchedules.filter(
      s => s.doctorId === doctorId && s.dayOfWeek === dayOfWeek && s.active
    );
    if (schedulesForDay.length === 0) return [];

    const slots: string[] = [];
    schedulesForDay.forEach(schedule => {
      const [startH, startM] = schedule.startTime.split(':').map(Number);
      const [endH, endM] = schedule.endTime.split(':').map(Number);
      let h = startH, m = startM;
      while (h < endH || (h === endH && m < endM)) {
        slots.push(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);
        m += 30;
        if (m >= 60) { m = 0; h++; }
      }
    });
    return slots.sort();
  };

  const availableTimeSlots = useMemo(
    () => getAvailableTimeSlotsForDoctor(formData.doctorId, formData.date),
    [formData.doctorId, formData.date, doctorSchedules]
  );

  // Profesión requerida por el tipo de servicio elegido (si el admin la configuró).
  const profesionRequerida = useMemo(() => {
    const svc = tiposServicio.find(
      t => t.id === formData.type || t.name.toLowerCase() === String(formData.type).toLowerCase()
    );
    return (svc?.profesion ?? "").trim();
  }, [tiposServicio, formData.type]);

  // Profesionales ofrecidos para el servicio: si hay profesión requerida, solo los que
  // la tienen; si no, todos. El profesional ya elegido (edición) siempre se incluye para
  // no romper turnos existentes con datos legados.
  const doctoresParaServicio = useMemo(() => {
    if (!profesionRequerida) return doctoresPerfil;
    const req = profesionRequerida.toLowerCase();
    return doctoresPerfil.filter(
      d => (d.profesion ?? "").trim().toLowerCase() === req || d.id === formData.doctorId
    );
  }, [doctoresPerfil, profesionRequerida, formData.doctorId]);

  const isTimeSlotAvailable = (time: string, doctorId: string): boolean =>
    !appointmentsForDate.some(apt => apt.startTime === time && apt.doctorId === doctorId && apt.id !== selectedAppointment?.id);

  // ── Verificar duplicados ──────────────────────────────────────
  const checkDuplicate = (): boolean => {
    if (formKind === "scheduled") {
      return !!appointments.find(apt =>
        apt.id !== selectedAppointment?.id &&
        apt.clientId === formData.clientId &&
        apt.petId === formData.petId &&
        isSameDay(new Date(apt.date), formData.date) &&
        apt.startTime === formData.startTime &&
        apt.status !== "Cancelado"
      );
    }
    // Estadía: se solapa con otra estadía de la misma mascota
    if (formData.dateFrom && formData.dateTo) {
      return !!appointments.find(apt => {
        if (apt.id === selectedAppointment?.id || !isStay(apt.type) || apt.status === "Cancelado" ||
          apt.clientId !== formData.clientId || apt.petId !== formData.petId || !apt.dateFrom || !apt.dateTo) return false;
        return formData.dateFrom! <= new Date(apt.dateTo) && formData.dateTo! >= new Date(apt.dateFrom);
      });
    }
    return false;
  };

  // ── Guardar ──────────────────────────────────────
  const handleSave = async () => {
    const validation = validateAppointmentFields(
      formKind, formData.type, formData.clientId, formData.petId,
      formData.doctorId, formData.startTime, formData.dateFrom, formData.dateTo
    );
    if (!validation.isValid) { toast.error(validation.error); return; }

    if (formKind === "scheduled") {
      const dateVal = validateAppointmentDate(formData.date);
      if (!dateVal.isValid) { toast.error(dateVal.error || "No se permiten turnos en fechas pasadas."); return; }
    } else if (formData.dateFrom && formData.dateTo) {
      const rangeVal = validateDateRange(formData.dateFrom, formData.dateTo);
      if (!rangeVal.isValid) { toast.error(rangeVal.error); return; }
    }

    if (isEditing && selectedAppointment) {
      const canEdit = canEditAppointment(selectedAppointment);
      if (!canEdit.isValid) { toast.error(canEdit.error || "No se puede editar este turno."); return; }
    }

    if (!hasPermission("manage_appointments")) { toast.error("Sin permisos para gestionar turnos"); return; }
    if (checkDuplicate()) { toast.error("Ya existe un turno con los mismos detalles"); return; }

    // FASE 7 — Doble reserva del profesional: mismo doctor, misma fecha y hora,
    // otro turno vigente. Evita solapamientos incluso si el slot no se refrescó.
    if (formKind === "scheduled" && formData.doctorId && formData.startTime) {
      const overbooked = appointments.some(apt =>
        apt.id !== selectedAppointment?.id &&
        apt.doctorId === formData.doctorId &&
        isSameDay(new Date(apt.date), formData.date) &&
        apt.startTime === formData.startTime &&
        apt.status !== "Cancelado"
      );
      if (overbooked) {
        toast.error("El profesional ya tiene un turno en ese horario. Elegí otro horario.");
        return;
      }
    }

    try {
      // Shape canónico del documento turno (solo campos en inglés; los slots y
      // la atomicidad los maneja turnoService con writeBatch).
      const isStayForm = formKind === "stay";
      const appointmentData: Record<string, any> = {
        clientId: formData.clientId,
        petId: formData.petId,
        // Una estadía no reserva agenda de un profesional
        doctorId: isStayForm ? null : (formData.doctorId || null),
        // Para la estadía, `date` ancla el turno al inicio del rango
        date: isStayForm ? (formData.dateFrom ?? formData.date) : formData.date,
        startTime: isStayForm ? null : (formData.startTime || null),
        endTime: !isStayForm && formData.startTime ? calcEndTime(formData.startTime) : null,
        reason: formData.reason || null,
        notes: formData.notes || null,
        tiposEvento: formData.eventoTipoId ? formData.eventoTipoId.split(",").filter(Boolean) : [],
        type: formData.type,
        // Siempre presentes: al pasar de estadía a turno normal (o al revés)
        // hay que limpiar el rango anterior, no dejarlo obsoleto.
        dateFrom: isStayForm ? (formData.dateFrom ?? null) : null,
        dateTo: isStayForm ? (formData.dateTo ?? null) : null,
      };

      if (isEditing && selectedAppointment) {
        // ── Update existing appointment ────────────────────────────────
        await modificarTurno(
          selectedAppointment.id,
          { ...appointmentData, status: selectedAppointment.status },
          user?.id || "1"
        );
        showSuccess("Turno actualizado exitosamente ✓");
        addLog("Actualizar", "turnos", `Turno actualizado para ${getPetName(formData.petId)}`);

        // Send reschedule email if date or time changed
        const oldDateStr = format(new Date(selectedAppointment.date), "dd/MM/yyyy");
        const newDateStr = format(formData.date, "dd/MM/yyyy");
        if (oldDateStr !== newDateStr || selectedAppointment.startTime !== formData.startTime) {
          const client = clients.find(c => c.id === formData.clientId);
          if (client?.email) {
            sendAppointmentReschedule(client.email, {
              clientName: client.fullName,
              petName: getPetName(formData.petId),
              oldDate: oldDateStr,
              oldTime: selectedAppointment.startTime || "Sin hora definida",
              newDate: newDateStr,
              newTime: formData.startTime || "Sin hora definida",
            }).catch(() => toast.warning("El turno se actualizó, pero no se pudo enviar el correo al cliente"));
          }
        }
      } else {
        // ── Create new appointment — vía servicio (batch + slot + auditoría) ──
        await registrarTurno({ ...appointmentData, status: "Confirmado" } as any, user?.id || "1");
        showSuccess("Turno agendado y confirmado exitosamente ✓");
        addLog("Crear", "turnos", `Turno creado para ${getPetName(formData.petId)} — ${getClientName(formData.clientId)}`);

        // Send appointment created email
        const client = clients.find(c => c.id === formData.clientId);
        if (client?.email) {
          sendAppointmentEmail(client.email, {
            clientName: client.fullName,
            petName: getPetName(formData.petId),
            date: format(formData.date, "dd/MM/yyyy"),
            time: formData.startTime || "Sin hora definida",
            doctorName: getDoctorName(formData.doctorId) || "No asignado",
            reason: formData.notes || "Control general",
          }).catch(() => toast.warning("El turno se agendó, pero no se pudo enviar el correo al cliente"));
        }
      }
      handleCancel();
    } catch (err: any) {
      console.error("[AppointmentsModule] Error guardando turno:", err);
      const msg = err instanceof SlotOcupadoError
        ? err.message
        : err?.code === "permission-denied"
          ? "El horario ya está reservado o no tenés permisos para gestionar turnos."
          : err?.message ?? "Error al guardar el turno. Intente nuevamente.";
      toast.error(msg);
    }
  };

  const handleCancel = () => {
    setFormData({ type: "", clientId: "", petId: "", doctorId: "", eventoTipoId: "", date: new Date(), startTime: "", endTime: "", dateFrom: undefined, dateTo: undefined, reason: "", notes: "" });
    setSelectedAppointment(null);
    setIsEditing(false);
    setActiveTab("calendar");
  };

  /** Carga un turno en el formulario y abre la pestaña de edición. */
  const startEditing = (apt: Appointment) => {
    setSelectedAppointment(apt);
    setIsEditing(true);
    setActiveTab("schedule");
    setFormData({
      type: apt.type ?? "",
      clientId: apt.clientId,
      petId: apt.petId,
      doctorId: apt.doctorId || "",
      eventoTipoId: (apt.tiposEvento ?? []).join(","),
      date: new Date(apt.date),
      startTime: apt.startTime || "",
      endTime: apt.endTime || "",
      dateFrom: apt.dateFrom ? new Date(apt.dateFrom) : undefined,
      dateTo: apt.dateTo ? new Date(apt.dateTo) : undefined,
      reason: apt.reason || "",
      notes: apt.notes || ""
    });
  };

  const handleDelete = async () => {
    if (selectedAppointment) {
      try {
        // Cancela y libera el slot en un solo batch; onSnapshot refresca la lista
        await cancelarTurno(selectedAppointment.id, "Eliminado por el usuario", user?.id || "1");
        toast.success("Turno cancelado");
        addLog("Eliminar", "turnos", `Turno ${selectedAppointment.id} cancelado`);
        handleCancel();
      } catch (err: any) {
        toast.error(err?.code === "permission-denied" ? "Sin permisos para cancelar el turno." : "Error al cancelar el turno.");
      }
      setDeleteDialogOpen(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-orange-800 flex items-center gap-2">
            <CalendarIcon className="h-8 w-8" />
            Calendario Turnos
          </h1>
          <p className="text-gray-600 mt-1">Agende y administre turnos de clínica, peluquería y guardería</p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="border-green-300 text-green-700 hover:bg-green-50"
            onClick={() => {
              exportToExcel(
                "turnos_proximos",
                ["Fecha", "Hora", "Tipo", "Mascota", "Cliente", "Profesional", "Estado", "Motivo"],
                upcomingAppointments.map(apt => [
                  format(new Date(apt.date), "dd/MM/yyyy"),
                  apt.startTime || (isStay(apt.type) && apt.dateFrom && apt.dateTo
                    ? `${format(new Date(apt.dateFrom), "dd/MM")} - ${format(new Date(apt.dateTo), "dd/MM")}`
                    : "—"),
                  getTypeLabel(apt.type),
                  getPetName(apt.petId),
                  getClientName(apt.clientId),
                  getDoctorName(apt.doctorId),
                  getStatusLabel(apt.status),
                  apt.reason || "—"
                ]),
                "Próximos Turnos"
              );
              toast.success("Excel exportado exitosamente");
            }}
          >
            <FileSpreadsheet className="mr-2 h-4 w-4" />Excel
          </Button>
          <Button
            size="sm"
            className="bg-orange-600 hover:bg-orange-700"
            onClick={() => {
              exportToPDF(
                "Listado de Próximos Turnos",
                `Generado el ${format(new Date(), "dd/MM/yyyy HH:mm")}`,
                ["Fecha", "Hora", "Tipo", "Mascota", "Cliente", "Profesional", "Estado"],
                upcomingAppointments.map(apt => [
                  format(new Date(apt.date), "dd/MM/yyyy"),
                  apt.startTime || "—",
                  getTypeLabel(apt.type),
                  getPetName(apt.petId),
                  getClientName(apt.clientId),
                  getDoctorName(apt.doctorId),
                  getStatusLabel(apt.status),
                ]),
                { "Total de turnos": String(upcomingAppointments.length) }
              );
              toast.success("PDF generado — use Ctrl+P para guardar");
            }}
          >
            <FileText className="mr-2 h-4 w-4" />PDF
          </Button>
        </div>
      </div>

      {/* ══ PENDIENTES DE CIERRE ═══════════════════════════
          Turnos cuya fecha ya pasó y siguen sin resolverse. El sistema no los
          cierra solo: marcar "Completado" sin saber si la mascota asistió
          falsearía el historial clínico. */}
      {overdueAppointments.length > 0 && hasPermission("manage_appointments") && (
        <Card className="border-amber-300 bg-amber-50/40 shadow-md">
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-amber-800">
                  <AlertTriangle className="h-5 w-5" />
                  Pendientes de cierre ({overdueAppointments.length})
                </CardTitle>
                <CardDescription className="text-amber-700/80">
                  Estos turnos ya pasaron y siguen abiertos. Indicá qué ocurrió para cerrarlos.
                </CardDescription>
              </div>
              {overdueAppointments.length > 1 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={closeAllOverdue}
                  disabled={closingIds.length > 0}
                  className="border-amber-400 text-amber-800 hover:bg-amber-100 shrink-0"
                >
                  <XCircle className="mr-2 h-4 w-4" />
                  Cerrar todos como «No asistió»
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
              {overdueAppointments.map(apt => {
                const busy = closingIds.includes(apt.id);
                return (
                  <div
                    key={apt.id}
                    className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 text-sm">
                      <p className="font-medium text-gray-900">
                        {format(new Date(apt.date), "dd/MM/yyyy")}
                        {apt.startTime && <span className="text-gray-500"> · {apt.startTime}</span>}
                      </p>
                      <p className="truncate text-gray-600">
                        {getPetName(apt.petId)} — {getClientName(apt.clientId)}
                        {apt.doctorId && (
                          <span className="text-gray-400"> · {getDoctorName(apt.doctorId)}</span>
                        )}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => closeOverdue(apt, "Completado")}
                        className="h-7 border-green-300 text-green-700 hover:bg-green-50 text-xs"
                      >
                        <CheckCircle className="mr-1 h-3.5 w-3.5" />
                        Se atendió
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => closeOverdue(apt, "No asistió")}
                        className="h-7 border-amber-400 text-amber-800 hover:bg-amber-100 text-xs"
                      >
                        <XCircle className="mr-1 h-3.5 w-3.5" />
                        No asistió
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => closeOverdue(apt, "Cancelado")}
                        className="h-7 text-red-600 hover:bg-red-50 text-xs"
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2 bg-orange-50">
          <TabsTrigger value="calendar">Calendario</TabsTrigger>
          <TabsTrigger value="schedule">Agendar Turno</TabsTrigger>
        </TabsList>

        {/* ══ CALENDARIO ════════════════════════════════ */}
        <TabsContent value="calendar">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Selector de fecha */}
            <div className="lg:col-span-1">
              <Card className="border-orange-200 shadow-md">
                <CardHeader className="bg-gradient-to-r from-orange-50 to-white">
                  <CardTitle className="text-orange-800">Seleccionar Fecha</CardTitle>
                  <CardDescription>Navegue por el calendario</CardDescription>
                </CardHeader>
                <CardContent className="pt-6 pb-6">
                  <div className="flex justify-center">
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={(date) => date && setSelectedDate(date)}
                      className="rounded-xl border shadow-sm p-4 md:p-6"
                      locale={es}
                      modifiers={modifiers}
                      modifiersClassNames={modifiersClassNames}
                    />
                  </div>
                  <div className="mt-6 p-4 bg-orange-50 rounded-lg border border-orange-200">
                    <p className="text-xs font-medium text-orange-700 mb-1.5 uppercase tracking-wide">Fecha Seleccionada</p>
                    <p className="font-semibold text-orange-900">{format(selectedDate, "PPP", { locale: es })}</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Turnos del día */}
            <div className="lg:col-span-2">
              <Card className="border-orange-200 shadow-md">
                <CardHeader className="bg-gradient-to-r from-orange-50 to-white">
                  <CardTitle className="text-orange-800">
                    Agenda del {format(selectedDate, "dd/MM/yyyy")}
                  </CardTitle>
                  <CardDescription>
                    {appointmentsForDate.length} turno{appointmentsForDate.length !== 1 ? "s" : ""} programado{appointmentsForDate.length !== 1 ? "s" : ""}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                  {appointmentsForDate.length === 0 ? (
                    <div className="text-center py-16 text-gray-400">
                      <CalendarIcon className="h-16 w-16 mx-auto mb-4 text-gray-200" />
                      <p className="font-medium text-gray-500">No hay turnos para esta fecha</p>
                      <p className="text-sm mt-1">Seleccione otra fecha o agende un nuevo turno</p>
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
                      {appointmentsForDate.map(apt => {
                        const client = clients.find(c => c.id === apt.clientId);
                        const pet = pets.find(p => p.id === apt.petId);
                        return (
                          <div key={apt.id} className="p-4 bg-white rounded-lg border-2 border-orange-100 hover:border-orange-300 transition-all shadow-sm">
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <div className="bg-orange-100 p-2 rounded">
                                  <Clock className="h-4 w-4 text-orange-600" />
                                </div>
                                <div>
                                  <span className="text-orange-900 font-semibold">
                                    {apt.startTime || "Sin horario"}
                                  </span>
                                  {apt.endTime && (
                                    <span className="text-gray-400 text-sm ml-1">- {apt.endTime}</span>
                                  )}
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <Badge className={getTypeColor(apt.type)}>{getTypeLabel(apt.type)}</Badge>
                                <Badge className={getStatusColor(apt.status)}>{getStatusLabel(apt.status)}</Badge>
                              </div>
                            </div>
                            <div className="space-y-1.5 text-sm">
                              <div className="flex items-start">
                                <span className="font-medium text-gray-600 min-w-[90px]">Mascota:</span>
                                <span className="text-gray-900">{pet?.name} <span className="text-gray-500">({(pet as any)?.species})</span></span>
                              </div>
                              <div className="flex items-start">
                                <span className="font-medium text-gray-600 min-w-[90px]">Cliente:</span>
                                <span className="text-gray-900">{client?.fullName}</span>
                              </div>
                              {apt.doctorId && (
                                <div className="flex items-start">
                                  <span className="font-medium text-gray-600 min-w-[90px]">Profesional:</span>
                                  <span className="text-gray-900">{getDoctorName(apt.doctorId)}</span>
                                </div>
                              )}
                              {apt.reason && (
                                <div className="flex items-start">
                                  <span className="font-medium text-gray-600 min-w-[90px]">Motivo:</span>
                                  <span className="text-gray-900">{apt.reason}</span>
                                </div>
                              )}
                              {isStay(apt.type) && apt.dateFrom && apt.dateTo && (
                                <div className="flex items-start">
                                  <span className="font-medium text-gray-600 min-w-[90px]">Estadía:</span>
                                  <span className="text-gray-900">
                                    {format(new Date(apt.dateFrom), "dd/MM")} → {format(new Date(apt.dateTo), "dd/MM")}
                                  </span>
                                </div>
                              )}
                              {/* Motivos de consulta */}
                              {(apt as any).tiposEvento?.length > 0 && tiposEvento.length > 0 && (
                                <div className="flex items-start flex-wrap gap-1 pt-1">
                                  <span className="font-medium text-gray-600 min-w-[90px] text-xs mt-0.5">Motivos:</span>
                                  {(apt as any).tiposEvento.map((tid: string) => {
                                    const t = tiposEvento.find(t => t.id === tid);
                                    return t ? <span key={tid} className={`px-2 py-0.5 rounded-full text-xs ${t.color}`}>{t.name}</span> : null;
                                  })}
                                </div>
                              )}
                            </div>

                            {/* ── Botones de Estado ─────────────────────── */}
                            {!["Cancelado", "Completado", "No asistió"].includes(apt.status) && hasPermission("manage_appointments") && (
                              <div className="mt-3 pt-3 border-t border-orange-100 flex gap-2 flex-wrap">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="border-green-300 text-green-700 hover:bg-green-50 text-xs h-7"
                                  onClick={() => handleStatusChange(apt.id, "Completado")}
                                >
                                  <CheckCircle className="h-3.5 w-3.5 mr-1" />
                                  Turno finalizado
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="border-red-300 text-red-700 hover:bg-red-50 text-xs h-7"
                                  onClick={() => { setSelectedAppointment(apt); setDeleteDialogOpen(true); }}
                                >
                                  <XCircle className="h-3.5 w-3.5 mr-1" />
                                  Cancelar turno
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-orange-600 hover:bg-orange-50 text-xs h-7"
                                  onClick={() => startEditing(apt)}
                                >
                                  <Save className="h-3.5 w-3.5 mr-1" />
                                  Editar
                                </Button>
                              </div>
                            )}
                            {["Cancelado", "Completado", "No asistió"].includes(apt.status) && (
                              <div className="mt-2 pt-2 border-t border-gray-100">
                                <span className={`text-xs px-2 py-0.5 rounded-full ${
                                  apt.status === "Cancelado" ? "bg-red-100 text-red-700"
                                    : apt.status === "No asistió" ? "bg-amber-100 text-amber-800"
                                      : "bg-green-100 text-green-700"
                                }`}>
                                  {apt.status === "Cancelado" ? "Turno cancelado"
                                    : apt.status === "No asistió" ? "El cliente no asistió"
                                      : "Turno completado"}
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ══ AGENDAR ════════════════════════════════ */}
        <TabsContent value="schedule">
          <Card className="border-orange-200 shadow-md">
            <CardHeader className="bg-gradient-to-r from-orange-50 to-white">
              <CardTitle className="text-orange-800">
                {isEditing ? "Editar Turno" : "Agendar Nuevo Turno"}
              </CardTitle>
              <CardDescription>
                {isEditing
                  ? "Modifique los datos del turno"
                  : "El turno se agendará con estado Confirmado automáticamente"
                }
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-6">
                {/* Info auto-confirmado (solo al crear) */}
                {!isEditing && (
                  <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                    <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                    <p className="text-sm text-green-700">
                      Al agendar, el turno quedará en estado <strong>Confirmado</strong> automáticamente.
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Tipo de Servicio <span className="text-red-500">*</span></Label>
                    <Select
                      value={formData.type}
                      onValueChange={(value) => setFormData(prev => (
                        // Al cambiar el servicio cambia la profesión requerida: se reinicia
                        // el profesional y el horario para no dejar una selección inválida.
                        value === prev.type ? prev : { ...prev, type: value, doctorId: "", startTime: "" }
                      ))}
                    >
                      <SelectTrigger><SelectValue placeholder="Seleccione un servicio" /></SelectTrigger>
                      <SelectContent>
                        {tiposServicio.length > 0 ? (
                          tiposServicio.map(ts => (
                            <SelectItem key={ts.id} value={ts.id}>{ts.name}</SelectItem>
                          ))
                        ) : (
                          <div className="p-3 text-sm text-gray-500 text-center">
                            No hay servicios configurados.
                            <br/>Configure en Parámetros.
                          </div>
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Cliente <span className="text-red-500">*</span></Label>
                    <Select value={formData.clientId} onValueChange={(v) => setFormData(prev => ({ ...prev, clientId: v, petId: "" }))}>
                      <SelectTrigger><SelectValue placeholder="Seleccione cliente" /></SelectTrigger>
                      <SelectContent>
                        {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.fullName}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Mascota <span className="text-red-500">*</span></Label>
                    <Select
                      value={formData.petId}
                      onValueChange={(v) => setFormData(prev => ({ ...prev, petId: v }))}
                      disabled={!formData.clientId}
                    >
                      <SelectTrigger><SelectValue placeholder="Seleccione mascota" /></SelectTrigger>
                      <SelectContent>
                        {getPetsByClient(formData.clientId).map(p => (
                          <SelectItem key={p.id} value={p.id}>{p.name} — {(p as any).species}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Motivo / Tipos de Evento (multi-selección) */}
                {formKind === "scheduled" && tiposEvento.length > 0 && (
                  <div className="space-y-2">
                    <Label>Motivo / Tipos de Consulta <span className="text-xs text-gray-400 font-normal">(puede seleccionar varios)</span></Label>
                    <div className="flex flex-wrap gap-2 p-3 border border-gray-200 rounded-lg bg-gray-50/50 min-h-[42px]">
                      {tiposEvento.map(t => {
                        const selectedIds: string[] = formData.eventoTipoId ? formData.eventoTipoId.split(",").filter(Boolean) : [];
                        const isSelected = selectedIds.includes(t.id);
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => {
                              const current = formData.eventoTipoId ? formData.eventoTipoId.split(",").filter(Boolean) : [];
                              const updated = isSelected ? current.filter(id => id !== t.id) : [...current, t.id];
                              setFormData(prev => ({ ...prev, eventoTipoId: updated.join(",") }));
                            }}
                            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all border-2 ${
                              isSelected ? `${t.color} border-current shadow-sm` : "bg-white text-gray-500 border-gray-200 hover:border-gray-400"
                            }`}
                          >
                            {isSelected && <span className="mr-1">✓</span>}
                            {t.name}
                          </button>
                        );
                      })}
                    </div>
                    {formData.eventoTipoId && (
                      <p className="text-xs text-gray-500">
                        Seleccionados: {formData.eventoTipoId.split(",").filter(Boolean).map(id => tiposEvento.find(t => t.id === id)?.name).filter(Boolean).join(", ")}
                      </p>
                    )}
                  </div>
                )}

                {/* Campos de fecha/hora según la naturaleza del servicio */}
                {formKind === "scheduled" ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Fecha <span className="text-red-500">*</span></Label>
                      <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="w-full justify-start text-left">
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {format(formData.date, "PPP", { locale: es })}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            locale={es}
                            selected={formData.date}
                            defaultMonth={formData.date}
                            onSelect={(date) => { if (date) { setFormData(prev => ({ ...prev, date })); setCalendarOpen(false); } }}
                            disabled={(date) => isBefore(date, startOfDay(new Date()))}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>

                    <div className="space-y-2">
                      <Label>Profesional <span className="text-red-500">*</span></Label>
                      <Select value={formData.doctorId} onValueChange={(v) => setFormData(prev => ({ ...prev, doctorId: v }))}>
                        <SelectTrigger><SelectValue placeholder="Seleccione profesional" /></SelectTrigger>
                        <SelectContent>
                          {doctoresPerfil.length === 0 ? (
                            <div className="px-3 py-4 text-sm text-gray-500 text-center">
                              No hay profesionales registrados.
                              <br />
                              <span className="text-xs">Registre uno desde Seguridad.</span>
                            </div>
                          ) : doctoresParaServicio.length === 0 ? (
                            <div className="px-3 py-4 text-sm text-gray-500 text-center">
                              No hay profesionales con la profesión «{profesionRequerida}».
                              <br />
                              <span className="text-xs">Asigne esa profesión a un profesional desde Seguridad, o cambie la profesión requerida del servicio en Parámetros.</span>
                            </div>
                          ) : doctoresParaServicio.map(d => (
                            <SelectItem key={d.id} value={d.id}>
                              {d.fullName}{d.profesion ? ` — ${d.profesion}` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {profesionRequerida && doctoresParaServicio.length > 0 && (
                        <p className="text-xs text-gray-400">Filtrado por profesión: {profesionRequerida}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label>Horario <span className="text-red-500">*</span></Label>
                      <Select
                        value={formData.startTime}
                        onValueChange={(v) => setFormData(prev => ({ ...prev, startTime: v }))}
                        disabled={!formData.doctorId || availableTimeSlots.length === 0}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={
                            !formData.doctorId ? "Primero seleccione profesional"
                              : availableTimeSlots.length === 0 ? "Sin horarios para este día"
                                : "Seleccione horario"
                          } />
                        </SelectTrigger>
                        <SelectContent>
                          {availableTimeSlots.length === 0 ? (
                            <div className="px-3 py-4 text-center text-sm text-gray-500">
                              Sin horarios configurados para este día.<br />
                              Configure en Módulo de Seguridad.
                            </div>
                          ) : (
                            availableTimeSlots.map(time => {
                              const avail = isTimeSlotAvailable(time, formData.doctorId);
                              return (
                                <SelectItem key={time} value={time} disabled={!avail}>
                                  {time}{!avail ? " (Ocupado)" : ""}
                                </SelectItem>
                              );
                            })
                          )}
                        </SelectContent>
                      </Select>
                      {formData.doctorId && availableTimeSlots.length === 0 && (
                        <p className="text-xs text-orange-600">
                          Sin horarios para {["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"][formData.date.getDay()]}
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Fecha Desde <span className="text-red-500">*</span></Label>
                      <Popover open={dateFromOpen} onOpenChange={setDateFromOpen}>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="w-full justify-start text-left">
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {formData.dateFrom ? format(formData.dateFrom, "PPP", { locale: es }) : "Seleccionar fecha"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            locale={es}
                            selected={formData.dateFrom}
                            defaultMonth={formData.dateFrom}
                            onSelect={(date) => {
                              if (!date) return;
                              setFormData(prev => ({
                                ...prev,
                                dateFrom: date,
                                date,
                                // Un "hasta" anterior al nuevo "desde" queda inválido
                                dateTo: prev.dateTo && prev.dateTo < date ? undefined : prev.dateTo,
                              }));
                              setDateFromOpen(false);
                            }}
                            disabled={(date) => isBefore(date, startOfDay(new Date()))}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>

                    <div className="space-y-2">
                      <Label>Fecha Hasta <span className="text-red-500">*</span></Label>
                      <Popover open={dateToOpen} onOpenChange={setDateToOpen}>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="w-full justify-start text-left">
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {formData.dateTo ? format(formData.dateTo, "PPP", { locale: es }) : "Seleccionar fecha"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            locale={es}
                            selected={formData.dateTo}
                            defaultMonth={formData.dateTo ?? formData.dateFrom}
                            onSelect={(date) => { if (date) { setFormData(prev => ({ ...prev, dateTo: date })); setDateToOpen(false); } }}
                            disabled={(date) => isBefore(date, startOfDay(formData.dateFrom ?? new Date()))}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Notas Adicionales (opcional)</Label>
                  <Textarea
                    value={formData.notes}
                    onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                    placeholder="Información adicional sobre el turno..."
                    rows={3}
                  />
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <Button
                    onClick={handleSave}
                    className="flex-1 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700"
                    disabled={!hasPermission("manage_appointments")}
                  >
                    <Save className="mr-2 h-4 w-4" />
                    {isEditing ? "Actualizar Turno" : "Agendar y Confirmar"}
                  </Button>
                  <Button onClick={handleCancel} variant="outline" className="flex-1 border-orange-300 hover:bg-orange-50">
                    <X className="mr-2 h-4 w-4" />
                    Cancelar
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este turno?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}