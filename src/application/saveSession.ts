// src/application/saveSession.ts
// Use case: SyncSession. Uploads the clip (if any) and persists the session via ports.

import { SessionState } from '@/domain';
import type { SessionRepository, MediaStorage, AuthProvider } from '@/ports';

export interface SaveSessionDeps {
  repo: SessionRepository;
  media: MediaStorage;
  auth: AuthProvider;
}

export function makeSaveSession(deps: SaveSessionDeps) {
  return async (
    session: SessionState,
    localVideoUri?: string
  ): Promise<{ id: string } | null> => {
    const user = await deps.auth.getUser();
    if (!user) return null;

    let videoUrl: string | undefined;
    if (localVideoUri) {
      const url = await deps.media.uploadVideo(localVideoUri, user.id, session.id);
      videoUrl = url ?? undefined;
    }

    return deps.repo.save(session, { videoUrl });
  };
}
