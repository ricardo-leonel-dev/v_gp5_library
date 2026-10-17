# Requirements — F27 `song_preset_duplicate_edit_export`

Duplicate a preset inside a saved song, edit the copy visually (bypass, parameters, effect), and then export it
as a `.prst` file or write it to a pedal slot (saving it to the song is F31). Builds on F26 (`/songs/:id`), F30 (read-only
chain board per preset row) and F5 (write-to-pedal dialog).

Revision 2 (2026-10-16, human decision): split in two. **F27 keeps duplicate, edit, export, send to pedal,
discard and leave confirmation**, none of which needs the backend. **Saving the draft to the song (former
R31-R36) and the plan-limit gate (former R14-R15) move to F31 `song_preset_draft_save`**
(`specs/song_preset_draft_save/`), which is blocked on the backend card (A1). Requirement ids are kept stable:
moved ids stay listed below as "Moved to F31" so the R→test traceability does not renumber.

Terms used below:
- **source preset**: a preset already saved in the song, shown by F30's expandable row.
- **draft**: the in-memory copy created by "Duplicate". It is not part of the song until it is saved.
- **patched body**: the source preset's 466-byte body with only the edited record bytes rewritten (design §2).
- **song names**: the `name` of every preset in the song's current `presets` list.

# Open questions / assumptions

Each assumption below is what this spec implements. If the human disagrees, the spec must be revised before
approval.

