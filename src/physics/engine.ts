// Pool physics engine, ported from physics/pool-physics-lab.html (the <script id="engine"> block, 2026-11-11, WPA pockets).
// Kept line-for-line close to the lab so changes there can be diffed across. Pure TS: no React, no DOM.
export type Game=8|9;
export interface Ball{x:number;y:number;vx:number;vy:number;wx:number;wy:number;wz:number;on:boolean;z?:number;vz?:number}
export interface Shot{ang:number;speed:number;a:number;b:number;elev?:number}
export interface Cue{maxSpeed:number;breakSpeed:number;squirt:number;tipLimit:number;maxElev:number;massRatio?:number}
export interface Ev{t:'bb'|'rail'|'pocket'|'off'|'land';a:number;b?:number;x:number;y:number;cut?:number;thr?:number;air?:boolean}
type Vec3=[number,number,number];
interface Contact{i:number;j:number;nx:number;ny:number;nz:number;tb:number;cut:number;jn:number;goal:number;f:Vec3|null}
// Pool physics. SI units, y-up right-handed coordinates, z points up out of the table.
// Ball state: position (x,y), velocity (vx,vy), angular velocity (wx,wy,wz).
export const P={R:0.028575,L:2.2352,W:1.1176,g:9.81,
  mus:0.2,    // ball-cloth sliding friction
  mur:0.008,  // rolling resistance: new tournament cloth, table speed 125 (a lag takes 7.4 s per length)
  musp:0.0117,// spin-in-place friction: side spin dies at 10 rad/s^2 (measured range 5 to 15)
  eb:0.95,    // ball-ball restitution
  ec:0.875,   // cushion restitution: a rolling ball square into a rail leaves at 0.82 of its speed (measured 0.818)
  muc:0.36,   // ball-cushion friction (rubber wraps the ball, so higher than cloth)
  nose:0.27,  // cushion nose height: sin of contact angle (nose at 63.5% of ball diameter)
  et:0.5,     // ball-slate restitution: a ball landing from a hop keeps half its vertical speed
  lift:0.6,   // rebound of the cue strike itself at jump angles (feel knob: jump height and reach; 0.6 clears a ball from about 65% power)
  hopMin:0.25,// m/s: the cloth absorbs this much rebound (as energy): up = sqrt((e*vn)^2 - hopMin^2), slower stays down
  grip:0.15,  // share of cloth friction that bites during the cue strike itself (feel knob: lower = a masse runs out further before it hooks)
  railH:0.04, // a ball whose centre has risen this far clears the cushion and leaves the table
  h:0.001};   // fixed timestep, s
// Stick stats hook: these are the numbers a cue would change.
// maxSpeed is a real power shot (Dr. Dave: 3.2 to 4.5 m/s), so normal play uses the whole power slider; breakSpeed is the
// cap for the opening shot only (real 11 to 13). massRatio = ball mass / cue mass (6 oz ball, 19 oz cue).
export const CUE: Cue={maxSpeed:4.5,breakSpeed:12,squirt:0.035,tipLimit:0.5,maxElev:1.4,massRatio:0.316};
// sqrt is exactly rounded on every JS engine and Math.hypot is not (and is slow), so the engine uses this.
const hyp=(x:number,y:number,z=0)=>Math.sqrt(x*x+y*y+z*z);

