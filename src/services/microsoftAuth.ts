/**
 * microsoftAuth — MSAL browser (PKCE, SPA, no client secret), lazy-loaded on first use so the
 * ~40 kB @azure/msal-browser bundle never ships to a visitor who doesn't click "Connect
 * Outlook". DESIGN-v2.1.md §A: identity only here; Drive sync stays Google-only (Phase 3 for
 * OneDrive). Tokens live in MSAL's own in-memory/session cache — never written to Dexie, never
 * logged, never returned to a caller who doesn't ask for them by name.
 *
 * Env: `VITE_MS_CLIENT_ID` (required to activate), `VITE_MS_TENANT` (optional, default
 * `common` — personal + org accounts). Redirect URI is always `${origin}/auth/microsoft`, so
 * BLUEPRINT/DESIGN's three registered URIs (two live hosts + localhost:5173) all resolve
 * correctly without any extra config.
 */

// Only types are imported eagerly — erased at compile time, so this does NOT pull the runtime
// package into the app bundle. The real module is dynamic-imported inside getMsal().
import type {
  AccountInfo,
  IPublicClientApplication,
  PopupRequest,
  SilentRequest,
} from '@azure/msal-browser';

export const REDIRECT_PATH = '/auth/microsoft';

/** The three hosts BLUEPRINT-v2.1.md §A commits to registering in Entra. */
export const KNOWN_HOSTS = [
  'https://silver-medalist-hq-zeta.vercel.app',
  'https://silver-medalist-hq.vercel.app',
  'http://localhost:5173',
];

/** Delegated Graph scopes this app ever asks for — DESIGN-v2.1.md §A. Mail.Send is opt-in only. */
export const GRAPH_SCOPES: Record<'identity' | 'mail' | 'send' | 'calendar', string[]> = {
  identity: ['User.Read'],
  mail: ['Mail.ReadWrite'],
  send: ['Mail.Send'],
  calendar: ['Calendars.Read'],
};

export interface MsAccount {
  homeAccountId: string;
  username: string;
  name?: string;
}

export class MicrosoftAuthError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = 'MicrosoftAuthError';
  }
}

function clientId(): string | undefined {
  return (import.meta.env.VITE_MS_CLIENT_ID as string | undefined)?.trim() || undefined;
}

function tenant(): string {
  return (import.meta.env.VITE_MS_TENANT as string | undefined)?.trim() || 'common';
}

function redirectUri(): string {
  return `${window.location.origin}${REDIRECT_PATH}`;
}

/** True once `VITE_MS_CLIENT_ID` is set on this deployment. Everything else stays inert until then. */
export function isConfigured(): boolean {
  return !!clientId();
}

function toAccount(a: AccountInfo): MsAccount {
  return { homeAccountId: a.homeAccountId, username: a.username, name: a.name };
}

let instance: IPublicClientApplication | null = null;
let initializing: Promise<IPublicClientApplication> | null = null;

/** Lazy-imports @azure/msal-browser and initializes exactly one PublicClientApplication. */
async function getMsal(): Promise<IPublicClientApplication> {
  if (instance) return instance;
  if (!initializing) {
    initializing = (async () => {
      const id = clientId();
      if (!id) throw new MicrosoftAuthError('Microsoft sign-in is not configured on this deployment (VITE_MS_CLIENT_ID is missing).');
      const { PublicClientApplication } = await import('@azure/msal-browser');
      const pca = new PublicClientApplication({
        auth: {
          clientId: id,
          authority: `https://login.microsoftonline.com/${tenant()}`,
          redirectUri: redirectUri(),
        },
        // Session-only: closing the tab drops the token. dataService/Dexie never sees it.
        cache: { cacheLocation: 'sessionStorage' },
      });
      await pca.initialize();
      instance = pca;
      return pca;
    })().catch(e => { initializing = null; throw e; });
  }
  return initializing;
}

function activeAccount(pca: IPublicClientApplication): AccountInfo | null {
  return pca.getActiveAccount() ?? pca.getAllAccounts()[0] ?? null;
}

