import * as THREE from "three";

export function dShapeGeometry(
  width: number,
  height: number,
  depth: number,
  bevel: number,
  br: number
): THREE.BufferGeometry {
  const shape = new THREE.Shape();

  const w2 = width / 2;
  const h2 = height / 2;
  const iw = width * 0.34;
  const ih = height * 0.52;

  const r = Math.min(width, height) * br;

  shape.moveTo(-w2 + r, -h2);
  shape.lineTo(iw - r, -h2);
  shape.quadraticCurveTo(iw, -h2, iw, -h2 + r);
  shape.lineTo(iw, -ih + r);
  shape.quadraticCurveTo(iw, -ih, iw - r, -ih);
  shape.lineTo(r, -ih);
  shape.quadraticCurveTo(0, -ih, 0, -ih + r);
  shape.lineTo(0, ih - r);
  shape.quadraticCurveTo(0, ih, r, ih);
  shape.lineTo(iw - r, ih);
  shape.quadraticCurveTo(iw, ih, iw, ih - r);
  shape.lineTo(iw, h2 - r);
  shape.quadraticCurveTo(iw, h2, iw - r, h2);
  shape.lineTo(-w2 + r, h2);
  shape.quadraticCurveTo(-w2, h2, -w2, h2 - r);
  shape.lineTo(-w2, ih - r);
  shape.quadraticCurveTo(-w2, ih, -w2 + r, ih);
  shape.lineTo(-r, ih);
  shape.quadraticCurveTo(0, ih, 0, ih - r);
  shape.lineTo(0, -ih + r);
  shape.quadraticCurveTo(0, -ih, -r, -ih);
  shape.lineTo(iw - r, -ih);
  shape.quadraticCurveTo(iw, -ih, iw, -ih + r);
  shape.lineTo(iw, -h2 + r);
  shape.quadraticCurveTo(iw, -h2, iw - r, -h2);
  shape.lineTo(-w2 + r, -h2);
  shape.quadraticCurveTo(-w2, -h2, -w2, -h2 + r);
  shape.lineTo(-w2, h2 - r);
  shape.quadraticCurveTo(-w2, h2, -w2 + r, h2);
  shape.lineTo(w2 - r, h2);
  shape.quadraticCurveTo(w2, h2, w2, h2 - r);
  shape.lineTo(w2, -h2 + r);
  shape.quadraticCurveTo(w2, -h2, w2 - r, -h2);
  shape.lineTo(w2 - r, ih);
  shape.quadraticCurveTo(w2, ih, w2, ih - r);

  const extrudeSettings: THREE.ExtrudeGeometryOptions = {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel * 0.6,
    bevelSegments: 10,
  };

  const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  geo.computeVertexNormals();
  return geo;
}
