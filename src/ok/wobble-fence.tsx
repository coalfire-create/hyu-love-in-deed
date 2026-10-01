"use client"

import * as React from "react"
import { useEffect, useRef } from "react"
import * as THREE from "three"

const POLISHED_METAL_MATCAP =
    "https://framerusercontent.com/images/Wkm2ineJ1Md7Xb1oyjF6dqbAw.png"

const MARGIN_CELLS = 3

const MAX_SEGMENTS = 8000

const UP = new THREE.Vector3(0, 1, 0)

const COS45 = Math.SQRT1_2
const SIN45 = Math.SQRT1_2

const WEAVE_RADII = 0.6

const DEFAULTS = {
    finish: "metal",
    tint: "#D8D8D8",
    color: "#FF9F1C",
    spacing: 45,
    thickness: 3,
    speed: 15,
    pointerLift: 20,
}

type Config = {
    finish: "metal" | "solid"
    tint: string
    color: string
    spacing: number
    thickness: number
    speed: number
    pointerLift: number
}

function clamp(v: number, lo: number, hi: number, fallback: number): number {
    const n = typeof v === "number" && isFinite(v) ? v : fallback
    return Math.max(lo, Math.min(hi, n))
}

function pitch(cfg: Config): number {
    return clamp(cfg.spacing, 12, 160, DEFAULTS.spacing)
}

function wireRadius(cfg: Config): number {
    const p = pitch(cfg)
    const t = clamp(cfg.thickness, 1, 20, DEFAULTS.thickness)
    return Math.min(p * 0.3, 0.9 + t * 0.75)
}

let matcapTexture: THREE.Texture | null = null
let matcapPending: Promise<THREE.Texture | null> | null = null

function loadMatcap(): Promise<THREE.Texture | null> {
    if (matcapTexture) return Promise.resolve(matcapTexture)
    if (matcapPending) return matcapPending
    matcapPending = new Promise((resolve) => {
        const loader = new THREE.TextureLoader()
        loader.setCrossOrigin("anonymous")
        loader.load(
            POLISHED_METAL_MATCAP,
            (texture) => {
                texture.colorSpace = THREE.SRGBColorSpace
                matcapTexture = texture
                resolve(texture)
            },
            undefined,
            () => resolve(null)
        )
    })
    return matcapPending
}

type Segment = {
    ax: number
    ay: number
    bx: number
    by: number

    sa: number
    sb: number
}

type Joint = {
    x: number
    y: number
    s: number
}

class MeshScene {
    private container: HTMLElement
    private cfg: Config

    private renderer: THREE.WebGLRenderer
    private scene = new THREE.Scene()
    private camera = new THREE.PerspectiveCamera(45, 1, 1, 20000)
    private ambient = new THREE.AmbientLight(0xffffff, 0.65)
    private key = new THREE.DirectionalLight(0xffffff, 0.9)

    private matcapMaterial: THREE.MeshMatcapMaterial
    private solidMaterial: THREE.MeshLambertMaterial
    private geometry: THREE.CylinderGeometry | null = null
    private mesh: THREE.InstancedMesh | null = null
    private segments: Segment[] = []
    private jointGeometry: THREE.SphereGeometry | null = null
    private jointMesh: THREE.InstancedMesh | null = null
    private joints: Joint[] = []

    private dummy = new THREE.Object3D()
    private dir = new THREE.Vector3()

    private elapsed = 0

    private pointerX = 0
    private pointerY = 0
    private hovered = false

    private hover = 0

    private width = 0
    private height = 0
    private builtFor = ""
    private frameId = 0
    private lastT = 0
    private disposed = false

