import React, { useState, useEffect, useCallback } from 'react';
import { LandingPage } from './components/LandingPage';
import { HowItWorksScreen } from './components/HowItWorksScreen';
import { IeltsSpeakingGuideScreen } from './components/IeltsSpeakingGuideScreen';
import { GuidelinesScreen } from './components/GuidelinesScreen';
import { SafetyGuideScreen } from './components/SafetyGuideScreen';
import { FaqScreen } from './components/FaqScreen';
import { PrivacyScreen } from './components/PrivacyScreen';
import { TermsScreen } from './components/TermsScreen';

export type AppView =
  | 'landing'
  | 'how-it-works'
  | 'ielts-speaking'
  | 'community-guidelines'
  | 'safety'
  | 'faq'
  | 'privacy'
  | 'terms';

const parseLocationToView = (): AppView => {
  if (typeof window === 'undefined') return 'landing';
  const loc = (window.location.pathname + window.location.hash).toLowerCase();
  if (loc.includes('how-it-works')) return 'how-it-works';
  if (loc.includes('ielts-speaking') || loc.includes('ielts')) return 'ielts-speaking';
  if (loc.includes('community-guidelines') || loc.includes('guidelines') || loc.includes('safety')) return 'community-guidelines';
  if (loc.includes('faq')) return 'faq';
  if (loc.includes('privacy') || loc.includes('terms') || loc.includes('refund')) return 'privacy';
  return 'landing';
};

export const App: React.FC = () => {
  const [activeView, setActiveView] = useState<AppView>(() => parseLocationToView());

  useEffect(() => {
    const handleLocationChange = () => {
      setActiveView(parseLocationToView());
    };

    window.addEventListener('hashchange', handleLocationChange);
    window.addEventListener('popstate', handleLocationChange);
    return () => {
      window.removeEventListener('hashchange', handleLocationChange);
      window.removeEventListener('popstate', handleLocationChange);
    };
  }, []);

  const navigateTo = useCallback((view: AppView | string) => {
    let canonicalPath = '/';
    let targetView: AppView = 'landing';

    switch (view) {
      case 'how-it-works':
        canonicalPath = '/how-it-works';
        targetView = 'how-it-works';
        break;
      case 'ielts-speaking':
      case 'ielts':
        canonicalPath = '/ielts-speaking';
        targetView = 'ielts-speaking';
        break;
      case 'community-guidelines':
      case 'guidelines':
      case 'safety':
        canonicalPath = '/community-guidelines';
        targetView = 'community-guidelines';
        break;
      case 'faq':
        canonicalPath = '/faq';
        targetView = 'faq';
        break;
      case 'privacy':
      case 'terms':
      case 'refund':
        canonicalPath = '/privacy';
        targetView = 'privacy';
        break;
      case 'landing':
      default:
        canonicalPath = '/';
        targetView = 'landing';
        break;
    }

    if (typeof window !== 'undefined') {
      if (typeof window.history.pushState === 'function') {
        window.history.pushState(null, '', canonicalPath);
      } else {
        window.location.hash = targetView === 'landing' ? '' : `#${targetView}`;
      }
    }
    setActiveView(targetView);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleBackToLanding = useCallback(() => {
    navigateTo('landing');
  }, [navigateTo]);

  if (activeView === 'how-it-works') {
    return <HowItWorksScreen onBack={handleBackToLanding} onNavigate={navigateTo} />;
  }

  if (activeView === 'ielts-speaking') {
    return <IeltsSpeakingGuideScreen onBack={handleBackToLanding} onNavigate={navigateTo} />;
  }

  if (activeView === 'community-guidelines') {
    return <GuidelinesScreen onBack={handleBackToLanding} onNavigate={navigateTo} />;
  }

  if (activeView === 'safety') {
    return <SafetyGuideScreen onBack={handleBackToLanding} onNavigate={navigateTo} />;
  }

  if (activeView === 'faq') {
    return <FaqScreen onBack={handleBackToLanding} onNavigate={navigateTo} />;
  }

  if (activeView === 'privacy') {
    return <PrivacyScreen onBack={handleBackToLanding} onNavigate={navigateTo} />;
  }

  if (activeView === 'terms') {
    return <TermsScreen onBack={handleBackToLanding} onNavigate={navigateTo} />;
  }

  return (
    <LandingPage
      onOpenGuidelines={() => navigateTo('community-guidelines')}
      onOpenPrivacy={() => navigateTo('privacy')}
    />
  );
};

export default App;
