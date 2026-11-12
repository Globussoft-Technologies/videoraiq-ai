import uploadsService from "./uploads.service.js";


class UploadController {
      async uploadMedia(req, res, next) {
            /* #swagger.tags = ['Uploads']
               #swagger.description = 'Upload images, videos or general files. General files accept any extension, are limited to 25 MB, and are publicly downloadable by anyone with the link.' */
            /* #swagger.parameters['mediaType'] = {
                  in: 'query',
                  description: 'Use file to upload any file type as a download.',
                  required: true,
                  type: 'string',
                  enum: ['image', 'video', 'file']
            } */
            /* #swagger.parameters['folderName'] = {
                   in: 'query',
                   description: 'Provide folderName',
                   required: true,
                   type: 'string',
             } */
            /* #swagger.consumes = ['multipart/form-data'] */
            /* #swagger.parameters['file'] = {
                  in: 'formData',
                  name: 'file',
                  type: 'file',
                  required: true,
                  description: 'Upload an image, video or general file. General files are limited to 25 MB.'
            } */

            return await uploadsService.uploadMedia(req, res, next);

      }
      async fetchMedia(req, res, next) {
            /* #swagger.tags = ['Uploads']
            #swagger.description = 'This route is used to fetch uploaded media.' */
        /*#swagger.security = [{ EncryptedAuthToken: [] }] */
            return await uploadsService.fetchMedia(req, res, next);
      }
      async downloadZip(req, res, next) {
            return await uploadsService.downloadZip(req, res, next);
      }
      async deleteMedia(req, res, next){
            /* #swagger.tags = ['Uploads']
            #swagger.description = 'This route is used to delete uploaded media.' */
            /* #swagger.parameters['mediaPath'] = {
                   in: 'query',
                   description: 'Provide mediaPath',
                   required: true,
                   type: 'string',
             } */
        /*#swagger.security = [] */
            return await uploadsService.deleteMedia(req, res, next);
      }

      async deleteUserMedia(req, res, next){
            /* #swagger.tags = ['Uploads']
            #swagger.description = 'This route is used to delete uploaded media.' */
            /* #swagger.parameters['userId'] = {
                   in: 'query',
                   description: 'Provide user _id',
                   required: true,
                   type: 'string',
             } */
            /* #swagger.parameters['mediaPath'] = {
                   in: 'query',
                   description: 'Provide mediaPath',
                   required: true,
                   type: 'string',
             } */
        /*#swagger.security = [] */
            return await uploadsService.deleteUserMedia(req, res, next);
      }

}

export default new UploadController();
