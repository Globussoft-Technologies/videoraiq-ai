import Response from '../../../utils/response.js';
import moment from 'moment';
import config from 'config';
import adminSchema from './../admin/admin.model.js';
import autoEmailReportValidation from './autoEmailReport.validation.js';
import autoReportModule from './autoEmailReport.model.js';
import { ObjectId } from 'mongodb';
import usersModel from '../users/users.model.js';

class autoEmailReportService {

    async createAutoEmailReport(req, res) {
        const result = req?.verified;
            try {
                const data = req.body;
                const { adminId ,memberId} = result.userData;
                
                if(!memberId){
                    const isAdminDataExist = await adminSchema.findById(adminId);
                    
                    if (!isAdminDataExist) return res.send(Response.FailResp("Validation Failed",`Admin does not exist.`));
                }else{
                    const isUserExist = await usersModel.findOne({_id:memberId});
                    if (!isUserExist) return res.send(Response.FailResp("Validation Failed",`User does not exist.`));
                }

                const { value, error } = autoEmailReportValidation.sendReport(data);
                if (error) {
                    return res.send(Response.FailResp("Validation Failed", error.message));
                }

                if(!memberId){
                    const isAdminDataExist = await adminSchema.findById(adminId);
                    if (!isAdminDataExist) return res.send(Response.FailResp("Validation Failed",`Admin does not exist.`));
                    data.adminId = adminId;
                }else{
                    const isUserExist = await usersModel.findOne({_id:memberId});
                    if (!isUserExist) return res.send(Response.FailResp("Validation Failed",`User does not exist.`));
                    data.userId = memberId;
                }
                

                const findReport = await autoReportModule.findOne({ reportsTitle: data.reportsTitle });
                if (findReport) return res.send(Response.FailResp("This title with report already present."));

                if (!Array.isArray(data.Recipients) || data.Recipients.length <= 0) {
                    return res.send(Response.FailResp("Minimum one user required."));
                }

                if (!Array.isArray(data.Content) || data.Content.length <= 0) {
                    return res.send(Response.FailResp("Minimum one Content required."));
                }

                if (!data.filter || Object.keys(data.filter).length <= 0) {
                    return res.send(Response.FailResp("Minimum one sendTo filter option required."));
                }

                // Create the report
                const createReport = await autoReportModule.create(data);
                if (createReport) {
                    // Initialize cron jobs if necessary
                    // cronJobActivity.initializeCronJobs();
                    return res.send(Response.SuccessResp("Information Stored successfully", createReport));
                } else {
                    return res.send(Response.FailResp("Error while creating data"));
                }
                
            } catch (error) {
                return res.send(Response.FailResp("Failed to store Data", error.message));
            }
    }