- **A1 (backend dependency) — moved to F31 in rev 2.** No backend endpoint can add a preset to an existing song
  today. The backend card "Add, replace and delete a preset in an existing song" (contract in design.md §5) was
  created on 2026-10-16 for `v_gp5_library-backend`
  (https://app.notion.com/p/Add-replace-and-delete-a-preset-in-an-existing-song-3fbdef9a37cd81b4b1e1e2dbe46bdb8b).
  **F27 sends no request that modifies the song** (R30) and does not depend on that card; only F31 does.
- **A2 (what "edit modules" means) — confirmed by the human.** Editing is limited to: toggling a block's bypass, changing a block's
  parameter values `p0..p7`, and swapping a block's effect for another effect **of the same category** whose
  hardware code is known (`GP5_HARDWARE_MODULE_CODES`). Reordering blocks and changing a block's category are out
  of scope.
- **A3 (parameter scale).** Parameter values are edited as the raw float32 numbers the body stores, shown with
  the existing labels from `GP5_FX_CATALOG`. The value scale is still a hypothesis (`GP5_FX_PARAMETER_MAPPING_
  STATUS`), so no min/max range is enforced beyond "finite number"; the UI says so in a footnote.
- **A4 (effect swap keeps parameters).** Swapping a block's effect rewrites only that block's 4-byte models
  record; its 8 parameter floats are kept as they were. Default values per effect are unknown.
- **A5 (only drafts are editable).** Saved presets (including saved copies) stay read-only (F30). Editing a saved
  preset again (via the backend's new `PUT`, A1) is out of scope for F27.
- **A6 (one draft at a time, leave confirmation) — decided by the human.** The page holds at most one draft. It
  lives only in memory. WHILE the draft has unsaved edits (`edited === true`), leaving the song detail page asks
  for confirmation: in-app route navigation shows the app's own leave-confirmation dialog (`canDeactivate` guard,
  bespoke dialog following the F5 dialog pattern, no `window.confirm`); browser reload/close triggers the
  browser's own `beforeunload` prompt (its text cannot be customized). There is no prompt when there is no draft,
  when the draft has no edits yet, or right after a discard (it clears the draft). F31 adds "after a successful
  save" to this list.
- **A7 (save position) — moved to F31.**
- **A8 (export and write do not require saving).** Export and write-to-pedal operate on the draft's current
  bytes; in F27 there is no save at all, and after F31 they keep working whether or not the draft was saved.
- **A9 (name rules).** A draft name is 1-16 printable ASCII characters (`0x20..0x7e`), not only spaces, compared
  after trimming and case-sensitively against song names — the same rule F4 applies (`tryAppendEntry`) and the
  backend's `readPresetName` accepts.
- **A10 (verified encoder).** "Verified body encoder" is satisfied by (a) the patch encoder reproducing every
  captured GP-5 body byte-for-byte when no edit is made, (b) each edit kind changing only its own record bytes,
  and (c) the manual hardware check in R45. `encodeBody` (the from-scratch GP-50 port) is not used.

No open questions remain: Q1-Q3 were answered by the human (see A1, A2, A6).

# Encoder (pure, `src/app/midi/`)

## R1
WHEN `patchGp5Body(body, chain)` is called with a 466-byte body and the chain that `decodeGp5Body(body)` returns,
the system SHALL return a 466-byte array byte-identical to `body`.

## R2
WHEN `patchGp5Body` is called with a chain whose only difference from the decoded chain is one block's `enabled`
value, the system SHALL return a body that differs from the input only within the 4 bytes of the bypass mask
record data.

## R3
WHEN `patchGp5Body` is called with a chain whose only difference from the decoded chain is one parameter `p<k>`
of one block, the system SHALL return a body that differs from the input only within the 4 bytes of that block's
`p<k>` float32 in the params record, holding the new value as little-endian float32.

## R4
WHEN `patchGp5Body` is called with a chain whose only difference from the decoded chain is one block's
`moduleType`, the system SHALL return a body that differs from the input only within that block's 4-byte models
record, holding the parsed `fxlow` (24-bit little-endian) and `cat` bytes.

## R5
WHEN `patchGp5Body`'s output is passed back to `decodeGp5Body`, the system SHALL return a chain equal to the chain
given to `patchGp5Body` (for every block whose `moduleType` parses).

## R6
IF `patchGp5Body` is called with a body whose length is not 466, that lacks any of the four record magics, or
whose order record is not a permutation of `0..9` THEN the system SHALL throw `Error('body_not_patchable')` and SHALL NOT return bytes.

## R7
The system SHALL leave the input `body` array of `patchGp5Body` unmodified.

## R8
WHEN `encodePrstNameField(name)` is called with a valid draft name (A9), the system SHALL return 16 bytes holding
the name's ASCII codes followed by `0x00` padding, for which `isReadablePrstNameField` returns `true`.

# Duplicate

## R9
WHILE a song is loaded and a source preset row's chain has loaded successfully, the system SHALL show a
"Duplicate" button inside that row's expanded panel.

## R10
WHEN the user activates "Duplicate" on a source preset, the system SHALL create a draft from that preset's
fetched `.prst` bytes without sending any request that modifies the song.

## R11
WHEN a draft is created, the system SHALL set its name to the first of `<source name> 2`, `<source name> 3`, …
that is not among the song names, truncating the source name (then trimming trailing spaces) so the result fits
16 characters.

## R12
WHEN a draft is created, the system SHALL render the draft panel with the draft name, an editable chain board
showing the draft's chain, and the draft actions (Export .prst, Send to pedal, Discard). F31 adds Save to song.

## R13
WHILE a draft exists, the system SHALL disable every "Duplicate" button on the page.

## R14
Moved to F31 (plan-limit gate). See `specs/song_preset_draft_save/requirements.md`.

## R15
Moved to F31.

# Edit (draft only)

## R16
WHEN the user selects a block on the draft's chain board, the system SHALL show the block detail panel in edit
mode for that block.

## R17
WHEN the user toggles the bypass switch in the edit-mode block detail, the system SHALL flip that block's
`enabled` value in the draft chain.

## R18
WHEN the draft chain's block `enabled` value changes, the system SHALL render that block on the draft chain board
with the dimmed class `opacity-40` when disabled and without it when enabled.

## R19
WHEN the user enters a finite number in a parameter input of the edit-mode block detail and the input loses
focus or the user presses Enter, the system SHALL store that number as the block's `p<k>` value in the draft
chain.

## R20
IF the user enters a value that is empty or not a finite number in a parameter input THEN the system SHALL show
the inline error `songPresetDraft.errors.param_invalid` for that input and SHALL keep the previous value in the
draft chain.

## R21
WHERE a block's current effect resolves to a known category, the system SHALL offer in edit mode the effects of
that same category that have a known hardware code, excluding user-slot effects ("User IR 1-20", "User SnapTone").

## R22
WHEN the user picks a different effect in edit mode, the system SHALL set that block's `moduleType` to the picked
effect's hardware code and SHALL keep the block's parameter values unchanged.

## R23
WHERE a block's effect does not resolve (unknown module), the system SHALL hide the effect picker for that block.

## R24
The system SHALL render source presets' chain boards and block details read-only (no bypass switch, parameter
input or effect picker), as F30 does.

