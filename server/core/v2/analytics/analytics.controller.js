import analyticsService from "./analytics.service.js";

class AnalyticsController {
  async detectionVolume(req, res, next) {
    /*
    #swagger.tags = ['Analytics']
    #swagger.description = 'Total incident (detection) count per calendar day over a date range, for the "Detection Volume" trend chart. Defaults to the last 30 days when no startDate/endDate is given.'
    #swagger.parameters['days'] = { in: 'query', description: 'Number of trailing days to include when startDate/endDate are not provided (default 30, max 90)', required: false, type: 'Number', example: 30 }
    #swagger.parameters['startDate'] = { in: 'query', description: 'Start of range (YYYY-MM-DD, inclusive)', required: false, type: 'String', example: '2026-06-08' }
    #swagger.parameters['endDate'] = { in: 'query', description: 'End of range (YYYY-MM-DD, inclusive)', required: false, type: 'String', example: '2026-07-07' }
    #swagger.parameters['nvrId'] = { in: 'query', description: 'Filter by one or more NVR ids (comma-separated or repeated)', required: false, type: 'String' }
    #swagger.parameters['channelId'] = { in: 'query', description: 'Filter by one or more channel ids', required: false, type: 'String' }
    #swagger.parameters['location'] = { in: 'query', description: 'Filter by one or more NVR locations', required: false, type: 'String' }
    #swagger.responses[200] = {
      description: 'Detection volume fetched successfully',
      schema: {
        statusCode: 200,
        body: {
          status: 'success',
          message: 'Detection volume fetched successfully',
          data: {
            days: 30,
            total: 312480,
            series: [
              { date: '2026-06-08', count: 9421 },
              { date: '2026-06-09', count: 10233 }
            ]
          }
        }
      }
    }
    #swagger.responses[400] = { description: 'Validation error', schema: { statusCode: 400, body: { status: 'failed', message: 'days must be at most 90', error: 'Validation Failed!' } } }
    #swagger.responses[500] = { description: 'Internal server error', schema: { statusCode: 500, body: { status: 'failed', message: 'Failed to fetch detection volume.', error: 'error details' } } }
    */
    return analyticsService.detectionVolume(req, res, next);
  }

  async engineShare(req, res, next) {
    /*
    #swagger.tags = ['Analytics']
    #swagger.description = 'Incident counts grouped by detection engine (incidentType), with each engine\'s share of the total as a percentage, for the "Share by Engine" donut. Defaults to the last 30 days.'
    #swagger.parameters['days'] = { in: 'query', description: 'Number of trailing days to include when startDate/endDate are not provided (default 30, max 90)', required: false, type: 'Number', example: 30 }
    #swagger.parameters['startDate'] = { in: 'query', description: 'Start of range (YYYY-MM-DD, inclusive)', required: false, type: 'String' }
    #swagger.parameters['endDate'] = { in: 'query', description: 'End of range (YYYY-MM-DD, inclusive)', required: false, type: 'String' }
    #swagger.parameters['nvrId'] = { in: 'query', description: 'Filter by one or more NVR ids', required: false, type: 'String' }
    #swagger.parameters['channelId'] = { in: 'query', description: 'Filter by one or more channel ids', required: false, type: 'String' }
    #swagger.parameters['location'] = { in: 'query', description: 'Filter by one or more NVR locations', required: false, type: 'String' }
    #swagger.responses[200] = {
      description: 'Engine share fetched successfully',
      schema: {
        statusCode: 200,
        body: {
          status: 'success',
          message: 'Engine share fetched successfully',
          data: {
            days: 30,
            total: 18420,
            engines: [
              { engine: 'genericObjectDetection', count: 7000, pct: 38 },
              { engine: 'lineCrossing', count: 4420, pct: 24 }
            ]
          }
        }
      }
    }
    #swagger.responses[400] = { description: 'Validation error', schema: { statusCode: 400, body: { status: 'failed', message: 'days must be at most 90', error: 'Validation Failed!' } } }
    #swagger.responses[500] = { description: 'Internal server error', schema: { statusCode: 500, body: { status: 'failed', message: 'Failed to fetch engine share.', error: 'error details' } } }
    */
    return analyticsService.engineShare(req, res, next);
  }

