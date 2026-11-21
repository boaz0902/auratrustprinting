import { adminEmail, firebaseConfig } from "./config.js";

const firebaseVersion = "10.12.2";
const firebaseBase = `https://www.gstatic.com/firebasejs/${firebaseVersion}`;
let sdkPromise;
let app;
let auth;
let db;
let storage;

export function isFirebaseConfigured() {
  return Object.values(firebaseConfig).every((value) => value && !value.startsWith("YOUR_"));
}

export function isAdminEmailConfigured() {
  return Boolean(adminEmail && !adminEmail.startsWith("YOUR_"));
}

async function getFirebase() {
  if (!isFirebaseConfigured()) {
    throw new Error("Firebase is not configured. Update js/config.js with your Firebase web app settings.");
  }
  if (!sdkPromise) {
    sdkPromise = Promise.all([
      import(`${firebaseBase}/firebase-app.js`),
      import(`${firebaseBase}/firebase-firestore.js`),
      import(`${firebaseBase}/firebase-auth.js`),
      import(`${firebaseBase}/firebase-storage.js`)
    ]).then(([appSdk, firestoreSdk, authSdk, storageSdk]) => ({ appSdk, firestoreSdk, authSdk, storageSdk }));
  }
  const sdk = await sdkPromise;
  if (!app) {
    app = sdk.appSdk.initializeApp(firebaseConfig);
    db = sdk.firestoreSdk.getFirestore(app);
    auth = sdk.authSdk.getAuth(app);
    storage = sdk.storageSdk.getStorage(app);
  }
  return { ...sdk, app, db, auth, storage };
}

export async function getPublicPriceData() {
  const { firestoreSdk, db: database } = await getFirebase();
  const serviceQuery = firestoreSdk.query(
    firestoreSdk.collection(database, "services"),
    firestoreSdk.where("visible", "==", true)
  );
  const [serviceSnapshot, settingsSnapshot] = await Promise.all([
    firestoreSdk.getDocs(serviceQuery),
    firestoreSdk.getDoc(firestoreSdk.doc(database, "settings", "site"))
  ]);
  const services = serviceSnapshot.docs.map((serviceDoc) => ({ id: serviceDoc.id, ...serviceDoc.data() }))
    .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
  const settings = settingsSnapshot.exists() ? settingsSnapshot.data() : {};
  const latestServiceUpdate = services.reduce((latest, service) => {
    const current = service.updatedAt;
    return current && (!latest || current.toMillis() > latest.toMillis()) ? current : latest;
  }, null);
  return { services, lastUpdated: settings.lastUpdated || latestServiceUpdate };
}

export async function observeAuth(onUser, onError) {
  const { auth: authInstance, authSdk } = await getFirebase();
  return authSdk.onAuthStateChanged(authInstance, onUser, onError);
}

export async function signInAdmin(email, password) {
  const { auth: authInstance, authSdk } = await getFirebase();
  return authSdk.signInWithEmailAndPassword(authInstance, email, password);
}

export async function signOutAdmin() {
  const { auth: authInstance, authSdk } = await getFirebase();
  return authSdk.signOut(authInstance);
}

export async function getAllServices() {
  const { firestoreSdk, db: database } = await getFirebase();
  const snapshot = await firestoreSdk.getDocs(firestoreSdk.collection(database, "services"));
  return snapshot.docs.map((serviceDoc) => ({ id: serviceDoc.id, ...serviceDoc.data() }))
    .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
}

export async function saveService(serviceId, service) {
  const { firestoreSdk, db: database } = await getFirebase();
  const batch = firestoreSdk.writeBatch(database);
  const serviceRef = serviceId
    ? firestoreSdk.doc(database, "services", serviceId)
    : firestoreSdk.doc(firestoreSdk.collection(database, "services"));
  batch.set(serviceRef, { ...service, updatedAt: firestoreSdk.serverTimestamp() });
  batch.set(firestoreSdk.doc(database, "settings", "site"), {
    lastUpdated: firestoreSdk.serverTimestamp()
  }, { merge: true });
  await batch.commit();
}

