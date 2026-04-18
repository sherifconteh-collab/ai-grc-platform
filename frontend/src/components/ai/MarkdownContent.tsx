'use client';

/**
 * MarkdownContent — pure-JSX rendering of LLM markdown output.
 *
 * NO `dangerouslySetInnerHTML` is ever used. We tokenize the input by line
 * and emit semantic React elements directly. URLs are hard-restricted to a
 * small allow-list (`http`, `https`, `mailto`, `tel`); any other scheme is
 * rendered as plain text. This eliminates the entire class of XSS that comes
 * from injecting raw HTML, including `javascript:` link injection.
 *
 * Supported syntax (intentionally minimal — auditor-friendly readability,
 * not full GFM):
 *   - `# H1`, `## H2`, `### H3`
 *   - `- ` / `* ` unordered list items
 *   - `1. ` ordered list items
 *   - ```` ``` ```` fenced code blocks
 *   - `**bold**`, `*italic*`, `` `code` ``
 *   - `[label](url)` links (allow-listed schemes only)
 *   - blank lines split paragraphs
 *
 * Anything outside this set is rendered as escaped plain text.
 */

import React from 'react';

const ALLOWED_LINK_SCHEMES = ['http:', 'https:', 'mailto:', 'tel:'];

function isAllowedUrl(raw: string): boolean {
  try {
    // Use a permissive base so relative URLs don't throw.
    const u = new URL(raw, 'https://example.invalid/');
    return ALLOWED_LINK_SCHEMES.includes(u.protocol);
  } catch {
    return false;
  }
}

// Render inline markdown: **bold**, *italic*, `code`, [text](url).
// Returns an array of React nodes; never returns raw HTML.
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Single regex with alternation; we walk matches in order.
  const re = /(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)\s]+)\))/g;
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIdx) {
      nodes.push(text.slice(lastIdx, m.index));
    }
    const key = `${keyPrefix}-${i++}`;
    if (m[1]) {
      nodes.push(<strong key={key}>{m[2]}</strong>);
    } else if (m[3]) {
      nodes.push(<em key={key}>{m[4]}</em>);
    } else if (m[5]) {
      nodes.push(<code key={key} className="rounded bg-zinc-200 px-1 py-0.5 font-mono text-[0.85em] dark:bg-zinc-700">{m[6]}</code>);
    } else if (m[7]) {
      const label = m[8];
      const url = m[9];
      if (isAllowedUrl(url)) {
        nodes.push(
          <a key={key} href={url} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline hover:text-blue-700 dark:text-blue-400">
            {label}
          </a>
        );
      } else {
        // Disallowed scheme — render the source as plain text, not a link.
        nodes.push(<span key={key}>{m[0]}</span>);
      }
    }
    lastIdx = re.lastIndex;
  }
  if (lastIdx < text.length) nodes.push(text.slice(lastIdx));
  return nodes;
}

interface MarkdownContentProps {
  children: string;
  className?: string;
}

export default function MarkdownContent({ children, className }: MarkdownContentProps) {
  if (typeof children !== 'string' || children.length === 0) {
    return <div className={className} />;
  }

  const lines = children.split(/\r?\n/);
  const blocks: React.ReactNode[] = [];
  let i = 0;

  // Block accumulators
  let paragraph: string[] = [];
  let ul: string[] = [];
  let ol: string[] = [];

  const flushParagraph = (key: string) => {
    if (!paragraph.length) return;
    const text = paragraph.join(' ');
    blocks.push(
      <p key={key} className="my-2 leading-relaxed">{renderInline(text, key)}</p>
    );
    paragraph = [];
  };
  const flushUl = (key: string) => {
    if (!ul.length) return;
    blocks.push(
      <ul key={key} className="my-2 list-disc space-y-1 pl-5">
        {ul.map((item, idx) => (
          <li key={`${key}-${idx}`}>{renderInline(item, `${key}-${idx}`)}</li>
        ))}
      </ul>
    );
    ul = [];
  };
  const flushOl = (key: string) => {
    if (!ol.length) return;
    blocks.push(
      <ol key={key} className="my-2 list-decimal space-y-1 pl-5">
        {ol.map((item, idx) => (
          <li key={`${key}-${idx}`}>{renderInline(item, `${key}-${idx}`)}</li>
        ))}
      </ol>
    );
    ol = [];
  };
  const flushAll = (key: string) => {
    flushParagraph(`${key}-p`);
    flushUl(`${key}-ul`);
    flushOl(`${key}-ol`);
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Fenced code block
    if (/^```/.test(trimmed)) {
      flushAll(`pre-${i}`);
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i].trim())) {
        codeLines.push(lines[i]);
        i++;
      }
      blocks.push(
        <pre key={`code-${i}`} className="my-2 overflow-x-auto rounded bg-zinc-900 p-3 font-mono text-xs text-zinc-100">
          <code>{codeLines.join('\n')}</code>
        </pre>
      );
      i++; // consume closing fence
      continue;
    }

    // Headings
    let h: RegExpMatchArray | null;
    if ((h = trimmed.match(/^(#{1,3})\s+(.+)$/))) {
      flushAll(`h-${i}`);
      const level = h[1].length;
      const text = h[2];
      const sizes = ['text-lg font-semibold', 'text-base font-semibold', 'text-sm font-semibold uppercase tracking-wide'];
      const Tag = (`h${level + 2}`) as 'h3' | 'h4' | 'h5'; // h1->h3, h2->h4, h3->h5 (avoid colliding with page h1)
      blocks.push(
        React.createElement(Tag, { key: `h-${i}`, className: `mt-3 mb-1 ${sizes[level - 1]}` }, renderInline(text, `h-${i}`))
      );
      i++;
      continue;
    }

    // Unordered list
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^\s*[-*]\s+(.+)$/))) {
      flushParagraph(`p-${i}`);
      flushOl(`ol-${i}`);
      ul.push(m[1]);
      i++;
      continue;
    }

    // Ordered list
    if ((m = line.match(/^\s*\d+\.\s+(.+)$/))) {
      flushParagraph(`p-${i}`);
      flushUl(`ul-${i}`);
      ol.push(m[1]);
      i++;
      continue;
    }

    // Blank line ends current block
    if (trimmed === '') {
      flushAll(`flush-${i}`);
      i++;
      continue;
    }

    // Default: paragraph line
    flushUl(`ul-${i}`);
    flushOl(`ol-${i}`);
    paragraph.push(trimmed);
    i++;
  }
  flushAll('end');

  return <div className={className}>{blocks}</div>;
}
