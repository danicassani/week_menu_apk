import type { Names } from "./planning";
export interface RecipeSource {
  url: string;
  title: string;
  publisher: string;
  accessed_on: string;
  original_servings: string;
  reference_caption?: Names;
  rating?: { value: number; count: number; scale: number };
  quantity_notes: Names;
  changes?: Names;
  original_quantities: {
    ingredient_id: string;
    quantity: string;
    normalized_g: number;
    estimated: boolean;
  }[];
  additional_urls?: string[];
}
const names = (n: unknown): n is Names =>
  !!n &&
  typeof n === "object" &&
  typeof (n as Names).en === "string" &&
  typeof (n as Names).es === "string";
export function recipeSource(value: unknown): RecipeSource | null {
  if (!value || typeof value !== "object") return null;
  const s = value as RecipeSource;
  try {
    const url = new URL(s.url);
    if (url.protocol !== "https:" || url.username || url.password) return null;
  } catch {
    return null;
  }
  if (
    typeof s.title !== "string" ||
    typeof s.publisher !== "string" ||
    typeof s.original_servings !== "string" ||
    !names(s.quantity_notes)
  )
    return null;
  return {
    ...s,
    changes: names(s.changes) ? s.changes : undefined,
    reference_caption: names(s.reference_caption)
      ? s.reference_caption
      : undefined,
    rating:
      s.rating &&
      Number.isFinite(s.rating.value) &&
      s.rating.value >= 0 &&
      s.rating.value <= 5 &&
      s.rating.scale === 5 &&
      Number.isInteger(s.rating.count) &&
      s.rating.count > 0
        ? s.rating
        : undefined,
    original_quantities: Array.isArray(s.original_quantities)
      ? s.original_quantities.filter(
          (q) =>
            q &&
            typeof q.ingredient_id === "string" &&
            typeof q.quantity === "string" &&
            Number.isFinite(q.normalized_g) &&
            q.normalized_g > 0 &&
            typeof q.estimated === "boolean",
        )
      : [],
  };
}
