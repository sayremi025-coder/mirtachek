import * as F from "./firebase.js";

const $ = s => document.querySelector(s);
const money = n => Number(n) ? new Intl.NumberFormat("ru-RU").format(Number(n)) + " ₸" : "По запросу";
const seedProducts = [
  {id:"c1",category:"cart",name:"Тачка хозяйственная",description:"Для дома, двора и хозяйства.",price:28000,symbol:"▱",showInCarousel:true},
  {id:"c2",category:"cart",name:"Усиленная металлическая тачка",description:"Прочная конструкция для регулярной работы.",price:42000,symbol:"▰",showInCarousel:true},
  {id:"w1",category:"weld",name:"Металлическая полка",description:"Для мастерской, гаража и дома.",price:18000,symbol:"▤",showInCarousel:true},
  {id:"w2",category:"weld",name:"Стеллаж на заказ",description:"Размеры и конфигурация под помещение.",price:35000,symbol:"▥",showInCarousel:false},
  {id:"w3",category:"weld",name:"Сварная конструкция",description:"Изготовление по вашему эскизу.",price:0,symbol:"⌑",showInCarousel:false},
  {id:"c3",category:"cart",name:"Садовая тележка",description:"Для участка и сезонных работ.",price:32000,symbol:"▱",showInCarousel:true}
];
let products = seedProducts.map(x=>({...x})), user=null, profile=null;
let cart=JSON.parse(localStorage.getItem("mtcart")||"[]"), tab="users", carouselIndex=0, carouselTimer=null;
let editingProductId=null;

