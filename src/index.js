/*
 * ----------------------------------------------------------------
 * EventDispatcher  事件触发器
 * ----------------------------------------------------------------
 */
let _emptyFunc = function () {};

let EventDispatcher = function (target) {
  this._listeners = {};
  this._eventTarget = target || this;
};
EventDispatcher_p = EventDispatcher.prototype;
// 事件监听器
EventDispatcher_p.addEventListener = function (
  type,
  callback,
  scope,
  useParam,
  priority
) {
  priority = priority || 0;
  var list = this._listeners[type],
    index = 0,
    listener,
    i;
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
  list.splice(index, 0, { c: callback, s: scope, up: useParam, pr: priority });
};
// 事件删除
EventDispatcher_p.removeEventListener = function (type, callback) {
  var list = this._listeners[type],
    i;
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
EventDispatcher_p.dispatchEvent = function (type) {
  var list = this._listeners[type],
    i,
    t,
    listener;
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
          listener.c.call(listener.s || t, { type: type, target: t });
        } else {
          listener.c.call(listener.s || t);
        }
      }
    }
  }
};

/* 
  Ticker 心脏
  时间轮询器，负责按帧循环，触发动画播放，
  功能： 
  1、循环调用，实时校准当前时间；
  2、记录当前，播放帧数；
  3、停止循环
  4、判断，requestAnimationFrame是否可以使用，requestAnimationFrame的兼容
  5、按时触发执行动画的事件 dispatchEvent
*/
let _reqAnimFrame = window.requestAnimationFrame,
  _cancelAnimFrame = window.cancelAnimationFrame,
  _getTime =
    Date.now ||
    function () {
      return new Date().getTime();
    },
  _lastUpdate = _getTime(),
  _tickWord = "tick",
  _tinyNum = 0.00000001,
  _tickerActive = false;

let Ticker = function (fps, useRAF) {
  let _self = this,
    _startTime = _getTime(), // 开始时间
    _useRAF = useRAF !== false && _reqAnimFrame ? "auto" : false,
    _lagThreshold = 500, // 滞后时间
    _adjustedLag = 33,
    _fps,
    _req,
    _id,
    _gap,
    _tick = function (manual) {
      var elapsed = _getTime() - _lastUpdate, // 距离上次的时间
        dispatch;

      if (elapsed > _lagThreshold) {
        // 滞后时间对比
        _startTime += elapsed - _adjustedLag;
      }
      _lastUpdate += elapsed;
      _self.time = (_lastUpdate - _startTime) / 1000;
      // console.log('_self.time', _self.time)
      // console.log('elapsed', elapsed)

      if (!_fps || manual === true) {
        _self.frame++;
        dispatch = true;
      }

      if (manual !== true) {
        console.log('_req', _self.time)
        _id = _req(_tick);
      }

      if (dispatch) {
        _self.dispatchEvent(_tickWord);
      }
    };

  // EventDispatcher.call(_self);
  _self.time = _self.frame = 0;

  _self.sleep = function () {
    if (_id == null) {
      return;
    }
    if (!_useRAF || !_cancelAnimFrame) {
      clearTimeout(_id);
    } else {
      _cancelAnimFrame(_id);
    }
    _req = _emptyFunc;
    _id = null;

    _tickerActive = false;
  };

  _self.wake = function (seamless) {
    if (_id !== null) {
      _self.sleep();
    } else if (seamless) {
      _startTime += -_lastUpdate + (_lastUpdate = _getTime());
    } else if (_self.frame > 10) {
      //don't trigger lagSmoothing if we're just waking up, and make sure that at least 10 frames have elapsed because of the iOS bug that we work around below with the 1.5-second setTimout().
      _lastUpdate = _getTime() - _lagThreshold + 5;
    }
    _req =
      _fps === 0
        ? _emptyFunc
        : !_useRAF || !_reqAnimFrame
        ? function (f) {
            return setTimeout(f, _gap * 1000);
          }
        : _reqAnimFrame;

    _tickerActive = true;
    // console.log('seamless',_id, seamless);
    _tick(2);
  };

  _self.fps = function (value) {
    if (!arguments.length) {
      return _fps;
    }

    _fps = value;
    _gap = 1 / (_fps || 60);
    _self.wake();
  };

  // 开始启动
  _self.fps(fps);
};

