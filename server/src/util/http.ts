import type { NextFunction, Request, Response } from 'express'
import { ZodError } from 'zod'

export class HttpError extends Error {
  status: number
  payload?: Record<string, unknown>

  constructor(status: number, message: string, payload?: Record<string, unknown>) {
    super(message)
    this.status = status
    this.payload = payload
  }
}

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>

export function asyncHandler(fn: AsyncHandler) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next)
  }
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'validation_error', details: err.flatten().fieldErrors })
    return
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, ...(err.payload ?? {}) })
    return
  }
  console.error(err)
  res.status(500).json({ error: 'internal_error' })
}
