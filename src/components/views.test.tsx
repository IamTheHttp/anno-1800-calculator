import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { newIsland } from '../model/state';
import { ChainView } from './ChainView';
import { EmpireView } from './EmpireView';
import { IslandView } from './IslandView';

const settings = { applyUnlocks: true };
const ow = { ...newIsland('Crown Falls', 5000000), residents: { 15000000: 500, 15000001: 800 }, buildings: { 1010278: 1 } };
const nw = { ...newIsland('Manola', 5000001), residents: { 15000005: 300 }, buildings: { 1010340: 2 } };

describe('views render', () => {
  it('island view', () => {
    const html = renderToString(<IslandView island={ow} settings={settings} dispatch={() => {}} />);
    expect(html).toContain('Crown Falls');
    expect(html).toContain('Fishery');
  });

  it('empire view', () => {
    const html = renderToString(<EmpireView islands={[ow, nw]} settings={settings} onOpenIsland={() => {}} />);
    expect(html).toContain('Manola');
  });

  it('chain view', () => {
    expect(renderToString(<ChainView />)).toContain('Totals');
  });
});
