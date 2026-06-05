#!/usr/bin/env node
// check-perf.js — Máy duyệt chống tụt-FPS + bẫy geometry (hệ quy chiếu: PERFORMANCE.md)
//
// Bắt các bẫy GREP-ĐƯỢC (phần kiến-trúc P1/P3/P4/… do checklist PERFORMANCE.md §3 + review tự gác):
//   MERGE-NULL  (error) — mergeGeometries(...) gán biến mà KHÔNG check null trong ~8 dòng  (P8 / KI-004)
//   GEO-NO-UV   (error) — new BufferGeometry có setAttribute('position') nhưng THIẾU 'uv'  (P8 / KI-010)
//   NODEMAT-IN-BUILDER (warn) — new NodeMaterial/TexturedSurface/PhotoGround trong hàm build*/_render*/
//                                _sync*/_rebuild*/make* → có thể recompile mỗi rebuild, nên cache+inject (P2)
//
// Suppress: thêm `// perf-ok` (kèm lý do) trên CÙNG dòng hoặc dòng NGAY TRÊN match → bỏ qua.
// Mặc định read-only, exit 1 nếu có ERROR (dùng cho hook/CI). Chạy: node check-perf.js
//
// LƯU Ý: heuristic — KHÔNG thay được review. Mục tiêu = bắt 80% bẫy lặp lại, ép cân nhắc phần còn lại.

const fs = require('fs')
const path = require('path')

const ROOT = __dirname
const SCAN_DIRS = [
  path.join(ROOT, 'threejs-modules'),
  path.join(ROOT, 'archplan', 'src'),
]
const SKIP = /[/\\](node_modules|dist|\.git|_template)[/\\]/

let errors = 0
let warns = 0
const hits = []

function add(level, rel, line, rule, msg) {
  hits.push({ level, rel, line, rule, msg })
  if (level === 'error') errors++
  else warns++
}

// Suppress nếu dòng match hoặc dòng ngay trên có `perf-ok`.
function suppressed(lines, i) {
  return /perf-ok/.test(lines[i] || '') || /perf-ok/.test(lines[i - 1] || '')
}

