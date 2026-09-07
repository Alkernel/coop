import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { 
  ScreenName, 
  WalletAccount, 
  MiningSession, 
  Transaction, 
  TaskItem, 
  AppNotification 
} from '../types';
import { dbService, BOOST_TIERS } from '../services/supabase';
import { generateSecurePrivateKey, isValidPrivateKey } from '../services/crypto';

interface WalletContextType {
  currentScreen: ScreenName;
  navigateTo: (screen: ScreenName) => void;
  goBack: () => void;
  screenHistory: ScreenName[];
  
  account: WalletAccount | null;
  isAuthenticated: boolean;
  isLocked: boolean;
  
  miningSession: MiningSession | null;
  miningRemainingMs: number;
  isMiningActive: boolean;
  canClaimMining: boolean;
  
  tasks: TaskItem[];
  transactions: Transaction[];
  notifications: AppNotification[];
  unreadNotificationsCount: number;
  
  // Auth
  loginWithPrivateKey: (key: string) => Promise<boolean>;
  generateNewAccount: () => { key: string; account: Promise<WalletAccount> };
  confirmAccountCreation: (key: string) => Promise<boolean>;
  logout: () => void;
  lockWallet: () => void;
  unlockWallet: (credential?: string) => boolean;
  
  // Actions
  startMining: () => void;
  claimMining: () => Promise<number>;
  executeSwap: (cooptokenAmount: number) => Promise<{ coopReceived: number }>;
  executeSend: (recipient: string, amount: number) => Promise<{ fee: number }>;
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
  
  const [account, setAccount] = useState<WalletAccount | null>(() => {
    const savedId = localStorage.getItem('coop_active_wallet_key');
    if (savedId) {
      const wallets = JSON.parse(localStorage.getItem('coop_wallets') || '{}');
      return wallets[savedId] || null;
    }
    return null;
  });

  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [miningSession, setMiningSession] = useState<MiningSession | null>(null);
  const [miningRemainingMs, setMiningRemainingMs] = useState<number>(0);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([
    {
      id: 'notif_welcome',
      title: 'Welcome to COOP',
      message: 'Your decentralized wallet & pre-TGE mining node is active.',
      type: 'info',
      timestamp: Date.now(),
      read: false
    }
  ]);

  // Navigate helper
  const navigateTo = useCallback((screen: ScreenName) => {
    setScreenHistory(prev => [...prev, screen]);
    setCurrentScreen(screen);
  }, []);

  const goBack = useCallback(() => {
    setScreenHistory(prev => {
      if (prev.length <= 1) return prev;
      const updated = [...prev];
      updated.pop(); // Remove current
      const last = updated[updated.length - 1];
      setCurrentScreen(last);
      return updated;
    });
  }, []);

  // Notifications
  const addNotification = useCallback((title: string, message: string, type: AppNotification['type'] = 'info') => {
    setNotifications(prev => [
      {
        id: 'notif_' + Date.now(),
        title,
        message,
        type,
        timestamp: Date.now(),
        read: false
      },
      ...prev
    ]);
  }, []);

  const markNotificationsAsRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  // Sync data when account is loaded
  const refreshAccountData = useCallback((acc: WalletAccount) => {
    const session = dbService.getMiningSession(acc.id);
    setMiningSession(session);
    setTasks(dbService.getTasks(acc.id));
    setTransactions(dbService.getTransactions(acc.id));
  }, []);

  useEffect(() => {
    if (account) {
      localStorage.setItem('coop_active_wallet_key', account.privateKey.toLowerCase());
      refreshAccountData(account);
      if (currentScreen === 'welcome' || currentScreen === 'login' || currentScreen === 'signup') {
        setCurrentScreen('home');
        setScreenHistory(['home']);
      }
    } else {
      localStorage.removeItem('coop_active_wallet_key');
    }
  }, [account]);

