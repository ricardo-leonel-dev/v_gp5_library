// GP-5 module-slot vocabulary: turns the opaque hardware code that `Gp5SysexPresetCodec.decodeBody()`
// puts on every `PresetSlot.moduleType` (e.g. `"cat7_fx4"`) into a `{ category, fxTitle }` pair.
//
// HARDWARE-VERIFIED (feature 19). Decoding is an explicit per-code lookup, `GP5_HARDWARE_MODULE_CODES`,
// and every entry is backed by a real GP-5 read recorded in `gp5-hardware-captures.ts`. Feature 10's
// positional reading (`cat` = category index, `fxlow` = row index) was wrong: preset 0 shows `cat0_fx0` is
// PRE/COMP, `cat7_fx4` is AMP/Dark Twin and `cata_fx100000` is CAB/User IR. A code with no entry resolves
// raw; nothing falls back to the positional guess.
//
// What the T1 capture (Ricardo, 2026-09-29/30, preset 0) established:
//   - 1b, unsaved edits: a read shows the block as currently edited on the pedal, saved or not (AMP changed
//     to UK 800 without saving read back as [53,0,0,7]), provided the pedal is showing the preset being read.
//   - 1c, preset 0 baseline: chain shown as NR PRE DST N->S AMP CAB EQ MOD DLY RVB, REC_ORDER
//     [0,1,2,9,3,4,5,6,7,8]; block 0 is NR / Gate (`cat0_fx1b`).
//   - 1d, slot bytes: User IR slots 1-20 are [slot-1, 0, 16, 10] (20 codes, all captured; factory cabs are
//     [n, 0, 0, 10]). N->S factory SnapTones are [0..49, 0, 0, 15] in the pedal's list order; user SnapTone
//     slots start at [50, 0, 0, 15] (the one imported file seen, "B5150 3"). Empty user slots show "Empty"
//     ([51, 0, 0, 15] and [52, 0, 0, 15] captured). Ricardo chose not to map every empty user slot, so
//     uncaptured N->S codes (e.g. [53..63, 0, 0, 15]) stay absent and resolve raw. Whether an import can
//     overwrite a factory slot was not tested.
//   - 1e, reorder: moving RVB before MOD left all 10 REC_MODELS records unchanged and only changed REC_ORDER
//     (to [0,1,2,9,3,4,5,8,6,7]), so a code travels with its block and never depends on chain position.
//   - The `cat` byte is not the category (PRE uses 0 and 1, EQ uses 1, AMP uses 7 and 8), which is why this
//     is a table and not an arithmetic rule.
//   - The pedal lists every manual title, plus O-Trem, Sine Trem and Bias Trem in MOD, so
//     `GP5_UNCAPTURABLE_FX` is empty.
//
// `GP5_MODULE_CATEGORIES` and `GP5_MODULE_FX_TITLES` stay the canonical index space for `GP5_FX_CATALOG`,
// the FX browser and the `gp5Fx.c<c>.f<i>` i18n keys. Feature 10's indices never move; new titles are only
// appended (MOD tremolos, factory SnapTones, `User SnapTone`).

// --- Canonical categories -----------------------------------------------------------------------
// Order taken from external_docs/gp-5-manual.pdf p.40 (CC 48-57); it is an index space, not the `cat` byte.
export const GP5_MODULE_CATEGORIES: readonly string[] = [
  'NR', 'PRE', 'DST', 'N->S', 'AMP', 'CAB', 'EQ', 'MOD', 'DLY', 'RVB',
];

