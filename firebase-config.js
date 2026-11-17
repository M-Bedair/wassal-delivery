// استيراد مكتبات Firebase الرسمية للعمل مباشرة في المتصفح (CDN)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// بيانات مشروعك الخاصة (wassal-delivery-a8b12)
const firebaseConfig = {
  apiKey: "AIzaSyBNHZ7_VMRNstGyHNl3pjVl9ypr1y3dROU",
  authDomain: "wassal-delivery-a8b12.firebaseapp.com",
  projectId: "wassal-delivery-a8b12",
  storageBucket: "wassal-delivery-a8b12.firebasestorage.app",
  messagingSenderId: "456649696289",
  appId: "1:456649696289:web:89aeaf7ac1a234a6c66f60",
  measurementId: "G-B974E837D6"
};

// تهيئة التطبيق وقاعدة البيانات السحابية
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export {
  db,
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy
};