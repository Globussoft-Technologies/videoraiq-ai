import mongoose from 'mongoose'

const roleSchema = new mongoose.Schema({
    adminId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true ,ref:'admins'},
    orgId:{type: String, required:false, default:null},
    roleName:{type: String, required:true },
    empRoleId:{type:Number, default:null},
    isEmpRole:{type:Boolean,default:false},
    softDelete:{type:Boolean,default:false},
    view: { type: Boolean, default: false },
    create: { type: Boolean, default: false },
    edit: { type: Boolean, default: false },
    delete: { type: Boolean, default: false },
    is_default: { type: Boolean, default: false, index: true },
    createdBy: {
        userId: { type: String, default: null },
    },
    updatedBy: {
        userId: { type: String, default: null },
    },
    permissionId: { type: mongoose.Schema.Types.ObjectId, index: true },
},{timestamps:true})

roleSchema.index({ createdAt: -1 }); // For sorting
roleSchema.index({ "createdBy.userId": 1 }); // Subfield indexing
export default mongoose.model('role',roleSchema)