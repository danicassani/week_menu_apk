import { EMOJIS } from "../domain/presentation";
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
import ingredientSeed from "../../content/starter/ingredients.json";
import substitutionSeed from "../../content/starter/substitutions.json";
import {
  gramsFor,
  allowed,
  varietyConflict,
  recalculateLines,
  type Ingredient,
  type PlannedRecipe,
  type MealPlan,
  type PlanningState,
} from "../domain/planning";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import activities from "../data/activities.json";
import recipes from "../../content/starter/recipes.json";
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
    if (error && uncertainMutation && error.code === "PGRST202")
      throw new DomainError("budget_update_unavailable");
    if (error) throw new DomainError(error.message);
    return data as T;
  }
  getShopping() {
    return this.rpc<ShoppingState>("get_shopping_state");
  }
  setShoppingRange(start: string, end: string) {
    return this.rpc("set_shopping_date_range", { p_start: start, p_end: end });
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
    const s = await this.rpc<HouseholdState>("get_household_snapshot");
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
  applyPlans(batch: MealPlan[], revision: number, replace: boolean) {
    return this.rpc("apply_meal_plans", {
      p_batch: batch,
      p_revision: revision,
      p_replace: replace,
    });
  }
  savePresentation(preferences: import("../domain/presentation").Presentation) {
    return this.rpc("save_my_presentation", { p_preferences: preferences });
  }
  savePlannerSettings(week: 0 | 1, variety: number) {
    return this.rpc("save_planner_settings", {
      p_week_start: week,
      p_variety_days: variety,
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

// Ephemeral, explicitly labelled preview. It never authenticates or accesses Supabase.
export class PreviewRepository implements Repository {
  private budgetCommits = new Map<
    string,
    {
      request: string;
      ack: { operation_id: string; day: string; revision: number };
    }
  >();
  mode = "preview" as const;
  readonly accountId = "preview";
  private shopping = emptyShopping();
  private receipts = new Map<string, CheckReceipt>();
  private s: HouseholdState;
  private serial = 0;
  private library: PlanningState = {
    ingredients: structuredClone(
      ingredientSeed.ingredients,
    ) as unknown as Ingredient[],
    recipes: structuredClone(recipes.recipes) as unknown as PlannedRecipe[],
    substitutions: structuredClone(substitutionSeed.rules),
    plans: [],
    revision: 0,
  };
  private lastTimestamp = Date.now();
  private timestamp(): string {
    this.lastTimestamp = Math.max(Date.now(), this.lastTimestamp + 1);
    return new Date(this.lastTimestamp).toISOString();
  }
  private baselineWeights: Record<string, number> = { alex: 80, noa: 65 };
  private baselineTimes: Record<string, string> = { alex: "", noa: "" };
  constructor(zone: string) {
    const today = localDay(zone);
    const p: Profile = {
      name: "Alex",
      age: 32,
      sex: "male",
      height_cm: 178,
      weight_kg: 80,
      activity_level: "light",
      goal: "lose",
      target_weight_kg: 75,
      target_date: addDays(today, 140),
      diet: "omnivore",
      excluded_ingredients: [],
      language: "en",
    };
    const q: Profile = {
      ...p,
      name: "Noa",
      sex: "female",
      height_cm: 168,
      weight_kg: 65,
      target_weight_kg: null,
      target_date: null,
      goal: "maintain",
      diet: "vegetarian",
    };
    const target = (id: string, profile: Profile): Target => ({
      id: crypto.randomUUID(),
      member_id: id,
      effective_date: today,
      created_at: this.timestamp(),
      ...proposeTarget(profile, today),
      budgets:
        id === "alex"
          ? { breakfast: 400, lunch: 650, dinner: 650 }
          : { breakfast: 350, lunch: 600, dinner: 600 },
      inputs: { ...profile },
    });
    const meal = (
      member_id: string,
      id: string,
      type: MealType,
      kcal: number,
    ) => ({
      member_id,
      day: today,
      type,
      kcal,
      recipe_id: id,
      name: recipes.recipes.find((r) => r.id === id)!.name,
    });
    try {
      const saved = sessionStorage.getItem("week-menu-demo-server");
      if (saved) {
        const data = JSON.parse(saved);
        this.library = data.library;
        this.shopping = data.shopping;
        this.serial = data.serial;
        this.receipts = new Map(data.receipts ?? []);
        if (data.language === "en" || data.language === "es")
          p.language = data.language;
      }
    } catch {
      /* Fresh preview if tab storage is unavailable. */
    }
    this.s = {
      server_now: new Date().toISOString(),
      viewer_id: "alex",
      household: {
        name: "Our household",
        owner_id: "alex",
        week_start: 1,
        variety_days: 3,
      },
      members: [
        {
          id: "alex",
          name: "Alex",
          status: "active",
          time_zone: zone,
          onboarded: true,
          profile: p,
          revision: 1,
        },
        {
          id: "noa",
          name: "Noa",
          status: "active",
          time_zone: zone,
          onboarded: true,
          profile: q,
          revision: 1,
        },
      ],
      targets: [target("alex", p), target("noa", q)],
      entries: [],
      days: [],
      invites: [{ email: "alex@example.com", revoked: false }],
      activity_catalogue: activities,
      meals: [
        meal("alex", "b01", "breakfast", 400),
        meal("alex", "m01", "lunch", 650),
        meal("alex", "m02", "dinner", 650),
        meal("noa", "b02", "breakfast", 350),
        meal("noa", "m01", "lunch", 600),
        meal("noa", "m02", "dinner", 600),
      ],
      budget_overrides: [],
      meal_locks: [],
    };
  }
  private persistDemo() {
    try {
      sessionStorage.setItem(
        "week-menu-demo-server",
        JSON.stringify({
          library: this.library,
          shopping: this.shopping,
          serial: this.serial,
          receipts: [...this.receipts],
          language: this.me().profile?.language ?? "en",
        }),
      );
    } catch {
      /* No real household data is stored by the simulator. */
    }
  }
  async getShopping() {
    this.me();
    this.autoShopping();
    const s = structuredClone(this.shopping);
    s.observed_at = new Date().toISOString();
    s.valid_until = shoppingValidUntil(
      this.library.plans,
      this.s,
      s.start_date,
      s.end_date,
    );
    s.observation_revision = this.serial;
    s.changes_available =
      !!s.start_date &&
      s.applied_fingerprint !==
        shoppingFingerprint(
          shoppingRequirements(
            eligibleShoppingPlans(this.library.plans, this.s),
            s.start_date,
            s.end_date!,
            this.library.ingredients,
          ),
          s.start_date,
          s.end_date!,
        );
    return s;
  }
  async previewShopping(start: string, end: string) {
    this.me();
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(start) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(end) ||
      start > end
    )
      throw new DomainError("invalid_shopping_range");
    const rows = shoppingRequirements(
      eligibleShoppingPlans(this.library.plans, this.s),
      start,
      end,
      this.library.ingredients,
    );
    return {
      start_date: start,
      end_date: end,
      content_revision: this.shopping.content_revision,
      source_fingerprint: shoppingFingerprint(rows, start, end),
      changes: shoppingChanges(this.shopping, rows),
    };
  }
  async applyShopping(p: ShoppingPreview) {
    const fresh = await this.previewShopping(p.start_date, p.end_date);
    if (
      fresh.source_fingerprint !== p.source_fingerprint ||
      fresh.content_revision !== p.content_revision
    )
      throw new DomainError("stale_shopping");
    this.shopping = applyShoppingPreview(this.shopping, fresh);
    this.serial++;
    this.persistDemo();
  }
  async setShoppingRange(start: string, end: string) {
    await this.applyShopping(await this.previewShopping(start, end));
  }
  async saveManualItem(
    id: string,
    label: string,
    amount: string,
    revision: number,
  ) {
    this.me();
    if (!label.trim() || label.length > 160 || amount.length > 80)
      throw new DomainError("invalid_shopping_item");
    const old = this.shopping.items.find((i) => i.id === id);
    if (
      old &&
      revision === 0 &&
      old.name.en === label.trim() &&
      old.amount === amount
    )
      return;
    if (old && (old.source !== "manual" || old.content_revision !== revision))
      throw new DomainError("stale_shopping");
    if (!old && revision !== 0) throw new DomainError("stale_shopping");
    const item = {
      id,
      source: "manual" as const,
      key: null,
      ingredient_id: null,
      name: { en: label.trim(), es: label.trim() },
      amount,
      quantity: null,
      unit: "",
      reference_state: "",
      quantity_basis: "",
      checked: old?.checked ?? false,
      increased: false,
      content_revision: (old?.content_revision ?? 0) + 1,
      checked_revision: old?.checked_revision ?? 0,
    };
    this.shopping.items = this.shopping.items
      .filter((i) => i.id !== id)
      .concat(item);
    this.shopping.content_revision++;
    this.serial++;
    this.persistDemo();
  }
  async deleteManualItem(id: string, revision: number) {
    this.me();
    const old = this.shopping.items.find((i) => i.id === id);
    if (!old) return;
    if (old.source !== "manual") throw new DomainError("generated_item");
    if (old.content_revision !== revision)
      throw new DomainError("stale_shopping");
    this.shopping.items = this.shopping.items.filter((i) => i.id !== id);
    this.shopping.content_revision++;
    this.serial++;
    this.persistDemo();
  }
  async checkShopping(op: CheckOperation) {
    this.me();
    const old = this.receipts.get(op.id);
    if (old) {
      if (old.item_id !== op.item_id || old.checked !== op.checked)
        throw new DomainError("operation_mismatch");
      return structuredClone(old);
    }
    const item = this.shopping.items.find((i) => i.id === op.item_id);
    if (item) {
      item.checked = op.checked;
      item.increased = op.checked ? false : item.increased;
      item.checked_revision++;
      this.serial++;
    }
    const ack: CheckReceipt = {
      operation_id: op.id,
      item_id: op.item_id,
      status: item ? "applied" : "removed",
      checked: op.checked,
      item_revision: item?.checked_revision ?? null,
    };
    this.receipts.set(op.id, ack);
    this.persistDemo();
    return structuredClone(ack);
  }
  private unlocked(day: string) {
    if (
      Date.now() >=
      Math.min(
        ...this.s.members
          .filter((m) => m.status === "active")
          .map((m) => Date.parse(dayCutoff(day, m.time_zone))),
      )
    )
      throw new DomainError("day_closed");
  }
  private syncPlans() {
    for (const m of this.library.plans) {
      this.s.meals = this.s.meals.filter(
        (x) => !(x.day === m.day && x.type === m.type),
      );
      for (const p of m.portions)
        this.s.meals.push({
          member_id: p.member_id,
          day: m.day,
          type: m.type,
          name: p.name,
          kcal: p.kcal,
          recipe_id: p.recipe_id ?? undefined,
          eating_out: p.eating_out,
        });
    }
  }
  private autoShopping() {
    const first = this.library.plans
      .map((p) => p.day)
      .filter((d) => d >= this.today())
      .sort()[0];
    if (!this.shopping.start_date && !first) return;
    const days = weekDays(first ?? this.today(), this.s.household.week_start);
    const start = this.shopping.start_date ?? days[0],
      end = this.shopping.end_date ?? days[6];
    const rows = shoppingRequirements(
      eligibleShoppingPlans(this.library.plans, this.s),
      start,
      end,
      this.library.ingredients,
    );
    const fingerprint = shoppingFingerprint(rows, start, end);
    if (
      this.shopping.start_date === start &&
      this.shopping.end_date === end &&
      this.shopping.applied_fingerprint === fingerprint
    )
      return;
    this.serial++;
    this.shopping = applyShoppingPreview(this.shopping, {
      start_date: start,
      end_date: end,
      content_revision: this.shopping.content_revision,
      source_fingerprint: fingerprint,
      changes: shoppingChanges(this.shopping, rows),
    });
    this.persistDemo();
  }
  async deleteWeek(start: string, revision: number) {
    this.me();
    if (revision !== this.serial) throw new DomainError("stale_plan");
    const end = addDays(start, 6);
    const kept = this.library.plans.filter((p) => {
      if (p.day < start || p.day > end) return true;
      try {
        this.unlocked(p.day);
        return false;
      } catch {
        return true;
      }
    });
    this.library.plans = kept;
    this.s.meals = this.s.meals.filter(
      (p) =>
        p.day < start ||
        p.day > end ||
        kept.some((k) => k.day === p.day && k.type === p.type),
    );
    this.serial++;
    this.syncPlans();
    this.autoShopping();
  }
  async deleteMeal(day: string, type: MealType, revision: number) {
    this.me();
    this.unlocked(day);
    if (revision !== this.serial) throw new DomainError("stale_plan");
    this.library.plans = this.library.plans.filter(
      (m) => !(m.day === day && m.type === type),
    );
    this.s.meals = this.s.meals.filter(
      (m) => !(m.day === day && m.type === type),
    );
    this.serial++;
    this.autoShopping();
  }
  async savePromptPreference(after: string | null) {
    this.me();
    this.library.prompt_show_after = after ?? "never";
    this.serial++;
  }
  async rateRecipe(recipeId: string, stars: number) {
    const member = this.me();
    if (
      !Number.isInteger(stars) ||
      stars < 1 ||
      stars > 5 ||
      !this.library.recipes.some((r) => r.id === recipeId)
    )
      throw new DomainError("invalid_recipe");
    this.library.ratings = (this.library.ratings ?? [])
      .filter((r) => r.recipe_id !== recipeId || r.member_id !== member.id)
      .concat({ recipe_id: recipeId, member_id: member.id, stars });
    this.serial++;
  }
  async saveContent(
    kind: "ingredient" | "recipe",
    data: Ingredient | PlannedRecipe,
    revision: number,
    archive: boolean,
  ) {
    this.me();
    const collection =
      kind === "ingredient" ? this.library.ingredients : this.library.recipes;
    const old = collection.find((x) => x.id === data.id);
    if ((old?.revision ?? (old ? 1 : 0)) !== revision)
      throw new DomainError("stale_content");
    const next = {
      ...structuredClone(data),
      revision: revision + 1,
      archived: archive,
    };
    const at = collection.findIndex((x) => x.id === data.id);
    if (at < 0) (collection as unknown[]).push(next);
    else (collection as unknown[])[at] = next;
    if (kind === "ingredient")
      for (const m of this.library.plans) {
        try {
          this.unlocked(m.day);
        } catch {
          continue;
        }
        m.portions = m.portions.map((p) =>
          p.eating_out ? p : recalculateLines(p, this.library.ingredients),
        );
        m.revision++;
      }
    this.serial++;
    this.syncPlans();
    this.autoShopping();
  }
  async applyPlans(batch: MealPlan[], revision: number, replace: boolean) {
    this.me();
    if (revision !== this.serial) throw new DomainError("stale_plan");
    const originals = structuredClone(this.library.plans),
      plans = originals.filter(
        (m) =>
          !replace || !batch.some((x) => x.day === m.day && x.type === m.type),
      );
    for (const m of batch) {
      this.unlocked(m.day);
      const old = originals.find((x) => x.day === m.day && x.type === m.type);
      if (old && !replace) throw new DomainError("existing_meal");
      for (const p of m.portions) {
        const member = this.s.members.find(
          (x) => x.id === p.member_id && x.status === "active" && x.onboarded,
        );
        if (!member?.profile) throw new DomainError("invalid_member");
        if (
          !p.eating_out &&
          p.lines.some(
            (l) =>
              !allowed(
                this.library.ingredients.find((i) => i.id === l.ingredient_id)!,
                member.profile!,
              ),
          )
        )
          throw new DomainError("diet_conflict");
      }
      if (varietyConflict(m, plans, this.s.household.variety_days))
        throw new DomainError("variety_conflict");
      const i = plans.findIndex((x) => x.day === m.day && x.type === m.type);
      const saved = { ...m, revision: (old?.revision ?? 0) + 1 };
      if (i < 0) plans.push(saved);
      else plans[i] = saved;
    }
    this.library.plans = plans;
    this.serial++;
    this.syncPlans();
    this.autoShopping();
  }
  async savePlannerSettings(week: 0 | 1, variety: number) {
    this.me();
    if (
      ![0, 1].includes(week) ||
      !Number.isInteger(variety) ||
      variety < 1 ||
      variety > 14
    )
      throw new DomainError("invalid_recipe");
    this.s.household.week_start = week;
    this.s.household.variety_days = variety;
    this.serial++;
  }
  private me() {
    const m = this.s.members.find((m) => m.id === this.s.viewer_id)!;
    if (m.status !== "active") throw new DomainError("access_denied");
    return m;
  }
  private today() {
    return localDay(this.me().time_zone);
  }
  private owner() {
    if (this.s.household.owner_id !== this.me().id)
      throw new DomainError("owner_required");
  }
  async load(zone: string) {
    this.s.server_now = new Date().toISOString();
    this.syncPlans();
    this.me().time_zone = zone;
    this.autoShopping();
    this.s.planning = { ...this.library, revision: this.serial };
    this.s.shopping = await this.getShopping();
    this.persistDemo();
    return structuredClone(this.s);
  }
  async savePresentation(
    preferences: import("../domain/presentation").Presentation,
  ) {
    if (!["standard", "large"].includes(preferences.text_size))
      throw new Error("invalid_profile");
    if (!(EMOJIS as readonly string[]).includes(preferences.avatar))
      throw new Error("invalid_profile");
    this.me().presentation = structuredClone(preferences);
    this.serial++;
  }
  async saveProfile(p: Profile, revision: number) {
    validateProfile(p);
    const m = this.me();
    if (m.revision !== revision) throw new DomainError("stale_profile");
    m.profile = structuredClone(p);
    this.baselineWeights[m.id] = p.weight_kg;
    this.baselineTimes[m.id] = this.timestamp();
    m.name = p.name;
    m.revision++;
    this.serial++;
  }
  async proposal() {
    return {
      ...proposeTarget(this.me().profile!, this.today()),
      context_revision: String(this.serial),
    };
  }
  async acceptTarget(b: Budgets, revision: string) {
    validateBudgets(b);
    if (revision !== String(this.serial))
      throw new DomainError("stale_proposal");
    const p = await this.proposal();
    this.s.targets.push({
      id: crypto.randomUUID(),
      member_id: this.me().id,
      effective_date: this.today(),
      created_at: this.timestamp(),
      ...p,
      budgets: { ...b },
      inputs: structuredClone(this.me().profile!),
    });
    this.me().onboarded = true;
    this.serial++;
  }
  async saveEntry(input: EntryInput) {
    const m = this.me(),
      day = this.today();
    const existing = input.id
      ? this.s.entries.find((e) => e.id === input.id)
      : null;
    if (
      input.id &&
      (!existing || existing.member_id !== m.id || existing.day !== day)
    )
      throw new DomainError("entry_not_editable");
    if (!Number.isFinite(input.value) || input.value < 0)
      throw new DomainError("invalid_entry");
    const a = this.s.activity_catalogue.find(
      (a) => a.code === input.activity_code,
    );
    if (
      input.kind === "activity" &&
      (!a ||
        m.profile!.age < a.age_min ||
        m.profile!.age > a.age_max ||
        input.value <= 0 ||
        input.value +
          this.s.entries
            .filter(
              (e) =>
                e.member_id === m.id &&
                e.day === day &&
                e.kind === "activity" &&
                e.id !== input.id,
            )
            .reduce((n, e) => n + e.value, 0) >
          1440)
    )
      throw new DomainError("invalid_activity");
    if (
      input.kind === "food" &&
      (!input.description.trim() || input.description.length > 160)
    )
      throw new DomainError("invalid_entry");
    if (input.kind === "weight" && input.value <= 0)
      throw new DomainError("invalid_entry");
    const now = this.timestamp(),
      id = input.id ?? crypto.randomUUID();
    this.s.entries = this.s.entries.filter((e) => e.id !== id);
    this.s.entries.push({
      id,
      member_id: m.id,
      day,
      kind: input.kind,
      description:
        input.kind === "activity"
          ? a!.code
          : input.kind === "weight"
            ? "Weight"
            : input.description,
      value: input.value,
      activity_code: a?.code ?? null,
      met: input.kind === "activity" ? a!.met : null,
      created_at: existing?.created_at ?? now,
      updated_at: now,
    });
    if (input.kind === "weight") {
      m.profile!.weight_kg = input.value;
      this.serial++;
    }
  }
  async deleteEntry(id: string) {
    const e = this.s.entries.find((e) => e.id === id);
    if (!e || e.member_id !== this.me().id || e.day !== this.today())
      throw new DomainError("entry_not_editable");
    this.s.entries = this.s.entries.filter((x) => x.id !== id);
    if (e.kind === "weight") {
      this.me().profile!.weight_kg =
        this.s.entries
          .filter(
            (x) =>
              x.member_id === this.me().id &&
              x.kind === "weight" &&
              x.updated_at > this.baselineTimes[this.me().id],
          )
          .sort((a, b) => a.updated_at.localeCompare(b.updated_at))
          .at(-1)?.value ?? this.baselineWeights[this.me().id];
      this.serial++;
    }
  }
  async saveBudgetOverride(day: string, meal: MealType, kcal: number | null) {
    const m = this.me();
    if (
      day < this.today() ||
      Date.now() >=
        Math.min(
          ...this.s.members
            .filter((x) => x.status === "active")
            .map((x) => Date.parse(dayCutoff(day, x.time_zone))),
        )
    )
      throw new DomainError("day_closed");
    if (kcal !== null && (!Number.isFinite(kcal) || kcal <= 0))
      throw new DomainError("invalid_budgets");
    this.s.budget_overrides = this.s.budget_overrides.filter(
      (b) => !(b.member_id === m.id && b.day === day && b.meal_type === meal),
    );
    if (kcal !== null)
      this.s.budget_overrides.push({
        member_id: m.id,
        day,
        meal_type: meal,
        kcal,
      });
  }
  async saveBudgetOverrides(
    day: string,
    changes: Partial<Record<MealType, number | null>>,
    operation: string,
  ) {
    const member = this.me(),
      request = JSON.stringify([day, Object.entries(changes).sort()]);
    const key = member.id + "/" + operation,
      old = this.budgetCommits.get(key);
    if (old) {
      if (old.request !== request) throw new DomainError("operation_mismatch");
      return structuredClone(old.ack);
    }
    const entries = Object.entries(changes);
    if (
      !operation ||
      !entries.length ||
      entries.length > 3 ||
      entries.some(
        ([type, kcal]) =>
          !["breakfast", "lunch", "dinner"].includes(type) ||
          (kcal !== null && (!Number.isFinite(kcal) || !(kcal! > 0))),
      )
    )
      throw new DomainError("invalid_budgets");
    this.unlocked(day);
    if (day < this.today()) throw new DomainError("day_closed");
    this.s.budget_overrides = this.s.budget_overrides
      .filter(
        (b) =>
          !(
            b.member_id === member.id &&
            b.day === day &&
            Object.hasOwn(changes, b.meal_type)
          ),
      )
      .concat(
        entries.flatMap(([meal, kcal]) =>
          kcal === null
            ? []
            : [
                {
                  member_id: member.id,
                  day,
                  meal_type: meal as MealType,
                  kcal: kcal!,
                },
              ],
        ),
      );
    const ack = { operation_id: operation, day, revision: ++this.serial };
    this.budgetCommits.set(key, { request, ack });
    return structuredClone(ack);
  }
  async invite(email: string) {
    this.owner();
    email = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw new DomainError("invalid_email");
    const i = this.s.invites.find((i) => i.email === email);
    if (i) i.revoked = false;
    else this.s.invites.push({ email, revoked: false });
  }
  async remove(id: string) {
    this.owner();
    if (id === this.me().id) throw new DomainError("transfer_before_leaving");
    this.removeData(id);
  }
  private removeData(id: string) {
    const m = this.s.members.find((m) => m.id === id && m.status === "active");
    if (!m) throw new DomainError("invalid_member");
    m.status = "removed";
    for (const plan of this.library.plans) {
      try {
        this.unlocked(plan.day);
      } catch {
        continue;
      }
      plan.portions = plan.portions.filter((p) => p.member_id !== id);
      plan.revision++;
    }
    this.serial++;
    this.syncPlans();
    this.s.budget_overrides = this.s.budget_overrides.filter(
      (b) => b.member_id !== id || b.day <= localDay(m.time_zone),
    );
  }
  async transfer(id: string) {
    this.owner();
    if (!this.s.members.some((m) => m.id === id && m.status === "active"))
      throw new DomainError("invalid_member");
    this.s.household.owner_id = id;
  }
  async leave() {
    if (this.s.household.owner_id === this.me().id)
      throw new DomainError("transfer_before_leaving");
    this.removeData(this.me().id);
  }
  async signOut(discardPending = false) {
    await requireDiscardOrSynced(this.accountId, discardPending);
    try {
      sessionStorage.removeItem("week-menu-demo-server");
      sessionStorage.removeItem("week-menu-preview-active");
    } catch {
      /* Ephemeral fallback. */
    }
  }
}
