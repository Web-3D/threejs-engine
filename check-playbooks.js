#!/usr/bin/env node
// check-playbooks.js — Drift-guard cho hệ playbooks/ (cẩm nang dựng theo mảng)
//
// Biến 3 luật "tự nhớ" thành "máy bắt":
//   1. KI ↔ playbook khớp 2 chiều (domain tag): KI có domain:X → playbooks/X.md PHẢI link nó (và ngược lại)
//   2. Đường dẫn module trong playbook + KI id tồn tại thật trên đĩa
//   3. Mỗi KI có field `domain`; mỗi playbook ≤ 100 dòng (phình = hỏng)
//
// Mặc định = CHECK (read-only, exit 1 nếu có lỗi → dùng cho hook/CI).
// `--write` = sinh lại bảng Index trong playbooks/README.md từ frontmatter (vùng <!-- AUTO:index -->).
//
// Chạy: node check-playbooks.js [--write]

const fs = require('fs')
const path = require('path')

const ROOT = __dirname
const PB_DIR = path.join(ROOT, 'playbooks')
const KI_DIR = path.join(ROOT, 'known-issues')
const README = path.join(PB_DIR, 'README.md')
const MAX_LINES = 100
const SECTION_MAX = 27 // span header→header: để `grep -A 25` vớ gọn đúng 1 section (đọc rẻ cho AI)
const WRITE = process.argv.includes('--write')

const errors = []
const warns = []
const err = (m) => errors.push(m)
const warn = (m) => warns.push(m)

// ─── Frontmatter parser (scalar | comma-list | YAML list) ─────────────────────
// Hỗ trợ: `key: value`, `key: a, b`, và `key:\n  - item  # comment`.
function parseFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---/)
  if (!m) return null
  const obj = {}
  const lines = m[1].split('\n')
  for (let i = 0; i < lines.length; i++) {
    const kv = lines[i].match(/^([a-zA-Z_][\w-]*):\s*(.*)$/)
    if (!kv) continue
    const key = kv[1]
    const val = kv[2].trim()
    if (val === '') {
      const list = []
      while (i + 1 < lines.length && /^\s+-\s+/.test(lines[i + 1])) {
        list.push(lines[++i].replace(/^\s+-\s+/, '').replace(/\s+#.*$/, '').trim())
      }
      obj[key] = list
    } else {
      obj[key] = val
    }
  }
  return obj
}

// domain scalar "a, b" → ['a','b'] (bỏ '—' = không thuộc mảng build)
function domainList(v) {
  if (!v) return []
  return String(v)
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s && s !== '—')
}

// module path khớp file/dir thật (cho phép thiếu .ts/.js, hoặc là folder module)
function moduleExists(p) {
  const abs = path.join(ROOT, p)
  return fs.existsSync(abs) || fs.existsSync(abs + '.ts') || fs.existsSync(abs + '.js')
}

