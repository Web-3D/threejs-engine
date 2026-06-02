# GrassBlades

Cỏ **3D thật** (lá geometry nhú lên + đong đưa gió) — **tier B** (geometry/silhouette, material-roadmap).
Rút gọn kỹ thuật Ghost of Tsushima cho web/WebGPU. Cặp với [`GrassGround`](../../shaders/ground/GrassGround/)
(tier A) làm **lớp nền + LOD-xa**.

## Kỹ thuật

1. **1 lá** = strip thẳng (dựng theo mét); **silhouette ellipse thon 2 đầu** áp ở vertex shader `pow(sin(hf·π), taper)`.
2. **InstancedMesh** rải N lá (jitter-grid); mỗi lá xoay Y + tint random; **cao-thấp ngẫu nhiên** (`heightVar`).
3. **Vertex (TSL)**: ellipse → twist (ribbon quanh Y) → lean = cong tĩnh + gió (`bend ∝ (y/H)²`) + **ngả 1 chiều** (world).
4. **Phase per-lá từ world-XZ** (gust trôi) — bake `instancedBufferAttribute(vec4)` + vec2 (heightSeed, rotY).
5. **Màu 2 trục**: DỌC gốc→ngọn (`baseColor`→`tipColor`) + NGANG giữa→mép (`edgeColor`) + AO gốc + tint.
6. **Đổ bóng**: `receiveShadow` luôn bật (nhận bóng nhà); `castShadow` tùy chọn (nặng, lá mảnh răng cưa).

> Gió chạy bằng built-in `time` node (tự tăng) — **không cần** gọi update mỗi frame.
> Hình dáng/màu/gió/ngả/đổ-bóng đều **uniform → setter LIVE** (không dựng lại material).

## Usage

```typescript
import { GrassBlades } from 'threejs-modules/components/GrassBlades'

const grass = new GrassBlades({ width: 12, depth: 9.6, baseY: 0.01, density: 100 })
scene.add(grass.getMesh())
// Live (uniform — KHÔNG dựng lại): gió/màu/hình dáng tinh chỉnh tức thì
// grass.setWind(0.7); grass.setColors(0x39611f, 0x9bbb55, 0x2c4a1a)
// grass.setTaper(1.4); grass.setHeightVar(0.5); grass.setLean(0.6, Math.PI/2); grass.setCastShadow(true)
// Structural (density/bladeHeight/bladeWidth/segments) → tạo instance MỚI (recompile) — đừng gọi mỗi frame
grass.dispose() // geometry + NodeMaterial + gỡ mesh
```

## Props

| Prop | Type | Default | Mô tả |
| ---- | ---- | ------- | ----- |
| `width` / `depth` | number | 12 / 9.6 | Vùng rải (m) — X / Z |
| `baseY` | number | 0.01 | Cao độ gốc lá (m) = mặt trên nền |
| `density` | number | 100 | Lá/m² |
| `maxBlades` | number | 24000 | Trần count (budget, accent-only) |
| `bladeHeight` / `bladeWidth` | number | 0.28 / 0.024 | Kích thước lá (m) |
| `segments` | number | 4 | Segment dọc (cong mượt) |
| `baseColor`/`tipColor`/`edgeColor` | Color | 0x39611f/0x9bbb55/0x2c4a1a | Dọc gốc→ngọn + ngang mép |
| `wind` | number | 0.5 | Cường độ gió [0–1] |
| `windSpeed` | number | 1.6 | Tốc độ đong đưa |
| `curve` | number | 0.3 | Độ cong tĩnh — ngả ngọn cả khi lặng gió [0–1.5] |
| `twist` | number | 0.6 | Độ xoắn ribbon ngọn (rad) [0–1.5] |
| `taper` | number | 1.0 | Độ thon ellipse 2 đầu (mũ pow(sin)): 1=ellipse, >1=nhọn, <1=bầu [0.3–2.5] |
| `heightVar` | number | 0.35 | Độ random cao-thấp lá [0–1] |
| `leanAmt`/`leanAngle` | number | 0 / 0 | Ngả 1 chiều (cả bãi) + hướng (rad) |
| `castShadow` | boolean | false | Đổ bóng (nặng + lá mảnh răng cưa) |

> **Hình dáng/màu/gió/ngả/đổ-bóng đều uniform** → `setTaper/setCurve/setTwist/setHeightVar/setLean/setColors/setCastShadow`
> chỉnh **LIVE**, không dựng lại material. Geometry chỉ strip thẳng (rebuild khi đổi `bladeWidth/segments`).

## Budget (luật tier-B — bắt buộc)

- **Instanced** ✅ · **accent-only** (count cap qua `maxBlades`) ✅ · **cặp tier-A** (GrassGround) ✅.
- ⚠️ **LOD-theo-camera = bước sau**: v1 cap count đủ an toàn cho **1 lô**. Bật **nhiều lô / city** PHẢI
  thêm distance-cull (shrink/loại lá ngoài bán kính) kẻo vỡ budget triangle.
- Mặc định ~`density·area` ≤ `maxBlades` lá × (segments·2) tri. VD 12×9.6m, 100/m² ≈ 11.5k lá × 8 tri ≈ 92k tri.

## Dispose

```typescript
grass.dispose() // geometry.dispose + material.dispose + remove khỏi parent
```
