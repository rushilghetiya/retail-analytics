// ─── Export Utilities ─────────────────────────────────────────────────────────

// ── CSV Export ────────────────────────────────────────────────────────────────
export function exportToCSV(data, filename) {
  const rows = [];
  // Summary
  rows.push(["RETAILENS ANALYTICS EXPORT"]);
  rows.push(["Generated", new Date().toLocaleString("en-IN")]);
  rows.push(["File", filename]);
  rows.push([]);

  rows.push(["SUMMARY METRICS"]);
  rows.push(["Total Visitors", data.total]);
  rows.push(["Avg Dwell Time (s)", data.avgDwell]);
  rows.push(["Peak Hour", data.peakHour]);
  rows.push(["Avg Queue", data.queueAvg]);
  rows.push(["Satisfaction Score", data.satisfaction?.overall]);
  rows.push(["Satisfaction Label", data.satisfaction?.label]);
  rows.push(["Conversion Rate (%)", data.funnelData?.[data.funnelData.length-1]?.pct]);
  rows.push(["Est. Revenue (₹)", data.basketSize?.totalRevenue]);
  rows.push(["Avg Basket Size (₹)", data.basketSize?.estimated]);
  rows.push(["Lost Sales (₹)", data.lostSales?.total]);
  rows.push([]);

  rows.push(["HOURLY TRAFFIC"]);
  rows.push(["Hour", "Visitors", "Queue Length"]);
  data.hours.forEach(h => rows.push([h.hour, h.visitors, h.queue]));
  rows.push([]);

  rows.push(["ZONE BREAKDOWN"]);
  rows.push(["Zone", "Avg Dwell (s)", "Interactions"]);
  data.zones.forEach(z => rows.push([z.name, z.dwell, z.interactions]));
  rows.push([]);

  rows.push(["CONVERSION FUNNEL"]);
  rows.push(["Stage", "Visitors", "Percentage (%)"]);
  data.funnelData.forEach(f => rows.push([f.label, f.value, f.pct]));
  rows.push([]);

  rows.push(["ANOMALIES"]);
  rows.push(["Type", "Severity", "Zone", "Time", "Description"]);
  data.anomalies.forEach(a => rows.push([a.type, a.severity, a.zone, a.time, a.desc]));
  rows.push([]);

  rows.push(["STAFFING SCHEDULE"]);
  rows.push(["Hour", "Visitors", "Current Staff", "Recommended", "Gap", "Status"]);
  data.staffing.forEach(s => rows.push([s.hour, s.visitors, s.current, s.recommended, s.gap, s.status]));
  rows.push([]);

  rows.push(["LOST SALES BREAKDOWN"]);
  rows.push(["Category", "Lost Revenue (₹)", "Tip"]);
  data.lostSales?.breakdown?.forEach(b => rows.push([b.label, b.value, b.tip]));
  rows.push([]);

  rows.push(["BASKET SIZE SEGMENTS"]);
  rows.push(["Segment", "Share (%)", "Avg Basket (₹)"]);
  data.basketSize?.segments?.forEach(s => rows.push([s.label, s.pct, s.avg]));

  const csv = rows.map(r => r.map(c => `"${String(c||"").replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob = new Blob(["\uFEFF"+csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = `retailens_${filename.replace(/\.[^.]+$/,"")}_${Date.now()}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

// ── JSON Export ───────────────────────────────────────────────────────────────
export function exportToJSON(data, filename) {
  const exportData = {
    meta: { generated: new Date().toISOString(), source: filename, version: "1.0" },
    summary: {
      total: data.total, avgDwell: data.avgDwell, peakHour: data.peakHour,
      queueAvg: data.queueAvg, satisfaction: data.satisfaction,
      conversionRate: data.funnelData?.[data.funnelData.length-1]?.pct,
      estimatedRevenue: data.basketSize?.totalRevenue,
      avgBasket: data.basketSize?.estimated,
      lostSales: data.lostSales?.total,
    },
    hours: data.hours, zones: data.zones, funnelData: data.funnelData,
    anomalies: data.anomalies, staffing: data.staffing,
    lostSales: data.lostSales, basketSize: data.basketSize,
    weeklyTrend: data.weeklyData, monthlyTrend: data.monthlyData,
  };
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = `retailens_${filename.replace(/\.[^.]+$/,"")}_${Date.now()}.json`;
  a.click(); URL.revokeObjectURL(url);
}

// ── PDF Export ────────────────────────────────────────────────────────────────
export function exportToPDF(data, filename, hmRef) {
  const w    = window.open("","_blank");
  const hImg = hmRef?.current?.toDataURL("image/png") || "";
  const date = new Date().toLocaleDateString("en-IN",{dateStyle:"long"});
  const sat  = data.satisfaction;
  const lost = data.lostSales;
  const bask = data.basketSize;
  const summ = data.dailySummary;

  w.document.write(`<!DOCTYPE html><html><head><title>RetailEns Report — ${filename}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;700&display=swap');
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'DM Sans',sans-serif;padding:44px 40px;max-width:900px;margin:0 auto;color:#111;font-size:13px}
    .hdr{display:flex;justify-content:space-between;padding-bottom:18px;border-bottom:3px solid #111;margin-bottom:24px}
    .logo{font-family:'Bebas Neue',sans-serif;font-size:32px;letter-spacing:3px}
    .sub{font-size:11px;color:#888;letter-spacing:2px;margin-top:2px}
    .meta{text-align:right;font-size:12px;color:#666;line-height:1.9}
    h2{font-family:'Bebas Neue',sans-serif;font-size:18px;letter-spacing:2px;margin:26px 0 12px;border-bottom:1px solid #eee;padding-bottom:4px;color:#111}
    h3{font-size:13px;font-weight:700;margin:14px 0 8px;color:#333}
    .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:4px}
    .stat{background:#f8f8f8;border-radius:8px;padding:12px 14px;border-left:3px solid #111}
    .slbl{font-size:9px;color:#888;letter-spacing:2px;text-transform:uppercase;margin-bottom:3px}
    .sval{font-family:'Bebas Neue',sans-serif;font-size:24px;line-height:1}
    .sunit{font-size:11px;color:#888;margin-left:2px}
    .sat-wrap{background:#f8f8f8;border-radius:12px;padding:20px;text-align:center;margin:12px 0}
    .sat-score{font-family:'Bebas Neue',sans-serif;font-size:56px}
    .summary-p{margin-bottom:10px;line-height:1.7;color:#333}
    .action{display:flex;gap:10px;padding:8px 12px;background:#f8f8f8;border-left:3px solid #111;border-radius:4px;margin-bottom:6px}
    .action-impact{margin-left:auto;font-size:11px;color:#007a6a;font-weight:700;white-space:nowrap}
    img.map{width:100%;display:block;border-radius:8px;margin-bottom:12px}
    .f-row{display:flex;align-items:center;gap:8px;margin-bottom:7px}
    .f-lbl{font-size:11px;color:#666;width:140px;text-align:right;flex-shrink:0}
    .f-bw{flex:1;background:#eee;border-radius:3px;height:20px;overflow:hidden;position:relative}
    .f-b{height:100%;background:linear-gradient(90deg,#111,#555)}
    .f-v{position:absolute;inset:0;display:flex;align-items:center;padding-left:8px;font-size:10px;font-weight:700;color:#fff}
    .f-d{font-size:10px;color:#c0392b;width:36px;text-align:right;flex-shrink:0}
    .an{padding:8px 12px;border-left:3px solid #111;background:#f8f8f8;border-radius:4px;margin-bottom:6px}
    .sev-high{border-color:#e74c3c}.sev-medium{border-color:#f39c12}.sev-low{border-color:#3498db}
    .lost-row{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #f0f0f0;font-size:12px}
    .lost-total{display:flex;justify-content:space-between;padding:10px 0;font-weight:700;font-size:14px;border-top:2px solid #111;margin-top:4px}
    table{width:100%;border-collapse:collapse;font-size:12px;margin-top:8px}
    th{text-align:left;padding:7px 10px;font-size:10px;color:#888;border-bottom:2px solid #eee;text-transform:uppercase;letter-spacing:1px}
    td{padding:7px 10px;border-bottom:1px solid #f0f0f0}
    .seg-bar{height:5px;border-radius:3px;background:#111;display:inline-block}
    .badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700}
    .footer{margin-top:36px;padding-top:12px;border-top:1px solid #eee;display:flex;justify-content:space-between;font-size:11px;color:#aaa}
    @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
    @page{margin:0.5in}
  </style></head><body>

  <div class="hdr">
    <div><div class="logo">RETAILENS</div><div class="sub">STORE INTELLIGENCE PLATFORM</div></div>
    <div class="meta"><b>${filename}</b><br>${date}<br>Satisfaction: ${sat?.overall}/100 (${sat?.label})<br>Generated by RetailEns AI</div>
  </div>

  <h2>SUMMARY METRICS</h2>
  <div class="stats">
    <div class="stat"><div class="slbl">Total Visitors</div><div class="sval">${data.total}<span class="sunit"> cust.</span></div></div>
    <div class="stat"><div class="slbl">Avg Dwell</div><div class="sval">${data.avgDwell}<span class="sunit"> sec</span></div></div>
    <div class="stat"><div class="slbl">Peak Hour</div><div class="sval">${data.peakHour}</div></div>
    <div class="stat"><div class="slbl">Satisfaction</div><div class="sval">${sat?.overall}<span class="sunit">/100</span></div></div>
    <div class="stat"><div class="slbl">Est. Revenue</div><div class="sval">₹${(bask?.totalRevenue/1000).toFixed(0)}<span class="sunit">k</span></div></div>
    <div class="stat"><div class="slbl">Avg Basket</div><div class="sval">₹${bask?.estimated}</div></div>
    <div class="stat"><div class="slbl">Lost Sales</div><div class="sval">₹${(lost?.total/1000).toFixed(0)}<span class="sunit">k</span></div></div>
    <div class="stat"><div class="slbl">Conversion</div><div class="sval">${data.funnelData?.[data.funnelData.length-1]?.pct}<span class="sunit">%</span></div></div>
  </div>

  <h2>DAILY AI SUMMARY</h2>
  <div class="sat-wrap"><div class="sat-score">${sat?.overall}/100</div><div style="font-size:15px;margin-top:4px">${sat?.label} · ${sat?.stars}★ / 5.0</div></div>
  ${summ?.paragraphs?.map(p=>`<p class="summary-p">${p}</p>`).join("")||""}
  <h3>RECOMMENDED ACTIONS</h3>
  ${summ?.actions?.map(a=>`<div class="action"><span>${a.icon}</span><span>${a.text}</span><span class="action-impact">${a.impact}</span></div>`).join("")||""}

  ${hImg?`<h2>MOVEMENT HEATMAP</h2><img class="map" src="${hImg}"/>`:""}

  <h2>CONVERSION FUNNEL</h2>
  ${data.funnelData.map((s,i)=>{ const drop=i>0?data.funnelData[i-1].pct-s.pct:0; return `<div class="f-row"><div class="f-lbl">${s.label}</div><div class="f-bw"><div class="f-b" style="width:${s.pct}%"></div><div class="f-v">${s.value.toLocaleString()} (${s.pct}%)</div></div>${i>0?`<div class="f-d">-${drop}%</div>`:""}</div>`; }).join("")}

  <h2>LOST SALES ANALYSIS</h2>
  ${lost?.breakdown?.map(b=>`<div class="lost-row"><span>${b.icon} ${b.label}</span><span style="color:#c0392b;font-weight:700">-₹${b.value.toLocaleString()}</span></div>`).join("")||""}
  <div class="lost-total"><span>Total Lost Sales</span><span style="color:#c0392b">-₹${lost?.total?.toLocaleString()}</span></div>
  <div class="lost-total" style="border-top:none;color:#007a6a"><span>Recoverable</span><span>₹${lost?.recoverable?.toLocaleString()}</span></div>

  <h2>BASKET SIZE ANALYSIS</h2>
  <table><thead><tr><th>Segment</th><th>Share</th><th>Avg Basket</th></tr></thead><tbody>
  ${bask?.segments?.map(s=>`<tr><td>${s.label}</td><td>${s.pct}%</td><td>₹${s.avg}</td></tr>`).join("")||""}
  </tbody></table>

  <h2>ANOMALIES DETECTED</h2>
  ${data.anomalies.map(a=>`<div class="an sev-${a.severity}"><b>${a.type}</b> · <span class="badge">${a.severity.toUpperCase()}</span> · ${a.zone} · ${a.time}<br><span style="color:#555">${a.desc}</span></div>`).join("")}

  <h2>ZONE BREAKDOWN</h2>
  <table><thead><tr><th>Zone</th><th>Avg Dwell</th><th>Interactions</th></tr></thead><tbody>
  ${data.zones.map(z=>`<tr><td><b>${z.name}</b></td><td>${z.dwell}s</td><td>${z.interactions}</td></tr>`).join("")}
  </tbody></table>

  <h2>STAFFING SCHEDULE</h2>
  <table><thead><tr><th>Hour</th><th>Visitors</th><th>Current</th><th>Recommended</th><th>Status</th></tr></thead><tbody>
  ${data.staffing.map(s=>`<tr><td>${s.hour}</td><td>${s.visitors}</td><td>${s.current}</td><td><b>${s.recommended}</b></td><td style="color:${s.status==="understaffed"?"#e74c3c":s.status==="overstaffed"?"#f39c12":"#27ae60"}">${s.status}</td></tr>`).join("")}
  </tbody></table>

  <div class="footer"><span>RetailEns — Store Intelligence Platform</span><span>Confidential · ${date}</span></div>
  <script>window.onload=()=>setTimeout(()=>window.print(),700)</script>
  </body></html>`);
  w.document.close();
}

// ── Google Sheets Export (simulated) ─────────────────────────────────────────
export function exportToGoogleSheets(data, filename) {
  // In production this would use Google Sheets API
  // For now, export as CSV and show instructions
  const rows = [
    ["RETAILENS DAILY METRICS — " + new Date().toLocaleDateString("en-IN")],
    [],
    ["Metric", "Value"],
    ["Total Visitors", data.total],
    ["Peak Hour", data.peakHour],
    ["Avg Dwell (s)", data.avgDwell],
    ["Conversion Rate (%)", data.funnelData?.[data.funnelData.length-1]?.pct],
    ["Satisfaction Score", data.satisfaction?.overall],
    ["Est. Revenue (₹)", data.basketSize?.totalRevenue],
    ["Avg Basket (₹)", data.basketSize?.estimated],
    ["Lost Sales (₹)", data.lostSales?.total],
    ["Recoverable (₹)", data.lostSales?.recoverable],
    [],
    ["HOURLY DATA"],
    ["Hour", "Visitors", "Queue"],
    ...data.hours.map(h => [h.hour, h.visitors, h.queue]),
  ];
  const csv  = rows.map(r => r.join(",")).join("\n");
  const blob = new Blob([csv], { type:"text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = `retailens_sheets_${Date.now()}.csv`;
  a.click(); URL.revokeObjectURL(url);
  return "sheets_downloaded";
}
