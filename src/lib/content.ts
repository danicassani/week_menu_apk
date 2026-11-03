import recipeData from "../../content/starter/recipes.json";
import ingredientData from "../../content/starter/ingredients.json";
export const recipes = recipeData.recipes;
export type Recipe = (typeof recipes)[number];
export const ingredients = ingredientData.ingredients;
