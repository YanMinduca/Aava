import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type MemberOption = { id: string; label: string };

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/**
 * Seletor de membro com busca (ignora acentos e maiúsculas: "jose" encontra "José").
 * Use em qualquer lugar onde antes havia um menu simples de membros.
 * `noneLabel` adiciona uma primeira opção para limpar a seleção (ex.: "Sem membro").
 */
export function MemberCombobox({
  options,
  value,
  onChange,
  placeholder = "Selecione o membro",
  noneLabel,
  loading,
  className,
}: {
  options: MemberOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  noneLabel?: string;
  loading?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = options.find((o) => o.id === value);
  const q = norm(search.trim());
  const shown = q ? options.filter((o) => norm(o.label).includes(q)) : options;

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setSearch("");
      }}
    >
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" role="combobox" aria-expanded={open} className={cn("w-full justify-between font-normal", className)}>
          <span className={cn("truncate", !selected && !(noneLabel && !value) && "text-muted-foreground")}>
            {loading ? "Carregando..." : (selected?.label ?? (noneLabel && !value ? noneLabel : placeholder))}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-64 p-0">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Pesquisar membro..." value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>Nenhum membro encontrado.</CommandEmpty>
            <CommandGroup>
              {noneLabel && !q && (
                <CommandItem
                  value="__none__"
                  onSelect={() => {
                    onChange("");
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value ? "opacity-0" : "opacity-100")} />
                  {noneLabel}
                </CommandItem>
              )}
              {shown.map((o) => (
                <CommandItem
                  key={o.id}
                  value={o.id}
                  onSelect={() => {
                    onChange(o.id);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === o.id ? "opacity-100" : "opacity-0")} />
                  {o.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
