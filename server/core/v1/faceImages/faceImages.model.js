import mongoose from 'mongoose';

const faceImagesSchema = new mongoose.Schema({
  dsId: { type: String, required: true, index: true },
  authorizedUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'authorizedUsers', default: null, index: true },
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  image: { type: String, required: true },
  // Mirrors OptimizedAccessLogs' own `tag` flag — Tagged Users surfaces a
  // dsId group here independently of whether any access-log entry exists for
  // this person, so this collection needs its own tag state rather than only
  // being inferred from authorizedUserId being set.
  tag: { type: Boolean, default: false },
  taggedAt: { type: Date, default: null },
}, {
  timestamps: true,
});

export default mongoose.model('FaceImages', faceImagesSchema);
