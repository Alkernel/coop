import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { 
  ScreenName, 
  WalletAccount, 
  MiningStatus, 
  Transaction, 
  TaskItem, 
  AppNotification,
  AppSettings,
  SwapDirection
} from '../types';
import { dbService, isSupabaseConfigured } from '../services/supabase';
import { generateSecurePrivateKey, isValidPrivateKey } from '../services/crypto';

interface WalletContextType {
  currentScreen: ScreenName;
  navigateTo: (screen: ScreenName) => void;
  goBack: () => void;
  screenHistory: ScreenName[];
  
  account: WalletAccount | null;
  isAuthenticated: boolean;
  isLocked: boolean;
  booting: boolean;
  
  miningStatus: MiningStatus | null;
  miningRemainingMs: number;
  isMiningActive: boolean;
  dailyLimitReached: boolean;
  settings: AppSettings | null;
  
  // Selected asset for AssetScreen
  selectedAsset: 'COOP' | 'COOPTOKEN' | null;
  setSelectedAsset: (asset: 'COOP' | 'COOPTOKEN' | null) => void;
  
  tasks: TaskItem[];
  transactions: Transaction[];
  selectedTx: Transaction | null;
  notifications: AppNotification[];
  unreadNotificationsCount: number;
  
  // Auth
  loginWithPrivateKey: (key: string) => Promise<boolean>;
  generateNewAccount: () => { key: string };
  confirmAccountCreation: (key: string) => Promise<void>;
  logout: () => void;
  lockWallet: () => void;
  unlockWallet: (credential?: string) => boolean;
  
