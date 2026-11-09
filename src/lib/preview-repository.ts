import {
  historyActionLabel,
  type HistoryAction,
  type HistoryOperation,
  type HistoryFilters,
  type HistoryCursor,
  type PlanningHistoryEvent,
  type PlanningHistoryPage,
} from "../domain/planning-history";
import {
  DEFAULT_MEAL_TIMES,
  validMealTimes,
  type MealTimes,
} from "../domain/meal-times";
import expansion from "../../content/expansions/requested-recipes.json" with { type: "json" };
import { ingredientMatches } from "../domain/content-presentation";
import {
  historicalQuantities,
  type CorrectionSession,
  type CorrectionAck,
  type CorrectionEvent,
} from "../domain/history";
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
  shoppingCutoff,
  type ShoppingState,
  type ShoppingPreview,
  type CheckOperation,
  type CheckReceipt,
} from "../domain/shopping";
import ingredientSeed from "../../content/starter/ingredients.json" with { type: "json" };
import substitutionSeed from "../../content/starter/substitutions.json" with { type: "json" };
import {
  gramsFor,
  allowed,
  recalculateLines,
  type Ingredient,
  type PlannedRecipe,
  type MealPlan,
  type PlanningState,
} from "../domain/planning";
import activities from "../data/activities.json" with { type: "json" };
import recipes from "../../content/starter/recipes.json" with { type: "json" };
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

