/**
 * Graph Edge Types and Interfaces
 */

export type EdgeType = 'call' | 'import' | 'test-of' | 'routes' | 'config-key';

export interface GraphEdge {
  sourceId: string;
  targetId: string;
  type: EdgeType;
  confidence: number;
  metadata: {
    extractor: string;
    lspMethod?: string;
    scipProtocol?: string;
    heuristicPattern?: string;
    timestamp: number;
  };
  weight?: number;
}

export interface ExtractionOptions {
  timeoutMs?: number;
  maxEdges?: number;
  includeMetadata?: boolean;
}

export interface EdgeExtractor {
  readonly id: string;
  extractEdges(spans: any[], options?: ExtractionOptions): Promise<GraphEdge[]>;
  getConfidence(): number;
  isSupported(): boolean;
}

export interface ExtractionResult {
  edges: GraphEdge[];
  extractorId: string;
  durationMs: number;
  error?: string;
}

export interface GraphBuilderOptions {
  extractors: string[];
  timeoutMs?: number;
  maxEdgesPerExtractor?: number;
  confidenceThreshold?: number;
}