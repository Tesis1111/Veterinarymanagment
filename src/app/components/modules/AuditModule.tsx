import { useState, useEffect, useMemo } from "react";
import { useAudit } from "../../context/AuditContext";
import { AuditLog } from "../../types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Button } from "../ui/button";
import { Calendar } from "../ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarIcon, ChevronDown, Download, Filter, Loader2, Search, X } from "lucide-react";
import { Badge } from "../ui/badge";
import { traerAuditoriaAnteriorA } from "../../services/auditoriaService";

/** Registros que se agregan a la tabla en cada "Ver más". */
const PAGE_SIZE = 50;

export default function AuditModule() {
  const { logs } = useAudit();
  const [filteredLogs, setFilteredLogs] = useState<AuditLog[]>(logs);
  // Páginas traídas de Firestore más allá de las que carga AuditContext.
  const [extraLogs, setExtraLogs] = useState<AuditLog[]>([]);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);
  // Se apaga cuando el servidor devuelve una página vacía: no hay más historial.
  const [serverHasMore, setServerHasMore] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [userFilter, setUserFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [dateFromOpen, setDateFromOpen] = useState(false);
  const [dateToOpen, setDateToOpen] = useState(false);

  // Historial completo en memoria: lo que trajo el contexto + las páginas
  // extra, sin duplicados (una recarga del contexto puede solapar ids).
  const allLogs = useMemo(() => {
    const seen = new Set(logs.map(l => l.id));
    return [...logs, ...extraLogs.filter(l => !seen.has(l.id))];
  }, [logs, extraLogs]);

  useEffect(() => {
    let result = [...allLogs];

    // Filtro de búsqueda de texto
    if (searchTerm) {
      result = result.filter(log => 
        log.details.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.action.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Filtro por módulo
    if (moduleFilter !== "all") {
      result = result.filter(log => log.module === moduleFilter);
    }

    // Filtro por acción
    if (actionFilter !== "all") {
      result = result.filter(log => log.action === actionFilter);
    }

    // Filtro por usuario
    if (userFilter !== "all") {
      result = result.filter(log => log.userId === userFilter);
    }

    // Filtro por fecha desde
    if (dateFrom) {
      result = result.filter(log => {
        const logDate = new Date(log.timestamp);
        return logDate >= dateFrom;
      });
    }

    // Filtro por fecha hasta
    if (dateTo) {
      result = result.filter(log => {
        const logDate = new Date(log.timestamp);
        const endOfDay = new Date(dateTo);
        endOfDay.setHours(23, 59, 59, 999);
        return logDate <= endOfDay;
      });
    }

    setFilteredLogs(result);
  }, [searchTerm, moduleFilter, actionFilter, userFilter, dateFrom, dateTo, allLogs]);

  // Al cambiar cualquier filtro se vuelve a la primera página.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [searchTerm, moduleFilter, actionFilter, userFilter, dateFrom, dateTo]);

  const visibleLogs = filteredLogs.slice(0, visibleCount);
  // Quedan filas ya cargadas por mostrar, o historial más viejo en el servidor.
  const canLoadMore = visibleCount < filteredLogs.length || serverHasMore;

  const handleLoadMore = async () => {
    // Mientras haya filas cargadas sin mostrar, solo se amplía la ventana.
    if (visibleCount < filteredLogs.length) {
      setVisibleCount(c => c + PAGE_SIZE);
      return;
    }
    // Agotado lo que hay en memoria: se pide la página siguiente a Firestore,
    // partiendo del registro más antiguo que ya tenemos.
    const oldest = allLogs.reduce<Date | null>((min, l) => {
      const t = new Date(l.timestamp);
      return !min || t < min ? t : min;
    }, null);
    if (!oldest) { setServerHasMore(false); return; }

    setLoadingMore(true);
    try {
      const page = await traerAuditoriaAnteriorA(oldest, PAGE_SIZE);
      if (page.length === 0) {
        setServerHasMore(false);
      } else {
        if (page.length < PAGE_SIZE) setServerHasMore(false);
        setExtraLogs(prev => [...prev, ...page]);
        setVisibleCount(c => c + PAGE_SIZE);
      }
    } catch {
      setServerHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  };

  const clearFilters = () => {
    setSearchTerm("");
    setModuleFilter("all");
    setActionFilter("all");
    setUserFilter("all");
    setDateFrom(undefined);
    setDateTo(undefined);
  };

  const exportToCSV = () => {
    const headers = ["Fecha/Hora", "Usuario", "Rol", "Módulo", "Acción", "Detalles", "IP"];
    const rows = filteredLogs.map(log => [
      format(new Date(log.timestamp), "dd/MM/yyyy HH:mm:ss"),
      log.userName,
      log.userRole,
      log.module,
      log.action,
      log.details,
      log.ipAddress || ""
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `auditoria_${format(new Date(), "yyyyMMdd_HHmmss")}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getUniqueModules = () => {
    const modules = new Set(logs.map(log => log.module));
    return Array.from(modules).sort();
  };

  const getUniqueActions = () => {
    const actions = new Set(logs.map(log => log.action));
    return Array.from(actions).sort();
  };

  const getUniqueUsers = () => {
    const users = new Map();
    logs.forEach(log => {
      users.set(log.userId, log.userName);
    });
    return Array.from(users.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  };

  const getActionBadgeVariant = (action: string) => {
    if (action.includes("Crear") || action.includes("Registr")) return "default";
    if (action.includes("Actualiz") || action.includes("Modificar")) return "secondary";
    if (action.includes("Eliminar") || action.includes("Cancelar")) return "destructive";
    return "outline";
  };

  const activeFiltersCount = [
    searchTerm,
    moduleFilter !== "all" ? moduleFilter : null,
    actionFilter !== "all" ? actionFilter : null,
    userFilter !== "all" ? userFilter : null,
    dateFrom,
    dateTo
  ].filter(Boolean).length;

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="text-orange-600 mb-1">Auditoría del Sistema</h1>
        <p className="text-muted-foreground">
          Registro completo de todas las acciones realizadas en el sistema
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Filter className="size-5 text-orange-600" />
              Filtros de Búsqueda
            </span>
            {activeFiltersCount > 0 && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="size-4 mr-1" />
                Limpiar ({activeFiltersCount})
              </Button>
            )}
          </CardTitle>
          <CardDescription>
            Filtre los registros de auditoría según sus necesidades
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Búsqueda de texto */}
            <div className="space-y-2">
              <Label htmlFor="search">Buscar</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                <Input
                  id="search"
                  placeholder="Buscar en detalles, usuario, acción..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>

            {/* Filtro por módulo */}
            <div className="space-y-2">
              <Label htmlFor="module">Módulo</Label>
              <Select value={moduleFilter} onValueChange={setModuleFilter}>
                <SelectTrigger id="module">
                  <SelectValue placeholder="Todos los módulos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los módulos</SelectItem>
                  {getUniqueModules().map(module => (
                    <SelectItem key={module} value={module}>{module}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Filtro por acción */}
            <div className="space-y-2">
              <Label htmlFor="action">Acción</Label>
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger id="action">
                  <SelectValue placeholder="Todas las acciones" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las acciones</SelectItem>
                  {getUniqueActions().map(action => (
                    <SelectItem key={action} value={action}>{action}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Filtro por usuario */}
            <div className="space-y-2">
              <Label htmlFor="user">Usuario</Label>
              <Select value={userFilter} onValueChange={setUserFilter}>
                <SelectTrigger id="user">
                  <SelectValue placeholder="Todos los usuarios" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los usuarios</SelectItem>
                  {getUniqueUsers().map(([userId, userName]) => (
                    <SelectItem key={userId} value={userId}>{userName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Filtro por fecha desde */}
            <div className="space-y-2">
              <Label>Fecha Desde</Label>
              <Popover open={dateFromOpen} onOpenChange={setDateFromOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal"
                  >
                    <CalendarIcon className="mr-2 size-4" />
                    {dateFrom ? format(dateFrom, "PPP", { locale: es }) : "Seleccionar fecha"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dateFrom}
                    onSelect={(date) => {
                      setDateFrom(date);
                      setDateFromOpen(false);
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Filtro por fecha hasta */}
            <div className="space-y-2">
              <Label>Fecha Hasta</Label>
              <Popover open={dateToOpen} onOpenChange={setDateToOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal"
                  >
                    <CalendarIcon className="mr-2 size-4" />
                    {dateTo ? format(dateTo, "PPP", { locale: es }) : "Seleccionar fecha"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dateTo}
                    onSelect={(date) => {
                      setDateTo(date);
                      setDateToOpen(false);
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle>Registros de Auditoría</CardTitle>
              <CardDescription>
                {filteredLogs.length} registro{filteredLogs.length !== 1 ? "s" : ""} encontrado{filteredLogs.length !== 1 ? "s" : ""}
              </CardDescription>
            </div>
            <Button onClick={exportToCSV} variant="outline" size="sm">
              <Download className="size-4 mr-2" />
              Exportar CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha/Hora</TableHead>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Módulo</TableHead>
                  <TableHead>Acción</TableHead>
                  <TableHead>Detalles</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleLogs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      No hay registros de auditoría que coincidan con los filtros
                    </TableCell>
                  </TableRow>
                ) : (
                  visibleLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap">
                        {format(new Date(log.timestamp), "dd/MM/yyyy HH:mm:ss")}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{log.userName}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{log.userRole}</Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{log.module}</TableCell>
                      <TableCell>
                        <Badge variant={getActionBadgeVariant(log.action)}>
                          {log.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-md truncate" title={log.details}>
                        {log.details}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {visibleLogs.length > 0 && (
            <div className="mt-4 flex flex-col items-center gap-2">
              <p className="text-sm text-muted-foreground">
                Mostrando {visibleLogs.length} de {filteredLogs.length}
                {serverHasMore && "+"} registro{filteredLogs.length !== 1 ? "s" : ""}
              </p>
              {canLoadMore ? (
                <Button
                  variant="outline"
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="border-orange-300 text-orange-700 hover:bg-orange-50"
                >
                  {loadingMore ? (
                    <>
                      <Loader2 className="size-4 mr-2 animate-spin" />
                      Cargando…
                    </>
                  ) : (
                    <>
                      <ChevronDown className="size-4 mr-2" />
                      Ver más
                    </>
                  )}
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No hay más registros
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
