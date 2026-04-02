/**
 * Real-Time Collaboration Service
 * Implementa colaboração em tempo real com WebRTC e WebSockets
 */

import type { FastifyInstance } from 'fastify';
import { logger } from '../logging/logger.js';
import { getEventService } from '../events/index.js';

export interface CollaborationSession {
  id: string;
  name: string;
  type: 'document' | 'whiteboard' | 'code' | 'meeting' | 'presentation';
  ownerId: string;
  tenantId: string;
  participants: Participant[];
  status: 'active' | 'inactive' | 'archived';
  settings: CollaborationSettings;
  createdAt: Date;
  updatedAt: Date;
  lastActivity: Date;
  metadata: Record<string, any>;
}

export interface Participant {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: 'owner' | 'editor' | 'viewer' | 'presenter';
  status: 'online' | 'offline' | 'away';
  joinedAt: Date;
  lastSeen: Date;
  cursor?: CursorPosition;
  permissions: string[];
  metadata: Record<string, any>;
}

export interface CursorPosition {
  x: number;
  y: number;
  selection?: {
    start: number;
    end: number;
  };
  timestamp: Date;
}

export interface CollaborationSettings {
  maxParticipants: number;
  allowAnonymous: boolean;
  requireApproval: boolean;
  autoSave: boolean;
  autoSaveInterval: number; // seconds
  versionHistory: boolean;
  chatEnabled: boolean;
  screenShareEnabled: boolean;
  voiceEnabled: boolean;
  videoEnabled: boolean;
  recordingEnabled: boolean;
  permissions: {
    canEdit: string[];
    canComment: string[];
    canShare: string[];
    canDelete: string[];
  };
}

export interface DocumentState {
  id: string;
  sessionId: string;
  version: number;
  content: string;
  operations: DocumentOperation[];
  checksum: string;
  createdAt: Date;
  updatedAt: Date;
  authorId: string;
  metadata: Record<string, any>;
}

export interface DocumentOperation {
  id: string;
  type: 'insert' | 'delete' | 'retain' | 'format';
  position: number;
  content?: string;
  length?: number;
  attributes?: Record<string, any>;
  authorId: string;
  timestamp: Date;
  applied: boolean;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  authorId: string;
  authorName: string;
  content: string;
  type: 'text' | 'file' | 'emoji' | 'system';
  timestamp: Date;
  edited?: boolean;
  editedAt?: Date;
  reactions: ChatReaction[];
  replyTo?: string;
  attachments: ChatAttachment[];
  metadata: Record<string, any>;
}

export interface ChatReaction {
  emoji: string;
  users: string[];
  count: number;
}

export interface ChatAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
  url: string;
  thumbnail?: string;
}

export interface VoiceChannel {
  id: string;
  sessionId: string;
  name: string;
  type: 'voice' | 'video' | 'screen';
  participants: VoiceParticipant[];
  status: 'active' | 'inactive';
  settings: VoiceChannelSettings;
  createdAt: Date;
  updatedAt: Date;
}

export interface VoiceParticipant {
  userId: string;
  name: string;
  muted: boolean;
  speaking: boolean;
  videoEnabled: boolean;
  screenSharing: boolean;
  connectionQuality: 'excellent' | 'good' | 'fair' | 'poor';
  joinedAt: Date;
  lastActivity: Date;
}

export interface VoiceChannelSettings {
  maxParticipants: number;
  allowRecording: boolean;
  requireModerator: boolean;
  autoMute: boolean;
  noiseSuppression: boolean;
  echoCancellation: boolean;
  quality: 'low' | 'medium' | 'high' | 'ultra';
}

export interface RealTimeMetrics {
  sessions: {
    total: number;
    active: number;
    inactive: number;
    archived: number;
  };
  participants: {
    total: number;
    online: number;
    offline: number;
    away: number;
  };
  documents: {
    total: number;
    totalVersions: number;
    totalOperations: number;
    averageSize: number;
  };
  chat: {
    totalMessages: number;
    messagesPerHour: number;
    activeChannels: number;
  };
  voice: {
    activeChannels: number;
    totalParticipants: number;
    averageQuality: number;
    totalMinutes: number;
  };
  performance: {
    averageLatency: number;
    messageDeliveryRate: number;
    connectionSuccessRate: number;
    errorRate: number;
  };
}

export class RealTimeService {
  private sessions: Map<string, CollaborationSession> = new Map();
  private documentStates: Map<string, DocumentState> = new Map();
  private chatMessages: Map<string, ChatMessage[]> = new Map();
  private voiceChannels: Map<string, VoiceChannel> = new Map();
  private websockets: Map<string, WebSocket> = new Map();
  private eventService = getEventService();

