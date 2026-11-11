// src/types/navigation.d.ts

import type { DefaultRouterOptions } from '@react-navigation/native';

/**
 * Fix für falschen id-Typ in manchen Typdefinitionen
 * → erlaubt string oder undefined statt nur undefined
 */
declare module '@react-navigation/native' {
  interface DefaultRouterOptions<RouteName extends string> {
    id?: string;
  }
}
