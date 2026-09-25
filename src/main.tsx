import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { WalletProvider } from './context/WalletContext';
import { ThemeProvider } from './context/ThemeContext';
import { ExplorerApp } from './explorer/ExplorerApp';
import { isExplorerPath } from './explorer/route';
import './index.css';

// One app, two real pages:
//   /            -> the Coop wallet
//   /explorer*   -> the standalone (public) Coop blockchain explorer
// The explorer is intentionally rendered outside the WalletProvider: it needs
// no wallet session, no keys and no balances — only the public ledger.
const onExplorer = isExplorerPath(window.location.pathname);

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      {onExplorer ? (
        <ExplorerApp />
      ) : (
        <WalletProvider>
          <App />
        </WalletProvider>
      )}
    </ThemeProvider>
  </React.StrictMode>
);
