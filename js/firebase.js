// LIVE mode is the default. Configured for project oybek-e501a.
export const USE_DEMO = false;

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, collection, addDoc, getDocs, query, orderBy, limit, serverTimestamp, where, runTransaction, increment } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js";

const config = {
  apiKey: "AIzaSyBJTbCyZHbrijeglKQ9566136AtMlgKrtQ",
  authDomain: "oybek-e501a.firebaseapp.com",
  projectId: "oybek-e501a",
  storageBucket: "oybek-e501a.firebasestorage.app",
  messagingSenderId: "1042259919778",
  appId: "1:1042259919778:web:93a4721870aff250d928fb"
};

export const firebaseConfigured = !Object.values(config).some(v => String(v).startsWith("YOUR_"));

let app = null, auth = null, db = null, storage = null, functions = null;
if (firebaseConfigured) {
  app = initializeApp(config);
  auth = getAuth(app);
  db = getFirestore(app);
  storage = getStorage(app);
  functions = getFunctions(app);
}

export {
  app, auth, db, storage, functions,
  GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut,
  doc, getDoc, setDoc, updateDoc, deleteDoc, collection, addDoc, getDocs,
  query, orderBy, limit, serverTimestamp, where, runTransaction, increment,
  storageRef, uploadBytes, getDownloadURL, deleteObject, httpsCallable
};
