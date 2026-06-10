---
domain: thac-nuoc
title: Thác nước — sheet stylized 7 lớp + điều khiển 3 tầng (Waterfall, 0 RTT)
status: building
tier: B
modules:
  - threejs-modules/components/Waterfall
  - archplan/src/archplan/gui/waterfall-lab.ts
  - archplan/src/archplan/gui/waterfall-preview.ts
issues:
  - KI-013
  - KI-014
updated: 2026-06-10
---

# Playbook — Thác nước (waterfall sheet, tier B)

> **Ranh giới:** recipe + tầng/toạ độ + lỗi mảng thác. Công thức shader chi tiết + props/setter →
> `components/Waterfall/README.md` (LINK không chép). Hiện sống trong Lab tab 🌊 — CHƯA ráp editor (Phase B).

## 1. Kết quả

Module `Waterfall` v1.6.0 — **7 lớp** (màn cong z=arc·√t · crest mặt-ngang drawdown · vòng bọt chân ·
glint · mist · splash · khúc xạ viewportTexture) + **3 tầng điều khiển LIVE 0-rebuild**: master `surge`
(êm-trong-veo ↔ ồ-ạt-trắng-xóa, 7 điểm đan) × strip NGANG 64×1 (tách dòng/xiết/tốc cột) × strip DỌC 64×2
(trong-suốt/gương/bụi-tán/nhiễu/vỡ-hạt theo đoạn rơi). **5 draw · ~3.5k tri · 0 RTT · 0 asset.**

## 2. Recipe dựng

- **Module**: `new Waterfall({width, height, arc, crestLength…})` → `scene.add(wf.getGroup())` đặt tại MÉP ĐỔ;
  mỗi frame `wf.setTime(s)`. Mọi setter = uniform/strip-write (hợp đồng PERFORMANCE.md). 2 texture sinh
  build-time: vệt = **Voronoi sợi lattice chu kỳ** (tự tile, ~30–100ms JS) · bọt = đốm radial-gradient (vài ms).
- **Điều khiển**: `setSurge` (master) · `setFlowProfile(FlowSample[])` (ngang) · `setFallProfile(FallSample[])`
  (dọc) — strip unorm8 KHÔNG FloatType (`float32-filterable` = optional feature).
- **Lab harness**: `waterfall-preview.ts` (mini-scene WebGPU riêng — tường tự nới theo crest; `tune(key,fn)`
  Map ghi-đè áp lại sau rebuild) + `waterfall-lab.ts` (~30 slider; structural = **commit-khi-buông**).

## 3. Tầng & toạ độ

- GỐC group = **TÂM MÉP TRÊN (lip)**. Sheet rơi −Y, dạt +Z (z=arc·√t); crest kéo NGƯỢC z∈[−crestLength, 0],
  drawdown võng về y=0 đúng mép; foot foam tại y=−height+0.012, loang từ z≈arc ra trước; mist/splash y=−height.
- Transparent ordering (Phase B): hồ vẽ TRƯỚC (khúc xạ cần đáy) → thác SAU (renderOrder cao hơn); foot foam
  depthWrite=false renderOrder 2 — nằm trên mặt hồ.
- Budget: sheet 24×60=2880 tri + crest 576 + foot 2 + 2 hệ hạt ≤600 quad — 5 draw. Cap MAX_MIST=600.

## 4. Lỗi thường gặp

- **Hạt particle trên WebGPU**: THREE.Points LUÔN 1px + positionGeometry-offset bug → màn mờ phủ viewport.
  Particle = InstancedMesh quad + SpriteNodeMaterial → **KI-013**.
- **2 renderer cùng page** (editor + Lab): `viewportSharedTexture` module-global giành nhau → flood copy-size
  + dispose nổ. Dùng `viewportTexture` per-instance + TỰ dispose ref → **KI-014**.
- **Dispose attr instanced nổ `undefined.destroy` mỗi rebuild** → KHÔNG custom attribute: per-hạt sinh trong
  shader từ `instanceIndex + hash` (đuôi KI-013).
- **Kéo slider structural = bão dispose-in-flight** (thác biến mất) → liveDrag=false, rebuild khi buông.
- **smoothstep ĐẢO ngưỡng = undefined WGSL** → `1−smoothstep(lo,hi,x)`. **smoothstep edge0==edge1 = chia 0**
  (mix động cho edge) → giữ edge0 < edge1 mọi giá trị uniform.
- **Sample texture ở VERTEX stage** (WPO theo texture) = cần `textureSampleLevel`, TSL chưa verify → WPO chỉ
  dùng noise THUẦN MATH (sin/hash); strip-control là fragment-only.

## 5. Lịch sử nâng cấp

- **2026-06-09 — A1**: ribbon + triNoise sọc + mist Points (2 draw). Texture-vệt > procedural-blob → A2.
- **2026-06-10 — A2**: công thức industry RiME/Season — texture vệt canvas + 3 lớp cuộn + fresnel + khúc xạ
  + posterize + wobble + splash; Lab tab 🌊 (quy trình mới: concept → tab Lab, KHÔNG html rời).
- **2026-06-10 — A2.1**: chuỗi fix KI-013/KI-014 + spray instanceIndex+hash + safeDispose có nhãn → console sạch.
- **2026-06-10 — A3.x**: 3 tầng điều khiển (flow strip ngang · fall strip dọc · surge master) + crest mặt ngang.
- **2026-06-10 — A4+A5**: khảo sát industry → Voronoi sợi + WPO bulge + vòng bọt chân + glint (v1.6.0).

## 6. Liên hệ

- Module: `components/Waterfall/README.md` (công thức 7 mục + bảng kênh strip) · anh em `components/WaterSurface`.
- Vách đá đỡ thác (hero) = Houdini bake → `deferred/systems/houdini-bake-accents.md` (⭐#1); LiquiGen flipbook
  cùng ngăn. Phase B = ráp editor đổ vào pond → `playbooks/pond.md` (ordering + chuỗi KI reflector).
