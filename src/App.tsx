import React from 'react';
import { useWallet } from './context/WalletContext';
import { AppLayout } from './components/AppLayout';
import { WelcomeScreen } from './screens/WelcomeScreen';
import { LoginScreen } from './screens/LoginScreen';
import { SignUpScreen } from './screens/SignUpScreen';
import { HomeScreen } from './screens/HomeScreen';
import { MiningScreen } from './screens/MiningScreen';
import { SwapScreen } from './screens/SwapScreen';
import { SendScreen } from './screens/SendScreen';
import { ReceiveScreen } from './screens/ReceiveScreen';
import { HistoryScreen } from './screens/HistoryScreen';
import { PriceBoostScreen } from './screens/PriceBoostScreen';
import { TasksScreen } from './screens/TasksScreen';
import { MenuScreen } from './screens/MenuScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { WalletDetailsScreen } from './screens/WalletDetailsScreen';
import { HelpSupportScreen } from './screens/HelpSupportScreen';
import { AboutScreen } from './screens/AboutScreen';
import { SecurityScreen } from './screens/SecurityScreen';
import { AdminScreen } from './screens/AdminScreen';
import { WalletLockScreen } from './screens/WalletLockScreen';

export const App: React.FC = () => {
  const { currentScreen } = useWallet();

  const renderScreen = () => {
    switch (currentScreen) {
      case 'welcome':
        return <WelcomeScreen />;
      case 'login':
        return <LoginScreen />;
      case 'signup':
        return <SignUpScreen />;
      case 'home':
        return <HomeScreen />;
      case 'mining':
        return <MiningScreen />;
      case 'swap':
        return <SwapScreen />;
      case 'send':
        return <SendScreen />;
      case 'receive':
        return <ReceiveScreen />;
      case 'history':
        return <HistoryScreen />;
      case 'price_boost':
        return <PriceBoostScreen />;
      case 'tasks':
        return <TasksScreen />;
      case 'menu':
        return <MenuScreen />;
      case 'settings':
        return <SettingsScreen />;
      case 'wallet_details':
        return <WalletDetailsScreen />;
      case 'help_support':
        return <HelpSupportScreen />;
      case 'about':
        return <AboutScreen />;
      case 'security':
        return <SecurityScreen />;
      case 'admin':
        return <AdminScreen />;
      case 'locked':
        return <WalletLockScreen />;
      default:
        return <HomeScreen />;
    }
  };

  return (
    <AppLayout>
      {renderScreen()}
    </AppLayout>
  );
};
