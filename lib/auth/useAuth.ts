'use client';

import { useState, useEffect, useCallback } from 'react';
import type { AuthUser } from './index';

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const checkUser = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        setUser(data.user || null);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkUser();
  }, [checkUser]);

  const loginWithGoogle = useCallback(() => {
    window.location.href = '/api/auth/google';
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      setUser(null);
      window.location.reload();
    } catch (err) {
      console.error('Logout error:', err);
    }
  }, []);

  return {
    user,
    isLoading,
    loginWithGoogle,
    logout,
    refreshUser: checkUser,
  };
}
