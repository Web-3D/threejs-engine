# CLAUDE.md — Three.js Engine

> Tầng này quản lý: Three.js stack, module patterns, skills, build order, Living Index.
> KHÔNG can thiệp: ecosystem decisions, Babylon rules, asset structure (assets ở `../assets/`).
> ← Tầng trên: `../CLAUDE.md` (ecosystem overview)
> Skills: `../.claude/skills/` | Architecture: `ARCHITECTURE.md`

---

## Workspace layout (engine scope)

```
THREEJS/
├── 00-Threejs/        ← project chính (Vite + TS + Three.js 0.174)
├── 01-Doraemon/       ← project Doraemon — city procedural (repo riêng / gitlink)
├── archplan/          ← TOOL standalone: editor dựng nhà procedural từ floor-plan (repo riêng, port 3002)
├── threejs-modules/   ← thư viện module tái sử dụng + building/ (= building-kit: engine sinh nhà, three-only)
├── validate.js        ← Three.js module/asset validator
├── update-index.js    ← cập nhật Living Index trong file này
├── check-imports.js   ← kiểm tra import path hợp lệ
└── scan-versions.js   ← detect Three.js version drift — chạy sau mỗi Three.js upgrade
```

Assets dùng chung: `../assets/[category]/[name]/production/` — không nằm trong thư mục này.
Effects/VFX → `threejs-modules/effects/` (GPUParticleSystem, SparkSystem ✅ Phase B).

---

## Stack cố định

- Three.js **0.174** — verify API trong `node_modules/three/src/` trước khi dùng
- TypeScript **strict mode** — không dùng `any`, không dùng `!` non-null assertion
- Shader ưu tiên: **TSL > WGSL > GLSL** (GLSL phải có README giải thích lý do)
- Vite 6, ESLint, Husky commit gate

---

## 3 Quy tắc không ngoại lệ

**1. Dispose pattern** — mọi class có GPU resource (Geometry, Material, Texture, RenderTarget) phải có `dispose()` đầy đủ. Chi tiết: skill `dispose-pattern`.

**2. Performance budget** — draw calls < 100, triangles < 500k, texture ≤ 2048×2048. `RuntimeGuard` bắt buộc trong mọi World class có animation loop.

**3. Honest-Uncertain** — khi không chắc API tồn tại ở version 0.174, nói rõ trước khi dùng. Không tự bịa method name.

---

## Phase hiện tại

**Phase D ✅ — 20 modules unit-pass.** Chi tiết: [`ROADMAP.md`](ROADMAP.md)

---

## Coding style

- Không comment trừ khi WHY không rõ từ code
- Không tạo file mới nếu có thể edit file hiện tại
- Không thêm error handling cho scenario không thể xảy ra
- Không add abstraction chưa cần — 3 dòng lặp tốt hơn abstraction sớm

---

## Quality gate — bắt buộc sau mọi thay đổi asset hoặc module

```
node validate.js ../assets/[category]/[name]       # sau khi thêm/sửa asset (từ thư mục THREEJS/)
node validate.js threejs-modules/[category]/[Name] # sau khi thêm/sửa module
node check-imports.js                               # sau khi copy module vào 00-Threejs/src/imported/
```

Hook tự chạy validate.js sau mỗi lần Claude Code write/edit file trong `../assets/` hoặc `threejs-modules/`.  
Khi user chỉnh tay → **phải chạy thủ công**.

**Caching:** validate.js bỏ qua nếu file không đổi (lưu hash tại `.validate-cache.json` — gitignored).  
**Registry:** sau mỗi asset PASS, `../assets/REGISTRY.json` tự update — không sửa tay file này.

---

## Session opener chuẩn

Câu đầu tiên khi mở THREEJS session:

```
Đọc CLAUDE.md + ../SYNC.md + c:\Editions\studio-3D\STATUS.md rồi báo cáo trạng thái.
```

---

## Shared AI Context

