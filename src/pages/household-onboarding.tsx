import { useRef, useState } from "react";
import { Users, ArrowRight } from "lucide-react";
import type { HouseholdAccess } from "../domain/households";
import type { Language, Repository } from "../domain/types";
import { deviceZone } from "../domain/dates";
import { translator, errorMessage } from "../lib/i18n";
import { Button } from "../components/ui";

export function HouseholdOnboarding({
  repo,
  access,
  language,
  onReady,
  onRefresh,
  onSignOut,
  onLanguage,
}: {
  repo: Repository;
  access: HouseholdAccess;
  language: Language;
  onReady: () => Promise<void>;
  onRefresh: () => Promise<void>;
  onSignOut: () => void;
  onLanguage: () => void;
}) {
  const t = translator(language),
    [name, setName] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const running = useRef(false);
  const run = async (action: () => Promise<void>) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
      await onReady();
    } catch (e) {
      setError(errorMessage(e, language));
    } finally {
      running.current = false;
      setBusy(false);
    }
  };
  return (
    <main className="household-onboarding">
      <div className="button-row">
        <span className="brand-mark">w.</span>
        <Button secondary disabled={busy} onClick={onLanguage}>
          {language === "en" ? "Español" : "English"}
        </Button>
        <Button secondary disabled={busy} onClick={onSignOut}>
          {t("Sign out", "Cerrar sesión")}
        </Button>
      </div>
      <Users size={32} aria-hidden="true" />
      <h1>{t("Your table starts here", "Tu mesa empieza aquí")}</h1>
      <p>
        {t(
          "Create a private household, or accept an invitation. You can belong to one household at a time.",
          "Crea un hogar privado o acepta una invitación. Puedes pertenecer a un solo hogar a la vez.",
        )}
      </p>
      {access.invitations.length > 0 && (
        <section aria-labelledby="household-invitations">
          <h2 id="household-invitations">
            {t("Your invitations", "Tus invitaciones")}
          </h2>
          {access.invitations.map((invitation) => (
            <div className="onboarding-invitation" key={invitation.id}>
              <strong>{invitation.household_name}</strong>
              <Button
                disabled={busy}
                onClick={() =>
                  void run(() =>
                    repo.joinHousehold!(invitation.id, deviceZone()),
                  )
                }
              >
                {t(
                  `Join ${invitation.household_name}`,
                  `Unirse a ${invitation.household_name}`,
                )}
                <ArrowRight size={16} aria-hidden="true" />
              </Button>
            </div>
          ))}
        </section>
      )}
      <section aria-labelledby="create-household">
        <h2 id="create-household">
          {t("Create your household", "Crea tu hogar")}
        </h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => repo.createHousehold!(name.trim(), deviceZone()));
          }}
        >
          <label>
            {t("Household name", "Nombre del hogar")}
            <input
              required
              maxLength={80}
              value={name}
              disabled={busy}
              autoComplete="off"
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <p className="fine-print">
            {t(
              "You will be its owner and can invite others using their Google email addresses.",
              "Serás su propietario y podrás invitar a otras personas con sus direcciones de Google.",
            )}
          </p>
          <Button type="submit" busy={busy} disabled={!name.trim()}>
            {t("Create household", "Crear hogar")}
          </Button>
        </form>
      </section>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      <Button secondary disabled={busy} onClick={() => void run(onRefresh)}>
        {t("Check invitations again", "Comprobar invitaciones de nuevo")}
      </Button>
    </main>
  );
}
