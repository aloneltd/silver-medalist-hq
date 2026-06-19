import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { GoogleOAuthProvider, useGoogleLogin } from '@react-oauth/google';

const ALLOWED_EMAIL = 'm@alone.ltd';
const TOKEN_KEY = 'smhq_gtoken';

interface TokenData {
  access_token: string;
  expiry: number;
  email: string;
  name: string;
  picture: string;
}

export interface AuthUser {
  email: string;
  name: string;
  picture: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  accessToken: string | null;
  isLoading: boolean;
  error: string | null;
  signIn: () => void;
  signOut: () => void;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null, accessToken: null, isLoading: true, error: null,
  signIn: () => {}, signOut: () => {}, clearError: () => {}
});

function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(TOKEN_KEY);
      if (saved) {
        const data: TokenData = JSON.parse(saved);
        if (data.expiry > Date.now()) {
          setUser({ email: data.email, name: data.name, picture: data.picture });
          setAccessToken(data.access_token);
        } else {
          localStorage.removeItem(TOKEN_KEY);
        }
      }
    } catch {}
    setIsLoading(false);
  }, []);

  const login = useGoogleLogin({
    scope: 'openid profile email https://www.googleapis.com/auth/drive.file',
    onSuccess: async (tokenResponse) => {
      try {
        const userInfo = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${tokenResponse.access_token}` }
        }).then(r => r.json());

        if (userInfo.email !== ALLOWED_EMAIL) {
          setError(`Access denied — this tool is private. Sign in with ${ALLOWED_EMAIL}.`);
          return;
        }

        const tokenData: TokenData = {
          access_token: tokenResponse.access_token,
          expiry: Date.now() + (tokenResponse.expires_in || 3600) * 1000,
          email: userInfo.email,
          name: userInfo.name || 'Mark',
          picture: userInfo.picture || ''
        };
        localStorage.setItem(TOKEN_KEY, JSON.stringify(tokenData));
        setUser({ email: tokenData.email, name: tokenData.name, picture: tokenData.picture });
        setAccessToken(tokenResponse.access_token);
        setError(null);
      } catch (e: any) {
        setError('Sign-in failed: ' + (e.message || 'Unknown error'));
      }
    },
    onError: () => setError('Google sign-in failed. Please try again.')
  });

  const signOut = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
    setAccessToken(null);
  }, []);

  return (
    <AuthContext.Provider value={{
      user, accessToken, isLoading, error,
      signIn: login, signOut, clearError: () => setError(null)
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function AuthContextWrapper({ children }: { children: React.ReactNode }) {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (!clientId) {
    return (
      <div style={{ padding: 40, fontFamily: 'monospace', background: '#0f172a', color: '#f97316', minHeight: '100vh' }}>
        <h2>⚠ VITE_GOOGLE_CLIENT_ID not set</h2>
        <p style={{ color: '#94a3b8' }}>Add it to your Vercel environment variables and redeploy.</p>
      </div>
    );
  }
  return (
    <GoogleOAuthProvider clientId={clientId}>
      <AuthProvider>{children}</AuthProvider>
    </GoogleOAuthProvider>
  );
}

export const useAuth = () => useContext(AuthContext);
