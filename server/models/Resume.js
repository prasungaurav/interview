const mongoose = require("mongoose");

const ResumeSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
      default: null,
      index: true,
    },
    filename: { type: String, required: true },
    text: { type: String, required: true },
  },
  { timestamps: true } // adds createdAt, updatedAt
);

module.exports = mongoose.model("Resume", ResumeSchema);
