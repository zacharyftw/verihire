'use client';

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { decodeJwt } from 'jose';
import { api, setTokens, clearTokens, getTokens } from './api';
import type {
  AuthUser,
  TokenPair,
  LoginCredentials,
  RegisterCredentials,
} from '@verihire/types/auth';

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthContextValue extends AuthState {
  login: (credentials: LoginCredentials) => Promise<void>;
  register: (credentials: RegisterCredentials) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function isTokenExpired(token: string): boolean {
  try {
    const payload = decodeJwt(token);
    if (!payload.exp) return true;
    return Date.now() >= payload.exp * 1000 - 30000; // 30s buffer
  } catch {
    return true;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    isLoading: true,
    isAuthenticated: false,
  });

  const refreshUser = useCallback(async () => {
    try {
      const user = await api.get<AuthUser>('/auth/me');
      setState({ user, isLoading: false, isAuthenticated: true });
    } catch {
      clearTokens();
      setState({ user: null, isLoading: false, isAuthenticated: false });
    }
  }, []);

  useEffect(() => {
    const tokens = getTokens();
    if (tokens?.accessToken && !isTokenExpired(tokens.accessToken)) {
      refreshUser();
    } else if (tokens?.refreshToken) {
      // Try refresh
      api
        .post<{ accessToken: string; refreshToken: string }>('/auth/refresh', {
          refreshToken: tokens.refreshToken,
        })
        .then(data => {
          setTokens(data.accessToken, data.refreshToken);
          return refreshUser();
        })
        .catch(() => {
          clearTokens();
          setState({ user: null, isLoading: false, isAuthenticated: false });
        });
    } else {
      setState({ user: null, isLoading: false, isAuthenticated: false });
    }
  }, [refreshUser]);

  const login = useCallback(async (credentials: LoginCredentials) => {
    const result = await api.post<{ user: AuthUser; tokens: TokenPair }>(
      '/auth/login',
      credentials
    );
    setTokens(result.tokens.accessToken, result.tokens.refreshToken);
    setState({ user: result.user, isLoading: false, isAuthenticated: true });
  }, []);

  const register = useCallback(async (credentials: RegisterCredentials) => {
    const result = await api.post<{ user: AuthUser; tokens: TokenPair }>(
      '/auth/register',
      credentials
    );
    setTokens(result.tokens.accessToken, result.tokens.refreshToken);
    setState({ user: result.user, isLoading: false, isAuthenticated: true });
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // ignore
    }
    clearTokens();
    setState({ user: null, isLoading: false, isAuthenticated: false });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
