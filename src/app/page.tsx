import { Suspense } from "react";
import AppRoot from "@/components/AppRoot";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <AppRoot />
    </Suspense>
  );
}
