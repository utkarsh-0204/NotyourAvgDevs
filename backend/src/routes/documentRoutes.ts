import { Router } from 'express';
import { DocumentController } from '../controllers/documentController.js';
import { uploadMiddleware } from '../middleware/upload.js';

const router = Router();

// Upload & Text Extraction
router.post('/upload', uploadMiddleware.single('file'), DocumentController.uploadDocument);

// Run Legal Analysis
router.post('/:id/analyze', DocumentController.analyzeDocument);

// Follow-up questions grounded in the document's own passages
router.post('/:id/ask', DocumentController.askQuestion);

// Document Records
router.get('/', DocumentController.listDocuments);
router.get('/:id', DocumentController.getDocument);
router.get('/:id/analysis', DocumentController.getDocumentAnalysis);
router.get('/:id/download', DocumentController.downloadDocument);
router.get('/:id/export', DocumentController.downloadAnalysisExport);
router.delete('/:id', DocumentController.deleteDocument);

export default router;
