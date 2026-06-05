# Interior Decor Objects — hệ decor nội thất (object) trên mặt TRONG tường

> Status: **DECIDED, chưa build** (2026-06-05). Kiến trúc đã chốt với NgQuan; chỉ chờ build lượt sau (context tươi).
> Domain: building-kit structure + archplan GUI. Anh em: `DecorPanel` (panels[], mặt NGOÀI, relief) — KHÁC hệ này.

## Quyết định kiến trúc (NgQuan chọn 2026-06-05)
"Select decor bên trong tường nhà" = **hệ object MỚI** (KHÔNG mở rộng DecorPanel relief). Decor = vật thể 3D thật
đặt trên **mặt TRONG** tường (−Z local, ngược panels +Z): **Kệ / Tranh / Hốc tường (niche) / Đèn** — chọn từ thư viện preset.
(Đã cân nhắc: mở-rộng-DecorPanel-face-in, panel-relief-tối-giản → BỎ; chọn object system cho nội thất thật.)

## Plan dựng (mirror hệ Balcony — template tốt nhất)
1. **State** (`building/state.ts`): `interface DecorObject { type: 'shelf'|'picture'|'niche'|'lamp'; wallIdx; x(mm dọc tường); y(mm cao); w/h/depth; ... }`
   + `inst.structure.decor: DecorObject[]` (như `balconies[]`, gắn wallIdx). Factory `mkDecor(type)`. Parse tolerant `?? []` (KHÔNG bump schema, theo panels v3).
2. **Geometry** (`building/parts/` — file mới `DecorObject.ts` hoặc trong Structure): mỗi type 1 hàm `makePositioned<Type>` (box/group) — kệ=ván+2 đỡ, tranh=khung mỏng, hốc=box lõm (cắt vào tường?), đèn=trụ+chụp.
3. **Render** (`render/fromState.ts`): `buildDecor(inst, wallBase)` — như `buildBalconies`: lấy `computeWallConfigs`, đặt vật trên **mặt TRONG** (lz = −depth/2 thay vì +). pushPainted + pick box `{instId, key:'decor:<i>'}`.
4. **GUI** (`gui/sections.ts`): `buildDecorSubfolder` mirror `buildBalconySubfolder` — hàng tab "1 2 3 [+ type select]" + per-object folder (type/wall/x/y/size/remove).
5. **4 tương tác** (INTERACTIONS.md): Pick + Focus (`decor:<id>:<i>`) + Move (kéo dọc mặt tường trong — mở rộng `_dragOpen`/`_dragBal` pattern) + Paint (pushPainted). 

## MVP slice đầu (1 commit)
1 type **'shelf'** (ván + 2 đỡ) + state + render mặt trong + GUI add/list/remove (mirror balcony) — KHÔNG move (GUI x/y slider trước). Mở rộng type + Move sau.

## Liên hệ
- Template: `buildBalconySubfolder` (sections.ts), `buildBalconies`/`pushBalconyPick` (render/fromState.ts), `makePositionedBalcony` (parts/Structure.ts).
- Khác `DecorPanel` (panels[]): panel = relief mặt NGOÀI (đã có, GUI gỡ 2026-05-31). Object = nội thất mặt TRONG (hệ này).
