import NVR from "../NVR/nvr.model.js";
import Channel from "../channels/channels.model.js";
import adminModel from "../admin/admin.model.js";
import logger from "../../../utils/logger.js";
import Response from "../../../utils/response.js";
import departmentModel from "../departments/departments.model.js"
import { all } from "axios";
import nvrModel from "../NVR/nvr.model.js";
import locationModel from "../locations/location.model.js";
import authorizedUsersModel from "../authorizedUsers/authorizedUsers.model.js";
class AuthorizedChannelService{
    async fetchChannels(req, res, _next) {
        try {
          let { user_id, adminId ,memberId} = req?.verified?.userData;
          let {
              locations,
              selectedLocationIds,
              departments,
              departmentIds,
              nvrs,
              nvrIds,
              channelIds,
            }=req.body;
            let isAdmin = await adminModel.findOne({ _id: adminId });
            if(!isAdmin) return res.send(Response.FailResp("Admin not found","Validation Failed!"));
            //To fetch all the Locations
            if(locations && locations===true){
                const Locations = await NVR.find(
                { userId: user_id, memberId },   // pass memberId in conditions
                "_id location"
                );


                return res.send(Response.SuccessResp("Locations fetched successfully", Locations));
            }
            //To fetch all the Departments based on Locations and nvrIds
            if((departments && departments===true )&& (selectedLocationIds && selectedLocationIds?.length>0)&&(nvrIds && nvrIds.length>=0)){
                //collect all NVRs based on selected locations
                let NVRs = await NVR.find(
                {
                    memberId,                         // for middleware authorization ONLY
                    userId: user_id,                  // actual DB filter
                    location: { $in: selectedLocationIds }
                }
                ).select("_id");

                let allNVRIds = NVRs.map(nvr=> nvr._id);

                //Filter NVR Ids if provided in request
                let filteredNVRIds = allNVRIds;

                if (nvrIds?.length) {
                const nvrSet = new Set(nvrIds);
                filteredNVRIds = allNVRIds?.filter(id => nvrSet?.has(id));
                }

                //collect all channels based on NVR Ids
                const channelIds = await Channel.find(
                { nvrId: { $in: filteredNVRIds } },  // query
                "_id department",                     // projection
                { memberId }                          // pass memberId to middleware
                );

                //collect all departmentArray from each channel and remove duplicates
                let departmentIdsSet = new Set();
                channelIds.forEach(channel => {
                    if (channel.department && Array.isArray(channel.department)) {
                        channel.department.forEach(deptId => departmentIdsSet.add(deptId.toString()));
                    }
                });
                
                const departmentIds = Array.from(departmentIdsSet);

                //Fetch Departments
                let Departments = await departmentModel.find(
                { adminId, _id: { $in: departmentIds } },  // query
                "_id departmentName",                      // projection
                { memberId }                               // pass memberId to middleware
                );

                return res.send(Response.SuccessResp("Departments fetched successfully", Departments));
            }

            //To fetch NVRs based on NVR Ids and Locations
            if((nvrs && nvrs===true) && (selectedLocationIds && selectedLocationIds.length>=0),(nvrIds && nvrIds.length>0)){

                let NVRs = await NVR.find(
                {
                    memberId,                         // for middleware authorization ONLY
                    userId: user_id,                  // actual DB filter
                    location: { $in: selectedLocationIds }
                }
                ).select("_id nvrName location model departmentIds");


                let allNVRIds = NVRs.map(nvr=> nvr._id);

                //Filter NVR Ids if provided in request
                let filteredNVRIds = allNVRIds;

                if (nvrIds?.length) {
                const nvrSet = new Set(nvrIds);
                filteredNVRIds = allNVRIds?.filter(id => nvrSet?.has(id));
                }
                NVRs = filteredNVRIds 
                return res.send(Response.SuccessResp("NVRs fetched successfully", NVRs));
            }



            //Fetch Channels
            let allChannels = [];
            //To fetch Channels based on Department Ids
            if((departmentIds&& departmentIds.length>0)&&(!nvrIds || nvrIds.length===0)){
            let Channels = await Channel.find(
            { department: { $in: departmentIds } },   // query
            "_id name nvrId customName",              // projection
            { memberId }                     // pass memberId to middleware
            );


                allChannels.push(...Channels);
       

                return res.send(Response.SuccessResp("Channels fetched successfully", allChannels));


            }

            //To fetch Channels based on NVR Ids
            if((nvrIds && nvrIds.length>0)){
           
                let channels = await Channel.find(
                { nvrId: { $in: nvrIds } },        // query
                "_id name nvrId customName",       // projection
                { memberId }                       // pass memberId to middleware
                );


                allChannels.push(...channels);
                return res.send(Response.SuccessResp("Channels fetched successfully", allChannels));

            }

            //To fetch channels by both depart and NVR Ids
            if((departmentIds&& departmentIds.length>0)&&(nvrIds && nvrIds.length>0)){
                // Step 4️⃣ : Fetch all Channels related to those NVRs
              

                const channels = await Channel.find(
                { 
                    nvrId: { $in: nvrIds },
                    department: { $in: departmentIds }
                },                                // query
                "_id name nvrId customName",      // projection
                { memberId }                      // pass memberId to middleware
                );

                allChannels.push(...channels);
                return res.send(Response.SuccessResp("Channels fetched successfully", allChannels));

            }
            return res.send(Response.FailResp("No valid filters provided","Validation Failed!"));
          
        } catch (err) {
          logger.error(err);
          return res
            .status(500)
            .json(
              Response.notFoundResp("Failed to retrieve channels", err.message)
            );
        }
      }

