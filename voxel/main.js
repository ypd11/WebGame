import * as THREE from 'three';

const canvas = document.querySelector('#world');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#8b9c91');
scene.fog = new THREE.FogExp2('#8b9c91', 0.012);
const camera = new THREE.PerspectiveCamera(64, innerWidth / innerHeight, 0.1, 180);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;

const mats = {
  grass: new THREE.MeshStandardMaterial({ color: '#70885a', roughness: 1 }),
  grass2: new THREE.MeshStandardMaterial({ color: '#829466', roughness: 1 }),
  dirt: new THREE.MeshStandardMaterial({ color: '#765641', roughness: 1 }),
  dirt2: new THREE.MeshStandardMaterial({ color: '#87634a', roughness: 1 }),
  stone: new THREE.MeshStandardMaterial({ color: '#747b79', roughness: 1 }),
  stone2: new THREE.MeshStandardMaterial({ color: '#8b9189', roughness: 1 }),
  wood: new THREE.MeshStandardMaterial({ color: '#79513a', roughness: 1 }),
  wood2: new THREE.MeshStandardMaterial({ color: '#9a6945', roughness: 1 }),
  leaves: new THREE.MeshStandardMaterial({ color: '#344d3e', roughness: 1 }),
  leaves2: new THREE.MeshStandardMaterial({ color: '#496449', roughness: 1 }),
  leaves3: new THREE.MeshStandardMaterial({ color: '#66734b', roughness: 1 }),
  sand: new THREE.MeshStandardMaterial({ color: '#b7a276', roughness: 1 }),
  water: new THREE.MeshStandardMaterial({ color: '#456f78', roughness: .34, metalness: .05, transparent: true, opacity: .88 })
};
const blockTypes = Object.keys(mats).filter(k => k !== 'water');
const blockGeo = new THREE.BoxGeometry(1, 1, 1);
const worldGroup = new THREE.Group();
scene.add(worldGroup);
const blockMap = new Map();
const meshLookup = new Map();
const blockInstances = new Map();
const blockByInstance = new Map();
const keyOf = (x,y,z) => x + ',' + y + ',' + z;
const rand = (() => { let s = 0x71e3a9; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; })();
const clamp = (v,a,b) => Math.max(a, Math.min(b,v));
const WORLD = 56;
const SEA = 2;

