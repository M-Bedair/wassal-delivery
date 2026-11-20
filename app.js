const STORAGE_KEY = 'wassal_modern_ops_v2';
const PIN_STORAGE_KEY = 'wassal_security_pin_v1';
const SESSION_UNLOCK_KEY = 'wassal_session_unlocked';
const DEFAULT_PIN = '1234';

let cloudBridge = null;
let pendingCloudSave = false;

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

function getStoredPin() {
    return localStorage.getItem(PIN_STORAGE_KEY) || DEFAULT_PIN;
}

function initAuthLock() {
    const lockScreen = document.getElementById('auth-lock-screen');
    if (!lockScreen) return;
    if (sessionStorage.getItem(SESSION_UNLOCK_KEY) === 'true') {
        lockScreen.classList.add('hidden');
    } else {
        lockScreen.classList.remove('hidden');
    }
}

function lockSystemNow() {
    sessionStorage.removeItem(SESSION_UNLOCK_KEY);
    const lockScreen = document.getElementById('auth-lock-screen');
    const pinInput = document.getElementById('input-unlock-pin');
    const errEl = document.getElementById('unlock-error-msg');
    if (pinInput) pinInput.value = '';
    if (errEl) errEl.classList.add('hidden');
    if (lockScreen) lockScreen.classList.remove('hidden');
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

let isInitialCloudLoaded = false;

function setSyncStatus(status) {
    const configs = {
        connecting: { text: 'جاري الاتصال بالسحابة...', dot: 'bg-wassalAmber animate-pulse', txt: 'text-wassalAmber' },
        online: { text: 'متصل بالسحابة (مؤمّن)', dot: 'bg-statusDone', txt: 'text-statusDone' },
        offline: { text: 'وضع محلي (سيتم المزامنة عند الاتصال)', dot: 'bg-wassalOrange', txt: 'text-wassalOrange' }
    };
    const cfg = configs[status];
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

function saveData() {
    appState.lastUpdated = Date.now();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
    if (cloudBridge && cloudBridge.set && cloudBridge.stateRef) {
        cloudBridge.set(cloudBridge.stateRef, appState)
            .then(() => {
                pendingCloudSave = false;
            })
            .catch(err => {
                pendingCloudSave = true;
                console.error('Firebase save error (queued for retry):', err);
            });
    } else {
        pendingCloudSave = true;
    }
}

function normalizeArray(val, fallback) {
    if (!val) return fallback;
    return Array.isArray(val) ? val : Object.values(val);
}

function loadLocalOrDefaultData() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
        try {
            const parsed = JSON.parse(raw);
            appState = {
                activeDate: parsed.activeDate || getSystemTodayStr(),
                closedDays: normalizeArray(parsed.closedDays, []),
                riders: normalizeArray(parsed.riders, []),
                stores: normalizeArray(parsed.stores, []),
                orders: normalizeArray(parsed.orders, []),
                expenses: normalizeArray(parsed.expenses, []),
                nextOrderNum: parsed.nextOrderNum || 101
            };
            uiState.archiveDateFilter = appState.activeDate;
            syncRidersAvailability();
            return;
        } catch (e) {}
    }
    const sysToday = getSystemTodayStr();
    appState = {
        activeDate: sysToday,
        closedDays: [],
        riders: [],
        stores: [],
        orders: [],
        expenses: [],
        nextOrderNum: 101
    };
    uiState.archiveDateFilter = sysToday;
    syncRidersAvailability();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
}

function resetAllDataSafely() {
    const confirmed = window.confirm('⚠️ تحذير نهائي: سيتم مسح جميع الطلبات والمناديب والمتاجر والحسابات من الجهاز والسحابة نهائياً!\n\nهل أنت متأكد من المتابعة؟');
    if (!confirmed) return;

    const sysToday = getSystemTodayStr();
    appState = {
        activeDate: sysToday,
        closedDays: [],
        riders: [],
        stores: [],
        orders: [],
        expenses: [],
        nextOrderNum: 101
    };
    uiState.riderFilter = 'all';
    uiState.statusFilter = 'all';
    uiState.archiveDateFilter = sysToday;
    uiState.reportMonth = sysToday.slice(0, 7);
    const monthPicker = document.getElementById('report-month-picker');
    if (monthPicker) monthPicker.value = uiState.reportMonth;
    syncRidersAvailability();
    saveData();
    renderAll();
    const secModal = document.getElementById('modal-security');
    if (secModal) {
        secModal.classList.add('hidden');
        secModal.classList.remove('flex');
    }
    showToast('تم تصفير جميع البيانات بنجاح — النظام جاهز للإدخال');
}

