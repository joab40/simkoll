import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { BufferAttribute, BufferGeometry, CanvasTexture, Color, Matrix4, Vector3 } from 'three'
import { createPineGeometry } from './winter-pine.js'
import { snowNoise } from './snow-rider-engine.js'
import { downhillBank, downhillCentre, downhillGrade, downhillSurface, DOWNHILL_CRESTS, DOWNHILL_GATES, DOWNHILL_GREEN_AT, DOWNHILL_HALF_WIDTH, DOWNHILL_LENGTH } from './downhill-engine.js'

const H = DOWNHILL_HALF_WIDTH
const snowBands = [
  [-133, -32, '#b1cddd'], [-32, -12, '#d9eaf0'], [-12, -H, '#c6e0e7'],
  [-H, -H + .35, '#9ad0df'], [-H + .35, H - .35, '#f1faff'], [H - .35, H, '#9ad0df'],
  [H, 12, '#c6e0e7'], [12, 32, '#d9eaf0'], [32, 133, '#b1cddd'],
]
const landscape = (s, x) => {
  const shoulder = Math.max(0, Math.abs(x) - H - 2)
  return downhillSurface(s, x) + Math.min(shoulder * .12, 8) * (.38 + .62 * Math.sin(s * .031 + x * .05))
}

function useSceneGeometry(make) {
  const geometry = useMemo(make, [])
  useEffect(() => () => geometry.dispose(), [geometry])
  return geometry
}

