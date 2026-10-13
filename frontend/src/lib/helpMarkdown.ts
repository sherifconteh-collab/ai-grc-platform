/**
 * Prepares help-article Markdown for MarkdownContent.
 *
 * MarkdownContent classifies whole blank-line-separated blocks, so a heading
 * or rule is only recognized when it stands alone in its block, and a list
 * only when every line of the block is a list item. Guide articles routinely
 * put a heading directly above its text, or a list directly under a sentence.
 * The renderer this replaced matched each line independently, so this inserts
 * a blank line wherever the kind of line changes (outside fenced code) to keep
 * those articles rendering the same way.
 */

type LineKind = 'blank' | 'heading' | 'rule' | 'bullet' | 'ordered' | 'quote' | 'text';

function classifyLine(line: string): LineKind {
  if (line.trim() === '') return 'blank';
  if (/^#{1,4} .+$/.test(line)) return 'heading';
  if (/^---+\s*$/.test(line)) return 'rule';
  if (/^[-*]\s+/.test(line)) return 'bullet';
  if (/^\d+\.\s+/.test(line)) return 'ordered';
  if (/^>\s?/.test(line)) return 'quote';
  return 'text';
}

export function separateMarkdownBlocks(markdown: string): string {
  const out: string[] = [];
  let inFence = false;
  let previous: LineKind = 'blank';

  for (const line of markdown.replace(/\r\n/g, '\n').split('\n')) {
    if (/^```/.test(line)) {
      if (!inFence && previous !== 'blank') out.push('');
      inFence = !inFence;
      out.push(line);
      previous = inFence ? 'text' : 'blank';
      continue;
    }
    if (inFence) {
      out.push(line);
      continue;
    }
    const kind = classifyLine(line);
    if (kind !== 'blank' && previous !== 'blank' && kind !== previous) out.push('');
    if (kind === 'heading' || kind === 'rule') {
      out.push(line);
      previous = 'blank';
      out.push('');
      continue;
    }
    out.push(line);
    previous = kind;
  }
  return out.join('\n');
}
