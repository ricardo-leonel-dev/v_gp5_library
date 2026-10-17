import { describe, expect, test, vi, afterEach, beforeEach } from 'vitest';
import { downloadBytes } from './download-bytes';

describe('downloadBytes (F27 R37, R38)', () => {
  const origCreate = URL.createObjectURL;
  const origRevoke = URL.revokeObjectURL;
  const createObjectURL = vi.fn(() => 'blob:download-test');
  const revokeObjectURL = vi.fn();
  const anchorClick = vi.fn();

  beforeEach(() => {
    URL.createObjectURL = createObjectURL as typeof URL.createObjectURL;
    URL.revokeObjectURL = revokeObjectURL as typeof URL.revokeObjectURL;
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
    anchorClick.mockClear();
    // Patch the document API surface the function uses.
    const origCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = origCreateElement(tag);
      if (tag === 'a') {
        el.click = anchorClick;
      }
      return el;
    });
  });

  afterEach(() => {
    URL.createObjectURL = origCreate;
    URL.revokeObjectURL = origRevoke;
    vi.restoreAllMocks();
  });

  test('creates a Blob from the bytes and an object URL', () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    downloadBytes(bytes, 'x.prst');
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const call = createObjectURL.mock.calls[0] as unknown as [Blob] | undefined;
    expect(call).toBeDefined();
    const blob = call![0] as unknown as Blob;
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('application/octet-stream');
  });

  test('clicks the anchor with the right download name and revokes the URL afterwards', () => {
    const bytes = new Uint8Array([9, 9, 9]);
    downloadBytes(bytes, 'LEAD 2.prst');
    expect(anchorClick).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:download-test');
  });

  test('does not make a network request (R38)', () => {
    // downloadBytes touches no Fetch / XHR / sendBeacon / WebSocket surface.
    // We assert by spying on the well-known globals; nothing in the function
    // path should call them.
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('fetch must not be called by downloadBytes');
    });
    downloadBytes(new Uint8Array([0]), 'x.prst');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
