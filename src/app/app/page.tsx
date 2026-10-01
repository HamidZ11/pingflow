import type { Metadata } from "next";
import { PageHeader, pageClassName } from "@/components/app/page-header";
import { AttentionList } from "@/features/attention/attention-list";
import { loadAttention } from "@/features/attention/data";
import { requireOwner } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Attention" };

// The first screen in the app, and the only one that asks anything of the
// owner: what does Pingflow need me for?
export default async function AttentionPage() {
  const owner = await requireOwner();
  const items = await loadAttention(owner);

  return (
    <div className={pageClassName("narrow")}>
      <PageHeader
        title="Attention"
        description="Things Pingflow needs you for."
      />
      <AttentionList items={items} />
    </div>
  );
}
