import { Suspense } from "react";
import { AccountCodeRecoveryPanel } from "@/components/auth/account-code-recovery-panel";
import { AppShell } from "@/components/layout/app-shell";

export default function ResetAccountCodePage() {
  return (
    <AppShell title="Nulstil kode" backHref="/" compactMobile>
      <Suspense fallback={null}>
        <AccountCodeRecoveryPanel />
      </Suspense>
    </AppShell>
  );
}
