# Đáy hồ + mặt nước vừa phản chiếu vừa nhìn xuyên (reflect + refract)

> Trạng thái: **B ĐÃ LÀM** (2026-06-04) — `viewportSharedTexture` refraction + Fresnel-blend + basin (vách+sàn)
> + khoét lỗ nền (`Shape.holes`) + config depthY/bottomColor/tint + GUI. C vẫn deferred (NgQuan báo khi nâng).
> ⚠ **Basin visibility fix (2026-06-04):** basin merge từng trả null (trộn indexed/non-indexed) + nền backdrop
> editor `y=0` che basin dưới → đã fix (`toNonIndexed` + `_rebuildEditorGround` khoét lỗ backdrop). Xem `KI-004`.
> Liên hệ: `WaterSurface._buildColor` (reflect↔refract), `site/render/fromState` (buildBasin/lotShape/buildGround).
> CÒN deferred ở file này: **C (PBR transmission)** + **vision lòng-hồ-tương-tác** (contents/cá-rig) + **physics G/IOR**.

---

## Bối cảnh

`WaterSurface` hiện = **mặt phẳng phản chiếu** (reflector flat-mirror) + Fresnel `mix(reflection, waterColor_OPAQUE)`.
→ Nhìn thẳng xuống chỉ thấy `waterColor` đặc, KHÔNG thấy đáy. Không có đáy hồ thật.

Mục tiêu: (1) tạo **đáy hồ** (basin) + (2) mặt nước **vừa gương (grazing) vừa trong (nhìn thẳng → thấy đáy)** —
đúng vật lý nước thật: Fresnel blend reflection ↔ refraction.

Tất cả API dưới đã **verify có trong three 0.174** (2026-06-04).

---

## Phần 1 — Đáy hồ (basin)

**Vấn đề chính:** nền (ground slab) đặc sẽ CHE đáy. Phải khoét lỗ nền nơi có hồ.

- `THREE.Shape.holes` ✅ (verified `extras/core/Shape.js:57`) → **nền = ShapeGeometry(lô) trừ polygon hồ làm hole**
  → không có slab dưới hồ. Free polygon hole OK (tái dùng đúng `water.points[]` đã có — rect/free).
- **Basin = extrude polygon hồ xuống** (sàn đáy + vách quanh): `ExtrudeGeometry` hoặc tự dựng (floor ShapeGeometry ở
  `y = top − depth` + vách = các quad nối viền). Tái dùng `points[]`.
- Vật liệu đáy: liner đất/đá/gạch (MeshStandard hoặc procedural). Độ sâu hồ ~0.3–0.8m (config `water.depthY`).
- Rework: `buildGround` (fromState) → khi `water.enabled`, nền dùng ShapeGeometry-có-lỗ thay BoxGeometry phẳng.

## Phần 2 — Reflect + Refract (3 mức, cost tăng dần)

| Mức | Cách | API | Cost | Đáy gợn sóng? |
|---|---|---|---|---|
| **A. Trong suốt + Fresnel** | water `transparent`, `opacityNode = Fresnel` (grazing→đục/gương, thẳng→trong→thấy đáy) + depth-tint (sâu = đậm hơn, absorption) | có sẵn | **+0 RT** (ngoài reflector) | ❌ đáy thẳng |
| **B. Refraction màn hình** | sample framebuffer SAU nước + lệch theo normal sóng | `viewportSharedTexture()` ✅ (`ViewportSharedTextureNode.js`) | **+0 RT** (sample backbuffer; cần vẽ nước SAU opaque) | ✅ đáy gợn |
| **C. PBR transmission** | `MeshPhysicalNodeMaterial` transmission + IOR + roughness | ✅ (`PhysicalLightingModel.js`) | nặng hơn (transmission pass) | ✅ + tán xạ |

Reflection (reflector) đã có = **+1 render pass**. A/B KHÔNG thêm full pass; C nặng hơn.

## Đề xuất (minimal viable trước)

1. **Đáy:** nền Shape-holes + basin extrude (tái dùng `points[]`). Thêm config `depthY` + `bottomColor`/material.
2. **Nước:** **mức A trước** (trong suốt + Fresnel + depth-tint) — rẻ, thấy đáy ngay, gương vẫn nằm trên. Refactor
   `_buildColor`: đổi `mix(reflection, waterColor)` → reflection blend với cái-sau-nước qua `transparent`/opacity.
