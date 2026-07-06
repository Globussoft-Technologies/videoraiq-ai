
import faceImagesService from "./faceImages.service.js";


class FaceImagesController {
  async uploadImages(req, res, next) {
    /*
    #swagger.tags = ['FaceImages']
    #swagger.description = 'Register one or more face images for a dsId received from the Data Science service. The DS service has already written the image files to the NAS and sends their relative NAS paths here; no file bytes are uploaded through this API. Called by the DS service using a service token.'
    #swagger.parameters['data'] = {
      in: 'body',
      description: 'dsId and the relative NAS paths of the images already stored by the DS service',
      required: true,
      schema: { $ref: '#/definitions/uploadFaceImages' }
    }
    #swagger.responses[200] = {
      description: 'Images uploaded successfully',
      schema: {
        statusCode: 200,
        body: {
          status: 'success',
          message: 'Images uploaded successfully',
          data: {
            dsId: 'DS_101',
            uploaded: [
              {
                _id: '665a1234567890abcd123456',
                dsId: 'DS_101',
                image: '/uploads/images/DS_101/photo1.jpg',
                authorizedUserId: null,
                createdAt: '2026-07-03T10:00:00.000Z',
                updatedAt: '2026-07-03T10:00:00.000Z'
              }
            ]
          }
        }
      }
    }
    #swagger.responses[400] = {
      description: 'Validation error or missing required fields',
      schema: {
        statusCode: 400,
        body: { status: 'failed', message: 'images is required', error: 'Validation Failed!' }
      }
    }
    #swagger.responses[500] = {
      description: 'Internal server error',
      schema: {
        statusCode: 500,
        body: { status: 'failed', message: 'Failed to upload images.', error: 'error details' }
      }
    }
    */
    return faceImagesService.uploadImages(req, res, next);
  }

  async getGroupedImages(req, res, next) {
    /*
    #swagger.tags = ['FaceImages']
    #swagger.description = 'Fetch face images grouped by dsId, with authorized user details populated when tagged. Each image path is returned as a full viewable URL (config ImageView base + stored relative NAS path). Groups are sorted by their most recently uploaded image first (newest first). Paginated by dsId group. Supports searching by dsId or the tagged users first/last/full name, and filtering by an upload date range.'
    #swagger.parameters['skip'] = {
              in: 'query',
              description: 'Number of dsId groups to skip',
              required: false,
              type: 'Number',
    }
    #swagger.parameters['limit'] = {
              in: 'query',
              description: 'Number of dsId groups to return (default 40)',
              required: false,
              type: 'Number',
    }
    #swagger.parameters['search'] = {
              in: 'query',
              description: 'Search by dsId, or by the tagged authorized users first name, last name, or full name (case-insensitive, partial match)',
              required: false,
              type: 'String',
    }
    #swagger.parameters['startDate'] = {
              in: 'query',
              description: 'Only include images uploaded on or after this date (YYYY-MM-DD, inclusive, UTC start of day)',
              required: false,
              type: 'String',
              example: '2026-07-01',
    }
    #swagger.parameters['endDate'] = {
              in: 'query',
              description: 'Only include images uploaded on or before this date (YYYY-MM-DD, inclusive, UTC end of day)',
              required: false,
              type: 'String',
              example: '2026-07-06',
    }
    #swagger.responses[200] = {
      description: 'Grouped images fetched successfully',
      schema: {
        statusCode: 200,
        body: {
          status: 'success',
          message: 'Grouped images fetched successfully',
          data: {
            totalCount: 2,
            skip: 0,
            limit: 40,
            groups: [
              {
                dsId: 'DS_101',
                latestCreatedAt: '2026-07-06T09:12:00.000Z',
                authorizedUser: { _id: '665f2b1c8e4a9d0012ab34cd', name: 'John Doe' },
                images: [
                  { _id: '665a1234567890abcd123456', image: 'https://dev-api.videoraiq.com/api/v1/uploads/emp-cctv-dev-media/uploads/images/DS_101/photo1.jpg' },
                  { _id: '665a1234567890abcd123457', image: 'https://dev-api.videoraiq.com/api/v1/uploads/emp-cctv-dev-media/uploads/images/DS_101/photo2.jpg' }
                ]
              },
              {
                dsId: 'DS_102',
                latestCreatedAt: '2026-07-03T14:40:00.000Z',
                authorizedUser: null,
                images: [
                  { _id: '665a1234567890abcd123458', image: 'https://dev-api.videoraiq.com/api/v1/uploads/emp-cctv-dev-media/uploads/images/DS_102/photo3.jpg' }
                ]
              }
            ]
          }
        }
      }
    }
    #swagger.responses[500] = {
      description: 'Internal server error',
      schema: {
        statusCode: 500,
        body: { status: 'failed', message: 'Failed to fetch grouped images.', error: 'error details' }
      }
    }
    */
    return faceImagesService.getGroupedImages(req, res, next);
  }

