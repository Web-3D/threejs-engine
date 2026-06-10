# BrickPaving

Sân lát gạch **bond đều** (running bond): nền vữa/cát mỏng + `InstancedMesh` viên block chữ nhật rải lưới **so le chừa khe** + **decay** tuổi sân (mất viên lộ nền · lún · xoay lệch · sạm màu). 1 sân = **2 draw** (nền + instanced). Deterministic theo `seed`.

> **Consumer op #3** đúng nghĩa: KHÔNG tự viết layout — `gridOnSurface` (stagger = bond) rải điểm, `copyToPoints` nhân bản viên (xoay lệch = mutate `tanU` per-điểm trước copy), `mulberry32` (#5) cho decay/màu. Anh em [`InstancedBrickWall`](../InstancedBrickWall/README.md) (tường **đứng**, khoét lỗ bằng CULL) — đây là bản **nằm** cho sân/lối đi.

## Phân vai với hàng xóm

| Module | Paradigm | Dùng khi |
|---|---|---|
| `StoneScatter` | đá RỜI Poisson, khe cỏ organic | lối đi stepping-stone, bãi đá |
| **`BrickPaving`** | viên CHỮ NHẬT lưới bond đều | sân gạch block, hè, patio |
| `InstancedBrickWall` | tường ĐỨNG running-bond + lỗ cửa | tường nhà brick-3d |

## Decay — 4 random/viên RÚT ĐỦ kể cả viên rụng

Chuỗi rng cố định theo thứ tự điểm: kéo `decay` lên/xuống **không xáo** bố cục viên còn lại — viên nào "số rụng" thì rụng, viên khác đứng yên. Mỗi viên: rụng (p = `decay`×0.35) · xoay lệch ±4° · lún ≤45% dày viên · sạm ≤35%.

## Usage

```typescript
import { BrickPaving } from 'threejs-modules/components/BrickPaving'

const pav = new BrickPaving({ frameW: 4, frameD: 3, decay: 0.3, seed: 7 })
scene.add(pav.getMesh()) // local: tâm (0,0), nền y≈0 — tự đặt position/rotation
// ...
pav.dispose()
```

Site-kit: zone `zoneKind: 'paving'` trong G-level (như `'path'` StoneScatter) — `fromState.addPavingMesh`.

## Props

Xem [`meta.json`](meta.json). Đáng chú ý: `bond` (0.5 = running, 0 = stack), `decay` (0..1), `material` ngoài (TexturedSurface triplanar — caller-owned, không dispose ở module).

## Hiệu năng

Build-time, không per-frame. Viên = box 12 tri; sân 4×3m viên 200×100 ≈ 580 viên ≈ 7k tri, 1 draw. Decay chỉ GIẢM viên.
