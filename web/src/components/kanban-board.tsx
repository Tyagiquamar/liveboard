'use client'

import { useMemo, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Plus } from 'lucide-react'
import { STATUS_META, STATUSES } from '@/lib/constants'
import { orderForIndex } from '@/lib/utils'
import { useUpdateIssue } from '@/lib/hooks'
import { useUi } from '@/lib/store'
import type { Issue, Status } from '@/lib/types'
import { IssueCard } from './issue-card'

export function KanbanBoard({ issues }: { issues: Issue[] }) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const update = useUpdateIssue(issues[0]?.workspaceId ?? '')
  const openNew = useUi((s) => s.openNewIssue)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor)
  )

  const byStatus = useMemo(() => {
    const map = new Map<Status, Issue[]>()
    for (const s of STATUSES) map.set(s, [])
    for (const i of [...issues].sort((a, b) => a.order - b.order)) {
      map.get(i.status)?.push(i)
    }
    return map
  }, [issues])

  const activeIssue = activeId ? issues.find((i) => i.id === activeId) ?? null : null

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id))
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null)
    const id = String(e.active.id)
    const issue = issues.find((i) => i.id === id)
    if (!issue) return

    let targetStatus: Status | null = null
    const overId = e.over?.id ? String(e.over.id) : null
    if (!overId) return
    if (STATUSES.includes(overId as Status)) {
      targetStatus = overId as Status
    } else {
      const over = issues.find((i) => i.id === overId)
      if (over) targetStatus = over.status
    }
    if (!targetStatus) return

    const column = (byStatus.get(targetStatus) ?? []).filter((i) => i.id !== id)
    let index = column.length
    if (!STATUSES.includes(overId as Status)) {
      const overIndex = column.findIndex((i) => i.id === overId)
      if (overIndex >= 0) {
        const overRect = e.over!.rect
        const pointerBelowMidpoint =
          e.activatorEvent && 'clientY' in e.activatorEvent
            ? (e.activatorEvent as PointerEvent).clientY > overRect.top + overRect.height / 2
            : false
        index = Math.max(0, overIndex + (pointerBelowMidpoint ? 1 : 0))
      }
    }

    if (targetStatus === issue.status) {
      const sameCol = (byStatus.get(issue.status) ?? []).filter((i) => i.id !== id)
      if (sameCol[index] && sameCol[index].id === overId && index === sameCol.findIndex((i) => i.id === overId)) {
        return
      }
    }

    const orders = column.map((c) => c.order).sort((a, b) => a - b)
    const newOrder = orderForIndex(orders, index)

    const changed =
      issue.status !== targetStatus ||
      Math.abs(newOrder - issue.order) > 0.000001
    if (!changed) return

    update.mutate({
      id,
      patch: { status: targetStatus, order: newOrder },
      conflictGuard: true
    })
  }

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="flex h-full gap-3 overflow-x-auto p-3" role="region" aria-label="Kanban board">
        {STATUSES.map((status) => {
          const colIssues = byStatus.get(status)!
          return (
            <section
              key={status}
              aria-label={`${STATUS_META[status].label} column`}
              className="flex w-[280px] shrink-0 flex-col rounded-xl border border-line bg-panel/50"
            >
              <header className="flex items-center gap-2 border-b border-line px-3 py-2.5">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: STATUS_META[status].dot }}
                  aria-hidden
                />
                <h2 className="text-sm font-semibold text-ink-muted">{STATUS_META[status].label}</h2>
                <span className="rounded bg-hoverbg px-1.5 text-xs text-ink-faint">{colIssues.length}</span>
                <button
                  onClick={() => openNew({ defaultStatus: status })}
                  className="ml-auto rounded p-0.5 text-ink-faint transition-colors hover:bg-hoverbg hover:text-ink"
                  aria-label={`Add issue to ${STATUS_META[status].label}`}
                >
                  <Plus size={14} />
                </button>
              </header>

              <SortableContext items={colIssues.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                <div className="flex min-h-[80px] flex-1 flex-col gap-2 overflow-y-auto p-2">
                  {colIssues.map((issue) => (
                    <BoardCard key={issue.id} issue={issue} />
                  ))}
                  {!colIssues.length && (
                    <button
                      onClick={() => openNew({ defaultStatus: status })}
                      className="mt-2 rounded-lg border border-dashed border-line px-3 py-4 text-xs text-ink-faint transition-colors hover:border-accent/50 hover:text-ink-muted"
                    >
                      Drop issues here or click to create
                    </button>
                  )}
                </div>
              </SortableContext>
            </section>
          )
        })}
      </div>

      <DragOverlay>
        {activeIssue ? (
          <div className="card-drag w-[264px] rounded-lg border border-line bg-panel p-3">
            <IssueCard issue={activeIssue} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

function BoardCard({ issue }: { issue: Issue }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: issue.id,
    data: { type: 'issue', status: issue.status }
  })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      className={isDragging ? 'opacity-30' : ''}
    >
      <IssueCard issue={issue} />
    </div>
  )
}
