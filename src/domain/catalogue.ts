import type { Ingredient, PlannedRecipe, Names } from "./planning";
export type CatalogueKind = "recipe" | "ingredient";
export interface CatalogueQuery {
  kind: CatalogueKind;
  query: string;
  archived: boolean;
  cursor?: string | null;
}
export interface CatalogueSummary {
  banned?: boolean;
  veto_revision?: number;
  id: string;
  name: Names;
  emoji?: string;
  revision: number;
  archived: boolean;
  meal_types?: string[];
  nutrition_per_100g?: { energy_kcal: number | null };
  created_at?: string | null;
}
export interface CataloguePage {
  items: CatalogueSummary[];
  next_cursor: string | null;
}
export interface CatalogueDetail {
  item: Ingredient | PlannedRecipe;
  ingredients: Ingredient[];
}
