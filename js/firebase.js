// Вставьте конфигурацию Web App из Firebase Console.
import {initializeApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getAuth,GoogleAuthProvider,signInWithPopup,onAuthStateChanged,signOut} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {getFirestore,doc,getDoc,setDoc,updateDoc,deleteDoc,collection,addDoc,getDocs,query,orderBy,limit,serverTimestamp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {getStorage,ref as storageRef,uploadBytes,getDownloadURL,deleteObject} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js";
import {getFunctions,httpsCallable} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js";
const config={apiKey:"YOUR_API_KEY",authDomain:"YOUR_PROJECT.firebaseapp.com",projectId:"YOUR_PROJECT_ID",storageBucket:"YOUR_PROJECT.appspot.com",messagingSenderId:"YOUR_SENDER_ID",appId:"YOUR_APP_ID"};
export const ready=!Object.values(config).some(v=>v.startsWith("YOUR_"));
let app,auth,db,functions,storage;if(ready){app=initializeApp(config);auth=getAuth(app);db=getFirestore(app);functions=getFunctions(app);storage=getStorage(app)}
export {auth,db,functions,storage,storageRef,uploadBytes,getDownloadURL,deleteObject,httpsCallable,GoogleAuthProvider,signInWithPopup,onAuthStateChanged,signOut,doc,getDoc,setDoc,updateDoc,deleteDoc,collection,addDoc,getDocs,query,orderBy,limit,serverTimestamp};