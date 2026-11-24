import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { BufferAttribute, BufferGeometry, Color, Matrix4, Vector3 } from 'three'
import { createPineGeometry } from './winter-pine.js'
import { SKI_K_POINT, SKI_LIP, skiGrade, skiHillHeight, skiRampHeight } from './ski-jump-engine.js'

const noise = seed => {
  const wave = Math.sin(seed * 87.719 + 4.7) * 43758.5453
  return wave - Math.floor(wave)
}
const landingColors = [
  [-145, -25, '#b1c8d7'], [-25, -11, '#d4e7ee'], [-11, -9, '#a7cdd6'],
  [-9, 9, '#f4fbff'], [9, 11, '#a7cdd6'], [11, 25, '#d4e7ee'], [25, 145, '#b1c8d7'],
]
const rampColors = [
  [-3.95, -3.7, '#27485d'], [-3.7, -2.2, '#6b9caf'], [-2.2, -.62, '#e5f8fd'], [-.62, -.42, '#b9d8e1'],
  [-.42, .42, '#f9ffff'], [.42, .62, '#b9d8e1'], [.62, 2.2, '#e5f8fd'], [2.2, 3.7, '#6b9caf'], [3.7, 3.95, '#27485d'],
]

function ribbon(start, end, step, bands, heightAt) {
  const vertices = [], colors = []
  const point = (x, distance, color) => {
    vertices.push(x, heightAt(distance, x), -distance)
    colors.push(color.r, color.g, color.b)
  }
  const tints = bands.map(([, , shade]) => new Color(shade))
  for (let distance = start; distance < end; distance += step) {
    const next = Math.min(distance + step, end)
    bands.forEach(([left, right], index) => {
      const color = tints[index]
      point(left, distance, color)
      point(right, distance, color)
      point(left, next, color)
      point(right, distance, color)
      point(right, next, color)
      point(left, next, color)
    })
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(vertices), 3))
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3))
  geometry.computeVertexNormals()
  return geometry
}

function useGeometry(factory) {
  const geometry = useMemo(factory, [])
  useEffect(() => () => geometry.dispose(), [geometry])
  return geometry
}

function Terrain() {
  const hill = useGeometry(() => ribbon(-22, 340, 2, landingColors, (distance, x) => {
    const shoulder = Math.max(0, Math.abs(x) - 10)
    return skiHillHeight(distance) + Math.min(shoulder * .065, 5) * Math.sin(distance * .041 + x * .12)
  }))
  const ramp = useGeometry(() => ribbon(-12, SKI_LIP, 1.4, rampColors, (distance, x) => skiRampHeight(distance) - (Math.abs(x) > 3.7 ? .73 : 0)))
  const markers = useGeometry(() => ribbon(-12, SKI_LIP, 1.4, [[-3.76, -3.62, '#f7be75'], [3.62, 3.76, '#f7be75']], s => skiRampHeight(s) + .08))
  return <>
    <mesh geometry={hill}><meshStandardMaterial vertexColors roughness={.95} /></mesh>
    <mesh geometry={ramp}><meshStandardMaterial vertexColors roughness={.84} /></mesh>
    <mesh geometry={markers}><meshBasicMaterial vertexColors /></mesh>
    <mesh position={[0, skiRampHeight(SKI_LIP) - .07, -SKI_LIP]}>
      <boxGeometry args={[7.4, .2, .65]} /><meshBasicMaterial color="#7ceac1" />
    </mesh>
    {[50, SKI_K_POINT, 125].map(distance => {
      const s = SKI_LIP + distance
      return <mesh key={distance} position={[0, skiHillHeight(s) + .055, -s]} rotation={[Math.atan(skiGrade(skiHillHeight, s)) - Math.PI / 2, 0, 0]}>
        <planeGeometry args={[18, distance === SKI_K_POINT ? .44 : .16]} />
        <meshBasicMaterial color={distance === SKI_K_POINT ? '#eb6f63' : '#61a9bb'} />
      </mesh>
    })}
    {[8, 23, 38, 53, 68].map(s => <group key={s} position={[0, skiRampHeight(s), -s]}>
      <mesh position={[0, -1.72, 0]}><boxGeometry args={[7.4, 2.2, 1.15]} /><meshStandardMaterial color="#35566c" /></mesh>
      {[-2.8, 2.8].map(x => <mesh key={x} position={[x, -4.6, 0]}><boxGeometry args={[.28, 7, .28]} /><meshStandardMaterial color="#37596b" /></mesh>)}
    </group>)}
    {[SKI_LIP - 1, SKI_LIP + SKI_K_POINT].map((s, index) => [-1, 1].map(side => {
      const height = index === 0 ? skiRampHeight(s) : skiHillHeight(s)
      return <group key={`${s}-${side}`} position={[side * (index === 0 ? 4 : 9.2), height, -s]}>
        <mesh position={[0, 1.4, 0]}><cylinderGeometry args={[.06, .085, 2.8, 6]} /><meshStandardMaterial color="#28596a" /></mesh>
        <mesh position={[side * .57, 2.25, 0]}><boxGeometry args={[1.14, .64, .08]} /><meshStandardMaterial color={index === 0 ? '#24b68e' : '#f57466'} /></mesh>
      </group>
    }))}
  </>
}

