import { useState, useEffect } from 'react';
import { Download, Share } from 'lucide-react';

export function InstallButton() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showIOSHint, setShowIOSHint] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
      setIsStandalone(true);
    }

    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
      }
    } else {
      // Check if iOS
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
      if (isIOS && !isStandalone) {
        setShowIOSHint(true);
        setTimeout(() => setShowIOSHint(false), 8000);
      }
    }
  };

  if (isStandalone) return null;

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={handleInstallClick}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 16px',
          backgroundColor: '#3b82f6',
          color: 'white',
          borderRadius: '8px',
          border: 'none',
          cursor: 'pointer',
          fontWeight: '600',
          fontSize: '12px',
          transition: 'all 0.2s',
          boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)'
        }}
        title="Install as App"
      >
        <Download size={16} />
        Install App
      </button>

      {showIOSHint && (
        <div style={{
          position: 'absolute',
          top: '100%',
          marginTop: '8px',
          right: 0,
          width: '240px',
          backgroundColor: '#1e293b',
          border: '1px solid #334155',
          padding: '12px',
          borderRadius: '12px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
          zIndex: 9999,
          color: '#e2e8f0',
          fontSize: '11px',
          lineHeight: '1.5'
        }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'start' }}>
            <Share style={{ color: '#60a5fa', flexShrink: 0 }} size={18} />
            <div>
              To install on iPhone:
              <br />
              1. Tap <strong>Share</strong> button below
              <br />
              2. Scroll down & tap <strong>'Add to Home Screen'</strong>
            </div>
          </div>
          <div style={{
            position: 'absolute',
            top: 0,
            right: '16px',
            marginTop: '-6px',
            width: '12px',
            height: '12px',
            backgroundColor: '#1e293b',
            borderLeft: '1px solid #334155',
            borderTop: '1px solid #334155',
            transform: 'rotate(45deg)'
          }} />
        </div>
      )}
    </div>
  );
}
