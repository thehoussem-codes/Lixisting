import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App.tsx';
import { applyTheme, getTheme } from './app/context.tsx';
import { suivreFocus } from './ui/insertion.ts';
import './styles.css';

applyTheme(getTheme());
suivreFocus();
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
