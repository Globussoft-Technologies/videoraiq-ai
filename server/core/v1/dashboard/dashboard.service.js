
import mongoose from "mongoose";
import logger from "../../../utils/logger.js";
import Response from "../../../utils/response.js";
import adminModel from "../admin/admin.model.js";
import channelsModel from "../channels/channels.model.js";
import {Incident} from "../incidents/incidents.model.js";
import alertModel from "../alerts/alerts.model.js";
import moment from "moment";
import sideBarConfigData from './dashboardSidebar.model.js'
import dashboardSidebarModel from "./dashboardSidebar.model.js";
import NVR from "../NVR/nvr.model.js"
class DashboardService {
    async headerStats(req, res, next) {
        try {
          const data = req?.verified?.userData;
          const { startDate, endDate, nvrId, channelId, location, department ,reportStatus,checkInOrCheckOutCamera,incidentTypeFilter} = req.body;
          let authorizedChannel = req?.verified?.authorizedChannel?.channels || [];
          let authorizedNVRs = req?.verified?.authorizedChannel?.nvrIds || [];
          let memberId = req?.verified?.userData?.memberId;


      
          const isAdminExist = await adminModel.findOne({
            _id:req?.verified?.userData?.adminId
          });
      
          if (!isAdminExist) {
            return res.send(Response.userFailResp("Admin not found!", "Validation Failed!."));
          }
      
          const dateFilter = {};
          if (startDate && endDate) {
            dateFilter.timeOfIncident = {
              $gte: new Date(`${startDate}T00:00:00.000Z`),
              $lte: new Date(`${endDate}T23:59:59.999Z`)
            };
          }
          
          const userMatch = { userId: data?.user_id.toString(), Image: { $exists: true, $nin: [null, "", undefined, "https://"] }, ...dateFilter };

          // Apply default or custom incident type filter
          if (incidentTypeFilter?.length) {
            userMatch.incidentType = { $in: incidentTypeFilter };
          } else {
            userMatch.incidentType = { $nin: ["countPersons", "lineCrossing"] };
          }
          
          // Exclude incidents where triggerNotification is true and exists
          const notificationExclusion = {
            $or: [
              { triggerNotification: { $ne: true } }
            ]
          };

          let channelFilter = { userId: data.user_id.toString()};

          // nvr wise
          if (nvrId) {
            const nvrIds = Array.isArray(nvrId)
              ? nvrId
              : nvrId.split(",").map((id) => id.trim());
            const validNvrIds = nvrIds.filter((id) =>
              mongoose.Types.ObjectId.isValid(id)
            );
            if (validNvrIds.length > 0 && !data?.memberId) {
              channelFilter.nvrId = { $in: validNvrIds.map((id) => new mongoose.Types.ObjectId(id)) };
              userMatch.nvrId = { $in: validNvrIds.map((id) => new mongoose.Types.ObjectId(id)) };
            }

            if (validNvrIds.length > 0 && data?.memberId) {
              let filteredNVRIds = [];
            
              // ✅ Only filter if authorizedNVRs exists and is not empty
              if (Array.isArray(authorizedNVRs) && authorizedNVRs.length > 0) {
                const authorizedSet = new Set(authorizedNVRs.map(id => id.toString()));
            
                // Keep only IDs that are both valid and authorized
                filteredNVRIds = validNvrIds.filter(id =>
                  authorizedSet.has(id.toString())
                );
              } else {

                // No authorized NVR — you can either:
                // Option 1: allow none
                filteredNVRIds = [];
            
                // Option 2: allow all valid ones (if that's desired)
                // filteredNVRIds = validNvrIds;
              }
            
              if (filteredNVRIds.length > 0) {
                const objectIds = filteredNVRIds.map(id => new mongoose.Types.ObjectId(id));
            
                channelFilter.nvrId = { $in: objectIds };
                userMatch.nvrId = { $in: objectIds };
              }
            }
          }
          // cam wise
          if (channelId) {
            const channelIds = Array.isArray(channelId)
              ? channelId
              : channelId.split(",").map((id) => id.trim());
            const validChannelIds = channelIds.filter((id) =>
              mongoose.Types.ObjectId.isValid(id)
            );
            if (validChannelIds.length > 0 && !data?.memberId) {
              channelFilter._id = { $in: validChannelIds.map((id) => new mongoose.Types.ObjectId(id)) };
              userMatch.channelId = { $in: validChannelIds.map((id) => new mongoose.Types.ObjectId(id)) };
            }
            if (validChannelIds.length > 0 && data?.memberId) {
              let filteredChannelIds = [];
            
              // ✅ Only filter if authorizedChannels exists and is not empty
              if (Array.isArray(authorizedChannel) && authorizedChannel.length > 0) {
                const authorizedSet = new Set(authorizedChannel.map(id => id.toString()));
            
                // Keep only IDs that are both valid and authorized
                filteredChannelIds = validChannelIds.filter(id =>
                  authorizedSet.has(id.toString())
                );
              } else {
                // No authorized channels — you can either:
                // Option 1: allow none
                filteredChannelIds = [];
            
                // Option 2: allow all valid ones (if that's desired)
                // filteredChannelIds = validChannelIds;
              }
            
              if (filteredChannelIds.length > 0) {
                const objectIds = filteredChannelIds.map(id => new mongoose.Types.ObjectId(id));
            
                channelFilter._id = { $in: objectIds };
                userMatch.channelId = { $in: objectIds };
              }
            }
            
          }
          // location wise
          if (location) {
            const locations = Array.isArray(location)
              ? location
              : location.split(",").map((l) => l.trim());
            const nvrs = await NVR.find({
              userId: data.user_id.toString(),
              location: { $in: locations },
            }).select("_id");
            const nvrIds = nvrs.map((nvr) => nvr._id);
            if (nvrIds.length > 0) {

              if(data?.memberId){

                let filteredNVRIds = [];
              
                // ✅ Only filter if authorizedNVRs exists and is not empty
                if (Array.isArray(authorizedNVRs) && authorizedNVRs.length > 0) {
                  const authorizedSet = new Set(authorizedNVRs.map(id => id.toString()));
              
                  // Keep only IDs that are both valid and authorized
                  filteredNVRIds = nvrIds.filter(id =>
                    authorizedSet.has(id.toString())
                  );
                } else {
                  // No authorized NVR — you can either:
                  // Option 1: allow none
                  filteredNVRIds = [];
              
                  // Option 2: allow all valid ones (if that's desired)
                  // filteredNVRIds = validNvrIds;
                }
              
                if (filteredNVRIds.length > 0) {
                  const objectIds = filteredNVRIds.map(id => new mongoose.Types.ObjectId(id));
              
                  channelFilter.nvrId = { $in: objectIds };
                  userMatch.nvrId = { $in: objectIds };
                }
              }else{
                channelFilter.nvrId = { $in: nvrIds };
                userMatch.nvrId = { $in: nvrIds };
              }
            }
          }
          // department wise
          if (department) {
            const deptIds = Array.isArray(department)
              ? department
              : department.split(",").map((d) => d.trim());
            const channels = await channelsModel
              .find({
                userId: data.user_id.toString(),
                department: { $in: deptIds },
              })
              .select("_id");
            const channelIds = channels.map((ch) => ch._id);
            if (channelIds.length > 0 && !data?.memberId) {
              channelFilter._id = { $in: channelIds };
              userMatch.channelId = { $in: channelIds };
            }
            if (channelIds.length > 0 && data?.memberId) {
              let filteredChannelIds = [];
            
              // ✅ Only filter if authorizedChannels exists and is not empty
              if (Array.isArray(authorizedChannel) && authorizedChannel.length > 0) {
                const authorizedSet = new Set(authorizedChannel.map(id => id.toString()));
            
                // Keep only IDs that are both valid and authorized
                filteredChannelIds = channelIds.filter(id =>
                  authorizedSet.has(id.toString())
                );
              } else {
                // No authorized channels — you can either:
                // Option 1: allow none
                filteredChannelIds = [];
            
                // Option 2: allow all valid ones (if that's desired)
                // filteredChannelIds = validChannelIds;
              }
            
              if (filteredChannelIds.length > 0) {
                const objectIds = filteredChannelIds.map(id => new mongoose.Types.ObjectId(id));
            
                channelFilter._id = { $in: objectIds };
                userMatch.channelId = { $in: objectIds };
              }
            }
          }
          if (!channelFilter.hasOwnProperty('_id') && data?.memberId) {
            channelFilter._id = {'$in': authorizedChannel}
          }
          
          if (!userMatch.hasOwnProperty('channelId') && data?.memberId) {
            userMatch.channelId = {'$in': authorizedChannel}
          }

      if(checkInOrCheckOutCamera==="checkin")
      {
        let checkInCameraIds = [] 
        if(memberId===undefined){
          let channels = await channelsModel.find({
            checkType: "checkin",
          });
          checkInCameraIds.push(...channels);
        }
        else{
          
          let channels = await channelsModel.find(
            { checkType: "checkin" },
            null,
            { memberId }
          );
          checkInCameraIds.push(...channels);
        }

        userMatch.channelId = { $in: checkInCameraIds.map(camera => camera._id) };
      }
      else if(checkInOrCheckOutCamera==="checkout")
      {
        let checkoutCameraIds = []
        if(memberId===undefined){
          let channels = await channelsModel.find({
            checkType: "checkout",
          });
          checkoutCameraIds.push(...channels);

        }
        else{
          let channels = await channelsModel.find(
            { checkType: "checkout" },
            null,
            { memberId }
          );
          checkoutCameraIds.push(...channels);
        }

        userMatch.channelId = { $in: checkoutCameraIds };
      }else if(checkInOrCheckOutCamera==="both")
      {
              let checkoutCameraIds = []
              if(memberId===undefined){
                let channels = await channelsModel.find({
                  checkType: ["checkin", "checkout"],
                });
                checkoutCameraIds.push(...channels);
      
              }
              else{
                let channels = await channelsModel.find(
                  { checkType: ["checkin", "checkout"] },
                  null,
                  { memberId }
                );
                checkoutCameraIds.push(...channels);
              }
              
              userMatch.channelId = { $in: checkoutCameraIds.map(camera => camera._id) };
      }




          //Filter Incidents based on report status for members
            if (reportStatus !== undefined && reportStatus) {
              userMatch["report.status"] = reportStatus;
            }
            
              const orConditions = [];

              /* ---------------------------------------
                Crowd Detection Filter
              --------------------------------------- */
              const crowdFilters = req.body?.incidentCrowdDetectionFilters;

              if (crowdFilters?.incidentType === "crowdDetection") {
                const crowdMatch = {
                  incidentType: "crowdDetection",
                };

                if (
                  crowdFilters?.count?.min !== undefined &&
                  crowdFilters?.count?.max !== undefined
                ) {
                  crowdMatch.croudCount = {
                    $gte: crowdFilters.count.min,
                    $lte: crowdFilters.count.max,
                  };
                }

                orConditions.push(crowdMatch);
              }

              /* ---------------------------------------
                PPE Filter
              --------------------------------------- */
              const ppeFilters = req.body?.incidentpersonalProtectiveEquipmentFilters;

              if (ppeFilters?.incidentType === "personProtectiveEquipment") {
                const ppeMatch = {
                  incidentType: "personalProtectiveEquipment",
                };

                // Helmet YES
                if (
                  ppeFilters?.helmet?.yes?.min !== undefined &&
                  ppeFilters?.helmet?.yes?.max !== undefined
                ) {
                  ppeMatch["ppe.helmet.yes"] = {
                    $gte: ppeFilters.helmet.yes.min,
                    $lte: ppeFilters.helmet.yes.max,
                  };
                }

                // Helmet NO
                if (
                  ppeFilters?.helmet?.no?.min !== undefined &&
                  ppeFilters?.helmet?.no?.max !== undefined
                ) {
                  ppeMatch["ppe.helmet.no"] = {
                    $gte: ppeFilters.helmet.no.min,
                    $lte: ppeFilters.helmet.no.max,
                  };
                }

                // Safety Jacket YES
                if (
                  ppeFilters?.safety_jacket?.yes?.min !== undefined &&
                  ppeFilters?.safety_jacket?.yes?.max !== undefined
                ) {
                  ppeMatch["ppe.safety_jacket.yes"] = {
                    $gte: ppeFilters.safety_jacket.yes.min,
                    $lte: ppeFilters.safety_jacket.yes.max,
                  };
                }

                // Safety Jacket NO
                if (
                  ppeFilters?.safety_jacket?.no?.min !== undefined &&
                  ppeFilters?.safety_jacket?.no?.max !== undefined
                ) {
                  ppeMatch["ppe.safety_jacket.no"] = {
                    $gte: ppeFilters.safety_jacket.no.min,
                    $lte: ppeFilters.safety_jacket.no.max,
                  };
                }

                orConditions.push(ppeMatch);
              }


              /* ---------------------------------------
                Apply OR logic
              --------------------------------------- */
              if (orConditions.length > 0) {
                userMatch.$or = orConditions;
              }



          const [activeCameras,overAllCameraCount, incidentsResolved, totalAlerts, criticalAlerts] = await Promise.all([
              channelsModel.countDocuments({
                ...channelFilter,
                $or: [
                  { "detections.countPersonsSettings.enabled": true },
                  { "detections.motionDetectionSettings.enabled": true },
                  { "detections.genericObjectDetectionSettings.enabled": true },
                  { "detections.countVehiclesSettings.enabled": true },
                  { "detections.loiteringWithoutAuthSettings.enabled": true },
                  { "detections.loiteringWithAuthSettings.enabled": true },
                  { "detections.unauthorizedAccessSettings.enabled": true },
                  { "detections.lineCrossingSettings.enabled": true },
                  { "detections.fireSmokeDetectionSettings.enabled": true },
                  { "detections.weaponDetectionSettings.enabled": true },
                  { "detections.unattendedBaggageDetectionSettings.enabled": true },
                  { "detections.personalProtectiveEquipmentSettings.enabled": true },
                  { "detections.crowdDetectionSettings.enabled": true },
                  { "detections.doorDetectionSettings.enabled": true },
                  { "detections.lightDetectionSettings.enabled": true },
                  { "detections.vehicleDetectionSettings.enabled": true },
                  { "detections.deskAbsenceSettings.enabled": true },
                  { "detections.conveyorDetectionSettings.enabled": true },
                  { "detections.crusherDetectionSettings.enabled": true },
                  { "detections.waterSpillageDetectionSettings.enabled": true },
                  { "detections.vehicleObstructionSettings.enabled": true },
                  { "detections.vehicleTypeDetectionSettings.enabled": true },
                ]
              }),
              (async () => {
              const query = channelsModel.find(channelFilter);
              query.setOptions({ includeInactive: true });
              return await query.countDocuments();
            })(),
            Incident.countDocuments({ ...userMatch, resolved: true }),
            Incident.countDocuments({
              ...userMatch,
              Image: { '$exists': true, '$nin': [null, '', undefined, 'https://'] },
              incidentType: { '$nin': ['countPersons', 'lineCrossing', 'countVehicles'] },
              resolved: false,
              incidentName: { '$not': /Guard Present/i }
            }),
            Incident.countDocuments({
              ...userMatch,
              severity: 'high',
              Image: { '$exists': true, '$nin': [null, '', undefined, 'https://'] },
              incidentType: { '$nin': ['countPersons', 'lineCrossing', 'countVehicles'] },
              resolved: false,
              incidentName: { '$not': /Guard Present/i }
            }),
          ]);
          
      
          const dashboardStats = {
            activeCameras,
            overAllCameraCount,
            incidentsResolved,
            totalAlerts,
            criticalAlerts
          };
      
          return res.status(200).json(
            Response.userSuccessResp("Dashboard header Stats successfully", dashboardStats)
          );
      
        } catch (error) {
          logger.error(error);
          return res
            .status(500)
            .json(Response.errorResp("Failed to fetch dashboard data", error.message));
        }
      }
      async criticalityStats(req, res, next) {
        try {
          const data = req?.verified?.userData;
          const { startDate, endDate, nvrId, channelId, location, department} = req.body;
          let authorizedChannel = req?.verified?.authorizedChannel?.channels || [];
          let authorizedNVRs = req?.verified?.authorizedChannel?.nvrIds || [];
          let {skip=0,limit=10} = req.query;
      
          const isAdminExist = await adminModel.findOne({
            _id:req?.verified?.userData?.adminId
          });
      
          if (!isAdminExist) {
            return res.send(Response.userFailResp("Admin not found!", "Validation Failed!"));
          }
      
          // Fetch last 3 alerts
          const notificationExclusion = {
            $or: [
              { triggerNotification: { $ne: true } }
            ]
          };
          
          // old
          // const filter = {
          //   $and: [
          //     { userId: data?.user_id.toString(), resolved: false },
          //     // notificationExclusion
          //   ]
          // };

          // new
          let channelFilter = { userId: data.user_id.toString() };
          const userMatch = { userId: data?.user_id };
          const filter = {
            userId: data?.user_id.toString(),
          };

          if (nvrId) {
            const nvrIds = Array.isArray(nvrId)
              ? nvrId
              : nvrId.split(",").map((id) => id.trim());
            const validNvrIds = nvrIds.filter((id) =>
              mongoose.Types.ObjectId.isValid(id)
            );
            if (validNvrIds.length > 0) {
              channelFilter.nvrId = { $in: validNvrIds.map((id) => new mongoose.Types.ObjectId(id)) };
              userMatch.nvrId = { $in: validNvrIds.map((id) => new mongoose.Types.ObjectId(id)) };
            }
          }
          if (channelId) {
            const channelIds = Array.isArray(channelId)
              ? channelId
              : channelId.split(",").map((id) => id.trim());
            const validChannelIds = channelIds.filter((id) =>
              mongoose.Types.ObjectId.isValid(id)
            );
            if (validChannelIds.length > 0) {
              channelFilter._id = { $in: validChannelIds.map((id) => new mongoose.Types.ObjectId(id)) };
              userMatch.channelId = { $in: validChannelIds.map((id) => new mongoose.Types.ObjectId(id)) };
            }
          }

          // Optional: Filter by location (via NVR model)
          if (location) {
            const locations = Array.isArray(location)
              ? location
              : location.split(",").map((l) => l.trim());
            const nvrs = await NVR.find({
              userId: data.user_id.toString(),
              location: { $in: locations },
            }).select("_id");
            const nvrIds = nvrs.map((nvr) => nvr._id);
            if (nvrIds.length > 0) {
              channelFilter.nvrId = { $in: nvrIds };
              userMatch.nvrId = { $in: nvrIds };
            }
          }

          // Optional: Filter by department (via Channel model)
          if (department) {
            const deptIds = Array.isArray(department)
              ? department
              : department.split(",").map((d) => d.trim());
            const channels = await channelsModel
              .find({
                userId: data.user_id.toString(),
                department: { $in: deptIds },
              })
              .select("_id");
            const channelIds = channels.map((ch) => ch._id);
            if (channelIds.length > 0) {
              channelFilter._id = { $in: channelIds };
              userMatch.channelId = { $in: channelIds };
            }
          }

          
          const [recentAlerts, totalCount] = await Promise.all([
            Incident.find(filter)
              .sort({ timeOfIncident: -1 })
              .skip(skip)
              .limit(limit)
              .populate({
                path: 'nvrId',
                select: 'nvrName'
              })
              .populate({
                path: 'channelId',
                select: 'name'
              })
              .lean(),
          
            Incident.countDocuments(filter)
          ]);
          
        
      
          let lastAlertMessage = "No alerts yet.";
          const now = new Date();
      
          const recentAlertsWithTimeAgo = recentAlerts.map((alert) => {
            const incidentTime = new Date(alert.timeOfIncident);
            const diffMs = now - incidentTime;
            const diffMinutes = Math.floor(diffMs / (1000 * 60));
      
            let timeAgo = "just now";
            if (diffMinutes < 1) {
              timeAgo = "just now";
            } else if (diffMinutes < 60) {
              timeAgo = `${diffMinutes} min ago`;
            } else if (diffMinutes < 1440) {
              const hours = Math.floor(diffMinutes / 60);
              timeAgo = `${hours} hour${hours > 1 ? "s" : ""} ago`;
            } else if (diffMinutes < 10080) {
              const days = Math.floor(diffMinutes / 1440);
              timeAgo = `${days} day${days > 1 ? "s" : ""} ago`;
            } else if (diffMinutes < 43200) {
              const weeks = Math.floor(diffMinutes / 10080);
              timeAgo = `${weeks} week${weeks > 1 ? "s" : ""} ago`;
            } else {
              const years = Math.floor(diffMinutes / 525600);
              timeAgo = years >= 1 ? `${years} year${years > 1 ? "s" : ""} ago` : "more than a month ago";
            }
      
            return {
              ...alert,
              timeAgo
            };
          });
      
          if (recentAlertsWithTimeAgo.length > 0) {
            lastAlertMessage = `Last alert: ${recentAlertsWithTimeAgo[0].timeAgo}`;
          }
          // Group incidents by severity
          // const severityCounts = await Incident.aggregate([
          //   { $match: { userId: data?.user_id.toString() ,resolved:false} },
          
          //   // Join with NVR collection
          //   {
          //     $lookup: {
          //       from: 'nvrs',
          //       localField: 'nvrId',
          //       foreignField: '_id',
          //       as: 'nvrData'
          //     }
          //   },
          //   { $unwind: { path: '$nvrData', preserveNullAndEmptyArrays: true } },
          
          //   // Join with Channel collection
          //   {
          //     $lookup: {
          //       from: 'channels',
          //       localField: 'channelId',
          //       foreignField: '_id',
          //       as: 'channelData'
          //     }
          //   },
          //   { $unwind: { path: '$channelData', preserveNullAndEmptyArrays: true } },
          
          //   // Group by severity and pull count and example names
          //   {
          //     $group: {
          //       _id: '$severity',
          //       count: { $sum: 1 },
          //       exampleNvrName: { $first: '$nvrData.nvrName' },
          //       exampleChannelName: { $first: '$channelData.name' }
          //     }
          //   }
          // ]);
          
      
          // const severityMap = {
          //   high: 0,
          //   moderate: 0,
          //   low: 0
          // };
      
          // severityCounts.forEach(item => {
          //   severityMap[item._id] = item.count;
          // });
      
          // const chartData = [
          //   { value: severityMap.low || 0, category: 'LowAlert' },
          //   { value: severityMap.moderate || 0, category: 'ModerateAlert' },
          //   { value: severityMap.high || 0, category: 'HighAlert' }
          // ];
      
          const criticalityStatsData = {
            lastAlertMessage,
            // chartData,
            totalCount,
            recentAlerts: recentAlertsWithTimeAgo
          };
      
          return res.status(200).json(
            Response.userSuccessResp("Dashboard criticality Stats fetched successfully", criticalityStatsData)
          );
      
        } catch (error) { 
          log(error,'error')
          logger.error(error);
          return res
            .status(500)
            .json(Response.errorResp("Failed to fetch dashboard data", error.message));
        }
      }
      
      


