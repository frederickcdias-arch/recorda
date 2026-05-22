import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { setupPwaUpdateRegistration } from './hooks/usePwaUpdate';
import './services/api';
import './index.css';

// Recover automatically when a lazy-loaded chunk changes after a new deploy.
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  window.location.reload();
});

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found');
}

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  setupPwaUpdateRegistration();
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
