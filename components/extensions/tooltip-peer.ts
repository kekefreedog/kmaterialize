import type tippy from 'tippy.js';
import type { animateFill } from 'tippy.js';
import { loadPeer } from '../../src/peer-loader';

interface TooltipPeer { create: typeof tippy; fill?: typeof animateFill }
let pending: Promise<TooltipPeer> | undefined;

/** Keep the optional tooltip peer out of the core bundle until a trigger needs it. */
export function loadTooltipPeer(): Promise<TooltipPeer> {
  if (!pending) {
    pending = loadPeer<TooltipPeer | typeof tippy>({
      specifier: 'tippy.js', globalName: 'tippy', feature: 'Classic tooltips',
      cdnHint: '<script src="path/to/tippy-bundle.umd.min.js"></script>',
    }, async () => {
      const module = await import('tippy.js');
      return { create: module.default, fill: module.animateFill };
    }).then(peer => typeof peer === 'function'
      ? { create: peer, fill: (peer as typeof tippy & { animateFill?: typeof animateFill }).animateFill }
      : peer).catch(error => { pending = undefined; throw error; });
  }
  return pending;
}
