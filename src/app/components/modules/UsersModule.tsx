import { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import { User, DoctorPerfil, ProfesionParametro } from "../../types";
import { suscribirProfesiones } from "../../services/parametrosService";
import { db, FIREBASE_CONFIGURED } from "../../firebase/config";
import { collection, onSnapshot, Timestamp } from "firebase/firestore";
import {
  traerUsuarios,
  registrarUsuario,
  modificarUsuario,
  desactivarUsuario,
  reactivarUsuario,
  eliminarUsuarioFisico,
  validarUnicidadUsuario,
  actualizarPasswordUsuario,
} from "../../services/usuarioService";
import { asignarRolSeguro } from "../../services/userService";
import { traerTodosLosDoctores } from "../../services/doctorService";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Switch } from "../ui/switch";
import { Badge } from "../ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../ui/alert-dialog";
import {
  Shield, UserPlus, Save, X, Edit, Clock, Trash2,
  CheckCircle2, Users, Eye, EyeOff, Info, Stethoscope, PartyPopper,
  RotateCcw, Ban, ShieldAlert
} from "lucide-react";
import { toast } from "sonner";
import { useSuccessPopup } from "../../context/SuccessPopupContext";

// ══════════════════════════════════════════════
// TIPOS Y CONSTANTES
// ══════════════════════════════════════════════
type RoleType = "admin" | "veterinario" | "recepcionista" | "peluquero";

const rolePermissionsMap: Record<RoleType, { label: string; description: string; color: string }[]> = {
  admin: [
    { label: "Gestionar Clientes", description: "Crear, editar y eliminar clientes", color: "bg-orange-100 text-orange-800" },
    { label: "Gestionar Mascotas", description: "Crear, editar y eliminar mascotas", color: "bg-orange-100 text-orange-800" },
    { label: "Ver Historial Clínico", description: "Consultar historiales médicos", color: "bg-orange-100 text-orange-800" },
    { label: "Gestionar Historial", description: "Agregar y editar registros médicos", color: "bg-orange-100 text-orange-800" },
    { label: "Ver Turnos", description: "Consultar agenda de turnos", color: "bg-orange-100 text-orange-800" },
    { label: "Gestionar Turnos", description: "Crear, editar y cancelar turnos", color: "bg-orange-100 text-orange-800" },
    { label: "Gestionar Usuarios", description: "Crear y editar usuarios del sistema", color: "bg-orange-100 text-orange-800" },
    { label: "Ver Auditoría", description: "Acceso al log de auditoría completo", color: "bg-orange-100 text-orange-800" },
    { label: "Configuración del Sistema", description: "Gestionar configuraciones globales", color: "bg-orange-100 text-orange-800" },
  ],
  veterinario: [
    { label: "Gestionar Clientes", description: "Crear, editar y eliminar clientes", color: "bg-blue-100 text-blue-800" },
    { label: "Gestionar Mascotas", description: "Crear, editar y eliminar mascotas", color: "bg-blue-100 text-blue-800" },
    { label: "Ver Historial Clínico", description: "Consultar historiales médicos", color: "bg-blue-100 text-blue-800" },
    { label: "Gestionar Historial", description: "Agregar y editar registros médicos", color: "bg-blue-100 text-blue-800" },
    { label: "Ver Turnos", description: "Consultar agenda de turnos", color: "bg-blue-100 text-blue-800" },
    { label: "Gestionar Turnos", description: "Confirmar y completar sus turnos", color: "bg-blue-100 text-blue-800" },
  ],
  recepcionista: [
    { label: "Gestionar Clientes", description: "Crear, editar y eliminar clientes", color: "bg-green-100 text-green-800" },
    { label: "Gestionar Mascotas", description: "Crear, editar y eliminar mascotas", color: "bg-green-100 text-green-800" },
    { label: "Ver Historial Clínico", description: "Consultar historiales (solo lectura)", color: "bg-green-100 text-green-800" },
    { label: "Ver Turnos", description: "Consultar agenda de turnos", color: "bg-green-100 text-green-800" },
    { label: "Gestionar Turnos", description: "Crear, editar y cancelar turnos", color: "bg-green-100 text-green-800" },
  ],
  peluquero: [
    { label: "Gestionar Clientes", description: "Ver datos de clientes", color: "bg-purple-100 text-purple-800" },
    { label: "Gestionar Mascotas", description: "Ver fichas de mascotas", color: "bg-purple-100 text-purple-800" },
    { label: "Ver Turnos", description: "Ver turnos de peluquería asignados", color: "bg-purple-100 text-purple-800" },
    { label: "Gestionar Turnos (Peluquería)", description: "Confirmar y completar turnos de peluquería", color: "bg-purple-100 text-purple-800" },
  ],
};