      async fetchLocations(req, res, _next) {
        try {
          let { user_id, adminId ,memberId} = req?.verified?.userData;
            let isAdmin = await adminModel.findOne({ _id: adminId });
            const {  nvrIds = [] ,channelsIds = [],departmentIds=[]} = req.body;
            if(!isAdmin) return res.send(Response.FailResp("Admin not found","Validation Failed!"));

            let fetchLocations = await locationModel.find(
                { adminId },
                "_id locationName",
                { memberId ,user:"nvr"}
            );

            const dbLocs = fetchLocations.map(loc => loc.locationName).filter(Boolean);

            const sendLocations = (fetched) => {
                const combined = [...new Set([...fetched, ...dbLocs].filter(Boolean))];
                return res.send(Response.SuccessResp("Locations fetched successfully", combined));
            };

            //Fetch locations form 
            //Filter based on nvrIds
            let fetchLOCByNvr = await fetchLocationsByNVRs(user_id,nvrIds,memberId);

            //Filter by NVR Ids only
            if(((nvrIds?.length>0)&&departmentIds?.length===0)&&(channelsIds?.length===0)){
                return sendLocations(fetchLOCByNvr);
            }

            //Filter by Department Ids only
            if(((nvrIds?.length===0)&&departmentIds?.length>0)&&(channelsIds?.length===0)){
                let fetchByDept = await fetchLocationsByDepartment(user_id,departmentIds,memberId);
                return sendLocations(fetchByDept);
            }

            //Filter by Channels Ids only
            if(((nvrIds?.length===0)&&departmentIds?.length===0)&&(channelsIds?.length>0)){
                let fetchByChannel = await fetchLocationsByChannels(user_id,channelsIds,memberId);
                return sendLocations(fetchByChannel);
            }

            //Filter by NVR and Channel Ids
            if(((nvrIds?.length>0)&&departmentIds?.length===0)&&(channelsIds?.length>0)){
                let fetchByChannel = await fetchLocationsByChannels(user_id,channelsIds,memberId);
                let finalLocations = fetchByChannel.filter(loc => fetchLOCByNvr.includes(loc));
                return sendLocations(finalLocations);
            }

            //Filter By NVR and Department Ids
            if(((nvrIds?.length>0)&&departmentIds?.length>0)&&(channelsIds?.length===0)){
                let fetchByDepartment = await fetchLocationsByDepartment(user_id,departmentIds,memberId);
                let finalLocations = fetchByDepartment.filter(loc => fetchLOCByNvr.includes(loc));
                return sendLocations(finalLocations);
            }

            //Filter By  Department and Channel Ids
            if(((nvrIds?.length===0)&&departmentIds?.length>0)&&(channelsIds?.length===0)){
                let fetchByDepartment = await fetchLocationsByDepartment(user_id,departmentIds,memberId);
                let fetchLOCByChannels = await fetchLocationsByChannels(user_id,channelsIds,memberId);
                let finalLocations = fetchByDepartment.filter(loc => fetchLOCByChannels.includes(loc));
                return sendLocations(finalLocations);
            }

            //Filter By NVR , Department and Channel Ids
            if(((nvrIds?.length>0)&&departmentIds?.length>0)&&(channelsIds?.length===0)){
                let fetchByDepartment = await fetchLocationsByDepartment(user_id,departmentIds,memberId);
                let fetchLOCByChannels = await fetchLocationsByChannels(user_id,channelsIds,memberId);

                // Find common locations in all 3 arrays
                const setDept = new Set(fetchByDepartment);
                const setChannel = new Set(fetchLOCByChannels);

                const finalLocations = fetchLOCByNvr.filter(loc =>
                    setDept.has(loc) && setChannel.has(loc)
                );

                return sendLocations(finalLocations);
            }
            
            //Without Filters
            let distinctLocations = await NVR.distinct("location", {memberId, userId: user_id ,queryType:"location"});
            return sendLocations(distinctLocations);

        } catch (err) {
          logger.error(err);
          
          return res
            .status(500)
            .json(
              Response.notFoundResp("Failed to retrieve locations", err.message)
            );
        }
      }

