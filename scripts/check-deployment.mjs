// Read-only public release smoke check. No Google login or household data access.
import { createHash } from "node:crypto";
const input = process.argv[2];
if (!input) {
  console.error(
    "Usage: npm run check:deployment -- https://your-app.pages.dev",
  );
  process.exit(2);
}
const origin = new URL(input).origin;
if (
  !origin.startsWith("https://") &&
  !/^http:\/\/(localhost|127\.0\.0\.1)(:|$)/.test(origin)
)
  throw Error("Use HTTPS outside localhost.");
const results = [];
const fetched = new Map();
async function read(path, type) {
  const url = new URL(path, origin);
  if (url.origin !== origin || url.search || url.hash)
    throw Error("Only same-origin public assets are checked.");
  if (fetched.has(url.pathname)) return fetched.get(url.pathname);
  const response = await fetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(20000),
    headers: {
      "User-Agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    },
  });
  if (!response.ok) throw Error(`${path}: HTTP ${response.status}`);
  if (!response.headers.get("content-type")?.includes(type))
    throw Error(`${path}: unexpected content type`);
  const data = Buffer.from(await response.arrayBuffer());
  results.push({
    path: url.pathname,
    status: response.status,
    bytes: data.length,
    sha256: createHash("sha256").update(data).digest("hex"),
  });
  const result = { text: data.toString(), headers: response.headers };
  fetched.set(url.pathname, result);
  return result;
}
try {
  const root = await read("/", "text/html"),
    csp = root.headers.get("content-security-policy") ?? "";
  for (const directive of [
    "default-src 'self'",
    "script-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ])
    if (!csp.includes(directive))
      throw Error("Missing CSP directive: " + directive);
  if (/script-src[^;]*(unsafe-inline|unsafe-eval)/.test(csp))
    throw Error("Unsafe script CSP.");
  if (root.headers.get("x-content-type-options") !== "nosniff")
    throw Error("Missing nosniff.");
  if (root.headers.get("referrer-policy") !== "strict-origin-when-cross-origin")
    throw Error("Unexpected referrer policy.");
  if (!/no-store/.test(root.headers.get("cache-control") ?? ""))
    throw Error("App HTML must not have long-lived HTTP caching.");
  const manifest = await read(
      "/manifest.webmanifest",
      "application/manifest+json",
    ),
    m = JSON.parse(manifest.text);
  if (!/no-cache/.test(manifest.headers.get("cache-control") ?? ""))
    throw Error("Manifest must revalidate.");
  if (m.display !== "standalone" || m.start_url !== "/" || m.scope !== "/")
    throw Error("Unexpected installation scope.");
  for (const size of ["192x192", "512x512"])
    if (!m.icons?.some((i) => i.sizes === size))
      throw Error("Missing install icon " + size);
  for (const icon of m.icons) await read(icon.src, "image/png");
  const worker = await read("/sw.js", "javascript");
  if (!/no-cache/.test(worker.headers.get("cache-control") ?? ""))
    throw Error("Worker must revalidate.");
  const version = /const CACHE_NAME\s*=\s*"([^"]+)"/.exec(worker.text)?.[1];
  if (!version) throw Error("Missing versioned public worker.");
  const script = /<script[^>]+src="([^"]+)"/.exec(root.text)?.[1];
  if (!script) throw Error("Missing application entry.");
  const asset = await read(script, "javascript");
  if (!/immutable/.test(asset.headers.get("cache-control") ?? ""))
    throw Error("Hashed assets must be immutable.");
  const declared = /const PUBLIC_ASSETS\s*=\s*(\[[^\n]+\]);/.exec(
    worker.text,
  )?.[1];
  if (!declared) throw Error("Missing public-shell asset manifest.");
  const assets = JSON.parse(declared);
  if (
    !Array.isArray(assets) ||
    assets.length < 1 ||
    assets.length > 200 ||
    new Set(assets).size !== assets.length ||
    !assets.includes("/index.html") ||
    !assets.includes(script)
  )
    throw Error("Invalid public-shell asset manifest.");
  const types = {
    ".js": "javascript",
    ".css": "text/css",
    ".woff2": "font/woff2",
    ".svg": "image/svg+xml",
    ".txt": "text/plain",
    ".png": "image/png",
    ".webmanifest": "application/manifest+json",
  };
  for (const path of assets) {
    if (
      typeof path !== "string" ||
      !path.startsWith("/") ||
      path.startsWith("//")
    )
      throw Error("Invalid public-shell asset URL.");
    // Pages canonicalizes /index.html to /. The root response was already
    // checked; following that redirect as a cached navigation caused ERR_FAILED.
    if (path === "/index.html") continue;
    const ext = /\.[^.\/?#]+$/.exec(path)?.[0],
      type = types[ext];
    if (!type) throw Error("Unexpected public-shell asset type: " + path);
    const checked = await read(path, type);
    if (
      path.startsWith("/assets/") &&
      !/immutable/.test(checked.headers.get("cache-control") ?? "")
    )
      throw Error("Hashed assets must be immutable: " + path);
  }
  console.log(
    JSON.stringify(
      {
        origin,
        checked_at: new Date().toISOString(),
        result: "passed",
        shell_version: version,
        checks: results,
        declared_public_assets: assets.length,
        index_html_checked_via_root: assets.includes("/index.html"),
        limits:
          "Public files/headers only. OAuth, RLS, Realtime, database migrations and physical-device installation are not verified.",
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    JSON.stringify(
      { origin, result: "failed", reason: error.message, checks: results },
      null,
      2,
    ),
  );
  process.exitCode = 1;
}
