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

// F4 `save_preset_dialog`: the bytes the pedal returned for a slot, kept so
// the dialog can upload an exact byte-identical `.prst` file without ever
// re-encoding the body through the codec's best-effort `encodeBody`. Set
// only on presets returned by `WebMidiPedalConnection.readPresets()` — mocks
// never carry `raw` (they open the dialog in test mode, R22/R27/R93).
//
// Code outside `src/app/midi/` may only test its presence or pass it
// verbatim to `encodePrstFile` — no other file in `src/` interprets `.prst`
// offsets or slices bytes from `raw` itself.
export interface PresetRaw {
  /** 466-byte GP-5 body exactly as the pedal sent it (echo stripped). Never mutated. */
  readonly body: Uint8Array;
  /** The slot's 16-byte name record from the names reply, verbatim. Never mutated. */
  readonly nameField: Uint8Array;
}

export interface Preset {
  slot: number;
  name: string;
  chain: PresetSlot[];
  raw?: PresetRaw;
}