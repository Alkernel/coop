import React from 'react';

export interface CoinIconProps {
  size?: number;
  coin?: 'COOP' | 'COOPTOKEN' | 'USDT' | 'COIN';
  className?: string;
  color?: string;
}

// Exact Coopcoin logo path data (used for the COOP / COIN mark)
const COOP_PATH =
  'M 487.24,376.40 464.91,381.18 443.38,390.75 431.42,398.72 415.47,413.88 403.51,430.62 394.74,448.96 388.36,472.89 387.56,496.01 391.55,517.54 399.52,537.48 412.28,556.62 427.43,571.77 440.99,581.34 466.51,592.50 487.24,596.49 510.37,596.49 527.91,593.30 551.83,583.73 568.58,572.57 582.93,558.21 594.10,542.26 605.26,515.95 609.25,496.01 609.25,474.48 604.47,451.36 594.90,429.82 582.93,413.08 567.78,398.72 548.64,386.76 531.90,380.38 511.16,376.40 Z M 430.62,171.45 424.24,177.83 423.44,247.21 378.79,265.55 331.74,298.25 295.06,338.92 270.33,381.98 248.80,458.53 252.79,539.07 275.92,601.28 312.60,652.31 365.23,694.58 424.24,720.10 428.23,803.83 480.06,802.23 482.46,728.87 517.54,729.67 520.73,803.83 569.38,804.63 574.96,798.25 574.96,719.30 627.59,696.17 667.46,667.46 702.55,629.19 728.07,584.53 670.65,555.82 618.02,619.62 559.01,655.50 480.06,666.67 423.44,653.11 368.42,618.02 326.16,559.81 311.80,501.59 323.76,422.65 347.69,377.99 382.78,341.31 431.42,313.40 484.85,301.44 542.26,306.22 593.30,327.75 627.59,355.66 671.45,413.88 728.87,386.76 704.94,342.11 670.65,302.23 629.19,271.13 574.96,246.41 570.97,172.25 519.94,173.05 517.54,235.25 483.25,236.84 480.06,173.84 Z';

// Colored token icons.
//   COOPTOKEN -> /logos/cooptoken.svg  (unchanged)
//   USDT      -> /logos/usdt.svg       (current USDT logo)
const TOKEN_SRC: Partial<Record<NonNullable<CoinIconProps['coin']>, string>> = {
  COOPTOKEN: '/logos/cooptoken.svg',
  USDT: '/logos/usdt.svg'
};

export const CoinIcon: React.FC<CoinIconProps> = ({
  size = 36,
  coin = 'COIN',
  className = '',
  color
}) => {
  const tokenSrc = TOKEN_SRC[coin];

  // COOP / COIN use the theme-adaptive logo mark
  if (!tokenSrc) {
    return (
      <div
        className={`coin-icon-wrapper ${className}`}
        style={{ width: size, height: size }}
      >
        <svg
          viewBox="0 0 1000 1000"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="xMidYMid meet"
          style={{ width: '100%', height: '100%', display: 'block', color: color || 'currentColor' }}
        >
          <path fill={color || 'currentColor'} fillRule="evenodd" d={COOP_PATH} />
        </svg>
      </div>
    );
  }

  // Cooptoken / USDT use their own static icon asset.
  // USDT additionally carries a small BNB badge so it reads as BNB Smart Chain
  // (BEP-20) USDT — the only chain Coop USDT settles on. The ring colour matches
  // the card surface so the badge looks cleanly punched into the icon.
  const badgeSize = Math.max(13, Math.round(size * 0.44));
  const badgeRing = Math.max(1, Math.round(size * 0.05));
  return (
    <div
      className={`coin-icon-wrapper ${className}`}
      style={{ width: size, height: size, position: 'relative' }}
    >
      <img
        src={tokenSrc}
        alt={`${coin} token`}
        width={size}
        height={size}
        style={{ width: '100%', height: '100%', display: 'block', objectFit: 'contain', WebkitTouchCallout: 'none', userSelect: 'none' }}
        draggable={false}
        onContextMenu={(e) => e.preventDefault()}
      />
      {coin === 'USDT' && (
        <span
          className="coin-icon-badge"
          title="BNB Smart Chain · BEP-20"
          role="img"
          aria-label="BNB Smart Chain, BEP-20"
          style={{
            position: 'absolute',
            right: -Math.round(size * 0.07),
            bottom: -Math.round(size * 0.07),
            width: badgeSize,
            height: badgeSize,
            borderRadius: '50%',
            background: '#F0B90B',
            border: `${badgeRing}px solid var(--bg-surface, #ffffff)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxSizing: 'content-box',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.28)'
          }}
        >
          {/* Binance mark: centre diamond plus the four arms */}
          <svg viewBox="0 0 24 24" width="68%" height="68%" aria-hidden="true" focusable="false">
            <g fill="#ffffff">
              <polygon points="12,8.9 15.1,12 12,15.1 8.9,12" />
              <polygon points="12,2.5 15.1,5.6 12,8.7 8.9,5.6" />
              <polygon points="12,15.3 15.1,18.4 12,21.5 8.9,18.4" />
              <polygon points="5.6,8.9 8.7,12 5.6,15.1 2.5,12" />
              <polygon points="18.4,8.9 21.5,12 18.4,15.1 15.1,12" />
            </g>
          </svg>
        </span>
      )}
    </div>
  );
};