  // Actions
  startMining: () => Promise<void>;
  stopMining: () => Promise<number>;
  claimMining: () => Promise<number>;
  executeSwap: (direction: SwapDirection, amount: number) => Promise<{ points: number; coop: number; txHash: string }>;
  executeSend: (recipient: string, amount: number, memo?: string) => Promise<{ fee: number; status: string; txHash: string; recipientAddress: string; amount: number }>;
  openTransaction: (tx: Transaction) => void;
  purchaseBoost: (tierId: string) => Promise<boolean>;
  claimTask: (taskId: string) => Promise<number>;
  updateAccountSettings: (updates: Partial<WalletAccount>) => void;
  addNotification: (title: string, message: string, type?: AppNotification['type']) => void;
  markNotificationsAsRead: () => void;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

// Every screen the app can render. Used to validate a screen restored from the
// browser history so a stale value can never blank the UI.
const VALID_SCREENS: ScreenName[] = [
  'welcome', 'login', 'signup', 'home', 'mining', 'swap', 'send', 'receive',
  'history', 'price_boost', 'tasks', 'menu', 'settings', 'wallet_details',
  'help_support', 'about', 'security', 'locked', 'asset_detail', 'tx_detail'
];

// The bottom-nav destinations. Moving BETWEEN them replaces the current entry
// instead of stacking, so the back stack can never fill up with tab ping-pong
// (which made "back" look like it did nothing).
const ROOT_TABS: ScreenName[] = ['home', 'mining', 'tasks', 'menu'];

// Screens reachable before the wallet is unlocked. "Back" must never walk out
// of these into the dashboard, and must never skip the lock screen.
const PRE_AUTH_SCREENS: ScreenName[] = ['welcome', 'login', 'signup', 'locked'];

export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentScreen, setCurrentScreen] = useState<ScreenName>('welcome');
  const [screenHistory, setScreenHistory] = useState<ScreenName[]>(['welcome']);
  const [account, setAccount] = useState<WalletAccount | null>(null);
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [booting, setBooting] = useState<boolean>(true);
  const [miningStatus, setMiningStatus] = useState<MiningStatus | null>(null);
  const [miningRemainingMs, setMiningRemainingMs] = useState<number>(0);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<'COOP' | 'COOPTOKEN' | null>(null);
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const pollRef = useRef<number | null>(null);

  // --- Navigation internals ------------------------------------------------
  // The screen stack is mirrored in refs so a navigation decision is always
  // synchronous. The previous implementation computed the target screen INSIDE
  // a setScreenHistory() updater, which React is allowed to call twice or defer
  // - that is why "back" silently did nothing on some screens.
  const historyRef = useRef<ScreenName[]>(['welcome']);
  const screenRef = useRef<ScreenName>('welcome');
  const navDepthRef = useRef(0);   // our own entries above the browser baseline
  const selfPopsRef = useRef(0);   // popstate events our own history.back() will cause
  const selfPopDeadlineRef = useRef(0);

  const commitHistory = useCallback((next: ScreenName[]) => {
    historyRef.current = next;
    setScreenHistory(next);
  }, []);

  const applyScreen = useCallback((screen: ScreenName) => {
    screenRef.current = screen;
    setCurrentScreen(screen);
    try { localStorage.setItem('coop_current_screen', screen); } catch { /* ignore */ }
  }, []);

  const navigateTo = useCallback((screen: ScreenName) => {
    const prev = historyRef.current;
    const top = prev[prev.length - 1];
    if (top === screen) return;                       // already there - don't stack
    const next = (ROOT_TABS.includes(screen) && ROOT_TABS.includes(top))
      ? [...prev.slice(0, -1), screen]                // tab switch replaces
      : [...prev, screen];
    commitHistory(next);
    applyScreen(screen);
    // Mirror the move into the real browser history so the browser / Android
    // back button walks the wallet instead of leaving the web app.
    navDepthRef.current += 1;
    try {
      window.history.pushState({ coopScreen: screen, coopDepth: navDepthRef.current }, '');
    } catch { /* ignore */ }
  }, [commitHistory, applyScreen]);

  const goBack = useCallback(() => {
    const cur = screenRef.current;

    // Before the wallet is unlocked there is nothing behind us except the
    // welcome screen - never the dashboard.
    if (!account || PRE_AUTH_SCREENS.includes(cur)) {
      const target: ScreenName = (cur === 'login' || cur === 'signup') ? 'welcome' : cur;
      commitHistory([target]);
      applyScreen(target);
      return;
    }

    const prev = historyRef.current;
    // No history to pop (the classic case: the page was refreshed straight into
    // a sub-screen such as Swap). Fall back to the dashboard - never out of the
    // app, which is what used to happen.
    const next: ScreenName[] = prev.length > 1 ? prev.slice(0, -1) : ['home'];
    const target = next[next.length - 1];
    commitHistory(next);
    applyScreen(target);
    // Walk the browser history back too so the two stacks stay aligned.
    if (navDepthRef.current > 0) {
      navDepthRef.current -= 1;
      selfPopsRef.current += 1;
      selfPopDeadlineRef.current = Date.now() + 800;
      try { window.history.back(); } catch { /* ignore */ }
    }
  }, [account, commitHistory, applyScreen]);

  const addNotification = useCallback((title: string, message: string, type: AppNotification['type'] = 'info') => {
    setNotifications(prev => [
      { id: 'notif_' + Date.now(), title, message, type, timestamp: Date.now(), read: false },
      ...prev
    ]);
  }, []);

  const markNotificationsAsRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  // Server is the source of truth: mining state + balances always come from the DB
  const refreshMiningStatus = useCallback(async (walletId: string) => {
    try {
      const status = await dbService.getMiningStatus(walletId);
      setMiningStatus(status);
      setAccount(prev => (prev && prev.id === status.wallet.id
        ? { ...prev, coopBalance: status.wallet.coopBalance, cooptokenBalance: status.wallet.cooptokenBalance }
        : prev));
    } catch (e) {
      console.warn('Mining status refresh failed:', e);
    }
  }, []);

  const refreshAccountData = useCallback(async (acc: WalletAccount) => {
    try {
      setTransactions(await dbService.getTransactions(acc.id));
      setTasks(await dbService.getTasks(acc.id));
    } catch (e) {
      console.warn('Account data refresh failed:', e);
    }
    await refreshMiningStatus(acc.id);
  }, [refreshMiningStatus]);

