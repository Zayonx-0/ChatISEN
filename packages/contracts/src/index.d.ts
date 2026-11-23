export declare const CONTRACT_VERSION: 1;
export declare const http: Record<string, unknown>;
export declare const ws: Record<string, unknown>;
export declare const openapi: Record<string, unknown>;
export declare const schemas: { readonly http: Record<string, unknown>; readonly ws: Record<string, unknown> };
export declare const HTTP_STATUS: Readonly<Record<string, number>>;
export declare const ERROR_CODES: readonly string[];
export declare const WS_SERVER_TYPES: readonly string[];
export declare const WS_CLIENT_TYPES: readonly string[];
export declare function apiPath(path: `/${string}`): `/api/v1${string}`;

export type UUID = string;
export type Seq = string;
export type CallMode = 'audio' | 'video';
export type CallState = 'ringing' | 'active' | 'ended';
export type ConversationType = 'direct' | 'group';
export type MemberRole = 'owner' | 'member';

export interface ApiError { code: string; message: string; requestId: UUID }
export interface UserPublic { id: UUID; handle: string; displayName: string }
export interface AttachmentDescriptor { id: UUID; fileName: string; mediaType: string; size: number; sha256: string }
export interface Message { id: UUID; conversationId: UUID; seq: Seq; senderId: UUID; clientId: UUID; text?: string; attachment?: AttachmentDescriptor; createdAt: string }
export interface ConversationEvent { v: 1; type: 'event'; conversationId: UUID; seq: Seq; at: string; event: string; data: Record<string, unknown> }
export interface CallSummary { id: UUID; conversationId: UUID; initiatorId: UUID; mode: CallMode; state: CallState; roomName: string; createdAt: string; endedAt?: string }
export interface QualitySample { capturedAt: string; packetsReceived: number; packetsLost: number; jitterMs: number; rttMs: number; bitrateKbps: number; trackPresent: boolean }
