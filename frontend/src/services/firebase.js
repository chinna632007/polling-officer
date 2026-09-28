/**
 * firebase.js - Firebase (client SDK) for the admin Google sign-in.
 *
 * The flow:
 *   1. Login page opens the Google popup (signInWithGoogle below).
 *   2. The resulting Firebase ID token is sent to POST /api/auth/google.
 *   3. The BACKEND verifies the token (signature/project/expiry/verified
 *      email) and checks ADMIN_GOOGLE_EMAILS - only allowlisted emails ever
 *      get an admin session cookie.
 *
 * Config comes from Vite env vars (frontend/.env) - these are public client
 * values by design; security lives entirely in the backend verification.
 */
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

export const googleProvider = new GoogleAuthProvider();
// Always force the account chooser so a previously cached Google session
// cannot silently pick the wrong (non-allowlisted) identity.
googleProvider.setCustomParameters({ prompt: 'select_account' });

/** Opens the Google sign-in popup and resolves with the Firebase result. */
export const signInWithGoogle = () => signInWithPopup(auth, googleProvider);
