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

  const navigateTo = useCallback((screen: ScreenName) => {
    setScreenHistory(prev => [...prev, screen]);
    setCurrentScreen(screen);
    localStorage.setItem('coop_current_screen', screen);
  }, []);

  const goBack = useCallback(() => {
    setScreenHistory(prev => {
      if (prev.length <= 1) return prev;
      const updated = [...prev];
      updated.pop();
      const last = updated[updated.length - 1];
      setCurrentScreen(last);
      return updated;
    });
  }, []);

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
        const validScreens: ScreenName[] = ['home', 'mining', 'swap', 'send', 'receive', 'history', 'price_boost', 'tasks', 'menu', 'settings', 'wallet_details', 'help_support', 'about', 'security', 'asset_detail'];
        const restoredScreen = savedScreen && validScreens.includes(savedScreen) ? savedScreen : 'home';
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

  // Poll the server for mining progress (survives refresh/reopen)
  useEffect(() => {
    if (!account) return;
    const poll = () => refreshMiningStatus(account.id);
    pollRef.current = window.setInterval(poll, 15000);
    const onVisible = () => { if (document.visibilityState === 'visible') poll(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [account, refreshMiningStatus]);

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
      navigateTo('home');
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
    navigateTo('home');
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
      navigateTo('home');
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

