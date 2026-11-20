import {
    auth,
    db,
    signInWithEmailAndPassword,
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
} from './firebase-config.js';

let unsubscribers = [];
let currentUser = null;
let currentUserRole = 'operator'; // 'admin' or 'operator'

// ==================== SECURITY & XSS SANITIZATION ====================
function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function isAdmin() {
    return currentUserRole === 'admin';
}

function applyRolePermissionsUI() {
    const roleBadge = document.getElementById('current-user-role-badge');
    const emailEl = document.getElementById('current-user-email');
    if (emailEl && currentUser) emailEl.textContent = currentUser.email || '';
    if (roleBadge) {
        if (isAdmin()) {
            roleBadge.textContent = '👑 مدير النظام (Admin)';
            roleBadge.className = 'inline-block mt-0.5 px-2 py-0.5 rounded bg-wassalOrange/20 text-wassalOrange text-[10px] font-black';
        } else {
            roleBadge.textContent = '🎧 موظف عمليات (Operator)';
            roleBadge.className = 'inline-block mt-0.5 px-2 py-0.5 rounded bg-statusOnway/20 text-statusOnway text-[10px] font-black';
        }
    }

    document.querySelectorAll('.admin-only-control').forEach(el => {
        if (isAdmin()) {
            el.classList.remove('hidden');
        } else {
            el.classList.add('hidden');
        }
    });
}

// ==================== DATE & TIME HELPERS ====================
function getSystemTodayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }  function getActiveShiftDate() { return appState.activeDate \vert{}\vert{} getSystemTodayStr(); }  function getNextDateStr(dateStr) { const [y, m, d] = dateStr.split('-').map(Number); const dt = new Date(y, m - 1, d + 1); return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function getCurrentMonthStr() {
    return getActiveShiftDate().slice(0, 7);
}

function formatTime12(ts) {
    if (!ts) return '--:--';
    const d = new Date(ts);
    let h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, '0');
    const ampm = h >= 12 ? 'م' : 'ص';
    h = h % 12 || 12;
    return `${h}:${m} ${ampm}`; }  // ==================== APPLICATION STATE ==================== let appState = { activeDate: getSystemTodayStr(), closedDays: [], riders: [], stores: [], orders: [], expenses: [], users: [], nextOrderNum: 101 };  let uiState = { activeTab: 'operations', viewMode: 'kanban', statusFilter: 'all', riderFilter: 'all', selectedOrderId: null, selectedRiderStatsId: null, riderStatsPeriod: 'today', archiveDateFilter: getSystemTodayStr(), reportMonth: getSystemTodayStr().slice(0, 7), expenseCatFilter: 'all' };  function setSyncStatus(status) { const configs = { connecting: { text: 'جاري الاتصال بـ Firestore...', dot: 'bg-wassalAmber animate-pulse', txt: 'text-wassalAmber' }, online: { text: 'متصل ومؤمّن بـ Firestore', dot: 'bg-statusDone', txt: 'text-statusDone' }, pending: { text: 'محفوظ محلياً (جاري الرفع للسيرفر...)', dot: 'bg-statusOnway animate-pulse', txt: 'text-statusOnway' }, offline: { text: 'وضع عدم الاتصال (مخزن في الطابور)', dot: 'bg-wassalOrange', txt: 'text-wassalOrange' } }; const cfg = configs[status] \vert{}\vert{} configs.connecting; ['desktop', 'mobile'].forEach(prefix => { const dotEl = document.getElementById(`${prefix}-sync-dot`);
        const txtEl = document.getElementById(`${prefix}-sync-text`); if (dotEl && txtEl) { dotEl.className = `w-2 h-2 rounded-full ${cfg.dot}`;
            txtEl.className = `text-[11px] font-black tracking-wide ${cfg.txt}`;
            txtEl.textContent = cfg.text;
        }
    });
}

function isOrderActiveInRoom(o) {
    return o.status === 'received' || o.status === 'onway' || o.status === 'delivered' || o.status === 'returning';
}

function isOrderArchived(o) {
    return o.status === 'settled' || o.status === 'returned';
}

function isOrderSuccessfullySettled(o) {
    return o.status === 'settled';
}

function syncRidersAvailability() {
    const busyRiderIds = new Set(
        appState.orders
            .filter(o => isOrderActiveInRoom(o))
            .map(o => o.riderId)
    );
    appState.riders.forEach(r => {
        if (busyRiderIds.has(r.id)) {
            r.status = 'busy';
        } else if (r.status === 'busy') {
            r.status = 'available';
        }
    });
}

// ==================== FIRESTORE RELIABLE WRITE & CHUNKED BATCH ====================
async function fsSaveDoc(colName, docId, dataObj) {
    try {
        await setDoc(doc(db, colName, String(docId)), { ...dataObj }, { merge: true });
        return true;
    } catch (err) {
        console.error(`Firestore write rejected (${colName}/${docId}):`, err); showToast(`⚠️ فشل الحفظ على السيرفر: ${err.message}`);
        return false;
    }
}