function Forest() {
  const ref = useRef(null)
  const geometry = useGeometry(createPineGeometry)
  useLayoutEffect(() => {
    const transform = new Matrix4()
    for (let i = 0; i < 160; i++) {
      const side = i % 2 ? 1 : -1
      const distance = -9 + Math.floor(i / 4) * 7.4 + noise(i) * 6
      const x = side * (13 + Math.floor(i % 4 / 2) * 19 + noise(i + 420) * 16)
      const size = 1.05 + noise(i + 275) * 2.65
      const elevation = Math.min(Math.max(Math.abs(x) - 10, 0) * .065, 5) * Math.sin(distance * .041 + x * .12)
      transform.makeScale(size, size, size)
      transform.setPosition(x, skiHillHeight(distance) + elevation, -distance)
      ref.current.setMatrixAt(i, transform)
    }
    ref.current.instanceMatrix.needsUpdate = true
    ref.current.computeBoundingSphere()
  }, [])
  return <instancedMesh ref={ref} args={[geometry, undefined, 160]}>
    <meshStandardMaterial vertexColors roughness={1} />
  </instancedMesh>
}

function Peaks() {
  return <>
    {Array.from({ length: 13 }, (_, index) => {
      const x = (index - 6) * 47 + (noise(index) - .5) * 28
      const height = 51 + noise(index + 42) * 84
      const width = 53 + noise(index + 41) * 46
      const depth = -278 - Math.abs(index - 6) * 5 - noise(index + 18) * 52
      return <group key={index} position={[x, -83, depth]} rotation={[0, index * .67, 0]}>
        <mesh position={[0, height / 2, 0]}>
          <coneGeometry args={[width, height, 5]} /><meshStandardMaterial color={index % 2 ? '#86a2bf' : '#9eb7ce'} flatShading />
        </mesh>
        <mesh position={[0, height * .81 + .4, 0]}>
          <coneGeometry args={[width * .383, height * .39, 5]} /><meshStandardMaterial color="#e8f4fb" flatShading />
        </mesh>
      </group>
    })}
    <mesh position={[75, 41, -301]}>
      <sphereGeometry args={[13, 24, 16]} /><meshBasicMaterial color="#fff0cc" fog={false} />
    </mesh>
  </>
}