        async fetchDepartments(req, res) {
        try {
            const { user_id, adminId ,memberId} = req?.verified?.userData;
            const { selectedLocations = [], nvrIds = [] ,channelsIds = [], employeeLocations = []} = req.body;



            if (!adminId) {
            return res.send(Response.FailResp("Admin not found", "Validation Failed!"));
            }

            const isAdmin = await adminModel.findById(adminId);
            if (!isAdmin) {
            return res.send(Response.FailResp("Admin not found", "Validation Failed!"));
            }


            let allDepartments = [];

            let fetchByLocation = await fetchDepartmentsByLocation(user_id,selectedLocations,memberId,employeeLocations);




            //Filter based on only Locations
            if((selectedLocations?.length>0)&&(nvrIds?.length===0)&&(channelsIds?.length===0)){
                allDepartments.push(...fetchByLocation);
                return res.send(
                Response.SuccessResp("Departments fetched successfully", allDepartments)
            );
            }

            //Filter based on only Nvrs
            if((nvrIds?.length>0)&&(selectedLocations?.length===0)&&(channelsIds?.length===0)){
                let fetchDeptByNVR = await fetchDepartmentsByNVRs(user_id,nvrIds,memberId);
                allDepartments.push(...fetchDeptByNVR);
                return res.send(
                    Response.SuccessResp("Departments fetched successfully", allDepartments)
                );
            }

            //Filter based on only Channel Ids
            if((channelsIds?.length>0)&&(selectedLocations?.length===0)&&(nvrIds?.length===0)){
                let fetchDeptByChannelIds = await fetchDepartmentsByChannels(user_id,channelsIds,memberId);
                allDepartments.push(...fetchDeptByChannelIds);
                return res.send(
                    Response.SuccessResp("Departments fetched successfully", allDepartments)
                );
            }

            //Filter based on Location and Nvrs
            if((nvrIds?.length>0)&&(selectedLocations?.length>0)&&(channelsIds?.length===0)){
                let fetchDeptByNVR = await fetchDepartmentsByNVRs(user_id,nvrIds,memberId);
                allDepartments.push(...fetchDeptByNVR);
                //Intersection between NVRs and fetchDeptByNVR
                allDepartments = allDepartments.filter(nvrDept => fetchDeptByNVR?.some(locDept => locDept?._id?.toString() === nvrDept?._id?.toString()));
                return res.send(
                    Response.SuccessResp("Departments fetched successfully", allDepartments)
                );
            }

            //Filter based on Location and Channels
            if((nvrIds?.length===0)&&(selectedLocations?.length>0)&&(channelsIds?.length>0)){
                let fetchDeptByChannelIds = await fetchDepartmentsByChannels(user_id,channelsIds,memberId);
                allDepartments.push(...fetchDeptByChannelIds);
                //Intersection between NVRs and fetchDeptByNVR
                allDepartments = allDepartments.filter(channelDept => fetchByLocation?.some(locDept => locDept?._id?.toString() === channelDept?._id?.toString()));
                return res.send(
                    Response.SuccessResp("Departments fetched successfully", allDepartments)
                );
            }

            //Filter based on NVRIds and ChannelIds
            if((nvrIds?.length>0)&&(selectedLocations?.length===0)&&(channelsIds?.length>0)){
                let fetchDeptByNVR = await fetchDepartmentsByNVRs(user_id,nvrIds,memberId);
                let fetchDeptByChannelIds = await fetchDepartmentsByChannels(user_id,channelsIds,memberId);
                allDepartments.push(...fetchDeptByChannelIds);
                //Intersection between NVRs and fetchDeptByNVR
                allDepartments = allDepartments.filter(channelDept => fetchDeptByNVR?.some(nvrDept => nvrDept?._id?.toString() === channelDept?._id?.toString()));
                return res.send(
                    Response.SuccessResp("Departments fetched successfully", allDepartments)
                );
            }

            //Filter based on NvrIds ,ChannelIds and Locations
            if((nvrIds?.length>0)&&(selectedLocations?.length>0)&&(channelsIds?.length>0)){
                let fetchDeptByNVR = await fetchDepartmentsByNVRs(user_id,nvrIds,memberId);
                let fetchDeptByChannelIds = await fetchDepartmentsByChannels(user_id,channelsIds,memberId);
                //Intersection between NVRs and fetchDeptByNVR
                allDepartments = fetchByLocation.filter(locDept => fetchDeptByNVR?.some(nvrDept => nvrDept?._id?.toString() === locDept?._id?.toString()) && fetchDeptByChannelIds?.some(channelDept => channelDept?._id?.toString() === locDept?._id?.toString()));
                return res.send(
                    Response.SuccessResp("Departments fetched successfully", allDepartments)
                );
            }
            
            //Extract unique department IDs
            const channels = await Channel.find(
            { userId: user_id },          // keep this if it’s a separate field
            "_id department",             // projection
            { memberId }                  // pass memberId to middleware for auth
            );

            const departmentIds = new Set();
                    channels.forEach(ch => {
                    if (Array.isArray(ch.department)) {
                        ch.department.forEach(d => departmentIds.add(d.toString()));
                    }
            });        
            const idsArray = [...departmentIds];
            // 5. Fetch department list
            
            const Departments = await departmentModel.find(
            { adminId },  // query
            "_id departmentName",                 // projection
            { memberId }                          // pass memberId to middleware
            );

            
            allDepartments.push(...Departments)


            return res.send(
                    Response.SuccessResp("Departments fetched successfully", allDepartments)
            );

        } catch (err) {
            logger.error(err);
            return res.status(500).json(
            Response.notFoundResp("Failed to retrieve departments", err.message)
            );
        }
        }

