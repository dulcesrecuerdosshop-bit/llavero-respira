// menu-tuner-hide-respirar-compartir.js
// v1.1 - Robust hiding: ensure menu items "Respirar" and "Compartir app" are removed (display:none)
// - Hides the closest menu-item container (li / immediate child of panel / role=menuitem ancestor)
// - Matches by data-action, id, or visible text (case-insensitive) and also handles icons/emoji inside labels
// - Uses a MutationObserver scoped to the menu panel to re-hide dynamically inserted items
// - Keeps ordering functionality but hiding is now enforced on the container element
// - API: window.MenuTuner.apply(), .restore(), .setOrder(orderArray), .getMenuPanel()
//
// Replace the existing file with this one or paste into console to test.

(function(){
  'use strict';

  if (window._menu_tuner_loaded_v11) {
    console.debug('[MenuTuner v1.1] already loaded - skipping');
    return;
  }
  window._menu_tuner_loaded_v11 = true;

  var MENU_PANEL_SELECTORS = ['#menuPanel', '.menu-panel', '[role="menu"]'];
  var HIDDEN_ATTR = 'data-menu-tuner-hidden';
  var ORDER_MARK_ATTR = 'data-menu-tuner-order-applied';
  var OBSERVER = null;
  var PANEL_OBSERVER = null;

  // Definitions for items to hide (data-action tokens / id tokens / visible text tokens)
  var HIDE_DEFS = [
    { key: 'breath', tokens: ['breath','respir','respirar','respira','🌬','breathBtn','breath_btn'] },
    { key: 'share',  tokens: ['share','compartir','compartir app','compartir-app','share-app'] }
  ];

  var DEFAULT_ORDER = ['favorite','enable-audio','settings','show-favorites'];

  function findMenuPanel(){
    for (var i=0;i<MENU_PANEL_SELECTORS.length;i++){
      try {
        var el = document.querySelector(MENU_PANEL_SELECTORS[i]);
        if(el) return el;
      } catch(e){}
    }
    return null;
  }

  function norm(s){
    if(!s) return '';
    return s.toString().trim().toLowerCase().replace(/\s+/g,' ');
  }

  // Given an element inside the menu (e.g. button), find the enclosing menu-item container we should hide.
  // Strategy:
  // - If element.closest('li') within panel, use that.
  // - Else climb ancestors until direct child of panel; return that direct child.
  // - Else return the element itself.
  function findMenuItemContainer(panel, el){
    try {
      if(!panel || !el) return null;
      // prefer li or [role="menuitem"]
      var li = el.closest && el.closest('li');
      if(li && panel.contains(li)) return li;
      var roleItem = el.closest && el.closest('[role="menuitem"]');
      if(roleItem && panel.contains(roleItem)) return roleItem;
      // climb until immediate child of panel
      var cur = el;
      var last = el;
      while(cur && cur !== document.body && cur.parentElement && cur.parentElement !== panel){
        last = cur;
        cur = cur.parentElement;
      }
      // if cur.parentElement === panel, cur is the child; else last might be ok
      if(cur && cur.parentElement === panel) return cur;
      if(last && last.parentElement === panel) return last;
      // fallback: the element itself (if it's a direct child of panel)
      if(el.parentElement === panel) return el;
      return el;
    } catch(e){ return el; }
  }

  // Determine if a given menu-item (or inner element) matches any hide def
  function matchesHideDef(el, def){
    try {
      if(!el) return false;
      // check data-action and id attributes
      var da = (el.getAttribute && (el.getAttribute('data-action') || el.id || '')) || '';
      da = norm(da);
      for(var i=0;i<def.tokens.length;i++){
        var t = def.tokens[i].toLowerCase();
        if(t && da.indexOf(t) !== -1) return true;
      }
      // check visible text inside the element (strip icons)
      var text = norm((el.textContent || el.innerText || ''));
      for(var j=0;j<def.tokens.length;j++){
        var t2 = def.tokens[j].toLowerCase();
        if(t2 && text.indexOf(t2) !== -1) return true;
      }
    } catch(e){}
    return false;
  }

  // Hide a menu item container element (display:none) and mark it
  function hideContainer(node, defKey){
    try {
      if(!node || !(node instanceof Element)) return false;
      // Defensive: do not hide if node is clearly the menu panel itself or outside it
      var panel = findMenuPanel();
      if(!panel || !panel.contains(node)) return false;
      // Apply display none
      node.style.display = 'none';
      node.setAttribute(HIDDEN_ATTR, defKey || 'hidden');
      console.debug('[MenuTuner] hid menu container for', defKey, node);
      return true;
    } catch(e){ return false; }
  }

  // Scan the menu for candidates and hide matched items (works on nested structures)
  function hideMenuEntries(){
    var panel = findMenuPanel();
    if(!panel) return false;
    var candidates = Array.from(panel.querySelectorAll('button, a, [role="menuitem"], li, [data-action]'));
    var any = false;
    // For each candidate, get its container and test each def
    candidates.forEach(function(cand){
      try {
        var container = findMenuItemContainer(panel, cand);
        if(!container) return;
        // If already hidden by us, skip
        if(container.getAttribute && container.getAttribute(HIDDEN_ATTR)) return;
        for(var i=0;i<HIDE_DEFS.length;i++){
          if(matchesHideDef(container, HIDE_DEFS[i]) || matchesHideDef(cand, HIDE_DEFS[i])){
            if(hideContainer(container, HIDE_DEFS[i].key)) { any = true; break; }
          }
        }
      } catch(e){}
    });
    return any;
  }

  // Apply ordering: move child containers that match order keys to top in that order
  function applyOrder(orderKeys){
    var panel = findMenuPanel();
    if(!panel) return false;
    orderKeys = Array.isArray(orderKeys) && orderKeys.length ? orderKeys : DEFAULT_ORDER.slice(0);
    // Build arrays of actual item containers (direct children or relevant elements)
    var allChildren = Array.from(panel.children);
    // Flatten: if child is a wrapper that contains buttons, treat child as item
    var remaining = allChildren.slice(0);
    var ordered = [];
    orderKeys.forEach(function(key){
      key = key.toLowerCase();
      for(var i=0;i<remaining.length;i++){
        var ch = remaining[i];
        var da = norm(ch.getAttribute && (ch.getAttribute('data-action') || ch.id || '') || '');
        var txt = norm(ch.textContent || ch.innerText || '');
        if((da && da.indexOf(key) !== -1) || (txt && txt.indexOf(key) !== -1)){
          ordered.push(ch);
          remaining.splice(i,1);
          return;
        }
      }
    });
    // append ordered then remaining; appending existing nodes moves them
    try {
      ordered.concat(remaining).forEach(function(n){ panel.appendChild(n); });
      panel.setAttribute(ORDER_MARK_ATTR,'1');
      return true;
    } catch(e){
      return false;
    }
  }

  // Restore: reveal nodes hidden by this tuner and remove order mark
  function restoreMenu(){
    var panel = findMenuPanel();
    if(!panel) return false;
    var hidden = panel.querySelectorAll('['+HIDDEN_ATTR+']');
    Array.from(hidden).forEach(function(n){
      try { n.style.display = ''; n.removeAttribute(HIDDEN_ATTR); } catch(e){}
    });
    if(panel.hasAttribute(ORDER_MARK_ATTR)) panel.removeAttribute(ORDER_MARK_ATTR);
    // disconnect observer
    if(OBSERVER){ try{ OBSERVER.disconnect(); } catch(e){} OBSERVER = null; }
    return true;
  }

  // Start observer on the menu panel to re-apply hiding when dynamic changes occur
  function startPanelObserver(){
    var panel = findMenuPanel();
    if(!panel) return;
    if(PANEL_OBSERVER) try { PANEL_OBSERVER.disconnect(); } catch(e) {}
    PANEL_OBSERVER = new MutationObserver(function(muts){
      // if children added or attributes changed, re-run hide
      var relevant = muts.some(function(m){ return (m.addedNodes && m.addedNodes.length>0) || (m.type === 'attributes'); });
      if(relevant) {
        setTimeout(hideMenuEntries, 40);
      }
    });
    try { PANEL_OBSERVER.observe(panel, { childList:true, subtree:true, attributes:true, attributeFilter:['id','class','data-action'] }); } catch(e){}
  }

  // Auto-apply once (safe) and start observers
  function applyDefaults(){
    try {
      var hid = hideMenuEntries();
      applyOrder(DEFAULT_ORDER);
      startPanelObserver();
      // Also observe body for panel insertion (SPA)
      if(!OBSERVER){
        OBSERVER = new MutationObserver(function(muts){
          var added = muts.some(function(m){ return m.addedNodes && m.addedNodes.length>0; });
          if(added){
            setTimeout(function(){ hideMenuEntries(); startPanelObserver(); }, 80);
          }
        });
        try { OBSERVER.observe(document.body, { childList:true, subtree:true }); } catch(e){}
      }
      return true;
    } catch(e){ return false; }
  }

  // Public API
  window.MenuTuner = window.MenuTuner || {};
  window.MenuTuner.apply = function(opts){
    opts = opts || {};
    var order = opts.order || DEFAULT_ORDER;
    var res = applyDefaults();
    if(order && Array.isArray(order) && order.length) applyOrder(order);
    return res;
  };
  window.MenuTuner.restore = function(){ try { if(PANEL_OBSERVER){ PANEL_OBSERVER.disconnect(); PANEL_OBSERVER = null; } if(OBSERVER){ OBSERVER.disconnect(); OBSERVER = null; } return restoreMenu(); } catch(e){ return false; } };
  window.MenuTuner.setOrder = function(orderArray){ return applyOrder(orderArray); };
  window.MenuTuner.getMenuPanel = findMenuPanel;

  // Auto-run shortly after load
  setTimeout(function(){ try { window.MenuTuner.apply(); console.debug('[MenuTuner v1.1] applied'); } catch(e){ console.warn('[MenuTuner] auto apply failed', e); } }, 160);

  console.debug('[MenuTuner v1.1] loaded');

})();
