# Personal meal intake times

Planned breakfast, lunch and dinner enter the dashboard's known intake at 09:00, 14:00 and 21:00 respectively, including the exact boundary. Each member can change these times under Profile → Settings. Preferences persist across devices. The viewed member's saved IANA timezone determines the local meal times; bootstrap refreshes that zone from their device.

The dashboard advances its clock locally at minute boundaries and on foreground return, without additional network polling or writes. Manual food logs count immediately. Planning completeness still considers all three meals, even before their scheduled times. Quantities, budgets, shopping, day closure and historical records are unchanged. Editing a schedule immediately changes which planned meals count today; this is assumed intake, not confirmation that a meal was eaten.

Past meals count after their scheduled instant; future meals do not. During a repeated autumn hour, the first occurrence counts, so intake never reverses when the clock goes back. A nonexistent spring time shifts forward by the timezone gap. Independent times are allowed for shift workers.

Apply migration 26 after successful migrations through 25, as project administrator, before deploying this client. It adds a member column, scoped save RPC and snapshot field. Existing members receive the defaults. Older snapshots fall back to defaults; attempts to save against a server missing the new RPC explain that migration 26 is needed. Only the signed-in member can save their own schedule. No hosted migration or deployment is performed by this change.
