import type { SVGProps } from "react";

interface AdrishtaLogoProps extends SVGProps<SVGSVGElement> {
  size?: number;
  showText?: boolean;
  subtitle?: string;
}

/**
 * ADRISHTA Logo Component
 * Concept: "Revealing the Unseen Subsurface Ocean"
 * Features a depth-penetrating optical aperture, layered bathymetric wave rings, and an ocean sounding beam.
 */
export function AdrishtaLogo({
  size = 36,
  showText = false,
  subtitle = "Subsurface Ocean AI",
  className = "",
  ...props
}: AdrishtaLogoProps) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 44 44"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        {...props}
        className="shrink-0 transition-transform duration-300 hover:scale-105 drop-shadow-[0_0_12px_rgba(56,189,248,0.35)]"
      >
        <defs>
          {/* Deep Ocean Radial Gradient */}
          <radialGradient id="adrishtaAbyss" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.95" />
            <stop offset="35%" stopColor="#0284c7" stopOpacity="0.8" />
            <stop offset="70%" stopColor="#0f172a" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#030712" stopOpacity="1" />
          </radialGradient>

          {/* Oceanic Cyan-Teal Stroke Gradient */}
          <linearGradient id="adrishtaEdge" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="50%" stopColor="#2dd4bf" />
            <stop offset="100%" stopColor="#0284c7" />
          </linearGradient>

          {/* Penetrating Depth Sounding Beam */}
          <linearGradient id="adrishtaBeam" x1="50%" y1="0%" x2="50%" y2="100%">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="1" />
            <stop offset="50%" stopColor="#2dd4bf" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#0369a1" stopOpacity="0.1" />
          </linearGradient>
        </defs>

        {/* Outer Geometric Hex-Shield / Depth Boundary */}
        <polygon
          points="22,2 39,11 39,33 22,42 5,33 5,11"
          fill="#030712"
          stroke="url(#adrishtaEdge)"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />

        {/* Inner Abyss Glow */}
        <circle cx="22" cy="22" r="15" fill="url(#adrishtaAbyss)" />

        {/* Bathymetric Depth Rings (0m to 1000m acoustic pulses) */}
        <circle
          cx="22"
          cy="22"
          r="12"
          stroke="#38bdf8"
          strokeWidth="0.8"
          strokeOpacity="0.7"
          strokeDasharray="3 2"
        />
        <circle
          cx="22"
          cy="22"
          r="7.5"
          stroke="#2dd4bf"
          strokeWidth="1"
          strokeOpacity="0.85"
        />

        {/* Vertical Depth Sounding Beam */}
        <polygon
          points="22,6 24.5,19 22,38 19.5,19"
          fill="url(#adrishtaBeam)"
          opacity="0.9"
        />

        {/* Horizontal Eye / Surface Wave Aperture */}
        <path
          d="M8 22 C13 15 31 15 36 22 C31 29 13 29 8 22 Z"
          stroke="#38bdf8"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Core Neural / Optical Sensor Lens */}
        <circle cx="22" cy="22" r="3.2" fill="#ffffff" />
        <circle cx="22" cy="22" r="1.6" fill="#0284c7" />
      </svg>

      {showText && (
        <div className="leading-tight select-none">
          <div className="font-display text-base font-black tracking-[0.18em] text-foreground flex items-center gap-1.5">
            ADRISHTA
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_8px_#38bdf8]" />
          </div>
          <div className="text-[10px] tracking-wider font-semibold uppercase text-cyan-400/90 font-mono">
            {subtitle}
          </div>
        </div>
      )}
    </div>
  );
}
