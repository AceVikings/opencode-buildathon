const { Schema, model } = require('mongoose')

/**
 * Stores a full reasoning trace for one agent run.
 * Both short-term and long-term agents write here so the frontend
 * can display a debug view of every decision made.
 *
 * Each log entry captures:
 *  - which agent type ran
 *  - the influencer it ran for
 *  - every reasoning step (tool calls, observations, thoughts)
 *  - the final decision / output
 *  - whether the run resulted in a post (short-term only)
 */
const stepSchema = new Schema(
  {
    // 'thought' | 'tool_call' | 'tool_result' | 'decision'
    type:    { type: String, required: true },
    content: { type: String, required: true },
    // Tool name if type === 'tool_call' or 'tool_result'
    tool:    { type: String, default: null },
  },
  { _id: false }
)

const agentLogSchema = new Schema(
  {
    influencerId: { type: String, required: true, index: true },
    uid:          { type: String, required: true, index: true },

    // 'short_term' | 'long_term'
    agentType: {
      type: String,
      enum: ['short_term', 'long_term'],
      required: true,
    },

    // Human-readable status
    status: {
      type: String,
      enum: ['running', 'completed', 'failed'],
      default: 'running',
    },

    // Full step-by-step reasoning trace
    steps: [stepSchema],

    // Final output summary
    summary: { type: String, default: '' },

    // For short-term: XPost._id if a tweet was made
    xPostId: { type: String, default: null },

    // Error message if status === 'failed'
    error: { type: String, default: null },

    // How long the run took in ms
    durationMs: { type: Number, default: null },
  },
  { timestamps: true }
)

module.exports = model('AgentLog', agentLogSchema)
