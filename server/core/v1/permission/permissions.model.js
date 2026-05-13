import mongoose from 'mongoose';

import { completeConfig, adminConfig, readConfig, writeConfig } from './permissions.config.js';
const permissionSchema = new mongoose.Schema({
    adminId: { type: mongoose.Schema.Types.ObjectId, required: true },
    permissionName: { type: String },
    permissionConfig: { type: Object },
    is_default: { type: Boolean, default: false },
    createdBy: {
        userId: { type: String },
    },

},
{ timestamps: true });

let permissionModel = mongoose.model('permissionSchema', permissionSchema);
export default permissionModel;

export const defaultPermission = [
    {
        orgId: '',
        permissionName: 'admin',
        is_default: true,
        permissionConfig: adminConfig,
    },
    {
        orgId: '',
        permissionName: 'write',
        is_default: true,
        permissionConfig: writeConfig,
    },
    {
        orgId: '',
        permissionName: 'read',
        is_default: true,
        permissionConfig: readConfig,
    },
];