---
feature_number: 20
name: gp5_preset_body_read_same_preset
title: Todos los presets muestran el contenido del preset 0
status: pending
created_at: 2026-09-30T06:50:40.000Z
updated_at: 2026-09-30T06:50:49.000Z
---

## Description
Los nombres de los 100 presets se leen bien, pero al seleccionar cualquier preset en la app la cadena de efectos es la del preset 0. WebMidiPedalConnection.readPresets envía un Program Change por slot, espera READ_SETTLE_MS (300 ms) y pide el cuerpo; parece recibir siempre el del preset 0 o el que está cargado. Evidencia previa: en la captura del 2026-09-29, leer el slot 0 con la sonda mientras el pedal estaba en el preset 84 devolvió bytes mezclados. Detectado por Ricardo en el check T19 de la feature 19 el 2026-09-30.

## Acceptance
- [ ] Causa raíz encontrada y documentada con el pedal real
- [ ] Al menos 3 presets distintos muestran en la app los mismos bloques que la pantalla del pedal
- [ ] Test de regresión que falla con el comportamiento actual
- [ ] ./init.sh verde
