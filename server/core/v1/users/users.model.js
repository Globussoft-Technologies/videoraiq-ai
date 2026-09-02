import mongoose from 'mongoose';
import { encrypt, decrypt } from "../../../utils/cryptoUtils.js";


const usersSchema = new mongoose.Schema({
  orgId:{type:Number,default:null},
  emp_id:{type:Number,default:null},
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    required: true,
  },
  userName: {
    type: String,
  },
  firstName: {
    type: String,
  },
  lastName: {
    type: String,
  },
  email: {
    type: String,
  },
  designation: {
    type: String,
    default:null
  },
  branch:{
    type:String,
    default:null
  },
  active: {
    type: Boolean,
    default: true,
  },
  roleIds:{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'role', // make sure this matches your roles collection
      required: true,
    },
  permission: { type: String, default: 'Read' ,ref: 'permissionSchema'},
  location:{
    type:String,
    default:'default'
  },
  phoneNumber:{
    type:String,
    default:null
  },
  vehicleNumber: {
    type: String,
    default: null
  },
  address1:{
    type:String,
    default:null
  },
  timezone:{
    type:String,
    default:null
  },
  password:{
    type:String,
    default:null
  },
  logsSound: { type: Boolean, default: false },
  // Guided-tour state for an authorized (sub) user — same contract as the
  // admin model's field. Rows predating it are backfilled to true at login
  // (users.service.js) so existing users don't suddenly get onboarded.
  onboarded: { type: Boolean, default: false },
  profilePics: {
    type: [String],
    required: false, // allow empty array
    default: [],     // default empty
    validate: {
      validator: function (arr) {
        // allow empty array, but if not empty -> all elements must be strings
        return Array.isArray(arr) && arr.every(url => typeof url === 'string');
      },
      message: 'profilePics must be an array of URL strings.',
    },
  },
  resetPasswordToken: { type: String, default: null },
  resetPasswordExpires: { type: Date, default: null },

}, {
  timestamps: true,
});

// Encrypt password before save
usersSchema.pre("save", function (next) {
  if (this.isModified("password")) {
    this.password = encrypt(this.password);
  }
  next();
});

// // ✅ For findByIdAndUpdate / findOneAndUpdate
// usersSchema.pre("findOneAndUpdate", function (next) {
//   const update = this.getUpdate();
//   encrypt(update);
//   next();
// });

// // ✅ For updateOne / updateMany
// usersSchema.pre(["updateOne", "updateMany"], function (next) {
//   const update = this.getUpdate();
//   encrypt(update);
//   next();
// });

// Add a method to decrypt password when needed
usersSchema.methods.getDecryptedPassword = function () {
  return decrypt(this.password);
};
usersSchema.index({ adminId: 1, email: 1 }, { unique: true });
export default mongoose.model('users', usersSchema);