      async detectionChart(req, res, next) {
        try {
          const data = req?.verified?.userData;
          let authorizedChannel = req?.verified?.authorizedChannel?.channels || [];
          let authorizedNVRs = req?.verified?.authorizedChannel?.nvrIds || [];
          const isAdminExist = await adminModel.findOne({_id:req?.verified?.userData?.adminId});
          if (!isAdminExist) {
            return res.send(Response.validationFailResp("Admin not found!", "Validation Failed!"));
          }
          const {nvrId, channelId, location, department} = req.body;
      
          // Get this week's Monday to Sunday
          // const startOfThisWeek = moment().startOf('isoWeek').toDate();
          // const endOfThisWeek = moment().endOf('isoWeek').toDate();
          
          const startOfLastWeek = moment().subtract(1, 'week').startOf('isoWeek').toDate();
          const endOfLastWeek = moment().subtract(1, 'week').endOf('isoWeek').toDate();

          const filter = {
            userId: data?.user_id.toString(),
            timeOfIncident: { $gte: startOfLastWeek, $lte: endOfLastWeek },
          };
          let channelFilter = { userId: data.user_id.toString() };
          const userMatch = { userId: data?.user_id };
          // Filter: specific NVR
          if (nvrId) {
            const nvrIds = Array.isArray(nvrId)
              ? nvrId
              : nvrId.split(",").map((id) => id.trim());
            const validNvrIds = nvrIds.filter((id) =>
              mongoose.Types.ObjectId.isValid(id)
            );
            if (validNvrIds.length > 0 && !data?.memberId) {
              channelFilter.nvrId = { $in: validNvrIds.map((id) => new mongoose.Types.ObjectId(id)) };
              userMatch.nvrId = { $in: validNvrIds.map((id) => new mongoose.Types.ObjectId(id)) };
            }
            if (validNvrIds.length > 0 && data?.memberId) {
              let filteredNVRIds = [];
            
              // ✅ Only filter if authorizedNVRs exists and is not empty
              if (Array.isArray(authorizedNVRs) && authorizedNVRs.length > 0) {
                const authorizedSet = new Set(authorizedNVRs.map(id => id.toString()));
            
                // Keep only IDs that are both valid and authorized
                filteredNVRIds = validNvrIds.filter(id =>
                  authorizedSet.has(id.toString())
                );
              } else {
                // No authorized NVR — you can either:
                // Option 1: allow none
                filteredNVRIds = [];
            
                // Option 2: allow all valid ones (if that's desired)
                // filteredNVRIds = validNvrIds;
              }
            
              if (filteredNVRIds.length > 0) {
                const objectIds = filteredNVRIds.map(id => new mongoose.Types.ObjectId(id));
            
                channelFilter.nvrId = { $in: objectIds };
                userMatch.nvrId = { $in: objectIds };
              }
            }
          }
      
          // Filter: specific channel
          if (channelId) {
            const channelIds = Array.isArray(channelId)
              ? channelId
              : channelId.split(",").map((id) => id.trim());
            const validChannelIds = channelIds.filter((id) =>
              mongoose.Types.ObjectId.isValid(id)
            );
            if (validChannelIds.length > 0 && !data?.memberId) {
              channelFilter._id = { $in: validChannelIds.map((id) => new mongoose.Types.ObjectId(id)) };
              userMatch.channelId = { $in: validChannelIds.map((id) => new mongoose.Types.ObjectId(id)) };
            }
            if (validChannelIds.length > 0 && data?.memberId) {
              let filteredChannelIds = [];
            
              // ✅ Only filter if authorizedChannels exists and is not empty
              if (Array.isArray(authorizedChannel) && authorizedChannel.length > 0) {
                const authorizedSet = new Set(authorizedChannel.map(id => id.toString()));
            
                // Keep only IDs that are both valid and authorized
                filteredChannelIds = validChannelIds.filter(id =>
                  authorizedSet.has(id.toString())
                );
              } else {
                // No authorized channels — you can either:
                // Option 1: allow none
                filteredChannelIds = [];
            
                // Option 2: allow all valid ones (if that's desired)
                // filteredChannelIds = validChannelIds;
              }
            
              if (filteredChannelIds.length > 0) {
                const objectIds = filteredChannelIds.map(id => new mongoose.Types.ObjectId(id));
            
                channelFilter._id = { $in: objectIds };
                userMatch.channelId = { $in: objectIds };
              }
            }
          }
      
          // Filter: by location → fetch NVRs that match
          if (location) {
            const locations = Array.isArray(location)
              ? location
              : location.split(",").map((l) => l.trim());
            const nvrs = await NVR.find({
              userId: data.user_id.toString(),
              location: { $in: locations },
            }).select("_id");
            const nvrIds = nvrs.map((nvr) => nvr._id);
            if(data?.memberId){

              let filteredNVRIds = [];
            
              // ✅ Only filter if authorizedNVRs exists and is not empty
              if (Array.isArray(authorizedNVRs) && authorizedNVRs.length > 0) {
                const authorizedSet = new Set(authorizedNVRs.map(id => id.toString()));
            
                // Keep only IDs that are both valid and authorized
                filteredNVRIds = nvrIds.filter(id =>
                  authorizedSet.has(id.toString())
                );
              } else {
                // No authorized NVR — you can either:
                // Option 1: allow none
                filteredNVRIds = [];
            
                // Option 2: allow all valid ones (if that's desired)
                // filteredNVRIds = validNvrIds;
              }
            
              if (filteredNVRIds.length > 0) {
                const objectIds = filteredNVRIds.map(id => new mongoose.Types.ObjectId(id));
            
                channelFilter.nvrId = { $in: objectIds };
                userMatch.nvrId = { $in: objectIds };
              }
            }else{
              channelFilter.nvrId = { $in: nvrIds };
              userMatch.nvrId = { $in: nvrIds };
            }
          }
      
          // Filter: by department → fetch Channels that match
          if (department) {
            const deptIds = Array.isArray(department)
              ? department
              : department.split(",").map((d) => d.trim());
            const channels = await channelsModel
              .find({
                userId: data.user_id.toString(),
                department: { $in: deptIds },
              })
              .select("_id");
            const channelIds = channels.map((ch) => ch._id);
            if (channelIds.length > 0 && !data?.memberId) {
              channelFilter._id = { $in: channelIds };
              userMatch.channelId = { $in: channelIds };
            }
            if (channelIds.length > 0 && data?.memberId) {
              let filteredChannelIds = [];
            
              // ✅ Only filter if authorizedChannels exists and is not empty
              if (Array.isArray(authorizedChannel) && authorizedChannel.length > 0) {
                const authorizedSet = new Set(authorizedChannel.map(id => id.toString()));
            
                // Keep only IDs that are both valid and authorized
                filteredChannelIds = channelIds.filter(id =>
                  authorizedSet.has(id.toString())
                );
              } else {
                // No authorized channels — you can either:
                // Option 1: allow none
                filteredChannelIds = [];
            
                // Option 2: allow all valid ones (if that's desired)
                // filteredChannelIds = validChannelIds;
              }
            
              if (filteredChannelIds.length > 0) {
                const objectIds = filteredChannelIds.map(id => new mongoose.Types.ObjectId(id));
            
                channelFilter._id = { $in: objectIds };
                userMatch.channelId = { $in: objectIds };
              }
            }
          }

          if (!channelFilter.hasOwnProperty('_id') && data?.memberId) {
            channelFilter._id = {'$in': authorizedChannel}
          }
          
          if (!userMatch.hasOwnProperty('channelId') && data?.memberId) {
            userMatch.channelId = {'$in': authorizedChannel}
          }

      
          // Aggregation pipeline
          const incidentsStats = await Incident.aggregate([
            {
              $match: {
                ...filter 
                // userId: data?.user_id.toString(),
                // timeOfIncident: { $gte: startOfLastWeek, $lte: endOfLastWeek },
                // $or: [
                //   { triggerNotification: { $exists: false } },
                //   { triggerNotification: { $ne: true } }
                // ]
              }
            },
            {
              $project: {
                incidentType: 1,
                dayOfWeek: { $isoDayOfWeek: "$timeOfIncident" } // 1 = Monday, 7 = Sunday
              }
            },
            {
              $group: {
                _id: { type: "$incidentType", day: "$dayOfWeek" },
                count: { $sum: 1 }
              }
            }
          ]);

      
          // Format data like: { cashier_theft: [0,0,3,4,0,2,1], fire: [0,0,0,0,1,0,0] }
          const formatted = {};
      
          incidentsStats.forEach(item => {
            const type = item._id.type;
            const dayIndex = item._id.day - 1; // 0-based index for Mon–Sun
      
            if (!formatted[type]) {
              formatted[type] = Array(7).fill(0);
            }
      
            formatted[type][dayIndex] = item.count;
          });
      
          return res.status(200).json(
            Response.userSuccessResp("Dashboard detection graph data fetched successfully", formatted)
          );
      
        } catch (error) {
          logger.error(error);
          return res.status(500).json(
            Response.errorResp("Failed to fetch dashboard detection graph data", error.message)
          );
        }
      }