Ticker.prototype = new EventDispatcher();
Ticker.prototype.constructor = Ticker;



/*
 * ----------------------------------------------------------------
 * Animation
 * 动画
 * ----------------------------------------------------------------
 */

/*
 * ----------------------------------------------------------------
   BrainLite
 * 单元播放器 负责收集和处理动画播放的数值
   功能：
   1、收集参数，处理每个值得分片执行
   2、分发执行，嵌入的回调任务
   3、控制任务停止
   4、收集动画播放的事件
 * ----------------------------------------------------------------
 */

var TweenLite = function (target, duration, vars) {
    // Animation.call(this, duration, vars);
    this.vars = vars = vars || {};
    this._duration = this._totalDuration = duration || 0;
    this._onUpdate = vars.onUpdate;
    this._timeScale = 1;
    

    if (target == null) {
      throw "Cannot tween a null target.";
    }

    this.target = target;
    this._propLookup = {};
    this._siblings = _register(target, this, false);
    
    
  },
  _isSelector = function (v) {
    return (
      v &&
      v.length &&
      v !== window &&
      v[0] &&
      (v[0] === window || (v[0].nodeType && v[0].style && !v.nodeType))
    ); //we cannot check "nodeType" if the target is window from within an iframe, otherwise it will trigger a security error in some browsers like Firefox.
  };

  let _ticker = TweenLite.ticker = new Ticker();
  TweenLite_p = TweenLite.prototype;

//----TweenLite defaults, overwrite management, and root updates ----------------------------------------------------

  TweenLite_p.ratio = 0;
  TweenLite_p._firstPT = TweenLite_p._targets = TweenLite_p._overwrittenProps = TweenLite_p._startAt = null;


  TweenLite.version = "2.1.2";
  TweenLite.defaultEase = TweenLite_p._ease = {};
  TweenLite.ticker = _ticker;
  TweenLite.autoSleep = 120;

