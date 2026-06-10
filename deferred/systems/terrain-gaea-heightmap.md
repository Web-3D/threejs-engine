# Deferred — Gaea: heightmap terrain + CẦU GAEA (vòng MÔI TRƯỜNG)

> **Trạng thái:** 📐 PLANNED (2026-06-10) — NgQuan chốt **"Gaea = chỗ chính để dựa vào phát triển, cần kết
> nối gần nhất có thể"** → kiến trúc vòng MÔI TRƯỜNG đã chốt bên dưới, cho vào deferred chờ bắt đầu.
> **Revisit khi:** NgQuan ra lệnh bắt đầu vòng MÔI TRƯỜNG — bước 0 = cài **Gaea 2 Community** (0đ, quadspinner.com).
> Quyết định gốc 2026-06-07 (KHÔNG cho lô archviz) GIỮ NGUYÊN — phần dưới cùng.

## License Gaea 2 — VERIFIED 2026-06-10 (QuadSpinner chính chủ)

| Edition | Giá | Export | Automation/CLI | Thương mại |
|---|---|---|---|---|
| Community | 0đ | 1K | ❌ | ❌ non-commercial |
| Indie | $99 | 8K | ❌ | ✅ |
| Professional | $199 | 16K (tiled 262K) | ✅ `Gaea.Build.exe` + variable override | ✅ |

- **CLI automation khóa ở Professional+** — Community/Indie KHÔNG có (đừng plan daemon trước khi mua).
- ⚠️ **Gaea 3.0 unveiled 12/2025** (preview) — định mua Pro thì chờ xem 3.0, đừng mua 2 Pro sát thềm bản mới.
- Community = học/prototype OK (y bài Houdini Apprentice); asset vào sản phẩm thương mại → Indie+.
- Nguồn: quadspinner.com/Order/Editions · docs.quadspinner.com/Guide/Developers/Automation.html ·
  docs.quadspinner.com/Guide/Using-Gaea/FileFormats.html

## Kết nối gần nhất = FILE CONTRACT `.r32` — chung cho mọi tier, code không đổi khi nâng cấp

`.r32` = mảng float32 0..1 TRẦN (không header, little-endian) → web đọc `fetch → Float32Array`,
**zero dependency, zero decode**. (`.raw` = uint16 0..65535 nếu cần nhẹ hơn.)

```
Gaea (save/Build export .r32)
   ↓
c:\Factory\gaea\exports\            ← WATCHER (Factory script) convert + deploy
   ↓
Engine/assets/environments/<name>/production/height.r32 + meta.json (worldSize, ampM, res)
   ↓
archplan loader → Float32Array → TerrainRing.heightData → terrain đổi trong browser (vài giây)
```

- **Tầng 0 — Community 0đ:** bấm Build trong Gaea → watcher đẩy → browser tự cập nhật. Không cần CLI.
  1K cho vành đai ~1km = ~1m/px, đủ backdrop (lô 15m vẫn là FBM live-edit riêng, không phụ thuộc).
- **Tầng 1 — Indie $99:** y hệt, tăng resolution + thương mại.
- **Tầng 2 — Pro $199:** cắm thêm daemon: slider archplan → `Gaea.Build.exe file.tor --silent var:value`
  → rebuild .r32 → watcher đẩy về (latency giây–phút, commit-style). archplan = remote control của Gaea.

## Phases vòng MÔI TRƯỜNG (kiến trúc đã chốt 2026-06-10)

| Phase | Món | Ghi chú |
|---|---|---|
| **E0** | `components/TerrainRing` (module 4-file chuẩn) — vành đai địa hình quanh lô, HỐ phẳng đúng size lô (lô + heightAt giữ nguyên live-edit), plateau đệm → đồi dâng smoothstep ra 200–800m | API nhận `heightData {Float32Array, size, worldSize, amp}` **từ ngày 1** (format đã chắc); FBM tự chứa = fallback khi chưa có file. ~128×128 ≈ 30k tri, 1 draw, build-time only. Fog giấu mép |
| **E0.5** | Ráp archplan: field `env` trong `site/state.ts` (parse tolerant, không bump schema) + `buildEnvRing` trong `site/render/fromState.ts` + tab 🌍 `gui/env.ts` (VỎ, commit-only) | Tab thẳng panel chính (KHÔNG Lab tab — ring phải ôm lô thật mới verify seam được) |
| **E1** | Cầu Gaea: `c:\Factory\gaea\` (source/ + exports/ + script watcher-deploy) + loader .r32 + hot-reload dev | Chạy với Community 0đ |
| **E2** | Vách đá thác (Houdini prototype → tái dựng Blender → bake .glb → `assets/environments/`) + **thác Phase B** ráp editor | Xem [[houdini-bake-accents]] #1; daemon CLI = option khi có Pro |
| **E3** | Polish: cây/bonsai bake, đá rải theo slope, fog/LOD, núi silhouette xa | |

**Chưa tạo domain `threejs-modules/env/`** — mới 1 module + 1 config, luật ≥3 nơi dùng. Tách khi đủ 3 cụm
(ring + heightmap loader + cliff/sky, tức cuối E2) theo pattern thin-out building-kit.

## Quyết định gốc 2026-06-07 — GIỮ: KHÔNG cho archplan terrain (lô nhà)

1. **Sai scale.** Gaea mạnh ở landscape km-scale. Lô 15×14m + pad phẳng + gò ±10–80cm → erosion/geology vô hình.
2. **Phá vòng live-edit.** Gaea offline bake ↔ archplan slider/nặn tay realtime — lô vẫn là FBM `terrain.ts`.
3. **Dependency nặng cho việc nhỏ.** FBM ~40 dòng cho kết quả tương đương ở garden scale.

`heightAt(hf, x, z)` chỉ cần cộng term `heightmapSample(x, z)` khi muốn cắm heightmap vào LÔ — cửa vẫn chừa,
nhưng vòng MÔI TRƯỜNG dùng đường TerrainRing riêng (vành đai ngoài lô), không đụng heightAt.

## Liên hệ
- Playbook: [playbooks/ground.md](../../playbooks/ground.md) (§5 history Terrain Phase 1)
- Module: [threejs-modules/site/terrain.ts](../../threejs-modules/site/terrain.ts) (`heightAt` — lô, không đụng)
- [[houdini-bake-accents]] — vách đá thác (E2) + heightmap Houdini thay Gaea nếu cần
- Memory: `project-thac-nuoc-paused-for-gaea-env` · `project-future-unreal-game-pivot` · `project-factory-owns-roof`
