import { stateRef, connectedRef, set, onValue } from './firebase-config.js';

const STORAGE_KEY = 'wassal_modern_ops_v2';

const INITIAL_RIDERS = [
    { id: 'R1', name: 'أحمد محمود', bike: 'بجاج بوكسر 150', plate: 'ق هـ 412', status: 'available' },
    { id: 'R2', name: 'كريم عادل', bike: 'هوجن 3', plate: 'س ب 893', status: 'available' },
    { id: 'R3', name: 'مصطفى حسن', bike: 'دايون 4', plate: 'م ر 551', status: 'available' },
    { id: 'R4', name: 'إسلام طارق', bike: 'بجاج بولسار 180', plate: 'ط ل 129', status: 'available' },
    { id: 'R5', name: 'محمود سعيد', bike: 'هوجن F250', plate: 'ع ن 774', status: 'available' },
    { id: 'R6', name: 'عمر خالد', bike: 'بجاج بوكسر 150', plate: 'و ص 308', status: 'available' },
    { id: 'R7', name: 'يوسف إبراهيم', bike: 'دايون 40', plate: 'ك م 615', status: 'available' },
    { id: 'R8', name: 'حسام الدين', bike: 'هوجن 3', plate: 'أ د 940', status: 'available' },
    { id: 'R9', name: 'طارق نبيل', bike: 'بجاج بوكسر 150', plate: 'ف ق 217', status: 'available' },
    { id: 'R10', name: 'محمد فتحي', bike: 'بينيللي VLR', plate: 'ر ت 832', status: 'available' }
];

const INITIAL_STORES = [
    { id: 'S1', name: 'مطعم حضرموت', category: 'مطعم', fee: 25, phone: '01099887701', address: 'شارع 23 يوليو - بجوار البنك الأهلي' },
    { id: 'S2', name: 'صيدليات العزبي', category: 'صيدلية', fee: 20, phone: '01099887702', address: 'ميدان الساعة - برج الأطباء' },
    { id: 'S3', name: 'هايبر ماركت', category: 'سوبرماركت', fee: 30, phone: '01099887703', address: 'شارع البحر - أمام المسجد الكبير' },
    { id: 'S4', name: 'بيتزا كينج', category: 'مطعم', fee: 25, phone: '01099887704', address: 'حي الزهور - الشارع الرئيسي' },
    { id: 'S5', name: 'صيدلية الشفاء', category: 'صيدلية', fee: 20, phone: '01099887705', address: 'شارع المحطة - تقاطع النصر' },
    { id: 'S6', name: 'أسماك البحر', category: 'مطعم', fee: 30, phone: '01099887706', address: 'الكورنيش - بجوار النادي' }
];

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
        offline: { text: 'وضع محلي (بدون إنترنت)', dot: 'bg-red-500', txt: 'text-red-400' }
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

onValue(connectedRef, (snap) => {
    setSyncStatus(snap.val() === true ? 'online' : 'offline');
});

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
    set(stateRef, appState).catch(err => {
        console.error('Firebase save error:', err);
        showToast('⚠️ تم الحفظ محلياً (تعذرت المزامنة السحابية)');
    });
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
    if (notify) showToast('تمت إعادة ضبط البيانات التجريبية ومزامنتها سحابياً');
}

function normalizeArray(val, fallback) {
    if (!val) return fallback;
    return Array.isArray(val) ? val : Object.values(val);
}

onValue(stateRef, (snapshot) => {
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
                saveData();
            } catch (e) {
                resetDemoData(false);
            }
        } else {
            resetDemoData(false);
        }
        isInitialCloudLoaded = true;
        renderAll();
    }
}, (error) => {
    console.error('Firebase read error:', error);
    setSyncStatus('offline');
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
        try {
            appState = JSON.parse(raw);
            syncRidersAvailability();
        } catch (e) {}
    } else {
        appState = {
            riders: JSON.parse(JSON.stringify(INITIAL_RIDERS)),
            stores: JSON.parse(JSON.stringify(INITIAL_STORES)),
            orders: createDemoOrders(),
            expenses: createDemoExpenses(),
            nextOrderNum: 121
        };
    }
    renderAll();
});

function getStore(id) {
    return appState.stores.find(s => s.id === id) || { name: 'متجر', category: 'مطعم', fee: 25, phone: '', address: '' };
}

function getRider(id) {
    return appState.riders.find(r => r.id === id) || { name: 'مندوب', bike: '', plate: '', status: 'available' };
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
    const topR = currentStats.riderStats[0];
    document.getElementById('kpi-top-rider-mini').textContent = (topR && topR.monthCount > 0) ? `${topR.rider.name} (${topR.monthCount})` : '—';

    document.getElementById('kpi-today-profit').textContent = currentStats.todayProfit.toLocaleString('ar-EG');
    document.getElementById('kpi-revenue').textContent = currentStats.todayRev.toLocaleString('ar-EG');
    document.getElementById('kpi-today-expense').textContent = currentStats.todayExp.toLocaleString('ar-EG');

    document.getElementById('nav-badge-active').textContent = active;
    document.getElementById('nav-badge-riders').textContent = `${availRiders}/10`;
    document.getElementById('nav-badge-stores').textContent = appState.stores.length;
    const profitSign = currentStats.todayProfit >= 0 ? '+' : '';
    document.getElementById('nav-badge-profit').textContent = `${profitSign}${currentStats.todayProfit} ج.م`;

    const pct = Math.round((availRiders / Math.max(1, appState.riders.length)) * 100);
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
        const todayCnt = appState.orders.filter(o => o.riderId === r.id && o.dateStr === today).length;
        const monthCnt = appState.orders.filter(o => o.riderId === r.id && (o.dateStr || '').startsWith(month)).length;
        const isSelected = uiState.riderFilter === r.id;

        let dotClass = 'bg-statusDone';
        let subText = `متاح • ${todayCnt} يوم / ${monthCnt} شهر`;
        let borderClass = isSelected ? 'border-wassalOrange bg-wassalOrange/15 ring-1 ring-wassalOrange' : 'border-slateBorder bg-slateCard hover:border-slate-500';

        if (activeOrder) {
            const { totalMins } = getOrderDurations(activeOrder);
            const st = getStore(activeOrder.storeId);
            if (activeOrder.status === 'onway') {
                dotClass = 'bg-statusOnway animate-pulse';
                subText = `طريق (${totalMins}د) • ${todayCnt}ي/${monthCnt}ش`;
            } else {
                dotClass = 'bg-statusPicked';
                subText = `${st.name} (${totalMins}د) • ${todayCnt}ي/${monthCnt}ش`;
            }
        } else if (r.status === 'off') {
            dotClass = 'bg-slate-500';
            subText = `غير متاح • ${todayCnt} يوم / ${monthCnt} شهر`;
        }

        return `
            <button type="button" data-action="filter-by-rider-pill" data-id="${r.id}" class="shrink-0 flex items-center gap-2.5 px-3 py-2 rounded-xl border ${borderClass} transition-all text-right">
                <span class="w-2.5 h-2.5 rounded-full ${dotClass} shrink-0"></span>
                <div>
                    <div class="text-xs font-black text-white leading-tight">${r.name}</div>
                    <div class="text-[10px] text-slate-400 font-bold mt-0.5">${subText}</div>
                </div>
            </button>
        `;
    }).join('');
}

