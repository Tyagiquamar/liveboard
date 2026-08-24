import { Suspense } from 'react'
import { TableView } from '@/components/table-view'

export default function TablePage({ params }: { params: { wsId: string } }) {
  return (
    <Suspense fallback={<div className="skeleton m-3 h-24" />}>
      <TableView wsId={params.wsId} />
    </Suspense>
  )
}