        async fetchNVRS(req,res){
            try{
                let { user_id, adminId ,memberId} = req?.verified?.userData;
                    let { selectedLocations = [], departmentIds = [] ,channelsIds = []} = req.body;
                    let isAdmin = await adminModel.findOne({ _id: adminId });
                    if(!isAdmin) return res.send(Response.FailResp("Admin not found","Validation Failed!"));

                        let allNVRs =[];
                        let fetchByLocation = await fetchNVRsByLocation(user_id,selectedLocations,memberId);

                        //Filter based on only Locations
                        if((selectedLocations?.length>0)&&(departmentIds?.length===0)&&(channelsIds?.length===0)){
                            allNVRs.push(...fetchByLocation);
                            return res.send(Response.SuccessResp("NVRs fetched successfully", allNVRs));
                        }

                        //Filter based on DepartmentIds only
                        if((departmentIds?.length>0)&&(selectedLocations?.length===0)&&(channelsIds?.length===0)){
                            const channels = await Channel.find(
                                { department: { $in: departmentIds } }, // query
                                "nvrId",                                // projection
                                { memberId }                            // pass memberId to middleware
                                );

                            let nvrIdSet = new Set(channels.map(ch=> ch.nvrId.toString()));
                            let NVRs = await NVR.find(
                            {
                                memberId,                       // for middleware authorization ONLY
                                userId: user_id,                // actual DB filter
                                _id: { $in: Array.from(nvrIdSet) }
                            }
                            ).select("_id nvrName location model brand");

                            allNVRs.push(...NVRs);
                            return res.send(Response.SuccessResp("NVRs fetched successfully", allNVRs));
                        }

                        //Filter based on only Channel Ids
                        if((channelsIds?.length>0)&&(!selectedLocations || selectedLocations?.length===0)&&(!departmentIds || departmentIds?.length===0)){
                            const channels = await Channel.find(
                                { _id: { $in: channelsIds } }, // query
                                "nvrId",                       // projection
                                { memberId }                   // pass memberId to middleware
                                );

                            let nvrIdSet = new Set(channels.map(ch=> ch.nvrId.toString()));
                            let NVRs = await NVR.find(
                            {
                                memberId,                       // for middleware authorization ONLY
                                userId: user_id,                // actual DB filter
                                _id: { $in: Array.from(nvrIdSet) }
                            }
                            ).select("_id nvrName location model brand");

                            //Intersection between NVRs and fetchByLocation

                            allNVRs.push(...NVRs);
                            return res.send(Response.SuccessResp("NVRs fetched successfully", allNVRs));
                        }

                        //Filter based on Locations and DepartmentIds
                        if((selectedLocations?.length>0)&&(departmentIds?.length>0)&&(channelsIds?.length===0)){
                            const channels = await Channel.find(
                                    { department: { $in: departmentIds } }, // query
                                    "nvrId",                                // projection
                                    { memberId }                            // pass memberId to middleware
                                    );

                            let nvrIdSet = new Set(channels.map(ch=> ch.nvrId.toString()));
                            let NVRs = await NVR.find(
                            {
                                memberId,                       // for middleware authorization ONLY
                                userId: user_id,                // actual DB filter
                                _id: { $in: Array.from(nvrIdSet) },
                                location: { $in: selectedLocations }
                            }
                            ).select("_id nvrName location model brand");


                            allNVRs.push(...NVRs);
                            //Intersection between NVRs and fetchByLocation
                            allNVRs = allNVRs.filter(nvr => fetchByLocation?.some(locNVR => locNVR?._id?.toString() === nvr?._id?.toString()));
                            return res.send(Response.SuccessResp("NVRs fetched successfully", allNVRs));
                        }

                        //Filter based on Locations and Channels Ids
                        if((selectedLocations?.length>0)&&(channelsIds?.length>0)&&(departmentIds?.length===0)){
                            const channels = await Channel.find(
                                { _id: { $in: channelsIds } }, // query
                                "nvrId",                       // projection
                                { memberId }                   // pass memberId to middleware
                                );

                            let nvrIdSet = new Set(channels.map(ch=> ch.nvrId.toString()));
                            let NVRs = await NVR.find(
                            {
                                memberId,                       // for middleware authorization ONLY
                                userId: user_id,                // actual DB filter
                                _id: { $in: Array.from(nvrIdSet) },
                                location: { $in: selectedLocations }
                            }
                            ).select("_id nvrName location model brand");

                            
                            allNVRs.push(...NVRs);
                            //Intersection between NVRs and fetchByLocation
                            allNVRs = allNVRs.filter(nvr => fetchByLocation?.some(locNVR => locNVR?._id?.toString() === nvr?._id?.toString()));
                            return res.send(Response.SuccessResp("NVRs fetched successfully", allNVRs));
                        }

                        //Filter based on DepartmentIds and Channel Ids
                        if((departmentIds?.length>0)&&(channelsIds?.length>0)&&(selectedLocations?.length===0)){
                            //Fetch Nvrs by channel Ids
                            let NVRsByChannelsIds = await fetchNVRsByChannels(user_id,channelsIds,memberId);
                            //fetch Nvrs by departmentIds
                            let NVRsByDepartmentIds = await fetchNVRsByDepartmentIds(user_id,departmentIds,memberId);
                            //Intersection between NVRsByChannelIds and NVRsByDepartmentIds
                            let allNVRs = NVRsByChannelsIds.filter(nvr => NVRsByDepartmentIds?.some(deptNVR => deptNVR?._id?.toString() === nvr?._id?.toString()));
                            return res.send(Response.SuccessResp("NVRs fetched successfully", allNVRs));
                        }

                        //Filter based on Locations, Departments and Channel Ids
                        if((selectedLocations?.length>0)&&(departmentIds?.length>0)&&(channelsIds?.length>0)){
                            //Fetch Nvrs by channel Ids
                            let NVRsByChannelIds = await fetchNVRsByChannels(user_id,channelsIds,memberId);

                            //fetch Nvrs by departmentIds
                            let NVRsByDepartmentIds = await fetchNVRsByDepartmentIds(user_id,departmentIds,memberId);

                            //Intersection between NVRsByChannelIds , NVRsByDepartmentIds and fetchByLocation
                            let allNVRs = NVRsByChannelIds.filter(nvr => NVRsByDepartmentIds?.some(deptNVR => deptNVR?._id?.toString() === nvr?._id?.toString()) && fetchByLocation?.some(locNVR => locNVR?._id?.toString() === nvr?._id?.toString()));
                            return res.send(Response.SuccessResp("NVRs fetched successfully", allNVRs));
                        }

                         //Without any filters
                            let NVRs = await NVR.find(
                            {
                                memberId,                       // for middleware authorization ONLY
                                userId: user_id                 // actual DB filter
                            }
                            ).select("_id nvrName location model brand");

                            allNVRs.push(...NVRs);
                            return res.send(Response.SuccessResp("NVRs fetched successfully", allNVRs));




            }catch(err){
                logger.error(err);
                return res.status(500).json(
                Response.notFoundResp("Failed to retrieve NVRS", err.message)
                );
            }
        }

