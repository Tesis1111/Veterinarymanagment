import { useState } from "react";
import { useUIPreferences } from "../context/UIPreferencesContext";
import { useAudit } from "../context/AuditContext";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Switch } from "./ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import {
  Type,
  Layout, 
  Eye, 
  Zap, 
  Palette,
  User,
  Box,
  RefreshCw
} from "lucide-react";
import { toast } from "sonner";

export default function AccessibilityButton() {
  const [isOpen, setIsOpen] = useState(false);
  const { preferences, updatePreference, resetPreferences } = useUIPreferences();
  const { addLog } = useAudit();

  const handlePreferenceChange = <K extends keyof typeof preferences>(
    key: K,
    value: typeof preferences[K],
    label: string
  ) => {
    updatePreference(key, value);
    addLog("Actualizar", "Preferencias UI", `${label}: ${value}`);
    toast.success("Preferencia actualizada");
  };

  const handleReset = () => {
    resetPreferences();
    addLog("Restablecer", "Preferencias UI", "Valores predeterminados");
    toast.success("Preferencias restablecidas");
  };

  return (
    <>
      {/* Botón flotante */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-full p-4 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-110 group"
        aria-label="Opciones de accesibilidad y personalización"
        title="Personalizar interfaz"
      >
        <Palette className="h-6 w-6 group-hover:rotate-12 transition-transform duration-300" />
      </button>

      {/* Modal de preferencias */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl text-orange-800 flex items-center gap-2">
              <Palette className="h-6 w-6" />
              Reglas APA - Personalización de Interfaz
            </DialogTitle>
            <DialogDescription>
              Configura la visualización del sistema según tus preferencias
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            
            {/* Tamaño de Fuente */}
            <div className="space-y-3 p-4 bg-orange-50 rounded-lg border border-orange-200">
              <div className="flex items-center gap-2">
                <Type className="h-5 w-5 text-orange-600" />
                <Label className="text-orange-900 font-semibold text-base">
                  Tamaño de Fuente
                </Label>
              </div>
              <Select 
                value={preferences.fontSize} 
                onValueChange={(value: "small" | "medium" | "large") => 
                  handlePreferenceChange("fontSize", value, "Tamaño de fuente")
                }
              >
                <SelectTrigger className="bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="small">Pequeño - Más contenido visible</SelectItem>
                  <SelectItem value="medium">Mediano - Recomendado ✓</SelectItem>
                  <SelectItem value="large">Grande - Mayor legibilidad</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-gray-600">
                Ajusta el tamaño del texto en toda la aplicación
              </p>
            </div>

            {/* Vista de Tablas */}
            <div className="space-y-3 p-4 bg-orange-50 rounded-lg border border-orange-200">
              <div className="flex items-center gap-2">
                <Layout className="h-5 w-5 text-orange-600" />
                <Label className="text-orange-900 font-semibold text-base">
                  Densidad de Tablas
                </Label>
              </div>
              <Select 
                value={preferences.tableViewMode} 
                onValueChange={(value: "compact" | "comfortable" | "expanded") => 
                  handlePreferenceChange("tableViewMode", value, "Vista de tablas")
                }
              >
                <SelectTrigger className="bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="compact">Compacta - Más filas visibles</SelectItem>
                  <SelectItem value="comfortable">Cómoda - Recomendado ✓</SelectItem>
                  <SelectItem value="expanded">Expandida - Más espacio y legibilidad</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-gray-600">
                Controla el espaciado vertical en las tablas de datos
              </p>
            </div>

            {/* Espaciado de Tarjetas */}
            <div className="space-y-3 p-4 bg-orange-50 rounded-lg border border-orange-200">
              <div className="flex items-center gap-2">
                <Box className="h-5 w-5 text-orange-600" />
                <Label className="text-orange-900 font-semibold text-base">
                  Espaciado de Tarjetas
                </Label>
              </div>
              <Select 
                value={preferences.cardSpacing} 
                onValueChange={(value: "tight" | "normal" | "relaxed") => 
                  handlePreferenceChange("cardSpacing", value, "Espaciado de tarjetas")
                }
              >
                <SelectTrigger className="bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tight">Ajustado - Información condensada</SelectItem>
                  <SelectItem value="normal">Normal - Recomendado ✓</SelectItem>
                  <SelectItem value="relaxed">Relajado - Más espacio visual</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-gray-600">
                Define el espaciado entre elementos en tarjetas y módulos
              </p>
            </div>

            {/* Switches */}
            <div className="space-y-4">
              
              {/* Modo Compacto */}
              <div className="flex items-center justify-between p-4 bg-orange-50 rounded-lg border border-orange-200">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Layout className="h-4 w-4 text-orange-600" />
                    <Label className="text-orange-900 font-medium cursor-pointer">
                      Modo Compacto Global
                    </Label>
                  </div>
                  <p className="text-sm text-gray-600">
                    Reduce todos los espaciados para maximizar el contenido visible
                  </p>
                </div>
                <Switch
                  checked={preferences.compactMode}
                  onCheckedChange={(checked) => 
                    handlePreferenceChange("compactMode", checked, "Modo compacto")
                  }
                />
              </div>

              {/* Mostrar Avatares */}
              <div className="flex items-center justify-between p-4 bg-orange-50 rounded-lg border border-orange-200">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <User className="h-4 w-4 text-orange-600" />
                    <Label className="text-orange-900 font-medium cursor-pointer">
                      Mostrar Avatares e Iconos
                    </Label>
                  </div>
                  <p className="text-sm text-gray-600">
                    Muestra iconos decorativos en listas, tablas y tarjetas
                  </p>
                </div>
                <Switch
                  checked={preferences.showAvatars}
                  onCheckedChange={(checked) => 
                    handlePreferenceChange("showAvatars", checked, "Mostrar avatares")
                  }
                />
              </div>

              {/* Animaciones */}
              <div className="flex items-center justify-between p-4 bg-orange-50 rounded-lg border border-orange-200">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Zap className="h-4 w-4 text-orange-600" />
                    <Label className="text-orange-900 font-medium cursor-pointer">
                      Animaciones y Transiciones
                    </Label>
                  </div>
                  <p className="text-sm text-gray-600">
                    Habilita efectos visuales suaves al interactuar con elementos
                  </p>
                </div>
                <Switch
                  checked={preferences.animationsEnabled}
                  onCheckedChange={(checked) => 
                    handlePreferenceChange("animationsEnabled", checked, "Animaciones")
                  }
                />
              </div>

              {/* Alto Contraste */}
              <div className="flex items-center justify-between p-4 bg-orange-50 rounded-lg border border-orange-200">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Eye className="h-4 w-4 text-orange-600" />
                    <Label className="text-orange-900 font-medium cursor-pointer">
                      Alto Contraste
                    </Label>
                  </div>
                  <p className="text-sm text-gray-600">
                    Aumenta el contraste de colores para mejorar la legibilidad
                  </p>
                </div>
                <Switch
                  checked={preferences.highContrast}
                  onCheckedChange={(checked) => 
                    handlePreferenceChange("highContrast", checked, "Alto contraste")
                  }
                />
              </div>

              {/* Reducir Movimiento */}
              <div className="flex items-center justify-between p-4 bg-orange-50 rounded-lg border border-orange-200">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Zap className="h-4 w-4 text-orange-600" />
                    <Label className="text-orange-900 font-medium cursor-pointer">
                      Reducir Movimiento
                    </Label>
                  </div>
                  <p className="text-sm text-gray-600">
                    Minimiza animaciones y movimientos (accesibilidad)
                  </p>
                </div>
                <Switch
                  checked={preferences.reduceMotion}
                  onCheckedChange={(checked) => 
                    handlePreferenceChange("reduceMotion", checked, "Reducir movimiento")
                  }
                />
              </div>

            </div>

            {/* Botón Reset */}
            <div className="pt-4 border-t border-orange-200">
              <Button
                onClick={handleReset}
                variant="outline"
                className="w-full border-orange-300 hover:bg-orange-50"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Restablecer a Valores Predeterminados
              </Button>
            </div>

            {/* Nota informativa */}
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-sm text-blue-900">
                <strong>💡 Información:</strong> Todos los cambios se aplican instantáneamente 
                y se guardan automáticamente en tu navegador. Las preferencias se mantienen 
                entre sesiones.
              </p>
            </div>

          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}