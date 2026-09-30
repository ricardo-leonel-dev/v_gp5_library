---
feature_number: 23
name: gp5_preset_body_read_remove_slot_byte
title: Revertir buildBodyRequest(slot): body request sin byte de slot (F23, basado en evidencia de probe)
status: in_progress
created_at: 2026-09-30T16:41:22.000Z
updated_at: 2026-09-30T16:42:55.000Z
---

## Description
F20 (commit bb4c550) agregó buildBodyRequest(slot) en gp5-sysex-preset-codec.ts, que ponía el byte de slot en posición 2 del body request (selector 0x41). F22 (46ffea8) restauró el PC + READ_SETLE_MS encima. Ambos estados rompen en hardware real: la app da read_timeout porque el pedal no responde a body requests con un byte de slot. La evidencia empírica en progress/gp5_webmidi_body_read_probe.html muestra el protocolo correcto: el body request es buildRequest(BODY_SEL) -> [crc, 0x01, 0x00, 0x02, 0x12, 0x41] (byte 2 es 0x00, sin slot byte). El slot viaja por el MIDI Program Change ([0xc0, slot & 0x7f]) seguido de un settle de 300ms, no en el SysEx. La sección MIDI del manual de usuario (página 40) solo lista CCs estándar y NO documenta el SysEx del preset read/write — el protocolo fue reverse-engineered, así que el slot-byte fue una suposición incorrecta. La probe single-slot funciona con PC + settle + body sin slot byte; el bug original '100 cards muestran el chain del preset 0' en producción persiste (race entre PC y body, hipótesis aún sin verificar) pero queda fuera del scope de F23. F23 es solo el revert para sacar el timeout.

## Acceptance
- [ ] buildBodyRequest(slot) eliminado de gp5-sysex-preset-codec.ts; encodeReadAllRequest usa buildRequest(BODY_SEL) (mismo buildRequest que para nombres, solo cambia el selector); buildBodyRequest queda removido del archivo; regression test en gp5-sysex-preset-codec.spec.ts actualizado para fijar la nueva invariante: los 100 body requests son byte-idénticos a buildRequest(BODY_SEL), todos con byte 2 == 0; comentario de cabecera del codec actualizado para reflejar que el protocolo empíricamente validado es buildRequest(BODY_SEL) + PC + settle, citando explícitamente progress/gp5_webmidi_body_read_probe.html como ground truth; PC + READ_SETLE_MS en el loop de readPresets (F22) se mantienen sin cambios; no se introducen nuevos warnings de log-out; ./init.sh verde
