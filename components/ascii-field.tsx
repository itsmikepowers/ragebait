"use client";

import { useEffect, useRef } from "react";

/**
 * Full-bleed animated ASCII field.
 *
 * PERFORMANCE — the reason this is one canvas and not 8,000 DOM nodes:
 * a full-screen grid at this density is ~8k cells, and one fillText per cell
 * per frame drops well under 60fps. Instead we quantize each cell's intensity
 * into a small number of grey levels, then draw ONE string per (row, level)
 * with spaces standing in for every cell that belongs to another level. A
 * monospace font advances every glyph — including the space — by exactly the
 * same width, so the spaces hold position and the characters land on the grid.
 * That turns ~8,000 draw calls per frame into rows × levels (~300), which is
 * what makes this smooth on a laptop.
 *
 * The pattern itself is a domain-warped sine field: two cheap wave layers whose
 * output distorts the coordinates fed to a third. That's what keeps it from
 * reading as an obvious repeating grid — the warp makes the interference drift
 * and fold instead of scrolling.
 */

/** Light-to-dense ramp. Index 0 is blank, so low intensity costs nothing. */
const RAMP = " .·:-=+*#%@";
/** Grey levels, lightest first. Deliberately pale — this is texture, not text. */
const LEVELS = [
  "rgba(0,0,0,0.05)",
  "rgba(0,0,0,0.08)",
  "rgba(0,0,0,0.12)",
  "rgba(0,0,0,0.17)",
  "rgba(0,0,0,0.23)",
  "rgba(0,0,0,0.30)",
];

const FONT_PX = 15;
const LINE_H = 15;

export function AsciiField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Mouse in CSS pixels; -1 means "no pointer yet", so we skip the ripple math.
  const pointer = useRef({ x: -1, y: -1 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

    let cols = 0;
    let rows = 0;
    let cellW = 0;
    let width = 0;
    let height = 0;
    let raf = 0;

    function setFont() {
      ctx!.font = `${FONT_PX}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
      ctx!.textBaseline = "top";
    }

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas!.width = Math.floor(width * dpr);
      canvas!.height = Math.floor(height * dpr);
      canvas!.style.width = `${width}px`;
      canvas!.style.height = `${height}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      setFont();
      cellW = ctx!.measureText("M").width || FONT_PX * 0.6;
      cols = Math.ceil(width / cellW) + 1;
      rows = Math.ceil(height / LINE_H) + 1;
    }

    // Reused across frames so a steady animation allocates nothing.
    let buffers: string[][] = [];
    function ensureBuffers() {
      if (buffers.length !== LEVELS.length) {
        buffers = LEVELS.map(() => []);
      }
    }

    function draw(timeMs: number) {
      const t = timeMs * 0.001;
      ctx!.clearRect(0, 0, width, height);
      ensureBuffers();

      const cx = cols * 0.5;
      const cy = rows * 0.5;
      // Elliptical clearing so the headline sits on quiet space. Width tracks
      // the viewport (wide screens need a much wider hole to clear the
      // wordmark), height stays tight so the field still fills top and bottom.
      const holeRX = Math.min(cols * 0.46, Math.max(cols * 0.3, 30));
      const holeRY = rows * 0.34;

      const px = pointer.current.x >= 0 ? pointer.current.x / cellW : -999;
      const py = pointer.current.y >= 0 ? pointer.current.y / LINE_H : -999;

      for (let y = 0; y < rows; y++) {
        for (const buf of buffers) buf.length = 0;

        for (let x = 0; x < cols; x++) {
          // --- domain warp: two layers distort the coordinates of the third ---
          const w1 = Math.sin(x * 0.055 + t * 0.55) + Math.cos(y * 0.075 - t * 0.4);
          const w2 = Math.sin((x + y) * 0.035 - t * 0.32);
          let v =
            Math.sin(x * 0.045 + w1 * 1.15 + t * 0.28) *
            Math.cos(y * 0.062 - w1 * 0.85 - t * 0.22) *
            0.65;
          v += Math.sin(x * 0.021 - y * 0.028 + w2 * 1.6 + t * 0.18) * 0.35;

          // --- pointer ripple: a travelling ring, not a blob ---
          if (px > -900) {
            const dx = x - px;
            const dy = (y - py) * 1.35; // cells are taller than wide
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < 34) {
              v += Math.sin(d * 0.45 - t * 3.4) * (1 - d / 34) * 0.85;
            }
          }

          // Normalize to 0..1, then carve out the centre.
          // The clearing is an ELLIPSE, not a circle: the headline is far wider
          // than it is tall, so a circular falloff left dense glyphs running
          // into the wordmark's edges on wide screens.
          let n = (v + 1) * 0.5;
          const rx = (x - cx) / holeRX;
          const ry = (y - cy) / holeRY;
          const dist = Math.sqrt(rx * rx + ry * ry);
          if (dist < 1) {
            n *= Math.pow(dist, 2.4);
          }

          const rampIdx = Math.max(
            0,
            Math.min(RAMP.length - 1, Math.round(n * (RAMP.length - 1))),
          );
          const ch = RAMP[rampIdx];

          // Push the glyph into its level's row-string; a space everywhere else
          // keeps every other level's spacing intact.
          const level =
            rampIdx === 0
              ? -1
              : Math.min(
                  LEVELS.length - 1,
                  Math.floor(((rampIdx - 1) / (RAMP.length - 1)) * LEVELS.length),
                );
          for (let l = 0; l < LEVELS.length; l++) {
            buffers[l].push(l === level ? ch : " ");
          }
        }

        const ypx = y * LINE_H;
        for (let l = 0; l < LEVELS.length; l++) {
          const line = buffers[l].join("").trimEnd();
          if (!line) continue;
          ctx!.fillStyle = LEVELS[l];
          ctx!.fillText(line, 0, ypx);
        }
      }
    }

    let last = 0;
    function loop(now: number) {
      // ~48fps. Measured draw cost is 3.5-9.6ms depending on viewport, so this
      // leaves headroom on the widest screens while staying smooth; uncapped
      // rAF would just burn battery redrawing a texture nobody perceives at
      // 120Hz.
      if (now - last > 20) {
        draw(now);
        last = now;
      }
      raf = requestAnimationFrame(loop);
    }

    function onPointer(event: PointerEvent) {
      pointer.current.x = event.clientX;
      pointer.current.y = event.clientY;
    }
    function onLeave() {
      pointer.current.x = -1;
      pointer.current.y = -1;
    }

    function start() {
      cancelAnimationFrame(raf);
      if (reduced.matches) {
        draw(0); // One static frame — the texture still reads, nothing moves.
        return;
      }
      raf = requestAnimationFrame(loop);
    }

    resize();
    start();

    const onResize = () => {
      resize();
      start();
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("pointermove", onPointer);
    window.addEventListener("pointerleave", onLeave);
    reduced.addEventListener("change", start);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("pointerleave", onLeave);
      reduced.removeEventListener("change", start);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 h-full w-full select-none"
    />
  );
}
