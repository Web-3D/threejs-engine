# ops/ — thư viện OP kiểu Houdini SOP (hàm thuần, KHÔNG phải component)

> Kệ này khác `components/`: component = class hoàn chỉnh tự quản material/dispose (món đóng hộp);
> **op = hàm thuần túy** — vào dữ liệu + tham số → ra điểm/đỉnh/mesh, KHÔNG giữ GPU resource, KHÔNG biết
> scene/UI (dao thớt nguyên liệu). Caller tự dựng BufferGeometry/InstancedMesh và tự dispose.
> Asset mới = TỔ HỢP op cũ (mái đao = #1+#2+#3+#4+#5 chồng nhau) — đó là lý do tách kệ riêng.
>
> Nguồn gốc: nuôi trong `archplan/src/archplan/ops/` (Lab Mái), tách ra đây 2026-06-10 khi NgQuan chốt
> scale cho ban công/tường/cửa. Catalog chọn op kế: `Factory/deferred/houdini-algorithms.md`.

| Op | File | Làm gì | Hàm chính |
|---|---|---|---|
| #1 Resample | `resample.ts` | chia lại curve ĐỀU theo chiều dài thật (bảng arc-length + nghịch đảo) | `arcLength(fn)` · `resampleCurve(fn, n)` |
| #2 Sweep | `sweep.ts` | quét tiết diện 2D dọc spine, frame parallel-transport (không xoắn/lật), ramp scale/twist, caps | `sweepInto(pos, idx, spine, profile, opts)` · `rectProfile(w, h, anchorTop)` |
| #3 Copy to Points | `copy-to-points.ts` | 2 tầng: generator điểm trên mặt tham số (grid UV đều · rows đếm riêng hàng · cols song song nửa-bước) → instancer InstancedMesh | `gridOnSurface` · `rowsOnSurface` · `colsOnSurface` · `copyToPoints` |
| #4 Bevel-at-gen | `bevel.ts` | bo góc TIẾT DIỆN 2D trước sweep (polygon kín) + bo góc SPINE 3D (polyline hở — 2 thanh thành 1 thân liền gối cong) | `bevelProfile(profile, r, segs)` · `filletSpine(points, r, segs)` |
| #5 Scatter | `scatter.ts` | rải điểm random trên mesh (wrap MeshSurfaceSampler) + seed mulberry32 + minDist hash-grid + mask; trả SurfacePoint → instancer #3 dùng lại | `scatterOnMesh(geo, count, opts)` · `mulberry32(seed)` |

Quy ước chung:

- **Composable qua mảng chung**: op ghi vào `pos: number[]` / `idx: number[]` caller đưa (sweep) hoặc trả
  mảng điểm/`SurfacePoint` (generator) — gộp nhiều op vào 1 geometry không tốn merge.
- **`SurfacePoint`** (`copy-to-points.ts`) = giao diện điểm chung: `{pos, nrm, tanU, u, v, cw, ch}` —
  generator nào trả đúng shape này thì instancer + mọi consumer dùng được ngay (scatter là ví dụ).
- **Tham số dạng HÀM** (inset theo v, scale theo fraction, mask theo vị trí) thay vì hằng số — tư duy
  attribute-driven của Houdini, mask/ramp/noise điều khiển mọi thứ không cần op mới.
- Import từ app: `import { sweepInto } from 'threejs-modules/ops/sweep'` (archplan đã có alias + tsconfig paths).
