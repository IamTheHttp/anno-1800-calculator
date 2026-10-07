import { shortages, type Analysis } from './calc';
import type { Id } from './gameData';
import type { Island } from './state';

export interface RouteSuggestion {
  to: Island;
  from: Island;
  product: Id;
  /** Tons per minute the destination lacks. */
  lacking: number;
  /** Tons per minute the source has spare. */
  spare: number;
}

const EPS = 1e-4;

/** The island (other than `to`) with the largest spare amount of `product` after current routes. */
export function bestSource(analysis: Analysis, islands: Island[], to: string, product: Id): { island: Island; spare: number } | null {
  let best: { island: Island; spare: number } | null = null;
  for (const i of islands) {
    if (i.id === to) continue;
    const spare = analysis.byIsland.get(i.id)?.find((b) => b.product === product)?.net ?? 0;
    if (spare > EPS && (!best || spare > best.spare)) best = { island: i, spare };
  }
  return best;
}

/** One route suggestion per island shortage that another island could cover. */
export function suggestRoutes(analysis: Analysis, islands: Island[]): RouteSuggestion[] {
  const out: RouteSuggestion[] = [];
  for (const to of islands) {
    const balance = analysis.byIsland.get(to.id) ?? [];
    for (const [product, kind] of shortages(balance, analysis.empire)) {
      if (kind !== 'import') continue;
      const src = bestSource(analysis, islands, to.id, product);
      if (!src) continue;
      const lacking = -(balance.find((b) => b.product === product)?.net ?? 0);
      out.push({ to, from: src.island, product, lacking, spare: src.spare });
    }
  }
  return out.sort((a, b) => b.lacking - a.lacking);
}
