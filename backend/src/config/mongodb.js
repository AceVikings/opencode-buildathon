const mongoose = require('mongoose')

const MONGODB_URI = process.env.MONGODB_URI

if (!MONGODB_URI) {
  throw new Error('MONGODB_URI is not set in environment')
}

async function connectDB() {
  try {
    await mongoose.connect(MONGODB_URI)
    console.log('MongoDB connected')
  } catch (err) {
    console.error('MongoDB connection error:', err)
    process.exit(1)
  }
}

mongoose.connection.on('disconnected', () => {
  console.warn('MongoDB disconnected')
})

mongoose.connection.on('reconnected', () => {
  console.log('MongoDB reconnected')
})

module.exports = { connectDB }
