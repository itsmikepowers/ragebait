/**
 * Firebase client SDK, browser only.
 *
 * Mirrors hypefeed's `src/lib/auth/firebase.ts`: the whole web config lives in
 * one NEXT_PUBLIC_FIREBASE_CONFIG JSON blob rather than seven separate vars, so
 * adding a Firebase project is a single Doppler edit.
 */
import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

let app: FirebaseApp | undefined;
let auth: Auth | undefined;

function getFirebaseApp(): FirebaseApp {
  if (typeof window === "undefined") {
    throw new Error("Firebase client SDK is only available in the browser");
  }

  if (!app) {
    const firebaseConfig = JSON.parse(
      process.env.NEXT_PUBLIC_FIREBASE_CONFIG || "{}",
    );
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
  }

  return app;
}

export function getClientAuth(): Auth {
  if (!auth) {
    auth = getAuth(getFirebaseApp());
  }
  return auth;
}
