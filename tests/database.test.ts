import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const owner = "10000000-0000-0000-0000-000000000001",
  member = "10000000-0000-0000-0000-000000000002",
  stranger = "10000000-0000-0000-0000-000000000003";
let db: PGlite;
async function as(id: string) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec("set role authenticated");
}
async function rpc(name: string, args: unknown[] = []) {
  const { rows } = await db.query<{ result: any }>(
    `select public.${name}(${args.map((_, i) => "$" + (i + 1)).join(",")}) as result`,
    args,
  );
  return rows[0].result;
}
const profile = {
  name: "Alex",
  age: 32,
  sex: "male",
  height_cm: 178,
  weight_kg: 80,
  activity_level: "light",
  goal: "maintain",
  target_weight_kg: null,
  target_date: null,
  diet: "omnivore",
  excluded_ingredients: [],
  language: "en",
};

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_app_meta_data jsonb,raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
  await db.exec(
    readFileSync("supabase/migrations/202611030001_foundation.sql", "utf8"),
  );
  await db.exec(
    readFileSync("supabase/migrations/202611030002_activities.sql", "utf8"),
  );
  for (const [id, email] of [
    [owner, "owner@example.com"],
    [member, "member@example.com"],
    [stranger, "stranger@example.com"],
  ])
    await db.query(
      `insert into auth.users values($1,$2,now(),'{"provider":"google"}','{}')`,
      [id, email],
    );
  await db.exec("select app_private.configure_owner('owner@example.com')");
}, 60000);
afterAll(async () => {
  await db.close();
});

