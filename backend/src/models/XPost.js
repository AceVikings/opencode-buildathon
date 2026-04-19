const { Schema, model } = require('mongoose')

/**
 * Records a tweet posted on behalf of an influencer and stores the
 * latest analytics snapshot fetched from GET /2/tweets/analytics.
 *
 * One document per tweet. Analytics fields are overwritten on every
 * hourly poll so we always have the freshest numbers.
 */
const xPostSchema = new Schema(
  {
    // The influencer this post belongs to
    influencerId: { type: String, required: true, index: true },

    // The Firebase uid of the app-user who owns the influencer
    uid: { type: String, required: true, index: true },

    // X tweet ID (string — large int safe)
    tweetId: { type: String, required: true, unique: true },

    // The text that was posted
    text: { type: String, default: '' },

    // When we posted it
    postedAt: { type: Date, default: Date.now },

    // ── Latest analytics snapshot ────────────────────────────────────────────
    // All fields from GET /2/tweets/analytics (granularity=total, last 7 days)
    // Null until the first poll completes.
    metrics: {
      impressions:       { type: Number, default: null },
      engagements:       { type: Number, default: null },
      likes:             { type: Number, default: null },
      retweets:          { type: Number, default: null },
      replies:           { type: Number, default: null },
      quote_tweets:      { type: Number, default: null },
      bookmarks:         { type: Number, default: null },
      url_clicks:        { type: Number, default: null },
      user_profile_clicks: { type: Number, default: null },
      detail_expands:    { type: Number, default: null },
      follows:           { type: Number, default: null },
    },

    // When metrics were last successfully refreshed
    metricsUpdatedAt: { type: Date, default: null },

    // Short-term agent decision summary stored after autonomous posting
    agentDecisionSummary: { type: String, default: null },
  },
  { timestamps: true }
)

module.exports = model('XPost', xPostSchema)
