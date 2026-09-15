import { SetMetadata } from '@nestjs/common';

export const API_SURFACE_KEY = 'api_surface';
export type ApiSurfaceType = 'admin' | 'web';

export const ApiSurface = (surface: ApiSurfaceType) =>
  SetMetadata(API_SURFACE_KEY, surface);
