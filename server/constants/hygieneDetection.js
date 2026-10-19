export const HYGIENE_CATEGORIES = Object.freeze([
  "cleaningSanitationSop",
  "unsafeFoodHandling",
  "servingFoodSafety",
  "handHygieneBypass",
  "productContact",
  "contaminationRisk",
]);

export const HYGIENE_DEFAULTS = Object.freeze({
  hygiene_interval_sec: 180,
  hygiene_min_confidence: 0.6,
  hygiene_cooldown_sec: 1800,
});
