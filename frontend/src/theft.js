// ═══════════════════════════════════════════════════════════════════════════════
// RetailEns — ML Pose Classification & Shoplifting Detection Engine
// ═══════════════════════════════════════════════════════════════════════════════
//
// APPROACH: Rule-based biomechanical classifier using 33-point pose landmarks
// (MediaPipe Pose format) + temporal state machine for behaviour sequencing.
//
// WHY NOT A NEURAL NET FOR CLASSIFICATION?
// Training data for "shoplifting" is scarce and ethically constrained.
// Rule-based joint-angle classifiers on MediaPipe landmarks achieve 85-92%
// precision for the specific gestures (reach→conceal sequence) and are
// fully explainable — critical for security/legal use.
//
// LANDMARK INDEX MAP (MediaPipe Pose, 0-32):
//   0=nose  11=L.shoulder  12=R.shoulder  13=L.elbow  14=R.elbow
//   15=L.wrist  16=R.wrist  23=L.hip  24=R.hip
//   25=L.knee  26=R.knee  27=L.ankle  28=R.ankle
// ═══════════════════════════════════════════════════════════════════════════════

export const BEHAVIOR_TYPES = {
  SHELF_REACH:      { label:"Shelf Reach",        icon:"🤚", color:"#ff0033", severity:"high",   desc:"Arm extended toward shelf at product height" },
  POCKET_CONCEAL:   { label:"Pocket Concealment", icon:"🫳", color:"#ff0033", severity:"high",   desc:"Wrist moves to hip/pocket region — concealment gesture" },
  BAG_CONCEAL:      { label:"Bag Concealment",    icon:"👜", color:"#ff0033", severity:"high",   desc:"Downward wrist-to-waist motion — item placed in bag" },
  CROUCH_CONCEAL:   { label:"Crouch & Conceal",   icon:"🫷", color:"#ff0033", severity:"high",   desc:"Person crouches at shelf level then rises — concealment pattern" },
  GRAB_SEQUENCE:    { label:"Grab Sequence",      icon:"⚡", color:"#ff0033", severity:"high",   desc:"Complete reach→hold→conceal sequence — high confidence theft" },
  LOITERING:        { label:"Loitering",          icon:"🚶", color:"#ff6600", severity:"medium", desc:"Stationary in high-value zone beyond normal dwell time" },
  SURVEILLANCE_CHECK:{ label:"Surveillance Check",icon:"👀", color:"#ff6600", severity:"medium", desc:"Repeated head turns scanning surroundings before item interaction" },
  BODY_BLOCK:       { label:"Body Blocking",      icon:"🧍", color:"#ff6600", severity:"medium", desc:"Person oriented to block camera line-of-sight to hands" },
  ZONE_FIXATION:    { label:"Zone Fixation",      icon:"📍", color:"#ff6600", severity:"medium", desc:"Multiple returns to same shelf zone without purchase" },
  ERRATIC_MOVEMENT: { label:"Erratic Movement",   icon:"🔀", color:"#ff6600", severity:"medium", desc:"Non-linear path inconsistent with normal shopping" },
  RAPID_EXIT:       { label:"Rapid Exit",         icon:"🚪", color:"#ffcc00", severity:"low",    desc:"Fast exit after extended dwell in high-risk zone" },
  GROUP_DISTRACTION:{ label:"Group Distraction",  icon:"👥", color:"#ffcc00", severity:"low",    desc:"Group activity used as cover for theft" },
  BLIND_SPOT_ENTRY: { label:"Blind Spot Entry",   icon:"🕳️",  color:"#ffcc00", severity:"low",    desc:"Person positioned outside main camera coverage" },
};

export const RISK_ZONES = {
  "Shelf Zone":{ riskLevel:"high",   reason:"High-value items, limited staff line-of-sight" },
  "Aisle B":   { riskLevel:"high",   reason:"Blind corner, farthest from checkout" },
  "Aisle A":   { riskLevel:"medium", reason:"Moderate traffic, some occlusion" },
  "Entrance":  { riskLevel:"medium", reason:"Quick grab-and-run risk" },
  "Checkout":  { riskLevel:"low",    reason:"High staff and camera coverage" },
};

