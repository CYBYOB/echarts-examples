//
export const fixEvalStr = `
(() => {
  /**
   * This function is used to prevent the page from getting stuck
   * for the infinite loop in the user code.
   *
   * @param {string} code the source code
   */
  function handleLoop(code) {
    var AST;
    try {
      AST = acorn.parse(code, {
        ecmaVersion: 'latest',
        sourceType: 'script'
      });
    } catch (e) {
      console.error('failed to parse code', e);
      return code;
    }

    /**
     * Temporarily store the range of positions where the code needs to be inserted
     */
    var fragments = [];
    /**
     * loopID is used to mark the loop
     */
    var loopID = 1;
    /**
     * Mark the code that needs to be inserted when looping
     */
    var insertCode = {
      setMonitor: 'LoopController.loopMonitor(%d);',
      delMonitor: ';LoopController.delLoop(%d);'
    };

    // Traverse the AST to find the loop position
    estraverse.traverse(AST, {
      enter: function enter(node) {
        switch (node.type) {
          case 'WhileStatement':
          case 'DoWhileStatement':
          case 'ForStatement':
          case 'ForInStatement':
          case 'ForOfStatement':
            // Gets the head and tail of the loop body
            var _node$body = node.body,
              start = _node$body.start,
              end = _node$body.end;
            start++;
            var pre = insertCode.setMonitor.replace('%d', loopID);
            var aft = '';
            // If the body of the loop is not enveloped by {} and is indented, we need to manually add {}
            if (node.body.type !== 'BlockStatement') {
              pre = '{' + pre;
              aft = '}';
              --start;
            }
            fragments.push({
              pos: start,
              str: pre
            });
            fragments.push({
              pos: end,
              str: aft
            });
            fragments.push({
              pos: node.end,
              str: insertCode.delMonitor.replace('%d', loopID)
            });
            ++loopID;
            break;
          default:
            break;
        }
      }
    });

    // Insert code to corresponding position
    fragments
      .sort(function (a, b) {
        return b.pos - a.pos;
      })
      .forEach(function (fragment) {
        code =
          code.slice(0, fragment.pos) + fragment.str + code.slice(fragment.pos);
      });
    return code;
  }

  var DebugRect = (function () {
    function DebugRect(style) {
      var dom = (this.dom = document.createElement('div'));
      dom.className = 'ec-debug-dirty-rect';
      style = Object.assign({}, style);
      Object.assign(style, {
        backgroundColor: 'rgba(0, 0, 255, 0.2)',
        border: '1px solid #00f'
      });
      dom.style.cssText =
        'position:absolute;opacity:0;transition:opacity 0.5s linear;pointer-events:none;';
      for (var key in style) {
        if (style.hasOwnProperty(key)) {
          dom.style[key] = style[key];
        }
      }
    }
    DebugRect.prototype.update = function (rect) {
      var domStyle = this.dom.style;
      domStyle.width = rect.width + 'px';
      domStyle.height = rect.height + 'px';
      domStyle.left = rect.x + 'px';
      domStyle.top = rect.y + 'px';
    };
    DebugRect.prototype.hide = function () {
      this.dom.style.opacity = '0';
    };
    DebugRect.prototype.show = function () {
      var _this = this;
      clearTimeout(this._hideTimeout);
      this.dom.style.opacity = '1';
      this._hideTimeout = setTimeout(function () {
        _this.hide();
      }, 500);
    };
    return DebugRect;
  })();
  function showDebugDirtyRect(zr, opts) {
    opts = opts || {};
    var painter = zr.painter;
    if (!painter.getLayers) {
      throw new Error(
        'Debug dirty rect can only been used on canvas renderer.'
      );
    }
    if (painter.isSingleCanvas()) {
      throw new Error(
        'Debug dirty rect can only been used on zrender inited with container.'
      );
    }
    var debugViewRoot = document.createElement('div');
    debugViewRoot.className = 'ec-debug-dirty-rect-container';
    debugViewRoot.style.cssText =
      'position:absolute;left:0;top:0;right:0;bottom:0;pointer-events:none;z-index:9999999;';
    var debugRects = [];
    var dom = zr.dom;
    dom.appendChild(debugViewRoot);
    var computedStyle = getComputedStyle(dom);
    if (computedStyle.position === 'static') {
      dom.style.position = 'relative';
    }
    zr.on('rendered', function () {
      if (painter.getLayers) {
        var idx_1 = 0;
        painter.eachBuiltinLayer(function (layer) {
          if (!layer.debugGetPaintRects) {
            return;
          }
          var paintRects = layer.debugGetPaintRects();
          for (var i = 0; i < paintRects.length; i++) {
            if (!debugRects[idx_1]) {
              debugRects[idx_1] = new DebugRect(opts.style);
              debugViewRoot.appendChild(debugRects[idx_1].dom);
            }
            debugRects[idx_1].show();
            debugRects[idx_1].update(paintRects[i]);
            idx_1++;
          }
        });
        for (var i = idx_1; i < debugRects.length; i++) {
          debugRects[i].hide();
        }
      }
    });
  }

  function _readOnlyError(name) {
    throw new TypeError('"' + name + '" is read-only');
  }
  (function setup(isShared) {
    var sendMessage = function sendMessage(payload) {
      return parent.postMessage(payload, '*');
    };
    var chartStyleEl = document.head.querySelector('#chart-styles');
    var intervalIdList = [];
    var timeoutIdList = [];
    var nativeSetTimeout = window.setTimeout;
    var nativeSetInterval = window.setInterval;
    function setTimeout(func, delay) {
      var id = nativeSetTimeout(func, delay);
      timeoutIdList.push(id);
      return id;
    }
    function setInterval(func, interval) {
      var id = nativeSetInterval(func, interval);
      intervalIdList.push(id);
      return id;
    }
    function clearTimers() {
      intervalIdList.forEach(clearInterval);
      timeoutIdList.forEach(clearTimeout);
      intervalIdList.length = 0;
      timeoutIdList.length = 0;
    }
    var chartEvents = [];
    function wrapChartMethods(chart) {
      var nativeOn = chart.on;
      var nativeSetOption = chart.setOption;
      chart.on = function (eventName) {
        var res = nativeOn.apply(chart, arguments);
        chartEvents.push(eventName);
        return res;
      };
      chart.setOption = function () {
        var startTime = performance.now();
        var res = nativeSetOption.apply(this, arguments);
        var endTime = performance.now();
        sendMessage({
          evt: 'optionUpdated',
          option: JSON.stringify(chart.getOption(), function (key, val) {
            return echarts.util.isFunction(val) ? val + '' : val;
          }),
          updateTime: endTime - startTime
        });
        return res;
      };
    }
    function clearChartEvents(chart) {
      chart && chartEvents.forEach(chart.off.bind(chart));
      chartEvents.length = 0;
    }
    var appStore;
    var chartInstance;
    var appEnv = {};
    var gui;
    var win;
    if (isShared) {
      // override some potentially dangerous API
      win = [
        'addEventListener',
        'removeEventListener',
        'atob',
        'btoa',
        'fetch',
        'getComputedStyle'
      ].reduce(
        function (prev, curr) {
          var val = window[curr];
          prev[curr] = echarts.util.isFunction(val) ? val.bind(window) : val;
          return prev;
        },
        {
          location: Object.freeze(JSON.parse(JSON.stringify(location))),
          document: (function () {
            var disallowedElements = [
              'script',
              'video',
              'audio',
              'iframe',
              'frame',
              'frameset',
              'embed',
              'object',
              // PENDING
              'foreignobject'
            ];
            var disallowedElementsMatcher = new RegExp(
              '<('.concat(disallowedElements.join('|'), ').*>')
            );
            var nativeSetters = {
              innerHTML: Object.getOwnPropertyDescriptor(
                Element.prototype,
                'innerHTML'
              ).set,
              outerHTML: Object.getOwnPropertyDescriptor(
                Element.prototype,
                'outerHTML'
              ).set,
              innerText: Object.getOwnPropertyDescriptor(
                HTMLElement.prototype,
                'innerText'
              ).set,
              outerText: Object.getOwnPropertyDescriptor(
                HTMLElement.prototype,
                'outerText'
              ).set
            };
            ['inner', 'outer'].forEach(function (prop) {
              var htmlProp = prop + 'HTML';
              Object.defineProperty(Element.prototype, htmlProp, {
                set: function set(value) {
                  return (
                    disallowedElementsMatcher.test(value)
                      ? nativeSetters[prop + 'Text']
                      : nativeSetters[htmlProp]
                  ).call(this, value);
                }
              });
            });
            var fakeDoc = document.cloneNode();
            // To enable the created elements to be inserted to body
            // Object.defineProperties(fakeDoc, {
            //   documentElement: {
            //     get() {
            //       return document.documentElement;
            //     }
            //   },
            //   body: {
            //     get() {
            //       return document.body;
            //     }
            //   }
            // });
            [
              ['write', document.write, 0, true],
              ['writeln', document.writeln, 0, true],
              ['createElement', document.createElement, 0],
              ['createElementNS', document.createElementNS, 1]
            ].forEach(function (api) {
              var nativeFn = api[1];
              var argIndx = api[2];
              var fullTextSearch = api[3];
              fakeDoc[api[0]] = function () {
                var val = arguments[argIndx];
                val && (val = val.toLowerCase());
                if (
                  val &&
                  (fullTextSearch
                    ? ((val = val.match(disallowedElementsMatcher)),
                      (val = val && val[1]))
                    : disallowedElements.includes(val))
                ) {
                  return console.error(
                    'Disallowed attempting to create '.concat(val, ' element!')
                  );
                }
                return nativeFn.apply(document, arguments);
              };
            });
            return fakeDoc;
          })(),
          history: void 0,
          parent: void 0,
          top: void 0,
          setTimeout: setTimeout,
          setInterval: setInterval
        }
      );
      [
        'innerHeight',
        'outerHeight',
        'innerWidth',
        'outerWidth',
        'devicePixelRatio',
        'screen'
      ].forEach(function (prop) {
        Object.defineProperty(win, prop, {
          get: function get() {
            return window[prop];
          }
        });
      });
      win.self = win.window = win.globalThis = win;
    }
    var api = {
      dispose: function dispose() {
        if (chartInstance) {
          chartInstance.dispose();
          chartInstance = null;
          appStore = null;
        }
      },
      screenshot: function screenshot(_ref) {
        var filename = _ref.filename;
        var dataURL = chartInstance.getDataURL({
          excludeComponents: ['toolbox']
        });
        var $a = document.createElement('a');
        $a.download = filename;
        $a.target = '_blank';
        $a.href = dataURL;
        $a.click();
      },
      run: function run(_ref2) {
        var store = _ref2.store,
          recreateInstance = _ref2.recreateInstance;
        if (recreateInstance || !chartInstance || chartInstance.isDisposed()) {
          this.dispose();
          chartInstance = echarts.init(
            document.getElementById('chart-container'),
            store.darkMode ? 'dark' : '',
            {
              renderer: store.renderer,
              useDirtyRect: store.useDirtyRect
            }
          );
          if (store.useDirtyRect && store.renderer === 'canvas') {
            try {
              showDebugDirtyRect(chartInstance.getZr(), {
                autoHideDelay: 500
              });
            } catch (e) {
              console.error('failed to show debug dirty rect', e);
            }
          }
          window.addEventListener('resize', function () {
            chartInstance.resize();
            echarts.util.isFunction(appEnv.onresize) && appEnv.onresize();
          });
          wrapChartMethods(chartInstance);
        }

        // TODO Scope the variables in component.
        clearTimers();
        clearChartEvents(chartInstance);
        // Reset
        appEnv = {};
        appStore = store;
        try {
          // run the code
          var compiledCode = store.runCode
            // Replace random method
            .replace(/Math.random\([^)]*\)/g, '__ECHARTS_EXAMPLE_RANDOM__()');
          var echartsExampleRandom = new Math.seedrandom(store.randomSeed);
          // PENDING: create a single panel for CSS code?
          var runCode =
            'var css, option;' +
            handleLoop(compiledCode) +
            'return [option, css];';
          var func;
          var res;
          if (isShared) {
            func = new Function(
              'myChart',
              'app',
              'setTimeout',
              'setInterval',
              'ROOT_PATH',
              '__ECHARTS_EXAMPLE_RANDOM__',
              'top',
              'parent',
              'window',
              'self',
              'globalThis',
              'document',
              'location',
              'histroy',
              'eval',
              'execScript',
              'Function',
              runCode
            ).bind(win);
            res = func(
              chartInstance,
              appEnv,
              setTimeout,
              setInterval,
              store.cdnRoot,
              echartsExampleRandom,
              // prevent someone from trying to close the parent window via top/parent.close()
              // or any other unexpected and dangerous behaviors
              void 0,
              void 0,
              win,
              win,
              win,
              win.document,
              win.location,
              void 0,
              void 0,
              void 0,
              void 0
            );
          } else {
            func = new Function(
              'myChart',
              'app',
              'setTimeout',
              'setInterval',
              'ROOT_PATH',
              '__ECHARTS_EXAMPLE_RANDOM__',
              runCode
            );
            res = func(
              chartInstance,
              appEnv,
              setTimeout,
              setInterval,
              store.cdnRoot,
              echartsExampleRandom
            );
          }
          var css = (chartStyleEl.textContent = res[1] || '');
          sendMessage({
            evt: 'cssParsed',
            css: css
          });
          var option = res[0];
          echarts.util.isObject(option) &&
            chartInstance.setOption(option, true);
        } catch (e) {
          // PENDING: prevent chart can't be updated once error occurs
          chartInstance.__flagInMainProcess = false;
          console.error('failed to run code', e);
          sendMessage({
            evt: 'codeError',
            message: e.message
          });
        }
        if (gui) {
          $(gui.domElement).remove();
          gui.destroy();
          gui = null;
        }
        if (appEnv.config) {
          gui = new dat.GUI({
            autoPlace: false
          });
          $(gui.domElement).css({
            position: 'absolute',
            right: 0,
            top: 0,
            zIndex: 1000
          });
          document.body.append(gui.domElement);
          var configParams = appEnv.configParameters || {};
          var config = appEnv.config;
          for (var name in config) {
            var value = config[name];
            if (name !== 'onChange' && name !== 'onFinishChange') {
              var isColor = void 0;
              var controller = void 0;
              var configVal = configParams[name];
              if (configVal) {
                if (configVal.options) {
                  controller = gui.add(config, name, configVal.options);
                } else if (configVal.min != null) {
                  controller = gui.add(
                    config,
                    name,
                    configVal.min,
                    configVal.max
                  );
                }
              }
              if (typeof value === 'string') {
                try {
                  var colorArr = echarts.color.parse(value);
                  if ((isColor = !!colorArr)) {
                    echarts.color.stringify(colorArr, 'rgba'),
                      _readOnlyError('value');
                  }
                } catch (e) {}
              }
              if (!controller) {
                controller = gui[isColor ? 'addColor' : 'add'](config, name);
              }
              config.onChange && controller.onChange(config.onChange);
              config.onFinishChange &&
                controller.onFinishChange(config.onFinishChange);
            }
          }
        }
      }
    };
    echarts.registerPreprocessor(function (option) {
      if (appStore.enableDecal) {
        option.aria = option.aria || {};
        option.aria.decal = option.aria.decal || {};
        option.aria.decal.show = true;
        option.aria.show = option.aria.enabled = true;
      }
    });
    function handleMessage(ev) {
      // const { action, ...args } = ev.data;
      var action = ev.data.action;
      delete ev.data.action;
      typeof api[action] === 'function' && api[action].apply(api, [ev.data]);
    }
    window.addEventListener('message', handleMessage, false);
    window.addEventListener('error', function () {
      sendMessage({
        evt: 'error'
      });
    });
    window.addEventListener('unhandledrejection', function () {
      sendMessage({
        evt: 'unhandledRejection'
      });
    });
  })(false);
})();
`;