var _lazyTweens = [],
  _lazyLookup = {},
  _numbersExp = /(?:(-|-=|\+=)?\d*\.?\d*(?:e[\-+]?\d+)?)[0-9]/gi,
  _relExp = /[\+-]=-?[\.\d]/,
  _setRatio = function (v) {
    var pt = this._firstPT,
      min = 0.000001,
      val;
    while (pt) {
      val = !pt.blob
        ? pt.c * v + pt.s
        : v === 1 && this.end != null
        ? this.end
        : v
        ? this.join("")
        : this.start;
      if (pt.m) {
        val = pt.m.call(this._tween, val, this._target || pt.t, this._tween);
      } else if (val < min)
        if (val > -min && !pt.blob) {
          //prevents issues with converting very small numbers to strings in the browser
          val = 0;
        }
      if (!pt.f) {
        pt.t[pt.p] = val;
      } else if (pt.fp) {
        pt.t[pt.p](pt.fp, val);
      } else {
        pt.t[pt.p](val);
      }
      pt = pt._next;
    }
  },
  _blobRound = function (v) {
    return ((v * 1000) | 0) / 1000 + "";
  },
  _blobDif = function (start, end, filter, pt) {
    var a = [],
      charIndex = 0,
      s = "",
      color = 0,
      startNums,
      endNums,
      num,
      i,
      l,
      nonNumbers,
      currentNum;
    a.start = start;
    a.end = end;
    start = a[0] = start + ""; //ensure values are strings
    end = a[1] = end + "";
    if (filter) {
      filter(a); //pass an array with the starting and ending values and let the filter do whatever it needs to the values.
      start = a[0];
      end = a[1];
    }
    a.length = 0;
    startNums = start.match(_numbersExp) || [];
    endNums = end.match(_numbersExp) || [];
    if (pt) {
      pt._next = null;
      pt.blob = 1;
      a._firstPT = a._applyPT = pt; //apply last in the linked list (which means inserting it first)
    }
    l = endNums.length;
    for (i = 0; i < l; i++) {
      currentNum = endNums[i];
      nonNumbers = end.substr(
        charIndex,
        end.indexOf(currentNum, charIndex) - charIndex
      );
      s += nonNumbers || !i ? nonNumbers : ","; //note: SVG spec allows omission of comma/space when a negative sign is wedged between two numbers, like 2.5-5.3 instead of 2.5,-5.3 but when tweening, the negative value may switch to positive, so we insert the comma just in case.
      charIndex += nonNumbers.length;
      if (color) {
        //sense rgba() values and round them.
        color = (color + 1) % 5;
      } else if (nonNumbers.substr(-5) === "rgba(") {
        color = 1;
      }
      if (currentNum === startNums[i] || startNums.length <= i) {
        s += currentNum;
      } else {
        if (s) {
          a.push(s);
          s = "";
        }
        num = parseFloat(startNums[i]);
        a.push(num);
        a._firstPT = {
          _next: a._firstPT,
          t: a,
          p: a.length - 1,
          s: num,
          c:
            (currentNum.charAt(1) === "="
              ? parseInt(currentNum.charAt(0) + "1", 10) *
                parseFloat(currentNum.substr(2))
              : parseFloat(currentNum) - num) || 0,
          f: 0,
          m: color && color < 4 ? Math.round : _blobRound,
        }; //limiting to 3 decimal places and casting as a string can really help performance when array.join() is called!
        //note: we don't set _prev because we'll never need to remove individual PropTweens from this list.
      }
      charIndex += currentNum.length;
    }
    s += end.substr(charIndex);
    if (s) {
      a.push(s);
    }
    a.setRatio = _setRatio;
    if (_relExp.test(end)) {
      //if the end string contains relative values, delete it so that on the final render (in _setRatio()), we don't actually set it to the string with += or -= characters (forces it to use the calculated value).
      a.end = null;
    }
    return a;
  },
  //note: "funcParam" is only necessary for function-based getters/setters that require an extra parameter like getAttribute("width") and setAttribute("width", value). In this example, funcParam would be "width". Used by AttrPlugin for example.
  _addPropTween = function (
    target,
    prop,
    start,
    end,
    overwriteProp,
    mod,
    funcParam,
    stringFilter,
    index
  ) {
    if (typeof end === "function") {
      end = end(index || 0, target);
    }
    var type = typeof target[prop],
      getterName =
        type !== "function"
          ? ""
          : prop.indexOf("set") ||
            typeof target["get" + prop.substr(3)] !== "function"
          ? prop
          : "get" + prop.substr(3),
      s =
        start !== "get"
          ? start
          : !getterName
          ? target[prop]
          : funcParam
          ? target[getterName](funcParam)
          : target[getterName](),
      isRelative = typeof end === "string" && end.charAt(1) === "=",
      pt = {
        t: target,
        p: prop,
        s: s,
        f: type === "function",
        pg: 0,
        n: overwriteProp || prop,
        m: !mod ? 0 : typeof mod === "function" ? mod : Math.round,
        pr: 0,
        c: isRelative
          ? parseInt(end.charAt(0) + "1", 10) * parseFloat(end.substr(2))
          : parseFloat(end) - s || 0,
      },
      blob;

    if (typeof s !== "number" || (typeof end !== "number" && !isRelative)) {
      if (
        funcParam ||
        isNaN(s) ||
        (!isRelative && isNaN(end)) ||
        typeof s === "boolean" ||
        typeof end === "boolean"
      ) {
        //a blob (string that has multiple numbers in it)
        pt.fp = funcParam;
        blob = _blobDif(
          s,
          isRelative
            ? parseFloat(pt.s) + pt.c + (pt.s + "").replace(/[0-9\-\.]/g, "")
            : end,
          stringFilter || TweenLite.defaultStringFilter,
          pt
        );
        pt = {
          t: blob,
          p: "setRatio",
          s: 0,
          c: 1,
          f: 2,
          pg: 0,
          n: overwriteProp || prop,
          pr: 0,
          m: 0,
        }; //"2" indicates it's a Blob property tween. Needed for RoundPropsPlugin for example.
      } else {
        pt.s = parseFloat(s);
        if (!isRelative) {
          pt.c = parseFloat(end) - pt.s || 0;
        }
      }
    }
    if (pt.c) {
      //only add it to the linked list if there's a change.
      if ((pt._next = this._firstPT)) {
        pt._next._prev = pt;
      }
      this._firstPT = pt;
      return pt;
    }
  },
  _internals = (TweenLite._internals = {
    // isArray: _isArray,
    // isSelector: _isSelector,
    // lazyTweens: _lazyTweens,
    // blobDif: _blobDif,
  }), //gives us a way to expose certain private values to other GreenSock classes without contaminating tha main TweenLite object.
  _tweenLookup = (_internals.tweenLookup = {}),
  _tweenLookupNum = 0,
  _reservedProps = (_internals.reservedProps = {
    ease: 1,
    delay: 1,
    overwrite: 1,
    onComplete: 1,
    onCompleteParams: 1,
    onCompleteScope: 1,
    useFrames: 1,
    runBackwards: 1,
    startAt: 1,
    onUpdate: 1,
    onUpdateParams: 1,
    onUpdateScope: 1,
    onStart: 1,
    onStartParams: 1,
    onStartScope: 1,
    onReverseComplete: 1,
    onReverseCompleteParams: 1,
    onReverseCompleteScope: 1,
    onRepeat: 1,
    onRepeatParams: 1,
    onRepeatScope: 1,
    easeParams: 1,
    yoyo: 1,
    immediateRender: 1,
    repeat: 1,
    repeatDelay: 1,
    data: 1,
    paused: 1,
    reversed: 1,
    autoCSS: 1,
    lazy: 1,
    onOverwrite: 1,
    callbackScope: 1,
    stringFilter: 1,
    id: 1,
    yoyoEase: 1,
    stagger: 1,
  }),
  _overwriteLookup = {
    none: 0,
    all: 1,
    auto: 2,
    concurrent: 3,
    allOnStart: 4,
    preexisting: 5,
    true: 1,
    false: 0,
  };
