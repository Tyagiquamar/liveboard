import mongoose from 'mongoose'

const IdemSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  result: { type: mongoose.Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now, expires: '7d' }
})

interface IdemModel extends mongoose.Model<Record<string, unknown>> {}

const IdempotencyKey = (
  mongoose.models.IdempotencyKey ||
  mongoose.model('IdempotencyKey', IdemSchema)
) as unknown as IdemModel

export async function idempotent<T>(
  key: string | null | undefined,
  fn: () => Promise<T>
): Promise<{ result: T; replayed: boolean }> {
  if (!key) return { result: await fn(), replayed: false }
  const existing = await IdempotencyKey.findById(key).exec()
  if (existing) return { result: existing.result as T, replayed: true }
  const result = await fn()
  try {
    await IdempotencyKey.create({ _id: key, result })
  } catch {
    const raced = await IdempotencyKey.findById(key).exec()
    if (raced) return { result: raced.result as T, replayed: true }
  }
  return { result, replayed: false }
}
