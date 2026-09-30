---
feature_number: 20
name: gp5_preset_body_read_same_preset
title: Todos los presets muestran el contenido del preset 0
status: done
created_at: 2026-09-30T06:50:40.000Z
updated_at: 2026-09-30T07:37:21.000Z
---

## Description
Los nombres de los 100 presets se leen bien, pero al seleccionar cualquier preset en la app la cadena de efectos es la del preset 0. WebMidiPedalConnection.readPresets envía un Program Change por slot, espera READ_SETTLE_MS (300 ms) y pide el cuerpo; parece recibir siempre el del preset 0 o el que está cargado. Evidencia previa: en la captura del 2026-09-29, leer el slot 0 con la sonda mientras el pedal estaba en el preset 84 devolvió bytes mezclados. Detectado por Ricardo en el check T19 de la feature 19 el 2026-09-30.

## Acceptance
- [ ] Causa raíz encontrada y documentada con el pedal real
- [ ] Al menos 3 presets distintos muestran en la app los mismos bloques que la pantalla del pedal
- [ ] Test de regresión que falla con el comportamiento actual
- [ ] ./init.sh verde

## Notes
- 2026-09-30T17:36:30.000Z [leader] RECONCILIATION NOTE (2026-09-30, independent review by Claude Opus): F20's closure is WRONG. Its root cause ('body request missing slot byte at payload position 2') was disproven on real hardware — the slot-byte request gets no reply (read_timeout). F23 reverted it; net production behavior is back to pre-F20. None of F20's acceptance bullets were met: the original bug (all 100 cards show preset 0's chain) is still open and now tracked in F24 (gp5_preset_read_100slot_race). Do not treat F20 as a fix.
