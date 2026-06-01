/**
 * VỊ TRÍ   — building-kit/tokens.ts
 * VAI TRÒ  — Shared constants + types cho toàn bộ building sub-system
 * LIÊN HỆ  — Import bởi tất cả parts/; Building.ts dùng TOKENS + WALL_COLORS
 */

import type * as THREE from 'three'

// ── Shared result type ────────────────────────────────────────────────────────
// Mọi part builder đều trả về cấu trúc này để Building.ts register vào geos/mats
// meshes: Object3D[] thay vì Mesh[] — wall_single/floor_assembler trả về Group
export interface PartResult {
  geos: THREE.BufferGeometry[]
  mats: THREE.Material[]
  meshes: THREE.Object3D[]
}

// ── Building dimension tokens (U = 1 meter) ───────────────────────────────────
// Source: Forge/data/library/building/residential_2story_jp.json
//         Forge/data/library/building/shop_1story_jp.json
//
// Quy ước chung:
//   roofW/roofD = bodyW/bodyD + overhang (mái đơn ~0.6m/bên, mái phẳng ~0.2m/bên)
//   roofH nhỏ (≤ 1.0) = mái phẳng / parapet — không render gabled roof cho loại này
//   bodyH = floors × 2.7m (trần 2.4m + sàn 0.3m — chuẩn Nhật)
export const TOKENS = {
  // ── Nhà ở / Residential ──────────────────────────────────────────────────

  residential: {
    bodyW: 7.0, // lô nhỏ Tokyo ~100m²
    bodyD: 6.5,
    bodyH: 5.4, // 2F × 2.7m
    roofW: 8.2, // overhang 0.6m mỗi bên
    roofD: 7.8,
    roofH: 2.4, // kirizuma (切妻) ~34% bodyW
  },

  // アパート — nhà trọ gỗ 3 tầng, lô hẹp khu ngoại ô Tokyo
  apartment: {
    bodyW: 5.5, // lô hẹp ~80m², phổ biến ở Suginami/Nerima
    bodyD: 7.5,
    bodyH: 8.1, // 3F × 2.7m
    roofW: 6.3, // overhang nhỏ hơn nhà ở — 0.4m/bên
    roofD: 8.3,
    roofH: 1.4, // mái thấp — irimoya nhẹ hoặc kirizuma phẳng
  },

  // マンション — chung cư RC trung tầng khu đô thị
  mansion: {
    bodyW: 12.0, // lô lớn, >200m²
    bodyD: 10.0,
    bodyH: 13.5, // 5F × 2.7m
    roofW: 12.4, // mái phẳng — overhang tối thiểu 0.2m
    roofD: 10.4,
    roofH: 0.6, // parapet thay vì mái dốc — roofH nhỏ = flat roof convention
  },

  // ── Thương mại / Commercial ──────────────────────────────────────────────

  shop: {
    bodyW: 6.0,
    bodyD: 6.0,
    bodyH: 3.2, // 1F thương mại
    roofW: 7.2,
    roofD: 7.2,
    roofH: 1.8,
  },

  // コンビニ — convenience store kiểu FamilyMart/7-Eleven
  convenience: {
    bodyW: 9.0, // front ~9m — bãi xe nhỏ trước mặt
    bodyD: 12.0, // sâu — sales floor + backroom + loading bay
    bodyH: 3.6, // ceiling cao hơn shop thường — ánh sáng huỳnh quang
    roofW: 9.4, // flat roof, overhang nhỏ cho awning riêng
    roofD: 12.4,
    roofH: 0.5, // flat — parapet convention
  },

  // ── Văn phòng / Office ───────────────────────────────────────────────────

  // 事務所 — văn phòng thấp tầng khu kinh doanh
  office_low: {
    bodyW: 9.0, // lô thương mại rộng hơn nhà ở
    bodyD: 8.0,
    bodyH: 10.8, // 4F × 2.7m
    roofW: 9.4, // mái phẳng — curtain wall kéo lên tận nóc
    roofD: 8.4,
    roofH: 0.7, // parapet — che HVAC equipment trên mái
  },

  // ── Công nghiệp / Industrial ─────────────────────────────────────────────

  // 倉庫 — kho/xưởng vùng ven, mái tole shed
  warehouse: {
    bodyW: 14.0, // wide span — không cột giữa
    bodyD: 20.0, // sâu — truck loading bên trong
    bodyH: 4.8, // ceiling cao 1F — forklift clearance
    roofW: 14.6,
    roofD: 20.6,
    roofH: 1.8, // shed roof nhẹ — một chiều dốc, không đối xứng
  },
} as const

export type BuildingType = keyof typeof TOKENS
export type Token = (typeof TOKENS)[BuildingType]

