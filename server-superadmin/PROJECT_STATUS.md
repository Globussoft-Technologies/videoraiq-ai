# EMP Monitor CCTV Backend - Project Status & API Documentation

## Table of Contents

- [Project Overview](#project-overview)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Configuration](#configuration)
- [Authentication & Security](#authentication--security)
- [Middleware System](#middleware-system)
- [API Reference](#api-reference)
  - [Authentication APIs](#1-authentication-apis)
  - [Admin APIs](#2-admin-apis)
  - [NVR Management APIs](#3-nvr-management-apis)
  - [Channel/Camera APIs](#4-channelcamera-apis)
  - [Incidents APIs](#5-incidents-apis)
  - [Dashboard APIs](#6-dashboard-apis)
  - [Users APIs](#7-users-apis)
  - [Authorized Users APIs](#8-authorized-users-apis)
  - [Roles APIs](#9-roles-apis)
  - [Permissions APIs](#10-permissions-apis)
  - [Departments APIs](#11-departments-apis)
  - [Detection Settings APIs](#12-detection-settings-apis)
  - [Detection Objects APIs](#13-detection-objects-apis)
  - [Profiles APIs](#14-profiles-apis)
  - [Alerts APIs](#15-alerts-apis)
  - [Recipients APIs](#16-recipients-apis)
  - [Attendance APIs](#17-attendance-apis)
  - [Access Logs APIs](#18-access-logs-apis)
  - [Shifts APIs](#19-shifts-apis)
  - [Storage APIs](#20-storage-apis)
  - [Uploads APIs](#21-uploads-apis)
  - [Authorized Channels APIs](#22-authorized-channels-apis)
  - [Authorized Objects APIs](#23-authorized-objects-apis)
  - [Auto Email Report APIs](#24-auto-email-report-apis)
  - [Entry APIs](#25-entry-apis)
  - [Vehicle APIs](#26-vehicle-apis)
  - [Domain APIs](#27-domain-apis)
  - [Jobs APIs](#28-jobs-apis)
- [Database Models](#database-models)
- [External Integrations](#external-integrations)
- [Real-Time Features](#real-time-features)

---

## Project Overview

**EMP Monitor CCTV Backend** is a comprehensive video surveillance and employee monitoring system that integrates with NVR/Camera hardware, AI-powered detection services, and workforce management tools. The platform provides real-time incident detection, attendance tracking, access logging, and configurable alerting.

**Base URL:** `http://localhost:5000/api/v1`
**Swagger Docs:** `http://localhost:5000/api-doc` (Basic Auth protected)

---

## Tech Stack

| Component        | Technology                          |
| ---------------- | ----------------------------------- |
| Runtime          | Node.js                             |
| Framework        | Express.js                          |
| Database         | MongoDB (Mongoose ODM)              |
| Cache/Queue      | Redis                               |
| Real-time        | Socket.IO                           |
| Authentication   | JWT (HS512)                         |
| Email            | SendGrid                            |
| SMS              | Twilio                              |
| File Storage     | SFTP, S3, Google Drive               |
| AI/ML Backend    | Python (face recognition, detection) |
| Documentation    | Swagger (auto-generated)            |

---

## Project Structure

```
empmontior-cctv-backend/
├── bootstrap.js                  # Entry point (decrypts config, starts server)
├── server.js                     # Express server setup, middleware, routes
├── config/
│   ├── example.json              # Example configuration template
│   ├── development.json          # Development environment config
│   └── *.json.enc                # Encrypted production configs
├── core/
│   └── v1/
│       ├── Auth/                 # Authentication
│       ├── admin/                # Admin management
│       ├── NVR/                  # NVR management
│       ├── channels/             # Camera/Channel management
│       ├── incidents/            # Incident detection & logging
│       ├── dashboard/            # Dashboard analytics
│       ├── users/                # User management
│       ├── authorizedUsers/      # Authorized face-recognized users
│       ├── roles/                # Role management
│       ├── permission/           # Permission management
│       ├── departments/          # Department management
│       ├── detectionSettings/    # AI detection configuration
│       ├── detectionObjects/     # Detection object management
│       ├── profiles/             # Detection profiles
│       ├── alerts/               # Alert configuration
│       ├── verifyRecipients/     # Notification recipients
│       ├── attendance/           # Attendance tracking
│       ├── accesslogs/           # Access logging
│       ├── shifts/               # Shift management
│       ├── storage/              # Cloud storage management
│       ├── Uploads/              # File upload management
│       ├── cameraRestrictions/   # Channel access restrictions
│       ├── authorizedObjects/    # Authorized object types
│       ├── autoEmailReport/      # Automated email reports
│       ├── entry/                # Entry point tracking
│       ├── vehicle/              # Vehicle tracking
│       ├── domain/               # Domain management
│       └── jobs/                 # Background jobs
├── middlewares/
│   ├── verifyToken.js            # JWT authentication
│   ├── permissionMiddleware.js   # RBAC permission checks
│   ├── permissionConfigChecker.js# Route-to-module mapping
│   ├── checkActivePlan.js        # Subscription validation
│   ├── errorMiddleware.js        # Global error handler
│   ├── decodeToken.js            # Token generation utility
│   └── xssSanitizer.js          # XSS protection
├── utils/
│   ├── database.js               # MongoDB & Redis connection
│   ├── logger.js                 # Winston logging
│   ├── response.js               # Standardized API responses
│   ├── cryptoUtils.js            # Encryption utilities
│   ├── helperFunctions.js        # Shared helpers
│   ├── passwordEncoderDecoder.js # Password hashing
│   ├── rtspStream.js             # RTSP stream utilities
│   ├── xmlParse.js               # XML parsing
│   └── appError.js               # Custom error class
├── services/
│   ├── delete.service.js         # Centralized deletion logic
│   ├── python.service.js         # Python ML backend communication
│   └── telegram.service.js       # Telegram notifications
└── swagger/                      # Auto-generated Swagger docs
```

---

## Configuration

The application uses JSON config files. Sensitive values are encrypted in production. Below is the configuration structure:

| Key                  | Description                              | Example                          |
| -------------------- | ---------------------------------------- | -------------------------------- |
| `port`               | Server port                              | `5000`                           |
| `mongodb_uri`        | MongoDB connection string                | `mongodb://localhost:27017/EMP_Surveillance` |
| `jwt.secretKey`      | JWT signing secret                       | `emp^%&u89a*^^ps537`            |
| `jwt.tokenExpiryTime`| Token expiry duration                   | `"24h"`                          |
| `aMember.baseUrl`    | aMember API URL                          | `https://abc/api`                |
| `aMember.apiKey`     | aMember API key                          | `zpleLmr7IXGyswqcaser`          |
| `sendgrid.key`       | SendGrid API key                         | `SG.xxx`                         |
| `sendgrid.email`     | Sender email address                     | `sender@example.com`             |
| `Twilio.TWILIO_ACCOUNT_SID` | Twilio Account SID              | `ACxxx`                          |
| `Twilio.TWILIO_AUTH_TOKEN`   | Twilio Auth Token               | `xxx`                            |
| `Twilio.TWILIO_PHONE_NUMBER` | Twilio Phone Number             | `+1xxxxxxxxxx`                   |
| `Redis.host`         | Redis server host                        | `127.0.0.1`                      |
| `Redis.port`         | Redis server port                        | `6379`                           |
| `encryptionKey`      | Data encryption key (32 chars)           | `PzBFGrUv6PgCiRTafRVd20ULL3z92js9` |
| `Backend.token`      | Service-to-service auth token            | `LpiOoJH5sNZKccmwMuL53BOYIZugrfM0` |

---

## Authentication & Security

### Authentication Flow

1. **User Login** → `POST /api/v1/auth/by-login-pass` verifies credentials with aMember
2. **Token Generation** → JWT token (HS512, 24h expiry) returned with user data
3. **Authenticated Requests** → Include token in `x-access-token` header
4. **Token Verification** → `verifyToken` middleware validates token, loads user data & permissions
5. **Plan Check** → `checkActivePlan` validates subscription is active
6. **Permission Check** → Permission middleware verifies RBAC access for the route

### Security Layers

| Layer                     | Implementation                                |
| ------------------------- | --------------------------------------------- |
| Authentication            | JWT (HS512) via `x-access-token` header       |
| Authorization             | Role-based access control (RBAC)              |
| Subscription Validation   | Plan expiry check on every request            |
| Input Sanitization        | MongoDB sanitization + XSS protection         |
| Security Headers          | Helmet middleware                              |
| CORS                      | Configured for allowed origins                |
| Password Storage          | Encrypted with salt                           |
| Sensitive Data            | AES encryption for credentials                |

---

## Middleware System

### Request Pipeline (Protected Routes)

```
Request → Morgan Logger → Helmet → JSON Parser → Cookie Parser
→ MongoDB Sanitize → XSS Clean → CORS → Compression
→ verifyToken → checkActivePlan → permissionMiddleware → Route Handler
→ Error Handler → Response
```

### Middleware Details

| Middleware                | File                              | Purpose                                              |
| ------------------------ | --------------------------------- | ---------------------------------------------------- |
| `verifyToken`            | `middlewares/verifyToken.js`      | Validates JWT, loads user data, roles & permissions   |
| `checkActivePlan`        | `middlewares/checkActivePlan.js`  | Validates subscription is active and not expired      |
| `viewAccessCheck`        | `middlewares/permissionMiddleware.js` | Checks VIEW permission for current route          |
| `createAccessCheck`      | `middlewares/permissionMiddleware.js` | Checks CREATE permission for current route        |
| `editAccessCheck`        | `middlewares/permissionMiddleware.js` | Checks EDIT permission for current route          |
| `deleteAccessCheck`      | `middlewares/permissionMiddleware.js` | Checks DELETE permission for current route        |
| `errorMiddleware`        | `middlewares/errorMiddleware.js`  | Handles Mongoose, JWT, and validation errors         |

---

## API Reference

> **Note:** All protected routes require the `x-access-token` header with a valid JWT token unless stated otherwise.

### Common Response Format

```json
{
  "success": true,
  "message": "Operation successful",
  "data": { ... }
}
```

### Error Response Format

```json
{
  "success": false,
  "message": "Error description",
  "error": { ... }
}
```

---

### 1. Authentication APIs

**Base Path:** `/api/v1/auth`
**Authentication Required:** No

---

#### POST `/api/v1/auth/by-login-pass`

Verify user credentials and get authentication token.

**Request Body:**
```json
{
  "login": "admin@example.com",
  "pass": "SecurePassword123"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "token": "eyJhbGciOiJIUzUxMiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "_id": "64a1b2c3d4e5f6a7b8c9d0e1",
      "name_f": "John",
      "name_l": "Doe",
      "email": "admin@example.com",
      "login": "admin@example.com",
      "orgId": "12345"
    },
    "plan": {
      "type": "custom",
      "expiryDate": "2026-12-31T00:00:00.000Z",
      "planId": "17"
    },
    "firstIncidentCreatedAt": "2025-06-15T10:30:00.000Z",
    "phoneRecipient": {
      "type": "phone",
      "value": "+1234567890",
      "verified": true
    }
  }
}
```

---

#### POST `/api/v1/auth/by-login-token`

Decode and verify an existing JWT token.

**Request Body:**
```json
{
  "token": "eyJhbGciOiJIUzUxMiIsInR5cCI6IkpXVCJ9..."
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "user_id": "64a1b2c3d4e5f6a7b8c9d0e1",
    "email": "admin@example.com",
    "name_f": "John",
    "name_l": "Doe"
  }
}
```

---

#### GET `/api/v1/auth/by-login/:username`

Get aMember user details and generate a token by username.

**Example:** `GET /api/v1/auth/by-login/john.doe`

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzUxMiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "user_id": "12345",
      "login": "john.doe",
      "name_f": "John",
      "name_l": "Doe",
      "email": "john.doe@example.com"
    }
  }
}
```

---

### 2. Admin APIs

**Base Path:** `/api/v1/admin`

---

#### POST `/api/v1/admin/signUp`

Register a new admin account.

**Authentication Required:** No

**Request Body:**
```json
{
  "user_id": "USR001",
  "login": "admin@example.com",
  "name_f": "John",
  "name_l": "Doe",
  "email": "admin@example.com"
}
```

**Success Response (201):**
```json
{
  "success": true,
  "message": "Admin created successfully",
  "data": {
    "_id": "64a1b2c3d4e5f6a7b8c9d0e1",
    "user_id": "USR001",
    "login": "admin@example.com",
    "name_f": "John",
    "name_l": "Doe",
    "email": "admin@example.com"
  }
}
```

---

#### GET `/api/v1/admin/fetch`

Fetch currently authenticated admin details.

**Authentication Required:** Yes

**Headers:**
```
x-access-token: eyJhbGciOiJIUzUxMiIsInR5cCI6IkpXVCJ9...
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "_id": "64a1b2c3d4e5f6a7b8c9d0e1",
    "user_id": "USR001",
    "login": "admin@example.com",
    "name_f": "John",
    "name_l": "Doe",
    "email": "admin@example.com",
    "orgId": "12345"
  }
}
```

---

#### PUT `/api/v1/admin/update`

Update admin details.

**Request Body:**
```json
{
  "name_f": "Jonathan",
  "name_l": "Doe",
  "email": "jonathan.doe@example.com"
}
```

---

#### POST `/api/v1/admin/get-emp-employees-by-organization`

Get employees from EMP Monitor by organization.

**Authentication Required:** Yes

**Request Body:**
```json
{
  "orgId": "12345"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "emp_id": 101,
      "name": "Jane Smith",
      "email": "jane@company.com",
      "designation": "Developer",
      "department": "Engineering"
    }
  ]
}
```

---

#### POST `/api/v1/admin/import-emp-users`

Import users from EMP Monitor system.

**Authentication Required:** Yes

**Request Body:**
```json
{
  "users": [
    {
      "emp_id": 101,
      "email": "jane@company.com",
      "firstName": "Jane",
      "lastName": "Smith"
    }
  ]
}
```

---

### 3. NVR Management APIs

**Base Path:** `/api/v1/nvr`
**Authentication Required:** Yes (all routes)

---

#### GET `/api/v1/nvr/`

Get NVRs with pagination.

**Query Parameters:**
| Parameter | Type   | Required | Description           |
| --------- | ------ | -------- | --------------------- |
| `skip`    | Number | No       | Pagination offset     |
| `limit`   | Number | No       | Items per page        |

**Example:** `GET /api/v1/nvr?skip=0&limit=10`

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "nvrs": [
      {
        "_id": "64a1b2c3d4e5f6a7b8c9d0e1",
        "nvrName": "Office NVR 1",
        "ip": "192.168.1.100",
        "port": 8000,
        "rtspPort": 554,
        "brand": "hikvision",
        "cameraCount": 16,
        "location": "New York - Floor 3",
        "username": "admin",
        "createdAt": "2025-06-01T10:00:00.000Z"
      }
    ],
    "total": 5
  }
}
```

---

#### GET `/api/v1/nvr/all-nvrs`

Get all NVRs without pagination.

**Success Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "_id": "64a1b2c3d4e5f6a7b8c9d0e1",
      "nvrName": "Office NVR 1",
      "brand": "hikvision",
      "location": "New York - Floor 3",
      "cameraCount": 16
    }
  ]
}
```

---

#### GET `/api/v1/nvr/locations`

Get all unique NVR locations.

**Success Response (200):**
```json
{
  "success": true,
  "data": ["New York - Floor 3", "Chicago - Main Gate", "LA - Warehouse"]
}
```

---

#### POST `/api/v1/nvr/register`

Register a new NVR with camera auto-discovery.

**Request Body:**
```json
{
  "nvrName": "Office NVR 1",
  "ip": "192.168.1.100",
  "port": 8000,
  "rtspPort": 554,
  "username": "admin",
  "password": "nvr_password",
  "brand": "hikvision",
  "location": "New York - Floor 3"
}
```

**Success Response (201):**
```json
{
  "success": true,
  "message": "NVR registered successfully",
  "data": {
    "_id": "64a1b2c3d4e5f6a7b8c9d0e1",
    "nvrName": "Office NVR 1",
    "ip": "192.168.1.100",
    "port": 8000,
    "brand": "hikvision",
    "cameraCount": 16,
    "location": "New York - Floor 3",
    "channels": [
      {
        "_id": "64b2c3d4e5f6a7b8c9d0e1f2",
        "name": "Camera 1",
        "channelId": "101",
        "streamEndpoint": "rtsp://192.168.1.100:554/ch1/main"
      }
    ]
  }
}
```

---

#### POST `/api/v1/nvr/add-nvr`

Add a new NVR without auto-discovering cameras.

**Request Body:**
```json
{
  "nvrName": "Warehouse NVR",
  "ip": "192.168.2.100",
  "port": 8000,
  "rtspPort": 554,
  "username": "admin",
  "password": "nvr_password",
  "brand": "dahua",
  "location": "Warehouse - Block A"
}
```

---

#### GET `/api/v1/nvr/with-channels`

Get NVRs along with their associated channels, filtered by detection setting type.

**Query Parameters:**
| Parameter     | Type   | Required | Description                                          |
| ------------- | ------ | -------- | ---------------------------------------------------- |
| `settingType` | String | No       | Detection setting type filter (e.g., `countPersonsSettings`, `motionDetectionSettings`) |

**Example:** `GET /api/v1/nvr/with-channels?settingType=countPersonsSettings`

**Success Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "_id": "64a1b2c3d4e5f6a7b8c9d0e1",
      "nvrName": "Office NVR 1",
      "location": "New York - Floor 3",
      "channels": [
        {
          "_id": "64b2c3d4e5f6a7b8c9d0e1f2",
          "name": "Camera 1",
          "detectionStatus": 1,
          "countPersonsSettings": {
            "id": "64c3d4e5f6a7b8c9d0e1f2a3",
            "enabled": true
          }
        }
      ]
    }
  ]
}
```

---

#### PATCH `/api/v1/nvr/refetch/:id`

Re-fetch and update channels for an NVR (re-discovers cameras).

**Example:** `PATCH /api/v1/nvr/refetch/64a1b2c3d4e5f6a7b8c9d0e1`

---

#### PATCH `/api/v1/nvr/:id`

Update NVR details.

**Example:** `PATCH /api/v1/nvr/64a1b2c3d4e5f6a7b8c9d0e1`

**Request Body:**
```json
{
  "nvrName": "Updated NVR Name",
  "location": "New York - Floor 5",
  "port": 8080
}
```

---

#### DELETE `/api/v1/nvr/:id`

Delete a specific NVR and all associated channels.

**Example:** `DELETE /api/v1/nvr/64a1b2c3d4e5f6a7b8c9d0e1`

---

#### GET `/api/v1/nvr/:id`

Get a single NVR by ID.

**Example:** `GET /api/v1/nvr/64a1b2c3d4e5f6a7b8c9d0e1`

---

#### GET `/api/v1/nvr/delete-all`

Delete all NVRs for the authenticated user.

---

### 4. Channel/Camera APIs

**Base Path:** `/api/v1/channel`
**Authentication Required:** Yes (all routes)

---

#### GET `/api/v1/channel/`

Get all channels for the authenticated user.

**Success Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "_id": "64b2c3d4e5f6a7b8c9d0e1f2",
      "nvrId": "64a1b2c3d4e5f6a7b8c9d0e1",
      "name": "Main Entrance Camera",
      "channelId": "101",
      "ipAddress": "192.168.1.101",
      "streamEndpoint": "rtsp://192.168.1.100:554/ch1/main",
      "model": "DS-2CD2143G2-I",
      "detectionStatus": 1,
      "control": 1,
      "countPersonsSettings": {
        "id": "64c3d4e5f6a7b8c9d0e1f2a3",
        "enabled": true
      }
    }
  ]
}
```

---

#### GET `/api/v1/channel/nvr/:nvrId`

Get all channels belonging to a specific NVR.

**Example:** `GET /api/v1/channel/nvr/64a1b2c3d4e5f6a7b8c9d0e1`

---

#### GET `/api/v1/channel/all-channels`

Get all channels with filters.

**Query Parameters:**
| Parameter | Type   | Description             |
| --------- | ------ | ----------------------- |
| `search`  | String | Search by channel name  |
| `nvrId`   | String | Filter by NVR ID        |

---

#### GET `/api/v1/channel/:id`

Get a specific channel by ID.

**Example:** `GET /api/v1/channel/64b2c3d4e5f6a7b8c9d0e1f2`

---

#### PUT `/api/v1/channel/:id`

Update channel details.

**Request Body:**
```json
{
  "name": "Updated Camera Name",
  "streamEndpoint": "rtsp://192.168.1.100:554/ch2/main"
}
```

---

#### DELETE `/api/v1/channel/:id`

Delete a specific channel.

---

#### PUT `/api/v1/channel/detection/toggle`

Toggle detection on/off for a channel.

**Request Body:**
```json
{
  "channelId": "64b2c3d4e5f6a7b8c9d0e1f2",
  "detectionStatus": 1,
  "control": 1
}
```

**Values:**
- `detectionStatus`: `0` = Off, `1` = On, `2` = Paused
- `control`: `0` = Stop, `1` = Start

---

#### PUT `/api/v1/channel/channels/bulk-update`

Bulk update multiple channels at once.

**Request Body:**
```json
{
  "channelIds": ["64b2c3d4e5f6a7b8c9d0e1f2", "64b2c3d4e5f6a7b8c9d0e1f3"],
  "updates": {
    "detectionStatus": 1,
    "control": 1
  }
}
```

---

#### PUT `/api/v1/channel/updateConfiguration`

Update channel configuration settings.

**Request Body:**
```json
{
  "channelId": "64b2c3d4e5f6a7b8c9d0e1f2",
  "configuration": {
    "countPersonsSettings": {
      "id": "64c3d4e5f6a7b8c9d0e1f2a3",
      "enabled": true
    },
    "motionDetectionSettings": {
      "id": "64c3d4e5f6a7b8c9d0e1f2a4",
      "enabled": false
    }
  }
}
```

---

#### POST `/api/v1/channel/playback-url`

Get the playback stream URL for a channel.

**Request Body:**
```json
{
  "channelId": "64b2c3d4e5f6a7b8c9d0e1f2",
  "startTime": "2025-06-15T10:00:00.000Z",
  "endTime": "2025-06-15T11:00:00.000Z"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "playbackUrl": "rtsp://192.168.1.100:554/playback?channel=1&starttime=2025-06-15T10:00:00"
  }
}
```

---

#### POST `/api/v1/channel/playback-timeline`

Get the playback timeline data for a channel.

**Request Body:**
```json
{
  "channelId": "64b2c3d4e5f6a7b8c9d0e1f2",
  "date": "2025-06-15"
}
```

---

#### POST `/api/v1/channel/playBackFilters`

Get playback data with advanced filters.

**Request Body:**
```json
{
  "channelId": "64b2c3d4e5f6a7b8c9d0e1f2",
  "startTime": "2025-06-15T10:00:00.000Z",
  "endTime": "2025-06-15T11:00:00.000Z",
  "detectionType": "countPersons"
}
```

---

### 5. Incidents APIs

**Base Path:** `/api/v1/incidents`
**Authentication Required:** Yes (all routes)

---

#### POST `/api/v1/incidents/create`

Create a new incident record.

**Request Body:**
```json
{
  "timeOfIncident": "2025-06-15T10:30:00.000Z",
  "incidentName": "Crowd Detected",
  "description": "More than 10 people detected in restricted area",
  "cameraId": "CAM001",
  "nvrId": "64a1b2c3d4e5f6a7b8c9d0e1",
  "channelId": "64b2c3d4e5f6a7b8c9d0e1f2",
  "severity": "high",
  "type": "countPersons",
  "Image": "https://storage.example.com/incident_001.jpg",
  "videoLink": "https://storage.example.com/incident_001.mp4",
  "zone": "Zone A - Restricted",
  "count": 15,
  "triggerNotification": true,
  "timeSeries": [
    { "timestamp": "2025-06-15T10:29:00.000Z", "count": 8 },
    { "timestamp": "2025-06-15T10:30:00.000Z", "count": 15 }
  ]
}
```

**Success Response (201):**
```json
{
  "success": true,
  "message": "Incident created successfully",
  "data": {
    "_id": "64d4e5f6a7b8c9d0e1f2a3b4",
    "timeOfIncident": "2025-06-15T10:30:00.000Z",
    "incidentName": "Crowd Detected",
    "severity": "high",
    "type": "countPersons",
    "resolved": false,
    "report": {
      "status": false,
      "description": ""
    }
  }
}
```

---

#### POST `/api/v1/incidents/`

Get incidents with pagination, search, and filters.

**Query Parameters:**
| Parameter  | Type    | Required | Description                           |
| ---------- | ------- | -------- | ------------------------------------- |
| `skip`     | Number  | No       | Pagination offset (default: 0)        |
| `limit`    | Number  | No       | Items per page (default: 10)          |
| `search`   | String  | No       | Search by incident name/description   |
| `isExport` | Boolean | No       | If true, returns all data (no pagination) |

**Request Body:**
```json
{
  "channelId": "64b2c3d4e5f6a7b8c9d0e1f2",
  "nvrId": "64a1b2c3d4e5f6a7b8c9d0e1",
  "type": "countPersons",
  "severity": "high",
  "startDate": "2025-06-01T00:00:00.000Z",
  "endDate": "2025-06-30T23:59:59.999Z"
}
```

**Example:** `POST /api/v1/incidents?skip=0&limit=10&search=crowd`

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "incidents": [
      {
        "_id": "64d4e5f6a7b8c9d0e1f2a3b4",
        "timeOfIncident": "2025-06-15T10:30:00.000Z",
        "incidentName": "Crowd Detected",
        "severity": "high",
        "type": "countPersons",
        "channelId": {
          "_id": "64b2c3d4e5f6a7b8c9d0e1f2",
          "name": "Main Entrance Camera"
        },
        "nvrId": {
          "_id": "64a1b2c3d4e5f6a7b8c9d0e1",
          "nvrName": "Office NVR 1"
        },
        "resolved": false,
        "count": 15,
        "Image": "https://storage.example.com/incident_001.jpg"
      }
    ],
    "total": 45
  }
}
```

---

#### GET `/api/v1/incidents/getIncident`

Get incidents by specific ID.

**Query Parameters:**
| Parameter    | Type   | Description                |
| ------------ | ------ | -------------------------- |
| `incidentId` | String | Specific incident ID       |
| `channelId`  | String | Filter by channel ID       |

**Example:** `GET /api/v1/incidents/getIncident?incidentId=64d4e5f6a7b8c9d0e1f2a3b4`

---

#### GET `/api/v1/incidents/getIncidentLists`

Get a summary list of incidents.

---

#### PUT `/api/v1/incidents/:id`

Update an incident.

**Example:** `PUT /api/v1/incidents/64d4e5f6a7b8c9d0e1f2a3b4`

**Request Body:**
```json
{
  "severity": "moderate",
  "resolved": true,
  "description": "Updated description after review"
}
```

---

#### DELETE `/api/v1/incidents/:id`

Delete a specific incident.

---

#### DELETE `/api/v1/incidents/delete-by-incidentIds`

Bulk delete incidents by IDs (supports file upload with incident IDs).

**Request Body (multipart/form-data):**
```json
{
  "incidentIds": ["64d4e5f6a7b8c9d0e1f2a3b4", "64d4e5f6a7b8c9d0e1f2a3b5"]
}
```

---

#### POST `/api/v1/incidents/getIncidentsDetails`

Get detailed incident information with populated references.

**Request Body:**
```json
{
  "incidentIds": ["64d4e5f6a7b8c9d0e1f2a3b4"]
}
```

---

#### POST `/api/v1/incidents/update-report-status`

Update the report status of an incident.

**Request Body:**
```json
{
  "incidentId": "64d4e5f6a7b8c9d0e1f2a3b4",
  "report": {
    "status": true,
    "description": "Incident reviewed and reported to security team",
    "resolvedAt": "2025-06-15T12:00:00.000Z",
    "reportedAt": "2025-06-15T11:30:00.000Z"
  }
}
```

---

#### POST `/api/v1/incidents/deskAbsenceData`

Get desk absence detection data.

**Request Body:**
```json
{
  "channelIds": ["64b2c3d4e5f6a7b8c9d0e1f2"],
  "startDate": "2025-06-01",
  "endDate": "2025-06-30"
}
```

---

#### POST `/api/v1/incidents/guardAbsenceData`

Get guard absence detection data.

**Request Body:**
```json
{
  "channelIds": ["64b2c3d4e5f6a7b8c9d0e1f2"],
  "startDate": "2025-06-01",
  "endDate": "2025-06-30"
}
```

---

### 6. Dashboard APIs

**Base Path:** `/api/v1/dashboard`
**Authentication Required:** Yes (all routes)

---

#### POST `/api/v1/dashboard/headerStats`

Get dashboard header statistics (total incidents, cameras, NVRs, etc.).

**Request Body:**
```json
{
  "startDate": "2025-06-01",
  "endDate": "2025-06-30",
  "channelIds": ["64b2c3d4e5f6a7b8c9d0e1f2"]
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "totalIncidents": 234,
    "totalCameras": 48,
    "totalNVRs": 6,
    "activeDetections": 32,
    "resolvedIncidents": 180,
    "unresolvedIncidents": 54
  }
}
```

---

#### POST `/api/v1/dashboard/criticalityStats`

Get incident criticality breakdown statistics.

**Request Body:**
```json
{
  "startDate": "2025-06-01",
  "endDate": "2025-06-30"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "high": 45,
    "moderate": 120,
    "low": 69
  }
}
```

---

#### POST `/api/v1/dashboard/detectionChart`

Get detection statistics for charting.

**Request Body:**
```json
{
  "startDate": "2025-06-01",
  "endDate": "2025-06-30",
  "detectionType": "countPersons"
}
```

---

#### POST `/api/v1/dashboard/dashboardWeeklyComparisonChart`

Get weekly comparison chart data.

**Request Body:**
```json
{
  "startDate": "2025-06-01",
  "endDate": "2025-06-14"
}
```

---

#### GET `/api/v1/dashboard/getSidebarConfig`

Get dashboard sidebar configuration.

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "modules": [
      { "name": "incidents", "visible": true },
      { "name": "attendance", "visible": true },
      { "name": "accessLogs", "visible": false }
    ]
  }
}
```

---

#### PUT `/api/v1/dashboard/updateSidebarConfig`

Update dashboard sidebar configuration.

**Request Body:**
```json
{
  "modules": [
    { "name": "incidents", "visible": true },
    { "name": "attendance", "visible": true },
    { "name": "accessLogs", "visible": true }
  ]
}
```

---

#### GET `/api/v1/dashboard/getIncidentsByType`

Get incidents grouped by detection type.

---

#### GET `/api/v1/dashboard/recentIncidents`

Get the most recent incidents.

**Success Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "_id": "64d4e5f6a7b8c9d0e1f2a3b4",
      "incidentName": "Motion Detected",
      "severity": "moderate",
      "timeOfIncident": "2025-06-15T10:30:00.000Z",
      "channelName": "Main Entrance Camera"
    }
  ]
}
```

---

#### POST `/api/v1/dashboard/getDetections`

Get detection data for dashboard visualization.

**Request Body:**
```json
{
  "channelIds": ["64b2c3d4e5f6a7b8c9d0e1f2"],
  "detectionType": "countPersons",
  "startDate": "2025-06-01",
  "endDate": "2025-06-30"
}
```

---

### 7. Users APIs

**Base Path:** `/api/v1/users`

---

#### POST `/api/v1/users/login`

User login (for sub-users, not admin).

**Authentication Required:** No

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "UserPassword123"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzUxMiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "_id": "64e5f6a7b8c9d0e1f2a3b4c5",
      "firstName": "Jane",
      "lastName": "Smith",
      "email": "user@example.com",
      "roleIds": "64f6a7b8c9d0e1f2a3b4c5d6",
      "active": true
    }
  }
}
```

---

#### POST `/api/v1/users/forgot-password`

Request a password reset link.

**Authentication Required:** No

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Password reset link sent to email"
}
```

---

#### POST `/api/v1/users/reset-password`

Reset password using the reset token.

**Authentication Required:** No

**Request Body:**
```json
{
  "token": "reset_token_from_email",
  "newPassword": "NewPassword123",
  "confirmPassword": "NewPassword123"
}
```

---

#### POST `/api/v1/users/change-password`

Change password for authenticated user.

**Authentication Required:** Yes

**Request Body:**
```json
{
  "currentPassword": "OldPassword123",
  "newPassword": "NewPassword123"
}
```

---

#### POST `/api/v1/users/fetch`

Get users with pagination, search, and sorting.

**Authentication Required:** Yes

**Request Body:**
```json
{
  "userId": "64e5f6a7b8c9d0e1f2a3b4c5",
  "skip": 0,
  "limit": 10,
  "searchQuery": "jane",
  "orderBy": "createdAt",
  "sort": -1
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "users": [
      {
        "_id": "64e5f6a7b8c9d0e1f2a3b4c5",
        "firstName": "Jane",
        "lastName": "Smith",
        "email": "jane@company.com",
        "designation": "Security Manager",
        "active": true,
        "roleIds": {
          "_id": "64f6a7b8c9d0e1f2a3b4c5d6",
          "roleName": "Manager"
        },
        "location": "New York",
        "createdAt": "2025-06-01T10:00:00.000Z"
      }
    ],
    "total": 15
  }
}
```

---

#### POST `/api/v1/users/create`

Create a new user.

**Authentication Required:** Yes

**Request Body:**
```json
{
  "firstName": "Jane",
  "lastName": "Smith",
  "email": "jane@company.com",
  "password": "SecurePass123",
  "designation": "Security Manager",
  "roleIds": "64f6a7b8c9d0e1f2a3b4c5d6",
  "location": "New York",
  "phoneNumber": "+1234567890",
  "timezone": "America/New_York"
}
```

---

#### PUT `/api/v1/users/update`

Update a user.

**Query Parameters:**
| Parameter | Type   | Required | Description     |
| --------- | ------ | -------- | --------------- |
| `userId`  | String | Yes      | User ID to update |

**Example:** `PUT /api/v1/users/update?userId=64e5f6a7b8c9d0e1f2a3b4c5`

**Request Body:**
```json
{
  "firstName": "Janet",
  "designation": "Senior Security Manager",
  "active": true
}
```

---

#### DELETE `/api/v1/users/delete`

Delete a user.

**Query Parameters:**
| Parameter | Type   | Required | Description     |
| --------- | ------ | -------- | --------------- |
| `userId`  | String | Yes      | User ID to delete |

---

#### DELETE `/api/v1/users/bulk-delete`

Bulk delete multiple users.

**Request Body:**
```json
{
  "userIds": ["64e5f6a7b8c9d0e1f2a3b4c5", "64e5f6a7b8c9d0e1f2a3b4c6"]
}
```

---

#### GET `/api/v1/users/isEmailExist`

Check if an email already exists.

**Query Parameters:**
| Parameter | Type   | Required | Description          |
| --------- | ------ | -------- | -------------------- |
| `email`   | String | Yes      | Email to check       |

**Example:** `GET /api/v1/users/isEmailExist?email=jane@company.com`

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "exists": true
  }
}
```

---

#### POST `/api/v1/users/import-users`

Import users from CSV file.

**Authentication Required:** Yes

**Request Body (multipart/form-data):**
- `file`: CSV file with user data

---

### 8. Authorized Users APIs

**Base Path:** `/api/v1/authorizedUsers`
**Authentication Required:** Yes (all routes)

Authorized users are individuals who are recognized by the face recognition system (e.g., employees for attendance tracking).

---

#### POST `/api/v1/authorizedUsers/fetch`

Fetch authorized users.

**Request Body:**
```json
{
  "skip": 0,
  "limit": 10,
  "searchQuery": "john"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "users": [
      {
        "_id": "64g7h8i9j0k1l2m3n4o5p6q7",
        "firstName": "John",
        "lastName": "Doe",
        "email": "john@company.com",
        "designation": "Engineer",
        "departmentId": {
          "_id": "64h8i9j0k1l2m3n4o5p6q7r8",
          "departmentName": "Engineering"
        },
        "profilePics": ["uploads/profiles/john_1.jpg", "uploads/profiles/john_2.jpg"],
        "verified": true,
        "shiftId": {
          "_id": "64i9j0k1l2m3n4o5p6q7r8s9",
          "name": "Morning Shift"
        }
      }
    ],
    "total": 50
  }
}
```

---

#### POST `/api/v1/authorizedUsers/create`

Create an authorized user with profile pictures (max 3 files).

**Request Body (multipart/form-data):**
```
firstName: John
lastName: Doe
email: john@company.com
designation: Engineer
departmentId: 64h8i9j0k1l2m3n4o5p6q7r8
shiftId: 64i9j0k1l2m3n4o5p6q7r8s9
phoneNumber: +1234567890
files: [profile_pic_1.jpg, profile_pic_2.jpg, profile_pic_3.jpg]
```

---

#### PUT `/api/v1/authorizedUsers/update`

Update an authorized user (max 3 profile pic files).

**Query Parameters:**
| Parameter | Type   | Required | Description     |
| --------- | ------ | -------- | --------------- |
| `userId`  | String | Yes      | User ID         |

---

#### DELETE `/api/v1/authorizedUsers/delete`

Delete an authorized user.

**Query Parameters:**
| Parameter | Type   | Required | Description     |
| --------- | ------ | -------- | --------------- |
| `userId`  | String | Yes      | User ID         |

---

#### POST `/api/v1/authorizedUsers/bulk-import`

Bulk import authorized users.

**Request Body:**
```json
{
  "users": [
    {
      "firstName": "John",
      "lastName": "Doe",
      "email": "john@company.com",
      "designation": "Engineer",
      "departmentId": "64h8i9j0k1l2m3n4o5p6q7r8"
    }
  ]
}
```

---

#### POST `/api/v1/authorizedUsers/verifyUser`

Verify an authorized user (with optional profile picture upload).

**Request Body (multipart/form-data):**
```
userId: 64g7h8i9j0k1l2m3n4o5p6q7
files: [verification_photo.jpg]
```

---

### 9. Roles APIs

**Base Path:** `/api/v1/roles`
**Authentication Required:** Yes (all routes)

---

#### POST `/api/v1/roles/create`

Create a new role.

**Request Body:**
```json
{
  "roleName": "Security Supervisor",
  "view": true,
  "create": true,
  "edit": true,
  "delete": false,
  "is_default": false
}
```

**Success Response (201):**
```json
{
  "success": true,
  "message": "Role created successfully",
  "data": {
    "_id": "64f6a7b8c9d0e1f2a3b4c5d6",
    "roleName": "Security Supervisor",
    "view": true,
    "create": true,
    "edit": true,
    "delete": false,
    "is_default": false
  }
}
```

---

#### POST `/api/v1/roles/get`

Get all roles.

**Request Body:**
```json
{
  "skip": 0,
  "limit": 10,
  "searchQuery": "supervisor"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "roles": [
      {
        "_id": "64f6a7b8c9d0e1f2a3b4c5d6",
        "roleName": "Security Supervisor",
        "view": true,
        "create": true,
        "edit": true,
        "delete": false,
        "is_default": false,
        "permissionId": "64j0k1l2m3n4o5p6q7r8s9t0"
      }
    ],
    "total": 4
  }
}
```

---

#### PUT `/api/v1/roles/update`

Update a role.

**Query Parameters:**
| Parameter | Type   | Required | Description  |
| --------- | ------ | -------- | ------------ |
| `roleId`  | String | Yes      | Role ID      |

**Request Body:**
```json
{
  "roleName": "Updated Role Name",
  "delete": true
}
```

---

#### DELETE `/api/v1/roles/delete`

Delete a role.

**Query Parameters:**
| Parameter | Type   | Required | Description  |
| --------- | ------ | -------- | ------------ |
| `roleId`  | String | Yes      | Role ID      |

---

### 10. Permissions APIs

**Base Path:** `/api/v1/permissions`
**Authentication Required:** Yes (all routes)

---

#### POST `/api/v1/permissions/create`

Create a permission configuration.

**Request Body:**
```json
{
  "permissionName": "Custom Permission",
  "permissionConfig": {
    "channels": { "view": true, "create": false, "edit": false, "delete": false },
    "incidents": { "view": true, "create": false, "edit": false, "delete": false },
    "NVR": { "view": true, "create": false, "edit": false, "delete": false },
    "dashboard": { "view": true, "create": false, "edit": false, "delete": false },
    "Users": { "view": false, "create": false, "edit": false, "delete": false },
    "roles": { "view": false, "create": false, "edit": false, "delete": false },
    "permission": { "view": false, "create": false, "edit": false, "delete": false }
  }
}
```

**Success Response (201):**
```json
{
  "success": true,
  "message": "Permission created successfully",
  "data": {
    "_id": "64j0k1l2m3n4o5p6q7r8s9t0",
    "permissionName": "Custom Permission",
    "permissionConfig": { ... },
    "is_default": false
  }
}
```

---

#### GET `/api/v1/permissions/fetch`

Fetch all permissions.

---

#### PUT `/api/v1/permissions/update`

Update a permission.

**Query Parameters:**
| Parameter      | Type   | Required | Description    |
| -------------- | ------ | -------- | -------------- |
| `permissionId` | String | Yes      | Permission ID  |

---

#### DELETE `/api/v1/permissions/delete`

Delete a permission.

**Query Parameters:**
| Parameter      | Type   | Required | Description    |
| -------------- | ------ | -------- | -------------- |
| `permissionId` | String | Yes      | Permission ID  |

---

#### POST `/api/v1/permissions/roles_permissions`

Get permissions associated with a specific role.

**Request Body:**
```json
{
  "roleId": "64f6a7b8c9d0e1f2a3b4c5d6"
}
```

---

#### POST `/api/v1/permissions/bulk-permissionConfig-update`

Bulk update permission configurations.

**Request Body:**
```json
{
  "permissions": [
    {
      "permissionId": "64j0k1l2m3n4o5p6q7r8s9t0",
      "permissionConfig": {
        "channels": { "view": true, "create": true, "edit": true, "delete": false }
      }
    }
  ]
}
```

---

#### POST `/api/v1/permissions/bulk-permissionConfig-delete`

Bulk delete permission configurations.

**Request Body:**
```json
{
  "permissionIds": ["64j0k1l2m3n4o5p6q7r8s9t0", "64j0k1l2m3n4o5p6q7r8s9t1"]
}
```

---

#### GET `/api/v1/permissions/user-permissions`

Get the current user's permissions.

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "permissionConfig": {
      "channels": { "view": true, "create": true, "edit": true, "delete": true },
      "incidents": { "view": true, "create": true, "edit": true, "delete": true },
      "NVR": { "view": true, "create": true, "edit": true, "delete": true },
      "dashboard": { "view": true, "create": true, "edit": true, "delete": true },
      "Users": { "view": true, "create": true, "edit": true, "delete": true },
      "roles": { "view": true, "create": true, "edit": true, "delete": true },
      "permission": { "view": true, "create": true, "edit": true, "delete": true }
    }
  }
}
```

---

### 11. Departments APIs

**Base Path:** `/api/v1/departments`
**Authentication Required:** Yes (all routes)

---

#### POST `/api/v1/departments/create`

Create a new department.

**Request Body:**
```json
{
  "departmentName": "Engineering",
  "description": "Software engineering department",
  "isActive": true
}
```

**Success Response (201):**
```json
{
  "success": true,
  "message": "Department created successfully",
  "data": {
    "_id": "64h8i9j0k1l2m3n4o5p6q7r8",
    "departmentName": "Engineering",
    "description": "Software engineering department",
    "isActive": true
  }
}
```

---

#### POST `/api/v1/departments/get`

Get all departments.

**Request Body:**
```json
{
  "skip": 0,
  "limit": 10,
  "searchQuery": "engineering"
}
```

---

#### PUT `/api/v1/departments/update`

Update a department.

**Query Parameters:**
| Parameter      | Type   | Required | Description     |
| -------------- | ------ | -------- | --------------- |
| `departmentId` | String | Yes      | Department ID   |

**Request Body:**
```json
{
  "departmentName": "Updated Engineering",
  "description": "Updated description",
  "isActive": true
}
```

---

#### DELETE `/api/v1/departments/delete`

Delete a department.

**Query Parameters:**
| Parameter      | Type   | Required | Description     |
| -------------- | ------ | -------- | --------------- |
| `departmentId` | String | Yes      | Department ID   |

---

### 12. Detection Settings APIs

**Base Path:** `/api/v1/detection-settings`
**Authentication Required:** Yes (all routes)

---

#### GET `/api/v1/detection-settings/`

Get all detection settings.

**Success Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "_id": "64c3d4e5f6a7b8c9d0e1f2a3",
      "name": "Person Counter - Entrance",
      "settingType": "countPersonsSettings",
      "enabled": true,
      "imageRequired": true,
      "videoLinkRequirement": true,
      "videoDuration": 30,
      "levelOfImportance": "high",
      "detectionTimeGap": 30,
      "metricType": "gauge",
      "alerts": [
        {
          "_id": "64k1l2m3n4o5p6q7r8s9t0u1",
          "type": "email",
          "value": "security@company.com"
        }
      ]
    }
  ]
}
```

---

#### POST `/api/v1/detection-settings/`

Create a new detection setting.

**Request Body:**
```json
{
  "name": "Person Counter - Entrance",
  "settingType": "countPersonsSettings",
  "enabled": true,
  "imageRequired": true,
  "videoLinkRequirement": true,
  "videoDuration": 30,
  "videoMinLength": 10,
  "videoMaxLength": 60,
  "levelOfImportance": "high",
  "videoResolution": [1920, 1080],
  "detectionTimeGap": 30,
  "metricType": "gauge",
  "referencePoints": {
    "x1": 100,
    "y1": 200,
    "x2": 500,
    "y2": 400
  },
  "alerts": ["64k1l2m3n4o5p6q7r8s9t0u1"]
}
```

---

#### GET `/api/v1/detection-settings/examples`

Get example detection settings for reference.

---

#### GET `/api/v1/detection-settings/types`

Get available detection types.

**Success Response (200):**
```json
{
  "success": true,
  "data": [
    "countPersonsSettings",
    "countVehiclesSettings",
    "motionDetectionSettings",
    "genericObjectDetectionSettings",
    "loiteringWithoutAuthSettings",
    "loiteringWithAuthSettings",
    "unauthorizedAccessSettings",
    "lineCrossingSettings",
    "fireSmokeDetectionSettings",
    "weaponDetectionSettings",
    "unattendedBaggageDetectionSettings",
    "personalProtectiveEquipmentSettings",
    "crowdDetectionSettings",
    "doorDetectionSettings",
    "lightDetectionSettings",
    "vehicleDetectionSettings",
    "deskAbsenceSettings",
    "guardAbsenceSettings"
  ]
}
```

---

#### GET `/api/v1/detection-settings/:id`

Get a specific detection setting by ID.

---

#### PUT `/api/v1/detection-settings/:id`

Update a detection setting.

**Request Body:**
```json
{
  "name": "Updated Person Counter",
  "enabled": false,
  "levelOfImportance": "moderate"
}
```

---

#### DELETE `/api/v1/detection-settings/:id`

Delete a detection setting.

---

#### POST `/api/v1/detection-settings/attach`

Attach a detection setting to a channel/camera.

**Request Body:**
```json
{
  "settingId": "64c3d4e5f6a7b8c9d0e1f2a3",
  "channelId": "64b2c3d4e5f6a7b8c9d0e1f2",
  "settingType": "countPersonsSettings"
}
```

---

#### POST `/api/v1/detection-settings/detach`

Detach a detection setting from a channel/camera.

**Request Body:**
```json
{
  "settingId": "64c3d4e5f6a7b8c9d0e1f2a3",
  "channelId": "64b2c3d4e5f6a7b8c9d0e1f2",
  "settingType": "countPersonsSettings"
}
```

---

### 13. Detection Objects APIs

**Base Path:** `/api/v1/detection-objects`
**Authentication Required:** Yes (all routes)

---

#### GET `/api/v1/detection-objects/`

Get all detection objects.

**Success Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "_id": "64l2m3n4o5p6q7r8s9t0u1v2",
      "settingType": "personalProtectiveEquipment",
      "objects": ["helmet", "vest", "gloves", "goggles", "boots"]
    },
    {
      "_id": "64l2m3n4o5p6q7r8s9t0u1v3",
      "settingType": "crowdDetection",
      "objects": ["person", "group"]
    }
  ]
}
```

---

#### POST `/api/v1/detection-objects/`

Create detection objects.

**Request Body:**
```json
{
  "settingType": "personalProtectiveEquipment",
  "objects": ["helmet", "vest", "gloves", "goggles", "boots"]
}
```

---

#### POST `/api/v1/detection-objects/delete`

Delete detection objects.

**Request Body:**
```json
{
  "ids": ["64l2m3n4o5p6q7r8s9t0u1v2"]
}
```

---

### 14. Profiles APIs

**Base Path:** `/api/v1/profiles`
**Authentication Required:** Yes (all routes)

Profiles define detection behavior, notification settings, and evidence capture configuration.

---

#### GET `/api/v1/profiles/`

Get all profiles.

**Success Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "_id": "64m3n4o5p6q7r8s9t0u1v2w3",
      "status": "Active",
      "basics": {
        "profileName": "Weekday Monitoring",
        "timeZone": "America/New_York",
        "days": {
          "monday": [{ "startTime": "08:00", "endTime": "18:00" }],
          "tuesday": [{ "startTime": "08:00", "endTime": "18:00" }],
          "wednesday": [{ "startTime": "08:00", "endTime": "18:00" }],
          "thursday": [{ "startTime": "08:00", "endTime": "18:00" }],
          "friday": [{ "startTime": "08:00", "endTime": "18:00" }],
          "saturday": [],
          "sunday": []
        }
      },
      "notification": {
        "notify": "Digest",
        "digestEveryMinutes": 15,
        "recipients": ["64k1l2m3n4o5p6q7r8s9t0u1"],
        "channels": {
          "email": true,
          "smsWhatsapp": false,
          "push": true,
          "webhook": false
        },
        "enableQuietHours": true,
        "quietFrom": "22:00",
        "quietTo": "06:00"
      },
      "evidenceSeverity": {
        "evidenceType": "Video",
        "time": 30,
        "storage": "64n4o5p6q7r8s9t0u1v2w3x4"
      }
    }
  ]
}
```

---

#### POST `/api/v1/profiles/`

Add a new profile.

**Request Body:**
```json
{
  "basics": {
    "profileName": "24/7 High Security",
    "timeZone": "UTC",
    "days": {
      "monday": [{ "startTime": "00:00", "endTime": "23:59" }],
      "tuesday": [{ "startTime": "00:00", "endTime": "23:59" }],
      "wednesday": [{ "startTime": "00:00", "endTime": "23:59" }],
      "thursday": [{ "startTime": "00:00", "endTime": "23:59" }],
      "friday": [{ "startTime": "00:00", "endTime": "23:59" }],
      "saturday": [{ "startTime": "00:00", "endTime": "23:59" }],
      "sunday": [{ "startTime": "00:00", "endTime": "23:59" }]
    }
  },
  "notification": {
    "notify": "Instant",
    "recipients": ["64k1l2m3n4o5p6q7r8s9t0u1"],
    "channels": {
      "email": true,
      "smsWhatsapp": true,
      "push": true,
      "webhook": true
    },
    "webhooks": [
      {
        "url": "https://hooks.example.com/alerts",
        "method": "POST",
        "body": "{\"alert\": \"{{incidentName}}\"}"
      }
    ]
  },
  "evidenceSeverity": {
    "evidenceType": "Video",
    "time": 60,
    "storage": "64n4o5p6q7r8s9t0u1v2w3x4"
  },
  "defaultDetectionSettings": {
    "authorisedUsers": ["64g7h8i9j0k1l2m3n4o5p6q7"],
    "objects": {
      "personalProtectiveEquipment": [
        { "name": "helmet", "notify": true, "enable": true },
        { "name": "vest", "notify": true, "enable": true }
      ]
    }
  }
}
```

---

#### GET `/api/v1/profiles/export/:id`

Export a profile configuration.

**Example:** `GET /api/v1/profiles/export/64m3n4o5p6q7r8s9t0u1v2w3`

---

#### POST `/api/v1/profiles/bulk-export`

Bulk export multiple profiles.

**Request Body:**
```json
{
  "profileIds": ["64m3n4o5p6q7r8s9t0u1v2w3", "64m3n4o5p6q7r8s9t0u1v2w4"]
}
```

---

#### POST `/api/v1/profiles/bulk-delete`

Bulk delete profiles.

**Request Body:**
```json
{
  "profileIds": ["64m3n4o5p6q7r8s9t0u1v2w3"]
}
```

---

#### POST `/api/v1/profiles/import`

Import a profile from file.

**Request Body (multipart/form-data):**
- `file`: Profile configuration file (JSON)

---

#### GET `/api/v1/profiles/:id`

Get a specific profile by ID.

---

#### PUT `/api/v1/profiles/:id`

Edit a profile.

---

#### DELETE `/api/v1/profiles/:id`

Delete a profile.

---

### 15. Alerts APIs

**Base Path:** `/api/v1/alert`
**Authentication Required:** Yes (all routes)

---

#### POST `/api/v1/alert/create`

Create a new alert configuration.

**Query Parameters:**
| Parameter      | Type   | Required | Description              |
| -------------- | ------ | -------- | ------------------------ |
| `alertBasedOn` | String | Yes      | `NVR` or `Camera`       |

**Example:** `POST /api/v1/alert/create?alertBasedOn=Camera`

**Request Body:**
```json
{
  "detectionTypes": ["countPersons", "motionDetection"],
  "emails": ["security@company.com", "admin@company.com"],
  "phoneNumbers": ["+1234567890"],
  "selectedCameras": ["64b2c3d4e5f6a7b8c9d0e1f2", "64b2c3d4e5f6a7b8c9d0e1f3"]
}
```

**For NVR-based alert:**
```json
{
  "detectionTypes": ["countPersons"],
  "emails": ["security@company.com"],
  "selectedNVRs": ["64a1b2c3d4e5f6a7b8c9d0e1"]
}
```

---

#### POST `/api/v1/alert/update`

Update an existing alert.

**Query Parameters:**
| Parameter      | Type   | Required | Description              |
| -------------- | ------ | -------- | ------------------------ |
| `alertId`      | String | Yes      | Alert ID to update       |
| `alertBasedOn` | String | Yes      | `NVR` or `Camera`       |

---

#### GET `/api/v1/alert/fetch`

Fetch all alerts.

**Query Parameters:**
| Parameter | Type   | Required | Description           |
| --------- | ------ | -------- | --------------------- |
| `skip`    | Number | No       | Pagination offset     |
| `limit`   | Number | No       | Items per page        |

---

#### DELETE `/api/v1/alert/delete`

Delete an alert.

**Query Parameters:**
| Parameter | Type   | Required | Description   |
| --------- | ------ | -------- | ------------- |
| `id`      | String | Yes      | Alert ID      |

---

### 16. Recipients APIs

**Base Path:** `/api/v1/recipients`

Recipients are email addresses or phone numbers that receive alert notifications. They must be verified via OTP before becoming active.

---

#### POST `/api/v1/recipients/create`

Create a new alert recipient.

**Authentication Required:** Yes

**Request Body:**
```json
{
  "type": "email",
  "fullName": "John Doe",
  "value": "john@company.com",
  "incidentTypes": ["countPersons", "motionDetection", "fireSmokeDetection"]
}
```

**For phone recipient:**
```json
{
  "type": "phone",
  "fullName": "John Doe",
  "value": "+1234567890",
  "incidentTypes": ["fireSmokeDetection", "weaponDetection"]
}
```

**Success Response (201):**
```json
{
  "success": true,
  "message": "Verification OTP sent to john@company.com",
  "data": {
    "_id": "64k1l2m3n4o5p6q7r8s9t0u1",
    "type": "email",
    "fullName": "John Doe",
    "value": "john@company.com",
    "verified": false
  }
}
```

---

#### POST `/api/v1/recipients/verify`

Verify a recipient with OTP.

**Authentication Required:** No

**Request Body:**
```json
{
  "recipientId": "64k1l2m3n4o5p6q7r8s9t0u1",
  "otp": "123456"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Recipient verified successfully",
  "data": {
    "_id": "64k1l2m3n4o5p6q7r8s9t0u1",
    "verified": true
  }
}
```

---

#### POST `/api/v1/recipients/resendMailOrSMS`

Resend verification OTP.

**Authentication Required:** Yes

**Request Body:**
```json
{
  "recipientId": "64k1l2m3n4o5p6q7r8s9t0u1"
}
```

---

#### GET `/api/v1/recipients/fetch`

Fetch all recipients.

**Authentication Required:** Yes

**Success Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "_id": "64k1l2m3n4o5p6q7r8s9t0u1",
      "type": "email",
      "fullName": "John Doe",
      "value": "john@company.com",
      "verified": true,
      "incidentTypes": ["countPersons", "motionDetection"]
    },
    {
      "_id": "64k1l2m3n4o5p6q7r8s9t0u2",
      "type": "phone",
      "fullName": "Jane Smith",
      "value": "+1234567890",
      "verified": true,
      "incidentTypes": ["fireSmokeDetection"]
    }
  ]
}
```

---

#### PUT `/api/v1/recipients/update`

Update a recipient.

**Authentication Required:** Yes

**Query Parameters:**
| Parameter     | Type   | Required | Description    |
| ------------- | ------ | -------- | -------------- |
| `recipientId` | String | Yes      | Recipient ID   |

---

#### DELETE `/api/v1/recipients/delete`

Delete a recipient.

**Authentication Required:** Yes

**Query Parameters:**
| Parameter     | Type   | Required | Description    |
| ------------- | ------ | -------- | -------------- |
| `recipientId` | String | Yes      | Recipient ID   |

---

### 17. Attendance APIs

**Base Path:** `/api/v1/attendance`
**Authentication Required:** Yes (all routes)

---

#### GET `/api/v1/attendance/get`

Get attendance records.

**Query Parameters:**
| Parameter   | Type   | Required | Description                  |
| ----------- | ------ | -------- | ---------------------------- |
| `startDate` | String | No       | Filter start date            |
| `endDate`   | String | No       | Filter end date              |
| `employeeId`| String | No       | Filter by employee ID        |
| `skip`      | Number | No       | Pagination offset            |
| `limit`     | Number | No       | Items per page               |

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "attendance": [
      {
        "_id": "64o5p6q7r8s9t0u1v2w3x4y5",
        "employee": {
          "_id": "64g7h8i9j0k1l2m3n4o5p6q7",
          "firstName": "John",
          "lastName": "Doe"
        },
        "events": [
          {
            "cameraType": "checkin",
            "timestamp": "2025-06-15T08:30:00.000Z",
            "nvr": { "_id": "64a1b2c3d4e5f6a7b8c9d0e1", "nvrName": "Office NVR" },
            "channel": { "_id": "64b2c3d4e5f6a7b8c9d0e1f2", "name": "Entrance Cam" },
            "images": {
              "face": "uploads/attendance/face_001.jpg",
              "person": "uploads/attendance/person_001.jpg",
              "frame": "uploads/attendance/frame_001.jpg"
            },
            "confidenceScore": 0.95
          },
          {
            "cameraType": "checkout",
            "timestamp": "2025-06-15T17:45:00.000Z",
            "confidenceScore": 0.92
          }
        ]
      }
    ],
    "total": 30
  }
}
```

---

#### GET `/api/v1/attendance/export`

Export attendance records (CSV/Excel).

**Query Parameters:**
| Parameter   | Type   | Required | Description       |
| ----------- | ------ | -------- | ----------------- |
| `startDate` | String | No       | Filter start date |
| `endDate`   | String | No       | Filter end date   |

---

#### POST `/api/v1/attendance/`

Log an attendance event (used by detection system).

**Request Body:**
```json
{
  "employeeId": "64g7h8i9j0k1l2m3n4o5p6q7",
  "cameraType": "checkin",
  "nvrId": "64a1b2c3d4e5f6a7b8c9d0e1",
  "channelId": "64b2c3d4e5f6a7b8c9d0e1f2",
  "images": {
    "face": "uploads/attendance/face_001.jpg",
    "person": "uploads/attendance/person_001.jpg",
    "frame": "uploads/attendance/frame_001.jpg"
  },
  "confidenceScore": 0.95
}
```

---

### 18. Access Logs APIs

**Base Path:** `/api/v1/accessLogs`
**Authentication Required:** Mixed

---

#### POST `/api/v1/accessLogs/createAccessLog`

Create an access log entry (used by detection system).

**Authentication Required:** No (service-to-service)

**Request Body:**
```json
{
  "userId": "64g7h8i9j0k1l2m3n4o5p6q7",
  "nvrId": "64a1b2c3d4e5f6a7b8c9d0e1",
  "channelId": "64b2c3d4e5f6a7b8c9d0e1f2",
  "personName": "John Doe",
  "images": {
    "faceImage": "uploads/access/face_001.jpg",
    "personImage": "uploads/access/person_001.jpg",
    "frameImage": "uploads/access/frame_001.jpg"
  }
}
```

---

#### POST `/api/v1/accessLogs/getAccessLogs`

Get access logs with filters.

**Authentication Required:** Yes

**Request Body:**
```json
{
  "startDate": "2025-06-01",
  "endDate": "2025-06-30",
  "userId": "64g7h8i9j0k1l2m3n4o5p6q7",
  "skip": 0,
  "limit": 20
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "logs": [
      {
        "_id": "64p6q7r8s9t0u1v2w3x4y5z6",
        "date": "2025-06-15T00:00:00.000Z",
        "userId": {
          "firstName": "John",
          "lastName": "Doe"
        },
        "sessions": [
          {
            "personName": "John Doe",
            "timestamp": "2025-06-15T08:30:00.000Z",
            "nvr": { "nvrName": "Office NVR" },
            "channel": { "name": "Main Entrance" },
            "images": {
              "faceImage": "uploads/access/face_001.jpg"
            }
          }
        ]
      }
    ],
    "total": 100
  }
}
```

---

#### POST `/api/v1/accessLogs/create`

Create an access log record.

**Authentication Required:** Yes

---

#### POST `/api/v1/accessLogs/get`

Get logs.

**Authentication Required:** Yes

---

### 19. Shifts APIs

**Base Path:** `/api/v1/shifts`
**Authentication Required:** Yes (all routes)

---

#### GET `/api/v1/shifts/`

Get all shifts with pagination.

**Success Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "_id": "64i9j0k1l2m3n4o5p6q7r8s9",
      "name": "Morning Shift",
      "color": "#4CAF50",
      "timings": {
        "monday": { "start": "08:00", "end": "16:00", "enabled": true },
        "tuesday": { "start": "08:00", "end": "16:00", "enabled": true },
        "wednesday": { "start": "08:00", "end": "16:00", "enabled": true },
        "thursday": { "start": "08:00", "end": "16:00", "enabled": true },
        "friday": { "start": "08:00", "end": "16:00", "enabled": true },
        "saturday": { "start": "08:00", "end": "12:00", "enabled": false },
        "sunday": { "start": "", "end": "", "enabled": false }
      },
      "settings": {
        "lateLogin": 15,
        "earlyLogout": 10,
        "halfDay": "04:00",
        "overTime": "09:00",
        "halfDayProductiveTime": "03:30",
        "fullDayProductiveTime": "07:00"
      },
      "note": "Standard morning shift for office employees",
      "isActive": true
    }
  ]
}
```

---

#### POST `/api/v1/shifts/`

Create a new shift.

**Request Body:**
```json
{
  "name": "Night Shift",
  "color": "#F44336",
  "timings": {
    "monday": { "start": "22:00", "end": "06:00", "enabled": true },
    "tuesday": { "start": "22:00", "end": "06:00", "enabled": true },
    "wednesday": { "start": "22:00", "end": "06:00", "enabled": true },
    "thursday": { "start": "22:00", "end": "06:00", "enabled": true },
    "friday": { "start": "22:00", "end": "06:00", "enabled": true },
    "saturday": { "start": "", "end": "", "enabled": false },
    "sunday": { "start": "", "end": "", "enabled": false }
  },
  "settings": {
    "lateLogin": 10,
    "earlyLogout": 10,
    "halfDay": "04:00",
    "overTime": "09:00",
    "halfDayProductiveTime": "03:30",
    "fullDayProductiveTime": "07:00"
  },
  "note": "Night security shift"
}
```

---

#### GET `/api/v1/shifts/list`

Get a simplified shift list (name, color, active status).

---

#### GET `/api/v1/shifts/:id`

Get a specific shift by ID.

---

#### PUT `/api/v1/shifts/:id`

Update a shift.

---

#### DELETE `/api/v1/shifts/:id`

Delete a shift.

---

### 20. Storage APIs

**Base Path:** `/api/v1/storage`
**Authentication Required:** Yes (all routes)

Manages cloud storage configurations for evidence files (S3, Google Drive, SFTP).

---

#### GET `/api/v1/storage/`

Get all storage configurations.

**Success Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "_id": "64n4o5p6q7r8s9t0u1v2w3x4",
      "name": "AWS S3 Primary",
      "type": "s3",
      "active": true,
      "isValid": true,
      "note": "Primary storage for incident evidence"
    },
    {
      "_id": "64n4o5p6q7r8s9t0u1v2w3x5",
      "name": "Google Drive Backup",
      "type": "google_drive_oauth",
      "active": false,
      "isValid": true,
      "note": "Backup storage"
    }
  ]
}
```

---

#### POST `/api/v1/storage/`

Add a new storage configuration.

**For S3:**
```json
{
  "name": "AWS S3 Bucket",
  "type": "s3",
  "credentials": {
    "accessKeyId": "AKIAEXAMPLE",
    "secretAccessKey": "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    "bucket": "cctv-evidence-bucket",
    "region": "us-east-1"
  },
  "note": "Primary evidence storage"
}
```

**For SFTP:**
```json
{
  "name": "SFTP Server",
  "type": "sftp",
  "credentials": {
    "host": "192.168.1.200",
    "port": 22,
    "username": "cctv_user",
    "password": "secure_password",
    "path": "/data/cctv-evidence"
  }
}
```

**For Google Drive (Service Account):**
```json
{
  "name": "Google Drive",
  "type": "google_drive_service_account",
  "credentials": {
    "serviceAccountKey": { ... },
    "folderId": "1abc2def3ghi4jkl5mno"
  }
}
```

---

#### POST `/api/v1/storage/upload`

Upload a file to the active storage.

**Request Body (multipart/form-data):**
- `file`: File to upload
- `path`: Destination path/folder

---

#### PUT `/api/v1/storage/activate`

Activate a storage configuration (deactivates others).

**Request Body:**
```json
{
  "storageId": "64n4o5p6q7r8s9t0u1v2w3x4"
}
```

---

#### GET `/api/v1/storage/get/:path`

Stream a file from storage.

**Example:** `GET /api/v1/storage/get/incidents/2025/06/15/incident_001.mp4`

---

#### GET `/api/v1/storage/stream/:id`

Stream a file by storage record ID.

---

#### GET `/api/v1/storage/auth/google/callback`

Google OAuth callback for Google Drive authentication.

---

#### PUT `/api/v1/storage/:id`

Update a storage configuration.

---

#### DELETE `/api/v1/storage/:id`

Delete a storage configuration.

---

### 21. Uploads APIs

**Base Path:** `/api/v1/uploads`

---

#### POST `/api/v1/uploads/media`

Upload a media file.

**Request Body (multipart/form-data):**
- `file`: Media file (image/video)

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "path": "uploads/media/2025/06/15/file_001.jpg",
    "url": "/api/v1/uploads/uploads/media/2025/06/15/file_001.jpg"
  }
}
```