function getFilteredOrders() {
    const q = (document.getElementById('search-input').value || '').trim().toLowerCase();
    return appState.orders.filter(o => {
        const st = getStore(o.storeId);
        const rd = getRider(o.riderId);
        const matchText = !q ||
            o.id.toLowerCase().includes(q) ||
            o.customerName.toLowerCase().includes(q) ||
            o.address.toLowerCase().includes(q) ||
            o.phone.includes(q) ||
            st.name.toLowerCase().includes(q) ||
            rd.name.toLowerCase().includes(q);
        const matchRider = uiState.riderFilter === 'all' || o.riderId === uiState.riderFilter;
        const matchStatus = uiState.statusFilter === 'all' || o.status === uiState.statusFilter;
        return matchText && matchRider && matchStatus;
    });
}

function renderOrdersBoardAndTable() {
    const filtered = getFilteredOrders();

    ['received', 'onway', 'delivered'].forEach(stage => {
        const list = filtered.filter(o => o.status === stage);
        document.getElementById(`col-count-${stage}`).textContent = list.length;
        const container = document.getElementById(`col-list-${stage}`);

        if (list.length === 0) {
            container.innerHTML = `<div class="h-44 border border-dashed border-slateBorder rounded-2xl flex items-center justify-center text-slate-500 text-xs">لا توجد طلبات مطابقة</div>`;
            return;
        }
        container.innerHTML = list.map(o => buildOrderCard(o)).join('');
    });

    const tbody = document.getElementById('quick-table-body');
    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="py-10 text-center text-slate-500">لا توجد طلبات مطابقة للبحث أو التصفية</td></tr>`;
        return;
    }
    tbody.innerHTML = filtered.map(o => {
        const st = getStore(o.storeId);
        const rd = getRider(o.riderId);
        const { totalMins } = getOrderDurations(o);
        const isOverdue = o.status !== 'delivered' && totalMins > 35;

        const statusPill = o.status === 'received'
            ? `<span class="px-2.5 py-1 rounded-lg bg-statusPicked/15 border border-statusPicked/40 text-statusPicked font-black text-[11px]">تم الاستلام • ${totalMins} د</span>`
            : o.status === 'onway'
            ? `<span class="px-2.5 py-1 rounded-lg ${isOverdue ? 'bg-red-500/20 border-red-500 text-red-400 animate-pulse' : 'bg-statusOnway/15 border-statusOnway/40 text-statusOnway'} border font-black text-[11px]">في الطريق • ${totalMins} د</span>`
            : `<span class="px-2.5 py-1 rounded-lg bg-statusDone/15 border border-statusDone/40 text-statusDone font-black text-[11px]">تم التسليم (${totalMins} د)</span>`;

        const quickAction = o.status === 'received'
            ? `<button type="button" data-action="move-onway" data-id="${o.id}" class="px-2.5 py-1.5 rounded-lg bg-statusOnway/20 hover:bg-statusOnway text-statusOnway hover:text-obsidian font-black text-[11px] transition-colors">تحرك ➔</button>`
            : o.status === 'onway'
            ? `<button type="button" data-action="move-delivered" data-id="${o.id}" class="px-2.5 py-1.5 rounded-lg bg-statusDone/20 hover:bg-statusDone text-statusDone hover:text-obsidian font-black text-[11px] transition-colors">✓ تسليم</button>`
            : `<span class="text-statusDone font-bold text-[11px]">مكتمل</span>`;

        return `
            <tr data-action="open-drawer" data-id="${o.id}" class="hover:bg-slateCard/90 cursor-pointer transition-colors">
                <td class="px-4 py-3.5">
                    <div class="font-black text-wassalOrange">#${o.id}</div>
                    <div class="text-[10px] text-slate-500">${o.dateStr || getTodayStr()}</div>
                </td>
                <td class="px-4 py-3.5">${statusPill}</td>
                <td class="px-4 py-3.5 font-bold text-white">${st.name}</td>
                <td class="px-4 py-3.5">
                    <div class="font-bold text-slate-200">${o.customerName}</div>
                    <div class="text-[11px] text-slate-400">${o.address}</div>
                </td>
                <td class="px-4 py-3.5 font-bold text-slate-200">${rd.name}</td>
                <td class="px-4 py-3.5 text-[11px] text-slate-300">
                    <div>استلام: <strong class="text-statusPicked">${formatTime12(o.receivedTs)}</strong></div>
                    ${o.departedTs ? `<div>تحرك: <strong class="text-statusOnway">${formatTime12(o.departedTs)}</strong></div>` : ''}
                </td>
                <td class="px-4 py-3.5 font-black text-white">${Number(o.amount) + Number(o.fee)} ج.م</td>
                <td class="px-4 py-3.5 text-center" onclick="event.stopPropagation()">
                    <div class="flex items-center justify-center gap-1.5">
                        ${quickAction}
                        <button type="button" data-action="copy-whatsapp" data-id="${o.id}" class="px-2 py-1.5 rounded-lg bg-slateCard hover:bg-slateHover border border-slateBorder text-slate-300 text-[11px] font-bold">واتساب</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function buildOrderCard(o) {
    const store = getStore(o.storeId);
    const rider = getRider(o.riderId);
    const { totalMins, waitMins, roadMins } = getOrderDurations(o);
    const isOverdue = o.status !== 'delivered' && totalMins > 35;
    const isToday = (o.dateStr || getTodayStr()) === getTodayStr();

    const timeBadge = o.status === 'delivered'
        ? `<span class="px-2 py-0.5 rounded-lg bg-statusDone/15 border border-statusDone/30 text-statusDone font-black text-[10px]">✓ ${totalMins} د</span>`
        : `<span class="px-2 py-0.5 rounded-lg ${isOverdue ? 'bg-red-500/20 border-red-500 text-red-400 animate-pulse' : 'bg-slateDark border-slateBorder text-slate-200'} border font-black text-[10px]">⏳ منذ ${totalMins} د</span>`;

    let actionButton = '';
    if (o.status === 'received') {
        actionButton = `<button type="button" data-action="move-onway" data-id="${o.id}" class="w-full py-2.5 px-3 rounded-xl bg-statusOnway/20 hover:bg-statusOnway text-statusOnway hover:text-obsidian border border-statusOnway/40 font-black text-xs transition-all">تحرك للعميل ➔</button>`;
    } else if (o.status === 'onway') {
        actionButton = `<button type="button" data-action="move-delivered" data-id="${o.id}" class="w-full py-2.5 px-3 rounded-xl bg-statusDone/20 hover:bg-statusDone text-statusDone hover:text-obsidian border border-statusDone/40 font-black text-xs transition-all">✓ تم التسليم وتوريد الفلوس</button>`;
    } else {
        const detail = (waitMins !== null && roadMins !== null) ? ` (${waitMins}د انتظار + ${roadMins}د طريق)` : '';
        actionButton = `<div class="w-full py-2 px-3 rounded-xl bg-statusDone/10 border border-statusDone/30 text-statusDone font-bold text-[11px] text-center">✓ تم التسليم${detail}</div>`;
    }

    return `
        <div data-action="open-drawer" data-id="${o.id}" class="bg-slateCard hover:bg-slateHover border ${isOverdue ? 'border-red-500/70' : 'border-slateBorder hover:border-wassalOrange/50'} rounded-2xl p-4 space-y-3 cursor-pointer transition-all shadow-md">
            <div class="flex items-center justify-between gap-1.5">
                <div class="flex items-center gap-1.5 flex-wrap">
                    <span class="px-2.5 py-0.5 rounded-lg bg-obsidian border border-wassalOrange/40 text-wassalOrange font-black text-xs">#${o.id}</span>
                    ${timeBadge}
                    ${!isToday ? `<span class="px-2 py-0.5 rounded-md bg-obsidian text-slate-400 border border-slateBorder text-[10px] font-bold">${o.dateStr}</span>` : ''}
                </div>
                <div class="flex items-center gap-1" onclick="event.stopPropagation()">
                    <button type="button" data-action="copy-whatsapp" data-id="${o.id}" class="px-2.5 py-1 rounded-lg bg-obsidian hover:bg-statusDone/20 text-slate-300 hover:text-statusDone border border-slateBorder text-[11px] font-bold transition-colors">واتساب</button>
                </div>
            </div>

            <div class="bg-obsidian/90 rounded-xl p-2 border border-slateBorder grid grid-cols-3 gap-1 text-center text-[11px]">
                <div>
                    <div class="text-[10px] text-statusPicked font-bold">استلام</div>
                    <div class="font-black text-white">${formatTime12(o.receivedTs)}</div>
                </div>
                <div class="border-x border-slateBorder">
                    <div class="text-[10px] text-statusOnway font-bold">تحرك</div>
                    <div class="font-black ${o.departedTs ? 'text-white' : 'text-slate-600'}">${formatTime12(o.departedTs)}</div>
                </div>
                <div>
                    <div class="text-[10px] text-statusDone font-bold">تسليم</div>
                    <div class="font-black ${o.deliveredTs ? 'text-statusDone' : 'text-slate-600'}">${formatTime12(o.deliveredTs)}</div>
                </div>
            </div>

            <div class="bg-slateDark/80 rounded-xl p-2.5 border border-slateBorder space-y-1 text-xs">
                <div class="flex items-center justify-between">
                    <span class="font-black text-white">${store.name}</span>
                    <span class="text-[10px] px-2 py-0.5 rounded bg-wassalOrange/15 text-wassalOrange font-bold">${store.category}</span>
                </div>
                <div class="flex items-center justify-between text-slate-300 text-[11px]">
                    <span>المندوب: <strong class="text-white">${rider.name}</strong></span>
                    <span class="text-slate-400">${rider.plate}</span>
                </div>
            </div>

            <div class="text-xs space-y-1">
                <div class="flex items-center justify-between">
                    <span class="font-bold text-slate-100">${o.customerName}</span>
                    <span class="text-wassalOrange font-mono font-bold text-[11px]">${o.phone}</span>
                </div>
                <p class="text-slate-400 text-[11px] truncate">📍 ${o.address}</p>
            </div>

            <div class="grid grid-cols-3 gap-1 bg-obsidian rounded-xl p-2 border border-slateBorder text-center text-xs">
                <div>
                    <div class="text-[10px] text-slate-400">للمتجر</div>
                    <div class="font-extrabold text-white">${o.amount} ج.م</div>
                </div>
                <div class="border-x border-slateBorder">
                    <div class="text-[10px] text-slate-400">التوصيل</div>
                    <div class="font-extrabold text-wassalOrange">${o.fee} ج.م</div>
                </div>
                <div>
                    <div class="text-[10px] text-slate-400">الإجمالي</div>
                    <div class="font-black text-statusDone">${Number(o.amount) + Number(o.fee)} ج.م</div>
                </div>
            </div>

            <div onclick="event.stopPropagation()">
                ${actionButton}
            </div>
        </div>
    `;
}

function openOrderDrawer(orderId) {
    const o = appState.orders.find(item => item.id === orderId);
    if (!o) return;
    uiState.selectedOrderId = orderId;

    const st = getStore(o.storeId);
    const rd = getRider(o.riderId);
    const { totalMins, waitMins, roadMins } = getOrderDurations(o);

    document.getElementById('drawer-order-id').textContent = `#${o.id}`;
    const badge = document.getElementById('drawer-status-badge');
    if (o.status === 'received') {
        badge.className = 'px-2.5 py-1 rounded-lg bg-statusPicked/20 border border-statusPicked/40 text-statusPicked text-xs font-black';
        badge.textContent = 'تم الاستلام من المتجر';
    } else if (o.status === 'onway') {
        badge.className = 'px-2.5 py-1 rounded-lg bg-statusOnway/20 border border-statusOnway/40 text-statusOnway text-xs font-black';
        badge.textContent = 'في الطريق للعميل';
    } else {
        badge.className = 'px-2.5 py-1 rounded-lg bg-statusDone/20 border border-statusDone/40 text-statusDone text-xs font-black';
        badge.textContent = 'تم التسليم وتوريد الفلوس';
    }

    const waMessage = buildWhatsAppMessage(o);

    document.getElementById('drawer-content').innerHTML = `
        <div class="bg-slateCard border border-slateBorder rounded-2xl p-4 space-y-4">
            <div class="flex items-center justify-between">
                <h4 class="text-xs font-black text-white">⏱️ الخط الزمني للطلب (${o.dateStr || getTodayStr()})</h4>
                <span class="text-xs font-black text-wassalOrange">إجمالي المدة: ${totalMins} دقيقة</span>
            </div>

            <div class="relative pr-6 space-y-5 before:content-[''] before:absolute before:right-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slateBorder">
                <div class="relative">
                    <span class="absolute -right-6 top-1 w-3.5 h-3.5 rounded-full bg-statusPicked ring-4 ring-statusPicked/20"></span>
                    <div class="flex items-center justify-between text-xs">
                        <span class="font-black text-statusPicked">1. الاستلام من ${st.name}</span>
                        <span class="font-black text-white">${formatTime12(o.receivedTs)}</span>
                    </div>
                    <p class="text-[11px] text-slate-400 mt-0.5">تم استلام الأوردر وتعيين المندوب ${rd.name}</p>
                </div>

                <div class="relative">
                    <span class="absolute -right-6 top-1 w-3.5 h-3.5 rounded-full ${o.departedTs ? 'bg-statusOnway ring-4 ring-statusOnway/20' : 'bg-slate-600'}"></span>
                    <div class="flex items-center justify-between text-xs">
                        <span class="font-black ${o.departedTs ? 'text-statusOnway' : 'text-slate-500'}">2. التحرك في الطريق للعميل</span>
                        <span class="font-black ${o.departedTs ? 'text-white' : 'text-slate-500'}">${formatTime12(o.departedTs)}</span>
                    </div>
                    <p class="text-[11px] text-slate-400 mt-0.5">${waitMins !== null ? `مدة التجهيز/الانتظار بالمتجر: ${waitMins} دقيقة` : 'في انتظار تحرك المندوب'}</p>
                </div>

                <div class="relative">
                    <span class="absolute -right-6 top-1 w-3.5 h-3.5 rounded-full ${o.deliveredTs ? 'bg-statusDone ring-4 ring-statusDone/20' : 'bg-slate-600'}"></span>
                    <div class="flex items-center justify-between text-xs">
                        <span class="font-black ${o.deliveredTs ? 'text-statusDone' : 'text-slate-500'}">3. التسليم وتوريد الفلوس للمتجر</span>
                        <span class="font-black ${o.deliveredTs ? 'text-statusDone' : 'text-slate-500'}">${formatTime12(o.deliveredTs)}</span>
                    </div>
                    <p class="text-[11px] text-slate-400 mt-0.5">${roadMins !== null ? `مدة الطريق والتسليم: ${roadMins} دقيقة` : 'لم يتم التسليم بعد'}</p>
                </div>
            </div>
        </div>

        <div class="bg-slateCard border border-slateBorder rounded-2xl p-4 space-y-3 text-xs">
            <div>
                <div class="text-[11px] text-slate-400">بيانات العميل</div>
                <div class="font-black text-white text-sm mt-0.5">${o.customerName}</div>
                <div class="text-wassalOrange font-bold mt-0.5">📞 ${o.phone}</div>
                <div class="text-slate-300 mt-1">📍 ${o.address}</div>
            </div>
            <div class="pt-3 border-t border-slateBorder flex items-center justify-between">
                <div>
                    <div class="text-[11px] text-slate-400">المندوب المكلف</div>
                    <div class="font-black text-white mt-0.5">${rd.name}</div>
                </div>
                <div class="text-left">
                    <div class="text-[11px] text-slate-400">الموتوسيكل</div>
                    <div class="font-bold text-wassalOrange mt-0.5">${rd.bike} (${rd.plate})</div>
                </div>
            </div>
        </div>

        <div class="bg-slateCard border border-slateBorder rounded-2xl p-4 space-y-2 text-xs">
            <div class="flex justify-between text-slate-300">
                <span>قيمة الأوردر المستحقة للمتجر:</span>
                <span class="font-black text-white">${o.amount} ج.م</span>
            </div>
            <div class="flex justify-between text-slate-300">
                <span>رسوم التوصيل (وصّل):</span>
                <span class="font-black text-wassalOrange">${o.fee} ج.م</span>
            </div>
            <div class="pt-2 border-t border-slateBorder flex justify-between text-sm">
                <span class="font-black text-white">إجمالي التحصيل من العميل:</span>
                <span class="font-black text-statusDone">${Number(o.amount) + Number(o.fee)} ج.م</span>
            </div>
        </div>

        <div class="bg-slateCard border border-statusDone/30 rounded-2xl p-3.5 space-y-2">
            <div class="flex items-center justify-between text-xs">
                <span class="font-black text-statusDone">💬 رسالة جروب الواتساب</span>
                <a href="https://wa.me/?text=${encodeURIComponent(waMessage)}" target="_blank" rel="noopener" class="text-[11px] text-statusOnway underline font-bold">فتح واتساب ويب ↗</a>
            </div>
            <textarea readonly rows="6" class="w-full bg-obsidian border border-slateBorder rounded-xl p-2.5 text-[11px] text-slate-200 leading-relaxed focus:outline-none">${waMessage}</textarea>
        </div>
    `;

    let primaryAction = '';
    if (o.status === 'received') {
        primaryAction = `<button type="button" data-action="move-onway" data-id="${o.id}" class="w-full py-3 rounded-xl bg-statusOnway text-obsidian font-black text-xs shadow-lg">تحرك للعميل الآن ➔</button>`;
    } else if (o.status === 'onway') {
        primaryAction = `<button type="button" data-action="move-delivered" data-id="${o.id}" class="w-full py-3 rounded-xl bg-statusDone text-obsidian font-black text-xs shadow-lg">✓ تأكيد التسليم وتوريد الفلوس للمتجر</button>`;
    }

    document.getElementById('drawer-footer').innerHTML = `
        ${primaryAction}
        <div class="flex gap-2">
            <button type="button" data-action="copy-whatsapp" data-id="${o.id}" class="flex-1 py-2.5 rounded-xl wassal-grad text-obsidian font-black text-xs">📋 نسخ رسالة الواتساب</button>
            <button type="button" data-action="delete-order" data-id="${o.id}" class="px-4 py-2.5 rounded-xl bg-red-500/15 hover:bg-red-500 text-red-400 hover:text-white border border-red-500/30 font-black text-xs transition-colors">حذف</button>
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

function renderRiders() {
    const stats = getAnalyticsSummary(getCurrentMonthStr());
    const topToday = [...stats.riderStats].sort((a, b) => b.todayCount - a.todayCount)[0];
    const topMonth = stats.riderStats[0];

    document.getElementById('riders-top-today-badge').textContent = (topToday && topToday.todayCount > 0)
        ? `⚡ نجم اليوم: ${topToday.rider.name} (${topToday.todayCount} أوردر)`
        : `⚡ نجم اليوم: —`;
    document.getElementById('riders-top-month-badge').textContent = (topMonth && topMonth.monthCount > 0)
        ? `🏆 نجم الشهر: ${topMonth.rider.name} (${topMonth.monthCount} أوردر)`
        : `🏆 نجم الشهر: —`;

    const grid = document.getElementById('riders-grid');
    grid.innerHTML = appState.riders.map((r, idx) => {
        const rStat = stats.riderStats.find(item => item.rider.id === r.id) || { todayCount: 0, monthCount: 0, feeMonth: 0, avgMins: null };
        const riderOrders = appState.orders.filter(o => o.riderId === r.id);
        const activeOrder = riderOrders.find(o => o.status !== 'delivered');
        const lastOrder = riderOrders[0];
        const isTopMonth = topMonth && topMonth.rider.id === r.id && topMonth.monthCount > 0;

        const statusMap = {
            available: { label: 'متاح في المكتب', cls: 'bg-statusDone/15 border border-statusDone/40 text-statusDone' },
            busy: { label: 'في مهمة', cls: 'bg-statusOnway/15 border border-statusOnway/40 text-statusOnway' },
            off: { label: 'غير متاح', cls: 'bg-slateCard border border-slateBorder text-slate-400' }
        };
        const stObj = statusMap[r.status] || statusMap.available;

        let destHTML = `<div class="text-xs text-slate-500 bg-obsidian rounded-xl p-2.5 border border-slateBorder">لا توجد رحلات نشطة حالياً</div>`;
        if (activeOrder) {
            const st = getStore(activeOrder.storeId);
            const { totalMins } = getOrderDurations(activeOrder);
            destHTML = `
                <div class="text-xs bg-statusOnway/10 border border-statusOnway/30 rounded-xl p-2.5 space-y-1">
                    <div class="flex justify-between font-black text-statusOnway">
                        <span>الوجهة الحالية (#${activeOrder.id})</span>
                        <span>منذ ${totalMins} د</span>
                    </div>
                    <div class="text-white font-bold">${st.name} ➔ ${activeOrder.address}</div>
                </div>
            `;
        } else if (lastOrder) {
            const st = getStore(lastOrder.storeId);
            destHTML = `
                <div class="text-xs bg-obsidian rounded-xl p-2.5 border border-slateBorder space-y-0.5">
                    <div class="text-[11px] text-slate-400">آخر وجهة (${lastOrder.dateStr} • ${formatTime12(lastOrder.deliveredTs || lastOrder.receivedTs)}):</div>
                    <div class="text-slate-200 font-bold">${st.name} ➔ ${lastOrder.address}</div>
                </div>
            `;
        }

        return `
            <div class="bg-slateDark border ${isTopMonth ? 'border-wassalOrange/70 shadow-lg shadow-orange-500/10' : 'border-slateBorder hover:border-wassalOrange/50'} transition-all rounded-2xl p-5 flex flex-col justify-between space-y-4">
                <div class="space-y-3">
                    <div class="flex items-start justify-between gap-2">
                        <div class="flex items-center gap-3">
                            <div class="w-11 h-11 rounded-xl wassal-grad text-obsidian font-black flex items-center justify-center text-sm shadow-md">#${idx + 1}</div>
                            <div>
                                <div class="flex items-center gap-1.5">
                                    <h3 class="font-black text-base text-white">${r.name}</h3>
                                    ${isTopMonth ? `<span class="text-xs" title="الأكثر توصيلاً هذا الشهر">👑</span>` : ''}
                                </div>
                                <p class="text-xs text-slate-400">${r.bike} • <span class="text-wassalOrange font-bold">${r.plate}</span></p>
                            </div>
                        </div>
                        <span class="px-2.5 py-1 rounded-lg text-[11px] font-black ${stObj.cls}">${stObj.label}</span>
                    </div>
                    ${destHTML}
                </div>

                <div class="pt-3 border-t border-slateBorder space-y-3">
                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                        <div class="bg-obsidian rounded-xl p-2 border border-statusDone/30">
                            <div class="text-[10px] text-statusDone font-bold">أوردرات اليوم</div>
                            <div class="font-black text-white text-base mt-0.5">${rStat.todayCount}</div>
                        </div>
                        <div class="bg-obsidian rounded-xl p-2 border border-wassalOrange/30">
                            <div class="text-[10px] text-wassalOrange font-bold">أوردرات الشهر</div>
                            <div class="font-black text-wassalOrange text-base mt-0.5">${rStat.monthCount}</div>
                        </div>
                        <div class="bg-obsidian rounded-xl p-2 border border-slateBorder">
                            <div class="text-[10px] text-slate-400">توصيل الشهر</div>
                            <div class="font-black text-white text-xs mt-1">${rStat.feeMonth} ج.م</div>
                        </div>
                        <div class="bg-obsidian rounded-xl p-2 border border-slateBorder">
                            <div class="text-[10px] text-slate-400">متوسط السرعة</div>
                            <div class="font-black text-statusOnway text-xs mt-1">${rStat.avgMins !== null ? rStat.avgMins + ' د' : '—'}</div>
                        </div>
                    </div>
                    <button type="button" data-action="cycle-rider-status" data-id="${r.id}" class="w-full py-2 rounded-xl bg-slateCard hover:bg-slateHover border border-slateBorder text-xs font-bold text-slate-300 hover:text-white transition-colors">
                        تغيير الحالة (متاح / في مهمة / غير متاح)
                    </button>
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
                        <h3 class="text-xl font-black text-white mt-0.5">${top.store.name} <span class="text-xs px-2.5 py-0.5 rounded-full bg-wassalOrange/20 text-wassalOrange font-bold mr-1">${top.store.category}</span></h3>
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
    grid.innerHTML = ranked.map((item, idx) => {
        const s = item.store;
        const isFirst = idx === 0 && item.monthCount > 0;
        return `
            <div class="bg-slateDark border ${isFirst ? 'border-statusPicked/70 shadow-lg shadow-amber-500/10' : 'border-slateBorder hover:border-wassalOrange/50'} transition-all rounded-2xl p-5 space-y-4">
                <div class="flex items-start justify-between">
                    <div>
                        <div class="flex items-center gap-2">
                            <span class="px-2 py-0.5 rounded-md ${isFirst ? 'bg-statusPicked text-obsidian font-black' : 'bg-obsidian text-slate-300 border border-slateBorder font-bold'} text-[11px]">#${idx + 1}</span>
                            <span class="text-[10px] px-2.5 py-0.5 rounded-md bg-wassalOrange/15 border border-wassalOrange/30 text-wassalOrange font-black">${s.category}</span>
                        </div>
                        <h3 class="font-black text-base text-white mt-2">${s.name} ${isFirst ? '👑' : ''}</h3>
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
                    <p>📍 ${s.address}</p>
                    <p>📞 ${s.phone}</p>
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
            </div>
        `;
    }).join('');
}

function renderAccounting() {
    const targetMonth = uiState.reportMonth || getCurrentMonthStr();
    const stats = getAnalyticsSummary(targetMonth);

    document.getElementById('pnl-today-date').textContent = `تاريخ اليوم: ${stats.today}`;
    document.getElementById('pnl-today-rev').textContent = `${stats.todayRev.toLocaleString('ar-EG')} ج.م`;
    document.getElementById('pnl-today-exp').textContent = `${stats.todayExp.toLocaleString('ar-EG')} ج.م`;
    const todayNetEl = document.getElementById('pnl-today-net');
    todayNetEl.textContent = `${stats.todayProfit.toLocaleString('ar-EG')} ج.م`;
    todayNetEl.className = `font-black text-lg ${stats.todayProfit >= 0 ? 'text-wassalOrange' : 'text-red-400'}`;
    const todayMargin = stats.todayRev > 0 ? Math.round((stats.todayProfit / stats.todayRev) * 100) : 0;
    document.getElementById('pnl-today-margin').textContent = `هامش الربح: ${todayMargin}%`;
    document.getElementById('pnl-today-settled').textContent = `${stats.todaySettled.toLocaleString('ar-EG')} ج.م`;

    document.getElementById('pnl-month-label').textContent = `الفترة المحاسبية: ${targetMonth}`;
    document.getElementById('pnl-month-orders-count').textContent = stats.monthDelivered.length;
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
        barsContainer.innerHTML = `<div class="col-span-full text-center text-xs text-slate-500 py-1">لا توجد مصروفات مسجلة في شهر ${targetMonth}</div>`;
    } else {
        barsContainer.innerHTML = catEntries.map(([cat, val]) => {
            const pct = stats.monthExp > 0 ? Math.round((val / stats.monthExp) * 100) : 0;
            return `
                <div class="bg-slateDark border border-slateBorder rounded-xl p-2.5 space-y-1.5">
                    <div class="flex justify-between text-[11px]">
                        <span class="font-bold text-slate-200 truncate">${cat}</span>
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
                    <td class="px-3.5 py-3 text-slate-400 font-mono">${e.dateStr}</td>
                    <td class="px-3.5 py-3">
                        <div class="font-bold text-white">${e.title}</div>
                        ${e.notes ? `<div class="text-[10px] text-slate-400">${e.notes}</div>` : ''}
                    </td>
                    <td class="px-3.5 py-3"><span class="px-2 py-0.5 rounded bg-obsidian border border-slateBorder text-[11px] text-slate-300">${e.category}</span></td>
                    <td class="px-3.5 py-3 text-slate-300 font-bold">${rdName}</td>
                    <td class="px-3.5 py-3 font-black text-red-400">${Number(e.amount).toLocaleString('ar-EG')} ج.م</td>
                    <td class="px-3.5 py-3 text-center">
                        <button type="button" data-action="delete-expense" data-id="${e.id}" class="px-2 py-1 rounded-lg bg-red-500/15 hover:bg-red-500 text-red-400 hover:text-white text-[11px] font-bold transition-colors">✕</button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    const storesBody = document.getElementById('stores-accounting-body');
    storesBody.innerHTML = stats.storeStats.map((item, idx) => {
        const s = item.store;
        const rankBadge = idx === 0 && item.monthCount > 0 ? '👑 #1' : `#${idx + 1}`;
        return `
            <tr class="hover:bg-slateCard/80 ${idx === 0 && item.monthCount > 0 ? 'bg-statusPicked/5' : ''}">
                <td class="px-4 py-3 font-black ${idx === 0 && item.monthCount > 0 ? 'text-statusPicked' : 'text-slate-400'}">${rankBadge}</td>
                <td class="px-4 py-3 font-black text-white">${s.name}</td>
                <td class="px-4 py-3 text-slate-400">${s.category}</td>
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

    const ridersBody = document.getElementById('riders-accounting-body');
    ridersBody.innerHTML = stats.riderStats.map((item, idx) => {
        const r = item.rider;
        const rankBadge = idx === 0 && item.monthCount > 0 ? '🏆 #1' : `#${idx + 1}`;
        return `
            <tr class="hover:bg-slateCard/80">
                <td class="px-4 py-3 font-black ${idx === 0 && item.monthCount > 0 ? 'text-wassalOrange' : 'text-slate-400'}">${rankBadge}</td>
                <td class="px-4 py-3 font-black text-white">${r.name}</td>
                <td class="px-4 py-3 text-slate-400">${r.bike} (${r.plate})</td>
                <td class="px-4 py-3 font-black text-statusDone text-sm">${item.todayCount}</td>
                <td class="px-4 py-3 font-black text-wassalOrange text-sm">${item.monthCount}</td>
                <td class="px-4 py-3 font-bold text-statusOnway">${item.avgMins !== null ? item.avgMins + ' دقيقة' : '—'}</td>
                <td class="px-4 py-3 font-bold text-white">${item.settledMonth.toLocaleString('ar-EG')} ج.م</td>
                <td class="px-4 py-3 font-black text-wassalOrange">${item.feeMonth.toLocaleString('ar-EG')} ج.م</td>
            </tr>
        `;
    }).join('');

    const auditBody = document.getElementById('audit-table-body');
    auditBody.innerHTML = stats.monthOrders.map(o => {
        const st = getStore(o.storeId);
        const rd = getRider(o.riderId);
        const { totalMins } = getOrderDurations(o);
        return `
            <tr class="hover:bg-slateCard/80">
                <td class="px-3 py-3 font-black text-wassalOrange">#${o.id}</td>
                <td class="px-3 py-3 text-slate-400 font-mono">${o.dateStr || getTodayStr()}</td>
                <td class="px-3 py-3 font-bold text-white">${st.name}</td>
                <td class="px-3 py-3 text-slate-200">${o.customerName} — <span class="text-slate-400">${o.address}</span></td>
                <td class="px-3 py-3 font-bold text-slate-200">${rd.name}</td>
                <td class="px-3 py-3 font-bold text-statusPicked">${formatTime12(o.receivedTs)}</td>
                <td class="px-3 py-3 font-bold text-statusOnway">${formatTime12(o.departedTs)}</td>
                <td class="px-3 py-3 font-bold text-statusDone">${formatTime12(o.deliveredTs)}</td>
                <td class="px-3 py-3 font-black text-white">${totalMins} د</td>
                <td class="px-3 py-3 font-black text-statusDone">${Number(o.amount) + Number(o.fee)} ج.م</td>
            </tr>
        `;
    }).join('');
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
        lines.push(`${r.rider.name},${r.todayCount},${r.monthCount},${r.feeMonth},${r.settledMonth}`);
    });
    lines.push('');
    lines.push('--- ترتيب المتاجر ---');
    lines.push('المتجر,التصنيف,أوردرات اليوم,أوردرات الشهر,نسبة المساهمة %,مبيعات موردة');
    stats.storeStats.forEach(s => {
        lines.push(`${s.store.name},${s.store.category},${s.todayCount},${s.monthCount},${s.sharePct}%,${s.settledMonth}`);
    });
    lines.push('');
    lines.push('--- سجل المصروفات ---');
    lines.push('التاريخ,البيان,التصنيف,المبلغ,ملاحظات');
    stats.monthExpensesList.forEach(e => {
        lines.push(`${e.dateStr},"${e.title}",${e.category},${e.amount},"${e.notes || ''}"`);
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
            appState.riders.map(r => `<option value="${r.id}">${r.name} (${r.plate})</option>`).join('');
    }
    const expDateInput = document.getElementById('exp-date');
    if (expDateInput && !expDateInput.value) {
        expDateInput.value = getTodayStr();
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
        operations: ['غرفة العمليات ومتابعة الطلبات الحية', 'تتبع لحظي لحركة الـ 10 مناديب وأوقات الاستلام والتحرك والتسليم وتوريد المبالغ للمتاجر'],
        riders: ['أسطول المناديب والموتوسيكلات (10 طيارين)', 'إحصائيات أوردرات اليوم وأوردرات الشهر ومتوسط السرعة لكل مندوب'],
        stores: ['المتاجر المتعاقدة وترتيب الأكثر عملاً', 'تصنيف المتاجر حسب حجم الأوردرات اليومية والشهرية ونسبة المساهمة'],
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
    const storeSel = document.getElementById('input-order-store');
    storeSel.innerHTML = appState.stores.map(s => `<option value="${s.id}">${s.name} (${s.category}) - توصيل ${s.fee} ج.م</option>`).join('');
    if (appState.stores.length > 0) {
        document.getElementById('input-order-fee').value = appState.stores[0].fee;
    }

    const riderSel = document.getElementById('input-order-rider');
    const sortedRiders = [...appState.riders].sort((a, b) => (a.status === 'available' ? -1 : 1));
    riderSel.innerHTML = sortedRiders.map(r => {
        const tag = r.status === 'available' ? '🟢 متاح في المكتب' : (r.status === 'busy' ? '🔵 في مهمة' : '⚪ غير متاح');
        return `<option value="${r.id}">${r.name} — ${tag} (${r.plate})</option>`;
    }).join('');

    document.getElementById('input-order-time').value = '';
    const modal = document.getElementById('modal-new-order');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

// ==================== EVENT DELEGATION ====================
document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    const id = btn.getAttribute('data-id');

    if (action === 'toggle-sidebar') {
        document.getElementById('sidebar').classList.toggle('translate-x-full');
        document.getElementById('sidebar-backdrop').classList.toggle('hidden');
    } else if (action === 'switch-tab') {
        switchTab(btn.getAttribute('data-tab'));
    } else if (action === 'set-view-mode') {
        setViewMode(btn.getAttribute('data-mode'));
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
    } else if (action === 'open-new-order') {
        openNewOrderModal();
    } else if (action === 'open-new-store') {
        const m = document.getElementById('modal-new-store');
        m.classList.remove('hidden');
        m.classList.add('flex');
    } else if (action === 'close-modal') {
        const modalId = btn.getAttribute('data-modal');
        const m = document.getElementById(modalId);
        if (m) {
            m.classList.add('hidden');
            m.classList.remove('flex');
        }
    } else if (action === 'reset-demo') {
        resetDemoData(true);
    } else if (action === 'print-report') {
        window.print();
    } else if (action === 'export-csv') {
        exportMonthlyCSV();
    } else if (action === 'delete-expense') {
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
            const { totalMins } = getOrderDurations(order);
            showToast(`🟢 تم تسليم #${order.id} في ${totalMins} دقيقة وعاد المندوب للمكتب`);
        }
    } else if (action === 'delete-order') {
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
    } else if (action === 'cycle-rider-status') {
        const rider = appState.riders.find(r => r.id === id);
        if (rider) {
            const hasActive = appState.orders.some(o => o.riderId === id && o.status !== 'delivered');
            if (hasActive) {
                showToast(`المندوب ${rider.name} لديه طلب جاري حالياً`);
                return;
            }
            const orderCycle = ['available', 'busy', 'off'];
            const nextIdx = (orderCycle.indexOf(rider.status) + 1) % orderCycle.length;
            rider.status = orderCycle[nextIdx];
            saveData();
            renderAll();
        }
    }
});