const isNoise = (s) => /^\s*(\/\/|\*|import\b|export \{)/.test(s)

// ── MERGE-NULL ──────────────────────────────────────────────────────────────
function ruleMergeNull(lines, rel) {
  lines.forEach((line, i) => {
    if (isNoise(line) || !/\bmergeGeometries\s*\(/.test(line)) return
    if (/function\s+mergeGeometries|mergeGeometries\s*:/.test(line)) return // định nghĩa/type
    if (suppressed(lines, i)) return
    if (/mergeGeometries\([^)]*\)\s*(\?\?|\|\|)/.test(line)) return // guard inline cùng dòng (?? fallback / || ...)
    const m = /(?:const|let|var)\s+(\w+)\s*=\s*mergeGeometries/.exec(line)
    if (!m) {
      add('error', rel, i + 1, 'MERGE-NULL', 'mergeGeometries() gọi inline — không thể check null (gán biến + `if(!x) return`)')
      return
    }
    const v = m[1]
    const win = lines.slice(i + 1, i + 9).join('\n')
    const guard = new RegExp(`(!\\s*${v}\\b|\\b${v}\\s*===?\\s*null|\\b${v}\\s*\\?\\.|if\\s*\\(\\s*${v}\\b|\\b${v}\\s*&&|return\\s+${v}\\s*\\?)`)
    if (!guard.test(win)) {
      add('error', rel, i + 1, 'MERGE-NULL', `\`${v} = mergeGeometries(...)\` không check null (trộn indexed/non-indexed → null ÂM THẦM, KI-004)`) }
  })
}

// ── GEO-NO-UV ───────────────────────────────────────────────────────────────
function ruleGeoNoUv(lines, rel) {
  lines.forEach((line, i) => {
    if (isNoise(line)) return
    const m = /(?:const|let|var)\s+(\w+)\s*=\s*new\s+(?:THREE\.)?BufferGeometry\s*\(\s*\)/.exec(line)
    if (!m) return
    if (suppressed(lines, i)) return
    const v = m[1]
    // quét tới `return` hoặc hết ~30 dòng: có setAttribute('position') cho v mà KHÔNG có 'uv'?
    let hasPos = false
    let hasUv = false
    for (let j = i; j < Math.min(i + 30, lines.length); j++) {
      const s = lines[j]
      if (new RegExp(`\\b${v}\\.setAttribute\\(\\s*['"]position['"]`).test(s)) hasPos = true
      if (new RegExp(`\\b${v}\\.setAttribute\\(\\s*['"]uv['"]`).test(s)) hasUv = true
      if (new RegExp(`return\\s+${v}\\b|return\\s+${v}\\.`).test(s)) break
    }
    if (hasPos && !hasUv) {
      // WARN (không gate): nhiều BufferGeometry hợp lệ KHÔNG cần uv (point/line/material không đọc uv). CHỈ
      // thành bug khi ghép NodeMaterial/WebGPU cần uv (vd stone fence + TexturedSurface). Verify khi dùng node-mat.
      add('warn', rel, i + 1, 'GEO-NO-UV', `\`${v}\` (BufferGeometry tay) có 'position' nhưng THIẾU 'uv' → NẾU ghép NodeMaterial/WebGPU sẽ mất hình ÂM THẦM (KI-010). Verify; OK thì \`// perf-ok\``) }
  })
}

// ── NODEMAT-IN-BUILDER ──────────────────────────────────────────────────────
const NODEMAT = /new\s+(TexturedSurface|PhotoGround|MeshStandardNodeMaterial|MeshPhysicalNodeMaterial|MeshBasicNodeMaterial|MeshToonNodeMaterial|NodeMaterial)\s*\(/
const BUILDER = /^(?:build|_build|_render|_sync|_rebuild|make)/

// Tên hàm bao gần nhất (quét ngược): function X / private X( / const X = ( / method 2-space.
function enclosingFn(lines, i) {
  for (let j = i; j >= 0 && j > i - 120; j--) {
    const m = /(?:function\s+|(?:private|public|protected|static|async|readonly)\s+|const\s+|let\s+)([_a-zA-Z]\w*)\s*[(=]/.exec(lines[j])
    if (m && /[({]\s*$|=>/.test(lines[j])) return m[1]
    const mm = /^\s{2,4}(?:private |public |protected |static |async )*([_a-zA-Z]\w*)\s*\(/.exec(lines[j])
    if (mm) return mm[1]
  }
  return null
}

function ruleNodeMatInBuilder(lines, rel) {
  lines.forEach((line, i) => {
    if (isNoise(line) || !NODEMAT.test(line)) return
    if (suppressed(lines, i)) return
    const fn = enclosingFn(lines, i)
    if (fn && BUILDER.test(fn)) {
      const mat = NODEMAT.exec(line)[1]
      add('warn', rel, i + 1, 'NODEMAT-IN-BUILDER', `\`new ${mat}\` trong \`${fn}()\` (builder per-rebuild?) → cache+inject kẻo recompile shader mỗi rebuild (P2). OK thì \`// perf-ok\``) }
  })
}

function scanFile(file) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/')
  const lines = fs.readFileSync(file, 'utf8').split('\n')
  ruleMergeNull(lines, rel)
  ruleGeoNoUv(lines, rel)
  ruleNodeMatInBuilder(lines, rel)
}

function walk(dir) {
  if (!fs.existsSync(dir)) return
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name)
    if (SKIP.test(p + path.sep)) continue
    const st = fs.statSync(p)
    if (st.isDirectory()) walk(p)
    else if (/\.ts$/.test(name) && !/\.d\.ts$/.test(name)) scanFile(p)
  }
}

console.log('🏃 check-perf — duyệt bẫy tụt-fps + geometry (PERFORMANCE.md)\n')
for (const d of SCAN_DIRS) walk(d)

hits.sort((a, b) => (a.rel === b.rel ? a.line - b.line : a.rel < b.rel ? -1 : 1))
for (const h of hits) {
  const tag = h.level === 'error' ? '❌' : '⚠️ '
  console.log(`${tag} ${h.rel}:${h.line}  [${h.rule}]  ${h.msg}`)
}

console.log(`\n${errors} error, ${warns} warn.`)
if (errors > 0) {
  console.log('→ Sửa ERROR (hoặc `// perf-ok: <lý do>`). Xem PERFORMANCE.md §2.')
  process.exit(1)
}
console.log('✅ Không có bẫy fps/geometry grep-được. (Kiến-trúc P1/P3/P4… → checklist §3 tự gác.)')