async function fsDeleteDoc(colName, docId) {
    if (!isAdmin()) {
        showToast('⛔ هذه العملية متاحة للمدير (Admin) فقط');
        return false;
    }
    try {
        await deleteDoc(doc(db, colName, String(docId)));
        return true;
    } catch (err) {
        console.error(`Firestore delete rejected (${colName}/${docId}):`, err);
        showToast(`⚠️ رفض السيرفر عملية الحذف: ${err.message}`); return false; } }  async function fsSaveMeta() { try { await setDoc(doc(db, 'wassal_meta', 'config'), { activeDate: appState.activeDate, nextOrderNum: appState.nextOrderNum, closedDays: appState.closedDays }, { merge: true }); return true; } catch (err) { console.error('Firestore meta save error:', err); showToast(`⚠️ تعذر تحديث إعدادات اليومية: ${err.message}`);
        return false;
    }
}

// Atomic Transaction for creating orders with zero ID collision across devices
async function createOrderAtomically(orderPayloadWithoutId) {
    const metaRef = doc(db, 'wassal_meta', 'config');
    return await runTransaction(db, async (transaction) => {
        const metaSnap = await transaction.get(metaRef);
        let currentNum = 101;
        let currentActiveDate = getSystemTodayStr();
        let closedDays = [];

        if (metaSnap.exists()) {
            const d = metaSnap.data();
            currentNum = typeof d.nextOrderNum === 'number' ? d.nextOrderNum : 101;
            currentActiveDate = d.activeDate || currentActiveDate;
            closedDays = Array.isArray(d.closedDays) ? d.closedDays : [];
        }

        const newOrderId = `W-${currentNum}`; const fullOrder = { ...orderPayloadWithoutId, id: newOrderId };  const orderRef = doc(db, 'wassal_orders', newOrderId); transaction.set(orderRef, fullOrder); transaction.set(metaRef, { activeDate: currentActiveDate, nextOrderNum: currentNum + 1, closedDays }, { merge: true });  return fullOrder; }); }  // Chunked Batch Executor (400 ops per chunk to stay safely under Firestore's 500 limit) async function commitOperationsInChunks(operations) { const CHUNK_SIZE = 400; for (let i = 0; i < operations.length; i += CHUNK_SIZE) { const chunk = operations.slice(i, i + CHUNK_SIZE); const batch = writeBatch(db); chunk.forEach(op => { if (op.type === 'set') { batch.set(op.ref, op.data); } else if (op.type === 'delete') { batch.delete(op.ref); } }); await batch.commit(); } }  async function resetAllDataSafely() { if (!isAdmin()) { showToast('⛔ تصفير النظام متاح للمدير (Admin) فقط'); return; } const confirmed = window.confirm('⚠️ تحذير نهائي: سيتم مسح جميع الطلبات والمناديب والمتاجر والحسابات من Firestore نهائياً!\n\nهل أنت متأكد من المتابعة؟'); if (!confirmed) return;  try { showToast('⏳ جاري مسح البيانات على دفعات آمنة...'); const colsToClear = ['wassal_orders', 'wassal_riders', 'wassal_stores', 'wassal_expenses']; const ops = [];  for (const colName of colsToClear) { const snap = await getDocs(collection(db, colName)); snap.forEach(d => { ops.push({ type: 'delete', ref: doc(db, colName, d.id) }); }); }  const sysToday = getSystemTodayStr(); ops.push({ type: 'set', ref: doc(db, 'wassal_meta', 'config'), data: { activeDate: sysToday, nextOrderNum: 101, closedDays: [] } });  await commitOperationsInChunks(ops);  uiState.riderFilter = 'all'; uiState.statusFilter = 'all'; uiState.archiveDateFilter = sysToday; uiState.reportMonth = sysToday.slice(0, 7); const monthPicker = document.getElementById('report-month-picker'); if (monthPicker) monthPicker.value = uiState.reportMonth;  const secModal = document.getElementById('modal-security'); if (secModal) { secModal.classList.add('hidden'); secModal.classList.remove('flex'); } showToast('✅ تم تصفير جميع البيانات في Firestore بنجاح'); } catch (err) { console.error('Chunked reset error:', err); showToast(`⚠️ خطأ أثناء التصفير: ${err.message}`);
    }
}

// ==================== AUTHENTICATION & ROLE INITIALIZATION ====================
function cleanupListeners() {
    unsubscribers.forEach(unsub => {
        try { unsub(); } catch (e) {}
    });
    unsubscribers = [];
}

async function ensureUserRoleProfile(user) {
    const userRef = doc(db, 'wassal_users', user.uid);
    const snap = await getDoc(userRef);
    if (snap.exists()) {
        currentUserRole = snap.data().role || 'operator';
    } else {
        // First ever user in system becomes admin; subsequent users default to operator
        const allUsersSnap = await getDocs(collection(db, 'wassal_users'));
        const assignedRole = allUsersSnap.empty ? 'admin' : 'operator';
        await setDoc(userRef, {
            uid: user.uid,
            email: user.email,
            role: assignedRole,
            createdAt: Date.now()
        });
        currentUserRole = assignedRole;
    }
    applyRolePermissionsUI();
}