      async WeeklyComparisonChart(req,res,next){
        try{

          const data = req?.verified?.userData;
      
          const isAdminExist = await adminModel.findOne({_id:req?.verified?.userData?.adminId});
          if (!isAdminExist) {
            return res.send(Response.validationFailResp("Admin not found!", "Validation Failed!"));
          }

          const {nvrId, channelId, location, department} = req.body;

          const startOfThisWeek = moment().startOf('isoWeek').toDate();
          const endOfThisWeek = moment().endOf('isoWeek').toDate();
          
          const startOfLastWeek = moment().subtract(1, 'week').startOf('isoWeek').toDate();
          const endOfLastWeek = moment().subtract(1, 'week').endOf('isoWeek').toDate();

          const filter = {
            userId: data?.user_id.toString(),
          };
      
          // Filter: specific NVR
          if (nvrId) {
            const nvrIds = Array.isArray(nvrId)
              ? nvrId
              : nvrId.split(",").map((id) => id.trim());
            const validNvrIds = nvrIds.filter((id) =>
              mongoose.Types.ObjectId.isValid(id)
            );
            if (validNvrIds.length > 0) {
              channelFilter.nvrId = { $in: validNvrIds.map((id) => new mongoose.Types.ObjectId(id)) };
              userMatch.nvrId = { $in: validNvrIds.map((id) => new mongoose.Types.ObjectId(id)) };
            }
          }
      
          // Filter: specific channel
          if (channelId) {
            const channelIds = Array.isArray(channelId)
              ? channelId
              : channelId.split(",").map((id) => id.trim());
            const validChannelIds = channelIds.filter((id) =>
              mongoose.Types.ObjectId.isValid(id)
            );
            if (validChannelIds.length > 0) {
              channelFilter._id = { $in: validChannelIds.map((id) => new mongoose.Types.ObjectId(id)) };
              userMatch.channelId = { $in: validChannelIds.map((id) => new mongoose.Types.ObjectId(id)) };
            }
          }
      
          // Filter: by location → fetch NVRs that match
          if (location) {
            const locations = Array.isArray(location)
              ? location
              : location.split(",").map((l) => l.trim());
            const nvrs = await NVR.find({
              userId: data.user_id.toString(),
              location: { $in: locations },
            }).select("_id");
            const nvrIds = nvrs.map((nvr) => nvr._id);
            if (nvrIds.length > 0) {
              channelFilter.nvrId = { $in: nvrIds };
              userMatch.nvrId = { $in: nvrIds };
            }
          }
      
          // Filter: by department → fetch Channels that match
          if (department) {
            const deptIds = Array.isArray(department)
              ? department
              : department.split(",").map((d) => d.trim());
            const channels = await channelsModel
              .find({
                userId: data.user_id.toString(),
                department: { $in: deptIds },
              })
              .select("_id");
            const channelIds = channels.map((ch) => ch._id);
            if (channelIds.length > 0) {
              channelFilter._id = { $in: channelIds };
              userMatch.channelId = { $in: channelIds };
            }
          }
          
          const buildAggregation = (start, end, userId) => ([
            {
              $match: {
                // userId: userId.toString(),
                ...filter,
                timeOfIncident: { $gte: start, $lte: end },
                // $or: [
                //   { triggerNotification: { $exists: false } },
                //   { triggerNotification: { $ne: true } }
                // ]
              }
            },
            {
              $project: {
                dayOfWeek: { $isoDayOfWeek: "$timeOfIncident" }
              }
            },
            {
              $group: {
                _id: { day: "$dayOfWeek" },
                count: { $sum: 1 }
              }
            }
          ]);
          
          const [thisWeekAgg, lastWeekAgg] = await Promise.all([
            Incident.aggregate(buildAggregation(startOfThisWeek, endOfThisWeek, data?.user_id)),
            Incident.aggregate(buildAggregation(startOfLastWeek, endOfLastWeek, data?.user_id))
          ]);
          
          const currentWeek = formatWeeklyStats(thisWeekAgg, startOfThisWeek);
          const previousWeek = formatWeeklyStats(lastWeekAgg, startOfLastWeek);
          
          res.send(Response.userSuccessResp("Weekly Incident Stats", {
            currentWeek,
            previousWeek
          }));
          
        }catch (error) {
          logger.error(error);
          return res.status(500).json(
            Response.errorResp("Failed to fetch dashboard WeeklyComparisonChart graph data", error.message)
          );
        }
      }


