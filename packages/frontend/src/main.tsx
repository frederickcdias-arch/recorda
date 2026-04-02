import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
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

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