  async tagFolder(req, res, next) {
    /*
    #swagger.tags = ['FaceImages']
    #swagger.description = 'Tag all images belonging to a dsId with an Authorized User. No image data is modified. Notifies the DS onfly_registration API.'
    #swagger.parameters['data'] = {
      in: 'body',
      description: 'dsId and the authorizedUserId to link it with',
      required: true,
      schema: { $ref: '#/definitions/tagFolder' }
    }
    #swagger.responses[200] = {
      description: 'Folder tagged successfully',
      schema: {
        statusCode: 200,
        body: {
          status: 'success',
          message: 'Folder tagged successfully',
          data: {
            dsId: 'DS_101',
            authorizedUserId: '665f2b1c8e4a9d0012ab34cd'
          }
        }
      }
    }
    #swagger.responses[400] = {
      description: 'Validation error or missing required fields',
      schema: {
        statusCode: 400,
        body: { status: 'failed', message: 'dsId is required', error: 'Validation Failed!' }
      }
    }
    #swagger.responses[404] = {
      description: 'dsId or authorizedUserId not found',
      schema: {
        statusCode: 404,
        body: { status: 'failed', message: 'Authorized user not found' }
      }
    }
    #swagger.responses[500] = {
      description: 'Internal server error',
      schema: {
        statusCode: 500,
        body: { status: 'failed', message: 'Failed to tag folder.', error: 'error details' }
      }
    }
    */
    return faceImagesService.tagFolder(req, res, next);
  }

  async quickCreateUser(req, res, next) {
    /*
    #swagger.tags = ['FaceImages']
    #swagger.description = 'Create an Authorized User and immediately tag the given dsId folder with it. Accepts the full authorizedUsers schema (minus password). Only firstName, lastName and dsId are required; every other field (email, departmentId, designation, branch, shiftId, numberPlate, orgId, emp_id, empRoleId, permission, location, locationId, phoneNumber, address1, timezone, profilePics) is optional. If email is omitted a placeholder is auto-generated. verified is set to false since no face data exists yet. Notifies the DS onfly_registration API.'
    #swagger.parameters['data'] = {
      in: 'body',
      description: 'firstName, lastName and dsId are required; every other authorizedUsers field is optional',
      required: true,
      schema: { $ref: '#/definitions/quickCreateUser' }
    }
    #swagger.responses[201] = {
      description: 'Authorized user created and folder tagged successfully',
      schema: {
        statusCode: 201,
        body: {
          status: 'success',
          message: 'Authorized user created successfully',
          data: {
            _id: '665f2b1c8e4a9d0012ab34cd',
            adminId: '665f2b1c8e4a9d0012ab3400',
            firstName: 'John',
            lastName: 'Doe',
            userName: 'John Doe',
            email: 'quickcreate+665f2b1c8e4a9d0012ab34ce@placeholder.local',
            verified: false,
            profilePics: [],
            tag: false,
            location: 'default',
            createdAt: '2026-07-03T10:00:00.000Z',
            updatedAt: '2026-07-03T10:00:00.000Z',
            dsId: 'DS_101'
          }
        }
      }
    }
    #swagger.responses[400] = {
      description: 'Validation error or missing required fields',
      schema: {
        statusCode: 400,
        body: { status: 'failed', message: 'firstName is required', error: 'Validation Failed!' }
      }
    }
    #swagger.responses[404] = {
      description: 'No images found for this dsId',
      schema: {
        statusCode: 404,
        body: { status: 'failed', message: 'No images found for this dsId' }
      }
    }
    #swagger.responses[500] = {
      description: 'Internal server error',
      schema: {
        statusCode: 500,
        body: { status: 'failed', message: 'Failed to create authorized user.', error: 'error details' }
      }
    }
    */
    return faceImagesService.quickCreateUser(req, res, next);
  }

  async deleteImages(req, res, next) {
    /*
    #swagger.tags = ['FaceImages']
    #swagger.description = 'Delete face image documents and their underlying stored files. Notifies the DS delete_onfly API, grouped per dsId.'
    #swagger.parameters['data'] = {
      in: 'body',
      description: 'Array of FaceImages document ids to delete',
      required: true,
      schema: { $ref: '#/definitions/deleteFaceImages' }
    }
    #swagger.responses[200] = {
      description: 'Images deleted successfully',
      schema: {
        statusCode: 200,
        body: {
          status: 'success',
          message: 'Images deleted successfully',
          data: { deletedCount: 2, errors: [] }
        }
      }
    }
    #swagger.responses[400] = {
      description: 'Validation error or missing required fields',
      schema: {
        statusCode: 400,
        body: { status: 'failed', message: 'imageIds is required', error: 'Validation Failed!' }
      }
    }
    #swagger.responses[404] = {
      description: 'No matching images found',
      schema: {
        statusCode: 404,
        body: { status: 'failed', message: 'No matching images found' }
      }
    }
    #swagger.responses[500] = {
      description: 'Internal server error',
      schema: {
        statusCode: 500,
        body: { status: 'failed', message: 'Failed to delete images.', error: 'error details' }
      }
    }
    */
    return faceImagesService.deleteImages(req, res, next);
  }
}

export default new FaceImagesController();
