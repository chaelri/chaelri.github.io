// figure3d.js — 3D Workout Mannequin Viewer for Wedding100
// Uses Three.js (global THREE object)
//
// POSE CONVENTION (degrees, applied with sign corrections in setPose):
//   Spine X: negative = forward lean, positive = backward lean
//   Spine Y: positive = twist right, negative = twist left
//   Spine Z: positive = lean right, negative = lean left
//   Arm X:   negative = forward/up,  positive = backward
//   Arm Z:   left +/right - = away from body (abduction)
//   Elbow X: NEGATIVE = natural curl (forearm toward bicep)
//   Leg X:   negative = forward (hip flexion), positive = backward
//   Leg Z:   left +/right - = away from body (abduction)
//   Knee X:  POSITIVE = natural bend (shin folds behind thigh)

(function(){
  if(typeof THREE==='undefined'){console.warn('Three.js not loaded');return}

  const DEG=Math.PI/180;

  const SKIN=0xd4a574, SKIN_DARK=0xb8896a, JOINT=0xc49a78;
  const KB_BODY=0xc25a3a, KB_HANDLE=0x83382c, SHOE=0x4a3728;
  const SKIN_DK=0xb08060, SKIN_DARK_DK=0x8a6548, JOINT_DK=0x9a7a5c;

  function isDark(){return document.documentElement.classList.contains('dark')}

  const HIP_Y=0.82;
  const SHOULDER_OFFSET_Y=0.43, SHOULDER_HALF_W=0.17;
  const HEAD_OFFSET_Y=0.60;
  const UPPER_ARM_L=0.26, FOREARM_L=0.24;
  const UPPER_LEG_L=0.40, LOWER_LEG_L=0.38;
  const HIP_HALF_W=0.09;

  // ── Mannequin (smooth sculpted mesh using LatheGeometry profiles) ──
  class Mannequin{
    constructor(scene){
      this.joints={};
      this.kbGroups={};
      this._handRefs={};
      this._gripRefs={};
      this._scene=scene;
      this._build(scene);
    }

    _skin(color){
      return new THREE.MeshStandardMaterial({color,roughness:0.55,metalness:0.02,side:THREE.DoubleSide});
    }
    _mat(c){return new THREE.MeshStandardMaterial({color:c,roughness:0.4,metalness:0.0,side:THREE.DoubleSide})}

    // Lofted mesh: connect elliptical cross-sections into smooth surface
    // sections: [[y, radiusX, radiusZ, offsetX?, offsetZ?], ...]
    // Like MRI body slices connected together — proper width AND depth at every level
    _loft(sections,segs,mat){
      const pos=[],idx=[];
      const R=segs+1; // verts per ring (extra to close UV seam)
      for(let si=0;si<sections.length;si++){
        const s=sections[si];
        const rx=Math.max(s[1],0.001), rz=Math.max(s[2],0.001);
        const cx=s[3]||0, cz=s[4]||0;
        for(let i=0;i<=segs;i++){
          const a=(i/segs)*Math.PI*2;
          pos.push(Math.cos(a)*rx+cx, s[0], Math.sin(a)*rz+cz);
        }
      }
      for(let si=0;si<sections.length-1;si++){
        for(let i=0;i<segs;i++){
          const a=si*R+i, b=a+1, c=a+R, d=c+1;
          idx.push(a,c,b, b,c,d);
        }
      }
      const geo=new THREE.BufferGeometry();
      geo.setIndex(idx);
      geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
      geo.computeVertexNormals();
      return new THREE.Mesh(geo,mat);
    }

    _build(scene){
      const dk=isDark();
      const skin=this._skin(dk?0xd4a574:0xc49a78); // warm tan (light), golden brown (dark)
      const shoe=this._mat(dk?0x3a2820:SHOE);
      const km=this._mat(KB_BODY),kh=this._mat(KB_HANDLE);
      this._mats=[skin,shoe,km,kh];
      const S=20;

      const root=new THREE.Group();
      root.position.y=HIP_Y;
      scene.add(root);
      this.root=root;

      const spine=new THREE.Group();
      root.add(spine);
      this.joints.spine=spine;

      // ── Torso: lofted with center offsets for natural S-curve profile ──
      //              [y,     rx,   rz,   cx,  cz  ]
      const torso=this._loft([
        [-0.05,  0,     0,    0,  -0.01],  // bottom cap
        [-0.03,  0.07,  0.07, 0,  -0.012], // crotch curve
        [-0.01,  0.11,  0.10, 0,  -0.015], // widens
        [ 0.01,  0.13,  0.11, 0,  -0.018], // hip
        [ 0.03,  0.13,  0.12, 0,  -0.020], // glute (smooth round)
        [ 0.05,  0.125, 0.11, 0,  -0.018], // glute peak
        [ 0.07,  0.12,  0.10, 0,  -0.012], // upper glute
        [ 0.09,  0.11,  0.09, 0,  -0.005], // tapers to lower back
        [ 0.12,  0.10,  0.08, 0,   0.0 ],  // waist (narrowest)
        [ 0.18,  0.11,  0.08, 0,   0.0 ],  // lower ribs
        [ 0.25,  0.14,  0.08, 0,   0.0 ],  // chest (flat, not pointy)
        [ 0.33,  0.16,  0.08, 0,   0.0 ],  // upper chest
        [ 0.40,  0.18,  0.08, 0,   0.0 ],  // shoulders
        [ 0.42,  0.08,  0.06, 0,   0.0 ],  // shoulder top (no neck — torso ends here)
        [ 0.44,  0,     0,    0,   0.0 ],  // top cap
      ],S,skin);
      spine.add(torso);

      // Head (floating — no neck connection)
      const head=new THREE.Mesh(new THREE.SphereGeometry(0.10,S,S/2),skin);
      head.position.y=HEAD_OFFSET_Y+0.02; // raised slightly for floating gap
      spine.add(head);

      // ── Arms ──
      ['l','r'].forEach(side=>{
        const sign=side==='l'?-1:1;
        const shoulder=new THREE.Group();
        shoulder.position.set(sign*SHOULDER_HALF_W,0.34,0); // at upper chest level
        spine.add(shoulder);
        this.joints[side+'Arm']=shoulder;

        // Upper arm: gradual taper from deep inside torso to elbow
        const ua=this._loft([
          [ 0.07,  0,     0    ],  // inside torso
          [ 0.04,  0.055, 0.050],  // hidden overlap (inside torso)
          [ 0.01,  0.048, 0.043],  // emerges at shoulder
          [ 0.00,  0.044, 0.040],  // joint
          [-0.05,  0.038, 0.035],  // deltoid
          [-0.13,  0.032, 0.030],  // bicep
          [-0.22,  0.027, 0.025],
          [-0.26,  0.025, 0.023],  // elbow
          [-0.28,  0,     0    ],
        ],12,skin);
        shoulder.add(ua);

        const elbow=new THREE.Group();
        elbow.position.y=-UPPER_ARM_L;
        shoulder.add(elbow);
        this.joints[side+'Elbow']=elbow;

        // Forearm
        const fa=this._loft([
          [ 0.025, 0,     0    ],
          [ 0.00,  0.028, 0.025],
          [-0.04,  0.026, 0.024],
          [-0.12,  0.022, 0.020],
          [-0.21,  0.017, 0.016],
          [-0.24,  0.015, 0.014],  // wrist
          [-0.26,  0,     0    ],
        ],12,skin);
        elbow.add(fa);

        // Hand
        const hand=this._loft([
          [ 0.005, 0,     0    ],
          [ 0.00,  0.016, 0.010],
          [-0.015, 0.019, 0.012],
          [-0.035, 0.016, 0.010],
          [-0.05,  0.010, 0.007],
          [-0.055, 0,     0    ],
        ],8,skin);
        hand.position.y=-FOREARM_L-0.005;
        elbow.add(hand);
        this._handRefs[side]=hand;

        // Grip point: bottom of hand where fingers grip the KB
        const grip=new THREE.Group();
        grip.position.y=-FOREARM_L-0.055;
        elbow.add(grip);
        this._gripRefs[side]=grip;

        const kb=this._buildKB(km,kh);
        kb.position.y=-FOREARM_L-0.07;kb.visible=false;
        elbow.add(kb);
        this.kbGroups[side]=kb;
      });

      const bkb=this._buildKB(km,kh);bkb.visible=false;scene.add(bkb);
      this.kbGroups.both=bkb;

      // ── Legs ──
      ['l','r'].forEach(side=>{
        const sign=side==='l'?-1:1;
        const hipJoint=new THREE.Group();
        hipJoint.position.set(sign*HIP_HALF_W,0,0);
        root.add(hipJoint);
        this.joints[side+'Leg']=hipJoint;

        // Thigh: top fits inside pelvis (not poking out)
        const thigh=this._loft([
          [ 0.06,  0,     0    ],  // inside pelvis
          [ 0.03,  0.060, 0.055],  // overlap (hidden under torso)
          [ 0.00,  0.058, 0.053],  // hip joint
          [-0.06,  0.060, 0.055],  // upper thigh (quad bulk)
          [-0.15,  0.053, 0.048],  // mid thigh
          [-0.30,  0.042, 0.040],  // taper
          [-0.40,  0.035, 0.033],  // knee
          [-0.43,  0,     0    ],
        ],14,skin);
        hipJoint.add(thigh);

        const knee=new THREE.Group();
        knee.position.y=-UPPER_LEG_L;
        hipJoint.add(knee);
        this.joints[side+'Knee']=knee;

        // Calf
        const calf=this._loft([
          [ 0.03,  0,     0    ],
          [ 0.00,  0.037, 0.035],
          [-0.05,  0.040, 0.035],  // calf muscle
          [-0.15,  0.033, 0.030],
          [-0.30,  0.022, 0.020],
          [-0.38,  0.018, 0.017],  // ankle
          [-0.40,  0,     0    ],
        ],14,skin);
        knee.add(calf);

        // Foot
        const foot=this._loft([
          [ 0.008, 0,     0    ],
          [ 0.00,  0.020, 0.024],
          [-0.02,  0.024, 0.030],
          [-0.05,  0.022, 0.028],
          [-0.08,  0.016, 0.022],
          [-0.10,  0.008, 0.014],
          [-0.11,  0,     0    ],
        ],8,shoe);
        foot.position.set(0,-LOWER_LEG_L-0.005,0.035);
        foot.rotation.x=-Math.PI/2; // toes point forward (+Z)
        knee.add(foot);
      });
    }

    _buildKB(bm,hm){
      const g=new THREE.Group();
      // Ball (bigger)
      const ball=new THREE.Mesh(new THREE.SphereGeometry(0.10,14,10),bm);
      ball.position.y=-0.10;
      g.add(ball);
      // Handle: tall U-shaped arch on top of ball
      const handle=new THREE.Mesh(new THREE.TorusGeometry(0.065,0.018,8,16,Math.PI),hm);
       // raised above ball so you see the gap
      handle.position.y=-0.03;
      handle.rotation.set(-Math.PI/2, Math.PI/2, Math.PI/2);
      g.add(handle);
      return g;
    }

    // Apply pose with sign corrections for Three.js conventions
    setPose(pose){
      if(!pose)return;
      if(pose.rootY!==undefined)this.root.position.y=HIP_Y+pose.rootY;
      // Spine: negate all axes (Three.js convention is opposite)
      if(pose.spine)this.joints.spine.rotation.set(-pose.spine[0]*DEG,-pose.spine[1]*DEG,-pose.spine[2]*DEG);
      ['l','r'].forEach(s=>{
        const a=pose[s+'Arm'];
        if(a)this.joints[s+'Arm'].rotation.set(a[0]*DEG, a[1]*DEG, -a[2]*DEG); // negate Z
        const e=pose[s+'Elbow'];
        if(e)this.joints[s+'Elbow'].rotation.set(e[0]*DEG,0,0);
        const l=pose[s+'Leg'];
        if(l)this.joints[s+'Leg'].rotation.set(l[0]*DEG, l[1]*DEG, -l[2]*DEG); // negate Z
        const k=pose[s+'Knee'];
        if(k)this.joints[s+'Knee'].rotation.set(k[0]*DEG,0,0);
      });
      const kb=pose.kb||'none';
      this.kbGroups.l.visible=(kb==='left');
      this.kbGroups.r.visible=(kb==='right');
      this.kbGroups.both.visible=(kb==='both');
    }

    updateBothKB(){
      if(!this.kbGroups.both.visible)return;
      this.root.updateWorldMatrix(true,true);
      const lp=new THREE.Vector3(),rp=new THREE.Vector3();
      // Use grip points (fingertips), not hand centers
      this._gripRefs.l.getWorldPosition(lp);
      this._gripRefs.r.getWorldPosition(rp);
      this.kbGroups.both.position.lerpVectors(lp,rp,0.5);
    }

    lerpPose(p1,p2,t){
      const lerp=(a,b)=>a+(b-a)*t;
      const lerpA=(a,b)=>[lerp(a[0],b[0]),lerp(a[1]||0,b[1]||0),lerp(a[2]||0,b[2]||0)];
      const pose={};
      pose.rootY=lerp(p1.rootY||0,p2.rootY||0);
      pose.spine=lerpA(p1.spine||[0,0,0],p2.spine||[0,0,0]);
      ['l','r'].forEach(s=>{
        pose[s+'Arm']=lerpA(p1[s+'Arm']||[0,0,0],p2[s+'Arm']||[0,0,0]);
        pose[s+'Elbow']=[lerp((p1[s+'Elbow']||[0])[0],(p2[s+'Elbow']||[0])[0])];
        pose[s+'Leg']=lerpA(p1[s+'Leg']||[0,0,0],p2[s+'Leg']||[0,0,0]);
        pose[s+'Knee']=[lerp((p1[s+'Knee']||[0])[0],(p2[s+'Knee']||[0])[0])];
      });
      pose.kb=t<0.5?(p1.kb||'none'):(p2.kb||p1.kb||'none');
      this.setPose(pose);
    }

    dispose(){
      this.root.traverse(o=>{if(o.geometry)o.geometry.dispose()});
      this._mats.forEach(m=>m.dispose());
      if(this.root.parent)this.root.parent.remove(this.root);
      if(this.kbGroups.both.parent)this.kbGroups.both.parent.remove(this.kbGroups.both);
    }
  }

  // ═════════════════════════════════════════════════════════════════
  //  EXERCISE POSE DATA
  // ═════════════════════════════════════════════════════════════════

  const EX={

    // ─── ROUTINE 1: Full Body Flow ───────────────────────

    'Kettlebell Swing':{
      speed:1.6,
      p1:{ // Bottom: hip hinge, KB between legs
        rootY:-0.06,
        spine:[-40,0,0],
        lArm:[45,25,-5],lElbow:[-15],
        rArm:[45,-25,5],rElbow:[-15],
        lLeg:[-20,0,5],lKnee:[35],
        rLeg:[-20,0,-5],rKnee:[35],
        kb:'both'
      },
      p2:{ // Top: standing tall, hips thrust, arms horizontal
        rootY:0.02,
        spine:[5,0,0],
        lArm:[-90,20,5],lElbow:[0],
        rArm:[-90,-20,-5],rElbow:[0],
        lLeg:[3,0,5],lKnee:[0],
        rLeg:[3,0,-5],rKnee:[0],
        kb:'both'
      }
    },

    'Goblet Squat':{
      speed:2.4,
      p1:{ // Standing, KB cupped at chest
        spine:[0,0,0],
        lArm:[-35,20,8],lElbow:[-95],
        rArm:[-35,-20,-8],rElbow:[-95],
        lLeg:[0,0,5],lKnee:[0],
        rLeg:[0,0,-5],rKnee:[0],
        kb:'both'
      },
      p2:{ // Deep squat, knees out
        rootY:-0.32,
        spine:[-12,0,0],
        lArm:[-35,20,10],lElbow:[-95],
        rArm:[-35,-20,-10],rElbow:[-95],
        lLeg:[-85,0,15],lKnee:[120],
        rLeg:[-85,0,-15],rKnee:[120],
        kb:'both'
      }
    },

    'KB Clean & Press':{
      speed:2.2,
      p1:{ // Rack: KB at right shoulder
        spine:[0,0,0],
        lArm:[5,0,12],lElbow:[-8],
        rArm:[-70,0,-15],rElbow:[-140],
        lLeg:[0,0,5],lKnee:[0],
        rLeg:[0,0,-5],rKnee:[0],
        kb:'right'
      },
      p2:{ // Overhead
        spine:[0,0,0],
        lArm:[5,0,12],lElbow:[-8],
        rArm:[-175,0,-5],rElbow:[-3],
        lLeg:[0,0,5],lKnee:[0],
        rLeg:[0,0,-5],rKnee:[0],
        kb:'right'
      }
    },

    'Single-Arm Row':{
      speed:1.8,
      camAngle:Math.PI/2, // default to side view
      p1:{ // Bent over, KB hanging
        spine:[-45,0,0],
        lArm:[-30,0,10],lElbow:[-15],
        rArm:[0,0,-5],rElbow:[-3],
        lLeg:[-15,0,5],lKnee:[20],
        rLeg:[12,0,-5],rKnee:[10],
        kb:'right'
      },
      p2:{ // Pulled up, elbow high
        spine:[-45,0,0],
        lArm:[-30,0,10],lElbow:[-15],
        rArm:[35,0,-18],rElbow:[-105],
        lLeg:[-15,0,5],lKnee:[20],
        rLeg:[12,0,-5],rKnee:[10],
        kb:'right'
      }
    },

    "Farmer's Hold":{
      // Static with subtle breathing sway
      speed:0,
      p1:{
        spine:[0,0,0],
        lArm:[3,0,14],lElbow:[-10],   // natural resting position, arm away from body
        rArm:[0,0,-8],rElbow:[-3],    // KB arm hanging
        lLeg:[0,0,5],lKnee:[2],
        rLeg:[0,0,-5],rKnee:[2],
        kb:'right'
      }
    },

    // ─── ROUTINE 2: Lower Body Power ─────────────────────

    'KB Deadlift':{
      speed:2.4,
      p1:{ // Bottom: deep hip hinge
        rootY:-0.10,
        spine:[-55,0,0],
        lArm:[0,0,5],lElbow:[0],
        rArm:[0,0,-5],rElbow:[0],
        lLeg:[-15,0,5],lKnee:[20],
        rLeg:[-15,0,-5],rKnee:[20],
        kb:'both'
      },
      p2:{ // Standing tall
        spine:[0,0,0],
        lArm:[0,0,5],lElbow:[0],
        rArm:[0,0,-5],rElbow:[0],
        lLeg:[0,0,5],lKnee:[0],
        rLeg:[0,0,-5],rKnee:[0],
        kb:'both'
      }
    },

    'KB Reverse Lunge':{
      speed:2.4,
      camAngle:Math.PI/2,
      p1:{ // Standing, goblet hold
        spine:[0,0,0],
        lArm:[-35,20,8],lElbow:[-95],
        rArm:[-35,-20,-8],rElbow:[-95],
        lLeg:[0,0,5],lKnee:[0],
        rLeg:[0,0,-5],rKnee:[0],
        kb:'both'
      },
      p2:{ // Lunge: left forward, right back — feet grounded
        rootY:-0.20,
        spine:[-5,0,0],
        lArm:[-35,20,8],lElbow:[-95],
        rArm:[-35,-20,-8],rElbow:[-95],
        lLeg:[-35,0,5],lKnee:[80],    // front leg, moderate bend
        rLeg:[28,0,-5],rKnee:[75],    // back leg, less extreme so foot stays grounded
        kb:'both'
      }
    },

    'KB Sumo Squat':{
      speed:2.4,
      p1:{ // Wide stance, KB hanging
        spine:[0,0,0],
        lArm:[8,0,5],lElbow:[0],
        rArm:[8,0,-5],rElbow:[0],
        lLeg:[0,-12,22],lKnee:[0],    // wide stance, toes out
        rLeg:[0,12,-22],rKnee:[0],
        kb:'both'
      },
      p2:{ // Deep sumo squat
        rootY:-0.30,
        spine:[-8,0,0],
        lArm:[8,0,5],lElbow:[0],
        rArm:[8,0,-5],rElbow:[0],
        lLeg:[-65,-12,28],lKnee:[105],
        rLeg:[-65,12,-28],rKnee:[105],
        kb:'both'
      }
    },

    'KB Calf Raise':{
      speed:1.4,
      p1:{
        spine:[0,0,0],
        lArm:[3,0,14],lElbow:[-8],
        rArm:[0,0,-8],rElbow:[-3],
        lLeg:[0,0,5],lKnee:[0],
        rLeg:[0,0,-5],rKnee:[0],
        kb:'right'
      },
      p2:{
        rootY:0.06,
        spine:[0,0,0],
        lArm:[3,0,14],lElbow:[-8],
        rArm:[0,0,-8],rElbow:[-3],
        lLeg:[0,0,5],lKnee:[0],
        rLeg:[0,0,-5],rKnee:[0],
        kb:'right'
      }
    },

    // ─── ROUTINE 3: Core & Control ───────────────────────

    'KB Halo':{
      // 4-keyframe circular animation: front → right → back → left
      speed:3.0,
      poses:[
        { // Front: KB in front of face
          spine:[0,0,0],
          lArm:[-85,0,15],lElbow:[-115],
          rArm:[-85,0,-15],rElbow:[-115],
          lLeg:[0,0,5],lKnee:[0],rLeg:[0,0,-5],rKnee:[0],
          kb:'both'
        },
        { // Right side: KB passing right side of head
          spine:[0,10,0],
          lArm:[-140,-20,12],lElbow:[-80],   // left arm reaches over to right
          rArm:[-100,0,-25],rElbow:[-70],     // right arm at side of head
          lLeg:[0,0,5],lKnee:[0],rLeg:[0,0,-5],rKnee:[0],
          kb:'both'
        },
        { // Back: KB behind head
          spine:[0,0,0],
          lArm:[-160,15,18],lElbow:[-60],
          rArm:[-160,-15,-18],rElbow:[-60],
          lLeg:[0,0,5],lKnee:[0],rLeg:[0,0,-5],rKnee:[0],
          kb:'both'
        },
        { // Left side: KB passing left side of head
          spine:[0,-10,0],
          lArm:[-100,0,25],lElbow:[-70],
          rArm:[-140,20,-12],rElbow:[-80],
          lLeg:[0,0,5],lKnee:[0],rLeg:[0,0,-5],rKnee:[0],
          kb:'both'
        }
      ]
    },

    'KB Russian Twist':{
      // Seated on floor (V-sit), leaning back, twisting side to side
      speed:1.8,
      camAngle:Math.PI/2,
      camPitch:0.6, // higher angle looking down
      p1:{ // KB twisted left
        rootY:-0.72,                          // hips on/near the ground
        spine:[35,-30,0],                     // lean BACK 35°, twist left 30°
        lArm:[-55,15,12],lElbow:[-65],       // arms hold KB to the left
        rArm:[-40,-20,-8],rElbow:[-55],
        lLeg:[-55,0,5],lKnee:[65],           // legs forward, knees bent, feet slightly off ground
        rLeg:[-55,0,-5],rKnee:[65],
        kb:'both'
      },
      p2:{ // KB twisted right
        rootY:-0.72,
        spine:[35,30,0],                      // lean back, twist right
        lArm:[-40,20,8],lElbow:[-55],
        rArm:[-55,-15,-12],rElbow:[-65],
        lLeg:[-55,0,5],lKnee:[65],
        rLeg:[-55,0,-5],rKnee:[65],
        kb:'both'
      }
    },

    'KB Side Bend':{
      // Left hand cupping back of head, KB in right hand, lean right
      speed:1.8,
      p1:{ // Standing upright
        spine:[0,0,0],
        lArm:[-140,0,25],lElbow:[-105],     // left hand behind/on head
        rArm:[0,0,-8],rElbow:[-2],           // right arm straight with KB
        lLeg:[0,0,5],lKnee:[0],
        rLeg:[0,0,-5],rKnee:[0],
        kb:'right'
      },
      p2:{ // Lateral bend to the right
        spine:[0,0,22],
        lArm:[-140,0,25],lElbow:[-105],
        rArm:[0,0,-8],rElbow:[-2],
        lLeg:[0,0,5],lKnee:[0],
        rLeg:[0,0,-5],rKnee:[0],
        kb:'right'
      }
    },

    'KB Figure 8':{
      // Wide squat, weave KB in figure-8 between legs
      speed:2.0,
      p1:{ // Passing KB under left leg
        rootY:-0.18,
        spine:[-18,-12,0],
        lArm:[25,12,12],lElbow:[-20],
        rArm:[-15,-8,-8],rElbow:[-15],
        lLeg:[-45,0,22],lKnee:[60],         // wide stance
        rLeg:[-45,0,-22],rKnee:[60],
        kb:'left'
      },
      p2:{ // Passing KB under right leg
        rootY:-0.18,
        spine:[-18,12,0],
        lArm:[-15,8,8],lElbow:[-15],
        rArm:[25,-12,-12],rElbow:[-20],
        lLeg:[-45,0,22],lKnee:[60],
        rLeg:[-45,0,-22],rKnee:[60],
        kb:'right'
      }
    },

    'KB Suitcase Carry':{
      // Walking gait with KB in right hand
      speed:1.1,
      p1:{ // Left foot forward, right arm swing
        spine:[0,0,0],
        lArm:[-15,0,14],lElbow:[-12],       // free arm swings forward naturally
        rArm:[5,0,-8],rElbow:[-3],           // KB arm stays at side
        lLeg:[-22,0,5],lKnee:[8],
        rLeg:[14,0,-5],rKnee:[0],
        kb:'right'
      },
      p2:{ // Right foot forward
        spine:[0,0,0],
        lArm:[12,0,14],lElbow:[-5],          // free arm swings back
        rArm:[-3,0,-8],rElbow:[-3],
        lLeg:[14,0,5],lKnee:[0],
        rLeg:[-22,0,-5],rKnee:[8],
        kb:'right'
      }
    },

    // ─── ROUTINE 4: Upper Body Strength ──────────────────

    'KB Press':{
      speed:2.0,
      p1:{ // Rack position
        spine:[0,0,0],
        lArm:[5,0,12],lElbow:[-8],
        rArm:[-70,0,-15],rElbow:[-140],
        lLeg:[0,0,5],lKnee:[0],
        rLeg:[0,0,-5],rKnee:[0],
        kb:'right'
      },
      p2:{ // Overhead
        spine:[0,0,0],
        lArm:[5,0,12],lElbow:[-8],
        rArm:[-175,0,-5],rElbow:[-3],
        lLeg:[0,0,5],lKnee:[0],
        rLeg:[0,0,-5],rKnee:[0],
        kb:'right'
      }
    },

    'KB Curl':{
      speed:2.0,
      p1:{ // Arms extended
        spine:[0,0,0],
        lArm:[0,0,5],lElbow:[-10],
        rArm:[0,0,-5],rElbow:[-10],
        lLeg:[0,0,5],lKnee:[0],
        rLeg:[0,0,-5],rKnee:[0],
        kb:'both'
      },
      p2:{ // Deep curl
        spine:[0,0,0],
        lArm:[0,0,5],lElbow:[-135],
        rArm:[0,0,-5],rElbow:[-135],
        lLeg:[0,0,5],lKnee:[0],
        rLeg:[0,0,-5],rKnee:[0],
        kb:'both'
      }
    },

    'KB Upright Row':{
      speed:2.0,
      p1:{ // KB at waist
        spine:[0,0,0],
        lArm:[-5,0,5],lElbow:[-5],
        rArm:[-5,0,-5],rElbow:[-5],
        lLeg:[0,0,5],lKnee:[0],
        rLeg:[0,0,-5],rKnee:[0],
        kb:'both'
      },
      p2:{ // Elbows flared high
        spine:[0,0,0],
        lArm:[-25,0,55],lElbow:[-120],
        rArm:[-25,0,-55],rElbow:[-120],
        lLeg:[0,0,5],lKnee:[0],
        rLeg:[0,0,-5],rKnee:[0],
        kb:'both'
      }
    },

    // ─── ROUTINE 5: Recovery Flow ────────────────────────

    'KB Goblet Squat Hold':{
      speed:0,
      p1:{
        rootY:-0.32,
        spine:[-12,0,0],
        lArm:[-35,20,10],lElbow:[-95],
        rArm:[-35,-20,-10],rElbow:[-95],
        lLeg:[-85,0,15],lKnee:[120],
        rLeg:[-85,0,-15],rKnee:[120],
        kb:'both'
      }
    },

    'KB Around the World':{
      // 4-keyframe: pass KB in circle around waist
      speed:2.8,
      poses:[
        { // Front: KB in front at waist
          spine:[0,-12,0],
          lArm:[-20,10,10],lElbow:[-15],
          rArm:[-15,-5,-8],rElbow:[-12],
          lLeg:[0,0,5],lKnee:[0],rLeg:[0,0,-5],rKnee:[0],
          kb:'left'
        },
        { // Right side: KB at right hip
          spine:[0,8,0],
          lArm:[5,0,12],lElbow:[-5],
          rArm:[10,-10,-12],rElbow:[-10],
          lLeg:[0,0,5],lKnee:[0],rLeg:[0,0,-5],rKnee:[0],
          kb:'right'
        },
        { // Back: KB behind body
          spine:[0,12,0],
          lArm:[15,5,8],lElbow:[-8],
          rArm:[20,-10,-10],rElbow:[-10],
          lLeg:[0,0,5],lKnee:[0],rLeg:[0,0,-5],rKnee:[0],
          kb:'right'
        },
        { // Left side: KB at left hip
          spine:[0,-8,0],
          lArm:[10,10,12],lElbow:[-10],
          rArm:[5,0,-12],rElbow:[-5],
          lLeg:[0,0,5],lKnee:[0],rLeg:[0,0,-5],rKnee:[0],
          kb:'left'
        }
      ]
    },

    'KB Good Morning':{
      speed:2.6,
      p1:{ // Standing, KB behind neck
        spine:[0,0,0],
        lArm:[-150,20,15],lElbow:[-80],
        rArm:[-150,-20,-15],rElbow:[-80],
        lLeg:[0,0,5],lKnee:[3],
        rLeg:[0,0,-5],rKnee:[3],
        kb:'both'
      },
      p2:{ // Hinged forward deeply
        rootY:-0.04,
        spine:[-55,0,0],
        lArm:[-150,20,15],lElbow:[-80],
        rArm:[-150,-20,-15],rElbow:[-80],
        lLeg:[-8,0,5],lKnee:[12],
        rLeg:[-8,0,-5],rKnee:[12],
        kb:'both'
      }
    }
  };

  // Slow variants
  EX['KB Halo (slow)']={poses:EX['KB Halo'].poses,speed:5.0};
  EX['KB Figure 8 (slow)']={p1:EX['KB Figure 8'].p1,p2:EX['KB Figure 8'].p2,speed:4.0};


  // ═════════════════════════════════════════════════════════════════
  //  VIEWER
  // ═════════════════════════════════════════════════════════════════

  class Viewer{
    constructor(container,exName){
      this.container=container;
      this.exName=exName;
      this.data=EX[exName];
      this.time=0;
      this.dead=false;
      this.orbitAngle=(this.data&&this.data.camAngle)||0;
      this.orbitPitch=(this.data&&this.data.camPitch)||0.25;
      this.orbitDist=3.0;
      this.dragging=false;
      this.lastX=0;this.lastY=0;
      this._boundMove=this._onMove.bind(this);
      this._boundUp=this._onUp.bind(this);
      this._lastFrame=performance.now();
      this._init();
    }

    _init(){
      const w=this.container.clientWidth||200;
      const h=this.container.clientHeight||250;
      this.scene=new THREE.Scene();
      this.camera=new THREE.PerspectiveCamera(32,w/h,0.1,20);
      this._updateCam();
      this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
      this.renderer.setSize(w,h);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
      this.renderer.setClearColor(0x000000,0);
      this.container.innerHTML='';
      this.container.appendChild(this.renderer.domElement);
      const c=this.renderer.domElement;
      c.style.cursor='grab';c.style.touchAction='none';c.style.display='block';

      // 3-point lighting
      this.scene.add(new THREE.AmbientLight(0xffffff,0.5));
      const key=new THREE.DirectionalLight(0xffffff,0.9);key.position.set(2,3,4);this.scene.add(key);
      const fill=new THREE.DirectionalLight(0xffffff,0.3);fill.position.set(-2,2,-3);this.scene.add(fill);
      this.scene.add(new THREE.HemisphereLight(0xfef7f0,0xd4cbbf,0.35));

      this.mannequin=new Mannequin(this.scene);
      // Set initial pose
      if(this.data){
        const initPose=this.data.poses?this.data.poses[0]:this.data.p1;
        if(initPose)this.mannequin.setPose(initPose);
      }
      this.mannequin.updateBothKB();

      // Labels
      this.container.style.position='relative';

      this._setupInput(c);
      this._animate();
    }

    _updateCam(){
      const x=Math.sin(this.orbitAngle)*Math.cos(this.orbitPitch)*this.orbitDist;
      const y=Math.sin(this.orbitPitch)*this.orbitDist+0.85;
      const z=Math.cos(this.orbitAngle)*Math.cos(this.orbitPitch)*this.orbitDist;
      this.camera.position.set(x,y,z);
      this.camera.lookAt(0,0.85,0);
    }

    _setupInput(c){
      c.addEventListener('mousedown',e=>{
        this.dragging=true;this.lastX=e.clientX;this.lastY=e.clientY;
        c.style.cursor='grabbing';

      });
      window.addEventListener('mousemove',this._boundMove);
      window.addEventListener('mouseup',this._boundUp);
      c.addEventListener('touchstart',e=>{
        if(e.touches.length===1){this.dragging=true;this.lastX=e.touches[0].clientX;this.lastY=e.touches[0].clientY;if(this._hint)this._hint.style.opacity='0'}
      },{passive:true});
      c.addEventListener('touchmove',e=>{
        if(!this.dragging||e.touches.length!==1)return;e.preventDefault();
        const dx=e.touches[0].clientX-this.lastX,dy=e.touches[0].clientY-this.lastY;
        this.orbitAngle+=dx*0.012;this.orbitPitch=Math.max(-0.4,Math.min(0.75,this.orbitPitch+dy*0.006));
        this.lastX=e.touches[0].clientX;this.lastY=e.touches[0].clientY;
        this._updateCam();      },{passive:false});
      c.addEventListener('touchend',()=>{this.dragging=false},{passive:true});
    }

    _onMove(e){
      if(!this.dragging)return;
      const dx=e.clientX-this.lastX,dy=e.clientY-this.lastY;
      this.orbitAngle+=dx*0.012;this.orbitPitch=Math.max(-0.4,Math.min(0.75,this.orbitPitch+dy*0.006));
      this.lastX=e.clientX;this.lastY=e.clientY;
      this._updateCam();    }

    _onUp(){this.dragging=false;const c=this.renderer&&this.renderer.domElement;if(c)c.style.cursor='grab'}

    _animate(){
      if(this.dead)return;
      requestAnimationFrame(()=>this._animate());
      const now=performance.now();
      const dt=(now-this._lastFrame)/1000;
      this._lastFrame=now;
      this.time+=dt;

      const d=this.data;
      if(!d){this.renderer.render(this.scene,this.camera);return}

      if(d.poses){
        // Multi-keyframe: cycle through poses sequentially
        const n=d.poses.length;
        const phase=(this.time/d.speed)%1;
        const idx=phase*n;
        const i=Math.floor(idx)%n;
        const j=(i+1)%n;
        const lt=idx-Math.floor(idx);
        // Smoothstep for nice easing between keyframes
        const st=lt*lt*(3-2*lt);
        this.mannequin.lerpPose(d.poses[i],d.poses[j],st);

      } else if(d.p2&&d.speed>0){
        // Two-pose ping-pong
        const t=(1-Math.cos(this.time*2*Math.PI/d.speed))/2;
        this.mannequin.lerpPose(d.p1,d.p2,t);

      } else {
        // Static pose with subtle idle breathing
        this.mannequin.setPose(d.p1);
        // Add gentle breathing sway
        const breath=Math.sin(this.time*1.5)*0.012;
        this.mannequin.joints.spine.rotation.x+=breath;
      }

      this.mannequin.updateBothKB();
      this.renderer.render(this.scene,this.camera);
    }

    resize(){
      const w=this.container.clientWidth,h=this.container.clientHeight;
      if(!w||!h)return;
      this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.renderer.setSize(w,h);
    }

    dispose(){
      this.dead=true;
      window.removeEventListener('mousemove',this._boundMove);
      window.removeEventListener('mouseup',this._boundUp);
      this.mannequin.dispose();this.renderer.dispose();
      if(this.renderer.domElement.parentNode)this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }

  // ═════════════════════════════════════════════════════════════════
  //  PUBLIC API
  // ═════════════════════════════════════════════════════════════════

  const active=new Map();   // container → Viewer
  const MAX_CONTEXTS=3;     // max simultaneous WebGL contexts

  // Evict oldest viewers when we exceed the limit
  function evictIfNeeded(){
    if(active.size<=MAX_CONTEXTS)return;
    // Find viewers not in viewport and dispose them
    const entries=[...active.entries()];
    for(let i=0;i<entries.length&&active.size>MAX_CONTEXTS;i++){
      const [c,v]=entries[i];
      const rect=c.getBoundingClientRect();
      const inView=rect.bottom>0&&rect.top<window.innerHeight;
      if(!inView){v.dispose();active.delete(c);
        // Leave a placeholder so it can re-init when scrolled back
        c.innerHTML='<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#b8ab9c;font-size:10px;cursor:pointer" onclick="Exercise3D.initVisible()">Tap to load 3D</div>';
      }
    }
  }

  // IntersectionObserver: auto-init when scrolled into view, dispose when out
  const observer=new IntersectionObserver(entries=>{
    entries.forEach(entry=>{
      const el=entry.target;
      const name=el.dataset.exercise;
      if(!name||!EX[name])return;
      if(entry.isIntersecting){
        // Only init if not already active
        if(!active.has(el)){
          evictIfNeeded();
          const v=new Viewer(el,name);
          active.set(el,v);
        }
      }else{
        // Dispose when scrolled out of view (if we have many active)
        if(active.has(el)&&active.size>1){
          active.get(el).dispose();active.delete(el);
          el.innerHTML='<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#b8ab9c;font-size:10px">Scroll to load</div>';
        }
      }
    });
  },{rootMargin:'100px 0px',threshold:0.1});

  window.Exercise3D={
    EXERCISES:EX,
    create(container,exName){
      if(active.has(container))active.get(container).dispose();
      evictIfNeeded();
      const v=new Viewer(container,exName);active.set(container,v);return v;
    },
    destroy(container){if(active.has(container)){active.get(container).dispose();active.delete(container)}},
    destroyAll(){active.forEach(v=>v.dispose());active.clear()},
    has(name){return!!EX[name]},
    initVisible(){
      document.querySelectorAll('.exercise-3d-container').forEach(el=>{
        if(active.has(el))return;
        const det=el.closest('details');
        if(det&&!det.open)return;
        // Observe for viewport-based lazy loading instead of init all at once
        observer.observe(el);
      });
    },
    cleanup(){
      active.forEach((v,c)=>{
        if(!document.body.contains(c)){v.dispose();active.delete(c);observer.unobserve(c)}
      });
    }
  };
})();
