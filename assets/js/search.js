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

  if (!searchOverlay || !searchInput || !searchResults) return;

  // Load search index
  function loadIndex() {
    if (searchIndex) return Promise.resolve(searchIndex);
    var baseUrl = document.querySelector('link[rel="canonical"]');
    var base = '';
    if (document.querySelector('meta[name="base-url"]')) {
      base = document.querySelector('meta[name="base-url"]').getAttribute('content');
    }
    return fetch(base + '/search-index.json')
      .then(function(r) { return r.json(); })
      .then(function(data) { searchIndex = data; return data; });
  }

  // Open search
  function openSearch() {
    searchOverlay.classList.remove('hidden');
    searchInput.focus();
    loadIndex();
    document.body.style.overflow = 'hidden';
  }

  // Close search
  function closeSearch() {
    searchOverlay.classList.add('hidden');
    searchInput.value = '';
    searchResults.classList.add('hidden');
    searchResults.innerHTML = '';
    document.body.style.overflow = '';
  }

  // Search logic
  function search(query) {
    if (!searchIndex || !query || query.length < 2) {
      searchResults.classList.add('hidden');
      searchResults.innerHTML = '';
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

    var html = '<div class="space-y-1 search-results-enter">';
    results.forEach(function(r) {
      var item = r.item;
      var snippet = getSnippet(item.content || item.summary || '', query);

      html += '<a href="' + escapeHtml(item.url) + '" class="block px-4 py-3 rounded-lg hover:bg-[var(--bg-subtle)] no-underline transition-colors">' +
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

    searchResults.classList.remove('hidden');
    searchResults.innerHTML = html;
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
    // "/" to open search
    if (e.key === '/' && !searchOverlay.classList.contains('hidden') === false) {
      var active = document.activeElement;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
      e.preventDefault();
      openSearch();
    }
    // Escape to close
    if (e.key === 'Escape' && !searchOverlay.classList.contains('hidden')) {
      closeSearch();
    }
  });

  // Close when clicking outside
  searchOverlay.addEventListener('click', function(e) {
    if (e.target === searchOverlay) {
      closeSearch();
    }
  });
})();
