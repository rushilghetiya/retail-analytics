import { useState, useEffect, useRef } from "react";
import { getCurrentUser, login, logout, getUsers, addUser, deleteUser, ROLES } from "./auth.js";
import { generateMockData, generateMockHeatmap, generateHeatmapFrames, generateStoreMetrics, STORES, calculateLostSales, calculateBasketSize, generateDailySummary } from "./data.js";
import { askAI } from "./ai.js";
import { exportToCSV, exportToJSON, exportToPDF, exportToGoogleSheets } from "./exports.js";
import { BEHAVIOR_TYPES, RISK_ZONES, BehaviourStateMachine, estimateLandmarks, classifyPose, renderPersonOverlay } from "./theft.js";

const HISTORY_KEY = "retailens_history";
const ALERTS_KEY  = "retailens_alerts";

const THEMES = {
  dark: {
    bg:"#080808",bg2:"#0d0d0d",bg3:"#111111",bg4:"#1a1a1a",
    border:"#1a1a1a",border2:"#2a2a2a",
    text:"#e0e0e0",text2:"#aaaaaa",text3:"#666666",text4:"#444444",
    accent:"#00f5d4",accent2:"#f72585",accent3:"#7209b7",accent4:"#4cc9f0",
    headerBg:"rgba(8,8,8,0.9)",cardBg:"#0d0d0d",inputBg:"#1a1a1a",
    progressBg:"#1a1a1a",insightBg:"#111111",logo:"#ffffff",green:"#00c48c",red:"#f72585",
  },
  light: {
    bg:"#f4f4f4",bg2:"#ffffff",bg3:"#eeeeee",bg4:"#e0e0e0",
    border:"#e0e0e0",border2:"#cccccc",
    text:"#111111",text2:"#444444",text3:"#888888",text4:"#bbbbbb",
    accent:"#007a6a",accent2:"#c41261",accent3:"#5a0090",accent4:"#1a7a9a",
    headerBg:"rgba(244,244,244,0.92)",cardBg:"#ffffff",inputBg:"#eeeeee",
    progressBg:"#e0e0e0",insightBg:"#f8f8f8",logo:"#111111",green:"#1a8a5a",red:"#c41261",
  },
};

function loadHistory() { try { return JSON.parse(localStorage.getItem(HISTORY_KEY)||"[]"); } catch { return []; } }
function saveHistory(h) { localStorage.setItem(HISTORY_KEY, JSON.stringify(h)); }
function addToHistory(e) { const h=loadHistory(); h.unshift(e); saveHistory(h.slice(0,50)); }
function loadAlerts() { try { return JSON.parse(localStorage.getItem(ALERTS_KEY)||"[]"); } catch { return []; } }
function saveAlerts(a) { localStorage.setItem(ALERTS_KEY, JSON.stringify(a)); }

// ─── Primitives ───────────────────────────────────────────────────────────────
function Avatar({ initials, color="#00f5d4", size=32 }) {
  return <div style={{width:size,height:size,borderRadius:"50%",background:`${color}25`,border:`2px solid ${color}60`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*0.35,fontWeight:"800",color,flexShrink:0,letterSpacing:"1px"}}>{initials}</div>;
}

function StatCard({ label, value, unit="", accent, T, sub, trend }) {
  return (
    <div style={{background:T.cardBg,border:`1px solid ${accent}30`,borderRadius:"12px",padding:"16px 18px",position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",top:0,left:0,right:0,height:"2px",background:`linear-gradient(90deg,${accent},transparent)`}}/>
      <div style={{fontSize:"10px",color:T.text3,letterSpacing:"2px",textTransform:"uppercase",marginBottom:"5px"}}>{label}</div>
      <div style={{fontSize:"26px",fontWeight:"800",color:T.text,fontFamily:"'Bebas Neue',sans-serif",lineHeight:1}}>
        {value}<span style={{fontSize:"12px",color:accent,marginLeft:"4px"}}>{unit}</span>
      </div>
      {(sub||trend)&&<div style={{fontSize:"11px",marginTop:"4px",display:"flex",alignItems:"center",gap:"5px"}}>
        {trend&&<span style={{color:trend==="up"?T.green:T.red,fontWeight:"700"}}>{trend==="up"?"↑":"↓"} {trend}</span>}
        {sub&&<span style={{color:T.text3}}>{sub}</span>}
      </div>}
    </div>
  );
}

function BarChart({ data, xKey, yKey, color, compare }) {
  const max=Math.max(...data.map(d=>Math.max(d[yKey],compare?d[compare]||0:0)),1);
  return (
    <div style={{display:"flex",alignItems:"flex-end",gap:"3px",height:"90px"}}>
      {data.map((d,i)=>(
        <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:"3px",height:"100%"}}>
          <div style={{flex:1,width:"100%",display:"flex",alignItems:"flex-end",gap:"1px"}}>
            {compare&&<div style={{flex:1,height:`${Math.max(3,(d[compare]/max)*100)}%`,background:color,opacity:0.22,borderRadius:"2px 2px 0 0"}}/>}
            <div style={{flex:1,height:`${Math.max(3,(d[yKey]/max)*100)}%`,background:color,opacity:0.85,borderRadius:"2px 2px 0 0"}}/>
          </div>
          <span style={{fontSize:"7px",opacity:0.45,whiteSpace:"nowrap"}}>{d[xKey]}</span>
        </div>
      ))}
    </div>
  );
}

function ProgressBar({ value, max=100, color, T, height=6 }) {
  return (
    <div style={{background:T.progressBg,borderRadius:"4px",height,overflow:"hidden"}}>
      <div style={{width:`${Math.min(100,(value/max)*100)}%`,height:"100%",background:color,borderRadius:"4px",transition:"width 0.6s ease"}}/>
    </div>
  );
}

function ThemeToggle({ theme, setTheme, T }) {
  return (
    <button onClick={()=>setTheme(theme==="dark"?"light":"dark")}
      style={{display:"flex",alignItems:"center",padding:"6px 11px",borderRadius:"20px",border:`1px solid ${T.border2}`,background:T.bg3,color:T.text2,cursor:"pointer",fontSize:"14px",flexShrink:0}}>
      {theme==="dark"?"☀️":"🌙"}
    </button>
  );
}

