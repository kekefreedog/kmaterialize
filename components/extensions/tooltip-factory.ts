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
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  const instance = factory(target, {
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
