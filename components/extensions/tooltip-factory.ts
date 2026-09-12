import type tippy from "tippy.js";
import type { animateFill, Props, Instance } from "tippy.js";

export type TooltipStyle = "classic" | "material";

/** Shared tooltip configuration for direct imports and lazy component tooltips. */
export function createTooltipWith(
  factory: typeof tippy,
  fill: typeof animateFill | undefined,
  target: HTMLElement,
  style: TooltipStyle,
  options: Partial<Props> = {},
): Instance {
  // Dynamic imports of CommonJS builds can wrap Tippy in one or more
  // default exports. Static ESM imports and browser globals are callable already.
  let resolved: unknown = factory;
  const seen = new Set<unknown>();
  while (resolved && typeof resolved === "object" && !seen.has(resolved)) {
    seen.add(resolved);
    const module = resolved as { default?: unknown; animateFill?: typeof animateFill };
    fill ??= module.animateFill;
    resolved = module.default;
  }
  if (typeof resolved !== "function") {
    throw new TypeError('kmaterialize: "tippy.js" did not export a tooltip function.');
  }
  const create = resolved as typeof tippy;
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  const instance = create(target, {
    animateFill: !reducedMotion && !!fill,
    arrow: false,
    plugins: fill ? [fill] : [],
    placement: "auto",
    theme: style === "material" ? "materialize" : "",
    allowHTML: false,
    ...options,
    ...(reducedMotion
      ? { animateFill: false, animation: false, duration: 0 }
      : {}),
  });
  // Escape dismisses a focused tooltip without moving keyboard focus.
  const escape = (event: KeyboardEvent) => {
    if (event.key === "Escape") instance.hide();
  };
  document.addEventListener("keydown", escape);
  const destroy = instance.destroy.bind(instance);
  instance.destroy = () => {
    document.removeEventListener("keydown", escape);
    destroy();
  };
  return instance;
}
