const STORAGE_KEY = 'wassal_modern_ops_v2';

const INITIAL_RIDERS = [
    { id: 'R1', name: 'أحمد محمود', bike: 'بجاج بوكسر 150', plate: 'ق هـ 412', phone: '', status: 'available' },
    { id: 'R2', name: 'كريم عادل', bike: 'هوجن 3', plate: 'س ب 893', phone: '', status: 'available' },
    { id: 'R3', name: 'مصطفى حسن', bike: 'دايون 4', plate: 'م ر 551', phone: '', status: 'available' },
    { id: 'R4', name: 'إسلام طارق', bike: 'بجاج بولسار 180', plate: 'ط ل 129', phone: '', status: 'available' },
    { id: 'R5', name: 'محمود سعيد', bike: 'هوجن F250', plate: 'ع ن 774', phone: '', status: 'available' },
    { id: 'R6', name: 'عمر خالد', bike: 'بجاج بوكسر 150', plate: 'و ص 308', phone: '', status: 'available' },
    { id: 'R7', name: 'يوسف إبراهيم', bike: 'دايون 40', plate: 'ك م 615', phone: '', status: 'available' },
    { id: 'R8', name: 'حسام الدين', bike: 'هوجن 3', plate: 'أ د 940', phone: '', status: 'available' },
    { id: 'R9', name: 'طارق نبيل', bike: 'بجاج بوكسر 150', plate: 'ف ق 217', phone: '', status: 'available' },
    { id: 'R10', name: 'محمد فتحي', bike: 'بينيللي VLR', plate: 'ر ت 832', phone: '', status: 'available' }
];

const INITIAL_STORES = [
    { id: 'S1', name: 'مطعم حضرموت', category: 'مطعم', fee: 25, phone: '01099887701', address: 'شارع 23 يوليو - بجوار البنك الأهلي' },
    { id: 'S2', name: 'صيدليات العزبي', category: 'صيدلية', fee: 20, phone: '01099887702', address: 'ميدان الساعة - برج الأطباء' },
    { id: 'S3', name: 'هايبر ماركت', category: 'سوبرماركت', fee: 30, phone: '01099887703', address: 'شارع البحر - أمام المسجد الكبير' },
    { id: 'S4', name: 'بيتزا كينج', category: 'مطعم', fee: 25, phone: '01099887704', address: 'حي الزهور - الشارع الرئيسي' },
    { id: 'S5', name: 'صيدلية الشفاء', category: 'صيدلية', fee: 20, phone: '01099887705', address: 'شارع المحطة - تقاطع النصر' },
    { id: 'S6', name: 'أسماك البحر', category: 'مطعم', fee: 30, phone: '01099887706', address: 'الكورنيش - بجوار النادي' }
];

let cloudBridge = null;

function getTodayStr() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function getCurrentMonthStr() {
    return getTodayStr().slice(0, 7);
}