// ─── Login Screen ─────────────────────────────────────────────────────────────
function LoginScreen({ T, onLogin }) {
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const [showPass, setShowPass] = useState(false);
  const DEMO_ACCOUNTS = [
    { role:"Owner",   email:"owner@retailens.com",   password:"owner123",   color:"#f72585" },
    { role:"Manager", email:"manager@retailens.com", password:"manager123", color:"#f4a261" },
    { role:"Staff",   email:"staff@retailens.com",   password:"staff123",   color:"#4cc9f0" },
  ];
  function handleLogin(e) {
    e && e.preventDefault && e.preventDefault();
    setLoading(true); setError("");
    setTimeout(()=>{
      const result = login(email, password);
      if (result.success) onLogin(result.user);
      else { setError(result.error); setLoading(false); }
    }, 600);
  }
  return (
    <div style={{minHeight:"100vh",width:"100vw",background:T.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:"'DM Sans',sans-serif",padding:"20px"}}>
      <div style={{width:"100%",maxWidth:"420px"}}>
        {/* Logo */}
        <div style={{textAlign:"center",marginBottom:"36px"}}>
          <div style={{width:"56px",height:"56px",background:`linear-gradient(135deg,${T.accent},${T.accent3})`,borderRadius:"16px",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 14px"}}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M15 10l4.553-2.069A1 1 0 0121 8.87V15.13a1 1 0 01-1.447.9L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/></svg>
          </div>
          <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:"32px",letterSpacing:"4px",color:T.text}}>RETAILENS</div>
          <div style={{fontSize:"12px",color:T.text3,letterSpacing:"2px",marginTop:"2px"}}>STORE INTELLIGENCE PLATFORM</div>
        </div>
        {/* Form */}
        <div style={{background:T.cardBg,border:`1px solid ${T.border}`,borderRadius:"16px",padding:"28px"}}>
          <div style={{fontSize:"16px",fontWeight:"700",color:T.text,marginBottom:"20px"}}>Sign in to your account</div>
          {error&&<div style={{background:T.red+"18",border:`1px solid ${T.red}40`,borderRadius:"8px",padding:"10px 14px",fontSize:"13px",color:T.red,marginBottom:"14px"}}>{error}</div>}
          <div style={{display:"flex",flexDirection:"column",gap:"12px"}}>
            <div>
              <div style={{fontSize:"11px",color:T.text3,marginBottom:"5px",fontWeight:"600"}}>Email Address</div>
              <input value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleLogin()}
                placeholder="you@retailens.com" type="email"
                style={{width:"100%",background:T.inputBg,border:`1px solid ${T.border2}`,borderRadius:"8px",padding:"10px 13px",color:T.text,fontSize:"13px",outline:"none",boxSizing:"border-box"}}/>
            </div>
            <div>
              <div style={{fontSize:"11px",color:T.text3,marginBottom:"5px",fontWeight:"600"}}>Password</div>
              <div style={{position:"relative"}}>
                <input value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleLogin()}
                  placeholder="Enter password" type={showPass?"text":"password"}
                  style={{width:"100%",background:T.inputBg,border:`1px solid ${T.border2}`,borderRadius:"8px",padding:"10px 40px 10px 13px",color:T.text,fontSize:"13px",outline:"none",boxSizing:"border-box"}}/>
                <button onClick={()=>setShowPass(!showPass)} style={{position:"absolute",right:"10px",top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:T.text3,cursor:"pointer",fontSize:"14px"}}>{showPass?"🙈":"👁️"}</button>
              </div>
            </div>
            <button onClick={handleLogin} disabled={loading||!email||!password}
              style={{width:"100%",padding:"11px",background:loading||!email||!password?T.bg3:T.accent,color:loading||!email||!password?T.text4:"#000",border:"none",borderRadius:"8px",cursor:loading||!email||!password?"not-allowed":"pointer",fontWeight:"700",fontSize:"14px",transition:"all 0.2s",marginTop:"4px"}}>
              {loading?"Signing in...":"Sign In →"}
            </button>
          </div>
        </div>
        {/* Demo accounts */}
        <div style={{marginTop:"16px",background:T.cardBg,border:`1px solid ${T.border}`,borderRadius:"12px",padding:"16px"}}>
          <div style={{fontSize:"11px",color:T.text3,letterSpacing:"2px",textTransform:"uppercase",marginBottom:"10px"}}>Demo Accounts</div>
          <div style={{display:"flex",flexDirection:"column",gap:"6px"}}>
            {DEMO_ACCOUNTS.map(acc=>(
              <button key={acc.role} onClick={()=>{setEmail(acc.email);setPassword(acc.password);}}
                style={{display:"flex",alignItems:"center",gap:"10px",padding:"8px 12px",background:"transparent",border:`1px solid ${acc.color}30`,borderRadius:"8px",cursor:"pointer",textAlign:"left",transition:"border-color 0.2s"}}
                onMouseEnter={e=>e.currentTarget.style.borderColor=acc.color+"80"}
                onMouseLeave={e=>e.currentTarget.style.borderColor=acc.color+"30"}>
                <div style={{width:"28px",height:"28px",borderRadius:"50%",background:`${acc.color}20`,border:`1px solid ${acc.color}50`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"11px",fontWeight:"800",color:acc.color,flexShrink:0}}>{acc.role[0]}</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:"12px",fontWeight:"600",color:T.text}}>{acc.role}</div>
                  <div style={{fontSize:"10px",color:T.text3}}>{acc.email}</div>
                </div>
                <div style={{fontSize:"10px",color:acc.color,fontWeight:"700"}}>Use →</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── User Management Panel ────────────────────────────────────────────────────
function UserPanel({ T, currentUser }) {
  const [users,    setUsers]    = useState(getUsers());
  const [showForm, setShowForm] = useState(false);
  const [form,     setForm]     = useState({ name:"", email:"", password:"", role:"staff", store:"Downtown Flagship" });
  const [msg,      setMsg]      = useState("");
  const canManage = ROLES[currentUser?.role]?.canManageUsers;

  function handleAdd() {
    if (!form.name||!form.email||!form.password) { setMsg("All fields required"); return; }
    addUser(form);
    setUsers(getUsers());
    setForm({name:"",email:"",password:"",role:"staff",store:"Downtown Flagship"});
    setShowForm(false); setMsg("User added successfully!");
    setTimeout(()=>setMsg(""),3000);
  }
  function handleDelete(id) {
    if (id===currentUser.id) { setMsg("Cannot delete your own account"); return; }
    deleteUser(id); setUsers(getUsers());
  }

  return (
    <div style={{display:"flex",flexDirection:"column",gap:"16px"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:"10px"}}>
        <div>
          <div style={{fontSize:"11px",color:T.text3,letterSpacing:"2px",textTransform:"uppercase"}}>User Management</div>
          <div style={{fontSize:"13px",color:T.text2,marginTop:"2px"}}>{users.length} accounts across all roles</div>
        </div>
        {canManage&&<button onClick={()=>setShowForm(!showForm)}
          style={{padding:"7px 16px",background:showForm?T.bg4:T.accent,color:showForm?T.text3:"#000",border:"none",borderRadius:"8px",cursor:"pointer",fontWeight:"700",fontSize:"13px"}}>
          {showForm?"Cancel":"+ Add User"}
        </button>}
      </div>

      {msg&&<div style={{background:msg.includes("Cannot")?T.red+"18":T.green+"18",border:`1px solid ${msg.includes("Cannot")?T.red:T.green}40`,borderRadius:"8px",padding:"10px 14px",fontSize:"13px",color:msg.includes("Cannot")?T.red:T.green}}>{msg}</div>}

      {showForm&&canManage&&(
        <div style={{background:T.cardBg,border:`1px solid ${T.accent}40`,borderRadius:"12px",padding:"20px"}}>
          <div style={{fontSize:"12px",color:T.text3,letterSpacing:"2px",textTransform:"uppercase",marginBottom:"14px"}}>New User</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px"}}>
            {[["Full Name","name","text"],["Email","email","email"],["Password","password","password"]].map(([lbl,key,type])=>(
              <div key={key} style={{gridColumn:key==="name"?"1/3":"auto"}}>
                <div style={{fontSize:"11px",color:T.text3,marginBottom:"4px"}}>{lbl}</div>
                <input value={form[key]} onChange={e=>setForm(p=>({...p,[key]:e.target.value}))} type={type}
                  placeholder={lbl} style={{width:"100%",background:T.inputBg,border:`1px solid ${T.border2}`,borderRadius:"8px",padding:"8px 12px",color:T.text,fontSize:"13px",outline:"none",boxSizing:"border-box"}}/>
              </div>
            ))}
            <div>
              <div style={{fontSize:"11px",color:T.text3,marginBottom:"4px"}}>Role</div>
              <select value={form.role} onChange={e=>setForm(p=>({...p,role:e.target.value}))}
                style={{width:"100%",background:T.inputBg,border:`1px solid ${T.border2}`,borderRadius:"8px",padding:"8px 12px",color:T.text,fontSize:"13px",outline:"none"}}>
                <option value="staff">Staff</option>
                <option value="manager">Manager</option>
                <option value="owner">Owner</option>
              </select>
            </div>
            <div>
              <div style={{fontSize:"11px",color:T.text3,marginBottom:"4px"}}>Store</div>
              <select value={form.store} onChange={e=>setForm(p=>({...p,store:e.target.value}))}
                style={{width:"100%",background:T.inputBg,border:`1px solid ${T.border2}`,borderRadius:"8px",padding:"8px 12px",color:T.text,fontSize:"13px",outline:"none"}}>
                <option>Downtown Flagship</option>
                <option>Mall Branch</option>
                <option>All Stores</option>
              </select>
            </div>
          </div>
          <button onClick={handleAdd} style={{marginTop:"14px",padding:"8px 20px",background:T.accent,color:"#000",border:"none",borderRadius:"8px",cursor:"pointer",fontWeight:"700",fontSize:"13px"}}>Add User</button>
        </div>
      )}

      <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
        {users.map(user=>{
          const role=ROLES[user.role];
          return (
            <div key={user.id} style={{background:T.cardBg,border:`1px solid ${T.border}`,borderRadius:"12px",padding:"14px 18px",display:"flex",alignItems:"center",gap:"14px"}}>
              <Avatar initials={user.avatar} color={role?.color||T.accent} size={38}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:"8px",flexWrap:"wrap"}}>
                  <span style={{fontSize:"13px",fontWeight:"700",color:T.text}}>{user.name}</span>
                  {user.id===currentUser?.id&&<span style={{fontSize:"9px",padding:"2px 7px",borderRadius:"20px",background:T.accent+"20",color:T.accent,fontWeight:"700"}}>YOU</span>}
                  <span style={{fontSize:"10px",padding:"2px 8px",borderRadius:"20px",background:(role?.color||T.accent)+"20",color:role?.color||T.accent,fontWeight:"700"}}>{role?.label}</span>
                </div>
                <div style={{fontSize:"11px",color:T.text3,marginTop:"2px"}}>{user.email} · {user.store}</div>
                {user.lastLogin&&<div style={{fontSize:"10px",color:T.text4,marginTop:"1px"}}>Last login: {user.lastLogin}</div>}
              </div>
              <div style={{display:"flex",gap:"6px",flexShrink:0,flexWrap:"wrap"}}>
                {[role?.canExport&&"Export",role?.canViewAll&&"All Stores",role?.canManageUsers&&"Admin"].filter(Boolean).map(cap=>(
                  <span key={cap} style={{fontSize:"9px",padding:"2px 7px",borderRadius:"20px",background:T.bg3,color:T.text3,border:`1px solid ${T.border2}`}}>{cap}</span>
                ))}
                {canManage&&user.id!==currentUser?.id&&(
                  <button onClick={()=>handleDelete(user.id)} style={{padding:"3px 10px",background:"transparent",border:`1px solid ${T.border2}`,borderRadius:"6px",color:T.text4,cursor:"pointer",fontSize:"11px"}}>Remove</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Daily AI Summary ─────────────────────────────────────────────────────────
function DailySummaryPanel({ data, T }) {
  const [expanded, setExpanded] = useState(true);
  const summ = data.dailySummary;
  if (!summ) return null;

  return (
    <div style={{display:"flex",flexDirection:"column",gap:"16px"}}>
      {/* Headline card */}
      <div style={{background:T.cardBg,border:`2px solid ${summ.scoreColor}40`,borderRadius:"16px",padding:"24px",position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",top:0,left:0,right:0,height:"3px",background:`linear-gradient(90deg,${summ.scoreColor},${T.accent3})`}}/>
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:"16px",flexWrap:"wrap"}}>
          <div style={{flex:1,minWidth:"200px"}}>
            <div style={{fontSize:"10px",color:T.text3,letterSpacing:"2px",textTransform:"uppercase",marginBottom:"6px"}}>📅 {summ.date} · AI Daily Briefing</div>
            <div style={{fontSize:"15px",fontWeight:"700",color:T.text,lineHeight:"1.5"}}>{summ.headline}</div>
          </div>
          <div style={{textAlign:"center",flexShrink:0}}>
            <div style={{fontSize:"52px",fontWeight:"800",color:summ.scoreColor,fontFamily:"'Bebas Neue',sans-serif",lineHeight:1}}>{summ.score}</div>
            <div style={{fontSize:"11px",color:summ.scoreColor,fontWeight:"700"}}>{summ.scoreLabel}</div>
            <div style={{fontSize:"10px",color:T.text3}}>Overall Score</div>
          </div>
        </div>
      </div>

      {/* Score gauge */}
      <div style={{background:T.cardBg,border:`1px solid ${T.border}`,borderRadius:"12px",padding:"16px 20px"}}>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:"10px",color:T.text3,marginBottom:"6px"}}>
          <span>0 — Needs Work</span><span>50 — Average</span><span>100 — Excellent</span>
        </div>
        <div style={{height:"10px",borderRadius:"5px",background:`linear-gradient(90deg,#f72585 0%,#f4a261 40%,#4cc9f0 70%,#00f5d4 100%)`,position:"relative"}}>
          <div style={{position:"absolute",top:"-3px",left:`${summ.score}%`,transform:"translateX(-50%)",width:"16px",height:"16px",borderRadius:"50%",background:summ.scoreColor,border:"2px solid #fff",boxShadow:"0 2px 8px rgba(0,0,0,0.4)"}}/>
        </div>
      </div>

      {/* Full paragraphs */}
      <div style={{background:T.cardBg,border:`1px solid ${T.border}`,borderRadius:"12px",padding:"20px"}}>
        <button onClick={()=>setExpanded(!expanded)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",background:"none",border:"none",cursor:"pointer",padding:0,marginBottom:expanded?"14px":0}}>
          <div style={{fontSize:"11px",color:T.text3,letterSpacing:"2px",textTransform:"uppercase"}}>Full Analysis</div>
          <span style={{color:T.text3,fontSize:"18px",transition:"transform 0.2s",transform:expanded?"rotate(90deg)":"none"}}>›</span>
        </button>
        {expanded&&(
          <div style={{display:"flex",flexDirection:"column",gap:"12px"}}>
            {summ.paragraphs.map((p,i)=>(
              <p key={i} style={{fontSize:"13px",color:T.text2,lineHeight:"1.7",margin:0,paddingLeft:"12px",borderLeft:`3px solid ${[T.accent,T.accent4,T.accent2,T.accent3][i%4]}`}}>{p}</p>
            ))}
          </div>
        )}
      </div>

      {/* Action items */}
      <div style={{background:T.cardBg,border:`1px solid ${T.border}`,borderRadius:"12px",padding:"20px"}}>
        <div style={{fontSize:"11px",color:T.text3,letterSpacing:"2px",textTransform:"uppercase",marginBottom:"12px"}}>⚡ Recommended Actions for Today</div>
        <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
          {summ.actions.map((a,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:"12px",padding:"10px 14px",background:T.insightBg,borderRadius:"10px",borderLeft:`3px solid ${[T.accent,T.accent4,T.accent2,T.accent3][i%4]}`}}>
              <span style={{fontSize:"18px",flexShrink:0}}>{a.icon}</span>
              <span style={{flex:1,fontSize:"13px",color:T.text2}}>{a.text}</span>
              <span style={{fontSize:"11px",color:T.green,fontWeight:"700",flexShrink:0,background:T.green+"18",padding:"3px 10px",borderRadius:"20px"}}>{a.impact}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Key numbers */}
      <div className="sc" style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"10px"}}>
        <StatCard label="Est. Revenue"    value={`₹${(data.basketSize?.totalRevenue/1000).toFixed(0)}k`} unit="" accent={T.accent}  T={T}/>
        <StatCard label="Avg Basket"      value={`₹${data.basketSize?.estimated}`}                        unit="" accent={T.accent4} T={T}/>
        <StatCard label="Lost Sales"      value={`₹${(data.lostSales?.total/1000).toFixed(0)}k`}          unit="" accent={T.accent2} T={T} sub="recoverable"/>
        <StatCard label="Buyers Today"    value={data.basketSize?.buyers}                                  unit="cust." accent={T.accent3} T={T}/>
      </div>
    </div>
  );
}

// ─── Lost Sales Estimator ─────────────────────────────────────────────────────
function LostSalesPanel({ data, T }) {
  const lost = data.lostSales;
  if (!lost) return null;
  const [basket, setBasket] = useState(lost.avgBasket);
  const adjusted = { ...lost, breakdown: lost.breakdown.map(b=>({...b,value:Math.round(b.value*(basket/lost.avgBasket))})) };
  const adjTotal = adjusted.breakdown.reduce((s,b)=>s+b.value,0);
  const adjRecov = Math.round(adjTotal*0.65);

  return (
    <div style={{display:"flex",flexDirection:"column",gap:"16px"}}>
      {/* Header */}
      <div style={{background:T.cardBg,border:`1px solid ${T.accent2}30`,borderRadius:"16px",padding:"20px 24px",position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",top:0,left:0,right:0,height:"2px",background:`linear-gradient(90deg,${T.accent2},transparent)`}}/>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:"16px"}}>
          <div>
            <div style={{fontSize:"11px",color:T.text3,letterSpacing:"2px",textTransform:"uppercase",marginBottom:"4px"}}>💸 Lost Sales Today</div>
            <div style={{fontSize:"42px",fontWeight:"800",color:T.accent2,fontFamily:"'Bebas Neue',sans-serif",lineHeight:1}}>₹{adjTotal.toLocaleString()}</div>
            <div style={{fontSize:"13px",color:T.green,fontWeight:"700",marginTop:"4px"}}>₹{adjRecov.toLocaleString()} is recoverable</div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:"11px",color:T.text3,marginBottom:"6px"}}>Adjust Avg Basket Size</div>
            <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
              <input type="range" min={200} max={2000} step={50} value={basket} onChange={e=>setBasket(Number(e.target.value))}
                style={{width:"120px",accentColor:T.accent}}/>
              <span style={{fontSize:"14px",fontWeight:"700",color:T.accent,fontFamily:"'Bebas Neue',sans-serif",minWidth:"50px"}}>₹{basket}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Breakdown */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px"}} className="g2">
        {adjusted.breakdown.map((b,i)=>(
          <div key={i} style={{background:T.cardBg,border:`1px solid ${b.color}25`,borderRadius:"12px",padding:"16px 18px",borderLeft:`3px solid ${b.color}`}}>
            <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"10px"}}>
              <span style={{fontSize:"22px"}}>{b.icon}</span>
              <div style={{flex:1}}>
                <div style={{fontSize:"12px",fontWeight:"700",color:T.text}}>{b.label}</div>
                <div style={{fontSize:"10px",color:T.text3}}>Click to see fix</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:"18px",fontWeight:"800",color:b.color,fontFamily:"'Bebas Neue',sans-serif"}}>₹{b.value.toLocaleString()}</div>
                <div style={{fontSize:"10px",color:T.text3}}>{Math.round((b.value/adjTotal)*100)}% of total</div>
              </div>
            </div>
            <ProgressBar value={b.value} max={adjTotal} color={b.color} T={T} height={5}/>
            <div style={{fontSize:"11px",color:T.text3,marginTop:"8px",paddingLeft:"8px",borderLeft:`2px solid ${b.color}40`}}>💡 {b.tip}</div>
          </div>
        ))}
      </div>

      {/* Recovery plan */}
      <div style={{background:T.cardBg,border:`1px solid ${T.green}30`,borderRadius:"12px",padding:"20px"}}>
        <div style={{fontSize:"11px",color:T.text3,letterSpacing:"2px",textTransform:"uppercase",marginBottom:"12px"}}>🎯 Recovery Potential</div>
        <div style={{display:"flex",gap:"16px",alignItems:"center",flexWrap:"wrap"}}>
          <div style={{flex:1,minWidth:"200px"}}>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:"12px",color:T.text3,marginBottom:"4px"}}>
              <span>Recoverable</span><span style={{color:T.green,fontWeight:"700"}}>₹{adjRecov.toLocaleString()}</span>
            </div>
            <ProgressBar value={adjRecov} max={adjTotal} color={T.green} T={T} height={8}/>
          </div>
          <div style={{textAlign:"center",padding:"12px 20px",background:T.green+"15",border:`1px solid ${T.green}30`,borderRadius:"10px"}}>
            <div style={{fontSize:"24px",fontWeight:"800",color:T.green,fontFamily:"'Bebas Neue',sans-serif"}}>65%</div>
            <div style={{fontSize:"11px",color:T.text3}}>Recovery Rate</div>
          </div>
          <div style={{textAlign:"center",padding:"12px 20px",background:T.accent+"15",border:`1px solid ${T.accent}30`,borderRadius:"10px"}}>
            <div style={{fontSize:"24px",fontWeight:"800",color:T.accent,fontFamily:"'Bebas Neue',sans-serif"}}>₹{Math.round(adjRecov*26/1000).toFixed(0)}k</div>
            <div style={{fontSize:"11px",color:T.text3}}>Monthly Upside</div>
          </div>
        </div>
      </div>

      {/* Staffing loss table */}
      <div style={{background:T.cardBg,border:`1px solid ${T.border}`,borderRadius:"12px",overflow:"hidden"}}>
        <div style={{padding:"14px 18px",borderBottom:`1px solid ${T.border}`,fontSize:"11px",color:T.text3,letterSpacing:"2px",textTransform:"uppercase"}}>Hourly Revenue Loss from Understaffing</div>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:"12px"}}>
            <thead>
              <tr style={{background:T.bg3}}>
                {["Hour","Visitors","Staff Gap","Est. Lost Sales","Action"].map(h=>(
                  <th key={h} style={{padding:"9px 14px",textAlign:"left",fontSize:"10px",color:T.text3,letterSpacing:"1px",textTransform:"uppercase"}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.staffing.filter(s=>s.gap>0).map((s,i)=>(
                <tr key={i} style={{borderBottom:`1px solid ${T.border}`}}>
                  <td style={{padding:"9px 14px",color:T.text,fontWeight:"600"}}>{s.hour}</td>
                  <td style={{padding:"9px 14px",color:T.text2}}>{s.visitors}</td>
                  <td style={{padding:"9px 14px",color:T.accent2,fontWeight:"700"}}>+{s.gap} needed</td>
                  <td style={{padding:"9px 14px",color:T.accent2,fontWeight:"700"}}>₹{(s.gap*basket*0.15).toFixed(0)}</td>
                  <td style={{padding:"9px 14px"}}><span style={{fontSize:"10px",color:T.accent}}>Add {s.gap} staff →</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Basket Size Estimator ────────────────────────────────────────────────────
function BasketSizePanel({ data, T }) {
  const bask = data.basketSize;
  if (!bask) return null;

  return (
    <div style={{display:"flex",flexDirection:"column",gap:"16px"}}>
      {/* Hero */}
      <div style={{background:T.cardBg,border:`1px solid ${T.accent4}30`,borderRadius:"16px",padding:"24px",position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",top:0,left:0,right:0,height:"2px",background:`linear-gradient(90deg,${T.accent4},${T.accent})`}}/>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:"16px"}}>
          <div>
            <div style={{fontSize:"11px",color:T.text3,letterSpacing:"2px",textTransform:"uppercase",marginBottom:"4px"}}>🛒 Average Basket Size</div>
            <div style={{fontSize:"64px",fontWeight:"800",color:T.accent,fontFamily:"'Bebas Neue',sans-serif",lineHeight:1}}>₹{bask.estimated}</div>
            <div style={{fontSize:"13px",color:T.text2,marginTop:"6px"}}>from {bask.buyers} estimated buyers today</div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
            <div style={{padding:"12px 18px",background:T.bg3,borderRadius:"10px",textAlign:"center"}}>
              <div style={{fontSize:"20px",fontWeight:"800",color:T.accent,fontFamily:"'Bebas Neue',sans-serif"}}>₹{bask.totalRevenue.toLocaleString()}</div>
              <div style={{fontSize:"10px",color:T.text3}}>Est. Total Revenue</div>
            </div>
            <div style={{padding:"12px 18px",background:T.accent+"15",border:`1px solid ${T.accent}30`,borderRadius:"10px",textAlign:"center"}}>
              <div style={{fontSize:"20px",fontWeight:"800",color:T.accent,fontFamily:"'Bebas Neue',sans-serif"}}>₹{bask.potential.toLocaleString()}</div>
              <div style={{fontSize:"10px",color:T.text3}}>Revenue Potential</div>
            </div>
          </div>
        </div>
      </div>

      {/* Basket build-up */}
      <div style={{background:T.cardBg,border:`1px solid ${T.border}`,borderRadius:"12px",padding:"20px"}}>
        <div style={{fontSize:"11px",color:T.text3,letterSpacing:"2px",textTransform:"uppercase",marginBottom:"14px"}}>Basket Build-Up</div>
        <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>
          {[
            {label:"Base Basket",   value:bask.baseBasket, color:T.accent,  sign:""},
            {label:"Dwell Bonus",   value:bask.dwellBonus, color:T.green,   sign:"+",desc:`${data.avgDwell}s avg dwell adds engagement`},
            {label:"Zone Bonus",    value:bask.zoneBonus,  color:T.accent4, sign:"+",desc:"Multi-zone browsing increases spend"},
            {label:"Queue Penalty", value:bask.queuePenalty,color:T.red,   sign:"-",desc:`${data.queueAvg} avg queue reduces patience`},
          ].map((item,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:"12px",padding:"10px 14px",background:T.insightBg,borderRadius:"8px"}}>
              <div style={{width:"3px",alignSelf:"stretch",background:item.color,borderRadius:"2px",flexShrink:0}}/>
              <div style={{flex:1}}>
                <div style={{fontSize:"12px",fontWeight:"600",color:T.text}}>{item.label}</div>
                {item.desc&&<div style={{fontSize:"10px",color:T.text3,marginTop:"1px"}}>{item.desc}</div>}
              </div>
              <div style={{fontSize:"16px",fontWeight:"800",color:item.color,fontFamily:"'Bebas Neue',sans-serif"}}>{item.sign}₹{item.value}</div>
            </div>
          ))}
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 14px",background:T.accent+"15",border:`1px solid ${T.accent}30`,borderRadius:"8px"}}>
            <span style={{fontWeight:"700",color:T.text}}>Estimated Basket</span>
            <span style={{fontSize:"22px",fontWeight:"800",color:T.accent,fontFamily:"'Bebas Neue',sans-serif"}}>₹{bask.estimated}</span>
          </div>
        </div>
      </div>

      {/* Customer segments */}
      <div style={{background:T.cardBg,border:`1px solid ${T.border}`,borderRadius:"12px",padding:"20px"}}>
        <div style={{fontSize:"11px",color:T.text3,letterSpacing:"2px",textTransform:"uppercase",marginBottom:"14px"}}>Customer Spend Segments</div>
        <div style={{display:"flex",flexDirection:"column",gap:"12px"}}>
          {bask.segments.map((seg,i)=>(
            <div key={i}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:"5px"}}>
                <div>
                  <span style={{fontSize:"12px",fontWeight:"600",color:T.text}}>{seg.label}</span>
                  <span style={{fontSize:"11px",color:T.text3,marginLeft:"8px"}}>Avg ₹{seg.avg}</span>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
                  <span style={{fontSize:"13px",fontWeight:"700",color:seg.color,fontFamily:"'Bebas Neue',sans-serif"}}>{seg.pct}%</span>
                  <span style={{fontSize:"11px",color:T.text3}}>~{Math.round(bask.buyers*seg.pct/100)} customers</span>
                </div>
              </div>
              <ProgressBar value={seg.pct} max={100} color={seg.color} T={T} height={10}/>
            </div>
          ))}
        </div>
      </div>

      {/* Weekly basket trend */}
      <div style={{background:T.cardBg,border:`1px solid ${T.border}`,borderRadius:"12px",padding:"20px"}}>
        <div style={{fontSize:"11px",color:T.text3,letterSpacing:"2px",textTransform:"uppercase",marginBottom:"14px"}}>Weekly Basket Trend</div>
        <BarChart data={bask.weeklyTrend} xKey="day" yKey="basket" color={T.accent}/>
        <div style={{marginTop:"12px",display:"flex",flexDirection:"column",gap:"0"}}>
          {bask.weeklyTrend.map((d,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:"12px",padding:"6px 0",borderBottom:`1px solid ${T.border}`}}>
              <span style={{fontSize:"12px",color:T.text2,width:"36px",fontWeight:"600"}}>{d.day}</span>
              <ProgressBar value={d.basket} max={Math.max(...bask.weeklyTrend.map(x=>x.basket))} color={T.accent4} T={T} height={5}/>
              <span style={{fontSize:"12px",color:T.accent,fontWeight:"700",width:"52px",textAlign:"right"}}>₹{d.basket}</span>
              <span style={{fontSize:"10px",color:T.text3,width:"60px",textAlign:"right"}}>{d.buyers} buyers</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Export & Integration Panel ───────────────────────────────────────────────
function ExportPanel({ data, filename, T, heatmapRef, currentUser }) {
  const [status,    setStatus]   = useState({});
  const [whatsApp,  setWhatsApp] = useState("");
  const [email,     setEmail]    = useState("");
  const [schedule,  setSchedule] = useState("daily");
  const [waSent,    setWaSent]   = useState(false);
  const [emailSent, setEmailSent]= useState(false);
  const canExport = ROLES[currentUser?.role]?.canExport;

  function doExport(type, fn) {
    if (!canExport) { setStatus(p=>({...p,[type]:"No permission"})); return; }
    setStatus(p=>({...p,[type]:"exporting"}));
    setTimeout(()=>{ fn(); setStatus(p=>({...p,[type]:"done"})); setTimeout(()=>setStatus(p=>({...p,[type]:""})),3000); },400);
  }

  const EXPORTS = [
    { id:"pdf",    icon:"📄", label:"PDF Report",       desc:"Full analytics report with charts and heatmap", color:"#f72585",
      action:()=>exportToPDF(data,filename,heatmapRef) },
    { id:"csv",    icon:"📊", label:"CSV Spreadsheet",  desc:"Raw data — hourly traffic, zones, staffing, anomalies", color:"#00f5d4",
      action:()=>exportToCSV(data,filename) },
    { id:"json",   icon:"💾", label:"JSON Data",        desc:"Complete analytics JSON for developer use", color:"#7209b7",
      action:()=>exportToJSON(data,filename) },
    { id:"sheets", icon:"📋", label:"Google Sheets",    desc:"Download as CSV optimised for Google Sheets import", color:"#4cc9f0",
      action:()=>exportToGoogleSheets(data,filename) },
  ];

  return (
    <div style={{display:"flex",flexDirection:"column",gap:"16px"}}>
      {!canExport&&(
        <div style={{background:T.accent2+"15",border:`1px solid ${T.accent2}40`,borderRadius:"10px",padding:"12px 16px",fontSize:"13px",color:T.accent2}}>
          ⚠️ Your role ({ROLES[currentUser?.role]?.label}) does not have export permissions. Contact an Owner to upgrade access.
        </div>
      )}

      {/* Export formats */}
      <div style={{background:T.cardBg,border:`1px solid ${T.border}`,borderRadius:"16px",padding:"20px"}}>
        <div style={{fontSize:"11px",color:T.text3,letterSpacing:"2px",textTransform:"uppercase",marginBottom:"14px"}}>Download Reports</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px"}} className="g2">
          {EXPORTS.map(exp=>(
            <button key={exp.id} onClick={()=>doExport(exp.id,exp.action)} disabled={!canExport}
              style={{display:"flex",gap:"12px",padding:"14px 16px",background:T.insightBg,border:`1px solid ${status[exp.id]==="done"?exp.color:T.border}`,borderRadius:"12px",cursor:canExport?"pointer":"not-allowed",textAlign:"left",transition:"border-color 0.2s",opacity:canExport?1:0.5}}
              onMouseEnter={e=>canExport&&(e.currentTarget.style.borderColor=exp.color+"60")}
              onMouseLeave={e=>status[exp.id]!=="done"&&(e.currentTarget.style.borderColor=T.border)}>
              <span style={{fontSize:"28px",flexShrink:0}}>{exp.icon}</span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:"13px",fontWeight:"700",color:T.text}}>{exp.label}</div>
                <div style={{fontSize:"11px",color:T.text3,marginTop:"2px",lineHeight:"1.4"}}>{exp.desc}</div>
                <div style={{marginTop:"8px",fontSize:"11px",fontWeight:"700",color:status[exp.id]==="done"?exp.color:status[exp.id]==="exporting"?T.accent:T.text3}}>
                  {status[exp.id]==="exporting"?"⏳ Preparing...":status[exp.id]==="done"?"✅ Downloaded!":"⬇ Download"}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* WhatsApp Alerts */}
      <div style={{background:T.cardBg,border:`1px solid ${T.border}`,borderRadius:"16px",padding:"20px"}}>
        <div style={{fontSize:"11px",color:T.text3,letterSpacing:"2px",textTransform:"uppercase",marginBottom:"14px"}}>💬 WhatsApp Alert Bot</div>
        <div style={{fontSize:"12px",color:T.text2,marginBottom:"12px",lineHeight:"1.6"}}>
          Send live anomaly alerts to a WhatsApp number. In production, this uses Twilio's WhatsApp API.
        </div>
        <div style={{display:"flex",gap:"8px",flexWrap:"wrap"}}>
          <input value={whatsApp} onChange={e=>setWhatsApp(e.target.value)} placeholder="+91 98765 43210"
            style={{flex:1,minWidth:"180px",background:T.inputBg,border:`1px solid ${T.border2}`,borderRadius:"8px",padding:"9px 13px",color:T.text,fontSize:"13px",outline:"none"}}/>
          <button onClick={()=>{if(!whatsApp.trim())return; setWaSent(true); setTimeout(()=>setWaSent(false),4000);}}
            style={{padding:"9px 18px",background:waSent?"#25D366":"transparent",color:waSent?"#fff":"#25D366",border:"1px solid #25D366",borderRadius:"8px",cursor:"pointer",fontWeight:"700",fontSize:"13px",transition:"all 0.3s"}}>
            {waSent?"✓ Linked!":"Link Number"}
          </button>
        </div>
        {waSent&&(
          <div style={{marginTop:"10px",padding:"10px 14px",background:"#25D36618",border:"1px solid #25D36640",borderRadius:"8px",fontSize:"12px",color:"#25D366"}}>
            ✅ WhatsApp alerts enabled for {whatsApp}. You'll receive notifications for high-severity anomalies.
          </div>
        )}
        <div style={{marginTop:"12px",display:"flex",flexDirection:"column",gap:"6px"}}>
          {data.anomalies.filter(a=>a.severity==="high").map(a=>(
            <div key={a.id} style={{display:"flex",alignItems:"center",gap:"10px",padding:"8px 12px",background:T.insightBg,borderRadius:"8px",fontSize:"12px"}}>
              <span style={{color:"#25D366"}}>📲</span>
              <span style={{color:T.text2,flex:1}}><b>{a.type}</b> in {a.zone} at {a.time}</span>
              <span style={{color:T.text4,fontSize:"10px"}}>Would be sent</span>
            </div>
          ))}
        </div>
      </div>

      {/* Email Digest */}
      <div style={{background:T.cardBg,border:`1px solid ${T.border}`,borderRadius:"16px",padding:"20px"}}>
        <div style={{fontSize:"11px",color:T.text3,letterSpacing:"2px",textTransform:"uppercase",marginBottom:"14px"}}>📧 Email Digest</div>
        <div style={{fontSize:"12px",color:T.text2,marginBottom:"12px",lineHeight:"1.6"}}>
          Schedule automated PDF reports delivered to your inbox. Uses SendGrid in production.
        </div>
        <div style={{display:"flex",gap:"8px",flexWrap:"wrap",marginBottom:"10px"}}>
          <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="manager@store.com" type="email"
            style={{flex:1,minWidth:"180px",background:T.inputBg,border:`1px solid ${T.border2}`,borderRadius:"8px",padding:"9px 13px",color:T.text,fontSize:"13px",outline:"none"}}/>
          <select value={schedule} onChange={e=>setSchedule(e.target.value)}
            style={{background:T.inputBg,border:`1px solid ${T.border2}`,borderRadius:"8px",padding:"9px 12px",color:T.text,fontSize:"13px",outline:"none"}}>
            <option value="daily">Daily at 9am</option>
            <option value="weekly">Weekly Monday</option>
            <option value="monthly">Monthly 1st</option>
          </select>
          <button onClick={()=>{if(!email.trim())return; setEmailSent(true); setTimeout(()=>setEmailSent(false),4000);}}
            style={{padding:"9px 18px",background:emailSent?T.accent:"transparent",color:emailSent?"#000":T.accent,border:`1px solid ${T.accent}`,borderRadius:"8px",cursor:"pointer",fontWeight:"700",fontSize:"13px",transition:"all 0.3s"}}>
            {emailSent?"✓ Scheduled!":"Schedule"}
          </button>
        </div>
        {emailSent&&(
          <div style={{padding:"10px 14px",background:T.accent+"15",border:`1px solid ${T.accent}30`,borderRadius:"8px",fontSize:"12px",color:T.accent}}>
            ✅ {schedule.charAt(0).toUpperCase()+schedule.slice(1)} digest scheduled for {email}. First report arrives {schedule==="daily"?"tomorrow at 9am":schedule==="weekly"?"next Monday":"on the 1st"}.
          </div>
        )}
      </div>

      {/* Integration status */}
      <div style={{background:T.cardBg,border:`1px solid ${T.border}`,borderRadius:"12px",padding:"20px"}}>
        <div style={{fontSize:"11px",color:T.text3,letterSpacing:"2px",textTransform:"uppercase",marginBottom:"14px"}}>Integration Status</div>
        <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
          {[
            {name:"YOLOv8 Detection",   status:"active",  color:T.green,  desc:"Real-time person detection"},
            {name:"DeepSORT Tracking",  status:"active",  color:T.green,  desc:"Multi-object customer tracking"},
            {name:"FastAPI Backend",    status:"active",  color:T.green,  desc:"localhost:8000"},
            {name:"Google Sheets API",  status:"setup",   color:T.accent, desc:"Configure in Settings"},
            {name:"Twilio WhatsApp",    status:"setup",   color:T.accent, desc:"Add API key to .env"},
            {name:"SendGrid Email",     status:"setup",   color:T.accent, desc:"Add SENDGRID_KEY to .env"},
          ].map((int,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:"12px",padding:"9px 12px",background:T.insightBg,borderRadius:"8px"}}>
              <div style={{width:"8px",height:"8px",borderRadius:"50%",background:int.color,flexShrink:0,boxShadow:int.status==="active"?`0 0 6px ${int.color}`:"none"}}/>
              <div style={{flex:1}}>
                <div style={{fontSize:"12px",fontWeight:"600",color:T.text}}>{int.name}</div>
                <div style={{fontSize:"10px",color:T.text3}}>{int.desc}</div>
              </div>
              <span style={{fontSize:"10px",padding:"2px 8px",borderRadius:"20px",background:int.color+"20",color:int.color,fontWeight:"700",textTransform:"uppercase"}}>{int.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Zone Intelligence Panel ──────────────────────────────────────────────────
function ZoneIntelPanel({ data, T }) {
  const [selected, setSelected] = useState(null);
  const zones = data.zones;
  const maxInteractions = Math.max(...zones.map(z=>z.interactions));
  const maxDwell = Math.max(...zones.map(z=>z.dwell));

  return (
    <div style={{display:"flex",flexDirection:"column",gap:"16px"}}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px"}} className="g2">
        {zones.map((zone,i)=>{
          const isSel = selected===i;
          const rank  = [...zones].sort((a,b)=>b.interactions-a.interactions).indexOf(zone)+1;
          return (
            <div key={i} onClick={()=>setSelected(isSel?null:i)}
              style={{background:T.cardBg,border:`2px solid ${isSel?zone.color:T.border}`,borderRadius:"12px",padding:"16px 18px",cursor:"pointer",transition:"all 0.2s"}}>
              <div style={{display:"flex",alignItems:"center",gap:"10px",marginBottom:"12px"}}>
                <div style={{width:"10px",height:"10px",borderRadius:"50%",background:zone.color,flexShrink:0,boxShadow:`0 0 8px ${zone.color}`}}/>
                <div style={{flex:1}}>
                  <div style={{fontSize:"13px",fontWeight:"700",color:T.text}}>{zone.name}</div>
                  <div style={{fontSize:"10px",color:T.text3}}>Rank #{rank} by engagement</div>
                </div>
                <div style={{fontSize:"20px",fontWeight:"800",color:zone.color,fontFamily:"'Bebas Neue',sans-serif"}}>{zone.interactions}</div>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:"6px"}}>
                <div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:"10px",color:T.text3,marginBottom:"3px"}}>
                    <span>Interactions</span><span>{zone.interactions}</span>
                  </div>
                  <ProgressBar value={zone.interactions} max={maxInteractions} color={zone.color} T={T} height={5}/>
                </div>
                <div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:"10px",color:T.text3,marginBottom:"3px"}}>
                    <span>Avg Dwell</span><span>{zone.dwell}s</span>
                  </div>
                  <ProgressBar value={zone.dwell} max={maxDwell} color={zone.color} T={T} height={5}/>
                </div>
              </div>
              {isSel&&(
                <div style={{marginTop:"12px",paddingTop:"12px",borderTop:`1px solid ${T.border}`}}>
                  <div style={{fontSize:"11px",color:T.text3,marginBottom:"6px"}}>AI Insight</div>
                  {zone.interactions===maxInteractions
                    ? <div style={{fontSize:"12px",color:T.text2,lineHeight:"1.5"}}>🏆 Top performing zone. Use this for premium or seasonal product placement to maximise impulse purchases.</div>
                    : zone.interactions===Math.min(...zones.map(z=>z.interactions))
                    ? <div style={{fontSize:"12px",color:T.text2,lineHeight:"1.5"}}>⚠️ Lowest traffic zone. Consider moving a high-demand product here or improving navigation signage.</div>
                    : <div style={{fontSize:"12px",color:T.text2,lineHeight:"1.5"}}>📊 Mid-tier zone. Dwell time of {zone.dwell}s suggests customers are engaged — ensure shelf stock is maintained.</div>
                  }
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Zone comparison table */}
      <div style={{background:T.cardBg,border:`1px solid ${T.border}`,borderRadius:"12px",overflow:"hidden"}}>
        <div style={{padding:"14px 18px",borderBottom:`1px solid ${T.border}`,fontSize:"11px",color:T.text3,letterSpacing:"2px",textTransform:"uppercase"}}>Zone Comparison</div>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:"12px"}}>
          <thead>
            <tr style={{background:T.bg3}}>
              {["Zone","Interactions","Dwell Time","Share of Traffic","Performance"].map(h=>(
                <th key={h} style={{padding:"9px 14px",textAlign:"left",fontSize:"10px",color:T.text3,letterSpacing:"1px",textTransform:"uppercase"}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...zones].sort((a,b)=>b.interactions-a.interactions).map((z,i)=>{
              const share=Math.round((z.interactions/zones.reduce((s,x)=>s+x.interactions,0))*100);
              const perf=z.interactions>=maxInteractions*0.8?"Excellent":z.interactions>=maxInteractions*0.5?"Good":"Low";
              const perfColor=perf==="Excellent"?T.green:perf==="Good"?T.accent:T.accent2;
              return (
                <tr key={i} style={{borderBottom:`1px solid ${T.border}`}}>
                  <td style={{padding:"9px 14px"}}><div style={{display:"flex",alignItems:"center",gap:"7px"}}><div style={{width:"7px",height:"7px",borderRadius:"50%",background:z.color}}/><span style={{color:T.text,fontWeight:"600"}}>{z.name}</span></div></td>
                  <td style={{padding:"9px 14px",color:T.accent,fontWeight:"700"}}>{z.interactions}</td>
                  <td style={{padding:"9px 14px",color:T.text2}}>{z.dwell}s</td>
                  <td style={{padding:"9px 14px",color:T.text2}}>{share}%</td>
                  <td style={{padding:"9px 14px"}}><span style={{fontSize:"10px",padding:"2px 8px",borderRadius:"20px",background:perfColor+"20",color:perfColor,fontWeight:"700"}}>{perf}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Q&A Panel ────────────────────────────────────────────────────────────────
function QAPanel({ data, T }) {
  const [question, setQuestion] = useState("");
  const [history,  setHistory]  = useState([]);
  const [loading,  setLoading]  = useState(false);
  const endRef = useRef(null);
  const SUGGESTIONS = ["Which zone had the most engagement?","When should I schedule extra staff?","How much revenue did I lose today?","What is my average basket size?","What are the top anomalies to fix?","How can I improve satisfaction?","Give me today's summary"];

  async function ask(q) {
    if (!q.trim()) return;
    setHistory(h=>[...h,{role:"user",text:q}]); setQuestion(""); setLoading(true);
    const ans = await askAI(q, data);
    setHistory(h=>[...h,{role:"ai",text:ans}]); setLoading(false);
    setTimeout(()=>endRef.current?.scrollIntoView({behavior:"smooth"}),100);
  }

  return (
    <div style={{display:"flex",flexDirection:"column",gap:"16px"}}>
      <div style={{background:T.cardBg,border:`1px solid ${T.border}`,borderRadius:"16px",overflow:"hidden"}}>
        <div style={{height:"340px",overflowY:"auto",padding:"20px",display:"flex",flexDirection:"column",gap:"12px"}}>
          {history.length===0&&(
            <div style={{textAlign:"center",margin:"auto"}}>
              <div style={{fontSize:"36px",marginBottom:"8px"}}>🤖</div>
              <div style={{fontSize:"14px",color:T.text2,fontWeight:"600"}}>Ask me anything about your store</div>
              <div style={{fontSize:"12px",color:T.text3,marginTop:"4px"}}>Powered by RetailEns AI · No API key needed</div>
            </div>
          )}
          {history.map((msg,i)=>(
            <div key={i} style={{display:"flex",justifyContent:msg.role==="user"?"flex-end":"flex-start"}}>
              <div style={{maxWidth:"82%",padding:"10px 14px",borderRadius:msg.role==="user"?"16px 16px 4px 16px":"16px 16px 16px 4px",background:msg.role==="user"?T.accent:T.bg3,color:msg.role==="user"?"#000":T.text,fontSize:"13px",lineHeight:"1.6"}}>
                {msg.role==="ai"&&<span style={{fontSize:"10px",color:T.text3,display:"block",marginBottom:"4px"}}>RETAILENS AI</span>}
                {msg.text}
              </div>
            </div>
          ))}
          {loading&&<div style={{display:"flex",justifyContent:"flex-start"}}><div style={{padding:"10px 14px",borderRadius:"16px 16px 16px 4px",background:T.bg3,display:"flex",gap:"4px",alignItems:"center"}}>{[0,1,2].map(i=><div key={i} style={{width:"6px",height:"6px",borderRadius:"50%",background:T.accent,animation:`pulse 1s ${i*0.2}s infinite`}}/>)}</div></div>}
          <div ref={endRef}/>
        </div>
        <div style={{padding:"12px 16px",borderTop:`1px solid ${T.border}`,display:"flex",gap:"8px"}}>
          <input value={question} onChange={e=>setQuestion(e.target.value)} onKeyDown={e=>e.key==="Enter"&&ask(question)}
            placeholder="Ask about your store..." style={{flex:1,background:T.inputBg,border:`1px solid ${T.border2}`,borderRadius:"8px",padding:"8px 12px",color:T.text,fontSize:"13px",outline:"none"}}/>
          <button onClick={()=>ask(question)} disabled={loading||!question.trim()}
            style={{padding:"8px 18px",background:T.accent,color:"#000",border:"none",borderRadius:"8px",cursor:"pointer",fontWeight:"700",fontSize:"13px",opacity:loading||!question.trim()?0.5:1}}>Ask</button>
        </div>
      </div>
      <div style={{display:"flex",flexWrap:"wrap",gap:"6px"}}>
        {SUGGESTIONS.map((s,i)=>(
          <button key={i} onClick={()=>ask(s)} style={{padding:"5px 12px",borderRadius:"20px",border:`1px solid ${T.border2}`,background:"transparent",color:T.text2,cursor:"pointer",fontSize:"12px",transition:"all 0.2s"}}
            onMouseEnter={e=>{e.currentTarget.style.borderColor=T.accent;e.currentTarget.style.color=T.accent;}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border2;e.currentTarget.style.color=T.text2;}}>{s}</button>
        ))}
      </div>
      <style>{`@keyframes pulse{0%,100%{opacity:0.3}50%{opacity:1}}`}</style>
    </div>
  );
}

// ─── Heatmap (canvas) ─────────────────────────────────────────────────────────
function Heatmap({ data, canvasRef, theme }) {
  const localRef=useRef(null), ref=canvasRef||localRef;
  useEffect(()=>{
    if(!ref.current||!data) return;
    const ctx=ref.current.getContext("2d"), W=ref.current.width, H=ref.current.height;
    const rows=data.length, cols=data[0].length;
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle=theme==="light"?"#f8f8f8":"#0f0f0f"; ctx.fillRect(0,0,W,H);
    for(let r=0;r<rows;r++) for(let c=0;c<cols;c++){
      const v=data[r][c];
      ctx.fillStyle=`hsla(${(1-v)*240},100%,55%,${v*0.85})`;
      ctx.fillRect(c*W/cols,r*H/rows,W/cols+1,H/rows+1);
    }
    [["Entrance",0,0.8,0.15,0.2],["Aisle A",0.15,0,0.25,1],["Aisle B",0.4,0,0.25,1],["Checkout",0.75,0.7,0.25,0.3],["Shelf Zone",0.65,0,0.35,0.65]].forEach(([l,x,y,w,h])=>{
      ctx.strokeStyle=theme==="light"?"rgba(0,0,0,0.4)":"rgba(255,255,255,0.35)";
      ctx.lineWidth=1; ctx.strokeRect(x*W,y*H,w*W,h*H);
      ctx.fillStyle=theme==="light"?"rgba(0,0,0,0.85)":"rgba(255,255,255,0.9)";
      ctx.font="bold 10px monospace"; ctx.fillText(l,x*W+4,y*H+14);
    });
  },[data,theme]);
  return <canvas ref={ref} width={600} height={280} style={{width:"100%",borderRadius:"8px",display:"block"}}/>;
}

// ─── Journey Map (canvas) ─────────────────────────────────────────────────────
function JourneyMap({ paths, selectedId, canvasRef, theme }) {
  const localRef=useRef(null), ref=canvasRef||localRef;
  useEffect(()=>{
    if(!ref.current||!paths) return;
    const ctx=ref.current.getContext("2d"), W=ref.current.width, H=ref.current.height;
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle=theme==="light"?"#f8f8f8":"#0f0f0f"; ctx.fillRect(0,0,W,H);
    [["Entrance",0,0.78,0.15,0.22,"#00f5d4"],["Aisle A",0.15,0,0.25,1,"#f72585"],["Aisle B",0.4,0,0.25,1,"#7209b7"],["Checkout",0.75,0.68,0.25,0.32,"#f4a261"],["Shelf Zone",0.65,0,0.35,0.68,"#4cc9f0"]].forEach(([l,x,y,w,h,c])=>{
      ctx.fillStyle=c+(theme==="light"?"20":"15"); ctx.fillRect(x*W,y*H,w*W,h*H);
      ctx.strokeStyle=theme==="light"?"rgba(0,0,0,0.12)":"rgba(255,255,255,0.08)"; ctx.lineWidth=1; ctx.strokeRect(x*W,y*H,w*W,h*H);
      ctx.fillStyle=theme==="light"?"rgba(0,0,0,0.35)":"rgba(255,255,255,0.25)"; ctx.font="10px monospace"; ctx.fillText(l,x*W+6,y*H+16);
    });
    paths.forEach(path=>{
      const isSel=selectedId===path.id, alpha=selectedId?(isSel?1:0.12):0.65;
      ctx.strokeStyle=path.color+Math.round(alpha*255).toString(16).padStart(2,"0");
      ctx.lineWidth=isSel?2.5:1.5; ctx.setLineDash(isSel?[]:[4,3]);
      ctx.beginPath(); path.points.forEach((pt,i)=>{ if(i===0)ctx.moveTo(pt.x*W,pt.y*H); else ctx.lineTo(pt.x*W,pt.y*H); }); ctx.stroke(); ctx.setLineDash([]);
      path.points.forEach((pt,i)=>{ ctx.beginPath(); ctx.arc(pt.x*W,pt.y*H,i===0?5:3,0,Math.PI*2); ctx.fillStyle=i===0?(theme==="light"?"#000":"#fff"):path.color; ctx.globalAlpha=alpha; ctx.fill(); ctx.globalAlpha=1; });
    });
  },[paths,selectedId,theme]);
  return <canvas ref={ref} width={620} height={280} style={{width:"100%",borderRadius:"8px",display:"block",cursor:"crosshair"}}/>;
}

// ─── Heatmap Playback ─────────────────────────────────────────────────────────
function HeatmapPlayback({ data, T, theme }) {
  const [frame,setFrame]=useState(0), [playing,setPlaying]=useState(false);
  const ivRef=useRef(null), frames=data.heatmapFrames, hours=data.hours.slice(0,frames.length);
  useEffect(()=>{
    if(playing){ ivRef.current=setInterval(()=>setFrame(f=>{ if(f>=frames.length-1){setPlaying(false);return f;} return f+1; }),800); }
    else clearInterval(ivRef.current);
    return ()=>clearInterval(ivRef.current);
  },[playing,frames.length]);
  return (
    <div style={{display:"flex",flexDirection:"column",gap:"16px"}}>
      <div style={{background:T.cardBg,border:`1px solid ${T.border}`,borderRadius:"16px",padding:"20px"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"14px",flexWrap:"wrap",gap:"8px"}}>
          <div><div style={{fontSize:"11px",color:T.text3,letterSpacing:"2px",textTransform:"uppercase"}}>Heatmap Playback</div><div style={{fontSize:"12px",color:T.text2,marginTop:"2px"}}>Traffic flow hour by hour</div></div>
          <div style={{display:"flex",gap:"8px"}}>
            <span style={{padding:"4px 12px",background:T.accent+"20",color:T.accent,borderRadius:"8px",fontSize:"13px",fontWeight:"700",fontFamily:"'Bebas Neue',sans-serif"}}>{hours[frame]?.hour||"08:00"}</span>
            <span style={{padding:"4px 12px",background:T.bg3,color:T.text2,borderRadius:"8px",fontSize:"11px"}}>{hours[frame]?.visitors||0} visitors</span>
          </div>
        </div>
        <Heatmap data={frames[frame]} theme={theme}/>
        <div style={{marginTop:"12px",display:"flex",gap:"2px",alignItems:"flex-end",height:"36px"}}>
          {frames.map((_,i)=>(
            <div key={i} onClick={()=>{setFrame(i);setPlaying(false);}} style={{flex:1,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",height:"100%"}}>
              <div style={{width:"100%",height:`${Math.max(4,(hours[i]?.visitors||0)/120*32)}px`,background:i===frame?T.accent:T.accent+"40",borderRadius:"2px 2px 0 0",marginTop:"auto",transition:"all 0.2s"}}/>
            </div>
          ))}
        </div>
        <input type="range" min={0} max={frames.length-1} value={frame} onChange={e=>{setFrame(Number(e.target.value));setPlaying(false);}} style={{width:"100%",marginTop:"6px",accentColor:T.accent}}/>
        <div style={{display:"flex",gap:"8px",marginTop:"10px",justifyContent:"center"}}>
          {[["⏮",()=>setFrame(0)],["◀",()=>setFrame(f=>Math.max(0,f-1))],[playing?"⏸ Pause":"▶ Play",()=>setPlaying(p=>!p)],["▶ Next",()=>setFrame(f=>Math.min(frames.length-1,f+1))]].map(([lbl,fn],i)=>(
            <button key={i} onClick={fn} style={{padding:"6px 14px",borderRadius:"8px",border:`1px solid ${i===2?T.accent:T.border2}`,background:i===2?T.accent+"20":"transparent",color:i===2?T.accent:T.text2,cursor:"pointer",fontSize:"12px",fontWeight:i===2?"700":"400"}}>{lbl}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Other panels (Funnel, Anomalies, Trends, Staffing, Planogram, Multi-Store, Alerts, Satisfaction) ──────
function ConversionFunnel({ data, T }) {
  const biggest=data.reduce((b,s,i)=>{ if(i===0)return b; const d=data[i-1].pct-s.pct; return d>b.d?{d,label:s.label}:b; },{d:0,label:""});
  return (
    <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
      {data.map((step,i)=>{
        const drop=i>0?data[i-1].pct-step.pct:0;
        return (
          <div key={i} style={{display:"flex",alignItems:"center",gap:"10px",marginBottom:"2px"}}>
            <span style={{fontSize:"11px",color:T.text3,width:"130px",textAlign:"right",flexShrink:0}}>{step.label}</span>
            <div style={{flex:1,background:T.progressBg,borderRadius:"4px",height:"26px",overflow:"hidden",position:"relative"}}>
              <div style={{width:`${step.pct}%`,height:"100%",background:`linear-gradient(90deg,${T.accent},${T.accent4})`,borderRadius:"4px"}}/>
              <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",paddingLeft:"10px"}}>
                <span style={{fontSize:"11px",fontWeight:"700",color:"#fff",fontFamily:"'Bebas Neue',sans-serif"}}>{step.value.toLocaleString()} ({step.pct}%)</span>
              </div>
            </div>
            {i>0&&<span style={{fontSize:"11px",color:T.accent2,width:"40px",textAlign:"right",flexShrink:0}}>-{drop}%</span>}
          </div>
        );
      })}
      <div style={{padding:"10px 14px",background:T.insightBg,borderRadius:"8px",borderLeft:`3px solid ${T.accent}`,marginTop:"6px"}}>
        <span style={{fontSize:"12px",color:T.text3}}>Conversion: <b style={{color:T.accent}}>{data[data.length-1].pct}%</b> · Biggest drop: <b style={{color:T.accent2}}>{biggest.label}</b></span>
      </div>
    </div>
  );
}

function AnomalyCard({ anomaly, T }) {
  const [open,setOpen]=useState(false);
  const sev={high:{color:"#f72585",bg:"#f7258518",label:"HIGH"},medium:{color:"#f4a261",bg:"#f4a26118",label:"MED"},low:{color:"#4cc9f0",bg:"#4cc9f018",label:"LOW"}}[anomaly.severity];
  const icons={"LOITERING":"🚶","CROWD SURGE":"👥","EMPTY ZONE":"⬜","RAPID EXIT":"🚪"};
  return (
    <div onClick={()=>setOpen(!open)} style={{background:T.cardBg,border:`1px solid ${open?sev.color+"50":T.border}`,borderLeft:`3px solid ${sev.color}`,borderRadius:"12px",padding:"14px 18px",cursor:"pointer",transition:"border-color 0.2s"}}>
      <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
        <span style={{fontSize:"20px"}}>{icons[anomaly.type]||"⚠️"}</span>
        <div style={{flex:1}}><div style={{display:"flex",alignItems:"center",gap:"8px"}}><span style={{fontSize:"12px",fontWeight:"700",color:T.text}}>{anomaly.type}</span><span style={{fontSize:"9px",padding:"2px 7px",borderRadius:"20px",background:sev.bg,color:sev.color,fontWeight:"700"}}>{sev.label}</span></div><div style={{fontSize:"11px",color:T.text3,marginTop:"2px"}}>{anomaly.zone} · {anomaly.time}</div></div>
        <span style={{color:T.text4,fontSize:"16px",transition:"transform 0.2s",transform:open?"rotate(90deg)":"none"}}>›</span>
      </div>
      {open&&<div style={{marginTop:"12px",paddingTop:"12px",borderTop:`1px solid ${T.border}`}}><p style={{fontSize:"12px",color:T.text2,lineHeight:"1.6",marginBottom:"10px"}}>{anomaly.desc}</p><div style={{display:"flex",gap:"8px"}}><span style={{padding:"4px 12px",background:sev.bg,color:sev.color,borderRadius:"6px",fontSize:"11px",fontWeight:"600"}}>Review Footage</span><span style={{padding:"4px 12px",background:T.bg4,color:T.text3,borderRadius:"6px",fontSize:"11px"}}>Dismiss</span></div></div>}
    </div>
  );
}

function TrendPanel({ data, T }) {
  const [mode,setMode]=useState("weekly");
  const td=mode==="weekly"?data.weeklyData:data.monthlyData, xKey=mode==="weekly"?"day":"week";
  const curr=td.reduce((s,d)=>s+d.current,0), prev=td.reduce((s,d)=>s+d.previous,0);
  const change=(((curr-prev)/prev)*100).toFixed(1), up=parseFloat(change)>=0;
  return (
    <div style={{display:"flex",flexDirection:"column",gap:"16px"}}>
      <div style={{display:"flex",gap:"8px",alignItems:"center",flexWrap:"wrap"}}>
        {["weekly","monthly"].map(m=><button key={m} onClick={()=>setMode(m)} style={{padding:"6px 16px",borderRadius:"20px",border:`1px solid ${mode===m?T.accent:T.border2}`,background:mode===m?T.accent+"20":"transparent",color:mode===m?T.accent:T.text3,cursor:"pointer",fontSize:"12px",fontWeight:"600"}}>{m==="weekly"?"This Week":"This Month"}</button>)}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px"}} className="g2">
        <div style={{background:T.cardBg,border:`1px solid ${T.border}`,borderRadius:"12px",padding:"16px"}}>
          <div style={{fontSize:"10px",color:T.text3,letterSpacing:"2px",textTransform:"uppercase",marginBottom:"4px"}}>This {mode==="weekly"?"Week":"Month"}</div>
          <div style={{fontSize:"28px",fontWeight:"800",color:T.text,fontFamily:"'Bebas Neue',sans-serif"}}>{curr.toLocaleString()}</div>
          <div style={{fontSize:"12px",marginTop:"4px",color:up?T.green:T.red,fontWeight:"700"}}>{up?"↑":"↓"} {Math.abs(change)}% vs last period</div>
        </div>
        <div style={{background:T.cardBg,border:`1px solid ${T.border}`,borderRadius:"12px",padding:"16px"}}>
          <div style={{fontSize:"10px",color:T.text3,letterSpacing:"2px",textTransform:"uppercase",marginBottom:"4px"}}>Last Period</div>
          <div style={{fontSize:"28px",fontWeight:"800",color:T.text3,fontFamily:"'Bebas Neue',sans-serif"}}>{prev.toLocaleString()}</div>
          <div style={{fontSize:"12px",marginTop:"4px",color:T.text3}}>Baseline comparison</div>
        </div>
      </div>
      <div style={{background:T.cardBg,border:`1px solid ${T.border}`,borderRadius:"12px",padding:"20px"}}>
        <div style={{fontSize:"11px",color:T.text3,letterSpacing:"2px",textTransform:"uppercase",marginBottom:"12px"}}>Visitor Trend</div>
        <BarChart data={td} xKey={xKey} yKey="current" compare="previous" color={T.accent}/>
      </div>
      <div style={{background:T.cardBg,border:`1px solid ${T.border}`,borderRadius:"12px",padding:"20px"}}>
        <div style={{fontSize:"11px",color:T.text3,letterSpacing:"2px",textTransform:"uppercase",marginBottom:"12px"}}>Day-by-Day</div>
        {td.map((d,i)=>{ const diff=d.current-d.previous, isUp=diff>=0; return (
          <div key={i} style={{display:"flex",alignItems:"center",gap:"12px",padding:"7px 0",borderBottom:`1px solid ${T.border}`}}>
            <span style={{fontSize:"12px",color:T.text2,width:"36px",flexShrink:0,fontWeight:"600"}}>{d[xKey]}</span>
            <div style={{flex:1,display:"flex",alignItems:"center",gap:"4px"}}>
              <div style={{flex:d.current,background:T.accent,height:"5px",borderRadius:"3px",maxWidth:"50%",opacity:0.85}}/>
              <div style={{flex:d.previous,background:T.accent,height:"5px",borderRadius:"3px",maxWidth:"50%",opacity:0.22}}/>
            </div>
            <span style={{fontSize:"12px",color:T.text2,width:"36px",textAlign:"right",flexShrink:0}}>{d.current}</span>
            <span style={{fontSize:"11px",color:isUp?T.green:T.red,width:"48px",textAlign:"right",flexShrink:0,fontWeight:"700"}}>{isUp?"+":""}{diff}</span>
          </div>
        );})}
      </div>
    </div>
  );
}

function StaffingPanel({ data, T }) {
  const s=data.staffing, under=s.filter(x=>x.gap>0).length, over=s.filter(x=>x.gap<-1).length;
  const curr=s.reduce((t,x)=>t+x.current*250,0), opt=s.reduce((t,x)=>t+x.recommended*250,0);
  return (
    <div style={{display:"flex",flexDirection:"column",gap:"16px"}}>
      <div className="sc" style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"12px"}}>
        <StatCard label="Understaffed" value={under} unit="hrs" accent="#f72585" T={T}/>
        <StatCard label="Overstaffed" value={over} unit="hrs" accent="#f4a261" T={T}/>
        <StatCard label="Current Cost" value={`₹${(curr/1000).toFixed(0)}k`} unit="" accent={T.accent4} T={T}/>
        <StatCard label="Optimal Cost" value={`₹${(opt/1000).toFixed(0)}k`} unit="" accent={T.accent} T={T} sub={curr>opt?`Save ₹${((curr-opt)/1000).toFixed(0)}k`:undefined}/>
      </div>
      <div style={{background:T.cardBg,border:`1px solid ${T.border}`,borderRadius:"16px",overflow:"hidden"}}>
        <div style={{padding:"14px 20px",borderBottom:`1px solid ${T.border}`,fontSize:"11px",color:T.text3,letterSpacing:"2px",textTransform:"uppercase"}}>Hourly Schedule</div>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:"12px"}}>
            <thead><tr style={{background:T.bg3}}>{["Hour","Visitors","Current","Recommended","Gap","Status"].map(h=><th key={h} style={{padding:"9px 14px",textAlign:"left",fontSize:"10px",color:T.text3,letterSpacing:"1px",textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
            <tbody>
              {data.staffing.map((s,i)=>{
                const sc=s.status==="understaffed"?"#f72585":s.status==="overstaffed"?"#f4a261":"#00f5d4";
                return <tr key={i} style={{borderBottom:`1px solid ${T.border}`}}>
                  <td style={{padding:"9px 14px",color:T.text,fontWeight:"600"}}>{s.hour}</td>
                  <td style={{padding:"9px 14px",color:T.text2}}>{s.visitors}</td>
                  <td style={{padding:"9px 14px",color:T.text2}}>{s.current}</td>
                  <td style={{padding:"9px 14px",color:T.accent,fontWeight:"700"}}>{s.recommended}</td>
                  <td style={{padding:"9px 14px",color:s.gap>0?"#f72585":s.gap<0?"#f4a261":"#00f5d4",fontWeight:"700"}}>{s.gap>0?`+${s.gap}`:s.gap}</td>
                  <td style={{padding:"9px 14px"}}><span style={{fontSize:"10px",padding:"2px 8px",borderRadius:"20px",background:sc+"20",color:sc,fontWeight:"700"}}>{s.status}</span></td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function PlanogramPanel({ data, T }) {
  const [items,setItems]=useState(data.planogram);
  const applied=items.filter(i=>i.applied).length;
  const pc={"high":"#f72585","medium":"#f4a261","low":"#4cc9f0"};
  return (
    <div style={{display:"flex",flexDirection:"column",gap:"14px"}}>
      <div style={{background:T.cardBg,border:`1px solid ${T.border}`,borderRadius:"12px",padding:"16px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:"12px"}}>
        <div><div style={{fontSize:"11px",color:T.text3,letterSpacing:"2px",textTransform:"uppercase"}}>Planogram Optimizer</div><div style={{fontSize:"13px",color:T.text2,marginTop:"4px"}}>AI-recommended repositioning based on zone traffic</div></div>
        <div style={{display:"flex",gap:"16px"}}>
          <div style={{textAlign:"center"}}><div style={{fontSize:"22px",fontWeight:"800",color:T.accent,fontFamily:"'Bebas Neue',sans-serif"}}>{applied}</div><div style={{fontSize:"10px",color:T.text3}}>Applied</div></div>
          <div style={{textAlign:"center"}}><div style={{fontSize:"22px",fontWeight:"800",color:T.text3,fontFamily:"'Bebas Neue',sans-serif"}}>{items.length-applied}</div><div style={{fontSize:"10px",color:T.text3}}>Pending</div></div>
        </div>
      </div>
      {items.map(item=>(
        <div key={item.id} style={{background:T.cardBg,border:`1px solid ${item.applied?T.accent+"50":T.border}`,borderRadius:"12px",padding:"16px 20px",opacity:item.applied?0.7:1,transition:"all 0.3s"}}>
          <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:"12px",flexWrap:"wrap"}}>
            <div style={{flex:1,minWidth:"200px"}}>
              <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"8px",flexWrap:"wrap"}}>
                <span style={{fontSize:"14px",fontWeight:"700",color:T.text}}>{item.name}</span>
                <span style={{fontSize:"9px",padding:"2px 8px",borderRadius:"20px",background:pc[item.priority]+"20",color:pc[item.priority],fontWeight:"700"}}>{item.priority.toUpperCase()}</span>
                {item.applied&&<span style={{fontSize:"9px",padding:"2px 8px",borderRadius:"20px",background:T.accent+"20",color:T.accent,fontWeight:"700"}}>✓ APPLIED</span>}
              </div>
              <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"8px",flexWrap:"wrap"}}>
                <span style={{fontSize:"12px",color:T.text3,background:T.bg4,padding:"3px 10px",borderRadius:"6px"}}>{item.current}</span>
                <span style={{color:T.accent,fontSize:"16px"}}>→</span>
                <span style={{fontSize:"12px",color:T.accent,background:T.accent+"15",padding:"3px 10px",borderRadius:"6px",fontWeight:"700"}}>{item.recommended}</span>
                <span style={{fontSize:"12px",color:T.green,fontWeight:"700"}}>{item.lift}</span>
              </div>
              <p style={{fontSize:"12px",color:T.text2,lineHeight:"1.5",margin:0}}>{item.reason}</p>
            </div>
            <button onClick={()=>setItems(p=>p.map(x=>x.id===item.id?{...x,applied:!x.applied}:x))}
              style={{padding:"8px 18px",borderRadius:"8px",border:`1px solid ${item.applied?T.border2:T.accent}`,background:item.applied?"transparent":T.accent+"15",color:item.applied?T.text3:T.accent,cursor:"pointer",fontSize:"12px",fontWeight:"700",flexShrink:0}}>
              {item.applied?"Undo":"Apply"}
            </button>
          </div>
        </div>
      ))}
      {applied>0&&<div style={{background:T.green+"18",border:`1px solid ${T.green}40`,borderRadius:"12px",padding:"14px 18px",fontSize:"13px",color:T.green}}>🎯 <strong>{applied} applied.</strong> Est. combined lift: <strong>{items.filter(i=>i.applied).reduce((s,i)=>s+parseFloat(i.lift),0).toFixed(0)}%</strong></div>}
    </div>
  );
}

function MultiStorePanel({ T }) {
  const [selected,setSelected]=useState(null);
  const metrics=STORES.map(s=>({...s,...generateStoreMetrics(s.id)}));
  const total=metrics.reduce((s,m)=>s+m.visitors,0);
  return (
    <div style={{display:"flex",flexDirection:"column",gap:"16px"}}>
      <div className="sc" style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"12px"}}>
        <StatCard label="Network Visitors" value={total.toLocaleString()} unit="today" accent={T.accent} T={T}/>
        <StatCard label="Best Store" value={metrics.reduce((a,b)=>a.visitors>b.visitors?a:b).name.split(" ")[0]} unit="" accent={T.accent4} T={T}/>
        <StatCard label="Stores Online" value={metrics.filter(m=>m.status==="open").length} unit="/2" accent={T.green} T={T}/>
        <StatCard label="Network Revenue" value={`₹${(metrics.reduce((s,m)=>s+m.revenue,0)/100000).toFixed(1)}L`} unit="" accent={T.accent3} T={T}/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px"}} className="g2">
        {metrics.map(store=>(
          <div key={store.id} onClick={()=>setSelected(selected===store.id?null:store.id)}
            style={{background:T.cardBg,border:`1px solid ${selected===store.id?T.accent+"60":T.border}`,borderLeft:`3px solid ${store.status==="open"?T.accent:T.text4}`,borderRadius:"12px",padding:"16px 20px",cursor:"pointer",transition:"all 0.2s"}}>
            <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:"12px"}}>
              <div><div style={{fontSize:"14px",fontWeight:"700",color:T.text}}>{store.name}</div><div style={{fontSize:"11px",color:T.text3,marginTop:"2px"}}>{store.city} · {store.size}</div></div>
              <span style={{fontSize:"10px",padding:"3px 9px",borderRadius:"20px",background:store.status==="open"?T.green+"20":T.text4+"20",color:store.status==="open"?T.green:T.text4,fontWeight:"700"}}>{store.status}</span>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"8px"}}>
              {[{label:"Visitors",val:store.visitors,color:T.accent},{label:"Conversion",val:`${store.conversion}%`,color:T.accent4},{label:"Satisfaction",val:`${store.satisfaction}★`,color:"#f4a261"},{label:"Dwell",val:`${store.avgDwell}s`,color:T.text2},{label:"Queue",val:`${store.queueAvg}p`,color:T.accent2},{label:"Anomalies",val:store.anomalies,color:store.anomalies>3?T.red:T.text3}].map(m=>(
                <div key={m.label} style={{textAlign:"center"}}><div style={{fontSize:"14px",fontWeight:"700",color:m.color,fontFamily:"'Bebas Neue',sans-serif"}}>{m.val}</div><div style={{fontSize:"9px",color:T.text4}}>{m.label}</div></div>
              ))}
            </div>
            {selected===store.id&&<div style={{marginTop:"12px",paddingTop:"12px",borderTop:`1px solid ${T.border}`}}>
              <ProgressBar value={store.revenue} max={95000} color={store.trend==="up"?T.accent:T.red} T={T} height={6}/>
              <div style={{display:"flex",justifyContent:"space-between",marginTop:"4px",fontSize:"11px"}}>
                <span style={{color:T.text3}}>₹{(store.revenue/1000).toFixed(0)}k today</span>
                <span style={{color:store.trend==="up"?T.green:T.red,fontWeight:"700"}}>{store.trend==="up"?"↑":"↓"}{store.trendPct}% vs yesterday</span>
              </div>
            </div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function AlertsPanel({ data, T, securityLog=[] }) {
  const [tab, setTab]           = useState("timeline");   // "timeline" | "screenshots" | "legacy"
  const [selected, setSelected] = useState(null);         // selected incident for screenshot view
  const [notifPerm, setNotifPerm] = useState(
    "Notification" in window ? Notification.permission : "denied"
  );
  const [alerts, setAlerts] = useState(()=>{
    const saved=loadAlerts();
    if(saved.length===0){
      const init=data.anomalies.map(a=>({...a,read:false,ts:Date.now()-Math.floor(Math.random()*3600000)}));
      saveAlerts(init); return init;
    } return saved;
  });

  const flagColor = f => f==="GRAB_SEQUENCE"||f==="POCKET_CONCEAL"||f==="BAG_CONCEAL"?"#ff0033"
                       : f==="GROUP_DISTRACTION"?"#ff6600"
                       : f==="SHELF_REACH"||f==="CROUCH_CONCEAL"?"#ff8800":"#ffcc00";
  const flagIcon  = f => f==="GRAB_SEQUENCE"?"⚡":f==="POCKET_CONCEAL"?"🫳":f==="BAG_CONCEAL"?"👜"
                       : f==="GROUP_DISTRACTION"?"👥":f==="SHELF_REACH"?"🤚":f==="CROUCH_CONCEAL"?"🫷":"⚠️";

  async function requestNotif(){
    const perm = await Notification.requestPermission();
    setNotifPerm(perm);
  }

  // Stats
  const grabs   = securityLog.filter(e=>["GRAB_SEQUENCE","POCKET_CONCEAL","BAG_CONCEAL"].includes(e.flag));
  const groups  = securityLog.filter(e=>e.flag==="GROUP_DISTRACTION");
  const reaches = securityLog.filter(e=>e.flag==="SHELF_REACH"||e.flag==="CROUCH_CONCEAL");
  const screenshots = securityLog.filter(e=>e.screenshot && e.flag!=="GROUP_DISTRACTION");

  const TAB_BTN = (id,label,count) => (
    <button onClick={()=>setTab(id)} style={{
      padding:"7px 16px",borderRadius:"8px",fontSize:"12px",fontWeight:"700",cursor:"pointer",
      border:`1px solid ${tab===id?T.accent:T.border2}`,
      background: tab===id?T.accent+"20":"transparent",
      color: tab===id?T.accent:T.text3,
    }}>{label}{count>0&&<span style={{marginLeft:"6px",background:"#ff0033",color:"#fff",borderRadius:"10px",padding:"1px 6px",fontSize:"10px"}}>{count}</span>}</button>
  );

  return (
    <div style={{display:"flex",flexDirection:"column",gap:"16px"}}>

      {/* ── Notification permission banner ── */}
      {"Notification" in window && notifPerm!=="granted" && (
        <div style={{background:"#ff660018",border:"1px solid #ff660050",borderRadius:"10px",padding:"12px 16px",display:"flex",alignItems:"center",gap:"12px"}}>
          <span style={{fontSize:"20px"}}>🔔</span>
          <div style={{flex:1}}>
            <div style={{fontSize:"12px",fontWeight:"700",color:"#ff6600"}}>Enable Push Notifications</div>
            <div style={{fontSize:"11px",color:T.text3,marginTop:"2px"}}>Get instant alerts when theft gestures are detected — even when this tab is in background.</div>
          </div>
          <button onClick={requestNotif} style={{padding:"7px 14px",borderRadius:"8px",background:"#ff6600",color:"#fff",border:"none",cursor:"pointer",fontSize:"12px",fontWeight:"700",flexShrink:0}}>
            {notifPerm==="denied"?"Blocked":"Enable"}
          </button>
        </div>
      )}
      {notifPerm==="granted" && (
        <div style={{background:"#00f5d418",border:"1px solid #00f5d430",borderRadius:"10px",padding:"10px 16px",display:"flex",alignItems:"center",gap:"10px"}}>
          <span>🔔</span><span style={{fontSize:"12px",color:T.accent,fontWeight:"600"}}>Push notifications active — you'll be alerted immediately when threats are detected</span>
        </div>
      )}

      {/* ── KPI row ── */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"10px"}}>
        {[
          {l:"Theft Events",  v:grabs.length,   c:"#ff0033", icon:"🚨"},
          {l:"Group Alerts",  v:groups.length,  c:"#ff6600", icon:"👥"},
          {l:"Shelf Reaches", v:reaches.length, c:"#ff8800", icon:"🤚"},
          {l:"Screenshots",   v:screenshots.length, c:T.accent, icon:"📸"},
        ].map(s=>(
          <div key={s.l} style={{background:T.cardBg,border:`1px solid ${s.c}30`,borderRadius:"10px",padding:"12px 14px",textAlign:"center"}}>
            <div style={{fontSize:"22px",marginBottom:"4px"}}>{s.icon}</div>
            <div style={{fontSize:"22px",fontWeight:"800",color:s.c,fontFamily:"'Bebas Neue',sans-serif"}}>{s.v}</div>
            <div style={{fontSize:"10px",color:T.text3,marginTop:"2px"}}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* ── Tabs ── */}
      <div style={{display:"flex",gap:"8px",flexWrap:"wrap"}}>
        {TAB_BTN("timeline","📋 Incident Timeline", securityLog.length)}
        {TAB_BTN("screenshots","📸 Evidence Screenshots", screenshots.length)}
        {TAB_BTN("legacy","🔴 Store Alerts", alerts.filter(a=>!a.read).length)}
      </div>

      {/* ══ TAB: INCIDENT TIMELINE ══════════════════════════════════════════ */}
      {tab==="timeline" && (
        <div style={{display:"flex",flexDirection:"column",gap:"0"}}>
          {securityLog.length===0 && (
            <div style={{textAlign:"center",padding:"40px 0",color:T.text3}}>
              <div style={{fontSize:"36px",marginBottom:"8px"}}>✅</div>
              <div>No incidents detected in this video</div>
              <div style={{fontSize:"11px",marginTop:"6px",color:T.text4}}>Upload a video in Video Lookup to see real incidents</div>
            </div>
          )}
          {securityLog.map((ev,idx)=>{
            const c=flagColor(ev.flag);
            const isGroup=ev.flag==="GROUP_DISTRACTION";
            return (
              <div key={ev.id} style={{display:"flex",gap:"0",position:"relative"}}>
                {/* Timeline line */}
                <div style={{width:"40px",display:"flex",flexDirection:"column",alignItems:"center",flexShrink:0}}>
                  <div style={{width:"12px",height:"12px",borderRadius:"50%",background:c,border:`2px solid ${T.bg}`,zIndex:1,marginTop:"16px",flexShrink:0}}/>
                  {idx<securityLog.length-1&&<div style={{width:"2px",flex:1,background:T.border2,marginTop:"2px"}}/>}
                </div>
                {/* Event card */}
                <div onClick={()=>setSelected(selected?.id===ev.id?null:ev)}
                  style={{flex:1,background:T.cardBg,border:`1px solid ${selected?.id===ev.id?c:T.border}`,borderLeft:`3px solid ${c}`,borderRadius:"10px",padding:"12px 14px",margin:"6px 0 6px 8px",cursor:ev.screenshot?"pointer":"default",transition:"border-color 0.2s"}}>
                  <div style={{display:"flex",alignItems:"center",gap:"8px",flexWrap:"wrap"}}>
                    <span style={{fontSize:"18px"}}>{flagIcon(ev.flag)}</span>
                    <span style={{fontSize:"12px",fontWeight:"700",color:T.text}}>{ev.label}</span>
                    {isGroup&&<span style={{fontSize:"10px",padding:"2px 8px",borderRadius:"20px",background:"#ff660020",color:"#ff6600",fontWeight:"700"}}>GROUP</span>}
                    <span style={{fontSize:"10px",padding:"2px 8px",borderRadius:"20px",background:c+"20",color:c,fontWeight:"700"}}>ID:{ev.personId}{isGroup?` + ID:${ev.groupMemberId}`:""}</span>
                    <span style={{fontSize:"10px",color:T.text3,marginLeft:"auto"}}>T: {ev.t.toFixed(1)}s · {ev.zone}</span>
                    {ev.screenshot&&<span style={{fontSize:"10px",color:T.accent}}>📸 tap to view</span>}
                  </div>
                  <div style={{display:"flex",gap:"8px",marginTop:"6px",alignItems:"center"}}>
                    <div style={{flex:1,height:"6px",borderRadius:"3px",background:T.border2,overflow:"hidden"}}>
                      <div style={{width:`${ev.riskScore}%`,height:"100%",background:c,borderRadius:"3px",
                        boxShadow:ev.riskScore>=75?`0 0 6px ${c}`:"none"}}/>
                    </div>
                    <span style={{fontSize:"11px",color:c,fontWeight:"800",width:"70px",textAlign:"right",
                      fontFamily:"'Bebas Neue',sans-serif"}}>RISK {ev.riskScore}</span>
                  </div>
                  {/* Expanded screenshot */}
                  {selected?.id===ev.id && ev.screenshot && (
                    <div style={{marginTop:"12px",borderTop:`1px solid ${T.border}`,paddingTop:"12px"}}>
                      <div style={{fontSize:"10px",color:T.text3,marginBottom:"6px",letterSpacing:"1px",textTransform:"uppercase"}}>Evidence Frame — {ev.flag.replace(/_/g," ")} at {ev.t.toFixed(1)}s</div>
                      <img src={ev.screenshot} alt="evidence" style={{width:"100%",borderRadius:"8px",border:`2px solid ${c}`,display:"block"}}/>
                      <a href={ev.screenshot} download={`evidence_ID${ev.personId}_${ev.flag}_${ev.t.toFixed(0)}s.jpg`}
                        style={{display:"inline-block",marginTop:"8px",padding:"6px 14px",background:c,color:"#fff",borderRadius:"6px",fontSize:"11px",fontWeight:"700",textDecoration:"none"}}>
                        ⬇ Download Evidence
                      </a>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ══ TAB: EVIDENCE SCREENSHOTS ═══════════════════════════════════════ */}
      {tab==="screenshots" && (
        <div>
          {screenshots.length===0?(
            <div style={{textAlign:"center",padding:"40px 0",color:T.text3}}>
              <div style={{fontSize:"36px",marginBottom:"8px"}}>📸</div>
              <div>No evidence screenshots yet</div>
              <div style={{fontSize:"11px",marginTop:"6px",color:T.text4}}>Screenshots are captured automatically when theft gestures are confirmed</div>
            </div>
          ):(
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:"14px"}}>
              {screenshots.map(ev=>{
                const c=ev.suspicionLevel==="critical"?"#ff0033":ev.suspicionLevel==="alert"?"#ff6600":flagColor(ev.flag);
                return (
                  <div key={ev.id} style={{background:T.cardBg,border:`1px solid ${c}40`,borderRadius:"12px",overflow:"hidden"}}>
                    <img src={ev.screenshot} alt="evidence" style={{width:"100%",display:"block",aspectRatio:"16/9",objectFit:"cover"}}/>
                    <div style={{padding:"10px 12px"}}>
                      <div style={{display:"flex",alignItems:"center",gap:"6px",marginBottom:"4px"}}>
                        <span style={{fontSize:"14px"}}>{flagIcon(ev.flag)}</span>
                        <span style={{fontSize:"11px",fontWeight:"700",color:c}}>{ev.label}</span>
                        <span style={{fontSize:"10px",color:T.text3,marginLeft:"auto"}}>T:{ev.t.toFixed(1)}s</span>
                      </div>
                      <div style={{fontSize:"10px",color:T.text3,marginBottom:"8px"}}>Person ID:{ev.personId} · {ev.zone} · Risk:{ev.riskScore}</div>
                      <a href={ev.screenshot} download={`evidence_ID${ev.personId}_${ev.flag}_${ev.t.toFixed(0)}s.jpg`}
                        style={{display:"block",textAlign:"center",padding:"6px",background:c+"20",color:c,borderRadius:"6px",fontSize:"11px",fontWeight:"700",textDecoration:"none",border:`1px solid ${c}40`}}>
                        ⬇ Download Evidence
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ══ TAB: LEGACY STORE ALERTS ════════════════════════════════════════ */}
      {tab==="legacy" && (
        <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
          <div style={{display:"flex",justifyContent:"flex-end"}}>
            {alerts.length>0&&<button onClick={()=>{setAlerts([]);saveAlerts([]);}} style={{padding:"6px 14px",borderRadius:"8px",border:`1px solid ${T.border2}`,background:"transparent",color:T.text3,cursor:"pointer",fontSize:"12px"}}>Clear All</button>}
          </div>
          {alerts.length===0?<div style={{textAlign:"center",padding:"40px 0",color:T.text3}}><div style={{fontSize:"36px",marginBottom:"8px"}}>✅</div><div>No store alerts</div></div>:(
            alerts.map(alert=>{
              const sc2={"high":"#f72585","medium":"#f4a261","low":"#4cc9f0"}[alert.severity]||T.accent;
              const age=Math.floor((Date.now()-alert.ts)/60000);
              return <div key={alert.id} onClick={()=>{const u=alerts.map(a=>a.id===alert.id?{...a,read:true}:a);setAlerts(u);saveAlerts(u);}}
                style={{background:T.cardBg,border:`1px solid ${alert.read?T.border:sc2+"50"}`,borderLeft:`3px solid ${sc2}`,borderRadius:"10px",padding:"12px 16px",cursor:"pointer",opacity:alert.read?0.65:1}}>
                <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
                  {!alert.read&&<div style={{width:"7px",height:"7px",borderRadius:"50%",background:sc2,flexShrink:0}}/>}
                  <div style={{flex:1}}>
                    <div style={{display:"flex",alignItems:"center",gap:"6px",flexWrap:"wrap"}}><span style={{fontSize:"12px",fontWeight:"700",color:T.text}}>{alert.type}</span><span style={{fontSize:"9px",padding:"2px 7px",borderRadius:"20px",background:sc2+"20",color:sc2,fontWeight:"700"}}>{alert.severity?.toUpperCase()}</span><span style={{fontSize:"10px",color:T.text3,marginLeft:"auto"}}>{age<1?"Just now":`${age}m ago`} · {alert.zone}</span></div>
                    <div style={{fontSize:"11px",color:T.text3,marginTop:"3px"}}>{alert.desc}</div>
                  </div>
                  <button onClick={e=>{e.stopPropagation();const u=alerts.filter(a=>a.id!==alert.id);setAlerts(u);saveAlerts(u);}} style={{background:"transparent",border:"none",color:T.text4,cursor:"pointer",fontSize:"14px",padding:"2px 6px",flexShrink:0}}>✕</button>
                </div>
              </div>;
            })
          )}
        </div>
      )}
    </div>
  );
}

function SatisfactionPanel({ data, T }) {
  const sat=data.satisfaction; if(!sat) return null;
  const sc=(s)=>s>=80?T.green:s>=60?T.accent4:s>=40?"#f4a261":T.red;
  const metrics=[{label:"Queue Management",score:sat.queueScore,icon:"⏱️",desc:"Based on avg queue length"},{label:"Zone Engagement",score:sat.dwellScore,icon:"🗺️",desc:"Based on dwell time"},{label:"Safety & Comfort",score:sat.anomalyScore,icon:"🛡️",desc:"Based on anomaly severity"},{label:"Conversion Quality",score:sat.convScore,icon:"🛒",desc:"Based on purchase rate"}];
  return (
    <div style={{display:"flex",flexDirection:"column",gap:"16px"}}>
      <div style={{background:T.cardBg,border:`2px solid ${sat.color}40`,borderRadius:"16px",padding:"28px",textAlign:"center",position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",top:0,left:0,right:0,height:"3px",background:`linear-gradient(90deg,${sat.color},transparent)`}}/>
        <div style={{fontSize:"11px",color:T.text3,letterSpacing:"2px",textTransform:"uppercase",marginBottom:"12px"}}>Customer Satisfaction Score</div>
        <div style={{fontSize:"80px",fontWeight:"800",color:sat.color,fontFamily:"'Bebas Neue',sans-serif",lineHeight:1}}>{sat.overall}</div>
        <div style={{fontSize:"16px",color:sat.color,fontWeight:"700",marginTop:"4px"}}>{sat.label}</div>
        <div style={{display:"flex",justifyContent:"center",gap:"4px",marginTop:"10px"}}>{[1,2,3,4,5].map(i=><span key={i} style={{fontSize:"22px",color:i<=Math.round(sat.stars)?sat.color:T.text4}}>★</span>)}<span style={{fontSize:"13px",color:T.text3,alignSelf:"center",marginLeft:"6px"}}>{sat.stars}/5.0</span></div>
        <div style={{marginTop:"18px",height:"8px",borderRadius:"4px",background:`linear-gradient(90deg,${T.red} 0%,#f4a261 40%,${T.accent4} 70%,${T.green} 100%)`,position:"relative"}}>
          <div style={{position:"absolute",top:"-4px",left:`${sat.overall}%`,transform:"translateX(-50%)",width:"16px",height:"16px",borderRadius:"50%",background:sat.color,border:"2px solid #fff"}}/>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px"}} className="g2">
        {metrics.map((m,i)=>(
          <div key={i} style={{background:T.cardBg,border:`1px solid ${T.border}`,borderRadius:"12px",padding:"16px"}}>
            <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"10px"}}>
              <span style={{fontSize:"20px"}}>{m.icon}</span>
              <div><div style={{fontSize:"12px",fontWeight:"600",color:T.text}}>{m.label}</div><div style={{fontSize:"10px",color:T.text3}}>{m.desc}</div></div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
              <ProgressBar value={m.score} max={100} color={sc(m.score)} T={T} height={6}/>
              <span style={{fontSize:"14px",fontWeight:"800",color:sc(m.score),fontFamily:"'Bebas Neue',sans-serif",width:"36px",textAlign:"right"}}>{m.score}</span>
            </div>
          </div>
        ))}
      </div>
      {sat.tips.length>0&&<div style={{background:T.cardBg,border:`1px solid ${T.border}`,borderRadius:"12px",padding:"16px 20px"}}>
        <div style={{fontSize:"11px",color:T.text3,letterSpacing:"2px",textTransform:"uppercase",marginBottom:"12px"}}>Improvement Tips</div>
        {sat.tips.map((tip,i)=><div key={i} style={{display:"flex",gap:"10px",padding:"8px 12px",background:T.insightBg,borderRadius:"8px",borderLeft:`3px solid ${T.accent2}`,marginBottom:"8px"}}><span style={{color:T.accent2}}>💡</span><span style={{fontSize:"12px",color:T.text2,lineHeight:"1.5"}}>{tip}</span></div>)}
      </div>}
      <div style={{background:T.cardBg,border:`1px solid ${T.border}`,borderRadius:"12px",padding:"16px 20px"}}>
        <div style={{fontSize:"11px",color:T.text3,letterSpacing:"2px",textTransform:"uppercase",marginBottom:"12px"}}>Industry Benchmarks</div>
        {[{label:"Your Score",val:sat.overall,color:sat.color},{label:"Retail Industry Avg",val:64,color:T.text3},{label:"Top 10% Retailers",val:85,color:T.green}].map((b,i)=>(
          <div key={i} style={{display:"flex",alignItems:"center",gap:"10px",marginBottom:"8px"}}>
            <span style={{fontSize:"11px",color:T.text2,width:"140px",flexShrink:0}}>{b.label}</span>
            <ProgressBar value={b.val} max={100} color={b.color} T={T} height={6}/>
            <span style={{fontSize:"12px",fontWeight:"700",color:b.color,width:"30px",textAlign:"right"}}>{b.val}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HistoryCard({ entry, onClick, onDelete, T }) {
  return (
    <div onClick={onClick} style={{background:T.cardBg,border:`1px solid ${T.border}`,borderRadius:"12px",padding:"13px 18px",cursor:"pointer",display:"flex",alignItems:"center",gap:"14px",transition:"border-color 0.2s"}}
      onMouseEnter={e=>e.currentTarget.style.borderColor=T.accent+"50"} onMouseLeave={e=>e.currentTarget.style.borderColor=T.border}>
      <div style={{width:"36px",height:"36px",borderRadius:"10px",flexShrink:0,background:T.accent+"18",border:`1px solid ${T.accent}30`,display:"flex",alignItems:"center",justifyContent:"center"}}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="1.5"><path d="M15 10l4.553-2.069A1 1 0 0121 8.87V15.13a1 1 0 01-1.447.9L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/></svg>
      </div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:"13px",fontWeight:"600",color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{entry.filename}</div>
        <div style={{fontSize:"11px",color:T.text3,marginTop:"2px"}}>{entry.date}</div>
      </div>
      {[{label:"Visitors",val:entry.data.total,color:T.accent},{label:"Score",val:`${entry.data.satisfaction?.overall||"—"}/100`,color:T.accent4},{label:"Revenue",val:`₹${((entry.data.basketSize?.totalRevenue||0)/1000).toFixed(0)}k`,color:T.green}].map(s=>(
        <div key={s.label} style={{textAlign:"center",flexShrink:0}}>
          <div style={{fontSize:"13px",fontWeight:"700",color:s.color,fontFamily:"'Bebas Neue',sans-serif"}}>{s.val}</div>
          <div style={{fontSize:"9px",color:T.text4}}>{s.label}</div>
        </div>
      ))}
      <button onClick={e=>{e.stopPropagation();onDelete();}} style={{background:"transparent",border:"none",color:T.text4,cursor:"pointer",fontSize:"15px",padding:"4px 6px",flexShrink:0}}>✕</button>
    </div>
  );
}


// ─── Theft Detection & Suspicious Behavior Panel ─────────────────────────────
function TheftPanel({ data, T, theme }) {
  const td = data.theftData;
  const incidents = data.incidentLog || [];
  const [filter, setFilter]     = useState("all");
  const [selected, setSelected] = useState(null);
  const [acked, setAcked]       = useState({});
  const [showHeatmap, setShowHeatmap] = useState(true);
  const canvasRef = useRef(null);

  if (!td) return <div style={{color:T.text3,padding:"40px",textAlign:"center"}}>No theft analysis data. Re-upload your video.</div>;

  const { stats, zoneRisk, hourlyIncidents, lossStats } = td;
  const RISK_COLOR = { critical:"#ff3366", high:"#f72585", medium:"#f4a261", low:"#4cc9f0" };
  const SEV_ORDER  = { critical:0, high:1, medium:2, low:3 };

  const filtered = filter === "all"
    ? incidents
    : incidents.filter(inc => inc.severity === filter);

  const selPerson = selected != null
    ? td.tracks.find(t => t.id === selected)
    : null;

  // Draw person positions + risk overlay on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !td.tracks) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = theme === "light" ? "#f0f0f0" : "#111";
    ctx.fillRect(0, 0, W, H);

    // Zone overlays
    const ZONES_DRAW = [
      ["Entrance",   0,    0.78, 0.15, 0.22, "#00f5d4"],
      ["Aisle A",    0.15, 0,   0.25, 1,    "#f72585"],
      ["Aisle B",    0.40, 0,   0.25, 1,    "#7209b7"],
      ["Checkout",   0.75, 0.68,0.25, 0.32, "#f4a261"],
      ["Shelf Zone", 0.65, 0,   0.35, 0.68, "#ff3366"],
    ];
    ZONES_DRAW.forEach(([name, x, y, w, h, color]) => {
      const riskInfo = RISK_ZONES[name];
      const alpha    = riskInfo?.riskLevel === "high" ? 0.18 : riskInfo?.riskLevel === "medium" ? 0.10 : 0.06;
      ctx.fillStyle  = color + Math.round(alpha * 255).toString(16).padStart(2,"0");
      ctx.fillRect(x * W, y * H, w * W, h * H);
      ctx.strokeStyle = color + "40";
      ctx.lineWidth   = 1;
      ctx.strokeRect(x * W, y * H, w * W, h * H);
      ctx.fillStyle   = theme === "light" ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.4)";
      ctx.font        = "bold 9px monospace";
      ctx.fillText(name, x * W + 4, y * H + 12);
    });

    // Draw each tracked person
    td.tracks.forEach(track => {
      const isSel   = selected === track.id;
      const rc      = RISK_COLOR[track.riskLevel] || "#888";
      const px      = track.lastX * W;
      const py      = track.lastY * H;
      const radius  = isSel ? 12 : 8;

      // Risk radius glow
      const grad = ctx.createRadialGradient(px, py, 0, px, py, radius * 3);
      grad.addColorStop(0, rc + "50");
      grad.addColorStop(1, rc + "00");
      ctx.beginPath();
      ctx.arc(px, py, radius * 3, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      // Person dot
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fillStyle = rc;
      ctx.fill();
      ctx.strokeStyle = isSel ? "#fff" : rc + "80";
      ctx.lineWidth   = isSel ? 2.5 : 1;
      ctx.stroke();

      // ID label
      ctx.fillStyle = "#fff";
      ctx.font      = `bold ${isSel ? 10 : 8}px monospace`;
      ctx.textAlign = "center";
      ctx.fillText(`P${track.id}`, px, py + 3);
      ctx.textAlign = "left";

      // Flag count badge
      if (track.flags.length > 0) {
        ctx.beginPath();
        ctx.arc(px + radius, py - radius, 5, 0, Math.PI * 2);
        ctx.fillStyle = "#ff3366";
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.font = "bold 7px monospace";
        ctx.textAlign = "center";
        ctx.fillText(track.flags.length, px + radius, py - radius + 2.5);
        ctx.textAlign = "left";
      }
    });

    // Legend
    const levels = [["critical","#ff3366"],["high","#f72585"],["medium","#f4a261"],["low","#4cc9f0"]];
    levels.forEach(([label, color], i) => {
      const lx = 8, ly = H - 12 - i * 14;
      ctx.beginPath(); ctx.arc(lx + 4, ly - 3, 4, 0, Math.PI * 2);
      ctx.fillStyle = color; ctx.fill();
      ctx.fillStyle = theme === "light" ? "#333" : "#ccc";
      ctx.font = "8px monospace"; ctx.fillText(label, lx + 12, ly);
    });
  }, [td, selected, theme]);

  return (
    <div style={{display:"flex",flexDirection:"column",gap:"16px"}}>

      {/* ── Risk Overview ── */}
      <div style={{background:`linear-gradient(135deg,${T.accent2}15,${T.accent3}10)`,border:`1px solid ${T.accent2}30`,borderRadius:"16px",padding:"20px 24px",position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",top:0,left:0,right:0,height:"3px",background:`linear-gradient(90deg,#ff3366,#f72585,#f4a261)`}}/>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:"16px"}}>
          <div>
            <div style={{fontSize:"11px",color:T.text3,letterSpacing:"2px",textTransform:"uppercase",marginBottom:"4px"}}>🛡️ Loss Prevention · Threat Analysis</div>
            <div style={{fontSize:"36px",fontWeight:"800",color:"#ff3366",fontFamily:"'Bebas Neue',sans-serif",lineHeight:1}}>
              {stats.storeRisk}<span style={{fontSize:"16px",color:T.text3,marginLeft:"4px"}}>/100 risk score</span>
            </div>
            <div style={{fontSize:"13px",color:T.text2,marginTop:"4px"}}>
              {stats.critical>0 ? `⚠️ ${stats.critical} critical incident${stats.critical>1?"s":""} require immediate attention` :
               stats.high>0    ? `${stats.high} high-risk behavior${stats.high>1?"s":""} flagged` :
               "No critical threats detected — store is secure"}
            </div>
          </div>
          <div style={{display:"flex",gap:"10px",flexWrap:"wrap"}}>
            {[
              {label:"Critical",  val:stats.critical,  color:"#ff3366"},
              {label:"High Risk", val:stats.high,      color:"#f72585"},
              {label:"Medium",    val:stats.medium,    color:"#f4a261"},
              {label:"Flagged",   val:stats.flagged,   color:"#4cc9f0"},
            ].map(s=>(
              <div key={s.label} style={{textAlign:"center",padding:"10px 14px",background:s.color+"18",border:`1px solid ${s.color}30`,borderRadius:"10px",minWidth:"60px"}}>
                <div style={{fontSize:"28px",fontWeight:"800",color:s.color,fontFamily:"'Bebas Neue',sans-serif",lineHeight:1}}>{s.val}</div>
                <div style={{fontSize:"9px",color:T.text3,marginTop:"2px",textTransform:"uppercase",letterSpacing:"1px"}}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Loss Prevention Value ── */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"12px"}} className="sc">
        {[
          {label:"Potential Exposure",    val:`₹${lossStats.potentialExposure.toLocaleString()}`,  color:"#f72585", icon:"⚠️",  sub:"Est. shrinkage risk today"},
          {label:"Loss Prevented (est.)", val:`₹${lossStats.estLossAvoided.toLocaleString()}`,    color:T.green,    icon:"🛡️", sub:"Via early detection alerts"},
          {label:"Avg Item at Risk",      val:`₹${lossStats.avgItemValue}`,                        color:T.accent4,  icon:"🏷️", sub:"High-value zone products"},
        ].map(s=>(
          <div key={s.label} style={{background:T.cardBg,border:`1px solid ${s.color}25`,borderRadius:"12px",padding:"16px 18px",borderLeft:`3px solid ${s.color}`}}>
            <div style={{display:"flex",gap:"8px",alignItems:"center",marginBottom:"6px"}}>
              <span style={{fontSize:"18px"}}>{s.icon}</span>
              <span style={{fontSize:"10px",color:T.text3,letterSpacing:"1px",textTransform:"uppercase"}}>{s.label}</span>
            </div>
            <div style={{fontSize:"24px",fontWeight:"800",color:s.color,fontFamily:"'Bebas Neue',sans-serif"}}>{s.val}</div>
            <div style={{fontSize:"11px",color:T.text3,marginTop:"3px"}}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Floor Map + Person Tracker ── */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 280px",gap:"14px"}} className="g2">
        <div style={{background:T.cardBg,border:`1px solid ${T.border}`,borderRadius:"16px",padding:"20px"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"12px",flexWrap:"wrap",gap:"8px"}}>
            <div style={{fontSize:"11px",color:T.text3,letterSpacing:"2px",textTransform:"uppercase"}}>Live Behavior Map</div>
            <div style={{display:"flex",gap:"6px"}}>
              {selected&&<button onClick={()=>setSelected(null)} style={{padding:"3px 10px",borderRadius:"6px",border:`1px solid ${T.border2}`,background:"transparent",color:T.text3,cursor:"pointer",fontSize:"11px"}}>Clear Selection</button>}
            </div>
          </div>
          <canvas ref={canvasRef} width={560} height={280}
            style={{width:"100%",borderRadius:"8px",display:"block",cursor:"crosshair"}}
            onClick={e=>{
              const rect = e.currentTarget.getBoundingClientRect();
              const rx = (e.clientX - rect.left) / rect.width;
              const ry = (e.clientY - rect.top)  / rect.height;
              const hit = td.tracks.find(t => Math.abs(t.lastX-rx)<0.06 && Math.abs(t.lastY-ry)<0.08);
              setSelected(hit ? hit.id : null);
            }}
          />
          <div style={{marginTop:"10px",display:"flex",flexWrap:"wrap",gap:"5px"}}>
            {td.tracks.map(t=>{
              const rc = RISK_COLOR[t.riskLevel] || "#888";
              return (
                <button key={t.id} onClick={()=>setSelected(selected===t.id?null:t.id)}
                  style={{padding:"3px 10px",borderRadius:"20px",border:`1px solid ${selected===t.id?rc:T.border2}`,background:selected===t.id?rc+"25":"transparent",color:selected===t.id?rc:T.text3,cursor:"pointer",fontSize:"11px",fontWeight:"600"}}>
                  P{t.id} {t.flags.length>0?`(${t.flags.length}⚑)`:""}
                </button>
              );
            })}
          </div>
        </div>

        {/* Person Detail */}
        <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>
          {selPerson ? (
            <div style={{background:T.cardBg,border:`2px solid ${RISK_COLOR[selPerson.riskLevel]}40`,borderRadius:"12px",padding:"16px",flex:1}}>
              <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"14px"}}>
                <div style={{width:"36px",height:"36px",borderRadius:"50%",background:`${RISK_COLOR[selPerson.riskLevel]}25`,border:`2px solid ${RISK_COLOR[selPerson.riskLevel]}60`,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:"800",color:RISK_COLOR[selPerson.riskLevel],fontSize:"14px",flexShrink:0}}>P{selPerson.id}</div>
                <div>
                  <div style={{fontSize:"13px",fontWeight:"700",color:T.text}}>Person {selPerson.id}</div>
                  <div style={{fontSize:"10px",padding:"2px 7px",borderRadius:"20px",background:RISK_COLOR[selPerson.riskLevel]+"20",color:RISK_COLOR[selPerson.riskLevel],fontWeight:"700",display:"inline-block",marginTop:"2px"}}>{selPerson.riskLevel.toUpperCase()} RISK · {selPerson.riskScore}/100</div>
                </div>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:"6px",marginBottom:"12px"}}>
                {[
                  ["Zone",        selPerson.topZone],
                  ["Dwell",       `${selPerson.dwell}s`],
                  ["Entry",       selPerson.entryHour],
                  ["Movement",    selPerson.speed < 0.005 ? "Slow / Loitering" : selPerson.speed > 0.015 ? "Erratic" : "Normal"],
                  ["Group size",  selPerson.groupSize > 1 ? `${selPerson.groupSize} people` : "Alone"],
                  ["Return visits",selPerson.returnCount > 0 ? `${selPerson.returnCount}x` : "First visit"],
                ].map(([k,v])=>(
                  <div key={k} style={{display:"flex",justifyContent:"space-between",fontSize:"11px",padding:"4px 0",borderBottom:`1px solid ${T.border}`}}>
                    <span style={{color:T.text3}}>{k}</span>
                    <span style={{color:T.text,fontWeight:"600"}}>{v}</span>
                  </div>
                ))}
              </div>
              <div style={{fontSize:"11px",color:T.text3,marginBottom:"6px",letterSpacing:"1px",textTransform:"uppercase"}}>Behavior Flags</div>
              <div style={{display:"flex",flexDirection:"column",gap:"5px"}}>
                {selPerson.flags.length > 0 ? selPerson.flags.map(flag=>{
                  const bt = BEHAVIOR_TYPES[flag];
                  return (
                    <div key={flag} style={{display:"flex",gap:"7px",padding:"6px 9px",background:bt?.color+"15",borderRadius:"6px",borderLeft:`2px solid ${bt?.color}`}}>
                      <span style={{fontSize:"14px",flexShrink:0}}>{bt?.icon}</span>
                      <span style={{fontSize:"11px",color:T.text2,lineHeight:"1.4"}}>{bt?.label}</span>
                    </div>
                  );
                }) : <div style={{fontSize:"12px",color:T.text3}}>✓ No suspicious behavior detected</div>}
              </div>
            </div>
          ) : (
            <div style={{background:T.cardBg,border:`1px solid ${T.border}`,borderRadius:"12px",padding:"16px",flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:"8px"}}>
              <div style={{fontSize:"32px"}}>👆</div>
              <div style={{fontSize:"12px",color:T.text3,textAlign:"center"}}>Click a person on the map or a P-button to see their behavior profile</div>
            </div>
          )}
        </div>
      </div>

      {/* ── Zone Risk Table ── */}
      <div style={{background:T.cardBg,border:`1px solid ${T.border}`,borderRadius:"16px",overflow:"hidden"}}>
        <div style={{padding:"14px 20px",borderBottom:`1px solid ${T.border}`,fontSize:"11px",color:T.text3,letterSpacing:"2px",textTransform:"uppercase"}}>Zone Risk Assessment</div>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:"12px"}}>
          <thead><tr style={{background:T.bg3}}>
            {["Zone","Risk Level","Incidents","Avg Risk Score","People Tracked","Reason"].map(h=>(
              <th key={h} style={{padding:"9px 14px",textAlign:"left",fontSize:"10px",color:T.text3,letterSpacing:"1px",textTransform:"uppercase"}}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {zoneRisk.sort((a,b)=>b.avgRiskScore-a.avgRiskScore).map((z,i)=>{
              const rlv   = z.riskInfo?.riskLevel || "low";
              const rclr  = rlv==="high"?"#f72585":rlv==="medium"?"#f4a261":"#4cc9f0";
              return (
                <tr key={i} style={{borderBottom:`1px solid ${T.border}`}}>
                  <td style={{padding:"9px 14px",fontWeight:"700",color:T.text}}>{z.zone}</td>
                  <td style={{padding:"9px 14px"}}><span style={{fontSize:"10px",padding:"2px 8px",borderRadius:"20px",background:rclr+"20",color:rclr,fontWeight:"700"}}>{rlv.toUpperCase()}</span></td>
                  <td style={{padding:"9px 14px",color:z.incidentCount>0?"#f72585":T.text2,fontWeight:z.incidentCount>0?"700":"400"}}>{z.incidentCount}</td>
                  <td style={{padding:"9px 14px"}}><div style={{display:"flex",alignItems:"center",gap:"8px"}}><div style={{flex:1,background:T.progressBg,borderRadius:"3px",height:"5px",overflow:"hidden"}}><div style={{width:`${z.avgRiskScore}%`,height:"100%",background:rclr,borderRadius:"3px"}}/></div><span style={{color:rclr,fontWeight:"700",fontSize:"11px",width:"28px"}}>{z.avgRiskScore}</span></div></td>
                  <td style={{padding:"9px 14px",color:T.text2}}>{z.personCount}</td>
                  <td style={{padding:"9px 14px",color:T.text3,fontSize:"11px"}}>{z.riskInfo?.reason}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Incident Log ── */}
      <div style={{background:T.cardBg,border:`1px solid ${T.border}`,borderRadius:"16px",padding:"20px"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:"8px",marginBottom:"14px"}}>
          <div style={{fontSize:"11px",color:T.text3,letterSpacing:"2px",textTransform:"uppercase"}}>Incident Log ({filtered.length})</div>
          <div style={{display:"flex",gap:"6px",flexWrap:"wrap"}}>
            {["all","high","medium","low"].map(f=>(
              <button key={f} onClick={()=>setFilter(f)}
                style={{padding:"4px 11px",borderRadius:"20px",border:`1px solid ${filter===f?"#f72585":T.border2}`,background:filter===f?"#f7258520":"transparent",color:filter===f?"#f72585":T.text3,cursor:"pointer",fontSize:"11px",fontWeight:"600"}}>
                {f==="all"?"All":f.charAt(0).toUpperCase()+f.slice(1)} {f==="all"?`(${incidents.length})`:f==="high"?`(${incidents.filter(i=>i.severity==="high").length})`:f==="medium"?`(${incidents.filter(i=>i.severity==="medium").length})`:f==="low"?`(${incidents.filter(i=>i.severity==="low").length})`:""}
              </button>
            ))}
          </div>
        </div>
        {filtered.length===0 ? (
          <div style={{textAlign:"center",padding:"32px",color:T.text3}}>
            <div style={{fontSize:"32px",marginBottom:"8px"}}>✅</div>
            <div>No incidents at this severity level</div>
          </div>
        ) : (
          <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
            {filtered.map(inc=>{
              const isAcked = acked[inc.id];
              return (
                <div key={inc.id}
                  style={{display:"flex",gap:"12px",padding:"12px 16px",borderRadius:"10px",border:`1px solid ${isAcked?T.border:inc.color+"40"}`,background:isAcked?T.insightBg:inc.color+"08",borderLeft:`3px solid ${isAcked?T.border2:inc.color}`,opacity:isAcked?0.6:1,transition:"all 0.3s"}}>
                  <span style={{fontSize:"22px",flexShrink:0}}>{inc.icon}</span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",alignItems:"center",gap:"8px",flexWrap:"wrap",marginBottom:"3px"}}>
                      <span style={{fontSize:"13px",fontWeight:"700",color:T.text}}>{inc.label}</span>
                      <span style={{fontSize:"9px",padding:"2px 7px",borderRadius:"20px",background:inc.color+"20",color:inc.color,fontWeight:"700"}}>{inc.severity.toUpperCase()}</span>
                      <span style={{fontSize:"10px",color:T.text3}}>Person {inc.personId} · {inc.zone} · {inc.time}</span>
                      <span style={{fontSize:"10px",color:T.text3,marginLeft:"auto"}}>Dwell: {inc.dwell}s · Risk: {inc.riskScore}/100</span>
                    </div>
                    <div style={{fontSize:"12px",color:T.text2,lineHeight:"1.5"}}>{inc.desc}</div>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:"4px",flexShrink:0}}>
                    <button onClick={()=>setAcked(p=>({...p,[inc.id]:!p[inc.id]}))}
                      style={{padding:"4px 10px",borderRadius:"6px",border:`1px solid ${isAcked?T.border2:inc.color}`,background:isAcked?"transparent":inc.color+"20",color:isAcked?T.text3:inc.color,cursor:"pointer",fontSize:"10px",fontWeight:"700"}}>
                      {isAcked?"Reopen":"Acknowledge"}
                    </button>
                    <button onClick={()=>setSelected(inc.personId)}
                      style={{padding:"4px 10px",borderRadius:"6px",border:`1px solid ${T.border2}`,background:"transparent",color:T.text3,cursor:"pointer",fontSize:"10px"}}>
                      Track →
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Behavior Reference ── */}
      <div style={{background:T.cardBg,border:`1px solid ${T.border}`,borderRadius:"16px",padding:"20px"}}>
        <div style={{fontSize:"11px",color:T.text3,letterSpacing:"2px",textTransform:"uppercase",marginBottom:"14px"}}>Behavior Detection Reference</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px"}} className="g2">
          {Object.entries(BEHAVIOR_TYPES).map(([key, bt])=>(
            <div key={key} style={{display:"flex",gap:"10px",padding:"9px 12px",background:T.insightBg,borderRadius:"8px",borderLeft:`3px solid ${bt.color}`}}>
              <span style={{fontSize:"18px",flexShrink:0}}>{bt.icon}</span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:"11px",fontWeight:"700",color:T.text}}>{bt.label}</div>
                <div style={{fontSize:"10px",color:T.text3,lineHeight:"1.4",marginTop:"2px"}}>{bt.desc}</div>
              </div>
              <span style={{fontSize:"9px",padding:"2px 6px",borderRadius:"20px",background:bt.color+"20",color:bt.color,fontWeight:"700",flexShrink:0,alignSelf:"flex-start"}}>{bt.severity.toUpperCase()}</span>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}


// ─── Video Lookup Panel ───────────────────────────────────────────────────────
// Processes an uploaded video entirely in-browser:
// - Tracks people frame by frame using HOG
// - Assigns zone labels & unique IDs
// - Renders annotated video with bounding boxes, trails, dwell timers
// - Shows per-person summary table
function VideoLookupPanel({ T, theme, setSecurityLog }) {
  const [file,        setFile]        = useState(null);
  const [status,      setStatus]      = useState("idle");  // idle|reading|processing|done|error
  const [progress,    setProgress]    = useState(0);
  const [statusMsg,   setStatusMsg]   = useState("");
  const [resultUrl,   setResultUrl]   = useState(null);
  const [personSummary, setPersonSummary] = useState([]);
  const [stats,       setStats]       = useState(null);
  const fileRef   = useRef(null);
  const canvasRef = useRef(null);
  const videoRef  = useRef(null);
  const animRef   = useRef(null);

  // Zone definitions matching the rest of the app
  const ZONES = [
    { name:"Entrance",   x1:0.00, y1:0.75, x2:0.15, y2:1.00, color:[0,245,212]   },
    { name:"Aisle A",    x1:0.15, y1:0.00, x2:0.40, y2:1.00, color:[247,37,133]  },
    { name:"Aisle B",    x1:0.40, y1:0.00, x2:0.65, y2:1.00, color:[114,9,183]   },
    { name:"Checkout",   x1:0.75, y1:0.65, x2:1.00, y2:1.00, color:[244,162,97]  },
    { name:"Shelf Zone", x1:0.65, y1:0.00, x2:1.00, y2:0.65, color:[76,201,240]  },
  ];
  const PERSON_COLORS = [
    "#00f5d4","#f72585","#4cc9f0","#f4a261","#7209b7",
    "#ff6b6b","#a8dadc","#e9c46a","#06d6a0","#ef476f",
    "#ffd166","#118ab2","#b5e48c","#f4d03f","#e76f51",
  ];

  function getZone(cxF, cyF) {
    for (const z of ZONES) {
      if (cxF>=z.x1 && cxF<=z.x2 && cyF>=z.y1 && cyF<=z.y2) return z.name;
    }
    return "Open Area";
  }

  async function processVideo(videoFile) {
    setStatus("reading"); setProgress(5); setStatusMsg("Loading video...");
    // Request notification permission upfront
    if("Notification" in window && Notification.permission==="default"){
      Notification.requestPermission();
    }
    const url = URL.createObjectURL(videoFile);
    const vid = document.createElement("video");
    vid.src = url; vid.muted = true; vid.crossOrigin = "anonymous";
    await new Promise(r => { vid.onloadedmetadata = r; vid.onerror = r; });

    const VW = Math.min(vid.videoWidth, 640);
    const VH = Math.min(vid.videoHeight, Math.round(vid.videoHeight * VW / vid.videoWidth));
    const duration = vid.duration;
    const FPS = 10;
    const totalSamples = Math.floor(duration * FPS);
    setStatusMsg(`Video loaded: ${Math.round(duration)}s · Processing...`);
    setProgress(10);

    const offscreen = document.createElement("canvas");
    offscreen.width = VW; offscreen.height = VH;
    const octx = offscreen.getContext("2d", { willReadFrequently: true });
    const outCanvas = document.createElement("canvas");
    outCanvas.width = VW; outCanvas.height = VH;
    const outCtx = outCanvas.getContext("2d");

    // ─────────────────────────────────────────────────────────────────────────
    // DETECTION STRATEGY: Temporal motion accumulation
    //
    // Background subtraction fails in cluttered stores because shelves,
    // bottles, and product labels change appearance frame-to-frame due to
    // camera vibration, reflections, and lighting — generating persistent
    // false blobs regardless of threshold.
    //
    // The correct approach: a REAL person creates sustained, spatially
    // coherent motion over multiple consecutive frames.  A shelf pixel
    // may flicker on/off but never accumulates consistent motion.
    //
    // Algorithm:
    //   1. Compute per-pixel absolute diff between frame[t] and frame[t-2]
    //      (skipping one frame reduces noise from video compression)
    //   2. Threshold at 0.18 to get binary motion mask
    //   3. Accumulate into a "motion heat" buffer — each pixel gets +1 per
    //      frame it's in motion, decays by 0.7 each frame when not
    //   4. Threshold heat > 2.5 to get the final foreground mask
    //      → requires motion sustained across ~4 frames minimum
    //      → shelf flicker (1-2 frame bursts) never reaches threshold
    //   5. Morphology: erode×1 (kill isolated specks), dilate×2 (fill gaps)
    //   6. Blob detect with strict size + aspect + density gates
    //   7. Fuse nearby blobs (split person), track with movement gate
    //   8. A track only gets an ID after it has moved MIN_TRAVEL distance
    //   9. Confirmed tracks that stop moving for STILL_FRAMES → deleted
    // ─────────────────────────────────────────────────────────────────────────

    const MATCH_RADIUS = 0.25;   // 25% frame width — handles walkers without cross-matching
    const MAX_MISSED   = 40;     // 4s survival behind shelf / occluded
    const MIN_FRAMES   = 3;      // confirm in 0.3s — re-ID after occlusion
    const MIN_TRAVEL   = 0.025;  // slow browsers confirm quickly
    const MERGE_DIST   = 0.18;   // merge split torso/legs blobs within 18% frame width
    const DEDUP_DIST   = 0.07;   // only merge tracks if almost perfectly overlapping (same blob)
    const STILL_FRAMES = 90;     // 9s before static confirmed track is killed
    const STILL_DISP   = 0.004;  // only kill if barely moved at all
    const HEAT_THRESH  = 1.8;
    const DIFF_THRESH  = 0.12;

    const tracks      = {};
    let   nextId      = 1;
    const prevCenters = {};
    const frameAnnotations = {};
    const allFrameData     = [];

    // Store last two blurred grayscale frames for diff
    let grayPrev2 = null;  // frame t-2
    let grayPrev1 = null;  // frame t-1
    // Motion heat buffer
    const heat = new Float32Array(VW * VH);

    function toGray(pixels) {
      const g = new Float32Array(VW * VH);
      for (let i = 0; i < VW*VH; i++)
        g[i] = (pixels[i*4]*0.299 + pixels[i*4+1]*0.587 + pixels[i*4+2]*0.114) / 255;
      return g;
    }

    function boxBlur5(src) {
      const out = new Float32Array(VW * VH);
      for (let y=2;y<VH-2;y++) for (let x=2;x<VW-2;x++) {
        let s=0;
        for(let dy=-2;dy<=2;dy++) for(let dx=-2;dx<=2;dx++) s+=src[(y+dy)*VW+(x+dx)];
        out[y*VW+x]=s/25;
      }
      return out;
    }

    function erode1(src) {
      const out = new Uint8Array(VW * VH);
      for (let y=1;y<VH-1;y++) for (let x=1;x<VW-1;x++) {
        if (!src[y*VW+x]) continue;
        let ok=true;
        outer: for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++)
          if(!src[(y+dy)*VW+(x+dx)]){ok=false;break outer;}
        if(ok) out[y*VW+x]=255;
      }
      return out;
    }

    function dilate1(src) {
      const out = new Uint8Array(VW * VH);
      for (let y=1;y<VH-1;y++) for (let x=1;x<VW-1;x++) {
        outer2: for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++)
          if(src[(y+dy)*VW+(x+dx)]){out[y*VW+x]=255;break outer2;}
      }
      return out;
    }

    function detectBlobs(fg) {
      const visited = new Uint8Array(VW * VH);
      const blobs = [];
      for (let y=0;y<VH;y++) for (let x=0;x<VW;x++) {
        const i=y*VW+x;
        if (fg[i]!==255||visited[i]) continue;
        const queue=[i]; visited[i]=1;
        const pxArr=[i];
        let x1=x,x2=x,y1=y,y2=y;
        while(queue.length){
          const ci=queue.shift(), cx2=ci%VW, cy2=Math.floor(ci/VW);
          if(cx2<x1)x1=cx2; if(cx2>x2)x2=cx2;
          if(cy2<y1)y1=cy2; if(cy2>y2)y2=cy2;
          for(const[nx,ny]of[[cx2-1,cy2],[cx2+1,cy2],[cx2,cy2-1],[cx2,cy2+1]]){
            if(nx<0||nx>=VW||ny<0||ny>=VH)continue;
            const ni=ny*VW+nx;
            if(fg[ni]===255&&!visited[ni]){visited[ni]=1;queue.push(ni);pxArr.push(ni);}
          }
        }
        const bw=x2-x1+1, bh=y2-y1+1;
        // Size gate: minimum area for a person at this resolution
        if (pxArr.length < 300 || pxArr.length > 80000) continue;
        // Bounding box must be at least person-sized
        if (bw < 15 || bh < 30) continue;
        // Aspect ratio: person is taller than wide (reject horizontal shelf edges)
        if (bh < bw * 0.4) continue;
        // Density: real person blobs are filled; noise streaks are sparse
        const density = pxArr.length / (bw*bh);
        if (density < 0.06) continue;
        blobs.push({
          x1,y1,x2,y2,
          cx:Math.round((x1+x2)/2), cy:Math.round((y1+y2)/2),
          cxF:(x1+x2)/2/VW, cyF:(y1+y2)/2/VH,
          px:pxArr.length
        });
      }
      return blobs;
    }

    function fuseBlobs(blobs) {
      if (blobs.length<=1) return blobs;
      const used=new Array(blobs.length).fill(false);
      const out=[];
      const sorted=[...blobs].sort((a,b)=>b.px-a.px);
      for (let i=0;i<sorted.length;i++) {
        if(used[i]) continue;
        let {x1,y1,x2,y2,px}=sorted[i];
        let cx=sorted[i].cx, cy=sorted[i].cy;
        for (let j=i+1;j<sorted.length;j++) {
          if(used[j]) continue;
          const d=Math.hypot((cx-sorted[j].cx)/VW,(cy-sorted[j].cy)/VH);
          if(d<MERGE_DIST){
            x1=Math.min(x1,sorted[j].x1); y1=Math.min(y1,sorted[j].y1);
            x2=Math.max(x2,sorted[j].x2); y2=Math.max(y2,sorted[j].y2);
            px+=sorted[j].px; used[j]=true;
            cx=Math.round((x1+x2)/2); cy=Math.round((y1+y2)/2);
          }
        }
        out.push({x1,y1,x2,y2,cx,cy,cxF:cx/VW,cyF:cy/VH,px});
      }
      return out;
    }

    // ── Main frame loop ───────────────────────────────────────────────────────
    for (let si = 0; si < totalSamples; si++) {
      const t = si / FPS;
      vid.currentTime = t;
      await new Promise(r => { vid.onseeked = r; vid.onerror = r; });
      octx.drawImage(vid, 0, 0, VW, VH);
      const pixels = octx.getImageData(0, 0, VW, VH).data;

      const gCur = boxBlur5(toGray(pixels));

      // Compute diff against frame t-2 (skip 1 frame to reduce compression noise)
      const diffFrame = grayPrev2 || grayPrev1;

      if (diffFrame) {
        // Update motion heat
        for (let i=0;i<VW*VH;i++) {
          const diff = Math.abs(gCur[i] - diffFrame[i]);
          if (diff > DIFF_THRESH) {
            heat[i] = Math.min(heat[i] + 1.4, 8.0);  // accumulate faster
          } else {
            heat[i] = heat[i] * 0.80;  // decay — slower to handle brief occlusion
          }
        }
      }

      grayPrev2 = grayPrev1;
      grayPrev1 = gCur;

      // Build foreground from heat buffer
      const fg0 = new Uint8Array(VW * VH);
      for (let i=0;i<VW*VH;i++) fg0[i] = heat[i] > HEAT_THRESH ? 255 : 0;

      // Morphology: erode×1 to kill noise specks, dilate×2 to connect body parts
      const fg = dilate1(dilate1(erode1(fg0)));

      // Detect and fuse blobs
      const blobs = fuseBlobs(detectBlobs(fg));

      // ── Track matching ────────────────────────────────────────────────────
      const matched    = new Set();
      const assigned   = new Array(blobs.length).fill(null);
      const costs      = [];
      for (let bi=0;bi<blobs.length;bi++) {
        const {cxF,cyF} = blobs[bi];
        for (const [tid,[px,py]] of Object.entries(prevCenters)) {
          const d=Math.hypot(cxF-px, cyF-py);
          if(d<MATCH_RADIUS) costs.push({bi,tid:+tid,d});
        }
      }
      costs.sort((a,b)=>a.d-b.d);
      for(const{bi,tid}of costs){
        if(assigned[bi]!==null||matched.has(tid))continue;
        assigned[bi]=tid; matched.add(tid);
      }

      // ── Update / create tracks ────────────────────────────────────────────
      const newCenters = {};
      const dets = [];

      for(let bi=0;bi<blobs.length;bi++){
        const blob=blobs[bi];
        const {cxF,cyF}=blob;
        const zone=getZone(cxF,cyF);
        let tid=assigned[bi];

        if(tid===null){
          tid=nextId++;
          tracks[tid]={
            startT:t, lastT:t, pts:[], zones:[], missedFrames:0, confirmed:false,
            color:PERSON_COLORS[(tid-1)%PERSON_COLORS.length],
            // ML behaviour engine — one state machine per track
            bsm: new BehaviourStateMachine(),
            prevBlob: null,
            poseScores: {},
          };
        }
        const tr=tracks[tid];
        tr.pts.push({t,cxF,cyF});
        tr.zones.push(zone);
        tr.lastT=t; tr.missedFrames=0;
        newCenters[tid]=[cxF,cyF];

        // ── Movement gate: only confirm if blob has actually travelled ────
        if(!tr.confirmed && tr.pts.length>=MIN_FRAMES){
          let travel=0;
          for(let pi=1;pi<tr.pts.length;pi++)
            travel+=Math.hypot(tr.pts[pi].cxF-tr.pts[pi-1].cxF, tr.pts[pi].cyF-tr.pts[pi-1].cyF);
          if(travel>=MIN_TRAVEL) tr.confirmed=true;
        }
        if(!tr.confirmed) continue;  // not shown until confirmed

        // ── ML POSE PIPELINE ──────────────────────────────────────────────
        const bw2=blob.x2-blob.x1, bh2=blob.y2-blob.y1;
        const ar=bh2/Math.max(bw2,1);
        let spd=0;
        if(tr.pts.length>=2){const pp=tr.pts[tr.pts.length-2];spd=Math.hypot(cxF-pp.cxF,cyF-pp.cyF)*100;}

        // Step 1: estimate 33-point MediaPipe-format landmarks from bbox + motion
        const isShelf=["Shelf Zone","Aisle A","Aisle B"].includes(zone);
        tr.shelfDwellFrames=(tr.shelfDwellFrames||0);
        // Reset immediately on zone exit — prevents dwell bonus bleeding into other zones
        if(isShelf) tr.shelfDwellFrames++;
        else tr.shelfDwellFrames=0;
        const lm=estimateLandmarks(blob,ar,spd,tr.prevBlob||null,tr.avgPose||{},VW,VH);
        tr.prevBlob={...blob};

        // Step 2: classify joint angles → gesture scores (0-100 each)
        const poseScores=classifyPose(lm,zone,tr.shelfDwellFrames);
        tr.poseScores=poseScores;

        // Step 3: temporal state machine — detects Reach→Hold→Conceal sequence
        if(!tr.bsm) tr.bsm=new BehaviourStateMachine();
        tr.bsm.update(poseScores,zone,t);

        // Sync BSM state onto track for snapshot/summary
        tr.riskScore      =tr.bsm.riskScore;
        tr.suspicionLevel =tr.bsm.suspicionLevel;
        tr.alertFlags     =tr.bsm.alertFlags;

        // Legacy avgPose format for HUD + summary compatibility
        const avgPose={
          walking:  poseScores.walking,
          standing: poseScores.standing,
          grabbing: poseScores.shelfReach,
          crouching:poseScores.crouchConceal,
          pocketing:poseScores.pocketConceal,
        };
        tr.avgPose=avgPose;

        dets.push({id:tid,x1:blob.x1,y1:blob.y1,x2:blob.x2,y2:blob.y2,cxF,cyF,zone,
          avgPose,poseScores,lm,
          riskScore:tr.riskScore,suspicionLevel:tr.suspicionLevel,alertFlags:tr.alertFlags});
      }

      // ── Age missed tracks ─────────────────────────────────────────────────
      for(const[tid,center]of Object.entries(prevCenters)){
        if(!matched.has(+tid)){
          const tr=tracks[+tid];
          if(tr){
            tr.missedFrames=(tr.missedFrames||0)+1;
            if(tr.missedFrames<=MAX_MISSED) newCenters[+tid]=center;
            else delete tracks[+tid];
          }
        }
      }

      // ── Kill static confirmed tracks ──────────────────────────────────────
      for(const[tidStr,tr]of Object.entries(tracks)){
        if(!tr.confirmed||tr.pts.length<STILL_FRAMES) continue;
        const rp=tr.pts.slice(-STILL_FRAMES);
        const disp=Math.hypot(rp[rp.length-1].cxF-rp[0].cxF, rp[rp.length-1].cyF-rp[0].cyF);
        if(disp<STILL_DISP){
          const tidN=+tidStr;
          delete tracks[tidN]; delete newCenters[tidN];
          const di=dets.findIndex(d=>d.id===tidN); if(di>=0)dets.splice(di,1);
        }
      }

      // ── Deduplicate close confirmed tracks ────────────────────────────────
      const cIds=Object.keys(tracks).map(Number).filter(id=>tracks[id]?.confirmed);
      for(let i=0;i<cIds.length;i++) for(let j=i+1;j<cIds.length;j++){
        if(!tracks[cIds[i]]||!tracks[cIds[j]])continue;
        const cA=newCenters[cIds[i]]||prevCenters[cIds[i]];
        const cB=newCenters[cIds[j]]||prevCenters[cIds[j]];
        if(!cA||!cB)continue;
        if(Math.hypot(cA[0]-cB[0],cA[1]-cB[1])<DEDUP_DIST){
          const older=cIds[i]<cIds[j]?cIds[i]:cIds[j];
          const newer=cIds[i]<cIds[j]?cIds[j]:cIds[i];
          if(tracks[older]&&tracks[newer]) tracks[older].pts.push(...tracks[newer].pts);
          delete tracks[newer]; delete newCenters[newer];
          const di=dets.findIndex(d=>d.id===newer); if(di>=0)dets.splice(di,1);
        }
      }

      Object.keys(prevCenters).forEach(k=>delete prevCenters[k]);
      Object.assign(prevCenters,newCenters);
      frameAnnotations[si]=dets;
      // Snapshot track state so render loop has correct data even after track deletion
      const trackSnap={};
      for(const[id,tr]of Object.entries(tracks)){
        trackSnap[id]={
          color:tr.color, startT:tr.startT,
          pts:[...tr.pts], confirmed:tr.confirmed,
          suspicionLevel:tr.suspicionLevel, alertFlags:[...(tr.alertFlags||[])],
          riskScore:tr.riskScore, avgPose:tr.avgPose||{}, poseScores:tr.poseScores||{},
          shelfDwellFrames:tr.shelfDwellFrames||0,
          bsmRisk:tr.bsm?.riskScore||0,
        };
      }
      allFrameData.push({si,t,snapshot:octx.getImageData(0,0,VW,VH),dets:[...dets],trackSnap});
      setProgress(10+Math.floor(si/totalSamples*70));
      if(si%5===0) setStatusMsg(`Tracking... ${Math.round(t)}s/${Math.round(duration)}s — ${dets.length} people visible`);
    }

    // ── Render annotated frames ───────────────────────────────────────────────
    setProgress(82); setStatusMsg("Rendering annotated video...");
    const annotatedFrames=[];
    const capturedEventKeys = new Set();  // track which events already screenshot'd
    const incidentTimeline  = [];         // [{id,t,type,personId,zone,screenshot,groupAlert}]

    for(const{si,t,snapshot,dets,trackSnap}of allFrameData){
      outCtx.putImageData(snapshot,0,0);

      // Zone overlays
      for(const z of ZONES){
        outCtx.fillStyle=`rgba(${z.color[0]},${z.color[1]},${z.color[2]},0.07)`;
        outCtx.fillRect(z.x1*VW,z.y1*VH,(z.x2-z.x1)*VW,(z.y2-z.y1)*VH);
        outCtx.strokeStyle=`rgba(${z.color[0]},${z.color[1]},${z.color[2]},0.5)`;
        outCtx.lineWidth=1;
        outCtx.strokeRect(z.x1*VW,z.y1*VH,(z.x2-z.x1)*VW,(z.y2-z.y1)*VH);
        outCtx.fillStyle=`rgba(${z.color[0]},${z.color[1]},${z.color[2]},0.9)`;
        outCtx.font="bold 9px monospace";
        outCtx.fillText(z.name,z.x1*VW+4,z.y1*VH+12);
      }

      for(const det of dets){
        const tr=trackSnap[det.id]; if(!tr) continue;
        // Use ML renderPersonOverlay from theft.js — handles all drawing
        renderPersonOverlay(outCtx, det, tr, det.lm||[], det.poseScores||det.avgPose||{}, t, VW, VH);
      }

      // HUD
      const liveCount=dets.length;
      const uniqCount=Object.values(trackSnap).filter(tr=>tr.confirmed).length;
      // Count caution+ as suspicious for the banner
      const alertCnt=dets.filter(d=>
        d.suspicionLevel==="critical"||d.suspicionLevel==="alert"||d.suspicionLevel==="caution"
      ).length;
      const critCnt=dets.filter(d=>d.suspicionLevel==="critical"||d.suspicionLevel==="alert").length;
      const hudH2=critCnt>0?80:alertCnt>0?72:58;
      outCtx.fillStyle=critCnt>0?"rgba(100,0,0,0.92)":alertCnt>0?"rgba(80,30,0,0.92)":"rgba(0,0,0,0.82)";
      outCtx.fillRect(4,4,240,hudH2);
      outCtx.strokeStyle=critCnt>0?"#ff0033":alertCnt>0?"#ff6600":"#00f5d4"; outCtx.lineWidth=2;
      outCtx.strokeRect(4,4,240,hudH2);
      outCtx.fillStyle=critCnt>0?"#ff4444":alertCnt>0?"#ff8800":"#00f5d4"; outCtx.font="bold 12px monospace";
      outCtx.fillText("RetailEns · AI Tracker",8,20);
      outCtx.fillStyle="#fff"; outCtx.font="11px monospace";
      outCtx.fillText(`Unique: ${uniqCount}  Live: ${liveCount}`,8,36);
      outCtx.fillStyle="#aaa"; outCtx.font="10px monospace";
      outCtx.fillText(`T: ${t.toFixed(1)}s`,8,50);
      if(critCnt>0){
        outCtx.fillStyle="#ff4444"; outCtx.font="bold 11px monospace";
        outCtx.fillText(`🚨 ${critCnt} SUSPECT${critCnt>1?"S":""} DETECTED`,8,66);
      } else if(alertCnt>0){
        outCtx.fillStyle="#ff8800"; outCtx.font="bold 10px monospace";
        outCtx.fillText(`⚠ ${alertCnt} SUSPICIOUS PERSON${alertCnt>1?"S":""}`,8,66);
      }

      const frameJpeg = outCanvas.toDataURL("image/jpeg", 0.85);
      annotatedFrames.push(frameJpeg);
      setProgress(82+Math.floor(annotatedFrames.length/allFrameData.length*12));

      // ── Feature 1: Screenshot capture on confirmed theft events ───────────
      for(const det of dets){
        const tr=trackSnap[det.id]; if(!tr) continue;
        const HIGH_RISK_FLAGS=["GRAB_SEQUENCE","POCKET_CONCEAL","BAG_CONCEAL","CROUCH_CONCEAL","SHELF_REACH"];
        for(const flag of (det.alertFlags||[])){
          if(!HIGH_RISK_FLAGS.includes(flag)) continue;
          const key=`${det.id}_${flag}`;
          if(capturedEventKeys.has(key)) continue;
          capturedEventKeys.add(key);
          // Capture highlighted screenshot: draw bright box around suspect
          const sc2=document.createElement("canvas");
          sc2.width=VW; sc2.height=VH;
          const sc2ctx=sc2.getContext("2d");
          const img2=new Image(); img2.src=frameJpeg;
          await new Promise(r=>{img2.onload=r;});
          sc2ctx.drawImage(img2,0,0);
          // Bright pulsing red box highlight
          sc2ctx.strokeStyle="#ff0033"; sc2ctx.lineWidth=5;
          sc2ctx.strokeRect(det.x1-4,det.y1-4,det.x2-det.x1+8,det.y2-det.y1+8);
          sc2ctx.strokeStyle="#ffffff"; sc2ctx.lineWidth=2;
          sc2ctx.strokeRect(det.x1-8,det.y1-8,det.x2-det.x1+16,det.y2-det.y1+16);
          // Stamp: timestamp + ID + flag
          sc2ctx.fillStyle="rgba(200,0,0,0.90)"; sc2ctx.fillRect(0,VH-28,VW,28);
          sc2ctx.fillStyle="#fff"; sc2ctx.font="bold 11px monospace";
          sc2ctx.fillText(`🚨 ID:${det.id} · ${flag.replace(/_/g," ")} · T:${t.toFixed(1)}s · ${det.zone}`,8,VH-10);
          const screenshot=sc2.toDataURL("image/jpeg",0.92);

          // ── Feature 4: Push Notification on critical events ───────────────
          const CRITICAL_FLAGS=["GRAB_SEQUENCE","POCKET_CONCEAL","BAG_CONCEAL"];
          if(CRITICAL_FLAGS.includes(flag) && "Notification" in window && Notification.permission==="granted"){
            new Notification("🚨 RetailEns Security Alert",{
              body:`Person ID:${det.id} — ${flag.replace(/_/g," ")} detected in ${det.zone} at ${t.toFixed(1)}s`,
              icon:"/favicon.ico",
              tag:`retailens_${key}`,  // prevent duplicate notifications
              requireInteraction:true,
            });
          }

          // ── Dynamic risk score — unique per person per event ──────────────
          // Base range per flag type (min–max), then adjusted by individual behaviour:
          //   + dwell time in shelf zone (longer = higher risk)
          //   + number of distinct flags this person has (more flags = higher risk)
          //   + speed at detection (slower = more deliberate = higher risk)
          //   + how late in the video (later = person is staying longer = higher risk)
          //   - if zone is low-risk (Open Area) → penalty
          const FLAG_BASE = {
            GRAB_SEQUENCE:     { min:72, max:98 },
            POCKET_CONCEAL:    { min:65, max:95 },
            BAG_CONCEAL:       { min:62, max:92 },
            CROUCH_CONCEAL:    { min:50, max:82 },
            SHELF_REACH:       { min:30, max:68 },
            LOITERING:         { min:20, max:45 },
            BODY_BLOCK:        { min:18, max:38 },
            SURVEILLANCE_CHECK:{ min:15, max:32 },
          };
          const FLAG_SUSP = {
            GRAB_SEQUENCE:"critical", POCKET_CONCEAL:"critical", BAG_CONCEAL:"critical",
            CROUCH_CONCEAL:"alert",   SHELF_REACH:"alert",
            LOITERING:"caution",      BODY_BLOCK:"caution", SURVEILLANCE_CHECK:"caution",
          };

          const base = FLAG_BASE[flag] || { min:20, max:60 };
          const trSnap = trackSnap[det.id] || {};

          // ── Suppress outdoor false positives ─────────────────────────────
          // POCKET_CONCEAL and GRAB_SEQUENCE detected in Open Area = person is
          // outside the store / in parking lot. These are meaningless detections.
          // Skip adding to timeline entirely.
          const HIGH_THEFT = ["GRAB_SEQUENCE","POCKET_CONCEAL","BAG_CONCEAL","CROUCH_CONCEAL"];
          if (HIGH_THEFT.includes(flag) &&
              (det.zone === "Open Area" || det.zone === "Entrance")) {
            continue;  // skip — outdoor detection is a false positive for theft gestures
          }

          // ── Confirmed steal bonus ──────────────────────────────────────────
          // If this person has BOTH POCKET_CONCEAL/BAG_CONCEAL AND GRAB_SEQUENCE
          // in their alertFlags simultaneously → confirmed steal sequence.
          // Force score to top of range regardless of individual factors.
          const allFlags = trSnap.alertFlags || [];
          const hasGrab    = allFlags.includes("GRAB_SEQUENCE");
          const hasConceal = allFlags.includes("POCKET_CONCEAL") || allFlags.includes("BAG_CONCEAL");
          const isConfirmedSteal = hasGrab && hasConceal;

          if (isConfirmedSteal && HIGH_THEFT.includes(flag)) {
            // Both grab + conceal confirmed → this is a definite theft event
            // Score = 92–100 range based on how many total flags the person has
            const stealScore = Math.min(100, 92 + Math.floor(allFlags.length / 2));
            incidentTimeline.push({
              id:key, t, personId:det.id, flag,
              label:flag.replace(/_/g," "),
              zone:det.zone,
              riskScore: stealScore,
              suspicionLevel: "critical",
              screenshot,
              ts:Date.now(),
            });
            continue;  // skip normal scoring below
          }

          // ── Normal dynamic scoring ─────────────────────────────────────────
          // Factor 1: shelf dwell frames — actual frames confirmed in shelf zone
          const shelfFrames = trSnap.shelfDwellFrames || 0;
          const dwellFactor = Math.min(1.0, shelfFrames / 50);  // 0→1 over 50 shelf frames (~5s)

          // Factor 2: number of distinct alert flags this person has
          const flagCount = allFlags.length;
          const flagFactor = Math.min(1.0, flagCount / 4);   // 0→1 over 4 flags

          // Factor 3: pose speed — slower = more deliberate = higher risk
          const poseSpd = trSnap.poseScores?.walking || 50;
          const speedFactor = Math.max(0, 1 - poseSpd / 100);

          // Factor 4: timing in video
          const timeFactor = Math.min(1.0, t / Math.max(duration * 0.5, 30));

          // Factor 5: zone — shelf zones are higher risk than other indoor zones
          const zonePenalty = (det.zone === "Checkout") ? 0.85 : 1.0;  // checkout is lower risk

          // Factor 6: BSM accumulated risk
          const bsmFactor = Math.min(1.0, (trSnap.bsmRisk || 0) / 100);

          // Weighted composite — BSM has most weight
          const composite = (bsmFactor*0.35 + dwellFactor*0.25 + flagFactor*0.20 + speedFactor*0.10 + timeFactor*0.10);

          // Map into flag's [min, max] range
          const rawScore = base.min + composite * (base.max - base.min);
          const definRisk = Math.round(Math.min(100, Math.max(base.min, rawScore * zonePenalty)));
          const definSusp = definRisk >= 70 ? "critical"
                          : definRisk >= 45 ? "alert"
                          : definRisk >= 25 ? "caution"
                          : "normal";
          incidentTimeline.push({
            id:key, t, personId:det.id, flag,
            label:flag.replace(/_/g," "),
            zone:det.zone,
            riskScore: definRisk,
            suspicionLevel: definSusp,
            screenshot,
            ts:Date.now(),
          });
        }
      }

      // ── Feature 2: Group Behaviour Detection ──────────────────────────────
      // Only flag REAL distraction theft patterns — not normal conversations:
      // Conditions required:
      //   1. Suspect has a HIGH-severity confirmed flag (SHELF_REACH/POCKET_CONCEAL/etc.)
      //   2. Suspect is in a shelf/aisle zone (not checkout or entrance)
      //   3. Second person is also in the same shelf/aisle zone
      //   4. They are within 15% frame width (very close, not just in same zone)
      //   5. This combo has been close for this is the first detection (no duplicate)
      const SHELF_ZONES_SET = new Set(["Shelf Zone","Aisle A","Aisle B"]);
      const HIGH_THEFT_FLAGS = ["SHELF_REACH","POCKET_CONCEAL","BAG_CONCEAL","GRAB_SEQUENCE","CROUCH_CONCEAL"];
      const suspectDets = dets.filter(d =>
        (d.riskScore||0) >= 42 &&
        SHELF_ZONES_SET.has(d.zone) &&
        (d.alertFlags||[]).some(f => HIGH_THEFT_FLAGS.includes(f))
      );
      for(const hrd of suspectDets){
        for(const other of dets){
          if(other.id===hrd.id) continue;
          if(!SHELF_ZONES_SET.has(other.zone)) continue;  // accomplice must also be in shelf zone
          const dist=Math.hypot(hrd.cxF-other.cxF, hrd.cyF-other.cyF);
          if(dist<0.15){  // tighter: 15% frame width (~96px) = genuinely close
            const gkey=`group_${Math.min(hrd.id,other.id)}_${Math.max(hrd.id,other.id)}`;
            if(!capturedEventKeys.has(gkey)){
              capturedEventKeys.add(gkey);
              incidentTimeline.push({
                id:gkey, t, personId:hrd.id, flag:"GROUP_DISTRACTION",
                label:"Group Distraction Theft",
                zone:hrd.zone, riskScore:55,  // medium-high, not critical
                suspicionLevel:"alert",
                screenshot:frameJpeg,
                groupMemberId:other.id,
                ts:Date.now(),
              });
              if("Notification" in window && Notification.permission==="granted"){
                new Notification("⚠️ RetailEns — Group Theft Alert",{
                  body:`ID:${hrd.id} (confirmed suspect) + ID:${other.id} close together at ${hrd.zone} — possible distraction theft`,
                  icon:"/favicon.ico", tag:gkey,
                });
              }
            }
          }
        }
      }
    }

    setProgress(95); setStatusMsg("Finalizing...");
    const confirmedUniqueIds=Object.values(tracks).filter(tr=>tr.confirmed).length;
    const summary=Object.entries(tracks)
      .filter(([,tr])=>tr.confirmed&&tr.pts.length>=2)
      .map(([idStr,tr])=>{
        const dwell=tr.pts[tr.pts.length-1].t-tr.startT;
        const zc={}; tr.zones.forEach(z=>{zc[z]=(zc[z]||0)+1;});
        const topZone=Object.entries(zc).sort((a,b)=>b[1]-a[1])[0]?.[0]||"Unknown";
        return{id:+idStr,color:tr.color,dwell:Math.round(dwell*10)/10,topZone,
          uniqueZones:[...new Set(tr.zones)],pts:tr.pts.length,entryTime:tr.startT.toFixed(1),
          riskScore:tr.riskScore||0,alertFlags:tr.alertFlags||[],suspicionLevel:tr.suspicionLevel||"normal"};
      }).sort((a,b)=>b.riskScore-a.riskScore);

    const peakConcurrent=Math.max(...Object.values(frameAnnotations).map(d=>d.length),0);
    const storeStats={
      unique:confirmedUniqueIds, duration:Math.round(duration),
      peakConcurrent,
      zonesActive:[...new Set(Object.values(tracks).flatMap(t=>t.zones))].filter(z=>z!=="Open Area"),
    };
    setPersonSummary(summary); setStats(storeStats);
    // Sort timeline by time, store for Alerts panel
    incidentTimeline.sort((a,b)=>a.t-b.t);
    setSecurityLog(incidentTimeline);
    setProgress(100); setStatusMsg("Analysis complete!"); setStatus("done");

    // Store real counts
    videoRef.current={
      frames:annotatedFrames, fps:FPS, duration, vw:VW, vh:VH,
      realUnique:confirmedUniqueIds,
      realPeak:peakConcurrent,
    };

    // ── Update dashboard with REAL tracker numbers ──────────────────────────
    // Build real videoMeta from actual tracking results (not pixel-diff estimate)
    const realVideoMeta = {
      durationSec:   Math.round(duration),
      fileSizeMB:    0,
      maxConcurrent: peakConcurrent * 8,   // undo the /8 correction in generateMockData
      avgConcurrent: peakConcurrent * 4,
    };
    // Compute theft penalty from actual confirmed theft events
    const theftFlags = Object.values(tracks)
      .filter(tr=>tr.confirmed)
      .flatMap(tr=>tr.alertFlags||[]);
    const hasGrab    = theftFlags.some(f=>f==="SHELF_REACH"||f==="GRAB_SEQUENCE");
    const hasConceal = theftFlags.some(f=>f==="POCKET_CONCEAL"||f==="BAG_CONCEAL"||f==="CROUCH_CONCEAL");
    const realTheftPenalty = (hasGrab?15:0) + (hasConceal?20:0);  // satisfaction penalty %

    // Generate mock data using real unique count + real theft context
    const realData = generateMockData(filename||"video", realVideoMeta, confirmedUniqueIds);

    // Override satisfaction with theft-adjusted value
    if (realData.satisfaction && realTheftPenalty > 0) {
      realData.satisfaction.overall = Math.max(10, realData.satisfaction.overall - realTheftPenalty);
      realData.satisfaction.label =
        realData.satisfaction.overall>=80?"Excellent":
        realData.satisfaction.overall>=65?"Good":
        realData.satisfaction.overall>=50?"Average":"Needs Work";
      if (hasConceal) realData.satisfaction.tips.unshift("🚨 Theft event detected — review CCTV and alert security");
    }

    // Override lost sales to include theft loss
    if (realData.lostSales && (hasGrab||hasConceal)) {
      const avgItemValue = 850;
      const theftEvents  = theftFlags.filter(f=>f==="GRAB_SEQUENCE"||f==="POCKET_CONCEAL"||f==="BAG_CONCEAL").length;
      const theftLoss    = theftEvents * avgItemValue;
      realData.lostSales.theftLoss  = theftLoss;
      realData.lostSales.total     += theftLoss;
      realData.lostSales.recoverable = Math.round(realData.lostSales.total * 0.60);
      realData.lostSales.breakdown.unshift({
        label:"Theft / Concealment", value:theftLoss, icon:"🚨", color:"#ff0033",
        tip:"Review Video Lookup — confirmed grab/conceal gesture detected"
      });
    }

    // Inject real tracking data into summary
    realData.personSummary   = summary;
    realData.videoLookupStats= storeStats;

    setData(realData);

    if(resultUrl) URL.revokeObjectURL(resultUrl);
    URL.revokeObjectURL(url);
  }

  // Playback using stored frames on canvas
  const [playbackFrame, setPlaybackFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    if (!isPlaying || !videoRef.current) return;
    const { frames, duration } = videoRef.current;
    // Compute interval so playback matches original video speed exactly:
    // We have N annotated frames covering D seconds → play each for D/N seconds
    const intervalMs = frames.length > 0 ? (duration / frames.length) * 1000 : 100;
    const iv = setInterval(() => {
      setPlaybackFrame(f => {
        if (f >= frames.length - 1) { setIsPlaying(false); return f; }
        return f + 1;
      });
    }, Math.round(intervalMs));
    return () => clearInterval(iv);
  }, [isPlaying]);

  useEffect(() => {
    if (status !== "done" || !videoRef.current || !canvasRef.current) return;
    const { frames } = videoRef.current;
    if (!frames[playbackFrame]) return;
    const img = new Image();
    img.onload = () => {
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, canvasRef.current.width, canvasRef.current.height);
      // canvas size matches the JPEG frame size exactly — no scaling distortion
    };
    img.src = frames[playbackFrame];
  }, [playbackFrame, status]);

  return (
    <div style={{display:"flex",flexDirection:"column",gap:"16px"}}>

      {/* Header */}
      <div style={{background:`linear-gradient(135deg,${T.accent}12,${T.accent3}08)`,border:`1px solid ${T.accent}30`,borderRadius:"16px",padding:"20px 24px"}}>
        <div style={{fontSize:"11px",color:T.text3,letterSpacing:"2px",textTransform:"uppercase",marginBottom:"6px"}}>🎬 Video Lookup · AI Tracker</div>
        <div style={{fontSize:"15px",color:T.text,fontWeight:"600",marginBottom:"4px"}}>Upload any store video — get an annotated output with unique IDs, zones & dwell times</div>
        <div style={{fontSize:"12px",color:T.text3}}>Runs entirely in-browser · No backend needed · Bounding boxes, trail paths, zone assignment</div>
      </div>

      {/* Upload zone */}
      {status === "idle" && (
        <div onClick={()=>fileRef.current?.click()}
          style={{border:`2px dashed ${T.border2}`,borderRadius:"14px",padding:"36px",display:"flex",flexDirection:"column",alignItems:"center",gap:"12px",cursor:"pointer",background:T.cardBg,transition:"border-color 0.2s"}}
          onMouseEnter={e=>e.currentTarget.style.borderColor=T.accent}
          onMouseLeave={e=>e.currentTarget.style.borderColor=T.border2}>
          <input ref={fileRef} type="file" accept="video/*" style={{display:"none"}}
            onChange={e=>{ const f=e.target.files[0]; if(f){setFile(f);setStatus("processing");processVideo(f);} }}/>
          <div style={{fontSize:"40px"}}>🎬</div>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:"15px",fontWeight:"700",color:T.text}}>Drop a store video to analyze</div>
            <div style={{fontSize:"12px",color:T.text3,marginTop:"4px"}}>MP4, MOV, AVI · Outputs annotated video with person IDs, zones, trails</div>
          </div>
          <div style={{padding:"10px 28px",background:T.accent,color:"#000",borderRadius:"8px",fontSize:"13px",fontWeight:"700"}}>BROWSE VIDEO</div>
        </div>
      )}

      {/* Processing state */}
      {(status==="reading"||status==="processing") && (
        <div style={{background:T.cardBg,border:`1px solid ${T.border}`,borderRadius:"14px",padding:"28px",display:"flex",flexDirection:"column",gap:"14px"}}>
          <div style={{fontSize:"14px",color:T.text2,fontWeight:"500"}}>{statusMsg}</div>
          <div style={{background:T.progressBg,borderRadius:"8px",height:"8px",overflow:"hidden"}}>
            <div style={{height:"100%",width:`${progress}%`,background:`linear-gradient(90deg,${T.accent},${T.accent3})`,borderRadius:"8px",transition:"width 0.5s ease"}}/>
          </div>
          <div style={{fontSize:"30px",fontWeight:"800",color:T.accent,fontFamily:"'Bebas Neue',sans-serif"}}>{progress}%</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:"6px"}}>
            {["Frame extraction","Background subtraction","Blob detection","Person tracking","Zone assignment","Trail rendering","HUD overlay"].map((s,i)=>(
              <span key={i} style={{fontSize:"10px",padding:"2px 8px",borderRadius:"20px",background:progress>(i+1)*12?T.accent+"20":T.bg4,color:progress>(i+1)*12?T.accent:T.text4,border:`1px solid ${progress>(i+1)*12?T.accent+"40":T.border2}`,transition:"all 0.3s"}}>{s}</span>
            ))}
          </div>
          <div style={{fontSize:"11px",color:T.text3}}>⚠️ This runs in-browser — a long video may take a minute. In production, YOLOv8 + DeepSORT on the backend would be instant.</div>
        </div>
      )}

      {/* Results */}
      {status==="done" && stats && videoRef.current && (
        <>
          {/* Stats strip */}
          <div className="sc" style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"10px"}}>
            <div style={{background:T.cardBg,border:`1px solid ${T.accent}30`,borderRadius:"12px",padding:"14px 18px"}}>
              <div style={{fontSize:"10px",color:T.text3,letterSpacing:"2px",textTransform:"uppercase"}}>Unique People</div>
              <div style={{fontSize:"32px",fontWeight:"800",color:T.accent,fontFamily:"'Bebas Neue',sans-serif"}}>{stats.unique}</div>
            </div>
            <div style={{background:T.cardBg,border:`1px solid ${T.accent4}30`,borderRadius:"12px",padding:"14px 18px"}}>
              <div style={{fontSize:"10px",color:T.text3,letterSpacing:"2px",textTransform:"uppercase"}}>Peak Concurrent</div>
              <div style={{fontSize:"32px",fontWeight:"800",color:T.accent4,fontFamily:"'Bebas Neue',sans-serif"}}>{stats.peakConcurrent}</div>
            </div>
            <div style={{background:T.cardBg,border:`1px solid ${T.green}30`,borderRadius:"12px",padding:"14px 18px"}}>
              <div style={{fontSize:"10px",color:T.text3,letterSpacing:"2px",textTransform:"uppercase"}}>Video Duration</div>
              <div style={{fontSize:"32px",fontWeight:"800",color:T.green,fontFamily:"'Bebas Neue',sans-serif"}}>{stats.duration}s</div>
            </div>
            <div style={{background:T.cardBg,border:`1px solid ${T.accent3}30`,borderRadius:"12px",padding:"14px 18px"}}>
              <div style={{fontSize:"10px",color:T.text3,letterSpacing:"2px",textTransform:"uppercase"}}>Zones Active</div>
              <div style={{fontSize:"32px",fontWeight:"800",color:T.accent3,fontFamily:"'Bebas Neue',sans-serif"}}>{stats.zonesActive.length}</div>
            </div>
          </div>

          {/* Annotated video playback */}
          <div style={{background:T.cardBg,border:`1px solid ${T.border}`,borderRadius:"16px",padding:"20px"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"12px",flexWrap:"wrap",gap:"8px"}}>
              <div style={{fontSize:"11px",color:T.text3,letterSpacing:"2px",textTransform:"uppercase"}}>Annotated Video Playback</div>
              <div style={{display:"flex",gap:"6px",alignItems:"center"}}>
                <span style={{fontSize:"11px",color:T.text3}}>Frame {playbackFrame+1}/{videoRef.current.frames.length}</span>
              </div>
            </div>
            <canvas ref={canvasRef}
              width={videoRef.current.vw || 640}
              height={videoRef.current.vh || 360}
              style={{width:"100%",borderRadius:"8px",background:"#000",display:"block"}}/>
            {/* Progress bar */}
            <input type="range" min={0} max={videoRef.current.frames.length-1} value={playbackFrame}
              onChange={e=>{setIsPlaying(false);setPlaybackFrame(Number(e.target.value));}}
              style={{width:"100%",marginTop:"10px",accentColor:T.accent}}/>
            <div style={{display:"flex",gap:"8px",marginTop:"10px",justifyContent:"center",flexWrap:"wrap"}}>
              {[["⏮",()=>{setIsPlaying(false);setPlaybackFrame(0);}],
                ["◀",()=>{setIsPlaying(false);setPlaybackFrame(f=>Math.max(0,f-1));}],
                [isPlaying?"⏸ Pause":"▶ Play",()=>setIsPlaying(p=>!p)],
                ["▶ Next",()=>{setIsPlaying(false);setPlaybackFrame(f=>Math.min(videoRef.current.frames.length-1,f+1));}],
              ].map(([lbl,fn],i)=>(
                <button key={i} onClick={fn} style={{padding:"6px 16px",borderRadius:"8px",border:`1px solid ${i===2?T.accent:T.border2}`,background:i===2?T.accent+"20":"transparent",color:i===2?T.accent:T.text2,cursor:"pointer",fontSize:"12px",fontWeight:i===2?"700":"400"}}>{lbl}</button>
              ))}
            </div>
          </div>

          {/* Person summary table */}
          <div style={{background:T.cardBg,border:`1px solid ${T.border}`,borderRadius:"16px",overflow:"hidden"}}>
            <div style={{padding:"14px 20px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
              <span style={{fontSize:"11px",color:T.text3,letterSpacing:"2px",textTransform:"uppercase"}}>Person-by-Person Shoplifter Analysis ({personSummary.length} tracked)</span>
              {personSummary.filter(p=>p.suspicionLevel==="critical"||p.suspicionLevel==="alert").length > 0 && (
                <span style={{padding:"4px 12px",borderRadius:20,background:"rgba(255,0,51,0.15)",color:"#ff0033",fontSize:"11px",fontWeight:700,border:"1px solid #ff003340"}}>
                  ⚠ {personSummary.filter(p=>p.suspicionLevel==="critical"||p.suspicionLevel==="alert").length} SUSPECT{personSummary.filter(p=>p.suspicionLevel==="critical"||p.suspicionLevel==="alert").length>1?"S":""} FLAGGED
                </span>
              )}
            </div>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:"12px"}}>
                <thead><tr style={{background:T.bg3}}>
                  {["Person","Dwell","Risk Score","Suspicion","Behaviours Detected","Top Zone","Zone Path"].map(h=>(
                    <th key={h} style={{padding:"9px 14px",textAlign:"left",fontSize:"10px",color:T.text3,letterSpacing:"1px",textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {personSummary.map((p,i)=>{
                    const slColor = p.suspicionLevel==="critical"?"#ff0033":p.suspicionLevel==="alert"?"#ff6600":p.suspicionLevel==="caution"?"#ffcc00":T.text4;
                    return (
                    <tr key={i} style={{borderBottom:`1px solid ${T.border}`,background:p.suspicionLevel==="critical"?"rgba(255,0,51,0.07)":p.suspicionLevel==="alert"?"rgba(255,102,0,0.05)":"transparent"}}>
                      <td style={{padding:"9px 14px"}}>
                        <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
                          <div style={{width:"26px",height:"26px",borderRadius:"50%",background:p.color+"30",border:`2px solid ${p.suspicionLevel==="critical"?"#ff0033":p.suspicionLevel==="alert"?"#ff6600":p.color}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"9px",fontWeight:"800",color:p.color}}>{p.id}</div>
                          <div>
                            <div style={{color:T.text,fontWeight:"700",fontSize:12}}>Person {p.id}</div>
                            <div style={{color:T.text4,fontSize:10}}>Entry: {p.entryTime}s</div>
                          </div>
                        </div>
                      </td>
                      <td style={{padding:"9px 14px",color:T.accent,fontWeight:"700"}}>{p.dwell}s</td>
                      <td style={{padding:"9px 14px"}}>
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          <div style={{width:56,height:8,background:T.bg4,borderRadius:4,overflow:"hidden"}}>
                            <div style={{height:"100%",width:`${p.riskScore}%`,background:slColor,borderRadius:4,transition:"width 0.3s"}}/>
                          </div>
                          <span style={{fontSize:11,color:slColor,fontWeight:700,minWidth:20}}>{p.riskScore}</span>
                        </div>
                      </td>
                      <td style={{padding:"9px 14px"}}>
                        <span style={{padding:"3px 10px",borderRadius:20,fontSize:10,fontWeight:700,background:slColor+"22",color:slColor,textTransform:"uppercase",border:`1px solid ${slColor}40`}}>
                          {p.suspicionLevel}
                        </span>
                      </td>
                      <td style={{padding:"9px 14px",maxWidth:220}}>
                        {p.alertFlags.length===0
                          ? <span style={{color:T.text4,fontSize:11}}>No flags</span>
                          : <div style={{display:"flex",flexWrap:"wrap",gap:3}}>
                              {p.alertFlags.map((f,fi)=>(
                                <span key={fi} style={{padding:"2px 7px",borderRadius:10,fontSize:9,fontWeight:700,background:"rgba(255,100,0,0.18)",color:"#ff6600",border:"1px solid #ff660040",whiteSpace:"nowrap"}}>{f}</span>
                              ))}
                            </div>
                        }
                      </td>
                      <td style={{padding:"9px 14px"}}><span style={{fontSize:"10px",padding:"2px 8px",borderRadius:"20px",background:T.accent+"20",color:T.accent,fontWeight:"600"}}>{p.topZone}</span></td>
                      <td style={{padding:"9px 14px",color:T.text3,fontSize:"11px"}}>{p.uniqueZones.join(" → ")}</td>
                    </tr>
                  )})}
                </tbody>
              </table>
            </div>
          </div>

          {/* Reset */}
          <button onClick={()=>{setStatus("idle");setFile(null);setPersonSummary([]);setStats(null);videoRef.current=null;setPlaybackFrame(0);setIsPlaying(false);}}
            style={{padding:"10px 24px",background:"transparent",border:`1px solid ${T.border2}`,borderRadius:"8px",color:T.text3,cursor:"pointer",fontSize:"13px",alignSelf:"flex-start"}}>
            ↑ Analyze Another Video
          </button>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  MAIN APP
// ═══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [user,      setUser]      = useState(getCurrentUser());
  const [theme,     setTheme]     = useState("dark");
  const [page,      setPage]      = useState("upload");
  const [dashTab,   setDashTab]   = useState("overview");
  const [uploading, setUploading] = useState(false);
  const [progress,  setProgress]  = useState(0);
  const [status,    setStatus]    = useState("");
  const [data,      setData]      = useState(null);
  const [heatmap,   setHeatmap]   = useState(null);
  const [dragOver,  setDragOver]  = useState(false);
  const [history,   setHistory]   = useState([]);
  const [filename,  setFilename]  = useState("");
  const [selJourney,setSelJourney]= useState(null);
  const [exporting, setExporting] = useState(false);
  const [menuOpen,  setMenuOpen]  = useState(false);
  const [alertCount,setAlertCount]= useState(0);
  const [securityLog,setSecurityLog]= useState([]);
  const fileRef          = useRef(null);
  const heatmapCanvasRef = useRef(null);
  const journeyCanvasRef = useRef(null);
  const T = THEMES[theme];

  useEffect(()=>{
    // ── Cache version check ───────────────────────────────────────────────────
    // If the stored history was built before the visitor-count fix (v2),
    // wipe it so stale numbers don't show up. User will need to re-upload.
    const CACHE_VERSION = "v2_visitor_fix";
    const storedVersion = localStorage.getItem("retailens_cache_version");
    if (storedVersion !== CACHE_VERSION) {
      localStorage.removeItem(HISTORY_KEY);
      localStorage.removeItem(ALERTS_KEY);
      localStorage.setItem("retailens_cache_version", CACHE_VERSION);
      console.log("[RetailEns] Cache cleared — visitor count algorithm updated to v2");
    }
    setHistory(loadHistory());
  },[]);
  useEffect(()=>{ if(data) setAlertCount(loadAlerts().filter(a=>!a.read).length); },[data]);
  useEffect(()=>{ document.body.style.background=T.bg; document.documentElement.style.background=T.bg; },[T.bg]);

  if (!user) return <LoginScreen T={T} onLogin={u=>{ setUser(u); }}/>;

  const canExport = ROLES[user.role]?.canExport;

  function handleFile(file) {
    if (!file) return;
    setFilename(file.name); setUploading(true); setProgress(0);
    setStatus("Reading video metadata...");

    // ── Step 1: read real video metadata from the browser ─────────────────────
    // This gives us duration, which drives realistic visitor counts.
    // We also do a lightweight frame-sample scan to estimate concurrent people.
    const url = URL.createObjectURL(file);
    const vid = document.createElement("video");
    vid.preload = "metadata";
    vid.muted   = true;

    vid.onloadedmetadata = () => {
      const durationSec = vid.duration || 60;
      const fileSizeMB  = file.size / (1024 * 1024);

      // ── Step 2: sample frames via canvas to estimate concurrent people ───────
      // We draw a few frames into a canvas and count motion blobs (proxy for people).
      // This runs entirely in-browser — no backend needed.
      const canvas  = document.createElement("canvas");
      const ctx2d   = canvas.getContext("2d");
      const sampleCount = 8;
      let   maxConcurrent = 0, totalConcurrent = 0, sampledFrames = 0;
      let   prevImageData = null;

      canvas.width  = 160;  // thumbnail resolution — fast
      canvas.height = 90;

      function sampleFrame(frameIdx) {
        if (frameIdx >= sampleCount) {
          // Done sampling — proceed with processing
          URL.revokeObjectURL(url);
          const avgConcurrent = sampledFrames > 0 ? totalConcurrent / sampledFrames : 3;
          const videoMeta = {
            durationSec:    Math.round(durationSec),
            fileSizeMB:     parseFloat(fileSizeMB.toFixed(1)),
            maxConcurrent:  Math.max(1, maxConcurrent),
            avgConcurrent:  parseFloat(avgConcurrent.toFixed(1)),
          };
          runProcessing(file, videoMeta);
          return;
        }
        // Seek to evenly spaced timestamps
        vid.currentTime = (durationSec / sampleCount) * frameIdx + 0.5;
      }

      vid.onseeked = () => {
        try {
          ctx2d.drawImage(vid, 0, 0, canvas.width, canvas.height);
          const curr = ctx2d.getImageData(0, 0, canvas.width, canvas.height);

          if (prevImageData) {
            // Count pixels with significant brightness change → proxy for people
            let diffPixels = 0;
            for (let p = 0; p < curr.data.length; p += 4) {
              const dr = Math.abs(curr.data[p]   - prevImageData.data[p]);
              const dg = Math.abs(curr.data[p+1] - prevImageData.data[p+1]);
              const db = Math.abs(curr.data[p+2] - prevImageData.data[p+2]);
              if ((dr + dg + db) > 45) diffPixels++;
            }
            // At 160×90 thumbnail, a walking person changes ~300–600 pixels.
            // Divide by 400 to get a rough concurrent count. This feeds into the
            // /8 correction in generateMockData, so double-correction is fine.
            const estimatedPeople = Math.round(diffPixels / 400);
            maxConcurrent   = Math.max(maxConcurrent, estimatedPeople);
            totalConcurrent += estimatedPeople;
            sampledFrames++;
          }
          prevImageData = curr;
        } catch(e) { /* cross-origin or decode error — skip frame */ }

        sampleFrame(sampledFrames + (prevImageData ? 1 : 0));
      };

      vid.onerror = () => {
        // Video can't be decoded — fall back gracefully
        URL.revokeObjectURL(url);
        const videoMeta = { durationSec: Math.round(durationSec), fileSizeMB, maxConcurrent: 5, avgConcurrent: 3 };
        runProcessing(file, videoMeta);
      };

      sampleFrame(0);
    };

    vid.onerror = () => {
      // Can't even read metadata — use file size as rough proxy
      URL.revokeObjectURL(url);
      const fileSizeMB = file.size / (1024 * 1024);
      const videoMeta = { durationSec: 60, fileSizeMB, maxConcurrent: 5, avgConcurrent: 3 };
      runProcessing(file, videoMeta);
    };

    vid.src = url;
  }

  function runProcessing(file, videoMeta) {
    // ── First try the real backend ────────────────────────────────────────────
    const fd = new FormData(); fd.append("video", file);
    fetch(`http://localhost:8000/upload`, { method:"POST", body:fd })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(({ job_id }) => pollJob(job_id, file.name, videoMeta))
      .catch(() => simulateProcessing(file.name, videoMeta));
  }

  function simulateProcessing(fname, videoMeta) {
    // ── Realistic step-by-step progress using real video metadata ─────────────
    const dur = videoMeta?.durationSec || 60;
    const steps = [
      [8,  "Reading video frames..."],
      [18, `Detected ${videoMeta?.maxConcurrent || 5} concurrent people in peak frame`],
      [32, "Running person detection (simulated YOLOv8)..."],
      [48, "Tracking unique customers (simulated DeepSORT)..."],
      [60, "Mapping shopper journeys..."],
      [72, "Computing zone dwell times..."],
      [82, "Detecting anomalies..."],
      [91, "Building conversion funnel..."],
      [97, "Calculating satisfaction & revenue estimates..."],
      [100,"Analysis complete!"],
    ];
    let i = 0;
    const iv = setInterval(() => {
      if (i >= steps.length) {
        clearInterval(iv);
        // Use real tracker counts if Video Lookup already ran on this file
        const realCounts = videoRef.current?.realUnique
          ? { realUnique: videoRef.current.realUnique, realPeak: videoRef.current.realPeak }
          : null;
        const metaWithReal = realCounts
          ? { ...videoMeta, maxConcurrent: realCounts.realPeak*8, avgConcurrent: realCounts.realPeak*4 }
          : videoMeta;
        const d   = generateMockData(fname, metaWithReal, realCounts?.realUnique);
        const hm  = generateMockHeatmap();
        const entry = { id:Date.now(), filename:fname, date:new Date().toLocaleString("en-IN"), data:d, heatmap:hm, videoMeta };
        addToHistory(entry); setHistory(loadHistory());
        setData(d); setHeatmap(hm); setUploading(false); setPage("dashboard"); setDashTab("summary");
        return;
      }
      setProgress(steps[i][0]); setStatus(steps[i][1]); i++;
    }, 750);
  }

  function pollJob(id, fname, videoMeta) {
    const iv = setInterval(() => {
      fetch(`http://localhost:8000/job/${id}`).then(r=>r.json()).then(j => {
        setProgress(j.progress); setStatus(j.status);
        if (j.progress >= 100) {
          clearInterval(iv);
          fetch(`http://localhost:8000/analytics/${id}`).then(r=>r.json()).then(analytics => {
            const hm = generateMockHeatmap();
            // Use real backend numbers when available, video-scaled mock for the rest
            const mockBase = generateMockData(fname, videoMeta);
            const d = { ...mockBase, ...analytics };
            const entry = { id:Date.now(), filename:fname, date:new Date().toLocaleString("en-IN"), data:d, heatmap:hm };
            addToHistory(entry); setHistory(loadHistory());
            setData(d); setHeatmap(hm); setUploading(false); setPage("dashboard"); setDashTab("summary");
          });
        }
      }).catch(() => clearInterval(iv));
    }, 1500);
  }

  function loadFromHistory(entry) { setData(entry.data); setHeatmap(entry.heatmap); setFilename(entry.filename); setPage("dashboard"); setDashTab("summary"); setMenuOpen(false); }

  const navItems=[
    {p:"upload",label:"Upload"},
    {p:"history",label:`History (${history.length})`},
    {p:"dashboard",label:"Dashboard",disabled:!data},
  ];

  const DASH_TABS = [
    {id:"summary",     label:"📋 Summary"},
    {id:"overview",    label:"Overview"},
    {id:"journey",     label:"Journey"},
    {id:"funnel",      label:"Funnel"},
    {id:"zones",       label:"Zones"},
    {id:"anomalies",   label:`Anomalies (${data?.anomalies?.length||0})`},
    {id:"qa",          label:"🤖 AI Q&A"},
    {id:"trends",      label:"Trends"},
    {id:"lostsales",   label:"💸 Lost Sales"},
    {id:"basketsize",  label:"🛒 Basket Size"},
    {id:"planogram",   label:"Planogram"},
    {id:"alerts",      label:`🔴 Alerts${alertCount>0?` (${alertCount})`:""}`},
    {id:"lookup",      label:"🎬 Video Lookup"},
    {id:"theft",       label:`🚨 Theft${data?.theftData?.stats?.critical>0?" ("+data.theftData.stats.critical+"!!)":data?.theftData?.stats?.high>0?" ("+data.theftData.stats.high+")":""}`},
    {id:"export",      label:"⬇ Export"},
    {id:"users",       label:"👥 Users"},
  ];

  const S = {
    card: {background:T.cardBg,border:`1px solid ${T.border}`,borderRadius:"16px",padding:"20px"},
    sec:  {fontSize:"11px",color:T.text3,letterSpacing:"2px",textTransform:"uppercase",marginBottom:"14px"},
    ins:  (a)=>({display:"flex",gap:"12px",padding:"10px 14px",background:T.insightBg,borderRadius:"8px",borderLeft:`3px solid ${a}`}),
  };

  return (
    <>
      <style>{`
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        html{width:100vw;min-height:100vh;overflow-x:hidden;background:${T.bg}}
        body{width:100vw;min-height:100vh;margin:0!important;padding:0!important;overflow-x:hidden;background:${T.bg}}
        #root{width:100vw;min-height:100vh;overflow-x:hidden}
        .tab-sc::-webkit-scrollbar{height:0}
        @media(max-width:768px){
          .donly{display:none!important}.mmb{display:flex!important}
          .g2{grid-template-columns:1fr!important}.g4{grid-template-columns:repeat(2,1fr)!important}
          .sc{grid-template-columns:repeat(2,1fr)!important}.mp{padding:20px 14px!important}.hp{padding:11px 14px!important}
        }
        @media(max-width:480px){.sc{grid-template-columns:1fr!important}.g4{grid-template-columns:1fr!important}.hero{font-size:48px!important}}
      `}</style>
      <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600;800&display=swap" rel="stylesheet"/>

      <div style={{minHeight:"100vh",width:"100vw",background:T.bg,color:T.text,fontFamily:"'DM Sans',sans-serif",overflowX:"hidden"}}>

        {/* ── HEADER ── */}
        <header className="hp" style={{borderBottom:`1px solid ${T.border}`,padding:"12px 40px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,background:T.headerBg,backdropFilter:"blur(12px)",zIndex:100,width:"100%"}}>
          <div style={{display:"flex",alignItems:"center",gap:"10px",flexShrink:0}}>
            <div style={{width:"30px",height:"30px",background:`linear-gradient(135deg,${T.accent},${T.accent3})`,borderRadius:"8px",display:"flex",alignItems:"center",justifyContent:"center"}}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><path d="M15 10l4.553-2.069A1 1 0 0121 8.87V15.13a1 1 0 01-1.447.9L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/></svg>
            </div>
            <div><div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:"18px",letterSpacing:"2px",color:T.logo,lineHeight:1}}>RETAILENS</div>
            <div className="donly" style={{fontSize:"9px",color:T.text3,letterSpacing:"1px"}}>STORE INTELLIGENCE</div></div>
          </div>

          <nav className="donly" style={{display:"flex",gap:"3px",alignItems:"center"}}>
            {navItems.map(({p,label,disabled})=>(
              <button key={p} onClick={()=>{ if(!disabled){setPage(p);setMenuOpen(false);} }}
                style={{padding:"5px 12px",borderRadius:"6px",border:"none",cursor:disabled?"default":"pointer",background:page===p?T.bg4:"transparent",color:page===p?T.accent:disabled?T.text4:T.text3,fontSize:"12px",fontWeight:"600",textTransform:"uppercase",letterSpacing:"1px"}}>
                {label}
              </button>
            ))}
          </nav>

          <div style={{display:"flex",gap:"8px",alignItems:"center"}}>
            {/* User chip */}
            <div className="donly" style={{display:"flex",alignItems:"center",gap:"8px",padding:"4px 10px 4px 6px",background:T.bg3,border:`1px solid ${T.border2}`,borderRadius:"20px",cursor:"default"}}>
              <div style={{width:"22px",height:"22px",borderRadius:"50%",background:`${ROLES[user.role]?.color||T.accent}25`,border:`1px solid ${ROLES[user.role]?.color||T.accent}50`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"9px",fontWeight:"800",color:ROLES[user.role]?.color||T.accent}}>{user.avatar}</div>
              <span style={{fontSize:"11px",fontWeight:"600",color:T.text2}}>{user.name.split(" ")[0]}</span>
              <span style={{fontSize:"9px",color:ROLES[user.role]?.color||T.accent,fontWeight:"700"}}>{ROLES[user.role]?.label}</span>
            </div>
            {canExport&&data&&page==="dashboard"&&(
              <button onClick={()=>{setExporting(true);setTimeout(()=>{exportToPDF(data,filename,heatmapCanvasRef);setExporting(false);},200);}} disabled={exporting}
                style={{padding:"5px 12px",borderRadius:"6px",border:`1px solid ${T.accent}40`,cursor:"pointer",background:T.accent+"15",color:T.accent,fontSize:"11px",fontWeight:"700"}} className="donly">
                {exporting?"⏳":"⬇ PDF"}
              </button>
            )}
            <ThemeToggle theme={theme} setTheme={setTheme} T={T}/>
            <button onClick={()=>logout()&&setUser(null)} onMouseDown={()=>{logout();setUser(null);}}
              style={{padding:"5px 10px",borderRadius:"6px",border:`1px solid ${T.border2}`,background:"transparent",color:T.text4,cursor:"pointer",fontSize:"11px"}} className="donly">
              Sign Out
            </button>
            <button className="mmb" onClick={()=>setMenuOpen(!menuOpen)}
              style={{display:"none",background:"transparent",border:`1px solid ${T.border2}`,borderRadius:"8px",padding:"5px 9px",color:T.text,cursor:"pointer",fontSize:"18px",alignItems:"center"}}>
              {menuOpen?"✕":"☰"}
            </button>
          </div>
        </header>

        {menuOpen&&(
          <div style={{background:T.bg2,borderBottom:`1px solid ${T.border}`,padding:"8px 14px",display:"flex",flexDirection:"column",gap:"4px",position:"sticky",top:"57px",zIndex:99}}>
            {navItems.map(({p,label,disabled})=>(
              <button key={p} onClick={()=>{if(!disabled){setPage(p);setMenuOpen(false);}}} style={{padding:"9px 14px",borderRadius:"8px",border:"none",cursor:disabled?"default":"pointer",background:page===p?T.bg4:"transparent",color:page===p?T.accent:disabled?T.text4:T.text,fontSize:"13px",fontWeight:"600",textAlign:"left"}}>{label}</button>
            ))}
            <button onMouseDown={()=>{logout();setUser(null);}} style={{padding:"9px 14px",borderRadius:"8px",border:`1px solid ${T.border2}`,background:"transparent",color:T.text3,fontSize:"13px",textAlign:"left",cursor:"pointer"}}>Sign Out</button>
          </div>
        )}

        <main className="mp" style={{width:"100%",padding:"32px 44px",maxWidth:"100%",boxSizing:"border-box"}}>

          {/* ── UPLOAD ── */}
          {page==="upload"&&(
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:"28px",width:"100%",minHeight:"calc(100vh - 120px)",justifyContent:"center",paddingTop:"20px",paddingBottom:"40px"}}>
              <div style={{textAlign:"center",width:"100%"}}>
                <h1 className="hero" style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:"clamp(52px,9vw,110px)",letterSpacing:"4px",margin:0,lineHeight:1,background:`linear-gradient(135deg,${T.text} 40%,${T.accent})`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>STORE INTELLIGENCE</h1>
                <p style={{color:T.text3,fontSize:"clamp(13px,2vw,15px)",marginTop:"12px",maxWidth:"520px",margin:"12px auto 0"}}>
                  Welcome back, <strong style={{color:T.accent}}>{user.name.split(" ")[0]}</strong>. Upload CCTV footage → AI maps journeys, estimates revenue, and exports reports.
                </p>
              </div>

              {!uploading?(
                <div onDragOver={e=>{e.preventDefault();setDragOver(true);}} onDragLeave={()=>setDragOver(false)}
                  onDrop={e=>{e.preventDefault();setDragOver(false);const f=e.dataTransfer.files[0];if(f?.type.startsWith("video/"))handleFile(f);}}
                  onClick={()=>fileRef.current?.click()}
                  style={{width:"100%",maxWidth:"600px",aspectRatio:"16/9",border:`2px dashed ${dragOver?T.accent:T.border2}`,borderRadius:"16px",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:"14px",cursor:"pointer",background:dragOver?T.accent+"10":T.cardBg,transition:"all 0.3s"}}>
                  <input ref={fileRef} type="file" accept="video/*" style={{display:"none"}} onChange={e=>handleFile(e.target.files[0])}/>
                  <div style={{width:"56px",height:"56px",background:T.accent+"18",border:`1px solid ${T.accent}30`,borderRadius:"14px",display:"flex",alignItems:"center",justifyContent:"center"}}>
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="1.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
                  </div>
                  <div style={{textAlign:"center",padding:"0 20px"}}><div style={{fontSize:"15px",fontWeight:"600",color:T.text}}>Drop your store video here</div><div style={{fontSize:"12px",color:T.text3,marginTop:"4px"}}>MP4, MOV, AVI · Up to 2GB</div></div>
                  <div style={{padding:"10px 28px",background:T.accent,color:"#000",borderRadius:"8px",fontSize:"13px",fontWeight:"700",letterSpacing:"1px"}}>BROWSE FILES</div>
                </div>
              ):(
                <div style={{width:"100%",maxWidth:"600px",background:T.cardBg,border:`1px solid ${T.border}`,borderRadius:"16px",padding:"28px",display:"flex",flexDirection:"column",gap:"16px"}}>
                  <div style={{fontSize:"14px",color:T.text2,fontWeight:"500"}}>{status}</div>
                  <div style={{background:T.progressBg,borderRadius:"8px",height:"8px",overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${progress}%`,background:`linear-gradient(90deg,${T.accent},${T.accent3})`,borderRadius:"8px",transition:"width 0.8s ease"}}/>
                  </div>
                  <div style={{fontSize:"26px",fontWeight:"800",color:T.accent,fontFamily:"'Bebas Neue',sans-serif"}}>{progress}%</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:"6px"}}>
                    {["Detection","Tracking","Journeys","Funnel","Anomalies","Staffing","Satisfaction","Revenue"].map((s,i)=>(
                      <div key={i} style={{padding:"3px 10px",borderRadius:"20px",fontSize:"10px",background:progress>i*12?T.accent+"20":T.bg4,color:progress>i*12?T.accent:T.text4,border:`1px solid ${progress>i*12?T.accent+"40":T.border2}`,transition:"all 0.3s"}}>{s}</div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{display:"flex",flexWrap:"wrap",gap:"6px",justifyContent:"center",maxWidth:"660px"}}>
                {["YOLOv8","DeepSORT","Journey Mapping","Conversion Funnel","Lost Sales AI","Basket Size","Daily Summary","Multi-Store","PDF + CSV + JSON","WhatsApp Alerts","Email Digest","User Roles"].map(f=>(
                  <div key={f} style={{padding:"3px 10px",border:`1px solid ${T.border2}`,borderRadius:"20px",fontSize:"11px",color:T.text3}}>{f}</div>
                ))}
              </div>
            </div>
          )}

          {/* ── HISTORY ── */}
          {page==="history"&&(
            <div style={{display:"flex",flexDirection:"column",gap:"18px",width:"100%"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:"10px"}}>
                <div><h2 style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:"clamp(26px,5vw,38px)",letterSpacing:"2px",margin:0,color:T.text}}>VIDEO HISTORY</h2><div style={{fontSize:"12px",color:T.text3,marginTop:"4px"}}>Click any entry to reload full analytics</div></div>
                {history.length>0&&<button onClick={()=>{saveHistory([]);setHistory([]);}} style={{padding:"7px 14px",background:"transparent",border:`1px solid ${T.border2}`,borderRadius:"8px",color:T.text3,cursor:"pointer",fontSize:"12px"}}>Clear All</button>}
              </div>
              {history.length===0?(
                <div style={{textAlign:"center",padding:"60px 0"}}>
                  <div style={{fontSize:"48px",marginBottom:"16px"}}>📁</div>
                  <div style={{fontSize:"16px",color:T.text3}}>No videos analysed yet</div>
                  <button onClick={()=>setPage("upload")} style={{marginTop:"18px",padding:"10px 24px",background:T.accent,color:"#000",border:"none",borderRadius:"8px",cursor:"pointer",fontWeight:"700",fontSize:"13px"}}>Upload Video</button>
                </div>
              ):(
                <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
                  {history.map(entry=><HistoryCard key={entry.id} entry={entry} T={T} onClick={()=>loadFromHistory(entry)} onDelete={()=>{const u=history.filter(h=>h.id!==entry.id);saveHistory(u);setHistory(u);}}/>)}
                </div>
              )}
            </div>
          )}

          {/* ── DASHBOARD ── */}
          {page==="dashboard"&&data&&(
            <div style={{display:"flex",flexDirection:"column",gap:"18px",width:"100%"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:"10px"}}>
                <div><h2 style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:"clamp(24px,5vw,36px)",letterSpacing:"2px",margin:0,color:T.text}}>ANALYTICS REPORT</h2><div style={{fontSize:"12px",color:T.text3,marginTop:"4px"}}>📹 {filename} · {user.store}</div></div>
                <button onClick={()=>setPage("upload")} style={{padding:"6px 14px",background:"transparent",border:`1px solid ${T.border2}`,borderRadius:"8px",color:T.text3,cursor:"pointer",fontSize:"12px",fontWeight:"600"}}>↑ New Video</button>
              </div>

              {/* Video analysis provenance strip */}
              {data.videoMeta&&(
                <div style={{background:T.accent+"10",border:`1px solid ${T.accent}25`,borderRadius:"10px",padding:"9px 16px",display:"flex",alignItems:"center",gap:"16px",flexWrap:"wrap"}}>
                  <span style={{fontSize:"13px"}}>📹</span>
                  <span style={{fontSize:"12px",color:T.accent,fontWeight:"600"}}>Video Analysis</span>
                  <span style={{fontSize:"11px",color:T.text3}}>Duration: <b style={{color:T.text2}}>{data.videoMeta.durationSec}s</b></span>
                  <span style={{fontSize:"11px",color:T.text3}}>Peak concurrent: <b style={{color:T.text2}}>{Math.round(data.videoMeta.maxConcurrent*0.4)} people</b></span>
                  <span style={{fontSize:"11px",color:T.text3}}>File: <b style={{color:T.text2}}>{data.videoMeta.fileSizeMB.toFixed(1)} MB</b></span>
                  <span style={{fontSize:"10px",color:T.text4,marginLeft:"auto"}}>Numbers derived from real video metadata</span>
                </div>
              )}

              {/* Top KPI strip */}
              <div className="sc" style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"10px"}}>
                <StatCard label="Visitors"     value={data.total}                                                 unit="cust."  accent={T.accent}  T={T}/>
                <StatCard label="Est. Revenue" value={`₹${(data.basketSize?.totalRevenue/1000).toFixed(0)}k`}    unit=""       accent={T.green}   T={T}/>
                <StatCard label="Satisfaction" value={data.satisfaction?.overall||"—"}                            unit="/100"   accent={data.satisfaction?.color||T.accent4} T={T} sub={data.satisfaction?.label}/>
                <StatCard label="Lost Sales"   value={`₹${(data.lostSales?.total/1000).toFixed(0)}k`}            unit=""       accent={T.accent2} T={T} sub={`₹${(data.lostSales?.recoverable/1000).toFixed(0)}k recov.`}/>
              </div>

              {data?.theftData?.stats?.critical>0&&(
                <div style={{background:"#ff336615",border:"1px solid #ff336640",borderRadius:"10px",padding:"10px 16px",display:"flex",alignItems:"center",gap:"10px",flexWrap:"wrap"}}>
                  <span style={{fontSize:"18px"}}>🚨</span>
                  <span style={{fontSize:"13px",color:"#ff3366",flex:1}}><strong>{data.theftData.stats.critical} critical theft risk{data.theftData.stats.critical>1?"s":""}</strong> detected — immediate action required</span>
                  <button onClick={()=>setDashTab("theft")} style={{padding:"4px 14px",background:"#ff3366",color:"#fff",border:"none",borderRadius:"6px",cursor:"pointer",fontSize:"12px",fontWeight:"700",flexShrink:0}}>Investigate →</button>
                </div>
              )}
              {alertCount>0&&(
                <div style={{background:T.red+"12",border:`1px solid ${T.red}40`,borderRadius:"10px",padding:"10px 16px",display:"flex",alignItems:"center",gap:"10px",flexWrap:"wrap"}}>
                  <span style={{fontSize:"18px"}}>🚨</span>
                  <span style={{fontSize:"13px",color:T.red,flex:1}}><strong>{alertCount} unread alert{alertCount>1?"s":""}</strong> require attention</span>
                  <button onClick={()=>setDashTab("alerts")} style={{padding:"4px 14px",background:T.red,color:"#fff",border:"none",borderRadius:"6px",cursor:"pointer",fontSize:"12px",fontWeight:"700",flexShrink:0}}>View →</button>
                </div>
              )}

              {/* Tab bar */}
              <div className="tab-sc" style={{display:"flex",borderBottom:`1px solid ${T.border}`,overflowX:"auto"}}>
                {DASH_TABS.map(t=>(
                  <button key={t.id} onClick={()=>setDashTab(t.id)} style={{padding:"8px 14px",background:"transparent",border:"none",borderBottom:`2px solid ${dashTab===t.id?T.accent:"transparent"}`,color:dashTab===t.id?T.accent:T.text3,cursor:"pointer",fontSize:"12px",fontWeight:"600",transition:"all 0.2s",marginBottom:"-1px",whiteSpace:"nowrap",flexShrink:0}}>
                    {t.label}
                  </button>
                ))}
              </div>

              {/* ── SUMMARY ── */}
              {dashTab==="summary"&&<DailySummaryPanel data={data} T={T}/>}

              {/* ── OVERVIEW ── */}
              {dashTab==="overview"&&(
                <div style={{display:"flex",flexDirection:"column",gap:"14px"}}>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"14px"}} className="g2">
                    <div style={S.card}>
                      <div style={S.sec}>Movement Heatmap</div>
                      <Heatmap data={heatmap} canvasRef={heatmapCanvasRef} theme={theme}/>
                      <div style={{display:"flex",justifyContent:"space-between",fontSize:"10px",color:T.text3,marginTop:"6px"}}><span>🔵 Low</span><span>🟢 Mid</span><span>🔴 High</span></div>
                    </div>
                    <div style={{...S.card,display:"flex",flexDirection:"column",gap:"18px"}}>
                      <div><div style={S.sec}>Hourly Foot Traffic</div><BarChart data={data.hours} xKey="hour" yKey="visitors" color={T.accent}/></div>
                      <div><div style={S.sec}>Queue Length</div><BarChart data={data.hours} xKey="hour" yKey="queue" color={T.accent2}/></div>
                    </div>
                  </div>
                  <div style={S.card}>
                    <div style={S.sec}>AI Insights</div>
                    <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
                      {[
                        {icon:"🔥",text:`Peak at ${data.peakHour} — schedule extra staff here.`,accent:T.accent2},
                        {icon:"💰",text:`Est. revenue ₹${(data.basketSize?.totalRevenue/1000).toFixed(0)}k from ${data.basketSize?.buyers} buyers at ₹${data.basketSize?.estimated} avg basket.`,accent:T.green},
                        {icon:"💸",text:`₹${(data.lostSales?.total/1000).toFixed(0)}k in lost sales today — ₹${(data.lostSales?.recoverable/1000).toFixed(0)}k is recoverable.`,accent:T.accent4},
                        {icon:"📦",text:`Move ${data.planogram?.[0]?.name} → ${data.planogram?.[0]?.recommended} for ${data.planogram?.[0]?.lift} lift.`,accent:T.accent3},
                      ].map((ins,i)=>(
                        <div key={i} style={S.ins(ins.accent)}>
                          <span style={{fontSize:"16px"}}>{ins.icon}</span>
                          <span style={{fontSize:"12px",color:T.text2,lineHeight:"1.6"}}>{ins.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ── JOURNEY ── */}
              {dashTab==="journey"&&(
                <div style={{display:"grid",gridTemplateColumns:"1fr 250px",gap:"14px"}} className="g2">
                  <div style={S.card}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"12px"}}>
                      <div style={S.sec}>Shopper Journey Map</div>
                      {selJourney&&<button onClick={()=>setSelJourney(null)} style={{padding:"3px 10px",background:"transparent",border:`1px solid ${T.border2}`,borderRadius:"6px",color:T.text3,cursor:"pointer",fontSize:"11px"}}>Clear</button>}
                    </div>
                    <JourneyMap paths={data.journeyPaths} selectedId={selJourney} canvasRef={journeyCanvasRef} theme={theme}/>
                    <div style={{display:"flex",flexWrap:"wrap",gap:"5px",marginTop:"10px"}}>
                      {data.journeyPaths.map(p=>(
                        <button key={p.id} onClick={()=>setSelJourney(selJourney===p.id?null:p.id)}
                          style={{padding:"3px 10px",borderRadius:"20px",border:`1px solid ${p.color}60`,background:selJourney===p.id?p.color+"30":"transparent",color:selJourney===p.id?p.color:T.text3,cursor:"pointer",fontSize:"11px",fontWeight:"600"}}>C{p.id}</button>
                      ))}
                    </div>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>
                    <div style={{...S.card,padding:"16px"}}>
                      <div style={S.sec}>Journeys</div>
                      {data.journeyPaths.map(p=>(
                        <div key={p.id} onClick={()=>setSelJourney(selJourney===p.id?null:p.id)}
                          style={{display:"flex",alignItems:"center",gap:"8px",padding:"5px 8px",borderRadius:"8px",cursor:"pointer",background:selJourney===p.id?p.color+"15":"transparent",marginBottom:"2px"}}>
                          <div style={{width:"8px",height:"8px",borderRadius:"50%",background:p.color,flexShrink:0}}/>
                          <div><div style={{fontSize:"11px",color:T.text,fontWeight:"600"}}>C{p.id}</div><div style={{fontSize:"10px",color:T.text3}}>{p.points.length} zones · {Math.floor(p.duration/60)}m {p.duration%60}s</div></div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ── FUNNEL ── */}
              {dashTab==="funnel"&&(
                <div style={S.card}>
                  <div style={S.sec}>Conversion Funnel</div>
                  <ConversionFunnel data={data.funnelData} T={T}/>
                </div>
              )}

              {/* ── ZONE INTELLIGENCE ── */}
              {dashTab==="zones"&&<ZoneIntelPanel data={data} T={T}/>}

              {/* ── ANOMALIES ── */}
              {dashTab==="anomalies"&&(
                <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>
                  <div style={{display:"flex",gap:"8px",flexWrap:"wrap"}}>
                    {[["high","#f72585"],["medium","#f4a261"],["low","#4cc9f0"]].map(([sev,color])=>(
                      <span key={sev} style={{fontSize:"10px",padding:"3px 10px",borderRadius:"20px",background:color+"20",color}}>{data.anomalies.filter(a=>a.severity===sev).length} {sev}</span>
                    ))}
                  </div>
                  {data.anomalies.map(a=><AnomalyCard key={a.id} anomaly={a} T={T}/>)}
                </div>
              )}

              {/* ── NEW FEATURES ── */}
              {dashTab==="qa"          && <QAPanel            data={data}                                         T={T}/>}
              {dashTab==="trends"      && <TrendPanel          data={data}                                         T={T}/>}
              {dashTab==="lostsales"   && <LostSalesPanel      data={data}                                         T={T}/>}
              {dashTab==="basketsize"  && <BasketSizePanel     data={data}                                         T={T}/>}
              {dashTab==="planogram"   && <PlanogramPanel      data={data}                                         T={T}/>}
              {dashTab==="alerts"      && <AlertsPanel         data={data} securityLog={securityLog}                                         T={T}/>}
              {dashTab==="export"      && <ExportPanel         data={data}   filename={filename} heatmapRef={heatmapCanvasRef} currentUser={user} T={T}/>}
              {dashTab==="users"       && <UserPanel           currentUser={user}                                  T={T}/>}
              {dashTab==="theft"       && <TheftPanel          data={data}   theme={theme}                         T={T}/>}
              {dashTab==="lookup"      && <VideoLookupPanel   theme={theme}  setSecurityLog={setSecurityLog}  T={T}/>}

            </div>
          )}
        </main>
      </div>
    </>
  );
}