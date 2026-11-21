import React,{useEffect,useMemo,useRef} from 'react'
import {useFrame,useThree} from '@react-three/fiber'
import {BufferGeometry,BufferAttribute,Color,ConeGeometry,CylinderGeometry,DynamicDrawUsage,Matrix4,MeshStandardMaterial,Vector3} from 'three'
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js'
import {snowTrackCentre,snowNoise} from './snow-rider-engine.js'

const TREE_SPACING = 14
const TREE_COUNT = 22

function createPineGeometry() {
  const parts = []
  const addPart = (geometry, height, hex) => {
    geometry.translate(0, height, 0)
    const color = new Color(hex)
    const colors = new Float32Array(geometry.attributes.position.count * 3)
    for (let offset = 0; offset < colors.length; offset += 3) color.toArray(colors, offset)
    geometry.setAttribute('color', new BufferAttribute(colors, 3))
    parts.push(geometry)
  }

  addPart(new CylinderGeometry(.14, .23, 1.2, 5), .6, '#725749')
  for (let tier = 0; tier < 3; tier++) {
    const height = .9 + tier * .7
    addPart(new ConeGeometry(1.03 - tier * .22, 1.65, 7), height, tier === 1 ? '#225e5c' : '#174e50')
    addPart(new ConeGeometry(.8 - tier * .17, 1.15, 7), height + .27, '#eef7f7')
  }
  const pine = mergeGeometries(parts)
  parts.forEach(part => part.dispose())
  return pine
}

