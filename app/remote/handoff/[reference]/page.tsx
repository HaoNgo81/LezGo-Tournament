import { LegacyDisabledFeatureRoute } from "@/components/layout/disabled-feature-page";

export default async function RemoteHandoffPage({ params }: { params: Promise<{ reference: string }> }) {
  await params;

  return <LegacyDisabledFeatureRoute />;
}
