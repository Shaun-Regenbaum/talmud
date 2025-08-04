var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __defNormalProp = (obj, key2, value) => key2 in obj ? __defProp(obj, key2, { enumerable: true, configurable: true, writable: true, value }) : obj[key2] = value;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __publicField = (obj, key2, value) => {
  __defNormalProp(obj, typeof key2 !== "symbol" ? key2 + "" : key2, value);
  return value;
};

// node_modules/.pnpm/unenv@2.0.0-rc.14/node_modules/unenv/dist/runtime/_internal/utils.mjs
function createNotImplementedError(name) {
  return new Error(`[unenv] ${name} is not implemented yet!`);
}
function notImplemented(name) {
  const fn = /* @__PURE__ */ __name(() => {
    throw createNotImplementedError(name);
  }, "fn");
  return Object.assign(fn, { __unenv__: true });
}
function notImplementedClass(name) {
  return class {
    __unenv__ = true;
    constructor() {
      throw new Error(`[unenv] ${name} is not implemented yet!`);
    }
  };
}
var init_utils = __esm({
  "node_modules/.pnpm/unenv@2.0.0-rc.14/node_modules/unenv/dist/runtime/_internal/utils.mjs"() {
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    __name(createNotImplementedError, "createNotImplementedError");
    __name(notImplemented, "notImplemented");
    __name(notImplementedClass, "notImplementedClass");
  }
});

// node_modules/.pnpm/unenv@2.0.0-rc.14/node_modules/unenv/dist/runtime/node/internal/perf_hooks/performance.mjs
var _timeOrigin, _performanceNow, nodeTiming, PerformanceEntry, PerformanceMark, PerformanceMeasure, PerformanceResourceTiming, PerformanceObserverEntryList, Performance, PerformanceObserver, performance;
var init_performance = __esm({
  "node_modules/.pnpm/unenv@2.0.0-rc.14/node_modules/unenv/dist/runtime/node/internal/perf_hooks/performance.mjs"() {
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_utils();
    _timeOrigin = globalThis.performance?.timeOrigin ?? Date.now();
    _performanceNow = globalThis.performance?.now ? globalThis.performance.now.bind(globalThis.performance) : () => Date.now() - _timeOrigin;
    nodeTiming = {
      name: "node",
      entryType: "node",
      startTime: 0,
      duration: 0,
      nodeStart: 0,
      v8Start: 0,
      bootstrapComplete: 0,
      environment: 0,
      loopStart: 0,
      loopExit: 0,
      idleTime: 0,
      uvMetricsInfo: {
        loopCount: 0,
        events: 0,
        eventsWaiting: 0
      },
      detail: void 0,
      toJSON() {
        return this;
      }
    };
    PerformanceEntry = class {
      __unenv__ = true;
      detail;
      entryType = "event";
      name;
      startTime;
      constructor(name, options2) {
        this.name = name;
        this.startTime = options2?.startTime || _performanceNow();
        this.detail = options2?.detail;
      }
      get duration() {
        return _performanceNow() - this.startTime;
      }
      toJSON() {
        return {
          name: this.name,
          entryType: this.entryType,
          startTime: this.startTime,
          duration: this.duration,
          detail: this.detail
        };
      }
    };
    __name(PerformanceEntry, "PerformanceEntry");
    PerformanceMark = /* @__PURE__ */ __name(class PerformanceMark2 extends PerformanceEntry {
      entryType = "mark";
      constructor() {
        super(...arguments);
      }
      get duration() {
        return 0;
      }
    }, "PerformanceMark");
    PerformanceMeasure = class extends PerformanceEntry {
      entryType = "measure";
    };
    __name(PerformanceMeasure, "PerformanceMeasure");
    PerformanceResourceTiming = class extends PerformanceEntry {
      entryType = "resource";
      serverTiming = [];
      connectEnd = 0;
      connectStart = 0;
      decodedBodySize = 0;
      domainLookupEnd = 0;
      domainLookupStart = 0;
      encodedBodySize = 0;
      fetchStart = 0;
      initiatorType = "";
      name = "";
      nextHopProtocol = "";
      redirectEnd = 0;
      redirectStart = 0;
      requestStart = 0;
      responseEnd = 0;
      responseStart = 0;
      secureConnectionStart = 0;
      startTime = 0;
      transferSize = 0;
      workerStart = 0;
      responseStatus = 0;
    };
    __name(PerformanceResourceTiming, "PerformanceResourceTiming");
    PerformanceObserverEntryList = class {
      __unenv__ = true;
      getEntries() {
        return [];
      }
      getEntriesByName(_name, _type) {
        return [];
      }
      getEntriesByType(type) {
        return [];
      }
    };
    __name(PerformanceObserverEntryList, "PerformanceObserverEntryList");
    Performance = class {
      __unenv__ = true;
      timeOrigin = _timeOrigin;
      eventCounts = /* @__PURE__ */ new Map();
      _entries = [];
      _resourceTimingBufferSize = 0;
      navigation = void 0;
      timing = void 0;
      timerify(_fn, _options) {
        throw createNotImplementedError("Performance.timerify");
      }
      get nodeTiming() {
        return nodeTiming;
      }
      eventLoopUtilization() {
        return {};
      }
      markResourceTiming() {
        return new PerformanceResourceTiming("");
      }
      onresourcetimingbufferfull = null;
      now() {
        if (this.timeOrigin === _timeOrigin) {
          return _performanceNow();
        }
        return Date.now() - this.timeOrigin;
      }
      clearMarks(markName) {
        this._entries = markName ? this._entries.filter((e3) => e3.name !== markName) : this._entries.filter((e3) => e3.entryType !== "mark");
      }
      clearMeasures(measureName) {
        this._entries = measureName ? this._entries.filter((e3) => e3.name !== measureName) : this._entries.filter((e3) => e3.entryType !== "measure");
      }
      clearResourceTimings() {
        this._entries = this._entries.filter((e3) => e3.entryType !== "resource" || e3.entryType !== "navigation");
      }
      getEntries() {
        return this._entries;
      }
      getEntriesByName(name, type) {
        return this._entries.filter((e3) => e3.name === name && (!type || e3.entryType === type));
      }
      getEntriesByType(type) {
        return this._entries.filter((e3) => e3.entryType === type);
      }
      mark(name, options2) {
        const entry = new PerformanceMark(name, options2);
        this._entries.push(entry);
        return entry;
      }
      measure(measureName, startOrMeasureOptions, endMark) {
        let start;
        let end;
        if (typeof startOrMeasureOptions === "string") {
          start = this.getEntriesByName(startOrMeasureOptions, "mark")[0]?.startTime;
          end = this.getEntriesByName(endMark, "mark")[0]?.startTime;
        } else {
          start = Number.parseFloat(startOrMeasureOptions?.start) || this.now();
          end = Number.parseFloat(startOrMeasureOptions?.end) || this.now();
        }
        const entry = new PerformanceMeasure(measureName, {
          startTime: start,
          detail: {
            start,
            end
          }
        });
        this._entries.push(entry);
        return entry;
      }
      setResourceTimingBufferSize(maxSize) {
        this._resourceTimingBufferSize = maxSize;
      }
      addEventListener(type, listener, options2) {
        throw createNotImplementedError("Performance.addEventListener");
      }
      removeEventListener(type, listener, options2) {
        throw createNotImplementedError("Performance.removeEventListener");
      }
      dispatchEvent(event) {
        throw createNotImplementedError("Performance.dispatchEvent");
      }
      toJSON() {
        return this;
      }
    };
    __name(Performance, "Performance");
    PerformanceObserver = class {
      __unenv__ = true;
      _callback = null;
      constructor(callback) {
        this._callback = callback;
      }
      takeRecords() {
        return [];
      }
      disconnect() {
        throw createNotImplementedError("PerformanceObserver.disconnect");
      }
      observe(options2) {
        throw createNotImplementedError("PerformanceObserver.observe");
      }
      bind(fn) {
        return fn;
      }
      runInAsyncScope(fn, thisArg, ...args) {
        return fn.call(thisArg, ...args);
      }
      asyncId() {
        return 0;
      }
      triggerAsyncId() {
        return 0;
      }
      emitDestroy() {
        return this;
      }
    };
    __name(PerformanceObserver, "PerformanceObserver");
    __publicField(PerformanceObserver, "supportedEntryTypes", []);
    performance = globalThis.performance && "addEventListener" in globalThis.performance ? globalThis.performance : new Performance();
  }
});

// node_modules/.pnpm/unenv@2.0.0-rc.14/node_modules/unenv/dist/runtime/node/perf_hooks.mjs
var init_perf_hooks = __esm({
  "node_modules/.pnpm/unenv@2.0.0-rc.14/node_modules/unenv/dist/runtime/node/perf_hooks.mjs"() {
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_performance();
  }
});

// node_modules/.pnpm/@cloudflare+unenv-preset@2.0.2_unenv@2.0.0-rc.14_workerd@1.20250718.0/node_modules/@cloudflare/unenv-preset/dist/runtime/polyfill/performance.mjs
var init_performance2 = __esm({
  "node_modules/.pnpm/@cloudflare+unenv-preset@2.0.2_unenv@2.0.0-rc.14_workerd@1.20250718.0/node_modules/@cloudflare/unenv-preset/dist/runtime/polyfill/performance.mjs"() {
    init_perf_hooks();
    globalThis.performance = performance;
    globalThis.Performance = Performance;
    globalThis.PerformanceEntry = PerformanceEntry;
    globalThis.PerformanceMark = PerformanceMark;
    globalThis.PerformanceMeasure = PerformanceMeasure;
    globalThis.PerformanceObserver = PerformanceObserver;
    globalThis.PerformanceObserverEntryList = PerformanceObserverEntryList;
    globalThis.PerformanceResourceTiming = PerformanceResourceTiming;
  }
});

// node_modules/.pnpm/unenv@2.0.0-rc.14/node_modules/unenv/dist/runtime/mock/noop.mjs
var noop_default;
var init_noop = __esm({
  "node_modules/.pnpm/unenv@2.0.0-rc.14/node_modules/unenv/dist/runtime/mock/noop.mjs"() {
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    noop_default = Object.assign(() => {
    }, { __unenv__: true });
  }
});

// node_modules/.pnpm/unenv@2.0.0-rc.14/node_modules/unenv/dist/runtime/node/console.mjs
import { Writable } from "node:stream";
var _console, _ignoreErrors, _stderr, _stdout, log, info, trace, debug, table, error, warn, createTask, clear, count, countReset, dir, dirxml, group, groupEnd, groupCollapsed, profile, profileEnd, time, timeEnd, timeLog, timeStamp, Console, _times, _stdoutErrorHandler, _stderrErrorHandler;
var init_console = __esm({
  "node_modules/.pnpm/unenv@2.0.0-rc.14/node_modules/unenv/dist/runtime/node/console.mjs"() {
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_noop();
    init_utils();
    _console = globalThis.console;
    _ignoreErrors = true;
    _stderr = new Writable();
    _stdout = new Writable();
    log = _console?.log ?? noop_default;
    info = _console?.info ?? log;
    trace = _console?.trace ?? info;
    debug = _console?.debug ?? log;
    table = _console?.table ?? log;
    error = _console?.error ?? log;
    warn = _console?.warn ?? error;
    createTask = _console?.createTask ?? /* @__PURE__ */ notImplemented("console.createTask");
    clear = _console?.clear ?? noop_default;
    count = _console?.count ?? noop_default;
    countReset = _console?.countReset ?? noop_default;
    dir = _console?.dir ?? noop_default;
    dirxml = _console?.dirxml ?? noop_default;
    group = _console?.group ?? noop_default;
    groupEnd = _console?.groupEnd ?? noop_default;
    groupCollapsed = _console?.groupCollapsed ?? noop_default;
    profile = _console?.profile ?? noop_default;
    profileEnd = _console?.profileEnd ?? noop_default;
    time = _console?.time ?? noop_default;
    timeEnd = _console?.timeEnd ?? noop_default;
    timeLog = _console?.timeLog ?? noop_default;
    timeStamp = _console?.timeStamp ?? noop_default;
    Console = _console?.Console ?? /* @__PURE__ */ notImplementedClass("console.Console");
    _times = /* @__PURE__ */ new Map();
    _stdoutErrorHandler = noop_default;
    _stderrErrorHandler = noop_default;
  }
});

// node_modules/.pnpm/@cloudflare+unenv-preset@2.0.2_unenv@2.0.0-rc.14_workerd@1.20250718.0/node_modules/@cloudflare/unenv-preset/dist/runtime/node/console.mjs
var workerdConsole, assert, clear2, context, count2, countReset2, createTask2, debug2, dir2, dirxml2, error2, group2, groupCollapsed2, groupEnd2, info2, log2, profile2, profileEnd2, table2, time2, timeEnd2, timeLog2, timeStamp2, trace2, warn2, console_default;
var init_console2 = __esm({
  "node_modules/.pnpm/@cloudflare+unenv-preset@2.0.2_unenv@2.0.0-rc.14_workerd@1.20250718.0/node_modules/@cloudflare/unenv-preset/dist/runtime/node/console.mjs"() {
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_console();
    workerdConsole = globalThis["console"];
    ({
      assert,
      clear: clear2,
      context: (
        // @ts-expect-error undocumented public API
        context
      ),
      count: count2,
      countReset: countReset2,
      createTask: (
        // @ts-expect-error undocumented public API
        createTask2
      ),
      debug: debug2,
      dir: dir2,
      dirxml: dirxml2,
      error: error2,
      group: group2,
      groupCollapsed: groupCollapsed2,
      groupEnd: groupEnd2,
      info: info2,
      log: log2,
      profile: profile2,
      profileEnd: profileEnd2,
      table: table2,
      time: time2,
      timeEnd: timeEnd2,
      timeLog: timeLog2,
      timeStamp: timeStamp2,
      trace: trace2,
      warn: warn2
    } = workerdConsole);
    Object.assign(workerdConsole, {
      Console,
      _ignoreErrors,
      _stderr,
      _stderrErrorHandler,
      _stdout,
      _stdoutErrorHandler,
      _times
    });
    console_default = workerdConsole;
  }
});

// node_modules/.pnpm/wrangler@3.114.12_@cloudflare+workers-types@4.20250801.0/node_modules/wrangler/_virtual_unenv_global_polyfill-@cloudflare-unenv-preset-node-console
var init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console = __esm({
  "node_modules/.pnpm/wrangler@3.114.12_@cloudflare+workers-types@4.20250801.0/node_modules/wrangler/_virtual_unenv_global_polyfill-@cloudflare-unenv-preset-node-console"() {
    init_console2();
    globalThis.console = console_default;
  }
});

// node_modules/.pnpm/unenv@2.0.0-rc.14/node_modules/unenv/dist/runtime/node/internal/process/hrtime.mjs
var hrtime;
var init_hrtime = __esm({
  "node_modules/.pnpm/unenv@2.0.0-rc.14/node_modules/unenv/dist/runtime/node/internal/process/hrtime.mjs"() {
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    hrtime = /* @__PURE__ */ Object.assign(/* @__PURE__ */ __name(function hrtime2(startTime) {
      const now = Date.now();
      const seconds = Math.trunc(now / 1e3);
      const nanos = now % 1e3 * 1e6;
      if (startTime) {
        let diffSeconds = seconds - startTime[0];
        let diffNanos = nanos - startTime[0];
        if (diffNanos < 0) {
          diffSeconds = diffSeconds - 1;
          diffNanos = 1e9 + diffNanos;
        }
        return [diffSeconds, diffNanos];
      }
      return [seconds, nanos];
    }, "hrtime"), { bigint: /* @__PURE__ */ __name(function bigint() {
      return BigInt(Date.now() * 1e6);
    }, "bigint") });
  }
});

// node_modules/.pnpm/unenv@2.0.0-rc.14/node_modules/unenv/dist/runtime/node/internal/tty/read-stream.mjs
import { Socket } from "node:net";
var ReadStream;
var init_read_stream = __esm({
  "node_modules/.pnpm/unenv@2.0.0-rc.14/node_modules/unenv/dist/runtime/node/internal/tty/read-stream.mjs"() {
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    ReadStream = class extends Socket {
      fd;
      constructor(fd) {
        super();
        this.fd = fd;
      }
      isRaw = false;
      setRawMode(mode) {
        this.isRaw = mode;
        return this;
      }
      isTTY = false;
    };
    __name(ReadStream, "ReadStream");
  }
});

// node_modules/.pnpm/unenv@2.0.0-rc.14/node_modules/unenv/dist/runtime/node/internal/tty/write-stream.mjs
import { Socket as Socket2 } from "node:net";
var WriteStream;
var init_write_stream = __esm({
  "node_modules/.pnpm/unenv@2.0.0-rc.14/node_modules/unenv/dist/runtime/node/internal/tty/write-stream.mjs"() {
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    WriteStream = class extends Socket2 {
      fd;
      constructor(fd) {
        super();
        this.fd = fd;
      }
      clearLine(dir3, callback) {
        callback && callback();
        return false;
      }
      clearScreenDown(callback) {
        callback && callback();
        return false;
      }
      cursorTo(x, y, callback) {
        callback && typeof callback === "function" && callback();
        return false;
      }
      moveCursor(dx, dy, callback) {
        callback && callback();
        return false;
      }
      getColorDepth(env2) {
        return 1;
      }
      hasColors(count3, env2) {
        return false;
      }
      getWindowSize() {
        return [this.columns, this.rows];
      }
      columns = 80;
      rows = 24;
      isTTY = false;
    };
    __name(WriteStream, "WriteStream");
  }
});

// node_modules/.pnpm/unenv@2.0.0-rc.14/node_modules/unenv/dist/runtime/node/tty.mjs
var init_tty = __esm({
  "node_modules/.pnpm/unenv@2.0.0-rc.14/node_modules/unenv/dist/runtime/node/tty.mjs"() {
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_read_stream();
    init_write_stream();
  }
});

// node_modules/.pnpm/unenv@2.0.0-rc.14/node_modules/unenv/dist/runtime/node/internal/process/process.mjs
import { EventEmitter } from "node:events";
var Process;
var init_process = __esm({
  "node_modules/.pnpm/unenv@2.0.0-rc.14/node_modules/unenv/dist/runtime/node/internal/process/process.mjs"() {
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_tty();
    init_utils();
    Process = class extends EventEmitter {
      env;
      hrtime;
      nextTick;
      constructor(impl) {
        super();
        this.env = impl.env;
        this.hrtime = impl.hrtime;
        this.nextTick = impl.nextTick;
        for (const prop of [...Object.getOwnPropertyNames(Process.prototype), ...Object.getOwnPropertyNames(EventEmitter.prototype)]) {
          const value = this[prop];
          if (typeof value === "function") {
            this[prop] = value.bind(this);
          }
        }
      }
      emitWarning(warning, type, code) {
        console.warn(`${code ? `[${code}] ` : ""}${type ? `${type}: ` : ""}${warning}`);
      }
      emit(...args) {
        return super.emit(...args);
      }
      listeners(eventName) {
        return super.listeners(eventName);
      }
      #stdin;
      #stdout;
      #stderr;
      get stdin() {
        return this.#stdin ??= new ReadStream(0);
      }
      get stdout() {
        return this.#stdout ??= new WriteStream(1);
      }
      get stderr() {
        return this.#stderr ??= new WriteStream(2);
      }
      #cwd = "/";
      chdir(cwd2) {
        this.#cwd = cwd2;
      }
      cwd() {
        return this.#cwd;
      }
      arch = "";
      platform = "";
      argv = [];
      argv0 = "";
      execArgv = [];
      execPath = "";
      title = "";
      pid = 200;
      ppid = 100;
      get version() {
        return "";
      }
      get versions() {
        return {};
      }
      get allowedNodeEnvironmentFlags() {
        return /* @__PURE__ */ new Set();
      }
      get sourceMapsEnabled() {
        return false;
      }
      get debugPort() {
        return 0;
      }
      get throwDeprecation() {
        return false;
      }
      get traceDeprecation() {
        return false;
      }
      get features() {
        return {};
      }
      get release() {
        return {};
      }
      get connected() {
        return false;
      }
      get config() {
        return {};
      }
      get moduleLoadList() {
        return [];
      }
      constrainedMemory() {
        return 0;
      }
      availableMemory() {
        return 0;
      }
      uptime() {
        return 0;
      }
      resourceUsage() {
        return {};
      }
      ref() {
      }
      unref() {
      }
      umask() {
        throw createNotImplementedError("process.umask");
      }
      getBuiltinModule() {
        return void 0;
      }
      getActiveResourcesInfo() {
        throw createNotImplementedError("process.getActiveResourcesInfo");
      }
      exit() {
        throw createNotImplementedError("process.exit");
      }
      reallyExit() {
        throw createNotImplementedError("process.reallyExit");
      }
      kill() {
        throw createNotImplementedError("process.kill");
      }
      abort() {
        throw createNotImplementedError("process.abort");
      }
      dlopen() {
        throw createNotImplementedError("process.dlopen");
      }
      setSourceMapsEnabled() {
        throw createNotImplementedError("process.setSourceMapsEnabled");
      }
      loadEnvFile() {
        throw createNotImplementedError("process.loadEnvFile");
      }
      disconnect() {
        throw createNotImplementedError("process.disconnect");
      }
      cpuUsage() {
        throw createNotImplementedError("process.cpuUsage");
      }
      setUncaughtExceptionCaptureCallback() {
        throw createNotImplementedError("process.setUncaughtExceptionCaptureCallback");
      }
      hasUncaughtExceptionCaptureCallback() {
        throw createNotImplementedError("process.hasUncaughtExceptionCaptureCallback");
      }
      initgroups() {
        throw createNotImplementedError("process.initgroups");
      }
      openStdin() {
        throw createNotImplementedError("process.openStdin");
      }
      assert() {
        throw createNotImplementedError("process.assert");
      }
      binding() {
        throw createNotImplementedError("process.binding");
      }
      permission = { has: /* @__PURE__ */ notImplemented("process.permission.has") };
      report = {
        directory: "",
        filename: "",
        signal: "SIGUSR2",
        compact: false,
        reportOnFatalError: false,
        reportOnSignal: false,
        reportOnUncaughtException: false,
        getReport: /* @__PURE__ */ notImplemented("process.report.getReport"),
        writeReport: /* @__PURE__ */ notImplemented("process.report.writeReport")
      };
      finalization = {
        register: /* @__PURE__ */ notImplemented("process.finalization.register"),
        unregister: /* @__PURE__ */ notImplemented("process.finalization.unregister"),
        registerBeforeExit: /* @__PURE__ */ notImplemented("process.finalization.registerBeforeExit")
      };
      memoryUsage = Object.assign(() => ({
        arrayBuffers: 0,
        rss: 0,
        external: 0,
        heapTotal: 0,
        heapUsed: 0
      }), { rss: () => 0 });
      mainModule = void 0;
      domain = void 0;
      send = void 0;
      exitCode = void 0;
      channel = void 0;
      getegid = void 0;
      geteuid = void 0;
      getgid = void 0;
      getgroups = void 0;
      getuid = void 0;
      setegid = void 0;
      seteuid = void 0;
      setgid = void 0;
      setgroups = void 0;
      setuid = void 0;
      _events = void 0;
      _eventsCount = void 0;
      _exiting = void 0;
      _maxListeners = void 0;
      _debugEnd = void 0;
      _debugProcess = void 0;
      _fatalException = void 0;
      _getActiveHandles = void 0;
      _getActiveRequests = void 0;
      _kill = void 0;
      _preload_modules = void 0;
      _rawDebug = void 0;
      _startProfilerIdleNotifier = void 0;
      _stopProfilerIdleNotifier = void 0;
      _tickCallback = void 0;
      _disconnect = void 0;
      _handleQueue = void 0;
      _pendingMessage = void 0;
      _channel = void 0;
      _send = void 0;
      _linkedBinding = void 0;
    };
    __name(Process, "Process");
  }
});

// node_modules/.pnpm/@cloudflare+unenv-preset@2.0.2_unenv@2.0.0-rc.14_workerd@1.20250718.0/node_modules/@cloudflare/unenv-preset/dist/runtime/node/process.mjs
var globalProcess, getBuiltinModule, exit, platform, nextTick, unenvProcess, abort, addListener, allowedNodeEnvironmentFlags, hasUncaughtExceptionCaptureCallback, setUncaughtExceptionCaptureCallback, loadEnvFile, sourceMapsEnabled, arch, argv, argv0, chdir, config, connected, constrainedMemory, availableMemory, cpuUsage, cwd, debugPort, dlopen, disconnect, emit, emitWarning, env, eventNames, execArgv, execPath, finalization, features, getActiveResourcesInfo, getMaxListeners, hrtime3, kill, listeners, listenerCount, memoryUsage, on, off, once, pid, ppid, prependListener, prependOnceListener, rawListeners, release, removeAllListeners, removeListener, report, resourceUsage, setMaxListeners, setSourceMapsEnabled, stderr, stdin, stdout, title, throwDeprecation, traceDeprecation, umask, uptime, version, versions, domain, initgroups, moduleLoadList, reallyExit, openStdin, assert2, binding, send, exitCode, channel, getegid, geteuid, getgid, getgroups, getuid, setegid, seteuid, setgid, setgroups, setuid, permission, mainModule, _events, _eventsCount, _exiting, _maxListeners, _debugEnd, _debugProcess, _fatalException, _getActiveHandles, _getActiveRequests, _kill, _preload_modules, _rawDebug, _startProfilerIdleNotifier, _stopProfilerIdleNotifier, _tickCallback, _disconnect, _handleQueue, _pendingMessage, _channel, _send, _linkedBinding, _process, process_default;
var init_process2 = __esm({
  "node_modules/.pnpm/@cloudflare+unenv-preset@2.0.2_unenv@2.0.0-rc.14_workerd@1.20250718.0/node_modules/@cloudflare/unenv-preset/dist/runtime/node/process.mjs"() {
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_hrtime();
    init_process();
    globalProcess = globalThis["process"];
    getBuiltinModule = globalProcess.getBuiltinModule;
    ({ exit, platform, nextTick } = getBuiltinModule(
      "node:process"
    ));
    unenvProcess = new Process({
      env: globalProcess.env,
      hrtime,
      nextTick
    });
    ({
      abort,
      addListener,
      allowedNodeEnvironmentFlags,
      hasUncaughtExceptionCaptureCallback,
      setUncaughtExceptionCaptureCallback,
      loadEnvFile,
      sourceMapsEnabled,
      arch,
      argv,
      argv0,
      chdir,
      config,
      connected,
      constrainedMemory,
      availableMemory,
      cpuUsage,
      cwd,
      debugPort,
      dlopen,
      disconnect,
      emit,
      emitWarning,
      env,
      eventNames,
      execArgv,
      execPath,
      finalization,
      features,
      getActiveResourcesInfo,
      getMaxListeners,
      hrtime: hrtime3,
      kill,
      listeners,
      listenerCount,
      memoryUsage,
      on,
      off,
      once,
      pid,
      ppid,
      prependListener,
      prependOnceListener,
      rawListeners,
      release,
      removeAllListeners,
      removeListener,
      report,
      resourceUsage,
      setMaxListeners,
      setSourceMapsEnabled,
      stderr,
      stdin,
      stdout,
      title,
      throwDeprecation,
      traceDeprecation,
      umask,
      uptime,
      version,
      versions,
      domain,
      initgroups,
      moduleLoadList,
      reallyExit,
      openStdin,
      assert: assert2,
      binding,
      send,
      exitCode,
      channel,
      getegid,
      geteuid,
      getgid,
      getgroups,
      getuid,
      setegid,
      seteuid,
      setgid,
      setgroups,
      setuid,
      permission,
      mainModule,
      _events,
      _eventsCount,
      _exiting,
      _maxListeners,
      _debugEnd,
      _debugProcess,
      _fatalException,
      _getActiveHandles,
      _getActiveRequests,
      _kill,
      _preload_modules,
      _rawDebug,
      _startProfilerIdleNotifier,
      _stopProfilerIdleNotifier,
      _tickCallback,
      _disconnect,
      _handleQueue,
      _pendingMessage,
      _channel,
      _send,
      _linkedBinding
    } = unenvProcess);
    _process = {
      abort,
      addListener,
      allowedNodeEnvironmentFlags,
      hasUncaughtExceptionCaptureCallback,
      setUncaughtExceptionCaptureCallback,
      loadEnvFile,
      sourceMapsEnabled,
      arch,
      argv,
      argv0,
      chdir,
      config,
      connected,
      constrainedMemory,
      availableMemory,
      cpuUsage,
      cwd,
      debugPort,
      dlopen,
      disconnect,
      emit,
      emitWarning,
      env,
      eventNames,
      execArgv,
      execPath,
      exit,
      finalization,
      features,
      getBuiltinModule,
      getActiveResourcesInfo,
      getMaxListeners,
      hrtime: hrtime3,
      kill,
      listeners,
      listenerCount,
      memoryUsage,
      nextTick,
      on,
      off,
      once,
      pid,
      platform,
      ppid,
      prependListener,
      prependOnceListener,
      rawListeners,
      release,
      removeAllListeners,
      removeListener,
      report,
      resourceUsage,
      setMaxListeners,
      setSourceMapsEnabled,
      stderr,
      stdin,
      stdout,
      title,
      throwDeprecation,
      traceDeprecation,
      umask,
      uptime,
      version,
      versions,
      // @ts-expect-error old API
      domain,
      initgroups,
      moduleLoadList,
      reallyExit,
      openStdin,
      assert: assert2,
      binding,
      send,
      exitCode,
      channel,
      getegid,
      geteuid,
      getgid,
      getgroups,
      getuid,
      setegid,
      seteuid,
      setgid,
      setgroups,
      setuid,
      permission,
      mainModule,
      _events,
      _eventsCount,
      _exiting,
      _maxListeners,
      _debugEnd,
      _debugProcess,
      _fatalException,
      _getActiveHandles,
      _getActiveRequests,
      _kill,
      _preload_modules,
      _rawDebug,
      _startProfilerIdleNotifier,
      _stopProfilerIdleNotifier,
      _tickCallback,
      _disconnect,
      _handleQueue,
      _pendingMessage,
      _channel,
      _send,
      _linkedBinding
    };
    process_default = _process;
  }
});

// node_modules/.pnpm/wrangler@3.114.12_@cloudflare+workers-types@4.20250801.0/node_modules/wrangler/_virtual_unenv_global_polyfill-@cloudflare-unenv-preset-node-process
var init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process = __esm({
  "node_modules/.pnpm/wrangler@3.114.12_@cloudflare+workers-types@4.20250801.0/node_modules/wrangler/_virtual_unenv_global_polyfill-@cloudflare-unenv-preset-node-process"() {
    init_process2();
    globalThis.process = process_default;
  }
});

// node_modules/.pnpm/unenv@2.0.0-rc.14/node_modules/unenv/dist/runtime/node/internal/async_hooks/async-hook.mjs
var kInit, kBefore, kAfter, kDestroy, kPromiseResolve, _AsyncHook, createHook, executionAsyncId, executionAsyncResource, triggerAsyncId, asyncWrapProviders;
var init_async_hook = __esm({
  "node_modules/.pnpm/unenv@2.0.0-rc.14/node_modules/unenv/dist/runtime/node/internal/async_hooks/async-hook.mjs"() {
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    kInit = /* @__PURE__ */ Symbol("init");
    kBefore = /* @__PURE__ */ Symbol("before");
    kAfter = /* @__PURE__ */ Symbol("after");
    kDestroy = /* @__PURE__ */ Symbol("destroy");
    kPromiseResolve = /* @__PURE__ */ Symbol("promiseResolve");
    _AsyncHook = class {
      __unenv__ = true;
      _enabled = false;
      _callbacks = {};
      constructor(callbacks = {}) {
        this._callbacks = callbacks;
      }
      enable() {
        this._enabled = true;
        return this;
      }
      disable() {
        this._enabled = false;
        return this;
      }
      get [kInit]() {
        return this._callbacks.init;
      }
      get [kBefore]() {
        return this._callbacks.before;
      }
      get [kAfter]() {
        return this._callbacks.after;
      }
      get [kDestroy]() {
        return this._callbacks.destroy;
      }
      get [kPromiseResolve]() {
        return this._callbacks.promiseResolve;
      }
    };
    __name(_AsyncHook, "_AsyncHook");
    createHook = /* @__PURE__ */ __name(function createHook2(callbacks) {
      const asyncHook = new _AsyncHook(callbacks);
      return asyncHook;
    }, "createHook");
    executionAsyncId = /* @__PURE__ */ __name(function executionAsyncId2() {
      return 0;
    }, "executionAsyncId");
    executionAsyncResource = /* @__PURE__ */ __name(function() {
      return /* @__PURE__ */ Object.create(null);
    }, "executionAsyncResource");
    triggerAsyncId = /* @__PURE__ */ __name(function() {
      return 0;
    }, "triggerAsyncId");
    asyncWrapProviders = Object.assign(/* @__PURE__ */ Object.create(null), {
      NONE: 0,
      DIRHANDLE: 1,
      DNSCHANNEL: 2,
      ELDHISTOGRAM: 3,
      FILEHANDLE: 4,
      FILEHANDLECLOSEREQ: 5,
      BLOBREADER: 6,
      FSEVENTWRAP: 7,
      FSREQCALLBACK: 8,
      FSREQPROMISE: 9,
      GETADDRINFOREQWRAP: 10,
      GETNAMEINFOREQWRAP: 11,
      HEAPSNAPSHOT: 12,
      HTTP2SESSION: 13,
      HTTP2STREAM: 14,
      HTTP2PING: 15,
      HTTP2SETTINGS: 16,
      HTTPINCOMINGMESSAGE: 17,
      HTTPCLIENTREQUEST: 18,
      JSSTREAM: 19,
      JSUDPWRAP: 20,
      MESSAGEPORT: 21,
      PIPECONNECTWRAP: 22,
      PIPESERVERWRAP: 23,
      PIPEWRAP: 24,
      PROCESSWRAP: 25,
      PROMISE: 26,
      QUERYWRAP: 27,
      QUIC_ENDPOINT: 28,
      QUIC_LOGSTREAM: 29,
      QUIC_PACKET: 30,
      QUIC_SESSION: 31,
      QUIC_STREAM: 32,
      QUIC_UDP: 33,
      SHUTDOWNWRAP: 34,
      SIGNALWRAP: 35,
      STATWATCHER: 36,
      STREAMPIPE: 37,
      TCPCONNECTWRAP: 38,
      TCPSERVERWRAP: 39,
      TCPWRAP: 40,
      TTYWRAP: 41,
      UDPSENDWRAP: 42,
      UDPWRAP: 43,
      SIGINTWATCHDOG: 44,
      WORKER: 45,
      WORKERHEAPSNAPSHOT: 46,
      WRITEWRAP: 47,
      ZLIB: 48,
      CHECKPRIMEREQUEST: 49,
      PBKDF2REQUEST: 50,
      KEYPAIRGENREQUEST: 51,
      KEYGENREQUEST: 52,
      KEYEXPORTREQUEST: 53,
      CIPHERREQUEST: 54,
      DERIVEBITSREQUEST: 55,
      HASHREQUEST: 56,
      RANDOMBYTESREQUEST: 57,
      RANDOMPRIMEREQUEST: 58,
      SCRYPTREQUEST: 59,
      SIGNREQUEST: 60,
      TLSWRAP: 61,
      VERIFYREQUEST: 62
    });
  }
});

// node_modules/.pnpm/unenv@2.0.0-rc.14/node_modules/unenv/dist/runtime/node/async_hooks.mjs
var init_async_hooks = __esm({
  "node_modules/.pnpm/unenv@2.0.0-rc.14/node_modules/unenv/dist/runtime/node/async_hooks.mjs"() {
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_async_hook();
  }
});

// node_modules/.pnpm/@cloudflare+unenv-preset@2.0.2_unenv@2.0.0-rc.14_workerd@1.20250718.0/node_modules/@cloudflare/unenv-preset/dist/runtime/node/async_hooks.mjs
var async_hooks_exports = {};
__export(async_hooks_exports, {
  AsyncLocalStorage: () => AsyncLocalStorage,
  AsyncResource: () => AsyncResource,
  asyncWrapProviders: () => asyncWrapProviders,
  createHook: () => createHook,
  default: () => async_hooks_default,
  executionAsyncId: () => executionAsyncId,
  executionAsyncResource: () => executionAsyncResource,
  triggerAsyncId: () => triggerAsyncId
});
var workerdAsyncHooks, AsyncLocalStorage, AsyncResource, async_hooks_default;
var init_async_hooks2 = __esm({
  "node_modules/.pnpm/@cloudflare+unenv-preset@2.0.2_unenv@2.0.0-rc.14_workerd@1.20250718.0/node_modules/@cloudflare/unenv-preset/dist/runtime/node/async_hooks.mjs"() {
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_async_hooks();
    init_async_hooks();
    workerdAsyncHooks = process.getBuiltinModule("node:async_hooks");
    ({ AsyncLocalStorage, AsyncResource } = workerdAsyncHooks);
    async_hooks_default = {
      /**
       * manually unroll unenv-polyfilled-symbols to make it tree-shakeable
       */
      // @ts-expect-error @types/node is missing this one - this is a bug in typings
      asyncWrapProviders,
      createHook,
      executionAsyncId,
      executionAsyncResource,
      triggerAsyncId,
      /**
       * manually unroll workerd-polyfilled-symbols to make it tree-shakeable
       */
      AsyncLocalStorage,
      AsyncResource
    };
  }
});

// .svelte-kit/cloudflare/_worker.js
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();
var __defProp2 = Object.defineProperty;
var __getOwnPropNames2 = Object.getOwnPropertyNames;
var __esm2 = /* @__PURE__ */ __name((fn, res) => /* @__PURE__ */ __name(function __init() {
  return fn && (res = (0, fn[__getOwnPropNames2(fn)[0]])(fn = 0)), res;
}, "__init"), "__esm");
var __export2 = /* @__PURE__ */ __name((target, all) => {
  for (var name in all)
    __defProp2(target, name, { get: all[name], enumerable: true });
}, "__export");
var DEV;
var init_false = __esm2({
  ".svelte-kit/output/server/chunks/false.js"() {
    DEV = false;
  }
});
var init_remote_functions = __esm2({
  "node_modules/.pnpm/@sveltejs+kit@2.27.0_@sveltejs+vite-plugin-svelte@5.1.1_svelte@5.37.2_vite@6.3.5_@types_109d7fc5d68bf1df48887ecb7cd4472b/node_modules/@sveltejs/kit/src/exports/internal/remote-functions.js"() {
  }
});
var HttpError;
var Redirect;
var SvelteKitError;
var ActionFailure;
var init_internal = __esm2({
  "node_modules/.pnpm/@sveltejs+kit@2.27.0_@sveltejs+vite-plugin-svelte@5.1.1_svelte@5.37.2_vite@6.3.5_@types_109d7fc5d68bf1df48887ecb7cd4472b/node_modules/@sveltejs/kit/src/exports/internal/index.js"() {
    init_remote_functions();
    HttpError = /* @__PURE__ */ __name(class {
      /**
       * @param {number} status
       * @param {{message: string} extends App.Error ? (App.Error | string | undefined) : App.Error} body
       */
      constructor(status, body2) {
        this.status = status;
        if (typeof body2 === "string") {
          this.body = { message: body2 };
        } else if (body2) {
          this.body = body2;
        } else {
          this.body = { message: `Error: ${status}` };
        }
      }
      toString() {
        return JSON.stringify(this.body);
      }
    }, "HttpError");
    Redirect = /* @__PURE__ */ __name(class {
      /**
       * @param {300 | 301 | 302 | 303 | 304 | 305 | 306 | 307 | 308} status
       * @param {string} location
       */
      constructor(status, location) {
        this.status = status;
        this.location = location;
      }
    }, "Redirect");
    SvelteKitError = /* @__PURE__ */ __name(class extends Error {
      /**
       * @param {number} status
       * @param {string} text
       * @param {string} message
       */
      constructor(status, text2, message) {
        super(message);
        this.status = status;
        this.text = text2;
      }
    }, "SvelteKitError");
    ActionFailure = /* @__PURE__ */ __name(class {
      /**
       * @param {number} status
       * @param {T} data
       */
      constructor(status, data) {
        this.status = status;
        this.data = data;
      }
    }, "ActionFailure");
  }
});
var true_default;
var init_true = __esm2({
  "node_modules/.pnpm/esm-env@1.2.2/node_modules/esm-env/true.js"() {
    true_default = true;
  }
});
var node_env;
var dev_fallback_default;
var init_dev_fallback = __esm2({
  "node_modules/.pnpm/esm-env@1.2.2/node_modules/esm-env/dev-fallback.js"() {
    node_env = globalThis.process?.env?.NODE_ENV;
    dev_fallback_default = node_env && !node_env.toLowerCase().startsWith("prod");
  }
});
var init_false2 = __esm2({
  "node_modules/.pnpm/esm-env@1.2.2/node_modules/esm-env/false.js"() {
  }
});
var init_esm_env = __esm2({
  "node_modules/.pnpm/esm-env@1.2.2/node_modules/esm-env/index.js"() {
    init_true();
    init_dev_fallback();
    init_false2();
  }
});
var init_pathname = __esm2({
  "node_modules/.pnpm/@sveltejs+kit@2.27.0_@sveltejs+vite-plugin-svelte@5.1.1_svelte@5.37.2_vite@6.3.5_@types_109d7fc5d68bf1df48887ecb7cd4472b/node_modules/@sveltejs/kit/src/runtime/pathname.js"() {
  }
});
var init_version = __esm2({
  "node_modules/.pnpm/@sveltejs+kit@2.27.0_@sveltejs+vite-plugin-svelte@5.1.1_svelte@5.37.2_vite@6.3.5_@types_109d7fc5d68bf1df48887ecb7cd4472b/node_modules/@sveltejs/kit/src/version.js"() {
  }
});
function error3(status, body2) {
  if ((!true_default || dev_fallback_default) && (isNaN(status) || status < 400 || status > 599)) {
    throw new Error(`HTTP error status codes must be between 400 and 599 \u2014 ${status} is invalid`);
  }
  throw new HttpError(status, body2);
}
__name(error3, "error");
function json(data, init2) {
  const body2 = JSON.stringify(data);
  const headers2 = new Headers(init2?.headers);
  if (!headers2.has("content-length")) {
    headers2.set("content-length", encoder.encode(body2).byteLength.toString());
  }
  if (!headers2.has("content-type")) {
    headers2.set("content-type", "application/json");
  }
  return new Response(body2, {
    ...init2,
    headers: headers2
  });
}
__name(json, "json");
function text(body2, init2) {
  const headers2 = new Headers(init2?.headers);
  if (!headers2.has("content-length")) {
    const encoded = encoder.encode(body2);
    headers2.set("content-length", encoded.byteLength.toString());
    return new Response(encoded, {
      ...init2,
      headers: headers2
    });
  }
  return new Response(body2, {
    ...init2,
    headers: headers2
  });
}
__name(text, "text");
var encoder;
var init_exports = __esm2({
  "node_modules/.pnpm/@sveltejs+kit@2.27.0_@sveltejs+vite-plugin-svelte@5.1.1_svelte@5.37.2_vite@6.3.5_@types_109d7fc5d68bf1df48887ecb7cd4472b/node_modules/@sveltejs/kit/src/exports/index.js"() {
    init_internal();
    init_esm_env();
    init_pathname();
    init_version();
    encoder = new TextEncoder();
  }
});
function resolve(base2, path) {
  if (path[0] === "/" && path[1] === "/")
    return path;
  let url = new URL(base2, internal);
  url = new URL(path, url);
  return url.protocol === internal.protocol ? url.pathname + url.search + url.hash : url.href;
}
__name(resolve, "resolve");
function normalize_path(path, trailing_slash) {
  if (path === "/" || trailing_slash === "ignore")
    return path;
  if (trailing_slash === "never") {
    return path.endsWith("/") ? path.slice(0, -1) : path;
  } else if (trailing_slash === "always" && !path.endsWith("/")) {
    return path + "/";
  }
  return path;
}
__name(normalize_path, "normalize_path");
function decode_pathname(pathname) {
  return pathname.split("%25").map(decodeURI).join("%25");
}
__name(decode_pathname, "decode_pathname");
function decode_params(params) {
  for (const key2 in params) {
    params[key2] = decodeURIComponent(params[key2]);
  }
  return params;
}
__name(decode_params, "decode_params");
function make_trackable(url, callback, search_params_callback, allow_hash = false) {
  const tracked = new URL(url);
  Object.defineProperty(tracked, "searchParams", {
    value: new Proxy(tracked.searchParams, {
      get(obj, key2) {
        if (key2 === "get" || key2 === "getAll" || key2 === "has") {
          return (param) => {
            search_params_callback(param);
            return obj[key2](param);
          };
        }
        callback();
        const value = Reflect.get(obj, key2);
        return typeof value === "function" ? value.bind(obj) : value;
      }
    }),
    enumerable: true,
    configurable: true
  });
  const tracked_url_properties = ["href", "pathname", "search", "toString", "toJSON"];
  if (allow_hash)
    tracked_url_properties.push("hash");
  for (const property of tracked_url_properties) {
    Object.defineProperty(tracked, property, {
      get() {
        callback();
        return url[property];
      },
      enumerable: true,
      configurable: true
    });
  }
  {
    tracked[Symbol.for("nodejs.util.inspect.custom")] = (depth, opts, inspect) => {
      return inspect(url, opts);
    };
    tracked.searchParams[Symbol.for("nodejs.util.inspect.custom")] = (depth, opts, inspect) => {
      return inspect(url.searchParams, opts);
    };
  }
  if (!allow_hash) {
    disable_hash(tracked);
  }
  return tracked;
}
__name(make_trackable, "make_trackable");
function disable_hash(url) {
  allow_nodejs_console_log(url);
  Object.defineProperty(url, "hash", {
    get() {
      throw new Error(
        "Cannot access event.url.hash. Consider using `page.url.hash` inside a component instead"
      );
    }
  });
}
__name(disable_hash, "disable_hash");
function disable_search(url) {
  allow_nodejs_console_log(url);
  for (const property of ["search", "searchParams"]) {
    Object.defineProperty(url, property, {
      get() {
        throw new Error(`Cannot access url.${property} on a page with prerendering enabled`);
      }
    });
  }
}
__name(disable_search, "disable_search");
function allow_nodejs_console_log(url) {
  {
    url[Symbol.for("nodejs.util.inspect.custom")] = (depth, opts, inspect) => {
      return inspect(new URL(url), opts);
    };
  }
}
__name(allow_nodejs_console_log, "allow_nodejs_console_log");
function validator(expected) {
  function validate(module, file) {
    if (!module)
      return;
    for (const key2 in module) {
      if (key2[0] === "_" || expected.has(key2))
        continue;
      const values = [...expected.values()];
      const hint = hint_for_supported_files(key2, file?.slice(file.lastIndexOf("."))) ?? `valid exports are ${values.join(", ")}, or anything with a '_' prefix`;
      throw new Error(`Invalid export '${key2}'${file ? ` in ${file}` : ""} (${hint})`);
    }
  }
  __name(validate, "validate");
  return validate;
}
__name(validator, "validator");
function hint_for_supported_files(key2, ext = ".js") {
  const supported_files = [];
  if (valid_layout_exports.has(key2)) {
    supported_files.push(`+layout${ext}`);
  }
  if (valid_page_exports.has(key2)) {
    supported_files.push(`+page${ext}`);
  }
  if (valid_layout_server_exports.has(key2)) {
    supported_files.push(`+layout.server${ext}`);
  }
  if (valid_page_server_exports.has(key2)) {
    supported_files.push(`+page.server${ext}`);
  }
  if (valid_server_exports.has(key2)) {
    supported_files.push(`+server${ext}`);
  }
  if (supported_files.length > 0) {
    return `'${key2}' is a valid export in ${supported_files.slice(0, -1).join(", ")}${supported_files.length > 1 ? " or " : ""}${supported_files.at(-1)}`;
  }
}
__name(hint_for_supported_files, "hint_for_supported_files");
var internal;
var valid_layout_exports;
var valid_page_exports;
var valid_layout_server_exports;
var valid_page_server_exports;
var valid_server_exports;
var validate_layout_exports;
var validate_page_exports;
var validate_layout_server_exports;
var validate_page_server_exports;
var validate_server_exports;
var init_exports2 = __esm2({
  ".svelte-kit/output/server/chunks/exports.js"() {
    internal = new URL("sveltekit-internal://");
    valid_layout_exports = /* @__PURE__ */ new Set([
      "load",
      "prerender",
      "csr",
      "ssr",
      "trailingSlash",
      "config"
    ]);
    valid_page_exports = /* @__PURE__ */ new Set([...valid_layout_exports, "entries"]);
    valid_layout_server_exports = /* @__PURE__ */ new Set([...valid_layout_exports]);
    valid_page_server_exports = /* @__PURE__ */ new Set([...valid_layout_server_exports, "actions", "entries"]);
    valid_server_exports = /* @__PURE__ */ new Set([
      "GET",
      "POST",
      "PATCH",
      "PUT",
      "DELETE",
      "OPTIONS",
      "HEAD",
      "fallback",
      "prerender",
      "trailingSlash",
      "config",
      "entries"
    ]);
    validate_layout_exports = validator(valid_layout_exports);
    validate_page_exports = validator(valid_page_exports);
    validate_layout_server_exports = validator(valid_layout_server_exports);
    validate_page_server_exports = validator(valid_page_server_exports);
    validate_server_exports = validator(valid_server_exports);
  }
});
function run_all(arr) {
  for (var i = 0; i < arr.length; i++) {
    arr[i]();
  }
}
__name(run_all, "run_all");
function deferred() {
  var resolve2;
  var reject;
  var promise = new Promise((res, rej) => {
    resolve2 = res;
    reject = rej;
  });
  return { promise, resolve: resolve2, reject };
}
__name(deferred, "deferred");
function fallback(value, fallback2, lazy = false) {
  return value === void 0 ? lazy ? (
    /** @type {() => V} */
    fallback2()
  ) : (
    /** @type {V} */
    fallback2
  ) : value;
}
__name(fallback, "fallback");
function equals(value) {
  return value === this.v;
}
__name(equals, "equals");
function safe_not_equal(a, b) {
  return a != a ? b == b : a !== b || a !== null && typeof a === "object" || typeof a === "function";
}
__name(safe_not_equal, "safe_not_equal");
function safe_equals(value) {
  return !safe_not_equal(value, this.v);
}
__name(safe_equals, "safe_equals");
function lifecycle_outside_component(name) {
  {
    throw new Error(`https://svelte.dev/e/lifecycle_outside_component`);
  }
}
__name(lifecycle_outside_component, "lifecycle_outside_component");
function effect_update_depth_exceeded() {
  {
    throw new Error(`https://svelte.dev/e/effect_update_depth_exceeded`);
  }
}
__name(effect_update_depth_exceeded, "effect_update_depth_exceeded");
function hydration_failed() {
  {
    throw new Error(`https://svelte.dev/e/hydration_failed`);
  }
}
__name(hydration_failed, "hydration_failed");
function state_descriptors_fixed() {
  {
    throw new Error(`https://svelte.dev/e/state_descriptors_fixed`);
  }
}
__name(state_descriptors_fixed, "state_descriptors_fixed");
function state_prototype_fixed() {
  {
    throw new Error(`https://svelte.dev/e/state_prototype_fixed`);
  }
}
__name(state_prototype_fixed, "state_prototype_fixed");
function state_unsafe_mutation() {
  {
    throw new Error(`https://svelte.dev/e/state_unsafe_mutation`);
  }
}
__name(state_unsafe_mutation, "state_unsafe_mutation");
function set_component_context(context22) {
  component_context = context22;
}
__name(set_component_context, "set_component_context");
function push$1(props, runes = false, fn) {
  component_context = {
    p: component_context,
    c: null,
    e: null,
    s: props,
    x: null,
    l: null
  };
}
__name(push$1, "push$1");
function pop$1(component13) {
  var context22 = (
    /** @type {ComponentContext} */
    component_context
  );
  var effects = context22.e;
  if (effects !== null) {
    context22.e = null;
    for (var fn of effects) {
      create_user_effect(fn);
    }
  }
  component_context = context22.p;
  return (
    /** @type {T} */
    {}
  );
}
__name(pop$1, "pop$1");
function is_runes() {
  return true;
}
__name(is_runes, "is_runes");
function handle_error(error22) {
  var effect = active_effect;
  if (effect === null) {
    active_reaction.f |= ERROR_VALUE;
    return error22;
  }
  if ((effect.f & EFFECT_RAN) === 0) {
    if ((effect.f & BOUNDARY_EFFECT) === 0) {
      if (!effect.parent && error22 instanceof Error) {
        apply_adjustments(error22);
      }
      throw error22;
    }
    effect.b.error(error22);
  } else {
    invoke_error_boundary(error22, effect);
  }
}
__name(handle_error, "handle_error");
function invoke_error_boundary(error22, effect) {
  while (effect !== null) {
    if ((effect.f & BOUNDARY_EFFECT) !== 0) {
      try {
        effect.b.error(error22);
        return;
      } catch (e3) {
        error22 = e3;
      }
    }
    effect = effect.parent;
  }
  if (error22 instanceof Error) {
    apply_adjustments(error22);
  }
  throw error22;
}
__name(invoke_error_boundary, "invoke_error_boundary");
function apply_adjustments(error22) {
  const adjusted = adjustments.get(error22);
  if (adjusted) {
    define_property(error22, "message", {
      value: adjusted.message
    });
    define_property(error22, "stack", {
      value: adjusted.stack
    });
  }
}
__name(apply_adjustments, "apply_adjustments");
function run_micro_tasks() {
  var tasks2 = micro_tasks;
  micro_tasks = [];
  run_all(tasks2);
}
__name(run_micro_tasks, "run_micro_tasks");
function run_idle_tasks() {
  var tasks2 = idle_tasks;
  idle_tasks = [];
  run_all(tasks2);
}
__name(run_idle_tasks, "run_idle_tasks");
function flush_tasks() {
  if (micro_tasks.length > 0) {
    run_micro_tasks();
  }
  if (idle_tasks.length > 0) {
    run_idle_tasks();
  }
}
__name(flush_tasks, "flush_tasks");
function destroy_derived_effects(derived2) {
  var effects = derived2.effects;
  if (effects !== null) {
    derived2.effects = null;
    for (var i = 0; i < effects.length; i += 1) {
      destroy_effect(
        /** @type {Effect} */
        effects[i]
      );
    }
  }
}
__name(destroy_derived_effects, "destroy_derived_effects");
function get_derived_parent_effect(derived2) {
  var parent = derived2.parent;
  while (parent !== null) {
    if ((parent.f & DERIVED) === 0) {
      return (
        /** @type {Effect} */
        parent
      );
    }
    parent = parent.parent;
  }
  return null;
}
__name(get_derived_parent_effect, "get_derived_parent_effect");
function execute_derived(derived2) {
  var value;
  var prev_active_effect = active_effect;
  set_active_effect(get_derived_parent_effect(derived2));
  {
    try {
      destroy_derived_effects(derived2);
      value = update_reaction(derived2);
    } finally {
      set_active_effect(prev_active_effect);
    }
  }
  return value;
}
__name(execute_derived, "execute_derived");
function update_derived(derived2) {
  var value = execute_derived(derived2);
  if (!derived2.equals(value)) {
    derived2.v = value;
    derived2.wv = increment_write_version();
  }
  if (is_destroying_effect) {
    return;
  }
  if (batch_deriveds !== null) {
    batch_deriveds.set(derived2, derived2.v);
  } else {
    var status = (skip_reaction || (derived2.f & UNOWNED) !== 0) && derived2.deps !== null ? MAYBE_DIRTY : CLEAN;
    set_signal_status(derived2, status);
  }
}
__name(update_derived, "update_derived");
function dequeue() {
  const task = (
    /** @type {() => void} */
    tasks.shift()
  );
  if (tasks.length > 0) {
    queueMicrotask(dequeue);
  }
  task();
}
__name(dequeue, "dequeue");
function flushSync(fn) {
  var was_flushing_sync = is_flushing_sync;
  is_flushing_sync = true;
  try {
    var result;
    if (fn)
      ;
    while (true) {
      flush_tasks();
      if (queued_root_effects.length === 0) {
        current_batch?.flush();
        if (queued_root_effects.length === 0) {
          last_scheduled_effect = null;
          return (
            /** @type {T} */
            result
          );
        }
      }
      flush_effects();
    }
  } finally {
    is_flushing_sync = was_flushing_sync;
  }
}
__name(flushSync, "flushSync");
function flush_effects() {
  var was_updating_effect = is_updating_effect;
  is_flushing = true;
  try {
    var flush_count = 0;
    set_is_updating_effect(true);
    while (queued_root_effects.length > 0) {
      var batch = Batch.ensure();
      if (flush_count++ > 1e3) {
        var updates, entry;
        if (DEV)
          ;
        infinite_loop_guard();
      }
      batch.process(queued_root_effects);
      old_values.clear();
    }
  } finally {
    is_flushing = false;
    set_is_updating_effect(was_updating_effect);
    last_scheduled_effect = null;
  }
}
__name(flush_effects, "flush_effects");
function infinite_loop_guard() {
  try {
    effect_update_depth_exceeded();
  } catch (error22) {
    invoke_error_boundary(error22, last_scheduled_effect);
  }
}
__name(infinite_loop_guard, "infinite_loop_guard");
function flush_queued_effects(effects) {
  var length = effects.length;
  if (length === 0)
    return;
  var i = 0;
  while (i < length) {
    var effect = effects[i++];
    if ((effect.f & (DESTROYED | INERT)) === 0 && is_dirty(effect)) {
      var n2 = current_batch ? current_batch.current.size : 0;
      update_effect(effect);
      if (effect.deps === null && effect.first === null && effect.nodes_start === null) {
        if (effect.teardown === null && effect.ac === null) {
          unlink_effect(effect);
        } else {
          effect.fn = null;
        }
      }
      if (current_batch !== null && current_batch.current.size > n2 && (effect.f & USER_EFFECT) !== 0) {
        break;
      }
    }
  }
  while (i < length) {
    schedule_effect(effects[i++]);
  }
}
__name(flush_queued_effects, "flush_queued_effects");
function schedule_effect(signal) {
  var effect = last_scheduled_effect = signal;
  while (effect.parent !== null) {
    effect = effect.parent;
    var flags = effect.f;
    if (is_flushing && effect === active_effect && (flags & BLOCK_EFFECT) !== 0) {
      return;
    }
    if ((flags & (ROOT_EFFECT | BRANCH_EFFECT)) !== 0) {
      if ((flags & CLEAN) === 0)
        return;
      effect.f ^= CLEAN;
    }
  }
  queued_root_effects.push(effect);
}
__name(schedule_effect, "schedule_effect");
function source(v, stack) {
  var signal = {
    f: 0,
    // TODO ideally we could skip this altogether, but it causes type errors
    v,
    reactions: null,
    equals,
    rv: 0,
    wv: 0
  };
  return signal;
}
__name(source, "source");
function state(v, stack) {
  const s3 = source(v);
  push_reaction_value(s3);
  return s3;
}
__name(state, "state");
function mutable_source(initial_value, immutable2 = false, trackable = true) {
  const s3 = source(initial_value);
  if (!immutable2) {
    s3.equals = safe_equals;
  }
  return s3;
}
__name(mutable_source, "mutable_source");
function set(source2, value, should_proxy = false) {
  if (active_reaction !== null && // since we are untracking the function inside `$inspect.with` we need to add this check
  // to ensure we error if state is set inside an inspect effect
  (!untracking || (active_reaction.f & INSPECT_EFFECT) !== 0) && is_runes() && (active_reaction.f & (DERIVED | BLOCK_EFFECT | ASYNC | INSPECT_EFFECT)) !== 0 && !current_sources?.includes(source2)) {
    state_unsafe_mutation();
  }
  let new_value = should_proxy ? proxy(value) : value;
  return internal_set(source2, new_value);
}
__name(set, "set");
function internal_set(source2, value) {
  if (!source2.equals(value)) {
    var old_value = source2.v;
    if (is_destroying_effect) {
      old_values.set(source2, value);
    } else {
      old_values.set(source2, old_value);
    }
    source2.v = value;
    var batch = Batch.ensure();
    batch.capture(source2, old_value);
    if ((source2.f & DERIVED) !== 0) {
      if ((source2.f & DIRTY) !== 0) {
        execute_derived(
          /** @type {Derived} */
          source2
        );
      }
      set_signal_status(source2, (source2.f & UNOWNED) === 0 ? CLEAN : MAYBE_DIRTY);
    }
    source2.wv = increment_write_version();
    mark_reactions(source2, DIRTY);
    if (active_effect !== null && (active_effect.f & CLEAN) !== 0 && (active_effect.f & (BRANCH_EFFECT | ROOT_EFFECT)) === 0) {
      if (untracked_writes === null) {
        set_untracked_writes([source2]);
      } else {
        untracked_writes.push(source2);
      }
    }
  }
  return value;
}
__name(internal_set, "internal_set");
function increment(source2) {
  set(source2, source2.v + 1);
}
__name(increment, "increment");
function mark_reactions(signal, status) {
  var reactions = signal.reactions;
  if (reactions === null)
    return;
  var length = reactions.length;
  for (var i = 0; i < length; i++) {
    var reaction = reactions[i];
    var flags = reaction.f;
    var not_dirty = (flags & DIRTY) === 0;
    if (not_dirty) {
      set_signal_status(reaction, status);
    }
    if ((flags & DERIVED) !== 0) {
      mark_reactions(
        /** @type {Derived} */
        reaction,
        MAYBE_DIRTY
      );
    } else if (not_dirty) {
      schedule_effect(
        /** @type {Effect} */
        reaction
      );
    }
  }
}
__name(mark_reactions, "mark_reactions");
function proxy(value) {
  if (typeof value !== "object" || value === null || STATE_SYMBOL in value) {
    return value;
  }
  const prototype = get_prototype_of(value);
  if (prototype !== object_prototype && prototype !== array_prototype) {
    return value;
  }
  var sources = /* @__PURE__ */ new Map();
  var is_proxied_array = is_array(value);
  var version2 = /* @__PURE__ */ state(0);
  var parent_version = update_version;
  var with_parent = /* @__PURE__ */ __name((fn) => {
    if (update_version === parent_version) {
      return fn();
    }
    var reaction = active_reaction;
    var version22 = update_version;
    set_active_reaction(null);
    set_update_version(parent_version);
    var result = fn();
    set_active_reaction(reaction);
    set_update_version(version22);
    return result;
  }, "with_parent");
  if (is_proxied_array) {
    sources.set("length", /* @__PURE__ */ state(
      /** @type {any[]} */
      value.length
    ));
  }
  return new Proxy(
    /** @type {any} */
    value,
    {
      defineProperty(_, prop, descriptor) {
        if (!("value" in descriptor) || descriptor.configurable === false || descriptor.enumerable === false || descriptor.writable === false) {
          state_descriptors_fixed();
        }
        var s3 = sources.get(prop);
        if (s3 === void 0) {
          s3 = with_parent(() => {
            var s22 = /* @__PURE__ */ state(descriptor.value);
            sources.set(prop, s22);
            return s22;
          });
        } else {
          set(s3, descriptor.value, true);
        }
        return true;
      },
      deleteProperty(target, prop) {
        var s3 = sources.get(prop);
        if (s3 === void 0) {
          if (prop in target) {
            const s22 = with_parent(() => /* @__PURE__ */ state(UNINITIALIZED));
            sources.set(prop, s22);
            increment(version2);
          }
        } else {
          set(s3, UNINITIALIZED);
          increment(version2);
        }
        return true;
      },
      get(target, prop, receiver) {
        if (prop === STATE_SYMBOL) {
          return value;
        }
        var s3 = sources.get(prop);
        var exists = prop in target;
        if (s3 === void 0 && (!exists || get_descriptor(target, prop)?.writable)) {
          s3 = with_parent(() => {
            var p = proxy(exists ? target[prop] : UNINITIALIZED);
            var s22 = /* @__PURE__ */ state(p);
            return s22;
          });
          sources.set(prop, s3);
        }
        if (s3 !== void 0) {
          var v = get(s3);
          return v === UNINITIALIZED ? void 0 : v;
        }
        return Reflect.get(target, prop, receiver);
      },
      getOwnPropertyDescriptor(target, prop) {
        var descriptor = Reflect.getOwnPropertyDescriptor(target, prop);
        if (descriptor && "value" in descriptor) {
          var s3 = sources.get(prop);
          if (s3)
            descriptor.value = get(s3);
        } else if (descriptor === void 0) {
          var source2 = sources.get(prop);
          var value2 = source2?.v;
          if (source2 !== void 0 && value2 !== UNINITIALIZED) {
            return {
              enumerable: true,
              configurable: true,
              value: value2,
              writable: true
            };
          }
        }
        return descriptor;
      },
      has(target, prop) {
        if (prop === STATE_SYMBOL) {
          return true;
        }
        var s3 = sources.get(prop);
        var has = s3 !== void 0 && s3.v !== UNINITIALIZED || Reflect.has(target, prop);
        if (s3 !== void 0 || active_effect !== null && (!has || get_descriptor(target, prop)?.writable)) {
          if (s3 === void 0) {
            s3 = with_parent(() => {
              var p = has ? proxy(target[prop]) : UNINITIALIZED;
              var s22 = /* @__PURE__ */ state(p);
              return s22;
            });
            sources.set(prop, s3);
          }
          var value2 = get(s3);
          if (value2 === UNINITIALIZED) {
            return false;
          }
        }
        return has;
      },
      set(target, prop, value2, receiver) {
        var s3 = sources.get(prop);
        var has = prop in target;
        if (is_proxied_array && prop === "length") {
          for (var i = value2; i < /** @type {Source<number>} */
          s3.v; i += 1) {
            var other_s = sources.get(i + "");
            if (other_s !== void 0) {
              set(other_s, UNINITIALIZED);
            } else if (i in target) {
              other_s = with_parent(() => /* @__PURE__ */ state(UNINITIALIZED));
              sources.set(i + "", other_s);
            }
          }
        }
        if (s3 === void 0) {
          if (!has || get_descriptor(target, prop)?.writable) {
            s3 = with_parent(() => /* @__PURE__ */ state(void 0));
            set(s3, proxy(value2));
            sources.set(prop, s3);
          }
        } else {
          has = s3.v !== UNINITIALIZED;
          var p = with_parent(() => proxy(value2));
          set(s3, p);
        }
        var descriptor = Reflect.getOwnPropertyDescriptor(target, prop);
        if (descriptor?.set) {
          descriptor.set.call(receiver, value2);
        }
        if (!has) {
          if (is_proxied_array && typeof prop === "string") {
            var ls = (
              /** @type {Source<number>} */
              sources.get("length")
            );
            var n2 = Number(prop);
            if (Number.isInteger(n2) && n2 >= ls.v) {
              set(ls, n2 + 1);
            }
          }
          increment(version2);
        }
        return true;
      },
      ownKeys(target) {
        get(version2);
        var own_keys = Reflect.ownKeys(target).filter((key22) => {
          var source3 = sources.get(key22);
          return source3 === void 0 || source3.v !== UNINITIALIZED;
        });
        for (var [key2, source2] of sources) {
          if (source2.v !== UNINITIALIZED && !(key2 in target)) {
            own_keys.push(key2);
          }
        }
        return own_keys;
      },
      setPrototypeOf() {
        state_prototype_fixed();
      }
    }
  );
}
__name(proxy, "proxy");
function init_operations() {
  if ($window !== void 0) {
    return;
  }
  $window = window;
  var element_prototype = Element.prototype;
  var node_prototype = Node.prototype;
  var text_prototype = Text.prototype;
  first_child_getter = get_descriptor(node_prototype, "firstChild").get;
  next_sibling_getter = get_descriptor(node_prototype, "nextSibling").get;
  if (is_extensible(element_prototype)) {
    element_prototype.__click = void 0;
    element_prototype.__className = void 0;
    element_prototype.__attributes = null;
    element_prototype.__style = void 0;
    element_prototype.__e = void 0;
  }
  if (is_extensible(text_prototype)) {
    text_prototype.__t = void 0;
  }
}
__name(init_operations, "init_operations");
function create_text(value = "") {
  return document.createTextNode(value);
}
__name(create_text, "create_text");
function get_first_child(node) {
  return first_child_getter.call(node);
}
__name(get_first_child, "get_first_child");
function get_next_sibling(node) {
  return next_sibling_getter.call(node);
}
__name(get_next_sibling, "get_next_sibling");
function clear_text_content(node) {
  node.textContent = "";
}
__name(clear_text_content, "clear_text_content");
function push_effect(effect, parent_effect) {
  var parent_last = parent_effect.last;
  if (parent_last === null) {
    parent_effect.last = parent_effect.first = effect;
  } else {
    parent_last.next = effect;
    effect.prev = parent_last;
    parent_effect.last = effect;
  }
}
__name(push_effect, "push_effect");
function create_effect(type, fn, sync, push2 = true) {
  var parent = active_effect;
  if (parent !== null && (parent.f & INERT) !== 0) {
    type |= INERT;
  }
  var effect = {
    ctx: component_context,
    deps: null,
    nodes_start: null,
    nodes_end: null,
    f: type | DIRTY,
    first: null,
    fn,
    last: null,
    next: null,
    parent,
    b: parent && parent.b,
    prev: null,
    teardown: null,
    transitions: null,
    wv: 0,
    ac: null
  };
  if (sync) {
    try {
      update_effect(effect);
      effect.f |= EFFECT_RAN;
    } catch (e3) {
      destroy_effect(effect);
      throw e3;
    }
  } else if (fn !== null) {
    schedule_effect(effect);
  }
  var inert = sync && effect.deps === null && effect.first === null && effect.nodes_start === null && effect.teardown === null && (effect.f & EFFECT_PRESERVED) === 0;
  if (!inert && push2) {
    if (parent !== null) {
      push_effect(effect, parent);
    }
    if (active_reaction !== null && (active_reaction.f & DERIVED) !== 0 && (type & ROOT_EFFECT) === 0) {
      var derived2 = (
        /** @type {Derived} */
        active_reaction
      );
      (derived2.effects ??= []).push(effect);
    }
  }
  return effect;
}
__name(create_effect, "create_effect");
function create_user_effect(fn) {
  return create_effect(EFFECT | USER_EFFECT, fn, false);
}
__name(create_user_effect, "create_user_effect");
function component_root(fn) {
  Batch.ensure();
  const effect = create_effect(ROOT_EFFECT, fn, true);
  return (options2 = {}) => {
    return new Promise((fulfil) => {
      if (options2.outro) {
        pause_effect(effect, () => {
          destroy_effect(effect);
          fulfil(void 0);
        });
      } else {
        destroy_effect(effect);
        fulfil(void 0);
      }
    });
  };
}
__name(component_root, "component_root");
function branch(fn, push2 = true) {
  return create_effect(BRANCH_EFFECT, fn, true, push2);
}
__name(branch, "branch");
function execute_effect_teardown(effect) {
  var teardown = effect.teardown;
  if (teardown !== null) {
    const previously_destroying_effect = is_destroying_effect;
    const previous_reaction = active_reaction;
    set_is_destroying_effect(true);
    set_active_reaction(null);
    try {
      teardown.call(null);
    } finally {
      set_is_destroying_effect(previously_destroying_effect);
      set_active_reaction(previous_reaction);
    }
  }
}
__name(execute_effect_teardown, "execute_effect_teardown");
function destroy_effect_children(signal, remove_dom = false) {
  var effect = signal.first;
  signal.first = signal.last = null;
  while (effect !== null) {
    effect.ac?.abort(STALE_REACTION);
    var next = effect.next;
    if ((effect.f & ROOT_EFFECT) !== 0) {
      effect.parent = null;
    } else {
      destroy_effect(effect, remove_dom);
    }
    effect = next;
  }
}
__name(destroy_effect_children, "destroy_effect_children");
function destroy_block_effect_children(signal) {
  var effect = signal.first;
  while (effect !== null) {
    var next = effect.next;
    if ((effect.f & BRANCH_EFFECT) === 0) {
      destroy_effect(effect);
    }
    effect = next;
  }
}
__name(destroy_block_effect_children, "destroy_block_effect_children");
function destroy_effect(effect, remove_dom = true) {
  var removed = false;
  if ((remove_dom || (effect.f & HEAD_EFFECT) !== 0) && effect.nodes_start !== null && effect.nodes_end !== null) {
    remove_effect_dom(
      effect.nodes_start,
      /** @type {TemplateNode} */
      effect.nodes_end
    );
    removed = true;
  }
  destroy_effect_children(effect, remove_dom && !removed);
  remove_reactions(effect, 0);
  set_signal_status(effect, DESTROYED);
  var transitions = effect.transitions;
  if (transitions !== null) {
    for (const transition of transitions) {
      transition.stop();
    }
  }
  execute_effect_teardown(effect);
  var parent = effect.parent;
  if (parent !== null && parent.first !== null) {
    unlink_effect(effect);
  }
  effect.next = effect.prev = effect.teardown = effect.ctx = effect.deps = effect.fn = effect.nodes_start = effect.nodes_end = effect.ac = null;
}
__name(destroy_effect, "destroy_effect");
function remove_effect_dom(node, end) {
  while (node !== null) {
    var next = node === end ? null : (
      /** @type {TemplateNode} */
      /* @__PURE__ */ get_next_sibling(node)
    );
    node.remove();
    node = next;
  }
}
__name(remove_effect_dom, "remove_effect_dom");
function unlink_effect(effect) {
  var parent = effect.parent;
  var prev = effect.prev;
  var next = effect.next;
  if (prev !== null)
    prev.next = next;
  if (next !== null)
    next.prev = prev;
  if (parent !== null) {
    if (parent.first === effect)
      parent.first = next;
    if (parent.last === effect)
      parent.last = prev;
  }
}
__name(unlink_effect, "unlink_effect");
function pause_effect(effect, callback) {
  var transitions = [];
  pause_children(effect, transitions, true);
  run_out_transitions(transitions, () => {
    destroy_effect(effect);
    if (callback)
      callback();
  });
}
__name(pause_effect, "pause_effect");
function run_out_transitions(transitions, fn) {
  var remaining = transitions.length;
  if (remaining > 0) {
    var check = /* @__PURE__ */ __name(() => --remaining || fn(), "check");
    for (var transition of transitions) {
      transition.out(check);
    }
  } else {
    fn();
  }
}
__name(run_out_transitions, "run_out_transitions");
function pause_children(effect, transitions, local) {
  if ((effect.f & INERT) !== 0)
    return;
  effect.f ^= INERT;
  if (effect.transitions !== null) {
    for (const transition of effect.transitions) {
      if (transition.is_global || local) {
        transitions.push(transition);
      }
    }
  }
  var child = effect.first;
  while (child !== null) {
    var sibling = child.next;
    var transparent = (child.f & EFFECT_TRANSPARENT) !== 0 || (child.f & BRANCH_EFFECT) !== 0;
    pause_children(child, transitions, transparent ? local : false);
    child = sibling;
  }
}
__name(pause_children, "pause_children");
function set_is_updating_effect(value) {
  is_updating_effect = value;
}
__name(set_is_updating_effect, "set_is_updating_effect");
function set_is_destroying_effect(value) {
  is_destroying_effect = value;
}
__name(set_is_destroying_effect, "set_is_destroying_effect");
function set_active_reaction(reaction) {
  active_reaction = reaction;
}
__name(set_active_reaction, "set_active_reaction");
function set_active_effect(effect) {
  active_effect = effect;
}
__name(set_active_effect, "set_active_effect");
function push_reaction_value(value) {
  if (active_reaction !== null && true) {
    if (current_sources === null) {
      current_sources = [value];
    } else {
      current_sources.push(value);
    }
  }
}
__name(push_reaction_value, "push_reaction_value");
function set_untracked_writes(value) {
  untracked_writes = value;
}
__name(set_untracked_writes, "set_untracked_writes");
function set_update_version(value) {
  update_version = value;
}
__name(set_update_version, "set_update_version");
function increment_write_version() {
  return ++write_version;
}
__name(increment_write_version, "increment_write_version");
function is_dirty(reaction) {
  var flags = reaction.f;
  if ((flags & DIRTY) !== 0) {
    return true;
  }
  if ((flags & MAYBE_DIRTY) !== 0) {
    var dependencies = reaction.deps;
    var is_unowned = (flags & UNOWNED) !== 0;
    if (dependencies !== null) {
      var i;
      var dependency;
      var is_disconnected = (flags & DISCONNECTED) !== 0;
      var is_unowned_connected = is_unowned && active_effect !== null && !skip_reaction;
      var length = dependencies.length;
      if ((is_disconnected || is_unowned_connected) && (active_effect === null || (active_effect.f & DESTROYED) === 0)) {
        var derived2 = (
          /** @type {Derived} */
          reaction
        );
        var parent = derived2.parent;
        for (i = 0; i < length; i++) {
          dependency = dependencies[i];
          if (is_disconnected || !dependency?.reactions?.includes(derived2)) {
            (dependency.reactions ??= []).push(derived2);
          }
        }
        if (is_disconnected) {
          derived2.f ^= DISCONNECTED;
        }
        if (is_unowned_connected && parent !== null && (parent.f & UNOWNED) === 0) {
          derived2.f ^= UNOWNED;
        }
      }
      for (i = 0; i < length; i++) {
        dependency = dependencies[i];
        if (is_dirty(
          /** @type {Derived} */
          dependency
        )) {
          update_derived(
            /** @type {Derived} */
            dependency
          );
        }
        if (dependency.wv > reaction.wv) {
          return true;
        }
      }
    }
    if (!is_unowned || active_effect !== null && !skip_reaction) {
      set_signal_status(reaction, CLEAN);
    }
  }
  return false;
}
__name(is_dirty, "is_dirty");
function schedule_possible_effect_self_invalidation(signal, effect, root2 = true) {
  var reactions = signal.reactions;
  if (reactions === null)
    return;
  if (current_sources?.includes(signal)) {
    return;
  }
  for (var i = 0; i < reactions.length; i++) {
    var reaction = reactions[i];
    if ((reaction.f & DERIVED) !== 0) {
      schedule_possible_effect_self_invalidation(
        /** @type {Derived} */
        reaction,
        effect,
        false
      );
    } else if (effect === reaction) {
      if (root2) {
        set_signal_status(reaction, DIRTY);
      } else if ((reaction.f & CLEAN) !== 0) {
        set_signal_status(reaction, MAYBE_DIRTY);
      }
      schedule_effect(
        /** @type {Effect} */
        reaction
      );
    }
  }
}
__name(schedule_possible_effect_self_invalidation, "schedule_possible_effect_self_invalidation");
function update_reaction(reaction) {
  var previous_deps = new_deps;
  var previous_skipped_deps = skipped_deps;
  var previous_untracked_writes = untracked_writes;
  var previous_reaction = active_reaction;
  var previous_skip_reaction = skip_reaction;
  var previous_sources = current_sources;
  var previous_component_context = component_context;
  var previous_untracking = untracking;
  var previous_update_version = update_version;
  var flags = reaction.f;
  new_deps = /** @type {null | Value[]} */
  null;
  skipped_deps = 0;
  untracked_writes = null;
  skip_reaction = (flags & UNOWNED) !== 0 && (untracking || !is_updating_effect || active_reaction === null);
  active_reaction = (flags & (BRANCH_EFFECT | ROOT_EFFECT)) === 0 ? reaction : null;
  current_sources = null;
  set_component_context(reaction.ctx);
  untracking = false;
  update_version = ++read_version;
  if (reaction.ac !== null) {
    reaction.ac.abort(STALE_REACTION);
    reaction.ac = null;
  }
  try {
    reaction.f |= REACTION_IS_UPDATING;
    var result = (
      /** @type {Function} */
      (0, reaction.fn)()
    );
    var deps = reaction.deps;
    if (new_deps !== null) {
      var i;
      remove_reactions(reaction, skipped_deps);
      if (deps !== null && skipped_deps > 0) {
        deps.length = skipped_deps + new_deps.length;
        for (i = 0; i < new_deps.length; i++) {
          deps[skipped_deps + i] = new_deps[i];
        }
      } else {
        reaction.deps = deps = new_deps;
      }
      if (!skip_reaction || // Deriveds that already have reactions can cleanup, so we still add them as reactions
      (flags & DERIVED) !== 0 && /** @type {import('#client').Derived} */
      reaction.reactions !== null) {
        for (i = skipped_deps; i < deps.length; i++) {
          (deps[i].reactions ??= []).push(reaction);
        }
      }
    } else if (deps !== null && skipped_deps < deps.length) {
      remove_reactions(reaction, skipped_deps);
      deps.length = skipped_deps;
    }
    if (is_runes() && untracked_writes !== null && !untracking && deps !== null && (reaction.f & (DERIVED | MAYBE_DIRTY | DIRTY)) === 0) {
      for (i = 0; i < /** @type {Source[]} */
      untracked_writes.length; i++) {
        schedule_possible_effect_self_invalidation(
          untracked_writes[i],
          /** @type {Effect} */
          reaction
        );
      }
    }
    if (previous_reaction !== null && previous_reaction !== reaction) {
      read_version++;
      if (untracked_writes !== null) {
        if (previous_untracked_writes === null) {
          previous_untracked_writes = untracked_writes;
        } else {
          previous_untracked_writes.push(.../** @type {Source[]} */
          untracked_writes);
        }
      }
    }
    if ((reaction.f & ERROR_VALUE) !== 0) {
      reaction.f ^= ERROR_VALUE;
    }
    return result;
  } catch (error22) {
    return handle_error(error22);
  } finally {
    reaction.f ^= REACTION_IS_UPDATING;
    new_deps = previous_deps;
    skipped_deps = previous_skipped_deps;
    untracked_writes = previous_untracked_writes;
    active_reaction = previous_reaction;
    skip_reaction = previous_skip_reaction;
    current_sources = previous_sources;
    set_component_context(previous_component_context);
    untracking = previous_untracking;
    update_version = previous_update_version;
  }
}
__name(update_reaction, "update_reaction");
function remove_reaction(signal, dependency) {
  let reactions = dependency.reactions;
  if (reactions !== null) {
    var index13 = index_of.call(reactions, signal);
    if (index13 !== -1) {
      var new_length = reactions.length - 1;
      if (new_length === 0) {
        reactions = dependency.reactions = null;
      } else {
        reactions[index13] = reactions[new_length];
        reactions.pop();
      }
    }
  }
  if (reactions === null && (dependency.f & DERIVED) !== 0 && // Destroying a child effect while updating a parent effect can cause a dependency to appear
  // to be unused, when in fact it is used by the currently-updating parent. Checking `new_deps`
  // allows us to skip the expensive work of disconnecting and immediately reconnecting it
  (new_deps === null || !new_deps.includes(dependency))) {
    set_signal_status(dependency, MAYBE_DIRTY);
    if ((dependency.f & (UNOWNED | DISCONNECTED)) === 0) {
      dependency.f ^= DISCONNECTED;
    }
    destroy_derived_effects(
      /** @type {Derived} **/
      dependency
    );
    remove_reactions(
      /** @type {Derived} **/
      dependency,
      0
    );
  }
}
__name(remove_reaction, "remove_reaction");
function remove_reactions(signal, start_index) {
  var dependencies = signal.deps;
  if (dependencies === null)
    return;
  for (var i = start_index; i < dependencies.length; i++) {
    remove_reaction(signal, dependencies[i]);
  }
}
__name(remove_reactions, "remove_reactions");
function update_effect(effect) {
  var flags = effect.f;
  if ((flags & DESTROYED) !== 0) {
    return;
  }
  set_signal_status(effect, CLEAN);
  var previous_effect = active_effect;
  var was_updating_effect = is_updating_effect;
  active_effect = effect;
  is_updating_effect = true;
  try {
    if ((flags & BLOCK_EFFECT) !== 0) {
      destroy_block_effect_children(effect);
    } else {
      destroy_effect_children(effect);
    }
    execute_effect_teardown(effect);
    var teardown = update_reaction(effect);
    effect.teardown = typeof teardown === "function" ? teardown : null;
    effect.wv = write_version;
    var dep;
    if (DEV && tracing_mode_flag && (effect.f & DIRTY) !== 0 && effect.deps !== null)
      ;
  } finally {
    is_updating_effect = was_updating_effect;
    active_effect = previous_effect;
  }
}
__name(update_effect, "update_effect");
function get(signal) {
  var flags = signal.f;
  var is_derived = (flags & DERIVED) !== 0;
  if (active_reaction !== null && !untracking) {
    var destroyed = active_effect !== null && (active_effect.f & DESTROYED) !== 0;
    if (!destroyed && !current_sources?.includes(signal)) {
      var deps = active_reaction.deps;
      if ((active_reaction.f & REACTION_IS_UPDATING) !== 0) {
        if (signal.rv < read_version) {
          signal.rv = read_version;
          if (new_deps === null && deps !== null && deps[skipped_deps] === signal) {
            skipped_deps++;
          } else if (new_deps === null) {
            new_deps = [signal];
          } else if (!skip_reaction || !new_deps.includes(signal)) {
            new_deps.push(signal);
          }
        }
      } else {
        (active_reaction.deps ??= []).push(signal);
        var reactions = signal.reactions;
        if (reactions === null) {
          signal.reactions = [active_reaction];
        } else if (!reactions.includes(active_reaction)) {
          reactions.push(active_reaction);
        }
      }
    }
  } else if (is_derived && /** @type {Derived} */
  signal.deps === null && /** @type {Derived} */
  signal.effects === null) {
    var derived2 = (
      /** @type {Derived} */
      signal
    );
    var parent = derived2.parent;
    if (parent !== null && (parent.f & UNOWNED) === 0) {
      derived2.f ^= UNOWNED;
    }
  }
  if (is_destroying_effect) {
    if (old_values.has(signal)) {
      return old_values.get(signal);
    }
    if (is_derived) {
      derived2 = /** @type {Derived} */
      signal;
      var value = derived2.v;
      if ((derived2.f & CLEAN) === 0 && derived2.reactions !== null || depends_on_old_values(derived2)) {
        value = execute_derived(derived2);
      }
      old_values.set(derived2, value);
      return value;
    }
  } else if (is_derived) {
    derived2 = /** @type {Derived} */
    signal;
    if (batch_deriveds?.has(derived2)) {
      return batch_deriveds.get(derived2);
    }
    if (is_dirty(derived2)) {
      update_derived(derived2);
    }
  }
  if ((signal.f & ERROR_VALUE) !== 0) {
    throw signal.v;
  }
  return signal.v;
}
__name(get, "get");
function depends_on_old_values(derived2) {
  if (derived2.v === UNINITIALIZED)
    return true;
  if (derived2.deps === null)
    return false;
  for (const dep of derived2.deps) {
    if (old_values.has(dep)) {
      return true;
    }
    if ((dep.f & DERIVED) !== 0 && depends_on_old_values(
      /** @type {Derived} */
      dep
    )) {
      return true;
    }
  }
  return false;
}
__name(depends_on_old_values, "depends_on_old_values");
function untrack(fn) {
  var previous_untracking = untracking;
  try {
    untracking = true;
    return fn();
  } finally {
    untracking = previous_untracking;
  }
}
__name(untrack, "untrack");
function set_signal_status(signal, status) {
  signal.f = signal.f & STATUS_MASK | status;
}
__name(set_signal_status, "set_signal_status");
function escape_html(value, is_attr) {
  const str = String(value ?? "");
  const pattern2 = is_attr ? ATTR_REGEX : CONTENT_REGEX;
  pattern2.lastIndex = 0;
  let escaped2 = "";
  let last = 0;
  while (pattern2.test(str)) {
    const i = pattern2.lastIndex - 1;
    const ch = str[i];
    escaped2 += str.substring(last, i) + (ch === "&" ? "&amp;" : ch === '"' ? "&quot;" : "&lt;");
    last = i + 1;
  }
  return escaped2 + str.substring(last);
}
__name(escape_html, "escape_html");
function r(e3) {
  var t2, f, n2 = "";
  if ("string" == typeof e3 || "number" == typeof e3)
    n2 += e3;
  else if ("object" == typeof e3)
    if (Array.isArray(e3)) {
      var o2 = e3.length;
      for (t2 = 0; t2 < o2; t2++)
        e3[t2] && (f = r(e3[t2])) && (n2 && (n2 += " "), n2 += f);
    } else
      for (f in e3)
        e3[f] && (n2 && (n2 += " "), n2 += f);
  return n2;
}
__name(r, "r");
function clsx$1() {
  for (var e3, t2, f = 0, n2 = "", o2 = arguments.length; f < o2; f++)
    (e3 = arguments[f]) && (t2 = r(e3)) && (n2 && (n2 += " "), n2 += t2);
  return n2;
}
__name(clsx$1, "clsx$1");
function attr(name, value, is_boolean = false) {
  if (value == null || !value && is_boolean)
    return "";
  const normalized = name in replacements && replacements[name].get(value) || value;
  const assignment = is_boolean ? "" : `="${escape_html(normalized, true)}"`;
  return ` ${name}${assignment}`;
}
__name(attr, "attr");
function clsx(value) {
  if (typeof value === "object") {
    return clsx$1(value);
  } else {
    return value ?? "";
  }
}
__name(clsx, "clsx");
function to_class(value, hash2, directives) {
  var classname = value == null ? "" : "" + value;
  return classname === "" ? null : classname;
}
__name(to_class, "to_class");
function to_style(value, styles) {
  return value == null ? null : String(value);
}
__name(to_style, "to_style");
function subscribe_to_store(store, run, invalidate) {
  if (store == null) {
    run(void 0);
    if (invalidate)
      invalidate(void 0);
    return noop;
  }
  const unsub = untrack(
    () => store.subscribe(
      run,
      // @ts-expect-error
      invalidate
    )
  );
  return unsub.unsubscribe ? () => unsub.unsubscribe() : unsub;
}
__name(subscribe_to_store, "subscribe_to_store");
function getContext(key2) {
  const context_map = get_or_init_context_map();
  const result = (
    /** @type {T} */
    context_map.get(key2)
  );
  return result;
}
__name(getContext, "getContext");
function setContext(key2, context22) {
  get_or_init_context_map().set(key2, context22);
  return context22;
}
__name(setContext, "setContext");
function get_or_init_context_map(name) {
  if (current_component === null) {
    lifecycle_outside_component();
  }
  return current_component.c ??= new Map(get_parent_context(current_component) || void 0);
}
__name(get_or_init_context_map, "get_or_init_context_map");
function push(fn) {
  current_component = { p: current_component, c: null, d: null };
}
__name(push, "push");
function pop() {
  var component13 = (
    /** @type {Component} */
    current_component
  );
  var ondestroy = component13.d;
  if (ondestroy) {
    on_destroy.push(...ondestroy);
  }
  current_component = component13.p;
}
__name(pop, "pop");
function get_parent_context(component_context2) {
  let parent = component_context2.p;
  while (parent !== null) {
    const context_map = parent.c;
    if (context_map !== null) {
      return context_map;
    }
    parent = parent.p;
  }
  return null;
}
__name(get_parent_context, "get_parent_context");
function copy_payload({ out, css, head: head2, uid }) {
  const payload = new Payload();
  payload.out = [...out];
  payload.css = new Set(css);
  payload.uid = uid;
  payload.head = new HeadPayload();
  payload.head.out = [...head2.out];
  payload.head.css = new Set(head2.css);
  payload.head.title = head2.title;
  payload.head.uid = head2.uid;
  return payload;
}
__name(copy_payload, "copy_payload");
function assign_payload(p1, p2) {
  p1.out = [...p2.out];
  p1.css = p2.css;
  p1.head = p2.head;
  p1.uid = p2.uid;
}
__name(assign_payload, "assign_payload");
function props_id_generator(prefix) {
  let uid = 1;
  return () => `${prefix}s${uid++}`;
}
__name(props_id_generator, "props_id_generator");
function abort2() {
  controller?.abort(STALE_REACTION);
  controller = null;
}
__name(abort2, "abort");
function render(component13, options2 = {}) {
  try {
    const payload = new Payload(options2.idPrefix ? options2.idPrefix + "-" : "");
    const prev_on_destroy = on_destroy;
    on_destroy = [];
    payload.out.push(BLOCK_OPEN);
    let reset_reset_element;
    if (DEV)
      ;
    if (options2.context) {
      push();
      current_component.c = options2.context;
    }
    component13(payload, options2.props ?? {}, {}, {});
    if (options2.context) {
      pop();
    }
    if (reset_reset_element) {
      reset_reset_element();
    }
    payload.out.push(BLOCK_CLOSE);
    for (const cleanup of on_destroy)
      cleanup();
    on_destroy = prev_on_destroy;
    let head2 = payload.head.out.join("") + payload.head.title;
    for (const { hash: hash2, code } of payload.css) {
      head2 += `<style id="${hash2}">${code}</style>`;
    }
    const body2 = payload.out.join("");
    return {
      head: head2,
      html: body2,
      body: body2
    };
  } finally {
    abort2();
  }
}
__name(render, "render");
function head(payload, fn) {
  const head_payload = payload.head;
  head_payload.out.push(BLOCK_OPEN);
  fn(head_payload);
  head_payload.out.push(BLOCK_CLOSE);
}
__name(head, "head");
function stringify2(value) {
  return typeof value === "string" ? value : value == null ? "" : value + "";
}
__name(stringify2, "stringify2");
function attr_class(value, hash2, directives) {
  var result = to_class(value);
  return result ? ` class="${escape_html(result, true)}"` : "";
}
__name(attr_class, "attr_class");
function attr_style(value, directives) {
  var result = to_style(value);
  return result ? ` style="${escape_html(result, true)}"` : "";
}
__name(attr_style, "attr_style");
function store_get(store_values, store_name, store) {
  if (store_name in store_values && store_values[store_name][0] === store) {
    return store_values[store_name][2];
  }
  store_values[store_name]?.[1]();
  store_values[store_name] = [store, null, void 0];
  const unsub = subscribe_to_store(
    store,
    /** @param {any} v */
    (v) => store_values[store_name][2] = v
  );
  store_values[store_name][1] = unsub;
  return store_values[store_name][2];
}
__name(store_get, "store_get");
function unsubscribe_stores(store_values) {
  for (const store_name in store_values) {
    store_values[store_name][1]();
  }
}
__name(unsubscribe_stores, "unsubscribe_stores");
function slot(payload, $$props, name, slot_props, fallback_fn) {
  var slot_fn = $$props.$$slots?.[name];
  if (slot_fn === true) {
    slot_fn = $$props["children"];
  }
  if (slot_fn !== void 0) {
    slot_fn(payload, slot_props);
  }
}
__name(slot, "slot");
function sanitize_slots(props) {
  const sanitized = {};
  if (props.children)
    sanitized.default = true;
  for (const key2 in props.$$slots) {
    sanitized[key2] = true;
  }
  return sanitized;
}
__name(sanitize_slots, "sanitize_slots");
function bind_props(props_parent, props_now) {
  for (const key2 in props_now) {
    const initial_value = props_parent[key2];
    const value = props_now[key2];
    if (initial_value === void 0 && value !== void 0 && Object.getOwnPropertyDescriptor(props_parent, key2)?.set) {
      props_parent[key2] = value;
    }
  }
}
__name(bind_props, "bind_props");
function ensure_array_like(array_like_or_iterator) {
  if (array_like_or_iterator) {
    return array_like_or_iterator.length !== void 0 ? array_like_or_iterator : Array.from(array_like_or_iterator);
  }
  return [];
}
__name(ensure_array_like, "ensure_array_like");
function maybe_selected(payload, value) {
  return value === payload.select_value ? " selected" : "";
}
__name(maybe_selected, "maybe_selected");
var is_array;
var index_of;
var array_from;
var define_property;
var get_descriptor;
var object_prototype;
var array_prototype;
var get_prototype_of;
var is_extensible;
var noop;
var DERIVED;
var EFFECT;
var BLOCK_EFFECT;
var BRANCH_EFFECT;
var ROOT_EFFECT;
var BOUNDARY_EFFECT;
var UNOWNED;
var DISCONNECTED;
var CLEAN;
var DIRTY;
var MAYBE_DIRTY;
var INERT;
var DESTROYED;
var EFFECT_RAN;
var EFFECT_TRANSPARENT;
var INSPECT_EFFECT;
var HEAD_EFFECT;
var EFFECT_PRESERVED;
var USER_EFFECT;
var REACTION_IS_UPDATING;
var ASYNC;
var ERROR_VALUE;
var STATE_SYMBOL;
var LEGACY_PROPS;
var STALE_REACTION;
var COMMENT_NODE;
var HYDRATION_START;
var HYDRATION_END;
var HYDRATION_ERROR;
var UNINITIALIZED;
var tracing_mode_flag;
var component_context;
var adjustments;
var micro_tasks;
var idle_tasks;
var batches;
var current_batch;
var batch_deriveds;
var effect_pending_updates;
var tasks;
var queued_root_effects;
var last_scheduled_effect;
var is_flushing;
var is_flushing_sync;
var Batch;
var old_values;
var $window;
var first_child_getter;
var next_sibling_getter;
var is_updating_effect;
var is_destroying_effect;
var active_reaction;
var untracking;
var active_effect;
var current_sources;
var new_deps;
var skipped_deps;
var untracked_writes;
var write_version;
var read_version;
var update_version;
var skip_reaction;
var STATUS_MASK;
var ATTR_REGEX;
var CONTENT_REGEX;
var replacements;
var current_component;
var BLOCK_OPEN;
var BLOCK_CLOSE;
var HeadPayload;
var Payload;
var controller;
var on_destroy;
var init_index2 = __esm2({
  ".svelte-kit/output/server/chunks/index2.js"() {
    init_false();
    is_array = Array.isArray;
    index_of = Array.prototype.indexOf;
    array_from = Array.from;
    define_property = Object.defineProperty;
    get_descriptor = Object.getOwnPropertyDescriptor;
    object_prototype = Object.prototype;
    array_prototype = Array.prototype;
    get_prototype_of = Object.getPrototypeOf;
    is_extensible = Object.isExtensible;
    noop = /* @__PURE__ */ __name(() => {
    }, "noop");
    DERIVED = 1 << 1;
    EFFECT = 1 << 2;
    BLOCK_EFFECT = 1 << 4;
    BRANCH_EFFECT = 1 << 5;
    ROOT_EFFECT = 1 << 6;
    BOUNDARY_EFFECT = 1 << 7;
    UNOWNED = 1 << 8;
    DISCONNECTED = 1 << 9;
    CLEAN = 1 << 10;
    DIRTY = 1 << 11;
    MAYBE_DIRTY = 1 << 12;
    INERT = 1 << 13;
    DESTROYED = 1 << 14;
    EFFECT_RAN = 1 << 15;
    EFFECT_TRANSPARENT = 1 << 16;
    INSPECT_EFFECT = 1 << 17;
    HEAD_EFFECT = 1 << 18;
    EFFECT_PRESERVED = 1 << 19;
    USER_EFFECT = 1 << 20;
    REACTION_IS_UPDATING = 1 << 21;
    ASYNC = 1 << 22;
    ERROR_VALUE = 1 << 23;
    STATE_SYMBOL = Symbol("$state");
    LEGACY_PROPS = Symbol("legacy props");
    STALE_REACTION = new (/* @__PURE__ */ __name(class StaleReactionError extends Error {
      name = "StaleReactionError";
      message = "The reaction that called `getAbortSignal()` was re-run or destroyed";
    }, "StaleReactionError"))();
    COMMENT_NODE = 8;
    HYDRATION_START = "[";
    HYDRATION_END = "]";
    HYDRATION_ERROR = {};
    UNINITIALIZED = Symbol();
    tracing_mode_flag = false;
    component_context = null;
    adjustments = /* @__PURE__ */ new WeakMap();
    micro_tasks = [];
    idle_tasks = [];
    batches = /* @__PURE__ */ new Set();
    current_batch = null;
    batch_deriveds = null;
    effect_pending_updates = /* @__PURE__ */ new Set();
    tasks = [];
    queued_root_effects = [];
    last_scheduled_effect = null;
    is_flushing = false;
    is_flushing_sync = false;
    Batch = /* @__PURE__ */ __name(class _Batch {
      /**
       * The current values of any sources that are updated in this batch
       * They keys of this map are identical to `this.#previous`
       * @type {Map<Source, any>}
       */
      current = /* @__PURE__ */ new Map();
      /**
       * The values of any sources that are updated in this batch _before_ those updates took place.
       * They keys of this map are identical to `this.#current`
       * @type {Map<Source, any>}
       */
      #previous = /* @__PURE__ */ new Map();
      /**
       * When the batch is committed (and the DOM is updated), we need to remove old branches
       * and append new ones by calling the functions added inside (if/each/key/etc) blocks
       * @type {Set<() => void>}
       */
      #callbacks = /* @__PURE__ */ new Set();
      /**
       * The number of async effects that are currently in flight
       */
      #pending = 0;
      /**
       * A deferred that resolves when the batch is committed, used with `settled()`
       * TODO replace with Promise.withResolvers once supported widely enough
       * @type {{ promise: Promise<void>, resolve: (value?: any) => void, reject: (reason: unknown) => void } | null}
       */
      #deferred = null;
      /**
       * True if an async effect inside this batch resolved and
       * its parent branch was already deleted
       */
      #neutered = false;
      /**
       * Async effects (created inside `async_derived`) encountered during processing.
       * These run after the rest of the batch has updated, since they should
       * always have the latest values
       * @type {Effect[]}
       */
      #async_effects = [];
      /**
       * The same as `#async_effects`, but for effects inside a newly-created
       * `<svelte:boundary>` — these do not prevent the batch from committing
       * @type {Effect[]}
       */
      #boundary_async_effects = [];
      /**
       * Template effects and `$effect.pre` effects, which run when
       * a batch is committed
       * @type {Effect[]}
       */
      #render_effects = [];
      /**
       * The same as `#render_effects`, but for `$effect` (which runs after)
       * @type {Effect[]}
       */
      #effects = [];
      /**
       * Block effects, which may need to re-run on subsequent flushes
       * in order to update internal sources (e.g. each block items)
       * @type {Effect[]}
       */
      #block_effects = [];
      /**
       * Deferred effects (which run after async work has completed) that are DIRTY
       * @type {Effect[]}
       */
      #dirty_effects = [];
      /**
       * Deferred effects that are MAYBE_DIRTY
       * @type {Effect[]}
       */
      #maybe_dirty_effects = [];
      /**
       * A set of branches that still exist, but will be destroyed when this batch
       * is committed — we skip over these during `process`
       * @type {Set<Effect>}
       */
      skipped_effects = /* @__PURE__ */ new Set();
      /**
       *
       * @param {Effect[]} root_effects
       */
      process(root_effects) {
        queued_root_effects = [];
        var current_values = null;
        if (batches.size > 1) {
          current_values = /* @__PURE__ */ new Map();
          batch_deriveds = /* @__PURE__ */ new Map();
          for (const [source2, current] of this.current) {
            current_values.set(source2, { v: source2.v, wv: source2.wv });
            source2.v = current;
          }
          for (const batch of batches) {
            if (batch === this)
              continue;
            for (const [source2, previous] of batch.#previous) {
              if (!current_values.has(source2)) {
                current_values.set(source2, { v: source2.v, wv: source2.wv });
                source2.v = previous;
              }
            }
          }
        }
        for (const root2 of root_effects) {
          this.#traverse_effect_tree(root2);
        }
        if (this.#async_effects.length === 0 && this.#pending === 0) {
          this.#commit();
          var render_effects = this.#render_effects;
          var effects = this.#effects;
          this.#render_effects = [];
          this.#effects = [];
          this.#block_effects = [];
          current_batch = null;
          flush_queued_effects(render_effects);
          flush_queued_effects(effects);
          if (current_batch === null) {
            current_batch = this;
          } else {
            batches.delete(this);
          }
          this.#deferred?.resolve();
        } else {
          this.#defer_effects(this.#render_effects);
          this.#defer_effects(this.#effects);
          this.#defer_effects(this.#block_effects);
        }
        if (current_values) {
          for (const [source2, { v, wv }] of current_values) {
            if (source2.wv <= wv) {
              source2.v = v;
            }
          }
          batch_deriveds = null;
        }
        for (const effect of this.#async_effects) {
          update_effect(effect);
        }
        for (const effect of this.#boundary_async_effects) {
          update_effect(effect);
        }
        this.#async_effects = [];
        this.#boundary_async_effects = [];
      }
      /**
       * Traverse the effect tree, executing effects or stashing
       * them for later execution as appropriate
       * @param {Effect} root
       */
      #traverse_effect_tree(root2) {
        root2.f ^= CLEAN;
        var effect = root2.first;
        while (effect !== null) {
          var flags = effect.f;
          var is_branch = (flags & (BRANCH_EFFECT | ROOT_EFFECT)) !== 0;
          var is_skippable_branch = is_branch && (flags & CLEAN) !== 0;
          var skip = is_skippable_branch || (flags & INERT) !== 0 || this.skipped_effects.has(effect);
          if (!skip && effect.fn !== null) {
            if (is_branch) {
              effect.f ^= CLEAN;
            } else if ((flags & CLEAN) === 0) {
              if ((flags & EFFECT) !== 0) {
                this.#effects.push(effect);
              } else if ((flags & ASYNC) !== 0) {
                var effects = effect.b?.pending ? this.#boundary_async_effects : this.#async_effects;
                effects.push(effect);
              } else if (is_dirty(effect)) {
                if ((effect.f & BLOCK_EFFECT) !== 0)
                  this.#block_effects.push(effect);
                update_effect(effect);
              }
            }
            var child = effect.first;
            if (child !== null) {
              effect = child;
              continue;
            }
          }
          var parent = effect.parent;
          effect = effect.next;
          while (effect === null && parent !== null) {
            effect = parent.next;
            parent = parent.parent;
          }
        }
      }
      /**
       * @param {Effect[]} effects
       */
      #defer_effects(effects) {
        for (const e3 of effects) {
          const target = (e3.f & DIRTY) !== 0 ? this.#dirty_effects : this.#maybe_dirty_effects;
          target.push(e3);
          set_signal_status(e3, CLEAN);
        }
        effects.length = 0;
      }
      /**
       * Associate a change to a given source with the current
       * batch, noting its previous and current values
       * @param {Source} source
       * @param {any} value
       */
      capture(source2, value) {
        if (!this.#previous.has(source2)) {
          this.#previous.set(source2, value);
        }
        this.current.set(source2, source2.v);
      }
      activate() {
        current_batch = this;
      }
      deactivate() {
        current_batch = null;
        for (const update of effect_pending_updates) {
          effect_pending_updates.delete(update);
          update();
          if (current_batch !== null) {
            break;
          }
        }
      }
      neuter() {
        this.#neutered = true;
      }
      flush() {
        if (queued_root_effects.length > 0) {
          flush_effects();
        } else {
          this.#commit();
        }
        if (current_batch !== this) {
          return;
        }
        if (this.#pending === 0) {
          batches.delete(this);
        }
        this.deactivate();
      }
      /**
       * Append and remove branches to/from the DOM
       */
      #commit() {
        if (!this.#neutered) {
          for (const fn of this.#callbacks) {
            fn();
          }
        }
        this.#callbacks.clear();
      }
      increment() {
        this.#pending += 1;
      }
      decrement() {
        this.#pending -= 1;
        if (this.#pending === 0) {
          for (const e3 of this.#dirty_effects) {
            set_signal_status(e3, DIRTY);
            schedule_effect(e3);
          }
          for (const e3 of this.#maybe_dirty_effects) {
            set_signal_status(e3, MAYBE_DIRTY);
            schedule_effect(e3);
          }
          this.#render_effects = [];
          this.#effects = [];
          this.flush();
        } else {
          this.deactivate();
        }
      }
      /** @param {() => void} fn */
      add_callback(fn) {
        this.#callbacks.add(fn);
      }
      settled() {
        return (this.#deferred ??= deferred()).promise;
      }
      static ensure() {
        if (current_batch === null) {
          const batch = current_batch = new _Batch();
          batches.add(current_batch);
          if (!is_flushing_sync) {
            _Batch.enqueue(() => {
              if (current_batch !== batch) {
                return;
              }
              batch.flush();
            });
          }
        }
        return current_batch;
      }
      /** @param {() => void} task */
      static enqueue(task) {
        if (tasks.length === 0) {
          queueMicrotask(dequeue);
        }
        tasks.unshift(task);
      }
    }, "_Batch");
    old_values = /* @__PURE__ */ new Map();
    is_updating_effect = false;
    is_destroying_effect = false;
    active_reaction = null;
    untracking = false;
    active_effect = null;
    current_sources = null;
    new_deps = null;
    skipped_deps = 0;
    untracked_writes = null;
    write_version = 1;
    read_version = 0;
    update_version = read_version;
    skip_reaction = false;
    STATUS_MASK = -7169;
    ATTR_REGEX = /[&"<]/g;
    CONTENT_REGEX = /[&<]/g;
    replacements = {
      translate: /* @__PURE__ */ new Map([
        [true, "yes"],
        [false, "no"]
      ])
    };
    current_component = null;
    BLOCK_OPEN = `<!--${HYDRATION_START}-->`;
    BLOCK_CLOSE = `<!--${HYDRATION_END}-->`;
    HeadPayload = /* @__PURE__ */ __name(class {
      /** @type {Set<{ hash: string; code: string }>} */
      css = /* @__PURE__ */ new Set();
      /** @type {string[]} */
      out = [];
      uid = () => "";
      title = "";
      constructor(css = /* @__PURE__ */ new Set(), out = [], title2 = "", uid = () => "") {
        this.css = css;
        this.out = out;
        this.title = title2;
        this.uid = uid;
      }
    }, "HeadPayload");
    Payload = /* @__PURE__ */ __name(class {
      /** @type {Set<{ hash: string; code: string }>} */
      css = /* @__PURE__ */ new Set();
      /** @type {string[]} */
      out = [];
      uid = () => "";
      select_value = void 0;
      head = new HeadPayload();
      constructor(id_prefix = "") {
        this.uid = props_id_generator(id_prefix);
        this.head.uid = this.uid;
      }
    }, "Payload");
    controller = null;
    on_destroy = [];
  }
});
function readable(value, start) {
  return {
    subscribe: writable(value, start).subscribe
  };
}
__name(readable, "readable");
function writable(value, start = noop) {
  let stop = null;
  const subscribers = /* @__PURE__ */ new Set();
  function set2(new_value) {
    if (safe_not_equal(value, new_value)) {
      value = new_value;
      if (stop) {
        const run_queue = !subscriber_queue.length;
        for (const subscriber of subscribers) {
          subscriber[1]();
          subscriber_queue.push(subscriber, value);
        }
        if (run_queue) {
          for (let i = 0; i < subscriber_queue.length; i += 2) {
            subscriber_queue[i][0](subscriber_queue[i + 1]);
          }
          subscriber_queue.length = 0;
        }
      }
    }
  }
  __name(set2, "set2");
  function update(fn) {
    set2(fn(
      /** @type {T} */
      value
    ));
  }
  __name(update, "update");
  function subscribe(run, invalidate = noop) {
    const subscriber = [run, invalidate];
    subscribers.add(subscriber);
    if (subscribers.size === 1) {
      stop = start(set2, update) || noop;
    }
    run(
      /** @type {T} */
      value
    );
    return () => {
      subscribers.delete(subscriber);
      if (subscribers.size === 0 && stop) {
        stop();
        stop = null;
      }
    };
  }
  __name(subscribe, "subscribe");
  return { set: set2, update, subscribe };
}
__name(writable, "writable");
function derived(stores2, fn, initial_value) {
  const single = !Array.isArray(stores2);
  const stores_array = single ? [stores2] : stores2;
  if (!stores_array.every(Boolean)) {
    throw new Error("derived() expects stores as input, got a falsy value");
  }
  const auto = fn.length < 2;
  return readable(initial_value, (set2, update) => {
    let started = false;
    const values = [];
    let pending = 0;
    let cleanup = noop;
    const sync = /* @__PURE__ */ __name(() => {
      if (pending) {
        return;
      }
      cleanup();
      const result = fn(single ? values[0] : values, set2, update);
      if (auto) {
        set2(result);
      } else {
        cleanup = typeof result === "function" ? result : noop;
      }
    }, "sync");
    const unsubscribers = stores_array.map(
      (store, i) => subscribe_to_store(
        store,
        (value) => {
          values[i] = value;
          pending &= ~(1 << i);
          if (started) {
            sync();
          }
        },
        () => {
          pending |= 1 << i;
        }
      )
    );
    started = true;
    sync();
    return /* @__PURE__ */ __name(function stop() {
      run_all(unsubscribers);
      cleanup();
      started = false;
    }, "stop");
  });
}
__name(derived, "derived");
function get2(store) {
  let value;
  subscribe_to_store(store, (_) => value = _)();
  return value;
}
__name(get2, "get2");
var subscriber_queue;
var init_chunks = __esm2({
  ".svelte-kit/output/server/chunks/index.js"() {
    init_index2();
    subscriber_queue = [];
  }
});
var layout_ts_exports = {};
__export2(layout_ts_exports, {
  prerender: () => prerender
});
var prerender;
var init_layout_ts = __esm2({
  ".svelte-kit/output/server/entries/pages/_layout.ts.js"() {
    prerender = false;
  }
});
var layout_svelte_exports = {};
__export2(layout_svelte_exports, {
  default: () => _layout
});
function _layout($$payload, $$props) {
  $$payload.out.push(`<!---->`);
  slot($$payload, $$props, "default", {});
  $$payload.out.push(`<!---->`);
}
__name(_layout, "_layout");
var init_layout_svelte = __esm2({
  ".svelte-kit/output/server/entries/pages/_layout.svelte.js"() {
    init_index2();
  }
});
var __exports = {};
__export2(__exports, {
  component: () => component,
  fonts: () => fonts,
  imports: () => imports,
  index: () => index,
  stylesheets: () => stylesheets,
  universal: () => layout_ts_exports,
  universal_id: () => universal_id
});
var index;
var component_cache;
var component;
var universal_id;
var imports;
var stylesheets;
var fonts;
var init__ = __esm2({
  ".svelte-kit/output/server/nodes/0.js"() {
    init_layout_ts();
    index = 0;
    component = /* @__PURE__ */ __name(async () => component_cache ??= (await Promise.resolve().then(() => (init_layout_svelte(), layout_svelte_exports))).default, "component");
    universal_id = "src/routes/+layout.ts";
    imports = ["_app/immutable/nodes/0.uB_tW2RU.js", "_app/immutable/chunks/Bzak7iHL.js", "_app/immutable/chunks/CwwgXkST.js", "_app/immutable/chunks/BcvnQvbC.js", "_app/immutable/chunks/CVL3Nw5y.js"];
    stylesheets = ["_app/immutable/assets/0.D7tCX-0i.css"];
    fonts = [];
  }
});
var is_legacy;
var init_state_svelte = __esm2({
  ".svelte-kit/output/server/chunks/state.svelte.js"() {
    init_index2();
    is_legacy = noop.toString().includes("$$") || /function \w+\(\) \{\}/.test(noop.toString());
    if (is_legacy) {
      ({
        data: {},
        form: null,
        error: null,
        params: {},
        route: { id: null },
        state: {},
        status: -1,
        url: new URL("https://example.com")
      });
    }
  }
});
var error_svelte_exports = {};
__export2(error_svelte_exports, {
  default: () => Error$1
});
function create_updated_store() {
  const { set: set2, subscribe } = writable(false);
  {
    return {
      subscribe,
      // eslint-disable-next-line @typescript-eslint/require-await
      check: async () => false
    };
  }
}
__name(create_updated_store, "create_updated_store");
function context2() {
  return getContext("__request__");
}
__name(context2, "context");
function Error$1($$payload, $$props) {
  push();
  $$payload.out.push(`<h1>${escape_html(page.status)}</h1> <p>${escape_html(page.error?.message)}</p>`);
  pop();
}
__name(Error$1, "Error$1");
var stores;
var page$1;
var page;
var init_error_svelte = __esm2({
  ".svelte-kit/output/server/entries/fallbacks/error.svelte.js"() {
    init_index2();
    init_state_svelte();
    init_internal();
    init_exports2();
    init_chunks();
    stores = {
      updated: /* @__PURE__ */ create_updated_store()
    };
    ({
      check: stores.updated.check
    });
    page$1 = {
      get error() {
        return context2().page.error;
      },
      get status() {
        return context2().page.status;
      }
    };
    page = page$1;
  }
});
var __exports2 = {};
__export2(__exports2, {
  component: () => component2,
  fonts: () => fonts2,
  imports: () => imports2,
  index: () => index2,
  stylesheets: () => stylesheets2
});
var index2;
var component_cache2;
var component2;
var imports2;
var stylesheets2;
var fonts2;
var init__2 = __esm2({
  ".svelte-kit/output/server/nodes/1.js"() {
    index2 = 1;
    component2 = /* @__PURE__ */ __name(async () => component_cache2 ??= (await Promise.resolve().then(() => (init_error_svelte(), error_svelte_exports))).default, "component2");
    imports2 = ["_app/immutable/nodes/1.5upYF-8a.js", "_app/immutable/chunks/Bzak7iHL.js", "_app/immutable/chunks/CwwgXkST.js", "_app/immutable/chunks/BcvnQvbC.js", "_app/immutable/chunks/CL50UZ7u.js", "_app/immutable/chunks/BZ4fkazW.js", "_app/immutable/chunks/BRqbiqbO.js", "_app/immutable/chunks/BTISvJJE.js", "_app/immutable/chunks/D4eelw9t.js"];
    stylesheets2 = [];
    fonts2 = [];
  }
});
var page_ts_exports = {};
__export2(page_ts_exports, {
  load: () => load
});
var load;
var init_page_ts = __esm2({
  ".svelte-kit/output/server/entries/pages/_page.ts.js"() {
    load = /* @__PURE__ */ __name(async ({ url }) => {
      const tractate = url.searchParams.get("tractate") || "Berakhot";
      const page2 = url.searchParams.get("page") || "2";
      const amud = url.searchParams.get("amud") || "a";
      return {
        tractate,
        page: page2,
        amud
      };
    }, "load");
  }
});
var TRACTATE_IDS;
var HebrewBooksAPI;
var hebrewBooksAPI;
var init_hebrewbooks = __esm2({
  ".svelte-kit/output/server/chunks/hebrewbooks.js"() {
    TRACTATE_IDS = {
      "Berakhot": 1,
      "Shabbat": 2,
      "Eruvin": 3,
      "Pesachim": 4,
      "Shekalim": 5,
      "Yoma": 6,
      "Sukkah": 7,
      "Beitzah": 8,
      "Rosh Hashanah": 9,
      "Taanit": 10,
      "Megillah": 11,
      "Moed Katan": 12,
      "Chagigah": 13,
      "Yevamot": 14,
      "Ketubot": 15,
      "Nedarim": 16,
      "Nazir": 17,
      "Sotah": 18,
      "Gittin": 19,
      "Kiddushin": 20,
      "Bava Kamma": 21,
      "Bava Metzia": 22,
      "Bava Batra": 23,
      "Sanhedrin": 24,
      "Makkot": 25,
      "Shevuot": 26,
      "Avodah Zarah": 27,
      "Horayot": 28,
      "Zevachim": 29,
      "Menachot": 30,
      "Chullin": 31,
      "Bekhorot": 32,
      "Arakhin": 33,
      "Temurah": 34,
      "Keritot": 35,
      "Meilah": 36,
      "Niddah": 37
    };
    HebrewBooksAPI = /* @__PURE__ */ __name(class {
      async fetchPage(tractate, daf, options2 = {}) {
        try {
          const mesechtaId = TRACTATE_IDS[tractate];
          if (!mesechtaId) {
            throw new Error(`Unknown tractate: ${tractate}`);
          }
          const dafNum = parseInt(daf.replace(/[ab]/, ""));
          const amud = daf.includes("b") ? "b" : "a";
          const dafParam = amud === "a" ? dafNum.toString() : `${dafNum}b`;
          const params = new URLSearchParams({
            mesechta: mesechtaId,
            daf: dafParam,
            ...options2
            // Include any additional options like br=true
          });
          const endpoint = `https://daf-supplier.402.workers.dev?${params.toString()}`;
          console.log("Fetching from daf-supplier:", endpoint);
          const response = await fetch(endpoint);
          if (!response.ok) {
            throw new Error("Failed to fetch HebrewBooks data");
          }
          const data = await response.json();
          console.log("Response from daf-supplier:", data);
          const mappedData = {
            tractate: data.tractate || tractate,
            daf: daf.replace(/[ab]$/, ""),
            // Use our input, not data.dafDisplay
            amud: daf.includes("b") ? "b" : "a",
            // Use our input, not data.amud
            mainText: data.mainText || "",
            rashi: data.rashi || "",
            tosafot: data.tosafot || "",
            otherCommentaries: data.otherCommentaries,
            timestamp: data.timestamp || Date.now()
          };
          return mappedData;
        } catch (error22) {
          console.error("Error fetching HebrewBooks page:", error22);
          return null;
        }
      }
    }, "HebrewBooksAPI");
    hebrewBooksAPI = new HebrewBooksAPI();
  }
});
function addClasses(element, classNames) {
  if (Array.isArray(classNames))
    element.classList.add(...classNames);
  else
    element.classList.add(classNames);
}
__name(addClasses, "addClasses");
function setVars(object, prefix = "") {
  const currentRoot = document.querySelector(".dafRoot");
  if (!currentRoot) {
    console.error("Could not find .dafRoot element for setting CSS variables");
    return;
  }
  if (currentRoot !== rootElement) {
    rootElement = currentRoot;
  }
  Object.entries(object).forEach(([key2, value]) => {
    if (typeof value == "string") {
      rootElement.style.setProperty(`--${prefix}${key2}`, value);
    } else if (typeof value == "object") {
      setVars(value, `${key2}-`);
    }
  });
}
__name(setVars, "setVars");
var classes;
var sideSpacersClasses;
var containerClasses;
var rootElement;
var appliedOptions;
var styleManager;
var init_style_manager = __esm2({
  ".svelte-kit/output/server/chunks/style-manager.js"() {
    classes = {
      dafRoot: "dafRoot",
      outer: "outer",
      inner: "inner",
      main: "main",
      spacer: "spacer",
      start: "start",
      mid: "mid",
      end: "end",
      innerMid: "innerMid",
      outerMid: "outerMid",
      text: "text"
    };
    sideSpacersClasses = {
      start: [classes.spacer, classes.start],
      mid: [classes.spacer, classes.mid],
      end: [classes.spacer, classes.end]
    };
    containerClasses = {
      el: classes.dafRoot,
      outer: {
        el: classes.outer,
        spacers: sideSpacersClasses,
        text: classes.text
      },
      inner: {
        el: classes.inner,
        spacers: sideSpacersClasses,
        text: classes.text
      },
      main: {
        el: classes.main,
        spacers: {
          start: sideSpacersClasses.start,
          inner: [classes.spacer, classes.innerMid],
          outer: [classes.spacer, classes.outerMid]
        },
        text: classes.text
      }
    };
    rootElement = null;
    styleManager = {
      applyClasses(containers, classesMap = containerClasses) {
        rootElement = containers.el;
        for (const key2 in containers) {
          if (key2 in classesMap) {
            const value = classesMap[key2];
            if (typeof value === "object" && !Array.isArray(value)) {
              this.applyClasses(containers[key2], value);
            } else {
              addClasses(containers[key2], value);
            }
          }
        }
      },
      updateOptionsVars(options2) {
        appliedOptions = options2;
        setVars(options2);
      },
      updateSpacersVars(spacerHeights) {
        setVars(
          Object.fromEntries(
            Object.entries(spacerHeights).map(
              ([key2, value]) => [key2, String(value) + "px"]
            )
          ),
          "spacerHeights-"
        );
      },
      updateIsAmudB(amudB) {
        setVars({
          innerFloat: amudB ? "right" : "left",
          outerFloat: amudB ? "left" : "right"
        });
      },
      manageExceptions(spacerHeights) {
        if (!spacerHeights.exception) {
          setVars({
            hasOuterStartGap: "0",
            hasInnerStartGap: "0",
            outerStartWidth: "50%",
            innerStartWidth: "50%",
            innerPadding: appliedOptions.innerPadding,
            outerPadding: appliedOptions.outerPadding
          });
          return;
        }
        if (spacerHeights.exception === 1) {
          setVars({
            hasInnerStartGap: "1",
            innerStartWidth: "100%",
            outerStartWidth: "0%",
            innerPadding: "0px",
            outerPadding: "0px"
          });
        } else if (spacerHeights.exception === 2) {
          setVars({
            hasOuterStartGap: "1",
            outerStartWidth: "100%",
            innerStartWidth: "0%",
            innerPadding: "0px",
            outerPadding: "0px"
          });
        }
      }
    };
  }
});
var PUBLIC_OPENROUTER_API_KEY;
var PUBLIC_OPENROUTER_MODEL;
var OpenRouterTranslator;
var openRouterTranslator;
var init_openrouter_translator = __esm2({
  ".svelte-kit/output/server/chunks/openrouter-translator.js"() {
    PUBLIC_OPENROUTER_API_KEY = "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";
    PUBLIC_OPENROUTER_MODEL = "google/gemini-2.5-flash-lite";
    OpenRouterTranslator = /* @__PURE__ */ __name(class {
      apiKey;
      baseUrl = "https://openrouter.ai/api/v1/chat/completions";
      cache = /* @__PURE__ */ new Map();
      pendingRequests = /* @__PURE__ */ new Map();
      // Model preferences for translation - using models good at Hebrew
      models = {
        primary: PUBLIC_OPENROUTER_MODEL,
        fallback: "openai/gpt-4o-mini",
        fast: "google/gemini-2.0-flash-exp:free"
      };
      constructor(apiKey) {
        this.apiKey = apiKey || PUBLIC_OPENROUTER_API_KEY || "";
      }
      async translateText(request) {
        if (!this.apiKey) {
          throw new Error("OpenRouter API key not configured");
        }
        const { text: text2, context: context22, targetLanguage = "English" } = request;
        const cacheKey = `${text2}-${context22 || ""}-${targetLanguage}`;
        if (this.cache.has(cacheKey)) {
          return this.cache.get(cacheKey);
        }
        if (this.pendingRequests.has(cacheKey)) {
          return this.pendingRequests.get(cacheKey);
        }
        const systemPrompt = `Translate Talmudic Hebrew/Aramaic to ${targetLanguage}. Output ONLY the translation. No explanations, no commentary.`;
        const userPrompt = text2;
        const translationPromise = (async () => {
          try {
            const response = await fetch(this.baseUrl, {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${this.apiKey}`,
                "Content-Type": "application/json",
                "HTTP-Referer": "https://talmud.app",
                "X-Title": "Talmud Study App"
              },
              body: JSON.stringify({
                model: this.models.primary,
                messages: [
                  { role: "system", content: systemPrompt },
                  { role: "user", content: userPrompt }
                ],
                temperature: 0.3,
                // Lower temperature for more consistent translations
                max_tokens: 500
              })
            });
            if (!response.ok) {
              throw new Error(`OpenRouter API error: ${response.status} ${response.statusText}`);
            }
            const data = await response.json();
            const translation = data.choices[0]?.message?.content?.trim() || "";
            const result = {
              translation,
              model: data.model || this.models.primary,
              confidence: 0.9
              // Could be calculated based on response metadata
            };
            this.cache.set(cacheKey, result);
            this.pendingRequests.delete(cacheKey);
            return result;
          } catch (error22) {
            this.pendingRequests.delete(cacheKey);
            throw error22;
          }
        })();
        this.pendingRequests.set(cacheKey, translationPromise);
        return translationPromise;
      }
      // Batch translation for efficiency
      async translateBatch(texts, context22) {
        if (!this.apiKey) {
          throw new Error("OpenRouter API key not configured");
        }
        const systemPrompt = `Translate Hebrew/Aramaic to English. Output ONLY numbered translations. No explanations.`;
        const numberedTexts = texts.map((text2, i) => `${i + 1}. ${text2}`).join("\n");
        const userPrompt = numberedTexts;
        try {
          const response = await fetch(this.baseUrl, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${this.apiKey}`,
              "Content-Type": "application/json",
              "HTTP-Referer": "https://talmud.app",
              "X-Title": "Talmud Study App"
            },
            body: JSON.stringify({
              model: this.models.fast,
              // Use faster model for batch
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
              ],
              temperature: 0.3,
              max_tokens: 2e3
            })
          });
          const data = await response.json();
          const translationText = data.choices[0]?.message?.content || "";
          const translations = translationText.split("\n").filter((line) => /^\d+\./.test(line)).map((line) => line.replace(/^\d+\.\s*/, "").trim());
          while (translations.length < texts.length) {
            translations.push("[Translation unavailable]");
          }
          return translations.map((translation) => ({
            translation,
            model: data.model || this.models.fast,
            confidence: 0.85
          }));
        } catch (error22) {
          return texts.map(() => ({
            translation: "[Translation error]",
            model: "none",
            confidence: 0
          }));
        }
      }
      // Check if API key is configured
      isConfigured() {
        return !!this.apiKey;
      }
      // Clear translation cache
      clearCache() {
        this.cache.clear();
      }
      // Get cache size
      getCacheSize() {
        return this.cache.size;
      }
      // Save cache to localStorage (for persistence)
      saveCache() {
        try {
          const cacheData = Array.from(this.cache.entries());
          localStorage.setItem("talmud-translation-cache", JSON.stringify(cacheData));
        } catch (error22) {
        }
      }
      // Load cache from localStorage
      loadCache() {
        try {
          const cacheData = localStorage.getItem("talmud-translation-cache");
          if (cacheData) {
            const entries = JSON.parse(cacheData);
            this.cache = new Map(entries);
          }
        } catch (error22) {
        }
      }
    }, "OpenRouterTranslator");
    openRouterTranslator = new OpenRouterTranslator();
    if (typeof window !== "undefined") {
      openRouterTranslator.loadCache();
      setInterval(() => {
        openRouterTranslator.saveCache();
      }, 6e4);
      window.addEventListener("beforeunload", () => {
        openRouterTranslator.saveCache();
      });
    }
  }
});
var page_svelte_exports = {};
__export2(page_svelte_exports, {
  default: () => _page
});
function createTalmudStore() {
  const { subscribe, set: set2, update } = writable({
    tractate: "Berakhot",
    page: "2",
    amud: "a",
    data: null,
    loading: false,
    error: null
  });
  return {
    subscribe,
    // Load a page
    async loadPage(tractate, pageNum, amud, options2 = {}) {
      const fullPage = `${pageNum}${amud}`;
      update((state2) => ({
        ...state2,
        tractate,
        page: pageNum,
        amud,
        loading: true,
        error: null,
        data: null
        // Clear old data while loading
      }));
      try {
        const hebrewBooksOptions = options2.lineBreakMode ? { br: "true" } : {};
        const hebrewBooksData = await hebrewBooksAPI.fetchPage(tractate, fullPage, hebrewBooksOptions);
        if (hebrewBooksData) {
          update((state2) => ({
            ...state2,
            data: hebrewBooksData,
            loading: false
          }));
        } else {
          throw new Error("No data received from HebrewBooks API");
        }
      } catch (error22) {
        update((state2) => ({
          ...state2,
          loading: false,
          error: error22 instanceof Error ? error22.message : "Failed to load page"
        }));
      }
    },
    // Helper function to get tractate ID for API calls
    getTractateId(tractate) {
      const tractateMapping = {
        "Berakhot": "1",
        "Shabbat": "2",
        "Eruvin": "3",
        "Pesachim": "4",
        "Shekalim": "5",
        "Yoma": "6",
        "Sukkah": "7",
        "Beitzah": "8",
        "Rosh Hashanah": "9",
        "Taanit": "10",
        "Megillah": "11",
        "Moed Katan": "12",
        "Chagigah": "13",
        "Yevamot": "14",
        "Ketubot": "15",
        "Nedarim": "16",
        "Nazir": "17",
        "Sotah": "18",
        "Gittin": "19",
        "Kiddushin": "20",
        "Bava Kamma": "21",
        "Bava Metzia": "22",
        "Bava Batra": "23",
        "Sanhedrin": "24",
        "Makkot": "25",
        "Shevuot": "26",
        "Avodah Zarah": "27",
        "Horayot": "28",
        "Zevachim": "29",
        "Menachot": "30",
        "Chullin": "31",
        "Bekhorot": "32",
        "Arakhin": "33",
        "Temurah": "34",
        "Keritot": "35",
        "Meilah": "36",
        "Niddah": "37"
      };
      return tractateMapping[tractate] || "1";
    },
    // Clear error
    clearError() {
      update((state2) => ({ ...state2, error: null }));
    },
    // Get current page reference
    getCurrentPage() {
      const state2 = get2(this);
      return `${state2.page}${state2.amud}`;
    }
  };
}
__name(createTalmudStore, "createTalmudStore");
function mergeAndClone(modified, definitional = defaultOptions) {
  const newOptions = {};
  for (const key2 in definitional) {
    if (key2 in modified) {
      const defType = typeof definitional[key2];
      if (typeof modified[key2] !== defType) {
        console.error(`Option ${key2} must be of type ${defType}; ${typeof modified[key2]} was passed.`);
      }
      if (defType == "object") {
        newOptions[key2] = mergeAndClone(modified[key2], definitional[key2]);
      } else {
        newOptions[key2] = modified[key2];
      }
    } else {
      newOptions[key2] = definitional[key2];
    }
  }
  return newOptions;
}
__name(mergeAndClone, "mergeAndClone");
function getAreaOfText$1(text2, font, fs, width, lh, dummy) {
  const testDiv = document.createElement("div");
  testDiv.style.font = `${fs}px ${font}`;
  testDiv.style.width = `${width}px`;
  testDiv.style.lineHeight = `${lh}px`;
  testDiv.innerHTML = text2;
  dummy.append(testDiv);
  const height = testDiv.clientHeight;
  const actualWidth = testDiv.clientWidth;
  const test_area = height * actualWidth;
  testDiv.remove();
  return test_area;
}
__name(getAreaOfText$1, "getAreaOfText$1");
function parseOptions(options2) {
  return {
    width: parseFloat(options2.contentWidth),
    padding: {
      vertical: parseFloat(options2.padding.vertical),
      horizontal: parseFloat(options2.padding.horizontal)
    },
    halfway: 0.01 * parseFloat(options2.halfway),
    fontFamily: options2.fontFamily,
    fontSize: {
      main: parseFloat(options2.fontSize.main),
      side: parseFloat(options2.fontSize.side)
    },
    lineHeight: {
      main: parseFloat(options2.lineHeight.main),
      side: parseFloat(options2.lineHeight.side)
    },
    mainWidth: 0.01 * parseFloat(options2.mainWidth)
  };
}
__name(parseOptions, "parseOptions");
function calculateLayoutDimensions(parsedOptions) {
  return {
    midWidth: parsedOptions.width * parsedOptions.mainWidth - 2 * parsedOptions.padding.horizontal,
    topWidth: parsedOptions.width * parsedOptions.halfway - parsedOptions.padding.horizontal,
    sideWidth: parsedOptions.width * (1 - parsedOptions.mainWidth) / 2
  };
}
__name(calculateLayoutDimensions, "calculateLayoutDimensions");
function calculateSpacers(mainText, innerText, outerText, options2, dummy) {
  const parsedOptions = parseOptions(options2);
  const { midWidth, topWidth, sideWidth } = calculateLayoutDimensions(parsedOptions);
  const spacerHeights = {
    start: LAYOUT_CONSTANTS.START_SPACER_MULTIPLIER * parsedOptions.lineHeight.side,
    inner: null,
    outer: null,
    end: 0,
    exception: 0
  };
  const paddingAreas = {
    horizontalSide: sideWidth * parsedOptions.padding.vertical
  };
  const topArea = /* @__PURE__ */ __name((lineHeight) => LAYOUT_CONSTANTS.HEADER_LINES * lineHeight * topWidth, "topArea");
  function createTextMeasurement(name, text2, width, style, adjustForHeader = false) {
    const rawArea = getAreaOfText$1(text2, style.font, style.fontSize, width, style.lineHeight, dummy);
    const area = adjustForHeader ? rawArea - topArea(style.lineHeight) : rawArea;
    return {
      name,
      width,
      text: text2,
      lineHeight: style.lineHeight,
      area,
      length: null,
      height: null
    };
  }
  __name(createTextMeasurement, "createTextMeasurement");
  const main = createTextMeasurement(
    "main",
    mainText,
    midWidth,
    {
      font: parsedOptions.fontFamily.main,
      fontSize: parsedOptions.fontSize.main,
      lineHeight: parsedOptions.lineHeight.main
    }
  );
  const outer = createTextMeasurement(
    "outer",
    outerText,
    sideWidth,
    {
      font: parsedOptions.fontFamily.outer,
      fontSize: parsedOptions.fontSize.side,
      lineHeight: parsedOptions.lineHeight.side
    },
    true
    // adjust for header
  );
  const inner = createTextMeasurement(
    "inner",
    innerText,
    sideWidth,
    {
      font: parsedOptions.fontFamily.inner,
      fontSize: parsedOptions.fontSize.side,
      lineHeight: parsedOptions.lineHeight.side
    },
    true
    // adjust for header
  );
  const texts = [main, outer, inner];
  texts.forEach((text2) => {
    text2.height = text2.area / text2.width;
    text2.unadjustedArea = text2.area + topArea(parsedOptions.lineHeight.side);
    text2.unadjustedHeight = text2.unadjustedArea / text2.width;
  });
  const perHeight = Array.from(texts).sort((a, b) => a.height - b.height);
  function validateCommentaryText() {
    if (inner.height <= 0 && outer.height <= 0) {
      console.warn("No commentary text provided. Rendering main text only.");
      spacerHeights.inner = 0;
      spacerHeights.outer = 0;
      spacerHeights.end = main.height;
      return spacerHeights;
    }
    if (inner.height <= spacerHeights.start && outer.height <= spacerHeights.start) {
      console.warn("Insufficient commentary text. Using minimal spacer heights.");
      spacerHeights.inner = inner.height || 0;
      spacerHeights.outer = outer.height || 0;
      spacerHeights.end = 0;
      return spacerHeights;
    }
    return null;
  }
  __name(validateCommentaryText, "validateCommentaryText");
  function handleInsufficientCommentary() {
    const headerArea = parsedOptions.width * LAYOUT_CONSTANTS.HEADER_LINES * parsedOptions.lineHeight.side;
    if (inner.unadjustedHeight <= spacerHeights.start) {
      spacerHeights.inner = inner.unadjustedHeight;
      spacerHeights.outer = (outer.unadjustedArea - headerArea) / sideWidth;
      spacerHeights.exception = 1;
      return spacerHeights;
    }
    if (outer.unadjustedHeight <= spacerHeights.start) {
      spacerHeights.outer = outer.unadjustedHeight;
      spacerHeights.inner = (inner.unadjustedArea - headerArea) / sideWidth;
      spacerHeights.exception = 2;
      return spacerHeights;
    }
    return null;
  }
  __name(handleInsufficientCommentary, "handleInsufficientCommentary");
  const validationResult = validateCommentaryText();
  if (validationResult)
    return validationResult;
  if (inner.unadjustedHeight <= spacerHeights.start || outer.unadjustedHeight <= spacerHeights.start) {
    const edgeCaseResult = handleInsufficientCommentary();
    if (edgeCaseResult)
      return edgeCaseResult;
    return new Error("Unexpected error calculating inner spacer heights");
  }
  function calculateDoubleWrap() {
    spacerHeights.inner = main.area / midWidth;
    spacerHeights.outer = spacerHeights.inner;
    const sideArea = spacerHeights.inner * sideWidth + paddingAreas.horizontalSide;
    const bottomChunk = perHeight[1].area - sideArea;
    const bottomHeight = bottomChunk / topWidth;
    spacerHeights.end = bottomHeight;
    return spacerHeights;
  }
  __name(calculateDoubleWrap, "calculateDoubleWrap");
  function calculateStairs() {
    const blockArea = main.area + perHeight[0].area;
    const blockWidth = midWidth + sideWidth;
    const blockHeight = blockArea / blockWidth;
    const stair = perHeight[1].name === "main" ? perHeight[2] : perHeight[1];
    const stairHeight = stair.area / stair.width;
    if (blockHeight < stairHeight) {
      const paddingAdjustment = /* @__PURE__ */ __name((height1, height2, horizPadding) => horizPadding * (height1 - height2), "paddingAdjustment");
      const smallest = perHeight[0];
      spacerHeights[smallest.name] = smallest.height;
      spacerHeights[stair.name] = (blockArea - paddingAdjustment(blockHeight, spacerHeights[smallest.name], parsedOptions.padding.horizontal)) / blockWidth;
      return spacerHeights;
    }
    return null;
  }
  __name(calculateStairs, "calculateStairs");
  function calculateDoubleExtend() {
    spacerHeights.inner = inner.height;
    spacerHeights.outer = outer.height;
    return spacerHeights;
  }
  __name(calculateDoubleExtend, "calculateDoubleExtend");
  if (perHeight[0].name === "main") {
    return calculateDoubleWrap();
  }
  const stairsResult = calculateStairs();
  if (stairsResult) {
    return stairsResult;
  }
  return calculateDoubleExtend();
}
__name(calculateSpacers, "calculateSpacers");
function getLineInfo(text2, font, fontSize, lineHeight, dummy) {
  dummy.innerHTML = "";
  let testDiv = document.createElement("span");
  testDiv.style.font = fontSize + " " + String(font);
  testDiv.style.lineHeight = String(lineHeight) + "px";
  testDiv.innerHTML = text2;
  testDiv.style.position = "absolute";
  dummy.append(testDiv);
  const rect = testDiv.getBoundingClientRect();
  const height = rect.height;
  const width = rect.width;
  const widthProportional = width / dummy.getBoundingClientRect().width;
  const fontSizeNum = parseFloat(fontSize);
  const lineHeightRatio = lineHeight / fontSizeNum;
  const effectiveLineHeight = fontSizeNum * lineHeightRatio;
  const minSpacerHeight = effectiveLineHeight;
  testDiv.remove();
  return { height, width, widthProportional, fontSizeNum, lineHeightRatio, effectiveLineHeight, minSpacerHeight };
}
__name(getLineInfo, "getLineInfo");
function stripHtml(html) {
  let text2 = html.replace(/<[^>]*>/g, "");
  text2 = text2.replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#039;/g, "'");
  return text2;
}
__name(stripHtml, "stripHtml");
function analyzeTextLines(lines, label, fontOptions, dummy, isCommentary = false) {
  if (!lines || lines.length === 0) {
    return { label, lines: [], stats: {}, lengthCategories: {}, blocks: [] };
  }
  const [font, fontSize, lineHeight] = fontOptions;
  const lineAnalysis = lines.map((line, index13) => {
    const strippedLine = stripHtml(line);
    const trimmed = strippedLine.trim();
    const lineInfo = getLineInfo(line, font, fontSize, lineHeight, dummy);
    let lengthCategory = "";
    let displayCategory = "";
    const len = strippedLine.length;
    const isStart = isCommentary && index13 < 4;
    if (len === 0 || trimmed.length === 0) {
      lengthCategory = "empty";
      displayCategory = "empty";
    } else if (isStart) {
      lengthCategory = "start";
      displayCategory = "start";
    } else if (len <= 20) {
      lengthCategory = "single";
      displayCategory = "single";
    } else if (len <= 40) {
      lengthCategory = "short";
      displayCategory = "short";
    } else if (len <= 60) {
      lengthCategory = "medium";
      displayCategory = "medium";
    } else {
      lengthCategory = "long";
      displayCategory = "long";
    }
    return {
      index: index13,
      content: line,
      strippedContent: strippedLine,
      length: strippedLine.length,
      trimmedLength: trimmed.length,
      isEmpty: trimmed.length === 0,
      startsWithSpace: strippedLine.length > 0 && strippedLine[0] === " ",
      endsWithSpace: strippedLine.length > 0 && strippedLine[strippedLine.length - 1] === " ",
      hasHebrewChars: /[\u0590-\u05FF]/.test(strippedLine),
      hasNumbers: /\d/.test(strippedLine),
      hasSpecialChars: /[<>{}()]/.test(strippedLine),
      lengthCategory,
      displayCategory,
      isRashiStart: /^[א-ת]"[א-ת]/.test(trimmed) || /^[א-ת][א-ת]"[א-ת]/.test(trimmed),
      lineHeight: lineInfo.height,
      lineWidth: lineInfo.width,
      widthProportional: lineInfo.widthProportional
    };
  });
  const lengthCategories = {};
  lineAnalysis.forEach((line) => {
    if (!lengthCategories[line.lengthCategory]) {
      lengthCategories[line.lengthCategory] = {
        count: 0,
        lines: [],
        totalHeight: 0
      };
    }
    lengthCategories[line.lengthCategory].count++;
    lengthCategories[line.lengthCategory].lines.push(line.index);
    lengthCategories[line.lengthCategory].totalHeight += line.lineHeight;
  });
  const nonEmptyLines = lineAnalysis.filter((l) => !l.isEmpty);
  const stats = {
    totalLines: lines.length,
    nonEmptyLines: nonEmptyLines.length,
    averageLength: lines.length > 0 ? lineAnalysis.reduce((sum, l) => sum + l.length, 0) / lines.length : 0,
    maxLength: lineAnalysis.length > 0 ? Math.max(...lineAnalysis.map((l) => l.length)) : 0,
    minLength: nonEmptyLines.length > 0 ? Math.min(...nonEmptyLines.map((l) => l.length)) : 0,
    linesWithSpaces: lineAnalysis.filter((l) => l.startsWithSpace || l.endsWithSpace).length,
    rashiStartLines: lineAnalysis.filter((l) => l.isRashiStart).length,
    totalHeight: lineAnalysis.reduce((sum, l) => sum + l.lineHeight, 0)
  };
  const blocks = groupIntoBlocks(lineAnalysis);
  return {
    label,
    lines: lineAnalysis,
    stats,
    lengthCategories,
    blocks
  };
}
__name(analyzeTextLines, "analyzeTextLines");
function groupIntoBlocks(lines) {
  const blocks = [];
  let currentBlock = null;
  lines.forEach((line, index13) => {
    if (!currentBlock || currentBlock.category !== line.displayCategory) {
      currentBlock = {
        category: line.displayCategory,
        startIndex: index13,
        endIndex: index13,
        lines: [line],
        totalLength: line.length,
        totalHeight: line.lineHeight
      };
      blocks.push(currentBlock);
    } else {
      currentBlock.endIndex = index13;
      currentBlock.lines.push(line);
      currentBlock.totalLength += line.length;
      currentBlock.totalHeight += line.lineHeight;
    }
  });
  return blocks;
}
__name(groupIntoBlocks, "groupIntoBlocks");
function detectLayoutPattern(mainBlocks, rashiBlocks, tosafotBlocks) {
  const pattern2 = {
    type: "unknown",
    confidence: 0,
    details: {}
  };
  const mainHasLongBlocks = mainBlocks.some((b) => b.category === "long" && b.lines.length > 2);
  const mainHasMostlyShort = mainBlocks.filter((b) => b.category === "short" || b.category === "single").length > mainBlocks.length * 0.6;
  rashiBlocks.filter((b) => b.category === "start").length;
  tosafotBlocks.filter((b) => b.category === "start").length;
  const rashiLongBlocks = rashiBlocks.filter((b) => b.category === "long").length;
  const tosafotLongBlocks = tosafotBlocks.filter((b) => b.category === "long").length;
  if (mainHasMostlyShort && (rashiLongBlocks > 2 || tosafotLongBlocks > 2)) {
    pattern2.type = "double-wrap";
    pattern2.confidence = 0.8;
    pattern2.details = {
      reason: "Main text has mostly short lines while commentaries have long blocks"
    };
  } else if (rashiLongBlocks > tosafotLongBlocks * 2 || tosafotLongBlocks > rashiLongBlocks * 2) {
    pattern2.type = "stairs";
    pattern2.confidence = 0.7;
    pattern2.details = {
      dominantCommentary: rashiLongBlocks > tosafotLongBlocks ? "rashi" : "tosafot"
    };
  } else if (mainHasLongBlocks && rashiBlocks.length > 0 && tosafotBlocks.length > 0) {
    pattern2.type = "double-extend";
    pattern2.confidence = 0.6;
    pattern2.details = {
      reason: "Main text has long blocks and both commentaries present"
    };
  }
  return pattern2;
}
__name(detectLayoutPattern, "detectLayoutPattern");
function getAreaOfText(text2, font, fs, width, lh, dummy) {
  let testDiv = document.createElement("div");
  testDiv.style.font = String(fs) + "px " + String(font);
  testDiv.style.width = String(width) + "px";
  testDiv.style.lineHeight = String(lh) + "px";
  testDiv.innerHTML = text2;
  dummy.append(testDiv);
  let test_area = Number(testDiv.clientHeight * testDiv.clientWidth);
  testDiv.remove();
  return test_area;
}
__name(getAreaOfText, "getAreaOfText");
function heightAccumulator(font, fontSize, lineHeight, dummy) {
  return (lines) => {
    return getLineInfo(lines.join("<br>"), font, fontSize, lineHeight, dummy).height;
  };
}
__name(heightAccumulator, "heightAccumulator");
function getBreaks(sizeArray) {
  const widths = sizeArray.map((size) => size.widthProportional);
  const diffs = widths.map((width, index13, widths2) => index13 == 0 ? 0 : Math.abs(width - widths2[index13 - 1]));
  const threshold = 0.12;
  let criticalPoints = diffs.reduce((indices, curr, currIndex) => {
    if (currIndex < 4)
      return indices;
    if (curr > threshold) {
      const prevIndex = indices[indices.length - 1];
      if (prevIndex && currIndex - prevIndex == 1) {
        return indices;
      }
      indices.push(currIndex);
    }
    return indices;
  }, []);
  const averageAround = /* @__PURE__ */ __name((points) => points.map((point, i) => {
    let nextPoint;
    if (!nextPoint) {
      nextPoint = Math.min(point + 3, widths.length - 1);
    }
    let prevPoint;
    if (!prevPoint) {
      prevPoint = Math.max(point - 3, 0);
    }
    const before = widths.slice(prevPoint, point).reduce((acc, curr) => acc + curr) / (point - prevPoint) / widths[point];
    let after;
    if (point + 1 >= nextPoint) {
      after = widths[nextPoint] / widths[point];
    } else {
      after = widths.slice(point + 1, nextPoint).reduce((acc, curr) => acc + curr) / (nextPoint - point - 1) / widths[point];
    }
    return {
      point,
      before,
      after,
      diff: Math.abs(after - before)
    };
  }), "averageAround");
  const aroundDiffs = averageAround(criticalPoints).sort((a, b) => b.diff - a.diff);
  criticalPoints = aroundDiffs.filter(({ diff }) => diff > 0.22).map(({ point }) => point);
  return criticalPoints.sort((a, b) => a - b);
}
__name(getBreaks, "getBreaks");
function onlyOneCommentary(lines, options2, dummy) {
  const fontFamily = options2.fontFamily.inner;
  const fontSize = options2.fontSize.side;
  const lineHeight = parseFloat(options2.lineHeight.side);
  const sizes = lines.map((text2) => getLineInfo(text2, fontFamily, fontSize, lineHeight, dummy));
  const breaks = getBreaks(sizes);
  if (breaks.length == 3) {
    const first = lines.slice(0, breaks[1]);
    const second = lines.slice(breaks[1]);
    return [first, second];
  }
}
__name(onlyOneCommentary, "onlyOneCommentary");
function detectOverlaps(spacerHeights, lineHeights, sizes) {
  console.log("\u{1F50D} OVERLAP DETECTION STARTED");
  console.log("spacerHeights:", spacerHeights);
  console.log("sizes:", sizes);
  const overlaps = [];
  const totalMainHeight = sizes.main.reduce((sum, line) => sum + (line?.height || 0), 0);
  const totalInnerHeight = sizes.rashi.reduce((sum, line) => sum + (line?.height || 0), 0);
  const totalOuterHeight = sizes.tosafot.reduce((sum, line) => sum + (line?.height || 0), 0);
  console.log("\u{1F4CF} Text Heights:", {
    main: totalMainHeight,
    inner: totalInnerHeight,
    outer: totalOuterHeight
  });
  const mainStart = spacerHeights.start;
  const innerStart = spacerHeights.start + spacerHeights.inner;
  const outerStart = spacerHeights.start + spacerHeights.outer;
  const mainEnd = mainStart + totalMainHeight;
  const innerEnd = innerStart + totalInnerHeight;
  const outerEnd = outerStart + totalOuterHeight;
  console.log("\u{1F4CD} Positions:", {
    mainStart,
    mainEnd,
    innerStart,
    innerEnd,
    outerStart,
    outerEnd,
    spacers: {
      inner: spacerHeights.inner,
      outer: spacerHeights.outer
    }
  });
  const overflowTolerance = 5;
  if (spacerHeights.inner > 0 && totalInnerHeight > 0 && totalInnerHeight > spacerHeights.start) {
    const overlapAmount = mainEnd - innerStart;
    if (overlapAmount > overflowTolerance && innerStart < mainEnd) {
      overlaps.push({
        type: "main-inner",
        line: -1,
        // Not line-specific in this mode
        overlap: overlapAmount,
        mainPos: mainStart,
        innerPos: innerStart,
        mainEnd,
        innerEnd
      });
    }
  }
  if (spacerHeights.outer > 0 && totalOuterHeight > 0 && totalOuterHeight > spacerHeights.start) {
    const overlapAmount = mainEnd - outerStart;
    if (overlapAmount > overflowTolerance && outerStart < mainEnd) {
      overlaps.push({
        type: "main-outer",
        line: -1,
        // Not line-specific in this mode
        overlap: overlapAmount,
        mainPos: mainStart,
        outerPos: outerStart,
        mainEnd,
        outerEnd
      });
    }
  }
  if (totalInnerHeight > 0 && spacerHeights.inner > 0) {
    const innerSpacerEnd = innerStart + spacerHeights.inner;
    const overflowAmount = innerEnd - innerSpacerEnd;
    console.log("\u{1F50D} Inner overflow check:", {
      innerEnd,
      innerSpacerEnd,
      overflow: overflowAmount > overflowTolerance,
      amount: overflowAmount
    });
    if (overflowAmount > overflowTolerance && totalInnerHeight > spacerHeights.start) {
      console.log("\u26A0\uFE0F Inner overflow detected:", overflowAmount);
      overlaps.push({
        type: "inner-overflow",
        line: -1,
        overlap: overflowAmount,
        innerPos: innerStart,
        spacerEnd: innerSpacerEnd,
        textEnd: innerEnd,
        innerEnd
      });
    }
  }
  if (totalOuterHeight > 0 && spacerHeights.outer > 0) {
    const outerSpacerEnd = outerStart + spacerHeights.outer;
    const overflowAmount = outerEnd - outerSpacerEnd;
    console.log("\u{1F50D} Outer overflow check:", {
      outerEnd,
      outerSpacerEnd,
      overflow: overflowAmount > overflowTolerance,
      amount: overflowAmount
    });
    if (overflowAmount > overflowTolerance && totalOuterHeight > spacerHeights.start) {
      console.log("\u26A0\uFE0F Outer overflow detected:", overflowAmount);
      overlaps.push({
        type: "outer-overflow",
        line: -1,
        overlap: overflowAmount,
        outerPos: outerStart,
        spacerEnd: outerSpacerEnd,
        textEnd: outerEnd,
        outerEnd
      });
    }
  }
  console.log("\u{1F4CB} Final overlaps found:", overlaps);
  return overlaps;
}
__name(detectOverlaps, "detectOverlaps");
function resolveOverlaps(spacerHeights, overlaps, sizes, options2) {
  if (overlaps.length === 0)
    return spacerHeights;
  const resolved = { ...spacerHeights };
  const safetyMargin = 5;
  const minSpacerInner = sizes.rashi[0]?.minSpacerHeight || options2.lineHeight.side;
  const minSpacerOuter = sizes.tosafot[0]?.minSpacerHeight || options2.lineHeight.side;
  overlaps.sort((a, b) => b.overlap - a.overlap);
  overlaps.forEach(({ type, overlap }) => {
    if (type === "main-inner") {
      const adjustment = Math.max(overlap + safetyMargin, minSpacerInner);
      resolved.inner += adjustment;
    } else if (type === "main-outer") {
      const adjustment = Math.max(overlap + safetyMargin, minSpacerOuter);
      resolved.outer += adjustment;
    } else if (type === "inner-overflow") {
      const adjustment = overlap + safetyMargin;
      resolved.inner += adjustment;
      console.log(`Inner text overflow: extending spacer by ${adjustment}px`);
    } else if (type === "outer-overflow") {
      const adjustment = overlap + safetyMargin;
      resolved.outer += adjustment;
      console.log(`Outer text overflow: extending spacer by ${adjustment}px`);
    }
  });
  return resolved;
}
__name(resolveOverlaps, "resolveOverlaps");
function calculateSpacersBreaks(mainArray, rashiArray, tosafotArray, options2, dummy) {
  console.log("\u{1F4CB} calculateSpacersBreaks input:", {
    mainArray: mainArray?.length || 0,
    rashiArray: rashiArray?.length || 0,
    tosafotArray: tosafotArray?.length || 0,
    mainSample: mainArray?.[0]?.substring(0, 50),
    rashiSample: rashiArray?.[0]?.substring(0, 50),
    tosafotSample: tosafotArray?.[0]?.substring(0, 50)
  });
  const lines = {
    main: (mainArray || []).filter((line) => line && line.trim() !== ""),
    rashi: (rashiArray || []).filter((line) => line && line.trim() !== ""),
    tosafot: (tosafotArray || []).filter((line) => line && line.trim() !== "")
  };
  let analysisLines = { ...lines };
  const hasSingleElements = lines.main.length <= 1 && lines.rashi.length <= 1 && lines.tosafot.length <= 1;
  if (hasSingleElements && options2.useLineAnalysis !== false) {
    console.log("\u{1F4DD} Single element arrays detected, creating pseudo-lines for analysis");
    const createPseudoLines = /* @__PURE__ */ __name((text2) => {
      if (!text2)
        return [""];
      const stripped = stripHtml(text2);
      let segments = stripped.split(/(?<=[.!?])\s+/).filter((s3) => s3.trim().length > 0);
      if (segments.length <= 1) {
        segments = stripped.split(/[():]|\s{3,}/).filter((s3) => s3.trim().length > 0);
      }
      if (segments.length <= 1 && stripped.length > 160) {
        segments = [];
        const words = stripped.split(/\s+/);
        let currentSegment = "";
        for (const word of words) {
          if (currentSegment.length + word.length > 80 && currentSegment.length > 0) {
            segments.push(currentSegment.trim());
            currentSegment = word;
          } else {
            currentSegment += (currentSegment ? " " : "") + word;
          }
        }
        if (currentSegment)
          segments.push(currentSegment.trim());
      }
      return segments.length > 0 ? segments : [stripped];
    }, "createPseudoLines");
    analysisLines = {
      main: lines.main.length > 0 ? createPseudoLines(lines.main[0]) : [""],
      rashi: lines.rashi.length > 0 ? createPseudoLines(lines.rashi[0]) : [""],
      tosafot: lines.tosafot.length > 0 ? createPseudoLines(lines.tosafot[0]) : [""]
    };
    console.log("\u{1F4CA} Pseudo-line analysis:", {
      main: analysisLines.main.length,
      rashi: analysisLines.rashi.length,
      tosafot: analysisLines.tosafot.length,
      mainFirst: analysisLines.main[0]?.substring(0, 50),
      rashiFirst: analysisLines.rashi[0]?.substring(0, 50)
    });
  }
  console.log("\u{1F4CB} Text analysis after filtering:", {
    mainLines: lines.main.length,
    rashiLines: lines.rashi.length,
    tosafotLines: lines.tosafot.length,
    useLineAnalysis: options2.useLineAnalysis,
    useAreaCalculation: options2.useAreaCalculation
  });
  if (lines.rashi.length === 0 && lines.tosafot.length === 0) {
    console.error("No Commentary");
    return {
      start: 0,
      // No commentary means no top spacer needed
      inner: 0,
      outer: 0,
      end: 0,
      exception: 0,
      error: "No Commentary"
    };
  }
  const parsedOptions = {
    padding: {
      vertical: parseFloat(options2.padding.vertical),
      horizontal: parseFloat(options2.padding.horizontal)
    },
    halfway: 0.01 * parseFloat(options2.halfway),
    fontFamily: options2.fontFamily,
    // Object of strings
    fontSize: {
      main: options2.fontSize.main,
      side: options2.fontSize.side
    },
    lineHeight: {
      main: parseFloat(options2.lineHeight.main),
      side: parseFloat(options2.lineHeight.side)
    },
    // Width calculations from calculate-spacers.js
    width: parseFloat(options2.contentWidth),
    mainWidth: 0.01 * parseFloat(options2.mainWidth)
  };
  const midWidth = Number(parsedOptions.width * parsedOptions.mainWidth) - 2 * parsedOptions.padding.horizontal;
  const topWidth = Number(parsedOptions.width * parsedOptions.halfway) - parsedOptions.padding.horizontal;
  const sideWidth = Number(parsedOptions.width * (1 - parsedOptions.mainWidth) / 2);
  const mainOptions = [parsedOptions.fontFamily.main, parsedOptions.fontSize.main, parsedOptions.lineHeight.main];
  const commentaryOptions = [parsedOptions.fontFamily.inner, parsedOptions.fontSize.side, parsedOptions.lineHeight.side];
  let spacerHeights = {
    start: 4.4 * parsedOptions.lineHeight.side,
    inner: null,
    outer: null,
    end: 0,
    exception: 0
  };
  if (lines.main.length > 0 || lines.rashi.length > 0 || lines.tosafot.length > 0) {
    console.log("\u{1F4CF} Using simple line-based spacer calculation");
    const rashiStartLines = Math.min(4, lines.rashi.length);
    const tosafotStartLines = Math.min(4, lines.tosafot.length);
    const startLines = Math.max(rashiStartLines, tosafotStartLines);
    const rashiContentLines = Math.max(0, lines.rashi.length - rashiStartLines);
    const tosafotContentLines = Math.max(0, lines.tosafot.length - tosafotStartLines);
    spacerHeights.start = startLines * parsedOptions.lineHeight.side;
    spacerHeights.inner = rashiContentLines * parsedOptions.lineHeight.side;
    spacerHeights.outer = tosafotContentLines * parsedOptions.lineHeight.side;
    spacerHeights.end = 0;
    console.log("\u{1F4CA} Line counts:", {
      startLines,
      rashiContent: rashiContentLines,
      tosafotContent: tosafotContentLines,
      spacers: spacerHeights
    });
    return spacerHeights;
  }
  if (options2.useLineAnalysis !== false && mainArray && rashiArray && tosafotArray) {
    console.log("\u{1F50D} Using enhanced line analysis for spacer calculation");
    const linesToAnalyze = hasSingleElements ? analysisLines : lines;
    const lineAnalysis = {
      main: analyzeTextLines(linesToAnalyze.main, "Main Text", mainOptions, dummy, false),
      rashi: analyzeTextLines(linesToAnalyze.rashi, "Rashi", commentaryOptions, dummy, true),
      tosafot: analyzeTextLines(linesToAnalyze.tosafot, "Tosafot", commentaryOptions, dummy, true)
    };
    console.log("\u{1F4CA} Line analysis results:", {
      main: {
        blocks: lineAnalysis.main.blocks.length,
        categories: lineAnalysis.main.lengthCategories,
        totalHeight: lineAnalysis.main.stats.totalHeight
      },
      rashi: {
        blocks: lineAnalysis.rashi.blocks.length,
        categories: lineAnalysis.rashi.lengthCategories,
        totalHeight: lineAnalysis.rashi.stats.totalHeight
      },
      tosafot: {
        blocks: lineAnalysis.tosafot.blocks.length,
        categories: lineAnalysis.tosafot.lengthCategories,
        totalHeight: lineAnalysis.tosafot.stats.totalHeight
      }
    });
    const layoutPattern = detectLayoutPattern(
      lineAnalysis.main.blocks,
      lineAnalysis.rashi.blocks,
      lineAnalysis.tosafot.blocks
    );
    console.log("\u{1F3AF} Detected layout pattern:", layoutPattern);
    spacerHeights.lineAnalysis = lineAnalysis;
    spacerHeights.layoutPattern = layoutPattern;
  }
  const sizes = {};
  sizes.main = lines.main.map((text2) => getLineInfo(text2, ...mainOptions, dummy));
  ["rashi", "tosafot"].forEach((text2) => {
    sizes[text2] = lines[text2].map((line) => getLineInfo(line, ...commentaryOptions, dummy));
  });
  const accumulateMain = heightAccumulator(...mainOptions, dummy);
  const accumulateCommentary = heightAccumulator(...commentaryOptions, dummy);
  const breaks = {};
  ["rashi", "tosafot", "main"].forEach((text2) => {
    breaks[text2] = getBreaks(sizes[text2]).filter(
      (lineNum) => !lines[text2][lineNum].includes("hadran")
    );
  });
  const mainHeight = accumulateMain(lines.main);
  sizes.main.length * parsedOptions.lineHeight.main;
  const totalInnerHeight = accumulateCommentary(lines.rashi);
  const totalOuterHeight = accumulateCommentary(lines.tosafot);
  if (options2.forcedSpacerHeights) {
    console.log("\u{1F527} Using forced spacer heights:", options2.forcedSpacerHeights);
    return {
      start: options2.forcedSpacerHeights.start || spacerHeights.start,
      inner: options2.forcedSpacerHeights.inner || 0,
      outer: options2.forcedSpacerHeights.outer || 0,
      end: options2.forcedSpacerHeights.end || 0,
      exception: options2.forcedSpacerHeights.exception || 0
    };
  }
  console.log("\u{1F4CA} Commentary heights:", {
    inner: totalInnerHeight,
    outer: totalOuterHeight,
    startThreshold: spacerHeights.start
  });
  if (totalInnerHeight <= spacerHeights.start && totalOuterHeight <= spacerHeights.start) {
    console.error("Not Enough Commentary to Fill Four Lines");
    return {
      start: spacerHeights.start,
      inner: Math.max(totalInnerHeight, 0),
      outer: Math.max(totalOuterHeight, 0),
      end: 0,
      exception: 0,
      error: "Not Enough Commentary"
    };
  }
  if (totalInnerHeight <= spacerHeights.start || totalOuterHeight <= spacerHeights.start) {
    console.log("\u{1F6A8} One-sided commentary detected");
    if (totalInnerHeight <= spacerHeights.start) {
      spacerHeights.inner = Math.max(totalInnerHeight, 0);
      spacerHeights.outer = mainHeight;
      spacerHeights.exception = 1;
      console.log("Exception 1: Insufficient Rashi content");
      return spacerHeights;
    }
    if (totalOuterHeight <= spacerHeights.start) {
      spacerHeights.outer = Math.max(totalOuterHeight, 0);
      spacerHeights.inner = mainHeight;
      spacerHeights.exception = 2;
      console.log("Exception 2: Insufficient Tosafot content");
      return spacerHeights;
    }
  }
  let afterBreak = {
    inner: 0,
    outer: 0
  };
  if (breaks.rashi.length > 0) {
    const firstBreak = breaks.rashi[0];
    afterBreak.inner = accumulateCommentary(lines.rashi.slice(firstBreak));
  } else {
    afterBreak.inner = accumulateCommentary(lines.rashi);
  }
  if (breaks.tosafot.length > 0) {
    const firstBreak = breaks.tosafot[0];
    afterBreak.outer = accumulateCommentary(lines.tosafot.slice(firstBreak));
  } else {
    afterBreak.outer = accumulateCommentary(lines.tosafot);
  }
  ({
    inner: parsedOptions.lineHeight.side * (sizes.rashi.length - 4),
    outer: parsedOptions.lineHeight.side * (sizes.tosafot.length - 4)
  });
  if (options2.useOldSpacerCalculation) {
    console.log("\u{1F527} Using old break detection method");
    return calculateOldBreakDetection(lines, breaks, sizes, parsedOptions, spacerHeights, dummy);
  }
  if (options2.useProportionalSpacing) {
    console.log("\u{1F527} Using proportional spacing method");
    return calculateProportionalSpacing(lines, totalInnerHeight, totalOuterHeight, mainHeight, spacerHeights);
  }
  if (options2.useAreaCalculation || !breaks.main.length && !breaks.rashi.length && !breaks.tosafot.length) {
    console.log("\u{1F504} Using area-based calculation (similar to calculate-spacers.js)");
    console.log("Debug widths:", { midWidth, topWidth, sideWidth });
    console.log("Debug options:", {
      contentWidth: options2.contentWidth,
      mainWidth: options2.mainWidth,
      halfway: options2.halfway
    });
    const topArea = /* @__PURE__ */ __name((lineHeight) => 4 * lineHeight * topWidth, "topArea");
    const mainData = {
      name: "main",
      width: midWidth,
      text: lines.main.join("<br>"),
      lineHeight: parsedOptions.lineHeight.main,
      area: getAreaOfText(lines.main.join("<br>"), parsedOptions.fontFamily.main, parsedOptions.fontSize.main, midWidth, parsedOptions.lineHeight.main, dummy),
      height: null
    };
    const innerData = {
      name: "inner",
      width: sideWidth,
      text: lines.rashi.join("<br>"),
      lineHeight: parsedOptions.lineHeight.side,
      area: getAreaOfText(lines.rashi.join("<br>"), parsedOptions.fontFamily.inner, parsedOptions.fontSize.side, sideWidth, parsedOptions.lineHeight.side, dummy) - topArea(parsedOptions.lineHeight.side),
      height: null
    };
    const outerData = {
      name: "outer",
      width: sideWidth,
      text: lines.tosafot.join("<br>"),
      lineHeight: parsedOptions.lineHeight.side,
      area: getAreaOfText(lines.tosafot.join("<br>"), parsedOptions.fontFamily.outer || parsedOptions.fontFamily.inner, parsedOptions.fontSize.side, sideWidth, parsedOptions.lineHeight.side, dummy) - topArea(parsedOptions.lineHeight.side),
      height: null
    };
    [mainData, innerData, outerData].forEach((data) => {
      data.height = data.area / data.width;
      data.unadjustedArea = data.area + topArea(parsedOptions.lineHeight.side);
      data.unadjustedHeight = data.unadjustedArea / data.width;
      console.log(`\u{1F4CF} ${data.name} measurements:`, {
        area: data.area,
        width: data.width,
        height: data.height,
        unadjustedHeight: data.unadjustedHeight,
        lineHeight: data.lineHeight
      });
    });
    const sortedByHeight = [mainData, innerData, outerData].sort((a, b) => a.height - b.height);
    console.log("\u{1F4CA} Area-based calculation results:", {
      main: { area: mainData.area, height: mainData.height },
      inner: { area: innerData.area, height: innerData.height },
      outer: { area: outerData.area, height: outerData.height },
      pattern: sortedByHeight[0].name === "main" ? "double-wrap" : sortedByHeight[1].name === "main" ? "stairs" : "double-extend"
    });
    if (sortedByHeight[0].name === "main") {
      spacerHeights.inner = mainData.height;
      spacerHeights.outer = mainData.height;
      const sideArea = spacerHeights.inner * sideWidth;
      const bottomChunk = Math.max(innerData.area - sideArea, outerData.area - sideArea, 0);
      spacerHeights.end = bottomChunk / topWidth;
    } else if (sortedByHeight[1].name === "main") {
      const smallestData = sortedByHeight[0];
      const largestData = sortedByHeight[2];
      spacerHeights[smallestData.name] = smallestData.height;
      const blockArea = mainData.area + smallestData.area;
      const blockWidth = midWidth + sideWidth;
      spacerHeights[largestData.name] = blockArea / blockWidth;
    } else {
      spacerHeights.inner = innerData.height;
      spacerHeights.outer = outerData.height;
    }
    spacerHeights.calculationMethod = "area-based";
  } else {
    console.log("\u{1F504} Using height-based calculation with line breaks");
    const mainTextHeight = mainHeight;
    console.log("\u{1F4CF} Measured heights:", {
      mainText: mainTextHeight,
      totalInner: totalInnerHeight,
      totalOuter: totalOuterHeight,
      startSpacer: spacerHeights.start
    });
    const hasSubstantialInner = totalInnerHeight > spacerHeights.start * 1.5;
    const hasSubstantialOuter = totalOuterHeight > spacerHeights.start * 1.5;
    console.log("\u{1F3AF} Layout pattern analysis:", {
      hasSubstantialInner,
      hasSubstantialOuter,
      innerRatio: totalInnerHeight / spacerHeights.start,
      outerRatio: totalOuterHeight / spacerHeights.start
    });
    if (!hasSubstantialInner && !hasSubstantialOuter) {
      spacerHeights.inner = Math.max(totalInnerHeight, 0);
      spacerHeights.outer = Math.max(totalOuterHeight, 0);
      console.log("\u{1F4D0} Pattern: Minimal commentaries");
    } else if (!hasSubstantialInner) {
      spacerHeights.inner = Math.max(totalInnerHeight, 0);
      spacerHeights.outer = Math.max(mainTextHeight, totalOuterHeight);
      console.log("\u{1F4D0} Pattern: Outer dominant (stairs) - main height:", mainTextHeight);
    } else if (!hasSubstantialOuter) {
      spacerHeights.outer = Math.max(totalOuterHeight, 0);
      spacerHeights.inner = Math.max(mainTextHeight, totalInnerHeight);
      console.log("\u{1F4D0} Pattern: Inner dominant (stairs) - main height:", mainTextHeight);
    } else {
      if (mainTextHeight < Math.min(totalInnerHeight, totalOuterHeight)) {
        spacerHeights.inner = mainTextHeight;
        spacerHeights.outer = mainTextHeight;
        console.log("\u{1F4D0} Pattern: Double-wrap (main wraps around commentaries)");
      } else if (mainTextHeight > Math.max(totalInnerHeight, totalOuterHeight)) {
        spacerHeights.inner = totalInnerHeight;
        spacerHeights.outer = totalOuterHeight;
        console.log("\u{1F4D0} Pattern: Double-extend (main extends past commentaries)");
      } else {
        if (totalInnerHeight < totalOuterHeight) {
          spacerHeights.inner = totalInnerHeight;
          spacerHeights.outer = mainTextHeight;
        } else {
          spacerHeights.inner = mainTextHeight;
          spacerHeights.outer = totalOuterHeight;
        }
        console.log("\u{1F4D0} Pattern: Stairs (main wraps around smaller commentary)");
      }
    }
    spacerHeights.calculationMethod = "height-based";
  }
  console.log("\u{1F4CA} New spacer calculation results:", {
    mainHeight,
    totalInnerHeight,
    totalOuterHeight,
    calculatedSpacers: {
      start: spacerHeights.start,
      inner: spacerHeights.inner,
      outer: spacerHeights.outer
    },
    improvements: {
      oldInnerWouldBe: afterBreak.inner,
      oldOuterWouldBe: afterBreak.outer,
      innerIncrease: spacerHeights.inner - afterBreak.inner,
      outerIncrease: spacerHeights.outer - afterBreak.outer
    }
  });
  if (options2.analyzeLineDistribution && typeof window !== "undefined") {
    console.log("\u{1F50D} Analyzing line distribution for layout optimization...");
    const tempContainer = document.createElement("div");
    tempContainer.style.position = "absolute";
    tempContainer.style.visibility = "hidden";
    tempContainer.style.width = options2.contentWidth || "600px";
    tempContainer.style.fontFamily = parsedOptions.fontFamily.main;
    tempContainer.style.fontSize = parsedOptions.fontSize.main;
    tempContainer.style.lineHeight = parsedOptions.lineHeight.main + "px";
    document.body.appendChild(tempContainer);
    const mainLines = lines.main;
    let shortLines = 0, mediumLines = 0, longLines = 0;
    mainLines.forEach((line) => {
      tempContainer.innerHTML = line.trim();
      const lineWidth = tempContainer.getBoundingClientRect().width;
      const containerWidth = parseFloat(options2.contentWidth || "600px");
      const mainWidthPercent = parseFloat(options2.mainWidth || "50%") / 100;
      const mainSectionWidth = containerWidth * mainWidthPercent;
      const commentaryWidth = containerWidth * (1 - mainWidthPercent) / 2;
      if (lineWidth <= mainSectionWidth * 1.1) {
        shortLines++;
      } else if (lineWidth <= (mainSectionWidth + commentaryWidth) * 1.1) {
        mediumLines++;
      } else {
        longLines++;
      }
    });
    document.body.removeChild(tempContainer);
    const lineDistribution = { shortLines, mediumLines, longLines, total: mainLines.length };
    console.log("\u{1F4CF} Main text line distribution:", lineDistribution);
    spacerHeights.lineDistribution = lineDistribution;
    if (shortLines / mainLines.length > 0.8) {
      spacerHeights.layoutIssue = "font_too_large";
      console.log("\u26A0\uFE0F Layout issue: Font may be too large (too many short lines)");
    } else if (longLines / mainLines.length > 0.6) {
      spacerHeights.layoutIssue = "font_too_small";
      console.log("\u26A0\uFE0F Layout issue: Font may be too small (too many long lines)");
    }
  }
  sizes.main[0]?.minSpacerHeight || parsedOptions.lineHeight.main;
  const minSpacerSide = sizes.rashi[0]?.minSpacerHeight || parsedOptions.lineHeight.side;
  spacerHeights.inner = Math.max(spacerHeights.inner, minSpacerSide);
  spacerHeights.outer = Math.max(spacerHeights.outer, minSpacerSide);
  console.log("\u{1F3AF} Checking for overlap detection...", {
    detectOverlaps: options2.detectOverlaps,
    autoResolveOverlaps: options2.autoResolveOverlaps
  });
  if (options2.detectOverlaps) {
    console.log("\u2705 Starting overlap detection...");
    const overlaps = detectOverlaps(spacerHeights, null, sizes);
    if (overlaps.length > 0) {
      console.warn("Text overlaps detected:", overlaps);
      if (options2.autoResolveOverlaps !== false) {
        spacerHeights = resolveOverlaps(spacerHeights, overlaps, sizes, parsedOptions);
        console.log("Overlaps resolved, new spacer heights:", spacerHeights);
      }
      spacerHeights.overlaps = overlaps;
    } else {
      console.log("\u2705 No overlaps detected");
    }
  } else {
    console.log("\u274C Overlap detection disabled");
  }
  return spacerHeights;
}
__name(calculateSpacersBreaks, "calculateSpacersBreaks");
function calculateOldBreakDetection(lines, breaks, sizes, parsedOptions, spacerHeights, dummy) {
  console.log("\u{1F504} OLD: Using original break detection algorithm...");
  heightAccumulator(parsedOptions.fontFamily.main, parsedOptions.fontSize.main, parsedOptions.lineHeight.main, dummy);
  const accumulateCommentary = heightAccumulator(parsedOptions.fontFamily.inner, parsedOptions.fontSize.side, parsedOptions.lineHeight.side, dummy);
  const afterBreak = { inner: null, outer: null };
  ["rashi", "tosafot"].forEach((text2) => {
    const textBreaks = breaks[text2];
    const textLines = lines[text2];
    if (textBreaks.length > 0) {
      const afterBreakLines = textLines.slice(textBreaks[0] + 1);
      afterBreak[text2 === "rashi" ? "inner" : "outer"] = accumulateCommentary(afterBreakLines);
    } else {
      afterBreak[text2 === "rashi" ? "inner" : "outer"] = 0;
    }
  });
  spacerHeights.inner = afterBreak.inner;
  spacerHeights.outer = afterBreak.outer;
  console.log("\u{1F4CA} Old break detection results:", afterBreak);
  return spacerHeights;
}
__name(calculateOldBreakDetection, "calculateOldBreakDetection");
function calculateProportionalSpacing(lines, totalInnerHeight, totalOuterHeight, mainHeight, spacerHeights) {
  console.log("\u{1F504} PROPORTIONAL: Using proportional spacing algorithm...");
  const totalCommentaryHeight = totalInnerHeight + totalOuterHeight;
  const availableHeight = Math.max(mainHeight - spacerHeights.start, 0);
  if (totalCommentaryHeight > 0 && availableHeight > 0) {
    const innerRatio = totalInnerHeight / totalCommentaryHeight;
    const outerRatio = totalOuterHeight / totalCommentaryHeight;
    spacerHeights.inner = Math.max(innerRatio * availableHeight, 0);
    spacerHeights.outer = Math.max(outerRatio * availableHeight, 0);
  } else {
    spacerHeights.inner = Math.max(totalInnerHeight, 0);
    spacerHeights.outer = Math.max(totalOuterHeight, 0);
  }
  console.log("\u{1F4CA} Proportional spacing results:", {
    totalCommentaryHeight,
    availableHeight,
    innerRatio: totalInnerHeight / totalCommentaryHeight,
    outerRatio: totalOuterHeight / totalCommentaryHeight,
    inner: spacerHeights.inner,
    outer: spacerHeights.outer
  });
  return spacerHeights;
}
__name(calculateProportionalSpacing, "calculateProportionalSpacing");
function debounce(func, wait) {
  let timeout;
  return /* @__PURE__ */ __name(function executedFunction(...args) {
    const later = /* @__PURE__ */ __name(() => {
      clearTimeout(timeout);
      func(...args);
    }, "later");
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  }, "executedFunction");
}
__name(debounce, "debounce");
function createElement(tag, parent) {
  const newEl = document.createElement(tag);
  if (parent)
    parent.append(newEl);
  return newEl;
}
__name(createElement, "createElement");
function createDiv(parent) {
  return createElement("div", parent);
}
__name(createDiv, "createDiv");
function createSpan(parent) {
  return createElement("span", parent);
}
__name(createSpan, "createSpan");
function createDafRenderer(el, options2 = defaultOptions) {
  const root2 = typeof el === "string" ? document.querySelector(el) : el;
  if (!(root2 && root2 instanceof Element && root2.tagName.toUpperCase() === "DIV")) {
    throw new Error("Argument must be a div element or its selector");
  }
  const outerContainer = createDiv(root2);
  const innerContainer = createDiv(root2);
  const mainContainer = createDiv(root2);
  const dummy = createDiv(root2);
  dummy.id = "dummy";
  const containers = {
    el: root2,
    dummy,
    outer: {
      el: outerContainer,
      spacers: {
        start: createDiv(outerContainer),
        mid: createDiv(outerContainer),
        end: createDiv(outerContainer)
      },
      text: createDiv(outerContainer)
    },
    inner: {
      el: innerContainer,
      spacers: {
        start: createDiv(innerContainer),
        mid: createDiv(innerContainer),
        end: createDiv(innerContainer)
      },
      text: createDiv(innerContainer)
    },
    main: {
      el: mainContainer,
      spacers: {
        start: createDiv(mainContainer),
        inner: createDiv(mainContainer),
        outer: createDiv(mainContainer)
      },
      text: createDiv(mainContainer)
    }
  };
  const textSpans = {
    main: createSpan(containers.main.text),
    inner: createSpan(containers.inner.text),
    outer: createSpan(containers.outer.text)
  };
  const clonedOptions = mergeAndClone(options2, defaultOptions);
  styleManager.applyClasses(containers);
  styleManager.updateOptionsVars(clonedOptions);
  let resizeEvent;
  const rendererObject = {
    containers,
    spacerHeights: {
      start: 0,
      inner: 0,
      outer: 0,
      end: 0
    },
    amud: LAYOUT_CONSTANTS.DEFAULT_AMUD,
    render(main, inner, outer, amud = "a", linebreak, renderCallback, resizeCallback) {
      try {
        let processCommentaryHTML = /* @__PURE__ */ __name(function(html) {
          const processed = html.replace(/<div\s+style="[^"]*(?:width:\s*100%|margin-bottom)[^"]*"[^>]*>/gi, "<span>").replace(/<div\s+class="[^"]*"[^>]*>/gi, "<span>").replace(/<div[^>]*>/gi, "<span>").replace(/<\/div>/gi, "</span> ");
          return processed;
        }, "processCommentaryHTML");
        if (resizeEvent) {
          window.removeEventListener("resize", resizeEvent);
        }
        if (this.amud != amud) {
          this.amud = amud;
          styleManager.updateIsAmudB(amud == "b");
        }
        if (!linebreak) {
          this.spacerHeights = calculateSpacers(main, inner, outer, clonedOptions, containers.dummy);
          if (this.spacerHeights instanceof Error) {
            throw this.spacerHeights;
          }
          Object.assign(rendererObject.spacerHeights, this.spacerHeights);
          const resizeHandler = /* @__PURE__ */ __name(() => {
            this.spacerHeights = calculateSpacers(main, inner, outer, clonedOptions, containers.dummy);
            if (!(this.spacerHeights instanceof Error)) {
              Object.assign(rendererObject.spacerHeights, this.spacerHeights);
              styleManager.updateSpacersVars(this.spacerHeights);
            }
            if (resizeCallback)
              resizeCallback();
          }, "resizeHandler");
          resizeEvent = debounce(resizeHandler, RESIZE_DEBOUNCE_DELAY);
          window.addEventListener("resize", resizeEvent);
        } else {
          let [mainSplit, innerSplit, outerSplit] = [main, inner, outer].map((text2) => {
            containers.dummy.innerHTML = text2;
            const divRanges = Array.from(containers.dummy.querySelectorAll("div")).map((div) => {
              const range = document.createRange();
              range.selectNode(div);
              return range;
            });
            const brs = containers.dummy.querySelectorAll(linebreak);
            const splitFragments = [];
            brs.forEach((node, index13) => {
              const range = document.createRange();
              range.setEndBefore(node);
              if (index13 == 0) {
                range.setStart(containers.dummy, 0);
              } else {
                const prev = brs[index13 - 1];
                range.setStartAfter(prev);
              }
              divRanges.forEach((divRange, i) => {
                const inBetween = range.compareBoundaryPoints(Range.START_TO_START, divRange) < 0 && range.compareBoundaryPoints(Range.END_TO_END, divRange) > 0;
                if (inBetween) {
                  splitFragments.push(divRange.extractContents());
                  divRanges.splice(i, 1);
                }
              });
              splitFragments.push(range.extractContents());
            });
            return splitFragments.map((fragment) => {
              const el2 = document.createElement("div");
              el2.append(fragment);
              return el2.innerHTML;
            });
          });
          containers.dummy.innerHTML = "";
          const hasInner = innerSplit.length != 0;
          const hasOuter = outerSplit.length != 0;
          if (hasInner != hasOuter) {
            const withText = hasInner ? innerSplit : outerSplit;
            const fixed = onlyOneCommentary(withText, clonedOptions, dummy);
            if (fixed) {
              if (amud == "a") {
                innerSplit = fixed[0];
                outerSplit = fixed[1];
              } else {
                innerSplit = fixed[1];
                outerSplit = fixed[0];
              }
              inner = innerSplit.join("<br>");
              outer = outerSplit.join("<br>");
            }
          }
          this.spacerHeights = calculateSpacersBreaks(mainSplit, innerSplit, outerSplit, clonedOptions, containers.dummy);
          if (this.spacerHeights instanceof Error) {
            throw this.spacerHeights;
          }
          Object.assign(rendererObject.spacerHeights, this.spacerHeights);
          const resizeHandler = /* @__PURE__ */ __name(() => {
            this.spacerHeights = calculateSpacersBreaks(mainSplit, innerSplit, outerSplit, clonedOptions, containers.dummy);
            if (!(this.spacerHeights instanceof Error)) {
              Object.assign(rendererObject.spacerHeights, this.spacerHeights);
              styleManager.updateSpacersVars(this.spacerHeights);
            }
            if (resizeCallback)
              resizeCallback();
          }, "resizeHandler");
          resizeEvent = debounce(resizeHandler, RESIZE_DEBOUNCE_DELAY);
          window.addEventListener("resize", resizeEvent);
        }
        styleManager.updateSpacersVars(this.spacerHeights);
        styleManager.manageExceptions(this.spacerHeights);
        Object.assign(rendererObject.spacerHeights, this.spacerHeights);
        if (linebreak) {
          containers.el.classList.add("linebreak-mode");
          console.log("\u{1F3A8} Added linebreak-mode class, final HTML with <br>:", {
            mainHasBr: main.includes("<br>"),
            innerHasBr: inner.includes("<br>"),
            outerHasBr: outer.includes("<br>")
          });
        } else {
          containers.el.classList.remove("linebreak-mode");
        }
        if (!linebreak) {
          main = main.replace(/<br\s*\/?>/gi, " ");
          inner = inner.replace(/<br\s*\/?>/gi, " ");
          outer = outer.replace(/<br\s*\/?>/gi, " ");
        }
        textSpans.main.innerHTML = main;
        textSpans.inner.innerHTML = processCommentaryHTML(inner);
        textSpans.outer.innerHTML = processCommentaryHTML(outer);
        const containerHeight = Math.max(...["main", "inner", "outer"].map((t2) => containers[t2].el.offsetHeight));
        containers.el.style.height = `${containerHeight}px`;
        this.checkExcessiveSpacing();
        if (renderCallback)
          renderCallback();
      } catch (error22) {
        console.error("Render error:", error22);
        throw error22;
      }
    },
    checkExcessiveSpacing() {
      const mainTextHeight = textSpans.main.offsetHeight;
      const innerTextHeight = textSpans.inner.offsetHeight;
      const outerTextHeight = textSpans.outer.offsetHeight;
      const mainContainerHeight = containers.main.el.offsetHeight;
      const innerContainerHeight = containers.inner.el.offsetHeight;
      const outerContainerHeight = containers.outer.el.offsetHeight;
      const mainSpacingRatio = mainContainerHeight > 0 ? mainTextHeight / mainContainerHeight : 0;
      const innerSpacingRatio = innerContainerHeight > 0 ? innerTextHeight / innerContainerHeight : 0;
      const outerSpacingRatio = outerContainerHeight > 0 ? outerTextHeight / outerContainerHeight : 0;
      const excessiveThreshold = LAYOUT_CONSTANTS.EXCESSIVE_SPACING_THRESHOLD;
      const spacingIssues = [];
      if (mainSpacingRatio > 0 && mainSpacingRatio < excessiveThreshold) {
        spacingIssues.push({
          section: "main",
          textHeight: mainTextHeight,
          containerHeight: mainContainerHeight,
          ratio: mainSpacingRatio,
          excessSpace: mainContainerHeight - mainTextHeight
        });
      }
      if (innerSpacingRatio > 0 && innerSpacingRatio < excessiveThreshold) {
        spacingIssues.push({
          section: "inner",
          textHeight: innerTextHeight,
          containerHeight: innerContainerHeight,
          ratio: innerSpacingRatio,
          excessSpace: innerContainerHeight - innerTextHeight
        });
      }
      if (outerSpacingRatio > 0 && outerSpacingRatio < excessiveThreshold) {
        spacingIssues.push({
          section: "outer",
          textHeight: outerTextHeight,
          containerHeight: outerContainerHeight,
          ratio: outerSpacingRatio,
          excessSpace: outerContainerHeight - outerTextHeight
        });
      }
      if (spacingIssues.length > 0) {
        this.spacingIssues = spacingIssues;
      } else {
        this.spacingIssues = [];
      }
    },
    // Cleanup method to remove event listeners and clear DOM
    destroy() {
      if (resizeEvent) {
        window.removeEventListener("resize", resizeEvent);
        resizeEvent = null;
      }
      textSpans.main.innerHTML = "";
      textSpans.inner.innerHTML = "";
      textSpans.outer.innerHTML = "";
      this.spacerHeights = {
        start: 0,
        inner: 0,
        outer: 0,
        end: 0
      };
      styleManager.updateSpacersVars(this.spacerHeights);
      if (containers.el) {
        containers.el.innerHTML = "";
        containers.el.style.height = "";
      }
    }
  };
  return rendererObject;
}
__name(createDafRenderer, "createDafRenderer");
function createRendererStore() {
  const { subscribe, set: set2, update } = writable({
    renderer: null,
    container: null,
    isInitialized: false
  });
  return {
    subscribe,
    // Initialize the renderer
    initialize(container) {
      const state2 = get2(this);
      if (state2.isInitialized && state2.renderer && state2.container === container) {
        console.log("Renderer already initialized");
        return state2.renderer;
      }
      try {
        console.log("Initializing daf-renderer");
        const renderer = createDafRenderer(container, defaultOptions);
        const rootDiv = container.querySelector(".dafRoot");
        if (rootDiv) {
          rootDiv.style.setProperty("--contentWidth", defaultOptions.contentWidth);
          rootDiv.style.setProperty("--fontSize-side", defaultOptions.fontSize.side);
          rootDiv.style.setProperty("--lineHeight-main", defaultOptions.lineHeight.main);
          rootDiv.style.setProperty("--mainWidth", defaultOptions.mainWidth);
          rootDiv.style.setProperty("--padding-vertical", defaultOptions.padding.vertical);
        }
        set2({
          renderer,
          container,
          isInitialized: true
        });
        return renderer;
      } catch (error22) {
        console.error("Failed to initialize renderer:", error22);
        throw error22;
      }
    },
    // Render content
    render(mainText, rashiText, tosafotText, pageLabel, lineBreakMode = false) {
      const state2 = get2(this);
      if (!state2.renderer || !state2.isInitialized) {
        console.error("Renderer not initialized");
        return false;
      }
      try {
        const amud = pageLabel.slice(-1) === "b" ? "b" : "a";
        state2.renderer.render(
          mainText,
          rashiText,
          tosafotText,
          amud,
          lineBreakMode ? "<br>" : void 0,
          // Pass '<br>' for line break mode, undefined for traditional
          () => {
          },
          // rendered callback
          () => {
          }
          // resized callback
        );
        const checkText = /* @__PURE__ */ __name(() => {
          const mainSpan = state2.container?.querySelector(".main .text span");
          const mainDiv = state2.container?.querySelector(".main");
          if (mainSpan) {
            const spanStyles = window.getComputedStyle(mainSpan);
            const divStyles = window.getComputedStyle(mainDiv);
            if (spanStyles.fontSize === "0px" || divStyles.width === "0px") {
              console.error("LAYOUT BROKEN DETECTED!", {
                fontSize: spanStyles.fontSize,
                divWidth: divStyles.width,
                timestamp: (/* @__PURE__ */ new Date()).toISOString()
              });
              fixFontSize();
            }
          }
        }, "checkText");
        const fixFontSize = /* @__PURE__ */ __name(() => {
          const rootDiv = state2.container?.querySelector(".dafRoot");
          if (rootDiv) {
            const setVarForce = /* @__PURE__ */ __name((name, value) => {
              rootDiv.style.setProperty(name, value, "important");
            }, "setVarForce");
            setVarForce("--fontSize-main", defaultOptions.fontSize.main);
            setVarForce("--fontSize-side", defaultOptions.fontSize.side);
            setVarForce("--lineHeight-main", defaultOptions.lineHeight.main);
            setVarForce("--lineHeight-side", defaultOptions.lineHeight.side);
            setVarForce("--contentWidth", defaultOptions.contentWidth);
            setVarForce("--mainWidth", defaultOptions.mainWidth);
            setVarForce("--halfway", defaultOptions.halfway);
            setVarForce("--padding-horizontal", defaultOptions.padding.horizontal);
            setVarForce("--padding-vertical", defaultOptions.padding.vertical);
            setVarForce("--direction", defaultOptions.direction);
            setVarForce("--fontFamily-main", defaultOptions.fontFamily.main);
            setVarForce("--fontFamily-inner", defaultOptions.fontFamily.inner);
            setVarForce("--fontFamily-outer", defaultOptions.fontFamily.outer);
          }
        }, "fixFontSize");
        setTimeout(() => {
          checkText();
          fixFontSize();
        }, 10);
        setTimeout(() => {
          checkText();
          fixFontSize();
        }, 100);
        setTimeout(() => {
          checkText();
          fixFontSize();
        }, 300);
        setTimeout(() => {
          checkText();
          fixFontSize();
        }, 500);
        setTimeout(() => {
          checkText();
          fixFontSize();
        }, 1e3);
        const monitorInterval = setInterval(() => {
          checkText();
        }, 2e3);
        setTimeout(() => clearInterval(monitorInterval), 3e4);
        setTimeout(() => {
          const rootDiv = state2.container?.querySelector(".dafRoot");
          if (rootDiv) {
            const spacerHeights = state2.renderer.spacerHeights;
            if (spacerHeights) {
              rootDiv.style.setProperty("--spacerHeights-start", spacerHeights.start + "px");
              rootDiv.style.setProperty("--spacerHeights-inner", spacerHeights.inner + "px");
              rootDiv.style.setProperty("--spacerHeights-outer", spacerHeights.outer + "px");
              rootDiv.style.setProperty("--spacerHeights-end", spacerHeights.end + "px");
            }
            rootDiv.style.setProperty("--contentWidth", defaultOptions.contentWidth);
            rootDiv.style.setProperty("--fontSize-side", defaultOptions.fontSize.side);
            rootDiv.style.setProperty("--lineHeight-main", defaultOptions.lineHeight.main);
            rootDiv.style.setProperty("--mainWidth", defaultOptions.mainWidth);
            rootDiv.style.setProperty("--padding-vertical", defaultOptions.padding.vertical);
          }
        }, 50);
        return true;
      } catch (error22) {
        console.error("Render failed:", error22);
        return false;
      }
    },
    // Clear the renderer
    clear() {
      update((state2) => {
        if (state2.renderer && typeof state2.renderer.destroy === "function") {
          state2.renderer.destroy();
        }
        if (state2.container) {
          state2.container.innerHTML = "";
        }
        return {
          renderer: null,
          container: null,
          isInitialized: false
        };
      });
    },
    // Get renderer instance
    getRenderer() {
      const state2 = get2(this);
      return state2.renderer;
    }
  };
}
__name(createRendererStore, "createRendererStore");
function TranslationPopup($$payload, $$props) {
  push();
  {
    $$payload.out.push("<!--[!-->");
  }
  $$payload.out.push(`<!--]-->`);
  pop();
}
__name(TranslationPopup, "TranslationPopup");
function _page($$payload, $$props) {
  push();
  var $$store_subs;
  let { data } = $$props;
  let selectedTractate = data.tractate;
  let selectedPage = data.page;
  let selectedAmud = data.amud;
  const tractateOptions = [
    { value: "Berakhot", label: "\u05D1\u05E8\u05DB\u05D5\u05EA", id: 1 },
    { value: "Shabbat", label: "\u05E9\u05D1\u05EA", id: 2 },
    { value: "Eruvin", label: "\u05E2\u05D9\u05E8\u05D5\u05D1\u05D9\u05DF", id: 3 },
    { value: "Pesachim", label: "\u05E4\u05E1\u05D7\u05D9\u05DD", id: 4 },
    { value: "Shekalim", label: "\u05E9\u05E7\u05DC\u05D9\u05DD", id: 5 },
    { value: "Yoma", label: "\u05D9\u05D5\u05DE\u05D0", id: 6 },
    { value: "Sukkah", label: "\u05E1\u05D5\u05DB\u05D4", id: 7 },
    { value: "Beitzah", label: "\u05D1\u05D9\u05E6\u05D4", id: 8 },
    { value: "Rosh Hashanah", label: "\u05E8\u05D0\u05E9 \u05D4\u05E9\u05E0\u05D4", id: 9 },
    { value: "Taanit", label: "\u05EA\u05E2\u05E0\u05D9\u05EA", id: 10 },
    { value: "Megillah", label: "\u05DE\u05D2\u05D9\u05DC\u05D4", id: 11 },
    { value: "Moed Katan", label: "\u05DE\u05D5\u05E2\u05D3 \u05E7\u05D8\u05DF", id: 12 },
    { value: "Chagigah", label: "\u05D7\u05D2\u05D9\u05D2\u05D4", id: 13 },
    { value: "Yevamot", label: "\u05D9\u05D1\u05DE\u05D5\u05EA", id: 14 },
    { value: "Ketubot", label: "\u05DB\u05EA\u05D5\u05D1\u05D5\u05EA", id: 15 },
    { value: "Nedarim", label: "\u05E0\u05D3\u05E8\u05D9\u05DD", id: 16 },
    { value: "Nazir", label: "\u05E0\u05D6\u05D9\u05E8", id: 17 },
    { value: "Sotah", label: "\u05E1\u05D5\u05D8\u05D4", id: 18 },
    { value: "Gittin", label: "\u05D2\u05D9\u05D8\u05D9\u05DF", id: 19 },
    { value: "Kiddushin", label: "\u05E7\u05D9\u05D3\u05D5\u05E9\u05D9\u05DF", id: 20 },
    { value: "Bava Kamma", label: "\u05D1\u05D1\u05D0 \u05E7\u05DE\u05D0", id: 21 },
    { value: "Bava Metzia", label: "\u05D1\u05D1\u05D0 \u05DE\u05E6\u05D9\u05E2\u05D0", id: 22 },
    { value: "Bava Batra", label: "\u05D1\u05D1\u05D0 \u05D1\u05EA\u05E8\u05D0", id: 23 },
    { value: "Sanhedrin", label: "\u05E1\u05E0\u05D4\u05D3\u05E8\u05D9\u05DF", id: 24 },
    { value: "Makkot", label: "\u05DE\u05DB\u05D5\u05EA", id: 25 },
    { value: "Shevuot", label: "\u05E9\u05D1\u05D5\u05E2\u05D5\u05EA", id: 26 },
    { value: "Avodah Zarah", label: "\u05E2\u05D1\u05D5\u05D3\u05D4 \u05D6\u05E8\u05D4", id: 27 },
    { value: "Horayot", label: "\u05D4\u05D5\u05E8\u05D9\u05D5\u05EA", id: 28 },
    { value: "Zevachim", label: "\u05D6\u05D1\u05D7\u05D9\u05DD", id: 29 },
    { value: "Menachot", label: "\u05DE\u05E0\u05D7\u05D5\u05EA", id: 30 },
    { value: "Chullin", label: "\u05D7\u05D5\u05DC\u05D9\u05DF", id: 31 },
    { value: "Bekhorot", label: "\u05D1\u05DB\u05D5\u05E8\u05D5\u05EA", id: 32 },
    { value: "Arakhin", label: "\u05E2\u05E8\u05DB\u05D9\u05DF", id: 33 },
    { value: "Temurah", label: "\u05EA\u05DE\u05D5\u05E8\u05D4", id: 34 },
    { value: "Keritot", label: "\u05DB\u05E8\u05D9\u05EA\u05D5\u05EA", id: 35 },
    { value: "Meilah", label: "\u05DE\u05E2\u05D9\u05DC\u05D4", id: 36 },
    { value: "Niddah", label: "\u05E0\u05D9\u05D3\u05D4", id: 37 }
  ];
  function getTransformStyle() {
    return "";
  }
  __name(getTransformStyle, "getTransformStyle");
  function getHebrewPageNumber(num) {
    const hebrewNumbers = {
      1: "\u05D0",
      2: "\u05D1",
      3: "\u05D2",
      4: "\u05D3",
      5: "\u05D4",
      6: "\u05D5",
      7: "\u05D6",
      8: "\u05D7",
      9: "\u05D8",
      10: "\u05D9",
      11: "\u05D9\u05D0",
      12: "\u05D9\u05D1",
      13: "\u05D9\u05D2",
      14: "\u05D9\u05D3",
      15: "\u05D8\u05D5",
      16: "\u05D8\u05D6",
      17: "\u05D9\u05D6",
      18: "\u05D9\u05D7",
      19: "\u05D9\u05D8",
      20: "\u05DB",
      21: "\u05DB\u05D0",
      22: "\u05DB\u05D1",
      23: "\u05DB\u05D2",
      24: "\u05DB\u05D3",
      25: "\u05DB\u05D4",
      26: "\u05DB\u05D5",
      27: "\u05DB\u05D6",
      28: "\u05DB\u05D7",
      29: "\u05DB\u05D8",
      30: "\u05DC",
      31: "\u05DC\u05D0",
      32: "\u05DC\u05D1",
      33: "\u05DC\u05D2",
      34: "\u05DC\u05D3",
      35: "\u05DC\u05D4",
      36: "\u05DC\u05D5",
      37: "\u05DC\u05D6",
      38: "\u05DC\u05D7",
      39: "\u05DC\u05D8",
      40: "\u05DE",
      41: "\u05DE\u05D0",
      42: "\u05DE\u05D1",
      43: "\u05DE\u05D2",
      44: "\u05DE\u05D3",
      45: "\u05DE\u05D4",
      46: "\u05DE\u05D5",
      47: "\u05DE\u05D6",
      48: "\u05DE\u05D7",
      49: "\u05DE\u05D8",
      50: "\u05E0",
      51: "\u05E0\u05D0",
      52: "\u05E0\u05D1",
      53: "\u05E0\u05D2",
      54: "\u05E0\u05D3",
      55: "\u05E0\u05D4",
      56: "\u05E0\u05D5",
      57: "\u05E0\u05D6",
      58: "\u05E0\u05D7",
      59: "\u05E0\u05D8",
      60: "\u05E1",
      61: "\u05E1\u05D0",
      62: "\u05E1\u05D1",
      63: "\u05E1\u05D2",
      64: "\u05E1\u05D3",
      65: "\u05E1\u05D4",
      66: "\u05E1\u05D5",
      67: "\u05E1\u05D6",
      68: "\u05E1\u05D7",
      69: "\u05E1\u05D8",
      70: "\u05E2",
      71: "\u05E2\u05D0",
      72: "\u05E2\u05D1",
      73: "\u05E2\u05D2",
      74: "\u05E2\u05D3",
      75: "\u05E2\u05D4",
      76: "\u05E2\u05D5"
    };
    return hebrewNumbers[num] || num.toString();
  }
  __name(getHebrewPageNumber, "getHebrewPageNumber");
  const each_array = ensure_array_like(tractateOptions);
  const each_array_1 = ensure_array_like(Array.from({ length: 76 }, (_, i) => i + 2));
  $$payload.out.push(`<main class="min-h-screen bg-gray-100 p-8"><div class="max-w-7xl mx-auto space-y-8"><div class="bg-white rounded-lg shadow-md p-8"><h1 class="text-4xl font-bold text-gray-800 mb-4">Talmud Study Application</h1> <p class="text-gray-600 mb-6">Interactive Talmud study with AI-powered translations and analysis</p></div> `);
  {
    $$payload.out.push("<!--[!-->");
    {
      $$payload.out.push("<!--[!-->");
      {
        $$payload.out.push("<!--[!-->");
      }
      $$payload.out.push(`<!--]-->`);
    }
    $$payload.out.push(`<!--]-->`);
  }
  $$payload.out.push(`<!--]--> <div class="bg-white rounded-lg shadow-md p-8"><div class="flex items-center justify-between mb-6"><h2 class="text-2xl font-bold text-gray-800">${escape_html(store_get($$store_subs ??= {}, "$pageInfo", pageInfo).tractate)} ${escape_html(store_get($$store_subs ??= {}, "$pageInfo", pageInfo).fullPage)}</h2> <div class="flex items-center gap-4 flex-wrap"><div class="flex items-center gap-2"><label for="tractate-select" class="text-sm font-medium text-gray-700">\u05DE\u05E1\u05DB\u05EA:</label> <select id="tractate-select" class="border border-gray-300 rounded px-3 py-2 text-sm bg-white"${attr("disabled", store_get($$store_subs ??= {}, "$isLoading", isLoading), true)}>`);
  $$payload.select_value = selectedTractate;
  $$payload.out.push(`<!--[-->`);
  for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
    let option = each_array[$$index];
    $$payload.out.push(`<option${attr("value", option.value)}${maybe_selected($$payload, option.value)}>${escape_html(option.label)}</option>`);
  }
  $$payload.out.push(`<!--]-->`);
  $$payload.select_value = void 0;
  $$payload.out.push(`</select></div> <div class="flex items-center gap-2"><label for="page-select" class="text-sm font-medium text-gray-700">\u05D3\u05E3:</label> <select id="page-select" class="border border-gray-300 rounded px-3 py-2 text-sm bg-white w-20"${attr("disabled", store_get($$store_subs ??= {}, "$isLoading", isLoading), true)}>`);
  $$payload.select_value = selectedPage;
  $$payload.out.push(`<!--[-->`);
  for (let $$index_1 = 0, $$length = each_array_1.length; $$index_1 < $$length; $$index_1++) {
    let pageNum = each_array_1[$$index_1];
    $$payload.out.push(`<option${attr("value", pageNum.toString())}${maybe_selected($$payload, pageNum.toString())}>${escape_html(getHebrewPageNumber(pageNum))}</option>`);
  }
  $$payload.out.push(`<!--]-->`);
  $$payload.select_value = void 0;
  $$payload.out.push(`</select></div> <div class="flex items-center gap-2"><label for="amud-select" class="text-sm font-medium text-gray-700">\u05E2\u05DE\u05D5\u05D3:</label> <select id="amud-select" class="border border-gray-300 rounded px-3 py-2 text-sm bg-white"${attr("disabled", store_get($$store_subs ??= {}, "$isLoading", isLoading), true)}>`);
  $$payload.select_value = selectedAmud;
  $$payload.out.push(`<option value="a"${maybe_selected($$payload, "a")}>\u05D0</option><option value="b"${maybe_selected($$payload, "b")}>\u05D1</option>`);
  $$payload.select_value = void 0;
  $$payload.out.push(`</select></div> <button class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition text-sm font-medium"${attr("disabled", store_get($$store_subs ??= {}, "$isLoading", isLoading), true)}>${escape_html(store_get($$store_subs ??= {}, "$isLoading", isLoading) ? "\u05D8\u05D5\u05E2\u05DF..." : "\u05E2\u05D1\u05D5\u05E8")}</button> <a${attr("href", `/story?tractate=${stringify2(selectedTractate)}&page=${stringify2(selectedPage)}&amud=${stringify2(selectedAmud)}`)} class="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 transition text-sm font-medium">\u{1F4D6} Stories</a></div></div> `);
  if (store_get($$store_subs ??= {}, "$isLoading", isLoading)) {
    $$payload.out.push("<!--[-->");
    $$payload.out.push(`<div class="w-full h-[800px] border border-gray-300 rounded-lg bg-gray-50 flex items-center justify-center"><div class="text-center"><div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div> <p class="mt-4 text-gray-600">Loading Talmud page...</p></div></div>`);
  } else {
    $$payload.out.push("<!--[!-->");
    if (store_get($$store_subs ??= {}, "$pageError", pageError)) {
      $$payload.out.push("<!--[-->");
      $$payload.out.push(`<div class="w-full h-[800px] border border-red-300 rounded-lg bg-red-50 flex items-center justify-center"><div class="text-center"><p class="text-red-600 font-semibold">Error loading page</p> <p class="text-red-500 mt-2">${escape_html(store_get($$store_subs ??= {}, "$pageError", pageError))}</p> <button class="mt-4 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition">Retry</button></div></div>`);
    } else {
      $$payload.out.push("<!--[!-->");
      $$payload.out.push(`<div><div class="daf"${attr_style(`position: relative; ${stringify2(getTransformStyle())}`)}>`);
      if (!store_get($$store_subs ??= {}, "$currentPage", currentPage)) {
        $$payload.out.push("<!--[-->");
        $$payload.out.push(`<div class="flex items-center justify-center h-full text-gray-400"><p>Select a page to view</p></div>`);
      } else {
        $$payload.out.push("<!--[!-->");
      }
      $$payload.out.push(`<!--]--></div> <span class="preload">preload</span> `);
      if (store_get($$store_subs ??= {}, "$currentPage", currentPage)) {
        $$payload.out.push("<!--[-->");
        $$payload.out.push(`<div class="mt-8 space-y-4"><div class="border-t pt-4"><p class="text-sm text-gray-500">Source: HebrewBooks.org | ${escape_html(store_get($$store_subs ??= {}, "$currentPage", currentPage).tractate)} ${escape_html(store_get($$store_subs ??= {}, "$currentPage", currentPage).daf)}${escape_html(store_get($$store_subs ??= {}, "$currentPage", currentPage).amud)}</p></div></div>`);
      } else {
        $$payload.out.push("<!--[!-->");
      }
      $$payload.out.push(`<!--]--></div>`);
    }
    $$payload.out.push(`<!--]-->`);
  }
  $$payload.out.push(`<!--]--></div> <div class="text-center text-sm text-gray-500"><p>Powered by daf-renderer, HebrewBooks.org, and OpenRouter</p></div></div> `);
  TranslationPopup($$payload);
  $$payload.out.push(`<!----></main>`);
  if ($$store_subs)
    unsubscribe_stores($$store_subs);
  pop();
}
__name(_page, "_page");
var talmudStore;
var currentPage;
var isLoading;
var pageError;
var pageInfo;
var defaultOptions;
var LAYOUT_CONSTANTS;
var RESIZE_DEBOUNCE_DELAY;
var init_page_svelte = __esm2({
  ".svelte-kit/output/server/entries/pages/_page.svelte.js"() {
    init_index2();
    init_internal();
    init_exports2();
    init_state_svelte();
    init_chunks();
    init_hebrewbooks();
    init_style_manager();
    init_openrouter_translator();
    talmudStore = createTalmudStore();
    currentPage = derived(
      talmudStore,
      ($talmudStore) => $talmudStore.data
    );
    isLoading = derived(
      talmudStore,
      ($talmudStore) => $talmudStore.loading
    );
    pageError = derived(
      talmudStore,
      ($talmudStore) => $talmudStore.error
    );
    pageInfo = derived(
      talmudStore,
      ($talmudStore) => ({
        tractate: $talmudStore.tractate,
        page: $talmudStore.page,
        amud: $talmudStore.amud,
        fullPage: `${$talmudStore.page}${$talmudStore.amud}`
      })
    );
    defaultOptions = {
      contentWidth: "600px",
      mainWidth: "50%",
      padding: {
        vertical: "10px",
        horizontal: "16px"
      },
      innerPadding: "4px",
      outerPadding: "4px",
      halfway: "50%",
      fontFamily: {
        inner: "Rashi",
        outer: "Rashi",
        main: "Vilna"
      },
      direction: "rtl",
      fontSize: {
        main: "15px",
        side: "10.5px"
      },
      lineHeight: {
        main: "17px",
        side: "14px"
      }
    };
    LAYOUT_CONSTANTS = {
      // Number of lines for header/start section
      HEADER_LINES: 4,
      // Multiplier for start spacer height (4.3 lines)
      START_SPACER_MULTIPLIER: 4.3,
      // Threshold for detecting excessive spacing (30% content)
      EXCESSIVE_SPACING_THRESHOLD: 0.3,
      // Default amud (page side)
      DEFAULT_AMUD: "a"
    };
    RESIZE_DEBOUNCE_DELAY = 100;
    createRendererStore();
  }
});
var __exports3 = {};
__export2(__exports3, {
  component: () => component3,
  fonts: () => fonts3,
  imports: () => imports3,
  index: () => index3,
  stylesheets: () => stylesheets3,
  universal: () => page_ts_exports,
  universal_id: () => universal_id2
});
var index3;
var component_cache3;
var component3;
var universal_id2;
var imports3;
var stylesheets3;
var fonts3;
var init__3 = __esm2({
  ".svelte-kit/output/server/nodes/2.js"() {
    init_page_ts();
    index3 = 2;
    component3 = /* @__PURE__ */ __name(async () => component_cache3 ??= (await Promise.resolve().then(() => (init_page_svelte(), page_svelte_exports))).default, "component3");
    universal_id2 = "src/routes/+page.ts";
    imports3 = ["_app/immutable/nodes/2.nQirod73.js", "_app/immutable/chunks/Bzak7iHL.js", "_app/immutable/chunks/CL50UZ7u.js", "_app/immutable/chunks/BcvnQvbC.js", "_app/immutable/chunks/Cx6KAmFa.js", "_app/immutable/chunks/vYyAiFF4.js", "_app/immutable/chunks/5gOCJtLi.js", "_app/immutable/chunks/BuZd1pjB.js", "_app/immutable/chunks/Bu0e_mbD.js", "_app/immutable/chunks/CBxTfewZ.js", "_app/immutable/chunks/DJNVe0AQ.js", "_app/immutable/chunks/Bog_exwH.js", "_app/immutable/chunks/DxdHGLhZ.js", "_app/immutable/chunks/BTISvJJE.js", "_app/immutable/chunks/D4eelw9t.js", "_app/immutable/chunks/BRqbiqbO.js", "_app/immutable/chunks/DV5vUytA.js", "_app/immutable/chunks/CyRBKZ3g.js", "_app/immutable/chunks/BZap31F1.js", "_app/immutable/chunks/BVeTfFjV.js", "_app/immutable/chunks/DJn_p731.js"];
    stylesheets3 = ["_app/immutable/assets/style-manager.Cfi5m9XR.css", "_app/immutable/assets/2.CMC4woAB.css"];
    fonts3 = [];
  }
});
var page_server_ts_exports = {};
__export2(page_server_ts_exports, {
  load: () => load2
});
var load2;
var init_page_server_ts = __esm2({
  ".svelte-kit/output/server/entries/pages/story/_page.server.ts.js"() {
    load2 = /* @__PURE__ */ __name(async ({ url }) => {
      const tractate = url.searchParams.get("tractate") || "Berakhot";
      const page2 = url.searchParams.get("page") || "3";
      const amud = url.searchParams.get("amud") || "a";
      return {
        tractate,
        page: page2,
        amud
      };
    }, "load2");
  }
});
var page_svelte_exports2 = {};
__export2(page_svelte_exports2, {
  default: () => _page2
});
function _page2($$payload, $$props) {
  push();
  let { data } = $$props;
  let selectedTractate = data.tractate;
  let selectedPage = data.page;
  let selectedAmud = data.amud;
  let isLoading2 = false;
  const tractateOptions = [
    { value: "Berakhot", label: "\u05D1\u05E8\u05DB\u05D5\u05EA", id: 1 },
    { value: "Shabbat", label: "\u05E9\u05D1\u05EA", id: 2 },
    { value: "Eruvin", label: "\u05E2\u05D9\u05E8\u05D5\u05D1\u05D9\u05DF", id: 3 },
    { value: "Pesachim", label: "\u05E4\u05E1\u05D7\u05D9\u05DD", id: 4 },
    { value: "Shekalim", label: "\u05E9\u05E7\u05DC\u05D9\u05DD", id: 5 },
    { value: "Yoma", label: "\u05D9\u05D5\u05DE\u05D0", id: 6 },
    { value: "Sukkah", label: "\u05E1\u05D5\u05DB\u05D4", id: 7 },
    { value: "Beitzah", label: "\u05D1\u05D9\u05E6\u05D4", id: 8 },
    { value: "Rosh Hashanah", label: "\u05E8\u05D0\u05E9 \u05D4\u05E9\u05E0\u05D4", id: 9 },
    { value: "Taanit", label: "\u05EA\u05E2\u05E0\u05D9\u05EA", id: 10 },
    { value: "Megillah", label: "\u05DE\u05D2\u05D9\u05DC\u05D4", id: 11 },
    { value: "Moed Katan", label: "\u05DE\u05D5\u05E2\u05D3 \u05E7\u05D8\u05DF", id: 12 },
    { value: "Chagigah", label: "\u05D7\u05D2\u05D9\u05D2\u05D4", id: 13 },
    { value: "Yevamot", label: "\u05D9\u05D1\u05DE\u05D5\u05EA", id: 14 },
    { value: "Ketubot", label: "\u05DB\u05EA\u05D5\u05D1\u05D5\u05EA", id: 15 },
    { value: "Nedarim", label: "\u05E0\u05D3\u05E8\u05D9\u05DD", id: 16 },
    { value: "Nazir", label: "\u05E0\u05D6\u05D9\u05E8", id: 17 },
    { value: "Sotah", label: "\u05E1\u05D5\u05D8\u05D4", id: 18 },
    { value: "Gittin", label: "\u05D2\u05D9\u05D8\u05D9\u05DF", id: 19 },
    { value: "Kiddushin", label: "\u05E7\u05D9\u05D3\u05D5\u05E9\u05D9\u05DF", id: 20 },
    { value: "Bava Kamma", label: "\u05D1\u05D1\u05D0 \u05E7\u05DE\u05D0", id: 21 },
    { value: "Bava Metzia", label: "\u05D1\u05D1\u05D0 \u05DE\u05E6\u05D9\u05E2\u05D0", id: 22 },
    { value: "Bava Batra", label: "\u05D1\u05D1\u05D0 \u05D1\u05EA\u05E8\u05D0", id: 23 },
    { value: "Sanhedrin", label: "\u05E1\u05E0\u05D4\u05D3\u05E8\u05D9\u05DF", id: 24 },
    { value: "Makkot", label: "\u05DE\u05DB\u05D5\u05EA", id: 25 },
    { value: "Shevuot", label: "\u05E9\u05D1\u05D5\u05E2\u05D5\u05EA", id: 26 },
    { value: "Avodah Zarah", label: "\u05E2\u05D1\u05D5\u05D3\u05D4 \u05D6\u05E8\u05D4", id: 27 },
    { value: "Horayot", label: "\u05D4\u05D5\u05E8\u05D9\u05D5\u05EA", id: 28 },
    { value: "Zevachim", label: "\u05D6\u05D1\u05D7\u05D9\u05DD", id: 29 },
    { value: "Menachot", label: "\u05DE\u05E0\u05D7\u05D5\u05EA", id: 30 },
    { value: "Chullin", label: "\u05D7\u05D5\u05DC\u05D9\u05DF", id: 31 },
    { value: "Bekhorot", label: "\u05D1\u05DB\u05D5\u05E8\u05D5\u05EA", id: 32 },
    { value: "Arakhin", label: "\u05E2\u05E8\u05DB\u05D9\u05DF", id: 33 },
    { value: "Temurah", label: "\u05EA\u05DE\u05D5\u05E8\u05D4", id: 34 },
    { value: "Keritot", label: "\u05DB\u05E8\u05D9\u05EA\u05D5\u05EA", id: 35 },
    { value: "Meilah", label: "\u05DE\u05E2\u05D9\u05DC\u05D4", id: 36 },
    { value: "Niddah", label: "\u05E0\u05D9\u05D3\u05D4", id: 37 }
  ];
  function getHebrewPageNumber(num) {
    const hebrewNumbers = {
      1: "\u05D0",
      2: "\u05D1",
      3: "\u05D2",
      4: "\u05D3",
      5: "\u05D4",
      6: "\u05D5",
      7: "\u05D6",
      8: "\u05D7",
      9: "\u05D8",
      10: "\u05D9",
      11: "\u05D9\u05D0",
      12: "\u05D9\u05D1",
      13: "\u05D9\u05D2",
      14: "\u05D9\u05D3",
      15: "\u05D8\u05D5",
      16: "\u05D8\u05D6",
      17: "\u05D9\u05D6",
      18: "\u05D9\u05D7",
      19: "\u05D9\u05D8",
      20: "\u05DB",
      21: "\u05DB\u05D0",
      22: "\u05DB\u05D1",
      23: "\u05DB\u05D2",
      24: "\u05DB\u05D3",
      25: "\u05DB\u05D4",
      26: "\u05DB\u05D5",
      27: "\u05DB\u05D6",
      28: "\u05DB\u05D7",
      29: "\u05DB\u05D8",
      30: "\u05DC",
      31: "\u05DC\u05D0",
      32: "\u05DC\u05D1",
      33: "\u05DC\u05D2",
      34: "\u05DC\u05D3",
      35: "\u05DC\u05D4",
      36: "\u05DC\u05D5",
      37: "\u05DC\u05D6",
      38: "\u05DC\u05D7",
      39: "\u05DC\u05D8",
      40: "\u05DE",
      41: "\u05DE\u05D0",
      42: "\u05DE\u05D1",
      43: "\u05DE\u05D2",
      44: "\u05DE\u05D3",
      45: "\u05DE\u05D4",
      46: "\u05DE\u05D5",
      47: "\u05DE\u05D6",
      48: "\u05DE\u05D7",
      49: "\u05DE\u05D8",
      50: "\u05E0",
      51: "\u05E0\u05D0",
      52: "\u05E0\u05D1",
      53: "\u05E0\u05D2",
      54: "\u05E0\u05D3",
      55: "\u05E0\u05D4",
      56: "\u05E0\u05D5",
      57: "\u05E0\u05D6",
      58: "\u05E0\u05D7",
      59: "\u05E0\u05D8",
      60: "\u05E1",
      61: "\u05E1\u05D0",
      62: "\u05E1\u05D1",
      63: "\u05E1\u05D2",
      64: "\u05E1\u05D3",
      65: "\u05E1\u05D4",
      66: "\u05E1\u05D5",
      67: "\u05E1\u05D6",
      68: "\u05E1\u05D7",
      69: "\u05E1\u05D8",
      70: "\u05E2",
      71: "\u05E2\u05D0",
      72: "\u05E2\u05D1",
      73: "\u05E2\u05D2",
      74: "\u05E2\u05D3",
      75: "\u05E2\u05D4",
      76: "\u05E2\u05D5"
    };
    return hebrewNumbers[num] || num.toString();
  }
  __name(getHebrewPageNumber, "getHebrewPageNumber");
  const each_array = ensure_array_like(
    // Load stories when component mounts or data changes
    tractateOptions
  );
  const each_array_1 = ensure_array_like(Array.from({ length: 76 }, (_, i) => i + 2));
  $$payload.out.push(`<main class="min-h-screen bg-gray-100 p-8"><div class="max-w-5xl mx-auto space-y-8"><div class="bg-white rounded-lg shadow-md p-8"><h1 class="text-4xl font-bold text-gray-800 mb-4">Talmud Stories</h1> <p class="text-gray-600 mb-6">Compelling narratives to help you remember and understand the Gemara</p></div> <div class="bg-white rounded-lg shadow-md p-6"><div class="flex items-center justify-between mb-4"><h2 class="text-2xl font-bold text-gray-800">${escape_html(selectedTractate)} ${escape_html(selectedPage)}${escape_html(selectedAmud)}</h2> <div class="flex items-center gap-4 flex-wrap"><div class="flex items-center gap-2"><label for="tractate-select" class="text-sm font-medium text-gray-700">\u05DE\u05E1\u05DB\u05EA:</label> <select id="tractate-select" class="border border-gray-300 rounded px-3 py-2 text-sm bg-white"${attr("disabled", isLoading2, true)}>`);
  $$payload.select_value = selectedTractate;
  $$payload.out.push(`<!--[-->`);
  for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
    let option = each_array[$$index];
    $$payload.out.push(`<option${attr("value", option.value)}${maybe_selected($$payload, option.value)}>${escape_html(option.label)}</option>`);
  }
  $$payload.out.push(`<!--]-->`);
  $$payload.select_value = void 0;
  $$payload.out.push(`</select></div> <div class="flex items-center gap-2"><label for="page-select" class="text-sm font-medium text-gray-700">\u05D3\u05E3:</label> <select id="page-select" class="border border-gray-300 rounded px-3 py-2 text-sm bg-white w-20"${attr("disabled", isLoading2, true)}>`);
  $$payload.select_value = selectedPage;
  $$payload.out.push(`<!--[-->`);
  for (let $$index_1 = 0, $$length = each_array_1.length; $$index_1 < $$length; $$index_1++) {
    let pageNum = each_array_1[$$index_1];
    $$payload.out.push(`<option${attr("value", pageNum.toString())}${maybe_selected($$payload, pageNum.toString())}>${escape_html(getHebrewPageNumber(pageNum))}</option>`);
  }
  $$payload.out.push(`<!--]-->`);
  $$payload.select_value = void 0;
  $$payload.out.push(`</select></div> <div class="flex items-center gap-2"><label for="amud-select" class="text-sm font-medium text-gray-700">\u05E2\u05DE\u05D5\u05D3:</label> <select id="amud-select" class="border border-gray-300 rounded px-3 py-2 text-sm bg-white"${attr("disabled", isLoading2, true)}>`);
  $$payload.select_value = selectedAmud;
  $$payload.out.push(`<option value="a"${maybe_selected($$payload, "a")}>\u05D0</option><option value="b"${maybe_selected($$payload, "b")}>\u05D1</option>`);
  $$payload.select_value = void 0;
  $$payload.out.push(`</select></div> <button class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition text-sm font-medium"${attr("disabled", isLoading2, true)}>${escape_html("\u05E2\u05D1\u05D5\u05E8")}</button> <a${attr("href", `/?tractate=${stringify2(selectedTractate)}&page=${stringify2(selectedPage)}&amud=${stringify2(selectedAmud)}`)} class="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition text-sm font-medium">\u{1F4DC} View Daf</a></div></div></div> `);
  {
    $$payload.out.push("<!--[!-->");
    {
      $$payload.out.push("<!--[!-->");
      {
        $$payload.out.push("<!--[!-->");
        $$payload.out.push(`<div class="bg-white rounded-lg shadow-md p-8"><div class="text-center py-16"><p class="text-gray-500">No stories available. Please try generating them.</p> <button class="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition">Generate Educational Stories</button></div></div>`);
      }
      $$payload.out.push(`<!--]-->`);
    }
    $$payload.out.push(`<!--]-->`);
  }
  $$payload.out.push(`<!--]--></div></main>`);
  pop();
}
__name(_page2, "_page2");
var init_page_svelte2 = __esm2({
  ".svelte-kit/output/server/entries/pages/story/_page.svelte.js"() {
    init_index2();
    init_internal();
    init_exports2();
    init_state_svelte();
    init_openrouter_translator();
  }
});
var __exports4 = {};
__export2(__exports4, {
  component: () => component4,
  fonts: () => fonts4,
  imports: () => imports4,
  index: () => index4,
  server: () => page_server_ts_exports,
  server_id: () => server_id,
  stylesheets: () => stylesheets4
});
var index4;
var component_cache4;
var component4;
var server_id;
var imports4;
var stylesheets4;
var fonts4;
var init__4 = __esm2({
  ".svelte-kit/output/server/nodes/3.js"() {
    init_page_server_ts();
    index4 = 3;
    component4 = /* @__PURE__ */ __name(async () => component_cache4 ??= (await Promise.resolve().then(() => (init_page_svelte2(), page_svelte_exports2))).default, "component4");
    server_id = "src/routes/story/+page.server.ts";
    imports4 = ["_app/immutable/nodes/3.DObsjjJC.js", "_app/immutable/chunks/Bzak7iHL.js", "_app/immutable/chunks/BcvnQvbC.js", "_app/immutable/chunks/CL50UZ7u.js", "_app/immutable/chunks/Cx6KAmFa.js", "_app/immutable/chunks/vYyAiFF4.js", "_app/immutable/chunks/5gOCJtLi.js", "_app/immutable/chunks/BuZd1pjB.js", "_app/immutable/chunks/DJNVe0AQ.js", "_app/immutable/chunks/BRqbiqbO.js", "_app/immutable/chunks/BTISvJJE.js", "_app/immutable/chunks/DJn_p731.js"];
    stylesheets4 = [];
    fonts4 = [];
  }
});
var page_svelte_exports3 = {};
__export2(page_svelte_exports3, {
  default: () => _page3
});
function _page3($$payload, $$props) {
  push();
  let loading = false;
  let mesechta = "27";
  let daf = "44";
  $$payload.out.push(`<div class="p-6 max-w-6xl mx-auto"><h1 class="text-3xl font-bold mb-6">Daf Supplier Test Page</h1> <div class="mb-6 flex gap-4 items-end"><div><label for="mesechta" class="block text-sm font-medium mb-1">Mesechta ID:</label> <input id="mesechta"${attr("value", mesechta)} type="number" class="border rounded px-3 py-2 w-20" min="1" max="37"/></div> <div><label for="daf" class="block text-sm font-medium mb-1">Daf:</label> <input id="daf"${attr("value", daf)} type="text" class="border rounded px-3 py-2 w-20" placeholder="44"/></div> <button${attr("disabled", loading, true)} class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:opacity-50">${escape_html("Fetch Data")}</button></div> `);
  {
    $$payload.out.push("<!--[!-->");
  }
  $$payload.out.push(`<!--]--> `);
  {
    $$payload.out.push("<!--[!-->");
  }
  $$payload.out.push(`<!--]--></div>`);
  pop();
}
__name(_page3, "_page3");
var init_page_svelte3 = __esm2({
  ".svelte-kit/output/server/entries/pages/test/_page.svelte.js"() {
    init_index2();
  }
});
var __exports5 = {};
__export2(__exports5, {
  component: () => component5,
  fonts: () => fonts5,
  imports: () => imports5,
  index: () => index5,
  stylesheets: () => stylesheets5
});
var index5;
var component_cache5;
var component5;
var imports5;
var stylesheets5;
var fonts5;
var init__5 = __esm2({
  ".svelte-kit/output/server/nodes/4.js"() {
    index5 = 4;
    component5 = /* @__PURE__ */ __name(async () => component_cache5 ??= (await Promise.resolve().then(() => (init_page_svelte3(), page_svelte_exports3))).default, "component5");
    imports5 = ["_app/immutable/nodes/4.BCkGzGoM.js", "_app/immutable/chunks/Bzak7iHL.js", "_app/immutable/chunks/CwwgXkST.js", "_app/immutable/chunks/BcvnQvbC.js", "_app/immutable/chunks/CL50UZ7u.js", "_app/immutable/chunks/Cx6KAmFa.js", "_app/immutable/chunks/BuZd1pjB.js", "_app/immutable/chunks/Bz6AASmr.js", "_app/immutable/chunks/BZ4fkazW.js"];
    stylesheets5 = ["_app/immutable/assets/4.C0XE9Tc0.css"];
    fonts5 = [];
  }
});
var page_svelte_exports4 = {};
__export2(page_svelte_exports4, {
  default: () => _page4
});
function Navigation($$payload, $$props) {
  push();
  let navItems = fallback(
    $$props["navItems"],
    () => [
      { name: "Dashboard", href: "/", current: true },
      { name: "Team", href: "/team", current: false },
      { name: "Projects", href: "/projects", current: false },
      { name: "Calendar", href: "/calendar", current: false }
    ],
    true
  );
  let user = fallback(
    $$props["user"],
    () => ({
      name: "Tom Cook",
      email: "tom@example.com",
      imageUrl: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80"
    }),
    true
  );
  const each_array = ensure_array_like(navItems);
  $$payload.out.push(`<nav class="border-b border-gray-200 bg-white"><div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8"><div class="flex h-16 justify-between"><div class="flex"><div class="flex shrink-0 items-center"><img src="https://tailwindcss.com/plus-assets/img/logos/mark.svg?color=indigo&amp;shade=600" alt="Your Company" class="block h-8 w-auto lg:hidden"/> <img src="https://tailwindcss.com/plus-assets/img/logos/mark.svg?color=indigo&amp;shade=600" alt="Your Company" class="hidden h-8 w-auto lg:block"/></div> <div class="hidden sm:-my-px sm:ml-6 sm:flex sm:space-x-8"><!--[-->`);
  for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
    let item = each_array[$$index];
    $$payload.out.push(`<a${attr("href", item.href)}${attr("aria-current", item.current ? "page" : void 0)}${attr_class(`inline-flex items-center border-b-2 px-1 pt-1 text-sm font-medium ${stringify2(item.current ? "border-indigo-500 text-gray-900" : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700")}`)}>${escape_html(item.name)}</a>`);
  }
  $$payload.out.push(`<!--]--></div></div> <div class="hidden sm:ml-6 sm:flex sm:items-center"><button type="button" class="relative rounded-full bg-white p-1 text-gray-400 hover:text-gray-500 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:outline-hidden"><span class="absolute -inset-1.5"></span> <span class="sr-only">View notifications</span> <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" data-slot="icon" aria-hidden="true" class="size-6"><path d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" stroke-linecap="round" stroke-linejoin="round"></path></svg></button> <div class="relative ml-3 user-menu-container"><button class="relative flex max-w-xs items-center rounded-full bg-white text-sm focus:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"><span class="absolute -inset-1.5"></span> <span class="sr-only">Open user menu</span> <img${attr("src", user.imageUrl)} alt="" class="size-8 rounded-full"/></button> `);
  {
    $$payload.out.push("<!--[!-->");
  }
  $$payload.out.push(`<!--]--></div></div> <div class="-mr-2 flex items-center sm:hidden"><button type="button" class="relative inline-flex items-center justify-center rounded-md bg-white p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-500 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:outline-hidden"><span class="absolute -inset-0.5"></span> <span class="sr-only">Open main menu</span> `);
  {
    $$payload.out.push("<!--[-->");
    $$payload.out.push(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" data-slot="icon" aria-hidden="true" class="size-6"><path d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" stroke-linecap="round" stroke-linejoin="round"></path></svg>`);
  }
  $$payload.out.push(`<!--]--></button></div></div></div> `);
  {
    $$payload.out.push("<!--[!-->");
  }
  $$payload.out.push(`<!--]--></nav>`);
  bind_props($$props, { navItems, user });
  pop();
}
__name(Navigation, "Navigation");
function Table($$payload, $$props) {
  push();
  let title2 = fallback($$props["title"], "Transactions");
  let description = fallback($$props["description"], "A table of placeholder stock market data that does not make any sense.");
  let showExportButton = fallback($$props["showExportButton"], true);
  let data = fallback(
    $$props["data"],
    () => [
      {
        id: "AAPS0L",
        company: "Chase & Co.",
        share: "CAC",
        commission: "+$4.37",
        price: "$3,509.00",
        quantity: "12.00",
        netAmount: "$4,397.00"
      },
      {
        id: "O2KMND",
        company: "Amazon.com Inc.",
        share: "AMZN",
        commission: "+$5.92",
        price: "$2,900.00",
        quantity: "8.80",
        netAmount: "$3,509.00"
      },
      {
        id: "1LP2P4",
        company: "Procter & Gamble",
        share: "PG",
        commission: "-$5.65",
        price: "$7,978.00",
        quantity: "2.30",
        netAmount: "$2,652.00"
      },
      {
        id: "PS9FJGL",
        company: "Berkshire Hathaway",
        share: "BRK",
        commission: "+$4.37",
        price: "$3,116.00",
        quantity: "48.00",
        netAmount: "$6,055.00"
      },
      {
        id: "QYR135",
        company: "Apple Inc.",
        share: "AAPL",
        commission: "+$38.00",
        price: "$8,508.00",
        quantity: "36.00",
        netAmount: "$3,496.00"
      },
      {
        id: "99SLSM",
        company: "NVIDIA Corporation",
        share: "NVDA",
        commission: "+$1,427.00",
        price: "$4,425.00",
        quantity: "18.00",
        netAmount: "$2,109.00"
      },
      {
        id: "OSDJLS",
        company: "Johnson & Johnson",
        share: "JNJ",
        commission: "+$1,937.23",
        price: "$4,038.00",
        quantity: "32.00",
        netAmount: "$7,210.00"
      },
      {
        id: "4HJK3N",
        company: "JPMorgan",
        share: "JPM",
        commission: "-$3.67",
        price: "$3,966.00",
        quantity: "80.00",
        netAmount: "$6,432.00"
      }
    ],
    true
  );
  let columns = fallback(
    $$props["columns"],
    () => [
      { key: "id", label: "Transaction ID" },
      { key: "company", label: "Company" },
      { key: "share", label: "Share" },
      { key: "commission", label: "Commission" },
      { key: "price", label: "Price" },
      { key: "quantity", label: "Quantity" },
      { key: "netAmount", label: "Net amount" }
    ],
    true
  );
  let onExport = fallback($$props["onExport"], () => {
    console.log("Export clicked");
  });
  let onEdit = fallback($$props["onEdit"], (item) => {
    console.log("Edit clicked for", item);
  });
  const each_array = ensure_array_like(columns);
  const each_array_1 = ensure_array_like(data);
  $$payload.out.push(`<div class="px-4 sm:px-6 lg:px-8"><div class="sm:flex sm:items-center"><div class="sm:flex-auto"><h1 class="text-base font-semibold text-gray-900">${escape_html(title2)}</h1> <p class="mt-2 text-sm text-gray-700">${escape_html(description)}</p></div> `);
  if (showExportButton) {
    $$payload.out.push("<!--[-->");
    $$payload.out.push(`<div class="mt-4 sm:mt-0 sm:ml-16 sm:flex-none"><button type="button" class="block rounded-md bg-indigo-600 px-3 py-2 text-center text-sm font-semibold text-white shadow-xs hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">Export</button></div>`);
  } else {
    $$payload.out.push("<!--[!-->");
  }
  $$payload.out.push(`<!--]--></div> <div class="mt-8 flow-root"><div class="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8"><div class="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8"><table class="relative min-w-full divide-y divide-gray-300"><thead><tr><!--[-->`);
  for (let i = 0, $$length = each_array.length; i < $$length; i++) {
    let column = each_array[i];
    $$payload.out.push(`<th scope="col"${attr_class(`${stringify2(i === 0 ? "py-3.5 pr-3 pl-4 sm:pl-0" : i === columns.length - 1 ? "py-3.5 pr-4 pl-3 sm:pr-0" : "px-2 py-3.5")} text-left text-sm font-semibold whitespace-nowrap text-gray-900`)}>${escape_html(column.label)}</th>`);
  }
  $$payload.out.push(`<!--]--><th scope="col" class="py-3.5 pr-4 pl-3 whitespace-nowrap sm:pr-0"><span class="sr-only">Edit</span></th></tr></thead><tbody class="divide-y divide-gray-200 bg-white"><!--[-->`);
  for (let $$index_2 = 0, $$length = each_array_1.length; $$index_2 < $$length; $$index_2++) {
    let item = each_array_1[$$index_2];
    const each_array_2 = ensure_array_like(columns);
    $$payload.out.push(`<tr><!--[-->`);
    for (let i = 0, $$length2 = each_array_2.length; i < $$length2; i++) {
      let column = each_array_2[i];
      $$payload.out.push(`<td${attr_class(`${stringify2(i === 0 ? "py-2 pr-3 pl-4 sm:pl-0" : i === columns.length - 1 ? "py-2 pr-4 pl-3 sm:pr-0" : "px-2 py-2")} text-sm whitespace-nowrap ${stringify2(column.key === "company" ? "font-medium text-gray-900" : column.key === "share" ? "text-gray-900" : "text-gray-500")}`)}>${escape_html(item[column.key])}</td>`);
    }
    $$payload.out.push(`<!--]--><td class="py-2 pr-4 pl-3 text-right text-sm font-medium whitespace-nowrap sm:pr-0"><button class="text-indigo-600 hover:text-indigo-900">Edit<span class="sr-only">, ${escape_html(item.id)}</span></button></td></tr>`);
  }
  $$payload.out.push(`<!--]--></tbody></table></div></div></div></div>`);
  bind_props($$props, {
    title: title2,
    description,
    showExportButton,
    data,
    columns,
    onExport,
    onEdit
  });
  pop();
}
__name(Table, "Table");
function Select($$payload, $$props) {
  push();
  let label = fallback($$props["label"], "");
  let name = fallback($$props["name"], "");
  let value = fallback($$props["value"], "");
  let options2 = fallback($$props["options"], () => [], true);
  let placeholder = fallback($$props["placeholder"], "Select an option");
  let isOpen = false;
  let selectedOption = null;
  selectedOption = options2.find((opt) => opt.value === value) || null;
  $$payload.out.push(`<div>`);
  if (label) {
    $$payload.out.push("<!--[-->");
    $$payload.out.push(`<label${attr("for", name)} class="block text-sm/6 font-medium text-gray-900">${escape_html(label)}</label>`);
  } else {
    $$payload.out.push("<!--[!-->");
  }
  $$payload.out.push(`<!--]--> <div${attr_class(`relative ${stringify2(label ? "mt-2" : "")}`)}><button type="button" class="grid w-full cursor-default grid-cols-1 rounded-md bg-white py-1.5 pr-2 pl-3 text-left text-gray-900 outline-1 -outline-offset-1 outline-gray-300 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-indigo-600 sm:text-sm/6" aria-haspopup="listbox"${attr("aria-expanded", isOpen)}${attr("aria-labelledby", label ? name : void 0)}><span class="col-start-1 row-start-1 flex items-center gap-3 pr-6">`);
  if (selectedOption) {
    $$payload.out.push("<!--[-->");
    if (selectedOption.status) {
      $$payload.out.push("<!--[-->");
      $$payload.out.push(`<span${attr("aria-label", selectedOption.status === "online" ? "Online" : "Offline")}${attr_class(`inline-block size-2 shrink-0 rounded-full border border-transparent ${stringify2(selectedOption.status === "online" ? "bg-green-400" : "bg-gray-200")}`)}></span>`);
    } else {
      $$payload.out.push("<!--[!-->");
    }
    $$payload.out.push(`<!--]--> <span class="block truncate">${escape_html(selectedOption.label)}</span>`);
  } else {
    $$payload.out.push("<!--[!-->");
    $$payload.out.push(`<span class="block truncate text-gray-500">${escape_html(placeholder)}</span>`);
  }
  $$payload.out.push(`<!--]--></span> <svg viewBox="0 0 16 16" fill="currentColor" data-slot="icon" aria-hidden="true" class="col-start-1 row-start-1 size-5 self-center justify-self-end text-gray-500 sm:size-4"><path d="M5.22 10.22a.75.75 0 0 1 1.06 0L8 11.94l1.72-1.72a.75.75 0 1 1 1.06 1.06l-2.25 2.25a.75.75 0 0 1-1.06 0l-2.25-2.25a.75.75 0 0 1 0-1.06ZM10.78 5.78a.75.75 0 0 1-1.06 0L8 4.06 6.28 5.78a.75.75 0 0 1-1.06-1.06l2.25-2.25a.75.75 0 0 1 1.06 0l2.25 2.25a.75.75 0 0 1 0 1.06Z" clip-rule="evenodd" fill-rule="evenodd"></path></svg></button> `);
  {
    $$payload.out.push("<!--[!-->");
  }
  $$payload.out.push(`<!--]--></div></div>`);
  bind_props($$props, { label, name, value, options: options2, placeholder });
  pop();
}
__name(Select, "Select");
function Dialog($$payload, $$props) {
  const $$slots = sanitize_slots($$props);
  push();
  let open = fallback($$props["open"], false);
  let title2 = fallback($$props["title"], "");
  let description = fallback($$props["description"], "");
  let icon = fallback(
    $$props["icon"],
    "success"
    // 'success', 'error', 'warning', 'info'
  );
  let primaryButtonText = fallback($$props["primaryButtonText"], "Confirm");
  let secondaryButtonText = fallback($$props["secondaryButtonText"], "Cancel");
  let primaryButtonClass = fallback($$props["primaryButtonClass"], "bg-indigo-600 hover:bg-indigo-500 focus-visible:outline-indigo-600");
  let showSecondaryButton = fallback($$props["showSecondaryButton"], true);
  if (open) {
    $$payload.out.push("<!--[-->");
    $$payload.out.push(`<div class="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="dialog-title" role="dialog" aria-modal="true"><div class="fixed inset-0 bg-gray-500/75 transition-opacity" aria-hidden="true"></div> <div class="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0"><div class="relative transform overflow-hidden rounded-lg bg-white px-4 pt-5 pb-4 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:p-6" tabindex="-1"><div>`);
    if (icon) {
      $$payload.out.push("<!--[-->");
      $$payload.out.push(`<div${attr_class(`mx-auto flex size-12 items-center justify-center rounded-full ${stringify2(icon === "success" ? "bg-green-100" : icon === "error" ? "bg-red-100" : icon === "warning" ? "bg-yellow-100" : "bg-blue-100")}`)}>`);
      if (icon === "success") {
        $$payload.out.push("<!--[-->");
        $$payload.out.push(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" data-slot="icon" aria-hidden="true" class="size-6 text-green-600"><path d="m4.5 12.75 6 6 9-13.5" stroke-linecap="round" stroke-linejoin="round"></path></svg>`);
      } else {
        $$payload.out.push("<!--[!-->");
        if (icon === "error") {
          $$payload.out.push("<!--[-->");
          $$payload.out.push(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" data-slot="icon" aria-hidden="true" class="size-6 text-red-600"><path d="M6 18 18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"></path></svg>`);
        } else {
          $$payload.out.push("<!--[!-->");
          if (icon === "warning") {
            $$payload.out.push("<!--[-->");
            $$payload.out.push(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" data-slot="icon" aria-hidden="true" class="size-6 text-yellow-600"><path d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" stroke-linecap="round" stroke-linejoin="round"></path></svg>`);
          } else {
            $$payload.out.push("<!--[!-->");
            $$payload.out.push(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" data-slot="icon" aria-hidden="true" class="size-6 text-blue-600"><path d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" stroke-linecap="round" stroke-linejoin="round"></path></svg>`);
          }
          $$payload.out.push(`<!--]-->`);
        }
        $$payload.out.push(`<!--]-->`);
      }
      $$payload.out.push(`<!--]--></div>`);
    } else {
      $$payload.out.push("<!--[!-->");
    }
    $$payload.out.push(`<!--]--> <div${attr_class(`${stringify2(icon ? "mt-3" : "")} text-center sm:mt-5`)}>`);
    if (title2) {
      $$payload.out.push("<!--[-->");
      $$payload.out.push(`<h3 id="dialog-title" class="text-base font-semibold text-gray-900">${escape_html(title2)}</h3>`);
    } else {
      $$payload.out.push("<!--[!-->");
    }
    $$payload.out.push(`<!--]--> `);
    if (description) {
      $$payload.out.push("<!--[-->");
      $$payload.out.push(`<div class="mt-2"><p class="text-sm text-gray-500">${escape_html(description)}</p></div>`);
    } else {
      $$payload.out.push("<!--[!-->");
    }
    $$payload.out.push(`<!--]--> `);
    if ($$slots.default) {
      $$payload.out.push("<!--[-->");
      $$payload.out.push(`<div class="mt-2"><!---->`);
      slot($$payload, $$props, "default", {});
      $$payload.out.push(`<!----></div>`);
    } else {
      $$payload.out.push("<!--[!-->");
    }
    $$payload.out.push(`<!--]--></div></div> <div${attr_class(`mt-5 sm:mt-6 ${stringify2(showSecondaryButton ? "sm:grid sm:grid-flow-row-dense sm:grid-cols-2 sm:gap-3" : "")}`)}><button type="button"${attr_class(`inline-flex w-full justify-center rounded-md px-3 py-2 text-sm font-semibold text-white shadow-xs focus-visible:outline-2 focus-visible:outline-offset-2 ${stringify2(primaryButtonClass)} ${stringify2(showSecondaryButton ? "sm:col-start-2" : "")}`)}>${escape_html(primaryButtonText)}</button> `);
    if (showSecondaryButton) {
      $$payload.out.push("<!--[-->");
      $$payload.out.push(`<button type="button" class="mt-3 inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-xs ring-1 ring-gray-300 ring-inset hover:bg-gray-50 sm:col-start-1 sm:mt-0">${escape_html(secondaryButtonText)}</button>`);
    } else {
      $$payload.out.push("<!--[!-->");
    }
    $$payload.out.push(`<!--]--></div></div></div></div>`);
  } else {
    $$payload.out.push("<!--[!-->");
  }
  $$payload.out.push(`<!--]-->`);
  bind_props($$props, {
    open,
    title: title2,
    description,
    icon,
    primaryButtonText,
    secondaryButtonText,
    primaryButtonClass,
    showSecondaryButton
  });
  pop();
}
__name(Dialog, "Dialog");
function Checkbox($$payload, $$props) {
  push();
  let id = fallback($$props["id"], "");
  let name = fallback($$props["name"], "");
  let label = fallback($$props["label"], "");
  let description = fallback($$props["description"], "");
  let checked = fallback($$props["checked"], false);
  let indeterminate = fallback($$props["indeterminate"], false);
  let disabled = fallback($$props["disabled"], false);
  if (indeterminate && checked) {
    indeterminate = false;
  }
  $$payload.out.push(`<div class="flex gap-3"><div class="flex h-6 shrink-0 items-center"><div class="group grid size-4 grid-cols-1"><input${attr("id", id)}${attr("name", name)} type="checkbox"${attr("checked", checked, true)}${attr("disabled", disabled, true)}${attr("aria-describedby", description ? `${id}-description` : void 0)} class="col-start-1 row-start-1 appearance-none rounded-sm border border-gray-300 bg-white checked:border-indigo-600 checked:bg-indigo-600 indeterminate:border-indigo-600 indeterminate:bg-indigo-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:border-gray-300 disabled:bg-gray-100 disabled:checked:bg-gray-100 forced-colors:appearance-auto"/> <svg fill="none" viewBox="0 0 14 14" class="pointer-events-none col-start-1 row-start-1 size-3.5 self-center justify-self-center stroke-white group-has-disabled:stroke-gray-950/25"><path d="M3 8L6 11L11 3.5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="opacity-0 group-has-checked:opacity-100"></path><path d="M3 7H11" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="opacity-0 group-has-indeterminate:opacity-100"></path></svg></div></div> <div class="text-sm/6"><label${attr("for", id)} class="font-medium text-gray-900">${escape_html(label)}</label> `);
  if (description) {
    $$payload.out.push("<!--[-->");
    $$payload.out.push(`<p${attr("id", `${stringify2(id)}-description`)} class="text-gray-500">${escape_html(description)}</p>`);
  } else {
    $$payload.out.push("<!--[!-->");
  }
  $$payload.out.push(`<!--]--></div></div>`);
  bind_props($$props, {
    id,
    name,
    label,
    description,
    checked,
    indeterminate,
    disabled
  });
  pop();
}
__name(Checkbox, "Checkbox");
function Button($$payload, $$props) {
  push();
  let classes2;
  let size = fallback($$props["size"], "md");
  let variant = fallback($$props["variant"], "secondary");
  let rounded = fallback($$props["rounded"], "full");
  let type = fallback($$props["type"], "button");
  let disabled = fallback($$props["disabled"], false);
  let href = fallback($$props["href"], "");
  const sizeClasses = {
    xs: "px-2.5 py-1 text-xs",
    sm: "px-2.5 py-1 text-sm",
    md: "px-3 py-1.5 text-sm",
    lg: "px-3.5 py-2 text-sm",
    xl: "px-4 py-2.5 text-sm"
  };
  const variantClasses = {
    primary: "bg-indigo-600 text-white shadow-xs hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600",
    secondary: "bg-white text-gray-900 shadow-xs ring-1 ring-gray-300 ring-inset hover:bg-gray-50",
    danger: "bg-red-600 text-white shadow-xs hover:bg-red-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600",
    ghost: "text-gray-900 hover:bg-gray-50"
  };
  const roundedClasses = {
    none: "rounded-none",
    sm: "rounded-sm",
    md: "rounded-md",
    lg: "rounded-lg",
    full: "rounded-full"
  };
  classes2 = `${sizeClasses[size]} ${variantClasses[variant]} ${roundedClasses[rounded]} font-semibold transition-colors ${disabled ? "opacity-50 cursor-not-allowed" : ""}`;
  if (href && !disabled) {
    $$payload.out.push("<!--[-->");
    $$payload.out.push(`<a${attr("href", href)}${attr_class(clsx(classes2))}><!---->`);
    slot($$payload, $$props, "default", {});
    $$payload.out.push(`<!----></a>`);
  } else {
    $$payload.out.push("<!--[!-->");
    $$payload.out.push(`<button${attr("type", type)}${attr("disabled", disabled, true)}${attr_class(clsx(classes2))}><!---->`);
    slot($$payload, $$props, "default", {});
    $$payload.out.push(`<!----></button>`);
  }
  $$payload.out.push(`<!--]-->`);
  bind_props($$props, { size, variant, rounded, type, disabled, href });
  pop();
}
__name(Button, "Button");
function Toggle($$payload, $$props) {
  const $$slots = sanitize_slots($$props);
  push();
  let name = fallback($$props["name"], "");
  let checked = fallback($$props["checked"], false);
  let disabled = fallback($$props["disabled"], false);
  let label = fallback($$props["label"], "Use setting");
  let showIcons = fallback($$props["showIcons"], true);
  $$payload.out.push(`<label class="inline-flex items-center"><div${attr_class(`group relative inline-flex w-11 shrink-0 rounded-full bg-gray-200 p-0.5 inset-ring inset-ring-gray-900/5 outline-offset-2 outline-indigo-600 transition-colors duration-200 ease-in-out has-checked:bg-indigo-600 has-focus-visible:outline-2 ${stringify2(disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer")}`)}><span class="relative size-5 rounded-full bg-white shadow-xs ring-1 ring-gray-900/5 transition-transform duration-200 ease-in-out group-has-checked:translate-x-5">`);
  if (showIcons) {
    $$payload.out.push("<!--[-->");
    $$payload.out.push(`<span aria-hidden="true" class="absolute inset-0 flex size-full items-center justify-center opacity-100 transition-opacity duration-200 ease-in group-has-checked:opacity-0 group-has-checked:duration-100 group-has-checked:ease-out"><svg fill="none" viewBox="0 0 12 12" class="size-3 text-gray-400"><path d="M4 8l2-2m0 0l2-2M6 6L4 4m2 2l2 2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg></span> <span aria-hidden="true" class="absolute inset-0 flex size-full items-center justify-center opacity-0 transition-opacity duration-100 ease-out group-has-checked:opacity-100 group-has-checked:duration-200 group-has-checked:ease-in"><svg fill="currentColor" viewBox="0 0 12 12" class="size-3 text-indigo-600"><path d="M3.707 5.293a1 1 0 00-1.414 1.414l1.414-1.414zM5 8l-.707.707a1 1 0 001.414 0L5 8zm4.707-3.293a1 1 0 00-1.414-1.414l1.414 1.414zm-7.414 2l2 2 1.414-1.414-2-2-1.414 1.414zm3.414 2l4-4-1.414-1.414-4 4 1.414 1.414z"></path></svg></span>`);
  } else {
    $$payload.out.push("<!--[!-->");
  }
  $$payload.out.push(`<!--]--></span> <input${attr("name", name)} type="checkbox"${attr("checked", checked, true)}${attr("disabled", disabled, true)}${attr("aria-label", label)} class="absolute inset-0 appearance-none focus:outline-hidden"/></div> `);
  if ($$slots.default) {
    $$payload.out.push("<!--[-->");
    $$payload.out.push(`<span class="ml-3 text-sm font-medium text-gray-900"><!---->`);
    slot($$payload, $$props, "default", {});
    $$payload.out.push(`<!----></span>`);
  } else {
    $$payload.out.push("<!--[!-->");
  }
  $$payload.out.push(`<!--]--></label>`);
  bind_props($$props, { name, checked, disabled, label, showIcons });
  pop();
}
__name(Toggle, "Toggle");
function _page4($$payload) {
  let selectedUser = "4";
  let showDialog = false;
  let checkboxes = { comments: true, candidates: false, offers: false };
  let toggleState = false;
  const userOptions = [
    { value: "1", label: "Wade Cooper", status: "online" },
    { value: "2", label: "Arlene Mccoy", status: "offline" },
    { value: "3", label: "Devon Webb", status: "offline" },
    { value: "4", label: "Tom Cook", status: "online" },
    { value: "5", label: "Tanya Fox", status: "offline" },
    { value: "6", label: "Hellen Schmidt", status: "online" },
    { value: "7", label: "Caroline Schultz", status: "online" },
    { value: "8", label: "Mason Heaney", status: "offline" },
    { value: "9", label: "Claudie Smitham", status: "online" },
    { value: "10", label: "Emil Schaefer", status: "offline" }
  ];
  let $$settled = true;
  let $$inner_payload;
  function $$render_inner($$payload2) {
    $$payload2.out.push(`<div class="min-h-full">`);
    Navigation($$payload2, {});
    $$payload2.out.push(`<!----> <div class="py-10"><header><div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8"><h1 class="text-3xl font-bold tracking-tight text-gray-900">Dashboard</h1></div></header> <main><div class="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8"><div class="mb-8"><h2 class="text-xl font-semibold mb-4">Select Component</h2> <div class="max-w-xs">`);
    Select($$payload2, {
      label: "Assigned to",
      name: "assigned",
      options: userOptions,
      get value() {
        return selectedUser;
      },
      set value($$value) {
        selectedUser = $$value;
        $$settled = false;
      }
    });
    $$payload2.out.push(`<!----></div> <p class="mt-2 text-sm text-gray-600">Selected value: ${escape_html(selectedUser)}</p></div> <div class="mb-8"><h2 class="text-xl font-semibold mb-4">Button Component</h2> <div class="flex flex-wrap gap-3">`);
    Button($$payload2, {
      size: "xs",
      children: ($$payload3) => {
        $$payload3.out.push(`<!---->Button text`);
      },
      $$slots: { default: true }
    });
    $$payload2.out.push(`<!----> `);
    Button($$payload2, {
      size: "sm",
      children: ($$payload3) => {
        $$payload3.out.push(`<!---->Button text`);
      },
      $$slots: { default: true }
    });
    $$payload2.out.push(`<!----> `);
    Button($$payload2, {
      size: "md",
      children: ($$payload3) => {
        $$payload3.out.push(`<!---->Button text`);
      },
      $$slots: { default: true }
    });
    $$payload2.out.push(`<!----> `);
    Button($$payload2, {
      size: "lg",
      children: ($$payload3) => {
        $$payload3.out.push(`<!---->Button text`);
      },
      $$slots: { default: true }
    });
    $$payload2.out.push(`<!----> `);
    Button($$payload2, {
      size: "xl",
      children: ($$payload3) => {
        $$payload3.out.push(`<!---->Button text`);
      },
      $$slots: { default: true }
    });
    $$payload2.out.push(`<!----></div> <div class="mt-4 flex flex-wrap gap-3">`);
    Button($$payload2, {
      variant: "primary",
      children: ($$payload3) => {
        $$payload3.out.push(`<!---->Primary`);
      },
      $$slots: { default: true }
    });
    $$payload2.out.push(`<!----> `);
    Button($$payload2, {
      variant: "secondary",
      children: ($$payload3) => {
        $$payload3.out.push(`<!---->Secondary`);
      },
      $$slots: { default: true }
    });
    $$payload2.out.push(`<!----> `);
    Button($$payload2, {
      variant: "danger",
      children: ($$payload3) => {
        $$payload3.out.push(`<!---->Danger`);
      },
      $$slots: { default: true }
    });
    $$payload2.out.push(`<!----> `);
    Button($$payload2, {
      variant: "ghost",
      children: ($$payload3) => {
        $$payload3.out.push(`<!---->Ghost`);
      },
      $$slots: { default: true }
    });
    $$payload2.out.push(`<!----></div></div> <div class="mb-8"><h2 class="text-xl font-semibold mb-4">Checkbox Component</h2> <fieldset><legend class="sr-only">Notifications</legend> <div class="space-y-5">`);
    Checkbox($$payload2, {
      id: "comments",
      name: "comments",
      label: "Comments",
      description: "Get notified when someones posts a comment on a posting.",
      get checked() {
        return checkboxes.comments;
      },
      set checked($$value) {
        checkboxes.comments = $$value;
        $$settled = false;
      }
    });
    $$payload2.out.push(`<!----> `);
    Checkbox($$payload2, {
      id: "candidates",
      name: "candidates",
      label: "Candidates",
      description: "Get notified when a candidate applies for a job.",
      get checked() {
        return checkboxes.candidates;
      },
      set checked($$value) {
        checkboxes.candidates = $$value;
        $$settled = false;
      }
    });
    $$payload2.out.push(`<!----> `);
    Checkbox($$payload2, {
      id: "offers",
      name: "offers",
      label: "Offers",
      description: "Get notified when a candidate accepts or rejects an offer.",
      get checked() {
        return checkboxes.offers;
      },
      set checked($$value) {
        checkboxes.offers = $$value;
        $$settled = false;
      }
    });
    $$payload2.out.push(`<!----></div></fieldset></div> <div class="mb-8"><h2 class="text-xl font-semibold mb-4">Toggle Component</h2> `);
    Toggle($$payload2, {
      get checked() {
        return toggleState;
      },
      set checked($$value) {
        toggleState = $$value;
        $$settled = false;
      },
      children: ($$payload3) => {
        $$payload3.out.push(`<!---->Enable notifications`);
      },
      $$slots: { default: true }
    });
    $$payload2.out.push(`<!----> <p class="mt-2 text-sm text-gray-600">Toggle is: ${escape_html(toggleState ? "On" : "Off")}</p></div> <div class="mb-8"><h2 class="text-xl font-semibold mb-4">Dialog Component</h2> <button class="rounded-md bg-gray-950/5 px-2.5 py-1.5 text-sm font-semibold text-gray-900 hover:bg-gray-950/10">Open dialog</button></div> <div class="mb-8"><h2 class="text-xl font-semibold mb-4">Table Component</h2> `);
    Table($$payload2, {});
    $$payload2.out.push(`<!----></div></div></main></div></div> `);
    Dialog($$payload2, {
      title: "Payment successful",
      description: "Lorem ipsum, dolor sit amet consectetur adipisicing elit. Eius aliquam laudantium explicabo pariatur iste dolorem animi vitae error totam. At sapiente aliquam accusamus facere veritatis.",
      icon: "success",
      primaryButtonText: "Deactivate",
      secondaryButtonText: "Cancel",
      get open() {
        return showDialog;
      },
      set open($$value) {
        showDialog = $$value;
        $$settled = false;
      }
    });
    $$payload2.out.push(`<!---->`);
  }
  __name($$render_inner, "$$render_inner");
  do {
    $$settled = true;
    $$inner_payload = copy_payload($$payload);
    $$render_inner($$inner_payload);
  } while (!$$settled);
  assign_payload($$payload, $$inner_payload);
}
__name(_page4, "_page4");
var init_page_svelte4 = __esm2({
  ".svelte-kit/output/server/entries/pages/test/components/_page.svelte.js"() {
    init_index2();
    init_internal();
    init_exports2();
    init_state_svelte();
  }
});
var __exports6 = {};
__export2(__exports6, {
  component: () => component6,
  fonts: () => fonts6,
  imports: () => imports6,
  index: () => index6,
  stylesheets: () => stylesheets6
});
var index6;
var component_cache6;
var component6;
var imports6;
var stylesheets6;
var fonts6;
var init__6 = __esm2({
  ".svelte-kit/output/server/nodes/5.js"() {
    index6 = 5;
    component6 = /* @__PURE__ */ __name(async () => component_cache6 ??= (await Promise.resolve().then(() => (init_page_svelte4(), page_svelte_exports4))).default, "component6");
    imports6 = ["_app/immutable/nodes/5.BvwgNBbo.js", "_app/immutable/chunks/Bzak7iHL.js", "_app/immutable/chunks/CwwgXkST.js", "_app/immutable/chunks/BcvnQvbC.js", "_app/immutable/chunks/CL50UZ7u.js", "_app/immutable/chunks/Cx6KAmFa.js", "_app/immutable/chunks/vYyAiFF4.js", "_app/immutable/chunks/BuZd1pjB.js", "_app/immutable/chunks/Bu0e_mbD.js", "_app/immutable/chunks/BZ4fkazW.js", "_app/immutable/chunks/Cl02Xd5o.js", "_app/immutable/chunks/DxdHGLhZ.js", "_app/immutable/chunks/BTISvJJE.js", "_app/immutable/chunks/BRqbiqbO.js", "_app/immutable/chunks/Bog_exwH.js", "_app/immutable/chunks/CVL3Nw5y.js", "_app/immutable/chunks/Bz6AASmr.js"];
    stylesheets6 = [];
    fonts6 = [];
  }
});
var page_svelte_exports5 = {};
__export2(page_svelte_exports5, {
  default: () => _page5
});
function _page5($$payload, $$props) {
  push();
  $$payload.out.push(`<div class="container mx-auto p-6 max-w-6xl"><h1 class="text-2xl font-bold mb-6">Single Line Fit Integration Example</h1> <div class="mb-6 p-4 bg-blue-50 rounded-lg"><h2 class="text-lg font-semibold mb-2">Use Cases for fitSingleLine:</h2> <ul class="list-disc list-inside space-y-1 text-sm"><li>Mishna headers that introduce new sections</li> <li>Rashi/Tosafot headers (\u05D3"\u05D4 lines)</li> <li>Chapter titles or section markers</li> <li>Any text that loses meaning when wrapped</li></ul></div> `);
  {
    $$payload.out.push("<!--[!-->");
    {
      $$payload.out.push("<!--[!-->");
    }
    $$payload.out.push(`<!--]-->`);
  }
  $$payload.out.push(`<!--]--></div>`);
  pop();
}
__name(_page5, "_page5");
var init_page_svelte5 = __esm2({
  ".svelte-kit/output/server/entries/pages/test/fit-integration/_page.svelte.js"() {
    init_index2();
    init_style_manager();
  }
});
var __exports7 = {};
__export2(__exports7, {
  component: () => component7,
  fonts: () => fonts7,
  imports: () => imports7,
  index: () => index7,
  stylesheets: () => stylesheets7
});
var index7;
var component_cache7;
var component7;
var imports7;
var stylesheets7;
var fonts7;
var init__7 = __esm2({
  ".svelte-kit/output/server/nodes/6.js"() {
    index7 = 6;
    component7 = /* @__PURE__ */ __name(async () => component_cache7 ??= (await Promise.resolve().then(() => (init_page_svelte5(), page_svelte_exports5))).default, "component7");
    imports7 = ["_app/immutable/nodes/6.BW4nPEX1.js", "_app/immutable/chunks/Bzak7iHL.js", "_app/immutable/chunks/CwwgXkST.js", "_app/immutable/chunks/BcvnQvbC.js", "_app/immutable/chunks/CL50UZ7u.js", "_app/immutable/chunks/Cx6KAmFa.js", "_app/immutable/chunks/vYyAiFF4.js", "_app/immutable/chunks/Bu0e_mbD.js", "_app/immutable/chunks/CBxTfewZ.js", "_app/immutable/chunks/BZ4fkazW.js", "_app/immutable/chunks/BZap31F1.js", "_app/immutable/chunks/BVeTfFjV.js"];
    stylesheets7 = ["_app/immutable/assets/style-manager.Cfi5m9XR.css", "_app/immutable/assets/6.Dp2dkIgS.css"];
    fonts7 = [];
  }
});
var page_svelte_exports6 = {};
__export2(page_svelte_exports6, {
  default: () => _page6
});
function _page6($$payload, $$props) {
  push();
  let tractate = "Berakhot";
  let daf = "2";
  let loading = false;
  const tractates = [
    { value: "Berakhot", mesechta: "1" },
    { value: "Shabbat", mesechta: "2" },
    { value: "Eruvin", mesechta: "3" },
    { value: "Pesachim", mesechta: "4" },
    { value: "Shekalim", mesechta: "5" },
    { value: "Yoma", mesechta: "6" },
    { value: "Sukkah", mesechta: "7" },
    { value: "Beitzah", mesechta: "8" },
    { value: "Rosh Hashanah", mesechta: "9" },
    { value: "Taanit", mesechta: "10" },
    { value: "Megillah", mesechta: "11" },
    { value: "Moed Katan", mesechta: "12" },
    { value: "Chagigah", mesechta: "13" }
  ];
  const each_array = ensure_array_like(tractates);
  $$payload.out.push(`<div class="container mx-auto p-4 max-w-6xl"><h1 class="text-2xl font-bold mb-4">Daf Line Analysis</h1> <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6"><div class="flex gap-4 items-end"><div><label class="block text-sm font-medium text-gray-700 mb-1">Tractate</label> <select class="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">`);
  $$payload.select_value = tractate;
  $$payload.out.push(`<!--[-->`);
  for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
    let t2 = each_array[$$index];
    $$payload.out.push(`<option${attr("value", t2.value)}${maybe_selected($$payload, t2.value)}>${escape_html(t2.value)}</option>`);
  }
  $$payload.out.push(`<!--]-->`);
  $$payload.select_value = void 0;
  $$payload.out.push(`</select></div> <div><label class="block text-sm font-medium text-gray-700 mb-1">Daf</label> <input type="text"${attr("value", daf)} placeholder="e.g., 2a, 3b" class="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"/></div> <button${attr("disabled", loading, true)} class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">${escape_html("Analyze")}</button></div></div> `);
  {
    $$payload.out.push("<!--[!-->");
  }
  $$payload.out.push(`<!--]--> `);
  {
    $$payload.out.push("<!--[!-->");
  }
  $$payload.out.push(`<!--]--></div>`);
  pop();
}
__name(_page6, "_page6");
var init_page_svelte6 = __esm2({
  ".svelte-kit/output/server/entries/pages/test/lines/_page.svelte.js"() {
    init_index2();
  }
});
var __exports8 = {};
__export2(__exports8, {
  component: () => component8,
  fonts: () => fonts8,
  imports: () => imports8,
  index: () => index8,
  stylesheets: () => stylesheets8
});
var index8;
var component_cache8;
var component8;
var imports8;
var stylesheets8;
var fonts8;
var init__8 = __esm2({
  ".svelte-kit/output/server/nodes/7.js"() {
    index8 = 7;
    component8 = /* @__PURE__ */ __name(async () => component_cache8 ??= (await Promise.resolve().then(() => (init_page_svelte6(), page_svelte_exports6))).default, "component8");
    imports8 = ["_app/immutable/nodes/7.DObUUdpc.js", "_app/immutable/chunks/Bzak7iHL.js", "_app/immutable/chunks/CwwgXkST.js", "_app/immutable/chunks/BcvnQvbC.js", "_app/immutable/chunks/CL50UZ7u.js", "_app/immutable/chunks/Cx6KAmFa.js", "_app/immutable/chunks/vYyAiFF4.js", "_app/immutable/chunks/BuZd1pjB.js", "_app/immutable/chunks/Bz6AASmr.js", "_app/immutable/chunks/DJNVe0AQ.js", "_app/immutable/chunks/BZ4fkazW.js"];
    stylesheets8 = ["_app/immutable/assets/7.CEb9aH0S.css"];
    fonts8 = [];
  }
});
var page_svelte_exports7 = {};
__export2(page_svelte_exports7, {
  default: () => _page7
});
function _page7($$payload, $$props) {
  push();
  let loading = false;
  let mesechta = "1";
  let daf = "3";
  let debugInfo = { apiCalls: [], timings: {} };
  const TRACTATE_MAPPING2 = {
    "1": "Berakhot",
    "2": "Shabbat",
    "3": "Eruvin",
    "4": "Pesachim",
    "5": "Shekalim",
    "6": "Yoma",
    "7": "Sukkah",
    "8": "Beitzah",
    "9": "Rosh Hashanah",
    "10": "Taanit",
    "11": "Megillah",
    "12": "Moed Katan"
  };
  const each_array = ensure_array_like(Object.entries(TRACTATE_MAPPING2));
  head($$payload, ($$payload2) => {
    $$payload2.title = `<title>Talmud Merged API Test</title>`;
  });
  $$payload.out.push(`<div class="max-w-7xl mx-auto p-6"><h1 class="text-3xl font-bold text-gray-800 mb-6">Talmud Merged API Test</h1> <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6"><h2 class="text-lg font-semibold text-gray-800 mb-4">Select Daf</h2> <div class="flex flex-wrap gap-4 items-end"><div><label class="block text-sm font-medium text-gray-700 mb-1">Masechet</label> <select class="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">`);
  $$payload.select_value = mesechta;
  $$payload.out.push(`<!--[-->`);
  for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
    let [value, name] = each_array[$$index];
    $$payload.out.push(`<option${attr("value", value)}${maybe_selected($$payload, value)}>${escape_html(name)}</option>`);
  }
  $$payload.out.push(`<!--]-->`);
  $$payload.select_value = void 0;
  $$payload.out.push(`</select></div> <div><label class="block text-sm font-medium text-gray-700 mb-1">Daf</label> <input type="text"${attr("value", daf)} placeholder="3" class="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 w-20"/></div> <button${attr("disabled", loading, true)} class="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">${escape_html("Fetch Data")}</button></div></div> `);
  {
    $$payload.out.push("<!--[!-->");
  }
  $$payload.out.push(`<!--]--> <div class="bg-white rounded-lg shadow-sm border border-gray-200 mb-6"><button class="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"><h3 class="text-lg font-semibold text-gray-800">Daf-Supplier Settings</h3> <svg${attr_class(`w-5 h-5 text-gray-500 transform transition-transform ${stringify2("")}`)} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg></button> `);
  {
    $$payload.out.push("<!--[!-->");
  }
  $$payload.out.push(`<!--]--></div> <div class="bg-white rounded-lg shadow-sm border border-gray-200 mb-6"><button class="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"><h3 class="text-lg font-semibold text-gray-800">Sefaria API Settings</h3> <svg${attr_class(`w-5 h-5 text-gray-500 transform transition-transform ${stringify2("")}`)} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg></button> `);
  {
    $$payload.out.push("<!--[!-->");
  }
  $$payload.out.push(`<!--]--></div> `);
  {
    $$payload.out.push("<!--[!-->");
  }
  $$payload.out.push(`<!--]--> `);
  if (debugInfo.apiCalls.length > 0) {
    $$payload.out.push("<!--[-->");
    const each_array_1 = ensure_array_like(Object.entries(debugInfo.timings));
    const each_array_2 = ensure_array_like(debugInfo.apiCalls);
    $$payload.out.push(`<details class="mt-8 bg-gray-100 rounded-lg"><summary class="px-6 py-4 cursor-pointer hover:bg-gray-200 rounded-lg font-medium">Debug Information</summary> <div class="px-6 pb-6"><div class="grid grid-cols-1 md:grid-cols-2 gap-6"><div><h3 class="font-medium mb-2">Response Times</h3> <ul class="space-y-1 text-sm"><!--[-->`);
    for (let $$index_1 = 0, $$length = each_array_1.length; $$index_1 < $$length; $$index_1++) {
      let [key2, time3] = each_array_1[$$index_1];
      $$payload.out.push(`<li><span class="font-mono">${escape_html(key2)}:</span> ${escape_html(time3)}ms</li>`);
    }
    $$payload.out.push(`<!--]--></ul></div> <div><h3 class="font-medium mb-2">API Calls Made</h3> <ul class="space-y-2 text-sm"><!--[-->`);
    for (let $$index_2 = 0, $$length = each_array_2.length; $$index_2 < $$length; $$index_2++) {
      let call = each_array_2[$$index_2];
      $$payload.out.push(`<li class="bg-white p-2 rounded border border-gray-200"><strong>${escape_html(call.type)}:</strong> <code class="block mt-1 text-xs bg-gray-50 p-1 rounded overflow-x-auto">${escape_html(call.url)}</code> <span class="text-xs text-gray-500">${escape_html(call.timestamp)}</span></li>`);
    }
    $$payload.out.push(`<!--]--></ul></div></div></div></details>`);
  } else {
    $$payload.out.push("<!--[!-->");
  }
  $$payload.out.push(`<!--]--></div>`);
  pop();
}
__name(_page7, "_page7");
var init_page_svelte7 = __esm2({
  ".svelte-kit/output/server/entries/pages/test/merged-data/_page.svelte.js"() {
    init_index2();
  }
});
var __exports9 = {};
__export2(__exports9, {
  component: () => component9,
  fonts: () => fonts9,
  imports: () => imports9,
  index: () => index9,
  stylesheets: () => stylesheets9
});
var index9;
var component_cache9;
var component9;
var imports9;
var stylesheets9;
var fonts9;
var init__9 = __esm2({
  ".svelte-kit/output/server/nodes/8.js"() {
    index9 = 8;
    component9 = /* @__PURE__ */ __name(async () => component_cache9 ??= (await Promise.resolve().then(() => (init_page_svelte7(), page_svelte_exports7))).default, "component9");
    imports9 = ["_app/immutable/nodes/8.D1VH_NxO.js", "_app/immutable/chunks/Bzak7iHL.js", "_app/immutable/chunks/CwwgXkST.js", "_app/immutable/chunks/BcvnQvbC.js", "_app/immutable/chunks/CL50UZ7u.js", "_app/immutable/chunks/Cx6KAmFa.js", "_app/immutable/chunks/vYyAiFF4.js", "_app/immutable/chunks/5gOCJtLi.js", "_app/immutable/chunks/BuZd1pjB.js", "_app/immutable/chunks/Bu0e_mbD.js", "_app/immutable/chunks/Bz6AASmr.js", "_app/immutable/chunks/DJNVe0AQ.js", "_app/immutable/chunks/BZ4fkazW.js", "_app/immutable/chunks/Cl02Xd5o.js", "_app/immutable/chunks/DxdHGLhZ.js", "_app/immutable/chunks/BTISvJJE.js"];
    stylesheets9 = ["_app/immutable/assets/8.ejDH84Ap.css"];
    fonts9 = [];
  }
});
var page_svelte_exports8 = {};
__export2(page_svelte_exports8, {
  default: () => _page8
});
function _page8($$payload, $$props) {
  push();
  let loading = false;
  let selectedEndpoint = "texts";
  let textRef = "Berakhot.2a";
  let prettyPrint = true;
  let showRawResponse = false;
  const endpoints = {
    texts: {
      name: "Texts API",
      description: "Get text content and metadata",
      url: (params) => `https://www.sefaria.org/api/texts/${params.ref}`,
      params: ["ref"]
    },
    search: {
      name: "Search API",
      description: "Search across all texts",
      url: (params) => `https://www.sefaria.org/api/search-wrapper/_search?q=${encodeURIComponent(params.query)}`,
      params: ["query"]
    },
    index: {
      name: "Index API",
      description: "Get index/table of contents for a text",
      url: (params) => `https://www.sefaria.org/api/index/${params.title}`,
      params: ["title"]
    },
    topics: {
      name: "Topics API",
      description: "Get topic information",
      url: (params) => `https://www.sefaria.org/api/topics/${params.slug}`,
      params: ["slug"]
    },
    links: {
      name: "Links API",
      description: "Get links/connections between texts",
      url: (params) => {
        let url = `https://www.sefaria.org/api/links/${params.ref}`;
        const queryParams = [];
        if (params.type)
          queryParams.push(`type=${params.type}`);
        if (params.direction)
          queryParams.push(`direction=${params.direction}`);
        if (queryParams.length)
          url += "?" + queryParams.join("&");
        return url;
      },
      params: ["ref", "type", "direction"]
    },
    calendars: {
      name: "Calendars API",
      description: "Get calendar/parasha information",
      url: (params) => `https://www.sefaria.org/api/calendars/${params.date}`,
      params: ["date"]
    },
    name: {
      name: "Name API",
      description: "Get information about a person/author",
      url: (params) => `https://www.sefaria.org/api/name/${encodeURIComponent(params.query)}`,
      params: ["query"]
    },
    person: {
      name: "Person API",
      description: "Get detailed person information",
      url: (params) => `https://www.sefaria.org/api/person/${params.key}`,
      params: ["key"]
    },
    collections: {
      name: "Collections API",
      description: "Get collection information",
      url: (params) => `https://www.sefaria.org/api/collections/${params.slug}`,
      params: ["slug"]
    },
    groups: {
      name: "Groups API",
      description: "Get text group information",
      url: (params) => `https://www.sefaria.org/api/groups/${params.name}`,
      params: ["name"]
    },
    terms: {
      name: "Terms API",
      description: "Get term/concept information",
      url: (params) => `https://www.sefaria.org/api/terms/${params.name}`,
      params: ["name"]
    }
  };
  const each_array = ensure_array_like(Object.entries(endpoints));
  $$payload.out.push(`<div class="container svelte-pgbgtb"><h1 class="svelte-pgbgtb">Sefaria API Explorer</h1> <div class="controls svelte-pgbgtb"><div class="endpoint-selector svelte-pgbgtb"><label class="svelte-pgbgtb">Select API Endpoint: <select class="svelte-pgbgtb">`);
  $$payload.select_value = selectedEndpoint;
  $$payload.out.push(`<!--[-->`);
  for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
    let [key2, endpoint] = each_array[$$index];
    $$payload.out.push(`<option${attr("value", key2)}${maybe_selected($$payload, key2)}>${escape_html(endpoint.name)}</option>`);
  }
  $$payload.out.push(`<!--]-->`);
  $$payload.select_value = void 0;
  $$payload.out.push(`</select></label> <p class="description svelte-pgbgtb">${escape_html(endpoints[selectedEndpoint].description)}</p></div> <div class="params svelte-pgbgtb">`);
  {
    $$payload.out.push("<!--[-->");
    $$payload.out.push(`<label class="svelte-pgbgtb">Text Reference: <input type="text"${attr("value", textRef)} placeholder="e.g., Berakhot.2a" class="svelte-pgbgtb"/></label>`);
  }
  $$payload.out.push(`<!--]--></div> <button${attr("disabled", loading, true)} class="svelte-pgbgtb">${escape_html("Test Endpoint")}</button> <div class="options svelte-pgbgtb"><label class="svelte-pgbgtb"><input type="checkbox"${attr("checked", prettyPrint, true)}/> Pretty Print JSON</label> <label class="svelte-pgbgtb"><input type="checkbox"${attr("checked", showRawResponse, true)}/> Show Raw Response</label></div></div> `);
  {
    $$payload.out.push("<!--[!-->");
  }
  $$payload.out.push(`<!--]--> `);
  {
    $$payload.out.push("<!--[!-->");
  }
  $$payload.out.push(`<!--]--></div>`);
  pop();
}
__name(_page8, "_page8");
var init_page_svelte8 = __esm2({
  ".svelte-kit/output/server/entries/pages/test/sefaria/_page.svelte.js"() {
    init_index2();
  }
});
var __exports10 = {};
__export2(__exports10, {
  component: () => component10,
  fonts: () => fonts10,
  imports: () => imports10,
  index: () => index10,
  stylesheets: () => stylesheets10
});
var index10;
var component_cache10;
var component10;
var imports10;
var stylesheets10;
var fonts10;
var init__10 = __esm2({
  ".svelte-kit/output/server/nodes/9.js"() {
    index10 = 9;
    component10 = /* @__PURE__ */ __name(async () => component_cache10 ??= (await Promise.resolve().then(() => (init_page_svelte8(), page_svelte_exports8))).default, "component10");
    imports10 = ["_app/immutable/nodes/9.sAmlu-Gt.js", "_app/immutable/chunks/Dp1pzeXC.js", "_app/immutable/chunks/Bzak7iHL.js", "_app/immutable/chunks/CwwgXkST.js", "_app/immutable/chunks/BcvnQvbC.js", "_app/immutable/chunks/CL50UZ7u.js", "_app/immutable/chunks/Cx6KAmFa.js", "_app/immutable/chunks/vYyAiFF4.js", "_app/immutable/chunks/5gOCJtLi.js", "_app/immutable/chunks/BuZd1pjB.js", "_app/immutable/chunks/Bu0e_mbD.js", "_app/immutable/chunks/Bz6AASmr.js", "_app/immutable/chunks/DJNVe0AQ.js", "_app/immutable/chunks/BZ4fkazW.js"];
    stylesheets10 = ["_app/immutable/assets/9.Bk_hpJW_.css"];
    fonts10 = [];
  }
});
var page_svelte_exports9 = {};
__export2(page_svelte_exports9, {
  default: () => _page9
});
function _page9($$payload, $$props) {
  push();
  let results = [];
  let testText = "\u05D2\u05DE\u05E8\u05D0 \u05DE\u05EA\u05E0\u05D9\u05F3 \u05DE\u05D0\u05D9\u05DE\u05EA\u05D9 \u05E7\u05D5\u05E8\u05D9\u05DF \u05D0\u05EA \u05E9\u05DE\u05E2 \u05D1\u05E2\u05E8\u05D1\u05D9\u05EA \u05DE\u05E9\u05E2\u05D4 \u05E9\u05D4\u05DB\u05D4\u05E0\u05D9\u05DD \u05E0\u05DB\u05E0\u05E1\u05D9\u05DD \u05DC\u05D0\u05DB\u05D5\u05DC \u05D1\u05EA\u05E8\u05D5\u05DE\u05EA\u05DF";
  let baseWidth = 400;
  let baseFontSize = 16;
  let fontFamily = "Frank Ruhl Libre";
  const each_array = ensure_array_like(results);
  $$payload.out.push(`<div class="container mx-auto p-6 max-w-6xl"><h1 class="text-2xl font-bold mb-6">Single Line Fit Helper Test</h1> <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6"><h2 class="text-lg font-semibold mb-4">Test Parameters</h2> <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"><div><label class="block text-sm font-medium text-gray-700 mb-1">Test Text</label> <input type="text"${attr("value", testText)} class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"/></div> <div><label class="block text-sm font-medium text-gray-700 mb-1">Base Width (px)</label> <input type="number"${attr("value", baseWidth)} class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"/></div> <div><label class="block text-sm font-medium text-gray-700 mb-1">Base Font Size (px)</label> <input type="number"${attr("value", baseFontSize)} class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"/></div> <div class="flex items-end"><button class="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">Test Fit</button></div></div></div> <div class="space-y-6"><div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6"><h3 class="text-lg font-semibold mb-3">Original (No Adjustment)</h3> <div class="border-2 border-red-300 p-4 overflow-hidden"><div${attr_style(`font-family: ${stringify2(fontFamily)}; font-size: ${stringify2(baseFontSize)}px; width: ${stringify2(baseWidth)}px; line-height: ${stringify2(baseFontSize * 1.2)}px; direction: rtl;`)} class="mx-auto border border-gray-400">${escape_html(testText)}</div></div> <p class="mt-2 text-sm text-gray-600">Width: ${escape_html(baseWidth)}px | Font Size: ${escape_html(baseFontSize)}px</p></div> <!--[-->`);
  for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
    let result = each_array[$$index];
    $$payload.out.push(`<div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6"><h3 class="text-lg font-semibold mb-3">${escape_html(result.strategy)}</h3> <div${attr_class(`border-2 ${stringify2(result.adjusted ? "border-green-300" : "border-gray-300")} p-4 overflow-hidden`)}><div${attr_style(`font-family: ${stringify2(fontFamily)}; font-size: ${stringify2(result.fontSize)}px; width: ${stringify2(result.width)}px; line-height: ${stringify2(result.fontSize * 1.2)}px; direction: rtl;`)} class="mx-auto border border-gray-400">${escape_html(testText)}</div></div> <div class="mt-3 grid grid-cols-2 gap-4 text-sm"><div><span class="font-medium">Width:</span> ${escape_html(result.width.toFixed(1))}px <span${attr_class(result.widthIncrease > 0 ? "text-orange-600" : "text-gray-500")}>(${escape_html(result.widthIncrease > 0 ? "+" : "")}${escape_html(result.widthIncrease)}%)</span></div> <div><span class="font-medium">Font Size:</span> ${escape_html(result.fontSize.toFixed(1))}px <span${attr_class(result.fontReduction > 0 ? "text-blue-600" : "text-gray-500")}>(-${escape_html(result.fontReduction)}%)</span></div> <div><span class="font-medium">Adjusted:</span> <span${attr_class(result.adjusted ? "text-green-600" : "text-gray-500")}>${escape_html(result.adjusted ? "Yes" : "No")}</span></div> <div><span class="font-medium">Height:</span> ${escape_html(result.actualHeight)}px</div></div></div>`);
  }
  $$payload.out.push(`<!--]--></div></div>`);
  pop();
}
__name(_page9, "_page9");
var init_page_svelte9 = __esm2({
  ".svelte-kit/output/server/entries/pages/test/single-line-fit/_page.svelte.js"() {
    init_index2();
  }
});
var __exports11 = {};
__export2(__exports11, {
  component: () => component11,
  fonts: () => fonts11,
  imports: () => imports11,
  index: () => index11,
  stylesheets: () => stylesheets11
});
var index11;
var component_cache11;
var component11;
var imports11;
var stylesheets11;
var fonts11;
var init__11 = __esm2({
  ".svelte-kit/output/server/nodes/10.js"() {
    index11 = 10;
    component11 = /* @__PURE__ */ __name(async () => component_cache11 ??= (await Promise.resolve().then(() => (init_page_svelte9(), page_svelte_exports9))).default, "component11");
    imports11 = ["_app/immutable/nodes/10.B-8XjyEe.js", "_app/immutable/chunks/Bzak7iHL.js", "_app/immutable/chunks/CwwgXkST.js", "_app/immutable/chunks/BcvnQvbC.js", "_app/immutable/chunks/CL50UZ7u.js", "_app/immutable/chunks/vYyAiFF4.js", "_app/immutable/chunks/BuZd1pjB.js", "_app/immutable/chunks/Bu0e_mbD.js", "_app/immutable/chunks/CBxTfewZ.js", "_app/immutable/chunks/Bz6AASmr.js", "_app/immutable/chunks/Bog_exwH.js", "_app/immutable/chunks/BZ4fkazW.js", "_app/immutable/chunks/BZap31F1.js"];
    stylesheets11 = ["_app/immutable/assets/6.Dp2dkIgS.css"];
    fonts11 = [];
  }
});
var page_svelte_exports10 = {};
__export2(page_svelte_exports10, {
  default: () => _page10
});
function _page10($$payload, $$props) {
  push();
  let tractate = "Berakhot";
  let daf = "2";
  let loading = false;
  let useLineAnalysis = true;
  let useAreaCalculation = false;
  let forceLineBreaks = false;
  let showDebugOverlay = true;
  let useMeasurementBasedCalculation = false;
  const tractates = [
    { value: "Berakhot", mesechta: "1" },
    { value: "Shabbat", mesechta: "2" },
    { value: "Eruvin", mesechta: "3" },
    { value: "Pesachim", mesechta: "4" },
    { value: "Shekalim", mesechta: "5" },
    { value: "Yoma", mesechta: "6" },
    { value: "Sukkah", mesechta: "7" },
    { value: "Beitzah", mesechta: "8" },
    { value: "Rosh Hashanah", mesechta: "9" },
    { value: "Taanit", mesechta: "10" },
    { value: "Megillah", mesechta: "11" },
    { value: "Moed Katan", mesechta: "12" },
    { value: "Chagigah", mesechta: "13" }
  ];
  const each_array = ensure_array_like(tractates);
  $$payload.out.push(`<div class="container mx-auto p-4 max-w-9xl"><h1 class="text-2xl font-bold mb-4">Spacer Calculation Analysis</h1> <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6"><div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"><div><label class="block text-sm font-medium text-gray-700 mb-1">Tractate</label> <select class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">`);
  $$payload.select_value = tractate;
  $$payload.out.push(`<!--[-->`);
  for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
    let t2 = each_array[$$index];
    $$payload.out.push(`<option${attr("value", t2.value)}${maybe_selected($$payload, t2.value)}>${escape_html(t2.value)}</option>`);
  }
  $$payload.out.push(`<!--]-->`);
  $$payload.select_value = void 0;
  $$payload.out.push(`</select></div> <div><label class="block text-sm font-medium text-gray-700 mb-1">Daf</label> <input type="text"${attr("value", daf)} placeholder="e.g., 2a, 3b" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"/></div> <div class="space-y-2"><label class="flex items-center"><input type="checkbox"${attr("checked", useLineAnalysis, true)} class="mr-2"/> <span class="text-sm">Use Line Analysis</span></label> <label class="flex items-center"><input type="checkbox"${attr("checked", useAreaCalculation, true)} class="mr-2"/> <span class="text-sm">Use Area Calculation</span></label> <label class="flex items-center"><input type="checkbox"${attr("checked", forceLineBreaks, true)} class="mr-2"/> <span class="text-sm">Force Line Breaks</span></label> <label class="flex items-center"><input type="checkbox"${attr("checked", useMeasurementBasedCalculation, true)} class="mr-2"${attr("disabled", !forceLineBreaks, true)}/> <span${attr_class(`text-sm ${stringify2("text-gray-400")}`)}>Use Measurement-Based Calculation</span></label> <label class="flex items-center"><input type="checkbox"${attr("checked", showDebugOverlay, true)} class="mr-2"/> <span class="text-sm">Show Debug Overlay</span></label></div> <div class="flex items-end"><button${attr("disabled", loading, true)} class="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">${escape_html("Analyze")}</button></div></div></div> `);
  {
    $$payload.out.push("<!--[!-->");
  }
  $$payload.out.push(`<!--]--> <div class="grid grid-cols-1 lg:grid-cols-2 gap-6"><div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4 overflow-hidden"><h2 class="text-lg font-semibold mb-3">Rendered Page</h2> <div class="overflow-x-auto overflow-y-hidden"><div${attr_class(`daf-container ${stringify2("debug-overlay")}`)} style="width: 800px; margin: 0 auto; max-width: 100%;"></div></div></div> `);
  {
    $$payload.out.push("<!--[!-->");
  }
  $$payload.out.push(`<!--]--></div></div>`);
  pop();
}
__name(_page10, "_page10");
var init_page_svelte10 = __esm2({
  ".svelte-kit/output/server/entries/pages/test/spacer-analysis/_page.svelte.js"() {
    init_index2();
    init_style_manager();
  }
});
var __exports12 = {};
__export2(__exports12, {
  component: () => component12,
  fonts: () => fonts12,
  imports: () => imports12,
  index: () => index12,
  stylesheets: () => stylesheets12
});
var index12;
var component_cache12;
var component12;
var imports12;
var stylesheets12;
var fonts12;
var init__12 = __esm2({
  ".svelte-kit/output/server/nodes/11.js"() {
    index12 = 11;
    component12 = /* @__PURE__ */ __name(async () => component_cache12 ??= (await Promise.resolve().then(() => (init_page_svelte10(), page_svelte_exports10))).default, "component12");
    imports12 = ["_app/immutable/nodes/11.DfuFKOkQ.js", "_app/immutable/chunks/Bzak7iHL.js", "_app/immutable/chunks/CwwgXkST.js", "_app/immutable/chunks/BcvnQvbC.js", "_app/immutable/chunks/CL50UZ7u.js", "_app/immutable/chunks/Cx6KAmFa.js", "_app/immutable/chunks/vYyAiFF4.js", "_app/immutable/chunks/BuZd1pjB.js", "_app/immutable/chunks/Bu0e_mbD.js", "_app/immutable/chunks/Bz6AASmr.js", "_app/immutable/chunks/DJNVe0AQ.js", "_app/immutable/chunks/Bog_exwH.js", "_app/immutable/chunks/BZ4fkazW.js", "_app/immutable/chunks/CyRBKZ3g.js", "_app/immutable/chunks/BZap31F1.js", "_app/immutable/chunks/BVeTfFjV.js"];
    stylesheets12 = ["_app/immutable/assets/style-manager.Cfi5m9XR.css", "_app/immutable/assets/11.D7pBf3C2.css"];
    fonts12 = [];
  }
});
var server_ts_exports = {};
__export2(server_ts_exports, {
  GET: () => GET
});
var GET;
var init_server_ts = __esm2({
  ".svelte-kit/output/server/entries/endpoints/api/hebrewbooks/_server.ts.js"() {
    init_exports();
    init_hebrewbooks();
    GET = /* @__PURE__ */ __name(async ({ url, platform: platform2 }) => {
      const tractate = url.searchParams.get("tractate");
      const daf = url.searchParams.get("daf");
      const mesechta = url.searchParams.get("mesechta");
      if (!daf || !tractate && !mesechta) {
        return json({ error: "Missing required parameters: tractate/mesechta and daf" }, { status: 400 });
      }
      let mesechtaId;
      if (mesechta) {
        mesechtaId = parseInt(mesechta);
      } else if (tractate) {
        mesechtaId = TRACTATE_IDS[tractate];
        if (!mesechtaId) {
          return json({ error: `Unknown tractate: ${tractate}` }, { status: 400 });
        }
      } else {
        return json({ error: "Must provide either tractate name or mesechta ID" }, { status: 400 });
      }
      const dafNum = parseInt(daf);
      if (isNaN(mesechtaId) || isNaN(dafNum)) {
        return json({ error: "Invalid mesechta or daf number" }, { status: 400 });
      }
      try {
        const targetUrl = `https://www.hebrewbooks.org/shas.aspx?mesechta=${mesechtaId}&daf=${dafNum}&format=text`;
        console.log("Fetching from HebrewBooks:", targetUrl);
        try {
          const response = await fetch(targetUrl, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
              "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
              "Accept-Language": "en-US,en;q=0.5",
              "Accept-Encoding": "gzip, deflate, br",
              "Connection": "keep-alive",
              "Upgrade-Insecure-Requests": "1"
            }
          });
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          const html = await response.text();
          const cleanText = /* @__PURE__ */ __name((text2) => {
            return text2 ? text2.trim() : "";
          }, "cleanText");
          const data = {
            mainText: "",
            rashi: "",
            tosafot: "",
            otherCommentaries: {}
          };
          if (html.includes("rashi;") || html.includes("tosafot:")) {
            const parts = html.split(/rashi[;:]/i);
            if (parts.length > 0) {
              data.mainText = cleanText(parts[0]);
            }
            if (parts.length > 1) {
              const rashiAndTosafot = parts[1].split(/tosafot[;:]/i);
              if (rashiAndTosafot.length > 0) {
                data.rashi = cleanText(rashiAndTosafot[0]);
              }
              if (rashiAndTosafot.length > 1) {
                data.tosafot = cleanText(rashiAndTosafot[1]);
              }
            }
          } else {
            data.mainText = cleanText(html);
          }
          const tractateData = Object.entries(TRACTATE_IDS).find(([_, id]) => id === mesechtaId);
          return json({
            tractate: tractateData?.[0] || `Tractate-${mesechtaId}`,
            daf: Math.ceil(dafNum / 2).toString(),
            amud: dafNum % 2 === 0 ? "b" : "a",
            ...data,
            timestamp: Date.now(),
            source: "hebrewbooks.org"
          });
        } catch (fetchError) {
          console.error("Direct fetch failed (expected in development due to CORS):", fetchError);
          const tractateData = Object.entries(TRACTATE_IDS).find(([_, id]) => id === mesechtaId);
          const mockData = {
            tractate: tractateData?.[0] || `Tractate-${mesechtaId}`,
            daf: Math.ceil(dafNum / 2).toString(),
            amud: dafNum % 2 === 0 ? "b" : "a",
            mainText: `\u05D2\u05DE\u05E8\u05D0: ${tractateData?.[0] || "\u05DE\u05E1\u05DB\u05EA"} \u05D3\u05E3 ${Math.ceil(dafNum / 2)} \u05E2\u05DE\u05D5\u05D3 ${dafNum % 2 === 0 ? "\u05D1" : "\u05D0"}

\u05EA\u05E0\u05D5 \u05E8\u05D1\u05E0\u05DF: \u05E9\u05DC\u05E9\u05D4 \u05D3\u05D1\u05E8\u05D9\u05DD \u05E6\u05E8\u05D9\u05DA \u05D0\u05D3\u05DD \u05DC\u05D5\u05DE\u05E8 \u05D1\u05EA\u05D5\u05DA \u05D1\u05D9\u05EA\u05D5 \u05E2\u05E8\u05D1 \u05E9\u05D1\u05EA \u05E2\u05DD \u05D7\u05E9\u05DB\u05D4: \u05E2\u05E9\u05E8\u05EA\u05DD, \u05E2\u05E8\u05D1\u05EA\u05DD, \u05D4\u05D3\u05DC\u05D9\u05E7\u05D5 \u05D0\u05EA \u05D4\u05E0\u05E8.

\u05E1\u05E4\u05E7 \u05D7\u05E9\u05DB\u05D4 \u05E1\u05E4\u05E7 \u05D0\u05D9\u05E0\u05D4 \u05D7\u05E9\u05DB\u05D4 - \u05D0\u05D9\u05DF \u05DE\u05E2\u05E9\u05E8\u05D9\u05DF \u05D0\u05EA \u05D4\u05D5\u05D3\u05D0\u05D9, \u05D5\u05D0\u05D9\u05DF \u05DE\u05D8\u05D1\u05D9\u05DC\u05D9\u05DF \u05D0\u05EA \u05D4\u05DB\u05DC\u05D9\u05DD, \u05D5\u05D0\u05D9\u05DF \u05DE\u05D3\u05DC\u05D9\u05E7\u05D9\u05DF \u05D0\u05EA \u05D4\u05E0\u05E8\u05D5\u05EA. \u05D0\u05D1\u05DC \u05DE\u05E2\u05E9\u05E8\u05D9\u05DF \u05D0\u05EA \u05D4\u05D3\u05DE\u05D0\u05D9, \u05D5\u05DE\u05E2\u05E8\u05D1\u05D9\u05DF, \u05D5\u05D8\u05D5\u05DE\u05E0\u05D9\u05DF \u05D0\u05EA \u05D4\u05D7\u05DE\u05D9\u05DF.`,
            rashi: `\u05E8\u05E9"\u05D9: \u05E2\u05E9\u05E8\u05EA\u05DD - \u05DE\u05E2\u05E9\u05E8 \u05EA\u05D1\u05D5\u05D0\u05D4 \u05E9\u05DC\u05D0 \u05E2\u05D9\u05E9\u05E8\u05EA\u05DD. \u05E2\u05E8\u05D1\u05EA\u05DD - \u05E2\u05D9\u05E8\u05D5\u05D1\u05D9 \u05D7\u05E6\u05E8\u05D5\u05EA. \u05D4\u05D3\u05DC\u05D9\u05E7\u05D5 \u05D0\u05EA \u05D4\u05E0\u05E8 - \u05E0\u05E8 \u05E9\u05DC \u05E9\u05D1\u05EA.

\u05E1\u05E4\u05E7 \u05D7\u05E9\u05DB\u05D4 - \u05E1\u05E4\u05E7 \u05D9\u05D5\u05DD \u05E1\u05E4\u05E7 \u05DC\u05D9\u05DC\u05D4.

\u05D0\u05D9\u05DF \u05DE\u05E2\u05E9\u05E8\u05D9\u05DF \u05D0\u05EA \u05D4\u05D5\u05D3\u05D0\u05D9 - \u05D3\u05DE\u05DC\u05D0\u05DB\u05D4 \u05D4\u05D9\u05D0, \u05D5\u05D0\u05E1\u05D5\u05E8 \u05DC\u05E2\u05E9\u05D5\u05EA \u05DE\u05DC\u05D0\u05DB\u05D4 \u05D1\u05E9\u05D1\u05EA.`,
            tosafot: `\u05EA\u05D5\u05E1\u05E4\u05D5\u05EA: \u05EA\u05E0\u05D5 \u05E8\u05D1\u05E0\u05DF \u05E9\u05DC\u05E9\u05D4 \u05D3\u05D1\u05E8\u05D9\u05DD - \u05E4\u05D9\u05E8\u05E9 \u05D1\u05D9\u05E8\u05D5\u05E9\u05DC\u05DE\u05D9 \u05D8\u05E2\u05DE\u05D0 \u05DE\u05E9\u05D5\u05DD \u05D3\u05D0\u05D9\u05EA\u05E0\u05D4\u05D5 \u05D1\u05E9\u05DB\u05D7\u05D4, \u05D5\u05D0\u05D9 \u05DC\u05D0 \u05DE\u05D3\u05DB\u05E8 \u05DC\u05D4\u05D5 \u05D0\u05EA\u05D9 \u05DC\u05D0\u05EA\u05D5\u05D9\u05D9 \u05DC\u05D9\u05D3\u05D9 \u05D0\u05D9\u05E1\u05D5\u05E8\u05D0.

\u05D5\u05E2\u05E9\u05E8\u05EA\u05DD - \u05D3\u05D5\u05E7\u05D0 \u05EA\u05D1\u05D5\u05D0\u05D4 \u05D3\u05D0\u05D5\u05E8\u05D9\u05D9\u05EA\u05D0, \u05D0\u05D1\u05DC \u05D3\u05DE\u05D0\u05D9 \u05E9\u05E8\u05D9 \u05D0\u05E4\u05D9\u05DC\u05D5 \u05D1\u05E9\u05D1\u05EA \u05D2\u05D5\u05E4\u05D4.`,
            timestamp: Date.now(),
            error: "CORS prevented direct fetch. Deploy to Cloudflare Workers for full functionality.",
            note: "Fallback mock data - real scraping requires Cloudflare Browser Rendering"
          };
          return json(mockData);
        }
      } catch (error22) {
        console.error("Error in HebrewBooks API:", error22);
        return json({ error: "Internal server error" }, { status: 500 });
      }
    }, "GET");
  }
});
var server_ts_exports2 = {};
__export2(server_ts_exports2, {
  GET: () => GET2
});
async function getCachedStories(cacheKey, forceRefresh = false) {
  if (forceRefresh) {
    console.log("\u{1F504} Force refresh requested, skipping cache:", cacheKey);
    return null;
  }
  if (isCloudflareWorkers) {
    try {
      if (typeof STORIES_KV !== "undefined") {
        const cached2 = await STORIES_KV.get(cacheKey);
        if (cached2) {
          const parsedCache = JSON.parse(cached2);
          console.log("\u{1F4DA} Stories cache hit (KV):", cacheKey);
          return parsedCache.data;
        }
      }
    } catch (error22) {
      console.warn("KV stories cache read failed:", error22);
    }
  }
  const cached = memoryCache.get(cacheKey);
  if (cached) {
    console.log("\u{1F4DA} Stories cache hit (memory):", cacheKey);
    return cached.data;
  }
  console.log("\u{1F50D} Stories cache miss:", cacheKey);
  return null;
}
__name(getCachedStories, "getCachedStories");
async function setCachedStories(cacheKey, data) {
  const cacheData = {
    data,
    timestamp: Date.now()
  };
  if (isCloudflareWorkers) {
    try {
      if (typeof STORIES_KV !== "undefined") {
        await STORIES_KV.put(cacheKey, JSON.stringify(cacheData));
        console.log("\u{1F4BE} Stories cached to KV (permanent):", cacheKey);
        return;
      }
    } catch (error22) {
      console.warn("KV stories cache write failed:", error22);
    }
  }
  memoryCache.set(cacheKey, cacheData);
  console.log("\u{1F4BE} Stories cached to memory (permanent):", cacheKey);
}
__name(setCachedStories, "setCachedStories");
var isCloudflareWorkers;
var CACHE_PREFIX;
var memoryCache;
var GET2;
var init_server_ts2 = __esm2({
  ".svelte-kit/output/server/entries/endpoints/api/stories/_server.ts.js"() {
    init_exports();
    init_openrouter_translator();
    isCloudflareWorkers = typeof caches !== "undefined";
    CACHE_PREFIX = "talmud-stories:";
    memoryCache = /* @__PURE__ */ new Map();
    GET2 = /* @__PURE__ */ __name(async ({ url, fetch: fetch2 }) => {
      const tractate = url.searchParams.get("tractate");
      const page2 = url.searchParams.get("page");
      const amud = url.searchParams.get("amud");
      const refresh = url.searchParams.get("refresh") === "true";
      if (!tractate || !page2 || !amud) {
        return json({ error: "Missing required parameters: tractate, page, amud" }, { status: 400 });
      }
      const cacheKey = `${CACHE_PREFIX}${tractate}:${page2}${amud}`;
      try {
        const cachedStories = await getCachedStories(cacheKey, refresh);
        if (cachedStories) {
          return json({
            ...cachedStories,
            cached: true,
            cacheKey
          });
        }
        if (!openRouterTranslator.isConfigured()) {
          return json({ error: "OpenRouter API not configured" }, { status: 503 });
        }
        const tractateMap = {
          "Berakhot": "1",
          "Shabbat": "2",
          "Eruvin": "3",
          "Pesachim": "4",
          "Shekalim": "5",
          "Yoma": "6",
          "Sukkah": "7",
          "Beitzah": "8",
          "Rosh Hashanah": "9",
          "Taanit": "10",
          "Megillah": "11",
          "Moed Katan": "12",
          "Chagigah": "13",
          "Yevamot": "14",
          "Ketubot": "15",
          "Nedarim": "16",
          "Nazir": "17",
          "Sotah": "18",
          "Gittin": "19",
          "Kiddushin": "20",
          "Bava Kamma": "21",
          "Bava Metzia": "22",
          "Bava Batra": "23",
          "Sanhedrin": "24",
          "Makkot": "25",
          "Shevuot": "26",
          "Avodah Zarah": "27",
          "Horayot": "28",
          "Zevachim": "29",
          "Menachot": "30",
          "Chullin": "31",
          "Bekhorot": "32",
          "Arakhin": "33",
          "Temurah": "34",
          "Keritot": "35",
          "Meilah": "36",
          "Niddah": "37"
        };
        const mesechta = tractateMap[tractate];
        if (!mesechta) {
          return json({ error: `Unknown tractate: ${tractate}` }, { status: 400 });
        }
        const dafForAPI = `${page2}${amud}`;
        const talmudResponse = await fetch2(`/api/talmud-merged?mesechta=${mesechta}&daf=${dafForAPI}`);
        if (!talmudResponse.ok) {
          throw new Error(`Failed to fetch Talmud data: ${talmudResponse.status}`);
        }
        const talmudData = await talmudResponse.json();
        const mainText = talmudData.mainText || "";
        const rashiText = talmudData.rashi || "";
        const tosafotText = talmudData.tosafot || "";
        if (!mainText || mainText.length < 100) {
          return json({ error: "Insufficient content for story generation" }, { status: 400 });
        }
        const contextInfo = `${tractate} ${page2}${amud}`;
        const storyPrompts = [
          {
            type: "main-discussion",
            title: "The Core Discussion",
            prompt: `Write an educational story about the main discussion from ${contextInfo}. Dive directly into the content without meta-commentary or introductory phrases like "Here's a narrative" or "This story focuses on."

Your story should teach:
1. The main argument/question being resolved
2. The specific rabbis involved with historical context about who they were
3. Their different positions and why they disagree
4. Historical/cultural context that makes this discussion matter
5. How their approaches reflect their broader legal philosophies

Write 800-1200 words making the rabbis come alive as real people. Help readers understand not just WHAT they argued, but WHY they argued it and what it reveals about their thinking.

Choose the most significant discussion from this text:

Main Text: ${mainText.slice(0, 4e3)}

${rashiText ? `Rashi Commentary: ${rashiText.slice(0, 1500)}` : ""}

${tosafotText ? `Tosafot Commentary: ${tosafotText.slice(0, 1500)}` : ""}

Begin directly with the story content.`
          },
          {
            type: "historical-context",
            title: "Historical Deep Dive",
            prompt: `Write a historical story about the main discussion from ${contextInfo}. Start directly with the narrative content, avoiding introductory phrases.

Your story should educate about:
1. The historical period and circumstances of this discussion
2. Social, political, and religious context that made this question important
3. Biographical backgrounds of the key rabbis
4. How their experiences shaped their legal opinions
5. Why this question was debated and its practical implications
6. Connections to broader themes in Jewish law

Write 800-1200 words painting a vivid picture of the ancient world while explaining the legal reasoning. Make readers feel they're witnessing these great minds in their historical context.

Main Text: ${mainText.slice(0, 4e3)}

Begin immediately with the historical narrative.`
          },
          {
            type: "rabbi-profiles",
            title: "The Personalities Behind the Debate",
            prompt: `Write a character study of the rabbis in the main discussion from ${contextInfo}. Jump directly into the character profiles without preamble.

Your narrative should reveal:
1. Who the main rabbis are and their personalities
2. Their different approaches to legal reasoning
3. Other famous opinions showing their consistent approaches
4. How their backgrounds influenced their thinking
5. What their arguments reveal about their judicial philosophies
6. How their different approaches create productive tension

Write 800-1200 words making these ancient sages come alive as distinct thinkers. Help students recognize their "voices" and understand how different minds approach problems.

Main Text: ${mainText.slice(0, 4e3)}

Start directly with the character profiles.`
          }
        ];
        console.log("\u{1F3AD} Generating educational stories for", contextInfo);
        const storyResults = await Promise.all(
          storyPrompts.map(async ({ type, title: title2, prompt }) => {
            try {
              console.log(`\u{1F4DD} Generating ${type} story...`);
              const result = await fetch2("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                  "Authorization": `Bearer ${PUBLIC_OPENROUTER_API_KEY || ""}`,
                  "Content-Type": "application/json",
                  "HTTP-Referer": "https://talmud.app",
                  "X-Title": "Talmud Study App - Stories"
                },
                body: JSON.stringify({
                  model: "anthropic/claude-sonnet-4",
                  // Use the most advanced model
                  messages: [
                    {
                      role: "system",
                      content: `You are an expert Talmud teacher creating educational narratives. Write engaging stories that help students understand Jewish legal discussions. Start directly with the story content - no meta-commentary about "Here's a narrative" or similar introductions. Focus on accuracy while making content memorable.`
                    },
                    { role: "user", content: prompt }
                  ],
                  temperature: 0.7,
                  // Higher creativity for stories
                  max_tokens: 2e3
                  // Allow for longer stories
                })
              });
              if (!result.ok) {
                throw new Error(`OpenRouter API error: ${result.status}`);
              }
              const data = await result.json();
              const story = data.choices[0]?.message?.content?.trim() || "";
              console.log(`\u2705 Generated ${type} story: ${story.length} characters`);
              return {
                type,
                title: title2,
                content: story,
                wordCount: story.split(/\s+/).length,
                model: data.model || "anthropic/claude-sonnet-4"
              };
            } catch (err) {
              console.error(`Failed to generate ${type} story:`, err);
              return {
                type,
                title: title2,
                content: `Failed to generate ${title2.toLowerCase()}. Please try again.`,
                wordCount: 0,
                model: "error"
              };
            }
          })
        );
        const storiesData = {
          tractate,
          page: page2,
          amud,
          stories: storyResults,
          generated: (/* @__PURE__ */ new Date()).toISOString(),
          totalWords: storyResults.reduce((sum, story) => sum + story.wordCount, 0)
        };
        await setCachedStories(cacheKey, storiesData);
        return json({
          ...storiesData,
          cached: false,
          cacheKey
        });
      } catch (error22) {
        console.error("Story generation error:", error22);
        return json({
          error: "Failed to generate stories",
          details: error22 instanceof Error ? error22.message : String(error22)
        }, { status: 500 });
      }
    }, "GET2");
  }
});
var server_ts_exports3 = {};
__export2(server_ts_exports3, {
  GET: () => GET3
});
async function getCachedSummary(cacheKey) {
  if (isCloudflareWorkers2) {
    try {
      if (typeof SUMMARIES_KV !== "undefined") {
        const cached2 = await SUMMARIES_KV.get(cacheKey);
        if (cached2) {
          const parsedCache = JSON.parse(cached2);
          if (Date.now() - parsedCache.timestamp < CACHE_DURATION) {
            return parsedCache.data;
          } else {
            await SUMMARIES_KV.delete(cacheKey);
          }
        }
      }
    } catch (error22) {
    }
  }
  const cached = memoryCache2.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }
  return null;
}
__name(getCachedSummary, "getCachedSummary");
async function setCachedSummary(cacheKey, data) {
  const cacheData = {
    data,
    timestamp: Date.now()
  };
  if (isCloudflareWorkers2) {
    try {
      if (typeof SUMMARIES_KV !== "undefined") {
        await SUMMARIES_KV.put(cacheKey, JSON.stringify(cacheData), {
          expirationTtl: Math.floor(CACHE_DURATION / 1e3)
          // KV expects seconds
        });
        return;
      }
    } catch (error22) {
    }
  }
  memoryCache2.set(cacheKey, cacheData);
}
__name(setCachedSummary, "setCachedSummary");
var isCloudflareWorkers2;
var CACHE_DURATION;
var CACHE_PREFIX2;
var memoryCache2;
var GET3;
var init_server_ts3 = __esm2({
  ".svelte-kit/output/server/entries/endpoints/api/summary/_server.ts.js"() {
    init_exports();
    init_openrouter_translator();
    isCloudflareWorkers2 = typeof caches !== "undefined";
    CACHE_DURATION = 24 * 60 * 60 * 1e3;
    CACHE_PREFIX2 = "talmud-summary:";
    memoryCache2 = /* @__PURE__ */ new Map();
    GET3 = /* @__PURE__ */ __name(async ({ url, fetch: fetch2 }) => {
      const tractate = url.searchParams.get("tractate");
      const page2 = url.searchParams.get("page");
      const amud = url.searchParams.get("amud");
      if (!tractate || !page2 || !amud) {
        return json({ error: "Missing required parameters: tractate, page, amud" }, { status: 400 });
      }
      const cacheKey = `${CACHE_PREFIX2}${tractate}:${page2}${amud}`;
      try {
        const cachedSummary = await getCachedSummary(cacheKey);
        if (cachedSummary) {
          return json({
            ...cachedSummary,
            cached: true,
            cacheKey
          });
        }
        if (!openRouterTranslator.isConfigured()) {
          return json({ error: "OpenRouter API not configured" }, { status: 503 });
        }
        const tractateMap = {
          "Berakhot": "1",
          "Shabbat": "2",
          "Eruvin": "3",
          "Pesachim": "4",
          "Shekalim": "5",
          "Yoma": "6",
          "Sukkah": "7",
          "Beitzah": "8",
          "Rosh Hashanah": "9",
          "Taanit": "10",
          "Megillah": "11",
          "Moed Katan": "12",
          "Chagigah": "13",
          "Yevamot": "14",
          "Ketubot": "15",
          "Nedarim": "16",
          "Nazir": "17",
          "Sotah": "18",
          "Gittin": "19",
          "Kiddushin": "20",
          "Bava Kamma": "21",
          "Bava Metzia": "22",
          "Bava Batra": "23",
          "Sanhedrin": "24",
          "Makkot": "25",
          "Shevuot": "26",
          "Avodah Zarah": "27",
          "Horayot": "28",
          "Zevachim": "29",
          "Menachot": "30",
          "Chullin": "31",
          "Bekhorot": "32",
          "Arakhin": "33",
          "Temurah": "34",
          "Keritot": "35",
          "Meilah": "36",
          "Niddah": "37"
        };
        const mesechta = tractateMap[tractate];
        if (!mesechta) {
          return json({ error: `Unknown tractate: ${tractate}` }, { status: 400 });
        }
        const dafForAPI = `${page2}${amud}`;
        const talmudResponse = await fetch2(`/api/talmud-merged?mesechta=${mesechta}&daf=${dafForAPI}`);
        if (!talmudResponse.ok) {
          throw new Error(`Failed to fetch Talmud data: ${talmudResponse.status}`);
        }
        const talmudData = await talmudResponse.json();
        const mainText = talmudData.mainText || "";
        if (!mainText || mainText.length < 50) {
          return json({ error: "Insufficient content for summary generation" }, { status: 400 });
        }
        const contextInfo = `${tractate} ${page2}${amud}`;
        const summaryPrompt = `You are analyzing a page from the Talmud (${contextInfo}). Create an engaging, accessible summary that brings this ancient discussion to life for modern readers.

Focus on making the content compelling by highlighting:
\u2022 The central question or dilemma being explored
\u2022 The brilliant reasoning and arguments from different rabbis
\u2022 How their debate reflects timeless human concerns
\u2022 Any surprising insights or unexpected connections
\u2022 The practical impact on Jewish life and law
\u2022 Why this conversation matters today

Write 2-3 engaging paragraphs that would make someone excited to study this page deeper. Make the rabbis feel like real people having a fascinating intellectual conversation.

Talmud text: ${mainText.slice(0, 3e3)}`;
        const response = await fetch2("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${PUBLIC_OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://talmud.app",
            "X-Title": "Talmud Study App"
          },
          body: JSON.stringify({
            model: "anthropic/claude-sonnet-4",
            messages: [
              { role: "user", content: summaryPrompt }
            ],
            temperature: 0.7,
            // Higher temperature for more engaging content
            max_tokens: 800
          })
        });
        if (!response.ok) {
          throw new Error(`OpenRouter API error: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        const summaryResult = {
          translation: data.choices[0]?.message?.content?.trim() || "",
          model: data.model || "anthropic/claude-sonnet-4"
        };
        const summaryData = {
          tractate,
          page: page2,
          amud,
          summary: summaryResult.translation,
          model: summaryResult.model,
          generated: (/* @__PURE__ */ new Date()).toISOString(),
          wordCount: summaryResult.translation.split(/\s+/).length
        };
        await setCachedSummary(cacheKey, summaryData);
        return json({
          ...summaryData,
          cached: false,
          cacheKey
        });
      } catch (error22) {
        return json({
          error: "Failed to generate summary",
          details: error22 instanceof Error ? error22.message : String(error22)
        }, { status: 500 });
      }
    }, "GET3");
  }
});
var server_ts_exports4 = {};
__export2(server_ts_exports4, {
  DELETE: () => DELETE
});
var isCloudflareWorkers3;
var DELETE;
var init_server_ts4 = __esm2({
  ".svelte-kit/output/server/entries/endpoints/api/summary/clear-cache/_server.ts.js"() {
    init_exports();
    isCloudflareWorkers3 = typeof caches !== "undefined";
    DELETE = /* @__PURE__ */ __name(async () => {
      let cleared = 0;
      try {
        if (isCloudflareWorkers3) {
          if (typeof SUMMARIES_KV !== "undefined") {
            const list = await SUMMARIES_KV.list({ prefix: "talmud-summary:" });
            for (const key2 of list.keys) {
              await SUMMARIES_KV.delete(key2.name);
              cleared++;
            }
          }
        }
        return json({
          success: true,
          message: `Cleared ${cleared} cached summaries`,
          cleared
        });
      } catch (error22) {
        return json({
          success: false,
          error: "Failed to clear cache",
          details: error22 instanceof Error ? error22.message : String(error22)
        }, { status: 500 });
      }
    }, "DELETE");
  }
});
var server_ts_exports5 = {};
__export2(server_ts_exports5, {
  GET: () => GET4
});
function normalizeForComparison(text2) {
  let normalized = text2.replace(/[\u0591-\u05C7]/g, "");
  normalized = normalized.replace(/[״""״]/g, '"').replace(/[׳''׳]/g, "'");
  for (const [abbrev, full] of HEBREW_ABBREVIATIONS) {
    normalized = normalized.replace(new RegExp(abbrev, "g"), full);
  }
  return normalized;
}
__name(normalizeForComparison, "normalizeForComparison");
function tokenizeWithSpaces(text2) {
  const tokens = [];
  const separatorPattern = /(\r\n|\r|\n|<br\s*\/?>|\|)/gi;
  const parts = text2.split(separatorPattern);
  for (const part of parts) {
    if (part.match(separatorPattern)) {
      tokens.push(part);
    } else {
      const wordBoundary = /(\s+)/;
      const words = part.split(wordBoundary);
      for (const word of words) {
        if (word) {
          tokens.push(word);
        }
      }
    }
  }
  return tokens;
}
__name(tokenizeWithSpaces, "tokenizeWithSpaces");
function areTokensEquivalent(token1, token2) {
  const separatorPattern = /^(\r\n|\r|\n|<br\s*\/?>|\|)$/i;
  if (token1.match(separatorPattern) && token2.match(separatorPattern)) {
    return true;
  }
  return token1 === token2;
}
__name(areTokensEquivalent, "areTokensEquivalent");
function areWordsSimilar(word1, word2) {
  if (word1 === word2)
    return true;
  if (!word1.trim() || !word2.trim())
    return word1 === word2;
  const norm1 = normalizeForComparison(word1);
  const norm2 = normalizeForComparison(word2);
  if (norm1 === norm2)
    return true;
  const distance = levenshteinDistance(norm1, norm2);
  const maxLen = Math.max(norm1.length, norm2.length);
  if (maxLen === 0)
    return true;
  const similarity = 1 - distance / maxLen;
  return similarity > 0.85;
}
__name(areWordsSimilar, "areWordsSimilar");
function levenshteinDistance(str1, str2) {
  const m = str1.length;
  const n2 = str2.length;
  const dp = Array(m + 1).fill(null).map(() => Array(n2 + 1).fill(0));
  for (let i = 0; i <= m; i++)
    dp[i][0] = i;
  for (let j = 0; j <= n2; j++)
    dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n2; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          // deletion
          dp[i][j - 1] + 1,
          // insertion
          dp[i - 1][j - 1] + 1
          // substitution
        );
      }
    }
  }
  return dp[m][n2];
}
__name(levenshteinDistance, "levenshteinDistance");
function diffHebrewTexts(text1, text2) {
  const tokens1 = tokenizeWithSpaces(text1);
  const tokens2 = tokenizeWithSpaces(text2);
  const m = tokens1.length;
  const n2 = tokens2.length;
  const lcs = Array(m + 1).fill(null).map(() => Array(n2 + 1).fill(0));
  for (let i2 = 1; i2 <= m; i2++) {
    for (let j2 = 1; j2 <= n2; j2++) {
      if (areTokensEquivalent(tokens1[i2 - 1], tokens2[j2 - 1]) || areWordsSimilar(tokens1[i2 - 1], tokens2[j2 - 1])) {
        lcs[i2][j2] = lcs[i2 - 1][j2 - 1] + 1;
      } else {
        lcs[i2][j2] = Math.max(lcs[i2 - 1][j2], lcs[i2][j2 - 1]);
      }
    }
  }
  let i = m, j = n2;
  const result = [];
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && (areTokensEquivalent(tokens1[i - 1], tokens2[j - 1]) || areWordsSimilar(tokens1[i - 1], tokens2[j - 1]))) {
      result.unshift({ value: tokens2[j - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || lcs[i][j - 1] >= lcs[i - 1][j])) {
      result.unshift({ value: tokens2[j - 1], added: true });
      j--;
    } else if (i > 0) {
      result.unshift({ value: tokens1[i - 1], removed: true });
      i--;
    }
  }
  return result;
}
__name(diffHebrewTexts, "diffHebrewTexts");
function calculateDiffStats(diffs) {
  const stats = {
    agreements: 0,
    additions: 0,
    removals: 0,
    totalChars: 0
  };
  for (const diff of diffs) {
    const chars2 = diff.value.length;
    stats.totalChars += chars2;
    if (diff.added) {
      stats.additions += chars2;
    } else if (diff.removed) {
      stats.removals += chars2;
    } else {
      stats.agreements += chars2;
    }
  }
  return stats;
}
__name(calculateDiffStats, "calculateDiffStats");
function processHebrew(text2) {
  if (!text2)
    return "";
  return text2.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "").replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "").replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]*>/g, "").replace(/function\s+\w+\s*\([^)]*\)\s*\{[\s\S]*?\}/g, "").replace(/var\s+\w+\s*[=;][\s\S]*?;/g, "").replace(/if\s*\([^)]*\)\s*\{[\s\S]*?\}/g, "").replace(/window\.\w+[\s\S]*?;/g, "").replace(/document\.\w+[\s\S]*?;/g, "").replace(/\{[\s\S]*?\}/g, "").replace(/#[\w-]+\s*\{[\s\S]*?\}/g, "").replace(/\.[\w-]+\s*\{[\s\S]*?\}/g, "").replace(/https?:\/\/[^\s]+/g, "").replace(/www\.[^\s]+/g, "").replace(/[\w.-]+@[\w.-]+\.\w+/g, "").replace(/\(\d{2,3}\)\s*\d{3}-\d{4}/g, "").replace(/\d{3}-\d{3}-\d{4}/g, "").replace(/©\d{4}.*$/gm, "").replace(/Copyright.*$/gm, "").replace(/&[a-zA-Z]+;/g, "").replace(/&#\d+;/g, "").replaceAll("\u2013", "").replaceAll("\u05F3", "'").replace(/\s+/g, " ").replace(/\n+/g, " ").replace(/\b[a-zA-Z]{10,}\b/g, "").trim();
}
__name(processHebrew, "processHebrew");
async function fetchSefariaCommentary(tractate, daf, commentaryType) {
  const sefariaRef = daf;
  const commentaryName = commentaryType === "rashi" ? "Rashi" : "Tosafot";
  try {
    const mainRef = `${tractate}.${sefariaRef}`;
    const linksUrl = `https://www.sefaria.org/api/links/${mainRef}`;
    console.log(`Fetching links for ${mainRef} to find all ${commentaryName} segments`);
    const linksResponse = await fetch(linksUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; TalmudMerged/1.0)"
      }
    });
    if (!linksResponse.ok) {
      console.log(`Links API error:`, linksResponse.status);
      return { hebrew: [], english: [], linking: {} };
    }
    const allLinks = await linksResponse.json();
    const commentaryLinks = allLinks.filter(
      (link) => link.index_title === `${commentaryName} on ${tractate}` && link.type === "commentary"
    );
    console.log(`Found ${commentaryLinks.length} ${commentaryName} links for ${mainRef}`);
    const linkingInfo = {};
    const allHebrew = [];
    const allEnglish = [];
    const groupedLinks = /* @__PURE__ */ new Map();
    commentaryLinks.forEach((link) => {
      const refParts = link.ref.split(":");
      const baseCommentRef = refParts.slice(0, -1).join(":");
      if (!groupedLinks.has(baseCommentRef)) {
        groupedLinks.set(baseCommentRef, []);
      }
      groupedLinks.get(baseCommentRef).push(link);
    });
    let segmentIndex = 0;
    groupedLinks.forEach((links, baseCommentRef) => {
      const hebrewTexts = links.map((l) => l.he).filter(Boolean);
      const englishTexts = links.map((l) => l.text).filter(Boolean);
      if (hebrewTexts.length > 0) {
        allHebrew.push(hebrewTexts.join(" "));
      }
      if (englishTexts.length > 0) {
        allEnglish.push(englishTexts.join(" "));
      }
      const anchorRef = links[0].anchorRef;
      if (anchorRef) {
        const parts = anchorRef.split(":");
        if (parts.length >= 2) {
          const sentenceIndex = parseInt(parts[1]) - 1;
          const baseRef = parts[0];
          if (!linkingInfo[baseRef]) {
            linkingInfo[baseRef] = {};
          }
          if (!linkingInfo[baseRef][sentenceIndex]) {
            linkingInfo[baseRef][sentenceIndex] = [];
          }
          linkingInfo[baseRef][sentenceIndex].push(segmentIndex);
          console.log(`\u{1F517} ${commentaryName} segment ${segmentIndex} (${links.length} parts) links to ${baseRef} sentence ${sentenceIndex}`);
        }
      }
      segmentIndex++;
    });
    console.log(`Total ${commentaryName} segments: ${allHebrew.length} Hebrew, ${allEnglish.length} English`);
    return {
      hebrew: allHebrew,
      english: allEnglish,
      linking: linkingInfo
    };
  } catch (error22) {
    console.error(`Failed to fetch ${commentaryName} commentary:`, error22);
    return { hebrew: [], english: [], linking: {} };
  }
}
__name(fetchSefariaCommentary, "fetchSefariaCommentary");
async function fetchSefaria(tractate, daf, type) {
  if (type === "rashi" || type === "tosafot") {
    return fetchSefariaCommentary(tractate, daf, type);
  }
  const sefariaRef = daf;
  console.log(`Fetching Sefaria main text for ${tractate} ${sefariaRef}`);
  const sefariaUrl = `https://www.sefaria.org/api/texts/${tractate}.${sefariaRef}?vhe=William_Davidson_Edition_-_Aramaic`;
  try {
    console.log(`Fetching from Sefaria: ${sefariaUrl}`);
    const response = await fetch(sefariaUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; TalmudMerged/1.0)"
      }
    });
    if (!response.ok) {
      console.log(`Sefaria API error for main text:`, response.status);
      return { hebrew: [], english: [] };
    }
    const data = await response.json();
    console.log(`Sefaria main text response:`, {
      ref: data.ref,
      heLength: data.he?.length,
      textLength: data.text?.length,
      heTitle: data.heTitle
    });
    let hebrewText = [];
    if (data.he) {
      if (Array.isArray(data.he) && data.he.length > 0) {
        if (typeof data.he[0] === "string") {
          hebrewText = data.he.filter((str) => str && typeof str === "string" && str.length > 0);
        } else if (Array.isArray(data.he[0])) {
          hebrewText = data.he.flat(2).filter((str) => str && typeof str === "string" && str.length > 0);
        }
      }
    }
    console.log(`Processed main text: ${hebrewText.length} segments`);
    return {
      hebrew: hebrewText,
      english: data.text || []
    };
  } catch (error22) {
    console.error(`Failed to fetch Sefaria main text:`, error22);
    return { hebrew: [], english: [] };
  }
}
__name(fetchSefaria, "fetchSefaria");
function filterLinkedCommentarySegments(commentarySegments, linking) {
  if (!commentarySegments || commentarySegments.length === 0) {
    return [];
  }
  const commentaryToMainTextOrder = {};
  Object.values(linking).forEach((sentenceLinks) => {
    if (typeof sentenceLinks === "object") {
      Object.entries(sentenceLinks).forEach(([mainSegmentIndex, commentaryIndexes]) => {
        if (Array.isArray(commentaryIndexes)) {
          commentaryIndexes.forEach((commentaryIndex) => {
            if (!(commentaryIndex in commentaryToMainTextOrder)) {
              commentaryToMainTextOrder[commentaryIndex] = parseInt(mainSegmentIndex);
            }
          });
        }
      });
    }
  });
  const linkedIndexes = Object.keys(commentaryToMainTextOrder).map((k) => parseInt(k));
  console.log(`\u{1F517} Filtering commentary: ${commentarySegments.length} total \u2192 ${linkedIndexes.length} linked`);
  const linkedSegmentsWithOrder = linkedIndexes.map((commentaryIndex) => {
    const segment = commentarySegments[commentaryIndex];
    if (segment && segment.trim().length > 5) {
      return {
        segment,
        mainTextOrder: commentaryToMainTextOrder[commentaryIndex]
      };
    }
    return null;
  }).filter((item) => item !== null);
  linkedSegmentsWithOrder.sort((a, b) => a.mainTextOrder - b.mainTextOrder);
  return linkedSegmentsWithOrder.map((item) => item.segment);
}
__name(filterLinkedCommentarySegments, "filterLinkedCommentarySegments");
function createLinkedCommentary(commentarySegments, linking, type) {
  console.log(`\u{1F517} Creating linked ${type} commentary`);
  if (!commentarySegments || commentarySegments.length === 0) {
    console.log(`\u26A0\uFE0F No ${type} segments available`);
    return "";
  }
  const commentaryToMainTextOrder = {};
  Object.entries(linking).forEach(([baseRef, sentenceLinks]) => {
    if (typeof sentenceLinks === "object") {
      Object.entries(sentenceLinks).forEach(([mainSegmentIndex, commentaryIndexes]) => {
        if (Array.isArray(commentaryIndexes)) {
          commentaryIndexes.forEach((commentaryIndex) => {
            if (!(commentaryIndex in commentaryToMainTextOrder)) {
              commentaryToMainTextOrder[commentaryIndex] = parseInt(mainSegmentIndex);
            }
          });
        }
      });
    }
  });
  const linkedIndexes = Object.keys(commentaryToMainTextOrder).map((k) => parseInt(k));
  console.log(`\u{1F4CA} ${type}: ${commentarySegments.length} total segments, ${linkedIndexes.length} linked to main text`);
  const linkedSegmentsWithOrder = linkedIndexes.map((commentaryIndex) => {
    const segment = commentarySegments[commentaryIndex];
    if (segment && segment.trim().length > 5) {
      return {
        commentaryIndex,
        mainTextOrder: commentaryToMainTextOrder[commentaryIndex],
        html: `<span class="sentence-${type}" data-commentary-index="${commentaryIndex}">${segment}</span>`
      };
    }
    return null;
  }).filter((item) => item !== null);
  linkedSegmentsWithOrder.sort((a, b) => a.mainTextOrder - b.mainTextOrder);
  console.log(`\u2705 ${type}: ${linkedSegmentsWithOrder.length} linked segments ordered by main text sequence`);
  return linkedSegmentsWithOrder.map((item) => item.html).join(" ");
}
__name(createLinkedCommentary, "createLinkedCommentary");
function extractTalmudContent(text2) {
  if (!text2)
    return "";
  let cleaned = text2.replace(/^[\s\S]*?(?=גמרא|משנה|א\]|ב\]|ג\]|ד\])/i, "").replace(/(?:במקומן|©\d{4}|window\.|function|var |document\.)[\s\S]*$/i, "");
  return processHebrew(cleaned);
}
__name(extractTalmudContent, "extractTalmudContent");
function createSegmentedMainText(hebrewBooksText, sefariaSegments) {
  console.log("\u{1F517} Creating segmented main text with sentence divisions");
  if (!hebrewBooksText || !sefariaSegments || sefariaSegments.length === 0) {
    console.log("\u26A0\uFE0F No segmentation possible - missing data");
    return hebrewBooksText || "";
  }
  console.log(`\u{1F4CA} Input: HebrewBooks text ${hebrewBooksText.length} chars, ${sefariaSegments.length} Sefaria segments`);
  const cleanHBText = extractTalmudContent(hebrewBooksText);
  const cleanSefariaSegments = sefariaSegments.filter((segment) => segment && segment.trim().length > 5).map((segment) => processHebrew(segment));
  console.log(`\u{1F4CA} After filtering: ${cleanSefariaSegments.length} usable Sefaria segments`);
  let workingText = cleanHBText;
  let segmentIndex = 0;
  cleanSefariaSegments.forEach((segment, index13) => {
    if (segment.length > 5) {
      if (workingText.includes(segment)) {
        const wrappedSegment = `<span class="sentence-main" data-sentence-index="${segmentIndex}" data-sefaria-index="${index13}">${segment}</span>`;
        workingText = workingText.replace(segment, wrappedSegment);
        segmentIndex++;
        console.log(`\u2705 Wrapped segment ${index13}: "${segment.substring(0, 50)}..."`);
      } else {
        const minMatchLength = Math.max(Math.floor(segment.length * 0.5), 15);
        let bestMatch = "";
        let bestMatchIndex = -1;
        const segmentWords = segment.split(/\s+/).filter((w) => w.length > 2);
        for (let wordCount = Math.min(segmentWords.length, 5); wordCount >= 2; wordCount--) {
          for (let start = 0; start <= segmentWords.length - wordCount; start++) {
            const phrase = segmentWords.slice(start, start + wordCount).join(" ");
            if (phrase.length >= 10 && workingText.includes(phrase)) {
              if (phrase.length > bestMatch.length) {
                bestMatch = phrase;
                bestMatchIndex = workingText.indexOf(phrase);
              }
            }
          }
        }
        if (!bestMatch && segment.length >= 20) {
          for (let i = 0; i <= workingText.length - minMatchLength; i++) {
            for (let len = minMatchLength; len <= Math.min(segment.length, workingText.length - i); len++) {
              const substring = workingText.substring(i, i + len);
              if (segment.includes(substring) && substring.length > bestMatch.length) {
                bestMatch = substring;
                bestMatchIndex = i;
              }
            }
          }
        }
        if (bestMatch && bestMatch.length >= minMatchLength) {
          const wrappedSegment = `<span class="sentence-main" data-sentence-index="${segmentIndex}" data-sefaria-index="${index13}">${bestMatch}</span>`;
          workingText = workingText.substring(0, bestMatchIndex) + wrappedSegment + workingText.substring(bestMatchIndex + bestMatch.length);
          segmentIndex++;
          console.log(`\u{1F50D} Wrapped partial match ${index13}: "${bestMatch.substring(0, 50)}..." (${bestMatch.length}/${segment.length} chars)`);
        } else {
          console.log(`\u274C No match found for segment ${index13}: "${segment.substring(0, 50)}..." (${segment.length} chars)`);
        }
      }
    } else {
      console.log(`\u26A0\uFE0F Skipping short segment ${index13}: "${segment}" (${segment.length} chars)`);
    }
  });
  console.log(`\u2705 Segmentation complete: wrapped ${segmentIndex} segments`);
  return workingText;
}
__name(createSegmentedMainText, "createSegmentedMainText");
function mergeTexts(sefariaLines, hebrewBooksText) {
  if (!hebrewBooksText || hebrewBooksText.trim().length === 0) {
    const sefariaString2 = processHebrew(sefariaLines.join("|"));
    return {
      merged: sefariaString2,
      diffs: [{ value: sefariaString2, added: true }],
      issues: { sefaria: [], hb: ["No HebrewBooks data available"] },
      stats: {
        agreements: 0,
        additions: 0,
        removals: sefariaString2.length,
        totalChars: sefariaString2.length
      }
    };
  }
  const hbString = extractTalmudContent(hebrewBooksText);
  if (!sefariaLines || sefariaLines.length === 0) {
    return {
      merged: hbString,
      diffs: [{ value: hbString }],
      issues: { sefaria: ["No Sefaria data available"], hb: [] },
      stats: {
        agreements: hbString.length,
        additions: 0,
        removals: 0,
        totalChars: hbString.length
      }
    };
  }
  const sefariaString = processHebrew(sefariaLines.join("|"));
  const diffs = diffHebrewTexts(hbString, sefariaString);
  const stats = calculateDiffStats(diffs);
  return {
    merged: hbString,
    // Always use HebrewBooks as the merged result
    diffs,
    issues: { sefaria: [], hb: [] },
    stats
  };
}
__name(mergeTexts, "mergeTexts");
async function fetchHebrewBooks(mesechta, daf, options2 = {}, fetchFn = fetch) {
  const searchParams = new URLSearchParams({
    mesechta,
    daf,
    ...options2
  });
  try {
    const localUrl = `/api/hebrewbooks?${searchParams.toString()}`;
    console.log("Trying local HebrewBooks API:", localUrl);
    const response = await fetchFn(localUrl);
    if (response.ok) {
      const data = await response.json();
      console.log("Local HebrewBooks API success:", data.source || "success");
      return data;
    }
    console.log("Local API failed, trying daf-supplier worker...");
    throw new Error(`Local HebrewBooks API failed: ${response.status}`);
  } catch (error22) {
    console.error("Local HebrewBooks fetch error:", error22);
    const workerUrl = `https://daf-supplier.402.workers.dev/?${searchParams.toString()}`;
    console.log("Fetching from daf-supplier worker:", workerUrl);
    const response = await fetch(workerUrl);
    if (response.ok) {
      const data = await response.json();
      console.log("Daf-supplier worker success:", data.source || "worker");
      return data;
    }
    console.error("Daf-supplier worker also failed:", response.status);
    throw new Error(`Both local and worker APIs failed: ${response.status}`);
  }
}
__name(fetchHebrewBooks, "fetchHebrewBooks");
var HEBREW_ABBREVIATIONS;
var TRACTATE_MAPPING;
var GET4;
var init_server_ts5 = __esm2({
  ".svelte-kit/output/server/entries/endpoints/api/talmud-merged/_server.ts.js"() {
    init_exports();
    HEBREW_ABBREVIATIONS = /* @__PURE__ */ new Map([
      ["\u05DE\u05EA\u05E0\u05D9\u05F3", "\u05DE\u05EA\u05E0\u05D9\u05EA\u05D9\u05DF"],
      ["\u05D2\u05DE\u05F3", "\u05D2\u05DE\u05E8\u05D0"],
      ["\u05E8\u05F3", "\u05E8\u05D1\u05D9"],
      ['\u05E8"\u05D9', "\u05E8\u05D1\u05D9 \u05D9\u05E6\u05D7\u05E7"],
      ['\u05E8"\u05E9', "\u05E8\u05D1\u05D9 \u05E9\u05DE\u05E2\u05D5\u05DF"],
      ['\u05E8\u05E9\u05D1"\u05DD', "\u05E8\u05D1\u05D9 \u05E9\u05DE\u05D5\u05D0\u05DC \u05D1\u05DF \u05DE\u05D0\u05D9\u05E8"],
      ["\u05D5\u05DB\u05D5\u05F3", "\u05D5\u05DB\u05D5\u05DC\u05D9"],
      ["\u05DB\u05D5\u05F3", "\u05DB\u05D5\u05DC\u05D9"],
      ["\u05D3\u05DB\u05F3", "\u05D3\u05DB\u05EA\u05D9\u05D1"],
      ['\u05D0"\u05E8', "\u05D0\u05DE\u05E8 \u05E8\u05D1\u05D9"],
      ['\u05D0"\u05DC', "\u05D0\u05DE\u05E8 \u05DC\u05D5"],
      ['\u05EA"\u05E8', "\u05EA\u05E0\u05D5 \u05E8\u05D1\u05E0\u05DF"],
      ['\u05EA"\u05E9', "\u05EA\u05D0 \u05E9\u05DE\u05E2"],
      ["\u05D5\u05D2\u05D5\u05F3", "\u05D5\u05D2\u05D5\u05DE\u05E8"],
      ["\u05E4\u05D9\u05F3", "\u05E4\u05D9\u05E8\u05D5\u05E9"],
      ["\u05E2\u05D9\u05F3", "\u05E2\u05D9\u05D9\u05DF"]
    ]);
    TRACTATE_MAPPING = {
      "1": "Berakhot",
      "2": "Shabbat",
      "3": "Eruvin",
      "4": "Pesachim",
      "5": "Shekalim",
      "6": "Yoma",
      "7": "Sukkah",
      "8": "Beitzah",
      "9": "Rosh_Hashanah",
      "10": "Taanit",
      "11": "Megillah",
      "12": "Moed_Katan",
      "13": "Chagigah",
      "14": "Yevamot",
      "15": "Ketubot",
      "16": "Nedarim",
      "17": "Nazir",
      "18": "Sotah",
      "19": "Gittin",
      "20": "Kiddushin",
      "21": "Bava_Kamma",
      "22": "Bava_Metzia",
      "23": "Bava_Batra",
      "24": "Sanhedrin",
      "25": "Makkot",
      "26": "Shevuot",
      "27": "Avodah_Zarah",
      "28": "Horayot",
      "29": "Zevachim",
      "30": "Menachot",
      "31": "Chullin",
      "32": "Bekhorot",
      "33": "Arakhin",
      "34": "Temurah",
      "35": "Keritot",
      "36": "Meilah",
      "37": "Niddah"
    };
    GET4 = /* @__PURE__ */ __name(async ({ url, fetch: fetch2 }) => {
      const mesechta = url.searchParams.get("mesechta");
      const daf = url.searchParams.get("daf");
      if (!mesechta || !daf) {
        return json({ error: "Missing required parameters: mesechta and daf" }, { status: 400 });
      }
      const tractate = TRACTATE_MAPPING[mesechta];
      if (!tractate) {
        return json({ error: `Unknown mesechta: ${mesechta}` }, { status: 400 });
      }
      const dafSupplierOptions = {};
      const optionKeys = [
        "br",
        // Enable <br> tag conversion
        "nocache",
        // Bypass cache
        "format",
        // Response format
        "debug"
        // Debug mode
      ];
      for (const key2 of optionKeys) {
        const value = url.searchParams.get(key2);
        if (value !== null) {
          dafSupplierOptions[key2] = value;
        }
      }
      console.log(`Fetching merged data for ${tractate} ${daf} with options:`, dafSupplierOptions);
      try {
        const [hebrewBooksData, sefariaMain, sefariaRashi, sefariaTosafot] = await Promise.all([
          fetchHebrewBooks(mesechta, daf, dafSupplierOptions, fetch2),
          fetchSefaria(tractate, daf, "main"),
          fetchSefaria(tractate, daf, "rashi"),
          fetchSefaria(tractate, daf, "tosafot")
        ]);
        const filteredSefariaRashi = filterLinkedCommentarySegments(sefariaRashi.hebrew, sefariaRashi.linking || {});
        const filteredSefariaTosafot = filterLinkedCommentarySegments(sefariaTosafot.hebrew, sefariaTosafot.linking || {});
        console.log("Data fetched, merging texts...");
        const mainMerged = mergeTexts(sefariaMain.hebrew, hebrewBooksData.mainText || "");
        const rashiMerged = mergeTexts(filteredSefariaRashi, hebrewBooksData.rashi || "");
        const tosafotMerged = mergeTexts(filteredSefariaTosafot, hebrewBooksData.tosafot || "");
        let dafDisplay;
        let amud;
        if (daf.includes("b")) {
          dafDisplay = daf.replace("b", "");
          amud = "b";
        } else {
          dafDisplay = daf;
          amud = "a";
        }
        const response = {
          mesechta: parseInt(mesechta),
          daf: parseInt(dafDisplay),
          dafDisplay,
          amud,
          tractate,
          // Merged content with both sources
          mainText: mainMerged.merged,
          rashi: rashiMerged.merged,
          tosafot: tosafotMerged.merged,
          // Segmented HTML versions using Sefaria sentence divisions
          segmented: {
            mainText: createSegmentedMainText(hebrewBooksData.mainText || "", sefariaMain.hebrew),
            rashi: createLinkedCommentary(sefariaRashi.hebrew, sefariaRashi.linking || {}, "rashi"),
            tosafot: createLinkedCommentary(sefariaTosafot.hebrew, sefariaTosafot.linking || {}, "tosafot")
          },
          // Original sources for comparison
          sources: {
            hebrewBooks: {
              mainText: hebrewBooksData.mainText,
              rashi: hebrewBooksData.rashi,
              tosafot: hebrewBooksData.tosafot
            },
            sefaria: {
              mainText: sefariaMain.hebrew,
              rashi: filteredSefariaRashi,
              tosafot: filteredSefariaTosafot,
              rashiOriginal: sefariaRashi.hebrew,
              // Keep original for comparison
              tosafotOriginal: sefariaTosafot.hebrew,
              // Keep original for comparison
              english: {
                mainText: sefariaMain.english,
                rashi: sefariaRashi.english,
                tosafot: sefariaTosafot.english
              },
              linking: {
                rashi: sefariaRashi.linking || {},
                tosafot: sefariaTosafot.linking || {}
              }
            }
          },
          // Merge analysis
          analysis: {
            main: mainMerged.issues,
            rashi: rashiMerged.issues,
            tosafot: tosafotMerged.issues
          },
          // Diff data for visualization
          diffs: {
            main: mainMerged.diffs,
            rashi: rashiMerged.diffs,
            tosafot: tosafotMerged.diffs
          },
          // Merge statistics
          mergeStats: {
            main: mainMerged.stats,
            rashi: rashiMerged.stats,
            tosafot: tosafotMerged.stats
          },
          timestamp: Date.now(),
          method: "merged-diff-algorithm"
        };
        return json(response);
      } catch (error22) {
        console.error("Talmud merge error:", error22);
        return json({
          error: "Failed to merge Talmud sources",
          details: error22 instanceof Error ? error22.message : String(error22)
        }, { status: 500 });
      }
    }, "GET4");
  }
});
init_false();
init_exports();
init_internal();
var base = "";
var assets = base;
var app_dir = "_app";
var initial = { base, assets };
function override(paths) {
  base = paths.base;
  assets = paths.assets;
}
__name(override, "override");
function reset() {
  base = initial.base;
  assets = initial.assets;
}
__name(reset, "reset");
var prerendering = false;
var request_event = null;
var als;
Promise.resolve().then(() => (init_async_hooks2(), async_hooks_exports)).then((hooks) => als = new hooks.AsyncLocalStorage()).catch(() => {
});
function with_event(event, fn) {
  try {
    request_event = event;
    return als ? als.run(event, fn) : fn();
  } finally {
    request_event = null;
  }
}
__name(with_event, "with_event");
var escaped = {
  "<": "\\u003C",
  "\\": "\\\\",
  "\b": "\\b",
  "\f": "\\f",
  "\n": "\\n",
  "\r": "\\r",
  "	": "\\t",
  "\u2028": "\\u2028",
  "\u2029": "\\u2029"
};
var DevalueError = /* @__PURE__ */ __name(class extends Error {
  /**
   * @param {string} message
   * @param {string[]} keys
   */
  constructor(message, keys) {
    super(message);
    this.name = "DevalueError";
    this.path = keys.join("");
  }
}, "DevalueError");
function is_primitive(thing) {
  return Object(thing) !== thing;
}
__name(is_primitive, "is_primitive");
var object_proto_names = /* @__PURE__ */ Object.getOwnPropertyNames(
  Object.prototype
).sort().join("\0");
function is_plain_object(thing) {
  const proto = Object.getPrototypeOf(thing);
  return proto === Object.prototype || proto === null || Object.getOwnPropertyNames(proto).sort().join("\0") === object_proto_names;
}
__name(is_plain_object, "is_plain_object");
function get_type(thing) {
  return Object.prototype.toString.call(thing).slice(8, -1);
}
__name(get_type, "get_type");
function get_escaped_char(char) {
  switch (char) {
    case '"':
      return '\\"';
    case "<":
      return "\\u003C";
    case "\\":
      return "\\\\";
    case "\n":
      return "\\n";
    case "\r":
      return "\\r";
    case "	":
      return "\\t";
    case "\b":
      return "\\b";
    case "\f":
      return "\\f";
    case "\u2028":
      return "\\u2028";
    case "\u2029":
      return "\\u2029";
    default:
      return char < " " ? `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}` : "";
  }
}
__name(get_escaped_char, "get_escaped_char");
function stringify_string(str) {
  let result = "";
  let last_pos = 0;
  const len = str.length;
  for (let i = 0; i < len; i += 1) {
    const char = str[i];
    const replacement = get_escaped_char(char);
    if (replacement) {
      result += str.slice(last_pos, i) + replacement;
      last_pos = i + 1;
    }
  }
  return `"${last_pos === 0 ? str : result + str.slice(last_pos)}"`;
}
__name(stringify_string, "stringify_string");
function enumerable_symbols(object) {
  return Object.getOwnPropertySymbols(object).filter(
    (symbol) => Object.getOwnPropertyDescriptor(object, symbol).enumerable
  );
}
__name(enumerable_symbols, "enumerable_symbols");
var is_identifier = /^[a-zA-Z_$][a-zA-Z_$0-9]*$/;
function stringify_key(key2) {
  return is_identifier.test(key2) ? "." + key2 : "[" + JSON.stringify(key2) + "]";
}
__name(stringify_key, "stringify_key");
function encode64(arraybuffer) {
  const dv = new DataView(arraybuffer);
  let binaryString = "";
  for (let i = 0; i < arraybuffer.byteLength; i++) {
    binaryString += String.fromCharCode(dv.getUint8(i));
  }
  return binaryToAscii(binaryString);
}
__name(encode64, "encode64");
function decode64(string) {
  const binaryString = asciiToBinary(string);
  const arraybuffer = new ArrayBuffer(binaryString.length);
  const dv = new DataView(arraybuffer);
  for (let i = 0; i < arraybuffer.byteLength; i++) {
    dv.setUint8(i, binaryString.charCodeAt(i));
  }
  return arraybuffer;
}
__name(decode64, "decode64");
var KEY_STRING = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function asciiToBinary(data) {
  if (data.length % 4 === 0) {
    data = data.replace(/==?$/, "");
  }
  let output = "";
  let buffer = 0;
  let accumulatedBits = 0;
  for (let i = 0; i < data.length; i++) {
    buffer <<= 6;
    buffer |= KEY_STRING.indexOf(data[i]);
    accumulatedBits += 6;
    if (accumulatedBits === 24) {
      output += String.fromCharCode((buffer & 16711680) >> 16);
      output += String.fromCharCode((buffer & 65280) >> 8);
      output += String.fromCharCode(buffer & 255);
      buffer = accumulatedBits = 0;
    }
  }
  if (accumulatedBits === 12) {
    buffer >>= 4;
    output += String.fromCharCode(buffer);
  } else if (accumulatedBits === 18) {
    buffer >>= 2;
    output += String.fromCharCode((buffer & 65280) >> 8);
    output += String.fromCharCode(buffer & 255);
  }
  return output;
}
__name(asciiToBinary, "asciiToBinary");
function binaryToAscii(str) {
  let out = "";
  for (let i = 0; i < str.length; i += 3) {
    const groupsOfSix = [void 0, void 0, void 0, void 0];
    groupsOfSix[0] = str.charCodeAt(i) >> 2;
    groupsOfSix[1] = (str.charCodeAt(i) & 3) << 4;
    if (str.length > i + 1) {
      groupsOfSix[1] |= str.charCodeAt(i + 1) >> 4;
      groupsOfSix[2] = (str.charCodeAt(i + 1) & 15) << 2;
    }
    if (str.length > i + 2) {
      groupsOfSix[2] |= str.charCodeAt(i + 2) >> 6;
      groupsOfSix[3] = str.charCodeAt(i + 2) & 63;
    }
    for (let j = 0; j < groupsOfSix.length; j++) {
      if (typeof groupsOfSix[j] === "undefined") {
        out += "=";
      } else {
        out += KEY_STRING[groupsOfSix[j]];
      }
    }
  }
  return out;
}
__name(binaryToAscii, "binaryToAscii");
var UNDEFINED = -1;
var HOLE = -2;
var NAN = -3;
var POSITIVE_INFINITY = -4;
var NEGATIVE_INFINITY = -5;
var NEGATIVE_ZERO = -6;
function parse(serialized, revivers) {
  return unflatten(JSON.parse(serialized), revivers);
}
__name(parse, "parse");
function unflatten(parsed, revivers) {
  if (typeof parsed === "number")
    return hydrate2(parsed, true);
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("Invalid input");
  }
  const values = (
    /** @type {any[]} */
    parsed
  );
  const hydrated = Array(values.length);
  function hydrate2(index13, standalone = false) {
    if (index13 === UNDEFINED)
      return void 0;
    if (index13 === NAN)
      return NaN;
    if (index13 === POSITIVE_INFINITY)
      return Infinity;
    if (index13 === NEGATIVE_INFINITY)
      return -Infinity;
    if (index13 === NEGATIVE_ZERO)
      return -0;
    if (standalone)
      throw new Error(`Invalid input`);
    if (index13 in hydrated)
      return hydrated[index13];
    const value = values[index13];
    if (!value || typeof value !== "object") {
      hydrated[index13] = value;
    } else if (Array.isArray(value)) {
      if (typeof value[0] === "string") {
        const type = value[0];
        const reviver = revivers?.[type];
        if (reviver) {
          return hydrated[index13] = reviver(hydrate2(value[1]));
        }
        switch (type) {
          case "Date":
            hydrated[index13] = new Date(value[1]);
            break;
          case "Set":
            const set2 = /* @__PURE__ */ new Set();
            hydrated[index13] = set2;
            for (let i = 1; i < value.length; i += 1) {
              set2.add(hydrate2(value[i]));
            }
            break;
          case "Map":
            const map = /* @__PURE__ */ new Map();
            hydrated[index13] = map;
            for (let i = 1; i < value.length; i += 2) {
              map.set(hydrate2(value[i]), hydrate2(value[i + 1]));
            }
            break;
          case "RegExp":
            hydrated[index13] = new RegExp(value[1], value[2]);
            break;
          case "Object":
            hydrated[index13] = Object(value[1]);
            break;
          case "BigInt":
            hydrated[index13] = BigInt(value[1]);
            break;
          case "null":
            const obj = /* @__PURE__ */ Object.create(null);
            hydrated[index13] = obj;
            for (let i = 1; i < value.length; i += 2) {
              obj[value[i]] = hydrate2(value[i + 1]);
            }
            break;
          case "Int8Array":
          case "Uint8Array":
          case "Uint8ClampedArray":
          case "Int16Array":
          case "Uint16Array":
          case "Int32Array":
          case "Uint32Array":
          case "Float32Array":
          case "Float64Array":
          case "BigInt64Array":
          case "BigUint64Array": {
            const TypedArrayConstructor = globalThis[type];
            const base642 = value[1];
            const arraybuffer = decode64(base642);
            const typedArray = new TypedArrayConstructor(arraybuffer);
            hydrated[index13] = typedArray;
            break;
          }
          case "ArrayBuffer": {
            const base642 = value[1];
            const arraybuffer = decode64(base642);
            hydrated[index13] = arraybuffer;
            break;
          }
          default:
            throw new Error(`Unknown type ${type}`);
        }
      } else {
        const array2 = new Array(value.length);
        hydrated[index13] = array2;
        for (let i = 0; i < value.length; i += 1) {
          const n2 = value[i];
          if (n2 === HOLE)
            continue;
          array2[i] = hydrate2(n2);
        }
      }
    } else {
      const object = {};
      hydrated[index13] = object;
      for (const key2 in value) {
        const n2 = value[key2];
        object[key2] = hydrate2(n2);
      }
    }
    return hydrated[index13];
  }
  __name(hydrate2, "hydrate2");
  return hydrate2(0);
}
__name(unflatten, "unflatten");
function stringify$1(value, reducers) {
  const stringified = [];
  const indexes = /* @__PURE__ */ new Map();
  const custom = [];
  if (reducers) {
    for (const key2 of Object.getOwnPropertyNames(reducers)) {
      custom.push({ key: key2, fn: reducers[key2] });
    }
  }
  const keys = [];
  let p = 0;
  function flatten(thing) {
    if (typeof thing === "function") {
      throw new DevalueError(`Cannot stringify a function`, keys);
    }
    if (indexes.has(thing))
      return indexes.get(thing);
    if (thing === void 0)
      return UNDEFINED;
    if (Number.isNaN(thing))
      return NAN;
    if (thing === Infinity)
      return POSITIVE_INFINITY;
    if (thing === -Infinity)
      return NEGATIVE_INFINITY;
    if (thing === 0 && 1 / thing < 0)
      return NEGATIVE_ZERO;
    const index22 = p++;
    indexes.set(thing, index22);
    for (const { key: key2, fn } of custom) {
      const value2 = fn(thing);
      if (value2) {
        stringified[index22] = `["${key2}",${flatten(value2)}]`;
        return index22;
      }
    }
    let str = "";
    if (is_primitive(thing)) {
      str = stringify_primitive(thing);
    } else {
      const type = get_type(thing);
      switch (type) {
        case "Number":
        case "String":
        case "Boolean":
          str = `["Object",${stringify_primitive(thing)}]`;
          break;
        case "BigInt":
          str = `["BigInt",${thing}]`;
          break;
        case "Date":
          const valid = !isNaN(thing.getDate());
          str = `["Date","${valid ? thing.toISOString() : ""}"]`;
          break;
        case "RegExp":
          const { source: source2, flags } = thing;
          str = flags ? `["RegExp",${stringify_string(source2)},"${flags}"]` : `["RegExp",${stringify_string(source2)}]`;
          break;
        case "Array":
          str = "[";
          for (let i = 0; i < thing.length; i += 1) {
            if (i > 0)
              str += ",";
            if (i in thing) {
              keys.push(`[${i}]`);
              str += flatten(thing[i]);
              keys.pop();
            } else {
              str += HOLE;
            }
          }
          str += "]";
          break;
        case "Set":
          str = '["Set"';
          for (const value2 of thing) {
            str += `,${flatten(value2)}`;
          }
          str += "]";
          break;
        case "Map":
          str = '["Map"';
          for (const [key2, value2] of thing) {
            keys.push(
              `.get(${is_primitive(key2) ? stringify_primitive(key2) : "..."})`
            );
            str += `,${flatten(key2)},${flatten(value2)}`;
            keys.pop();
          }
          str += "]";
          break;
        case "Int8Array":
        case "Uint8Array":
        case "Uint8ClampedArray":
        case "Int16Array":
        case "Uint16Array":
        case "Int32Array":
        case "Uint32Array":
        case "Float32Array":
        case "Float64Array":
        case "BigInt64Array":
        case "BigUint64Array": {
          const typedArray = thing;
          const base642 = encode64(typedArray.buffer);
          str = '["' + type + '","' + base642 + '"]';
          break;
        }
        case "ArrayBuffer": {
          const arraybuffer = thing;
          const base642 = encode64(arraybuffer);
          str = `["ArrayBuffer","${base642}"]`;
          break;
        }
        default:
          if (!is_plain_object(thing)) {
            throw new DevalueError(
              `Cannot stringify arbitrary non-POJOs`,
              keys
            );
          }
          if (enumerable_symbols(thing).length > 0) {
            throw new DevalueError(
              `Cannot stringify POJOs with symbolic keys`,
              keys
            );
          }
          if (Object.getPrototypeOf(thing) === null) {
            str = '["null"';
            for (const key2 in thing) {
              keys.push(stringify_key(key2));
              str += `,${stringify_string(key2)},${flatten(thing[key2])}`;
              keys.pop();
            }
            str += "]";
          } else {
            str = "{";
            let started = false;
            for (const key2 in thing) {
              if (started)
                str += ",";
              started = true;
              keys.push(stringify_key(key2));
              str += `${stringify_string(key2)}:${flatten(thing[key2])}`;
              keys.pop();
            }
            str += "}";
          }
      }
    }
    stringified[index22] = str;
    return index22;
  }
  __name(flatten, "flatten");
  const index13 = flatten(value);
  if (index13 < 0)
    return `${index13}`;
  return `[${stringified.join(",")}]`;
}
__name(stringify$1, "stringify$1");
function stringify_primitive(thing) {
  const type = typeof thing;
  if (type === "string")
    return stringify_string(thing);
  if (thing instanceof String)
    return stringify_string(thing.toString());
  if (thing === void 0)
    return UNDEFINED.toString();
  if (thing === 0 && 1 / thing < 0)
    return NEGATIVE_ZERO.toString();
  if (type === "bigint")
    return `["BigInt","${thing}"]`;
  return String(thing);
}
__name(stringify_primitive, "stringify_primitive");
var INVALIDATED_PARAM = "x-sveltekit-invalidated";
var TRAILING_SLASH_PARAM = "x-sveltekit-trailing-slash";
function stringify(data, transport) {
  const encoders = Object.fromEntries(Object.entries(transport).map(([k, v]) => [k, v.encode]));
  return stringify$1(data, encoders);
}
__name(stringify, "stringify");
function parse_remote_arg(string, transport) {
  if (!string)
    return void 0;
  const decoders = Object.fromEntries(Object.entries(transport).map(([k, v]) => [k, v.decode]));
  const base64_restored = string.replace(/-/g, "+").replace(/_/g, "/");
  const binary_string = atob(base64_restored);
  const utf8_bytes = new Uint8Array([...binary_string].map((char) => char.charCodeAt(0)));
  const json_string = new TextDecoder().decode(utf8_bytes);
  return parse(json_string, decoders);
}
__name(parse_remote_arg, "parse_remote_arg");
var EVENT_STATE = Symbol("remote");
function create_event_state(state2, options2) {
  return {
    prerendering: state2.prerendering,
    transport: options2.hooks.transport,
    handleValidationError: options2.hooks.handleValidationError
  };
}
__name(create_event_state, "create_event_state");
function get_event_state(event) {
  return event[EVENT_STATE];
}
__name(get_event_state, "get_event_state");
init_exports2();
init_chunks();
init_index2();
var public_env = {};
var safe_public_env = {};
function set_private_env(environment) {
}
__name(set_private_env, "set_private_env");
function set_public_env(environment) {
  public_env = environment;
}
__name(set_public_env, "set_public_env");
function set_safe_public_env(environment) {
  safe_public_env = environment;
}
__name(set_safe_public_env, "set_safe_public_env");
function hydration_mismatch(location) {
  {
    console.warn(`https://svelte.dev/e/hydration_mismatch`);
  }
}
__name(hydration_mismatch, "hydration_mismatch");
var hydrating = false;
function set_hydrating(value) {
  hydrating = value;
}
__name(set_hydrating, "set_hydrating");
var hydrate_node;
function set_hydrate_node(node) {
  if (node === null) {
    hydration_mismatch();
    throw HYDRATION_ERROR;
  }
  return hydrate_node = node;
}
__name(set_hydrate_node, "set_hydrate_node");
function hydrate_next() {
  return set_hydrate_node(
    /** @type {TemplateNode} */
    get_next_sibling(hydrate_node)
  );
}
__name(hydrate_next, "hydrate_next");
var PASSIVE_EVENTS = ["touchstart", "touchmove"];
function is_passive_event(name) {
  return PASSIVE_EVENTS.includes(name);
}
__name(is_passive_event, "is_passive_event");
var all_registered_events = /* @__PURE__ */ new Set();
var root_event_handles = /* @__PURE__ */ new Set();
var last_propagated_event = null;
function handle_event_propagation(event) {
  var handler_element = this;
  var owner_document = (
    /** @type {Node} */
    handler_element.ownerDocument
  );
  var event_name = event.type;
  var path = event.composedPath?.() || [];
  var current_target = (
    /** @type {null | Element} */
    path[0] || event.target
  );
  last_propagated_event = event;
  var path_idx = 0;
  var handled_at = last_propagated_event === event && event.__root;
  if (handled_at) {
    var at_idx = path.indexOf(handled_at);
    if (at_idx !== -1 && (handler_element === document || handler_element === /** @type {any} */
    window)) {
      event.__root = handler_element;
      return;
    }
    var handler_idx = path.indexOf(handler_element);
    if (handler_idx === -1) {
      return;
    }
    if (at_idx <= handler_idx) {
      path_idx = at_idx;
    }
  }
  current_target = /** @type {Element} */
  path[path_idx] || event.target;
  if (current_target === handler_element)
    return;
  define_property(event, "currentTarget", {
    configurable: true,
    get() {
      return current_target || owner_document;
    }
  });
  var previous_reaction = active_reaction;
  var previous_effect = active_effect;
  set_active_reaction(null);
  set_active_effect(null);
  try {
    var throw_error;
    var other_errors = [];
    while (current_target !== null) {
      var parent_element = current_target.assignedSlot || current_target.parentNode || /** @type {any} */
      current_target.host || null;
      try {
        var delegated = current_target["__" + event_name];
        if (delegated != null && (!/** @type {any} */
        current_target.disabled || // DOM could've been updated already by the time this is reached, so we check this as well
        // -> the target could not have been disabled because it emits the event in the first place
        event.target === current_target)) {
          if (is_array(delegated)) {
            var [fn, ...data] = delegated;
            fn.apply(current_target, [event, ...data]);
          } else {
            delegated.call(current_target, event);
          }
        }
      } catch (error22) {
        if (throw_error) {
          other_errors.push(error22);
        } else {
          throw_error = error22;
        }
      }
      if (event.cancelBubble || parent_element === handler_element || parent_element === null) {
        break;
      }
      current_target = parent_element;
    }
    if (throw_error) {
      for (let error22 of other_errors) {
        queueMicrotask(() => {
          throw error22;
        });
      }
      throw throw_error;
    }
  } finally {
    event.__root = handler_element;
    delete event.currentTarget;
    set_active_reaction(previous_reaction);
    set_active_effect(previous_effect);
  }
}
__name(handle_event_propagation, "handle_event_propagation");
function assign_nodes(start, end) {
  var effect = (
    /** @type {Effect} */
    active_effect
  );
  if (effect.nodes_start === null) {
    effect.nodes_start = start;
    effect.nodes_end = end;
  }
}
__name(assign_nodes, "assign_nodes");
function mount(component13, options2) {
  return _mount(component13, options2);
}
__name(mount, "mount");
function hydrate(component13, options2) {
  init_operations();
  options2.intro = options2.intro ?? false;
  const target = options2.target;
  const was_hydrating = hydrating;
  const previous_hydrate_node = hydrate_node;
  try {
    var anchor = (
      /** @type {TemplateNode} */
      get_first_child(target)
    );
    while (anchor && (anchor.nodeType !== COMMENT_NODE || /** @type {Comment} */
    anchor.data !== HYDRATION_START)) {
      anchor = /** @type {TemplateNode} */
      get_next_sibling(anchor);
    }
    if (!anchor) {
      throw HYDRATION_ERROR;
    }
    set_hydrating(true);
    set_hydrate_node(
      /** @type {Comment} */
      anchor
    );
    hydrate_next();
    const instance = _mount(component13, { ...options2, anchor });
    if (hydrate_node === null || hydrate_node.nodeType !== COMMENT_NODE || /** @type {Comment} */
    hydrate_node.data !== HYDRATION_END) {
      hydration_mismatch();
      throw HYDRATION_ERROR;
    }
    set_hydrating(false);
    return (
      /**  @type {Exports} */
      instance
    );
  } catch (error22) {
    if (error22 === HYDRATION_ERROR) {
      if (options2.recover === false) {
        hydration_failed();
      }
      init_operations();
      clear_text_content(target);
      set_hydrating(false);
      return mount(component13, options2);
    }
    throw error22;
  } finally {
    set_hydrating(was_hydrating);
    set_hydrate_node(previous_hydrate_node);
  }
}
__name(hydrate, "hydrate");
var document_listeners = /* @__PURE__ */ new Map();
function _mount(Component, { target, anchor, props = {}, events, context: context22, intro = true }) {
  init_operations();
  var registered_events = /* @__PURE__ */ new Set();
  var event_handle = /* @__PURE__ */ __name((events2) => {
    for (var i = 0; i < events2.length; i++) {
      var event_name = events2[i];
      if (registered_events.has(event_name))
        continue;
      registered_events.add(event_name);
      var passive = is_passive_event(event_name);
      target.addEventListener(event_name, handle_event_propagation, { passive });
      var n2 = document_listeners.get(event_name);
      if (n2 === void 0) {
        document.addEventListener(event_name, handle_event_propagation, { passive });
        document_listeners.set(event_name, 1);
      } else {
        document_listeners.set(event_name, n2 + 1);
      }
    }
  }, "event_handle");
  event_handle(array_from(all_registered_events));
  root_event_handles.add(event_handle);
  var component13 = void 0;
  var unmount2 = component_root(() => {
    var anchor_node = anchor ?? target.appendChild(create_text());
    branch(() => {
      if (context22) {
        push$1({});
        var ctx = (
          /** @type {ComponentContext} */
          component_context
        );
        ctx.c = context22;
      }
      if (events) {
        props.$$events = events;
      }
      if (hydrating) {
        assign_nodes(
          /** @type {TemplateNode} */
          anchor_node,
          null
        );
      }
      component13 = Component(anchor_node, props) || {};
      if (hydrating) {
        active_effect.nodes_end = hydrate_node;
      }
      if (context22) {
        pop$1();
      }
    });
    return () => {
      for (var event_name of registered_events) {
        target.removeEventListener(event_name, handle_event_propagation);
        var n2 = (
          /** @type {number} */
          document_listeners.get(event_name)
        );
        if (--n2 === 0) {
          document.removeEventListener(event_name, handle_event_propagation);
          document_listeners.delete(event_name);
        } else {
          document_listeners.set(event_name, n2);
        }
      }
      root_event_handles.delete(event_handle);
      if (anchor_node !== anchor) {
        anchor_node.parentNode?.removeChild(anchor_node);
      }
    };
  });
  mounted_components.set(component13, unmount2);
  return component13;
}
__name(_mount, "_mount");
var mounted_components = /* @__PURE__ */ new WeakMap();
function unmount(component13, options2) {
  const fn = mounted_components.get(component13);
  if (fn) {
    mounted_components.delete(component13);
    return fn(options2);
  }
  return Promise.resolve();
}
__name(unmount, "unmount");
function asClassComponent$1(component13) {
  return class extends Svelte4Component {
    /** @param {any} options */
    constructor(options2) {
      super({
        component: component13,
        ...options2
      });
    }
  };
}
__name(asClassComponent$1, "asClassComponent$1");
var Svelte4Component = /* @__PURE__ */ __name(class {
  /** @type {any} */
  #events;
  /** @type {Record<string, any>} */
  #instance;
  /**
   * @param {ComponentConstructorOptions & {
   *  component: any;
   * }} options
   */
  constructor(options2) {
    var sources = /* @__PURE__ */ new Map();
    var add_source = /* @__PURE__ */ __name((key2, value) => {
      var s3 = mutable_source(value, false, false);
      sources.set(key2, s3);
      return s3;
    }, "add_source");
    const props = new Proxy(
      { ...options2.props || {}, $$events: {} },
      {
        get(target, prop) {
          return get(sources.get(prop) ?? add_source(prop, Reflect.get(target, prop)));
        },
        has(target, prop) {
          if (prop === LEGACY_PROPS)
            return true;
          get(sources.get(prop) ?? add_source(prop, Reflect.get(target, prop)));
          return Reflect.has(target, prop);
        },
        set(target, prop, value) {
          set(sources.get(prop) ?? add_source(prop, value), value);
          return Reflect.set(target, prop, value);
        }
      }
    );
    this.#instance = (options2.hydrate ? hydrate : mount)(options2.component, {
      target: options2.target,
      anchor: options2.anchor,
      props,
      context: options2.context,
      intro: options2.intro ?? false,
      recover: options2.recover
    });
    if (!options2?.props?.$$host || options2.sync === false) {
      flushSync();
    }
    this.#events = props.$$events;
    for (const key2 of Object.keys(this.#instance)) {
      if (key2 === "$set" || key2 === "$destroy" || key2 === "$on")
        continue;
      define_property(this, key2, {
        get() {
          return this.#instance[key2];
        },
        /** @param {any} value */
        set(value) {
          this.#instance[key2] = value;
        },
        enumerable: true
      });
    }
    this.#instance.$set = /** @param {Record<string, any>} next */
    (next) => {
      Object.assign(props, next);
    };
    this.#instance.$destroy = () => {
      unmount(this.#instance);
    };
  }
  /** @param {Record<string, any>} props */
  $set(props) {
    this.#instance.$set(props);
  }
  /**
   * @param {string} event
   * @param {(...args: any[]) => any} callback
   * @returns {any}
   */
  $on(event, callback) {
    this.#events[event] = this.#events[event] || [];
    const cb = /* @__PURE__ */ __name((...args) => callback.call(this, ...args), "cb");
    this.#events[event].push(cb);
    return () => {
      this.#events[event] = this.#events[event].filter(
        /** @param {any} fn */
        (fn) => fn !== cb
      );
    };
  }
  $destroy() {
    this.#instance.$destroy();
  }
}, "Svelte4Component");
var read_implementation = null;
function set_read_implementation(fn) {
  read_implementation = fn;
}
__name(set_read_implementation, "set_read_implementation");
function asClassComponent(component13) {
  const component_constructor = asClassComponent$1(component13);
  const _render = /* @__PURE__ */ __name((props, { context: context22 } = {}) => {
    const result = render(component13, { props, context: context22 });
    return {
      css: { code: "", map: null },
      head: result.head,
      html: result.body
    };
  }, "_render");
  component_constructor.render = _render;
  return component_constructor;
}
__name(asClassComponent, "asClassComponent");
function Root($$payload, $$props) {
  push();
  let {
    stores: stores2,
    page: page2,
    constructors,
    components = [],
    form,
    data_0 = null,
    data_1 = null
  } = $$props;
  {
    setContext("__svelte__", stores2);
  }
  {
    stores2.page.set(page2);
  }
  const Pyramid_1 = constructors[1];
  if (constructors[1]) {
    $$payload.out.push("<!--[-->");
    const Pyramid_0 = constructors[0];
    $$payload.out.push(`<!---->`);
    Pyramid_0($$payload, {
      data: data_0,
      form,
      params: page2.params,
      children: ($$payload2) => {
        $$payload2.out.push(`<!---->`);
        Pyramid_1($$payload2, { data: data_1, form, params: page2.params });
        $$payload2.out.push(`<!---->`);
      },
      $$slots: { default: true }
    });
    $$payload.out.push(`<!---->`);
  } else {
    $$payload.out.push("<!--[!-->");
    const Pyramid_0 = constructors[0];
    $$payload.out.push(`<!---->`);
    Pyramid_0($$payload, { data: data_0, form, params: page2.params });
    $$payload.out.push(`<!---->`);
  }
  $$payload.out.push(`<!--]--> `);
  {
    $$payload.out.push("<!--[!-->");
  }
  $$payload.out.push(`<!--]-->`);
  pop();
}
__name(Root, "Root");
var root = asClassComponent(Root);
var options = {
  app_template_contains_nonce: false,
  csp: { "mode": "auto", "directives": { "upgrade-insecure-requests": false, "block-all-mixed-content": false }, "reportOnly": { "upgrade-insecure-requests": false, "block-all-mixed-content": false } },
  csrf_check_origin: true,
  embedded: false,
  env_public_prefix: "PUBLIC_",
  env_private_prefix: "",
  hash_routing: false,
  hooks: null,
  // added lazily, via `get_hooks`
  preload_strategy: "modulepreload",
  root,
  service_worker: false,
  templates: {
    app: ({ head: head2, body: body2, assets: assets2, nonce, env: env2 }) => '<!DOCTYPE html>\n<html lang="en">\n	<head>\n		<meta charset="utf-8" />\n		<link rel="icon" href="' + assets2 + '/favicon.png" />\n		<meta name="viewport" content="width=device-width" />\n		' + head2 + '\n	</head>\n	<body data-sveltekit-preload-data="hover">\n		<div style="display: contents">' + body2 + "</div>\n	</body>\n</html>",
    error: ({ status, message }) => '<!doctype html>\n<html lang="en">\n	<head>\n		<meta charset="utf-8" />\n		<title>' + message + `</title>

		<style>
			body {
				--bg: white;
				--fg: #222;
				--divider: #ccc;
				background: var(--bg);
				color: var(--fg);
				font-family:
					system-ui,
					-apple-system,
					BlinkMacSystemFont,
					'Segoe UI',
					Roboto,
					Oxygen,
					Ubuntu,
					Cantarell,
					'Open Sans',
					'Helvetica Neue',
					sans-serif;
				display: flex;
				align-items: center;
				justify-content: center;
				height: 100vh;
				margin: 0;
			}

			.error {
				display: flex;
				align-items: center;
				max-width: 32rem;
				margin: 0 1rem;
			}

			.status {
				font-weight: 200;
				font-size: 3rem;
				line-height: 1;
				position: relative;
				top: -0.05rem;
			}

			.message {
				border-left: 1px solid var(--divider);
				padding: 0 0 0 1rem;
				margin: 0 0 0 1rem;
				min-height: 2.5rem;
				display: flex;
				align-items: center;
			}

			.message h1 {
				font-weight: 400;
				font-size: 1em;
				margin: 0;
			}

			@media (prefers-color-scheme: dark) {
				body {
					--bg: #222;
					--fg: #ddd;
					--divider: #666;
				}
			}
		</style>
	</head>
	<body>
		<div class="error">
			<span class="status">` + status + '</span>\n			<div class="message">\n				<h1>' + message + "</h1>\n			</div>\n		</div>\n	</body>\n</html>\n"
  },
  version_hash: "12njquz"
};
async function get_hooks() {
  let handle;
  let handleFetch;
  let handleError;
  let handleValidationError;
  let init2;
  let reroute;
  let transport;
  return {
    handle,
    handleFetch,
    handleError,
    handleValidationError,
    init: init2,
    reroute,
    transport
  };
}
__name(get_hooks, "get_hooks");
var SVELTE_KIT_ASSETS = "/_svelte_kit_assets";
var ENDPOINT_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"];
var PAGE_METHODS = ["GET", "POST", "HEAD"];
function negotiate(accept, types) {
  const parts = [];
  accept.split(",").forEach((str, i) => {
    const match = /([^/ \t]+)\/([^; \t]+)[ \t]*(?:;[ \t]*q=([0-9.]+))?/.exec(str);
    if (match) {
      const [, type, subtype, q = "1"] = match;
      parts.push({ type, subtype, q: +q, i });
    }
  });
  parts.sort((a, b) => {
    if (a.q !== b.q) {
      return b.q - a.q;
    }
    if (a.subtype === "*" !== (b.subtype === "*")) {
      return a.subtype === "*" ? 1 : -1;
    }
    if (a.type === "*" !== (b.type === "*")) {
      return a.type === "*" ? 1 : -1;
    }
    return a.i - b.i;
  });
  let accepted;
  let min_priority = Infinity;
  for (const mimetype of types) {
    const [type, subtype] = mimetype.split("/");
    const priority = parts.findIndex(
      (part) => (part.type === type || part.type === "*") && (part.subtype === subtype || part.subtype === "*")
    );
    if (priority !== -1 && priority < min_priority) {
      accepted = mimetype;
      min_priority = priority;
    }
  }
  return accepted;
}
__name(negotiate, "negotiate");
function is_content_type(request, ...types) {
  const type = request.headers.get("content-type")?.split(";", 1)[0].trim() ?? "";
  return types.includes(type.toLowerCase());
}
__name(is_content_type, "is_content_type");
function is_form_content_type(request) {
  return is_content_type(
    request,
    "application/x-www-form-urlencoded",
    "multipart/form-data",
    "text/plain"
  );
}
__name(is_form_content_type, "is_form_content_type");
function coalesce_to_error(err) {
  return err instanceof Error || err && /** @type {any} */
  err.name && /** @type {any} */
  err.message ? (
    /** @type {Error} */
    err
  ) : new Error(JSON.stringify(err));
}
__name(coalesce_to_error, "coalesce_to_error");
function normalize_error(error22) {
  return (
    /** @type {import('../exports/internal/index.js').Redirect | HttpError | SvelteKitError | Error} */
    error22
  );
}
__name(normalize_error, "normalize_error");
function get_status(error22) {
  return error22 instanceof HttpError || error22 instanceof SvelteKitError ? error22.status : 500;
}
__name(get_status, "get_status");
function get_message(error22) {
  return error22 instanceof SvelteKitError ? error22.text : "Internal Error";
}
__name(get_message, "get_message");
var escape_html_attr_dict = {
  "&": "&amp;",
  '"': "&quot;"
  // Svelte also escapes < because the escape function could be called inside a `noscript` there
  // https://github.com/sveltejs/svelte/security/advisories/GHSA-8266-84wp-wv5c
  // However, that doesn't apply in SvelteKit
};
var escape_html_dict = {
  "&": "&amp;",
  "<": "&lt;"
};
var surrogates = (
  // high surrogate without paired low surrogate
  "[\\ud800-\\udbff](?![\\udc00-\\udfff])|[\\ud800-\\udbff][\\udc00-\\udfff]|[\\udc00-\\udfff]"
);
var escape_html_attr_regex = new RegExp(
  `[${Object.keys(escape_html_attr_dict).join("")}]|` + surrogates,
  "g"
);
var escape_html_regex = new RegExp(
  `[${Object.keys(escape_html_dict).join("")}]|` + surrogates,
  "g"
);
function escape_html2(str, is_attr) {
  const dict = is_attr ? escape_html_attr_dict : escape_html_dict;
  const escaped_str = str.replace(is_attr ? escape_html_attr_regex : escape_html_regex, (match) => {
    if (match.length === 2) {
      return match;
    }
    return dict[match] ?? `&#${match.charCodeAt(0)};`;
  });
  return escaped_str;
}
__name(escape_html2, "escape_html2");
function method_not_allowed(mod, method) {
  return text(`${method} method not allowed`, {
    status: 405,
    headers: {
      // https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/405
      // "The server must generate an Allow header field in a 405 status code response"
      allow: allowed_methods(mod).join(", ")
    }
  });
}
__name(method_not_allowed, "method_not_allowed");
function allowed_methods(mod) {
  const allowed = ENDPOINT_METHODS.filter((method) => method in mod);
  if ("GET" in mod || "HEAD" in mod)
    allowed.push("HEAD");
  return allowed;
}
__name(allowed_methods, "allowed_methods");
function static_error_page(options2, status, message) {
  let page2 = options2.templates.error({ status, message: escape_html2(message) });
  return text(page2, {
    headers: { "content-type": "text/html; charset=utf-8" },
    status
  });
}
__name(static_error_page, "static_error_page");
async function handle_fatal_error(event, options2, error22) {
  error22 = error22 instanceof HttpError ? error22 : coalesce_to_error(error22);
  const status = get_status(error22);
  const body2 = await handle_error_and_jsonify(event, options2, error22);
  const type = negotiate(event.request.headers.get("accept") || "text/html", [
    "application/json",
    "text/html"
  ]);
  if (event.isDataRequest || type === "application/json") {
    return json(body2, {
      status
    });
  }
  return static_error_page(options2, status, body2.message);
}
__name(handle_fatal_error, "handle_fatal_error");
async function handle_error_and_jsonify(event, options2, error22) {
  if (error22 instanceof HttpError) {
    return error22.body;
  }
  const status = get_status(error22);
  const message = get_message(error22);
  return await with_event(
    event,
    () => options2.hooks.handleError({ error: error22, event, status, message })
  ) ?? { message };
}
__name(handle_error_and_jsonify, "handle_error_and_jsonify");
function redirect_response(status, location) {
  const response = new Response(void 0, {
    status,
    headers: { location }
  });
  return response;
}
__name(redirect_response, "redirect_response");
function clarify_devalue_error(event, error22) {
  if (error22.path) {
    return `Data returned from \`load\` while rendering ${event.route.id} is not serializable: ${error22.message} (${error22.path}). If you need to serialize/deserialize custom types, use transport hooks: https://svelte.dev/docs/kit/hooks#Universal-hooks-transport.`;
  }
  if (error22.path === "") {
    return `Data returned from \`load\` while rendering ${event.route.id} is not a plain object`;
  }
  return error22.message;
}
__name(clarify_devalue_error, "clarify_devalue_error");
function serialize_uses(node) {
  const uses = {};
  if (node.uses && node.uses.dependencies.size > 0) {
    uses.dependencies = Array.from(node.uses.dependencies);
  }
  if (node.uses && node.uses.search_params.size > 0) {
    uses.search_params = Array.from(node.uses.search_params);
  }
  if (node.uses && node.uses.params.size > 0) {
    uses.params = Array.from(node.uses.params);
  }
  if (node.uses?.parent)
    uses.parent = 1;
  if (node.uses?.route)
    uses.route = 1;
  if (node.uses?.url)
    uses.url = 1;
  return uses;
}
__name(serialize_uses, "serialize_uses");
function has_prerendered_path(manifest2, pathname) {
  return manifest2._.prerendered_routes.has(pathname) || pathname.at(-1) === "/" && manifest2._.prerendered_routes.has(pathname.slice(0, -1));
}
__name(has_prerendered_path, "has_prerendered_path");
async function render_endpoint(event, mod, state2) {
  const method = (
    /** @type {import('types').HttpMethod} */
    event.request.method
  );
  let handler = mod[method] || mod.fallback;
  if (method === "HEAD" && !mod.HEAD && mod.GET) {
    handler = mod.GET;
  }
  if (!handler) {
    return method_not_allowed(mod, method);
  }
  const prerender2 = mod.prerender ?? state2.prerender_default;
  if (prerender2 && (mod.POST || mod.PATCH || mod.PUT || mod.DELETE)) {
    throw new Error("Cannot prerender endpoints that have mutative methods");
  }
  if (state2.prerendering && !state2.prerendering.inside_reroute && !prerender2) {
    if (state2.depth > 0) {
      throw new Error(`${event.route.id} is not prerenderable`);
    } else {
      return new Response(void 0, { status: 204 });
    }
  }
  try {
    const response = await with_event(
      event,
      () => handler(
        /** @type {import('@sveltejs/kit').RequestEvent<Record<string, any>>} */
        event
      )
    );
    if (!(response instanceof Response)) {
      throw new Error(
        `Invalid response from route ${event.url.pathname}: handler should return a Response object`
      );
    }
    if (state2.prerendering && (!state2.prerendering.inside_reroute || prerender2)) {
      const cloned = new Response(response.clone().body, {
        status: response.status,
        statusText: response.statusText,
        headers: new Headers(response.headers)
      });
      cloned.headers.set("x-sveltekit-prerender", String(prerender2));
      if (state2.prerendering.inside_reroute && prerender2) {
        cloned.headers.set(
          "x-sveltekit-routeid",
          encodeURI(
            /** @type {string} */
            event.route.id
          )
        );
        state2.prerendering.dependencies.set(event.url.pathname, { response: cloned, body: null });
      } else {
        return cloned;
      }
    }
    return response;
  } catch (e3) {
    if (e3 instanceof Redirect) {
      return new Response(void 0, {
        status: e3.status,
        headers: { location: e3.location }
      });
    }
    throw e3;
  }
}
__name(render_endpoint, "render_endpoint");
function is_endpoint_request(event) {
  const { method, headers: headers2 } = event.request;
  if (ENDPOINT_METHODS.includes(method) && !PAGE_METHODS.includes(method)) {
    return true;
  }
  if (method === "POST" && headers2.get("x-sveltekit-action") === "true")
    return false;
  const accept = event.request.headers.get("accept") ?? "*/*";
  return negotiate(accept, ["*", "text/html"]) !== "text/html";
}
__name(is_endpoint_request, "is_endpoint_request");
function compact(arr) {
  return arr.filter(
    /** @returns {val is NonNullable<T>} */
    (val) => val != null
  );
}
__name(compact, "compact");
var DATA_SUFFIX = "/__data.json";
var HTML_DATA_SUFFIX = ".html__data.json";
function has_data_suffix2(pathname) {
  return pathname.endsWith(DATA_SUFFIX) || pathname.endsWith(HTML_DATA_SUFFIX);
}
__name(has_data_suffix2, "has_data_suffix2");
function add_data_suffix2(pathname) {
  if (pathname.endsWith(".html"))
    return pathname.replace(/\.html$/, HTML_DATA_SUFFIX);
  return pathname.replace(/\/$/, "") + DATA_SUFFIX;
}
__name(add_data_suffix2, "add_data_suffix2");
function strip_data_suffix2(pathname) {
  if (pathname.endsWith(HTML_DATA_SUFFIX)) {
    return pathname.slice(0, -HTML_DATA_SUFFIX.length) + ".html";
  }
  return pathname.slice(0, -DATA_SUFFIX.length);
}
__name(strip_data_suffix2, "strip_data_suffix2");
var ROUTE_SUFFIX = "/__route.js";
function has_resolution_suffix2(pathname) {
  return pathname.endsWith(ROUTE_SUFFIX);
}
__name(has_resolution_suffix2, "has_resolution_suffix2");
function add_resolution_suffix2(pathname) {
  return pathname.replace(/\/$/, "") + ROUTE_SUFFIX;
}
__name(add_resolution_suffix2, "add_resolution_suffix2");
function strip_resolution_suffix2(pathname) {
  return pathname.slice(0, -ROUTE_SUFFIX.length);
}
__name(strip_resolution_suffix2, "strip_resolution_suffix2");
var chars$1 = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_$";
var unsafe_chars = /[<\b\f\n\r\t\0\u2028\u2029]/g;
var reserved = /^(?:do|if|in|for|int|let|new|try|var|byte|case|char|else|enum|goto|long|this|void|with|await|break|catch|class|const|final|float|short|super|throw|while|yield|delete|double|export|import|native|return|switch|throws|typeof|boolean|default|extends|finally|package|private|abstract|continue|debugger|function|volatile|interface|protected|transient|implements|instanceof|synchronized)$/;
function uneval(value, replacer) {
  const counts = /* @__PURE__ */ new Map();
  const keys = [];
  const custom = /* @__PURE__ */ new Map();
  function walk(thing) {
    if (typeof thing === "function") {
      throw new DevalueError(`Cannot stringify a function`, keys);
    }
    if (!is_primitive(thing)) {
      if (counts.has(thing)) {
        counts.set(thing, counts.get(thing) + 1);
        return;
      }
      counts.set(thing, 1);
      if (replacer) {
        const str2 = replacer(thing);
        if (typeof str2 === "string") {
          custom.set(thing, str2);
          return;
        }
      }
      const type = get_type(thing);
      switch (type) {
        case "Number":
        case "BigInt":
        case "String":
        case "Boolean":
        case "Date":
        case "RegExp":
          return;
        case "Array":
          thing.forEach((value2, i) => {
            keys.push(`[${i}]`);
            walk(value2);
            keys.pop();
          });
          break;
        case "Set":
          Array.from(thing).forEach(walk);
          break;
        case "Map":
          for (const [key2, value2] of thing) {
            keys.push(
              `.get(${is_primitive(key2) ? stringify_primitive2(key2) : "..."})`
            );
            walk(value2);
            keys.pop();
          }
          break;
        case "Int8Array":
        case "Uint8Array":
        case "Uint8ClampedArray":
        case "Int16Array":
        case "Uint16Array":
        case "Int32Array":
        case "Uint32Array":
        case "Float32Array":
        case "Float64Array":
        case "BigInt64Array":
        case "BigUint64Array":
          return;
        case "ArrayBuffer":
          return;
        default:
          if (!is_plain_object(thing)) {
            throw new DevalueError(
              `Cannot stringify arbitrary non-POJOs`,
              keys
            );
          }
          if (enumerable_symbols(thing).length > 0) {
            throw new DevalueError(
              `Cannot stringify POJOs with symbolic keys`,
              keys
            );
          }
          for (const key2 in thing) {
            keys.push(stringify_key(key2));
            walk(thing[key2]);
            keys.pop();
          }
      }
    }
  }
  __name(walk, "walk");
  walk(value);
  const names = /* @__PURE__ */ new Map();
  Array.from(counts).filter((entry) => entry[1] > 1).sort((a, b) => b[1] - a[1]).forEach((entry, i) => {
    names.set(entry[0], get_name(i));
  });
  function stringify22(thing) {
    if (names.has(thing)) {
      return names.get(thing);
    }
    if (is_primitive(thing)) {
      return stringify_primitive2(thing);
    }
    if (custom.has(thing)) {
      return custom.get(thing);
    }
    const type = get_type(thing);
    switch (type) {
      case "Number":
      case "String":
      case "Boolean":
        return `Object(${stringify22(thing.valueOf())})`;
      case "RegExp":
        return `new RegExp(${stringify_string(thing.source)}, "${thing.flags}")`;
      case "Date":
        return `new Date(${thing.getTime()})`;
      case "Array":
        const members = (
          /** @type {any[]} */
          thing.map(
            (v, i) => i in thing ? stringify22(v) : ""
          )
        );
        const tail = thing.length === 0 || thing.length - 1 in thing ? "" : ",";
        return `[${members.join(",")}${tail}]`;
      case "Set":
      case "Map":
        return `new ${type}([${Array.from(thing).map(stringify22).join(",")}])`;
      case "Int8Array":
      case "Uint8Array":
      case "Uint8ClampedArray":
      case "Int16Array":
      case "Uint16Array":
      case "Int32Array":
      case "Uint32Array":
      case "Float32Array":
      case "Float64Array":
      case "BigInt64Array":
      case "BigUint64Array": {
        const typedArray = thing;
        return `new ${type}([${typedArray.toString()}])`;
      }
      case "ArrayBuffer": {
        const ui8 = new Uint8Array(thing);
        return `new Uint8Array([${ui8.toString()}]).buffer`;
      }
      default:
        const obj = `{${Object.keys(thing).map((key2) => `${safe_key(key2)}:${stringify22(thing[key2])}`).join(",")}}`;
        const proto = Object.getPrototypeOf(thing);
        if (proto === null) {
          return Object.keys(thing).length > 0 ? `Object.assign(Object.create(null),${obj})` : `Object.create(null)`;
        }
        return obj;
    }
  }
  __name(stringify22, "stringify22");
  const str = stringify22(value);
  if (names.size) {
    const params = [];
    const statements = [];
    const values = [];
    names.forEach((name, thing) => {
      params.push(name);
      if (custom.has(thing)) {
        values.push(
          /** @type {string} */
          custom.get(thing)
        );
        return;
      }
      if (is_primitive(thing)) {
        values.push(stringify_primitive2(thing));
        return;
      }
      const type = get_type(thing);
      switch (type) {
        case "Number":
        case "String":
        case "Boolean":
          values.push(`Object(${stringify22(thing.valueOf())})`);
          break;
        case "RegExp":
          values.push(thing.toString());
          break;
        case "Date":
          values.push(`new Date(${thing.getTime()})`);
          break;
        case "Array":
          values.push(`Array(${thing.length})`);
          thing.forEach((v, i) => {
            statements.push(`${name}[${i}]=${stringify22(v)}`);
          });
          break;
        case "Set":
          values.push(`new Set`);
          statements.push(
            `${name}.${Array.from(thing).map((v) => `add(${stringify22(v)})`).join(".")}`
          );
          break;
        case "Map":
          values.push(`new Map`);
          statements.push(
            `${name}.${Array.from(thing).map(([k, v]) => `set(${stringify22(k)}, ${stringify22(v)})`).join(".")}`
          );
          break;
        default:
          values.push(
            Object.getPrototypeOf(thing) === null ? "Object.create(null)" : "{}"
          );
          Object.keys(thing).forEach((key2) => {
            statements.push(
              `${name}${safe_prop(key2)}=${stringify22(thing[key2])}`
            );
          });
      }
    });
    statements.push(`return ${str}`);
    return `(function(${params.join(",")}){${statements.join(
      ";"
    )}}(${values.join(",")}))`;
  } else {
    return str;
  }
}
__name(uneval, "uneval");
function get_name(num) {
  let name = "";
  do {
    name = chars$1[num % chars$1.length] + name;
    num = ~~(num / chars$1.length) - 1;
  } while (num >= 0);
  return reserved.test(name) ? `${name}0` : name;
}
__name(get_name, "get_name");
function escape_unsafe_char(c2) {
  return escaped[c2] || c2;
}
__name(escape_unsafe_char, "escape_unsafe_char");
function escape_unsafe_chars(str) {
  return str.replace(unsafe_chars, escape_unsafe_char);
}
__name(escape_unsafe_chars, "escape_unsafe_chars");
function safe_key(key2) {
  return /^[_$a-zA-Z][_$a-zA-Z0-9]*$/.test(key2) ? key2 : escape_unsafe_chars(JSON.stringify(key2));
}
__name(safe_key, "safe_key");
function safe_prop(key2) {
  return /^[_$a-zA-Z][_$a-zA-Z0-9]*$/.test(key2) ? `.${key2}` : `[${escape_unsafe_chars(JSON.stringify(key2))}]`;
}
__name(safe_prop, "safe_prop");
function stringify_primitive2(thing) {
  if (typeof thing === "string")
    return stringify_string(thing);
  if (thing === void 0)
    return "void 0";
  if (thing === 0 && 1 / thing < 0)
    return "-0";
  const str = String(thing);
  if (typeof thing === "number")
    return str.replace(/^(-)?0\./, "$1.");
  if (typeof thing === "bigint")
    return thing + "n";
  return str;
}
__name(stringify_primitive2, "stringify_primitive2");
function is_action_json_request(event) {
  const accept = negotiate(event.request.headers.get("accept") ?? "*/*", [
    "application/json",
    "text/html"
  ]);
  return accept === "application/json" && event.request.method === "POST";
}
__name(is_action_json_request, "is_action_json_request");
async function handle_action_json_request(event, options2, server2) {
  const actions = server2?.actions;
  if (!actions) {
    const no_actions_error = new SvelteKitError(
      405,
      "Method Not Allowed",
      `POST method not allowed. No form actions exist for ${"this page"}`
    );
    return action_json(
      {
        type: "error",
        error: await handle_error_and_jsonify(event, options2, no_actions_error)
      },
      {
        status: no_actions_error.status,
        headers: {
          // https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/405
          // "The server must generate an Allow header field in a 405 status code response"
          allow: "GET"
        }
      }
    );
  }
  check_named_default_separate(actions);
  try {
    const data = await call_action(event, actions);
    if (false)
      ;
    if (data instanceof ActionFailure) {
      return action_json({
        type: "failure",
        status: data.status,
        // @ts-expect-error we assign a string to what is supposed to be an object. That's ok
        // because we don't use the object outside, and this way we have better code navigation
        // through knowing where the related interface is used.
        data: stringify_action_response(
          data.data,
          /** @type {string} */
          event.route.id,
          options2.hooks.transport
        )
      });
    } else {
      return action_json({
        type: "success",
        status: data ? 200 : 204,
        // @ts-expect-error see comment above
        data: stringify_action_response(
          data,
          /** @type {string} */
          event.route.id,
          options2.hooks.transport
        )
      });
    }
  } catch (e3) {
    const err = normalize_error(e3);
    if (err instanceof Redirect) {
      return action_json_redirect(err);
    }
    return action_json(
      {
        type: "error",
        error: await handle_error_and_jsonify(event, options2, check_incorrect_fail_use(err))
      },
      {
        status: get_status(err)
      }
    );
  }
}
__name(handle_action_json_request, "handle_action_json_request");
function check_incorrect_fail_use(error22) {
  return error22 instanceof ActionFailure ? new Error('Cannot "throw fail()". Use "return fail()"') : error22;
}
__name(check_incorrect_fail_use, "check_incorrect_fail_use");
function action_json_redirect(redirect) {
  return action_json({
    type: "redirect",
    status: redirect.status,
    location: redirect.location
  });
}
__name(action_json_redirect, "action_json_redirect");
function action_json(data, init2) {
  return json(data, init2);
}
__name(action_json, "action_json");
function is_action_request(event) {
  return event.request.method === "POST";
}
__name(is_action_request, "is_action_request");
async function handle_action_request(event, server2) {
  const actions = server2?.actions;
  if (!actions) {
    event.setHeaders({
      // https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/405
      // "The server must generate an Allow header field in a 405 status code response"
      allow: "GET"
    });
    return {
      type: "error",
      error: new SvelteKitError(
        405,
        "Method Not Allowed",
        `POST method not allowed. No form actions exist for ${"this page"}`
      )
    };
  }
  check_named_default_separate(actions);
  try {
    const data = await call_action(event, actions);
    if (false)
      ;
    if (data instanceof ActionFailure) {
      return {
        type: "failure",
        status: data.status,
        data: data.data
      };
    } else {
      return {
        type: "success",
        status: 200,
        // @ts-expect-error this will be removed upon serialization, so `undefined` is the same as omission
        data
      };
    }
  } catch (e3) {
    const err = normalize_error(e3);
    if (err instanceof Redirect) {
      return {
        type: "redirect",
        status: err.status,
        location: err.location
      };
    }
    return {
      type: "error",
      error: check_incorrect_fail_use(err)
    };
  }
}
__name(handle_action_request, "handle_action_request");
function check_named_default_separate(actions) {
  if (actions.default && Object.keys(actions).length > 1) {
    throw new Error(
      "When using named actions, the default action cannot be used. See the docs for more info: https://svelte.dev/docs/kit/form-actions#named-actions"
    );
  }
}
__name(check_named_default_separate, "check_named_default_separate");
async function call_action(event, actions) {
  const url = new URL(event.request.url);
  let name = "default";
  for (const param of url.searchParams) {
    if (param[0].startsWith("/")) {
      name = param[0].slice(1);
      if (name === "default") {
        throw new Error('Cannot use reserved action name "default"');
      }
      break;
    }
  }
  const action = actions[name];
  if (!action) {
    throw new SvelteKitError(404, "Not Found", `No action with name '${name}' found`);
  }
  if (!is_form_content_type(event.request)) {
    throw new SvelteKitError(
      415,
      "Unsupported Media Type",
      `Form actions expect form-encoded data \u2014 received ${event.request.headers.get(
        "content-type"
      )}`
    );
  }
  return with_event(event, () => action(event));
}
__name(call_action, "call_action");
function uneval_action_response(data, route_id, transport) {
  const replacer = /* @__PURE__ */ __name((thing) => {
    for (const key2 in transport) {
      const encoded = transport[key2].encode(thing);
      if (encoded) {
        return `app.decode('${key2}', ${uneval(encoded, replacer)})`;
      }
    }
  }, "replacer");
  return try_serialize(data, (value) => uneval(value, replacer), route_id);
}
__name(uneval_action_response, "uneval_action_response");
function stringify_action_response(data, route_id, transport) {
  const encoders = Object.fromEntries(
    Object.entries(transport).map(([key2, value]) => [key2, value.encode])
  );
  return try_serialize(data, (value) => stringify$1(value, encoders), route_id);
}
__name(stringify_action_response, "stringify_action_response");
function try_serialize(data, fn, route_id) {
  try {
    return fn(data);
  } catch (e3) {
    const error22 = (
      /** @type {any} */
      e3
    );
    if (data instanceof Response) {
      throw new Error(
        `Data returned from action inside ${route_id} is not serializable. Form actions need to return plain objects or fail(). E.g. return { success: true } or return fail(400, { message: "invalid" });`
      );
    }
    if ("path" in error22) {
      let message = `Data returned from action inside ${route_id} is not serializable: ${error22.message}`;
      if (error22.path !== "")
        message += ` (data.${error22.path})`;
      throw new Error(message);
    }
    throw error22;
  }
}
__name(try_serialize, "try_serialize");
function b64_encode(buffer) {
  if (globalThis.Buffer) {
    return Buffer.from(buffer).toString("base64");
  }
  const little_endian = new Uint8Array(new Uint16Array([1]).buffer)[0] > 0;
  return btoa(
    new TextDecoder(little_endian ? "utf-16le" : "utf-16be").decode(
      new Uint16Array(new Uint8Array(buffer))
    )
  );
}
__name(b64_encode, "b64_encode");
function get_relative_path(from, to) {
  const from_parts = from.split(/[/\\]/);
  const to_parts = to.split(/[/\\]/);
  from_parts.pop();
  while (from_parts[0] === to_parts[0]) {
    from_parts.shift();
    to_parts.shift();
  }
  let i = from_parts.length;
  while (i--)
    from_parts[i] = "..";
  return from_parts.concat(to_parts).join("/");
}
__name(get_relative_path, "get_relative_path");
async function load_server_data({ event, state: state2, node, parent }) {
  if (!node?.server)
    return null;
  let is_tracking = true;
  const uses = {
    dependencies: /* @__PURE__ */ new Set(),
    params: /* @__PURE__ */ new Set(),
    parent: false,
    route: false,
    url: false,
    search_params: /* @__PURE__ */ new Set()
  };
  const load3 = node.server.load;
  const slash = node.server.trailingSlash;
  if (!load3) {
    return { type: "data", data: null, uses, slash };
  }
  const url = make_trackable(
    event.url,
    () => {
      if (is_tracking) {
        uses.url = true;
      }
    },
    (param) => {
      if (is_tracking) {
        uses.search_params.add(param);
      }
    }
  );
  if (state2.prerendering) {
    disable_search(url);
  }
  let done = false;
  const result = await with_event(
    event,
    () => load3.call(null, {
      ...event,
      fetch: (info3, init2) => {
        const url2 = new URL(info3 instanceof Request ? info3.url : info3, event.url);
        if (DEV && done && !uses.dependencies.has(url2.href))
          ;
        return event.fetch(info3, init2);
      },
      /** @param {string[]} deps */
      depends: (...deps) => {
        for (const dep of deps) {
          const { href } = new URL(dep, event.url);
          if (DEV)
            ;
          uses.dependencies.add(href);
        }
      },
      params: new Proxy(event.params, {
        get: (target, key2) => {
          if (DEV && done && typeof key2 === "string" && !uses.params.has(key2))
            ;
          if (is_tracking) {
            uses.params.add(key2);
          }
          return target[
            /** @type {string} */
            key2
          ];
        }
      }),
      parent: async () => {
        if (DEV && done && !uses.parent)
          ;
        if (is_tracking) {
          uses.parent = true;
        }
        return parent();
      },
      route: new Proxy(event.route, {
        get: (target, key2) => {
          if (DEV && done && typeof key2 === "string" && !uses.route)
            ;
          if (is_tracking) {
            uses.route = true;
          }
          return target[
            /** @type {'id'} */
            key2
          ];
        }
      }),
      url,
      untrack(fn) {
        is_tracking = false;
        try {
          return fn();
        } finally {
          is_tracking = true;
        }
      }
    })
  );
  done = true;
  return {
    type: "data",
    data: result ?? null,
    uses,
    slash
  };
}
__name(load_server_data, "load_server_data");
async function load_data({
  event,
  fetched,
  node,
  parent,
  server_data_promise,
  state: state2,
  resolve_opts,
  csr
}) {
  const server_data_node = await server_data_promise;
  const load3 = node?.universal?.load;
  if (!load3) {
    return server_data_node?.data ?? null;
  }
  const result = await with_event(
    event,
    () => load3.call(null, {
      url: event.url,
      params: event.params,
      data: server_data_node?.data ?? null,
      route: event.route,
      fetch: create_universal_fetch(event, state2, fetched, csr, resolve_opts),
      setHeaders: event.setHeaders,
      depends: () => {
      },
      parent,
      untrack: (fn) => fn()
    })
  );
  return result ?? null;
}
__name(load_data, "load_data");
function create_universal_fetch(event, state2, fetched, csr, resolve_opts) {
  const universal_fetch = /* @__PURE__ */ __name(async (input, init2) => {
    const cloned_body = input instanceof Request && input.body ? input.clone().body : null;
    const cloned_headers = input instanceof Request && [...input.headers].length ? new Headers(input.headers) : init2?.headers;
    let response = await event.fetch(input, init2);
    const url = new URL(input instanceof Request ? input.url : input, event.url);
    const same_origin = url.origin === event.url.origin;
    let dependency;
    if (same_origin) {
      if (state2.prerendering) {
        dependency = { response, body: null };
        state2.prerendering.dependencies.set(url.pathname, dependency);
      }
    } else if (url.protocol === "https:" || url.protocol === "http:") {
      const mode = input instanceof Request ? input.mode : init2?.mode ?? "cors";
      if (mode === "no-cors") {
        response = new Response("", {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers
        });
      } else {
        const acao = response.headers.get("access-control-allow-origin");
        if (!acao || acao !== event.url.origin && acao !== "*") {
          throw new Error(
            `CORS error: ${acao ? "Incorrect" : "No"} 'Access-Control-Allow-Origin' header is present on the requested resource`
          );
        }
      }
    }
    const proxy2 = new Proxy(response, {
      get(response2, key2, _receiver) {
        async function push_fetched(body2, is_b64) {
          const status_number = Number(response2.status);
          if (isNaN(status_number)) {
            throw new Error(
              `response.status is not a number. value: "${response2.status}" type: ${typeof response2.status}`
            );
          }
          fetched.push({
            url: same_origin ? url.href.slice(event.url.origin.length) : url.href,
            method: event.request.method,
            request_body: (
              /** @type {string | ArrayBufferView | undefined} */
              input instanceof Request && cloned_body ? await stream_to_string(cloned_body) : init2?.body
            ),
            request_headers: cloned_headers,
            response_body: body2,
            response: response2,
            is_b64
          });
        }
        __name(push_fetched, "push_fetched");
        if (key2 === "arrayBuffer") {
          return async () => {
            const buffer = await response2.arrayBuffer();
            if (dependency) {
              dependency.body = new Uint8Array(buffer);
            }
            if (buffer instanceof ArrayBuffer) {
              await push_fetched(b64_encode(buffer), true);
            }
            return buffer;
          };
        }
        async function text2() {
          const body2 = await response2.text();
          if (!body2 || typeof body2 === "string") {
            await push_fetched(body2, false);
          }
          if (dependency) {
            dependency.body = body2;
          }
          return body2;
        }
        __name(text2, "text2");
        if (key2 === "text") {
          return text2;
        }
        if (key2 === "json") {
          return async () => {
            return JSON.parse(await text2());
          };
        }
        return Reflect.get(response2, key2, response2);
      }
    });
    if (csr) {
      const get3 = response.headers.get;
      response.headers.get = (key2) => {
        const lower = key2.toLowerCase();
        const value = get3.call(response.headers, lower);
        if (value && !lower.startsWith("x-sveltekit-")) {
          const included = resolve_opts.filterSerializedResponseHeaders(lower, value);
          if (!included) {
            throw new Error(
              `Failed to get response header "${lower}" \u2014 it must be included by the \`filterSerializedResponseHeaders\` option: https://svelte.dev/docs/kit/hooks#Server-hooks-handle (at ${event.route.id})`
            );
          }
        }
        return value;
      };
    }
    return proxy2;
  }, "universal_fetch");
  return (input, init2) => {
    const response = universal_fetch(input, init2);
    response.catch(() => {
    });
    return response;
  };
}
__name(create_universal_fetch, "create_universal_fetch");
async function stream_to_string(stream) {
  let result = "";
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    result += decoder.decode(value);
  }
  return result;
}
__name(stream_to_string, "stream_to_string");
function hash(...values) {
  let hash2 = 5381;
  for (const value of values) {
    if (typeof value === "string") {
      let i = value.length;
      while (i)
        hash2 = hash2 * 33 ^ value.charCodeAt(--i);
    } else if (ArrayBuffer.isView(value)) {
      const buffer = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
      let i = buffer.length;
      while (i)
        hash2 = hash2 * 33 ^ buffer[--i];
    } else {
      throw new TypeError("value must be a string or TypedArray");
    }
  }
  return (hash2 >>> 0).toString(36);
}
__name(hash, "hash");
var replacements2 = {
  "<": "\\u003C",
  "\u2028": "\\u2028",
  "\u2029": "\\u2029"
};
var pattern = new RegExp(`[${Object.keys(replacements2).join("")}]`, "g");
function serialize_data(fetched, filter, prerendering2 = false) {
  const headers2 = {};
  let cache_control = null;
  let age = null;
  let varyAny = false;
  for (const [key2, value] of fetched.response.headers) {
    if (filter(key2, value)) {
      headers2[key2] = value;
    }
    if (key2 === "cache-control")
      cache_control = value;
    else if (key2 === "age")
      age = value;
    else if (key2 === "vary" && value.trim() === "*")
      varyAny = true;
  }
  const payload = {
    status: fetched.response.status,
    statusText: fetched.response.statusText,
    headers: headers2,
    body: fetched.response_body
  };
  const safe_payload = JSON.stringify(payload).replace(pattern, (match) => replacements2[match]);
  const attrs = [
    'type="application/json"',
    "data-sveltekit-fetched",
    `data-url="${escape_html2(fetched.url, true)}"`
  ];
  if (fetched.is_b64) {
    attrs.push("data-b64");
  }
  if (fetched.request_headers || fetched.request_body) {
    const values = [];
    if (fetched.request_headers) {
      values.push([...new Headers(fetched.request_headers)].join(","));
    }
    if (fetched.request_body) {
      values.push(fetched.request_body);
    }
    attrs.push(`data-hash="${hash(...values)}"`);
  }
  if (!prerendering2 && fetched.method === "GET" && cache_control && !varyAny) {
    const match = /s-maxage=(\d+)/g.exec(cache_control) ?? /max-age=(\d+)/g.exec(cache_control);
    if (match) {
      const ttl = +match[1] - +(age ?? "0");
      attrs.push(`data-ttl="${ttl}"`);
    }
  }
  return `<script ${attrs.join(" ")}>${safe_payload}<\/script>`;
}
__name(serialize_data, "serialize_data");
var s = JSON.stringify;
var encoder$2 = new TextEncoder();
function sha256(data) {
  if (!key[0])
    precompute();
  const out = init.slice(0);
  const array2 = encode(data);
  for (let i = 0; i < array2.length; i += 16) {
    const w = array2.subarray(i, i + 16);
    let tmp;
    let a;
    let b;
    let out0 = out[0];
    let out1 = out[1];
    let out2 = out[2];
    let out3 = out[3];
    let out4 = out[4];
    let out5 = out[5];
    let out6 = out[6];
    let out7 = out[7];
    for (let i2 = 0; i2 < 64; i2++) {
      if (i2 < 16) {
        tmp = w[i2];
      } else {
        a = w[i2 + 1 & 15];
        b = w[i2 + 14 & 15];
        tmp = w[i2 & 15] = (a >>> 7 ^ a >>> 18 ^ a >>> 3 ^ a << 25 ^ a << 14) + (b >>> 17 ^ b >>> 19 ^ b >>> 10 ^ b << 15 ^ b << 13) + w[i2 & 15] + w[i2 + 9 & 15] | 0;
      }
      tmp = tmp + out7 + (out4 >>> 6 ^ out4 >>> 11 ^ out4 >>> 25 ^ out4 << 26 ^ out4 << 21 ^ out4 << 7) + (out6 ^ out4 & (out5 ^ out6)) + key[i2];
      out7 = out6;
      out6 = out5;
      out5 = out4;
      out4 = out3 + tmp | 0;
      out3 = out2;
      out2 = out1;
      out1 = out0;
      out0 = tmp + (out1 & out2 ^ out3 & (out1 ^ out2)) + (out1 >>> 2 ^ out1 >>> 13 ^ out1 >>> 22 ^ out1 << 30 ^ out1 << 19 ^ out1 << 10) | 0;
    }
    out[0] = out[0] + out0 | 0;
    out[1] = out[1] + out1 | 0;
    out[2] = out[2] + out2 | 0;
    out[3] = out[3] + out3 | 0;
    out[4] = out[4] + out4 | 0;
    out[5] = out[5] + out5 | 0;
    out[6] = out[6] + out6 | 0;
    out[7] = out[7] + out7 | 0;
  }
  const bytes = new Uint8Array(out.buffer);
  reverse_endianness(bytes);
  return base64(bytes);
}
__name(sha256, "sha256");
var init = new Uint32Array(8);
var key = new Uint32Array(64);
function precompute() {
  function frac(x) {
    return (x - Math.floor(x)) * 4294967296;
  }
  __name(frac, "frac");
  let prime = 2;
  for (let i = 0; i < 64; prime++) {
    let is_prime = true;
    for (let factor = 2; factor * factor <= prime; factor++) {
      if (prime % factor === 0) {
        is_prime = false;
        break;
      }
    }
    if (is_prime) {
      if (i < 8) {
        init[i] = frac(prime ** (1 / 2));
      }
      key[i] = frac(prime ** (1 / 3));
      i++;
    }
  }
}
__name(precompute, "precompute");
function reverse_endianness(bytes) {
  for (let i = 0; i < bytes.length; i += 4) {
    const a = bytes[i + 0];
    const b = bytes[i + 1];
    const c2 = bytes[i + 2];
    const d = bytes[i + 3];
    bytes[i + 0] = d;
    bytes[i + 1] = c2;
    bytes[i + 2] = b;
    bytes[i + 3] = a;
  }
}
__name(reverse_endianness, "reverse_endianness");
function encode(str) {
  const encoded = encoder$2.encode(str);
  const length = encoded.length * 8;
  const size = 512 * Math.ceil((length + 65) / 512);
  const bytes = new Uint8Array(size / 8);
  bytes.set(encoded);
  bytes[encoded.length] = 128;
  reverse_endianness(bytes);
  const words = new Uint32Array(bytes.buffer);
  words[words.length - 2] = Math.floor(length / 4294967296);
  words[words.length - 1] = length;
  return words;
}
__name(encode, "encode");
var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/".split("");
function base64(bytes) {
  const l = bytes.length;
  let result = "";
  let i;
  for (i = 2; i < l; i += 3) {
    result += chars[bytes[i - 2] >> 2];
    result += chars[(bytes[i - 2] & 3) << 4 | bytes[i - 1] >> 4];
    result += chars[(bytes[i - 1] & 15) << 2 | bytes[i] >> 6];
    result += chars[bytes[i] & 63];
  }
  if (i === l + 1) {
    result += chars[bytes[i - 2] >> 2];
    result += chars[(bytes[i - 2] & 3) << 4];
    result += "==";
  }
  if (i === l) {
    result += chars[bytes[i - 2] >> 2];
    result += chars[(bytes[i - 2] & 3) << 4 | bytes[i - 1] >> 4];
    result += chars[(bytes[i - 1] & 15) << 2];
    result += "=";
  }
  return result;
}
__name(base64, "base64");
var array = new Uint8Array(16);
function generate_nonce() {
  crypto.getRandomValues(array);
  return base64(array);
}
__name(generate_nonce, "generate_nonce");
var quoted = /* @__PURE__ */ new Set([
  "self",
  "unsafe-eval",
  "unsafe-hashes",
  "unsafe-inline",
  "none",
  "strict-dynamic",
  "report-sample",
  "wasm-unsafe-eval",
  "script"
]);
var crypto_pattern = /^(nonce|sha\d\d\d)-/;
var BaseProvider = /* @__PURE__ */ __name(class {
  /** @type {boolean} */
  #use_hashes;
  /** @type {boolean} */
  #script_needs_csp;
  /** @type {boolean} */
  #script_src_needs_csp;
  /** @type {boolean} */
  #script_src_elem_needs_csp;
  /** @type {boolean} */
  #style_needs_csp;
  /** @type {boolean} */
  #style_src_needs_csp;
  /** @type {boolean} */
  #style_src_attr_needs_csp;
  /** @type {boolean} */
  #style_src_elem_needs_csp;
  /** @type {import('types').CspDirectives} */
  #directives;
  /** @type {import('types').Csp.Source[]} */
  #script_src;
  /** @type {import('types').Csp.Source[]} */
  #script_src_elem;
  /** @type {import('types').Csp.Source[]} */
  #style_src;
  /** @type {import('types').Csp.Source[]} */
  #style_src_attr;
  /** @type {import('types').Csp.Source[]} */
  #style_src_elem;
  /** @type {string} */
  #nonce;
  /**
   * @param {boolean} use_hashes
   * @param {import('types').CspDirectives} directives
   * @param {string} nonce
   */
  constructor(use_hashes, directives, nonce) {
    this.#use_hashes = use_hashes;
    this.#directives = directives;
    const d = this.#directives;
    this.#script_src = [];
    this.#script_src_elem = [];
    this.#style_src = [];
    this.#style_src_attr = [];
    this.#style_src_elem = [];
    const effective_script_src = d["script-src"] || d["default-src"];
    const script_src_elem = d["script-src-elem"];
    const effective_style_src = d["style-src"] || d["default-src"];
    const style_src_attr = d["style-src-attr"];
    const style_src_elem = d["style-src-elem"];
    const needs_csp = /* @__PURE__ */ __name((directive) => !!directive && !directive.some((value) => value === "unsafe-inline"), "needs_csp");
    this.#script_src_needs_csp = needs_csp(effective_script_src);
    this.#script_src_elem_needs_csp = needs_csp(script_src_elem);
    this.#style_src_needs_csp = needs_csp(effective_style_src);
    this.#style_src_attr_needs_csp = needs_csp(style_src_attr);
    this.#style_src_elem_needs_csp = needs_csp(style_src_elem);
    this.#script_needs_csp = this.#script_src_needs_csp || this.#script_src_elem_needs_csp;
    this.#style_needs_csp = this.#style_src_needs_csp || this.#style_src_attr_needs_csp || this.#style_src_elem_needs_csp;
    this.script_needs_nonce = this.#script_needs_csp && !this.#use_hashes;
    this.style_needs_nonce = this.#style_needs_csp && !this.#use_hashes;
    this.#nonce = nonce;
  }
  /** @param {string} content */
  add_script(content) {
    if (!this.#script_needs_csp)
      return;
    const source2 = this.#use_hashes ? `sha256-${sha256(content)}` : `nonce-${this.#nonce}`;
    if (this.#script_src_needs_csp) {
      this.#script_src.push(source2);
    }
    if (this.#script_src_elem_needs_csp) {
      this.#script_src_elem.push(source2);
    }
  }
  /** @param {string} content */
  add_style(content) {
    if (!this.#style_needs_csp)
      return;
    const source2 = this.#use_hashes ? `sha256-${sha256(content)}` : `nonce-${this.#nonce}`;
    if (this.#style_src_needs_csp) {
      this.#style_src.push(source2);
    }
    if (this.#style_src_attr_needs_csp) {
      this.#style_src_attr.push(source2);
    }
    if (this.#style_src_elem_needs_csp) {
      const sha256_empty_comment_hash = "sha256-9OlNO0DNEeaVzHL4RZwCLsBHA8WBQ8toBp/4F5XV2nc=";
      const d = this.#directives;
      if (d["style-src-elem"] && !d["style-src-elem"].includes(sha256_empty_comment_hash) && !this.#style_src_elem.includes(sha256_empty_comment_hash)) {
        this.#style_src_elem.push(sha256_empty_comment_hash);
      }
      if (source2 !== sha256_empty_comment_hash) {
        this.#style_src_elem.push(source2);
      }
    }
  }
  /**
   * @param {boolean} [is_meta]
   */
  get_header(is_meta = false) {
    const header = [];
    const directives = { ...this.#directives };
    if (this.#style_src.length > 0) {
      directives["style-src"] = [
        ...directives["style-src"] || directives["default-src"] || [],
        ...this.#style_src
      ];
    }
    if (this.#style_src_attr.length > 0) {
      directives["style-src-attr"] = [
        ...directives["style-src-attr"] || [],
        ...this.#style_src_attr
      ];
    }
    if (this.#style_src_elem.length > 0) {
      directives["style-src-elem"] = [
        ...directives["style-src-elem"] || [],
        ...this.#style_src_elem
      ];
    }
    if (this.#script_src.length > 0) {
      directives["script-src"] = [
        ...directives["script-src"] || directives["default-src"] || [],
        ...this.#script_src
      ];
    }
    if (this.#script_src_elem.length > 0) {
      directives["script-src-elem"] = [
        ...directives["script-src-elem"] || [],
        ...this.#script_src_elem
      ];
    }
    for (const key2 in directives) {
      if (is_meta && (key2 === "frame-ancestors" || key2 === "report-uri" || key2 === "sandbox")) {
        continue;
      }
      const value = (
        /** @type {string[] | true} */
        directives[key2]
      );
      if (!value)
        continue;
      const directive = [key2];
      if (Array.isArray(value)) {
        value.forEach((value2) => {
          if (quoted.has(value2) || crypto_pattern.test(value2)) {
            directive.push(`'${value2}'`);
          } else {
            directive.push(value2);
          }
        });
      }
      header.push(directive.join(" "));
    }
    return header.join("; ");
  }
}, "BaseProvider");
var CspProvider = /* @__PURE__ */ __name(class extends BaseProvider {
  get_meta() {
    const content = this.get_header(true);
    if (!content) {
      return;
    }
    return `<meta http-equiv="content-security-policy" content="${escape_html2(content, true)}">`;
  }
}, "CspProvider");
var CspReportOnlyProvider = /* @__PURE__ */ __name(class extends BaseProvider {
  /**
   * @param {boolean} use_hashes
   * @param {import('types').CspDirectives} directives
   * @param {string} nonce
   */
  constructor(use_hashes, directives, nonce) {
    super(use_hashes, directives, nonce);
    if (Object.values(directives).filter((v) => !!v).length > 0) {
      const has_report_to = directives["report-to"]?.length ?? 0 > 0;
      const has_report_uri = directives["report-uri"]?.length ?? 0 > 0;
      if (!has_report_to && !has_report_uri) {
        throw Error(
          "`content-security-policy-report-only` must be specified with either the `report-to` or `report-uri` directives, or both"
        );
      }
    }
  }
}, "CspReportOnlyProvider");
var Csp = /* @__PURE__ */ __name(class {
  /** @readonly */
  nonce = generate_nonce();
  /** @type {CspProvider} */
  csp_provider;
  /** @type {CspReportOnlyProvider} */
  report_only_provider;
  /**
   * @param {import('./types.js').CspConfig} config
   * @param {import('./types.js').CspOpts} opts
   */
  constructor({ mode, directives, reportOnly }, { prerender: prerender2 }) {
    const use_hashes = mode === "hash" || mode === "auto" && prerender2;
    this.csp_provider = new CspProvider(use_hashes, directives, this.nonce);
    this.report_only_provider = new CspReportOnlyProvider(use_hashes, reportOnly, this.nonce);
  }
  get script_needs_nonce() {
    return this.csp_provider.script_needs_nonce || this.report_only_provider.script_needs_nonce;
  }
  get style_needs_nonce() {
    return this.csp_provider.style_needs_nonce || this.report_only_provider.style_needs_nonce;
  }
  /** @param {string} content */
  add_script(content) {
    this.csp_provider.add_script(content);
    this.report_only_provider.add_script(content);
  }
  /** @param {string} content */
  add_style(content) {
    this.csp_provider.add_style(content);
    this.report_only_provider.add_style(content);
  }
}, "Csp");
function defer() {
  let fulfil;
  let reject;
  const promise = new Promise((f, r3) => {
    fulfil = f;
    reject = r3;
  });
  return { promise, fulfil, reject };
}
__name(defer, "defer");
function create_async_iterator() {
  const deferred2 = [defer()];
  return {
    iterator: {
      [Symbol.asyncIterator]() {
        return {
          next: async () => {
            const next = await deferred2[0].promise;
            if (!next.done)
              deferred2.shift();
            return next;
          }
        };
      }
    },
    push: (value) => {
      deferred2[deferred2.length - 1].fulfil({
        value,
        done: false
      });
      deferred2.push(defer());
    },
    done: () => {
      deferred2[deferred2.length - 1].fulfil({ done: true });
    }
  };
}
__name(create_async_iterator, "create_async_iterator");
function exec(match, params, matchers) {
  const result = {};
  const values = match.slice(1);
  const values_needing_match = values.filter((value) => value !== void 0);
  let buffered = 0;
  for (let i = 0; i < params.length; i += 1) {
    const param = params[i];
    let value = values[i - buffered];
    if (param.chained && param.rest && buffered) {
      value = values.slice(i - buffered, i + 1).filter((s22) => s22).join("/");
      buffered = 0;
    }
    if (value === void 0) {
      if (param.rest)
        result[param.name] = "";
      continue;
    }
    if (!param.matcher || matchers[param.matcher](value)) {
      result[param.name] = value;
      const next_param = params[i + 1];
      const next_value = values[i + 1];
      if (next_param && !next_param.rest && next_param.optional && next_value && param.chained) {
        buffered = 0;
      }
      if (!next_param && !next_value && Object.keys(result).length === values_needing_match.length) {
        buffered = 0;
      }
      continue;
    }
    if (param.optional && param.chained) {
      buffered++;
      continue;
    }
    return;
  }
  if (buffered)
    return;
  return result;
}
__name(exec, "exec");
function generate_route_object(route, url, manifest2) {
  const { errors, layouts, leaf } = route;
  const nodes = [...errors, ...layouts.map((l) => l?.[1]), leaf[1]].filter((n2) => typeof n2 === "number").map((n2) => `'${n2}': () => ${create_client_import(manifest2._.client.nodes?.[n2], url)}`).join(",\n		");
  return [
    `{
	id: ${s(route.id)}`,
    `errors: ${s(route.errors)}`,
    `layouts: ${s(route.layouts)}`,
    `leaf: ${s(route.leaf)}`,
    `nodes: {
		${nodes}
	}
}`
  ].join(",\n	");
}
__name(generate_route_object, "generate_route_object");
function create_client_import(import_path, url) {
  if (!import_path)
    return "Promise.resolve({})";
  if (import_path[0] === "/") {
    return `import('${import_path}')`;
  }
  if (assets !== "") {
    return `import('${assets}/${import_path}')`;
  }
  let path = get_relative_path(url.pathname, `${base}/${import_path}`);
  if (path[0] !== ".")
    path = `./${path}`;
  return `import('${path}')`;
}
__name(create_client_import, "create_client_import");
async function resolve_route(resolved_path, url, manifest2) {
  if (!manifest2._.client.routes) {
    return text("Server-side route resolution disabled", { status: 400 });
  }
  let route = null;
  let params = {};
  const matchers = await manifest2._.matchers();
  for (const candidate of manifest2._.client.routes) {
    const match = candidate.pattern.exec(resolved_path);
    if (!match)
      continue;
    const matched = exec(match, candidate.params, matchers);
    if (matched) {
      route = candidate;
      params = decode_params(matched);
      break;
    }
  }
  return create_server_routing_response(route, params, url, manifest2).response;
}
__name(resolve_route, "resolve_route");
function create_server_routing_response(route, params, url, manifest2) {
  const headers2 = new Headers({
    "content-type": "application/javascript; charset=utf-8"
  });
  if (route) {
    const csr_route = generate_route_object(route, url, manifest2);
    const body2 = `${create_css_import(route, url, manifest2)}
export const route = ${csr_route}; export const params = ${JSON.stringify(params)};`;
    return { response: text(body2, { headers: headers2 }), body: body2 };
  } else {
    return { response: text("", { headers: headers2 }), body: "" };
  }
}
__name(create_server_routing_response, "create_server_routing_response");
function create_css_import(route, url, manifest2) {
  const { errors, layouts, leaf } = route;
  let css = "";
  for (const node of [...errors, ...layouts.map((l) => l?.[1]), leaf[1]]) {
    if (typeof node !== "number")
      continue;
    const node_css = manifest2._.client.css?.[node];
    for (const css_path of node_css ?? []) {
      css += `'${assets || base}/${css_path}',`;
    }
  }
  if (!css)
    return "";
  return `${create_client_import(
    /** @type {string} */
    manifest2._.client.start,
    url
  )}.then(x => x.load_css([${css}]));`;
}
__name(create_css_import, "create_css_import");
var updated = {
  ...readable(false),
  check: () => false
};
var encoder$1 = new TextEncoder();
async function render_response({
  branch: branch2,
  fetched,
  options: options2,
  manifest: manifest2,
  state: state2,
  page_config,
  status,
  error: error22 = null,
  event,
  resolve_opts,
  action_result
}) {
  if (state2.prerendering) {
    if (options2.csp.mode === "nonce") {
      throw new Error('Cannot use prerendering if config.kit.csp.mode === "nonce"');
    }
    if (options2.app_template_contains_nonce) {
      throw new Error("Cannot use prerendering if page template contains %sveltekit.nonce%");
    }
  }
  const { client } = manifest2._;
  const modulepreloads = new Set(client.imports);
  const stylesheets13 = new Set(client.stylesheets);
  const fonts13 = new Set(client.fonts);
  const link_header_preloads = /* @__PURE__ */ new Set();
  const inline_styles = /* @__PURE__ */ new Map();
  let rendered;
  const form_value = action_result?.type === "success" || action_result?.type === "failure" ? action_result.data ?? null : null;
  let base$1 = base;
  let assets$1 = assets;
  let base_expression = s(base);
  {
    if (!state2.prerendering?.fallback) {
      const segments = event.url.pathname.slice(base.length).split("/").slice(2);
      base$1 = segments.map(() => "..").join("/") || ".";
      base_expression = `new URL(${s(base$1)}, location).pathname.slice(0, -1)`;
      if (!assets || assets[0] === "/" && assets !== SVELTE_KIT_ASSETS) {
        assets$1 = base$1;
      }
    } else if (options2.hash_routing) {
      base_expression = "new URL('.', location).pathname.slice(0, -1)";
    }
  }
  if (page_config.ssr) {
    const props = {
      stores: {
        page: writable(null),
        navigating: writable(null),
        updated
      },
      constructors: await Promise.all(
        branch2.map(({ node }) => {
          if (!node.component) {
            throw new Error(`Missing +page.svelte component for route ${event.route.id}`);
          }
          return node.component();
        })
      ),
      form: form_value
    };
    let data2 = {};
    for (let i = 0; i < branch2.length; i += 1) {
      data2 = { ...data2, ...branch2[i].data };
      props[`data_${i}`] = data2;
    }
    props.page = {
      error: error22,
      params: (
        /** @type {Record<string, any>} */
        event.params
      ),
      route: event.route,
      status,
      url: event.url,
      data: data2,
      form: form_value,
      state: {}
    };
    override({ base: base$1, assets: assets$1 });
    const render_opts = {
      context: /* @__PURE__ */ new Map([
        [
          "__request__",
          {
            page: props.page
          }
        ]
      ])
    };
    {
      try {
        rendered = with_event(event, () => options2.root.render(props, render_opts));
      } finally {
        reset();
      }
    }
    for (const { node } of branch2) {
      for (const url of node.imports)
        modulepreloads.add(url);
      for (const url of node.stylesheets)
        stylesheets13.add(url);
      for (const url of node.fonts)
        fonts13.add(url);
      if (node.inline_styles && !client.inline) {
        Object.entries(await node.inline_styles()).forEach(([k, v]) => inline_styles.set(k, v));
      }
    }
  } else {
    rendered = { head: "", html: "", css: { code: "", map: null } };
  }
  let head2 = "";
  let body2 = rendered.html;
  const csp = new Csp(options2.csp, {
    prerender: !!state2.prerendering
  });
  const prefixed = /* @__PURE__ */ __name((path) => {
    if (path.startsWith("/")) {
      return base + path;
    }
    return `${assets$1}/${path}`;
  }, "prefixed");
  const style = client.inline ? client.inline?.style : Array.from(inline_styles.values()).join("\n");
  if (style) {
    const attributes = [];
    if (csp.style_needs_nonce)
      attributes.push(` nonce="${csp.nonce}"`);
    csp.add_style(style);
    head2 += `
	<style${attributes.join("")}>${style}</style>`;
  }
  for (const dep of stylesheets13) {
    const path = prefixed(dep);
    const attributes = ['rel="stylesheet"'];
    if (inline_styles.has(dep)) {
      attributes.push("disabled", 'media="(max-width: 0)"');
    } else {
      if (resolve_opts.preload({ type: "css", path })) {
        const preload_atts = ['rel="preload"', 'as="style"'];
        link_header_preloads.add(`<${encodeURI(path)}>; ${preload_atts.join(";")}; nopush`);
      }
    }
    head2 += `
		<link href="${path}" ${attributes.join(" ")}>`;
  }
  for (const dep of fonts13) {
    const path = prefixed(dep);
    if (resolve_opts.preload({ type: "font", path })) {
      const ext = dep.slice(dep.lastIndexOf(".") + 1);
      const attributes = [
        'rel="preload"',
        'as="font"',
        `type="font/${ext}"`,
        `href="${path}"`,
        "crossorigin"
      ];
      head2 += `
		<link ${attributes.join(" ")}>`;
    }
  }
  const global = `__sveltekit_${options2.version_hash}`;
  const { data, chunks } = get_data(
    event,
    options2,
    branch2.map((b) => b.server_data),
    csp,
    global
  );
  if (page_config.ssr && page_config.csr) {
    body2 += `
			${fetched.map(
      (item) => serialize_data(item, resolve_opts.filterSerializedResponseHeaders, !!state2.prerendering)
    ).join("\n			")}`;
  }
  if (page_config.csr) {
    const route = manifest2._.client.routes?.find((r3) => r3.id === event.route.id) ?? null;
    if (client.uses_env_dynamic_public && state2.prerendering) {
      modulepreloads.add(`${app_dir}/env.js`);
    }
    if (!client.inline) {
      const included_modulepreloads = Array.from(modulepreloads, (dep) => prefixed(dep)).filter(
        (path) => resolve_opts.preload({ type: "js", path })
      );
      for (const path of included_modulepreloads) {
        link_header_preloads.add(`<${encodeURI(path)}>; rel="modulepreload"; nopush`);
        if (options2.preload_strategy !== "modulepreload") {
          head2 += `
		<link rel="preload" as="script" crossorigin="anonymous" href="${path}">`;
        } else if (state2.prerendering) {
          head2 += `
		<link rel="modulepreload" href="${path}">`;
        }
      }
    }
    if (manifest2._.client.routes && state2.prerendering && !state2.prerendering.fallback) {
      const pathname = add_resolution_suffix2(event.url.pathname);
      state2.prerendering.dependencies.set(
        pathname,
        create_server_routing_response(route, event.params, new URL(pathname, event.url), manifest2)
      );
    }
    const blocks = [];
    const load_env_eagerly = client.uses_env_dynamic_public && state2.prerendering;
    const properties = [`base: ${base_expression}`];
    if (assets) {
      properties.push(`assets: ${s(assets)}`);
    }
    if (client.uses_env_dynamic_public) {
      properties.push(`env: ${load_env_eagerly ? "null" : s(public_env)}`);
    }
    if (chunks) {
      blocks.push("const deferred = new Map();");
      properties.push(`defer: (id) => new Promise((fulfil, reject) => {
							deferred.set(id, { fulfil, reject });
						})`);
      properties.push(`resolve: ({ id, data, error }) => {
							const try_to_resolve = () => {
								if (!deferred.has(id)) {
									setTimeout(try_to_resolve, 0);
									return;
								}
								const { fulfil, reject } = deferred.get(id);
								deferred.delete(id);
								if (error) reject(error);
								else fulfil(data);
							}
							try_to_resolve();
						}`);
    }
    blocks.push(`${global} = {
						${properties.join(",\n						")}
					};`);
    const args = ["element"];
    blocks.push("const element = document.currentScript.parentElement;");
    if (page_config.ssr) {
      const serialized = { form: "null", error: "null", remote: "null" };
      if (form_value) {
        serialized.form = uneval_action_response(
          form_value,
          /** @type {string} */
          event.route.id,
          options2.hooks.transport
        );
      }
      if (error22) {
        serialized.error = uneval(error22);
      }
      const { remote_data } = get_event_state(event);
      if (remote_data) {
        const remote = {};
        for (const key2 in remote_data) {
          remote[key2] = await remote_data[key2];
        }
        const replacer = /* @__PURE__ */ __name((thing) => {
          for (const key2 in options2.hooks.transport) {
            const encoded = options2.hooks.transport[key2].encode(thing);
            if (encoded) {
              return `app.decode('${key2}', ${uneval(encoded, replacer)})`;
            }
          }
        }, "replacer");
        serialized.remote = uneval(remote, replacer);
      }
      const hydrate2 = [
        `node_ids: [${branch2.map(({ node }) => node.index).join(", ")}]`,
        `data: ${data}`,
        `form: ${serialized.form}`,
        `error: ${serialized.error}`,
        `remote: ${serialized.remote}`
      ];
      if (status !== 200) {
        hydrate2.push(`status: ${status}`);
      }
      if (manifest2._.client.routes) {
        if (route) {
          const stringified = generate_route_object(route, event.url, manifest2).replaceAll(
            "\n",
            "\n							"
          );
          hydrate2.push(`params: ${uneval(event.params)}`, `server_route: ${stringified}`);
        }
      } else if (options2.embedded) {
        hydrate2.push(`params: ${uneval(event.params)}`, `route: ${s(event.route)}`);
      }
      const indent = "	".repeat(load_env_eagerly ? 7 : 6);
      args.push(`{
${indent}	${hydrate2.join(`,
${indent}	`)}
${indent}}`);
    }
    const boot = client.inline ? `${client.inline.script}

					__sveltekit_${options2.version_hash}.app.start(${args.join(", ")});` : client.app ? `Promise.all([
						import(${s(prefixed(client.start))}),
						import(${s(prefixed(client.app))})
					]).then(([kit, app]) => {
						kit.start(app, ${args.join(", ")});
					});` : `import(${s(prefixed(client.start))}).then((app) => {
						app.start(${args.join(", ")})
					});`;
    if (load_env_eagerly) {
      blocks.push(`import(${s(`${base$1}/${app_dir}/env.js`)}).then(({ env }) => {
						${global}.env = env;

						${boot.replace(/\n/g, "\n	")}
					});`);
    } else {
      blocks.push(boot);
    }
    if (options2.service_worker) {
      const opts = "";
      blocks.push(`if ('serviceWorker' in navigator) {
						addEventListener('load', function () {
							navigator.serviceWorker.register('${prefixed("service-worker.js")}'${opts});
						});
					}`);
    }
    const init_app = `
				{
					${blocks.join("\n\n					")}
				}
			`;
    csp.add_script(init_app);
    body2 += `
			<script${csp.script_needs_nonce ? ` nonce="${csp.nonce}"` : ""}>${init_app}<\/script>
		`;
  }
  const headers2 = new Headers({
    "x-sveltekit-page": "true",
    "content-type": "text/html"
  });
  if (state2.prerendering) {
    const http_equiv = [];
    const csp_headers = csp.csp_provider.get_meta();
    if (csp_headers) {
      http_equiv.push(csp_headers);
    }
    if (state2.prerendering.cache) {
      http_equiv.push(`<meta http-equiv="cache-control" content="${state2.prerendering.cache}">`);
    }
    if (http_equiv.length > 0) {
      head2 = http_equiv.join("\n") + head2;
    }
  } else {
    const csp_header = csp.csp_provider.get_header();
    if (csp_header) {
      headers2.set("content-security-policy", csp_header);
    }
    const report_only_header = csp.report_only_provider.get_header();
    if (report_only_header) {
      headers2.set("content-security-policy-report-only", report_only_header);
    }
    if (link_header_preloads.size) {
      headers2.set("link", Array.from(link_header_preloads).join(", "));
    }
  }
  head2 += rendered.head;
  const html = options2.templates.app({
    head: head2,
    body: body2,
    assets: assets$1,
    nonce: (
      /** @type {string} */
      csp.nonce
    ),
    env: safe_public_env
  });
  const transformed = await resolve_opts.transformPageChunk({
    html,
    done: true
  }) || "";
  if (!chunks) {
    headers2.set("etag", `"${hash(transformed)}"`);
  }
  return !chunks ? text(transformed, {
    status,
    headers: headers2
  }) : new Response(
    new ReadableStream({
      async start(controller2) {
        controller2.enqueue(encoder$1.encode(transformed + "\n"));
        for await (const chunk of chunks) {
          controller2.enqueue(encoder$1.encode(chunk));
        }
        controller2.close();
      },
      type: "bytes"
    }),
    {
      headers: headers2
    }
  );
}
__name(render_response, "render_response");
function get_data(event, options2, nodes, csp, global) {
  let promise_id = 1;
  let count3 = 0;
  const { iterator, push: push2, done } = create_async_iterator();
  function replacer(thing) {
    if (typeof thing?.then === "function") {
      const id = promise_id++;
      count3 += 1;
      thing.then(
        /** @param {any} data */
        (data) => ({ data })
      ).catch(
        /** @param {any} error */
        async (error22) => ({
          error: await handle_error_and_jsonify(event, options2, error22)
        })
      ).then(
        /**
         * @param {{data: any; error: any}} result
         */
        async ({ data, error: error22 }) => {
          count3 -= 1;
          let str;
          try {
            str = uneval({ id, data, error: error22 }, replacer);
          } catch {
            error22 = await handle_error_and_jsonify(
              event,
              options2,
              new Error(`Failed to serialize promise while rendering ${event.route.id}`)
            );
            data = void 0;
            str = uneval({ id, data, error: error22 }, replacer);
          }
          const nonce = csp.script_needs_nonce ? ` nonce="${csp.nonce}"` : "";
          push2(`<script${nonce}>${global}.resolve(${str})<\/script>
`);
          if (count3 === 0)
            done();
        }
      );
      return `${global}.defer(${id})`;
    } else {
      for (const key2 in options2.hooks.transport) {
        const encoded = options2.hooks.transport[key2].encode(thing);
        if (encoded) {
          return `app.decode('${key2}', ${uneval(encoded, replacer)})`;
        }
      }
    }
  }
  __name(replacer, "replacer");
  try {
    const strings = nodes.map((node) => {
      if (!node)
        return "null";
      const payload = { type: "data", data: node.data, uses: serialize_uses(node) };
      if (node.slash)
        payload.slash = node.slash;
      return uneval(payload, replacer);
    });
    return {
      data: `[${strings.join(",")}]`,
      chunks: count3 > 0 ? iterator : null
    };
  } catch (e3) {
    e3.path = e3.path.slice(1);
    throw new Error(clarify_devalue_error(
      event,
      /** @type {any} */
      e3
    ));
  }
}
__name(get_data, "get_data");
var PageNodes = /* @__PURE__ */ __name(class {
  data;
  /**
   * @param {Array<import('types').SSRNode | undefined>} nodes
   */
  constructor(nodes) {
    this.data = nodes;
  }
  layouts() {
    return this.data.slice(0, -1);
  }
  page() {
    return this.data.at(-1);
  }
  validate() {
    for (const layout of this.layouts()) {
      if (layout) {
        validate_layout_server_exports(
          layout.server,
          /** @type {string} */
          layout.server_id
        );
        validate_layout_exports(
          layout.universal,
          /** @type {string} */
          layout.universal_id
        );
      }
    }
    const page2 = this.page();
    if (page2) {
      validate_page_server_exports(
        page2.server,
        /** @type {string} */
        page2.server_id
      );
      validate_page_exports(
        page2.universal,
        /** @type {string} */
        page2.universal_id
      );
    }
  }
  /**
   * @template {'prerender' | 'ssr' | 'csr' | 'trailingSlash'} Option
   * @param {Option} option
   * @returns {Value | undefined}
   */
  #get_option(option) {
    return this.data.reduce(
      (value, node) => {
        return node?.universal?.[option] ?? node?.server?.[option] ?? value;
      },
      /** @type {Value | undefined} */
      void 0
    );
  }
  csr() {
    return this.#get_option("csr") ?? true;
  }
  ssr() {
    return this.#get_option("ssr") ?? true;
  }
  prerender() {
    return this.#get_option("prerender") ?? false;
  }
  trailing_slash() {
    return this.#get_option("trailingSlash") ?? "never";
  }
  get_config() {
    let current = {};
    for (const node of this.data) {
      if (!node?.universal?.config && !node?.server?.config)
        continue;
      current = {
        ...current,
        // TODO: should we override the server config value with the universal value similar to other page options?
        ...node?.universal?.config,
        ...node?.server?.config
      };
    }
    return Object.keys(current).length ? current : void 0;
  }
  should_prerender_data() {
    return this.data.some(
      // prerender in case of trailingSlash because the client retrieves that value from the server
      (node) => node?.server?.load || node?.server?.trailingSlash !== void 0
    );
  }
}, "PageNodes");
async function respond_with_error({
  event,
  options: options2,
  manifest: manifest2,
  state: state2,
  status,
  error: error22,
  resolve_opts
}) {
  if (event.request.headers.get("x-sveltekit-error")) {
    return static_error_page(
      options2,
      status,
      /** @type {Error} */
      error22.message
    );
  }
  const fetched = [];
  try {
    const branch2 = [];
    const default_layout = await manifest2._.nodes[0]();
    const nodes = new PageNodes([default_layout]);
    const ssr = nodes.ssr();
    const csr = nodes.csr();
    if (ssr) {
      state2.error = true;
      const server_data_promise = load_server_data({
        event,
        state: state2,
        node: default_layout,
        // eslint-disable-next-line @typescript-eslint/require-await
        parent: async () => ({})
      });
      const server_data = await server_data_promise;
      const data = await load_data({
        event,
        fetched,
        node: default_layout,
        // eslint-disable-next-line @typescript-eslint/require-await
        parent: async () => ({}),
        resolve_opts,
        server_data_promise,
        state: state2,
        csr
      });
      branch2.push(
        {
          node: default_layout,
          server_data,
          data
        },
        {
          node: await manifest2._.nodes[1](),
          // 1 is always the root error
          data: null,
          server_data: null
        }
      );
    }
    return await render_response({
      options: options2,
      manifest: manifest2,
      state: state2,
      page_config: {
        ssr,
        csr
      },
      status,
      error: await handle_error_and_jsonify(event, options2, error22),
      branch: branch2,
      fetched,
      event,
      resolve_opts
    });
  } catch (e3) {
    if (e3 instanceof Redirect) {
      return redirect_response(e3.status, e3.location);
    }
    return static_error_page(
      options2,
      get_status(e3),
      (await handle_error_and_jsonify(event, options2, e3)).message
    );
  }
}
__name(respond_with_error, "respond_with_error");
function once2(fn) {
  let done = false;
  let result;
  return () => {
    if (done)
      return result;
    done = true;
    return result = fn();
  };
}
__name(once2, "once");
var encoder2 = new TextEncoder();
async function render_data(event, route, options2, manifest2, state2, invalidated_data_nodes, trailing_slash) {
  if (!route.page) {
    return new Response(void 0, {
      status: 404
    });
  }
  try {
    const node_ids = [...route.page.layouts, route.page.leaf];
    const invalidated = invalidated_data_nodes ?? node_ids.map(() => true);
    let aborted = false;
    const url = new URL(event.url);
    url.pathname = normalize_path(url.pathname, trailing_slash);
    const new_event = { ...event, url };
    const functions = node_ids.map((n2, i) => {
      return once2(async () => {
        try {
          if (aborted) {
            return (
              /** @type {import('types').ServerDataSkippedNode} */
              {
                type: "skip"
              }
            );
          }
          const node = n2 == void 0 ? n2 : await manifest2._.nodes[n2]();
          return load_server_data({
            event: new_event,
            state: state2,
            node,
            parent: async () => {
              const data2 = {};
              for (let j = 0; j < i; j += 1) {
                const parent = (
                  /** @type {import('types').ServerDataNode | null} */
                  await functions[j]()
                );
                if (parent) {
                  Object.assign(data2, parent.data);
                }
              }
              return data2;
            }
          });
        } catch (e3) {
          aborted = true;
          throw e3;
        }
      });
    });
    const promises = functions.map(async (fn, i) => {
      if (!invalidated[i]) {
        return (
          /** @type {import('types').ServerDataSkippedNode} */
          {
            type: "skip"
          }
        );
      }
      return fn();
    });
    let length = promises.length;
    const nodes = await Promise.all(
      promises.map(
        (p, i) => p.catch(async (error22) => {
          if (error22 instanceof Redirect) {
            throw error22;
          }
          length = Math.min(length, i + 1);
          return (
            /** @type {import('types').ServerErrorNode} */
            {
              type: "error",
              error: await handle_error_and_jsonify(event, options2, error22),
              status: error22 instanceof HttpError || error22 instanceof SvelteKitError ? error22.status : void 0
            }
          );
        })
      )
    );
    const { data, chunks } = get_data_json(event, options2, nodes);
    if (!chunks) {
      return json_response(data);
    }
    return new Response(
      new ReadableStream({
        async start(controller2) {
          controller2.enqueue(encoder2.encode(data));
          for await (const chunk of chunks) {
            controller2.enqueue(encoder2.encode(chunk));
          }
          controller2.close();
        },
        type: "bytes"
      }),
      {
        headers: {
          // we use a proprietary content type to prevent buffering.
          // the `text` prefix makes it inspectable
          "content-type": "text/sveltekit-data",
          "cache-control": "private, no-store"
        }
      }
    );
  } catch (e3) {
    const error22 = normalize_error(e3);
    if (error22 instanceof Redirect) {
      return redirect_json_response(error22);
    } else {
      return json_response(await handle_error_and_jsonify(event, options2, error22), 500);
    }
  }
}
__name(render_data, "render_data");
function json_response(json2, status = 200) {
  return text(typeof json2 === "string" ? json2 : JSON.stringify(json2), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "private, no-store"
    }
  });
}
__name(json_response, "json_response");
function redirect_json_response(redirect) {
  return json_response(
    /** @type {import('types').ServerRedirectNode} */
    {
      type: "redirect",
      location: redirect.location
    }
  );
}
__name(redirect_json_response, "redirect_json_response");
function get_data_json(event, options2, nodes) {
  let promise_id = 1;
  let count3 = 0;
  const { iterator, push: push2, done } = create_async_iterator();
  const reducers = {
    ...Object.fromEntries(
      Object.entries(options2.hooks.transport).map(([key2, value]) => [key2, value.encode])
    ),
    /** @param {any} thing */
    Promise: (thing) => {
      if (typeof thing?.then === "function") {
        const id = promise_id++;
        count3 += 1;
        let key2 = "data";
        thing.catch(
          /** @param {any} e */
          async (e3) => {
            key2 = "error";
            return handle_error_and_jsonify(
              event,
              options2,
              /** @type {any} */
              e3
            );
          }
        ).then(
          /** @param {any} value */
          async (value) => {
            let str;
            try {
              str = stringify$1(value, reducers);
            } catch {
              const error22 = await handle_error_and_jsonify(
                event,
                options2,
                new Error(`Failed to serialize promise while rendering ${event.route.id}`)
              );
              key2 = "error";
              str = stringify$1(error22, reducers);
            }
            count3 -= 1;
            push2(`{"type":"chunk","id":${id},"${key2}":${str}}
`);
            if (count3 === 0)
              done();
          }
        );
        return id;
      }
    }
  };
  try {
    const strings = nodes.map((node) => {
      if (!node)
        return "null";
      if (node.type === "error" || node.type === "skip") {
        return JSON.stringify(node);
      }
      return `{"type":"data","data":${stringify$1(node.data, reducers)},"uses":${JSON.stringify(
        serialize_uses(node)
      )}${node.slash ? `,"slash":${JSON.stringify(node.slash)}` : ""}}`;
    });
    return {
      data: `{"type":"data","nodes":[${strings.join(",")}]}
`,
      chunks: count3 > 0 ? iterator : null
    };
  } catch (e3) {
    e3.path = "data" + e3.path;
    throw new Error(clarify_devalue_error(
      event,
      /** @type {any} */
      e3
    ));
  }
}
__name(get_data_json, "get_data_json");
async function handle_remote_call(event, options2, manifest2, id) {
  const [hash2, name, prerender_args] = id.split("/");
  const remotes = manifest2._.remotes;
  if (!remotes[hash2])
    error3(404);
  const module = await remotes[hash2]();
  const fn = module[name];
  if (!fn)
    error3(404);
  const info3 = fn.__;
  const transport = options2.hooks.transport;
  let form_client_refreshes;
  try {
    if (info3.type === "form") {
      if (!is_form_content_type(event.request)) {
        throw new SvelteKitError(
          415,
          "Unsupported Media Type",
          `Form actions expect form-encoded data \u2014 received ${event.request.headers.get(
            "content-type"
          )}`
        );
      }
      const form_data = await event.request.formData();
      form_client_refreshes = JSON.parse(
        /** @type {string} */
        form_data.get("sveltekit:remote_refreshes") ?? "[]"
      );
      form_data.delete("sveltekit:remote_refreshes");
      const fn2 = info3.fn;
      const data2 = await with_event(event, () => fn2(form_data));
      return json(
        /** @type {RemoteFunctionResponse} */
        {
          type: "result",
          result: stringify(data2, transport),
          refreshes: stringify(
            {
              ...get_event_state(event).refreshes,
              ...await apply_client_refreshes(
                /** @type {string[]} */
                form_client_refreshes
              )
            },
            transport
          )
        }
      );
    }
    if (info3.type === "command") {
      const { payload: payload2, refreshes } = await event.request.json();
      const arg = parse_remote_arg(payload2, transport);
      const data2 = await with_event(event, () => fn(arg));
      const refreshed = await apply_client_refreshes(refreshes);
      return json(
        /** @type {RemoteFunctionResponse} */
        {
          type: "result",
          result: stringify(data2, transport),
          refreshes: stringify({ ...get_event_state(event).refreshes, ...refreshed }, transport)
        }
      );
    }
    const payload = info3.type === "prerender" ? prerender_args : (
      /** @type {string} */
      // new URL(...) necessary because we're hiding the URL from the user in the event object
      new URL(event.request.url).searchParams.get("payload")
    );
    const data = await with_event(event, () => fn(parse_remote_arg(payload, transport)));
    return json(
      /** @type {RemoteFunctionResponse} */
      {
        type: "result",
        result: stringify(data, transport)
      }
    );
  } catch (error22) {
    if (error22 instanceof Redirect) {
      const refreshes = {
        ...get_event_state(event).refreshes ?? {},
        // could be set by form actions
        ...await apply_client_refreshes(form_client_refreshes ?? [])
      };
      return json({
        type: "redirect",
        location: error22.location,
        refreshes: Object.keys(refreshes).length > 0 ? stringify(refreshes, transport) : void 0
      });
    }
    return json(
      /** @type {RemoteFunctionResponse} */
      {
        type: "error",
        error: await handle_error_and_jsonify(event, options2, error22),
        status: error22 instanceof HttpError || error22 instanceof SvelteKitError ? error22.status : 500
      },
      {
        headers: {
          "cache-control": "private, no-store"
        }
      }
    );
  }
  async function apply_client_refreshes(refreshes) {
    return Object.fromEntries(
      await Promise.all(
        refreshes.map(async (key2) => {
          const [hash3, name2, payload] = key2.split("/");
          const loader = manifest2._.remotes[hash3];
          if (!loader)
            error3(400, "Bad Request");
          const module2 = await loader();
          const fn2 = module2[name2];
          if (!fn2)
            error3(400, "Bad Request");
          return [key2, await with_event(event, () => fn2(parse_remote_arg(payload, transport)))];
        })
      )
    );
  }
  __name(apply_client_refreshes, "apply_client_refreshes");
}
__name(handle_remote_call, "handle_remote_call");
async function handle_remote_form_post(event, manifest2, id) {
  const [hash2, name, action_id] = id.split("/");
  const remotes = manifest2._.remotes;
  const module = await remotes[hash2]?.();
  let form = (
    /** @type {RemoteForm<any>} */
    module?.[name]
  );
  if (!form) {
    event.setHeaders({
      // https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/405
      // "The server must generate an Allow header field in a 405 status code response"
      allow: "GET"
    });
    return {
      type: "error",
      error: new SvelteKitError(
        405,
        "Method Not Allowed",
        `POST method not allowed. No form actions exist for ${"this page"}`
      )
    };
  }
  if (action_id) {
    form = with_event(event, () => form.for(JSON.parse(action_id)));
  }
  try {
    const form_data = await event.request.formData();
    const fn = (
      /** @type {RemoteInfo & { type: 'form' }} */
      /** @type {any} */
      form.__.fn
    );
    await with_event(event, () => fn(form_data));
    return {
      type: "success",
      status: 200
    };
  } catch (e3) {
    const err = normalize_error(e3);
    if (err instanceof Redirect) {
      return {
        type: "redirect",
        status: err.status,
        location: err.location
      };
    }
    return {
      type: "error",
      error: check_incorrect_fail_use(err)
    };
  }
}
__name(handle_remote_form_post, "handle_remote_form_post");
function get_remote_id(url) {
  return url.pathname.startsWith(`${base}/${app_dir}/remote/`) && url.pathname.replace(`${base}/${app_dir}/remote/`, "");
}
__name(get_remote_id, "get_remote_id");
function get_remote_action(url) {
  return url.searchParams.get("/remote");
}
__name(get_remote_action, "get_remote_action");
var MAX_DEPTH = 10;
async function render_page(event, page2, options2, manifest2, state2, nodes, resolve_opts) {
  if (state2.depth > MAX_DEPTH) {
    return text(`Not found: ${event.url.pathname}`, {
      status: 404
      // TODO in some cases this should be 500. not sure how to differentiate
    });
  }
  if (is_action_json_request(event)) {
    const node = await manifest2._.nodes[page2.leaf]();
    return handle_action_json_request(event, options2, node?.server);
  }
  try {
    const leaf_node = (
      /** @type {import('types').SSRNode} */
      nodes.page()
    );
    let status = 200;
    let action_result = void 0;
    if (is_action_request(event)) {
      const remote_id = get_remote_action(event.url);
      if (remote_id) {
        action_result = await handle_remote_form_post(event, manifest2, remote_id);
      } else {
        action_result = await handle_action_request(event, leaf_node.server);
      }
      if (action_result?.type === "redirect") {
        return redirect_response(action_result.status, action_result.location);
      }
      if (action_result?.type === "error") {
        status = get_status(action_result.error);
      }
      if (action_result?.type === "failure") {
        status = action_result.status;
      }
    }
    const should_prerender = nodes.prerender();
    if (should_prerender) {
      const mod = leaf_node.server;
      if (mod?.actions) {
        throw new Error("Cannot prerender pages with actions");
      }
    } else if (state2.prerendering) {
      return new Response(void 0, {
        status: 204
      });
    }
    state2.prerender_default = should_prerender;
    const should_prerender_data = nodes.should_prerender_data();
    const data_pathname = add_data_suffix2(event.url.pathname);
    const fetched = [];
    const ssr = nodes.ssr();
    const csr = nodes.csr();
    if (ssr === false && !(state2.prerendering && should_prerender_data)) {
      if (DEV && action_result && !event.request.headers.has("x-sveltekit-action"))
        ;
      return await render_response({
        branch: [],
        fetched,
        page_config: {
          ssr: false,
          csr
        },
        status,
        error: null,
        event,
        options: options2,
        manifest: manifest2,
        state: state2,
        resolve_opts
      });
    }
    const branch2 = [];
    let load_error = null;
    const server_promises = nodes.data.map((node, i) => {
      if (load_error) {
        throw load_error;
      }
      return Promise.resolve().then(async () => {
        try {
          if (node === leaf_node && action_result?.type === "error") {
            throw action_result.error;
          }
          return await load_server_data({
            event,
            state: state2,
            node,
            parent: async () => {
              const data = {};
              for (let j = 0; j < i; j += 1) {
                const parent = await server_promises[j];
                if (parent)
                  Object.assign(data, parent.data);
              }
              return data;
            }
          });
        } catch (e3) {
          load_error = /** @type {Error} */
          e3;
          throw load_error;
        }
      });
    });
    const load_promises = nodes.data.map((node, i) => {
      if (load_error)
        throw load_error;
      return Promise.resolve().then(async () => {
        try {
          return await load_data({
            event,
            fetched,
            node,
            parent: async () => {
              const data = {};
              for (let j = 0; j < i; j += 1) {
                Object.assign(data, await load_promises[j]);
              }
              return data;
            },
            resolve_opts,
            server_data_promise: server_promises[i],
            state: state2,
            csr
          });
        } catch (e3) {
          load_error = /** @type {Error} */
          e3;
          throw load_error;
        }
      });
    });
    for (const p of server_promises)
      p.catch(() => {
      });
    for (const p of load_promises)
      p.catch(() => {
      });
    for (let i = 0; i < nodes.data.length; i += 1) {
      const node = nodes.data[i];
      if (node) {
        try {
          const server_data = await server_promises[i];
          const data = await load_promises[i];
          branch2.push({ node, server_data, data });
        } catch (e3) {
          const err = normalize_error(e3);
          if (err instanceof Redirect) {
            if (state2.prerendering && should_prerender_data) {
              const body2 = JSON.stringify({
                type: "redirect",
                location: err.location
              });
              state2.prerendering.dependencies.set(data_pathname, {
                response: text(body2),
                body: body2
              });
            }
            return redirect_response(err.status, err.location);
          }
          const status2 = get_status(err);
          const error22 = await handle_error_and_jsonify(event, options2, err);
          while (i--) {
            if (page2.errors[i]) {
              const index13 = (
                /** @type {number} */
                page2.errors[i]
              );
              const node2 = await manifest2._.nodes[index13]();
              let j = i;
              while (!branch2[j])
                j -= 1;
              const layouts = compact(branch2.slice(0, j + 1));
              const nodes2 = new PageNodes(layouts.map((layout) => layout.node));
              return await render_response({
                event,
                options: options2,
                manifest: manifest2,
                state: state2,
                resolve_opts,
                page_config: {
                  ssr: nodes2.ssr(),
                  csr: nodes2.csr()
                },
                status: status2,
                error: error22,
                branch: layouts.concat({
                  node: node2,
                  data: null,
                  server_data: null
                }),
                fetched
              });
            }
          }
          return static_error_page(options2, status2, error22.message);
        }
      } else {
        branch2.push(null);
      }
    }
    if (state2.prerendering && should_prerender_data) {
      let { data, chunks } = get_data_json(
        event,
        options2,
        branch2.map((node) => node?.server_data)
      );
      if (chunks) {
        for await (const chunk of chunks) {
          data += chunk;
        }
      }
      state2.prerendering.dependencies.set(data_pathname, {
        response: text(data),
        body: data
      });
    }
    return await render_response({
      event,
      options: options2,
      manifest: manifest2,
      state: state2,
      resolve_opts,
      page_config: {
        csr,
        ssr
      },
      status,
      error: null,
      branch: ssr === false ? [] : compact(branch2),
      action_result,
      fetched
    });
  } catch (e3) {
    return await respond_with_error({
      event,
      options: options2,
      manifest: manifest2,
      state: state2,
      status: 500,
      error: e3,
      resolve_opts
    });
  }
}
__name(render_page, "render_page");
var cookie = {};
var hasRequiredCookie;
function requireCookie() {
  if (hasRequiredCookie)
    return cookie;
  hasRequiredCookie = 1;
  cookie.parse = parse2;
  cookie.serialize = serialize;
  var __toString = Object.prototype.toString;
  var fieldContentRegExp = /^[\u0009\u0020-\u007e\u0080-\u00ff]+$/;
  function parse2(str, options2) {
    if (typeof str !== "string") {
      throw new TypeError("argument str must be a string");
    }
    var obj = {};
    var opt = options2 || {};
    var dec = opt.decode || decode;
    var index13 = 0;
    while (index13 < str.length) {
      var eqIdx = str.indexOf("=", index13);
      if (eqIdx === -1) {
        break;
      }
      var endIdx = str.indexOf(";", index13);
      if (endIdx === -1) {
        endIdx = str.length;
      } else if (endIdx < eqIdx) {
        index13 = str.lastIndexOf(";", eqIdx - 1) + 1;
        continue;
      }
      var key2 = str.slice(index13, eqIdx).trim();
      if (void 0 === obj[key2]) {
        var val = str.slice(eqIdx + 1, endIdx).trim();
        if (val.charCodeAt(0) === 34) {
          val = val.slice(1, -1);
        }
        obj[key2] = tryDecode(val, dec);
      }
      index13 = endIdx + 1;
    }
    return obj;
  }
  __name(parse2, "parse2");
  function serialize(name, val, options2) {
    var opt = options2 || {};
    var enc = opt.encode || encode2;
    if (typeof enc !== "function") {
      throw new TypeError("option encode is invalid");
    }
    if (!fieldContentRegExp.test(name)) {
      throw new TypeError("argument name is invalid");
    }
    var value = enc(val);
    if (value && !fieldContentRegExp.test(value)) {
      throw new TypeError("argument val is invalid");
    }
    var str = name + "=" + value;
    if (null != opt.maxAge) {
      var maxAge = opt.maxAge - 0;
      if (isNaN(maxAge) || !isFinite(maxAge)) {
        throw new TypeError("option maxAge is invalid");
      }
      str += "; Max-Age=" + Math.floor(maxAge);
    }
    if (opt.domain) {
      if (!fieldContentRegExp.test(opt.domain)) {
        throw new TypeError("option domain is invalid");
      }
      str += "; Domain=" + opt.domain;
    }
    if (opt.path) {
      if (!fieldContentRegExp.test(opt.path)) {
        throw new TypeError("option path is invalid");
      }
      str += "; Path=" + opt.path;
    }
    if (opt.expires) {
      var expires = opt.expires;
      if (!isDate(expires) || isNaN(expires.valueOf())) {
        throw new TypeError("option expires is invalid");
      }
      str += "; Expires=" + expires.toUTCString();
    }
    if (opt.httpOnly) {
      str += "; HttpOnly";
    }
    if (opt.secure) {
      str += "; Secure";
    }
    if (opt.partitioned) {
      str += "; Partitioned";
    }
    if (opt.priority) {
      var priority = typeof opt.priority === "string" ? opt.priority.toLowerCase() : opt.priority;
      switch (priority) {
        case "low":
          str += "; Priority=Low";
          break;
        case "medium":
          str += "; Priority=Medium";
          break;
        case "high":
          str += "; Priority=High";
          break;
        default:
          throw new TypeError("option priority is invalid");
      }
    }
    if (opt.sameSite) {
      var sameSite = typeof opt.sameSite === "string" ? opt.sameSite.toLowerCase() : opt.sameSite;
      switch (sameSite) {
        case true:
          str += "; SameSite=Strict";
          break;
        case "lax":
          str += "; SameSite=Lax";
          break;
        case "strict":
          str += "; SameSite=Strict";
          break;
        case "none":
          str += "; SameSite=None";
          break;
        default:
          throw new TypeError("option sameSite is invalid");
      }
    }
    return str;
  }
  __name(serialize, "serialize");
  function decode(str) {
    return str.indexOf("%") !== -1 ? decodeURIComponent(str) : str;
  }
  __name(decode, "decode");
  function encode2(val) {
    return encodeURIComponent(val);
  }
  __name(encode2, "encode2");
  function isDate(val) {
    return __toString.call(val) === "[object Date]" || val instanceof Date;
  }
  __name(isDate, "isDate");
  function tryDecode(str, decode2) {
    try {
      return decode2(str);
    } catch (e3) {
      return str;
    }
  }
  __name(tryDecode, "tryDecode");
  return cookie;
}
__name(requireCookie, "requireCookie");
var cookieExports = requireCookie();
var INVALID_COOKIE_CHARACTER_REGEX = /[\x00-\x1F\x7F()<>@,;:"/[\]?={} \t]/;
function validate_options(options2) {
  if (options2?.path === void 0) {
    throw new Error("You must specify a `path` when setting, deleting or serializing cookies");
  }
}
__name(validate_options, "validate_options");
function get_cookies(request, url) {
  const header = request.headers.get("cookie") ?? "";
  const initial_cookies = cookieExports.parse(header, { decode: (value) => value });
  let normalized_url;
  const new_cookies = {};
  const defaults = {
    httpOnly: true,
    sameSite: "lax",
    secure: url.hostname === "localhost" && url.protocol === "http:" ? false : true
  };
  const cookies = {
    // The JSDoc param annotations appearing below for get, set and delete
    // are necessary to expose the `cookie` library types to
    // typescript users. `@type {import('@sveltejs/kit').Cookies}` above is not
    // sufficient to do so.
    /**
     * @param {string} name
     * @param {import('cookie').CookieParseOptions} [opts]
     */
    get(name, opts) {
      const c2 = new_cookies[name];
      if (c2 && domain_matches(url.hostname, c2.options.domain) && path_matches(url.pathname, c2.options.path)) {
        return c2.value;
      }
      const req_cookies = cookieExports.parse(header, { decode: opts?.decode });
      const cookie2 = req_cookies[name];
      return cookie2;
    },
    /**
     * @param {import('cookie').CookieParseOptions} [opts]
     */
    getAll(opts) {
      const cookies2 = cookieExports.parse(header, { decode: opts?.decode });
      for (const c2 of Object.values(new_cookies)) {
        if (domain_matches(url.hostname, c2.options.domain) && path_matches(url.pathname, c2.options.path)) {
          cookies2[c2.name] = c2.value;
        }
      }
      return Object.entries(cookies2).map(([name, value]) => ({ name, value }));
    },
    /**
     * @param {string} name
     * @param {string} value
     * @param {import('./page/types.js').Cookie['options']} options
     */
    set(name, value, options2) {
      const illegal_characters = name.match(INVALID_COOKIE_CHARACTER_REGEX);
      if (illegal_characters) {
        console.warn(
          `The cookie name "${name}" will be invalid in SvelteKit 3.0 as it contains ${illegal_characters.join(
            " and "
          )}. See RFC 2616 for more details https://datatracker.ietf.org/doc/html/rfc2616#section-2.2`
        );
      }
      validate_options(options2);
      set_internal(name, value, { ...defaults, ...options2 });
    },
    /**
     * @param {string} name
     *  @param {import('./page/types.js').Cookie['options']} options
     */
    delete(name, options2) {
      validate_options(options2);
      cookies.set(name, "", { ...options2, maxAge: 0 });
    },
    /**
     * @param {string} name
     * @param {string} value
     *  @param {import('./page/types.js').Cookie['options']} options
     */
    serialize(name, value, options2) {
      validate_options(options2);
      let path = options2.path;
      if (!options2.domain || options2.domain === url.hostname) {
        if (!normalized_url) {
          throw new Error("Cannot serialize cookies until after the route is determined");
        }
        path = resolve(normalized_url, path);
      }
      return cookieExports.serialize(name, value, { ...defaults, ...options2, path });
    }
  };
  function get_cookie_header(destination, header2) {
    const combined_cookies = {
      // cookies sent by the user agent have lowest precedence
      ...initial_cookies
    };
    for (const key2 in new_cookies) {
      const cookie2 = new_cookies[key2];
      if (!domain_matches(destination.hostname, cookie2.options.domain))
        continue;
      if (!path_matches(destination.pathname, cookie2.options.path))
        continue;
      const encoder22 = cookie2.options.encode || encodeURIComponent;
      combined_cookies[cookie2.name] = encoder22(cookie2.value);
    }
    if (header2) {
      const parsed = cookieExports.parse(header2, { decode: (value) => value });
      for (const name in parsed) {
        combined_cookies[name] = parsed[name];
      }
    }
    return Object.entries(combined_cookies).map(([name, value]) => `${name}=${value}`).join("; ");
  }
  __name(get_cookie_header, "get_cookie_header");
  const internal_queue = [];
  function set_internal(name, value, options2) {
    if (!normalized_url) {
      internal_queue.push(() => set_internal(name, value, options2));
      return;
    }
    let path = options2.path;
    if (!options2.domain || options2.domain === url.hostname) {
      path = resolve(normalized_url, path);
    }
    new_cookies[name] = { name, value, options: { ...options2, path } };
  }
  __name(set_internal, "set_internal");
  function set_trailing_slash(trailing_slash) {
    normalized_url = normalize_path(url.pathname, trailing_slash);
    internal_queue.forEach((fn) => fn());
  }
  __name(set_trailing_slash, "set_trailing_slash");
  return { cookies, new_cookies, get_cookie_header, set_internal, set_trailing_slash };
}
__name(get_cookies, "get_cookies");
function domain_matches(hostname, constraint) {
  if (!constraint)
    return true;
  const normalized = constraint[0] === "." ? constraint.slice(1) : constraint;
  if (hostname === normalized)
    return true;
  return hostname.endsWith("." + normalized);
}
__name(domain_matches, "domain_matches");
function path_matches(path, constraint) {
  if (!constraint)
    return true;
  const normalized = constraint.endsWith("/") ? constraint.slice(0, -1) : constraint;
  if (path === normalized)
    return true;
  return path.startsWith(normalized + "/");
}
__name(path_matches, "path_matches");
function add_cookies_to_headers(headers2, cookies) {
  for (const new_cookie of cookies) {
    const { name, value, options: options2 } = new_cookie;
    headers2.append("set-cookie", cookieExports.serialize(name, value, options2));
    if (options2.path.endsWith(".html")) {
      const path = add_data_suffix2(options2.path);
      headers2.append("set-cookie", cookieExports.serialize(name, value, { ...options2, path }));
    }
  }
}
__name(add_cookies_to_headers, "add_cookies_to_headers");
var setCookie = { exports: {} };
var hasRequiredSetCookie;
function requireSetCookie() {
  if (hasRequiredSetCookie)
    return setCookie.exports;
  hasRequiredSetCookie = 1;
  var defaultParseOptions = {
    decodeValues: true,
    map: false,
    silent: false
  };
  function isNonEmptyString(str) {
    return typeof str === "string" && !!str.trim();
  }
  __name(isNonEmptyString, "isNonEmptyString");
  function parseString(setCookieValue, options2) {
    var parts = setCookieValue.split(";").filter(isNonEmptyString);
    var nameValuePairStr = parts.shift();
    var parsed = parseNameValuePair(nameValuePairStr);
    var name = parsed.name;
    var value = parsed.value;
    options2 = options2 ? Object.assign({}, defaultParseOptions, options2) : defaultParseOptions;
    try {
      value = options2.decodeValues ? decodeURIComponent(value) : value;
    } catch (e3) {
      console.error(
        "set-cookie-parser encountered an error while decoding a cookie with value '" + value + "'. Set options.decodeValues to false to disable this feature.",
        e3
      );
    }
    var cookie2 = {
      name,
      value
    };
    parts.forEach(function(part) {
      var sides = part.split("=");
      var key2 = sides.shift().trimLeft().toLowerCase();
      var value2 = sides.join("=");
      if (key2 === "expires") {
        cookie2.expires = new Date(value2);
      } else if (key2 === "max-age") {
        cookie2.maxAge = parseInt(value2, 10);
      } else if (key2 === "secure") {
        cookie2.secure = true;
      } else if (key2 === "httponly") {
        cookie2.httpOnly = true;
      } else if (key2 === "samesite") {
        cookie2.sameSite = value2;
      } else if (key2 === "partitioned") {
        cookie2.partitioned = true;
      } else {
        cookie2[key2] = value2;
      }
    });
    return cookie2;
  }
  __name(parseString, "parseString");
  function parseNameValuePair(nameValuePairStr) {
    var name = "";
    var value = "";
    var nameValueArr = nameValuePairStr.split("=");
    if (nameValueArr.length > 1) {
      name = nameValueArr.shift();
      value = nameValueArr.join("=");
    } else {
      value = nameValuePairStr;
    }
    return { name, value };
  }
  __name(parseNameValuePair, "parseNameValuePair");
  function parse2(input, options2) {
    options2 = options2 ? Object.assign({}, defaultParseOptions, options2) : defaultParseOptions;
    if (!input) {
      if (!options2.map) {
        return [];
      } else {
        return {};
      }
    }
    if (input.headers) {
      if (typeof input.headers.getSetCookie === "function") {
        input = input.headers.getSetCookie();
      } else if (input.headers["set-cookie"]) {
        input = input.headers["set-cookie"];
      } else {
        var sch = input.headers[Object.keys(input.headers).find(function(key2) {
          return key2.toLowerCase() === "set-cookie";
        })];
        if (!sch && input.headers.cookie && !options2.silent) {
          console.warn(
            "Warning: set-cookie-parser appears to have been called on a request object. It is designed to parse Set-Cookie headers from responses, not Cookie headers from requests. Set the option {silent: true} to suppress this warning."
          );
        }
        input = sch;
      }
    }
    if (!Array.isArray(input)) {
      input = [input];
    }
    if (!options2.map) {
      return input.filter(isNonEmptyString).map(function(str) {
        return parseString(str, options2);
      });
    } else {
      var cookies = {};
      return input.filter(isNonEmptyString).reduce(function(cookies2, str) {
        var cookie2 = parseString(str, options2);
        cookies2[cookie2.name] = cookie2;
        return cookies2;
      }, cookies);
    }
  }
  __name(parse2, "parse2");
  function splitCookiesString(cookiesString) {
    if (Array.isArray(cookiesString)) {
      return cookiesString;
    }
    if (typeof cookiesString !== "string") {
      return [];
    }
    var cookiesStrings = [];
    var pos = 0;
    var start;
    var ch;
    var lastComma;
    var nextStart;
    var cookiesSeparatorFound;
    function skipWhitespace() {
      while (pos < cookiesString.length && /\s/.test(cookiesString.charAt(pos))) {
        pos += 1;
      }
      return pos < cookiesString.length;
    }
    __name(skipWhitespace, "skipWhitespace");
    function notSpecialChar() {
      ch = cookiesString.charAt(pos);
      return ch !== "=" && ch !== ";" && ch !== ",";
    }
    __name(notSpecialChar, "notSpecialChar");
    while (pos < cookiesString.length) {
      start = pos;
      cookiesSeparatorFound = false;
      while (skipWhitespace()) {
        ch = cookiesString.charAt(pos);
        if (ch === ",") {
          lastComma = pos;
          pos += 1;
          skipWhitespace();
          nextStart = pos;
          while (pos < cookiesString.length && notSpecialChar()) {
            pos += 1;
          }
          if (pos < cookiesString.length && cookiesString.charAt(pos) === "=") {
            cookiesSeparatorFound = true;
            pos = nextStart;
            cookiesStrings.push(cookiesString.substring(start, lastComma));
            start = pos;
          } else {
            pos = lastComma + 1;
          }
        } else {
          pos += 1;
        }
      }
      if (!cookiesSeparatorFound || pos >= cookiesString.length) {
        cookiesStrings.push(cookiesString.substring(start, cookiesString.length));
      }
    }
    return cookiesStrings;
  }
  __name(splitCookiesString, "splitCookiesString");
  setCookie.exports = parse2;
  setCookie.exports.parse = parse2;
  setCookie.exports.parseString = parseString;
  setCookie.exports.splitCookiesString = splitCookiesString;
  return setCookie.exports;
}
__name(requireSetCookie, "requireSetCookie");
var setCookieExports = /* @__PURE__ */ requireSetCookie();
function create_fetch({ event, options: options2, manifest: manifest2, state: state2, get_cookie_header, set_internal }) {
  const server_fetch = /* @__PURE__ */ __name(async (info3, init2) => {
    const original_request = normalize_fetch_input(info3, init2, event.url);
    let mode = (info3 instanceof Request ? info3.mode : init2?.mode) ?? "cors";
    let credentials = (info3 instanceof Request ? info3.credentials : init2?.credentials) ?? "same-origin";
    return options2.hooks.handleFetch({
      event,
      request: original_request,
      fetch: async (info22, init3) => {
        const request = normalize_fetch_input(info22, init3, event.url);
        const url = new URL(request.url);
        if (!request.headers.has("origin")) {
          request.headers.set("origin", event.url.origin);
        }
        if (info22 !== original_request) {
          mode = (info22 instanceof Request ? info22.mode : init3?.mode) ?? "cors";
          credentials = (info22 instanceof Request ? info22.credentials : init3?.credentials) ?? "same-origin";
        }
        if ((request.method === "GET" || request.method === "HEAD") && (mode === "no-cors" && url.origin !== event.url.origin || url.origin === event.url.origin)) {
          request.headers.delete("origin");
        }
        if (url.origin !== event.url.origin) {
          if (`.${url.hostname}`.endsWith(`.${event.url.hostname}`) && credentials !== "omit") {
            const cookie2 = get_cookie_header(url, request.headers.get("cookie"));
            if (cookie2)
              request.headers.set("cookie", cookie2);
          }
          return fetch(request);
        }
        const prefix = assets || base;
        const decoded = decodeURIComponent(url.pathname);
        const filename = (decoded.startsWith(prefix) ? decoded.slice(prefix.length) : decoded).slice(1);
        const filename_html = `${filename}/index.html`;
        const is_asset = manifest2.assets.has(filename) || filename in manifest2._.server_assets;
        const is_asset_html = manifest2.assets.has(filename_html) || filename_html in manifest2._.server_assets;
        if (is_asset || is_asset_html) {
          const file = is_asset ? filename : filename_html;
          if (state2.read) {
            const type = is_asset ? manifest2.mimeTypes[filename.slice(filename.lastIndexOf("."))] : "text/html";
            return new Response(state2.read(file), {
              headers: type ? { "content-type": type } : {}
            });
          } else if (read_implementation && file in manifest2._.server_assets) {
            const length = manifest2._.server_assets[file];
            const type = manifest2.mimeTypes[file.slice(file.lastIndexOf("."))];
            return new Response(read_implementation(file), {
              headers: {
                "Content-Length": "" + length,
                "Content-Type": type
              }
            });
          }
          return await fetch(request);
        }
        if (has_prerendered_path(manifest2, base + decoded)) {
          return await fetch(request);
        }
        if (credentials !== "omit") {
          const cookie2 = get_cookie_header(url, request.headers.get("cookie"));
          if (cookie2) {
            request.headers.set("cookie", cookie2);
          }
          const authorization = event.request.headers.get("authorization");
          if (authorization && !request.headers.has("authorization")) {
            request.headers.set("authorization", authorization);
          }
        }
        if (!request.headers.has("accept")) {
          request.headers.set("accept", "*/*");
        }
        if (!request.headers.has("accept-language")) {
          request.headers.set(
            "accept-language",
            /** @type {string} */
            event.request.headers.get("accept-language")
          );
        }
        const response = await internal_fetch(request, options2, manifest2, state2);
        const set_cookie = response.headers.get("set-cookie");
        if (set_cookie) {
          for (const str of setCookieExports.splitCookiesString(set_cookie)) {
            const { name, value, ...options3 } = setCookieExports.parseString(str, {
              decodeValues: false
            });
            const path = options3.path ?? (url.pathname.split("/").slice(0, -1).join("/") || "/");
            set_internal(name, value, {
              path,
              encode: (value2) => value2,
              .../** @type {import('cookie').CookieSerializeOptions} */
              options3
            });
          }
        }
        return response;
      }
    });
  }, "server_fetch");
  return (input, init2) => {
    const response = server_fetch(input, init2);
    response.catch(() => {
    });
    return response;
  };
}
__name(create_fetch, "create_fetch");
function normalize_fetch_input(info3, init2, url) {
  if (info3 instanceof Request) {
    return info3;
  }
  return new Request(typeof info3 === "string" ? new URL(info3, url) : info3, init2);
}
__name(normalize_fetch_input, "normalize_fetch_input");
async function internal_fetch(request, options2, manifest2, state2) {
  if (request.signal) {
    if (request.signal.aborted) {
      throw new DOMException("The operation was aborted.", "AbortError");
    }
    let remove_abort_listener = /* @__PURE__ */ __name(() => {
    }, "remove_abort_listener");
    const abort_promise = new Promise((_, reject) => {
      const on_abort = /* @__PURE__ */ __name(() => {
        reject(new DOMException("The operation was aborted.", "AbortError"));
      }, "on_abort");
      request.signal.addEventListener("abort", on_abort, { once: true });
      remove_abort_listener = /* @__PURE__ */ __name(() => request.signal.removeEventListener("abort", on_abort), "remove_abort_listener");
    });
    const result = await Promise.race([
      respond(request, options2, manifest2, {
        ...state2,
        depth: state2.depth + 1
      }),
      abort_promise
    ]);
    remove_abort_listener();
    return result;
  } else {
    return await respond(request, options2, manifest2, {
      ...state2,
      depth: state2.depth + 1
    });
  }
}
__name(internal_fetch, "internal_fetch");
var body;
var etag;
var headers;
function get_public_env(request) {
  body ??= `export const env=${JSON.stringify(public_env)}`;
  etag ??= `W/${Date.now()}`;
  headers ??= new Headers({
    "content-type": "application/javascript; charset=utf-8",
    etag
  });
  if (request.headers.get("if-none-match") === etag) {
    return new Response(void 0, { status: 304, headers });
  }
  return new Response(body, { headers });
}
__name(get_public_env, "get_public_env");
var default_transform = /* @__PURE__ */ __name(({ html }) => html, "default_transform");
var default_filter = /* @__PURE__ */ __name(() => false, "default_filter");
var default_preload = /* @__PURE__ */ __name(({ type }) => type === "js" || type === "css", "default_preload");
var page_methods = /* @__PURE__ */ new Set(["GET", "HEAD", "POST"]);
var allowed_page_methods = /* @__PURE__ */ new Set(["GET", "HEAD", "OPTIONS"]);
async function respond(request, options2, manifest2, state2) {
  const url = new URL(request.url);
  const is_route_resolution_request = has_resolution_suffix2(url.pathname);
  const is_data_request = has_data_suffix2(url.pathname);
  const remote_id = get_remote_id(url);
  if (options2.csrf_check_origin && request.headers.get("origin") !== url.origin) {
    const opts = { status: 403 };
    if (remote_id && request.method !== "GET") {
      return json(
        {
          message: "Cross-site remote requests are forbidden"
        },
        opts
      );
    }
    const forbidden = is_form_content_type(request) && (request.method === "POST" || request.method === "PUT" || request.method === "PATCH" || request.method === "DELETE");
    if (forbidden) {
      const message = `Cross-site ${request.method} form submissions are forbidden`;
      if (request.headers.get("accept") === "application/json") {
        return json({ message }, opts);
      }
      return text(message, opts);
    }
  }
  if (options2.hash_routing && url.pathname !== base + "/" && url.pathname !== "/[fallback]") {
    return text("Not found", { status: 404 });
  }
  let invalidated_data_nodes;
  if (is_route_resolution_request) {
    url.pathname = strip_resolution_suffix2(url.pathname);
  } else if (is_data_request) {
    url.pathname = strip_data_suffix2(url.pathname) + (url.searchParams.get(TRAILING_SLASH_PARAM) === "1" ? "/" : "") || "/";
    url.searchParams.delete(TRAILING_SLASH_PARAM);
    invalidated_data_nodes = url.searchParams.get(INVALIDATED_PARAM)?.split("").map((node) => node === "1");
    url.searchParams.delete(INVALIDATED_PARAM);
  } else if (remote_id) {
    url.pathname = base;
    url.search = "";
  }
  const headers2 = {};
  const { cookies, new_cookies, get_cookie_header, set_internal, set_trailing_slash } = get_cookies(
    request,
    url
  );
  const event = {
    [EVENT_STATE]: create_event_state(state2, options2),
    cookies,
    // @ts-expect-error `fetch` needs to be created after the `event` itself
    fetch: null,
    getClientAddress: state2.getClientAddress || (() => {
      throw new Error(
        `${"@sveltejs/adapter-cloudflare"} does not specify getClientAddress. Please raise an issue`
      );
    }),
    locals: {},
    params: {},
    platform: state2.platform,
    request,
    route: { id: null },
    setHeaders: (new_headers) => {
      for (const key2 in new_headers) {
        const lower = key2.toLowerCase();
        const value = new_headers[key2];
        if (lower === "set-cookie") {
          throw new Error(
            "Use `event.cookies.set(name, value, options)` instead of `event.setHeaders` to set cookies"
          );
        } else if (lower in headers2) {
          throw new Error(`"${key2}" header is already set`);
        } else {
          headers2[lower] = value;
          if (state2.prerendering && lower === "cache-control") {
            state2.prerendering.cache = /** @type {string} */
            value;
          }
        }
      }
    },
    url,
    isDataRequest: is_data_request,
    isSubRequest: state2.depth > 0,
    isRemoteRequest: !!remote_id
  };
  event.fetch = create_fetch({
    event,
    options: options2,
    manifest: manifest2,
    state: state2,
    get_cookie_header,
    set_internal
  });
  if (state2.emulator?.platform) {
    event.platform = await state2.emulator.platform({
      config: {},
      prerender: !!state2.prerendering?.fallback
    });
  }
  let resolved_path = url.pathname;
  if (!remote_id) {
    const prerendering_reroute_state = state2.prerendering?.inside_reroute;
    try {
      if (state2.prerendering)
        state2.prerendering.inside_reroute = true;
      resolved_path = await options2.hooks.reroute({ url: new URL(url), fetch: event.fetch }) ?? url.pathname;
    } catch {
      return text("Internal Server Error", {
        status: 500
      });
    } finally {
      if (state2.prerendering)
        state2.prerendering.inside_reroute = prerendering_reroute_state;
    }
  }
  try {
    resolved_path = decode_pathname(resolved_path);
  } catch {
    return text("Malformed URI", { status: 400 });
  }
  if (resolved_path !== url.pathname && !state2.prerendering?.fallback && has_prerendered_path(manifest2, resolved_path)) {
    const url2 = new URL(request.url);
    url2.pathname = is_data_request ? add_data_suffix2(resolved_path) : is_route_resolution_request ? add_resolution_suffix2(resolved_path) : resolved_path;
    const response = await fetch(url2, request);
    const headers22 = new Headers(response.headers);
    if (headers22.has("content-encoding")) {
      headers22.delete("content-encoding");
      headers22.delete("content-length");
    }
    return new Response(response.body, {
      headers: headers22,
      status: response.status,
      statusText: response.statusText
    });
  }
  let route = null;
  if (base && !state2.prerendering?.fallback) {
    if (!resolved_path.startsWith(base)) {
      return text("Not found", { status: 404 });
    }
    resolved_path = resolved_path.slice(base.length) || "/";
  }
  if (is_route_resolution_request) {
    return resolve_route(resolved_path, new URL(request.url), manifest2);
  }
  if (resolved_path === `/${app_dir}/env.js`) {
    return get_public_env(request);
  }
  if (!remote_id && resolved_path.startsWith(`/${app_dir}`)) {
    const headers22 = new Headers();
    headers22.set("cache-control", "public, max-age=0, must-revalidate");
    return text("Not found", { status: 404, headers: headers22 });
  }
  if (!state2.prerendering?.fallback && !remote_id) {
    const matchers = await manifest2._.matchers();
    for (const candidate of manifest2._.routes) {
      const match = candidate.pattern.exec(resolved_path);
      if (!match)
        continue;
      const matched = exec(match, candidate.params, matchers);
      if (matched) {
        route = candidate;
        event.route = { id: route.id };
        event.params = decode_params(matched);
        break;
      }
    }
  }
  let resolve_opts = {
    transformPageChunk: default_transform,
    filterSerializedResponseHeaders: default_filter,
    preload: default_preload
  };
  let trailing_slash = "never";
  try {
    const page_nodes = route?.page ? new PageNodes(await load_page_nodes(route.page, manifest2)) : void 0;
    if (route) {
      if (url.pathname === base || url.pathname === base + "/") {
        trailing_slash = "always";
      } else if (page_nodes) {
        if (DEV)
          ;
        trailing_slash = page_nodes.trailing_slash();
      } else if (route.endpoint) {
        const node = await route.endpoint();
        trailing_slash = node.trailingSlash ?? "never";
        if (DEV)
          ;
      }
      if (!is_data_request) {
        const normalized = normalize_path(url.pathname, trailing_slash);
        if (normalized !== url.pathname && !state2.prerendering?.fallback) {
          return new Response(void 0, {
            status: 308,
            headers: {
              "x-sveltekit-normalize": "1",
              location: (
                // ensure paths starting with '//' are not treated as protocol-relative
                (normalized.startsWith("//") ? url.origin + normalized : normalized) + (url.search === "?" ? "" : url.search)
              )
            }
          });
        }
      }
      if (state2.before_handle || state2.emulator?.platform) {
        let config2 = {};
        let prerender2 = false;
        if (route.endpoint) {
          const node = await route.endpoint();
          config2 = node.config ?? config2;
          prerender2 = node.prerender ?? prerender2;
        } else if (page_nodes) {
          config2 = page_nodes.get_config() ?? config2;
          prerender2 = page_nodes.prerender();
        }
        if (state2.before_handle) {
          state2.before_handle(event, config2, prerender2);
        }
        if (state2.emulator?.platform) {
          event.platform = await state2.emulator.platform({ config: config2, prerender: prerender2 });
        }
      }
    }
    set_trailing_slash(trailing_slash);
    if (state2.prerendering && !state2.prerendering.fallback && !state2.prerendering.inside_reroute) {
      disable_search(url);
    }
    const response = await with_event(
      event,
      () => options2.hooks.handle({
        event,
        resolve: (event2, opts) => (
          // counter-intuitively, we need to clear the event, so that it's not
          // e.g. accessible when loading modules needed to handle the request
          with_event(
            null,
            () => resolve2(event2, page_nodes, opts).then((response2) => {
              for (const key2 in headers2) {
                const value = headers2[key2];
                response2.headers.set(
                  key2,
                  /** @type {string} */
                  value
                );
              }
              add_cookies_to_headers(response2.headers, Object.values(new_cookies));
              if (state2.prerendering && event2.route.id !== null) {
                response2.headers.set("x-sveltekit-routeid", encodeURI(event2.route.id));
              }
              return response2;
            })
          )
        )
      })
    );
    if (response.status === 200 && response.headers.has("etag")) {
      let if_none_match_value = request.headers.get("if-none-match");
      if (if_none_match_value?.startsWith('W/"')) {
        if_none_match_value = if_none_match_value.substring(2);
      }
      const etag2 = (
        /** @type {string} */
        response.headers.get("etag")
      );
      if (if_none_match_value === etag2) {
        const headers22 = new Headers({ etag: etag2 });
        for (const key2 of [
          "cache-control",
          "content-location",
          "date",
          "expires",
          "vary",
          "set-cookie"
        ]) {
          const value = response.headers.get(key2);
          if (value)
            headers22.set(key2, value);
        }
        return new Response(void 0, {
          status: 304,
          headers: headers22
        });
      }
    }
    if (is_data_request && response.status >= 300 && response.status <= 308) {
      const location = response.headers.get("location");
      if (location) {
        return redirect_json_response(new Redirect(
          /** @type {any} */
          response.status,
          location
        ));
      }
    }
    return response;
  } catch (e3) {
    if (e3 instanceof Redirect) {
      const response = is_data_request ? redirect_json_response(e3) : route?.page && is_action_json_request(event) ? action_json_redirect(e3) : redirect_response(e3.status, e3.location);
      add_cookies_to_headers(response.headers, Object.values(new_cookies));
      return response;
    }
    return await handle_fatal_error(event, options2, e3);
  }
  async function resolve2(event2, page_nodes, opts) {
    try {
      if (opts) {
        resolve_opts = {
          transformPageChunk: opts.transformPageChunk || default_transform,
          filterSerializedResponseHeaders: opts.filterSerializedResponseHeaders || default_filter,
          preload: opts.preload || default_preload
        };
      }
      if (options2.hash_routing || state2.prerendering?.fallback) {
        return await render_response({
          event: event2,
          options: options2,
          manifest: manifest2,
          state: state2,
          page_config: { ssr: false, csr: true },
          status: 200,
          error: null,
          branch: [],
          fetched: [],
          resolve_opts
        });
      }
      if (remote_id) {
        return await handle_remote_call(event2, options2, manifest2, remote_id);
      }
      if (route) {
        const method = (
          /** @type {import('types').HttpMethod} */
          event2.request.method
        );
        let response;
        if (is_data_request) {
          response = await render_data(
            event2,
            route,
            options2,
            manifest2,
            state2,
            invalidated_data_nodes,
            trailing_slash
          );
        } else if (route.endpoint && (!route.page || is_endpoint_request(event2))) {
          response = await render_endpoint(event2, await route.endpoint(), state2);
        } else if (route.page) {
          if (!page_nodes) {
            throw new Error("page_nodes not found. This should never happen");
          } else if (page_methods.has(method)) {
            response = await render_page(
              event2,
              route.page,
              options2,
              manifest2,
              state2,
              page_nodes,
              resolve_opts
            );
          } else {
            const allowed_methods2 = new Set(allowed_page_methods);
            const node = await manifest2._.nodes[route.page.leaf]();
            if (node?.server?.actions) {
              allowed_methods2.add("POST");
            }
            if (method === "OPTIONS") {
              response = new Response(null, {
                status: 204,
                headers: {
                  allow: Array.from(allowed_methods2.values()).join(", ")
                }
              });
            } else {
              const mod = [...allowed_methods2].reduce(
                (acc, curr) => {
                  acc[curr] = true;
                  return acc;
                },
                /** @type {Record<string, any>} */
                {}
              );
              response = method_not_allowed(mod, method);
            }
          }
        } else {
          throw new Error("Route is neither page nor endpoint. This should never happen");
        }
        if (request.method === "GET" && route.page && route.endpoint) {
          const vary = response.headers.get("vary")?.split(",")?.map((v) => v.trim().toLowerCase());
          if (!(vary?.includes("accept") || vary?.includes("*"))) {
            response = new Response(response.body, {
              status: response.status,
              statusText: response.statusText,
              headers: new Headers(response.headers)
            });
            response.headers.append("Vary", "Accept");
          }
        }
        return response;
      }
      if (state2.error && event2.isSubRequest) {
        const headers22 = new Headers(request.headers);
        headers22.set("x-sveltekit-error", "true");
        return await fetch(request, { headers: headers22 });
      }
      if (state2.error) {
        return text("Internal Server Error", {
          status: 500
        });
      }
      if (state2.depth === 0) {
        if (DEV && event2.url.pathname === "/.well-known/appspecific/com.chrome.devtools.json")
          ;
        return await respond_with_error({
          event: event2,
          options: options2,
          manifest: manifest2,
          state: state2,
          status: 404,
          error: new SvelteKitError(404, "Not Found", `Not found: ${event2.url.pathname}`),
          resolve_opts
        });
      }
      if (state2.prerendering) {
        return text("not found", { status: 404 });
      }
      return await fetch(request);
    } catch (e3) {
      return await handle_fatal_error(event2, options2, e3);
    } finally {
      event2.cookies.set = () => {
        throw new Error("Cannot use `cookies.set(...)` after the response has been generated");
      };
      event2.setHeaders = () => {
        throw new Error("Cannot use `setHeaders(...)` after the response has been generated");
      };
    }
  }
  __name(resolve2, "resolve2");
}
__name(respond, "respond");
function load_page_nodes(page2, manifest2) {
  return Promise.all([
    // we use == here rather than === because [undefined] serializes as "[null]"
    ...page2.layouts.map((n2) => n2 == void 0 ? n2 : manifest2._.nodes[n2]()),
    manifest2._.nodes[page2.leaf]()
  ]);
}
__name(load_page_nodes, "load_page_nodes");
function filter_private_env(env2, { public_prefix, private_prefix }) {
  return Object.fromEntries(
    Object.entries(env2).filter(
      ([k]) => k.startsWith(private_prefix) && (public_prefix === "" || !k.startsWith(public_prefix))
    )
  );
}
__name(filter_private_env, "filter_private_env");
function filter_public_env(env2, { public_prefix, private_prefix }) {
  return Object.fromEntries(
    Object.entries(env2).filter(
      ([k]) => k.startsWith(public_prefix) && (private_prefix === "" || !k.startsWith(private_prefix))
    )
  );
}
__name(filter_public_env, "filter_public_env");
function set_app(value) {
}
__name(set_app, "set_app");
var prerender_env_handler = {
  get({ type }, prop) {
    throw new Error(
      `Cannot read values from $env/dynamic/${type} while prerendering (attempted to read env.${prop.toString()}). Use $env/static/${type} instead`
    );
  }
};
var init_promise;
var Server = /* @__PURE__ */ __name(class {
  /** @type {import('types').SSROptions} */
  #options;
  /** @type {import('@sveltejs/kit').SSRManifest} */
  #manifest;
  /** @param {import('@sveltejs/kit').SSRManifest} manifest */
  constructor(manifest2) {
    this.#options = options;
    this.#manifest = manifest2;
  }
  /**
   * @param {import('@sveltejs/kit').ServerInitOptions} opts
   */
  async init({ env: env2, read }) {
    const prefixes = {
      public_prefix: this.#options.env_public_prefix,
      private_prefix: this.#options.env_private_prefix
    };
    const private_env = filter_private_env(env2, prefixes);
    const public_env2 = filter_public_env(env2, prefixes);
    set_private_env(
      prerendering ? new Proxy({ type: "private" }, prerender_env_handler) : private_env
    );
    set_public_env(
      prerendering ? new Proxy({ type: "public" }, prerender_env_handler) : public_env2
    );
    set_safe_public_env(public_env2);
    if (read) {
      const wrapped_read = /* @__PURE__ */ __name((file) => {
        const result = read(file);
        if (result instanceof ReadableStream) {
          return result;
        } else {
          return new ReadableStream({
            async start(controller2) {
              try {
                const stream = await Promise.resolve(result);
                if (!stream) {
                  controller2.close();
                  return;
                }
                const reader = stream.getReader();
                while (true) {
                  const { done, value } = await reader.read();
                  if (done)
                    break;
                  controller2.enqueue(value);
                }
                controller2.close();
              } catch (error22) {
                controller2.error(error22);
              }
            }
          });
        }
      }, "wrapped_read");
      set_read_implementation(wrapped_read);
    }
    await (init_promise ??= (async () => {
      try {
        const module = await get_hooks();
        this.#options.hooks = {
          handle: module.handle || (({ event, resolve: resolve2 }) => resolve2(event)),
          handleError: module.handleError || (({ status, error: error22 }) => console.error(status === 404 && /** @type {Error} */
          error22?.message || error22)),
          handleFetch: module.handleFetch || (({ request, fetch: fetch2 }) => fetch2(request)),
          handleValidationError: module.handleValidationError || (({ issues }) => {
            console.error("Remote function schema validation failed:", issues);
            return { message: "Bad Request" };
          }),
          reroute: module.reroute || (() => {
          }),
          transport: module.transport || {}
        };
        set_app({
          decoders: module.transport ? Object.fromEntries(Object.entries(module.transport).map(([k, v]) => [k, v.decode])) : {}
        });
        if (module.init) {
          await module.init();
        }
      } catch (e3) {
        {
          throw e3;
        }
      }
    })());
  }
  /**
   * @param {Request} request
   * @param {import('types').RequestOptions} options
   */
  async respond(request, options2) {
    return respond(request, this.#options, this.#manifest, {
      ...options2,
      error: false,
      depth: 0
    });
  }
}, "Server");
var manifest = (() => {
  function __memo(fn) {
    let value;
    return () => value ??= value = fn();
  }
  __name(__memo, "__memo");
  return {
    appDir: "_app",
    appPath: "_app",
    assets: /* @__PURE__ */ new Set(["favicon.png", "fonts/Mekorot-Rashi.ttf", "fonts/Mekorot-Vilna-Bold-Italic.ttf", "fonts/Mekorot-Vilna-Bold.ttf", "fonts/Mekorot-Vilna-Italic.ttf", "fonts/Mekorot-Vilna.ttf"]),
    mimeTypes: { ".png": "image/png", ".ttf": "font/ttf" },
    _: {
      client: { start: "_app/immutable/entry/start.B_UU7E3X.js", app: "_app/immutable/entry/app.B-sMKQnV.js", imports: ["_app/immutable/entry/start.B_UU7E3X.js", "_app/immutable/chunks/D4eelw9t.js", "_app/immutable/chunks/CL50UZ7u.js", "_app/immutable/chunks/BcvnQvbC.js", "_app/immutable/chunks/BRqbiqbO.js", "_app/immutable/chunks/BTISvJJE.js", "_app/immutable/entry/app.B-sMKQnV.js", "_app/immutable/chunks/Dp1pzeXC.js", "_app/immutable/chunks/BcvnQvbC.js", "_app/immutable/chunks/CL50UZ7u.js", "_app/immutable/chunks/Bzak7iHL.js", "_app/immutable/chunks/Cx6KAmFa.js", "_app/immutable/chunks/Bog_exwH.js", "_app/immutable/chunks/Cl02Xd5o.js", "_app/immutable/chunks/DxdHGLhZ.js", "_app/immutable/chunks/BTISvJJE.js"], stylesheets: [], fonts: [], uses_env_dynamic_public: false },
      nodes: [
        __memo(() => Promise.resolve().then(() => (init__(), __exports))),
        __memo(() => Promise.resolve().then(() => (init__2(), __exports2))),
        __memo(() => Promise.resolve().then(() => (init__3(), __exports3))),
        __memo(() => Promise.resolve().then(() => (init__4(), __exports4))),
        __memo(() => Promise.resolve().then(() => (init__5(), __exports5))),
        __memo(() => Promise.resolve().then(() => (init__6(), __exports6))),
        __memo(() => Promise.resolve().then(() => (init__7(), __exports7))),
        __memo(() => Promise.resolve().then(() => (init__8(), __exports8))),
        __memo(() => Promise.resolve().then(() => (init__9(), __exports9))),
        __memo(() => Promise.resolve().then(() => (init__10(), __exports10))),
        __memo(() => Promise.resolve().then(() => (init__11(), __exports11))),
        __memo(() => Promise.resolve().then(() => (init__12(), __exports12)))
      ],
      remotes: {},
      routes: [
        {
          id: "/",
          pattern: /^\/$/,
          params: [],
          page: { layouts: [0], errors: [1], leaf: 2 },
          endpoint: null
        },
        {
          id: "/api/hebrewbooks",
          pattern: /^\/api\/hebrewbooks\/?$/,
          params: [],
          page: null,
          endpoint: __memo(() => Promise.resolve().then(() => (init_server_ts(), server_ts_exports)))
        },
        {
          id: "/api/stories",
          pattern: /^\/api\/stories\/?$/,
          params: [],
          page: null,
          endpoint: __memo(() => Promise.resolve().then(() => (init_server_ts2(), server_ts_exports2)))
        },
        {
          id: "/api/summary",
          pattern: /^\/api\/summary\/?$/,
          params: [],
          page: null,
          endpoint: __memo(() => Promise.resolve().then(() => (init_server_ts3(), server_ts_exports3)))
        },
        {
          id: "/api/summary/clear-cache",
          pattern: /^\/api\/summary\/clear-cache\/?$/,
          params: [],
          page: null,
          endpoint: __memo(() => Promise.resolve().then(() => (init_server_ts4(), server_ts_exports4)))
        },
        {
          id: "/api/talmud-merged",
          pattern: /^\/api\/talmud-merged\/?$/,
          params: [],
          page: null,
          endpoint: __memo(() => Promise.resolve().then(() => (init_server_ts5(), server_ts_exports5)))
        },
        {
          id: "/story",
          pattern: /^\/story\/?$/,
          params: [],
          page: { layouts: [0], errors: [1], leaf: 3 },
          endpoint: null
        },
        {
          id: "/test",
          pattern: /^\/test\/?$/,
          params: [],
          page: { layouts: [0], errors: [1], leaf: 4 },
          endpoint: null
        },
        {
          id: "/test/components",
          pattern: /^\/test\/components\/?$/,
          params: [],
          page: { layouts: [0], errors: [1], leaf: 5 },
          endpoint: null
        },
        {
          id: "/test/fit-integration",
          pattern: /^\/test\/fit-integration\/?$/,
          params: [],
          page: { layouts: [0], errors: [1], leaf: 6 },
          endpoint: null
        },
        {
          id: "/test/lines",
          pattern: /^\/test\/lines\/?$/,
          params: [],
          page: { layouts: [0], errors: [1], leaf: 7 },
          endpoint: null
        },
        {
          id: "/test/merged-data",
          pattern: /^\/test\/merged-data\/?$/,
          params: [],
          page: { layouts: [0], errors: [1], leaf: 8 },
          endpoint: null
        },
        {
          id: "/test/sefaria",
          pattern: /^\/test\/sefaria\/?$/,
          params: [],
          page: { layouts: [0], errors: [1], leaf: 9 },
          endpoint: null
        },
        {
          id: "/test/single-line-fit",
          pattern: /^\/test\/single-line-fit\/?$/,
          params: [],
          page: { layouts: [0], errors: [1], leaf: 10 },
          endpoint: null
        },
        {
          id: "/test/spacer-analysis",
          pattern: /^\/test\/spacer-analysis\/?$/,
          params: [],
          page: { layouts: [0], errors: [1], leaf: 11 },
          endpoint: null
        }
      ],
      prerendered_routes: /* @__PURE__ */ new Set([]),
      matchers: async () => {
        return {};
      },
      server_assets: {}
    }
  };
})();
var prerendered = /* @__PURE__ */ new Set([]);
var base_path = "";
async function e(e3, t2) {
  let n2 = "string" != typeof t2 && "HEAD" === t2.method;
  n2 && (t2 = new Request(t2, { method: "GET" }));
  let r3 = await e3.match(t2);
  return n2 && r3 && (r3 = new Response(null, r3)), r3;
}
__name(e, "e");
function t(e3, t2, n2, o2) {
  return ("string" == typeof t2 || "GET" === t2.method) && r2(n2) && (n2.headers.has("Set-Cookie") && (n2 = new Response(n2.body, n2)).headers.append("Cache-Control", "private=Set-Cookie"), o2.waitUntil(e3.put(t2, n2.clone()))), n2;
}
__name(t, "t");
var n = /* @__PURE__ */ new Set([200, 203, 204, 300, 301, 404, 405, 410, 414, 501]);
function r2(e3) {
  if (!n.has(e3.status))
    return false;
  if (~(e3.headers.get("Vary") || "").indexOf("*"))
    return false;
  let t2 = e3.headers.get("Cache-Control") || "";
  return !/(private|no-cache|no-store)/i.test(t2);
}
__name(r2, "r2");
function o(n2) {
  return async function(r3, o2) {
    let a = await e(n2, r3);
    if (a)
      return a;
    o2.defer((e3) => {
      t(n2, r3, e3, o2);
    });
  };
}
__name(o, "o");
var s2 = caches.default;
var c = t.bind(0, s2);
var r22 = e.bind(0, s2);
var e2 = o.bind(0, s2);
var server = new Server(manifest);
var app_path = `/${manifest.appPath}`;
var immutable = `${app_path}/immutable/`;
var version_file = `${app_path}/version.json`;
var worker = {
  async fetch(req, env2, context22) {
    await server.init({ env: env2 });
    let pragma = req.headers.get("cache-control") || "";
    let res = !pragma.includes("no-cache") && await r22(req);
    if (res)
      return res;
    let { pathname, search } = new URL(req.url);
    try {
      pathname = decodeURIComponent(pathname);
    } catch {
    }
    const stripped_pathname = pathname.replace(/\/$/, "");
    let is_static_asset = false;
    const filename = stripped_pathname.slice(base_path.length + 1);
    if (filename) {
      is_static_asset = manifest.assets.has(filename) || manifest.assets.has(filename + "/index.html") || filename in manifest._.server_assets || filename + "/index.html" in manifest._.server_assets;
    }
    let location = pathname.at(-1) === "/" ? stripped_pathname : pathname + "/";
    if (is_static_asset || prerendered.has(pathname) || pathname === version_file || pathname.startsWith(immutable)) {
      res = await env2.ASSETS.fetch(req);
    } else if (location && prerendered.has(location)) {
      if (search)
        location += search;
      res = new Response("", {
        status: 308,
        headers: {
          location
        }
      });
    } else {
      res = await server.respond(req, {
        // @ts-ignore
        platform: { env: env2, context: context22, caches, cf: req.cf },
        getClientAddress() {
          return req.headers.get("cf-connecting-ip");
        }
      });
    }
    pragma = res.headers.get("cache-control") || "";
    return pragma && res.status < 400 ? c(req, res, context22) : res;
  }
};
var worker_default = worker;
export {
  worker_default as default
};
/*!
 * cookie
 * Copyright(c) 2012-2014 Roman Shtylman
 * Copyright(c) 2015 Douglas Christopher Wilson
 * MIT Licensed
 */
//# sourceMappingURL=_worker.js.map