  async topCameras(req, res, next) {
    /*
    #swagger.tags = ['Analytics']
    #swagger.description = 'The busiest cameras ranked by incident count over a date range, for the "Top Cameras by Events" widget. Defaults to the last 30 days and top 5 cameras.'
    #swagger.parameters['days'] = { in: 'query', description: 'Number of trailing days to include when startDate/endDate are not provided (default 30, max 90)', required: false, type: 'Number', example: 30 }
    #swagger.parameters['limit'] = { in: 'query', description: 'Number of top cameras to return (default 5, max 50)', required: false, type: 'Number', example: 5 }
    #swagger.parameters['startDate'] = { in: 'query', description: 'Start of range (YYYY-MM-DD, inclusive)', required: false, type: 'String' }
    #swagger.parameters['endDate'] = { in: 'query', description: 'End of range (YYYY-MM-DD, inclusive)', required: false, type: 'String' }
    #swagger.parameters['nvrId'] = { in: 'query', description: 'Filter by one or more NVR ids', required: false, type: 'String' }
    #swagger.parameters['location'] = { in: 'query', description: 'Filter by one or more NVR locations', required: false, type: 'String' }
    #swagger.responses[200] = {
      description: 'Top cameras fetched successfully',
      schema: {
        statusCode: 200,
        body: {
          status: 'success',
          message: 'Top cameras fetched successfully',
          data: {
            days: 30,
            cameras: [
              { channelId: '665f2b1c8e4a9d0012ab34cd', name: 'Main Entrance', count: 9400, pct: 100 },
              { channelId: '665f2b1c8e4a9d0012ab34ce', name: 'Parking Gate A', count: 7100, pct: 76 }
            ]
          }
        }
      }
    }
    #swagger.responses[400] = { description: 'Validation error', schema: { statusCode: 400, body: { status: 'failed', message: 'limit must be at most 50', error: 'Validation Failed!' } } }
    #swagger.responses[500] = { description: 'Internal server error', schema: { statusCode: 500, body: { status: 'failed', message: 'Failed to fetch top cameras.', error: 'error details' } } }
    */
    return analyticsService.topCameras(req, res, next);
  }

  async activityHeatmap(req, res, next) {
    /*
    #swagger.tags = ['Analytics']
    #swagger.description = 'Incident counts grouped by day-of-week x hour-of-day (UTC), for the "Activity Heatmap" 7x24 grid. Defaults to the last 7 days.'
    #swagger.parameters['days'] = { in: 'query', description: 'Number of trailing days to include when startDate/endDate are not provided (default 7, max 90)', required: false, type: 'Number', example: 7 }
    #swagger.parameters['startDate'] = { in: 'query', description: 'Start of range (YYYY-MM-DD, inclusive)', required: false, type: 'String' }
    #swagger.parameters['endDate'] = { in: 'query', description: 'End of range (YYYY-MM-DD, inclusive)', required: false, type: 'String' }
    #swagger.parameters['nvrId'] = { in: 'query', description: 'Filter by one or more NVR ids', required: false, type: 'String' }
    #swagger.parameters['location'] = { in: 'query', description: 'Filter by one or more NVR locations', required: false, type: 'String' }
    #swagger.responses[200] = {
      description: 'Activity heatmap fetched successfully',
      schema: {
        statusCode: 200,
        body: {
          status: 'success',
          message: 'Activity heatmap fetched successfully',
          data: {
            days: 7,
            dayLabels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
            max: 42,
            grid: [[0,0,1,2,5]]
          }
        }
      }
    }
    #swagger.responses[400] = { description: 'Validation error', schema: { statusCode: 400, body: { status: 'failed', message: 'days must be at most 90', error: 'Validation Failed!' } } }
    #swagger.responses[500] = { description: 'Internal server error', schema: { statusCode: 500, body: { status: 'failed', message: 'Failed to fetch activity heatmap.', error: 'error details' } } }
    */
    return analyticsService.activityHeatmap(req, res, next);
  }

