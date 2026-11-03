import { useEffect, useRef, type ReactNode } from "react";
import { X, LoaderCircle, ArrowUpRight } from "lucide-react";

export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!,
      previous = document.activeElement as HTMLElement | null;
    dialog.showModal();
    return () => {
      dialog.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={wide ? "modal wide" : "modal"}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-label={title}
    >
      <div className="modal-header">
        <h2>{title}</h2>
        <button
          className="icon-button"
          aria-label="Close / Cerrar"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      <div className="modal-body">{children}</div>
    </dialog>
  );
}
export function Button({
  children,
  busy = false,
  secondary = false,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  busy?: boolean;
  secondary?: boolean;
}) {
  return (
    <button
      {...props}
      disabled={props.disabled || busy}
      className={`${secondary ? "button secondary" : "button"} ${props.className ?? ""}`}
    >
      {busy ? <LoaderCircle size={16} className="spin" /> : null}
      {children}
    </button>
  );
}
export function Empty({
  icon,
  heading,
  children,
  action,
}: {
  icon: ReactNode;
  heading: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <h3>{heading}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function SectionTitle({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-title">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
export function TextLink({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button className="text-link" onClick={onClick}>
      {children}
      <ArrowUpRight size={15} />
    </button>
  );
}
