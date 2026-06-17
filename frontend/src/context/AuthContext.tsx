import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  api,
  setAuthToken,
  setRefreshToken as setClientRefreshToken,
  clearAuthToken,
  onAuthTokenRefreshed,
} from '../api/client';
import type { PanelRole } from '../types';

export type UserRole = PanelRole;

interface UserProfile {
  id: number;
  username: string;
  fullName: string;
  roles: UserRole[];
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  loading: boolean;
  error: string | null;
  user: UserProfile | null;
  userLoading: boolean;
  reloadUser(): Promise<void>;
  login(username: string, password: string): Promise<void>;
  logout(): void;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

const ACCESS_KEY = 'mfs_access_token';
const REFRESH_KEY = 'mfs_refresh_token';

function getInitialAccessToken() {
  if (typeof window === 'undefined') {
    return null;
  }
  const token = localStorage.getItem(ACCESS_KEY);
  if (token) {
    setAuthToken(token);
  }
  return token;
}

function getInitialRefreshToken() {
  if (typeof window === 'undefined') {
    return null;
  }
  return localStorage.getItem(REFRESH_KEY);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(getInitialAccessToken);
  const [refreshToken, setRefreshToken] = useState<string | null>(getInitialRefreshToken);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [userLoading, setUserLoading] = useState(Boolean(accessToken));

  useEffect(() => {
    if (accessToken) {
      setAuthToken(accessToken);
    } else {
      clearAuthToken();
    }
  }, [accessToken]);

  // 把 refresh token 同步给 client.ts——它在 401 时会用它自动续期。
  useEffect(() => {
    setClientRefreshToken(refreshToken);
  }, [refreshToken]);

  // 注册"续期成功"回调：client.ts 自动 refresh 拿到新 access token 后调一次，
  // AuthContext 负责更新 state + localStorage，让其他组件/请求看到新 token。
  useEffect(() => {
    onAuthTokenRefreshed((newAccess) => {
      setAccessToken(newAccess);
      localStorage.setItem(ACCESS_KEY, newAccess);
    });
    return () => {
      onAuthTokenRefreshed(null);
    };
  }, []);

  const loadUser = useCallback(async () => {
    if (!accessToken) {
      setUser(null);
      setUserLoading(false);
      return;
    }
    setUserLoading(true);
    try {
      const profile = await api.getCurrentUser();
      const resolvedRoles = Array.isArray(profile.roles) ? profile.roles : [];
      setUser({
        id: profile.id,
        username: profile.username,
        fullName: profile.full_name ?? '',
        roles: resolvedRoles as UserRole[],
      });
    } catch (err) {
      setUser(null);
      setError(err instanceof Error ? err.message : '无法加载用户信息');
      setAccessToken(null);
      setRefreshToken(null);
      localStorage.removeItem(ACCESS_KEY);
      localStorage.removeItem(REFRESH_KEY);
      clearAuthToken();
    } finally {
      setUserLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (accessToken) {
      loadUser();
    }
  }, [accessToken, loadUser]);

  const login = async (username: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      const tokens = await api.login({ username, password });
      setAccessToken(tokens.access);
      setRefreshToken(tokens.refresh);
      localStorage.setItem(ACCESS_KEY, tokens.access);
      localStorage.setItem(REFRESH_KEY, tokens.refresh);
      setAuthToken(tokens.access);
      await loadUser();
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setAccessToken(null);
    setRefreshToken(null);
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    clearAuthToken();
    setUser(null);
  };

  const value = useMemo<AuthState>(() => ({
    accessToken,
    refreshToken,
    loading,
    error,
    user,
    userLoading,
    reloadUser: loadUser,
    login,
    logout,
  }), [accessToken, refreshToken, loading, error, user, userLoading, loadUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
