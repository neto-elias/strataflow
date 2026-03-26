/**
 * /invoices/[invoiceId] — Invoice detail page.
 *
 * Security:
 *   - buildingId mandatory via ?building= query param.
 *   - DB query scoped by BOTH invoiceId AND buildingId AND visibility.
 *   - serverHasPermission("payment:read") checked before any data fetch.
 *   - Authenticated users without access receive notFound().
 */

import { notFound, redirect }     from "next/navigation";
import { requireAuth }            from "@/lib/auth-helpers";
import { serverHasPermission }    from "@/lib/permissions";
import { db }                     from "@/lib/db";
import { getInvoiceVisibilityScope } from "@/lib/invoice-access";
import { InvoiceDetailClient }    from "@/components/invoices/InvoiceDetailClient";

interface Props {
  params:       { invoiceId: string };
  searchParams: { building?: string };
}

export default async function InvoiceDetailPage({ params, searchParams }: Props) {
  const user = await requireAuth();

  const buildingId = searchParams.building;
  if (!buildingId) redirect("/invoices");

  const canRead = await serverHasPermission("payment:read", buildingId);
  if (!canRead) notFound();

  const scope = await getInvoiceVisibilityScope(user.id, user.role, buildingId);

  const invoice = await db.invoice.findFirst({
    where: { id: params.invoiceId, buildingId, ...scope },
    select: {
      id:                  true,
      buildingId:          true,
      lotId:               true,
      maintenanceRequestId: true,
      type:                true,
      status:              true,
      description:         true,
      amountCents:         true,
      paidCents:           true,
      dueDate:             true,
      issuedAt:            true,
      periodStart:         true,
      periodEnd:           true,
      externalRef:         true,
      notes:               true,
      createdAt:           true,
      updatedAt:           true,
      issuedTo:  { select: { id: true, name: true, email: true, image: true } },
      createdBy: { select: { id: true, name: true, image: true } },
      lot:       { select: { id: true, unitNumber: true, floor: true } },
      payments: {
        orderBy: { createdAt: "desc" },
        select: {
          id:          true,
          status:      true,
          method:      true,
          provider:    true,
          amountCents: true,
          paidAt:      true,
          providerRef: true,
          notes:       true,
          createdAt:   true,
          paidBy: { select: { id: true, name: true, email: true, image: true } },
        },
      },
    },
  });

  if (!invoice) notFound();

  const [canCreate, canApprove] = await Promise.all([
    serverHasPermission("payment:create", buildingId),
    serverHasPermission("payment:approve", buildingId),
  ]);

  return (
    <InvoiceDetailClient
      invoice={invoice}
      canCreate={canCreate}
      canApprove={canApprove}
    />
  );
}
