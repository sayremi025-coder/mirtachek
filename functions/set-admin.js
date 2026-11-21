// Run after the user has signed in once and their users/{uid} profile exists.
// Usage: GOOGLE_APPLICATION_CREDENTIALS=/path/service-account.json node set-admin.js FIREBASE_UID
const {initializeApp, applicationDefault}=require("firebase-admin/app");
const {getFirestore}=require("firebase-admin/firestore");
initializeApp({credential:applicationDefault()});
const db=getFirestore();
(async()=>{const uid=process.argv[2];if(!uid)throw new Error("Pass the Firebase Auth UID as the first argument");const ref=db.doc(`users/${uid}`);const snap=await ref.get();if(!snap.exists)throw new Error("User profile does not exist. Sign in to the app once first.");await ref.update({role:"admin",blocked:false,roleUpdatedAt:new Date().toISOString()});console.log(`Admin role assigned to ${uid}`);process.exit(0);})().catch(e=>{console.error(e);process.exit(1);});
