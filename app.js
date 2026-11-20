let fb = null;
let isFirestoreConnected = false;
let unsubscribers = [];

// ==================== AUTH & ROLE STATE ====================
let currentUser = null;
let currentUserRole = 'operator'; // 'admin' or 'operator'
let registeredUsers = [];

function isAdminUser() {
    return currentUserRole === 'admin';
}

// ==================== XSS SANITIZATION ====================
function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ==================== DATE & TIME HELPERS ====================
function getSystemTodayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getActiveShiftDate() {
    return appState.activeDate || getSystemTodayStr();
}

function getNextDateStr(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d + 1);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
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
    return `${h}:${m} ${ampm}`;
}

// ==================== APPLICATION STATE ====================
let appState = {
    activeDate: getSystemTodayStr(),
    closedDays: [],
    riders: [],
    stores: [],
    orders: [],
    expenses: [],
    nextOrderNum: 101
};

let uiState = {
    activeTab: 'operations',
    viewMode: 'kanban',
    statusFilter: 'all',
    riderFilter: 'all',
    selectedOrderId: null,
    selectedRiderStatsId: null,
    riderStatsPeriod: 'today',
    archiveDateFilter: getSystemTodayStr(),
    reportMonth: getSystemTodayStr().slice(0, 7),
    expenseCatFilter: 'all'
};

function setSyncStatus(status) {
    const configs = {
        connecting: { text: 'جاري الاتصال بـ Firestore...', dot: 'bg-wassalAmber animate-pulse', txt: 'text-wassalAmber' },
        online: { text: 'متصل ومؤمّن (مزامنة فورية)', dot: 'bg-statusDone', txt: 'text-statusDone' },
        pending: { text: 'جاري حفظ التغييرات للسحابة...', dot: 'bg-wassalAmber animate-ping', txt: 'text-wassalAmber' },
        offline: { text: 'وضع غير متصل (محفوظ في الطابور)', dot: 'bg-wassalOrange', txt: 'text-wassalOrange' }
    };
    const cfg = configs[status] || configs.online;
    ['desktop', 'mobile'].forEach(prefix => {
        const dotEl = document.getElementById(`${prefix}-sync-dot`);
        const txtEl = document.getElementById(`${prefix}-sync-text`);
        if (dotEl && txtEl) {
            dotEl.className = `w-2 h-2 rounded-full ${cfg.dot}`;
            txtEl.className = `text-[11px] font-black tracking-wide ${cfg.txt}`;
            txtEl.textContent = cfg.text;
        }
    });
}

function applyRolePermissionsUI() {
    const emailEl = document.getElementById('current-user-email');
    const roleBadge = document.getElementById('current-user-role-badge');
    if (emailEl && currentUser) emailEl.textContent = currentUser.email || 'مستخدم';
    if (roleBadge) {
        if (isAdminUser()) {
            roleBadge.textContent = '👑 مدير النظام';
            roleBadge.className = 'px-2 py-0.5 rounded-md bg-wassalOrange/20 text-wassalOrange text-[10px] font-black shrink-0';
        } else {
            roleBadge.textContent = '🎧 موظف عمليات';
            roleBadge.className = 'px-2 py-0.5 rounded-md bg-statusOnway/20 text-statusOnway text-[10px] font-black shrink-0';
        }
    }

    document.querySelectorAll('.admin-only-btn').forEach(el => {
        if (isAdminUser()) {
            el.classList.remove('hidden');
        } else {
            el.classList.add('hidden');
        }
    });

    const editAmt = document.getElementById('edit-order-amount');
    const editFee = document.getElementById('edit-order-fee');
    if (editAmt) editAmt.disabled = !isAdminUser();
    if (editFee) editFee.disabled = !isAdminUser();
}

