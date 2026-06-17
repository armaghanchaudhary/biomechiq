// src/ports/data.ts
// Ports for persistence, media storage, and identity. Adapter: Supabase (swappable for Firebase/S3).

import { SessionState, SessionSummary, Sport } from '@/domain';

export interface AuthUser {
  id: string;
  email?: string;
  displayName?: string;
}

export interface AuthProvider {
  getUser(): Promise<AuthUser | null>;
  signInWithEmail(email: string, password: string): Promise<AuthUser | null>;
  signUp(email: string, password: string, displayName: string): Promise<AuthUser | null>;
  signOut(): Promise<void>;
  onAuthStateChange(cb: (user: AuthUser | null) => void): () => void;
}

export interface SaveSessionMedia {
  videoUrl?: string;
  thumbnailUrl?: string;
}

export interface SessionRepository {
  save(session: SessionState, media?: SaveSessionMedia): Promise<{ id: string } | null>;
  getRecent(sport?: Sport, limit?: number): Promise<SessionSummary[]>;
  getById(id: string): Promise<SessionSummary | null>;
}

export interface MediaStorage {
  uploadVideo(localUri: string, userId: string, sessionId: string): Promise<string | null>;
}
