import { SiteHeader } from "@/components/site-header";

// The public site: shared header above every marketing page. The app, sign-in
// and onboarding have their own chrome.
export default function MarketingLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <SiteHeader />
      {children}
    </>
  );
}
