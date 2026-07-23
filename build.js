/* Build a single self-contained HTML from the modular source.
 * Produces:
 *   dist/shogun.html   — full standalone document (open directly / host anywhere)
 *   dist/artifact.html — body-only content (inline <style>+<script>) for the Artifact tool
 * Usage: node build.js
 */
const fs = require("fs");
const path = require("path");
const ROOT = __dirname;

const css = fs.readFileSync(path.join(ROOT, "css/style.css"), "utf8");

// Embed the illustrated map as a data: URI so the single-file build and the
// Artifact stay fully self-contained (no external requests; works offline).
const mapB64 = fs.readFileSync(path.join(ROOT, "assets/nippon-map.jpg")).toString("base64");
const mapInit = `window.__NIPPON_MAP__ = "data:image/jpeg;base64,${mapB64}";`;

const scripts = mapInit + "\n\n" + ["data", "state", "engine", "battle", "espionage", "diplomacy", "ai", "modeb", "ui", "audio", "tutorial", "main"]
  .map(n => fs.readFileSync(path.join(ROOT, "js", n + ".js"), "utf8")).join("\n\n");

const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

// Extract the inner <body> markup (drop the <script src> tags and doctype/head).
let body = html.split("<body>")[1].split("</body>")[0];
body = body.replace(/<script src="[^"]*"><\/script>\s*/g, "").trim();

const styleTag = `<style>\n${css}\n</style>`;
const scriptTag = `<script>\n${scripts}\n</script>`;

fs.mkdirSync(path.join(ROOT, "dist"), { recursive: true });

// Standalone document
const standalone = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Shōgun: Rise of the Clans</title>
${styleTag}
</head>
<body>
${body}
${scriptTag}
</body>
</html>
`;
fs.writeFileSync(path.join(ROOT, "dist/shogun.html"), standalone);

// Artifact content (no doctype/html/head/body — the host wraps it)
const artifact = `${styleTag}\n${body}\n${scriptTag}\n`;
fs.writeFileSync(path.join(ROOT, "dist/artifact.html"), artifact);

console.log("Built dist/shogun.html (%d KB) and dist/artifact.html (%d KB)",
  Math.round(standalone.length / 1024), Math.round(artifact.length / 1024));