    constructor(container: HTMLElement, cfg: Config) {
        this.container = container
        this.cfg = cfg

        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true,
        })
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
        this.renderer.outputColorSpace = THREE.SRGBColorSpace
        this.renderer.setClearAlpha(0)
        const el = this.renderer.domElement
        el.style.position = "absolute"
        el.style.inset = "0"
        el.style.width = "100%"
        el.style.height = "100%"
        el.style.touchAction = "none"
        container.appendChild(el)

        this.matcapMaterial = new THREE.MeshMatcapMaterial({
            color: new THREE.Color(cfg.tint || "#ffffff"),
        })
        this.solidMaterial = new THREE.MeshLambertMaterial({
            color: new THREE.Color(cfg.color || "#ffffff"),
        })
        this.key.position.set(0.4, 0.7, 1)
        this.camera.add(this.key)
        this.scene.add(this.ambient, this.camera)

        this.bindEvents()
        if (cfg.finish === "metal") this.ensureMatcap()
    }

    private ensureMatcap() {
        if (this.matcapMaterial.matcap) return
        loadMatcap().then((t) => {
            if (this.disposed || !t) return
            this.matcapMaterial.matcap = t
            this.matcapMaterial.needsUpdate = true
        })
    }

    private material() {
        return this.cfg.finish === "metal"
            ? this.matcapMaterial
            : this.solidMaterial
    }

    private build() {
        this.clear()
        if (this.width <= 0 || this.height <= 0) return

        const p = pitch(this.cfg)
        const margin = p * MARGIN_CELLS
        const halfW = this.width / 2 + margin
        const halfH = this.height / 2 + margin

        const limit =
            Math.ceil(
                (halfW / (p * COS45) + halfH / (p * SIN45)) / 2
            ) + 2

        const nodeX = (u: number, v: number) => (u + v) * COS45 * p
        const nodeY = (u: number, v: number) => (u - v) * SIN45 * p

        const sign = (u: number, v: number) => (((u + v) % 2) + 2) % 2 || -1

        const segments: Segment[] = []
        const joints: Joint[] = []

        const push = (
            u0: number,
            v0: number,
            u1: number,
            v1: number,
            family: number
        ) => {
            if (segments.length >= MAX_SEGMENTS) return
            const ax = nodeX(u0, v0)
            const ay = nodeY(u0, v0)
            const bx = nodeX(u1, v1)
            const by = nodeY(u1, v1)
            const inside =
                (Math.abs(ax) <= halfW && Math.abs(ay) <= halfH) ||
                (Math.abs(bx) <= halfW && Math.abs(by) <= halfH)
            if (!inside) return
            segments.push({
                ax,
                ay,
                bx,
                by,
                sa: sign(u0, v0) * family,
                sb: sign(u1, v1) * family,
            })
        }

        for (let u = -limit; u <= limit; u++) {
            for (let v = -limit; v <= limit; v++) {
                push(u, v, u + 1, v, 1)
                push(u, v, u, v + 1, -1)

                if (joints.length >= MAX_SEGMENTS) continue
                const x = nodeX(u, v)
                const y = nodeY(u, v)
                if (Math.abs(x) > halfW || Math.abs(y) > halfH) continue

                const s = sign(u, v)
                joints.push({ x, y, s })
                joints.push({ x, y, s: -s })
            }
        }
        this.segments = segments
        this.joints = joints

        const r = wireRadius(this.cfg)

        this.geometry = new THREE.CylinderGeometry(r, r, 1, 10, 1)

        this.jointGeometry = new THREE.SphereGeometry(r, 12, 8)

        const mesh = new THREE.InstancedMesh(
            this.geometry,
            this.material(),
            segments.length
        )
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
        mesh.frustumCulled = false
        this.mesh = mesh
        this.scene.add(mesh)

        const jointMesh = new THREE.InstancedMesh(
            this.jointGeometry,
            this.material(),
            joints.length
        )
        jointMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
        jointMesh.frustumCulled = false
        this.jointMesh = jointMesh
        this.scene.add(jointMesh)

        this.builtFor = this.signature()
        this.writeMatrices()
    }

    private signature(): string {
        return [
            Math.round(this.width),
            Math.round(this.height),
            pitch(this.cfg),
            clamp(this.cfg.thickness, 1, 20, DEFAULTS.thickness),
        ].join("|")
    }

    private clear() {
        if (this.mesh) {
            this.mesh.removeFromParent()
            this.mesh.dispose()
            this.mesh = null
        }
        if (this.jointMesh) {
            this.jointMesh.removeFromParent()
            this.jointMesh.dispose()
            this.jointMesh = null
        }
        this.geometry?.dispose()
        this.geometry = null
        this.jointGeometry?.dispose()
        this.jointGeometry = null
        this.segments = []
        this.joints = []
        this.builtFor = ""
    }

    private bindEvents() {
        const el = this.renderer.domElement
        const move = (e: PointerEvent) => {
            const rect = el.getBoundingClientRect()
            if (rect.width <= 0 || rect.height <= 0) return

            this.pointerX = e.clientX - rect.left - rect.width / 2
            this.pointerY = rect.height / 2 - (e.clientY - rect.top)
            this.hovered = true
        }
        const leave = () => {
            this.hovered = false
        }

        window.addEventListener("pointermove", move)
        el.addEventListener("pointerleave", leave)
        this.unbind = () => {
            window.removeEventListener("pointermove", move)
            el.removeEventListener("pointerleave", leave)
        }
    }

    private unbind = () => {}

    start() {
        this.lastT = performance.now()
        const loop = () => {
            this.frameId = requestAnimationFrame(loop)
            this.step()
        }
        loop()
    }

    setSize(width: number, height: number) {
        if (this.disposed || width <= 0 || height <= 0) return
        this.width = width
        this.height = height
        this.renderer.setSize(width, height, false)
        this.updateCamera()
        if (this.signature() !== this.builtFor) this.build()
    }

    updateConfig(cfg: Config) {
        if (this.disposed) return
        const prev = this.cfg
        this.cfg = cfg
        if (cfg.finish === "metal") this.ensureMatcap()
        this.matcapMaterial.color.set(cfg.tint || "#ffffff")
        this.solidMaterial.color.set(cfg.color || "#ffffff")

        if (this.signature() !== this.builtFor) {
            this.build()
        } else if (cfg.finish !== prev.finish) {
            const material = this.material()
            if (this.mesh) this.mesh.material = material
            if (this.jointMesh) this.jointMesh.material = material
        }
    }

    private updateCamera() {
        const w = Math.max(1, this.width)
        const h = Math.max(1, this.height)
        const distance = Math.max(400, h) * 1.2
        this.camera.aspect = w / h
        this.camera.position.set(0, 0, distance)
        this.camera.lookAt(0, 0, 0)
        this.camera.fov = 2 * Math.atan(h / 2 / distance) * (180 / Math.PI)
        this.camera.near = Math.max(1, distance * 0.25)
        this.camera.far = distance + h * 2
        this.camera.updateProjectionMatrix()
    }

    private writeMatrices() {
        const mesh = this.mesh
        if (!mesh) return

        const p = pitch(this.cfg)
        const r = wireRadius(this.cfg)
        const depth = r * WEAVE_RADII
        const speed = clamp(this.cfg.speed, 0, 20, DEFAULTS.speed)

        const ripple = speed * p * 0.04
        const lift = clamp(this.cfg.pointerLift, 0, 20, DEFAULTS.pointerLift)
        const liftAmount = lift * p * 0.16
        const reach = p * 4.5
        const wk = 1 / (p * 3)
        const t = this.elapsed
        const d = this.dummy

        const endZ = (x: number, y: number, s: number) => {
            let z = s * depth
            if (ripple > 0) {
                z += Math.sin((x + y * 0.6) * wk + t) * ripple
            }
            if (this.hover > 0.001 && liftAmount > 0) {
                const dx = x - this.pointerX
                const dy = y - this.pointerY
                const dist = Math.sqrt(dx * dx + dy * dy)
                if (dist < reach) {
                    const f =
                        0.5 * (1 + Math.cos((Math.PI * dist) / reach)) *
                        this.hover
                    z += f * liftAmount
                }
            }
            return z
        }

        for (let i = 0; i < this.segments.length; i++) {
            const s = this.segments[i]
            const az = endZ(s.ax, s.ay, s.sa)
            const bz = endZ(s.bx, s.by, s.sb)

            this.dir.set(s.bx - s.ax, s.by - s.ay, bz - az)
            const len = this.dir.length() || 0.0001
            this.dir.divideScalar(len)

            d.position.set(
                (s.ax + s.bx) / 2,
                (s.ay + s.by) / 2,
                (az + bz) / 2
            )
            d.quaternion.setFromUnitVectors(UP, this.dir)

            d.scale.set(1, len + r * 2, 1)
            d.updateMatrix()
            mesh.setMatrixAt(i, d.matrix)
        }
        mesh.instanceMatrix.needsUpdate = true

        const jointMesh = this.jointMesh
        if (!jointMesh) return
        for (let i = 0; i < this.joints.length; i++) {
            const j = this.joints[i]
            d.position.set(j.x, j.y, endZ(j.x, j.y, j.s))
            d.quaternion.identity()
            d.scale.set(1, 1, 1)
            d.updateMatrix()
            jointMesh.setMatrixAt(i, d.matrix)
        }
        jointMesh.instanceMatrix.needsUpdate = true
    }

    private step() {
        if (this.disposed) return
        const now = performance.now()
        let dt = (now - this.lastT) / 1000
        this.lastT = now
        if (!isFinite(dt) || dt < 0) dt = 0
        if (dt > 0.05) dt = 0.05

        this.elapsed +=
            dt * clamp(this.cfg.speed, 0, 20, DEFAULTS.speed) * 0.2

        const want = this.hovered ? 1 : 0
        this.hover += (want - this.hover) * (1 - Math.exp(-dt * 4))

        this.writeMatrices()
        this.renderer.render(this.scene, this.camera)
    }

    dispose() {
        this.disposed = true
        cancelAnimationFrame(this.frameId)
        this.unbind()
        this.clear()
        this.matcapMaterial.dispose()
        this.solidMaterial.dispose()
        this.renderer.dispose()
        const el = this.renderer.domElement
        if (el.parentNode === this.container) this.container.removeChild(el)
    }
}