    async fetchReportDetails(req, res) {
        try {
            const result = req.verified;
            const {orderby,sort,searchQuery, } = req.query;
            let skip = req.query.skip || 0;
            let limit = req.query.limit || 10;
            const { adminId ,memberId} = result.userData;


            const sortBy = {};
            if (orderby === 'frequency') {
                sortBy['frequency.Daily'] = sort?.toString() === 'desc' ? -1 : 1;
                sortBy['frequency.Weekly'] = sort?.toString() === 'desc' ? -1 : 1;
                sortBy['frequency.Monthly'] = sort?.toString() === 'desc' ? -1 : 1;
            } else {
                sortBy[orderby || 'reportsTitle'] = sort?.toString() === 'desc' ? -1 : 1;
        }

        if(!memberId){
            const isAdminDataExist = await adminSchema.findById(adminId);
            
            if (!isAdminDataExist) return res.send(Response.FailResp(`Admin does not exist.`));

            let query = {adminId}
            if (searchQuery) {
                query.$or = [
                    { reportsTitle: new RegExp(searchQuery, 'i') },
                    { Recipients: { $elemMatch: { $regex: searchQuery, $options: 'i' } } }
                ];
            }
            let autoReportFetch = await autoReportModule.find(query).select('reportsTitle frequency Recipients Content').sort(sortBy).skip(skip).limit(limit);
            let totalCount = await autoReportModule.countDocuments(query)
            if (autoReportFetch) {
                let data = {
                    totalCount,
                    autoReportFetch
                }
                res.send(Response.SuccessResp("Information Fetched successfully", data))
            } else {
                res.send(Response.FailResp("Error while fetching data"));
            }
        }else{
            const isUserExist = await usersModel.findOne({_id:memberId});
            if (!isUserExist) return res.send(Response.FailResp(`User does not exist.`));

            let query = {userId:memberId}
            if (searchQuery) {
                query.$or = [
                    { reportsTitle: new RegExp(searchQuery, 'i') },
                    { Recipients: { $elemMatch: { $regex: searchQuery, $options: 'i' } } }
                ];
            }
            console.log(query,'query');
            
            let autoReportFetch = await autoReportModule.find(query).select('reportsTitle frequency Recipients Content').sort(sortBy).skip(skip).limit(limit);
            let totalCount = await autoReportModule.countDocuments(query)

            if (autoReportFetch) {
                let data = {
                    totalCount,
                    autoReportFetch
                }
                res.send(Response.SuccessResp("Information Fetched successfully", data))
            } else {
                res.send(Response.FailResp("Error while fetching data"));
            }
        }


        } catch (error) {
            return res.send(Response.FailResp("Failed to store Data", error.message));
        }
    }
    async updateReport(req, res) {
        try {
            const reportId = req.query.Id;
            const data = req.body;
            const result = req?.verified;
            const { memberId, adminId} = result.userData;
    
            const { value, error } = autoEmailReportValidation.updateReport(data);
            if (error) {
                // const errorMessage = error.details[0].message;
                return res.send(Response.SuccessResp("Validation Failed", error.message));
            }
    
            // data.orgId = orgId;
            if(!memberId){
                const findReport = await autoReportModule.findOne({adminId});
                if (!findReport) {
                    return res.send(Response.FailResp("Report not found."));
                }
        
                const reportName = await autoReportModule.findOne({ reportsTitle: data.reportsTitle});
                if (reportName) {
                    return res.send(Response.FailResp("A report with this title already exists."));
                }
        
                const updateData = await autoReportModule.updateOne(
                    {adminId},
                    { _id: new ObjectId(reportId) },
                    { $set: data },
                    { returnDocument: 'after' }
                );
        
                if (updateData.modifiedCount > 0) {
                    // cronJobActivity.initializeCronJobs();
                    res.send(Response.SuccessResp("Report updated successfully", data));
                } else {
                    res.send(Response.FailResp("Error while updating report"));
                }
            }
            else{
                const findReport = await autoReportModule.findOne({userId:memberId});
                if (!findReport) {
                    return res.send(Response.FailResp("Report not found."));
                }
        
                const reportName = await autoReportModule.findOne({ reportsTitle: data.reportsTitle});
                if (reportName) {
                    return res.send(Response.FailResp("A report with this title already exists."));
                }
        
                const updateData = await autoReportModule.updateOne(
                    {userId:memberId},
                    { _id: new ObjectId(reportId) },
                    { $set: data },
                    { returnDocument: 'after' }
                );
        
                if (updateData.modifiedCount > 0) {
                    // cronJobActivity.initializeCronJobs();
                    res.send(Response.SuccessResp("Report updated successfully", data));
                } else {
                    res.send(Response.FailResp("Error while updating report"));
                }
            }
        } catch (error) {
            return res.send(Response.FailResp("Failed to update report", error.message));
        }
    }

    async deleteReport(req, res) {
        try {
                const result = req?.verified;
                const { memberId, adminId} = result.userData;

                if(!memberId){
                    const reportId = req?.query?.Id;
                    const deletedData = await autoReportModule.findOneAndDelete({ adminId,_id: reportId });
                    let frequency = null;
    
                    if (deletedData && deletedData.frequency && deletedData.frequency.length > 0) {
                      const freq = deletedData.frequency[0];
                      if (freq.Daily === 1 ){
                        frequency = "Daily";
                      }else if(freq.Weekly===1){
                        frequency="Weekly";
                      }else if(freq.Monthly===1){
                        frequency="Monthly";
                      }
                    }
                    if (deletedData) {
                    //   cronJobActivity.deleteCronJob(reportId,frequency)
                        res.send(Response.SuccessResp("Data deleted successfully", deletedData))
                    } else {
                        res.send(Response.FailResp("Error while deleting data"));
                    }
                }else{
                    const reportId = req?.query?.Id;
                    const deletedData = await autoReportModule.findOneAndDelete({ userId:memberId,_id: reportId });
                    let frequency = null;
    
                    if (deletedData && deletedData.frequency && deletedData.frequency.length > 0) {
                      const freq = deletedData.frequency[0];
                      if (freq.Daily === 1 ){
                        frequency = "Daily";
                      }else if(freq.Weekly===1){
                        frequency="Weekly";
                      }else if(freq.Monthly===1){
                        frequency="Monthly";
                      }
                    }
                    if (deletedData) {
                    //   cronJobActivity.deleteCronJob(reportId,frequency)
                        res.send(Response.SuccessResp("Data deleted successfully", deletedData))
                    } else {
                        res.send(Response.FailResp("Error while deleting data"));
                    }
                }

            } catch (err) {
                return res.send(Response.FailResp("Failed to delete Data", err.message));
            }

    }    

}

export default new autoEmailReportService();
