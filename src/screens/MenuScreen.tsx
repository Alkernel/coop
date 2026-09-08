import React from 'react';
import { 
  ChevronRight, 
  Wallet, 
  Pickaxe, 
  CheckSquare, 
  Zap, 
  ArrowLeftRight, 
  History, 
  Settings, 
  HelpCircle,
  Shield 
} from 'lucide-react';
import { CoopLogo } from '../components/CoopLogo';
import { useWallet } from '../context/WalletContext';
import { ScreenName } from '../types';

interface MenuItem {
  title: string;
  icon: React.ReactNode;
  screen: ScreenName;
}

export const MenuScreen: React.FC = () => {
  const { navigateTo } = useWallet();

  const menuItems: MenuItem[] = [
    { title: 'Wallet', icon: <Wallet size={19} />, screen: 'wallet_details' },
    { title: 'Mining', icon: <Pickaxe size={19} />, screen: 'mining' },
    { title: 'Tasks', icon: <CheckSquare size={19} />, screen: 'tasks' },
    { title: 'Price Boost', icon: <Zap size={19} />, screen: 'price_boost' },
    { title: 'Swap', icon: <ArrowLeftRight size={19} />, screen: 'swap' },
    { title: 'History', icon: <History size={19} />, screen: 'history' },
    { title: 'Settings', icon: <Settings size={19} />, screen: 'settings' },
    { title: 'Admin Panel', icon: <Shield size={19} />, screen: 'admin' },
    { title: 'Help & Support', icon: <HelpCircle size={19} />, screen: 'help_support' }
  ];

  return (
    <div className="screen-content" style={{ paddingBottom: 16 }}>
      {/* Header Branding */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 0 24px 0'
      }}>
        <CoopLogo size={42} />
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '0.5px' }}>COOP</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>
            Mine. Trade. Grow.
          </p>
        </div>
      </div>

      {/* Navigation List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {menuItems.map(item => (
          <div
            key={item.title}
            className="bubble-card"
            style={{
              padding: '14px 18px',
              marginBottom: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer'
            }}
            onClick={() => navigateTo(item.screen)}
            id={`menu-item-${item.screen}`}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                color: 'var(--text-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                {item.icon}
              </div>
              <span style={{ fontSize: 15, fontWeight: 600 }}>{item.title}</span>
            </div>

            <ChevronRight size={18} color="var(--text-tertiary)" />
          </div>
        ))}
      </div>
    </div>
  );
};