function getPastDateInCurrentMonth(daysBack) {
    const d = new Date();
    const targetDay = Math.max(1, d.getDate() - daysBack);
    d.setDate(targetDay);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
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

function createDemoOrders() {
    const now = Date.now();
    const today = getTodayStr();
    const d1 = getPastDateInCurrentMonth(2);
    const d2 = getPastDateInCurrentMonth(5);
    const d3 = getPastDateInCurrentMonth(9);

    return [
        { id: 'W-115', dateStr: today, storeId: 'S1', customerName: 'أ. سامح عبد الرحمن', address: 'حي المساعيد - عمارة 14', phone: '01022334455', amount: 340, fee: 25, riderId: 'R1', status: 'delivered', receivedTs: now - 52 * 60000, departedTs: now - 43 * 60000, deliveredTs: now - 24 * 60000 },
        { id: 'W-116', dateStr: today, storeId: 'S1', customerName: 'م. كريم الشاذلي', address: 'حي الزهور - برج الصفوة', phone: '01066778899', amount: 520, fee: 25, riderId: 'R5', status: 'delivered', receivedTs: now - 40 * 60000, departedTs: now - 32 * 60000, deliveredTs: now - 15 * 60000 },
        { id: 'W-117', dateStr: today, storeId: 'S2', customerName: 'د. هبة محمود', address: 'شارع الفاتح - برج النور', phone: '01144556677', amount: 185, fee: 20, riderId: 'R2', status: 'onway', receivedTs: now - 18 * 60000, departedTs: now - 10 * 60000, deliveredTs: null },
        { id: 'W-118', dateStr: today, storeId: 'S4', customerName: 'أ. نادية كمال', address: 'شارع الجمهورية - عمارة 9', phone: '01555443322', amount: 275, fee: 25, riderId: 'R4', status: 'onway', receivedTs: now - 38 * 60000, departedTs: now - 25 * 60000, deliveredTs: null },
        { id: 'W-119', dateStr: today, storeId: 'S3', customerName: 'م. طارق الجندي', address: 'حي الضاحية - فيلا 22', phone: '01288990011', amount: 460, fee: 30, riderId: 'R3', status: 'received', receivedTs: now - 6 * 60000, departedTs: null, deliveredTs: null },
        { id: 'W-120', dateStr: today, storeId: 'S1', customerName: 'أ. ياسر المنياوي', address: 'ميدان المحطة - خلف البريد', phone: '01099112233', amount: 210, fee: 25, riderId: 'R7', status: 'received', receivedTs: now - 3 * 60000, departedTs: null, deliveredTs: null },
        { id: 'W-101', dateStr: d3, storeId: 'S1', customerName: 'أ. وائل عزت', address: 'شارع البحر', phone: '01011223344', amount: 310, fee: 25, riderId: 'R1', status: 'delivered', receivedTs: now - 3 * 86400000, departedTs: now - 3 * 86400000 + 8 * 60000, deliveredTs: now - 3 * 86400000 + 22 * 60000 },
        { id: 'W-102', dateStr: d3, storeId: 'S1', customerName: 'د. مروة علي', address: 'حي الزهور', phone: '01022331144', amount: 420, fee: 25, riderId: 'R1', status: 'delivered', receivedTs: now - 3 * 86400000 + 3600000, departedTs: now - 3 * 86400000 + 3600000 + 7 * 60000, deliveredTs: now - 3 * 86400000 + 3600000 + 20 * 60000 },
        { id: 'W-103', dateStr: d3, storeId: 'S3', customerName: 'أ. سلوى حسن', address: 'حي المساعيد', phone: '01122334455', amount: 640, fee: 30, riderId: 'R2', status: 'delivered', receivedTs: now - 3 * 86400000 + 7200000, departedTs: now - 3 * 86400000 + 7200000 + 10 * 60000, deliveredTs: now - 3 * 86400000 + 7200000 + 28 * 60000 },
        { id: 'W-104', dateStr: d2, storeId: 'S1', customerName: 'أ. حسام فؤاد', address: 'شارع 23 يوليو', phone: '01233445566', amount: 290, fee: 25, riderId: 'R1', status: 'delivered', receivedTs: now - 2 * 86400000, departedTs: now - 2 * 86400000 + 6 * 60000, deliveredTs: now - 2 * 86400000 + 19 * 60000 },
        { id: 'W-105', dateStr: d2, storeId: 'S2', customerName: 'أ. منال إبراهيم', address: 'ميدان الساعة', phone: '01544556677', amount: 155, fee: 20, riderId: 'R3', status: 'delivered', receivedTs: now - 2 * 86400000 + 4000000, departedTs: now - 2 * 86400000 + 4000000 + 5 * 60000, deliveredTs: now - 2 * 86400000 + 4000000 + 17 * 60000 },
        { id: 'W-106', dateStr: d2, storeId: 'S6', customerName: 'م. شريف نصر', address: 'الكورنيش', phone: '01055667788', amount: 480, fee: 30, riderId: 'R5', status: 'delivered', receivedTs: now - 2 * 86400000 + 8000000, departedTs: now - 2 * 86400000 + 8000000 + 9 * 60000, deliveredTs: now - 2 * 86400000 + 8000000 + 25 * 60000 },
        { id: 'W-107', dateStr: d1, storeId: 'S1', customerName: 'أ. إيهاب سالم', address: 'حي الضاحية', phone: '01066771122', amount: 370, fee: 25, riderId: 'R6', status: 'delivered', receivedTs: now - 86400000, departedTs: now - 86400000 + 7 * 60000, deliveredTs: now - 86400000 + 23 * 60000 },
        { id: 'W-108', dateStr: d1, storeId: 'S4', customerName: 'أ. دينا مجدي', address: 'شارع الفاتح', phone: '01177889900', amount: 245, fee: 25, riderId: 'R8', status: 'delivered', receivedTs: now - 86400000 + 3000000, departedTs: now - 86400000 + 3000000 + 8 * 60000, deliveredTs: now - 86400000 + 3000000 + 21 * 60000 },
        { id: 'W-109', dateStr: d1, storeId: 'S3', customerName: 'أ. عمرو جمال', address: 'حي الزهور', phone: '01288991122', amount: 530, fee: 30, riderId: 'R9', status: 'delivered', receivedTs: now - 86400000 + 6000000, departedTs: now - 86400000 + 6000000 + 9 * 60000, deliveredTs: now - 86400000 + 6000000 + 26 * 60000 },
        { id: 'W-110', dateStr: d1, storeId: 'S5', customerName: 'أ. سارة عادل', address: 'ميدان المحطة', phone: '01099001122', amount: 120, fee: 20, riderId: 'R10', status: 'delivered', receivedTs: now - 86400000 + 9000000, departedTs: now - 86400000 + 9000000 + 5 * 60000, deliveredTs: now - 86400000 + 9000000 + 16 * 60000 }
    ];
}

function createDemoExpenses() {
    const today = getTodayStr();
    const d1 = getPastDateInCurrentMonth(1);
    const d3 = getPastDateInCurrentMonth(3);
    return [
        { id: 'EXP-1', dateStr: today, title: 'تفويل بنزين 92 صباحي', category: 'بنزين ووقود موتوسيكلات', amount: 45, riderId: 'R1', notes: 'بون محطة التعاون' },
        { id: 'EXP-2', dateStr: d1, title: 'تغيير زيت وتيل فرامل', category: 'صيانة وقطع غيار', amount: 90, riderId: 'R4', notes: 'صيانة دورية للموتوسيكل' },
        { id: 'EXP-3', dateStr: d3, title: 'باقة إنترنت المكتب وخطوط المناديب', category: 'إنترنت واتصالات', amount: 80, riderId: '', notes: 'اشتراك شهري' },
        { id: 'EXP-4', dateStr: d3, title: 'مطبوعات وبونات استلام وصّل', category: 'تسويق ومطبوعات', amount: 65, riderId: '', notes: 'دفاتر بونات' }
    ];
}

let appState = {
    riders: [],
    stores: [],
    orders: [],
    expenses: [],
    nextOrderNum: 121
};

let uiState = {
    activeTab: 'operations',
    viewMode: 'kanban',
    statusFilter: 'all',
    riderFilter: 'all',
    selectedOrderId: null,
    reportMonth: getCurrentMonthStr(),
    expenseCatFilter: 'all'
};

let isInitialCloudLoaded = false;

function setSyncStatus(status) {
    const configs = {
        connecting: { text: 'جاري الاتصال بالسحابة...', dot: 'bg-wassalAmber animate-pulse', txt: 'text-wassalAmber' },
        online: { text: 'متصل بالسحابة (مباشر)', dot: 'bg-statusDone', txt: 'text-statusDone' },
        offline: { text: 'وضع محلي (يعمل بدون سحابة)', dot: 'bg-wassalOrange', txt: 'text-wassalOrange' }
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

function syncRidersAvailability() {
    const activeRiderIds = new Set(
        appState.orders
            .filter(o => o.status === 'received' || o.status === 'onway')
            .map(o => o.riderId)
    );
    appState.riders.forEach(r => {
        if (activeRiderIds.has(r.id)) {
            r.status = 'busy';
        } else if (r.status === 'busy') {
            r.status = 'available';
        }
    });
}

function saveData() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
    if (cloudBridge && cloudBridge.set && cloudBridge.stateRef) {
        cloudBridge.set(cloudBridge.stateRef, appState).catch(err => {
            console.error('Firebase save error:', err);
        });
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
                riders: normalizeArray(parsed.riders, JSON.parse(JSON.stringify(INITIAL_RIDERS))),
                stores: normalizeArray(parsed.stores, JSON.parse(JSON.stringify(INITIAL_STORES))),
                orders: normalizeArray(parsed.orders, []),
                expenses: normalizeArray(parsed.expenses, []),
                nextOrderNum: parsed.nextOrderNum || 121
            };
            syncRidersAvailability();
            return;
        } catch (e) {}
    }
    appState = {
        riders: JSON.parse(JSON.stringify(INITIAL_RIDERS)),
        stores: JSON.parse(JSON.stringify(INITIAL_STORES)),
        orders: createDemoOrders(),
        expenses: createDemoExpenses(),
        nextOrderNum: 121
    };
    syncRidersAvailability();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
}

