import { Props, Instance } from 'tippy.js';

type TooltipStyle = "classic" | "material";

/** Classic is the default; the explicit style signature remains supported. */
declare function createTooltip(target: HTMLElement, options?: Partial<Props>): Instance;
declare function createTooltip(target: HTMLElement, style: TooltipStyle, options?: Partial<Props>): Instance;

export { createTooltip };
export type { TooltipStyle };
