/* Renderizador de respaldo mediante Canvas 2D.
   Solo se usa si el navegador o la máquina desactivan WebGL.
   Los controles y la animación siguen funcionando sin conexión. */
'use strict';
window.initChocoFallback = function () {
  const $=id=>document.getElementById(id);
  const canvas=$('world'),ctx=canvas.getContext('2d');
  if(!ctx){$('scene-status').textContent='NO SE PUDO INICIAR EL LIENZO';return;}
  const palettes={
    fresa:{body:'#ee96a0',highlight:'#ffd2cd',shadow:'#c95673',icing:'#ed7f9a',accent:'#f2bac5',speed:5,power:2,label:'VELOCIDAD MÁXIMA',interval:1.7,flight:.55},
    chocolate:{body:'#a8745d',highlight:'#ecc09f',shadow:'#654332',icing:'#8c543b',accent:'#dcb08f',speed:3,power:3,label:'EQUILIBRIO PERFECTO',interval:2.05,flight:.7},
    vainilla:{body:'#f4ce85',highlight:'#fff4c6',shadow:'#cb9655',icing:'#f5d38d',accent:'#fff1ba',speed:2,power:5,label:'MÁXIMA POTENCIA',interval:2.4,flight:.81}
  };
  let flavor='fresa',auto=true,last=0,lastManual=0,shot=[],impacts=0,view=0,zoom=1,now=0,drag=false,prevX=0;
  let messageUntil=0;
  const PI=Math.PI;
  const lerp=(a,b,p)=>a+(b-a)*p;
  function ellipse(x,y,rx,ry,color){ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,PI*2);ctx.fillStyle=color;ctx.fill();}
  function path(points){ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();}
  function stroke(color,width){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();}
  function grad(x,y,x2,y2,stops){const g=ctx.createLinearGradient(x,y,x2,y2);stops.forEach(s=>g.addColorStop(s[0],s[1]));return g;}
  function roundRect(x,y,w,h,r,fill,line){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fillStyle=fill;ctx.fill();if(line){ctx.strokeStyle=line;ctx.lineWidth=3;ctx.stroke();}}
  function donut(c){
    // Pastel tridimensional pintado con caras superiores, laterales y sombras.
    ellipse(705,505,142,28,'#76543824');
    ellipse(705,484,132,32,'#ad814f');
    ellipse(705,478,132,28,grad(0,446,0,516,[[0,'#fff3d3'],[.6,'#dcc6a6'],[1,'#b39872']]));
    ellipse(705,459,146,29,'#ffe6b5');
    ellipse(705,466,100,21,'#9d7150');
    ellipse(705,433,116,62,grad(580,377,830,501,[[0,'#ffdb88'],[.5,'#da9852'],[1,'#945a30']]));
    ellipse(705,428,72,27,'#edb26a');
    ellipse(705,434,43,16,'#c1844b');
    ellipse(705,429,32,12,'#986239');
    // Glaseado dibujado en forma de anillo con recorte interior.
    const frosting=ctx.createLinearGradient(615,370,802,469);
    frosting.addColorStop(0,c.accent);frosting.addColorStop(.5,c.icing);frosting.addColorStop(1,c.shadow);
    ctx.beginPath();ctx.ellipse(705,409,118,54,0,0,PI*2);ctx.ellipse(705,420,43,15,0,0,PI*2,true);
    ctx.fillStyle=frosting;ctx.fill('evenodd');
    ctx.strokeStyle='#fff9dd66';ctx.lineWidth=4;ctx.stroke();
    // Gotas cayendo por el lateral de la dona.
    for(let i=0;i<7;i++){
      const x=602+i*34,y=430+Math.sin((i/6)*PI)*20;
      ellipse(x,y,7,13+(i%3)*4,c.icing);
    }
    for(let i=0;i<24;i++){
      const a=i*2.399, r=55+(i*7)%57;
      const x=705+Math.cos(a)*r, y=410+Math.sin(a)*r*.43;
      if(Math.abs(x-705)<43&&Math.abs(y-420)<15)continue;
      ctx.save();ctx.translate(x,y);ctx.rotate(a);
      roundRect(-5,-2,10,4,2,['#fff4cc','#af5b46','#ffc2cc','#fffdf0'][i%4]);ctx.restore();
    }
    if(impacts>0){
      ellipse(695,384,35,15,c.icing);
      ellipse(702,377,22,16,c.accent);
      ellipse(703,367,11,9,'#fff4d8');
    }
  }
  function bag(c,t,pulse){
    const bob=Math.sin(t*1.6)*4;
    ctx.save();ctx.translate(360,256+bob);ctx.rotate(.36+Math.sin(t*.85)*.02);
    ctx.scale(1-pulse*.024,1+pulse*.05);
    // Extremo superior de tela, pliegues y cierre.
    path([[-227,-33],[-259,-43],[-259,27],[-231,36],[-211,50],[-201,-55]]);
    ctx.fillStyle=grad(-255,-55,-205,55,[[0,'#fff8d9'],[.4,'#eccda0'],[1,'#bb846c']]);ctx.fill();stroke('#97634c',3);
    roundRect(-265,-34,19,59,5,'#df8f90','#a66b63');
    for(let i=0;i<3;i++){ctx.beginPath();ctx.moveTo(-244+i*13,-37-i);ctx.quadraticCurveTo(-217+i*12,0,-244+i*13,37);stroke('#fff4e2aa',2);}
    // Cuerpo principal: volumen cónico con sombra y luz difusa.
    path([[-217,-56],[-180,-72],[-105,-82],[-28,-75],[50,-57],[100,-39],[149,-16],[157,0],[149,16],[100,34],[52,55],[-28,76],[-112,82],[-182,70],[-217,50],[-199,0]]);
    ctx.fillStyle=grad(-90,-93,-30,93,[[0,c.highlight],[.18,c.body],[.51,c.body],[.78,c.shadow],[1,'#543b2d']]);ctx.fill();stroke('#b47863',3);
    // Reflejos y arrugas suaves.
    ctx.beginPath();ctx.moveTo(-185,-49);ctx.bezierCurveTo(-99,-81,25,-53,119,-14);stroke('#fff8e280',7);
    ctx.beginPath();ctx.moveTo(-192,48);ctx.bezierCurveTo(-100,65,14,47,139,10);stroke('#7a402c33',7);
    ctx.beginPath();ctx.moveTo(-196,-45);ctx.bezierCurveTo(-100,-6,-96,32,-195,58);stroke('#fff4d65e',2);
    // Faja metálica y boquilla: relieves y sombras.
    path([[143,-19],[169,-18],[185,-10],[185,11],[166,20],[142,18]]);
    ctx.fillStyle=grad(141,-20,180,20,[[0,'#f6ffff'],[.46,'#8aadae'],[1,'#526e71']]);ctx.fill();stroke('#436468',2);
    path([[184,-12],[201,-9],[232,-3],[240,0],[232,3],[201,10],[184,12]]);
    ctx.fillStyle=grad(210,-10,212,12,[[0,'#f7ffff'],[.4,'#9bc0bd'],[1,'#4e7177']]);ctx.fill();stroke('#44666a',2);
    ellipse(240,0,5,5,'#283b3a');
    // Detalles de repostería, envoltura y marca.
    roundRect(-107,-29,144,59,14,'#fff2d2','#b87556');
    ellipse(-87,0,13,13,'#af5d48');ellipse(-87,0,6,7,'#ffedce');
    ctx.textAlign='center';ctx.fillStyle='#462f23';ctx.font='bold 16px Georgia';ctx.fillText('CHOCOBAYO',-25,0);
    ctx.fillStyle='#a66b50';ctx.font='bold 11px Arial';ctx.fillText('MANGA  ·  01',-25,17);
    for(let i=0;i<11;i++){
      const x=-176+i*26,y=(i%3)*15-12;
      if(x>-112&&x<44)continue;
      ctx.save();ctx.translate(x,y);ctx.rotate(i*.87);
      roundRect(-4,-2,9,5,3,['#fff0d4','#df727d','#ad6849'][i%3]);ctx.restore();
    }
    ctx.restore();
    // Coordenada del extremo en el espacio del escenario.
    return {x:360+240*Math.cos(.36),y:256+bob+240*Math.sin(.36)};
  }
  function drawProjectiles(time,c){
    for(const sh of shot){
      const age=time-sh.at;
      for(let i=0;i<13;i++){
        const p=(age-i*.03)/sh.flight;
        if(p<0||p>1)continue;
        const q=p*p*(3-2*p);
        const x=lerp(sh.x,704,q),y=lerp(sh.y,389,q)-22*Math.sin(PI*p);
        const r=5.5+(i%3)*2+(1-p)*4;
        ellipse(x+2,y+3,r*.98,r*.78,'#6f423022');
        ellipse(x,y,r,r*.88,c.icing);
        ellipse(x-r*.25,y-r*.28,r*.28,r*.17,'#ffffff95');
      }
      if(age>sh.flight&&age<sh.flight+.55){
        const p=(age-sh.flight)/.55;
        for(let i=0;i<9;i++){
          const a=i/9*PI*2, r=(10+p*90);
          ellipse(704+Math.cos(a)*r,388+Math.sin(a)*r*.55,Math.max(.2,6*(1-p)),Math.max(.2,6*(1-p)),i%2?c.icing:'#fff2cc');
        }
      }
    }
  }
  function frame(ms){
    now=ms/1000;
    const box=canvas.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,2),w=Math.floor(box.width*dpr),h=Math.floor(box.height*dpr);
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    const scale=Math.min(w/960,h/660)*zoom;
    ctx.clearRect(0,0,w,h);ctx.setTransform(1,0,0,1,0,0);
    ctx.translate((w-960*scale)/2,(h-660*scale)/2);
    ctx.scale(scale,scale);
    ctx.translate(480,330);ctx.scale(Math.max(.76,Math.cos(view*.65)),1);ctx.translate(-480,-330);
    const c=palettes[flavor];
    for(let i=0;i<18;i++){
      const x=(i*239)%960,y=80+(i*181)%410;
      ellipse(x,y+Math.sin(now+i)*4,1.5+i%3*.7,1.5+i%3*.7,'#cc986c4d');
    }
    // Plataforma de trabajo con distintas alturas y caras.
    ellipse(480,561,383,73,'#714b3150');
    ellipse(480,531,374,72,'#7d4e32');
    ellipse(480,505,375,73,grad(0,430,0,567,[[0,'#f0ca96'],[.6,'#c38a58'],[1,'#815036']]));
    ellipse(480,492,352,57,'#ecc698');
    ellipse(480,488,338,48,'#ead0a8');
    donut(c);
    if(auto&&now-last>c.interval){fire(false);last=now;}
    let pulse=0;for(const sh of shot)pulse=Math.max(pulse,Math.max(0,1-(now-sh.at)/.28));
    bag(c,now,pulse);
    drawProjectiles(now,c);
    shot=shot.filter(sh=>now-sh.at<sh.flight+.58);
    canvas.setAttribute('data-ready','true');
    requestAnimationFrame(frame);
  }
  function toast(message){const t=$('toast');t.textContent=message;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),1600);}
  function fire(manual){
    if(manual&&now-lastManual<.15)return;
    if(manual)lastManual=now;
    const c=palettes[flavor];
    shot.push({at:now,x:360+240*Math.cos(.36),y:256+240*Math.sin(.36),flight:c.flight});
    if(shot.length>12)shot.shift();
    setTimeout(()=>{impacts=Math.min(impacts+1,3);},c.flight*1000);
    if(manual){$('scene-status').innerHTML='<span class="pulse-dot"></span> ¡GLASEADO LANZADO!';setTimeout(()=>{$('scene-status').innerHTML='<span class="pulse-dot"></span> MODELO ANIMADO';},800);}
  }
  function setFlavor(name){
    if(!palettes[name])return;
    flavor=name;impacts=0;
    const p=palettes[name];
    document.querySelectorAll('[data-flavor]').forEach(b=>{const selected=b.dataset.flavor===name;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});
    $('flavor-name').textContent=name.toUpperCase();$('flavor-note').textContent=p.label;
    $('speed-value').textContent='★'.repeat(p.speed)+'☆'.repeat(5-p.speed);
    $('power-value').textContent='★'.repeat(p.power)+'☆'.repeat(5-p.power);
    $('speed-bar').style.width=p.speed*20+'%';$('power-bar').style.width=p.power*20+'%';
    toast('Sabor seleccionado: '+name);
  }
  document.querySelectorAll('[data-flavor]').forEach(b=>b.addEventListener('click',()=>setFlavor(b.dataset.flavor)));
  $('fire-btn').addEventListener('click',()=>fire(true));
  $('auto-btn').addEventListener('click',()=>{auto=!auto;$('auto-btn').classList.toggle('active',auto);$('auto-btn').setAttribute('aria-pressed',String(auto));last=now;toast(auto?'Animación automática activada':'Animación automática pausada');});
  $('reset-btn').addEventListener('click',()=>{view=0;zoom=1;toast('Vista restaurada');});
  document.addEventListener('keydown',e=>{if(e.code==='Space'){e.preventDefault();if(!e.repeat)fire(true);}else if(e.key==='1')setFlavor('fresa');else if(e.key==='2')setFlavor('chocolate');else if(e.key==='3')setFlavor('vainilla');else if(e.key.toLowerCase()==='r'){view=0;zoom=1;}});
  canvas.addEventListener('pointerdown',e=>{drag=true;prevX=e.clientX;canvas.setPointerCapture(e.pointerId);});
  canvas.addEventListener('pointermove',e=>{if(drag){view=Math.max(-1.1,Math.min(1.1,view+(e.clientX-prevX)*.009));prevX=e.clientX;}});
  canvas.addEventListener('pointerup',()=>drag=false);canvas.addEventListener('pointercancel',()=>drag=false);
  canvas.addEventListener('wheel',e=>{e.preventDefault();zoom=Math.max(.83,Math.min(1.17,zoom-Math.sign(e.deltaY)*.06));},{passive:false});
  $('scene-status').innerHTML='<span class="pulse-dot"></span> VISTA COMPATIBLE ANIMADA';
  requestAnimationFrame(frame);
};
