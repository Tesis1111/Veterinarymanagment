import { useState, useEffect, useMemo } from "react";
import { useAuth } from "../../context/AuthContext";
import { useAudit } from "../../context/AuditContext";
import { Pet, Client, PetOwnershipChange } from "../../types";
import {
  traerMascotas,
  registrarMascota,
  modificarMascota,
  eliminarMascota,
  reactivarMascota,
  eliminarMascotaFisica,
  ValidarUnicidadMascota,
} from "../../services/mascotaService";
import { traerClientes } from "../../services/clienteService";
import { suscribirEspecies, suscribirRazas } from "../../services/parametrosService";
import { EspecieParametro, RazaParametro } from "../../types";
import { db, FIREBASE_CONFIGURED } from "../../firebase/config";
import { collection, onSnapshot, Timestamp } from "firebase/firestore";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Combobox } from "../ui/combobox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { Calendar } from "../ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Badge } from "../ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Search, PawPrint, Save, X, Trash2, Edit, Calendar as CalendarIcon, Info, UserX, Users, History, Archive, AlertTriangle, FileText, FileSpreadsheet, List, RotateCcw, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { exportToExcel, exportToPDF } from "../../utils/exportUtils";
import { useSuccessPopup } from "../../context/SuccessPopupContext";
import { sendPetRegistered } from "../../services/resendService";

// Año más antiguo ofrecido en el selector de fecha de nacimiento. 40 años cubre
// de sobra la longevidad de cualquier especie atendida en la clínica.
const MIN_BIRTH_YEAR = new Date().getFullYear() - 40;

