import React, { useMemo, useState } from "react";
import "./galactic-quote.css";

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const EXCHANGE_RATE = 3.5; // Tipo de cambio fijo
const IGV_RATE = 0.18; // IGV Perú 18%

const SERVICE_CATALOG = [
  {
    value: "creacion_web",
    label: "Creación de página web",
    suggestion:
      "Incluye estructura, secciones, responsive, performance básico, formularios y puesta en producción.",
  },
  {
    value: "mantenimiento_web",
    label: "Mantenimiento de página web",
    suggestion:
      "Actualizaciones, backups, monitoreo, correcciones, seguridad básica, soporte mensual.",
  },
  {
    value: "diseno_figma",
    label: "Diseño UI en Figma",
    suggestion:
      "Wireframes + UI final, componentes, estilos, prototipo navegable y handoff a desarrollo.",
  },
];

function moneyFmt(amount, currency) {
  const locale = currency === "PEN" ? "es-PE" : "en-US";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function convert(amount, fromCurrency) {
  if (!Number.isFinite(amount)) return 0;
  // EXCHANGE_RATE = PEN por USD
  if (fromCurrency === "PEN") return amount / EXCHANGE_RATE; // PEN -> USD
  return amount * EXCHANGE_RATE; // USD -> PEN
}

const safeId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : String(Date.now() + Math.random());

const emptyRow = () => ({
  id: safeId(),
  serviceType: "creacion_web",
  detail: "",
  hours: 10,
  hourlyCost: 60, // Interno (NO se mostrará en el PDF)
});

function getServiceLabel(value) {
  return SERVICE_CATALOG.find((s) => s.value === value)?.label || value;
}

function sanitizeFilename(s) {
  return (s || "documento")
    .toString()
    .trim()
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 80);
}