describe("PostgreSQL authority and household lifecycle", () => {
  it("denies unapproved Google accounts and private helpers", async () => {
    await as(stranger);
    await expect(rpc("bootstrap_member", ["UTC"])).rejects.toThrow(
      "access_denied",
    );
    expect((await db.query("select * from public.members")).rows).toEqual([]);
    await expect(
      db.exec("select app_private.configure_owner('stranger@example.com')"),
    ).rejects.toThrow("permission denied");
  });
  it("bootstraps only the configured owner and restricts direct writes", async () => {
    await as(owner);
    await rpc("bootstrap_member", ["Europe/Madrid"]);
    expect((await rpc("get_household_snapshot")).household.owner_id).toBe(
      owner,
    );
    await expect(
      db.exec("update public.household set name='Bypass'"),
    ).rejects.toThrow("permission denied");
    await expect(rpc("save_my_profile", [profile, null])).rejects.toThrow(
      "stale_profile",
    );
    await rpc("save_my_profile", [profile, 0]);
    await expect(rpc("save_my_profile", [profile, 0])).rejects.toThrow(
      "stale_profile",
    );
  });
  it("recalculates accepted targets on the server and requires a current review", async () => {
    const p = await rpc("get_my_target_proposal");
    expect(p.daily_kcal).toBe(2416.5625);
    await expect(
      rpc("accept_my_target", [
        { breakfast: 400, lunch: 700, dinner: 700 },
        null,
      ]),
    ).rejects.toThrow("stale_proposal");
    await expect(
      rpc("accept_my_target", [
        { breakfast: 400, lunch: 700, dinner: 0 },
        p.context_revision,
      ]),
    ).rejects.toThrow("invalid_budgets");
    await rpc("accept_my_target", [
      { breakfast: 400, lunch: 700, dinner: 700 },
      p.context_revision,
    ]);
    await rpc("save_my_daily_entry", ["weight", "", 79, null, null]);
    await expect(
      rpc("accept_my_target", [
        { breakfast: 400, lunch: 700, dinner: 700 },
        p.context_revision,
      ]),
    ).rejects.toThrow("stale_proposal");
    const s = await rpc("get_household_snapshot");
    expect(s.targets[0].daily_kcal).toBe(2416.5625);
    expect(s.members[0].profile.weight_kg).toBe(79);
  });
  it("trusts catalogue MET values, enforces duration, and logs only today", async () => {
    await rpc("save_my_daily_entry", [
      "activity",
      "forged MET",
      30,
      "17190",
      null,
    ]);
    const s = await rpc("get_household_snapshot");
    const e = s.entries.find((x: any) => x.kind === "activity");
    expect(e.met).toBe(3.8);
    expect(e.description).toBe("17190");
    await expect(
      rpc("save_my_daily_entry", ["activity", "", 1440, "17190", null]),
    ).rejects.toThrow("invalid_activity");
    await expect(
      rpc("save_my_daily_entry", ["activity", "", 10, "invented", null]),
    ).rejects.toThrow("invalid_activity");
    await rpc("delete_my_daily_entry", [e.id]);
  });
  it("allows invitations, shared reads, and only personal writes", async () => {
    await rpc("invite_member", [" MEMBER@example.com "]);
    await as(member);
    await rpc("bootstrap_member", ["Pacific/Kiritimati"]);
    await rpc("save_my_profile", [
      { ...profile, name: "Noa", sex: "female" },
      0,
    ]);
    const s = await rpc("get_household_snapshot");
    expect(s.members).toHaveLength(2);
    expect(s.invites).toEqual([]);
    await expect(
      rpc("invite_member", ["stranger@example.com"]),
    ).rejects.toThrow("owner_required");
    await expect(
      rpc("delete_my_daily_entry", [s.entries[0].id]),
    ).rejects.toThrow("entry_not_editable");
  });
  it("supports adult profiles while rejecting unsupported activity ages and unsafe targets", async () => {
    await rpc("save_my_profile", [{ ...profile, name: "Noa", age: 18 }, 1]);
    await expect(
      rpc("save_my_daily_entry", ["activity", "", 20, "17190", null]),
    ).rejects.toThrow("invalid_activity");
    const low = {
      ...profile,
      name: "Noa",
      height_cm: 128,
      weight_kg: 35.5,
      activity_level: "sedentary",
    };
    await rpc("save_my_profile", [low, 2]);
    await expect(rpc("get_my_target_proposal")).rejects.toThrow(
      "target_too_low",
    );
    await rpc("save_my_profile", [{ ...low, weight_kg: 35.5001 }, 3]);
    expect((await rpc("get_my_target_proposal")).daily_kcal).toBeGreaterThan(
      1200,
    );
  });
  it("uses the earliest household midnight for meal budgets", async () => {
    const { rows } = await db.query<{ day: string }>(
      "select (current_date+3)::text as day",
    );
    const day = rows[0].day;
    await rpc("save_my_budget_override", [day, "lunch", 600]);
    const { rows: cutoffs } = await db.query<{ correct: boolean }>(
      "select l.cutoff=(select min(($1::date+1)::timestamp at time zone time_zone) from public.members where status='active') as correct from public.meal_date_locks l where day=$1",
      [day],
    );
    expect(cutoffs[0].correct).toBe(true);
    await rpc("save_my_budget_override", [day, "lunch", null]);
  });
  it("freezes expired contexts before later profile edits and never reopens locks", async () => {
    await db.exec("reset role");
    await db.query(
      "insert into public.personal_days(member_id,day,cutoff) values($1,current_date-1,now()-interval '1 hour')",
      [owner],
    );
    await db.exec(
      "insert into public.meal_date_locks values(current_date+1,now()-interval '1 hour',false)",
    );
    await as(owner);
    await rpc("get_household_snapshot");
    await rpc("save_my_profile", [{ ...profile, weight_kg: 75 }, 1]);
    let s = await rpc("get_household_snapshot");
    expect(s.days.find((d: any) => d.closed).snapshot.profile.weight_kg).toBe(
      79,
    );
    await rpc("bootstrap_member", ["America/Los_Angeles"]);
    s = await rpc("get_household_snapshot");
    expect(s.meal_locks.some((l: any) => l.closed)).toBe(true);
    await expect(
      rpc("save_my_budget_override", [
        s.meal_locks.find((l: any) => l.closed).day,
        "lunch",
        800,
      ]),
    ).rejects.toThrow("day_closed");
  });
  it("preserves one owner, revokes removed members, and retains history", async () => {
    await expect(rpc("leave_household")).rejects.toThrow(
      "transfer_before_leaving",
    );
    await rpc("transfer_ownership", [member]);
    await expect(
      rpc("invite_member", ["stranger@example.com"]),
    ).rejects.toThrow("owner_required");
    await rpc("bootstrap_member", ["UTC"]);
    expect((await rpc("get_household_snapshot")).household.owner_id).toBe(
      member,
    );
    await rpc("bootstrap_member", ["Pacific/Kiritimati"]);
    await as(member);
    await rpc("bootstrap_member", ["America/Los_Angeles"]);
    await db.exec("reset role");
    await db.query(
      "insert into public.budget_overrides values($1,current_date+10,'lunch',600)",
      [owner],
    );
    await db.query(
      "insert into public.budget_overrides values($1,current_date+1,'lunch',500)",
      [owner],
    );
    await db.query(
      "insert into public.personal_days(member_id,day,cutoff,closed,snapshot) values($1,current_date+2,now()-interval '1 hour',true,'{}')",
      [owner],
    );
    await db.query(
      "insert into public.daily_entries(member_id,day,kind,description,value) values($1,current_date+2,'food','Preserved after timezone travel',100)",
      [owner],
    );
    await as(member);
    await rpc("remove_member", [owner]);
    const s = await rpc("get_household_snapshot");
    expect(s.members.find((m: any) => m.id === owner).status).toBe("removed");
    const { rows: locks } = await db.query<{ correct: boolean }>(
      "select bool_and(l.cutoff=(select min((l.day+1)::timestamp at time zone time_zone) from public.members where status='active')) as correct from public.meal_date_locks l where not l.closed",
    );
    expect(locks[0].correct).toBe(true);
    expect(s.entries.some((e: any) => e.member_id === owner)).toBe(true);
    expect(s.budget_overrides).toHaveLength(1);
    expect(s.budget_overrides[0].kcal).toBe(500);
    expect(
      s.entries.some(
        (e: any) => e.description === "Preserved after timezone travel",
      ),
    ).toBe(true);
    await as(owner);
    await expect(rpc("bootstrap_member", ["UTC"])).rejects.toThrow(
      "access_denied",
    );
    expect((await db.query("select * from public.targets")).rows).toEqual([]);
  });
});
