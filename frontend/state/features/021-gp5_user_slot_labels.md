---
feature_number: 21
name: gp5_user_slot_labels
title: Mostrar el número de slot en User IR y User SnapTone
status: pending
created_at: 2026-09-30T06:50:40.000Z
updated_at: 2026-09-30T06:50:51.000Z
---

## Description
Hoy un CAB con IR de usuario se muestra como 'User IR 1-20' (título canónico del manual). El pedal envía el número de slot en el código ([n,0,16,10] = slot n+1), así que la app puede mostrar 'User IR 1'..'User IR 20'. Lo mismo para los slots de usuario de N->S (NAM importados, códigos desde [50,0,0,15]). Leer los nombres reales de los IR/NAM del pedal queda fuera de alcance. Pedido por Ricardo en el check T19 de la feature 19 el 2026-09-30.

## Acceptance
- [ ] El código [n,0,16,10] se muestra como 'User IR n+1'
- [ ] Los slots de usuario de N->S muestran su número de slot
- [ ] Textos es/en
- [ ] Tests
- [ ] ./init.sh verde
