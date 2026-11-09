import type {
  CatalogueKind,
  CatalogueQuery,
  CataloguePage,
  CatalogueDetail,
} from "../domain/catalogue";
import { EMOJIS } from "../domain/presentation";
import {
  buildTransfer,
  type TransferRequest,
  type TransferPreview,
} from "../domain/planning-transfer";
import { authStorage, AUTH_STORAGE_KEY, clearLocalAuth } from "./auth-storage";
import { requireDiscardOrSynced, purgeOfflineAccount } from "./offline-store";
import {
  offlineKey,
  assertOperationContext,
  type HouseholdAccess,
  type HouseholdContext,
} from "../domain/households";
import {
  emptyShopping,
  shoppingRequirements,
  shoppingChanges,
  shoppingFingerprint,
  applyShoppingPreview,
  eligibleShoppingPlans,
  shoppingValidUntil,
  type ShoppingState,
  type ShoppingPreview,
  type CheckOperation,
  type CheckReceipt,
} from "../domain/shopping";
import {
  gramsFor,
  allowed,
  recalculateLines,
  type Ingredient,
  type PlannedRecipe,
  type MealPlan,
  type PlanningState,
} from "../domain/planning";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  DomainError,
  proposeTarget,
  validateBudgets,
  validateProfile,
} from "../domain/calories";
import { addDays, dayCutoff, localDay, weekDays } from "../domain/dates";
import type {
  Budgets,
  EntryInput,
  HouseholdState,
  MealType,
  Profile,
  Repository,
  Target,
} from "../domain/types";

const url = import.meta.env.VITE_SUPABASE_URL,
  key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        auth: {
          flowType: "pkce",
          detectSessionInUrl: true,
          storage: authStorage,
          storageKey: AUTH_STORAGE_KEY,
        },
      })
    : null;
