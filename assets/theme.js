(() => {
  const theme = window.AnkurTheme || {};
  const routes = theme.routes || {};
  const qs = (selector, scope = document) => scope.querySelector(selector);
  const qsa = (selector, scope = document) => [...scope.querySelectorAll(selector)];

  const setExpanded = (elements, value) => elements.forEach((element) => element.setAttribute('aria-expanded', String(value)));
  const setBodyLocked = (locked) => document.body.classList.toggle('drawer-open', locked);
  let activeDrawer = null;
  let searchOpener = null;

  function closeDrawer(restoreFocus = true) {
    if (!activeDrawer) return;
    const { overlay, triggers, returnFocus } = activeDrawer;
    const element = qs(overlay);
    if (element) element.hidden = true;
    setExpanded(qsa(triggers), false);
    activeDrawer = null;
    setBodyLocked(false);
    if (restoreFocus && returnFocus?.isConnected) returnFocus.focus();
  }

  function openDrawer(overlay, dialog, triggers, returnFocus = document.activeElement) {
    const element = qs(overlay);
    if (!element) return;
    if (activeDrawer?.overlay === overlay) returnFocus = activeDrawer.returnFocus;
    else closeDrawer(false);
    closeSearch(false);
    activeDrawer = { overlay, dialog, triggers, returnFocus };
    element.hidden = false;
    setExpanded(qsa(triggers), true);
    setBodyLocked(true);
    qs(dialog, element)?.focus();
  }

  function showToast(message) {
    const toast = qs('[data-toast]');
    if (!toast) return;
    toast.textContent = message;
    toast.hidden = false;
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => { toast.hidden = true; }, 2200);
  }

  function closeSearch(restoreFocus = true) {
    const panel = qs('[data-search-panel]');
    if (!panel || panel.hidden) return;
    panel.hidden = true;
    setExpanded(qsa('[data-search-toggle]'), false);
    if (restoreFocus && searchOpener?.isConnected) searchOpener.focus();
  }

  function syncSearchClear() {
    const input = qs('[data-search-input]');
    const clear = qs('[data-search-clear]');
    if (!input || !clear) return;
    clear.hidden = !input.value.trim();
  }

  function clearSearchInput() {
    const input = qs('[data-search-input]');
    if (!input) return;
    input.value = '';
    syncSearchClear();
    input.focus();
  }

  function toggleSearch() {
    const panel = qs('[data-search-panel]');
    if (!panel) return;
    const willOpen = panel.hidden;
    if (!willOpen) { closeSearch(); return; }
    searchOpener = document.activeElement;
    closeDrawer(false);
    panel.hidden = !willOpen;
    setExpanded(qsa('[data-search-toggle]'), willOpen);
    if (willOpen) {
      syncSearchClear();
      window.setTimeout(() => qs('[data-search-input]', panel)?.focus(), 20);
    }
  }

  function openMobileMenu() {
    openDrawer('[data-mobile-menu]', '.mobile-menu', '[data-mobile-menu-open]');
  }

  function closeMobileMenu() {
    if (activeDrawer?.overlay === '[data-mobile-menu]') closeDrawer();
  }

  function openCart(returnFocus) {
    openDrawer('[data-cart-drawer-overlay]', '[data-cart-drawer]', '[data-cart-open]', returnFocus);
  }

  function closeCart() {
    if (activeDrawer?.overlay === '[data-cart-drawer-overlay]') closeDrawer();
  }

  async function refreshCart(openAfterRefresh = false, returnFocus) {
    const root = routes.root || '/';
    const separator = root.includes('?') ? '&' : '?';
    const [cartResponse, sectionResponse] = await Promise.all([
      fetch(`${routes.cart || '/cart'}.js`, { headers: { Accept: 'application/json' } }),
      fetch(`${root}${separator}section_id=cart-drawer`)
    ]);
    if (!cartResponse.ok || !sectionResponse.ok) throw new Error('Unable to refresh bag');

    const cart = await cartResponse.json();
    const sectionHtml = await sectionResponse.text();
    const parsed = new DOMParser().parseFromString(sectionHtml, 'text/html');
    const currentSection = qs('#shopify-section-cart-drawer');
    const nextSection = qs('#shopify-section-cart-drawer', parsed);
    if (currentSection && nextSection) currentSection.replaceWith(nextSection);

    qsa('[data-cart-count]').forEach((count) => {
      count.textContent = cart.item_count;
      count.hidden = cart.item_count === 0;
    });
    qsa('[data-cart-open]').forEach((button) => button.setAttribute('aria-label', `Shopping bag with ${cart.item_count} items`));
    if (openAfterRefresh) openCart(returnFocus);
  }

  async function addToCart(form) {
    const productState = (state, message = '') => form.dispatchEvent(new CustomEvent('product:cart-state', { detail: { state, message } }));
    const submit = qs('[type="submit"]', form);
    const originalText = submit?.textContent;
    if (submit) {
      submit.disabled = true;
      submit.textContent = 'Adding...';
    }
    productState('loading');

    try {
      const response = await fetch(`${routes.cartAdd || '/cart/add'}.js`, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: new FormData(form)
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.description || 'Could not add this item');
      }
      await refreshCart(true, submit);
      showToast('Added to your bag');
      productState('success');
    } catch (error) {
      showToast(error.message || 'Something went wrong');
      productState('error', error.message || 'Something went wrong');
    } finally {
      if (submit) {
        submit.disabled = false;
        submit.textContent = originalText;
      }
      productState('complete');
    }
  }

  async function changeCartLine(line, quantity, item) {
    const stepper = item?.querySelector('[data-quantity]');
    stepper?.querySelectorAll('button').forEach((button) => { button.disabled = true; });
    if (item) item.setAttribute('aria-busy', 'true');
    try {
      const response = await fetch(`${routes.cartChange || '/cart/change'}.js`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ line: Number(line), quantity: Math.max(1, Number(quantity) || 1) })
      });
      if (!response.ok) throw new Error('Could not update quantity');
      await refreshCart(true);
    } catch (error) {
      stepper?.querySelectorAll('button').forEach((button) => { button.disabled = false; });
      if (item) item.removeAttribute('aria-busy');
      showToast(error.message || 'Something went wrong');
    }
  }

  async function removeCartLine(line, button) {    button.disabled = true;
    try {
      const response = await fetch(`${routes.cartChange || '/cart/change'}.js`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ line: Number(line), quantity: 0 })
      });
      if (!response.ok) throw new Error('Could not remove this item');
      await refreshCart(true);
    } catch (error) {
      button.disabled = false;
      showToast(error.message || 'Something went wrong');
    }
  }

  let wishlist = null;
  function getWishlist() {
    if (wishlist) return wishlist;
    try {
      const saved = JSON.parse(localStorage.getItem('ankur-wishlist') || '[]');
      wishlist = new Set(Array.isArray(saved) ? saved.filter((id) => typeof id === 'string' || typeof id === 'number').map(String) : []);
    } catch (_) {
      wishlist = new Set();
    }
    return wishlist;
  }

  function updateWishlist(button) {
    const productId = button.dataset.productId;
    if (!productId) return;
    const saved = getWishlist();
    if (saved.has(productId)) saved.delete(productId); else saved.add(productId);
    let persistent = true;
    try { localStorage.setItem('ankur-wishlist', JSON.stringify([...saved])); } catch (_) { persistent = false; }
    restoreWishlist();
    showToast(saved.has(productId) ? (persistent ? 'Saved to your wishlist' : 'Saved for this visit') : 'Removed from your wishlist');
  }

  function restoreWishlist() {
    const saved = getWishlist();
    qsa('[data-wishlist]').forEach((button) => {
      const active = saved.has(button.dataset.productId);
      button.classList.toggle('wishlisted', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function filterProducts(button) {
    const section = button.closest('[data-product-section]');
    if (!section) return;
    const filter = button.dataset.productFilter;
    qsa('[data-product-filter]', section).forEach((tab) => {
      const active = tab === button;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    qsa('[data-product-card]', section).forEach((card) => {
      card.hidden = filter !== 'all' && !card.dataset.category.split(' ').includes(filter);
    });
  }

  function updateVariant(select) {
    const option = select.selectedOptions[0];
    const container = select.closest('[data-product-details]');
    if (!option || !container) return;
    const price = qs('[data-product-price]', container);
    const compare = qs('[data-compare-price]', container);
    const button = qs('[data-product-submit]', container);
    if (price) price.textContent = option.dataset.price || '';
    if (compare) {
      compare.textContent = option.dataset.comparePrice || '';
      compare.hidden = !option.dataset.comparePrice;
    }
    if (button) {
      const available = option.dataset.available === 'true';
      button.disabled = !available;
      button.textContent = available ? button.dataset.addLabel : button.dataset.soldLabel;
    }
  }

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('[data-search-toggle]')) toggleSearch();
    if (target.closest('[data-search-clear]')) clearSearchInput();
    if (target.closest('[data-search-close]')) closeSearch();
    if (target.closest('[data-mobile-menu-open]')) openMobileMenu();
    if (target.closest('[data-mobile-menu-close]')) closeMobileMenu();
    if (target.matches('[data-mobile-menu]')) closeMobileMenu();
    if (target.closest('[data-cart-open]')) openCart();
    if (target.closest('[data-cart-close]')) closeCart();
    if (target.matches('[data-cart-drawer-overlay]')) closeCart();

    const removeButton = target.closest('[data-cart-remove]');
    if (removeButton) removeCartLine(removeButton.dataset.line, removeButton);

    const cartQuantityButton = target.closest('[data-cart-quantity]');
    if (cartQuantityButton) {
      const item = cartQuantityButton.closest('.cart-item');
      const input = qs('input', cartQuantityButton.closest('[data-quantity]'));
      const current = Number(input?.value) || 1;
      const next = cartQuantityButton.hasAttribute('data-cart-increase') ? current + 1 : current - 1;
      changeCartLine(cartQuantityButton.dataset.cartQuantity, next, item);
    }

    const wishButton = target.closest('[data-wishlist]');
    if (wishButton) updateWishlist(wishButton);

    const filterButton = target.closest('[data-product-filter]');
    if (filterButton) filterProducts(filterButton);

    const sliderButton = target.closest('[data-slider-direction]');
    if (sliderButton) {
      const section = sliderButton.closest('section');
      const grid = qs('[data-product-grid]', section);
      if (grid) grid.scrollBy({ left: sliderButton.dataset.sliderDirection === 'next' ? grid.clientWidth * 0.75 : -grid.clientWidth * 0.75, behavior: 'smooth' });
    }

    const quantityButton = target.closest('[data-quantity-change]');
    if (quantityButton) {
      const input = qs('input', quantityButton.closest('[data-quantity]'));
      if (input) input.value = Math.max(Number(input.min || 1), Number(input.value) + Number(quantityButton.dataset.quantityChange));
    }
  });

  document.addEventListener('submit', (event) => {
    const form = event.target;
    const ajaxSubmit = event.submitter?.matches?.('[data-ajax-submit]');
    if (form instanceof HTMLFormElement && form.matches('[data-ajax-cart-form]') && ajaxSubmit) {
      event.preventDefault();
      addToCart(form);
    }
  });

  document.addEventListener('change', (event) => {
    const select = event.target.closest?.('[data-variant-select]');
    if (select) updateVariant(select);
    const sortSelect = event.target.closest?.('[data-sort-select]');
    if (sortSelect) sortSelect.form?.submit();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Tab' && activeDrawer) {
      const dialog = qs(activeDrawer.dialog, qs(activeDrawer.overlay));
      if (!dialog) { closeDrawer(false); return; }
      const focusable = qsa('a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"])', dialog)
        .filter((element) => !element.disabled && element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden');
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first) { event.preventDefault(); dialog.focus(); }
      else if (event.shiftKey && (document.activeElement === first || !focusable.includes(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    }
    if (event.key !== 'Escape') return;
    if (document.querySelector('dialog[open]')) return;
    closeSearch();
    closeMobileMenu();
    closeCart();
  });

  const mobileMedia = window.matchMedia('(max-width: 600px)');
  const footerGroups = qsa('.footer-group');
  const syncFooterGroups = () => footerGroups.forEach((group) => { group.open = !mobileMedia.matches; });
  if (footerGroups.length) {
    syncFooterGroups();
    mobileMedia.addEventListener?.('change', syncFooterGroups);
    document.addEventListener('click', (event) => {
      const summary = event.target instanceof Element ? event.target.closest('.footer-group > summary') : null;
      if (summary && !mobileMedia.matches) event.preventDefault();
    });
  }

  qs('[data-search-input]')?.addEventListener('input', syncSearchClear);
  syncSearchClear();

  restoreWishlist();
  document.addEventListener('shopify:section:load', restoreWishlist);
  document.addEventListener('theme:cards:load', restoreWishlist);
  window.addEventListener('storage', (event) => {
    if (event.key === 'ankur-wishlist' || event.key === null) { wishlist = null; restoreWishlist(); }
  });
})();