// --- Canonical FX titles -----------------------------------------------------------------------
// Source: external_docs/gp-5-manual.pdf pp.20-36 top-to-bottom (the pedal lists them in the same order),
// plus the titles appended by feature 19. The index is NOT the `fxlow` byte.
export const GP5_MODULE_FX_TITLES: readonly (readonly string[])[] = [
  // 0: NR — p.20
  ['Gate'],
  // 1: PRE — pp.20-21
  [
    'COMP',
    'COMP4',
    'Boost',
    'Micro Boost',
    'B-Boost',
    'Toucher',
    'Crier',
    'OCTA',
    'Pitch',
    'Detune',
  ],
  // 2: DST — pp.22-23
  [
    'Green OD',
    'Yellow OD',
    'Super OD',
    'SM Dist',
    'Plustortion',
    'La Charger',
    'Darktale',
    'Sora Fuzz',
    'Red Haze',
    'Bass OD',
  ],
  // 3: N->S — p.23 ('Empty'), then the factory SnapTones in the pedal's list order (manual pp.37-39
  // cross-check; spelled as the pedal shows them), then the generic entry for user-imported SnapTones.
  [
    'Empty',
    '14DST',
    'Force OCD',
    'Revolt DST',
    'SweetDrive',
    'FlagmanDST',
    'Foxy 30',
    'Twin RVB',
    'Match 30',
    'MessStar S',
    'MessJP CH1',
    'Rock2 CL',
    'Lany LH20',
    'SUPDual',
    'BJ3 CL',
    'UK BB CL',
    'BJ3 OD',
    'UK BB OD',
    'UK 410 OD',
    'Rock2 OD',
    'HW100',
    'Juice CR N',
    'Foxy 30JMI',
    'Bog DST',
    'CV XV',
    'MessJP CH2',
    'MessJP CH3',
    'UK 800',
    'UK SLP',
    'UK410 DST1',
    'UK410 DST2',
    'UK 900',
    'UK 2000',
    'UK DSL',
    'Dizz VH',
    'Mess TriV',
    'Mess TriM',
    'Mess 2C+',
    'Eagle Iron',
    'H&K BLK200',
    'JuiceCRMAX',
    'AGL DB BS',
    'AMPG 6 BS',
    'EB Faf BS',
    'HACK BS',
    'PV BS',
    'MATT BS',
    'H&K BS',
    'Juice ODBS',
    'AC SIM',
    'Piezo SIM',
    'User SnapTone',
  ],
  // 4: AMP — pp.24-30
  [
    'Tweedy',
    'Bellman 59N',
    'Dark Twin',
    'Foxy 30N',
    'J-120 CL',
    'Match CL',
    'L-Star CL',
    'UK 45',
    'UK 50JP',
    'UK 800',
    'Bellman 59B',
    'Foxy 30TB',
    'SUPDual OD',
    'Solo100 OD',
    'Z38 OD',
    'Bad-KT OD',
    'Juice R100',
    'Dizz VH',
    'Dizz VH+',
    'Eagle 120',
    'EV 51',
    'Solo100 LD',
    'Mess DualV',
    'Mess DualM',
    'Power LD',
    'Flagman+',
    'Bog RedV',
    'Classic Bass',
    'Foxy Bass',
    'Mess Bass',
    'AC Pre1',
    'AC Pre2',
  ],
  // 5: CAB — pp.30-31
  [
    'TWD CP 1x8',
    'Dark VIT 1x12',
    'Foxy 1x12',
    'L-Star 1x12',
    'Dark CS 2x12',
    'Dark Twin 2x12',
    'SUP Star 2x12',
    'J-120 2x12',
    'Foxy 2x12',
    'UK GRN 2x12',
    'UK GRN 4x12',
    'Bog 4x12',
    'Dizz 4x12',
    'EV 4x12',
    'Solo 4x12',
    'Mess 4x12',
    'Eagle 4x12',
    'Juice 4x12',
    'Bellman 2x12',
    'AMPG 4x10',
    'User IR 1-20',
  ],
  // 6: EQ — p.31
  ['Guitar EQ 1', 'Guitar EQ 2', 'Bass EQ 1', 'Bass EQ 2', 'Mess EQ'],
  // 7: MOD — p.32, plus the three p.33 tremolos the pedal lists after Vibrato
  [
    'A-Chorus',
    'B-Chorus',
    'Jet',
    'N-Jet',
    'O-Phase',
    'M-Vibe',
    'V-Roto',
    'Vibrato',
    'O-Trem',
    'Sine Trem',
    'Bias Trem',
  ],
  // 8: DLY — pp.33-34
  [
    'Pure',
    'Analog',
    'Slapback',
    'Sweet Echo',
    'Tape',
    'Tube',
    'Rev Echo',
    'Ring Echo',
    'Sweep Echo',
    'Ping Pong',
  ],
  // 9: RVB — pp.35-36
  [
    'Air',
    'Room',
    'Hall',
    'Church',
    'Plate L',
    'Plate',
    'Spring',
    'N-Star',
    'Deepsea',
    'Sweet Space',
  ],
];

