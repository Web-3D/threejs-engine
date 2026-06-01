/**
 * VỊ TRÍ   — building-kit/BuildingConfig.ts
 * VAI TRÒ  — TypeScript interfaces cho preset JSON (delta-only format)
 * LIÊN HỆ  — Dùng bởi Building.ts; preset JSONs nằm tại data/buildings/*.json
 *
 * Delta-only: preset chỉ ghi các giá trị khác với part defaults.
 * Building.ts merge: { ...partDefault, ...bodyDims, ...presetOverrides }
 */

// ── Dimensions ────────────────────────────────────────────────────────────────

export interface BuildingDims {
  /** Total body width (metres) */
  W: number
  /** Total body height — walls only, not counting roof (metres) */
  H: number
  /** Total body depth (metres) */
  D: number
  /** Number of floors — auto-synced into numFloors for structure + wall_reveal */
  floors: number
  /** Height per floor — auto-synced into floorH for window_strip */
  floorH: number
}

// ── Wall preset ───────────────────────────────────────────────────────────────

export type WallType = 'wall' | 'wall_reveal' | 'wall_panel'

export interface WallPreset {
  type: WallType
  /** WALL_COLORS index — for 'wall' type. Default: 0 */
  colorIndex?: number
  // wall_reveal
  revealH?: number
  showParapet?: boolean
  parapetH?: number
  parapetT?: number
  // wall_panel
  panelW?: number
  panelH?: number
  grooveW?: number
  frameIndex?: number
  glassIndex?: number
}

// ── Roof preset ───────────────────────────────────────────────────────────────

export type RoofType = 'gabled' | 'hip' | 'flat' | 'shed'

export interface RoofPreset {
  type: RoofType
  /** Overhang per side: roofW = dims.W + 2*overhang. Default: 0.6 (gabled/hip), 0.15 (flat) */
  overhang?: number
  colorIndex?: number
  // gabled + hip: ridge height
  ridgeH?: number
  // hip: ridge length (along depth axis). Default: dims.D * 0.4
  ridgeL?: number
  // flat
  roofT?: number
  showParapet?: boolean
  parapetH?: number
  parapetT?: number
  // shed: high side and low side heights above bodyH
  highH?: number
  lowH?: number
}

// ── Eave preset ───────────────────────────────────────────────────────────────

export interface EavePreset {
  enabled: boolean
  eaveT?: number
  eaveProjection?: number
  /** Y position of eave. Default: dims.H (top of wall) */
  yPos?: number
  colorIndex?: number
}

// ── Structure preset ──────────────────────────────────────────────────────────

export interface StructurePreset {
  enabled: boolean
  columnType?: number
  columnRadius?: number
  columnSide?: number
  foundationH?: number
  foundationOutset?: number
  floorBandH?: number
  floorBandOutset?: number
  showBeams?: boolean
  beamRadius?: number
}

// ── Opening entry ─────────────────────────────────────────────────────────────
// Array — one entry per opening instance (manual multi-floor placement)

export interface OpeningEntry {
  type: 'door_frame' | 'window_frame' | 'window_grid' | 'window_strip' | 'loading_door'
  /** X translation applied by Building.ts to the whole part group after creation.
   *  Use this to place multiple instances of the same part at different X positions. */
  xOffset?: number
  colorIndex?: number
  frameT?: number
  frameDepth?: number
  // door_frame
  doorW?: number
  doorH?: number
  panelIndex?: number
  // window_frame / window_grid
  yPos?: number
  winW?: number
  winH?: number
  mullionT?: number
  cols?: number
  rows?: number
  // window_strip (numFloors + floorH auto-synced from dims if not specified)
  numFloors?: number
  floorH?: number
  stripH?: number
  // loading_door
  trackCount?: number
}

// ── Attachment entry ──────────────────────────────────────────────────────────

export interface AttachmentEntry {
  type:
    | 'balcony_slab'
    | 'balcony_railing'
    | 'awning'
    | 'drain_pipe'
    | 'ac_unit'
    | 'meter_box'
    | 'antenna'
  /** X translation applied by Building.ts on top of part's own xPos. */
  xOffset?: number
  colorIndex?: number
  // balcony_slab / balcony_railing
  slabW?: number
  slabD?: number
  slabT?: number
  yPos?: number // slab Y position
  slabY?: number // railing: explicit slab Y (matches paired balcony_slab.yPos)
  railingH?: number
  postR?: number
  postCount?: number
  railT?: number
  // awning
  awningW?: number
  awningD?: number
  awningT?: number
  angle?: number
  // drain_pipe
  pipeR?: number
  xPos?: number
  bracketCount?: number
  // ac_unit
  unitW?: number
  unitH?: number
  unitD?: number
  grillSlats?: number
  // meter_box
  boxW?: number
  boxH?: number
  boxD?: number
  // antenna
  mastH?: number
  mastR?: number
  elementCount?: number
  elementL?: number
  elementR?: number
}

// ── BuildingPreset — root interface ───────────────────────────────────────────

export interface BuildingPreset {
  /** Human-readable identifier — used as filename stem */
  name: string
  /** Building type — maps to TOKENS entry for semantic metadata */
  type:
    | 'residential'
    | 'apartment'
    | 'mansion'
    | 'shop'
    | 'convenience'
    | 'office_low'
    | 'warehouse'
  dims: BuildingDims
  structure?: StructurePreset
  wall: WallPreset
  roof: RoofPreset
  eave?: EavePreset
  openings?: OpeningEntry[]
  attachments?: AttachmentEntry[]
}