/** Friendly mapping for the handful of MSAL failures a recruiter will actually hit. */
function friendlyError(e: unknown): MicrosoftAuthError {
  const msg = e instanceof Error ? e.message : String(e);
  if (/user_cancelled|popup_window_error/i.test(msg)) {
    return new MicrosoftAuthError('The Microsoft sign-in window was closed before finishing.', e);
  }
  if (/interaction_in_progress/i.test(msg)) {
    return new MicrosoftAuthError('A sign-in is already in progress — finish or close that window first.', e);
  }
  if (/AADSTS7000215|invalid_client/i.test(msg)) {
    return new MicrosoftAuthError('Microsoft rejected the app registration (invalid client id). Check VITE_MS_CLIENT_ID.', e);
  }
  return new MicrosoftAuthError(`Microsoft sign-in failed: ${msg}`, e);
}

/** Opens the Microsoft popup for identity only (`User.Read`). Outlook scopes are requested separately, on demand. */
export async function signIn(): Promise<MsAccount> {
  const pca = await getMsal();
  try {
    const req: PopupRequest = { scopes: GRAPH_SCOPES.identity };
    const result = await pca.loginPopup(req);
    if (result.account) pca.setActiveAccount(result.account);
    if (!result.account) throw new Error('No account returned');
    return toAccount(result.account);
  } catch (e) {
    throw friendlyError(e);
  }
}

export async function signOut(): Promise<void> {
  if (!instance) return;
  const account = activeAccount(instance);
  if (!account) return;
  try {
    await instance.logoutPopup({ account });
  } catch (e) {
    throw friendlyError(e);
  }
}

/** Synchronous — null until `signIn()` (or a prior session) has run in this tab. */
export function getAccount(): MsAccount | null {
  if (!instance) return null;
  const a = activeAccount(instance);
  return a ? toAccount(a) : null;
}

/**
 * Silent-then-popup token acquisition for the given delegated scopes. Returns null (never
 * throws) when there is no signed-in account yet — callers treat that as "not connected".
 * Throws MicrosoftAuthError for a real failure (e.g. the user declined the extra scope).
 */
export async function getToken(scopes: string[]): Promise<string | null> {
  const pca = await getMsal();
  const account = activeAccount(pca);
  if (!account) return null;
  const req: SilentRequest = { scopes, account };
  try {
    const result = await pca.acquireTokenSilent(req);
    return result.accessToken;
  } catch {
    try {
      const result = await pca.acquireTokenPopup({ scopes, account });
      return result.accessToken;
    } catch (e) {
      throw friendlyError(e);
    }
  }
}

export interface RegistrationStep {
  label: string;
  value?: string;
}

/**
 * Exact copy-paste registration steps for the Settings screen when `VITE_MS_CLIENT_ID` is
 * unset — DESIGN-v2.1.md §A: "the buttons explain what Mark must register." Includes the
 * live-detected redirect URI for whichever host is currently serving the app, alongside the
 * three the addendum commits to registering up front.
 */
export function registrationSteps(): RegistrationStep[] {
  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : null;
  const steps: RegistrationStep[] = [
    { label: 'Go to the Entra admin center', value: 'entra.microsoft.com → Identity → Applications → App registrations → New registration' },
    { label: 'Name', value: 'Silver Medalist HQ' },
    { label: 'Supported account types', value: 'Accounts in any organizational directory and personal Microsoft accounts' },
    { label: 'Platform', value: 'Single-page application (SPA)' },
    ...KNOWN_HOSTS.map(host => ({ label: 'Redirect URI', value: `${host}${REDIRECT_PATH}` })),
    { label: 'API permissions → Add a permission → Microsoft Graph → Delegated permissions', value: GRAPH_SCOPES.identity.concat(GRAPH_SCOPES.mail, GRAPH_SCOPES.send, GRAPH_SCOPES.calendar).join(', ') },
    { label: 'Copy the value shown as', value: 'Application (client) ID' },
    { label: 'Set it on both Vercel projects', value: 'vercel env add VITE_MS_CLIENT_ID production' },
  ];
  if (currentOrigin && !KNOWN_HOSTS.includes(currentOrigin)) {
    steps.splice(4, 0, { label: 'Also add this redirect URI (current host)', value: `${currentOrigin}${REDIRECT_PATH}` });
  }
  return steps;
}

export const microsoftAuth = {
  isConfigured, signIn, signOut, getAccount, getToken, registrationSteps,
  REDIRECT_PATH, KNOWN_HOSTS, GRAPH_SCOPES,
};

export default microsoftAuth;
