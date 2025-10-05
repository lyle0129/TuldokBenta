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
        width: "58mm", // ✅ thermal paper width
        fontFamily: "monospace",
        fontSize: "12px",
        padding: "1px",
      }}
    >
      {/* 🧾 LOGO SECTION */}
      <div
        className="logo-container"
        style={{
          textAlign: "center",
          marginBottom: "4px",
        }}
      >
        <img
          src="https://i.ibb.co/NFtDrgj/SPINCREDIBLE.png"
          alt="SPINCREDIBLE Logo"
          style={{
            maxWidth: "50mm",   // ensures it fits within 80mm width
            width: "100%",
            height: "auto",
            marginBottom: "6px",
          }}
        />
      </div>

      {/* 🏪 STORE DETAILS */}
      <div style={{ textAlign: "center", marginBottom: "8px" }}>
        <h2 style={{ fontSize: "14px", margin: 0 }}>SPINCREDIBLE</h2>
        <p style={{ margin: 0 }}>Rizal Street Ext</p>
        <p style={{ margin: 0 }}>Mo: 0962-683-7430</p>
      </div>

      <p>Invoice #: {sale.invoice_number}</p>
      <p>Date: {new Date(sale.created_at).toLocaleString()}</p>
      {sale.paid_at && <p>Paid: {new Date(sale.paid_at).toLocaleString()}</p>}
      <hr />

      {/* 🧾 ITEMS */}
      {sale.items.map((it, idx) => (
        <div key={idx} style={{ marginBottom: "4px" }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>
              {it.type === "service" ? it.service_name : it.item_name} x
              {it.qty || 1}
            </span>
            <span>{(it.price * (it.qty || 1)).toFixed(2)}</span>
          </div>

          {/* 🎁 Freebies */}
          {it.freebies && it.freebies.length > 0 && (
            <div style={{ paddingLeft: "10px", fontSize: "11px" }}>
              {it.freebies.map((f, fIdx) =>
                f.choices.map((c, ci) => (
                  <div
                    key={`${fIdx}-${ci}`}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                    }}
                  >
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
      {/* 💰 TOTAL */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontWeight: "bold",
        }}
      >
        <span>Total</span>
        <span>{total.toFixed(2)}</span>
      </div>
      <hr />

      {/* 🙏 FOOTER */}
      <p style={{ textAlign: "center", marginTop: "12px" }}>
        Thank you for your purchase!
      </p>
    </div>
  );
});

export default Invoice;
