import { ingredientText } from "../domain/content-presentation";
import { useEffect, useRef, useState } from "react";
import { Copy, ClipboardPaste, ArrowDownUp, X } from "lucide-react";
import { IconAction } from "./icon-action";
import { Button, Modal } from "./ui";
import {
  buildTransfer,
  choiceFromMeal,
  endpointKey,
  endpointOccupied,
  endpointClosed,
  type MealEndpoint,
  type RecipeChoice,
  type TransferRequest,
  type TransferPreview,
} from "../domain/planning-transfer";
import { slotKey } from "../domain/menu-draft";
import { formatDay } from "../domain/dates";
import { errorMessage, mealLabel, translator } from "../lib/i18n";
import type { ViewProps } from "../pages/views";
import type { MealPlan, PlannedRecipe } from "../domain/planning";
export type MenuDraft = {
  id: string;
  plans: MealPlan[];
  revision: number;
  replace: boolean;
  gaps: string[];
};
export function useMealTransfers(
  v: ViewProps,
  draft: MenuDraft | null,
  setDraft: (draft: MenuDraft | null) => void,
  locks: string[],
  onRead: (recipe: PlannedRecipe, plan?: MealPlan) => void,
) {
  const t = translator(v.language),
    lib = v.s.planning;
  const [selectionError, setSelectionError] = useState("");
  const [swap, setSwap] = useState<{
    endpoint: MealEndpoint;
    context: string;
    revision: number;
  } | null>(null);
  const [review, setReview] = useState<{
    request: TransferRequest;
    result: TransferPreview;
    context: string;
    error: string;
    uncertain: boolean;
  } | null>(null);
  const text = (n: { en: string; es: string }) => n[v.language] || n.en || n.es;
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector("dialog[open]")) {
        flight.current++;
        v.setClipboard(null);
        setSwap(null);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [v.setClipboard]);
  const flight = useRef(0);
  useEffect(
    () => () => {
      flight.current++;
    },
    [draft?.id],
  );
  const currentContext = () => draft?.id ?? "saved";
  useEffect(() => {
    setSwap(null);
    setReview(null);
    setSelectionError("");
  }, [draft?.id]);
  const clearSwap = () => {
    flight.current++;
    setSwap(null);
    setSelectionError("");
  };
  const patchDraft = (changed: MealPlan[]) => {
    if (!draft) return;
    const patches = new Map(changed.map((p) => [slotKey(p), p]));
    const existing = new Set(draft.plans.map(slotKey));
    const next = draft.plans
      .map((p) => patches.get(slotKey(p)) ?? p)
      .concat(changed.filter((p) => !existing.has(slotKey(p))));
    setDraft({ ...draft, plans: next });
  };
  const requestReview = async (
    request: TransferRequest,
    context: string,
    plans: MealPlan[],
  ) => {
    if (!lib) return;
    setSelectionError("");
    const generation = ++flight.current;
    let result: TransferPreview | undefined;
    await v.operate(
      async () => {
        try {
          if (context === "saved") {
            result = await v.repository.previewTransfer(request);
            // A shopping check can advance the shared revision before Realtime
            // refreshes this view. Hydrate before presenting the first review;
            // changes made after that review still invalidate its revision.
            if (result.revision !== lib.revision) {
              const current = await v.ensurePlanning(true);
              if (current.revision !== result.revision)
                throw new Error("stale_plan");
            }
          } else
            result = buildTransfer(
              v.s,
              { ...lib, revision: draft!.revision },
              request,
              plans,
              locks,
            );
        } catch (error) {
          result = undefined;
          if (generation === flight.current)
            setSelectionError(errorMessage(error, v.language));
          throw error;
        }
      },
      undefined,
      false,
    );
    if (result && generation === flight.current) {
      if (context !== "saved" && request.mode === "swap") {
        patchDraft(result.plans);
        setSwap(null);
      } else
        setReview({ request, result, context, error: "", uncertain: false });
    }
  };
  const actions = (
    ep: MealEndpoint,
    plans: MealPlan[],
    context: string,
    stale = false,
    part: "both" | "copy" | "swap" = "both",
  ) => {
    if (!lib) return null;
    const plan = plans.find((p) => slotKey(p) === slotKey(ep));
    const occupied = endpointOccupied(plans, ep),
      closed = endpointClosed(v.s, ep),
      locked = locks.includes(endpointKey(ep)) && context !== "saved";
    let choice: RecipeChoice | undefined,
      choiceError = "";
    try {
      if (plan && occupied) choice = choiceFromMeal(plan, ep, lib);
    } catch (e) {
      choiceError = errorMessage(e, v.language);
    }
    const copied = v.clipboard,
      sourceSelected =
        !!copied?.origin &&
        copied.origin.context === context &&
        endpointKey(copied.origin.endpoint) === endpointKey(ep) &&
        !!choice &&
        JSON.stringify(copied.choice) === JSON.stringify(choice);
    const person = v.s.members.find((m) => m.id === ep.member_id)?.name ?? "";
    const compatible =
      !copied ||
      !!lib.recipes.find(
        (r) =>
          r.id === copied.choice.recipe_id &&
          !r.archived &&
          (r.revision ?? 1) === copied.choice.revision &&
          r.meal_types.includes(ep.type),
      );
    const swapSelected =
      swap?.context === context &&
      endpointKey(swap.endpoint) === endpointKey(ep);
    const swapCompatible =
      !swap ||
      (swap.context === context &&
        (swap.endpoint.type === "breakfast") === (ep.type === "breakfast"));
    const other = ep.member_id && ep.member_id !== v.s.viewer_id;
    const swapLabel = swapSelected
      ? other
        ? t(
            `Cancel selected swap for ${person}`,
            `Cancelar intercambio de ${person}`,
          )
        : t("Cancel selected swap", "Cancelar intercambio seleccionado")
      : swap
        ? other
          ? t(
              `Swap breakfast here for ${person}`,
              `Intercambiar aquí el desayuno de ${person}`,
            )
          : t("Swap here", "Intercambiar aquí")
        : other
          ? t(
              `Swap breakfast for ${person}`,
              `Intercambiar desayuno de ${person}`,
            )
          : context === "saved"
            ? t(
                ep.type === "breakfast" ? "Swap breakfast" : "Swap meal",
                ep.type === "breakfast"
                  ? "Intercambiar desayuno"
                  : "Intercambiar comida",
              )
            : t("Swap suggestion", "Intercambiar sugerencia");
    return (
      <>
        {part !== "swap" &&
          (sourceSelected || (copied && !closed) || (!copied && occupied)) && (
            <span
              title={
                choiceError ||
                (!compatible
                  ? t(
                      "This recipe cannot be pasted here. Review its meal types or copy it again after changes.",
                      "Esta receta no se puede pegar aquí. Revisa sus tipos de comida o vuelve a copiarla tras los cambios.",
                    )
                  : undefined)
              }
            >
              <IconAction
                icon={copied && !sourceSelected ? ClipboardPaste : Copy}
                label={
                  sourceSelected
                    ? t("Cancel copy", "Cancelar copia")
                    : copied
                      ? ep.type === "breakfast"
                        ? t(
                            `Paste breakfast for ${person}`,
                            `Pegar desayuno de ${person}`,
                          )
                        : t("Paste meal", "Pegar comida")
                      : ep.type === "breakfast"
                        ? t(
                            `Copy breakfast for ${person}`,
                            `Copiar desayuno de ${person}`,
                          )
                        : t("Copy meal", "Copiar comida")
                }
                aria-pressed={sourceSelected}
                disabled={
                  v.busy ||
                  stale ||
                  (!copied && !choice) ||
                  (!!copied && !sourceSelected && (!compatible || locked))
                }
                onClick={() => {
                  setSelectionError("");
                  if (sourceSelected) {
                    v.setClipboard(null);
                    return;
                  }
                  if (copied) {
                    void requestReview(
                      { mode: "paste", target: ep, choice: copied.choice },
                      context,
                      plans,
                    );
                    return;
                  }
                  if (choice) {
                    v.setClipboard({
                      choice,
                      name: lib.recipes.find((r) => r.id === choice.recipe_id)!
                        .name,
                      origin: { endpoint: ep, context },
                    });
                    setSwap(null);
                  }
                }}
              />
            </span>
          )}
        {part !== "copy" && !closed && (occupied || swap) && (
          <IconAction
            icon={ArrowDownUp}
            label={swapLabel}
            aria-pressed={!!swapSelected}
            disabled={
              v.busy ||
              stale ||
              locked ||
              !swapCompatible ||
              (!swap && !choice) ||
              (!!swap &&
                swap.revision !==
                  (context === "saved" ? lib.revision : draft?.revision))
            }
            onClick={() => {
              setSelectionError("");
              if (swapSelected) {
                setSwap(null);
                return;
              }
              if (swap) {
                void requestReview(
                  { mode: "swap", source: swap.endpoint, target: ep },
                  context,
                  plans,
                );
                return;
              }
              v.setClipboard(null);
              setSwap({
                endpoint: ep,
                context,
                revision: context === "saved" ? lib.revision : draft!.revision,
              });
            }}
          />
        )}
      </>
    );
  };
  const banner = () =>
    v.clipboard || swap ? (
      <>
        <div className="planning-clipboard" role="status">
          <span>
            {v.clipboard
              ? t(
                  `Copied: ${text(v.clipboard.name)}. Choose a paste destination.`,
                  `Copiado: ${text(v.clipboard.name)}. Elige dónde pegar.`,
                )
              : t(
                  "Choose a swap destination. Breakfast swaps affect only the selected recipients.",
                  "Elige el destino del intercambio. Los desayunos solo cambian para las personas seleccionadas.",
                )}
          </span>
          <IconAction
            icon={X}
            label={t("Cancel transfer", "Cancelar transferencia")}
            onClick={() => {
              flight.current++;
              v.setClipboard(null);
              setSwap(null);
            }}
          />
        </div>
        {selectionError && (
          <p className="note warning" role="alert">
            {selectionError}
          </p>
        )}
      </>
    ) : null;
  const dialog =
    review && lib ? (
      <Modal
        title={
          review.request.mode === "swap"
            ? t("Review meal swap", "Revisa el intercambio")
            : t("Review pasted meal", "Revisa la comida pegada")
        }
        wide
        onClose={() => {
          if (!v.busy) setReview(null);
        }}
      >
        {review.request.mode === "paste" && review.result.occupied && (
          <p className="note warning">
            {t(
              "This replaces the existing meal for the selected recipient(s), including any eating-out entry and dessert choices. Accept only after reviewing the portions below.",
              "Se sustituirá la comida de las personas seleccionadas, incluidos los registros de comer fuera y las opciones de postre. Acepta solo tras revisar las porciones.",
            )}
          </p>
        )}
        {review.result.plans.map((plan) => (
          <section className="transfer-review-meal" key={slotKey(plan)}>
            <h3>
              {formatDay(plan.day, v.language, {
                weekday: "long",
                day: "numeric",
                month: "short",
              })}{" "}
              · {mealLabel(plan.type, v.language)}
            </h3>
            {!plan.portions.length ? (
              <p>
                {t(
                  "Not planned after this move",
                  "Sin planificar tras este movimiento",
                )}
              </p>
            ) : (
              plan.portions.map((p) => (
                <div key={p.member_id}>
                  <p>
                    <b>
                      {
                        v.s.members.find((m) => m.id === p.member_id)
                          ?.presentation?.avatar
                      }{" "}
                      {v.s.members.find((m) => m.id === p.member_id)?.name}
                    </b>{" "}
                    ·{" "}
                    {p.eating_out ? (
                      p.description
                    ) : (
                      <button
                        className="text-link"
                        onClick={() => {
                          if (p.recipe_snapshot)
                            onRead(p.recipe_snapshot, plan);
                        }}
                      >
                        {text(p.name)}
                      </button>
                    )}{" "}
                    · {Math.round(p.kcal)} / {Math.round(p.budget)} kcal
                  </p>
                  {!p.eating_out && (
                    <details>
                      <summary>
                        {t(
                          "Portions and substitutions",
                          "Porciones y sustituciones",
                        )}
                      </summary>
                      <ul className="ingredient-list">
                        {p.lines.map((l, i) => (
                          <li key={i}>
                            <span>{ingredientText(l, v.language)}</span>
                            <b>
                              {l.quantity} {l.unit}
                            </b>
                          </li>
                        ))}
                      </ul>
                      {p.substitutions.map((s, i) => (
                        <p key={i} className="note">
                          {text(s.instructions)}
                        </p>
                      ))}
                    </details>
                  )}
                  {p.kcal > p.budget && (
                    <p className="fine-print">
                      {t(
                        "Rounded quantities exceed the budget. Review portions after saving.",
                        "Las cantidades redondeadas superan el presupuesto. Revisa las porciones tras guardar.",
                      )}
                    </p>
                  )}
                </div>
              ))
            )}
          </section>
        ))}
        {(review.error ||
          review.result.revision !== lib.revision ||
          review.context !== currentContext()) && (
          <p className="note warning" role="alert">
            {review.error ||
              t(
                "The menu changed. Close this review and choose the destination again.",
                "El menú ha cambiado. Cierra la revisión y vuelve a elegir el destino.",
              )}
          </p>
        )}
        <div className="button-row">
          <Button
            busy={v.busy}
            disabled={
              review.uncertain ||
              review.result.revision !== lib.revision ||
              review.context !== currentContext()
            }
            onClick={async () => {
              if (review.context !== "saved") {
                if (!draft || draft.id !== review.context) return;
                try {
                  const fresh = buildTransfer(
                    v.s,
                    { ...lib, revision: draft.revision },
                    review.request,
                    draft.plans,
                    locks,
                  );
                  if (fresh.fingerprint !== review.result.fingerprint)
                    throw Error("stale_plan");
                  patchDraft(fresh.plans);
                  setReview(null);
                  setSwap(null);
                } catch (e) {
                  setReview({ ...review, error: errorMessage(e, v.language) });
                }
                return;
              }
              const ok = await v.operate(
                async () => {
                  try {
                    await v.repository.applyTransfer(
                      review.request,
                      review.result,
                      review.result.occupied,
                    );
                  } catch (e) {
                    setReview({
                      ...review,
                      error: errorMessage(e, v.language),
                      uncertain:
                        e instanceof Error &&
                        e.message.includes("mutation_outcome_unknown"),
                    });
                    throw e;
                  }
                },
                t(
                  "Menu updated. Shopping is synchronized.",
                  "Menú actualizado. La compra está sincronizada.",
                ),
              );
              if (ok) {
                setReview(null);
                setSwap(null);
              }
            }}
          >
            {review.request.mode === "swap"
              ? t("Apply swap", "Aplicar intercambio")
              : review.result.occupied
                ? t("Replace and paste", "Sustituir y pegar")
                : t("Paste meal", "Pegar comida")}
          </Button>
          <Button secondary disabled={v.busy} onClick={() => setReview(null)}>
            {t("Cancel", "Cancelar")}
          </Button>
        </div>
      </Modal>
    ) : null;
  return {
    actions,
    banner,
    dialog,
    clearSwap,
    active: !!v.clipboard || !!swap,
  };
}
