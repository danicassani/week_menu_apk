import { PortionError } from "../domain/portion-error";
import { ingredientText } from "../domain/content-presentation";
import type { Language } from "../domain/types";
export const translator = (language: Language) => (en: string, es: string) =>
  language === "es" ? es : en;
const messages: Record<string, [string, string]> = {
  cooking_schedule_required: [
    "Configure cooking days and times in Kitchen first.",
    "Configura primero los días y horas de cocina en Cocina.",
  ],
  cooking_migration_required: [
    "Kitchen is unavailable. Apply migration 28 and reconnect.",
    "Cocina no está disponible. Aplica la migración 28 y vuelve a conectarte.",
  ],
  invalid_cooking_settings: [
    "Check the timezone and cooking days/times.",
    "Revisa la zona horaria y los días y horas de cocina.",
  ],
  invalid_cooking_quantity: [
    "Enter a positive amount, up to 1,000,000 g.",
    "Indica una cantidad positiva, hasta 1.000.000 g.",
  ],
  invalid_cooking_command: [
    "This cooking action is no longer available. Refresh the view.",
    "Esta acción de cocina ya no está disponible. Actualiza la vista.",
  ],
  cooking_target_changed: [
    "The planned meal changed. Review the session and its reservations.",
    "La comida planificada ha cambiado. Revisa la sesión y sus reservas.",
  ],
  cooking_session_changed: [
    "Choose a future session matching the household cooking schedule.",
    "Elige una sesión futura que coincida con el horario de cocina del hogar.",
  ],
  cooking_storage_invalid: [
    "Storage cannot safely cover this meal. Check cooling, expiry and the 24-hour defrosting window.",
    "La conservación no permite cubrir esta comida. Revisa el enfriado, la caducidad y las 24 horas para descongelar.",
  ],
  cooking_expired: [
    "This container has expired; discard it.",
    "Este recipiente ha caducado; descártalo.",
  ],
  cooking_unavailable_stock: [
    "This container is reserved, used, thawing or discarded.",
    "Este recipiente está reservado, consumido, descongelándose o descartado.",
  ],
  cooking_overallocated: [
    "This meal already has enough reserved portions. Refresh before reserving more.",
    "Esta comida ya tiene suficientes raciones reservadas. Actualiza antes de reservar más.",
  ],
  cooking_review_required: [
    "Review or release the affected reservation before continuing.",
    "Revisa o libera la reserva afectada antes de continuar.",
  ],
  history_unavailable: [
    "History is unavailable. Apply migration 27 and reconnect.",
    "El historial no está disponible. Aplica la migración 27 y vuelve a conectarte.",
  ],
  history_event_unavailable: [
    "This event is no longer available in the last 90 days.",
    "Este evento ya no está disponible en los últimos 90 días.",
  ],
  invalid_history_action: [
    "This history action is invalid. Reload the menu.",
    "La acción del historial no es válida. Recarga el menú.",
  ],
  invalid_meal_times: [
    "Choose a valid time for breakfast, lunch and dinner.",
    "Elige una hora válida para el desayuno, el almuerzo y la cena.",
  ],
  meal_times_unavailable: [
    "Meal-time settings are unavailable. Apply migration 26 and try again.",
    "Los horarios aún no están disponibles. Aplica la migración 26 y vuelve a intentarlo.",
  ],
  database_timeout: [
    "The database took too long and canceled the operation. Try again shortly.",
    "La base de datos ha tardado demasiado y ha cancelado la operación. Inténtalo de nuevo en unos instantes.",
  ],
  catalogue_item_unavailable: [
    "This item is no longer available. Refresh the collection.",
    "Este elemento ya no está disponible. Actualiza la colección.",
  ],
  invalid_catalogue_cursor: [
    "The collection changed. Refresh the collection to continue.",
    "La colección ha cambiado. Actualízala para continuar.",
  ],
  invalid_catalogue_query: [
    "Choose a valid collection and search up to 200 characters.",
    "Elige una colección válida y busca con un máximo de 200 caracteres.",
  ],
  planning_update_unavailable: [
    "Meal transfers are temporarily unavailable. Update the app setup and try again.",
    "Los intercambios y pegados no están disponibles temporalmente. Actualiza la configuración de la aplicación e inténtalo de nuevo.",
  ],
  locked_suggestion: [
    "Unlock this suggestion before changing it.",
    "Desbloquea esta sugerencia antes de cambiarla.",
  ],
  mutation_outcome_unknown: [
    "We could not confirm whether the change was saved. Refresh to check before trying again.",
    "No se ha podido confirmar si el cambio se guardó. Actualiza para comprobarlo antes de intentarlo de nuevo.",
  ],
  budget_update_unavailable: [
    "Daily budget updates are temporarily unavailable. Try again after the app is updated.",
    "Los cambios de presupuesto no están disponibles temporalmente. Inténtalo tras actualizar la aplicación.",
  ],
  invalid_shopping_range: [
    "Choose a valid shopping date range.",
    "Elige un intervalo de fechas válido.",
  ],
  stale_shopping: [
    "The menu or shopping list changed. Apply the date range again.",
    "El menú o la lista cambiaron. Vuelve a aplicar el intervalo de fechas.",
  ],
  invalid_shopping_item: [
    "Enter a product name and a short quantity or note.",
    "Introduce un producto y una cantidad o nota breve.",
  ],
  operation_mismatch: [
    "This saved operation has conflicting data. Reconnect and review the list.",
    "Esta operación guardada tiene datos incompatibles. Conéctate y revisa la lista.",
  ],
  generated_item: [
    "Review menu quantities to change a generated item.",
    "Revisa las cantidades del menú para cambiar un producto generado.",
  ],
  missing_shopping_reference: [
    "An ingredient lacks its original quantity reference. Ask the owner to review the catalogue history.",
    "Falta la referencia original de cantidad de un ingrediente. Pide al propietario que revise el historial del catálogo.",
  ],
  offline_storage_unavailable: [
    "Device storage is unavailable. Shopping changes cannot be saved safely.",
    "El almacenamiento del dispositivo no está disponible. No se pueden guardar los cambios de compra con seguridad.",
  ],
  shopping_not_cached: [
    "Load the shopping list online before checking items.",
    "Carga la lista con conexión antes de marcar productos.",
  ],
  pending_shopping_changes: [
    "Synchronize pending shopping changes or explicitly discard them before signing out.",
    "Sincroniza los cambios pendientes o descártalos expresamente antes de cerrar sesión.",
  ],
  account_changed: [
    "The signed-in account changed. Reload before synchronizing.",
    "La cuenta conectada cambió. Recarga antes de sincronizar.",
  ],
  account_signed_out: [
    "This device was signed out. Sign in again to load household data.",
    "Se cerró la sesión en este dispositivo. Inicia sesión para cargar los datos.",
  ],
  offline_requires_connection: [
    "Reconnect to use this feature.",
    "Vuelve a conectarte para usar esta función.",
  ],
  invalid_sync_receipt: [
    "Synchronization could not be confirmed. Your pending changes are retained.",
    "No se pudo confirmar la sincronización. Se conservan los cambios pendientes.",
  ],
  stale_content: [
    "This content changed. Your draft is retained; reload and review before saving.",
    "El contenido cambió. Conservamos tu borrador; carga la versión actual y revísala antes de guardar.",
  ],
  stale_plan: [
    "The plan or its inputs changed. Generate a fresh preview before applying.",
    "El plan o sus datos cambiaron. Genera una nueva vista previa antes de aplicar.",
  ],
  existing_meal: [
    "Existing meals are preserved. Choose replacement explicitly to change them.",
    "Se conservan las comidas existentes. Activa la sustitución explícita para cambiarlas.",
  ],
  invalid_recipe: [
    "Review the recipe, ingredients and positive quantities.",
    "Revisa la receta, los ingredientes y las cantidades positivas.",
  ],
  invalid_ingredient: [
    "Enter names, nutrition, dietary patterns and valid conversions.",
    "Introduce nombre, nutrición, patrones alimentarios y conversiones válidas.",
  ],
  missing_conversion: [
    "This ingredient has no defined conversion for that unit.",
    "Este ingrediente no tiene una conversión definida para esa unidad.",
  ],
  missing_nutrition: [
    "Nutrition is missing or cannot be used to scale this recipe.",
    "Faltan datos nutricionales o no permiten escalar esta receta.",
  ],
  archived_ingredient: [
    "An archived ingredient or recipe cannot be selected for a new meal.",
    "No se puede seleccionar un ingrediente o receta archivado para una comida nueva.",
  ],
  diet_conflict: [
    "The ingredients conflict with a member’s dietary preferences. Review substitutions.",
    "Los ingredientes no cumplen las preferencias de un miembro. Revisa las sustituciones.",
  ],
  quantity_needs_review: [
    "An amount rounds to zero. Choose another recipe or enter a practical amount manually.",
    "Una cantidad se redondea a cero. Elige otra receta o introduce una cantidad práctica manualmente.",
  ],
  recipe_vetoed: [
    "This recipe is vetoed in the household. Choose another recipe or review the veto in Recipes.",
    "Esta receta está vetada en el hogar. Elige otra receta o revisa el veto en Recetas.",
  ],
  recipe_unavailable: [
    "This recipe is no longer in the loaded catalogue. Reload the menu before choosing again.",
    "Esta receta ya no está en el catálogo cargado. Vuelve a cargar el menú antes de elegir otra vez.",
  ],
  recipe_archived: [
    "This recipe is archived. Restore it in Recipes or choose another recipe.",
    "Esta receta está archivada. Restáurala en Recetas o elige otra receta.",
  ],
  recipe_meal_type_mismatch: [
    "This recipe is not configured for this meal type. Review its meal types in Recipes or choose another recipe.",
    "Esta receta no está configurada para este tipo de comida. Revisa sus tipos de comida en Recetas o elige otra receta.",
  ],
  no_suitable_recipe: [
    "This recipe could not be used for the destination meal. No specific cause was provided; reload the menu and try again.",
    "No se ha podido usar esta receta en la comida de destino. No se ha recibido el motivo concreto; vuelve a cargar el menú e inténtalo de nuevo.",
  ],

  correction_expired: [
    "This historical editing session ended. Reload the day and review it again.",
    "La sesión del historial ha terminado. Recarga el día y revísalo de nuevo.",
  ],
  historical_day_required: [
    "Only a closed day can be corrected here.",
    "Aquí solo se puede corregir un día cerrado.",
  ],
  historical_context_missing: [
    "Historical calorie context is missing. Review existing quantities manually; this meal cannot be scaled automatically.",
    "Falta el contexto calórico histórico. Revisa las cantidades existentes manualmente; no se puede escalar esta comida automáticamente.",
  ],
  correction_unavailable: [
    "Historical editing is not available on the server yet. Apply migration 16 before using this client.",
    "La edición del historial aún no está disponible en el servidor. Aplica la migración 16 antes de usar este cliente.",
  ],
  correction_unchanged: [
    "No meal changes to save.",
    "No hay cambios en las comidas para guardar.",
  ],
  invalid_purchasing_unit: [
    "Enter a positive, finite edible weight per egg.",
    "Introduce un peso comestible positivo y finito por huevo.",
  ],
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
  household_required: [
    "Create a household or accept an invitation to continue.",
    "Crea un hogar o acepta una invitación para continuar.",
  ],
  already_in_household: [
    "You already belong to a household. Reload to view it.",
    "Ya perteneces a un hogar. Recarga para verlo.",
  ],
  invalid_household_name: [
    "Enter a household name of 1–80 characters.",
    "Introduce un nombre de hogar de entre 1 y 80 caracteres.",
  ],
  invalid_invitation: [
    "This invitation is unavailable or belongs to another Google email address.",
    "Esta invitación no está disponible o corresponde a otra dirección de Google.",
  ],
  membership_changed: [
    "Your household access changed. Reconnect to load your current household; outdated shopping changes cannot be applied.",
    "Tu acceso al hogar ha cambiado. Vuelve a conectarte para cargar tu hogar actual; no se pueden aplicar los cambios de compra anteriores.",
  ],
};
export function errorMessage(
  error: unknown,
  language: Language,
  fallback?: string,
) {
  if (error instanceof PortionError)
    return portionErrorMessage(error, language);
  const code = error instanceof Error ? error.message : String(error);
  const found = Object.keys(messages).find((k) => code.includes(k));
  return found
    ? messages[found][language === "es" ? 1 : 0]
    : (fallback ??
        translator(language)(
          "Could not save this change. Check your connection and try again.",
          "No se ha podido guardar. Comprueba tu conexión e inténtalo de nuevo.",
        ));
}
export const mealLabel = (type: string, language: Language) =>
  ({
    breakfast: language === "es" ? "Desayuno" : "Breakfast",
    lunch: language === "es" ? "Almuerzo" : "Lunch",
    dinner: language === "es" ? "Cena" : "Dinner",
  })[type] ?? type;