loadLocalOrDefaultData();

async function initCloudSync() {
    const fallbackTimer = setTimeout(() => {
        if (!isInitialCloudLoaded) setSyncStatus('offline');
    }, 5000);

    try {
        const fb = await import('./firebase-config.js');
        cloudBridge = fb;

        fb.onValue(fb.connectedRef, (snap) => {
            clearTimeout(fallbackTimer);
            const isOnline = snap.val() === true;
            setSyncStatus(isOnline ? 'online' : 'offline');
            if (isOnline && pendingCloudSave) {
                saveData();
            }
        });

        fb.onValue(fb.stateRef, (snapshot) => {
            clearTimeout(fallbackTimer);
            const cloudData = snapshot.val();
            if (cloudData) {
                appState = {
                    activeDate: cloudData.activeDate || getSystemTodayStr(),
                    closedDays: normalizeArray(cloudData.closedDays, []),
                    riders: normalizeArray(cloudData.riders, []),
                    stores: normalizeArray(cloudData.stores, []),
                    orders: normalizeArray(cloudData.orders, []),
                    expenses: normalizeArray(cloudData.expenses, []),
                    nextOrderNum: cloudData.nextOrderNum || 101
                };
                const activeD = getActiveShiftDate();
                appState.orders.forEach(o => { if (!o.dateStr) o.dateStr = activeD; });
                if (!uiState.archiveDateFilter) uiState.archiveDateFilter = activeD;
                syncRidersAvailability();
                localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
                isInitialCloudLoaded = true;
                renderAll();
            } else if (!isInitialCloudLoaded) {
                isInitialCloudLoaded = true;
                saveData();
            }
        }, () => {
            clearTimeout(fallbackTimer);
            setSyncStatus('offline');
        });
    } catch (err) {
        clearTimeout(fallbackTimer);
        setSyncStatus('offline');
    }
}

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
                <button type="button" data-action="move-delivered" data-id="${escapeHTML(o.id)}" class="px-2 py-1.5 rounded-lg bg-statusDone/20 hover:bg-statusDone text-statusDone hover:text-obsidian font-black text-[11px]">✓ تسليم</button>
                <button type="button" data-action="open-return-modal" data-id="${escapeHTML(o.id)}" class="px-2 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500 text-red-400 hover:text-white font-black text-[11px]">↩️ مرتجع</button>
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

    document.getElementById('whatsapp-store-statement-btn').href = `[https://wa.me/$](https://wa.me/$){encodeURIComponent(store.phone)}?text=${encodeURIComponent(waText)}`;

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
                <a href="[https://wa.me/?text=$](https://wa.me/?text=$){encodeURIComponent(waMessage)}" target="_blank" rel="noopener" class="text-[11px] text-statusOnway underline font-bold">فتح واتساب ويب ↗</a>
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

    document.getElementById('drawer-footer').innerHTML = `
        ${primaryAction}
        <div class="grid grid-cols-3 gap-1.5">
            <button type="button" data-action="open-edit-order" data-id="${escapeHTML(o.id)}" class="py-2.5 px-2 rounded-xl bg-statusOnway/15 hover:bg-statusOnway text-statusOnway hover:text-obsidian border border-statusOnway/30 font-black text-[11px] transition-colors">✏️ تعديل/تحويل</button>
            <button type="button" data-action="copy-whatsapp" data-id="${escapeHTML(o.id)}" class="py-2.5 px-2 rounded-xl bg-slateCard hover:bg-slateHover border border-slateBorder text-white font-black text-[11px]">📋 واتساب</button>
            <button type="button" data-action="delete-order" data-id="${escapeHTML(o.id)}" class="py-2.5 px-2 rounded-xl bg-red-500/15 hover:bg-red-500 text-red-400 hover:text-white border border-red-500/30 font-black text-[11px] transition-colors">🗑️ حذف</button>
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
        grid.innerHTML = `<div class="col-span-full bg-slateDark border border-dashed border-slateBorder rounded-2xl p-10 text-center text-slate-400 text-xs">لا يوجد مناديب مسجلون حالياً. اضغط على <strong class="text-wassalOrange">+ إضافة مندوب جديد</strong> بالأعلى لبدء تسجيل طياريك.</div>`;
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
                        <button type="button" data-action="toggle-rider-avail" data-id="${escapeHTML(r.id)}" class="px-2.5 py-2 rounded-xl bg-slateCard hover:bg-slateHover border border-slateBorder text-xs font-bold text-slate-200">
                            ${r.status === 'off' ? '🟢 تفعيل' : '⚪ إيقاف'}
                        </button>
                        <button type="button" data-action="edit-rider" data-id="${escapeHTML(r.id)}" class="px-2.5 py-2 rounded-xl bg-statusOnway/15 hover:bg-statusOnway text-statusOnway hover:text-obsidian border border-statusOnway/30 text-xs font-black">
                            تعديل
                        </button>
                        <button type="button" data-action="delete-rider" data-id="${escapeHTML(r.id)}" class="px-2.5 py-2 rounded-xl bg-red-500/15 hover:bg-red-500 text-red-400 hover:text-white border border-red-500/30 text-xs font-black">
                            حذف
                        </button>
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
        grid.innerHTML = `<div class="col-span-full bg-slateDark border border-dashed border-slateBorder rounded-2xl p-10 text-center text-slate-400 text-xs">لا توجد متاجر مسجلة حالياً. اضغط على <strong class="text-wassalOrange">+ إضافة متجر جديد</strong> بالأعلى لبدء تسجيل متاجرك.</div>`;
        return;
    }

    grid.innerHTML = ranked.map((item, idx) => {
        const s = item.store;
        const isFirst = idx === 0 && item.monthCount > 0;
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
                    <button type="button" data-action="delete-store" data-id="${escapeHTML(s.id)}" class="px-3 py-2.5 rounded-xl bg-red-500/15 hover:bg-red-500 text-red-400 hover:text-white border border-red-500/30 text-xs font-black transition-colors">
                        حذف
                    </button>
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
                    <td class="px-3.5 py-3 text-center no-print">
                        <button type="button" data-action="delete-expense" data-id="${escapeHTML(e.id)}" class="px-2 py-1 rounded-lg bg-red-500/15 hover:bg-red-500 text-red-400 hover:text-white text-[11px] font-bold transition-colors">✕</button>
                    </td>
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

// ==================== BACKUP, RESTORE & CSV EXPORT ====================
function downloadFullBackupJSON() {
    const payload = {
        exportedAt: new Date().toISOString(),
        system: 'WASSAL Delivery Operations',
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
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        try {
            const parsed = JSON.parse(ev.target.result);
            const restored = parsed.data || parsed;
            if (!restored || typeof restored !== 'object' || !Array.isArray(restored.orders)) {
                showToast('⚠️ ملف النسخة الاحتياطية غير صالح');
                return;
            }
            const ok = window.confirm(`هل تريد استعادة النسخة الاحتياطية؟\nتحتوي على: ${restored.orders.length} طلب، ${restored.riders?.length || 0} مندوب، ${restored.stores?.length || 0} متجر.`);
            if (!ok) return;

            appState = {
                activeDate: restored.activeDate || getSystemTodayStr(),
                closedDays: normalizeArray(restored.closedDays, []),
                riders: normalizeArray(restored.riders, []),
                stores: normalizeArray(restored.stores, []),
                orders: normalizeArray(restored.orders, []),
                expenses: normalizeArray(restored.expenses, []),
                nextOrderNum: restored.nextOrderNum || 101
            };
            syncRidersAvailability();
            saveData();
            renderAll();
            const secModal = document.getElementById('modal-security');
            if (secModal) {
                secModal.classList.add('hidden');
                secModal.classList.remove('flex');
            }
            showToast('✅ تمت استعادة البيانات ومزامنتها مع السحابة بنجاح');
        } catch (err) {
            showToast('⚠️ تعذر قراءة الملف — تأكد أنه ملف JSON صحيح');
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
document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    const id = btn.getAttribute('data-id');

    if (action === 'lock-system') {
        lockSystemNow();
    } else if (action === 'open-security-modal') {
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
        const m = document.getElementById('modal-new-store');
        m.classList.remove('hidden');
        m.classList.add('flex');
    } else if (action === 'open-store-statement') {
        openStoreStatementModal(id);
    } else if (action === 'delete-store') {
        const store = appState.stores.find(s => s.id === id);
        if (!store) return;
        const hasActive = appState.orders.some(o => o.storeId === id && isOrderActiveInRoom(o));
        if (hasActive) {
            showToast(`⚠️ لا يمكن حذف ${store.name} لوجود طلب جاري خاص به حالياً`);
            return;
        }
        if (!window.confirm(`هل أنت متأكد من حذف المتجر "${store.name}"؟`)) return;
        appState.stores = appState.stores.filter(s => s.id !== id);
        saveData();
        renderAll();
        showToast(`تم حذف المتجر ${store.name}`);
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
        const rider = appState.riders.find(r => r.id === id);
        if (!rider) return;
        const hasActive = appState.orders.some(o => o.riderId === id && isOrderActiveInRoom(o));
        if (hasActive) {
            showToast(`⚠️ لا يمكن حذف ${rider.name} لوجود طلب جاري مكلف به حالياً`);
            return;
        }
        if (!window.confirm(`هل أنت متأكد من حذف المندوب "${rider.name}" من الأسطول؟`)) return;
        appState.riders = appState.riders.filter(r => r.id !== id);
        if (uiState.riderFilter === id) uiState.riderFilter = 'all';
        saveData();
        renderAll();
        showToast(`تم حذف المندوب ${rider.name} من الأسطول`);
    } else if (action === 'close-modal') {
        const modalId = btn.getAttribute('data-modal');
        const m = document.getElementById(modalId);
        if (m) {
            m.classList.add('hidden');
            m.classList.remove('flex');
        }
    } else if (action === 'reset-demo') {
        resetAllDataSafely();
    } else if (action === 'print-report') {
        window.print();
    } else if (action === 'export-csv') {
        exportMonthlyCSV();
    } else if (action === 'delete-expense') {
        if (!window.confirm('هل أنت متأكد من حذف هذا المصروف؟')) return;
        appState.expenses = appState.expenses.filter(ex => ex.id !== id);
        saveData();
        renderAll();
        showToast('تم حذف بند المصروف وتحديث صافي الأرباح');
    } else if (action === 'move-onway') {
        const order = appState.orders.find(o => o.id === id);
        if (order) {
            order.status = 'onway';
            order.departedTs = Date.now();
            syncRidersAvailability();
            saveData();
            renderAll();
            showToast(`🔵 تحرك المندوب بالطلب #${order.id} الساعة ${formatTime12(order.departedTs)}`);
        }
    } else if (action === 'move-delivered') {
        const order = appState.orders.find(o => o.id === id);
        if (order) {
            const now = Date.now();
            if (!order.departedTs) order.departedTs = now;
            order.status = 'delivered';
            order.deliveredTs = now;
            syncRidersAvailability();
            saveData();
            renderAll();
            showToast(`🟢 تم تسليم #${order.id} للعميل — في انتظار توريد المبلغ للمتجر`);
        }
    } else if (action === 'move-settled') {
        const order = appState.orders.find(o => o.id === id);
        if (order) {
            const now = Date.now();
            if (!order.departedTs) order.departedTs = now;
            if (!order.deliveredTs) order.deliveredTs = now;
            order.status = 'settled';
            order.settledTs = now;
            syncRidersAvailability();
            saveData();
            renderAll();
            showToast(`💰 تم توريد #${order.id} وعودة المندوب للمكتب (نُقل للأرشيف)`);
        }
    } else if (action === 'move-returned-done') {
        const order = appState.orders.find(o => o.id === id);
        if (order) {
            const now = Date.now();
            order.status = 'returned';
            order.settledTs = now;
            syncRidersAvailability();
            saveData();
            renderAll();
            showToast(`📦 تم تسليم المرتجع #${order.id} للمتجر وعودة المندوب للمكتب (نُقل للأرشيف)`);
        }
    } else if (action === 'delete-order') {
        if (!window.confirm(`⚠️ هل أنت متأكد من حذف الطلب #${id} نهائياً؟`)) return;
        appState.orders = appState.orders.filter(o => o.id !== id);
        syncRidersAvailability();
        saveData();
        renderAll();
        showToast(`تم حذف الطلب #${id}`);
    } else if (action === 'copy-whatsapp') {
        const order = appState.orders.find(o => o.id === id);
        if (order) {
            copyToClipboardSafe(buildWhatsAppMessage(order));
            showToast(`💬 تم نسخ رسالة واتساب للطلب #${order.id}`);
        }
    } else if (action === 'toggle-rider-avail') {
        const rider = appState.riders.find(r => r.id === id);
        if (rider) {
            const hasActive = appState.orders.some(o => o.riderId === id && isOrderActiveInRoom(o));
            if (hasActive) {
                showToast(`⚠️ المندوب ${rider.name} لديه طلب جاري حالياً ولا يمكن إيقافه`);
                return;
            }
            rider.status = (rider.status === 'off') ? 'available' : 'off';
            saveData();
            renderAll();
            showToast(rider.status === 'available'
                ? `🟢 تم تفعيل المندوب ${rider.name} وهو متاح الآن بالمكتب`
                : `⚪ تم تحويل ${rider.name} إلى خارج العمل (غير متاح)`);
        }
    }
});