// --- Hardware code -> canonical pair ------------------------------------------------------------
export interface CanonicalModuleIndices {
  readonly categoryIndex: number;
  readonly fxIndex: number;
}

function at(categoryIndex: number, fxIndex: number): CanonicalModuleIndices {
  return { categoryIndex, fxIndex };
}

// A literal, never derived at runtime from `gp5-hardware-captures.ts`: the specs cross-check the two
// (every entry needs a supporting capture row), which would be vacuous if one were computed from the other.
export const GP5_HARDWARE_MODULE_CODES: ReadonlyMap<string, CanonicalModuleIndices> = new Map<
  string,
  CanonicalModuleIndices
>([
  // NR
  ['cat0_fx1b', at(0, 0)], // NR / Gate
  // PRE
  ['cat0_fx0', at(1, 0)], // PRE / COMP
  ['cat0_fx1', at(1, 1)], // PRE / COMP4
  ['cat0_fx1a', at(1, 2)], // PRE / Boost
  ['cat0_fx14', at(1, 3)], // PRE / Micro Boost
  ['cat0_fxb', at(1, 4)], // PRE / B-Boost
  ['cat1_fxf', at(1, 5)], // PRE / Toucher
  ['cat1_fx15', at(1, 6)], // PRE / Crier
  ['cat1_fx21', at(1, 7)], // PRE / OCTA
  ['cat1_fx23', at(1, 8)], // PRE / Pitch
  ['cat1_fx29', at(1, 9)], // PRE / Detune
  // DST
  ['cat3_fx0', at(2, 0)], // DST / Green OD
  ['cat3_fx2', at(2, 1)], // DST / Yellow OD
  ['cat3_fx6', at(2, 2)], // DST / Super OD
  ['cat3_fx2a', at(2, 3)], // DST / SM Dist
  ['cat3_fx29', at(2, 4)], // DST / Plustortion
  ['cat3_fx30', at(2, 5)], // DST / La Charger
  ['cat3_fx2b', at(2, 6)], // DST / Darktale
  ['cat3_fx22', at(2, 7)], // DST / Sora Fuzz
  ['cat3_fx24', at(2, 8)], // DST / Red Haze
  ['cat3_fx40', at(2, 9)], // DST / Bass OD
  // N->S
  ['catf_fx33', at(3, 0)], // N->S / Empty
  ['catf_fx34', at(3, 0)], // N->S / Empty
  ['catf_fx0', at(3, 1)], // N->S / 14DST
  ['catf_fx1', at(3, 2)], // N->S / Force OCD
  ['catf_fx2', at(3, 3)], // N->S / Revolt DST
  ['catf_fx3', at(3, 4)], // N->S / SweetDrive
  ['catf_fx4', at(3, 5)], // N->S / FlagmanDST
  ['catf_fx5', at(3, 6)], // N->S / Foxy 30
  ['catf_fx6', at(3, 7)], // N->S / Twin RVB
  ['catf_fx7', at(3, 8)], // N->S / Match 30
  ['catf_fx8', at(3, 9)], // N->S / MessStar S
  ['catf_fx9', at(3, 10)], // N->S / MessJP CH1
  ['catf_fxa', at(3, 11)], // N->S / Rock2 CL
  ['catf_fxb', at(3, 12)], // N->S / Lany LH20
  ['catf_fxc', at(3, 13)], // N->S / SUPDual
  ['catf_fxd', at(3, 14)], // N->S / BJ3 CL
  ['catf_fxe', at(3, 15)], // N->S / UK BB CL
  ['catf_fxf', at(3, 16)], // N->S / BJ3 OD
  ['catf_fx10', at(3, 17)], // N->S / UK BB OD
  ['catf_fx11', at(3, 18)], // N->S / UK 410 OD
  ['catf_fx12', at(3, 19)], // N->S / Rock2 OD
  ['catf_fx13', at(3, 20)], // N->S / HW100
  ['catf_fx14', at(3, 21)], // N->S / Juice CR N
  ['catf_fx15', at(3, 22)], // N->S / Foxy 30JMI
  ['catf_fx16', at(3, 23)], // N->S / Bog DST
  ['catf_fx17', at(3, 24)], // N->S / CV XV
  ['catf_fx18', at(3, 25)], // N->S / MessJP CH2
  ['catf_fx19', at(3, 26)], // N->S / MessJP CH3
  ['catf_fx1a', at(3, 27)], // N->S / UK 800
  ['catf_fx1b', at(3, 28)], // N->S / UK SLP
  ['catf_fx1c', at(3, 29)], // N->S / UK410 DST1
  ['catf_fx1d', at(3, 30)], // N->S / UK410 DST2
  ['catf_fx1e', at(3, 31)], // N->S / UK 900
  ['catf_fx1f', at(3, 32)], // N->S / UK 2000
  ['catf_fx20', at(3, 33)], // N->S / UK DSL
  ['catf_fx21', at(3, 34)], // N->S / Dizz VH
  ['catf_fx22', at(3, 35)], // N->S / Mess TriV
  ['catf_fx23', at(3, 36)], // N->S / Mess TriM
  ['catf_fx24', at(3, 37)], // N->S / Mess 2C+
  ['catf_fx25', at(3, 38)], // N->S / Eagle Iron
  ['catf_fx26', at(3, 39)], // N->S / H&K BLK200
  ['catf_fx27', at(3, 40)], // N->S / JuiceCRMAX
  ['catf_fx28', at(3, 41)], // N->S / AGL DB BS
  ['catf_fx29', at(3, 42)], // N->S / AMPG 6 BS
  ['catf_fx2a', at(3, 43)], // N->S / EB Faf BS
  ['catf_fx2b', at(3, 44)], // N->S / HACK BS
  ['catf_fx2c', at(3, 45)], // N->S / PV BS
  ['catf_fx2d', at(3, 46)], // N->S / MATT BS
  ['catf_fx2e', at(3, 47)], // N->S / H&K BS
  ['catf_fx2f', at(3, 48)], // N->S / Juice ODBS
  ['catf_fx30', at(3, 49)], // N->S / AC SIM
  ['catf_fx31', at(3, 50)], // N->S / Piezo SIM
  ['catf_fx32', at(3, 51)], // N->S / User SnapTone
  // AMP
  ['cat7_fx1', at(4, 0)], // AMP / Tweedy
  ['cat7_fx3', at(4, 1)], // AMP / Bellman 59N
  ['cat7_fx4', at(4, 2)], // AMP / Dark Twin
  ['cat7_fx11', at(4, 3)], // AMP / Foxy 30N
  ['cat7_fx14', at(4, 4)], // AMP / J-120 CL
  ['cat7_fx15', at(4, 5)], // AMP / Match CL
  ['cat7_fx19', at(4, 6)], // AMP / L-Star CL
  ['cat7_fx2a', at(4, 7)], // AMP / UK 45
  ['cat7_fx2f', at(4, 8)], // AMP / UK 50JP
  ['cat7_fx35', at(4, 9)], // AMP / UK 800
  ['cat7_fx24', at(4, 10)], // AMP / Bellman 59B
  ['cat7_fx27', at(4, 11)], // AMP / Foxy 30TB
  ['cat7_fx28', at(4, 12)], // AMP / SUPDual OD
  ['cat7_fx47', at(4, 13)], // AMP / Solo100 OD
  ['cat7_fx49', at(4, 14)], // AMP / Z38 OD
  ['cat7_fx4b', at(4, 15)], // AMP / Bad-KT OD
  ['cat7_fx53', at(4, 16)], // AMP / Juice R100
  ['cat7_fx65', at(4, 17)], // AMP / Dizz VH
  ['cat7_fx6a', at(4, 18)], // AMP / Dizz VH+
  ['cat7_fx5f', at(4, 19)], // AMP / Eagle 120
  ['cat7_fx5a', at(4, 20)], // AMP / EV 51
  ['cat7_fx59', at(4, 21)], // AMP / Solo100 LD
  ['cat7_fx68', at(4, 22)], // AMP / Mess DualV
  ['cat7_fx69', at(4, 23)], // AMP / Mess DualM
  ['cat7_fx63', at(4, 24)], // AMP / Power LD
  ['cat7_fx5d', at(4, 25)], // AMP / Flagman+
  ['cat7_fx6d', at(4, 26)], // AMP / Bog RedV
  ['cat7_fx73', at(4, 27)], // AMP / Classic Bass
  ['cat7_fx75', at(4, 28)], // AMP / Foxy Bass
  ['cat7_fx77', at(4, 29)], // AMP / Mess Bass
  ['cat8_fx7a', at(4, 30)], // AMP / AC Pre1
  ['cat8_fx7b', at(4, 31)], // AMP / AC Pre2
  // CAB
  ['cata_fx1', at(5, 0)], // CAB / TWD CP 1x8
  ['cata_fx4', at(5, 1)], // CAB / Dark VIT 1x12
  ['cata_fx8', at(5, 2)], // CAB / Foxy 1x12
  ['cata_fx9', at(5, 3)], // CAB / L-Star 1x12
  ['cata_fx1b', at(5, 4)], // CAB / Dark CS 2x12
  ['cata_fx12', at(5, 5)], // CAB / Dark Twin 2x12
  ['cata_fx19', at(5, 6)], // CAB / SUP Star 2x12
  ['cata_fx11', at(5, 7)], // CAB / J-120 2x12
  ['cata_fxf', at(5, 8)], // CAB / Foxy 2x12
  ['cata_fx13', at(5, 9)], // CAB / UK GRN 2x12
  ['cata_fx22', at(5, 10)], // CAB / UK GRN 4x12
  ['cata_fx25', at(5, 11)], // CAB / Bog 4x12
  ['cata_fx2e', at(5, 12)], // CAB / Dizz 4x12
  ['cata_fx20', at(5, 13)], // CAB / EV 4x12
  ['cata_fx28', at(5, 14)], // CAB / Solo 4x12
  ['cata_fx24', at(5, 15)], // CAB / Mess 4x12
  ['cata_fx26', at(5, 16)], // CAB / Eagle 4x12
  ['cata_fx29', at(5, 17)], // CAB / Juice 4x12
  ['cata_fx16', at(5, 18)], // CAB / Bellman 2x12
  ['cata_fx38', at(5, 19)], // CAB / AMPG 4x10
  ['cata_fx100000', at(5, 20)], // CAB / User IR 1-20
  ['cata_fx100001', at(5, 20)], // CAB / User IR 1-20
  ['cata_fx100002', at(5, 20)], // CAB / User IR 1-20
  ['cata_fx100003', at(5, 20)], // CAB / User IR 1-20
  ['cata_fx100004', at(5, 20)], // CAB / User IR 1-20
  ['cata_fx100005', at(5, 20)], // CAB / User IR 1-20
  ['cata_fx100006', at(5, 20)], // CAB / User IR 1-20
  ['cata_fx100007', at(5, 20)], // CAB / User IR 1-20
  ['cata_fx100008', at(5, 20)], // CAB / User IR 1-20
  ['cata_fx100009', at(5, 20)], // CAB / User IR 1-20
  ['cata_fx10000a', at(5, 20)], // CAB / User IR 1-20
  ['cata_fx10000b', at(5, 20)], // CAB / User IR 1-20
  ['cata_fx10000c', at(5, 20)], // CAB / User IR 1-20
  ['cata_fx10000d', at(5, 20)], // CAB / User IR 1-20
  ['cata_fx10000e', at(5, 20)], // CAB / User IR 1-20
  ['cata_fx10000f', at(5, 20)], // CAB / User IR 1-20
  ['cata_fx100010', at(5, 20)], // CAB / User IR 1-20
  ['cata_fx100011', at(5, 20)], // CAB / User IR 1-20
  ['cata_fx100012', at(5, 20)], // CAB / User IR 1-20
  ['cata_fx100013', at(5, 20)], // CAB / User IR 1-20
  // EQ
  ['cat1_fx35', at(6, 0)], // EQ / Guitar EQ 1
  ['cat1_fx36', at(6, 1)], // EQ / Guitar EQ 2
  ['cat1_fx39', at(6, 2)], // EQ / Bass EQ 1
  ['cat1_fx3a', at(6, 3)], // EQ / Bass EQ 2
  ['cat1_fx3c', at(6, 4)], // EQ / Mess EQ
  // MOD
  ['cat4_fx0', at(7, 0)], // MOD / A-Chorus
  ['cat4_fx8', at(7, 1)], // MOD / B-Chorus
  ['cat4_fx11', at(7, 2)], // MOD / Jet
  ['cat4_fx13', at(7, 3)], // MOD / N-Jet
  ['cat4_fx19', at(7, 4)], // MOD / O-Phase
  ['cat4_fx1f', at(7, 5)], // MOD / M-Vibe
  ['cat4_fx15', at(7, 6)], // MOD / V-Roto
  ['cat4_fx17', at(7, 7)], // MOD / Vibrato
  ['cat4_fx21', at(7, 8)], // MOD / O-Trem
  ['cat4_fx26', at(7, 9)], // MOD / Sine Trem
  ['cat4_fx28', at(7, 10)], // MOD / Bias Trem
  // DLY
  ['catb_fx0', at(8, 0)], // DLY / Pure
  ['catb_fx1', at(8, 1)], // DLY / Analog
  ['catb_fx5', at(8, 2)], // DLY / Slapback
  ['catb_fxd', at(8, 3)], // DLY / Sweet Echo
  ['catb_fx2', at(8, 4)], // DLY / Tape
  ['catb_fxb', at(8, 5)], // DLY / Tube
  ['catb_fx13', at(8, 6)], // DLY / Rev Echo
  ['catb_fx9', at(8, 7)], // DLY / Ring Echo
  ['catb_fx6', at(8, 8)], // DLY / Sweep Echo
  ['catb_fx4', at(8, 9)], // DLY / Ping Pong
  // RVB
  ['catc_fxb', at(9, 0)], // RVB / Air
  ['catc_fx0', at(9, 1)], // RVB / Room
  ['catc_fx1', at(9, 2)], // RVB / Hall
  ['catc_fx2', at(9, 3)], // RVB / Church
  ['catc_fx10', at(9, 4)], // RVB / Plate L
  ['catc_fxf', at(9, 5)], // RVB / Plate
  ['catc_fx4', at(9, 6)], // RVB / Spring
  ['catc_fx6', at(9, 7)], // RVB / N-Star
  ['catc_fx7', at(9, 8)], // RVB / Deepsea
  ['catc_fx15', at(9, 9)], // RVB / Sweet Space
]);

