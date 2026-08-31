import mongoose from "mongoose";

const sessionSchema = new mongoose.Schema({
  nvr: { type: mongoose.Schema.Types.ObjectId, ref: "NVR", required: true },
  channel: { type: mongoose.Schema.Types.ObjectId, ref: "Channel", required: true },
  personName: { type: String, required: true },
  timestamp: { type: Date, default: Date.now, index: true },
  images: {
    faceImage: { type: String},
    personImage: { type: String },
    frameImage: { type: String},
  },
  confidenceScore: { type: Number }
});

const accessLogSchema = new mongoose.Schema({
  admin: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true, index: true },

  date: { type: Date, default: () => new Date(), index: true },

  userId: { type: mongoose.Schema.Types.ObjectId, ref: "authorizedUsers", index: true },

  tag: { type: Boolean, default: false },

  liveDemoData: { type: Boolean, default: false },

  // Denormalized $max of sessions[].timestamp. The access-logs list sorts on
  // this; computing it with $max at query time forced a blocking in-memory sort
  // over every doc in the date range. Stored, the sort comes off an index.
  // null when there are no sessions, which makes "has sessions" an index-only
  // check as well. Kept in sync by the pre-save hook below.
  lastCreatedAt: { type: Date, default: null },
  taggedAt: { type: Date, default: null },

  sessions: { type: [sessionSchema], default: [] }

}, { timestamps: true });

// Every writer that touches sessions goes through create() or save() (the
// updateMany/findByIdAndUpdate callers only ever $set `tag`), so this hook is
// the single place lastCreatedAt has to be maintained.
accessLogSchema.pre("save", function (next) {
  if (this.isModified("sessions")) {
    this.lastCreatedAt = this.sessions.reduce(
      (max, s) => (s.timestamp && (!max || s.timestamp > max) ? s.timestamp : max),
      null
    );
  }
  next();
});

accessLogSchema.index({ admin: 1, date: 1, userId: 1 });
accessLogSchema.index({ admin: 1, createdAt: -1 });
accessLogSchema.index({ admin: 1, userId: 1, createdAt: -1 });
accessLogSchema.index({ userId: 1, createdAt: -1 });
// Equality on admin, sort on lastCreatedAt, range on createdAt (ESR) — lets the
// list query match, sort, skip and limit entirely from index keys and fetch
// only the page it returns.
accessLogSchema.index({ admin: 1, lastCreatedAt: -1, createdAt: 1 });
// The paired total. The index above can't seek to a createdAt range (the sort
// key precedes it), so counting one day of a tenant with millions of rows was
// scanning every one of that tenant's keys. Leading with createdAt lets the
// count seek straight to the window, and carrying lastCreatedAt in the key
// keeps the "has sessions" test covered, so it never fetches a document.
accessLogSchema.index({ admin: 1, createdAt: -1, lastCreatedAt: 1 });

export default mongoose.model("OptimizedAccessLogs", accessLogSchema);
