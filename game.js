import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.js';

const canvas = document.querySelector('#game');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x91ad9b);
scene.fog = new THREE.FogExp2(0x91ad9b, 0.012);
const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.1, 180);
const renderer = new THREE.WebGLRenderer({canvas, antialias:false, powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;

const hemi = new THREE.HemisphereLight(0xc8e2d1, 0x526044, 1.45); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffe5b5, 2.15); sun.position.set(-35,55,25); sun.castShadow=true;
sun.shadow.mapSize.set(1024,1024); sun.shadow.camera.left=-42; sun.shadow.camera.right=42; sun.shadow.camera.top=42; sun.shadow.camera.bottom=-42; sun.shadow.camera.near=1; sun.shadow.camera.far=120; sun.shadow.bias=-0.0004; scene.add(sun); scene.add(sun.target);

const mats = {
 grass:new THREE.MeshLambertMaterial({color:0x709d54}), dirt:new THREE.MeshLambertMaterial({color:0x79583e}),
 stone:new THREE.MeshLambertMaterial({color:0x89918a}), sand:new THREE.MeshLambertMaterial({color:0xb7a36c}),
 trunk:new THREE.MeshLambertMaterial({color:0x795034}), leaves:new THREE.MeshLambertMaterial({color:0x426f43}),
 leaves2:new THREE.MeshLambertMaterial({color:0x5e8c4c}), rock:new THREE.MeshLambertMaterial({color:0x858e89}),
 water:new THREE.MeshLambertMaterial({color:0x4e91a0,transparent:true,opacity:.82}),
 wood:new THREE.MeshLambertMaterial({color:0x9a6b43}), camp:new THREE.MeshLambertMaterial({color:0x514538})
};
const cubeGeo = new THREE.BoxGeometry(1,1,1);
const world = {size:56, heights:[], blocks:[], ground:null, trees:[], rocks:[], props:[], interactables:[]};
const rand = (x,z,s=1)=>{let n=Math.sin(x*127.1+z*311.7+s*74.7)*43758.5453;return n-Math.floor(n)};
const smooth=(a,b,t)=>{t=THREE.MathUtils.clamp((t-a)/(b-a),0,1);return t*t*(3-2*t)};
function heightAt(x,z){const hills=Math.sin(x*.16)*1.2+Math.cos(z*.13)*.9+Math.sin((x+z)*.09)*.8;return Math.max(1,Math.floor(3+hills+Math.sin(x*.37+z*.21)*.35));}
function isLake(x,z){const d1=Math.hypot(x-35,z-17),d2=Math.hypot(x-12,z-40);return d1<5.4+Math.sin(x*1.7)*.7||d2<3.7+Math.cos(z)*.45;}
function addInstanced(material, positions, receive=true){if(!positions.length)return null;const mesh=new THREE.InstancedMesh(cubeGeo,material,positions.length);const dummy=new THREE.Object3D();positions.forEach((p,i)=>{dummy.position.set(p[0],p[1],p[2]);dummy.scale.set(p[3]||1,p[4]||1,p[5]||1);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});mesh.instanceMatrix.needsUpdate=true;mesh.castShadow=true;mesh.receiveShadow=receive;scene.add(mesh);return mesh;}
function buildWorld(){
 const grass=[],dirt=[],stone=[],sand=[],water=[];
 for(let x=0;x<world.size;x++){world.heights[x]=[];for(let z=0;z<world.size;z++){
  const lake=isLake(x,z)&&!(Math.hypot(x-27,z-27)<10);
  const h=heightAt(x,z);world.heights[x][z]=lake?1:h;
  if(lake){water.push([x,1.15,z]);sand.push([x,.5,z]);continue;}
  grass.push([x,h,z]);for(let y=h-1;y>=Math.max(0,h-2);y--)dirt.push([x,y,z]);for(let y=h-3;y>=0;y--)stone.push([x,y,z]);
 }}
 addInstanced(mats.stone,stone);addInstanced(mats.dirt,dirt);addInstanced(mats.grass,grass);addInstanced(mats.sand,sand);addInstanced(mats.water,water);
 // Scattered voxel grass tufts and flowers.
 const tufts=[],flowers=[];
 for(let x=0;x<world.size;x++)for(let z=0;z<world.size;z++){if(isLake(x,z))continue;const h=world.heights[x][z];if(rand(x,z,2)>.94)tufts.push([x+.25,h+.55,z+.2,.16,.35,.16]);if(rand(x,z,4)>.988)flowers.push([x+.25,h+.55,z+.2,.12,.22,.12]);}
 addInstanced(mats.leaves2,tufts);addInstanced(new THREE.MeshLambertMaterial({color:0xe2c779}),flowers);
 // Trees are assembled from chunky trunks and layered leaf blocks.
 const trunks=[],canopies=[],canopies2=[];
 for(let x=3;x<world.size-3;x++)for(let z=3;z<world.size-3;z++){
  const spawnSafe=Math.hypot(x-27,z-27)<7;
  if(!spawnSafe&&!isLake(x,z)&&rand(x,z,9)>.965){
   const h=world.heights[x][z],th=3+Math.floor(rand(x,z,11)*2);trunks.push([x,h+th/2,z,.72,th,.72]);
   canopies.push([x,h+th+0.1,z,2.7,1.5,2.7]);canopies2.push([x-.5,h+th+.9,z+.25,1.8,1.25,1.8]);
  }
 }
 addInstanced(mats.trunk,trunks);addInstanced(mats.leaves,canopies);addInstanced(mats.leaves2,canopies2);
 // A few rocks as larger block clusters.
 const rocksMat=new THREE.MeshLambertMaterial({color:0x818b87});
 for(let x=4;x<world.size-4;x++)for(let z=4;z<world.size-4;z++){if(!isLake(x,z)&&Math.hypot(x-27,z-27)>5.5&&rand(x,z,23)>.989){const y=world.heights[x][z]+.55;const rock=new THREE.Group();rock.position.set(x,y,z);const a=new THREE.Mesh(cubeGeo,rocksMat);a.scale.set(.9,.85,.85);a.position.y=.1;a.castShadow=true;a.receiveShadow=true;rock.add(a);const b=new THREE.Mesh(cubeGeo,rocksMat);b.scale.set(.55,.55,.6);b.position.set(.35,.65,.05);b.castShadow=true;rock.add(b);rock.userData={kind:'stone',amount:2};scene.add(rock);world.interactables.push(rock);world.rocks.push(rock);}}
 // Berry bushes.
 const berryMat=new THREE.MeshLambertMaterial({color:0x9d5262});
 for(let x=3;x<world.size-3;x++)for(let z=3;z<world.size-3;z++){if(!isLake(x,z)&&Math.hypot(x-27,z-27)>4.5&&rand(x,z,32)>.991){const y=world.heights[x][z]+.6;const bush=new THREE.Group();bush.position.set(x,y,z);const leaf=new THREE.Mesh(cubeGeo,mats.leaves2);leaf.scale.set(.9,.65,.9);leaf.castShadow=true;bush.add(leaf);for(let i=0;i<4;i++){const berry=new THREE.Mesh(cubeGeo,berryMat);berry.scale.set(.13,.13,.13);berry.position.set((i%2)*.4-.2,.12+Math.floor(i/2)*.2,.48);bush.add(berry);}bush.userData={kind:'berry',amount:2};scene.add(bush);world.interactables.push(bush);}}
 // Clear spawn plaza with a small fire.
 const fireGroup=new THREE.Group();fireGroup.position.set(27,world.heights[27][27]+.55,25);scene.add(fireGroup);
 const stones=[];for(let i=0;i<8;i++){const a=i*Math.PI/4;stones.push([Math.cos(a)*.75,.12,Math.sin(a)*.75,.38,.24,.38]);}addInstanced(mats.stone,stones.map(p=>[p[0]+27,p[1]+fireGroup.position.y,p[2]+25,p[3],p[4],p[5]]));
 const logs=new THREE.Mesh(cubeGeo,mats.wood);logs.scale.set(1.25,.18,.22);logs.rotation.y=.7;logs.position.y=.18;fireGroup.add(logs);
 const flameMat=new THREE.MeshBasicMaterial({color:0xffa34e});const flame=new THREE.Mesh(new THREE.ConeGeometry(.27,.85,5),flameMat);flame.position.y=.72;fireGroup.add(flame);
 const fireLight=new THREE.PointLight(0xff8b3d,2.2,10,2);fireLight.position.y=1.1;fireGroup.add(fireLight);fireGroup.userData={flame,fireLight};world.props.push(fireGroup);
}
buildWorld();

const player = new THREE.Group();scene.add(player);
const skin=new THREE.MeshLambertMaterial({color:0xd9a77c}),shirt=new THREE.MeshLambertMaterial({color:0x9b5945}),pants=new THREE.MeshLambertMaterial({color:0x35483f}),hair=new THREE.MeshLambertMaterial({color:0x493a2e}),pack=new THREE.MeshLambertMaterial({color:0x9a7548});
function part(parent,material,size,pos){const m=new THREE.Mesh(new THREE.BoxGeometry(...size),material);m.position.set(...pos);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
const body=new THREE.Group();player.add(body);
part(body,shirt,[.62,.72,.34],[0,1.12,0]);part(body,skin,[.43,.43,.43],[0,1.72,0]);part(body,hair,[.46,.2,.46],[0,1.94,0]);part(body,pack,[.28,.48,.2],[0,1.2,.27]);
const leftArm=new THREE.Group();leftArm.position.set(-.4,1.43,0);body.add(leftArm);part(leftArm,shirt,[.2,.55,.22],[0,-.22,0]);
const rightArm=new THREE.Group();rightArm.position.set(.4,1.43,0);body.add(rightArm);part(rightArm,shirt,[.2,.55,.22],[0,-.22,0]);
const leftLeg=new THREE.Group();leftLeg.position.set(-.17,.78,0);body.add(leftLeg);part(leftLeg,pants,[.23,.55,.25],[0,-.24,0]);
const rightLeg=new THREE.Group();rightLeg.position.set(.17,.78,0);body.add(rightLeg);part(rightLeg,pants,[.23,.55,.25],[0,-.24,0]);
const axe=part(rightArm,pack,[.09,.62,.09],[0,-.42,-.04]);axe.rotation.z=-.45;
player.position.set(27,world.heights[27][27]+.5,27);
player.userData={vy:0,onGround:true,health:100,hunger:100,stamina:100,wood:0,stone:0,berries:0,walk:0};
const groundPlane=new THREE.Plane(new THREE.Vector3(0,1,0),0);
let yaw=0,pitch=.28,locked=false,paused=true,selected=0,toastTimer=0,worldSeconds=0;
const keys={};const raycaster=new THREE.Raycaster();const center=new THREE.Vector2(0,0);
function showToast(msg){const el=document.querySelector('#toast');el.textContent=msg;el.classList.add('show');toastTimer=2.1;}
function updateHud(){
 const p=player.userData;for(const [id,v] of [['health',p.health],['hunger',p.hunger],['stamina',p.stamina]]){document.getElementById(id+'Fill').style.width=v+'%';document.getElementById(id+'Value').textContent=Math.round(v);}
 document.querySelector('#woodCount').textContent=p.wood;document.querySelector('#stoneCount').textContent=p.stone;document.querySelector('#berryCount').textContent=p.berries;document.querySelector('#slotWood').textContent=p.wood;document.querySelector('#slotStone').textContent=p.stone;
}
function selectSlot(n){selected=n;document.querySelectorAll('.slot').forEach((b,i)=>b.classList.toggle('selected',i===n));}
document.querySelectorAll('.slot').forEach(b=>b.addEventListener('click',()=>selectSlot(Number(b.dataset.slot))));
function startGame(){document.querySelector('#start-screen').classList.add('hidden');document.querySelector('#hotbar').classList.remove('hidden');canvas.requestPointerLock();}
document.querySelector('#playButton').addEventListener('click',startGame);
document.querySelector('#resumeButton').addEventListener('click',()=>{document.querySelector('#pause-screen').classList.add('hidden');canvas.requestPointerLock();});
document.addEventListener('pointerlockchange',()=>{locked=document.pointerLockElement===canvas;paused=!locked;if(!locked&&document.querySelector('#start-screen').classList.contains('hidden'))document.querySelector('#pause-screen').classList.remove('hidden');else document.querySelector('#pause-screen').classList.add('hidden');});
document.addEventListener('mousemove',e=>{if(!locked)return;yaw-=e.movementX*.0024;pitch=THREE.MathUtils.clamp(pitch-e.movementY*.0018,-.05,.85);});
document.addEventListener('keydown',e=>{keys[e.code]=true;if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();if(e.code.startsWith('Digit')){const n=Number(e.code.slice(5))-1;if(n>=0&&n<4)selectSlot(n);}if(e.code==='Escape'&&locked)document.exitPointerLock();if(e.code==='KeyE'&&player.userData.berries>0){player.userData.berries--;player.userData.hunger=Math.min(100,player.userData.hunger+18);updateHud();showToast('YOU ATE A WILD BERRY');}});
document.addEventListener('keyup',e=>keys[e.code]=false);
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('mousedown',e=>{if(!locked)return;raycaster.setFromCamera(center,camera);const hits=raycaster.intersectObjects(world.interactables,true);if(e.button===0&&hits.length){let obj=hits[0].object;while(obj.parent&&!obj.userData.kind)obj=obj.parent;if(obj.userData.kind){const kind=obj.userData.kind;if(kind==='stone')player.userData.stone+=obj.userData.amount;else player.userData.berries+=obj.userData.amount;scene.remove(obj);world.interactables=world.interactables.filter(o=>o!==obj);updateHud();showToast(kind==='stone'?'GATHERED STONE':'GATHERED WILD BERRIES');}}else if(e.button===2){if(selected===0&&player.userData.wood>0){placeBlock(0x9a6b43);player.userData.wood--;}else if(selected===1&&player.userData.stone>0){placeBlock(0x89918a);player.userData.stone--;}else if(selected===2&&player.userData.wood>=8){player.userData.wood-=8;showToast('CAMPFIRE BUILT');}else if(selected===3&&player.userData.wood>=4){player.userData.wood-=4;showToast('WOODEN WALL BUILT');}else showToast('NOT ENOUGH RESOURCES');updateHud();}});
const placedBlocks=[];
function placeBlock(color){const geo=cubeGeo;const mat=new THREE.MeshLambertMaterial({color});raycaster.setFromCamera(center,camera);const targets=world.interactables.length?world.interactables:[];const hit=raycaster.intersectObjects(targets,true)[0];if(!hit){showToast('AIM AT A SURFACE TO BUILD');return;}const pos=hit.point.clone().add(hit.face.normal.clone().multiplyScalar(.52));const block=new THREE.Mesh(geo,mat);block.position.set(Math.round(pos.x),Math.round(pos.y),Math.round(pos.z));block.castShadow=true;block.receiveShadow=true;scene.add(block);placedBlocks.push(block);showToast('BLOCK PLACED');}
function terrainY(x,z){const ix=THREE.MathUtils.clamp(Math.round(x),0,world.size-1),iz=THREE.MathUtils.clamp(Math.round(z),0,world.size-1);return world.heights[ix][iz]+.5;}
function updatePlayer(dt){
 const p=player.userData;let forward=(keys.KeyW||keys.ArrowUp?1:0)-(keys.KeyS||keys.ArrowDown?1:0),side=(keys.KeyD||keys.ArrowRight?1:0)-(keys.KeyA||keys.ArrowLeft?1:0);const moving=forward!==0||side!==0;
 const sprint=(keys.ShiftLeft||keys.ShiftRight)&&p.stamina>1&&moving;const speed=sprint?7.2:4.4;if(sprint)p.stamina=Math.max(0,p.stamina-22*dt);else p.stamina=Math.min(100,p.stamina+13*dt);
 const dir=new THREE.Vector3(Math.sin(yaw),0,Math.cos(yaw));const right=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));const move=dir.multiplyScalar(forward).add(right.multiplyScalar(side));if(move.lengthSq()>0)move.normalize();
 const nx=player.position.x+move.x*speed*dt,nz=player.position.z+move.z*speed*dt;
 if(nx>1&&nz>1&&nx<world.size-2&&nz<world.size-2&&!isLake(Math.round(nx),Math.round(nz))){player.position.x=nx;player.position.z=nz;player.position.y=THREE.MathUtils.lerp(player.position.y,terrainY(nx,nz),Math.min(1,dt*12));}
 if(moving){body.rotation.y=Math.atan2(move.x,move.z);p.walk+=dt*(sprint?13:9);}else p.walk=0;
 const swing=moving?Math.sin(p.walk)*.48:0;leftLeg.rotation.x=swing;rightLeg.rotation.x=-swing;leftArm.rotation.x=-swing*.8;rightArm.rotation.x=swing*.8;
 if(keys.Space&&p.onGround){p.vy=7;p.onGround=false;}p.vy-=19*dt;player.position.y+=p.vy*dt;const floor=terrainY(player.position.x,player.position.z);if(player.position.y<floor){player.position.y=floor;p.vy=0;p.onGround=true;}
 p.hunger=Math.max(0,p.hunger-dt*.12);if(p.hunger===0)p.health=Math.max(0,p.health-dt*1.5);
}
function updateCamera(dt){const target=new THREE.Vector3(player.position.x,player.position.y+1.45,player.position.z);const distance=6.6;const horizontal=Math.cos(pitch)*distance;const desired=new THREE.Vector3(target.x-Math.sin(yaw)*horizontal,target.y+Math.sin(pitch)*distance+1.2,target.z-Math.cos(yaw)*horizontal);camera.position.lerp(desired,1-Math.pow(.001,dt));camera.lookAt(target);}
function updateDay(dt){worldSeconds+=dt;const phase=(worldSeconds%360)/360;const night=phase>.68||phase<.08;const daylight=night?.22:1;const sky=new THREE.Color().setHSL(.38,.18,night?.12:.52);scene.background.copy(sky);scene.fog.color.copy(sky);hemi.intensity=.45+daylight;sun.intensity=night?.22:2.15;sun.color.set(night?0x9aaddd:0xffe5b5);sun.position.set(Math.sin(phase*Math.PI*2)*45,Math.max(12,Math.cos(phase*Math.PI*2)*48),25);document.querySelector('#timeIcon').textContent=night?'☾':'☀';document.querySelector('#timeLabel').textContent=(night?'DAY 1 · NIGHT':'DAY 1 · '+(phase<.3?'MORNING':'AFTERNOON'));}
function animateFire(t){for(const f of world.props){const {flame,fireLight}=f.userData;flame.scale.y=.8+Math.sin(t*9)*.12;flame.rotation.y=t*1.8;fireLight.intensity=1.8+Math.sin(t*11)*.35;}}
let last=performance.now();
function loop(now){requestAnimationFrame(loop);const dt=Math.min((now-last)/1000,.04);last=now;if(!paused){updatePlayer(dt);updateCamera(dt);updateDay(dt);animateFire(now/1000);if(toastTimer>0){toastTimer-=dt;if(toastTimer<=0)document.querySelector('#toast').classList.remove('show');}updateHud();}renderer.render(scene,camera);}
camera.position.set(27,9,18);camera.lookAt(player.position);
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));});
requestAnimationFrame(loop);
setTimeout(()=>document.querySelector('#loading').classList.add('done'),650);