// Canonical pairs the pedal does not offer, so no capture can back them. Empty: T1 found every title.
export const GP5_UNCAPTURABLE_FX: readonly (CanonicalModuleIndices & { readonly reason: string })[] = [];

// --- decodeModule ------------------------------------------------------------------------------------
// Discriminated-union result, mirroring `SysexDecodeResult` in `sysex-preset-codec.ts`.
//
// `slotNumber` + `displayTitle` are set for the CAB `[n, 0, 16, 10]` user-IR range and the N->S
// `[50+n, 0, 0, 15]` user-SnapTone range (feature 21). `fxTitle` stays the canonical index used
// for `GP5_FX_CATALOG` lookups and the FX browser; `displayTitle` is the English string the UI
// renders (templates translate it via the `chainBoard.userIrSlot` / `chainBoard.userSnapToneSlot`
// i18n keys when needed). For everything outside the user-slot ranges, `displayTitle` and
// `slotNumber` are undefined and the UI falls back to `fxTitle`.
export type ModuleDescription =
  | {
      kind: 'resolved';
      category: string;
      fxTitle: string;
      displayTitle?: string;
      slotNumber?: number;
    }
  | { kind: 'raw'; cat: number; fxlow: number };

// CAB user-IR slots: cat = 0xa, fxlow in [0x100000, 0x100013] → slots 1..20. The table carries
// all 20 entries (each mapped to fxIndex 20 / "User IR 1-20") and `decodeUserSlot` re-derives
// the 1-based slot number from `fxlow` so `slotNumber` is consistent with the `displayTitle`
// the chain board and detail panel render.
const CAB_USER_IR_CAT = 0xa;
const CAB_USER_IR_FXLOW_MIN = 0x100000;
const CAB_USER_IR_FXLOW_MAX = 0x100013;

