// Local release-test server: serves the built Pages files with public/_headers.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
const root = path.resolve("dist"),
  port = Number(process.env.PORT ?? 5174);
const rules = [];
for (const line of (await readFile(path.join(root, "_headers"), "utf8")).split(
  "\n",
)) {
  if (!line.trim() || line.trim().startsWith("#")) continue;
  if (!/^\s/.test(line)) rules.push({ pattern: line.trim(), headers: {} });
  else {
    const colon = line.indexOf(":");
    if (colon > 0)
      rules.at(-1).headers[line.slice(0, colon).trim()] = line
        .slice(colon + 1)
        .trim();
  }
}
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};
const server = createServer(async (req, res) => {
  try {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405);
      res.end();
      return;
    }
    const pathname = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    );
    let file = path.resolve(root, "." + pathname);
    if (!file.startsWith(root + path.sep) && file !== root) {
      res.writeHead(403);
      res.end();
      return;
    }
    if (path.basename(file).startsWith("_")) {
      res.writeHead(404);
      res.end();
      return;
    }
    try {
      if (!(await stat(file)).isFile()) file = path.join(root, "index.html");
    } catch {
      file = path.join(root, "index.html");
    }
    const headers = {
      "Content-Type": types[path.extname(file)] ?? "application/octet-stream",
    };
    for (const rule of rules)
      if (
        rule.pattern === pathname ||
        (rule.pattern.endsWith("*") &&
          pathname.startsWith(rule.pattern.slice(0, -1)))
      )
        Object.assign(headers, rule.headers);
    if (file === path.join(root, "index.html"))
      headers["Cache-Control"] = "no-store";
    res.writeHead(200, headers);
    res.end(req.method === "HEAD" ? undefined : await readFile(file));
  } catch {
    res.writeHead(500);
    res.end();
  }
});
server.listen(port, "127.0.0.1", () =>
  console.log(`Release test server: http://127.0.0.1:${port}`),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => server.close(() => process.exit(0)));
