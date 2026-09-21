---
feature_number: 7
name: song_metadata_and_extra_config
title: Song name, artist, and free-form extra_config validation
status: pending
created_at: 2026-09-21T04:17:32.000Z
updated_at: 2026-09-21T08:33:47.000Z
---

## Description
Validate the metadata fields on song create/update: name required, artist optional, extra_config is a free-form JSON object the user controls (notes, tuning, capo position, whatever they want) with a reasonable size cap.

## Acceptance
- [ ] Creating a song without a name is rejected with 400
- [ ] extra_config accepts an arbitrary JSON object and round-trips through GET unchanged
- [ ] An oversized extra_config payload (define a cap, e.g. 32KB) is rejected with 400
