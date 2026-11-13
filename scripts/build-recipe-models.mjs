/** Editorial migration. Quantities keep the legacy substitution ratios; methods
 * below describe the actual variant, never instructions to undo another dish. */
import fs from "node:fs";
import Decimal from "decimal.js";
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const recipes = [
  ...read("content/starter/recipes.json").recipes,
  ...read("content/expansions/requested-recipes.json").recipes,
];
const foods = [
  ...read("content/starter/ingredients.json").ingredients,
  ...read("content/expansions/requested-recipes.json").ingredients,
];
const rules = read("content/starter/substitutions.json").rules;
const cooking = read("content/cooking/rules.json").rules;
const display = read("content/presentation/recipe-display.json");
const names = (en, es) => ({ en, es });
const labels = {
  chicken: names("chicken", "pollo"),
  turkey: names("turkey", "pavo"),
  pork: names("pork", "cerdo"),
  beef: names("beef", "ternera"),
  salmon: names("salmon", "salmón"),
  cod: names("cod", "bacalao"),
  prawns: names("prawns", "langostinos"),
  tuna: names("tuna", "atún"),
  sardines: names("sardines", "sardinas"),
  tofu: names("tofu", "tofu"),
  lentils_green: names("lentils", "lentejas"),
  chickpeas: names("chickpeas", "garbanzos"),
  milk: names("milk", "leche"),
  soy_milk: names("soya drink", "bebida de soja"),
  egg: names("egg", "huevo"),
  rice_white: names("white rice", "arroz blanco"),
  rice_brown: names("brown rice", "arroz integral"),
  pasta: names("pasta", "pasta"),
  pasta_wholewheat: names("wholewheat pasta", "pasta integral"),
  peanut_butter: names("peanut butter", "crema de cacahuete"),
  almond: names("almonds", "almendras"),
  walnut: names("walnuts", "nueces"),
  pumpkin_seed: names("pumpkin seeds", "pipas de calabaza"),
};
const rename = (text, swaps) =>
  Object.fromEntries(
    ["en", "es"].map((lang) => [
      lang,
      swaps.reduce(
        (s, r) =>
          s.replace(
            new RegExp(
              lang === "en" &&
                ["prawns", "sardines", "walnut"].includes(r.from_ingredient_id)
                ? labels[r.from_ingredient_id][lang].replace(/s$/, "s?")
                : labels[r.from_ingredient_id][lang],
              "gi",
            ),
            labels[r.to_ingredient_id][lang],
          ),
        text[lang],
      ),
    ]),
  );
