import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { makePortion, type PlannedRecipe } from "../src/domain/planning";
import { addDays } from "../src/domain/dates";

const alice = "60000000-0000-0000-0000-000000000001";
const bob = "60000000-0000-0000-0000-000000000002";
const carol = "60000000-0000-0000-0000-000000000003";
const outsider = "60000000-0000-0000-0000-000000000004";
const passwordUser = "60000000-0000-0000-0000-000000000005";
const unverified = "60000000-0000-0000-0000-000000000006";
const uninvited = "60000000-0000-0000-0000-000000000007";
const item = "60000000-0000-0000-0000-000000000010";
const operation = "60000000-0000-0000-0000-000000000011";
const profile = {
  name: "Alice",
  age: 32,
  sex: "female",
  height_cm: 168,
  weight_kg: 65,
  activity_level: "light",
  goal: "maintain",
  target_weight_kg: null,
  target_date: null,
  diet: "omnivore",
  language: "en",
  excluded_ingredients: [],
};
let db: PGlite;
let legacy: any, contextA: any, contextB: any, bobMembership: string;
async function as(id: string) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec("set role authenticated");
}
async function call<T = any>(name: string, args: unknown[] = []): Promise<T> {
  return (
    await db.query<{ result: T }>(
      `select public.${name}(${args.map((_, i) => "$" + (i + 1)).join(",")}) result`,
      args,
    )
  ).rows[0].result;
}
async function access() {
  return call("get_household_access");
}
async function rpc<T = any>(
  name: string,
  args: unknown[] = [],
  context?: any,
): Promise<T> {
  const c = context ?? (await access()).active;
  return call<T>(name, [
    c?.household_id ?? null,
    c?.membership_id ?? null,
    ...args,
  ]);
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_app_meta_data jsonb,raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
  for (const f of readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql") && f < "202611040006")
    .sort())
    await db.exec(readFileSync("supabase/migrations/" + f, "utf8"));
  for (const [id, email] of [
    [alice, "alice@example.com"],
    [bob, "bob@example.com"],
    [carol, "carol@example.com"],
    [outsider, "outsider@example.com"],
    [passwordUser, "password@example.com"],
    [unverified, "unverified@example.com"],
    [uninvited, "uninvited@example.com"],
  ])
    await db.query(
      `insert into auth.users values($1,$2,now(),'{"provider":"google"}','{}')`,
      [id, email],
    );
  await db.query(
    `update auth.users set raw_app_meta_data='{"provider":"email"}' where id=$1`,
    [passwordUser],
  );
  await db.query("update auth.users set email_confirmed_at=null where id=$1", [
    unverified,
  ]);
  await db.exec("select app_private.configure_owner('alice@example.com')");
  await as(alice);
  await call("bootstrap_member", ["Europe/Madrid"]);
  await call("save_my_profile", [profile, 0]);
  const p = await call("get_my_target_proposal");
  await call("accept_my_target", [
    { breakfast: 350, lunch: 600, dinner: 600 },
    p.context_revision,
  ]);
  await call("save_my_daily_entry", [
    "food",
    "Private legacy lunch",
    100,
    null,
    null,
  ]);
  await call("save_manual_shopping_item", [
    item,
    "Private legacy item",
    "1",
    0,
  ]);
  await call("set_shopping_checked", [operation, item, true]);
  await call("invite_member", ["bob@example.com"]);
  await as(bob);
  await call("bootstrap_member", ["UTC"]);
  await call("save_my_profile", [{ ...profile, name: "Bob" }, 0]);
  await as(alice);
  legacy = await call("get_household_snapshot");
  await db.exec("reset role");
  await db.exec(
    readFileSync("supabase/migrations/202611040006_households.sql", "utf8"),
  );
  // A managed auth schema need not allow an app's new executor role to enter
  // it. Identity resolvers keep their existing administrator permissions.
  await db.exec("revoke usage on schema auth from week_menu_executor");
  await db.exec(
    readFileSync(
      "supabase/migrations/202611050007_auth_namespace_independence.sql",
      "utf8",
    ),
  );
}, 60000);
afterAll(async () => {
  await db?.close();
});

