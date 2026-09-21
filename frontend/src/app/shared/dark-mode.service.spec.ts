import { describe, expect, test } from 'vitest';
import { resolveInitialDarkMode } from './dark-mode.service';

describe('resolveInitialDarkMode', () => {
  test('an explicit stored preference wins over the OS preference', () => {
    expect(resolveInitialDarkMode('dark', false)).toBe(true);
    expect(resolveInitialDarkMode('light', true)).toBe(false);
  });

  test('falls back to the OS preference when nothing is stored', () => {
    expect(resolveInitialDarkMode(null, true)).toBe(true);
    expect(resolveInitialDarkMode(null, false)).toBe(false);
  });
});
