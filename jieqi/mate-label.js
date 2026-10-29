/**
 * UCI `score mate` is measured in full moves, from the current side's view.
 * Keep that integer unchanged: never derive a mating distance from a cp score.
 * In Xiangqi an engine terminal win may also be a stalemate (困毙).
 */
export function mateLabel(mate) {
  if (!Number.isSafeInteger(mate)) return '';
  if (mate > 0) return `${mate}步杀`;
  if (mate < 0) return `对手${Math.abs(mate)}步杀`;
  return '已被将死';
}

export function mateTone(mate) {
  if (!Number.isSafeInteger(mate)) return '';
  return mate > 0 ? 'winning' : 'losing';
}
