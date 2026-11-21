const {onCall,HttpsError}=require("firebase-functions/v2/https");
const {initializeApp}=require("firebase-admin/app");
const {getFirestore,FieldValue}=require("firebase-admin/firestore");
const {getAuth}=require("firebase-admin/auth");
initializeApp(); const db=getFirestore();
async function admin(uid){if(!uid)throw new HttpsError("unauthenticated","Войдите");const u=await getAuth().getUser(uid);if(u.customClaims?.admin!==true)throw new HttpsError("permission-denied","Только администратор");}
exports.setAdminClaim=onCall(async req=>{await admin(req.auth?.uid);const {uid,value}=req.data||{};if(!uid||typeof value!=="boolean")throw new HttpsError("invalid-argument","Параметры неверны");await getAuth().setCustomUserClaims(uid,{admin:value});return {ok:true};});
exports.createOrder=onCall(async req=>{
 if(!req.auth)throw new HttpsError("unauthenticated","Войдите в систему");
 const x=req.data||{},lines=Array.isArray(x.items)?x.items:[];if(!lines.length)throw new HttpsError("invalid-argument","Корзина пуста");
 const ref=db.collection("orders").doc(),type=x.type||"retail";
 if(!["retail","shipment","preorder"].includes(type))throw new HttpsError("invalid-argument","Тип документа неверен");
 const result=await db.runTransaction(async tx=>{
  let total=0,costTotal=0,items=[];
  for(const line of lines){const qty=Math.floor(Number(line.qty));if(!line.productId||qty<1)throw new HttpsError("invalid-argument","Количество неверно");const pr=db.collection("products").doc(line.productId),snap=await tx.get(pr);if(!snap.exists)throw new HttpsError("not-found","Товар не найден");const p=snap.data(),price=Number(p.retailPrice||0),cost=Number(p.costPrice||0);if(type!=="preorder"&&p.type!=="service"&&Number(p.stock||0)<qty)throw new HttpsError("failed-precondition","Недостаточный остаток: "+p.name);total+=price*qty;costTotal+=cost*qty;items.push({productId:pr.id,name:p.name,qty,price,cost});if(type!=="preorder"&&p.type!=="service")tx.update(pr,{stock:Number(p.stock||0)-qty,updatedAt:FieldValue.serverTimestamp()});}
  const paid=Math.min(total,Math.max(0,Number(x.paid||0))),doc={number:"MT-"+Date.now().toString().slice(-8),type,buyerName:String(x.buyerName||""),phone:String(x.phone||""),items,total,costTotal,paid,balance:total-paid,paymentType:x.paymentType||"cash",status:type==="preorder"?"Предзаказ":"Новый",ownerUid:req.auth.uid,createdAt:FieldValue.serverTimestamp()};tx.create(ref,doc);return {id:ref.id,...doc};
 });return result;
});