function heightAt(x,z) {
  const rolling = Math.sin(x * .17) * .8 + Math.cos(z * .14) * .7 + Math.sin((x + z) * .09) * .8;
  const ridge = Math.sin(x * .055 + z * .08) * 1.1;
  return Math.max(2, Math.floor(3.4 + rolling + ridge));
}
function inLake(x,z) {
  const dx = (x - 39) / 6.3, dz = (z - 31) / 4.8;
  return dx*dx + dz*dz < 1 && !(x < 23 && z < 23);
}
function addBlock(x,y,z,type) {
  const key = keyOf(x,y,z);
  if (blockMap.has(key)) return;
  const block = { x,y,z,type };
  blockMap.set(key, block);
}
function addTree(x,z) {
  const ground = heightAt(x,z);
  const trunkH = 3 + Math.floor(rand()*2);
  for(let y=1;y<=trunkH;y++) addBlock(x,ground+y,z,'wood');
  const crownY = ground + trunkH;
  const radius = 2 + Math.floor(rand()*1.6);
  for(let dy=-1;dy<=2;dy++) {
    const r = dy===2 ? 1 : radius - (dy===-1 ? 0 : .4);
    for(let dx=-radius;dx<=radius;dx++) for(let dz=-radius;dz<=radius;dz++) {
      const d = Math.abs(dx)+Math.abs(dz)*.9;
      if(d <= r*1.65 && rand() > .08) {
        const type = rand()>.78 ? 'leaves3' : (rand()>.48 ? 'leaves2':'leaves');
        addBlock(x+dx,crownY+dy,z+dz,type);
      }
    }
  }
  addBlock(x,crownY+3,z,'leaves2');
}
function generateWorld() {
  for(let x=0;x<WORLD;x++) for(let z=0;z<WORLD;z++) {
    const h = heightAt(x,z);
    if(inLake(x,z)) {
      for(let y=0;y<SEA;y++) addBlock(x,y,z,'stone');
      continue;
    }
    for(let y=0;y<=h;y++) {
      const type = y===h ? ((rand()>.82)?'grass2':'grass') : (y>h-3 ? 'dirt' : ((rand()>.85)?'stone':'dirt2'));
      addBlock(x,y,z,type);
    }
  }
  // A broad spawn clearing and an unobstructed trail toward the eastern woodland.
  for(let x=7;x<19;x++) for(let z=7;z<19;z++) {
    const h=heightAt(x,z);
    for(let y=0;y<=h;y++) addBlock(x,y,z,y===h?'grass':'dirt');
  }
  for(let i=0;i<40;i++) {
    const t=i/39, cx=Math.round(14+t*30), cz=Math.round(14+t*17);
    for(let dx=-1;dx<=1;dx++) for(let dz=-1;dz<=1;dz++) {
      const x=cx+dx,z=cz+dz;if(x<0||z<0||x>=WORLD||z>=WORLD||inLake(x,z))continue;
      const h=heightAt(x,z);for(let y=0;y<=h;y++)addBlock(x,y,z,y===h?'grass':'dirt');
    }
  }
  for(let i=0;i<105;i++) {
    const x=3+Math.floor(rand()*(WORLD-6)),z=3+Math.floor(rand()*(WORLD-6));
    if(x>7&&x<19&&z>7&&z<19)continue;
    if(inLake(x,z))continue;
    if(Math.hypot(x-14,z-14)<5.5)continue;
    addTree(x,z);
  }
  // Small exposed stone clusters around the edges of clearings.
  for(let i=0;i<42;i++) {
    const x=3+Math.floor(rand()*(WORLD-6)),z=3+Math.floor(rand()*(WORLD-6));
    if(inLake(x,z)||Math.hypot(x-14,z-14)<6)continue;
    const y=heightAt(x,z)+1;
    addBlock(x,y,z,'stone');
    if(rand()>.5)addBlock(x+1,y,z,'stone2');
  }
}
function rebuildWorldMeshes() {
  while(worldGroup.children.length) {
    const obj=worldGroup.children.pop();
    if(obj.geometry!==blockGeo) obj.geometry?.dispose?.();
  }
  blockInstances.clear();blockByInstance.clear();
  const groups=new Map();
  for(const b of blockMap.values()) {
    if(!groups.has(b.type))groups.set(b.type,[]);
    groups.get(b.type).push(b);
  }
  for(const [type,blocks] of groups) {
    const mesh=new THREE.InstancedMesh(blockGeo,mats[type],blocks.length);
    mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData.blockType=type;
    const dummy=new THREE.Object3D();
    blocks.forEach((b,i)=>{
      dummy.position.set(b.x+.5,b.y+.5,b.z+.5);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate=true;
    worldGroup.add(mesh);blockInstances.set(type,mesh);blockByInstance.set(type,blocks);
  }
}
generateWorld();
rebuildWorldMeshes();

// Water is a soft, translucent surface over the low lake basin.
const water = new THREE.Mesh(new THREE.PlaneGeometry(14,11),mats.water);
water.rotation.x=-Math.PI/2;water.position.set(39.5,SEA+.86,31.5);water.receiveShadow=true;scene.add(water);
const waterEdge = new THREE.Mesh(new THREE.PlaneGeometry(15.5,12.5),new THREE.MeshStandardMaterial({color:'#63817c',roughness:1,transparent:true,opacity:.35}));
waterEdge.rotation.x=-Math.PI/2;waterEdge.position.set(39.5,SEA+.81,31.5);scene.add(waterEdge);

// A few low-poly grass tufts make the clearings feel less uniform.
const tuftGeo=new THREE.ConeGeometry(.13,.55,4);
const tuftMat=new THREE.MeshStandardMaterial({color:'#8b9a60',roughness:1});
const tufts=new THREE.InstancedMesh(tuftGeo,tuftMat,240);
const tuftDummy=new THREE.Object3D();
for(let i=0;i<240;i++){const x=rand()*WORLD,z=rand()*WORLD;if(inLake(x,z))continue;tuftDummy.position.set(x+.5,heightAt(x,z)+.27,z+.5);tuftDummy.rotation.z=(rand()-.5)*.45;tuftDummy.scale.set(1,.6+rand(),1);tuftDummy.updateMatrix();tufts.setMatrixAt(i,tuftDummy.matrix);}
tufts.castShadow=false;scene.add(tufts);

const hemi=new THREE.HemisphereLight('#d7e0d2','#4b4035',1.55);scene.add(hemi);
const sun=new THREE.DirectionalLight('#ffe0b0',2.35);
sun.position.set(-28,42,-18);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
sun.shadow.camera.left=-36;sun.shadow.camera.right=36;sun.shadow.camera.top=36;sun.shadow.camera.bottom=-36;
sun.shadow.normalBias=.035;sun.shadow.bias=-.00015;scene.add(sun);scene.add(sun.target);
const fill=new THREE.DirectionalLight('#9cb8c2',.48);fill.position.set(25,18,28);scene.add(fill);
const sky=new THREE.Mesh(new THREE.SphereGeometry(120,24,16),new THREE.MeshBasicMaterial({color:'#8b9c91',side:THREE.BackSide}));scene.add(sky);

// Character: custom little forest wanderer, built from voxel-like pieces.
const player=new THREE.Group();scene.add(player);
function part(parent,geo,mat,x,y,z){const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
const skin=new THREE.MeshStandardMaterial({color:'#d6a47b',roughness:1});
const coat=new THREE.MeshStandardMaterial({color:'#9d4e43',roughness:1});
const coatDark=new THREE.MeshStandardMaterial({color:'#633a36',roughness:1});
const trousers=new THREE.MeshStandardMaterial({color:'#343c3b',roughness:1});
const hair=new THREE.MeshStandardMaterial({color:'#38272a',roughness:1});
const pack=new THREE.MeshStandardMaterial({color:'#b27a48',roughness:1});
const boot=new THREE.MeshStandardMaterial({color:'#47352d',roughness:1});
const body=part(player,new THREE.BoxGeometry(.65,.8,.38),coat,0,1.12,0);
part(player,new THREE.BoxGeometry(.18,.75,.25),pack,-.36,1.18,.02);
part(player,new THREE.BoxGeometry(.48,.48,.46),skin,0,1.78,0);
part(player,new THREE.BoxGeometry(.5,.22,.5),hair,0,2.03,0);
part(player,new THREE.BoxGeometry(.16,.07,.04),hair,-.12,1.84,-.235);
part(player,new THREE.BoxGeometry(.16,.07,.04),hair,.12,1.84,-.235);
const armL=part(player,new THREE.BoxGeometry(.2,.65,.23),coatDark,-.43,1.16,0);
const armR=part(player,new THREE.BoxGeometry(.2,.65,.23),coat,.43,1.16,0);
const legL=part(player,new THREE.BoxGeometry(.23,.58,.26),trousers,-.18,.48,0);
const legR=part(player,new THREE.BoxGeometry(.23,.58,.26),trousers,.18,.48,0);
part(player,new THREE.BoxGeometry(.27,.14,.36),boot,-.18,.19,-.03);
part(player,new THREE.BoxGeometry(.27,.14,.36),boot,.18,.19,-.03);
player.userData={legs:[legL,legR],arms:[armL,armR]};

const campfire=new THREE.Group();scene.add(campfire);
const logMat=new THREE.MeshStandardMaterial({color:'#65412d',roughness:1});
for(let i=0;i<3;i++){const log=part(campfire,new THREE.BoxGeometry(.95,.16,.18),logMat,0,.12,0);log.rotation.y=i*Math.PI/3;}
const flameMat=new THREE.MeshStandardMaterial({color:'#ff9b42',emissive:'#e45a18',emissiveIntensity:2.2,roughness:.7});
const flame=part(campfire,new THREE.ConeGeometry(.22,.72,5),flameMat,0,.53,0);
const fireLight=new THREE.PointLight('#ff9a4d',4.5,11,2);fireLight.position.set(0,1,0);campfire.add(fireLight);
campfire.position.set(14,heightAt(14,14)+1,14);

const state={x:14.5,z:14.5,y:heightAt(14,14)+1.02,vy:0,yaw:0,pitch:-.18,grounded:true,health:100,hunger:100,stamina:100,wood:0,stone:0,berries:0,selected:0,dayTime:8.5,toastTimer:0};
player.position.set(state.x,state.y-1,state.z);
const keys={};
let locked=false,toastTimer=0;
const raycaster=new THREE.Raycaster();
const center=new THREE.Vector2(0,0);
const clock=new THREE.Clock();
const prompt=document.querySelector('#prompt');
const startScreen=document.querySelector('#startScreen');
const toast=document.querySelector('#toast');
function say(text){toast.textContent=text;toast.classList.add('show');toastTimer=2.1;}
function updateHUD(){
  for(const [name,val] of [['health',state.health],['hunger',state.hunger],['stamina',state.stamina]]){
    document.getElementById(name+'Value').textContent=Math.round(val);
    document.getElementById(name+'Bar').style.width=val+'%';
  }
  document.getElementById('woodCount').textContent=state.wood;
  document.getElementById('stoneCount').textContent=state.stone;
  document.getElementById('berryCount').textContent=state.berries;
  const h=Math.floor(state.dayTime),m=Math.floor((state.dayTime-h)*60);
  document.getElementById('timeLabel').textContent='DAY 01 · '+String(h).padStart(2,'0')+':'+String(m).padStart(2,'0');
}
function start(){renderer.domElement.requestPointerLock?.();startScreen.classList.add('hidden');prompt.style.opacity=0;}
document.getElementById('startButton').addEventListener('click',start);
document.addEventListener('pointerlockchange',()=>{locked=document.pointerLockElement===renderer.domElement;prompt.style.opacity=locked?0:1;});
document.addEventListener('mousemove',e=>{if(!locked)return;state.yaw-=e.movementX*.0024;state.pitch=clamp(state.pitch-e.movementY*.0018,-.72,.32);});
document.addEventListener('keydown',e=>{keys[e.code]=true;if(['Space','ArrowUp','ArrowDown'].includes(e.code))e.preventDefault();if(e.code.startsWith('Digit'))selectSlot(Number(e.code.slice(5))-1);});
document.addEventListener('keyup',e=>keys[e.code]=false);
document.addEventListener('contextmenu',e=>e.preventDefault());
document.querySelectorAll('.slot').forEach(el=>el.addEventListener('click',()=>selectSlot(Number(el.dataset.slot))));
function selectSlot(n){if(n<0||n>3)return;state.selected=n;document.querySelectorAll('.slot').forEach((el,i)=>el.classList.toggle('selected',i===n));}
function getTarget(){raycaster.setFromCamera(center,camera);const hits=raycaster.intersectObjects(worldGroup.children,false);return hits.length?hits[0]:null;}
function gatherOrPlace(e){
  if(!locked)return;
  const hit=getTarget();if(!hit)return;
  const type=hit.object.userData.blockType;const blocks=blockByInstance.get(type);const b=blocks?.[hit.instanceId];if(!b)return;
  if(e.button===0){
    if(Math.hypot(b.x-state.x,b.z-state.z)>5.2){say('A little closer');return;}
    blockMap.delete(keyOf(b.x,b.y,b.z));
    if(type==='wood'||type==='leaves'||type==='leaves2'||type==='leaves3'){state.wood++;say('+1 WOOD');}
    else if(type==='stone'||type==='stone2'){state.stone++;say('+1 STONE');}
    else if(type==='grass'||type==='grass2'||type==='dirt'||type==='dirt2'){say('SOIL GATHERED');}
    else {say('GATHERED');}
    rebuildWorldMeshes();updateHUD();
  } else if(e.button===2){
    const normal=hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    const x=Math.floor(b.x+normal.x+.5),y=Math.floor(b.y+normal.y+.5),z=Math.floor(b.z+normal.z+.5);
    if(!['wood','dirt','stone'].includes(['wood','dirt','stone'][state.selected===1?0:state.selected===2?2:1]))return;
    const typeToPlace=state.selected===2?'stone':'wood';
    const cost=typeToPlace==='stone'?state.stone:state.wood;
    if(cost<1){say('NOT ENOUGH '+typeToPlace.toUpperCase());return;}
    if(blockMap.has(keyOf(x,y,z))|| (Math.abs(x-state.x)<.7&&Math.abs(z-state.z)<.7&&y<state.y+1.8)){say('CANNOT PLACE THERE');return;}
    blockMap.set(keyOf(x,y,z),{x,y,z,type:typeToPlace});if(typeToPlace==='stone')state.stone--;else state.wood--;
    rebuildWorldMeshes();updateHUD();say(typeToPlace.toUpperCase()+' PLACED');
  }
}
document.addEventListener('mousedown',gatherOrPlace);

function updatePlayer(dt){
  const forward=(keys.KeyW?1:0)-(keys.KeyS?1:0);
  const side=(keys.KeyD?1:0)-(keys.KeyA?1:0);
  const moving=Math.hypot(forward,side)>0;
  const speed=keys.ShiftLeft&&state.stamina>1?6.3:4.25;
  if(moving){
    const len=Math.hypot(forward,side),f=forward/len,s=side/len;
    state.x+=(-Math.sin(state.yaw)*f+Math.cos(state.yaw)*s)*speed*dt;
    state.z+=(-Math.cos(state.yaw)*f-Math.sin(state.yaw)*s)*speed*dt;
    state.stamina=Math.max(0,state.stamina-(speed>5?17:0)*dt+(!keys.ShiftLeft?8*dt:0));
  } else state.stamina=Math.min(100,state.stamina+12*dt);
  state.x=clamp(state.x,1,WORLD-2);state.z=clamp(state.z,1,WORLD-2);
  const floor=heightAt(Math.floor(state.x),Math.floor(state.z))+1;
  if(keys.Space&&state.grounded){state.vy=7.2;state.grounded=false;}
  state.vy-=19*dt;state.y+=state.vy*dt;
  if(state.y<=floor){state.y=floor;state.vy=0;state.grounded=true;}
  const targetYaw=state.yaw;
  player.rotation.y=targetYaw;
  player.position.set(state.x,state.y-1,state.z);
  const swing=Math.sin(performance.now()*.012)*.5*(moving?1:0);
  player.userData.legs[0].rotation.x=swing;player.userData.legs[1].rotation.x=-swing;
  player.userData.arms[0].rotation.x=-swing*.5;player.userData.arms[1].rotation.x=swing*.5;
  state.hunger=Math.max(0,state.hunger-.008*dt);
}
function updateCamera(dt){
  const distance=6.6, height=3.2;
  const horizontal=Math.cos(state.pitch)*distance;
  const target=new THREE.Vector3(state.x+Math.sin(state.yaw)*horizontal,state.y+height+Math.sin(state.pitch)*distance,state.z+Math.cos(state.yaw)*horizontal);
  camera.position.lerp(target,1-Math.exp(-8*dt));
  camera.lookAt(state.x,state.y+1.05,state.z);
}
function updateEnvironment(dt){
  state.dayTime+=dt*.035;if(state.dayTime>=24)state.dayTime-=24;
  const daylight=clamp(Math.sin((state.dayTime-6)/12*Math.PI),0,1);
  sun.intensity=.35+daylight*2.1;hemi.intensity=.45+daylight*1.1;
  const night=1-daylight;
  const skyDay=new THREE.Color('#91a79b'),skyNight=new THREE.Color('#172638');
  const c=skyNight.clone().lerp(skyDay,daylight);
  scene.background.copy(c);scene.fog.color.copy(c);sky.material.color.copy(c);
  renderer.toneMappingExposure=.78+daylight*.42;
  fireLight.intensity=4.1+Math.sin(performance.now()*.009)*.55;
  flame.scale.y=.85+Math.sin(performance.now()*.014)*.18;
  document.getElementById('weatherDot').style.background=night>.55?'#a6b5d0':'#e6bd78';
}
function animate(){
  requestAnimationFrame(animate);
  const dt=Math.min(clock.getDelta(),.04);
  if(locked){updatePlayer(dt);updateCamera(dt);state.dayTime+=dt*.035;updateEnvironment(0);}
  else updateCamera(dt);
  if(toastTimer>0){toastTimer-=dt;if(toastTimer<=0)toast.classList.remove('show');}
  updateHUD();
  renderer.render(scene,camera);
}
camera.position.set(20,9,22);camera.lookAt(14,3,14);
updateHUD();animate();
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
