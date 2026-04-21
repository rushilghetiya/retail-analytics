import { generateTheftData, buildIncidentLog } from "./theft.js";

// ─── Constants ────────────────────────────────────────────────────────────────
export const ZONE_COLORS = ["#00f5d4", "#f72585", "#7209b7", "#f4a261", "#4cc9f0"];
export const ZONE_NAMES  = ["Entrance", "Aisle A", "Aisle B", "Checkout", "Shelf Zone"];

export const STORES = [
  { id: 1, name: "Downtown Flagship", city: "Mumbai", size: "4200 sqft", status: "open" },
  { id: 2, name: "Mall Branch",       city: "Pune",   size: "2800 sqft", status: "open" },
];

// ─── Store Metrics ────────────────────────────────────────────────────────────
// videoSeed: derived from actual video (filename hash + totalVisitors)
// This ensures Multi-Store numbers change with each video upload
// Per-store metrics — seeded deterministically so each store has its OWN consistent
// numbers that differ from each other, but also vary slightly each page load
export function generateStoreMetrics(storeId) {
  // Use a simple seeded random that gives different values per store
  let s = storeId * 2654435761 + Date.now() % 1000;  // store-specific + slight daily variation
  const rng = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const r   = (min, max) => min + rng() * (max - min);
  const ri  = (min, max) => Math.floor(r(min, max));

  // Each store has a personality: store 1 = busy flagship, store 2 = quieter mall
  const isFlagship = storeId === 1;
  return {
    visitors:     ri(isFlagship ? 280 : 150,  isFlagship ? 520 : 320),
    revenue:      ri(isFlagship ? 45000 : 22000, isFlagship ? 95000 : 55000),
    conversion:   parseFloat(r(isFlagship ? 12 : 8, isFlagship ? 24 : 18).toFixed(1)),
    avgDwell:     ri(isFlagship ? 80 : 60, isFlagship ? 260 : 180),
    satisfaction: parseFloat(r(isFlagship ? 3.5 : 3.0, isFlagship ? 4.8 : 4.5).toFixed(1)),
    queueAvg:     parseFloat(r(isFlagship ? 3.0 : 1.0, isFlagship ? 8.5 : 5.0).toFixed(1)),
    anomalies:    ri(isFlagship ? 1 : 0, isFlagship ? 6 : 4),
    trend:        rng() > 0.45 ? "up" : "down",
    trendPct:     parseFloat(r(1.5, 18).toFixed(1)),
    status:       "open",
  };
}

// ─── Heatmap ──────────────────────────────────────────────────────────────────
export function generateMockHeatmap() {
  return Array.from({ length: 20 }, (_, row) =>
    Array.from({ length: 30 }, (_, col) => {
      const d = Math.sqrt((col - 15) ** 2 + (row - 10) ** 2);
      return Math.max(0, Math.min(1, 1 - d / 14 + Math.random() * 0.3));
    })
  );
}

// zones: array of {name, interactions, dwell} from actual video analysis
// This seeds the heatmap so it reflects where REAL traffic was in this specific video
export function generateHeatmapFrames(count = 12, zones = null, seed = 42) {
  // Zone → canvas grid position mappings (match frontend zone definitions)
  const ZONE_GRID = {
    "Entrance":   { cx: 2,  cy: 17 },
    "Aisle A":    { cx: 8,  cy: 10 },
    "Aisle B":    { cx: 16, cy: 10 },
    "Checkout":   { cx: 26, cy: 17 },
    "Shelf Zone": { cx: 24, cy: 6  },
  };
  const ZONE_NAMES = ["Entrance","Aisle A","Aisle B","Checkout","Shelf Zone"];

  // If real zone data is available, use it to weight hotspot positions
  let hotspots = [];
  if (zones && zones.length > 0) {
    const maxI = Math.max(...zones.map(z => z.interactions), 1);
    zones.forEach(z => {
      const gp = ZONE_GRID[z.name];
      if (gp) {
        const weight = z.interactions / maxI;
        hotspots.push({ cx: gp.cx, cy: gp.cy, w: weight, dwell: z.dwell || 60 });
      }
    });
  } else {
    // Fallback: generic single-hotspot
    hotspots = [{ cx: 15, cy: 10, w: 1.0, dwell: 120 }];
  }

  // Deterministic noise seeded from zone data (so same zones → same frames)
  const totalInteractions = zones ? zones.reduce((s,z) => s+z.interactions, 0) : 42;
  const noiseSeed = totalInteractions * 137 + (zones ? zones[0]?.dwell || 60 : 60) + seed * 97;
  const noise = (row, col, frame) => {
    const h = Math.abs(Math.sin((row * 127 + col * 31 + frame * 17 + noiseSeed) * 0.1));
    return (h % 1) * 0.25 - 0.125;
  };

  return Array.from({ length: count }, (_, frame) => {
    const t = frame / Math.max(count - 1, 1);
    return Array.from({ length: 20 }, (_, row) =>
      Array.from({ length: 30 }, (_, col) => {
        // Sum contributions from all real hotspots, animated over time
        let val = 0;
        hotspots.forEach((hs, hi) => {
          // Each hotspot pulses at different phase based on dwell time
          const phase = (t + hi * 0.3) % 1;
          const pulse = 0.85 + 0.15 * Math.sin(phase * Math.PI * 2);
          const d = Math.sqrt((col - hs.cx) ** 2 + (row - hs.cy) ** 2);
          val += hs.w * pulse * Math.max(0, 1 - d / 10);
        });
        return Math.max(0, Math.min(1, val + noise(row, col, frame)));
      })
    );
  });
}

