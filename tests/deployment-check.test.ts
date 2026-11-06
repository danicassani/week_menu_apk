import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { expect, it } from "vitest";
async function check(missing = false) {
  const assets = [
    "/index.html",
    "/assets/app.js",
    "/assets/secondary.js",
    "/assets/style.css",
    "/assets/font.woff2",
    "/fonts-OFL.txt",
    "/manifest.webmanifest",
    "/icon-192.png",
    "/icon-512.png",
  ];
  const requests: string[] = [];
  const server = createServer((req, res) => {
    const path = req.url!;
    requests.push(path);
    const types: Record<string, string> = {
      "/": "text/html",
      "/sw.js": "application/javascript",
      "/manifest.webmanifest": "application/manifest+json",
    };
    const type =
      types[path] ??
      (path.endsWith(".js")
        ? "application/javascript"
        : path.endsWith(".css")
          ? "text/css"
          : path.endsWith(".woff2")
            ? "font/woff2"
            : path.endsWith(".txt")
              ? "text/plain"
              : "image/png");
    res.setHeader("Content-Type", type);
    res.setHeader(
      "Cache-Control",
      path.startsWith("/assets/")
        ? "public,max-age=31536000,immutable"
        : path === "/"
          ? "no-store"
          : "no-cache",
    );
    if (missing && path === "/assets/secondary.js") {
      res.writeHead(404);
      res.end("missing");
      return;
    }
    if (path === "/") {
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'self';script-src 'self';frame-ancestors 'none';base-uri 'self';form-action 'self'",
      );
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
      res.end('<script src="/assets/app.js"></script>');
    } else if (path === "/manifest.webmanifest")
      res.end(
        JSON.stringify({
          display: "standalone",
          start_url: "/",
          scope: "/",
          icons: [
            { src: "/icon-192.png", sizes: "192x192" },
            { src: "/icon-512.png", sizes: "512x512" },
          ],
        }),
      );
    else if (path === "/sw.js")
      res.end(
        `const CACHE_NAME="test";\nconst PUBLIC_ASSETS=${JSON.stringify(assets)};\n`,
      );
    else if (path === "/index.html") {
      res.writeHead(302, { location: "/" });
      res.end();
    } else res.end("fixture");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  try {
    const child = spawn(
      process.execPath,
      ["scripts/check-deployment.mjs", `http://127.0.0.1:${port}`],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let output = "";
    child.stdout.on("data", (data) => (output += data));
    child.stderr.on("data", (data) => (output += data));
    const code = await new Promise<number | null>((resolve, reject) => {
      child.on("error", reject);
      child.on("close", resolve);
    });
    return { code, report: JSON.parse(output), requests };
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
}
it("checks secondary scripts, fonts and CSS while accepting canonical index redirects", async () => {
  const result = await check();
  expect(result.code).toBe(0);
  expect(result.report.result).toBe("passed");
  expect(result.requests).toContain("/assets/secondary.js");
  expect(result.requests).toContain("/assets/font.woff2");
  expect(result.requests).toContain("/assets/style.css");
  expect(result.requests).not.toContain("/index.html");
  expect(result.report.index_html_checked_via_root).toBe(true);
}, 15000);
it("fails a deployed shell when a secondary cached chunk is missing", async () => {
  const result = await check(true);
  expect(result.code).toBe(1);
  expect(result.report.result).toBe("failed");
  expect(result.report.reason).toContain("/assets/secondary.js: HTTP 404");
}, 15000);
