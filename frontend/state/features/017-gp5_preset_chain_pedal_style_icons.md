---
feature_number: 17
name: gp5_preset_chain_pedal_style_icons
title: GP-5 chain board: pedal-style FX icons + UX polish
status: pending
created_at: 2026-09-28T20:44:50.000Z
updated_at: 2026-09-28T20:52:56.000Z
---

## Description
T41 review of feature 16 found the current flat-color-chip design too plain. Replace with pedal-stompbox-style icons per FX category (Valeton GP-5 product look: chassis + knobs + jacks). Apply to both per-row strip and selected-preset board. Keep palette, LED, dimming, lifted-selected ring, dark/light parity, and the design.md 5x2 / 10x1 responsive grid. Source icons from a free-license set (CC0/MIT/Apache) if one fits, or design in-house. License must be documented in docs/architecture.md §2b.

UX polish items added by Ricardo during T41:
- Click 'Select' on an already-selected row should deselect (toggle): board, detail and selected-row highlight all clear. Alternative: add an X close button on the selected row.
- Each row must support a selection state for future export to the desktop app (foundation only — checkbox/multi-select mechanism; no full export UI).
- Cable at sm+ currently appears to render ON TOP of the pedals instead of behind them; fix z-index so the cable goes behind blocks.

## Acceptance
- [ ] Strip y board muestran icono estilo pedal por bloque (no chip plano con color sólido)
- [ ] Cada categoría (NR, PRE, DST, N→S, AMP, CAB, EQ, MOD, DLY, RVB) tiene su propio icono distinguible
- [ ] Licencia del set de iconos documentada en docs/architecture.md §2b (CC0/MIT/Apache o 'in-house')
- [ ] Click 'Select' en fila ya seleccionada: alterna entre seleccionar y deseleccionar (board + detail + selected-row highlight desaparecen). Aceptable alternativa: botón X dedicado en la fila seleccionada.
- [ ] Cada fila soporta estado de selección para futuro export a la app de escritorio (foundation: checkbox o mecanismo equivalente; sin UI completa de export)
- [ ] Cable a sm+ se renderiza POR DETRÁS de los pedales (z-index correcto, no encima)
- [ ] Tests de regresión verdes: R15-R19, R22, R38, R39, R40
- [ ] Light + dark mode legibles, 375px y ≥1024px sin overflow
- [ ] Manual T41 re-aprobado por Ricardo
- [ ] ./init.sh verde (sin regresiones)
