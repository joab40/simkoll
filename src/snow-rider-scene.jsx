import React,{useEffect,useMemo,useRef} from 'react'
import {useFrame,useThree} from '@react-three/fiber'
import {BufferGeometry,BufferAttribute,Color,ConeGeometry,CylinderGeometry,DynamicDrawUsage,Matrix4,MeshStandardMaterial,Vector3} from 'three'
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js'
import {SNOW_HALF_WIDTH,snowTrackCentre,snowTrackHeight,snowTrackGrade,snowNoise} from './snow-rider-engine.js'

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
        transform.setPosition(snowTrackCentre(along) + edge * offset, snowTrackHeight(along), -along)
        forest.current.setMatrixAt(index, transform)
      }
      forest.current.instanceMatrix.needsUpdate = true
      firstTreeSlot.current = firstSlot
    }
    forest.current.position.set(0, -snowTrackHeight(distance), distance)
  })

  return <instancedMesh
    ref={forest}
    args={[geometry, material, TREE_COUNT]}
    frustumCulled={false}
    instanceMatrix-usage={DynamicDrawUsage}
  />
}
function JumpRail() {
  return <group>
    <mesh position={[0, .64, 0]}>
      <boxGeometry args={[2, .5, .74]}/>
      <meshStandardMaterial color="#e16a36"/>
    </mesh>
    {[-.72, -.24, .24, .72].map(x => <mesh key={x} position={[x, .64, .002]}>
      <boxGeometry args={[.14, .51, .75]}/>
      <meshStandardMaterial color="#fff4d6"/>
    </mesh>)}
    {[-.92, .92].map(x => <mesh key={x} position={[x, .29, 0]}>
      <boxGeometry args={[.06, .66, .94]}/>
      <meshStandardMaterial color="#93442b"/>
    </mesh>)}
  </group>
}

function IceBank() {
  return <group>
    <mesh position={[0, 1, 0]}>
      <boxGeometry args={[2, 2.2, 3.5]}/>
      <meshStandardMaterial color="#478097"/>
    </mesh>
    <mesh position={[0, 2.36, 0]}>
      <boxGeometry args={[2, .78, 3.5]}/>
      <meshStandardMaterial color="#dfedf0"/>
    </mesh>
    <mesh position={[0, 1.58, 1.751]}>
      <planeGeometry args={[1.98, .19]}/>
      <meshStandardMaterial color="#a1d2de"/>
    </mesh>
  </group>
}
function Sled(){return <group>{[-.4,.4].map(x=><group key={x} position={[x,.1,0]}><mesh rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[.045,.045,1.75,8]}/><meshStandardMaterial color="#233b47" metalness={.5} roughness={.4}/></mesh><mesh position={[0,.13,-.8]} rotation={[0,Math.PI/2,0]}><torusGeometry args={[.15,.045,6,9,Math.PI]}/><meshStandardMaterial color="#233b47"/></mesh></group>)}<mesh position={[0,.28,0]} castShadow><boxGeometry args={[1,.17,1.6]}/><meshStandardMaterial color="#d69b62"/></mesh><mesh position={[0,.38,0]}><boxGeometry args={[.88,.1,1.3]}/><meshStandardMaterial color="#157d83"/></mesh><mesh position={[0,.72,.1]} castShadow><capsuleGeometry args={[.28,.38,4,8]}/><meshStandardMaterial color="#f59d54" flatShading/></mesh><mesh position={[0,1.26,-.02]} castShadow><sphereGeometry args={[.29,12,8]}/><meshStandardMaterial color="#daf064"/></mesh><mesh position={[0,1.22,.17]}><boxGeometry args={[.54,.09,.11]}/><meshStandardMaterial color="#214251"/></mesh><mesh position={[0,.98,.02]}><torusGeometry args={[.26,.07,5,12]}/><meshStandardMaterial color="#fff3db"/></mesh>{[-.25,.25].map(x=><mesh key={x} position={[x,.5,-.38]} rotation={[-.55,0,0]}><capsuleGeometry args={[.11,.4,3,6]}/><meshStandardMaterial color="#143b4a"/></mesh>)}</group>}
const TERRAIN_ROWS = 112
const SHOULDER = SNOW_HALF_WIDTH + .25
const SNOW_BANDS = [
  [-220, -SHOULDER, '#c3dbe6'],
  [-SHOULDER, -SNOW_HALF_WIDTH, '#a6ceda'],
  [-SNOW_HALF_WIDTH, SNOW_HALF_WIDTH, '#f7fcff'],
  [SNOW_HALF_WIDTH, SHOULDER, '#a6ceda'],
  [SHOULDER, 220, '#c3dbe6'],
]

