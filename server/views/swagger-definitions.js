// Shared swagger request-body definitions (input shorthand for swagger-autogen).
// Imported by both swagger.config.js (v1) and swagger-v2.config.js (v2).
export const definitions = {
    registerNVR: {
      ip: "string",
      port: 80,
      rtspPort: 554,
      username: "username",
      password: "password",
      nvrName: "NVR 01",
      brand: "hikvision",
      location: "Banglore",
    },
    addNVR: {
      nvr: {
        nvrName: "Warehouse NVR 1",
        brand: "hikvision",
        deviceName: "Main Control Room NVR",
        location: "Warehouse - Ground Floor",
        domain: "https://example.com",
        localNvrId: "dyfdsi-idbuif-jhcbi-dbsdb",
      },
      cameras: [
        {
          name: "Entrance Gate",
          streamingPath: "/stream1",
          localChannelId: "dyfdsi-idbuif-jhcbi-dbsdb",
        },
        {
          name: "Storage Area",
          streamingPath: "/stream2",
          localChannelId: "dyfdsi-idbuif-jhcbi-dbsdb",
        },
      ],
    },
    updateNVR: {
      // ip: "string",
      // port: 80,
      // rtspPort: 554,
      // username: "username",
      // oldPassword: "oldPassword",
      // newPassword: "newPassword",
      // nvrName: "NVR 01",
      nvrName: "Warehouse NVR 1",
      brand: "hikvision",
      deviceName: "Main Control Room NVR",
      location: "Warehouse - Ground Floor",
      domain: "https://example.com",
      localNvrId: "4bdf1c25-1b37-4e24-8498-f32d07ae882d",
    },
    updateChannel: {
      detections: {
        fireDetection: {
          enabled: true,
        },
        unauthorizedAccess: {
          enabled: false,
        },
        facialRecognition: {
          enabled: true,
        },
        cashierTracking: {
          enabled: false,
        },
      },
      channelId: "4",
      rtspChannels: [],
      name: "IPCamera 04",
      ipAddress: "",
      model: "",
      serialNumber: "",
      firmwareVersion: "",
      detectionStatus: 0,
      control: 0,
      department: ["683e9d6b20784995fe40afec"],
      customName: "Entrance Camera",
      checkType: "checkin|checkout|none",
      alerts: ["683e9d6b20784995fe40afec"],
    },
    bulkUpdateChannels: {
      ids: ["channelId1", "channelId2"],
      inReview: true,
      control: 1, // 0: stop, 1: start, 2: pause
    },
    getPlayBackUrl: {
      channelId: "683e9d6b20784995fe40afec",
      startTime: "2025-06-06T10:00:00+05:30",
      endTime: "2025-06-06T11:00:00+05:30",
      sessionId: "fnvioueghrweu",
    },
    rtspCreate: {
      rtspURL: "rtsp://username:password@",
    },
    channelCreate: {
      nvrId: "nvrObjectId",
      name: "Channel 1",
      channelNumber: 1,
      streamUrl: "rtsp://username:password@",
    },
    getChannels: {
      channelId: "channelObjectId",
      nvrId: "nvrObjectId",
    },
    channelUpdate: {
      channelId: "channelObjectId",
      nvrId: "nvrObjectId",
      name: "Channel 1",
      channelNumber: 1,
      streamUrl: "rtsp://username:password@",
      resolution: "1920x1080",
      isActive: true,
    },
    deleteChannel: {
      channelId: "channelObjectId",
      nvrId: "nvrObjectId",
    },
    decodeToken: {
      token: "jhcbjdcvjk",
    },
    login: {
      login: "admin",
      pass: "12345",
    },
    getPlayBackTimeline: {
      nvrId: "6840008557303ece1125f621",
      cameraId: "6840008557303ece1125f623",
      channel: "101",
      startTime: "2025-05-22T00:00:00Z",
      endTime: "2025-05-24T23:59:59Z",
    },
    createIncidents: {
      incidentType: "countPersons",
      count: 52,
      timeOfIncident: "2025-05-27T15:00:00Z",
      videoLink: null,
      description: "Number of person present in the camera view.",
      incidentName: "number of persons",
      cameraId: "CAM606",
      nvrId: "6653420c5f86b7aa1c234567",
      channelId: "6653420c5f86b7aa1c998877",
      Image: "https://",
      zone: "Workstation 4",
      type: "gauge",
      severity: "moderate",
    },
    updateIncident: {
      incidentType: "countPersons",
      count: 52,
      timeOfIncident: "2025-05-27T15:00:00Z",
      videoLink: null,
      description: "Number of person present in the camera view.",
      incidentName: "number of persons",
      cameraId: "CAM606",
      nvrId: "6653420c5f86b7aa1c234567",
      channelId: "6653420c5f86b7aa1c998877",
      Image: "https://",
      zone: "Workstation 4",
      type: "gauge",
      severity: "moderate",
    },

    rtspPlayBackVideo: {
      startTime: "2023-10-01T00:00:00Z",
      endTime: "2023-10-01T01:00:00Z",
    },
    getIncidentsFilter: {
      startDate: "2025-05-01",
      endDate: "2025-05-30",
      nvrId: "68493b14b176a495112b6522",
      channelId: "68493b15b176a495112b6524",
      location: "Banglore",
      department: ["68493b14b176a495112b6522"],
      checkInOrCheckOutCamera: "checkin",
      reportStatus: true,
      incidentCrowdDetectionFilters: {
        incidentType: "crowdDetection",
        count: { min: 10, max: 100 },
      },
      incidentpersonalProtectiveEquipmentFilters: {
        incidentType: "personProtectiveEquipment",
        helmet: {
          yes: { min: 10, max: 100 },
          no: { min: 10, max: 100 },
        },
        safety_jacket: {
          yes: { min: 10, max: 100 },
          no: { min: 10, max: 100 },
        },
      },
      incidentTypeFilter: ["crowdDetection"],
    },
    updateChannelConfig: {
      enabled: false,
      settings: {
        videoLinkRequirement: true,
        video_min_length: null,
        video_max_length: null,
        level_of_importance: "medium",
        alertThreshold: 5,
        faceAuth: false,
        videoResolution: [1080, 720],
        referencePoints: {
          zone_1: [
            [399, 163],
            [1823, 198],
            [1861, 911],
            [469, 851],
          ],
          zone_2: [
            [399, 163],
            [1823, 198],
            [1861, 911],
            [469, 851],
          ],
        },
      },
    },
    createAlert: {
      detectionTypes: ["motion", "intrusion"],
      emails: [{ value: "admin@example.com" }],
      phoneNumbers: [{ value: "+919876543210" }],
      selectedNVRs: ["665fa7b38474cf77ff8ee4bd"],
      selectedCameras: ["665fab438474cf77ff8ee44c"],
    },
    updateAlert: {
      detectionTypes: ["motion", "intrusion"],
      emails: [{ value: "admin@example.com" }],
      phoneNumbers: [{ value: "+919876543210" }],
      selectedNVRs: ["665fa7b38474cf77ff8ee4bd"],
      selectedCameras: ["665fab438474cf77ff8ee44c"],
      removeDetectionTypes: ["loitering"],
      removeEmails: ["a@example.com", "b@example.com"],
      removePhones: ["+918888888888"],
      removeNVRs: ["665f27f14d7dc0ffb3d6cfa2"],
      removeCameras: ["665f28a14d7dc0ffb3d6cfaa"],
    },
    createRecipients: {
      email: "admin@example.com",
      phoneNumber: "+919876543210",
      incidentTypes: ["crowdDetection", "personProtectiveEquipment"],
    },
    updateRecipient: {
      incidentTypes: ["crowdDetection", "personProtectiveEquipment"],
    },
    recentMailOrSMS: {
      email: "admin@example.com",
      phoneNumber: "+919876543210",
    },
    adminSignup: {
      user_id: "usr12345",
      login: "jdoe",
      name_f: "John",
      name_l: "Doe",
      email: "john.doe@example.com",
    },
    dashboardHeaderStats: {
      startDate: "2025-05-01",
      endDate: "2025-05-30",
      nvrId: "68493b14b176a495112b6522",
      channelId: "68493b15b176a495112b6524",
      location: "Banglore",
      department: ["68493b14b176a495112b6522"],
      checkInOrCheckOutCamera: "checkin",
      reportStatus: true,
      incidentTypeFilter: ["crowdDetection"],
      incidentCrowdDetectionFilters: {
        incidentType: ["crowdDetection"],
        count: { min: 10, max: 100 },
      },
      incidentpersonalProtectiveEquipmentFilters: {
        incidentType: ["personProtectiveEquipment"],
        helmet: {
          yes: { min: 10, max: 100 },
          no: { min: 10, max: 100 },
        },
        safety_jacket: {
          yes: { min: 10, max: 100 },
          no: { min: 10, max: 100 },
        },
      },
    },
    deleteRecipients: {
      emailToRemove: "alertuser@example.com",
      phoneToRemove: "+911234567890",
    },
    detectionGraphStats: {
      nvrId: "68493b14b176a495112b6522",
      channelId: "68493b15b176a495112b6524",
      location: "Banglore",
      department: ["68493b14b176a495112b6522"],
    },
    WeeklyComparisonChart: {
      nvrId: "68493b14b176a495112b6522",
      channelId: "68493b15b176a495112b6524",
      location: "Banglore",
      department: ["68493b14b176a495112b6522"],
    },
    createAuthUser: {
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@example.com",
      profilePics: ["https://example.com/jane1.jpg"],
      roleIds: ["68493b15b176a495112b6524", "68493b14b176a495112b6522"],
      departmentId: "68493b14b176a495112b6522",
      shift_id: "68493b14b176a495112b6522",
      password: "SecurePass123",
    },
    createUser: {
      userName: "testuser",
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@example.com",
      profilePics: ["https://example.com/jane1.jpg"],
      roleIds: ["68c1386d29ecd6979fd0494f"],
      password: "SecurePass123",
      confirmPassword: "SecurePass123",
      authorizedChannelsData: {
        locations: ["Banglore"],
        nvrIds: ["68493b14b176a495112b6522", "68493b15b176a495112b6524"],
        departmentIds: ["68493b14b176a495112b6522", "68493b15b176a495112b6524"],
        channelIds: ["68493b15b176a495112b6524", "68493b14b176a495112b6522"],
        employeeLocations: ["Banglore"],
      },
    },
    createLocation:{
      locationName: "Banglore",
      empLocationId: "BLR001",
    },
    updateAuthUser: {
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@example.com",
      profilePics: ["https://example.com/jane1.jpg"],
      roleIds: ["68493b15b176a495112b6524", "68493b14b176a495112b6522"],
      departmentId: "68493b14b176a495112b6522",
      shift_id: "68493b14b176a495112b6522",
    },
    updateUser: {
      userName: "updatedUser",
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@example.com",
      roleIds: ["68493b15b176a495112b6524"],
      authorizedChannelsData: {
        locations: ["Banglore"],
        nvrIds: ["68493b14b176a495112b6522", "68493b15b176a495112b6524"],
        departmentIds: ["68493b14b176a495112b6522", "68493b15b176a495112b6524"],
        channelIds: ["68493b15b176a495112b6524", "68493b14b176a495112b6522"],
        employeeLocations: ["Banglore"],
      },
    },
    updateSidebarConfig: {
      detectionConfigs: [
        { detectionType: "countPersons", isEnabled: true },
        {
          detectionType: "motionDetection",
          isEnabled: false,
          allowedDetection: false,
        },
      ],
    },
    createDetectionSettings: {
      name: "Main Gate Count",
      settingType: "countPersonsSettings",
      channelId: ["68493b15b176a495112b6524"],
      NVRId: "68493b14b176a495112b6522",
      enabled: true,
      alerts: ["68493b14b176a495112b6522"],
      settings: {
        imageRequired: true,
        videoLinkRequirement: false,
        videoMinLength: 10,
        videoMaxLength: 60,
        videoDuration: 10,
        levelOfImportance: "moderate",
        videoResolution: [1280, 720],
        detectionTimeGap: 15,
        referencePoints: {
          1: [
            [10, 10],
            [110, 10],
            [110, 110],
            [10, 110],
          ],
        },
        metricType: "gauge",
      },
    },
    updateDetectionSettings: {
      name: "Main Gate Count",
      channelId: ["68493b15b176a495112b6524"],
      NVRId: "68493b14b176a495112b6522",
      enabled: true,
      settings: {
        imageRequired: false,
        videoLinkRequirement: false,
        videoMinLength: 0,
        videoMaxLength: 0,
        videoDuration: 10,
        levelOfImportance: "low",
        videoResolution: [1280],
        detectionTimeGap: 0,
        referencePoints: {
          2: [
            [10, 10],
            [110, 10],
            [110, 110],
            [10, 110],
          ],
        },
        metricType: "gauge",
      },
    },
    updateDetectionSchedule: {
      mode: "custom",
      days: {
        monday: [{ start: "09:00", end: "18:00" }],
        tuesday: [{ start: "09:00", end: "18:00" }],
        wednesday: [{ start: "09:00", end: "18:00" }],
        thursday: [{ start: "09:00", end: "18:00" }],
        friday: [{ start: "09:00", end: "18:00" }],
        saturday: [],
        sunday: [],
      },
    },
    getIncidentsDetails: {
      ActiveChannels: true,
      criticalIncidents: true,
      totalIncidents: true,
      resolvedIncidents: true,
      startDate: "2025-05-01",
      endDate: "2025-05-30",
    },
    dashboardCriticalityStats: {
      nvrId: "68493b14b176a495112b6522",
      channelId: "68493b15b176a495112b6524",
      location: "Banglore",
      department: ["68493b14b176a495112b6522"],
    },
    settingsAttach: {
      channelId: "664fa3901df2e03469c36a25",
      detectionSettingId: "665abbeab80991a2a4b278f5",
    },
    settingsDetach: {
      channelId: "664fa3901df2e03469c36a25",
      detectionSettingId: "665abbeab80991a2a4b278f5",
    },
    getDetections: {
      startDate: "2025-06-01",
      endDate: "2025-06-30",
    },
    activateStorage: {
      activate: true,
      storageId: "storageObjectId",
    },
    importEMPUsers: {
      usersData: [
        {
          id: 29017,
          u_id: 57968,
          first_name: "Rithika",
          name: "Rithika",
          last_name: "A",
          email: "rithika.r12@globussoft.in",
          phone: "91-8412579632",
          date_join: null,
          address: null,
          photo_path: "/default/profilePic/user.png",
          status: 1,
          organization_id: 246,
          location_id: 643,
          location: "belgum",
          department_id: 496,
          emp_code: "Ri24",
          shift_id: null,
          timezone: "Africa/Johannesburg",
          tracking_mode: 1,
          tracking_rule_type: 1,
          department: "Devops",
          role_id: 554,
          role: "Employee",
          role_type: 1,
          total_count: 207,
          full_name: "Rithika A",
          password: "Rithika@124",
          software_version: null,
          shift_name: null,
          shift_data: null,
          computer_name: null,
          username: null,
          domain: null,
          employee_unique_id: "rithika.r12@globussoft.in",
          project_name: "",
          roles: [
            {
              role_id: 554,
              role: "Employee",
              role_type: 1,
            },
          ],
          encriptedpassword:
            "00035c764975e1bbc4131cfc6c7a2171:b23a22f129469bffdac9abfe635163b4",
          assigned: [],
          importedStatus: true,
        },
      ],
    },
    CreateRole: {
      role: "Employee",
    },
    UpdateRole: {
      role: "member",
    },
    createDepartment: {
      orgId: "234",
      departmentName: "Human Resources",
      description: "Handles employee relations, payroll, and hiring",
      empDepartmentId: 101,
      isActive: true,
      isImportedFromEMP: true,
      softDelete: false,
    },
    getDepartment: {
      skip: 0,
      limit: 10,
      search: "Software Developers",
    },
    getRoles: {
      skip: 0,
      limit: 10,
      search: "employee",
    },
    updateDepartment: {
      departmentName: "Human Resources",
      description: "Handles employee relations, payroll, and hiring",
      empDepartmentId: 101,
      isActive: true,
      isImportedFromEMP: true,
      softDelete: false,
    },
    fetchAuthUser: {
      roleIds: ["664fa3901df2e03469c36a25", "665abbeab80991a2a4b278f5"],
      departmentIds: ["665abbeab80991a2a4b278f5"],
      locations:["Bangalore"]
    },
    addProfile: {
      basics: {
        profileName: "Office Night Security",
        timeZone: "Asia/Kolkata",

        days: {
          monday: [
            { startTime: "08:00", endTime: "13:00" },
            { startTime: "22:00", endTime: "06:00" },
          ],
          tuesday: [{ startTime: "22:00", endTime: "06:00" }],
          wednesday: [{ startTime: "22:00", endTime: "06:00" }],
          thursday: [{ startTime: "22:00", endTime: "06:00" }],
          friday: [{ startTime: "22:00", endTime: "06:00" }],
          saturday: [],
          sunday: [],
        },
      },

      notification: {
        notify: "Digest",
        digestEveryMinutes: 15,

        recipients: ["696f7cc14d5b08f6f069331f"],

        channels: {
          email: true,
          smsWhatsapp: false,
          push: true,
          webhook: true,
        },

        webhooks: [
          {
            url: "http://example.com/hooks/alerts",
            method: "POST",
            body: '{ "alert": "{ALERT_TYPE}", "time": "{TIME}" }',
          },
        ],

        enableQuietHours: true,
        quietFrom: "23:00",
        quietTo: "05:00",
        quietMode: "Digest only",

        maxNotificationsPerDay: {
          low: 24,
          moderate: 48,
          high: 10,
          critical: 5,
        },

        stormControl: {
          perMinuteCap: 20,
          perDayCap: 200,
          onCap: "Digest only",
          critical: 2,
        },
      },

      evidenceSeverity: {
        evidenceType: "Snapshot",
        time: 15,
        storage: "6978b866c6c20957249b33ef",
      },

      defaultDetectionSettings: {
        authorisedUsers: [
          "68ff2fcb69588fda40c8c704",
          "68ff2fcb69588fda40c8c704",
        ],
        objects: {
          personalProtectiveEquipment: [
            { name: "Helmet", notify: true, enable: true },
            { name: "Vest", notify: false, enable: false },
          ],
          crowdDetection: [{ name: "Crowd", notify: true, enable: true }],
        },
      },
    },
    logAttendance: {
      cameraType: "checkin",
      // imageUrl: "",
      employeeId: "650fcbd12ab34c9876de1234",
      userId: "650fcbd12ab34c9876de1234",
      nvrId: "6840008557303ece1125f621",
      channelId: "6840008557303ece1125f623",
      images: {
        face: "https://example.com/frame.jpg",
        person: "https://example.com/cropped.jpg",
        frame: "https://example.com/person.jpg",
      },
      confidenceScore: 95.0,
    },
    UpdateRole: {
      role: "member",
    },
    createDepartment: {
      orgId: "234",
      departmentName: "Human Resources",
      description: "Handles employee relations, payroll, and hiring",
      empDepartmentId: 101,
      isActive: true,
      isImportedFromEMP: true,
      softDelete: false,
    },
    getDepartment: {
      skip: 0,
      limit: 10,
      search: "Software Developers",
    },
    getRoles: {
      skip: 0,
      limit: 10,
      search: "employee",
    },
    updateDepartment: {
      departmentName: "Human Resources",
      description: "Handles employee relations, payroll, and hiring",
      empDepartmentId: 101,
      isActive: true,
      isImportedFromEMP: true,
      softDelete: false,
    },
    fetchAuthUser: {
      roleIds: ["664fa3901df2e03469c36a25", "665abbeab80991a2a4b278f5"],
      departmentId: "665abbeab80991a2a4b278f5",
      locations:["Bangalore"]
    },
    createAccessLogs: {
      adminId: "68493b15b176a495112b6520",
      userId: "68493b15b176a495112b6524",
      personName: "Unauthorized person",
      timestamp: "2025-06-10T09:15:00.000Z",
      cameraId: "684954f488ba3228238e466f",
      nvrId: "684954f488ba3228238e466d",
      action: "https://",
    },
    getAccessLogs: {
      startDate: "2025-06-01",
      endDate: "2025-06-30",
      fromTime: "13:00",
      toTime: "14:00",
      searchQuery: "John",
      nvrIds: ["664fa3901df2e03469c36a25", "665abbeab80991a2a4b278f5"],
      channelIds: ["664fa3901df2e03469c36a25", "665abbeab80991a2a4b278f5"],
      departmentIds: ["664fa3901df2e03469c36a25", "665abbeab80991a2a4b278f5"],
      employeeLocations:["bangalore","hyderabad"],
      getAccessLogs: false,
      isExport: false,
      tag: null,
      skip: 0,
      limit: 10,
    },
    getAttendance:{
     employeeLocations:["bangalore","hyderabad"]
    },
    updateAdminPermissions:{
      adminId:"68493b15b176a495112b6524",
      permissionConfig:{
        
      }
    },
    getUserLogs:{
      employeeId:"68493b15b176a495112b6524",
      date:"2025-06-01",
    },
    getUserSessionReport:{
      userId:"68493b15b176a495112b6524",
      startDate:"2025-06-01",
      endDate:"2025-06-30",
    },
    updateLogsSound: {
      logsSound: true,
    },
    // Only the keys you send are changed; null reverts one to the global
    // DataRetention config. Periods accept "90d" | "3m" | "1y" | "never".
    updateRetention: {
      userId: "22",
      enabled: true,
      incidents: "1y",
      attendance: "6m",
      accessLogs: "never",
      batchSize: 200,
      maxRunMinutes: 60,
      intervalHours: 24,
    },
    bulkExportProfiles: {
      ids: ["684954f488ba3228238e466d", "684954f488ba3228238e466d"],
    },
    fetchObjectTypes: {
      objectTypes: [
        "generic",
        "vehicles",
        "traffic_and_road_items",
        "people",
        "animals",
        "accessories",
        "sports_and_recreation",
        "kitchen_and_dining",
        "food_and_drink",
        "furniture",
        "decor_and_household_items",
        "electronics",
        "appliances",
      ],
    },
    createAuthorizedObjects: {
      objectType: "vehicles",
      objectNames: ["Car", "Truck", "Bike"],
    },
    updateAuthorizedObjects: {
      _id: "684954f488ba3228238e466d",
      objectType: "vehicles",
      objectNames: ["Car", "Truck", "Bike", "Bus"],
    },
    CreatePermissions: {
      permissionName: "C1",
      permissionConfig: {
        project: { view: true, create: false, edit: false, delete: false },
        task: { view: true, create: false, edit: false, delete: false },
        subtask: { view: true, create: false, edit: false, delete: false },
        user: { view: true, create: false, edit: false, delete: false },
        roles: { view: true, create: false, edit: false, delete: false },
        comments: { view: true, create: false, edit: false, delete: false },
        upload: { view: true, create: false, edit: false, delete: false },
        links: { view: true, create: false, edit: false, delete: false },
        activity: { view: true, create: false, edit: false, delete: false },
      },
    },
    UpdatePermission: {
      permissionName: "Execute",
      permissionConfig: {
        dashboard: { view: true, create: false, edit: false, delete: false },
        user: { view: true, create: false, edit: false, delete: false },
        roles: { view: true, create: false, edit: false, delete: false },
        permission: { view: true, create: false, edit: false, delete: false },
        comments: { view: true, create: false, edit: false, delete: false },
        upload: { view: true, create: false, edit: false, delete: false },
        teams: { view: true, create: false, edit: false, delete: false },
        practice: { view: true, create: false, edit: false, delete: false },
      },
    },
    bulkDeletePermission: {
      permissionConfig: [
        {
          moduleName: "Dashboard",
        },
        {
          moduleName: "team",
        },
      ],
    },
    bulkUpdatePermission: {
      permissionConfig: [
        {
          moduleName: "Dashboard",
          view: false,
          create: false,
          edit: false,
          delete: false,
        },
      ],
    },
    rolesPermissions: {},
    CreateRoles: {
      roles: ["manager"],
    },
    UpdateRoleName: {
      roleName: "Manager",
      roleCreate: true,
      roleEdit: true,
      roleDelete: true,
      roleView: true,
    },

    authUserLogin: {
      usernameOrEmail: "exampleUser",
      password: "examplePassword",
    },
    bulkDeleteUser: {
      userIds: ["684954f488ba3228238e466d", "684954f488ba3228238e466d"],
    },
    forgotPassword: {
      email: "testuser@example.com",
    },
    resetPassword: {
      token: "a12b34c56d...",
      newPassword: "MyNewPass@123",
      confirmPassword: "MyNewPass@123",
    },
    changePassword: {
      currentPassword: "OldPass@123",
      newPassword: "NewPass@123",
      confirmPassword: "NewPass@123",
    },
    fetchAuthChannels: {
      locations: true,
      departments: true,
      selectedLocationIds: [
        "68493b14b176a495112b6522",
        "68493b15b176a495112b6524",
      ],
      nvrIds: ["68493b14b176a495112b6522", "68493b15b176a495112b6524"],
      departmentIds: ["68493b14b176a495112b6522", "68493b15b176a495112b6524"],
    },
    createAccessLogRecord: {
      adminId: "68493b15b176a495112b6520",
      userId: "68493b15b176a495112b6524",
      personName: "John Doe",
      timestamp: "2025-06-10T09:15:00.000Z",
      cameraId: "684954f488ba3228238e466f",
      nvrId: "684954f488ba3228238e466d",
      images: {
        face: "https://example.com/frame.jpg",
        person: "https://example.com/cropped.jpg",
        frame: "https://example.com/person.jpg",
      },
      confidenceScore: 92.5,
    },
    fetchAllDepartments: {
      nvrIds: ["68493b14b176a495112b6522", "68493b15b176a495112b6524"],
      channelsIds: ["68493b14b176a495112b6522", "68493b15b176a495112b6524"],
      selectedLocations: ["Bangalore", "Chennai"],
      employeeLocations: ["Bangalore", "Chennai"],
    },
    fetchAllNVRS: {
      channelsIds: ["68493b14b176a495112b6522", "68493b15b176a495112b6524"],
      departmentIds: ["68493b14b176a495112b6522", "68493b15b176a495112b6524"],
      selectedLocations: ["Bangalore", "Chennai"],
    },
    fetchLocations: {
      nvrIds: ["68493b14b176a495112b6522", "68493b15b176a495112b6524"],
      channelsIds: ["68493b14b176a495112b6522", "68493b15b176a495112b6524"],
      departmentIds: ["68493b14b176a495112b6522", "68493b15b176a495112b6524"],
    },
    fetchChannels: {
      nvrIds: ["68493b14b176a495112b6522", "68493b15b176a495112b6524"],
      departmentIds: ["68493b14b176a495112b6522", "68493b15b176a495112b6524"],
      selectedLocations: ["Bangalore", "Chennai"],
      camType: ["checkout", "checkin"],
    },
    registerDomain: {},
    updateReportStatus: {
      incidentId: "665fa7b38474cf77ff8ee4bd",
      status: true,
      description: "Report has been reviewed and necessary actions taken.",
    },
    startDetection: {
      channelId: "68493b15b176a495112b6524",
      detectionType: "personalProtectiveEquipmentSettings",
      enable: true,
    },
    addObjects: {
      settingType: "personalProtectiveEquipment",
      objects: ["helmet", "vest"],
    },
    deleteObjects: {
      settingType: "personalProtectiveEquipment",
      objects: ["helmet", "vest"],
    },
    addShift: {
      name: "Night Shift",
      color: "#3B82F6",

      timings: {
        monday: {
          enabled: true,
          start: "22:00",
          end: "06:00",
        },
        tuesday: {
          enabled: true,
          start: "22:00",
          end: "06:00",
        },
        wednesday: {
          enabled: true,
          start: "22:00",
          end: "06:00",
        },
        thursday: {
          enabled: true,
          start: "22:00",
          end: "06:00",
        },
        friday: {
          enabled: true,
          start: "22:00",
          end: "06:00",
        },
        saturday: {
          enabled: false,
        },
        sunday: {
          enabled: false,
        },
      },

      settings: {
        lateLogin: 10,
        earlyLogout: 15,
        halfDay: "04:00",
        overTime: "01:00",
        halfDayProductiveTime: "04:30",
        fullDayProductiveTime: "08:30",
      },

      note: "Night shift for security and operations team",
    },
    autoEmailReportCreate: {
      reportsTitle: "AdminReport",
      frequency: [
        {
          Daily: 0,
          Weekly: 0,
          Monthly: 0,
          Time: "00:00",
          Date: {
            startDate: null,
            endDate: null,
          },
        },
      ],
      Recipients: ["email1@example.com", "email2@example.com"],
      ReportsType: [
        {
          pdf: 1,
          csv: 0,
        },
      ],
      Content: [
        {
          consolidatedReport: 1,
          task: 0,
          clients: 0,
          leaves: 0,
          tags: 0,
          role: 0,
        },
      ],
      filter: {
        wholeOrganization: 0,
        specificEmployees: [
          {
            id: "6745720f4e154ebc760ab43d",
          },
        ],
      },
    },
    mockJobs: {
      profileId: "6745720f4e154ebc760ab43d",
    },
    deleteIncidentsByIds: {
      incidentIds: ["6745720f4e154ebc760ab43d", "6745720f4e154ebc760ab43d"],
    },
    updateAdmin: {
      adminId: "6745720f4e154ebc760ab43d",
      email: "[EMAIL_ADDRESS]",
      name_f: "John",
      name_l: "Doe",
    },
    RegisterEntryUser: {
      firstName: "John",
      lastName: "Doe",
      email: "",
      profileImages: ["/john.jpg"],
    },
    LogEntry: {
      adminId: "6840008557303ece1125f623",
      userId: "6840008557303ece1125f623",
      channelId: "6840008557303ece1125f623",
      nvrId: "6840008557303ece1125f621",
      images: {
        face: "/frame.jpg",
        person: "/cropped.jpg",
        frame: "/person.jpg",
        vehicle: "/vehicle.jpg",
      },
    },
    VehicleLog: {
      vehicleNumber: "AB123CD",
      adminId: "6840008557303ece1125f623",
      channelId: "6840008557303ece1125f623",
      nvrId: "6840008557303ece1125f621",
      images: {
        vehicle: "/vehicle.jpg",
      },
    },
    bulkImportAuthUser: {
      users: [
        {
          firstName: "John",
          lastName: "Doe",
          email: "",
          userName: "",
        },
      ],
    },
    deskAbsenceData:{
      date:"2025-06-10"
    },
    guardAbsenceData:{
      date:"2025-06-10",
      nvrIds: ["6745720f4e154ebc760ab43d"],
      channelIds: ["6745720f4e154ebc760ab43d"]
    },
    addEMPEmails:{
      emails: ["example1@gmail.com", "example2@gmail.com"]
    },
    updateEMPEmail:{
      oldEmail: "example1@gmail.com",
      newEmail: "example2@gmail.com"
    },
    deleteEMPEmail:{
      email: "example1@gmail.com"
    },
    updateLocation:{
      locationName: "Banglore",
      empLocationId: "BLR001",
    },

    allOrgEmployee:{
            skip:0,
            limit:10,
            name:"John",
            location_id: "378",
            orgIdFilter: "385"
        },
    editIncidentDetails:{
        "incidentType": "vehicleDetection",
        "nvrId": "nvr_id_123",
        "channelId": "channel_id_456",
        "count": 1,
        "vehicleType": "sedan",
        "licensePlate": "KA01AB1234",
        "vehicleColor": "white",
        "vehicleModel": "Honda Civic",
        "confidence": 0.95,
        "detectTime": "2026-07-02T10:30:00Z",
        "personCount": 4,
        "timeOfIncident": "2026-07-02T10:30:00Z",
        "incidentName": "Vehicle Detection - ANPR",
        "reportStatus": "pending",
        "detectionStatus": 1
    },
    uploadFaceImages: {
      dsId: "DS_101",
      images: [
        "/uploads/images/DS_101/photo1.jpg",
        "/uploads/images/DS_101/photo2.jpg",
      ],
    },
    tagFolder: {
      dsId: "DS_101",
      authorizedUserId: "665f2b1c8e4a9d0012ab34cd",
    },
    quickCreateUser: {
      firstName: "John",
      lastName: "Doe",
      dsId: "DS_101",
      email: "john.doe@example.com",
      departmentId: "665f2b1c8e4a9d0012ab3411",
      designation: "Security Guard",
      branch: "Bangalore",
      shiftId: "665f2b1c8e4a9d0012ab3422",
      numberPlate: "KA01AB1234",
      orgId: 434,
      emp_id: 32631,
      empRoleId: 1613,
      permission: "Read",
      location: "Bangalore Office",
      locationId: 1295,
      phoneNumber: "919067589666",
      address1: "123 MG Road",
      timezone: "Asia/Kolkata",
      profilePics: [],
    },
    deleteFaceImages: {
      imageIds: ["665a1234567890abcd123456", "665a1234567890abcd123457"],
    },
    importEmpUsers:{
        "usersData": [
            {
              "id": 29017,
              "u_id": 57968,
              "first_name": "Rithika",
              "name": "Rithika",
              "last_name": "A",
              "email": "rithika.r12@globussoft.in",
              "phone": "91-8412579632",
              "date_join": null,
              "address": null,
              "photo_path": "/default/profilePic/user.png",
              "status": 1,
              "organization_id": 246,
              "location_id": 643,
              "location": "belgum",
              "department_id": 496,
              "emp_code": "Ri24",
              "shift_id": null,
              "timezone": "Africa/Johannesburg",
              "tracking_mode": 1,
              "tracking_rule_type": 1,
              "department": "Devops",
              "role_id": 554,
              "role": "Employee",
              "role_type": 1,
              "total_count": 207,
              "full_name": "Rithika A",
              "password": "Rithika@124",
              "software_version": null,
              "shift_name": null,
              "shift_data": null,
              "computer_name": null,
              "username": null,
              "domain": null,
              "employee_unique_id": "rithika.r12@globussoft.in",
              "project_name": "",
              "roles": [
                {
                  "role_id": 554,
                  "role": "Employee",
                  "role_type": 1
                }
              ],
              "encriptedpassword": "00035c764975e1bbc4131cfc6c7a2171:b23a22f129469bffdac9abfe635163b4",
              "assigned": [],
              "importedStatus": true
            }
        ]
        },
  };
