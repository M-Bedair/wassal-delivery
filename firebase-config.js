import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
    getFirestore,
    collection,
    doc,
    setDoc,
    deleteDoc,
    onSnapshot,
    writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
    projectId: "wassal-delivery-a8b12",
    authDomain: "wassal-delivery-a8b12.firebaseapp.com"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export {
    db,
    collection,
    doc,
    setDoc,
    deleteDoc,
    onSnapshot,
    writeBatch
};