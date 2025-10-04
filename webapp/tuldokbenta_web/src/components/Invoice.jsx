import React, { forwardRef } from "react";

const Invoice = forwardRef(({ sale }, ref) => {
  const total = sale.items.reduce(
    (sum, it) => sum + Number(it.price) * (it.qty || 1),
    0
  );

  return (
    <div
      ref={ref}
      style={{
        width: "80mm", // ✅ thermal paper width
        fontFamily: "monospace",
        fontSize: "12px",
        padding: "8px",
      }}
    >
      <div style={{ textAlign: "center", marginBottom: "8px" }}>
        <h2 style={{ fontSize: "14px", margin: 0 }}>My Store</h2>
        <p style={{ margin: 0 }}>123 Main St.</p>
        <p style={{ margin: 0 }}>Tel: 0912-345-6789</p>
      </div>

      <p>Invoice #: {sale.invoice_number}</p>
      <p>Date: {new Date().toLocaleString()}</p>
      <hr />

      {sale.items.map((it, idx) => (
        <div key={idx} style={{ marginBottom: "4px" }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>
              {it.type === "service" ? it.service_name : it.item_name} x
              {it.qty || 1}
            </span>
            <span>{(it.price * (it.qty || 1)).toFixed(2)}</span>
          </div>

          {/* Freebies */}
          {it.freebies && it.freebies.length > 0 && (
            <div style={{ paddingLeft: "10px", fontSize: "11px" }}>
              {it.freebies.map((f, fi) =>
                f.choices.map((c, ci) => (
                  <div key={ci} style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>+ {c.item} x{c.qty}</span>
                    <span>FREE</span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      ))}

      <hr />
      <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "bold" }}>
        <span>Total</span>
        <span>{total.toFixed(2)}</span>
      </div>
      <hr />

      <p style={{ textAlign: "center", marginTop: "12px" }}>
        Thank you for your purchase!
      </p>
    </div>
  );
});

export default Invoice;