// ==================== FORM & SEARCH LISTENERS ====================
document.getElementById('form-unlock-system').addEventListener('submit', (e) => {
    e.preventDefault();
    const entered = document.getElementById('input-unlock-pin').value.trim();
    const errEl = document.getElementById('unlock-error-msg');
    if (entered === getStoredPin()) {
        sessionStorage.setItem(SESSION_UNLOCK_KEY, 'true');
        errEl.classList.add('hidden');
        document.getElementById('auth-lock-screen').classList.add('hidden');
        showToast('🔓 تم فتح النظام بنجاح');
    } else {
        errEl.classList.remove('hidden');
        document.getElementById('input-unlock-pin').value = '';
    }
});

document.getElementById('form-change-pin').addEventListener('submit', (e) => {
    e.preventDefault();
    const newPin = document.getElementById('input-new-pin').value.trim();
    if (newPin.length < 4) {
        showToast('⚠️ يجب أن يتكون الرمز من 4 أرقام على الأقل');
        return;
    }
    localStorage.setItem(PIN_STORAGE_KEY, newPin);
    document.getElementById('input-new-pin').value = '';
    showToast('🔑 تم تحديث رمز الدخول السري بنجاح');
});

document.getElementById('input-restore-backup').addEventListener('change', (e) => {
    const file = e.target.files[0];
    handleRestoreBackupFile(file);
    e.target.value = '';
});