function Skier({ model, effects }) {
  const root = useRef(null), body = useRef(null), leftSki = useRef(null), rightSki = useRef(null), shadow = useRef(null)
  useFrame(() => {
    const { distance, height, pitch, phase, elapsed, landing, result } = model.current
    const flying = phase === 'air'
    root.current.position.set(0, height + .14, -distance)
    root.current.rotation.x = pitch
    body.current.rotation.x = flying && !landing?.quality ? -.96 : phase === 'approach' ? -.67 : phase === 'runout' && !result?.score ? -1.26 : -.13
    const spread = flying && !landing?.quality ? .28 : .025
    leftSki.current.rotation.y = spread
    rightSki.current.rotation.y = -spread
    const telemark = phase === 'runout' && result.style >= 90 && result.score ? Math.max(0, .43 - elapsed * .38) : 0
    leftSki.current.position.z = telemark
    rightSki.current.position.z = -telemark
    const surface = distance < SKI_LIP ? skiRampHeight : skiHillHeight
    const ground = surface(distance)
    shadow.current.position.set(0, ground + .065, -distance)
    shadow.current.rotation.x = Math.atan(skiGrade(surface, distance)) - Math.PI / 2
    shadow.current.material.opacity = effects ? .2 / (1 + Math.max(0, height - ground) * .085) : .16
  })
  return <>
    <mesh ref={shadow} rotation={[-Math.PI / 2, 0, 0]} scale={[.7, 1.35, 1]}>
      <circleGeometry args={[1, 20]} /><meshBasicMaterial color="#1b4c61" transparent depthWrite={false} />
    </mesh>
    <group ref={root}>
      {[[-.27, leftSki], [.27, rightSki]].map(([x, ref]) => <group ref={ref} position={[x, 0, 0]} key={x}>
        <mesh><boxGeometry args={[.16, .08, 2.88]} /><meshStandardMaterial color="#152f44" /></mesh>
        <mesh position={[0, .06, -.18]}><boxGeometry args={[.145, .05, 2.58]} /><meshStandardMaterial color="#ff7968" /></mesh>
        <mesh position={[0, .092, -1.02]}><boxGeometry args={[.148, .018, .34]} /><meshStandardMaterial color="#f4faf5" /></mesh>
        <mesh position={[0, .19, .13]}><boxGeometry args={[.22, .25, .46]} /><meshStandardMaterial color="#192f44" /></mesh>
      </group>)}
      <group ref={body} position={[0, .78, .19]}>
        {[-.235, .235].map(x => <group key={x} position={[x, -.04, 0]}>
          <mesh position={[0, -.31, 0]} rotation={[-.33, 0, 0]}><capsuleGeometry args={[.132, .57, 3, 7]} /><meshStandardMaterial color="#254558" /></mesh>
          <mesh position={[x * .85, .3, .09]} rotation={[.38, 0, x]}><capsuleGeometry args={[.124, .61, 3, 7]} /><meshStandardMaterial color="#41aeb0" /></mesh>
        </group>)}
        <mesh position={[0, .45, 0]} scale={[1.15, 1, .84]}><capsuleGeometry args={[.3, .43, 4, 10]} /><meshStandardMaterial color="#249596" /></mesh>
        <mesh position={[0, .49, .235]}><boxGeometry args={[.49, .38, .07]} /><meshStandardMaterial color="#e8faf5" /></mesh>
        <mesh position={[0, 1.08, -.04]}><sphereGeometry args={[.28, 14, 10]} /><meshStandardMaterial color="#f2ce77" /></mesh>
        <mesh position={[0, 1.06, -.27]}><boxGeometry args={[.46, .12, .11]} /><meshStandardMaterial color="#173b52" metalness={.15} /></mesh>
      </group>
    </group>
  </>
}

function Snowfall({ model }) {
  const ref = useRef(null)
  const positions = useMemo(() => {
    const values = new Float32Array(153 * 3)
    for (let i = 0; i < 153; i++) values.set([(noise(i * 3) - .5) * 43, noise(i * 3 + 1) * 15, -noise(i * 3 + 2) * 62], i * 3)
    return values
  }, [])
  useFrame(({ clock }) => {
    ref.current.position.set(Math.sin(clock.elapsedTime * .31) * 2, model.current.height - 2, -model.current.distance + 10)
  })
  return <points ref={ref}>
    <bufferGeometry><bufferAttribute attach="attributes-position" args={[positions, 3]} /></bufferGeometry>
    <pointsMaterial color="#fff" size={.10} opacity={.74} transparent depthWrite={false} />
  </points>
}

export default function SkiJumpScene({ model, effects, onGraphicsError }) {
  const { gl, camera } = useThree()
  const follow = useMemo(() => new Vector3(), [])
  const target = useMemo(() => new Vector3(), [])
  useEffect(() => {
    const canvas = gl.domElement
    const lost = event => { event.preventDefault(); onGraphicsError() }
    canvas.addEventListener('webglcontextlost', lost)
    return () => canvas.removeEventListener('webglcontextlost', lost)
  }, [gl, onGraphicsError])
  useFrame((state, delta) => {
    const { distance, height, phase } = model.current
    const air = phase === 'air'
    const landing = phase === 'runout' || phase === 'finished'
    const mobile = state.size.width < 540
    const x = air ? (mobile ? 3 : 6.8) : landing ? 4.2 : 1.1
    const behind = mobile ? 7.4 : 8.6
    const inrun = distance - behind < SKI_LIP
    const terrain = (inrun ? skiRampHeight : skiHillHeight)(distance - behind)
    const altitude = Math.max(height + (air ? 3.2 : 3.6), terrain + 1.35)
    follow.set(x, altitude, -distance + behind)
    if (phase === 'ready' || !effects) camera.position.copy(follow)
    else {
      camera.position.lerp(follow, 1 - Math.exp(-Math.min(delta, .1) * 11))
      camera.position.y = Math.max(camera.position.y, terrain + 1.35)
    }
    target.set(0, height - (inrun && !air ? 4.6 : 4.3), -distance - (air ? 12 : 16))
    camera.lookAt(target)
  })
  return <>
    <fog attach="fog" args={['#d6dce4', 122, 405]} />
    <hemisphereLight args={['#deefff', '#627b93', 2.05]} />
    <directionalLight color="#ffdfbc" position={[44, 60, -35]} intensity={2.6} />
    <Peaks />
    <Terrain />
    <Forest />
    <Skier model={model} effects={effects} />
    {effects && <Snowfall model={model} />}
  </>
}
