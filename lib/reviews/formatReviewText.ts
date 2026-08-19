// Some imported review text contains literal "<br>" tags (or similar) from
// the source data. It's rendered as plain JSX text everywhere (correctly —
// never dangerouslySetInnerHTML), so those show up as the literal characters
// "<br>" instead of a line break. This converts them to real newlines;
// pair with Tailwind's whitespace-pre-line class wherever it's used so the
// resulting "\n" characters actually render as line breaks instead of being
// collapsed by normal HTML whitespace rules.
export function formatReviewText(text: string): string {
  return text.replace(/<br\s*\/?>/gi, "\n");
}