export default function App() {
  const [currency, setCurrency] = useState("PEN"); // Moneda general
  const [meta, setMeta] = useState({
    companyName: "TU EMPRESA WEB",
    ruc: "RUC: 00000000000",
    email: "correo@tuempresa.com",
    phone: "+51 999 999 999",
    clientName: "Cliente",
    quoteNumber: "COT-001",
    validityDays: 7,
    date: new Date().toISOString().slice(0, 10),
  });

  const [rows, setRows] = useState([
    {
      id: safeId(),
      serviceType: "creacion_web",
      detail: "",
      hours: 20,
      hourlyCost: 60,
    },
    {
      id: safeId(),
      serviceType: "mantenimiento_web",
      detail: "",
      hours: 8,
      hourlyCost: 50,
    },
    {
      id: safeId(),
      serviceType: "diseno_figma",
      detail: "",
      hours: 12,
      hourlyCost: 55,
    },
  ]);

  const computed = useMemo(() => {
    const items = rows.map((r) => {
      const hours = Number(r.hours) || 0;
      const hourlyCost = Number(r.hourlyCost) || 0;
      const subtotal = hours * hourlyCost;
      return { ...r, hours, hourlyCost, subtotal };
    });

    const subtotal = items.reduce((acc, it) => acc + it.subtotal, 0);
    const igv = subtotal * IGV_RATE;
    const total = subtotal + igv;

    // Conversión a la otra moneda (informativa en UI)
    const otherCurrency = currency === "PEN" ? "USD" : "PEN";
    const subtotalOther = convert(subtotal, currency);
    const igvOther = convert(igv, currency);
    const totalOther = convert(total, currency);

    return {
      items,
      subtotal,
      igv,
      total,
      otherCurrency,
      subtotalOther,
      igvOther,
      totalOther,
    };
  }, [rows, currency]);

  function updateRow(id, patch) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function removeRow(id) {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  function addRow() {
    setRows((prev) => [...prev, emptyRow()]);
  }

  function handleServiceChange(id, serviceType) {
    const suggestion =
      SERVICE_CATALOG.find((s) => s.value === serviceType)?.suggestion || "";
    setRows((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              serviceType,
              detail: r.detail?.trim() ? r.detail : suggestion,
            }
          : r
      )
    );
  }

  // ====== PDF (descarga directa, sin imprimir) ======
  function generatePdf() {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const marginX = 40;

    // Header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("BOLETA DE SERVICIOS", marginX, 48);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);

    const leftLines = [
      meta.companyName,
      meta.ruc,
      `${meta.email} • ${meta.phone}`,
    ].filter(Boolean);

    const rightLines = [
      `N°: ${meta.quoteNumber}`,
      `Fecha: ${meta.date}`,
      `Cliente: ${meta.clientName}`,
      `Moneda: ${currency}`,
      `TC: 1 USD = ${EXCHANGE_RATE} PEN`,
    ].filter(Boolean);

    const startY = 68;
    leftLines.forEach((line, i) => doc.text(line, marginX, startY + i * 14));

    const rightX = pageWidth - marginX;
    rightLines.forEach((line, i) =>
      doc.text(line, rightX, startY + i * 14, { align: "right" })
    );

    // Table data (NO hourly cost)
    const body = computed.items.map((it) => [
      getServiceLabel(it.serviceType),
      it.detail || "",
      String(it.hours ?? 0),
      moneyFmt(it.subtotal, currency),
    ]);

    autoTable(doc, {
      startY: 150,
      head: [["Servicio", "Detalle", "Horas", "Importe"]],
      body,
      theme: "grid",
      styles: {
        font: "helvetica",
        fontSize: 9,
        cellPadding: 6,
        valign: "top",
      },
      headStyles: {
        fontStyle: "bold",
      },
      columnStyles: {
        0: { cellWidth: 130 },
        1: { cellWidth: 260 },
        2: { cellWidth: 60, halign: "right" },
        3: { cellWidth: 90, halign: "right" },
      },
    });

    // Totals
    const lastY = doc.lastAutoTable?.finalY || 150;
    const totalsY = lastY + 18;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");

    const labelX = pageWidth - marginX - 220;
    const valueX = pageWidth - marginX;

    doc.text("Subtotal", labelX, totalsY);
    doc.text(moneyFmt(computed.subtotal, currency), valueX, totalsY, {
      align: "right",
    });

    doc.text(`IGV (${Math.round(IGV_RATE * 100)}%)`, labelX, totalsY + 16);
    doc.text(moneyFmt(computed.igv, currency), valueX, totalsY + 16, {
      align: "right",
    });

    doc.setFont("helvetica", "bold");
    doc.text("TOTAL", labelX, totalsY + 36);
    doc.text(moneyFmt(computed.total, currency), valueX, totalsY + 36, {
      align: "right",
    });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(
      "Observación: Este comprobante no muestra costos internos por hora.",
      marginX,
      totalsY + 66
    );
    doc.text("Gracias por su preferencia.", marginX, totalsY + 80);

    const fileName = sanitizeFilename(
      `${meta.quoteNumber}_${meta.clientName}_boleta`
    );
    doc.save(`${fileName}.pdf`);
  }

  return (
    <div className="galaxy">
      <div className="stars" />
      <div className="nebula" />

      <div className="container">
        <header className="topbar">
          <div className="brand">
            <div className="logo-orb" aria-hidden="true" />
            <div>
              <h1 className="title">Cotización de Servicios</h1>
              <p className="subtitle">Web • Mantenimiento • UI/UX en Figma</p>
            </div>
          </div>

          <div className="currency-box">
            <label className="label">Moneda general</label>
            <div className="segmented">
              <button
                className={currency === "PEN" ? "seg active" : "seg"}
                onClick={() => setCurrency("PEN")}
                type="button"
              >
                Soles (PEN)
              </button>
              <button
                className={currency === "USD" ? "seg active" : "seg"}
                onClick={() => setCurrency("USD")}
                type="button"
              >
                Dólares (USD)
              </button>
            </div>
            <div className="fx">
              Tipo de cambio fijo: <b>1 USD = {EXCHANGE_RATE} PEN</b>
            </div>
          </div>
        </header>

        <section className="card grid2">
          <div className="block">
            <h2 className="h2">Empresa</h2>
            <div className="formGrid">
              <Field
                label="Nombre"
                value={meta.companyName}
                onChange={(v) => setMeta((m) => ({ ...m, companyName: v }))}
              />
              <Field
                label="RUC"
                value={meta.ruc}
                onChange={(v) => setMeta((m) => ({ ...m, ruc: v }))}
              />
              <Field
                label="Email"
                value={meta.email}
                onChange={(v) => setMeta((m) => ({ ...m, email: v }))}
              />
              <Field
                label="Teléfono"
                value={meta.phone}
                onChange={(v) => setMeta((m) => ({ ...m, phone: v }))}
              />
            </div>
          </div>

          <div className="block">
            <h2 className="h2">Cotización</h2>
            <div className="formGrid">
              <Field
                label="Cliente"
                value={meta.clientName}
                onChange={(v) => setMeta((m) => ({ ...m, clientName: v }))}
              />
              <Field
                label="N° Cotización"
                value={meta.quoteNumber}
                onChange={(v) => setMeta((m) => ({ ...m, quoteNumber: v }))}
              />
              <Field
                label="Fecha"
                type="date"
                value={meta.date}
                onChange={(v) => setMeta((m) => ({ ...m, date: v }))}
              />
              <Field
                label="Validez (días)"
                type="number"
                value={meta.validityDays}
                onChange={(v) =>
                  setMeta((m) => ({
                    ...m,
                    validityDays: Math.max(1, Number(v) || 1),
                  }))
                }
              />
            </div>
          </div>
        </section>

        <section className="card">
          <div className="cardHead">
            <h2 className="h2">Servicios</h2>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="btn neon" onClick={addRow} type="button">
                + Agregar servicio
              </button>

              <button className="btn neon" onClick={generatePdf} type="button">
                Descargar PDF (Boleta)
              </button>
            </div>
          </div>

          <div className="tableWrap">
            <table className="galTable">
              <thead>
                <tr>
                  <th style={{ width: 210 }}>Tipo de servicio</th>
                  <th>Detalle por tipo servicio</th>
                  <th style={{ width: 110 }}>Horas</th>
                  <th style={{ width: 150 }}>Costo / hora</th>
                  <th style={{ width: 170 }}>Subtotal</th>
                  <th style={{ width: 70 }} />
                </tr>
              </thead>
              <tbody>
                {computed.items.map((r) => {
                  const suggestion =
                    SERVICE_CATALOG.find((s) => s.value === r.serviceType)
                      ?.suggestion || "";
                  return (
                    <tr key={r.id}>
                      <td>
                        <select
                          className="input"
                          value={r.serviceType}
                          onChange={(e) =>
                            handleServiceChange(r.id, e.target.value)
                          }
                        >
                          {SERVICE_CATALOG.map((s) => (
                            <option key={s.value} value={s.value}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td>
                        <textarea
                          className="input textarea"
                          rows={3}
                          value={r.detail}
                          placeholder={suggestion}
                          onChange={(e) =>
                            updateRow(r.id, { detail: e.target.value })
                          }
                        />
                      </td>

                      <td>
                        <input
                          className="input"
                          type="number"
                          min="0"
                          step="0.5"
                          value={r.hours}
                          onChange={(e) =>
                            updateRow(r.id, { hours: e.target.value })
                          }
                        />
                      </td>

                      <td>
                        <input
                          className="input"
                          type="number"
                          min="0"
                          step="0.01"
                          value={r.hourlyCost}
                          onChange={(e) =>
                            updateRow(r.id, { hourlyCost: e.target.value })
                          }
                        />
                        <div className="hint">{currency} / hora</div>
                      </td>

                      <td className="right strong">
                        {moneyFmt(r.subtotal, currency)}
                      </td>

                      <td className="right">
                        <button
                          className="btn ghost"
                          onClick={() => removeRow(r.id)}
                          type="button"
                          title="Eliminar"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="notes">
            <div className="pill">
              IGV: <b>{Math.round(IGV_RATE * 100)}%</b> (se suma al total)
            </div>
            <div className="pill">
              Los precios están expresados en <b>{currency}</b>. Conversión
              informativa al final.
            </div>
          </div>
        </section>

        <section className="card grid2">
          <div className="block">
            <h2 className="h2">Resumen</h2>

            <div className="summary">
              <Row
                label="Subtotal"
                value={moneyFmt(computed.subtotal, currency)}
              />
              <Row
                label={`IGV (${Math.round(IGV_RATE * 100)}%)`}
                value={moneyFmt(computed.igv, currency)}
              />
              <div className="divider" />
              <Row
                label="Total"
                value={moneyFmt(computed.total, currency)}
                big
              />
            </div>

            <div className="micro">
              <div className="microLine">
                <span>Cliente:</span> <b>{meta.clientName}</b>
              </div>
              <div className="microLine">
                <span>Validez:</span> <b>{meta.validityDays} días</b>
              </div>
              <div className="microLine">
                <span>Fecha:</span> <b>{meta.date}</b>
              </div>
            </div>
          </div>

          <div className="block">
            <h2 className="h2">Conversión (informativa)</h2>
            <div className="summary alt">
              <Row
                label="Subtotal"
                value={moneyFmt(computed.subtotalOther, computed.otherCurrency)}
              />
              <Row
                label={`IGV (${Math.round(IGV_RATE * 100)}%)`}
                value={moneyFmt(computed.igvOther, computed.otherCurrency)}
              />
              <div className="divider" />
              <Row
                label={`Total en ${computed.otherCurrency}`}
                value={moneyFmt(computed.totalOther, computed.otherCurrency)}
                big
              />
            </div>

            <div className="footerBox">
              <div className="footLine">
                <b>{meta.companyName}</b> • {meta.ruc}
              </div>
              <div className="footLine">
                {meta.email} • {meta.phone}
              </div>
              <div className="footLine faint">
                {meta.quoteNumber} • Moneda: {currency} • TC: {EXCHANGE_RATE}
              </div>
            </div>
          </div>
        </section>

        <footer className="end">
          <div className="endGlow" />
          <p className="endText">
            Gracias por tu preferencia. Esta cotización puede ajustarse según
            alcance final, tiempos y entregables.
          </p>
        </footer>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text" }) {
  return (
    <label className="field">
      <span className="label">{label}</span>
      <input
        className="input"
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function Row({ label, value, big = false }) {
  return (
    <div className={big ? "sumRow big" : "sumRow"}>
      <span className="sumLabel">{label}</span>
      <span className="sumValue">{value}</span>
    </div>
  );
}
