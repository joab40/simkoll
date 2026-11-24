import { BufferAttribute, Color, ConeGeometry, CylinderGeometry } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

export function createPineGeometry() {
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
