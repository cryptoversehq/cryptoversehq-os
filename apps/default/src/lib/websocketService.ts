type ExchangeType = 'binance' | 'coinbase' | 'bybit';

type TradeMessage = Record<string, unknown>;
export type WebSocketStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'unsupported' | 'error';

export interface WebSocketConnectionOptions {
  onStatus?: (status: WebSocketStatus) => void;
}

class WebSocketService {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private attempts = 0;
  private generation = 0;
  private current: { exchange: ExchangeType; symbol: string; onMessage: (data: TradeMessage) => void; onStatus?: (status: WebSocketStatus) => void } | null = null;

  connect(
    exchange: ExchangeType,
    symbol: string,
    onMessage: (data: TradeMessage) => void,
    options: WebSocketConnectionOptions = {},
  ): void {
    this.disconnect();
    this.current = { exchange, symbol, onMessage, onStatus: options.onStatus };
    this.attempts = 0;
    this.open(this.generation, true);
  }

  disconnect(): void {
    this.generation += 1;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const socket = this.ws;
    this.ws = null;
    this.current = null;
    socket?.close();
  }

  private open(generation: number, initial: boolean): void {
    const config = this.current;
    if (!config || generation !== this.generation) return;

    if (config.exchange !== 'binance') {
      config.onStatus?.('unsupported');
      return;
    }

    const cleanSymbol = config.symbol.trim().toLowerCase();
    if (!cleanSymbol) {
      config.onStatus?.('error');
      return;
    }

    config.onStatus?.(initial ? 'connecting' : 'reconnecting');
    try {
      const socket = new WebSocket(`wss://stream.binance.com:9443/ws/${encodeURIComponent(cleanSymbol)}@trade`);
      this.ws = socket;
      socket.onopen = () => {
        if (generation !== this.generation) return;
        this.attempts = 0;
        config.onStatus?.('connected');
      };
      socket.onmessage = event => {
        if (generation !== this.generation) return;
        try {
          const parsed: unknown = JSON.parse(event.data);
          if (parsed && typeof parsed === 'object') config.onMessage(parsed as TradeMessage);
        } catch {
          config.onStatus?.('error');
        }
      };
      socket.onerror = () => {
        if (generation === this.generation) config.onStatus?.('error');
      };
      socket.onclose = () => {
        if (generation !== this.generation) return;
        this.ws = null;
        if (this.attempts >= 5) {
          config.onStatus?.('disconnected');
          return;
        }
        this.attempts += 1;
        const delay = Math.min(30_000, 2_000 * this.attempts);
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = null;
          this.open(generation, false);
        }, delay);
      };
    } catch {
      config.onStatus?.('error');
      if (this.attempts < 5) {
        this.attempts += 1;
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = null;
          this.open(generation, false);
        }, Math.min(30_000, 2_000 * this.attempts));
      }
    }
  }
}

export const webSocketService = new WebSocketService();
