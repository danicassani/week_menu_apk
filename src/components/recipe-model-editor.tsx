import { useEffect, useRef, useState } from "react";
import type { ViewProps } from "../pages/views";
import type { PlannedRecipe, Names } from "../domain/planning";
import {
  simpleRecipeModel,
  variantComponents,
  validateRecipeModel,
  type Preparation,
} from "../domain/recipe-model";
import { ingredientText } from "../domain/content-presentation";
import { translator, errorMessage, mealLabel } from "../lib/i18n";
import { ContentTextField } from "./content-text-field";
import { Button, Modal } from "./ui";
export function RecipeModelEditor({
  v,
  initial,
  onClose,
}: {
  v: ViewProps;
  initial: PlannedRecipe;
  onClose: () => void;
}) {
  const t = translator(v.language),
    text = (n: Names) => n[v.language] || n.es || n.en;
  const [recipe, setRecipe] = useState<PlannedRecipe>(() => ({
    ...structuredClone(initial),
    recipe_model: structuredClone(
      initial.recipe_model ?? simpleRecipeModel(initial),
    ),
  }));
  const [selected, setSelected] = useState(
      recipe.recipe_model!.default_variant_id,
    ),
    [error, setError] = useState("");
  const [revision, setRevision] = useState(initial.revision ?? 1);
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (error) {
      errorRef.current?.focus();
      errorRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [error]);
  const model = recipe.recipe_model!,
    variant = model.variants.find((v) => v.id === selected)!;
  const ingredients = v.s.planning?.ingredients ?? [];
  const available = [
    ...new Map(
      (v.s.planning?.recipes ?? [])
        .flatMap(
          (r) => r.recipe_model?.variants.flatMap((v) => v.preparations) ?? [],
        )
        .map((p) => [`${p.id}/${p.revision}`, p]),
    ).values(),
  ];
  const updateVariant = (patch: Partial<typeof variant>) =>
    setRecipe({
      ...recipe,
      recipe_model: {
        ...model,
        variants: model.variants.map((v) =>
          v.id === selected ? { ...v, ...patch } : v,
        ),
      },
    });
  const editPrep = (index: number, patch: Partial<Preparation>) => {
    const old = variant.preparations[index];
    const identity = (lines: Preparation["lines"]) =>
      JSON.stringify(
        lines.map((l) => [l.component_id, l.ingredient_id, l.unit]),
      );
    const changed =
      !!patch.instructions ||
      (!!patch.lines && identity(patch.lines) !== identity(old.lines)) ||
      patch.batchable !== undefined;
    updateVariant({
      preparations: variant.preparations.map((p, i) =>
        i === index
          ? {
              ...p,
              ...patch,
              ...(patch.instructions ||
              (patch.lines && identity(patch.lines) !== identity(old.lines))
                ? { batchable: false }
                : {}),
              ...(changed
                ? { id: `${recipe.id}-${crypto.randomUUID()}`, revision: 1 }
                : {}),
            }
          : p,
      ),
    });
  };
  const addPrep = (source?: Preparation) => {
    const id = `${recipe.id}-${crypto.randomUUID()}`,
      component = `part_${crypto.randomUUID()}`;
    const prep: Preparation = source
      ? {
          ...structuredClone(source),
          lines: source.lines.map((l) => ({ ...l, component_id: component })),
        }
      : {
          id,
          revision: 1,
          name: { en: "", es: "" },
          optional: false,
          default_included: true,
          lines: [],
          instructions: [],
          batchable: false,
          soak: false,
        };
    updateVariant({ preparations: [...variant.preparations, prep] });
  };
  const save = async (archive = false) => {
    try {
      validateRecipeModel(recipe);
      const original = model.variants.find(
        (v) => v.id === model.default_variant_id,
      )!;
      const payload = {
        ...recipe,
        components: variantComponents(recipe, original),
        ingredient_preparation: [],
        provenance: { kind: "household_created_or_edited" },
      };
      payload.recipe_model = {
        ...model,
        legacy_components: structuredClone(payload.components),
        legacy_name: { ...payload.name },
      };
      if (
        await v.operate(
          async () => {
            try {
              await v.repository.saveContent(
                "recipe",
                payload,
                revision,
                archive,
              );
            } catch (e) {
              setError(errorMessage(e, v.language));
              throw e;
            }
          },
          t("Recipe saved.", "Receta guardada."),
        )
      )
        onClose();
    } catch (e) {
      setError(errorMessage(e, v.language));
    }
  };
  return (
    <Modal title={t("Edit recipe", "Editar receta")} wide onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        {error && (
          <p ref={errorRef} tabIndex={-1} role="alert" className="inline-error">
            {error}
          </p>
        )}
        {error && (
          <Button
            secondary
            type="button"
            onClick={() =>
              void v.operate(
                async () => {
                  const fresh = await v.ensurePlanning(true);
                  const current = fresh.recipes.find(
                    (r) => r.id === initial.id,
                  );
                  if (!current) throw new Error("recipe_unavailable");
                  const next = {
                    ...structuredClone(current),
                    recipe_model: structuredClone(
                      current.recipe_model ?? simpleRecipeModel(current),
                    ),
                  };
                  setRecipe(next);
                  setSelected(next.recipe_model.default_variant_id);
                  setRevision(current.revision ?? 1);
                  setError("");
                },
                undefined,
                false,
              )
            }
          >
            {t("Reload current version", "Cargar versión actual")}
          </Button>
        )}
        <ContentTextField
          label={t("Name", "Nombre")}
          value={recipe.name}
          language={v.language}
          onChange={(name) =>
            setRecipe({
              ...recipe,
              name,
              recipe_model: {
                ...model,
                variants: model.variants.map((v) =>
                  v.id === model.default_variant_id
                    ? {
                        ...v,
                        name,
                        preparations: v.preparations.map((p) =>
                          JSON.stringify(p.name) === JSON.stringify(v.name)
                            ? { ...p, name }
                            : p,
                        ),
                      }
                    : v,
                ),
              },
            })
          }
        />
        <label>
          {t("Serves", "Personas")}
          <input
            type="number"
            min="0.01"
            step="any"
            required
            value={recipe.reference_servings}
            onChange={(e) =>
              setRecipe({
                ...recipe,
                reference_servings: e.target.valueAsNumber,
              })
            }
          />
        </label>
        <fieldset>
          <legend>{t("Suitable meal slots", "Comidas disponibles")}</legend>
          {(["breakfast", "lunch", "dinner"] as const).map((type) => (
            <label key={type} className="check-row">
              <input
                type="checkbox"
                checked={recipe.meal_types.includes(type)}
                onChange={(e) =>
                  setRecipe({
                    ...recipe,
                    meal_types: e.target.checked
                      ? [...recipe.meal_types, type]
                      : recipe.meal_types.filter((x) => x !== type),
                  })
                }
              />
              {mealLabel(type, v.language)}
            </label>
          ))}
        </fieldset>
        <details className="recipe-variant-tools">
          <summary>
            {t(
              "Variants and reusable preparations",
              "Variantes y preparaciones reutilizables",
            )}
          </summary>
          <label>
            {t("Variant", "Variante")}
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              {model.variants.map((v) => (
                <option key={v.id} value={v.id}>
                  {text(v.name)}
                </option>
              ))}
            </select>
          </label>
          <Button
            secondary
            type="button"
            onClick={() => {
              const id = crypto.randomUUID();
              setRecipe({
                ...recipe,
                recipe_model: {
                  ...model,
                  variants: [
                    ...model.variants,
                    {
                      ...structuredClone(variant),
                      id,
                      substitutions: [],
                      name: { en: "New variant", es: "Nueva variante" },
                    },
                  ],
                },
              });
              setSelected(id);
            }}
          >
            {t("Add variant", "Añadir variante")}
          </Button>
          {selected !== model.default_variant_id && (
            <Button
              secondary
              type="button"
              onClick={() => {
                setRecipe({
                  ...recipe,
                  recipe_model: {
                    ...model,
                    variants: model.variants.filter((v) => v.id !== selected),
                  },
                });
                setSelected(model.default_variant_id);
              }}
            >
              {t("Remove variant", "Eliminar variante")}
            </Button>
          )}
          <label>
            {t("Reuse preparation", "Reutilizar preparación")}
            <select
              value=""
              onChange={(e) => {
                const p = available.find(
                  (p) => `${p.id}/${p.revision}` === e.target.value,
                );
                if (p) addPrep(p);
              }}
            >
              <option value="">{t("Choose…", "Elegir…")}</option>
              {available.map((p) => (
                <option
                  key={`${p.id}/${p.revision}`}
                  value={`${p.id}/${p.revision}`}
                >
                  {text(p.name)}
                </option>
              ))}
            </select>
          </label>
          <Button secondary type="button" onClick={() => addPrep()}>
            {t("Add preparation", "Añadir preparación")}
          </Button>
        </details>
        {model.variants.length > 1 && (
          <ContentTextField
            label={t("Variant name", "Nombre de variante")}
            value={variant.name}
            language={v.language}
            onChange={(name) => updateVariant({ name })}
          />
        )}
        {variant.preparations.map((p, pi) => (
          <section
            className="recipe-component"
            key={pi}
            aria-label={
              p.optional
                ? t("Optional dessert", "Postre opcional")
                : text(p.name)
            }
          >
            {variant.preparations.length > 1 && (
              <ContentTextField
                label={t("Preparation", "Preparación")}
                value={p.name}
                language={v.language}
                onChange={(name) => editPrep(pi, { name })}
              />
            )}
            <ul className="ingredient-list">
              {p.lines.map((l, li) => (
                <li key={li} className="recipe-line-editor">
                  <select
                    aria-label={t("Ingredient", "Ingrediente")}
                    value={l.ingredient_id}
                    onChange={(e) =>
                      editPrep(pi, {
                        lines: p.lines.map((x, i) =>
                          i === li
                            ? { ...x, ingredient_id: e.target.value, unit: "g" }
                            : x,
                        ),
                      })
                    }
                  >
                    {ingredients
                      .filter((i) => !i.archived || i.id === l.ingredient_id)
                      .map((i) => (
                        <option value={i.id} key={i.id}>
                          {ingredientText(i, v.language)}
                        </option>
                      ))}
                  </select>
                  <input
                    aria-label={t("Quantity", "Cantidad")}
                    type="number"
                    min="0.0001"
                    step="any"
                    required
                    value={l.quantity}
                    onChange={(e) =>
                      editPrep(pi, {
                        lines: p.lines.map((x, i) =>
                          i === li
                            ? { ...x, quantity: e.target.valueAsNumber }
                            : x,
                        ),
                      })
                    }
                  />
                  <select
                    aria-label={t("Unit", "Unidad")}
                    value={l.unit}
                    onChange={(e) =>
                      editPrep(pi, {
                        lines: p.lines.map((x, i) =>
                          i === li ? { ...x, unit: e.target.value } : x,
                        ),
                      })
                    }
                  >
                    {ingredients
                      .find((i) => i.id === l.ingredient_id)
                      ?.conversions.map((c) => (
                        <option key={c.unit}>{c.unit}</option>
                      ))}
                  </select>
                  <button
                    type="button"
                    onClick={() =>
                      editPrep(pi, {
                        lines: p.lines.filter((_, i) => i !== li),
                      })
                    }
                  >
                    {t("Remove", "Quitar")}
                  </button>
                </li>
              ))}
            </ul>
            <Button
              secondary
              type="button"
              onClick={() => {
                const food = ingredients.find(
                  (i) =>
                    !i.archived &&
                    !p.lines.some((l) => l.ingredient_id === i.id),
                );
                if (food)
                  editPrep(pi, {
                    lines: [
                      ...p.lines,
                      {
                        ingredient_id: food.id,
                        quantity: 100,
                        unit: "g",
                        component_id: p.lines[0]?.component_id ?? `part_${pi}`,
                        order: p.lines.length,
                      },
                    ],
                  });
              }}
            >
              {t("Add ingredient", "Añadir ingrediente")}
            </Button>
            {p.instructions.map((step, si) => (
              <ContentTextField
                key={si}
                label={`${t("Step", "Paso")} ${si + 1}`}
                multiline
                value={step}
                language={v.language}
                onChange={(value) =>
                  editPrep(pi, {
                    instructions: p.instructions.map((s, i) =>
                      i === si ? value : s,
                    ),
                  })
                }
              />
            ))}
            <Button
              secondary
              type="button"
              onClick={() =>
                editPrep(pi, {
                  instructions: [...p.instructions, { en: "", es: "" }],
                })
              }
            >
              {t("Add step", "Añadir paso")}
            </Button>
            <details>
              <summary>
                {t("Preparation options", "Opciones de preparación")}
              </summary>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={p.optional}
                  onChange={(e) =>
                    editPrep(pi, {
                      optional: e.target.checked,
                      default_included: !e.target.checked,
                      lines: p.lines.map((l) => ({
                        ...l,
                        component_id: `${e.target.checked ? "dessert" : "part"}_${pi}`,
                      })),
                    })
                  }
                />
                {t("Optional dessert", "Postre opcional")}
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={p.batchable}
                  onChange={(e) =>
                    editPrep(pi, { batchable: e.target.checked })
                  }
                />
                {t(
                  "Can be prepared in advance",
                  "Se puede preparar con antelación",
                )}
              </label>
              <Button
                secondary
                type="button"
                onClick={() =>
                  updateVariant({
                    preparations: variant.preparations.filter(
                      (_, i) => i !== pi,
                    ),
                  })
                }
              >
                {t("Remove preparation", "Eliminar preparación")}
              </Button>
            </details>
          </section>
        ))}
        <div className="button-row">
          <Button type="submit" busy={v.busy}>
            {t("Save recipe", "Guardar receta")}
          </Button>
          <Button
            secondary
            type="button"
            onClick={() => void save(!recipe.archived)}
          >
            {recipe.archived
              ? t("Restore recipe", "Restaurar receta")
              : t("Archive recipe", "Archivar receta")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
