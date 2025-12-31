import React, { useEffect, useMemo, useState } from "react";
import "./galactic-quote.css";

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import logoUrl from "./assets/almav.png";

/** ========= Defaults ========= */
const APP_OWNER_NAME = "Alma Industria Creativa E.I.R.L. | Alma Quinta";

const STORAGE_KEYS = {
  SETTINGS: "alma_quote_settings_v2",
  SERVICES: "alma_quote_services_v2",
};

const DEFAULT_SETTINGS = {
  exchangeRate: 3.5, // 1 USD = 3.5 PEN
  igvRate: 0.18, // 18%
  companyName: APP_OWNER_NAME,
  companyRuc: "",
  companyEmail: "",
  companyPhone: "",
};

const DEFAULT_SERVICES = [
  {
    id: "srv_creacion_web",
    code: "creacion_web",
    label: "Creación de página web",
    suggestion:
      "Incluye estructura, secciones, responsive, performance básico, formularios y puesta en producción.",
    defaultHourlyCost: 60,
  },
  {
    id: "srv_mantenimiento_web",
    code: "mantenimiento_web",
    label: "Mantenimiento de página web",
    suggestion:
      "Actualizaciones, backups, monitoreo, correcciones, seguridad básica, soporte mensual.",
    defaultHourlyCost: 50,
  },
  {
    id: "srv_diseno_figma",
    code: "diseno_figma",
    label: "Diseño UI en Figma",
    suggestion:
      "Wireframes + UI final, componentes, estilos, prototipo navegable y handoff a desarrollo.",
    defaultHourlyCost: 55,
  },
];

const safeId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : String(Date.now() + Math.random());

function moneyFmt(amount, currency) {
  const locale = currency === "PEN" ? "es-PE" : "en-US";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function sanitizeFilename(s) {
  return (s || "documento")
    .toString()
    .trim()
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 80);
}

function toPercentInput(decimal) {
  const n = Number(decimal);
  if (!Number.isFinite(n)) return "";
  return String(Math.round(n * 100 * 100) / 100); // 2 decimales
}

function percentToDecimal(p) {
  const n = Number(p);
  if (!Number.isFinite(n)) return 0;
  return n / 100;
}

function slugifyCode(str) {
  return (str || "")
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 40);
}