// Cushion noses as line segments (with pocket jaws), built for one quadrant and mirrored.
// Pocket geometry is the WPA table spec (wpapool.com, Recommended Equipment Specifications, section 9), all measured
// from the cushion nose line, which is the edge of the 100 x 50 in playing field:
//  corner: mouth 4.5 to 4.625 in between the nose points (ours 4.57), facings cut at 142 deg, shelf 1 to 2.25 in (ours 1.6)
//  side:   mouth 5 to 5.125 in (ours 5.12), facings cut at 104 deg, shelf 0 to 0.375 in (ours 0.2)
// Shelf = middle of the mouth line to where the slate drops away, so every hole sits outside the playing field, in the rail.
export const SEGS:number[][]=[],HOLES:number[][]=[];
export const POCKET={cc:0.082,sc:0.065,deep:0.05,ca:38*Math.PI/180,sa:14*Math.PI/180,r:0.06,cornerOut:0.03,sideOut:0.065};
{const {L,W}=P,{cc,sc,deep,ca,sa,r,cornerOut,sideOut}=POCKET,cj=deep/Math.tan(ca),sj=deep*Math.tan(sa);
 for(const [fx,fy] of [[0,0],[1,0],[0,1],[1,1]]){
  const X=(x:number)=>fx?L-x:x,Y=(y:number)=>fy?W-y:y;
  for(const [a,b,c,d] of [[cc,0,L/2-sc,0],[0,cc,0,W/2],[cc,0,cc-cj,-deep],[0,cc,-deep,cc-cj],[L/2-sc,0,L/2-sc+sj,-deep]])
   SEGS.push([X(a),Y(b),X(c),Y(d)]);
  HOLES.push([X(-cornerOut),Y(-cornerOut),r]);
 }
 HOLES.push([L/2,-sideOut,r],[L/2,W+sideOut,r]);}

// Rack spots [id,x,y] for 8-ball or 9-ball: apex on the foot spot, g between neighbours' centres.
// 9-ball is the diamond with the 1 at the apex and the 9 in the middle. The caller adds any random play.
const RACKS:Record<Game,number[][]>={8:[[1],[9,2],[10,8,3],[11,7,14,4],[5,13,15,6,12]],9:[[1],[2,3],[4,9,5],[6,7],[8]]};
export function rack(game:Game,g=2*P.R+3e-4){
  const out:[number,number,number][]=[];
  RACKS[game].forEach((r,i)=>r.forEach((id,k)=>out.push([id,0.75*P.L+i*g*Math.cos(Math.PI/6),P.W/2+(k-(r.length-1)/2)*g])));
  return out;
}

// Cue strike. s={ang,speed,a,b}: a = tip offset right, b = tip offset up, in ball radii.
// elev = cue elevation in radians (0 = level). The cue's impulse runs down its own axis, so with elevation:
//  - forward speed is speed*cos(elev) and the ball is driven into the slate at speed*sin(elev), which bounces it up (jump);
//  - side offset a spins the ball about an axis tilted forward by elev, i.e. partly about its line of travel (masse).
// Spin = 2.5*speed/R * (a*(r x d) + b*(u x d)) for cue axis d, tip-right r, tip-up u. Maths: https://claude.ai/artifact/TVh3RwdDyQP2htw8iHVYFd
export function strike(b:Ball,s:Shot,cue:Cue=CUE){
  const el=s.elev||0,ce=Math.cos(el),se=Math.sin(el);
  // shot.speed is the ball speed of a centre hit. Off centre, part of the stroke goes into spin, so the ball leaves
  // slower: v = v0 (1+m)/(1+m+2.5 off^2), the standard tip-ball impact result (32% slower at the miscue limit).
  const mr=cue.massRatio??0.316,v=s.speed*(1+mr)/(1+mr+2.5*(s.a*s.a+s.b*s.b));
  const ang=s.ang+s.a*cue.squirt,dx=Math.cos(ang),dy=Math.sin(ang),k=2.5*v/P.R;
  b.vx=v*dx*ce;b.vy=v*dy*ce;b.wx=-k*s.b*dy+k*s.a*se*dx;b.wy=k*s.b*dx+k*s.a*se*dy;b.wz=k*s.a*ce;
  b.z=0;b.vz=0;
  // Past 45 degrees the ball is increasingly trapped between tip and slate, so the rebound fades: lift*g/(1+g^4)^(1/4)
  // with g = 16cos^8(elev), a smooth version of min(1,g). 30 degrees gives a long low hop, about 42 the highest, and
  // from 60 up the ball stays on the cloth at any power (masse).
  if(se>0){b.vz=-v*se;const g=16*ce**8;bounce(b,P.lift*g/Math.sqrt(Math.sqrt(1+g**4)),P.mus*P.grip);}
}
// A ball meets the slate at downward speed -vz: it rebounds at e times that, and cloth friction acts on the slipping
// contact point for the length of the impact (impulse mu * normal impulse, capped at the no-slip value).
function bounce(b:Ball,e:number,mu:number){
  // The cloth soaks up a fixed amount of energy, so the hop grows smoothly from zero at e*vn = hopMin (no cliff
  // where one notch of power suddenly adds a 50 ms flight).
  const R=P.R,vn=-(b.vz??0),u2=e*e*vn*vn-P.hopMin*P.hopMin,up=u2>0?Math.sqrt(u2):0;
  const ux=b.vx-R*b.wy,uy=b.vy+R*b.wx,us=hyp(ux,uy);
  if(us>1e-9){const k=Math.min(mu*(vn+up),us/3.5),cx=ux/us*k,cy=uy/us*k;b.vx-=cx;b.vy-=cy;b.wx-=2.5/R*cy;b.wy+=2.5/R*cx;}
  b.z=0;b.vz=up;
}

