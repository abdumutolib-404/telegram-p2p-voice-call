import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import type {
  UserMatchData,
  MatchFoundPayload,
  RecordStatusPayload,
  RecordingErrorPayload,
  CallEndedPayload,
  SocketErrorPayload,
} from '../types';

export interface ClientToServerEvents {
  join_queue: (data: UserMatchData) => void;
  cancel_queue: (data: { userId: string }) => void;
  toggle_record: (data: { roomName: string; record: boolean }) => void;
  finish_call: (data: { roomName: string; userId: string; reason?: string }) => void;
}

export interface ServerToClientEvents {
  match_found: (data: MatchFoundPayload) => void;
  record_status: (data: RecordStatusPayload) => void;
  recording_error: (data: RecordingErrorPayload) => void;
  call_finished: (data: CallEndedPayload) => void;
  error: (data: SocketErrorPayload) => void;
}

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

class SocketService {
  private socket: AppSocket | null = null;

  public connect(initData: string): AppSocket {
    if (this.socket && this.socket.connected) {
      return this.socket;
    }

    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    const rawUrl = import.meta.env.VITE_SERVER_URL || window.location.origin;
    const serverUrl = rawUrl.replace(/\/+$/, '');

    this.socket = io(serverUrl, {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      extraHeaders: {
        'X-Telegram-Init-Data': initData,
      },
      auth: {
        token: initData,
      },
    }) as AppSocket;

    return this.socket;
  }

  public getSocket(): AppSocket | null {
    return this.socket;
  }

  public joinQueue(data: UserMatchData): void {
    this.socket?.emit('join_queue', data);
  }

  public cancelQueue(userId: string): void {
    this.socket?.emit('cancel_queue', { userId });
  }

  public toggleRecord(roomName: string, record: boolean): void {
    this.socket?.emit('toggle_record', { roomName, record });
  }

  public finishCall(roomName: string, userId: string, reason?: string): void {
    this.socket?.emit('finish_call', { roomName, userId, reason });
  }

  public disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

export const socketService = new SocketService();
