import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import type {
  UserMatchData,
  MatchFoundPayload,
  RecordStatusPayload,
  CallEndedPayload,
  SocketErrorPayload,
} from '../types';

export interface ClientToServerEvents {
  join_queue: (data: UserMatchData) => void;
  cancel_queue: (data: { userId: string }) => void;
  toggle_record: (data: { roomName: string; record: boolean }) => void;
  finish_call: (data: { roomName: string; userId: string }) => void;
}

export interface ServerToClientEvents {
  match_found: (data: MatchFoundPayload) => void;
  record_status: (data: RecordStatusPayload) => void;
  call_finished: (data: CallEndedPayload) => void;
  error: (data: SocketErrorPayload) => void;
}

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

class SocketService {
  private socket: AppSocket | null = null;

  public connect(initData: string): AppSocket {
    if (this.socket) {
      return this.socket;
    }

    const serverUrl = import.meta.env.VITE_SERVER_URL || window.location.origin;

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

  public finishCall(roomName: string, userId: string): void {
    this.socket?.emit('finish_call', { roomName, userId });
  }

  public disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

export const socketService = new SocketService();
