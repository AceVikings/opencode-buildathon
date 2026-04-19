const { Schema, model } = require('mongoose')

const waitlistEntrySchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    uid: {
      type: String,
      default: null,
    },
    name: {
      type: String,
      default: null,
      trim: true,
    },
    source: {
      type: String,
      enum: ['email', 'google'],
      required: true,
    },
  },
  { timestamps: true }
)

module.exports = model('WaitlistEntry', waitlistEntrySchema)
