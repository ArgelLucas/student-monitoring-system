import React from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import './styles/app.css';
import './styles/verdant.css';
import './styles/classroom.css';
import './styles/student-flow.css';
import './styles/access-landing.css';
import './styles/student-experience.css';
import './styles/student-polish.css';
import './styles/student-v6.css';
import './styles/roster-v61.css';
import { SessionProvider } from './state/SessionProvider.jsx';
import App from './App.jsx';

// Present the approved light design once on upgrade; later choices persist.
// This resets only a display preference, never authentication or student data.
try {
  if (window.localStorage.getItem('sm-classroom-theme-v55') !== 'ready') {
    window.localStorage.setItem('sm-theme', 'light');
    window.localStorage.setItem('sm-classroom-theme-v55', 'ready');
  }
} catch { /* storage can be unavailable in privacy modes */ }

// Apply the saved theme before React paints to avoid a dark-to-light flash.
try {
  document.documentElement.dataset.theme = window.localStorage.getItem('sm-theme') === 'dark' ? 'dark' : 'light';
} catch {
  document.documentElement.dataset.theme = 'light';
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode><HashRouter><SessionProvider><App/></SessionProvider></HashRouter></React.StrictMode>
);
