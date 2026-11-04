import { useState } from "react";
import type { Repository, Language } from "../domain/types";
import { useShoppingQueue } from "../lib/use-offline";
import { translator, errorMessage } from "../lib/i18n";
import { Modal, Button } from "./ui";
export function SignOutDialog({
  repo,
  language,
  onClose,
  onExit,
}: {
  repo: Pick<
    Repository,
    "accountId" | "getShopping" | "checkShopping" | "signOut"
  >;
  language: Language;
  onClose: () => void;
  onExit: () => void;
}) {
  const t = translator(language),
    queue = useShoppingQueue(repo),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const pending = queue.data?.pending.length ?? 0;
  const finish = async (discard: boolean) => {
    setBusy(true);
    try {
      await repo.signOut(discard);
      onExit();
    } catch (e) {
      setError(errorMessage(e, language));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={t("Sign out?", "¿Cerrar sesión?")}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <p className="form-intro">
        {t(
          "This clears your cached household data from this device.",
          "Se borrarán tus datos del hogar guardados en este dispositivo.",
        )}
      </p>
      {pending > 0 && (
        <div className="note warning">
          <p>
            {t(
              `You have ${pending} shopping changes waiting to sync. Reconnect and synchronize, or explicitly discard them before signing out.`,
              `Tienes ${pending} cambios de compra por sincronizar. Vuelve a conectarte y sincroniza, o descártalos expresamente antes de cerrar sesión.`,
            )}
          </p>
        </div>
      )}
      {!queue.online && (
        <p className="fine-print">
          {t(
            "You are offline. Signing out clears the local session; remote session revocation cannot be confirmed without a connection.",
            "Estás sin conexión. Se borrará la sesión local; no se puede confirmar la revocación de la sesión remota sin conexión.",
          )}
        </p>
      )}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      <div className="button-row">
        {pending > 0 ? (
          <>
            <Button
              busy={queue.syncing}
              disabled={!queue.online || busy}
              onClick={() => void queue.sync()}
            >
              {t("Sync first", "Sincronizar primero")}
            </Button>
            <Button
              secondary
              busy={busy}
              disabled={queue.syncing}
              onClick={() => void finish(true)}
            >
              {t(
                "Discard changes & sign out",
                "Descartar cambios y cerrar sesión",
              )}
            </Button>
          </>
        ) : (
          <Button busy={busy} onClick={() => void finish(false)}>
            {t(
              "Sign out & clear this device",
              "Cerrar sesión y borrar datos locales",
            )}
          </Button>
        )}
        <Button secondary disabled={busy} onClick={onClose}>
          {t("Cancel", "Cancelar")}
        </Button>
      </div>
    </Modal>
  );
}
