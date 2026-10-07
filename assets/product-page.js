(() => {
  if (window.ankurProductPageLoaded) return;
  window.ankurProductPageLoaded = true;

  function initProduct(root) {
    if (root.dataset.ready) return;
    root.dataset.ready = 'true';
    const find = (selector) => root.querySelector(selector);
    const all = (selector) => [...root.querySelectorAll(selector)];
    const form = find('.product-form');
    const select = find('[data-pdp-variant]');
    if (!form || !select?.options.length) return;
    const variants = [...select.options].map((option) => ({
      id: option.value, options: JSON.parse(option.dataset.options),
      price: option.dataset.price, compare: option.dataset.compare,
      discount: option.dataset.discount, available: option.dataset.available === 'true',
      sku: option.dataset.sku, media: option.dataset.media
    }));
    let current = variants.find((variant) => variant.id === select.value);
    let selected = [...current.options];
    let busy = false;
    const primary = find('[data-product-submit]');
    const sticky = find('[data-sticky-cta]');
    const status = find('[data-product-status]');
    const track = find('[data-media-track]');
    const media = all('[data-media-id]');
    let activeMedia = null;
    if (find('model-viewer') && window.Shopify?.loadFeatures) {
      window.Shopify.loadFeatures([{ name: 'model-viewer-ui', version: '1.0', onLoad: (errors) => {
        if (!errors && root.isConnected) all('model-viewer').forEach((model) => { new window.Shopify.ModelViewerUI(model); });
      } }]);
    }
    all('[data-swatch-color]').forEach((swatch) => {
      if (CSS.supports('color', swatch.dataset.swatchColor)) swatch.style.backgroundColor = swatch.dataset.swatchColor;
    });

    function markMedia(index) {
      const active = media[index];
      if (!active || active === activeMedia) return;
      activeMedia = active;
      all('[data-thumbnail]').forEach((thumb) => {
        if (thumb.dataset.thumbnail === active.dataset.mediaId) thumb.setAttribute('aria-current', 'true');
        else thumb.removeAttribute('aria-current');
      });
      const counter = find('[data-media-counter]');
      if (counter) counter.textContent = `${index + 1} / ${media.length}`;
      media.forEach((slide) => {
        const inactive = slide !== active;
        slide.inert = inactive;
        slide.setAttribute('aria-hidden', String(inactive));
        if (inactive) {
          slide.querySelectorAll('video').forEach((video) => video.pause());
          slide.querySelectorAll('model-viewer').forEach((model) => model.pause?.());
          slide.querySelectorAll('iframe').forEach((frame) => {
            if (frame.dataset.playbackActive) {
              // Reload only a previously active embed to stop external playback.
              frame.src = frame.src;
              delete frame.dataset.playbackActive;
            }
          });
        } else slide.querySelectorAll('iframe').forEach((frame) => { frame.dataset.playbackActive = 'true'; });
      });
    }
    function showMedia(id) {
      const index = media.findIndex((slide) => slide.dataset.mediaId === String(id));
      if (index < 0) return;
      const slide = media[index];
      track.scrollLeft += slide.getBoundingClientRect().left - track.getBoundingClientRect().left;
      markMedia(index);
    }
    let scrollFrame;
    track.addEventListener('scroll', () => {
      cancelAnimationFrame(scrollFrame);
      scrollFrame = requestAnimationFrame(() => {
        const left = track.getBoundingClientRect().left;
        let closest = 0;
        media.forEach((slide, index) => {
          if (Math.abs(slide.getBoundingClientRect().left - left) < Math.abs(media[closest].getBoundingClientRect().left - left)) closest = index;
        });
        markMedia(closest);
      });
    }, { passive: true });
    track.addEventListener('keydown', (event) => {
      if (event.target !== track || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const next = media.indexOf(activeMedia) + (event.key === 'ArrowRight' ? 1 : -1);
      showMedia(media[Math.max(0, Math.min(media.length - 1, next))]?.dataset.mediaId);
    });

    function syncVariant(updateUrl = false) {
      const available = Boolean(current?.available);
      const label = current ? (available ? 'Add to cart' : 'Sold out') : 'Unavailable';
      all('[data-product-submit], [data-sticky-submit]').forEach((button) => {
        button.disabled = busy || !available;
        button.textContent = busy ? 'Adding…' : label;
      });
      all('[data-product-price], [data-sticky-price]').forEach((price) => { price.textContent = current?.price || 'Unavailable'; });
      const compare = find('[data-compare-price]');
      compare.textContent = current?.compare || '';
      compare.hidden = !current?.compare;
      const discount = find('[data-discount]');
      discount.textContent = current?.discount || '';
      discount.hidden = !current?.discount;
      find('[data-availability]').textContent = current ? (available ? 'In stock' : 'Sold out') : 'This combination is unavailable';
      const sku = find('[data-sku]');
      if (sku) {
        sku.textContent = current?.sku || '';
        find('[data-sku-row]').hidden = !current?.sku;
      }
      select.value = current?.id || '';
      select.disabled = !current;
      const checkout = find('[data-dynamic-checkout]');
      if (checkout) {
        checkout.hidden = busy || !available;
        checkout.inert = busy || !available;
      }
      all('[data-option-position]').forEach((group) => {
        const position = Number(group.dataset.optionPosition);
        group.querySelectorAll('[data-option-value]').forEach((button) => {
          const value = button.dataset.optionValue;
          const possible = variants.some((variant) => variant.available && variant.options.every((option, index) => option === (index === position ? value : selected[index])));
          button.setAttribute('aria-pressed', String(selected[position] === value));
          button.classList.toggle('is-unavailable', !possible);
          button.querySelector('[data-option-status]').textContent = possible ? '' : ' — unavailable with the current options';
          button.disabled = busy;
        });
      });
      if (updateUrl) {
        const url = new URL(window.location.href);
        if (current) url.searchParams.set('variant', current.id);
        else url.searchParams.delete('variant');
        window.history.replaceState({}, '', url);
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    root.addEventListener('click', (event) => {
      const option = event.target.closest('[data-option-value]');
      if (option && !busy) {
        selected[Number(option.closest('[data-option-position]').dataset.optionPosition)] = option.dataset.optionValue;
        current = variants.find((variant) => variant.options.every((value, index) => value === selected[index]));
        status.textContent = '';
        syncVariant(true);
        if (current?.media) showMedia(current.media);
      }
      const thumbnail = event.target.closest('[data-thumbnail]');
      if (thumbnail) {
        event.preventDefault();
        showMedia(thumbnail.dataset.thumbnail);
      }
      if (event.target.closest('[data-sticky-submit]') && !busy && current?.available) form.requestSubmit(primary);
    });
    form.addEventListener('submit', (event) => {
      if (busy || !current?.available) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    });
    form.addEventListener('product:cart-state', (event) => {
      const { state, message } = event.detail;
      busy = state === 'loading';
      form.setAttribute('aria-busy', String(busy));
      if (state === 'loading') status.textContent = 'Adding to cart…';
      if (state === 'success') status.textContent = 'Added to your bag';
      if (state === 'error') status.textContent = message;
      syncVariant();
    });

    const guide = find('[data-size-guide]');
    const opener = find('[data-guide-open]');
    if (guide && typeof guide.showModal === 'function') {
      opener.setAttribute('aria-haspopup', 'dialog');
      opener.addEventListener('click', (event) => { event.preventDefault(); guide.showModal(); });
      find('[data-guide-close]').addEventListener('click', () => guide.close());
      guide.addEventListener('click', (event) => {
        const rect = guide.getBoundingClientRect();
        if (event.target === guide && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) guide.close();
      });
      guide.addEventListener('close', () => opener.focus());
    }
    if (sticky) {
      const observer = new IntersectionObserver(([entry]) => {
        sticky.hidden = entry.isIntersecting || entry.boundingClientRect.bottom > 0;
      }, { threshold: 0 });
      observer.observe(primary);
      root._pdpCleanup = () => observer.disconnect();
    }
    find('.pdp-variant-fallback').hidden = true;
    const options = find('[data-pdp-options]');
    if (options) options.hidden = false;
    syncVariant();
    showMedia(find('[data-featured-media]')?.dataset.mediaId || media[0]?.dataset.mediaId);
  }

  async function loadRecommendations(root) {
    if (root.dataset.ready) return;
    root.dataset.ready = 'true';
    try {
      const response = await fetch(root.dataset.url);
      if (!response.ok) return;
      const documentFragment = new DOMParser().parseFromString(await response.text(), 'text/html');
      const content = documentFragment.querySelector('[data-product-recommendations]');
      if (!root.isConnected || !content?.querySelector('[data-product-card]')) return;
      root.innerHTML = content.innerHTML;
      root.hidden = false;
      // Reuse the existing card wishlist initialization and delegated cart handlers.
      document.dispatchEvent(new CustomEvent('theme:cards:load'));
    } catch (_) {
      // Recommendations are optional; leave the empty section hidden on failure.
    }
  }
  function init() {
    document.querySelectorAll('[data-pdp]').forEach(initProduct);
    document.querySelectorAll('[data-product-recommendations]').forEach(loadRecommendations);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  document.addEventListener('shopify:section:load', init);
  document.addEventListener('shopify:section:unload', (event) => {
    event.target.querySelectorAll('[data-pdp]').forEach((root) => root._pdpCleanup?.());
  });
})();
