
/*
 * ----------------------------------------------------------------
 * EventDispatcher
 * ----------------------------------------------------------------
 */
let EventDispatcher = function(target) {
  this._listeners = {};
  this._eventTarget = target || this;
};
EventDispatcher_p = EventDispatcher.prototype;
// 事件监听器
EventDispatcher_p.addEventListener = function(type, callback, scope, useParam, priority) {
  priority = priority || 0;
  var list = this._listeners[type],
    index = 0,
    listener, i;
  if (this === _ticker && !_tickerActive) {
    _ticker.wake();
  }
  if (list == null) {
    this._listeners[type] = list = [];
  }
  i = list.length;
  while (--i > -1) {
    listener = list[i];
    if (listener.c === callback && listener.s === scope) {
      list.splice(i, 1);
    } else if (index === 0 && listener.pr < priority) {
      index = i + 1;
    }
  }
  list.splice(index, 0, {c:callback, s:scope, up:useParam, pr:priority});
};
// 事件删除
EventDispatcher_p.removeEventListener = function(type, callback) {
  var list = this._listeners[type], i;
  if (list) {
    i = list.length;
    while (--i > -1) {
      if (list[i].c === callback) {
        list.splice(i, 1);
        return;
      }
    }
  }
};
// 事件触发器
EventDispatcher_p.dispatchEvent = function(type) {
  var list = this._listeners[type],
    i, t, listener;
  if (list) {
    i = list.length;
    if (i > 1) { 
      list = list.slice(0); //in case addEventListener() is called from within a listener/callback (otherwise the index could change, resulting in a skip)
    }
    t = this._eventTarget;
    while (--i > -1) {
      listener = list[i];
      if (listener) {
        if (listener.up) {
          listener.c.call(listener.s || t, {type:type, target:t});
        } else {
          listener.c.call(listener.s || t);
        }
      }
    }
  }
};