---

#### GET `/api/v1/uploads/:mediaPath`

Fetch a media file by path.

**Example:** `GET /api/v1/uploads/uploads/media/2025/06/15/file_001.jpg`

---

#### DELETE `/api/v1/uploads/deleteMedia`

Delete a media file.

**Request Body:**
```json
{
  "path": "uploads/media/2025/06/15/file_001.jpg"
}
```

---

#### DELETE `/api/v1/uploads/deleteUserMedia`

Delete a user's media files.

---

### 22. Authorized Channels APIs

**Base Path:** `/api/v1/authorizedChannels`
**Authentication Required:** Yes (all routes)

Controls which channels/cameras a specific user can access.

---

#### POST `/api/v1/authorizedChannels/fetchChannels`

Fetch authorized channels for a user.

**Request Body:**
```json
{
  "userId": "64e5f6a7b8c9d0e1f2a3b4c5"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "channels": [
      {
        "_id": "64b2c3d4e5f6a7b8c9d0e1f2",
        "name": "Main Entrance Camera",
        "nvrId": {
          "nvrName": "Office NVR 1",
          "location": "New York"
        }
      }
    ]
  }
}
```

---

#### POST `/api/v1/authorizedChannels/locations`

Fetch authorized locations for a user.

**Request Body:**
```json
{
  "userId": "64e5f6a7b8c9d0e1f2a3b4c5"
}
```