export default function PetsModuleEnhanced() {
  const { user, isAdmin, hasPermission } = useAuth();
  // Gate de escritura: coincide con firestore.rules (write de /mascotas solo
  // admin + recepcionista). El veterinario/peluquero solo ve la lista.
  const canManage = hasPermission("manage_pets");
  const { addLog } = useAudit();
  const { showSuccess } = useSuccessPopup();
  const [pets, setPets] = useState<Pet[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPet, setSelectedPet] = useState<Pet | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  // Mascota objetivo del borrado físico definitivo
  const [petToPurge, setPetToPurge] = useState<Pet | null>(null);
  const [deceasedDialogOpen, setDeceasedDialogOpen] = useState(false);
  const [changeOwnerDialogOpen, setChangeOwnerDialogOpen] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [deceasedCalendarOpen, setDeceasedCalendarOpen] = useState(false);
  const [showWeightInfo, setShowWeightInfo] = useState(true);
  const [selectedSpeciesId, setSelectedSpeciesId] = useState("");
  const [especies, setEspecies] = useState<EspecieParametro[]>([]);
  const [todasLasRazas, setTodasLasRazas] = useState<RazaParametro[]>([]);

  // Filtros avanzados
  const [filterSpecies, setFilterSpecies] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("active");
  const [filterAge, setFilterAge] = useState<string>("all");
  const [activeTab, setActiveTab] = useState("list");

  useEffect(() => {
    const tab = localStorage.getItem("pets_initial_tab");
    if (tab) {
      setActiveTab(tab);
      localStorage.removeItem("pets_initial_tab");
    }
  }, []);

  // Sin permiso de gestión no existe la pestaña "new"
  useEffect(() => {
    if (!canManage && activeTab === "new") setActiveTab("list");
  }, [canManage, activeTab]);

  const [formData, setFormData] = useState({
    name: "",
    speciesId: "",
    breedId: "",
    sex: "",
    clientId: "",
    birthDate: undefined as Date | undefined,
    colorObservations: ""
  });

  const [deceasedForm, setDeceasedForm] = useState({
    deceasedDate: new Date(),
    deceasedReason: "",
    deceasedNotes: ""
  });

  const [changeOwnerForm, setChangeOwnerForm] = useState({
    newClientId: "",
    reason: "",
    notes: ""
  });

  useEffect(() => {
    if (FIREBASE_CONFIGURED && db) {
      // Real-time pets subscription.
      // Cargamos TODAS las mascotas (activas, dadas de baja y eliminadas) —
      // el filtro de Estado se aplica en cliente más abajo.
      const qPets = collection(db, "mascotas");
      const unsubPets = onSnapshot(qPets, (snap) => {
        const migrated = snap.docs.map(d => {
          const data = d.data();
          return {
            id: d.id,
            name: data.name ?? "",
            breedId: data.breedId ?? "",
            sex: data.sex ?? "Desconocido",
            birthDate: data.birthDate instanceof Timestamp ? data.birthDate.toDate() : data.birthDate ? new Date(data.birthDate) : undefined,
            color: data.color,
            observations: data.observations,
            clientId: data.clientId ?? "",
            deceased: data.deceased ?? false,
            deceasedDate: data.deceasedDate instanceof Timestamp ? data.deceasedDate.toDate() : undefined,
            deceasedReason: data.deceasedReason,
            deceasedNotes: data.deceasedNotes,
            ownershipHistory: data.ownershipHistory ?? [],
            species: data.species,
            race: data.race,
            createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(),
            createdBy: data.createdBy ?? "",
            deleted: data.deleted ?? false,
          } as any;
        });
        setPets(migrated);
      }, () => {
        
      });
      traerClientes().then(setClients).catch(() => {});
      // Real-time species and breeds so new ones from Parámetros appear automatically
      const unsubEspecies = suscribirEspecies(setEspecies, () => {
        setEspecies([]);
      });
      const unsubRazas = suscribirRazas(setTodasLasRazas);
      return () => { unsubPets(); unsubEspecies(); unsubRazas(); };
    } else {
      traerMascotas().then(loaded => {
        const migrated = loaded.map((pet: any) => ({
          ...pet,
          deceased: pet.deceased || false,
          ownershipHistory: pet.ownershipHistory || [],
        }));
        setPets(migrated);
      }).catch((err) => {
        console.error("[PetsModule] Error cargando mascotas:", err);
        setPets([]);
      });
      traerClientes().then(setClients).catch(() => setClients([]));
      suscribirEspecies(setEspecies);
      suscribirRazas(setTodasLasRazas);
    }
  }, []);

  const calculateAge = (birthDate: Date | undefined): string => {
    if (!birthDate) return "-";
    const today = new Date();
    const birth = new Date(birthDate);
    let years = today.getFullYear() - birth.getFullYear();
    let months = today.getMonth() - birth.getMonth();
    if (months < 0) { years--; months += 12; }
    if (months === 0 && today.getDate() < birth.getDate()) { years--; months = 11; }
    else if (today.getDate() < birth.getDate()) { months--; if (months < 0) { years--; months = 11; } }
    if (years === 0 && months === 0) return "Menos de 1 mes";
    if (years === 0) return `${months} mes${months !== 1 ? "es" : ""}`;
    if (months === 0) return `${years} año${years !== 1 ? "s" : ""}`;
    return `${years} año${years !== 1 ? "s" : ""} y ${months} mes${months !== 1 ? "es" : ""}`;
  };

  const getClientName = (clientId: string): string => {
    const client = clients.find(c => c.id === clientId);
    return client ? client.fullName : "Cliente no encontrado";
  };

  const calculateAgeInMonths = (birthDate: Date | undefined): number => {
    if (!birthDate) return 0;
    const today = new Date();
    const birth = new Date(birthDate);
    const years = today.getFullYear() - birth.getFullYear();
    const months = today.getMonth() - birth.getMonth();
    return years * 12 + months;
  };

  const filteredPets = useMemo(() => {
    return pets.filter(pet => {
      // Filtro por estado (activa / baja / eliminada / todas)
      if (filterStatus === "active") {
        if (pet.deleted || (pet as any).deceased) return false;
      } else if (filterStatus === "deBaja") {
        if (!(pet as any).deceased || pet.deleted) return false;
      } else if (filterStatus === "eliminadas") {
        if (!pet.deleted) return false;
      }
      // "all": no se filtra por estado (incluye eliminadas)

      // Filtro por búsqueda de texto
      const client = clients.find(c => c.id === pet.clientId);
      const speciesName = (pet as any).species || "";
      const breedName = (pet as any).race || "";
      const searchMatch = (
        pet.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        speciesName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        breedName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (client?.fullName.toLowerCase().includes(searchTerm.toLowerCase()))
      );
      if (!searchMatch) return false;

      // Filtro por especie
      if (filterSpecies !== "all" && speciesName !== filterSpecies) return false;

      // Filtro por edad
      if (filterAge !== "all") {
        const ageInMonths = calculateAgeInMonths(pet.birthDate);
        switch (filterAge) {
          case "puppy": // Cachorro/Cría: 0-12 meses
            if (ageInMonths > 12) return false;
            break;
          case "young": // Joven: 1-3 años
            if (ageInMonths < 12 || ageInMonths > 36) return false;
            break;
          case "adult": // Adulto: 3-7 años
            if (ageInMonths < 36 || ageInMonths > 84) return false;
            break;
          case "senior": // Senior: 7+ años
            if (ageInMonths < 84) return false;
            break;
          case "unknown": // Sin fecha de nacimiento
            if (pet.birthDate) return false;
            break;
        }
      }

      return true;
    });
  }, [pets, clients, searchTerm, filterSpecies, filterStatus, filterAge]);

  // Clientes activos, ordenados y con DNI/teléfono como texto buscable extra.
  const clientOptions = useMemo(
    () =>
      clients
        .filter(c => !c.deleted)
        .sort((a, b) => a.fullName.localeCompare(b.fullName, "es"))
        .map(c => ({
          value: c.id,
          label: c.fullName,
          description: [c.dniCuit, c.phone].filter(Boolean).join(" · "),
        })),
    [clients]
  );

  const availableBreeds = useMemo(() => {
    if (!selectedSpeciesId) return [];
    const fromFirestore = todasLasRazas.filter(r => r.especieId === selectedSpeciesId);
    return fromFirestore;
  }, [selectedSpeciesId, todasLasRazas]);

  // Resuelven el nombre visible desde los parámetros dinámicos (Firestore).
  // Si el id no existe (raza sin elegir, especie borrada) devuelven "" en lugar
  // de romper: son datos opcionales que se muestran tal cual en la ficha.
  const getSpeciesName = (id?: string) => especies.find(e => e.id === id)?.name ?? "";
  const getBreedName = (id?: string) => todasLasRazas.find(r => r.id === id)?.name ?? "";

  const selectPet = (pet: Pet) => {
    setSelectedPet(pet);
    setIsEditing(true);
    setActiveTab("new");
    const speciesId = (pet as any).speciesId || "";
    setSelectedSpeciesId(speciesId);
    setFormData({
      name: pet.name,
      speciesId: speciesId,
      breedId: (pet as any).breedId || "",
      sex: pet.sex || "",
      clientId: pet.clientId,
      birthDate: pet.birthDate ? new Date(pet.birthDate) : undefined,
      colorObservations: (pet as any).colorObservations || pet.observations || ""
    });
  };

  const handleSave = async () => {
    if (!formData.name || !formData.speciesId || !formData.sex || !formData.clientId) {
      toast.error("Por favor, complete todos los campos obligatorios");
      return;
    }

    // ValidarUnicidadMascota — Gestor Alta Mascota
    const isUnique = await ValidarUnicidadMascota(formData.name, formData.clientId, selectedPet?.id);
    if (!isUnique) {
      toast.error("Ya existe una mascota con ese nombre para este cliente");
      return;
    }

    try {
      const petToSave: any = {
        name: formData.name,
        speciesId: formData.speciesId,
        breedId: formData.breedId || formData.speciesId,
        sex: formData.sex as Pet["sex"],
        clientId: formData.clientId,
        // Firestore rechaza `undefined`: sin fecha se guarda null explícito.
        birthDate: formData.birthDate ? formData.birthDate.toISOString() : null,
        color: formData.colorObservations,
        observations: formData.colorObservations,
        species: getSpeciesName(formData.speciesId),
        race: getBreedName(formData.breedId),
      };

      if (isEditing && selectedPet) {
        const previousClientId = selectedPet.clientId;
        const clientChanged = previousClientId !== formData.clientId;

        if (clientChanged) {
          const ownershipChange: PetOwnershipChange = {
            id: Date.now().toString(),
            petId: selectedPet.id,
            previousClientId,
            previousClientName: getClientName(previousClientId),
            newClientId: formData.clientId,
            newClientName: getClientName(formData.clientId),
            changeDate: new Date(),
            reason: "Actualización manual del dueño",
            recordedBy: user?.id || "1"
          };
          petToSave.ownershipHistory = [...(selectedPet.ownershipHistory || []), ownershipChange];
          addLog("Actualizar", "Mascotas", `Cambio de dueño: ${selectedPet.name} → ${getClientName(formData.clientId)}`);
        }

        await modificarMascota(selectedPet.id, petToSave, user?.id || "1");
        showSuccess(`Mascota ${petToSave.name} actualizada exitosamente.`);
      } else {
        await registrarMascota(petToSave, user?.id || "1");
        showSuccess(`Mascota ${petToSave.name} registrada exitosamente.`);
        
        // Enviar email de registro de mascota
        const client = clients.find(c => c.id === formData.clientId);
        if (client?.email) {
          sendPetRegistered(client.email, {
            clientName: client.fullName,
            petName: petToSave.name,
            species: petToSave.species || "Sin especificar",
            breed: petToSave.race || "Sin especificar",
          }).catch(() => toast.warning("La mascota se registró, pero no se pudo enviar el correo al cliente"));
        }
      }
      handleCancel();
    } catch {
      toast.error("Error al guardar la mascota. Intente nuevamente.");
    }
  };

  const handleCancel = () => {
    setFormData({
      name: "",
      speciesId: "",
      breedId: "",
      sex: "",
      clientId: "",
      birthDate: undefined,
      colorObservations: ""
    });
    setSelectedSpeciesId("");
    setSelectedPet(null);
    setIsEditing(false);
    setActiveTab("list");
  };

  const handleDelete = async () => {
    if (selectedPet) {
      try {
        await eliminarMascota(selectedPet.id, user?.id || "1");
        showSuccess(`Mascota ${selectedPet.name} eliminada exitosamente.`);
        setPets(prev => prev.filter(p => p.id !== selectedPet.id));
        addLog("Eliminar", "Mascotas", `Mascota ${selectedPet.name} eliminada`);
        handleCancel();
      } catch {
        toast.error("Error al eliminar la mascota.");
      }
      setDeleteDialogOpen(false);
    }
  };

  const handleReactivatePet = async (pet: Pet) => {
    try {
      await reactivarMascota(pet.id, user?.id || "1");
      showSuccess(`Mascota ${pet.name} reactivada exitosamente.`);
      addLog("Actualizar", "Mascotas", `Mascota ${pet.name} reactivada`);
    } catch {
      toast.error("Error al reactivar la mascota.");
    }
  };

  const handlePurgePet = async () => {
    if (!petToPurge) return;
    try {
      await eliminarMascotaFisica(petToPurge.id);
      showSuccess(`Mascota ${petToPurge.name} eliminada del sistema exitosamente.`);
      setPets(prev => prev.filter(p => p.id !== petToPurge.id));
      addLog("Eliminar", "Mascotas", `Mascota ${petToPurge.name} eliminada definitivamente`);
    } catch {
      toast.error("Error al eliminar definitivamente la mascota.");
    }
    setPetToPurge(null);
  };

  const handleMarkAsDeceased = async () => {
    if (!selectedPet) return;
    if (!deceasedForm.deceasedReason.trim()) {
      toast.error("Por favor indique el motivo de la baja");
      return;
    }

    try {
      // Use mascotaService.marcarBaja via direct patch
      const updated = await modificarMascota(
        selectedPet.id,
        {
          deceased: true,
          deceasedDate: deceasedForm.deceasedDate,
          deceasedReason: deceasedForm.deceasedReason,
          deceasedNotes: deceasedForm.deceasedNotes,
        } as any,
        user?.id || "1"
      );
      setPets(prev => prev.map(p => p.id === selectedPet.id ? { ...p, ...updated } : p));
      toast.success(`${selectedPet.name} ha sido dado/a de baja`);
      addLog("Actualizar", "Mascotas", `Mascota ${selectedPet.name} dada de baja`);
    } catch {
      toast.error("Error al actualizar el estado de la mascota.");
    }

    setDeceasedDialogOpen(false);
    setDeceasedForm({ deceasedDate: new Date(), deceasedReason: "", deceasedNotes: "" });
    setSelectedPet(null);
  };

  const handleChangeOwner = async () => {
    if (!selectedPet) return;
    if (!changeOwnerForm.newClientId) {
      toast.error("Seleccione el nuevo dueño");
      return;
    }
    if (changeOwnerForm.newClientId === selectedPet.clientId) {
      toast.error("El nuevo dueño es el mismo que el actual");
      return;
    }

    const ownershipChange: PetOwnershipChange = {
      id: Date.now().toString(),
      petId: selectedPet.id,
      previousClientId: selectedPet.clientId,
      previousClientName: getClientName(selectedPet.clientId),
      newClientId: changeOwnerForm.newClientId,
      newClientName: getClientName(changeOwnerForm.newClientId),
      changeDate: new Date(),
      reason: changeOwnerForm.reason || "Cambio de propietario",
      notes: changeOwnerForm.notes,
      recordedBy: user?.id || "1"
    };

    try {
      // Persistir en Firestore: antes solo se actualizaba el estado local y el
      // cambio se perdía al recargar (onSnapshot lo pisaba con el dato viejo).
      await modificarMascota(
        selectedPet.id,
        {
          clientId: changeOwnerForm.newClientId,
          ownershipHistory: [...(selectedPet.ownershipHistory || []), ownershipChange],
        } as any,
        user?.id || "1"
      );
      toast.success(`${selectedPet.name} ahora pertenece a ${getClientName(changeOwnerForm.newClientId)}`);
      addLog("Actualizar", "Mascotas", `Cambio de dueño: ${selectedPet.name} → ${getClientName(changeOwnerForm.newClientId)}`);
      setChangeOwnerDialogOpen(false);
      setChangeOwnerForm({ newClientId: "", reason: "", notes: "" });
      setSelectedPet(null);
    } catch {
      toast.error("Error al cambiar el dueño de la mascota.");
    }
  };

  const getSpeciesBadgeColor = (speciesId: string) => {
    switch (speciesId) {
      case "sp_perro": return "bg-amber-100 text-amber-800";
      case "sp_gato": return "bg-purple-100 text-purple-800";
      case "sp_ave": return "bg-sky-100 text-sky-800";
      case "sp_conejo": return "bg-pink-100 text-pink-800";
      case "sp_hamster": return "bg-orange-100 text-orange-800";
      case "sp_reptil": return "bg-green-100 text-green-800";
      default: return "bg-gray-100 text-gray-700";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-orange-800 flex items-center gap-2">
            <PawPrint className="h-8 w-8" />
            Gestión de Mascotas
          </h1>
          <p className="text-gray-600 mt-1">Registro completo con especies, razas y estados</p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="border-green-300 text-green-700 hover:bg-green-50"
            onClick={() => {
              exportToExcel(
                "mascotas",
                ["Nombre", "Especie", "Raza", "Sexo", "Dueño", "Fecha Nac.", "Tamaño", "Estado"],
                filteredPets.map(p => [
                  p.name,
                  (p as any).species || "—",
                  (p as any).race || "—",
                  p.sex,
                  clients.find(c => c.id === p.clientId)?.fullName || "—",
                  p.birthDate ? format(new Date(p.birthDate), "dd/MM/yyyy") : "—",
                  (p as any).size || "—",
                  (p as any).deceased ? "Baja" : "Activa",
                ]),
                "Listado de Mascotas"
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
                "Listado de Mascotas",
                `Total: ${filteredPets.length} mascotas`,
                ["Nombre", "Especie", "Raza", "Sexo", "Dueño", "Estado"],
                filteredPets.map(p => [
                  p.name,
                  (p as any).species || "—",
                  (p as any).race || "—",
                  p.sex,
                  clients.find(c => c.id === p.clientId)?.fullName || "—",
                  (p as any).deceased ? "Baja" : "Activa",
                ]),
                { "Total de mascotas": String(filteredPets.length) }
              );
              toast.success("PDF generado — use Ctrl+P para guardar");
            }}
          >
            <FileText className="mr-2 h-4 w-4" />PDF
          </Button>
        </div>
      </div>

      {/* Info peso movido */}
      {showWeightInfo && (
        <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <Info className="h-4 w-4 text-blue-600 flex-shrink-0" />
          <p className="text-sm text-blue-700 flex-1">
            El <strong>peso</strong> de la mascota se registra en cada visita dentro del <strong>Historial Clínico</strong>, permitiendo seguimiento evolutivo.
          </p>
          <button
            onClick={() => setShowWeightInfo(false)}
            className="text-blue-400 hover:text-blue-700 transition-colors ml-2 flex-shrink-0"
            title="Cerrar aviso"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className={`grid w-full ${canManage ? "grid-cols-2" : "grid-cols-1"} bg-orange-50 mb-6`}>
          <TabsTrigger value="list">
            <List className="h-4 w-4 mr-2" />
            Lista de Mascotas
          </TabsTrigger>
          {canManage && (
            <TabsTrigger value="new">
              <PawPrint className="h-4 w-4 mr-2" />
              {isEditing ? "Editar Mascota" : "Nueva Mascota"}
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="new">
          <Card className="border-orange-200 shadow-md">
            <CardHeader className="bg-gradient-to-r from-orange-50 to-white">
              <CardTitle className="flex items-center gap-2 text-orange-800">
                <PawPrint className="h-5 w-5" />
                {isEditing ? "Editar Mascota" : "Nueva Mascota"}
              </CardTitle>
              <CardDescription>
                Complete los campos obligatorios marcados con *
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">

            <div className="space-y-2">
              <Label htmlFor="name">
                Nombre <span className="text-red-500">*</span>
              </Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Ej: Max, Luna, Bobby..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="clientId">
                Cliente Asociado <span className="text-red-500">*</span>
              </Label>
              <Combobox
                id="clientId"
                options={clientOptions}
                value={formData.clientId}
                onChange={(value) => setFormData(prev => ({ ...prev, clientId: value }))}
                placeholder="Seleccione cliente"
                searchPlaceholder="Buscar por nombre, DNI/CUIT o teléfono…"
                emptyMessage="No se encontraron clientes."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="speciesId">
                Especie <span className="text-red-500">*</span>
              </Label>
              <Select
                value={formData.speciesId}
                onValueChange={(value) => {
                  setFormData(prev => ({ ...prev, speciesId: value, breedId: "" }));
                  setSelectedSpeciesId(value);
                }}
              >
                <SelectTrigger id="speciesId">
                  <SelectValue placeholder="Seleccione especie" />
                </SelectTrigger>
                <SelectContent>
                  {especies.map(species => (
                    <SelectItem key={species.id} value={species.id}>
                      {species.icon ? `${species.icon} ${species.name}` : species.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="breedId">Raza (opcional)</Label>
              <Select
                value={formData.breedId}
                onValueChange={(value) => setFormData(prev => ({ ...prev, breedId: value }))}
                disabled={!formData.speciesId}
              >
                <SelectTrigger id="breedId">
                  <SelectValue placeholder={formData.speciesId ? "Seleccione raza" : "Primero seleccione especie"} />
                </SelectTrigger>
                <SelectContent>
                  {availableBreeds.map(breed => (
                    <SelectItem key={breed.id} value={breed.id}>
                      {breed.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sex">
                Sexo <span className="text-red-500">*</span>
              </Label>
              <Select
                value={formData.sex}
                onValueChange={(value) => setFormData(prev => ({ ...prev, sex: value }))}
              >
                <SelectTrigger id="sex">
                  <SelectValue placeholder="Seleccione sexo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Macho">Macho</SelectItem>
                  <SelectItem value="Hembra">Hembra</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Fecha de Nacimiento {isEditing && <span className="text-xs text-gray-500">(no editable)</span>}</Label>
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left"
                    disabled={isEditing}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formData.birthDate
                      ? format(formData.birthDate, "PPP", { locale: es })
                      : "Seleccionar fecha"}
                  </Button>
                </PopoverTrigger>
                {!isEditing && (
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      locale={es}
                      selected={formData.birthDate}
                      // Una fecha de nacimiento suele estar años atrás: sin los
                      // selectores de mes/año habría que retroceder mes a mes.
                      captionLayout="dropdown-buttons"
                      fromYear={MIN_BIRTH_YEAR}
                      toYear={new Date().getFullYear()}
                      defaultMonth={formData.birthDate ?? new Date()}
                      onSelect={(date) => {
                        if (date && date > new Date()) {
                          toast.error("La fecha de nacimiento no puede ser una fecha futura.");
                          return;
                        }
                        setFormData(prev => ({ ...prev, birthDate: date }));
                        setCalendarOpen(false);
                      }}
                      disabled={{ after: new Date() }}
                      initialFocus
                    />
                  </PopoverContent>
                )}
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>Edad (calculada automáticamente)</Label>
              <div className="h-10 flex items-center px-3 border rounded-md bg-gray-50 text-sm text-gray-600">
                {formData.birthDate ? calculateAge(formData.birthDate) : "—"}
              </div>
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="colorObservations">Color / Observaciones (opcional)</Label>
              <Textarea
                id="colorObservations"
                value={formData.colorObservations}
                onChange={(e) => setFormData(prev => ({ ...prev, colorObservations: e.target.value }))}
                placeholder="Descripción física, comportamiento, alergias conocidas..."
                rows={3}
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 mt-6">
            <Button
              onClick={handleSave}
              className="flex-1 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700"
            >
              <Save className="mr-2 h-4 w-4" />
              {isEditing ? "Actualizar" : "Guardar"}
            </Button>
            <Button
              onClick={handleCancel}
              variant="outline"
              className="flex-1 border-orange-300 hover:bg-orange-50"
            >
              <X className="mr-2 h-4 w-4" />
              Cancelar
            </Button>
            {isEditing && (
              <Button
                onClick={() => setDeleteDialogOpen(true)}
                variant="destructive"
                className="flex-1"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Eliminar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
      </TabsContent>

      <TabsContent value="list">
      <Card className="border-orange-200 shadow-md">
        <CardHeader className="bg-gradient-to-r from-orange-50 to-white">
          <CardTitle className="flex items-center gap-2 text-orange-800">
            <Search className="h-5 w-5" />
            Lista de Mascotas
          </CardTitle>
          <CardDescription>
            {filteredPets.length} mascota{filteredPets.length !== 1 ? "s" : ""} encontrada{filteredPets.length !== 1 ? "s" : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          {/* Barra de búsqueda */}
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Buscar por nombre, especie, raza o dueño..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* Filtros Avanzados */}
          <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              <h4 className="font-semibold text-gray-800">Filtros Avanzados</h4>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-sm">Especie</Label>
                <Select value={filterSpecies} onValueChange={setFilterSpecies}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las especies</SelectItem>
                    {especies.map(species => (
                      <SelectItem key={species.id} value={(species as any).name ?? species.name}>
                        {species.icon ? `${species.icon} ${species.name}` : species.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-sm">Estado</Label>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los estados</SelectItem>
                    <SelectItem value="active">Activas</SelectItem>
                    <SelectItem value="deBaja">Dadas de baja</SelectItem>
                    <SelectItem value="eliminadas">Eliminadas</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-sm">Edad</Label>
                <Select value={filterAge} onValueChange={setFilterAge}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las edades</SelectItem>
                    <SelectItem value="puppy">Cachorro/Cría (0-1 año)</SelectItem>
                    <SelectItem value="young">Joven (1-3 años)</SelectItem>
                    <SelectItem value="adult">Adulto (3-7 años)</SelectItem>
                    <SelectItem value="senior">Senior (7+ años)</SelectItem>
                    <SelectItem value="unknown">Sin edad registrada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Indicadores de filtros activos */}
            <div className="flex flex-wrap gap-2 mt-3">
              {filterSpecies !== "all" && (
                <Badge variant="outline" className="bg-blue-50 border-blue-300">
                  Especie: {filterSpecies}
                  <button
                    onClick={() => setFilterSpecies("all")}
                    className="ml-1.5 hover:text-red-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              )}
              {filterStatus !== "all" && (
                <Badge variant="outline" className="bg-green-50 border-green-300">
                  Estado: {filterStatus === "active" ? "Activas" : "Bajas"}
                  <button
                    onClick={() => setFilterStatus("all")}
                    className="ml-1.5 hover:text-red-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              )}
              {filterAge !== "all" && (
                <Badge variant="outline" className="bg-purple-50 border-purple-300">
                  Edad: {
                    filterAge === "puppy" ? "Cachorro/Cría" :
                    filterAge === "young" ? "Joven" :
                    filterAge === "adult" ? "Adulto" :
                    filterAge === "senior" ? "Senior" :
                    "Sin edad"
                  }
                  <button
                    onClick={() => setFilterAge("all")}
                    className="ml-1.5 hover:text-red-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              )}
              {(filterSpecies !== "all" || filterStatus !== "all" || filterAge !== "all") && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setFilterSpecies("all");
                    setFilterStatus("all");
                    setFilterAge("all");
                  }}
                  className="h-6 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  Limpiar todos los filtros
                </Button>
              )}
            </div>
          </div>

          <div className="border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-orange-50">
                    <TableHead>Nombre</TableHead>
                    <TableHead>Especie / Raza</TableHead>
                    <TableHead className="hidden md:table-cell">Dueño</TableHead>
                    <TableHead className="hidden lg:table-cell">Sexo</TableHead>
                    <TableHead className="hidden lg:table-cell">Edad</TableHead>
                    <TableHead className="text-center">Estado</TableHead>
                    <TableHead className="text-center">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPets.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                        No se encontraron mascotas
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredPets.map((pet) => {
                      const speciesName = (pet as any).species || "Desconocido";
                      const breedName = (pet as any).race || "";
                      const speciesId = (pet as any).speciesId || "";

                      return (
                        <TableRow
                          key={pet.id}
                          className={`hover:bg-orange-50/50 transition-colors ${pet.deceased ? "opacity-60" : ""}`}
                        >
                          <TableCell className="font-medium">
                            {pet.name}
                            {pet.deceased && (
                              <span title="Dar de baja">
                                <Archive className="inline h-4 w-4 ml-1.5 text-gray-500" />
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              <Badge className={getSpeciesBadgeColor(speciesId)}>
                                {speciesName}
                              </Badge>
                              {breedName && (
                                <span className="text-xs text-gray-500">{breedName}</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            {getClientName(pet.clientId)}
                            {pet.ownershipHistory && pet.ownershipHistory.length > 0 && (
                              <span
                                title="Tiene historial de cambios de dueño"
                                onClick={() => {
                                  setSelectedPet(pet);
                                  setHistoryDialogOpen(true);
                                }}
                              >
                                <History className="inline h-3.5 w-3.5 ml-1.5 text-blue-500 cursor-pointer" />
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell">
                            <Badge variant="outline" className={pet.sex === "Macho" ? "border-blue-300 text-blue-700" : "border-pink-300 text-pink-700"}>
                              {pet.sex || "-"}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden lg:table-cell text-sm text-gray-600">
                            {calculateAge(pet.birthDate)}
                          </TableCell>
                          <TableCell className="text-center">
                            {pet.deleted ? (
                              <Badge variant="outline" className="border-red-300 text-red-700">
                                <Trash2 className="h-3 w-3 mr-1" />
                                Eliminada
                              </Badge>
                            ) : pet.deceased ? (
                              <Badge variant="outline" className="border-gray-400 text-gray-700">
                                <Archive className="h-3 w-3 mr-1" />
                                Baja
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="border-green-400 text-green-700">
                                Activa
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-1">
                              {pet.deleted ? (
                                <>
                                  {canManage && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => handleReactivatePet(pet)}
                                      className="text-green-600 hover:text-green-700 hover:bg-green-50"
                                      title="Reactivar"
                                    >
                                      <RotateCcw className="h-4 w-4" />
                                    </Button>
                                  )}
                                  {isAdmin && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => setPetToPurge(pet)}
                                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                      title="Eliminar definitivamente"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  )}
                                </>
                              ) : (
                                <>
                                  {canManage && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => selectPet(pet)}
                                      className="text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                                      title="Editar"
                                    >
                                      <Edit className="h-4 w-4" />
                                    </Button>
                                  )}
                                  {canManage && !pet.deceased && (
                                    <>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => {
                                          setSelectedPet(pet);
                                          setChangeOwnerDialogOpen(true);
                                        }}
                                        className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                        title="Cambiar dueño"
                                      >
                                        <Users className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => {
                                          setSelectedPet(pet);
                                          setDeceasedDialogOpen(true);
                                        }}
                                        className="text-gray-600 hover:text-gray-700 hover:bg-gray-50"
                                        title="Dar de baja"
                                      >
                                        <Archive className="h-4 w-4" />
                                      </Button>
                                    </>
                                  )}
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-3 text-sm text-gray-600">
              <span>
                Mostrando: <span className="text-orange-700 font-medium">{filteredPets.length}</span> mascota{filteredPets.length !== 1 ? "s" : ""}
              </span>
              <span className="text-gray-400">|</span>
              <span>
                Total en sistema: <span className="text-gray-700 font-medium">{pets.filter(p => !p.deleted).length}</span>
              </span>
              <span className="text-gray-400">|</span>
              <span>
                Activas: <span className="text-green-700 font-medium">{pets.filter(p => !p.deleted && !(p as any).deceased).length}</span>
              </span>
              <span className="text-gray-400">|</span>
              <span>
                Bajas: <span className="text-gray-500 font-medium">{pets.filter(p => (p as any).deceased).length}</span>
              </span>
            </div>
            {(filterSpecies !== "all" || filterStatus !== "all" || filterAge !== "all" || searchTerm) && (
              <Badge variant="outline" className="bg-orange-50 border-orange-300 text-orange-700">
                Filtros aplicados
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>
      </TabsContent>
      </Tabs>

      {/* Dialog: Eliminar */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta mascota?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminará permanentemente la ficha de{" "}
              <span className="font-semibold">{selectedPet?.name}</span> del sistema.
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

      {/* Dialog: Eliminar definitivamente (borrado físico) */}
      <AlertDialog open={!!petToPurge} onOpenChange={(open) => !open && setPetToPurge(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-700">
              <ShieldAlert className="h-5 w-5" />
              Eliminar definitivamente
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción es <span className="font-semibold">permanente e irreversible</span>. Se
              borrará de la base de datos la ficha de{" "}
              <span className="font-semibold">{petToPurge?.name}</span>. No podrá recuperarse.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handlePurgePet} className="bg-red-600 hover:bg-red-700">
              Eliminar definitivamente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog: Dar de baja */}
      <Dialog open={deceasedDialogOpen} onOpenChange={setDeceasedDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-gray-800">
              <Archive className="h-5 w-5" />
              Dar de baja: {selectedPet?.name}
            </DialogTitle>
            <DialogDescription>
              Registre la fecha y motivo de la baja. Esta información quedará en el historial.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>
                Fecha de Baja <span className="text-red-500">*</span>
              </Label>
              <Popover open={deceasedCalendarOpen} onOpenChange={setDeceasedCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(deceasedForm.deceasedDate, "PPP", { locale: es })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    locale={es}
                    selected={deceasedForm.deceasedDate}
                    defaultMonth={deceasedForm.deceasedDate}
                    onSelect={(date) => {
                      if (date) {
                        setDeceasedForm(prev => ({ ...prev, deceasedDate: date }));
                        setDeceasedCalendarOpen(false);
                      }
                    }}
                    // Una baja no puede registrarse en el futuro
                    disabled={{ after: new Date() }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label htmlFor="deceasedReason">
                Motivo <span className="text-red-500">*</span>
              </Label>
              <Input
                id="deceasedReason"
                value={deceasedForm.deceasedReason}
                onChange={(e) => setDeceasedForm(prev => ({ ...prev, deceasedReason: e.target.value }))}
                placeholder="Ej: Enfermedad, vejez, accidente..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="deceasedNotes">Observaciones Adicionales (opcional)</Label>
              <Textarea
                id="deceasedNotes"
                value={deceasedForm.deceasedNotes}
                onChange={(e) => setDeceasedForm(prev => ({ ...prev, deceasedNotes: e.target.value }))}
                placeholder="Detalles adicionales sobre la baja..."
                rows={3}
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                onClick={handleMarkAsDeceased}
                className="flex-1 bg-gray-600 hover:bg-gray-700"
              >
                <Archive className="mr-2 h-4 w-4" />
                Confirmar Fallecimiento
              </Button>
              <Button
                onClick={() => {
                  setDeceasedDialogOpen(false);
                  setDeceasedForm({ deceasedDate: new Date(), deceasedReason: "", deceasedNotes: "" });
                }}
                variant="outline"
                className="flex-1"
              >
                Cancelar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog: Cambiar Dueño */}
      <Dialog open={changeOwnerDialogOpen} onOpenChange={setChangeOwnerDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-blue-800">
              <Users className="h-5 w-5" />
              Cambiar Dueño: {selectedPet?.name}
            </DialogTitle>
            <DialogDescription>
              Seleccione el nuevo propietario. Este cambio quedará registrado en el historial.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-sm text-blue-700">
                <strong>Dueño actual:</strong> {selectedPet && getClientName(selectedPet.clientId)}
              </p>
            </div>

            <div className="space-y-2">
              <Label>
                Nuevo Dueño <span className="text-red-500">*</span>
              </Label>
              <Combobox
                options={clientOptions.filter(o => o.value !== selectedPet?.clientId)}
                value={changeOwnerForm.newClientId}
                onChange={(value) => setChangeOwnerForm(prev => ({ ...prev, newClientId: value }))}
                placeholder="Seleccione nuevo dueño"
                searchPlaceholder="Buscar por nombre, DNI/CUIT o teléfono…"
                emptyMessage="No se encontraron clientes."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ownerChangeReason">Motivo del Cambio (opcional)</Label>
              <Input
                id="ownerChangeReason"
                value={changeOwnerForm.reason}
                onChange={(e) => setChangeOwnerForm(prev => ({ ...prev, reason: e.target.value }))}
                placeholder="Ej: Donación, venta, adopción..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ownerChangeNotes">Observaciones (opcional)</Label>
              <Textarea
                id="ownerChangeNotes"
                value={changeOwnerForm.notes}
                onChange={(e) => setChangeOwnerForm(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Detalles adicionales sobre el cambio..."
                rows={2}
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                onClick={handleChangeOwner}
                disabled={!changeOwnerForm.newClientId}
                className="flex-1 bg-blue-600 hover:bg-blue-700"
              >
                <Users className="mr-2 h-4 w-4" />
                Confirmar Cambio
              </Button>
              <Button
                onClick={() => {
                  setChangeOwnerDialogOpen(false);
                  setChangeOwnerForm({ newClientId: "", reason: "", notes: "" });
                }}
                variant="outline"
                className="flex-1"
              >
                Cancelar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog: Historial de Cambios de Dueño */}
      <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-800">
              <History className="h-5 w-5" />
              Historial de Cambios de Dueño: {selectedPet?.name}
            </DialogTitle>
            <DialogDescription>
              Registro completo de todos los cambios de propietario
            </DialogDescription>
          </DialogHeader>

          {selectedPet?.ownershipHistory && selectedPet.ownershipHistory.length > 0 ? (
            <div className="space-y-3 pt-2">
              {selectedPet.ownershipHistory.map((change, index) => (
                <div key={change.id} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex items-start justify-between mb-2">
                    <Badge variant="outline" className="text-xs">
                      Cambio #{selectedPet.ownershipHistory!.length - index}
                    </Badge>
                    <span className="text-xs text-gray-500">
                      {format(new Date(change.changeDate), "dd/MM/yyyy HH:mm", { locale: es })}
                    </span>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <UserX className="h-4 w-4 text-red-500" />
                      <span className="text-gray-600">Anterior:</span>
                      <span className="font-medium">{change.previousClientName}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-green-500" />
                      <span className="text-gray-600">Nuevo:</span>
                      <span className="font-medium">{change.newClientName}</span>
                    </div>
                    {change.reason && (
                      <div className="flex items-start gap-2 mt-2 pt-2 border-t">
                        <FileText className="h-4 w-4 text-gray-400 mt-0.5" />
                        <div className="flex-1">
                          <span className="text-gray-600 text-xs">Motivo:</span>
                          <p className="text-gray-800">{change.reason}</p>
                        </div>
                      </div>
                    )}
                    {change.notes && (
                      <p className="text-xs text-gray-500 italic mt-1">{change.notes}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <History className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p>No hay historial de cambios de dueño</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}