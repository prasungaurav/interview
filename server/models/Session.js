const mongoose = require("mongoose");

const SessionSchema = new mongoose.Schema(
  {
    resumeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Resume",
      required: false,
      default: null,
      index: true,
    },

    title: { type: String, default: "Interview Session" },

    ownerKey: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },

    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    status: {
      type: String,
      enum: ["active", "ended", "paused"],
      default: "active",
    },
  },
  { timestamps: true }
);

// ✅ Common query pattern: list my sessions newest first
SessionSchema.index({ ownerId: 1, updatedAt: -1 });

/**
 * ✅ Prevent accidental empty ownerKey
 * IMPORTANT:
 * - Do NOT use next() here (to avoid "next is not a function")
 * - Just throw an error in sync hook
 */
SessionSchema.pre("validate", function () {
  if (!this.ownerKey || !String(this.ownerKey).trim()) {
    throw new Error("ownerKey is required");
  }
});

module.exports = mongoose.model("Session", SessionSchema);
