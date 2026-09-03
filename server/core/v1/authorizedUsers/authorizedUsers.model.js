import mongoose from 'mongoose';
import { encrypt, decrypt } from "../../../utils/cryptoUtils.js";
import authorizedChannelsModel from "../cameraRestrictions/authorizedChannels.model.js";

function escapeRegex(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildCaseInsensitiveLocationIn(values = []) {
  const normalized = [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value || "").trim())
      .filter(Boolean)
  )];

  if (!normalized.length) return { $in: [] };
  return {
    $in: normalized.map((value) => new RegExp(`^${escapeRegex(value)}$`, "i")),
  };
}

const authorizedUsersSchema = new mongoose.Schema({
  orgId: { type: Number, default: null },
  emp_id: { type: Number, default: null },
  shiftId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shift', default: null },
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    required: true,
  },
  firstName: {
    type: String,
  },
  lastName: {
    type: String,
  },
  userName: {
    type: String,
    default: null
  },
  email: {
    type: String,
  },
  designation: {
    type: String,
    default: null
  },
  empRoleId: {
    type: Number,
    default: null
  },
  branch: {
    type: String,
    default: null
  },
  // roleIds: 
  //   {
  //     type: mongoose.Schema.Types.ObjectId,
  //     ref: 'role', // make sure this matches your roles collection
  //     required: true,
  //   }
  // ,
  permission: { type: String, default: 'Read', ref: 'permissionSchema' },
  departmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department', // make sure this matches your roles collection
    required: false,
  },
  location: {
    type: String,
    default: 'default'
  },
  locationId: {
    type: Number,
    default: null
  },
  phoneNumber: {
    type: String,
    default: null
  },
  address1: {
    type: String,
    default: null
  },
  timezone: {
    type: String,
    default: null
  },
  password: {
    type: String,
    default: null
  },
  verified: {
    type: Boolean,
    default: true,
  },
  status: {
    type: String,
    enum: ['active', 'suspended'],
    default: 'active',
  },
  profilePics: {
    type: [String],
    default: [],
    validate: {
      validator: function (arr) {
        // allow empty array, but if not empty -> all elements must be strings
        return Array.isArray(arr) && arr.every(url => typeof url === "string");
      },
      message: "profilePics must be an array of URL strings.",
    },
  },
  numberPlate: {
    type: String,
    default: null
  },
  vehicleNumber: {
    type: String,
    default: null
  },
  tag: {
    type: Boolean,
    default: false
  },
  liveDemoData: { type: Boolean, default: false }
  // password: {type: String, required: true},
}, {
  timestamps: true,
});

authorizedUsersSchema.index(
  { adminId: 1, email: 1 },
  { unique: true, partialFilterExpression: { email: { $exists: true, $gt: '' } } }
);
authorizedUsersSchema.index({ adminId: 1, status: 1 });
// Vehicle-number tagging resolves the owner of every detected plate on each
// ANPR/incident page load, so that lookup has to stay on an index.
authorizedUsersSchema.index({ adminId: 1, vehicleNumber: 1 });

// Encrypt password before save
authorizedUsersSchema.pre("save", function (next) {
  if (this.isModified("password") && this.password) {
    this.password = encrypt(this.password);
  }
  next();
});

// Add a method to decrypt password when needed
authorizedUsersSchema.methods.getDecryptedPassword = function () {
  return decrypt(this.password);
};

authorizedUsersSchema.pre(/^find|countDocuments/, async function () {
  const memberId = this.options?.memberId;

  // No member → allow full access
  if (!memberId) return;

  // Fetch allowed locations for the member
  const authorized = await authorizedChannelsModel.findOne({
    userId: memberId,
  });

  if (!authorized) return;

  const allowedLocations = authorized.employeeLocations; // ensure correct field


  // If allowed list empty → block all results
  if (!Array.isArray(allowedLocations) || allowedLocations.length === 0) {
    this.where({ _id: { $in: [] } });
    return;
  }

  const existingQuery = this.getQuery();

  // --- MERGE EXISTING QUERY WITH AUTHORIZATION FILTER ---
  this.where({
    $and: [existingQuery, { location: buildCaseInsensitiveLocationIn(allowedLocations) }],
  });
});

export default mongoose.model('authorizedUsers', authorizedUsersSchema);
