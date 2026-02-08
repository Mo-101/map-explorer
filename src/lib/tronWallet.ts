/**
 * TronLink Wallet Utility
 * Handles TronLink extension account gating and connection
 */

export interface TronAccount {
  address: string;
  isConnected: boolean;
}

export class TronWalletError extends Error {
  constructor(
    message: string,
    public code: number
  ) {
    super(message);
    this.name = 'TronWalletError';
  }
}

/**
 * Check if TronLink is installed and accessible
 */
export function isTronLinkInstalled(): boolean {
  const w = window as any;
  return !!(w.tronLink || w.tronWeb);
}

/**
 * Request TronLink accounts from user
 * This will prompt the user to unlock/select an account if needed
 */
export async function requestTronAccounts(): Promise<string[]> {
  const w = window as any;

  if (!isTronLinkInstalled()) {
    throw new TronWalletError(
      'TronLink extension not installed. Please install TronLink to connect.',
      4000
    );
  }

  try {
    // Modern TronLink API uses tronLink.request
    if (w.tronLink?.request) {
      const response = await w.tronLink.request({
        method: 'tron_requestAccounts'
      });

      if (response?.code === 200 && Array.isArray(response.address)) {
        return response.address;
      }

      // Handle rejection or other error codes
      if (response?.code === 4001) {
        throw new TronWalletError(
          'User rejected the connection request.',
          4001
        );
      }
    }

    // Fallback: try tronWeb directly (older versions)
    if (w.tronWeb?.defaultAddress?.base58) {
      return [w.tronWeb.defaultAddress.base58];
    }

    return [];
  } catch (err: any) {
    // Handle the specific "wallet must has at least one account" error
    if (err.message?.includes('wallet must has at least one account') ||
        err.message?.includes('4001')) {
      throw new TronWalletError(
        'No Tron account selected. Please unlock TronLink and select an account.',
        4001
      );
    }

    // Re-throw if already a TronWalletError
    if (err instanceof TronWalletError) {
      throw err;
    }

    throw new TronWalletError(
      `Failed to connect to TronLink: ${err.message || 'Unknown error'}`,
      5000
    );
  }
}

/**
 * Wait for TronWeb to be ready with an account
 * Polls for a limited time to avoid infinite loops
 */
export async function waitForTronAccount(
  maxAttempts: number = 20,
  intervalMs: number = 250
): Promise<string> {
  const w = window as any;

  for (let i = 0; i < maxAttempts; i++) {
    const addr = w.tronWeb?.defaultAddress?.base58;
    if (addr) {
      return addr;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  throw new TronWalletError(
    'Timeout waiting for Tron account. Ensure TronLink is unlocked and an account is selected.',
    4002
  );
}

/**
 * Ensure we have a Tron account before proceeding
 * This is the main entry point - call this before any Tron operations
 */
export async function ensureTronAccount(): Promise<string> {
  // First, try to request accounts (this may prompt user)
  const accounts = await requestTronAccounts();

  if (accounts.length > 0) {
    return accounts[0];
  }

  // If no accounts returned, wait a bit for injection
  return await waitForTronAccount();
}

/**
 * Get current connected account without prompting
 * Returns null if not connected
 */
export function getCurrentTronAccount(): string | null {
  const w = window as any;
  return w.tronWeb?.defaultAddress?.base58 || null;
}

/**
 * Sign data with TronLink
 * Must call ensureTronAccount() before this
 */
export async function signWithTronLink(
  data: string
): Promise<string> {
  const w = window as any;
  const address = getCurrentTronAccount();

  if (!address) {
    throw new TronWalletError(
      'No Tron account available. Call ensureTronAccount() first.',
      4003
    );
  }

  try {
    // Use tronLink.request for signing if available
    if (w.tronLink?.request) {
      const result = await w.tronLink.request({
        method: 'tron_signMessage',
        params: {
          message: data,
          address: address
        }
      });
      return result.signature;
    }

    // Fallback to tronWeb
    if (w.tronWeb?.trx) {
      return await w.tronWeb.trx.sign(data);
    }

    throw new TronWalletError('No signing method available', 5001);
  } catch (err: any) {
    if (err instanceof TronWalletError) {
      throw err;
    }

    // Handle user rejection
    if (err.message?.includes('cancel') || err.message?.includes('rejected')) {
      throw new TronWalletError('User rejected the signing request', 4001);
    }

    throw new TronWalletError(
      `Signing failed: ${err.message || 'Unknown error'}`,
      5002
    );
  }
}

/**
 * React hook helper: Safe wallet initialization
 * Call this only on user action (button click), NOT on component mount
 */
export async function connectTronWallet(): Promise<TronAccount> {
  const address = await ensureTronAccount();
  return {
    address,
    isConnected: true
  };
}
