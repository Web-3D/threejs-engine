/**
 * VỊ TRÍ   — THREEJS/docs/md-to-html.mjs
 * VAI TRÒ  — Render 1 file Markdown trong docs/ thành trang HTML tự chứa (mở thẳng file://, không cần server).
 *            Markdown nhúng nguyên văn vào <script type="text/markdown"> → marked.js (CDN) parse runtime
 *            → tránh fetch (CORS chặn file://). .md là source-of-truth; .html là snapshot regenerate được.
 * LIÊN HỆ  — docs/README.md (index). Style tối giản dark, bảng GFM. Không thêm dependency (marked qua CDN).
 *
 * CÁCH DÙNG:  node docs/md-to-html.mjs docs/pbr-texture-maps.md   → ghi docs/pbr-texture-maps.html
 *             (output = cùng path, đổi đuôi .md → .html)
 * GHI CHÚ:    Node ghi UTF-8 KHÔNG BOM (mặc định) — an toàn tiếng Việt (khác PowerShell Set-Content).
 */
import { readFileSync, writeFileSync } from 'node:fs'

const src = process.argv[2]
if (!src || !src.endsWith('.md')) {
  console.error('Dùng: node docs/md-to-html.mjs <file.md>')
  process.exit(1)
}
const raw = readFileSync(src, 'utf8')
const out = src.replace(/\.md$/, '.html')
const title = (raw.match(/^title:\s*(.+)$/m) ?? raw.match(/^#\s+(.+)$/m))?.[1]?.trim() ?? 'Doc'
// Bỏ frontmatter YAML đầu file (--- … ---) khỏi nội dung render — title đã rút ở trên.
const md = raw.replace(/^---\n[\s\S]*?\n---\n/, '')

// Markdown nhúng verbatim (an toàn vì doc không chứa "</script>"). marked@12 GFM bật sẵn (bảng/strikethrough).
const html = `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<script src="https://cdn.jsdelivr.net/npm/marked@12/marked.min.js"></script>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; background: #0e1116; color: #d7dde5; font: 16px/1.65 -apple-system, "Segoe UI", Roboto, sans-serif; }
  main { max-width: 920px; margin: 0 auto; padding: 40px 24px 96px; }
  h1, h2, h3 { line-height: 1.25; color: #f0f4f8; margin: 1.8em 0 .6em; }
  h1 { font-size: 1.9rem; border-bottom: 1px solid #2a313c; padding-bottom: .35em; }
  h2 { font-size: 1.4rem; border-bottom: 1px solid #20262f; padding-bottom: .25em; margin-top: 2.2em; }
  h3 { font-size: 1.1rem; color: #9fd0ff; }
  a { color: #6cb6ff; }
  code { background: #1b212b; padding: .12em .4em; border-radius: 4px; font: .88em "Cascadia Code", Consolas, monospace; }
  pre { background: #161b22; border: 1px solid #20262f; border-radius: 8px; padding: 14px 16px; overflow: auto; }
  pre code { background: none; padding: 0; }
  blockquote { margin: 1em 0; padding: .4em 1em; border-left: 3px solid #3a4655; background: #141a22; color: #a8b3c0; border-radius: 0 6px 6px 0; }
  table { border-collapse: collapse; width: 100%; margin: 1.1em 0; font-size: .94rem; display: block; overflow-x: auto; }
  th, td { border: 1px solid #2a313c; padding: 7px 11px; text-align: left; vertical-align: top; }
  th { background: #1b222c; color: #f0f4f8; }
  tr:nth-child(even) td { background: #12171e; }
  hr { border: none; border-top: 1px solid #20262f; margin: 2.4em 0; }
  ::selection { background: #2d4a6b; }
</style>
</head>
<body>
<main id="out"></main>
<script id="md" type="text/markdown">
${md}
</script>
<script>
  document.getElementById('out').innerHTML =
    marked.parse(document.getElementById('md').textContent.trim());
</script>
</body>
</html>
`
writeFileSync(out, html, 'utf8')
console.log('Đã ghi', out, `(${(html.length / 1024).toFixed(1)} KB)`)
