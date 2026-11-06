import { useState } from "react";
import { EMOJIS } from "../domain/presentation";
import { translator } from "../lib/i18n";
import type { ViewProps } from "../pages/views";
import { Modal } from "./ui";

export function AvatarPicker(v: ViewProps) {
  const [open, setOpen] = useState(false),
    [error, setError] = useState(false);
  const t = translator(v.language),
    current = v.member.presentation?.avatar ?? "🧑";
  return (
    <>
      <button
        type="button"
        className="avatar large avatar-picker-trigger"
        aria-label={t("Change my avatar", "Cambiar mi avatar")}
        aria-haspopup="dialog"
        onClick={() => {
          setError(false);
          setOpen(true);
        }}
      >
        <span aria-hidden="true">{current}</span>
      </button>
      {open && (
        <Modal
          title={t("Choose your avatar", "Elige tu avatar")}
          onClose={() => {
            if (!v.busy) setOpen(false);
          }}
        >
          <div
            className="emoji-grid"
            role="group"
            aria-label={t("Available emojis", "Emojis disponibles")}
          >
            {EMOJIS.map((emoji) => (
              <button
                type="button"
                key={emoji}
                className="emoji-choice"
                aria-label={t(`Choose ${emoji}`, `Elegir ${emoji}`)}
                aria-pressed={current === emoji}
                disabled={v.busy}
                onClick={async () => {
                  setError(false);
                  if (
                    await v.operate(() =>
                      v.repository.savePresentation({
                        avatar: emoji,
                        text_size:
                          v.member.presentation?.text_size ?? "standard",
                      }),
                    )
                  )
                    setOpen(false);
                  else setError(true);
                }}
              >
                <span aria-hidden="true">{emoji}</span>
              </button>
            ))}
          </div>
          {error && (
            <p role="alert">
              {t(
                "Could not save your avatar. Please try again.",
                "No se ha podido guardar tu avatar. Inténtalo de nuevo.",
              )}
            </p>
          )}
        </Modal>
      )}
    </>
  );
}
