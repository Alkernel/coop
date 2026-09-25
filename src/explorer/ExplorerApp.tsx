import React, { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { CoopLogo } from '../components/CoopLogo';
import { dbService } from '../services/supabase';
import './explorer.css';
import { ExplorerNavProvider, useExplorerNav } from './nav';
import {
  EXPLORER_HOME, explorerAddressPath, explorerNotFoundPath, explorerTxPath
} from './route';
import { ExplorerHome } from './ExplorerHome';
import { ExplorerTxPage } from './ExplorerTxPage';
import { ExplorerAddressPage } from './ExplorerAddressPage';

// ---------------------------------------------------------------------------
// Search: hash or wallet address, resolved against the live ledger.
// ---------------------------------------------------------------------------
const SearchBar: React.FC = () => {
  const { navigate } = useExplorerNav();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = value.trim();
    if (!q || busy) return;
    setBusy(true);
    setError('');
    try {
      const hit = await dbService.explorerLookup(q);
      if (hit.kind === 'tx') navigate(explorerTxPath(hit.hash));
      else if (hit.kind === 'address') navigate(explorerAddressPath(hit.address));
      else navigate(explorerNotFoundPath(q));
    } catch (err: any) {
      setError(err?.message || 'Search failed — check your connection and try again');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="explorer-search-block">
      <form className="explorer-search" onSubmit={submit}>
        <Search size={17} />
        <input
          type="text"
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder="Search by transaction hash or wallet address"
          spellCheck={false}
          autoComplete="off"
          aria-label="Search the Coop ledger"
        />
        <button type="submit" disabled={busy || !value.trim()}>
          {busy ? 'Searching…' : 'Search'}
        </button>
      </form>
      {error ? (
        <div className="explorer-error" style={{ marginTop: 10 }}>{error}</div>
      ) : (
        <div className="explorer-hint">
          Transaction hash (e.g. 0x97cc77d0…) or Coop wallet address (0x…).
          Data is read live from the Coop ledger — never simulated.
        </div>
      )}
    </div>
  );
};

const ExplorerBody: React.FC = () => {
  const { route } = useExplorerNav();

  useEffect(() => {
    const title = route.name === 'tx'
      ? `Transaction ${route.hash.slice(0, 12)}… · COOP Explorer`
      : route.name === 'address'
        ? `Wallet ${route.address.slice(0, 12)}… · COOP Explorer`
        : 'COOP Explorer — search the Coop ledger';
    document.title = title;
  }, [route]);

  switch (route.name) {
    case 'tx':
      return <ExplorerTxPage hash={route.hash} />;
    case 'address':
      return <ExplorerAddressPage address={route.address} />;
    case 'notfound':
      return (
        <div className="explorer-card" style={{ marginTop: 18 }}>
          <div className="explorer-empty">
            That explorer page does not exist.
            <div style={{ marginTop: 14 }}>
              <a className="explorer-btn explorer-btn-primary" href={EXPLORER_HOME}>Open the explorer</a>
            </div>
          </div>
        </div>
      );
    default:
      return <ExplorerHome query={route.query} />;
  }
};

// ---------------------------------------------------------------------------
// App shell — wallet at /, explorer at /explorer (same Coop identity).
// ---------------------------------------------------------------------------
export const ExplorerApp: React.FC = () => (
  <ExplorerNavProvider>
    <div className="explorer-shell">
      <header className="explorer-topbar">
        <div className="explorer-wrap explorer-topbar-inner">
          <a className="explorer-brand" href={EXPLORER_HOME}>
            <CoopLogo size={26} />
            <span className="explorer-brand-name">COOP</span>
            <span className="explorer-brand-sub">Explorer</span>
          </a>
          <div className="explorer-topbar-actions">
            <a className="explorer-btn" href="/">Wallet</a>
          </div>
        </div>
      </header>

      <div className="explorer-wrap" style={{ flex: 1, display: 'flex', flexDirection: 'column', width: '100%' }}>
        <SearchBar />
        <ExplorerBody />
      </div>

      <footer className="explorer-footer">
        <div className="explorer-wrap">
          COOP Explorer indexes the live Coop internal ledger (production database).
          Every record shown comes from real wallet activity — no demo or placeholder
          transactions. Block-level data will appear here once the Coop chain is live.
        </div>
      </footer>
    </div>
  </ExplorerNavProvider>
);