function startFirestoreListeners() {
    cleanupListeners();
    setSyncStatus('connecting');

    // 1. Meta Config
    unsubscribers.push(onSnapshot(doc(db, 'wassal_meta', 'config'), (docSnap) => {
        setSyncStatus(docSnap.metadata.hasPendingWrites ? 'pending' : 'online');
        if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.activeDate) appState.activeDate = data.activeDate;
            if (typeof data.nextOrderNum === 'number') appState.nextOrderNum = data.nextOrderNum;
            if (Array.isArray(data.closedDays)) appState.closedDays = data.closedDays;
            if (!uiState.archiveDateFilter) uiState.archiveDateFilter = appState.activeDate;
            renderAll();
        } else {
            fsSaveMeta();
        }
    }, () => setSyncStatus('offline')));

    // 2. Orders Collection
    unsubscribers.push(onSnapshot(collection(db, 'wassal_orders'), (snap) => {
        setSyncStatus(snap.metadata.hasPendingWrites ? 'pending' : 'online');
        const list = [];
        snap.forEach(d => list.push(d.data()));
        list.sort((a, b) => (Number(b.receivedTs) || 0) - (Number(a.receivedTs) || 0));
        appState.orders = list;
        syncRidersAvailability();
        renderAll();
    }, () => setSyncStatus('offline')));

    // 3. Riders Collection
    unsubscribers.push(onSnapshot(collection(db, 'wassal_riders'), (snap) => {
        const list = [];
        snap.forEach(d => list.push(d.data()));
        appState.riders = list;
        syncRidersAvailability();
        renderAll();
    }));

    // 4. Stores Collection
    unsubscribers.push(onSnapshot(collection(db, 'wassal_stores'), (snap) => {
        const list = [];
        snap.forEach(d => list.push(d.data()));
        appState.stores = list;
        renderAll();
    }));

    // 5. Expenses Collection
    unsubscribers.push(onSnapshot(collection(db, 'wassal_expenses'), (snap) => {
        const list = [];
        snap.forEach(d => list.push(d.data()));
        list.sort((a, b) => (b.dateStr || '').localeCompare(a.dateStr || ''));
        appState.expenses = list;
        renderAll();
    }));

    // 6. Users Roles Collection
    unsubscribers.push(onSnapshot(collection(db, 'wassal_users'), (snap) => {
        const list = [];
        snap.forEach(d => list.push(d.data()));
        appState.users = list;
        if (currentUser) {
            const me = list.find(u => u.uid === currentUser.uid);
            if (me && me.role !== currentUserRole) {
                currentUserRole = me.role;
                applyRolePermissionsUI();
                renderAll();
            }
        }
        renderUsersRolesList();
    }));
}

onAuthStateChanged(auth, async (user) => {
    const lockScreen = document.getElementById('auth-lock-screen');
    const appShell = document.getElementById('app-protected-shell');

    if (user) {
        currentUser = user;
        await ensureUserRoleProfile(user);
        if (lockScreen) lockScreen.classList.add('hidden');
        if (appShell) appShell.classList.remove('hidden');
        startFirestoreListeners();
    } else {
        currentUser = null;
        cleanupListeners();
        if (appShell) appShell.classList.add('hidden');
        if (lockScreen) lockScreen.classList.remove('hidden');
    }
});

window.addEventListener('offline', () => setSyncStatus('offline'));

// ==================== HELPERS & ANALYTICS ====================
function getStore(id) {
    return appState.stores.find(s => s.id === id) || { name: 'متجر', category: 'مطعم', fee: 25, phone: '', address: '' };
}

function getRider(id) {
    return appState.riders.find(r => r.id === id) || { name: 'مندوب', bike: '', plate: '', phone: '', status: 'available' };
}

function getOrderDurations(order) {
    const now = Date.now();
    const rTs = Number(order.receivedTs) || now;
    const dTs = order.departedTs ? Number(order.departedTs) : null;
    const delTs = order.deliveredTs ? Number(order.deliveredTs) : null;
    const setTs = order.settledTs ? Number(order.settledTs) : null;

    const endTs = setTs || delTs || now;
    const totalMins = Math.max(0, Math.round((endTs - rTs) / 60000));
    const deliveryMins = delTs ? Math.max(0, Math.round((delTs - rTs) / 60000)) : Math.max(0, Math.round((now - rTs) / 60000));
    const waitMins = dTs ? Math.max(0, Math.round((dTs - rTs) / 60000)) : null;
    const roadMins = (dTs && delTs) ? Math.max(0, Math.round((delTs - dTs) / 60000)) : null;

    return { totalMins, deliveryMins, waitMins, roadMins };
}

