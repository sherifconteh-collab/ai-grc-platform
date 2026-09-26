/**
 * Bring a deep-link target into view and focus it. Client-side navigation moves
 * focus itself shortly after a page mounts, so a single focus() call can be
 * undone; this retries for up to a second until the element holds focus.
 */
export function focusTarget(id: string, block: ScrollLogicalPosition = 'center'): void {
  let tries = 0;
  const attempt = () => {
    const el = document.getElementById(id);
    if (el) {
      if (tries === 0) el.scrollIntoView({ block });
      if (document.activeElement !== el) el.focus({ preventScroll: tries > 0 });
    }
    tries += 1;
    if (tries < 10 && (!el || document.activeElement !== el)) window.setTimeout(attempt, 100);
  };
  window.setTimeout(attempt, 50);
}
