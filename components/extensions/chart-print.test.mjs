import { expect, test } from 'vitest';
import { chartPrintLayout } from './chart-print';

test('preserves A3 landscape defaults and avoids enlarging small charts', () => {
  expect(chartPrintLayout(100, 100)).toMatchObject({format:'A3',orientation:'landscape',scale:1});
});
test('fits A4 landscape and portrait within 10mm margins', () => {
  const landscape = chartPrintLayout(2000, 1000, {format:'A4',orientation:'landscape'});
  const portrait = chartPrintLayout(2000, 1000, {format:'A4',orientation:'portrait'});
  expect(landscape.scale).toBeCloseTo(277*96/25.4/2000);
  expect(portrait.scale).toBeCloseTo(190*96/25.4/2000);
});
test('scales tall charts by height and supports Letter', () => {
  expect(chartPrintLayout(100,2000,{format:'letter',orientation:'portrait'}).scale).toBeCloseTo(259.4*96/25.4/2000);
});
test('rejects invalid options', () => {
  expect(()=>chartPrintLayout(100,100,{format:'invalid'})).toThrow(/format/);
  expect(()=>chartPrintLayout(100,100,{orientation:'sideways'})).toThrow(/orientation/);
});

test('centers small and scaled charts within the printable area', () => {
  for (const orientation of ['portrait', 'landscape']) {
    for (const [width,height] of [[100,100],[1800,3000]]) {
      const layout=chartPrintLayout(width,height,{format:'A4',orientation});
      expect(layout.left).toBeGreaterThanOrEqual(0);
      expect(layout.top).toBeGreaterThanOrEqual(0);
      expect(layout.left*2+width*layout.scale).toBeCloseTo(layout.printableWidth);
      expect(layout.top*2+height*layout.scale).toBeCloseTo(layout.printableHeight);
    }
  }
});