const cutOf=(a:Ball,nx:number,ny:number)=>Math.acos(Math.max(-1,Math.min(1,(a.vx*nx+a.vy*ny)/(hyp(a.vx,a.vy)||1))));

// Friction at a ball-ball contact with normal (nx,ny) from a to b and normal impulse jn: gives cut throw,
// spin throw and spin transfer. Returns the impulse without applying it.
function rub(a:Ball,b:Ball,nx:number,ny:number,jn:number):Vec3|null{
  const R=P.R,Wx=a.wx+b.wx,Wy=a.wy+b.wy,Wz=a.wz+b.wz;
  let rx=a.vx-b.vx-R*Wz*ny,ry=a.vy-b.vy+R*Wz*nx;const rz=R*(Wx*ny-Wy*nx);
  const rn=rx*nx+ry*ny;rx-=rn*nx;ry-=rn*ny;
  const vt=hyp(rx,ry,rz);if(vt<=1e-9)return null;
  // Friction falls with surface speed (Alciatore's fit); capped at the no-slip impulse.
  const mu=0.009951+0.108*Math.exp(-1.088*vt),jt=Math.min(mu*jn,vt/7);
  return [rx/vt*jt,ry/vt*jt,rz/vt*jt];
}
// Apply a contact: friction impulse f, and the normal impulse jn unless the cluster solver already applied it.
function land(a:Ball,b:Ball,ev:Ev[]|undefined,i:number,j:number,nx:number,ny:number,jn:number,cut:number,f:Vec3|null){
  if(f){const k=-2.5/P.R,tx=f[0],ty=f[1],tz=f[2];
    a.vx-=tx;a.vy-=ty;b.vx+=tx;b.vy+=ty;
    const cx=k*ny*tz,cy=-k*nx*tz,cz=k*(nx*ty-ny*tx);
    a.wx+=cx;a.wy+=cy;a.wz+=cz;b.wx+=cx;b.wy+=cy;b.wz+=cz;}
  a.vx-=jn*nx;a.vy-=jn*ny;b.vx+=jn*nx;b.vy+=jn*ny;
  // cut and thr describe a moving ball a hitting a resting ball b (the cue ball's first hit); thr is b's departure
  // from the line of centres.
  if(ev)ev.push({t:'bb',a:i,b:j,x:a.x,y:a.y,cut,thr:Math.atan2(nx*b.vy-ny*b.vx,nx*b.vx+ny*b.vy)});
}
// Ball-ball impact for a lone pair.
function collide(a:Ball,b:Ball,ev:Ev[]|undefined,i:number,j:number,nx:number,ny:number){
  const jn=(1+P.eb)/2*((a.vx-b.vx)*nx+(a.vy-b.vy)*ny);
  land(a,b,ev,i,j,nx,ny,jn,cutOf(a,nx,ny),rub(a,b,nx,ny,jn));
}