function resetDemoData(notify) {
    appState = {
        riders: JSON.parse(JSON.stringify(INITIAL_RIDERS)),
        stores: JSON.parse(JSON.stringify(INITIAL_STORES)),
        orders: createDemoOrders(),
        expenses: createDemoExpenses(),
        nextOrderNum: 121
    };
    uiState.riderFilter = 'all';
    uiState.statusFilter = 'all';
    uiState.reportMonth = getCurrentMonthStr();
    const monthPicker = document.getElementById('report-month-picker');
    if (monthPicker) monthPicker.value = uiState.reportMonth;
    syncRidersAvailability();
    saveData();
    renderAll();
    if (notify) showToast('تمت إعادة ضبط البيانات التجريبية');
}

loadLocalOrDefaultData();

async function initCloudSync() {
    const fallbackTimer = setTimeout(() => {
        if (!isInitialCloudLoaded) {
            setSyncStatus('offline');
        }
    }, 5000);

    try {
        const fb = await import('./firebase-config.js');
        cloudBridge = fb;

        fb.onValue(fb.connectedRef, (snap) => {
            clearTimeout(fallbackTimer);
            setSyncStatus(snap.val() === true ? 'online' : 'offline');
        });

        fb.onValue(fb.stateRef, (snapshot) => {
            clearTimeout(fallbackTimer);
            const cloudData = snapshot.val();
            if (cloudData) {
                appState = {
                    riders: normalizeArray(cloudData.riders, JSON.parse(JSON.stringify(INITIAL_RIDERS))),
                    stores: normalizeArray(cloudData.stores, JSON.parse(JSON.stringify(INITIAL_STORES))),
                    orders: normalizeArray(cloudData.orders, []),
                    expenses: normalizeArray(cloudData.expenses, []),
                    nextOrderNum: cloudData.nextOrderNum || 121
                };
                const today = getTodayStr();
                appState.orders.forEach(o => { if (!o.dateStr) o.dateStr = today; });
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
        console.warn('Cloud module unavailable, running in local mode:', err);
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
    const endTs = (order.status === 'delivered' && order.deliveredTs) ? Number(order.deliveredTs) : now;

    const totalMins = Math.max(0, Math.round((endTs - rTs) / 60000));
    const waitMins = dTs ? Math.max(0, Math.round((dTs - rTs) / 60000)) : null;
    const roadMins = (dTs && order.status === 'delivered' && order.deliveredTs)
        ? Math.max(0, Math.round((Number(order.deliveredTs) - dTs) / 60000))
        : (dTs && order.status === 'onway' ? Math.max(0, Math.round((now - dTs) / 60000)) : null);

    return { totalMins, waitMins, roadMins };
}

function getAnalyticsSummary(targetMonth) {
    const today = getTodayStr();
    const month = targetMonth || getCurrentMonthStr();

    const todayOrders = appState.orders.filter(o => o.dateStr === today);
    const monthOrders = appState.orders.filter(o => (o.dateStr || '').startsWith(month));

    const todayDelivered = todayOrders.filter(o => o.status === 'delivered');
    const monthDelivered = monthOrders.filter(o => o.status === 'delivered');

    const todayRev = todayDelivered.reduce((s, o) => s + Number(o.fee), 0);
    const todaySettled = todayDelivered.reduce((s, o) => s + Number(o.amount), 0);
    const todayExp = appState.expenses.filter(e => e.dateStr === today).reduce((s, e) => s + Number(e.amount), 0);
    const todayProfit = todayRev - todayExp;

    const monthRev = monthDelivered.reduce((s, o) => s + Number(o.fee), 0);
    const monthSettled = monthDelivered.reduce((s, o) => s + Number(o.amount), 0);
    const monthExpensesList = appState.expenses.filter(e => (e.dateStr || '').startsWith(month));
    const monthExp = monthExpensesList.reduce((s, e) => s + Number(e.amount), 0);
    const monthProfit = monthRev - monthExp;

    const storeStats = appState.stores.map(s => {
        const sToday = todayOrders.filter(o => o.storeId === s.id);
        const sMonth = monthOrders.filter(o => o.storeId === s.id);
        const sAll = appState.orders.filter(o => o.storeId === s.id);
        const sMonthDelivered = sMonth.filter(o => o.status === 'delivered');
        const settledMonth = sMonthDelivered.reduce((sum, o) => sum + Number(o.amount), 0);
        const feeMonth = sMonthDelivered.reduce((sum, o) => sum + Number(o.fee), 0);
        const sharePct = monthOrders.length > 0 ? Math.round((sMonth.length / monthOrders.length) * 100) : 0;
        return { store: s, todayCount: sToday.length, monthCount: sMonth.length, allCount: sAll.length, settledMonth, feeMonth, sharePct };
    }).sort((a, b) => b.monthCount - a.monthCount || b.todayCount - a.todayCount);

    const riderStats = appState.riders.map(r => {
        const rToday = todayOrders.filter(o => o.riderId === r.id);
        const rMonth = monthOrders.filter(o => o.riderId === r.id);
        const rAll = appState.orders.filter(o => o.riderId === r.id);
        const rMonthDone = rMonth.filter(o => o.status === 'delivered');
        const rAllDone = rAll.filter(o => o.status === 'delivered');

        const settledMonth = rMonthDone.reduce((sum, o) => sum + Number(o.amount), 0);
        const feeMonth = rMonthDone.reduce((sum, o) => sum + Number(o.fee), 0);
        const feeToday = rToday.filter(o => o.status === 'delivered').reduce((sum, o) => sum + Number(o.fee), 0);
        const avgMins = rAllDone.length > 0
            ? Math.round(rAllDone.reduce((sum, o) => sum + getOrderDurations(o).totalMins, 0) / rAllDone.length)
            : null;

        return { rider: r, todayCount: rToday.length, monthCount: rMonth.length, allCount: rAll.length, settledMonth, feeMonth, feeToday, avgMins };
    }).sort((a, b) => b.monthCount - a.monthCount || b.todayCount - a.todayCount);

    return { today, month, todayOrders, monthOrders, todayDelivered, monthDelivered, todayRev, todaySettled, todayExp, todayProfit, monthRev, monthSettled, monthExpensesList, monthExp, monthProfit, storeStats, riderStats };
}

function buildWhatsAppMessage(o) {
    const st = getStore(o.storeId);
    const rd = getRider(o.riderId);
    const { totalMins } = getOrderDurations(o);

    const statusArabic = {
        received: '🟡 تم الاستلام من المتجر',
        onway: '🔵 في الطريق للعميل',
        delivered: '🟢 تم التسليم وتوريد الفلوس للمتجر'
    };

    return [
        `🟠 *تحديث أوردر وصّل - WASSAL*`,
        `• رقم الطلب: *#${o.id}* (${o.dateStr || getTodayStr()})`,
        `• الحالة: *${statusArabic[o.status]}*`,
        `• المتجر: ${st.name} (${st.category})`,
        `• المندوب: ${rd.name} (${rd.plate})`,
        `• العميل: ${o.customerName} (${o.phone})`,
        `• العنوان: ${o.address}`,
        `• وقت الاستلام: ${formatTime12(o.receivedTs)}`,
        o.departedTs ? `• وقت التحرك: ${formatTime12(o.departedTs)}` : null,
        o.deliveredTs ? `• وقت التسليم: ${formatTime12(o.deliveredTs)} (المدة: ${totalMins} دقيقة)` : `• الوقت المنقضي: ${totalMins} دقيقة`,
        `• المطلوب تحصيله: *${Number(o.amount) + Number(o.fee)} ج.م*`,
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
    el.innerHTML = `<span class="w-2.5 h-2.5 rounded-full wassal-grad shrink-0"></span><span>${msg}</span>`;
    container.appendChild(el);
    setTimeout(() => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(8px)';
        setTimeout(() => el.remove(), 300);
    }, 3400);
}

// ==================== RENDERING ====================
function renderKPIs() {
    const currentStats = getAnalyticsSummary(getCurrentMonthStr());
    const pickedCount = appState.orders.filter(o => o.status === 'received').length;
    const onwayCount = appState.orders.filter(o => o.status === 'onway').length;
    const active = pickedCount + onwayCount;
    const totalRidersCount = appState.riders.length;
    const availRiders = appState.riders.filter(r => r.status === 'available').length;
    const busyRiders = appState.riders.filter(r => r.status === 'busy').length;

    document.getElementById('kpi-today-orders').textContent = currentStats.todayOrders.length;
    document.getElementById('kpi-month-orders').textContent = currentStats.monthOrders.length;
    document.getElementById('kpi-delivered-sub').textContent = currentStats.todayDelivered.length;
    document.getElementById('kpi-total').textContent = appState.orders.length;

    document.getElementById('kpi-active').textContent = active;
    document.getElementById('kpi-picked-count').textContent = `${pickedCount} استلام`;
    document.getElementById('kpi-onway-count').textContent = `${onwayCount} طريق`;

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

    document.getElementById('nav-badge-active').textContent = active;
    const navLabelRiders = document.getElementById('nav-label-riders');
    if (navLabelRiders) navLabelRiders.textContent = `المناديب والموتوسيكلات (${totalRidersCount})`;
    document.getElementById('nav-badge-riders').textContent = `${availRiders}/${totalRidersCount}`;
    document.getElementById('nav-badge-stores').textContent = appState.stores.length;
    const profitSign = currentStats.todayProfit >= 0 ? '+' : '';
    document.getElementById('nav-badge-profit').textContent = `${profitSign}${currentStats.todayProfit} ج.م`;

    const pct = Math.round((availRiders / Math.max(1, totalRidersCount)) * 100);
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

    const today = getTodayStr();
    const month = getCurrentMonthStr();

    container.innerHTML = appState.riders.map(r => {
        const activeOrder = appState.orders.find(o => o.riderId === r.id && o.status !== 'delivered');
        const todayCnt = appState.orders.filter(o => o.riderId === r.id && o.date
