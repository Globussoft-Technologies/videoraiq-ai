import { LOGS_GROUP_LABEL, LOGS_TOUR_KEY } from '@/lib/navVisibility';

/**
 * Step registry for the guided tour.
 *
 * Adding a tour for a new module is a data change here plus `data-tour`
 * attributes on the page — no engine changes. Three things do the scaling:
 *
 *  1. Every module gets a nav-anchored opening step for free (`navIntro`),
 *     because Sidebar.jsx tags every item as `nav-<key>`. A module with no
 *     entry below still gets a usable one-step tour rather than nothing.
 *  2. Log pages share one step set (`LOG_PAGE_STEPS`) because they share one
 *     component — ReusableTablePage. Eighteen-odd modules, one definition.
 *  3. Steps whose target isn't in the DOM are dropped before the module runs
 *     (see resolveSteps), so an optional widget — stat cards, a grid toggle,
 *     the header's network card — costs nothing when it isn't rendered.
 *
 * `target` is always a `[data-tour="..."]` selector. Never a class or a DOM
 * shape: those change with styling and would break silently.
 */

const SHELL_KEY = '__shell';

/**
 * Opening step for a module, anchored on its sidebar entry.
 *
 * `placement: 'right'` because the sidebar is on the left; on mobile the
 * sidebar is a drawer, which the engine opens first (see `sidebar: true`).
 */
function navIntro(item, content) {
  return {
    target: `[data-tour="nav-${item.key}"]`,
    title: item.label,
    content,
    placement: 'right',
    sidebar: true,
  };
}

/**
 * The shared log-page walkthrough. Anchored on ReusableTablePage, which every
 * log module renders, so these steps work on Attendance, Access, ANPR, the
 * Stevinrock incident logs and everything else built on it.
 */
const LOG_PAGE_STEPS = [
  {
    target: '[data-tour="log-stats"]',
    title: 'At-a-glance totals',
    content:
      'Summary cards for the current filter. They recount whenever you change the date range or search, so they always describe the rows below — not the whole table.',
    placement: 'bottom',
  },
  {
    target: '[data-tour="log-search"]',
    title: 'Search',
    content:
      'Filters the rows currently loaded — name, plate, camera, whatever the column set holds. Combine it with the date range to narrow a busy day quickly.',
    placement: 'bottom',
  },
  {
    target: '[data-tour="log-daterange"]',
    title: 'Date range',
    content:
      'The main filter on every log page. Changing it refetches from the server and resets you to page one, so you never end up on page nine of a range that now has two.',
    placement: 'bottom',
  },
  {
    target: '[data-tour="log-viewmode"]',
    title: 'List or grid',
    content:
      'Grid view shows the captured snapshot for each record; list view fits far more rows on screen. Pick whichever suits what you are looking for.',
    placement: 'bottom',
  },
  {
    target: '[data-tour="log-actions"]',
    title: 'Export and page actions',
    content:
      'Export the current filtered result — not the whole table — plus any actions specific to this log. What you get follows the filters you set above.',
    placement: 'bottom',
  },
  {
    target: '[data-tour="log-table"]',
    title: 'The records',
    content:
      'Each row is one detection event. Rows with a snapshot open a preview when clicked, so you can confirm what the camera actually saw.',
    placement: 'top',
  },
  {
    target: '[data-tour="log-total"]',
    title: 'Matching records',
    content:
      'How many records match right now. This is the filtered count, which is what an export will contain.',
    placement: 'top',
  },
  {
    target: '[data-tour="log-pagination"]',
    title: 'Paging',
    content:
      'Step through pages, or jump straight to one with the "Go to" box when a range runs long.',
    placement: 'top',
  },
  {
    target: '[data-tour="log-rows"]',
    title: 'Rows per page',
    content: 'Show more rows at once when you are scanning, fewer when you are reading carefully.',
    placement: 'top',
  },
];

/**
 * Orientation pass over the app shell. Runs first in the global flow and is
 * offered in the manual menu as "Getting around". Not a nav module — it has no
 * page of its own — so it carries its own label and path.
 */
