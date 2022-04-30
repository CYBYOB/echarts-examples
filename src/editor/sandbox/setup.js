export default function setup() {
  const sendMessage = (payload) => parent.postMessage(payload, '*');

  const chartStyleEl = document.head.querySelector('#chart-styles');

  const intervalIdList = [];
  const timeoutIdList = [];

  const nativeSetTimeout = window.setTimeout;
  const nativeSetInterval = window.setInterval;

  function setTimeout(func, delay) {
    const id = nativeSetTimeout(func, delay);
    timeoutIdList.push(id);
    return id;
  }

  function setInterval(func, interval) {
    const id = nativeSetInterval(func, interval);
    intervalIdList.push(id);
    return id;
  }

  function clearTimers() {
    intervalIdList.forEach(clearInterval);
    timeoutIdList.forEach(clearTimeout);
    intervalIdList.length = 0;
    timeoutIdList.length = 0;
  }

  const chartEvents = [];

  function wrapChartMethods(chart) {
    const nativeOn = chart.on;
    const nativeSetOption = chart.setOption;

    chart.on = function (eventName) {
      const res = nativeOn.apply(chart, arguments);
      chartEvents.push(eventName);
      return res;
    };

    chart.setOption = function () {
      const startTime = performance.now();
      const res = nativeSetOption.apply(this, arguments);
      const endTime = performance.now();
      sendMessage({
        evt: 'optionUpdated',
        option: JSON.stringify(chart.getOption(), (key, val) =>
          echarts.util.isFunction(val) ? val + '' : val
        ),
        updateTime: endTime - startTime
      });
      return res;
    };
  }

  function clearChartEvents(chart) {
    chart && chartEvents.forEach(chart.off.bind(chart));
    chartEvents.length = 0;
  }

  let appStore;
  let chartInstance;
  let appEnv = {};
  let gui;

  // override some potentially dangerous API
  const win = [
    'addEventListener',
    'removeEventListener',
    'atob',
    'btoa',
    'fetch',
    'getComputedStyle'
  ].reduce(
    (prev, curr) => {
      const val = window[curr];
      prev[curr] = echarts.util.isFunction(val) ? val.bind(window) : val;
      return prev;
    },
    {
      location: Object.freeze(JSON.parse(JSON.stringify(location))),
      history: void 0,
      parent: void 0,
      top: void 0,
      setTimeout,
      setInterval
    }
  );
  [
    'innerHeight',
    'outerHeight',
    'innerWidth',
    'outerWidth',
    'devicePixelRatio',
    'screen'
  ].forEach((prop) => {
    Object.defineProperty(win, prop, {
      get() {
        return window[prop];
      }
    });
  });
  win.self = win.window = win.globalThis = win;

  const api = {
    dispose() {
      if (chartInstance) {
        chartInstance.dispose();
        chartInstance = null;
        appStore = null;
      }
    },

    screenshot({ filename }) {
      const dataURL = chartInstance.getDataURL({
        excludeComponents: ['toolbox']
      });
      const $a = document.createElement('a');
      $a.download = filename;
      $a.target = '_blank';
      $a.href = dataURL;
      $a.click();
    },

    run({ store, recreateInstance }) {
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
        window.addEventListener('resize', chartInstance.resize);
        wrapChartMethods(chartInstance);
      }

      // TODO Scope the variables in component.
      clearTimers();
      clearChartEvents(chartInstance);
      // Reset
      appEnv.config = null;
      appStore = store;

      try {
        // run the code
        const compiledCode = store.runCode
          // Replace random method
          .replace(/Math.random\([^)]*\)/g, '__ECHARTS_EXAMPLE_RANDOM__()');
        const echartsExampleRandom = new Math.seedrandom(store.randomSeed);

        const func = new Function(
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
          'location',
          'histroy',
          'eval',
          'execScript',
          'Function',
          // PENDING: create a single panel for CSS code?
          'var css, option;' +
            handleLoop(compiledCode) +
            '\nreturn [option, css];'
        ).bind(win);

        const res = func(
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
          win.location,
          void 0,
          void 0,
          void 0,
          void 0
        );

        const css = (chartStyleEl.textContent = res[1] || '');
        sendMessage({
          evt: 'cssParsed',
          css
        });

        const option = res[0];
        echarts.util.isObject(option) && chartInstance.setOption(option, true);
      } catch (e) {
        console.error('failed to run code', e);
        sendMessage({ evt: 'codeError', message: e.message });
      }

      if (gui) {
        $(gui.domElement).remove();
        gui.destroy();
        gui = null;
      }

      if (appEnv.config) {
        gui = new dat.GUI({ autoPlace: false });
        $(gui.domElement).css({
          position: 'absolute',
          right: 0,
          top: 0,
          zIndex: 1000
        });
        document.body.append(gui.domElement);

        const configParams = appEnv.configParameters || {};
        const config = appEnv.config;
        for (const name in config) {
          const value = config[name];
          if (name !== 'onChange' && name !== 'onFinishChange') {
            let isColor;
            let controller;
            const configVal = configParams[name];
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
                const colorArr = echarts.color.parse(value);
                if ((isColor = !!colorArr)) {
                  value = echarts.color.stringify(colorArr, 'rgba');
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
    const action = ev.data.action;
    delete ev.data.action;
    if (action === 'requestProxyRes') {
      return onXHRRes(ev.data);
    }
    typeof api[action] === 'function' && api[action].apply(api, [ev.data]);
  }

  const pendingXHRMap = new Map();

  function onXHRRes(e) {
    const xhr = pendingXHRMap.get(e.reqId);
    if (xhr) {
      const args = xhr.__args.slice();
      if (e.type === 'load') {
        const blob = new Blob([e.res], {
          // FIXME how to determine the response content type
          // to enable jQuery can detect the right type?
          // type: 'application/json'
        });
        const blobURL = URL.createObjectURL(blob);
        args[1] = blobURL;
        xhr.addEventListener('load', () => URL.revokeObjectURL(blobURL));
      } else {
        args[1] = null;
      }
      console.log(args[1]);
      nativeXHROpen.apply(xhr, args);
      nativeXHRSend.apply(xhr);

      pendingXHRMap.delete(e.reqId);
    }
  }

  const nativeXHROpen = XMLHttpRequest.prototype.open;
  const nativeXHRSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function () {
    const args = Array.prototype.slice.call(arguments, 0);
    this.__args = args;
    this.__reqId = args.slice(0, 2).join(':');
    nativeXHROpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function (data) {
    console.log(this);
    pendingXHRMap.set(this.__reqId, this);
    parent.postMessage(
      {
        evt: 'requestProxy',
        args: this.__args,
        reqId: this.__reqId,
        body: data
      },
      '*'
    );
  };

  window.addEventListener('message', handleMessage, false);
  window.addEventListener('error', function () {
    sendMessage({ evt: 'error' });
  });
  window.addEventListener('unhandledrejection', function () {
    sendMessage({ evt: 'unhandledRejection' });
  });
}
