import { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import { Doctor, DoctorSchedule } from "../../types";
import {
  traerTodosLosHorarios,
  registrarHorario,
  desactivarHorario,
  eliminarHorario,
  validarHorario,
} from "../../services/horarioService";
import { traerDoctores } from "../../services/doctorService";
import { db, FIREBASE_CONFIGURED } from "../../firebase/config";
import { useSuccessPopup } from "../../context/SuccessPopupContext";
import { collection, onSnapshot, query, where, Timestamp } from "firebase/firestore";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Switch } from "../ui/switch";
import { Badge } from "../ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../ui/alert-dialog";
import { Shield, Clock, Trash2, Plus, Calendar as CalendarIcon } from "lucide-react";
import { toast } from "sonner";

const daysOfWeek = [
  { value: 1, label: "Lunes" },
  { value: 2, label: "Martes" },
  { value: 3, label: "Miércoles" },
  { value: 4, label: "Jueves" },
  { value: 5, label: "Viernes" },
  { value: 6, label: "Sábado" },
  { value: 0, label: "Domingo" },
];

const timeOptions = [
  "07:00", "07:30", "08:00", "08:30", "09:00", "09:30", "10:00", "10:30",
  "11:00", "11:30", "12:00", "12:30", "13:00", "13:30",
  "14:00", "14:30", "15:00", "15:30", "16:00", "16:30",
  "17:00", "17:30", "18:00", "18:30", "19:00", "19:30", "20:00", "20:30", "21:00",
];

