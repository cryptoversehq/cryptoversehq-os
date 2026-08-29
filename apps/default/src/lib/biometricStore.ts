// ─── Biometric / WebAuthn Store ──────────────────────────────────────────────
// Uses the Web Authentication API (FIDO2 / WebAuthn) for passwordless login.
// Credentials are stored as a mapping of userId → credentialId in localStorage.
// The private key never leaves the device; only a credential ID is persisted.

const CRED_KEY = 'cryptoverse_biometric_creds';

interface CredRecord {
  credentialId: string; // base64url encoded
  userId: string;
  email: string;
  provider: 'email' | 'google' | 'apple';
  registeredAt: string;
}

// ─── Persistence helpers ──────────────────────────────────────────────────────
function loadCreds(): CredRecord[] {
  try { return JSON.parse(localStorage.getItem(CRED_KEY) || '[]'); } catch { return []; }
}
function saveCreds(creds: CredRecord[]) {
  localStorage.setItem(CRED_KEY, JSON.stringify(creds));
}

// ─── Encoding helpers ─────────────────────────────────────────────────────────
function bufferToBase64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
function base64urlToBuffer(str: string): ArrayBuffer {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(b64);
  const buf = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
  return buf.buffer;
}
function stringToBuffer(str: string): ArrayBuffer {
  return new TextEncoder().encode(str).buffer;
}

// ─── Feature detection ────────────────────────────────────────────────────────
export function isBiometricSupported(): boolean {
  return !!(
    window.PublicKeyCredential &&
    navigator.credentials?.create &&
    navigator.credentials?.get
  );
}

/** Check if the platform authenticator (Face ID / fingerprint) is available */
export async function isBiometricAvailable(): Promise<boolean> {
  if (!isBiometricSupported()) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/** Check if a credential is already registered for this user */
export function hasBiometricCredential(userId: string): boolean {
  return loadCreds().some(c => c.userId === userId);
}

/** Return the stored credential record for an email (for login flow) */
export function getBiometricCredentialByEmail(email: string): CredRecord | null {
  return loadCreds().find(c => c.email === email.toLowerCase().trim()) ?? null;
}

/** Return ALL stored credentials (to show on login screen) */
export function getAllBiometricCredentials(): CredRecord[] {
  return loadCreds();
}

// ─── Registration ─────────────────────────────────────────────────────────────
/**
 * Register a new biometric credential for a user.
 * Must be called after the user has authenticated with email/Google/Apple.
 */
export async function registerBiometric(params: {
  userId: string;
  email: string;
  displayName: string;
  provider: 'email' | 'google' | 'apple';
}): Promise<{ ok: boolean; error?: string }> {
  if (!isBiometricSupported()) {
    return { ok: false, error: 'WebAuthn is not supported in this browser.' };
  }

  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const userId    = new Uint8Array(stringToBuffer(params.userId));

    const credential = await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: {
          name: 'CryptoVerse HQ',
          id:   window.location.hostname,
        },
        user: {
          id:          userId,
          name:        params.email,
          displayName: params.displayName,
        },
        pubKeyCredParams: [
          { alg: -7,   type: 'public-key' }, // ES256
          { alg: -257, type: 'public-key' }, // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',      // device-bound (Touch ID, Face ID, Windows Hello)
          userVerification:         'required',
          residentKey:              'preferred',
        },
        timeout: 60_000,
        attestation: 'none',
      },
    }) as PublicKeyCredential | null;

    if (!credential) {
      return { ok: false, error: 'Credential creation was cancelled.' };
    }

    const credentialId = bufferToBase64url(credential.rawId);

    // Save mapping
    const creds = loadCreds().filter(c => c.userId !== params.userId); // replace if exists
    creds.push({
      credentialId,
      userId:       params.userId,
      email:        params.email.toLowerCase().trim(),
      provider:     params.provider,
      registeredAt: new Date().toISOString(),
    });
    saveCreds(creds);

    return { ok: true };
  } catch (err: unknown) {
    if (err instanceof Error) {
      if (err.name === 'NotAllowedError') {
        return { ok: false, error: 'Biometric verification was cancelled or timed out.' };
      }
      return { ok: false, error: err.message };
    }
    return { ok: false, error: 'Biometric registration failed.' };
  }
}

// ─── Authentication ───────────────────────────────────────────────────────────
/**
 * Authenticate with a stored biometric credential.
 * Returns the email associated with the credential on success.
 */
export async function authenticateWithBiometric(
  credentialId?: string, // optional — if known from stored session
): Promise<{ ok: boolean; email?: string; userId?: string; error?: string }> {
  if (!isBiometricSupported()) {
    return { ok: false, error: 'WebAuthn is not supported in this browser.' };
  }

  try {
    const challenge   = crypto.getRandomValues(new Uint8Array(32));
    const allowCreds  = credentialId
      ? [{ id: base64urlToBuffer(credentialId), type: 'public-key' as const }]
      : []; // empty → browser discovers resident key

    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: allowCreds,
        userVerification: 'required',
        timeout: 60_000,
      },
    }) as PublicKeyCredential | null;

    if (!assertion) {
      return { ok: false, error: 'Authentication was cancelled.' };
    }

    const usedId = bufferToBase64url(assertion.rawId);
    const record = loadCreds().find(c => c.credentialId === usedId);

    if (!record) {
      return { ok: false, error: 'No account found for this biometric credential.' };
    }

    return { ok: true, email: record.email, userId: record.userId };
  } catch (err: unknown) {
    if (err instanceof Error) {
      if (err.name === 'NotAllowedError') {
        return { ok: false, error: 'Biometric authentication was cancelled or timed out.' };
      }
      return { ok: false, error: err.message };
    }
    return { ok: false, error: 'Biometric authentication failed.' };
  }
}

/** Remove all biometric credentials for a user (e.g. on logout or settings) */
export function removeBiometricCredential(userId: string): void {
  saveCreds(loadCreds().filter(c => c.userId !== userId));
}
