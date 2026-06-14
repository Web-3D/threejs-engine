# tiled-lights-forward-plus — đèn nhiều (>16) bằng TiledLightsNode (forward+/clustered)

> User chốt 2026-06-15: **REVERT, hoãn**. Pool N=8 PointLight (editor, gán-gần-nhất, bật/tắt intensity)
> đang chạy tốt; ta CHƯA chạm 16 đèn → chưa cần. Đã thử ráp `TiledLighting` vào archplan → **crash addon**
> (xem dưới) → gỡ sạch.
> **Revisit khi:** Phase 2 building-lights (đèn hắt tường/cửa sổ/hiên × nhiều nhà) thực sự vượt ~16 real-light
> trên 1 cảnh. Lúc đó: hoặc dựng guarded-subclass (mục "Fix robust"), hoặc check three bản mới đã sửa addon.

---

## Vì sao tiled (industry signal)

Forward mặc định (`LightsNode`) tính MỌI đèn × MỌI fragment → vài chục PointLight = tụt fps + recompile.
Unreal/Unity/Godot dùng **clustered/forward+**: cull đèn theo tile/cluster màn hình. three 0.174 có sẵn
equivalent: `TiledLightsNode` (trần **1024** đèn, tile 32px) — phiên bản GPU của cái pool-cull-tay N=8 ta build.

## API đã verify (three 0.174, archplan/node_modules/three)

- Node: `examples/jsm/tsl/lighting/TiledLightsNode.js` — `class TiledLightsNode extends LightsNode`, ctor
  `(maxLights=1024, tileSize=32)`, export `tiledLights = nodeProxy(TiledLightsNode)`.
- Wrapper: `examples/jsm/lighting/TiledLighting.js` — `class TiledLighting extends Lighting` (from
  `three/webgpu`), `createNode(lights) → tiledLights().setLights(lights)`.
- Ráp = **1 dòng**: `renderer.lighting = new TiledLighting()`. PHẢI gán **trước** `renderer.init()` —
  `Renderer.init()` chụp `this.lighting` vào `new RenderLists(this.lighting)` (Renderer.js:774). Trong BaseWorld:
  set trong **constructor ArchPlanLab** (sau `super()`, trước `lab.init()` ở main.ts).
- **An toàn sun/shadow:** `TiledLightsNode.setLights` lọc `isPointLight` → tile; **else (DirectionalLight +
  shadow · Hemi · Ambient) → `super.setLights` = path forward cũ** → bóng sun NGUYÊN VẸN. Chỉ point-light bị tile.
- Type: `@types/three` có `Lighting`/`renderer.lighting:Lighting` nhưng addon `TiledLighting` KHÔNG có `.d.ts`
  → cần ambient `declare module 'three/examples/jsm/lighting/TiledLighting.js' { export class TiledLighting extends Lighting {} }`.

## 🐞 Bug chặn đường (lý do revert)

`TiledLightsNode.customCacheKey()` (TiledLightsNode.js:73) = `this._compute.getCacheKey() + super...`.
`_compute` chỉ tạo trong `create()` (gọi từ `updateProgram` → trong `updateBefore`/`setupLights`). NHƯNG
cache-key của RenderObject tính lúc **TẠO object** (RenderObject ctor → getDynamicCacheKey), **trước**
`updateBefore` của frame 1 → `_compute === null` → **`Cannot read properties of null (reading 'getCacheKey')`**.

- `_compute` là **per (scene, camera)** (Lighting.getNode cache theo cặp đó). Cảnh archplan có **nhiều camera
  render-lit**: reflector hồ nước (camera-gương) — vì thế `antialias:false` ở main.ts. Mỗi camera phụ tạo
  TiledLightsNode MỚI chưa-warm → crash lại.
- **Pre-warm 1 camera KHÔNG đủ** (chỉ cứu camera chính; reflector vẫn crash).

## Fix robust (cho lần revisit — CHƯA làm)

Guarded subclass (1 module chứa gọn, có comment giải thích bug):
```
class SafeTiledLightsNode extends TiledLightsNode {
  customCacheKey() {
    const c = this._compute ? this._compute.getCacheKey() : 0   // guard null mọi camera/frame-đầu
    return c + LightsNode.prototype.customCacheKey.call(this)    // gọi grandparent, KHÔNG gọi bản buggy
  }
}
class SafeTiledLighting extends Lighting { createNode(l=[]) { return new SafeTiledLightsNode(1024,32).setLights(l) } }
```
Cache-key đổi 1 lần sau khi `_compute` tạo (frame sau) → pipeline rebuild 1 lần/object, chấp nhận được, KHÔNG crash.
Bỏ pre-warm. Vẫn phải validate: compute-pass/frame chạy được trên backend máy (WARP-fallback có thể vỡ —
[[lag-check-chrome-gpu-first]]); reflector + shadow + resize.

## Liên hệ
- Pool hiện tại: `ArchPlanLab._lampPool` (N=8) + `threejs-modules/site/render/lamp.ts` — playbook `lighting.md` §6.
- Khi tiled lên: pool-cull-tay thành thừa (GPU tile lo budget) → mọi đèn enabled = PointLight thật; bỏ cap N=8.