// N->S user-SnapTone slots: cat = 0xf, fxlow in [0x32, 0x45] → slots 1..20. The table only
// carries the captured slot (`catf_fx32`, fxIndex 51 / "User SnapTone"); the other 19 codes
// resolve here via `decodeUserSlot` so all 20 user slots get a slot number, not just the one
// NAM'd file ("B5150 3") captured at feature 19.
const N_S_USER_SNAPTONE_CAT = 0xf;
const N_S_USER_SNAPTONE_FXLOW_MIN = 0x32;
const N_S_USER_SNAPTONE_FXLOW_MAX = 0x45;

interface UserSlotDescription {
  readonly category: string;
  readonly fxTitle: string;
  readonly displayTitle: string;
  readonly slotNumber: number;
}

function decodeUserSlot(cat: number, fxlow: number): UserSlotDescription | null {
  if (cat === CAB_USER_IR_CAT && fxlow >= CAB_USER_IR_FXLOW_MIN && fxlow <= CAB_USER_IR_FXLOW_MAX) {
    const slotNumber = fxlow - CAB_USER_IR_FXLOW_MIN + 1;
    return {
      category: 'CAB',
      fxTitle: 'User IR 1-20',
      displayTitle: `User IR ${slotNumber}`,
      slotNumber,
    };
  }
  if (
    cat === N_S_USER_SNAPTONE_CAT &&
    fxlow >= N_S_USER_SNAPTONE_FXLOW_MIN &&
    fxlow <= N_S_USER_SNAPTONE_FXLOW_MAX
  ) {
    const slotNumber = fxlow - N_S_USER_SNAPTONE_FXLOW_MIN + 1;
    return {
      category: 'N->S',
      fxTitle: 'User SnapTone',
      displayTitle: `User SnapTone ${slotNumber}`,
      slotNumber,
    };
  }
  return null;
}