| File                      | Mục đích                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------ |
| `../SYNC.md`              | Log quyết định + trạng thái workspace — **đọc đầu session**, ghi sau thay đổi lớn          |
| `c:\Editions\studio-3D\STATUS.md` | Command center — active project, phase, blockers cross-repo          |
| `deferred/`               | Tính năng đã nghiên cứu nhưng hoãn — mỗi file 1 tính năng, đọc trước khi đề xuất implement |
| `known-issues/`           | Catalog lỗi thường gặp + cách sửa (`KI-NNN`) — **đọc khi gặp triệu chứng lạ / trước khi sửa geometry-state-shader**, tránh tái phạm |
| `../assets/REGISTRY.json` | Index tổng hợp tất cả assets đã validate — auto-generated, không sửa tay                   |

---

## Quick Lookup — hỏi gì đọc đâu

| Câu hỏi                                     | Đọc ở đây                                  |
| ------------------------------------------- | ------------------------------------------ |
| API Three.js 0.174 có method X không?       | `node_modules/three/src/` — grep trực tiếp |
| Skill nào dùng cho tình huống này?          | Living Index → Skill Triggers              |
| Module nào đã build xong?                   | Living Index → Modules                     |
| Asset nào production-ready?                 | Living Index → Assets                      |
| Quyết định / context session trước?         | `../SYNC.md`                                   |
| Tại sao chọn pattern/stack này?             | `decisions/` — ADR index (thay đổi cấu trúc lớn) |
| Lỗi này gặp rồi? Sửa sao? Sao đừng tái phạm? | `known-issues/README.md` — KI catalog (lỗi thường gặp) |
| Tính năng đã nghiên cứu nhưng hoãn?         | `deferred/README.md`                           |
| Workflow import + tích hợp module?          | `../.claude/skills/module-handoff/SKILL.md` |
| Kế hoạch asset, budget tier, shaderProfile? | `../assets/ROADMAP.md`                         |

---

## Workflow import module (Claude solo)

> Gemini rời 2026-05-29 — Claude đảm nhận cả Librarian lẫn Adapter. Không còn handoff qua `SUMMARY.md`. Chi tiết: skill `module-handoff`.

| Bước | Việc |
| ---- | ---- |
| 1. Tìm  | Tìm module trong `threejs-modules/[category]/[Name]` (đọc README + meta.json) |
| 2. Copy | Copy vào `00-Threejs/src/imported/[Name]/` — giữ nguyên, không sửa để còn diff |
| 3. Adapt | Tích hợp vào scene chính (import path, props, dispose-pattern) |
| 4. Lock | Update `.module-lock.json`: `commit-sha`, `status: "adapted"`, `integrated-into` |

Không sửa file trong `src/imported/[name]/` — giữ nguyên để diff. `.module-lock.json` vẫn track version dù chỉ 1 AI.

---

## Living Index

> Auto-generated bởi `update-index.js` — **không sửa tay** phần trong thẻ `<!-- INDEX -->`.
> Cập nhật: mỗi lần mở session (SessionStart hook) + sau mỗi validate PASS.

### Scripts → [`ARCHITECTURE.md`](ARCHITECTURE.md) (File Registry section)

### Skills (../.claude/skills/)

<!-- INDEX:skills -->
| Skill                  | Khi nào dùng                                  |
| ---------------------- | --------------------------------------------- |
| `shared-gltf-pipeline` | Use when optimizing, cleaning, or compressing |
<!-- /INDEX:skills -->

### Skill Triggers — từ khóa → skill

<!-- INDEX:triggers -->
| Từ khóa nghe thấy                                                                                    | Skill                  |
| ---------------------------------------------------------------------------------------------------- | ---------------------- |
| làm sạch model, tối ưu model, nén model, weld, draco, simplify mesh, import geometry, chuẩn bị model | `shared-gltf-pipeline` |
<!-- /INDEX:triggers -->

### Modules → [`threejs-modules/README.md`](threejs-modules/README.md)

### Assets (assets/)

<!-- INDEX:assets -->
_assets/REGISTRY.json chưa có_
<!-- /INDEX:assets -->