// ==================== FORM & SEARCH LISTENERS ====================
document.getElementById('input-order-store').addEventListener('change', (e) => {
    const st = getStore(e.target.value);
    document.getElementById('input-order-fee').value = st.fee;
});

document.getElementById('form-new-order').addEventListener('submit', (e) => {
    e.preventDefault();
    const storeId = document.getElementById('input-order-store').value;
    const customerName = document.getElementById('input-order-customer').value.trim();
    const phone = document.getElementById('input-order-phone').value.trim();
    const address = document.getElementById('input-order-address').value.trim();
    const amount = Number(document.getElementById('input-order-amount').value) || 0;
    const fee = Number(document.getElementById('input-order-fee').value) || 0;
    const riderId = document.getElementById('input-order-rider').value;
    const manualTime = document.getElementById('input-order-time').value;

    let receivedTs = Date.now();
    if (manualTime) {
        const [hh, mm] = manualTime.split(':').map(Number);
        const d = new Date();
        d.setHours(hh, mm, 0, 0);
        receivedTs = d.getTime();
    }

    const newOrder = {
        id: `W-${appState.nextOrderNum++}`,
        dateStr: getTodayStr(),
        storeId,
        customerName,
        address,
        phone,
        amount,
        fee,
        riderId,
        status: 'received',
        receivedTs,
        departedTs: null,
        deliveredTs: null
    };

    appState.orders.unshift(newOrder);
    syncRidersAvailability();
    saveData();
    renderAll();

    e.target.reset();
    const modal = document.getElementById('modal-new-order');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    showToast(`🟡 تم تسجيل استلام الطلب #${newOrder.id} الساعة ${formatTime12(receivedTs)}`);
});

