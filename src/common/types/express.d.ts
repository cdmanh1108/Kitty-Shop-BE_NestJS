import type { CurrentUser } from './current-user';

interface WebRequestIdentity {
  id: string;
  email: string | null;
  emailVerifiedAt: Date | null;
  createdAt: Date;
}

declare global {
  namespace Express {
    interface Request {
      currentUser?: CurrentUser;
      webUser?: WebRequestIdentity;
      requestId?: string;
    }
  }
}

export {};
