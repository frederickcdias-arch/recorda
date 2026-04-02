/**
 * Infrastructure Real-Time Index
 * Exporta todos os serviços de colaboração em tempo real
 */

export { RealTimeService, getRealTimeService } from './RealTimeService.js';
export type {
  CollaborationSession,
  Participant,
  CursorPosition,
  CollaborationSettings,
  DocumentState,
  DocumentOperation,
  ChatMessage,
  ChatReaction,
  ChatAttachment,
  VoiceChannel,
  VoiceParticipant,
  VoiceChannelSettings,
  RealTimeMetrics,
} from './RealTimeService.js';
