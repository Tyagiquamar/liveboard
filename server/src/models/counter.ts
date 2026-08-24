import mongoose from 'mongoose'

const CounterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  n: { type: Number, default: 0 }
})

interface CounterModel extends mongoose.Model<Record<string, unknown>> {
  next(key: string): Promise<number>
}

CounterSchema.statics.next = async function (this: mongoose.AnyObject, key: string): Promise<number> {
  const c = await this.findOneAndUpdate({ _id: key }, { $inc: { n: 1 } }, { new: true, upsert: true }).exec()
  return c.n as number
}

export const Counter = (
  mongoose.models.Counter ||
  mongoose.model('Counter', CounterSchema)
) as unknown as CounterModel
