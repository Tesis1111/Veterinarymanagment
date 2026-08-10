import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Checkbox } from "../ui/checkbox";
import { FileSpreadsheet, Settings } from "lucide-react";
import { format } from "date-fns";
import { exportToExcel } from "../../utils/exportUtils";
import { toast } from "sonner";

interface CustomReportBuilderProps {
  clients: any[];
  pets: any[];
  medicalRecords: any[];
}

const AVAILABLE_COLUMNS = [
  { id: "client_name", label: "Cliente - Nombre", entity: "client" },
  { id: "client_dni", label: "Cliente - DNI/CUIT", entity: "client" },
  { id: "client_phone", label: "Cliente - Teléfono", entity: "client" },
  { id: "pet_name", label: "Mascota - Nombre", entity: "pet" },
  { id: "pet_species", label: "Mascota - Especie", entity: "pet" },
  { id: "pet_breed", label: "Mascota - Raza", entity: "pet" },
  { id: "pet_sex", label: "Mascota - Sexo", entity: "pet" },
  { id: "pet_status", label: "Mascota - Estado", entity: "pet" },
  { id: "record_date", label: "Historial - Fecha", entity: "record" },
  { id: "record_event", label: "Historial - Evento", entity: "record" },
  { id: "record_desc", label: "Historial - Descripción", entity: "record" },
];

export default function CustomReportBuilder({ clients, pets, medicalRecords }: CustomReportBuilderProps) {
  const [selectedColumns, setSelectedColumns] = useState<string[]>(["client_name", "pet_name", "pet_species"]);
  const [baseEntity, setBaseEntity] = useState<"pets" | "records">("pets");

  const toggleColumn = (colId: string) => {
    setSelectedColumns(prev => 
      prev.includes(colId) ? prev.filter(id => id !== colId) : [...prev, colId]
    );
  };

  const reportData = useMemo(() => {
    if (baseEntity === "pets") {
      return pets.map(pet => {
        const client = clients.find(c => c.id === pet.clientId) || {};
        return {
          client_name: client.fullName || "N/A",
          client_dni: client.dniCuit || "N/A",
          client_phone: client.phone || "N/A",
          pet_name: pet.name || "N/A",
          pet_species: pet.species || "N/A",
          pet_breed: pet.race || pet.breed || "N/A",
          pet_sex: pet.sex || "N/A",
          pet_status: pet.deceased ? "Baja" : "Viva",
          record_date: "N/A",
          record_event: "N/A",
          record_desc: "N/A",
        };
      });
    } else {
      return medicalRecords.map(record => {
        const pet = pets.find(p => p.id === record.petId) || {};
        const client = clients.find(c => c.id === pet.clientId) || {};
        return {
          client_name: client.fullName || "N/A",
          client_dni: client.dniCuit || "N/A",
          client_phone: client.phone || "N/A",
          pet_name: pet.name || "N/A",
          pet_species: pet.species || "N/A",
          pet_breed: pet.race || pet.breed || "N/A",
          pet_sex: pet.sex || "N/A",
          pet_status: pet.deceased ? "Baja" : "Viva",
          record_date: record.date ? format(new Date(record.date), "dd/MM/yyyy") : "N/A",
          record_event: record.eventType || "N/A",
          record_desc: record.description || "N/A",
        };
      });
    }
  }, [baseEntity, clients, pets, medicalRecords]);

  // Con la entidad "Mascotas" no hay una atención única por fila: las columnas de
  // Historial no aplican, así que se ocultan para no mostrar N/A confuso.
  const visibleColumns = baseEntity === "pets"
    ? AVAILABLE_COLUMNS.filter(c => c.entity !== "record")
    : AVAILABLE_COLUMNS;

  const activeCols = visibleColumns.filter(c => selectedColumns.includes(c.id));

  const handleExport = () => {
    if (activeCols.length === 0) {
      toast.error("Seleccione al menos una columna para exportar");
      return;
    }
    const headers = activeCols.map(c => c.label);
    const rows = reportData.map(row => activeCols.map(c => row[c.id as keyof typeof row]));
    
    exportToExcel(
      "reporte_personalizado",
      headers,
      rows,
      "Reporte Personalizado de Datos Duros"
    );
    toast.success("Reporte personalizado exportado");
  };

  return (
    <Card className="border-indigo-200">
      <CardHeader className="bg-gradient-to-r from-indigo-50 to-white pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle className="text-indigo-800 flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Generador de Reportes Personalizados
            </CardTitle>
            <CardDescription>Cruce datos duros del sistema seleccionando las columnas deseadas</CardDescription>
          </div>
          <Button onClick={handleExport} size="sm" className="bg-indigo-600 hover:bg-indigo-700">
            <FileSpreadsheet className="mr-2 h-3.5 w-3.5" />Exportar a Excel
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="md:col-span-1 space-y-6">
            <div className="space-y-3">
              <Label className="text-indigo-800 font-semibold">1. Entidad Principal</Label>
              <Select value={baseEntity} onValueChange={(v: any) => setBaseEntity(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pets">Mascotas (Datos Generales)</SelectItem>
                  <SelectItem value="records">Historial Médico (Atenciones)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500">
                La entidad principal define la base de los registros. Al elegir Historial, verá una fila por cada atención médica.
              </p>
            </div>

            <div className="space-y-3">
              <Label className="text-indigo-800 font-semibold">2. Seleccionar Columnas</Label>
              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 bg-slate-50 p-3 rounded-lg border border-slate-200">
                {visibleColumns.map(col => (
                  <div key={col.id} className="flex items-center space-x-2">
                    <Checkbox 
                      id={`col-${col.id}`} 
                      checked={selectedColumns.includes(col.id)}
                      onCheckedChange={() => toggleColumn(col.id)}
                    />
                    <label 
                      htmlFor={`col-${col.id}`} 
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                    >
                      {col.label}
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="md:col-span-3 border rounded-lg overflow-hidden flex flex-col">
            <div className="bg-gray-50 p-3 border-b text-sm font-medium text-gray-700">
              Vista Previa (Muestra hasta 50 registros)
            </div>
            <div className="overflow-auto flex-1 max-h-[500px]">
              {activeCols.length === 0 ? (
                <div className="p-8 text-center text-gray-400">
                  Seleccione al menos una columna para visualizar los datos
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-indigo-50/50">
                      {activeCols.map(col => (
                        <TableHead key={col.id} className="whitespace-nowrap">{col.label}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportData.slice(0, 50).map((row, idx) => (
                      <TableRow key={idx}>
                        {activeCols.map(col => (
                          <TableCell key={col.id}>{row[col.id as keyof typeof row]}</TableCell>
                        ))}
                      </TableRow>
                    ))}
                    {reportData.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={activeCols.length} className="text-center py-6 text-gray-500">
                          No hay datos disponibles
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </div>
            <div className="bg-gray-50 p-2 text-xs text-right text-gray-500 border-t">
              Mostrando {Math.min(reportData.length, 50)} de {reportData.length} registros totales
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
