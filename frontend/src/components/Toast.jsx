import React from 'react';

let toastId = 0;
const ToastContext = React.createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = React.useState([]);

  const show = (message, type = 'info', duration = 4000) => {
    const id = ++toastId;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration);
  };

  // Support both show(msg, type) and { addToast } destructuring
  show.addToast = show;

  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type}`}>
            <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>{icons[t.type]}</span>
            <span style={{ flex: 1, color: 'var(--text-primary)' }}>{t.message}</span>
            <span
              onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
              style={{ cursor: 'pointer', opacity: 0.5, fontSize: '0.8rem', flexShrink: 0 }}
            >✕</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = React.useContext(ToastContext);
  // Support both direct call and { addToast } destructuring
  if (ctx) ctx.addToast = ctx;
  return ctx;
}
