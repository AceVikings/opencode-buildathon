import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'

const firebaseConfig = {
  apiKey: 'AIzaSyDpUPpXWb7lyeKUxBsWzTYcPQwG1l70zkc',
  authDomain: 'loque-brand.firebaseapp.com',
  projectId: 'loque-brand',
  storageBucket: 'loque-brand.firebasestorage.app',
  messagingSenderId: '708152035912',
  appId: '1:708152035912:web:0a195919d1ed5a55c8e67d',
  measurementId: 'G-E9CVP8CZNN',
}

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const googleProvider = new GoogleAuthProvider()