export function decodeModule(cat: number, fxlow: number): ModuleDescription {
  const indices = GP5_HARDWARE_MODULE_CODES.get(`cat${cat.toString(16)}_fx${fxlow.toString(16)}`);
  if (indices) {
    const userSlot = decodeUserSlot(cat, fxlow);
    return {
      kind: 'resolved',
      category: GP5_MODULE_CATEGORIES[indices.categoryIndex],
      fxTitle: GP5_MODULE_FX_TITLES[indices.categoryIndex][indices.fxIndex],
      ...(userSlot ? { displayTitle: userSlot.displayTitle, slotNumber: userSlot.slotNumber } : {}),
    };
  }
  // Codes outside `GP5_HARDWARE_MODULE_CODES` but inside a user-slot range (e.g. uncaptured
  // N->S user-SnapTone slots) still resolve to the user-slot display so the UI can show the
  // slot number. Codes outside both fall through to the existing raw fallback.
  const userSlot = decodeUserSlot(cat, fxlow);
  if (userSlot) {
    return {
      kind: 'resolved',
      category: userSlot.category,
      fxTitle: userSlot.fxTitle,
      displayTitle: userSlot.displayTitle,
      slotNumber: userSlot.slotNumber,
    };
  }
  return { kind: 'raw', cat, fxlow };
}

