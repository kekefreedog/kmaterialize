/** Enhance a submission-style checklist. Ordinary lists need no initialization. */
export function initListChecklist(root: HTMLElement): () => void {
  const events = new AbortController();
  const controls = () =>
    Array.from(
      root.querySelectorAll<HTMLInputElement>('.list-control[type="checkbox"]'),
    );

  function updateProgress() {
    const items = controls();
    const completed = items.filter((item) => item.checked).length;
    const label = root.querySelector<HTMLElement>("[data-list-progress-label]");
    const progress = root.querySelector<HTMLProgressElement>("progress");
    if (label) label.textContent = `${completed} / ${items.length} completed`;
    if (progress) {
      progress.max = Math.max(items.length, 1);
      progress.value = completed;
    }
    return { completed, total: items.length };
  }

  root.addEventListener(
    "change",
    (event) => {
      const control = event.target;
      if (
        !(control instanceof HTMLInputElement) ||
        !control.matches('.list-control[type="checkbox"]')
      )
        return;
      const stamp = control
        .closest(".list-item")
        ?.querySelector<HTMLElement>("[data-list-stamp]");
      if (stamp) {
        stamp.hidden = !control.checked;
        const name = stamp.querySelector("[data-list-checker]");
        const time = stamp.querySelector("time");
        if (control.checked) {
          if (name) name.textContent = root.dataset.checker || "You";
          if (time) {
            const now = new Date();
            time.dateTime = now.toISOString();
            time.textContent = now.toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            });
          }
        } else {
          if (name) name.textContent = "";
          if (time) {
            time.textContent = "";
            time.removeAttribute("datetime");
          }
        }
      }
      root.dispatchEvent(
        new CustomEvent("listchange", {
          bubbles: true,
          detail: {
            value: control.value,
            checked: control.checked,
            ...updateProgress(),
          },
        }),
      );
    },
    { signal: events.signal },
  );

  // Preserve supplied author/time data for items checked before initialization.
  controls().forEach((control) => {
    const stamp = control
      .closest(".list-item")
      ?.querySelector<HTMLElement>("[data-list-stamp]");
    if (stamp) stamp.hidden = !control.checked;
  });
  updateProgress();
  return () => events.abort();
}
