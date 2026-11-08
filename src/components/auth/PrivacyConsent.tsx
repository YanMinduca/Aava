import { Checkbox } from "@/components/ui/checkbox";

type Props = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Texto curto sobre o uso dos dados naquele formulário (aparece abaixo do aceite). */
  note?: string;
};

/** Caixa de aceite da Política de Privacidade, no mesmo visual do aceite de uso de imagem dos eventos. */
export function PrivacyConsent({ checked, onCheckedChange, note }: Props) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border bg-primary-soft/40 p-4 text-sm">
      <Checkbox
        className="mt-0.5"
        checked={checked}
        onCheckedChange={(on) => onCheckedChange(on === true)}
        aria-required="true"
      />
      <span>
        <span className="block font-medium text-foreground">
          Li e concordo com a{" "}
          <a
            href="/privacidade"
            target="_blank"
            rel="noreferrer"
            className="text-primary underline"
          >
            Política de Privacidade
          </a>{" "}
          *
        </span>
        {note ? <span className="mt-1 block text-xs text-muted-foreground">{note}</span> : null}
      </span>
    </label>
  );
}