// Span mỗi section (header `## ` → header kế / EOF) — canh ≤ SECTION_MAX để grep -A vớ gọn 1 section.
function sectionSpans(text) {
  const lines = text.split('\n')
  const heads = []
  lines.forEach((l, i) => {
    if (/^## /.test(l)) heads.push({ label: l.replace(/^##\s*/, '').trim(), at: i })
  })
  return heads.map((h, i) => ({
    label: h.label,
    span: (i + 1 < heads.length ? heads[i + 1].at : lines.length) - h.at,
  }))
}

// ─── Load known-issues ────────────────────────────────────────────────────────
function loadKIs() {
  if (!fs.existsSync(KI_DIR)) return []
  return fs
    .readdirSync(KI_DIR)
    .filter((f) => /^KI-\d+.*\.md$/.test(f))
    .map((f) => {
      const fm = parseFrontmatter(fs.readFileSync(path.join(KI_DIR, f), 'utf8')) || {}
      const id = (fm.id || f.match(/^(KI-\d+)/)[1]).trim()
      return { file: f, id, domains: domainList(fm.domain), hasDomainField: 'domain' in fm }
    })
}

// ─── Load playbooks (bỏ README + _TEMPLATE) ───────────────────────────────────
function loadPlaybooks() {
  if (!fs.existsSync(PB_DIR)) return []
  return fs
    .readdirSync(PB_DIR)
    .filter((f) => f.endsWith('.md') && f !== 'README.md' && !f.startsWith('_'))
    .map((f) => {
      const text = fs.readFileSync(path.join(PB_DIR, f), 'utf8')
      const fm = parseFrontmatter(text) || {}
      return {
        file: f,
        slug: f.replace(/\.md$/, ''),
        fm,
        raw: text,
        lines: text.split('\n').length,
        issues: (Array.isArray(fm.issues) ? fm.issues : []).map((s) => String(s).trim()),
        modules: Array.isArray(fm.modules) ? fm.modules : fm.modules ? [fm.modules] : [],
      }
    })
}

// ─── Checks ───────────────────────────────────────────────────────────────────
function runChecks(kis, pbs) {
  const pbBySlug = new Map(pbs.map((p) => [p.slug, p]))
  const kiById = new Map(kis.map((k) => [k.id, k]))

  // KI: bắt buộc có domain
  for (const k of kis) {
    if (!k.hasDomainField) err(`${k.file}: thiếu field 'domain' (bắt buộc — dùng '—' nếu không thuộc mảng)`)
  }

  // Playbook: field bắt buộc + slug khớp domain + ≤100 dòng + module path tồn tại
  for (const p of pbs) {
    for (const req of ['domain', 'title', 'status', 'updated']) {
      if (!p.fm[req]) err(`playbooks/${p.file}: thiếu frontmatter '${req}'`)
    }
    if (p.fm.domain && !domainList(p.fm.domain).includes(p.slug)) {
      warn(`playbooks/${p.file}: domain='${p.fm.domain}' không khớp tên file '${p.slug}'`)
    }
    if (p.lines > MAX_LINES) warn(`playbooks/${p.file}: ${p.lines} dòng > ${MAX_LINES} — chẻ bớt, đẩy chi tiết sang KI/README`)
    for (const s of sectionSpans(p.raw)) {
      if (s.span > SECTION_MAX)
        warn(`playbooks/${p.file}: section "${s.label}" ${s.span} dòng > ${SECTION_MAX} — grep -A 25 sẽ hụt, xén/chẻ`)
    }
    for (const mod of p.modules) {
      if (!moduleExists(mod)) err(`playbooks/${p.file}: module path không tồn tại — '${mod}'`)
    }
    // playbook → KI: id tồn tại + KI đó có tag domain ngược lại
    for (const id of p.issues) {
      const k = kiById.get(id)
      if (!k) err(`playbooks/${p.file}: link '${id}' nhưng known-issues/ không có`)
      else if (!k.domains.includes(p.slug))
        warn(`playbooks/${p.file}: link ${id} nhưng ${k.file} không tag domain:${p.slug}`)
    }
  }

  // KI → playbook: domain có nhà + playbook đó link ngược (completeness — bắt drift "quên link")
  for (const k of kis) {
    for (const d of k.domains) {
      const p = pbBySlug.get(d)
      if (!p) warn(`${k.file}: domain:${d} nhưng chưa có playbooks/${d}.md (mảng chưa build?)`)
      else if (!p.issues.includes(k.id))
        err(`${k.file}: domain:${d} nhưng playbooks/${d}.md KHÔNG link ${k.id} ở 'issues:' (drift!)`)
    }
  }
}

// ─── Bảng Index (sinh từ frontmatter) ─────────────────────────────────────────
function genIndex(pbs) {
  const rows = ['| Mảng | File | Tier | Trạng thái | Module(s) | KI |', '| --- | --- | --- | --- | --- | --- |']
  for (const p of pbs.sort((a, b) => a.slug.localeCompare(b.slug))) {
    const name = String(p.fm.title || p.slug).split('—')[0].trim()
    const tier = p.fm.tier || '—'
    const status = p.fm.status || '—'
    const mods = p.modules.map((m) => m.split('/').pop()).join(', ') || '—'
    const ki = p.issues.join(', ') || '—'
    rows.push(`| ${name} | [${p.file}](${p.file}) | ${tier} | ${status} | ${mods} | ${ki} |`)
  }
  return rows.join('\n')
}

function syncIndex(pbs) {
  if (!fs.existsSync(README)) {
    warn('playbooks/README.md không tồn tại — bỏ qua Index')
    return
  }
  const content = fs.readFileSync(README, 'utf8')
  const open = '<!-- AUTO:index -->'
  const close = '<!-- /AUTO:index -->'
  const re = new RegExp(`${open}[\\s\\S]*?${close}`)
  if (!re.test(content)) {
    warn(`playbooks/README.md: chưa có markers ${open} … ${close} cho bảng Index auto`)
    return
  }
  const table = genIndex(pbs)
  const block = `${open}\n${table}\n${close}`
  const current = content.match(re)[0]
  if (WRITE) {
    if (current !== block) {
      fs.writeFileSync(README, content.replace(re, block))
      console.log('✏️  playbooks/README.md — bảng Index đã sinh lại')
    }
  } else if (current !== block) {
    warn('playbooks/README.md: bảng Index lệch frontmatter — chạy `node check-playbooks.js --write`')
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const kis = loadKIs()
const pbs = loadPlaybooks()
runChecks(kis, pbs)
syncIndex(pbs)

console.log('───────────────────────────────────────────────')
console.log(`PLAYBOOK CHECK — ${pbs.length} playbook · ${kis.length} KI`)
console.log('───────────────────────────────────────────────')
for (const w of warns) console.log(`  ⚠️  ${w}`)
for (const e of errors) console.log(`  ❌ ${e}`)
if (errors.length === 0 && warns.length === 0) console.log('  ✅ Sạch — KI↔playbook khớp, path ok, độ dài ok')
console.log('───────────────────────────────────────────────')
if (errors.length) {
  console.log(`❌ FAIL — ${errors.length} lỗi${warns.length ? ` + ${warns.length} cảnh báo` : ''}`)
  process.exit(1)
}
console.log(`✅ PASS${warns.length ? ` — ${warns.length} cảnh báo (không chặn)` : ''}`)
