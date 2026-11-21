/* Firebase LIVE configuration. Replace YOUR_* values with Firebase Web App config. */
(() => {
  "use strict";
  window.USE_DEMO = false;
  window.MIR_FIREBASE_CONFIG = {
    apiKey: "YOUR_FIREBASE_API_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT.appspot.com",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_FIREBASE_APP_ID"
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