---

#### POST `/api/v1/authorizedChannels/departments`

Fetch authorized departments for a user.

---

#### POST `/api/v1/authorizedChannels/getNVRS`

Fetch authorized NVRs for a user.

---

#### POST `/api/v1/authorizedChannels/getChannels`

Fetch channels filtered by NVRs or departments.

**Request Body:**
```json
{
  "nvrIds": ["64a1b2c3d4e5f6a7b8c9d0e1"],
  "departmentIds": ["64h8i9j0k1l2m3n4o5p6q7r8"]
}
```

---

### 23. Authorized Objects APIs

**Base Path:** `/api/v1/authorizedObjects`
**Authentication Required:** Yes (all routes)

---

#### POST `/api/v1/authorizedObjects/create`

Create an authorized object type.

**Request Body:**
```json
{
  "objectType": "vehicle",
  "objectNames": ["sedan", "SUV", "truck", "motorcycle", "bus"]
}
```

---

#### POST `/api/v1/authorizedObjects/fetch`

Fetch authorized objects.

---

#### GET `/api/v1/authorizedObjects/getAllObjectTypes`

Get all available object types.

---

#### PUT `/api/v1/authorizedObjects/update`

Update authorized objects.

**Request Body:**
```json
{
  "objectType": "vehicle",
  "objectNames": ["sedan", "SUV", "truck", "motorcycle", "bus", "van"]
}
```