export async function removeService(serviceId) {
  const { firestoreSdk, db: database } = await getFirebase();
  const batch = firestoreSdk.writeBatch(database);
  batch.delete(firestoreSdk.doc(database, "services", serviceId));
  batch.set(firestoreSdk.doc(database, "settings", "site"), {
    lastUpdated: firestoreSdk.serverTimestamp()
  }, { merge: true });
  await batch.commit();
}

export async function ensureAnonymousCustomer() {
  const { auth: authInstance, authSdk } = await getFirebase();
  if (authInstance.currentUser?.isAnonymous) return authInstance.currentUser;
  if (!authInstance.currentUser) {
    await authSdk.signInAnonymously(authInstance);
  } else if (authInstance.currentUser) {
    await authSdk.signOut(authInstance);
    await authSdk.signInAnonymously(authInstance);
  }
  if (authInstance.currentUser?.isAnonymous) return authInstance.currentUser;
  throw new Error("A customer session could not be created.");
}

export async function uploadOrderFile(orderId, file, onProgress) {
  const { auth: authInstance, storage: storageInstance, storageSdk } = await getFirebase();
  if (!authInstance.currentUser?.isAnonymous) throw new Error("Please wait for the secure upload session.");
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `orders/${orderId}/${Date.now()}_${safeName}`;
  const extension = file.name.split(".").pop().toLowerCase();
  const typeByExtension = {
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    txt: "text/plain"
  };
  const contentType = typeByExtension[extension] || file.type || "application/octet-stream";
  const task = storageSdk.uploadBytesResumable(storageSdk.ref(storageInstance, path), file, {
    contentType,
    customMetadata: { originalName: file.name }
  });
  await new Promise((resolve, reject) => {
    task.on("state_changed",
      (snapshot) => onProgress?.(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)),
      reject,
      resolve
    );
  });
  return { path, fileName: file.name, fileType: file.type || "application/octet-stream", size: file.size };
}

export async function createCustomerOrder(order) {
  const { auth: authInstance, firestoreSdk, db: database } = await getFirebase();
  if (!authInstance.currentUser?.isAnonymous) throw new Error("A secure customer session is required.");
  const orderRef = firestoreSdk.doc(firestoreSdk.collection(database, "orders"));
  const orderNumber = `AT-${Date.now().toString().slice(-8)}-${orderRef.id.slice(0, 4).toUpperCase()}`;
  await firestoreSdk.setDoc(orderRef, {
    ...order,
    orderNumber,
    ownerUid: authInstance.currentUser.uid,
    status: "Received",
    createdAt: firestoreSdk.serverTimestamp(),
    termsAccepted: order.termsAccepted === true,
    termsAcceptedAt: firestoreSdk.serverTimestamp()
  });
  return { id: orderRef.id, orderNumber };
}

export async function trackCustomerOrder(orderNumber, mobile) {
  await ensureAnonymousCustomer();
  const { firestoreSdk, db: database, auth: authInstance } = await getFirebase();
  const normalizedMobile = mobile.replace(/\D/g, "");
  const snapshot = await firestoreSdk.getDocs(firestoreSdk.query(
    firestoreSdk.collection(database, "orders"),
    firestoreSdk.where("ownerUid", "==", authInstance.currentUser.uid),
    firestoreSdk.where("orderNumber", "==", orderNumber.trim())
  ));
  const match = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
    .find((order) => String(order.mobile || "").replace(/\D/g, "") === normalizedMobile);
  if (!match) throw new Error("No matching order was found. Check the order number and mobile number.");
  return match;
}

export async function observeAllOrders(onOrders, onError) {
  const { firestoreSdk, db: database } = await getFirebase();
  const q = firestoreSdk.query(firestoreSdk.collection(database, "orders"), firestoreSdk.orderBy("createdAt", "desc"));
  return firestoreSdk.onSnapshot(q, (snapshot) => {
    onOrders(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
  }, onError);
}

export async function updateOrderStatus(orderId, status, paymentVerified = null) {
  const { firestoreSdk, db: database } = await getFirebase();
  const changes = { status };
  if (paymentVerified !== null) changes.paymentVerified = paymentVerified;
  await firestoreSdk.updateDoc(firestoreSdk.doc(database, "orders", orderId), changes);
}

export async function getDownloadUrl(path) {
  const { storage: storageInstance, storageSdk } = await getFirebase();
  return storageSdk.getDownloadURL(storageSdk.ref(storageInstance, path));
}

