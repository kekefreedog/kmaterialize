import { Dropdown } from "../dropdown/dropdown";

/** Initialize Materialize dropdowns and the additional button selection states. */
export function initMaterialButtons(root: HTMLElement): () => void {
  const events = new AbortController();

  const triggers = Array.from(
    root.querySelectorAll<HTMLElement>(".dropdown-trigger"),
  );
  // Remember ownership before Dropdown moves a FAB menu into document.body.
  const menus = new Set(
    triggers.map((trigger) =>
      document.getElementById(trigger.dataset.target!)!,
    ),
  );
  const owns = (element: Element) =>
    root.contains(element) ||
    Array.from(menus).some((menu) => menu.contains(element));

  const dropdowns = triggers.map((trigger) =>
    Dropdown.init(trigger, {
      alignment: "right",
      constrainWidth: false,
      coverTrigger: false,
      closeOnClick: true,
      // FAB popups escape their demo container; split menus keep their default parent.
      ...(trigger.closest(".btn-fab-menu") ? { container: document.body } : {}),
    }),
  );

  // Dropdown activates its focused item on Enter. Suppress the native follow-up
  // click when focus returns to a button trigger, which would reopen the menu.
  document.addEventListener(
    "keydown",
    (event) => {
      if (
        event.key === "Enter" &&
        owns(event.target as Element) &&
        (event.target as Element).closest(".dropdown-content")
      ) {
        event.preventDefault();
      }
    },
    { capture: true, signal: events.signal },
  );

  document.addEventListener(
    "click",
    (event) => {
      const action = (event.target as Element).closest<HTMLElement>(
        "[data-action], .btn-toggle",
      );
      if (!action || !owns(action) || action.matches(":disabled")) return;
      // Demo menu actions are links, following the standard dropdown markup.
      if (action.matches("a[data-action]")) event.preventDefault();

      if (action.classList.contains("btn-toggle")) {
        const group = action.closest<HTMLElement>("[data-selection]");
        const selected = action.getAttribute("aria-pressed") === "true";
        if (group?.dataset.selection === "single") {
          group.querySelectorAll(".btn-toggle").forEach((item) => {
            item.setAttribute("aria-pressed", String(item === action));
          });
        } else {
          action.setAttribute("aria-pressed", String(!selected));
        }
      }

      // Keep application behavior separate from selection and dropdown behavior.
      if (action.dataset.action) {
        root.dispatchEvent(
          new CustomEvent("buttonaction", {
            bubbles: true,
            detail: {
              action: action.dataset.action,
              pressed: action.getAttribute("aria-pressed"),
            },
          }),
        );
      }
    },
    { signal: events.signal },
  );

  return () => {
    dropdowns.forEach((dropdown) => dropdown.destroy());
    events.abort();
  };
}
