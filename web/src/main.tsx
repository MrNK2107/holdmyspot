import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { BookingPage } from './BookingPage';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {location.pathname.startsWith('/book') ? <BookingPage ws={new URLSearchParams(location.search).get('ws') ?? 'demo'} /> : <App />}
  </StrictMode>,
);
