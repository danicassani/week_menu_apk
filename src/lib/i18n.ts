import type { Language } from "../domain/types";
export const translator = (language: Language) => (en: string, es: string) =>
  language === "es" ? es : en;
const messages: Record<string, [string, string]> = {
  invalid_profile: [
    "Enter a name, adult age, sex, and positive metric measurements.",
    "Introduce nombre, edad adulta, sexo y medidas métricas positivas.",
  ],
  invalid_goal: [
    "Enter a lower target weight and a valid future deadline.",
    "Introduce un peso objetivo inferior y una fecha futura válida.",
  ],
  deadline_expired: [
    "Your deadline has passed. Choose a new target date.",
    "La fecha límite ha pasado. Elige una nueva fecha.",
  ],
  goal_reached: [
    "You have reached your goal. Review a maintenance target to continue.",
    "Has alcanzado tu objetivo. Revisa un objetivo de mantenimiento para continuar.",
  ],
  goal_too_fast: [
    "This goal requires losing more than 1 kg per week. Revise the weight or allow more time.",
    "Este objetivo requiere perder más de 1 kg por semana. Revisa el peso o amplía el plazo.",
  ],
  target_too_low: [
    "This target is 1,200 kcal or less. Revise your goal or allow more time.",
    "Este objetivo es de 1200 kcal o menos. Revisa tu objetivo o amplía el plazo.",
  ],
  invalid_budgets: [
    "Enter a positive calorie budget for every meal.",
    "Introduce un presupuesto calórico positivo para cada comida.",
  ],
  invalid_entry: [
    "Check the description and amount. Calories can be zero; weight must be positive.",
    "Comprueba la descripción y cantidad. Las calorías pueden ser cero; el peso debe ser positivo.",
  ],
  invalid_activity: [
    "Choose a supported activity and positive duration. Activities cannot total more than 24 hours in a day.",
    "Elige una actividad disponible y una duración positiva. No pueden sumar más de 24 horas en un día.",
  ],
  stale_profile: [
    "Your profile changed on another device. We loaded the latest version; review it before saving again.",
    "Tu perfil cambió en otro dispositivo. Hemos cargado la última versión; revísala antes de guardar.",
  ],
  stale_proposal: [
    "Your measurements or date changed. Close this review and request a fresh target.",
    "Han cambiado tus medidas o la fecha. Cierra esta revisión y solicita un nuevo cálculo.",
  ],
  day_closed: [
    "This day is locked. Past records cannot be changed.",
    "Este día está cerrado. Los registros pasados no se pueden cambiar.",
  ],
  entry_not_editable: [
    "Only your own entries for today can be changed.",
    "Solo puedes modificar tus propios registros de hoy.",
  ],
  owner_required: [
    "Only the household owner can do this.",
    "Solo el propietario del hogar puede hacerlo.",
  ],
  transfer_before_leaving: [
    "Transfer ownership to another active member before leaving.",
    "Transfiere la propiedad a otro miembro activo antes de salir.",
  ],
  invalid_email: [
    "Enter a valid Google email address.",
    "Introduce una dirección de correo de Google válida.",
  ],
  access_denied: [
    "This Google account has not been approved for this household.",
    "Esta cuenta de Google no está aprobada para este hogar.",
  ],
  google_identity_required: [
    "Sign in using a verified Google account.",
    "Inicia sesión con una cuenta de Google verificada.",
  ],
  household_not_configured: [
    "This household is not ready yet. Its owner must complete setup.",
    "Este hogar aún no está listo. El propietario debe completar la configuración.",
  ],
};
export function errorMessage(error: unknown, language: Language) {
  const code = error instanceof Error ? error.message : String(error);
  const found = Object.keys(messages).find((k) => code.includes(k));
  return found
    ? messages[found][language === "es" ? 1 : 0]
    : translator(language)(
        "Could not save this change. Check your connection and try again.",
        "No se ha podido guardar. Comprueba tu conexión e inténtalo de nuevo.",
      );
}
export const mealLabel = (type: string, language: Language) =>
  ({
    breakfast: language === "es" ? "Desayuno" : "Breakfast",
    lunch: language === "es" ? "Almuerzo" : "Lunch",
    dinner: language === "es" ? "Cena" : "Dinner",
  })[type] ?? type;