function makeTerrainGeometry() {
  const geometry = new BufferGeometry()
  const verticesPerRow = SNOW_BANDS.length * 2
  const positions = new Float32Array(TERRAIN_ROWS * verticesPerRow * 3)
  const colors = new Float32Array(positions.length)
  const indices = []
  const tints = SNOW_BANDS.map(([, , hex]) => new Color(hex))
  for (let row = 0; row < TERRAIN_ROWS; row++) {
    for (let band = 0; band < SNOW_BANDS.length; band++) {
      const vertex = row * verticesPerRow + band * 2
      tints[band].toArray(colors, vertex * 3)
      tints[band].toArray(colors, (vertex + 1) * 3)
      if (row < TERRAIN_ROWS - 1) {
        const next = vertex + verticesPerRow
        indices.push(vertex, vertex + 1, next, vertex + 1, next + 1, next)
      }
    }
  }
  geometry.setAttribute('position', new BufferAttribute(positions, 3).setUsage(DynamicDrawUsage))
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(positions.length), 3).setUsage(DynamicDrawUsage))
  geometry.setAttribute('color', new BufferAttribute(colors, 3))
  geometry.setIndex(indices)
  return geometry
}

function SnowTerrain({model}) {
  const geometry = useMemo(makeTerrainGeometry, [])
  const lastDistance = useRef(null)
  useEffect(() => () => geometry.dispose(), [geometry])
  useFrame(() => {
    const {distance} = model.current
    if (lastDistance.current === distance) return
    lastDistance.current = distance
    const height = snowTrackHeight(distance)
    const {position, normal} = geometry.attributes
    let vertex = 0
    for (let row = 0; row < TERRAIN_ROWS; row++) {
      const forward = row * 2.6 - 30
      const along = distance + forward
      const centre = snowTrackCentre(along)
      const elevation = snowTrackHeight(along) - height
      const grade = snowTrackGrade(along)
      const up = 1 / Math.hypot(1, grade)
      for (const [left, right] of SNOW_BANDS) {
        position.setXYZ(vertex, centre + left, elevation, -forward)
        normal.setXYZ(vertex++, 0, up, grade * up)
        position.setXYZ(vertex, centre + right, elevation, -forward)
        normal.setXYZ(vertex++, 0, up, grade * up)
      }
    }
    position.needsUpdate = true
    normal.needsUpdate = true
  })
  return <mesh geometry={geometry} frustumCulled={false} receiveShadow>
    <meshStandardMaterial vertexColors roughness={.95}/>
  </mesh>
}
export default function SnowRiderScene({model,effects,onContextLost}){
  const rider=useRef(),items=useRef([]),snow=useRef(),{camera,gl}=useThree()
  const cameraTarget = useMemo(() => new Vector3(), [])
  const pineGeometry = useMemo(createPineGeometry, [])
  const pineMaterial = useMemo(() => new MeshStandardMaterial({vertexColors: true, flatShading: true}), [])
  useEffect(() => () => {
    pineGeometry.dispose()
    pineMaterial.dispose()
  }, [pineGeometry, pineMaterial])
  useEffect(()=>{const canvas=gl.domElement;const lost=event=>{event.preventDefault();onContextLost()};canvas.addEventListener('webglcontextlost',lost);return()=>canvas.removeEventListener('webglcontextlost',lost)},[gl,onContextLost])
  const snowPositions=useMemo(()=>{const p=new Float32Array(150*3);for(let i=0;i<150;i++)p.set([(snowNoise(i+51)-.5)*55,snowNoise(i+42)*17,-snowNoise(i+14)*90],i*3);return p},[])
  useFrame((_, dt) => {
    const {distance, elapsed, x, y, vx, objects, status} = model.current
    const centre = snowTrackCentre(distance)
    const height = snowTrackHeight(distance)
    const ahead = distance + 26
    rider.current.position.set(centre + x, .05 + y, 0)
    rider.current.rotation.set(Math.atan(snowTrackGrade(distance)), -vx * .035, -vx * .025, 'YXZ')
    cameraTarget.set(centre + x * .56, 5.5 + y * .35, 10.5)
    const follow = 1 - Math.exp(-Math.min(dt, .1) * 11)
    if (status === 'ready' || elapsed < .13) camera.position.copy(cameraTarget)
    else camera.position.lerp(cameraTarget, follow)
    camera.lookAt(centre * .36 + snowTrackCentre(ahead) * .64 + x * .18, (snowTrackHeight(ahead) - height) * .58 + .35, -26)

    items.current.forEach((holder, index) => {
      if (!holder) return
      const item = objects[index]
      holder.visible = Boolean(item && !item.taken)
      if (!holder.visible) return
      const isGem = item.kind === 'gem'
      holder.position.set(snowTrackCentre(item.s) + item.x, snowTrackHeight(item.s) - height, distance - item.s)
      holder.rotation.x = isGem ? 0 : Math.atan(snowTrackGrade(item.s))
      const [rail, bank, gem] = holder.children
      rail.visible = item.kind === 'rail'
      bank.visible = item.kind === 'bank'
      gem.visible = isGem
      if (isGem) {
        gem.rotation.y = elapsed * 2
        gem.position.y = item.height + Math.sin(elapsed * 3 + item.s) * .14
      } else {
        holder.scale.x = item.radius
      }
      if (isGem) holder.scale.x = 1
    })
    if (snow.current) {
      snow.current.position.x = centre
      snow.current.rotation.y = Math.sin(elapsed * .18) * .22
    }
  })
  return <><color attach="background" args={['#bddde6']}/><fog attach="fog" args={['#c9e2e9',65,225]}/><hemisphereLight args={['#e9f7ff','#698794',2.1]}/><directionalLight position={[-25,45,-25]} color="#fff0cb" intensity={3.1} castShadow shadow-mapSize={[1024,1024]} shadow-camera-left={-18} shadow-camera-right={18} shadow-camera-top={20} shadow-camera-bottom={-20}/>
    <SnowTerrain model={model}/>
    {Array.from({length:9},(_,i)=><group key={i} position={[(i-4)*44,2,-210-Math.abs(i-4)*7]}><mesh><coneGeometry args={[42,58+snowNoise(i+5)*50,5]}/><meshStandardMaterial color={i%2?'#9ab8c7':'#b3cdda'} flatShading/></mesh><mesh position={[0,25,0]}><coneGeometry args={[21,36,5]}/><meshStandardMaterial color="#e7f3f7" flatShading/></mesh></group>)}
    <mesh position={[-47,26,-140]}><sphereGeometry args={[8,24,16]}/><meshBasicMaterial color="#fff1c8" fog={false}/></mesh>
    <PineForest model={model} geometry={pineGeometry} material={pineMaterial}/>
    {Array.from({length:18}, (_, index) => <group key={index} ref={node => {items.current[index] = node}}>
      <JumpRail/>
      <IceBank/>
      <mesh position={[0, 1.1, 0]}>
        <octahedronGeometry args={[.43, 0]}/>
        <meshStandardMaterial color="#ffcb66" metalness={.35} roughness={.25} emissive="#c77720" emissiveIntensity={.22}/>
      </mesh>
    </group>)}
    <group ref={rider}><Sled/></group>
    {effects&&<points ref={snow}><bufferGeometry><bufferAttribute attach="attributes-position" args={[snowPositions,3]}/></bufferGeometry><pointsMaterial size={.075} color="#fff" transparent opacity={.65} depthWrite={false}/></points>}
  </>
}
