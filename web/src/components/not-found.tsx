import { BackOrHomeButton, StatusPage } from "@/components/status-page";

export function NotFound() {
  return (
    <StatusPage
      title="There's no page here"
      description="The link may be broken, or the page may have moved. Check the address, or head back."
    >
      <BackOrHomeButton variant="default" />
    </StatusPage>
  );
}