  constructor(private server: FastifyInstance) {
    this.setupMiddleware();
    this.setupRoutes();
    this.initializeWebRTC();
    this.initializeWebSockets();
    this.startRealTimeMonitoring();
  }

  /**
   * Configurar middleware real-time
   */
  private setupMiddleware(): void {
    // Middleware para WebSocket upgrade
    this.server.addHook('preHandler', async (request, reply) => {
      if (request.headers.upgrade === 'websocket') {
        await this.handleWebSocketUpgrade(request, reply);
      }
    });

    // Middleware para WebRTC signaling
    this.server.addHook('preValidation', async (request, reply) => {
      if (this.isWebRTCRequest(request)) {
        await this.validateWebRTCRequest(request, reply);
      }
    });

    // Middleware para presença online
    this.server.addHook('onRequest', async (request, reply) => {
      if (this.isCollaborationRequest(request)) {
        await this.updatePresence(request);
      }
    });
  }

  /**
   * Configurar rotas real-time
   */
  private setupRoutes(): void {
    // Gerenciar sessões de colaboração
    this.server.post(
      '/admin/collaboration/sessions',
      {
        schema: {
          description: 'Criar sessão de colaboração',
          tags: ['admin', 'collaboration'],
          body: {
            type: 'object',
            required: ['name', 'type', 'ownerId', 'tenantId'],
            properties: {
              name: { type: 'string' },
              type: {
                type: 'string',
                enum: ['document', 'whiteboard', 'code', 'meeting', 'presentation'],
              },
              ownerId: { type: 'string' },
              tenantId: { type: 'string' },
              settings: {
                type: 'object',
                properties: {
                  maxParticipants: { type: 'number', minimum: 1, maximum: 1000 },
                  allowAnonymous: { type: 'boolean' },
                  requireApproval: { type: 'boolean' },
                  autoSave: { type: 'boolean' },
                  autoSaveInterval: { type: 'number', minimum: 10 },
                  versionHistory: { type: 'boolean' },
                  chatEnabled: { type: 'boolean' },
                  screenShareEnabled: { type: 'boolean' },
                  voiceEnabled: { type: 'boolean' },
                  videoEnabled: { type: 'boolean' },
                  recordingEnabled: { type: 'boolean' },
                },
              },
            },
          },
        },
      },
      async (request, reply) => {
        const sessionData = request.body as any;

        try {
          const session = await this.createCollaborationSession(sessionData);
          reply.status(201).send(session);
        } catch (error) {
          reply.status(500).send({ error: 'Failed to create collaboration session' });
        }
      }
    );

    // Listar sessões de colaboração
    this.server.get(
      '/admin/collaboration/sessions',
      {
        schema: {
          description: 'Listar sessões de colaboração',
          tags: ['admin', 'collaboration'],
          querystring: {
            type: 'object',
            properties: {
              tenantId: { type: 'string' },
              ownerId: { type: 'string' },
              status: { type: 'string', enum: ['active', 'inactive', 'archived'] },
            },
          },
        },
      },
      async (request, reply) => {
        const { tenantId, ownerId, status } = request.query as any;
        const sessions = await this.listCollaborationSessions({ tenantId, ownerId, status });
        reply.send({ sessions });
      }
    );

    // Participar de sessão
    this.server.post(
      '/collaboration/sessions/:id/join',
      {
        schema: {
          description: 'Participar de sessão de colaboração',
          tags: ['collaboration'],
          params: {
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
          },
          body: {
            type: 'object',
            required: ['userId', 'name', 'email'],
            properties: {
              userId: { type: 'string' },
              name: { type: 'string' },
              email: { type: 'string' },
              role: { type: 'string', enum: ['editor', 'viewer', 'presenter'] },
            },
          },
        },
      },
      async (request, reply) => {
        const { id } = request.params as { id: string };
        const participantData = request.body as any;

        try {
          const session = await this.joinCollaborationSession(id, participantData);
          reply.send(session);
        } catch (error) {
          reply.status(500).send({ error: 'Failed to join collaboration session' });
        }
      }
    );

    // Sair de sessão
    this.server.post(
      '/collaboration/sessions/:id/leave',
      {
        schema: {
          description: 'Sair de sessão de colaboração',
          tags: ['collaboration'],
          params: {
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
          },
          body: {
            type: 'object',
            required: ['userId'],
            properties: {
              userId: { type: 'string' },
            },
          },
        },
      },
      async (request, reply) => {
        const { id } = request.params as { id: string };
        const { userId } = request.body as any;

        try {
          const session = await this.leaveCollaborationSession(id, userId);
          reply.send(session);
        } catch (error) {
          reply.status(500).send({ error: 'Failed to leave collaboration session' });
        }
      }
    );

    // Operações de documento
    this.server.post(
      '/collaboration/sessions/:id/operations',
      {
        schema: {
          description: 'Aplicar operação de documento',
          tags: ['collaboration', 'document'],
          params: {
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
          },
          body: {
            type: 'object',
            required: ['type', 'position', 'authorId'],
            properties: {
              type: { type: 'string', enum: ['insert', 'delete', 'retain', 'format'] },
              position: { type: 'number' },
              content: { type: 'string' },
              length: { type: 'number' },
              attributes: { type: 'object' },
              authorId: { type: 'string' },
            },
          },
        },
      },
      async (request, reply) => {
        const { id } = request.params as { id: string };
        const operationData = request.body as any;

        try {
          const result = await this.applyDocumentOperation(id, operationData);
          reply.send(result);
        } catch (error) {
          reply.status(500).send({ error: 'Failed to apply document operation' });
        }
      }
    );

    // Obter estado do documento
    this.server.get(
      '/collaboration/sessions/:id/document',
      {
        schema: {
          description: 'Obter estado do documento',
          tags: ['collaboration', 'document'],
          params: {
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
          },
          querystring: {
            type: 'object',
            properties: {
              version: { type: 'number' },
            },
          },
        },
      },
      async (request, reply) => {
        const { id } = request.params as { id: string };
        const { version } = request.query as any;

        try {
          const document = await this.getDocumentState(id, version);
          reply.send(document);
        } catch (error) {
          reply.status(500).send({ error: 'Failed to get document state' });
        }
      }
    );

    // Chat
    this.server.post(
      '/collaboration/sessions/:id/chat',
      {
        schema: {
          description: 'Enviar mensagem de chat',
          tags: ['collaboration', 'chat'],
          params: {
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
          },
          body: {
            type: 'object',
            required: ['authorId', 'authorName', 'content'],
            properties: {
              authorId: { type: 'string' },
              authorName: { type: 'string' },
              content: { type: 'string' },
              type: { type: 'string', enum: ['text', 'file', 'emoji', 'system'] },
              replyTo: { type: 'string' },
              attachments: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    type: { type: 'string' },
                    size: { type: 'number' },
                    url: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
      async (request, reply) => {
        const { id } = request.params as { id: string };
        const messageData = request.body as any;

        try {
          const message = await this.sendChatMessage(id, messageData);
          reply.status(201).send(message);
        } catch (error) {
          reply.status(500).send({ error: 'Failed to send chat message' });
        }
      }
    );

    // Obter mensagens de chat
    this.server.get(
      '/collaboration/sessions/:id/chat',
      {
        schema: {
          description: 'Obter mensagens de chat',
          tags: ['collaboration', 'chat'],
          params: {
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
          },
          querystring: {
            type: 'object',
            properties: {
              limit: { type: 'number', maximum: 100 },
              offset: { type: 'number' },
              since: { type: 'string' },
            },
          },
        },
      },
      async (request, reply) => {
        const { id } = request.params as { id: string };
        const { limit = 50, offset = 0, since } = request.query as any;

        try {
          const messages = await this.getChatMessages(id, { limit, offset, since });
          reply.send({ messages });
        } catch (error) {
          reply.status(500).send({ error: 'Failed to get chat messages' });
        }
      }
    );

    // Canais de voz
    this.server.post(
      '/collaboration/sessions/:id/voice-channels',
      {
        schema: {
          description: 'Criar canal de voz',
          tags: ['collaboration', 'voice'],
          params: {
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
          },
          body: {
            type: 'object',
            required: ['name', 'type'],
            properties: {
              name: { type: 'string' },
              type: { type: 'string', enum: ['voice', 'video', 'screen'] },
              settings: {
                type: 'object',
                properties: {
                  maxParticipants: { type: 'number', minimum: 1, maximum: 50 },
                  allowRecording: { type: 'boolean' },
                  requireModerator: { type: 'boolean' },
                  autoMute: { type: 'boolean' },
                  noiseSuppression: { type: 'boolean' },
                  echoCancellation: { type: 'boolean' },
                  quality: { type: 'string', enum: ['low', 'medium', 'high', 'ultra'] },
                },
              },
            },
          },
        },
      },
      async (request, reply) => {
        const { id } = request.params as { id: string };
        const channelData = request.body as any;

        try {
          const channel = await this.createVoiceChannel(id, channelData);
          reply.status(201).send(channel);
        } catch (error) {
          reply.status(500).send({ error: 'Failed to create voice channel' });
        }
      }
    );

    // WebRTC signaling
    this.server.post(
      '/collaboration/webrtc/:sessionId/offer',
      {
        schema: {
          description: 'Enviar WebRTC offer',
          tags: ['collaboration', 'webrtc'],
          params: {
            type: 'object',
            properties: {
              sessionId: { type: 'string' },
            },
          },
          body: {
            type: 'object',
            required: ['from', 'to', 'offer'],
            properties: {
              from: { type: 'string' },
              to: { type: 'string' },
              offer: { type: 'object' },
            },
          },
        },
      },
      async (request, reply) => {
        const { sessionId } = request.params as { sessionId: string };
        const offerData = request.body as any;

        try {
          await this.handleWebRTCOffer(sessionId, offerData);
          reply.send({ success: true });
        } catch (error) {
          reply.status(500).send({ error: 'Failed to handle WebRTC offer' });
        }
      }
    );

    this.server.post(
      '/collaboration/webrtc/:sessionId/answer',
      {
        schema: {
          description: 'Enviar WebRTC answer',
          tags: ['collaboration', 'webrtc'],
          params: {
            type: 'object',
            properties: {
              sessionId: { type: 'string' },
            },
          },
          body: {
            type: 'object',
            required: ['from', 'to', 'answer'],
            properties: {
              from: { type: 'string' },
              to: { type: 'string' },
              answer: { type: 'object' },
            },
          },
        },
      },
      async (request, reply) => {
        const { sessionId } = request.params as { sessionId: string };
        const answerData = request.body as any;

        try {
          await this.handleWebRTCAnswer(sessionId, answerData);
          reply.send({ success: true });
        } catch (error) {
          reply.status(500).send({ error: 'Failed to handle WebRTC answer' });
        }
      }
    );

    this.server.post(
      '/collaboration/webrtc/:sessionId/ice-candidate',
      {
        schema: {
          description: 'Enviar ICE candidate',
          tags: ['collaboration', 'webrtc'],
          params: {
            type: 'object',
            properties: {
              sessionId: { type: 'string' },
            },
          },
          body: {
            type: 'object',
            required: ['from', 'to', 'candidate'],
            properties: {
              from: { type: 'string' },
              to: { type: 'string' },
              candidate: { type: 'object' },
            },
          },
        },
      },
      async (request, reply) => {
        const { sessionId } = request.params as { sessionId: string };
        const candidateData = request.body as any;

        try {
          await this.handleICECandidate(sessionId, candidateData);
          reply.send({ success: true });
        } catch (error) {
          reply.status(500).send({ error: 'Failed to handle ICE candidate' });
        }
      }
    );

    // Métricas real-time
    this.server.get(
      '/admin/collaboration/metrics',
      {
        schema: {
          description: 'Obter métricas de colaboração',
          tags: ['admin', 'collaboration'],
        },
      },
      async (request, reply) => {
        const metrics = await this.getRealTimeMetrics();
        reply.send(metrics);
      }
    );

    // Cursor position
    this.server.post(
      '/collaboration/sessions/:id/cursor',
      {
        schema: {
          description: 'Atualizar posição do cursor',
          tags: ['collaboration'],
          params: {
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
          },
          body: {
            type: 'object',
            required: ['userId', 'x', 'y'],
            properties: {
              userId: { type: 'string' },
              x: { type: 'number' },
              y: { type: 'number' },
              selection: {
                type: 'object',
                properties: {
                  start: { type: 'number' },
                  end: { type: 'number' },
                },
              },
            },
          },
        },
      },
      async (request, reply) => {
        const { id } = request.params as { id: string };
        const cursorData = request.body as any;

        try {
          await this.updateCursorPosition(id, cursorData);
          reply.send({ success: true });
        } catch (error) {
          reply.status(500).send({ error: 'Failed to update cursor position' });
        }
      }
    );
  }

  /**
   * Criar sessão de colaboração
   */
  private async createCollaborationSession(sessionData: any): Promise<CollaborationSession> {
    const id = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const session: CollaborationSession = {
      id,
      name: sessionData.name,
      type: sessionData.type,
      ownerId: sessionData.ownerId,
      tenantId: sessionData.tenantId,
      participants: [],
      status: 'active',
      settings: {
        maxParticipants: sessionData.settings?.maxParticipants || 10,
        allowAnonymous: sessionData.settings?.allowAnonymous || false,
        requireApproval: sessionData.settings?.requireApproval || false,
        autoSave: sessionData.settings?.autoSave || true,
        autoSaveInterval: sessionData.settings?.autoSaveInterval || 30,
        versionHistory: sessionData.settings?.versionHistory || true,
        chatEnabled: sessionData.settings?.chatEnabled || true,
        screenShareEnabled: sessionData.settings?.screenShareEnabled || true,
        voiceEnabled: sessionData.settings?.voiceEnabled || true,
        videoEnabled: sessionData.settings?.videoEnabled || true,
        recordingEnabled: sessionData.settings?.recordingEnabled || false,
        permissions: {
          canEdit: [sessionData.ownerId],
          canComment: [sessionData.ownerId],
          canShare: [sessionData.ownerId],
          canDelete: [sessionData.ownerId],
        },
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      lastActivity: new Date(),
      metadata: sessionData.metadata || {},
    };

    this.sessions.set(id, session);

    // Criar estado inicial do documento
    await this.createInitialDocumentState(id);

    logger.info('Collaboration session created', { id, name: sessionData.name });
    return session;
  }

  /**
   * Listar sessões de colaboração
   */
  private async listCollaborationSessions(filters: any): Promise<CollaborationSession[]> {
    let sessions = Array.from(this.sessions.values());

    if (filters.tenantId) {
      sessions = sessions.filter((s) => s.tenantId === filters.tenantId);
    }

    if (filters.ownerId) {
      sessions = sessions.filter((s) => s.ownerId === filters.ownerId);
    }

    if (filters.status) {
      sessions = sessions.filter((s) => s.status === filters.status);
    }

    return sessions;
  }

  /**
   * Participar de sessão de colaboração
   */
  private async joinCollaborationSession(
    sessionId: string,
    participantData: any
  ): Promise<CollaborationSession> {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // Verificar limite de participantes
    if (session.participants.length >= session.settings.maxParticipants) {
      throw new Error('Session is full');
    }

    // Verificar se participante já existe
    const existingParticipant = session.participants.find(
      (p) => p.userId === participantData.userId
    );
    if (existingParticipant) {
      existingParticipant.status = 'online';
      existingParticipant.lastSeen = new Date();
      return session;
    }

    const participant: Participant = {
      id: `participant_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId: participantData.userId,
      name: participantData.name,
      email: participantData.email,
      role: participantData.role || 'viewer',
      status: 'online',
      joinedAt: new Date(),
      lastSeen: new Date(),
      permissions: this.getPermissionsForRole(participantData.role || 'viewer'),
      metadata: {},
    };

    session.participants.push(participant);
    session.updatedAt = new Date();
    session.lastActivity = new Date();

    // Notificar outros participantes
    await this.broadcastToSession(sessionId, {
      type: 'participant_joined',
      data: participant,
    });

    logger.info('Participant joined session', { sessionId, userId: participantData.userId });
    return session;
  }

  /**
   * Sair de sessão de colaboração
   */
  private async leaveCollaborationSession(
    sessionId: string,
    userId: string
  ): Promise<CollaborationSession> {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const participantIndex = session.participants.findIndex((p) => p.userId === userId);
    if (participantIndex === -1) {
      throw new Error(`Participant not found: ${userId}`);
    }

    const participant = session.participants[participantIndex];
    session.participants.splice(participantIndex, 1);
    session.updatedAt = new Date();
    session.lastActivity = new Date();

    // Notificar outros participantes
    await this.broadcastToSession(sessionId, {
      type: 'participant_left',
      data: {
        userId,
        name: participant.name,
      },
    });

    logger.info('Participant left session', { sessionId, userId });
    return session;
  }

  /**
   * Aplicar operação de documento
   */
  private async applyDocumentOperation(sessionId: string, operationData: any): Promise<any> {
    const document = this.documentStates.get(sessionId);

    if (!document) {
      throw new Error(`Document not found: ${sessionId}`);
    }

    const operation: DocumentOperation = {
      id: `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: operationData.type,
      position: operationData.position,
      content: operationData.content,
      length: operationData.length,
      attributes: operationData.attributes,
      authorId: operationData.authorId,
      timestamp: new Date(),
      applied: false,
    };

    // Aplicar operação ao documento
    await this.applyOperationToDocument(document, operation);

    // Adicionar operação ao histórico
    document.operations.push(operation);
    document.version++;
    document.updatedAt = new Date();

    // Broadcast da operação para outros participantes
    await this.broadcastToSession(sessionId, {
      type: 'document_operation',
      data: operation,
    });

    // Auto-save se configurado
    const session = this.sessions.get(sessionId);
    if (session?.settings.autoSave) {
      await this.autoSaveDocument(sessionId);
    }

    logger.info('Document operation applied', { sessionId, operationId: operation.id });
    return { success: true, operation };
  }

  /**
   * Obter estado do documento
   */
  private async getDocumentState(sessionId: string, version?: number): Promise<DocumentState> {
    const document = this.documentStates.get(sessionId);

    if (!document) {
      throw new Error(`Document not found: ${sessionId}`);
    }

    if (version && version !== document.version) {
      // Retornar versão específica do histórico
      return await this.getDocumentVersion(sessionId, version);
    }

    return document;
  }

  /**
   * Enviar mensagem de chat
   */
  private async sendChatMessage(sessionId: string, messageData: any): Promise<ChatMessage> {
    const message: ChatMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      sessionId,
      authorId: messageData.authorId,
      authorName: messageData.authorName,
      content: messageData.content,
      type: messageData.type || 'text',
      timestamp: new Date(),
      reactions: [],
      replyTo: messageData.replyTo,
      attachments: messageData.attachments || [],
      metadata: messageData.metadata || {},
    };

    // Adicionar mensagem ao chat da sessão
    if (!this.chatMessages.has(sessionId)) {
      this.chatMessages.set(sessionId, []);
    }
    this.chatMessages.get(sessionId)!.push(message);

    // Broadcast da mensagem
    await this.broadcastToSession(sessionId, {
      type: 'chat_message',
      data: message,
    });

    logger.info('Chat message sent', { sessionId, messageId: message.id });
    return message;
  }

  /**
   * Obter mensagens de chat
   */
  private async getChatMessages(sessionId: string, options: any): Promise<ChatMessage[]> {
    const messages = this.chatMessages.get(sessionId) || [];

    let filteredMessages = messages;

    if (options.since) {
      const sinceDate = new Date(options.since);
      filteredMessages = filteredMessages.filter((m) => m.timestamp >= sinceDate);
    }

    // Ordenar por timestamp (mais recentes primeiro)
    filteredMessages.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    // Aplicar paginação
    const start = options.offset || 0;
    const end = start + (options.limit || 50);

    return filteredMessages.slice(start, end);
  }

  /**
   * Criar canal de voz
   */
  private async createVoiceChannel(sessionId: string, channelData: any): Promise<VoiceChannel> {
    const id = `voice_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const channel: VoiceChannel = {
      id,
      sessionId,
      name: channelData.name,
      type: channelData.type,
      participants: [],
      status: 'active',
      settings: {
        maxParticipants: channelData.settings?.maxParticipants || 10,
        allowRecording: channelData.settings?.allowRecording || false,
        requireModerator: channelData.settings?.requireModerator || false,
        autoMute: channelData.settings?.autoMute || false,
        noiseSuppression: channelData.settings?.noiseSuppression || true,
        echoCancellation: channelData.settings?.echoCancellation || true,
        quality: channelData.settings?.quality || 'medium',
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.voiceChannels.set(id, channel);

    // Notificar sessão sobre novo canal
    await this.broadcastToSession(sessionId, {
      type: 'voice_channel_created',
      data: channel,
    });

    logger.info('Voice channel created', { channelId: id, sessionId });
    return channel;
  }

  /**
   * Handle WebRTC offer
   */
  private async handleWebRTCOffer(sessionId: string, offerData: any): Promise<void> {
    // Forward offer to target participant
    await this.sendToParticipant(sessionId, offerData.to, {
      type: 'webrtc_offer',
      data: {
        from: offerData.from,
        offer: offerData.offer,
      },
    });

    logger.debug('WebRTC offer forwarded', { sessionId, from: offerData.from, to: offerData.to });
  }

  /**
   * Handle WebRTC answer
   */
  private async handleWebRTCAnswer(sessionId: string, answerData: any): Promise<void> {
    // Forward answer to target participant
    await this.sendToParticipant(sessionId, answerData.to, {
      type: 'webrtc_answer',
      data: {
        from: answerData.from,
        answer: answerData.answer,
      },
    });

    logger.debug('WebRTC answer forwarded', {
      sessionId,
      from: answerData.from,
      to: answerData.to,
    });
  }

  /**
   * Handle ICE candidate
   */
  private async handleICECandidate(sessionId: string, candidateData: any): Promise<void> {
    // Forward ICE candidate to target participant
    await this.sendToParticipant(sessionId, candidateData.to, {
      type: 'ice_candidate',
      data: {
        from: candidateData.from,
        candidate: candidateData.candidate,
      },
    });

    logger.debug('ICE candidate forwarded', {
      sessionId,
      from: candidateData.from,
      to: candidateData.to,
    });
  }

  /**
   * Atualizar posição do cursor
   */
  private async updateCursorPosition(sessionId: string, cursorData: any): Promise<void> {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const participant = session.participants.find((p) => p.userId === cursorData.userId);
    if (!participant) {
      throw new Error(`Participant not found: ${cursorData.userId}`);
    }

    participant.cursor = {
      x: cursorData.x,
      y: cursorData.y,
      selection: cursorData.selection,
      timestamp: new Date(),
    };

    // Broadcast da posição do cursor para outros participantes
    await this.broadcastToSession(
      sessionId,
      {
        type: 'cursor_update',
        data: {
          userId: cursorData.userId,
          cursor: participant.cursor,
        },
      },
      cursorData.userId
    ); // Excluir o próprio usuário

    logger.debug('Cursor position updated', { sessionId, userId: cursorData.userId });
  }

  /**
   * Obter métricas real-time
   */
  private async getRealTimeMetrics(): Promise<RealTimeMetrics> {
    const sessions = Array.from(this.sessions.values());
    const documents = Array.from(this.documentStates.values());
    const voiceChannels = Array.from(this.voiceChannels.values());
    const allChatMessages = Array.from(this.chatMessages.values()).flat();

    const allParticipants = sessions.flatMap((s) => s.participants);

    return {
      sessions: {
        total: sessions.length,
        active: sessions.filter((s) => s.status === 'active').length,
        inactive: sessions.filter((s) => s.status === 'inactive').length,
        archived: sessions.filter((s) => s.status === 'archived').length,
      },
      participants: {
        total: allParticipants.length,
        online: allParticipants.filter((p) => p.status === 'online').length,
        offline: allParticipants.filter((p) => p.status === 'offline').length,
        away: allParticipants.filter((p) => p.status === 'away').length,
      },
      documents: {
        total: documents.length,
        totalVersions: documents.reduce((sum, d) => sum + d.version, 0),
        totalOperations: documents.reduce((sum, d) => sum + d.operations.length, 0),
        averageSize:
          documents.reduce((sum, d) => sum + d.content.length, 0) / documents.length || 0,
      },
      chat: {
        totalMessages: allChatMessages.length,
        messagesPerHour: this.calculateMessagesPerHour(allChatMessages),
        activeChannels: this.chatMessages.size,
      },
      voice: {
        activeChannels: voiceChannels.filter((c) => c.status === 'active').length,
        totalParticipants: voiceChannels.reduce((sum, c) => sum + c.participants.length, 0),
        averageQuality: this.calculateAverageVoiceQuality(voiceChannels),
        totalMinutes: this.calculateTotalVoiceMinutes(voiceChannels),
      },
      performance: {
        averageLatency: this.calculateAverageLatency(),
        messageDeliveryRate: this.calculateMessageDeliveryRate(),
        connectionSuccessRate: this.calculateConnectionSuccessRate(),
        errorRate: this.calculateErrorRate(),
      },
    };
  }

  /**
   * Inicializar WebRTC
   */
  private initializeWebRTC(): void {
    logger.info('Initializing WebRTC service');

    // Configurar STUN/TURN servers
    const iceServers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ];

    // Implementar configuração WebRTC
  }

  /**
   * Inicializar WebSockets
   */
  private initializeWebSockets(): void {
    logger.info('Initializing WebSocket service');

    // Implementar servidor WebSocket
  }

  /**
   * Iniciar monitoramento real-time
   */
  private startRealTimeMonitoring(): void {
    logger.info('Starting real-time monitoring');

    // Monitorar sessões ativas
    setInterval(async () => {
      await this.monitorActiveSessions();
    }, 30000); // A cada 30 segundos

    // Limpar sessões inativas
    setInterval(async () => {
      await this.cleanupInactiveSessions();
    }, 300000); // A cada 5 minutos

    // Monitorar qualidade de conexão
    setInterval(async () => {
      await this.monitorConnectionQuality();
    }, 60000); // A cada minuto
  }

  /**
   * Utilitários
   */
  private async createInitialDocumentState(sessionId: string): Promise<void> {
    const document: DocumentState = {
      id: `doc_${sessionId}`,
      sessionId,
      version: 1,
      content: '',
      operations: [],
      checksum: this.calculateChecksum(''),
      createdAt: new Date(),
      updatedAt: new Date(),
      authorId: '',
      metadata: {},
    };

    this.documentStates.set(sessionId, document);
  }

  private getPermissionsForRole(role: string): string[] {
    const permissions = {
      owner: ['edit', 'comment', 'share', 'delete', 'moderate'],
      editor: ['edit', 'comment'],
      viewer: ['comment'],
      presenter: ['edit', 'comment', 'share'],
    };

    return permissions[role as keyof typeof permissions] || [];
  }

  private async applyOperationToDocument(
    document: DocumentState,
    operation: DocumentOperation
  ): Promise<void> {
    switch (operation.type) {
      case 'insert':
        document.content =
          document.content.slice(0, operation.position) +
          (operation.content || '') +
          document.content.slice(operation.position);
        break;

      case 'delete':
        document.content =
          document.content.slice(0, operation.position) +
          document.content.slice(operation.position + (operation.length || 0));
        break;

      case 'retain':
        // Operação retain não modifica o conteúdo
        break;

      case 'format':
        // Aplicar formatação (implementar conforme necessário)
        break;
    }

    document.checksum = this.calculateChecksum(document.content);
    operation.applied = true;
  }

  private calculateChecksum(content: string): string {
    // Implementar cálculo de checksum (simplificado)
    return Buffer.from(content).toString('base64').slice(0, 16);
  }

  private async broadcastToSession(
    sessionId: string,
    message: any,
    excludeUserId?: string
  ): Promise<void> {
    const session = this.sessions.get(sessionId);

    if (!session) return;

    for (const participant of session.participants) {
      if (excludeUserId && participant.userId === excludeUserId) continue;

      await this.sendToParticipant(sessionId, participant.userId, message);
    }
  }

  private async sendToParticipant(sessionId: string, userId: string, message: any): Promise<void> {
    // Implementar envio de mensagem para participante específico
    // via WebSocket ou WebRTC
  }

  private async autoSaveDocument(sessionId: string): Promise<void> {
    // Implementar auto-salvamento de documento
  }

  private async getDocumentVersion(sessionId: string, version: number): Promise<DocumentState> {
    // Implementar recuperação de versão específica
    throw new Error('Version history not implemented');
  }

  private calculateMessagesPerHour(messages: ChatMessage[]): number {
    if (messages.length === 0) return 0;

    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    const recentMessages = messages.filter((m) => m.timestamp >= oneHourAgo);
    return recentMessages.length;
  }

  private calculateAverageVoiceQuality(channels: VoiceChannel[]): number {
    if (channels.length === 0) return 0;

    const qualityScores = {
      poor: 1,
      fair: 2,
      good: 3,
      excellent: 4,
    };

    const participants = channels.flatMap((c) => c.participants);
    const totalScore = participants.reduce((sum, p) => {
      return sum + (qualityScores[p.connectionQuality as keyof typeof qualityScores] || 0);
    }, 0);

    return totalScore / participants.length || 0;
  }

  private calculateTotalVoiceMinutes(channels: VoiceChannel[]): number {
    // Implementar cálculo de minutos totais
    return 0;
  }

  private calculateAverageLatency(): number {
    // Implementar cálculo de latência média
    return 50; // ms simulado
  }

  private calculateMessageDeliveryRate(): number {
    // Implementar cálculo de taxa de entrega
    return 0.95; // 95% simulado
  }

  private calculateConnectionSuccessRate(): number {
    // Implementar cálculo de taxa de sucesso
    return 0.98; // 98% simulado
  }

  private calculateErrorRate(): number {
    // Implementar cálculo de taxa de erro
    return 0.02; // 2% simulado
  }

  private async monitorActiveSessions(): Promise<void> {
    // Implementar monitoramento de sessões ativas
  }

  private async cleanupInactiveSessions(): Promise<void> {
    const now = new Date();
    const inactiveThreshold = 30 * 60 * 1000; // 30 minutos

    for (const [sessionId, session] of this.sessions) {
      const timeSinceLastActivity = now.getTime() - session.lastActivity.getTime();

      if (timeSinceLastActivity > inactiveThreshold && session.status === 'active') {
        session.status = 'inactive';
        session.updatedAt = now;

        logger.info('Session marked as inactive', { sessionId });
      }
    }
  }

  private async monitorConnectionQuality(): Promise<void> {
    // Implementar monitoramento de qualidade de conexão
  }

  private isWebRTCRequest(request: any): boolean {
    return request.url.includes('/webrtc/');
  }

  private isCollaborationRequest(request: any): boolean {
    return request.url.includes('/collaboration/');
  }

  private async validateWebRTCRequest(request: any, reply: any): Promise<void> {
    // Implementar validação de requisições WebRTC
  }

  private async handleWebSocketUpgrade(request: any, reply: any): Promise<void> {
    // Implementar upgrade de WebSocket
  }

  private async updatePresence(request: any): Promise<void> {
    // Implementar atualização de presença
  }
}

// Singleton instance
let realTimeServiceInstance: RealTimeService | null = null;

export function getRealTimeService(server?: FastifyInstance): RealTimeService {
  if (!realTimeServiceInstance && server) {
    realTimeServiceInstance = new RealTimeService(server);
  }

  if (!realTimeServiceInstance) {
    throw new Error('RealTimeService not initialized. Call getRealTimeService(server) first.');
  }

  return realTimeServiceInstance;
}