  async detectionsByHour(req, res, next) {
    /*
    #swagger.tags = ['Analytics']
    #swagger.description = 'Incident counts bucketed by hour-of-day (UTC) for a single calendar day, for the "Detections by Hour" bar chart. Defaults to today.'
    #swagger.parameters['date'] = { in: 'query', description: 'Calendar day to bucket (YYYY-MM-DD, UTC). Defaults to today.', required: false, type: 'String', example: '2026-07-07' }
    #swagger.parameters['nvrId'] = { in: 'query', description: 'Filter by one or more NVR ids', required: false, type: 'String' }
    #swagger.parameters['channelId'] = { in: 'query', description: 'Filter by one or more channel ids', required: false, type: 'String' }
    #swagger.responses[200] = {
      description: 'Detections by hour fetched successfully',
      schema: {
        statusCode: 200,
        body: {
          status: 'success',
          message: 'Detections by hour fetched successfully',
          data: {
            date: '2026-07-07',
            total: 890,
            hours: [8,5,4,3,3,6,14,30,48,58,63,71,66,73,69,76,84,92,80,61,44,30,18,11]
          }
        }
      }
    }
    #swagger.responses[400] = { description: 'Validation error', schema: { statusCode: 400, body: { status: 'failed', message: 'date must be in YYYY-MM-DD format', error: 'Validation Failed!' } } }
    #swagger.responses[500] = { description: 'Internal server error', schema: { statusCode: 500, body: { status: 'failed', message: 'Failed to fetch detections by hour.', error: 'error details' } } }
    */
    return analyticsService.detectionsByHour(req, res, next);
  }

  async sitePerformance(req, res, next) {
    /*
    #swagger.tags = ['Analytics']
    #swagger.description = 'Incident event counts grouped by NVR location, for the "Site Performance" table. Only the event-count column is backed by real data today — accuracy and uptime are not tracked anywhere in the system and are intentionally omitted rather than fabricated. Defaults to the last 30 days.'
    #swagger.parameters['days'] = { in: 'query', description: 'Number of trailing days to include when startDate/endDate are not provided (default 30, max 90)', required: false, type: 'Number', example: 30 }
    #swagger.parameters['startDate'] = { in: 'query', description: 'Start of range (YYYY-MM-DD, inclusive)', required: false, type: 'String' }
    #swagger.parameters['endDate'] = { in: 'query', description: 'End of range (YYYY-MM-DD, inclusive)', required: false, type: 'String' }
    #swagger.responses[200] = {
      description: 'Site performance fetched successfully',
      schema: {
        statusCode: 200,
        body: {
          status: 'success',
          message: 'Site performance fetched successfully',
          data: {
            days: 30,
            sites: [
              { site: 'HQ Tower', events: 68400 },
              { site: 'Westside Plant', events: 52100 }
            ]
          }
        }
      }
    }
    #swagger.responses[400] = { description: 'Validation error', schema: { statusCode: 400, body: { status: 'failed', message: 'days must be at most 90', error: 'Validation Failed!' } } }
    #swagger.responses[500] = { description: 'Internal server error', schema: { statusCode: 500, body: { status: 'failed', message: 'Failed to fetch site performance.', error: 'error details' } } }
    */
    return analyticsService.sitePerformance(req, res, next);
  }

  async responseFunnel(req, res, next) {
    /*
    #swagger.tags = ['Analytics']
    #swagger.description = 'Incident funnel using only fields that exist on the Incident schema: Detected (all incidents) -> Reported (report.status=true) -> Resolved (resolved=true). There is no "Auto-Triaged"/"Dispatched" stage in the data model, so this is a 3-stage funnel rather than the 4-stage one in early mockups. Defaults to the last 30 days.'
    #swagger.parameters['days'] = { in: 'query', description: 'Number of trailing days to include when startDate/endDate are not provided (default 30, max 90)', required: false, type: 'Number', example: 30 }
    #swagger.parameters['startDate'] = { in: 'query', description: 'Start of range (YYYY-MM-DD, inclusive)', required: false, type: 'String' }
    #swagger.parameters['endDate'] = { in: 'query', description: 'End of range (YYYY-MM-DD, inclusive)', required: false, type: 'String' }
    #swagger.responses[200] = {
      description: 'Response funnel fetched successfully',
      schema: {
        statusCode: 200,
        body: {
          status: 'success',
          message: 'Response funnel fetched successfully',
          data: {
            days: 30,
            stages: [
              { label: 'Detected', count: 18420, pct: 100 },
              { label: 'Reported', count: 14109, pct: 77 },
              { label: 'Resolved', count: 3102, pct: 17 }
            ]
          }
        }
      }
    }
    #swagger.responses[400] = { description: 'Validation error', schema: { statusCode: 400, body: { status: 'failed', message: 'days must be at most 90', error: 'Validation Failed!' } } }
    #swagger.responses[500] = { description: 'Internal server error', schema: { statusCode: 500, body: { status: 'failed', message: 'Failed to fetch response funnel.', error: 'error details' } } }
    */
    return analyticsService.responseFunnel(req, res, next);
  }

