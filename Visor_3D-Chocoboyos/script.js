/*
 * BATALLA CHOCOBAYO — Manga Glaseadora 3D
 * Hecho únicamente con JavaScript nativo + WebGL 1.
 * No utiliza Three.js, servidores, recursos externos ni dependencias.
 */
'use strict';

(() => {
  const $ = (id) => document.getElementById(id);
  const canvas = $('world');
  const gl = canvas.getContext('webgl', { alpha: true, antialias: true, depth: true });
  if (!gl) {
    if (window.initChocoFallback) window.initChocoFallback();
    return;
  }

  const FLAVORS = {
    fresa: {
      name: 'FRESA', label: 'VELOCIDAD MÁXIMA',
      body: [0.95, 0.57, 0.61], icing: [0.97, 0.43, 0.57], light: [1.0, 0.78, 0.79],
      accent: '#ee859a', speed: 5, power: 2, interval: 1.75, flight: .49
    },
    chocolate: {
      name: 'CHOCOLATE', label: 'EQUILIBRIO PERFECTO',
      body: [0.64, 0.40, 0.30], icing: [0.48, 0.25, 0.18], light: [0.88, 0.66, 0.51],
      accent: '#9d6d55', speed: 3, power: 3, interval: 2.05, flight: .62
    },
    vainilla: {
      name: 'VAINILLA', label: 'MÁXIMA POTENCIA',
      body: [0.96, 0.84, 0.55], icing: [0.97, 0.84, 0.57], light: [1.0, 0.97, 0.78],
      accent: '#e7bd72', speed: 2, power: 5, interval: 2.35, flight: .72
    }
  };
  let activeFlavor = 'fresa';
  let autoFire = true;
  let lastAutoFire = -100;
  let lastManualFire = -100;
  let now = 0;
  let shots = [];
  let impactCount = 0;
  let sceneReady = false;
  let toastTimeout;
  const camera = { azimuth: .20, elevation: .32, distance: 7.35 };
  const drag = { down: false, x: 0, y: 0 };
  const RGB = {
    metal: [.69, .82, .82], metalDark: [.38, .53, .55], metalLight: [.90, .96, .92],
    dough: [.82, .52, .27], doughHighlight: [.97, .73, .43], cream: [.99, .94, .78],
    rose: [.89, .52, .50], darkBrown: [.27, .16, .12], table: [.70, .46, .30],
    gold: [.96, .74, .40], white: [1.0, .96, .85], shade: [.53, .34, .27]
  };

  // ----- Álgebra 3D (matrices column-major compatibles con WebGL) -----
  function identity() { return [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]; }
  function multiply(a,b) {
    const out = new Array(16).fill(0);
    for (let col=0;col<4;col++) for (let row=0;row<4;row++)
      for (let k=0;k<4;k++) out[col*4+row] += a[k*4+row]*b[col*4+k];
    return out;
  }
  const T = (x=0,y=0,z=0) => [1,0,0,0, 0,1,0,0, 0,0,1,0, x,y,z,1];
  const S = (x=1,y=1,z=1) => [x,0,0,0, 0,y,0,0, 0,0,z,0, 0,0,0,1];
  const Rz = a => {const c=Math.cos(a),s=Math.sin(a);return [c,s,0,0, -s,c,0,0, 0,0,1,0, 0,0,0,1];};
  const Ry = a => {const c=Math.cos(a),s=Math.sin(a);return [c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1];};
  const Rx = a => {const c=Math.cos(a),s=Math.sin(a);return [1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,0,0,1];};
  const chain = (...mats) => mats.reduce((a,b) => multiply(a,b), identity());
  function transformPoint(m,p) {
    return [m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]];
  }
  function normalize(v){const l=Math.hypot(...v)||1;return v.map(x=>x/l);}
  function cross(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
  function perspective(fov,aspect,near,far){
    const f=1/Math.tan(fov/2),nf=1/(near-far);
    return [f/aspect,0,0,0, 0,f,0,0, 0,0,(far+near)*nf,-1, 0,0,(2*far*near)*nf,0];
  }
  function lookAt(eye,center,up=[0,1,0]){
    const z=normalize(eye.map((v,i)=>v-center[i])), x=normalize(cross(up,z)), y=cross(z,x);
    return [x[0],y[0],z[0],0, x[1],y[1],z[1],0, x[2],y[2],z[2],0,
      -x.reduce((s,v,i)=>s+v*eye[i],0),-y.reduce((s,v,i)=>s+v*eye[i],0),-z.reduce((s,v,i)=>s+v*eye[i],0),1];
  }
  const lerp = (a,b,t) => a+(b-a)*t;
  const clamp = (n,min,max) => Math.max(min,Math.min(max,n));

  // ----- Compilación de shaders. Iluminación suave tipo juguete 3D. -----
  const vertexSource = `
    attribute vec3 aPos; attribute vec3 aNormal; attribute vec2 aUV;
    uniform mat4 uProjection, uView, uModel;
    varying vec3 vNormal, vPos; varying vec2 vUV;
    void main(){ vec4 world = uModel * vec4(aPos, 1.0);
      vPos = world.xyz; vNormal = mat3(uModel) * aNormal; vUV = aUV;
      gl_Position = uProjection * uView * world;
    }`;
  const fragmentSource = `
    precision mediump float;
    varying vec3 vNormal, vPos; varying vec2 vUV;
    uniform vec3 uColor, uCamera;
    uniform float uGloss, uTextured;
    uniform sampler2D uTexture;
    void main(){
      vec3 n=normalize(vNormal);
      vec3 key=normalize(vec3(-0.38,0.86,1.1));
      vec3 fill=normalize(vec3(0.95,0.36,-0.65));
      vec3 view=normalize(uCamera-vPos);
      float diffuse=max(dot(n,key),0.0);
      float bounce=max(dot(n,fill),0.0);
      vec3 halfV=normalize(key+view);
      float spec=pow(max(dot(n,halfV),0.0), mix(17.0,68.0,uGloss));
      float rim=pow(1.0-max(dot(n,view),0.0),2.0);
      vec4 tex=texture2D(uTexture,vUV);
      if(uTextured>0.5 && tex.a<0.14) discard;
      vec3 base=mix(uColor,tex.rgb,uTextured);
      vec3 lit=base*(0.53+diffuse*0.48+bounce*0.13);
      lit+=vec3(1.0,0.93,0.84)*spec*(0.08+uGloss*0.54);
      lit+=base*rim*0.11;
      gl_FragColor=vec4(lit,1.0);
    }`;
  function compile(type,src){const sh=gl.createShader(type);gl.shaderSource(sh,src);gl.compileShader(sh);
    if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));return sh;}
  const program=gl.createProgram();
  gl.attachShader(program,compile(gl.VERTEX_SHADER,vertexSource));
  gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fragmentSource));
  gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  const attr={pos:gl.getAttribLocation(program,'aPos'),normal:gl.getAttribLocation(program,'aNormal'),uv:gl.getAttribLocation(program,'aUV')};
  const uniform={projection:gl.getUniformLocation(program,'uProjection'),view:gl.getUniformLocation(program,'uView'),
    model:gl.getUniformLocation(program,'uModel'),color:gl.getUniformLocation(program,'uColor'),cam:gl.getUniformLocation(program,'uCamera'),
    gloss:gl.getUniformLocation(program,'uGloss'),textured:gl.getUniformLocation(program,'uTextured')};
  gl.uniform1i(gl.getUniformLocation(program,'uTexture'),0);
  gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);

  // ----- Geometría: posiciones, normales, coordenadas UV. -----
  const emit=(arr,p,n,uv=[0,0])=>arr.push(p[0],p[1],p[2],n[0],n[1],n[2],uv[0],uv[1]);
  function quad(arr,a,b,c,d,na,nb,nc,nd,u0=0,u1=1,v0=0,v1=1){
    emit(arr,a,na,[u0,v0]);emit(arr,b,nb,[u1,v0]);emit(arr,c,nc,[u1,v1]);
    emit(arr,a,na,[u0,v0]);emit(arr,c,nc,[u1,v1]);emit(arr,d,nd,[u0,v1]);
  }
  function createMesh(data){const mesh={count:data.length/8,buffer:gl.createBuffer()};
    gl.bindBuffer(gl.ARRAY_BUFFER,mesh.buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);return mesh;}
  function lathe(profile,segments=48,ruffle=0){
    const out=[];
    const point=(j,i)=>{const [y,r]=profile[j],a=i/segments*Math.PI*2;
      const k=1+ruffle*Math.cos(a*9+0.45)*(0.30+0.70*Math.sin((j/(profile.length-1))*Math.PI));
      const R=r*k;let j0=Math.max(0,j-1),j1=Math.min(profile.length-1,j+1);
      let dr=profile[j1][1]-profile[j0][1],dy=profile[j1][0]-profile[j0][0];
      const normal=normalize([dy*Math.cos(a),-dr,dy*Math.sin(a)]);
      return {p:[R*Math.cos(a),y,R*Math.sin(a)],n:normal};
    };
    for(let j=0;j<profile.length-1;j++)for(let i=0;i<segments;i++){
      const a=point(j,i),b=point(j,(i+1)%segments),c=point(j+1,(i+1)%segments),d=point(j+1,i);
      quad(out,a.p,b.p,c.p,d.p,a.n,b.n,c.n,d.n);
    }
    return createMesh(out);
  }
  function sphere(lat=12,lon=20){const out=[];
    const pt=(i,j)=>{const v=i/lat*Math.PI, h=j/lon*Math.PI*2,n=[Math.sin(v)*Math.cos(h),Math.cos(v),Math.sin(v)*Math.sin(h)];return {p:n,n};};
    for(let i=0;i<lat;i++)for(let j=0;j<lon;j++){
      const a=pt(i,j),b=pt(i,j+1),c=pt(i+1,j+1),d=pt(i+1,j);quad(out,a.p,b.p,c.p,d.p,a.n,b.n,c.n,d.n);
    }
    return createMesh(out);
  }
  function torus(major,tube,ringSegments=60,tubeSegments=16,icing=false){const out=[];
    const pt=(i,j)=>{const h=i/ringSegments*Math.PI*2, v=(j/tubeSegments)*(icing?Math.PI:Math.PI*2);
      const drip=icing?Math.pow(Math.abs(Math.cos(v)),12)*(.05+.08*Math.pow(Math.max(0,Math.sin(5*h+0.7)*Math.sin(7*h-0.4)),2)):0;
      const r=major+tube*Math.cos(v);
      const n=[Math.cos(h)*Math.cos(v),Math.sin(v),Math.sin(h)*Math.cos(v)];
      return {p:[r*Math.cos(h),tube*Math.sin(v)-drip,r*Math.sin(h)],n};};
    for(let i=0;i<ringSegments;i++)for(let j=0;j<tubeSegments;j++){
      const a=pt(i,j),b=pt(i+1,j),c=pt(i+1,j+1),d=pt(i,j+1);quad(out,a.p,b.p,c.p,d.p,a.n,b.n,c.n,d.n);
    }
    return createMesh(out);
  }
  function plane(){const n=[0,0,1],out=[];quad(out,[-.5,-.5,0],[.5,-.5,0],[.5,.5,0],[-.5,.5,0],n,n,n,n);return createMesh(out);}
  const meshes={
    fabric:lathe([[-1.25,.20],[-1.16,.23],[-1.02,.30],[-.8,.43],[-.52,.55],[-.22,.62],[.12,.69],[.45,.71],[.78,.66],[1.02,.60],[1.16,.53],[1.24,.45]],64,.034),
    folded:lathe([[1.17,.43],[1.24,.44],[1.33,.37],[1.45,.26],[1.57,.22],[1.63,.30],[1.67,.29]],56,.065),
    clip:lathe([[1.56,.26],[1.60,.29],[1.68,.29],[1.72,.26]],48,.0),
    nozzle:lathe([[-1.91,.055],[-1.85,.09],[-1.73,.108],[-1.60,.13],[-1.50,.15],[-1.36,.185],[-1.29,.205]],48,.050),
    nozzleRim:lathe([[-1.35,.207],[-1.31,.22],[-1.27,.225],[-1.23,.21]],48),
    nozzleHole:lathe([[-1.914,.001],[-1.911,.046],[-1.907,.048]],28),
    upperSeam:lathe([[1.15,.52],[1.185,.50],[1.22,.463]],48),
    ring:torus(.39,.032,48,12),
    bead:sphere(12,20),
    beam:sphere(9,14),
    donut:torus(.55,.235,72,20),
    icing:torus(.55,.244,72,14,true),
    disk:lathe([[-.13,.0],[-.13,.88],[-.10,.98],[-.06,1.00],[-.015,1.00],[.02,.94],[.035,.0]],72),
    diskLip:lathe([[-.04,.99],[0,1.015],[.037,.97]],72),
    table:lathe([[-.20,0],[-.20,3.05],[-.16,3.14],[-.09,3.15],[0,3.11],[.04,3.02],[.045,0]],90),
    border:lathe([[-.16,3.16],[-.12,3.17],[-.09,3.16]],90),
    topping:lathe([[0,.36],[.06,.34],[.11,.28],[.20,.23],[.25,.14],[.26,.0]],44),
    plaque:plane()
  };

  const sprinkles=[];
  for(let i=0;i<19;i++) {
    const h=((i*7.38)%(Math.PI*2));
    const theta=.35+((i*3.74)%2.20); // parte alta de la dona
    const rr=.55+.246*Math.cos(theta);
    sprinkles.push({x:rr*Math.cos(h),y:.246*Math.sin(theta)+.015,z:rr*Math.sin(h),a:i*1.93,color:i%4});
  }
  const bagDots=[];
  for(let i=0;i<17;i++){
    const y=-.65+(i*0.109)%1.42;
    // Los puntitos decoran la parte frontal de la manga; no están pegados a una textura.
    const radius=.59 + .05*Math.cos(y*1.9);
    const angle=.48+(i*1.89)%2.15;
    bagDots.push({x:Math.cos(angle)*radius,y,z:Math.sin(angle)*radius,a:i*.71,c:i%3});
  }
  function makeStickerTexture(){
    const surface=document.createElement('canvas');surface.width=512;surface.height=256;
    const c=surface.getContext('2d');
    c.clearRect(0,0,512,256);
    c.fillStyle='#fff2d4';c.strokeStyle='#bd775b';c.lineWidth=12;
    c.beginPath();c.roundRect(15,18,482,220,30);c.fill();c.stroke();
    c.fillStyle='#b35446';c.beginPath();c.arc(70,128,35,0,Math.PI*2);c.fill();
    c.fillStyle='#f7cf9a';c.beginPath();c.arc(70,128,17,0,Math.PI*2);c.fill();
    c.fillStyle='#40291f';c.font='bold 42px Georgia';c.textAlign='left';c.fillText('CHOCOBAYO',127,127);
    c.fillStyle='#9f654b';c.font='bold 25px Arial';c.fillText('MANGA  ·  01',129,171);
    const tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,surface);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.generateMipmap(gl.TEXTURE_2D);return tex;
  }
  const sticker=makeStickerTexture();gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,sticker);

  function draw(mesh,model,color,gloss=.35,textured=false){
    gl.bindBuffer(gl.ARRAY_BUFFER,mesh.buffer);
    gl.enableVertexAttribArray(attr.pos);gl.enableVertexAttribArray(attr.normal);gl.enableVertexAttribArray(attr.uv);
    gl.vertexAttribPointer(attr.pos,3,gl.FLOAT,false,32,0);
    gl.vertexAttribPointer(attr.normal,3,gl.FLOAT,false,32,12);
    gl.vertexAttribPointer(attr.uv,2,gl.FLOAT,false,32,24);
    gl.uniformMatrix4fv(uniform.model,false,new Float32Array(model));
    gl.uniform3fv(uniform.color,color);gl.uniform1f(uniform.gloss,gloss);gl.uniform1f(uniform.textured,textured?1:0);
    gl.drawArrays(gl.TRIANGLES,0,mesh.count);
  }
  const dot=(matrix,color,size) => draw(meshes.bead,chain(matrix,S(size,size,size)),color,.45);
  function bagMatrix(time){
    const bob=Math.sin(time*1.4)*.052;
    return chain(T(-.92,.53+bob,.05),Rz(1.04+Math.sin(time*1.12)*.025),Ry(Math.sin(time*.76)*.055));
  }
  const nozzlePoint=(pose)=>transformPoint(pose,[0,-1.92,0]);
  function renderBag(pose,time,pulse){
    const f=FLAVORS[activeFlavor];
    const body=chain(pose,S(1+pulse*.075,1-pulse*.05,1+pulse*.075));
    // Base de tela cónica, con ligeras arrugas procedurales.
    draw(meshes.fabric,body,f.body,.47);
    draw(meshes.folded,body,RGB.cream,.30);
    draw(meshes.upperSeam,body,f.light,.57);
    draw(meshes.clip,body,RGB.rose,.35);
    draw(meshes.nozzle,pose,RGB.metal,.92);
    draw(meshes.nozzleRim,pose,RGB.metalLight,.98);
    draw(meshes.nozzleHole,pose,RGB.darkBrown,.1);
    // Costuras y toques de crema.
    draw(meshes.ring,chain(body,T(0,1.18,0),S(1.34,.85,1.34)),RGB.cream,.44);
    draw(meshes.ring,chain(body,T(0,-1.18,0),S(.57,.65,.57)),RGB.rose,.40);
    for (const d of bagDots){
      const col=d.c===0?RGB.cream:d.c===1?RGB.rose:RGB.gold;
      draw(meshes.bead,chain(body,T(d.x,d.y,d.z),Rz(d.a),S(.055,.025,.023)),col,.47);
    }
    // Etiqueta tridimensional texturizada, fija al cuerpo de la manga.
    draw(meshes.plaque,chain(body,T(-.015,.22,.745),S(.91,.48,1)),RGB.white,.13,true);
    // Estrella decorativa cerca del cierre.
    dot(chain(body,T(.12,1.52,.20)),RGB.rose,.07);
  }
  function renderBakery(time){
    // Mesa y expositor. Todos los volúmenes están modelados en 3D.
    draw(meshes.table,T(0,-2.34,0),RGB.table,.21);
    draw(meshes.border,T(0,-2.34,0),RGB.gold,.52);
    draw(meshes.disk,chain(T(1.95,-1.97,.05),S(.96,.96,.96)),RGB.cream,.50);
    draw(meshes.diskLip,chain(T(1.95,-1.97,.05),S(.96,.96,.96)),RGB.gold,.72);
    draw(meshes.donut,T(1.95,-1.69,.05),RGB.dough,.37);
    draw(meshes.icing,T(1.95,-1.69,.05),FLAVORS[activeFlavor].icing,.72);
    for(const sp of sprinkles){
      const colors=[RGB.cream,RGB.rose,RGB.gold,RGB.metalLight];
      const spin=chain(T(1.95+sp.x,-1.69+sp.y,sp.z+.05),Ry(sp.a),Rz(sp.a*.4),S(.041,.021,.018));
      draw(meshes.bead,spin,colors[sp.color],.44);
    }
    // Pequeña espiral de glaseado, que se incrementa visualmente tras el disparo.
    if(impactCount>0){
      const y=-1.42;
      draw(meshes.topping,chain(T(1.95,y,.05),S(.42,.65,.42)),FLAVORS[activeFlavor].icing,.84);
      for(let i=0;i<3;i++){
        dot(T(1.83+i*.1,y+.22+(i%2)*.02,.12),FLAVORS[activeFlavor].light,.04);
      }
    }
    // Pequeñas motas flotantes (efecto arcade).
    for(let i=0;i<10;i++){
      const x=-2.25+i*.51, y=.25+Math.sin(time*.65+i)*.20+((i*3)%4)*.24,
        z=-1.5 + (i%5)*.40;
      dot(T(x,y,z),i%3===0?RGB.gold:RGB.cream,.012+(i%3)*.007);
    }
  }
  function renderShots(time){
    const color=FLAVORS[activeFlavor].icing;
    for(const shot of shots){
      const elapsed=time-shot.at;
      for(let i=0;i<12;i++){
        const p=(elapsed-i*.027)/shot.flight;
        if(p<0||p>1)continue;
        const smooth=p*p*(3-2*p);
        const x=lerp(shot.from[0],shot.to[0],smooth);
        const y=lerp(shot.from[1],shot.to[1],smooth)+Math.sin(p*Math.PI)*(.10+i*.006);
        const z=lerp(shot.from[2],shot.to[2],smooth)+Math.sin(p*9+i)*.04;
        const size=.082+(1-p)*.035+(i%4)*.007;
        draw(meshes.beam,chain(T(x,y,z),S(size,size*.90,size)),shot.color,.78);
      }
      if(elapsed>=shot.flight && elapsed<shot.flight+.68){
        const p=(elapsed-shot.flight)/.68;
        // Corona de gotitas al tocar la dona, que se expande suavemente.
        for(let i=0;i<8;i++){
          const a=i/8*Math.PI*2;
          const d=.04+p*.65;
          const x=shot.to[0]+Math.cos(a)*d;
          const y=shot.to[1]+Math.sin(p*Math.PI)*.24-p*.12;
          const z=shot.to[2]+Math.sin(a)*d*.56;
          const sc=Math.max(0,.06*(1-p));
          if(sc>0.001)dot(T(x,y,z),i%2?shot.color:RGB.white,sc);
        }
      }
    }
  }
  let lastSizeW=0,lastSizeH=0;
  function resize(){
    const rect=canvas.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,2);
    const width=Math.max(2,Math.floor(rect.width*dpr)),height=Math.max(2,Math.floor(rect.height*dpr));
    if(width!==lastSizeW||height!==lastSizeH){canvas.width=lastSizeW=width;canvas.height=lastSizeH=height;gl.viewport(0,0,width,height);}
  }
  function render(milliseconds){
    now=milliseconds*.001;
    resize();
    const ratio=canvas.width/canvas.height;
    const e=camera.elevation,a=camera.azimuth,d=camera.distance;
    const eye=[.06+Math.sin(a)*d*Math.cos(e),-.12+Math.sin(e)*d,Math.cos(a)*d*Math.cos(e)];
    const view=lookAt(eye,[.04,-.30,0]);
    gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    gl.uniformMatrix4fv(uniform.projection,false,new Float32Array(perspective(47*Math.PI/180,ratio,.1,50)));
    gl.uniformMatrix4fv(uniform.view,false,new Float32Array(view));gl.uniform3fv(uniform.cam,eye);
    if(autoFire && now-lastAutoFire>FLAVORS[activeFlavor].interval){fire(false);lastAutoFire=now;}
    let pulse=0;
    for(const shot of shots) pulse=Math.max(pulse,Math.max(0,1-(now-shot.at)/.28));
    renderBakery(now);
    const pose=bagMatrix(now);
    renderBag(pose,now,pulse);
    renderShots(now);
    shots=shots.filter(s=>now-s.at<s.flight+.8);
    if(!sceneReady){sceneReady=true;canvas.setAttribute('data-ready','true');}
    requestAnimationFrame(render);
  }

  function popToast(message){
    const toast=$('toast');toast.textContent=message;toast.classList.add('show');
    clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>toast.classList.remove('show'),1900);
  }
  function fire(manual=true){
    if(manual && now-lastManualFire<.16)return;
    if(manual)lastManualFire=now;
    const f=FLAVORS[activeFlavor];
    const origin=nozzlePoint(bagMatrix(now));
    const target=[1.95,-1.39,.20];
    shots.push({at:now,from:origin,to:target,flight:f.flight,color:f.icing});
    if(shots.length>12)shots.shift();
    // El efecto de glaseado sobre la dona empieza cuando llega el proyectil.
    setTimeout(()=>{impactCount=Math.min(impactCount+1,3);},f.flight*1000);
    if(manual){
      $('scene-status').innerHTML='<span class="pulse-dot"></span> ¡GLASEADO LANZADO!';
      setTimeout(()=>{$('scene-status').innerHTML='<span class="pulse-dot"></span> MODELO ANIMADO';},800);
    }
  }
  function setFlavor(name){
    if(!FLAVORS[name])return;
    activeFlavor=name;const f=FLAVORS[name];
    document.documentElement.style.setProperty('--accent',f.accent);
    document.querySelectorAll('[data-flavor]').forEach(button=>{
      const on=button.dataset.flavor===name;
      button.classList.toggle('selected',on);button.setAttribute('aria-pressed',String(on));
    });
    $('flavor-name').textContent=f.name;$('flavor-note').textContent=f.label;
    $('speed-value').textContent='★'.repeat(f.speed)+'☆'.repeat(5-f.speed);
    $('power-value').textContent='★'.repeat(f.power)+'☆'.repeat(5-f.power);
    $('speed-bar').style.width=(f.speed*20)+'%';$('power-bar').style.width=(f.power*20)+'%';
    impactCount=0; // Se reinicia la decoración al cambiar de sabor.
    popToast('Sabor seleccionado: '+f.name.toLowerCase());
  }
  document.querySelectorAll('[data-flavor]').forEach(button=>button.addEventListener('click',()=>setFlavor(button.dataset.flavor)));
  $('fire-btn').addEventListener('click',()=>fire(true));
  $('auto-btn').addEventListener('click',()=>{
    autoFire=!autoFire;
    $('auto-btn').classList.toggle('active',autoFire);
    $('auto-btn').setAttribute('aria-pressed',String(autoFire));
    if(autoFire)lastAutoFire=now;
    popToast(autoFire?'Animación automática activada':'Animación automática pausada');
  });
  function resetView(){camera.azimuth=.20;camera.elevation=.32;camera.distance=7.35;popToast('Cámara restaurada');}
  $('reset-btn').addEventListener('click',resetView);
  document.addEventListener('keydown',event=>{
    if(['INPUT','TEXTAREA'].includes(document.activeElement?.tagName))return;
    if(event.code==='Space'){event.preventDefault();if(!event.repeat)fire(true);}
    else if(event.key==='1')setFlavor('fresa');
    else if(event.key==='2')setFlavor('chocolate');
    else if(event.key==='3')setFlavor('vainilla');
    else if(event.key==='r'||event.key==='R')resetView();
  });
  canvas.addEventListener('pointerdown',event=>{drag.down=true;drag.x=event.clientX;drag.y=event.clientY;canvas.setPointerCapture(event.pointerId);});
  canvas.addEventListener('pointermove',event=>{
    if(!drag.down)return;
    const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
    camera.azimuth=clamp(camera.azimuth+dx*.007,-1.65,1.65);
    camera.elevation=clamp(camera.elevation-dy*.005,.06,1.02);
    drag.x=event.clientX;drag.y=event.clientY;
  });
  canvas.addEventListener('pointerup',()=>drag.down=false);
  canvas.addEventListener('pointercancel',()=>drag.down=false);
  canvas.addEventListener('lostpointercapture',()=>drag.down=false);
  canvas.addEventListener('wheel',event=>{event.preventDefault();camera.distance=clamp(camera.distance+Math.sign(event.deltaY)*.36,5.3,10.3);},{passive:false});
  window.addEventListener('blur',()=>drag.down=false);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)drag.down=false;});
  requestAnimationFrame(render);
})();
