# Version 2 — emoji illustrations and deferred photo research

Status: the revised version-two draft uses native emojis instead of actual pictures. Photo uploads, thumbnails and provider selection are deferred. The photo research below is retained for a future version; it does not authorize provisioning or implementation. Public pricing was checked on 4 November 2026 and must be rechecked if photos are revisited. Allowances belong to provider accounts/projects/organizations, not to every household independently.

## Current direction: native emojis

Use a suitable food emoji for each recipe/ingredient, rendered with the device's existing fonts. Store only a small text value alongside the item or its household-private override. A proposed curated picker lets household editors change it, with starter defaults and a generic food/plate fallback. Full names remain visible and accessible; the emoji is decorative rather than a nutrition or dietary claim.

Each person can also choose their own emoji avatar. Reuse the same native-text approach and picker infrastructure, with a broader selection suitable for avatars. Avatar changes follow self-edit profile permissions, and household views show names alongside avatars. This addition requires no photo storage or image downloads.

This avoids photo storage, image transfers, compression pipelines and an additional media service. Do not introduce a downloaded emoji image/font pack. Native appearance varies across platforms, so support a neutral fallback for unsupported glyphs. Include the text value in existing offline views. See the [version-two specification](specification.md) for the proposed permissions, validation and accessibility details.

The remaining sections are deferred photo research, not active version-two scope. Household photo counts, compression sizes and provider recommendations below are unapproved candidates for a later review.

## Confirmed free-tier budget

