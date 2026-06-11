# Mix MỌI VẬT THỂ — "bất cứ thứ gì trong drawer phải nhét nền mix được"

> NgQuan 2026-06-11: "tôi muốn bất cứ thứ gì đều cũng có thể nhét nền mix vào được hết, chỉ cần nó
> nằm trong menu drawer bên phải thì mọi vật đều phủ texture được."
> Validate: ĐÚNG hướng — mapping 'wall' stage 4.1 (cap → chiếu XZ) đã làm mix AN TOÀN trên mesh đa
> hướng bất kỳ → rào kỹ thuật chính đã hạ. Còn lại là đấu nối từng renderer + 2 BLOCKER giao kèo.

## Hiện trạng (8 đích đã mix)

G0 · zone surface · đáy hồ ('xz') · vách hồ ('uv') · fence ('wall') · tường building surface
('wall') · móng concrete ('wall') · sàn ('xz'). Hạ tầng dùng chung sẵn: `GroundMixParams` schema,
MixManager cache per-space + bucket resolver, target generic `{wallMix}`/`{flatMix}` (consumer mới
KHÔNG cần thêm nhánh Lab), khay 🧪 3 mode + hover ✨.

## Đích còn thiếu — audit + điểm cắm + ĐỢT

| Đích | Space | Điểm cắm | Đợt / Blocker |
|---|---|---|---|
| **Mái (roof)** | 'wall' (4.1 lo cả mặt nghiêng/cap) | pick-box ud `key:'roof'` SẴN (resolver đang return null) → +`structure.roofMix` + material hook parts/Roof | **Đợt 1** — chờ luồng joinery (building/*) chốt |
| **Cầu thang** | 'wall' | pick-box `key:'stairs'` SẴN → +`stairsMix` + hook parts | Đợt 1 |
| **Cột (columns)** | 'wall' | pick-box col? (check ud) → +`colMix` hoặc dùng chung structMix | Đợt 1 |
| **Ban công** | 'wall' (sàn+rail chung) | pick-box balcony + hook makePositionedBalcony | Đợt 1 |
| **Zone path** | 'xz' | `addKindZone` return sớm — builder viên riêng | **Đợt 2 — BLOCKER: site/render/fromState.ts đang trong luồng tách của NgQuan (giao kèo KHÔNG đụng)** |
| **Zone paving (BrickPaving)** | 'xz' phủ lên viên instanced | fromState + BrickPaving material | Đợt 2 — cùng blocker |
| **Zone wall (CurvedBrickWall)** | 'wall' | fromState + CurvedBrickWall | Đợt 2 — cùng blocker |
| **Coping/viền hồ** | 'xz' | `buildPoolEdge` (fromState) | Đợt 2 — cùng blocker |
| **Cổng (gate)** | 'wall' | fence gate builder | Đợt 2 |
| **Tường brick-3d/wood-3d/wood-strip** | 'wall' triplanar lên geometry thật | wallAssembly nhánh *-3d (đã chủ đích bỏ qua v1) | Đợt 3 — thử nghiệm: mix đè lên relief viên thật có đẹp không, hay phải bake uv |

## Cách làm chuẩn mỗi đích (checklist — theo 3 luật playbook ground §5 2026-06-11)

1. State: `+field mix?: GroundMixParams` (schema DÙNG CHUNG, parse backward-compat).
2. Render: callback `ctx.xxxMixMat(mix, range?)` → Lab delegate `_mix.matFor({wallMix})` /
   `wallMixMat(mix, range)` — mix THẮNG material thường, null fallback.
3. Bucket resolver: +nhánh trong `_selBuildingOf`/`_selSiteOf` (pick-box ud / userData tag) — nhớ
   `obj` cho hover ✨; `_collect*Mix` prune; targetOf dùng generic `{wallMix}`/`{flatMix}`.
4. KHÔNG quên: space đúng (cache per-space), cap 4.1 tự lo mặt ngang, polygonOffset nếu mesh
   chồng/coplanar với phần material khác (luật 3).

## Trigger

- Đợt 1: NgQuan báo luồng joinery/building chốt → làm roof+stairs+cột+ban công (1 buổi).
- Đợt 2: luồng tách fromState.ts chốt → path/paving/wall/coping/gate.
- Đợt 3: thử *-3d walls trên 1 tường mẫu trước khi quyết.