function portionErrorMessage(error: PortionError, language: Language): string {
  const t = translator(language),
    c = error.context;
  const recipe = c.recipe[language] || c.recipe.en || c.recipe.es;
  const ingredient = ingredientText(c.ingredient, language);
  const diet = (
    {
      omnivore: ["omnivorous", "omnívora"],
      pescatarian: ["pescatarian", "pescetariana"],
      vegetarian: ["vegetarian", "vegetariana"],
      vegan: ["vegan", "vegana"],
    } as const
  )[c.diet][language === "es" ? 1 : 0];
  const prefix = t(
    `Cannot prepare “${recipe}” for ${c.member}: `,
    `No se puede preparar «${recipe}» para ${c.member}: `,
  );
  if (c.reason === "missing_ingredient")
    return (
      prefix +
      t(
        `ingredient “${ingredient}” is missing from the catalogue. Review the recipe in Recipes.`,
        `el ingrediente «${ingredient}» no está en el catálogo. Revisa la receta en Recetas.`,
      )
    );
  if (c.reason === "archived_ingredient")
    return (
      prefix +
      t(
        `ingredient “${ingredient}” is archived. Review it in Recipes.`,
        `el ingrediente «${ingredient}» está archivado. Revísalo en Recetas.`,
      )
    );
  if (c.reason === "missing_nutrition")
    return (
      prefix +
      t(
        `ingredient “${ingredient}” has no usable calorie data to calculate portions. Review its nutrition in Recipes.`,
        `el ingrediente «${ingredient}» no tiene datos calóricos válidos para calcular las porciones. Revisa su información nutricional en Recetas.`,
      )
    );
  const reason =
    c.reason === "excluded_ingredient"
      ? t(
          `“${ingredient}” is excluded in their profile.`,
          `«${ingredient}» está excluido en su perfil.`,
        )
      : t(
          `“${ingredient}” is incompatible with their ${diet} diet.`,
          `«${ingredient}» no es compatible con su dieta ${diet}.`,
        );
  if (!c.alternatives?.length)
    return (
      prefix +
      reason +
      " " +
      t(
        "No substitution is configured for this ingredient in this recipe. Review the person's preferences or choose another recipe.",
        "No hay una sustitución configurada para ese ingrediente en esta receta. Revisa las preferencias de esa persona o elige otra receta.",
      )
    );
  const blocked = c.alternatives
    .map((a) => {
      const food = ingredientText(a.ingredient, language);
      const why = (
        {
          missing: ["missing from the catalogue", "no está en el catálogo"],
          archived: ["archived", "está archivado"],
          excluded: ["excluded in their profile", "está excluido en su perfil"],
          diet: [
            `incompatible with their ${diet} diet`,
            `no es compatible con su dieta ${diet}`,
          ],
        } as const
      )[a.reason][language === "es" ? 1 : 0];
      return `«${food}»: ${why}`;
    })
    .join("; ");
  return (
    prefix +
    reason +
    " " +
    t(
      `The configured substitutions cannot be used (${blocked}). Review the person's preferences or choose another recipe.`,
      `No se pueden usar las sustituciones configuradas (${blocked}). Revisa las preferencias de esa persona o elige otra receta.`,
    )
  );
}