//   _rootFramesTimeline = (Animation._rootFramesTimeline = new SimpleTimeline()),
//   _rootTimeline = (Animation._rootTimeline = new SimpleTimeline()),
  _nextGCFrame = 150;

TweenLite._startTime = _ticker.time;
TweenLite._frame = _ticker.frame;
TweenLite._active = true;

let AnimationRoot = function () {
  var i, a, p;
  // console.log('TweenLite', TweenLite.render);
  // return;
  // console.log('_rootTimeline._startTime', (_ticker.time - TweenLite._startTime) * TweenLite._timeScale)
  Tween.render(
    (_ticker.time - TweenLite._startTime) * Tween._timeScale,
    false,
    false
  );

  if (_ticker.frame >= _nextGCFrame) {
    
  }
};

_ticker.addEventListener("tick", AnimationRoot);

var _register = function (target, tween, scrub) {
  var id = target._gsTweenID,
    a,
    i;
  if (!_tweenLookup[id || (target._gsTweenID = id = "t" + _tweenLookupNum++)]) {
    _tweenLookup[id] = { target: target, tweens: [] };
  }
  if (tween) {
    a = _tweenLookup[id].tweens;
    a[(i = a.length)] = tween;
    if (scrub) {
      while (--i > -1) {
        if (a[i] === tween) {
          a.splice(i, 1);
        }
      }
    }
  }
  return _tweenLookup[id].tweens;
};

//---- TweenLite instance methods -----------------------------------------------------------------------------

TweenLite_p._init = function () {
  var v = this.vars,
    op = this._overwrittenProps,
    i,
    l;
 
  this._ease = {
    _func: null,
    _params: [0, 0, 1, 1],
    _power: 1,
    _type: 1
  };
  this._easeType = 1;
  this._easePower = this._ease._power;
  this._firstPT = null;

  if (this._targets) {
    l = this._targets.length;
    for (i = 0; i < l; i++) {
      if (
        this._initProps(
          this._targets[i],
          (this._propLookup[i] = {}),
          this._siblings[i],
          op ? op[i] : null,
          i
        )
      ) {
        initPlugins = true;
      }
    }
  } else {
    initPlugins = this._initProps(
      this.target,
      this._propLookup,
      this._siblings,
      op,
      0
    );
  }
  // console.log(v);
  // this._onUpdate = v.onUpdate;
  this._initted = true;
};

