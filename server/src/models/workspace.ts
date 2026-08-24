import mongoose from 'mongoose'

interface WorkspaceDoc extends mongoose.Document {
  name: string
  slug: string
  createdBy: mongoose.Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

const WorkspaceSchema = new mongoose.Schema<WorkspaceDoc>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
  },
  { timestamps: true, toJSON: { versionKey: false, transform(_d, ret: Record<string, unknown>) { ret.id = String(ret._id); delete ret._id; return ret } } }
)

WorkspaceSchema.index({ slug: 1 }, { unique: true })

export const Workspace = mongoose.model<WorkspaceDoc>('Workspace', WorkspaceSchema)
