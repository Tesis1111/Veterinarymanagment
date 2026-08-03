import { useState } from "react";
import { Button } from "./button";
import { Input } from "./input";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { Smile, X } from "lucide-react";

/**
 * Selector de emoji sin dependencias externas.
 *
 * El catálogo está acotado a lo que tiene sentido para una veterinaria
 * (animales + símbolos clínicos), así se evita cargar una librería de miles de
 * emojis para un campo decorativo. Igual se puede pegar cualquier emoji a mano
 * en el input, así que el catálogo es un atajo, no un límite.
 */
const EMOJI_GROUPS: { label: string; emojis: string[] }[] = [
  {
    label: "Mascotas",
    emojis: [
      "🐶", "🐕", "🦮", "🐕‍🦺", "🐩", "🐺", "🐱", "🐈", "🐈‍⬛", "🦁", "🐯", "🐅",
      "🐰", "🐇", "🐹", "🐭", "🐁", "🐀", "🐿️", "🦔", "🦫", "🐨", "🐼", "🦥",
    ],
  },
  {
    label: "Aves y peces",
    emojis: [
      "🐦", "🐤", "🐥", "🐔", "🐓", "🦜", "🦉", "🦅", "🕊️", "🦆", "🦢", "🐧",
      "🐠", "🐟", "🐡", "🦈", "🐬", "🐳", "🦭", "🐙", "🦀", "🐢",
    ],
  },
  {
    label: "Reptiles e insectos",
    emojis: [
      "🦎", "🐍", "🐊", "🦖", "🐸", "🦂", "🕷️", "🐝", "🦋", "🐛", "🐌", "🦗",
    ],
  },
  {
    label: "Granja y otros",
    emojis: [
      "🐴", "🐎", "🦄", "🐄", "🐮", "🐂", "🐃", "🐷", "🐖", "🐗", "🐑", "🐏",
      "🐐", "🦙", "🦌", "🦒", "🐘", "🦏", "🦛", "🐒", "🐵", "🦧", "🦦", "🐾",
    ],
  },
  {
    label: "Clínica",
    emojis: [
      "🩺", "💉", "💊", "🩹", "🧬", "🔬", "🌡️", "🏥", "⚕️", "🧴", "🦴", "❤️",
      "⭐", "🔔", "📋", "✂️", "🛁", "🏠", "☀️", "🌙",
    ],
  },
];

interface EmojiPickerProps {
  /** Emoji actual ("" = sin icono). */
  value: string;
  onChange: (emoji: string) => void;
  /** Texto del botón cuando no hay emoji elegido. */
  placeholder?: string;
}

export function EmojiPicker({ value, onChange, placeholder = "Sin icono" }: EmojiPickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="h-10 min-w-[4.5rem] justify-center gap-1.5 px-3"
            title="Elegir emoji"
          >
            {value ? (
              <span className="text-xl leading-none">{value}</span>
            ) : (
              <>
                <Smile className="h-4 w-4 text-gray-400" />
                <span className="text-xs text-gray-500">{placeholder}</span>
              </>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="start">
          <div className="max-h-72 overflow-y-auto p-3">
            {EMOJI_GROUPS.map(group => (
              <div key={group.label} className="mb-3 last:mb-0">
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
                  {group.label}
                </p>
                <div className="grid grid-cols-8 gap-1">
                  {group.emojis.map(emoji => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => {
                        onChange(emoji);
                        setOpen(false);
                      }}
                      className={`flex h-8 w-8 items-center justify-center rounded-md text-xl transition-colors hover:bg-orange-100 ${
                        value === emoji ? "bg-orange-200 ring-1 ring-orange-400" : ""
                      }`}
                      title={emoji}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 border-t border-gray-100 p-2">
            <Input
              value={value}
              onChange={e => onChange(e.target.value)}
              placeholder="O pegá cualquier emoji…"
              maxLength={8}
              className="h-8 text-sm"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
              className="h-8 shrink-0 text-gray-500 hover:text-red-600"
              title="Quitar icono"
            >
              <X className="mr-1 h-3.5 w-3.5" />
              Quitar
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="text-gray-400 transition-colors hover:text-red-600"
          title="Quitar icono"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
