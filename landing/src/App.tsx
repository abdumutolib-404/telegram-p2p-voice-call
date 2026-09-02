import React, { useState, useEffect } from 'react';
import { LandingPage } from './components/LandingPage';
import { PrivacyScreen } from './components/PrivacyScreen';
import { GuidelinesScreen } from './components/GuidelinesScreen';

export const App: React.FC = () => {
  const [activeView, setActiveView] = useState<'landing' | 'privacy' | 'guidelines'>(() => {
    if (typeof window === 'undefined') return 'landing';
    const hash = window.location.hash.toLowerCase();
    if (hash.includes('privacy')) return 'privacy';
    if (hash.includes('guidelines')) return 'guidelines';
    return 'landing';
  });

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.toLowerCase();
      if (hash.includes('privacy')) {
        setActiveView('privacy');
      } else if (hash.includes('guidelines')) {
        setActiveView('guidelines');
      } else {
        setActiveView('landing');
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    window.addEventListener('popstate', handleHashChange);
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
      window.removeEventListener('popstate', handleHashChange);
    };
  }, []);

  if (activeView === 'privacy') {
    return (
      <PrivacyScreen
        onBack={() => {
          window.location.hash = '';
          setActiveView('landing');
        }}
      />
    );
  }

  if (activeView === 'guidelines') {
    return (
      <GuidelinesScreen
        onBack={() => {
          window.location.hash = '';
          setActiveView('landing');
        }}
      />
    );
  }

  return (
    <LandingPage
      onOpenPrivacy={() => {
        window.location.hash = '#privacy';
        setActiveView('privacy');
      }}
      onOpenGuidelines={() => {
        window.location.hash = '#guidelines';
        setActiveView('guidelines');
      }}
    />
  );
};

export default App;