function getAnalyticsSummary(targetMonth) {
    const today = getActiveShiftDate();
    const month = targetMonth || today.slice(0, 7);

    const todayOrders = appState.orders.filter(o => o.dateStr === today);
    const monthOrders = appState.orders.filter(o => (o.dateStr || '').startsWith(month));

    const todaySettledOrders = todayOrders.filter(o => isOrderSuccessfullySettled(o));
    const monthSettledOrders = monthOrders.filter(o => isOrderSuccessfullySettled(o));
    const todayReturnedOrders = todayOrders.filter(o => o.status === 'returned' || o.status === 'returning');
    const monthReturnedOrders = monthOrders.filter(o => o.status === 'returned' || o.status === 'returning');

    const todayArchived = todayOrders.filter(o => isOrderArchived(o));
    const monthArchived = monthOrders.filter(o => isOrderArchived(o));

    const todayRev = todayArchived.reduce((s, o) => s + Number(o.fee), 0);
    const todaySettled = todaySettledOrders.reduce((s, o) => s + Number(o.amount), 0);
    const todayExp = appState.expenses.filter(e => e.dateStr === today).reduce((s, e) => s + Number(e.amount), 0);
    const todayProfit = todayRev - todayExp;

    const monthRev = monthArchived.reduce((s, o) => s + Number(o.fee), 0);
    const monthSettled = monthSettledOrders.reduce((s, o) => s + Number(o.amount), 0);
    const monthExpensesList = appState.expenses.filter(e => (e.dateStr || '').startsWith(month));
    const monthExp = monthExpensesList.reduce((s, e) => s + Number(e.amount), 0);
    const monthProfit = monthRev - monthExp;

    const storeStats = appState.stores.map(s => {
        const sToday = todayOrders.filter(o => o.storeId === s.id);
        const sMonth = monthOrders.filter(o => o.storeId === s.id);
        const sMonthSuccess = sMonth.filter(o => isOrderSuccessfullySettled(o));
        const sMonthArchived = sMonth.filter(o => isOrderArchived(o));
        const settledMonth = sMonthSuccess.reduce((sum, o) => sum + Number(o.amount), 0);
        const feeMonth = sMonthArchived.reduce((sum, o) => sum + Number(o.fee), 0);
        const sharePct = monthOrders.length > 0 ? Math.round((sMonth.length / monthOrders.length) * 100) : 0;
        return { store: s, todayCount: sToday.length, monthCount: sMonth.length, settledMonth, feeMonth, sharePct };
    }).sort((a, b) => b.monthCount - a.monthCount || b.todayCount - a.todayCount);

    const riderStats = appState.riders.map(r => {
        const rToday = todayOrders.filter(o => o.riderId === r.id);
        const rMonth = monthOrders.filter(o => o.riderId === r.id);
        const rAll = appState.orders.filter(o => o.riderId === r.id);
        const rMonthSuccess = rMonth.filter(o => isOrderSuccessfullySettled(o));
        const rMonthArchived = rMonth.filter(o => isOrderArchived(o));
        const rAllDone = rAll.filter(o => o.status === 'delivered' || isOrderSuccessfullySettled(o));

        const settledMonth = rMonthSuccess.reduce((sum, o) => sum + Number(o.amount), 0);
        const feeMonth = rMonthArchived.reduce((sum, o) => sum + Number(o.fee), 0);
        const avgMins = rAllDone.length > 0
            ? Math.round(rAllDone.reduce((sum, o) => sum + getOrderDurations(o).deliveryMins, 0) / rAllDone.length)
            : null;

        return { rider: r, todayCount: rToday.length, monthCount: rMonth.length, settledMonth, feeMonth, avgMins };
    }).sort((a, b) => b.monthCount - a.monthCount || b.todayCount - a.todayCount);

    return { today, month, todayOrders, monthOrders, todaySettledOrders, monthSettledOrders, todayReturnedOrders, monthReturnedOrders, todayRev, todaySettled, todayExp, todayProfit, monthRev, monthSettled, monthExpensesList, monthExp, monthProfit, storeStats, riderStats };
}

function buildWhatsAppMessage(o) {
    const st = getStore(o.storeId);
    const rd = getRider(o.riderId);
    const { deliveryMins } = getOrderDurations(o);

    const statusArabic = {
        received: '🟡 تم الاستلام من المتجر',
        onway: '🔵 في الطريق للعميل',
        delivered: '🟢 تم التسليم للعميل (جاري التوريد)',
        settled: '✅ تم التوريد للمتجر والعودة للمكتب',
        returning: `🔴 مرتجع (جاري إعادته للمتجر) — السبب: ${o.returnReason \vert{}\vert{} 'لم يستلم'}`, returned: `↩️ مرتجع (تمت إعادته للمتجر) — السبب: ${o.returnReason || 'لم يستلم'}`
    };

    return [
        `🟠 *تحديث أوردر وصّل - WASSAL*`,
        `• رقم الطلب: *#${o.id}* (${o.dateStr || getActiveShiftDate()})`,
        `• الحالة: *${statusArabic[o.status] \vert{}\vert{} o.status}*`, `• المتجر: ${st.name} (${st.category})`, `• المندوب: ${rd.name} (${rd.plate})`, `• العميل: ${o.customerName} (${o.phone})`, `• العنوان: ${o.address}`,
        o.items ? `• الأصناف: ${o.items}` : null, `• وقت الاستلام: ${formatTime12(o.receivedTs)}`,
        o.departedTs ? `• وقت التحرك: ${formatTime12(o.departedTs)}` : null, o.deliveredTs ? `• وقت التسليم: ${formatTime12(o.deliveredTs)} (مدة التوصيل: ${deliveryMins} دقيقة)` : null, o.settledTs ? `• وقت الإغلاق والعودة: ${formatTime12(o.settledTs)}` : null,
        (o.status === 'returning' || o.status === 'returned')
            ? `• رسوم التوصيل للمرتجع: *${o.fee} ج.م*` : `• المطلوب تحصيله: *${Number(o.amount) + Number(o.fee)} ج.م*`,
        `_وصّل .. هتشوف الفرق_`
    ].filter(Boolean).join('\n');
}

