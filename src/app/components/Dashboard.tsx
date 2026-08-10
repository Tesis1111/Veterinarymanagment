import { useAuth } from "../context/AuthContext";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Button } from "./ui/button";
import {
  Users,
  PawPrint,
  FileText,
  Calendar,
  TrendingUp,
  Settings,
  Shield,
  Stethoscope,
  UserCheck,
  Scissors,
  BarChart2,
} from "lucide-react";
import { useState, useEffect } from "react";
import {
  Client,
  Pet,
  MedicalRecord,
  Appointment,
  DashboardPreferences,
  TipoServicioParametro,
} from "../types";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { Label } from "./ui/label";
import { Switch } from "./ui/switch";
import { toast } from "sonner";
import ReportsModule from "./modules/ReportsModule";
import { traerClientes } from "../services/clienteService";
import { traerMascotas } from "../services/mascotaService";
import { traerTodosLosHistoriales } from "../services/historialService";
import { traerTurnos } from "../services/turnoService";
import { suscribirTiposServicio } from "../services/parametrosService";
import { ROLE_META } from "../services/userService";
import { FIREBASE_CONFIGURED, db } from "../firebase/config";
import { onSnapshot, collection, query, where, orderBy, limit, Timestamp } from "firebase/firestore";

// Debe coincidir con ModuleType de App.tsx: el botón "Reportes" navega a
// "reports" y sin ese miembro el destino no estaba cubierto por el tipo.
type ActiveModule =
  | "dashboard"
  | "clients"
  | "pets"
  | "medical"
  | "appointments"
  | "users"
  | "audit"
  | "reports"
  | "profile"
  | "business_hours"
  | "parametros";

interface DashboardProps {
  setActiveModule: (module: ActiveModule) => void;
}