const grains = new Set([
  "rice_white",
  "rice_brown",
  "quinoa",
  "bulgur",
  "couscous",
  "pasta",
  "pasta_wholewheat",
]);
const separateProtein = {
  m18: "chicken",
  m26: "turkey",
  m27: "chicken",
  m28: "pork",
  m29: "salmon",
  m23: "tuna",
  m15: "beef",
  m19: "pork",
  m20: "salmon",
  m21: "cod",
  m22: "prawns",
  m24: "sardines",
  m25: "beef",
  m30: "cod",
};
const vegetables = {
  m18: [
    names(
      "Slice the peppers and onion. Cook in the measured oil with a little water until tender. Add lime, coriander and salt.",
      "Corta los pimientos y la cebolla. Cocínalos con el aceite medido y un poco de agua hasta que estén tiernos. Añade la lima, el cilantro y la sal.",
    ),
  ],
  m26: [
    names(
      "Slice the carrot and cook in the measured oil with a little water. Add spinach to wilt, then lemon, parsley and salt.",
      "Corta la zanahoria y cocínala con el aceite medido y un poco de agua. Añade las espinacas para rehogarlas y termina con limón, perejil y sal.",
    ),
  ],
  m27: [
    names(
      "Cook diced courgette and garlic in the measured oil. Add washed chopped tomato, lemon, basil and salt.",
      "Cocina el calabacín en dados y el ajo con el aceite medido. Añade el tomate lavado y cortado, el limón, la albahaca y la sal.",
    ),
  ],
  m28: [
    names(
      "Cook onion, pepper and garlic in the measured oil. Add tomato and simmer until tender; season with parsley and salt.",
      "Rehoga la cebolla, el pimiento y el ajo con el aceite medido. Añade el tomate y cocina hasta que esté tierno; termina con perejil y sal.",
    ),
  ],
  m29: [
    names(
      "Wash and chop the tomato and cucumber. Dress with the measured oil, lemon, dill and salt just before serving.",
      "Lava y corta el tomate y el pepino. Aliña con el aceite medido, el limón, el eneldo y la sal justo antes de servir.",
    ),
  ],
  m23: [
    names(
      "Wash and chop tomato and rocket. Combine with the measured oil, lemon, basil and salt.",
      "Lava y corta el tomate y la rúcula. Mezcla con el aceite medido, el limón, la albahaca y la sal.",
    ),
  ],
  m15: [
    names(
      "Soften onion, pepper and garlic in the measured oil. Add tomato and simmer until tender; finish with parsley and salt.",
      "Rehoga la cebolla, el pimiento y el ajo con el aceite medido. Añade el tomate y cocina hasta que esté tierno; termina con perejil y sal.",
    ),
  ],
  m19: [
    names(
      "Boil green beans until tender. Cook onion and apple in the measured oil with a little water; add mustard and salt.",
      "Hierve las judías verdes hasta que estén tiernas. Cocina la cebolla y la manzana con el aceite medido y un poco de agua; añade mostaza y sal.",
    ),
  ],
  m20: [
    names(
      "Boil or steam the weighed potatoes and green beans until tender. Dress with the measured oil, lemon, dill and salt.",
      "Hierve o cuece al vapor la patata pesada y las judías verdes hasta que estén tiernas. Aliña con el aceite medido, el limón, el eneldo y la sal.",
    ),
  ],
  m21: [
    names(
      "Soak and boil the weighed dry chickpeas according to the packet until tender. Soften onion and garlic in the measured oil, add tomato and simmer for 10 minutes. Add the cooked chickpeas, spinach, parsley and salt.",
      "Remoja y cuece los garbanzos pesados en seco según el envase hasta que estén tiernos. Rehoga la cebolla y el ajo con el aceite medido, añade el tomate y cocina 10 minutos. Incorpora los garbanzos cocidos, las espinacas, el perejil y la sal.",
    ),
  ],
  m22: [
    names(
      "Boil peas according to the packet and drain. Warm garlic in the measured oil, then combine with peas, lemon, parsley and salt.",
      "Hierve los guisantes según el envase y escurre. Calienta el ajo con el aceite medido y mezcla con los guisantes, el limón, el perejil y la sal.",
    ),
  ],
  m24: [
    names(
      "Toast the bread. Wash and chop tomato and add to the toast with lemon and parsley.",
      "Tuesta el pan. Lava y corta el tomate y añádelo al pan con el limón y el perejil.",
    ),
  ],
  m25: [
    names(
      "Soften onion and mushrooms in the measured oil. Remove from the heat and stir in yogurt, mustard, parsley and salt without boiling.",
      "Rehoga la cebolla y los champiñones con el aceite medido. Retira del fuego e incorpora el yogur, la mostaza, el perejil y la sal sin hervir.",
    ),
  ],
  m30: [
    names(
      "Dice potatoes, toss with the measured oil and roast at 200°C until nearly tender. Add peas, garlic and a little water; cover until cooked through, then add lemon, parsley and salt.",
      "Corta la patata en dados, mezcla con el aceite medido y asa a 200 °C hasta que esté casi tierna. Añade los guisantes, el ajo y un poco de agua; tapa hasta que estén hechos y termina con limón, perejil y sal.",
    ),
  ],
};
const proteinSteps = (id) =>
  id === "tofu"
    ? [
        names(
          "Cut the plain steamed tofu and heat gently with a little water until hot throughout.",
          "Corta el tofu natural al vapor y caliéntalo suavemente con un poco de agua hasta que esté caliente por completo.",
        ),
      ]
    : id === "chickpeas" || id === "lentils_green"
      ? [
          names(
            "Weigh the pulses DRY. Follow the packet for soaking and boiling, using fresh water, until fully tender. Drain before serving.",
            "Pesa las legumbres EN SECO. Sigue el envase para el remojo y la cocción, usando agua nueva, hasta que estén completamente tiernas. Escurre antes de servir.",
          ),
        ]
      : ["tuna", "sardines"].includes(id)
        ? [
            names(
              "Drain and weigh the fish before serving.",
              "Escurre y pesa el pescado antes de servir.",
            ),
          ]
        : id === "prawns"
          ? [
              names(
                "Cook the weighed raw prawns with a little water until fully cooked; check the safe core temperature for shellfish.",
                "Cocina los langostinos crudos pesados con un poco de agua hasta que estén completamente hechos; comprueba la temperatura interior segura del marisco.",
              ),
            ]
          : ["salmon", "cod"].includes(id)
            ? [
                names(
                  "Bake the fish at 190°C with a little water until fully cooked; check the safe core temperature for fish.",
                  "Hornea el pescado a 190 °C con un poco de agua hasta que esté completamente cocinado; comprueba la temperatura interior segura del pescado.",
                ),
              ]
            : [
                names(
                  "Cut the meat into small pieces. Cook in a non-stick pan with a little water until fully cooked; check the safe core temperature for this meat.",
                  "Corta la carne en trozos pequeños. Cocina en una sartén antiadherente con un poco de agua hasta que esté completamente hecha; comprueba la temperatura interior segura de esta carne.",
                ),
              ];
