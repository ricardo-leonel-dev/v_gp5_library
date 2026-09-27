/**
 * One module slot in a GP-5 preset's signal chain. The module's identity, in
 * `moduleType`, is intentionally a free-form string: the GP-5's actual module
 * vocabulary (compressor, drive, amp, cab, EQ, delay, reverb, noise gate,
 * etc.) is unconfirmed — see specs/sysex_preset_read_write/design.md's
 * "Open question". Promote to a discriminated union once a real GP-5
 * vocabulary is mapped against hardware.
 */
export interface PresetSlot {
  moduleType: string;
  enabled: boolean;
  parameters: Record<string, number>;
}

export interface Preset {
  slot: number;
  name: string;
  chain: PresetSlot[];
}
