// models/Message.js
const mongoose = require("mongoose");

const MessageSchema = new mongoose.Schema(
  {
    sessionId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    role: { type: String, enum: ["ai", "user"], required: true },
    text: { type: String, default: "" },

    // video related
    video: {
      fileId: { type: mongoose.Schema.Types.ObjectId }, // GridFS file id
      mime: { type: String },
      durationMs: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Message", MessageSchema);
