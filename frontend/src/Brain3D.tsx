import { useEffect, useRef } from 'react'
import * as THREE from 'three'

export default function Brain3D({ size = 140 }: { size?: number }) {
  const mountRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
    camera.position.z = 4.2

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(size, size)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    mount.appendChild(renderer.domElement)

    const group = new THREE.Group()

    // Два полушария — сферы, слегка сплюснутые и раздвинутые
    const lobeGeo = new THREE.SphereGeometry(1.15, 24, 20)
    const material = new THREE.MeshStandardMaterial({
      color: 0x4d4dff, emissive: 0x2a2aff, emissiveIntensity: 0.55,
      roughness: 0.35, metalness: 0.15, transparent: true, opacity: 0.92,
    })
    const left = new THREE.Mesh(lobeGeo, material)
    left.position.set(-0.55, 0, 0)
    left.scale.set(0.95, 1, 1.05)
    const right = new THREE.Mesh(lobeGeo, material)
    right.position.set(0.55, 0, 0)
    right.scale.set(0.95, 1, 1.05)
    group.add(left, right)

    // Неоновые "борозды" — проволочная сетка поверх, светлее основного цвета
    const wireGeo = new THREE.SphereGeometry(1.17, 12, 10)
    const wireMat = new THREE.MeshBasicMaterial({ color: 0x9d9dff, wireframe: true, transparent: true, opacity: 0.35 })
    const leftWire = new THREE.Mesh(wireGeo, wireMat)
    leftWire.position.copy(left.position); leftWire.scale.copy(left.scale)
    const rightWire = new THREE.Mesh(wireGeo, wireMat)
    rightWire.position.copy(right.position); rightWire.scale.copy(right.scale)
    group.add(leftWire, rightWire)

    scene.add(group)

    const ambient = new THREE.AmbientLight(0x8080ff, 0.6)
    scene.add(ambient)
    const point = new THREE.PointLight(0xffffff, 1.4, 20)
    point.position.set(2, 2, 3)
    scene.add(point)
    const point2 = new THREE.PointLight(0x4d4dff, 1.2, 20)
    point2.position.set(-2, -1, 2)
    scene.add(point2)

    let raf: number
    let dragging = false
    let lastX = 0
    let autoSpin = true

    const onDown = (x: number) => { dragging = true; autoSpin = false; lastX = x }
    const onMove = (x: number) => { if (!dragging) return; group.rotation.y += (x - lastX) * 0.01; lastX = x }
    const onUp = () => { dragging = false }

    const pd = (e: PointerEvent) => onDown(e.clientX)
    const pm = (e: PointerEvent) => onMove(e.clientX)
    const pu = () => onUp()
    renderer.domElement.style.cursor = 'grab'
    renderer.domElement.addEventListener('pointerdown', pd)
    window.addEventListener('pointermove', pm)
    window.addEventListener('pointerup', pu)

    const animate = () => {
      raf = requestAnimationFrame(animate)
      if (autoSpin) group.rotation.y += 0.006
      renderer.render(scene, camera)
    }
    animate()

    return () => {
      cancelAnimationFrame(raf)
      renderer.domElement.removeEventListener('pointerdown', pd)
      window.removeEventListener('pointermove', pm)
      window.removeEventListener('pointerup', pu)
      renderer.dispose()
      mount.removeChild(renderer.domElement)
    }
  }, [size])

  return <div ref={mountRef} style={{ width: size, height: size, margin: '0 auto', touchAction: 'none' }} />
}