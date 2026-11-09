# Calorie warning precision

Calorie displays use whole kcal, but warning comparisons previously used the unrounded values. For example, a daily target of 1964.7 appeared as 1965 while budgets totaling 1965 triggered an excess warning. A 600.2 kcal meal appeared as 600 yet was yellow against a 600 kcal budget. The comparison already used strict `>`; hidden decimals caused the apparent equality bug.

Warning decisions now compare `Math.round(actual) > Math.round(limit)` using a shared helper. Equality at the displayed precision is allowed. Target-review remaining/excess amounts use the same rounded totals, and read-only meal budgets use whole kcal consistently. This does not round stored nutrition, calorie targets, ingredient quantities or values used to scale portions.

| Actual kcal | Limit kcal | Display     | Warning |
| ----------- | ---------- | ----------- | ------- |
| 600         | 600        | 600 / 600   | No      |
| 600.2       | 600        | 600 / 600   | No      |
| 600.499     | 600        | 600 / 600   | No      |
| 600.5       | 600        | 601 / 600   | Yes     |
| 1965        | 1964.7     | 1965 / 1965 | No      |
| 1965        | 1964.499   | 1965 / 1964 | Yes     |

The rule applies to target review, dashboard meal-budget warnings, suggested-menu highlights and client-generated portion warnings, including explicit historical corrections. Saved-menu review badges recompute the calorie condition so previously stored `over_budget` flags cannot cause a false warning after deployment. Other warnings, such as substitutions or diet conflicts, are preserved.

Apply [migration 25](../supabase/migrations/202611090025_calorie_warning_precision.sql) after successful migrations through 24 to align Supabase's current and historical portion validators. It changes only their warning conditions, in one guarded transaction, preserving ownership, grants and search paths. It does not rewrite saved meals, past records or targets. Merge and deploy the frontend for visible comparison fixes; the frontend also handles calorie-warning flags produced by earlier server versions.

Regression tests cover equality, hidden fractional excesses, half-kcal boundaries, floating-point noise, English/Spanish target review and dashboard messages, and neutral versus yellow suggested portions. Database tests exercise both server validators and verify that the returned energy retains its decimal precision and stored targets/meals remain unchanged. The existing browser calorie-warning test verifies that genuinely excessive calories still open the explanation and return focus correctly.
