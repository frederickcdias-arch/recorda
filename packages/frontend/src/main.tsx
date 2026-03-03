import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './services/api';
import './index.css';

// Limpar service workers e caches stale para evitar respostas 410
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      registration.unregister();
    }
  });
  caches.keys().then((names) => {
    for (const name of names) {
      caches.delete(name);
    }
  });
}

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