// ─── Journey Paths ────────────────────────────────────────────────────────────
export function generateJourneyPaths(count = 8) {
  const waypoints = [{ x:0.07,y:0.88 },{ x:0.27,y:0.5 },{ x:0.52,y:0.5 },{ x:0.87,y:0.85 },{ x:0.82,y:0.32 }];
  const colors = ["#00f5d4","#f72585","#4cc9f0","#f4a261","#7209b7","#a8dadc","#e9c46a","#ff6b6b"];
  const n = Math.max(1, Math.min(count, 8));
  return Array.from({ length: n }, (_, i) => {
    const pts = [{ x: 0.07 + Math.random() * 0.05, y: 0.86 + Math.random() * 0.08 }];
    const visited = new Set();
    for (let s = 0; s < 2 + Math.floor(Math.random() * 3); s++) {
      let next; do { next = Math.floor(Math.random() * waypoints.length); } while (visited.has(next));
      visited.add(next);
      const wp = waypoints[next];
      pts.push({ x: wp.x + (Math.random()-0.5)*0.07, y: wp.y + (Math.random()-0.5)*0.09 });
    }
    return { id: i+1, color: colors[i], points: pts, duration: 120 + Math.floor(Math.random()*480) };
  });
}

// ─── Funnel ───────────────────────────────────────────────────────────────────
// Base funnel (used when no visitor count is known)
export function generateFunnelData() {
  return generateFunnelDataScaled(342);
}

// Scaled funnel — takes real visitor count so numbers are proportional
export function generateFunnelDataScaled(total) {
  const n = Math.max(1, total);
  // Conversion rates vary slightly per video to feel realistic
  const r1 = 0.78 + Math.random()*0.08;
  const r2 = 0.48 + Math.random()*0.12;
  const r3 = 0.30 + Math.random()*0.12;
  const r4 = 0.14 + Math.random()*0.10;
  const r5 = 0.08 + Math.random()*0.08;
  return [
    { label:"Store Entered",    value:n,                    pct:100              },
    { label:"Browsed a Zone",   value:Math.floor(n*r1),     pct:Math.round(r1*100) },
    { label:"Shelf Interaction",value:Math.floor(n*r2),     pct:Math.round(r2*100) },
    { label:"Dwell 10s+",       value:Math.floor(n*r3),     pct:Math.round(r3*100) },
    { label:"Reached Checkout", value:Math.floor(n*r4),     pct:Math.round(r4*100) },
    { label:"Purchase (est.)",  value:Math.floor(n*r5),     pct:Math.round(r5*100) },
  ];
}

