import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { AuthResponse } from '../types/index.ts';
import { getAdminToken, setAdminToken, clearAdminToken, adminFetch } from '../api/client.ts';

interface AuthContextType {
  isAuthenticated: boolean;
  urlToken: string | null;
  jwtToken: string | null;
  isLoading: boolean;
  login: (masterPassword: string, overrideToken?: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [jwtToken, setJwtTokenState] = useState<string | null>(null);
  const [urlToken, setUrlToken] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Parse ?token= from URL on mount and scrub URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenFromUrl = params.get('token');

    if (tokenFromUrl) {
      setUrlToken(tokenFromUrl);
      // Clean up token from browser address bar for security
      const cleanUrl = window.location.pathname + window.location.hash;
      window.history.replaceState({}, document.title, cleanUrl);
    }

    const existingJwt = getAdminToken();
    if (existingJwt) {
      setJwtTokenState(existingJwt);
      setIsAuthenticated(true);
    }
    setIsLoading(false);
  }, []);

  // Listen for unauthorized 401/403 events from API client
  useEffect(() => {
    const handleUnauthorized = () => {
      clearAdminToken();
      setJwtTokenState(null);
      setIsAuthenticated(false);
    };

    window.addEventListener('admin:unauthorized', handleUnauthorized);
    return () => {
      window.removeEventListener('admin:unauthorized', handleUnauthorized);
    };
  }, []);

  const login = useCallback(async (masterPassword: string, overrideToken?: string) => {
    const tokenToUse = overrideToken || urlToken || '';
    
    const response = await adminFetch<AuthResponse>('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({
        token: tokenToUse,
        masterPassword,
      }),
    });

    if (response.jwtToken) {
      setAdminToken(response.jwtToken);
      setJwtTokenState(response.jwtToken);
      setIsAuthenticated(true);
    } else {
      throw new Error('Invalid authentication response');
    }
  }, [urlToken]);

  const logout = useCallback(() => {
    clearAdminToken();
    setJwtTokenState(null);
    setIsAuthenticated(false);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        urlToken,
        jwtToken,
        isLoading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
