---
id: KI-003
title: Ghi đè `material.positionNode = vec3(...)` xoá instanceMatrix → mọi instance dồn về gốc
category: shader
severity: high
status: fixed
when: Override positionNode bằng giá trị TUYỆT ĐỐI (không dựa positionLocal) trên InstancedMesh + NodeMaterial (WebGPU/TSL)
where:
  - threejs-modules/components/GrassBlades/index.ts   # _buildContact (vệt tiếp đất)
  - node_modules/three/src/materials/nodes/NodeMaterial.js:718-728  # thứ tự instancedMesh().append() rồi positionNode.assign
discovered: 2026-06-04
fixed-in: "—"
related:
  - memory:positionnode-replace-drops-instancing
  - ki:KI-001
tags: [tsl, webgpu, instancedmesh, positionnode, instancematrix, contact-shadow, grass]
---

## 1. Lỗi gì (triệu chứng)

Vệt tiếp đất (InstancedMesh con của mesh lá) **hiện đúng trong preview nhưng "biến mất" trên bãi chính**.
Thực chất KHÔNG mất: mọi vệt của hàng nghìn instance **dồn chồng về gốc bãi** (1 cục tối ở tâm lô),
không nằm dưới từng lá → nhìn cả bãi như không có vệt. tsc/eslint/validate đều PASS (lỗi visual runtime).

## 2. Khi nào & Ở đâu

Trigger: material NodeMaterial (WebGPU) trên **InstancedMesh** mà `material.positionNode` được gán giá trị
**tuyệt đối** (vd `vec3(ox,0,oz)` dựng từ uv+uniform), KHÔNG dựa trên `positionLocal`.
Ở `GrassBlades._buildContact`. Bug "ẩn" suốt 3 phiên bản vệt (đĩa `positionLocal.mul`, lean, sun) vì
preview chỉ 1 instance ở ~gốc → kết quả ≈ đúng chỗ → che mất.

## 3. Tại sao (root cause — verified)

Đọc `NodeMaterial.setupPosition` (three 0.174) — thứ tự CỐ ĐỊNH:
1. dòng 718-722: `if (object.isInstancedMesh) instancedMesh(object).append()` → `InstanceNode` chạy
   `positionLocal.assign(instanceMatrixNode.mul(positionLocal))` (InstanceNode.js:163-164) → nhân instance.
2. dòng 724-728: `if (this.positionNode !== null) positionLocal.assign(this.positionNode...)` →
   **`assign` ĐÈ** lên positionLocal vừa-có-instance.

⇒ positionNode tuyệt đối **ghi đè sạch** kết quả instance ở bước 1 → mất tịnh tiến per-instance → mọi
instance vẽ tại cùng object-space → chồng về gốc. (Đã verify bằng đọc source 2 file, không đoán.)

## 4. Sửa như thế nào

Đừng ghi tuyệt đối — **cộng vào `positionLocal`** (đã mang instance ở thời điểm positionNode chạy):

```ts
// Geometry = quad SUY BIẾN: 4 đỉnh ở (0,0,0) → instanceMatrix·0 = gốc instance (tịnh tiến thuần)
// positionNode .add nở hình từ uv → GIỮ instance
material.positionNode = positionLocal.add(vec3(ox, 0, oz))   // ✅ ĐÚNG
// material.positionNode = vec3(ox, 0, oz)                    // ❌ SAI — mất instanceMatrix
```

Vì quad suy biến (mọi đỉnh ở gốc), `positionLocal` sau instance = đúng gốc instance; `.add(offset)` nở
hình ra từ uv. Pattern này = đúng ví dụ chính chủ `material.positionNode = positionLocal.add(displace)`
(NodeMaterial.js:241).

## 5. Phòng tái phạm

- **Trên InstancedMesh + NodeMaterial: positionNode PHẢI bắt đầu từ `positionLocal`** (`.add`/`.mul` nó),
  KHÔNG gán giá trị tuyệt đối — kẻo rớt instanceMatrix (và cả skin/morph/batch append trước đó).
- **Test instancing với ≥2 instance rải XA nhau**, đừng tin preview 1-instance (gốc ≈ 0 giấu lỗi này).
- Khi "preview đúng mà bãi/đám đông sai" → nghi ngay **per-instance transform bị bỏ** trong vertex node.
- Muốn thay HẲN hình (bỏ vertex gốc) → dùng **geometry suy biến đỉnh-ở-gốc** rồi `.add`, đừng replace.