// Cushion impact. The nose touches the ball above centre, so the rail grips spin as well as speed.
// The impulse is applied in small slices so the slip direction can change during the hit
// (that is what lets reverse english bite and running english release). (ax,ay) points into the cushion.
function cushion(b:Ball,ax:number,ay:number){
  const R=P.R,sn=P.nose,cs=Math.sqrt(1-sn*sn),bx=-ay,by=ax,N=40;
  let vx=b.vx*ax+b.vy*ay,vy=b.vx*bx+b.vy*by,wx=b.wx*ax+b.wy*ay,wy=b.wx*bx+b.wy*by;
  const dp=(1+P.ec)*vx*cs/N;
  for(let i=0;i<N;i++){
    vx-=dp*cs;
    const sy=vy+R*(b.wz*cs-wx*sn),s2=-vx*sn-R*wy,s=hyp(sy,s2);
    if(s<1e-9)continue;
    const j=Math.min(P.muc*dp,s/3.5),jy=-j*sy/s,j2=-j*s2/s;
    vx-=j2*sn;vy+=jy;wx-=2.5/R*jy*sn;wy-=2.5/R*j2;b.wz+=2.5/R*jy*cs;
  }
  b.vx=vx*ax+vy*bx;b.vy=vx*ay+vy*by;b.wx=wx*ax+wy*bx;b.wy=wx*ay+wy*by;
}

// A contact where one ball is in the air: a frictionless bounce along the 3D line of centres. A ball sitting on
// the slate cannot be driven down into it.
function air(a:Ball,b:Ball,c:Contact,ev?:Ev[]){
  const {nx,ny,nz,tb}=c,o=[a.vx,a.vy,a.vz||0,b.vx,b.vy,b.vz||0],jn=(1+P.eb)/2*((a.vx-b.vx)*nx+(a.vy-b.vy)*ny+((a.vz||0)-(b.vz||0))*nz),hn=hyp(nx,ny)||1,cut=cutOf(a,nx/hn,ny/hn);
  a.vx-=jn*nx;a.vy-=jn*ny;a.vz=(a.vz||0)-jn*nz;b.vx+=jn*nx;b.vy+=jn*ny;b.vz=(b.vz||0)+jn*nz;
  for(const q of [a,b])if(!((q.z??0)>0)&&(q.vz??0)<0)q.vz=0;
  if(!nx&&!ny)a.vx+=1e-3; // dead centre on top of a ball is a balance point that never settles: tip it off, always the same way
  // Put both balls where they would be had the bounce happened at the instant of contact (as the ground path does);
  // without this a ball coming down on top of another sinks into it and can come to rest overlapping.
  a.x+=(a.vx-o[0])*tb;a.y+=(a.vy-o[1])*tb;if((a.z??0)>0)a.z!+=(a.vz!-o[2])*tb;
  b.x+=(b.vx-o[3])*tb;b.y+=(b.vy-o[4])*tb;if((b.z??0)>0)b.z!+=(b.vz!-o[5])*tb;
  if(ev)ev.push({t:'bb',a:c.i,b:c.j,x:a.x,y:a.y,cut,thr:0,air:true});
}
// One ball pair: if the balls overlap and are closing, record the contact (normal and time since contact).
function touch(B:Ball[],i:number,j:number,C:Contact[]|null):Contact[]|null{
  const a=B[i],b=B[j],R=P.R;if(!b.on)return C;
  const dx=b.x-a.x,dy=b.y-a.y,dz=(b.z||0)-(a.z||0),d2=dx*dx+dy*dy+dz*dz;if(d2>=4*R*R)return C; // 3D, so a high ball passes over
  const wx=b.vx-a.vx,wy=b.vy-a.vy,wv=(b.vz||0)-(a.vz||0),pw=dx*wx+dy*wy+dz*wv;if(pw>=0)return C;
  const w2=wx*wx+wy*wy+wv*wv,tb=Math.min(P.h,(pw+Math.sqrt(pw*pw-w2*(d2-4*R*R)))/w2);
  const px=dx-wx*tb,py=dy-wy*tb,pz=dz-wv*tb,d=hyp(px,py,pz);
  (C||(C=[])).push({i,j,nx:px/d,ny:py/d,nz:pz/d,tb,cut:0,jn:0,goal:0,f:null});return C;
}

