import { StrictMode, Component } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

/**
 * Global Error Boundary to prevent "Black Screen" permanently.
 * If anything in the app crashes, this UI will show a recover button.
 */
class GlobalErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("CRITICAL APP CRASH:", error, errorInfo);
  }

  handleReset = () => {
    // Ultimate "Reset" - clears local storage and reloads
    localStorage.clear();
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', background: '#020617',
          color: 'white', fontFamily: 'sans-serif', padding: 40, textAlign: 'center'
        }}>
          <div style={{ fontSize: 64, marginBottom: 20 }}>🛰️</div>
          <h2 style={{ margin: '0 0 12px', fontWeight: 800 }}>System Stability Intercepted</h2>
          <p style={{ margin: '0 0 32px', opacity: 0.7, maxWidth: 450, lineHeight: 1.6 }}>
            A runtime error was detected that would usually cause a "Black Screen." 
            We have captured the state to prevent a total crash.
          </p>
          
          <div style={{ display: 'flex', gap: 16 }}>
            <button 
              onClick={() => window.location.reload()}
              style={{
                background: '#2563eb', color: 'white', border: 'none', 
                padding: '12px 24px', borderRadius: 12, fontWeight: 700, cursor: 'pointer'
              }}
            >
              ↻ Try Reloading
            </button>
            <button 
              onClick={this.handleReset}
              style={{
                background: 'rgba(255,255,255,0.05)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.1)', 
                padding: '12px 24px', borderRadius: 12, fontWeight: 700, cursor: 'pointer'
              }}
            >
              ⚙️ Reset System State
            </button>
          </div>

          <pre style={{ 
            marginTop: 40, padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, 
            fontSize: 10, color: '#ef4444', textAlign: 'left', maxWidth: '80vw', overflow: 'auto'
          }}>
            {this.state.error?.toString()}
          </pre>
        </div>
      );
    }

    return this.props.children;
  }
}

const rootElement = document.getElementById('root');
if (!globalThis.__reactRoot) {
  globalThis.__reactRoot = createRoot(rootElement);
}

globalThis.__reactRoot.render(
  <GlobalErrorBoundary>
    <App />
  </GlobalErrorBoundary>,
)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' })
      .then(reg => console.log('SW registered:', reg))
      .catch(err => console.error('SW failed:', err));
  });
}
