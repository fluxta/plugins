/**
 * The text cut down to at most `limit` graphemes — what a reader counts as
 * characters, so an emoji or an accented letter is never split. It is cut at
 * the last word boundary within the limit, so no word is heard half-said,
 * and the rest is dropped. A single word longer than the limit is cut
 * between graphemes. `null` keeps the text whole.
 */
export function truncate(text: string, limit: number | null): string {
  if (limit === null) {
    return text;
  }
  const graphemes = Array.from(
    new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text),
  );
  if (graphemes.length <= limit) {
    return text;
  }
  // Where the first grapheme past the limit starts, in UTF-16 units.
  const cut = graphemes[limit].index;
  // Word boundaries are grapheme boundaries too, so ending on one never
  // splits a grapheme.
  let end = 0;
  for (const { index, segment } of new Intl.Segmenter(undefined, {
    granularity: "word",
  }).segment(text)) {
    if (index + segment.length > cut) {
      break;
    }
    end = index + segment.length;
  }
  const byWord = text.slice(0, end).trimEnd();
  return byWord !== "" ? byWord : text.slice(0, cut);
}
