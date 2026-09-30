---
feature_number: 22
name: gp5_preset_body_read_pc_plus_slot_byte
title: F20 follow-up: PC + 300ms settle restaurado, slot byte conservado en body request
status: done
created_at: 2026-09-30T07:52:20.000Z
updated_at: 2026-09-30T08:18:08.000Z
---

## Description
F20 (commits bb4c550 en feature/gp5-preset-body-read-same-preset) hipotetizó que el byte de slot en posición 2 del body request hacía innecesario el MIDI Program Change + READ_SETTLE_MS (300ms) antes de cada slot, y eliminó el PC + settle del loop. Verificación hardware post-merge el 2026-09-30 mostró que sin PC + settle el pedal no responde a los body requests (timeout completo en waitForSlotPreset, error 'La lectura de presets ha expirado'). El slot-byte hypothesis probablemente es correcto (los bytes mixtos de la captura del 2026-09-29 son consistentes con slot byte parcialmente honrado), pero el PC + settle es necesario para conmutar el preset activo antes del body request. Fix: mantener buildBodyRequest(slot) del F20 y restaurar el PC + READ_SETTLE_MS en readPresets. Si el pedal ignora el slot byte, terminamos en comportamiento pre-F20 (app carga, bug original persiste - aceptable). Si lo honra, además arregla el bug original.

## Acceptance
- [ ] PC + READ_SETTLE_MS restaurados en el loop de readPresets (WebMidiPedalConnection); buildBodyRequest(slot) preservado en gp5-sysex-preset-codec.ts; comentario de cabecera del codec actualizado para reflejar que PC + settle y slot byte coexisten; 7 tests de orquestación en web-midi-pedal-connection.spec.ts reescritos para esperar PC + settle + body otra vez; preset-browser-page.spec.ts T37 helper vuelve a advanceTimersByTimeAsync(READ_SETTLE_MS); regression test del F20 (decoded[2] === slot por body request) sigue verde; ./init.sh verde (794+ tests pasan); no introducen nuevos tests rojos ni warnings de log-out

## Notes
- 2026-09-30T20:57:56.000Z [leader] RECONCILIATION NOTE (2026-09-30): F22's closure is WRONG where it says 'F20's slot-byte fix at buildBodyRequest was correct'. The slot byte was disproven on hardware (pedal stops replying) and reverted by F23. The real root cause, found in F24 with a live capture, is that the GP-5 ignores MIDI Program Change; presets are selected with CC0 [0xb0, 0x00, slot]. Resolved by F24 (commits 426cd34 + f6c8e3a), hardware-verified by Ricardo.
