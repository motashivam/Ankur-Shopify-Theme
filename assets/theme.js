(() => {
  const theme = window.AnkurTheme || {};
  const routes = theme.routes || {};
  const qs = (selector, scope = document) => scope.querySelector(selector);
  const qsa = (selector, scope = document) => [...scope.querySelectorAll(selector)];

  const setExpanded = (elements, value) => elements.forEach((element) => element.setAttribute('aria-expanded', String(value)));
  const setBodyLocked = (locked) => document.body.classList.toggle('drawer-open', locked);

  function showToast(message) {
    const toast = qs('[data-toast]');
    if (!toast) return;
    toast.textContent = message;
    toast.hidden = false;
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => { toast.hidden = true; }, 2200);
  }

  function closeSearch() {
    const panel = qs('[data-search-panel]');
    if (!panel) return;
    panel.hidden = true;
    setExpanded(qsa('[data-search-toggle]'), false);
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
    panel.hidden = !willOpen;
    setExpanded(qsa('[data-search-toggle]'), willOpen);
    if (willOpen) {
      syncSearchClear();
      window.setTimeout(() => qs('[data-search-input]', panel)?.focus(), 20);
    }
  }

  function openMobileMenu() {
    const overlay = qs('[data-mobile-menu]');
    if (!overlay) return;
    overlay.hidden = false;
    setExpanded(qsa('[data-mobile-menu-open]'), true);
    setBodyLocked(true);
    qs('.mobile-menu', overlay)?.focus();
  }

  function closeMobileMenu() {
    const overlay = qs('[data-mobile-menu]');
    if (!overlay) return;
    overlay.hidden = true;
    setExpanded(qsa('[data-mobile-menu-open]'), false);
    setBodyLocked(false);
  }

  function openCart() {
    const overlay = qs('[data-cart-drawer-overlay]');
    if (!overlay) return;
    overlay.hidden = false;
    setExpanded(qsa('[data-cart-open]'), true);
    setBodyLocked(true);
    qs('[data-cart-drawer]', overlay)?.focus();
  }

  function closeCart() {
    const overlay = qs('[data-cart-drawer-overlay]');
    if (!overlay) return;
    overlay.hidden = true;
    setExpanded(qsa('[data-cart-open]'), false);
    setBodyLocked(false);
  }

  async function refreshCart(openAfterRefresh = false) {
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
    if (openAfterRefresh) openCart();
  }

  async function addToCart(form) {
    const submit = qs('[type="submit"]', form);
    const originalText = submit?.textContent;
    if (submit) {
      submit.disabled = true;
      submit.textContent = 'Adding...';
    }

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
      await refreshCart(true);
      showToast('Added to your bag');
    } catch (error) {
      showToast(error.message || 'Something went wrong');
    } finally {
      if (submit) {
        submit.disabled = false;
        submit.textContent = originalText;
      }
    }
  }

  async function removeCartLine(line, button) {
    button.disabled = true;
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

  function updateWishlist(button) {
    const productId = button.dataset.productId;
    const saved = new Set(JSON.parse(localStorage.getItem('ankur-wishlist') || '[]'));
    if (saved.has(productId)) saved.delete(productId); else saved.add(productId);
    localStorage.setItem('ankur-wishlist', JSON.stringify([...saved]));
    button.classList.toggle('wishlisted', saved.has(productId));
    button.setAttribute('aria-pressed', String(saved.has(productId)));
    showToast(saved.has(productId) ? 'Saved to your wishlist' : 'Removed from your wishlist');
  }

  function restoreWishlist() {
    const saved = new Set(JSON.parse(localStorage.getItem('ankur-wishlist') || '[]'));
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
    if (event.key !== 'Escape') return;
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
})();
