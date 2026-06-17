// src/adapters/supabase/authProvider.ts
// AuthProvider adapter backed by Supabase Auth. Maps the Supabase user object
// onto the domain-facing AuthUser shape (id, email, displayName from metadata).

import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { AuthProvider, AuthUser } from '@/ports';
import { supabaseClient } from './client';

function toAuthUser(user: User | null | undefined): AuthUser | null {
  if (!user) return null;
  const displayName = (user.user_metadata?.display_name as string | undefined) ?? undefined;
  return {
    id: user.id,
    email: user.email ?? undefined,
    displayName,
  };
}

export class SupabaseAuthProvider implements AuthProvider {
  constructor(private readonly client: SupabaseClient = supabaseClient) {}

  async getUser(): Promise<AuthUser | null> {
    const {
      data: { user },
    } = await this.client.auth.getUser();
    return toAuthUser(user);
  }

  async signInWithEmail(email: string, password: string): Promise<AuthUser | null> {
    const { data, error } = await this.client.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      console.error('Sign-in error:', error);
      return null;
    }
    return toAuthUser(data.user);
  }

  async signUp(
    email: string,
    password: string,
    displayName: string
  ): Promise<AuthUser | null> {
    const { data, error } = await this.client.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } },
    });
    if (error) {
      console.error('Sign-up error:', error);
      return null;
    }
    return toAuthUser(data.user);
  }

  async signOut(): Promise<void> {
    await this.client.auth.signOut();
  }

  onAuthStateChange(cb: (user: AuthUser | null) => void): () => void {
    const {
      data: { subscription },
    } = this.client.auth.onAuthStateChange((_event, session) => {
      cb(toAuthUser(session?.user));
    });
    return () => subscription.unsubscribe();
  }
}
