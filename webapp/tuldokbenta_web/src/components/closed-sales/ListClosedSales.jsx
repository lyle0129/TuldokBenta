import React, { useState, useEffect, useMemo } from "react";
import { printInvoice } from "../../utils/printInvoice";
import Pagination from "../shared/Pagination";
import EditClosedSaleModal from "../sales-modals/EditClosedSaleModal";
import CorrectDatesModal from "../admin/CorrectDatesModal";
import { isFreeLine } from "../../utils/buildSaleItems";
import { formatCurrency, formatDateTime, saleTotal } from "../../utils/format";
import { useAuth } from "../../hooks/useAuth";
import { usePaymentMethods } from "../../hooks/usePaymentMethods";
import { useShopProfile } from "../../hooks/useShopProfile";
import { buildMethodLookup, resolveMethod } from "../../utils/paymentMethods";
import {
  rowCardClass,
  rowActionsClass,
  rowActionClass,
  rowActionAccents,
} from "../shared/fieldStyles";

const SALES_PER_PAGE = 10;

const ListClosedSales = ({
  closedSales,
  revertSale,
  updateClosedSale,
  emptyMessage = "No closed sales yet.",
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [editingSale, setEditingSale] = useState(null);
  const [correctingSale, setCorrectingSale] = useState(null);

  // The date correction is the one action here that rewrites history, so it is
  // offered to a super admin only — and the server refuses it for anyone else
  // regardless, since /api/admin sits behind requireRole("super_admin").
  const session = useAuth();
  const isSuperAdmin = session?.user?.role === "super_admin";

  // The receipt's header, read the same way the payment methods below are.
  const { shopProfile } = useShopProfile();

  // Rows store the method code; this turns it back into the admin's label.
  const { paymentMethods } = usePaymentMethods();
  const methodLookup = useMemo(
    () => buildMethodLookup(paymentMethods),
    [paymentMethods]
  );

  // Searching or changing the day can shrink the list past the current page.
  useEffect(() => {
    setCurrentPage(1);
  }, [closedSales]);

  const totalPages = Math.ceil(closedSales.length / SALES_PER_PAGE);
  const indexOfLastSale = currentPage * SALES_PER_PAGE;
  const currentSales = closedSales.slice(
    indexOfLastSale - SALES_PER_PAGE,
    indexOfLastSale
  );

  if (closedSales.length === 0) {
    return (
      <p className="text-gray-500 dark:text-gray-400 text-center italic py-8">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className="text-gray-800 dark:text-gray-100">
      <div className="space-y-4">
        {currentSales.map((sale) => (
          <div key={sale.id} className={rowCardClass}>
            <div className="min-w-0">
              <h3 className="font-semibold text-lg text-gray-900 dark:text-gray-100">
                Invoice #{sale.invoice_number}
              </h3>

              {sale.customer_name && (
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mt-0.5">
                  {sale.customer_name}
                </p>
              )}

              <p className="text-base font-medium mt-1 text-green-700 dark:text-green-400">
                {formatCurrency(saleTotal(sale))}
                <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
                  via {resolveMethod(methodLookup, sale.paid_using).label}
                </span>
              </p>

              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Paid at: {formatDateTime(sale.paid_at)}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Created at: {formatDateTime(sale.created_at)}
              </p>

              <ul className="text-sm text-gray-600 dark:text-gray-300 list-disc pl-5 mt-2 space-y-0.5">
                {sale.items.map((it, i) => (
                  <li key={i} className={isFreeLine(it) ? "text-green-600 dark:text-green-400" : ""}>
                    {it.type === "service"
                      ? `${it.service_name} ×${it.qty || 1}`
                      : `${it.item_name} ×${it.qty || 1}`}
                    {isFreeLine(it) && " (free)"}
                  </li>
                ))}
              </ul>
            </div>

            {/* Two buttons per row on a phone; a narrow column from `sm:` up.
                These used to be a fixed column that squeezed the invoice text
                to a sliver on a narrow screen. The recipe now lives in
                fieldStyles so all three sales lists share it. */}
            <div className={rowActionsClass}>
              <button
                type="button"
                onClick={() => revertSale(sale.id)}
                className={rowActionClass(rowActionAccents.yellow)}
              >
                Revert
              </button>

              {/* Safe after payment because it touches nothing that moves stock
                  — see updateClosedSale in closedSalesController. */}
              {updateClosedSale && (
                <button
                  type="button"
                  onClick={() => setEditingSale(sale)}
                  className={rowActionClass(rowActionAccents.blue)}
                >
                  Edit details
                </button>
              )}

              {/* NOTE: no Delete here — reverting stock for a sale deleted at
                  this stage isn't handled yet. */}

              {isSuperAdmin && (
                <button
                  type="button"
                  onClick={() => setCorrectingSale(sale)}
                  className={rowActionClass(rowActionAccents.red)}
                >
                  Fix dates
                </button>
              )}

              <button
                type="button"
                onClick={() => printInvoice(sale, shopProfile)}
                className={rowActionClass(rowActionAccents.purple)}
              >
                Print
              </button>
            </div>
          </div>
        ))}
      </div>

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
        totalItems={closedSales.length}
        pageSize={SALES_PER_PAGE}
      />

      <EditClosedSaleModal
        sale={editingSale}
        onClose={() => setEditingSale(null)}
        onSave={(patch) => updateClosedSale(editingSale.id, patch)}
      />

      {/* Invalidates for the SALE's shop, which need not be the active one —
          the admin routes reach every shop. */}
      <CorrectDatesModal
        table="closed"
        sale={correctingSale}
        onClose={() => setCorrectingSale(null)}
      />
    </div>
  );
};

export default ListClosedSales;
