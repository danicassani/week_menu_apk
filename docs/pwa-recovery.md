# PWA cache recovery

## Confirmed Cloudflare redirect failure

The first recovery patch (PR #5) did not resolve the incident. Follow-up public checks confirmed that Cloudflare Pages returns **HTTP 308 from `/index.html` to `/`**. `Cache.addAll` followed that redirect and stored an HTML `Response` with `redirected: true`. Chrome rejects that response when the worker supplies it to a navigation whose redirect mode is `manual`, producing `net::ERR_FAILED`.

The local production server previously returned `/index.html` directly, so it missed the hosting behavior. After adding the same 308 canonical redirect to the test server, the old worker reproduced **the exact `page.reload: net::ERR_FAILED` failure**. This is a demonstrated defect, rather than an inference that stored bytes were corrupt.

The follow-up fix requests canonical `/` directly for HTML installation and repair, retaining `/index.html` only as an internal cache key. It normalizes redirected legacy HTML responses before serving them and classifies such old shells as broken, allowing a replacement worker to activate without an unreachable update button. Regression tests include the actual old-worker failure, upgrading that installed worker and retaining pending offline checks, repeated navigation/OAuth-error returns, and offline reloads. All production/mobile test servers now emulate Cloudflare's redirect.

No database migration, authentication change or site-data deletion is required. Existing blocked clients need to receive the new worker; Chrome's worker update or a developer-tools update can do that without deleting sessions or IndexedDB.

## Additional storage recovery protections


The initial Incognito/site-reset comparison established profile-local state and prompted PR #5. The canonical-redirect reproduction above subsequently identified the hosting-specific navigation defect that the original local server did not exercise.

Review found a concrete failure path: an exception opening or reading Cache Storage rejected the service worker's navigation promise without trying the network. A second path could serve cached HTML whose required script had disappeared. Browser storage eviction, denial, quota pressure and interrupted updates therefore need recovery paths.

The worker now:

- Treats the public cache as optional. Cache read/write failures do not suppress a usable network response.
- Checks that installed HTML and its referenced entry assets exist before using that shell.
- Rebuilds missing public assets on connection, publishing HTML last. If the hosted HTML belongs to a different build, it requests the matching new worker instead of mixing releases.
- Activates a successfully installed replacement automatically when its predecessor's public shell is incomplete. A healthy installed version still keeps the normal user-reviewed update flow. No page is forcibly reloaded during repair.
- Shows a bilingual recovery document when neither the shell nor the network is usable, instead of allowing a rejected navigation to become Chrome's generic failure page.
- Allows online use when browser storage is denied and tells the app that offline loading is unavailable. Worker-update requests bypass the HTTP cache.

Repair touches only `week-menu-shell-*` public Cache Storage. It never deletes IndexedDB, authentication storage, household data or pending shopping operations. Explicit sign-out retains its existing sync/discard requirements. No remote error logging or health-data telemetry was added.

Production-browser regression checks cover cache API exceptions, missing HTML, missing entry scripts, offline recovery, preserved shopping intents, cache repair after reconnect, automatic replacement of an incomplete predecessor, and the existing reviewed-update tests. Mobile Chromium/WebKit workflows check normal loading, queued changes, reconnect and sign-out.

This reduces preventable failures; it cannot guarantee that browsers, storage and networks never fail. An already installed older worker must receive the new worker before it has these protections. If a device remains stuck after reconnecting and closing/reopening the app, it needs diagnosis rather than routinely recommending deletion of all site data. Do not clear device data if shopping changes are waiting to synchronize.

Rollout: review and merge the recovery PR, then allow the existing Cloudflare Pages deployment to publish it. No SQL migration or Supabase/OAuth configuration changes are required. The local test build is not production deployment.
