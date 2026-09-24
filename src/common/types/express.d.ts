import type { CurrentUser } from './current-user';
import type { WebProfile } from '@modules/web-auth/domain/web-auth.repository';

declare global {
  namespace Express {
    interface Request {
      currentUser?: CurrentUser;
      webUser?: WebProfile;
      requestId?: string;
    }
  }
}

export {};
