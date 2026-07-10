import mongoose from "mongoose";
import authorizedChannelsModel from "../cameraRestrictions/authorizedChannels.model.js";
import authorizedUsersModel from "../authorizedUsers/authorizedUsers.model.js";

const departmentSchema = new mongoose.Schema(
  {
    orgId: {
      type: String,
      default:false
    },
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
    },
    departmentName: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true
    },
    empDepartmentId: {
      type: Number,
      default: null // maps to EMP department ID if available
    },
    isActive: {
      type: Boolean,
      default: true
    },
    isImportedFromEMP: {
      type: Boolean,
      default: false // by default not imported from EMP
    },
    softDelete: {
      type: Boolean,
      default: false // soft delete toggle
    }
  },
  { timestamps: true }
);

// Unique index for departmentName per org

departmentSchema.pre(/^find|countDocuments/, async function () {
  const userId = this.options.memberId;
  
  if (!userId) return;

  const authorized = await authorizedChannelsModel.findOne({ userId });
  
  if (!authorized) return;
  
  let allowed = authorized.departmentIds || [];
  const locations = authorized.locations || [];
  let employeeLocations = authorized.employeeLocations || [];
  
  //array of unique locations from both authorized and employee locations
  const uniqueLocations = [...new Set([...locations, ...employeeLocations])];

  if (uniqueLocations.length > 0) {
    const authUsers = await authorizedUsersModel.find({ location: { $in: uniqueLocations } }, "departmentId");
    const userDeptIds = authUsers.map(user => user.departmentId).filter(id => id);
    
    const combinedIds = [...allowed.map(id => id.toString()), ...userDeptIds.map(id => id.toString())];
    allowed = [...new Set(combinedIds)];
  }
  
  // If allowed list empty → block all results
  if (!Array.isArray(allowed) || allowed.length === 0) {
    this.where({ _id: { $in: [] } });
    return;
  }  
  
  const existingQuery = this.getQuery();
  // // ✅ ONLY this line — DO NOT use $and with getQuery()
  //merge existing query with authorization filter
  this.where({
    $and: [existingQuery, { _id: { $in: allowed } }],
  });
});


export default mongoose.model("Department", departmentSchema);