// ─── Anomalies ────────────────────────────────────────────────────────────────
export function generateAnomalies() {
  return [
    { id:1, type:"LOITERING",   severity:"high",   zone:"Shelf Zone", time:"14:23", desc:"Customer stationary 8+ mins near electronics shelf.", x:0.75, y:0.25 },
    { id:2, type:"CROWD SURGE", severity:"medium", zone:"Checkout",   time:"16:41", desc:"Queue spiked to 12 people — 3x above average.",        x:0.87, y:0.82 },
    { id:3, type:"EMPTY ZONE",  severity:"low",    zone:"Aisle B",    time:"09:15", desc:"Zero traffic for 22 mins during peak hours.",           x:0.52, y:0.50 },
    { id:4, type:"RAPID EXIT",  severity:"medium", zone:"Entrance",   time:"11:52", desc:"14 customers entered and left within 90 seconds.",      x:0.07, y:0.90 },
  ];
}

// ─── Trend Data ───────────────────────────────────────────────────────────────
export function generateWeeklyData() {
  return ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(day => {
    const base = 80 + Math.sin(Math.random()*3)*40 + Math.random()*30;
    return { day, current: Math.floor(base), previous: Math.floor(base*(0.85+Math.random()*0.3)) };
  });
}

export function generateMonthlyData() {
  return Array.from({ length: 4 }, (_, i) => ({
    week:`W${i+1}`, current: Math.floor(600+Math.random()*400), previous: Math.floor(500+Math.random()*400),
  }));
}

// ─── Staffing ─────────────────────────────────────────────────────────────────
export function generateStaffingData(hoursData) {
  return hoursData.map(h => {
    const recommended = Math.max(1, Math.ceil(h.visitors / 35));
    const current = Math.max(1, recommended + Math.floor(Math.random()*3) - 1);
    const gap = recommended - current;
    return { hour:h.hour, visitors:h.visitors, recommended, current, gap, status: gap>1?"understaffed":gap<-1?"overstaffed":"optimal" };
  });
}

// ─── Planogram ────────────────────────────────────────────────────────────────
export function generatePlanogramData() {
  return [
    { id:1, name:"Electronics",        current:"Shelf Zone", recommended:"Aisle A",   reason:"High dwell near entrance boosts impulse visibility",    priority:"high",   lift:"+23%", applied:false },
    { id:2, name:"Seasonal Items",     current:"Aisle B",    recommended:"Entrance",  reason:"Seasonal items at entrance drive entry conversions",     priority:"high",   lift:"+18%", applied:false },
    { id:3, name:"Snacks & Beverages", current:"Aisle A",    recommended:"Checkout",  reason:"Impulse category — checkout maximises basket add-ons",   priority:"medium", lift:"+12%", applied:false },
    { id:4, name:"Household Essentials",current:"Entrance",  recommended:"Aisle B",   reason:"Essentials drive deeper store penetration",              priority:"medium", lift:"+9%",  applied:false },
    { id:5, name:"Premium Products",   current:"Checkout",   recommended:"Shelf Zone",reason:"Premium items need dwell time — Shelf Zone has most",    priority:"low",    lift:"+6%",  applied:false },
  ];
}

// ─── Satisfaction ─────────────────────────────────────────────────────────────
export function calculateSatisfaction(data) {
  if (!data) return null;
  const queueScore   = Math.max(0, 100-(data.queueAvg-1)*12);
  const dwellScore   = Math.min(100,(data.avgDwell/300)*100);
  const anomalyScore = Math.max(0, 100-data.anomalies.filter(a=>a.severity==="high").length*25);
  const convScore    = Math.min(100,(data.funnelData?.[data.funnelData.length-1]?.pct||10)*4);
  const overall      = Math.round(queueScore*0.35 + dwellScore*0.25 + anomalyScore*0.25 + convScore*0.15);
  const stars        = parseFloat(Math.min(5, Math.max(1, overall/20)).toFixed(1));
  return {
    overall, stars,
    queueScore: Math.round(queueScore), dwellScore: Math.round(dwellScore),
    anomalyScore: Math.round(anomalyScore), convScore: Math.round(convScore),
    label: overall>=80?"Excellent":overall>=65?"Good":overall>=50?"Average":"Needs Work",
    color: overall>=80?"#00f5d4":overall>=65?"#4cc9f0":overall>=50?"#f4a261":"#f72585",
    tips: [
      queueScore<60   && "Reduce checkout wait — open additional lanes during peak hours",
      dwellScore<50   && "Improve zone engagement — add interactive displays or clearer signage",
      anomalyScore<75 && "Address security anomalies — they impact shopper comfort",
      convScore<60    && "Boost conversion — review product placement and pricing visibility",
    ].filter(Boolean),
  };
}

