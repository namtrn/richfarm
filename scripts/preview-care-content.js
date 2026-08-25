#!/usr/bin/env node

// Local preview server for plant care content.
// Renders content/plants/<species>/{vi,en}.md as HTML using markdown-it,
// with a small CSS so the layout looks close to the app. Nothing is written
// to the database or sync pipeline.
//
// Usage: node scripts/preview-care-content.js [--port 4173]

const http = require("http");
const fs = require("fs");
const path = require("path");
const MarkdownIt = require("markdown-it");

const root = path.resolve(__dirname, "..");
const plantsDir = path.join(root, "content", "plants");

const portArg = process.argv.indexOf("--port");
const PORT = portArg !== -1 ? Number(process.argv[portArg + 1]) : 4173;

const md = new MarkdownIt({
  html: false,
  linkify: false,
  typographer: false,
});

// Keep the internal app links visible as chips instead of clickable links.
md.renderer.rules.link_open = (tokens, idx, options, _env, self) => {
  const token = tokens[idx];
  const href = token.attrGet("href") || "";
  if (href.startsWith("richfarm://")) {
    token.attrSet("class", "app-link");
    token.attrSet("title", "Liên kết nội bộ trong app (không mở được ở preview này)");
    token.attrSet("href", "#");
  }
  return self.renderToken(tokens, idx, options);
};

const CSS = `
:root { color-scheme: light; }
* { box-sizing: border-box; }
body { margin: 0; font-family: -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; background: #f6f7f9; color: #1f2430; }
header { background: #fff; border-bottom: 1px solid #e3e6ea; padding: 14px 28px; display: flex; align-items: baseline; gap: 16px; position: sticky; top: 0; }
header h1 { font-size: 17px; margin: 0; }
header .crumb { color: #6b7280; font-size: 13px; }
header .crumb a { color: #2f6fed; text-decoration: none; }
main { max-width: 820px; margin: 28px auto; padding: 0 20px 60px; }
.card { background: #fff; border: 1px solid #e3e6ea; border-radius: 12px; padding: 28px 36px; box-shadow: 0 1px 3px rgba(16,24,40,.05); }
h2 { font-size: 20px; margin: 28px 0 10px; padding-bottom: 8px; border-bottom: 2px solid #eef0f3; }
h2:first-child { margin-top: 0; }
p { line-height: 1.7; margin: 10px 0; }
ul { line-height: 1.7; padding-left: 22px; }
strong { font-weight: 600; }
code { background: #eef1f5; border-radius: 4px; padding: 1px 5px; font-size: 0.9em; }
.app-link { display: inline-block; background: #eef4ff; color: #2f6fed; border: 1px solid #d3e2ff; border-radius: 999px; padding: 0 10px; font-size: 0.85em; margin: 0 2px; text-decoration: none; cursor: default; }
.index { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 14px; }
.plant-card { background: #fff; border: 1px solid #e3e6ea; border-radius: 12px; padding: 18px 22px; box-shadow: 0 1px 3px rgba(16,24,40,.05); cursor: pointer; transition: border-color .15s, box-shadow .15s; }
.plant-card:hover { border-color: #2f6fed; box-shadow: 0 3px 10px rgba(47,111,237,.12); }
.plant-card h2 { margin: 0 0 8px; font-size: 17px; border: none; padding: 0; }
.plant-card .locs a { color: #2f6fed; text-decoration: none; font-size: 14px; margin-right: 14px; }
.plant-card .meta { color: #8a919c; font-size: 12.5px; margin-top: 6px; }
.lang-tabs { display: flex; gap: 8px; margin-bottom: 16px; }
.lang-tabs a { color: #2f6fed; text-decoration: none; border: 1px solid #d3e2ff; border-radius: 999px; padding: 4px 14px; font-size: 13.5px; background: #f4f8ff; }
.lang-tabs a.active { background: #2f6fed; color: #fff; border-color: #2f6fed; }
.badge { display: inline-block; font-size: 12px; border-radius: 999px; padding: 1px 9px; background: #f1f3f5; color: #555c66; margin-left: 8px; }
.badge.vi { background: #e8f7ee; color: #1a7f4e; }
.badge.en { background: #eef4ff; color: #2f6fed; }

/* Popover / modal */
.overlay { position: fixed; inset: 0; background: rgba(15,20,30,.45); display: none; align-items: flex-start; justify-content: center; padding: 5vh 16px; z-index: 100; overflow-y: auto; }
.overlay.open { display: flex; }
.popover { background: #fff; border-radius: 14px; box-shadow: 0 12px 40px rgba(16,24,40,.28); width: 100%; max-width: 780px; margin: auto 0; max-height: 88vh; display: flex; flex-direction: column; }
.popover-head { display: flex; align-items: center; gap: 12px; padding: 14px 22px; border-bottom: 1px solid #eef0f3; position: sticky; top: 0; background: #fff; border-radius: 14px 14px 0 0; }
.popover-head h2 { margin: 0; font-size: 17px; border: none; padding: 0; }
.popover-head .spacer { flex: 1; }
.popover-close { border: 1px solid #e3e6ea; background: #fff; border-radius: 999px; width: 30px; height: 30px; font-size: 16px; line-height: 1; cursor: pointer; color: #555c66; }
.popover-close:hover { background: #f1f3f5; }
.popover-body { padding: 18px 28px 28px; overflow-y: auto; }
.popover-body .lang-tabs { margin: 0 0 14px; }
`;

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const INDEX_JS = `
function openPopover(dir, loc) {
  var ov = document.getElementById("ov");
  var body = document.getElementById("pop-body");
  var title = document.getElementById("pop-title");
  var tabs = document.getElementById("pop-tabs");
  ov.classList.add("open");
  body.innerHTML = '<p style="color:#8a919c">Đang tải…</p>';
  title.textContent = dir;
  function load(l) {
    body.innerHTML = '<p style="color:#8a919c">Đang tải…</p>';
    fetch("/api/article?dir=" + encodeURIComponent(dir) + "&loc=" + l)
      .then(function (r) { return r.text(); })
      .then(function (html) { body.innerHTML = html; });
  }
  tabs.innerHTML = "";
  [["vi", "Tiếng Việt"], ["en", "English"]].forEach(function (pair) {
    var a = document.createElement("a");
    a.href = "#";
    a.textContent = pair[1];
    if (pair[0] === loc) a.classList.add("active");
    a.onclick = function (e) { e.preventDefault(); loc = pair[0]; tabs.querySelectorAll("a").forEach(function (x) { x.classList.remove("active"); }); a.classList.add("active"); load(loc); };
    tabs.appendChild(a);
  });
  load(loc);
}
function closePopover() { document.getElementById("ov").classList.remove("open"); }
document.addEventListener("keydown", function (e) { if (e.key === "Escape") closePopover(); });
document.getElementById("ov").addEventListener("click", function (e) { if (e.target.id === "ov") closePopover(); });
`;

