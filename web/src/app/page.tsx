'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from '@/lib/store'

export default function Home() {
  const router = useRouter()
  useEffect(() => {
    const token = localStorage.getItem('lb_token')
    router.replace(token ? '/w' : '/login')
  }, [router])
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="skeleton h-8 w-40" aria-label="Loading" />
    </div>
  )
}