export const previewAvailable =
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_PREVIEW === "true";
export class SupabaseRepository implements Repository {
  mode = "supabase" as const;
  private context: HouseholdContext | null;
  private loadSequence = 0;
  get offlineId() {
    return this.context ? offlineKey(this.context) : this.accountId;
  }
  constructor(
    private client: SupabaseClient,
    readonly accountId: string,
    context: HouseholdContext | null = null,
  ) {
    this.context = context?.account_id === accountId ? context : null;
  }
  private async rpc<T = void>(
    name: string,
    args?: Record<string, unknown>,
    scoped = true,
    uncertainMutation = false,
  ): Promise<T> {
    const context = this.context;
    if (scoped && !context) throw new DomainError("household_required");
    const {
      data: { session },
      error: authError,
    } = await this.client.auth.getSession();
    if (authError) throw authError;
    if (!session || session.user.id !== this.accountId)
      throw new DomainError("account_changed");
    let response;
    try {
      response = await this.client
        .rpc(name, {
          ...args,
          ...(scoped
            ? {
                p_household_id: context!.household_id,
                p_membership_id: context!.membership_id,
              }
            : {}),
        })
        .setHeader("Authorization", `Bearer ${session.access_token}`);
    } catch (error) {
      if (uncertainMutation) throw new DomainError("mutation_outcome_unknown");
      throw error;
    }
    const { data, error } = response;
    if (error && uncertainMutation && !error.code)
      throw new DomainError("mutation_outcome_unknown");
    if (error?.code === "PGRST202" && name === "apply_meal_plans_with_history")
      throw new DomainError("history_unavailable");
    if (
      error &&
      error.code === "PGRST202" &&
      (uncertainMutation || name === "preview_meal_transfer")
    )
      throw new DomainError(
        name.includes("historical_correction")
          ? "correction_unavailable"
          : name === "save_my_meal_budgets"
            ? "budget_update_unavailable"
            : "planning_update_unavailable",
      );
    if (
      error &&
      error.code === "PGRST202" &&
      /historical_correction/.test(name)
    )
      throw new DomainError("correction_unavailable");
    if (error?.code === "PGRST202" && name === "save_my_meal_times")
      throw new DomainError("meal_times_unavailable");
    if (error?.code === "PGRST202" && name.startsWith("get_planning_history"))
      throw new DomainError("history_unavailable");
    if (error?.code === "57014" && /statement timeout/i.test(error.message))
      throw new DomainError("database_timeout");
    if (error) throw new DomainError(error.message);
    return data as T;
  }
  beginCorrection(day: string, revision: number) {
    return this.rpc<import("../domain/history").CorrectionSession>(
      "begin_historical_correction",
      { p_day: day, p_revision: revision },
    );
  }
  applyCorrection(
    session: import("../domain/history").CorrectionSession,
    action: "save" | "erase",
    plans: MealPlan[],
  ) {
    return this.rpc<import("../domain/history").CorrectionAck>(
      "apply_historical_correction",
      {
        p_token: session.token,
        p_day: session.day,
        p_action: action,
        p_plans: plans,
      },
      true,
      true,
    );
  }
  cancelCorrection(token: string) {
    return this.rpc("cancel_historical_correction", { p_token: token });
  }
  correctionHistory(day: string) {
    return this.rpc<import("../domain/history").CorrectionEvent[]>(
      "get_historical_corrections",
      { p_day: day },
    );
  }
  getPlanningLibrary() {
    return this.rpc<PlanningState>("get_planning_library");
  }
  cataloguePage(q: CatalogueQuery) {
    return this.rpc<CataloguePage>("get_catalogue_page", {
      p_kind: q.kind,
      p_query: q.query,
      p_archived: q.archived,
      p_cursor: q.cursor ?? null,
    });
  }
  getRecipeReview() {
    return this.rpc<{ reviewed_recipe_ids: string[] }>("get_recipe_review");
  }
  resetRecipeReview() {
    return this.rpc<{ reviewed_recipe_ids: string[] }>("reset_recipe_review");
  }
  reviewRecipe(recipe: PlannedRecipe, banned: boolean) {
    return this.rpc<PlannedRecipe>(
      "review_recipe",
      {
        p_recipe_id: recipe.id,
        p_banned: banned,
        p_revision: recipe.veto_revision ?? 0,
        p_content_revision: recipe.revision ?? 1,
      },
      true,
      true,
    );
  }
  setRecipeVeto(recipe: PlannedRecipe, banned: boolean) {
    return this.rpc<PlannedRecipe>(
      "set_recipe_veto",
      {
        p_recipe_id: recipe.id,
        p_banned: banned,
        p_revision: recipe.veto_revision ?? 0,
      },
      true,
      true,
    );
  }
  catalogueItem(kind: CatalogueKind, id: string) {
    return this.rpc<CatalogueDetail>("get_catalogue_item", {
      p_kind: kind,
      p_id: id,
    });
  }
  saveEggPurchasingUnit(grams: number | null, revision: number) {
    return this.rpc(
      "save_egg_purchasing_unit",
      {
        p_grams_per_egg: grams,
        p_revision: revision,
      },
      true,
      true,
    );
  }
  getShopping() {
    return this.rpc<ShoppingState>("get_shopping_state");
  }
  setShoppingRange(start: string, end: string) {
    return this.rpc("set_shopping_date_range", { p_start: start, p_end: end });
  }
  previewTransfer(request: TransferRequest) {
    return this.rpc<TransferPreview>("preview_meal_transfer", {
      p_request: request,
    });
  }
  applyTransfer(
    request: TransferRequest,
    preview: TransferPreview,
    overwrite: boolean,
  ) {
    return this.rpc(
      "apply_meal_transfer",
      {
        p_request: request,
        p_revision: preview.revision,
        p_fingerprint: preview.fingerprint,
        p_overwrite: overwrite,
      },
      true,
      true,
    );
  }
  previewShopping(start: string, end: string) {
    return this.rpc<ShoppingPreview>("preview_shopping_list", {
      p_start: start,
      p_end: end,
    });
  }
  applyShopping(p: ShoppingPreview) {
    return this.rpc("apply_shopping_list", {
      p_start: p.start_date,
      p_end: p.end_date,
      p_revision: p.content_revision,
      p_fingerprint: p.source_fingerprint,
    });
  }
  saveManualItem(id: string, label: string, amount: string, revision: number) {
    return this.rpc("save_manual_shopping_item", {
      p_id: id,
      p_label: label,
      p_amount: amount,
      p_revision: revision,
    });
  }
  deleteManualItem(id: string, revision: number) {
    return this.rpc("delete_manual_shopping_item", {
      p_id: id,
      p_revision: revision,
    });
  }
  checkShopping(op: CheckOperation) {
    assertOperationContext(this.context, op);
    return this.rpc<CheckReceipt>("set_shopping_checked", {
      p_operation: op.id,
      p_item: op.item_id,
      p_checked: op.checked,
    });
  }
  async load(zone: string) {
    const sequence = ++this.loadSequence;
    const access = await this.householdAccess();
    if (sequence !== this.loadSequence)
      throw new DomainError("request_superseded");
    if (!access.active) {
      if (this.context)
        await purgeOfflineAccount(this.offlineId).catch(() => {});
      this.context = null;
      throw new DomainError("household_required");
    }
    if (
      this.context &&
      offlineKey(this.context) !== offlineKey(access.active)
    ) {
      await purgeOfflineAccount(this.offlineId).catch(() => {});
      this.context = null;
      throw new DomainError("membership_changed");
    }
    this.context = access.active;
    await this.rpc("bootstrap_member", { p_timezone: zone }, false);
    const s = await this.rpc<HouseholdState>("get_household_snapshot", {
      p_compact: true,
    });
    if (sequence !== this.loadSequence)
      throw new DomainError("request_superseded");
    return s;
  }
  householdAccess() {
    return this.rpc<HouseholdAccess>("get_household_access", undefined, false);
  }
  createHousehold(name: string, timezone: string) {
    return this.rpc<void>(
      "create_household",
      { p_name: name, p_timezone: timezone },
      false,
    );
  }
  joinHousehold(invitation: string, timezone: string) {
    return this.rpc<void>(
      "join_household",
      { p_invitation: invitation, p_timezone: timezone },
      false,
    );
  }
  deleteMeal(day: string, type: MealType, revision: number) {
    return this.rpc("delete_planned_meal", {
      p_day: day,
      p_type: type,
      p_revision: revision,
    });
  }
  deleteWeek(start: string, revision: number) {
    return this.rpc("delete_planned_week", {
      p_start: start,
      p_revision: revision,
    });
  }
  savePromptPreference(after: string | null) {
    return this.rpc("save_recipe_prompt_preference", { p_after: after });
  }
  rateRecipe(recipeId: string, stars: number) {
    return this.rpc("rate_recipe", { p_recipe_id: recipeId, p_stars: stars });
  }
  saveContent(
    kind: "ingredient" | "recipe",
    data: Ingredient | PlannedRecipe,
    revision: number,
    archive: boolean,
  ) {
    return this.rpc("save_household_content", {
      p_kind: kind,
      p_data: data,
      p_revision: revision,
      p_archive: archive,
    });
  }
  planningHistory(
    filters: import("../domain/planning-history").HistoryFilters = {},
    cursor: import("../domain/planning-history").HistoryCursor | null = null,
  ) {
    return this.rpc<import("../domain/planning-history").PlanningHistoryPage>(
      "get_planning_history",
      { p_filters: filters, p_cursor: cursor },
    );
  }
  planningHistoryEvent(id: string) {
    return this.rpc<import("../domain/planning-history").PlanningHistoryEvent>(
      "get_planning_history_event",
      { p_event_id: id },
    );
  }
  applyPlans(
    batch: MealPlan[],
    revision: number,
    replace: boolean,
    operation?: import("../domain/planning-history").HistoryOperation,
  ) {
    return this.rpc(
      operation ? "apply_meal_plans_with_history" : "apply_meal_plans",
      {
        p_batch: batch,
        p_revision: revision,
        p_replace: replace,
        ...(operation
          ? { p_operation: operation.id, p_action: operation.action }
          : {}),
      },
      true,
      !!operation,
    );
  }
  savePresentation(preferences: import("../domain/presentation").Presentation) {
    return this.rpc("save_my_presentation", { p_preferences: preferences });
  }
  saveMealTimes(times: import("../domain/meal-times").MealTimes) {
    return this.rpc("save_my_meal_times", { p_times: times });
  }
  savePlannerSettings(week: 0 | 1) {
    return this.rpc("save_planner_settings", {
      p_week_start: week,
      p_variety_days: 3, // Legacy RPC argument; ignored after migration 21.
    });
  }
  saveProfile(p: Profile, revision: number) {
    return this.rpc("save_my_profile", { p_data: p, p_revision: revision });
  }
  proposal() {
    return this.rpc<Awaited<ReturnType<Repository["proposal"]>>>(
      "get_my_target_proposal",
    );
  }
  acceptTarget(b: Budgets, revision: string) {
    return this.rpc("accept_my_target", { p_budgets: b, p_context: revision });
  }
  saveEntry(e: EntryInput) {
    return this.rpc("save_my_daily_entry", {
      p_kind: e.kind,
      p_description: e.description,
      p_value: e.value,
      p_activity_code: e.activity_code ?? null,
      p_id: e.id ?? null,
    });
  }
  deleteEntry(id: string) {
    return this.rpc("delete_my_daily_entry", { p_id: id });
  }
  saveBudgetOverride(day: string, meal: MealType, kcal: number | null) {
    return this.rpc("save_my_budget_override", {
      p_day: day,
      p_meal: meal,
      p_kcal: kcal,
    });
  }
  async saveBudgetOverrides(
    day: string,
    changes: Partial<Record<MealType, number | null>>,
    operation: string,
  ) {
    const ack = await this.rpc<{
      operation_id: string;
      day: string;
      revision: number;
    }>(
      "save_my_meal_budgets",
      { p_day: day, p_changes: changes, p_operation: operation },
      true,
      true,
    );
    if (ack?.operation_id !== operation || ack?.day !== day)
      throw new DomainError("mutation_outcome_unknown");
    return ack;
  }
  invite(email: string) {
    return this.rpc("invite_member", { p_email: email });
  }
  remove(id: string) {
    return this.rpc("remove_member", { p_member: id });
  }
  transfer(id: string) {
    return this.rpc("transfer_ownership", { p_member: id });
  }
  leave() {
    return this.rpc("leave_household");
  }
  async signOut(discardPending = false) {
    await requireDiscardOrSynced(this.offlineId, discardPending);
    await this.client.auth.stopAutoRefresh();
    if (navigator.onLine) {
      try {
        await this.client.auth.signOut({ scope: "local" });
      } catch {
        /* Local sign-out still completes; remote revocation may need connectivity. */
      }
    }
    clearLocalAuth();
  }
}