function renderUsersRolesList() {
    const container = document.getElementById('users-roles-list');
    if (!container) return;
    if (!isAdminUser() || registeredUsers.length === 0) {
        container.innerHTML = `<div class="text-[11px] text-slate-500">لا يوجد مستخدمون آخرون مسجلون بعد.</div>`;
        return;
    }

    container.innerHTML = registeredUsers.map(u => {
        const isSelf = currentUser && u.uid === currentUser.uid;
        return `
            <div class="flex items-center justify-between bg-slateDark border border-slateBorder rounded-lg px-3 py-2">
                <div class="truncate ml-2">
                    <div class="font-bold text-white truncate" dir="ltr">${escapeHTML(u.email)}</div>
                    <div class="text-[10px] text-slate-400">${u.role === 'admin' ? 'صلاحية كاملة (مدير)' : 'تسجيل ومتابعة طلبات فقط'}</div>
                </div>
                <select data-action="change-user-role" data-uid="${escapeHTML(u.uid)}" ${isSelf ? 'disabled' : ''} class="bg-obsidian border border-slateBorder rounded-lg px-2 py-1 text-[11px] font-black text-white">
                    <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>👑 مدير</option>
                    <option value="operator" ${u.role === 'operator' ? 'selected' : ''}>🎧 عمليات</option>
                </select>
            </div>
        `;
    }).join('');
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

// ==================== FIRESTORE VERIFIED PERSISTENCE & CHUNKED BATCHES ====================
async function fsSaveDoc(colName, docId, dataObj) {
    if (!fb || !fb.db || !currentUser) return false;
    setSyncStatus('pending');
    try {
        await fb.setDoc(fb.doc(fb.db, colName, String(docId)), { ...dataObj }, { merge: true });
        setSyncStatus(navigator.onLine ? 'online' : 'offline');
        return true;
    } catch (err) {
        console.error(`Firestore setDoc error (${colName}/${docId}):`, err);
        setSyncStatus('offline');
        showToast('⚠️ تعذر الحفظ على السيرفر — تحقق من الصلاحيات أو الاتصال');
        return false;
    }
}

async function fsDeleteDoc(colName, docId) {
    if (!fb || !fb.db || !currentUser) return false;
    if (!isAdminUser()) {
        showToast('⛔ الحذف متاح لمدير النظام فقط');
        return false;
    }
    setSyncStatus('pending');
    try {
        await fb.deleteDoc(fb.doc(fb.db, colName, String(docId)));
        setSyncStatus(navigator.onLine ? 'online' : 'offline');
        return true;
    } catch (err) {
        console.error(`Firestore deleteDoc error (${colName}/${docId}):`, err);
        setSyncStatus('offline');
        showToast('⚠️ تعذر الحذف من السيرفر');
        return false;
    }
}

async function fsSaveMeta() {
    if (!fb || !fb.db || !currentUser) return false;
    setSyncStatus('pending');
    try {
        await fb.setDoc(fb.doc(fb.db, 'wassal_meta', 'config'), {
            activeDate: appState.activeDate,
            closedDays: appState.closedDays
        }, { merge: true });
        setSyncStatus(navigator.onLine ? 'online' : 'offline');
        return true;
    } catch (err) {
        console.error('Firestore meta save error:', err);
        setSyncStatus('offline');
        return false;
    }
}

// تقسيم العمليات إلى دفعات لا تتجاوز 400 عملية لتجنب حد الـ 500 في Firestore
async function commitOperationsInChunks(operations) {
    const CHUNK_SIZE = 400;
    for (let i = 0; i < operations.length; i += CHUNK_SIZE) {
        const chunk = operations.slice(i, i + CHUNK_SIZE);
        const batch = fb.writeBatch(fb.db);
        chunk.forEach(op => {
            if (op.type === 'set') {
                batch.set(op.ref, op.data);
            } else if (op.type === 'delete') {
                batch.delete(op.ref);
            }
        });
        await batch.commit();
    }
}

// توليد رقم أوردر ذري على السيرفر لمنع التعارض بين الأجهزة
async function createOrderAtomically(orderPayload) {
    if (!fb || !fb.db || !currentUser) return null;
    setSyncStatus('pending');
    const metaRef = fb.doc(fb.db, 'wassal_meta', 'config');

    try {
        const createdOrder = await fb.runTransaction(fb.db, async (transaction) => {
            const metaSnap = await transaction.get(metaRef);
            let currentSeq = 101;
            if (metaSnap.exists() && typeof metaSnap.data().nextOrderNum === 'number') {
                currentSeq = metaSnap.data().nextOrderNum;
            }
            const generatedId = `W-${currentSeq}`;
            const finalOrder = {
                ...orderPayload,
                id: generatedId,
                createdBy: currentUser.email || currentUser.uid
            };

            const orderRef = fb.doc(fb.db, 'wassal_orders', generatedId);
            transaction.set(orderRef, finalOrder);
            transaction.set(metaRef, {
                nextOrderNum: currentSeq + 1,
                activeDate: appState.activeDate
            }, { merge: true });

            return finalOrder;
        });

        setSyncStatus(navigator.onLine ? 'online' : 'offline');
        return createdOrder;
    } catch (err) {
        console.error('Atomic order creation failed:', err);
        setSyncStatus('offline');
        showToast('⚠️ فشل تسجيل الطلب على السيرفر — تأكد من الاتصال والصلاحيات');
        return null;
    }
}

async function resetAllDataSafely() {
    if (!isAdminUser()) {
        showToast('⛔ تصفير النظام متاح لمدير النظام فقط');
        return;
    }
    const confirmed = window.confirm('⚠️ تحذير نهائي: سيتم مسح جميع الطلبات والمناديب والمتاجر والحسابات من قاعدة البيانات نهائياً!\n\nهل أنت متأكد من المتابعة؟');
    if (!confirmed) return;

    setSyncStatus('pending');
    try {
        const sysToday = getSystemTodayStr();
        const ops = [];

        const cols = ['wassal_orders', 'wassal_riders', 'wassal_stores', 'wassal_expenses'];
        for (const colName of cols) {
            const snap = await fb.getDocs(fb.collection(fb.db, colName));
            snap.forEach(d => {
                ops.push({ type: 'delete', ref: d.ref });
            });
        }

        ops.push({
            type: 'set',
            ref: fb.doc(fb.db, 'wassal_meta', 'config'),
            data: {
                activeDate: sysToday,
                nextOrderNum: 101,
                closedDays: []
            }
        });

        await commitOperationsInChunks(ops);

        uiState.riderFilter = 'all';
        uiState.statusFilter = 'all';
        uiState.archiveDateFilter = sysToday;
        uiState.reportMonth = sysToday.slice(0, 7);
        const monthPicker = document.getElementById('report-month-picker');
        if (monthPicker) monthPicker.value = uiState.reportMonth;

        const secModal = document.getElementById('modal-security');
        if (secModal) {
            secModal.classList.add('hidden');
            secModal.classList.remove('flex');
        }
        setSyncStatus('online');
        showToast('✅ تم تصفير قاعدة البيانات بالكامل بنجاح');
    } catch (err) {
        console.error('Chunked reset error:', err);
        setSyncStatus('offline');
        showToast('⚠️ حدث خطأ أثناء تصفير البيانات');
    }
}

function cleanupListeners() {
    unsubscribers.forEach(unsub => {
        try { unsub(); } catch (e) {}
    });
    unsubscribers = [];
}

async function ensureUserProfileAndRole(user) {
    const userRef = fb.doc(fb.db, 'wassal_users', user.uid);
    const snap = await fb.getDoc(userRef);
    if (snap.exists()) {
        currentUserRole = snap.data().role || 'operator';
    } else {
        // التحقق هل يوجد مستخدمون سابقون أم هذا أول مدير للنظام
        const allUsersSnap = await fb.getDocs(fb.collection(fb.db, 'wassal_users'));
        const assignedRole = allUsersSnap.empty ? 'admin' : 'operator';
        await fb.setDoc(userRef, {
            uid: user.uid,
            email: user.email || '',
            role: assignedRole,
            createdAt: Date.now()
        });
        currentUserRole = assignedRole;
    }
    applyRolePermissionsUI();
}

async function initAuthAndFirestore() {
    setSyncStatus('connecting');
    try {
        fb = await import('./firebase-config.js');

        fb.onAuthStateChanged(fb.auth, async (user) => {
            cleanupListeners();
            const lockScreen = document.getElementById('auth-lock-screen');

            if (!user) {
                currentUser = null;
                currentUserRole = 'operator';
                if (lockScreen) lockScreen.classList.remove('hidden');
                return;
            }

            currentUser = user;
            if (lockScreen) lockScreen.classList.add('hidden');

            await ensureUserProfileAndRole(user);

            // 1. Users list listener (for Admin role management)
            unsubscribers.push(
                fb.onSnapshot(fb.collection(fb.db, 'wassal_users'), (snap) => {
                    const list = [];
                    snap.forEach(d => list.push(d.data()));
                    registeredUsers = list;
                    const me = list.find(u => u.uid === user.uid);
                    if (me && me.role !== currentUserRole) {
                        currentUserRole = me.role;
                        applyRolePermissionsUI();
                    }
                    renderUsersRolesList();
                })
            );

            // 2. Meta Config listener
            unsubscribers.push(
                fb.onSnapshot(fb.doc(fb.db, 'wassal_meta', 'config'), (docSnap) => {
                    isFirestoreConnected = true;
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
                }, () => setSyncStatus('offline'))
            );

            // 3. Orders Collection listener
            unsubscribers.push(
                fb.onSnapshot(fb.collection(fb.db, 'wassal_orders'), (snap) => {
                    isFirestoreConnected = true;
                    setSyncStatus(snap.metadata.hasPendingWrites ? 'pending' : 'online');
                    const list = [];
                    snap.forEach(d => list.push(d.data()));
                    list.sort((a, b) => (Number(b.receivedTs) || 0) - (Number(a.receivedTs) || 0));
                    appState.orders = list;
                    syncRidersAvailability();
                    renderAll();
                }, () => setSyncStatus('offline'))
            );

            // 4. Riders Collection listener
            unsubscribers.push(
                fb.onSnapshot(fb.collection(fb.db, 'wassal_riders'), (snap) => {
                    const list = [];
                    snap.forEach(d => list.push(d.data()));
                    appState.riders = list;
                    syncRidersAvailability();
                    renderAll();
                })
            );

            // 5. Stores Collection listener
            unsubscribers.push(
                fb.onSnapshot(fb.collection(fb.db, 'wassal_stores'), (snap) => {
                    const list = [];
                    snap.forEach(d => list.push(d.data()));
                    appState.stores = list;
                    renderAll();
                })
            );

            // 6. Expenses Collection listener
            unsubscribers.push(
                fb.onSnapshot(fb.collection(fb.db, 'wassal_expenses'), (snap) => {
                    const list = [];
                    snap.forEach(d => list.push(d.data()));
                    list.sort((a, b) => (b.dateStr || '').localeCompare(a.dateStr || ''));
                    appState.expenses = list;
                    renderAll();
                })
            );
        });
    } catch (err) {
        console.error('Firebase Auth/Firestore init error:', err);
        setSyncStatus('offline');
    }
}

window.addEventListener('online', () => {
    if (isFirestoreConnected) setSyncStatus('online');
});
window.addEventListener('offline', () => setSyncStatus('offline'));

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
        returning: `🔴 مرتجع (جاري إعادته للمتجر) — السبب: ${o.returnReason || 'لم يستلم'}`,
        returned: `↩️ مرتجع (تمت إعادته للمتجر) — السبب: ${o.returnReason || 'لم يستلم'}`
    };

    return [
        `🟠 *تحديث أوردر وصّل - WASSAL*`,
        `• رقم الطلب: *#${o.id}* (${o.dateStr || getActiveShiftDate()})`,
        `• الحالة: *${statusArabic[o.status] || o.status}*`,
        `• المتجر: ${st.name} (${st.category})`,
        `• المندوب: ${rd.name} (${rd.plate})`,
        `• العميل: ${o.customerName} (${o.phone})`,
        `• العنوان: ${o.address}`,
        o.items ? `• الأصناف: ${o.items}` : null,
        `• وقت الاستلام: ${formatTime12(o.receivedTs)}`,
        o.departedTs ? `• وقت التحرك: ${formatTime12(o.departedTs)}` : null,
        o.deliveredTs ? `• وقت التسليم: ${formatTime12(o.deliveredTs)} (مدة التوصيل: ${deliveryMins} دقيقة)` : null,
        o.settledTs ? `• وقت الإغلاق والعودة: ${formatTime12(o.settledTs)}` : null,
        (o.status === 'returning' || o.status === 'returned')
            ? `• رسوم التوصيل للمرتجع: *${o.fee} ج.م*`
            : `• المطلوب تحصيله: *${Number(o.amount) + Number(o.fee)} ج.م*`,
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
    document.getElementById('kpi-delivered-sub').textContent = `${currentStats.todaySettledOrders.length} (مرتجع: ${currentStats.todayReturnedOrders.length})`;
    document.getElementById('kpi-total').textContent = appState.orders.length;

    document.getElementById('kpi-active').textContent = activeTotal;
    document.getElementById('kpi-picked-count').textContent = `${pickedCount} استلام`;
    document.getElementById('kpi-onway-count').textContent = `${onwayCount} طريق`;
    const delivWaitEl = document.getElementById('kpi-deliv-wait-count');
    if (delivWaitEl) delivWaitEl.textContent = `${delivWaitCount} توريد/مرتجع`;

    const topM = currentStats.storeStats[0];
    if (topM && topM.monthCount > 0) {
        document.getElementById('kpi-top-merchant-name').textContent = topM.store.name;
        document.getElementById('kpi-top-merchant-count').textContent = `${topM.monthCount} أوردر (${topM.todayCount} اليوم)`;
        document.getElementById('kpi-top-merchant-share').textContent = `${topM.sharePct}%`;
    } else {
        document.getElementById('kpi-top-merchant-name').textContent = '—';
        document.getElementById('kpi-top-merchant-count').textContent = '0 أوردر';
        document.getElementById('kpi-top-merchant-share').textContent = '0%';
    }

    document.getElementById('kpi-riders-avail').textContent = availRiders;
    const kpiRidersTotalEl = document.getElementById('kpi-riders-total');
    if (kpiRidersTotalEl) kpiRidersTotalEl.textContent = ` / ${totalRidersCount}`;

    const topR = currentStats.riderStats[0];
    document.getElementById('kpi-top-rider-mini').textContent = (topR && topR.monthCount > 0) ? `${topR.rider.name} (${topR.monthCount})` : '—';

    document.getElementById('kpi-today-profit').textContent = currentStats.todayProfit.toLocaleString('ar-EG');
    document.getElementById('kpi-revenue').textContent = currentStats.todayRev.toLocaleString('ar-EG');
    document.getElementById('kpi-today-expense').textContent = currentStats.todayExp.toLocaleString('ar-EG');

    document.getElementById('nav-badge-active').textContent = activeTotal;
    const settledBadge = document.getElementById('nav-badge-settled');
    if (settledBadge) settledBadge.textContent = archivedTotalCount;
    const navLabelRiders = document.getElementById('nav-label-riders');
    if (navLabelRiders) navLabelRiders.textContent = `المناديب والموتوسيكلات (${totalRidersCount})`;
    document.getElementById('nav-badge-riders').textContent = `${availRiders}/${totalRidersCount}`;
    document.getElementById('nav-badge-stores').textContent = appState.stores.length;
    const profitSign = currentStats.todayProfit >= 0 ? '+' : '';
    document.getElementById('nav-badge-profit').textContent = `${profitSign}${currentStats.todayProfit} ج.م`;

    const pct = totalRidersCount > 0 ? Math.round((availRiders / totalRidersCount) * 100) : 0;
    const sidebarFleetTitle = document.getElementById('sidebar-fleet-title');
    if (sidebarFleetTitle) sidebarFleetTitle.textContent = `جاهزية الأسطول (${totalRidersCount})`;
    document.getElementById('sidebar-fleet-pct').textContent = `${pct}%`;
    document.getElementById('sidebar-fleet-bar').style.width = `${pct}%`;
    document.getElementById('sidebar-office-txt').textContent = `● ${availRiders} بالمكتب`;
    document.getElementById('sidebar-busy-txt').textContent = `● ${busyRiders} في مهمة`;
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
        let subText = `متاح • ${todayCnt} يوم / ${monthCnt} شهر`;
        let borderClass = isSelected ? 'border-wassalOrange bg-wassalOrange/15 ring-1 ring-wassalOrange' : 'border-slateBorder bg-slateCard hover:border-slate-500';

        if (activeOrder) {
            const { totalMins } = getOrderDurations(activeOrder);
            const st = getStore(activeOrder.storeId);
            if (activeOrder.status === 'returning') {
                dotClass = 'bg-red-500 animate-pulse';
                subText = `مرتجع لـ ${escapeHTML(st.name)} (${totalMins}د)`;
            } else if (activeOrder.status === 'delivered') {
                dotClass = 'bg-statusDone animate-pulse';
                subText = `توريد لـ ${escapeHTML(st.name)} (${totalMins}د)`;
            } else if (activeOrder.status === 'onway') {
                dotClass = 'bg-statusOnway animate-pulse';
                subText = `في الطريق (${totalMins}د) • ${todayCnt}ي/${monthCnt}ش`;
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
        const container = document.getElementById(`col-list-${stage}`);

        if (list.length === 0) {
            const emptyMsg = q
                ? (archiveMatches.length > 0
                    ? `لا توجد نتائج مطابقة لـ "${escapeHTML(searchEl.value)}" في الجارية (توجد ${archiveMatches.length} في الأرشيف — اضغط هنا لعرضها)`
                    : `لا توجد نتائج مطابقة لـ "${escapeHTML(searchEl.value)}"`)
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
        ? `<tr><td colspan="8" class="py-2.5 px-4 bg-wassalOrange/10 text-wassalOrange font-black text-xs text-center">🔎 تم العثور على ${archiveMatches.length} طلب في الأرشيف مطابق لبحثك:</td></tr>`
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
                <button type="button" data-action="move-delivered" data-id="${escapeHTML(o.id)}" class="px-2.5 py-1.5 rounded-lg bg-statusDone/20 hover:bg-statusDone text-statusDone hover:text-obsidian font-black text-[11px]">✓ تسليم</button>
                <button type="button" data-action="open-return-modal" data-id="${escapeHTML(o.id)}" class="px-2.5 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500 text-red-400 hover:text-white font-black text-[11px]">↩️ مرتجع</button>
               </div>`
            : o.status === 'returning'
            ? `<button type="button" data-action="move-returned-done" data-id="${escapeHTML(o.id)}" class="px-2.5 py-1.5 rounded-lg bg-red-500 text-white font-black text-[11px]">📦 تسليم المرتجع للمتجر</button>`
            : o.status === 'delivered'
            ? `<button type="button" data-action="move-settled" data-id="${escapeHTML(o.id)}" class="px-2.5 py-1.5 rounded-lg wassal-grad text-obsidian font-black text-[11px]">💰 تم التوريد والعودة</button>`
            : `<span class="text-[11px] text-slate-400 font-bold">مكتمل</span>`;

        return `
            <tr data-action="open-drawer" data-id="${escapeHTML(o.id)}" class="hover:bg-slateCard/90 cursor-pointer transition-colors">
                <td class="px-4 py-3.5">
                    <div class="font-black text-wassalOrange">#${escapeHTML(o.id)}</div>
                    <div class="text-[10px] text-slate-500">${escapeHTML(o.dateStr || getActiveShiftDate())}</div>
                </td>
                <td class="px-4 py-3.5">${statusPill}</td>
                <td class="px-4 py-3.5 font-bold text-white">${escapeHTML(st.name)}</td>
                <td class="px-4 py-3.5">
                    <div class="font-bold text-slate-200">${escapeHTML(o.customerName)}</div>
                    <div class="text-[11px] text-slate-400">${escapeHTML(o.address)}</div>
                    ${o.items ? `<div class="text-[10px] text-wassalAmber font-bold mt-0.5">🛒 ${escapeHTML(o.items)}</div>` : ''}
                </td>
                <td class="px-4 py-3.5 font-bold text-slate-200">${escapeHTML(rd.name)}</td>
                <td class="px-4 py-3.5 text-[11px] text-slate-300">
                    <div>استلام: <strong class="text-statusPicked">${formatTime12(o.receivedTs)}</strong></div>
                    ${o.departedTs ? `<div>تحرك: <strong class="text-statusOnway">${formatTime12(o.departedTs)}</strong></div>` : ''}
                    ${o.deliveredTs ? `<div>تسليم: <strong class="text-statusDone">${formatTime12(o.deliveredTs)}</strong></div>` : ''}
                </td>
                <td class="px-4 py-3.5 font-black text-white">${o.status === 'returning' ? o.fee + ' ج.م (توصيل)' : (Number(o.amount) + Number(o.fee)) + ' ج.م'}</td>
                <td class="px-4 py-3.5 text-center">
                    <div class="flex items-center justify-center gap-1.5">
                        ${quickAction}
                        <button type="button" data-action="copy-whatsapp" data-id="${escapeHTML(o.id)}" class="px-2 py-1.5 rounded-lg bg-slateCard hover:bg-slateHover border border-slateBorder text-slate-300 text-[11px] font-bold">واتساب</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function buildOrderCard(o) {
    const store = getStore(o.storeId);
    const rider = getRider(o.riderId);
    const { totalMins, deliveryMins } = getOrderDurations(o);
    const isReturning = o.status === 'returning';
    const isOverdue = o.status !== 'delivered' && !isReturning && totalMins > 35;

    const timeBadge = isReturning
        ? `<span class="px-2 py-0.5 rounded-lg bg-red-500/20 border border-red-500/50 text-red-400 font-black text-[10px]">↩️ مرتجع</span>`
        : o.status === 'delivered'
        ? `<span class="px-2 py-0.5 rounded-lg bg-statusDone/15 border border-statusDone/30 text-statusDone font-black text-[10px]">✓ سُلّم في ${deliveryMins} د</span>`
        : `<span class="px-2 py-0.5 rounded-lg ${isOverdue ? 'bg-red-500/20 border-red-500 text-red-400 animate-pulse' : 'bg-slateDark border-slateBorder text-slate-200'} border font-black text-[10px]">⏳ منذ ${totalMins} د</span>`;

    let actionButton = '';
    if (o.status === 'received') {
        actionButton = `<button type="button" data-action="move-onway" data-id="${escapeHTML(o.id)}" class="w-full py-2.5 px-3 rounded-xl bg-statusOnway/20 hover:bg-statusOnway text-statusOnway hover:text-obsidian border border-statusOnway/40 font-black text-xs transition-all">تحرك للعميل ➔</button>`;
    } else if (o.status === 'onway') {
        actionButton = `
            <div class="grid grid-cols-3 gap-1.5">
                <button type="button" data-action="move-delivered" data-id="${escapeHTML(o.id)}" class="col-span-2 py-2.5 px-2 rounded-xl bg-statusDone/20 hover:bg-statusDone text-statusDone hover:text-obsidian border border-statusDone/40 font-black text-xs transition-all">✓ تم التسليم</button>
                <button type="button" data-action="open-return-modal" data-id="${escapeHTML(o.id)}" class="py-2.5 px-2 rounded-xl bg-red-500/15 hover:bg-red-500 text-red-400 hover:text-white border border-red-500/40 font-black text-xs transition-all">↩️ مرتجع</button>
            </div>
        `;
    } else if (o.status === 'delivered') {
        actionButton = `<button type="button" data-action="move-settled" data-id="${escapeHTML(o.id)}" class="w-full py-2.5 px-3 rounded-xl wassal-grad wassal-grad-hover text-obsidian font-black text-xs shadow-md shadow-orange-500/20 transition-all">💰 تم التوريد والعودة للمكتب</button>`;
    } else if (isReturning) {
        actionButton = `<button type="button" data-action="move-returned-done" data-id="${escapeHTML(o.id)}" class="w-full py-2.5 px-3 rounded-xl bg-red-500 hover:bg-red-600 text-white font-black text-xs shadow-md shadow-red-500/20 transition-all">📦 تم تسليم المرتجع للمتجر والعودة</button>`;
    }

    const returnReasonBox = isReturning ? `
        <div class="bg-red-500/15 border border-red-500/40 rounded-xl p-2 text-[11px] text-red-300 font-bold">
            ⚠️ سبب الإرجاع: ${escapeHTML(o.returnReason || 'العميل لم يستلم')}
        </div>
    ` : '';

    return `
        <div data-action="open-drawer" data-id="${escapeHTML(o.id)}" class="bg-slateCard hover:bg-slateHover border ${isReturning || isOverdue ? 'border-red-500/70' : 'border-slateBorder hover:border-wassalOrange/50'} rounded-2xl p-4 space-y-3 cursor-pointer transition-all shadow-md">
            <div class="flex items-center justify-between gap-1.5">
                <div class="flex items-center gap-1.5 flex-wrap">
                    <span class="px-2.5 py-0.5 rounded-lg bg-obsidian border border-wassalOrange/40 text-wassalOrange font-black text-xs">#${escapeHTML(o.id)}</span>
                    ${timeBadge}
                </div>
                <div class="flex items-center gap-1">
                    <button type="button" data-action="copy-whatsapp" data-id="${escapeHTML(o.id)}" class="px-2.5 py-1 rounded-lg bg-obsidian hover:bg-statusDone/20 text-slate-300 hover:text-statusDone border border-slateBorder text-[11px] font-bold transition-colors">واتساب</button>
                </div>
            </div>

            ${returnReasonBox}

            <div class="bg-obsidian/90 rounded-xl p-2 border border-slateBorder grid grid-cols-3 gap-1 text-center text-[11px]">
                <div>
                    <div class="text-[10px] text-statusPicked font-bold">1. استلام</div>
                    <div class="font-black text-white">${formatTime12(o.receivedTs)}</div>
                </div>
                <div class="border-x border-slateBorder">
                    <div class="text-[10px] text-statusOnway font-bold">2. تحرك</div>
                    <div class="font-black ${o.departedTs ? 'text-white' : 'text-slate-600'}">${formatTime12(o.departedTs)}</div>
                </div>
                <div>
                    <div class="text-[10px] ${isReturning ? 'text-red-400' : 'text-statusDone'} font-bold">${isReturning ? 'مرتجع' : '3. تسليم'}</div>
                    <div class="font-black ${isReturning ? 'text-red-400' : (o.deliveredTs ? 'text-statusDone' : 'text-slate-600')}">${isReturning ? formatTime12(o.returnedTs) : formatTime12(o.deliveredTs)}</div>
                </div>
            </div>

            <div class="bg-slateDark/80 rounded-xl p-2.5 border border-slateBorder space-y-1 text-xs">
                <div class="flex items-center justify-between">
                    <span class="font-black text-white">${escapeHTML(store.name)}</span>
                    <span class="text-[10px] px-2 py-0.5 rounded bg-wassalOrange/15 text-wassalOrange font-bold">${escapeHTML(store.category)}</span>
                </div>
                <div class="flex items-center justify-between text-slate-300 text-[11px]">
                    <span>المندوب: <strong class="text-white">${escapeHTML(rider.name)}</strong></span>
                    <span class="text-slate-400">${escapeHTML(rider.plate)}</span>
                </div>
            </div>

            <div class="text-xs space-y-1 bg-obsidian/60 p-2.5 rounded-xl border border-slateBorder/60">
                <div class="flex items-center justify-between">
                    <span class="font-bold text-slate-100">${escapeHTML(o.customerName)}</span>
                    <span class="text-wassalOrange font-mono font-bold text-[11px]">${escapeHTML(o.phone)}</span>
                </div>
                <p class="text-slate-400 text-[11px] truncate">📍 ${escapeHTML(o.address)}</p>
                ${o.items ? `<p class="text-wassalAmber text-[11px] font-bold pt-0.5">🛒 ${escapeHTML(o.items)}</p>` : ''}
            </div>

            <div class="grid grid-cols-3 gap-1 bg-obsidian rounded-xl p-2 border border-slateBorder text-center text-xs">
                <div>
                    <div class="text-[10px] text-slate-400">توريد للمتجر</div>
                    <div class="font-extrabold ${isReturning ? 'line-through text-slate-500' : 'text-white'}">${o.amount} ج.م</div>
                </div>
                <div class="border-x border-slateBorder">
                    <div class="text-[10px] text-slate-400">التوصيل</div>
                    <div class="font-extrabold text-wassalOrange">${o.fee} ج.م</div>
                </div>
                <div>
                    <div class="text-[10px] text-slate-400">المطلوب</div>
                    <div class="font-black ${isReturning ? 'text-red-400' : 'text-statusDone'}">${isReturning ? o.fee : (Number(o.amount) + Number(o.fee))} ج.م</div>
                </div>
            </div>

            <div>
                ${actionButton}
            </div>
        </div>
    `;
}

// ==================== VIEW 2: ARCHIVE & DAY CLOSE RENDERING ====================
function renderArchive() {
    const activeD = getActiveShiftDate();
    const curLabel = document.getElementById('archive-current-day-label');
    if (curLabel) curLabel.textContent = activeD;

    const datePicker = document.getElementById('archive-date-picker');
    if (datePicker && uiState.archiveDateFilter && datePicker.value !== uiState.archiveDateFilter) {
        datePicker.value = uiState.archiveDateFilter;
    }

    const dateSet = new Set([activeD, ...appState.orders.map(o => o.dateStr).filter(Boolean)]);
    const sortedDates = Array.from(dateSet).sort((a, b) => b.localeCompare(a));

    const quickDatesEl = document.getElementById('archive-quick-dates');
    if (quickDatesEl) {
        quickDatesEl.innerHTML = sortedDates.map(d => {
            const isSelected = uiState.archiveDateFilter === d;
            const isOpenDay = d === activeD;
            const cnt = appState.orders.filter(o => o.dateStr === d).length;
            return `
                <button type="button" data-action="archive-select-date" data-date="${escapeHTML(d)}" class="shrink-0 px-3 py-1.5 rounded-xl border text-xs font-black transition-all ${isSelected ? 'wassal-grad text-obsidian border-wassalOrange' : 'bg-obsidian border-slateBorder text-slate-300 hover:border-wassalOrange'}">
                    ${escapeHTML(d)} ${isOpenDay ? '(اليوم المفتوح)' : ''} • [${cnt}]
                </button>
            `;
        }).join('');
    }

    const filteredOrders = uiState.archiveDateFilter
        ? appState.orders.filter(o => o.dateStr === uiState.archiveDateFilter)
        : appState.orders;

    const settledOnly = filteredOrders.filter(o => isOrderSuccessfullySettled(o));
    const archivedAll = filteredOrders.filter(o => isOrderArchived(o));
    const merchantCash = settledOnly.reduce((s, o) => s + Number(o.amount), 0);
    const feesCash = archivedAll.reduce((s, o) => s + Number(o.fee), 0);

    document.getElementById('arch-stat-count').textContent = filteredOrders.length;
    document.getElementById('arch-stat-settled-count').textContent = `${settledOnly.length} (مرتجع: ${filteredOrders.filter(o => o.status === 'returned' || o.status === 'returning').length})`;
    document.getElementById('arch-stat-merchant-cash').textContent = `${merchantCash.toLocaleString('ar-EG')} ج.م`;
    document.getElementById('arch-stat-fees').textContent = `${feesCash.toLocaleString('ar-EG')} ج.م`;

    const tbody = document.getElementById('archive-table-body');
    if (filteredOrders.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="py-10 text-center text-slate-500">لا توجد طلبات مسجلة في هذا التاريخ</td></tr>`;
    } else {
        tbody.innerHTML = filteredOrders.map(o => {
            const st = getStore(o.storeId);
            const rd = getRider(o.riderId);
            const statusMap = {
                received: `<span class="px-2 py-0.5 rounded bg-statusPicked/20 text-statusPicked font-black text-[11px]">تم الاستلام</span>`,
                onway: `<span class="px-2 py-0.5 rounded bg-statusOnway/20 text-statusOnway font-black text-[11px]">في الطريق</span>`,
                delivered: `<span class="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-black text-[11px]">تم التسليم (توريد)</span>`,
                settled: `<span class="px-2 py-0.5 rounded bg-statusDone/20 text-statusDone font-black text-[11px]">✓ تم التوريد والعودة</span>`,
                returning: `<span class="px-2 py-0.5 rounded bg-red-500/20 text-red-400 font-black text-[11px]">↩️ مرتجع (بالطريق للمتجر)</span>`,
                returned: `<span class="px-2 py-0.5 rounded bg-red-500/20 text-red-300 font-black text-[11px]">↩️ مرتجع أُعيد للمتجر</span>`
            };

            const isRet = o.status === 'returning' || o.status === 'returned';

            return `
                <tr data-action="open-drawer" data-id="${escapeHTML(o.id)}" class="hover:bg-slateCard/80 cursor-pointer">
                    <td class="px-3.5 py-3 font-black text-wassalOrange">#${escapeHTML(o.id)}</td>
                    <td class="px-3.5 py-3 font-mono text-slate-400">${escapeHTML(o.dateStr)}</td>
                    <td class="px-3.5 py-3">
                        <div>${statusMap[o.status] || escapeHTML(o.status)}</div>
                        ${isRet && o.returnReason ? `<div class="text-[10px] text-red-400 mt-0.5">السبب: ${escapeHTML(o.returnReason)}</div>` : ''}
                    </td>
                    <td class="px-3.5 py-3 font-bold text-white">${escapeHTML(st.name)}</td>
                    <td class="px-3.5 py-3">
                        <div class="text-slate-200 font-bold">${escapeHTML(o.customerName)}</div>
                        <div class="text-[11px] text-slate-400">${escapeHTML(o.address)}</div>
                        ${o.items ? `<div class="text-[10px] text-wassalAmber font-bold mt-0.5">🛒 ${escapeHTML(o.items)}</div>` : ''}
                    </td>
                    <td class="px-3.5 py-3 font-bold text-slate-200">${escapeHTML(rd.name)}</td>
                    <td class="px-3.5 py-3 text-[11px]">
                        <span class="text-statusPicked font-bold">${formatTime12(o.receivedTs)}</span> ➔
                        <span class="text-statusOnway font-bold">${formatTime12(o.departedTs)}</span> ➔
                        <span class="${isRet ? 'text-red-400' : 'text-emerald-300'} font-bold">${isRet ? formatTime12(o.returnedTs) : formatTime12(o.deliveredTs)}</span> ➔
                        <span class="text-statusDone font-black">${formatTime12(o.settledTs)}</span>
                    </td>
                    <td class="px-3.5 py-3 font-black">
                        ${isRet
                            ? `<span class="text-red-400">مرتجع</span> + <span class="text-wassalOrange">${o.fee} ج.م</span>`
                            : `<span class="text-white">${o.amount}</span> + <span class="text-wassalOrange">${o.fee} ج.م</span>`}
                    </td>
                </tr>
            `;
        }).join('');
    }

    const closedBody = document.getElementById('closed-days-body');
    if (appState.closedDays.length === 0) {
        closedBody.innerHTML = `<tr><td colspan="8" class="py-8 text-center text-slate-500">لم يتم إقفال أي يومية سابقة بعد.</td></tr>`;
    } else {
        closedBody.innerHTML = appState.closedDays.map(cd => `
            <tr class="hover:bg-slateCard/80">
                <td class="px-4 py-3 font-black text-white font-mono">${escapeHTML(cd.dateStr)}</td>
                <td class="px-4 py-3 text-slate-400">${formatTime12(cd.closedAt)}</td>
                <td class="px-4 py-3 font-black text-white">${cd.ordersCount} أوردر</td>
                <td class="px-4 py-3 font-bold text-slate-200">${Number(cd.settledCash).toLocaleString('ar-EG')} ج.م</td>
                <td class="px-4 py-3 font-black text-statusDone">${Number(cd.revenue).toLocaleString('ar-EG')} ج.م</td>
                <td class="px-4 py-3 font-bold text-red-400">${Number(cd.expenses).toLocaleString('ar-EG')} ج.م</td>
                <td class="px-4 py-3 font-black text-wassalOrange text-sm">${Number(cd.netProfit).toLocaleString('ar-EG')} ج.م</td>
                <td class="px-4 py-3 text-center">
                    <button type="button" data-action="archive-select-date" data-date="${escapeHTML(cd.dateStr)}" class="px-3 py-1 rounded-lg bg-slateCard hover:bg-wassalOrange text-slate-200 hover:text-obsidian font-black text-[11px] transition-colors">عرض الطلبات</button>
                </td>
            </tr>
        `).join('');
    }
}

function openCloseDayModal() {
    if (!isAdminUser()) {
        showToast('⛔ إقفال اليومية متاح لمدير النظام فقط');
        return;
    }
    const activeD = getActiveShiftDate();
    const unFinished = appState.orders.filter(o => o.dateStr === activeD && isOrderActiveInRoom(o));
    const dayOrders = appState.orders.filter(o => o.dateStr === activeD);
    const daySettled = dayOrders.filter(o => isOrderSuccessfullySettled(o));
    const dayArchived = dayOrders.filter(o => isOrderArchived(o));
    const rev = dayArchived.reduce((s, o) => s + Number(o.fee), 0);
    const cash = daySettled.reduce((s, o) => s + Number(o.amount), 0);
    const exp = appState.expenses.filter(e => e.dateStr === activeD).reduce((s, e) => s + Number(e.amount), 0);

    const box = document.getElementById('close-day-summary-box');
    box.innerHTML = `
        <div class="flex justify-between"><span class="text-slate-400">اليوم الجاري إقفاله:</span><strong class="text-wassalOrange font-mono">${escapeHTML(activeD)}</strong></div>
        <div class="flex justify-between"><span class="text-slate-400">أوردرات ناجحة / مرتجعة:</span><strong class="text-statusDone">${daySettled.length} ناجح • ${dayOrders.filter(o => o.status === 'returned').length} مرتجع</strong></div>
        <div class="flex justify-between"><span class="text-slate-400">مبالغ موردة للمتاجر:</span><strong class="text-white">${cash.toLocaleString('ar-EG')} ج.م</strong></div>
        <div class="flex justify-between"><span class="text-slate-400">إيراد التوصيل:</span><strong class="text-statusDone">${rev.toLocaleString('ar-EG')} ج.م</strong></div>
        <div class="flex justify-between"><span class="text-slate-400">المصروفات المسجلة:</span><strong class="text-red-400">${exp.toLocaleString('ar-EG')} ج.م</strong></div>
        <div class="pt-2 border-t border-slateBorder flex justify-between text-sm"><span class="font-black text-white">صافي ربح اليومية:</span><strong class="text-wassalOrange font-black">${(rev - exp).toLocaleString('ar-EG')} ج.م</strong></div>
        ${unFinished.length > 0 ? `<div class="mt-2 p-2 rounded-lg bg-red-500/15 border border-red-500/40 text-red-300 text-[11px] font-bold">⚠️ تنبيه: يوجد ${unFinished.length} طلب لم يُغلق بعد (سيبقى ظاهراً في غرفة العمليات لإنهائه).</div>` : ''}
    `;

    document.getElementById('input-next-shift-date').value = getNextDateStr(activeD);
    const modal = document.getElementById('modal-close-day');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function openReturnModal(orderId) {
    const o = appState.orders.find(item => item.id === orderId);
    if (!o) return;
    document.getElementById('input-return-order-id').value = o.id;
    document.getElementById('return-modal-order-id').textContent = `#${o.id} (${o.customerName})`;
    document.getElementById('input-return-reason-note').value = '';
    const modal = document.getElementById('modal-return-order');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function openEditOrderModal(orderId) {
    const o = appState.orders.find(item => item.id === orderId);
    if (!o) return;

    document.getElementById('edit-order-id').value = o.id;
    document.getElementById('edit-order-title-id').textContent = `#${o.id}`;
    document.getElementById('edit-order-customer').value = o.customerName || '';
    document.getElementById('edit-order-phone').value = o.phone || '';
    document.getElementById('edit-order-address').value = o.address || '';
    document.getElementById('edit-order-items').value = o.items || '';
    document.getElementById('edit-order-amount').value = o.amount || 0;
    document.getElementById('edit-order-fee').value = o.fee || 0;
    applyRolePermissionsUI();

    const riderSel = document.getElementById('edit-order-rider');
    riderSel.innerHTML = appState.riders.map(r => {
        const statusIcon = r.id === o.riderId ? '🔵 (المندوب الحالي)' : (r.status === 'available' ? '🟢 متاح' : (r.status === 'busy' ? '🟠 في مهمة' : '⚪ خارج العمل'));
        return `<option value="${escapeHTML(r.id)}" ${r.id === o.riderId ? 'selected' : ''}>${escapeHTML(r.name)} (${escapeHTML(r.plate)}) - ${statusIcon}</option>`;
    }).join('');

    const modal = document.getElementById('modal-edit-order');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function openStoreStatementModal(storeId) {
    const store = getStore(storeId);
    const targetMonth = uiState.reportMonth || getCurrentMonthStr();
    const storeOrders = appState.orders.filter(o => o.storeId === storeId && (o.dateStr || '').startsWith(targetMonth));

    const settledOrders = storeOrders.filter(o => isOrderSuccessfullySettled(o));
    const returnedOrders = storeOrders.filter(o => o.status === 'returned' || o.status === 'returning');
    const totalMerchantAmount = settledOrders.reduce((s, o) => s + Number(o.amount), 0);
    const returnedDeliveryFees = returnedOrders.reduce((s, o) => s + Number(o.fee || 0), 0);
    const netStoreDue = totalMerchantAmount - returnedDeliveryFees;

    document.getElementById('statement-store-subtitle').textContent = `${store.name} (${store.category}) — شهر ${targetMonth}`;

    const rowsHTML = storeOrders.length === 0
        ? `<tr><td colspan="6" class="py-8 text-center text-slate-500">لا توجد أوردرات مسجلة لهذا المتجر في شهر ${escapeHTML(targetMonth)}</td></tr>`
        : storeOrders.map(o => {
            const isRet = o.status === 'returned' || o.status === 'returning';
            const statusTxt = o.status === 'settled' ? '✓ تم التوريد' : (isRet ? `↩️ مرتجع (${escapeHTML(o.returnReason || '')})` : 'جاري');
            return `
                <tr class="border-b border-slateBorder hover:bg-slateCard/60">
                    <td class="py-2.5 px-2 font-black text-wassalOrange">#${escapeHTML(o.id)}</td>
                    <td class="py-2.5 px-2 text-slate-400 font-mono">${escapeHTML(o.dateStr)}</td>
                    <td class="py-2.5 px-2 text-white">
                        <div>${escapeHTML(o.customerName)}</div>
                        ${o.items ? `<div class="text-[10px] text-slate-400">${escapeHTML(o.items)}</div>` : ''}
                    </td>
                    <td class="py-2.5 px-2">${statusTxt}</td>
                    <td class="py-2.5 px-2 font-bold ${isRet ? 'line-through text-slate-500' : 'text-white'}">${o.amount} ج.م</td>
                    <td class="py-2.5 px-2 font-bold text-wassalOrange">${o.fee} ج.م</td>
                </tr>
            `;
        }).join('');

    document.getElementById('statement-modal-body').innerHTML = `
        <div class="grid grid-cols-3 gap-3 text-center">
            <div class="bg-obsidian border border-slateBorder rounded-xl p-3">
                <div class="text-[10px] text-slate-400">إجمالي الأوردرات</div>
                <div class="text-lg font-black text-white mt-1">${storeOrders.length}</div>
            </div>
            <div class="bg-obsidian border border-statusDone/40 rounded-xl p-3">
                <div class="text-[10px] text-statusDone">مبالغ البضائع (للمتجر)</div>
                <div class="text-base font-black text-statusDone mt-1">${totalMerchantAmount.toLocaleString('ar-EG')} ج.م</div>
            </div>
            <div class="bg-obsidian border border-red-500/40 rounded-xl p-3">
                <div class="text-[10px] text-red-400">رسوم توصيل المرتجعات</div>
                <div class="text-base font-black text-red-400 mt-1">${returnedDeliveryFees.toLocaleString('ar-EG')} ج.م (${returnedOrders.length})</div>
            </div>
        </div>

        <div class="border border-slateBorder rounded-xl overflow-hidden">
            <table class="w-full text-right text-xs">
                <thead class="bg-obsidian text-slate-400 border-b border-slateBorder">
                    <tr>
                        <th class="py-2 px-2">#</th>
                        <th class="py-2 px-2">التاريخ</th>
                        <th class="py-2 px-2">العميل والأصناف</th>
                        <th class="py-2 px-2">الحالة</th>
                        <th class="py-2 px-2">قيمة الأوردر</th>
                        <th class="py-2 px-2">التوصيل</th>
                    </tr>
                </thead>
                <tbody>${rowsHTML}</tbody>
            </table>
        </div>

        <div class="bg-obsidian border border-wassalOrange/50 rounded-xl p-3.5 space-y-1.5 text-xs">
            <div class="flex justify-between"><span class="text-slate-300">إجمالي مبيعات البضائع للمتجر:</span><strong class="text-white">${totalMerchantAmount.toLocaleString('ar-EG')} ج.م</strong></div>
            <div class="flex justify-between"><span class="text-slate-300">(-) يُخصم رسوم توصيل المرتجعات (${returnedOrders.length} مرتجع):</span><strong class="text-red-400">${returnedDeliveryFees.toLocaleString('ar-EG')} ج.م</strong></div>
            <div class="pt-2 border-t border-slateBorder flex justify-between text-sm">
                <span class="font-black text-wassalOrange">صافي المستحق للمتجر:</span>
                <strong class="text-statusDone font-black text-base">${netStoreDue.toLocaleString('ar-EG')} ج.م</strong>
            </div>
        </div>
    `;

    const waText = [
        `📄 *كشف حساب متجر ${store.name}*`,
        `• الفترة: شهر ${targetMonth}`,
        `• إجمالي الأوردرات: ${storeOrders.length} (${settledOrders.length} ناجح، ${returnedOrders.length} مرتجع)`,
        `• إجمالي قيمة البضائع: ${totalMerchantAmount.toLocaleString('ar-EG')} ج.م`,
        returnedDeliveryFees > 0 ? `• يُخصم رسوم توصيل المرتجعات: -${returnedDeliveryFees.toLocaleString('ar-EG')} ج.م` : null,
        `• *صافي المستحق للمتجر: ${netStoreDue.toLocaleString('ar-EG')} ج.م*`,
        `_شكراً لتعاملكم مع خدمة وصّل للتوصيل 🧡_`
    ].filter(Boolean).join('\n');

    document.getElementById('whatsapp-store-statement-btn').href = `https://wa.me/${encodeURIComponent(store.phone)}?text=${encodeURIComponent(waText)}`;

    const modal = document.getElementById('modal-store-statement');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

// ==================== DRAWER & RIDER PERFORMANCE MODAL ====================
function openOrderDrawer(orderId) {
    const o = appState.orders.find(item => item.id === orderId);
    if (!o) return;
    uiState.selectedOrderId = orderId;

    const st = getStore(o.storeId);
    const rd = getRider(o.riderId);
    const { totalMins, deliveryMins, waitMins, roadMins } = getOrderDurations(o);
    const isRet = o.status === 'returning' || o.status === 'returned';

    document.getElementById('drawer-order-id').textContent = `#${o.id}`;
    const badge = document.getElementById('drawer-status-badge');
    if (o.status === 'received') {
        badge.className = 'px-2.5 py-1 rounded-lg bg-statusPicked/20 border border-statusPicked/40 text-statusPicked text-xs font-black';
        badge.textContent = '1. تم الاستلام من المتجر';
    } else if (o.status === 'onway') {
        badge.className = 'px-2.5 py-1 rounded-lg bg-statusOnway/20 border border-statusOnway/40 text-statusOnway text-xs font-black';
        badge.textContent = '2. في الطريق للعميل';
    } else if (o.status === 'delivered') {
        badge.className = 'px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-black';
        badge.textContent = '3. تم التسليم (بانتظار التوريد)';
    } else if (o.status === 'returning') {
        badge.className = 'px-2.5 py-1 rounded-lg bg-red-500/20 border border-red-500/40 text-red-400 text-xs font-black';
        badge.textContent = '↩️ مرتجع (جاري إعادته للمتجر)';
    } else if (o.status === 'returned') {
        badge.className = 'px-2.5 py-1 rounded-lg bg-red-500/20 border border-red-500/40 text-red-300 text-xs font-black';
        badge.textContent = '↩️ مرتجع أُعيد للمتجر';
    } else {
        badge.className = 'px-2.5 py-1 rounded-lg bg-statusDone/20 border border-statusDone/40 text-statusDone text-xs font-black';
        badge.textContent = '4. تم التوريد والعودة';
    }

    const waMessage = buildWhatsAppMessage(o);

    document.getElementById('drawer-content').innerHTML = `
        ${isRet ? `
        <div class="bg-red-500/15 border border-red-500/40 rounded-2xl p-3.5 text-xs space-y-1">
            <div class="font-black text-red-400">⚠️ طلب مرتجع (لم يتم الاستلام)</div>
            <div class="text-slate-200 font-bold">السبب: ${escapeHTML(o.returnReason || 'غير محدد')}</div>
        </div>` : ''}

        <div class="bg-slateCard border border-slateBorder rounded-2xl p-4 space-y-4">
            <div class="flex items-center justify-between">
                <h4 class="text-xs font-black text-white">⏱️ دورة حياة الطلب الكاملة (${escapeHTML(o.dateStr)})</h4>
                <span class="text-xs font-black text-wassalOrange">المدة: ${deliveryMins} د</span>
            </div>

            <div class="relative pr-6 space-y-4 before:content-[''] before:absolute before:right-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slateBorder">
                <div class="relative">
                    <span class="absolute -right-6 top-1 w-3.5 h-3.5 rounded-full bg-statusPicked ring-4 ring-statusPicked/20"></span>
                    <div class="flex items-center justify-between text-xs">
                        <span class="font-black text-statusPicked">1. الاستلام من ${escapeHTML(st.name)}</span>
                        <span class="font-black text-white">${formatTime12(o.receivedTs)}</span>
                    </div>
                </div>

                <div class="relative">
                    <span class="absolute -right-6 top-1 w-3.5 h-3.5 rounded-full ${o.departedTs ? 'bg-statusOnway ring-4 ring-statusOnway/20' : 'bg-slate-600'}"></span>
                    <div class="flex items-center justify-between text-xs">
                        <span class="font-black ${o.departedTs ? 'text-statusOnway' : 'text-slate-500'}">2. التحرك للعميل</span>
                        <span class="font-black ${o.departedTs ? 'text-white' : 'text-slate-500'}">${formatTime12(o.departedTs)}</span>
                    </div>
                    ${waitMins !== null ? `<p class="text-[11px] text-slate-400">وقت التجهيز بالمتجر: ${waitMins} دقيقة</p>` : ''}
                </div>

                <div class="relative">
                    <span class="absolute -right-6 top-1 w-3.5 h-3.5 rounded-full ${isRet ? 'bg-red-500 ring-4 ring-red-500/20' : (o.deliveredTs ? 'bg-emerald-400 ring-4 ring-emerald-400/20' : 'bg-slate-600')}"></span>
                    <div class="flex items-center justify-between text-xs">
                        <span class="font-black ${isRet ? 'text-red-400' : (o.deliveredTs ? 'text-emerald-300' : 'text-slate-500')}">${isRet ? '3. تعذر التسليم (مرتجع)' : '3. التسليم للعميل'}</span>
                        <span class="font-black ${isRet ? 'text-red-400' : (o.deliveredTs ? 'text-emerald-300' : 'text-slate-500')}">${isRet ? formatTime12(o.returnedTs) : formatTime12(o.deliveredTs)}</span>
                    </div>
                    ${roadMins !== null ? `<p class="text-[11px] text-slate-400">مدة الطريق: ${roadMins} دقيقة</p>` : ''}
                </div>

                <div class="relative">
                    <span class="absolute -right-6 top-1 w-3.5 h-3.5 rounded-full ${o.settledTs ? 'bg-statusDone ring-4 ring-statusDone/20' : 'bg-slate-600'}"></span>
                    <div class="flex items-center justify-between text-xs">
                        <span class="font-black ${o.settledTs ? 'text-statusDone' : 'text-slate-500'}">${isRet ? '4. إعادة المرتجع للمتجر والعودة' : '4. التوريد للمتجر والعودة للمكتب'}</span>
                        <span class="font-black ${o.settledTs ? 'text-statusDone' : 'text-slate-500'}">${formatTime12(o.settledTs)}</span>
                    </div>
                    <p class="text-[11px] text-slate-400">${o.settledTs ? `إجمالي الدورة الكاملة: ${totalMins} دقيقة` : 'في انتظار عودة المندوب للمكتب'}</p>
                </div>
            </div>
        </div>

        <div class="bg-slateCard border border-slateBorder rounded-2xl p-4 space-y-3 text-xs">
            <div>
                <div class="text-[11px] text-slate-400">بيانات العميل والأصناف</div>
                <div class="font-black text-white text-sm mt-0.5">${escapeHTML(o.customerName)}</div>
                <div class="text-wassalOrange font-bold mt-0.5">📞 ${escapeHTML(o.phone)}</div>
                <div class="text-slate-300 mt-1">📍 ${escapeHTML(o.address)}</div>
                ${o.items ? `<div class="mt-2 p-2 rounded-lg bg-obsidian border border-wassalAmber/30 text-wassalAmber font-bold">🛒 الأصناف: ${escapeHTML(o.items)}</div>` : ''}
            </div>
            <div class="pt-3 border-t border-slateBorder flex items-center justify-between">
                <div>
                    <div class="text-[11px] text-slate-400">المندوب المكلف</div>
                    <div class="font-black text-white mt-0.5">${escapeHTML(rd.name)}</div>
                </div>
                <div class="text-left">
                    <div class="text-[11px] text-slate-400">الموتوسيكل</div>
                    <div class="font-bold text-wassalOrange mt-0.5">${escapeHTML(rd.bike)} (${escapeHTML(rd.plate)})</div>
                </div>
            </div>
        </div>

        <div class="bg-slateCard border border-slateBorder rounded-2xl p-4 space-y-2 text-xs">
            <div class="flex justify-between text-slate-300">
                <span>قيمة الأوردر للمتجر:</span>
                <span class="font-black ${isRet ? 'line-through text-slate-500' : 'text-white'}">${o.amount} ج.م</span>
            </div>
            <div class="flex justify-between text-slate-300">
                <span>رسوم التوصيل (وصّل):</span>
                <span class="font-black text-wassalOrange">${o.fee} ج.م</span>
            </div>
            <div class="pt-2 border-t border-slateBorder flex justify-between text-sm">
                <span class="font-black text-white">صافي المستحق تحصيله:</span>
                <span class="font-black ${isRet ? 'text-red-400' : 'text-statusDone'}">${isRet ? o.fee : (Number(o.amount) + Number(o.fee))} ج.م</span>
            </div>
        </div>

        <div class="bg-slateCard border border-statusDone/30 rounded-2xl p-3.5 space-y-2">
            <div class="flex items-center justify-between text-xs">
                <span class="font-black text-statusDone">💬 رسالة جروب الواتساب</span>
                <a href="https://wa.me/?text=${encodeURIComponent(waMessage)}" target="_blank" rel="noopener" class="text-[11px] text-statusOnway underline font-bold">فتح واتساب ويب ↗</a>
            </div>
            <textarea readonly rows="4" class="w-full bg-obsidian border border-slateBorder rounded-xl p-2.5 text-[11px] text-slate-200 leading-relaxed focus:outline-none">${escapeHTML(waMessage)}</textarea>
        </div>
    `;

    let primaryAction = '';
    if (o.status === 'received') {
        primaryAction = `<button type="button" data-action="move-onway" data-id="${escapeHTML(o.id)}" class="w-full py-3 rounded-xl bg-statusOnway text-obsidian font-black text-xs shadow-lg">تحرك للعميل الآن ➔</button>`;
    } else if (o.status === 'onway') {
        primaryAction = `
            <div class="grid grid-cols-3 gap-2">
                <button type="button" data-action="move-delivered" data-id="${escapeHTML(o.id)}" class="col-span-2 py-3 rounded-xl bg-statusDone text-obsidian font-black text-xs shadow-lg">✓ تأكيد التسليم</button>
                <button type="button" data-action="open-return-modal" data-id="${escapeHTML(o.id)}" class="py-3 rounded-xl bg-red-500 text-white font-black text-xs shadow-lg">↩️ مرتجع</button>
            </div>
        `;
    } else if (o.status === 'delivered') {
        primaryAction = `<button type="button" data-action="move-settled" data-id="${escapeHTML(o.id)}" class="w-full py-3 rounded-xl wassal-grad text-obsidian font-black text-xs shadow-lg">💰 تم التوريد للمتجر والعودة للمكتب</button>`;
    } else if (o.status === 'returning') {
        primaryAction = `<button type="button" data-action="move-returned-done" data-id="${escapeHTML(o.id)}" class="w-full py-3 rounded-xl bg-red-500 text-white font-black text-xs shadow-lg">📦 تم تسليم المرتجع للمتجر والعودة</button>`;
    }

    const deleteOrderBtn = isAdminUser()
        ? `<button type="button" data-action="delete-order" data-id="${escapeHTML(o.id)}" class="py-2.5 px-2 rounded-xl bg-red-500/15 hover:bg-red-500 text-red-400 hover:text-white border border-red-500/30 font-black text-[11px] transition-colors">🗑️ حذف</button>`
        : '';

    document.getElementById('drawer-footer').innerHTML = `
        ${primaryAction}
        <div class="grid ${isAdminUser() ? 'grid-cols-3' : 'grid-cols-2'} gap-1.5">
            <button type="button" data-action="open-edit-order" data-id="${escapeHTML(o.id)}" class="py-2.5 px-2 rounded-xl bg-statusOnway/15 hover:bg-statusOnway text-statusOnway hover:text-obsidian border border-statusOnway/30 font-black text-[11px] transition-colors">✏️ تعديل/تحويل</button>
            <button type="button" data-action="copy-whatsapp" data-id="${escapeHTML(o.id)}" class="py-2.5 px-2 rounded-xl bg-slateCard hover:bg-slateHover border border-slateBorder text-white font-black text-[11px]">📋 واتساب</button>
            ${deleteOrderBtn}
        </div>
    `;

    document.getElementById('order-drawer-backdrop').classList.remove('hidden');
    document.getElementById('order-drawer').classList.remove('-translate-x-full');
}

function closeOrderDrawer() {
    uiState.selectedOrderId = null;
    document.getElementById('order-drawer-backdrop').classList.add('hidden');
    document.getElementById('order-drawer').classList.add('-translate-x-full');
}

function openRiderStatsModal(riderId, period = 'today') {
    const r = appState.riders.find(item => item.id === riderId);
    if (!r) return;
    uiState.selectedRiderStatsId = riderId;
    uiState.riderStatsPeriod = period;

    document.getElementById('rstats-name').textContent = `كشف أداء المندوب: ${r.name}`;
    document.getElementById('rstats-sub').textContent = `${r.bike} • لوحة: ${r.plate} ${r.phone ? '• 📞 ' + r.phone : ''}`;

    document.querySelectorAll('.rstats-period-btn').forEach(btn => {
        if (btn.getAttribute('data-period') === period) {
            btn.className = 'rstats-period-btn px-3 py-1.5 rounded-lg text-xs font-black wassal-grad text-obsidian';
        } else {
            btn.className = 'rstats-period-btn px-3 py-1.5 rounded-lg text-xs font-bold text-slate-400 hover:text-white';
        }
    });

    const activeD = getActiveShiftDate();
    const monthPrefix = activeD.slice(0, 7);
    const [ay, am, ad] = activeD.split('-').map(Number);
    const sevenDaysAgo = new Date(ay, am - 1, ad - 6);
    const sevenDaysStr = `${sevenDaysAgo.getFullYear()}-${String(sevenDaysAgo.getMonth() + 1).padStart(2, '0')}-${String(sevenDaysAgo.getDate()).padStart(2, '0')}`;

    const riderAll = appState.orders.filter(o => o.riderId === riderId);
    const filtered = riderAll.filter(o => {
        const d = o.dateStr || activeD;
        if (period === 'today') return d === activeD;
        if (period === 'week') return d >= sevenDaysStr && d <= activeD;
        if (period === 'month') return d.startsWith(monthPrefix);
        return true;
    });

    const pickedCount = filtered.length;
    const deliveredCount = filtered.filter(o => o.status === 'delivered' || o.status === 'settled').length;
    const returnedCount = filtered.filter(o => o.status === 'returning' || o.status === 'returned').length;
    const settledList = filtered.filter(o => o.status === 'settled');
    const archivedList = filtered.filter(o => isOrderArchived(o));
    const totalFees = archivedList.reduce((s, o) => s + Number(o.fee), 0);
    const totalMerchantCash = settledList.reduce((s, o) => s + Number(o.amount), 0);

    const periodNames = {
        today: `اليوم (${activeD})`,
        week: `آخر 7 أيام (${sevenDaysStr} إلى ${activeD})`,
        month: `الشهر الحالي (${monthPrefix})`,
        all: 'منذ بداية التشغيل'
    };

    const rowsHTML = filtered.length === 0
        ? `<tr><td colspan="6" class="py-8 text-center text-slate-500">لا توجد أوردرات مسجلة لهذا المندوب في هذه الفترة</td></tr>`
        : filtered.map(o => {
            const st = getStore(o.storeId);
            const { deliveryMins } = getOrderDurations(o);
            const isRet = o.status === 'returning' || o.status === 'returned';
            const stBadge = o.status === 'settled'
                ? `<span class="text-statusDone font-black">✓ تم التوريد</span>`
                : isRet
                ? `<span class="text-red-400 font-black">↩️ مرتجع (${escapeHTML(o.returnReason || '')})</span>`
                : o.status === 'delivered'
                ? `<span class="text-emerald-300 font-bold">سُلّم (توريد)</span>`
                : o.status === 'onway'
                ? `<span class="text-statusOnway font-bold">في الطريق</span>`
                : `<span class="text-statusPicked font-bold">مستلم</span>`;
            return `
                <tr class="hover:bg-slateCard/70">
                    <td class="px-3 py-2.5 font-black text-wassalOrange">#${escapeHTML(o.id)}</td>
                    <td class="px-3 py-2.5 font-mono text-slate-400">${escapeHTML(o.dateStr)}</td>
                    <td class="px-3 py-2.5 font-bold text-white">${escapeHTML(st.name)}</td>
                    <td class="px-3 py-2.5 text-slate-300">${escapeHTML(o.customerName)}</td>
                    <td class="px-3 py-2.5">${stBadge}</td>
                    <td class="px-3 py-2.5 font-black text-white">${isRet ? 'مرتجع' : o.amount + ' ج.م'} + <span class="text-wassalOrange">${o.fee} ج.م</span> ${o.deliveredTs ? `(${deliveryMins}د)` : ''}</td>
                </tr>
            `;
        }).join('');

    document.getElementById('rstats-body').innerHTML = `
        <div class="text-xs font-bold text-wassalOrange">الفترة المعروضة: ${escapeHTML(periodNames[period])}</div>

        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 text-center text-xs">
            <div class="bg-obsidian border border-statusPicked/40 rounded-xl p-3">
                <div class="text-[10px] text-statusPicked font-bold">طلع / استلم</div>
                <div class="text-xl font-black text-white mt-1">${pickedCount}</div>
            </div>
            <div class="bg-obsidian border border-emerald-500/40 rounded-xl p-3">
                <div class="text-[10px] text-emerald-300 font-bold">سلّم بنجاح</div>
                <div class="text-xl font-black text-emerald-300 mt-1">${deliveredCount}</div>
            </div>
            <div class="bg-obsidian border border-red-500/40 rounded-xl p-3">
                <div class="text-[10px] text-red-400 font-bold">مرتجع</div>
                <div class="text-xl font-black text-red-400 mt-1">${returnedCount}</div>
            </div>
            <div class="bg-obsidian border border-statusDone/40 rounded-xl p-3">
                <div class="text-[10px] text-statusDone font-bold">تم التوريد</div>
                <div class="text-xl font-black text-statusDone mt-1">${settledList.length}</div>
            </div>
            <div class="bg-obsidian border border-wassalOrange/40 rounded-xl p-3">
                <div class="text-[10px] text-wassalOrange font-bold">رسوم التوصيل</div>
                <div class="text-base font-black text-wassalOrange mt-1.5">${totalFees} ج.م</div>
            </div>
            <div class="bg-obsidian border border-slateBorder rounded-xl p-3">
                <div class="text-[10px] text-slate-400">مبالغ موردة</div>
                <div class="text-base font-black text-white mt-1.5">${totalMerchantCash} ج.م</div>
            </div>
        </div>

        <div class="border border-slateBorder rounded-xl overflow-hidden">
            <div class="bg-slateCard px-3.5 py-2.5 text-xs font-black text-white border-b border-slateBorder">سجل رحلات المندوب في هذه الفترة</div>
            <div class="overflow-x-auto max-h-60">
                <table class="w-full text-right text-xs">
                    <thead class="bg-obsidian text-slate-400 border-b border-slateBorder">
                        <tr>
                            <th class="px-3 py-2">#</th>
                            <th class="px-3 py-2">التاريخ</th>
                            <th class="px-3 py-2">المتجر</th>
                            <th class="px-3 py-2">العميل</th>
                            <th class="px-3 py-2">الحالة</th>
                            <th class="px-3 py-2">المبلغ والمدة</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slateBorder">${rowsHTML}</tbody>
                </table>
            </div>
        </div>
    `;

    const modal = document.getElementById('modal-rider-stats');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

// ==================== RENDER RIDERS, STORES, ACCOUNTING ====================
function renderRiders() {
    const stats = getAnalyticsSummary(getCurrentMonthStr());
    const topToday = [...stats.riderStats].sort((a, b) => b.todayCount - a.todayCount)[0];
    const topMonth = stats.riderStats[0];

    const headingEl = document.getElementById('riders-view-heading');
    if (headingEl) headingEl.textContent = `أسطول المناديب والموتوسيكلات (${appState.riders.length} طيارين)`;

    document.getElementById('riders-top-today-badge').textContent = (topToday && topToday.todayCount > 0)
        ? `⚡ نجم اليوم: ${topToday.rider.name} (${topToday.todayCount} أوردر)` : `⚡ نجم اليوم: —`;
    document.getElementById('riders-top-month-badge').textContent = (topMonth && topMonth.monthCount > 0)
        ? `🏆 نجم الشهر: ${topMonth.rider.name} (${topMonth.monthCount} أوردر)` : `🏆 نجم الشهر: —`;

    const grid = document.getElementById('riders-grid');
    if (appState.riders.length === 0) {
        grid.innerHTML = `<div class="col-span-full bg-slateDark border border-dashed border-slateBorder rounded-2xl p-10 text-center text-slate-400 text-xs">لا يوجد مناديب مسجلون حالياً.</div>`;
        return;
    }

    grid.innerHTML = appState.riders.map((r, idx) => {
        const rStat = stats.riderStats.find(item => item.rider.id === r.id) || { todayCount: 0, monthCount: 0, feeMonth: 0, avgMins: null };
        const riderOrders = appState.orders.filter(o => o.riderId === r.id);
        const activeOrder = riderOrders.find(o => isOrderActiveInRoom(o));
        const isTopMonth = topMonth && topMonth.rider.id === r.id && topMonth.monthCount > 0;

        const statusMap = {
            available: { label: '🟢 متاح في المكتب', cls: 'bg-statusDone/15 border border-statusDone/40 text-statusDone' },
            busy: { label: '🔵 في مهمة', cls: 'bg-statusOnway/15 border border-statusOnway/40 text-statusOnway' },
            off: { label: '⚪ خارج العمل / غير متاح', cls: 'bg-slateCard border border-slateBorder text-slate-400' }
        };
        const stObj = statusMap[r.status] || statusMap.available;

        let destHTML = `<div class="text-xs text-slate-500 bg-obsidian rounded-xl p-2.5 border border-slateBorder">متواجد بالمكتب وجاهز لاستلام أوردرات</div>`;
        if (activeOrder) {
            const st = getStore(activeOrder.storeId);
            const { totalMins } = getOrderDurations(activeOrder);
            destHTML = `
                <div class="text-xs bg-statusOnway/10 border border-statusOnway/30 rounded-xl p-2.5 space-y-1">
                    <div class="flex justify-between font-black text-statusOnway">
                        <span>مهمة حالية (#${escapeHTML(activeOrder.id)})</span>
                        <span>منذ ${totalMins} د</span>
                    </div>
                    <div class="text-white font-bold">${escapeHTML(st.name)} ➔ ${escapeHTML(activeOrder.address)}</div>
                </div>
            `;
        } else if (r.status === 'off') {
            destHTML = `<div class="text-xs text-slate-400 bg-obsidian/70 rounded-xl p-2.5 border border-dashed border-slateBorder">خارج العمل حالياً (مخفي من قائمة اختيار الطلبات الجديدة)</div>`;
        }

        const adminRiderBtns = isAdminUser() ? `
            <button type="button" data-action="toggle-rider-avail" data-id="${escapeHTML(r.id)}" class="px-2.5 py-2 rounded-xl bg-slateCard hover:bg-slateHover border border-slateBorder text-xs font-bold text-slate-200">
                ${r.status === 'off' ? '🟢 تفعيل' : '⚪ إيقاف'}
            </button>
            <button type="button" data-action="edit-rider" data-id="${escapeHTML(r.id)}" class="px-2.5 py-2 rounded-xl bg-statusOnway/15 hover:bg-statusOnway text-statusOnway hover:text-obsidian border border-statusOnway/30 text-xs font-black">
                تعديل
            </button>
            <button type="button" data-action="delete-rider" data-id="${escapeHTML(r.id)}" class="px-2.5 py-2 rounded-xl bg-red-500/15 hover:bg-red-500 text-red-400 hover:text-white border border-red-500/30 text-xs font-black">
                حذف
            </button>
        ` : '';

        return `
            <div data-action="open-rider-stats" data-id="${escapeHTML(r.id)}" class="cursor-pointer bg-slateDark border ${isTopMonth ? 'border-wassalOrange/70 shadow-lg shadow-orange-500/10' : 'border-slateBorder hover:border-wassalOrange/60'} ${r.status === 'off' ? 'opacity-75' : ''} transition-all rounded-2xl p-5 flex flex-col justify-between space-y-4">
                <div class="space-y-3">
                    <div class="flex items-start justify-between gap-2">
                        <div class="flex items-center gap-3">
                            <div class="w-11 h-11 rounded-xl wassal-grad text-obsidian font-black flex items-center justify-center text-sm shadow-md shrink-0">#${idx + 1}</div>
                            <div>
                                <div class="flex items-center gap-1.5">
                                    <h3 class="font-black text-base text-white">${escapeHTML(r.name)}</h3>
                                    ${isTopMonth ? `<span class="text-xs">👑</span>` : ''}
                                </div>
                                <p class="text-xs text-slate-400">${escapeHTML(r.bike)} • <span class="text-wassalOrange font-bold">${escapeHTML(r.plate)}</span></p>
                            </div>
                        </div>
                        <span class="px-2.5 py-1 rounded-lg text-[11px] font-black shrink-0 ${stObj.cls}">${stObj.label}</span>
                    </div>
                    ${destHTML}
                </div>

                <div class="pt-3 border-t border-slateBorder space-y-3">
                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                        <div class="bg-obsidian rounded-xl p-2 border border-statusDone/30">
                            <div class="text-[10px] text-statusDone font-bold">اليوم</div>
                            <div class="font-black text-white text-base mt-0.5">${rStat.todayCount}</div>
                        </div>
                        <div class="bg-obsidian rounded-xl p-2 border border-wassalOrange/30">
                            <div class="text-[10px] text-wassalOrange font-bold">الشهر</div>
                            <div class="font-black text-wassalOrange text-base mt-0.5">${rStat.monthCount}</div>
                        </div>
                        <div class="bg-obsidian rounded-xl p-2 border border-slateBorder">
                            <div class="text-[10px] text-slate-400">توصيل الشهر</div>
                            <div class="font-black text-white text-xs mt-1">${rStat.feeMonth} ج.م</div>
                        </div>
                        <div class="bg-obsidian rounded-xl p-2 border border-slateBorder">
                            <div class="text-[10px] text-slate-400">السرعة</div>
                            <div class="font-black text-statusOnway text-xs mt-1">${rStat.avgMins !== null ? rStat.avgMins + ' د' : '—'}</div>
                        </div>
                    </div>
                    <div class="flex items-center gap-1.5">
                        <button type="button" data-action="open-rider-stats" data-id="${escapeHTML(r.id)}" class="flex-1 py-2 px-2 rounded-xl wassal-grad text-obsidian text-xs font-black">
                            📊 كشف الأداء
                        </button>
                        ${adminRiderBtns}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function renderStores() {
    const stats = getAnalyticsSummary(getCurrentMonthStr());
    const ranked = stats.storeStats;
    const top = ranked[0];

    const banner = document.getElementById('top-merchant-banner');
    if (top && top.monthCount > 0) {
        banner.innerHTML = `
            <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div class="flex items-center gap-4">
                    <div class="w-14 h-14 rounded-2xl wassal-grad text-obsidian flex items-center justify-center text-2xl shadow-lg shadow-orange-500/25 shrink-0">👑</div>
                    <div>
                        <div class="text-xs font-black text-statusPicked">أكثر تاجر / متجر عملاً مع وصّل هذا الشهر</div>
                        <h3 class="text-xl font-black text-white mt-0.5">${escapeHTML(top.store.name)} <span class="text-xs px-2.5 py-0.5 rounded-full bg-wassalOrange/20 text-wassalOrange font-bold mr-1">${escapeHTML(top.store.category)}</span></h3>
                        <p class="text-xs text-slate-400 mt-1">يستحوذ على <strong class="text-white">${top.sharePct}%</strong> من إجمالي أوردرات الشهر بمبيعات موردة قدرها <strong class="text-statusDone">${top.settledMonth.toLocaleString('ar-EG')} ج.م</strong></p>
                    </div>
                </div>
                <div class="grid grid-cols-3 gap-3 text-center">
                    <div class="bg-obsidian/90 border border-slateBorder rounded-xl px-4 py-2.5">
                        <div class="text-[10px] text-slate-400 font-bold">أوردرات اليوم</div>
                        <div class="text-lg font-black text-white">${top.todayCount}</div>
                    </div>
                    <div class="bg-obsidian/90 border border-wassalOrange/40 rounded-xl px-4 py-2.5">
                        <div class="text-[10px] text-wassalOrange font-bold">أوردرات الشهر</div>
                        <div class="text-lg font-black text-wassalOrange">${top.monthCount}</div>
                    </div>
                    <div class="bg-obsidian/90 border border-slateBorder rounded-xl px-4 py-2.5">
                        <div class="text-[10px] text-slate-400 font-bold">إيراد التوصيل</div>
                        <div class="text-lg font-black text-statusDone">${top.feeMonth} ج.م</div>
                    </div>
                </div>
            </div>
        `;
    } else {
        banner.innerHTML = `<div class="text-xs text-slate-400 text-center py-2">لا توجد أوردرات مسجلة هذا الشهر لعرض ترتيب المتاجر</div>`;
    }

    const grid = document.getElementById('stores-grid');
    if (ranked.length === 0) {
        grid.innerHTML = `<div class="col-span-full bg-slateDark border border-dashed border-slateBorder rounded-2xl p-10 text-center text-slate-400 text-xs">لا توجد متاجر مسجلة حالياً.</div>`;
        return;
    }

    grid.innerHTML = ranked.map((item, idx) => {
        const s = item.store;
        const isFirst = idx === 0 && item.monthCount > 0;
        const deleteStoreBtn = isAdminUser()
            ? `<button type="button" data-action="delete-store" data-id="${escapeHTML(s.id)}" class="px-3 py-2.5 rounded-xl bg-red-500/15 hover:bg-red-500 text-red-400 hover:text-white border border-red-500/30 text-xs font-black transition-colors">حذف</button>`
            : '';

        return `
            <div class="bg-slateDark border ${isFirst ? 'border-statusPicked/70 shadow-lg shadow-amber-500/10' : 'border-slateBorder hover:border-wassalOrange/50'} transition-all rounded-2xl p-5 space-y-4">
                <div class="flex items-start justify-between">
                    <div>
                        <div class="flex items-center gap-2">
                            <span class="px-2 py-0.5 rounded-md ${isFirst ? 'bg-statusPicked text-obsidian font-black' : 'bg-obsidian text-slate-300 border border-slateBorder font-bold'} text-[11px]">#${idx + 1}</span>
                            <span class="text-[10px] px-2.5 py-0.5 rounded-md bg-wassalOrange/15 border border-wassalOrange/30 text-wassalOrange font-black">${escapeHTML(s.category)}</span>
                        </div>
                        <h3 class="font-black text-base text-white mt-2">${escapeHTML(s.name)} ${isFirst ? '👑' : ''}</h3>
                    </div>
                    <span class="text-xs font-black text-wassalOrange bg-obsidian px-2.5 py-1 rounded-lg border border-wassalOrange/30">توصيل: ${s.fee} ج.م</span>
                </div>

                <div class="space-y-1">
                    <div class="flex justify-between text-[11px]">
                        <span class="text-slate-400">نسبة مساهمته في أوردرات الشهر</span>
                        <span class="font-black text-white">${item.sharePct}%</span>
                    </div>
                    <div class="w-full h-2 bg-obsidian rounded-full overflow-hidden border border-slateBorder">
                        <div class="h-full wassal-grad rounded-full transition-all duration-500" style="width:${item.sharePct}%"></div>
                    </div>
                </div>

                <div class="text-xs text-slate-400 space-y-1">
                    <p>📍 ${escapeHTML(s.address)}</p>
                    <p>📞 ${escapeHTML(s.phone)}</p>
                </div>

                <div class="grid grid-cols-3 gap-2 text-center text-xs pt-2 border-t border-slateBorder">
                    <div class="bg-obsidian rounded-xl p-2 border border-slateBorder">
                        <div class="text-[10px] text-slate-400">اليوم</div>
                        <div class="font-black text-white text-sm">${item.todayCount}</div>
                    </div>
                    <div class="bg-obsidian rounded-xl p-2 border border-wassalOrange/30">
                        <div class="text-[10px] text-wassalOrange">الشهر</div>
                        <div class="font-black text-wassalOrange text-sm">${item.monthCount}</div>
                    </div>
                    <div class="bg-obsidian rounded-xl p-2 border border-slateBorder">
                        <div class="text-[10px] text-slate-400">مبيعات الشهر</div>
                        <div class="font-black text-statusDone text-xs mt-0.5">${item.settledMonth} ج.م</div>
                    </div>
                </div>

                <div class="pt-2 flex items-center gap-2">
                    <button type="button" data-action="open-store-statement" data-id="${escapeHTML(s.id)}" class="flex-1 py-2.5 rounded-xl wassal-grad wassal-grad-hover text-obsidian font-black text-xs shadow-md">
                        📄 كشف حساب وتصفية
                    </button>
                    ${deleteStoreBtn}
                </div>
            </div>
        `;
    }).join('');
}

function renderAccounting() {
    const targetMonth = uiState.reportMonth || getCurrentMonthStr();
    const stats = getAnalyticsSummary(targetMonth);

    document.getElementById('pnl-today-date').textContent = `وردية اليوم: ${stats.today}`;
    document.getElementById('pnl-today-rev').textContent = `${stats.todayRev.toLocaleString('ar-EG')} ج.م`;
    document.getElementById('pnl-today-exp').textContent = `${stats.todayExp.toLocaleString('ar-EG')} ج.م`;
    const todayNetEl = document.getElementById('pnl-today-net');
    todayNetEl.textContent = `${stats.todayProfit.toLocaleString('ar-EG')} ج.م`;
    todayNetEl.className = `font-black text-lg ${stats.todayProfit >= 0 ? 'text-wassalOrange' : 'text-red-400'}`;
    const todayMargin = stats.todayRev > 0 ? Math.round((stats.todayProfit / stats.todayRev) * 100) : 0;
    document.getElementById('pnl-today-margin').textContent = `هامش الربح: ${todayMargin}%`;
    document.getElementById('pnl-today-settled').textContent = `${stats.todaySettled.toLocaleString('ar-EG')} ج.م`;

    document.getElementById('pnl-month-label').textContent = `الفترة المحاسبية: ${targetMonth}`;
    document.getElementById('pnl-month-orders-count').textContent = stats.monthSettledOrders.length;
    document.getElementById('pnl-month-exp-count').textContent = stats.monthExpensesList.length;
    document.getElementById('pnl-month-rev').textContent = `${stats.monthRev.toLocaleString('ar-EG')} ج.م`;
    document.getElementById('pnl-month-exp').textContent = `${stats.monthExp.toLocaleString('ar-EG')} ج.م`;
    const monthNetEl = document.getElementById('pnl-month-net');
    monthNetEl.textContent = `${stats.monthProfit.toLocaleString('ar-EG')} ج.م`;
    monthNetEl.className = `font-black text-lg ${stats.monthProfit >= 0 ? 'text-statusDone' : 'text-red-400'}`;
    const monthMargin = stats.monthRev > 0 ? Math.round((stats.monthProfit / stats.monthRev) * 100) : 0;
    document.getElementById('pnl-month-margin').textContent = `هامش الربح: ${monthMargin}%`;
    document.getElementById('pnl-month-settled').textContent = `${stats.monthSettled.toLocaleString('ar-EG')} ج.م`;

    const catTotals = {};
    stats.monthExpensesList.forEach(e => {
        catTotals[e.category] = (catTotals[e.category] || 0) + Number(e.amount);
    });
    const catEntries = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);
    const barsContainer = document.getElementById('expense-categories-bars');
    if (catEntries.length === 0) {
        barsContainer.innerHTML = `<div class="col-span-full text-center text-xs text-slate-500 py-1">لا توجد مصروفات مسجلة في شهر ${escapeHTML(targetMonth)}</div>`;
    } else {
        barsContainer.innerHTML = catEntries.map(([cat, val]) => {
            const pct = stats.monthExp > 0 ? Math.round((val / stats.monthExp) * 100) : 0;
            return `
                <div class="bg-slateDark border border-slateBorder rounded-xl p-2.5 space-y-1.5">
                    <div class="flex justify-between text-[11px]">
                        <span class="font-bold text-slate-200 truncate">${escapeHTML(cat)}</span>
                        <span class="font-black text-red-400">${val} ج.م (${pct}%)</span>
                    </div>
                    <div class="w-full h-1.5 bg-obsidian rounded-full overflow-hidden">
                        <div class="h-full bg-red-500 rounded-full" style="width:${pct}%"></div>
                    </div>
                </div>
            `;
        }).join('');
    }

    const filteredExpenses = stats.monthExpensesList.filter(e => uiState.expenseCatFilter === 'all' || e.category === uiState.expenseCatFilter);
    const expTbody = document.getElementById('expenses-table-body');
    if (filteredExpenses.length === 0) {
        expTbody.innerHTML = `<tr><td colspan="6" class="py-8 text-center text-slate-500">لا توجد مصروفات مطابقة</td></tr>`;
    } else {
        expTbody.innerHTML = filteredExpenses.map(e => {
            const rdName = e.riderId ? getRider(e.riderId).name : 'مصروف إداري عام';
            const delExpBtn = isAdminUser()
                ? `<button type="button" data-action="delete-expense" data-id="${escapeHTML(e.id)}" class="px-2 py-1 rounded-lg bg-red-500/15 hover:bg-red-500 text-red-400 hover:text-white text-[11px] font-bold transition-colors">✕</button>`
                : '—';
            return `
                <tr class="hover:bg-slateCard/80">
                    <td class="px-3.5 py-3 text-slate-400 font-mono">${escapeHTML(e.dateStr)}</td>
                    <td class="px-3.5 py-3">
                        <div class="font-bold text-white">${escapeHTML(e.title)}</div>
                        ${e.notes ? `<div class="text-[10px] text-slate-400">${escapeHTML(e.notes)}</div>` : ''}
                    </td>
                    <td class="px-3.5 py-3"><span class="px-2 py-0.5 rounded bg-obsidian border border-slateBorder text-[11px] text-slate-300">${escapeHTML(e.category)}</span></td>
                    <td class="px-3.5 py-3 text-slate-300 font-bold">${escapeHTML(rdName)}</td>
                    <td class="px-3.5 py-3 font-black text-red-400">${Number(e.amount).toLocaleString('ar-EG')} ج.م</td>
                    <td class="px-3.5 py-3 text-center no-print">${delExpBtn}</td>
                </tr>
            `;
        }).join('');
    }

    const storesBody = document.getElementById('stores-accounting-body');
    if (stats.storeStats.length === 0) {
        storesBody.innerHTML = `<tr><td colspan="8" class="py-8 text-center text-slate-500">لا توجد متاجر مسجلة بعد</td></tr>`;
    } else {
        storesBody.innerHTML = stats.storeStats.map((item, idx) => {
            const s = item.store;
            const rankBadge = idx === 0 && item.monthCount > 0 ? '👑 #1' : `#${idx + 1}`;
            return `
                <tr class="hover:bg-slateCard/80 ${idx === 0 && item.monthCount > 0 ? 'bg-statusPicked/5' : ''}">
                    <td class="px-4 py-3 font-black ${idx === 0 && item.monthCount > 0 ? 'text-statusPicked' : 'text-slate-400'}">${rankBadge}</td>
                    <td class="px-4 py-3 font-black text-white">${escapeHTML(s.name)}</td>
                    <td class="px-4 py-3 text-slate-400">${escapeHTML(s.category)}</td>
                    <td class="px-4 py-3 font-bold text-white">${item.todayCount}</td>
                    <td class="px-4 py-3 font-black text-wassalOrange text-sm">${item.monthCount}</td>
                    <td class="px-4 py-3">
                        <div class="flex items-center gap-2">
                            <div class="w-16 h-1.5 bg-obsidian rounded-full overflow-hidden">
                                <div class="h-full wassal-grad" style="width:${item.sharePct}%"></div>
                            </div>
                            <span class="font-bold text-slate-200">${item.sharePct}%</span>
                        </div>
                    </td>
                    <td class="px-4 py-3 font-black text-statusDone">${item.settledMonth.toLocaleString('ar-EG')} ج.م</td>
                    <td class="px-4 py-3 font-black text-white">${item.feeMonth.toLocaleString('ar-EG')} ج.م</td>
                </tr>
            `;
        }).join('');
    }

    const ridersBody = document.getElementById('riders-accounting-body');
    if (stats.riderStats.length === 0) {
        ridersBody.innerHTML = `<tr><td colspan="8" class="py-8 text-center text-slate-500">لا يوجد مناديب مسجلون بعد</td></tr>`;
    } else {
        ridersBody.innerHTML = stats.riderStats.map((item, idx) => {
            const r = item.rider;
            const rankBadge = idx === 0 && item.monthCount > 0 ? '🏆 #1' : `#${idx + 1}`;
            return `
                <tr class="hover:bg-slateCard/80">
                    <td class="px-4 py-3 font-black ${idx === 0 && item.monthCount > 0 ? 'text-wassalOrange' : 'text-slate-400'}">${rankBadge}</td>
                    <td class="px-4 py-3 font-black text-white">${escapeHTML(r.name)}</td>
                    <td class="px-4 py-3 text-slate-400">${escapeHTML(r.bike)} (${escapeHTML(r.plate)})</td>
                    <td class="px-4 py-3 font-black text-statusDone text-sm">${item.todayCount}</td>
                    <td class="px-4 py-3 font-black text-wassalOrange text-sm">${item.monthCount}</td>
                    <td class="px-4 py-3 font-bold text-statusOnway">${item.avgMins !== null ? item.avgMins + ' دقيقة' : '—'}</td>
                    <td class="px-4 py-3 font-bold text-white">${item.settledMonth.toLocaleString('ar-EG')} ج.م</td>
                    <td class="px-4 py-3 font-black text-wassalOrange">${item.feeMonth.toLocaleString('ar-EG')} ج.م</td>
                </tr>
            `;
        }).join('');
    }
}

// ==================== BACKUP, RESTORE (CHUNKED) & CSV EXPORT ====================
function downloadFullBackupJSON() {
    const payload = {
        exportedAt: new Date().toISOString(),
        exportedBy: currentUser ? currentUser.email : 'unknown',
        system: 'WASSAL Delivery Operations (Firestore Secured)',
        data: appState
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `WASSAL_Backup_${getActiveShiftDate()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('💾 تم تحميل النسخة الاحتياطية الكاملة بنجاح');
}

function handleRestoreBackupFile(file) {
    if (!isAdminUser()) {
        showToast('⛔ استعادة النسخة الاحتياطية متاحة لمدير النظام فقط');
        return;
    }
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
        try {
            const parsed = JSON.parse(ev.target.result);
            const restored = parsed.data || parsed;
            if (!restored || typeof restored !== 'object' || !Array.isArray(restored.orders)) {
                showToast('⚠️ ملف النسخة الاحتياطية غير صالح');
                return;
            }
            const ok = window.confirm(`هل تريد استعادة النسخة الاحتياطية؟\nسيتم استبدال البيانات الحالية بـ: ${restored.orders.length} طلب، ${restored.riders?.length || 0} مندوب، ${restored.stores?.length || 0} متجر.`);
            if (!ok) return;

            setSyncStatus('pending');
            const ops = [];

            // حذف المستندات القديمة غير الموجودة في النسخة المستعادة
            const newOrderIds = new Set((restored.orders || []).map(o => String(o.id)));
            const newRiderIds = new Set((restored.riders || []).map(r => String(r.id)));
            const newStoreIds = new Set((restored.stores || []).map(s => String(s.id)));
            const newExpIds = new Set((restored.expenses || []).map(e => String(e.id)));

            appState.orders.forEach(o => { if (!newOrderIds.has(String(o.id))) ops.push({ type: 'delete', ref: fb.doc(fb.db, 'wassal_orders', String(o.id)) }); });
            appState.riders.forEach(r => { if (!newRiderIds.has(String(r.id))) ops.push({ type: 'delete', ref: fb.doc(fb.db, 'wassal_riders', String(r.id)) }); });
            appState.stores.forEach(s => { if (!newStoreIds.has(String(s.id))) ops.push({ type: 'delete', ref: fb.doc(fb.db, 'wassal_stores', String(s.id)) }); });
            appState.expenses.forEach(e => { if (!newExpIds.has(String(e.id))) ops.push({ type: 'delete', ref: fb.doc(fb.db, 'wassal_expenses', String(e.id)) }); });

            // كتابة المستندات المستعادة
            (restored.riders || []).forEach(r => ops.push({ type: 'set', ref: fb.doc(fb.db, 'wassal_riders', String(r.id)), data: { ...r } }));
            (restored.stores || []).forEach(s => ops.push({ type: 'set', ref: fb.doc(fb.db, 'wassal_stores', String(s.id)), data: { ...s } }));
            (restored.orders || []).forEach(o => ops.push({ type: 'set', ref: fb.doc(fb.db, 'wassal_orders', String(o.id)), data: { ...o } }));
            (restored.expenses || []).forEach(e => ops.push({ type: 'set', ref: fb.doc(fb.db, 'wassal_expenses', String(e.id)), data: { ...e } }));

            ops.push({
                type: 'set',
                ref: fb.doc(fb.db, 'wassal_meta', 'config'),
                data: {
                    activeDate: restored.activeDate || getSystemTodayStr(),
                    closedDays: Array.isArray(restored.closedDays) ? restored.closedDays : [],
                    nextOrderNum: Number(restored.nextOrderNum) || 101
                }
            });

            await commitOperationsInChunks(ops);

            const secModal = document.getElementById('modal-security');
            if (secModal) {
                secModal.classList.add('hidden');
                secModal.classList.remove('flex');
            }
            setSyncStatus('online');
            showToast('✅ تمت استعادة البيانات ومزامنتها بالكامل بنجاح');
        } catch (err) {
            console.error('Restore error:', err);
            setSyncStatus('offline');
            showToast('⚠️ تعذر استعادة الملف — تأكد من صحة البيانات والصلاحيات');
        }
    };
    reader.readAsText(file);
}

function exportMonthlyCSV() {
    const targetMonth = uiState.reportMonth || getCurrentMonthStr();
    const stats = getAnalyticsSummary(targetMonth);
    const lines = [];
    lines.push('\uFEFFتقرير شركة وصّل - WASSAL لشهر ' + targetMonth);
    lines.push(`إجمالي أوردرات الشهر,${stats.monthOrders.length},إيرادات التوصيل,${stats.monthRev},المصروفات,${stats.monthExp},صافي الربح,${stats.monthProfit}`);
    lines.push('');
    lines.push('--- أداء المناديب ---');
    lines.push('المندوب,أوردرات اليوم,أوردرات الشهر,إيراد التوصيل الشهري,مبالغ موردة للتجار');
    stats.riderStats.forEach(r => {
        lines.push(`"${r.rider.name}",${r.todayCount},${r.monthCount},${r.feeMonth},${r.settledMonth}`);
    });
    lines.push('');
    lines.push('--- ترتيب المتاجر ---');
    lines.push('المتجر,التصنيف,أوردرات اليوم,أوردرات الشهر,نسبة المساهمة %,مبيعات موردة');
    stats.storeStats.forEach(s => {
        lines.push(`"${s.store.name}","${s.store.category}",${s.todayCount},${s.monthCount},${s.sharePct}%,${s.settledMonth}`);
    });
    lines.push('');
    lines.push('--- سجل المصروفات ---');
    lines.push('التاريخ,البيان,التصنيف,المبلغ,ملاحظات');
    stats.monthExpensesList.forEach(e => {
        lines.push(`${e.dateStr},"${e.title}","${e.category}",${e.amount},"${e.notes || ''}"`);
    });

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `WASSAL_Report_${targetMonth}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`📊 تم تصدير تقرير شهر ${targetMonth} بصيغة CSV`);
}

function populateExpenseFormDefaults() {
    const expRiderSel = document.getElementById('exp-rider');
    if (expRiderSel) {
        expRiderSel.innerHTML = `<option value="">— مصروف عام للإدارة —</option>` +
            appState.riders.map(r => `<option value="${escapeHTML(r.id)}">${escapeHTML(r.name)} (${escapeHTML(r.plate)})</option>`).join('');
    }
    const expDateInput = document.getElementById('exp-date');
    if (expDateInput && !expDateInput.value) {
        expDateInput.value = getActiveShiftDate();
    }
    const monthPicker = document.getElementById('report-month-picker');
    if (monthPicker && !monthPicker.value) {
        monthPicker.value = uiState.reportMonth;
    }
}

function renderAll() {
    applyRolePermissionsUI();
    populateExpenseFormDefaults();
    renderKPIs();
    renderFleetRibbon();
    renderOrdersBoardAndTable();
    renderArchive();
    renderRiders();
    renderStores();
    renderAccounting();
    if (uiState.selectedOrderId) {
        const stillExists = appState.orders.some(o => o.id === uiState.selectedOrderId);
        if (stillExists) openOrderDrawer(uiState.selectedOrderId);
        else closeOrderDrawer();
    }
}

function switchTab(tabName) {
    uiState.activeTab = tabName;
    document.querySelectorAll('.view-section').forEach(sec => sec.classList.add('hidden'));
    const target = document.getElementById(`view-${tabName}`);
    if (target) target.classList.remove('hidden');

    document.querySelectorAll('.nav-tab').forEach(btn => {
        btn.classList.remove('wassal-grad', 'text-obsidian', 'font-extrabold', 'shadow-lg', 'shadow-orange-500/20');
        btn.classList.add('text-slate-300', 'font-bold', 'hover:text-white', 'hover:bg-slateCard');
    });
    const activeTabBtn = document.getElementById(`tab-btn-${tabName}`);
    if (activeTabBtn) {
        activeTabBtn.classList.remove('text-slate-300', 'font-bold', 'hover:text-white', 'hover:bg-slateCard');
        activeTabBtn.classList.add('wassal-grad', 'text-obsidian', 'font-extrabold', 'shadow-lg', 'shadow-orange-500/20');
    }

    const titles = {
        operations: ['غرفة العمليات ومتابعة الطلبات الجارية', 'تم الاستلام ➔ تحرك للعميل ➔ تم التسليم (أو مرتجع) ➔ تم التوريد والعودة'],
        archive: ['أرشيف الطلبات المنتهية وإقفال اليوميات', 'استعراض أي يوم سابق وإقفال اليوم الحالي لبدء يوم عمل جديد'],
        riders: [`أسطول المناديب والموتوسيكلات (${appState.riders.length} طيارين)`, 'اضغط على أي مندوب لعرض إحصائيات أوردراته أو تغيير حالته (متاح / خارج العمل)'],
        stores: ['المتاجر المتعاقدة وترتيب الأكثر عملاً', 'تصنيف المتاجر حسب حجم الأوردرات وكشف حساب لكل متجر'],
        accounting: ['المحاسبة والمصروفات وتقارير الإدارة', 'قائمة الدخل اليومية والشهرية، إدارة المصروفات، وتقارير التقفيل والطباعة']
    };
    if (titles[tabName]) {
        document.getElementById('header-title').textContent = titles[tabName][0];
        document.getElementById('header-subtitle').textContent = titles[tabName][1];
    }

    const sidebar = document.getElementById('sidebar');
    if (!sidebar.classList.contains('translate-x-full') && window.innerWidth < 1024) {
        sidebar.classList.add('translate-x-full');
        document.getElementById('sidebar-backdrop').classList.add('hidden');
    }
    renderAll();
}

function setViewMode(mode) {
    uiState.viewMode = mode;
    const kanbanEl = document.getElementById('operations-kanban-container');
    const tableEl = document.getElementById('operations-table-container');
    const btnK = document.getElementById('view-btn-kanban');
    const btnT = document.getElementById('view-btn-table');

    if (mode === 'kanban') {
        kanbanEl.classList.remove('hidden');
        tableEl.classList.add('hidden');
        btnK.className = 'px-3 py-1.5 rounded-lg text-xs font-black wassal-grad text-obsidian flex items-center gap-1.5 transition-all';
        btnT.className = 'px-3 py-1.5 rounded-lg text-xs font-bold text-slate-400 hover:text-white flex items-center gap-1.5 transition-all';
    } else {
        kanbanEl.classList.add('hidden');
        tableEl.classList.remove('hidden');
        btnT.className = 'px-3 py-1.5 rounded-lg text-xs font-black wassal-grad text-obsidian flex items-center gap-1.5 transition-all';
        btnK.className = 'px-3 py-1.5 rounded-lg text-xs font-bold text-slate-400 hover:text-white flex items-center gap-1.5 transition-all';
    }
}

function openNewOrderModal() {
    if (appState.stores.length === 0) {
        showToast('⚠️ يرجى إضافة متجر واحد على الأقل أولاً من تبويب المتاجر');
        switchTab('stores');
        return;
    }
    if (appState.riders.length === 0) {
        showToast('⚠️ يرجى إضافة مندوب واحد على الأقل أولاً من تبويب المناديب');
        switchTab('riders');
        return;
    }

    const activeD = getActiveShiftDate();
    const dayBadge = document.getElementById('modal-order-active-day');
    if (dayBadge) dayBadge.textContent = activeD;

    const storeSel = document.getElementById('input-order-store');
    storeSel.innerHTML = appState.stores.map(s => `<option value="${escapeHTML(s.id)}">${escapeHTML(s.name)} (${escapeHTML(s.category)}) - توصيل ${s.fee} ج.م</option>`).join('');
    if (appState.stores.length > 0) {
        document.getElementById('input-order-fee').value = appState.stores[0].fee;
    }

    const availableRiders = appState.riders.filter(r => r.status === 'available');
    const riderSel = document.getElementById('input-order-rider');
    if (availableRiders.length === 0) {
        riderSel.innerHTML = `<option value="">⚠️ لا يوجد مناديب متاحين بالمكتب حالياً!</option>`;
    } else {
        riderSel.innerHTML = availableRiders.map(r => `<option value="${escapeHTML(r.id)}">🟢 ${escapeHTML(r.name)} (${escapeHTML(r.plate)})</option>`).join('');
    }

    resetOrderItemsRows();
    document.getElementById('input-order-time').value = '';
    const modal = document.getElementById('modal-new-order');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function openRiderModal(riderId = null) {
    if (!isAdminUser()) {
        showToast('⛔ إدارة المناديب متاحة لمدير النظام فقط');
        return;
    }
    const modal = document.getElementById('modal-rider');
    const titleEl = document.getElementById('modal-rider-title');
    const idInput = document.getElementById('input-rider-id');
    const nameInput = document.getElementById('input-rider-name');
    const bikeInput = document.getElementById('input-rider-bike');
    const plateInput = document.getElementById('input-rider-plate');
    const phoneInput = document.getElementById('input-rider-phone');

    if (riderId) {
        const r = appState.riders.find(item => item.id === riderId);
        if (!r) return;
        titleEl.textContent = `✏️ تعديل بيانات المندوب: ${r.name}`;
        idInput.value = r.id;
        nameInput.value = r.name;
        bikeInput.value = r.bike;
        plateInput.value = r.plate;
        phoneInput.value = r.phone || '';
    } else {
        titleEl.textContent = '+ إضافة مندوب جديد';
        idInput.value = '';
        document.getElementById('form-rider').reset();
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

// ==================== EVENT DELEGATION ====================
document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    const id = btn.getAttribute('data-id');

    if (action === 'logout-firebase') {
        if (fb && fb.auth) {
            await fb.signOut(fb.auth);
            showToast('تم تسجيل الخروج بأمان');
        }
    } else if (action === 'open-security-modal') {
        renderUsersRolesList();
        const m = document.getElementById('modal-security');
        if (m) {
            m.classList.remove('hidden');
            m.classList.add('flex');
        }
    } else if (action === 'download-backup') {
        downloadFullBackupJSON();
    } else if (action === 'toggle-sidebar') {
        document.getElementById('sidebar').classList.toggle('translate-x-full');
        document.getElementById('sidebar-backdrop').classList.toggle('hidden');
    } else if (action === 'switch-tab') {
        switchTab(btn.getAttribute('data-tab'));
    } else if (action === 'set-view-mode') {
        setViewMode(btn.getAttribute('data-mode'));
    } else if (action === 'add-order-item-row') {
        addOrderItemRow();
    } else if (action === 'remove-order-item-row') {
        const row = btn.closest('.order-item-row');
        if (row) {
            row.remove();
            recalcOrderItemsTotal();
        }
    } else if (action === 'set-status-filter') {
        uiState.statusFilter = btn.getAttribute('data-status');
        document.querySelectorAll('.status-chip').forEach(chip => {
            if (chip.getAttribute('data-status') === uiState.statusFilter) {
                chip.className = 'status-chip px-3 py-1.5 rounded-lg text-xs font-black bg-slateCard text-white transition-all';
            } else {
                chip.className = 'status-chip px-3 py-1.5 rounded-lg text-xs font-bold text-slate-400 hover:text-white transition-all';
            }
        });
        renderOrdersBoardAndTable();
    } else if (action === 'filter-by-rider-pill') {
        uiState.riderFilter = (uiState.riderFilter === id) ? 'all' : id;
        renderFleetRibbon();
        renderOrdersBoardAndTable();
    } else if (action === 'open-drawer') {
        openOrderDrawer(id);
    } else if (action === 'close-drawer') {
        closeOrderDrawer();
    } else if (action === 'open-edit-order') {
        openEditOrderModal(id);
    } else if (action === 'open-new-order') {
        openNewOrderModal();
    } else if (action === 'open-new-store') {
        if (!isAdminUser()) {
            showToast('⛔ إضافة المتاجر متاحة لمدير النظام فقط');
            return;
        }
        const m = document.getElementById('modal-new-store');
        m.classList.remove('hidden');
        m.classList.add('flex');
    } else if (action === 'open-store-statement') {
        openStoreStatementModal(id);
    } else if (action === 'delete-store') {
        if (!isAdminUser()) return;
        const store = appState.stores.find(s => s.id === id);
        if (!store) return;
        const hasActive = appState.orders.some(o => o.storeId === id && isOrderActiveInRoom(o));
        if (hasActive) {
            showToast(`⚠️ لا يمكن حذف ${store.name} لوجود طلب جاري خاص به حالياً`);
            return;
        }
        if (!window.confirm(`هل أنت متأكد من حذف المتجر "${store.name}"؟`)) return;
        const ok = await fsDeleteDoc('wassal_stores', id);
        if (ok) showToast(`تم حذف المتجر ${store.name}`);
    } else if (action === 'open-rider-modal') {
        openRiderModal(null);
    } else if (action === 'edit-rider') {
        openRiderModal(id);
    } else if (action === 'open-rider-stats') {
        openRiderStatsModal(id, 'today');
    } else if (action === 'set-rstats-period') {
        if (uiState.selectedRiderStatsId) {
            openRiderStatsModal(uiState.selectedRiderStatsId, btn.getAttribute('data-period'));
        }
    } else if (action === 'open-close-day-modal') {
        openCloseDayModal();
    } else if (action === 'open-return-modal') {
        openReturnModal(id);
    } else if (action === 'archive-select-date') {
        uiState.archiveDateFilter = btn.getAttribute('data-date');
        renderArchive();
    } else if (action === 'archive-show-all') {
        uiState.archiveDateFilter = '';
        const dp = document.getElementById('archive-date-picker');
        if (dp) dp.value = '';
        renderArchive();
    } else if (action === 'delete-rider') {
        if (!isAdminUser()) return;
        const rider = appState.riders.find(r => r.id === id);
        if (!rider) return;
        const hasActive = appState.orders.some(o => o.riderId === id && isOrderActiveInRoom(o));
        if (hasActive) {
            showToast(`⚠️ لا يمكن حذف ${rider.name} لوجود طلب جاري مكلف به حالياً`);
            return;
        }
        if (!window.confirm(`هل أنت متأكد من حذف المندوب "${rider.name}" من الأسطول؟`)) return;
        if (uiState.riderFilter === id) uiState.riderFilter = 'all';
        const ok = await fsDeleteDoc('wassal_riders', id);
        if (ok) showToast(`تم حذف المندوب ${rider.name}`);
    } else if (action === 'close-modal') {
        const m = document.getElementById(btn.getAttribute('data-modal'));
        if (m) { m.classList.add('hidden'); m.classList.remove('flex'); }
    } else if (action === 'move-onway') {
        const o = appState.orders.find(item => item.id === id);
        if (o && o.status === 'received') {
            const ok = await fsSaveDoc('wassal_orders', o.id, { status: 'onway', departedTs: Date.now() });
            if (ok) showToast(`تحرك المندوب بالطلب #${o.id} للعميل 🛵`);
        }
    } else if (action === 'move-delivered') {
        const o = appState.orders.find(item => item.id === id);
        if (o && o.status === 'onway') {
            const ok = await fsSaveDoc('wassal_orders', o.id, { status: 'delivered', deliveredTs: Date.now() });
            if (ok) showToast(`تم تسليم الطلب #${o.id} — بانتظار التوريد للمتجر`);
        }
    } else if (action === 'move-settled') {
        const o = appState.orders.find(item => item.id === id);
        if (o && o.status === 'delivered') {
            const ok = await fsSaveDoc('wassal_orders', o.id, { status: 'settled', settledTs: Date.now() });
            if (ok) {
                await fsSaveDoc('wassal_riders', o.riderId, { status: 'available' });
                const rd = getRider(o.riderId);
                showToast(`💰 تم توريد #${o.id} للأرشيف وعودة ${rd.name} متاحاً بالمكتب`);
            }
        }
    } else if (action === 'move-returned-done') {
        const o = appState.orders.find(item => item.id === id);
        if (o && o.status === 'returning') {
            const ok = await fsSaveDoc('wassal_orders', o.id, { status: 'returned', settledTs: Date.now() });
            if (ok) {
                await fsSaveDoc('wassal_riders', o.riderId, { status: 'available' });
                const rd = getRider(o.riderId);
                showToast(`📦 تم تسليم مرتجع #${o.id} للمتجر وعودة ${rd.name} للمكتب`);
            }
        }
    } else if (action === 'delete-order') {
        if (!isAdminUser()) {
            showToast('⛔ حذف الطلبات متاح لمدير النظام فقط');
            return;
        }
        const o = appState.orders.find(item => item.id === id);
        if (!o) return;
        if (!window.confirm(`هل أنت متأكد من حذف الطلب #${o.id} نهائياً؟`)) return;
        const ok = await fsDeleteDoc('wassal_orders', o.id);
        if (ok) {
            await fsSaveDoc('wassal_riders', o.riderId, { status: 'available' });
            closeOrderDrawer();
            showToast(`تم حذف الطلب #${o.id}`);
        }
    } else if (action === 'delete-expense') {
        if (!isAdminUser()) return;
        if (!window.confirm('هل تريد حذف هذا المصروف؟')) return;
        const ok = await fsDeleteDoc('wassal_expenses', id);
        if (ok) showToast('تم حذف بند المصروف');
    } else if (action === 'copy-whatsapp') {
        const o = appState.orders.find(item => item.id === id);
        if (o) {
            copyToClipboardSafe(buildWhatsAppMessage(o));
            showToast(`تم نسخ رسالة الواتساب للطلب #${o.id} 📋`);
        }
    } else if (action === 'toggle-rider-avail') {
        if (!isAdminUser()) return;
        const r = appState.riders.find(item => item.id === id);
        if (r) {
            if (r.status === 'busy') {
                showToast('المندوب في مهمة جارية حالياً، قم بتوريد أو إنهاء طلبه أولاً');
                return;
            }
            const nextStatus = (r.status === 'off') ? 'available' : 'off';
            const ok = await fsSaveDoc('wassal_riders', r.id, { status: nextStatus });
            if (ok) showToast(`تم تحديث حالة ${r.name} إلى: ${nextStatus === 'available' ? 'متاح للعمل' : 'خارج العمل'}`);
        }
    } else if (action === 'export-csv') {
        exportMonthlyCSV();
    } else if (action === 'print-report') {
        window.print();
    } else if (action === 'reset-demo') {
        await resetAllDataSafely();
    }
});

// ==================== CHANGE & INPUT LISTENERS ====================
document.addEventListener('change', async (e) => {
    if (e.target && e.target.getAttribute('data-action') === 'change-user-role') {
        if (!isAdminUser()) return;
        const uid = e.target.getAttribute('data-uid');
        const newRole = e.target.value;
        const ok = await fsSaveDoc('wassal_users', uid, { role: newRole });
        if (ok) showToast(`✅ تم تحديث صلاحية الموظف إلى: ${newRole === 'admin' ? 'مدير' : 'موظف عمليات'}`);
    }
});

document.getElementById('search-input').addEventListener('input', () => renderOrdersBoardAndTable());

const orderItemsContainer = document.getElementById('order-items-list');
if (orderItemsContainer) {
    orderItemsContainer.addEventListener('input', (e) => {
        if (e.target && e.target.classList.contains('item-price')) {
            recalcOrderItemsTotal();
        }
    });
}

document.getElementById('input-order-phone').addEventListener('input', (e) => {
    const rawPhone = e.target.value.trim();
    if (rawPhone.length >= 7) {
        const prevOrder = appState.orders.find(o => (o.phone || '').includes(rawPhone));
        if (prevOrder) {
            const nameInput = document.getElementById('input-order-customer');
            const addrInput = document.getElementById('input-order-address');
            if (!nameInput.value.trim()) nameInput.value = prevOrder.customerName;
            if (!addrInput.value.trim()) addrInput.value = prevOrder.address;
            showToast(`⚡ تم استدعاء بيانات العميل: ${prevOrder.customerName}`);
        }
    }
});

document.getElementById('input-order-store').addEventListener('change', (e) => {
    const s = appState.stores.find(item => item.id === e.target.value);
    if (s) document.getElementById('input-order-fee').value = s.fee;
});

document.getElementById('archive-date-picker').addEventListener('change', (e) => {
    uiState.archiveDateFilter = e.target.value;
    renderArchive();
});

document.getElementById('report-month-picker').addEventListener('change', (e) => {
    uiState.reportMonth = e.target.value;
    renderAccounting();
});

document.getElementById('filter-expense-cat').addEventListener('change', (e) => {
    uiState.expenseCatFilter = e.target.value;
    renderAccounting();
});

// ==================== FORM SUBMISSIONS ====================
document.getElementById('form-firebase-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('input-login-email').value.trim();
    const password = document.getElementById('input-login-password').value;
    const errEl = document.getElementById('login-error-msg');
    const submitBtn = document.getElementById('btn-login-submit');

    errEl.classList.add('hidden');
    submitBtn.disabled = true;
    submitBtn.textContent = 'جاري التحقق من الهوية...';

    try {
        await fb.signInWithEmailAndPassword(fb.auth, email, password);
        e.target.reset();
        showToast('🔓 مرحباً بك في غرفة عمليات وصّل');
    } catch (err) {
        console.error('Login error:', err.code);
        errEl.textContent = '⚠️ البريد الإلكتروني أو كلمة المرور غير صحيحة';
        errEl.classList.remove('hidden');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'تسجيل الدخول لغرفة العمليات';
    }
});

const restoreInput = document.getElementById('input-restore-backup');
if (restoreInput) {
    restoreInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
            handleRestoreBackupFile(e.target.files[0]);
            e.target.value = '';
        }
    });
}

document.getElementById('form-close-day').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!isAdminUser()) return;
    const activeD = getActiveShiftDate();
    const nextDate = document.getElementById('input-next-shift-date').value;
    if (!nextDate) return;

    const dayOrders = appState.orders.filter(o => o.dateStr === activeD);
    const daySettled = dayOrders.filter(o => isOrderSuccessfullySettled(o));
    const dayArchived = dayOrders.filter(o => isOrderArchived(o));
    const rev = dayArchived.reduce((s, o) => s + Number(o.fee), 0);
    const cash = daySettled.reduce((s, o) => s + Number(o.amount), 0);
    const exp = appState.expenses.filter(ex => ex.dateStr === activeD).reduce((s, ex) => s + Number(ex.amount), 0);

    appState.closedDays.unshift({
        dateStr: activeD,
        closedAt: Date.now(),
        closedBy: currentUser ? currentUser.email : '',
        ordersCount: daySettled.length,
        returnedCount: dayOrders.filter(o => o.status === 'returned').length,
        settledCash: cash,
        revenue: rev,
        expenses: exp,
        netProfit: rev - exp
    });

    appState.activeDate = nextDate;
    uiState.archiveDateFilter = nextDate;
    uiState.reportMonth = nextDate.slice(0, 7);

    const expDateInp = document.getElementById('exp-date');
    if (expDateInp) expDateInp.value = nextDate;
    const monthPicker = document.getElementById('report-month-picker');
    if (monthPicker) monthPicker.value = uiState.reportMonth;

    const ok = await fsSaveMeta();
    const modal = document.getElementById('modal-close-day');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    if (ok) {
        renderAll();
        showToast(`🔒 تم إقفال يوم ${activeD} وبدء يوم عمل جديد (${nextDate}) 🎉`);
    }
});

document.getElementById('form-return-order').addEventListener('submit', async (e) => {
    e.preventDefault();
    const orderId = document.getElementById('input-return-order-id').value;
    const o = appState.orders.find(item => item.id === orderId);
    if (!o) return;

    const reasonSel = document.getElementById('input-return-reason-select').value;
    const reasonNote = document.getElementById('input-return-reason-note').value.trim();
    const feeMode = document.getElementById('input-return-fee-mode').value;

    const finalReason = reasonNote ? `${reasonSel} — ${reasonNote}` : reasonSel;
    let newFee = Number(o.fee);
    if (feeMode === 'zero') newFee = 0;
    else if (feeMode === 'half') newFee = Math.round(Number(o.fee) / 2);

    const ok = await fsSaveDoc('wassal_orders', o.id, {
        status: 'returning',
        returnedTs: Date.now(),
        returnReason: finalReason,
        fee: newFee
    });

    const modal = document.getElementById('modal-return-order');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    if (ok) showToast(`↩️ تم تسجيل الطلب #${o.id} كمرتجع — جاري إعادته للمتجر`);
});

document.getElementById('form-edit-order').addEventListener('submit', async (e) => {
    e.preventDefault();
    const orderId = document.getElementById('edit-order-id').value;
    const o = appState.orders.find(item => item.id === orderId);
    if (!o) return;

    const newRiderId = document.getElementById('edit-order-rider').value;
    const oldRiderId = o.riderId;

    const updates = {
        customerName: document.getElementById('edit-order-customer').value.trim(),
        phone: document.getElementById('edit-order-phone').value.trim(),
        address: document.getElementById('edit-order-address').value.trim(),
        items: document.getElementById('edit-order-items').value.trim(),
        riderId: newRiderId
    };

    // المدير فقط يمكنه تعديل القيم المالية
    if (isAdminUser()) {
        updates.amount = Number(document.getElementById('edit-order-amount').value) || 0;
        updates.fee = Number(document.getElementById('edit-order-fee').value) || 0;
    }

    const ok = await fsSaveDoc('wassal_orders', o.id, updates);

    if (ok && oldRiderId !== newRiderId) {
        const stillHasOtherActive = appState.orders.some(ord => ord.id !== o.id && ord.riderId === oldRiderId && isOrderActiveInRoom(ord));
        if (!stillHasOtherActive) {
            await fsSaveDoc('wassal_riders', oldRiderId, { status: 'available' });
        }
        if (isOrderActiveInRoom(o)) {
            await fsSaveDoc('wassal_riders', newRiderId, { status: 'busy' });
        }
    }

    const modal = document.getElementById('modal-edit-order');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    if (ok) showToast(`✏️ تم حفظ تعديلات الطلب #${o.id} بنجاح`);
});

document.getElementById('form-new-order').addEventListener('submit', async (e) => {
    e.preventDefault();
    const riderId = document.getElementById('input-order-rider').value;
    if (!riderId) {
        showToast('⚠️ لا يوجد مندوب متاح بالمكتب حالياً، انتظر عودة أحد المناديب');
        return;
    }

    const submitBtn = document.getElementById('btn-submit-new-order');
    submitBtn.disabled = true;
    submitBtn.textContent = 'جاري التسجيل...';

    const customTime = document.getElementById('input-order-time').value;
    const activeD = getActiveShiftDate();
    let rTs = Date.now();
    if (customTime) {
        const [yy, mm, dd] = activeD.split('-').map(Number);
        const [hh, min] = customTime.split(':').map(Number);
        rTs = new Date(yy, mm - 1, dd, hh, min).getTime();
    }

    const { itemsText, computedTotal } = collectOrderItemsText();
    const amountVal = Number(document.getElementById('input-order-amount').value) || computedTotal;
    const feeVal = Number(document.getElementById('input-order-fee').value) || 0;

    const newOrderPayload = {
        storeId: document.getElementById('input-order-store').value,
        riderId: riderId,
        customerName: document.getElementById('input-order-customer').value.trim(),
        phone: document.getElementById('input-order-phone').value.trim(),
        address: document.getElementById('input-order-address').value.trim(),
        items: itemsText,
        amount: amountVal,
        fee: feeVal,
        status: 'received',
        dateStr: activeD,
        receivedTs: rTs,
        departedTs: null,
        deliveredTs: null,
        settledTs: null
    };

    const created = await createOrderAtomically(newOrderPayload);
    submitBtn.disabled = false;
    submitBtn.textContent = 'تسجيل الاستلام الآن';

    if (created) {
        await fsSaveDoc('wassal_riders', riderId, { status: 'busy' });
        e.target.reset();
        resetOrderItemsRows();
        const modal = document.getElementById('modal-new-order');
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        showToast(`✅ تم تسجيل استلام الطلب #${created.id} بتاريخ ${activeD}`);
    }
});

document.getElementById('form-new-expense').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!isAdminUser()) {
        showToast('⛔ تسجيل المصروفات متاح لمدير النظام فقط');
        return;
    }
    const expDate = document.getElementById('exp-date').value || getActiveShiftDate();
    const newExp = {
        id: 'E-' + Date.now(),
        title: document.getElementById('exp-title').value.trim(),
        category: document.getElementById('exp-category').value,
        amount: Number(document.getElementById('exp-amount').value),
        riderId: document.getElementById('exp-rider').value,
        dateStr: expDate,
        notes: document.getElementById('exp-notes').value.trim(),
        createdBy: currentUser ? currentUser.email : ''
    };
    const ok = await fsSaveDoc('wassal_expenses', newExp.id, newExp);
    if (ok) {
        e.target.reset();
        document.getElementById('exp-date').value = getActiveShiftDate();
        showToast(`💸 تم تسجيل مصروف "${newExp.title}" بقيمة ${newExp.amount} ج.م`);
    }
});

