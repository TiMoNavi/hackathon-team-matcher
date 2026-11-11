import { createNavigationContainerRef } from "@react-navigation/native";
import type { RootStackParamList } from "../App"; // dein Typ aus App.tsx

export const navigationRef = createNavigationContainerRef<RootStackParamList>();
