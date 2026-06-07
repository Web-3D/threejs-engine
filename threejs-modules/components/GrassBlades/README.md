# GrassBlades

Cỏ **3D** (lá geometry nhú lên) — **tier B** (geometry/silhouette, material-roadmap).
Cặp với [`GrassGround`](../../shaders/ground/GrassGround/) (tier A) làm **lớp nền + LOD-xa**.

> **Đang rebuild tăng dần (preview-first).** Phiên bản này: lá đứng **rộng gốc/thân riêng** + **thon ngọn**
> (mép ellipse) + **cong T→P** + **cong dọc** (1 chiều, mặt ngoài lồi) + **cụp** (1 chiều, mặt trong lõm) + **2 mặt 2 màu** + **bụi cỏ**. Preview 1 lá (archplan) **dùng chung model** với bãi → trông y hệt. Các bước:
> ~~B1 thon ellipse~~ ✅ · ~~B3 bend-3D dọc (cong dọc)~~ ✅ · ~~B4 cụp mép (shader normal + geometry fold tùy chọn)~~ ✅ · ~~B9 nhận bóng (shadow map)~~ ✅ · **B2 màu gradient** (kế) · B5 xoắn · B6 gió · B7 cao-thấp · B8 ngả 1 chiều.

## Kỹ thuật (2 mặt + silhouette + normal cụp)

> **Quy ước 2 mặt** (đồng nhất mọi lá): local **+Z = mặt NGOÀI (lồi)** · **−Z = mặt TRONG (lõm)**.
> `bend` & `cup` **1 chiều** (`0..1`, không lật ngược): ngoài luôn lồi, trong luôn lõm. 2 mặt tô **khác màu**.

1. **1 lá** = lưới đứng (y: 0→H), S đốt — dựng theo mét. Bề rộng theo **3 chốt** gốc→thân→ngọn:
   `t≤0.5` lerp `gốc→thân`; `t>0.5` thon `(1−taper)+taper·√(1−u²)`, `u=(t−0.5)/0.5`. Tâm lá dời X = `curveLR·H·t²` (cong trái→phải).
2. **Cong dọc** (1 chiều `0..1`, mặt chiếu cạnh Y-Z): dời Z = `bend·H·t²` → mặt **NGOÀI (+Z) lồi ra**, gốc đứng→ngọn ngả. **Zero tris thêm**.
3. **Cụp 2 mép — 1 chiều `0..1`, mặt TRONG (−Z) lõm vào** (`cup` = cường độ chung). 2 lựa chọn:
   - **Shader** (`cupGeo=false`, MẶC ĐỊNH, rẻ): nghiêng **normal** 2 mép `∝ (4·cup·u, 0, 1)` (u=±1) → GPU nội suy → ăn sáng cong từ mép→mép, **giữ strip 2 đỉnh, ZERO tris**. Silhouette phẳng (trick grass Ghost/Horizon).
   - **Geometry** (`cupGeo=true`, ẩn/opt-in, ×3 tris): chia `CUP_SEGS+1` điểm/hàng, mép lệch `z=−cup·hw·u²` (về −Z) → **fold thật** lõm mặt trong; normal đạo hàm thật (`gain=2`). Cho cận cảnh khi đã dư budget (cắt diện cỏ bằng nền/nước).
   > Ngang thân 2 đỉnh ⇒ không cong được *hình* (2 điểm = đường thẳng); shader cong *ánh sáng*. Bật `cupGeo` mới thêm điểm để cong *hình*.