function PineForest({model, geometry, material}) {
  const forest = useRef(null)
  const firstTreeSlot = useRef(null)
  const transform = useMemo(() => new Matrix4(), [])

  useFrame(() => {
    const {distance} = model.current
    // Recycle only out of view. Each tree's size and offset follow its course
    // position, so a tree already on screen keeps the exact same transform.
    const firstSlot = Math.floor((distance - 28) / TREE_SPACING)
    if (firstTreeSlot.current !== firstSlot) {
      for (let index = 0; index < TREE_COUNT; index++) {
        const slot = firstSlot + index
        const along = slot * TREE_SPACING
        const edge = slot % 2 === 0 ? 1 : -1
        const offset = 8 + snowNoise(slot * 7) * 16
        const size = 1.3 + snowNoise(slot) * 1.7
        transform.makeScale(size, size, size)
        transform.setPosition(snowTrackCentre(along) + edge * offset, -along * .025, -along)
        forest.current.setMatrixAt(index, transform)
      }
      forest.current.instanceMatrix.needsUpdate = true
      firstTreeSlot.current = firstSlot
    }
    forest.current.position.set(0, distance * .025, distance)
  })

  return <instancedMesh
    ref={forest}
    args={[geometry, material, TREE_COUNT]}
    frustumCulled={false}
    instanceMatrix-usage={DynamicDrawUsage}
  />
}
function Snowman(){return <group><mesh position={[0,.55,0]}><sphereGeometry args={[.56,10,8]}/><meshStandardMaterial color="#f9fcff" flatShading/></mesh><mesh position={[0,1.27,0]}><sphereGeometry args={[.35,10,8]}/><meshStandardMaterial color="#fff8e9" flatShading/></mesh><mesh position={[0,1.07,0]}><cylinderGeometry args={[.37,.38,.15,10]}/><meshStandardMaterial color="#ed854c"/></mesh><mesh position={[0,1.65,0]}><cylinderGeometry args={[.3,.32,.35,8]}/><meshStandardMaterial color="#173c49"/></mesh></group>}
function Sled(){return <group>{[-.4,.4].map(x=><group key={x} position={[x,.1,0]}><mesh rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[.045,.045,1.75,8]}/><meshStandardMaterial color="#233b47" metalness={.5} roughness={.4}/></mesh><mesh position={[0,.13,-.8]} rotation={[0,Math.PI/2,0]}><torusGeometry args={[.15,.045,6,9,Math.PI]}/><meshStandardMaterial color="#233b47"/></mesh></group>)}<mesh position={[0,.28,0]} castShadow><boxGeometry args={[1,.17,1.6]}/><meshStandardMaterial color="#d69b62"/></mesh><mesh position={[0,.38,0]}><boxGeometry args={[.88,.1,1.3]}/><meshStandardMaterial color="#157d83"/></mesh><mesh position={[0,.72,.1]} castShadow><capsuleGeometry args={[.28,.38,4,8]}/><meshStandardMaterial color="#f59d54" flatShading/></mesh><mesh position={[0,1.26,-.02]} castShadow><sphereGeometry args={[.29,12,8]}/><meshStandardMaterial color="#daf064"/></mesh><mesh position={[0,1.22,.17]}><boxGeometry args={[.54,.09,.11]}/><meshStandardMaterial color="#214251"/></mesh><mesh position={[0,.98,.02]}><torusGeometry args={[.26,.07,5,12]}/><meshStandardMaterial color="#fff3db"/></mesh>{[-.25,.25].map(x=><mesh key={x} position={[x,.5,-.38]} rotation={[-.55,0,0]}><capsuleGeometry args={[.11,.4,3,6]}/><meshStandardMaterial color="#143b4a"/></mesh>)}</group>}
function Trail({model}){
  const geometry=useMemo(()=>{
    const g=new BufferGeometry(),positions=new Float32Array(2*72*3),normals=new Float32Array(positions.length),indices=[]
    for(let i=0;i<72;i++){normals[i*6+1]=1;normals[i*6+4]=1;if(i<71){const a=i*2;indices.push(a,a+1,a+2,a+1,a+3,a+2)}}
    g.setAttribute('position',new BufferAttribute(positions,3));g.setAttribute('normal',new BufferAttribute(normals,3));g.setIndex(indices);return g
  },[])
  useEffect(()=>()=>geometry.dispose(),[geometry])
  useFrame(()=>{const game=model.current,array=geometry.attributes.position.array;for(let i=0;i<72;i++){const forward=i*3.6-15,centre=snowTrackCentre(game.distance+forward);array.set([centre-5.1,-forward*.025+.025,-forward,centre+5.1,-forward*.025+.025,-forward],i*6)}geometry.attributes.position.needsUpdate=true})
  return <mesh geometry={geometry} frustumCulled={false} receiveShadow><meshStandardMaterial color="#f7fcff" roughness={.95}/></mesh>
}
export default function SnowRiderScene({model,effects,onContextLost}){
  const rider=useRef(),items=useRef([]),snow=useRef(),{camera,gl}=useThree(),target=useMemo(()=>new Vector3(),[])
  const pineGeometry = useMemo(createPineGeometry, [])
  const pineMaterial = useMemo(() => new MeshStandardMaterial({vertexColors: true, flatShading: true}), [])
  useEffect(() => () => {
    pineGeometry.dispose()
    pineMaterial.dispose()
  }, [pineGeometry, pineMaterial])
  useEffect(()=>{const canvas=gl.domElement;const lost=event=>{event.preventDefault();onContextLost()};canvas.addEventListener('webglcontextlost',lost);return()=>canvas.removeEventListener('webglcontextlost',lost)},[gl,onContextLost])
  const snowPositions=useMemo(()=>{const p=new Float32Array(150*3);for(let i=0;i<150;i++)p.set([(snowNoise(i+51)-.5)*55,snowNoise(i+42)*17,-snowNoise(i+14)*90],i*3);return p},[])
  useFrame((state,dt)=>{
    const game=model.current,centre=snowTrackCentre(game.distance),visualTime=game.elapsed
    rider.current.position.set(centre+game.x,.05+game.y,0);rider.current.rotation.z=-game.vx*.025;rider.current.rotation.y=-game.vx*.035
    target.set(centre+game.x*.24,3.8+game.y*.2,10.5);camera.position.lerp(target,1-Math.exp(-Math.min(dt,.1)*7));camera.lookAt(snowTrackCentre(game.distance+50),-1.2,-45)
    items.current.forEach((holder,i)=>{if(!holder)return;const item=game.objects[i];holder.visible=!!item;if(!item)return;const forward=item.s-game.distance;holder.position.set(snowTrackCentre(item.s)+item.x,-forward*.025,-forward);holder.children.forEach((child,index)=>{child.visible=['pine','rock','snowman','log','gem'][index]===item.kind});if(item.kind==='gem'){holder.children[4].rotation.y=visualTime*2;holder.children[4].position.y=1.1+Math.sin(visualTime*3+i)*.14}})
    if(snow.current){snow.current.position.x=centre;snow.current.position.z=game.distance%12;if(effects)snow.current.rotation.y=Math.sin(visualTime*.08)*.1}
  })
  return <><color attach="background" args={['#bddde6']}/><fog attach="fog" args={['#c9e2e9',65,225]}/><hemisphereLight args={['#e9f7ff','#698794',2.1]}/><directionalLight position={[-25,45,-25]} color="#fff0cb" intensity={3.1} castShadow shadow-mapSize={[1024,1024]} shadow-camera-left={-18} shadow-camera-right={18} shadow-camera-top={20} shadow-camera-bottom={-20}/>
    <mesh rotation={[-Math.PI/2-.025,0,0]} position={[0,-2.08,-80]} receiveShadow><planeGeometry args={[700,650]}/><meshStandardMaterial color="#c3dbe6" roughness={1}/></mesh><Trail model={model}/>
    {Array.from({length:9},(_,i)=><group key={i} position={[(i-4)*44,2,-210-Math.abs(i-4)*7]}><mesh><coneGeometry args={[42,58+snowNoise(i+5)*50,5]}/><meshStandardMaterial color={i%2?'#9ab8c7':'#b3cdda'} flatShading/></mesh><mesh position={[0,25,0]}><coneGeometry args={[21,36,5]}/><meshStandardMaterial color="#e7f3f7" flatShading/></mesh></group>)}
    <mesh position={[-47,26,-140]}><sphereGeometry args={[8,24,16]}/><meshBasicMaterial color="#fff1c8" fog={false}/></mesh>
    <PineForest model={model} geometry={pineGeometry} material={pineMaterial}/>
    {Array.from({length:32},(_,i)=><group key={i} ref={node=>{items.current[i]=node}}><mesh geometry={pineGeometry} material={pineMaterial}/><mesh position={[0,.35,0]} scale={[1.2,.7,1]}><dodecahedronGeometry args={[.8,0]}/><meshStandardMaterial color="#819aa5" flatShading/></mesh><Snowman/><mesh position={[0,.32,0]} rotation={[0,0,Math.PI/2]}><cylinderGeometry args={[.32,.36,2.2,8]}/><meshStandardMaterial color="#8d6854" flatShading/></mesh><mesh position={[0,1.1,0]}><octahedronGeometry args={[.43,0]}/><meshStandardMaterial color="#ffcb66" metalness={.35} roughness={.25} emissive="#c77720" emissiveIntensity={.22}/></mesh></group>)}
    <group ref={rider}><Sled/></group>
    {effects&&<points ref={snow}><bufferGeometry><bufferAttribute attach="attributes-position" args={[snowPositions,3]}/></bufferGeometry><pointsMaterial size={.075} color="#fff" transparent opacity={.65} depthWrite={false}/></points>}
  </>
}
