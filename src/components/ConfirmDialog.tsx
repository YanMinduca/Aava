import { useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

/**
 * Botão que pede confirmação numa janela do próprio site (funciona no celular e no app instalado,
 * ao contrário do confirm() do navegador, que pode ser bloqueado).
 */
export function ConfirmButton({
  children,
  title,
  description,
  confirmLabel = "Excluir",
  onConfirm,
  disabled,
  size = "sm",
  variant = "outline",
  className,
  ariaLabel,
}: {
  children: ReactNode;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
  disabled?: boolean;
  size?: "sm" | "default" | "icon";
  variant?: "outline" | "ghost" | "destructive" | "secondary";
  className?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" size={size} variant={variant} className={className} disabled={disabled} aria-label={ariaLabel} onClick={() => setOpen(true)}>
        {children}
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                setOpen(false);
                onConfirm();
              }}
            >
              {confirmLabel}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
