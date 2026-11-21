/* Firebase LIVE configuration. Replace YOUR_* values with Firebase Web App config. */
(() => {
  "use strict";
  window.USE_DEMO = false;
  window.MIR_FIREBASE_CONFIG = {
    apiKey: "AIzaSyBJTbCyZHbrijeglKQ9566136AtMlgKrtQ",
  authDomain: "oybek-e501a.firebaseapp.com",
  projectId: "oybek-e501a",
  storageBucket: "oybek-e501a.firebasestorage.app",
  messagingSenderId: "1042259919778",
  appId: "1:1042259919778:web:93a4721870aff250d928fb"
};
  const c=window.MIR_FIREBASE_CONFIG;
  window.MIR_FIREBASE_READY=false;
  window.MIR_FIREBASE_ERROR="";
  if(!c.apiKey||c.apiKey.startsWith("YOUR_")||!c.projectId||c.projectId.startsWith("YOUR_")){
    window.MIR_FIREBASE_ERROR="Firebase не настроен. Заполните параметры в js/firebase.js.";
    return;
  }
  try{
    if(!firebase.apps.length)firebase.initializeApp(c);
    window.MIR_AUTH=firebase.auth();
    window.MIR_DB=firebase.firestore();
    window.MIR_STORAGE=firebase.storage();
    window.MIR_FIREBASE_READY=true;
    window.MIR_DB.enablePersistence({synchronizeTabs:true}).catch(()=>{});
  }catch(e){window.MIR_FIREBASE_ERROR=e.message;}
})();
