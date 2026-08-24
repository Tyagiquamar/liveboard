declare global {
  namespace Express {
    interface Request {
      userId?: string
      workspaceId?: string
      role?: string
      authUser?: {
        _id: unknown
        name: string
        username: string
        color: string
        email: string
      }
    }
  }
}

export {}
