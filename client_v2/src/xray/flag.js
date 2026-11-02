/**
 * The X-ray master flag — the single guard, read everywhere.
 *
 * Contract: `docs/xray/00_CONTRACT.md` §3 (in the other repo,
 * `face_plus_obj_detection_cpp_variant/docs/xray/`). Four independent flags gate
 * this feature, one per component; `VITE_XRAY_ENABLED` is the frontend's.
 *
 * Default is **off**, and §3 requires that off be byte-identical to a build that
 * had never heard of X-ray — specifically "no module imported". That requirement
 * dictates the shape of the two lines below, so read this before changing them:
 *
 *   1. The expression must be spelled EXACTLY `import.meta.env.VITE_XRAY_ENABLED`.
 *      Vite statically replaces that member expression with a string literal at
 *      build time. Write `import.meta.env?.VITE_XRAY_ENABLED` instead and the
 *      replacement does not fire — Vite inlines the whole `env` object and the
 *      value becomes a runtime property read.
 *
 *   2. The comparison must stay a bare `=== 'true'`, with no normalising helper
 *      around it. Wrapping it in a function (even a pure one) makes this a call
 *      expression, which Rollup will not evaluate, so `XRAY_ENABLED` stops being
 *      a constant and every `XRAY_ENABLED ? … : …` survives into the bundle.
 *
 * Together those two make this fold to the literal `false` in an off build, which
 * is what lets the call site's dynamic `import()` be eliminated entirely. Both
 * were violated in the first draft of this file and the off build shipped an
 * `XrayMode` chunk; `tests/xrayFlag.test.js` now pins the semantics and
 * `npm run build` is the real check.
 *
 * The cost is deliberate: the match is exact, so `TRUE`, `True` and `" true "`
 * all read as OFF. For a flag whose whole job is to fail closed, stricter is the
 * right side to err on — unlike `src/lib/featureFlags.js`, which can afford to be
 * tolerant because nothing depends on it being statically analysable.
 *
 * This module itself IS imported in an off build. It is mandated by the plan ("a
 * single guard, read everywhere") and minifies to a single `false` constant; what
 * §3 forbids is importing the *feature*, which an off build does not.
 */
export const XRAY_ENABLED = import.meta.env.VITE_XRAY_ENABLED === 'true';

export default XRAY_ENABLED;
