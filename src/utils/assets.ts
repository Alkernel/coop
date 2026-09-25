// ---------------------------------------------------------------------------
// Asset metadata — ONE place that maps an asset to its logo, symbol and
// network label, so the wallet and the explorer always render USDT / Coopcoin
// / Coopoint identically.
//
// Logo rules (do not change):
//   Coopcoin  -> theme-adaptive Coop mark (CoinIcon 'COOP' / 'COIN')
//   Coopoint  -> /logos/cooptoken.svg (untouched)
//   USDT      -> /logos/usdt.svg      (current USDT logo)
// ---------------------------------------------------------------------------

export type CoinKind = 'COOP' | 'COOPTOKEN' | 'USDT' | 'COIN';

export interface AssetMeta {
  key: 'COOP' | 'COOPTOKEN' | 'USDT';
  coin: CoinKind;
  name: string;
  symbol: string;
  network: string;
}

export const COOP_ASSET: AssetMeta = {
  key: 'COOP',
  coin: 'COOP',
  name: 'Coopcoin',
  symbol: 'COOP',
  network: 'COOP internal ledger'
};

export const COOPTOKEN_ASSET: AssetMeta = {
  key: 'COOPTOKEN',
  coin: 'COOPTOKEN',
  name: 'Coopoint',
  symbol: 'Coopoint',
  network: 'Mining rewards (internal)'
};

export const USDT_ASSET: AssetMeta = {
  key: 'USDT',
  coin: 'USDT',
  name: 'USDT',
  symbol: 'USDT',
  network: 'BEP-20'
};

// Ledger `currency` values seen in the database:
//   'COOP' | 'Coopoints' | 'Cooptoken'  (USDT rows are only created once real
//   on-chain payments exist — until then no fake USDT rows are ever shown).
export const assetFromCurrency = (currency?: string | null): AssetMeta => {
  const c = (currency || '').trim().toLowerCase();
  if (c === 'usdt') return USDT_ASSET;
  if (c === 'coopoints' || c === 'cooptoken' || c === 'points') return COOPTOKEN_ASSET;
  return COOP_ASSET;
};

// Short label used next to amounts (matches the wallet's existing wording).
export const assetAmountLabel = (currency?: string | null): string =>
  assetFromCurrency(currency).symbol;
