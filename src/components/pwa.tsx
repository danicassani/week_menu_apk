import { useEffect, useState } from "react";
import { Download, RefreshCw, X } from "lucide-react";
import { translator } from "../lib/i18n";
import { Modal, Button } from "./ui";
interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
export function PwaUpdates() {
  const [registration, setRegistration] =
      useState<ServiceWorkerRegistration | null>(null),
    [waiting, setWaiting] = useState(false),
    [prompt, setPrompt] = useState<InstallPrompt | null>(null),
    [iosHelp, setIosHelp] = useState(false),
    [dismissed, setDismissed] = useState(false),
    [language, setLanguage] = useState<"en" | "es">(
      document.documentElement.lang === "es" ? "es" : "en",
    ),
    [installed, setInstalled] = useState(
      () =>
        matchMedia("(display-mode: standalone)").matches ||
        Boolean((navigator as Navigator & { standalone?: boolean }).standalone),
    ),
    [updating, setUpdating] = useState(false),
    [shellUnavailable, setShellUnavailable] = useState(false);
  const t = translator(language),
    ios =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  useEffect(() => {
    const observer = new MutationObserver(() =>
      setLanguage(document.documentElement.lang === "es" ? "es" : "en"),
    );
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["lang"],
    });
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
    let active = true;
    const install = (e: Event) => {
        e.preventDefault();
        setPrompt(e as InstallPrompt);
      },
      done = () => {
        setInstalled(true);
        setPrompt(null);
      };
    window.addEventListener("beforeinstallprompt", install);
    window.addEventListener("appinstalled", done);
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        if (!active) return;
        setRegistration(reg);
        if (reg.waiting) setWaiting(true);
        reg.addEventListener("updatefound", () => {
          const worker = reg.installing;
          worker?.addEventListener("statechange", () => {
            if (
              active &&
              worker.state === "installed" &&
              navigator.serviceWorker.controller
            )
              setWaiting(true);
          });
        });
      })
      .catch(() => {
        if (active) setShellUnavailable(true);
      });
    const visible = () => {
      if (document.visibilityState === "visible" && navigator.onLine)
        void navigator.serviceWorker
          .getRegistration()
          .then((reg) => reg?.update())
          .catch(() => {});
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      active = false;
      window.removeEventListener("beforeinstallprompt", install);
      window.removeEventListener("appinstalled", done);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);
  if (new URLSearchParams(location.search).has("code")) return null;
  return (
    <>
      {shellUnavailable && (
        <div className="pwa-notice" role="status">
          {t(
            "Offline app loading is unavailable in this browser. Keep a connection to reopen the app.",
            "No se puede cargar la app sin conexión en este navegador. Mantén la conexión para volver a abrirla.",
          )}
        </div>
      )}
      {waiting ? (
        <div className="pwa-notice" role="status">
          <RefreshCw size={17} />
          <span>
            {t(
              "An app update is ready. Pending shopping checks will be kept.",
              "Hay una actualización disponible. Se conservarán las marcas de compra pendientes.",
            )}
          </span>
          <Button
            busy={updating}
            onClick={() => {
              if (!registration?.waiting) return;
              setUpdating(true);
              navigator.serviceWorker.addEventListener(
                "controllerchange",
                () => location.reload(),
                { once: true },
              );
              registration.waiting.postMessage({ type: "ACTIVATE_UPDATE" });
            }}
          >
            {t("Update & reload", "Actualizar y recargar")}
          </Button>
        </div>
      ) : !installed &&
        !dismissed &&
        (prompt || ios) &&
        import.meta.env.PROD ? (
        <div className="pwa-notice">
          <Download size={17} />
          <span>
            {t(
              "Keep Week Menu on your home screen.",
              "Añade Week Menu a tu pantalla de inicio.",
            )}
          </span>
          <Button
            secondary
            onClick={async () => {
              if (prompt) {
                await prompt.prompt();
                await prompt.userChoice;
                setPrompt(null);
              } else setIosHelp(true);
            }}
          >
            {t("Install app", "Instalar app")}
          </Button>
          <button
            className="icon-button"
            aria-label={t(
              "Dismiss install hint",
              "Cerrar sugerencia de instalación",
            )}
            onClick={() => setDismissed(true)}
          >
            <X size={16} />
          </button>
        </div>
      ) : null}
      {iosHelp && (
        <Modal
          title={t("Install on iPhone or iPad", "Instalar en iPhone o iPad")}
          onClose={() => setIosHelp(false)}
        >
          <p className="form-intro">
            {t(
              "Open this app in Safari. Tap Share, then Add to Home Screen. If prompted, keep Open as Web App enabled.",
              "Abre esta app en Safari. Pulsa Compartir y después Añadir a pantalla de inicio. Si aparece, mantén activado Abrir como app web.",
            )}
          </p>
          <p className="muted">
            {t(
              "Load Menu, Recipes and Shopping online once to make those views available offline.",
              "Abre Menú, Recetas y Compra con conexión una vez para poder consultarlos sin conexión.",
            )}
          </p>
        </Modal>
      )}
    </>
  );
}