---

#### DELETE `/api/v1/authorizedObjects/delete`

Delete authorized objects.

---

### 24. Auto Email Report APIs

**Base Path:** `/api/v1/auto-email-report`
**Authentication Required:** Yes (all routes)

---

#### POST `/api/v1/auto-email-report/createAutoEmailReport`

Create an automated email report schedule.

**Request Body:**
```json
{
  "reportsTitle": "Weekly Security Summary",
  "frequency": [
    {
      "Weekly": 1,
      "Time": "08:00",
      "Date": {
        "startDate": "2025-06-01",
        "endDate": "2025-12-31"
      }
    }
  ],
  "Recipients": ["security@company.com", "manager@company.com"],
  "Content": [
    {
      "consolidatedReport": 1,
      "task": 0,
      "clients": 0,
      "leaves": 0,
      "tags": 0,
      "role": 0
    }
  ],
  "ReportsType": [{ "pdf": 1, "csv": 0 }],
  "filter": {
    "wholeOrganization": 1,
    "specificEmployees": []
  },
  "sendTestMail": false
}
```

---

#### POST `/api/v1/auto-email-report/get`

Fetch report details.

**Request Body:**
```json
{
  "reportId": "64q7r8s9t0u1v2w3x4y5z6a7"
}
```

---

#### POST `/api/v1/auto-email-report/Update`