const SHELL_TOUR = {
  key: SHELL_KEY,
  label: 'Getting around',
  path: '/dashboard',
  steps: [
    {
      target: '[data-tour="sidebar-logo"]',
      title: 'Welcome to VideoraIQ',
      content:
        'A quick pass through the parts of the app you will use most. It takes a couple of minutes, and you can leave at any point — the tour is always available again from the header.',
      placement: 'right',
      sidebar: true,
    },
    {
      target: '[data-tour="sidebar-nav"]',
      title: 'Your modules',
      content:
        'Everything lives here, grouped by what it does: live monitoring, the logs each detection writes, camera configuration, and administration. You only ever see the modules your role grants.',
      placement: 'right',
      sidebar: true,
    },
    {
      target: '[data-tour="hdr-title"]',
      title: 'Where you are',
      content: 'The current module, always named here with a line on what it does.',
      placement: 'bottom',
    },
    {
      target: '[data-tour="hdr-sites"]',
      title: 'Site filter',
      content:
        'Select a location from the dropdown to view and work with data for that site',
      placement: 'bottom',
    },
    {
      target: '[data-tour="hdr-network"]',
      title: 'Connection health',
      content:
        "Your server's uplink to the camera network. Worth a glance when a live view stalls — it separates a network problem from a camera problem.",
      placement: 'bottom',
    },
    {
      target: '[data-tour="hdr-notifications"]',
      title: 'Alerts',
      content:
        'New detections land here as they happen. Clicking one takes you straight to the incident or the log page that holds it.',
      placement: 'bottom',
    },
    {
      target: '[data-tour="hdr-theme"]',
      title: 'Light and dark',
      content: 'Dark theme suits a control room; light suits a desk. Your choice is remembered.',
      placement: 'bottom',
    },
    {
      target: '[data-tour="hdr-start-tour"]',
      title: 'Reopen this tour',
      content:
        'Any module can be revisited from here, any time. Nothing you learn now has to be remembered — this button brings it back.',
      placement: 'bottom',
    },
  ],
};

/**
 * Per-module content, keyed by nav.config.js `key`.
 *
 * `intro` is the nav-anchored opening step. `steps` are page-level steps, and
 * exist only for modules whose page carries `data-tour` anchors — the rest run
 * as a single well-written intro step rather than pointing at nothing. Adding a
 * deeper tour later means adding anchors to that page and a `steps` array here.
 */
