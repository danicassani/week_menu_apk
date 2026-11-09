# Dashboard meal budgets and daily margin

Personal meal budgets appear in a separate block immediately below the complete **Your daily picture** target card. A single four-column row shows Breakfast, Lunch, Dinner and Margin, each with its number directly below. The information popover and budget-edit action live in the daily-card heading so they do not wrap or widen this row. The previous nested budgets panel is removed.

The margin is the fourth column, to the right of the three meal budgets and equals the displayed accepted daily target minus the rounded sum of breakfast, lunch and dinner budgets. Today's personal overrides take precedence over defaults. It follows the viewed member, including when another household member is selected. It measures unallocated budget, not calories remaining after actual intake; logging outside food does not change the allocation margin.

Nonnegative margins, including zero, are green. Exceeded allocations show a negative red margin. Both light and dark modes have explicit contrasting colours. The numeric sign and the **Margin** label communicate the state beyond colour alone. Without an accepted target, the amount is shown as a dash. Existing calorie-warning precision is retained, and stored data/calculations are unchanged.

No migration or environment change is required. Merge and deploy the frontend. Unit regressions cover both languages, equality, positive/negative margins, day/member override isolation and another member's view. Browser coverage checks separate-card placement, aligned labels/numbers in four columns and overflow at 320/390/1280 pixels, light/dark colours and a live budget change that turns the margin red.
