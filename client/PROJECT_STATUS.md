# VideoralQ - Frontend

A comprehensive React-based web application for managing video surveillance, incident detection, employee monitoring, and system administration with real-time alerts and notifications.

## Tech Stack

- **Framework:** React 19 + React Router v7
- **Build Tool:** Vite 6
- **Styling:** Tailwind CSS 4 + shadcn/ui (Radix UI)
- **Charts:** ApexCharts, amCharts 5
- **Forms:** Formik + Yup
- **HTTP:** Axios
- **Real-Time:** Socket.io
- **Video:** HLS.js, React Webcam
- **Export:** jsPDF, XLSX
- **Animations:** Framer Motion
- **Icons:** Lucide React, React Icons

## Features

- **Dashboard** - Real-time stats, live camera feeds, alert gauges, activity charts
- **Camera & Stream Management** - NVR configuration, HLS streaming, camera health monitoring
- **AI Detection** - Fire, theft, people, emotion, traffic, and phone usage detection with zone marking
- **Incident Management** - Logging, tracking, resolution workflows, video playback linked to incidents
- **Employee Monitoring** - Attendance, access, productivity, desk visibility, guard duty, and tracking logs
- **User & Access Management** - Multi-level auth, RBAC, OTP verification, password reset
- **Notifications** - Recipient management, alert routing, real-time socket notifications
- **Data Export** - PDF and Excel report generation

## Project Structure

```
src/
├── assets/          # Images, SVGs, icons, audio files
├── components/      # Reusable UI components
│   ├── Auth/        # Authentication components
│   ├── ui/          # shadcn/ui components
│   └── Schedule/    # Time/schedule pickers
├── context/         # React Context providers (Auth, Permissions, Sockets, User)
├── data/            # Static/configuration data
├── helpers/         # Utility functions
├── hooks/           # Custom React hooks
├── layout/          # Header, Sidebar, and layout components
├── lib/             # Utility functions (clsx, etc.)
├── page/            # Page/route components
│   ├── admin/       # Admin login
│   └── user/        # Main user pages
│       ├── Dashboard/
│       ├── Streams/
│       ├── Playback/
│       ├── Incidents/
│       ├── Detection/
│       ├── EmployeeLogs/
│       ├── Settings/
│       ├── Profile/
│       ├── RolePermissions/
│       ├── UserDetails/
│       ├── NotificationRecipients/
│       └── NVR/
├── routes/          # Route definitions
├── schema/          # Validation schemas
├── styles/          # Global CSS
└── utils/           # Utility functions
```

## Getting Started

### Prerequisites

- Node.js (v18+)
- npm

### Environment Variables

Create a `.env` file based on `.env.example`:

```env
VITE_ENV=dev
VITE_LOCAL_SETUP=false
VITE_FRONTEND=https://your-frontend-url.com
VITE_BACKEND=https://your-backend-api.com
VITE_DS_API=https://your-ds-api.com
VITE_STREAM_URL=https://your-stream-url.com
VITE_INCIDENT_URL=https://your-backend-api.com/api/uploads/
VITE_ENCRYPTION_KEY=your_encryption_key_here
VITE_IV=your_iv_here
VITE_SOCKET_URL=ws://localhost:3000
VITE_APP_CURRENT_EXE_VERSION=1.0.0
VITE_INITIALS_URL=https://api.dicebear.com/9.x/initials/svg?seed=
VITE_HIDE_PLAYBACK_FEATURE=false
```

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

### Production Build

```bash
npm run build
npm run preview   # Preview the build locally
```

### Code Quality

```bash
npm run lint      # Run ESLint
npm run format    # Format with Prettier
```

## Architecture

- **Context-Based State Management** - React Context for auth, permissions, sockets, and dashboard filters
- **Component-Based UI** - Reusable components with shadcn/ui and Radix UI primitives
- **Route-Based Organization** - Features grouped by routes with co-located API calls
- **Real-Time Updates** - Socket.io for live notifications and event streaming
- **Responsive Design** - Tailwind CSS with mobile-first approach
- **Code Quality** - ESLint, Prettier, and Husky git hooks
