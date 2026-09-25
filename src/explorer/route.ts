// ---------------------------------------------------------------------------
// Coop Explorer routes.
//
// The explorer is a real page inside the same Coop web app:
//   /explorer                -> ledger overview + search
//   /explorer/tx/{hash}      -> transaction detail
//   /explorer/address/{addr} -> wallet/address activity
//   /explorer/search?q=...   -> search that found nothing
//
// The path is read from window.location, and every in-page move uses
// history.pushState, so deep links and the browser back button both work.
// ---------------------------------------------------------------------------

export const EXPLORER_HOME = '/explorer';

export type ExplorerRoute =
  | { name: 'home'; query: string }
  | { name: 'tx'; hash: string }
  | { name: 'address'; address: string }
  | { name: 'notfound' };

export const explorerTxPath = (hash: string): string =>
  `${EXPLORER_HOME}/tx/${encodeURIComponent(hash)}`;

export const explorerAddressPath = (address: string): string =>
  `${EXPLORER_HOME}/address/${encodeURIComponent(address)}`;

export const explorerNotFoundPath = (query: string): string =>
  `${EXPLORER_HOME}/search?q=${encodeURIComponent(query)}`;

export const isExplorerPath = (pathname: string): boolean =>
  /^\/explorer(\/|$)/i.test(pathname);

const safeDecode = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

export const parseExplorerRoute = (pathname: string, search: string = ''): ExplorerRoute => {
  const parts = pathname.split('/').filter(Boolean);
  const query = new URLSearchParams(search).get('q') || '';

  if (parts.length === 0 || parts[0].toLowerCase() !== 'explorer' || parts.length === 1) {
    return { name: 'home', query };
  }

  const kind = (parts[1] || '').toLowerCase();
  const value = parts[2] ? safeDecode(parts[2]) : '';

  if (kind === 'tx' || kind === 'transaction') {
    return value ? { name: 'tx', hash: value } : { name: 'home', query };
  }
  if (kind === 'address' || kind === 'wallet') {
    return value ? { name: 'address', address: value } : { name: 'home', query };
  }
  if (kind === 'search') {
    return { name: 'home', query };
  }
  return { name: 'notfound' };
};
