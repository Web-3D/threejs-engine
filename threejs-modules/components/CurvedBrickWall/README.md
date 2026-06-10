# CurvedBrickWall

Tường gạch **CONG** đứng tự do (tường vườn / rào trang trí): thân vữa cong theo **cung tròn** (radius + góc quét — 360° = vòng kín) + viên gạch **running-bond nhô cả 2 mặt** + **decay** tuổi tường (mất viên lộ vữa · thụt · xoay lệch · sạm). **3 draw** (thân + 2 lớp viên instanced). Deterministic theo `seed`.

> **Tổ hợp 4 op** — minh chứng "asset mới = op cũ chồng nhau": `resampleCurve` (#1, spine đốt đều) → `sweepInto` (#2, thân cong liền parallel-transport) → `rowsOnSurface` + `copyToPoints` (#3, viên đếm theo **chiều dài thật** từng hàng → cỡ đều tuyệt đối trên cung, stagger = bond) → `mulberry32` (#5, decay).

## Bộ ba gạch — phân vai

| Module | Tư thế | Lỗ / decay |
|---|---|---|
| `InstancedBrickWall` | tường THẲNG (building `brick-3d`) | lỗ cửa/sổ CULL viên · decay ✅ |
| `BrickPaving` | sân NẰM bond đều | decay ✅ |
| **`CurvedBrickWall`** | tường CONG tự do, 2 mặt | decay ✅ (2 mặt trùng chỗ = vết tróc thật) |

## Decay

Cùng triết lý 2 module kia: chuỗi rng rút **đủ 4 random/viên kể cả viên rụng** → kéo `decay` không xáo bố cục viên còn lại. Viên rụng **trùng chỗ cả 2 mặt** (cùng layout) — đúng vết tróc tường thật.

## Giới hạn hình học

Viên là **box thẳng** trên mặt cong — dây cung hở góc khi R nhỏ + viên dài: sagitta ≈ `L²/8R` (viên UK 0.215m trên R 1m ≈ 6mm < protrude 12mm — ổn). **R < 0.5m nên rút `brickL`**. Cửa/lỗ chưa có (deferred — cần cull theo cung như InstancedBrickWall làm với mặt phẳng).

## Usage

```typescript
import { CurvedBrickWall } from 'threejs-modules/components/CurvedBrickWall'

const wall = new CurvedBrickWall({ radius: 2, sweepDeg: 120, height: 1.1, decay: 0.3 })
scene.add(wall.getMesh()) // local: TÂM CUNG (0,0), chân y=0 — tự đặt position/rotation
// ...
wall.dispose()
```

Site-kit: zone `zoneKind: 'wall'` trong G-level (tab "Tường cong") — `fromState.addWallCurveMesh`.

## Props

Xem [`meta.json`](meta.json).
