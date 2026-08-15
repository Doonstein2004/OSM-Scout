import 'react-native-url-polyfill/auto';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('⚠️ Supabase URL or Anon Key is missing. Check your environment variables.');
}

const isWeb = Platform.OS === 'web';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // React Native has no localStorage, and supabase-js falls back to an
    // in-memory store when none is given — which meant every cold start
    // minted a brand new anonymous user, and with it a new RevenueCat id.
    // Persisting to AsyncStorage is what makes the identity stable.
    storage: isWeb ? undefined : AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    // Only the web build ever lands on an OAuth callback URL directly.
    detectSessionInUrl: isWeb,
    flowType: 'pkce',
  },
});

/**
 * Ensures the user has a session (anonymous if no account exists).
 * This provides the stable ID needed for RevenueCat/Stripe web attribution.
 */
export async function getOrCreateUserId(): Promise<string | undefined> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user?.id) return session.user.id;

    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) {
      console.error('[Supabase] Anonymous sign-in error:', error);
      return undefined;
    }
    return data.user?.id;
  } catch (e) {
    console.error('[Supabase] getOrCreateUserId error:', e);
    return undefined;
  }
}
