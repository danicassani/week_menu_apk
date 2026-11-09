# Planning change history

Open Profile and activate **AT A GLANCE / DE UN VISTAZO** five times within five seconds. This works with touch, mouse and keyboard. Navigation, household changes and backgrounding reset the sequence. Every active household member can read the same history; the gesture is an access shortcut, not authorization. History is online-only and read-only.

The newest 50 summaries load first. Filter by author name/ID, action and action dates, load older pages, refresh, or expand an event to fetch its details. Times are stored by the server in UTC and displayed in the device timezone, identified in the panel. The displayed meal dates identify the planning week independently of the time when it was edited.

## What is recorded

Migration 27 captures canonical meal changes and planning inputs: dietary preferences/exclusions, accepted targets and budgets, daily budget overrides, catalogue changes, household vetoes and week start. It excludes health logs, shopping checks, ratings, themes, meal times, uncommitted previews and failed writes. Changes caused by a catalogue operation remain in that operation's event. Recipe/preference edits do not claim to have resized saved portions unless actual meal changes also appear.

The server retains the authenticated actor ID and name at the operation's start, server timestamp, action, translated summary text and before/after values for changed entities. Recipe snapshots are omitted from meal evidence; the affected meal's recipe names, portions, quantities and calorie values remain. Full household/profile snapshots are never stored. Imported correction evidence retains its original ID, timestamp and author ID; its name is the member's name at migration time because the original correction table did not save historical names. Other earlier edits cannot be reconstructed.

Trusted existing mutation entrypoints label nested writes. Row triggers collect only touched entities into one event per database transaction and retain earliest-before/latest-after values, suppressing net no-ops and technical revisions. Old clients still produce generic legacy-save events. Administrator writes have a system label rather than an invented member. Source labels describe the server entrypoint/declared UI action; they do not prove which physical button an account holder pressed.

The new `apply_meal_plans_with_history` RPC accepts household/member context, an operation UUID and an allowlisted action, plus the existing meal batch, revision and replacement flag. One-meal reviews require one slot; recalculation requires unchanged recipe/composition. A scoped receipt stores a SHA-256 request fingerprint, not another copy of the meal batch. Identical retries acknowledge without replay; UUID reuse with a different payload is rejected. Existing apply APIs remain available to older clients and still record actual changes.

`get_planning_history` returns at most 50 summary records, an opaque `(created_at,id)` cursor and the activation timestamp. `get_planning_history_event` fetches a retained event's details. Both verify active household context. Clients have no direct table privileges and cannot insert arbitrary actor names or summary text. Private recorder and purge routines have no authenticated execute grant; the privileged recorder is callable only by the restricted executor through trusted triggers, and the purge is administrator-only.

## Deployment and retention

1. Apply only pending migrations through **27**, after successful 1–26. No production SQL has been run by the implementation.
2. Enable Supabase Cron, then run [the retention setup](../supabase/operations/planning_history_retention.sql) as project administrator. It installs/replaces the single `planning-history-retention` job for 03:17 UTC daily. This operational script is separate from migrations so local PostgreSQL/PGlite does not require the Cron extension.
3. Verify the job is active and inspect its execution results using the queries in the script. Deploy the matching frontend. Missing migration 27 produces an actionable error; audited saves never silently fall back to an unaudited client path.

Queries immediately exclude events older than 90 days. Daily cleanup physically deletes expired history and operation receipts across all households; inactive households do not need to open the app. Retention applies to this new activity log; the pre-existing technical historical-correction audit/acknowledgements keep their original lifecycle. The preview simulator uses fictional session data and mirrors history/pagination/retries without calling Supabase.