        async fetchChannelByNVRsOrDepartment(req,res,_next){
            try{
                let { user_id, adminId ,memberId} = req?.verified?.userData;
                    let searchQuery = req?.query?.searchQuery;
                    let { nvrIds = [], departmentIds = [] ,selectedLocations = [],isUserRegFilter=false ,camType} = req.body;
                    let isAdmin = await adminModel.findOne({ _id: adminId });
                    if(!isAdmin) return res.send(Response.FailResp("Admin not found","Validation Failed!"));

                    let channelByLocation = await fetchChannelsByLocation(user_id, selectedLocations,memberId,searchQuery,camType);
                    
                    let allChannels = [];

                    let allNVRList = await NVR.find({ userId: user_id }).select("_id nvrName brand");

                    //Filter based on only Locations
                    if(selectedLocations?.length>0&&(nvrIds.length===0)&&(departmentIds.length===0)){
                        allChannels.push(...channelByLocation);
                        if(isUserRegFilter){
                        // Group channels by nvrId
                            const groupedByNVR = allNVRList.map(nvr => {
                            const relatedChannels = allChannels.filter(ch => String(ch.nvrId) === String(nvr._id));

                            return {
                                nvrId: nvr._id,
                                nvrName: nvr.nvrName || nvr.name,
                                brand: nvr.brand,
                                channels: relatedChannels
                            };
                        });
                        return res.send(Response.SuccessResp("Channels fetched successfully",groupedByNVR))
                        }
                        return res.send(Response.SuccessResp("Channels fetched successfully", allChannels));
                    }

                    //Filter based on only NVRIds
                    if((nvrIds?.length>0)&&(departmentIds?.length===0)&&(selectedLocations?.length===0)){

                        let allNVRList = await NVR.find({
                                    _id: { $in: nvrIds },
                                    userId: user_id
                                    }).select("_id nvrName brand");

                        const query = {
                        nvrId: { $in: nvrIds }
                        };
                        
                        if (Array.isArray(camType) && camType.length > 0) {
                        query.checkType = { $in: camType };
                        }


                        if (searchQuery?.trim()) {
                        query.$or = [
                            { customName: { $regex: searchQuery, $options: "i" } },
                            { name: { $regex: searchQuery, $options: "i" } }
                        ];
                        }


                        const channels = await Channel.find(
                        query,
                        "_id name nvrId customName",
                        { memberId }
                        );

                        allChannels.push(...channels);
                        
                        if(isUserRegFilter){
                        // Group channels by nvrId
                            const groupedByNVR = allNVRList.map(nvr => {
                            const relatedChannels = allChannels.filter(ch => String(ch.nvrId) === String(nvr._id));

                            return {
                                nvrId: nvr._id,
                                nvrName: nvr.nvrName || nvr.name,
                                brand: nvr.brand,
                                channels: relatedChannels
                            };
                        });
                        return res.send(Response.SuccessResp("Channels fetched successfully",groupedByNVR))
                        }


                        return res.send(Response.SuccessResp("Channels fetched successfully", allChannels));

                    }


                    //Filter based on only Department Ids
                    if((departmentIds?.length>0)&&(nvrIds?.length===0)&&(selectedLocations?.length===0)){
                        const andConditions = [
                        { department: { $in: departmentIds } }
                        ];

                        if (Array.isArray(camType) && camType.length > 0) {
                        andConditions.push({
                            checkType: { $in: camType }
                        });
                        }

                        if (searchQuery?.trim()) {
                        andConditions.push({
                            $or: [
                            { customName: { $regex: searchQuery, $options: "i" } },
                            { name: { $regex: searchQuery, $options: "i" } }
                            ]
                        });
                        }


                        const channels = await Channel.find(
                        { $and: andConditions },
                        "_id name nvrId customName",
                        { memberId }
                        );


                        allChannels.push(...channels);
                        if(isUserRegFilter){
                        // Group channels by nvrId
                            const groupedByNVR = allNVRList.map(nvr => {
                            const relatedChannels = allChannels.filter(ch => String(ch.nvrId) === String(nvr._id));

                            return {
                                nvrId: nvr._id,
                                nvrName: nvr.nvrName || nvr.name,
                                brand: nvr.brand,
                                channels: relatedChannels
                            };
                        });
                        return res.send(Response.SuccessResp("Channels fetched successfully",groupedByNVR))
                        }
                        return res.send(Response.SuccessResp("Channels fetched successfully", allChannels));
                    }

                    //Filter based on NVRIds and Locations
                    if((nvrIds?.length>0)&&(selectedLocations?.length>0)&&(departmentIds?.length===0)){
                        
                        const query = {
                        nvrId: { $in: nvrIds }
                        };

                        if (Array.isArray(camType) && camType.length > 0) {
                        query.checkType = { $in: camType };
                        }

                        if (searchQuery?.trim()) {
                        query.$or = [
                            { customName: { $regex: searchQuery, $options: "i" } },
                            { name: { $regex: searchQuery, $options: "i" } }
                        ];
                        }


                        const channels = await Channel.find(
                        query,
                        "_id name nvrId customName",
                        { memberId }
                        );

                        allChannels.push(...channels);
                        //save channels that is present in both channelByLocation and allChannels , remove the rest
                        allChannels = allChannels.filter(ch => channelByLocation?.some(locCh => locCh?._id?.toString() === ch?._id?.toString()));


                        let allNVRList = await NVR.find({
                                    _id: { $in: nvrIds },
                                    userId: user_id
                                    }).select("_id nvrName brand");
                        if(isUserRegFilter){
                        // Group channels by nvrId
                            const groupedByNVR = allNVRList.map(nvr => {
                            const relatedChannels = allChannels.filter(ch => String(ch.nvrId) === String(nvr._id));

                            return {
                                nvrId: nvr._id,
                                nvrName: nvr.nvrName || nvr.name,
                                brand: nvr.brand,
                                channels: relatedChannels
                            };
                        });
                        return res.send(Response.SuccessResp("Channels fetched successfully",groupedByNVR))
                        }
                        return res.send(Response.SuccessResp("Channels fetched successfully", allChannels));
                    }

                    //Filter based on DepartmentIds and Locations
                    if((departmentIds?.length>0)&&(selectedLocations?.length>0)&&(nvrIds?.length===0)){

                        const query = {
                        department: { $in: departmentIds }
                        };

                        if (Array.isArray(camType) && camType.length > 0) {
                        query.checkType = { $in: camType };
                        }

                        if (searchQuery?.trim()) {
                        query.$or = [
                            { customName: { $regex: searchQuery, $options: "i" } },
                            { name: { $regex: searchQuery, $options: "i" } }
                        ];
                        }


                        const channels = await Channel.find(
                        query,
                        "_id name nvrId customName",
                        { memberId }
                        );

                        allChannels.push(...channels);
                        //save channels that is present in both channelByLocation and allChannels , remove the rest
                        allChannels = allChannels.filter(ch => channelByLocation?.some(locCh => locCh?._id?.toString() === ch?._id?.toString()));
                        if(isUserRegFilter){
                        // Group channels by nvrId
                            const groupedByNVR = allNVRList.map(nvr => {
                            const relatedChannels = allChannels.filter(ch => String(ch.nvrId) === String(nvr._id));

                            return {
                                nvrId: nvr._id,
                                nvrName: nvr.nvrName || nvr.name,
                                brand: nvr.brand,
                                channels: relatedChannels
                            };
                        });
                        return res.send(Response.SuccessResp("Channels fetched successfully",groupedByNVR))
                        }
                        return res.send(Response.SuccessResp("Channels fetched successfully", allChannels));
                    }

                    //Filter based on DepartmentIds and NvrIds
                    if((departmentIds?.length>0)&&(nvrIds?.length>0)&&(selectedLocations?.length===0)){
                        //getChannels by NVR
                        let NVRChannels = await fetchChannelsByNVRIdsAndLocation(user_id, nvrIds,memberId,searchQuery,camType);
                        //getChannels by Department
                        let DepartmentChannels = await fetchChannelsByDepartmentIdsAndLocation(user_id, departmentIds,memberId,searchQuery,camType);
                        //find intersection between NVRChannels and DepartmentChannels
                        allChannels = NVRChannels.filter(ch => DepartmentChannels?.some(deptCh => deptCh?._id?.toString() === ch?._id?.toString()));
                        let allNVRList = await NVR.find({
                                    _id: { $in: nvrIds },
                                    userId: user_id
                                    }).select("_id nvrName brand");
                        if(isUserRegFilter){
                        // Group channels by nvrId
                            const groupedByNVR = allNVRList.map(nvr => {
                            const relatedChannels = allChannels.filter(ch => String(ch.nvrId) === String(nvr._id));

                            return {
                                nvrId: nvr._id,
                                nvrName: nvr.nvrName || nvr.name,
                                brand: nvr.brand,
                                channels: relatedChannels
                            };
                        });
                        return res.send(Response.SuccessResp("Channels fetched successfully",groupedByNVR))
                        }
                        return res.send(Response.SuccessResp("Channels fetched successfully", allChannels));
                    }
                    
                    
                    //Filter based on NVRIds , DepartmentIds and Locations
                    if((nvrIds?.length>0)&&(departmentIds?.length>0)&&(selectedLocations?.length>0)){
                        //getChannels by NVR
                        let NVRChannels = await fetchChannelsByNVRIdsAndLocation(user_id, nvrIds,memberId,searchQuery,camType);
                        
                        
                        //getChannels by Department
                        let DepartmentChannels = await fetchChannelsByDepartmentIdsAndLocation(user_id, departmentIds,memberId,searchQuery,camType);
                        
                        //find intersection between NVRChannels , DepartmentChannels and channelByLocation
                        allChannels = NVRChannels.filter(ch => DepartmentChannels?.some(deptCh => deptCh?._id?.toString() === ch?._id?.toString()) && channelByLocation?.some(locCh => locCh?._id?.toString() === ch?._id?.toString()));
                        let allNVRList = await NVR.find({
                                    _id: { $in: nvrIds },
                                    userId: user_id
                                    }).select("_id nvrName brand");
                        if(isUserRegFilter){
                        // Group channels by nvrId
                            const groupedByNVR = allNVRList.map(nvr => {
                            const relatedChannels = allChannels.filter(ch => String(ch.nvrId) === String(nvr._id));

                            return {
                                nvrId: nvr._id,
                                nvrName: nvr.nvrName || nvr.name,
                                brand: nvr.brand,
                                channels: relatedChannels
                            };
                        });
                        return res.send(Response.SuccessResp("Channels fetched successfully",groupedByNVR))
                        }
                        return res.send(Response.SuccessResp("Channels fetched successfully", allChannels));
                    }


                    //Without any Filters
                    const query = {
                    userId: user_id
                    };

                    if (Array.isArray(camType) && camType.length > 0) {
                    query.checkType = { $in: camType };
                    }
                    
                    if (searchQuery?.trim()) {
                    query.$or = [
                        { customName: { $regex: searchQuery, $options: "i" } },
                        { name: { $regex: searchQuery, $options: "i" } }
                    ];
                    }


                    const channels = await Channel.find(
                    query,
                    "_id name nvrId customName",
                    { memberId }
                    );


                    allChannels.push(...channels);

                    if(isUserRegFilter){
                    // Group channels by nvrId
                        const groupedByNVR = allNVRList.map(nvr => {
                        const relatedChannels = allChannels.filter(ch => String(ch.nvrId) === String(nvr._id));

                        return {
                            nvrId: nvr._id,
                            nvrName: nvr.nvrName || nvr.name,
                            brand: nvr.brand,
                            channels: relatedChannels
                        };
                    });
                    return res.send(Response.SuccessResp("Channels fetched successfully",groupedByNVR))
                    }


                    return res.send(Response.SuccessResp("Channels fetched successfully",allChannels))



            }catch(error){
                
                logger.error(error);
                return res.status(500).json(
                Response.notFoundResp("Failed to retrieve NVRS", error.message)
                );
            }

        }

}



