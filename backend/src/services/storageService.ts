import mongoose from 'mongoose';
import fs from 'fs';
import { DocumentModel, inMemoryDocumentStore, IDocumentRecord } from '../models/Document.js';
import { documentChunkStore } from '../models/DocumentChunk.js';

class StorageService {
  public isConnectedToMongo(): boolean {
    return mongoose.connection.readyState === 1;
  }

  async save(record: IDocumentRecord): Promise<IDocumentRecord> {
    if (this.isConnectedToMongo()) {
      try {
        await DocumentModel.findOneAndUpdate(
          { id: record.id },
          record,
          { upsert: true, new: true }
        );
      } catch (err) {
        console.warn('MongoDB save failed, updating in-memory cache:', err);
      }
    }
    return inMemoryDocumentStore.save(record);
  }

  async getById(id: string): Promise<IDocumentRecord | null> {
    if (this.isConnectedToMongo()) {
      try {
        const doc = await DocumentModel.findOne({ id }).lean();
        if (doc) return doc as unknown as IDocumentRecord;
      } catch (err) {
        console.warn('MongoDB getById failed, fallback to in-memory:', err);
      }
    }
    return inMemoryDocumentStore.findById(id);
  }

  async list(filter?: { search?: string; caseType?: string; status?: string }): Promise<IDocumentRecord[]> {
    let list: IDocumentRecord[] = [];
    if (this.isConnectedToMongo()) {
      try {
        const query: Record<string, any> = {};
        if (filter?.status && filter.status !== 'all') {
          query.status = filter.status;
        }
        if (filter?.caseType && filter.caseType !== 'all') {
          query['analysis.caseClassification.primary'] = filter.caseType;
        }
        if (filter?.search) {
          query.$or = [
            { originalName: { $regex: filter.search, $options: 'i' } },
            { 'analysis.documentMetadata.title': { $regex: filter.search, $options: 'i' } },
            { 'analysis.documentMetadata.court': { $regex: filter.search, $options: 'i' } },
            { 'analysis.documentMetadata.caseNumber': { $regex: filter.search, $options: 'i' } },
            { 'analysis.parties.name': { $regex: filter.search, $options: 'i' } },
          ];
        }
        const docs = await DocumentModel.find(query).sort({ createdAt: -1 }).lean();
        list = docs as unknown as IDocumentRecord[];
      } catch (err) {
        console.warn('MongoDB list failed, fallback to in-memory:', err);
        list = await inMemoryDocumentStore.findAll();
      }
    } else {
      list = await inMemoryDocumentStore.findAll();
    }

    // Client-side/in-memory filtering if fallback used or additional filter needed
    if (!this.isConnectedToMongo() && filter) {
      if (filter.status && filter.status !== 'all') {
        list = list.filter((d) => d.status === filter.status);
      }
      if (filter.caseType && filter.caseType !== 'all') {
        list = list.filter((d) => d.analysis?.caseClassification?.primary === filter.caseType);
      }
      if (filter.search) {
        const q = filter.search.toLowerCase();
        list = list.filter(
          (d) =>
            d.originalName.toLowerCase().includes(q) ||
            d.analysis?.documentMetadata?.title?.toLowerCase().includes(q) ||
            d.analysis?.documentMetadata?.court?.toLowerCase().includes(q) ||
            d.analysis?.documentMetadata?.caseNumber?.toLowerCase().includes(q) ||
            d.analysis?.parties?.some((p) => p.name?.toLowerCase().includes(q))
        );
      }
    }

    return list;
  }

  async delete(id: string): Promise<boolean> {
    const doc = await this.getById(id);
    if (!doc) return false;

    // Remove file from disk safely
    if (doc.filePath && fs.existsSync(doc.filePath)) {
      try {
        fs.unlinkSync(doc.filePath);
      } catch (err) {
        console.warn(`Could not unlink file ${doc.filePath}:`, err);
      }
    }

    // Remove the document's search index (RAG chunks and embeddings) too.
    await documentChunkStore.deleteForDocument(id);

    if (this.isConnectedToMongo()) {
      try {
        await DocumentModel.deleteOne({ id });
      } catch (err) {
        console.warn('MongoDB delete failed:', err);
      }
    }
    return inMemoryDocumentStore.deleteById(id);
  }

  /**
   * Analyses run inside the request; if the server stops or restarts mid-way (e.g. `tsx watch` reloading),
   * the record would stay 'analyzing' forever. Reset such records so they can be analysed again.
   */
  async resetInterruptedAnalyses(): Promise<number> {
    const stuck = (await this.list()).filter((d) => d.status === 'analyzing');
    for (const doc of stuck) {
      doc.status = 'extracted';
      doc.errorMessage = 'The previous analysis was interrupted because the server restarted. It will run again when you open the document.';
      await this.save(doc);
    }
    return stuck.length;
  }

  async getDashboardStats() {
    const all = await this.list();
    const total = all.length;
    const analyzed = all.filter((d) => d.status === 'analyzed').length;
    const pending = all.filter((d) => d.status === 'uploaded' || d.status === 'extracting' || d.status === 'analyzing').length;
    const errors = all.filter((d) => d.status === 'error').length;

    // Case type distribution
    const caseTypeCounts: Record<string, number> = {};
    for (const d of all) {
      if (d.analysis?.caseClassification?.primary) {
        const type = d.analysis.caseClassification.primary;
        caseTypeCounts[type] = (caseTypeCounts[type] || 0) + 1;
      }
    }

    const distribution = Object.entries(caseTypeCounts).map(([type, count]) => ({
      type,
      count,
    }));

    return {
      total,
      analyzed,
      pending,
      errors,
      distribution,
      recent: all.slice(0, 5),
      databaseType: this.isConnectedToMongo() ? 'MongoDB' : 'In-Memory Fallback',
    };
  }
}

export const storageService = new StorageService();
