// apps/ciaorelated/src/types/flash-list.d.ts
import "react-native";
declare module "@shopify/flash-list" {
  // Einige ältere Typings enthalten estimatedItemSize nicht – wir ergänzen es.
  interface FlashListProps<T> {
    estimatedItemSize?: number;
  }
}
