import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import activities from "../data/activities.json";
import recipes from "../../content/starter/recipes.json";
import {
  DomainError,
  proposeTarget,
  validateBudgets,
  validateProfile,
} from "../domain/calories";
import { addDays, dayCutoff, localDay } from "../domain/dates";
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
        auth: { flowType: "pkce", detectSessionInUrl: true },
      })
    : null;
export const previewAvailable =
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_PREVIEW === "true";
export class SupabaseRepository implements Repository {
  mode = "supabase" as const;
  constructor(private client: SupabaseClient) {}
  private async rpc<T = void>(
    name: string,
    args?: Record<string, unknown>,
  ): Promise<T> {
    const { data, error } = await this.client.rpc(name, args);
    if (error) throw new DomainError(error.message);
    return data as T;
  }
  async load(zone: string) {
    await this.rpc("bootstrap_member", { p_timezone: zone });
    return this.rpc<HouseholdState>("get_household_snapshot");
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
  async signOut() {
    const { error } = await this.client.auth.signOut({ scope: "local" });
    if (error) throw error;
  }
}

// Ephemeral, explicitly labelled preview. It never authenticates or accesses Supabase.
export class PreviewRepository implements Repository {
  mode = "preview" as const;
  private s: HouseholdState;
  private serial = 0;
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
    this.me().time_zone = zone;
    return structuredClone(this.s);
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
  async signOut() {
    /* The App drops this in-memory repository and all household data. */
  }
}
