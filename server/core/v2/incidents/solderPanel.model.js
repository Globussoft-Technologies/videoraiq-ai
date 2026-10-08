import mongoose from "mongoose";

// One panel that passed a solder-line camera (deskSolarShoulderDetection).
// Not an incident: the throughput / solder-time samples the Solder Line pages
// aggregate per hour. Written from DS's "Solar panel processing" payload
// (incidents/create with `zones`); a panel with a missed joint additionally
// becomes an incident so it alerts. See solderLine.service.recordSolderPanel.
const solderPanelSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    channelId: { type: mongoose.Schema.Types.ObjectId, ref: "Channel", required: true },
    panelId: { type: String, required: true },
    time: { type: Date, required: true },
    // Per operator zone: seconds present at the desk for this panel, and
    // solder joints done (DS: presence_time, shoulderings_done).
    zones: [
      {
        _id: false,
        zone: String,
        presenceSec: { type: Number, min: 0 },
        done: { type: Number, min: 0 },
      },
    ],
  },
  { timestamps: true },
);

solderPanelSchema.index({ userId: 1, time: 1 });
// DS retries a post after a timeout; the same panel must not count twice.
// `time` is part of the key because panel numbers restart every shift.
solderPanelSchema.index({ channelId: 1, panelId: 1, time: 1 }, { unique: true });

export default mongoose.model("SolderPanel", solderPanelSchema);
