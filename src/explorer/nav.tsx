import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ExplorerRoute, parseExplorerRoute } from './route';

interface ExplorerNavValue {
  route: ExplorerRoute;
  /** Current path + query (drives re-renders) */
  path: string;
  navigate: (path: string, opts?: { replace?: boolean }) => void;
}

const ExplorerNavContext = createContext<ExplorerNavValue | undefined>(undefined);

export const ExplorerNavProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [path, setPath] = useState<string>(
    () => `${window.location.pathname}${window.location.search}`
  );

  // Keep in step with the browser / hardware back button.
  useEffect(() => {
    const onPop = () => setPath(`${window.location.pathname}${window.location.search}`);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((next: string, opts?: { replace?: boolean }) => {
    try {
      if (opts?.replace) window.history.replaceState({ coopExplorer: true }, '', next);
      else window.history.pushState({ coopExplorer: true }, '', next);
    } catch {
      window.location.assign(next);
      return;
    }
    setPath(`${window.location.pathname}${window.location.search}`);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  const value = useMemo<ExplorerNavValue>(
    () => ({ path, navigate, route: parseExplorerRoute(window.location.pathname, window.location.search) }),
    [path, navigate]
  );

  return <ExplorerNavContext.Provider value={value}>{children}</ExplorerNavContext.Provider>;
};

export const useExplorerNav = (): ExplorerNavValue => {
  const ctx = useContext(ExplorerNavContext);
  if (!ctx) throw new Error('useExplorerNav must be used inside the Coop Explorer');
  return ctx;
};
