import tippy, { animateFill, type Props, type Instance } from 'tippy.js';
import { createTooltipWith, type TooltipStyle } from './tooltip-factory';
export type { TooltipStyle } from './tooltip-factory';

/** Classic is the default; the explicit style signature remains supported. */
export function createTooltip(target: HTMLElement, options?: Partial<Props>): Instance;
export function createTooltip(target: HTMLElement, style: TooltipStyle, options?: Partial<Props>): Instance;
export function createTooltip(
  target: HTMLElement,
  styleOrOptions: TooltipStyle | Partial<Props> = 'classic',
  options: Partial<Props> = {},
): Instance {
  const style = typeof styleOrOptions === 'string' ? styleOrOptions : 'classic';
  return createTooltipWith(tippy, animateFill, target, style,
    typeof styleOrOptions === 'string' ? options : styleOrOptions);
}
