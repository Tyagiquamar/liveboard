import mongoose from 'mongoose'

export type EventType =
  | 'project.created'
  | 'member.added'
  | 'issue.created'
  | 'issue.updated'
  | 'issue.deleted'
  | 'comment.created'

export interface EventJSON {
  id: string
  seq: number
  workspaceId: string
  type: EventType
  actor: { id: string; name: string; color: string }
  entityId: string
  data: Record<string, unknown>
  ts: string
}

interface EventDoc extends mongoose.Document {
  workspaceId: mongoose.Types.ObjectId
  seq: number
  type: EventType
  actorId: mongoose.Types.ObjectId
  actorName: string
  actorColor: string
  entityId: mongoose.Types.ObjectId
  data: Record<string, unknown>
  createdAt: Date
}

const EventSchema = new mongoose.Schema<EventDoc>(
  {
    workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
    seq: { type: Number, required: true },
    type: { type: String, required: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, required: true },
    actorName: { type: String, required: true },
    actorColor: { type: String, required: true },
    entityId: { type: mongoose.Schema.Types.ObjectId, required: true },
    data: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    toJSON: {
      versionKey: false,
      transform(_d, ret: Record<string, unknown>) {
        return {
          id: String(ret._id),
          seq: ret.seq,
          workspaceId: String(ret.workspaceId),
          type: ret.type,
          actor: { id: ret.actorId ? String(ret.actorId) : '', name: ret.actorName, color: ret.actorColor },
          entityId: String(ret.entityId),
          data: ret.data ?? {},
          ts: ret.createdAt
        }
      }
    }
  }
)

EventSchema.index({ workspaceId: 1, seq: -1 })
EventSchema.index({ workspaceId: 1, seq: 1 }, { unique: true })

export const ActivityEvent = mongoose.model<EventDoc>('ActivityEvent', EventSchema)