//Helper function for Locations
async function fetchLocationsByNVRs(userId,nvrIds,memberId){
    let distinctLocations = await NVR.distinct(
                            "location",
                            { memberId, userId, _id: { $in: nvrIds },queryType:"location" }
                            );
    

    return distinctLocations;
}

async function fetchLocationsByChannels(userId,channelIds,memberId){
    let locationChannels = await Channel.find(
        { _id: { $in: channelIds } },        // query
        "_id nvrId",                         // projection
        { memberId }  // <-- pass userId here
        );

    let nvrIdSet = new Set(locationChannels.map(ch=> ch.nvrId.toString()));
    let distinctLocations = await NVR.distinct(
    "location",
    {
        memberId,                   // for middleware authorization ONLY
        userId,                     // actual DB filter
        _id: { $in: [...nvrIdSet] },
        queryType:"location"
    }
    );

    return distinctLocations;
}

async function fetchLocationsByDepartment(userId,departmentId,memberId){
   let locationChannels = await Channel.find(
        { department: { $in: departmentId } }, // query
        "_id nvrId",                           // projection
        { memberId }  // <-- passed to middleware

        );

    let nvrIdSet = new Set(locationChannels.map(ch=> ch.nvrId.toString()));
    let distinctLocations = await NVR.distinct(
    "location",
    {
        memberId,                  // for middleware authorization ONLY
        userId,                   // real DB field
        _id: { $in: [...nvrIdSet] },
        queryType:"location"
        
    }
    );

    return distinctLocations;
}