// roleInfo is derived from ROLE_META (imported from userService) for consistency
const roleInfo: Record<RoleType, { displayName: string; color: string; description: string }> = {
  admin: { displayName: "Administrador", color: "bg-orange-100 text-orange-800 border-orange-300", description: "Acceso completo al sistema" },
  veterinario: { displayName: "Veterinario", color: "bg-blue-100 text-blue-800 border-blue-300", description: "Gestión clínica y de turnos" },
  recepcionista: { displayName: "Recepcionista", color: "bg-green-100 text-green-800 border-green-300", description: "Atención al cliente y turnos" },
  peluquero: { displayName: "Peluquero", color: "bg-purple-100 text-purple-800 border-purple-300", description: "Servicios de peluquería" },
};

// ══════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ══════════════════════════════════════════════
export default function UsersModule() {
  const { user: currentUser, isAdmin } = useAuth();
  const { showSuccess } = useSuccessPopup();

  // ── Estado usuarios ──────────────────────────────────────
  const [users, setUsers] = useState<User[]>([]);
  const [doctoresFirestore, setDoctoresFirestore] = useState<DoctorPerfil[]>([]);
  const [profesiones, setProfesiones] = useState<ProfesionParametro[]>([]);

  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [deleteUserDialogOpen, setDeleteUserDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  // Filtro de estado de la lista de usuarios
  const [userStatusFilter, setUserStatusFilter] = useState<"activos" | "inactivos" | "todos">("activos");
  const [isSaving, setIsSaving] = useState(false);
  const [lastCreated, setLastCreated] = useState<{ name: string; role: string } | null>(null);
  const [formData, setFormData] = useState({
    username: "",
    password: "",
    // Nombre y apellido separados (el fullName se arma al guardar)
    nombre: "",
    apellido: "",
    fullName: "",
    role: "recepcionista" as RoleType,
    email: "",
    phone: "",
    sexo: "" as "" | "Masculino" | "Femenino" | "Prefiero no decirlo" | "Otro",
    domicilio: "",
    active: true,
    // ── Datos profesionales (independientes del Rol) ──
    // Si `profesion` está definida, el usuario es un profesional y se crea/sincroniza
    // automáticamente su perfil en `doctores`. La profesión proviene de Parámetros.
    profesion: "",
    licenseNumber: "",
  });

  // ── Carga inicial ──────────────────────────────────────
  useEffect(() => {
    // Real-time profesiones
    const unsubProf = suscribirProfesiones(setProfesiones);

    if (FIREBASE_CONFIGURED && db) {
      // Real-time users list
      const unsubUsers = onSnapshot(
        collection(db, "usuarios"),
        (snap) => {
          const list: User[] = snap.docs.map(d => {
            const data = d.data();
            const roleName = (data.roleName ?? data.roleId ?? "recepcionista") as User["roleName"];
            return {
              id: d.id,
              username: data.username ?? "",
              email: data.email ?? "",
              fullName: data.fullName ?? "",
              roleId: data.roleId ?? roleName ?? "",
              roleName,
              permissions: data.permissions ?? [],
              phone: data.phone,
              active: data.active !== false,
              createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(),
            } as User;
          }).sort((a, b) => a.fullName.localeCompare(b.fullName, "es"));
          setUsers(list);
        },
        () => traerUsuarios().then(setUsers).catch(() => setUsers([]))
      );

      // Real-time doctors list (perfiles profesionales, para prellenar el form al editar)
      const unsubDoctors = onSnapshot(
        collection(db, "doctores"),
        (snap) => {
          const d = snap.docs.map(doc => {
            const data = doc.data();
            return {
              id: doc.id,
              userId: data.userId,
              fullName: data.fullName ?? data.name ?? "",
              profesion: data.profesion ?? "",
              specialty: data.specialty ?? "",
              licenseNumber: data.licenseNumber,
              phone: data.phone,
              available: data.available !== false,
              createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(),
            } as DoctorPerfil;
          }).sort((a, b) => a.fullName.localeCompare(b.fullName, "es"));
          setDoctoresFirestore(d);
        },
        () => traerTodosLosDoctores().then(setDoctoresFirestore).catch(() => setDoctoresFirestore([]))
      );

      return () => { unsubProf(); unsubUsers(); unsubDoctors(); };
    } else {
      traerUsuarios().then(setUsers).catch(() => setUsers([]));
      traerTodosLosDoctores().then(setDoctoresFirestore).catch(() => setDoctoresFirestore([]));
      return () => { unsubProf(); };
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
              <p>Solo los administradores pueden acceder al módulo de seguridad</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Helpers ──────────────────────────────────────
  const getRoleBadge = (role: string) => {
    const info = roleInfo[role as RoleType];
    return info ? <Badge className={info.color}>{info.displayName}</Badge> : <Badge>{role}</Badge>;
  };

  // ── Usuarios: acciones ──────────────────────────────────────
  const selectUser = (user: User) => {
    setSelectedUser(user);
    setIsEditing(true);
    setFormData({
      username: user.username,
      password: "",
      nombre: (user as any).nombre || user.fullName.split(" ")[0] || "",
      apellido: (user as any).apellido || user.fullName.split(" ").slice(1).join(" ") || "",
      fullName: user.fullName,
      role: (user.roleName ?? user.roleId ?? "recepcionista") as RoleType,
      email: user.email,
      phone: user.phone || "",
      sexo: ((user as any).sexo || "") as any,
      domicilio: (user as any).domicilio || "",
      active: user.active,
      profesion: doctoresFirestore.find(d => d.userId === user.id)?.profesion ?? "",
      licenseNumber: doctoresFirestore.find(d => d.userId === user.id)?.licenseNumber ?? "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSaveUser = async () => {
    // Build fullName from nombre + apellido
    const nombre = formData.nombre.trim();
    const apellido = formData.apellido.trim();
    const validationErrors: string[] = [];

    if (!nombre) validationErrors.push("El nombre es obligatorio.");
    if (!apellido) validationErrors.push("El apellido es obligatorio.");

    // Email: regex validation
    const emailRegex = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
    if (!formData.email) {
      validationErrors.push("El correo electrónico es obligatorio.");
    } else if (!emailRegex.test(formData.email.trim())) {
      validationErrors.push("El formato del correo electrónico no es válido.");
    }

    // Phone: digits, spaces, +, -, ()
    const phoneRegex = /^[\d\s\+\-\(\)\.]{7,20}$/;
    if (formData.phone && !phoneRegex.test(formData.phone.trim())) {
      validationErrors.push("El teléfono solo puede contener números, espacios y los signos +, -, (, ).");
    }

    // Domicilio: must not look like an email; minimum length if provided
    if (formData.domicilio) {
      if (emailRegex.test(formData.domicilio.trim())) {
        validationErrors.push("El campo Domicilio no puede contener un email. Ingresá una dirección postal.");
      } else if (formData.domicilio.trim().length < 5) {
        validationErrors.push("El domicilio debe tener al menos 5 caracteres.");
      } else if (formData.domicilio.trim().length > 120) {
        validationErrors.push("El domicilio no puede superar los 120 caracteres.");
      }
    }

    // Username: no spaces, no special chars other than . _ -
    if (formData.username.trim()) {
      const usernameRegex = /^[a-zA-Z0-9._\-]{3,30}$/;
      if (!usernameRegex.test(formData.username.trim())) {
        validationErrors.push("El nombre de usuario solo puede contener letras, números y los signos . _ - (3-30 caracteres).");
      }
    }

    // License number: alphanumeric if provided
    if (formData.licenseNumber && !/^[a-zA-Z0-9\s\-\.]{2,20}$/.test(formData.licenseNumber.trim())) {
      validationErrors.push("El número de matrícula tiene un formato inválido.");
    }

    if (!formData.role) validationErrors.push("El perfil/rol es obligatorio.");

    if (validationErrors.length > 0) {
      validationErrors.forEach(msg => toast.error(msg));
      return;
    }

    const fullName = apellido ? `${nombre} ${apellido}` : nombre;
    const username = formData.username.trim() || formData.email.split("@")[0];
    const resolvedFullName = fullName;
    const resolvedUsername = username;

    setIsSaving(true);
    try {
      // validarUnicidadUsuario — wrapped in main try/catch so any Firestore error is visible
      const uniqueCheck = await validarUnicidadUsuario(resolvedUsername, formData.email.trim(), selectedUser?.id);
      if (!uniqueCheck.valid) {
        toast.error(uniqueCheck.errors[0]?.message || "El usuario o email ya están en uso");
        return;
      }

      // Campos profesionales — la profesión (de Parámetros) es lo que define que
      // el usuario sea profesional. El servicio crea/sincroniza el perfil en `doctores`.
      const profesional = {
        ...(formData.profesion.trim() && { profesion: formData.profesion.trim() }),
        ...(formData.licenseNumber.trim() && { matricula: formData.licenseNumber.trim() }),
      };

      if (isEditing && selectedUser) {
        const updated = await modificarUsuario(selectedUser.id, {
          username: resolvedUsername,
          fullName: resolvedFullName,
          email: formData.email,
          phone: formData.phone,
          active: formData.active,
          roleId: formData.role,
          ...(formData.sexo && { sexo: formData.sexo }),
          ...(formData.domicilio && { domicilio: formData.domicilio }),
          nombre: formData.nombre.trim(),
          apellido: formData.apellido.trim(),
          ...profesional,
        } as any, currentUser?.id || "1");

        // If the role changed, use the secure role-assignment path
        if (selectedUser.roleName !== formData.role && currentUser) {
          await asignarRolSeguro(
            currentUser,
            selectedUser.id,
            formData.role as "admin" | "veterinario" | "recepcionista" | "peluquero"
          );
        }

        // If the password was specified in the edit form, update it!
        if (formData.password?.trim()) {
          if (formData.password.trim().length < 6) {
            toast.error("La contraseña debe tener al menos 6 caracteres (requisito de Firebase).");
            setIsSaving(false);
            return;
          }
          await actualizarPasswordUsuario(selectedUser.id, formData.password.trim());
        }

        if (!FIREBASE_CONFIGURED || !db) {
          setUsers(prev => prev.map(u => u.id === selectedUser.id ? updated : u));
        }
        showSuccess(`Usuario ${resolvedFullName} actualizado exitosamente.`);
      } else {
        if (!formData.password) { toast.error("La contraseña es obligatoria"); return; }
        if (formData.password.length < 6) { toast.error("La contraseña debe tener al menos 6 caracteres (requisito de Firebase)."); return; }

        const newUser = await registrarUsuario({
          username: resolvedUsername,
          password: formData.password,
          fullName: resolvedFullName,
          email: formData.email,
          phone: formData.phone,
          active: formData.active,
          roleId: formData.role,
          nombre: formData.nombre.trim(),
          apellido: formData.apellido.trim(),
          ...(formData.sexo && { sexo: formData.sexo }),
          ...(formData.domicilio && { domicilio: formData.domicilio }),
          ...profesional,
        } as any, currentUser?.id || "1");
        
        if (!FIREBASE_CONFIGURED || !db) {
          setUsers(prev => [...prev, newUser]);
        }

        if (formData.profesion.trim()) {
          showSuccess(`Usuario "${resolvedFullName}" creado como profesional (${formData.profesion.trim()}).`);
        } else {
          showSuccess(`Usuario "${resolvedFullName}" creado exitosamente.`);
        }
        setLastCreated({ name: resolvedFullName, role: formData.role });
      }
      handleCancelUser();
    } catch (err: any) {
      console.error("[UsersModule] handleSaveUser error:", err);
      const msg = err?.code === "auth/email-already-in-use"
        ? "El correo electrónico ya está registrado en Firebase Auth."
        : err?.code === "auth/weak-password"
          ? "La contraseña es muy débil. Usá al menos 6 caracteres."
          : err?.code === "permission-denied"
            ? "Sin permisos para realizar esta operación. Verificá que tu sesión de admin esté activa."
            : err?.message || "Error al guardar el usuario. Intente nuevamente.";
      toast.error(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelUser = () => {
    setFormData({ username: "", password: "", nombre: "", apellido: "", fullName: "", role: "recepcionista", email: "", phone: "", sexo: "", domicilio: "", active: true, profesion: "", licenseNumber: "" });
    setSelectedUser(null);
    setIsEditing(false);
    setShowPassword(false);
  };

  const handleDeactivateUser = async (u: User) => {
    if (u.id === currentUser?.id) { toast.error("No podés desactivar tu propia cuenta."); return; }
    try {
      await desactivarUsuario(u.id, currentUser?.id || "1");
      showSuccess(`Usuario ${u.fullName} dado de baja`);
    } catch {
      toast.error("Error al dar de baja el usuario.");
    }
  };

  const handleReactivateUser = async (u: User) => {
    try {
      await reactivarUsuario(u.id, currentUser?.id || "1");
      showSuccess(`Usuario ${u.fullName} reactivado`);
    } catch {
      toast.error("Error al reactivar el usuario.");
    }
  };

  const handlePurgeUser = async () => {
    if (!userToDelete) return;
    if (userToDelete.id === currentUser?.id) {
      toast.error("No podés eliminar tu propia cuenta.");
      setDeleteUserDialogOpen(false);
      setUserToDelete(null);
      return;
    }
    try {
      await eliminarUsuarioFisico(userToDelete.id);
      if (!FIREBASE_CONFIGURED || !db) {
        setUsers(prev => prev.filter(u => u.id !== userToDelete.id));
        setDoctoresFirestore(prev => prev.filter(d => d.userId !== userToDelete.id));
      }
      showSuccess(`Usuario ${userToDelete.fullName} eliminado definitivamente`);
    } catch {
      toast.error("Error al eliminar definitivamente el usuario.");
    }
    setDeleteUserDialogOpen(false);
    setUserToDelete(null);
  };

  const filteredUsers = users.filter(u => {
    if (userStatusFilter === "activos") return u.active;
    if (userStatusFilter === "inactivos") return !u.active;
    return true;
  });

  const currentRole = formData.role as RoleType;
  const rolePerms = rolePermissionsMap[currentRole] || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-orange-800 flex items-center gap-2">
          <Shield className="h-8 w-8" />
          Módulo de Seguridad
        </h1>
        <p className="text-gray-600 mt-1">Gestión de usuarios y roles del sistema</p>
      </div>

      {lastCreated && (
        <div className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-xl shadow-sm">
          <div className="p-2 bg-green-100 rounded-full flex-shrink-0">
            <PartyPopper className="h-5 w-5 text-green-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-green-800">¡Usuario creado exitosamente!</p>
            <p className="text-sm text-green-700 mt-0.5">
              <strong>{lastCreated.name}</strong> fue registrado como{" "}
              <strong>{roleInfo[lastCreated.role as RoleType]?.displayName || lastCreated.role}</strong>.
            </p>
          </div>
          <button onClick={() => setLastCreated(null)} className="text-green-400 hover:text-green-600 p-1 flex-shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ══ USUARIOS ══════════════════════════════════════════════ */}
      <div className="space-y-6">
            {/* ── Formulario de usuario ── */}
            <Card className="border-orange-200 shadow-md">
            <CardHeader className="bg-gradient-to-r from-orange-50 to-white">
              <CardTitle className="flex items-center gap-2 text-orange-800">
                <UserPlus className="h-5 w-5" />
                {isEditing ? "Editar Usuario" : "Nuevo Usuario"}
              </CardTitle>
              <CardDescription>
                Los permisos se asignan automáticamente según el rol seleccionado
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">

              {/* Campos requeridos */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                {/* Nombre */}
                <div className="space-y-2">
                  <Label htmlFor="nombre">Nombre <span className="text-red-500">*</span></Label>
                  <Input
                    id="nombre"
                    value={formData.nombre}
                    onChange={(e) => setFormData(p => ({ ...p, nombre: e.target.value }))}
                    placeholder="Ej: Juan"
                    autoFocus
                  />
                </div>

                {/* Apellido */}
                <div className="space-y-2">
                  <Label htmlFor="apellido">Apellido <span className="text-red-500">*</span></Label>
                  <Input
                    id="apellido"
                    value={formData.apellido}
                    onChange={(e) => setFormData(p => ({ ...p, apellido: e.target.value }))}
                    placeholder="Ej: Pérez"
                  />
                </div>

                {/* Email */}
                <div className="space-y-2">
                  <Label htmlFor="email">Correo electrónico (Mail) <span className="text-red-500">*</span></Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData(p => ({ ...p, email: e.target.value }))}
                    placeholder="usuario@veterinarialeo.com"
                  />
                </div>

                {/* Domicilio */}
                <div className="space-y-2">
                  <Label htmlFor="domicilio">Domicilio</Label>
                  <Input
                    id="domicilio"
                    value={formData.domicilio}
                    onChange={(e) => setFormData(p => ({ ...p, domicilio: e.target.value }))}
                    placeholder="Ej: Av. Corrientes 1234, CABA"
                  />
                </div>

                {/* Teléfono */}
                <div className="space-y-2">
                  <Label htmlFor="phone">Teléfono <span className="text-red-500">*</span></Label>
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => setFormData(p => ({ ...p, phone: e.target.value }))}
                    placeholder="+54 11 1234-5678"
                  />
                </div>

                {/* Sexo */}
                <div className="space-y-2">
                  <Label htmlFor="sexo">Sexo <span className="text-red-500">*</span></Label>
                  <Select value={formData.sexo} onValueChange={(v) => setFormData(p => ({ ...p, sexo: v as any }))}>
                    <SelectTrigger id="sexo"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Masculino">Masculino</SelectItem>
                      <SelectItem value="Femenino">Femenino</SelectItem>
                      <SelectItem value="Prefiero no decirlo">Prefiero no decirlo</SelectItem>
                      <SelectItem value="Otro">Otro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Contraseña */}
                <div className="space-y-2">
                  <Label htmlFor="password">
                    Contraseña {!isEditing && <span className="text-red-500">*</span>}
                    {isEditing && <span className="text-xs text-gray-400 font-normal"> (dejar vacío para no cambiar)</span>}
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={formData.password}
                      onChange={(e) => setFormData(p => ({ ...p, password: e.target.value }))}
                      placeholder="Mínimo 6 caracteres"
                      minLength={6}
                      className="flex-1"
                    />
                    <Button type="button" variant="outline" size="icon" onClick={() => setShowPassword(!showPassword)}>
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                {/* Perfil / Rol */}
                <div className="space-y-2">
                  <Label htmlFor="role">Perfil / Rol <span className="text-red-500">*</span></Label>
                  <Select
                    value={formData.role}
                    onValueChange={(v: RoleType) => setFormData(p => ({ ...p, role: v }))}
                  >
                    <SelectTrigger id="role"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Administrador</SelectItem>
                      <SelectItem value="veterinario">Veterinario</SelectItem>
                      <SelectItem value="recepcionista">Recepcionista</SelectItem>
                      <SelectItem value="peluquero">Peluquero</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-400">El rol determina los permisos de acceso al sistema.</p>
                </div>

                <div className="space-y-2">
                  <Label>Estado</Label>
                  <div className="flex items-center space-x-2 h-10">
                    <Switch
                      checked={formData.active}
                      onCheckedChange={(v) => setFormData(p => ({ ...p, active: v }))}
                    />
                    <Label className={formData.active ? "text-green-600" : "text-red-600"}>
                      {formData.active ? "Activo" : "Inactivo"}
                    </Label>
                  </div>
                </div>
              </div>

              {/* Perfil de Profesional — la Profesión (no el Rol) define al profesional */}
              <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4 space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <Stethoscope className="h-4 w-4 text-blue-600" />
                  <span className="text-sm font-semibold text-blue-800">Perfil del Profesional</span>
                  <span className="text-xs text-blue-600">(opcional — completá si el usuario es un profesional)</span>
                </div>
                <p className="text-xs text-blue-700/80">
                  Asigná una <strong>Profesión</strong> para que el usuario aparezca en los módulos funcionales
                  (Horarios, Turnos, Historia Clínica, Vacunación, Peluquería, Guardería). El <strong>Rol</strong> solo
                  controla los permisos y es independiente de la Profesión.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="profesion">Profesión</Label>
                    <Select
                      value={formData.profesion}
                      onValueChange={(v) => setFormData(p => ({ ...p, profesion: v }))}
                    >
                      <SelectTrigger id="profesion">
                        <SelectValue placeholder={profesiones.length === 0 ? "No hay profesiones configuradas" : "Sin profesión"} />
                      </SelectTrigger>
                      <SelectContent>
                        {profesiones.length === 0 ? (
                          <div className="px-3 py-4 text-sm text-gray-500 text-center">
                            No hay profesiones cargadas.
                            <br />
                            <span className="text-xs">Un admin debe agregarlas desde Parámetros → Profesiones.</span>
                          </div>
                        ) : profesiones.map(p => (
                          <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-gray-400">Se administran desde Parámetros.</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="licenseNumber">Matrícula (opcional)</Label>
                    <Input
                      id="licenseNumber"
                      value={formData.licenseNumber}
                      onChange={(e) => setFormData(p => ({ ...p, licenseNumber: e.target.value }))}
                      placeholder="Ej: MP 12345"
                    />
                  </div>
                </div>
              </div>

              {/* Permisos por rol (informativo) */}
              <div className="rounded-lg border border-orange-200 overflow-hidden">
                <div className="bg-orange-50 px-4 py-3 flex items-center gap-2">
                  <Shield className="h-4 w-4 text-orange-600" />
                  <span className="text-sm font-medium text-orange-800">
                    Permisos del rol: {roleInfo[currentRole]?.displayName}
                  </span>
                  <Badge className={roleInfo[currentRole]?.color + " ml-auto text-xs"}>
                    {roleInfo[currentRole]?.description}
                  </Badge>
                </div>
                <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {rolePerms.map((perm, idx) => (
                    <div key={idx} className="flex items-start gap-2 p-2 bg-white rounded border text-sm">
                      <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0 text-green-500" />
                      <div>
                        <p className="font-medium text-gray-800">{perm.label}</p>
                        <p className="text-xs text-gray-500">{perm.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="bg-amber-50 px-4 py-2 border-t border-amber-100">
                  <p className="text-xs text-amber-700 flex items-center gap-1.5">
                    <Info className="h-3.5 w-3.5" />
                    Los permisos se asignan automáticamente al guardar. No se pueden modificar individualmente.
                  </p>
                </div>
              </div>

              {/* Nota horarios */}
              {formData.profesion.trim() && (
                <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <Clock className="h-4 w-4 text-blue-600 flex-shrink-0" />
                  <p className="text-sm text-blue-700">
                    Este usuario es un <strong>profesional</strong>. Sus horarios de atención se configuran desde el módulo <strong>Horarios de Atención</strong>.
                  </p>
                </div>
              )}

              {/* Botones */}
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <Button
                  onClick={handleSaveUser}
                  disabled={isSaving}
                  className="flex-1 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 disabled:opacity-70"
                >
                  {isSaving ? (
                    <>
                      <span className="mr-2 h-4 w-4 animate-spin inline-block border-2 border-white border-t-transparent rounded-full" />
                      {isEditing ? "Actualizando..." : "Creando usuario..."}
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      {isEditing ? "Actualizar Usuario" : "Crear Usuario"}
                    </>
                  )}
                </Button>
                <Button onClick={handleCancelUser} disabled={isSaving} variant="outline" className="flex-1 border-orange-300 hover:bg-orange-50">
                  <X className="mr-2 h-4 w-4" />
                  Cancelar
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* ── Lista de usuarios ── */}
          <Card className="border-orange-200 shadow-md">
            <CardHeader className="bg-gradient-to-r from-orange-50 to-white">
              <CardTitle className="text-orange-800 flex items-center gap-2">
                <Users className="h-5 w-5" />
                Usuarios del Sistema
              </CardTitle>
              <CardDescription>
                {filteredUsers.length} de {users.length} usuario{users.length !== 1 ? "s" : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="mb-4 flex justify-end">
                <div className="flex gap-1 bg-orange-50 p-1 rounded-lg">
                  {([
                    { key: "activos", label: "Activos" },
                    { key: "inactivos", label: "Inactivos" },
                    { key: "todos", label: "Todos" },
                  ] as const).map(opt => (
                    <Button
                      key={opt.key}
                      size="sm"
                      variant={userStatusFilter === opt.key ? "default" : "ghost"}
                      className={userStatusFilter === opt.key ? "bg-orange-600 hover:bg-orange-700" : "text-orange-700 hover:bg-orange-100"}
                      onClick={() => setUserStatusFilter(opt.key)}
                    >
                      {opt.label}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="border rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-orange-50">
                        <TableHead>Usuario</TableHead>
                        <TableHead>Nombre Completo</TableHead>
                        <TableHead className="hidden md:table-cell">Email</TableHead>
                        <TableHead className="hidden sm:table-cell">Rol</TableHead>
                        <TableHead className="hidden lg:table-cell text-center">Estado</TableHead>
                        <TableHead className="text-center">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredUsers.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                            No hay usuarios en esta vista
                          </TableCell>
                        </TableRow>
                      ) : filteredUsers.map((user) => {
                        const isSelf = user.id === currentUser?.id;
                        return (
                          <TableRow key={user.id} className={`hover:bg-orange-50/50 ${!user.active ? "opacity-70" : ""}`}>
                            <TableCell className="font-medium">{user.username}</TableCell>
                            <TableCell>{user.fullName}</TableCell>
                            <TableCell className="hidden md:table-cell text-sm text-gray-600">{user.email}</TableCell>
                            <TableCell className="hidden sm:table-cell">{getRoleBadge(user.roleName ?? (user as any).roleId ?? "")}</TableCell>
                            <TableCell className="hidden lg:table-cell text-center">
                              <Badge className={user.active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}>
                                {user.active ? "Activo" : "Inactivo"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              <div className="flex items-center justify-center gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => selectUser(user)}
                                  className="text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                                  title="Editar"
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                {user.active ? (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleDeactivateUser(user)}
                                    disabled={isSelf}
                                    className="text-amber-600 hover:text-amber-700 hover:bg-amber-50 disabled:opacity-40"
                                    title={isSelf ? "No podés desactivar tu propia cuenta" : "Dar de baja"}
                                  >
                                    <Ban className="h-4 w-4" />
                                  </Button>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleReactivateUser(user)}
                                    className="text-green-600 hover:text-green-700 hover:bg-green-50"
                                    title="Reactivar"
                                  >
                                    <RotateCcw className="h-4 w-4" />
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => { setUserToDelete(user); setDeleteUserDialogOpen(true); }}
                                  disabled={isSelf}
                                  className="text-red-600 hover:text-red-700 hover:bg-red-50 disabled:opacity-40"
                                  title={isSelf ? "No podés eliminar tu propia cuenta" : "Eliminar definitivamente"}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </CardContent>
          </Card>
      </div>

      {/* AlertDialog: eliminar usuario definitivamente (borrado físico) */}
      <AlertDialog open={deleteUserDialogOpen} onOpenChange={(open) => { if (!open) { setDeleteUserDialogOpen(false); setUserToDelete(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-700">
              <ShieldAlert className="h-5 w-5" />
              Eliminar usuario definitivamente
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción es <span className="font-semibold">permanente e irreversible</span>. Se
              borrará de la base de datos el usuario{" "}
              <span className="font-semibold">{userToDelete?.fullName}</span> y su perfil profesional
              vinculado (si existiera).
              <br />
              <span className="text-xs text-gray-500 mt-2 inline-block">
                Nota: la cuenta de acceso en Firebase Authentication debe eliminarse por separado desde la consola de Firebase.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setDeleteUserDialogOpen(false); setUserToDelete(null); }}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction onClick={handlePurgeUser} className="bg-red-600 hover:bg-red-700">
              Eliminar definitivamente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
