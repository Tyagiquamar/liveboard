import mongoose from 'mongoose'

export interface ProjectJSON {
  id: string
  workspaceId: string
  name: string
  key: string
  createdBy: string
  createdAt: string
}

interface ProjectDoc extends mongoose.Document {
  workspaceId: mongoose.Types.ObjectId
  name: string
  key: string
  createdBy: mongoose.Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

const ProjectSchema = new mongoose.Schema<ProjectDoc>(
  {
    workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
    name: { type: String, required: true, trim: true },
    key: { type: String, required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
  },
  { timestamps: true, toJSON: { versionKey: false, transform(_d, ret: Record<string, unknown>) { ret.id = String(ret._id); delete ret._id; return ret } } }
)

ProjectSchema.index({ workspaceId: 1, key: 1 }, { unique: true })

export const Project = mongoose.model<ProjectDoc>('Project', ProjectSchema)
