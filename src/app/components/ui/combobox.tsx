import { useState } from "react";
import { Button } from "./button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./command";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "./utils";

export interface ComboboxOption {
  value: string;
  /** Texto que se muestra y sobre el que se busca. */
  label: string;
  /** Línea secundaria opcional (DNI, teléfono…), también buscable. */
  description?: string;
}

interface ComboboxProps {
  options: ComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
}

/**
 * Select con búsqueda (Popover + cmdk).
 *
 * Reemplaza a <Select> cuando la lista puede crecer: con cientos de clientes,
 * un desplegable simple obliga a scrollear a mano. cmdk filtra sobre el texto
 * de cada item, así que se busca tanto por nombre como por el campo secundario.
 */
export function Combobox({
  options,
  value,
  onChange,
  placeholder = "Seleccione una opción",
  searchPlaceholder = "Buscar…",
  emptyMessage = "Sin resultados.",
  disabled = false,
  id,
  className,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find(o => o.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal",
            !selected && "text-muted-foreground",
            className
          )}
        >
          <span className="truncate">{selected ? selected.label : placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
      >
        <Command
          // Se busca sobre label + description, no solo sobre el value (un id).
          filter={(itemValue, search) => {
            const opt = options.find(o => o.value === itemValue);
            if (!opt) return 0;
            const haystack = `${opt.label} ${opt.description ?? ""}`.toLowerCase();
            return haystack.includes(search.toLowerCase().trim()) ? 1 : 0;
          }}
        >
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              {options.map(option => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  onSelect={() => {
                    onChange(option.value === value ? "" : option.value);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4 shrink-0",
                      value === option.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate">{option.label}</p>
                    {option.description && (
                      <p className="truncate text-xs text-muted-foreground">
                        {option.description}
                      </p>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
