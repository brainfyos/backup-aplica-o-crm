import { ReactNode } from 'react';
import { appearanceCssVars, mergeAppearance, type PublicCallAppearance, type DeviceTheme } from './appearance';
import './publiccall.css';

/**
 * Moldura tipo iPhone com Dynamic Island, status bar e home indicator.
 * Recebe as views como children. `theme` fica preparado para novos formatos
 * (android/instagram/whatsapp/facetime) mas por enquanto renderiza `phone`.
 */
export function PhoneFrame({
  appearance,
  onCall,
  timerText,
  children,
  theme = 'phone',
  className,
}: {
  appearance?: PublicCallAppearance | null;
  onCall?: boolean;
  timerText?: string;
  theme?: DeviceTheme;
  className?: string;
  children: ReactNode;
}) {
  const a = mergeAppearance(appearance);
  const style = appearanceCssVars(appearance || {});

  return (
    <div className={`pc-iphone pc-fonts ${className || ''}`} style={style} data-theme={theme}>
      <span className="pc-btn-side pc-b1" />
      <span className="pc-btn-side pc-b2" />
      <span className="pc-btn-side pc-b3" />
      <span className="pc-btn-side pc-b4" />
      <div className="pc-screen">
        {a.show_dynamic_island && (
          <div className={`pc-island ${onCall ? 'pc-oncall' : ''}`}>
            <span className="pc-idot" />
            <span className="pc-itime">{timerText || '00:00'}</span>
          </div>
        )}
        <div className="pc-statusbar">
          <span>9:41</span>
          <div className="pc-sb-right">
            <svg width="16" height="10" viewBox="0 0 16 10" fill="none">
              <rect x="0.5" y="4.5" width="2" height="5" rx="0.5" fill="currentColor" />
              <rect x="4.5" y="2.5" width="2" height="7" rx="0.5" fill="currentColor" />
              <rect x="8.5" y="0.5" width="2" height="9" rx="0.5" fill="currentColor" />
              <rect x="12.5" y="0.5" width="2" height="9" rx="0.5" fill="currentColor" />
            </svg>
            <svg width="22" height="10" viewBox="0 0 22 10" fill="none">
              <rect x="0.5" y="0.5" width="18" height="9" rx="2" stroke="currentColor" />
              <rect x="2" y="2" width="15" height="6" rx="1" fill="currentColor" />
              <rect x="20" y="3.5" width="1.5" height="3" rx="0.5" fill="currentColor" />
            </svg>
          </div>
        </div>
        {children}
        {a.show_home_bar && <div className="pc-homebar" />}
      </div>
    </div>
  );
}
