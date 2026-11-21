const {onCall,HttpsError}=require("firebase-functions/v2/https");
const {initializeApp}=require("firebase-admin/app");
const {getFirestore,FieldValue}=require("firebase-admin/firestore");
initializeApp();
const db=getFirestore();
const money=n=>Math.round((Number(n)||0)*100)/100;
async function requireUser(req){
 if(!req.auth)throw new HttpsError("unauthenticated","Войдите в систему");
 const snap=await db.doc(`users/${req.auth.uid}`).get();
 if(!snap.exists||snap.data().blocked===true)throw new HttpsError("permission-denied","Профиль не найден или заблокирован");
 return {uid:req.auth.uid,...snap.data()};
}
exports.getCatalog=onCall(async req=>{
 let role="customer";
 if(req.auth){const snap=await db.doc(`users/${req.auth.uid}`).get();if(!snap.exists||snap.data().blocked===true)throw new HttpsError("permission-denied","Профиль заблокирован или не найден");role=snap.data().role||"customer";}
 const snap=await db.collection("products").limit(1000).get();
 const items=snap.docs.map(doc=>{const p=doc.data(),out={...p,id:doc.id};
  delete out.retailPrice;delete out.storePrice;delete out.dealerPrice;delete out.costPrice;delete out.price;
  if(role==="admin"){out.retailPrice=Number(p.retailPrice??p.price)||0;out.storePrice=Number(p.storePrice)||0;out.dealerPrice=Number(p.dealerPrice)||0;out.costPrice=Number(p.costPrice)||0;}
  else if(role==="dealer")out.dealerPrice=Number(p.dealerPrice)||0;
  else if(role==="store")out.storePrice=Number(p.storePrice)||0;
  else out.retailPrice=Number(p.retailPrice??p.price)||0;
  return out;
 });
 return {items};
});
exports.setUserRole=onCall(async req=>{
 const admin=await requireUser(req);if(admin.role!=="admin")throw new HttpsError("permission-denied","Только администратор");
 const {uid,role}=req.data||{};
 if(typeof uid!=="string"||!["customer","buyer","dealer","store"].includes(role)||uid===req.auth.uid)throw new HttpsError("invalid-argument","Недопустимые параметры");
 const ref=db.doc(`users/${uid}`),snap=await ref.get();if(!snap.exists)throw new HttpsError("not-found","Пользователь не найден");
 await ref.update({role,roleUpdatedAt:FieldValue.serverTimestamp(),roleUpdatedBy:req.auth.uid});
 await db.collection("roleHistory").add({uid,role,changedBy:req.auth.uid,changedAt:FieldValue.serverTimestamp()});
 return {ok:true};
});
exports.createDocument=onCall(async req=>{
 const user=await requireUser(req),data=req.data||{},docType=data.docType;
 if(!["retail","shipment","preorder"].includes(docType))throw new HttpsError("invalid-argument","Неизвестный тип документа");
 if(docType==="shipment"&&!(["dealer","admin"].includes(user.role)))throw new HttpsError("permission-denied","Отгрузку может оформить дилер или администратор");
 if(docType==="preorder"&&["customer","buyer"].includes(user.role))throw new HttpsError("permission-denied","Предзаказ доступен магазинам и дилерам");
 const items=Array.isArray(data.items)?data.items:[];if(!items.length||items.length>100)throw new HttpsError("invalid-argument","Корзина пуста или слишком большая");
 let store=null;
 if(docType==="shipment"){
  const storeName=String(data.storeName||"").trim();if(!storeName)throw new HttpsError("invalid-argument","Укажите магазин-получатель");
  const q=await db.collection("users").where("role","==","store").get();
  const matches=q.docs.filter(d=>String(d.data().name||"").trim().toLowerCase()===storeName.toLowerCase());
  if(!matches.length)throw new HttpsError("not-found","Магазин с таким названием не найден. Убедитесь, что пользователь зарегистрирован и ему назначена роль «Магазин».");
  if(matches.length>1)throw new HttpsError("failed-precondition","Найдено несколько магазинов с таким названием. Уточните уникальное название профиля магазина.");
  const match=matches[0];store={uid:match.id,name:match.data().name||storeName};
 }
 const docRef=db.collection("documents").doc();
 const result=await db.runTransaction(async tx=>{
  const productRefs=items.map(x=>db.doc(`products/${String(x.productId||"")}`));
  const snaps=[];for(const ref of productRefs)snaps.push(await tx.get(ref));
  let total=0,costTotal=0;const normalized=[];
  for(let i=0;i<items.length;i++){
   const q=Number(items[i].qty),snap=snaps[i];if(!snap.exists||!Number.isInteger(q)||q<1||q>10000)throw new HttpsError("invalid-argument","Некорректный товар или количество");
   const p=snap.data();if(p.type!=="service"&&docType!=="preorder"&&(Number(p.stock)||0)<q)throw new HttpsError("failed-precondition",`Недостаточно остатка: ${p.name}`);
   const price=money(user.role==="dealer"?p.dealerPrice:user.role==="store"?p.storePrice:(p.retailPrice??p.price));
   const cost=money(p.costPrice);if(price<0||!Number.isFinite(price))throw new HttpsError("failed-precondition",`Не задана цена: ${p.name}`);
   total+=price*q;costTotal+=cost*q;normalized.push({id:snap.id,name:String(p.name||"Товар"),type:p.type||"product",price,qty:q,costPrice:cost});
  }
  total=money(total);costTotal=money(costTotal);
  const paymentType=["cash","debt","transfer","partial"].includes(data.paymentType)?data.paymentType:"debt";
  const paid=paymentType==="cash"||paymentType==="transfer"?total:paymentType==="partial"?Math.min(total,Math.max(0,money(data.paidAmount))):0;
  const partialMethod=data.partialMethod==="transfer"?"transfer":"cash";
  const cashAmount=paymentType==="cash"?paid:paymentType==="partial"&&partialMethod==="cash"?paid:0;
  const transferAmount=paymentType==="transfer"?paid:paymentType==="partial"&&partialMethod==="transfer"?paid:0;
  const record={number:`MT-${Date.now()}`,docType,uid:user.uid,role:user.role,dealerUid:user.role==="dealer"?user.uid:null,storeUid:store?.uid||null,storeName:store?.name||String(data.storeName||""),customerName:String(data.customerName||user.name||""),dealerName:user.role==="dealer"?String(user.name||""):String(data.dealerName||""),phone:String(data.phone||""),delivery:data.delivery==="delivery"?"delivery":"pickup",address:String(data.address||""),paymentType,paidAmount:paid,cashAmount,transferAmount,total,costTotal,items:normalized,comment:String(data.comment||""),status:docType==="preorder"?"preorder":"new",createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()};
  if(docType!=="preorder")for(let i=0;i<items.length;i++){const p=snaps[i].data();if(p.type!=="service")tx.update(productRefs[i],{stock:FieldValue.increment(-Number(items[i].qty)),updatedAt:FieldValue.serverTimestamp()});}
  tx.create(docRef,record);return {id:docRef.id,number:record.number,docType:record.docType,uid:record.uid,role:record.role,dealerUid:record.dealerUid,storeUid:record.storeUid,storeName:record.storeName,customerName:record.customerName,dealerName:record.dealerName,phone:record.phone,delivery:record.delivery,address:record.address,paymentType:record.paymentType,paidAmount:record.paidAmount,cashAmount:record.cashAmount,transferAmount:record.transferAmount,total:record.total,costTotal:record.costTotal,items:record.items,comment:record.comment,status:record.status,createdAt:new Date().toISOString()};
 });
 return result;
});
exports.acceptShipment=onCall(async req=>{
 const user=await requireUser(req),{documentId,acceptanceType}=req.data||{};
 if(typeof documentId!=="string"||!["cash","debt"].includes(acceptanceType))throw new HttpsError("invalid-argument","Некорректные параметры приёмки");
 const ref=db.doc(`documents/${documentId}`);
 return db.runTransaction(async tx=>{
  const snap=await tx.get(ref);if(!snap.exists)throw new HttpsError("not-found","Документ не найден");
  const d=snap.data();if(d.docType!=="shipment")throw new HttpsError("failed-precondition","Это не документ отгрузки");
  if(user.role!=="admin"&&(user.role!=="store"||d.storeUid!==user.uid))throw new HttpsError("permission-denied","Эта отгрузка назначена другому магазину");
  if(d.status==="accepted")throw new HttpsError("already-exists","Отгрузка уже принята");
  const paid=acceptanceType==="cash"?Number(d.total)||0:Number(d.paidAmount)||0;
  tx.update(ref,{status:"accepted",acceptedAt:FieldValue.serverTimestamp(),acceptanceType,paidAmount:paid,cashAmount:acceptanceType==="cash"?Math.max(0,paid-(Number(d.transferAmount)||0)):(Number(d.cashAmount)||0),transferAmount:Number(d.transferAmount)||0,updatedAt:FieldValue.serverTimestamp()});
  return {ok:true,paidAmount:paid};
 });
});

exports.adjustStock=onCall(async req=>{
 const user=await requireUser(req);if(user.role!=="admin")throw new HttpsError("permission-denied","Только администратор может менять складские остатки");
 const {productId,quantity,operation,reason}=req.data||{},qty=Number(quantity);
 if(typeof productId!=="string"||!Number.isInteger(qty)||qty<1||qty>100000||!["receipt","writeoff"].includes(operation))throw new HttpsError("invalid-argument","Проверьте товар, количество и тип операции");
 const productRef=db.doc(`products/${productId}`),movementRef=db.collection("inventoryMovements").doc();
 return db.runTransaction(async tx=>{const snap=await tx.get(productRef);if(!snap.exists)throw new HttpsError("not-found","Товар не найден");const p=snap.data(),before=Number(p.stock)||0,after=operation==="receipt"?before+qty:before-qty;if(after<0)throw new HttpsError("failed-precondition","Нельзя списать больше, чем есть на складе");tx.update(productRef,{stock:after,updatedAt:FieldValue.serverTimestamp()});tx.create(movementRef,{productId,productName:p.name||"",operation,quantity:qty,before,after,reason:String(reason||""),createdBy:user.uid,createdAt:FieldValue.serverTimestamp()});return {ok:true,before,after};});
});
