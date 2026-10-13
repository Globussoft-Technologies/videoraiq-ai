export function isNvrConfirmationPrompt(value) {
  const text = String(value || '');
  return /\bready to create\s+(?:the\s+)?(?:nvr|network recorder)\b/i.test(text)
    || /\breply\s+["']?yes\b[\s\S]{0,80}\b(?:create|add)\b[\s\S]{0,30}\b(?:nvr|network recorder)\b/i.test(text);
}

export function isNvrWorkflowPrompt(value) {
  const text = String(value || '').trim();
  if (!/\b(?:nvrs?|network recorder)\b/i.test(text)) return false;
  return isNvrConfirmationPrompt(text)
    || /^I need\b[\s\S]*\bto add\s+(?:this|the|a)\s+(?:nvr|network recorder)\b/i.test(text)
    || /^(?:please\s+)?(?:enter|select|provide)\b[\s\S]*\b(?:this|the|your)\s+(?:nvr|network recorder)\b/i.test(text)
    || /^(?:where is this nvr located|what (?:should|is) (?:the|this) nvr (?:name|called))\b/i.test(text);
}
