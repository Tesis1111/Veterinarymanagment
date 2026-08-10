import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useAudit } from "../context/AuditContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import { User, Mail, Shield, CheckCircle, XCircle, Edit, Save, X, Phone } from "lucide-react";
import { toast } from "sonner";

const permissionLabels: Record<string, string> = {
  "manage_clients": "Gestionar Clientes",
  "manage_pets": "Gestionar Mascotas",
  "view_medical_history": "Ver Historial Clínico",
  "manage_medical_history": "Gestionar Historial",
  "view_appointments": "Ver Turnos",
  "manage_appointments": "Gestionar Turnos",
  "manage_users": "Gestionar Usuarios",
  "manage_permissions": "Gestionar Permisos"
};

export default function UserProfile() {
  const { user, isAdmin, updateUser } = useAuth();
  const { addLog } = useAudit();
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    fullName: user?.fullName || "",
    email: user?.email || "",
    phone: user?.phone || ""
  });

  if (!user) return null;

  const handleSave = async () => {
    if (!formData.fullName || !formData.email) {
      toast.error("Nombre y email son obligatorios");
      return;
    }

    await updateUser({
      fullName: formData.fullName,
      email: formData.email,
      phone: formData.phone
    });

    addLog("Actualizar", "Perfil", `Datos personales actualizados`);
    toast.success("Perfil actualizado exitosamente");
    setIsEditing(false);
  };

  const handleCancel = () => {
    setFormData({
      fullName: user.fullName,
      email: user.email,
      phone: user.phone || ""
    });
    setIsEditing(false);
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-orange-800 flex items-center gap-2 text-2xl md:text-3xl">
            <User className="h-6 w-6 md:h-8 md:w-8" />
            Mi Perfil
          </h1>
          <p className="text-gray-600 mt-1 text-sm md:text-base">Información de tu cuenta</p>
        </div>
        {!isEditing && (
          <Button
            onClick={() => setIsEditing(true)}
            className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700"
          >
            <Edit className="h-4 w-4 mr-2" />
            Editar Perfil
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        {/* Información Personal */}
        <Card className="border-orange-200 shadow-md lg:col-span-2">
          <CardHeader className="bg-gradient-to-r from-orange-50 to-white">
            <CardTitle className="text-orange-800">Información Personal</CardTitle>
            <CardDescription>
              {isEditing ? "Edita tus datos personales" : "Detalles de tu cuenta"}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            {isEditing ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="fullName">
                    Nombre Completo <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="fullName"
                    value={formData.fullName}
                    onChange={(e) => setFormData(prev => ({ ...prev, fullName: e.target.value }))}
                    placeholder="Tu nombre completo"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">
                    Correo Electrónico <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="tu@email.com"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Teléfono (opcional)</Label>
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                    placeholder="+54 11 1234-5678"
                  />
                </div>

                <div className="flex flex-col gap-3 pt-4">
                  <Button
                    onClick={handleSave}
                    className="w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700"
                  >
                    <Save className="h-4 w-4 mr-2" />
                    Guardar Cambios
                  </Button>
                  <Button
                    onClick={handleCancel}
                    variant="outline"
                    className="w-full border-orange-300 hover:bg-orange-50"
                  >
                    <X className="h-4 w-4 mr-2" />
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-3 md:p-4 bg-orange-50 rounded-lg">
                  <User className="h-5 w-5 text-orange-600 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm text-gray-600">Nombre Completo</p>
                    <p className="text-gray-800">{user.fullName}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 md:p-4 bg-orange-50 rounded-lg">
                  <Mail className="h-5 w-5 text-orange-600 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm text-gray-600">Correo Electrónico</p>
                    <p className="text-gray-800 break-all">{user.email}</p>
                  </div>
                </div>

                {user.phone && (
                  <div className="flex items-start gap-3 p-3 md:p-4 bg-orange-50 rounded-lg">
                    <Phone className="h-5 w-5 text-orange-600 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm text-gray-600">Teléfono</p>
                      <p className="text-gray-800">{user.phone}</p>
                    </div>
                  </div>
                )}

                <div className="flex items-start gap-3 p-3 md:p-4 bg-orange-50 rounded-lg">
                  <Shield className="h-5 w-5 text-orange-600 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm text-gray-600">Rol</p>
                    <div className="mt-1">
                      <Badge className={
                        isAdmin 
                          ? "bg-orange-100 text-orange-800" 
                          : "bg-blue-100 text-blue-800"
                      }>
                        {isAdmin ? "Administrador" : "Empleado"}
                      </Badge>
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 md:p-4 bg-orange-50 rounded-lg">
                  <div className="flex-1">
                    <p className="text-sm text-gray-600 mb-1">Estado de la Cuenta</p>
                    <div className="flex items-center gap-2">
                      {user.active ? (
                        <>
                          <CheckCircle className="h-5 w-5 text-green-600" />
                          <span className="text-green-700">Activa</span>
                        </>
                      ) : (
                        <>
                          <XCircle className="h-5 w-5 text-red-600" />
                          <span className="text-red-700">Inactiva</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Permisos */}
        <Card className="border-orange-200 shadow-md">
          <CardHeader className="bg-gradient-to-r from-orange-50 to-white">
            <CardTitle className="text-orange-800">Permisos</CardTitle>
            <CardDescription>Accesos habilitados</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            {isAdmin ? (
              <div className="p-3 md:p-4 bg-orange-50 rounded-lg border border-orange-200">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="h-5 w-5 text-orange-600" />
                  <p className="text-orange-800">Acceso Total</p>
                </div>
                <p className="text-sm text-gray-600">
                  Como administrador, tienes acceso completo a todas las funciones del sistema.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {(user.permissions ?? []).map(permission => (
                  <div
                    key={permission}
                    className="flex items-center gap-2 p-2 bg-orange-50 rounded border border-orange-100"
                  >
                    <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
                    <span className="text-sm text-gray-700">
                      {permissionLabels[permission] || permission}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Información del Sistema */}
      <Card className="border-orange-200 shadow-md">
        <CardHeader className="bg-gradient-to-r from-orange-50 to-white">
          <CardTitle className="text-orange-800">Información del Sistema</CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
            <div className="p-3 md:p-4 bg-orange-50 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">Usuario</p>
              <p className="text-gray-800">{user.username}</p>
            </div>
            <div className="p-3 md:p-4 bg-orange-50 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">ID de Usuario</p>
              <p className="text-gray-800 font-mono text-sm">{user.id}</p>
            </div>
            <div className="p-3 md:p-4 bg-orange-50 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">Total de Permisos</p>
              <p className="text-gray-800">{(user.permissions ?? []).length}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {!isAdmin && (
        <div className="p-3 md:p-4 bg-amber-50 rounded-lg border border-amber-200">
          <p className="text-sm text-amber-800">
            <strong>Nota:</strong> Si necesitas cambiar tus permisos o rol, 
            por favor contacta a un administrador del sistema.
          </p>
        </div>
      )}
    </div>
  );
}
