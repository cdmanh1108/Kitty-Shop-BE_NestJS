import type { CurrentUser } from './current-user';

declare global {
  namespace Express {
    interface Request {
      currentUser?: CurrentUser;
      requestId?: string;
    }
  }
}

export {};
