import mongoose from 'mongoose';

const faceImagesSchema = new mongoose.Schema({
  dsId: { type: String, required: true, index: true },
  authorizedUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'authorizedUsers', default: null, index: true },
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  image: { type: String, required: true },
}, {
  timestamps: true,
});

export default mongoose.model('FaceImages', faceImagesSchema);
