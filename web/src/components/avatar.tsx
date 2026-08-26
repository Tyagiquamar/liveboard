'use client'

import { useState } from 'react'
import { cn, initials } from '@/lib/utils'

export function Avatar({
  name,
  username,
  color,
  size = 24,
  className,
  ring
}: {
  name: string
  username?: string
  color?: string
  size?: number
  className?: string
  ring?: boolean
}) {
  const [imgFailed, setImgFailed] = useState(false)
  const src = username && /^[a-z0-9_]{2,24}$/.test(username) ? `/avatars/${username}.svg` : null

  return (
    <span
      title={name}
      style={{ width: size, height: size }}
      className={cn(
        'relative inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold text-white',
        ring && 'ring-2 ring-panel',
        (!src || imgFailed) && !color && 'bg-[#6e79f4]',
        className
      )}
      aria-label={name}
    >
      {src && !imgFailed ? (
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          onError={() => setImgFailed(true)}
          className="h-full w-full rounded-full"
          draggable={false}
        />
      ) : (
        <span
          style={{
            background: color ?? '#6e79f4',
            position: 'absolute',
            inset: 0,
            borderRadius: '9999px',
            fontSize: Math.max(9, size * 0.38)
          }}
          className="flex items-center justify-center"
        >
          {initials(name)}
        </span>
      )}
    </span>
  )
}
