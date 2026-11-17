import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, set, onValue } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
    projectId: "wassal-delivery-a8b12",
    databaseURL: "https://wassal-delivery-a8b12-default-rtdb.firebaseio.com",
    authDomain: "wassal-delivery-a8b12.firebaseapp.com"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export const stateRef = ref(db, 'wassal_modern_ops_v2');
export const connectedRef = ref(db, '.info/connected');
export { set, onValue };