import { HubConnectionBuilder, LogLevel, type HubConnection } from '@microsoft/signalr'
import { useEffect, useRef } from 'react'

// SignalR: одне з'єднання на застосунок; сервер надсилає "votesChanged" після кожного голосу.
let connection: HubConnection | null = null
let starting: Promise<void> | null = null

function getConnection(): HubConnection {
  if (!connection) {
    connection = new HubConnectionBuilder()
      .withUrl('/hubs/results')
      .withAutomaticReconnect()
      .configureLogging(LogLevel.Warning)
      .build()
  }
  if (connection.state === 'Disconnected' && !starting) {
    starting = connection
      .start()
      .catch(() => undefined)
      .finally(() => (starting = null))
  }
  return connection
}

/** Викликає callback, коли змінюються голоси (projectId; 0 — оновити все). */
export function useVotesChanged(callback: (projectId: number) => void) {
  const ref = useRef(callback)
  ref.current = callback
  useEffect(() => {
    const conn = getConnection()
    const handler = (projectId: number) => ref.current(projectId)
    conn.on('votesChanged', handler)
    return () => conn.off('votesChanged', handler)
  }, [])
}
