import type {
  ShoppingState,
  ShoppingPreview,
  CheckOperation,
  CheckReceipt,
} from "./shopping";
import type {
  PlanningState,
  Ingredient,
  PlannedRecipe,
  MealPlan,
} from "./planning";
import type { HouseholdAccess, HouseholdContext } from "./households";
export type Language = "en" | "es";
export type MealType = "breakfast" | "lunch" | "dinner";
export type ActivityLevel = "sedentary" | "light" | "active" | "very_active";
export type Goal = "lose" | "maintain";
export type Tab = "dashboard" | "menu" | "shopping" | "recipes" | "profile";
export type Budgets = Record<MealType, number>;
export interface Profile {
  name: string;
  age: number;
  sex: "male" | "female";
  height_cm: number;
  weight_kg: number;
  activity_level: ActivityLevel;
  goal: Goal;
  target_weight_kg: number | null;
  target_date: string | null;
  diet: "omnivore" | "vegetarian" | "vegan" | "pescatarian";
  excluded_ingredients: string[];
  language: Language;
}
export interface Member {
  presentation?: import("./presentation").Presentation;
  id: string;
  name: string;
  status: "active" | "removed";
  time_zone: string;
  onboarded: boolean;
  profile: Profile | null;
  revision: number;
}
export interface Target {
  id: string;
  member_id: string;
  effective_date: string;
  created_at: string;
  daily_kcal: number;
  resting_kcal: number;
  usual_kcal: number;
  deficit_kcal: number;
  budgets: Budgets;
  inputs: Profile;
}
export interface Proposal {
  resting_kcal: number;
  usual_kcal: number;
  deficit_kcal: number;
  daily_kcal: number;
  context_revision?: string;
  reason?: string;
}
export interface DailyEntry {
  id: string;
  member_id: string;
  day: string;
  kind: "food" | "activity" | "weight";
  description: string;
  value: number;
  activity_code: string | null;
  met: number | null;
  created_at: string;
  updated_at: string;
}
export interface ActivityDefinition {
  code: string;
  met: number;
  name: Record<Language, string>;
  group: Record<Language, string>;
  source_url: string;
  source_description: string;
  age_min: number;
  age_max: number;
}
export interface MealSummary {
  member_id: string;
  day: string;
  type: MealType;
  name: Record<Language, string>;
  kcal: number;
  recipe_id?: string;
  eating_out?: boolean;
}
export interface PersonalDay {
  member_id: string;
  day: string;
  closed: boolean;
  cutoff: string;
  snapshot: {
    profile: Profile;
    target: Target | null;
    entries: DailyEntry[];
  } | null;
}
export interface HouseholdState {
  context?: HouseholdContext;
  shopping?: ShoppingState;
  planning?: PlanningState;
  server_now: string;
  viewer_id: string;
  household: {
    id?: string;
    name: string;
    owner_id: string;
    week_start: 0 | 1;
    variety_days: number;
  };
  members: Member[];
  targets: Target[];
  entries: DailyEntry[];
  days: PersonalDay[];
  invites: { email: string; revoked: boolean }[];
  activity_catalogue: ActivityDefinition[];
  meals: MealSummary[];
  budget_overrides: {
    member_id: string;
    day: string;
    meal_type: MealType;
    kcal: number;
  }[];
  meal_locks: { day: string; cutoff: string; closed: boolean }[];
}
export interface EntryInput {
  id?: string;
  kind: DailyEntry["kind"];
  description: string;
  value: number;
  activity_code?: string;
}
export interface Repository {
  readonly accountId: string;
  readonly offlineId?: string;
  householdAccess?(): Promise<HouseholdAccess>;
  createHousehold?(name: string, timezone: string): Promise<void>;
  joinHousehold?(invitation: string, timezone: string): Promise<void>;
  beginCorrection(
    day: string,
    revision: number,
  ): Promise<import("./history").CorrectionSession>;
  applyCorrection(
    session: import("./history").CorrectionSession,
    action: "save" | "erase",
    plans: MealPlan[],
  ): Promise<import("./history").CorrectionAck>;
  cancelCorrection(token: string): Promise<void>;
  correctionHistory(
    day: string,
  ): Promise<import("./history").CorrectionEvent[]>;
  getPlanningLibrary(): Promise<import("./planning").PlanningState>;
  cataloguePage(
    query: import("./catalogue").CatalogueQuery,
  ): Promise<import("./catalogue").CataloguePage>;
  catalogueItem(
    kind: import("./catalogue").CatalogueKind,
    id: string,
  ): Promise<import("./catalogue").CatalogueDetail>;
  getShopping(): Promise<ShoppingState>;
  saveEggPurchasingUnit(grams: number | null, revision: number): Promise<void>;
  previewShopping(start: string, end: string): Promise<ShoppingPreview>;
  applyShopping(preview: ShoppingPreview): Promise<void>;
  setShoppingRange(start: string, end: string): Promise<void>;
  previewTransfer(
    request: import("./planning-transfer").TransferRequest,
  ): Promise<import("./planning-transfer").TransferPreview>;
  applyTransfer(
    request: import("./planning-transfer").TransferRequest,
    preview: import("./planning-transfer").TransferPreview,
    overwrite: boolean,
  ): Promise<void>;
  saveManualItem(
    id: string,
    label: string,
    amount: string,
    revision: number,
  ): Promise<void>;
  deleteManualItem(id: string, revision: number): Promise<void>;
  checkShopping(operation: CheckOperation): Promise<CheckReceipt>;
  mode: "preview" | "supabase";
  rateRecipe(recipeId: string, stars: number): Promise<void>;
  saveContent(
    kind: "ingredient" | "recipe",
    data: Ingredient | PlannedRecipe,
    revision: number,
    archive: boolean,
  ): Promise<void>;
  applyPlans(
    batch: MealPlan[],
    revision: number,
    replace: boolean,
  ): Promise<void>;
  deleteMeal(day: string, type: MealType, revision: number): Promise<void>;
  deleteWeek(start: string, revision: number): Promise<void>;
  savePromptPreference(after: string | null): Promise<void>;
  savePresentation(
    preferences: import("./presentation").Presentation,
  ): Promise<void>;
  savePlannerSettings(week: 0 | 1, variety: number): Promise<void>;
  load(timezone: string): Promise<HouseholdState>;
  saveProfile(profile: Profile, revision: number): Promise<void>;
  proposal(): Promise<Proposal>;
  acceptTarget(budgets: Budgets, revision: string): Promise<void>;
  saveEntry(entry: EntryInput): Promise<void>;
  deleteEntry(id: string): Promise<void>;
  saveBudgetOverride(
    day: string,
    meal: MealType,
    kcal: number | null,
  ): Promise<void>;
  saveBudgetOverrides(
    day: string,
    changes: Partial<Record<MealType, number | null>>,
    operation: string,
  ): Promise<{ operation_id: string; day: string; revision: number }>;
  leave(): Promise<void>;
  invite(email: string): Promise<void>;
  remove(memberId: string): Promise<void>;
  transfer(memberId: string): Promise<void>;
  signOut(discardPending?: boolean): Promise<void>;
}