// Ephemeral, explicitly labelled preview. It never authenticates or accesses Supabase.
export class PreviewRepository implements Repository {
  private correctionSessions = new Map<string, CorrectionSession>();
  private corrections: CorrectionEvent[] = [];
  private correctionReceipts = new Map<
    string,
    { request: string; ack: CorrectionAck }
  >();
  private closedDay(day: string) {
    return (
      this.s.meal_locks.some((l) => l.day === day && l.closed) ||
      Date.now() >=
        Math.min(
          ...this.s.members
            .filter((m) => m.status === "active")
            .map((m) => Date.parse(dayCutoff(day, m.time_zone))),
        )
    );
  }
  async beginCorrection(day: string, revision: number) {
    if (!this.closedDay(day)) throw new DomainError("historical_day_required");
    if (revision !== this.serial) throw new DomainError("stale_plan");
    this.correctionSessions.clear();
    const session: CorrectionSession = {
      token: crypto.randomUUID(),
      day,
      revision,
      expires_at: new Date(Date.now() + 600000).toISOString(),
      plans: structuredClone(this.library.plans.filter((p) => p.day === day)),
    };
    this.correctionSessions.set(session.token, session);
    return structuredClone(session);
  }
  async cancelCorrection(token: string) {
    this.correctionSessions.delete(token);
  }
  async correctionHistory(day: string) {
    return structuredClone(this.corrections.filter((e) => e.day === day));
  }
  async applyCorrection(
    session: CorrectionSession,
    action: "save" | "erase",
    plans: MealPlan[],
  ) {
    const request = JSON.stringify({ day: session.day, action, plans }),
      receipt = this.correctionReceipts.get(session.token);
    if (receipt) {
      if (receipt.request !== request)
        throw new DomainError("operation_mismatch");
      return structuredClone(receipt.ack);
    }
    const current = this.correctionSessions.get(session.token);
    if (
      !current ||
      current.day !== session.day ||
      Date.parse(current.expires_at) <= Date.now()
    )
      throw new DomainError("correction_expired");
    if (current.revision !== this.serial) throw new DomainError("stale_plan");
    if (!this.closedDay(session.day))
      throw new DomainError("historical_day_required");
    if (
      plans.length > 3 ||
      new Set(plans.map((p) => p.type)).size !== plans.length ||
      (action === "erase" && plans.length)
    )
      throw new DomainError("invalid_recipe");
    const corrected = plans.map((plan) => {
      if (plan.day !== session.day) throw new DomainError("invalid_recipe");
      const previous = current.plans.find((p) => p.type === plan.type);
      return {
        ...plan,
        revision: (previous?.revision ?? 0) + 1,
        portions: plan.portions.map((p) => {
          const old = previous?.portions.find(
            (o) => o.member_id === p.member_id,
          );
          if (
            !old &&
            !this.s.days.some(
              (d) =>
                d.day === session.day &&
                d.member_id === p.member_id &&
                d.closed,
            )
          )
            throw new DomainError("invalid_member");
          return JSON.stringify(old) === JSON.stringify(p)
            ? structuredClone(old!)
            : historicalQuantities(
                { ...p, budget: old?.budget ?? p.budget },
                old,
                this.library.ingredients,
              );
        }),
      };
    });
    this.library.plans = [
      ...this.library.plans.filter((p) => p.day !== session.day),
      ...corrected,
    ];
    this.s.meals = this.s.meals.filter((p) => p.day !== session.day);
    this.serial++;
    this.syncPlans();
    this.autoShopping();
    this.persistDemo();
    const ack: CorrectionAck = {
      day: session.day,
      action,
      revision: this.serial,
    };
    this.corrections.push({
      id: crypto.randomUUID(),
      day: session.day,
      member_id: this.s.viewer_id,
      action,
      created_at: new Date().toISOString(),
      before_meals: structuredClone(current.plans),
      after_meals: structuredClone(corrected),
    });
    this.correctionReceipts.set(session.token, { request, ack });
    this.correctionSessions.delete(session.token);
    return structuredClone(ack);
  }
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
  private eggPurchasing = { grams: 50, revision: 0, custom: false };
  async saveEggPurchasingUnit(grams: number | null, revision: number) {
    this.me();
    if (grams !== null && (!Number.isFinite(grams) || grams <= 0))
      throw new DomainError("invalid_purchasing_unit");
    if (revision !== this.eggPurchasing.revision) {
      if (
        this.eggPurchasing.revision === revision + 1 &&
        this.eggPurchasing.grams === (grams ?? 50) &&
        this.eggPurchasing.custom === (grams !== null)
      )
        return;
      throw new DomainError("stale_content");
    }
    this.eggPurchasing = {
      grams: grams ?? 50,
      revision: revision + 1,
      custom: grams !== null,
    };
    this.serial++;
    this.persistDemo();
  }
  private upcomingBounds() {
    const days = eligibleShoppingPlans(this.library.plans, this.s)
      .map((p) => p.day)
      .sort();
    const start = days[0] ?? this.shopping.start_date ?? this.today();
    return [start, days.at(-1) ?? start] as const;
  }
  private receipts = new Map<string, CheckReceipt>();
  private s: HouseholdState;
  private serial = 0;
  private library: PlanningState = {
    ingredients: structuredClone([
      ...ingredientSeed.ingredients,
      ...expansion.ingredients,
    ]) as unknown as Ingredient[],
    recipes: structuredClone([
      ...recipes.recipes,
      ...expansion.recipes,
    ]) as unknown as PlannedRecipe[],
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
        if (data.eggPurchasing) this.eggPurchasing = data.eggPurchasing;
        this.recipeReviews = data.recipeReviews ?? {};
        this.mealTimes = Object.fromEntries(
          Object.entries(data.mealTimes ?? {}).filter(([, times]) =>
            validMealTimes(times),
          ),
        ) as Record<string, MealTimes>;
        this.historyEvents = data.historyEvents ?? [];
        this.historyStarted = data.historyStarted ?? this.historyStarted;
        this.historyOperations = new Map(data.historyOperations ?? []);
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
          meal_times: { ...(this.mealTimes.alex ?? DEFAULT_MEAL_TIMES) },
          name: "Alex",
          status: "active",
          time_zone: zone,
          onboarded: true,
          profile: p,
          revision: 1,
        },
        {
          id: "noa",
          meal_times: { ...(this.mealTimes.noa ?? DEFAULT_MEAL_TIMES) },
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
    this.installHistory();
  }
  private historyEvents: PlanningHistoryEvent[] = [];
  private historyStarted = new Date().toISOString();
  private historyOperations = new Map<string, string>();
  private historyDepth = 0;
  private historySnapshot() {
    const clean = (v: unknown) =>
      JSON.parse(
        JSON.stringify(v, (key, value) =>
          [
            "recipe_snapshot",
            "revision",
            "nutrition_revision",
            "created_at",
            "updated_at",
            "veto_revision",
          ].includes(key)
            ? undefined
            : value,
        ),
      );
    const result: Record<string, { kind: string; value: unknown }> = {};
    const add = (kind: string, key: string, value: unknown) => {
      result[kind + ":" + key] = { kind, value: clean(value) };
    };
    for (const p of this.library.plans)
      add("meal_plans", p.day + "/" + p.type, {
        ...p,
        portions: p.portions.map((x) => ({
          ...x,
          member: this.s.members.find((m) => m.id === x.member_id)?.name,
          recipe: x.name,
        })),
      });
    for (const r of this.library.recipes) add("saved_recipes", r.id, r);
    for (const f of this.library.ingredients) add("food_items", f.id, f);
    for (const m of this.s.members)
      add("profiles", m.id, {
        member: m.name,
        diet: m.profile?.diet,
        excluded_ingredients: m.profile?.excluded_ingredients,
      });
    for (const t of this.s.targets)
      add("targets", t.id, {
        member: this.s.members.find((m) => m.id === t.member_id)?.name,
        day: t.effective_date,
        daily_kcal: t.daily_kcal,
        budgets: t.budgets,
      });
    for (const b of this.s.budget_overrides)
      add("budget_overrides", b.member_id + b.day + b.meal_type, {
        ...b,
        type: b.meal_type,
        member: this.s.members.find((m) => m.id === b.member_id)?.name,
      });
    add("household", "week", { week_start: this.s.household.week_start });
    return result;
  }
  private installHistory() {
    const actions: Record<string, HistoryAction> = {
      applyPlans: "legacy",
      deleteMeal: "delete_meal",
      deleteWeek: "delete_week",
      applyTransfer: "transfer",
      applyCorrection: "correction",
      saveContent: "catalogue",
      saveProfile: "profile",
      acceptTarget: "target",
      saveBudgetOverride: "budget",
      saveBudgetOverrides: "budget",
      setRecipeVeto: "veto",
      reviewRecipe: "veto",
      savePlannerSettings: "week_start",
    };
    const self = this as unknown as Record<
      string,
      (...args: any[]) => Promise<any>
    >;
    for (const [method, action] of Object.entries(actions)) {
      const original = self[method].bind(this);
      self[method] = async (...args: any[]) => {
        const outer = this.historyDepth++ === 0,
          before = outer ? this.historySnapshot() : null;
        try {
          const value = await original(...args);
          if (before) {
            const after = this.historySnapshot(),
              changes: NonNullable<PlanningHistoryEvent["changes"]> = {};
            for (const key of new Set([
              ...Object.keys(before),
              ...Object.keys(after),
            ])) {
              const b = before[key]?.value ?? null,
                n = after[key]?.value ?? null;
              if (JSON.stringify(b) !== JSON.stringify(n))
                changes[key] = {
                  kind: (after[key] ?? before[key]).kind,
                  before: b,
                  after: n,
                };
            }
            if (Object.keys(changes).length) {
              const a =
                method === "applyPlans"
                  ? (args[3]?.action ?? action)
                  : method === "applyTransfer"
                    ? args[0].mode === "swap"
                      ? "swap"
                      : "paste"
                    : action;
              const actor = this.me();
              const count = Object.keys(changes).length;
              this.historyEvents.unshift({
                id: crypto.randomUUID(),
                actor_id: actor.id,
                actor_name: actor.name,
                action: a,
                created_at: new Date().toISOString(),
                imported: false,
                summary: {
                  en: `${actor.name} updated planning (${count} changes) using “${historyActionLabel(a, "en")}”.`,
                  es: `${actor.name} ha actualizado la planificación (${count} cambios) usando «${historyActionLabel(a, "es")}».`,
                },
                changes,
              });
            }
            this.historyEvents = this.historyEvents.filter(
              (e) => Date.parse(e.created_at) >= Date.now() - 90 * 86400000,
            );
            this.persistDemo();
          }
          return value;
        } finally {
          this.historyDepth--;
        }
      };
    }
  }
  async planningHistory(
    filters: HistoryFilters = {},
    cursor: HistoryCursor | null = null,
  ): Promise<PlanningHistoryPage> {
    this.me();
    const events = this.historyEvents
      .filter(
        (e) =>
          Date.parse(e.created_at) >= Date.now() - 90 * 86400000 &&
          (!filters.actor ||
            e.actor_name
              .toLocaleLowerCase()
              .includes(filters.actor.toLocaleLowerCase())) &&
          (!filters.action || e.action === filters.action) &&
          (!filters.from || e.created_at >= filters.from) &&
          (!filters.until || e.created_at < filters.until) &&
          (!cursor ||
            e.created_at < cursor.created_at ||
            (e.created_at === cursor.created_at && e.id < cursor.id)),
      )
      .sort(
        (a, b) =>
          b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id),
      );
    const selected = events.slice(0, 50).map((e) => ({
      ...e,
      changes: undefined,
      change_count: Object.keys(e.changes ?? {}).length,
    }));
    const last = selected.at(-1);
    return {
      events: structuredClone(selected),
      next_cursor:
        events.length > 50 && last
          ? { id: last.id, created_at: last.created_at }
          : null,
      complete_since: this.historyStarted,
    };
  }
  async planningHistoryEvent(id: string) {
    this.me();
    const event = this.historyEvents.find(
      (e) =>
        e.id === id && Date.parse(e.created_at) >= Date.now() - 90 * 86400000,
    );
    if (!event) throw new DomainError("history_event_unavailable");
    return structuredClone(event);
  }
  private persistDemo() {
    try {
      sessionStorage.setItem(
        "week-menu-demo-server",
        JSON.stringify({
          library: this.library,
          shopping: this.shopping,
          eggPurchasing: this.eggPurchasing,
          recipeReviews: this.recipeReviews,
          mealTimes: this.mealTimes,
          historyEvents: this.historyEvents,
          historyStarted: this.historyStarted,
          historyOperations: [...this.historyOperations],
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
    s.changes_available = false;
    s.scope = "upcoming";
    s.contributions_complete = true;
    const eligible = eligibleShoppingPlans(this.library.plans, this.s);
    s.contributions = [...new Set(eligible.map((p) => p.day))]
      .sort()
      .map((day) => ({
        day,
        cutoff: new Date(shoppingCutoff(this.s, day)).toISOString(),
        items: shoppingRequirements(
          eligible,
          day,
          day,
          this.library.ingredients,
        ),
      }));
    s.purchasing = [
      {
        ingredient_id: "egg",
        unit: "egg",
        grams_per_unit: this.eggPurchasing.grams,
        estimated: true,
        origin: this.eggPurchasing.custom
          ? "household_estimate"
          : "starter_estimate",
        revision: this.eggPurchasing.revision,
        reference_state: "raw_edible",
        quantity_basis: "edible_reference_weight",
      },
    ];
    s.items = s.items.map((i) =>
      i.source === "generated" &&
      i.ingredient_id === "egg" &&
      i.reference_state === "raw_edible" &&
      i.quantity_basis === "edible_reference_weight"
        ? { ...i, purchasing_unit: s.purchasing![0] }
        : i,
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
    [start, end] = this.upcomingBounds();
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
  async getPlanningLibrary() {
    this.me();
    this.autoShopping();
    return structuredClone({
      ...this.library,
      complete: true,
      revision: this.serial,
    });
  }
  private recipeReviews: Record<string, number> = {};
  private mealTimes: Record<string, MealTimes> = {};
  async getRecipeReview() {
    return {
      reviewed_recipe_ids: this.library.recipes
        .filter(
          (r) => !r.archived && this.recipeReviews[r.id] === (r.revision ?? 1),
        )
        .map((r) => r.id),
    };
  }
  async resetRecipeReview() {
    this.me();
    this.recipeReviews = {};
    this.persistDemo();
    return { reviewed_recipe_ids: [] };
  }
  async reviewRecipe(recipe: PlannedRecipe, banned: boolean) {
    const current = this.library.recipes.find((r) => r.id === recipe.id);
    if (!current || current.archived || current.revision !== recipe.revision)
      throw new DomainError("stale_content");
    const next = await this.setRecipeVeto(recipe, banned);
    this.recipeReviews[recipe.id] = recipe.revision ?? 1;
    this.persistDemo();
    return next;
  }
  async setRecipeVeto(recipe: PlannedRecipe, banned: boolean) {
    this.me();
    const current = this.library.recipes.find((r) => r.id === recipe.id);
    if (!current) throw new DomainError("catalogue_item_unavailable");
    if ((current.veto_revision ?? 0) !== (recipe.veto_revision ?? 0)) {
      if (
        current.veto_revision === (recipe.veto_revision ?? 0) + 1 &&
        current.banned === banned
      )
        return { ...structuredClone(current), household_revision: this.serial };
      throw new DomainError("stale_content");
    }
    current.banned = banned;
    current.veto_revision = (current.veto_revision ?? 0) + 1;
    this.serial++;
    this.persistDemo();
    return { ...structuredClone(current), household_revision: this.serial };
  }
  async catalogueItem(
    kind: CatalogueKind,
    id: string,
  ): Promise<CatalogueDetail> {
    this.me();
    const item = (
      kind === "recipe" ? this.library.recipes : this.library.ingredients
    ).find((i) => i.id === id);
    if (!item) throw new DomainError("catalogue_item_unavailable");
    return structuredClone({
      item,
      ingredients:
        kind === "recipe"
          ? this.library.ingredients.filter((f) =>
              (item as PlannedRecipe).components.some((c) =>
                c.ingredients.some((l) => l.ingredient_id === f.id),
              ),
            )
          : [],
    });
  }
  async cataloguePage(q: CatalogueQuery): Promise<CataloguePage> {
    this.me();
    const query = q.query.toLowerCase(),
      all = (
        q.kind === "recipe" ? this.library.recipes : this.library.ingredients
      )
        .filter(
          (i) =>
            (q.archived || !i.archived) &&
            (q.kind === "ingredient"
              ? ingredientMatches(i, query)
              : i.name.en.toLowerCase().includes(query) ||
                i.name.es.toLowerCase().includes(query)),
        )
        .sort((a, b) => {
          const at = String((a as any).created_at ?? ""),
            bt = String((b as any).created_at ?? "");
          return at === bt ? (a.id < b.id ? -1 : 1) : at > bt ? -1 : 1;
        });
    let offset = 0;
    if (q.cursor) {
      const c = JSON.parse(q.cursor);
      if (c.kind !== q.kind || c.query !== q.query || c.archived !== q.archived)
        throw new DomainError("invalid_catalogue_cursor");
      offset = all.findIndex((i) => i.id === c.id) + 1;
    }
    const selected = all.slice(offset, offset + 50);
    return {
      items: selected.map((i) => ({
        id: i.id,
        name: i.name,
        emoji: i.emoji,
        revision: i.revision ?? 1,
        archived: !!i.archived,
        banned: (i as PlannedRecipe).banned === true,
        veto_revision: (i as PlannedRecipe).veto_revision ?? 0,
        meal_types: (i as PlannedRecipe).meal_types,
        nutrition_per_100g: (i as Ingredient).nutrition_per_100g,
      })),
      next_cursor:
        offset + 50 < all.length
          ? JSON.stringify({ ...q, cursor: undefined, id: selected.at(-1)!.id })
          : null,
    };
  }
  async previewTransfer(request: TransferRequest) {
    this.me();
    this.s.server_now = new Date().toISOString();
    return buildTransfer(
      this.s,
      { ...this.library, revision: this.serial },
      request,
    );
  }
  async applyTransfer(
    request: TransferRequest,
    preview: TransferPreview,
    overwrite: boolean,
  ) {
    if (preview.revision !== this.serial) throw new DomainError("stale_plan");
    const fresh = await this.previewTransfer(request);
    if (fresh.fingerprint !== preview.fingerprint)
      throw new DomainError("stale_plan");
    if (request.mode === "paste" && fresh.occupied && !overwrite)
      throw new DomainError("existing_meal");
    const keys = new Set(fresh.plans.map((p) => p.day + "/" + p.type));
    this.library.plans = this.library.plans
      .filter((p) => !keys.has(p.day + "/" + p.type))
      .concat(fresh.plans.filter((p) => p.portions.length));
    this.s.meals = this.s.meals.filter((p) => !keys.has(p.day + "/" + p.type));
    this.serial++;
    this.syncPlans();
    this.autoShopping();
    this.persistDemo();
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
    this.autoShopping();
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
    const [start, end] = this.upcomingBounds();
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
      created_at: old ? (old as any).created_at : new Date().toISOString(),
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
  async applyPlans(
    batch: MealPlan[],
    revision: number,
    replace: boolean,
    operation?: HistoryOperation,
  ) {
    this.me();
    const request = JSON.stringify({
      batch,
      revision,
      replace,
      action: operation?.action,
    });
    if (operation && this.historyOperations.has(operation.id)) {
      if (this.historyOperations.get(operation.id) !== request)
        throw new DomainError("operation_mismatch");
      return;
    }
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
      const i = plans.findIndex((x) => x.day === m.day && x.type === m.type);
      if (!m.portions.length) {
        if (i >= 0) plans.splice(i, 1);
        continue;
      }
      const saved = { ...m, revision: (old?.revision ?? 0) + 1 };
      if (i < 0) plans.push(saved);
      else plans[i] = saved;
    }
    this.library.plans = plans;
    this.s.meals = this.s.meals.filter(
      (p) => !batch.some((m) => m.day === p.day && m.type === p.type),
    );
    this.serial++;
    this.syncPlans();
    this.autoShopping();
    if (operation) this.historyOperations.set(operation.id, request);
  }
  async saveMealTimes(times: MealTimes) {
    if (!validMealTimes(times)) throw new DomainError("invalid_meal_times");
    const member = this.me();
    member.meal_times = { ...times };
    this.mealTimes[member.id] = { ...times };
    this.serial++;
    this.persistDemo();
  }
  async savePlannerSettings(week: 0 | 1) {
    this.me();
    if (![0, 1].includes(week)) throw new DomainError("invalid_recipe");
    this.s.household.week_start = week;
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
    for (const plan of this.library.plans)
      if (this.closedDay(plan.day)) {
        if (!this.s.meal_locks.some((l) => l.day === plan.day))
          this.s.meal_locks.push({
            day: plan.day,
            cutoff: dayCutoff(plan.day, zone),
            closed: true,
          });
        for (const p of plan.portions)
          if (
            !this.s.days.some(
              (d) => d.day === plan.day && d.member_id === p.member_id,
            )
          ) {
            const member = this.s.members.find((m) => m.id === p.member_id)!;
            const target =
              this.s.targets
                .filter(
                  (t) =>
                    t.member_id === p.member_id && t.effective_date <= plan.day,
                )
                .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ??
              null;
            this.s.days.push({
              member_id: p.member_id,
              day: plan.day,
              cutoff: dayCutoff(plan.day, zone),
              closed: true,
              snapshot: {
                profile: structuredClone(member.profile!),
                target: structuredClone(target),
                entries: structuredClone(
                  this.s.entries.filter(
                    (e) => e.member_id === p.member_id && e.day === plan.day,
                  ),
                ),
              },
            });
          }
      }
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