The user wants to remain free for now. No overage charges or paid products have been authorized. R2 remains an option for its included usage, but it is usage-billed beyond those allowances; [Cloudflare budget alerts](https://developers.cloudflare.com/billing/manage/budget-alerts/) notify rather than enforce a spending cap.

If photo uploads are revisited under a strict zero-charge budget, a candidate is Supabase Free with tightly bounded private uploads, while starter images stay on static hosting. [Supabase cost control](https://supabase.com/docs/guides/platform/cost-control) states that Free users are not charged, but quota excess can restrict service. This is a capacity/availability tradeoff, not a larger or unmetered photo allowance. No photo provider is being selected for version two.

App-level media quota refusal should preserve text workflows. A provider-wide restriction can affect the whole app, however; application upload limits cannot guarantee unlimited database/API availability. Use global storage and traffic monitoring, headroom and a reviewed admission policy as usage grows.

## Deferred photo requirements and proposed processing

The earlier photo discussion specified small/rescaled uploads for newly created household recipes and ingredients, excluding starter replacements. That entire upload feature is now deferred alongside thumbnails. The earlier single-file approach and proposed limits below are retained only as future research. One photo per eligible item was the proposed initial limit. Private household access and a separately licensed public starter-photo pack would need review before any future implementation.

Suggested starting bounds, pending approval:

- Accept common static raster photo formats; validate actual bytes and dimensions. Support for iPhone HEIC conversion requires a deliberate compatibility decision and tested processing path; do not silently upload unsupported originals.
- Resize before transfer to at most 1,200 px on the longest side, preserving aspect ratio and avoiding upscaling. Compress toward a maximum 200 KiB display image, lowering dimensions/quality when necessary.
- Prefer a broadly supported compressed format such as WebP, with a defined fallback where encoding is unavailable.
- Do not retain the large camera original. Strip EXIF/GPS and other unnecessary metadata. Enforce byte, dimension, static-format and decoded-content restrictions on the server too; browser processing is not an authorization or validation boundary.
- Reject a file that cannot meet the limits cleanly, retain the text draft and explain how to choose another image. Do not upload a larger original silently.
- Preview the result and upload only on explicit save/confirmation. Lazy-load images only when visible and reuse the same compressed file across views. Displaying it at a smaller CSS size does not reduce downloaded bytes; track bandwidth as well as stored bytes.

Suggested initial allowance: 100 uploaded photos per household, shared by recipes and ingredients. At the proposed 200 KiB maximum per image, that is about 19.5 MiB per household, excluding object/metadata overhead. It is a proposed quota, not a provider guarantee or an unlimited-household capacity claim.

## Provider comparison

| Option                           | Current relevant allowance/terms                                                                                                                                                                       | Assessment                                                                                                                                                |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cloudflare R2 Standard           | 10 GB-month storage, 1 million Class A and 10 million Class B operations monthly, with no Internet-egress charge. Usage beyond included allowances is billed. An R2 subscription/checkout is required. | Keeps photo traffic off Supabase, but is not a hard zero-charge plan. Requires billing acceptance, private-media authorization and usage controls.        |
| Supabase Storage Free            | 1 GB file storage; 5 GB cached and 5 GB uncached egress are separate allowances. Image transformations are not included in Free.                                                                       | Recommended strict-free starting option pending provider selection. Simple auth/RLS integration, but photos share limited Supabase capacity with the app. |
| Cloudflare Images hosted storage | Hosted image storage/delivery is paid. Free remote-image transformations have a separate limited allowance.                                                                                            | Convenient processing, but hosted uploads should not be described as a free substitute for R2. Not the default recommendation for this free-tier goal.    |
| Static starter photo assets      | Curated files can be delivered with the existing frontend build. Not a runtime user-upload store.                                                                                                      | Appropriate for a modest licensed starter-photo pack. Keep upload credentials and household photos out of the public repository/build.                    |

Sources: [R2 pricing](https://developers.cloudflare.com/r2/pricing/), [R2 subscription setup](https://developers.cloudflare.com/r2/get-started/), [Supabase pricing](https://supabase.com/pricing), [Supabase storage egress](https://supabase.com/docs/guides/storage/serving/bandwidth), [Cloudflare Images pricing](https://developers.cloudflare.com/images/pricing/).

## Candidate R2 architecture if its billing model is accepted

Keep Google sign-in, membership and small media metadata in Supabase. Store compressed photo objects in a private R2 Standard bucket. Use an authenticated server/Worker path to authorize uploads and reads against live household membership and ownership of the parent recipe/ingredient. Send image bytes between Cloudflare and the browser, not through Supabase Storage or database rows.

Use server-generated object keys and versioned references scoped to the authorized household. Object paths are identifiers, not access control. Do not expose a public bucket, rely on CORS for privacy, or allow a supplied household ID to grant access. Check authorization before any shared edge-cache lookup. Signed links, if used, are short-lived bearer capabilities and need an explicit revocation/expiry policy; removal cannot erase bytes already downloaded to a disconnected device.

Client resizing reduces upload traffic, but server validation and any decode/re-encoding still need a tested implementation. Workers Free currently allows 100,000 requests per day and 10 ms CPU per invocation. Do not assume that arbitrary server-side image conversion fits that CPU budget. Benchmark the bounded processing path; if it needs a paid processor, return to the user with the concrete cost/design before enabling it. R2's storage allowance does not include every adjacent processing product.

Source: [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) and [Workers resource limits](https://developers.cloudflare.com/workers/platform/limits/).

## Usage control and lifecycle

Enforce per-household stored-byte/image quotas and rate limits in the authorized backend, with reservations/atomic accounting so simultaneous requests cannot exceed a quota. Count staged uploads and orphaned/replaced versions until deletion actually succeeds. Expire abandoned staging objects; finalize a reference only after validation; handle failed cleanup without losing accounting.

Set global storage/request thresholds and operational alerts, leaving headroom below the free allowance. These reduce exposure; an application quota or alert is not an account-wide provider billing cap, and read traffic and other account workloads still count. Limit new uploads when the approved global budget is reached while keeping existing text planning available.

Photo replacement, deletion, archival and source attribution must be defined before implementation. Do not permanently delete an image still referenced by another live object or by an approved historical-image policy. Do not silently turn a private household upload into a public starter photo.

With any provider, text content remains usable without a photo. Image generation, pantry tracking and preparation-time filters are not introduced by this storage proposal.