// These mixed dishes stay together: their vegetables cannot be claimed as a
// common preparation merely because another variant contains the same foods.
const alternateMethods = {
  m15: [
    names(
      "Cook the dry lentils separately according to the packet until tender. Soften onion, pepper and garlic in the measured oil.",
      "Cuece las lentejas secas aparte según el envase hasta que estén tiernas. Rehoga la cebolla, el pimiento y el ajo con el aceite medido.",
    ),
    names(
      "Add tomato and simmer until the vegetables are tender. Fold in the cooked lentils; serve with cooked bulgur, parsley and salt.",
      "Añade el tomate y cocina hasta que las verduras estén tiernas. Incorpora las lentejas cocidas; sirve con el bulgur cocido, el perejil y la sal.",
    ),
  ],
  m25: [
    names(
      "Cook dry lentils separately until tender. Soften onion and mushrooms in the measured oil, then add the cooked lentils.",
      "Cuece las lentejas secas aparte hasta que estén tiernas. Rehoga la cebolla y los champiñones con el aceite medido e incorpora las lentejas cocidas.",
    ),
    names(
      "Remove from the heat and stir in yogurt, mustard, parsley and salt. Serve with the cooked rice.",
      "Retira del fuego e incorpora el yogur, la mostaza, el perejil y la sal. Sirve con el arroz cocido.",
    ),
  ],
  m19: [
    names(
      "Cook rice according to the packet and boil the green beans until tender. Cook onion and apple in the measured oil with a little water.",
      "Cuece el arroz según el envase y hierve las judías verdes hasta que estén tiernas. Cocina la cebolla y la manzana con el aceite medido y un poco de agua.",
    ),
    names(
      "Add plain steamed tofu and mustard; heat gently throughout. Serve with rice, green beans and salt.",
      "Añade el tofu natural al vapor y la mostaza; calienta suavemente por completo. Sirve con el arroz, las judías verdes y la sal.",
    ),
  ],
  m20: [
    names(
      "Boil or steam the weighed potatoes and green beans until tender.",
      "Hierve o cuece al vapor la patata pesada y las judías verdes hasta que estén tiernas.",
    ),
    names(
      "Gently heat plain steamed tofu with the measured oil, lemon, dill and salt. Serve with the vegetables.",
      "Calienta suavemente el tofu natural al vapor con el aceite medido, el limón, el eneldo y la sal. Sirve con las verduras.",
    ),
  ],
  m21: [
    names(
      "Soak and boil the dry chickpeas according to the packet until tender. Soften onion and garlic in the measured oil, add tomato and simmer for 10 minutes.",
      "Remoja y cuece los garbanzos secos según el envase hasta que estén tiernos. Rehoga la cebolla y el ajo con el aceite medido, añade el tomate y cocina 10 minutos.",
    ),
    names(
      "Add cooked chickpeas and spinach. Gently heat plain steamed tofu in the sauce, then add parsley and salt.",
      "Añade los garbanzos cocidos y las espinacas. Calienta suavemente el tofu natural al vapor en la salsa y termina con perejil y sal.",
    ),
  ],
  m22: [
    names(
      "Cook the weighed rice according to the packet. Boil the peas according to their packet and drain.",
      "Cuece el arroz pesado según el envase. Hierve los guisantes según su envase y escurre.",
    ),
    names(
      "Warm garlic in the measured oil, then gently heat plain steamed tofu. Combine with rice, peas, lemon, parsley and salt.",
      "Calienta el ajo con el aceite medido y añade el tofu natural al vapor para calentarlo suavemente. Combina con el arroz, los guisantes, el limón, el perejil y la sal.",
    ),
  ],
  m24: [
    names(
      "Soak and boil the weighed dry chickpeas according to the packet until tender, then drain. Toast the bread and add washed chopped tomato.",
      "Remoja y cuece los garbanzos pesados en seco según el envase hasta que estén tiernos y escurre. Tuesta el pan y añade el tomate lavado y cortado.",
    ),
    names(
      "Lightly crush the cooked chickpeas and spread over the toast. Add lemon and parsley.",
      "Aplasta ligeramente los garbanzos cocidos y repártelos sobre la tostada. Añade el limón y el perejil.",
    ),
  ],
  m30: [
    names(
      "Dice the potatoes, toss with the measured oil and roast at 200°C until nearly tender.",
      "Corta la patata en dados, mezcla con el aceite medido y asa a 200 °C hasta que esté casi tierna.",
    ),
    names(
      "Add frozen peas, garlic and a little water; cover until the peas are cooked. Gently heat plain steamed tofu with the vegetables and finish with lemon, parsley and salt.",
      "Añade los guisantes congelados, el ajo y un poco de agua; tapa hasta que los guisantes estén hechos. Calienta suavemente el tofu natural al vapor con las verduras y termina con limón, perejil y sal.",
    ),
  ],
  b07: [
    names(
      "Wash spinach and tomato. Warm the measured oil and cook the spinach until wilted.",
      "Lava las espinacas y el tomate. Calienta el aceite medido y rehoga las espinacas.",
    ),
    names(
      "Crumble plain steamed tofu into the spinach and gently heat throughout. Season with salt and serve with toast and chopped tomato.",
      "Desmenuza el tofu natural al vapor con las espinacas y calienta suavemente por completo. Añade la sal y sirve con la tostada y el tomate cortado.",
    ),
  ],
  b08: [
    names(
      "Slice mushrooms and cook in the measured oil until their released water evaporates.",
      "Corta los champiñones y cocínalos con el aceite medido hasta que se evapore el agua que suelten.",
    ),
    names(
      "Add crumbled plain steamed tofu, parsley and salt; gently heat throughout and serve with bread.",
      "Añade el tofu natural al vapor desmenuzado, el perejil y la sal; calienta suavemente por completo y sirve con el pan.",
    ),
  ],
};
const models = {};
for (const recipe of recipes) {
  const candidates = [
    ...new Set(
      recipe.components.flatMap((c) =>
        c.ingredients.map((l) => l.ingredient_id),
      ),
    ),
  ].map((id) => [
    null,
    ...rules.filter(
      (r) =>
        r.from_ingredient_id === id && r.allowed_recipe_ids.includes(recipe.id),
    ),
  ]);
  const combos = candidates.reduce(
    (all, choices) =>
      all.flatMap((a) => choices.map((c) => (c ? [...a, c] : a))),
    [[]],
  );
  const variants = combos.map((swaps) => {
    const variantName = rename(recipe.name, swaps);
    for (const lang of ["en", "es"]) {
      const extras = swaps
        .map((r) => labels[r.to_ingredient_id][lang])
        .filter(
          (label) =>
            !variantName[lang].toLowerCase().includes(label.toLowerCase()),
        );
      if (extras.length)
        variantName[lang] += " · " + [...new Set(extras)].join(", ");
      variantName[lang] =
        variantName[lang][0].toUpperCase() + variantName[lang].slice(1);
    }
    const components = structuredClone(recipe.components).map((c) => ({
      ...c,
      ingredients: c.ingredients.map((l) => {
        const s = swaps.find((r) => r.from_ingredient_id === l.ingredient_id);
        if (!s) return l;
        const f = foods.find((f) => f.id === l.ingredient_id);
        return {
          ingredient_id: s.to_ingredient_id,
          unit: "g",
          quantity: new Decimal(l.quantity)
            .mul(f.conversions.find((cv) => cv.unit === l.unit).grams_per_unit)
            .mul(s.initial_target_grams_per_source_gram)
            .toNumber(),
        };
      }),
    }));
    const preparations = [];
    for (const c of components) {
      const source = recipe.components.find((x) => x.id === c.id);
      const lines = c.ingredients.map((l, i) => ({
        ...l,
        component_id: c.id,
        order: i,
      }));
      const singleGrain =
        lines.length === 1 &&
        grains.has(lines[0].ingredient_id) &&
        recipe.ingredient_preparation?.some(
          (x) =>
            x.ingredient_id === source.ingredients[0].ingredient_id &&
            x.mode === "separate_before_finishing",
        );
      const isSplit = c.id === "main" && separateProtein[recipe.id];
      const method =
        swaps.some((r) =>
          ["tofu", "lentils_green", "chickpeas"].includes(r.to_ingredient_id),
        ) &&
        c.id === "main" &&
        alternateMethods[recipe.id]
          ? alternateMethods[recipe.id]
          : c.instructions.map((x) => {
              const override = display.steps.find(
                (rule) =>
                  rule.targets.some(
                    (target) =>
                      target.recipe_id === recipe.id &&
                      target.component_id === c.id,
                  ) &&
                  rule.source.en === x.en &&
                  rule.source.es === x.es,
              );
              return rename(override?.display ?? x, swaps);
            });
      const make = (id, name, ls, instructions, batchable = false) => ({
        id,
        revision: 1,
        name,
        optional: c.kind === "dessert",
        default_included: c.default_included,
        lines: ls,
        instructions,
        batchable,
        soak: ls.some((l) =>
          [
            "chickpeas",
            "beans_white",
            "beans_kidney",
            "beans_blackeye",
          ].includes(l.ingredient_id),
        ),
      });
      if (isSplit) {
        const original = separateProtein[recipe.id],
          protein =
            swaps.find((s) => s.from_ingredient_id === original)
              ?.to_ingredient_id ?? original;
        preparations.push(
          make(
            `${recipe.id}-vegetables`,
            recipe.id === "m24"
              ? names("Toast and tomato", "Tostadas con tomate")
              : names("Vegetables and seasoning", "Verduras y aliño"),
            lines.filter((l) => l.ingredient_id !== protein),
            vegetables[recipe.id],
            !["m29", "m23", "m24"].includes(recipe.id),
          ),
        );
        preparations.push(
          make(
            `plain-${protein}`,
            labels[protein],
            lines.filter((l) => l.ingredient_id === protein),
            proteinSteps(protein),
            !["tuna"].includes(protein),
          ),
        );
      } else if (singleGrain) {
        const f = foods.find((f) => f.id === lines[0].ingredient_id);
        preparations.push(
          make(
            `plain-${f.id}`,
            f.name,
            lines,
            [
              names(
                "Weigh dry and cook separately in water according to the packet.",
                "Pesa en seco y cocina aparte con agua según el envase.",
              ),
            ],
            true,
          ),
        );
      } else {
        const modified = swaps.filter((s) =>
          source.ingredients.some(
            (l) => l.ingredient_id === s.from_ingredient_id,
          ),
        );
        preparations.push(
          make(
            `${recipe.id}-${c.id}${
              modified.length
                ? "-" +
                  modified
                    .map((r) => r.id)
                    .sort()
                    .join("-")
                : ""
            }`,
            c.kind === "dessert" ? c.name : variantName,
            lines,
            method,
            c.kind !== "dessert" &&
              !!cooking.find((r) => r.recipe_id === recipe.id)?.whole,
          ),
        );
      }
    }
    return {
      id: swaps.length
        ? swaps
            .map((r) => r.id)
            .sort()
            .join("-")
        : "original",
      name: variantName,
      substitutions: swaps.map((r) => ({
        from: r.from_ingredient_id,
        to: r.to_ingredient_id,
        instructions: names(
          `Replace ${labels[r.from_ingredient_id].en} with ${labels[r.to_ingredient_id].en}.`,
          `Sustituye ${labels[r.from_ingredient_id].es} por ${labels[r.to_ingredient_id].es}.`,
        ),
      })),
      preparations,
    };
  });
  models[recipe.id] = {
    version: 2,
    legacy_components: recipe.components,
    legacy_name: recipe.name,
    default_variant_id: "original",
    variants,
  };
}
fs.writeFileSync(
  "content/preparations/recipe-models.json",
  JSON.stringify(models, null, 2) + "\n",
);
console.log(
  `${recipes.length} recipes; ${Object.values(models).reduce((n, m) => n + m.variants.length, 0)} explicit variants`,
);

const migrationPath =
  "supabase/migrations/202611110029_recipe_preparations.sql";
if (fs.existsSync(migrationPath)) {
  const sql = fs.readFileSync(migrationPath, "utf8");
  const first = sql.indexOf("$models$"),
    last = sql.indexOf("$models$", first + 8);
  if (first < 0 || last < 0)
    throw new Error("recipe model seed marker missing");
  fs.writeFileSync(
    migrationPath,
    sql.slice(0, first + 8) + JSON.stringify(models) + sql.slice(last),
  );
}
