import path from "path";
import Response from "../../../utils/response.js";
import logger from "../../../utils/logger.js";
import fs from 'fs';
import authorizedUsersModel from "../authorizedUsers/authorizedUsers.model.js";
import {
    putMedia,
    streamMedia,
    deleteMedia as deleteMediaFromStorage,
    mediaExists,
} from "../../../utils/mediaStorage.js";

const cacheDir = path.join('/tmp', 'media-cache'); // You can change this to './cache' or any path
if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, {
        recursive: true
    });
}
class UploadService {
    async uploadMedia(req, res, next) {
        try {
            const { mediaType, folderName } = req.query;
            const file = req.file;

            if (!mediaType || !['image', 'video'].includes(mediaType)) {
                return res.status(400).json(
                    Response.errorResp('Validation Failed!', 'Invalid or missing mediaType (must be "image" or "video")')
                );
            }
            if (!folderName || !folderName.trim()) {
                return res.status(400).json(
                    Response.errorResp('Validation Failed!', 'Missing folderName in query.')
                );
            }
            if (!file) {
                return res.status(400).json(
                    Response.errorResp('Validation Failed!', 'No file uploaded.')
                );
            }

            const extension = path.extname(file.originalname).toLowerCase();
            const allowedImageTypes = [
                '.jpg', '.jpeg', '.jpe', '.jfif', '.png', '.gif', '.webp',
                '.bmp', '.dib', '.tiff', '.tif', '.svg', '.svgz', '.ico',
                '.avif', '.heic', '.heif', '.apng', '.pjpeg', '.pjp', '.raw',
                '.cr2', '.nef', '.arw', '.dng', '.orf', '.rw2', '.psd', '.ai', '.eps'
            ];
            const allowedVideoTypes = ['.mp4', '.mov', '.avi', '.mkv'];

            const isValid =
                (mediaType === 'image' && allowedImageTypes.includes(extension)) ||
                (mediaType === 'video' && allowedVideoTypes.includes(extension));

            if (!isValid) {
                return res.status(400).json(
                    Response.errorResp('Validation Failed!', `Invalid file format for mediaType "${mediaType}".`)
                );
            }

            const result = await putMedia({
                buffer: file.buffer,
                mediaType,
                folderName,
                originalName: file.originalname,
            });

            return res.status(200).json({
                status: 'success',
                message: `${mediaType} uploaded successfully.`,
                data: {
                    originalName: file.originalname,
                    remotePath: result.includes("/mnt/nfs/videoraiq-media-NAS") ? result.replace("/mnt/nfs/videoraiq-media-NAS", "") : result,
                },
            });

        } catch (error) {
            logger.error('Error uploading media:', error);
            return res.status(500).json(
                Response.errorResp(`Failed to upload media: ${error.message}`, error.message)
            );
        }
    }



    async fetchMedia(req, res) {
        try {
            const mediaPath = decodeURIComponent(req.params.mediaPath);

            if (!mediaPath || !mediaPath.trim()) {
                return res.status(400).json({ status: "failed", message: "mediaPath parameter is required." });
            }
            if (mediaPath.includes("..")) {
                return res.status(400).json({ status: "failed", message: "Invalid media path." });
            }

            const fileName = path.basename(mediaPath);
            const contentType = getManualMimeType(fileName);

            res.setHeader("Content-Type", contentType);
            res.setHeader("Content-Disposition", "inline");
            res.setHeader("Accept-Ranges", "bytes");
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader("Cross-Origin-Opener-Policy", "*");
            res.setHeader("Cross-Origin-Resource-Policy", "*");

            await streamMedia(mediaPath, res);

        } catch (error) {
            console.error("Error fetching media:", error);
            if (!res.headersSent) {
                res.status(error.statusCode || 500).json({ status: "failed", message: `Failed to fetch media: ${error.message}` });
            }
        }
    }

    async deleteMedia(req, res, next) {
        try {
            const { mediaPath } = req.query;

            if (!mediaPath || !mediaPath.trim()) {
                return res.status(400).json({ status: 'failed', message: 'mediaPath query parameter is required.' });
            }
            if (mediaPath.includes('..')) {
                return res.status(400).json({ status: 'failed', message: 'Invalid media path.' });
            }

            const cachedFilePath = path.join(cacheDir, path.basename(mediaPath));
            if (fs.existsSync(cachedFilePath)) {
                fs.unlinkSync(cachedFilePath);
            }

            const exists = await mediaExists(mediaPath);
            if (!exists) {
                return res.status(404).json({ status: 'failed', message: 'File not found in storage.' });
            }

            await deleteMediaFromStorage(mediaPath);

            return res.status(200).json({ status: 'success', message: 'Media deleted successfully.' });

        } catch (error) {
            logger.error('Error delete media:', error);
            return res.status(500).json({ status: 'failed', message: `Failed to delete media: ${error.message}` });
        }
    }

    async deleteUserMedia(req, res, next) {
        try {
            const { mediaPath, userId } = req.query;

            if (!mediaPath || !mediaPath.trim()) {
                return res.status(400).json({ status: 'failed', message: 'mediaPath query parameter is required.' });
            }
            if (mediaPath.includes('..')) {
                return res.status(400).json({ status: 'failed', message: 'Invalid media path.' });
            }

            const userDetails = await authorizedUsersModel.findById(userId);
            if (!userDetails) {
                return res.status(404).json({ status: 'failed', message: 'User not found.' });
            }

            userDetails.profilePics = userDetails.profilePics.filter(pic => pic !== mediaPath);
            await userDetails.save();

            const cachedFilePath = path.join(cacheDir, path.basename(mediaPath));
            if (fs.existsSync(cachedFilePath)) {
                fs.unlinkSync(cachedFilePath);
            }

            const exists = await mediaExists(mediaPath);
            if (!exists) {
                return res.status(404).json({ status: 'failed', message: 'File not found in storage.' });
            }

            await deleteMediaFromStorage(mediaPath);

            return res.status(200).json({ status: 'success', message: 'Media deleted successfully.' });

        } catch (error) {
            logger.error('Error delete media:', error);
            return res.status(500).json({
                status: 'failed',
                message: `Failed to delete media: ${error.message}`,
            });
        }
    }


}

export function getManualMimeType(fileName) {
    const ext = path.extname(fileName).toLowerCase();

    switch (ext) {
        case '.mp4':
            return 'video/mp4';
        case '.webm':
            return 'video/webm';
        case '.ogg':
            return 'video/ogg';
        case '.mp3':
            return 'audio/mpeg';
        case '.wav':
            return 'audio/wav';
        case '.mov':
            return 'video/quicktime';
        case '.jpg':
            return 'image/jpg';
        case '.jpeg':
            return 'image/jpeg';
        case '.png':
            return 'image/png';
        case '.gif':
            return 'image/gif';
        case '.pdf':
            return 'application/pdf';
        default:
            return 'application/octet-stream';
    }
};


export default new UploadService();