import mongoose from 'mongoose';

const superAdminSchema = new mongoose.Schema({
    name: { type: String, default: '' },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true }, // stored as salt:hash (scrypt)
    resetOTP: { type: String, default: null },
    otpExpireDate: { type: Date, default: null },
}, { timestamps: true });

export default mongoose.model('superAdmin', superAdminSchema);
