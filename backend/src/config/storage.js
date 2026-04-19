const { Storage } = require('@google-cloud/storage')
const path = require('path')

const projectId = process.env.GCP_PROJECT_ID
const bucketName = process.env.GCP_BUCKET_NAME
const serviceAccountPath = process.env.GCS_SERVICE_ACCOUNT_PATH

if (!projectId) throw new Error('GCP_PROJECT_ID is not set in environment')
if (!bucketName) throw new Error('GCP_BUCKET_NAME is not set in environment')
if (!serviceAccountPath) throw new Error('GCS_SERVICE_ACCOUNT_PATH is not set in environment')

const storage = new Storage({
  projectId,
  keyFilename: path.resolve(serviceAccountPath),
})

const bucket = storage.bucket(bucketName)

/**
 * Upload a buffer to GCP Storage and return the public URL.
 * @param {Buffer} buffer
 * @param {string} destination - path inside the bucket, e.g. "uploads/photo.jpg"
 * @param {string} mimetype
 * @returns {Promise<string>}
 */
async function uploadFile(buffer, destination, mimetype) {
  const file = bucket.file(destination)
  await file.save(buffer, {
    metadata: { contentType: mimetype },
    resumable: false,
  })
  return `https://storage.googleapis.com/${bucketName}/${destination}`
}

/**
 * Generate a signed URL for temporary read access to a private object.
 * @param {string} destination
 * @param {number} [expiresInMs=900000] - default 15 minutes
 * @returns {Promise<string>}
 */
async function getSignedUrl(destination, expiresInMs = 15 * 60 * 1000) {
  const [url] = await bucket.file(destination).getSignedUrl({
    action: 'read',
    expires: Date.now() + expiresInMs,
  })
  return url
}

/**
 * Delete a file from GCP Storage.
 * @param {string} destination
 * @returns {Promise<void>}
 */
async function deleteFile(destination) {
  await bucket.file(destination).delete()
}

module.exports = { bucket, uploadFile, getSignedUrl, deleteFile }
