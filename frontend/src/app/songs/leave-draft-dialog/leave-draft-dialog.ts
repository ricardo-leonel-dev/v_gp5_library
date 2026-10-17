// F27 `song_preset_duplicate_edit_export` (R48-R55) — the leave-draft
// confirmation dialog. Renders while `SongDetailPage.leavePrompt` is
// non-null and resolves the pending navigation when the user picks
// "Leave and discard" or "Keep editing". Escape and backdrop click emit
// "stay" (R50). Focus moves to "Keep editing" on open (R51).
//
// The component is purely presentational: the page owns the prompt
// signal and the resolve callback. No DI for state, no fetch — a small
// Angular standalone component that follows the F5 dialog pattern.

import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';

@Component({
  selector: 'app-leave-draft-dialog',
  imports: [TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './leave-draft-dialog.html',
})
export class LeaveDraftDialog implements AfterViewInit {
  readonly draftName = input<string>('');
  readonly leave = output<void>();
  readonly stay = output<void>();

  private readonly host = inject(ElementRef<HTMLElement>);

  readonly titleId = `leave-draft-title-${Math.random().toString(36).slice(2, 10)}`;
  private readonly stayButtonRef = viewChild<ElementRef<HTMLButtonElement>>('stayBtn');

  constructor() {
    afterNextRender(() => {
      this.stayButtonRef()?.nativeElement.focus();
    });
  }

  ngAfterViewInit(): void {
    // Fallback for environments where afterNextRender does not run
    // (older jsdom). The primary path is the constructor's
    // afterNextRender.
    const ref = this.stayButtonRef();
    if (ref) ref.nativeElement.focus();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.stay.emit();
  }

  onBackdropClick(): void {
    this.stay.emit();
  }

  onCardClick(ev: Event): void {
    ev.stopPropagation();
  }

  onLeave(): void {
    this.leave.emit();
  }

  onStay(): void {
    this.stay.emit();
  }
}