document.getElementById('form-rider').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!isAdminUser()) return;
    const editId = document.getElementById('input-rider-id').value;
    const name = document.getElementById('input-rider-name').value.trim();
    const bike = document.getElementById('input-rider-bike').value.trim();
    const plate = document.getElementById('input-rider-plate').value.trim();
    const phone = document.getElementById('input-rider-phone').value.trim();

    if (editId) {
        const ok = await fsSaveDoc('wassal_riders', editId, { name, bike, plate, phone });
        if (ok) showToast(`✏️ تم تعديل بيانات المندوب ${name}`);
    } else {
        const newR = {
            id: 'R' + Date.now(),
            name,
            bike,
            plate,
            phone,
            status: 'available'
        };
        const ok = await fsSaveDoc('wassal_riders', newR.id, newR);
        if (ok) showToast(`🏍️ تم إضافة المندوب ${newR.name} للأسطول`);
    }

    e.target.reset();
    document.getElementById('input-rider-id').value = '';
    const modal = document.getElementById('modal-rider');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
});

document.getElementById('form-new-store').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!isAdminUser()) return;
    const newS = {
        id: 'S' + Date.now(),
        name: document.getElementById('input-store-name').value.trim(),
        category: document.getElementById('input-store-category').value,
        fee: Number(document.getElementById('input-store-fee').value),
        phone: document.getElementById('input-store-phone').value.trim(),
        address: document.getElementById('input-store-address').value.trim()
    };
    const ok = await fsSaveDoc('wassal_stores', newS.id, newS);
    e.target.reset();
    const modal = document.getElementById('modal-new-store');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    if (ok) showToast(`🏪 تم إضافة المتجر "${newS.name}" بنجاح`);
});

// ==================== LIVE CLOCK & INITIALIZE ====================
function updateClock() {
    const el = document.getElementById('live-clock');
    if (el) el.textContent = formatTime12(Date.now());
}

setInterval(() => {
    updateClock();
    if (uiState.activeTab === 'operations' && currentUser) renderOrdersBoardAndTable();
}, 30000);

updateClock();
initAuthAndFirestore();