﻿

  // Restore session from the stored private key (balances come from the server,
  // never from localStorage)
  useEffect(() => {
    if (!isSupabaseConfigured) { setBooting(false); return; }
    const storedKey = localStorage.getItem('coop_private_key');
    if (!storedKey) { setBooting(false); return; }
    (async () => {
      try {
        const acc = await dbService.authenticate(storedKey, false);
        setAccount(acc);
        setIsLocked(false);
        await refreshAccountData(acc);
        // Restore the exact page the user was on, or default to home
        const savedScreen = localStorage.getItem('coop_current_screen') as ScreenName | null;
        const restoredScreen = savedScreen && VALID_SCREENS.includes(savedScreen) ? savedScreen : 'home';
        // Seed both the state and the navigation refs so "back" works
        // immediately, even though the stack starts with a single entry.
        historyRef.current = [restoredScreen];
        screenRef.current = restoredScreen;
        setCurrentScreen(restoredScreen);
        setScreenHistory([restoredScreen]);
      } catch (e) {
        console.warn('Session restore failed:', e);
        localStorage.removeItem('coop_private_key');
      } finally {
        setBooting(false);
      }
    })();
  }, []);

  // Load public settings once
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    dbService.getSettings().then(setSettings).catch(e => console.warn('Settings load failed:', e));
  }, []);

  // Poll the server for mining progress (survives refresh/reopen).
  // Keyed on the wallet ID, not the account object: the account gets a new
  // identity on every poll, which used to tear down and rebuild this interval
  // every 15 seconds for no reason.
  const walletId = account?.id ?? null;
  useEffect(() => {
    if (!walletId) return;
    const poll = () => refreshMiningStatus(walletId);
    pollRef.current = window.setInterval(poll, 15000);
    const onVisible = () => { if (document.visibilityState === 'visible') poll(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [walletId, refreshMiningStatus]);

  // --- Browser / hardware back button --------------------------------------
  // The app never registered a popstate handler, so pressing back left the SPA
  // ("the web app closed"). Now every back press walks the wallet instead, and
  // at the root it re-arms so the app can never be exited with back.
  // Depends on a BOOLEAN, not the account object, so the baseline is not
  // re-written (and the depth counter not reset) on every mining poll.
  const authed = Boolean(account);
  useEffect(() => {
    if (!authed) return;
    // Baseline entry: gives the very first back press somewhere inside the app
    // to pop TO rather than falling out to the previous website.
    navDepthRef.current = 0;
    try { window.history.replaceState({ coopScreen: screenRef.current, coopDepth: 0 }, ''); } catch { /* ignore */ }

    const onPop = (ev: PopStateEvent) => {
      const st = (ev.state || null) as { coopScreen?: ScreenName; coopDepth?: number } | null;
      const depth = typeof st?.coopDepth === 'number' ? st.coopDepth : 0;

      // Triggered by our own in-app back button: the screen is already applied,
      // so only resync the depth counter.
      if (selfPopsRef.current > 0 && Date.now() < selfPopDeadlineRef.current) {
        selfPopsRef.current -= 1;
        navDepthRef.current = depth;
        return;
      }
      selfPopsRef.current = 0;

      navDepthRef.current = depth;

      // The lock screen is a gate - back must not walk around it.
      if (screenRef.current === 'locked') {
        try { window.history.pushState({ coopScreen: 'locked', coopDepth: 0 }, ''); } catch { /* ignore */ }
        return;
      }

      const prev = historyRef.current;
      const next: ScreenName[] = prev.length > 1 ? prev.slice(0, -1) : ['home'];
      // `fromState` is narrowed as a plain identifier, which a compound ternary
      // condition would not do.
      const fromState = st?.coopScreen;
      let target: ScreenName = (fromState && VALID_SCREENS.includes(fromState))
        ? fromState
        : next[next.length - 1];
      // A signed-in wallet must never navigate back into a gate screen
      // (welcome / login / signup / locked).
      if (PRE_AUTH_SCREENS.includes(target)) target = 'home';
      commitHistory(next);
      applyScreen(target);

      // Re-arm: keep one of our entries on the browser stack so the NEXT back
      // press also stays inside the app.
      if (depth === 0) {
        try { window.history.pushState({ coopScreen: target, coopDepth: 0 }, ''); } catch { /* ignore */ }
      }
    };

    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [authed, commitHistory, applyScreen]);

  // Landing back on the dashboard re-pulls balances, transactions and mining
  // state, so returning "home" always shows fresh numbers. Deduped by visit so
  // the account object changing identity cannot loop.
  const lastRefreshScreenRef = useRef<ScreenName | null>(null);
  useEffect(() => {
    if (lastRefreshScreenRef.current === currentScreen) return;
    lastRefreshScreenRef.current = currentScreen;
    if (account && currentScreen === 'home') void refreshAccountData(account);
  }, [account, currentScreen, refreshAccountData]);

  // Every screen starts at the top (back/forward used to keep the old scroll).
  useEffect(() => {
    const main = document.querySelector('.app-main-content');
    if (main) main.scrollTop = 0;
    window.scrollTo(0, 0);
  }, [currentScreen]);

  // Session countdown (display only — the server clock computes rewards)
  useEffect(() => {
    if (!miningStatus?.session || miningStatus.session.status !== 'mining') {
      setMiningRemainingMs(0);
      return;
    }
    const session = miningStatus.session;
    const update = () => setMiningRemainingMs(Math.max(0, session.endTime - Date.now()));
    update();
    const iv = window.setInterval(update, 1000);
    return () => window.clearInterval(iv);
  }, [miningStatus?.session]);

  const isMiningActive = Boolean(miningStatus?.session && miningStatus.session.status === 'mining' && miningRemainingMs > 0);
  // The server refuses to START a session unless a full 12h block still fits
  // in today's allowance, so the limit is purely hours-based. It must NOT
  // depend on the absence of a session, otherwise a stale/completed session
  // record leaves an enabled "Start" button that always fails.
  const dailyLimitReached = Boolean(
    miningStatus && miningStatus.hoursMinedToday >= miningStatus.dailyHours - 0.001
  );

  // --- Auth Handlers ---
  const loginWithPrivateKey = async (key: string): Promise<boolean> => {
    if (!isValidPrivateKey(key)) return false;
    try {
      const acc = await dbService.authenticate(key, false);
      setAccount(acc);
      setIsLocked(false);
      localStorage.setItem('coop_private_key', key.toLowerCase());
      // Start a fresh stack rather than stacking on top of "welcome": back from
      // the dashboard should not walk back into the login screen.
      commitHistory(['home']);
      applyScreen('home');
      addNotification('Welcome Back', 'Logged in successfully with your private key.', 'success');
      await refreshAccountData(acc);
      return true;
    } catch (e: any) {
      console.warn('Login failed:', e.message);
      return false;
    }
  };

  const generateNewAccount = () => {
    const key = generateSecurePrivateKey();
    return { key };
  };

  const confirmAccountCreation = async (key: string): Promise<void> => {
    const acc = await dbService.authenticate(key, true);
    setAccount(acc);
    setIsLocked(false);
    localStorage.setItem('coop_private_key', key.toLowerCase());
    commitHistory(['home']);
    applyScreen('home');
    addNotification('Account Created', 'Your COOP Wallet account is ready. Start mining to earn Coopoint!', 'success');
    // Refresh in the background — has its own try/catch. Do NOT block the
    // creation RPC response on it; otherwise a slow/hanging mining-status
    // call would leave the user stuck on "Creating Account..." forever.
    void refreshAccountData(acc);
  };

  const logout = () => {
    setAccount(null);
    setMiningStatus(null);
    setTasks([]);
    setTransactions([]);
    localStorage.removeItem('coop_private_key');
    // Clear the saved screen too, otherwise the next login could restore a
    // sub-screen the new user never visited.
    localStorage.removeItem('coop_current_screen');
    historyRef.current = ['welcome'];
    screenRef.current = 'welcome';
    navDepthRef.current = 0;
    setCurrentScreen('welcome');
    setScreenHistory(['welcome']);
  };

  const lockWallet = () => {
    setIsLocked(true);
    navigateTo('locked');
  };

  const unlockWallet = (credential?: string): boolean => {
    if (!credential || credential === account?.pinCode || credential === 'biometric') {
      setIsLocked(false);
      // Reset the stack to the dashboard: otherwise "back" would walk into the
      // lock screen we just unlocked (the screen is stateful, so it would show
      // even though the wallet is no longer locked).
      commitHistory(['home']);
      applyScreen('home');
      return true;
    }
    return false;
  };


  // --- Mining Handlers (server-side start/stop; reward computed on server) ---
  const startMining = async () => {
    if (!account) return;
    try {
      const session = await dbService.startMining(account.id);
      setMiningStatus(prev => prev ? { ...prev, session } : prev);
      addNotification('Mining Started', `Mining at ${session.baseRate} Coopoint/hour (+${session.boostPct}% boost).`, 'mining');
    } catch (e: any) {
      addNotification('Mining Error', e.message || 'Could not start mining. Make sure mining is enabled.', 'info');
      throw e;
    }
  };

  const stopMining = async (): Promise<number> => {
    if (!account) return 0;
    const res = await dbService.stopMining(account);
    setAccount(prev => prev ? { ...prev, ...res.wallet, privateKey: prev.privateKey } : prev);
    addNotification('Mining Claimed', `+${res.reward} Coopoint credited to your balance.`, 'success');
    // The reward is already credited at this point. A failing follow-up refresh
    // must never be reported to the user as a failed claim.
    try {
      await refreshMiningStatus(account.id);
      setTransactions(await dbService.getTransactions(account.id));
    } catch (e) {
      console.warn('Post-claim refresh failed:', e);
    }
    return res.reward;
  };

  // Claim a FINISHED countdown session. The server enforces the 12h gate.
  const claimMining = async (): Promise<number> => {
    if (!account) return 0;
    const res = await dbService.claimMining(account);
    setAccount(prev => prev ? { ...prev, ...res.wallet, privateKey: prev.privateKey } : prev);
    addNotification('Mining Claimed', `+${res.reward} Coopoint credited to your balance.`, 'success');
    // See stopMining: never turn a credited claim into an error dialog.
    try {
      await refreshMiningStatus(account.id);
      setTransactions(await dbService.getTransactions(account.id));
    } catch (e) {
      console.warn('Post-claim refresh failed:', e);
    }
    return res.reward;
  };

  // --- Swap Handlers (validated & executed server-side) ---
  const executeSwap = async (direction: SwapDirection, amount: number): Promise<{ points: number; coop: number; txHash: string }> => {
    if (!account) throw new Error('No active wallet');
    const res = await dbService.executeSwap(account, direction, amount);
    setAccount(prev => prev ? { ...prev, ...res.wallet, privateKey: prev.privateKey } : prev);
    setTransactions(await dbService.getTransactions(account.id));
    if (direction === 'points_to_coop') {
      addNotification('Swap Completed', `Converted ${res.points} Coopoint into ${res.coop} COOP.`, 'tx');
    } else {
      addNotification('Reverse Swap Completed', `Converted ${res.coop} COOP into ${res.points} Coopoint.`, 'tx');
    }
    return { points: res.points, coop: res.coop, txHash: res.txHash };
  };

  // --- Send Handlers ---
  const executeSend = async (recipient: string, amount: number, memo?: string): Promise<{ fee: number; status: string; txHash: string; recipientAddress: string; amount: number }> => {
    if (!account) throw new Error('No active wallet');
    const res = await dbService.executeSend(account, recipient, amount, memo);
    setAccount(prev => prev ? { ...prev, ...res.wallet, privateKey: prev.privateKey } : prev);
    setTransactions(await dbService.getTransactions(account.id));
    addNotification('Transfer Sent', `Sent ${res.amount} COOP to ${res.recipientAddress.slice(0, 8)}...`, 'tx');
    return { fee: res.fee, status: res.status, txHash: res.txHash, recipientAddress: res.recipientAddress, amount: res.amount };
  };

  // --- Transaction detail (expand a history row into its own page) ---
  const openTransaction = useCallback((tx: Transaction) => {
    setSelectedTx(tx);
    navigateTo('tx_detail');
  }, [navigateTo]);

  // --- Boosts (server-gated: purchases live only when admin enables them) ---
  const purchaseBoost = async (tierId: string): Promise<boolean> => {
    if (!account) throw new Error('No active wallet');
    if (!settings?.boostPurchasesEnabled) {
      throw new Error('Boost purchases are coming soon. Payments are not enabled yet.');
    }
    const res = await dbService.purchaseBoost(account.id, tierId);
    await refreshMiningStatus(account.id);
    addNotification('Boost Activated', `${res.tier} boost (+${res.boostPct}% mining speed) active for 7 days.`, 'success');
    return true;
  };

  // --- Task Handlers ---
  const claimTask = async (taskId: string): Promise<number> => {
    if (!account) return 0;
    const res = await dbService.claimTask(account, taskId);
    setAccount(prev => prev ? { ...prev, ...res.wallet, privateKey: prev.privateKey } : prev);
    setTasks(await dbService.getTasks(account.id));
    setTransactions(await dbService.getTransactions(account.id));
    addNotification('Task Completed', `Earned +${res.reward} Point!`, 'success');
    return res.reward;
  };

  // Local UI preferences only (PIN, biometrics, etc.) — balances are never
  // written from the client; financial state lives on the server.
  const updateAccountSettings = (updates: Partial<WalletAccount>) => {
    if (!account) return;
    const allowed: Partial<WalletAccount> = {};
    if (updates.pinCode !== undefined) allowed.pinCode = updates.pinCode;
    if (updates.biometricsEnabled !== undefined) allowed.biometricsEnabled = updates.biometricsEnabled;
    if (updates.notificationsEnabled !== undefined) allowed.notificationsEnabled = updates.notificationsEnabled;
    if (updates.autoLockMinutes !== undefined) allowed.autoLockMinutes = updates.autoLockMinutes;
    const updated = { ...account, ...allowed };
    setAccount(updated);
    localStorage.setItem(`coop_prefs_${account.id}`, JSON.stringify(allowed));
  };

  return (
    <WalletContext.Provider
      value={{
        currentScreen,
        navigateTo,
        goBack,
        screenHistory,
        account,
        isAuthenticated: Boolean(account),
        isLocked,
        booting,
        miningStatus,
        miningRemainingMs,
        isMiningActive,
        dailyLimitReached,
        settings,
        selectedAsset,
        setSelectedAsset,
        selectedTx,
        tasks,
        transactions,
        openTransaction,
        notifications,
        unreadNotificationsCount: notifications.filter(n => !n.read).length,
        loginWithPrivateKey,
        generateNewAccount,
        confirmAccountCreation,
        logout,
        lockWallet,
        unlockWallet,
        startMining,
        stopMining,
        claimMining,
        executeSwap,
        executeSend,
        purchaseBoost,
        claimTask,
        updateAccountSettings,
        addNotification,
        markNotificationsAsRead
      }}
    >
      {children}
    </WalletContext.Provider>
  );
};

export const useWallet = (): WalletContextType => {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
};

