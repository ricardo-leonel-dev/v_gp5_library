/**
 * Abstraction over talking to the pedal, mirroring the backend's
 * StorageAdapter swap pattern. WebMidiPedalConnection is the only
 * implementation today; a future NativeCoreMidiPedalConnection (for a real
 * iOS app) or ElectronPedalConnection could implement the same interface.
 */
export interface PedalConnection {
  isSupported(): boolean;
  connect(): Promise<void>;
  readPresets(): Promise<unknown[]>;
  writePreset(preset: unknown): Promise<void>;
}
