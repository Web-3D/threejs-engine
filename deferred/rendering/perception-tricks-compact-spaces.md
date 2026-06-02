# Perception Tricks — Không gian nhỏ thấy rộng

> Cố tình dùng "lời nói dối phối cảnh" để phòng/không gian **nhỏ** (rẻ, ít tri, dễ occlude) **cảm giác rộng** cho gameplay.
> Nguồn: thảo luận 2026-06-02, đối chiếu bài Stan Allen / John Hejduk — "phối cảnh là dối trá".

---

## Nguyên lý nền

Kiến trúc sư cần **SỰ THẬT** (công trình sẽ được XÂY) → dùng ortho 90° để lộ sai lệch đặc-rỗng.
Game cần **TRẢI NGHIỆM** (không gian chỉ cần được NHÌN) → lời nói dối phối cảnh chính là **vật liệu**.

→ Tách 2 pha, dùng cả hai:
- **Authoring (thiết kế layout):** ortho/top-down → footprint thật, navigable, không tự lừa lúc dựng level.
- **Experience (camera player):** perspective + tricks → fake rộng.

"Thiết kế bằng sự thật, trình bày bằng lời nói dối."

---

## Toolkit — làm nhỏ thấy rộng

| Kỹ thuật | Cơ chế | Module map | Rẻ? |
|---|---|---|---|
| Forced perspective geometry | Vật ở xa nhỏ hơn tỉ lệ thật → kéo dài chiều sâu giả | (geometry tay) | ✅ |
| Vista / sightline | Cho thấy XUYÊN qua phòng nhỏ ra không gian lớn (cửa sổ ra núi) → mắt đọc scale từ cảnh xa | level design | ✅ |
| Verticality | Trần cao → footprint nhỏ vẫn hoành tráng | (geometry) | ✅ rất rẻ |
| Atmospheric perspective | Fog/haze làm vật xa mờ dần → đọc thành "có chiều sâu" | fog uniform / DayNightCycle | ✅ |
| Detail layering | Foreground / mid / background chồng lớp → đọc thành rộng (phòng trống = thấy nhỏ) | scene comp | ✅ |
| **InteriorMapping** | Giả phòng SÂU trên 1 mặt phẳng (parallax) | **ĐÃ CÓ module** | ✅ rẻ nhất |
| Skybox / impostor backdrop | Cảnh xa vẽ phẳng → khung không gian lớn | skybox | ✅ |

---

## Cảnh báo FOV — KHÔNG dùng làm đòn bẩy chính

Phản xạ "FOV rộng để fake rộng" là cách **thô nhất**, 2 vấn đề:
1. **Méo + khó chịu** — fisheye, tường cong, say chuyển động, player phán đoán sai khoảng cách (đụng tường, hụt nhảy).
2. **Phản tác dụng perf** — FOV rộng = frustum TO hơn = **NHIỀU vật lọt khung = render NHIỀU hơn**, không phải ít. "Phòng nhỏ + FOV rộng để tiết kiệm" tự đá nhau.

→ Để FOV mức **dễ chịu** (TPS ~60-70°, FPS ~90°), coi như gia vị, không phải món chính.

---

## Performance đúng cách

Phòng nhỏ tiết kiệm THẬT — nhưng nhờ **ít geometry + occlusion culling + portal** (tường chặn view → cull phòng sau), **KHÔNG** nhờ FOV. Tối ưu nằm ở budget tri + draw call, perception trick lo phần "thấy rộng".

---

## Advanced — perception = gameplay (scope lớn, để xa)

Dòng game lấy ảo giác phối cảnh làm **cơ chế chơi**: Superliminal (kích thước = khoảng cách cảm nhận), Antichamber, Manifold Garden, VR Tea for God (impossible space — phòng to hơn ở bên trong). Đỉnh cao của tư duy ngược này. Cần engine hỗ trợ portal / non-Euclidean → lift lớn.

---

## Revisit khi

- Dựng **interior thật** trong World (nhà Doraemon, lớp học) mà muốn cảm giác rộng nhưng giữ budget.
- Làm **camera system** (chốt FOV chuẩn cho TPS/FPS).
- Cần khu phố/phòng "thoáng" mà không phình geometry.
- Liên hệ: InteriorMapping module, occlusion/portal (chưa có), `neighborhood-block-assembly-lod.md` (LOD khu phố).
