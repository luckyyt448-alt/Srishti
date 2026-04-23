
export interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
  grounding?: any[];
}

export enum VoiceName {
  ZEPHYR = 'Zephyr',
  PUCK = 'Puck',
  CHARON = 'Charon',
  KORE = 'Kore',
  FENRIR = 'Fenrir'
}

export interface AssistantState {
  isConnecting: boolean;
  isConnected: boolean;
  isListening: boolean;
  isSpeaking: boolean;
  error: string | null;
}