async function fetchAsDataURL(url) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export default function App() {
  /** ========= Admin state ========= */
  const [adminOpen, setAdminOpen] = useState(false);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [services, setServices] = useState(DEFAULT_SERVICES);

  /** ========= Quote meta ========= */
  const [currency, setCurrency] = useState("PEN"); // Moneda general
  const [quote, setQuote] = useState({
    clientName: "Cliente",
    quoteNumber: "COT-001",
    validityDays: 7,
    date: new Date().toISOString().slice(0, 10),
  });

  /** ========= Rows ========= */
  const firstServiceCode = services[0]?.code || "creacion_web";

  const emptyRow = () => {
    const svc =
      services.find((s) => s.code === firstServiceCode) || services[0];
    return {
      id: safeId(),
      serviceType: svc?.code || firstServiceCode,
      detail: "",
      hours: 10,
      hourlyCost: Number(svc?.defaultHourlyCost ?? 0),
    };
  };

  const [rows, setRows] = useState([emptyRow()]);

  /** ========= Load from localStorage ========= */
  useEffect(() => {
    try {
      const savedSettings = JSON.parse(
        localStorage.getItem(STORAGE_KEYS.SETTINGS) || "null"
      );
      if (savedSettings && typeof savedSettings === "object") {
        setSettings((prev) => ({ ...prev, ...savedSettings }));
      }
    } catch {}

    try {
      const savedServices = JSON.parse(
        localStorage.getItem(STORAGE_KEYS.SERVICES) || "null"
      );
      if (Array.isArray(savedServices) && savedServices.length > 0) {
        // Validación mínima
        const cleaned = savedServices
          .filter((s) => s && s.code && s.label)
          .map((s) => ({
            id: s.id || safeId(),
            code: String(s.code),
            label: String(s.label),
            suggestion: String(s.suggestion || ""),
            defaultHourlyCost: Number(s.defaultHourlyCost || 0),
          }));
        if (cleaned.length > 0) setServices(cleaned);
      }
    } catch {}
  }, []);

  /** ========= Persist to localStorage ========= */
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.SERVICES, JSON.stringify(services));
  }, [services]);

  /** ========= Keep rows valid when services change ========= */
  useEffect(() => {
    if (!services.length) return;
    const codes = new Set(services.map((s) => s.code));
    const fallback = services[0].code;

    setRows((prev) =>
      prev.map((r) =>
        codes.has(r.serviceType) ? r : { ...r, serviceType: fallback }
      )
    );
  }, [services]);

  /** ========= Computed ========= */
  const computed = useMemo(() => {
    const items = rows.map((r) => {
      const hours = Number(r.hours) || 0;
      const hourlyCost = Number(r.hourlyCost) || 0;
      const subtotal = hours * hourlyCost;
      return { ...r, hours, hourlyCost, subtotal };
    });

    const subtotal = items.reduce((acc, it) => acc + it.subtotal, 0);
    const igv = subtotal * (Number(settings.igvRate) || 0);
    const total = subtotal + igv;

    // Conversión informativa
    const rate = Number(settings.exchangeRate) || 1;
    const otherCurrency = currency === "PEN" ? "USD" : "PEN";
    const convert = (amount) => {
      if (!Number.isFinite(amount)) return 0;
      if (currency === "PEN") return amount / rate; // PEN -> USD
      return amount * rate; // USD -> PEN
    };

    return {
      items,
      subtotal,
      igv,
      total,
      otherCurrency,
      subtotalOther: convert(subtotal),
      igvOther: convert(igv),
      totalOther: convert(total),
    };
  }, [rows, currency, settings.igvRate, settings.exchangeRate]);

  /** ========= Helpers ========= */
  function getServiceByCode(code) {
    return services.find((s) => s.code === code);
  }

  function updateRow(id, patch) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function removeRow(id) {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  function addRow() {
    setRows((prev) => [...prev, emptyRow()]);
  }

  function handleServiceChange(rowId, serviceType) {
    const svc = getServiceByCode(serviceType);
    const suggestion = svc?.suggestion || "";
    const defaultHourlyCost = Number(svc?.defaultHourlyCost ?? 0);

    setRows((prev) =>
      prev.map((r) =>
        r.id === rowId
          ? {
              ...r,
              serviceType,
              detail: r.detail?.trim() ? r.detail : suggestion,
              hourlyCost: defaultHourlyCost,
            }
          : r
      )
    );
  }

  /** ========= Admin: Services CRUD ========= */
  const [newService, setNewService] = useState({
    label: "",
    code: "",
    suggestion: "",
    defaultHourlyCost: 0,
  });

  function addServiceFromAdmin() {
    const label = (newService.label || "").trim();
    const code = (newService.code || slugifyCode(label)).trim();

    if (!label) {
      alert("Escribe el nombre del servicio.");
      return;
    }
    if (!code) {
      alert("El código del servicio está vacío.");
      return;
    }
    if (services.some((s) => s.code === code)) {
      alert("Ese código ya existe. Cambia el código para que sea único.");
      return;
    }

    const svc = {
      id: safeId(),
      code,
      label,
      suggestion: String(newService.suggestion || ""),
      defaultHourlyCost: Number(newService.defaultHourlyCost) || 0,
    };

    setServices((prev) => [...prev, svc]);
    setNewService({
      label: "",
      code: "",
      suggestion: "",
      defaultHourlyCost: 0,
    });
  }

  function updateService(id, patch) {
    setServices((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...patch } : s))
    );
  }

  function deleteService(id) {
    const svc = services.find((s) => s.id === id);
    if (!svc) return;

    if (services.length <= 1) {
      alert("Debe existir al menos 1 servicio.");
      return;
    }
    const ok = window.confirm(`¿Eliminar el servicio: "${svc.label}"?`);
    if (!ok) return;

    setServices((prev) => prev.filter((s) => s.id !== id));
  }

  /** ========= PDF: Cotización (sin horas / sin costo hora) ========= */
  async function generatePdfCotizacion() {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const marginX = 40;

    // Cargar logo como DataURL
    const logoDataUrl = await fetchAsDataURL(logoUrl);

    // Header layout
    const headerTop = 44;
    const logoSize = 30;

    if (logoDataUrl) {
      try {
        doc.addImage(
          logoDataUrl,
          "PNG",
          marginX,
          headerTop - 26,
          logoSize,
          logoSize
        );
      } catch {}
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(
      "COTIZACIÓN DE SERVICIOS",
      logoDataUrl ? marginX + logoSize + 10 : marginX,
      headerTop
    );

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);

    const companyLines = [
      settings.companyName || APP_OWNER_NAME,
      settings.companyRuc ? `RUC: ${settings.companyRuc}` : "",
      [settings.companyEmail, settings.companyPhone]
        .filter(Boolean)
        .join(" • "),
    ].filter(Boolean);

    const rightLines = [
      `N°: ${quote.quoteNumber}`,
      `Fecha: ${quote.date}`,
      `Cliente: ${quote.clientName}`,
      `Moneda: ${currency}`,
      `TC: 1 USD = ${Number(settings.exchangeRate) || 3.5} PEN`,
      `IGV: ${Math.round((Number(settings.igvRate) || 0) * 100)}%`,
    ];

    const infoY = headerTop + 18;

    companyLines.forEach((line, i) => {
      doc.text(line, marginX, infoY + i * 14);
    });

    const rightX = pageWidth - marginX;
    rightLines.forEach((line, i) => {
      doc.text(line, rightX, infoY + i * 14, { align: "right" });
    });

    // Table (SIN horas, SIN costo hora)
    const body = computed.items.map((it) => {
      const label = getServiceByCode(it.serviceType)?.label || it.serviceType;
      return [label, it.detail || "", moneyFmt(it.subtotal, currency)];
    });

    autoTable(doc, {
      startY: infoY + 80,
      head: [["Servicio", "Detalle", "Importe"]],
      body,
      theme: "grid",
      styles: {
        font: "helvetica",
        fontSize: 9,
        cellPadding: 6,
        valign: "top",
      },
      headStyles: { fontStyle: "bold" },
      columnStyles: {
        0: { cellWidth: 160 },
        1: { cellWidth: 260 },
        2: { cellWidth: 90, halign: "right" },
      },
    });

    const lastY = doc.lastAutoTable?.finalY || infoY + 90;
    const totalsY = lastY + 16;

    const labelX = pageWidth - marginX - 220;
    const valueX = pageWidth - marginX;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");

    doc.text("Subtotal", labelX, totalsY);
    doc.text(moneyFmt(computed.subtotal, currency), valueX, totalsY, {
      align: "right",
    });

    doc.text(
      `IGV (${Math.round((Number(settings.igvRate) || 0) * 100)}%)`,
      labelX,
      totalsY + 16
    );
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
      "Si requiere validar comuníquese con administración",
      marginX,
      totalsY + 66
    );

    const fileName = sanitizeFilename(
      `${quote.quoteNumber}_${quote.clientName}_cotizacion`
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
            <img className="brandLogo" src={logoUrl} alt="Alma Quinta" />
            <div>
              <h1 className="title">{APP_OWNER_NAME}</h1>
              <p className="subtitle">
                Cotizador • Web • Mantenimiento • UI/UX
              </p>

              <button
                className="btn ghost adminBtn"
                type="button"
                onClick={() => setAdminOpen((v) => !v)}
                title="Panel de administración"
              >
                {adminOpen ? "Cerrar administración" : "Administración"}
              </button>
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
              Tipo de cambio:{" "}
              <b>1 USD = {Number(settings.exchangeRate) || 3.5} PEN</b>
              <br />
              IGV:{" "}
              <b>{Math.round((Number(settings.igvRate) || 0.18) * 100)}%</b>
            </div>
          </div>
        </header>

        {/* ===== Admin Panel ===== */}
        {adminOpen && (
          <section className="card adminPanel">
            <div className="cardHead">
              <h2 className="h2">Panel de administración</h2>
              <div className="pill">Guardado automático (localStorage)</div>
            </div>

            <div className="adminGrid">
              <div className="adminBlock">
                <h3 className="h3">Configuración</h3>

                <label className="field">
                  <span className="label">Tipo de cambio (PEN por 1 USD)</span>
                  <input
                    className="input"
                    type="number"
                    step="0.01"
                    min="0"
                    value={settings.exchangeRate}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        exchangeRate: Number(e.target.value) || 0,
                      }))
                    }
                  />
                </label>

                <label className="field">
                  <span className="label">IGV (%)</span>
                  <input
                    className="input"
                    type="number"
                    step="0.01"
                    min="0"
                    value={toPercentInput(settings.igvRate)}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        igvRate: percentToDecimal(e.target.value),
                      }))
                    }
                  />
                  <div className="hint">Por defecto: 18%</div>
                </label>

                <div className="divider" />

                <h3 className="h3">Datos de empresa (para PDF)</h3>

                <label className="field">
                  <span className="label">Nombre</span>
                  <input
                    className="input"
                    value={settings.companyName}
                    readOnly
                  />
                </label>

                <label className="field">
                  <span className="label">RUC</span>
                  <input
                    className="input"
                    value={settings.companyRuc}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, companyRuc: e.target.value }))
                    }
                  />
                </label>

                <label className="field">
                  <span className="label">Email</span>
                  <input
                    className="input"
                    value={settings.companyEmail}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        companyEmail: e.target.value,
                      }))
                    }
                  />
                </label>

                <label className="field">
                  <span className="label">Teléfono</span>
                  <input
                    className="input"
                    value={settings.companyPhone}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        companyPhone: e.target.value,
                      }))
                    }
                  />
                </label>
              </div>

              <div className="adminBlock">
                <h3 className="h3">Servicios (agregar/editar)</h3>

                <div className="adminList">
                  {services.map((s) => (
                    <div className="adminItem" key={s.id}>
                      <div className="adminRow">
                        <label className="field">
                          <span className="label">Código</span>
                          <input className="input" value={s.code} readOnly />
                        </label>

                        <label className="field">
                          <span className="label">Nombre</span>
                          <input
                            className="input"
                            value={s.label}
                            onChange={(e) =>
                              updateService(s.id, { label: e.target.value })
                            }
                          />
                        </label>

                        <label className="field">
                          <span className="label">Costo/hora (default)</span>
                          <input
                            className="input"
                            type="number"
                            step="0.01"
                            min="0"
                            value={s.defaultHourlyCost}
                            onChange={(e) =>
                              updateService(s.id, {
                                defaultHourlyCost: Number(e.target.value) || 0,
                              })
                            }
                          />
                          <div className="hint">
                            Moneda según cotización (PEN/USD)
                          </div>
                        </label>
                      </div>

                      <label className="field">
                        <span className="label">Detalle sugerido</span>
                        <textarea
                          className="input textarea"
                          rows={3}
                          value={s.suggestion}
                          onChange={(e) =>
                            updateService(s.id, { suggestion: e.target.value })
                          }
                        />
                      </label>

                      <div className="adminActions">
                        <button
                          className="btn ghost"
                          type="button"
                          onClick={() => deleteService(s.id)}
                        >
                          Eliminar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="divider" />

                <h3 className="h3">Agregar nuevo servicio</h3>

                <div className="adminRow">
                  <label className="field">
                    <span className="label">Nombre</span>
                    <input
                      className="input"
                      value={newService.label}
                      onChange={(e) =>
                        setNewService((p) => ({
                          ...p,
                          label: e.target.value,
                          code: p.code || slugifyCode(e.target.value),
                        }))
                      }
                    />
                  </label>

                  <label className="field">
                    <span className="label">Código (único)</span>
                    <input
                      className="input"
                      value={newService.code}
                      onChange={(e) =>
                        setNewService((p) => ({
                          ...p,
                          code: slugifyCode(e.target.value),
                        }))
                      }
                    />
                    <div className="hint">Ej: mantenimiento_avanzado</div>
                  </label>

                  <label className="field">
                    <span className="label">Costo/hora (default)</span>
                    <input
                      className="input"
                      type="number"
                      step="0.01"
                      min="0"
                      value={newService.defaultHourlyCost}
                      onChange={(e) =>
                        setNewService((p) => ({
                          ...p,
                          defaultHourlyCost: Number(e.target.value) || 0,
                        }))
                      }
                    />
                  </label>
                </div>

                <label className="field">
                  <span className="label">Detalle sugerido</span>
                  <textarea
                    className="input textarea"
                    rows={3}
                    value={newService.suggestion}
                    onChange={(e) =>
                      setNewService((p) => ({
                        ...p,
                        suggestion: e.target.value,
                      }))
                    }
                  />
                </label>

                <button
                  className="btn neon"
                  type="button"
                  onClick={addServiceFromAdmin}
                >
                  + Agregar servicio
                </button>
              </div>
            </div>
          </section>
        )}

        {/* ===== Quote ===== */}
        <section className="card grid2">
          <div className="block">
            <h2 className="h2">Cotización</h2>
            <div className="formGrid">
              <Field
                label="Cliente"
                value={quote.clientName}
                onChange={(v) => setQuote((q) => ({ ...q, clientName: v }))}
              />
              <Field
                label="N° Cotización"
                value={quote.quoteNumber}
                onChange={(v) => setQuote((q) => ({ ...q, quoteNumber: v }))}
              />
              <Field
                label="Fecha"
                type="date"
                value={quote.date}
                onChange={(v) => setQuote((q) => ({ ...q, date: v }))}
              />
              <Field
                label="Validez (días)"
                type="number"
                value={quote.validityDays}
                onChange={(v) =>
                  setQuote((q) => ({
                    ...q,
                    validityDays: Math.max(1, Number(v) || 1),
                  }))
                }
              />
            </div>
          </div>

          <div className="block">
            <h2 className="h2">Acciones</h2>
            <div className="summary alt">
              <Row
                label="Subtotal"
                value={moneyFmt(computed.subtotal, currency)}
              />
              <Row
                label={`IGV (${Math.round(
                  (Number(settings.igvRate) || 0.18) * 100
                )}%)`}
                value={moneyFmt(computed.igv, currency)}
              />
              <div className="divider" />
              <Row
                label="Total"
                value={moneyFmt(computed.total, currency)}
                big
              />
            </div>

            <div
              style={{
                marginTop: 12,
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <button
                className="btn neon"
                onClick={generatePdfCotizacion}
                type="button"
              >
                Descargar PDF (Cotización)
              </button>
              <div className="pill">
                Conversión informativa:{" "}
                <b>{moneyFmt(computed.totalOther, computed.otherCurrency)}</b>
              </div>
            </div>
          </div>
        </section>

        {/* ===== Services table ===== */}
        <section className="card">
          <div className="cardHead">
            <h2 className="h2">Servicios</h2>
            <button className="btn neon" onClick={addRow} type="button">
              + Agregar servicio
            </button>
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
                  const svc = getServiceByCode(r.serviceType);
                  const suggestion = svc?.suggestion || "";
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
                          {services.map((s) => (
                            <option key={s.id} value={s.code}>
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
              IGV:{" "}
              <b>{Math.round((Number(settings.igvRate) || 0.18) * 100)}%</b> (se
              suma al total)
            </div>
            <div className="pill">
              TC: <b>1 USD = {Number(settings.exchangeRate) || 3.5} PEN</b>
            </div>
          </div>
        </section>

        <footer className="end">
          <div className="endGlow" />
          <p className="endText">
            Esta cotización puede ajustarse según alcance final, tiempos y
            entregables.
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
