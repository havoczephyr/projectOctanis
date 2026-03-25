import React from 'react'

interface Props {
  size?: number
  className?: string
}

/**
 * Cartoonish rubber ducky SVG — charming, vector-scalable.
 * Used in FadeGainEditor for duck mode button and duck point markers.
 */
export function RubberDucky({ size = 20, className }: Props): React.ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Body */}
      <ellipse cx="32" cy="42" rx="24" ry="18" fill="#FFD93D" />
      {/* Head */}
      <circle cx="30" cy="20" r="14" fill="#FFD93D" />
      {/* Beak */}
      <ellipse cx="44" cy="22" rx="8" ry="4.5" fill="#FF8C00" />
      {/* Eye */}
      <circle cx="27" cy="17" r="2.5" fill="#1A1A2E" />
      {/* Eye shine */}
      <circle cx="28" cy="16" r="0.8" fill="white" />
      {/* Wing */}
      <path
        d="M 20 38 Q 14 42 18 48 Q 24 46 26 40 Z"
        fill="#F0C020"
        opacity={0.7}
      />
    </svg>
  )
}

/**
 * Inline SVG paths for use inside an outer <svg> element (e.g., duck point markers).
 * Renders at `size` pixels, centered on (0, 0). Wrap in a <g transform="translate(cx, cy)">.
 */
export function duckySvgPaths(size: number): React.ReactElement {
  const scale = size / 64
  return (
    <g transform={`scale(${scale}) translate(-32, -32)`}>
      <ellipse cx="32" cy="42" rx="24" ry="18" fill="#FFD93D" />
      <circle cx="30" cy="20" r="14" fill="#FFD93D" />
      <ellipse cx="44" cy="22" rx="8" ry="4.5" fill="#FF8C00" />
      <circle cx="27" cy="17" r="2.5" fill="#1A1A2E" />
      <circle cx="28" cy="16" r="0.8" fill="white" />
      <path d="M 20 38 Q 14 42 18 48 Q 24 46 26 40 Z" fill="#F0C020" opacity={0.7} />
    </g>
  )
}
