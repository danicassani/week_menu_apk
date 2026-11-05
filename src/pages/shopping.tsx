import { useEffect, useState } from "react";
import { Plus, ShoppingBasket, RefreshCw, Info, WifiOff } from "lucide-react";
import type { ViewProps } from "./views";
import type { ShoppingPreview, ShoppingItem } from "../domain/shopping";
import { formatShoppingQuantity } from "../domain/shopping";
import { addDays } from "../domain/dates";
import { translator, errorMessage } from "../lib/i18n";
import { useShoppingQueue } from "../lib/use-offline";
import {
  cacheShopping,
  dismissDiscarded,
  cacheIdentity,
} from "../lib/offline-store";
import { ShoppingChecklist } from "../components/shopping-list";
import { Modal, Button, Empty } from "../components/ui";
export function ShoppingPage(v: ViewProps) {
  const t = translator(v.language),
    queue = useShoppingQueue(v.repository),
    server = v.s.shopping;
  const [start, setStart] = useState(server?.start_date ?? v.day),
    [end, setEnd] = useState(server?.end_date ?? addDays(v.day, 6)),
    [preview, setPreview] = useState<ShoppingPreview | null>(null),
    [manual, setManual] = useState<{
      id: string;
      label: string;
      amount: string;
      revision: number;
    } | null>(null),
    [message, setMessage] = useState("");
  useEffect(() => {
    if (server)
      void cacheShopping(cacheIdentity(v.repository), server).catch(() =>
        setMessage(
          t(
            "Offline storage is unavailable. Shopping checks cannot be queued safely.",
            "El almacenamiento sin conexión no está disponible. No se pueden guardar marcas de compra de forma segura.",
          ),
        ),
      );
  }, [server, v.repository.offlineId, v.repository.accountId]);
  if (!server)
    return (
      <Empty
        icon={<ShoppingBasket />}
        heading={t(
          "Shopping is not ready for this household",
          "La compra aún no está lista para este hogar",
        )}
      >
        {t(
          "The household owner needs to finish setup.",
          "El propietario debe completar la configuración.",
        )}
      </Empty>
    );
  const cached = queue.data?.shopping,
    shopping =
      cached &&
      (cached.observation_revision ?? 0) >= (server.observation_revision ?? 0)
        ? cached
        : server;
  const review = async () => {
    let result: ShoppingPreview | undefined;
    if (
      await v.operate(async () => {
        result = await v.repository.previewShopping(start, end);
      })
    ) {
      setPreview(result!);
    }
  };
  const edit = (item: ShoppingItem) =>
    setManual({
      id: item.id,
      label: item.name[v.language] || item.name.en || item.name.es,
      amount: item.amount,
      revision: item.content_revision,
    });
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            {t("One household. One list.", "Un hogar. Una lista.")}
          </span>
          <h1>{t("The shopping list", "La lista de la compra")}</h1>
          <p>
            {t(
              "From your saved portions, with room for everyday extras.",
              "A partir de vuestras porciones guardadas, con espacio para lo demás.",
            )}
          </p>
        </div>
        <Button
          secondary
          disabled={!queue.online}
          onClick={() =>
            setManual({
              id: crypto.randomUUID(),
              label: "",
              amount: "",
              revision: 0,
            })
          }
        >
          <Plus size={16} />
          {t("Add item", "Añadir producto")}
        </Button>
      </div>
      <section className="panel shopping-range">
        <div className="form-grid">
          <label>
            {t("From", "Desde")}
            <input
              type="date"
              required
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label>
            {t("Through", "Hasta")}
            <input
              type="date"
              required
              min={start}
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
        </div>
        <Button
          busy={v.busy}
          disabled={!queue.online || !start || !end || start > end}
          onClick={() => void review()}
        >
          <RefreshCw size={16} />
          {t("Review menu quantities", "Revisar cantidades del menú")}
        </Button>
        <p className="fine-print">
          {shopping.start_date
            ? t(
                `Current list: ${shopping.start_date} — ${shopping.end_date}`,
                `Lista actual: ${shopping.start_date} — ${shopping.end_date}`,
              )
            : t(
                "Choose dates to generate the household list.",
                "Elige fechas para generar la lista del hogar.",
              )}
        </p>
      </section>
      {shopping.changes_available && (
        <div className="note warning">
          <Info size={18} />
          <span>
            {t(
              "Your menu has changes available. Review them before updating the list.",
              "Hay cambios disponibles en el menú. Revísalos antes de actualizar la lista.",
            )}
          </span>
          <button
            className="text-link"
            onClick={() => {
              setStart(shopping.start_date!);
              setEnd(shopping.end_date!);
            }}
          >
            {t("Use current range", "Usar intervalo actual")}
          </button>
        </div>
      )}
      <div className="sync-status" role="status">
        {!queue.online ? (
          <>
            <WifiOff size={16} />
            {t(
              "Offline · checks are saved on this device",
              "Sin conexión · las marcas se guardan en este dispositivo",
            )}
          </>
        ) : queue.syncing ? (
          t("Synchronizing…", "Sincronizando…")
        ) : queue.data?.pending.length ? (
          t("Changes waiting to sync", "Cambios pendientes de sincronizar")
        ) : (
          t("Connected", "Con conexión")
        )}
        {queue.online && (
          <button className="text-link" onClick={() => void queue.sync()}>
            {t("Sync now", "Sincronizar ahora")}
          </button>
        )}
      </div>
      {(queue.error || message) && (
        <p className="note warning" role="alert">
          {message || errorMessage(new Error(queue.error), v.language)}
        </p>
      )}
      {!!queue.data?.discarded && (
        <div className="note" role="status">
          <span>
            {t(
              `${queue.data.discarded} outdated checks were discarded because those items no longer exist. Other changes were synchronized.`,
              `${queue.data.discarded} marcas antiguas se descartaron porque esos productos ya no existen. Se sincronizaron los demás cambios.`,
            )}
          </span>
          <button
            className="text-link"
            onClick={() => void dismissDiscarded(cacheIdentity(v.repository))}
          >
            {t("Dismiss", "Cerrar")}
          </button>
        </div>
      )}
      {shopping.items.length ? (
        <ShoppingChecklist
          items={shopping.items}
          pending={queue.data?.pending ?? []}
          language={v.language}
          disabled={
            !queue.data?.shopping || !!queue.error.includes("offline_storage")
          }
          onCheck={(id, checked) => void queue.check(id, checked)}
          onEdit={queue.online ? edit : undefined}
          onDelete={
            queue.online
              ? (item) => {
                  if (
                    window.confirm(
                      t(
                        "Remove this manual item?",
                        "¿Eliminar este producto manual?",
                      ),
                    )
                  )
                    void v.operate(
                      () =>
                        v.repository.deleteManualItem(
                          item.id,
                          item.content_revision,
                        ),
                      t("Item removed.", "Producto eliminado."),
                    );
                }
              : undefined
          }
        />
      ) : (
        <section className="panel">
          <Empty
            icon={<ShoppingBasket size={32} />}
            heading={t("Your list starts here", "Tu lista empieza aquí")}
          >
            {t(
              "Review your menu quantities or add a product manually. Eating-out portions contribute no ingredients.",
              "Revisa las cantidades del menú o añade un producto manualmente. Comer fuera no añade ingredientes.",
            )}
          </Empty>
        </section>
      )}
      {preview && (
        <Modal
          title={t("Review shopping changes", "Revisar cambios de compra")}
          wide
          onClose={() => setPreview(null)}
        >
          <p className="form-intro">
            {t(
              "Manual additions always stay. Increased quantities uncheck the item and are highlighted; decreases retain the current checked state.",
              "Los añadidos manuales se conservan. Los aumentos desmarcan el producto y se destacan; las reducciones conservan su marca actual.",
            )}
          </p>
          <p>
            {preview.start_date} — {preview.end_date}
          </p>
          <ul className="shopping-diff">
            {preview.changes
              .filter((c) => c.action !== "unchanged")
              .map((c) => (
                <li key={c.key}>
                  <div>
                    <b>
                      {(c.after?.name ?? c.before!.name)[v.language] ||
                        (c.after?.name ?? c.before!.name).en ||
                        (c.after?.name ?? c.before!.name).es}
                    </b>
                    <span>
                      {
                        {
                          add: t("Add", "Añadir"),
                          increase: t(
                            "Increase · uncheck",
                            "Aumentar · desmarcar",
                          ),
                          decrease: t(
                            "Decrease · preserve check",
                            "Reducir · conservar marca",
                          ),
                          remove: t(
                            "Remove generated item",
                            "Eliminar producto del menú",
                          ),
                          update: t("Update name", "Actualizar nombre"),
                          unchanged: t("Unchanged", "Sin cambios"),
                        }[c.action]
                      }
                    </span>
                  </div>
                  <span>
                    {c.before
                      ? formatShoppingQuantity(c.before, v.language)
                      : "—"}{" "}
                    →{" "}
                    {c.after
                      ? formatShoppingQuantity(
                          { ...c.after, source: "generated", amount: "" },
                          v.language,
                        )
                      : "—"}
                  </span>
                </li>
              ))}
          </ul>
          <p className="fine-print">
            {preview.changes.filter((c) => c.action === "unchanged").length}{" "}
            {t(
              "generated items remain unchanged. Current checked states are read when applying.",
              "productos del menú se mantienen. Se conserva el estado de compra vigente al aplicar.",
            )}
          </p>
          <Button
            busy={v.busy}
            onClick={async () => {
              if (
                await v.operate(
                  () => v.repository.applyShopping(preview),
                  t("Shopping list updated.", "Lista de compra actualizada."),
                )
              )
                setPreview(null);
            }}
          >
            {t("Apply reviewed changes", "Aplicar cambios revisados")}
          </Button>
          <Button secondary busy={v.busy} onClick={() => void review()}>
            {t("Refresh preview", "Actualizar vista previa")}
          </Button>
        </Modal>
      )}
      {manual && (
        <Modal
          title={
            manual.revision
              ? t("Edit manual item", "Editar producto manual")
              : t("Add a manual item", "Añadir producto manual")
          }
          onClose={() => setManual(null)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await v.operate(
                  () =>
                    v.repository.saveManualItem(
                      manual.id,
                      manual.label,
                      manual.amount,
                      manual.revision,
                    ),
                  t("Item saved.", "Producto guardado."),
                )
              )
                setManual(null);
            }}
          >
            <label>
              {t("Product", "Producto")}
              <input
                autoFocus
                required
                maxLength={160}
                value={manual.label}
                onChange={(e) =>
                  setManual({ ...manual, label: e.target.value })
                }
              />
            </label>
            <label>
              {t("Quantity or note · optional", "Cantidad o nota · opcional")}
              <input
                maxLength={80}
                placeholder={t("2 bottles", "2 botellas")}
                value={manual.amount}
                onChange={(e) =>
                  setManual({ ...manual, amount: e.target.value })
                }
              />
            </label>
            <Button type="submit" busy={v.busy}>
              {t("Save item", "Guardar producto")}
            </Button>
          </form>
        </Modal>
      )}
    </>
  );
}
