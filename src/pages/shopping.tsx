import { useEffect, useState } from "react";
import { Plus, ShoppingBasket, WifiOff } from "lucide-react";
import type { ViewProps } from "./views";
import type { ShoppingItem } from "../domain/shopping";
import {
  shoppingNeedsRefresh,
  projectUpcomingShopping,
} from "../domain/shopping";
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
  const [eggEditor, setEggEditor] = useState(false),
    [eggRevision, setEggRevision] = useState(0),
    [eggGrams, setEggGrams] = useState("50"),
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
    observedShopping =
      cached &&
      (cached.observation_revision ?? 0) >= (server.observation_revision ?? 0)
        ? cached
        : server;
  const shopping = projectUpcomingShopping(observedShopping, queue.now);
  const eggSetting = shopping.purchasing?.find(
    (p) => p.ingredient_id === "egg",
  );
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
              "Updated automatically when your menu changes. Manual additions are kept.",
              "Se actualiza automáticamente al cambiar el menú. Se conservan los productos manuales.",
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
      <div className="shopping-scope button-row">
        <p>{t("All upcoming meals", "Todas las comidas próximas")}</p>
        {eggSetting && (
          <Button
            secondary
            disabled={!queue.online}
            onClick={() => {
              setEggRevision(eggSetting.revision);
              setEggGrams(String(eggSetting.grams_per_unit));
              setEggEditor(true);
            }}
          >
            {t("Egg size estimate", "Tamaño estimado del huevo")}
          </Button>
        )}
      </div>
      {eggEditor && eggSetting && (
        <Modal
          title={t(
            "Egg purchasing estimate",
            "Estimación de huevos para la compra",
          )}
          onClose={() => setEggEditor(false)}
        >
          <p>
            {t(
              "Estimated edible grams per egg, without shell. This only changes shopping units; recipe quantities and calories stay unchanged.",
              "Gramos comestibles estimados por huevo, sin cáscara. Solo cambia las unidades de compra; las cantidades de las recetas y sus calorías se mantienen.",
            )}
          </p>
          {eggRevision !== eggSetting.revision && (
            <div className="note warning">
              <p>
                {t(
                  "The household estimate changed. Reload and review it before saving.",
                  "La estimación del hogar ha cambiado. Recárgala y revísala antes de guardar.",
                )}
              </p>
              <Button
                secondary
                onClick={() => {
                  setEggGrams(String(eggSetting.grams_per_unit));
                  setEggRevision(eggSetting.revision);
                }}
              >
                {t("Reload for review", "Volver a cargar para revisar")}
              </Button>
            </div>
          )}
          <label>
            {t("Edible grams per egg", "Gramos comestibles por huevo")}
            <input
              type="number"
              min="0.001"
              step="any"
              value={eggGrams}
              onChange={(e) => setEggGrams(e.target.value)}
            />
          </label>
          <div className="button-row">
            <Button
              busy={v.busy}
              disabled={
                !queue.online ||
                eggRevision !== eggSetting.revision ||
                !Number.isFinite(Number(eggGrams)) ||
                Number(eggGrams) <= 0
              }
              onClick={async () => {
                if (
                  await v.operate(() =>
                    v.repository.saveEggPurchasingUnit(
                      Number(eggGrams),
                      eggRevision,
                    ),
                  )
                )
                  setEggEditor(false);
              }}
            >
              {t("Save estimate", "Guardar estimación")}
            </Button>
            <Button
              secondary
              busy={v.busy}
              disabled={!queue.online || eggRevision !== eggSetting.revision}
              onClick={async () => {
                if (
                  await v.operate(() =>
                    v.repository.saveEggPurchasingUnit(null, eggRevision),
                  )
                )
                  setEggEditor(false);
              }}
            >
              {t("Reset to starter estimate", "Restablecer estimación inicial")}
            </Button>
          </div>
        </Modal>
      )}
      {shoppingNeedsRefresh(shopping, queue.now) && (
        <p className="note warning" role="status">
          {t(
            "This saved list may not cover all upcoming meals or may include expired quantities. Reconnect or synchronize; your pending checks are kept.",
            "La lista guardada puede no incluir todas las comidas próximas o contener cantidades pasadas. Reconecta o sincroniza; se conservan tus marcas pendientes.",
          )}
        </p>
      )}
      {shopping.changes_available && (
        <p className="note warning">
          {t(
            "Synchronize to refresh the upcoming list.",
            "Sincroniza para actualizar la lista de comidas próximas.",
          )}
        </p>
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
          <button
            className="button secondary"
            disabled={queue.syncing}
            onClick={() => void queue.sync()}
          >
            {t("Sync now", "Sincronizar ahora")}
          </button>
        )}
      </div>
      {(queue.error || message) && (
        <p className="note warning" role="alert">
          {message ||
            errorMessage(
              new Error(queue.error),
              v.language,
              t(
                "Could not synchronize the shopping list. Try again.",
                "No se ha podido sincronizar la lista de la compra. Inténtalo de nuevo.",
              ),
            )}
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