Update a report configuration.

---

#### POST `/api/v1/auto-email-report/delete`

Delete a report.

**Request Body:**
```json
{
  "reportId": "64q7r8s9t0u1v2w3x4y5z6a7"
}
```

---

### 25. Entry APIs

**Base Path:** `/api/v1/entry`
**Authentication Required:** Yes (all routes)

Tracks entry/exit events at physical entry points.

---

#### POST `/api/v1/entry/register`

Register a new entry point.

**Request Body:**
```json
{
  "name": "Main Gate",
  "location": "Building A - Ground Floor",
  "channelId": "64b2c3d4e5f6a7b8c9d0e1f2"
}
```

---

#### POST `/api/v1/entry/log`

Log an entry/exit event.

**Request Body:**
```json
{
  "userId": "64g7h8i9j0k1l2m3n4o5p6q7",
  "nvrId": "64a1b2c3d4e5f6a7b8c9d0e1",
  "channelId": "64b2c3d4e5f6a7b8c9d0e1f2",
  "images": {
    "face": "uploads/entry/face_001.jpg",
    "person": "uploads/entry/person_001.jpg",
    "frame": "uploads/entry/frame_001.jpg"
  }
}
```

---

#### GET `/api/v1/entry/get`

Get entry logs.

**Query Parameters:**
| Parameter   | Type   | Description       |
| ----------- | ------ | ----------------- |
| `startDate` | String | Filter start date |
| `endDate`   | String | Filter end date   |
| `skip`      | Number | Pagination offset |
| `limit`     | Number | Items per page    |