const MODULE_CONTENT = {
  overview: {
    intro:
      "The Command Center is the landing page: live camera health, the detections firing right now, and the day's incident counts in one view.",
    steps: [
      {
        target: '[data-tour="cc-filters"]',
        title: 'Narrow the view',
        content:
          'Scope the whole dashboard to particular recorders, departments or camera types. Everything below re-reads from these filters, so set them once here rather than per card.',
        placement: 'bottom',
      },
      {
        target: '[data-tour="cc-kpis"]',
        title: 'Today at a glance',
        content:
          'Headline counts for the current filter — events today, incidents by severity, sites, and how much of your camera fleet is reporting. Several show a comparison against yesterday.',
        placement: 'bottom',
      },
      {
        target: '[data-tour="cc-live"]',
        title: 'Live cameras',
        content:
          'View all live cameras from here. Clicking a camera takes you to its live feed.',
        placement: 'right',
      },
      {
        target: '[data-tour="cc-feed"]',
        title: 'Latest incident and threat feed',
        content:
          'The most recent incident in full, with the running feed beneath it. This column is the one to watch during a shift.',
        placement: 'left',
      },
      {
        target: '[data-tour="cc-engines"]',
        title: 'Engine activity',
        content:
          'Which detection engines fired over the last 24 hours, and how often. An engine sitting at zero here is usually either switched off or scheduled outside the current window.',
        placement: 'top',
      },
    ],
  },

  'live-demo': {
    intro:
      'Live Demo lets you try any detection engine on your own video before it ever touches a camera. Four steps: pick a detection, upload a clip, configure it, then watch the result.',
    steps: [
      {
        target: '[data-tour="demo-steps"]',
        title: 'The four steps',
        content:
          'Detection, Upload, Configure, Review. You can move between them freely — nothing is saved to your live system, so it is safe to experiment.',
        placement: 'bottom',
      },
      {
        target: '[data-tour="demo-categories"]',
        title: 'Step 1 — browse by category',
        content:
          'Twenty-three models, grouped by what they watch for: Security, Vehicles & Traffic, Safety & PPE, Workplace & Retail, Industrial & Environment. Pick a category, or search by name.',
        placement: 'bottom',
      },
      {
        target: '[data-tour="demo-models"]',
        title: 'Step 1 — pick a detection',
        content:
          'Click a model to select it — the highlighted card is the one that will run. Start with something easy to see in your footage, like Face Recognition or Zone Intrusion.',
        placement: 'top',
      },
      {
        target: '[data-tour="demo-dropzone"]',
        title: 'Step 2 — upload your clip',
        content:
          'Drag a video in, or click to browse. MP4, MOV, AVI or MKV; 10 to 60 seconds; 30 MB maximum. Use footage from the camera angle you actually want to test — the closer to the real thing, the more the result tells you.',
        placement: 'top',
      },
      {
        target: '[data-tour="demo-config"]',
        title: 'Step 3 — configure it',
        content:
          'Set the confidence threshold, and for zone-based detections draw the area to watch directly on the video. Face Recognition asks you to register the people to look for, then matches every frame against them.',
        placement: 'top',
      },
      {
        target: '[data-tour="demo-upload"]',
        title: 'Step 4 — process and review',
        content:
          'Once your clip is uploaded, hit Process clip. VideoraIQ analyses the footage, annotates it with everything the engine finds, and brings the results back on this page as the run progresses — events detected, average confidence, and the incident log the run produced. ',
        placement: 'top',
      },
    ],
  },

  wall: {
    intro:
      'The Live Wall streams several cameras side by side, the way a control room runs. Layout and camera selection are yours to set.',
    steps: [
      {
        target: '[data-tour="wall-layout"]',
        title: 'Grid layout',
        content:
          'How many cameras to show at once. Fewer tiles means a larger picture on each; more tiles covers more of the site.',
        placement: 'bottom',
      },
      {
        target: '[data-tour="wall-search"]',
        title: 'Find a camera',
        content:
          'Search by the camera name here',
        placement: 'bottom',
      },
      {
        target: '[data-tour="wall-toolbar"]',
        title: 'Filter the wall',
        content:
          'Narrow by location, recorder or specific cameras. Your selection is remembered, so the wall comes back the way you left it.',
        placement: 'bottom',
      },
      {
        target: '[data-tour="wall-toolbar"]',
        spotlightTarget: '[data-tour="wall-grid"]',
        title: 'The wall',
        content:
          'Each tile is a live stream, and any tile can go fullscreen. A tile that will not load usually means the camera is offline — Cameras & NVRs will say which.',
        placement: 'bottom',
      },
    ],
  },

  camera: {
    intro:
      'Playback is for going back in time: pick a camera and a moment, then scrub through what was recorded. Detection markers on the timeline take you straight to the parts worth watching.',
  },

  alerts: {
    intro:
      'Alerts is the running feed of detections that carry a snapshot — the fastest way to see what has just happened across the site.',
    steps: [
      {
        target: '[data-tour="alerts-filters"]',
        title: 'Narrow the feed',
        content:
          'Filter by severity and by status.',
        placement: 'bottom',
      },
      {
        target: '[data-tour="alerts-list"]',
        title: 'Feed and detail',
        content:
          'See the alert list on the left and the selected alert details on the right, including the captured camera frame. Click an alert to view its details without leaving the page.',
        placement: 'top',
      },
    ],
  },

  incidents: {
    intro:
      'The Incident Center is the investigation view: detections grouped into incidents, with severity, evidence and history in one place.',
    steps: [
      {
        target: '[data-tour="incidents-kpis"]',
        title: 'Incident counts',
        content:
          'Totals by severity for the current filter — the quickest read on whether today is unusual.',
        placement: 'bottom',
      },
      {
        target: '[data-tour="incidents-cards"]',
        title: 'The incidents',
        content:
          'Each card is one incident, with its snapshot. Open one for the full record and the footage around it.',
        placement: 'top',
      },
    ],
  },

  analytics: {
    intro:
      'Analytics is the trend view — how detections move over days and weeks, rather than what happened in the last hour.',
    steps: [
      {
        target: '[data-tour="analytics-toolbar"]',
        title: 'Set the window',
        content:
          'Choose the period and the timezone the figures are reported in. Timezone matters here: a shift that spans midnight lands in different days depending on it.',
        placement: 'bottom',
      },
      {
        target: '[data-tour="analytics-kpis"]',
        title: 'Period totals',
        content:
          'Headline numbers for the window you picked, so the charts below have something to be measured against.',
        placement: 'bottom',
      },
      {
        target: '[data-tour="analytics-charts"]',
        title: 'Detection trends',
        content:
          'Volume over time, and the share each engine contributes. This is where a gradual change shows up that a live feed never would.',
        placement: 'top',
      },
    ],
  },

  [LOGS_TOUR_KEY]: {
    intro:
      'Logs & Records keeps the evidence trail for your detections in one place. Open this section when you need to review events, filter records, or export what happened.',
  },

  cameras: {
    intro:
      'Cameras & NVRs is where you add and manage your cameras and recorders. You can see their channels and check if they are online. All other modules use this list.',
    steps: [
      {
        target: '[data-tour="nvr-add"]',
        title: 'Add NVR',
        content:
          'Use Add NVR to connect a recorder, enter its network details, discover cameras, and add the camera channels you want to monitor.',
        placement: 'bottom',
      },
      {
        target: '[data-tour="nvr-edit"]',
        title: 'Edit NVR',
        content:
          'Edit updates the recorder details when its name, site, credentials, IP address, or ports change.',
        placement: 'left',
      },
      {
        target: '[data-tour="nvr-delete"]',
        title: 'Delete NVR',
        content:
          'Delete removes the recorder and asks you to confirm before deleting its linked cameras and records.',
        placement: 'left',
      },
    ],
  },

  'detection-settings': {
    intro:
      'Detections is where you manage AI features like intrusion, person counting, and ANPR. Enable a detection for a camera to start recording its results. Features not included in your licence will not be shown here.',
  },

  users: {
    intro:
      'User Role Detail lists everyone with access, the role each one holds, and the cameras and locations they are limited to.',
    steps: [
      {
        target: '[data-tour="users-add"]',
        title: 'Add new user',
        content:
          'Create a new user and assign their role.',
        placement: 'bottom',
      },
      {
        target: '[data-tour="users-edit"]',
        title: 'Edit user',
        content:
          'Update this user details and access.',
        placement: 'left',
      },
      {
        target: '[data-tour="users-delete"]',
        title: 'Delete user',
        content:
          'Remove this user from the system.',
        placement: 'left',
      },
    ],
  },

  register: {
    intro:
      'Register your User is how a person becomes known to the system. You enter their staff details, capture a few face photos, and from then on the detections can recognise them by name instead of logging them as an unknown person.',
    steps: [
      {
        target: '[data-tour="reg-form"]',
        title: 'Step 1 — staff details',
        content:
          'Name, email, designation, location and department. Location and department are what later let you report on attendance and access per site or per team, so they are worth filling in properly rather than leaving blank.',
        placement: 'bottom',
      },
      {
        target: '[data-tour="reg-next"]',
        title: 'Step 2 — face enrollment',
        content:
          'Next moves you to the face-enrollment step: capture the angles the form asks for — usually front, left and right — with the webcam, or upload photos. The card counts them off as you go. These images are what Face Recognition matches every frame against, so a clear, well-lit face is the difference between a name and an "unknown person" in your logs.',
        placement: 'top',
      },
      {
        target: '[data-tour="reg-actions"]',
        title: 'Adding people in bulk',
        content:
          'One at a time is not the only way. Register Bulk Employee takes a spreadsheet, Import Emp Users pulls people in from EMP, and Generate Registration Link sends a link so staff can enroll their own face from their phone.',
        placement: 'bottom',
      },
      {
        target: '[data-tour="reg-import"]',
        title: 'Import users',
        content: 'Import users from EMP.',
        placement: 'bottom',
      },
      {
        target: '[data-tour="reg-verify"]',
        title: 'Verify user',
        content: 'Verify a registered user.',
        placement: 'bottom',
      },
      {
        target: '[data-tour="reg-bulk"]',
        title: 'Bulk register',
        content: 'Register many employees from a file.',
        placement: 'bottom',
      },
      {
        target: '[data-tour="reg-link"]',
        title: 'Registration link',
        content: 'Generate a link for self registration.',
        placement: 'bottom',
      },
      {
        target: '[data-tour="reg-search"]',
        title: 'Who is enrolled',
        content:
          'Everyone registered, filterable by status, location and department. The Verified / Not Verified badge is the one to watch — a person without usable face images will not be recognised by the detections until that is fixed.',
        placement: 'bottom',
      },
      {
        target: '[data-tour="reg-directory"]',
        title: 'Managing a person',
        content:
          'Each card opens their full profile, where you can retake photos, correct details, or remove them. Once someone is enrolled here they start appearing by name in Attendance Logs, Access Logs and Detected Users.',
        placement: 'top',
      },
      {
        target: '[data-tour="reg-edit"]',
        title: 'Edit user',
        content: 'Update this registered user.',
        placement: 'left',
      },
      {
        target: '[data-tour="reg-delete"]',
        title: 'Delete user',
        content: 'Delete this registered user.',
        placement: 'left',
      },
    ],
  },

  roles: {
    intro:
      'Roles & Permissions lets you control what users can view or do in each module.',
    steps: [
      {
        target: '[data-tour="roles-toolbar"]',
        title: 'Find a role',
        content:
          'Search the built-in roles and any you have added. Selecting one opens its permission grid, where removing "view" hides that module from the sidebar entirely rather than greying it out.',
        placement: 'bottom',
      },
    ],
  },

  locations: {
    intro:
      'Locations are your physical sites. They feed the site switcher in the header and scope reporting, so a multi-site deployment stays separable.',
  },

  departments: {
    intro:
      'Departments group people for attendance and access reporting — useful when you want figures per team rather than per camera.',
  },

  shifts: {
    intro:
      'Shift Management is where you create shifts and assign staff to them.',
    steps: [
      {
        target: '[data-tour="shifts-search"]',
        title: 'Search shifts',
        content: 'Find a shift by name.',
        placement: 'bottom',
      },
      {
        target: '[data-tour="shifts-create"]',
        title: 'Create shift',
        content: 'Create a new shift.',
        placement: 'bottom',
      },
      {
        target: '[data-tour="shifts-bulk-assign"]',
        title: 'Bulk assign',
        content: 'Assign staff to shifts in bulk.',
        placement: 'bottom',
      },
      {
        target: '[data-tour="shifts-table"]',
        title: 'Shift list',
        content: 'View shift timings, days, and assigned staff.',
        placement: 'top',
      },
      {
        target: '[data-tour="shifts-assign-row"]',
        title: 'Assign staff',
        content: 'Assign staff to this shift.',
        placement: 'left',
      },
      {
        target: '[data-tour="shifts-edit"]',
        title: 'Edit shift',
        content: 'Update this shift.',
        placement: 'left',
      },
      {
        target: '[data-tour="shifts-delete"]',
        title: 'Delete shift',
        content: 'Delete this shift.',
        placement: 'left',
      },
    ],
  },

  'shift-schedule': {
    intro:
      'Shift Schedule is where you assign shifts to employees by date.',
    steps: [
      {
        target: '[data-tour="schedule-month"]',
        title: 'Choose month',
        content: 'Move between months.',
        placement: 'bottom',
      },
      {
        target: '[data-tour="schedule-filters"]',
        title: 'Filter employees',
        content: 'Filter the schedule by employee, department, location, or role.',
        placement: 'bottom',
      },
      {
        target: '[data-tour="schedule-grid"]',
        title: 'Schedule grid',
        content: 'Review employee shifts by date.',
        placement: 'top',
      },
      {
        target: '[data-tour="schedule-cell"]',
        title: 'Assign day',
        content: 'Click a cell to assign or change a shift.',
        placement: 'top',
      },
    ],
  },

  settings: {
    intro:
      'Settings holds the system-wide preferences: timezone, how long recordings and logs are kept, alert behaviour, and the sidebar log ordering.',
    steps: [
      {
        target: '[data-tour="settings-general"]',
        spotlightTarget: '[data-tour="settings-sections"]',
        title: 'System preferences',
        content:
          'Timezone affects every timestamp in the app. Retention decides how long footage and logs are kept before they are swept — both worth setting deliberately rather than leaving at the default.',
        placement: 'bottom',
      },
    ],
  },

  recipients: {
    intro:
      'Alert Recipients decides who hears about a detection — by email or Telegram. Recipients verify their address before anything is sent to them.',
  },

  'auto-email-reports': {
    intro:
      'Auto Email Reports lets you schedule daily attendance summaries and send them automatically to the right people.',
    steps: [
      {
        target: '[data-tour="reports-create"]',
        title: 'Create report',
        content: 'Create a new scheduled email report.',
        placement: 'bottom',
      },
      {
        target: '[data-tour="reports-preview"]',
        title: 'Preview report',
        content: 'Preview what this report will send.',
        placement: 'left',
      },
      {
        target: '[data-tour="reports-send"]',
        title: 'Send test mail',
        content: 'Send this report now as a test.',
        placement: 'left',
      },
      {
        target: '[data-tour="reports-toggle"]',
        title: 'Pause or enable',
        content: 'Pause or enable this report.',
        placement: 'left',
      },
      {
        target: '[data-tour="reports-edit"]',
        title: 'Edit report',
        content: 'Change this report settings.',
        placement: 'left',
      },
      {
        target: '[data-tour="reports-delete"]',
        title: 'Delete report',
        content: 'Delete this scheduled report.',
        placement: 'left',
      },
    ],
  },
};

