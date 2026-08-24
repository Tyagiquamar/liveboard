import mongoose from 'mongoose'

export const STATUSES = ['backlog', 'todo', 'in_progress', 'done'] as const
export type Status = (typeof STATUSES)[number]

export interface IssueJSON {
  id: string
  workspaceId: string
  projectId: string
  projectKey: string
  number: number
  key: string
  title: string
  description: string
  status: Status
  priority: number
  assigneeId: string | null
  reporterId: string
  labels: string[]
  order: number
  version: number
  commentCount: number
  createdAt: string
  updatedAt: string
}

export interface IssueDoc extends mongoose.Document {
  workspaceId: mongoose.Types.ObjectId
  projectId: mongoose.Types.ObjectId
  projectKey: string
  number: number
  key: string
  title: string
  description: string
  status: Status
  statusRank: number
  priority: number
  assigneeId?: mongoose.Types.ObjectId | null
  reporterId: mongoose.Types.ObjectId
  labels: string[]
  order: number
  version: number
  commentCount: number
  clientRequestId?: string
  deletedAt?: Date | null
  createdAt: Date
  updatedAt: Date
}

const IssueSchema = new mongoose.Schema<IssueDoc>(
  {
    workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    projectKey: { type: String, required: true },
    number: { type: Number, required: true },
    key: { type: String, required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    status: { type: String, enum: STATUSES, default: 'todo' },
    statusRank: { type: Number, default: 1 },
    priority: { type: Number, min: 0, max: 4, default: 0 },
    assigneeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reporterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    labels: { type: [String], default: [] },
    order: { type: Number, required: true },
    version: { type: Number, default: 1 },
    commentCount: { type: Number, default: 0 },
    clientRequestId: { type: String },
    deletedAt: { type: Date, default: null }
  },
  { timestamps: true, toJSON: { versionKey: false, transform(_d, ret: Record<string, unknown>) { ret.id = String(ret._id); delete ret._id; return ret } } }
)

IssueSchema.index({ workspaceId: 1, status: 1, order: 1 })
IssueSchema.index({ workspaceId: 1, assigneeId: 1 })
IssueSchema.index({ workspaceId: 1, projectId: 1, number: 1 }, { unique: true })
IssueSchema.index({ clientRequestId: 1 }, { unique: true, sparse: true })

export const Issue = mongoose.model<IssueDoc>('Issue', IssueSchema)
