// Client-side search for Ruby Dev Meeting Archive
// No external dependencies - pure vanilla JS
(function() {
  'use strict';

  var searchIndex = null;
  var searchOverlay = document.getElementById('search-overlay');
  var searchInput = document.getElementById('search-input');
  var searchResults = document.getElementById('search-results');
  var searchToggle = document.getElementById('search-toggle');
  var searchClose = document.getElementById('search-close');
  var searchTriggers = document.querySelectorAll('.search-trigger');
  var activeIndex = -1;
  var baseMeta = document.querySelector('meta[name="base-url"]');
  var base = baseMeta ? baseMeta.getAttribute('content') : '';

  if (!searchOverlay || !searchInput || !searchResults) return;

  // Load search index
  function loadIndex() {
    if (searchIndex) return Promise.resolve(searchIndex);
    return fetch(base + '/search-index.json')
      .then(function(r) { return r.json(); })
      .then(function(data) { searchIndex = data; return data; });
  }

  // Open search
  function openSearch() {
    searchOverlay.classList.remove('hidden');
    searchInput.focus();
    activeIndex = -1;
    loadIndex();
    document.body.style.overflow = 'hidden';
  }

  // Close search
  function closeSearch() {
    searchOverlay.classList.add('hidden');
    searchInput.value = '';
    searchResults.classList.add('hidden');
    searchResults.innerHTML = '';
    activeIndex = -1;
    document.body.style.overflow = '';
  }

  // Search logic
  function search(query) {
    if (!searchIndex || !query || query.length < 2) {
      searchResults.classList.add('hidden');
      searchResults.innerHTML = '';
      activeIndex = -1;
      return;
    }

    var q = query.toLowerCase().trim();
    var terms = q.split(/\s+/);
    var results = [];

    searchIndex.forEach(function(item) {
      var score = 0;
      var titleLower = (item.title || '').toLowerCase();
      var summaryLower = (item.summary || '').toLowerCase();
      var contentLower = (item.content || '').toLowerCase();
      var ticketStr = (item.tickets || []).join(' ');

      terms.forEach(function(term) {
        // Check for ticket number search (e.g., "#12345" or "12345")
        var ticketNum = term.replace(/^#/, '');
        if (/^\d+$/.test(ticketNum) && ticketStr.indexOf(ticketNum) !== -1) {
          score += 100;
          return;
        }

        // Title match (highest weight)
        if (titleLower.indexOf(term) !== -1) score += 50;

        // Summary match
        if (summaryLower.indexOf(term) !== -1) score += 30;

        // Content match
        if (contentLower.indexOf(term) !== -1) {
          score += 10;
          // Bonus for multiple occurrences
          var regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
          var matches = contentLower.match(regex);
          if (matches) score += Math.min(matches.length, 5) * 2;
        }

        // Year match
        if (item.year && item.year.toString() === term) score += 20;
      });

      if (score > 0) {
        results.push({ item: item, score: score });
      }
    });

    // Sort by score descending
    results.sort(function(a, b) { return b.score - a.score; });

    // Render results
    activeIndex = -1;
    renderResults(results.slice(0, 20), query);
  }

  function renderResults(results, query) {
    if (results.length === 0) {
      searchResults.classList.remove('hidden');
      searchResults.innerHTML = '<div class="py-8 text-center text-[var(--text-subtle)]">' +
        '<span class="material-symbols-rounded text-4xl block mb-2">search_off</span>' +
        'No results found for &ldquo;' + escapeHtml(query) + '&rdquo;' +
        '</div>';
      return;
    }

    var html = '<div class="space-y-1 search-results-enter" role="listbox" id="search-listbox">';
    results.forEach(function(r, i) {
      var item = r.item;
      var snippet = cleanSnippet(getSnippet(item.content || item.summary || '', query));

      html += '<a href="' + escapeHtml(base + item.url) + '"' +
        ' class="search-result block px-4 py-3 rounded-lg hover:bg-[var(--bg-subtle)] no-underline transition-colors outline-none focus:bg-[var(--bg-subtle)]"' +
        ' role="option" data-index="' + i + '"' +
        ' id="search-result-' + i + '">' +
        '<div class="flex items-start justify-between gap-3">' +
        '<div class="min-w-0">' +
        '<span class="font-medium text-[var(--text-default)]">' + highlightText(escapeHtml(item.title), query) + '</span>' +
        '<p class="text-sm text-[var(--text-subtle)] mt-0.5 line-clamp-2">' + highlightText(escapeHtml(snippet), query) + '</p>' +
        '</div>' +
        '<span class="text-xs text-[var(--text-subtler)] flex-shrink-0 mt-1">' + escapeHtml(item.date || '') + '</span>' +
        '</div>' +
        '</a>';
    });
    html += '</div>';
    html += '<div class="px-4 py-2 border-t border-[var(--border-subtle)] text-xs text-[var(--text-subtler)] flex items-center gap-3">' +
      '<span class="inline-flex items-center gap-1"><kbd class="px-1 py-0.5 bg-[var(--bg-subtle)] rounded border border-[var(--border-default)] text-[10px]">&uarr;&darr;</kbd> navigate</span>' +
      '<span class="inline-flex items-center gap-1"><kbd class="px-1 py-0.5 bg-[var(--bg-subtle)] rounded border border-[var(--border-default)] text-[10px]">&crarr;</kbd> open</span>' +
      '<span class="inline-flex items-center gap-1"><kbd class="px-1 py-0.5 bg-[var(--bg-subtle)] rounded border border-[var(--border-default)] text-[10px]">esc</kbd> close</span>' +
      '</div>';

    searchResults.classList.remove('hidden');
    searchResults.innerHTML = html;
  }

  // Clean a snippet of any remaining markdown artifacts
  function cleanSnippet(text) {
    return text
      .replace(/\[{1,2}([^\]]+)\]{1,2}\([^)]*\)/g, '$1')  // [text](url) or [[text]](url)
      .replace(/\[{1,2}([^\]]+)\]{1,2}/g, '$1')            // [[text]] or [text]
      .replace(/`([^`]+)`/g, '$1')                          // `code` -> code
      .replace(/#{1,6}\s*/g, '')                             // heading markers
      .replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1')             // bold/italic
      .replace(/_{1,2}([^_]+)_{1,2}/g, '$1')               // bold/italic underscore
      .replace(/~~([^~]+)~~/g, '$1')                        // strikethrough
      .replace(/^\s*[-*+]\s+/gm, '')                        // list markers
      .replace(/^\s*\d+\.\s+/gm, '')                        // numbered list markers
      .replace(/^>\s*/gm, '')                                // blockquote markers
      .replace(/\s+/g, ' ')                                  // normalize whitespace
      .trim();
  }

  function getSnippet(content, query) {
    var terms = query.toLowerCase().split(/\s+/);
    var lower = content.toLowerCase();
    var bestPos = -1;

    for (var i = 0; i < terms.length; i++) {
      var pos = lower.indexOf(terms[i]);
      if (pos !== -1) {
        bestPos = pos;
        break;
      }
    }

    if (bestPos === -1) return content.substring(0, 150);

    var start = Math.max(0, bestPos - 60);
    var end = Math.min(content.length, bestPos + 100);
    var snippet = content.substring(start, end);

    if (start > 0) snippet = '...' + snippet;
    if (end < content.length) snippet = snippet + '...';

    return snippet;
  }

  function highlightText(text, query) {
    var terms = query.split(/\s+/).filter(function(t) { return t.length >= 2; });
    terms.forEach(function(term) {
      var regex = new RegExp('(' + term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
      text = text.replace(regex, '<mark>$1</mark>');
    });
    return text;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Keyboard navigation for search results
  function getResultElements() {
    return searchResults.querySelectorAll('.search-result');
  }

  function setActiveResult(index) {
    var results = getResultElements();
    if (results.length === 0) return;

    // Remove active state from all
    results.forEach(function(el) {
      el.classList.remove('bg-[var(--bg-subtle)]');
      el.removeAttribute('aria-selected');
    });

    // Clamp index
    if (index < 0) index = results.length - 1;
    if (index >= results.length) index = 0;
    activeIndex = index;

    // Apply active state
    var active = results[activeIndex];
    active.classList.add('bg-[var(--bg-subtle)]');
    active.setAttribute('aria-selected', 'true');
    active.scrollIntoView({ block: 'nearest' });
    searchInput.setAttribute('aria-activedescendant', active.id);
  }

  function navigateToActive() {
    var results = getResultElements();
    if (activeIndex >= 0 && activeIndex < results.length) {
      var url = results[activeIndex].getAttribute('href');
      if (url) window.location.href = url;
    }
  }

  // Debounce
  var debounceTimer;
  function debounce(fn, delay) {
    return function() {
      var args = arguments;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function() { fn.apply(null, args); }, delay);
    };
  }

  // Event listeners
  if (searchToggle) {
    searchToggle.addEventListener('click', openSearch);
  }
  if (searchClose) {
    searchClose.addEventListener('click', closeSearch);
  }

  searchTriggers.forEach(function(trigger) {
    trigger.addEventListener('click', function(e) {
      e.preventDefault();
      openSearch();
    });
    trigger.addEventListener('focus', function(e) {
      e.preventDefault();
      openSearch();
    });
  });

  searchInput.addEventListener('input', debounce(function() {
    search(searchInput.value);
  }, 200));

  // Keyboard shortcuts
  document.addEventListener('keydown', function(e) {
    var isSearchOpen = !searchOverlay.classList.contains('hidden');

    // "/" to open search (when not already in an input)
    if (e.key === '/' && !isSearchOpen) {
      var active = document.activeElement;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
      e.preventDefault();
      openSearch();
      return;
    }

    if (!isSearchOpen) return;

    // Arrow down - move to next result
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveResult(activeIndex + 1);
      return;
    }

    // Arrow up - move to previous result
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (activeIndex <= 0) {
        // Return focus to input when going above first result
        activeIndex = -1;
        var results = getResultElements();
        results.forEach(function(el) {
          el.classList.remove('bg-[var(--bg-subtle)]');
          el.removeAttribute('aria-selected');
        });
        searchInput.removeAttribute('aria-activedescendant');
        searchInput.focus();
      } else {
        setActiveResult(activeIndex - 1);
      }
      return;
    }

    // Enter - navigate to active result
    if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      navigateToActive();
      return;
    }

    // Escape to close
    if (e.key === 'Escape') {
      closeSearch();
      return;
    }
  });

  // Close when clicking outside
  searchOverlay.addEventListener('click', function(e) {
    if (e.target === searchOverlay) {
      closeSearch();
    }
  });
})();
