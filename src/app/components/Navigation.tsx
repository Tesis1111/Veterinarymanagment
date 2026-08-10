import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Dog, Users, PawPrint, FileText, Calendar, Shield, Menu, User, LogOut, Settings, Phone, Clock, ClipboardList, Mail, LayoutDashboard, Settings2 } from "lucide-react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle, SheetDescription } from "./ui/sheet";
import { ROLE_META } from "../services/userService";

type ActiveModule = "dashboard" | "clients" | "pets" | "medical" | "appointments" | "users" | "audit" | "reports" | "profile" | "business_hours" | "parametros";

interface NavigationProps {
  activeModule: ActiveModule;
  setActiveModule: (module: ActiveModule) => void;
}

export default function Navigation({ activeModule, setActiveModule }: NavigationProps) {
  const { user, logout, hasPermission, isAdmin } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userPanelOpen, setUserPanelOpen] = useState(false);

  const navItems = [
    {
      id: "dashboard" as ActiveModule,
      label: "Inicio",
      icon: LayoutDashboard,
      show: true
    },
    {
      id: "pets" as ActiveModule,
      label: "Mascotas",
      icon: PawPrint,
      show: hasPermission("manage_pets")
    },
    {
      id: "clients" as ActiveModule,
      label: "Clientes",
      icon: Users,
      show: hasPermission("manage_clients")
    },
    {
      id: "medical" as ActiveModule,
      label: "Historia Clínica",
      icon: FileText,
      show: hasPermission("view_medical_history")
    },
    {
      id: "appointments" as ActiveModule,
      label: "Calendario turnos",
      icon: Calendar,
      show: hasPermission("view_appointments")
    },
    {
      id: "users" as ActiveModule,
      label: "Seguridad",
      icon: Shield,
      show: isAdmin
    },
    {
      id: "business_hours" as ActiveModule,
      label: "Horarios de Atención",
      icon: Clock,
      show: isAdmin
    },
    {
      id: "parametros" as ActiveModule,
      label: "Parámetros",
      icon: Settings2,
      show: isAdmin
    }
  ];

  const handleNavigation = (module: ActiveModule) => {
    setActiveModule(module);
    setMobileMenuOpen(false);
  };

  const handleLogout = async () => {
    setUserPanelOpen(false);
    await logout();
  };

  return (
    <nav className="bg-white border-b border-orange-200 shadow-sm sticky top-0 z-50">
      <div className="container mx-auto px-3 sm:px-4 md:px-6">
        <div className="flex items-center justify-between h-14 md:h-16">
          {/* Logo - Clickeable para volver al inicio */}
          <button 
            onClick={() => handleNavigation("dashboard")}
            className="flex items-center gap-2 md:gap-3 hover:opacity-80 transition-opacity"
          >
            <div className="bg-gradient-to-br from-orange-500 to-orange-600 p-1.5 md:p-2 rounded-xl shadow-md">
              <Dog className="h-5 w-5 md:h-6 md:w-6 text-white" />
            </div>
            <div className="hidden sm:block text-left">
              <h2 className="text-orange-800 text-base md:text-lg leading-tight">Veterinaria Leo</h2>
              <p className="text-xs text-orange-600">Sistema de Gestión</p>
            </div>
          </button>

          {/* Navigation Items - Desktop */}
          <div className="hidden lg:flex items-center gap-1 xl:gap-2">
            {navItems.map(
              (item) =>
                item.show && (
                  <Button
                    key={item.id}
                    variant={activeModule === item.id ? "default" : "ghost"}
                    onClick={() => handleNavigation(item.id)}
                    className={
                      activeModule === item.id
                        ? "bg-gradient-to-r from-orange-500 to-orange-600 text-white hover:from-orange-600 hover:to-orange-700"
                        : "text-gray-700 hover:bg-orange-50 hover:text-orange-700"
                    }
                    size="sm"
                  >
                    <item.icon className="h-4 w-4 mr-1.5" />
                    <span className="hidden xl:inline">{item.label}</span>
                  </Button>
                )
            )}
          </div>

          {/* Mobile Menu Button */}
          <div className="lg:hidden">
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="border-orange-300">
                  <Menu className="h-4 w-4" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64">
                <SheetHeader>
                  <SheetTitle className="text-orange-800">Menú de Navegación</SheetTitle>
                  <SheetDescription>
                    Selecciona una sección
                  </SheetDescription>
                </SheetHeader>
                <div className="flex flex-col gap-2 mt-6">
                  {navItems.map(
                    (item) =>
                      item.show && (
                        <Button
                          key={item.id}
                          variant={activeModule === item.id ? "default" : "ghost"}
                          onClick={() => handleNavigation(item.id)}
                          className={
                            activeModule === item.id
                              ? "justify-start bg-gradient-to-r from-orange-500 to-orange-600 text-white"
                              : "justify-start text-gray-700 hover:bg-orange-50"
                          }
                        >
                          <item.icon className="h-4 w-4 mr-2" />
                          {item.label}
                        </Button>
                      )
                  )}
                </div>
              </SheetContent>
            </Sheet>
          </div>

          {/* User Panel - Lateral Derecho */}
          <Sheet open={userPanelOpen} onOpenChange={setUserPanelOpen}>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="border-orange-300 hover:bg-orange-50 hover:border-orange-400 transition-colors flex items-center gap-2"
              >
                <User className="h-4 w-4" />
                <span className="hidden md:inline text-sm">{user?.fullName?.split(' ')[0]}</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-80 sm:w-96">
              <SheetHeader>
                <SheetTitle className="text-orange-800">Mi Cuenta</SheetTitle>
                <SheetDescription>
                  Información del usuario y configuración
                </SheetDescription>
              </SheetHeader>
              
              <div className="mt-6 space-y-4">
                {/* User Info Card */}
                <div className="p-4 bg-gradient-to-r from-orange-50 to-white rounded-lg border border-orange-200">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="bg-gradient-to-br from-orange-500 to-orange-600 p-3 rounded-full">
                      <User className="h-6 w-6 text-white" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-gray-800">{user?.fullName}</p>
                      {user?.roleName && ROLE_META[user.roleName] ? (
                        <Badge className={`${ROLE_META[user.roleName].bgColor} ${ROLE_META[user.roleName].color} mt-1 border`}>
                          {ROLE_META[user.roleName].displayName}
                        </Badge>
                      ) : (
                        <Badge className="bg-gray-100 text-gray-700 mt-1">
                          {user?.roleId ?? "Usuario"}
                        </Badge>
                      )}
                    </div>
                  </div>
                  
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-gray-600">
                      <Mail className="h-4 w-4" />
                      <span className="break-all">{user?.email}</span>
                    </div>
                    {user?.phone && (
                      <div className="flex items-center gap-2 text-gray-600">
                        <Phone className="h-4 w-4" />
                        <span>{user.phone}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-700 mb-2">Acciones Rápidas</p>
                  
                  <Button
                    variant="outline"
                    className="w-full justify-start border-orange-300 hover:bg-orange-50"
                    onClick={() => {
                      handleNavigation("profile");
                      setUserPanelOpen(false);
                    }}
                  >
                    <User className="h-4 w-4 mr-2" />
                    Mi Perfil
                  </Button>

                  <Button
                    variant="outline"
                    className="w-full justify-start border-orange-300 hover:bg-orange-50"
                    onClick={() => {
                      handleNavigation("dashboard");
                      setUserPanelOpen(false);
                    }}
                  >
                    <LayoutDashboard className="h-4 w-4 mr-2" />
                    Ir al Inicio
                  </Button>

                  {isAdmin && (
                    <Button
                      variant="outline"
                      className="w-full justify-start border-orange-300 hover:bg-orange-50"
                      onClick={() => {
                        handleNavigation("users");
                        setUserPanelOpen(false);
                      }}
                    >
                      <Settings className="h-4 w-4 mr-2" />
                      Administrar Usuarios
                    </Button>
                  )}

                  {isAdmin && (
                    <Button
                      variant="outline"
                      className="w-full justify-start border-orange-300 hover:bg-orange-50"
                      onClick={() => {
                        handleNavigation("audit");
                        setUserPanelOpen(false);
                      }}
                    >
                      <ClipboardList className="h-4 w-4 mr-2" />
                      Auditoría del Sistema
                    </Button>
                  )}
                </div>

                {/* Logout Button */}
                <div className="pt-4 border-t">
                  <Button
                    variant="destructive"
                    className="w-full"
                    onClick={handleLogout}
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    Cerrar Sesión
                  </Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </nav>
  );
}