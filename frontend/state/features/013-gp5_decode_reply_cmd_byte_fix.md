---
feature_number: 13
name: gp5_decode_reply_cmd_byte_fix
title: Fix decodeIncomingMessage(): wrong 'cmd byte' gate discards every real GP-5 reply
status: done
created_at: 2026-09-28T07:47:53.000Z
updated_at: 2026-09-28T07:59:43.000Z
---

## Description
Live hardware test (real GP-5, connected via USB) found the true root cause of the persistent read_timeout, deeper than feature 12's Program-Change-sequencing fix. In Gp5SysexPresetCodec.decodeIncomingMessage() (src/app/midi/gp5-sysex-preset-codec.ts): 'const cmd = decoded[1]; if (cmd !== CATSEL) return { kind: 'ignored' };' assumes an incoming reply echoes CATSEL (0x12) at decoded[1], mirroring the outgoing request's layout. This is wrong. Captured raw MIDI traffic from the real pedal (CRC-valid on every message) shows decoded[1] is NOT a fixed command byte at all -- it is the total chunk count for that transfer, which varies: 106 for the 100-name blob (split across 106 reply packets), 25 for one preset's 466-byte body (split across 25 reply packets). Since this value is never CATSEL, the guard discards 100% of real replies unconditionally, on every read, independent of Program Change/settle sequencing (feature 12's fix was real and necessary -- hardware does require it -- but this bug meant no reply was ever being accepted regardless, so feature 12 alone could not have worked). Manually bypassing this check and reassembling chunks by decoded[2] (index) up to the already-correct target byte length (NAMES_BLOB_LEN / BODY_BLOB_LEN) decodes perfectly: 100 real preset names (e.g. 'TL DLX AMP', 'RA METAL1', 'RA-ERES') from the names phase, and a body blob whose echo bytes are exactly [CATSEL, BODY_SEL] with all four record magics (REC_MODELS_MAGIC, REC_BYPASS_MAGIC, REC_ORDER_MAGIC, REC_PARAMS_MAGIC) found at valid offsets. So everything downstream of this one gate (CRC check, index-based chunk reassembly, echo stripping, magic-marker body parsing) is already correct and hardware-verified -- only this single incorrect guard needs to change.

## Acceptance
- [ ] decodeIncomingMessage() no longer rejects valid, CRC-checked replies based on an assumed-constant value at decoded[1] -- that field is a per-transfer chunk count, not a fixed command tag, and must not gate message acceptance
- [ ] Message validity is determined by the CRC check (already correct) plus sane structural checks (framing, minimum length) -- not by comparing decoded[1] to CATSEL
- [ ] Existing byte-level tests in gp5-sysex-preset-codec.spec.ts that build synthetic reply frames are updated/extended to reflect the real header shape (decoded[1] = chunk count, not CATSEL) so they exercise the corrected logic, not the old incorrect assumption
- [ ] New tests cover: names phase completes correctly when replies carry a chunk-count value at decoded[1] that is neither CATSEL nor a small fixed constant (e.g. matching the real hardware's 106/25 pattern), and CRC-invalid messages are still correctly rejected as 'invalid'
- [ ] Full read flow (names + all 100 slot bodies, including feature 12's Program-Change-and-settle sequencing) is re-verified together in an integration-style test using synthetic reply data shaped like the real captured traffic (chunked, varying chunk counts, real echo bytes), not just isolated unit assertions
- [ ] The implementer documents in a code comment what decoded[1] actually represents (chunk count for the transfer), replacing the incorrect CATSEL-echo assumption in any comments/naming that referenced it