---

#### GET `/api/v1/entry/users`

Get entry users (people who have been logged).

---

#### GET `/api/v1/entry/user/:userId`

Get entry logs for a specific user.

**Example:** `GET /api/v1/entry/user/64g7h8i9j0k1l2m3n4o5p6q7`

---

### 26. Vehicle APIs

**Base Path:** `/api/v1/vehicle`
**Authentication Required:** Yes (all routes)

---

#### POST `/api/v1/vehicle/log`

Log a vehicle entry/exit event.

**Request Body:**
```json
{
  "vehicleNumber": "ABC-1234",
  "nvrId": "64a1b2c3d4e5f6a7b8c9d0e1",
  "channelId": "64b2c3d4e5f6a7b8c9d0e1f2",
  "images": {
    "plate": "uploads/vehicle/plate_001.jpg",
    "frame": "uploads/vehicle/frame_001.jpg"
  }
}
```

---

#### GET `/api/v1/vehicle/vehicles`

Get all tracked vehicles.

**Success Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "_id": "64r8s9t0u1v2w3x4y5z6a7b8",
      "vehicleNumber": "ABC-1234",
      "createdAt": "2025-06-15T08:30:00.000Z"
    }
  ]
}
```

---

#### GET `/api/v1/vehicle/vehicle/:vehicleId`

Get entry logs for a specific vehicle.

**Example:** `GET /api/v1/vehicle/vehicle/64r8s9t0u1v2w3x4y5z6a7b8`

---

### 27. Domain APIs

**Base Path:** `/api/v1/domain`

---

#### POST `/api/v1/domain/register`

Register a new domain for local NVR access.

**Request Body:**
```json
{
  "domain": "office.local.example.com",
  "deviceName": "NVR-Office-01"
}
```

---

### 28. Jobs APIs

**Base Path:** `/api/v1/jobs`

---

#### POST `/api/v1/jobs/mock`

Create mock jobs for testing purposes.

**Request Body:**
```json
{
  "count": 10,
  "type": "incident"
}
```

---

#### DELETE `/api/v1/jobs/mock`

Delete all mock jobs.

---

## Database Models

### Model Summary

| Model               | Collection           | Key Fields                                                  |
| ------------------- | -------------------- | ----------------------------------------------------------- |
| Admin               | `admins`             | user_id, login, email, name_f, name_l, orgId               |
| Users               | `users`              | adminId, email, firstName, lastName, roleIds, active        |
| AuthorizedUsers     | `authorizedusers`    | adminId, email, firstName, lastName, profilePics, shiftId   |
| NVR                 | `nvrs`               | userId, nvrName, ip, port, brand, location                  |
| Channel             | `channels`           | nvrId, userId, name, streamEndpoint, detectionStatus        |
| Incidents           | `incidents`          | channelId, nvrId, type, severity, timeOfIncident            |
| DetectionSettings   | `detectionsettings`  | userId, name, settingType, enabled, alerts                  |
| DetectionObjects    | `detectionobjects`   | settingType, objects                                        |
| Profiles            | `profiles`           | basics, notification, evidenceSeverity, status              |
| Alerts              | `alerts`             | adminId, detectionTypes, alertBasedOn, emails               |
| Recipients          | `recipients`         | adminId, type, value, verified, incidentTypes               |
| Roles               | `roles`              | adminId, roleName, view, create, edit, delete               |
| Permissions         | `permissions`        | adminId, permissionName, permissionConfig                   |
| Departments         | `departments`        | adminId, departmentName, isActive                           |
| Shifts              | `shifts`             | adminId, name, color, timings, settings                     |
| Attendance          | `attendances`        | user, employee, events                                      |
| AccessLogs          | `accesslogs`         | admin, userId, date, sessions                               |
| AuthorizedChannels  | `authorizedchannels` | adminId, userId, locations, channels                        |
| AuthorizedObjects   | `authorizedobjects`  | admin, objectType, objectNames                              |
| AutoEmailReport     | `autoemailreports`   | reportsTitle, frequency, Recipients                         |
| Storage             | `storages`           | userId, name, type, credentials, active                     |
| Entry               | `entries`            | adminId, userId, events                                     |
| Vehicle             | `vehicles`           | vehicleNumber                                               |

### Incident Types (Discriminator Pattern)

The Incidents collection uses Mongoose discriminators for different detection types:

| Type                       | Extra Fields                                |
| -------------------------- | ------------------------------------------- |
| `countPersons`             | count, triggerNotification, timeSeries      |
| `countVehicles`            | count, triggerNotification, timeSeries      |
| `motionDetection`          | (base fields only)                          |
| `genericObjectDetection`   | objectsDetected, triggerNotification, timeSeries |

### Supported Detection Types

| Detection Type                        | Setting Key                          |
| ------------------------------------- | ------------------------------------ |
| Person Counting                       | `countPersonsSettings`               |
| Vehicle Counting                      | `countVehiclesSettings`              |
| Motion Detection                      | `motionDetectionSettings`            |
| Generic Object Detection              | `genericObjectDetectionSettings`     |
| Loitering (Unauthorized)              | `loiteringWithoutAuthSettings`       |
| Loitering (Authorized)                | `loiteringWithAuthSettings`          |
| Unauthorized Access                   | `unauthorizedAccessSettings`         |
| Line Crossing                         | `lineCrossingSettings`               |
| Fire & Smoke Detection                | `fireSmokeDetectionSettings`         |
| Weapon Detection                      | `weaponDetectionSettings`            |
| Unattended Baggage                    | `unattendedBaggageDetectionSettings` |
| Personal Protective Equipment (PPE)   | `personalProtectiveEquipmentSettings`|
| Crowd Detection                       | `crowdDetectionSettings`             |
| Door Detection                        | `doorDetectionSettings`              |
| Light Detection                       | `lightDetectionSettings`             |
| Vehicle Detection                     | `vehicleDetectionSettings`           |
| Desk Absence                          | `deskAbsenceSettings`                |
| Guard Absence                         | `guardAbsenceSettings`               |

---

## External Integrations

| Integration       | Purpose                                     | Configuration Key    |
| ----------------- | ------------------------------------------- | -------------------- |
| **aMember**       | User authentication & subscription management | `aMember`           |
| **EMP Monitor**   | Employee data import & organization sync     | EMP Auth API         |
| **SendGrid**      | Email notifications & OTP delivery           | `sendgrid`           |
| **Twilio**        | SMS/WhatsApp notifications                   | `Twilio`             |
| **Google Drive**  | Cloud storage for evidence                   | Storage credentials  |
| **AWS S3**        | Cloud storage for evidence                   | Storage credentials  |
| **SFTP**          | Remote file storage for evidence             | `SFTP` / Storage     |
| **Python ML**     | Face recognition, object detection, counting | `Backend.token`      |
| **Telegram**      | Notification delivery                        | Telegram service     |

---

## Real-Time Features

The application uses **Socket.IO** for real-time communication:

- **Live Incident Alerts** - Instant notifications when detections occur
- **Detection Status Updates** - Real-time camera detection status changes
- **Subscription Validation** - Socket connections validated against active plans via `checkActivePlanSocket`

### Socket.IO Connection

```javascript
const socket = io("http://localhost:5000", {
  auth: {
    token: "your-jwt-token"
  }
});