export default function BusinessHoursModule() {
  const { isAdmin } = useAuth();
  const { showSuccess } = useSuccessPopup();

  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [schedules, setSchedules] = useState<DoctorSchedule[]>([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>("");
  const [deleteScheduleDialogOpen, setDeleteScheduleDialogOpen] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState<DoctorSchedule | null>(null);
  const [scheduleForm, setScheduleForm] = useState({
    dayOfWeek: 1, startTime: "09:00", endTime: "17:00", active: true,
  });

  useEffect(() => {
    traerTodosLosHorarios().then(setSchedules).catch(() => setSchedules([]));

    // Fuente única de profesionales — colección "doctores", en tiempo real.
    // Solo disponibles (available == true), coherente con Turnos e Historia Clínica.
    if (FIREBASE_CONFIGURED && db) {
      const unsubDoctors = onSnapshot(
        query(collection(db, "doctores"), where("available", "==", true)),
        (snap) => {
          const list = snap.docs.map(d => {
            const data = d.data();
            return {
              id: d.id,
              userId: data.userId ?? "",
              name: data.fullName ?? data.name ?? "",
              profesion: data.profesion ?? "",
              specialty: data.specialty ?? "",
              available: data.available !== false,
              createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(),
            } as Doctor;
          }).sort((a, b) => a.name.localeCompare(b.name, "es"));
          setDoctors(list);
        },
        () => traerDoctores().then(d =>
          setDoctors(d.map(dp => ({ id: dp.id, userId: dp.userId ?? "", name: dp.fullName, profesion: dp.profesion, specialty: dp.specialty, available: dp.available, createdAt: dp.createdAt })) as any)
        ).catch(() => setDoctors([]))
      );
      return () => { unsubDoctors(); };
    } else {
      traerDoctores().then(d =>
        setDoctors(d.map(dp => ({ id: dp.id, userId: dp.userId ?? "", name: dp.fullName, profesion: dp.profesion, specialty: dp.specialty, available: dp.available, createdAt: dp.createdAt })) as any)
      ).catch(() => setDoctors([]));
    }
  }, []);

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <Card className="border-orange-200 shadow-md">
          <CardContent className="pt-12 pb-12">
            <div className="text-center text-gray-500">
              <Shield className="h-16 w-16 mx-auto mb-4 text-gray-300" />
              <h2 className="text-gray-700 mb-2">Acceso Restringido</h2>
              <p>Solo los administradores pueden acceder al módulo de horarios de atención</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const getDayName = (n: number) => daysOfWeek.find(d => d.value === n)?.label || "";

  const allDoctors = doctors;

  const selectedDoctorSchedules = schedules
    .filter(s => s.doctorId === selectedDoctorId)
    .sort((a, b) => {
      if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
      return a.startTime.localeCompare(b.startTime);
    });

  const handleAddSchedule = async () => {
    if (!selectedDoctorId) {
      toast.error("Seleccione un profesional primero");
      return;
    }
    // validarHorario — Gestor Alta Horario
    const validation = await validarHorario(
      selectedDoctorId,
      scheduleForm.dayOfWeek,
      scheduleForm.startTime,
      scheduleForm.endTime
    );
    if (!validation.valid) {
      toast.error(validation.errors[0]?.message || "Error en la validación del horario");
      return;
    }

    try {
      const newSchedule = await registrarHorario(
        selectedDoctorId,
        scheduleForm.dayOfWeek,
        scheduleForm.startTime,
        scheduleForm.endTime
      );
      setSchedules(prev => [...prev, newSchedule]);
      showSuccess("Horario agregado exitosamente");
      setScheduleForm({ dayOfWeek: 1, startTime: "09:00", endTime: "17:00", active: true });
    } catch {
      toast.error("Error al guardar el horario.");
    }
  };

  const handleToggleSchedule = async (id: string) => {
    const schedule = schedules.find(s => s.id === id);
    if (schedule?.active) {
      await desactivarHorario(id).catch(() => {});
    }
    setSchedules(prev => prev.map(s => s.id === id ? { ...s, active: !s.active } : s));
    showSuccess("Estado del horario actualizado");
  };

  const handleDeleteSchedule = async () => {
    if (selectedSchedule) {
      try {
        await eliminarHorario(selectedSchedule.id);
        setSchedules(prev => prev.filter(s => s.id !== selectedSchedule.id));
        showSuccess("Horario eliminado");
      } catch {
        toast.error("Error al eliminar el horario.");
      }
      setDeleteScheduleDialogOpen(false);
      setSelectedSchedule(null);
    }
  };

  const schedulesByDay = daysOfWeek.map(day => ({
    ...day,
    slots: selectedDoctorSchedules.filter(s => s.dayOfWeek === day.value),
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-orange-800 flex items-center gap-2">
          <Clock className="h-8 w-8" />
          Horarios de Atención
        </h1>
        <p className="text-gray-600 mt-1">Gestión de días y horarios disponibles de los profesionales</p>
      </div>

      {/* Selector de profesional */}
      <Card className="border-blue-200 shadow-md">
        <CardHeader className="bg-gradient-to-r from-blue-50 to-white">
          <CardTitle className="text-blue-800 flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Configuración de Horarios
          </CardTitle>
          <CardDescription>
            Configure los días y rangos horarios de cada profesional.
            Estos horarios determinan los turnos disponibles en el sistema.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="space-y-2 max-w-sm">
            <Label>Seleccionar Profesional</Label>
            <Select value={selectedDoctorId} onValueChange={setSelectedDoctorId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccione un profesional..." />
              </SelectTrigger>
              <SelectContent>
                {allDoctors.length === 0 ? (
                  <div className="px-3 py-4 text-center text-sm text-gray-500">
                    No hay profesionales creados aún
                  </div>
                ) : (
                  allDoctors.map(doc => {
                    return (
                      <SelectItem key={doc.id} value={doc.id}>
                        <span className="flex items-center gap-2">
                          {doc.name}
                          {doc.profesion && <span className="text-xs text-gray-400">— {doc.profesion}</span>}
                        </span>
                      </SelectItem>
                    );
                  })
                )}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Panel de horarios del profesional seleccionado */}
      {selectedDoctorId ? (
        <>
          {/* Formulario agregar horario */}
          <Card className="border-blue-200 shadow-md">
            <CardHeader className="bg-blue-50 pb-3">
              <CardTitle className="text-blue-800 text-base flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Agregar Franja Horaria
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Día de la semana</Label>
                  <Select
                    value={scheduleForm.dayOfWeek.toString()}
                    onValueChange={(v) => setScheduleForm(p => ({ ...p, dayOfWeek: parseInt(v) }))}
                  >
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {daysOfWeek.map(d => (
                        <SelectItem key={d.value} value={d.value.toString()}>{d.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Hora inicio</Label>
                  <Select
                    value={scheduleForm.startTime}
                    onValueChange={(v) => setScheduleForm(p => ({ ...p, startTime: v }))}
                  >
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {timeOptions.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Hora fin</Label>
                  <Select
                    value={scheduleForm.endTime}
                    onValueChange={(v) => setScheduleForm(p => ({ ...p, endTime: v }))}
                  >
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {timeOptions.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-end">
                  <Button
                    onClick={handleAddSchedule}
                    size="sm"
                    className="w-full h-9 bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Agregar
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Vista de horarios: grilla por día */}
          <Card className="border-blue-200 shadow-md">
            <CardHeader className="bg-gradient-to-r from-blue-50 to-white">
              <CardTitle className="text-blue-800 text-base">
                Horarios configurados — {doctors.find(d => d.id === selectedDoctorId)?.name}
              </CardTitle>
              <CardDescription>
                {selectedDoctorSchedules.filter(s => s.active).length} franja{selectedDoctorSchedules.filter(s => s.active).length !== 1 ? "s" : ""} activa{selectedDoctorSchedules.filter(s => s.active).length !== 1 ? "s" : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              {selectedDoctorSchedules.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <CalendarIcon className="h-14 w-14 mx-auto mb-4 text-gray-200" />
                  <p className="text-sm">No hay horarios configurados.</p>
                  <p className="text-xs text-gray-400 mt-1">Use el formulario de arriba para agregar franjas horarias.</p>
                </div>
              ) : (
                <>
                  {/* Grilla visual por día */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 mb-6">
                    {schedulesByDay.filter(d => d.slots.length > 0).map(day => (
                      <div key={day.value} className="border rounded-lg overflow-hidden">
                        <div className="bg-blue-50 px-3 py-2 border-b">
                          <p className="text-sm font-semibold text-blue-800">{day.label}</p>
                        </div>
                        <div className="p-2 space-y-1">
                          {day.slots.map(slot => (
                            <div
                              key={slot.id}
                              className={`flex items-center justify-between px-2 py-1 rounded text-xs ${slot.active ? "bg-green-50 text-green-800" : "bg-gray-50 text-gray-400 line-through"}`}
                            >
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {slot.startTime} – {slot.endTime}
                              </span>
                              <div className="flex items-center gap-1">
                                <Switch
                                  checked={slot.active}
                                  onCheckedChange={() => handleToggleSchedule(slot.id)}
                                  className="scale-75"
                                />
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => { setSelectedSchedule(slot); setDeleteScheduleDialogOpen(true); }}
                                  className="h-5 w-5 p-0 text-red-400 hover:text-red-600 hover:bg-red-50"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        <Card className="border-dashed border-blue-200">
          <CardContent className="pt-12 pb-12 text-center text-gray-400">
            <Clock className="h-16 w-16 mx-auto mb-4 text-gray-200" />
            <p>Seleccione un profesional para gestionar sus horarios</p>
            <p className="text-xs mt-1">
              Se muestran todos los profesionales con una profesión asignada
            </p>
          </CardContent>
        </Card>
      )}

      {/* Resumen global de todos los profesionales */}
      {allDoctors.length > 0 && (
        <Card className="border-orange-200 shadow-md">
          <CardHeader className="bg-gradient-to-r from-orange-50 to-white">
            <CardTitle className="text-orange-800 text-base flex items-center gap-2">
              <CalendarIcon className="h-4 w-4" />
              Resumen de Disponibilidad - Todos los Profesionales
            </CardTitle>
            <CardDescription>Vista general de todos los profesionales del sistema</CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="space-y-3">
              {allDoctors.map(doc => {
                const docSchedules = schedules.filter(s => s.doctorId === doc.id && s.active);
                const daysWithSlots = [...new Set(docSchedules.map(s => s.dayOfWeek))];
                return (
                  <div key={doc.id} className="flex items-center gap-3 p-3 rounded-lg border bg-gray-50/50 hover:bg-gray-100/50 transition-colors">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-800">{doc.name}</p>
                      <p className="text-xs text-gray-500">{doc.specialty}</p>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {daysWithSlots.length === 0 ? (
                        <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                          Sin horarios
                        </span>
                      ) : (
                        daysWithSlots.sort().map(d => (
                          <span key={d} className="text-xs bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded">
                            {getDayName(d).slice(0, 3)}
                          </span>
                        ))
                      )}
                    </div>
                    <Badge className={docSchedules.length > 0 ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-500"}>
                      {docSchedules.length} franja{docSchedules.length !== 1 ? "s" : ""}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialogs */}
      <AlertDialog open={deleteScheduleDialogOpen} onOpenChange={setDeleteScheduleDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar horario?</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedSchedule && (
                <>Se eliminará el horario del <strong>{getDayName(selectedSchedule.dayOfWeek)}</strong> de{" "}
                  <strong>{selectedSchedule.startTime} a {selectedSchedule.endTime}</strong>. Esta acción no se puede deshacer.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteSchedule} className="bg-red-600 hover:bg-red-700 text-white">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}