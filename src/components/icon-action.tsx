import type { ButtonHTMLAttributes } from "react";
import { LoaderCircle, type LucideIcon } from "lucide-react";

export function IconAction({
  label,
  icon: Icon,
  busy = false,
  className = "",
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  icon: LucideIcon;
  busy?: boolean;
}) {
  return (
    <button
      {...props}
      type="button"
      className={`icon-button preview-action ${className}`}
      aria-label={label}
      title={label}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
    >
      {busy ? (
        <LoaderCircle size={19} aria-hidden="true" className="spin" />
      ) : (
        <Icon size={19} aria-hidden="true" />
      )}
    </button>
  );
}