function makeTerrain() {
  const positions = [], colors = [], indices = []
  const tints = snowBands.map(([, , color]) => new Color(color))
  const vertexCount = snowBands.length * 2
  let row = 0
  for (let s = -24; s <= DOWNHILL_LENGTH + 200; s += 2.4, row++) {
    const centre = downhillCentre(s)
    for (let i = 0; i < snowBands.length; i++) {
      for (const x of snowBands[i].slice(0, 2)) {
        positions.push(centre + x, landscape(s, x), -s)
        const tint = tints[i]
        const light = 1 - .035 * (Math.sin(s * .13) ** 2)
        colors.push(tint.r * light, tint.g * light, tint.b * light)
      }
      if (row > 0) {
        const current = row * vertexCount + i * 2
        const previous = current - vertexCount
        indices.push(previous, previous + 1, current, previous + 1, current + 1, current)
      }
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function GroundMark({ distance, x = 0, width, depth, color }) {
  return <mesh position={[downhillCentre(distance) + x, downhillSurface(distance, x) + .12, -distance]}
    rotation={[Math.atan(downhillGrade(distance)) - Math.PI / 2, Math.atan(downhillBank(distance)), 0]}>
    <planeGeometry args={[width, depth]} /><meshBasicMaterial color={color} side={2} />
  </mesh>
}

function Gates({ model }) {
  const upcoming = useRef(null)
  useFrame(() => {
    const gate = DOWNHILL_GATES[model.current.gateIndex]
    upcoming.current.visible = Boolean(gate)
    if (gate) {
      upcoming.current.position.set(downhillCentre(gate.distance) + gate.x, downhillSurface(gate.distance, gate.x) + .18, -gate.distance)
      upcoming.current.rotation.set(Math.atan(downhillGrade(gate.distance)) - Math.PI / 2, Math.atan(downhillBank(gate.distance)), 0)
    }
  })
  return <>
    {DOWNHILL_GATES.map(gate => <group key={gate.id}>
      <GroundMark distance={gate.distance} x={gate.x} width={gate.halfWidth * 2} depth={.16} color={gate.color} />
      {[-1, 1].map(side => {
        const x = gate.x + side * gate.halfWidth
        return <group key={side} position={[downhillCentre(gate.distance) + x, downhillSurface(gate.distance, x), -gate.distance]}>
          <mesh position={[0, 1.32, 0]}><cylinderGeometry args={[.06, .1, 2.64, 6]} /><meshStandardMaterial color="#265565" /></mesh>
          <mesh position={[side * .48, 1.94, 0]}><boxGeometry args={[.98, .8, .06]} /><meshStandardMaterial color={gate.color} /></mesh>
          <mesh position={[side * .48, 1.94, .035]}><boxGeometry args={[.85, .1, .03]} /><meshBasicMaterial color="#edfbff" /></mesh>
        </group>
      })}
    </group>)}
    <mesh ref={upcoming}>
      <planeGeometry args={[2.3, .35]} /><meshBasicMaterial color="#e8f68a" transparent opacity={.86} side={2} />
    </mesh>
  </>
}

function courseBanner(label, backdrop) {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 90
  const context = canvas.getContext('2d')
  context.fillStyle = backdrop
  context.fillRect(0, 0, 512, 90)
  context.fillStyle = '#ddf3f3'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.font = '800 42px system-ui'
  context.fillText(label, 256, 45)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = 'srgb'
  return texture
}

function Arch({ model, finish = false }) {
  const s = finish ? DOWNHILL_LENGTH : 8
  const postOffset = H + 1.5
  const lamp = useRef(null)
  const texture = useMemo(() => courseBanner(finish ? 'MÅL · FROSTFJÄLL' : 'FROSTFJÄLL · START', finish ? '#19566a' : '#174651'), [finish])
  useEffect(() => () => texture.dispose(), [texture])
  useFrame(() => {
    if (finish) return
    const { phase, countdown } = model.current
    const go = phase === 'racing' || (phase === 'countdown' && countdown >= DOWNHILL_GREEN_AT)
    lamp.current.color.set(go ? '#d3f68a' : phase === 'countdown' ? '#ff9a62' : '#abccd4')
  })
  return <group position={[downhillCentre(s), downhillSurface(s, 0), -s]}>
    {[-1, 1].map(side => <group key={side} position={[side * postOffset, 0, 0]}>
      <mesh position={[0, 2.45, 0]}><boxGeometry args={[.75, 5.6, .95]} /><meshStandardMaterial color={finish ? '#357787' : '#20586a'} /></mesh>
      <mesh position={[0, .62, 0]}><boxGeometry args={[1.05, 1.65, 1.2]} /><meshStandardMaterial color={finish ? '#f2ae63' : '#7cd1c4'} /></mesh>
    </group>)}
    <mesh position={[0, 4.85, .2]}><boxGeometry args={[postOffset * 2 + .5, 1.18, .72]} /><meshStandardMaterial color="#174651" /></mesh>
    <mesh position={[0, 4.85, .57]}><planeGeometry args={[11.8, 1.13]} /><meshBasicMaterial map={texture} /></mesh>
    {!finish && <mesh position={[0, 3.9, .6]}><boxGeometry args={[2.2, .22, .4]} /><meshBasicMaterial ref={lamp} /></mesh>}
  </group>
}

function ForestTile({ geometry, start }) {
  const trees = useRef(null)
  useLayoutEffect(() => {
    const transform = new Matrix4()
    for (let i = 0; i < 112; i++) {
      const seed = i + start * 2
      const side = i % 2 ? 1 : -1
      const s = start + Math.floor(i / 4) * 7.3 + snowNoise(seed + 32) * 6
      const x = side * (11 + Math.floor(i % 4 / 2) * 24 + snowNoise(seed + 63) * 11)
      const size = 1.05 + snowNoise(seed) * 2.63
      transform.makeScale(size, size, size)
      transform.setPosition(downhillCentre(s) + x, landscape(s, x), -s)
      trees.current.setMatrixAt(i, transform)
    }
    trees.current.instanceMatrix.needsUpdate = true
    trees.current.computeBoundingSphere()
  }, [start])
  return <instancedMesh ref={trees} args={[geometry, undefined, 112]}>
    <meshStandardMaterial vertexColors roughness={1} />
  </instancedMesh>
}

function Peaks() {
  return Array.from({ length: 26 }, (_, i) => {
    const s = 130 + Math.floor(i / 2) * 118 + snowNoise(i + 5) * 40
    const x = (i % 2 ? 1 : -1) * (79 + snowNoise(i + 43) * 40)
    const radius = 32 + snowNoise(i) * 22
    const height = 27 + snowNoise(i + 12) * 35
    return <group key={i} position={[downhillCentre(s) + x, landscape(s, x) - 11, -s]} rotation={[0, i * .89, 0]}>
      <mesh position={[0, height * .5, 0]} scale={[1.25, 1, .88]}>
        <coneGeometry args={[radius, height, 6]} /><meshStandardMaterial color={i % 3 ? '#8daabd' : '#a4bdcf'} flatShading />
      </mesh>
      <mesh position={[0, height * .837, 0]} scale={[1.25, 1, .88]}>
        <coneGeometry args={[radius * .34, height * .34, 6]} /><meshStandardMaterial color="#e1f2fa" flatShading />
      </mesh>
    </group>
  })
}

function Lift({ model, start, end, x }) {
  const cabins = useRef(null)
  const transform = useMemo(() => new Matrix4(), [])
  const cable = useMemo(() => {
    const points = []
    for (let s = start; s <= end + 1; s += 10) points.push(new Vector3(x, downhillSurface(s, 0) + 12, -s))
    return new BufferGeometry().setFromPoints(points)
  }, [start, end, x])
  useEffect(() => () => cable.dispose(), [cable])
  useFrame(() => {
    for (let i = 0; i < 7; i++) {
      const progress = (i / 7 + model.current.elapsed * .006) % 1
      const s = end - (end - start) * progress
      transform.makeTranslation(x, downhillSurface(s, 0) + 10.6, -s)
      cabins.current.setMatrixAt(i, transform)
    }
    cabins.current.instanceMatrix.needsUpdate = true
  })
  return <>
    <line geometry={cable}><lineBasicMaterial color="#355768" /></line>
    <instancedMesh ref={cabins} args={[undefined, undefined, 7]} frustumCulled={false}>
      <boxGeometry args={[1.7, 1.45, 1.48]} /><meshStandardMaterial color="#eebd68" roughness={.45} />
    </instancedMesh>
    {Array.from({ length: 7 }, (_, i) => {
      const s = start + (end - start) * i / 6
      return <group key={i} position={[x, downhillSurface(s, 0), -s]}>
        <mesh position={[0, 3.1, 0]}><cylinderGeometry args={[.24, .41, 16.4, 6]} /><meshStandardMaterial color="#4b6978" /></mesh>
        <mesh position={[0, 11.4, 0]}><boxGeometry args={[4, .34, .46]} /><meshStandardMaterial color="#436471" /></mesh>
      </group>
    })}
  </>
}

function Skier({ model, effects }) {
  const skier = useRef(null), shadow = useRef(null), spray = useRef(null)
  const upperBody = useRef(null), legs = useRef(null)
  const specks = useMemo(() => {
    const points = new Float32Array(64 * 3)
    for (let i = 0; i < 64; i++) points.set([(snowNoise(i) - .5) * 1.9, snowNoise(i * 3) * .65, snowNoise(i + 44) * 4.6], i * 3)
    return points
  }, [])
  useFrame(() => {
    const { track, x, vx, phase, speed, tuck, jump } = model.current
    const centre = downhillCentre(track) + x
    const height = downhillSurface(track, x)
    const pitch = Math.atan(downhillGrade(track))
    const heading = (downhillCentre(track + 1) - downhillCentre(track - 1)) * .5
    const airborne = jump?.height || 0
    const airPitch = Math.max(-.14, Math.min(.14, (jump?.velocity || 0) * .018)) * Math.min(airborne / .4, 1)
    skier.current.position.set(centre, height + airborne + .07, -track)
    skier.current.rotation.set(pitch + airPitch, -heading * .62 - vx * .032, Math.atan(downhillBank(track)) - vx * .032, 'YXZ')
    upperBody.current.position.y = .87 - tuck * .15
    upperBody.current.rotation.x = .54 - tuck * .62
    legs.current.scale.y = 1.04 - tuck * .17
    shadow.current.position.set(centre, height + .1, -track)
    shadow.current.rotation.set(pitch - Math.PI / 2, Math.atan(downhillBank(track)), 0)
    if (spray.current) {
      spray.current.visible = effects && phase === 'racing' && !jump && speed > 15 && Math.abs(vx) > 2.1
      spray.current.position.set(centre, height + .08, -track + .5)
      spray.current.rotation.y = vx * .036
      spray.current.material.opacity = Math.min(.78, Math.abs(vx) * .065)
    }
  })
  return <>
    <mesh ref={shadow} scale={[.78, 1.5, 1]}>
      <circleGeometry args={[.87, 18]} /><meshBasicMaterial color="#244957" opacity={.22} transparent depthWrite={false} side={2} />
    </mesh>
    <group ref={skier}>
      {[-1, 1].map(side => <group key={side} position={[side * .24, 0, 0]}>
        <mesh><boxGeometry args={[.17, .1, 2.52]} /><meshStandardMaterial color="#e67452" /></mesh>
        <mesh position={[0, .055, -.55]}><boxGeometry args={[.173, .03, .6]} /><meshStandardMaterial color="#d8f5b2" /></mesh>
      </group>)}
      <group ref={legs}>
        {[-1, 1].map(side => <mesh key={side} position={[side * .24, .43, .22]} rotation={[.42, 0, side * .1]}>
          <capsuleGeometry args={[.12, .57, 3, 8]} /><meshStandardMaterial color="#204150" />
        </mesh>)}
      </group>
      <group ref={upperBody} position={[0, .87, .2]}>
        <mesh position={[0, .19, -.3]} rotation={[-.79, 0, 0]} scale={[1.04, 1, .8]}>
          <capsuleGeometry args={[.31, .49, 4, 9]} /><meshStandardMaterial color="#167981" />
        </mesh>
        <mesh position={[0, .32, -.05]} rotation={[-.79, 0, 0]}>
          <boxGeometry args={[.43, .28, .088]} /><meshStandardMaterial color="#eef7ec" />
        </mesh>
        <mesh position={[0, .62, -.59]}><sphereGeometry args={[.255, 13, 9]} /><meshStandardMaterial color="#d9f179" /></mesh>
        <mesh position={[0, .595, -.8]}><boxGeometry args={[.41, .093, .104]} /><meshStandardMaterial color="#242f46" /></mesh>
        {[-1, 1].map(side => <mesh key={side} position={[side * .36, .15, -.4]} rotation={[-1.1, 0, side * .25]}>
          <capsuleGeometry args={[.1, .54, 3, 7]} /><meshStandardMaterial color="#2c9da1" />
        </mesh>)}
      </group>
    </group>
    {effects && <points ref={spray} frustumCulled={false}>
      <bufferGeometry><bufferAttribute attach="attributes-position" args={[specks, 3]} /></bufferGeometry>
      <pointsMaterial size={.085} color="#ffffff" transparent depthWrite={false} />
    </points>}
  </>
}

export default function DownhillScene({ model, effects, onGraphicsError }) {
  const { gl, camera } = useThree()
  const terrain = useSceneGeometry(makeTerrain)
  const pine = useSceneGeometry(createPineGeometry)
  const follow = useMemo(() => new Vector3(), [])
  const target = useMemo(() => new Vector3(), [])
  const sun = useRef(null)
  useEffect(() => {
    const canvas = gl.domElement
    const lost = event => { event.preventDefault(); onGraphicsError() }
    canvas.addEventListener('webglcontextlost', lost)
    return () => canvas.removeEventListener('webglcontextlost', lost)
  }, [gl, onGraphicsError])
  useFrame((state, delta) => {
    const { track, x, phase, jump } = model.current
    const small = state.size.width < 520
    const flightHeight = jump?.height || 0
    const finalFlight = jump?.crest.final
    const behind = track - (small ? 7.7 : 9.9) - (finalFlight ? Math.min(2.6, flightHeight * .4) : 0)
    const look = track + (small ? 18 : 22)
    const centre = downhillCentre(track)
    const height = downhillSurface(track, x)
    const cameraLift = flightHeight * (finalFlight ? .68 : .34)
    follow.set(centre + x * .64, Math.max(height + 5.65 + cameraLift, downhillSurface(behind, 0) + 1.8), -behind)
    if (!effects || phase === 'ready' || phase === 'countdown') camera.position.copy(follow)
    else camera.position.lerp(follow, 1 - Math.exp(-Math.min(delta, .1) * 14))
    const viewDepth = camera.position.z + look
    const skierDepth = camera.position.z + track
    const throughSkier = camera.position.x + (centre + x - camera.position.x) * viewDepth / skierDepth
    const curveTarget = centre * .3 + downhillCentre(look) * .7 + x * .23
    const sideLead = viewDepth * Math.tan(camera.fov * Math.PI / 360) * camera.aspect * .56
    // Follow the bend without letting the skier leave the frame on a narrow screen.
    const aimX = throughSkier + sideLead * Math.tanh((curveTarget - throughSkier) / sideLead)
    target.set(aimX, downhillSurface(look, 0) * .67 + height * .33 + .65 + cameraLift, -look)
    camera.lookAt(target)
    sun.current.position.set(centre + 87, height + 35, -track - 182)
  })
  return <>
    <fog attach="fog" args={['#b9d6e5', 52, 245]} />
    <hemisphereLight args={['#e9f8ff', '#7899a9', 2.15]} />
    <directionalLight position={[55, 55, -26]} color="#ffe2b7" intensity={2.45} />
    <mesh ref={sun}><sphereGeometry args={[12, 22, 13]} /><meshBasicMaterial color="#fff0bd" fog={false} /></mesh>
    <mesh geometry={terrain}><meshStandardMaterial vertexColors roughness={.93} /></mesh>
    <Peaks />
    {Array.from({ length: Math.ceil(DOWNHILL_LENGTH / 204) }, (_, index) => <ForestTile geometry={pine} start={-6 + index * 204} key={index} />)}
    <Lift model={model} start={-20} end={520} x={39} />
    <Lift model={model} start={540} end={DOWNHILL_LENGTH + 30} x={-63} />
    <Arch model={model} />
    <Arch model={model} finish />
    <Gates model={model} />
    {DOWNHILL_CRESTS.map(crest => <GroundMark key={crest.distance} distance={crest.distance}
      width={H * 1.7} depth={crest.final ? 1 : .35} color="#f1c36f" />)}
    {Array.from({ length: 12 }, (_, index) => <GroundMark key={index} distance={DOWNHILL_LENGTH - .45 + (index % 2) * .76}
      x={(index - 5.5) * H / 6} width={H / 6} depth={.76} color="#317e94" />)}
    <Skier model={model} effects={effects} />
  </>
}
