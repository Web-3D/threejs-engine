#!/usr/bin/env node
// update-index.js — Cập nhật Living Index trong CLAUDE.md
// Chạy tự động: SessionStart hook + sau validate.js PASS
// Chạy thủ công: node update-index.js

const fs = require('fs')
const path = require('path')

const ROOT = __dirname
const CLAUDE_MD = path.join(ROOT, 'CLAUDE.md')

// ─── Table alignment helpers ──────────────────────────────────────────────────

function displayWidth(str) {
  let w = 0
  for (const ch of [...str]) {
    const cp = ch.codePointAt(0)
    if (cp >= 0xFE00 && cp <= 0xFE0F) continue  // variation selectors (zero-width)
    if (cp === 0x200D) continue                  // zero-width joiner
    if (cp >= 0x1F000) { w += 2; continue }      // emoji (Emoticons, Misc Symbols and Pictographs...)
    if (cp >= 0x2600 && cp <= 0x27BF) { w += 2; continue }  // Misc Symbols & Dingbats
    if (cp >= 0x2B50 && cp <= 0x2B55) { w += 2; continue }  // stars
    w += 1
  }
  return w
}

// Takes a multi-line table string, returns aligned version with padded cells.
function alignTable(tableStr) {
  const lines = tableStr.split('\n').filter(l => l.includes('|'))
  if (lines.length < 2) return tableStr
  const rows = lines.map(l =>
    l.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(c => c.trim())
  )
  const isSep = r => r.every(c => /^[-: ]*$/.test(c))
  const colCount = Math.max(...rows.map(r => r.length))
  const maxW = Array.from({ length: colCount }, () => 3)
  for (const row of rows) {
    if (isSep(row)) continue
    row.forEach((cell, i) => { if (i < colCount) maxW[i] = Math.max(maxW[i], displayWidth(cell)) })
  }
  return rows.map(row => {
    if (isSep(row)) return '| ' + maxW.map(w => '-'.repeat(w)).join(' | ') + ' |'
    const cells = Array.from({ length: colCount }, (_, i) => {
      const cell = row[i] ?? ''
      return cell + ' '.repeat(Math.max(0, maxW[i] - displayWidth(cell)))
    })
    return '| ' + cells.join(' | ') + ' |'
  }).join('\n')
}

// ─── Section replacer ─────────────────────────────────────────────────────────
// Tìm <!-- INDEX:key --> ... <!-- /INDEX:key --> và thay nội dung bên trong.

function replaceSection(content, key, newContent) {
  const open  = `<!-- INDEX:${key} -->`
  const close = `<!-- /INDEX:${key} -->`
  const esc   = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re    = new RegExp(`${esc(open)}[\\s\\S]*?${esc(close)}`)
  if (!re.test(content)) {
    console.warn(`  ⚠️  Marker INDEX:${key} không tìm thấy trong CLAUDE.md — bỏ qua`)
    return content
  }
  return content.replace(re, `${open}\n${newContent.trimEnd()}\n${close}`)
}

// ─── Scanner: Scripts tại root ────────────────────────────────────────────────

function scanScripts() {
  const known = [
    { file: 'validate.js',      desc: 'Validate asset / module — caching + registry update' },
    { file: 'check-imports.js', desc: 'Kiểm tra src/ không import từ raw/ hoặc optimized/' },
    { file: 'update-index.js',  desc: 'Cập nhật Living Index trong CLAUDE.md (file này)' },
    { file: 'scan-versions.js', desc: 'Detect Three.js version drift — exit 1 nếu có module stale' },
    { file: 'find-unused.js',   desc: 'Orphan detector — stale imports + unregistered modules' },
    { file: 'lint-shaders.js',  desc: 'TSL/GLSL policy enforcer — ShaderMaterial, inline GLSL, console.log' },
    { file: 'check-playbooks.js', desc: 'Drift-guard playbooks/ — KI↔playbook khớp, path/len; --write sinh Index' },
  ]
  const rows = known.filter(s => fs.existsSync(path.join(ROOT, s.file)))
  const lines = ['| Script | Mô tả |', '|--------|-------|']
  for (const s of rows) lines.push(`| \`${s.file}\` | ${s.desc} |`)
  return alignTable(lines.join('\n'))
}

// ─── Scanner: Skills ──────────────────────────────────────────────────────────
// Đọc description từ frontmatter của SKILL.md (dòng `description: ...`)

function parseSkillDesc(skillDir) {
  const skillFile = path.join(skillDir, 'SKILL.md')
  if (!fs.existsSync(skillFile)) return '—'
  const text = fs.readFileSync(skillFile, 'utf8')
  const m = text.match(/^description:\s*(.+)/m)
  if (!m) return '—'
  // Cắt ngắn — lấy đến dấu phẩy đầu tiên hoặc 80 ký tự
  const desc = m[1].trim()
  const cut  = desc.indexOf('.')
  return (cut > 0 && cut < 80) ? desc.slice(0, cut) : desc.slice(0, 80)
}

function scanSkills() {
  const dir = path.join(ROOT, '..', '.claude', 'skills')
  if (!fs.existsSync(dir)) return '_Chưa có skill nào_'
  const skills = fs.readdirSync(dir)
    .filter(f => fs.statSync(path.join(dir, f)).isDirectory())
    .sort()
  if (skills.length === 0) return '_Chưa có skill nào_'
  const lines = ['| Skill | Khi nào dùng |', '|-------|-------------|']
  for (const s of skills) {
    const desc = parseSkillDesc(path.join(dir, s))
    lines.push(`| \`${s}\` | ${desc} |`)
  }
  return alignTable(lines.join('\n'))
}

