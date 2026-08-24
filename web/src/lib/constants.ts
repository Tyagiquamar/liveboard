import type { Status } from './types'

export const STATUSES: Status[] = ['backlog', 'todo', 'in_progress', 'done']

export const STATUS_META: Record<Status, { label: string; dot: string; text: string }> = {
  backlog: { label: 'Backlog', dot: '#8b8fa3', text: 'text-[#a2a6b8]' },
  todo: { label: 'Todo', dot: '#6ba6f7', text: 'text-[#7db3f9]' },
  in_progress: { label: 'In Progress', dot: '#e9b44c', text: 'text-[#edc06a]' },
  done: { label: 'Done', dot: '#57c785', text: 'text-[#74d29b]' }
}

export const PRIORITIES = [
  { value: 0, label: 'None', color: '#6c707b' },
  { value: 1, label: 'Low', color: '#8b95a8' },
  { value: 2, label: 'Medium', color: '#e9b44c' },
  { value: 3, label: 'High', color: '#f08c54' },
  { value: 4, label: 'Urgent', color: '#ef5350' }
]

export function priorityMeta(v: number) {
  return PRIORITIES[Math.max(0, Math.min(4, v))]
}
