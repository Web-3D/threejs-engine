# Per-zone "vùi lấp" toggle (detail-normal riêng từng zone)

> **Trạng thái:** DEFERRED — NgQuan chốt hoãn (2026-06-08) vì **loang-lổ hình học** (drape) vừa làm đã cho
> cảm-giác "cát phủ lổ-đổ" → giá trị B mỏng, chồng lấn. Làm nếu cần bề-mặt-cát-mịn-sần TÁCH BIỆT với patches.

## Ý tưởng

Toggle per add-zone **"Vùi lấp" (sạch | vùi lấp)**: bật → zone material có **detail-normal micro-relief** (Phase 4,
`PhotoGround.detail`) = bề mặt sần/cát; tắt → patio sạch mịn. KHÁC loang-lổ (geometry 2-vật-liệu xen kẽ) — đây là
**vi-sần bề mặt trên 1 vật liệu** (shading, không đổi hình).

## Vướng kỹ thuật (lý do "nặng")

`detail` nằm trên material **dùng-chung-theo-KEY** (Lab `_groundMat` cache 1 PhotoGround/key, `_applyTerrainDetail`
đẩy detail GLOBAL). 2 zone cùng surface (vd "sand") **chia 1 material** → KHÔNG thể zone-này-sạch / zone-kia-sần.
⇒ phải **2 bản material/key** (detail=0 và detail>0). Đây là [[per-key-material-cache-tradeoff]].

## 4 bước (nếu làm)

1. State: `GroundLayer.vuilap?: boolean` + parse (backward-compat false). ~5 dòng.
2. **Lab (nặng):** cache PhotoGround "vùi-lấp" RIÊNG mỗi key (detail bật) song song `_groundMat` + inject
   `opts.groundMatByKeyVuilap` (hoặc map 2-tầng) + dispose ở teardown. ~25 dòng.
3. `fromState.ts` `resolveGroundMat`: zone chọn variant khi `layer.vuilap` (đọc opts variant). ~5 dòng.
4. GUI `buildAddZoneExtras`: `toggleRow('Vùi lấp', layer.vuilap, …)`. ~8 dòng.

## Honest / cân nhắc

- Giá trị MỎNG: detail-normal = sần cận cảnh (Phase 4 vốn đã "polish nhẹ"). Loang-lổ đã phủ phần "nhìn lổ-đổ".
- Công vừa (~50–60 dòng), 1 bước nặng (2-variant cache).
- Nếu muốn LÀM RẺ HƠN: chấp nhận detail GLOBAL (mọi zone cùng), bỏ per-zone → chỉ cần hiện slider Detail ở zone
  (showDetail=true) — nhưng KHÔNG đúng "per-zone toggle" user muốn.

## Liên hệ
- `threejs-modules/shaders/ground/PhotoGround` (`detail`/`setDetail` đã có từ Phase 4).
- `fromState.ts` `resolveGroundMat` · ArchPlanLab `_groundMat`/`_applyTerrainDetail`/`_siteTexOpts`.
- Liên quan: loang-lổ geometry (drape `loangLo`, `fromState.ts zoneSurfaces`) — đã làm, che phần lớn nhu cầu.
