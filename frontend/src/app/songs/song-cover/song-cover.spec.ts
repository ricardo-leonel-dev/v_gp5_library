import { describe, expect, test, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideTransloco, type Translation, type TranslocoLoader } from '@jsverse/transloco';
import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { SongCover } from './song-cover';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
class StubTranslocoLoader implements TranslocoLoader {
  getTranslation(_lang: string): Observable<Translation> {
    return of({
      songs: { cover_alt: 'Cover of {{name}}' },
    } as Translation);
  }
}

function setup(): HttpTestingController {
  TestBed.configureTestingModule({
    imports: [SongCover],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideTransloco({
        config: { availableLangs: ['es'], defaultLang: 'es', fallbackLang: 'es' },
        loader: StubTranslocoLoader,
      }),
    ],
  });
  return TestBed.inject(HttpTestingController);
}

describe('SongCover (F26 R13, R14, R15, R16, R17, R35, R36, R19)', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  test('hasCover undefined → exactly one GET /songs/:id/files/cover with responseType blob (R13)', async () => {
    const httpMock = setup();
    const fixture = TestBed.createComponent(SongCover);
    fixture.componentRef.setInput('songId', 'song-7');
    fixture.componentRef.setInput('songName', 'Lead Tones');
    fixture.componentRef.setInput('hasCover', undefined);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const req = httpMock.expectOne(
      `${environment.apiBaseUrl}/songs/song-7/files/cover`,
    );
    expect(req.request.responseType).toBe('blob');
    req.flush(new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47]) as BlobPart], { type: 'image/png' }));
    await fixture.whenStable();
    await Promise.resolve();
    fixture.detectChanges();
    expect(fixture.componentInstance.state()).toBe('loaded');
    httpMock.verify();
  });

  test('R14 — while the request is pending, the cover element carries data-cover-state="loading"', async () => {
    const httpMock = setup();
    const fixture = TestBed.createComponent(SongCover);
    fixture.componentRef.setInput('songId', 'song-7');
    fixture.componentRef.setInput('songName', 'Lead Tones');
    fixture.componentRef.setInput('hasCover', undefined);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="song-cover"]')?.getAttribute('data-cover-state')).toBe(
      'loading',
    );
    httpMock.expectOne(`${environment.apiBaseUrl}/songs/song-7/files/cover`).flush(
      new Blob([new Uint8Array([1]) as BlobPart], { type: 'image/png' }),
    );
    await fixture.whenStable();
  });

  test('R15 — a 200 response renders an <img> with object URL and songs.cover_alt alt', async () => {
    const httpMock = setup();
    const fixture = TestBed.createComponent(SongCover);
    fixture.componentRef.setInput('songId', 'song-7');
    fixture.componentRef.setInput('songName', 'Lead Tones');
    fixture.componentRef.setInput('hasCover', undefined);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiBaseUrl}/songs/song-7/files/cover`).flush(
      new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47]) as BlobPart], { type: 'image/png' }),
    );
    await fixture.whenStable();
    await Promise.resolve();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const img = root.querySelector<HTMLImageElement>('[data-testid="song-cover-image"]');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('alt')).toBe('Cover of Lead Tones');
    expect(img?.src.startsWith('blob:')).toBe(true);
  });

  test('R16 — a 404 response moves state to "none" and the placeholder SVG renders', async () => {
    const httpMock = setup();
    const fixture = TestBed.createComponent(SongCover);
    fixture.componentRef.setInput('songId', 'no-cover-song');
    fixture.componentRef.setInput('songName', 'No Cover');
    fixture.componentRef.setInput('hasCover', undefined);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiBaseUrl}/songs/no-cover-song/files/cover`).flush(
      new Blob(['not found'], { type: 'text/plain' }),
      { status: 404, statusText: 'Not Found' },
    );
    await fixture.whenStable();
    await Promise.resolve();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="song-cover"]')?.getAttribute('data-cover-state')).toBe('none');
    expect(root.querySelector('[data-testid="song-cover-placeholder"]')).not.toBeNull();
  });

  test('R17 — a 500 response moves state to "error" and the placeholder SVG renders', async () => {
    const httpMock = setup();
    const fixture = TestBed.createComponent(SongCover);
    fixture.componentRef.setInput('songId', 'boom-song');
    fixture.componentRef.setInput('songName', 'Boom');
    fixture.componentRef.setInput('hasCover', undefined);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiBaseUrl}/songs/boom-song/files/cover`).flush(
      new Blob(['boom'], { type: 'text/plain' }),
      { status: 500, statusText: 'Server Error' },
    );
    await fixture.whenStable();
    await Promise.resolve();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="song-cover"]')?.getAttribute('data-cover-state')).toBe('error');
    expect(root.querySelector('[data-testid="song-cover-placeholder"]')).not.toBeNull();
  });

  test('R17 — a status 0 (network) response moves state to "error"', async () => {
    const httpMock = setup();
    const fixture = TestBed.createComponent(SongCover);
    fixture.componentRef.setInput('songId', 'offline-song');
    fixture.componentRef.setInput('songName', 'Offline');
    fixture.componentRef.setInput('hasCover', undefined);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiBaseUrl}/songs/offline-song/files/cover`).error(
      new ProgressEvent('error'),
    );
    await fixture.whenStable();
    await Promise.resolve();
    fixture.detectChanges();
    expect(fixture.componentInstance.state()).toBe('error');
  });

  test('R36 — hasCover=false → state "none", no HTTP request', async () => {
    const httpMock = setup();
    const fixture = TestBed.createComponent(SongCover);
    fixture.componentRef.setInput('songId', 'no-cover-detail');
    fixture.componentRef.setInput('songName', 'No Cover');
    fixture.componentRef.setInput('hasCover', false);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.componentInstance.state()).toBe('none');
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="song-cover-placeholder"]')).not.toBeNull();
    httpMock.expectNone(`${environment.apiBaseUrl}/songs/no-cover-detail/files/cover`);
  });

  test('R35 — hasCover=true → exactly one request', async () => {
    const httpMock = setup();
    const fixture = TestBed.createComponent(SongCover);
    fixture.componentRef.setInput('songId', 'detail-with-cover');
    fixture.componentRef.setInput('songName', 'Has Cover');
    fixture.componentRef.setInput('hasCover', true);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiBaseUrl}/songs/detail-with-cover/files/cover`).flush(
      new Blob([new Uint8Array([0x89]) as BlobPart], { type: 'image/png' }),
    );
    await fixture.whenStable();
    await Promise.resolve();
    fixture.detectChanges();
    httpMock.verify();
  });

  test('R19 — destroying the fixture after a 200 response calls URL.revokeObjectURL once with the created URL', async () => {
    const httpMock = setup();
    const created = 'blob:cover-url';
    const origCreate = URL.createObjectURL;
    const origRevoke = URL.revokeObjectURL;
    const createObjectURL = vi.fn(() => created);
    const revokeObjectURL = vi.fn();
    URL.createObjectURL = createObjectURL as typeof URL.createObjectURL;
    URL.revokeObjectURL = revokeObjectURL as typeof URL.revokeObjectURL;
    const fixture = TestBed.createComponent(SongCover);
    fixture.componentRef.setInput('songId', 'song-7');
    fixture.componentRef.setInput('songName', 'Lead Tones');
    fixture.componentRef.setInput('hasCover', undefined);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiBaseUrl}/songs/song-7/files/cover`).flush(
      new Blob([new Uint8Array([1]) as BlobPart], { type: 'image/png' }),
    );
    await fixture.whenStable();
    await Promise.resolve();
    fixture.detectChanges();
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    fixture.destroy();
    expect(revokeObjectURL).toHaveBeenCalledWith(created);
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    URL.createObjectURL = origCreate;
    URL.revokeObjectURL = origRevoke;
  });

  test('T11 — destroying before the 200 response resolves revokes the throwaway URL as soon as it is created', async () => {
    const httpMock = setup();
    const origCreate = URL.createObjectURL;
    const origRevoke = URL.revokeObjectURL;
    const createObjectURL = vi.fn(() => 'blob:cover');
    const revokeObjectURL = vi.fn();
    URL.createObjectURL = createObjectURL as typeof URL.createObjectURL;
    URL.revokeObjectURL = revokeObjectURL as typeof URL.revokeObjectURL;
    const fixture = TestBed.createComponent(SongCover);
    fixture.componentRef.setInput('songId', 'song-late');
    fixture.componentRef.setInput('songName', 'Late');
    fixture.componentRef.setInput('hasCover', undefined);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    fixture.destroy();
    httpMock.expectOne(`${environment.apiBaseUrl}/songs/song-late/files/cover`).flush(
      new Blob([new Uint8Array([1]) as BlobPart], { type: 'image/png' }),
    );
    await fixture.whenStable();
    await Promise.resolve();
    expect(createObjectURL).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:cover');
    URL.createObjectURL = origCreate;
    URL.revokeObjectURL = origRevoke;
  });
});