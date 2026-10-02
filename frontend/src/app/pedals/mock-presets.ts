import type { Preset } from '../midi/preset';

// Mock presets for the v5 "Load test presets" button (R35). The fixtures
// exercise all 10 categories (AMP / CAB / EQ / RVB variants), all three
// stompbox knob counts (1, 3, 5), and at least one preset with an empty
// chain. The shape matches `Preset` so the data passes through the same
// `presets()` signal the real `readPresets()` populates.
//
// Module code coverage map (built from the GP5_HARDWARE_MODULE_CODES table):
//   0 NR   : cat0_fx1b
//   1 PRE  : cat0_fx0
//   2 DST  : cat3_fx0
//   3 N->S : catf_fx32 (user SnapTone sentinel, exercises the 5-knob count)
//   4 AMP  : cat7_fx1
//   5 CAB  : cata_fx1
//   6 EQ   : cat1_fx35
//   7 MOD  : cat4_fx0
//   8 DLY  : catb_fx0
//   9 RVB  : catc_fxb (4 knobs in 2×2)
export function loadMockPresets(): Preset[] {
  return [
    {
      slot: 0,
      name: 'Plaza Clean',
      chain: [
        { moduleType: 'cat1_fx35', enabled: true, parameters: {} },
        { moduleType: 'cat0_fx0', enabled: true, parameters: {} },
        { moduleType: 'cat4_fx0', enabled: true, parameters: {} },
        { moduleType: 'cata_fx1', enabled: true, parameters: {} },
      ],
    },
    {
      slot: 1,
      name: 'Crunch Deluxe',
      chain: [
        { moduleType: 'cat1_fx35', enabled: true, parameters: {} },
        { moduleType: 'cat0_fx0', enabled: true, parameters: {} },
        { moduleType: 'cat3_fx0', enabled: true, parameters: {} },
        { moduleType: 'cat7_fx1', enabled: true, parameters: {} },
        { moduleType: 'cata_fx1', enabled: true, parameters: {} },
        { moduleType: 'cat4_fx0', enabled: true, parameters: {} },
        { moduleType: 'catb_fx0', enabled: true, parameters: {} },
        { moduleType: 'catc_fxb', enabled: true, parameters: {} },
      ],
    },
    {
      slot: 2,
      name: 'Saturated Snap',
      chain: [
        { moduleType: 'cat0_fx1b', enabled: true, parameters: {} },
        { moduleType: 'cat0_fx0', enabled: true, parameters: {} },
        { moduleType: 'cat3_fx0', enabled: true, parameters: {} },
        { moduleType: 'catf_fx32', enabled: true, parameters: {} },
        { moduleType: 'cat7_fx1', enabled: true, parameters: {} },
        { moduleType: 'catb_fx0', enabled: true, parameters: {} },
      ],
    },
    {
      slot: 3,
      name: 'Wet Lead',
      chain: [
        { moduleType: 'cat1_fx35', enabled: true, parameters: {} },
        { moduleType: 'cat3_fx0', enabled: true, parameters: {} },
        { moduleType: 'cat4_fx0', enabled: true, parameters: {} },
        { moduleType: 'cata_fx1', enabled: true, parameters: {} },
        { moduleType: 'cat4_fx0', enabled: false, parameters: {} },
        { moduleType: 'catb_fx0', enabled: true, parameters: {} },
        { moduleType: 'catc_fxb', enabled: true, parameters: {} },
      ],
    },
    {
      slot: 4,
      name: 'Ambient Wash',
      chain: [
        { moduleType: 'cat1_fx35', enabled: true, parameters: {} },
        { moduleType: 'cat0_fx0', enabled: true, parameters: {} },
        { moduleType: 'cat4_fx0', enabled: true, parameters: {} },
        { moduleType: 'cata_fx1', enabled: true, parameters: {} },
        { moduleType: 'cat4_fx0', enabled: true, parameters: {} },
        { moduleType: 'catc_fxb', enabled: true, parameters: {} },
      ],
    },
    {
      slot: 5,
      name: 'Empty Slot',
      chain: [],
    },
  ];
}