TweenLite_p._initProps = function (
  target,
  propLookup,
  siblings,
  overwrittenProps,
  index
) {
  var p, i, initPlugins, plugin, pt, v;
  if (target == null) {
    return false;
  }

  
  for (p in this.vars) {
    v = this.vars[p];
    
    propLookup[p] = _addPropTween.call(
      this,
      target,
      p,
      "get",
      v,
      p,
      0,
      null,
      this.vars.stringFilter,
      index
    );
      // console.log('propLookup[p]', propLookup[p]);
    
  }

  if (this._overwrite > 1)
    if (this._firstPT)
      if (siblings.length > 1)
        if (
          _applyOverwrite(target, this, propLookup, this._overwrite, siblings)
        ) {
          this._kill(propLookup, target);
          return this._initProps(
            target,
            propLookup,
            siblings,
            overwrittenProps,
            index
          );
        }
  if (this._firstPT)
    if (
      (this.vars.lazy !== false && this._duration) ||
      (this.vars.lazy && !this._duration)
    ) {
      //zero duration tweens don't lazy render by default; everything else does.
      _lazyLookup[target._gsTweenID] = true;
    }
  return initPlugins;
};

TweenLite_p.render = function (time, suppressEvents, force) {
  var self = this,
    prevTime = self._time,
    duration = self._duration,
    isComplete,
    pt;

  if (time >= duration - _tinyNum && time >= 0) { //to work around occasional floating point math artifacts.
    self._totalTime = self._time = duration;
    self.ratio = 1;
    if (!self._reversed ) {
      isComplete = true;
      callback = "onComplete";
    }
    setTimeout(() => {
      _ticker.sleep();
    }, 1000);
  }else{
    
    self._totalTime = self._time = time;

    if (self._easeType) {
      var r = time / duration,
        type = self._easeType,
        pow = self._easePower;
      if (type === 1 || (type === 3 && r >= 0.5)) {
        r = 1 - r;
      }
      if (type === 3) {
        r *= 2;
      }
      if (pow === 1) {
        r *= r;
      } else if (pow === 2) {
        r *= r * r;
      } else if (pow === 3) {
        r *= r * r * r;
      } else if (pow === 4) {
        r *= r * r * r * r;
      }
      self.ratio =
        type === 1
          ? 1 - r
          : type === 2
          ? r
          : time / duration < 0.5
          ? r / 2
          : 1 - r / 2;
    } else {
      self.ratio = (time / duration);
    }
  }
  
  if (self._time === prevTime && !force) {
    // console.log('self', self._time);
    // 动画执行完成不在渲染
    return;
  } else if (!self._initted) {
    self._init();
    
  }
  
  pt = self._firstPT;
  
  while (pt) {
    if (pt.f) {
      pt.t[pt.p](pt.c * self.ratio + pt.s);
    } else {
      pt.t[pt.p] = pt.c * self.ratio + pt.s;
    }
    pt = pt._next;
  }

  // console.log('self', self)
  if (self._onUpdate) {
    if (time < 0)
      if (self._startAt && time !== -0.0001) {
        //if the tween is positioned at the VERY beginning (_startTime 0) of its parent timeline, it's illegal for the playhead to go back further, so we should not render the recorded startAt values.
        self._startAt.render(time, true, force); //note: for performance reasons, we tuck this conditional logic inside less traveled areas (most tweens don't have an onUpdate). We'd just have it at the end before the onComplete, but the values should be updated before any onUpdate is called, so we ALSO put it here and then if it's not called, we do so later near the onComplete.
      }
    if (!suppressEvents)
      if (self._time !== prevTime || isComplete || force) {
        // self._callback("onUpdate");
        self._onUpdate()
      }
  }

};
// TweenLite.render = TweenLite.prototype.render; 
// TweenLite._init = TweenLite.prototype._init;//speed optimization (avoid prototype lookup on this "hot" method)
// TweenLite._initProps = TweenLite.prototype._initProps;
//----TweenLite static methods -----------------------------------------------------
let Tween = null;
TweenLite.to = function (target, duration, vars) {
  Tween = new TweenLite(target, duration, vars)
  return Tween;
};
