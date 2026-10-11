import mongoose, { Schema } from 'mongoose';

/** One searchable piece of a judgment, with its embedding vector (used by "Ask the Judgment"). */
export interface IDocumentChunk {
  documentId: string;
  chunkIndex: number;
  pages: number[];
  text: string;
  textHash: string;
  embedding: number[];
  embeddingModel: string;
}

const DocumentChunkSchema = new Schema<IDocumentChunk>(
  {
    documentId: { type: String, required: true, index: true },
    chunkIndex: { type: Number, required: true },
    pages: { type: [Number], default: [] },
    text: { type: String, required: true },
    textHash: { type: String, required: true },
    embedding: { type: [Number], required: true },
    embeddingModel: { type: String, required: true },
  },
  { timestamps: true }
);
DocumentChunkSchema.index({ documentId: 1, chunkIndex: 1 }, { unique: true });

export const DocumentChunkModel = mongoose.model<IDocumentChunk>('DocumentChunk', DocumentChunkSchema);

const isMongoConnected = () => mongoose.connection.readyState === 1;

/** MongoDB when connected, otherwise an in-memory map (same pattern as the document store). */
class DocumentChunkStore {
  private memory = new Map<string, IDocumentChunk[]>();

  async getForDocument(documentId: string): Promise<IDocumentChunk[]> {
    if (isMongoConnected()) {
      try {
        const rows = await DocumentChunkModel.find({ documentId }).sort({ chunkIndex: 1 }).lean();
        return rows.map((r) => ({
          documentId: r.documentId,
          chunkIndex: r.chunkIndex,
          pages: r.pages,
          text: r.text,
          textHash: r.textHash,
          embedding: r.embedding,
          embeddingModel: r.embeddingModel,
        }));
      } catch (err) {
        console.warn('[DocumentChunkStore] MongoDB read failed, using in-memory chunks:', err);
      }
    }
    return this.memory.get(documentId) || [];
  }

  async replaceForDocument(documentId: string, chunks: IDocumentChunk[]): Promise<void> {
    this.memory.set(documentId, chunks);
    if (isMongoConnected()) {
      try {
        await DocumentChunkModel.deleteMany({ documentId });
        if (chunks.length) await DocumentChunkModel.insertMany(chunks, { ordered: false });
      } catch (err) {
        console.warn('[DocumentChunkStore] MongoDB write failed, chunks kept in memory only:', err);
      }
    }
  }

  async deleteForDocument(documentId: string): Promise<void> {
    this.memory.delete(documentId);
    if (isMongoConnected()) {
      try {
        await DocumentChunkModel.deleteMany({ documentId });
      } catch (err) {
        console.warn('[DocumentChunkStore] MongoDB delete failed:', err);
      }
    }
  }
}

export const documentChunkStore = new DocumentChunkStore();