//Helper function for Departments
async function fetchDepartmentsByLocation(userId,selectedLocations,memberId,employeeLocations){


    let NVRs = await NVR.find(
    {
        memberId,                    // only for middleware
        userId,                      // actual DB filter
        location: { $in: selectedLocations }
    }
    ).select("_id");

    
    //Fetch all the channels related to NVR
    const channels = await Channel.find(
    { nvrId: { $in: NVRs } },                       // query
    "_id department",                               // projection
    { memberId} // <-- pass memberId to middleware
    );
    

    //Extract unique department IDs
    const departmentIds = new Set();
            channels.forEach(ch => {
            if (Array.isArray(ch.department)) {
                ch.department.forEach(d => departmentIds.add(d.toString()));
            }
    });        



    // Also collect department IDs from authorized users mapped to these locations
    //get unique location list from employeeLocations and selectedLocations
    let locationList = [];
    locationList.push(...employeeLocations);
    locationList.push(...selectedLocations);
    locationList = [...new Set(locationList)];
    
    if (locationList && locationList.length > 0) {
        const authUsers = await authorizedUsersModel.find({ location: { $in: locationList } }, "departmentId");
        authUsers.forEach(user => {
            if (user.departmentId) {
                departmentIds.add(user.departmentId.toString());
            }
        });
    }

    const idsArray = [...departmentIds];
    
        // 5. Fetch department list
        const Departments = await departmentModel.find(
        { _id: { $in: idsArray } },    // normal query filter
        "_id departmentName",          // projection
        { memberId }                   // pass memberId for authorization
        );

        
    return Departments;
}

