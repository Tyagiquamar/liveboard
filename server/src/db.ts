import mongoose from 'mongoose'
import { config } from './config'

export async function connectDb(uri?: string): Promise<void> {
  mongoose.set('strictQuery', true)
  await mongoose.connect(uri ?? config.mongoUri)
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect()
}
