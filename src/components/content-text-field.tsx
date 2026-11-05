import { useState } from "react";
import type { Names } from "../domain/planning";
import type { Language } from "../domain/types";
import { translator } from "../lib/i18n";

export function ContentTextField({
  label,
  value,
  language,
  onChange,
  multiline = false,
  required = false,
}: {
  label: string;
  value: Names;
  language: Language;
  onChange: (value: Names) => void;
  multiline?: boolean;
  required?: boolean;
}) {
  const [edited, setEdited] = useState(false);
  const t = translator(language),
    other = language === "en" ? "es" : "en";
  const field = (lang: Language, primary: boolean) => {
    const props = {
      value:
        primary && !edited && !value[lang].trim() ? value[other] : value[lang],
      required: primary && required,
      onChange: (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
      ) => {
        if (primary) setEdited(true);
        onChange({ ...value, [lang]: e.target.value });
      },
    };
    return multiline ? (
      <textarea {...props} rows={5} />
    ) : (
      <input {...props} maxLength={160} />
    );
  };
  return (
    <>
      <label>
        {label}
        {field(language, true)}
      </label>
      <details className="optional-translation">
        <summary>{t("Optional translation", "Traducción opcional")}</summary>
        <label>
          {t("Spanish translation", "Traducción al inglés")}
          {field(other, false)}
        </label>
      </details>
    </>
  );
}