function listPlants() {
  const out = [];
  for (const dir of fs.readdirSync(plantsDir).sort()) {
    const full = path.join(plantsDir, dir);
    if (!fs.statSync(full).isDirectory()) continue;
    const files = [];
    for (const loc of ["vi", "en"]) {
      const f = path.join(full, `${loc}.md`);
      if (fs.existsSync(f)) files.push(loc);
    }
    if (files.length) out.push({ dir, files });
  }
  return out;
}

function renderIndex() {
  const plants = listPlants();
  const cards = plants
    .map((p) => {
      const locs = p.files
        .map((loc) => `<a href="/${esc(p.dir)}/${loc}">${loc === "vi" ? "Tiếng Việt" : "English"}</a>`)
        .join("");
      const data = `onclick="openPopover('${esc(p.dir)}','${p.files[0]}')"`;
      return `<div class="plant-card" ${data}><h2>${esc(p.dir)}</h2><div class="locs">${locs}</div><div class="meta">${p.files.length} locale — bấm để xem nhanh</div></div>`;
    })
    .join("");
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Preview Care Content</title><style>${CSS}</style></head><body>
  <header><h1>Preview Care Content</h1><span class="crumb">content/plants — chỉ xem, không ghi DB</span></header>
  <main><div class="index">${cards}</div></main>
  <div class="overlay" id="ov">
    <div class="popover" role="dialog" aria-modal="true">
      <div class="popover-head"><h2 id="pop-title"></h2><div id="pop-tabs"></div><span class="spacer"></span><button class="popover-close" onclick="closePopover()" title="Đóng (Esc)">×</button></div>
      <div class="popover-body" id="pop-body"></div>
    </div>
  </div>
  <script>${INDEX_JS}</script>
  </body></html>`;
}

function renderArticle(dir, loc) {
  const f = path.join(plantsDir, dir, `${loc}.md`);
  if (!fs.existsSync(f)) return null;
  const src = fs.readFileSync(f, "utf8");
  const html = md.render(src);
  const words = src.trim().split(/\s+/).length;
  return `<div class="badge ${loc}">${loc === "vi" ? "Tiếng Việt" : "English"}</div><span class="badge">${words} từ</span>${html}`;
}

function renderPlant(dir, loc) {
  const article = renderArticle(dir, loc);
  if (!article) return null;
  const other = loc === "vi" ? "en" : "vi";
  const otherLabel = loc === "vi" ? "English" : "Tiếng Việt";
  const otherExists = fs.existsSync(path.join(plantsDir, dir, `${other}.md`));
  const tabs = `<div class="lang-tabs">
    <a href="/${esc(dir)}/vi" class="${loc === "vi" ? "active" : ""}">Tiếng Việt</a>
    ${otherExists ? `<a href="/${esc(dir)}/${other}" class="${loc === other ? "active" : ""}">${otherLabel}</a>` : ""}
  </div>`;
  return `<!doctype html><html lang="${loc}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(dir)} (${loc}) — Preview</title><style>${CSS}</style></head><body>
  <header><h1>${esc(dir)}</h1><span class="crumb"><a href="/">← Danh sách</a></span></header>
  <main><div class="card">${tabs}${article}</div></main></body></html>`;
}

const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === "/") pathname = "/index.html";
    if (pathname === "/index.html") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(renderIndex());
      return;
    }
    if (pathname === "/api/article") {
      const dir = url.searchParams.get("dir") || "";
      const loc = url.searchParams.get("loc") || "vi";
      const article = /^(vi|en)$/.test(loc) ? renderArticle(dir, loc) : null;
      if (article) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(article);
        return;
      }
    }
    const m = pathname.match(/^\/([^/]+)\/(vi|en)$/);
    if (m) {
      const html = renderPlant(m[1], m[2]);
      if (html) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
        return;
      }
    }
    res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`<html><body style="font-family:sans-serif;padding:40px"><h2>404</h2><p>Không tìm thấy. <a href="/">Về danh sách</a></p></body></html>`);
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(`Preview error: ${err.message}`);
  }
});

server.listen(PORT, "127.0.0.1", () => {
  const count = listPlants().length;
  console.log(`Care content preview đang chạy: http://127.0.0.1:${PORT}`);
  console.log(`Tìm thấy ${count} cây trong content/plants/`);
});
