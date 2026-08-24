import bcrypt from 'bcryptjs'
import mongoose from 'mongoose'

export interface UserJSON {
  id: string
  email: string
  name: string
  username: string
  color: string
}

interface UserDoc extends mongoose.Document {
  email: string
  name: string
  username: string
  passwordHash: string
  createdAt: Date
  updatedAt: Date
  comparePassword(pw: string): Promise<boolean>
}

const UserSchema = new mongoose.Schema<UserDoc>(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    username: { type: String, required: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true }
  },
  {
    timestamps: true,
    toJSON: {
      versionKey: false,
      transform(_doc, ret: Record<string, unknown>) {
        ret.id = String(ret._id)
        delete ret._id
        delete ret.passwordHash
        return ret
      }
    }
  }
)

UserSchema.index({ email: 1 }, { unique: true })
UserSchema.index({ username: 1 }, { unique: true })

UserSchema.methods.comparePassword = function (pw: string): Promise<boolean> {
  return bcrypt.compare(pw, this.passwordHash)
}

export async function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, 10)
}

export const User = mongoose.model<UserDoc>('User', UserSchema)
