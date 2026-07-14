'use client';

/**
 * MarkdownContent — safe JSX-based markdown renderer for AI output.
 *
 * Does NOT use dangerouslySetInnerHTML — all output is produced as React
 * nodes, so there is no attack surface for HTML/JS injection via raw AI
 * responses or user-authored markdown.
 *
 * Supports the markdown subset the LLM commonly produces:
 *   - Fenced code blocks (```lang ... ``` — rendered dark theme)
 *   - Inline code (`code`)
 *   - H1–H4 headings
 *   - **bold** / *italic* / ***bold+italic***
 *   - Bullet (`- `, `* `) and numbered (`1. `) lists, including checkbox items
 *     (`- [ ]`, `- [x]`)
 *   - Blockquotes (`> `)
 *   - Horizontal rule (`---`)
 *   - Links [text](http(s)://...) — protocol allow-listed (http/https/mailto)
 *
 * All text is rendered as React children, so React's default escaping
 * prevents XSS. Links with unsafe protocols are rendered as plain text.
 */

import React from 'react';

// Allow-list the link protocols we permit. Anything else (javascript:,
// data:, file:, vbscript:, etc.) is rendered as plain text — never as an
// <a href=...>.
const SAFE_URL = /^(https?:|mailto:|tel:)/i;

// Inline formatting: runs over a single line of text and yields React nodes.
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Ordered by specificity so longer patterns win (e.g. ***x*** before **x**).
  // Each regex match becomes its own React node; non-matching runs are text.
  type Handler = { re: RegExp; render: (m: RegExpExecArray, key: string) => React.ReactNode };
  const handlers: Handler[] = [
    {
      re: /\[([^\]]+)\]\(([^)]+)\)/,
      render: (m, key) => {
        const url = m[2];
        if (SAFE_URL.test(url)) {
          return (
            <a key={key} href={url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
              {m[1]}
            </a>
          );
        }
        // Unsafe protocol — render the link text as plain text (never set href).
        return <span key={key}>{m[1]}</span>;
      },
    },
    { re: /`([^`]+)`/, render: (m, key) => (
      <code key={key} className="bg-gray-100 text-purple-700 rounded px-1.5 py-0.5 text-xs font-mono">{m[1]}</code>
    ) },
    { re: /\*\*\*([^*]+)\*\*\*/, render: (m, key) => (
      <strong key={key} className="font-semibold"><em>{m[1]}</em></strong>
    ) },
    { re: /\*\*([^*]+)\*\*/, render: (m, key) => (
      <strong key={key} className="font-semibold">{m[1]}</strong>
    ) },
    { re: /\*([^*]+)\*/, render: (m, key) => (
      <em key={key}>{m[1]}</em>
    ) },
  ];

  let remaining = text;
  let cursor = 0;
  // Greedy left-to-right scan across all handlers simultaneously.
  while (remaining.length > 0) {
    let best: { idx: number; handler: Handler; match: RegExpExecArray } | null = null;
    for (const handler of handlers) {
      const m = handler.re.exec(remaining);
      if (m && (best === null || m.index < best.idx)) {
        best = { idx: m.index, handler, match: m };
      }
    }
    if (!best) {
      if (remaining) nodes.push(remaining);
      break;
    }
    if (best.idx > 0) {
      nodes.push(remaining.slice(0, best.idx));
    }
    nodes.push(best.handler.render(best.match, `${keyPrefix}-${cursor++}`));
    remaining = remaining.slice(best.idx + best.match[0].length);
  }
  return nodes;
}

interface MarkdownContentProps {
  content: string;
  className?: string;
}

export function MarkdownContent({ content, className = '' }: MarkdownContentProps) {
  if (!content) return null;

  // Split into blocks separated by blank lines, but preserve fenced code blocks
  // as single blocks regardless of internal blank lines.
  const blocks: string[] = [];
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  let i = 0;
  let current: string[] = [];
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) {
      if (current.length) {
        blocks.push(current.join('\n'));
        current = [];
      }
      const codeLines: string[] = [line];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i])) {
        codeLines.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) {
        codeLines.push(lines[i]);
        i += 1;
      }
      blocks.push(codeLines.join('\n'));
      continue;
    }
    if (line.trim() === '') {
      if (current.length) {
        blocks.push(current.join('\n'));
        current = [];
      }
      i += 1;
      continue;
    }
    current.push(line);
    i += 1;
  }
  if (current.length) blocks.push(current.join('\n'));

  return (
    <div className={`prose prose-sm max-w-none text-gray-700 leading-relaxed ${className}`.trim()}>
      {blocks.map((block, bIdx) => renderBlock(block, bIdx))}
    </div>
  );
}

function renderBlock(block: string, bIdx: number): React.ReactNode {
  // Fenced code block
  const fence = /^```(\w*)\n?([\s\S]*?)```\s*$/.exec(block);
  if (fence) {
    return (
      <pre key={`b-${bIdx}`} className="bg-gray-900 text-green-300 rounded-lg p-4 overflow-x-auto text-sm my-4">
        <code>{fence[2]}</code>
      </pre>
    );
  }

  // Horizontal rule
  if (/^---+\s*$/.test(block)) {
    return <hr key={`b-${bIdx}`} className="my-4 border-gray-200" />;
  }

  const lines = block.split('\n');

  // Heading (single-line block starting with #)
  if (lines.length === 1) {
    const h4 = /^#### (.+)$/.exec(lines[0]);
    if (h4) return <h4 key={`b-${bIdx}`} className="text-sm font-semibold text-gray-800 mt-4 mb-1">{renderInline(h4[1], `h4-${bIdx}`)}</h4>;
    const h3 = /^### (.+)$/.exec(lines[0]);
    if (h3) return <h3 key={`b-${bIdx}`} className="text-base font-semibold text-gray-900 mt-5 mb-2">{renderInline(h3[1], `h3-${bIdx}`)}</h3>;
    const h2 = /^## (.+)$/.exec(lines[0]);
    if (h2) return <h2 key={`b-${bIdx}`} className="text-lg font-bold text-gray-900 mt-6 mb-2 border-b border-gray-200 pb-1">{renderInline(h2[1], `h2-${bIdx}`)}</h2>;
    const h1 = /^# (.+)$/.exec(lines[0]);
    if (h1) return <h1 key={`b-${bIdx}`} className="text-xl font-bold text-gray-900 mt-6 mb-3">{renderInline(h1[1], `h1-${bIdx}`)}</h1>;
  }

  // Blockquote (every line prefixed with >)
  if (lines.every((l) => /^>\s?/.test(l))) {
    const inner = lines.map((l) => l.replace(/^>\s?/, '')).join(' ');
    return (
      <blockquote key={`b-${bIdx}`} className="border-l-4 border-blue-400 pl-4 italic text-gray-600 my-3">
        {renderInline(inner, `bq-${bIdx}`)}
      </blockquote>
    );
  }

  // Unordered list (checkbox or plain bullet)
  if (lines.every((l) => /^[-*]\s+/.test(l))) {
    return (
      <ul key={`b-${bIdx}`} className="list-disc ml-6 my-2 space-y-1">
        {lines.map((l, idx) => {
          const cb = /^[-*]\s+\[( |x|X)\]\s+(.+)$/.exec(l);
          if (cb) {
            const checked = cb[1].toLowerCase() === 'x';
            return (
              <li key={`li-${bIdx}-${idx}`} className="list-none flex items-start gap-2">
                <span
                  className={`mt-1 w-4 h-4 ${checked ? 'bg-green-500 border-green-600' : 'border-gray-400'} border rounded flex-shrink-0 flex items-center justify-center text-white text-xs`}
                  aria-hidden="true"
                >
                  {checked ? '✓' : ''}
                </span>
                <span>{renderInline(cb[2], `cb-${bIdx}-${idx}`)}</span>
              </li>
            );
          }
          const bullet = /^[-*]\s+(.+)$/.exec(l);
          return (
            <li key={`li-${bIdx}-${idx}`} className="text-gray-700">
              {renderInline(bullet ? bullet[1] : l, `li-${bIdx}-${idx}`)}
            </li>
          );
        })}
      </ul>
    );
  }

  // Ordered list
  if (lines.every((l) => /^\d+\.\s+/.test(l))) {
    return (
      <ol key={`b-${bIdx}`} className="list-decimal ml-6 my-2 space-y-1">
        {lines.map((l, idx) => {
          const m = /^\d+\.\s+(.+)$/.exec(l);
          return (
            <li key={`oli-${bIdx}-${idx}`} className="text-gray-700">
              {renderInline(m ? m[1] : l, `oli-${bIdx}-${idx}`)}
            </li>
          );
        })}
      </ol>
    );
  }

  // Paragraph — join lines with spaces, preserve trailing line breaks via <br /> at line boundaries
  const nodes: React.ReactNode[] = [];
  lines.forEach((l, idx) => {
    if (idx > 0) nodes.push(<br key={`br-${bIdx}-${idx}`} />);
    nodes.push(...renderInline(l, `p-${bIdx}-${idx}`));
  });
  return (
    <p key={`b-${bIdx}`} className="mb-3 text-gray-700 leading-relaxed">{nodes}</p>
  );
}

export default MarkdownContent;