3. Nâng **B** (`viewportSharedTexture` + distortion theo normal) cho đáy gợn nếu thích — cùng pattern distortion đã
   dùng cho reflector uv.

## Bẫy / quyết định phải chốt khi làm

1. **Nền khoét lỗ** — rework `buildGround` sang ShapeGeometry-có-hole khi có hồ (free polygon OK). Cỏ đã né bbox; có thể né polygon thật sau.
2. **Thứ tự vẽ trong suốt** + reflector (reflector set `material.visible=false` lúc render reflection → vẫn ổn; basin LỌT vào reflection — đúng).
3. **Refactor `_buildColor`** — Fresnel hiện `mix(reflection, waterColor)`; đổi side waterColor → refraction/transparency.
4. **Absorption/độ sâu cảm nhận** — cần depth view (khoảng cách nước→đáy) hoặc falloff đơn giản.
5. **Cost** — reflector + (B) refraction = vẫn nặng tier-C khi có nhà; cân `resolution` + chỉ 1 hồ.
6. **Move/free-form** — basin + nền-lỗ phải **rebuild theo `points[]`** khi kéo đỉnh/đổi form (hiện chỉ mặt nước rebuild).

## B → C có phải rebuild? KHÔNG (verify 2026-06-04)

**Industry signal:** `Water2Mesh.js` (nước production của three) = **reflector + refractor + viewportSharedTexture**
= đúng **mức B**, KHÔNG dùng transmission. → B LÀ ĐÍCH cho nước, không phải trạm trung chuyển.
C (`MeshPhysicalNodeMaterial` transmission) sinh ra cho **kính SOLID** (ly/viên kính/cửa dày, có thickness thể tích) —
mặt nước phẳng lớn không hợp + nặng hơn mà lợi gần như không thấy (hồ nông; depth-tint của B fake đủ).

**Nếu vẫn muốn C:** chỉ **thay 1 lớp**, KHÔNG đập đi xây lại:
- GIỮ 100%: đáy (Shape-holes + basin), form tự do `points[]` + kéo đỉnh + Move, tích hợp site/render+GUI+dispose+class API,
  normal sóng `triNoise3D`, `setSun`, config.
- THAY ~20 dòng: `_buildColor` node-blend (reflector⊕refractor⊕fresnel) → set `transmission/ior/thickness/normalNode`
  cho `MeshPhysicalNodeMaterial`, để PhysicalLightingModel tự composite. Material đổi Basic→Physical, gọn TRONG WaterSurface.
- Mất: chỉ phần composite tay của B. Reflector node vẫn tái dùng được nếu muốn gương phẳng (PBR mặc định reflect bằng env/PMREM).

**Hệ quả thiết kế (làm sẵn từ A):** cô lập **composite = 1 method/material-builder swappable**; mọi thứ khác material-agnostic
→ A→B→(C) chỉ chạm 1 chỗ. Đúng cách `Water2Mesh` tổ chức.

## Vision dài hạn — lòng hồ = SUB-ENVIRONMENT tương tác (NgQuan, 2026-06-04)

Mục tiêu xa: lòng hồ KHÔNG phải "ảnh phẳng" mà là **thể tích thật, tương tác được như khu khác** —
thả thêm **vật trang trí** / **cá có rig + animation di chuyển** vào trong, nhìn xuyên mặt nước thấy.

- **Nền móng = B3 (basin thể tích thật)** + B1 (nước trong suốt/refraction) → ĐÃ đủ để mesh đặt trong basin
  hiện ra qua nước (refraction) + lọt vào reflection. Basin nên là **Group container** để chứa contents sau.
- **Contents system** (deferred): đặt/kéo vật trong basin (như site decor) + asset **cá rig** (GLTF skinned +
  AnimationMixer, đường bơi). Tái dùng Move-tool + pattern instanced. Cá = component riêng (`PondFish`?).
- **Physics riêng theo hồ (BÀN SAU — NgQuan sẽ báo):** mỗi hồ có **trọng lực G** + **độ khúc xạ (IOR)** riêng →
  vật/cá trong hồ rơi/bơi theo G của hồ, nước bẻ tia theo IOR. Đây là lúc cân nhắc **C (PBR transmission/IOR thật)**
  vì IOR vật lý khớp "đổi độ khúc xạ". → C revisit chính ở đây, không phải để "đẹp hơn B".

## Liên hệ

- [[material-roadmap]] — tier C kính/nước.
- Move-tool kéo đỉnh + form tự do: đã làm ở `WaterSurface` + `ArchPlanLab` (2026-06-04).
