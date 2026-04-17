import { cn } from '@/lib/utils'

type LogoProps = {
  size?: number
  className?: string
  monochrome?: boolean
  title?: string
}

/**
 * convertafy brand mark — stylized "C" with upward-trending arrow forming
 * a growth curve inside. Blue gradient (Windows-style). Uses currentColor
 * for mono variant so it can be tinted via `color:` prop.
 */
export function Logo({ size = 32, className, monochrome = false, title = 'convertafy' }: LogoProps) {
  const gradientId = 'convertafy-logo-gradient'
  const arrowGradientId = 'convertafy-arrow-gradient'

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title}
      className={cn('shrink-0', className)}
    >
      <title>{title}</title>

      {!monochrome && (
        <defs>
          {/* Deep teal-blue gradient for the C ring */}
          <linearGradient id={gradientId} x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#2B88D8" />
            <stop offset="55%" stopColor="#0E7BC4" />
            <stop offset="100%" stopColor="#0B5F99" />
          </linearGradient>
          {/* Brighter cyan for the upward arrow */}
          <linearGradient id={arrowGradientId} x1="20" y1="48" x2="52" y2="14" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#1AA7E8" />
            <stop offset="100%" stopColor="#4FD0F5" />
          </linearGradient>
        </defs>
      )}

      {/* "C" ring — open on the right where the arrow pokes through */}
      <path
        d="M50 18.2a24 24 0 1 0 0 27.6"
        stroke={monochrome ? 'currentColor' : `url(#${gradientId})`}
        strokeWidth="7.5"
        strokeLinecap="round"
        fill="none"
      />

      {/* Upward zig-zag growth curve ending in arrow head */}
      <path
        d="M22 40 L30 33 L36 38 L48 22"
        stroke={monochrome ? 'currentColor' : `url(#${arrowGradientId})`}
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Arrow head */}
      <path
        d="M40 20 L50 20 L50 30"
        stroke={monochrome ? 'currentColor' : `url(#${arrowGradientId})`}
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}