describe("v2 tenant migration and lifecycle", () => {
  it("loads the migrated household without auth schema access for the executor", async () => {
    await as(alice);
    expect((await access()).active.membership_id).toBe(alice);
    await expect(rpc("get_household_snapshot")).resolves.toMatchObject({
      viewer_id: alice,
      context: {
        account_id: alice,
        membership_id: alice,
        legacy_binding: true,
      },
    });
  });

  it("preserves restricted auth access, function ownership and data when the repair is reapplied", async () => {
    await db.exec("reset role");
    expect(
      (
        await db.query<any>(
          "select has_schema_privilege('week_menu_executor','auth','USAGE') allowed",
        )
      ).rows[0].allowed,
    ).toBe(false);
    const owners = () =>
      db.query(
        "select p.proname,r.rolname,p.proacl::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner where n.nspname='app_private' and p.proname in ('api_snapshot','api_invite') order by p.proname",
      );
    const before = (await owners()).rows;
    await as(alice);
    const snapshot = await rpc("get_household_snapshot");
    await db.exec("reset role");
    await db.exec(
      readFileSync(
        "supabase/migrations/202611050007_auth_namespace_independence.sql",
        "utf8",
      ),
    );
    expect((await owners()).rows).toEqual(before);
    expect(before.every((r: any) => r.rolname === "week_menu_executor")).toBe(
      true,
    );
    expect(
      (
        await db.query(
          "select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner where n.nspname='app_private' and r.rolname='week_menu_executor' and p.prosrc ~ '\\mauth[[:space:]]*\\.'",
        )
      ).rows,
    ).toEqual([]);
    await db.exec("set role week_menu_executor");
    await expect(db.exec("select auth.uid()")).rejects.toMatchObject({
      code: "42501",
      message: "permission denied for schema auth",
    });
    await as(alice);
    const after = await rpc("get_household_snapshot");
    expect(after.context).toEqual(snapshot.context);
    expect(after.members).toEqual(snapshot.members);
    expect(after.targets).toEqual(snapshot.targets);
    expect(after.entries).toEqual(snapshot.entries);
    expect(after.planning).toEqual(snapshot.planning);
    expect(after.shopping).toEqual(snapshot.shopping);
  });

  it("preserves the existing household, profiles, targets, catalogue and receipt identities", async () => {
    await as(alice);
    contextA = (await access()).active;
    expect(contextA.membership_id).toBe(alice);
    expect(contextA.legacy_binding).toBe(true);
    const s = await rpc("get_household_snapshot");
    expect(s.household.owner_id).toBe(alice);
    expect(s.household.id).toBe(contextA.household_id);
    expect(s.members.map((m: any) => m.id)).toEqual(
      legacy.members.map((m: any) => m.id),
    );
    expect(s.targets.map((t: any) => t.id)).toEqual(
      legacy.targets.map((t: any) => t.id),
    );
    expect(s.entries[0].description).toBe("Private legacy lunch");
    expect(s.planning.ingredients).toHaveLength(
      legacy.planning.ingredients.length,
    );
    expect(s.shopping.items[0].id).toBe(item);
    expect(await rpc("set_shopping_checked", [operation, item, true])).toEqual({
      operation_id: operation,
      item_id: item,
      status: "applied",
      checked: true,
      item_revision: 1,
    });
    await expect(
      call("set_shopping_checked", [operation, item, true]),
    ).rejects.toThrow();
  });

  it("allows any verified Google account to explicitly create a separate household", async () => {
    await as(carol);
    expect(await access()).toEqual({ active: null, invitations: [] });
    await expect(call("create_household", [" ", "UTC"])).rejects.toThrow(
      "invalid_household_name",
    );
    await call("create_household", ["Carol's home", "UTC"]);
    contextB = (await access()).active;
    expect(contextB.household_id).not.toBe(contextA.household_id);
    expect(contextB.membership_id).not.toBe(carol);
    const s = await rpc("get_household_snapshot");
    expect(s.household.name).toBe("Carol's home");
    expect(s.household.owner_id).toBe(contextB.membership_id);
    expect(s.members).toHaveLength(1);
    expect(s.entries).toEqual([]);
    expect(s.targets).toEqual([]);
    expect(s.shopping.items).toEqual([]);
    // Never bootstrap new households by publishing/copying live private content.
    expect(s.planning.ingredients).toEqual([]);
    await expect(
      call("create_household", ["Second home", "UTC"]),
    ).rejects.toThrow("already_in_household");
    await rpc("save_my_profile", [{ ...profile, name: "Carol" }, 0]);
    const p = await rpc("get_my_target_proposal");
    await rpc("accept_my_target", [
      { breakfast: 350, lunch: 600, dinner: 600 },
      p.context_revision,
    ]);
    await rpc("save_my_daily_entry", ["weight", "", 64, null, null]);
    expect(
      (await rpc("get_household_snapshot")).members[0].profile.weight_kg,
    ).toBe(64);
  });

  it("rejects anonymous, unverified and non-Google onboarding", async () => {
    for (const id of [passwordUser, unverified]) {
      await as(id);
      await expect(access()).rejects.toThrow("google_identity_required");
      await expect(
        call("create_household", ["Invalid", "UTC"]),
      ).rejects.toThrow("google_identity_required");
    }
    await db.exec("reset role; set role anon");
    await expect(access()).rejects.toThrow("permission denied");
    await expect(db.exec("select * from public.members")).rejects.toThrow(
      "permission denied",
    );
  });

  it("denies forged tenant contexts and filters direct REST-style reads", async () => {
    await as(carol);
    for (const name of [
      "get_household_snapshot",
      "get_planning_library",
      "get_shopping_state",
    ])
      await expect(rpc(name, [], contextA)).rejects.toThrow(
        "membership_changed",
      );
    const tables = [
      "household",
      "members",
      "profiles",
      "targets",
      "daily_entries",
      "personal_days",
      "meal_date_locks",
      "budget_overrides",
      "household_revision",
      "food_items",
      "saved_recipes",
      "meal_plans",
      "substitution_rules",
      "recipe_prompt_preferences",
      "shopping_list",
      "shopping_items",
    ];
    for (const table of tables) {
      const { rows } = await db.query<{ household_id: string }>(
        `select household_id from public.${table}`,
      );
      expect(rows.every((r) => r.household_id === contextB.household_id)).toBe(
        true,
      );
    }
    await db.query("select set_config('app_private.household_id',$1,false)", [
      contextA.household_id,
    ]);
    expect((await rpc("get_household_snapshot")).household.id).toBe(
      contextB.household_id,
    );
    await expect(
      db.exec("update public.members set name='forged'"),
    ).rejects.toThrow("permission denied");
    expect(
      (
        await db.query<any>(
          "select pg_has_role('authenticated','week_menu_executor','MEMBER') allowed",
        )
      ).rows[0].allowed,
    ).toBe(false);
    await expect(
      db.exec("select * from app_private.shopping_receipts"),
    ).rejects.toThrow("permission denied");
    await expect(
      rpc("delete_my_daily_entry", [legacy.entries[0].id]),
    ).rejects.toThrow("entry_not_editable");
    await expect(rpc("remove_member", [alice])).rejects.toThrow(
      "invalid_member",
    );
    await expect(rpc("transfer_ownership", [alice])).rejects.toThrow(
      "invalid_member",
    );
    const ack = await rpc("set_shopping_checked", [operation, item, false]);
    expect(ack.status).toBe("removed");
    await as(alice);
    expect((await rpc("get_shopping_state")).items[0].checked).toBe(true);
  });

  it("keeps content, revisions and shopping lists separate even when ingredient keys match", async () => {
    await as(alice);
    const old = await rpc("get_planning_library");
    const food = old.ingredients[0];
    await as(carol);
    await rpc("save_household_content", [
      "ingredient",
      {
        ...food,
        name: { en: "Carol private ingredient", es: "Ingrediente privado" },
      },
      0,
      false,
    ]);
    await rpc("save_manual_shopping_item", [
      "60000000-0000-0000-0000-000000000020",
      "Carol private item",
      "2",
      0,
    ]);
    expect((await rpc("get_planning_library")).ingredients).toHaveLength(1);
    await as(alice);
    const now = await rpc("get_planning_library");
    expect(now.revision).toBe(old.revision);
    expect(now.ingredients.find((i: any) => i.id === food.id).name).toEqual(
      food.name,
    );
    expect((await rpc("get_shopping_state")).items).toHaveLength(1);
  });

  it("requires an explicit invitation acceptance for the approved email only", async () => {
    await as(carol);
    await rpc("invite_member", ["OUTSIDER@example.com"]);
    await as(outsider);
    const invitations = (await access()).invitations;
    expect(invitations).toHaveLength(1);
    expect(invitations[0].household_name).toBe("Carol's home");
    expect((await access()).active).toBeNull();
    await as(uninvited);
    await expect(
      call("join_household", [invitations[0].id, "UTC"]),
    ).rejects.toThrow("invalid_invitation");
    await as(bob);
    await expect(
      call("join_household", [invitations[0].id, "UTC"]),
    ).rejects.toThrow("already_in_household");
    await as(passwordUser);
    await expect(
      call("join_household", [invitations[0].id, "UTC"]),
    ).rejects.toThrow("google_identity_required");
    await as(outsider);
    await call("join_household", [invitations[0].id, "UTC"]);
    expect((await access()).active.household_id).toBe(contextB.household_id);
    await expect(rpc("invite_member", ["alice@example.com"])).rejects.toThrow(
      "owner_required",
    );
    await rpc("leave_household");
    expect((await access()).active).toBeNull();
    expect((await access()).invitations).toEqual([]);
  });

  it("retains old history after removal and never carries it into a new membership", async () => {
    await as(bob);
    bobMembership = (await access()).active.membership_id;
    await rpc("save_my_daily_entry", [
      "food",
      "Bob's retained history",
      90,
      null,
      null,
    ]);
    await as(alice);
    await expect(rpc("leave_household")).rejects.toThrow(
      "transfer_before_leaving",
    );
    await rpc("remove_member", [bobMembership]);
    await as(bob);
    expect((await access()).active).toBeNull();
    expect((await db.query("select * from public.daily_entries")).rows).toEqual(
      [],
    );
    await expect(
      rpc("get_household_snapshot", [], {
        ...contextA,
        membership_id: bobMembership,
      }),
    ).rejects.toThrow("access_denied");
    await as(carol);
    await rpc("invite_member", ["bob@example.com"]);
    await as(bob);
    await call("join_household", [(await access()).invitations[0].id, "UTC"]);
    const c = (await access()).active;
    expect(c.membership_id).not.toBe(bobMembership);
    expect(
      (await rpc("get_household_snapshot")).entries.some(
        (e: any) => e.description === "Bob's retained history",
      ),
    ).toBe(false);
    await as(alice);
    expect(
      (await rpc("get_household_snapshot")).entries.some(
        (e: any) => e.description === "Bob's retained history",
      ),
    ).toBe(true);
  });

  it("scopes meal snapshots, nutrition, shopping generation and date locks", async () => {
    await as(carol);
    let lib = await rpc("get_planning_library");
    const food = lib.ingredients[0];
    const recipe: PlannedRecipe = {
      id: "tenant-breakfast",
      name: { en: "Private breakfast", es: "Desayuno privado" },
      meal_types: ["breakfast"],
      reference_servings: 1,
      components: [
        {
          id: "main",
          name: { en: "Breakfast", es: "Desayuno" },
          kind: "main",
          optional: false,
          default_included: true,
          ingredients: [
            {
              ingredient_id: food.id,
              quantity: 100,
              unit: "g",
              variety_role: "main",
            },
          ],
          instructions: [{ en: "Serve.", es: "Servir." }],
        },
      ],
    };
    await rpc("save_household_content", ["recipe", recipe, 0, false]);
    lib = await rpc("get_planning_library");
    const s = await rpc("get_household_snapshot");
    const day = addDays(s.server_now.slice(0, 10), 7);
    const person = s.members.find((m: any) => m.id === contextB.membership_id);
    const portion = makePortion(
      recipe,
      person.id,
      person.profile,
      350,
      false,
      lib.ingredients,
      lib.substitutions,
    );
    await rpc("apply_meal_plans", [
      [{ day, type: "breakfast", revision: 0, portions: [portion] }],
      lib.revision,
      false,
    ]);
    const preview = await rpc("preview_shopping_list", [day, day]);
    expect(preview.changes).toHaveLength(1);
    await rpc("apply_shopping_list", [
      day,
      day,
      preview.content_revision,
      preview.source_fingerprint,
    ]);
    expect(
      (await rpc("get_shopping_state")).items.some(
        (i: any) => i.source === "generated",
      ),
    ).toBe(true);
    await db.exec("reset role");
    await db.query(
      "insert into public.meal_date_locks(household_id,day,cutoff) values($1,$2,now()-interval '1 hour')",
      [contextA.household_id, day],
    );
    await as(carol);
    await rpc("get_household_snapshot");
    await db.exec("reset role");
    expect(
      (
        await db.query<any>(
          "select closed from public.meal_date_locks where household_id=$1 and day=$2",
          [contextA.household_id, day],
        )
      ).rows[0].closed,
    ).toBe(false);
    await as(alice);
    const a = await rpc("get_household_snapshot");
    expect(a.meal_locks.find((l: any) => l.day === day).closed).toBe(true);
    expect(a.planning.plans).toEqual([]);
    expect(a.shopping.items).toHaveLength(1);
    await as(carol);
    const b = await rpc("get_household_snapshot");
    expect(b.meal_locks.find((l: any) => l.day === day).closed).toBe(false);
    const forged = { ...portion, member_id: alice };
    await expect(
      rpc("apply_meal_plans", [
        [
          {
            day: addDays(day, 1),
            type: "breakfast",
            revision: 0,
            portions: [forged],
          },
        ],
        b.planning.revision,
        false,
      ]),
    ).rejects.toThrow("invalid_member");
  });

  it("requires a fresh invitation and creates a fresh profile when rejoining the original household", async () => {
    await as(bob);
    await rpc("leave_household");
    await as(alice);
    await rpc("invite_member", ["bob@example.com"]);
    await as(bob);
    await call("join_household", [(await access()).invitations[0].id, "UTC"]);
    const c = (await access()).active,
      s = await rpc("get_household_snapshot");
    expect(c.membership_id).not.toBe(bobMembership);
    expect(c.legacy_binding).toBe(false);
    expect(
      s.members.find((m: any) => m.id === c.membership_id).profile,
    ).toBeNull();
    expect(
      s.entries.some((e: any) => e.description === "Bob's retained history"),
    ).toBe(true);
    await expect(
      rpc("get_household_snapshot", [], {
        ...contextA,
        membership_id: bobMembership,
      }),
    ).rejects.toThrow("membership_changed");
    await expect(
      rpc("delete_my_daily_entry", [
        s.entries.find((e: any) => e.description === "Bob's retained history")
          .id,
      ]),
    ).rejects.toThrow("entry_not_editable");
  });

  it("executes all ordinary private functions as a non-bypass, non-table-owner role", async () => {
    await db.exec("reset role");
    const role = (
      await db.query<any>(
        "select rolcanlogin,rolsuper,rolbypassrls from pg_roles where rolname='week_menu_executor'",
      )
    ).rows[0];
    expect(role).toEqual({
      rolcanlogin: false,
      rolsuper: false,
      rolbypassrls: false,
    });
    const owned = (
      await db.query(
        "select 1 from pg_class c join pg_roles r on r.oid=c.relowner where r.rolname='week_menu_executor' and c.relkind in ('r','p')",
      )
    ).rows;
    expect(owned).toEqual([]);
    expect(
      (
        await db.query<any>(
          "select has_table_privilege('week_menu_executor','auth.users','SELECT') allowed",
        )
      ).rows[0].allowed,
    ).toBe(false);
    const bypassing = (
      await db.query(
        "select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner where n.nspname='app_private' and p.prosecdef and r.rolname<>'week_menu_executor' and p.proname not in ('current_membership','current_household','verified_account','remove_departing_portions','configure_owner')",
      )
    ).rows;
    expect(bypassing).toEqual([]);
    await expect(
      db.query(
        "insert into public.members(id,user_id,household_id,name,status,time_zone) values(gen_random_uuid(),$1,$2,'duplicate','active','UTC')",
        [alice, contextB.household_id],
      ),
    ).rejects.toThrow("one_active_household_per_account");
  });
});

