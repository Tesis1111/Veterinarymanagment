import { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import { EspecieParametro, RazaParametro, TipoEvento, VacunaParametro, ProfesionParametro, TipoServicioParametro } from "../../types";
import {
  suscribirEspecies, registrarEspecie, modificarEspecie, eliminarEspecie,
  suscribirRazas, registrarRaza, modificarRaza, eliminarRaza,
  suscribirTiposEvento, registrarTipoEvento, modificarTipoEvento, eliminarTipoEvento,
  suscribirVacunas, registrarVacuna, modificarVacuna, eliminarVacuna,
  suscribirProfesiones, registrarProfesion, modificarProfesion, eliminarProfesion,
  suscribirTiposServicio, registrarTipoServicio, modificarTipoServicio, eliminarTipoServicio,
} from "../../services/parametrosService";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { EmojiPicker } from "../ui/emoji-picker";
import {
  Settings2, Plus, Edit, Trash2, Save, X, ChevronDown, ChevronRight,
  PawPrint, Stethoscope, Syringe, Shield, UserCog, Calendar,
} from "lucide-react";
import { toast } from "sonner";
import { useSuccessPopup } from "../../context/SuccessPopupContext";

// ── Color options for event types ─────────────────────────────────────────────
const COLOR_OPTIONS = [
  { value: "bg-blue-100 text-blue-800",    label: "Azul" },
  { value: "bg-green-100 text-green-800",  label: "Verde" },
  { value: "bg-red-100 text-red-800",      label: "Rojo" },
  { value: "bg-purple-100 text-purple-800",label: "Violeta" },
  { value: "bg-yellow-100 text-yellow-800",label: "Amarillo" },
  { value: "bg-orange-100 text-orange-800",label: "Naranja" },
  { value: "bg-teal-100 text-teal-800",    label: "Teal" },
  { value: "bg-pink-100 text-pink-800",    label: "Rosa" },
  { value: "bg-indigo-100 text-indigo-800",label: "Índigo" },
  { value: "bg-cyan-100 text-cyan-800",    label: "Cian" },
  { value: "bg-gray-100 text-gray-700",    label: "Gris" },
  { value: "bg-red-200 text-red-900",      label: "Rojo oscuro" },
];

export default function ParametrosModule() {
  const { user, isAdmin } = useAuth();
  const { showSuccess } = useSuccessPopup();

  // ── Especies state ──────────────────────────────────────────────────────────
  const [especies, setEspecies] = useState<EspecieParametro[]>([]);
  const [razas, setRazas] = useState<RazaParametro[]>([]);
  const [expandedEspecie, setExpandedEspecie] = useState<string | null>(null);
  const [especieForm, setEspecieForm] = useState({ name: "", icon: "", description: "" });
  const [editingEspecie, setEditingEspecie] = useState<EspecieParametro | null>(null);
  const [especieDialogOpen, setEspecieDialogOpen] = useState(false);
  const [deleteEspecieId, setDeleteEspecieId] = useState<string | null>(null);

  // ── Raza form within especie ────────────────────────────────────────────────
  const [razaForm, setRazaForm] = useState({ name: "", description: "", especieId: "" });
  const [editingRaza, setEditingRaza] = useState<RazaParametro | null>(null);
  const [razaDialogOpen, setRazaDialogOpen] = useState(false);
  const [deleteRazaId, setDeleteRazaId] = useState<string | null>(null);

  // ── Tipos de Evento state ───────────────────────────────────────────────────
  const [tiposEvento, setTiposEvento] = useState<TipoEvento[]>([]);
  const [tipoForm, setTipoForm] = useState({ name: "", color: "bg-blue-100 text-blue-800", requiresVaccineTracking: false });
  const [editingTipo, setEditingTipo] = useState<TipoEvento | null>(null);
  const [tipoDialogOpen, setTipoDialogOpen] = useState(false);
  const [deleteTipoId, setDeleteTipoId] = useState<string | null>(null);

  const [profesiones, setProfesiones] = useState<ProfesionParametro[]>([]);
  const [profesionForm, setProfesionForm] = useState({ name: "", description: "" });
  const [editingProfesion, setEditingProfesion] = useState<ProfesionParametro | null>(null);
  const [profesionDialogOpen, setProfesionDialogOpen] = useState(false);
  const [deleteProfesionId, setDeleteProfesionId] = useState<string | null>(null);

  // ── Tipos de Servicio state ─────────────────────────────────────────────────
  const [tiposServicio, setTiposServicio] = useState<TipoServicioParametro[]>([]);
  const [servicioForm, setServicioForm] = useState({ name: "", color: "bg-blue-100 text-blue-800", description: "", profesion: "" });
  const [editingServicio, setEditingServicio] = useState<TipoServicioParametro | null>(null);
  const [servicioDialogOpen, setServicioDialogOpen] = useState(false);
  const [deleteServicioId, setDeleteServicioId] = useState<string | null>(null);

  // ── Árbol de Vacunación state ───────────────────────────────────────────────
  const [vacunas, setVacunas] = useState<VacunaParametro[]>([]);
  const [vacunaForm, setVacunaForm] = useState({ especieId: "", nombreVacuna: "", dosis: 1, periodicidadDias: 365, descripcion: "" });
  const [editingVacuna, setEditingVacuna] = useState<VacunaParametro | null>(null);
  const [vacunaDialogOpen, setVacunaDialogOpen] = useState(false);
  const [deleteVacunaId, setDeleteVacunaId] = useState<string | null>(null);
  const [vacunaEspecieFilter, setVacunaEspecieFilter] = useState<string>("all");

  // ── Real-time subscriptions via onSnapshot ──────────────────────────────────
  // Esta es la clave para que los datos persistan: onSnapshot mantiene sincronía
  // con Firestore y los cambios se reflejan inmediatamente sin necesidad de recargar.
  useEffect(() => {
    const unsubEspecies = suscribirEspecies(setEspecies, () => toast.error("Error cargando especies desde Firebase"));
    const unsubRazas    = suscribirRazas(setRazas);
    const unsubTipos    = suscribirTiposEvento(setTiposEvento);
    const unsubVacunas  = suscribirVacunas(setVacunas);
    const unsubProfesiones = suscribirProfesiones(setProfesiones);
    const unsubTiposServicio = suscribirTiposServicio(setTiposServicio);
    return () => {
      unsubEspecies();
      unsubRazas();
      unsubTipos();
      unsubVacunas();
      unsubProfesiones();
      unsubTiposServicio();
    };
  }, []);

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <Card className="border-orange-200 shadow-md">
          <CardContent className="pt-12 pb-12">
            <div className="text-center text-gray-500">
              <Shield className="h-16 w-16 mx-auto mb-4 text-gray-300" />
              <h2 className="text-gray-700 mb-2">Acceso Restringido</h2>
              <p>Solo los administradores pueden gestionar los parámetros del sistema.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ESPECIES — handlers
  // ─────────────────────────────────────────────────────────────────────────────

  const openNewEspecie = () => {
    setEditingEspecie(null);
    setEspecieForm({ name: "", icon: "", description: "" });
    setEspecieDialogOpen(true);
  };

  const openEditEspecie = (e: EspecieParametro) => {
    setEditingEspecie(e);
    setEspecieForm({ name: e.name, icon: e.icon ?? "", description: e.description ?? "" });
    setEspecieDialogOpen(true);
  };

  const handleSaveEspecie = async () => {
    if (!especieForm.name.trim()) { toast.error("El nombre es obligatorio"); return; }
    try {
      // El icono es opcional: si se deja vacío se guarda "" y la especie se
      // muestra sin emoji (antes se forzaba 🐾 y no había forma de quitarlo).
      const icon = especieForm.icon.trim();
      if (editingEspecie) {
        await modificarEspecie(editingEspecie.id, { name: especieForm.name.trim(), icon, description: especieForm.description || "" });
        showSuccess("Especie actualizada");
      } else {
        await registrarEspecie({ name: especieForm.name.trim(), icon, description: especieForm.description || "", active: true }, user!.id);
        showSuccess("Especie creada");
      }
      // onSnapshot actualiza la lista automáticamente — no necesitamos setEspecies manual
      setEspecieDialogOpen(false);
    } catch { toast.error("Error al guardar la especie"); }
  };

  const handleDeleteEspecie = async () => {
    if (!deleteEspecieId) return;
    const razasDeEspecie = razas.filter(r => r.especieId === deleteEspecieId);
    if (razasDeEspecie.length > 0) {
      toast.error(`Esta especie tiene ${razasDeEspecie.length} razas activas. Elimínelas primero.`);
      setDeleteEspecieId(null);
      return;
    }
    try {
      await eliminarEspecie(deleteEspecieId);
      showSuccess("Especie eliminada"); // onSnapshot actualiza la lista
    } catch { toast.error("Error al eliminar la especie"); }
    setDeleteEspecieId(null);
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // RAZAS — handlers
  // ─────────────────────────────────────────────────────────────────────────────

  const openNewRaza = (especieId: string) => {
    setEditingRaza(null);
    setRazaForm({ name: "", description: "", especieId });
    setRazaDialogOpen(true);
  };

  const openEditRaza = (r: RazaParametro) => {
    setEditingRaza(r);
    setRazaForm({ name: r.name, description: r.description ?? "", especieId: r.especieId });
    setRazaDialogOpen(true);
  };

  const handleSaveRaza = async () => {
    if (!razaForm.name.trim()) { toast.error("El nombre es obligatorio"); return; }
    try {
      if (editingRaza) {
        await modificarRaza(editingRaza.id, { name: razaForm.name.trim(), description: razaForm.description || "" });
        showSuccess("Raza actualizada");
      } else {
        await registrarRaza({ name: razaForm.name.trim(), especieId: razaForm.especieId, description: razaForm.description || "", active: true }, user!.id);
        showSuccess("Raza creada");
      }
      // onSnapshot actualiza la lista automáticamente
      setRazaDialogOpen(false);
    } catch { toast.error("Error al guardar la raza"); }
  };

  const handleDeleteRaza = async () => {
    if (!deleteRazaId) return;
    try {
      await eliminarRaza(deleteRazaId);
      showSuccess("Raza eliminada");
    } catch { toast.error("Error al eliminar la raza"); }
    setDeleteRazaId(null);
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // TIPOS DE EVENTO — handlers
  // ─────────────────────────────────────────────────────────────────────────────

  const openNewTipo = () => {
    setEditingTipo(null);
    setTipoForm({ name: "", color: "bg-blue-100 text-blue-800", requiresVaccineTracking: false });
    setTipoDialogOpen(true);
  };

  const openEditTipo = (t: TipoEvento) => {
    setEditingTipo(t);
    setTipoForm({ name: t.name, color: t.color, requiresVaccineTracking: t.requiresVaccineTracking ?? false });
    setTipoDialogOpen(true);
  };

  const handleSaveTipo = async () => {
    if (!tipoForm.name.trim()) { toast.error("El nombre es obligatorio"); return; }
    try {
      if (editingTipo) {
        await modificarTipoEvento(editingTipo.id, { name: tipoForm.name.trim(), color: tipoForm.color, requiresVaccineTracking: tipoForm.requiresVaccineTracking });
        showSuccess("Tipo de evento actualizado");
      } else {
        await registrarTipoEvento({ name: tipoForm.name.trim(), color: tipoForm.color, requiresVaccineTracking: tipoForm.requiresVaccineTracking, active: true }, user!.id);
        showSuccess("Tipo de evento creado");
      }
      // onSnapshot actualiza la lista automáticamente
      setTipoDialogOpen(false);
    } catch { toast.error("Error al guardar el tipo de evento"); }
  };

  const handleDeleteTipo = async () => {
    if (!deleteTipoId) return;
    try {
      await eliminarTipoEvento(deleteTipoId);
      showSuccess("Tipo de evento eliminado");
    } catch { toast.error("Error al eliminar el tipo de evento"); }
    setDeleteTipoId(null);
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // VACUNAS — handlers
  // ─────────────────────────────────────────────────────────────────────────────

  const openNewVacuna = () => {
    setEditingVacuna(null);
    setVacunaForm({ especieId: vacunaEspecieFilter === "all" ? "" : vacunaEspecieFilter, nombreVacuna: "", dosis: 1, periodicidadDias: 365, descripcion: "" });
    setVacunaDialogOpen(true);
  };

  const openEditVacuna = (v: VacunaParametro) => {
    setEditingVacuna(v);
    setVacunaForm({ especieId: v.especieId, nombreVacuna: v.nombreVacuna, dosis: v.dosis, periodicidadDias: v.periodicidadDias, descripcion: v.descripcion ?? "" });
    setVacunaDialogOpen(true);
  };

  const handleSaveVacuna = async () => {
    if (!vacunaForm.nombreVacuna.trim()) { toast.error("El nombre de la vacuna es obligatorio"); return; }
    if (!vacunaForm.especieId) { toast.error("Debe seleccionar una especie"); return; }
    const especie = especies.find(e => e.id === vacunaForm.especieId);
    try {
      if (editingVacuna) {
        await modificarVacuna(editingVacuna.id, { ...vacunaForm, nombreVacuna: vacunaForm.nombreVacuna.trim(), especieName: especie?.name });
        showSuccess("Vacuna actualizada");
      } else {
        await registrarVacuna({ ...vacunaForm, nombreVacuna: vacunaForm.nombreVacuna.trim(), especieName: especie?.name, active: true }, user!.id);
        showSuccess("Vacuna creada");
      }
      // onSnapshot actualiza la lista automáticamente
      setVacunaDialogOpen(false);
    } catch { toast.error("Error al guardar la vacuna"); }
  };

  const handleDeleteVacuna = async () => {
    if (!deleteVacunaId) return;
    try {
      await eliminarVacuna(deleteVacunaId);
      showSuccess("Vacuna eliminada");
    } catch { toast.error("Error al eliminar la vacuna"); }
    setDeleteVacunaId(null);
  };

  const filteredVacunas = vacunaEspecieFilter === "all" ? vacunas : vacunas.filter(v => v.especieId === vacunaEspecieFilter);

  // ── PROFESIONES — handlers ──────────────────────────────────────────────────
  const openNewProfesion = () => {
    setEditingProfesion(null);
    setProfesionForm({ name: "", description: "" });
    setProfesionDialogOpen(true);
  };
  const openEditProfesion = (p: ProfesionParametro) => {
    setEditingProfesion(p);
    setProfesionForm({ name: p.name, description: p.description ?? "" });
    setProfesionDialogOpen(true);
  };
  const handleSaveProfesion = async () => {
    if (!profesionForm.name.trim()) { toast.error("El nombre de la profesión es obligatorio"); return; }
    try {
      if (editingProfesion) {
        await modificarProfesion(editingProfesion.id, { name: profesionForm.name.trim(), description: profesionForm.description ?? "" });
        showSuccess("Profesión actualizada");
      } else {
        await registrarProfesion({ name: profesionForm.name.trim(), description: profesionForm.description ?? "", active: true }, user!.id);
        showSuccess("Profesión creada");
      }
      setProfesionDialogOpen(false);
    } catch { toast.error("Error al guardar la profesión"); }
  };
  const handleDeleteProfesion = async () => {
    if (!deleteProfesionId) return;
    try {
      await eliminarProfesion(deleteProfesionId);
      showSuccess("Profesión eliminada");
    } catch { toast.error("Error al eliminar la profesión"); }
    setDeleteProfesionId(null);
  };

  // ── TIPOS DE SERVICIO — handlers ────────────────────────────────────────────
  const openNewServicio = () => {
    setEditingServicio(null);
    setServicioForm({ name: "", color: "bg-blue-100 text-blue-800", description: "", profesion: "" });
    setServicioDialogOpen(true);
  };
  const openEditServicio = (s: TipoServicioParametro) => {
    setEditingServicio(s);
    setServicioForm({ name: s.name, color: s.color || "bg-blue-100 text-blue-800", description: s.description ?? "", profesion: s.profesion ?? "" });
    setServicioDialogOpen(true);
  };
  const handleSaveServicio = async () => {
    if (!servicioForm.name.trim()) { toast.error("El nombre es obligatorio"); return; }
    try {
      if (editingServicio) {
        await modificarTipoServicio(editingServicio.id, { name: servicioForm.name.trim(), color: servicioForm.color, description: servicioForm.description ?? "", profesion: servicioForm.profesion ?? "" });
        showSuccess("Tipo de servicio actualizado");
      } else {
        await registrarTipoServicio({ name: servicioForm.name.trim(), color: servicioForm.color, description: servicioForm.description ?? "", profesion: servicioForm.profesion ?? "", active: true }, user!.id);
        showSuccess("Tipo de servicio creado");
      }
      setServicioDialogOpen(false);
    } catch { toast.error("Error al guardar el tipo de servicio"); }
  };
  const handleDeleteServicio = async () => {
    if (!deleteServicioId) return;
    try {
      await eliminarTipoServicio(deleteServicioId);
      showSuccess("Tipo de servicio eliminado");
    } catch { toast.error("Error al eliminar el tipo de servicio"); }
    setDeleteServicioId(null);
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-orange-800 flex items-center gap-2">
          <Settings2 className="h-8 w-8" />
          Parámetros del Sistema
        </h1>
        <p className="text-gray-600 mt-1">Gestión de datos maestros administrables</p>
      </div>

      <Tabs defaultValue="especies">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-5 bg-orange-50 h-auto gap-1 p-1">
          <TabsTrigger value="especies" className="flex items-center gap-1.5 h-9">
            <PawPrint className="h-4 w-4 hidden sm:block" /> Especies y Razas
          </TabsTrigger>
          <TabsTrigger value="eventos" className="flex items-center gap-1.5 h-9">
            <Stethoscope className="h-4 w-4 hidden sm:block" /> Tipos de Evento
          </TabsTrigger>
          <TabsTrigger value="vacunas" className="flex items-center gap-1.5 h-9">
            <Syringe className="h-4 w-4 hidden sm:block" /> Árbol Vacunas
          </TabsTrigger>
          <TabsTrigger value="profesiones" className="flex items-center gap-1.5 h-9">
            <UserCog className="h-4 w-4 hidden sm:block" /> Profesiones
          </TabsTrigger>
          <TabsTrigger value="servicios" className="flex items-center gap-1.5 h-9">
            <Calendar className="h-4 w-4 hidden sm:block" /> Tipos Servicio
          </TabsTrigger>
        </TabsList>

        {/* ── TAB 1: Especies y Razas ────────────────────────────────────────── */}
        <TabsContent value="especies" className="space-y-4 mt-4">
          <Card className="border-orange-200 shadow-md">
            <CardHeader className="bg-gradient-to-r from-orange-50 to-white">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-orange-800 flex items-center gap-2">
                    <PawPrint className="h-5 w-5" /> Especies y Razas
                  </CardTitle>
                  <CardDescription>Gestione las especies y sus razas asociadas</CardDescription>
                </div>
                <Button onClick={openNewEspecie} className="bg-orange-600 hover:bg-orange-700" size="sm">
                  <Plus className="h-4 w-4 mr-1" /> Nueva Especie
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              {especies.length === 0 ? (
                <p className="text-center text-gray-400 py-8">No hay especies configuradas.</p>
              ) : (
                <div className="space-y-2">
                  {especies.map(especie => {
                    const razasDeEspecie = razas.filter(r => r.especieId === especie.id);
                    const isExpanded = expandedEspecie === especie.id;
                    return (
                      <div key={especie.id} className="border border-orange-100 rounded-lg overflow-hidden">
                        {/* Especie row */}
                        <div className="flex items-center gap-3 p-3 bg-orange-50/50 hover:bg-orange-50 transition-colors">
                          <button
                            onClick={() => setExpandedEspecie(isExpanded ? null : especie.id)}
                            className="flex items-center gap-2 flex-1 text-left"
                          >
                            {isExpanded ? <ChevronDown className="h-4 w-4 text-orange-500" /> : <ChevronRight className="h-4 w-4 text-orange-400" />}
                            {especie.icon && <span className="text-lg">{especie.icon}</span>}
                            <span className="font-medium text-gray-800">{especie.name}</span>
                            {especie.description && <span className="text-xs text-gray-500 hidden sm:inline">— {especie.description}</span>}
                            <Badge variant="secondary" className="ml-auto mr-2 text-xs">{razasDeEspecie.length} razas</Badge>
                          </button>
                          <button onClick={() => openEditEspecie(especie)} className="p-1.5 text-gray-400 hover:text-orange-600 rounded transition-colors">
                            <Edit className="h-4 w-4" />
                          </button>
                          <button onClick={() => setDeleteEspecieId(especie.id)} className="p-1.5 text-gray-400 hover:text-red-500 rounded transition-colors">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>

                        {/* Razas expandidas */}
                        {isExpanded && (
                          <div className="p-3 border-t border-orange-100 bg-white">
                            <div className="flex items-center justify-between mb-3">
                              <p className="text-sm font-medium text-gray-600">Razas de {especie.name}</p>
                              <Button size="sm" variant="outline" onClick={() => openNewRaza(especie.id)} className="h-7 text-xs border-orange-300 text-orange-700">
                                <Plus className="h-3 w-3 mr-1" /> Agregar Raza
                              </Button>
                            </div>
                            {razasDeEspecie.length === 0 ? (
                              <p className="text-sm text-gray-400 py-2">Sin razas configuradas.</p>
                            ) : (
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                {razasDeEspecie.map(raza => (
                                  <div key={raza.id} className="flex items-center justify-between p-2 bg-gray-50 rounded border border-gray-100 text-sm">
                                    <span className="text-gray-700">{raza.name}</span>
                                    <div className="flex gap-1">
                                      <button onClick={() => openEditRaza(raza)} className="p-1 text-gray-400 hover:text-orange-600 rounded">
                                        <Edit className="h-3.5 w-3.5" />
                                      </button>
                                      <button onClick={() => setDeleteRazaId(raza.id)} className="p-1 text-gray-400 hover:text-red-500 rounded">
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TAB 2: Tipos de Evento ─────────────────────────────────────────── */}
        <TabsContent value="eventos" className="space-y-4 mt-4">
          <Card className="border-orange-200 shadow-md">
            <CardHeader className="bg-gradient-to-r from-orange-50 to-white">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-orange-800 flex items-center gap-2">
                    <Stethoscope className="h-5 w-5" /> Tipos de Evento Clínico
                  </CardTitle>
                  <CardDescription>Tipos de evento disponibles en Historial Clínico y Turnos</CardDescription>
                </div>
                <Button onClick={openNewTipo} className="bg-orange-600 hover:bg-orange-700" size="sm">
                  <Plus className="h-4 w-4 mr-1" /> Nuevo Tipo
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              {tiposEvento.length === 0 ? (
                <p className="text-center text-gray-400 py-8">No hay tipos de evento configurados.</p>
              ) : (
                <div className="space-y-2">
                  {tiposEvento.map(tipo => (
                    <div key={tipo.id} className="flex items-center justify-between p-3 border border-gray-100 rounded-lg hover:bg-gray-50">
                      <div className="flex items-center gap-3">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${tipo.color}`}>{tipo.name}</span>
                        {tipo.requiresVaccineTracking && (
                          <Badge variant="secondary" className="text-xs bg-green-50 text-green-700 border-green-200">
                            <Syringe className="h-3 w-3 mr-1" /> Rastrea Vacuna
                          </Badge>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => openEditTipo(tipo)} className="p-1.5 text-gray-400 hover:text-orange-600 rounded">
                          <Edit className="h-4 w-4" />
                        </button>
                        <button onClick={() => setDeleteTipoId(tipo.id)} className="p-1.5 text-gray-400 hover:text-red-500 rounded">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TAB 3: Árbol de Vacunación ─────────────────────────────────────── */}
        <TabsContent value="vacunas" className="space-y-4 mt-4">
          <Card className="border-orange-200 shadow-md">
            <CardHeader className="bg-gradient-to-r from-orange-50 to-white">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <CardTitle className="text-orange-800 flex items-center gap-2">
                    <Syringe className="h-5 w-5" /> Árbol de Vacunación
                  </CardTitle>
                  <CardDescription>Vacunas por especie con dosis y periodicidad</CardDescription>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Select value={vacunaEspecieFilter} onValueChange={setVacunaEspecieFilter}>
                    <SelectTrigger className="w-40 h-8 text-xs">
                      <SelectValue placeholder="Filtrar especie" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas las especies</SelectItem>
                      {especies.map(e => <SelectItem key={e.id} value={e.id}>{e.icon ? `${e.icon} ${e.name}` : e.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button onClick={openNewVacuna} className="bg-orange-600 hover:bg-orange-700" size="sm">
                    <Plus className="h-4 w-4 mr-1" /> Nueva Vacuna
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              {filteredVacunas.length === 0 ? (
                <p className="text-center text-gray-400 py-8">No hay vacunas configuradas.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-2 px-3 text-gray-600 font-medium">Vacuna</th>
                        <th className="text-left py-2 px-3 text-gray-600 font-medium">Especie</th>
                        <th className="text-center py-2 px-3 text-gray-600 font-medium">Dosis</th>
                        <th className="text-center py-2 px-3 text-gray-600 font-medium">Periodicidad</th>
                        <th className="text-left py-2 px-3 text-gray-600 font-medium hidden md:table-cell">Descripción</th>
                        <th className="py-2 px-3"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredVacunas.map(v => {
                        const especie = especies.find(e => e.id === v.especieId);
                        const meses = v.periodicidadDias >= 365
                          ? `${Math.round(v.periodicidadDias / 365)} año${Math.round(v.periodicidadDias / 365) !== 1 ? "s" : ""}`
                          : v.periodicidadDias >= 30
                          ? `${Math.round(v.periodicidadDias / 30)} mes${Math.round(v.periodicidadDias / 30) !== 1 ? "es" : ""}`
                          : `${v.periodicidadDias} días`;
                        return (
                          <tr key={v.id} className="border-b border-gray-100 hover:bg-gray-50">
                            <td className="py-2 px-3 font-medium text-gray-800">{v.nombreVacuna}</td>
                            <td className="py-2 px-3 text-gray-600">{[especie?.icon, especie?.name ?? v.especieId].filter(Boolean).join(" ")}</td>
                            <td className="py-2 px-3 text-center"><Badge variant="secondary">{v.dosis}</Badge></td>
                            <td className="py-2 px-3 text-center text-orange-700 font-medium">{meses}</td>
                            <td className="py-2 px-3 text-gray-500 hidden md:table-cell">{v.descripcion ?? "—"}</td>
                            <td className="py-2 px-3">
                              <div className="flex gap-1 justify-end">
                                <button onClick={() => openEditVacuna(v)} className="p-1.5 text-gray-400 hover:text-orange-600 rounded">
                                  <Edit className="h-4 w-4" />
                                </button>
                                <button onClick={() => setDeleteVacunaId(v.id)} className="p-1.5 text-gray-400 hover:text-red-500 rounded">
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TAB 4: Profesiones ─────────────────────────────────────────────── */}
        <TabsContent value="profesiones" className="space-y-4 mt-4">
          <Card className="border-orange-200 shadow-md">
            <CardHeader className="bg-gradient-to-r from-orange-50 to-white">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-orange-800 flex items-center gap-2">
                    <UserCog className="h-5 w-5" /> Profesiones
                  </CardTitle>
                  <CardDescription>Profesiones disponibles al registrar profesionales</CardDescription>
                </div>
                <Button onClick={openNewProfesion} className="bg-orange-600 hover:bg-orange-700" size="sm">
                  <Plus className="h-4 w-4 mr-1" /> Nueva Profesión
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              {profesiones.length === 0 ? (
                <p className="text-center text-gray-400 py-8">No hay profesiones configuradas. Agregue una desde el botón "Nueva Profesión".</p>
              ) : (
                <div className="space-y-2">
                  {profesiones.map(p => (
                    <div key={p.id} className="flex items-center justify-between p-3 border border-gray-100 rounded-lg hover:bg-gray-50">
                      <div>
                        <p className="font-medium text-gray-800">{p.name}</p>
                        {p.description && <p className="text-xs text-gray-500 mt-0.5">{p.description}</p>}
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => openEditProfesion(p)} className="p-1.5 text-gray-400 hover:text-orange-600 rounded">
                          <Edit className="h-4 w-4" />
                        </button>
                        <button onClick={() => setDeleteProfesionId(p.id)} className="p-1.5 text-gray-400 hover:text-red-500 rounded">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TAB 5: Tipos de Servicio ───────────────────────────────────────── */}
        <TabsContent value="servicios" className="space-y-4 mt-4">
          <Card className="border-orange-200 shadow-md">
            <CardHeader className="bg-gradient-to-r from-orange-50 to-white">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-orange-800 flex items-center gap-2">
                    <Calendar className="h-5 w-5" /> Tipos de Servicio
                  </CardTitle>
                  <CardDescription>Tipos de servicio disponibles al agendar turnos</CardDescription>
                </div>
                <Button onClick={openNewServicio} className="bg-orange-600 hover:bg-orange-700" size="sm">
                  <Plus className="h-4 w-4 mr-1" /> Nuevo Servicio
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              {tiposServicio.length === 0 ? (
                <p className="text-center text-gray-400 py-8">No hay tipos de servicio configurados.</p>
              ) : (
                <div className="space-y-2">
                  {tiposServicio.map(s => (
                    <div key={s.id} className="flex items-center justify-between p-3 border border-gray-100 rounded-lg hover:bg-gray-50">
                      <div className="flex items-center gap-3">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${s.color}`}>{s.name}</span>
                        {s.description && <span className="text-xs text-gray-500">{s.description}</span>}
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => openEditServicio(s)} className="p-1.5 text-gray-400 hover:text-orange-600 rounded">
                          <Edit className="h-4 w-4" />
                        </button>
                        <button onClick={() => setDeleteServicioId(s.id)} className="p-1.5 text-gray-400 hover:text-red-500 rounded">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── DIALOGS ─────────────────────────────────────────────────────────── */}

      {/* Especie dialog */}
      <Dialog open={especieDialogOpen} onOpenChange={setEspecieDialogOpen}>
        <DialogContent className="sm:max-w-md border-orange-200">
          <DialogHeader>
            <DialogTitle className="text-orange-800">{editingEspecie ? "Editar Especie" : "Nueva Especie"}</DialogTitle>
            <DialogDescription>Complete los datos de la especie.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="flex items-end gap-3">
              <div className="space-y-2">
                <Label>Icono (opcional)</Label>
                <EmojiPicker
                  value={especieForm.icon}
                  onChange={icon => setEspecieForm(p => ({ ...p, icon }))}
                />
              </div>
              <div className="flex-1 space-y-2">
                <Label>Nombre <span className="text-red-500">*</span></Label>
                <Input value={especieForm.name} onChange={e => setEspecieForm(p => ({ ...p, name: e.target.value }))} placeholder="Ej: Perro" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Descripción (opcional)</Label>
              <Input value={especieForm.description} onChange={e => setEspecieForm(p => ({ ...p, description: e.target.value }))} placeholder="Ej: Canis lupus familiaris" />
            </div>
            <div className="flex gap-3 pt-2">
              <Button onClick={handleSaveEspecie} className="flex-1 bg-orange-600 hover:bg-orange-700"><Save className="h-4 w-4 mr-2" />Guardar</Button>
              <Button onClick={() => setEspecieDialogOpen(false)} variant="outline" className="flex-1"><X className="h-4 w-4 mr-2" />Cancelar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Raza dialog */}
      <Dialog open={razaDialogOpen} onOpenChange={setRazaDialogOpen}>
        <DialogContent className="sm:max-w-md border-orange-200">
          <DialogHeader>
            <DialogTitle className="text-orange-800">{editingRaza ? "Editar Raza" : "Nueva Raza"}</DialogTitle>
            <DialogDescription>
              Especie: <strong>{especies.find(e => e.id === razaForm.especieId)?.name}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>Nombre <span className="text-red-500">*</span></Label>
              <Input value={razaForm.name} onChange={e => setRazaForm(p => ({ ...p, name: e.target.value }))} placeholder="Ej: Labrador Retriever" />
            </div>
            <div className="space-y-2">
              <Label>Descripción (opcional)</Label>
              <Input value={razaForm.description} onChange={e => setRazaForm(p => ({ ...p, description: e.target.value }))} placeholder="Características principales..." />
            </div>
            <div className="flex gap-3 pt-2">
              <Button onClick={handleSaveRaza} className="flex-1 bg-orange-600 hover:bg-orange-700"><Save className="h-4 w-4 mr-2" />Guardar</Button>
              <Button onClick={() => setRazaDialogOpen(false)} variant="outline" className="flex-1"><X className="h-4 w-4 mr-2" />Cancelar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Tipo de Evento dialog */}
      <Dialog open={tipoDialogOpen} onOpenChange={setTipoDialogOpen}>
        <DialogContent className="sm:max-w-md border-orange-200">
          <DialogHeader>
            <DialogTitle className="text-orange-800">{editingTipo ? "Editar Tipo de Evento" : "Nuevo Tipo de Evento"}</DialogTitle>
            <DialogDescription>Configure el tipo de evento clínico.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>Nombre <span className="text-red-500">*</span></Label>
              <Input value={tipoForm.name} onChange={e => setTipoForm(p => ({ ...p, name: e.target.value }))} placeholder="Ej: Consulta médica" />
            </div>
            <div className="space-y-2">
              <Label>Color del chip</Label>
              <Select value={tipoForm.color} onValueChange={v => setTipoForm(p => ({ ...p, color: v }))}>
                <SelectTrigger>
                  <SelectValue>
                    <span className={`px-2 py-0.5 rounded-full text-xs ${tipoForm.color}`}>{COLOR_OPTIONS.find(c => c.value === tipoForm.color)?.label ?? "Seleccionar"}</span>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {COLOR_OPTIONS.map(c => (
                    <SelectItem key={c.value} value={c.value}>
                      <span className={`px-2 py-0.5 rounded-full text-xs mr-2 ${c.value}`}>{c.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg border border-green-100">
              <input
                type="checkbox"
                id="requiresVaccine"
                checked={tipoForm.requiresVaccineTracking}
                onChange={e => setTipoForm(p => ({ ...p, requiresVaccineTracking: e.target.checked }))}
                className="h-4 w-4 accent-green-600"
              />
              <label htmlFor="requiresVaccine" className="text-sm text-gray-700">
                <span className="font-medium">Rastrea vacunación</span> — al registrar este tipo, habilitar selector de vacuna y cálculo de próximo refuerzo
              </label>
            </div>
            <div className="flex gap-3 pt-2">
              <Button onClick={handleSaveTipo} className="flex-1 bg-orange-600 hover:bg-orange-700"><Save className="h-4 w-4 mr-2" />Guardar</Button>
              <Button onClick={() => setTipoDialogOpen(false)} variant="outline" className="flex-1"><X className="h-4 w-4 mr-2" />Cancelar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Vacuna dialog */}
      <Dialog open={vacunaDialogOpen} onOpenChange={setVacunaDialogOpen}>
        <DialogContent className="sm:max-w-md border-orange-200">
          <DialogHeader>
            <DialogTitle className="text-orange-800">{editingVacuna ? "Editar Vacuna" : "Nueva Vacuna"}</DialogTitle>
            <DialogDescription>Configure la vacuna en el árbol de vacunación.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>Especie <span className="text-red-500">*</span></Label>
              <Select value={vacunaForm.especieId} onValueChange={v => setVacunaForm(p => ({ ...p, especieId: v }))}>
                <SelectTrigger><SelectValue placeholder="Seleccione especie" /></SelectTrigger>
                <SelectContent>
                  {especies.map(e => <SelectItem key={e.id} value={e.id}>{e.icon ? `${e.icon} ${e.name}` : e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Nombre de la Vacuna <span className="text-red-500">*</span></Label>
              <Input value={vacunaForm.nombreVacuna} onChange={e => setVacunaForm(p => ({ ...p, nombreVacuna: e.target.value }))} placeholder="Ej: Antirrábica" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Dosis necesarias</Label>
                <Input type="number" min={1} max={10} value={vacunaForm.dosis} onChange={e => setVacunaForm(p => ({ ...p, dosis: Number(e.target.value) }))} />
              </div>
              <div className="space-y-2">
                <Label>Periodicidad (días)</Label>
                <Input type="number" min={1} value={vacunaForm.periodicidadDias} onChange={e => setVacunaForm(p => ({ ...p, periodicidadDias: Number(e.target.value) }))} />
                <p className="text-xs text-gray-400">365 = anual · 180 = semestral</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Descripción (opcional)</Label>
              <Textarea value={vacunaForm.descripcion} onChange={e => setVacunaForm(p => ({ ...p, descripcion: e.target.value }))} placeholder="Enfermedades que previene, notas adicionales..." rows={2} className="resize-none" />
            </div>
            <div className="flex gap-3 pt-2">
              <Button onClick={handleSaveVacuna} className="flex-1 bg-orange-600 hover:bg-orange-700"><Save className="h-4 w-4 mr-2" />Guardar</Button>
              <Button onClick={() => setVacunaDialogOpen(false)} variant="outline" className="flex-1"><X className="h-4 w-4 mr-2" />Cancelar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm delete dialogs */}
      <AlertDialog open={!!deleteEspecieId} onOpenChange={() => setDeleteEspecieId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar especie?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción desactivará la especie. Asegúrese de que no tenga razas activas.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteEspecie} className="bg-red-600 hover:bg-red-700">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteRazaId} onOpenChange={() => setDeleteRazaId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar raza?</AlertDialogTitle>
            <AlertDialogDescription>Esta raza será desactivada del sistema.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteRaza} className="bg-red-600 hover:bg-red-700">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteTipoId} onOpenChange={() => setDeleteTipoId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar tipo de evento?</AlertDialogTitle>
            <AlertDialogDescription>Este tipo dejará de aparecer en los formularios.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteTipo} className="bg-red-600 hover:bg-red-700">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteVacunaId} onOpenChange={() => setDeleteVacunaId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar vacuna?</AlertDialogTitle>
            <AlertDialogDescription>Esta vacuna será desactivada del árbol de vacunación.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteVacuna} className="bg-red-600 hover:bg-red-700">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Profesión dialog */}
      <Dialog open={profesionDialogOpen} onOpenChange={setProfesionDialogOpen}>
        <DialogContent className="sm:max-w-md border-orange-200">
          <DialogHeader>
            <DialogTitle className="text-orange-800">{editingProfesion ? "Editar Profesión" : "Nueva Profesión"}</DialogTitle>
            <DialogDescription>Complete los datos de la profesión.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>Nombre <span className="text-red-500">*</span></Label>
              <Input value={profesionForm.name} onChange={e => setProfesionForm(p => ({ ...p, name: e.target.value }))} placeholder="Ej: Veterinario, Peluquero, Auxiliar Clínico..." />
            </div>
            <div className="space-y-2">
              <Label>Descripción (opcional)</Label>
              <Textarea value={profesionForm.description} onChange={e => setProfesionForm(p => ({ ...p, description: e.target.value }))} placeholder="Detalles de la profesión..." rows={2} className="resize-none" />
            </div>
            <div className="flex gap-3 pt-2">
              <Button onClick={handleSaveProfesion} className="flex-1 bg-orange-600 hover:bg-orange-700"><Save className="h-4 w-4 mr-2" />Guardar</Button>
              <Button onClick={() => setProfesionDialogOpen(false)} variant="outline" className="flex-1"><X className="h-4 w-4 mr-2" />Cancelar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteProfesionId} onOpenChange={() => setDeleteProfesionId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar profesión?</AlertDialogTitle>
            <AlertDialogDescription>Esta profesión será desactivada. Los usuarios existentes que la tengan asignada no se verán afectados.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteProfesion} className="bg-red-600 hover:bg-red-700">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Tipo de Servicio dialog */}
      <Dialog open={servicioDialogOpen} onOpenChange={setServicioDialogOpen}>
        <DialogContent className="sm:max-w-md border-orange-200">
          <DialogHeader>
            <DialogTitle className="text-orange-800">{editingServicio ? "Editar Servicio" : "Nuevo Servicio"}</DialogTitle>
            <DialogDescription>Configure un nuevo tipo de servicio para los turnos.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>Nombre <span className="text-red-500">*</span></Label>
              <Input value={servicioForm.name} onChange={e => setServicioForm(p => ({ ...p, name: e.target.value }))} placeholder="Ej: Clínica, Peluquería, Guardería..." />
            </div>
            <div className="space-y-2">
              <Label>Color de etiqueta</Label>
              <Select value={servicioForm.color} onValueChange={v => setServicioForm(p => ({ ...p, color: v }))}>
                <SelectTrigger><SelectValue placeholder="Seleccione un color" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bg-blue-100 text-blue-800"><span className="px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800 font-medium">Azul (Clínica)</span></SelectItem>
                  <SelectItem value="bg-pink-100 text-pink-800"><span className="px-2 py-1 rounded-full text-xs bg-pink-100 text-pink-800 font-medium">Rosa (Peluquería)</span></SelectItem>
                  <SelectItem value="bg-green-100 text-green-800"><span className="px-2 py-1 rounded-full text-xs bg-green-100 text-green-800 font-medium">Verde (Guardería)</span></SelectItem>
                  <SelectItem value="bg-orange-100 text-orange-800"><span className="px-2 py-1 rounded-full text-xs bg-orange-100 text-orange-800 font-medium">Naranja (Cirugía)</span></SelectItem>
                  <SelectItem value="bg-purple-100 text-purple-800"><span className="px-2 py-1 rounded-full text-xs bg-purple-100 text-purple-800 font-medium">Morado</span></SelectItem>
                  <SelectItem value="bg-gray-100 text-gray-800"><span className="px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-800 font-medium">Gris</span></SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Profesión requerida (opcional)</Label>
              <Select
                value={servicioForm.profesion || "__none__"}
                onValueChange={v => setServicioForm(p => ({ ...p, profesion: v === "__none__" ? "" : v }))}
              >
                <SelectTrigger><SelectValue placeholder="Cualquier profesional" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Cualquier profesional</SelectItem>
                  {profesiones.map(p => (
                    <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-400">
                Al agendar, solo se ofrecerán profesionales con esta profesión. Si se deja en
                «Cualquier profesional», aparecerán todos.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Descripción (opcional)</Label>
              <Textarea value={servicioForm.description} onChange={e => setServicioForm(p => ({ ...p, description: e.target.value }))} placeholder="Detalles del tipo de servicio..." rows={2} className="resize-none" />
            </div>
            <div className="flex gap-3 pt-2">
              <Button onClick={handleSaveServicio} className="flex-1 bg-orange-600 hover:bg-orange-700"><Save className="h-4 w-4 mr-2" />Guardar</Button>
              <Button onClick={() => setServicioDialogOpen(false)} variant="outline" className="flex-1"><X className="h-4 w-4 mr-2" />Cancelar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteServicioId} onOpenChange={() => setDeleteServicioId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar tipo de servicio?</AlertDialogTitle>
            <AlertDialogDescription>Este servicio ya no estará disponible al agendar nuevos turnos.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteServicio} className="bg-red-600 hover:bg-red-700">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
