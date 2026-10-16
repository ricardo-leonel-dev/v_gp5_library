---
session_id: 8
feature: preset_browser_ui_followup_fixes
agent: unknown
started_at: 2026-09-28T05:46:10.000Z
closed_at: 2026-09-28T06:18:24.000Z
---

## Plan
- Read web-midi-pedal-connection.ts and preset-browser-page code to confirm not_connected rejection behavior
- Decide fix: wire not_connected_error key correctly or remove orphan key
- Update code/i18n files accordingly
- Add test for not_connected rejection path
- Investigate angular.json cli.analytics change
- Run ./init.sh and verify
- Append log and report readiness

## Log
- [unknown] Confirmed dead-key bug in src/app/midi/web-midi-pedal-connection.ts readPresets() (lines 83,89): rejects Error('not_connected') on guard/disconnect; page component did t('presetBrowser.' + error()) which collided with the existing 'not_connected' guard-message key, leaving 'not_connected_error' orphaned.
- [unknown] Fix: in preset-browser-page.ts loadPresets() catch block, map err.message === 'not_connected' -> 'not_connected_error' before setting the error signal, so the mid-operation error renders distinct copy ('The pedal is not connected.') from the pre-load guard prompt ('Connect the pedal to view its presets.'). Left midi layer's Error('not_connected') message untouched (other tests in web-midi-pedal-connection.spec.ts assert on it).
- [unknown] Added test 'renders the not-connected-error message when readPresets() rejects with not_connected (R11)' in preset-browser-page.spec.ts asserting the es i18n string 'El pedal no está conectado.' renders. Confirmed en/es i18n keys for presetBrowser are now in 1:1 sync with no orphans.
- [unknown] Investigated angular.json cli.analytics:false: not present in any git commit (git log -- angular.json shows only the initial scaffold without it); it is a live, uncommitted working-tree diff. Traced it to node_modules/@angular/cli/src/analytics/analytics.js's promptAnalytics()/isTTY() path — Angular CLI's own first-run analytics opt-in check, which persists 'false' to the local angular.json once it runs non-interactively (isCI or no real stdin) in an environment where stdout still reports isTTY. Verified it is stable (re-running ./init.sh's ng test did not change the diff further). This is a harmless, CLI-generated artifact unrelated to feature 3's own scope -- documenting it here per this feature's acceptance criterion; leaving the setting as-is (it's what the CLI itself already converged on) and including angular.json in this feature's change list so it's committed with this explanation attached instead of remaining a silent, unexplained working-tree diff.
- REVIEW (changes-requested): Finding 1 (i18n dead key) verified solid: fix + test genuinely cover the not_connected rejection path, en/es key parity confirmed. Finding 2 (angular.json): the report's specific causal claim about isTTY()/analytics persistence is inverted vs. what analytics.js actually does (verified by reading source + empirically checking isTTY() is false in this sandbox); conclusion (harmless CLI artifact) is plausible but the written explanation needs correcting before this satisfies acceptance criterion (c).
- [unknown] CORRECTION per reviewer (progress/review.md): my earlier log entry about angular.json's cli.analytics:false got the analytics.js mechanism backwards. Re-read node_modules/@angular/cli/src/analytics/analytics.js's promptAnalytics(): it only calls setAnalyticsConfig (the sole writer of cli.analytics) when 'force || isTTY()' is true; if isTTY() is false it returns early and writes nothing. I had claimed the opposite (that it writes when isTTY() fails to resolve). Verified empirically in this sandbox: node -e "console.log(process.stdout.isTTY, process.stdin.isTTY, process.env.CI)" -> undefined undefined undefined, so isTTY() is false here -- meaning no run of ng test/bunx ng from a tool-sandbox session like this one (or a prior implementer's) could have produced this diff. It must have come from an earlier real-terminal ng/bunx ng invocation (most plausibly the original human-run 'ng new' scaffold) where the interactive confirm prompt's default answer (false) got persisted via setAnalyticsConfig. Higher-level conclusion unchanged: harmless CLI artifact, unrelated to app code, stable across re-runs, left as-is -- only the specific causal mechanism was wrong and is now corrected in progress/impl_preset_browser_ui_followup_fixes.md.

## Next Step

## Verification
./init.sh green (Node v22.23.2 on PATH): 9 test files / 76 tests passed (was 75 baseline, +1 new test for the not_connected rejection path). One pre-existing [WARN] from the Postgres/Supabase mirror sync step (HTTP 404 PGRST125 bootstrap_project sync failed), unrelated to this feature.

## Closure
Fixed finding 1 (dead presetBrowser.not_connected_error i18n key): remapped the 'not_connected' readPresets() rejection to the distinct not_connected_error key in preset-browser-page.ts's loadPresets() catch block, avoiding the prior collision with the pre-load not_connected guard-message key; added a test exercising the rejection path and asserting the correct i18n string renders; confirmed en/es presetBrowser.* key sets have no orphans. Finding 2 (angular.json cli.analytics:false): investigated and documented as a harmless Angular CLI first-run analytics-opt-in artifact unrelated to app code -- initial root-cause narrative was corrected after reviewer found the analytics.js mechanism description was backwards (setAnalyticsConfig only writes when isTTY() is true, not false); corrected explanation verified against source and left in progress/impl_preset_browser_ui_followup_fixes.md and the session log. Left as-is, not reverted.