interface ChainProps {
    finish?: "metal" | "solid"
    tint?: string
    color?: string
    spacing?: number
    thickness?: number
    speed?: number
    pointerLift?: number
    style?: React.CSSProperties
}

export default function Chain(props: ChainProps) {
    const {
        finish = DEFAULTS.finish as Config["finish"],
        tint = DEFAULTS.tint,
        color = DEFAULTS.color,
        spacing = DEFAULTS.spacing,
        thickness = DEFAULTS.thickness,
        speed = DEFAULTS.speed,
        pointerLift = DEFAULTS.pointerLift,
        style,
    } = props

    const containerRef = useRef<HTMLDivElement | null>(null)
    const sceneRef = useRef<MeshScene | null>(null)

    const cfgRef = useRef<Config>(null as any)
    cfgRef.current = {
        finish,
        tint,
        color,
        spacing,
        thickness,
        speed,
        pointerLift,
    }

    useEffect(() => {
        const container = containerRef.current
        if (!container) return
        let scene: MeshScene
        try {
            scene = new MeshScene(container, cfgRef.current)
        } catch {
            return
        }
        sceneRef.current = scene
        scene.setSize(container.clientWidth, container.clientHeight)
        scene.start()

        const ro = new ResizeObserver(() => {
            scene.setSize(container.clientWidth, container.clientHeight)
        })
        ro.observe(container)
        return () => {
            ro.disconnect()
            scene.dispose()
            sceneRef.current = null
        }
    }, [])

    useEffect(() => {
        sceneRef.current?.updateConfig(cfgRef.current)
    }, [finish, tint, color, spacing, thickness, speed, pointerLift])

    return (
        <div
            ref={containerRef}
            role="img"
            aria-label="Woven steel mesh background"
            style={{
                position: "relative",
                width: "100%",
                height: "100%",
                minWidth: 120,
                minHeight: 120,
                overflow: "hidden",
                ...style,
            }}
        />
    )
}

Chain.displayName = "Chain"
Chain.defaultProps = { ...DEFAULTS }