  // Mining Countdown timer
  useEffect(() => {
    if (!miningSession) return;

    const updateTimer = () => {
      const now = Date.now();
      const remaining = Math.max(0, miningSession.endTime - now);
      setMiningRemainingMs(remaining);

      if (remaining <= 0 && miningSession.status === 'mining') {
        setMiningSession(prev => prev ? { ...prev, status: 'ready_to_claim' } : null);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [miningSession]);

  // --- Auth Handlers ---
  const loginWithPrivateKey = async (key: string): Promise<boolean> => {
    if (!isValidPrivateKey(key)) {
      return false;
    }
    const acc = await dbService.authenticate(key, false);
    if (acc) {
      setAccount(acc);
      setIsLocked(false);
      navigateTo('home');
      addNotification('Welcome Back', 'Logged in successfully with private key.', 'success');
      return true;
    }
    return false;
  };

  const generateNewAccount = () => {
    const key = generateSecurePrivateKey();
    const accountPromise = dbService.authenticate(key, true) as Promise<WalletAccount>;
    return { key, account: accountPromise };
  };

  const confirmAccountCreation = async (key: string): Promise<boolean> => {
    const acc = await dbService.authenticate(key, true);
    if (acc) {
      setAccount(acc);
      setIsLocked(false);
      navigateTo('home');
      addNotification('Account Created', 'Your private key account is ready and protected.', 'success');
      return true;
    }
    return false;
  };

  const logout = () => {
    setAccount(null);
    setMiningSession(null);
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

  // --- Mining Handlers ---
  const startMining = () => {
    if (!account) return;
    const session = dbService.startMiningSession(
      account.id, 
      account.currentBoostPct, 
      account.totalBoostReward
    );
    setMiningSession(session);
    addNotification('Mining Started', '12-hour session initiated at 4.16 Cooptoken/hour.', 'mining');
  };

  const claimMining = async (): Promise<number> => {
    if (!account || !miningSession) return 0;
    try {
      const res = dbService.claimMiningSession(account, miningSession);
      setAccount({ ...res.wallet });
      setMiningSession(res.session);
      setTransactions(dbService.getTransactions(account.id));
      addNotification('Mining Claimed', `Successfully claimed +${res.reward} Cooptoken!`, 'success');
      return res.reward;
    } catch (e: any) {
      alert(e.message || 'Error claiming mining reward');
      return 0;
    }
  };

  // --- Swap Handlers ---
  const executeSwap = async (cooptokenAmount: number): Promise<{ coopReceived: number }> => {
    if (!account) throw new Error('No active wallet');
    const res = dbService.executeSwap(account, cooptokenAmount);
    setAccount({ ...res.wallet });
    setTransactions(dbService.getTransactions(account.id));
    addNotification('Swap Completed', `Swapped ${cooptokenAmount} Cooptoken for +${res.coopReceived} COOP`, 'tx');
    return { coopReceived: res.coopReceived };
  };

  // --- Send Handlers ---
  const executeSend = async (recipient: string, amount: number): Promise<{ fee: number }> => {
    if (!account) throw new Error('No active wallet');
    const res = dbService.executeSend(account, recipient, amount);
    setAccount({ ...res.wallet });
    setTransactions(dbService.getTransactions(account.id));
    addNotification('Transfer Sent', `Sent ${amount} COOP to ${recipient.slice(0, 8)}...`, 'tx');
    return { fee: res.fee };
  };

  // --- Boost Handlers ---
  const purchaseBoost = async (tierId: string): Promise<boolean> => {
    if (!account) return false;
    const tier = BOOST_TIERS.find(t => t.id === tierId);
    if (!tier) return false;

    const updated = dbService.purchaseBoost(account, tier);
    setAccount({ ...updated });
    refreshAccountData(updated);
    addNotification('Boost Activated', `Purchased ${tier.name}! Added +${tier.rewardBonus} Cooptoken mining reward.`, 'success');
    return true;
  };

  // --- Task Handlers ---
  const claimTask = async (taskId: string): Promise<number> => {
    if (!account) return 0;
    const res = dbService.claimTask(account, taskId);
    setAccount({ ...res.wallet });
    setTasks(res.tasks);
    setTransactions(dbService.getTransactions(account.id));
    addNotification('Task Completed', `Earned +${res.reward} Cooptoken!`, 'success');
    return res.reward;
  };

  const updateAccountSettings = (updates: Partial<WalletAccount>) => {
    if (!account) return;
    const updated = { ...account, ...updates };
    dbService.saveWallet(updated);
    setAccount(updated);
  };

  const isMiningActive = miningSession?.status === 'mining' && miningRemainingMs > 0;
  const canClaimMining = miningSession?.status === 'ready_to_claim' || (Boolean(miningSession) && miningRemainingMs <= 0 && miningSession?.status !== 'claimed');

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
        miningSession,
        miningRemainingMs,
        isMiningActive,
        canClaimMining,
        tasks,
        transactions,
        notifications,
        unreadNotificationsCount: notifications.filter(n => !n.read).length,
        loginWithPrivateKey,
        generateNewAccount,
        confirmAccountCreation,
        logout,
        lockWallet,
        unlockWallet,
        startMining,
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