// ─── Lost Sales ───────────────────────────────────────────────────────────────
export function calculateLostSales(data) {
  // ── All lost-sales figures are derived from actual estimated revenue ──────
  // This prevents fantasy numbers when visitor count is small.
  const avgBasket  = 850;
  const convRate   = (data.funnelData?.[data.funnelData.length-1]?.pct||14) / 100;
  const buyers     = Math.round(data.total * convRate);
  const actualSales = Math.round(buyers * avgBasket);   // ← baseline: what was actually earned

  // Queue & Understaffing: each understaffed hour costs ~3% of that hour's revenue
  const understaffedHours = data.staffing?.filter(s=>s.gap>0) || [];
  const hoursInClip = Math.max(1, (data.videoMeta?.durationSec||3600) / 3600);
  // pro-rate understaffed hours to the clip duration; cap at 20% of actual sales
  const queueLostRaw = understaffedHours.length * data.queueAvg * avgBasket * 0.03;
  const queueLost  = Math.min(Math.round(queueLostRaw), Math.round(actualSales * 0.20));

  // Anomaly Impact: each HIGH anomaly costs ~2% of revenue (not a flat ₹10,200!)
  const highAnomalies = data.anomalies?.filter(a=>a.severity==="high").length || 0;
  const anomalyLost = Math.min(
    Math.round(highAnomalies * actualSales * 0.02),
    Math.round(actualSales * 0.25)   // cap: anomalies can't exceed 25% of sales
  );

  // Low Dwell Time: if avg dwell < 90s, estimate 5% of revenue lost per 30s shortfall
  const dwellTarget = 90;
  const dwellShortfall = Math.max(0, dwellTarget - (data.avgDwell||90));
  const dwellLost = Math.round((dwellShortfall / dwellTarget) * actualSales * 0.05);

  // Conversion Gap: gap between actual conv% and a 18% target, capped at 15% of revenue
  const convGap = Math.max(0, 0.18 - convRate);
  const convLost = Math.min(
    Math.round(convGap * data.total * avgBasket * 0.5),  // 0.5 dampener: not every non-buyer is "lost"
    Math.round(actualSales * 0.15)
  );

  const total      = queueLost + anomalyLost + dwellLost + convLost;
  const recoverable = Math.round(total * 0.60);

  return { actualSales, queueLost, anomalyLost, dwellLost, convLost, total, recoverable, avgBasket,
    breakdown: [
      { label:"Queue & Understaffing", value:queueLost,   icon:"⏱️", color:"#f72585", tip:"Open extra checkout lanes during peak hours" },
      { label:"Anomaly Impact",        value:anomalyLost, icon:"🚨", color:"#f4a261", tip:"Address high-severity anomalies promptly" },
      { label:"Low Dwell Time",        value:dwellLost,   icon:"🗺️", color:"#7209b7", tip:"Add engaging displays in low-traffic zones" },
      { label:"Conversion Gap",        value:convLost,    icon:"🛒", color:"#4cc9f0", tip:"Improve product visibility and signage" },
    ],
  };
}

// ─── Basket Size ──────────────────────────────────────────────────────────────
export function calculateBasketSize(data) {
  const convRate   = (data.funnelData?.[data.funnelData.length-1]?.pct||14) / 100;
  const buyers     = Math.round(data.total * convRate);
  const baseBasket = 650;
  const dwellBonus = Math.round((data.avgDwell / 60) * 45);
  const zoneBonus  = Math.round(data.zones?.reduce((s,z)=>s+z.interactions,0) / 10) || 0;
  const queuePenalty = Math.round(Math.max(0, data.queueAvg - 3) * 30);
  const estimated  = baseBasket + dwellBonus + zoneBonus - queuePenalty;
  const segments   = [
    { label:"Low Spenders (0–₹500)",     pct:22, color:"#4cc9f0", avg:320  },
    { label:"Mid Spenders (₹500–₹1000)", pct:45, color:"#00f5d4", avg:720  },
    { label:"High Spenders (₹1000+)",    pct:33, color:"#f4a261", avg:1850 },
  ];
  const weeklyTrend = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(day => ({
    day, basket: Math.floor(estimated * (0.85 + Math.random()*0.3)),
    buyers: Math.floor(buyers/7 * (0.7 + Math.random()*0.6)),
  }));
  return { estimated, buyers, baseBasket, dwellBonus, zoneBonus, queuePenalty, segments, weeklyTrend,
    totalRevenue: Math.round(estimated * buyers),
    potential:    Math.round((estimated + 150) * buyers),
  };
}

