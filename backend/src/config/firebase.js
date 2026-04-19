const admin = require('firebase-admin')
const path = require('path')
const fs = require('fs')

const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH

if (!serviceAccountPath) {
  throw new Error('FIREBASE_SERVICE_ACCOUNT_PATH is not set in environment')
}

const resolvedPath = path.resolve(serviceAccountPath)

if (!fs.existsSync(resolvedPath)) {
  throw new Error(`Firebase service account file not found at: ${resolvedPath}`)
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(resolvedPath),
  })
}

const auth = admin.auth()

module.exports = { admin, auth }
