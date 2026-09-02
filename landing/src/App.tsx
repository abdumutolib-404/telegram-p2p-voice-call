import React, { useState, useEffect } from 'react';
import { LandingPage } from './components/LandingPage';
import { PrivacyScreen } from './components/PrivacyScreen';
import { GuidelinesScreen } from './components/GuidelinesScreen';

export const App: React.FC = () => {
  const [activeView, setActiveView] = useState<'landing' | 'privacy' | 'guidelines'>(() => {
    if (typeof window === 'undefined') return 'landing';
    const loc = (window.location.pathname + window.location.hash).toLowerCase();
    if (loc.includes('privacy')) return 'privacy';
    if (loc.includes('guidelines')) return 'guidelines';
    return 'landing';
  });

  useEffect(() => {
    const handleLocationChange = () => {
      const loc = (window.location.pathname + window.location.hash).toLowerCase();
      if (loc.includes('privacy')) {
        setActiveView('privacy');
      } else if (loc.includes('guidelines')) {
        setActiveView('guidelines');
      } else {
        setActiveView('landing');
      }
    };

    window.addEventListener('hashchange', handleLocationChange);
    window.addEventListener('popstate', handleLocationChange);
    return () => {
      window.removeEventListener('hashchange', handleLocationChange);
      window.removeEventListener('popstate', handleLocationChange);
    };
  }, []);

  const handleBackToLanding = () => {
    if (typeof window !== 'undefined') {
      if (window.location.pathname !== '/' && typeof window.history.pushState === 'function') {
        window.history.pushState(null, '', '/');
      } else {
        window.location.hash = '';
      }
    }
    setActiveView('landing');
  };

  if (activeView === 'privacy') {
    return <PrivacyScreen onBack={handleBackToLanding} />;
  }

  if (activeView === 'guidelines') {
    return <GuidelinesScreen onBack={handleBackToLanding} />;
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