// BuildingToken — general numeric interface (không bị ràng buộc literal type của TOKENS).
// Dùng bởi Building.ts khi tạo token từ preset dims.
// Token (const literal) là subtype của BuildingToken → BuildingLab code không cần thay đổi.
export interface BuildingToken {
  bodyW: number
  bodyH: number
  bodyD: number
  roofW: number
  roofD: number
  roofH: number
}

// ── Color palettes ─────────────────────────────────────────────────────────────
// Convention: index 0 = màu "default" dùng khi seed = 0

// Tường nhà ở — sáng, ấm áp
export const WALL_COLORS = [
  0xe8e0d0, // trắng kem
  0xd1e0ed, // xanh nhạt
  0xedd5d5, // hồng nhạt
  0xd7ebde, // xanh mint
  0xede9c6, // vàng nhạt
  0xe0d7ed, // tím nhạt
  0xb86a4a, // nâu đỏ terracotta (gạch nung)
  0x8f4b39, // nâu đỏ đậm (gạch cũ)
] as const

// Tường chung cư / apartment — xám, trung tính, phong hóa nhẹ
export const APARTMENT_COLORS = [
  0xd4d0c8, // xám kem — bê tông cũ
  0xc8cdd4, // xám lạnh — RC mới hơn
  0xcfd4c8, // xám xanh lá nhạt
  0xd4cbc8, // xám hồng nhạt
  0xbec4c8, // xám đậm — bê tông phong hóa
] as const

// Tường văn phòng — trung tính hiện đại
export const OFFICE_WALL_COLORS = [
  0xe0e0e0, // trắng hiện đại
  0xc8d0d8, // xám xanh
  0xd8d8d0, // xám ấm
  0xd0c8c0, // beige nhạt
] as const

// Kính văn phòng / curtain wall — reflective facade
export const OFFICE_GLASS_COLORS = [
  0x2a3f5f, // xanh đen — kính tối kiểu Tokyo Midtown
  0x1a3a4a, // xanh teal tối
  0x3a3a4f, // xám xanh tối
  0x2f4535, // xanh rêu tối
] as const

// Tường kho/xưởng — kim loại, thô
export const WAREHOUSE_COLORS = [
  0x8a8c8e, // thép không gỉ nhạt
  0x7a7060, // nâu xám — tole gỉ nhẹ
  0x5c6a72, // xám xanh — tole mới
  0x8a7060, // nâu đất — gạch kho cũ
] as const

// Mái ngói — không thay đổi theo loại nhà
export const ROOF_COLOR = 0xb0a898 // xám ấm — ngói Nhật phong hóa

// Kính cửa sổ — dùng chung mọi loại nhà ở
export const WIN_COLOR = 0x3a5a7a // xanh đậm mờ

export const DOOR_COLORS = [
  0x4a2f1a, // gỗ tối
  0x2c3e50, // xanh navy đậm
  0x1a3a2f, // xanh rêu đậm
  0x5c3317, // nâu ấm
] as const

export const SIGN_COLORS = [
  0xe74c3c, // đỏ
  0x3498db, // xanh dương
  0x2ecc71, // xanh lá
  0xf39c12, // cam vàng
  0x9b59b6, // tím
  0xe91e63, // hồng đậm
] as const

// ── Part dimensions ────────────────────────────────────────────────────────────
// Đơn vị: meter. Source: Lab config JSONs đã verify bằng mắt.

// Nhà ở
export const WIN_DIM = { w: 1.2, h: 1.1, d: 0.15 } // cửa sổ nhà ở 2 tầng
export const DOOR_DIM = { w: 1.0, h: 2.0, d: 0.1 } // cửa ra vào

// Thương mại
export const SHOP_WIN_DIM = { w: 3.6, h: 1.6, d: 0.15 } // kính mặt tiền shop
export const SIGN_DIM = { w: 4.5, h: 0.8, d: 0.2 } // biển hiệu dọc mặt tiền
export const AWNING_DIM = { w: 8.0, h: 0.35, d: 1.4 } // mái hiên convenience store

// Chung cư / apartment
export const BALCONY_DIM = { w: 3.2, h: 1.0, d: 0.9 } // ban công — rộng 3.2m, sâu 0.9m
export const APARTMENT_WIN_DIM = { w: 1.0, h: 1.3, d: 0.12 } // cửa sổ nhỏ hơn nhà ở

// Văn phòng
export const OFFICE_WIN_STRIP = { w: 7.0, h: 0.9, d: 0.1 } // dải kính nằm ngang theo tầng
export const PARAPET_DIM = { h: 0.45, t: 0.18 } // gờ mái phẳng — h: cao, t: dày

// Kho/xưởng
export const LOADING_DOOR_DIM = { w: 3.5, h: 3.2, d: 0.15 } // cửa cuốn xe tải
