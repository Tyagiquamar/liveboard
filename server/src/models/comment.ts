import mongoose from 'mongoose'

export interface CommentJSON {
  id: string
  issueId: string
  workspaceId: string
  authorId: string
  body: string
  mentionIds: string[]
  createdAt: string
}

export interface CommentDoc extends mongoose.Document {
  issueId: mongoose.Types.ObjectId
  workspaceId: mongoose.Types.ObjectId
  authorId: mongoose.Types.ObjectId
  body: string
  mentionIds: mongoose.Types.ObjectId[]
  clientRequestId?: string
  createdAt: Date
  updatedAt: Date
}

const CommentSchema = new mongoose.Schema<CommentDoc>(
  {
    issueId: { type: mongoose.Schema.Types.ObjectId, ref: 'Issue', required: true },
    workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    body: { type: String, required: true },
    mentionIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    clientRequestId: { type: String }
  },
  { timestamps: true, toJSON: { versionKey: false, transform(_d, ret: Record<string, unknown>) { ret.id = String(ret._id); delete ret._id; return ret } } }
)

CommentSchema.index({ issueId: 1, createdAt: -1 })
CommentSchema.index({ clientRequestId: 1 }, { unique: true, sparse: true })

export const Comment = mongoose.model<CommentDoc>('Comment', CommentSchema)
