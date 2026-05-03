(function () {
  'use strict';

  const toast = document.getElementById('p2pToast');
  let toastTimer = null;

  function showToast(msg, color) {
    if (!toast) return;
    toast.textContent = msg;
    toast.style.background = color || '#1e2026';
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
  }

  const subnavLinks = document.querySelectorAll('.subnav__link');
  subnavLinks.forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      subnavLinks.forEach(l => l.classList.remove('subnav__link--active'));
      link.classList.add('subnav__link--active');
    });
  });

  const bsBtns = document.querySelectorAll('.p2p-tabs__bs');
  const p2pTitle = document.getElementById('p2pTitle');
  const tableBodyEl = document.getElementById('tableBody');
  let currentSide = 'buy';
  let currentCoin = 'USDT';
  const P2P_OFFERS_PER_PAGE = 10;
  const MAX_MARKET_PAGES = 5;
  let activeMarketPage = 1;
  let totalMarketPages = 1;
  let refreshPaginationUi = () => {};
  const marketCache = new Map();
  let selectedPayments = [];
  let sellerReviewsActiveFilter = 'good';

  const P2P_ORDERS_BADGE_KEY = 'bybit_p2p_orders_badge_v1';
  const P2P_SELLER_VIEW_KEY = 'bybit_p2p_seller_view_v1';
  const P2P_MARKET_PREFERRED_KEY = 'bybit_p2p_market_preferred_v1';
  const P2P_OPEN_TRADE_ON_PROFILE_BOOT_KEY = 'bybit_p2p_open_trade_on_profile_boot_v1';
  const P2P_INDEX_AUTO_OPEN_DONE_KEY = 'bybit_p2p_index_auto_open_done_v1';
  const CURRENT_PAGE = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
  const IS_INDEX_PAGE = CURRENT_PAGE === '' || CURRENT_PAGE === 'index.html';
  const IS_PROFILE_PAGE = CURRENT_PAGE === 'profile.html';
  const IS_ORDER_ROOM_PAGE = CURRENT_PAGE === 'order-room.html';

  function setP2pMarketPreferred() {
    try {
      sessionStorage.setItem(P2P_MARKET_PREFERRED_KEY, '1');
    } catch (_) {}
  }

  function clearP2pMarketPreferred() {
    try {
      sessionStorage.removeItem(P2P_MARKET_PREFERRED_KEY);
    } catch (_) {}
  }

  function isP2pMarketPreferred() {
    try {
      return sessionStorage.getItem(P2P_MARKET_PREFERRED_KEY) === '1';
    } catch (_) {
      return false;
    }
  }

  function saveP2pSellerViewUsername(username) {
    try {
      const s = String(username ?? '').trim();
      if (!s) return;
      sessionStorage.setItem(P2P_SELLER_VIEW_KEY, JSON.stringify({ u: s }));
    } catch (_) {}
  }

  function clearP2pSellerViewPersist() {
    try {
      sessionStorage.removeItem(P2P_SELLER_VIEW_KEY);
    } catch (_) {}
    try {
      sessionStorage.removeItem(P2P_OPEN_TRADE_ON_PROFILE_BOOT_KEY);
    } catch (_) {}
  }

  function markOpenTradeOnProfileBoot(shouldOpen) {
    try {
      if (shouldOpen) sessionStorage.setItem(P2P_OPEN_TRADE_ON_PROFILE_BOOT_KEY, '1');
      else sessionStorage.removeItem(P2P_OPEN_TRADE_ON_PROFILE_BOOT_KEY);
    } catch (_) {}
  }

  function consumeOpenTradeOnProfileBootFlag() {
    try {
      const shouldOpen = sessionStorage.getItem(P2P_OPEN_TRADE_ON_PROFILE_BOOT_KEY) === '1';
      sessionStorage.removeItem(P2P_OPEN_TRADE_ON_PROFILE_BOOT_KEY);
      return shouldOpen;
    } catch (_) {
      return false;
    }
  }

  function isIndexAutoOpenDone() {
    try {
      return sessionStorage.getItem(P2P_INDEX_AUTO_OPEN_DONE_KEY) === '1';
    } catch (_) {
      return false;
    }
  }

  function setIndexAutoOpenDone() {
    try {
      sessionStorage.setItem(P2P_INDEX_AUTO_OPEN_DONE_KEY, '1');
    } catch (_) {}
  }

  function getP2pSellerViewUsername() {
    try {
      const o = JSON.parse(sessionStorage.getItem(P2P_SELLER_VIEW_KEY) || 'null');
      const s = o && o.u != null ? String(o.u).trim() : '';
      return s || null;
    } catch (_) {
      return null;
    }
  }

  function isReloadNavigation() {
    try {
      const nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
      return !!(nav && nav.type === 'reload');
    } catch (_) {
      return false;
    }
  }

  function getP2pOrdersBadgeCount() {
    try {
      const n = parseInt(sessionStorage.getItem(P2P_ORDERS_BADGE_KEY), 10);
      return Number.isFinite(n) && n > 0 ? n : 0;
    } catch (_) {
      return 0;
    }
  }

  function setP2pOrdersBadgeCount(n) {
    const v = Math.max(0, Math.floor(Number(n)) || 0);
    try {
      if (v <= 0) sessionStorage.removeItem(P2P_ORDERS_BADGE_KEY);
      else sessionStorage.setItem(P2P_ORDERS_BADGE_KEY, String(v));
    } catch (_) {}
    syncOrdersNavBadge();
  }

  function incrementP2pOrdersBadge() {
    setP2pOrdersBadgeCount(getP2pOrdersBadgeCount() + 1);
  }

  function syncOrdersNavBadge() {
    const el = document.getElementById('subnavOrdersBadge');
    if (!el) return;
    const n = getP2pOrdersBadgeCount();
    if (n > 0) {
      el.textContent = n > 99 ? '99+' : String(n);
      el.removeAttribute('hidden');
      el.setAttribute('aria-hidden', 'false');
    } else {
      el.textContent = '';
      el.setAttribute('hidden', '');
      el.setAttribute('aria-hidden', 'true');
    }
  }

  function updateTitle() {
    if (!p2pTitle) return;
    const action = currentSide === 'buy' ? 'Купить' : 'Продать';
    const el = document.getElementById('currencyLabel');
    const fiat = el ? el.textContent.trim() : 'EUR';
    p2pTitle.textContent = `${action} ${currentCoin} за ${fiat} через P2P`;
  }

  function updateTableButtons() {
    document.querySelectorAll('.p2p-table__buy-btn, .p2p-table__sell-btn').forEach(btn => {
      const coin = btn.dataset.coin || 'USDT';
      if (currentSide === 'buy') {
        btn.textContent = `Купить ${coin}`;
        btn.classList.remove('p2p-table__sell-btn');
        btn.classList.add('p2p-table__buy-btn');
      } else {
        btn.textContent = `Продать ${coin}`;
        btn.classList.remove('p2p-table__buy-btn');
        btn.classList.add('p2p-table__sell-btn');
      }
    });
  }

  bsBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      bsBtns.forEach(b => {
        b.classList.remove('p2p-tabs__bs--active', 'buy-active', 'sell-active');
      });
      btn.classList.add('p2p-tabs__bs--active');
      currentSide = btn.dataset.side;
      if (currentSide === 'buy') btn.classList.add('buy-active');
      else btn.classList.add('sell-active');
      updateTitle();
      activeMarketPage = 1;
      renderMarketPage(1);
    });
  });

  const coinBtns = document.querySelectorAll('.p2p-tabs__coin');

  coinBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      coinBtns.forEach(b => b.classList.remove('p2p-tabs__coin--active'));
      btn.classList.add('p2p-tabs__coin--active');
      currentCoin = btn.dataset.coin || 'USDT';
      document.querySelectorAll('.p2p-table__buy-btn, .p2p-table__sell-btn').forEach(b => {
        b.dataset.coin = currentCoin;
      });
      updateTitle();
      activeMarketPage = 1;
      renderMarketPage(1);
    });
  });

  const bybitEndpoints = [
    'https://api2.bybit.com/fiat/otc/item/online',
    'https://api.bybit.com/fiat/otc/item/online'
  ];

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function parseNum(v) {
    const n = Number(String(v ?? '').replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  }

  function simpleHash(str) {
    let h = 2166136261;
    const s = String(str ?? '');
    for (let i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return Math.abs(h);
  }

  function syntheticProfileFromOffer(o) {
    const h = simpleHash(o.name);
    const completion = parseNum(o.completion);
    const ordersDigits = String(o.orders ?? '').replace(/[^\d]/g, '');
    const ordersNum = ordersDigits ? parseInt(ordersDigits, 10) : 0;
    const orders30d = ordersNum > 0 ? Math.min(ordersNum, 9999) : 50 + (h % 200);
    const ordersTotalAll = ordersNum > 0 ? ordersNum * 17 + (h % 8000) : 12000 + (h % 9000);
    const ordersBuy = 5 + (h % 120);
    const ordersSell = Math.max(0, ordersTotalAll - ordersBuy);
    return {
      username: o.name,
      isOnline: h % 6 !== 0,
      verifications: {
        email: true,
        sms: h % 11 !== 0,
        identity: completion >= 98,
        deposit: h % 5 !== 0
      },
      orders30d,
      ordersTotalAll,
      ordersBuy,
      ordersSell,
      accountDays: 400 + (h % 650),
      firstTradeDays: 380 + (h % 640),
      ratingPercent: completion > 0 ? Math.min(100, Math.max(80, completion)) : 90 + (h % 10),
      likes: 20 + (h % 150),
      dislikes: h % 5,
      avgTransferMin: 5 + (h % 25),
      avgPaymentMin: 1 + (h % 8)
    };
  }

  function buildProfileFromApiItem(item, o) {
    const h = simpleHash(o.name);
    const completion = parseNum(o.completion);
    const ordersDigits = String(o.orders ?? '').replace(/[^\d]/g, '');
    const ordersFromStats = ordersDigits ? parseInt(ordersDigits, 10) : 0;

    const pickFirstNum = (...vals) => {
      for (const v of vals) {
        if (v == null || v === '') continue;
        const n = parseNum(v);
        if (Number.isFinite(n) && n >= 0) return n;
      }
      return NaN;
    };

    const onlineRaw = item.online ?? item.isOnline ?? item.onLine ?? item.userOnlineStatus ?? item.userOnline;
    let isOnline = null;
    if (onlineRaw === '1' || onlineRaw === 1 || onlineRaw === true || onlineRaw === 'Online' || onlineRaw === 'online') {
      isOnline = true;
    } else if (onlineRaw === '0' || onlineRaw === 0 || onlineRaw === false || onlineRaw === 'Offline' || onlineRaw === 'offline') {
      isOnline = false;
    }

    const good = pickFirstNum(item.goodCommentNum, item.positiveNum, item.goodRatingNum, item.goodRating);
    const bad = pickFirstNum(item.badCommentNum, item.negativeNum, item.badRatingNum, item.badRating);
    const orders30d = pickFirstNum(
      item.recentOrderNum,
      item.completedOrderNum,
      item.orderFinishNumMonth,
      item.monthOrderNum,
      item.monthFinishNum
    );
    const avgTransfer = pickFirstNum(
      item.avgReleaseTime,
      item.avgConfirmTime,
      item.avgTransferTime,
      item.averageReleaseTime,
      item.avgReleaseMinute
    );
    const avgPayment = pickFirstNum(
      item.avgPaymentTime,
      item.avgPayTime,
      item.buyerAvgPaymentTime,
      item.averagePaymentTime,
      item.avgPayMinute
    );

    const ordersTotalAll = pickFirstNum(
      item.completedOrderNum,
      item.orderNum,
      item.totalOrderNum,
      item.totalOrderCount,
      item.allOrderCount,
      item.tradeCount
    );

    let ordersBuy = pickFirstNum(
      item.buyOrderNum,
      item.monthBuyOrderNum,
      item.recentBuyOrderNum,
      item.finishBuyOrderNum,
      item.buyFinishNum
    );
    let ordersSell = pickFirstNum(
      item.sellOrderNum,
      item.monthSellOrderNum,
      item.recentSellOrderNum,
      item.finishSellOrderNum,
      item.sellFinishNum
    );

    const obOk = Number.isFinite(ordersBuy) && ordersBuy >= 0;
    const osOk = Number.isFinite(ordersSell) && ordersSell >= 0;
    if (Number.isFinite(ordersTotalAll) && ordersTotalAll > 0) {
      if (obOk && osOk) {
        ordersBuy = Math.round(ordersBuy);
        ordersSell = Math.round(ordersSell);
      } else if (obOk && !osOk) {
        ordersBuy = Math.round(ordersBuy);
        ordersSell = Math.max(0, Math.round(ordersTotalAll - ordersBuy));
      } else if (!obOk && osOk) {
        ordersSell = Math.round(ordersSell);
        ordersBuy = Math.max(0, Math.round(ordersTotalAll - ordersSell));
      } else {
        ordersBuy = 0;
        ordersSell = Math.round(ordersTotalAll);
      }
    } else {
      ordersBuy = obOk ? Math.round(ordersBuy) : undefined;
      ordersSell = osOk ? Math.round(ordersSell) : undefined;
    }

    let accountDays = pickFirstNum(
      item.accountRegisterDay,
      item.registerDayCount,
      item.registerDays,
      item.userRegisterDay
    );
    if (accountDays == null || !Number.isFinite(accountDays)) {
      const ts = item.registerTime ?? item.userRegisterTime ?? item.createTime ?? item.regTime;
      if (ts != null) {
        const n = typeof ts === 'number' ? ts : Date.parse(String(ts));
        if (Number.isFinite(n)) {
          const ms = n < 1e12 ? n * 1000 : n;
          accountDays = Math.floor((Date.now() - ms) / 864e5);
        }
      }
    }

    let firstTradeDays = pickFirstNum(
      item.firstTradeDayCount,
      item.firstOrderDay,
      item.tradeFirstDays,
      item.daysFromFirstTrade
    );
    if (firstTradeDays == null || !Number.isFinite(firstTradeDays)) {
      const ts = item.firstTradeTime ?? item.firstOrderTime ?? item.firstDealTime;
      if (ts != null) {
        const n = typeof ts === 'number' ? ts : Date.parse(String(ts));
        if (Number.isFinite(n)) {
          const ms = n < 1e12 ? n * 1000 : n;
          firstTradeDays = Math.floor((Date.now() - ms) / 864e5);
        }
      }
    }

    const toBool = (v, def) => {
      if (v === true || v === '1' || v === 1) return true;
      if (v === false || v === '0' || v === 0) return false;
      return def;
    };

    const kycOrAuth = pickFirstNum(item.authStatus, item.kycLevel, item.kycStatus, item.identityAuth);
    const identity =
      Number.isFinite(kycOrAuth) && kycOrAuth > 0 ? true : completion >= 97;

    const rawUid =
      item.userId ??
      item.userID ??
      item.uid ??
      item.merchantUserId ??
      item.memberId ??
      item.merchantId ??
      (item.userInfo && (item.userInfo.userId ?? item.userInfo.uid));

    return {
      username: o.name,
      isOnline: isOnline !== null ? isOnline : h % 6 !== 0,
      verifications: {
        email: toBool(item.emailAuth ?? item.emailVerified, true),
        sms: toBool(item.mobileAuth ?? item.mobileVerified ?? item.smsAuth, true),
        identity,
        deposit: toBool(item.fiatAccountExist ?? item.haveDeposit ?? item.depositAuth, true)
      },
      orders30d: Number.isFinite(orders30d) && orders30d > 0
        ? Math.round(orders30d)
        : (ordersFromStats > 0 ? Math.min(ordersFromStats, 9999) : 50 + (h % 200)),
      ratingPercent: completion > 0 ? Math.min(100, completion) : 90 + (h % 10),
      likes: Number.isFinite(good) ? Math.round(good) : 30 + (h % 120),
      dislikes: Number.isFinite(bad) ? Math.round(bad) : h % 4,
      avgTransferMin: Number.isFinite(avgTransfer) && avgTransfer > 0
        ? Math.round(avgTransfer)
        : 8 + (h % 20),
      avgPaymentMin: Number.isFinite(avgPayment) && avgPayment > 0
        ? Math.round(avgPayment)
        : 1 + (h % 6),
      ordersTotalAll:
        Number.isFinite(ordersTotalAll) && ordersTotalAll > 0 ? Math.round(ordersTotalAll) : undefined,
      ordersBuy: Number.isFinite(ordersBuy) ? Math.round(ordersBuy) : undefined,
      ordersSell: Number.isFinite(ordersSell) ? Math.round(ordersSell) : undefined,
      accountDays:
        Number.isFinite(accountDays) && accountDays >= 0 ? Math.round(accountDays) : undefined,
      firstTradeDays:
        Number.isFinite(firstTradeDays) && firstTradeDays >= 0 ? Math.round(firstTradeDays) : undefined,
      userId:
        rawUid != null && String(rawUid).trim() !== '' ? String(rawUid).trim() : undefined
    };
  }

  function sortOffersByPriceAsc(offers) {
    return [...offers].sort((a, b) => parseNum(a.price) - parseNum(b.price));
  }

  function avatarColor() {
    return '#000';
  }

  function normalizeOffer(item) {
    const name = item.nickName || item.nickname || item.userName || item.merchantNickName || item.merchantName || 'Trader';
    const orders = item.recentOrderNum || item.orderNum || item.completedOrderNum || item.tradeCount || 0;
    const completion = item.recentExecuteRate || item.completionRate || item.finishRate || item.orderCompletionRate || 99;
    const price = item.price || item.unitPrice || 0;
    const available = item.lastQuantity || item.remainAmount || item.availableAmount || item.surplusAmount || item.quantity || 0;
    const min = item.minAmount || item.minSingleTransAmount || item.minLimit || 0;
    const max = item.maxAmount || item.maxSingleTransAmount || item.maxLimit || 0;
    const paymentPeriod = item.paymentPeriod || item.paymentWindow || 15;
    const paymentRaw = item.payments || item.paymentMethodList || item.paymentList || [];
    const payments = Array.isArray(paymentRaw)
      ? paymentRaw.map(p => p?.paymentMethodName || p?.name || p?.identifier || p).filter(Boolean).slice(0, 3)
      : [];

    const base = {
      name: String(name),
      orders: String(orders),
      completion: String(completion).replace('%', ''),
      price: String(price),
      available: String(available),
      min: String(min),
      max: String(max),
      period: `${parseInt(paymentPeriod, 10) || 15}m`,
      payments: payments.length ? payments : ['Bank Transfer']
    };
    base.profile = buildProfileFromApiItem(item, base);
    return base;
  }

  function buildRowHtml(o, featured, featuredLabel) {
    const verify = parseNum(o.completion) >= 99 ? '<img src="img/verify-logo.png" width="15" height="15" style="vertical-align:middle;flex-shrink:0;" alt="">' : '';
    const advertiser = parseNum(o.orders) >= 100 ? '<img src="img/advertiser-logo.png" width="15" height="15" style="vertical-align:middle;flex-shrink:0;" alt="">' : '';
    const actionCls = currentSide === 'buy' ? 'p2p-table__buy-btn' : 'p2p-table__sell-btn';
    const actionText = currentSide === 'buy' ? `Buy ${currentCoin}` : `Sell ${currentCoin}`;
    const paymentTags = o.payments.map(m => `<span class="p2p-table__payment-method">${esc(m)}</span>`).join('');
    const pickLabel =
      featuredLabel && String(featuredLabel).trim()
        ? String(featuredLabel).trim()
        : 'Top Picks for New Users';
    const featuredLabelHtml = featured
      ? `<span class="p2p-table__featured-label">${esc(pickLabel)} <img src="img/question-logo.svg" width="14" height="14" alt="" style="vertical-align:middle;flex-shrink:0;"></span>`
      : '';
    const profile = o.profile || syntheticProfileFromOffer(o);
    const profileAttr = encodeURIComponent(JSON.stringify(profile));
    return `
      <div class="p2p-table__row${featured ? ' p2p-table__row--featured' : ''}" data-p2p-profile="${profileAttr}" role="presentation">
        ${featuredLabelHtml}
        <div class="p2p-table__cell p2p-table__cell--user">
          <div class="p2p-table__avatar" style="background:${avatarColor()}">${esc(o.name[0] || 'T')}</div>
          <div class="p2p-table__user-info">
            <span class="p2p-table__username">${esc(o.name)} ${verify} ${advertiser}</span>
            <span class="p2p-table__stats">${esc(o.orders)} Order(s) &nbsp;|&nbsp; ${esc(o.completion)}%</span>
            <span class="p2p-table__time">
              <span class="p2p-table__time-icon" data-time="${esc(o.period)}">
                <img src="img/timer-logo.svg" width="14" height="14" alt="">
                <span class="p2p-table__time-tooltip">The advertiser requires you to complete the payment within ${esc(o.period.replace('m', ''))} minutes after placing the order. After completing the payment, please click "I have completed the payment" to mark the order as paid. If you do not complete the process on time, the order will be automatically canceled.</span>
              </span>
              ${esc(o.period)}
            </span>
          </div>
        </div>
        <div class="p2p-table__cell p2p-table__cell--price">
          <span class="p2p-table__price">${esc(o.price)}</span>
          <span class="p2p-table__currency">RUB</span>
        </div>
        <div class="p2p-table__cell p2p-table__cell--limits">
          <span class="p2p-table__available">${esc(o.available)} ${esc(currentCoin)}</span>
          <span class="p2p-table__limits">${esc(o.min)} ~ ${esc(o.max)} RUB</span>
        </div>
        <div class="p2p-table__cell p2p-table__cell--payment">${paymentTags}</div>
        <div class="p2p-table__cell p2p-table__cell--action">
          <button type="button" class="${actionCls}" data-coin="${esc(currentCoin)}" data-user="${esc(o.name)}">${actionText}</button>
        </div>
      </div>
    `;
  }

  function fallbackOffers(count = 60, seed = Date.now()) {
    const names = ['Crypto-Angel', 'Brek_exchange', 'LipriCoin', 'KriptoPotter', 'Bvolegrad', '#MONEY_MUNCH', 'TIMEiSGOLD', 'ama', 'TradeMaster', 'RUB_Wizard'];
    const out = [];
    const basePrice = 78 + ((seed % 17) / 100);
    for (let i = 0; i < count; i++) {
      const n = names[i % names.length];
      const name = `${n}_${String(i + 1).padStart(2, '0')}`;
      const fo = {
        name,
        orders: `${(1000 + i * 49).toLocaleString('en-US')}`,
        completion: `${97 + (i % 4)}`,
        price: (basePrice + i * 0.06).toFixed(2).replace('.', ','),
        available: (25 + i * 12.37).toFixed(4).replace('.', ','),
        min: `${(500 + i * 23).toLocaleString('ru-RU')},00`,
        max: `${(5000 + i * 410).toLocaleString('ru-RU')},00`,
        period: `${[15, 30, 45, 60][i % 4]}m`,
        payments: [['Bank Transfer'], ['Mobile Top-up'], ['Cash in Person'], ['Cash Deposit to Bank']][i % 4]
      };
      fo.profile = syntheticProfileFromOffer(fo);
      out.push(fo);
    }
    return out;
  }

  function ensurePoolSizeAndUniq(offers, target = 60) {
    const result = [];
    const used = new Set();
    offers.forEach(o => {
      const key = String(o.name || '').toLowerCase();
      if (!key || used.has(key)) return;
      used.add(key);
      result.push(o);
    });

    if (result.length < target) {
      const extras = fallbackOffers(target * 2, Date.now()).filter(o => !used.has(String(o.name).toLowerCase()));
      for (const e of extras) {
        result.push(e);
        used.add(String(e.name).toLowerCase());
        if (result.length >= target) break;
      }
    }
    return result.slice(0, target);
  }

  async function fetchBybitOffersPool() {
    const payload = {
      tokenId: currentCoin,
      currencyId: 'RUB',
      side: currentSide === 'buy' ? '1' : '0',
      page: '1',
      size: '60',
      amount: '',
      payment: [],
      authMaker: false,
      canTrade: false
    };
    for (const url of bybitEndpoints) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) continue;
        const json = await res.json();
        const items = json?.result?.items || json?.result?.list || json?.data?.items || json?.data?.list || [];
        if (Array.isArray(items) && items.length) return items.map(normalizeOffer);
      } catch (_) {}
    }
    return null;
  }

  async function getSortedMarketOffers() {
    const key = `${currentCoin}-${currentSide}`;
    const now = Date.now();
    const cached = marketCache.get(key);
    if (cached && now - cached.ts < 45000) return cached.items;

    const live = await fetchBybitOffersPool();
    const base = live && live.length ? live : [];
    const normalized = ensurePoolSizeAndUniq(base, 60);
    const items = sortOffersByPriceAsc(normalized);
    marketCache.set(key, { ts: now, items });
    return items;
  }

  function parseFiatLimit(v) {
    const s = String(v ?? '').replace(/\s/g, '').replace(',', '.');
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }

  /** Сумма в поле фильтра: показываем объявления, где лимиты RUB «вмещают» эту сумму (min ≤ сумма ≤ max). */
  function filterMarketOffers(pool) {
    let list = pool;
    const amtEl = document.getElementById('amountInput');
    const raw = amtEl?.value?.trim() ?? '';
    const amount = raw ? parseFiatLimit(raw) : 0;
    if (amount > 0) {
      list = list.filter(o => {
        const min = parseFiatLimit(o.min);
        let max = parseFiatLimit(o.max);
        if (max <= 0) max = Number.POSITIVE_INFINITY;
        return amount >= min && amount <= max;
      });
    }
    if (selectedPayments.length > 0) {
      const norm = s => String(s).trim().toLowerCase();
      const selected = selectedPayments.map(norm);
      list = list.filter(o =>
        o.payments.some(p => selected.includes(norm(p)))
      );
    }
    return list;
  }

  let _featuredOfferConfigCache;

  async function loadFeaturedOfferConfig() {
    if (_featuredOfferConfigCache !== undefined) return _featuredOfferConfigCache;
    try {
      const bust = `t=${Date.now()}`;
      const r = await fetch(`p2p-featured-offer.json?${bust}`, { cache: 'no-store' });
      if (!r.ok) {
        _featuredOfferConfigCache = null;
        return null;
      }
      _featuredOfferConfigCache = await r.json();
      return _featuredOfferConfigCache;
    } catch (_) {
      _featuredOfferConfigCache = null;
      return null;
    }
  }

  function normalizeFeaturedOffer(offer) {
    if (!offer || typeof offer !== 'object') return null;
    const name = String(offer.name || '').trim();
    const price = String(offer.price != null ? offer.price : '').trim();
    if (!name || !price) return null;
    let payments = offer.payments;
    if (!Array.isArray(payments)) payments = payments ? [String(payments)] : ['Bank Transfer'];
    payments = payments.map(p => String(p).trim()).filter(Boolean);
    if (!payments.length) payments = ['Bank Transfer'];
    const periodRaw = offer.period != null ? String(offer.period) : '15m';
    const period = /\d/.test(periodRaw) && !/m$/i.test(periodRaw) ? `${parseInt(periodRaw, 10) || 15}m` : periodRaw || '15m';
    const base = {
      name,
      orders: String(offer.orders != null ? offer.orders : '0'),
      completion: String(offer.completion != null ? String(offer.completion).replace(/%/g, '') : '99'),
      price,
      available: String(offer.available != null ? offer.available : '0'),
      min: String(offer.min != null ? offer.min : '0'),
      max: String(offer.max != null ? offer.max : '0'),
      period,
      payments
    };
    if (offer.profile && typeof offer.profile === 'object') {
      base.profile = Object.assign(syntheticProfileFromOffer(base), offer.profile);
    } else {
      base.profile = syntheticProfileFromOffer(base);
    }
    return base;
  }

  function dedupeOffersByName(list, nameToSkip) {
    if (!nameToSkip) return list;
    const n = String(nameToSkip).trim().toLowerCase();
    return list.filter(o => String(o.name || '').trim().toLowerCase() !== n);
  }

  function marketPagesCountWithFeatured(restLen, perPage, useFeaturedOnFirstPage) {
    if (!useFeaturedOnFirstPage) return Math.max(1, Math.ceil(restLen / perPage));
    if (restLen <= 0) return 1;
    const firstRest = perPage - 1;
    if (restLen <= firstRest) return 1;
    return 1 + Math.ceil((restLen - firstRest) / perPage);
  }

  async function renderMarketPage(page) {
    if (!tableBodyEl) return;
    const [cfg, pool] = await Promise.all([loadFeaturedOfferConfig(), getSortedMarketOffers()]);
    const filtered = filterMarketOffers(pool);
    const featuredEnabled = !!(cfg && cfg.enabled !== false);
    const featuredOffer = featuredEnabled ? normalizeFeaturedOffer(cfg.offer) : null;
    const featuredLabel = cfg && cfg.featuredLabel;
    const usePinnedFeatured = !!featuredOffer;
    const rest = usePinnedFeatured ? dedupeOffersByName(filtered, featuredOffer.name) : filtered;
    const perPage = P2P_OFFERS_PER_PAGE;

    let rowsHtml = '';
    if (usePinnedFeatured) {
      const rawPages = marketPagesCountWithFeatured(rest.length, perPage, true);
      totalMarketPages = Math.min(MAX_MARKET_PAGES, rawPages);
      activeMarketPage = Math.max(1, Math.min(page, totalMarketPages));

      if (filtered.length === 0) {
        rowsHtml = buildRowHtml(featuredOffer, true, featuredLabel);
      } else if (activeMarketPage === 1) {
        const firstChunk = rest.slice(0, perPage - 1);
        rowsHtml =
          buildRowHtml(featuredOffer, true, featuredLabel) +
          firstChunk.map(o => buildRowHtml(o, false)).join('');
      } else {
        const start = perPage - 1 + (activeMarketPage - 2) * perPage;
        const slice = rest.slice(start, start + perPage);
        rowsHtml = slice.map(o => buildRowHtml(o, false)).join('');
      }
    } else {
      const rawPages = Math.max(1, Math.ceil(filtered.length / perPage));
      totalMarketPages = Math.min(MAX_MARKET_PAGES, rawPages);
      activeMarketPage = Math.max(1, Math.min(page, totalMarketPages));
      const start = (activeMarketPage - 1) * perPage;
      const offers = filtered.slice(start, start + perPage);
      if (filtered.length === 0) {
        rowsHtml = '<div class="p2p-table__empty" role="status">Ничего не найдено</div>';
      } else {
        rowsHtml = offers.map(o => buildRowHtml(o, false)).join('');
      }
    }

    tableBodyEl.innerHTML = rowsHtml;
    updateTableButtons();
    refreshPaginationUi();
    const scrollSmooth = !document.documentElement.classList.contains('p2p-boot-profile');
    window.scrollTo({ top: 0, left: 0, behavior: scrollSmooth ? 'smooth' : 'auto' });
  }

  if (tableBodyEl) {
    tableBodyEl.addEventListener('mouseenter', (e) => {
      const icon = e.target.closest('.p2p-table__time-icon');
      if (!icon) return;
      const tooltip = icon.querySelector('.p2p-table__time-tooltip');
      if (!tooltip) return;
      const rect = icon.getBoundingClientRect();
      const tw = 280;
      const th = tooltip.offsetHeight || 120;
      let left = rect.left + rect.width / 2 - tw / 2;
      let top = rect.top - th - 10;
      if (top < 8) top = rect.bottom + 10;
      if (left + tw > window.innerWidth - 8) left = window.innerWidth - tw - 8;
      if (left < 8) left = 8;
      const arrowLeft = (rect.left + rect.width / 2) - left;
      tooltip.style.setProperty('--arrow-left', arrowLeft + 'px');
      tooltip.style.left = left + 'px';
      tooltip.style.top = top + 'px';
    }, true);
  }

  const amountInput = document.getElementById('amountInput');
  if (amountInput) {
    amountInput.addEventListener('input', () => {
      amountInput.value = amountInput.value.replace(/[^0-9.,]/g, '');
      activeMarketPage = 1;
      renderMarketPage(1);
    });
    amountInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        activeMarketPage = 1;
        renderMarketPage(1);
      }
    });
  }

  const currencies = [
    { code: 'RUB', symbol: '₽', color: '#84BD7B', img: 'img/rub-logo.svg' },
  ];

  function buildDropdown(items, activeVal, onSelect) {
    const menu = document.createElement('div');
    menu.className = 'p2p-select-menu';
    items.forEach(item => {
      const opt = document.createElement('div');
      opt.className = 'p2p-select-menu__item' + (item === activeVal ? ' active' : '');
      opt.textContent = item;
      opt.addEventListener('click', e => {
        e.stopPropagation();
        onSelect(item);
        menu.remove();
      });
      menu.appendChild(opt);
    });
    return menu;
  }

  function openDropdown(anchor, menu, opts) {
    opts = opts || {};
    document.body.appendChild(menu);
    const rect = anchor.getBoundingClientRect();
    const vw = window.innerWidth;
    const m = 8;
    menu.style.position = 'fixed';
    menu.style.left = rect.left + 'px';
    const floorW = opts.minWidth != null ? opts.minWidth : 0;
    menu.style.minWidth = Math.max(rect.width, floorW) + 'px';
    menu.style.maxWidth = `${vw - m * 2}px`;
    menu.style.boxSizing = 'border-box';
    menu.style.zIndex = '9999';

    const menuH = menu.offsetHeight || 520;
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    if (spaceBelow >= menuH || spaceBelow >= 300) {
      menu.style.top = (rect.bottom + 4) + 'px';
      menu.style.maxHeight = Math.max(spaceBelow - 8, 200) + 'px';
    } else {
      const spaceAbove = rect.top - 8;
      menu.style.top = Math.max(8, rect.top - Math.min(menuH, spaceAbove) - 4) + 'px';
      menu.style.maxHeight = Math.max(spaceAbove - 8, 200) + 'px';
    }

    requestAnimationFrame(() => {
      const mr = menu.getBoundingClientRect();
      let left = mr.left;
      if (mr.right > vw - m) left = vw - m - mr.width;
      if (left < m) left = m;
      menu.style.left = `${left}px`;
    });
  }

  function closeFilterPanel() {
    document.querySelector('.p2p-filter-overlay')?.remove();
    document.querySelector('.p2p-filter-menu')?.remove();
    document.getElementById('filterBtn')?.classList.remove('active');
  }

  function isP2pCompactModals() {
    return window.matchMedia('(max-width: 420px)').matches;
  }

  function closeDropdownMenusOnly() {
    document.querySelectorAll('.p2p-select-menu').forEach(m => m.remove());
    document.querySelectorAll('.p2p-filters__select, .p2p-filters__currency').forEach(s => s.classList.remove('active'));
  }

  function closeTradeModal() {
    document.querySelectorAll('.p2p-trade-modal__loader--fullscreen').forEach((el) => el.remove());
    document.documentElement.classList.remove('p2p-trade-modal-loader-lock');
    document.body.classList.remove('p2p-trade-modal-loader-lock');
    document.querySelector('.p2p-trade-modal-overlay')?.remove();
    document.body.style.overflow = '';
  }

  let sellerViewProfileSnapshot = null;
  let onSellerMoreDataEsc = () => {};

  function fmtMoreDataInt(n) {
    if (n == null || !Number.isFinite(Number(n))) return '—';
    return Number(n).toLocaleString('ru-RU');
  }

  function closeSellerMoreDataModal() {
    const el = document.getElementById('sellerMoreDataModal');
    if (el) {
      el.hidden = true;
      el.setAttribute('aria-hidden', 'true');
    }
    document.body.style.overflow = '';
    document.removeEventListener('keydown', onSellerMoreDataEsc);
  }

  function openSellerMoreDataModal() {
    const snap = sellerViewProfileSnapshot;
    if (!snap) return;
    const { profile, completionStr, totalOrders } = snap;
    const modal = document.getElementById('sellerMoreDataModal');
    const listEl = document.getElementById('sellerMoreDataList');
    if (!modal || !listEl) return;

    const o30 = profile.orders30d != null ? fmtMoreDataInt(profile.orders30d) : '—';
    const o30Suffix =
      profile.orders30d != null
        ? '<span class="p2p-more-data__suffix"> Ордера</span>'
        : '';

    const tot = profile.ordersTotalAll != null ? Number(profile.ordersTotalAll) : totalOrders;
    const totStr = fmtMoreDataInt(tot);
    const totSuffix = totStr !== '—' ? '<span class="p2p-more-data__suffix"> Ордера</span>' : '';

    let buyN = profile.ordersBuy != null ? Number(profile.ordersBuy) : null;
    let sellN = profile.ordersSell != null ? Number(profile.ordersSell) : null;
    if (buyN == null && sellN == null) {
      buyN = 0;
      sellN = Number.isFinite(tot) ? tot : 0;
    } else {
      if (buyN == null) buyN = Math.max(0, (Number.isFinite(tot) ? tot : 0) - (sellN || 0));
      if (sellN == null) sellN = Math.max(0, (Number.isFinite(tot) ? tot : 0) - (buyN || 0));
    }
    const splitSub = `<span class="p2p-more-data__sub-part">Покупка ${fmtMoreDataInt(
      buyN
    )}</span><span class="p2p-more-data__sub-part">Продажа ${fmtMoreDataInt(sellN)}</span>`;

    const comp30 = completionStr != null && String(completionStr).trim() !== ''
      ? esc(String(completionStr).trim())
      : '—';
    const comp30Html =
      comp30 !== '—'
        ? `${comp30}<span class="p2p-more-data__suffix"> %</span>`
        : '—';

    const rp = profile.ratingPercent != null ? String(profile.ratingPercent).trim() : '';
    const ratingMain =
      rp !== ''
        ? `${esc(rp)}<span class="p2p-more-data__suffix"> %</span>`
        : '—';
    const likes = esc(String(profile.likes ?? '0'));
    const dislikes = esc(String(profile.dislikes ?? '0'));

    const tr = profile.avgTransferMin != null ? esc(String(profile.avgTransferMin)) : '—';
    const trHtml =
      tr !== '—'
        ? `${tr}<span class="p2p-more-data__suffix"> мин.</span>`
        : '—';

    const pay = profile.avgPaymentMin != null ? esc(String(profile.avgPaymentMin)) : '—';
    const payHtml =
      pay !== '—'
        ? `${pay}<span class="p2p-more-data__suffix"> мин.</span>`
        : '—';

    const acc =
      profile.accountDays != null ? fmtMoreDataInt(profile.accountDays) : '—';
    const accHtml =
      acc !== '—'
        ? `${acc}<span class="p2p-more-data__suffix"> дн.</span>`
        : '—';

    const ft =
      profile.firstTradeDays != null ? fmtMoreDataInt(profile.firstTradeDays) : '—';
    const ftHtml =
      ft !== '—'
        ? `${ft}<span class="p2p-more-data__suffix"> дн.</span>`
        : '—';

    const row = (label, valueHtml, subHtml) => {
      const sub = subHtml
        ? `<div class="p2p-more-data__sub">${subHtml}</div>`
        : '';
      return `<div class="p2p-more-data__row">
        <span class="p2p-more-data__label">${esc(label)}</span>
        <span class="p2p-more-data__value">${valueHtml}</span>
        ${sub}
      </div>`;
    };

    const ratingExtras =
      ratingMain !== '—'
        ? `<div class="p2p-more-data__rating-extra">
            <img src="img/like-logo.svg" width="16" height="15" alt="" class="p2p-more-data__rating-ico" aria-hidden="true">
            <span class="p2p-more-data__rating-num">${likes}</span>
            <img src="img/dislike-logo.svg" width="17" height="16" alt="" class="p2p-more-data__rating-ico p2p-more-data__dislike-ico" aria-hidden="true">
            <span class="p2p-more-data__rating-num">${dislikes}</span>
          </div>`
        : '';

    listEl.innerHTML = [
      row('Исполненные ордера за 30 дней', `${o30}${o30Suffix}`),
      row('Все исполненные ордера', `${totStr}${totSuffix}`, splitSub),
      row('Процент исполнения за 30 дней (%)', comp30Html),
      row(
        'Высокий рейтинг %',
        ratingMain,
        ratingExtras || undefined
      ),
      row('Средн. время перевода', trHtml),
      row('Средн. время оплаты', payHtml),
      row('Дней с создания аккаунта', accHtml),
      row('Дней с первой сделки', ftHtml)
    ].join('');

    modal.hidden = false;
    modal.removeAttribute('aria-hidden');
    document.body.style.overflow = 'hidden';
    onSellerMoreDataEsc = (ev) => {
      if (ev.key === 'Escape') closeSellerMoreDataModal();
    };
    document.addEventListener('keydown', onSellerMoreDataEsc);
  }

  let activeProfileRow = null;
  let onP2pProfileModalEsc = () => {};

  function closeP2pProfileModal() {
    const ex = document.querySelector('.p2p-profile-popover');
    try {
      ex?._p2pPopoverCleanup?.();
    } catch (_) {}
    ex?.remove();
    activeProfileRow = null;
    document.removeEventListener('keydown', onP2pProfileModalEsc);
  }

  function positionP2pProfilePopover(wrap, anchorRow) {
    const margin = 8;
    if (!anchorRow.isConnected || !wrap.isConnected) return;
    const userCell = anchorRow.querySelector('.p2p-table__cell--user') || anchorRow;
    const r = userCell.getBoundingClientRect();
    const w = wrap.offsetWidth;
    const h = wrap.offsetHeight;
    let left = r.left;
    let top = r.top;
    if (left + w > window.innerWidth - margin) {
      left = Math.max(margin, window.innerWidth - margin - w);
    }
    if (left < margin) left = margin;
    if (top + h > window.innerHeight - margin) {
      top = Math.max(margin, window.innerHeight - margin - h);
    }
    if (top < margin) top = margin;
    wrap.style.left = `${Math.round(left)}px`;
    wrap.style.top = `${Math.round(top)}px`;
  }

  function getScrollableAncestors(el) {
    const out = [];
    let node = el;
    while (node && node !== document) {
      if (node.nodeType === 1) {
        const st = window.getComputedStyle(node);
        const oy = st.overflowY;
        const ox = st.overflowX;
        if (
          oy === 'auto' || oy === 'scroll' || oy === 'overlay' ||
          ox === 'auto' || ox === 'scroll' || ox === 'overlay'
        ) {
          out.push(node);
        }
      }
      node = node.parentElement;
    }
    const se = document.scrollingElement;
    if (se && !out.includes(se)) out.push(se);
    return out;
  }

  function parseProfileFromP2pTableRow(row) {
    if (!row) return null;
    let profile = null;
    const raw = row.dataset?.p2pProfile;
    if (raw) {
      try {
        profile = JSON.parse(decodeURIComponent(raw));
      } catch (_) {
        profile = null;
      }
    }
    if (!profile) {
      const nameEl = row.querySelector('.p2p-table__username');
      const o = {
        name: extractUserName(nameEl),
        orders: '0',
        completion: '99',
        payments: []
      };
      profile = syntheticProfileFromOffer(o);
    }
    return profile;
  }

  function openP2pProfileModal(row) {
    if (!row) return;
    const profile = parseProfileFromP2pTableRow(row);
    if (!profile) return;

    closeP2pProfileModal();

    const avatarEl = row.querySelector('.p2p-table__avatar');
    const letter = esc((avatarEl?.textContent || profile.username || 'U').trim().charAt(0).toUpperCase() || 'U');
    const avatarBg = (avatarEl?.style?.background || '').trim() || '#000';
    const onlineText = profile.isOnline ? 'Онлайн' : 'Не в сети';
    const v = profile.verifications || {};
    const verRow = (key, label) =>
      v[key]
        ? `<li class="p2p-profile-modal__verif"><img src="img/success-icon.svg" width="16" height="16" alt=""> ${esc(label)}</li>`
        : '';

    const orders30 = profile.orders30d != null ? String(profile.orders30d) : '—';
    const rating = profile.ratingPercent != null ? String(profile.ratingPercent) : '—';
    const likes = profile.likes != null ? String(profile.likes) : '0';
    const dislikes = profile.dislikes != null ? String(profile.dislikes) : '0';
    const trMin = profile.avgTransferMin != null ? String(profile.avgTransferMin) : '—';
    const payMin = profile.avgPaymentMin != null ? String(profile.avgPaymentMin) : '—';

    const wrap = document.createElement('div');
    wrap.className = 'p2p-profile-popover';
    wrap.innerHTML = `
      <div class="p2p-profile-modal" role="dialog" aria-modal="false" aria-labelledby="p2pProfileModalTitle">
        <div class="p2p-profile-modal__head">
          <div class="p2p-profile-modal__avatar ${profile.isOnline ? 'p2p-profile-modal__avatar--online' : 'p2p-profile-modal__avatar--offline'}" style="background:${esc(avatarBg)}">${letter}</div>
          <div class="p2p-profile-modal__head-text">
            <div class="p2p-profile-modal__name-row">
              <span class="p2p-profile-modal__name" id="p2pProfileModalTitle">${esc(profile.username)}</span>
            </div>
            <div class="p2p-profile-modal__status">${esc(onlineText)}</div>
          </div>
        </div>
        <ul class="p2p-profile-modal__verifs">
          ${verRow('email', 'Эл. почта')}
          ${verRow('sms', 'SMS')}
          ${verRow('identity', 'Верификация личности')}
          ${verRow('deposit', 'Депозит')}
        </ul>
        <div class="p2p-profile-modal__overview">
          <div class="p2p-profile-modal__overview-title">Data Overview</div>
          <div class="p2p-profile-modal__stat">
            <span class="p2p-profile-modal__stat-label">Исполненные ордера за 30 дней</span>
            <span class="p2p-profile-modal__stat-val">${esc(orders30)} <span class="p2p-profile-modal__stat-unit">Ордера</span></span>
          </div>
          <div class="p2p-profile-modal__stat">
            <span class="p2p-profile-modal__stat-label">Высокий рейтинг %</span>
            <span class="p2p-profile-modal__stat-val">${esc(rating)} %</span>
          </div>
          <div class="p2p-profile-modal__rating-mini">
            <img class="p2p-profile-modal__thumb" src="img/like-logo.svg" width="19" height="18" alt="" aria-hidden="true">
            <span class="p2p-profile-modal__thumb-num">${esc(likes)}</span>
            <img class="p2p-profile-modal__thumb p2p-profile-modal__thumb--down" src="img/dislike-logo.svg" width="20" height="19" alt="" aria-hidden="true">
            <span class="p2p-profile-modal__thumb-num">${esc(dislikes)}</span>
          </div>
          <div class="p2p-profile-modal__stat">
            <span class="p2p-profile-modal__stat-label">Средн. время перевода</span>
            <span class="p2p-profile-modal__stat-val">${esc(trMin)} <span class="p2p-profile-modal__stat-unit">мин.</span></span>
          </div>
          <div class="p2p-profile-modal__stat">
            <span class="p2p-profile-modal__stat-label">Средн. время оплаты</span>
            <span class="p2p-profile-modal__stat-val">${esc(payMin)} <span class="p2p-profile-modal__stat-unit">мин.</span></span>
          </div>
        </div>
        <button type="button" class="p2p-profile-modal__cta">Смотреть профиль</button>
      </div>
    `;

    const close = () => {
      closeP2pProfileModal();
    };

    wrap.querySelector('.p2p-profile-modal__cta')?.addEventListener('click', () => {
      const p = profile;
      const r = row;
      close();
      openP2pSellerProfileView(p, r, { openTradeModal: false });
    });

    onP2pProfileModalEsc = (e) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onP2pProfileModalEsc);

    let repositionRaf = 0;
    const onReposition = () => {
      if (!wrap.parentNode) return;
      if (repositionRaf) cancelAnimationFrame(repositionRaf);
      repositionRaf = requestAnimationFrame(() => {
        repositionRaf = 0;
        positionP2pProfilePopover(wrap, row);
      });
    };
    const onDocMouseDown = (e) => {
      if (wrap.contains(e.target)) return;
      if (row.contains(e.target)) return;
      closeP2pProfileModal();
    };
    const scrollParents = getScrollableAncestors(row);
    scrollParents.forEach((el) => {
      el.addEventListener('scroll', onReposition, { passive: true });
    });
    const onWinScroll = () => onReposition();
    window.addEventListener('scroll', onWinScroll, { passive: true, capture: true });
    const onVv = () => onReposition();
    if (window.visualViewport) {
      window.visualViewport.addEventListener('scroll', onVv);
      window.visualViewport.addEventListener('resize', onVv);
    }
    wrap._p2pPopoverCleanup = () => {
      if (repositionRaf) cancelAnimationFrame(repositionRaf);
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onWinScroll, { capture: true });
      scrollParents.forEach((el) => {
        el.removeEventListener('scroll', onReposition);
      });
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('scroll', onVv);
        window.visualViewport.removeEventListener('resize', onVv);
      }
      document.removeEventListener('mousedown', onDocMouseDown, true);
    };

    document.body.appendChild(wrap);
    wrap.style.visibility = 'hidden';
    wrap.style.left = '0';
    wrap.style.top = '0';
    void wrap.offsetWidth;
    positionP2pProfilePopover(wrap, row);
    wrap.style.visibility = '';
    activeProfileRow = row;

    window.addEventListener('resize', onReposition);
    document.addEventListener('mousedown', onDocMouseDown, true);
    onReposition();
  }

  function goToP2pStartScreen() {
    if (!IS_INDEX_PAGE) {
      clearP2pOrderRoomCountdown();
      p2pOrderRoomSessionCache = null;
      clearP2pOrderRoomSession();
      clearP2pSellerViewPersist();
      setP2pMarketPreferred();
      window.location.href = 'index.html';
      return;
    }
    clearP2pOrderRoomCountdown();
    p2pOrderRoomSessionCache = null;
    clearP2pOrderRoomSession();
    closeTradeModal();
    closeP2pProfileModal();
    closeSellerMoreDataModal();
    closeFilterPanel();
    closeAllMenus();
    const market = document.getElementById('p2pMarketView');
    const room = document.getElementById('p2pOrderRoom');
    const seller = document.getElementById('p2pSellerProfile');
    if (!market || !room) return;
    if (seller) {
      seller.hidden = true;
      seller.setAttribute('aria-hidden', 'true');
    }
    document.querySelector('.p2p')?.classList.remove('p2p--seller-page');
    room.hidden = true;
    room.setAttribute('aria-hidden', 'true');
    market.hidden = false;
    market.setAttribute('aria-hidden', 'false');
    clearP2pSellerViewPersist();
    setP2pMarketPreferred();
    document.documentElement.classList.remove('p2p-boot-profile');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    void renderMarketPage(activeMarketPage);
  }

  function parseOrderCountFromStats(statsText) {
    const m = String(statsText).match(/([\d\s,\.]+)\s*Order/i);
    if (!m) return null;
    const n = parseInt(m[1].replace(/[^\d]/g, ''), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function parseCompletionPercentFromStats(statsText) {
    const m = String(statsText).match(/\|\s*([\d.]+)\s*%/);
    return m ? m[1] : null;
  }

  function buildSellerProfileOfferRowInner(sourceRow, coin) {
    const avatarEl = sourceRow.querySelector('.p2p-table__avatar');
    const usernameEl = sourceRow.querySelector('.p2p-table__username');
    const statsEl = sourceRow.querySelector('.p2p-table__stats');
    const timeIconEl = sourceRow.querySelector('.p2p-table__time-icon');
    const userName = extractUserName(usernameEl);

    const bridgeParts = [];
    if (avatarEl) bridgeParts.push(avatarEl.outerHTML);
    if (usernameEl) {
      bridgeParts.push(`<span class="p2p-table__username">${usernameEl.innerHTML}</span>`);
    }
    if (statsEl) {
      bridgeParts.push(`<span class="p2p-table__stats">${esc(statsEl.textContent.trim())}</span>`);
    }
    bridgeParts.push(
      timeIconEl
        ? timeIconEl.outerHTML
        : '<span class="p2p-table__time-icon" data-time="15m"></span>'
    );
    const modalBridge = `<div class="p2p-seller-profile__modal-bridge" aria-hidden="true">${bridgeParts.join('')}</div>`;

    const price = sourceRow.querySelector('.p2p-table__price')?.textContent?.trim() ?? '—';
    const cur = sourceRow.querySelector('.p2p-table__currency')?.textContent?.trim() ?? 'RUB';
    const available = sourceRow.querySelector('.p2p-table__available')?.textContent?.trim() ?? '—';
    const limits = sourceRow.querySelector('.p2p-table__limits')?.textContent?.trim() ?? '—';
    const payments = Array.from(sourceRow.querySelectorAll('.p2p-table__payment-method'))
      .map(p => p.textContent.trim())
      .filter(Boolean);
    const paymentTags = payments.map(m => `<span class="p2p-table__payment-method">${esc(m)}</span>`).join('');
    const actionCls = currentSide === 'buy' ? 'p2p-table__buy-btn' : 'p2p-table__sell-btn';
    const actionText = currentSide === 'buy' ? `Покупка ${coin}` : `Продажа ${coin}`;
    return `
      <div class="p2p-table__cell p2p-seller-profile__cell-coin">
        ${modalBridge}
        <div class="p2p-seller-profile__coin-display">
          <span class="p2p-seller-profile__coin-icon-wrap" aria-hidden="true">
            <img class="p2p-seller-profile__coin-icon" src="img/usdt-logo.svg" width="16" height="14" alt="">
          </span>
          <span class="p2p-seller-profile__coin-name">${esc(coin)}</span>
        </div>
      </div>
      <div class="p2p-table__cell p2p-table__cell--price p2p-seller-profile__cell-price">
        <span class="p2p-table__price">${esc(price)}</span>
        <span class="p2p-table__currency">${esc(cur)}</span>
      </div>
      <div class="p2p-table__cell p2p-table__cell--limits p2p-seller-profile__cell-limits">
        <div class="p2p-seller-profile__limit-line">
          <span class="p2p-seller-profile__limit-label">Доступно</span>
          <span class="p2p-table__available">${esc(available)}</span>
        </div>
        <div class="p2p-seller-profile__limit-line">
          <span class="p2p-seller-profile__limit-label">Лимиты</span>
          <span class="p2p-table__limits">${esc(limits)}</span>
        </div>
      </div>
      <div class="p2p-table__cell p2p-table__cell--payment">${paymentTags || `<span class="p2p-table__payment-method">—</span>`}</div>
      <div class="p2p-table__cell p2p-table__cell--action">
        <button type="button" class="${actionCls}" data-coin="${esc(coin)}" data-user="${esc(userName)}">${actionText}</button>
      </div>
    `;
  }

  function applySellerProfilePage(profile, sourceRow) {
    const name = profile.username || '—';
    const letter = (name.trim()[0] || '?').toUpperCase();
    const av = document.getElementById('sellerProfileAvatar');
    if (av) {
      av.textContent = letter;
      const sr = sourceRow.querySelector('.p2p-table__avatar');
      av.style.background = (sr?.style?.background || '').trim() || '#000';
      av.classList.toggle('p2p-seller-profile__avatar--online', !!profile.isOnline);
      av.classList.toggle('p2p-seller-profile__avatar--offline', !profile.isOnline);
    }
    const nameEl = document.getElementById('sellerProfileName');
    if (nameEl) nameEl.textContent = name;
    const onl = document.getElementById('sellerProfileOnline');
    if (onl) {
      onl.textContent = profile.isOnline ? 'Онлайн' : 'Не в сети';
      onl.classList.toggle('p2p-seller-profile__online--offline', !profile.isOnline);
    }
    const v = profile.verifications || {};
    const labels = { email: 'Эл. почта', sms: 'SMS', identity: 'Верификация личности', deposit: 'Депозит' };
    const verifsEl = document.getElementById('sellerProfileVerifs');
    if (verifsEl) {
      verifsEl.innerHTML = ['email', 'sms', 'identity', 'deposit'].map(key => {
        const ok = v[key];
        const isDeposit = key === 'deposit';
        const parts = ['p2p-seller-profile__verif-item'];
        if (isDeposit) {
          parts.push('p2p-seller-profile__verif-item--neutral');
          if (!ok) parts.push('p2p-seller-profile__verif-item--weak');
        } else if (ok) {
          parts.push('p2p-seller-profile__verif-item--accent');
        } else {
          parts.push('p2p-seller-profile__verif-item--neutral', 'p2p-seller-profile__verif-item--weak');
        }
        return `<span class="${parts.join(' ')}"><img class="p2p-seller-profile__verif-icon" src="img/success-icon.svg" width="14" height="14" alt="" aria-hidden="true"> ${esc(labels[key])}</span>`;
      }).join('');
    }
    const statsText = sourceRow.querySelector('.p2p-table__stats')?.textContent || '';
    const completionStr = parseCompletionPercentFromStats(statsText) || String(profile.ratingPercent ?? '100');
    const totalOrders =
      profile.ordersTotalAll != null
        ? Number(profile.ordersTotalAll)
        : parseOrderCountFromStats(statsText) ?? profile.orders30d ?? 0;
    const o30l = document.getElementById('sellerStatOrders30Line');
    if (o30l) {
      if (profile.orders30d != null) {
        const n = Number(profile.orders30d).toLocaleString('ru-RU');
        o30l.innerHTML = `${esc(n)}<span class="p2p-seller-profile__stat-value-suffix"> Ордера</span>`;
      } else {
        o30l.textContent = '—';
      }
    }
    const otl = document.getElementById('sellerStatOrdersTotalLine');
    if (otl) {
      const n = Number(totalOrders).toLocaleString('ru-RU');
      otl.innerHTML = `${esc(n)}<span class="p2p-seller-profile__stat-value-suffix"> Ордера</span>`;
    }
    const sp = document.getElementById('sellerStatOrdersSplit');
    if (sp) {
      let buyN = profile.ordersBuy != null ? Number(profile.ordersBuy) : null;
      let sellN = profile.ordersSell != null ? Number(profile.ordersSell) : null;
      if (buyN == null && sellN == null) {
        buyN = 0;
        sellN = Number(totalOrders);
      } else {
        if (buyN == null) buyN = Math.max(0, Number(totalOrders) - (sellN || 0));
        if (sellN == null) sellN = Math.max(0, Number(totalOrders) - (buyN || 0));
      }
      sp.innerHTML = `<span class="p2p-seller-profile__stat-sub-part">Покупка ${esc(
        Number(buyN).toLocaleString('ru-RU')
      )}</span><span class="p2p-seller-profile__stat-sub-part">Продажа ${esc(
        Number(sellN).toLocaleString('ru-RU')
      )}</span>`;
    }
    const sc = document.getElementById('sellerStatCompletion');
    if (sc) {
      sc.innerHTML = `${esc(String(completionStr))}<span class="p2p-seller-profile__stat-value-suffix"> %</span>`;
    }
    const sr = document.getElementById('sellerStatRating');
    if (sr) {
      const rp = profile.ratingPercent;
      if (rp != null && rp !== '' && String(rp).trim() !== '—') {
        sr.innerHTML = `${esc(String(rp))}<span class="p2p-seller-profile__stat-value-suffix"> %</span>`;
      } else {
        sr.textContent = '—';
      }
    }
    const sl = document.getElementById('sellerStatLikes');
    if (sl) sl.textContent = String(profile.likes ?? '0');
    const sd = document.getElementById('sellerStatDislikes');
    if (sd) sd.textContent = String(profile.dislikes ?? '0');
    const stl = document.getElementById('sellerStatTransferLine');
    if (stl) {
      if (profile.avgTransferMin != null) {
        stl.innerHTML = `${esc(String(profile.avgTransferMin))}<span class="p2p-seller-profile__stat-value-suffix"> мин.</span>`;
      } else {
        stl.textContent = '—';
      }
    }
    const rc = document.getElementById('sellerProfileReviewCount');
    if (rc) {
      const n = (parseInt(profile.likes, 10) || 0) + (parseInt(profile.dislikes, 10) || 0);
      rc.textContent = String(n > 0 ? n : totalOrders || 0);
    }
    const offerRow = document.getElementById('sellerProfileOfferRow');
    if (offerRow) {
      offerRow.innerHTML = buildSellerProfileOfferRowInner(sourceRow, currentCoin);
    }
    sellerViewProfileSnapshot = { profile, completionStr, totalOrders };
    sellerReviewsActiveFilter = 'good';
    setupSellerReviewsHeader(profile);
    const revList = document.getElementById('sellerReviewsList');
    if (revList) revList.innerHTML = '';
    document.querySelectorAll('.p2p-seller-reviews__filter').forEach(btn => {
      const active = btn.getAttribute('data-review-filter') === 'good';
      btn.classList.toggle('p2p-seller-reviews__filter--active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
  }

  function formatSellerReviewDate(raw) {
    if (raw == null || raw === '') return '—';
    const s = String(raw).trim();
    if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(s)) return s;
    const n = Number(s);
    if (Number.isFinite(n) && n > 1e11) {
      const d = new Date(n < 1e12 ? n * 1000 : n);
      if (Number.isFinite(d.getTime())) {
        const pad = (x) => String(x).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
      }
    }
    const d = new Date(s);
    if (Number.isFinite(d.getTime())) {
      const pad = (x) => String(x).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }
    return s;
  }

  function extractSellerReviewRows(json) {
    const r = json?.result;
    if (!r) return [];
    if (Array.isArray(r)) return r;
    if (Array.isArray(r.list)) return r.list;
    if (Array.isArray(r.items)) return r.items;
    if (Array.isArray(r.commentList)) return r.commentList;
    if (Array.isArray(r.records)) return r.records;
    if (Array.isArray(r.rows)) return r.rows;
    if (Array.isArray(r.data)) return r.data;
    if (Array.isArray(r?.data?.list)) return r.data.list;
    return [];
  }

  function normalizeSellerReviewRow(x, expectPositive) {
    const t =
      x.goodComment ??
      x.commentType ??
      x.evaluationType ??
      x.positive ??
      x.likeType ??
      x.type;
    let good = expectPositive;
    if (t !== undefined && t !== null && t !== '') {
      if (t === true || t === 1 || t === '1') good = true;
      else if (t === false || t === 0 || t === '0' || t === 2 || t === '2') good = false;
    }
    const rawTime = x.commentTime ?? x.createTime ?? x.gmtCreate ?? x.time ?? x.createdTime ?? x.createDate;
    let createDate = rawTime;
    if (typeof rawTime === 'number') {
      const ms = rawTime < 1e12 ? rawTime * 1000 : rawTime;
      createDate = new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
    }
    const userName = String(
      x.nickName ?? x.userName ?? x.name ?? x.commentUserName ?? x.fromNickName ?? 'Пользователь'
    ).trim();
    const comment = String(x.content ?? x.comment ?? x.commentMsg ?? x.reviewContent ?? x.msg ?? '').trim();
    return {
      userName: userName || 'Пользователь',
      createDate: formatSellerReviewDate(createDate),
      goodComment: good,
      comment: comment || '—'
    };
  }

  async function fetchSellerReviewsFromApi(profile, filter) {
    const uid = profile.userId;
    if (!uid) return null;
    const wantGood = filter === 'good';
    const payloads = [
      { userId: uid, page: '1', size: '20', commentType: wantGood ? '1' : '0' },
      { userId: uid, page: '1', size: '20', commentType: wantGood ? 1 : 0 },
      { userId: uid, page: '1', size: '20', type: wantGood ? 1 : 2 },
      { userId: uid, page: 1, size: 20, commentType: wantGood ? 1 : 0 }
    ];
    const urls = [
      'https://api2.bybit.com/fiat/otc/user/queryUserComment',
      'https://api2.bybit.com/fiat/otc/comment/queryUserCommentList',
      'https://api.bybit.com/fiat/otc/user/queryUserComment'
    ];
    for (const url of urls) {
      for (const body of payloads) {
        try {
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          });
          if (!res.ok) continue;
          const json = await res.json();
          const code = json.ret_code ?? json.retCode ?? json.code;
          if (code != null && code !== 0 && code !== '0' && code !== 200) continue;
          const rows = extractSellerReviewRows(json);
          if (!rows.length) continue;
          const mapped = rows.map((row) => normalizeSellerReviewRow(row, wantGood));
          if (mapped.length) return mapped;
        } catch (_) {}
      }
    }
    return null;
  }

  const SYNTHETIC_REVIEW_TEXT_GOOD = [
    'Четко и быстро',
    'Отлично! Рекомендую.',
    'Сделка прошла без проблем.',
    'Надёжный продавец',
    'Всё честно, без задержек.',
    'Быстрый ответ и перевод.',
    'Повторю сделку с удовольствием.',
    'Рекомендую, всё прозрачно.',
    'Грамотное общение, спасибо.',
    'Условия как в объявлении.',
    'Моментально отпустил монету.',
    'Без лишних вопросов — топ.',
    'Очень доволен, 10/10.',
    'Удобно и спокойно торговать.',
    'Чётко по таймингу оплаты.',
    'Профессиональный подход.',
    'Всё подтвердил в чате вовремя.',
    'Лучший опыт на P2P.',
    'Сделка за пару минут.',
    'Спасибо за терпение и скорость.',
    'Вернусь к этому продавцу.',
    'Никаких нареканий.',
    'Аккуратно и вежливо.',
    'Ровно по курсу и лимитам.',
    'Рекомендую новичкам.',
    'Всё понятно с первого сообщения.'
  ];

  const SYNTHETIC_REVIEW_TEXT_BAD = [
    'Долгое ожидание',
    'Не отвечал вовремя',
    'Можно лучше',
    'Есть замечания',
    'Пришлось долго ждать подтверждения.',
    'Общение могло быть быстрее.',
    'Не всё совпало с ожиданиями.',
    'Задержка с переводом.',
    'Мало обратной связи в чате.',
    'Хотелось бы чётче по срокам.',
    'Спорный момент с суммой.',
    'Пришлось уточнять детали несколько раз.',
    'Не критично, но не идеально.',
    'Ожидал большей оперативности.',
    'Есть куда расти по сервису.'
  ];

  function shuffleStringsSeeded(items, seed) {
    const a = items.slice();
    let s = seed >>> 0;
    for (let i = a.length - 1; i > 0; i -= 1) {
      s = (Math.imul(s, 1103515245) + 12345) >>> 0;
      const j = s % (i + 1);
      const t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  const SYNTHETIC_NICK_PREFIX = [
    'Trader',
    'Crypto',
    'P2P',
    'Fast',
    'Neo',
    'Alpha',
    'USDT',
    'BTC',
    'Moon',
    'Bear',
    'Swift',
    'Pro',
    'Spot',
    'DAO',
    'NFT',
    'Web3'
  ];
  const SYNTHETIC_NICK_SUFFIX = [
    'King',
    'Fox',
    'Wolf',
    'Star',
    'X',
    'Lab',
    'One',
    'Max',
    'Jet',
    'Ace',
    'Cap',
    'Bot',
    'Pro',
    'Dev',
    'Hub',
    'Pay'
  ];
  const SYNTHETIC_NICK_TAG = [
    'buyer',
    'seller',
    'p2p',
    'deal',
    'rush',
    'coin',
    'cash',
    'spot',
    'msk',
    'spb',
    'usdt',
    'fiat'
  ];
  const SYNTHETIC_NICK_LOCAL = [
    'Алексей_Мск',
    'Ирина_P2P',
    'Дмитрий_Crypto',
    'Елена_USDT',
    'Олег_Fast',
    'Светлана_Buy',
    'Никита_Deal',
    'Мария_Spot',
    'Андрей_Pro',
    'Катя_P2P'
  ];

  function buildSyntheticNickname(seedH, index) {
    const mix = (seedH + Math.imul(index, 0x9e3779b9)) >>> 0;
    const hex = (n, len) => {
      const L = Math.max(len, 1);
      return (n >>> 0).toString(16).padStart(L, '0').slice(-L);
    };
    const mode = mix % 9;
    const a = SYNTHETIC_NICK_PREFIX[mix % SYNTHETIC_NICK_PREFIX.length];
    const b = SYNTHETIC_NICK_SUFFIX[(mix >>> 3) % SYNTHETIC_NICK_SUFFIX.length];
    const tag = SYNTHETIC_NICK_TAG[(mix >>> 7) % SYNTHETIC_NICK_TAG.length];
    const loc = SYNTHETIC_NICK_LOCAL[(mix >>> 11) % SYNTHETIC_NICK_LOCAL.length];
    if (mode === 0) return `${a}_${b}_${hex(mix ^ 0x1a2b, 4)}`;
    if (mode === 1) return `${tag}_${hex(mix, 6)}`;
    if (mode === 2) return `${a.toLowerCase()}${100 + (mix % 900)}`;
    if (mode === 3) return `anon_${hex(mix ^ 0xface, 8)}`;
    if (mode === 4) return `ID${String(100000 + (mix % 900000))}_${b}`;
    if (mode === 5) return `${loc}_${hex(mix, 3)}`;
    if (mode === 6) return `p2p_${a}_${hex(mix >>> 8, 4)}`;
    if (mode === 7) return `${SYNTHETIC_NICK_PREFIX[(mix >>> 5) % SYNTHETIC_NICK_PREFIX.length]}x${SYNTHETIC_NICK_SUFFIX[(mix >>> 9) % SYNTHETIC_NICK_SUFFIX.length]}`;
    return `${a}_${hex(mix ^ seedH, 5)}_${tag}`;
  }

  function reviewInitials(userName) {
    const s = String(userName ?? '').trim();
    if (!s) return 'U';
    const parts = s.split(/[_\s.-]+/).filter(Boolean);
    const pickFirstLetter = (p) => {
      const m = p.match(/[a-zA-Zа-яА-ЯёЁ0-9]/);
      return m ? m[0] : '';
    };
    if (parts.length >= 2) {
      const x = pickFirstLetter(parts[0]);
      const y = pickFirstLetter(parts[1]);
      if (x && y) return (x + y).toUpperCase();
    }
    const letters = [];
    for (const ch of s) {
      if (/[a-zA-Zа-яА-ЯёЁ0-9]/.test(ch)) letters.push(ch);
      if (letters.length >= 2) break;
    }
    if (letters.length >= 2) return (letters[0] + letters[1]).toUpperCase();
    if (letters.length === 1) return letters[0].toUpperCase();
    return s.charAt(0).toUpperCase();
  }

  function syntheticSellerReviews(profile, filter) {
    const positive = filter === 'good';
    const h = simpleHash(`${profile.username || ''}:${filter}`);
    const pool = positive ? SYNTHETIC_REVIEW_TEXT_GOOD : SYNTHETIC_REVIEW_TEXT_BAD;
    const pl = pool.length;
    const likesN = parseInt(String(profile.likes ?? 0).replace(/[^\d]/g, ''), 10) || 0;
    const dislikesN = parseInt(String(profile.dislikes ?? 0).replace(/[^\d]/g, ''), 10) || 0;
    const fromProfile = positive
      ? (Number.isFinite(likesN) && likesN > 0 ? likesN : 0)
      : (Number.isFinite(dislikesN) && dislikesN > 0 ? dislikesN : 0);
    const SYN_MAX = 40;
    let n;
    if (fromProfile > 0) {
      n = Math.min(SYN_MAX, fromProfile);
    } else {
      n = positive ? Math.min(10, 3 + (h % 8)) : Math.min(6, 1 + (h % 5));
    }
    const shuffled = shuffleStringsSeeded(pool, h);
    const out = [];
    for (let i = 0; i < n; i += 1) {
      const mix = (h + Math.imul(i, 0x9e3779b1)) >>> 0;
      const name = buildSyntheticNickname(h, i);
      const d = new Date(Date.now() - ((mix % 50) + i * 3) * 86400000 - i * 7200000);
      const pad = (x) => String(x).padStart(2, '0');
      const ds = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
      let comment;
      if (i < pl) {
        comment = shuffled[i];
      } else {
        const round = Math.floor(i / pl);
        const sh2 = shuffleStringsSeeded(pool, (h + round * 7919) >>> 0);
        comment = sh2[i % pl];
      }
      out.push({
        userName: name,
        createDate: ds,
        goodComment: positive,
        comment
      });
    }
    return out;
  }

  function renderSellerReviewItem(r) {
    const initials = reviewInitials(r.userName);
    const thumb = r.goodComment
      ? '<span class="p2p-seller-reviews__thumb p2p-seller-reviews__thumb-icon p2p-seller-reviews__thumb-icon--like" aria-hidden="true"></span>'
      : '<span class="p2p-seller-reviews__thumb p2p-seller-reviews__thumb-icon p2p-seller-reviews__thumb-icon--dislike" aria-hidden="true"></span>';
    return `<div class="p2p-seller-reviews__item">
      <div class="p2p-seller-reviews__avatar" aria-hidden="true">${esc(initials)}</div>
      <div class="p2p-seller-reviews__main">
        <div class="p2p-seller-reviews__name">${esc(r.userName)}</div>
        <div class="p2p-seller-reviews__time">${esc(r.createDate)}</div>
        <div class="p2p-seller-reviews__msg">
          ${thumb}
          <span class="p2p-seller-reviews__text">${esc(r.comment)}</span>
        </div>
      </div>
    </div>`;
  }

  function setupSellerReviewsHeader(profile) {
    const high = document.getElementById('sellerReviewsHighPct');
    const g = document.getElementById('sellerReviewsGoodCount');
    const b = document.getElementById('sellerReviewsBadCount');
    const rp = profile.ratingPercent;
    if (high) high.textContent = rp != null && String(rp).trim() !== '' ? String(rp).trim() : '—';
    if (g) g.textContent = String(profile.likes ?? '0');
    if (b) b.textContent = String(profile.dislikes ?? '0');
  }

  async function loadSellerReviewsList(filter) {
    sellerReviewsActiveFilter = filter === 'bad' ? 'bad' : 'good';
    const listEl = document.getElementById('sellerReviewsList');
    if (!listEl) return;
    document.querySelectorAll('.p2p-seller-reviews__filter').forEach(btn => {
      const f = btn.getAttribute('data-review-filter');
      const active = f === sellerReviewsActiveFilter;
      btn.classList.toggle('p2p-seller-reviews__filter--active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    const snap = sellerViewProfileSnapshot;
    if (!snap?.profile) {
      listEl.innerHTML = '<p class="p2p-seller-reviews__empty">Нет данных профиля</p>';
      return;
    }
    listEl.innerHTML = '<div class="p2p-seller-reviews__loading">Загрузка…</div>';
    const profile = snap.profile;
    let items = await fetchSellerReviewsFromApi(profile, sellerReviewsActiveFilter);
    if (!items || !items.length) items = syntheticSellerReviews(profile, sellerReviewsActiveFilter);
    listEl.innerHTML = items.map(renderSellerReviewItem).join('');
  }

  function openP2pSellerProfileView(profile, sourceRow, opts) {
    if (IS_INDEX_PAGE) {
      markOpenTradeOnProfileBoot(opts?.openTradeModal !== false);
      saveP2pSellerViewUsername(profile?.username || '');
      clearP2pMarketPreferred();
      window.location.href = 'profile.html';
      return;
    }
    const openTradeModal = opts?.openTradeModal !== false;
    clearP2pMarketPreferred();
    applySellerProfilePage(profile, sourceRow);
    const market = document.getElementById('p2pMarketView');
    const seller = document.getElementById('p2pSellerProfile');
    if (!market || !seller) return;
    market.hidden = true;
    market.setAttribute('aria-hidden', 'true');
    seller.hidden = false;
    seller.removeAttribute('aria-hidden');
    document.querySelector('.p2p')?.classList.add('p2p--seller-page');
    saveP2pSellerViewUsername(profile.username);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (!openTradeModal) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const offerRow = document.getElementById('sellerProfileOfferRow');
        const btn = offerRow?.querySelector('.p2p-table__buy-btn, .p2p-table__sell-btn');
        if (offerRow && btn) openTradeModalFromRow(offerRow, btn);
      });
    });
  }

  function parseOrderAmount(raw) {
    if (raw == null || raw === '') return NaN;
    let s = String(raw).replace(/\s/g, '').replace(/[^\d,.-]/g, '');
    if (!s) return NaN;
    if (s.includes(',') && s.includes('.')) {
      s = s.replace(/,/g, '');
    } else if (s.includes(',')) {
      if (/,\d{1,2}$/.test(s)) s = s.replace(',', '.');
      else s = s.replace(/,/g, '');
    }
    return Number(s);
  }

  function genP2pOrderId() {
    let s = '';
    for (let i = 0; i < 19; i += 1) {
      s += Math.floor(Math.random() * 10);
    }
    return s;
  }

  const P2P_ORDER_ROOM_SESSION_KEY = 'bybit_p2p_order_room_v1';
  let p2pOrderRoomSessionCache = null;
  let p2pOrderRoomCountdownTimer = null;

  function clearP2pOrderRoomCountdown() {
    if (p2pOrderRoomCountdownTimer != null) {
      clearInterval(p2pOrderRoomCountdownTimer);
      p2pOrderRoomCountdownTimer = null;
    }
  }

  function parsePaymentWindowSeconds(raw) {
    const s = String(raw || '15m').trim().toLowerCase();
    let m = s.match(/(\d+)\s*h\b/);
    if (m) return parseInt(m[1], 10) * 3600;
    m = s.match(/(\d+)\s*m\b/);
    if (m) return parseInt(m[1], 10) * 60;
    m = s.match(/(\d+)\s*s\b/);
    if (m) return parseInt(m[1], 10);
    const n = parseInt(s, 10);
    return Number.isFinite(n) && n > 0 ? n * 60 : 15 * 60;
  }

  function formatP2pPaymentStepTitle(method) {
    const label = String(method || '').trim();
    const key = label.toLowerCase();
    const map = {
      'cash in person': 'Перевод через Наличные',
      'mobile top-up': 'Перевод через Наличные',
      'bank transfer': 'Перевод через Наличные'
    };
    if (map[key]) return map[key];
    if (!label || label === '—' || /выбрать/i.test(label)) return 'Перевод';
    if (/[а-яё]/i.test(label)) {
      return /^перевод/i.test(label) ? label : `Перевод через ${label}`;
    }
    return `Перевод через ${label}`;
  }

  function paymentDetailsFromMethod(method) {
    const m = String(method || '').toLowerCase();
    if (m.includes('cash') || m.includes('наличн')) return 'в чате';
    if (m.includes('bank') || m.includes('card') || m.includes('сбер')) return 'в чате';
    return 'в чате';
  }

  function formatP2pConfirmPayMethodDisplay(method) {
    const m = String(method || '').trim();
    const key = m.toLowerCase();
    const map = {
      'bank transfer': 'Bank Transfer',
      'mobile top-up': 'Mobile Top-up',
      'cash in person': 'Cash in person',
      'cash deposit to bank': 'Cash Deposit to Bank'
    };
    if (map[key]) return map[key];
    return m || 'Bank Transfer';
  }

  const P2P_LEGAL_NAME_POOL = [
    'ЭЛЬВИРА РИФОВНА ГАФАРОВА',
    'ИВАНОВ ИВАН ИВАНОВИЧ',
    'СМИРНОВА ДАРЬЯ ПАВЛОВНА',
    'КУЗНЕЦОВ АЛЕКСЕЙ ВИКТОРОВИЧ',
    'ПОПОВА ЕЛЕНА ИГОРЕВНА',
    'КОЛЕСНИК РОМАН СЕРГЕЕВИЧ',
    'ФАДЕЕВА МАРИНА ОЛЕГОВНА',
    'ОРЛОВ ДМИТРИЙ НИКОЛАЕВИЧ',
    'ВОЛКОВА СВЕТЛАНА АНДРЕЕВНА',
    'КОВАЛЁНОК АНДРЕЙ АНАТОЛЬЕВИЧ',
    'НИКОЛАЕВ СЕРГЕЙ ПЕТРОВИЧ',
    'МОРОЗОВА ЕКАТЕРИНА ЮРЬЕВНА',
    'СОКОЛОВ ВИКТОР МИХАЙЛОВИЧ',
    'НОВИКОВА ОЛЬГА ВЛАДИМИРОВНА',
    'КУЗЬМИН АЛЕКСАНДР ДМИТРИЕВИЧ'
  ];

  /** Как в колонке «Способ оплаты» у объявления — в модалке то же название в поле «Название банка». */
  function formatP2pPayBankFromPaymentMethod(paymentMethod) {
    const m = String(paymentMethod || '').trim();
    if (!m) return '—';
    return m;
  }

  function hashStringToSeed(str) {
    let h = 5381;
    const s = String(str || '');
    for (let i = 0; i < s.length; i += 1) {
      h = ((h << 5) + h) ^ s.charCodeAt(i);
    }
    return h >>> 0;
  }

  function lcgDigits(seed, len) {
    let x = seed >>> 0;
    let s = '';
    for (let i = 0; i < len; i += 1) {
      x = (x * 1103515245 + 12345) >>> 0;
      s += String(x % 10);
    }
    return s;
  }

  /** Стабильные реквизиты для демо: ФИО/карта/телефон — от ника+способа; «банк» — тот же текст, что способ оплаты в таблице. */
  function deriveP2pPaymentRequisites(userName, paymentMethod) {
    const seed = hashStringToSeed(`${String(userName || '')}|${String(paymentMethod || '')}`);
    const legalName = P2P_LEGAL_NAME_POOL[seed % P2P_LEGAL_NAME_POOL.length];
    const bank = formatP2pPayBankFromPaymentMethod(paymentMethod);
    const card = lcgDigits(seed ^ 0x9e3779b9, 16);
    const phone = `7${lcgDigits(seed ^ 0xdeadbeef, 10)}`;
    return { legalName, bank, card, phone };
  }

  function normalizeP2pOrderDetail(detail) {
    const base = detail && typeof detail === 'object' ? { ...detail } : {};
    const userName = String(base.userName || '').trim();
    const pm = String(base.paymentMethod || '').trim();
    if (!base.sellerLegalName || !base.payBank || !base.payCard || !base.payPhone) {
      const r = deriveP2pPaymentRequisites(userName, pm);
      if (!base.sellerLegalName) base.sellerLegalName = r.legalName;
      if (!base.payBank) base.payBank = r.bank;
      if (!base.payCard) base.payCard = r.card;
      if (!base.payPhone) base.payPhone = r.phone;
    }
    if (pm) {
      base.payBank = formatP2pPayBankFromPaymentMethod(pm);
    }
    return base;
  }

  function formatOrderCountdownHms(totalSeconds) {
    const sec = Math.max(0, Math.floor(totalSeconds));
    const h = Math.floor(sec / 3600);
    const mi = Math.floor((sec % 3600) / 60);
    const r = sec % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(h)}:${pad(mi)}:${pad(r)}`;
  }

  function snapshotP2pOrderDetail(d) {
    return {
      userName: d.userName,
      sellerLegalName: d.sellerLegalName || '',
      payBank: d.payBank || '',
      payCard: d.payCard || '',
      payPhone: d.payPhone || '',
      payFiat: d.payFiat,
      fiat: d.fiat,
      coin: d.coin,
      payRaw: d.payRaw,
      receiveRaw: d.receiveRaw,
      priceText: d.priceText,
      sideIsSell: !!d.sideIsSell,
      avatarText: d.avatarText,
      avatarBg: d.avatarBg || '',
      paymentMethod: d.paymentMethod || '',
      paymentWindow: d.paymentWindow || '15m'
    };
  }

  function saveP2pOrderRoomSession(payload) {
    try {
      sessionStorage.setItem(P2P_ORDER_ROOM_SESSION_KEY, JSON.stringify({ v: 1, ...payload }));
      return true;
    } catch (_) {
      return false;
    }
  }

  function loadP2pOrderRoomSession() {
    try {
      const raw = sessionStorage.getItem(P2P_ORDER_ROOM_SESSION_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (data.v !== 1 || !data.detail || typeof data.detail !== 'object') return null;
      return data;
    } catch (_) {
      return null;
    }
  }

  function clearP2pOrderRoomSession() {
    try {
      sessionStorage.removeItem(P2P_ORDER_ROOM_SESSION_KEY);
    } catch (_) {}
    markOpenTradeOnProfileBoot(false);
  }

  function setP2pOrderChatSystemText(isCancelled) {
    const el = document.getElementById('p2pOrderChatSystemText');
    if (!el) return;
    el.textContent = isCancelled
      ? 'Ваш ордер был отменен. Нельзя продлить/открыть ордер снова. Если у вас есть вопросы, нажмите кнопку «Нужна помощь?».'
      : 'Вы успешно разместили ордер. Теперь необходимо произвести оплату.';
  }

  function openP2pOrderRoom(detail, roomFixed) {
    const d = normalizeP2pOrderDetail(detail);
    document.documentElement.classList.remove('p2p-boot-profile');
    closeSellerMoreDataModal();
    clearP2pOrderRoomCountdown();
    const market = document.getElementById('p2pMarketView');
    const room = document.getElementById('p2pOrderRoom');
    const seller = document.getElementById('p2pSellerProfile');
    if (!market || !room) return false;
    ensureP2pChatSocket();
    if (seller) {
      seller.hidden = true;
      seller.setAttribute('aria-hidden', 'true');
    }
    document.querySelector('.p2p')?.classList.remove('p2p--seller-page');
    setP2pOrderRoomLeftMode('active');
    setP2pOrderChatSystemText(false);

    const payNum = parseOrderAmount(d.payRaw);
    const fiatDisplay = Number.isFinite(payNum)
      ? `${payNum.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${d.payFiat}`
      : `${d.payRaw || '0'} ${d.payFiat}`;

    const priceDisplay = `${d.priceText} ${d.fiat}`.trim();
    const cryptoStr = (d.receiveRaw || '').trim();
    const cryptoDisplay = cryptoStr ? `${cryptoStr} ${d.coin}` : `0 ${d.coin}`;

    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const orderId =
      roomFixed && typeof roomFixed.orderId === 'string' && roomFixed.orderId.length > 0
        ? roomFixed.orderId
        : genP2pOrderId();
    const timeStr =
      roomFixed && typeof roomFixed.timeStr === 'string' && roomFixed.timeStr.length > 0
        ? roomFixed.timeStr
        : `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

    const fiatEl = document.getElementById('p2pOrderFiat');
    const orderPriceEl = document.getElementById('p2pOrderPrice');
    const cryptoEl = document.getElementById('p2pOrderCrypto');
    const noEl = document.getElementById('p2pOrderNo');
    const timeEl = document.getElementById('p2pOrderTime');
    if (fiatEl) fiatEl.textContent = fiatDisplay;
    if (orderPriceEl) orderPriceEl.textContent = priceDisplay;
    if (cryptoEl) cryptoEl.textContent = cryptoDisplay;
    if (noEl) noEl.textContent = orderId;
    if (timeEl) timeEl.textContent = timeStr;

    const nickDisplay = String(d.userName || 'Продавец').trim();
    const legalDisplay = String(d.sellerLegalName || nickDisplay).trim();
    const step1El = document.getElementById('p2pOrderStep1Title');
    if (step1El) step1El.textContent = formatP2pPaymentStepTitle(d.paymentMethod);
    const nickEl = document.getElementById('p2pOrderSellerNick');
    if (nickEl) nickEl.textContent = nickDisplay;
    const legalEl = document.getElementById('p2pOrderSellerLegal');
    if (legalEl) legalEl.textContent = legalDisplay;
    const payDetEl = document.getElementById('p2pOrderPayDetails');
    if (payDetEl) payDetEl.textContent = paymentDetailsFromMethod(d.paymentMethod);

    const windowSec = parsePaymentWindowSeconds(d.paymentWindow);
    let countdownEndMs = roomFixed && Number.isFinite(roomFixed.countdownEndMs) ? roomFixed.countdownEndMs : NaN;
    if (!Number.isFinite(countdownEndMs)) {
      countdownEndMs = Date.now() + windowSec * 1000;
    }
    const countdownEl = document.getElementById('p2pOrderCountdown');
    const tickCountdown = () => {
      if (!countdownEl) return;
      const leftSec = Math.max(0, Math.ceil((countdownEndMs - Date.now()) / 1000));
      countdownEl.textContent = formatOrderCountdownHms(leftSec);
      if (leftSec <= 0) {
        clearP2pOrderRoomCountdown();
        goToP2pStartScreen();
      }
    };
    tickCountdown();
    if (Math.max(0, Math.ceil((countdownEndMs - Date.now()) / 1000)) <= 0) {
      return false;
    }
    p2pOrderRoomCountdownTimer = window.setInterval(tickCountdown, 1000);

    const tradeTitle = document.getElementById('p2pOrderRoomTradeTitle');
    if (tradeTitle) {
      const coin = esc(d.coin || 'USDT');
      if (d.sideIsSell) {
        tradeTitle.innerHTML = `<span class="p2p-order-room__trade-verb p2p-order-room__trade-verb--sell">Продажа</span> <span class="p2p-order-room__trade-coin">${coin}</span>`;
      } else {
        tradeTitle.innerHTML = `<span class="p2p-order-room__trade-verb">Покупка</span> <span class="p2p-order-room__trade-coin">${coin}</span>`;
      }
    }

    const chatName = document.getElementById('p2pOrderChatName');
    const chatAvatar = document.getElementById('p2pOrderChatAvatar');
    const chatLegal = document.getElementById('p2pOrderChatVerifiedLegal');
    if (chatName) chatName.textContent = nickDisplay;
    if (chatLegal) chatLegal.textContent = legalDisplay;
    if (chatAvatar) {
      const letter = (d.avatarText || d.userName[0] || '?').trim().charAt(0).toUpperCase() || '?';
      chatAvatar.textContent = letter;
      chatAvatar.style.background = '#000';
    }

    let chatTs1Text = '';
    const ts1 = document.getElementById('p2pOrderChatTs1');
    if (ts1) {
      if (roomFixed && typeof roomFixed.chatTs1 === 'string' && roomFixed.chatTs1.length > 0) {
        ts1.textContent = roomFixed.chatTs1;
      } else {
        const t2 = new Date(now.getTime() + 35000);
        ts1.textContent = `${t2.getFullYear()}-${pad(t2.getMonth() + 1)}-${pad(t2.getDate())} ${pad(t2.getHours())}:${pad(t2.getMinutes())}:${pad(t2.getSeconds())}`;
      }
      chatTs1Text = ts1.textContent;
    }

    const morePanel = document.getElementById('p2pOrderMorePanel');
    const moreToggle = document.getElementById('p2pOrderMoreToggle');
    if (morePanel) morePanel.hidden = true;
    if (moreToggle) {
      moreToggle.classList.remove('is-open');
      moreToggle.setAttribute('aria-expanded', 'false');
    }

    const chatBody = document.getElementById('p2pOrderChatBody');
    const initialChatLog = Array.isArray(roomFixed?.chatLog)
      ? roomFixed.chatLog.map(e => Object.assign({}, e))
      : [];
    if (chatBody) {
      chatBody.querySelectorAll('.p2p-order-room__msg').forEach(el => el.remove());
      initialChatLog.forEach(entry => {
        if (!entry || typeof entry.kind !== 'string') return;
        if (entry.kind === 'me_text') {
          appendChatMessage(chatBody, esc(entry.text || ''));
        } else if (entry.kind === 'me_img' && typeof entry.src === 'string' && entry.src.startsWith('data:')) {
          appendChatMessage(
            chatBody,
            `<img class="p2p-order-room__chat-photo" src="${entry.src}" alt="${esc(entry.alt || 'Фото')}">`
          );
        } else if (entry.kind === 'them_text') {
          appendServerChatMessage(chatBody, esc(entry.text || ''));
        }
      });
    }

    p2pOrderRoomSessionCache = {
      detail: snapshotP2pOrderDetail(d),
      orderId,
      timeStr,
      chatTs1: chatTs1Text,
      countdownEndMs,
      chatLog: initialChatLog
    };
    if (!saveP2pOrderRoomSession(p2pOrderRoomSessionCache)) {
      showToast('Не удалось сохранить сессию (возможно, чат слишком большой)', '#e74c3c');
    }

    if (!IS_ORDER_ROOM_PAGE) {
      window.location.href = 'order-room.html';
      return true;
    }

    market.hidden = true;
    market.setAttribute('aria-hidden', 'true');
    room.hidden = false;
    room.removeAttribute('aria-hidden');
    window.scrollTo({ top: 0, behavior: roomFixed ? 'auto' : 'smooth' });
    if (chatBody) chatBody.scrollTop = chatBody.scrollHeight;
    return true;
  }

  function tryRestoreP2pOrderRoom() {
    const data = loadP2pOrderRoomSession();
    if (!data) return false;
    return openP2pOrderRoom(data.detail, {
      orderId: data.orderId,
      timeStr: data.timeStr,
      chatTs1: data.chatTs1,
      countdownEndMs: data.countdownEndMs,
      chatLog: Array.isArray(data.chatLog) ? data.chatLog : []
    });
  }

  function closeAllMenus() {
    closeDropdownMenusOnly();
    closeFilterPanel();
  }

  function closeMenusOnScrollIfCompact() {
    if (!isP2pCompactModals()) return;
    closeAllMenus();
  }

  function extractUserName(el) {
    if (!el) return 'Продавец';
    const firstText = Array.from(el.childNodes).find(n => n.nodeType === Node.TEXT_NODE);
    return (firstText?.textContent || el.textContent || 'Продавец').trim();
  }

  function findTableRowBySellerUsername(tableBody, username) {
    if (!tableBody || !username) return null;
    const want = String(username).trim().toLowerCase();
    const rows = tableBody.querySelectorAll('.p2p-table__row');
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const ne = r.querySelector('.p2p-table__username');
      if (extractUserName(ne).trim().toLowerCase() === want) return r;
    }
    return null;
  }

  function openTradeModalFromRow(row, btn) {
    if (!row) return;

    closeTradeModal();

    const nameEl = row.querySelector('.p2p-table__username');
    const avatarEl = row.querySelector('.p2p-table__avatar');
    const statsEl = row.querySelector('.p2p-table__stats');
    const timeIconEl = row.querySelector('.p2p-table__time-icon');
    const priceEl = row.querySelector('.p2p-table__price');
    const currencyEl = row.querySelector('.p2p-table__currency');
    const availableEl = row.querySelector('.p2p-table__available');
    const limitsEl = row.querySelector('.p2p-table__limits');
    const paymentEls = row.querySelectorAll('.p2p-table__payment-method');

    const userName = extractUserName(nameEl);
    const avatarText = (avatarEl?.textContent || userName[0] || 'U').trim();
    const avatarBg = avatarEl?.style?.background || '#000';
    const stats = (statsEl?.textContent || '0 Order(s) | 0%').trim();
    const statParts = stats.split('|').map(s => s.trim());
    const ordersRaw = statParts[0] || '0';
    const ordersNumber = ordersRaw
      .replace(/order\(s\)/gi, '')
      .replace(/ордер(а|ов)?/gi, '')
      .trim();
    const ordersStat = `${ordersNumber || '0'} исполнено`;
    const rateStat = statParts[1] || '100%';
    const time = (timeIconEl?.dataset?.time || '15m').trim();
    const price = (priceEl?.textContent || '0.000').trim();
    const fiat = (currencyEl?.textContent || 'EUR').trim();
    const payFiat = 'RUB';
    const available = (availableEl?.textContent || '0 USDT').trim();
    const limits = (limitsEl?.textContent || `0 ~ 0 ${fiat}`).trim();
    const coin = (btn?.dataset?.coin || 'USDT').trim();
    const sideIsSell = btn?.classList?.contains('p2p-table__sell-btn');
    const confirmLabel = sideIsSell ? 'Продажа' : 'Покупка';
    const payments = Array.from(paymentEls).map(p => p.textContent.trim()).filter(Boolean);
    const paymentsHtml = payments.map(m => `<span class="p2p-trade-modal__pm-tag">${m}</span>`).join('');
    const optionsHtml = payments.map(m => `<button type="button" class="p2p-trade-modal__dd-option" data-value="${m}">${m}</button>`).join('');
    const paymentPlaceholder = 'Выбрать способ оплаты';

    const parseNumber = (v) => {
      if (!v) return NaN;
      let s = String(v).replace(/\s/g, '').replace(/[^\d,.-]/g, '');
      if (!s) return NaN;
      if (s.includes(',') && s.includes('.')) {
        s = s.replace(/,/g, '');
      } else if (s.includes(',')) {
        if (/,\d{1,2}$/.test(s)) s = s.replace(',', '.');
        else s = s.replace(/,/g, '');
      }
      return Number(s);
    };
    const formatNumber = (num, digits = 4) => {
      if (!Number.isFinite(num)) return '';
      return num.toFixed(digits).replace(/\.?0+$/, '');
    };
    const priceNum = parseNumber(price);

    const overlay = document.createElement('div');
    overlay.className = 'p2p-trade-modal-overlay';
    overlay.innerHTML = `
      <div class="p2p-trade-modal" role="dialog" aria-modal="true" aria-label="Сделка P2P">
        <div class="p2p-trade-modal__left">
          <div class="p2p-trade-modal__seller">
            <div class="p2p-trade-modal__avatar" style="background:${avatarBg}">${avatarText}</div>
            <div class="p2p-trade-modal__seller-main">
              <div class="p2p-trade-modal__seller-name-row">
                <div class="p2p-trade-modal__seller-name">${userName}</div>
                <span class="p2p-trade-modal__seller-arrow">›</span>
              </div>
              <div class="p2p-trade-modal__seller-stats-row">
                <span>${ordersStat}</span>
                <span>${rateStat}</span>
              </div>
              <div class="p2p-trade-modal__seller-online">Онлайн</div>
            </div>
          </div>
          <div class="p2p-trade-modal__badges-under-avatar">
            <div class="p2p-trade-modal__seller-badges">
              <span class="p2p-trade-modal__badge-item"><img src="img/success-icon.svg" width="15" height="15" alt=""> Эл. почта</span>
              <span class="p2p-trade-modal__badge-item"><img src="img/success-icon.svg" width="15" height="15" alt=""> SMS</span>
            </div>
            <div class="p2p-trade-modal__seller-badges">
              <span class="p2p-trade-modal__badge-item"><img src="img/success-icon.svg" width="15" height="15" alt=""> Верификация личности</span>
            </div>
          </div>

          <div class="p2p-trade-modal__meta">
            <div class="p2p-trade-modal__meta-row"><span>Доступно</span><b>${available}</b></div>
            <div class="p2p-trade-modal__meta-row"><span>Лимиты</span><b>${limits}</b></div>
            <div class="p2p-trade-modal__meta-row"><span>Длительность оплаты</span><b>${time}</b></div>
            <div class="p2p-trade-modal__meta-row p2p-trade-modal__meta-row--top"><span>Способ оплаты</span><div class="p2p-trade-modal__pm">${paymentsHtml || '<span class="p2p-trade-modal__pm-tag">—</span>'}</div></div>
          </div>

          <div class="p2p-trade-modal__maker">
            <div class="p2p-trade-modal__maker-title">Условия мейкера</div>
            <div class="p2p-trade-modal__maker-row">
              <img src="img/question-gray.svg" width="14" height="14" alt="">
              <p>
                Мерчанты могут указывать дополнительные условия в Условиях мейкеров.
                Внимательно изучите их перед размещением ордера. В случае противоречий
                приоритет имеют <span class="p2p-trade-modal__maker-link">Условия платформы.</span> Защита платформы не распространяется на нарушителей условий.
              </p>
            </div>
          </div>
        </div>

        <div class="p2p-trade-modal__right">
          <div class="p2p-trade-modal__price-row">Цена <b>${price} ${fiat}</b> <span class="p2p-trade-modal__timer" aria-live="polite">60s</span></div>

          <div class="p2p-trade-modal__field p2p-trade-modal__field--rub">
            <span class="p2p-trade-modal__field-inlabel" id="p2p-trade-pay-label">Я заплачу</span>
            <div class="p2p-trade-modal__field-inner">
              <span class="p2p-trade-modal__field-icon-wrap" aria-hidden="true">
                <img class="p2p-trade-modal__field-icon" src="img/rub-logo.svg" width="22" height="22" alt="">
              </span>
              <input type="text" class="p2p-trade-modal__pay-input" value="" placeholder="0.00" inputmode="decimal" autocomplete="off" aria-labelledby="p2p-trade-pay-label">
              <span class="p2p-trade-modal__field-suffix">${payFiat}</span>
              <button type="button" class="p2p-trade-modal__field-all">Все</button>
            </div>
            <div class="p2p-trade-modal__pay-hint" hidden></div>
          </div>

          <div class="p2p-trade-modal__field p2p-trade-modal__field--usdt">
            <span class="p2p-trade-modal__field-inlabel" id="p2p-trade-receive-label">Я получу</span>
            <div class="p2p-trade-modal__field-inner">
              <span class="p2p-trade-modal__field-icon-wrap" aria-hidden="true">
                <img class="p2p-trade-modal__field-icon" src="img/usdt-logo.svg" width="14" height="14" alt="">
              </span>
              <input type="text" class="p2p-trade-modal__receive-input" value="" placeholder="0.00" inputmode="decimal" autocomplete="off" aria-labelledby="p2p-trade-receive-label">
              <span class="p2p-trade-modal__field-suffix">${coin}</span>
              <button type="button" class="p2p-trade-modal__field-all">Все</button>
            </div>
          </div>

          <div class="p2p-trade-modal__dd">
            <button type="button" class="p2p-trade-modal__dd-trigger" aria-expanded="false">
              <span class="p2p-trade-modal__dd-value p2p-trade-modal__dd-value--placeholder">${paymentPlaceholder}</span>
              <span class="p2p-trade-modal__dd-arrow"><img src="assets/icon-chevron-down.svg" width="12" height="12" alt=""></span>
            </button>
            <div class="p2p-trade-modal__dd-menu" role="listbox">
              ${optionsHtml || '<button type="button" class="p2p-trade-modal__dd-option" data-value="—">—</button>'}
            </div>
          </div>

          <div class="p2p-trade-modal__actions">
            <button type="button" class="p2p-trade-modal__confirm" disabled>${confirmLabel}</button>
            <button type="button" class="p2p-trade-modal__cancel">Отмена</button>
          </div>
          <div class="p2p-trade-modal__note">При риске вывод средств может задержаться до 24 часов.</div>
        </div>
      </div>
    `;

    let countdownTimerId = null;
    let confirmNavigateTimer = null;
    const closeWithCleanup = () => {
      if (countdownTimerId != null) {
        clearInterval(countdownTimerId);
        countdownTimerId = null;
      }
      if (confirmNavigateTimer != null) {
        clearTimeout(confirmNavigateTimer);
        confirmNavigateTimer = null;
      }
      document.removeEventListener('keydown', onEsc);
      closeTradeModal();
    };
    overlay.addEventListener('mousedown', e => {
      if (e.target === overlay) closeWithCleanup();
    });
    const onEsc = (e) => {
      if (e.key === 'Escape') {
        closeWithCleanup();
      }
    };
    document.addEventListener('keydown', onEsc);
    overlay.querySelector('.p2p-trade-modal__cancel')?.addEventListener('click', closeWithCleanup);

    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    const timerEl = overlay.querySelector('.p2p-trade-modal__timer');
    const formatModalCountdown = (totalSeconds) => `${Math.max(0, totalSeconds)}s`;
    if (timerEl) {
      let remaining = 60;
      timerEl.textContent = formatModalCountdown(remaining);
      countdownTimerId = setInterval(() => {
        remaining--;
        timerEl.textContent = formatModalCountdown(remaining);
        if (remaining <= 0) {
          clearInterval(countdownTimerId);
          countdownTimerId = null;
          closeWithCleanup();
        }
      }, 1000);
    }

    const payInput = overlay.querySelector('.p2p-trade-modal__pay-input');
    const receiveInput = overlay.querySelector('.p2p-trade-modal__receive-input');
    const confirmBtn = overlay.querySelector('.p2p-trade-modal__confirm');
    const payHintEl = overlay.querySelector('.p2p-trade-modal__pay-hint');
    const dd = overlay.querySelector('.p2p-trade-modal__dd');
    const ddTrigger = overlay.querySelector('.p2p-trade-modal__dd-trigger');
    const ddValue = overlay.querySelector('.p2p-trade-modal__dd-value');
    const ddMenu = overlay.querySelector('.p2p-trade-modal__dd-menu');
    const sanitize = (val) => val.replace(/[^\d.,]/g, '');
    const limitsClean = limits.replace(/RUB/gi, '').trim();
    const limitSegs = limitsClean.split(/\s*~\s*/);
    const minRubFromRow = parseNumber((limitSegs[0] || '').trim());
    const maxRubFromRow = parseNumber((limitSegs[1] || limitSegs[0] || '').trim());
    const availableUsdtFromRow = parseNumber(String(available).replace(/USDT/gi, '').trim());
    const fmtRubHint = (n) =>
      Number.isFinite(n)
        ? n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : '';

    function getMaxFiatPayRub() {
      if (!Number.isFinite(priceNum) || priceNum <= 0) return NaN;
      const stock = Number.isFinite(availableUsdtFromRow) && availableUsdtFromRow > 0 ? availableUsdtFromRow : 0;
      if (stock <= 0) return NaN;
      const capByAdvertiserStock = stock * priceNum;
      const capByLimit =
        Number.isFinite(maxRubFromRow) && maxRubFromRow > 0 ? maxRubFromRow : Infinity;
      return Math.min(capByLimit, capByAdvertiserStock);
    }

    const updateConfirmState = () => {
      const pay = parseNumber(payInput.value);
      const methodLabel = (ddValue?.textContent || '').trim();
      const paymentSelected = methodLabel !== '' && methodLabel !== paymentPlaceholder;
      const hasMin = Number.isFinite(minRubFromRow) && minRubFromRow > 0;
      const minOk = !hasMin || (Number.isFinite(pay) && pay + 1e-6 >= minRubFromRow);
      const maxPay = getMaxFiatPayRub();
      const hasMax = Number.isFinite(maxPay) && maxPay > 0;
      const maxOk = !hasMax || !Number.isFinite(pay) || pay <= maxPay + 1e-6;
      const enabled =
        Number.isFinite(pay) && pay > 0 && paymentSelected && minOk && maxOk;
      if (confirmBtn) confirmBtn.disabled = !enabled;

      if (payHintEl) {
        if (Number.isFinite(pay) && pay > 0 && hasMin && pay < minRubFromRow - 1e-6) {
          payHintEl.textContent = `Минимальная сумма по лимитам объявления: ${fmtRubHint(minRubFromRow)} ${payFiat}`;
          payHintEl.hidden = false;
        } else if (Number.isFinite(pay) && pay > 0 && hasMax && pay > maxPay + 1e-6) {
          payHintEl.textContent = `Максимум для этой сделки: ${fmtRubHint(maxPay)} ${payFiat}`;
          payHintEl.hidden = false;
        } else {
          payHintEl.textContent = '';
          payHintEl.hidden = true;
        }
      }
      if (payInput) {
        const invalid =
          Number.isFinite(pay) &&
          pay > 0 &&
          ((!minOk && hasMin) || (!maxOk && hasMax));
        payInput.setAttribute('aria-invalid', invalid ? 'true' : 'false');
      }
    };
    let syncFieldsFrom = null;

    const recalcFromPay = () => {
      const pay = parseNumber(payInput.value);
      if (!Number.isFinite(pay) || pay <= 0) {
        receiveInput.value = '';
      } else if (!Number.isFinite(priceNum) || priceNum <= 0) {
        receiveInput.value = '';
      } else {
        receiveInput.value = formatNumber(pay / priceNum, 6);
      }
      updateConfirmState();
    };

    const recalcFromReceive = () => {
      const usdt = parseNumber(receiveInput.value);
      if (!Number.isFinite(usdt) || usdt <= 0) {
        payInput.value = '';
      } else if (!Number.isFinite(priceNum) || priceNum <= 0) {
        payInput.value = '';
      } else {
        const rub = usdt * priceNum;
        payInput.value = rub.toFixed(2).replace('.', ',');
      }
      updateConfirmState();
    };

    payInput?.addEventListener('input', () => {
      payInput.value = sanitize(payInput.value);
      if (syncFieldsFrom === 'receive') {
        syncFieldsFrom = null;
        return;
      }
      syncFieldsFrom = 'pay';
      recalcFromPay();
      syncFieldsFrom = null;
    });

    receiveInput?.addEventListener('input', () => {
      receiveInput.value = sanitize(receiveInput.value);
      if (syncFieldsFrom === 'pay') {
        syncFieldsFrom = null;
        return;
      }
      syncFieldsFrom = 'receive';
      recalcFromReceive();
      syncFieldsFrom = null;
    });

    overlay.querySelectorAll('.p2p-trade-modal__field-all').forEach((allBtn) => {
      allBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const maxPay = getMaxFiatPayRub();
        if (!Number.isFinite(maxPay) || maxPay <= 0) return;
        payInput.value = maxPay.toFixed(2).replace('.', ',');
        recalcFromPay();
      });
    });

    if (dd && ddTrigger && ddMenu && ddValue) {
      ddTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const opened = dd.classList.toggle('open');
        ddTrigger.setAttribute('aria-expanded', opened ? 'true' : 'false');
      });
      ddMenu.querySelectorAll('.p2p-trade-modal__dd-option').forEach(opt => {
        opt.addEventListener('click', (e) => {
          e.stopPropagation();
          ddValue.textContent = opt.dataset.value || opt.textContent || '—';
          ddValue.classList.remove('p2p-trade-modal__dd-value--placeholder');
          dd.classList.remove('open');
          ddTrigger.setAttribute('aria-expanded', 'false');
          updateConfirmState();
        });
      });
      overlay.addEventListener('mousedown', (e) => {
        if (!dd.contains(e.target)) {
          dd.classList.remove('open');
          ddTrigger.setAttribute('aria-expanded', 'false');
        }
      });
    }

    confirmBtn?.addEventListener('click', () => {
      if (confirmBtn.disabled) return;
      if (countdownTimerId != null) {
        clearInterval(countdownTimerId);
        countdownTimerId = null;
      }
      confirmBtn.disabled = true;
      const loader = document.createElement('div');
      loader.className = 'p2p-trade-modal__loader p2p-trade-modal__loader--fullscreen';
      loader.setAttribute('role', 'status');
      loader.setAttribute('aria-live', 'polite');
      loader.setAttribute('aria-label', 'Обработка');
      loader.innerHTML =
        '<div class="p2p-trade-modal__loader-ring" aria-hidden="true"></div>' +
        '<span class="p2p-trade-modal__loader-text">Создание ордера…</span>';
      document.documentElement.classList.add('p2p-trade-modal-loader-lock');
      document.body.classList.add('p2p-trade-modal-loader-lock');
      document.body.appendChild(loader);

      const pm = (ddValue?.textContent || '').trim();
      const reqs = deriveP2pPaymentRequisites(userName, pm);
      const detail = {
        userName,
        sellerLegalName: reqs.legalName,
        payBank: reqs.bank,
        payCard: reqs.card,
        payPhone: reqs.phone,
        payFiat,
        fiat,
        coin,
        payRaw: payInput.value,
        receiveRaw: receiveInput.value,
        priceText: price,
        sideIsSell,
        avatarText,
        avatarBg: avatarEl?.style?.background || '',
        paymentMethod: pm,
        paymentWindow: time
      };
      confirmNavigateTimer = window.setTimeout(() => {
        confirmNavigateTimer = null;
        closeWithCleanup();
        incrementP2pOrdersBadge();
        openP2pOrderRoom(detail);
      }, 2000);
    });

    updateConfirmState();
  }

  function safeOpenTradeModalFromRow(row, btn) {
    try {
      openTradeModalFromRow(row, btn);
    } catch (err) {
      console.error('Failed to open trade modal:', err);
      showToast('Не удалось открыть окно сделки', '#e74c3c');
    }
  }

  function buildCurrencyDropdown(activeCode, onSelect) {
    const menu = document.createElement('div');
    menu.className = 'p2p-select-menu p2p-currency-menu';
    menu.dataset.owner = 'currency';

    const searchWrap = document.createElement('div');
    searchWrap.className = 'p2p-currency-menu__search-wrap';
    const searchIcon = document.createElement('span');
    searchIcon.className = 'p2p-currency-menu__search-icon';
    searchIcon.innerHTML = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="5" stroke="#aeb4bc" stroke-width="1.4"/><path d="M11 11l3 3" stroke="#aeb4bc" stroke-width="1.4" stroke-linecap="round"/></svg>';
    const searchInput = document.createElement('input');
    searchInput.className = 'p2p-currency-menu__search';
    searchInput.placeholder = 'Поиск';
    searchInput.autocomplete = 'off';
    searchWrap.appendChild(searchIcon);
    searchWrap.appendChild(searchInput);
    menu.appendChild(searchWrap);

    const list = document.createElement('div');
    list.className = 'p2p-currency-menu__list';

    function renderItems(filter) {
      list.innerHTML = '';
      const filtered = currencies.filter(c => c.code.toLowerCase().includes(filter.toLowerCase()));
      if (filtered.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'p2p-currency-menu__empty';
        empty.textContent = 'Ничего не найдено';
        list.appendChild(empty);
        return;
      }
      filtered.forEach(c => {
          const item = document.createElement('div');
          item.className = 'p2p-currency-menu__item' + (c.code === activeCode ? ' active' : '');

          const badge = document.createElement('span');
          badge.className = 'p2p-currency-menu__badge';
          badge.style.background = c.color;
          if (c.img) {
            badge.innerHTML = `<img src="${c.img}" width="24" height="24" alt="${c.symbol}" style="display:block;">`;
          } else {
            badge.textContent = c.symbol;
          }

          const label = document.createElement('span');
          label.textContent = c.code;

          item.appendChild(badge);
          item.appendChild(label);
          item.addEventListener('click', e => {
            e.stopPropagation();
            onSelect(c);
            menu.remove();
          });
          list.appendChild(item);
        });
    }

    renderItems('');
    searchInput.addEventListener('input', e => renderItems(e.target.value));
    searchInput.addEventListener('click', e => e.stopPropagation());
    menu.appendChild(list);
    return menu;
  }

  const currencySelect = document.getElementById('currencySelect');
  const currencyLabel = document.getElementById('currencyLabel');
  if (currencySelect && currencyLabel) {
    currencySelect.addEventListener('click', e => {
      e.stopPropagation();
      const existed = document.querySelector('.p2p-select-menu[data-owner="currency"]');
      closeAllMenus();
      if (existed) return;
      currencySelect.classList.add('active');
      const currencyBadge = document.getElementById('currencyBadge');
      const menu = buildCurrencyDropdown(currencyLabel.textContent, c => {
        currencyLabel.textContent = c.code;
        currencySelect.dataset.value = c.code;
        currencySelect.classList.remove('active');
        if (currencyBadge) {
          currencyBadge.style.background = c.color;
          if (c.img) {
            currencyBadge.innerHTML = `<img src="${c.img}" width="18" height="18" alt="${c.symbol}" style="display:block;">`;
          } else {
            currencyBadge.textContent = c.symbol;
          }
        }
        updateTitle();
        showToast(`Валюта изменена на ${c.code}`, '#1e2026');
      });
      openDropdown(currencySelect, menu);
      setTimeout(() => menu.querySelector('.p2p-currency-menu__search')?.focus(), 50);
    });
  }

  const G = '#2ebd85', R = '#e74c3c', O = '#f0b90b';
  const paymentMethods = [
    { name: 'Mobile Top-up',             popular: true,  color: O },
    { name: 'Cash in Person',            popular: true,  color: G },
    { name: 'Bank Transfer',             popular: true,  color: R },
    { name: 'Cash Deposit to Bank',      popular: true,  color: O },
  ];

  function buildPaymentDropdown(selectedNames, onConfirm) {
    const menu = document.createElement('div');
    menu.className = 'p2p-select-menu p2p-payment-menu';
    menu.dataset.owner = 'payment';

    const searchWrap = document.createElement('div');
    searchWrap.className = 'p2p-payment-menu__search-wrap';
    const searchInner = document.createElement('div');
    searchInner.className = 'p2p-payment-menu__search-inner';
    const searchIcon = document.createElement('span');
    searchIcon.className = 'p2p-payment-menu__search-icon';
    searchIcon.innerHTML = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="5" stroke="#aeb4bc" stroke-width="1.4"/><path d="M11 11l3 3" stroke="#aeb4bc" stroke-width="1.4" stroke-linecap="round"/></svg>';
    const searchInput = document.createElement('input');
    searchInput.className = 'p2p-payment-menu__search';
    searchInput.placeholder = 'Поиск';
    searchInput.autocomplete = 'off';
    searchInner.appendChild(searchIcon);
    searchInner.appendChild(searchInput);
    searchWrap.appendChild(searchInner);
    menu.appendChild(searchWrap);

    const allWrap = document.createElement('div');
    allWrap.className = 'p2p-payment-menu__all';
    const allCheck = document.createElement('span');
    allCheck.className = 'p2p-payment-menu__checkbox' + (selectedNames.length === 0 ? ' checked' : '');
    const allLabel = document.createElement('span');
    allLabel.className = 'p2p-payment-menu__all-label';
    allLabel.textContent = 'Все способы оплаты';
    allWrap.appendChild(allCheck);
    allWrap.appendChild(allLabel);
    allWrap.addEventListener('click', e => {
      e.stopPropagation();
      selectedNames.length = 0;
      updateChecks();
    });
    menu.appendChild(allWrap);

    const div1 = document.createElement('div');
    div1.className = 'p2p-payment-menu__divider';
    menu.appendChild(div1);

    const list = document.createElement('div');
    list.className = 'p2p-payment-menu__list';

    function makeItem(m) {
      const item = document.createElement('div');
      item.className = 'p2p-payment-menu__item';

      const check = document.createElement('span');
      check.className = 'p2p-payment-menu__checkbox' + (selectedNames.includes(m.name) ? ' checked' : '');
      check.dataset.name = m.name;

      const bar = document.createElement('span');
      bar.className = 'p2p-payment-menu__bar';
      bar.style.background = m.color || '#d0d4dc';

      const label = document.createElement('span');
      label.className = 'p2p-payment-menu__item-label';
      label.textContent = m.name;

      item.appendChild(check);
      item.appendChild(bar);
      item.appendChild(label);

      item.addEventListener('click', e => {
        e.stopPropagation();
        const idx = selectedNames.indexOf(m.name);
        if (idx >= 0) selectedNames.splice(idx, 1);
        else selectedNames.push(m.name);
        updateChecks();
      });
      return item;
    }

    function makeSectionHeader(text, withFire) {
      const h = document.createElement('div');
      h.className = 'p2p-payment-menu__section';
      h.innerHTML = withFire
        ? text + ' <img src="img/logo-fire.svg" width="13" height="13" style="vertical-align:middle;" alt="">'
        : text;
      return h;
    }

    function renderItems(filter) {
      list.innerHTML = '';
      const f = filter.toLowerCase();
      const popular = paymentMethods.filter(m => m.popular && m.name.toLowerCase().includes(f));
      const other   = paymentMethods.filter(m => !m.popular && m.name.toLowerCase().includes(f));

      if (popular.length) {
        list.appendChild(makeSectionHeader('Популярные', true));
        popular.forEach(m => list.appendChild(makeItem(m)));
      }
      if (other.length) {
        const divider = document.createElement('div');
        divider.className = 'p2p-payment-menu__divider';
        divider.style.margin = '4px 0';
        list.appendChild(divider);
        list.appendChild(makeSectionHeader('Другие', false));
        other.forEach(m => list.appendChild(makeItem(m)));
      }
      if (!popular.length && !other.length) {
        const empty = document.createElement('div');
        empty.className = 'p2p-currency-menu__empty';
        empty.textContent = 'Ничего не найдено';
        list.appendChild(empty);
      }
    }

    function updateChecks() {
      allCheck.classList.toggle('checked', selectedNames.length === 0);
      list.querySelectorAll('.p2p-payment-menu__checkbox').forEach(cb => {
        cb.classList.toggle('checked', selectedNames.includes(cb.dataset.name));
      });
    }

    renderItems('');
    searchInput.addEventListener('input', e => renderItems(e.target.value));
    searchInput.addEventListener('click', e => e.stopPropagation());
    menu.appendChild(list);

    const footer = document.createElement('div');
    footer.className = 'p2p-payment-menu__footer';

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'p2p-payment-menu__confirm';
    confirmBtn.textContent = 'Подтвердить';
    confirmBtn.addEventListener('click', e => {
      e.stopPropagation();
      onConfirm(selectedNames.slice());
      menu.remove();
    });

    const resetBtn = document.createElement('button');
    resetBtn.className = 'p2p-payment-menu__reset';
    resetBtn.textContent = 'Сбросить';
    resetBtn.addEventListener('click', e => {
      e.stopPropagation();
      selectedNames.length = 0;
      updateChecks();
      onConfirm([]);
      menu.remove();
    });

    footer.appendChild(confirmBtn);
    footer.appendChild(resetBtn);
    menu.appendChild(footer);

    return menu;
  }

  const paymentSelect = document.getElementById('paymentSelect');
  const paymentLabel = document.getElementById('paymentLabel');
  if (paymentSelect && paymentLabel) {
    paymentSelect.addEventListener('click', e => {
      e.stopPropagation();
      const existed = document.querySelector('.p2p-select-menu[data-owner="payment"]');
      closeAllMenus();
      if (existed) return;
      paymentSelect.classList.add('active');
      const menu = buildPaymentDropdown(selectedPayments, names => {
        selectedPayments = names;
        if (names.length === 0) {
          paymentLabel.textContent = 'Все способы оплаты';
        } else {
          const joined = names.join(', ');
          const MAX = 28;
          paymentLabel.textContent = joined.length > MAX ? joined.slice(0, MAX) + '…' : joined;
        }
        paymentSelect.classList.remove('active');
        activeMarketPage = 1;
        renderMarketPage(1);
      });
      openDropdown(paymentSelect, menu);
      setTimeout(() => menu.querySelector('.p2p-payment-menu__search')?.focus(), 50);
    });
  }

  const refreshSelect = document.getElementById('refreshSelect');
  const refreshOptions = [
    { label: 'Not now',        value: 'not_now',  accent: true  },
    { label: '5s to refresh',  value: '5000',     accent: false },
    { label: '10s to refresh', value: '10000',    accent: false },
  ];
  let refreshInterval = null;

  function buildRefreshDropdown(activeValue, onSelect) {
    const menu = document.createElement('div');
    menu.className = 'p2p-select-menu p2p-refresh-menu';
    menu.dataset.owner = 'refresh';

    refreshOptions.forEach(opt => {
      const item = document.createElement('div');
      item.className = 'p2p-refresh-menu__item' + (opt.accent ? ' p2p-refresh-menu__item--accent' : '') + (opt.value === activeValue ? ' active' : '');
      item.textContent = opt.label;
      item.addEventListener('click', e => {
        e.stopPropagation();
        onSelect(opt);
        menu.remove();
      });
      menu.appendChild(item);
    });
    return menu;
  }

  let currentRefreshValue = 'not_now';
  const refreshIcon = document.getElementById('refreshIcon');
  const refreshLabel = document.getElementById('refreshLabel');
  if (refreshSelect) {
    refreshSelect.addEventListener('click', e => {
      e.stopPropagation();
      const existed = document.querySelector('.p2p-select-menu[data-owner="refresh"]');
      closeAllMenus();
      if (existed) return;
      refreshSelect.classList.add('active');
      const menu = buildRefreshDropdown(currentRefreshValue, opt => {
        currentRefreshValue = opt.value;
        if (refreshLabel) {
          refreshLabel.textContent = opt.label;
          refreshLabel.style.color = '#1e2026';
          refreshLabel.style.fontWeight = '500';
        }
        if (refreshIcon) {
          refreshIcon.style.display = 'block';
        }
        refreshSelect.classList.remove('active');
        clearInterval(refreshInterval);
        const ms = parseInt(opt.value);
        if (ms && !isNaN(ms)) {
          refreshInterval = setInterval(() => showToast('Таблица обновлена', '#2ebd85'), ms);
        }
      });
      openDropdown(refreshSelect, menu);
    });
  }

  document.addEventListener('click', closeAllMenus);
  window.addEventListener('scroll', closeMenusOnScrollIfCompact, { passive: true });
  document.querySelector('.p2p')?.addEventListener('scroll', closeMenusOnScrollIfCompact, { passive: true });

  const filterBtn = document.getElementById('filterBtn');
  const filterDot = document.getElementById('filterDot');

  const DEFAULT_STATE = () => ({
    adTypes: { verified: true, block: false, eligible: true, noVerif: false },
    sortBy: 'overall',
    timeLimit: 'all',
  });

  let filterState = DEFAULT_STATE();

  function countActiveFilters() {
    const def = DEFAULT_STATE();
    let n = 0;
    Object.keys(filterState.adTypes).forEach(k => {
      if (filterState.adTypes[k] !== def.adTypes[k]) n++;
    });
    if (filterState.sortBy    !== def.sortBy)    n++;
    if (filterState.timeLimit !== def.timeLimit) n++;
    return n;
  }

  function updateFilterBadge() {
    if (!filterDot) return;
    const n = countActiveFilters();
    filterDot.textContent = String(n > 0 ? n : 1);
  }

  function makeFSection(title) {
    const wrap = document.createElement('div');
    wrap.className = 'p2p-filter-panel__section';
    const h = document.createElement('div');
    h.className = 'p2p-filter-panel__section-title';
    h.textContent = title;
    wrap.appendChild(h);
    return wrap;
  }

  function makeFDivider() {
    const d = document.createElement('div');
    d.className = 'p2p-payment-menu__divider';
    return d;
  }

  function buildFilterUi(closeRoot) {
    const body = document.createElement('div');
    body.className = 'p2p-filter-menu__body';

    const adDefs = [
      { key: 'verified', label: 'Только проверенные продавцы' },
      { key: 'block',    label: 'Только Block-продавцы',       icon: '<img src="img/briliant-logo.svg" width="14" height="14" style="vertical-align:middle;" alt="">' },
      { key: 'eligible', label: 'Только подходящие объявления' },
      { key: 'noVerif',  label: 'Без верификации' },
    ];

    const adSection = makeFSection('Типы объявлений');
    const cbRefs = {};
    adDefs.forEach(at => {
      const row = document.createElement('div');
      row.className = 'p2p-filter-panel__check-row';

      const cb = document.createElement('span');
      cb.className = 'p2p-payment-menu__checkbox' + (filterState.adTypes[at.key] ? ' checked' : '');
      cbRefs[at.key] = cb;

      const lbl = document.createElement('span');
      lbl.className = 'p2p-filter-panel__check-label';
      if (at.icon) {
        const ico = document.createElement('span');
        ico.className = 'p2p-filter-panel__icon';
        ico.innerHTML = at.icon;
        lbl.appendChild(ico);
        lbl.appendChild(document.createTextNode(' ' + at.label));
      } else {
        lbl.textContent = at.label;
      }

      row.appendChild(cb);
      row.appendChild(lbl);
      row.addEventListener('click', () => {
        filterState.adTypes[at.key] = !filterState.adTypes[at.key];
        cb.classList.toggle('checked', filterState.adTypes[at.key]);
        updateFilterBadge();
      });
      adSection.appendChild(row);
    });
    body.appendChild(adSection);
    body.appendChild(makeFDivider());

    const sortOpts = [
      { key: 'overall',   label: 'Общая сортировка' },
      { key: 'completed', label: 'Кол-во завершённых' },
      { key: 'rate',      label: 'Процент завершения' },
      { key: 'price',     label: 'Цена (возрастание)' },
    ];
    const sortSection = makeFSection('Сортировка');
    const sortGrid = document.createElement('div');
    sortGrid.className = 'p2p-filter-panel__sort-grid';
    sortOpts.forEach(s => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'p2p-filter-panel__sort-btn' + (filterState.sortBy === s.key ? ' active' : '');
      btn.textContent = s.label;
      btn.addEventListener('click', () => {
        filterState.sortBy = s.key;
        sortGrid.querySelectorAll('.p2p-filter-panel__sort-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        updateFilterBadge();
      });
      sortGrid.appendChild(btn);
    });
    sortSection.appendChild(sortGrid);
    body.appendChild(sortSection);
    body.appendChild(makeFDivider());

    const timeSection = makeFSection('Лимит времени оплаты (мин)');
    const timeRow = document.createElement('div');
    timeRow.className = 'p2p-filter-panel__time-row';
    ['Все', '15', '30', '60'].forEach((t, i) => {
      const val = i === 0 ? 'all' : t;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'p2p-filter-panel__time-btn' + (filterState.timeLimit === val ? ' active' : '');
      btn.textContent = t;
      btn.addEventListener('click', () => {
        filterState.timeLimit = val;
        timeRow.querySelectorAll('.p2p-filter-panel__time-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        updateFilterBadge();
      });
      timeRow.appendChild(btn);
    });
    timeSection.appendChild(timeRow);
    body.appendChild(timeSection);

    const footer = document.createElement('div');
    footer.className = 'p2p-payment-menu__footer';

    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = 'p2p-payment-menu__confirm';
    confirmBtn.textContent = 'Подтвердить';
    confirmBtn.addEventListener('click', () => {
      updateFilterBadge();
      closeRoot();
    });

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'p2p-payment-menu__reset';
    resetBtn.textContent = 'Сбросить';
    resetBtn.addEventListener('click', () => {
      filterState = DEFAULT_STATE();
      Object.keys(cbRefs).forEach(k => cbRefs[k].classList.toggle('checked', filterState.adTypes[k]));
      sortGrid.querySelectorAll('.p2p-filter-panel__sort-btn').forEach(b => {
        b.classList.toggle('active', b.textContent === 'Общая сортировка');
      });
      timeRow.querySelectorAll('.p2p-filter-panel__time-btn').forEach(b => {
        b.classList.toggle('active', b.textContent === 'Все');
      });
      updateFilterBadge();
    });

    footer.appendChild(confirmBtn);
    footer.appendChild(resetBtn);
    return { body, footer };
  }

  if (filterBtn) {
    filterBtn.addEventListener('click', e => {
      e.stopPropagation();
      const existingMenu = document.querySelector('.p2p-filter-menu');
      const existingOverlay = document.querySelector('.p2p-filter-overlay');
      if (existingMenu || existingOverlay) {
        existingMenu?.remove();
        existingOverlay?.remove();
        filterBtn.classList.remove('active');
        return;
      }
      document.querySelectorAll('.p2p-select-menu').forEach(m => m.remove());
      document.querySelectorAll('.p2p-filters__select, .p2p-filters__currency').forEach(s => s.classList.remove('active'));
      filterBtn.classList.add('active');

      if (isP2pCompactModals()) {
        const menu = document.createElement('div');
        menu.className = 'p2p-select-menu p2p-payment-menu p2p-filter-menu';
        menu.dataset.owner = 'filter';
        menu.addEventListener('click', ev => ev.stopPropagation());
        const { body, footer } = buildFilterUi(() => {
          menu.remove();
          filterBtn.classList.remove('active');
        });
        menu.appendChild(body);
        menu.appendChild(footer);
        openDropdown(filterBtn, menu, { minWidth: 290 });
      } else {
        const overlay = document.createElement('div');
        overlay.className = 'p2p-filter-overlay';
        overlay.addEventListener('mousedown', ev => {
          if (ev.target === overlay) {
            overlay.remove();
            filterBtn.classList.remove('active');
          }
        });
        const panel = document.createElement('div');
        panel.className = 'p2p-filter-panel';
        panel.addEventListener('click', ev => ev.stopPropagation());
        const { body, footer } = buildFilterUi(() => {
          overlay.remove();
          filterBtn.classList.remove('active');
        });
        panel.appendChild(body);
        panel.appendChild(footer);
        overlay.appendChild(panel);
        document.body.appendChild(overlay);
        const margin = 8;
        const vw = window.innerWidth;
        const panelW = Math.min(320, vw - margin * 2);
        panel.style.width = `${panelW}px`;
        const rect = filterBtn.getBoundingClientRect();
        let left = rect.right - panelW;
        if (left < margin) left = margin;
        if (left + panelW > vw - margin) left = Math.max(margin, vw - margin - panelW);
        panel.style.top = `${rect.bottom + 6}px`;
        panel.style.left = `${left}px`;
      }
    });
  }

  updateFilterBadge();

  const tableBody = document.getElementById('tableBody');
  if (tableBody) {
    tableBody.addEventListener('click', e => {
      const btn = e.target.closest('.p2p-table__buy-btn, .p2p-table__sell-btn');
      if (btn) {
        e.__p2pTradeHandled = true;
        safeOpenTradeModalFromRow(btn.closest('.p2p-table__row'), btn);
        return;
      }
      const row = e.target.closest('.p2p-table__row');
      if (!row) return;
      if (e.target.closest('button')) return;
      if (activeProfileRow === row && document.querySelector('.p2p-profile-popover')) {
        closeP2pProfileModal();
        return;
      }
      openP2pProfileModal(row);
    });

    tableBody.addEventListener('click', e => {
      const row = e.target.closest('.p2p-table__row');
      if (!row || e.target.closest('button')) return;
      document.querySelectorAll('.p2p-table__row').forEach(r => {
        r.style.background = '';
      });
      row.style.background = '#f0faf6';
      setTimeout(() => {
        row.style.background = '';
      }, 800);
    });
  }

  const p2pSellerProfileEl = document.getElementById('p2pSellerProfile');
  if (p2pSellerProfileEl) {
    p2pSellerProfileEl.addEventListener('click', e => {
      const revBtn = e.target.closest('.p2p-seller-reviews__filter');
      if (revBtn && p2pSellerProfileEl.contains(revBtn)) {
        const f = revBtn.getAttribute('data-review-filter');
        if (f === 'good' || f === 'bad') {
          void loadSellerReviewsList(f);
        }
        return;
      }
      const tab = e.target.closest('.p2p-seller-profile__tab');
      if (tab && p2pSellerProfileEl.contains(tab)) {
        const adsTab = document.getElementById('sellerTabAds');
        const ratingTab = document.getElementById('sellerTabRating');
        const adsPanel = document.getElementById('sellerPanelAds');
        const ratingPanel = document.getElementById('sellerPanelRating');
        if (adsTab && ratingTab && adsPanel && ratingPanel) {
          const isAds = tab === adsTab;
          adsTab.classList.toggle('p2p-seller-profile__tab--active', isAds);
          ratingTab.classList.toggle('p2p-seller-profile__tab--active', !isAds);
          adsTab.setAttribute('aria-selected', isAds ? 'true' : 'false');
          ratingTab.setAttribute('aria-selected', isAds ? 'false' : 'true');
          adsPanel.hidden = !isAds;
          ratingPanel.hidden = isAds;
          if (!isAds) void loadSellerReviewsList(sellerReviewsActiveFilter || 'good');
        }
        return;
      }
      const btn = e.target.closest('.p2p-table__buy-btn, .p2p-table__sell-btn');
      if (btn) {
        const offerRow = document.getElementById('sellerProfileOfferRow');
        if (offerRow) safeOpenTradeModalFromRow(offerRow, btn);
        return;
      }
      const link = e.target.closest('.p2p-seller-profile__link-action');
      if (link) {
        e.preventDefault();
        showToast(link.textContent.trim(), '#f7a600');
      }
    });
    document.getElementById('sellerProfileSubscribe')?.addEventListener('click', () => {
      showToast('Подписка на продавца', '#1e2026');
    });
    document.getElementById('sellerProfileStatsScroll')?.addEventListener('click', () => {
      openSellerMoreDataModal();
    });
    document.getElementById('sellerMoreDataClose')?.addEventListener('click', closeSellerMoreDataModal);
    document.getElementById('sellerMoreDataOk')?.addEventListener('click', closeSellerMoreDataModal);
    document.getElementById('sellerMoreDataModal')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) closeSellerMoreDataModal();
    });
  }

  // Fallback for hosting/runtime edge-cases where table listeners fail to bind.
  document.addEventListener('click', (e) => {
    if (e.__p2pTradeHandled) return;
    const btn = e.target.closest?.('.p2p-table__buy-btn, .p2p-table__sell-btn');
    if (!btn) return;
    const row = btn.closest('.p2p-table__row') || document.getElementById('sellerProfileOfferRow');
    if (!row) return;
    safeOpenTradeModalFromRow(row, btn);
  });

  const warnLink = document.querySelector('.p2p-warn__link');
  if (warnLink) {
    warnLink.addEventListener('click', () => {
      showToast('Правила безопасности P2P-торговли', '#f7a600');
    });
  }

  document.body.addEventListener('click', (e) => {
    const copyBtn = e.target.closest('.p2p-order-room__copy');
    if (!copyBtn || !document.getElementById('p2pOrderRoom')?.contains(copyBtn)) return;
    const dd = copyBtn.closest('dd');
    const valEl = dd?.querySelector('.p2p-order-room__val');
    const text = valEl?.textContent?.trim();
    if (text && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text.replace(/\u00a0/g, ' ')).then(() => showToast('Скопировано', '#2ebd85'));
    }
  });

  document.body.addEventListener('click', (e) => {
    const t = e.target.closest('.p2p-order-room__faq-toggle');
    if (!t || !document.getElementById('p2pOrderRoom')?.contains(t)) return;
    const wrap = t.closest('.p2p-order-room__faq');
    const ans = wrap?.querySelector('.p2p-order-room__faq-answer');
    const open = !t.classList.contains('is-open');
    t.classList.toggle('is-open', open);
    t.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (ans) ans.hidden = !open;
  });

  document.body.addEventListener('click', (e) => {
    const t = e.target.closest('.p2p-order-room__more-toggle');
    if (!t || !document.getElementById('p2pOrderRoom')?.contains(t)) return;
    const panel = document.getElementById('p2pOrderMorePanel');
    const open = !t.classList.contains('is-open');
    t.classList.toggle('is-open', open);
    t.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (panel) panel.hidden = !open;
  });

  function fillP2pConfirmPayModal() {
    const cached = p2pOrderRoomSessionCache?.detail;
    const userName =
      (cached && cached.userName) ||
      document.getElementById('p2pOrderSellerNick')?.textContent?.trim() ||
      '';
    const pm =
      (cached && cached.paymentMethod) ||
      '';
    const norm = normalizeP2pOrderDetail(
      cached || { userName, paymentMethod: pm }
    );
    const methodEl = document.getElementById('p2pConfirmPayMethod');
    if (methodEl) methodEl.textContent = formatP2pConfirmPayMethodDisplay(norm.paymentMethod);
    const fn = document.getElementById('p2pConfirmPayFullName');
    if (fn) fn.textContent = norm.sellerLegalName || userName || '—';
    const bankEl = document.getElementById('p2pConfirmPayBank');
    if (bankEl) bankEl.textContent = norm.payBank || '—';
    const cardEl = document.getElementById('p2pConfirmPayCard');
    if (cardEl) cardEl.textContent = norm.payCard || '—';
    const phoneEl = document.getElementById('p2pConfirmPayPhone');
    if (phoneEl) phoneEl.textContent = norm.payPhone || '—';
  }

  function syncP2pConfirmPaySubmitState() {
    const c1 = document.getElementById('p2pConfirmPayCheck1')?.checked;
    const c2 = document.getElementById('p2pConfirmPayCheck2')?.checked;
    const btn = document.getElementById('p2pConfirmPaySubmit');
    if (btn) btn.disabled = !(c1 && c2);
  }

  function handleP2pConfirmPayFilesChange() {
    const input = document.getElementById('p2pConfirmPayFiles');
    const listEl = document.getElementById('p2pConfirmPayFileList');
    if (!input) return;
    const maxBytes = 100 * 1024 * 1024;
    const all = Array.from(input.files || []);
    const valid = [];
    for (const f of all) {
      if (valid.length >= 2) break;
      if (!f.type.startsWith('image/')) {
        showToast('Допустимы только изображения', '#e74c3c');
        continue;
      }
      if (f.size > maxBytes) {
        showToast('Файл больше 100 МБ', '#e74c3c');
        continue;
      }
      valid.push(f);
    }
    const dt = new DataTransfer();
    valid.forEach((f) => dt.items.add(f));
    input.files = dt.files;
    if (listEl) {
      if (valid.length) {
        listEl.hidden = false;
        listEl.textContent = valid.map((f) => f.name).join(', ');
      } else {
        listEl.hidden = true;
        listEl.textContent = '';
      }
    }
  }

  function openP2pConfirmPayModal() {
    const modal = document.getElementById('p2pConfirmPayModal');
    if (!modal) return;
    fillP2pConfirmPayModal();
    const c1 = document.getElementById('p2pConfirmPayCheck1');
    const c2 = document.getElementById('p2pConfirmPayCheck2');
    if (c1) c1.checked = false;
    if (c2) c2.checked = false;
    const fileInput = document.getElementById('p2pConfirmPayFiles');
    if (fileInput) fileInput.value = '';
    const listEl = document.getElementById('p2pConfirmPayFileList');
    if (listEl) {
      listEl.hidden = true;
      listEl.textContent = '';
    }
    syncP2pConfirmPaySubmitState();
    modal.hidden = false;
    modal.removeAttribute('aria-hidden');
  }

  function closeP2pConfirmPayModal() {
    const modal = document.getElementById('p2pConfirmPayModal');
    if (!modal) return;
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
  }

  function openP2pNotPaidHintModal() {
    const modal = document.getElementById('p2pNotPaidHintModal');
    if (!modal) return;
    modal.hidden = false;
    modal.removeAttribute('aria-hidden');
  }

  function closeP2pNotPaidHintModal() {
    const modal = document.getElementById('p2pNotPaidHintModal');
    if (!modal) return;
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
  }

  function setP2pOrderRoomLeftMode(mode) {
    const left = document.querySelector('.p2p-order-room__left');
    const cancelled = document.getElementById('p2pOrderCancelledPanel');
    if (!left || !cancelled) return;
    const baseBlocks = left.querySelectorAll(
      '.p2p-order-room__status-head, .p2p-order-room__banner, .p2p-order-room__trade-title, .p2p-order-room__stepper, .p2p-order-room__cta-row'
    );
    const isCancelled = mode === 'cancelled';
    left.classList.toggle('p2p-order-room__left--cancelled', isCancelled);
    baseBlocks.forEach((el) => {
      el.hidden = isCancelled;
      el.setAttribute('aria-hidden', isCancelled ? 'true' : 'false');
    });
    cancelled.hidden = !isCancelled;
    cancelled.setAttribute('aria-hidden', isCancelled ? 'false' : 'true');
  }

  function fillP2pCancelledPanel(reasonText) {
    const readText = (id) => document.getElementById(id)?.textContent?.trim() || '—';
    const coin = document.querySelector('.p2p-order-room__trade-coin')?.textContent?.trim() || 'USDT';
    const side = document.querySelector('.p2p-order-room__trade-verb')?.textContent?.trim() || 'Покупка';
    const descEl = document.getElementById('p2pOrderCancelledDesc');
    const tradeEl = document.getElementById('p2pOrderCancelledTrade');
    if (descEl) {
      const reasonPart = reasonText ? `следующую причину отмены: ${reasonText}.` : 'причину отмены.';
      descEl.textContent = `Ордер отменен, потому что вы выбрали ${reasonPart} У продавца есть 10 минут, чтобы проверить причину отмены ордера.`;
    }
    if (tradeEl) {
      tradeEl.innerHTML = `<span class="p2p-order-cancelled__trade-verb">${esc(side)}</span> <span class="p2p-order-cancelled__trade-coin">${esc(coin)}</span>`;
    }
    const map = [
      ['p2pOrderCancelledFiat', 'p2pOrderFiat'],
      ['p2pOrderCancelledPrice', 'p2pOrderPrice'],
      ['p2pOrderCancelledCrypto', 'p2pOrderCrypto'],
      ['p2pOrderCancelledNo', 'p2pOrderNo'],
      ['p2pOrderCancelledTime', 'p2pOrderTime']
    ];
    map.forEach(([targetId, sourceId]) => {
      const targetEl = document.getElementById(targetId);
      if (targetEl) targetEl.textContent = readText(sourceId);
    });
  }

  function openP2pCancelReasonModal() {
    const modal = document.getElementById('p2pCancelReasonModal');
    if (!modal) return;
    const selected = modal.querySelector('input[name="p2pCancelReason"]:checked');
    if (selected) selected.checked = false;
    const check = document.getElementById('p2pCancelReasonConfirmCheck');
    if (check) check.checked = false;
    syncP2pCancelReasonSubmitState();
    modal.hidden = false;
    modal.removeAttribute('aria-hidden');
  }

  function closeP2pCancelReasonModal() {
    const modal = document.getElementById('p2pCancelReasonModal');
    if (!modal) return;
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
  }

  function syncP2pCancelReasonSubmitState() {
    const yesBtn = document.getElementById('p2pCancelReasonYes');
    const check = document.getElementById('p2pCancelReasonConfirmCheck');
    const selected = document.querySelector('input[name="p2pCancelReason"]:checked');
    if (!yesBtn) return;
    yesBtn.disabled = !(selected && check && check.checked);
  }

  document.getElementById('p2pOrderBtnPaid')?.addEventListener('click', () => {
    openP2pConfirmPayModal();
  });

  document.getElementById('p2pConfirmPayClose')?.addEventListener('click', closeP2pConfirmPayModal);
  document.getElementById('p2pConfirmPayNotPaid')?.addEventListener('click', () => {
    closeP2pConfirmPayModal();
    openP2pNotPaidHintModal();
  });
  document.getElementById('p2pNotPaidHintClose')?.addEventListener('click', closeP2pNotPaidHintModal);
  document.getElementById('p2pNotPaidHintConfirm')?.addEventListener('click', () => {
    closeP2pNotPaidHintModal();
    openP2pCancelReasonModal();
  });
  document.getElementById('p2pNotPaidHintModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'p2pNotPaidHintModal') {
      closeP2pNotPaidHintModal();
    }
  });
  document.getElementById('p2pCancelReasonClose')?.addEventListener('click', closeP2pCancelReasonModal);
  document.getElementById('p2pCancelReasonNo')?.addEventListener('click', closeP2pCancelReasonModal);
  document.getElementById('p2pCancelReasonYes')?.addEventListener('click', () => {
    const selectedReason = document.querySelector('input[name="p2pCancelReason"]:checked');
    const selectedReasonText = selectedReason?.closest('label')?.querySelector('span')?.textContent?.trim() || '';
    closeP2pCancelReasonModal();
    clearP2pOrderRoomCountdown();
    fillP2pCancelledPanel(selectedReasonText);
    setP2pOrderRoomLeftMode('cancelled');
    setP2pOrderChatSystemText(true);
    showToast('Ордер отменен', '#f7a600');
  });
  document.getElementById('p2pCancelReasonConfirmCheck')?.addEventListener('change', syncP2pCancelReasonSubmitState);
  document.querySelectorAll('input[name="p2pCancelReason"]').forEach((input) => {
    input.addEventListener('change', syncP2pCancelReasonSubmitState);
  });
  document.getElementById('p2pCancelReasonModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'p2pCancelReasonModal') {
      closeP2pCancelReasonModal();
    }
  });
  document.getElementById('p2pConfirmPayModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'p2pConfirmPayModal') {
      closeP2pConfirmPayModal();
      return;
    }
    const copyBtn = e.target.closest('.p2p-confirm-pay__copy');
    if (!copyBtn) return;
    const id = copyBtn.getAttribute('data-copy-target');
    const el = id && document.getElementById(id);
    const text = el?.textContent?.trim();
    if (text && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text.replace(/\u00a0/g, ' ')).then(() => showToast('Скопировано', '#2ebd85'));
    }
  });
  document.getElementById('p2pConfirmPayUploadBtn')?.addEventListener('click', () => {
    document.getElementById('p2pConfirmPayFiles')?.click();
  });
  document.getElementById('p2pConfirmPayFiles')?.addEventListener('change', handleP2pConfirmPayFilesChange);
  document.getElementById('p2pConfirmPayCheck1')?.addEventListener('change', syncP2pConfirmPaySubmitState);
  document.getElementById('p2pConfirmPayCheck2')?.addEventListener('change', syncP2pConfirmPaySubmitState);
  document.getElementById('p2pConfirmPaySubmit')?.addEventListener('click', () => {
    closeP2pConfirmPayModal();
    showToast('Отмечено: платёж выполнен', '#2ebd85');
  });

  document.getElementById('p2pOrderBtnCancel')?.addEventListener('click', () => {
    goToP2pStartScreen();
  });

  document.body.addEventListener('click', (e) => {
    const btn = e.target.closest('.p2p-order-room__trading-help');
    if (!btn || !document.getElementById('p2pOrderRoom')?.contains(btn)) return;
    showToast('Служба поддержки P2P', '#f7a600');
  });

  function persistP2pOrderChatLogEntry(logEntry) {
    if (!logEntry || !p2pOrderRoomSessionCache) return;
    if (!Array.isArray(p2pOrderRoomSessionCache.chatLog)) p2pOrderRoomSessionCache.chatLog = [];
    p2pOrderRoomSessionCache.chatLog.push(logEntry);
    if (!saveP2pOrderRoomSession(p2pOrderRoomSessionCache)) {
      showToast('Чат слишком большой для сохранения в браузере', '#e74c3c');
      p2pOrderRoomSessionCache.chatLog.pop();
    }
  }

  function appendChatMessage(body, contentHtml, logEntry) {
    const msg = document.createElement('div');
    msg.className = 'p2p-order-room__msg p2p-order-room__msg--me';
    msg.innerHTML = `<img class="p2p-order-room__msg-status" src="img/read-logo.svg" width="18" height="11" alt="" aria-hidden="true"><div class="p2p-order-room__bubble">${contentHtml}</div>`;
    body.appendChild(msg);
    body.scrollTop = body.scrollHeight;
    if (logEntry) persistP2pOrderChatLogEntry(logEntry);
  }

  function appendServerChatMessage(body, contentHtml, logEntry) {
    const msg = document.createElement('div');
    msg.className = 'p2p-order-room__msg p2p-order-room__msg--incoming';
    const avatar = document.createElement('div');
    avatar.className = 'p2p-order-room__msg-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    const headAv = document.getElementById('p2pOrderChatAvatar');
    if (headAv) {
      const ch = (headAv.textContent || '').trim().charAt(0);
      avatar.textContent = ch ? ch.toUpperCase() : '?';
      const bg = headAv.style.background || headAv.style.backgroundColor;
      if (bg) {
        avatar.style.background = bg;
      } else {
        avatar.style.background = getComputedStyle(headAv).backgroundColor || '#000';
      }
    } else {
      avatar.textContent = '?';
    }
    const bubble = document.createElement('div');
    bubble.className = 'p2p-order-room__bubble';
    bubble.innerHTML = contentHtml;
    msg.appendChild(avatar);
    msg.appendChild(bubble);
    body.appendChild(msg);
    body.scrollTop = body.scrollHeight;
    if (logEntry) persistP2pOrderChatLogEntry(logEntry);
  }

  function sendChatTextMessage() {
    const input = document.getElementById('p2pOrderChatInput');
    const body = document.getElementById('p2pOrderChatBody');
    if (!input || !body) return;
    const v = input.value.trim();
    if (!v) return;
    appendChatMessage(body, esc(v), { kind: 'me_text', text: v });
    input.value = '';
    if (window.p2pChatSocket && window.p2pChatSocket.connected) {
      console.log('Отправляю chat_message:', v);
      window.p2pChatSocket.emit('chat_message', { text: v });
    } else {
      console.error('Socket не подключен!');
    }
  }

  function getP2pChatSocketUrl() {
    if (typeof window.__CHAT_SOCKET_URL__ === 'string' && window.__CHAT_SOCKET_URL__.trim()) {
      return window.__CHAT_SOCKET_URL__.trim();
    }
    const meta = document.querySelector('meta[name="p2p-chat-socket-url"]');
    const fromMeta = meta && meta.getAttribute('content');
    if (fromMeta != null && String(fromMeta).trim()) {
      return String(fromMeta).trim();
    }
    const h = typeof location !== 'undefined' ? location.hostname : '';
    if (h === 'localhost' || h === '127.0.0.1') {
      return 'http://127.0.0.1:5000';
    }
    return typeof location !== 'undefined' ? location.origin : 'http://127.0.0.1:5000';
  }

  function ensureP2pChatSocket() {
    if (window.p2pChatSocket || typeof io === 'undefined') return;
    const url = getP2pChatSocketUrl();
    try {
      const s = io(url, {
        transports: ['websocket', 'polling'],
        reconnection: false
      });
      
      s.on('connect', () => {
        updateChatStatus('connected', 'Подключен к чату');
        console.log('Socket.IO подключен, отправляю user_connect...');
        
        // При подключении создаем чат для пользователя
        if (IS_ORDER_ROOM_PAGE) {
          // Получаем данные оффера из URL или страницы
          const offerData = getCurrentOfferData();
          console.log('Данные оффера:', offerData);
          
          const userConnectData = {
            userId: generateUserId(),
            userName: 'Пользователь',
            userAvatar: 'П',
            offerId: offerData.id || 'offer_' + Date.now(),
            offerName: offerData.name || 'Оффер',
            amount: offerData.amount || '0',
            price: offerData.price || '0',
            status: 'active',
            createdAt: new Date().toISOString()
          };
          
          console.log('Отправляю user_connect:', userConnectData);
          s.emit('user_connect', userConnectData);
        }
      });
      
      s.on('disconnect', () => {
        updateChatStatus('disconnected', 'Отключен от чата');
      });
      
      s.on('connect_error', (error) => {
        updateChatStatus('error', `Ошибка: ${error.message}`);
      });
      
      s.on('chat_reply', data => {
        const body = document.getElementById('p2pOrderChatBody');
        const t = data && typeof data.text === 'string' ? data.text : '';
        if (!body || !t) return;
        appendServerChatMessage(body, esc(t), { kind: 'them_text', text: t });
      });
      
      window.p2pChatSocket = s;
      
      // Добавляем обработчики для индикатора печатания
      setupTypingIndicator(s);
    } catch (_) {}
  }
  
  function getCurrentOfferData() {
    console.log('Получаю данные оффера...');
    
    // Пытаемся получить данные оффера из URL или элементов страницы
    const urlParams = new URLSearchParams(window.location.search);
    const offerId = urlParams.get('offerId') || 'default_offer';
    console.log('offerId из URL:', offerId);
    
    // Получаем данные из элементов на странице order-room.html
    const tradeTitleEl = document.getElementById('p2pOrderRoomTradeTitle');
    const fiatAmountEl = document.getElementById('p2pOrderFiat');
    const orderNoEl = document.getElementById('p2pOrderNo');
    
    console.log('Найденные элементы:');
    console.log('- tradeTitleEl:', tradeTitleEl);
    console.log('- fiatAmountEl:', fiatAmountEl);
    console.log('- orderNoEl:', orderNoEl);
    
    if (tradeTitleEl) {
      console.log('- tradeTitleEl.textContent:', tradeTitleEl.textContent);
    }
    if (fiatAmountEl) {
      console.log('- fiatAmountEl.textContent:', fiatAmountEl.textContent);
    }
    if (orderNoEl) {
      console.log('- orderNoEl.textContent:', orderNoEl.textContent);
    }
    
    // Формируем название оффера
    let offerName = 'Оффер';
    if (tradeTitleEl) {
      offerName = tradeTitleEl.textContent.trim();
    }
    
    // Получаем сумму
    let amount = '0';
    if (fiatAmountEl) {
      amount = fiatAmountEl.textContent.trim();
    }
    
    // Генерируем цену на основе данных (в реальном проекте это будет из API)
    const price = '78.50'; // Примерная цена
    
    const result = {
      id: orderNoEl ? orderNoEl.textContent.trim() : offerId,
      name: offerName,
      amount: amount,
      price: price
    };
    
    console.log('Результат getCurrentOfferData:', result);
    return result;
  }
  
  function generateUserId() {
    // Генерируем уникальный ID пользователя
    const storedId = sessionStorage.getItem('p2p_user_id');
    if (storedId) return storedId;
    
    const newId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    sessionStorage.setItem('p2p_user_id', newId);
    return newId;
  }
  
  function updateChatStatus(status, message) {
    const statusEl = document.getElementById('chatStatusText');
    if (statusEl) {
      statusEl.textContent = message;
      
      // Меняем цвет в зависимости от статуса
      const statusContainer = document.getElementById('chatStatus');
      if (statusContainer) {
        if (status === 'connected') {
          statusContainer.style.color = '#28a745';
        } else if (status === 'disconnected') {
          statusContainer.style.color = '#dc3545';
        } else if (status === 'error') {
          statusContainer.style.color = '#ffc107';
        }
      }
    }
    console.log(`Статус чата: ${status} - ${message}`);
  }
  
  function setupTypingIndicator(socket) {
    const inputEl = document.getElementById('p2pOrderChatInput');
    if (!inputEl) return;
    
    let typingTimeout = null;
    let isTyping = false;
    
    inputEl.addEventListener('input', () => {
      if (!isTyping) {
        isTyping = true;
        socket.emit('user_typing', {});
      }
      
      clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => {
        isTyping = false;
        socket.emit('user_stop_typing', {});
      }, 1000);
    });
    
    inputEl.addEventListener('blur', () => {
      if (isTyping) {
        isTyping = false;
        socket.emit('user_stop_typing', {});
      }
    });
  }

  document.getElementById('p2pOrderChatSend')?.addEventListener('click', sendChatTextMessage);

  document.getElementById('p2pOrderChatInput')?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.shiftKey) return;
    e.preventDefault();
    sendChatTextMessage();
  });

  document.getElementById('p2pOrderChatAttach')?.addEventListener('click', () => {
    document.getElementById('p2pOrderChatPhotoInput')?.click();
  });

  document.getElementById('p2pOrderChatPhotoInput')?.addEventListener('change', (e) => {
    const input = e.currentTarget;
    const body = document.getElementById('p2pOrderChatBody');
    if (!input || !body) return;
    const file = input.files?.[0];
    if (!file) return;
    if (!file.type || !file.type.startsWith('image/')) {
      showToast('Можно прикрепить только изображение', '#e74c3c');
      input.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const src = reader.result;
      if (typeof src !== 'string') return;
      appendChatMessage(
        body,
        `<img class="p2p-order-room__chat-photo" src="${src}" alt="${esc(file.name || 'Фото')}">`,
        { kind: 'me_img', src, alt: file.name || 'Фото' }
      );
      
      // Отправляем фото на сервер через Socket.IO
      if (window.p2pChatSocket && window.p2pChatSocket.connected) {
        console.log('Отправляю фото на сервер:', file.name);
        window.p2pChatSocket.emit('chat_photo', {
          imageData: src,
          fileName: file.name || 'photo.jpg',
          fileType: file.type || 'image/jpeg'
        });
      } else {
        console.error('Socket не подключен! Фото не отправлено на сервер.');
      }
      
      input.value = '';
    };
    reader.onerror = () => {
      showToast('Не удалось загрузить фото', '#e74c3c');
      input.value = '';
    };
    reader.readAsDataURL(file);
  });

  document.querySelector('.header__logo')?.addEventListener('click', (e) => {
    if (IS_INDEX_PAGE) {
      e.preventDefault();
      goToP2pStartScreen();
      return;
    }
    try {
      clearP2pSellerViewPersist();
      setP2pMarketPreferred();
      clearP2pOrderRoomSession();
    } catch (_) {}
    window.location.href = 'index.html';
  });

  document.querySelectorAll('.subnav__dropdown-wrap').forEach(wrap => {
    const btn = wrap.querySelector('.subnav__dropdown-trigger');
    const panel = wrap.querySelector('.subnav__dropdown-panel');
    if (!btn || !panel) return;

    const clampSubnavPanel = () => {
      panel.style.left = '';
      requestAnimationFrame(() => {
        const r = panel.getBoundingClientRect();
        const m = 12;
        let leftPx = 0;
        if (r.right > window.innerWidth - m) {
          leftPx += window.innerWidth - m - r.right;
        }
        if (r.left + leftPx < m) {
          leftPx += m - (r.left + leftPx);
        }
        panel.style.left = leftPx !== 0 ? `${leftPx}px` : '';
      });
    };

    const open = () => {
      document.querySelectorAll('.subnav__dropdown-trigger').forEach(b => {
        b.setAttribute('aria-expanded', b === btn ? 'true' : 'false');
      });
      clampSubnavPanel();
    };
    const close = () => {
      btn.setAttribute('aria-expanded', 'false');
      panel.style.left = '';
    };

    wrap.addEventListener('mouseenter', open);
    wrap.addEventListener('mouseleave', close);

    btn.addEventListener('mousedown', e => {
      e.preventDefault();
    });
    btn.addEventListener('click', e => {
      e.preventDefault();
    });
  });

  const sliderTrack = document.getElementById('sliderTrack');
  const sliderPrev  = document.getElementById('sliderPrev');
  const sliderNext  = document.getElementById('sliderNext');
  const sliderDots  = document.querySelectorAll('.p2p-slider__dot');

  if (sliderTrack && sliderPrev && sliderNext) {
    const total = sliderTrack.children.length;
    let current = 0;

    function updateArrows() {
      sliderPrev.disabled = current === 0;
      sliderNext.disabled = current === total - 1;
    }

    function goTo(idx) {
      const next = Math.max(0, Math.min(idx, total - 1));
      if (next === current) return;

      current = next;
      sliderTrack.style.transform = `translateX(-${current * 100}%)`;
      sliderDots.forEach((d, i) => {
        d.classList.toggle('p2p-slider__dot--active', i === current);
      });
      updateArrows();
    }

    sliderPrev.addEventListener('click', () => goTo(current - 1));
    sliderNext.addEventListener('click', () => goTo(current + 1));

    sliderDots.forEach(dot => {
      dot.addEventListener('click', () => goTo(Number(dot.dataset.slide)));
    });


    updateArrows();
  }

  const navList = document.querySelector('.nav__list');
  if (navList) {
    const indicator = document.createElement('span');
    indicator.className = 'nav__indicator';
    navList.appendChild(indicator);

    const items = navList.querySelectorAll('.nav__item:not(.nav__item--mnt)');
    function moveIndicator(el) {
      const listRect = navList.getBoundingClientRect();
      const rect = el.getBoundingClientRect();
      indicator.style.left = rect.left - listRect.left + 'px';
      indicator.style.width = rect.width + 'px';
      indicator.style.opacity = '1';
    }
    items.forEach(item => {
      item.addEventListener('mouseenter', () => moveIndicator(item));
    });
    navList.querySelector('.nav__item--mnt')?.addEventListener('mouseenter', () => {
      indicator.style.opacity = '0';
    });
    navList.addEventListener('mouseleave', () => {
      indicator.style.opacity = '0';
    });
  }

  function layoutMobileFabsBottomRight() {
    const alarm = document.getElementById('mobileMenuAlarmFab');
    const support = document.getElementById('mobileMenuSupport');
    if (!alarm || !support) return;
    const margin = 10;
    const gap = 12;
    const w = alarm.offsetWidth || 44;
    const h = alarm.offsetHeight || 44;
    const left = Math.max(0, window.innerWidth - w - margin);
    const bottomPad = Math.max(margin, 0);
    const supportTop = Math.max(0, window.innerHeight - h - bottomPad);
    const alarmTop = Math.max(0, supportTop - gap - h);
    alarm.classList.add('header__fab--floating');
    support.classList.add('header__fab--floating');
    alarm.style.left = `${left}px`;
    alarm.style.top = `${alarmTop}px`;
    support.style.left = `${left}px`;
    support.style.top = `${supportTop}px`;
  }

  function setupMobileFabDrag(button) {
    if (!button) return;
    const MOVE_THRESHOLD_PX = 6;
    let dragActive = false;
    let dragMoved = false;
    let startClientX = 0;
    let startClientY = 0;
    let startLeft = 0;
    let startTop = 0;

    function clampPos(left, top) {
      const w = button.offsetWidth;
      const h = button.offsetHeight;
      const maxL = Math.max(0, window.innerWidth - w);
      const maxT = Math.max(0, window.innerHeight - h);
      return {
        left: Math.min(Math.max(0, left), maxL),
        top: Math.min(Math.max(0, top), maxT),
      };
    }

    function applyPos(left, top) {
      const c = clampPos(left, top);
      button.style.left = `${c.left}px`;
      button.style.top = `${c.top}px`;
    }

    function onPointerDown(e) {
      if (e.button !== 0) return;
      dragActive = true;
      dragMoved = false;
      startClientX = e.clientX;
      startClientY = e.clientY;
      const r = button.getBoundingClientRect();
      startLeft = r.left;
      startTop = r.top;
      try {
        button.setPointerCapture(e.pointerId);
      } catch (_) {}
      button.classList.add('header__fab--dragging');
    }

    function onPointerMove(e) {
      if (!dragActive) return;
      const dx = e.clientX - startClientX;
      const dy = e.clientY - startClientY;
      if (!dragMoved && (Math.abs(dx) > MOVE_THRESHOLD_PX || Math.abs(dy) > MOVE_THRESHOLD_PX)) {
        dragMoved = true;
      }
      if (dragMoved) {
        e.preventDefault();
        applyPos(startLeft + dx, startTop + dy);
      }
    }

    function finishPointer(e) {
      if (!dragActive) return;
      const didDrag = dragMoved;
      dragActive = false;
      try {
        if (typeof button.hasPointerCapture === 'function' && button.hasPointerCapture(e.pointerId)) {
          button.releasePointerCapture(e.pointerId);
        }
      } catch (_) {}
      button.classList.remove('header__fab--dragging');
      if (didDrag) {
        applyPos(startLeft + (e.clientX - startClientX), startTop + (e.clientY - startClientY));
        button.addEventListener(
          'click',
          (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
          },
          { capture: true, once: true }
        );
      }
      dragMoved = false;
    }

    button.addEventListener('pointerdown', onPointerDown);
    button.addEventListener('pointermove', onPointerMove);
    button.addEventListener('pointerup', finishPointer);
    button.addEventListener('pointercancel', finishPointer);

    window.addEventListener('resize', () => {
      const r = button.getBoundingClientRect();
      applyPos(r.left, r.top);
    });
  }

  const mobileMenuAlarmFab = document.getElementById('mobileMenuAlarmFab');
  const mobileMenuSupport = document.getElementById('mobileMenuSupport');
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      layoutMobileFabsBottomRight();
      setupMobileFabDrag(mobileMenuAlarmFab);
      setupMobileFabDrag(mobileMenuSupport);
    });
  });

  const burgerBtn = document.querySelector('.header__burger');
  const mobileMenu = document.getElementById('mobileMenu');
  const mobileMenuNav = document.getElementById('mobileMenuNav');
  const desktopNavList = document.querySelector('.header__nav .nav__list');
  const menuCloseBtn = mobileMenu?.querySelector('.mobile-menu__close');
  const menuBackdrop = mobileMenu?.querySelector('.mobile-menu__backdrop');
  const burgerMq = window.matchMedia('(max-width: 1335px)');
  const mobileNavMq = window.matchMedia('(max-width: 875px)');
  let mobileNavBuilt = false;

  function clearMobileMenuNav() {
    if (!mobileMenuNav) return;
    mobileMenuNav.innerHTML = '';
    mobileNavBuilt = false;
  }

  function buildMobileMenuNav() {
    if (!mobileNavMq.matches) {
      clearMobileMenuNav();
      return;
    }
    if (mobileNavBuilt || !mobileMenuNav || !desktopNavList) return;
    mobileMenuNav.innerHTML = desktopNavList.innerHTML;
    mobileMenuNav.querySelector('.nav__indicator')?.remove();

    const mntLink = mobileMenuNav.querySelector('.nav__item--mnt .nav__link');
    if (mntLink) {
      mntLink.textContent = 'MNT';
      mntLink.classList.remove('nav__mnt-link');
    }

    mobileMenuNav.querySelectorAll('.nav__item').forEach((item, index) => {
      const topLink = item.querySelector(':scope > .nav__link');
      if (topLink) {
        topLink.addEventListener('click', closeMobileMenu);
      }

      const trigger = item.querySelector(':scope > .nav__trigger');
      const dropdown = item.querySelector(':scope > .nav__dropdown');
      if (!trigger || !dropdown) return;

      const dropdownId = `mobileDropdown${index}`;
      dropdown.id = dropdownId;
      trigger.setAttribute('role', 'button');
      trigger.setAttribute('tabindex', '0');
      trigger.setAttribute('aria-controls', dropdownId);
      trigger.setAttribute('aria-expanded', 'false');

      const toggle = () => {
        const willOpen = !item.classList.contains('nav__item--open');
        mobileMenuNav.querySelectorAll('.nav__item--open').forEach(openItem => {
          openItem.classList.remove('nav__item--open');
          const openTrigger = openItem.querySelector(':scope > .nav__trigger');
          openTrigger?.setAttribute('aria-expanded', 'false');
        });

        item.classList.toggle('nav__item--open', willOpen);
        trigger.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
      };

      trigger.addEventListener('click', toggle);
      trigger.addEventListener('keydown', e => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        toggle();
      });
    });

    mobileMenuNav.querySelectorAll('.nav__dropdown .dropdown__row').forEach(link => {
      link.addEventListener('click', closeMobileMenu);
    });

    mobileNavBuilt = true;
  }

  function closeMobileMenu() {
    if (!mobileMenu || !burgerBtn) return;
    mobileMenuNav?.querySelectorAll('.nav__item--open').forEach(openEl => {
      openEl.classList.remove('nav__item--open');
      openEl.querySelector(':scope > .nav__trigger')?.setAttribute('aria-expanded', 'false');
    });
    mobileMenu.classList.remove('is-open');
    mobileMenu.setAttribute('aria-hidden', 'true');
    burgerBtn.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('page--menu-open');
  }

  function openMobileMenu() {
    if (!mobileMenu || !burgerBtn || !burgerMq.matches) return;
    mobileMenu.classList.add('is-open');
    mobileMenu.setAttribute('aria-hidden', 'false');
    burgerBtn.setAttribute('aria-expanded', 'true');
    document.body.classList.add('page--menu-open');
    buildMobileMenuNav();
  }

  burgerBtn?.addEventListener('click', () => {
    if (mobileMenu?.classList.contains('is-open')) {
      closeMobileMenu();
      return;
    }
    openMobileMenu();
  });

  menuCloseBtn?.addEventListener('click', closeMobileMenu);
  menuBackdrop?.addEventListener('click', closeMobileMenu);

  const mobileMenuCopyUid = document.getElementById('mobileMenuCopyUid');
  const mobileMenuUid = document.getElementById('mobileMenuUid');
  mobileMenuCopyUid?.addEventListener('click', () => {
    const uid = mobileMenuUid?.textContent?.trim();
    if (!uid) return;
    navigator.clipboard?.writeText(uid).then(() => showToast('UID скопирован', '#2ebd85')).catch(() => {});
  });

  mobileMenu?.querySelectorAll('.mobile-menu__preset, .mobile-menu__account-cta, .mobile-menu__logout').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      closeMobileMenu();
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && mobileMenu?.classList.contains('is-open')) {
      e.preventDefault();
      closeMobileMenu();
    }
  });

  burgerMq.addEventListener('change', (e) => {
    if (!e.matches) {
      closeMobileMenu();
      clearMobileMenuNav();
    }
  });

  mobileNavMq.addEventListener('change', (e) => {
    if (!e.matches) {
      clearMobileMenuNav();
    } else if (mobileMenu?.classList.contains('is-open')) {
      mobileNavBuilt = false;
      buildMobileMenuNav();
    }
  });

  updateTitle();
  syncOrdersNavBadge();
  if (IS_PROFILE_PAGE) {
    void renderMarketPage(1)
      .then(() => {
        const body = document.getElementById('tableBody');
        if (!body) return;
        const savedU = getP2pSellerViewUsername();
        let row = null;
        if (savedU) row = findTableRowBySellerUsername(body, savedU);
        if (!row) row = body.querySelector('.p2p-table__row');
        if (!row) return;
        const profile = parseProfileFromP2pTableRow(row);
        if (profile) {
          const openTradeOnBoot = consumeOpenTradeOnProfileBootFlag();
          openP2pSellerProfileView(profile, row, { openTradeModal: openTradeOnBoot });
        }
      })
      .finally(() => {
        document.documentElement.classList.remove('p2p-boot-profile');
      });
  } else if (IS_ORDER_ROOM_PAGE) {
    void tryRestoreP2pOrderRoom();
    document.documentElement.classList.remove('p2p-boot-profile');
  } else if (!tryRestoreP2pOrderRoom()) {
    try {
      const nav0 = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
      if (nav0 && nav0.type === 'navigate') clearP2pMarketPreferred();
    } catch (_) {}
    void renderMarketPage(1)
      .then(() => {
        const body = document.getElementById('tableBody');
        if (!body) return;
        if (!isIndexAutoOpenDone()) {
          const firstRow = body.querySelector('.p2p-table__row');
          if (firstRow) {
            const firstProfile = parseProfileFromP2pTableRow(firstRow);
            if (firstProfile) {
              setIndexAutoOpenDone();
              openP2pSellerProfileView(firstProfile, firstRow, { openTradeModal: true });
              return;
            }
          }
        }
        const market = document.getElementById('p2pMarketView');
        const seller = document.getElementById('p2pSellerProfile');
        if (market) {
          market.hidden = false;
          market.setAttribute('aria-hidden', 'false');
        }
        if (seller) {
          seller.hidden = true;
          seller.setAttribute('aria-hidden', 'true');
        }
        document.querySelector('.p2p')?.classList.remove('p2p--seller-page');
      })
      .finally(() => {
        document.documentElement.classList.remove('p2p-boot-profile');
      });
  } else {
    document.documentElement.classList.remove('p2p-boot-profile');
  }

  const pagination = document.getElementById('p2pPagination');
  if (pagination) {
    let activePage = 1;

    function renderPagination() {
      activePage = activeMarketPage;
      const pageButtons = pagination.querySelectorAll('.p2p-pagination__btn:not(.p2p-pagination__prev):not(.p2p-pagination__next)');
      pageButtons.forEach((btn, i) => {
        const pageNum = i + 1;
        btn.dataset.page = pageNum;
        btn.textContent = pageNum;
        const visible = pageNum <= totalMarketPages;
        btn.style.display = visible ? '' : 'none';
        btn.classList.toggle('p2p-pagination__active', visible && pageNum === activePage);
      });
      const prevBtn = pagination.querySelector('.p2p-pagination__prev');
      const nextBtn = pagination.querySelector('.p2p-pagination__next');
      const prevDisabled = activePage <= 1;
      const nextDisabled = activePage >= totalMarketPages;
      prevBtn.style.opacity = prevDisabled ? '0.4' : '1';
      prevBtn.style.cursor = prevDisabled ? 'not-allowed' : 'pointer';
      nextBtn.style.opacity = nextDisabled ? '0.4' : '1';
      nextBtn.style.cursor = nextDisabled ? 'not-allowed' : 'pointer';
      prevBtn.classList.toggle('is-disabled', prevDisabled);
      nextBtn.classList.toggle('is-disabled', nextDisabled);
    }
    refreshPaginationUi = renderPagination;

    pagination.addEventListener('click', e => {
      const btn = e.target.closest('.p2p-pagination__btn');
      if (!btn) return;
      const page = btn.dataset.page;
      if (page === 'prev') {
        if (btn.classList.contains('is-disabled')) return;
        activePage = Math.max(1, activePage - 1);
      } else if (page === 'next') {
        if (btn.classList.contains('is-disabled')) return;
        activePage = Math.min(totalMarketPages, activePage + 1);
      } else {
        activePage = parseInt(page, 10);
      }
      if (activePage < 1 || activePage > totalMarketPages) return;
      activeMarketPage = activePage;
      renderPagination();
      renderMarketPage(activePage);
    });

    renderPagination();
  }
  
  // Инициализация чата при загрузке страницы order-room.html
  if (IS_ORDER_ROOM_PAGE) {
    // Ждем немного, чтобы DOM полностью загрузился
    setTimeout(() => {
      ensureP2pChatSocket();
    }, 1000);
    
    // Добавляем тестовую кнопку для отладки
    setTimeout(() => {
      const testButton = document.getElementById('testButton');
      if (testButton) {
        testButton.addEventListener('click', () => {
          console.log('=== ТЕСТОВАЯ КНОПКА ===');
          console.log('Текущие данные оффера:', getCurrentOfferData());
          console.log('Socket подключен?', window.p2pChatSocket && window.p2pChatSocket.connected);
          console.log('Socket:', window.p2pChatSocket);
          
          // Принудительно отправляем user_connect
          if (window.p2pChatSocket && window.p2pChatSocket.connected) {
            const offerData = getCurrentOfferData();
            window.p2pChatSocket.emit('user_connect', {
              userId: generateUserId(),
              userName: 'Тестовый пользователь',
              userAvatar: 'Т',
              offerId: offerData.id || 'test_offer_' + Date.now(),
              offerName: offerData.name || 'Тестовый оффер',
              amount: offerData.amount || '1000',
              price: offerData.price || '78.50',
              status: 'active',
              createdAt: new Date().toISOString()
            });
            console.log('Отправлен принудительный user_connect');
          }
        });
      }
    }, 2000);
  }
})();
