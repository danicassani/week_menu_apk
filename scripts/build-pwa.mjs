import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
const root = path.resolve("dist");
async function walk(dir) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...(await walk(file)));
    else result.push(file);
  }
  return result;
}
const files = (await walk(root))
  .filter(
    (f) =>
      !["_headers", "_redirects", "sw.js"].includes(path.basename(f)) &&
      !f.endsWith(".map"),
  )
  .sort();
const worker = await readFile("src/sw.js", "utf8"),
  hash = createHash("sha256");
hash.update(worker);
for (const file of files) {
  hash.update(path.relative(root, file));
  hash.update(await readFile(file));
}
const version = hash.digest("hex").slice(0, 20),
  urls = files.map(
    (f) => "/" + path.relative(root, f).split(path.sep).join("/"),
  );
await writeFile(
  path.join(root, "sw.js"),
  `const CACHE_NAME=${JSON.stringify("week-menu-shell-" + version)};\nconst PUBLIC_ASSETS=${JSON.stringify(urls)};\n${worker}`,
);
console.log(`PWA: ${urls.length} public assets, shell version ${version}`);
