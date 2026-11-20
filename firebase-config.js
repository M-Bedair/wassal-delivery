import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
    getAuth,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    getFirestore,
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    deleteDoc,
    onSnapshot,
    writeBatch,
    runTransaction,
    enableIndexedDbPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyBNHZ7_VMRNstGyHNl3pjVl9ypr1y3dROU",
    authDomain: "wassal-delivery-a8b12.firebaseapp.com",
    projectId: "wassal-delivery-a8b12",
    storageBucket: "wassal-delivery-a8b12.appspot.com",
    messagingSenderId: "456649696289",
    appId: "1:456649696289:web:89aeaf7ac1a234a6c66f60"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// تطبيق ثانوي لإنشاء حسابات الموظفين دون تسجيل خروج المدير الحالي
const secondaryApp = initializeApp(firebaseConfig, "SecondaryStaffCreator");
const secondaryAuth = getAuth(secondaryApp);

enableIndexedDbPersistence(db).catch((err) => {
    console.warn("Firestore persistence:", err.code);
});

export {
    auth,
    secondaryAuth,
    db,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    deleteDoc,
    onSnapshot,
    writeBatch,
    runTransaction
};