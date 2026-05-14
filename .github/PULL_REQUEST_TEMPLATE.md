<!--
Thanks for the PR! A few things to make review fast:

1. State the why in the summary (what problem this solves), not just the what.
2. Reference any related issue with `Fixes #N` so it auto-closes.
3. If you touched routes / models / public APIs, update the corresponding
   docs in the same PR.
-->

## Summary

<!-- 1-3 bullets — the why -->

## Test plan

<!-- Checklist of what you verified -->
- [ ] `cd server && npm test` passes locally
- [ ] `cd client && npm run lint && npm run build` succeeds
- [ ] If routes / auth / RBAC touched: ran `cd e2e && npm test` against dev

## Screenshots / videos

<!-- For UI changes, drop screenshots or short clips here -->

## Risk

<!-- Anything reviewers should look at extra-carefully (security, perf, data migration, etc.) -->
