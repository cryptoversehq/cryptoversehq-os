type ExchangeType = 'binance' | 'coinbase' | 'bybit';
class WebSocketService {
  private ws: WebSocket | null = null;
  private attempts = 0;
  connect(exchange: ExchangeType, symbol: string, onMessage: (d: any) => void) {
    const url = exchange === 'binance' ? 'wss://stream.binance.com:9443/ws/' + symbol.toLowerCase() + '@trade' : '';
    this.ws = new WebSocket(url);
    this.ws.onmessage = (e) => onMessage(JSON.parse(e.data));
    this.ws.onclose = () => { if (this.attempts++ < 5) setTimeout(() => this.connect(exchange, symbol, onMessage), 2000 * this.attempts); };
  }
  disconnect() { this.ws?.close(); this.ws = null; }
}
export const webSocketService = new WebSocketService();