function copyToClipboardSafe(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).catch(() => {});
        return;
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
}

function showToast(msg) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const el = document.createElement('div');
    el.className = 'pointer-events-auto glass-panel border border-wassalOrange/60 text-white px-4 py-3 rounded-2xl shadow-2xl text-xs font-extrabold flex items-center gap-2.5 transition-all duration-300';
    el.innerHTML = `<span class="w-2.5 h-2.5 rounded-full wassal-grad shrink-0"></span><span>${escapeHTML(msg)}</span>`;
    container.appendChild(el);
    setTimeout(() => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(8px)';
        setTimeout(() => el.remove(), 300);
    }, 3400);
}

// ==================== DYNAMIC ORDER ITEMS HELPERS ====================
function addOrderItemRow(nameVal = '', priceVal = '') {
    const list = document.getElementById('order-items-list');
    if (!list) return;

    const row = document.createElement('div');
    row.className = 'order-item-row flex items-center gap-2';
    row.innerHTML = `
        <input type="text" value="${escapeHTML(nameVal)}" class="item-name flex-1 bg-slateDark border border-slateBorder rounded-xl px-3 py-2 text-white focus:outline-none focus:border-wassalOrange" required placeholder="اسم الصنف التالي">
        <input type="number" value="${escapeHTML(priceVal)}" class="item-price w-24 bg-slateDark border border-slateBorder rounded-xl px-2.5 py-2 text-white focus:outline-none focus:border-wassalOrange" min="0" required placeholder="السعر">
        <button type="button" data-action="remove-order-item-row" title="حذف الصنف" class="w-9 h-9 rounded-xl bg-red-500/15 hover:bg-red-500 text-red-400 hover:text-white border border-red-500/40 font-black text-sm flex items-center justify-center shrink-0">✕</button>
    `;
    list.appendChild(row);
    recalcOrderItemsTotal();
}

function resetOrderItemsRows() {
    const list = document.getElementById('order-items-list');
    if (!list) return;
    list.innerHTML = `
        <div class="order-item-row flex items-center gap-2">
            <input type="text" class="item-name flex-1 bg-slateDark border border-slateBorder rounded-xl px-3 py-2 text-white focus:outline-none focus:border-wassalOrange" required placeholder="اسم الصنف (مثال: 2 وجبة شيش طاووق)">
            <input type="number" class="item-price w-24 bg-slateDark border border-slateBorder rounded-xl px-2.5 py-2 text-white focus:outline-none focus:border-wassalOrange" min="0" required placeholder="السعر">
            <button type="button" data-action="add-order-item-row" title="إضافة صنف آخر" class="w-9 h-9 rounded-xl wassal-grad text-obsidian font-black text-base flex items-center justify-center shrink-0">+</button>
        </div>
    `;
    const amtInput = document.getElementById('input-order-amount');
    if (amtInput) amtInput.value = '';
}

function recalcOrderItemsTotal() {
    const prices = document.querySelectorAll('#order-items-list .item-price');
    let sum = 0;
    let hasAnyPrice = false;
    prices.forEach(inp => {
        if (inp.value !== '') hasAnyPrice = true;
        sum += Number(inp.value) || 0;
    });
    const amtInput = document.getElementById('input-order-amount');
    if (amtInput && hasAnyPrice) {
        amtInput.value = sum;
    }
}

function collectOrderItemsText() {
    const rows = document.querySelectorAll('#order-items-list .order-item-row');
    const parts = [];
    let computedTotal = 0;

    rows.forEach(row => {
        const name = (row.querySelector('.item-name')?.value || '').trim();
        const price = Number(row.querySelector('.item-price')?.value) || 0;
        if (name) {
            parts.push(`${name} (${price} ج.م)`);
            computedTotal += price;
        }
    });

    return {
        itemsText: parts.join(' + '),
        computedTotal
    };
}

