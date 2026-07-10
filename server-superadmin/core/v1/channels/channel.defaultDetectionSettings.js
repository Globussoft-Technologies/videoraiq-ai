export default {
  cashier_detection: {
    videoLinkRequirement: false,
    video_min_length: null,
    video_max_length: null,
    level_of_importance: "medium", // low | medium | high
    alertThreshold: 5,
    faceAuth: false,
    videoResolution: [],
    referencePoints: {},
  },

  unauthorised_access_detection: {
    videoLinkRequirement: false,
    videoMinLength: 10,
    videoMaxLength: 60,
    levelOfImportance: "medium",
    alertThreshold: 5,
    videoResolution: [],
    referencePoints: {},
    authorisedUsers: [],
  },

  person_detection: {
    videoLinkRequirement: false,
    video_min_length: null,
    video_max_length: null,
    level_of_importance: "medium",
    alertThreshold: 5,
    faceAuth: false,
    videoResolution: [1080, 720],
    referencePoints: {},
  },

  fire_and_smoke_detection: {
    videoLinkRequirement: false,
    video_min_length: 10,
    video_max_length: 60,
    level_of_importance: "medium",
    alertThreshold: 5,
    faceAuth: false,
    videoResolution: [1080, 720],
    referencePoints: {},
  },
};