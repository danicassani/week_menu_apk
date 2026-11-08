# Simple recipe editor

The recipe form asks for one recipe name, ingredients and instructions. It no longer asks for a component name or a main/side/dessert classification. New recipes start with one dish. An explicit **Add optional dessert** action creates a separate ingredient/instruction section; **Remove dessert** removes that section. Optional desserts remain excluded by default and can still be selected per person during planning.

Existing main and side components appear together under **Dish**. Their ingredient quantities, units and component identifiers are retained internally so existing meal references continue to work. Their instructions appear in one field, in the original component order. Editing that field stores the combined instructions on the first component and clears the other instruction arrays in that group; it retains ingredient/component associations and both languages. Existing dessert components are grouped separately. Opening or canceling the editor does not rewrite content.

The recipe's existing reference servings, calculated calories, available meal slots, translations, revision conflict checks and explicit save behavior are retained. New dishes use the recipe name internally, so users do not type the same name twice. Existing meals retain their saved recipe snapshots until explicitly replaced. This is a frontend change; no migration or environment-variable change is required. Merge and deploy the frontend to make the new form available.

Browser regressions cover creating a recipe on a phone in English/Spanish, combining a legacy main/side recipe without changing ingredient references or saved meals, editing combined instructions, and adding/removing an optional dessert. Build and formatting checks include the complete form.
