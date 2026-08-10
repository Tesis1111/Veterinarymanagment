import { useState, useEffect, useMemo } from "react";
import { db, FIREBASE_CONFIGURED } from "../../firebase/config";
import { collection, onSnapshot, query, where, Timestamp } from "firebase/firestore";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Badge } from "../ui/badge";
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area
} from "recharts";
import { Calendar } from "../ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import {
  BarChart3, PieChart as PieChartIcon, TrendingUp, Users, PawPrint,
  Activity, Calendar as CalendarIcon, FileText, FileSpreadsheet,
  Stethoscope, Award, ArrowUpRight, ArrowDownRight
} from "lucide-react";
import { format, startOfMonth, endOfMonth, subMonths, isWithinInterval } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { exportToPDF, exportToExcel } from "../../utils/exportUtils";
import CustomReportBuilder from "./CustomReportBuilder";
import { suscribirRazas, suscribirTodosTiposServicio } from "../../services/parametrosService";

const COLORS = [
  "#f97316","#fb923c","#fdba74","#fed7aa",
  "#3b82f6","#60a5fa","#93c5fd","#dbeafe",
  "#8b5cf6","#a78bfa","#10b981","#34d399",
];

// Custom tooltip for charts
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-orange-200 rounded-lg p-3 shadow-lg text-sm">
        <p className="font-semibold text-orange-900 mb-1">{label}</p>
        {payload.map((p: any, i: number) => (
          <p key={i} style={{ color: p.color }}>{p.name}: <strong>{p.value}</strong></p>
        ))}
      </div>
    );
  }
  return null;
};

interface ReportsModuleProps {
  /**
   * Datos ya suscritos por el contenedor (Dashboard). Si se proveen, el módulo
   * NO abre sus propias suscripciones a clientes/mascotas — evita duplicar
   * listeners y lecturas cuando está embebido en Inicio.
   */
  externalClients?: any[];
  externalPets?: any[];
}