4. **Bụi cỏ + InstancedMesh**: `bladesPerClump=K` → gộp K lá (golden-angle, cao thấp deterministic) vào 1 geometry, **mặt trong quay VÀO TÂM** (+Z ngoài hướng ra), **nghiêng ngọn ra ngoài** (`clumpSplay`) để xòe + bớt đâm xuyên; rải **cụm** (count÷K) + xoay Y ngẫu → tổng lá ~giữ (**budget-neutral**). K=1 = lá đơn.
5. **2 mặt 2 màu + bóng gốc**: `mix(uColor×0.5, uColor, frontFacing)` → mặt **NGOÀI (+Z)** đầy, **TRONG (−Z)** tối ×0.5. Thêm **bóng gốc CHỈ mặt trong** (`uv.y`=t): đậm ×0.2 ở gốc → nhạt dần → tắt ở **1/6 thân** (`clamp(1−6t,0,1)·(1−frontFacing)`). `setColor` **LIVE** cả 2 mặt (DoubleSide).
6. **Đổ bóng (shadow map)**: `getMesh()` là InstancedMesh thường → **caller tự set cờ**. Ở **bãi** bật `receiveShadow=true` (nhà/rào/mái đổ bóng xuống bãi — xài lại sun shadow map, rẻ), **KHÔNG castShadow** (lá 6mm < 1 texel @19mm/texel của shadow cam ±20m → rớt/nhấp nháy; self-shadow đã có **bóng gốc** ở mục 5 lo, đúng cách industry). **Preview** (scene tí hon, shadow cam siết ~0.7mm/texel) bật cả `castShadow` → bóng sạch để soi hình khối khi tinh chỉnh.
7. **Vệt tiếp đất (ground contact, fake AO) — theo MẶT TRỜI**: thay cast-thật-ở-bãi (sub-texel) bằng **quad tối phẳng**, **1 vệt/LÁ** từ gốc → "cắm" cỏ xuống đất, hết trôi (cách industry cho foliage). InstancedMesh thứ 2 = **CON của mesh lá** (caller `add()` 1 lần là cả 2 vào scene). **Hướng + độ dài + ĐẬM = theo sun** (`setSun(x,y,z)` = vector tới mặt trời): vệt đổ **ngược phía sun**; sun lên **cao → NGẮN + ĐẬM** (sáng trực diện), sun **thấp → DÀI + NHẠT** (xiên, loãng). `len = cao_lá / tan(góc_cao)` (cap ×8); **đậm hiệu lực = `contactDark`(slider, base) × hệ-số-góc-cao** (`MIN 0.35 + 0.85·sin(góc cao)` → đỉnh ×1.2, chân trời ×0.35, clamp ≤1). **Mọi vệt song song → khớp hướng bóng nhà** (cùng nguồn sun). Geometry = **quad SUY BIẾN** (4 đỉnh ở gốc 0,0,0) → `instanceMatrix·0` = gốc lá; `positionNode = positionLocal.add(offset)` **nở** vệt từ `uv`+sun → **sun đổi chỉ cập nhật uniform, KHÔNG dựng lại**. ⚠️ **PHẢI `.add`, KHÔNG replace**: `positionNode = vec3(...)` (replace) chạy SAU `instancedMesh().append()` trong `NodeMaterial.setupPosition` → **ghi đè mất instanceMatrix** → mọi vệt dồn về gốc bãi (preview 1 instance vẫn trông ổn → giấu bug). Xem `known-issues/KI-002`. Đậm `contactDark` + rộng ngang `contactRadius` + hướng/dài `setSun` đều **LIVE**. Alpha = `contactDark·(1−dọc)·(1−|ngang|)` (gốc đậm→ngọn/mép nhạt). `contactDark=0` lúc tạo = không dựng mesh. Capacity `planned·k`, 2 tris/vệt. ⚠️ Hướng vệt = world (giả parent KHÔNG xoay — đúng cho archplan; lô xoay thì cần sun theo local). ⚠️ overdraw khi lá đơn density cao + vệt dài — hạ `contactDark` hoặc dùng bụi.

## Usage

```typescript
import { GrassBlades } from 'threejs-modules/components/GrassBlades'

const grass = new GrassBlades({ width: 12, depth: 9.6, baseY: 0.01, density: 100 })
scene.add(grass.getMesh())
// Live (uniform): grass.setColor(0x4f7a33)
// Structural (density/bladeHeight/bladeWidth/segments/taper) → tạo instance MỚI — đừng gọi mỗi frame
grass.dispose() // geometry + NodeMaterial + gỡ mesh
```

## Props