// Advance every ball by one timestep. Returns true while anything is still travelling.
export function step(B:Ball[],ev?:Ev[]):boolean{
  const {R,L,W,h,g}=P;let moving=false;
  for(const b of B){
    if(!b.on||!(b.vx||b.vy||b.wx||b.wy||b.wz||b.vz))continue;
    if((b.z??0)>0||(b.vz??0)>0){ // in the air: gravity only, spin is kept until the ball lands
      b.x+=b.vx*h;b.y+=b.vy*h;b.vz=(b.vz??0)-g*h;b.z=(b.z||0)+b.vz*h;moving=true;
      if(b.z<=0){bounce(b,P.et,P.mus);if(ev)ev.push({t:'land',a:B.indexOf(b),x:b.x,y:b.y});}
      continue;
    }
    const ux=b.vx-R*b.wy,uy=b.vy+R*b.wx,us=hyp(ux,uy),ox=b.vx,oy=b.vy;
    if(us>1e-9){ // sliding: friction opposes the slip of the contact point
      const k=Math.min(P.mus*g*h,us/3.5),cx=ux/us*k,cy=uy/us*k;
      b.vx-=cx;b.vy-=cy;b.wx-=2.5/R*cy;b.wy+=2.5/R*cx;moving=true;
    }else{ // rolling
      const sp=hyp(b.vx,b.vy),dec=P.mur*g*h;
      if(sp<=dec)b.vx=b.vy=0;else{const f=(sp-dec)/sp;b.vx*=f;b.vy*=f;moving=true;}
      b.wx=-b.vy/R;b.wy=b.vx/R;
    }
    const dz=2.5*P.musp*g/R*h;b.wz=Math.abs(b.wz)<=dz?0:b.wz-Math.sign(b.wz)*dz;
    b.x+=(ox+b.vx)/2*h;b.y+=(oy+b.vy)/2*h;
  }
  // Ball-ball. Every contact in the step is found first, at the instant of contact so the normal (and the cut
  // angle) is exact. Only pairs with a moving ball are scanned.
  let C:Contact[]|null=null;const mv:number[]=[];
  for(let i=0;i<B.length;i++){const b=B[i];if(b.on&&(b.vx||b.vy||b.vz))mv.push(i);}
  if(mv.length)for(let i=0;i<B.length;i++){const a=B[i];if(!a.on)continue;
    if(a.vx||a.vy||a.vz){for(let j=i+1;j<B.length;j++)C=touch(B,i,j,C);}
    else for(let q=0;q<mv.length;q++)if(mv[q]>i)C=touch(B,i,mv[q],C);}
  if(C){
    C=C.filter(c=>{if(!c.nz)return true;air(B[c.i],B[c.j],c,ev);return false;});
    const deg:number[]=[],v0:number[][]=[];
    for(const c of C)for(const k of [c.i,c.j]){deg[k]=(deg[k]||0)+1;const s=v0[k]||(v0[k]=[B[k].vx,B[k].vy,0]);if(c.tb>s[2])s[2]=c.tb;}
    // A ball touching two or more others at once (the rack, a cluster) is solved together, so the outcome
    // does not depend on the order of the balls: Gauss-Seidel on the normal impulses, swept both ways.
    const M=C.filter(c=>deg[c.i]>1||deg[c.j]>1);
    for(const c of M){const a=B[c.i],b=B[c.j];c.cut=cutOf(a,c.nx,c.ny);c.jn=0;
      c.goal=-P.eb*Math.max(0,(a.vx-b.vx)*c.nx+(a.vy-b.vy)*c.ny);}
    for(let it=0,err=1;it<200&&err>1e-13;it++){err=0;
      for(let q=0;q<M.length;q++){const c=M[it&1?M.length-1-q:q],a=B[c.i],b=B[c.j];
        const j1=Math.max(0,c.jn+((a.vx-b.vx)*c.nx+(a.vy-b.vy)*c.ny-c.goal)/2),dj=j1-c.jn;c.jn=j1;
        a.vx-=dj*c.nx;a.vy-=dj*c.ny;b.vx+=dj*c.nx;b.vy+=dj*c.ny;if(dj>err)err=dj;else if(-dj>err)err=-dj;}}
    // Friction for the whole cluster is worked out from one snapshot and then applied, again so order does not matter.
    for(const c of M)c.f=c.jn>0?rub(B[c.i],B[c.j],c.nx,c.ny,c.jn):null;
    for(const c of C){const a=B[c.i],b=B[c.j];
      if(!(deg[c.i]>1||deg[c.j]>1))collide(a,b,ev,c.i,c.j,c.nx,c.ny);
      else if(c.jn>0)land(a,b,ev,c.i,c.j,c.nx,c.ny,0,c.cut,c.f);}
    for(const k in v0){const b=B[k],s=v0[k];b.x+=(b.vx-s[0])*s[2];b.y+=(b.vy-s[1])*s[2];}
  }
  for(let i=0;i<B.length;i++){const b=B[i];
    if(!b.on||!(b.vx||b.vy)||(b.x>R&&b.x<L-R&&b.y>R&&b.y<W-R))continue;
    if((b.z??0)>P.railH){ // above the cushion: no rail or pocket can stop it, and once past the nose line it has left the table
      if(b.x<0||b.x>L||b.y<0||b.y>W){b.on=false;b.vx=b.vy=b.wx=b.wy=b.wz=b.z=b.vz=0;if(ev)ev.push({t:'off',a:i,x:b.x,y:b.y});}
      continue;}
    let out=b.x<-0.012||b.x>L+0.012||b.y<-0.012||b.y>W+0.012;
    for(const H of HOLES){const hx=b.x-H[0],hy=b.y-H[1];if(hx*hx+hy*hy<H[2]*H[2])out=true;}
    if(out){b.on=false;b.vx=b.vy=b.wx=b.wy=b.wz=b.z=b.vz=0;if(ev)ev.push({t:'pocket',a:i,x:b.x,y:b.y});continue;}
    for(const s of SEGS){
      const ex=s[2]-s[0],ey=s[3]-s[1];
      let t=((b.x-s[0])*ex+(b.y-s[1])*ey)/(ex*ex+ey*ey);t=t<0?0:t>1?1:t;
      const dx=b.x-s[0]-t*ex,dy=b.y-s[1]-t*ey,d2=dx*dx+dy*dy;if(d2>=R*R||d2===0)continue;
      const d=Math.sqrt(d2),nx=dx/d,ny=dy/d,vn=b.vx*nx+b.vy*ny;if(vn>=0)continue;
      const tb=Math.min(h,(R-d)/-vn);
      b.x-=b.vx*tb;b.y-=b.vy*tb;
      if(ev)ev.push({t:'rail',a:i,x:b.x,y:b.y});
      cushion(b,-nx,-ny);
      b.x+=b.vx*tb;b.y+=b.vy*tb;
    }
  }
  if(!moving)for(const b of B)b.wz=0; // sidespin left on a ball at rest must not leak into the next shot
  return moving;
}