export default function Dashboard({
  setActiveModule,
}: DashboardProps) {
  const { user, isAdmin, hasPermission } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [pets, setPets] = useState<Pet[]>([]);
  const [medicalRecords, setMedicalRecords] = useState<
    MedicalRecord[]
  >([]);
  const [appointments, setAppointments] = useState<
    Appointment[]
  >([]);
  const [tiposServicio, setTiposServicio] = useState<TipoServicioParametro[]>([]);
  const [preferences, setPreferences] = useState<DashboardPreferences>({
    showTotalClients: true,
    showTotalPets: true,
    showTodayAppointments: true,
    showUpcomingAppointments: true,
    showTodayDetails: true,
    showRecentActivity: true,
    showQuickActions: true,
  });
  const [preferencesOpen, setPreferencesOpen] = useState(false);

  useEffect(() => {
    if (FIREBASE_CONFIGURED && db) {
      // Clientes/mascotas completos (colecciones chicas): se comparten con el
      // ReportsModule embebido, que necesita también los dados de baja para
      // resolver nombres y para el alcance "inactivos".
      const unsubClients = onSnapshot(
        collection(db, "clientes"),
        (snap) => setClients(snap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt instanceof Timestamp ? d.data().createdAt.toDate() : new Date() } as any))),
        () => traerClientes(true).then(setClients).catch(() => setClients([]))
      );
      const unsubPets = onSnapshot(
        collection(db, "mascotas"),
        (snap) => setPets(snap.docs.map(d => ({ id: d.id, ...d.data(), deceased: d.data().deceased ?? false } as any))),
        () => traerMascotas().then(setPets).catch(() => setPets([]))
      );
      // Historiales: solo los 50 más recientes (el Dashboard muestra 5)
      const unsubMedical = onSnapshot(
        query(collection(db, "historiales"), where("deleted", "==", false), orderBy("date", "desc"), limit(50)),
        (snap) => setMedicalRecords(snap.docs.map(d => ({ id: d.id, ...d.data(), date: d.data().date instanceof Timestamp ? d.data().date.toDate() : new Date(d.data().date || d.data().fecha) } as any))),
        () => traerTodosLosHistoriales().then(setMedicalRecords).catch(() => setMedicalRecords([]))
      );
      // Turnos: ventana [ayer, +31 días) — cubre "hoy" y "próximos" sin
      // descargar el histórico completo (rango de un solo campo, sin índice).
      const rangeStart = new Date(); rangeStart.setDate(rangeStart.getDate() - 1); rangeStart.setHours(0, 0, 0, 0);
      const rangeEnd = new Date(); rangeEnd.setDate(rangeEnd.getDate() + 31); rangeEnd.setHours(0, 0, 0, 0);
      const unsubAppts = onSnapshot(
        query(collection(db, "turnos"), where("date", ">=", rangeStart), where("date", "<", rangeEnd)),
        (snap) => setAppointments(snap.docs.filter(d => d.data().deleted !== true).map(d => {
          const data = d.data();
          const rawTs = data.date;
          const dateConverted = rawTs instanceof Timestamp ? rawTs.toDate() : new Date(data.date ?? data.fecha ?? Date.now());
          return { id: d.id, ...data, date: dateConverted, _rawDate: rawTs } as any;
        })),
        () => traerTurnos().then(setAppointments).catch(() => setAppointments([]))
      );
      const unsubTiposServicio = suscribirTiposServicio(setTiposServicio);

      const loadedPreferences = localStorage.getItem("veterinaria_dashboard_preferences");
      if (loadedPreferences) {
        try { setPreferences(JSON.parse(loadedPreferences)); } catch { /* ignore */ }
      }

      return () => {
        unsubClients();
        unsubPets();
        unsubMedical();
        unsubAppts();
        unsubTiposServicio();
      };
    } else {
      traerClientes().then(setClients).catch(() => setClients([]));
      traerMascotas().then(setPets).catch(() => setPets([]));
      traerTodosLosHistoriales().then(setMedicalRecords).catch(() => setMedicalRecords([]));
      traerTurnos().then(setAppointments).catch(() => setAppointments([]));

      const loadedPreferences = localStorage.getItem("veterinaria_dashboard_preferences");
      if (loadedPreferences) {
        try { setPreferences(JSON.parse(loadedPreferences)); } catch { /* ignore */ }
      }
    }
  }, []);

  const handlePreferenceChange = (key: keyof DashboardPreferences, value: boolean) => {
    const newPreferences = { ...preferences, [key]: value };
    setPreferences(newPreferences);
    localStorage.setItem("veterinaria_dashboard_preferences", JSON.stringify(newPreferences));
    toast.success("Preferencias actualizadas");
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayAppointments = appointments.filter((apt) => {
    // Handle both Date objects and Firestore Timestamps
    const rawDate = (apt as any)._rawDate ?? apt.date;
    let aptDate: Date;
    if (rawDate && typeof rawDate === 'object' && typeof rawDate.toDate === 'function') {
      aptDate = rawDate.toDate();
    } else {
      aptDate = new Date(rawDate ?? apt.date);
    }
    if (isNaN(aptDate.getTime())) return false;
    aptDate = new Date(aptDate);
    aptDate.setHours(0, 0, 0, 0);
    // Handle all cancel status variants (Spanish/English)
    const status = (apt.status ?? "").toLowerCase();
    if (status === "cancelado" || status === "cancelled") return false;
    return aptDate.getTime() === today.getTime();
  });

  const recentRecords = [...medicalRecords]
    .sort(
      (a, b) =>
        new Date(b.date).getTime() - new Date(a.date).getTime(),
    )
    .slice(0, 5);

  const stats = [
    {
      key: "showTotalClients",
      title: "Total Clientes",
      value: clients.filter(c => !(c as any).deleted).length,
      icon: Users,
      color: "from-orange-500 to-orange-600",
      bgColor: "bg-orange-50",
      textColor: "text-orange-700",
      onClick: () => {
        localStorage.setItem("clients_initial_tab", "list");
        setActiveModule("clients");
      },
    },
    {
      key: "showTotalPets",
      title: "Total Mascotas",
      value: pets.filter(p => !(p as any).deleted).length,
      icon: PawPrint,
      color: "from-amber-500 to-amber-600",
      bgColor: "bg-amber-50",
      textColor: "text-amber-700",
      onClick: () => {
        localStorage.setItem("pets_initial_tab", "list");
        setActiveModule("pets");
      },
    },
    {
      key: "showTodayAppointments",
      title: "Calendario turnos",
      value: todayAppointments.length,
      icon: Calendar,
      color: "from-red-500 to-red-600",
      bgColor: "bg-red-50",
      textColor: "text-red-700",
      onClick: () => setActiveModule("appointments"),
    }
  ];

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Welcome Section */}
      <div className="bg-gradient-to-r from-orange-500 to-orange-600 rounded-xl shadow-lg p-4 md:p-6 lg:p-8 text-white flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h1 className="text-white text-xl md:text-2xl lg:text-3xl m-0">
              Bienvenido, {user?.fullName?.split(" ")[0]}
            </h1>
            {/* Role badge */}
            {user?.roleName && ROLE_META[user.roleName] && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-white/20 text-white border border-white/30">
                {user.roleName === "admin" && <Shield className="h-3 w-3" />}
                {user.roleName === "veterinario" && <Stethoscope className="h-3 w-3" />}
                {user.roleName === "recepcionista" && <UserCheck className="h-3 w-3" />}
                {user.roleName === "peluquero" && <Scissors className="h-3 w-3" />}
                {ROLE_META[user.roleName].displayName}
              </span>
            )}
          </div>
          <p className="text-orange-100 text-sm md:text-base">
            Sistema de Gestión Veterinaria Leo
            {" · "}
            {format(new Date(), "EEEE d 'de' MMMM, yyyy", { locale: es })}
          </p>
          {/* Firebase connection indicator */}
          <div className="flex items-center gap-1.5 mt-2">
            <span className={`h-1.5 w-1.5 rounded-full ${FIREBASE_CONFIGURED ? "bg-green-300" : "bg-yellow-300"}`} />
            <span className="text-xs text-orange-100">
              {FIREBASE_CONFIGURED ? "Conectado a Firebase" : "Modo demo (sin Firebase)"}
            </span>
          </div>
        </div>
        <Dialog open={preferencesOpen} onOpenChange={setPreferencesOpen}>
          <DialogTrigger asChild>
            <Button variant="secondary" size="sm">
              <Settings className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">Configurar</span>
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-orange-800">Preferencias del Dashboard</DialogTitle>
              <DialogDescription>
                Selecciona qué secciones deseas ver en tu panel de control
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-3">
                <Label className="text-base">Estadísticas</Label>
                <div className="space-y-2 pl-4">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="showTotalClients" className="text-sm">Total Clientes</Label>
                    <Switch
                      id="showTotalClients"
                      checked={preferences.showTotalClients}
                      onCheckedChange={(checked) => handlePreferenceChange("showTotalClients", checked)}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="showTotalPets" className="text-sm">Total Mascotas</Label>
                    <Switch
                      id="showTotalPets"
                      checked={preferences.showTotalPets}
                      onCheckedChange={(checked) => handlePreferenceChange("showTotalPets", checked)}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="showTodayAppointments" className="text-sm">Calendario turnos</Label>
                    <Switch
                      id="showTodayAppointments"
                      checked={preferences.showTodayAppointments}
                      onCheckedChange={(checked) => handlePreferenceChange("showTodayAppointments", checked)}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-base">Secciones</Label>
                <div className="space-y-2 pl-4">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="showTodayDetails" className="text-sm">Turnos de Hoy (Detalle)</Label>
                    <Switch
                      id="showTodayDetails"
                      checked={preferences.showTodayDetails}
                      onCheckedChange={(checked) => handlePreferenceChange("showTodayDetails", checked)}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="showRecentActivity" className="text-sm">Actividad Reciente</Label>
                    <Switch
                      id="showRecentActivity"
                      checked={preferences.showRecentActivity}
                      onCheckedChange={(checked) => handlePreferenceChange("showRecentActivity", checked)}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="showQuickActions" className="text-sm">Acciones Rápidas</Label>
                    <Switch
                      id="showQuickActions"
                      checked={preferences.showQuickActions}
                      onCheckedChange={(checked) => handlePreferenceChange("showQuickActions", checked)}
                    />
                  </div>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Grid */}
      {stats.some(stat => preferences[stat.key as keyof DashboardPreferences]) && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          {stats.filter(stat => preferences[stat.key as keyof DashboardPreferences]).map((stat, index) => (
            <Card
              key={index}
              className="border-orange-200 shadow-md hover:shadow-lg transition-shadow cursor-pointer"
              onClick={stat.onClick}
            >
              <CardContent className="p-3 md:p-4 lg:p-6">
                <div className="flex flex-col md:flex-row items-start md:items-center md:justify-between gap-2">
                  <div className="flex-1 w-full">
                    <p className="text-xs md:text-sm text-gray-600 mb-1">
                      {stat.title}
                    </p>
                    <p
                      className={`text-2xl md:text-3xl ${stat.textColor}`}
                    >
                      {stat.value}
                    </p>
                  </div>
                  <div
                    className={`p-2 md:p-3 rounded-xl bg-gradient-to-br ${stat.color} shadow-md self-end md:self-auto`}
                  >
                    <stat.icon className="h-4 w-4 md:h-5 md:w-5 lg:h-6 lg:w-6 text-white" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {(preferences.showTodayDetails || preferences.showRecentActivity) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
          {/* Today's Appointments */}
          {preferences.showTodayDetails && (
            <Card className="border-orange-200 shadow-md">
              <CardHeader className="bg-gradient-to-r from-orange-50 to-white p-4 md:p-6">
                <CardTitle className="text-orange-800 flex items-center gap-2 text-base md:text-lg">
                  <Calendar className="h-4 w-4 md:h-5 md:w-5" />
                  Turnos de Hoy
                </CardTitle>
                <CardDescription className="text-xs md:text-sm">
                  Agenda del día de hoy
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-4 md:pt-6 p-4 md:p-6">
                {todayAppointments.length === 0 ? (
                  <div className="text-center py-6 md:py-8 text-gray-500">
                    <Calendar className="h-10 w-10 md:h-12 md:w-12 mx-auto mb-3 text-gray-300" />
                    <p className="text-sm md:text-base">
                      No hay turnos programados para hoy
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 md:space-y-3">
                    {todayAppointments.slice(0, 5).map((apt) => {
                      const client = clients.find(
                        (c) => c.id === apt.clientId,
                      );
                      const pet = pets.find(
                        (p) => p.id === apt.petId,
                      );
                      return (
                        <div
                          key={apt.id}
                          className="p-3 bg-orange-50 rounded-lg border border-orange-200"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-1">
                            <p className="text-sm text-orange-800">
                              {apt.startTime || "Todo el día"}
                            </p>
                            {(() => {
                              const dynamicType = tiposServicio.find(t => t.id === apt.type || t.name.toLowerCase() === (apt.type ?? "").toLowerCase());
                              const colorClass = dynamicType?.color || (apt.type === "clinic" ? "bg-blue-100 text-blue-800" : apt.type === "grooming" ? "bg-pink-100 text-pink-800" : apt.type === "daycare" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800");
                              const label = dynamicType?.name || (apt.type === "clinic" ? "Clínica" : apt.type === "grooming" ? "Peluquería" : apt.type === "daycare" ? "Guardería" : apt.type);
                              return (
                                <span className={`text-xs px-2 py-1 rounded-full self-start sm:self-auto ${colorClass}`}>
                                  {label}
                                </span>
                              );
                            })()}
                          </div>
                          <p className="text-sm">
                            <strong>{pet?.name}</strong> -{" "}
                            {client?.fullName}
                          </p>
                          <p className="text-xs text-gray-600">
                            {apt.reason}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
                <Button
                  onClick={() => setActiveModule("appointments")}
                  variant="outline"
                  className="w-full mt-4 border-orange-300 hover:bg-orange-50 text-sm md:text-base"
                  size="sm"
                >
                  Ver todos los turnos
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Recent Activity */}
          {preferences.showRecentActivity && (
            <Card className="border-orange-200 shadow-md">
              <CardHeader className="bg-gradient-to-r from-orange-50 to-white p-4 md:p-6">
                <CardTitle className="text-orange-800 flex items-center gap-2 text-base md:text-lg">
                  <FileText className="h-4 w-4 md:h-5 md:w-5" />
                  Actividad Reciente
                </CardTitle>
                <CardDescription className="text-xs md:text-sm">
                  Últimos registros médicos
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-4 md:pt-6 p-4 md:p-6">
                {recentRecords.length === 0 ? (
                  <div className="text-center py-6 md:py-8 text-gray-500">
                    <FileText className="h-10 w-10 md:h-12 md:w-12 mx-auto mb-3 text-gray-300" />
                    <p className="text-sm md:text-base">
                      No hay registros médicos recientes
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 md:space-y-3">
                    {recentRecords.map((record) => {
                      const pet = pets.find(
                        (p) => p.id === record.petId,
                      );
                      const client = clients.find(
                        (c) => c.id === pet?.clientId,
                      );
                      return (
                        <div
                          key={record.id}
                          className="p-3 bg-orange-50 rounded-lg border border-orange-200"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-1">
                            <p className="text-sm text-orange-800">
                              {format(
                                new Date(record.date),
                                "dd/MM/yyyy",
                              )}
                            </p>
                            <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700 self-start sm:self-auto">
                              {record.eventType}
                            </span>
                          </div>
                          <p className="text-sm">
                            <strong>{pet?.name}</strong> -{" "}
                            {client?.fullName}
                          </p>
                          <p className="text-xs text-gray-600 line-clamp-1">
                            {record.description}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
                <Button
                  onClick={() => setActiveModule("medical")}
                  variant="outline"
                  className="w-full mt-4 border-orange-300 hover:bg-orange-50 text-sm md:text-base"
                  size="sm"
                >
                  Ver historial completo
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Quick Actions */}
      {preferences.showQuickActions && (
        <Card className="border-orange-200 shadow-md">
          <CardHeader className="bg-gradient-to-r from-orange-50 to-white p-4 md:p-6">
            <CardTitle className="text-orange-800 flex items-center gap-2 text-base md:text-lg">
              <TrendingUp className="h-4 w-4 md:h-5 md:w-5" />
              Acciones Rápidas
            </CardTitle>
            <CardDescription className="text-xs md:text-sm">
              Accede rápidamente a las funciones principales
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4 md:pt-6 p-4 md:p-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-3">
              {/* Solo roles con permiso de gestión (admin/recepcionista); el
                  veterinario/peluquero navega desde las stat cards a la lista */}
              <Button
                onClick={() => {
                  if (hasPermission("manage_clients")) localStorage.setItem("clients_initial_tab", "new");
                  setActiveModule("clients");
                }}
                variant="outline"
                className="h-auto py-3 md:py-4 flex flex-col items-center gap-2 border-orange-300 hover:bg-orange-50 text-xs md:text-sm"
              >
                <Users className="h-5 w-5 md:h-6 md:w-6 text-orange-600" />
                <span className="text-center">
                  {hasPermission("manage_clients") ? "Registrar Cliente" : "Ver Clientes"}
                </span>
              </Button>
              <Button
                onClick={() => {
                  if (hasPermission("manage_pets")) localStorage.setItem("pets_initial_tab", "new");
                  setActiveModule("pets");
                }}
                variant="outline"
                className="h-auto py-3 md:py-4 flex flex-col items-center gap-2 border-orange-300 hover:bg-orange-50 text-xs md:text-sm"
              >
                <PawPrint className="h-5 w-5 md:h-6 md:w-6 text-orange-600" />
                <span className="text-center">
                  {hasPermission("manage_pets") ? "Registrar Mascota" : "Ver Mascotas"}
                </span>
              </Button>
              <Button
                onClick={() => {
                  localStorage.setItem("appointments_initial_tab", "schedule");
                  setActiveModule("appointments");
                }}
                variant="outline"
                className="h-auto py-3 md:py-4 flex flex-col items-center gap-2 border-orange-300 hover:bg-orange-50 text-xs md:text-sm"
              >
                <Calendar className="h-5 w-5 md:h-6 md:w-6 text-orange-600" />
                <span className="text-center">Agendar Turno</span>
              </Button>
              <Button
                onClick={() => setActiveModule("medical")}
                variant="outline"
                className="h-auto py-3 md:py-4 flex flex-col items-center gap-2 border-orange-300 hover:bg-orange-50 text-xs md:text-sm"
              >
                <FileText className="h-5 w-5 md:h-6 md:w-6 text-orange-600" />
                <span className="text-center">
                  Historial Clínico
                </span>
              </Button>

              {/* Admin-only actions */}
              {isAdmin && (
                <Button
                  onClick={() => setActiveModule("users")}
                  variant="outline"
                  className="h-auto py-3 md:py-4 flex flex-col items-center gap-2 border-orange-300 hover:bg-orange-50 text-xs md:text-sm"
                >
                  <Shield className="h-5 w-5 md:h-6 md:w-6 text-orange-600" />
                  <span className="text-center">Usuarios</span>
                </Button>
              )}
              {isAdmin && (
                <Button
                  onClick={() => setActiveModule("reports")}
                  variant="outline"
                  className="h-auto py-3 md:py-4 flex flex-col items-center gap-2 border-orange-300 hover:bg-orange-50 text-xs md:text-sm"
                >
                  <BarChart2 className="h-5 w-5 md:h-6 md:w-6 text-orange-600" />
                  <span className="text-center">Reportes</span>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Embedded Reports Module — mismo criterio que la ruta protegida
          (AdminGuard requiredRole="veterinario" en App.tsx). Se le pasan los
          clientes/mascotas ya suscritos para no duplicar listeners. */}
      {(user?.roleName === "admin" || user?.roleName === "veterinario") && (
        <div className="pt-4 border-t border-orange-200 mt-6">
          <ReportsModule externalClients={clients} externalPets={pets} />
        </div>
      )}
    </div>
  );
}
