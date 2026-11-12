import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { BookingPage } from './BookingPage';
import { Welcome } from './Onboarding';
import { Portal } from './Portal';
import './styles.css';

// a console link names its workspace (?ws=, ?demo); a bare address is a new visitor: welcome them
const q = new URLSearchParams(location.search);
const hasStudio = q.has('ws') || q.has('demo');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {location.pathname.startsWith('/me') ? <Portal ws={new URLSearchParams(location.search).get('ws') ?? 'demo'} /> : location.pathname.startsWith('/book') ? <BookingPage ws={new URLSearchParams(location.search).get('ws') ?? 'demo'} /> : hasStudio ? <App /> : <Welcome />}
  </StrictMode>,
);
