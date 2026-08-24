import { ActivityFeed } from '@/components/activity-feed'

export default function ActivityPage({ params }: { params: { wsId: string } }) {
  return (
    <div className="h-full overflow-y-auto">
      <ActivityFeed wsId={params.wsId} />
    </div>
  )
}