  async overview(req, res, next) {
    /*
    #swagger.tags = ['Analytics']
    #swagger.description = 'KPI summary for the Analytics header row: total detections, resolved rate, active camera count, and the busiest site. Only real, currently-tracked data is returned — false-positive rate, mean response time and platform uptime are not included since nothing in the system records them.'
    #swagger.parameters['days'] = { in: 'query', description: 'Number of trailing days to include when startDate/endDate are not provided (default 30, max 90)', required: false, type: 'Number', example: 30 }
    #swagger.parameters['startDate'] = { in: 'query', description: 'Start of range (YYYY-MM-DD, inclusive)', required: false, type: 'String' }
    #swagger.parameters['endDate'] = { in: 'query', description: 'End of range (YYYY-MM-DD, inclusive)', required: false, type: 'String' }
    #swagger.responses[200] = {
      description: 'Analytics overview fetched successfully',
      schema: {
        statusCode: 200,
        body: {
          status: 'success',
          message: 'Analytics overview fetched successfully',
          data: {
            days: 30,
            totalDetections: 18420,
            resolvedRate: 16.8,
            activeCameras: 42,
            busiestSite: { site: 'HQ Tower', events: 6840 }
          }
        }
      }
    }
    #swagger.responses[400] = { description: 'Validation error', schema: { statusCode: 400, body: { status: 'failed', message: 'days must be at most 90', error: 'Validation Failed!' } } }
    #swagger.responses[500] = { description: 'Internal server error', schema: { statusCode: 500, body: { status: 'failed', message: 'Failed to fetch analytics overview.', error: 'error details' } } }
    */
    return analyticsService.overview(req, res, next);
  }

  async peakActivity(req, res, next) {
    /*
    #swagger.tags = ['Analytics']
    #swagger.description = 'Busiest hour-of-day and busiest day-of-week over a date range, derived from the same aggregation as the Activity Heatmap. Replaces the Model Performance card — there is no ground-truth/validation subsystem in the product, so precision/recall/F1/mAP cannot be computed from anything currently stored. Defaults to the last 30 days.'
    #swagger.parameters['days'] = { in: 'query', description: 'Number of trailing days to include when startDate/endDate are not provided (default 30, max 90)', required: false, type: 'Number', example: 30 }
    #swagger.parameters['startDate'] = { in: 'query', description: 'Start of range (YYYY-MM-DD, inclusive)', required: false, type: 'String' }
    #swagger.parameters['endDate'] = { in: 'query', description: 'End of range (YYYY-MM-DD, inclusive)', required: false, type: 'String' }
    #swagger.responses[200] = {
      description: 'Peak activity fetched successfully',
      schema: {
        statusCode: 200,
        body: {
          status: 'success',
          message: 'Peak activity fetched successfully',
          data: {
            days: 30,
            peakHour: {
              hour: 17,
              count: 1420,
              dates: [
                { date: '2026-07-02', count: 311 },
                { date: '2026-07-03', count: 280 }
              ]
            },
            peakDay: {
              day: 'Fri',
              count: 4210,
              dates: [
                { date: '2026-07-03', count: 980 },
                { date: '2026-07-10', count: 1042 }
              ]
            }
          }
        }
      }
    }
    #swagger.responses[400] = { description: 'Validation error', schema: { statusCode: 400, body: { status: 'failed', message: 'days must be at most 90', error: 'Validation Failed!' } } }
    #swagger.responses[500] = { description: 'Internal server error', schema: { statusCode: 500, body: { status: 'failed', message: 'Failed to fetch peak activity.', error: 'error details' } } }
    */
    return analyticsService.peakActivity(req, res, next);
  }
}

export default new AnalyticsController();