function toast(message){ const el=$("#msg"); if(el) el.textContent=message; else alert(message); }
function safe(value){return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function productImage(p){return p.imageUrl ? `<img src="${safe(p.imageUrl)}" alt="${safe(p.name)}" loading="lazy">` : `<span class="product-placeholder">${safe(p.symbol||"▱")}</span>`;}
function productCard(p, featured=false){
  const category=p.category==="cart"?"ТАЧКИ":"МЕТАЛЛОИЗДЕЛИЯ";
  const content=`<div class="product-photo">${productImage(p)}</div><div class="info"><small>${category}</small><h3>${safe(p.name)}</h3><p>${safe(p.description||"")}</p><span class="price">${money(p.price)}</span><div class="product-actions"><button data-add="${safe(p.id)}">${Number(p.price)?"В корзину":"Уточнить"}</button>${p.productUrl?`<a class="details-link" href="${safe(p.productUrl)}" target="_blank" rel="noopener">Подробнее ↗</a>`:""}</div></div>`;
  return `<article class="product ${featured?"carousel-product":""}">${content}</article>`;
}
function draw(filter="all"){
  const shown=products.filter(p=>filter==="all"||p.category===filter);
  $("#products").innerHTML=shown.map(p=>productCard(p)).join("")||'<p class="empty-state">Товары пока не добавлены.</p>';
  drawCarousel();
}
function drawCarousel(){
  const host=$("#productCarousel"); if(!host)return;
  const featured=products.filter(p=>p.showInCarousel!==false);
  if(!featured.length){host.innerHTML='<p class="empty-state">Администратор пока не добавил товары в карусель.</p>';$("#carouselDots").innerHTML="";return;}
  if(carouselIndex>=featured.length)carouselIndex=0;
  host.innerHTML=featured.map(p=>productCard(p,true)).join("");
  const cards=[...host.children];
  cards.forEach((card,i)=>card.style.transform=`translateX(calc(${(i-carouselIndex)*100}% + ${(i-carouselIndex)*18}px))`);
  $("#carouselDots").innerHTML=featured.map((_,i)=>`<button class="${i===carouselIndex?"active":""}" data-dot="${i}" aria-label="Товар ${i+1}"></button>`).join("");
}
function moveCarousel(step){
  const count=products.filter(p=>p.showInCarousel!==false).length;
  if(!count)return; carouselIndex=(carouselIndex+step+count)%count; drawCarousel();
}
function startCarousel(){stopCarousel();carouselTimer=setInterval(()=>moveCarousel(1),4200);}
function stopCarousel(){if(carouselTimer)clearInterval(carouselTimer);carouselTimer=null;}
function drawCart(){
  const n=cart.reduce((a,x)=>a+x.qty,0);$("#count").textContent=n;
  $("#cartLines").innerHTML=cart.map(x=>`<div class="line"><span>${safe(x.name)} × ${x.qty} — ${money(x.price*x.qty)}</span><button data-del="${safe(x.id)}">×</button></div>`).join("")||"Корзина пуста";
  $("#total").textContent="Итого: "+money(cart.reduce((a,x)=>a+x.price*x.qty,0));
  localStorage.setItem("mtcart",JSON.stringify(cart));
}
async function loadProducts(){
  if(!F.ready){draw();return;}
  try{
    const snap=await F.getDocs(F.collection(F.db,"products"));
    if(!snap.empty) products=snap.docs.map(d=>({id:d.id,...d.data()}));
    draw();
  }catch(e){console.error("Не удалось загрузить товары:",e);draw();}
}
async function signIn(){
  if(!F.ready){toast("Сначала заполните Firebase config в js/firebase.js");return;}
  try{const r=await F.signInWithPopup(F.auth,new F.GoogleAuthProvider());user=r.user;await ensureUser(user);authUi();}
  catch(e){toast("Ошибка входа: "+e.message);}
}
async function ensureUser(u){
  const r=F.doc(F.db,"users",u.uid),s=await F.getDoc(r);
  if(!s.exists())await F.setDoc(r,{uid:u.uid,name:u.displayName||"",email:u.email||"",photoURL:u.photoURL||"",role:"buyer",blocked:false,createdAt:F.serverTimestamp(),lastLoginAt:F.serverTimestamp()});
  else await F.updateDoc(r,{lastLoginAt:F.serverTimestamp()});
  profile=(await F.getDoc(r)).data();
}
function authUi(){
  if(user){$("#login").textContent=profile?.name||"Аккаунт";$("#login").onclick=()=>profile?.role==="admin"?openAdmin():toast("Вы вошли как покупатель");}
  else{$("#login").textContent="Войти через Google";$("#login").onclick=signIn;}
}
async function order(){
  if(!user){await signIn();return;} if(!cart.length)return toast("Корзина пуста");
  if(profile?.blocked)return toast("Аккаунт заблокирован");
  try{await F.addDoc(F.collection(F.db,"orders"),{uid:user.uid,customerName:profile.name,email:user.email,items:cart,total:cart.reduce((a,x)=>a+x.price*x.qty,0),status:"new",createdAt:F.serverTimestamp()});cart=[];drawCart();$("#cart").classList.add("hidden");toast("Заказ отправлен");}
  catch(e){toast("Ошибка: "+e.message);}
}
async function request(e){
  e.preventDefault();if(!user){await signIn();return;}
  const data=Object.fromEntries(new FormData(e.target));
  try{await F.addDoc(F.collection(F.db,"requests"),{...data,uid:user.uid,email:user.email,status:"new",createdAt:F.serverTimestamp()});e.target.reset();toast("Заявка отправлена");}
  catch(err){toast(err.message);}
}
async function openAdmin(){if(profile?.role!=="admin")return toast("Нет доступа");$("#admin").classList.remove("hidden");await renderAdmin();}
async function renderAdmin(){
  if(tab==="products"){renderProductAdmin();return;}
  const col=tab==="users"?"users":tab==="orders"?"orders":"requests";
  try{
    const s=await F.getDocs(F.query(F.collection(F.db,col),F.orderBy("createdAt","desc"),F.limit(100)));
    const a=s.docs.map(d=>({id:d.id,...d.data()}));
    if(tab==="users")$("#adminContent").innerHTML=`<table class="admin-table"><tr><th>Имя</th><th>Email</th><th>Роль</th><th>Статус</th></tr>${a.map(x=>`<tr><td>${safe(x.name)}</td><td>${safe(x.email)}</td><td><select data-role="${x.id}" ${x.role==="admin"?"disabled":""}><option value="buyer" ${x.role==="buyer"?"selected":""}>Покупатель</option><option value="dealer" ${x.role==="dealer"?"selected":""}>Дилер</option><option value="store" ${x.role==="store"?"selected":""}>Магазин</option></select></td><td>${x.blocked?"Заблокирован":"Активен"}</td></tr>`).join("")}</table>`;
    else $("#adminContent").innerHTML=`<table class="admin-table"><tr><th>ID</th><th>Клиент</th><th>Статус</th></tr>${a.map(x=>`<tr><td>${x.id.slice(0,10)}</td><td>${safe(x.customerName||x.name||x.email||"—")}</td><td>${safe(x.status||"—")}</td></tr>`).join("")}</table>`;
  }catch(e){$("#adminContent").textContent="Ошибка загрузки: "+e.message;}
}
function renderProductAdmin(){
  $("#adminContent").innerHTML=`
    <div class="admin-products-head"><div><h3>Управление товарами</h3><p>Добавляйте товары, фотографии и ссылки. Отмечайте товары для главной карусели.</p></div><button id="newProduct" class="cta">＋ Добавить товар</button></div>
    <form id="productForm" class="product-form hidden">
      <h3 id="productFormTitle">Новый товар</h3>
      <div class="form-grid">
        <label>Название<input name="name" required maxlength="100" placeholder="Например, тачка усиленная"></label>
        <label>Категория<select name="category"><option value="cart">Тачки</option><option value="weld">Металлоизделия</option></select></label>
        <label>Цена, ₸<input name="price" type="number" min="0" step="1" value="0"></label>
        <label>Ссылка на товар<input name="productUrl" type="url" placeholder="https://..."></label>
        <label class="full">Описание<textarea name="description" rows="3" maxlength="1000" placeholder="Описание товара"></textarea></label>
        <label class="full">Фотография товара<input name="imageFile" type="file" accept="image/*"><span class="field-hint">Или укажите прямую ссылку на фото ниже. До 8 МБ.</span></label>
        <label class="full">Ссылка на фото<input name="imageUrl" type="url" placeholder="https://..."></label>
        <label class="check-label"><input name="showInCarousel" type="checkbox" checked> Показывать в карусели на главной</label>
      </div>
      <div class="form-actions"><button class="cta" type="submit">Сохранить товар</button><button type="button" id="cancelProduct" class="secondary-btn">Отмена</button></div>
      <p id="productFormMessage" class="form-message"></p>
    </form>
    <div class="admin-product-list">${products.map(p=>`<div class="admin-product-row"><div class="admin-product-thumb">${p.imageUrl?`<img src="${safe(p.imageUrl)}" alt="">`:"▱"}</div><div class="admin-product-meta"><b>${safe(p.name)}</b><span>${money(p.price)} · ${p.showInCarousel===false?"Не в карусели":"В карусели"}</span></div><button class="secondary-btn" data-edit-product="${safe(p.id)}">Изменить</button><button class="danger-btn" data-delete-product="${safe(p.id)}">Удалить</button></div>`).join("")||"<p>Товаров пока нет.</p>"}</div>`;
  $("#newProduct").onclick=()=>showProductForm();
  $("#cancelProduct").onclick=()=>{$("#productForm").classList.add("hidden");editingProductId=null;};
  $("#productForm").onsubmit=saveProduct;
}
function showProductForm(id=null){
  editingProductId=id;
  const form=$("#productForm"),p=products.find(x=>x.id===id);
  form.reset();form.classList.remove("hidden");
  $("#productFormTitle").textContent=p?"Редактировать товар":"Новый товар";
  if(p){for(const key of ["name","category","price","productUrl","description","imageUrl"])form.elements[key].value=p[key]??(key==="price"?0:"");form.elements.showInCarousel.checked=p.showInCarousel!==false;}
  else form.elements.showInCarousel.checked=true;
  form.scrollIntoView({behavior:"smooth",block:"start"});
}
async function saveProduct(e){
  e.preventDefault();if(!F.ready)return toast("Firebase не настроен. Заполните js/firebase.js");
  const form=e.currentTarget,fd=new FormData(form),file=fd.get("imageFile");
  const message=$("#productFormMessage");message.textContent="Сохраняем...";
  try{
    const data={name:String(fd.get("name")).trim(),category:fd.get("category")==="weld"?"weld":"cart",description:String(fd.get("description")||"").trim(),price:Math.max(0,Number(fd.get("price"))||0),productUrl:String(fd.get("productUrl")||"").trim(),imageUrl:String(fd.get("imageUrl")||"").trim(),showInCarousel:fd.get("showInCarousel")==="on",updatedAt:F.serverTimestamp()};
    if(file&&file.size){
      if(file.size>8*1024*1024)throw new Error("Фото должно быть не больше 8 МБ");
      if(!file.type.startsWith("image/"))throw new Error("Можно загружать только изображения");
      const path=`product-images/${user.uid}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`;
      const uploaded=await F.uploadBytes(F.storageRef(F.storage,path),file);
      data.imageUrl=await F.getDownloadURL(uploaded.ref);data.imageStoragePath=path;
    }
    if(editingProductId){await F.updateDoc(F.doc(F.db,"products",editingProductId),data);}
    else{data.createdAt=F.serverTimestamp();await F.addDoc(F.collection(F.db,"products"),data);}
    await loadProducts();message.textContent="Товар сохранён";await renderProductAdmin();toast("Товар сохранён");
  }catch(err){message.textContent="Ошибка: "+err.message;}
}
async function deleteProduct(id){
  if(!confirm("Удалить этот товар?"))return;
  try{
    const p=products.find(x=>x.id===id);
    await F.deleteDoc(F.doc(F.db,"products",id));
    if(p?.imageStoragePath&&F.storage)try{await F.deleteObject(F.storageRef(F.storage,p.imageStoragePath));}catch(e){console.warn("Не удалось удалить файл фото",e);}
    products=products.filter(x=>x.id!==id);draw();renderProductAdmin();toast("Товар удалён");
  }catch(e){toast("Не удалось удалить товар: "+e.message);}
}
document.addEventListener("click",async e=>{
  const add=e.target.closest("[data-add]");
  if(add){const p=products.find(x=>x.id===add.dataset.add);if(!p)return;if(!Number(p.price)){ $("#custom").scrollIntoView({behavior:"smooth"});return;}const line=cart.find(x=>x.id===p.id);line?line.qty++:cart.push({id:p.id,name:p.name,price:Number(p.price),qty:1});drawCart();}
  const del=e.target.closest("[data-del]");if(del){cart=cart.filter(x=>x.id!==del.dataset.del);drawCart();}
  const t=e.target.closest("[data-tab]");if(t){tab=t.dataset.tab;renderAdmin();}
  const edit=e.target.closest("[data-edit-product]");if(edit)showProductForm(edit.dataset.editProduct);
  const remove=e.target.closest("[data-delete-product]");if(remove)deleteProduct(remove.dataset.deleteProduct);
  const dot=e.target.closest("[data-dot]");if(dot){carouselIndex=Number(dot.dataset.dot);drawCarousel();startCarousel();}
});
document.addEventListener("change",async e=>{
  if(e.target.matches("[data-role]"))try{await F.httpsCallable(F.functions,"setUserRole")({uid:e.target.dataset.role,role:e.target.value});toast("Роль изменена");await renderAdmin();}catch(err){toast("Не удалось изменить роль. Проверьте Cloud Function и права администратора.");}
});
document.querySelectorAll("[data-filter]").forEach(b=>b.onclick=()=>draw(b.dataset.filter));
$("#carouselPrev").onclick=()=>{moveCarousel(-1);startCarousel();};
$("#carouselNext").onclick=()=>{moveCarousel(1);startCarousel();};
$("#productCarousel").addEventListener("mouseenter",stopCarousel);
$("#productCarousel").addEventListener("mouseleave",startCarousel);
$("#cartBtn").onclick=()=>{$("#cart").classList.remove("hidden");drawCart();};
$("#closeCart").onclick=()=>$("#cart").classList.add("hidden");
$("#closeAdmin").onclick=()=>$("#admin").classList.add("hidden");
$("#checkout").onclick=order;$("#request").onsubmit=request;$("#login").onclick=signIn;
draw();drawCart();startCarousel();loadProducts();
if(F.ready)F.onAuthStateChanged(F.auth,async u=>{user=u;if(u){await ensureUser(u);}else{profile=null;}authUi();});
