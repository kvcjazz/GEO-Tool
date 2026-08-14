"use client";

import { AppStateProvider } from "@/state/AppState";
import Shell from "./Shell";

export default function AppRoot() {
  return (
    <AppStateProvider>
      <Shell />
    </AppStateProvider>
  );
}