document.getElementById('form-edit-order').addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-order-id').value;
    const order = appState.orders.find(o => o.id === id);
    if (!order) return;

    order.riderId = document.getElementById('edit-order-rider').value;
    order.customerName = document.getElementById('edit-order-customer').value.trim();
    order.phone = document.getElementById('edit-order-phone').value.trim();
    order.address = document.getElementById('edit-order-address').value.trim();
    order.items = document.getElementById('edit-order-items').value.trim();
    order.amount = Number(document.getElementById('edit-order-amount').value) || 0;
    order.fee = Number(document.getElementById('edit-order-fee').value) || 0;

    syncRidersAvailability();
    saveData();
    renderAll();

    const modal = document.getElementById('modal-edit-order');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    showToast(`✅ تم تحديث بيانات الطلب #${order.id}`);
});

document.getElementById('input-order-store').addEventListener('change', (e) => {
    const st = getStore(e.target.value);
    document.getElementById('input-order-fee').value = st.fee;
});

document.getElementById('order-items-list').addEventListener('input', (e) => {
    if (e.target.classList.contains('item-price')) {
        recalcOrderItemsTotal();
    }
});

document.getElementById('input-order-phone').addEventListener('input', (e) => {
    const phoneVal = e.target.value.trim();
    if (phoneVal.length >= 8) {
        const foundOrder = appState.orders.find(o => o.phone === phoneVal);
        if (foundOrder) {
            const nameInput = document.getElementById('input-order-customer');
            const addressInput = document.getElementById('input-order-address');
            if (nameInput && !nameInput.value) nameInput.value = foundOrder.customerName;
            if (addressInput && !addressInput.value) addressInput.value = foundOrder.address;

            const prevReturns = appState.orders.filter(o => o.phone === phoneVal && (o.status === 'returned' || o.status === 'returning')).length;
            if (prevReturns > 0) {
                showToast(`⚠️ تنبيه: العميل ${foundOrder.customerName} لديه (${prevReturns}) مرتجع سابق!`);
            } else {
                showToast(`✨ تم استدعاء بيانات العميل: ${foundOrder.customerName}`);
            }
        }
    }
});

