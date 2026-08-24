import mongoose from 'mongoose'
import { Counter } from '../models/counter'
import { ActivityEvent, type EventJSON, type EventType } from '../models/event'
import { publishTo } from '../realtime/bus'
import { decodeCursor, encodeCursor } from '../util/cursor'

export interface ActorLike {
  _id: unknown
  name: string
  color: string
}

export async function appendEvent(opts: {
  workspaceId: mongoose.Types.ObjectId
  type: EventType
  actor: ActorLike
  entityId: mongoose.Types.ObjectId
  data: Record<string, unknown>
}): Promise<EventJSON> {
  const seq = await Counter.next(`ev:${opts.workspaceId.toString()}`)
  const doc = await ActivityEvent.create({
    workspaceId: opts.workspaceId,
    seq,
    type: opts.type,
    actorId: opts.actor._id,
    actorName: opts.actor.name,
    actorColor: opts.actor.color,
    entityId: opts.entityId,
    data: opts.data
  })
  const json = JSON.parse(JSON.stringify(doc)) as EventJSON
  publishTo(`ws:${opts.workspaceId.toString()}`, 'event', json)
  return json
}

export async function listEvents(
  workspaceId: string,
  opts: { limit: number; before?: number | null }
): Promise<{ items: EventJSON[]; nextBefore: number | null }> {
  const filter: Record<string, unknown> = { workspaceId: new mongoose.Types.ObjectId(workspaceId) }
  if (opts.before != null) filter.seq = { $lt: opts.before }
  const docs = await ActivityEvent.find(filter).sort({ seq: -1 }).limit(opts.limit + 1).exec()
  const hasMore = docs.length > opts.limit
  const page = hasMore ? docs.slice(0, opts.limit) : docs
  const items = page.map((d) => JSON.parse(JSON.stringify(d)) as EventJSON)
  const nextBefore = hasMore && items.length ? items[items.length - 1].seq : null
  return { items, nextBefore }
}

export async function eventsSince(workspaceId: string, sinceSeq: number, batch = 300): Promise<EventJSON[]> {
  const out: EventJSON[] = []
  let lastSeq = sinceSeq
  for (;;) {
    const docs = await ActivityEvent.find({
      workspaceId: new mongoose.Types.ObjectId(workspaceId),
      seq: { $gt: lastSeq }
    })
      .sort({ seq: 1 })
      .limit(batch)
      .exec()
    if (!docs.length) break
    for (const d of docs) out.push(JSON.parse(JSON.stringify(d)) as EventJSON)
    lastSeq = docs[docs.length - 1].seq
    if (docs.length < batch) break
  }
  return out
}

export function activityPage(items: EventJSON[], nextBefore: number | null) {
  return {
    items,
    nextCursor: nextBefore != null ? encodeCursor({ b: nextBefore }) : null
  }
}

export function parseActivityCursor(cursor?: string): number | null {
  const c = decodeCursor<{ b?: number }>(cursor)
  return c?.b ?? null
}