// The aim line is the real simulation run ahead on a copy of the table, so it is exact.
// len = metres of path shown after the cue ball's first contact (Infinity = to rest).
export function predict(B:Ball[],shot:Shot,len:number,stick?:Cue,maxSteps=25000){
  const S=B.map(b=>({...b})),ev:Ev[]=[],c=S[0],cue:number[][]=[[c.x,c.y]],ob:number[][]=[];
  strike(c,shot,stick);
  let split=-1,hit:Ev|null=null,o:Ball|null=null,cl=0,ol=0,scratch=false,apex=0;const lands:number[][]=[];
  const add=(arr:number[][],b:Ball,count:boolean)=>{const q=arr[arr.length-1],d=q?hyp(b.x-q[0],b.y-q[1]):0;arr.push([b.x,b.y,b.z||0]);return count?d:0;};
  const idle=(b:Ball)=>!b.on||!(b.vx||b.vy||b.wx||b.wy||b.vz);
  for(let i=1;i<=maxSteps;i++){
    ev.length=0;const mv=step(S,ev);let ce=false,oe=false;
    if((c.z??0)>apex)apex=c.z!;
    for(const e of ev){
      if(e.t==='land'){if(e.a===0&&split<0)lands.push([e.x,e.y]);continue;}
      if(e.a===0||e.b===0){
        if(e.t==='pocket'||e.t==='off')scratch=true;
        else if(split<0){cl+=0;cue.push([e.x,e.y]);split=cue.length-1;}
        if(e.t==='bb'&&!hit){hit=e;o=S[e.b!];ob.push([o.x,o.y]);}
        ce=true;
      }
      if(o&&(S[e.a]===o||(e.b!==undefined&&S[e.b]===o)))oe=true;
    }
    if(i%4===0||ce)if(c.on)cl+=add(cue,c,split>=0);
    if(o&&(i%4===0||oe)&&o.on)ol+=add(ob,o,true);
    // Only the cue ball and the first ball it hits are drawn, so stop once both are done, not when the whole table is.
    if(!mv||(idle(c)&&(!o||idle(o))))break;
    if(split>=0&&cl>=len&&(!o||ol>=len))break;
  }
  return {cue,ob,split,hit,scratch,lands,apex}; // path points are [x,y,z]; lands = cue ball touchdowns before first contact
}

