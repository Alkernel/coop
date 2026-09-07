import React from 'react';
import { BottomNav } from './BottomNav';
import { useWallet } from '../context/WalletContext';

interface AppLayoutProps {
  children: React.ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const { currentScreen } = useWallet();

  const isMainTab = ['home', 'mining', 'tasks', 'menu', 'wallet_details', 'price_boost', 'history'].includes(currentScreen);

  return (
    <div className="app-viewport">
      <div className="app-container">
        {/* Screen Content Container */}
        <main className="app-main-content">
          {children}
        </main>

        {/* Bottom Nav on main tabs */}
        {isMainTab && <BottomNav />}
      </div>
    </div>
  );
};
