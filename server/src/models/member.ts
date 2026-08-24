import mongoose from 'mongoose'

export interface MemberJSON {
  id: string
  role: string
  user: { id: string; name: string; username: string; color: string } | null
}

interface MemberDoc extends mongoose.Document {
  workspaceId: mongoose.Types.ObjectId
  userId: mongoose.Types.ObjectId
  role: 'owner' | 'member'
  createdAt: Date
}

const MemberSchema = new mongoose.Schema<MemberDoc>(
  {
    workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['owner', 'member'], default: 'member' }
  },
  { timestamps: true, toJSON: { versionKey: false, transform(_d, ret: Record<string, unknown>) { ret.id = String(ret._id); delete ret._id; return ret } } }
)

MemberSchema.index({ workspaceId: 1, userId: 1 }, { unique: true })

export const Member = mongoose.model<MemberDoc>('Member', MemberSchema)
