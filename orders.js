(function () {
  'use strict';

  const ORDER_SESSION_KEY = 'bybit_p2p_order_room_v1';
  const BADGE_KEY = 'bybit_p2p_orders_badge_v1';

  const tableBody = document.getElementById('ordersTableBody');
  const emptyEl = document.getElementById('ordersEmpty');
  const countEl = document.getElementById('ordersCount');
  const menuBadge = document.getElementById('ordersMenuBadge');
  const tabsWrap = document.getElementById('ordersTabs');
  const sidebarMenu = document.getElementById('ordersSidebarMenu');
  const sidebarToggleBtn = document.getElementById('ordersSidebarToggle');
  const sidebarCloseBtn = document.getElementById('ordersSidebarClose');
  const sidebarBackdrop = document.getElementById('ordersSidebarBackdrop');
  const statusToggle = document.getElementById('ordersStatusToggle');
  let activeView = 'listing';

  function readBadge() {
    try {
      const n = parseInt(sessionStorage.getItem(BADGE_KEY), 10);
      return Number.isFinite(n) && n > 0 ? n : 0;
    } catch (_) {
      return 0;
    }
  }

  function readOrderSession() {
    try {
      const raw = sessionStorage.getItem(ORDER_SESSION_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || !data.detail) return null;
      return data;
    } catch (_) {
      return null;
    }
  }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function render() {
    const orderSession = readOrderSession();
    const badge = readBadge();
    const hasOrder = !!(orderSession && orderSession.detail);

    if (menuBadge) {
      if (hasOrder || badge > 0) {
        menuBadge.textContent = String(Math.max(1, badge));
        menuBadge.hidden = false;
      } else {
        menuBadge.hidden = true;
      }
    }

    if (!tableBody || !emptyEl || !countEl) return;

    if (!hasOrder) {
      tableBody.innerHTML = '';
      emptyEl.style.display = 'block';
      emptyEl.textContent = activeView === 'all' ? 'Пока нет объявлений' : 'Пока нет объявлений';
      countEl.textContent = '0';
      return;
    }

    const d = orderSession.detail;
    const orderId = orderSession.orderId || '—';
    const pay = `${d.payRaw || '0'} ${d.payFiat || 'RUB'}`;
    const price = `${d.priceText || '—'} ${d.fiat || 'RUB'}`;
    const side = 'Продажа';
    const coin = d.coin || 'USDT';
    const method = d.paymentMethod || 'Bank Transfer';
    const totalAmount = `${d.receiveRaw || '0'} ${coin}`;
    const limits = `${d.payRaw || '0'} - ${d.payRaw || '0'} ${d.payFiat || 'RUB'}`;
    const orderTime = orderSession.timeStr || '';

    tableBody.innerHTML = `
      <div class="orders-screen__row">
        <span class="orders-screen__type">
          <span class="orders-screen__type-main">
            <strong class="orders-screen__type-side">${side}</strong>
            <span>${esc(coin)}</span>
          </span>
          <small class="orders-screen__subline">${esc(orderTime)}</small>
        </span>
        <span class="orders-screen__id-wrap">
          <span class="orders-screen__id-inline">
            <span class="orders-screen__mono orders-screen__id" data-order-id="${esc(orderId)}">${esc(orderId)}</span>
            <button type="button" class="orders-screen__copy-id" data-copy-id="${esc(orderId)}" aria-label="Копировать ID">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M8 4v12a2 2 0 002 2h8a2 2 0 002-2V7.8a2 2 0 00-.6-1.4l-2.8-2.8A2 2 0 0015.2 3H10a2 2 0 00-2 2z" stroke="currentColor" stroke-width="1.5"/>
                <path d="M6 8H5a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-1" stroke="currentColor" stroke-width="1.5"/>
              </svg>
            </button>
          </span>
        </span>
        <span>
          ${esc(totalAmount)}
          <small class="orders-screen__subline orders-screen__subline--dark">${esc(limits)}</small>
        </span>
        <span>${esc(price)}</span>
        <span>0%</span>
        <span><span class="orders-screen__pay-tag">${esc(method)}</span></span>
        <span class="orders-screen__status-cell">На листинге</span>
        <span class="orders-screen__actions">
          <button type="button" class="orders-screen__icon-btn" aria-label="Поделиться">
            <img src="img/share-order-logo.svg" width="12" height="12" alt="" aria-hidden="true">
          </button>
          <button type="button" class="orders-screen__icon-btn" aria-label="Изменить">
            <img src="img/edit-logo-order.svg" width="12" height="12" alt="" aria-hidden="true">
          </button>
          <button type="button" class="orders-screen__icon-btn" aria-label="Скачать">
            <img src="img/download-order-logo.svg" width="12" height="12" alt="" aria-hidden="true">
          </button>
        </span>
      </div>
    `;
    emptyEl.style.display = 'none';
    countEl.textContent = '1';
  }

  function setupTabs() {
    if (!tabsWrap) return;
    tabsWrap.addEventListener('click', (e) => {
      const btn = e.target.closest('.orders-screen__tab');
      if (!btn || !tabsWrap.contains(btn)) return;
      const view = btn.dataset.view === 'all' ? 'all' : 'listing';
      if (view === activeView) return;
      activeView = view;
      tabsWrap.querySelectorAll('.orders-screen__tab').forEach((item) => {
        item.classList.toggle('orders-screen__tab--active', item === btn);
      });
      if (tableBody) {
        tableBody.classList.add('orders-screen__table-fade');
        setTimeout(() => tableBody.classList.remove('orders-screen__table-fade'), 180);
      }
      render();
    });
  }

  function setupSidebar() {
    if (!sidebarMenu) return;
    sidebarMenu.addEventListener('click', (e) => {
      const link = e.target.closest('.orders-screen__menu-item');
      if (!link || !sidebarMenu.contains(link)) return;
      const href = (link.getAttribute('href') || '').trim();
      if (href === '#') e.preventDefault();
      sidebarMenu.querySelectorAll('.orders-screen__menu-item').forEach((item) => {
        item.classList.toggle('orders-screen__menu-item--active', item === link);
      });
    });
  }

  function setupMobileSidebar() {
    if (!sidebarMenu || !sidebarToggleBtn || !sidebarBackdrop) return;

    const mobileQuery = window.matchMedia('(max-width: 620px)');
    const openClass = 'is-sidebar-open';

    function closeSidebar() {
      sidebarMenu.classList.remove(openClass);
      sidebarBackdrop.classList.remove(openClass);
      sidebarToggleBtn.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('orders-page--sidebar-open');
    }

    function openSidebar() {
      sidebarMenu.classList.add(openClass);
      sidebarBackdrop.classList.add(openClass);
      sidebarToggleBtn.setAttribute('aria-expanded', 'true');
      document.body.classList.add('orders-page--sidebar-open');
    }

    function toggleSidebar() {
      if (!mobileQuery.matches) return;
      const isOpen = sidebarMenu.classList.contains(openClass);
      if (isOpen) closeSidebar();
      else openSidebar();
    }

    sidebarToggleBtn.addEventListener('click', toggleSidebar);
    if (sidebarCloseBtn) sidebarCloseBtn.addEventListener('click', closeSidebar);
    sidebarBackdrop.addEventListener('click', closeSidebar);
    sidebarMenu.addEventListener('click', (e) => {
      if (!mobileQuery.matches) return;
      const link = e.target.closest('.orders-screen__menu-item');
      if (link) closeSidebar();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeSidebar();
    });
    mobileQuery.addEventListener('change', (e) => {
      if (!e.matches) closeSidebar();
    });
  }

  function setupStatusToggle() {
    if (!statusToggle) return;
    statusToggle.addEventListener('click', () => {
      const active = statusToggle.classList.toggle('is-active');
      statusToggle.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function setupCopyOrderId() {
    if (!tableBody) return;
    tableBody.addEventListener('click', async (e) => {
      const btn = e.target.closest('.orders-screen__copy-id');
      if (!btn || !tableBody.contains(btn)) return;
      const id = (btn.getAttribute('data-copy-id') || '').trim();
      if (!id) return;
      try {
        await navigator.clipboard.writeText(id);
        btn.classList.add('is-copied');
        setTimeout(() => btn.classList.remove('is-copied'), 900);
      } catch (_) {}
    });
  }

  setupTabs();
  setupSidebar();
  setupMobileSidebar();
  setupStatusToggle();
  setupCopyOrderId();
  render();
})();
