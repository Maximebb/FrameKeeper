import { marked } from 'marked';
import usageMarkdown from '@docs/USAGE.md?raw';

/** Rendered from docs/USAGE.md at build time — keep that file as the single source of truth. */
export function Guide({ onBack }: { onBack?: () => void }) {
  const html = marked.parse(usageMarkdown, { gfm: true }) as string;

  return (
    <div class="guide-page">
      {onBack && (
        <div class="guide-toolbar">
          <button type="button" class="ghost" onClick={onBack}>
            ← Back
          </button>
        </div>
      )}
      <article class="guide-content" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