it("updates shopping in the menu transaction and deletes only editable meals of a week", async () => {
  await db.exec("reset role");
  await db.exec(
    readFileSync(
      "supabase/migrations/202611050008_automatic_menu_shopping.sql",
      "utf8",
    ),
  );
  await as(alice);
  let s = await rpc("get_household_snapshot"),
    lib = s.planning;
  const day = addDays(s.server_now.slice(0, 10), 14);
  const recipe = lib.recipes.find((r: any) => r.id === "b01");
  const person = s.members.find((m: any) => m.id === alice);
  const portion = makePortion(
    recipe,
    alice,
    person.profile,
    350,
    false,
    lib.ingredients,
    lib.substitutions,
  );
  const meals = [day, addDays(day, 1)].map((day) => ({
    day,
    type: "breakfast",
    revision: 0,
    portions: [portion],
  }));
  await rpc("apply_meal_plans", [meals, lib.revision, false]);
  let list = await rpc("get_shopping_state");
  expect(list.items.some((i: any) => i.source === "generated")).toBe(true);
  expect(list.items.find((i: any) => i.id === item).checked).toBe(true);
  expect(list.changes_available).toBe(false);
  const row = list.items.find((i: any) => i.source === "generated");
  await rpc("set_shopping_checked", [crypto.randomUUID(), row.id, true]);
  lib = await rpc("get_planning_library");
  const changed = structuredClone(lib.plans.find((m: any) => m.day === day));
  for (const line of changed.portions[0].lines) line.quantity *= 2;
  await rpc("apply_meal_plans", [[changed], lib.revision, true]);
  list = await rpc("get_shopping_state");
  expect(list.items.find((i: any) => i.id === row.id)).toMatchObject({
    checked: false,
    increased: true,
  });
  await db.exec("reset role");
  await db.query(
    "update public.meal_date_locks set closed=true where household_id=$1 and day=$2",
    [contextA.household_id, day],
  );
  await as(alice);
  lib = await rpc("get_planning_library");
  await expect(
    rpc("delete_planned_week", [list.start_date, lib.revision - 1]),
  ).rejects.toThrow("stale_plan");
  await rpc("delete_planned_week", [list.start_date, lib.revision]);
  const after = await rpc("get_household_snapshot");
  expect(after.planning.plans.find((m: any) => m.day === day)).toEqual(
    lib.plans.find((m: any) => m.day === day),
  );
  expect(after.planning.plans.some((m: any) => m.day === addDays(day, 1))).toBe(
    false,
  );
  expect(after.shopping.items.find((i: any) => i.id === item).checked).toBe(
    true,
  );
  expect(after.shopping.changes_available).toBe(false);
  const repeated = await rpc("get_household_snapshot");
  expect(repeated.planning.revision).toBe(after.planning.revision);
  expect(repeated.shopping).toEqual(after.shopping);
});
