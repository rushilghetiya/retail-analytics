// ─── Simulated AI Q&A ─────────────────────────────────────────────────────────
export async function askAI(question, data) {
  await new Promise(r => setTimeout(r, 700 + Math.random() * 500));
  const q         = question.toLowerCase();
  const bestZone  = data.zones?.reduce((a,b) => a.interactions>b.interactions?a:b);
  const worstZone = data.zones?.reduce((a,b) => a.interactions<b.interactions?a:b);
  const topGap    = [...(data.staffing||[])].sort((a,b)=>b.gap-a.gap)[0];
  const under     = data.staffing?.filter(s=>s.gap>0) || [];
  const convPct   = data.funnelData?.[data.funnelData.length-1]?.pct;
  const sat       = data.satisfaction;
  const lost      = data.lostSales;
  const basket    = data.basketSize;

  if (q.includes("peak") || q.includes("busy") || q.includes("traffic"))
    return `Your busiest hour is ${data.peakHour} with the highest foot traffic today. I recommend scheduling ${topGap?.recommended||4} staff from ${topGap?.hour||data.peakHour} onward. Stock shelves and open all checkout lanes 30 minutes before that window.`;

  if (q.includes("queue") || q.includes("wait") || q.includes("checkout"))
    return `Average queue length is ${data.queueAvg} people. ${data.queueAvg>5?`Above the comfort threshold of 4 — an extra lane during ${data.peakHour} could cut waits by 40%`:`Healthy range — keep monitoring during ${data.peakHour}`}. Queue issues are estimated to have cost ₹${lost?.queueLost?.toLocaleString()||0} today.`;

  if (q.includes("satisfaction") || q.includes("happy") || q.includes("experience"))
    return `Satisfaction is ${sat?.overall}/100 (${sat?.label}), ${sat?.stars} stars. ${sat?.tips?.[0]||"Reduce checkout wait times."} A 10-point improvement typically drives 7–12% more repeat visits.`;

  if (q.includes("zone") || q.includes("aisle") || q.includes("area"))
    return `Best zone: ${bestZone?.name} — ${bestZone?.interactions} interactions, ${bestZone?.dwell}s avg dwell. Weakest: ${worstZone?.name} — only ${worstZone?.interactions} interactions. Moving a high-demand product to ${worstZone?.name} could boost its traffic by 20–30%.`;

  if (q.includes("staff") || q.includes("employ") || q.includes("schedule"))
    return `${under.length} hours are understaffed. Biggest gap: ${topGap?.hour||"peak"} — ${topGap?.current||2} staff vs ${topGap?.recommended||4} needed. Fixing this could reduce waits and lift satisfaction by 8–12 points.`;

  if (q.includes("conversion") || q.includes("purchase") || q.includes("buy"))
    return `Conversion rate is ${convPct}%. ${convPct<15?`Below the ~18% retail average. Biggest drop-off at "Dwell 10s+" — better signage in ${worstZone?.name} could recover 3–5%.`:`Above average — product placement is working. Focus on shelf availability.`}`;

  if (q.includes("lost") || q.includes("missing") || q.includes("recover"))
    return `Estimated lost sales today: ₹${lost?.total?.toLocaleString()}. Of that, ₹${lost?.recoverable?.toLocaleString()} is recoverable. Biggest cause: ${lost?.breakdown?.[0]?.label} (₹${lost?.breakdown?.[0]?.value?.toLocaleString()}). ${lost?.breakdown?.[0]?.tip}.`;

  if (q.includes("basket") || q.includes("spend") || q.includes("average order"))
    return `Estimated average basket size is ₹${basket?.estimated}. Dwell time adds ₹${basket?.dwellBonus} per customer; queue issues subtract ₹${basket?.queuePenalty}. ${basket?.segments?.[2]?.pct}% of shoppers are high-spenders (₹1000+) — targeting them with premium placements could grow revenue by ₹${Math.round(basket?.potential - basket?.totalRevenue).toLocaleString()}.`;

  if (q.includes("anomal") || q.includes("alert") || q.includes("issue"))
    return `${data.anomalies?.length} anomalies today. Most critical: ${data.anomalies?.[0]?.type} in ${data.anomalies?.[0]?.zone} at ${data.anomalies?.[0]?.time} — estimated cost ₹${lost?.anomalyLost?.toLocaleString()||0}. ${data.anomalies?.filter(a=>a.severity==="high").length>0?"Review CCTV immediately.":"No high-severity incidents — store running safely."}`;

  if (q.includes("revenue") || q.includes("money") || q.includes("earn"))
    return `Today's estimated revenue: ₹${basket?.totalRevenue?.toLocaleString()} from ${basket?.buyers} purchases at ₹${basket?.estimated} avg basket. Potential with optimisations: ₹${basket?.potential?.toLocaleString()} — a ₹${Math.round(basket?.potential-basket?.totalRevenue).toLocaleString()} uplift opportunity.`;

  if (q.includes("summary") || q.includes("overview") || q.includes("today"))
    return `${data.dailySummary?.headline}. ${data.dailySummary?.paragraphs?.[0]}`;

  if (q.includes("improve") || q.includes("recommend") || q.includes("what should"))
    return `Top 3 actions: 1) Add ${topGap?.gap||2} staff at ${topGap?.hour||data.peakHour} → recover ₹${Math.round((topGap?.gap||2)*350).toLocaleString()}. 2) Move ${data.planogram?.[0]?.name} to ${data.planogram?.[0]?.recommended} → ${data.planogram?.[0]?.lift} lift. 3) ${sat?.tips?.[0]||"Monitor queue lengths during peak hours"}.`;

  return `Store snapshot: ${data.total} visitors, peak at ${data.peakHour}, satisfaction ${sat?.overall}/100 (${sat?.label}), conversion ${convPct}%, est. revenue ₹${basket?.totalRevenue?.toLocaleString()}, lost sales ₹${lost?.total?.toLocaleString()}. Ask me about peak hours, queues, zones, staffing, conversion, lost sales, basket size, or revenue.`;
}
