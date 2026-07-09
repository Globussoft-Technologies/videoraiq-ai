import { useEffect, useRef } from 'react'

const NODE_COUNT = 68
const LINK_DISTANCE = 128
const ACCENTS = ['#3b82f6', '#a855f7', '#22d3ee']

const NetworkCanvas = ({ className = '' }) => {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const dpr = Math.min(2, window.devicePixelRatio || 1)

    let width = 0
    let height = 0
    let rafId

    const rand = (min, max) => min + Math.random() * (max - min)

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      width = rect.width
      height = rect.height
      canvas.width = width * dpr
      canvas.height = height * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const nodes = Array.from({ length: NODE_COUNT }, () => ({
      x: rand(0, width || 1200),
      y: rand(0, height || 800),
      vx: rand(-0.22, 0.22),
      vy: rand(-0.22, 0.22),
      r: rand(0.8, 2.2),
      a: rand(0.35, 0.9),
    }))

    const pings = []
    let tick = 0

    const loop = () => {
      rafId = requestAnimationFrame(loop)
      tick += 1
      ctx.clearRect(0, 0, width, height)

      for (let i = 0; i < nodes.length; i += 1) {
        const p = nodes[i]
        p.x += p.vx
        p.y += p.vy
        if (p.x < 0 || p.x > width) p.vx *= -1
        if (p.y < 0 || p.y > height) p.vy *= -1

        for (let j = i + 1; j < nodes.length; j += 1) {
          const q = nodes[j]
          const dx = p.x - q.x
          const dy = p.y - q.y
          const dist = Math.hypot(dx, dy)
          if (dist < LINK_DISTANCE) {
            ctx.strokeStyle = `rgba(90,140,230,${(1 - dist / LINK_DISTANCE) * 0.14})`
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.moveTo(p.x, p.y)
            ctx.lineTo(q.x, q.y)
            ctx.stroke()
          }
        }
      }

      for (const p of nodes) {
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(150,185,255,${p.a})`
        ctx.fill()
      }

      if (tick % 70 === 0 && nodes.length) {
        const p = nodes[(Math.random() * nodes.length) | 0]
        pings.push({
          x: p.x,
          y: p.y,
          r: 2,
          max: rand(34, 64),
          color: ACCENTS[(Math.random() * ACCENTS.length) | 0],
        })
      }

      for (let i = pings.length - 1; i >= 0; i -= 1) {
        const g = pings[i]
        g.r += 0.9
        const alpha = 1 - g.r / g.max
        if (alpha <= 0) {
          pings.splice(i, 1)
          continue
        }
        const n = parseInt(g.color.slice(1), 16)
        const [r, gr, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
        ctx.strokeStyle = `rgba(${r},${gr},${b},${alpha * 0.7})`
        ctx.lineWidth = 1.4
        ctx.beginPath()
        ctx.arc(g.x, g.y, g.r, 0, Math.PI * 2)
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(g.x, g.y, 2.4, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${r},${gr},${b},${alpha})`
        ctx.fill()
      }
    }
    loop()

    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
    />
  )
}

export default NetworkCanvas
