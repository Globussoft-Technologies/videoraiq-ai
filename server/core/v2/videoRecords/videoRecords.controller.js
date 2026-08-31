import videoRecordsService from "./videoRecords.service.js";

class VideoRecordsController {
  async getVideoRecords(req, res, next) {
    /*
    #swagger.tags = ['VideoRecords']
    #swagger.description = 'List video records for the session admin (newest first) with their videos, detections and sessionAnalytics. Pass id to fetch a single record.'
    #swagger.parameters['id'] = { in: 'query', required: false, description: 'Fetch one record by id' }
    #swagger.parameters['skip'] = { in: 'query', required: false, description: 'Pagination offset (default 0)' }
    #swagger.parameters['limit'] = { in: 'query', required: false, description: 'Page size (default 20)' }
    #swagger.responses[200] = { description: 'Video records fetched successfully' }
    #swagger.responses[400] = { description: 'Invalid id, or missing adminId in session' }
    #swagger.responses[500] = { description: 'Internal server error' }
    */
    return videoRecordsService.getVideoRecords(req, res, next);
  }

  async getSessionAnalytics(req, res, next) {
    /*
    #swagger.tags = ['VideoRecords']
    #swagger.description = 'Session analytics panel for one LiveDemo record: demosRun, eventsDetected, avgConfidence, detectionsTested, and the per-detection runs/events breakdown (only detections actually tested). Scoped to the session admin.'
    #swagger.parameters['id'] = { in: 'path', required: true, description: 'LiveDemo record id' }
    #swagger.responses[200] = { description: 'Session analytics fetched successfully' }
    #swagger.responses[400] = { description: 'Invalid id, or missing adminId in session' }
    #swagger.responses[404] = { description: 'Video record not found' }
    #swagger.responses[500] = { description: 'Internal server error' }
    */
    return videoRecordsService.getSessionAnalytics(req, res, next);
  }

  async createVideoRecord(req, res, next) {
    /*
    #swagger.tags = ['VideoRecords']
    #swagger.description = 'Register a video with selected detections. adminId/userId/plan are all taken from the session (plan from the aMember subscription in the token), not the body.'
    #swagger.parameters['data'] = {
      in: 'body',
      required: true,
      schema: {
        videos: [{ videoUrl: "uploads/videos/abc123.mp4" }],
        detections: { vehicleDetectionSettings: true }
      }
    }
    #swagger.responses[200] = { description: 'Video record created successfully' }
    #swagger.responses[400] = { description: 'Missing required fields, or no active plan in session' }
    #swagger.responses[500] = { description: 'Internal server error' }
    */
    return videoRecordsService.createVideoRecord(req, res, next);
  }

  async getVideos(req, res, next) {
    /*
    #swagger.tags = ['VideoRecords']
    #swagger.description = 'Videos of one LiveDemo record for the test-clip player: each entry carries videoUrl (the upload) and dsVideoUrl (the processed clip, null until the DS team attaches it), plus the detections map. Called when a detection chip is selected. Scoped to the session admin.'
    #swagger.parameters['id'] = { in: 'path', required: true, description: 'LiveDemo record id' }
    #swagger.responses[200] = { description: 'Videos fetched successfully' }
    #swagger.responses[400] = { description: 'Invalid id, or missing adminId in session' }
    #swagger.responses[404] = { description: 'Video record not found' }
    #swagger.responses[500] = { description: 'Internal server error' }
    */
    return videoRecordsService.getVideos(req, res, next);
  }

  async processVideo(req, res, next) {
    /*
    #swagger.tags = ['VideoRecords']
    #swagger.description = 'Submit one clip of a LiveDemo record to the external video-process service. source_url is sent as a full URL (relative stored paths are prefixed with the configured media domain). Detectors default to the record enabled detections when not passed. Scoped to the session admin.'
    #swagger.parameters['id'] = { in: 'path', required: true, description: 'LiveDemo record id' }
    #swagger.parameters['data'] = {
      in: 'body',
      required: false,
      schema: {
        videoId: "68b3f1c2a9d345001ee326d4",
        detectors: [{ name: "countPersonsSettings" }]
      }
    }
    #swagger.responses[200] = { description: 'Video is processing - returns the queued job: job_id, video_id, status, accepted_detectors, estimated_completion_seconds, estimate_quality, status_path' }
    #swagger.responses[400] = { description: 'Invalid id, unknown detectors, or no detectors selected' }
    #swagger.responses[404] = { description: 'Record or targeted video not found' }
    #swagger.responses[502] = { description: 'Video-process service unreachable or rejected the job' }
    */
    return videoRecordsService.processVideo(req, res, next);
  }

  async updateVideoRecord(req, res, next) {
    /*
    #swagger.tags = ['VideoRecords']
    #swagger.description = 'Update a video record - e.g. DS team attaching dsVideoUrl, or changing detections/plan'
    #swagger.parameters['data'] = {
      in: 'body',
      required: true,
      schema: {
        videoId: "664f89e8a9d345001ee326c2",
        dsVideoUrl: "https://ds.example.com/processed/abc123.mp4",
        detections: { vehicleDetectionSettings: true }
      }
    }
    #swagger.responses[200] = { description: 'Video record updated successfully' }
    #swagger.responses[400] = { description: 'Nothing to update' }
    #swagger.responses[404] = { description: 'Video record not found' }
    #swagger.responses[500] = { description: 'Internal server error' }
    */
    return videoRecordsService.updateVideoRecord(req, res, next);
  }
}

export default new VideoRecordsController();