// --- parseModuleType -----------------------------------------------------------------------------
// Matches exactly the string `Gp5SysexPresetCodec.decodeBody()` produces:
//   `cat${cat.toString(16)}_fx${fxlow.toString(16)}`
// The codec's `'empty'` sentinel fails the pattern and returns `null`.
export interface ParsedModuleType {
  cat: number;
  fxlow: number;
}

const MODULE_TYPE_PATTERN = /^cat([0-9a-f]+)_fx([0-9a-f]+)$/i;

export function parseModuleType(moduleType: string): ParsedModuleType | null {
  const match = MODULE_TYPE_PATTERN.exec(moduleType);
  if (!match) return null;
  return { cat: parseInt(match[1], 16), fxlow: parseInt(match[2], 16) };
}

// --- resolveModuleIndices ----------------------------------------------------------------------------
// The canonical `[categoryIndex][fxIndex]` for a hardware code, for callers that index
// `GP5_MODULE_FX_TITLES`/`GP5_FX_CATALOG`. Never index those tables with raw `parseModuleType` output.
// Parsing first normalizes upper-case hex to the codec's lower-case form.
export function resolveModuleIndices(moduleType: string): CanonicalModuleIndices | null {
  const parsed = parseModuleType(moduleType);
  if (!parsed) return null;
  const key = `cat${parsed.cat.toString(16)}_fx${parsed.fxlow.toString(16)}`;
  return GP5_HARDWARE_MODULE_CODES.get(key) ?? null;
}

