"use client";

import { ChevronRight, Search, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import {
  FieldError,
  Hint,
  inputClassName,
  Label,
  selectClassName,
} from "@/components/app/fields";
import { Overlay } from "@/components/app/overlay";
import { PageHeader } from "@/components/app/page-header";
import { Spinner } from "@/components/app/spinner";
import { useToast } from "@/components/app/toaster";
import { Button } from "@/components/button-link";
import type { Relationship } from "@/domain/contacts/phone";
import { addCustomer } from "@/features/customers/actions";
import type { CustomerRow } from "@/features/customers/data";
import { cx } from "@/lib/cx";

// Every customer, with what matters operationally: how to reach them, when
// they're next booked and their regular slot. A table on wide screens, a
// list on phones.
export function CustomerList({ customers }: { customers: CustomerRow[] }) {
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const q = query.trim().toLowerCase();
  const shown = q ? customers.filter((c) => c.search.includes(q)) : customers;

  return (
    <>
      <PageHeader
        title="Customers"
        description="The people you work with, and who messages for them."
        actions={
          <Button onClick={() => setAdding(true)}>
            <UserPlus aria-hidden className="size-4" />
            Add customer
          </Button>
        }
      />

      {customers.length === 0 ? (
        <div className="rounded-lg border border-line bg-surface px-5 py-8">
          <h2 className="text-body font-semibold text-ink">No customers yet</h2>
          <p className="mt-1 text-ui text-ink-2">
            Customers appear here when you add them or book them in.
          </p>
        </div>
      ) : (
        <>
          <div className="relative max-w-sm">
            <label htmlFor="customer-search" className="sr-only">
              Search customers
            </label>
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3"
            />
            <input
              id="customer-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or number"
              className={cx(inputClassName, "pl-9")}
            />
          </div>
          <p className="sr-only" role="status">
            {q
              ? `${shown.length} ${shown.length === 1 ? "customer" : "customers"} found`
              : ""}
          </p>

          {shown.length === 0 ? (
            <p className="mt-6 text-ui text-ink-2">
              No one matches “{query.trim()}”.{" "}
              <button
                type="button"
                onClick={() => setQuery("")}
                className="font-medium text-ink underline underline-offset-4"
              >
                Clear search
              </button>
            </p>
          ) : (
            <>
              <table className="mt-5 hidden w-full overflow-hidden rounded-lg border border-line bg-surface text-left text-ui md:table">
                <thead className="border-b border-line bg-canvas text-ui-sm text-ink-3">
                  <tr>
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      Customer
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      Next booking
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      Regular slot
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      Last message
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {shown.map((c) => (
                    <tr
                      key={c.id}
                      className="group relative transition-[background-color] duration-150 hover:bg-canvas"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/app/customers/${c.id}`}
                          className="font-medium text-ink after:absolute after:inset-0 focus-visible:outline-none after:focus-visible:outline-2 after:focus-visible:-outline-offset-2 after:focus-visible:outline-ink"
                        >
                          {c.name}
                        </Link>
                        <p className="text-ui-sm text-ink-3">
                          {c.contact ?? "No WhatsApp number"}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-ink tabular-nums">
                        {c.nextBooking ?? (
                          <span className="text-ink-3">None</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-ink-2">
                        {c.regular ?? <span className="text-ink-3">—</span>}
                      </td>
                      <td className="px-4 py-3 text-ink-2 tabular-nums">
                        {c.lastMessage ?? <span className="text-ink-3">—</span>}
                        {c.paused && (
                          <span className="ml-2 rounded-xs bg-sunken px-1.5 py-0.5 text-label text-ink-2">
                            You’re handling
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <ul className="mt-5 divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface md:hidden">
                {shown.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/app/customers/${c.id}`}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-canvas"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-ui font-medium text-ink">
                          {c.name}
                        </span>
                        <span className="block truncate text-ui-sm text-ink-3">
                          {c.nextBooking
                            ? `Next: ${c.nextBooking}`
                            : "No upcoming booking"}
                        </span>
                      </span>
                      <ChevronRight
                        aria-hidden
                        className="size-4 shrink-0 text-ink-3"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}

      <AddCustomerSheet open={adding} onClose={() => setAdding(false)} />
    </>
  );
}

function AddCustomerSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Overlay
      open={open}
      onClose={onClose}
      title="Add a customer"
      description="Someone you work with, and the WhatsApp number that messages for them."
    >
      {open && <AddCustomerForm onDone={onClose} />}
    </Overlay>
  );
}

function AddCustomerForm({ onDone }: { onDone: () => void }) {
  const id = useId();
  const toast = useToast();
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [relationship, setRelationship] = useState<Relationship>("self");
  const [contactName, setContactName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await addCustomer({
            name,
            phone,
            relationship,
            contactName,
          });
          if (result.ok) {
            toast({ message: result.message ?? "Added." });
            onDone();
            if (result.customerId)
              router.push(`/app/customers/${result.customerId}`);
          } else {
            setError(result.error);
          }
        });
      }}
    >
      <div>
        <Label htmlFor={`${id}-name`}>Name</Label>
        <input
          id={`${id}-name`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className={cx(inputClassName, "mt-1.5")}
        />
      </div>
      <div>
        <Label htmlFor={`${id}-who`}>Who messages you?</Label>
        <select
          id={`${id}-who`}
          value={relationship}
          onChange={(e) => setRelationship(e.target.value as Relationship)}
          className={cx(selectClassName, "mt-1.5")}
        >
          <option value="self">They do</option>
          <option value="parent">A parent</option>
          <option value="guardian">A guardian</option>
          <option value="partner">A partner</option>
          <option value="other">Someone else</option>
        </select>
      </div>
      {relationship !== "self" && (
        <div>
          <Label htmlFor={`${id}-contact`}>Their name</Label>
          <input
            id={`${id}-contact`}
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            className={cx(inputClassName, "mt-1.5")}
          />
        </div>
      )}
      <div>
        <Label htmlFor={`${id}-phone`}>
          WhatsApp number{" "}
          <span className="font-normal text-ink-3">(optional)</span>
        </Label>
        <input
          id={`${id}-phone`}
          type="tel"
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="07700 900123"
          aria-describedby={`${id}-phone-hint`}
          className={cx(inputClassName, "mt-1.5")}
        />
        <Hint id={`${id}-phone-hint`}>
          How Pingflow will recognise their messages.
        </Hint>
      </div>
      {error && <FieldError>{error}</FieldError>}
      <div className="flex justify-end gap-2 border-t border-line pt-4">
        <Button variant="ghost" disabled={pending} onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Spinner />}
          Add customer
        </Button>
      </div>
    </form>
  );
}
