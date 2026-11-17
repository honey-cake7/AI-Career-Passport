import mongoose from 'mongoose';
import { recoverPendingDeletions } from '../../src/services/accountDeletion.js';

// Only the disposable integration fixture can start this helper. Never read the
// application's MONGODB_URI, even when a developer has a real .env file.
const uri = process.env.TEST_DELETION_MONGO_URI ?? '';
if (!/^mongodb:\/\/127\.0\.0\.1:\d+\//.test(uri)) throw new Error('Disposable loopback Mongo URI required');
try {
  await mongoose.connect(uri, { dbName: 'account_deletion_isolated_test', serverSelectionTimeoutMS: 2000 });
  await recoverPendingDeletions();
} finally { await mongoose.disconnect(); }
