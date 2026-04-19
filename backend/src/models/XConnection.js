const { Schema, model } = require('mongoose')

/**
 * Stores an X (Twitter) OAuth 2.0 connection scoped to a single Influencer.
 * One document per influencer — replaced on reconnect.
 *
 * Indexed on influencerId for fast lookup when posting.
 * Also indexed on uid so we can list all X connections for a given app user.
 */
const xConnectionSchema = new Schema(
  {
    // Firebase uid of the app user who owns this connection
    uid: { type: String, required: true, index: true },

    // The Influencer._id this connection belongs to (one-to-one)
    influencerId: { type: String, required: true, unique: true, index: true },

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
