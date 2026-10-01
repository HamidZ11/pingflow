import type { Metadata } from "next";
import { pageClassName } from "@/components/app/page-header";
import { CustomerList } from "@/features/customers/customer-list";
import { loadCustomers } from "@/features/customers/data";
import { requireOwner } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Customers" };

export default async function CustomersPage() {
  const owner = await requireOwner();
  const customers = await loadCustomers(owner);
  return (
    <div className={pageClassName("medium")}>
      <CustomerList customers={customers} />
    </div>
  );
}