// ==================== RENDERING ====================
function renderUsersRolesList() {
    const container = document.getElementById('users-roles-list');
    if (!container) return;
    if (appState.users.length === 0) {
        container.innerHTML = `<div class="text-slate-400">لا يوجد مستخدمون مسجلون بعد.</div>`;
        return;
    }
    container.innerHTML = appState.users.map(u => {
        const isMe = currentUser && u.uid === currentUser.uid;
        return `
            <div class="flex items-center justify-between bg-slateDark border border-slateBorder rounded-lg px-3 py-2">
                <div class="truncate">
                    <div class="font-bold text-white truncate" dir="ltr">${escapeHTML(u.email)}${isMe ? '(أنت)' : ''}</div>
                    <div class="text-[10px] ${u.role === 'admin' ? 'text-wassalOrange' : 'text-statusOnway'} font-black">${u.role === 'admin' ? '👑 مدير (صلاحية كاملة)' : '🎧 عمليات (بدون حذف أو تعديل مالي)'}</div>
                </div>
                ${!isMe && isAdmin() ? `
                    <button type="button" data-action="toggle-user-role" data-id="${escapeHTML(u.uid)}" class="px-2.5 py-1 rounded bg-slateCard hover:bg-wassalOrange text-slate-200 hover:text-obsidian font-black text-[10px] shrink-0">
                        تبديل إلى ${u.role === 'admin' ? 'عمليات' : 'مدير'}
                    </button>
                ` : ''}
            </div>
        `;
    }).join('');
}

function renderKPIs() {
    const activeD = getActiveShiftDate();
    const currentStats = getAnalyticsSummary(activeD.slice(0, 7));

    const sideDay = document.getElementById('sidebar-active-day');
    const mobDay = document.getElementById('mobile-active-day');
    if (sideDay) sideDay.textContent = activeD;
    if (mobDay) mobDay.textContent = activeD;

    const activeOrdersList = appState.orders.filter(o => isOrderActiveInRoom(o));
    const pickedCount = activeOrdersList.filter(o => o.status === 'received').length;
    const onwayCount = activeOrdersList.filter(o => o.status === 'onway').length;
    const delivWaitCount = activeOrdersList.filter(o => o.status === 'delivered' || o.status === 'returning').length;
    const activeTotal = activeOrdersList.length;
    const archivedTotalCount = appState.orders.filter(o => isOrderArchived(o)).length;

    const totalRidersCount = appState.riders.length;
    const availRiders = appState.riders.filter(r => r.status === 'available').length;
    const busyRiders = appState.riders.filter(r => r.status === 'busy').length;

    document.getElementById('kpi-today-orders').textContent = currentStats.todayOrders.length;
    document.getElementById('kpi-month-orders').textContent = currentStats.monthOrders.length;
    document.getElementById('kpi-delivered-sub').textContent = `${currentStats.todaySettledOrders.length} (مرتجع: ${currentStats.todayReturnedOrders.length})`; document.getElementById('kpi-total').textContent = appState.orders.length;  document.getElementById('kpi-active').textContent = activeTotal; document.getElementById('kpi-picked-count').textContent = `${pickedCount} استلام`;
    document.getElementById('kpi-onway-count').textContent = `${onwayCount} طريق`; const delivWaitEl = document.getElementById('kpi-deliv-wait-count'); if (delivWaitEl) delivWaitEl.textContent = `${delivWaitCount} توريد/مرتجع`;

    const topM = currentStats.storeStats[0];
    if (topM && topM.monthCount > 0) {
        document.getElementById('kpi-top-merchant-name').textContent = topM.store.name;
        document.getElementById('kpi-top-merchant-count').textContent = `${topM.monthCount} أوردر (${topM.todayCount} اليوم)`;
        document.getElementById('kpi-top-merchant-share').textContent = `${topM.sharePct}\%`; } else { document.getElementById('kpi-top-merchant-name').textContent = '—'; document.getElementById('kpi-top-merchant-count').textContent = '0 أوردر'; document.getElementById('kpi-top-merchant-share').textContent = '0\%'; }  document.getElementById('kpi-riders-avail').textContent = availRiders; const kpiRidersTotalEl = document.getElementById('kpi-riders-total'); if (kpiRidersTotalEl) kpiRidersTotalEl.textContent = ` / ${totalRidersCount}`;

    const topR = currentStats.riderStats[0];
    document.getElementById('kpi-top-rider-mini').textContent = (topR && topR.monthCount > 0) ? `${topR.rider.name} (${topR.monthCount})` : '—';

    document.getElementById('kpi-today-profit').textContent = currentStats.todayProfit.toLocaleString('ar-EG');
    document.getElementById('kpi-revenue').textContent = currentStats.todayRev.toLocaleString('ar-EG');
    document.getElementById('kpi-today-expense').textContent = currentStats.todayExp.toLocaleString('ar-EG');

    document.getElementById('nav-badge-active').textContent = activeTotal;
    const settledBadge = document.getElementById('nav-badge-settled');
    if (settledBadge) settledBadge.textContent = archivedTotalCount;
    const navLabelRiders = document.getElementById('nav-label-riders');
    if (navLabelRiders) navLabelRiders.textContent = `المناديب والموتوسيكلات (${totalRidersCount})`; document.getElementById('nav-badge-riders').textContent = `${availRiders}/${totalRidersCount}`; document.getElementById('nav-badge-stores').textContent = appState.stores.length; const profitSign = currentStats.todayProfit >= 0 ? '+' : ''; document.getElementById('nav-badge-profit').textContent = `${profitSign}${currentStats.todayProfit} ج.م`;  const pct = totalRidersCount > 0 ? Math.round((availRiders / totalRidersCount) * 100) : 0; const sidebarFleetTitle = document.getElementById('sidebar-fleet-title'); if (sidebarFleetTitle) sidebarFleetTitle.textContent = `جاهزية الأسطول (${totalRidersCount})`;
    document.getElementById('sidebar-fleet-pct').textContent = `${pct}\%`; document.getElementById('sidebar-fleet-bar').style.width = `${pct}%`;
    document.getElementById('sidebar-office-txt').textContent = `● ${availRiders} بالمكتب`; document.getElementById('sidebar-busy-txt').textContent = `● ${busyRiders} في مهمة`;
}