document.getElementById('form-new-expense').addEventListener('submit', (e) => {
    e.preventDefault();
    const title = document.getElementById('exp-title').value.trim();
    const category = document.getElementById('exp-category').value;
    const amount = Number(document.getElementById('exp-amount').value) || 0;
    const riderId = document.getElementById('exp-rider').value;
    const dateStr = document.getElementById('exp-date').value || getTodayStr();
    const notes = document.getElementById('exp-notes').value.trim();

    appState.expenses.unshift({
        id: 'EXP-' + Date.now(),
        dateStr,
        title,
        category,
        amount,
        riderId,
        notes
    });
    saveData();
    renderAll();

    document.getElementById('exp-title').value = '';
    document.getElementById('exp-amount').value = '';
    document.getElementById('exp-notes').value = '';
    showToast(`💸 تم تسجيل مصروف "${title}" بقيمة ${amount} ج.م`);
});

document.getElementById('report-month-picker').addEventListener('change', (e) => {
    uiState.reportMonth = e.target.value || getCurrentMonthStr();
    renderAccounting();
});

document.getElementById('filter-expense-cat').addEventListener('change', (e) => {
    uiState.expenseCatFilter = e.target.value;
    renderAccounting();
});

document.getElementById('form-new-store').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('input-store-name').value.trim();
    const category = document.getElementById('input-store-category').value;
    const fee = Number(document.getElementById('input-store-fee').value) || 25;
    const phone = document.getElementById('input-store-phone').value.trim();
    const address = document.getElementById('input-store-address').value.trim();

    appState.stores.push({
        id: 'S' + Date.now(),
        name,
        category,
        fee,
        phone,
        address
    });
    saveData();
    renderAll();

    e.target.reset();
    const modal = document.getElementById('modal-new-store');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    showToast(`تمت إضافة ${name} إلى المتاجر المتعاقدة`);
});

document.getElementById('search-input').addEventListener('input', renderOrdersBoardAndTable);

// ==================== INIT & LIVE TIMER ====================
renderAll();

let seconds = 0;
const tick = () => {
    const clock = document.getElementById('live-clock');
    if (clock) clock.textContent = formatTime12(Date.now());
    seconds++;
    if (seconds % 30 === 0) {
        renderFleetRibbon();
        renderOrdersBoardAndTable();
        renderRiders();
    }
};
tick();
setInterval(tick, 1000);