// ─── Scanner: Skill Triggers ──────────────────────────────────────────────────
// Trích xuất Vietnamese phrases từ frontmatter description của mỗi SKILL.md.
// Pattern: "Also triggers on Vietnamese phrases: "kw1", "kw2"."

function extractPhrases(description) {
  const m = description.match(/Vietnamese phrases:\s*(.*?)(?:\.\s*Do NOT|$)/s)
  if (!m) return '—'
  const quotes = m[1].match(/"([^"]+)"/g) || []
  return quotes.map(q => q.replace(/"/g, '')).join(', ')
}

function scanTriggers() {
  const dir = path.join(ROOT, '..', '.claude', 'skills')
  if (!fs.existsSync(dir)) return '_Chưa có skill nào_'
  const skills = fs.readdirSync(dir)
    .filter(f => fs.statSync(path.join(dir, f)).isDirectory())
    .sort()
  if (skills.length === 0) return '_Chưa có skill nào_'
  const lines = ['| Từ khóa nghe thấy | Skill |', '|------------------|-------|']
  for (const s of skills) {
    const skillFile = path.join(dir, s, 'SKILL.md')
    if (!fs.existsSync(skillFile)) continue
    const text  = fs.readFileSync(skillFile, 'utf8')
    const descM = text.match(/^description:\s*(.+)/m)
    if (!descM) continue
    const phrases = extractPhrases(descM[1])
    lines.push(`| ${phrases} | \`${s}\` |`)
  }
  return alignTable(lines.join('\n'))
}

// ─── Scanner: Modules (threejs-modules/) ──────────────────────────────────────
// Mỗi module là folder có meta.json bên trong category folder.
// Bỏ qua folder _template và folder không có meta.json.

function scanModules() {
  const tmDir = path.join(ROOT, 'threejs-modules')
  if (!fs.existsSync(tmDir)) return '_threejs-modules/ chưa tồn tại_'

  const modules = []
  for (const cat of fs.readdirSync(tmDir).sort()) {
    if (cat.startsWith('_') || cat.startsWith('.')) continue
    const catDir = path.join(tmDir, cat)
    if (!fs.statSync(catDir).isDirectory()) continue
    for (const entry of fs.readdirSync(catDir).sort()) {
      if (entry.startsWith('_') || entry.startsWith('.')) continue
      const entryPath = path.join(catDir, entry)
      if (!fs.statSync(entryPath).isDirectory()) continue
      const directMeta = path.join(entryPath, 'meta.json')
      if (fs.existsSync(directMeta)) {
        // Direct module — meta.json at category/module/meta.json
        try {
          const meta = JSON.parse(fs.readFileSync(directMeta, 'utf8'))
          modules.push({ name: meta.name || entry, cat, version: meta.version || '—', status: meta.status || '—', desc: meta.description || '—' })
        } catch { /* parse lỗi — bỏ qua */ }
        continue
      }
      // Subcategory folder (e.g. shaders/vertex/) — scan one level deeper
      for (const mod of fs.readdirSync(entryPath).sort()) {
        if (mod.startsWith('_') || mod.startsWith('.')) continue
        const metaPath = path.join(entryPath, mod, 'meta.json')
        if (!fs.existsSync(metaPath)) continue
        try {
          const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
          modules.push({ name: meta.name || mod, cat, version: meta.version || '—', status: meta.status || '—', desc: meta.description || '—' })
        } catch { /* parse lỗi — bỏ qua */ }
      }
    }
  }

  if (modules.length === 0) return '_Phase A — chưa có module nào (chỉ có _template)_'
  const lines = ['| Module | Category | Version | Status | Mô tả |', '|--------|----------|---------|--------|-------|']
  for (const m of modules) lines.push(`| \`${m.name}\` | ${m.cat} | ${m.version} | ${m.status} | ${m.desc} |`)
  return alignTable(lines.join('\n'))
}

// ─── Scanner: Assets (từ REGISTRY.json) ──────────────────────────────────────

function scanAssets() {
  const regPath = path.join(ROOT, 'assets', 'REGISTRY.json')
  if (!fs.existsSync(regPath)) return '_assets/REGISTRY.json chưa có_'
  let reg
  try { reg = JSON.parse(fs.readFileSync(regPath, 'utf8')) } catch { return '_REGISTRY.json parse lỗi_' }

  const cats  = ['buildings', 'characters', 'environments', 'props', 'textures']
  const lines = ['| Category | Count | Assets |', '|----------|-------|--------|']
  let total   = 0
  for (const cat of cats) {
    const items = Array.isArray(reg[cat]) ? reg[cat] : []
    total += items.length
    const names = items.map(a => a.name).join(', ') || '—'
    lines.push(`| ${cat} | ${items.length} | ${names} |`)
  }
  lines.push(`| **Total** | **${total}** | |`)
  return alignTable(lines.join('\n'))
}

// ─── Main ─────────────────────────────────────────────────────────────────────

let content = fs.readFileSync(CLAUDE_MD, 'utf8')

content = replaceSection(content, 'skills',   scanSkills())
content = replaceSection(content, 'triggers', scanTriggers())
content = replaceSection(content, 'assets',   scanAssets())

fs.writeFileSync(CLAUDE_MD, content)
console.log(`✅ Living Index updated — ${new Date().toLocaleTimeString()}`)
