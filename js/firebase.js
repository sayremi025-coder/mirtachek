// LIVE mode is the default. Replace the values with Firebase Web App configuration.
export const USE_DEMO = false;
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, collection, addDoc, getDocs, query, orderBy, limit, serverTimestamp, where, runTransaction, increment } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js";
const config={apiKey:"YOUR_API_KEY",authDomain:"YOUR_PROJECT.firebaseapp.com",projectId:"YOUR_PROJECT_ID",storageBucket:"YOUR_PROJECT.appspot.com",messagingSenderId:"YOUR_SENDER_ID",appId:"YOUR_APP_ID"};
export const firebaseConfigured=!Object.values(config).some(v=>String(v).startsWith("YOUR_"));
let app=null,auth=null,db=null,storage=null,functions=null;
if(firebaseConfigured){app=initializeApp(config);auth=getAuth(app);db=getFirestore(app);storage=getStorage(app);functions=getFunctions(app);}
export {app,auth,db,storage,functions,GoogleAuthProvider,signInWithPopup,onAuthStateChanged,signOut,doc,getDoc,setDoc,updateDoc,deleteDoc,collection,addDoc,getDocs,query,orderBy,limit,serverTimestamp,where,runTransaction,increment,storageRef,uploadBytes,getDownloadURL,deleteObject,httpsCallable};