      async getSidebarConfig(req,res,next){
        try{
          const data = req?.verified?.userData;
      
          const isAdminExist = await adminModel.findOne({_id:req?.verified?.userData?.adminId});
          if (!isAdminExist) {
            return res.send(Response.validationFailResp("Admin not found!", "Validation Failed!"));
          }

          let sideBarConfig = await sideBarConfigData.findOne({adminId:req?.verified?.userData?.adminId});

          if(!sideBarConfig) return res.send(Response.notFoundResp("sideBar config not fount","Validation Failed!"));

          res.send(Response.userSuccessResp("Successfully fetched sidebarData.",sideBarConfig));
        } catch (error) {
          logger.error(error);
          return res.status(500).json(
            Response.errorResp("Failed to fetch dashboard sideBar config data", error.message)
          );
        }
      }

      async updateSidebarConfig(req, res, next) {
        try {
          const data = req?.verified?.userData;
          const updates = req.body?.detectionConfigs; // Expecting an array of { detectionType, isEnabled, allowedDetection }
        
          // Find admin by email
          const isAdminExist = await adminModel.findOne({_id:req?.verified?.userData?.adminId});
          if (!isAdminExist) {
            return res.send(Response.validationFailResp("Admin not found!", "Validation Failed!"));
          }
        
          const adminId = isAdminExist._id;
        
          // Fetch existing sidebar config
          let sideBarConfig = await sideBarConfigData.findOne({ adminId });
        
          if (!sideBarConfig) {
            return res.send(Response.notFoundResp("Sidebar config not found", "Validation Failed!"));
          }
        
          const updatedTypes = [];
        
          // Update detectionConfigs
          if (Array.isArray(updates)) {
            updates.forEach(update => {
              const configItem = sideBarConfig.detectionConfigs.find(
                c => c.detectionType === update.detectionType
              );
              if (configItem) {
                let isUpdated = false;
        
                if (typeof update.isEnabled === 'boolean') {
                  configItem.isEnabled = update.isEnabled;
                  isUpdated = true;
                }
                if (typeof update.allowedDetection === 'boolean') {
                  configItem.allowedDetection = update.allowedDetection;
                  isUpdated = true;
                }
        
                if (isUpdated) {
                  updatedTypes.push(update.detectionType);
                }
              }
            });
        
            await sideBarConfig.save();
          }
        
          const updatedList = updatedTypes.length ? updatedTypes.join(", ") : "No types";
          res.send(Response.userSuccessResp("Sidebar settings updated successfully.", sideBarConfig));
        }catch (error) {
          return res.status(500).json(
            Response.errorResp("Failed to update sidebar config", error.message)
          );
        }
      }


