import { Suspense } from 'react'
import { BoardView } from '@/components/board-view'

export default function BoardPage({ params }: { params: { wsId: string } }) {
  return (
    <Suspense fallback={<div className="skeleton m-3 h-24" />}>
      <BoardView wsId={params.wsId} />
    </Suspense>
  )
}
