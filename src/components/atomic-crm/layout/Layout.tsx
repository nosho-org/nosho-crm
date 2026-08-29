import { Suspense, type ReactNode } from "react";
import { Notification } from "@/components/admin/notification";
import { Skeleton } from "@/components/ui/skeleton";

import { AssistProvider } from "../assist/assistStore";
import { NoshoAssistChat } from "../assist/NoshoAssistChat";
import { NoshoAssistFAB } from "../assist/NoshoAssistFAB";
import { useConfigurationLoader } from "../root/useConfigurationLoader";
import { CommandPalette } from "./CommandPalette";
import Header from "./Header";
import { SentryErrorBoundary } from "./SentryErrorBoundary";
import { VersionUpdateToast } from "./VersionUpdateToast";

export const Layout = ({ children }: { children: ReactNode }) => {
  useConfigurationLoader();
  return (
    <AssistProvider>
      <Header />
      <main className="w-full pt-4 px-[50px]" id="main-content">
        <SentryErrorBoundary>
          <Suspense fallback={<Skeleton className="h-12 w-12 rounded-full" />}>
            {children}
          </Suspense>
        </SentryErrorBoundary>
      </main>
      <CommandPalette />
      <NoshoAssistFAB />
      <NoshoAssistChat />
      <VersionUpdateToast />
      <Notification />
    </AssistProvider>
  );
};
