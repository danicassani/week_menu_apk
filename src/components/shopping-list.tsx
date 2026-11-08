import { Pencil, Trash2 } from "lucide-react";
import type { ShoppingItem, CheckOperation } from "../domain/shopping";
import { formatShoppingQuantity, overlayPending } from "../domain/shopping";
import type { Language } from "../domain/types";
import { translator } from "../lib/i18n";
export function ShoppingChecklist({
  items,
  pending,
  language,
  onCheck,
  onEdit,
  onDelete,
  disabled = false,
}: {
  items: ShoppingItem[];
  pending: CheckOperation[];
  language: Language;
  onCheck: (id: string, checked: boolean) => void;
  onEdit?: (item: ShoppingItem) => void;
  onDelete?: (item: ShoppingItem) => void;
  disabled?: boolean;
}) {
  const t = translator(language),
    visible = overlayPending(items, pending),
    count = visible.filter((i) => i.checked).length;
  const referenceLabels: Record<string, string> = {
    dry: t("Dry", "Seco"),
    raw_edible: t("Raw edible", "Crudo comestible"),
    ready_to_use: t("Ready to use", "Listo para usar"),
    as_sold: t("As sold", "Tal como se vende"),
    canned_drained: t("Canned, drained", "En conserva, escurrido"),
    expressed_juice: t("Juice", "Zumo"),
    frozen_uncooked: t("Frozen, uncooked", "Congelado, sin cocinar"),
    steamed_ready_to_use: t(
      "Steamed, ready to use",
      "Al vapor, listo para usar",
    ),
    cooked: t("Cooked", "Cocinado"),
  };
  return (
    <>
      <div className="shopping-progress">
        <b>
          {count} / {visible.length}
        </b>
        <span>{t("items checked", "elementos marcados")}</span>
        {pending.length > 0 && (
          <span className="pill">
            {pending.length} {t("pending sync", "por sincronizar")}
          </span>
        )}
      </div>
      {(["generated", "manual"] as const).map((source) => {
        const rows = visible
          .filter((i) => i.source === source)
          .sort(
            (a, b) =>
              Number(a.checked) - Number(b.checked) ||
              (a.name[language] || a.name.en || a.name.es).localeCompare(
                b.name[language] || b.name.en || b.name.es,
              ),
          );
        if (!rows.length) return null;
        return (
          <section key={source} className="shopping-group">
            <h2>
              {source === "generated"
                ? t("From your menu", "Del menú")
                : t("Added by the household", "Añadido por el hogar")}
            </h2>
            <ul className="shopping-checklist">
              {rows.map((item) => {
                const label =
                    item.name[language] || item.name.en || item.name.es,
                  quantity = formatShoppingQuantity(item, language);
                return (
                  <li key={item.id} className={item.checked ? "checked" : ""}>
                    <label>
                      <input
                        type="checkbox"
                        aria-label={`${label}${quantity ? " · " + quantity : ""}`}
                        disabled={disabled}
                        checked={item.checked}
                        onChange={(e) => onCheck(item.id, e.target.checked)}
                      />
                      <span>
                        <b>{label}</b>
                        <small>
                          {quantity}
                          {item.reference_state
                            ? ` · ${referenceLabels[item.reference_state] ?? item.reference_state}`
                            : ""}
                        </small>
                        {item.purchasing_unit && (
                          <small>
                            {item.quantity} g ·{" "}
                            {t(
                              "estimated purchasing units",
                              "unidades de compra estimadas",
                            )}
                          </small>
                        )}
                        {pending.some((op) => op.item_id === item.id) && (
                          <span className="fine-print">
                            {t(
                              "Saved on this device · pending sync",
                              "Guardado en este dispositivo · por sincronizar",
                            )}
                          </span>
                        )}
                      </span>
                    </label>
                    {source === "manual" && (onEdit || onDelete) && (
                      <div className="entry-actions">
                        {onEdit && (
                          <button
                            className="icon-button"
                            aria-label={t(`Edit ${label}`, `Editar ${label}`)}
                            onClick={() => onEdit(item)}
                          >
                            <Pencil size={15} />
                          </button>
                        )}
                        {onDelete && (
                          <button
                            className="icon-button"
                            aria-label={t(
                              `Remove ${label}`,
                              `Eliminar ${label}`,
                            )}
                            onClick={() => onDelete(item)}
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </>
  );
}
