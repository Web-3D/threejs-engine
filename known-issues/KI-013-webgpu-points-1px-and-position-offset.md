---
id: KI-013
title: THREE.Points trên WebGPU — point luôn 1px, pointUV WebGL-only, position-attr ≠ 0 văng hạt phủ kín màn hình
category: shader
domain: thac-nuoc
severity: high
status: fixed
when: Dựng particle bằng THREE.Points + PointsNodeMaterial trên WebGPURenderer, đặt spawn-pos vào attribute 'position' và/hoặc dùng pointUV
where:
  - threejs-modules/components/Waterfall/index.ts (mist/splash — đã chuyển InstancedMesh+Sprite)
  - threejs-modules/effects/GPUParticleSystem/index.ts (vẫn Points — "an toàn" vì position toàn 0, nhưng sizeNode KHÔNG ăn trên WebGPU → hạt 1px)
discovered: 2026-06-10
fixed-in: (commit Waterfall A2 fix — chờ `1)
related:
  - ki:KI-003
tags: [points, webgpu, particle, pointuv, sprite, instanced, fullscreen-wash]
---

## 1. Lỗi gì (triệu chứng)

Preview thác nước (Lab tab 🌊): **toàn viewport phủ 1 màn xanh-tím mờ**, cảnh tường/bể chỉ còn bóng ma
phía sau — "không thấy thác". Không crash, không lỗi đỏ chặn app (lỗi shader WGSL có thể flood console).

## 2. Khi nào & Ở đâu

Mist/splash của `Waterfall` dựng bằng `THREE.Points` + `PointsNodeMaterial`, geometry đặt **tọa độ spawn
vào attribute `position`** (≠ 0) + đốm tròn mềm bằng **`pointUV`**. Chạy trên WebGPURenderer (Lab preview).

## 3. Tại sao (root cause — verify đọc source three 0.174)

1. **`PointUVNode` = WebGL-only** — `generate()` emit chuỗi GLSL thô `gl_PointCoord` (xem
   `nodes/accessors/PointUVNode.js`, doc ghi rõ *"Can only be used with a WebGL backend"*). Trên WGSL = mã rác.
2. **WebGPU point primitive LUÔN 1px** (cùng doc) — `sizeNode` không phóng to point thật.
3. **Bug văng hạt (thủ phạm màn xanh):** `PointsNodeMaterial.setupVertex` lấy `positionGeometry.xy`
   (= attribute `position` THÔ) **nhân pointSize làm offset clip-space**. GPUParticleSystem để position
   toàn 0 → offset 0 (vô hại). Waterfall đặt spawn-pos ≠ 0 → mỗi hạt bị đẩy offset khổng lồ theo chính
   tọa độ của nó → ~300 hạt trây khắp màn hình, NormalBlending trắng-xanh chồng lớp = màn phủ mờ.

## 4. Sửa như thế nào

Đổi sang **InstancedMesh(PlaneGeometry 1×1) + SpriteNodeMaterial** (pattern chính chủ trong doc
SpriteNodeMaterial): `positionNode = instancedBufferAttribute(aSpawn).add(motion)` (tâm sprite
per-instance), `scaleNode` = cỡ MÉT, đốm tròn mềm = radial fade theo `uv()` quad (uv hợp lệ mọi backend),
`frustumCulled = false` (vị trí tính trong shader — bbox geometry vô nghĩa, cùng họ KI-003).

## 5. Phòng tái phạm

- **Particle trên WebGPU → mặc định InstancedMesh + SpriteNodeMaterial** (billboard quad). THREE.Points
  CHỈ chấp nhận khi hạt-1px-đủ (đốm additive li ti kiểu spark) VÀ attribute `position` toàn số 0.
- **`pointUV` cấm dùng** trong code WebGPU (WebGL-only — đọc doc node trước khi dùng node lạ).
- GPUParticleSystem/SparkSystem hiện "chạy được" trên WebGPU chỉ vì position=0 → hạt 1px; muốn hạt TO
  trên WebGPU phải port sang sprite-instanced (ghi chú khi tái dùng).
- Triệu chứng nhận diện nhanh: **màn mờ phủ kín viewport + cảnh thành bóng ma** = nghi hạt bị văng
  offset clip-space, check attribute `position` của hệ Points trước tiên.