async function fetchDepartmentsByNVRs(userId,NvrIds,memberId){
    let NVRs = await NVR.find(
    {
        memberId,             // for middleware authorization ONLY
        userId,               // actual DB filter
        _id: { $in: NvrIds }
    }
    ).select("_id");

    //Fetch all the channels related to NVR
    const channels = await Channel.find(
    { nvrId: { $in: NVRs } },                       // query
    "_id department",                               // projection
    { memberId }    // <-- pass memberId to middleware
    );


    //Extract unique department IDs
    const departmentIds = new Set();
            channels.forEach(ch => {
            if (Array.isArray(ch.department)) {
                ch.department.forEach(d => departmentIds.add(d.toString()));
            }
    });        
    const idsArray = [...departmentIds];
        // 5. Fetch department list
    const Departments = await departmentModel.find(
    { _id: { $in: idsArray } },   // query
    "_id departmentName",         // projection
    { memberId }                  // pass memberId to middleware
    );

    return Departments;
}

async function fetchDepartmentsByChannels(userId,channelIds,memberId){
    //Fetch all the channels 
    const channels = await Channel.find(
    {
        userId,                      // this filters by DB field if needed
        _id: { $in: channelIds }
    },
    "_id department",
    { memberId }                     // <-- THIS goes to middleware
    );


    //Extract unique department IDs
    const departmentIds = new Set();
            channels.forEach(ch => {
            if (Array.isArray(ch.department)) {
                ch.department.forEach(d => departmentIds.add(d.toString()));
            }
    });        
    const idsArray = [...departmentIds];
        // 5. Fetch department list
    const Departments = await departmentModel.find(
    { _id: { $in: idsArray } },   // query
    "_id departmentName",         // projection
    { memberId }                  // pass memberId to middleware
    );


    return Departments;
}




//Helper functions for NVRs
async function fetchNVRsByLocation(userId,selectedLocations,memberId){
    let NVRs = await NVR.find(
    {
        memberId,                         // for middleware authorization ONLY
        userId,                           // actual DB filter
        location: { $in: selectedLocations }
    }
    ).select("_id nvrName location model brand");

    return NVRs
}

async function fetchNVRsByChannels(userId,channelIds,memberId){

    let channels = await Channel.find(
    { _id: { $in: channelIds } },   // query
    "nvrId",                        // projection
    { memberId }                    // pass memberId to middleware
    );
    let nvrIdSet = new Set(channels.map(ch=> ch.nvrId.toString()));
    let NVRs = await NVR.find(
    {
        memberId,                       // for middleware authorization ONLY
        userId,                         // actual DB filter
        _id: { $in: Array.from(nvrIdSet) }
    }
    ).select("_id nvrName location model brand");

    return NVRs
}

async function fetchNVRsByDepartmentIds(userId,departmentIds,memberId){
    let channels = await Channel.find(
    { department: { $in: departmentIds } }, // query
    "nvrId",                                // projection
    { memberId }                            // pass memberId to middleware
    );
    let nvrIdSet = new Set(channels.map(ch=> ch.nvrId.toString()));
    let NVRs = await NVR.find(
    {
        memberId,                       // for middleware authorization ONLY
        userId,                         // actual DB filter
        _id: { $in: Array.from(nvrIdSet) }
    }
    ).select("_id nvrName location model brand");

    return NVRs
}







//helper functions for Channels
async function fetchChannelsByLocation(userId, selectedLocations, memberId, searchQuery,camType) {
    // Step 1: Fetch NVRs based on selected locations
    let locationNVRs = await NVR.find(
        {
            memberId,   // middleware only
            userId,     // DB filter
            location: { $in: selectedLocations }
        }
    ).select("_id");

    let locationNVRIds = locationNVRs.map(nvr => nvr._id.toString());


    
    // Build base channel filter
    let channelFilter = {
        nvrId: { $in: locationNVRIds }
    };
    //Filter cameras by camType
    if (Array.isArray(camType) && camType.length > 0) {

      
        channelFilter.checkType = { $in: camType };
    }


    // Add search filter ONLY if searchQuery exists
    if (searchQuery?.trim()) {
        channelFilter.$or = [
            { customName: { $regex: searchQuery, $options: "i" } },
            { name: { $regex: searchQuery, $options: "i" } }
        ];
    }

    // Step 2: Fetch channels
    let channels = await Channel.find(
        channelFilter,                        // complete query
        "_id name nvrId customName",          // projection
        { memberId }                          // middleware option
    );

    return channels;
}

async function fetchChannelsByNVRIdsAndLocation(userId, nvrIds,memberId,searchQuery,camType){
    // Step 2: Fetch Channels based on these NVR IDs
    const query = {
    userId,                      // DB filter
    nvrId: { $in: nvrIds }
    };

    if (Array.isArray(camType) && camType.length > 0) {
    query.checkType = { $in: camType };
    }
    
    if (searchQuery?.trim()) {
    query.$or = [
        { customName: { $regex: searchQuery, $options: "i" } },
        { name: { $regex: searchQuery, $options: "i" } }
    ];
    }


    const channels = await Channel.find(
    query,
    "_id name nvrId customName",
    { memberId }
    );


    return channels

}
async function fetchChannelsByDepartmentIdsAndLocation(userId, departmentIds,memberId,searchQuery,camType){
    // Step 1: Fetch Channels based on department Ids
    const query = {
    department: { $in: departmentIds }
    };

    if (searchQuery?.trim()) {
    query.$or = [
        { customName: { $regex: searchQuery, $options: "i" } },
        { name: { $regex: searchQuery, $options: "i" } }
    ];
    }

    if (Array.isArray(camType) && camType.length > 0) {
    query.checkType = { $in: camType };
    }

    const channels = await Channel.find(
    query,
    "_id name nvrId customName",
    { memberId }
    );


    return channels
}
export default new AuthorizedChannelService();