/** Fallback copy for a module with no entry above. Keeps every module tourable. */
function genericIntro(item) {
  return `${item.label} lives here. Open it from this link whenever you need it — you can start a tour of any module from the header at any time.`;
}

/**
 * Build the tour for one visible nav item: its nav-anchored intro, then any
 * page-level steps. Log pages inherit the shared ReusableTablePage set.
 */
export function tourForItem(item) {
  const content = MODULE_CONTENT[item.key];
  if (item.key === LOGS_TOUR_KEY) {
    return {
      key: item.key,
      label: item.label,
      path: `/${String(item.path || 'dashboard').replace(/^\/+/, '')}`,
      steps: [navIntro(item, content?.intro ?? genericIntro(item))],
    };
  }

  const isLogPage = item.group === LOGS_GROUP_LABEL || String(item.path).startsWith('logs/');

  const pageSteps = content?.steps ?? (isLogPage ? LOG_PAGE_STEPS : []);

  return {
    key: item.key,
    label: item.label,
    // nav.config paths are relative (they sit under the layout route); the
    // engine navigates with absolute paths.
    path: `/${String(item.path).replace(/^\/+/, '')}`,
    steps: [navIntro(item, content?.intro ?? genericIntro(item)), ...pageSteps],
  };
}

/**
 * Drop steps whose anchor isn't on the page right now.
 *
 * Pages render conditionally — stat cards only on some logs, a grid toggle only
 * where a grid exists, the header's network card only once a reading arrives.
 * Filtering here means the registry can list every anchor a page might show
 * without a module ever spotlighting an element that isn't there.
 */
export function resolveSteps(steps) {
  if (typeof document === 'undefined') return [];
  return steps.filter((step) => {
    try {
      return Boolean(document.querySelector(step.target));
    } catch {
      return false;
    }
  });
}

export { SHELL_TOUR, SHELL_KEY, LOG_PAGE_STEPS };
