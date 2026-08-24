type Publisher = (room: string, event: string, data: unknown) => void

let publisher: Publisher = () => {}

export function setPublisher(p: Publisher): void {
  publisher = p
}

export function publishTo(room: string, event: string, data: unknown): void {
  publisher(room, event, data)
}
