import { createContext, useContext, useState, useCallback } from 'react';
import { api } from '../services/api';

const AuthContext = createContext(null);

const STORAGE_KEY = 'commshub_user';
const TOKEN_KEY = 'commshub_token';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      // Sessions from before tokens existed have a user but no token; treat
      // those as signed out rather than rendering an app whose every call 401s.
      if (!localStorage.getItem(TOKEN_KEY)) {
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    } catch {
      return null;
    }
  });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const login = useCallback(async (email, password) => {
    setLoading(true);
    setError(null);
    try {
      const { user: u, token } = await api.post('/auth/login', { email, password });
      // The token is what proves identity to the API; the user object is only
      // for rendering, so a tampered copy of it grants nothing.
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(u));
      setUser(u);
      return u;
    } catch (e) {
      setError(e.message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, logout, error, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