function renderFleetRibbon() {
    const container = document.getElementById('fleet-ribbon-list');
    const clearBtn = document.getElementById('clear-rider-pill-btn');
    if (uiState.riderFilter !== 'all') clearBtn.classList.remove('hidden');
    else clearBtn.classList.add('hidden');

    if (appState.riders.length === 0) {
        container.innerHTML = `<div class="text-xs text-slate-400 py-1 px-2">لا يوجد مناديب مضافين بعد — انتقل إلى تبويب <strong class="text-wassalOrange">المناديب والموتوسيكلات</strong> لإضافة طياريك.</div>`;
        return;
    }

    const today = getActiveShiftDate();
    const month = getCurrentMonthStr();

    container.innerHTML = appState.riders.map(r => {
        const activeOrder = appState.orders.find(o => o.riderId === r.id && isOrderActiveInRoom(o));
        const todayCnt = appState.orders.filter(o => o.riderId === r.id && o.dateStr === today).length;
        const monthCnt = appState.orders.filter(o => o.riderId === r.id && (o.dateStr || '').startsWith(month)).length;
        const isSelected = uiState.riderFilter === r.id;

        let dotClass = 'bg-statusDone';
        let subText = `متاح • ${todayCnt} يوم / ${monthCnt} شهر`; let borderClass = isSelected ? 'border-wassalOrange bg-wassalOrange/15 ring-1 ring-wassalOrange' : 'border-slateBorder bg-slateCard hover:border-slate-500';  if (activeOrder) { const { totalMins } = getOrderDurations(activeOrder); const st = getStore(activeOrder.storeId); if (activeOrder.status === 'returning') { dotClass = 'bg-red-500 animate-pulse'; subText = `مرتجع لـ ${escapeHTML(st.name)} (${totalMins}د)`; } else if (activeOrder.status === 'delivered') { dotClass = 'bg-statusDone animate-pulse'; subText = `توريد لـ ${escapeHTML(st.name)} (${totalMins}د)`; } else if (activeOrder.status === 'onway') { dotClass = 'bg-statusOnway animate-pulse'; subText = `في الطريق (${totalMins}د) • ${todayCnt}ي/${monthCnt}ش`;
            } else {
                dotClass = 'bg-statusPicked';
                subText = `استلام ${escapeHTML(st.name)} (${totalMins}د)`;
            }
        } else if (r.status === 'off') {
            dotClass = 'bg-slate-500';
            subText = `خارج العمل / غير متاح`;
            borderClass = isSelected ? 'border-wassalOrange bg-wassalOrange/15 opacity-75' : 'border-slateBorder bg-obsidian/60 opacity-60 hover:opacity-100';
        }

        return `
            <button type="button" data-action="filter-by-rider-pill" data-id="${escapeHTML(r.id)}" class="shrink-0 flex items-center gap-2.5 px-3 py-2 rounded-xl border ${borderClass} transition-all text-right">
                <span class="w-2.5 h-2.5 rounded-full ${dotClass} shrink-0"></span>
                <div>
                    <div class="text-xs font-black text-white leading-tight">${escapeHTML(r.name)}</div>
                    <div class="text-[10px] text-slate-400 font-bold mt-0.5">${subText}</div>
                </div>
            </button>
        `;
    }).join('');
}

function matchesSearchQuery(o, q) {
    if (!q) return true;
    const st = getStore(o.storeId);
    const rd = getRider(o.riderId);
    const haystack = [
        o.id,
        o.customerName,
        o.address,
        o.items,
        o.phone,
        o.dateStr,
        st.name,
        st.category,
        rd.name,
        rd.plate
    ].filter(Boolean).join(' ').toLowerCase();

    return haystack.includes(q);
}

function getFilteredActiveOrders() {
    const searchEl = document.getElementById('search-input');
    const q = (searchEl ? searchEl.value : '').trim().toLowerCase();

    return appState.orders.filter(o => {
        if (!isOrderActiveInRoom(o)) return false;
        const matchText = matchesSearchQuery(o, q);
        const matchRider = uiState.riderFilter === 'all' || o.riderId === uiState.riderFilter;

        let matchStatus = true;
        if (uiState.statusFilter === 'delivered') {
            matchStatus = (o.status === 'delivered' || o.status === 'returning');
        } else if (uiState.statusFilter === 'overdue') {
            const { totalMins } = getOrderDurations(o);
            matchStatus = (o.status === 'received' || o.status === 'onway') && totalMins > 35;
        } else if (uiState.statusFilter !== 'all') {
            matchStatus = o.status === uiState.statusFilter;
        }

        return matchText && matchRider && matchStatus;
    });
}

