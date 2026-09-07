import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { GoogleOAuthProvider, useGoogleLogin } from '@react-oauth/google';

const ALLOWED_EMAIL = 'm@alone.ltd';
const TOKEN_KEY = 'smhq_gtoken';
const LOCAL_MODE_KEY = 'smhq_local_mode';

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

export type AuthMode = 'google' | 'local';

interface AuthContextValue {
  user: AuthUser | null;
  accessToken: string | null;
  /** 'google' = signed in with Google, Drive sync on. 'local' = this-browser-only workspace. */
  mode: AuthMode;
  /** false when VITE_GOOGLE_CLIENT_ID is not set on this deployment. */
  googleConfigured: boolean;
  isLoading: boolean;
  error: string | null;
  signIn: () => void;
  enterLocalMode: () => void;
  signOut: () => void;
  clearError: () => void;
}

const LOCAL_USER: AuthUser = { email: 'local', name: 'Local workspace', picture: '' };

const AuthContext = createContext<AuthContextValue>({
  user: null, accessToken: null, mode: 'local', googleConfigured: false, isLoading: true, error: null,
  signIn: () => {}, enterLocalMode: () => {}, signOut: () => {}, clearError: () => {}
});

/** Shared state for both providers: restores a saved Google token or the local-mode flag. */
function useAuthState() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [mode, setMode] = useState<AuthMode>('local');
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
          setMode('google');
        } else {
          localStorage.removeItem(TOKEN_KEY);
        }
      }
      if (!saved && localStorage.getItem(LOCAL_MODE_KEY) === '1') {
        setUser(LOCAL_USER);
        setMode('local');
      }
    } catch {}
    setIsLoading(false);
  }, []);

  const enterLocalMode = useCallback(() => {
    try { localStorage.setItem(LOCAL_MODE_KEY, '1'); } catch {}
    setUser(LOCAL_USER);
    setAccessToken(null);
    setMode('local');
    setError(null);
  }, []);

  const signOut = useCallback(() => {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(LOCAL_MODE_KEY);
    } catch {}
    setUser(null);
    setAccessToken(null);
    setMode('local');
  }, []);

  return { user, setUser, accessToken, setAccessToken, mode, setMode, isLoading, error, setError, enterLocalMode, signOut };
}

/** Google-enabled provider (needs GoogleOAuthProvider above it). */
function GoogleAuthProvider({ children }: { children: React.ReactNode }) {
  const s = useAuthState();

  const login = useGoogleLogin({
    scope: 'openid profile email https://www.googleapis.com/auth/drive.file',
    onSuccess: async (tokenResponse) => {
      try {
        const userInfo = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${tokenResponse.access_token}` }
        }).then(r => r.json());

        if (userInfo.email !== ALLOWED_EMAIL) {
          s.setError(`Drive sync is private to ${ALLOWED_EMAIL}. You can still use the local workspace below.`);
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
        localStorage.removeItem(LOCAL_MODE_KEY);
        s.setUser({ email: tokenData.email, name: tokenData.name, picture: tokenData.picture });
        s.setAccessToken(tokenResponse.access_token);
        s.setMode('google');
        s.setError(null);
      } catch (e: any) {
        s.setError('Sign-in failed: ' + (e.message || 'Unknown error'));
      }
    },
    onError: (err) => {
      s.setError(
        `Google sign-in failed${err?.error ? ` (${err.error})` : ''}. ` +
        'If Google showed "redirect_uri_mismatch", this site\'s origin is not authorized on the OAuth client yet. ' +
        'You can continue in the local workspace.'
      );
    },
    onNonOAuthError: (err) => {
      s.setError(
        err.type === 'popup_closed'
          ? 'The Google window was closed before sign-in finished. Try again, or continue in the local workspace.'
          : 'Could not open the Google sign-in window (popup blocked?). You can continue in the local workspace.'
      );
    }
  });

  return (
    <AuthContext.Provider value={{
      user: s.user, accessToken: s.accessToken, mode: s.mode, googleConfigured: true,
      isLoading: s.isLoading, error: s.error,
      signIn: () => login(), enterLocalMode: s.enterLocalMode, signOut: s.signOut,
      clearError: () => s.setError(null)
    }}>
      {children}
    </AuthContext.Provider>
  );
}

/** Fallback provider when no Google client id is configured: local workspace only. */
function LocalAuthProvider({ children }: { children: React.ReactNode }) {
  const s = useAuthState();
  return (
    <AuthContext.Provider value={{
      user: s.user, accessToken: null, mode: 'local', googleConfigured: false,
      isLoading: s.isLoading, error: s.error,
      signIn: () => s.setError('Google sign-in is not configured on this deployment (VITE_GOOGLE_CLIENT_ID missing). Use the local workspace.'),
      enterLocalMode: s.enterLocalMode, signOut: s.signOut,
      clearError: () => s.setError(null)
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function AuthContextWrapper({ children }: { children: React.ReactNode }) {
  const clientId = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim();
  if (!clientId) {
    return <LocalAuthProvider>{children}</LocalAuthProvider>;
  }
  return (
    <GoogleOAuthProvider clientId={clientId}>
      <GoogleAuthProvider>{children}</GoogleAuthProvider>
    </GoogleOAuthProvider>
  );
}

export const useAuth = () => useContext(AuthContext);
