export type LynxResponseStatus = 'answered' | 'no_data' | 'unsupported' | 'permission_denied' | 'unavailable';

export interface LynxResponse {
  status: LynxResponseStatus;
  content: string;
  source: string;
  confidence: number;
  reasoningPath: string[];
  agent: string;
  permissionLevel: string;
  memoryReference: string | null;
  intent: string;
  timestamp: number;
}

export function createLynxResponse(input: Omit<LynxResponse, 'timestamp'>): LynxResponse {
  return { ...input, timestamp: Date.now() };
}