// --- describeModuleType --------------------------------------------------------------------------
// `parseModuleType` + `decodeModule`. Both failure paths (unparseable string, or a code with no table
// entry) return the original string so callers need only one fallback branch. Resolved entries
// propagate `displayTitle` + `slotNumber` so user-slot codes (`cata_fx10000x`, `catf_fx3[2-9a-f]`)
// reach the UI with the right slot label without re-deriving it from `moduleType`.
export type DescribedModuleType =
  | {
      kind: 'resolved';
      category: string;
      fxTitle: string;
      displayTitle?: string;
      slotNumber?: number;
    }
  | { kind: 'raw'; moduleType: string };

export function describeModuleType(moduleType: string): DescribedModuleType {
  const parsed = parseModuleType(moduleType);
  if (!parsed) return { kind: 'raw', moduleType };
  const decoded = decodeModule(parsed.cat, parsed.fxlow);
  if (decoded.kind === 'raw') return { kind: 'raw', moduleType };
  return decoded;
}

// --- vocabulary status -----------------------------------------------------------------------------
export const GP5_MODULE_VOCABULARY_STATUS =
  'HARDWARE-VERIFIED — every hardware code in GP5_HARDWARE_MODULE_CODES is backed by a real GP-5 read ' +
  'recorded in src/app/midi/gp5-hardware-captures.ts (feature 19, captured 2026-09-28..30). ' +
  'Codes absent from the table resolve raw; there is no positional fallback.';