socket.on("incident", (data) => {
  console.log("New incident:", data);
});

socket.on("detection-status", (data) => {
  console.log("Detection status changed:", data);
});
```

---

## API Statistics

| Category                | Count |
| ----------------------- | ----- |
| Total API Endpoints     | 100+  |
| Route Modules           | 28    |
| Database Models         | 24    |
| Middleware Components    | 7     |
| Detection Types         | 18    |
| External Integrations   | 8     |
| Storage Providers       | 4     |

---

## NVR Brand Support

| Brand      | Enum Value   |
| ---------- | ------------ |
| Hikvision  | `hikvision`  |
| Dahua      | `dahua`      |
| Prama      | `prama`      |
| CP Plus    | `cpplus`     |
| IP Camera  | `camera`     |

---

## Default Roles & Permissions

The system creates three default permission levels on first admin login:

| Role    | View | Create | Edit | Delete | Description                  |
| ------- | ---- | ------ | ---- | ------ | ---------------------------- |
| Admin   | Yes  | Yes    | Yes  | Yes    | Full access to all modules   |
| Write   | Yes  | Yes    | Yes  | No     | Can view, create, and edit   |
| Read    | Yes  | No     | No   | No     | View-only access             |

### Permission Modules

Permissions are configured per module:

- `channels` - Camera/Channel management
- `playbacks` - Playback functionality
- `incidents` - Incident management
- `NVR` - NVR management
- `dashboard` - Dashboard access
- `Users` - User management
- `roles` - Role management
- `permission` - Permission management
- `departments` - Department management
- `detectionSettings` - Detection configuration
- `profiles` - Profile management
- `recipients` - Recipient management
- `logs` - Attendance & Access logs
- `shifts` - Shift management

---

*Last Updated: March 2026*
*Total Endpoints: 100+ | Models: 24 | Detection Types: 18*