      async recentIncidents(req, res, _next) {
        try {
          const data = req?.verified?.userData;
          let user_id = req?.verified?.userData?.user_id;
          const { nvrId, channelId, location, department } = req.query;
          // Step 1: Find the admin
          const isAdminExist = await adminModel.findOne({_id:req?.verified?.userData?.adminId});
          if (!isAdminExist) {
            return res.send(
              Response.validationFailResp("Admin not found!", "Validation Failed!")
            );
          }

          // Step 2: Get dashboard sidebar config
          const dashboardSideBarConfig = await dashboardSidebarModel.findOne({
            adminId: isAdminExist._id
          });

          if (!dashboardSideBarConfig) {
            return res.send(Response.userSuccessResp("No sidebar config found", []));
          }

          // Step 3: Get enabled detection types
          const enabledDetectionTypes = dashboardSideBarConfig.detectionConfigs
            .filter(cfg => cfg.isEnabled)
            .map(cfg => cfg.detectionType);

          if (enabledDetectionTypes.length === 0) {
            return res.send(Response.userSuccessResp("No enabled detection types found", []));
          }

          const filter = {};
          let channelFilter = { userId: data.user_id.toString() };
          const userMatch = { userId: data?.user_id.toString() };

          // Filter: specific NVR
          if (nvrId) {
            const nvrIds = Array.isArray(nvrId)
              ? nvrId
              : nvrId.split(",").map((id) => id.trim());
            const validNvrIds = nvrIds.filter((id) =>
              mongoose.Types.ObjectId.isValid(id)
            );
            if (validNvrIds.length > 0) {
              channelFilter.nvrId = { $in: validNvrIds.map((id) => new mongoose.Types.ObjectId(id)) };
              userMatch.nvrId = { $in: validNvrIds.map((id) => new mongoose.Types.ObjectId(id)) };
            }
          }
      
          // Filter: specific channel
          if (channelId) {
            const channelIds = Array.isArray(channelId)
              ? channelId
              : channelId.split(",").map((id) => id.trim());
            const validChannelIds = channelIds.filter((id) =>
              mongoose.Types.ObjectId.isValid(id)
            );
            if (validChannelIds.length > 0) {
              channelFilter._id = { $in: validChannelIds.map((id) => new mongoose.Types.ObjectId(id)) };
              userMatch.channelId = { $in: validChannelIds.map((id) => new mongoose.Types.ObjectId(id)) };
            }
          }
      
          // Filter: by location → fetch NVRs that match
          if (location) {
            const locations = Array.isArray(location)
              ? location
              : location.split(",").map((l) => l.trim());
            const nvrs = await NVR.find({
              userId: data.user_id.toString(),
              location: { $in: locations },
            }).select("_id");
            const nvrIds = nvrs.map((nvr) => nvr._id);
            if (nvrIds.length > 0) {
              channelFilter.nvrId = { $in: nvrIds };
              userMatch.nvrId = { $in: nvrIds };
            }
          }
      
          // Filter: by department → fetch Channels that match
          if (department) {
            const deptIds = Array.isArray(department)
              ? department
              : department.split(",").map((d) => d.trim());
            const channels = await channelsModel
              .find({
                userId: data.user_id.toString(),
                department: { $in: deptIds },
              })
              .select("_id");
            const channelIds = channels.map((ch) => ch._id);
            if (channelIds.length > 0) {
              channelFilter._id = { $in: channelIds };
              userMatch.channelId = { $in: channelIds };
            }
          }

          // Step 4: Use aggregation to get most recent incident per detectionType
          const recentGroupedIncidents = await Incident.aggregate([
            {
              $match: {
                incidentType: { $in: enabledDetectionTypes },
                Image: { $exists: true, $nin: [null, "", undefined,"https://"]},
                userId: user_id.toString(),
                ...filter
              }
            },
          
            // Lookup and unwind NVR data
            {
              $lookup: {
                from: 'nvrs',
                localField: 'nvrId',
                foreignField: '_id',
                as: 'nvrData',
                pipeline: [
                  {
                    $project: {
                      nvrName: 1
                    }
                  }
                ]
              }
            },
            {
              $unwind: {
                path: '$nvrData',
                preserveNullAndEmptyArrays: true
              }
            },
          
            // Lookup and unwind Channel data
            {
              $lookup: {
                from: 'channels',
                localField: 'channelId',
                foreignField: '_id',
                as: 'channelData',
                pipeline: [
                  {
                    $project: {
                      name: 1
                    }
                  }
                ]
              }
            },
            {
              $unwind: {
                path: '$channelData',
                preserveNullAndEmptyArrays: true
              }
            },
          
            // Sort and group to get latest incident per detection type
            {
              $sort: { timeOfIncident: -1 }
            },
            {
              $group: {
                _id: '$incidentType',
                latestIncident: { $first: '$$ROOT' }
              }
            },
            {
              $replaceRoot: { newRoot: '$latestIncident' }
            }
          ]);
                  // Mapping for display names
          let displayNameMap = {
            loiteringWithAuth: "Loitering With Authorization",
            loiteringWithoutAuth: "Loitering Without Authorization",
            lineCrossing: "Line Crossing Detection",
            unauthorizedAccess: "Intrusion Detection",
            countPersons:"Person Counting",
            genericObjectDetection: "Generic Object Detection",
            conveyorDetection: "Conveyor Detection",
            crusherDetection: "Crusher Detection",
            waterSpillageDetection: "Water Spillage Detection",
          };

          const incidentsByType = {};
          for (const detectionType of enabledDetectionTypes) {
            const match = recentGroupedIncidents.find(
              incident => incident.incidentType === detectionType
            );
            if (match) {
              match.displayName = displayNameMap[detectionType];
              incidentsByType[detectionType] = match;
            }
            incidentsByType[detectionType] = match || {};
          }
          // Step 5: Return response
          return res.send(
            Response.userSuccessResp("Fetched most recent incident per enabled detectionType", incidentsByType)
          );

        } catch (error) {
          logger.error(error);
          return res.status(500).json(
            Response.errorResp("Failed to fetch recent incidents", error.message)
          );
        }
      }


async getIncidentsByType(req, res, _next) {
  try {
    const data = req?.verified?.userData;
    const { skip = 0, limit = 10 ,incidentType} = req.query;
    let {startDate, endDate} = req.body;

    const allowedTypes = [
      'lineCrossing',
      'motionDetection',
      'genericObjectDetection',
      'loiteringWithAuth',
      'loiteringWithoutAuth',
      'unauthorizedAccess'
    ];

    // Validate incidentType
    if (!allowedTypes.includes(incidentType)) {
      return res.send(
        Response.validationFailResp("Invalid incident type provided", "Validation Failed!")
      );
    }

    // Step 1: Validate admin
    const isAdminExist = await adminModel.findOne({_id:req?.verified?.userData?.adminId});
    if (!isAdminExist) {
      return res.send(
        Response.validationFailResp("Admin not found!", "Validation Failed!")
      );
    }

    const matchStage = {
      userId: data?.user_id.toString(),
      incidentType,
      $or: [
        { triggerNotification: { $exists: false } },
        { triggerNotification: false }
      ]
    };
    if (startDate && endDate) {
      matchStage.timeOfIncident = {
        $gte: new Date(`${startDate}T00:00:00.000Z`),
        $lte: new Date(`${endDate}T23:59:59.999Z`)
      };
    }

    // Step 2: Aggregate pipeline
    const groupedIncidents = await Incident.aggregate([
      { $match: matchStage },
      // Sort before grouping to get latest per type
      { $sort: { timeOfIncident: -1 } },
      // Lookup nvrData
      {
        $lookup: {
          from: 'nvrs',
          localField: 'nvrId',
          foreignField: '_id',
          pipeline: [{ $project: { nvrName: 1 } }],
          as: 'nvrData'
        }
      },
      {
        $unwind: {
          path: '$nvrData',
          preserveNullAndEmptyArrays: true
        }
      },
      // Lookup channelData
      {
        $lookup: {
          from: 'channels',
          localField: 'channelId',
          foreignField: '_id',
          pipeline: [{ $project: { name: 1 } }],
          as: 'channelData'
        }
      },
      {
        $unwind: {
          path: '$channelData',
          preserveNullAndEmptyArrays: true
        }
      },

      // Pagination
      { $skip: parseInt(skip) },
      { $limit: parseInt(limit) }
    ]);

    // Step 3: Total count of unique incident types
    const totalCount = await Incident.countDocuments(matchStage);

    const allData = {
      totalCount,
      incidentData: groupedIncidents,
    };

    return res.send(
      Response.userSuccessResp("Dashboard incidents grouped by type fetched successfully", allData)
    );

  } catch (error) {
    logger.error(error);
    return res.status(500).json(
      Response.errorResp("Failed to fetch grouped incidents", error.message)
    );
  }
}

      
async getDetections(req, res, _next) {
  try {
    const data = req?.verified?.userData;
    const { skip = 0, limit = 10, detectionType, day } = req.query;
    let { startDate, endDate } = req.body;

    const allowedTypes = ['genericObjectDetection','countPersons','countVehicles', 'lineCrossing'];

    // Validate detectionType
    if (!allowedTypes.includes(detectionType)) {
      return res.send(
        Response.validationFailResp("Invalid detection type provided", "Validation Failed!")
      );
    }

    // Validate date filter input
    if (day === 'dateFilter') {
      if (!startDate || !endDate) {
        return res.send(
          Response.validationFailResp(
            "startDate, endDate, and day='dateFilter' are required together",
            "Validation Failed!"
          )
        );
      }
    } else if (startDate || endDate) {
      return res.send(
        Response.validationFailResp(
          "If startDate or endDate is provided, day must be 'dateFilter'",
          "Validation Failed!"
        )
      );
    }

    // Validate admin
    const isAdminExist = await adminModel.findOne({_id:req?.verified?.userData?.adminId});
    if (!isAdminExist) {
      return res.send(
        Response.validationFailResp("Admin not found!", "Validation Failed!")
      );
    }

    const matchStage = {
      userId: data?.user_id.toString(),
      incidentType: detectionType
    };

    const currentDate = new Date();
    let startOfDay, endOfDay;

    // Handle day filters
    if (day?.toLowerCase()?.includes("today")) {
      startOfDay = new Date(currentDate.setUTCHours(0, 0, 0, 0));
      endOfDay = new Date(currentDate.setUTCHours(23, 59, 59, 999));
    } else if (day?.toLowerCase()?.includes("yesterday")) {
      const yesterday = new Date(currentDate);
      yesterday.setUTCDate(currentDate.getUTCDate() - 1);
      startOfDay = new Date(yesterday.setUTCHours(0, 0, 0, 0));
      endOfDay = new Date(yesterday.setUTCHours(23, 59, 59, 999));
    }

    // Case 1: Filter by "today" or "yesterday"
    if (startOfDay && endOfDay) {
      matchStage.timeOfIncident = { $gte: startOfDay, $lte: endOfDay };

      const groupedIncidents = await Incident.aggregate([
        { $match: matchStage },
        { $sort: { timeOfIncident: -1 } },
        {
          $lookup: {
            from: 'nvrs',
            localField: 'nvrId',
            foreignField: '_id',
            pipeline: [{ $project: { nvrName: 1 } }],
            as: 'nvrData'
          }
        },
        {
          $unwind: {
            path: '$nvrData',
            preserveNullAndEmptyArrays: true
          }
        },
        {
          $lookup: {
            from: 'channels',
            localField: 'channelId',
            foreignField: '_id',
            pipeline: [{ $project: { name: 1 } }],
            as: 'channelData'
          }
        },
        {
          $unwind: {
            path: '$channelData',
            preserveNullAndEmptyArrays: true
          }
        },
        { $skip: parseInt(skip) },
        { $limit: parseInt(limit) }
      ]);

      const totalCount = await Incident.countDocuments(matchStage);

      const allData = {
        totalCount,
        incidentData: groupedIncidents,
      };

      return res.send(
        Response.userSuccessResp("Dashboard detections grouped by type fetched successfully", allData)
      );
    }

    // Case 2: Filter by custom date range
    if (startDate && endDate && day === "dateFilter") {
      matchStage.timeOfIncident = {
        $gte: new Date(`${startDate}T00:00:00.000Z`),
        $lte: new Date(`${endDate}T23:59:59.999Z`)
      };
    
      const groupedDetections = await Incident.aggregate([
        {
          $match: {
            ...matchStage,
            createdAt: { $ne: null },
            timeOfIncident: {
              $gte: new Date(`${startDate}T00:00:00.000Z`),
              $lte: new Date(`${endDate}T23:59:59.999Z`)
            }
          }
        },
        // Break timeSeries into separate docs
        { $unwind: "$timeSeries" },
      
        // Add createdDate field
        {
          $addFields: {
            createdDate: {
              $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
            }
          }
        },
      
        // Lookup NVR data
        {
          $lookup: {
            from: "nvrs",
            localField: "nvrId",
            foreignField: "_id",
            as: "nvrData"
          }
        },
        { $unwind: { path: "$nvrData", preserveNullAndEmptyArrays: true } },
      
        // Lookup Channel data
        {
          $lookup: {
            from: "channels",
            localField: "channelId",
            foreignField: "_id",
            as: "channelData"
          }
        },
        { $unwind: { path: "$channelData", preserveNullAndEmptyArrays: true } },
      
        // Project only required fields
        {
          $project: {
            _id: 1,
            date: {
              cameraId: "$cameraId",
              date: "$createdDate",
              incidentType: "$incidentType"
            },
            objectsDetected: "$timeSeries.objectsDetected",
            count: "$timeSeries.count",
            atoB: "$timeSeries.atoB",
            btoA: "$timeSeries.btoA",
            timeOfIncident: "$timeSeries.timestamp",
            createdAt: 1,
            updatedAt: 1,
            Image: 1,
            videoLink: 1,
            description: 1,
            incidentName: 1,
            cameraId: 1,
            userId: 1,
            zone: 1,
            severity: 1,
            type: 1,
            incidentType: 1,
            nvrData: {
              _id: "$nvrData._id",
              nvrName: "$nvrData.nvrName"
            },
            channelData: {
              _id: "$channelData._id",
              name: "$channelData.name"
            }
          }
        },
      
        // Sort by newest
        { $sort: { timeOfIncident: -1 } },
      
        // Apply pagination
        { $skip: parseInt(skip) },
        { $limit: parseInt(limit) }
      ]).allowDiskUse(true);

      const totalCount = await Incident.aggregate([
        {
          $match: {
            ...matchStage,
            createdAt: { $ne: null },
            timeOfIncident: {
              $gte: new Date(`${startDate}T00:00:00.000Z`),
              $lte: new Date(`${endDate}T23:59:59.999Z`)
            }
          }
        },
        { $unwind: "$timeSeries" },
        { $count: "count" }
      ]);
      
      const count = totalCount[0]?.count || 0;
      
      const allData = {
        totalCount: count,
        detectionData: groupedDetections
      };
    
      return res.send(
        Response.userSuccessResp("Dashboard detections grouped by type fetched successfully", allData)
      );
    }
    

    // If no condition matches, return fallback error
    return res.send(
      Response.validationFailResp("Invalid filter combination", "Validation Failed!")
    );

  } catch (error) {
    logger.error(error);
    return res.status(500).json(
      Response.errorResp("Failed to fetch grouped incidents", error.message)
    );
  }
}
}

// Format weekly data as array of { date: 'YYYY-MM-DD', value: <count> }
const formatWeeklyStats = (aggregatedData, startOfWeek) => {
  const result = [];

  // Initialize 7 days with value 0
  for (let i = 0; i < 7; i++) {
    const day = moment(startOfWeek).add(i, 'days').format('YYYY-MM-DD');
    result.push({
      date: day,
      value: 0
    });
  }

  // Fill values based on aggregated data
  aggregatedData.forEach(item => {
    const index = item._id.day - 1; // Monday = 1 -> index 0
    if (result[index]) {
      result[index].value = item.count;
    }
  });

  return result;
};

export default new DashboardService();
