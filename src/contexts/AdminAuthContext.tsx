import { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '@/integrations/supabase/client';

export const ADMIN_EMAIL = '21054cs051@gmail.com';
export const ADMIN_DEFAULT_PASSWORD = '12345678';

type AdminAuthContextType = {
  user: User | null;
  session: Session | null;
  isAdmin: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ error: Error | null }>;
  logout: () => Promise<void>;
};

const AdminAuthContext = createContext<AdminAuthContextType | null>(null);

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const login = async (email: string, password: string) => {
    if (!isSupabaseConfigured()) {
      return {
        error: new Error(
          'Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to your .env file.',
        ),
      };
    }

    const normalizedEmail = email.trim().toLowerCase();
    const designated = normalizedEmail === ADMIN_EMAIL.toLowerCase();

    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    // Session is sometimes only available via getSession() right after sign-in.
    if (!signInError) {
      let session = signInData.session;
      if (!session) {
        const { data: { session: persisted } } = await supabase.auth.getSession();
        session = persisted;
      }
      if (session) {
        return { error: null };
      }
      return {
        error: new Error(
          'Signed in but no session was returned. In Supabase go to Authentication → Providers → Email and disable "Confirm email", then try again (or confirm this user in Authentication → Users).',
        ),
      };
    }

    if (designated) {
      const msg = signInError.message.toLowerCase();

      if (msg.includes('email not confirmed')) {
        return {
          error: new Error(
            'This account exists but the email is not confirmed. In Supabase: Authentication → Providers → Email → disable "Confirm email", or open the user in Authentication → Users and confirm the email.',
          ),
        };
      }

      const shouldTrySignUp =
        msg.includes('invalid login') ||
        msg.includes('invalid credentials') ||
        msg.includes('invalid email or password') ||
        msg.includes('email and password') ||
        msg.includes('user not found') ||
        msg.includes('wrong password');

      if (shouldTrySignUp) {
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
        });

        if (!signUpError && signUpData.session) {
          return { error: null };
        }

        if (!signUpError && signUpData.user) {
          const retrySignIn = await supabase.auth.signInWithPassword({
            email: normalizedEmail,
            password,
          });
          if (!retrySignIn.error) {
            const sess =
              retrySignIn.data.session ??
              (await supabase.auth.getSession()).data.session;
            if (sess) return { error: null };
          }
          return {
            error: new Error(
              'Account may be created but you are not logged in. In Supabase → Authentication → Email: turn OFF "Confirm email", then click Login again. Or create the user manually: Authentication → Users → Add user → set password 12345678.',
            ),
          };
        }

        if (
          signUpError &&
          (signUpError.message.toLowerCase().includes('already registered') ||
            signUpError.message.toLowerCase().includes('already been registered') ||
            signUpError.message.toLowerCase().includes('user already'))
        ) {
          return {
            error: new Error(
              'This email is already registered with a different password (or sign-ups are restricted). Fix: Supabase Dashboard → Authentication → Users → find ' +
                normalizedEmail +
                ' → reset password to 12345678 (or delete the user and log in again to auto-create).',
            ),
          };
        }

        if (signUpError) {
          if (signUpError.message.toLowerCase().includes('signup') && signUpError.message.toLowerCase().includes('disabled')) {
            return {
              error: new Error(
                'New sign-ups are disabled. In Supabase → Authentication → Providers, enable email sign-ups, or add the user manually with password 12345678.',
              ),
            };
          }
          return { error: new Error(signUpError.message) };
        }
      }
    }

    return {
      error: new Error(signInError.message || 'Sign in failed'),
    };
  };

  const logout = async () => {
    await supabase.auth.signOut();
  };

  const isAdmin = !!user && user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();

  return (
    <AdminAuthContext.Provider value={{ user, session, isAdmin, loading, login, logout }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth must be used within AdminAuthProvider');
  return ctx;
}
