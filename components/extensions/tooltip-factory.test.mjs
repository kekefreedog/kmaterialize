import { afterEach, expect, test, vi } from 'vitest';
import { createTooltipWith } from './tooltip-factory';

afterEach(() => vi.unstubAllGlobals());

for (const shape of ['function', 'default', 'nested-default']) {
  test(`creates and cleans up a tooltip from a ${shape} export`, () => {
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
    const document = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
    vi.stubGlobal('document', document);
    const destroy = vi.fn();
    const tooltip = { hide: vi.fn(), destroy };
    const factory = vi.fn(() => tooltip);
    const plugin = { name: 'animateFill' };
    const module = shape === 'function' ? factory : shape === 'default'
      ? { default: factory, animateFill: plugin }
      : { default: { default: factory, animateFill: plugin } };
    const target = {};
    const result = createTooltipWith(module, undefined, target, 'classic', { content: 'Home & Tools' });
    expect(factory).toHaveBeenCalledWith(target, expect.objectContaining({ content: 'Home & Tools' }));
    if (shape !== 'function') expect(factory.mock.calls[0][1].plugins).toEqual([plugin]);
    document.addEventListener.mock.calls[0][1]({ key: 'Escape' });
    expect(tooltip.hide).toHaveBeenCalledOnce();
    result.destroy();
    expect(destroy).toHaveBeenCalledOnce();
    expect(document.removeEventListener).toHaveBeenCalledWith('keydown', expect.any(Function));
  });
}

test('rejects missing or cyclic exports with a useful error', () => {
  const cyclic = {}; cyclic.default = cyclic;
  for (const value of [undefined, {}, { default: {} }, cyclic]) {
    expect(() => createTooltipWith(value, undefined, {}, 'classic')).toThrow('did not export a tooltip function');
  }
});
