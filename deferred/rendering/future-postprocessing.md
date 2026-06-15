# future-postprocessing — BloomPass · SSAOPass · MotionBlurPass

> Post-processing passes bổ sung cho `PostProcessing` module.
> Revisit khi: tích hợp scene thực tế và cần depth cue hoặc speed feel.

---

## BloomPass — quầng glow cho đèn (đèn dây / emissive / cửa sổ đêm)

**Mục đích:** Halo nở quanh vùng sáng rực (đèn dây F3, emissive, cửa sổ ban đêm) → "đèn thật" hơn.
Gác lại từ **Lighting Pattern Phase 1** (2026-06-15, NgQuan chốt "cắt bloom, defer").

**Category:** post-fx scene-wide | **Complexity:** trung bình (dựng pipeline) + **rủi ro phối hợp Factory** | **Pattern:** `THREE.PostProcessing` node

### Tại sao GÁC (không nhét vào phase đèn)
- **archplan CHƯA có post-pipeline** (grep `PostProcessing|bloom|outputNode` = 0) → bloom = dựng cả pipeline từ số 0, KHÔNG phải "thêm 1 fixture".
- **Đụng render-loop** = `main.ts`/BaseWorld (vùng **Factory** đang tối ưu) → nguy cơ clobber. Bloom **scene-wide** (mọi vật sáng quầng), perf **always-on** mỗi frame → ≠ triết lý "đèn fixture tách riêng".
- **Sai category** (classify-role): bloom = **post-fx environment**, KHÔNG thuộc `site/lighting/`. Trộn vào = phình sai chỗ.
- Đèn dây hiện dùng **emissive `MeshBasicMaterial toneMapped:false`** → đã tự glow nhìn được; bloom chỉ thêm halo (nice-to-have, không chặn F3).

### Hướng khi làm (WebGPU 0.174)
```typescript
// node bloom TSL — verify path trước: three/examples/jsm/tsl/display/BloomNode.js
import { bloom } from 'three/addons/tsl/display/BloomNode.js' // tên/đường dẫn CHƯA verify — grep trước
import { pass } from 'three/tsl'
const post = new THREE.PostProcessing(renderer)
const scenePass = pass(scene, camera)
post.outputNode = scenePass.add(bloom(scenePass, strength, radius, threshold))
// render loop: post.render() THAY renderer.render(scene, camera)
```
**Selective bloom** (chỉ đèn quầng, không cả cảnh): layer/emissive-threshold hoặc MRT emissive channel — quyết khi làm.

### Revisit khi
- Mở **"vòng môi trường"** (Gaea terrain + thời tiết) — cùng lúc dựng post-pipeline chung (bloom + fog + tone) một thể, phối hợp Factory về render-loop.
- Có cảnh đêm nhiều nguồn sáng (đèn dây + cửa sổ + bollard) đủ để thấy giá trị halo.
- Trade-off riêng TRƯỚC: scene-wide perf (mấy fullscreen pass) + ai sở hữu render-loop.

---

## SSAOPass

**Mục đích:** Screen Space Ambient Occlusion — shadows mềm trong góc tường, ngăn scene trông flat.

**Category:** `components/` | **Complexity:** low (tích hợp thôi) | **Pattern:** Add pass vào PostProcessing

### Tại sao chưa thêm ngay
Chưa có scene với geometry phức tạp đủ để thấy giá trị SSAO.  
SSAO chỉ rõ ràng khi: tường gặp sàn, góc hẹp, objects chồng lên nhau — không hiệu quả với scene trống.

### Three.js có sẵn SSAOPass

```typescript
// Verify path trước khi dùng — Three.js 0.174
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js'
// Hoặc WebGPU version (nếu có):
// import { GTAONode } from 'three/tsl'  ← cần verify tên chính xác
```

### Tích hợp vào PostProcessing module hiện tại

PostProcessing module hiện wrap `THREE.PostProcessing` (WebGPU renderer).  
SSAO cho WebGPU renderer dùng `GTAONode` (Ground Truth Ambient Occlusion):

