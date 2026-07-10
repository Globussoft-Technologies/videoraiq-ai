import mongoose from "mongoose";
const autoReportSchema = new mongoose.Schema({
    reportsTitle: { type: String, required: true },
    adminId: {     
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Admin',
        required: false, 
    },
    userId: { 
        type: mongoose.Schema.Types.ObjectId,
        ref: 'users',
        required: false, 
    },
    frequency: [
        {
            Daily: { type: Number },
            Weekly: { type: Number },
            Monthly: { type: Number },
            Time: { type: String , default: '00:00'},
            Date: {
                startDate: { type: Date },
                endDate: { type: Date }
            }
        }
    ],
    Recipients: [{ type: String }],
    Content: [{
        consolidatedReport: { type: Number },
        task: { type: Number },
        clients: { type: Number },
        leaves: { type: Number },
        tags: { type: Number },
        role: { type: Number }
    }],
    ReportsType: [{
        pdf: { type: Number },
        csv: { type: Number }
    }],
    filter: {
        wholeOrganization: { type: Number },
        specificEmployees: [
            {
                id: { type: String }
            }]
    },
    sendTestMail: { type: Boolean }
},
{ timestamps: true });
export default mongoose.model('autoEmailReportSchema', autoReportSchema);