## R25
WHEN the user edits the draft name input, the system SHALL show the inline error
`songPresetDraft.errors.name_required` when the trimmed name is empty.

## R26
WHEN the user edits the draft name input, the system SHALL show the inline error
`songPresetDraft.errors.name_unsupported` when the name contains a character outside `0x20..0x7e` or is longer
than 16 characters.

## R27
WHEN the user edits the draft name input, the system SHALL show the inline error
`songPresetDraft.errors.name_duplicate` when the trimmed name equals one of the song names.

## R28
WHILE the draft name has any error from R25-R27, the system SHALL disable Export .prst and Send to pedal.

## R29
WHILE the draft has edits not yet saved to the song, the system SHALL show the `songPresetDraft.unsaved` status
on the draft panel.

## R30
The system SHALL NOT send any request that modifies the song while the user edits a draft.

# Save to song (moved to F31)

## R31
Moved to F31.

## R32
Moved to F31.

## R33
Moved to F31.

## R34
Moved to F31.

## R35
Moved to F31.

## R36
Moved to F31.

# Export

## R37
WHEN the user activates "Export .prst", the system SHALL download a 507-byte file built from the patched body and
the draft name field, which `decodePrstFile` accepts with `ok: true`, named `<draft name>.prst` with characters
outside `[A-Za-z0-9 _-]` replaced by `_`.

## R38
The system SHALL NOT send any network request when the user exports a draft.

# Write to pedal

## R39
WHEN the user activates "Send to pedal" on a draft, the system SHALL open the write-to-pedal dialog in single-
preset mode for the draft, with no "Write all in order" toggle and no preset fetch from the backend.

## R40
WHEN the user confirms a valid slot in that dialog while the pedal is connected, the system SHALL call
`writePreset` once with the draft's patched body and name field as `raw` and the chosen slot.

## R41
WHILE the pedal is not connected, the system SHALL keep the dialog's Send button disabled for the draft (F5's
existing reminder and connect button apply).

## R42
The system SHALL NOT write to the pedal unless the user confirms the dialog's Send button.

# Discard

## R43
WHEN the user activates "Discard", the system SHALL remove the draft panel and re-enable "Duplicate" without
sending any request.

# i18n and layout

## R44
The system SHALL have every new UI string in both `public/i18n/es.json` and `public/i18n/en.json` under the same
keys.

## R45
The exported `.prst` of an edited draft SHALL install and play on a real GP-5 in any user slot, with the edited
bypass, parameter and effect reflected on the pedal (manual hardware check by Ricardo).

## R46
WHILE the viewport is 375px wide, the system SHALL render the draft panel and its actions without horizontal
page overflow.

## R47
WHILE the viewport is 1280px wide, the system SHALL render the draft chain board and the edit-mode block detail
side by side.

# Leave confirmation

## R48
WHEN the user starts an in-app navigation away from the song detail page while the draft has unsaved edits, the
system SHALL hold the navigation and show the leave-confirmation dialog.

## R49
WHEN the user activates "Leave and discard" in the leave-confirmation dialog, the system SHALL complete the held
navigation and discard the draft.

## R50
WHEN the user activates "Keep editing", presses Escape or clicks the backdrop of the leave-confirmation dialog,
the system SHALL cancel the held navigation and keep the draft unchanged.

## R51
WHEN the leave-confirmation dialog opens, the system SHALL move focus to its "Keep editing" button.

## R52
WHILE the draft has unsaved edits, the system SHALL call `preventDefault()` on the window `beforeunload` event.

## R53
WHILE there is no draft or the draft has no unsaved edits, the system SHALL allow in-app navigation away from the
song detail page without showing the leave-confirmation dialog.

## R54
WHILE there is no draft or the draft has no unsaved edits, the system SHALL NOT call `preventDefault()` on the
window `beforeunload` event.

## R55
WHEN the user discards the draft, the system SHALL allow the next navigation away from the song
detail page without showing the leave-confirmation dialog.