// ─── Daily AI Summary ─────────────────────────────────────────────────────────
export function generateDailySummary(data, storeName = "your store") {
  const sat     = data.satisfaction;
  // Use pre-computed values if available (avoids re-randomising on every call)
  const basket  = data.basketSize  || calculateBasketSize(data);
  const lost    = data.lostSales   || calculateLostSales(data);
  const bestZ   = data.zones?.reduce((a,b) => a.interactions>b.interactions?a:b);
  const worstZ  = data.zones?.reduce((a,b) => a.interactions<b.interactions?a:b);
  const topGap  = [...(data.staffing||[])].sort((a,b)=>b.gap-a.gap)[0];
  const convPct = data.funnelData?.[data.funnelData.length-1]?.pct;
  const highAnomaly = data.anomalies?.find(a=>a.severity==="high");
  const date    = new Date().toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"long"});

  return {
    date,
    headline: sat?.overall >= 75
      ? `Strong day at ${storeName} — ${data.total} visitors, satisfaction at ${sat?.overall}/100`
      : `Mixed performance at ${storeName} today — ${data.total} visitors but satisfaction at ${sat?.overall}/100 needs attention`,
    paragraphs: [
      `Today ${storeName} welcomed ${data.total} customers with peak traffic at ${data.peakHour}. Average dwell time was ${data.avgDwell} seconds and ${convPct}% of visitors made a purchase, generating an estimated ₹${basket.totalRevenue.toLocaleString()} in revenue with an average basket size of ₹${basket.estimated}.`,
      `${bestZ?.name} was your best performing zone with ${bestZ?.interactions} customer interactions, while ${worstZ?.name} remains underutilised with only ${worstZ?.interactions}. ${data.queueAvg > 5 ? `Queue lengths averaged ${data.queueAvg} people — above the comfortable threshold.` : `Queue management was good, averaging just ${data.queueAvg} people.`}`,
      highAnomaly
        ? `⚠️ A high-severity ${highAnomaly.type} anomaly was flagged in ${highAnomaly.zone} at ${highAnomaly.time}. This is estimated to have cost ₹${lost.anomalyLost.toLocaleString()} in lost revenue and should be reviewed.`
        : `No high-severity anomalies were detected today — the store operated safely throughout.`,
      `Estimated lost sales today: ₹${lost.total.toLocaleString()}, of which ₹${lost.recoverable.toLocaleString()} is recoverable. ${topGap ? `Biggest staffing gap at ${topGap.hour} — add ${topGap.gap} more staff to recover an estimated ₹${Math.round(topGap.gap*350).toLocaleString()}.` : "Staffing levels were well-balanced across most hours."}`,
    ],
    actions: [
      topGap    && { icon:"👥", text:`Schedule ${topGap.gap} extra staff at ${topGap.hour}`,         impact:`Recover ₹${Math.round(topGap.gap*350).toLocaleString()}` },
      worstZ    && { icon:"🗺️", text:`Move a high-demand product to ${worstZ.name}`,                 impact:"+8–12% zone traffic" },
      highAnomaly && { icon:"🎥", text:`Review CCTV for ${highAnomaly.type} in ${highAnomaly.zone}`,  impact:"Safety & comfort" },
      convPct<16 && { icon:"🛒", text:"Add pricing labels & end-cap promotions",                      impact:`+2–4% conversion` },
    ].filter(Boolean),
    score: sat?.overall || 70,
    scoreLabel: sat?.label || "Good",
    scoreColor: sat?.color || "#00f5d4",
  };
}