```typescript
// WebGPU approach — cần verify API trong node_modules/three/src/nodes/
import { ao } from 'three/tsl'  // tên chưa verify — grep trước khi dùng

// WebGL approach (EffectComposer):
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js'
const ssaoPass = new SSAOPass(scene, camera, width, height)
ssaoPass.kernelRadius = 16
ssaoPass.minDistance  = 0.005
ssaoPass.maxDistance  = 0.1
composer.addPass(ssaoPass)
```

### Props cần expose
```typescript
interface SSAOOptions {
  kernelRadius: number    // sample radius (default: 16) — lớn hơn = softer nhưng tốn hơn
  minDistance:  number    // (default: 0.005) — clip artifacts gần camera
  maxDistance:  number    // (default: 0.1)  — clip artifacts xa
  output:       'Default' | 'SSAO' | 'Blur'  // debug mode
}
```

### Performance budget
| Setting | GPU Cost | Ghi chú |
|---|---|---|
| `kernelRadius: 8` | thấp | Phù hợp mobile |
| `kernelRadius: 32` | trung bình | Desktop default |
| `kernelRadius: 64` | cao | Chỉ high-end |

### Lưu ý
- SSAO cần depth buffer — `renderer.shadowMap.enabled` phải bật
- Kết quả bị blur để giảm noise → thêm `SSAOBlurPass` sau `SSAOPass`
- Pair tốt với `DayNightCycle`: giảm SSAO intensity ban ngày (ánh sáng mạnh), tăng ban đêm

### Revisit khi
- Scene có interior, alley, cave, hoặc objects stack lên nhau
- Performance headroom sau khi scene đầy đủ geometry

---

## MotionBlurPass

**Mục đích:** Per-object motion blur dựa trên velocity buffer — cảm giác tốc độ, cinematic quality.

**Category:** `components/` | **Complexity:** high | **Pattern:** Standalone pass hoặc tích hợp PostProcessing

### Tại sao chưa thêm ngay
- Cần velocity buffer (render scene 2 lần hoặc reconstruct từ matrix delta) — setup phức tạp
- Không có scene có object di chuyển nhanh đủ để thấy rõ
- Three.js không có sẵn `MotionBlurPass` trong jsm/postprocessing — phải tự viết

### Hai approach

**Approach A — Velocity buffer (chính xác, phức tạp)**
```typescript
// Render velocity: position_current - position_previous → texture
// Dùng trong pass sau để blur theo hướng velocity

// Vertex shader:
// vec4 currentPos  = projectionMatrix * modelViewMatrix * position
// vec4 previousPos = prevProjMatrix * prevModelViewMatrix * position
// vVelocity = (currentPos.xy / currentPos.w) - (previousPos.xy / previousPos.w)
```

**Approach B — Camera blur (đơn giản, chỉ cho camera motion)**
```typescript
// Accumulate multiple jittered samples từ frame trước
// Không phụ thuộc velocity buffer
// Dùng khi camera di chuyển nhanh (car game, flying)
```

**Approach C — TSL accumulation (WebGPU-native)**
```typescript
// Sample current frame N lần với jitter offset → average
// Three.js 0.174 WebGPU renderer có temporal accumulation node — cần verify
import { taa } from 'three/tsl'  // tên chưa verify
```

### Tích hợp dự kiến

```typescript
// Thêm vào PostProcessing module:
class PostProcessing {
  enableMotionBlur(opts: { samples: number; intensity: number }): void
  // Internally: thêm MotionBlurPass vào pipeline sau bloom
}
```

### Revisit khi
- Scene có racing, combat, fast projectile cần cinematic feel
- Xác định approach (A/B/C) dựa trên scene type trước khi code
- Nếu chỉ camera motion → Approach B đủ và implement trong 1 ngày
- Nếu cần per-object blur → Approach A, plan 2-3 ngày R&D