export default function ReportsModule({ externalClients, externalPets }: ReportsModuleProps = {}) {
  const [ownClients, setOwnClients] = useState<any[]>([]);
  const [ownPets, setOwnPets] = useState<any[]>([]);
  const clients = externalClients ?? ownClients;
  const pets = externalPets ?? ownPets;
  const setClients = setOwnClients;
  const setPets = setOwnPets;
  const [medicalRecords, setMedicalRecords] = useState<any[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [razas, setRazas] = useState<any[]>([]);
  const [tiposServicio, setTiposServicio] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState<Date>(startOfMonth(subMonths(new Date(), 2)));
  const [dateTo, setDateTo] = useState<Date>(endOfMonth(new Date()));
  const [selectedPeriod, setSelectedPeriod] = useState<string>("3months");
  const [calendarFromOpen, setCalendarFromOpen] = useState(false);
  const [calendarToOpen, setCalendarToOpen] = useState(false);
  // Alcance de datos: trabajar con registros activos, inactivos (dados de baja) o todos
  const [dataScope, setDataScope] = useState<"activos" | "inactivos" | "todos">("activos");

  useEffect(() => {
    if (!FIREBASE_CONFIGURED || !db) {
      // Fallback: load via services (getDocs)
      Promise.all([
        import("../../services/clienteService").then(m => m.traerClientes()).catch(() => []),
        import("../../services/mascotaService").then(m => m.traerMascotas()).catch(() => []),
        import("../../services/historialService").then(m => m.traerTodosLosHistoriales()).catch(() => []),
        import("../../services/turnoService").then(m => m.traerTurnos()).catch(() => []),
        import("../../services/doctorService").then(m => m.traerTodosLosDoctores()).catch(() => []),
      ]).then(([c, p, h, t, d]) => {
        setClients(c);
        setPets(p);
        setMedicalRecords(h);
        setAppointments(t);
        setDoctors((d as any[]).map((doc: any) => ({ id: doc.id, name: doc.fullName ?? doc.name ?? "", specialty: doc.specialty ?? "", available: doc.available })));
        setLoading(false);
      });
      return;
    }

    // Cargamos clientes/mascotas COMPLETOS (incluidos dados de baja) para que
    // la resolución de nombres nunca muestre "Desconocido/N/D" — salvo que el
    // contenedor ya los provea por props (Dashboard embebido).
    const unsubs: Array<() => void> = [];

    if (!externalClients) {
      unsubs.push(onSnapshot(collection(db, "clientes"),
        snap => setClients(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
        () => import("../../services/clienteService").then(m => m.traerClientes(true)).then(setClients).catch(() => {})
      ));
    }
    if (!externalPets) {
      unsubs.push(onSnapshot(collection(db, "mascotas"),
        snap => setPets(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
        () => import("../../services/mascotaService").then(m => m.traerMascotas()).then(setPets).catch(() => {})
      ));
    }

    unsubs.push(onSnapshot(collection(db, "doctores"),
      snap => setDoctors(snap.docs.map(d => ({
        id: d.id,
        name: d.data().fullName ?? d.data().name ?? "",
        specialty: d.data().specialty ?? "",
        available: d.data().available !== false,
      }))),
      () => import("../../services/doctorService").then(m => m.traerTodosLosDoctores()).then(docs => {
        setDoctors(docs.map((d: any) => ({ id: d.id, name: d.fullName ?? d.name ?? "", specialty: d.specialty ?? "", available: d.available })));
      }).catch(() => {})
    ));
    unsubs.push(suscribirRazas(setRazas));
    // Lista COMPLETA (incluye inactivos) → nunca mostramos el ID crudo de un
    // tipo de servicio dado de baja en los gráficos históricos.
    unsubs.push(suscribirTodosTiposServicio(setTiposServicio));

    return () => { unsubs.forEach(u => u()); };
  }, []);

  // Historiales y turnos acotados por el rango de fechas activo — query
  // server-side sobre `date` (rango de un solo campo: sin índice compuesto).
  useEffect(() => {
    if (!FIREBASE_CONFIGURED || !db) return;
    const toDate = (v: any) => v instanceof Timestamp ? v.toDate() : v instanceof Date ? v : new Date(v);
    const rangeEnd = new Date(dateTo);
    rangeEnd.setDate(rangeEnd.getDate() + 1);
    rangeEnd.setHours(0, 0, 0, 0);

    const unsubHistoriales = onSnapshot(
      query(collection(db, "historiales"), where("date", ">=", dateFrom), where("date", "<", rangeEnd)),
      snap => {
        setMedicalRecords(snap.docs.map(d => {
          const data = d.data();
          return {
            id: d.id,
            ...data,
            date: data.date ? toDate(data.date) : data.fecha ? toDate(data.fecha) : new Date(),
            eventType: data.tipoEvento ?? data.eventType ?? "Consulta",
            professionalId: data.doctorId ?? data.professionalId ?? "",
          };
        }));
        setLoading(false);
      },
      () => import("../../services/historialService").then(m => m.traerTodosLosHistoriales()).then(setMedicalRecords).catch(() => {})
    );

    const unsubTurnos = onSnapshot(
      query(collection(db, "turnos"), where("date", ">=", dateFrom), where("date", "<", rangeEnd)),
      snap => setAppointments(snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          date: data.date ? toDate(data.date) : data.fecha ? toDate(data.fecha) : new Date(),
        };
      })),
      () => import("../../services/turnoService").then(m => m.traerTurnos()).then(setAppointments).catch(() => {})
    );

    return () => { unsubHistoriales(); unsubTurnos(); };
  }, [dateFrom, dateTo]);

  // Listas según el alcance seleccionado. La resolución de nombres siempre usa
  // las listas completas (clients/pets), por eso nunca aparece "Desconocido".
  const inScope = (deleted: boolean) =>
    dataScope === "todos" ? true : dataScope === "inactivos" ? deleted : !deleted;
  const scopedClients = useMemo(() => clients.filter(c => inScope(!!c.deleted)), [clients, dataScope]);
  const scopedPets = useMemo(() => pets.filter(p => inScope(!!p.deleted)), [pets, dataScope]);

  const filteredRecords = useMemo(() => {
    return medicalRecords.filter(record => {
      const recordDate = new Date(record.date);
      return isWithinInterval(recordDate, { start: dateFrom, end: dateTo });
    });
  }, [medicalRecords, dateFrom, dateTo]);

  // Previous period for comparison
  const prevPeriodMs = dateTo.getTime() - dateFrom.getTime();
  const prevPeriodFrom = new Date(dateFrom.getTime() - prevPeriodMs);
  const prevPeriodTo = new Date(dateFrom.getTime() - 1);
  const prevPeriodRecords = useMemo(() => {
    return medicalRecords.filter(record => {
      const recordDate = new Date(record.date);
      return isWithinInterval(recordDate, { start: prevPeriodFrom, end: prevPeriodTo });
    });
  }, [medicalRecords, prevPeriodFrom, prevPeriodTo]);

  // ── Data calculations ──────────────────────────────────────────

  const clientsBySpecies = useMemo(() => {
    const speciesMap = new Map<string, Set<string>>();
    scopedPets.forEach(pet => {
      const species = pet.species || "Sin especie";
      if (!speciesMap.has(species)) speciesMap.set(species, new Set());
      speciesMap.get(species)!.add(pet.clientId);
    });
    const totalClients = scopedClients.length;
    const data = Array.from(speciesMap.entries()).map(([species, clientIds]) => ({
      name: species,
      clientes: clientIds.size,
      percentage: totalClients > 0 ? ((clientIds.size / totalClients) * 100).toFixed(1) : "0"
    }));
    return data.sort((a, b) => b.clientes - a.clientes);
  }, [scopedClients, scopedPets]);

  const petsByClient = useMemo(() => {
    const clientMap = new Map<string, number>();
    scopedPets.forEach(pet => {
      clientMap.set(pet.clientId, (clientMap.get(pet.clientId) || 0) + 1);
    });
    return Array.from(clientMap.entries())
      .map(([clientId, count]) => ({
        // Resolución con la lista COMPLETA de clientes → nunca "Desconocido"
        name: clients.find(c => c.id === clientId)?.fullName?.split(" ")[0] || "Sin registrar",
        mascotas: count
      }))
      .sort((a, b) => b.mascotas - a.mascotas)
      .slice(0, 10);
  }, [clients, scopedPets]);

  const recordsByDoctor = useMemo(() => {
    const doctorMap = new Map<string, number>();
    filteredRecords.forEach(r => doctorMap.set(r.professionalId, (doctorMap.get(r.professionalId) || 0) + 1));
    return Array.from(doctorMap.entries())
      .map(([doctorId, count]) => {
        // Resolución con la lista COMPLETA de profesionales → nunca "Desconocido"
        const doc = doctors.find(d => d.id === doctorId);
        const resolved = doc?.name || "Sin asignar";
        return { name: resolved.replace("Dra. ", "").replace("Dr. ", ""), fullName: resolved, atenciones: count, specialty: doc?.specialty || "" };
      })
      .sort((a, b) => b.atenciones - a.atenciones);
  }, [filteredRecords, doctors]);

  const recordsByEventType = useMemo(() => {
    const eventMap = new Map<string, number>();
    filteredRecords.forEach(r => eventMap.set(r.eventType, (eventMap.get(r.eventType) || 0) + 1));
    const total = filteredRecords.length || 1;
    return Array.from(eventMap.entries())
      .map(([event, count]) => ({ name: event, value: count, percentage: ((count / total) * 100).toFixed(1) }))
      .sort((a, b) => b.value - a.value);
  }, [filteredRecords]);

  const recordsByMonth = useMemo(() => {
    const monthMap = new Map<string, { atenciones: number; order: string }>();
    filteredRecords.forEach(record => {
      const d = new Date(record.date);
      const key = format(d, "MMM yyyy", { locale: es });
      const order = format(d, "yyyyMM");
      const cur = monthMap.get(key) || { atenciones: 0, order };
      monthMap.set(key, { atenciones: cur.atenciones + 1, order });
    });
    return Array.from(monthMap.entries())
      .map(([month, v]) => ({ month, atenciones: v.atenciones, order: v.order }))
      .sort((a, b) => a.order.localeCompare(b.order));
  }, [filteredRecords]);

  const speciesDistribution = useMemo(() => {
    const speciesMap = new Map<string, number>();
    scopedPets.forEach(pet => {
      const species = pet.species || "Sin especie";
      speciesMap.set(species, (speciesMap.get(species) || 0) + 1);
    });
    const total = scopedPets.length || 1;
    return Array.from(speciesMap.entries())
      .map(([species, count]) => ({ name: species, value: count, percentage: ((count / total) * 100).toFixed(1) }))
      .sort((a, b) => b.value - a.value);
  }, [scopedPets]);

  const [selectedSpecies, setSelectedSpecies] = useState<string>("all");

  const breedDistribution = useMemo(() => {
    const breedMap = new Map<string, number>();
    scopedPets.forEach(pet => {
      if (selectedSpecies !== "all" && pet.species !== selectedSpecies) return;
      const breedId = pet.race || pet.breedId || "Sin raza";
      breedMap.set(breedId, (breedMap.get(breedId) || 0) + 1);
    });
    const total = Array.from(breedMap.values()).reduce((a, b) => a + b, 0) || 1;
    return Array.from(breedMap.entries())
      .map(([breedId, count]) => {
        const razaObj = razas.find(r => r.id === breedId || r.name === breedId);
        const name = razaObj ? razaObj.name : breedId;
        return { name, value: count, percentage: ((count / total) * 100).toFixed(1) };
      })
      .sort((a, b) => b.value - a.value);
  }, [scopedPets, razas, selectedSpecies]);

  const recordsByServiceType = useMemo(() => {
    const typeMap = new Map<string, number>();
    appointments.filter(a => a.status !== "Cancelado" && a.status !== "cancelled" && isWithinInterval(new Date(a.date), { start: dateFrom, end: dateTo }))
      .forEach(apt => {
        const type = apt.type || "clinic";
        typeMap.set(type, (typeMap.get(type) || 0) + 1);
      });
    const total = Array.from(typeMap.values()).reduce((a, b) => a + b, 0) || 1;
    return Array.from(typeMap.entries())
      .map(([typeId, count]) => {
        const dynType = tiposServicio.find(t => t.id === typeId || t.name.toLowerCase() === typeId.toLowerCase());
        const name = dynType
          ? dynType.name
          : typeId === "clinic" ? "Clínica Veterinaria"
          : typeId === "grooming" ? "Peluquería Canina"
          : typeId === "daycare" ? "Guardería"
          : "Servicio eliminado";
        return { name, value: count, percentage: ((count / total) * 100).toFixed(1) };
      })
      .sort((a, b) => b.value - a.value);
  }, [appointments, tiposServicio, dateFrom, dateTo]);

  const stats = useMemo(() => {
    const activePets = scopedPets.filter(p => !p.deceased);
    const deceasedPets = scopedPets.filter(p => p.deceased);
    const activeClients = scopedClients;
    const trend = prevPeriodRecords.length > 0
      ? (((filteredRecords.length - prevPeriodRecords.length) / prevPeriodRecords.length) * 100).toFixed(1)
      : null;
    return {
      totalClients: activeClients.length,
      totalPets: activePets.length,
      deceasedPets: deceasedPets.length,
      totalRecords: filteredRecords.length,
      prevRecords: prevPeriodRecords.length,
      trend,
      avgPetsPerClient: (activePets.length / (activeClients.length || 1)).toFixed(1),
      avgRecordsPerPet: (filteredRecords.length / (activePets.length || 1)).toFixed(1),
      mostCommonSpecies: speciesDistribution[0]?.name || "N/A",
      speciesPercent: speciesDistribution[0]?.percentage || "0",
      mostActiveDoctor: recordsByDoctor[0]?.fullName || "N/A",
      mostActiveDoctorCount: recordsByDoctor[0]?.atenciones || 0,
      topEventType: recordsByEventType[0]?.name || "N/A",
      topEventPercent: recordsByEventType[0]?.percentage || "0",
    };
  }, [scopedClients, scopedPets, filteredRecords, prevPeriodRecords, speciesDistribution, recordsByDoctor, recordsByEventType]);

  const handlePeriodChange = (period: string) => {
    setSelectedPeriod(period);
    const now = new Date();
    switch (period) {
      case "1month": setDateFrom(startOfMonth(subMonths(now, 0))); setDateTo(endOfMonth(now)); break;
      case "3months": setDateFrom(startOfMonth(subMonths(now, 2))); setDateTo(endOfMonth(now)); break;
      case "6months": setDateFrom(startOfMonth(subMonths(now, 5))); setDateTo(endOfMonth(now)); break;
      case "1year": setDateFrom(startOfMonth(subMonths(now, 11))); setDateTo(endOfMonth(now)); break;
    }
  };

  // ── Export Handlers ────────────────────────────────────────────

  const handleExportPDF = () => {
    const headers = ["Período", "Clientes", "Mascotas", "Atenciones", "Especie Principal", "Profesional Top"];
    const rows = [[
      `${format(dateFrom, "dd/MM/yyyy")} - ${format(dateTo, "dd/MM/yyyy")}`,
      stats.totalClients,
      stats.totalPets,
      stats.totalRecords,
      stats.mostCommonSpecies,
      stats.mostActiveDoctor
    ]];
    exportToPDF(
      "Reporte de Estadísticas Veterinarias",
      `Período: ${format(dateFrom, "dd/MM/yyyy")} al ${format(dateTo, "dd/MM/yyyy")}`,
      headers,
      rows,
      {
        "Total Clientes": String(stats.totalClients),
        "Total Mascotas": String(stats.totalPets),
        "Atenciones": String(stats.totalRecords),
        "Promedio mascotas/cliente": stats.avgPetsPerClient,
      }
    );
    toast.success("Reporte PDF generado — use Ctrl+P para guardar");
  };

  const handleExportExcel = () => {
    const headers = ["Mes", "Atenciones"];
    const rows = recordsByMonth.map(r => [r.month, r.atenciones]);
    exportToExcel(
      "reporte_veterinaria",
      headers,
      rows,
      `Atenciones por Mes — ${format(dateFrom, "dd/MM/yyyy")} al ${format(dateTo, "dd/MM/yyyy")}`
    );
    toast.success("Reporte Excel exportado exitosamente");
  };

  const handleExportDoctorsExcel = () => {
    exportToExcel(
      "atenciones_profesionales",
      ["Profesional", "Especialidad", "Atenciones"],
      recordsByDoctor.map(d => [d.fullName, d.specialty, d.atenciones]),
      "Atenciones por Profesional"
    );
    toast.success("Excel de profesionales exportado");
  };

  const handleExportEventsExcel = () => {
    exportToExcel(
      "tipos_eventos",
      ["Tipo de Evento", "Cantidad", "Porcentaje"],
      recordsByEventType.map(e => [e.name, e.value, `${e.percentage}%`]),
      "Distribución de Eventos Clínicos"
    );
    toast.success("Excel de eventos exportado");
  };

  const trendPositive = stats.trend !== null && Number(stats.trend) >= 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-orange-800 flex items-center gap-2">
            <BarChart3 className="h-8 w-8" />
            Reportes y Estadísticas
            {loading && <span className="text-sm text-orange-400 font-normal animate-pulse ml-2">Cargando datos...</span>}
          </h1>
          <p className="text-gray-600 mt-1">Análisis completo con visualizaciones dinámicas — datos en tiempo real desde Firestore</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleExportExcel} variant="outline" className="border-green-300 text-green-700 hover:bg-green-50">
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Excel
          </Button>
          <Button onClick={handleExportPDF} className="bg-orange-600 hover:bg-orange-700">
            <FileText className="mr-2 h-4 w-4" />
            PDF
          </Button>
        </div>
      </div>

      {/* Period Filter */}
      <Card className="border-orange-200 shadow-sm">
        <CardContent className="pt-4 pb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-500 uppercase tracking-wide">Datos a incluir</Label>
              <Select value={dataScope} onValueChange={(v) => setDataScope(v as any)}>
                <SelectTrigger className="border-orange-200 focus:border-orange-400">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="activos">Solo activos</SelectItem>
                  <SelectItem value="inactivos">Solo inactivos (baja)</SelectItem>
                  <SelectItem value="todos">Todos</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-500 uppercase tracking-wide">Período Rápido</Label>
              <Select value={selectedPeriod} onValueChange={handlePeriodChange}>
                <SelectTrigger className="border-orange-200 focus:border-orange-400">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1month">Último mes</SelectItem>
                  <SelectItem value="3months">Últimos 3 meses</SelectItem>
                  <SelectItem value="6months">Últimos 6 meses</SelectItem>
                  <SelectItem value="1year">Último año</SelectItem>
                  <SelectItem value="custom">Personalizado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-500 uppercase tracking-wide">Desde</Label>
              <Popover open={calendarFromOpen} onOpenChange={setCalendarFromOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left border-orange-200 hover:border-orange-400">
                    <CalendarIcon className="mr-2 h-4 w-4 text-orange-500" />
                    {format(dateFrom, "dd/MM/yyyy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dateFrom}
                    onSelect={(date) => { if (date) { setDateFrom(date); setCalendarFromOpen(false); setSelectedPeriod("custom"); } }}
                    initialFocus />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-500 uppercase tracking-wide">Hasta</Label>
              <Popover open={calendarToOpen} onOpenChange={setCalendarToOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left border-orange-200 hover:border-orange-400">
                    <CalendarIcon className="mr-2 h-4 w-4 text-orange-500" />
                    {format(dateTo, "dd/MM/yyyy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dateTo}
                    onSelect={(date) => { if (date) { setDateTo(date); setCalendarToOpen(false); setSelectedPeriod("custom"); } }}
                    initialFocus />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-500 uppercase tracking-wide">Registros encontrados</Label>
              <div className="h-9 flex items-center px-3 bg-orange-50 border border-orange-200 rounded-md">
                <span className="text-orange-900 font-semibold">{filteredRecords.length} atenciones</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-orange-200 bg-gradient-to-br from-orange-50 to-white">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="p-2 bg-orange-100 rounded-lg">
                <Users className="h-4 w-4 text-orange-600" />
              </div>
              <span className="text-xs text-gray-400">Clientes</span>
            </div>
            <p className="text-3xl font-bold text-orange-700">{stats.totalClients}</p>
            <p className="text-xs text-gray-500 mt-1">{stats.avgPetsPerClient} mascotas/cliente</p>
          </CardContent>
        </Card>

        <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-white">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="p-2 bg-blue-100 rounded-lg">
                <PawPrint className="h-4 w-4 text-blue-600" />
              </div>
              <span className="text-xs text-gray-400">Mascotas</span>
            </div>
            <p className="text-3xl font-bold text-blue-700">{stats.totalPets}</p>
            <p className="text-xs text-gray-500 mt-1">{stats.deceasedPets} Bajas registradas</p>
          </CardContent>
        </Card>

        <Card className="border-green-200 bg-gradient-to-br from-green-50 to-white">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="p-2 bg-green-100 rounded-lg">
                <Activity className="h-4 w-4 text-green-600" />
              </div>
              <div className="flex items-center gap-1">
                {stats.trend !== null && (
                  <span className={`text-xs flex items-center gap-0.5 ${trendPositive ? "text-green-600" : "text-red-500"}`}>
                    {trendPositive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                    {Math.abs(Number(stats.trend))}%
                  </span>
                )}
              </div>
            </div>
            <p className="text-3xl font-bold text-green-700">{stats.totalRecords}</p>
            <p className="text-xs text-gray-500 mt-1">Atenciones en el período</p>
          </CardContent>
        </Card>

        <Card className="border-purple-200 bg-gradient-to-br from-purple-50 to-white">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Stethoscope className="h-4 w-4 text-purple-600" />
              </div>
              <span className="text-xs text-gray-400">Top evento</span>
            </div>
            <p className="text-lg font-bold text-purple-700 leading-tight truncate">{stats.topEventType}</p>
            <p className="text-xs text-gray-500 mt-1">{stats.topEventPercent}% de las atenciones</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Tabs */}
      <Tabs defaultValue="timeline">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-6 bg-orange-50 h-auto">
          <TabsTrigger value="timeline" className="text-xs sm:text-sm py-2">
            <TrendingUp className="h-3.5 w-3.5 mr-1.5 hidden sm:inline" />Evolución
          </TabsTrigger>
          <TabsTrigger value="species" className="text-xs sm:text-sm py-2">
            <PieChartIcon className="h-3.5 w-3.5 mr-1.5 hidden sm:inline" />Especies
          </TabsTrigger>
          <TabsTrigger value="doctors" className="text-xs sm:text-sm py-2">
            <Stethoscope className="h-3.5 w-3.5 mr-1.5 hidden sm:inline" />Profesionales
          </TabsTrigger>
          <TabsTrigger value="events" className="text-xs sm:text-sm py-2">
            <BarChart3 className="h-3.5 w-3.5 mr-1.5 hidden sm:inline" />Eventos
          </TabsTrigger>
          <TabsTrigger value="services" className="text-xs sm:text-sm py-2">
            <CalendarIcon className="h-3.5 w-3.5 mr-1.5 hidden sm:inline" />Servicios
          </TabsTrigger>
          <TabsTrigger value="clients" className="text-xs sm:text-sm py-2">
            <Users className="h-3.5 w-3.5 mr-1.5 hidden sm:inline" />Clientes
          </TabsTrigger>
          <TabsTrigger value="custom" className="text-xs sm:text-sm py-2">
            <Activity className="h-3.5 w-3.5 mr-1.5 hidden sm:inline" />Personalizado
          </TabsTrigger>
        </TabsList>

        {/* ══ EVOLUCIÓN ══════════════════════════════════════════ */}
        <TabsContent value="timeline">
          <Card className="border-teal-200">
            <CardHeader className="bg-gradient-to-r from-teal-50 to-white pb-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <CardTitle className="text-teal-800 flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    Evolución de Atenciones por Mes
                  </CardTitle>
                  <CardDescription>Tendencia en el período seleccionado</CardDescription>
                </div>
                <Button onClick={handleExportExcel} size="sm" variant="outline" className="border-teal-300 text-teal-700 hover:bg-teal-50">
                  <FileSpreadsheet className="mr-2 h-3.5 w-3.5" />Excel
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              {recordsByMonth.length === 0 ? (
                <div className="text-center py-16 text-gray-400">
                  <BarChart3 className="h-12 w-12 mx-auto mb-3 text-gray-200" />
                  <p>Sin datos para el período seleccionado</p>
                </div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={320}>
                    <AreaChart data={recordsByMonth} margin={{ top: 5, right: 20, left: 0, bottom: 20 }}>
                      <defs>
                        <linearGradient id="tealGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#14b8a6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0fdf4" />
                      <XAxis dataKey="month" angle={-30} textAnchor="end" height={60} tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Area type="monotone" dataKey="atenciones" stroke="#14b8a6" strokeWidth={2.5} fill="url(#tealGrad)" name="Atenciones" dot={{ fill: "#14b8a6", r: 4 }} activeDot={{ r: 6 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                  <div className="mt-4 grid grid-cols-3 gap-3">
                    <div className="p-3 bg-teal-50 rounded-lg border border-teal-100 text-center">
                      <p className="text-xs text-teal-600 font-medium">Total período</p>
                      <p className="text-2xl font-bold text-teal-900">{stats.totalRecords}</p>
                    </div>
                    <div className="p-3 bg-blue-50 rounded-lg border border-blue-100 text-center">
                      <p className="text-xs text-blue-600 font-medium">Promedio mensual</p>
                      <p className="text-2xl font-bold text-blue-900">
                        {recordsByMonth.length > 0 ? (stats.totalRecords / recordsByMonth.length).toFixed(1) : 0}
                      </p>
                    </div>
                    <div className="p-3 bg-orange-50 rounded-lg border border-orange-100 text-center">
                      <p className="text-xs text-orange-600 font-medium">Mes más activo</p>
                      <p className="text-sm font-bold text-orange-900">
                        {recordsByMonth.length > 0 ? recordsByMonth.reduce((a, b) => a.atenciones > b.atenciones ? a : b).month : "—"}
                      </p>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ══ ESPECIES ══════════════════════════════════════════ */}
        <TabsContent value="species">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-orange-200">
              <CardHeader className="bg-gradient-to-r from-orange-50 to-white pb-3">
                <CardTitle className="text-orange-800 flex items-center gap-2">
                  <PieChartIcon className="h-5 w-5" />
                  Distribución por Especie
                </CardTitle>
                <CardDescription>Porcentaje de mascotas por especie</CardDescription>
              </CardHeader>
              <CardContent className="pt-4">
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={speciesDistribution} cx="50%" cy="50%" outerRadius={100}
                      label={({ name, percentage }) => `${name}: ${percentage}%`}
                      labelLine={false} dataKey="value">
                      {speciesDistribution.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v, n) => [v, n]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-3 space-y-1.5">
                  {speciesDistribution.map((item, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                      <span className="text-sm flex-1">{item.name}</span>
                      <span className="text-sm font-medium text-gray-700">{item.value} mascotas</span>
                      <Badge variant="outline" className="text-xs">{item.percentage}%</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="border-blue-200">
              <CardHeader className="bg-gradient-to-r from-blue-50 to-white pb-3">
                <CardTitle className="text-blue-800 flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Clientes por Especie
                </CardTitle>
                <CardDescription>Cantidad de clientes que tienen cada especie</CardDescription>
              </CardHeader>
              <CardContent className="pt-4">
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={clientsBySpecies} margin={{ bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eff6ff" />
                    <XAxis dataKey="name" angle={-35} textAnchor="end" height={70} tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="clientes" fill="#3b82f6" name="Clientes" radius={[4, 4, 0, 0]}>
                      {clientsBySpecies.map((_, idx) => (
                        <Cell key={idx} fill={COLORS[idx + 4] || COLORS[idx % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* ══ RAZAS (RAMIFICADO) ══════════════════════════════════════════ */}
          <Card className="border-purple-200">
            <CardHeader className="bg-gradient-to-r from-purple-50 to-white pb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <CardTitle className="text-purple-800 flex items-center gap-2">
                  <PawPrint className="h-5 w-5" />
                  Distribución por Razas
                </CardTitle>
                <CardDescription>Desglose de razas por especie</CardDescription>
              </div>
              <div className="w-full sm:w-64">
                <Select value={selectedSpecies} onValueChange={setSelectedSpecies}>
                  <SelectTrigger className="border-purple-200 bg-white">
                    <SelectValue placeholder="Todas las especies" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las especies</SelectItem>
                    {speciesDistribution.map(s => (
                      <SelectItem key={s.name} value={s.name}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="pt-4 grid grid-cols-1 md:grid-cols-2 gap-6">
               <ResponsiveContainer width="100%" height={280}>
                 <BarChart data={breedDistribution} margin={{ bottom: 40 }} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#faf5ff" />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis dataKey="name" type="category" width={110} tick={{ fontSize: 11 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="value" name="Mascotas" radius={[0, 4, 4, 0]}>
                      {breedDistribution.map((_, idx) => (
                        <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
               </ResponsiveContainer>
               <div className="space-y-1.5 max-h-[280px] overflow-y-auto pr-2">
                 {breedDistribution.map((item, index) => (
                    <div key={index} className="flex items-center gap-2 p-2 hover:bg-purple-50 rounded-lg transition-colors">
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                      <span className="text-sm font-medium flex-1">{item.name}</span>
                      <span className="text-sm text-gray-600">{item.value} mascotas</span>
                      <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">{item.percentage}%</Badge>
                    </div>
                  ))}
               </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ══ PROFESIONALES ══════════════════════════════════════ */}
        <TabsContent value="doctors">
          <Card className="border-green-200">
            <CardHeader className="bg-gradient-to-r from-green-50 to-white pb-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <CardTitle className="text-green-800 flex items-center gap-2">
                    <Stethoscope className="h-5 w-5" />
                    Atenciones por Profesional
                  </CardTitle>
                  <CardDescription>Período: {format(dateFrom, "dd/MM/yyyy")} al {format(dateTo, "dd/MM/yyyy")}</CardDescription>
                </div>
                <Button onClick={handleExportDoctorsExcel} size="sm" variant="outline" className="border-green-300 text-green-700 hover:bg-green-50">
                  <FileSpreadsheet className="mr-2 h-3.5 w-3.5" />Excel
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              {recordsByDoctor.length === 0 ? (
                <div className="text-center py-16 text-gray-400">
                  <Stethoscope className="h-12 w-12 mx-auto mb-3 text-gray-200" />
                  <p>Sin datos para el período seleccionado</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={recordsByDoctor} margin={{ bottom: 60 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0fdf4" />
                      <XAxis dataKey="name" angle={-40} textAnchor="end" height={80} tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="atenciones" name="Atenciones" radius={[4, 4, 0, 0]}>
                        {recordsByDoctor.map((_, idx) => (
                          <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="space-y-2">
                    {recordsByDoctor.map((doctor, index) => {
                      const max = recordsByDoctor[0]?.atenciones || 1;
                      const pct = Math.round((doctor.atenciones / max) * 100);
                      return (
                        <div key={index} className="p-3 bg-white border border-gray-100 rounded-lg hover:border-green-200 transition-colors">
                          <div className="flex items-center justify-between mb-1.5">
                            <div>
                              <div className="flex items-center gap-2">
                                {index === 0 && <Award className="h-4 w-4 text-amber-500" />}
                                <span className="text-sm font-medium">{doctor.fullName}</span>
                              </div>
                              <span className="text-xs text-gray-400">{doctor.specialty}</span>
                            </div>
                            <Badge className="bg-green-100 text-green-800">{doctor.atenciones}</Badge>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-1.5">
                            <div className="h-1.5 rounded-full bg-gradient-to-r from-green-400 to-emerald-500 transition-all duration-500" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ══ EVENTOS ══════════════════════════════════════════ */}
        <TabsContent value="events">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-indigo-200">
              <CardHeader className="bg-gradient-to-r from-indigo-50 to-white pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-indigo-800 flex items-center gap-2">
                      <PieChartIcon className="h-5 w-5" />
                      Distribución de Eventos Clínicos
                    </CardTitle>
                    <CardDescription>Porcentaje por tipo de evento</CardDescription>
                  </div>
                  <Button onClick={handleExportEventsExcel} size="sm" variant="outline" className="border-indigo-300 text-indigo-700 hover:bg-indigo-50">
                    <FileSpreadsheet className="mr-2 h-3.5 w-3.5" />Excel
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                {recordsByEventType.length === 0 ? (
                  <div className="text-center py-12 text-gray-400">Sin datos</div>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie data={recordsByEventType} cx="50%" cy="50%" outerRadius={110}
                        label={({ percentage }) => `${percentage}%`}
                        labelLine dataKey="value">
                        {recordsByEventType.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: any) => [`${v} atenciones`]} />
                      <Legend formatter={(value) => value} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card className="border-cyan-200">
              <CardHeader className="bg-gradient-to-r from-cyan-50 to-white pb-3">
                <CardTitle className="text-cyan-800 flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Análisis Detallado de Eventos
                </CardTitle>
                <CardDescription>Desglose por tipo con progreso visual</CardDescription>
              </CardHeader>
              <CardContent className="pt-4">
                {recordsByEventType.length === 0 ? (
                  <div className="text-center py-12 text-gray-400">Sin datos</div>
                ) : (
                  <>
                    <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                      {recordsByEventType.map((event, index) => (
                        <div key={index} className="space-y-1">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                              <span className="text-sm font-medium">{event.name}</span>
                            </div>
                            <Badge variant="outline" className="text-xs">{event.value} ({event.percentage}%)</Badge>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-2">
                            <div className="h-2 rounded-full transition-all duration-500"
                              style={{ width: `${event.percentage}%`, backgroundColor: COLORS[index % COLORS.length] }} />
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 p-3 bg-gradient-to-r from-cyan-50 to-blue-50 rounded-lg border border-cyan-200">
                      <p className="text-sm text-cyan-800">
                        <strong>Análisis:</strong> El evento más frecuente es <strong>{recordsByEventType[0]?.name}</strong>,
                        representando el <strong>{recordsByEventType[0]?.percentage}%</strong> de las atenciones en el período.
                        {recordsByEventType.length > 1 && ` Le sigue "${recordsByEventType[1].name}" con ${recordsByEventType[1].percentage}%.`}
                      </p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ══ SERVICIOS ══════════════════════════════════════════ */}
        <TabsContent value="services">
          <Card className="border-orange-200">
            <CardHeader className="bg-gradient-to-r from-orange-50 to-white pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-orange-800 flex items-center gap-2">
                    <CalendarIcon className="h-5 w-5" />
                    Distribución de Tipos de Servicio (Turnos)
                  </CardTitle>
                  <CardDescription>Servicios agendados en el período seleccionado</CardDescription>
                </div>
                <Button onClick={() => {
                  exportToExcel("tipos_servicio", ["Servicio", "Cantidad", "Porcentaje"], recordsByServiceType.map(e => [e.name, e.value, `${e.percentage}%`]), "Distribución de Servicios");
                  toast.success("Excel de servicios exportado");
                }} size="sm" variant="outline" className="border-orange-300 text-orange-700 hover:bg-orange-50">
                  <FileSpreadsheet className="mr-2 h-3.5 w-3.5" />Excel
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              {recordsByServiceType.length === 0 ? (
                <div className="text-center py-12 text-gray-400">Sin datos de turnos para el período</div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie data={recordsByServiceType} cx="50%" cy="50%" outerRadius={110}
                        label={({ percentage }) => `${percentage}%`}
                        labelLine dataKey="value">
                        {recordsByServiceType.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: any) => [`${v} turnos`]} />
                      <Legend formatter={(value) => value} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-3 max-h-64 overflow-y-auto pr-1 mt-4">
                    {recordsByServiceType.map((event, index) => (
                      <div key={index} className="space-y-1">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                            <span className="text-sm font-medium">{event.name}</span>
                          </div>
                          <Badge variant="outline" className="text-xs">{event.value} ({event.percentage}%)</Badge>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-2">
                          <div className="h-2 rounded-full transition-all duration-500"
                            style={{ width: `${event.percentage}%`, backgroundColor: COLORS[index % COLORS.length] }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ══ CLIENTES ══════════════════════════════════════════ */}
        <TabsContent value="clients">
          <Card className="border-purple-200">
            <CardHeader className="bg-gradient-to-r from-purple-50 to-white pb-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <CardTitle className="text-purple-800 flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Top 10 Clientes con Más Mascotas
                  </CardTitle>
                  <CardDescription>Ranking de clientes por cantidad de mascotas activas</CardDescription>
                </div>
                <Button
                  onClick={() => {
                    exportToExcel("top_clientes_mascotas", ["Cliente", "Mascotas"],
                      petsByClient.map(c => [c.name, c.mascotas]), "Top Clientes por Mascotas");
                    toast.success("Excel exportado");
                  }}
                  size="sm" variant="outline" className="border-purple-300 text-purple-700 hover:bg-purple-50">
                  <FileSpreadsheet className="mr-2 h-3.5 w-3.5" />Excel
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart data={petsByClient} layout="vertical" margin={{ left: 10, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#faf5ff" />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 11 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="mascotas" name="Mascotas" radius={[0, 4, 4, 0]}>
                      {petsByClient.map((_, idx) => (
                        <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div className="space-y-2">
                  {petsByClient.map((client, index) => (
                    <div key={index} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-purple-50 transition-colors">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                        style={{ backgroundColor: COLORS[index % COLORS.length] + "33", color: COLORS[index % COLORS.length] }}>
                        {index + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{client.name}</p>
                        <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1">
                          <div className="h-1.5 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length], width: `${(client.mascotas / (petsByClient[0]?.mascotas || 1)) * 100}%` }} />
                        </div>
                      </div>
                      <Badge className="bg-purple-100 text-purple-800 text-xs">{client.mascotas} 🐾</Badge>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ══ PERSONALIZADO ══════════════════════════════════════════ */}
        <TabsContent value="custom">
          <CustomReportBuilder
            clients={scopedClients}
            pets={scopedPets}
            medicalRecords={medicalRecords}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