// ─── Master Data Generator ────────────────────────────────────────────────────
// videoMeta: { durationSec, fileSizeMB, maxConcurrent, avgConcurrent }
// realUniqueOverride: confirmed unique count from real video tracker (most accurate)
export function generateMockData(filename, videoMeta = null, realUniqueOverride = null) {
  let totalVisitors, avgDwellSec, avgQueue, peakConcurrent;

  if (videoMeta) {
    const { durationSec = 60, fileSizeMB = 10, maxConcurrent = 5, avgConcurrent = 3 } = videoMeta;
    const realConcurrent    = Math.max(1, Math.round(maxConcurrent / 8));
    const realAvgConcurrent = Math.max(0.5, avgConcurrent / 8);
    const avgDwellEstimate  = Math.min(durationSec * 0.7, 90 + Math.random() * 60);
    avgDwellSec  = Math.max(20, Math.round(avgDwellEstimate));
    const turnover   = Math.max(1.0, durationSec / avgDwellEstimate);
    let rawVisitors  = Math.round(realConcurrent * turnover * (0.85 + Math.random() * 0.3));
    const maxPlausible = Math.max(realConcurrent, Math.round(durationSec / 18));
    totalVisitors    = Math.min(rawVisitors, maxPlausible);
    totalVisitors    = Math.max(1, totalVisitors);

    // ── Real tracker count overrides mock estimate ───────────────────────────
    if (realUniqueOverride && realUniqueOverride > 0) {
      totalVisitors = realUniqueOverride;
    }

    avgQueue       = parseFloat(Math.max(0.1, realAvgConcurrent * 0.15 + Math.random() * 0.3).toFixed(1));
    peakConcurrent = realConcurrent;
  } else {
    // No video metadata — use small realistic defaults
    totalVisitors  = Math.floor(8 + Math.random() * 20);    // 8–28
    avgDwellSec    = Math.floor(45 + Math.random() * 90);   // 45–135s
    avgQueue        = parseFloat((0.5 + Math.random() * 2).toFixed(1));
    peakConcurrent = Math.floor(2 + Math.random() * 5);
  }

  // ── Hourly distribution — shape the curve around a realistic peak ──────────
  // Spread total visitors across 12 hours with a gaussian-ish peak
  const peakHourIdx = Math.floor(2 + Math.random() * 8); // peak between 10:00–16:00
  const hours = Array.from({ length:12 }, (_,i) => {
    const dist    = Math.abs(i - peakHourIdx);
    const weight  = Math.exp(-dist * dist / 8);                   // gaussian decay
    const noise   = 0.7 + Math.random() * 0.6;
    const visitors = Math.max(0, Math.round((totalVisitors / 12) * weight * 2.5 * noise));
    const queue   = Math.max(0, Math.round(avgQueue * weight * noise));
    return { hour:`${8+i}:00`, visitors, queue };
  });

  // ── Zones — scale interactions to total visitors, dwell to avgDwellSec ─────
  const zones = ZONE_NAMES.map((name, i) => {
    const zoneShare   = [0.25, 0.30, 0.20, 0.15, 0.10][i]; // % of traffic per zone
    const interactions = Math.max(1, Math.round(totalVisitors * zoneShare * (0.6 + Math.random() * 0.8)));
    const dwell       = Math.max(5,  Math.round(avgDwellSec  * zoneShare * (0.8 + Math.random() * 0.6)));
    return { name, color: ZONE_COLORS[i], dwell, interactions };
  });

  const peakIdx   = hours.reduce((b,h,i) => h.visitors > hours[b].visitors ? i : b, 0);
  const funnelData = generateFunnelDataScaled(totalVisitors);
  const anomalies  = generateAnomalies();
  const staffing   = generateStaffingData(hours);

  const base = {
    hours, zones, funnelData, anomalies, staffing,
    total:    totalVisitors,
    avgDwell: avgDwellSec,
    peakHour: hours[peakIdx].hour,
    queueAvg: avgQueue,
    peakConcurrent,
    videoMeta: videoMeta || null,
    journeyPaths:  generateJourneyPaths(Math.min(totalVisitors, 8)),
    weeklyData:    generateWeeklyData(),
    monthlyData:   generateMonthlyData(),
    planogram:     generatePlanogramData(),
    heatmapFrames: generateHeatmapFrames(12, zones, totalVisitors), // zones + visitor count seeds unique playback per video
  };
  base.satisfaction = calculateSatisfaction(base);
  base.lostSales    = calculateLostSales(base);
  base.basketSize   = calculateBasketSize(base);
  // Generate theft / suspicious behavior analysis
  const theftData      = generateTheftData(videoMeta, totalVisitors);
  base.theftData       = theftData;
  base.incidentLog     = buildIncidentLog(theftData);
  // dailySummary must be last — it uses all the computed fields above
  base.dailySummary    = generateDailySummary(base);
  return base;
}