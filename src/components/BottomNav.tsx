import React from 'react';
import { Home, Pickaxe, CheckSquare, Menu } from 'lucide-react';
import { useWallet } from '../context/WalletContext';

export const BottomNav: React.FC = () => {
  const { currentScreen, navigateTo } = useWallet();

  return (
    <nav className="bottom-nav-bar">
      <button 
        className={`nav-item ${currentScreen === 'home' ? 'active' : ''}`}
        onClick={() => navigateTo('home')}
        id="nav-home"
      >
        <Home size={20} strokeWidth={currentScreen === 'home' ? 2.4 : 1.8} />
        <span>Home</span>
      </button>

      <button 
        className={`nav-item ${currentScreen === 'mining' ? 'active' : ''}`}
        onClick={() => navigateTo('mining')}
        id="nav-mining"
      >
        <Pickaxe size={20} strokeWidth={currentScreen === 'mining' ? 2.4 : 1.8} />
        <span>Mining</span>
      </button>

      <button 
        className={`nav-item ${currentScreen === 'tasks' ? 'active' : ''}`}
        onClick={() => navigateTo('tasks')}
        id="nav-tasks"
      >
        <CheckSquare size={20} strokeWidth={currentScreen === 'tasks' ? 2.4 : 1.8} />
        <span>Tasks</span>
      </button>

      <button 
        className={`nav-item ${currentScreen === 'menu' ? 'active' : ''}`}
        onClick={() => navigateTo('menu')}
        id="nav-menu"
      >
        <Menu size={20} strokeWidth={currentScreen === 'menu' ? 2.4 : 1.8} />
        <span>Menu</span>
      </button>
    </nav>
  );
};