function renderOrdersBoardAndTable() {
    const searchEl = document.getElementById('search-input');
    const q = (searchEl ? searchEl.value : '').trim().toLowerCase();
    const filtered = getFilteredActiveOrders();

    const archiveMatches = q
        ? appState.orders.filter(o => isOrderArchived(o) && matchesSearchQuery(o, q))
        : [];

    const colLists = {
        received: filtered.filter(o => o.status === 'received'),
        onway: filtered.filter(o => o.status === 'onway'),
        delivered: filtered.filter(o => o.status === 'delivered' || o.status === 'returning')
    };

    ['received', 'onway', 'delivered'].forEach(stage => {
        const list = colLists[stage];
        document.getElementById(`col-count-${stage}`).textContent = list.length;
        const container = document.getElementById(`col-list-${stage}`);  if (list.length === 0) { const emptyMsg = q ? (archiveMatches.length > 0 ? `لا توجد نتائج مطابقة لـ "${escapeHTML(searchEl.value)}" في الجارية (توجد ${archiveMatches.length} في الأرشيف — اضغط هنا لعرضها)` : `لا توجد نتائج مطابقة لـ "${escapeHTML(searchEl.value)}"`)
                : (stage === 'delivered'
                    ? 'لا توجد طلبات بانتظار التوريد أو إرجاعها للمتجر'
                    : 'لا توجد طلبات جارية في هذه المرحلة');

            if (q && archiveMatches.length > 0) {
                container.innerHTML = `<button type="button" data-action="set-view-mode" data-mode="table" class="w-full h-44 border border-dashed border-wassalOrange/60 bg-wassalOrange/5 hover:bg-wassalOrange/10 rounded-2xl flex items-center justify-center text-wassalOrange font-bold text-xs text-center px-3 transition-colors">${emptyMsg}</button>`;
            } else {
                container.innerHTML = `<div class="h-44 border border-dashed border-slateBorder rounded-2xl flex items-center justify-center text-slate-500 text-xs text-center px-3">${emptyMsg}</div>`;
            }
            return;
        }
        container.innerHTML = list.map(o => buildOrderCard(o)).join('');
    });

    const tbody = document.getElementById('quick-table-body');
    const rowsToRender = filtered.length > 0 ? filtered : archiveMatches;

    if (rowsToRender.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="py-10 text-center text-slate-500">${q ? `لا توجد نتائج مطابقة لبحث "${escapeHTML(searchEl.value)}"` : 'لا توجد طلبات جارية مطابقة'}</td></tr>`;
        return;
    }

    const archiveNoticeRow = (filtered.length === 0 && archiveMatches.length > 0)
        ? `<tr><td colspan="8" class="py-2.5 px-4 bg-wassalOrange/10 text-wassalOrange font-black text-xs text-center">🔎 تم العور على ${archiveMatches.length} طلب في الأرشيف مطابق لبحثك:</td></tr>`
        : '';

    tbody.innerHTML = archiveNoticeRow + rowsToRender.map(o => {
        const st = getStore(o.storeId);
        const rd = getRider(o.riderId);
        const { totalMins } = getOrderDurations(o);
        const isOverdue = o.status !== 'delivered' && o.status !== 'returning' && isOrderActiveInRoom(o) && totalMins > 35;

        const statusPill = o.status === 'received'
            ? `<span class="px-2.5 py-1 rounded-lg bg-statusPicked/15 border border-statusPicked/40 text-statusPicked font-black text-[11px]">1. تم الاستلام • ${totalMins} د</span>`
            : o.status === 'onway'
            ? `<span class="px-2.5 py-1 rounded-lg ${isOverdue ? 'bg-red-500/20 border-red-500 text-red-400 animate-pulse' : 'bg-statusOnway/15 border-statusOnway/40 text-statusOnway'} border font-black text-[11px]">2. في الطريق • ${totalMins} د</span>`
            : o.status === 'returning'
            ? `<span class="px-2.5 py-1 rounded-lg bg-red-500/20 border border-red-500/50 text-red-400 font-black text-[11px]">↩️ مرتجع (${escapeHTML(o.returnReason || '')})</span>`
            : o.status === 'delivered'
            ? `<span class="px-2.5 py-1 rounded-lg bg-statusDone/15 border border-statusDone/40 text-statusDone font-black text-[11px]">3. تم التسليم (توريد)</span>`
            : `<span class="px-2.5 py-1 rounded-lg bg-slateCard border border-slateBorder text-slate-300 font-black text-[11px]">✓ بالأرشيف</span>`;

        const quickAction = o.status === 'received'
            ? `<button type="button" data-action="move-onway" data-id="${escapeHTML(o.id)}" class="px-2.5 py-1.5 rounded-lg bg-statusOnway/20 hover:bg-statusOnway text-statusOnway hover:text-obsidian font-black text-[11px] transition-colors">تحرك للعميل ➔</button>`
            : o.status === 'onway'
            ? `<div class="flex items-center gap-1">
                <button type="button" data-action="move-delivered" data-id="${escapeHTML(o.id)}" class="px-2.5 py