| Prop | Type | Default | Mô tả |
| ---- | ---- | ------- | ----- |
| `width` / `depth` | number | 12 / 9.6 | Vùng rải (m) — X / Z |
| `baseY` | number | 0.01 | Cao độ gốc lá (m) = mặt trên nền |
| `density` | number | 100 | Lá/m² |
| `maxBlades` | number | 24000 | Trần count (budget, accent-only) |
| `bladeHeight` | number | 0.28 | Cao lá (m) |
| `bladeWidth` / `midWidth` | number | 0.006 / 0.006 | Rộng **GỐC** (t=0) / **THÂN** (t=0.5) lá (m) |
| `segments` | number | 5 | Số đốt dọc (độ mịn) |
| `taper` | number | 0.7 | Thon ngọn 0..1 (0 = chữ nhật, 1 = nhọn đỉnh, mép ellipse từ thân lên) |
| `curveLR` | number | 0 | Cong trái→phải -1..1 (dời tâm X = `curveLR·H·t²`; 0 = thẳng) |
| `bend` | number | 0 | Cong dọc **0..1** (1 chiều): mặt ngoài +Z lồi ra (`bend·H·t²`); 0 = đứng |
| `cup` | number | 0 | Cụp **0..1** (1 chiều): mặt trong −Z lõm vào. Shader normal / geometry nếu `cupGeo` |
| `cupGeo` | boolean | false | BẬT **geometry fold** thật (trục giữa, ×3 tris, cận cảnh) thay shader normal. Mặc định ẩn/tắt |
| `cupNormalGain` | number | 4 | Độ nghiêng **normal** tạo cụp (shader mode); lớn = ăn sáng cụp gắt hơn (× với `cup`) |
| `bladesPerClump` | number | 1 | Số lá/**cụm** (bụi). 1 = lá đơn; >1 gộp K lá (rải cụm = mật độ÷K → **budget-neutral**) |
| `clumpRadius` | number | 0.04 | Bán kính xòe bụi (m) |
| `clumpSplay` | number | 0.45 | Nghiêng ngọn ra ngoài tâm bụi (rad ~26°) → xòe, bớt đâm xuyên |
| `color` | Color | 0x4f7a33 | Màu lá (1 màu — B0) |
| `shadowDark` | number | 0.2 | Bóng gốc mặt trong — nhân màu ở gốc (0=đen, 1=tắt). **LIVE** (`setShadowDark`) |
| `shadowSpan` | number | 1/6 | Bóng gốc vươn tới đâu (tỉ lệ thân lá). **LIVE** (`setShadowSpan`) |
| `contactDark` | number | 0.45 | Vệt tiếp đất dưới gốc lá — độ đậm alpha (0 = tắt, không dựng mesh). **LIVE** (`setContactDark`) |
| `contactRadius` | number | 0.07 | Bề rộng ngang vệt tiếp đất (m) — độ dài do `setSun` (góc nắng). **LIVE** (`setContactRadius`) |
| _(sun)_ | — | — | Hướng + độ dài vệt theo mặt trời qua **`setSun(x,y,z)`** (vector tới sun). Caller gọi khi sun đổi. Không persist (lấy từ scene) |
| `exclude` | `GrassExcludeRect[]` | `[]` | Rect (m, world XZ) cỏ **né** — lá rơi trong rect bị bỏ. Vd footprint foundation ("nơi có nhà thì không mọc cỏ"). `{cx,cz,halfW,halfD,rot}` |
| `heightAt` | `(x,z)=>number` | _(none)_ | 🏔️ Δy nền (m) tại (x,z) world (= grass-local) — gốc lá **+ vệt tiếp đất bám gò terrain**. Thiếu = nền phẳng. Sample ở **tâm cụm** (bụi ~4cm → bỏ qua chênh trong cụm) |

> **`exclude`** dùng buffer cấp theo `planned` rồi đặt `mesh.count` = số lá thực còn lại (≤ planned) — 1 draw, không tốn slot. `getCount()` trả số thực. Test rect đối xứng nên dấu xoay không ảnh hưởng với `rot ∈ {0,90,180,270}`.
>
> **`heightAt`** (cỏ bám gò) chỉ chạy lúc **rải** (build-time), KHÔNG per-frame → 0 cost runtime. Caller (site-kit) bơm closure `(x,z)=>heightAt(hf,x,z)` dùng **chung height-field với nền** ⇒ gốc lá ngồi khít mặt nền displaced. Đổi terrain → re-scatter (structural sig).

## Budget (luật tier-B — bắt buộc)

- **Instanced** ✅ · **accent-only** (count cap qua `maxBlades`) ✅ · **cặp tier-A** (GrassGround) ✅.
- ⚠️ **LOD-theo-camera = bước sau**: v1 cap count đủ an toàn cho **1 lô**. Bật **nhiều lô / city** PHẢI
  thêm distance-cull kẻo vỡ budget triangle.
- **Shader mode (mặc định): mỗi lá = `segments·2` tri** (strip 2 đỉnh) — cụp-shader + cong T→P/dọc đều **zero tris thêm**.
  Cap `maxBlades` (24k) ⇒ ≤ **240k tri** (vd 900 m² vẫn 240k). 1 draw call.
- **`cupGeo=true` (geometry fold): `segments·6` tri/lá (~×3)** → ~720k @ 900m² ⇒ **chỉ bật khi đã cắt diện cỏ** (nền/nước) hoặc cận cảnh ít lá.

## Dispose

```typescript
grass.dispose() // geometry.dispose + material.dispose + remove khỏi parent
```
