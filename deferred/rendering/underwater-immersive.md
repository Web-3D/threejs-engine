# Môi trường NGẬP NƯỚC nhập vai (B) — camera LẶN xuống dưới mặt nước

> Trạng thái: **DEFERRED 2026-06-11** (NgQuan: "làm A trước, B cho vào deferred — dù sao cũng cần môi
> trường RỘNG để làm B, đây chỉ thiết kế lô nhà"). Paradigm KHÁC hẳn A ([[water-bottom-refraction]]):
> A = nhìn TỪ BỜ xuống hồ (đã làm 2026-06-04); B = camera ĐI XUỐNG DƯỚI mặt nước (như lặn).
> **Revisit khi:** có môi trường nước RỘNG thật (hồ lớn / biển / đại dương) — KHÔNG hợp lô nhà 15×14m.

---

## A vs B — vì sao B là paradigm riêng, không phải "nâng cấp A"

| | A (đã làm) | B (deferred) |
|---|---|---|
| Vị trí camera | TRÊN bờ, luôn ở trên mặt nước | LẶN xuống, ở DƯỚI mặt nước |
| Mặt nước | chỉ cần mặt TRÊN (reflector mặt trên) | phải render từ MẶT DƯỚI (underside) — reflector hiện KHÔNG làm |
| Sương/màu nước | depth-tint CỤC BỘ (vật càng sâu càng mờ) | **fog volumetric BAO TRÙM toàn scene** — mọi vật ám màu nước |
| Scope | lô nhà (hồ koi/ao cảnh) | môi trường rộng (cần "đáy" mênh mông để lặn có nghĩa) |

→ Câu "chỉ nặng mặt nước, trong nước như trên bờ" của NgQuan **đúng cho A, SAI cho B**: ở B cả khung
cảnh nằm trong khối nước nên KHÔNG còn "như trên bờ" (fog toàn cục + ánh sáng đổi chất).

## Yêu cầu kỹ thuật B (khi revisit)

1. **Mặt nước 2 mặt (underside).** Nhìn từ dưới lên: total-internal-reflection + **Snell window** (vòng tròn
   sáng giữa, ngoài rìa thành gương) — đặc trưng "nhìn lên từ dưới nước". Reflector hiện chỉ mặt trên → cần
   material 2-mặt riêng hoặc shader tự dựng.
2. **Fog dưới nước toàn cục** = `scene.fogNode` / exponential depth fog màu xanh-lục, dày theo khoảng cách →
   vật xa tan vào nước. Khác depth-tint A (chỉ áp lên vật DƯỚI mặt nước nhìn từ trên).
3. **God rays / light shafts** = volumetric (screen-space radial blur từ mặt trời, HOẶC billboard quạt sáng). Đắt.
4. **Caustics** trên mọi bề mặt (đáy + vật) = animated projector texture HOẶC procedural — không chỉ đáy hồ.
5. **Hạt lơ lửng** (suspended particles + bọt khí nổi lên) = instanced billboard, reuse GPUParticleSystem.
6. **Distortion toàn màn** (heat-haze kiểu nước) = post-process refraction ripple.

## Vì sao gác (Industry signal)

- B = thể loại "underwater scene" (Subnautica/Abzû/AC4 phần lặn) — cần **world-scale** để chi tiêu render
  (fog/godray/caustics) có chỗ phát huy. Lô 15×14m + hồ koi 2×3m không đủ chiều sâu để "lặn".
- Trùng phụ thuộc vòng MÔI TRƯỜNG: cần TerrainRing/heightmap rộng + đáy nước mở → đi SAU E-series
  ([[terrain-gaea-heightmap]]). Lúc đó "đáy biển" = heightmap như đất, vật đặt xuống reuse pipeline cạn.
- Reuse được khi tới: pattern fog/particle/post-process; basin Group container của A thành "đáy" của B.

## Liên hệ
- [[water-bottom-refraction]] — A (đã làm): đáy basin + reflect/refract nhìn từ bờ. B kế thừa basin-as-container.
- [[terrain-gaea-heightmap]] — môi trường rộng; đáy nước B = 1 biến thể heightmap.
- [[future-postprocessing]] — godray/distortion = post-process pass.
