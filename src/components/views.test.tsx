import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { analyze } from '../model/calc';
import { newIsland } from '../model/state';
import { ChainView } from './ChainView';
import { EmpireView } from './EmpireView';
import { IslandView } from './IslandView';
import { StatusBar } from './StatusBar';
import { TradeView } from './TradeView';

const settings = { applyUnlocks: true, revenue: 'medium' as const };
const ow = { ...newIsland('Crown Falls', 5000000), residents: { 15000000: 500, 15000001: 800 }, buildings: { 1010278: 1 } };
const nw = { ...newIsland('Manola', 5000001), residents: { 15000005: 300 }, buildings: { 1010340: 2 } };

const analysis = analyze([ow, nw], settings);

describe('views render', () => {
  it('island view', () => {
    const html = renderToString(<IslandView island={ow} islands={[ow, nw]} routes={[]} settings={settings} analysis={analysis} dispatch={() => {}} onOpenTrade={() => {}} />);
    expect(html).toContain('Crown Falls');
    expect(html).toContain('Fishery');
    expect(html).toContain('shortage-strip');
    expect(html).toContain('needed');
  });

  it('empire view', () => {
    const html = renderToString(<EmpireView islands={[ow, nw]} settings={settings} analysis={analysis} onOpenIsland={() => {}} />);
    expect(html).toContain('Manola');
  });

  it('trade view', () => {
    const routes = [{ id: 'r', from: nw.id, to: ow.id, product: 1010257, amount: null }];
    const a = analyze([ow, nw], settings, routes);
    const html = renderToString(<TradeView islands={[ow, nw]} routes={routes} analysis={a} dispatch={() => {}} onOpenIsland={() => {}} />);
    expect(html).toContain('Rum');
    expect(html).toContain('Suggested routes');
  });

  it('chain view', () => {
    expect(renderToString(<ChainView />)).toContain('Totals');
  });
});

describe('status bar', () => {
  it('shows workforce and pinned construction goods', () => {
    const html = renderToString(<StatusBar island={ow} analysis={analysis} onOpen={() => {}} />);
    expect(html).toContain('Crown Falls');
    expect(html).toContain('Steel Beams');
    expect(html).toContain('Windows');
  });
});