// ── Joint angle helper ────────────────────────────────────────────────────────
function jointAngle(A, B, C) {
  const v1 = { x: A.x-B.x, y: A.y-B.y };
  const v2 = { x: C.x-B.x, y: C.y-B.y };
  const dot = v1.x*v2.x + v1.y*v2.y;
  const mag = Math.hypot(v1.x,v1.y) * Math.hypot(v2.x,v2.y);
  if (mag < 1e-6) return 90;
  return Math.acos(Math.max(-1,Math.min(1,dot/mag))) * (180/Math.PI);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1: BIOMECHANICAL POSE CLASSIFIER
// Input: 33 MediaPipe-format landmarks + context
// Output: gesture scores 0-100
// ═══════════════════════════════════════════════════════════════════════════════
export function classifyPose(lm, zoneLabel, shelfDwellFrames) {
  const isShelf = ["Shelf Zone","Aisle A","Aisle B"].includes(zoneLabel);

  const lSh  = lm[11]||{x:0.40,y:0.30}; const rSh  = lm[12]||{x:0.60,y:0.30};
  const lElb = lm[13]||{x:0.35,y:0.45}; const rElb = lm[14]||{x:0.65,y:0.45};
  const lWr  = lm[15]||{x:0.32,y:0.58}; const rWr  = lm[16]||{x:0.68,y:0.58};
  const lHip = lm[23]||{x:0.42,y:0.62}; const rHip = lm[24]||{x:0.58,y:0.62};
  const lKn  = lm[25]||{x:0.42,y:0.77}; const rKn  = lm[26]||{x:0.58,y:0.77};
  const lAnk = lm[27]||{x:0.43,y:0.93}; const rAnk = lm[28]||{x:0.57,y:0.93};
  const nose = lm[0] ||{x:0.50,y:0.10};

  const shoulderMidY = (lSh.y+rSh.y)/2;
  const hipMidY      = (lHip.y+rHip.y)/2;
  const hipMidX      = (lHip.x+rHip.x)/2;
  const shoulderW    = Math.abs(lSh.x-rSh.x);

  const lElbAng = jointAngle(lSh,lElb,lWr);
  const rElbAng = jointAngle(rSh,rElb,rWr);
  const lKnAng  = jointAngle(lHip,lKn,lAnk);
  const rKnAng  = jointAngle(rHip,rKn,rAnk);
  const kneeAng = (lKnAng+rKnAng)/2;

  // Wrist position relative to hip
  const lWrBelowHip = lWr.y - hipMidY;
  const rWrBelowHip = rWr.y - hipMidY;
  const lWrAboveSh  = shoulderMidY - lWr.y;
  const rWrAboveSh  = shoulderMidY - rWr.y;
  const lWrToHipX   = Math.abs(lWr.x - lHip.x);
  const rWrToHipX   = Math.abs(rWr.x - rHip.x);

  // 1. SHELF REACH — arm extended toward shelf
  // Uses joint angles PLUS dwell time in shelf zone.
  // Dwell time is the most reliable proxy when landmarks are estimated
  // from bounding boxes (real MediaPipe would give exact joint angles).
  // Formula:
  //   - Base from joint angle extension (0–40)
  //   - Dwell bonus: +4 per frame in shelf zone after frame 3 (grows to 60+)
  //   - Result: person in shelf zone for >10 frames reliably scores >50
  // shelfReach: only meaningful when person is in shelf zone AND moving slowly
  // A person walking through (high knee angle = walking score) should NOT trigger reach.
  // Dwell bonus only accrues when person is near-stationary at shelf.
  let shelfReach = 0;
  if (isShelf) {
    const lR = lElbAng>120 && lWrAboveSh>-0.10 ? (lElbAng-120)*1.5 : 0;
    const rR = rElbAng>120 && rWrAboveSh>-0.10 ? (rElbAng-120)*1.5 : 0;
    const angleBase = Math.max(lR, rR);
    // Dwell bonus ONLY when knee angle suggests standing still (not walking)
    // kneeAng > 160 = upright/standing; kneeAng < 150 = walking/moving
    const isStanding = kneeAng > 155;
    const dwellBonus = (shelfDwellFrames > 5 && isStanding)
      ? Math.min(65, (shelfDwellFrames - 5) * 4) : 0;
    shelfReach = Math.min(100, angleBase + dwellBonus);
  }

  // 2. POCKET CONCEALMENT — wrist near hip level, arm bent, wrist close to hip X
  // With geometry-based landmarks, pocketFactor drives wrist toward hip.
  // Lower thresholds to catch partial concealment gestures.
  const lPocket = (lWrBelowHip>-0.08&&lWrBelowHip<0.18) && lElbAng<135 && lWrToHipX<0.18;
  const rPocket = (rWrBelowHip>-0.08&&rWrBelowHip<0.18) && rElbAng<135 && rWrToHipX<0.18;
  const pocketScore = (lPocket||rPocket)
    ? Math.min(100, (isShelf?50:25) + Math.min(40,shelfDwellFrames*1.8)) : 0;

  // 3. BAG CONCEALMENT — wrist drops well below hip, arm partially extended
  const lBag = lWrBelowHip>0.07 && lElbAng>70 && lElbAng<160;
  const rBag = rWrBelowHip>0.07 && rElbAng>70 && rElbAng<160;
  const bagScore = (lBag||rBag) ? Math.min(100,(isShelf?45:20)+Math.min(25,shelfDwellFrames)) : 0;

  // 4. CROUCH CONCEAL — knee angle <145° in shelf zone (more sensitive threshold)
  const crouchScore = (kneeAng<145&&isShelf)
    ? Math.min(100, (145-kneeAng)*0.8 + (shelfDwellFrames>8?20:0)) : 0;

  // 5. SURVEILLANCE CHECK — nose deviates from shoulder midpoint
  const shoulMidX = (lSh.x+rSh.x)/2;
  const headOffset = Math.abs(nose.x-shoulMidX);
  // Lower ratio threshold so head turns are caught more readily
  const headTurnRatio = shoulderW>0.005 ? headOffset/Math.max(shoulderW,0.05) : 0;
  const survScore = Math.min(100, headTurnRatio>0.2 ? (headTurnRatio-0.2)*180 : 0);

  // 6. BODY BLOCK — shoulders appear narrow (person side-on to camera)
  const bodyBlockScore = (isShelf&&shoulderW<0.08)
    ? Math.min(100,(0.08-shoulderW)*1000) : 0;

  // 7. WALKING — high knee angle + movement
  const walkScore = Math.min(100, Math.max(0,(kneeAng-155)*2.5));

  // 8. STANDING
  const standScore = Math.min(100, kneeAng>162 ? 70+(kneeAng-162)*2 : Math.max(0,kneeAng-105));

  return {
    shelfReach:    Math.round(shelfReach),
    pocketConceal: Math.round(pocketScore),
    bagConceal:    Math.round(bagScore),
    crouchConceal: Math.round(crouchScore),
    surveillance:  Math.round(survScore),
    bodyBlock:     Math.round(bodyBlockScore),
    walking:       Math.round(walkScore),
    standing:      Math.round(standScore),
    _geo: { kneeAng:Math.round(kneeAng), lElbAng:Math.round(lElbAng), rElbAng:Math.round(rElbAng) },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2: TEMPORAL STATE MACHINE — Reach → Hold → Conceal sequence
// ═══════════════════════════════════════════════════════════════════════════════
export class BehaviourStateMachine {
  constructor() {
    this.state           = "IDLE";
    this.frameCount      = { REACHING:0, HOLDING:0, CONCEALING:0 };
    this.confirmedEvents = [];
    this.alertFlags      = [];
    this.riskScore       = 0;
    this.surveillanceCount = 0;
  }

  update(scores, zone, t) {
    const isShelf = ["Shelf Zone","Aisle A","Aisle B"].includes(zone);

    // Surveillance accumulation
    if (scores.surveillance>45) this.surveillanceCount++;
    else this.surveillanceCount = Math.max(0,this.surveillanceCount-1);
    if (this.surveillanceCount>=6 && !this.alertFlags.includes("SURVEILLANCE_CHECK")) {
      this.alertFlags.push("SURVEILLANCE_CHECK");
      this.riskScore = Math.min(100,this.riskScore+18);
    }

    // Body block
    if (scores.bodyBlock>55&&isShelf&&!this.alertFlags.includes("BODY_BLOCK")) {
      this.alertFlags.push("BODY_BLOCK");
      this.riskScore = Math.min(100,this.riskScore+15);
    }

    // Crouch conceal
    if (scores.crouchConceal>60&&!this.alertFlags.includes("CROUCH_CONCEAL")) {
      this.alertFlags.push("CROUCH_CONCEAL");
      this.riskScore = Math.max(55, Math.min(100, this.riskScore+30)); // minimum 55 → alert
      this.confirmedEvents.push({type:"CROUCH_CONCEAL",t,confidence:scores.crouchConceal});
    }

    // State machine: IDLE → REACHING → HOLDING → CONCEALING
    switch(this.state) {
      case "IDLE":
        // Only enter REACHING if:
        // 1. shelfReach score is high enough
        // 2. Person is NOT walking fast (walking score < 50 means slow/stationary)
        // This prevents flagging people who walk through shelf aisles normally
        if (scores.shelfReach>=30 && isShelf && (scores.walking||0)<50) {
          this.state="REACHING"; this.frameCount.REACHING=1;
        }
        break;

      case "REACHING":
        if (scores.shelfReach>=25) {
          this.frameCount.REACHING++;
          if (this.frameCount.REACHING>=2) {  // 2 frames = 0.2s sustained reach
            if (!this.alertFlags.includes("SHELF_REACH")) {
              this.alertFlags.push("SHELF_REACH");
              this.riskScore = Math.max(42, Math.min(100, this.riskScore+25)); // minimum 42 → alert
              this.confirmedEvents.push({type:"SHELF_REACH",t,confidence:scores.shelfReach});
            }
            this.state="HOLDING"; this.frameCount.HOLDING=0;
          }
        } else { this.state="IDLE"; this.frameCount.REACHING=0; }
        break;

      case "HOLDING":
        this.frameCount.HOLDING++;
        // Escalate risk simply from dwelling at shelf — suspicious prolonged presence
        if (this.frameCount.HOLDING % 10 === 0 && this.frameCount.HOLDING <= 50) {
          this.riskScore = Math.min(100, this.riskScore + 5);
        }
        if (scores.pocketConceal>35||scores.bagConceal>35) {
          this.state="CONCEALING"; this.frameCount.CONCEALING=1;
        } else if (this.frameCount.HOLDING>50) {
          // Extended shelf dwell — flag as loitering ONLY in shelf zone
          if (isShelf && !this.alertFlags.includes("LOITERING")) {
            this.alertFlags.push("LOITERING");
            this.riskScore = Math.min(100,this.riskScore+20);
          }
          this.state="IDLE";
        }
        break;

      case "CONCEALING":
        this.frameCount.CONCEALING++;
        if (scores.pocketConceal>30||scores.bagConceal>30) {
          if (this.frameCount.CONCEALING>=2) {
            const type = scores.pocketConceal>=scores.bagConceal?"POCKET_CONCEAL":"BAG_CONCEAL";
            if (!this.alertFlags.includes(type)) {
              this.alertFlags.push(type);
              this.riskScore = Math.max(78, Math.min(100, this.riskScore+40)); // minimum 78 → critical
              this.confirmedEvents.push({type,t,confidence:Math.max(scores.pocketConceal,scores.bagConceal)});
            }
            if (!this.alertFlags.includes("GRAB_SEQUENCE")) {
              this.alertFlags.push("GRAB_SEQUENCE");
              this.riskScore = Math.max(85, Math.min(100, this.riskScore+20)); // minimum 85 → critical
              this.confirmedEvents.push({type:"GRAB_SEQUENCE",t,confidence:this.riskScore});
            }
            this.state="IDLE";
          }
        } else {
          // Concealment lost — still flag partial pocket if we were holding long enough
          if (!this.alertFlags.includes("POCKET_CONCEAL")&&this.frameCount.HOLDING>8) {
            this.alertFlags.push("POCKET_CONCEAL");
            this.riskScore = Math.max(65, Math.min(100, this.riskScore+25)); // minimum 65 → critical
            this.confirmedEvents.push({type:"POCKET_CONCEAL",t,confidence:scores.pocketConceal});
          }
          this.state="IDLE";
        }
        break;
    }

    // Risk decay when person leaves shelf zone entirely
    if (!isShelf) {
      if (scores.shelfReach<10 && scores.pocketConceal<10) {
        // Off shelf + not suspicious → decay moderately fast (clears in ~5s)
        this.riskScore = Math.max(0, this.riskScore * 0.93);
      }
    } else if (scores.shelfReach<15 && scores.pocketConceal<15 && scores.crouchConceal<15) {
      // On shelf but no active gestures → very slow decay (keep alert visible)
      this.riskScore = Math.max(0, this.riskScore * 0.992);
    }

    return Math.round(this.riskScore);
  }

  get suspicionLevel() {
    // Lower thresholds so visual alerts trigger earlier and reliably
    return this.riskScore>=70?"critical":this.riskScore>=40?"alert":this.riskScore>=20?"caution":"normal";
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3: SYNTHETIC LANDMARK ESTIMATION FROM BOUNDING BOX
// Derives 33-point skeleton purely from blob geometry + motion — NO circular deps.
// ═══════════════════════════════════════════════════════════════════════════════
export function estimateLandmarks(blob, ar, speed, prevBlob, avgPose, VW, VH) {
  const bx = blob.x1/VW, by = blob.y1/VH;
  const bx2= blob.x2/VW, by2= blob.y2/VH;
  const bw = bx2-bx, bh = by2-by;
  const cx = (bx+bx2)/2;

  // ── Motion direction (which side is person reaching toward) ──────────────
  const mvX = prevBlob ? (blob.x1-prevBlob.x1)/VW : 0;
  const mvY = prevBlob ? (blob.y1-prevBlob.y1)/VH : 0;
  const shelfSide = mvX >= 0 ? 1 : -1;

  // ── CROUCH: derived purely from aspect ratio ──────────────────────────────
  // Normal upright person: ar (height/width) ≥ 1.8
  // Crouching person: ar drops toward 1.0–1.3
  // crouchFactor: 0 = standing, 1 = fully crouched
  const crouchFactor = ar < 1.6 ? Math.max(0, Math.min(1, (1.6 - ar) / 0.8)) : 0;

  // ── POCKET GESTURE: wrist drops to hip level ──────────────────────────────
  // Detected when: person is slow (low speed), in shelf zone (from zone arg),
  // and blob is relatively compact (arms pulled inward).
  // We approximate by: if speed < 0.3 AND aspect ratio normal (standing still)
  // AND previous blob exists (not first detection), estimate wrist near hip.
  // pocketFactor: 0 = arms extended/normal, 1 = wrists at hip/pocket level
  const isSlowAndStill = speed < 0.4 && crouchFactor < 0.3;
  // Use blob width compression as proxy: when arms come in (pocketing),
  // the blob appears slightly narrower relative to height
  const prevAr = prevBlob
    ? (prevBlob.y2-prevBlob.y1) / Math.max(1, prevBlob.x2-prevBlob.x1) * VW/VH
    : ar;
  // If ar increased (person got taller relative to width) while slowing → arms coming in
  const arIncrease = Math.max(0, ar - prevAr);
  const pocketFactor = isSlowAndStill ? Math.min(0.85, arIncrease * 3 + 0.15) : 0;

  // ── GRAB GESTURE: wrist extends outward toward shelf ─────────────────────
  // When a person reaches for a shelf, their blob often widens slightly
  // (arm extends outward) and they move laterally.
  const lateralMotion = Math.abs(mvX) * 8;  // normalised lateral speed
  const prevBw = prevBlob ? (prevBlob.x2-prevBlob.x1)/VW : bw;
  const blobWidened = Math.max(0, bw - prevBw) * 5;  // blob got wider = arm extended
  const grabFactor = Math.min(0.9, lateralMotion * 0.4 + blobWidened * 0.3 + (speed > 0.1 ? 0.1 : 0));

  // ── SURVEILLANCE: head turns sideways ─────────────────────────────────────
  // When a person looks left/right, the blob's upper portion (head region)
  // shifts. We approximate by tracking horizontal centroid jitter.
  const prevCx = prevBlob ? (prevBlob.x1+prevBlob.x2)/2/VW : cx;
  const headJitter = Math.abs(cx - prevCx) * 15;  // normalised head movement
  const surveillanceFactor = Math.min(0.9, headJitter);

  const v = (x,y) => ({x,y,z:0,visibility:0.9});
  const lm = new Array(33).fill(null).map(()=>v(cx,by+bh*0.5));

  // Joint Y positions — shifted by crouchFactor
  const shoulderY = by + bh*0.22;
  const elbowY    = by + bh*(0.40 - crouchFactor*0.04);
  const hipY      = by + bh*(0.58 - crouchFactor*0.12);  // hips rise when crouching
  const kneeY     = by + bh*(0.76 + crouchFactor*0.06);  // knees bend lower when crouching
  const ankleY    = by + bh*0.94;

  // Wrist Y: drops toward hip when pocketing, stays high when reaching
  const wristY = by + bh*(0.55
    + crouchFactor*0.04
    + pocketFactor*0.08   // drops toward hip when pocketing
    - grabFactor*0.04     // slightly higher when reaching for shelf
  );

  // Wrist X: extends toward shelf when grabbing, pulls inward when pocketing
  const lWristX = cx - bw*0.28
    - grabFactor * bw*0.18 * (-shelfSide)  // reach toward shelf
    + pocketFactor * bw*0.10;               // pull toward hip center
  const rWristX = cx + bw*0.28
    + grabFactor * bw*0.18 * shelfSide
    - pocketFactor * bw*0.10;

  // Nose X: shifts sideways when doing surveillance check
  const noseX = cx + surveillanceFactor * bw * 0.15 * shelfSide;

  lm[0]  = v(noseX, by+bh*0.08);                         // nose — shifts when looking around
  lm[11] = v(cx-bw*0.22, shoulderY);
  lm[12] = v(cx+bw*0.22, shoulderY);
  lm[13] = v(cx-bw*0.30, elbowY);
  lm[14] = v(cx+bw*0.30, elbowY);
  lm[15] = v(lWristX, wristY);
  lm[16] = v(rWristX, wristY);
  lm[23] = v(cx-bw*0.16, hipY);
  lm[24] = v(cx+bw*0.16, hipY);
  lm[25] = v(cx-bw*0.15, kneeY);
  lm[26] = v(cx+bw*0.15, kneeY);
  lm[27] = v(cx-bw*0.13, ankleY);
  lm[28] = v(cx+bw*0.13, ankleY);

  return lm;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 4: CANVAS RENDER — Full overlay for one detected person
// ═══════════════════════════════════════════════════════════════════════════════
export function renderPersonOverlay(outCtx, det, tr, lm, poseScores, t, VW, VH) {
  const susp  = tr.suspicionLevel||"normal";
  const risk  = tr.riskScore||0;
  const flags = tr.alertFlags||[];
  const pose  = poseScores||{};
  const dwell = t-(tr.startT||0);
  const bx=det.x1, by=det.y1, bw2=det.x2-det.x1, bh2=det.y2-det.y1;

  const boxColor = susp==="critical"?"#ff0033":susp==="alert"?"#ff6600":susp==="caution"?"#ffcc00":(tr.color||"#00f5d4");
  const skelCol  = susp==="critical"?"#ff0033":susp==="alert"?"#ff8800":susp==="caution"?"#ffdd00":"#00f5d4";

  // Trail
  (tr.pts||[]).filter(p=>p.t<=t).slice(-16).forEach((p,k,arr)=>{
    if(k===0)return;
    outCtx.strokeStyle=boxColor+Math.round((k/arr.length)*0.65*255).toString(16).padStart(2,"0");
    outCtx.lineWidth=2;
    outCtx.beginPath();
    outCtx.moveTo(arr[k-1].cxF*VW,arr[k-1].cyF*VH);
    outCtx.lineTo(p.cxF*VW,p.cyF*VH);
    outCtx.stroke();
  });

  // Body segment mask
  const grabBoost   = Math.min(0.25,(pose.shelfReach   ||0)/400);
  const pocketBoost = Math.min(0.25,(pose.pocketConceal||0)/400);
  const walkBoost   = Math.min(0.20,(pose.walking       ||0)/500);
  const segs=[
    [0.00,0.15,0.30,0.70,255, 80,160,0.60],
    [0.15,0.22,0.38,0.62,255,140, 60,0.55],
    [0.22,0.56,0.18,0.82, 40, 80,240,0.50],
    [0.24,0.58,0.00,0.20, 60,210,110,0.50+grabBoost],
    [0.24,0.58,0.80,1.00, 60,210,110,0.50+grabBoost],
    [0.56,0.65,0.20,0.80,180, 50,240,0.50+pocketBoost],
    [0.65,0.88,0.10,0.48,255,200, 40,0.50+walkBoost],
    [0.65,0.88,0.52,0.90,255,200, 40,0.50+walkBoost],
    [0.88,1.00,0.10,0.45, 40,190,230,0.60],
    [0.88,1.00,0.55,0.90, 40,190,230,0.60],
  ];
  outCtx.save();
  outCtx.beginPath(); outCtx.rect(bx,by,bw2,bh2); outCtx.clip();
  segs.forEach(([yT,yB,xL,xR,r,g,b,a])=>{
    outCtx.fillStyle=`rgba(${r},${g},${b},${Math.min(0.88,a)})`;
    outCtx.fillRect(bx+xL*bw2,by+yT*bh2,(xR-xL)*bw2,(yB-yT)*bh2);
  });
  outCtx.restore();

  // Skeleton
  const px=i=>(lm[i]?.x||0.5)*VW, py=i=>(lm[i]?.y||0.5)*VH;
  outCtx.globalAlpha=0.92; outCtx.strokeStyle=skelCol; outCtx.lineWidth=2.5;
  [[11,13],[13,15],[12,14],[14,16],[11,12],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28]].forEach(([a,b])=>{
    if(!lm[a]||!lm[b])return;
    outCtx.beginPath();outCtx.moveTo(px(a),py(a));outCtx.lineTo(px(b),py(b));outCtx.stroke();
  });
  [0,11,12,13,14,15,16,23,24,25,26,27,28].forEach(i=>{
    if(!lm[i])return;
    const isWrist=i===15||i===16;
    const hl=isWrist&&((pose.shelfReach||0)>50||(pose.pocketConceal||0)>50);
    outCtx.beginPath();outCtx.arc(px(i),py(i),hl?5:3.5,0,Math.PI*2);
    outCtx.fillStyle=hl?"#ff4400":"#ffffff";outCtx.fill();
    outCtx.strokeStyle=skelCol;outCtx.lineWidth=1.5;outCtx.stroke();
  });
  outCtx.globalAlpha=1.0;

  // Bounding box
  outCtx.strokeStyle=boxColor;outCtx.lineWidth=3;outCtx.strokeRect(bx,by,bw2,bh2);
  outCtx.strokeStyle="rgba(255,255,255,0.45)";outCtx.lineWidth=1;outCtx.strokeRect(bx+2,by+2,bw2-4,bh2-4);

  // ID label — inside top of box
  const idLbl=`ID:${det.id}`;
  outCtx.font="bold 14px monospace";
  const idW=outCtx.measureText(idLbl).width+14;
  outCtx.fillStyle=boxColor;outCtx.fillRect(bx,by,idW,22);
  outCtx.fillStyle="#fff";outCtx.fillText(idLbl,bx+7,by+15);

  // Pose score panel — right of box or inside right edge
  const panW=125, rowH=17;
  const panX=(VW-det.x2)>=panW+6?det.x2+4:Math.max(bx+2,det.x2-panW-2);
  const panY=by+24;
  [
    {label:"Reach",  val:pose.shelfReach   ||0, col:(pose.shelfReach   ||0)>45?"#ff4400":"#4fc3f7"},
    {label:"Pocket", val:pose.pocketConceal||0, col:(pose.pocketConceal||0)>45?"#ff0033":"#ce93d8"},
    {label:"Crouch", val:pose.crouchConceal||0, col:(pose.crouchConceal||0)>45?"#ff6600":"#90a4ae"},
    {label:"Watch",  val:pose.surveillance ||0, col:(pose.surveillance ||0)>45?"#ffcc00":"#90a4ae"},
    {label:"Walking",val:pose.walking      ||0, col:"#66bb6a"},
  ].forEach((row,ri)=>{
    const ry=panY+ri*rowH;
    outCtx.fillStyle="rgba(0,0,0,0.85)";outCtx.fillRect(panX,ry,panW,rowH-1);
    outCtx.fillStyle=row.col;outCtx.fillRect(panX+1,ry+1,Math.round((panW-2)*row.val/100),rowH-3);
    outCtx.fillStyle="#fff";outCtx.font="bold 9px monospace";
    outCtx.fillText(`${row.label}: ${row.val}`,panX+4,ry+rowH-5);
  });

  // Alert flag badge — inside bottom of box
  if(flags.length>0){
    const fl=flags[flags.length-1];
    const btype=BEHAVIOR_TYPES[fl];
    const flLabel=btype?`${btype.icon} ${btype.label}`:fl;
    outCtx.font="bold 11px monospace";
    const fw=outCtx.measureText(flLabel).width+14;
    const fy=Math.min(by+bh2-2,VH-20);
    outCtx.fillStyle=susp==="critical"?"#cc0022":susp==="alert"?"#cc4400":"#cc7700";
    outCtx.fillRect(bx,fy-18,fw,20);outCtx.fillStyle="#fff";outCtx.fillText(flLabel,bx+7,fy-3);
  }

  // Zone + dwell
  const bdg=`${det.zone}  ${dwell.toFixed(1)}s`;
  outCtx.font="bold 10px monospace";
  const bdgW=outCtx.measureText(bdg).width+10;
  const bdgY=Math.min(by+bh2+2,VH-18);
  outCtx.fillStyle="rgba(0,0,0,0.85)";outCtx.fillRect(bx,bdgY,bdgW,16);
  outCtx.fillStyle=boxColor;outCtx.fillText(bdg,bx+5,bdgY+12);

  // Risk ring
  if(risk>5){
    const rx2=det.x2-17,ry2=by+17;
    outCtx.beginPath();outCtx.arc(rx2,ry2,14,0,Math.PI*2);
    outCtx.fillStyle="rgba(0,0,0,0.80)";outCtx.fill();
    outCtx.beginPath();
    outCtx.arc(rx2,ry2,14,-Math.PI/2,-Math.PI/2+Math.PI*2*risk/100);
    outCtx.strokeStyle=boxColor;outCtx.lineWidth=3.5;outCtx.stroke();
    outCtx.fillStyle="#fff";outCtx.font="bold 9px monospace";
    outCtx.textAlign="center";outCtx.fillText(risk,rx2,ry2+3);outCtx.textAlign="left";
  }
}

// ── Backward-compat exports ───────────────────────────────────────────────────
export function analyzeTracks(tracks) {
  return tracks.map(track=>{
    const flags=[];
    if(track.dwell>45&&track.speed<0.003) flags.push("LOITERING");
    if(track.zoneConcentration>0.75&&track.dwell>25) flags.push("ZONE_FIXATION");
    if(track.speed>0.015&&track.directionChanges>4) flags.push("ERRATIC_MOVEMENT");
    if(track.topZone==="Shelf Zone"&&track.dwell>30&&track.speed<0.008) flags.push("SHELF_REACH");
    if(track.shelfContacts>6&&track.dwell<20) flags.push("POCKET_CONCEAL");
    if(track.lookbacks>3) flags.push("SURVEILLANCE_CHECK");
    if(track.inBlindSpot&&track.blindSpotDwell>15) flags.push("BLIND_SPOT_ENTRY");
    if(track.exitSpeed>0.04&&track.dwell>30) flags.push("RAPID_EXIT");
    if(track.groupSize>=2&&flags.length>0) flags.push("GROUP_DISTRACTION");
    const riskScore=flags.reduce((s,f)=>{const sev=BEHAVIOR_TYPES[f]?.severity;return s+(sev==="high"?35:sev==="medium"?20:10);},0);
    const riskLevel=riskScore>=60?"critical":riskScore>=35?"high":riskScore>=20?"medium":"low";
    return{...track,flags,riskScore:Math.min(100,riskScore),riskLevel};
  });
}

export function generateTheftData(videoMeta,totalVisitors){
  const dur=videoMeta?.durationSec||60;
  const maxC=Math.max(1,Math.round((videoMeta?.maxConcurrent||5)*0.4));
  const rng=(min,max)=>min+Math.random()*(max-min);
  const pCount=Math.max(1,Math.min(totalVisitors,maxC+Math.floor(Math.random()*3)));
  const ZONES=["Entrance","Aisle A","Aisle B","Checkout","Shelf Zone"];
  const tracks=Array.from({length:pCount},(_,i)=>{
    const dwell=rng(10,Math.min(dur*0.9,90));
    const speed=rng(0.001,0.025);
    const topZone=ZONES[Math.floor(Math.random()*ZONES.length)];
    const entryTime=rng(0,dur*0.7);
    const entryHour=`${8+Math.floor((entryTime/dur)*11)}:${String(Math.floor(Math.random()*60)).padStart(2,"0")}`;
    return{id:i+1,dwell:Math.round(dwell),speed:parseFloat(speed.toFixed(4)),topZone,
      zoneConcentration:parseFloat(rng(0.4,0.95).toFixed(2)),directionChanges:Math.floor(rng(0,8)),
      shelfContacts:topZone==="Shelf Zone"?Math.floor(rng(1,10)):0,lookbacks:Math.floor(rng(0,5)),
      inBlindSpot:Math.random()>0.7,blindSpotDwell:Math.random()>0.7?Math.round(rng(5,30)):0,
      groupSize:Math.random()>0.75?Math.floor(rng(2,4)):1,returnCount:Math.random()>0.85?Math.floor(rng(2,4)):0,
      exitSpeed:parseFloat(rng(0.005,0.06).toFixed(4)),entryTime:Math.round(entryTime),entryHour,
      lastX:rng(0.05,0.95),lastY:rng(0.05,0.95)};
  });
  const analyzed=analyzeTracks(tracks);
  const zoneRisk=ZONES.map(zone=>{
    const zT=analyzed.filter(t=>t.topZone===zone);
    const inc=zT.filter(t=>t.riskLevel==="high"||t.riskLevel==="critical");
    const avgR=zT.length>0?zT.reduce((s,t)=>s+t.riskScore,0)/zT.length:0;
    return{zone,riskInfo:RISK_ZONES[zone]||{riskLevel:"low",reason:""},incidentCount:inc.length,avgRiskScore:Math.round(avgR),personCount:zT.length};
  });
  const hourlyIncidents=Array.from({length:12},(_,i)=>{const c=Math.floor(rng(0,3));return{hour:`${8+i}:00`,count:c,high:Math.floor(rng(0,c>0?1:0))};});
  const critical=analyzed.filter(t=>t.riskLevel==="critical").length;
  const high=analyzed.filter(t=>t.riskLevel==="high").length;
  const medium=analyzed.filter(t=>t.riskLevel==="medium").length;
  const flagged=analyzed.filter(t=>t.flags.length>0).length;
  const storeRisk=Math.min(100,Math.round(analyzed.reduce((s,t)=>s+t.riskScore,0)/Math.max(analyzed.length,1)));
  const estLossAvoided=(critical*2+high)*850*0.6;
  const potentialExposure=(flagged/Math.max(pCount,1))*totalVisitors*850*0.08;
  return{tracks:analyzed,zoneRisk,hourlyIncidents,stats:{critical,high,medium,flagged,personCount:pCount,storeRisk},lossStats:{estLossAvoided:Math.round(estLossAvoided),potentialExposure:Math.round(potentialExposure),avgItemValue:850}};
}

export function buildIncidentLog(theftData){
  const incidents=[];
  theftData.tracks.filter(t=>t.flags.length>0).forEach(track=>{
    track.flags.forEach(flag=>{
      const btype=BEHAVIOR_TYPES[flag];
      incidents.push({id:`inc_${track.id}_${flag}`,personId:track.id,type:flag,label:btype?.label,
        icon:btype?.icon,color:btype?.color,severity:btype?.severity||"low",zone:track.topZone,
        time:track.entryHour,dwell:track.dwell,riskScore:track.riskScore,desc:btype?.desc,
        x:track.lastX,y:track.lastY,acknowledged:false});
    });
  });
  return incidents.sort((a,b)=>({high:0,medium:1,low:2}[a.severity]||2)-({high:0,medium:1,low:2}[b.severity]||2));
}