// Outcome of a shot without drawing anything, for the bot. maxSteps caps the cost (1 step = 1 ms of play);
// settled is false when the cap was hit before the table came to rest.
export function simulate(B:Ball[],shot:Shot,stick?:Cue,maxSteps=12000){
  const S=B.map(b=>({...b})),ev:Ev[]=[],potted:number[]=[],off:number[]=[];let first=-1,n=0,mv=true;
  strike(S[0],shot,stick);
  while(mv&&n++<maxSteps){ev.length=0;mv=step(S,ev);
    for(const e of ev){if(e.t==='pocket')potted.push(e.a);else if(e.t==='off')off.push(e.a);else if(e.t==='bb'&&e.a===0&&first<0)first=e.b!;}}
  return {balls:S,potted,off,scratch:potted.includes(0)||off.includes(0),first,settled:!mv,steps:n};
}

// Jump rulings, the same for 8-ball and 9-ball (WPA rules, from memory). A jump made by striking down on the cue ball
// is a legal stroke; the illegal one is the scoop (digging under the ball), which this engine cannot produce: a level
// cue never lifts the ball. The cue ball must still hit a legal ball first. What a jump can add is a ball leaving the
// table. off = ball numbers that left the table on the shot, game = 8 or 9. onBreak: the 8 leaving the table on the
// break is a foul but not a loss; it is spotted, and the incoming player may only take the cue ball above the head
// string (headString). Checked against WPA 3.3(g), 3.7 and 3.8, June 2025.
// 9-ball checked against WPA 2.6 (June 2025): only the 9 is ever spotted.
export function jumpRuling(off:number[],game:Game,onBreak=false){
  const r={foul:off.length>0,ballInHand:off.length>0,headString:false,lossOfRack:false,respot:[] as number[],removed:[] as number[]};
  for(const id of off){
    if(id===0)continue;                              // cue ball: plain foul, ball in hand
    if(game===8&&onBreak)r.headString=true;          // WPA 3.3(g): object ball off the table on the 8-ball break
    if(id===game){if(game===8&&!onBreak)r.lossOfRack=true;else r.respot.push(id);} // 8 off the table loses the rack; the 9 is spotted
    else r.removed.push(id);                         // any other object ball stays off the table
  }
  return r;
}