document.getElementById('form-new-order').addEventListener('submit', (e) => {
    e.preventDefault();
    const storeId = document.getElementById('input-order-store').value;
    const customerName = document.getElementById('input-order-customer').value.trim();
    const phone = document.getElementById('input-order-phone').value.trim();
    const address = document.getElementById('input-order-address').value.trim();
    const { itemsText, computedTotal } = collectOrderItemsText();
    const rawAmountInput = document.getElementById('input-order-amount').value;
    const amount = rawAmountInput !== '' ? (Number(rawAmountInput) || 0) : computedTotal;
    const fee = Number(document.getElementById('input-order-fee').value) || 0;
    const riderId = document.getElementById('input-order-rider').value;
    const manualTime = document.getElementById('input-order-time').value;

    if (!riderId) {
        showToast('⚠️ لا يوجد مندوب متاح بالمكتب حالياً لتكليفه بالطلب');
        return;
    }

    const activeD = getActiveShiftDate();
    let receivedTs = Date.now();
    if (manualTime) {
        const [hh, mm] = manualTime.split(':').map(Number);
        const [sy, sm, sd] = activeD.split('-').map(Number);
        const d = new Date(sy, sm - 1, sd, hh, mm, 0, 0);
        receivedTs = d.getTime();
    }

    const newOrder = {
        id: `W-${appState.nextOrderNum++}`,
        dateStr: activeD,
        storeId,
        customerName,
        address,
        phone,
        items: itemsText,
        amount,
        fee,
        riderId,
        status: 'received',
        receivedTs,
        departedTs: null,
        deliveredTs: null,
        settledTs: null
    };

    appState.orders.unshift(newOrder);
    syncRidersAvailability();
    saveData();
    renderAll();

    e.target.reset();
    resetOrderItemsRows();
    const modal = document.getElementById('modal-new-order');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    showToast(`🟡 تم تسجيل استلام الطلب #${newOrder.id} الساعة ${formatTime12(receivedTs)}`);
});

