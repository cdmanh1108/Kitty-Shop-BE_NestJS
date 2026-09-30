import type { Request } from 'express';
import type { WebAuthPrincipal } from './web-auth-principal';

export interface WebAuthRequest extends Request {
  webUser?: WebAuthPrincipal;
}
