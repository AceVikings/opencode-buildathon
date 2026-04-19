const { Schema, model } = require('mongoose')

/**
 * Stores an X (Twitter) OAuth 2.0 connection for a Firebase user.
 * One document per Firebase uid — replacing it on reconnect.
 */
const xConnectionSchema = new Schema(
  {
    // Firebase uid of the app user who connected their X account
    uid: { type: String, required: true, unique: true, index: true },

    // X user details returned after token exchange
    xUserId: { type: String, required: true },
    xUsername: { type: String, default: '' },
    xName: { type: String, default: '' },

    // OAuth 2.0 tokens
    accessToken: { type: String, required: true },
    // Only present when offline.access scope was granted
    refreshToken: { type: String, default: null },
    // Unix ms timestamp when the access token expires (~2 h after issue)
    tokenExpiresAt: { type: Number, default: null },
  },
  { timestamps: true }
)

module.exports = model('XConnection', xConnectionSchema)