document.getElementById('form-return-order').addEventListener('submit', (e) => {
    e.preventDefault();
    const orderId = document.getElementById('input-return-order-id').value;
    const reasonSel = document.getElementById('input-return-reason-select').value;
    const reasonNote = document.getElementById('input-return-reason-note').value.trim();
    const feeMode = document.getElementById('input-return-fee-mode').value;

    const order = appState.orders.find(o => o.id === orderId);
    if (!order) return;

    const fullReason = reasonNote ? `${reasonSel} — ${reasonNote}` : reasonSel;
    const now = Date.now();
    if (!order.departedTs) order.departedTs = now;

    order.status = 'returning';
    order.returnedTs = now;
    order.returnReason = fullReason;

    if (feeMode === 'zero') {
        order.fee = 0;
    } else if (feeMode === 'half') {
        order.fee = Math.round(Number(order.fee) / 2);
    }

    syncRidersAvailability();
    saveData();
    renderAll();

    const modal = document.getElementById('modal-return-order');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    showToast(`↩️ تم تحويل الطلب #${order.id} إلى مرتجع — جاري إعادته للمتجر`);
});

document.getElementById('form-close-day').addEventListener('submit', (e) => {
    e.preventDefault();
    const closingDate = getActiveShiftDate();
    const nextDate = document.getElementById('input-next-shift-date').value;
    if (!nextDate) return;

    const dayOrders = appState.orders.filter(o => o.dateStr === closingDate);
    const daySettled = dayOrders.filter(o => isOrderSuccessfullySettled(o));
    const dayArchived = dayOrders.filter(o => isOrderArchived(o));
    const rev = dayArchived.reduce((s, o) => s + Number(o.fee), 0);
    const cash = daySettled.reduce((s, o) => s + Number(o.amount), 0);
    const exp = appState.expenses.filter(ex => ex.dateStr === closingDate).reduce((s, ex) => s + Number(ex.amount), 0);

    appState.closedDays.unshift({
        dateStr: closingDate,
        closedAt: Date.now(),
        ordersCount: dayOrders.length,
        settledCount: daySettled.length,
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

    saveData();
    renderAll();

    const modal = document.getElementById('modal-close-day');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    showToast(`🔒 تم إقفال يوم ${closingDate} وفتح يوم جديد (${nextDate})`);
});

document.getElementById('form-rider').addEventListener('submit', (e) => {
    e.preventDefault();
    const editId = document.getElementById('input-rider-id').value.trim();
    const name = document.getElementById('input-rider-name').value.trim();
    const bike = document.getElementById('input-rider-bike').value.trim();
    const plate = document.getElementById('input-rider-plate').value.trim();
    const phone = document.getElementById('input-rider-phone').value.trim();

    if (editId) {
        const rider = appState.riders.find(r => r.id === editId);
        if (rider) {
            rider.name = name;
            rider.bike = bike;
            rider.plate = plate;
            rider.phone = phone;
            saveData();
            renderAll();
            showToast(`✅ تم تحديث بيانات المندوب: ${name}`);
        }
    } else {
        const newRider = {
            id: `r${Date.now()}`,
            name,
            bike,
            plate,
            phone,
            status: 'available'
        };
        appState.riders.push(newRider);
        saveData();
        renderAll();
        showToast(`🏍️ تم إضافة المندوب الجديد: ${name}`);
    }

    e.target.reset();
    document.getElementById('input-rider-id').value = '';
    const modal = document.getElementById('modal-rider');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
});

document.getElementById('form-new-store').addEventListener('submit', (e) => {
    e.preventDefault();
    const newStore = {
        id: `s${Date.now()}`,
        name: document.getElementById('input-store-name').value.trim(),
        category: document.getElementById('input-store-category').value,
        fee: Number(document.getElementById('input-store-fee').value) || 25,
        phone: document.getElementById('input-store-phone').value.trim(),
        address: document.getElementById('input-store-address').value.trim()
    };
    appState.stores.push(newStore);
    saveData();
    renderAll();

    e.target.reset();
    const modal = document.getElementById('modal-new-store');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    showToast(`تمت إضافة المتجر "${newStore.name}"`);
});

document.getElementById('form-new-expense').addEventListener('submit', (e) => {
    e.preventDefault();
    const newExp = {
        id: `e${Date.now()}`,
        dateStr: document.getElementById('exp-date').value || getActiveShiftDate(),
        category: document.getElementById('exp-category').value,
        title: document.getElementById('exp-title').value.trim(),
        amount: Number(document.getElementById('exp-amount').value) || 0,
        riderId: document.getElementById('exp-rider').value,
        notes: document.getElementById('exp-notes').value.trim()
    };
    appState.expenses.unshift(newExp);
    saveData();
    renderAll();

    document.getElementById('exp-title').value = '';
    document.getElementById('exp-amount').value = '';
    document.getElementById('exp-notes').value = '';
    showToast(`💸 تم تسجيل مصروف (${newExp.title}) بقيمة ${newExp.amount} ج.م`);
});

document.getElementById('report-month-picker').addEventListener('change', (e) => {
    uiState.reportMonth = e.target.value || getCurrentMonthStr();
    renderAccounting();
});

document.getElementById('filter-expense-cat').addEventListener('change', (e) => {
    uiState.expenseCatFilter = e.target.value;
    renderAccounting();
});

document.getElementById('archive-date-picker').addEventListener('change', (e) => {
    uiState.archiveDateFilter = e.target.value;
    renderArchive();
});

document.getElementById('search-input').addEventListener('input', () => {
    if (uiState.activeTab !== 'operations') {
        switchTab('operations');
    } else {
        renderOrdersBoardAndTable();
    }
});

// ==================== LIVE CLOCK & AUTO REFRESH ====================
function updateClock() {
    const el = document.getElementById('live-clock');
    if (el) el.textContent = formatTime12(Date.now());
}

initAuthLock();
updateClock();
renderAll();
initCloudSync();

setInterval(updateClock, 15000);
setInterval(() => {
    if (uiState.activeTab === 'operations') {
        renderOrdersBoardAndTable();
        renderFleetRibbon();
    }
}, 20000);